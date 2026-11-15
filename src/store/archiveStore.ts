/* Данные открытого архива. Любое изменение идёт через apply(): рабочие копии → правка →
   пересчёт рядов дерева → новое состояние + запись в историю + отметка «есть несохранённые изменения». */
import { create } from 'zustand';
import { autoLayout as runAutoLayout, layoutRows, type RowsLayout } from '../domain/layout';
import { computeHidden, descGraph, descendantsOf, isAncestor } from '../domain/graph';
import { createMeta, createPerson, newId } from '../domain/normalize';
import { fullName } from '../domain/people';
import type { ArchiveData, HistoryEntry, MediaItem, Person, RelType, Story } from '../domain/types';
import { mediaRegistry } from './mediaRegistry';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

interface Draft extends ArchiveData {}

interface ApplyOptions {
  history?: Omit<HistoryEntry, 'ts'>[];
  /** не отмечать как несохранённое (например, промежуточные кадры перетаскивания) */
  silent?: boolean;
  /** полное автовыравнивание после правки */
  autoLayout?: boolean | { keepOrder: boolean };
}

interface ArchiveState {
  data: ArchiveData | null;
  layout: RowsLayout;
  status: SaveStatus;
  /** счётчик изменений — для автосохранения черновика */
  revision: number;

  open(data: ArchiveData, blobs?: Map<string, Blob>): void;
  close(): void;
  apply(fn: (d: Draft) => void, opts?: ApplyOptions): void;
  setStatus(s: SaveStatus): void;

  // люди
  addPerson(init: Partial<Person>): Person;
  updatePerson(id: string, patch: Partial<Person>): void;
  deletePerson(id: string): void;
  movePerson(id: string, x: number, final?: boolean): void;
  autoLayout(keepOrder?: boolean): void;
  toggleCollapse(id: string): void;

  // связи
  addRelation(type: RelType, from: string, to: string): { ok: true } | { ok: false; reason: 'exists' | 'cycle' };
  deleteRelation(id: string): void;

  // медиа
  addMedia(item: MediaItem, blob: Blob): void;
  deleteMedia(id: string): void;
  /** отметить людей на фото/видео (владелец файла в список не входит) */
  setMediaPeople(mediaId: string, people: string[]): void;

  // истории
  saveStory(story: Story): void;
  deleteStory(id: string): void;

  updateMeta(patch: Partial<ArchiveData['meta']>): void;
}

const emptyLayout = (): RowsLayout => layoutRows([], []);

function cloneDraft(d: ArchiveData): Draft {
  return {
    meta: { ...d.meta },
    persons: d.persons.map(p => ({ ...p })),
    relations: d.relations.slice(),
    media: d.media.slice(),
    stories: d.stories.slice(),
    history: d.history.slice(),
  };
}

const MAX_HISTORY = 5000;

