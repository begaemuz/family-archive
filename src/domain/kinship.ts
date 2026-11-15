/* Родство: прямые связи (их можно удалить) + вычисленное по общим предкам
   (бабушки, внуки, дяди, племянники, двоюродные, троюродные…) + родня по браку. */
import { birthYear, byGender, fullName } from './people';
import type { Gender, Person, Relation } from './types';

export interface KinItem {
  other: Person;
  /** прямая связь (её можно удалить); null — вычисленное родство */
  rel: Relation | null;
  label: string;
}

export interface KinGroup {
  title: string;
  rank: number;
  items: KinItem[];
}

/** dA — поколений от человека до общего предка, dB — от родственника до него же. */
export function kinLabel(dA: number, dB: number, g: Gender): { label: string; group: string; rank: number } {
  const G = (m: string, f: string, u: string) => byGender(g, m, f, u);
  const suf = G('ый', 'ая', 'ый(ая)');
  const pra = (k: number) => 'пра'.repeat(Math.max(0, k));
  const yu = (n: number) => ['', 'двоюродн', 'троюродн', 'четвероюродн', 'пятиюродн', 'шестиюродн'][n] || 'дальн';
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  if (dB === 0) {
    const k = dA - 2;
    return {
      label: cap(pra(k) + G('дедушка', 'бабушка', 'дедушка / бабушка')),
      group: cap(pra(k) + 'бабушки и ' + pra(k) + 'дедушки'),
      rank: 100 + dA,
    };
  }
  if (dA === 0) {
    const k = dB - 2;
    return { label: cap(pra(k) + G('внук', 'внучка', 'внук / внучка')), group: cap(pra(k) + 'внуки'), rank: 200 + dB };
  }
  const n = Math.min(dA, dB) - 1;
  const diff = dA - dB;
  const adj = (k: number) => (k ? yu(k) + suf + ' ' : '');
  const adjPl = (k: number) => (k ? yu(k) + 'ые ' : '');
  if (diff === 0)
    return { label: cap(adj(n) + G('брат', 'сестра', 'брат / сестра')), group: cap(adjPl(n) + 'братья и сёстры'), rank: 300 + n * 10 };
  if (diff === 1)
    return { label: cap(adj(n) + G('дядя', 'тётя', 'дядя / тётя')), group: cap(adjPl(n) + 'дяди и тёти'), rank: 301 + n * 10 };
  if (diff === -1)
    return {
      label: cap(adj(n) + G('племянник', 'племянница', 'племянник / племянница')),
      group: cap(adjPl(n) + 'племянники'),
      rank: 302 + n * 10,
    };
  if (diff >= 2)
    return {
      label: cap(adj(n + 1) + pra(diff - 2) + G('дедушка', 'бабушка', 'дедушка / бабушка')),
      group: cap(adjPl(n + 1) + pra(diff - 2) + 'дедушки и бабушки'),
      rank: 303 + n * 10 + diff,
    };
  return {
    label: cap(adj(n) + pra(-diff - 2) + 'внучат' + suf + ' ' + G('племянник', 'племянница', 'племянник / племянница')),
    group: cap(adjPl(n) + pra(-diff - 2) + 'внучатые племянники'),
    rank: 304 + n * 10 - diff,
  };
}

