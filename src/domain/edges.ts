/* Линии между людьми — перенос renderEdges из legacy/index.html.
   Возвращает готовые SVG-пути; отрисовка — в компоненте Edges. */
import { buildFamilies } from './graph';
import { memberOff, type RowsLayout } from './layout';
import type { Person, Relation } from './types';
import { AV_CY, CARD_H, CARD_W, SUB_H } from './constants';

export interface EdgePath {
  key: string;
  d: string;
  cls: string;
}

interface VSeg {
  v: number;
  y1: number;
  y2: number;
  fam: number | string;
}
interface HSeg {
  y: number;
  x1: number;
  x2: number;
  fam: number;
}
type Seg = { v: number; y1: number; y2: number } | { h: number; x1: number; x2: number };

const HOP = 7; // радиус «мостика» на пересечении линий

export function buildEdges(
  L: RowsLayout,
  persons: Person[],
  relations: Relation[],
  heightOf: (id: string) => number | undefined,
): EdgePath[] {
  const out: EdgePath[] = [];
  const byId = L.byId;
  const cx = (p: Person) => p.x + CARD_W / 2;
  const bottom = (p: Person) => p.y + (heightOf(p.id) || CARD_H);
  const isHub = (p: Person) => p.slot === 0 && (L.clusterOf.get(p.id) || []).length > 1;

  /* Ребёнок в нижнем ряду пары (жена под мужем): прямая вертикаль ушла бы под карточку супруга,
     поэтому обходим её сбоку и входим в аватар сбоку. */
  const obstacles: VSeg[] = [];
  const childEntry = (c: Person, fromX: number): { x: number; segs: (busY: number) => Seg[] } => {
    const cl = L.clusterOf.get(c.id) || [];
    const hub = (c.slot ?? 0) > 0 && cl.length > 1 ? cl.find(m => m.slot === 0) : null;
    if (hub && byId.has(hub.id) && Math.abs(cx(hub) - cx(c)) < CARD_W / 2 + 12) {
      const side = fromX > cx(c) ? 1 : -1;
      const x = cx(c) + side * (CARD_W / 2 + 12);
      const ay = c.y + AV_CY;
      return {
        x,
        segs: busY => [
          { v: x, y1: busY, y2: ay },
          { h: ay, x1: Math.min(x, cx(c) + side * 68), x2: Math.max(x, cx(c) + side * 68) },
        ],
      };
    }
    return { x: cx(c), segs: busY => [{ v: cx(c), y1: busY, y2: c.y }] };
  };

  for (const r of relations) {
    const a = byId.get(r.from);
    const b = byId.get(r.to);
    if (!a || !b) continue;
    if (r.type === 'spouse') {
      const [u, l] = a.y <= b.y ? [a, b] : [b, a];
      if (l.y - u.y > 20) {
        // муж сверху, жена ниже: «скобка» вниз
        const my = (bottom(u) + l.y) / 2;
        out.push({ key: 'sp' + r.id, d: `M ${cx(u)} ${bottom(u)} V ${my} H ${cx(l)} V ${l.y}`, cls: 'edge spouse' });
        obstacles.push({ v: cx(u), y1: bottom(u), y2: my, fam: 'sp' + r.id }, { v: cx(l), y1: my, y2: l.y, fam: 'sp' + r.id });
      } else {
        out.push({ key: 'sp' + r.id, d: `M ${cx(a)} ${a.y + AV_CY} L ${cx(b)} ${b.y + AV_CY}`, cls: 'edge spouse' });
      }
    } else if (r.type === 'sibling' || r.type === 'other') {
      const h = Math.min(70, 26 + Math.abs(cx(a) - cx(b)) / 8);
      out.push({
        key: r.type + r.id,
        d: `M ${cx(a)} ${a.y} C ${cx(a)} ${a.y - h}, ${cx(b)} ${b.y - h}, ${cx(b)} ${b.y}`,
        cls: 'edge ' + r.type,
      });
    }
  }

  // дети: вниз из нижней карточки (жены); у одинокого «мужа» с жёнами — сбоку, мимо ряда жён
  interface Fam {
    cs: Person[];
    ax: number;
    ay: number;
    dropX: number;
    lo: number;
    hi: number;
    x1: number;
    x2: number;
    row: number;
    entries: { x: number; segs: (busY: number) => Seg[] }[];
    lane?: number;
    busY?: number;
  }
  const seqOf = (id: string) => byId.get(id)?.seq ?? persons.find(p => p.id === id)?.seq ?? 0;
  const fams: Fam[] = [];
  for (const f of buildFamilies(new Set(byId.keys()), relations, seqOf)) {
    const ps = f.parents.map(id => byId.get(id)).filter((p): p is Person => !!p);
    const cs = f.children.map(id => byId.get(id)).filter((p): p is Person => !!p);
    if (!ps.length || !cs.length) continue;
    let ax: number, ay: number, dropX: number, lo: number;
    if (ps.length === 1 && !isHub(ps[0])) {
      ax = dropX = cx(ps[0]);
      ay = lo = bottom(ps[0]);
    } else if (ps.length === 1) {
      const p = ps[0];
      ax = cx(p);
      ay = (bottom(p) + p.y + SUB_H) / 2;
      dropX = ax + 112;
      lo = bottom(p) + SUB_H;
    } else {
      const low = ps.filter(p => (p.slot ?? 0) > 0);
      const pool = low.length ? low : ps;
      ax = dropX = pool.reduce((s, p) => s + cx(p), 0) / pool.length;
      ay = lo = Math.max(...pool.map(bottom));
    }
    const entries = cs.map(c => childEntry(c, dropX));
    const xs = [dropX, ...entries.map(e => e.x)];
    const fam: Fam = {
      cs,
      ax,
      ay,
      dropX,
      lo,
      entries,
      // верх ряда детей: для жены из нижнего ряда — верх её блока, иначе шина прошла бы сквозь мужа
      hi: Math.min(...cs.map(c => L.bandTop[L.levelOf.get(c.id)!] ?? c.y)),
      x1: Math.min(...xs),
      x2: Math.max(...xs),
      row: L.bandTop[L.levelOf.get(ps[0].id)!] ?? 0,
    };
    // семьи из одной точки (дети пары и дети только матери) — одной шиной
    const same = fams.find(
      g => g.row === fam.row && Math.abs(g.ax - fam.ax) < 1 && Math.abs(g.ay - fam.ay) < 1 && Math.abs(g.dropX - fam.dropX) < 1,
    );
    if (!same) fams.push(fam);
    else {
      same.cs.push(...fam.cs);
      same.entries.push(...fam.entries);
      same.lo = Math.max(same.lo, fam.lo);
      same.hi = Math.min(same.hi, fam.hi);
      same.x1 = Math.min(same.x1, fam.x1);
      same.x2 = Math.max(same.x2, fam.x2);
    }
  }

  // полосы шин в одном ряду, чтобы шины разных семей не накладывались
  const rows = new Map<number, Fam[]>();
  fams.forEach(f => {
    if (!rows.has(f.row)) rows.set(f.row, []);
    rows.get(f.row)!.push(f);
  });
  rows.forEach(list => {
    list.sort((a, b) => a.x1 - b.x1);
    const ends: number[] = [];
    list.forEach(f => {
      let lane = ends.findIndex(e => e < f.x1 - 14);
      if (lane < 0) {
        lane = ends.length;
        ends.push(0);
      }
      ends[lane] = f.x2;
      f.lane = lane;
    });
    const lo = Math.max(...list.map(f => f.lo));
    const hi = Math.min(...list.map(f => f.hi));
    list.forEach(f => {
      f.busY = hi - lo > 30 ? lo + (f.lane! + 1) * (hi - lo) / (ends.length + 1) : (lo + hi) / 2;
    });
  });

  // отрезки; на пересечении горизонтали одной семьи с вертикалью другой — «мостик»
  const H: HSeg[] = [];
  const V: VSeg[] = [...obstacles];
  fams.forEach((f, fi) => {
    const pushH = (y: number, a: number, b: number) => {
      if (Math.abs(b - a) > 0.5) H.push({ y, x1: Math.min(a, b), x2: Math.max(a, b), fam: fi });
    };
    pushH(f.ay, f.ax, f.dropX);
    V.push({ v: f.dropX, y1: f.ay, y2: f.busY!, fam: fi });
    pushH(f.busY!, f.x1, f.x2);
    f.entries.forEach(en =>
      en.segs(f.busY!).forEach(sg => {
        if ('v' in sg) V.push({ ...sg, fam: fi });
        else pushH(sg.h, sg.x1, sg.x2);
      }),
    );
  });

  let d = '';
  V.forEach(sg => {
    if (typeof sg.fam === 'number') d += ` M ${sg.v} ${sg.y1} V ${sg.y2}`;
  });
  H.forEach(h => {
    const xs = V.filter(
      v =>
        v.fam !== h.fam &&
        v.v > h.x1 + HOP + 1 &&
        v.v < h.x2 - HOP - 1 &&
        Math.min(v.y1, v.y2) < h.y - 2 &&
        Math.max(v.y1, v.y2) > h.y + 2,
    )
      .map(v => v.v)
      .sort((a, b) => a - b)
      .filter((x, i, arr) => !i || x - arr[i - 1] > HOP * 2 + 2);
    d += ` M ${h.x1} ${h.y}`;
    xs.forEach(x => {
      d += ` H ${x - HOP} A ${HOP} ${HOP} 0 0 1 ${x + HOP} ${h.y}`;
    });
    d += ` H ${h.x2}`;
  });
  if (d) out.push({ key: 'parents', d, cls: 'edge parent' });
  return out;
}

