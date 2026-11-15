/* Граф родства: семьи (родители + дети), потомки для сворачивания, проверка предков. */
import type { Person, Relation } from './types';

export interface Family {
  parents: string[];
  children: string[];
}

export interface DescGraph {
  kids: Map<string, string[]>;
  sp: Map<string, string[]>;
  hasParent: Set<string>;
}

const push = (m: Map<string, string[]>, k: string, v: string) => {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
};

export function descGraph(relations: Relation[]): DescGraph {
  const kids = new Map<string, string[]>();
  const sp = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const r of relations) {
    if (r.type === 'parent') {
      push(kids, r.from, r.to);
      hasParent.add(r.to);
    } else if (r.type === 'spouse') {
      push(sp, r.from, r.to);
      push(sp, r.to, r.from);
    }
  }
  return { kids, sp, hasParent };
}

/** Все потомки человека (и супруги потомков «со стороны» — у которых нет своих родителей в дереве). */
export function descendantsOf(rootId: string, g: DescGraph): Set<string> {
  const out = new Set<string>();
  const q = [...(g.kids.get(rootId) || [])];
  while (q.length) {
    const id = q.pop()!;
    if (out.has(id) || id === rootId) continue;
    out.add(id);
    (g.kids.get(id) || []).forEach(c => q.push(c));
    (g.sp.get(id) || []).forEach(s => {
      if (!g.hasParent.has(s)) q.push(s);
    });
  }
  return out;
}

/** Скрытые люди — потомки свёрнутых. */
export function computeHidden(persons: Person[], relations: Relation[]): Set<string> {
  const hidden = new Set<string>();
  const g = descGraph(relations);
  persons.filter(p => p.collapsed).forEach(p => descendantsOf(p.id, g).forEach(id => hidden.add(id)));
  return hidden;
}

/** true, если ancestorId — предок personId (защита от циклов родитель→ребёнок). */
export function isAncestor(relations: Relation[], ancestorId: string, personId: string): boolean {
  const parentsOf = new Map<string, string[]>();
  for (const r of relations) if (r.type === 'parent') push(parentsOf, r.to, r.from);
  const seen = new Set<string>();
  const q = [personId];
  while (q.length) {
    const id = q.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const p of parentsOf.get(id) || []) {
      if (p === ancestorId) return true;
      q.push(p);
    }
  }
  return false;
}

/** Семьи: родители (один или супружеская пара) + их общие дети. Только среди видимых людей. */
export function buildFamilies(visibleIds: Set<string>, relations: Relation[], seqOf: (id: string) => number): Family[] {
  const sp = new Set<string>();
  for (const r of relations) {
    if (r.type === 'spouse') {
      sp.add(r.from + ':' + r.to);
      sp.add(r.to + ':' + r.from);
    }
  }
  const parents = new Map<string, Set<string>>();
  for (const r of relations) {
    const a = r.from;
    const b = r.to;
    if (r.type !== 'parent' || !visibleIds.has(a) || !visibleIds.has(b) || a === b) continue;
    if (!parents.has(b)) parents.set(b, new Set());
    parents.get(b)!.add(a);
  }
  const fams = new Map<string, Family>();
  parents.forEach((set, child) => {
    const ps = [...set].sort((a, b) => seqOf(a) - seqOf(b));
    const groups = ps.length === 1 || (ps.length === 2 && sp.has(ps[0] + ':' + ps[1])) ? [ps] : ps.map(id => [id]);
    for (const g of groups) {
      const k = g.join('-');
      if (!fams.has(k)) fams.set(k, { parents: g, children: [] });
      fams.get(k)!.children.push(child);
    }
  });
  return [...fams.values()];
}
