/* Раскладка дерева по поколениям — перенос из legacy/index.html без изменения поведения.
   Функции меняют переданные объекты людей (x, y, slot, offX, offK): вызывающий код
   передаёт рабочие копии и потом кладёт их в хранилище. */
import { buildFamilies, computeHidden, descGraph, descendantsOf, type Family } from './graph';
import { birthYear } from './people';
import type { Person, Relation } from './types';
import {
  CARD_H,
  CARD_W,
  COUSIN_GAP,
  GEN_GAP,
  GEN_YEARS,
  PGAP,
  ROW_START,
  SIB_GAP,
  SUB_H,
  TREE_GAP,
} from './constants';

export interface RowsLayout {
  hidden: Set<string>;
  visible: Person[];
  byId: Map<string, Person>;
  levelOf: Map<string, number>;
  maxLevel: number;
  /** y верхнего ряда каждого поколения */
  bandTop: number[];
  /** человек → его семейный блок (муж + жёны), отсортированный по slot */
  clusterOf: Map<string, Person[]>;
  /** id жены → сдвиг от центра блока (2+ жён или после автовыравнивания) */
  wifeOff: Map<string, number>;
  /** id мужа → ширина блока с 3+ участниками */
  wideW: Map<string, number>;
  worldW: number;
  worldH: number;
}

/** сдвиг жены от центра блока по умолчанию (slot 0 — муж, по центру) */
export const slotOffset = (i: number, n: number) => (i === 0 ? 0 : (i - 1 - (n - 2) / 2) * (CARD_W + PGAP));

export const clusterWidth = (n: number) => {
  const m = Math.max(1, n - 1);
  return m * CARD_W + (m - 1) * PGAP;
};

export function memberOff(L: Pick<RowsLayout, 'wifeOff'>, m: Person, n: number): number {
  const slot = m.slot ?? 0;
  return slot > 0 && L.wifeOff.has(m.id) ? L.wifeOff.get(m.id)! : slotOffset(slot, n);
}

function unitWidth(L: Pick<RowsLayout, 'wideW'>, ms: Person[]): number {
  return ms.length >= 3 && L.wideW.has(ms[0].id) ? L.wideW.get(ms[0].id)! : clusterWidth(ms.length);
}

export const rowY = (L: Pick<RowsLayout, 'bandTop'>, level: number) => L.bandTop[level] ?? ROW_START;