export const useArchive = create<ArchiveState>((set, get) => ({
  data: null,
  layout: emptyLayout(),
  status: 'saved',
  revision: 0,

  open(data, blobs) {
    mediaRegistry.clear();
    blobs?.forEach((b, id) => mediaRegistry.set(id, b));
    const d = cloneDraft(data);
    const layout = layoutRows(d.persons, d.relations);
    set({ data: d, layout, status: 'saved', revision: 0 });
  },

  close() {
    mediaRegistry.clear();
    set({ data: null, layout: emptyLayout(), status: 'saved', revision: 0 });
  },

  apply(fn, opts = {}) {
    const cur = get().data;
    if (!cur) return;
    const d = cloneDraft(cur);
    fn(d);
    const now = Date.now();
    if (opts.history?.length) {
      d.history.push(...opts.history.map(h => ({ ...h, ts: now })));
      if (d.history.length > MAX_HISTORY) d.history.splice(0, d.history.length - MAX_HISTORY);
    }
    let layout: RowsLayout;
    if (opts.autoLayout) {
      const keepOrder = typeof opts.autoLayout === 'object' && opts.autoLayout.keepOrder;
      layout = runAutoLayout(d.persons, d.relations, { keepOrder });
    } else layout = layoutRows(d.persons, d.relations);
    if (!opts.silent) d.meta.updatedAt = now;
    set(s => ({
      data: d,
      layout,
      status: opts.silent ? s.status : 'dirty',
      revision: opts.silent ? s.revision : s.revision + 1,
    }));
  },

  setStatus(status) {
    set({ status });
  },

  addPerson(init) {
    const id = newId();
    const name = fullName({ lastName: init.lastName ?? '', firstName: init.firstName ?? '', middleName: init.middleName ?? '' });
    get().apply(
      d => {
        d.persons.push({ ...createPerson(d.meta.nextSeq++), ...init, id });
      },
      { history: [{ action: 'create', entity: 'person', id, summary: 'Добавлен: ' + name }] },
    );
    return get().data!.persons.find(p => p.id === id)!;
  },

  updatePerson(id, patch) {
    const p = get().data?.persons.find(x => x.id === id);
    if (!p) return;
    get().apply(
      d => {
        const t = d.persons.find(x => x.id === id);
        if (t) Object.assign(t, patch, { updatedAt: Date.now() });
      },
      { history: [{ action: 'update', entity: 'person', id, summary: 'Изменён: ' + fullName({ ...p, ...patch }) }] },
    );
  },

  deletePerson(id) {
    const p = get().data?.persons.find(x => x.id === id);
    if (!p) return;
    const owned = new Set([...(p.mainPhotoId ? [p.mainPhotoId] : []), ...p.media, ...p.documents]);
    get().apply(
      d => {
        // фото, на которых отмечены другие люди, не пропадают — переходят к первому отмеченному
        d.media = d.media.map(m => {
          const people = m.people.filter(x => x !== id);
          if (p.media.includes(m.id) && people.length) {
            const heir = d.persons.find(x => x.id === people[0]);
            if (heir) {
              heir.media = [...heir.media, m.id];
              owned.delete(m.id);
              return { ...m, people: people.slice(1) };
            }
          }
          return people.length === m.people.length ? m : { ...m, people };
        });
        d.persons = d.persons.filter(x => x.id !== id);
        d.relations = d.relations.filter(r => r.from !== id && r.to !== id);
        // медиа человека удаляются, если на них не ссылаются истории
        const usedByStories = new Set(d.stories.flatMap(s => s.mediaIds));
        d.media = d.media.filter(m => !owned.has(m.id) || usedByStories.has(m.id));
        d.stories = d.stories.map(s => ({ ...s, personIds: s.personIds.filter(x => x !== id) }));
      },
      { history: [{ action: 'delete', entity: 'person', id, summary: 'Удалён: ' + fullName(p) }] },
    );
    const keep = new Set(get().data!.media.map(m => m.id));
    owned.forEach(m => !keep.has(m) && mediaRegistry.delete(m));
  },

  movePerson(id, x, final) {
    get().apply(
      d => {
        const t = d.persons.find(p => p.id === id);
        if (t) t.x = x;
      },
      { silent: !final },
    );
  },

  autoLayout(keepOrder = false) {
    get().apply(() => {}, { autoLayout: { keepOrder } });
  },

  toggleCollapse(id) {
    get().apply(
      d => {
        const p = d.persons.find(x => x.id === id);
        if (!p) return;
        if (p.collapsed) {
          // разворачиваем и супругов, свернувших тех же детей, — иначе дети остались бы скрыты
          const g = descGraph(d.relations);
          const mine = descendantsOf(id, g);
          d.relations
            .filter(r => r.type === 'spouse' && (r.from === id || r.to === id))
            .forEach(r => {
              const sp = d.persons.find(x => x.id === (r.from === id ? r.to : r.from));
              if (sp && sp.collapsed && [...descendantsOf(sp.id, g)].some(x => mine.has(x))) sp.collapsed = false;
            });
        }
        p.collapsed = !p.collapsed;
      },
      { autoLayout: { keepOrder: true } },
    );
  },

  addRelation(type, from, to) {
    const d0 = get().data;
    if (!d0) return { ok: false, reason: 'exists' };
    const exists = d0.relations.some(r => r.type === type && ((r.from === from && r.to === to) || (r.from === to && r.to === from)));
    if (exists) return { ok: false, reason: 'exists' };
    // from — родитель, to — ребёнок; ребёнок не может быть предком своего родителя
    if (type === 'parent' && isAncestor(d0.relations, to, from)) return { ok: false, reason: 'cycle' };
    const id = newId();
    get().apply(d => d.relations.push({ id, from, to, type }), {
      history: [{ action: 'create', entity: 'relation', id, summary: `Связь (${type})` }],
    });
    return { ok: true };
  },

  deleteRelation(id) {
    get().apply(d => (d.relations = d.relations.filter(r => r.id !== id)), {
      history: [{ action: 'delete', entity: 'relation', id, summary: 'Связь удалена' }],
    });
  },

  addMedia(item, blob) {
    mediaRegistry.set(item.id, blob);
    get().apply(d => d.media.push(item), { history: [{ action: 'create', entity: 'media', id: item.id, summary: item.name }] });
  },

  setMediaPeople(mediaId, people) {
    const d0 = get().data;
    const m = d0?.media.find(x => x.id === mediaId);
    if (!d0 || !m) return;
    const owner = d0.persons.find(p => p.media.includes(mediaId))?.id;
    const known = new Set(d0.persons.map(p => p.id));
    const next = [...new Set(people)].filter(x => x !== owner && known.has(x));
    get().apply(
      d => {
        d.media = d.media.map(x => (x.id === mediaId ? { ...x, people: next } : x));
      },
      { history: [{ action: 'update', entity: 'media', id: mediaId, summary: `Отметки на фото: ${next.length}` }] },
    );
  },

  deleteMedia(id) {
    get().apply(
      d => {
        d.media = d.media.filter(m => m.id !== id);
        d.persons.forEach(p => {
          if (p.mainPhotoId === id) p.mainPhotoId = null;
          p.media = p.media.filter(x => x !== id);
          p.documents = p.documents.filter(x => x !== id);
        });
        d.stories = d.stories.map(s => ({ ...s, mediaIds: s.mediaIds.filter(x => x !== id) }));
        if (d.meta.coverId === id) d.meta.coverId = null;
      },
      { history: [{ action: 'delete', entity: 'media', id, summary: 'Файл удалён' }] },
    );
    mediaRegistry.delete(id);
  },

  saveStory(story) {
    get().apply(
      d => {
        const i = d.stories.findIndex(s => s.id === story.id);
        if (i >= 0) d.stories[i] = { ...story, updatedAt: Date.now() };
        else d.stories.push(story);
      },
      { history: [{ action: 'update', entity: 'story', id: story.id, summary: story.title || 'История' }] },
    );
  },

  deleteStory(id) {
    get().apply(d => (d.stories = d.stories.filter(s => s.id !== id)), {
      history: [{ action: 'delete', entity: 'story', id, summary: 'История удалена' }],
    });
  },

  updateMeta(patch) {
    get().apply(d => Object.assign(d.meta, patch), { history: [{ action: 'update', entity: 'archive', id: '', summary: 'Свойства архива' }] });
  },
}));

/** Пустой архив (для «Начать с нуля» до появления шифрования). */
export function blankArchive(title = 'Семейный архив'): ArchiveData {
  return { meta: createMeta(title), persons: [], relations: [], media: [], stories: [], history: [] };
}

export const hiddenOf = (d: ArchiveData) => computeHidden(d.persons, d.relations);
