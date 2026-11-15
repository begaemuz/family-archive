/* Слияние копий архива. Владелец выдал участнику копию, тот внёс правки в своей ветке и прислал файл обратно.
   Берём из копии только правки участников, сделанные после последнего слияния (AccessUser.syncedAt),
   и только разрешённые их правами (права берём из архива владельца — копии не доверяем).
   Если ту же запись после этого меняли и в основном архиве — конфликт: владелец выбирает «моё» или «их». */
import { branchOf } from './access';
import { fullName } from './people';
import { normalizeArchive } from './normalize';
import type { AccessUser, ArchiveData, MediaItem, Person, Relation, Story, Tombstone } from './types';

export type MergeEntity = 'person' | 'relation' | 'media' | 'story';
export type MergeAction = 'add' | 'update' | 'delete';

export interface FieldDiff {
  field: string;
  label: string;
  mine: string;
  theirs: string;
}

export interface MergeItem {
  key: string;
  entity: MergeEntity;
  action: MergeAction;
  id: string;
  title: string;
  by: string;
  /** запись меняли и у владельца — нужен выбор */
  conflict: boolean;
  fields?: FieldDiff[];
}

export interface Rejected {
  title: string;
  by: string;
  reason: string;
}

export interface MergePlan {
  items: MergeItem[];
  rejected: Rejected[];
  /** чьи правки нашлись */
  authors: AccessUser[];
}

/** Выбор владельца: принять пункт или нет; в конфликтах по людям — по каждому полю «mine» | «theirs». */
export interface MergeChoices {
  skip: Set<string>;
  fields: Map<string, Record<string, 'mine' | 'theirs'>>;
  /** конфликт без полей (удаление, файл, история): что оставить */
  side: Map<string, 'mine' | 'theirs'>;
}

const LAYOUT = new Set(['x', 'y', 'slot', 'offX', 'offK', 'collapsed', 'updatedAt', 'updatedBy', 'createdBy', 'createdAt', 'seq', 'legacyId']);

const PERSON_LABELS: Record<string, string> = {
  lastName: 'Фамилия',
  firstName: 'Имя',
  middleName: 'Отчество',
  maidenName: 'Девичья фамилия',
  gender: 'Пол',
  birth: 'Дата рождения',
  death: 'Дата смерти',
  deceased: 'Умер(ла)',
  birthCountry: 'Страна рождения',
  birthCity: 'Город рождения',
  deathCountry: 'Страна смерти',
  deathCity: 'Город смерти',
  residenceCountry: 'Страна проживания',
  residenceCity: 'Город проживания',
  phone: 'Телефон',
  email: 'Email',
  address: 'Адрес',
  occupation: 'Занятие',
  socials: 'Соцсети',
  bio: 'Биография',
  burial: 'Место захоронения',
  mainPhotoId: 'Фото профиля',
  media: 'Фото и видео',
  documents: 'Документы',
};

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (Array.isArray(v)) return v.length ? `${v.length} шт.` : '—';
  if (typeof v === 'object') return 'изменено';
  return String(v);
}

function personDiff(a: Person, b: Person): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const k of Object.keys(PERSON_LABELS)) {
    const va = (a as unknown as Record<string, unknown>)[k];
    const vb = (b as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(va) !== JSON.stringify(vb)) out.push({ field: k, label: PERSON_LABELS[k], mine: show(va), theirs: show(vb) });
  }
  return out;
}

const same = (a: object, b: object) => JSON.stringify(a, (k, v) => (k && LAYOUT.has(k) ? undefined : v)) === JSON.stringify(b, (k, v) => (k && LAYOUT.has(k) ? undefined : v));

