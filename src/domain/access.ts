/* Права доступа. Владелец может всё. Участник видит весь архив, а менять может только свою ветку:
   корневой человек, вся его кровная родня (предки и все их потомки), их супруги
   и люди, которых участник добавил сам. Права участника: менять, добавлять, удалять (чтение — всегда). */
import type { AccessRight, AccessUser, ArchiveData, MediaItem, Person, Relation, Story } from './types';

/** Ветка участника. null — без ограничений (владелец или участник с доступом ко всему архиву). */
export function branchOf(user: AccessUser, persons: Person[], relations: Relation[]): Set<string> | null {
  if (user.role === 'owner' || !user.root) return null;
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, k: string, v: string) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
  const spouses = new Map<string, string[]>();
  const siblings = new Map<string, string[]>();
  for (const r of relations) {
    if (r.type === 'parent') {
      add(children, r.from, r.to);
      add(parents, r.to, r.from);
    } else if (r.type === 'spouse') {
      add(spouses, r.from, r.to);
      add(spouses, r.to, r.from);
    } else if (r.type === 'sibling') {
      add(siblings, r.from, r.to);
      add(siblings, r.to, r.from);
    }
  }
  const known = new Set(persons.map(p => p.id));
  if (!known.has(user.root)) return new Set(persons.filter(p => p.createdBy === user.id).map(p => p.id));

  // 1) вверх: корень и все его предки (через родителей и братьев-сестёр — у них общие предки)
  const up = new Set<string>([user.root]);
  const queue = [user.root];
  while (queue.length) {
    const id = queue.pop()!;
    for (const x of [...(parents.get(id) ?? []), ...(siblings.get(id) ?? [])])
      if (!up.has(x)) {
        up.add(x);
        queue.push(x);
      }
  }
  // 2) вниз: все потомки этих людей (и их братья-сёстры) — вся кровная родня
  const blood = new Set(up);
  const down = [...up];
  while (down.length) {
    const id = down.pop()!;
    for (const x of [...(children.get(id) ?? []), ...(siblings.get(id) ?? [])])
      if (!blood.has(x)) {
        blood.add(x);
        down.push(x);
      }
  }
  // 3) супруги кровных родственников и люди, которых участник добавил сам
  const scope = new Set(blood);
  blood.forEach(id => (spouses.get(id) ?? []).forEach(s => scope.add(s)));
  persons.forEach(p => p.createdBy === user.id && scope.add(p.id));
  return scope;
}

/** Проверки прав для конкретного пользователя на конкретных данных. */
export interface Access {
  user: AccessUser | null;
  isOwner: boolean;
  /** можно ли вообще это действие (без учёта ветки) */
  has(right: AccessRight): boolean;
  inBranch(personId: string | null | undefined): boolean;
  canEditPerson(id: string): boolean;
  canDeletePerson(id: string): boolean;
  /** добавить человека, связанного с этим (родственник, супруг) */
  canAddNear(id: string): boolean;
  /** добавить человека без связей (появится в ветке как «добавленный участником») */
  canAddFree(): boolean;
  canLink(a: string, b: string): boolean;
  canUnlink(r: Relation): boolean;
  /** добавлять/удалять файлы человека */
  canAddMedia(personId: string): boolean;
  canDeleteMedia(personId: string): boolean;
  /** менять сам файл (отметки людей, дату): владелец файла должен быть в ветке */
  canEditMediaItem(m: MediaItem, ownerId: string | null): boolean;
  canAddStory(): boolean;
  canEditStory(s: Story): boolean;
  canDeleteStory(s: Story): boolean;
  /** раскладка всего дерева, настройки архива, доступы, слияние */
  canManageArchive: boolean;
}

export function makeAccess(user: AccessUser | null, data: ArchiveData | null): Access {
  const owner = !!user && user.role === 'owner';
  const scope = user && data && !owner ? branchOf(user, data.persons, data.relations) : null;
  const has = (r: AccessRight) => !!user && (owner || user.can[r]);
  const inBranch = (id: string | null | undefined) => !!user && (owner || scope === null || (!!id && scope.has(id)));
  const own = (s: Story) => !!user && s.createdBy === user.id;
  return {
    user,
    isOwner: owner,
    has,
    inBranch,
    canEditPerson: id => has('change') && inBranch(id),
    canDeletePerson: id => has('delete') && inBranch(id),
    canAddNear: id => has('add') && inBranch(id),
    canAddFree: () => has('add'),
    canLink: (a, b) => has('add') && (inBranch(a) || inBranch(b)),
    canUnlink: r => has('delete') && (inBranch(r.from) || inBranch(r.to)),
    canAddMedia: id => has('add') && inBranch(id),
    canDeleteMedia: id => has('delete') && inBranch(id),
    canEditMediaItem: (_m, ownerId) => has('change') && (ownerId ? inBranch(ownerId) : owner),
    canAddStory: () => has('add'),
    canEditStory: s => owner || (has('change') && own(s)),
    canDeleteStory: s => owner || (has('delete') && own(s)),
    canManageArchive: owner,
  };
}