export function relationGroups(p: Person, persons: Person[], relations: Relation[]): KinGroup[] {
  const byId = new Map(persons.map(x => [x.id, x]));
  const G = (o: Person, m: string, f: string, u: string) => byGender(o.gender, m, f, u);
  const parentsOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, k: string, v: string) => {
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(v);
  };
  for (const r of relations) {
    if (r.type === 'parent') add(parentsOf, r.to, r.from);
    if (r.type === 'spouse') {
      add(spousesOf, r.from, r.to);
      add(spousesOf, r.to, r.from);
    }
  }
  const par = (id: string) => parentsOf.get(id) || [];
  const sps = (id: string) => spousesOf.get(id) || [];

  // предки с расстоянием (сам человек — 0)
  const depthCache = new Map<string, Map<string, number>>();
  const ancestors = (id: string) => {
    const cached = depthCache.get(id);
    if (cached) return cached;
    const d = new Map([[id, 0]]);
    const q = [id];
    while (q.length) {
      const x = q.shift()!;
      if (d.get(x)! >= 8) continue;
      par(x).forEach(pp => {
        if (!d.has(pp)) {
          d.set(pp, d.get(x)! + 1);
          q.push(pp);
        }
      });
    }
    depthCache.set(id, d);
    return d;
  };

  const groups = new Map<string, KinGroup>();
  const shown = new Set([p.id]);
  const put = (title: string, rank: number, item: KinItem) => {
    if (!groups.has(title)) groups.set(title, { title, rank, items: [] });
    groups.get(title)!.items.push(item);
    shown.add(item.other.id);
  };

  // 1. прямые связи
  for (const r of relations) {
    if (r.from !== p.id && r.to !== p.id) continue;
    const o = byId.get(r.from === p.id ? r.to : r.from);
    if (!o) continue;
    if (r.type === 'parent' && r.to === p.id) put('Родители', 10, { other: o, rel: r, label: G(o, 'Отец', 'Мать', 'Родитель') });
    else if (r.type === 'parent') put('Дети', 30, { other: o, rel: r, label: G(o, 'Сын', 'Дочь', 'Ребёнок') });
    else if (r.type === 'spouse') put('Супруги', 20, { other: o, rel: r, label: G(o, 'Муж', 'Жена', 'Супруг(а)') });
    else if (r.type === 'sibling') put('Братья и сёстры', 40, { other: o, rel: r, label: G(o, 'Брат', 'Сестра', 'Брат / сестра') });
    else put('Другие связи', 900, { other: o, rel: r, label: 'Другая связь' });
  }

  // 2. кровное родство по ближайшему общему предку
  const A = ancestors(p.id);
  const myParents = new Set(par(p.id));
  for (const o of persons) {
    if (shown.has(o.id)) continue;
    const B = ancestors(o.id);
    let best: { dA: number; dB: number; sum: number } | null = null;
    B.forEach((dB, c) => {
      const dA = A.get(c);
      if (dA === undefined) return;
      const sum = dA + dB;
      if (!best || sum < best.sum || (sum === best.sum && Math.abs(dA - dB) < Math.abs(best.dA - best.dB))) best = { dA, dB, sum };
    });
    const b = best as { dA: number; dB: number; sum: number } | null;
    if (!b || b.sum === 0) continue;
    const k = kinLabel(b.dA, b.dB, o.gender);
    let label = k.label;
    if (b.dA === 1 && b.dB === 1) {
      const shared = par(o.id).filter(x => myParents.has(x)).length;
      label += shared >= 2 || (shared === myParents.size && par(o.id).length === shared) ? ' · родные' : ' · по одному из родителей';
      put('Братья и сёстры', 40, { other: o, rel: null, label });
      continue;
    }
    put(k.group, k.rank, { other: o, rel: null, label });
  }

  // 3. родня по браку
  const inlaw = (o: Person | undefined, label: string) => {
    if (!o || shown.has(o.id)) return;
    put('Родня по браку', 800, { other: o, rel: null, label });
  };
  const me = p.gender;
  const siblingsOf = (id: string) => {
    const ps = new Set(par(id));
    return persons.filter(o => o.id !== id && par(o.id).some(x => ps.has(x)));
  };
  sps(p.id).forEach(sid => {
    if (!byId.get(sid)) return;
    par(sid).forEach(pid => {
      const o = byId.get(pid);
      if (!o) return;
      inlaw(
        o,
        me === 'Мужской' ? G(o, 'Тесть', 'Тёща', 'Родитель жены') : me === 'Женский' ? G(o, 'Свёкор', 'Свекровь', 'Родитель мужа') : 'Родитель супруга',
      );
    });
    siblingsOf(sid).forEach(o =>
      inlaw(
        o,
        me === 'Мужской'
          ? G(o, 'Шурин (брат жены)', 'Свояченица (сестра жены)', 'Брат / сестра жены')
          : me === 'Женский'
            ? G(o, 'Деверь (брат мужа)', 'Золовка (сестра мужа)', 'Брат / сестра мужа')
            : 'Брат / сестра супруга',
      ),
    );
    relations
      .filter(r => r.type === 'parent' && r.from === sid)
      .forEach(r => {
        const o = byId.get(r.to);
        if (o && !par(o.id).includes(p.id)) inlaw(o, G(o, 'Пасынок', 'Падчерица', 'Ребёнок супруга'));
      });
  });
  relations
    .filter(r => r.type === 'parent' && r.from === p.id)
    .forEach(r =>
      sps(r.to).forEach(id => {
        const o = byId.get(id);
        if (o) inlaw(o, G(o, 'Зять (муж дочери)', 'Невестка (жена сына)', 'Супруг(а) ребёнка'));
      }),
    );
  siblingsOf(p.id).forEach(sib =>
    sps(sib.id).forEach(id => {
      const o = byId.get(id);
      if (o) inlaw(o, G(o, 'Зять (муж сестры)', 'Невестка (жена брата)', 'Супруг(а) брата / сестры'));
    }),
  );
  par(p.id).forEach(pid =>
    sps(pid).forEach(id => {
      const o = byId.get(id);
      if (o && !myParents.has(id)) inlaw(o, G(o, 'Отчим', 'Мачеха', 'Супруг(а) родителя'));
    }),
  );
  // супруги остальной кровной родни: «Муж — Т (тётя)»
  [...groups.values()]
    .filter(g => g.rank < 800)
    .forEach(g =>
      g.items.forEach(item =>
        sps(item.other.id).forEach(id => {
          const o = byId.get(id);
          if (o) inlaw(o, `${G(o, 'Муж', 'Жена', 'Супруг(а)')} — ${fullName(item.other)} (${item.label.split(' · ')[0].toLowerCase()})`);
        }),
      ),
    );

  const byBirth = (a: KinItem, b: KinItem) => (birthYear(a.other) ?? 1e9) - (birthYear(b.other) ?? 1e9) || a.other.seq - b.other.seq;
  return [...groups.values()].sort((a, b) => a.rank - b.rank).map(g => (g.items.sort(byBirth), g));
}