/** План слияния: что прислал участник, что из этого разрешено, где конфликты. */
export function planMerge(mine: ArchiveData, theirs: ArchiveData): MergePlan {
  const items: MergeItem[] = [];
  const rejected: Rejected[] = [];
  const members = new Map(mine.access.users.filter(u => u.role === 'member').map(u => [u.id, u]));
  const authors = new Set<string>();
  const tomb = (entity: MergeEntity, id: string) => mine.deleted.some(t => t.entity === entity && t.id === id);
  // ветки считаем по копии участника (там уже его новые родственники) и по основному архиву (для удалённых)
  const scopeTheirs = new Map<string, Set<string> | null>();
  const scopeMine = new Map<string, Set<string> | null>();
  const inScope = (u: AccessUser, id: string | null | undefined, where: 'theirs' | 'mine') => {
    if (!u.root) return true;
    const cache = where === 'theirs' ? scopeTheirs : scopeMine;
    if (!cache.has(u.id)) cache.set(u.id, branchOf(u, where === 'theirs' ? theirs.persons : mine.persons, where === 'theirs' ? theirs.relations : mine.relations));
    const s = cache.get(u.id);
    return s === null || (!!id && !!s && s.has(id));
  };
  const member = (by: string | undefined, at: number | undefined) => {
    const u = by ? members.get(by) : undefined;
    return u && (at ?? 0) > u.syncedAt ? u : null;
  };
  const changedByOwner = (e: { updatedAt?: number; updatedBy?: string }, u: AccessUser) => (e.updatedAt ?? 0) > u.syncedAt && e.updatedBy !== u.id;

  const myPersons = new Map(mine.persons.map(p => [p.id, p]));
  const theirPersons = new Map(theirs.persons.map(p => [p.id, p]));
  const name = (id: string) => {
    const p = myPersons.get(id) ?? theirPersons.get(id);
    return p ? fullName(p) || 'Без имени' : 'человек';
  };

  /* --- люди --- */
  for (const p of theirs.persons) {
    const u = member(p.updatedBy ?? p.createdBy, p.updatedAt);
    if (!u) continue;
    const m = myPersons.get(p.id);
    const title = fullName(p) || 'Без имени';
    if (!m) {
      if (tomb('person', p.id)) {
        rejected.push({ title, by: u.id, reason: 'этот человек удалён в основном архиве' });
        continue;
      }
      authors.add(u.id);
      if (u.can.add && inScope(u, p.id, 'theirs')) items.push({ key: 'p+' + p.id, entity: 'person', action: 'add', id: p.id, title, by: u.id, conflict: false });
      else rejected.push({ title, by: u.id, reason: 'нет права добавлять людей вне своей ветки' });
      continue;
    }
    const fields = personDiff(m, p);
    if (!fields.length) continue;
    authors.add(u.id);
    if (!(u.can.change && inScope(u, p.id, 'theirs'))) {
      rejected.push({ title, by: u.id, reason: 'нет права менять этого человека' });
      continue;
    }
    items.push({ key: 'p~' + p.id, entity: 'person', action: 'update', id: p.id, title, by: u.id, conflict: changedByOwner(m, u), fields });
  }

  /* --- связи --- */
  const myRel = new Map(mine.relations.map(r => [r.id, r]));
  const pairKey = (r: Relation) => r.type + ':' + [r.from, r.to].sort().join(':');
  const myPairs = new Set(mine.relations.map(pairKey));
  const relLabel = (r: Relation) => `${name(r.from)} — ${name(r.to)} (${{ parent: 'родитель → ребёнок', spouse: 'супруги', sibling: 'брат/сестра', other: 'другое' }[r.type]})`;
  for (const r of theirs.relations) {
    if (myRel.has(r.id) || myPairs.has(pairKey(r))) continue;
    const u = member(r.createdBy, r.createdAt);
    if (!u) continue;
    authors.add(u.id);
    if (tomb('relation', r.id)) {
      rejected.push({ title: relLabel(r), by: u.id, reason: 'эта связь удалена в основном архиве' });
      continue;
    }
    if (u.can.add && (inScope(u, r.from, 'theirs') || inScope(u, r.to, 'theirs')))
      items.push({ key: 'r+' + r.id, entity: 'relation', action: 'add', id: r.id, title: relLabel(r), by: u.id, conflict: false });
    else rejected.push({ title: relLabel(r), by: u.id, reason: 'связь вне своей ветки' });
  }

  /* --- файлы --- */
  const myMedia = new Map(mine.media.map(m => [m.id, m]));
  const ownerIn = (d: ArchiveData, id: string) => d.persons.find(p => p.media.includes(id) || p.documents.includes(id) || p.mainPhotoId === id)?.id ?? null;
  for (const it of theirs.media) {
    const mm = myMedia.get(it.id);
    if (!mm) {
      const u = member(it.createdBy, it.updatedAt ?? it.createdAt);
      if (!u || tomb('media', it.id)) continue;
      authors.add(u.id);
      const ow = ownerIn(theirs, it.id);
      const inStory = theirs.stories.some(s => s.mediaIds.includes(it.id));
      if (u.can.add && ((ow && inScope(u, ow, 'theirs')) || inStory)) items.push({ key: 'm+' + it.id, entity: 'media', action: 'add', id: it.id, title: it.name, by: u.id, conflict: false });
      else rejected.push({ title: it.name, by: u.id, reason: 'файл вне своей ветки' });
      continue;
    }
    const u = member(it.updatedBy, it.updatedAt);
    if (!u || (mm.date === it.date && JSON.stringify(mm.people) === JSON.stringify(it.people))) continue;
    authors.add(u.id);
    const ow = ownerIn(mine, it.id);
    if (!(u.can.change && inScope(u, ow, 'theirs'))) {
      rejected.push({ title: it.name, by: u.id, reason: 'нет права менять этот файл' });
      continue;
    }
    items.push({ key: 'm~' + it.id, entity: 'media', action: 'update', id: it.id, title: `${it.name}: дата и отметки людей`, by: u.id, conflict: changedByOwner(mm, u) });
  }

  /* --- истории --- */
  const myStories = new Map(mine.stories.map(s => [s.id, s]));
  for (const s of theirs.stories) {
    const u = member(s.updatedBy ?? s.createdBy, s.updatedAt);
    if (!u) continue;
    const ms = myStories.get(s.id);
    const title = s.title || 'История без названия';
    if (!ms) {
      if (tomb('story', s.id)) continue;
      authors.add(u.id);
      if (u.can.add) items.push({ key: 's+' + s.id, entity: 'story', action: 'add', id: s.id, title, by: u.id, conflict: false });
      else rejected.push({ title, by: u.id, reason: 'нет права добавлять истории' });
      continue;
    }
    if (same(ms, s)) continue;
    authors.add(u.id);
    if (!(u.can.change && ms.createdBy === u.id)) {
      rejected.push({ title, by: u.id, reason: 'менять можно только свои истории' });
      continue;
    }
    items.push({ key: 's~' + s.id, entity: 'story', action: 'update', id: s.id, title, by: u.id, conflict: changedByOwner(ms, u) });
  }

  /* --- удаления участника --- */
  for (const t of theirs.deleted) {
    const u = member(t.by, t.ts);
    if (!u) continue;
    const t2 = t as Tombstone;
    if (t2.entity === 'person') {
      const m = myPersons.get(t.id);
      if (!m) continue;
      authors.add(u.id);
      if (u.can.delete && inScope(u, t.id, 'mine'))
        items.push({ key: 'p-' + t.id, entity: 'person', action: 'delete', id: t.id, title: fullName(m) || 'Без имени', by: u.id, conflict: changedByOwner(m, u) });
      else rejected.push({ title: fullName(m), by: u.id, reason: 'нет права удалять этого человека' });
    } else if (t2.entity === 'relation') {
      const r = myRel.get(t.id);
      if (!r) continue;
      authors.add(u.id);
      if (u.can.delete && (inScope(u, r.from, 'mine') || inScope(u, r.to, 'mine')))
        items.push({ key: 'r-' + t.id, entity: 'relation', action: 'delete', id: t.id, title: relLabel(r), by: u.id, conflict: false });
      else rejected.push({ title: relLabel(r), by: u.id, reason: 'нет права удалять эту связь' });
    } else if (t2.entity === 'media') {
      const m = myMedia.get(t.id);
      if (!m) continue;
      authors.add(u.id);
      const ow = ownerIn(mine, t.id);
      if (u.can.delete && inScope(u, ow, 'mine')) items.push({ key: 'm-' + t.id, entity: 'media', action: 'delete', id: t.id, title: m.name, by: u.id, conflict: changedByOwner(m, u) });
      else rejected.push({ title: m.name, by: u.id, reason: 'нет права удалять этот файл' });
    } else {
      const s = myStories.get(t.id);
      if (!s) continue;
      authors.add(u.id);
      if (u.can.delete && s.createdBy === u.id) items.push({ key: 's-' + t.id, entity: 'story', action: 'delete', id: t.id, title: s.title || 'История', by: u.id, conflict: changedByOwner(s, u) });
      else rejected.push({ title: s.title || 'История', by: u.id, reason: 'удалять можно только свои истории' });
    }
  }

  const order: Record<MergeAction, number> = { add: 0, update: 1, delete: 2 };
  items.sort((a, b) => Number(b.conflict) - Number(a.conflict) || order[a.action] - order[b.action]);
  return { items, rejected, authors: [...authors].map(id => members.get(id)!).filter(Boolean) };
}