function median(a: number[]): number | null {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/* ---------------- поколения ----------------
   Уровень по связям: ребёнок = родитель + 1, супруги и братья/сёстры на одном уровне.
   Несвязанные ветки выравниваются между собой по годам рождения. */
function computeLevels(P: Person[], relations: Relation[]): { levelOf: Map<string, number>; maxLevel: number } {
  const byId = new Map(P.map(p => [p.id, p]));
  const adj = new Map<string, [string, number][]>(P.map(p => [p.id, []]));
  for (const r of relations) {
    const a = r.from;
    const b = r.to;
    if (!adj.has(a) || !adj.has(b) || a === b) continue;
    let d: number;
    if (r.type === 'parent') d = 1;
    else if (r.type === 'spouse' || r.type === 'sibling') d = 0;
    else continue;
    adj.get(a)!.push([b, d]);
    adj.get(b)!.push([a, -d]);
  }

  const local = new Map<string, number>();
  const comps: string[][] = [];
  for (const s of P) {
    if (local.has(s.id)) continue;
    local.set(s.id, 0);
    const ids = [s.id];
    for (let i = 0; i < ids.length; i++) {
      for (const [n, d] of adj.get(ids[i])!) {
        if (!local.has(n)) {
          local.set(n, local.get(ids[i])! + d);
          ids.push(n);
        }
      }
    }
    const min = Math.min(...ids.map(id => local.get(id)!));
    ids.forEach(id => local.set(id, local.get(id)! - min));
    comps.push(ids);
  }
  comps.sort((a, b) => b.length - a.length);

  let base: number | null = null;
  const final = new Map<string, number>();
  for (const ids of comps) {
    const pts = ids
      .map(id => [birthYear(byId.get(id)!), local.get(id)!] as [number | null, number])
      .filter((x): x is [number, number] => x[0] !== null);
    let off = 0;
    if (pts.length) {
      if (base === null) base = median(pts.map(([y, l]) => y - l * GEN_YEARS));
      else off = Math.round(median(pts.map(([y, l]) => (y - base!) / GEN_YEARS - l))!);
    }
    ids.forEach(id => final.set(id, local.get(id)! + off));
  }

  const min = P.length ? Math.min(...final.values()) : 0;
  const levelOf = new Map<string, number>();
  P.forEach(p => levelOf.set(p.id, final.get(p.id)! - min));
  const maxLevel = P.length ? Math.max(...levelOf.values()) : 0;
  return { levelOf, maxLevel };
}

/* Семейные блоки: супруги одного поколения стоят в колонку (муж сверху). Порядок хранится в p.slot. */
function buildClusters(
  P: Person[],
  relations: Relation[],
  levelOf: Map<string, number>,
  sorter?: (ms: Person[]) => Person[],
): Person[][] {
  const byId = new Map(P.map(p => [p.id, p]));
  const par = new Map(P.map(p => [p.id, p.id]));
  const find = (i: string): string => {
    const p = par.get(i)!;
    if (p === i) return i;
    const r = find(p);
    par.set(i, r);
    return r;
  };
  for (const r of relations) {
    const a = r.from;
    const b = r.to;
    if (r.type === 'spouse' && byId.has(a) && byId.has(b) && a !== b && levelOf.get(a) === levelOf.get(b)) {
      par.set(find(a), find(b));
    }
  }
  const cl = new Map<string, Person[]>();
  for (const p of P) {
    const k = find(p.id);
    if (!cl.has(k)) cl.set(k, []);
    cl.get(k)!.push(p);
  }
  const rank = (p: Person) => p.slot ?? (p.gender === 'Мужской' ? -1 : p.gender === 'Женский' ? 1e6 : 5e5);
  return [...cl.values()].map(ms => {
    const s = sorter ? sorter(ms) : ms.slice().sort((a, b) => rank(a) - rank(b) || a.seq - b.seq);
    s.forEach((m, i) => {
      m.slot = i;
    });
    return s;
  });
}

/* Отпечаток структуры дерева: отступы жён от автовыравнивания действуют, пока он не изменился. */
function structKey(P: Person[], relations: Relation[]): string {
  const ids = P.map(p => p.id).sort().join(',');
  const rs = relations.map(r => r.type[0] + r.from + '>' + r.to).sort().join(',');
  const str = ids + '|' + rs;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return String(h);
}

/* Несколько жён под одним мужем: расстояние между жёнами зависит от того, сколько места
   нужно их детям (и всему поддереву ниже). */
function computeWifeOffsets(L: RowsLayout, cl: Person[][], fams: Family[], key: string) {
  L.wifeOff = new Map();
  L.wideW = new Map();
  const lvl = (id: string) => L.levelOf.get(id)!;
  const cOf = new Map<string, Person[]>();
  cl.forEach(ms => ms.forEach(m => cOf.set(m.id, ms)));
  const famsByParent = new Map<string, Family[]>();
  fams.forEach(f =>
    f.parents.forEach(a => {
      if (!famsByParent.has(a)) famsByParent.set(a, []);
      famsByParent.get(a)!.push(f);
    }),
  );
  const childUnits = (fs: Family[]) => {
    const us: Person[][] = [];
    fs.forEach(f =>
      f.children.forEach(c => {
        const cu = cOf.get(c);
        if (cu && !us.includes(cu) && f.parents.every(a => lvl(a) < lvl(c))) us.push(cu);
      }),
    );
    return us;
  };
  const memo = new Map<Person[], number | null>();
  const blockW = (us: Person[][]): number => us.reduce((s, u) => s + need(u), 0) + Math.max(0, us.length - 1) * SIB_GAP;

  function need(ms: Person[]): number {
    if (memo.has(ms)) return memo.get(ms) ?? CARD_W; // null — защита от циклов
    memo.set(ms, null);
    let own: number;
    const lower = ms.slice(1);
    if (lower.length && lower.every(w => w.offK === key && Number.isFinite(w.offX))) {
      // раскладка от автовыравнивания ещё актуальна
      lower.forEach(w => L.wifeOff.set(w.id, w.offX!));
      const ext = Math.max(...lower.map(w => Math.abs(w.offX!)));
      own = 2 * ext + CARD_W;
      if (ms.length >= 3) L.wideW.set(ms[0].id, own);
    } else if (ms.length >= 3) {
      const wives = ms.slice(1); // [муж, жёны слева направо]
      const kidsOf = wives.map(w => childUnits(famsByParent.get(w.id) || []));
      const ws = kidsOf.map(us => Math.max(CARD_W, blockW(us)));
      const gapAfter = (i: number) => (kidsOf[i].length && kidsOf[i + 1].length ? SIB_GAP : PGAP);
      own = ws.reduce((s, w) => s + w, 0);
      for (let i = 0; i < wives.length - 1; i++) own += gapAfter(i);
      let x = -own / 2;
      wives.forEach((w, i) => {
        L.wifeOff.set(w.id, x + ws[i] / 2);
        x += ws[i] + (i < wives.length - 1 ? gapAfter(i) : 0);
      });
      L.wideW.set(ms[0].id, own);
    } else own = unitWidth(L, ms);
    const r = Math.max(own, blockW(childUnits(ms.flatMap(m => famsByParent.get(m.id) || []))));
    memo.set(ms, r);
    return r;
  }
  cl.forEach(need);
}

function emptyLayout(): RowsLayout {
  return {
    hidden: new Set(),
    visible: [],
    byId: new Map(),
    levelOf: new Map(),
    maxLevel: 0,
    bandTop: [],
    clusterOf: new Map(),
    wifeOff: new Map(),
    wideW: new Map(),
    worldW: 6000,
    worldH: 4000,
  };
}

function seqLookup(persons: Person[]) {
  const m = new Map(persons.map(p => [p.id, p.seq]));
  return (id: string) => m.get(id) ?? 0;
}

/** y каждого человека = поколение + место в колонке. x не трогается. */
export function layoutRows(persons: Person[], relations: Relation[]): RowsLayout {
  const L = emptyLayout();
  L.hidden = computeHidden(persons, relations);
  L.visible = persons.filter(p => !L.hidden.has(p.id));
  L.byId = new Map(L.visible.map(p => [p.id, p]));
  const lv = computeLevels(L.visible, relations);
  L.levelOf = lv.levelOf;
  L.maxLevel = lv.maxLevel;
  const cl = buildClusters(L.visible, relations, L.levelOf);
  const fams = buildFamilies(new Set(L.byId.keys()), relations, seqLookup(persons));
  computeWifeOffsets(L, cl, fams, structKey(L.visible, relations));

  const rows = new Array(L.maxLevel + 1).fill(1);
  cl.forEach(ms => {
    if (ms.length > 1) rows[L.levelOf.get(ms[0].id)!] = 2;
  });
  let y = ROW_START;
  for (let lev = 0; lev <= L.maxLevel; lev++) {
    L.bandTop[lev] = y;
    y += (rows[lev] - 1) * SUB_H + CARD_H + GEN_GAP;
  }
  cl.forEach(ms =>
    ms.forEach(m => {
      m.y = L.bandTop[L.levelOf.get(m.id)!] + ((m.slot ?? 0) > 0 ? SUB_H : 0);
      L.clusterOf.set(m.id, ms);
    }),
  );
  L.worldW = Math.max(6000, ...L.visible.map(p => p.x + 900));
  L.worldH = Math.max(4000, rowY(L, L.maxLevel) + 1200);
  return L;
}

/* ================= Аккуратное дерево (автовыравнивание) =================
   Каждый блок (муж + жёны под ним, или один человек) — узел дерева. Поддерево раскладывается
   снизу вверх: дети каждой жены — плотным блоком, жена по центру над своими детьми, муж — по
   центру над рядом жён. Родня жён «со стороны» — отдельные деревья рядом. */

type Contour = Map<number, [number, number]>;

interface Unit {
  id: number;
  level: number;
  x: number;
  members: Person[];
  pf: Family | null;
  pm: Person;
  parent: Unit | null;
  kids: [Unit, number][];
  C?: Contour;
}

export interface AutoLayoutOptions {
  /** сохранить текущий порядок в блоках супругов (при сворачивании/разворачивании) */
  keepOrder?: boolean;
}

export function autoLayout(persons: Person[], relations: Relation[], opts: AutoLayoutOptions = {}): RowsLayout {
  const L = layoutRows(persons, relations);
  const P = L.visible;
  if (!P.length) return L;

  const byId = L.byId;
  const lvl = (id: string) => L.levelOf.get(id)!;
  const seqOf = seqLookup(persons);
  const fams = buildFamilies(new Set(byId.keys()), relations, seqOf).filter(f =>
    f.parents.every(a => f.children.every(c => lvl(a) < lvl(c))),
  );
  const parentsOf = new Map<string, string[]>(P.map(p => [p.id, []]));
  fams.forEach(f => f.children.forEach(c => f.parents.forEach(a => parentsOf.get(c)!.push(a))));

  // сверху — тот, у кого больше партнёров, при равенстве — мужчина; жёны: сначала с общими детьми
  const gRank = (p: Person) => (p.gender === 'Мужской' ? 0 : p.gender === 'Женский' ? 2 : 1);
  function orderMembers(ms: Person[]): Person[] {
    if (ms.length < 2) return ms;
    const ids = new Set(ms.map(m => m.id));
    const deg = new Map(ms.map(m => [m.id, 0]));
    const fk = new Map(ms.map(m => [m.id, 0]));
    for (const r of relations) {
      if (r.type === 'spouse' && ids.has(r.from) && ids.has(r.to)) {
        deg.set(r.from, deg.get(r.from)! + 1);
        deg.set(r.to, deg.get(r.to)! + 1);
      }
    }
    fams.forEach(f => {
      if (f.parents.length === 2 && f.parents.every(a => ids.has(a))) f.parents.forEach(a => fk.set(a, fk.get(a)! + 1));
    });
    const hub = ms.slice().sort((a, b) => deg.get(b.id)! - deg.get(a.id)! || gRank(a) - gRank(b) || a.seq - b.seq)[0];
    const rest = ms
      .filter(m => m !== hub)
      .sort((a, b) => fk.get(b.id)! - fk.get(a.id)! || gRank(a) - gRank(b) || a.seq - b.seq);
    return [hub, ...rest];
  }

  const units: Unit[] = [];
  const unitOf = new Map<string, Unit>();
  const uClusters = buildClusters(P, relations, L.levelOf, opts.keepOrder ? undefined : orderMembers);
  const KEY = structKey(P, relations);
  computeWifeOffsets(L, uClusters, buildFamilies(new Set(byId.keys()), relations, seqOf), KEY);
  uClusters.forEach(ms => {
    const u: Unit = { id: units.length, level: lvl(ms[0].id), x: 0, members: ms, pf: null, pm: ms[0], parent: null, kids: [] };
    units.push(u);
    ms.forEach(m => unitOf.set(m.id, u));
  });

  const childFams = new Map<string, Family[]>();
  fams.forEach(f =>
    f.children.forEach(c => {
      if (!childFams.has(c)) childFams.set(c, []);
      childFams.get(c)!.push(f);
    }),
  );

  const cShift = (c: Contour, dx: number): Contour => {
    const o: Contour = new Map();
    c.forEach(([l, r], lev) => o.set(lev, [l + dx, r + dx]));
    return o;
  };
  const cMerge = (a: Contour, b: Contour): Contour => {
    const o: Contour = new Map(a);
    b.forEach(([l, r], lev) => {
      const e = o.get(lev);
      o.set(lev, e ? [Math.min(e[0], l), Math.max(e[1], r)] : [l, r]);
    });
    return o;
  };
  // минимальный сдвиг B, чтобы B стоял справа от A с зазором gapAt(L) на каждом общем поколении
  const sep = (A: Contour, B: Contour, gapAt: (lev: number) => number) => {
    let s = -Infinity;
    B.forEach(([l], lev) => {
      const e = A.get(lev);
      if (e) s = Math.max(s, e[1] + gapAt(lev) - l);
    });
    return s;
  };

  // 1. основная семья и родительский блок
  const famsOfUnit: Family[][] = units.map(() => []);
  fams.forEach(f => famsOfUnit[unitOf.get(f.parents[0])!.id].push(f));
  const depthMemo = new Map<string, number | null>();
  const ancDepth = (id: string): number => {
    if (depthMemo.has(id)) return depthMemo.get(id) ?? 0;
    depthMemo.set(id, null);
    const fs = childFams.get(id) || [];
    const d = fs.length ? 1 + Math.max(...fs.flatMap(f => f.parents.map(ancDepth))) : 0;
    depthMemo.set(id, d);
    return d;
  };

  units.forEach(u => {
    // пара остаётся в той ветке, где у супруга больше поколений предков (при равенстве — ветка мужа)
    let best: Person | null = null;
    for (const m of u.members) {
      const fs = childFams.get(m.id) || [];
      if (fs.length && (!best || ancDepth(m.id) > ancDepth(best.id))) best = m;
    }
    if (best) {
      const fs = childFams.get(best.id)!;
      u.pm = best;
      u.pf = fs.find(f => f.parents.length === 2) || fs[0];
    }
    if (u.pf) {
      const pu = unitOf.get(u.pf.parents[0])!;
      if (pu !== u && pu.level < u.level) u.parent = pu;
      else u.pf = null;
    }
  });

  const byBirth = (a: Unit, b: Unit) =>
    (birthYear(a.pm) ?? 1e9) - (birthYear(b.pm) ?? 1e9) || a.pm.seq - b.pm.seq;

  // 2. раскладка поддерева; контур относительно центра блока (позиции мужа)
  function layout(u: Unit): Contour {
    if (u.C) return u.C;
    const hub = u.members[0];
    const wives = u.members.slice(1);
    const L0 = u.level;
    const single = u.members.length === 1;

    const anchors = single ? [hub] : [...wives, hub];
    const groupKids = new Map<string, Unit[]>(anchors.map(a => [a.id, []]));
    famsOfUnit[u.id].forEach(f => {
      const w = f.parents.map(id => byId.get(id)!).find(p => (p.slot ?? 0) > 0 && unitOf.get(p.id) === u);
      const a = w || hub;
      f.children.forEach(c => {
        const cu = unitOf.get(c)!;
        const list = groupKids.get(a.id)!;
        if (cu.parent === u && cu.pf === f && !list.includes(cu)) list.push(cu);
      });
    });

    interface Group {
      a: Person;
      kids: Unit[];
      pos: number[];
      C: Contour;
      x: number;
    }
    const groups: Group[] = [];
    anchors.forEach(a => {
      const kids = groupKids.get(a.id)!.sort(byBirth);
      const hasCard = a !== hub || single;
      if (!kids.length && !hasCard) return;
      let C: Contour = new Map();
      let pos: number[] = [];
      const cens: number[] = [];
      kids.forEach((cu, i) => {
        const Ck = layout(cu);
        let x = 0;
        if (i) {
          const s = sep(C, Ck, lev => (lev === cu.level ? SIB_GAP : COUSIN_GAP));
          x = Number.isFinite(s) ? s : pos[i - 1] + CARD_W + SIB_GAP;
        }
        pos.push(x);
        C = cMerge(C, cShift(Ck, x));
        cens.push(x + memberOff(L, cu.pm, cu.members.length));
      });
      const mid = kids.length ? (Math.min(...cens) + Math.max(...cens)) / 2 : 0;
      C = cShift(C, -mid);
      pos = pos.map(p => p - mid);
      if (hasCard) C = cMerge(C, new Map([[L0, [-CARD_W / 2, CARD_W / 2]]]));
      groups.push({ a, kids, pos, C, x: 0 });
    });

    let T: Contour = new Map();
    groups.forEach((g, i) => {
      if (i) {
        const s = sep(T, g.C, lev => (lev === L0 ? PGAP : lev === L0 + 1 ? SIB_GAP : COUSIN_GAP));
        g.x = Math.max(Number.isFinite(s) ? s : -Infinity, groups[i - 1].x + (g.a !== hub ? CARD_W + PGAP : 1));
      }
      T = cMerge(T, cShift(g.C, g.x));
    });

    const wifeGroups = groups.filter(g => g.a !== hub);
    const hubX = single
      ? groups[0]
        ? groups[0].x
        : 0
      : wifeGroups.length
        ? (Math.min(...wifeGroups.map(g => g.x)) + Math.max(...wifeGroups.map(g => g.x))) / 2
        : 0;

    const U = cShift(T, -hubX);
    const own = U.get(L0) || [-CARD_W / 2, CARD_W / 2];
    U.set(L0, [Math.min(own[0], -CARD_W / 2), Math.max(own[1], CARD_W / 2)]);

    wives.forEach(w => {
      const g = groups.find(gr => gr.a === w);
      const off = (g ? g.x : 0) - hubX;
      w.offX = Math.round(off);
      w.offK = KEY;
      L.wifeOff.set(w.id, w.offX);
    });
    if (u.members.length >= 3) L.wideW.set(hub.id, U.get(L0)![1] - U.get(L0)![0]);

    groups.forEach(g => g.kids.forEach((cu, i) => u.kids.push([cu, g.x + g.pos[i] - hubX])));
    u.C = U;
    return U;
  }

  // 3. деревья: главное (самое большое) в центре, родня со стороны — рядом
  const roots = units.filter(u => !u.parent);
  roots.forEach(layout);
  const rootOf = new Map<Unit, Unit>();
  const sizeOf = new Map<Unit, number>();
  roots.forEach(r => {
    const st = [r];
    let n = 0;
    while (st.length) {
      const u = st.pop()!;
      rootOf.set(u, r);
      n++;
      u.kids.forEach(([c]) => st.push(c));
    }
    sizeOf.set(r, n);
  });
  roots.sort((a, b) => sizeOf.get(b)! - sizeOf.get(a)! || a.level - b.level || a.id - b.id);

  const setAbs = (u: Unit, x: number) => {
    u.x = x;
    u.kids.forEach(([cu, r]) => setAbs(cu, x + r));
  };

  const links: { cu: Unit; m: Person; pu: Unit }[] = [];
  units.forEach(u =>
    u.members.forEach(m =>
      (childFams.get(m.id) || []).forEach(f => {
        const pu = unitOf.get(f.parents[0])!;
        if (rootOf.get(pu) !== rootOf.get(u)) links.push({ cu: u, m, pu });
      }),
    ),
  );

  const placed = new Set<Unit>();
  let CC: Contour | null = null;
  const place = (r: Unit, x: number) => {
    setAbs(r, x);
    placed.add(r);
    CC = CC ? cMerge(CC, cShift(r.C!, x)) : cShift(r.C!, x);
  };
  if (roots.length) place(roots[0], 0);

  while (placed.size < roots.length) {
    let link: { r: Unit; unit: Unit; target: number; side: number; level: number } | null = null;
    for (const k of links) {
      const rc = rootOf.get(k.cu)!;
      const rp = rootOf.get(k.pu)!;
      if (placed.has(rc) && !placed.has(rp)) {
        const off = memberOff(L, k.m, k.cu.members.length);
        link = { r: rp, unit: k.pu, target: k.cu.x + off, side: off < -1 ? -1 : off > 1 ? 1 : 0, level: k.cu.level };
        break;
      }
      if (placed.has(rp) && !placed.has(rc)) {
        link = { r: rc, unit: k.cu, target: k.pu.x, side: 0, level: k.pu.level };
        break;
      }
    }
    const r = link ? link.r : roots.find(x => !placed.has(x))!;
    setAbs(r, 0); // временно, чтобы узнать положение связанного блока внутри дерева
    const cc: Contour = CC!;
    let right = true;
    if (link) {
      if (link.side) right = link.side > 0;
      else {
        const e = cc.get(link.level);
        right = !e || link.target >= (e[0] + e[1]) / 2;
      }
    }
    const ideal = link ? link.target - link.unit.x : null;
    let x: number;
    if (right) {
      const s = sep(cc, r.C!, () => TREE_GAP);
      x = Number.isFinite(s)
        ? ideal === null
          ? s
          : Math.max(s, ideal)
        : ideal ?? Math.max(...[...cc.values()].map(e => e[1])) + TREE_GAP - Math.min(...[...r.C!.values()].map(e => e[0]));
    } else {
      const s = sep(r.C!, cc, () => TREE_GAP);
      x = Number.isFinite(s)
        ? ideal === null
          ? -s
          : Math.min(-s, ideal)
        : ideal ?? Math.min(...[...cc.values()].map(e => e[0])) - TREE_GAP - Math.max(...[...r.C!.values()].map(e => e[1]));
    }
    place(r, x);
  }

  const xsAll: number[] = [];
  units.forEach(u => u.members.forEach(m => xsAll.push(u.x + memberOff(L, m, u.members.length))));
  const left = Math.min(...xsAll) - CARD_W / 2;
  units.forEach(u =>
    u.members.forEach(m => {
      m.x = Math.round(u.x + memberOff(L, m, u.members.length) - CARD_W / 2 - left + 140);
    }),
  );

  // итоговые ряды + скрытые (свёрнутые) — в точку свернувшего
  const final = layoutRows(persons, relations);
  const g = descGraph(relations);
  const byIdAll = new Map(persons.map(p => [p.id, p]));
  persons
    .filter(p => p.collapsed)
    .forEach(r =>
      descendantsOf(r.id, g).forEach(id => {
        const h = byIdAll.get(id);
        if (h) {
          h.x = r.x;
          h.y = r.y;
        }
      }),
    );
  return final;
}

/** Ближайшее свободное место в ряду (чтобы новый человек не лёг поверх другого). */
export function freeX(L: RowsLayout, person: Person, x: number): number {
  const row = L.visible.filter(o => o.id !== person.id && o.y === person.y);
  const ok = (v: number) => v >= 0 && row.every(o => Math.abs(o.x - v) >= CARD_W + 28);
  if (ok(x)) return x;
  for (let k = 1; k < 200; k++) {
    if (ok(x + k * 32)) return x + k * 32;
    if (ok(x - k * 32)) return x - k * 32;
  }
  return x;
}

/** Ровно как раньше: линии поколений идут посередине зазора между поколениями. */
export function guideLines(L: RowsLayout): number[] {
  const ys: number[] = [];
  for (let lev = 1; lev <= L.maxLevel; lev++) ys.push(rowY(L, lev) - GEN_GAP / 2);
  return ys;
}