/** Предпросмотр связи при протягивании «＋»: над человеком — в центр его круга. */
export function linkPreviewPath(from: Person, target: Person | null, x: number, y: number): string {
  const cx = (p: Person) => p.x + CARD_W / 2;
  const tx = target ? cx(target) : x;
  const ty = target ? target.y + AV_CY : y;
  return `M ${cx(from)} ${from.y + AV_CY} L ${tx} ${ty}`;
}

/** Метки линейки поколений: годы рождения или оценка «≈ год». */
export function rulerItems(L: RowsLayout, birthYearOf: (p: Person) => number | null) {
  if (!L.visible.length) return [];
  const years: number[][] = Array.from({ length: L.maxLevel + 1 }, () => []);
  L.visible.forEach(p => {
    const y = birthYearOf(p);
    if (y !== null) years[L.levelOf.get(p.id)!].push(y);
  });
  const known = years.map((a, i) => (a.length ? i : -1)).filter(i => i >= 0);
  const items: { level: number; text: string; est: boolean; y: number }[] = [];
  for (let lev = 0; lev <= L.maxLevel; lev++) {
    let text: string;
    let est = false;
    if (years[lev].length) {
      const mn = Math.min(...years[lev]);
      const mx = Math.max(...years[lev]);
      text = mn === mx ? String(mn) : mn + '–' + mx;
    } else if (known.length) {
      const near = known.reduce((b, i) => (Math.abs(i - lev) < Math.abs(b - lev) ? i : b), known[0]);
      const avg = Math.round(years[near].reduce((s, v) => s + v, 0) / years[near].length);
      text = '≈ ' + (avg + (lev - near) * 28);
      est = true;
    } else {
      text = '—';
      est = true;
    }
    items.push({ level: lev, text, est, y: (L.bandTop[lev] ?? 260) + AV_CY });
  }
  return items;
}

export { memberOff };