/** Применить план: новый архив + id файлов, которые нужно взять из копии. */
export function applyMerge(mine: ArchiveData, theirs: ArchiveData, plan: MergePlan, choices: MergeChoices): { data: ArchiveData; copyMedia: string[] } {
  const now = Date.now();
  const d: ArchiveData = JSON.parse(JSON.stringify(mine));
  const tp = new Map(theirs.persons.map(p => [p.id, p]));
  const tr = new Map(theirs.relations.map(r => [r.id, r]));
  const tm = new Map(theirs.media.map(m => [m.id, m]));
  const ts = new Map(theirs.stories.map(s => [s.id, s]));
  const copyMedia: string[] = [];
  const take = (it: MergeItem) => !choices.skip.has(it.key) && (!it.conflict || it.fields || choices.side.get(it.key) !== 'mine');
  const accepted = plan.items.filter(take);
  const by = (t: string) => accepted.filter(i => i.action === t);

  // 1) добавления: сначала файлы, потом люди, связи, истории
  for (const it of by('add')) {
    if (it.entity === 'media') {
      d.media.push(tm.get(it.id)! as MediaItem);
      copyMedia.push(it.id);
    }
  }
  for (const it of by('add')) {
    if (it.entity === 'person') d.persons.push({ ...(tp.get(it.id) as Person) });
    if (it.entity === 'story') d.stories.push({ ...(ts.get(it.id) as Story) });
  }
  for (const it of by('add')) if (it.entity === 'relation') d.relations.push({ ...(tr.get(it.id) as Relation) });

  // 2) изменения
  for (const it of by('update')) {
    if (it.entity === 'person') {
      const i = d.persons.findIndex(p => p.id === it.id);
      const theirsP = tp.get(it.id)!;
      if (i < 0) continue;
      const pick = choices.fields.get(it.key) ?? {};
      const next = { ...d.persons[i] } as unknown as Record<string, unknown>;
      for (const f of it.fields ?? []) {
        if (it.conflict && (pick[f.field] ?? 'mine') === 'mine') continue;
        next[f.field] = JSON.parse(JSON.stringify((theirsP as unknown as Record<string, unknown>)[f.field]));
      }
      next.updatedAt = now;
      next.updatedBy = it.by;
      d.persons[i] = next as unknown as Person;
      // файлы, которые участник добавил этому человеку, — тоже взять
      for (const id of [...(theirsP.media ?? []), ...(theirsP.documents ?? []), theirsP.mainPhotoId].filter((x): x is string => !!x))
        if (!d.media.some(m => m.id === id) && tm.has(id)) {
          d.media.push(tm.get(id)!);
          copyMedia.push(id);
        }
    }
    if (it.entity === 'media') {
      const i = d.media.findIndex(m => m.id === it.id);
      if (i >= 0) d.media[i] = { ...d.media[i], people: [...tm.get(it.id)!.people], date: tm.get(it.id)!.date, updatedAt: now, updatedBy: it.by };
    }
    if (it.entity === 'story') {
      const i = d.stories.findIndex(s => s.id === it.id);
      if (i >= 0) d.stories[i] = { ...(ts.get(it.id) as Story), updatedAt: now };
    }
  }

  // 3) удаления
  for (const it of by('delete')) {
    if (it.entity === 'person') {
      d.persons = d.persons.filter(p => p.id !== it.id);
      d.relations = d.relations.filter(r => r.from !== it.id && r.to !== it.id);
    }
    if (it.entity === 'relation') d.relations = d.relations.filter(r => r.id !== it.id);
    if (it.entity === 'media') {
      d.media = d.media.filter(m => m.id !== it.id);
      d.persons.forEach(p => {
        p.media = p.media.filter(x => x !== it.id);
        p.documents = p.documents.filter(x => x !== it.id);
        if (p.mainPhotoId === it.id) p.mainPhotoId = null;
      });
    }
    if (it.entity === 'story') d.stories = d.stories.filter(s => s.id !== it.id);
    d.deleted.push({ entity: it.entity, id: it.id, ts: now, by: it.by });
  }

  // правки участников до этого момента слиты
  const authors = new Set(plan.authors.map(u => u.id));
  d.access.users = d.access.users.map(u => (authors.has(u.id) ? { ...u, syncedAt: now } : u));
  d.history.push({ ts: now, action: 'update', entity: 'archive', id: d.meta.id, summary: `Слияние: принято ${accepted.length}, отклонено ${plan.rejected.length + plan.items.length - accepted.length}` });

  // чистка висящих ссылок (связи без людей, файлы без владельца и т.п.)
  const clean = normalizeArchive(d);
  clean.meta.updatedAt = now;
  return { data: clean, copyMedia: copyMedia.filter(id => clean.media.some(m => m.id === id)) };
}
