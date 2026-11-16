/* Данные открытого архива. Любое изменение идёт через apply(): рабочие копии → правка →
   пересчёт рядов дерева → новое состояние + запись в историю + отметка «есть несохранённые изменения». */
import { create } from 'zustand';
import { autoLayout as runAutoLayout, layoutRows, type RowsLayout } from '../domain/layout';
import { computeHidden, descGraph, descendantsOf, isAncestor } from '../domain/graph';
import { createMeta, createPerson, FACES_VERSION, newId, ownerUser } from '../domain/normalize';
import { fullName } from '../domain/people';
import type { ArchiveData, HistoryEntry, MediaFace, MediaItem, Person, RelType, Story, Tombstone } from '../domain/types';
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
  /** кто сейчас правит (id пользователя архива) — ставится в отметки «изменил» */
  actor: string;
  setActor(id: string): void;

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
  /** когда снято — свободный текст */
  setMediaDate(mediaId: string, date: string): void;
  /** год снимка (null — не указан); старый текст даты при этом очищается */
  setMediaYear(mediaId: string, year: number | null): void;
  /** распознавание лиц: «нет, это не он» — больше не предлагать этого человека на этом фото */
  /** сохранить найденные лица фото */
  setMediaFaces(mediaId: string, faces: MediaFace[]): void;
  /** запомнить найденные лица сразу у многих фото (одним изменением) */
  addFacesCache(found: Map<string, MediaFace[]>): void;
  /** «Да, это он»: лицо — этот человек, и человек отмечен на фото */
  confirmFace(mediaId: string, index: number): void;
  /** «Нет»: не предлагать этого человека на этом фото */
  rejectFace(mediaId: string, index: number): void;
  /** исправить: это лицо — вот этот человек (он отмечается на фото, с других лиц снимается) */
  assignFace(mediaId: string, index: number, personId: string): void;
  /** исправить: это лицо — не тот, кого узнали (больше его на это лицо не ставить) */
  unassignFace(mediaId: string, index: number): void;
  /** «Это не лицо» — рамку скрыть и больше не предлагать */
  notAFace(mediaId: string, index: number): void;

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
    access: { users: d.access.users.map(u => ({ ...u, can: { ...u.can } })) },
    deleted: d.deleted.slice(),
  };
}

const MAX_HISTORY = 5000;

/* ---------- отметки «кто и когда» (для слияния копий) ---------- */
// поля раскладки на холсте — это вид, а не данные: их изменение правкой не считается
const LAYOUT_KEYS = new Set(['x', 'y', 'slot', 'offX', 'offK', 'collapsed', 'gen']);
const STAMP_KEYS = new Set(['updatedAt', 'updatedBy', 'createdBy', 'createdAt']);
/** Содержимое записи без раскладки и отметок — сравнивается, чтобы понять, была ли правка. */
export function contentKey(e: object): string {
  return JSON.stringify(e, (k, v) => (k && (LAYOUT_KEYS.has(k) || STAMP_KEYS.has(k)) ? undefined : v));
}

type Stampable = { id: string; createdBy?: string; updatedBy?: string; updatedAt?: number; createdAt?: number };

/** Новые записи — «создал», изменённые — «изменил», исчезнувшие — метка удаления. */
function stamp<T extends Stampable>(prev: T[], next: T[], entity: Tombstone['entity'], actor: string, now: number, deleted: Tombstone[]): T[] {
  const before = new Map(prev.map(e => [e.id, e]));
  const out = next.map(e => {
    const p = before.get(e.id);
    if (!p) return { ...e, createdBy: e.createdBy ?? actor, createdAt: e.createdAt ?? now, updatedAt: now, updatedBy: actor };
    if (p === e) return e; // тот же объект — точно без изменений
    return contentKey(p) === contentKey(e) ? e : { ...e, updatedAt: now, updatedBy: actor };
  });
  const ids = new Set(next.map(e => e.id));
  prev.forEach(e => {
    if (!ids.has(e.id) && !deleted.some(t => t.entity === entity && t.id === e.id)) deleted.push({ entity, id: e.id, ts: now, by: actor });
  });
  return out;
}

