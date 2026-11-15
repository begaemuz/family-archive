/* Схема дерева для PDF: рисуется на canvas (кириллица выводится шрифтом системы) и вставляется картинкой.
   Широкое дерево режется на листы. Геометрия — та же, что на экране. */
import { AV_CY, CARD_W } from '../domain/constants';
import { buildEdges } from '../domain/edges';
import type { RowsLayout } from '../domain/layout';
import { fullName, initials, yearLine } from '../domain/people';
import type { Person, Relation } from '../domain/types';

const COLORS = {
  bg: '#ffffff',
  parent: '#6f84d8',
  spouse: '#c29550',
  sibling: '#4f9c80',
  other: '#9aa3b2',
  male: '#3d74e8',
  female: '#e0518a',
  neutral: '#8792a6',
  text: '#172033',
  muted: '#687387',
};

export interface TreeTile {
  dataUrl: string;
  /** исходный размер участка в координатах дерева */
  w: number;
  h: number;
}

function wrapText(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width <= maxW || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

/** Рисует участок дерева [x0,y0,w,h] в canvas с масштабом k. */
async function drawRegion(
  L: RowsLayout,
  persons: Person[],
  relations: Relation[],
  photos: Map<string, ImageBitmap>,
  x0: number,
  y0: number,
  w: number,
  h: number,
  k: number,
): Promise<string> {
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext('2d')!;
  g.fillStyle = COLORS.bg;
  g.fillRect(0, 0, c.width, c.height);
  g.scale(k, k);
  g.translate(-x0, -y0);

  // линии
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 2.5;
  for (const e of buildEdges(L, persons, relations, () => 200)) {
    const cls = e.cls.split(' ')[1] as keyof typeof COLORS;
    g.strokeStyle = COLORS[cls] ?? COLORS.parent;
    g.setLineDash(cls === 'other' ? [6, 6] : []);
    g.stroke(new Path2D(e.d));
  }
  g.setLineDash([]);

  // люди
  const R = 62;
  for (const p of L.visible) {
    if (p.x + CARD_W < x0 || p.x > x0 + w || p.y + 220 < y0 || p.y > y0 + h) continue;
    const cx = p.x + CARD_W / 2;
    const cy = p.y + AV_CY;
    const col = p.gender === 'Мужской' ? COLORS.male : p.gender === 'Женский' ? COLORS.female : COLORS.neutral;
    g.beginPath();
    g.arc(cx, cy, R + 4, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = col;
    g.stroke();
    const bmp = p.mainPhotoId ? photos.get(p.mainPhotoId) : undefined;
    g.save();
    g.beginPath();
    g.arc(cx, cy, R - 2, 0, Math.PI * 2);
    g.clip();
    if (bmp) {
      const s = Math.max((2 * R) / bmp.width, (2 * R) / bmp.height);
      g.drawImage(bmp, cx - (bmp.width * s) / 2, cy - (bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    } else {
      g.fillStyle = col + '22';
      g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      g.fillStyle = col;
      g.font = '700 36px system-ui, "Segoe UI", Roboto, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(initials(p), cx, cy);
    }
    g.restore();
    // подпись
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.font = '700 24px system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    g.fillStyle = COLORS.text;
    const lines = wrapText(g, fullName(p), CARD_W + 30);
    lines.forEach((ln, i) => g.fillText(ln, cx, p.y + 2 * AV_CY + 12 + i * 28));
    const yl = yearLine(p);
    if (yl) {
      g.font = '20px system-ui, "Segoe UI", Roboto, Arial, sans-serif';
      g.fillStyle = COLORS.muted;
      g.fillText(yl, cx, p.y + 2 * AV_CY + 16 + lines.length * 28);
    }
  }
  return c.toDataURL('image/jpeg', 0.88);
}

export async function treeImages(
  L: RowsLayout,
  persons: Person[],
  relations: Relation[],
  photos: Map<string, ImageBitmap>,
): Promise<{ overview: TreeTile | null; tiles: TreeTile[] }> {
  const P = L.visible;
  if (!P.length) return { overview: null, tiles: [] };
  const minX = Math.min(...P.map(p => p.x)) - 60;
  const minY = Math.min(...P.map(p => p.y)) - 60;
  const maxX = Math.max(...P.map(p => p.x)) + CARD_W + 60;
  const maxY = Math.max(...P.map(p => p.y)) + 260;
  const W = maxX - minX;
  const H = maxY - minY;

  // общий вид — всё дерево (до 3200 px по длинной стороне)
  const kO = Math.min(1, 3200 / Math.max(W, H));
  const overview = { dataUrl: await drawRegion(L, persons, relations, photos, minX, minY, W, H, kO), w: W, h: H };

  // листы крупного плана под альбомную страницу (742×450 pt ≈ 1.65:1):
  // по высоте — всё дерево (если оно не слишком высокое), по ширине — сколько нужно, равномерно с перекрытием
  const ASPECT = 1.65;
  const TH = Math.min(H, 2200);
  const TW = Math.round(TH * ASPECT);
  const tiles: TreeTile[] = [];
  if (W > TW * 1.1 || H > TH * 1.1) {
    // листы равномерно, с перекрытием — каждый человек целиком виден хотя бы на одном листе
    const cols = Math.ceil(W / (TW * 0.9));
    const rows = Math.ceil(H / (TH * 0.9));
    const stepX = cols > 1 ? (W - TW) / (cols - 1) : 0;
    const stepY = rows > 1 ? (H - TH) / (rows - 1) : 0;
    for (let j = 0; j < rows; j++) {
      const y = minY + j * stepY;
      for (let i = 0; i < cols; i++) {
        const x = minX + i * stepX;
        const any = P.some(p => p.x + CARD_W > x && p.x < x + TW && p.y + 200 > y && p.y < y + TH);
        if (!any) continue;
        tiles.push({ dataUrl: await drawRegion(L, persons, relations, photos, x, y, TW, TH, Math.min(1, 2600 / TW)), w: TW, h: TH });
      }
    }
  }
  return { overview, tiles };
}