export const useArchive = create<ArchiveState>((set, get) => ({
  data: null,
  actor: '',
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
    if (!opts.silent) {
      const actor = get().actor;
      d.persons = stamp(cur.persons, d.persons, 'person', actor, now, d.deleted);
      d.relations = stamp(cur.relations, d.relations, 'relation', actor, now, d.deleted);
      d.media = stamp(cur.media, d.media, 'media', actor, now, d.deleted);
      d.stories = stamp(cur.stories, d.stories, 'story', actor, now, d.deleted);
    }
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

  setActor(actor) {
    set({ actor });
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

  setMediaDate(mediaId, date) {
    const v = date.trim().slice(0, 60);
    const m = get().data?.media.find(x => x.id === mediaId);
    if (!m || m.date === v) return;
    get().apply(d => {
      d.media = d.media.map(x => (x.id === mediaId ? { ...x, date: v } : x));
    }, { history: [{ action: 'update', entity: 'media', id: mediaId, summary: v ? `Дата фото: ${v}` : 'Дата фото убрана' }] });
  },

  setMediaYear(mediaId, year) {
    const m = get().data?.media.find(x => x.id === mediaId);
    if (!m || (m.year === year && !m.date)) return;
    get().apply(d => {
      d.media = d.media.map(x => (x.id === mediaId ? { ...x, year, date: '' } : x));
    }, { history: [{ action: 'update', entity: 'media', id: mediaId, summary: year ? `Год фото: ${year}` : 'Год фото убран' }] });
  },

  setMediaFaces(mediaId, faces) {
    const m = get().data?.media.find(x => x.id === mediaId);
    if (!m || (m.facesV === FACES_VERSION && JSON.stringify(m.faces ?? null) === JSON.stringify(faces))) return;
    get().apply(d => {
      d.media = d.media.map(x => (x.id === mediaId ? { ...x, faces, facesV: FACES_VERSION } : x));
    });
  },

  addFacesCache(found) {
    const d0 = get().data;
    const stale = (m: MediaItem) => found.has(m.id) && (!m.faces || m.facesV !== FACES_VERSION);
    if (!d0 || !d0.media.some(stale)) return;
    get().apply(d => {
      d.media = d.media.map(m => (stale(m) ? { ...m, faces: found.get(m.id)!, facesV: FACES_VERSION } : m));
    });
  },

  confirmFace(mediaId, index) {
    const m = get().data?.media.find(x => x.id === mediaId);
    const pid = m?.faces?.[index]?.s;
    if (!m || !pid) return;
    get().apply(
      d => {
        d.media = d.media.map(x => {
          if (x.id !== mediaId) return x;
          const faces = (x.faces ?? []).map((f, i) => (i === index ? { ...f, p: pid, s: undefined } : f.s === pid ? { ...f, s: undefined } : f));
          return { ...x, faces, people: x.people.includes(pid) ? x.people : [...x.people, pid] };
        });
      },
      { history: [{ action: 'update', entity: 'media', id: mediaId, summary: 'Узнан человек на фото' }] },
    );
  },

  assignFace(mediaId, index, personId) {
    const m = get().data?.media.find(x => x.id === mediaId);
    if (!m?.faces?.[index]) return;
    get().apply(
      d => {
        d.media = d.media.map(x => {
          if (x.id !== mediaId) return x;
          const faces = (x.faces ?? []).map((f, i) => {
            if (i === index) return { ...f, p: personId, s: undefined, n: f.n?.filter(id => id !== personId) };
            // один человек — одно лицо на фото
            return f.p === personId || f.s === personId ? { ...f, p: f.p === personId ? undefined : f.p, s: f.s === personId ? undefined : f.s } : f;
          });
          // владелец альбома и так «на фото» — в отметки его не добавляем (иначе ФИО дважды)
          const isOwner = d.persons.some(p => p.id === personId && p.media.includes(mediaId));
          return {
            ...x,
            faces,
            people: isOwner || x.people.includes(personId) ? x.people : [...x.people, personId],
            notPeople: x.notPeople?.filter(id => id !== personId),
          };
        });
      },
      { history: [{ action: 'update', entity: 'media', id: mediaId, summary: 'Исправлено: кто на фото' }] },
    );
  },

  unassignFace(mediaId, index) {
    const m = get().data?.media.find(x => x.id === mediaId);
    const f0 = m?.faces?.[index];
    const wrong = f0?.p ?? f0?.s;
    if (!m || !f0 || !wrong) return;
    get().apply(d => {
      d.media = d.media.map(x =>
        x.id !== mediaId ? x : { ...x, faces: (x.faces ?? []).map((f, i) => (i === index ? { ...f, p: undefined, s: undefined, n: [...new Set([...(f.n ?? []), wrong])] } : f)) },
      );
    });
  },

  notAFace(mediaId, index) {
    const m = get().data?.media.find(x => x.id === mediaId);
    if (!m?.faces?.[index]) return;
    get().apply(d => {
      d.media = d.media.map(x =>
        x.id !== mediaId ? x : { ...x, faces: (x.faces ?? []).map((f, i) => (i === index ? { ...f, nf: true, p: undefined, s: undefined } : f)) },
      );
    });
  },

  rejectFace(mediaId, index) {
    const m = get().data?.media.find(x => x.id === mediaId);
    const pid = m?.faces?.[index]?.s;
    if (!m || !pid) return;
    get().apply(d => {
      d.media = d.media.map(x =>
        x.id !== mediaId
          ? x
          : { ...x, notPeople: [...new Set([...(x.notPeople ?? []), pid])], faces: (x.faces ?? []).map((f, i) => (i === index ? { ...f, s: undefined } : f)) },
      );
    });
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
  return { meta: createMeta(title), persons: [], relations: [], media: [], stories: [], history: [], access: { users: [ownerUser()] }, deleted: [] };
}

export const hiddenOf = (d: ArchiveData) => computeHidden(d.persons, d.relations);
