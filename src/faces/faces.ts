/* Распознавание лиц — целиком на устройстве: фото никуда не отправляются.
   Модели (~12 МБ) подгружаются при первом использовании из ./models и дальше берутся из кэша (работает офлайн).
   Кого система «знает»: человека по фото профиля, по фото в его альбоме, где одно лицо и никто не отмечен,
   и по лицам, которые вы подтвердили кнопкой «Да». Найденные лица («отпечатки» и рамки) сохраняются
   в самом архиве — он зашифрован — поэтому после перезапуска ничего не ищется заново и узнавание не забывается. */
import { FACES_VERSION } from '../domain/normalize';
import type { ArchiveData, MediaFace, MediaItem } from '../domain/types';
import { access } from '../hooks/useAccess';
import { useArchive } from '../store/archiveStore';
import { mediaRegistry } from '../store/mediaRegistry';

type FaceApi = typeof import('@vladmandic/face-api');

export interface Face {
  /** рамка в долях от размеров фото (0…1) — для наложения поверх картинки любого размера */
  box: { x: number; y: number; w: number; h: number };
  descriptor: Float32Array;
}

export interface FaceMatch {
  face: Face;
  /** уже на фото: владелец альбома или отмеченный */
  knownId: string | null;
  /** предложение «Кажется, это …?» */
  suggestId: string | null;
  distance: number;
  /** кем это лицо точно не является (ваши исправления) */
  not?: string[];
}

/** порог похожести: меньше — строже. 0.5 — мало ложных совпадений на семейных фото */
const THRESHOLD = 0.5;
/** сколько фото на человека смотреть, чтобы его «запомнить» */
const SAMPLES_PER_PERSON = 4;
/** сколько подтверждённых лиц человека брать для сравнения */
const CONFIRMED_PER_PERSON = 12;

let api: Promise<FaceApi> | null = null;
let loaded = false;

/** в автономном однофайловом архиве распознавания нет (модели с диска не загрузить) */
export const facesAvailable = import.meta.env.MODE !== 'single';
export const facesReady = () => loaded;

type Tf = { setBackend(b: string): Promise<boolean>; ready(): Promise<void>; getBackend(): string };

/** Загрузить движок и модели (один раз). */
export function loadFaces(): Promise<FaceApi> {
  api ??= (async () => {
    const faceapi = await import('@vladmandic/face-api');
    // в типах пакета tf описан не полностью — нужные методы объявляем сами
    const tf = faceapi.tf as unknown as Tf;
    if (!(await tf.setBackend('webgl').catch(() => false))) await tf.setBackend('cpu');
    await tf.ready();
    const base = new URL('models', document.baseURI).href;
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(base),
      faceapi.nets.faceLandmark68Net.loadFromUri(base),
      faceapi.nets.faceRecognitionNet.loadFromUri(base),
    ]);
    loaded = true;
    return faceapi;
  })().catch(e => {
    api = null;
    throw e;
  });
  return api;
}

/* ---------- поиск лиц на фото (с кэшем по самому файлу) ---------- */

const cache = new WeakMap<Blob, Promise<Face[]>>();

/** Фото → холст не больше max px. Сначала через createImageBitmap, не вышло — через <img>
    (некоторые JPEG — CMYK, необычные профили — декодируются только так). */
async function photoCanvas(blob: Blob, max = 2000): Promise<HTMLCanvasElement> {
  let src: CanvasImageSource;
  let w: number;
  let h: number;
  let close = () => {};
  try {
    const bmp = await createImageBitmap(blob);
    [src, w, h, close] = [bmp, bmp.width, bmp.height, () => bmp.close()];
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      [src, w, h] = [img, img.naturalWidth, img.naturalHeight];
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  close();
  return c;
}

/** Кусок холста (x, y, w, h) с полями pad (доля) вокруг — новым холстом. */
function region(c: HTMLCanvasElement, x: number, y: number, w: number, h: number, pad = 0) {
  const px = Math.round(w * pad);
  const py = Math.round(h * pad);
  const r = document.createElement('canvas');
  r.width = w + 2 * px;
  r.height = h + 2 * py;
  const g = r.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, r.width, r.height);
  g.drawImage(c, x, y, w, h, px, py, w, h);
  return { r, ox: x - px, oy: y - py };
}

interface Found {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
  descriptor: Float32Array;
}

/** Уже перешли на запасной (процессорный) движок — второй раз не пробуем. */
let cpuFallback = false;

/** Лица на холсте: весь снимок + 4 увеличенных куска (мелкие лица на групповых фото),
    повторы убираются; если ничего — ещё раз с полями (лицо «во весь кадр», как на фото профиля). */
async function findFaces(faceapi: FaceApi, c: HTMLCanvasElement): Promise<Found[]> {
  const opt = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
  const all: Found[] = [];
  const run = async (src: HTMLCanvasElement, ox: number, oy: number) => {
    try {
      const found = await faceapi.detectAllFaces(src, opt).withFaceLandmarks().withFaceDescriptors();
      found.forEach(f => {
        const b = f.detection.box;
        all.push({ x: b.x + ox, y: b.y + oy, w: b.width, h: b.height, score: f.detection.score, descriptor: f.descriptor });
      });
    } catch (e) {
      // одно «неудобное» лицо (рамка у края снимка) роняет обработку всего фото —
      // тогда по одному: вырезаем каждое лицо с запасом и считаем отдельно, сбойные пропускаем
      console.warn('Распознавание лиц: обрабатываю лица по одному', e);
      const dets = await faceapi.detectAllFaces(src, opt);
      for (const d of dets) {
        const b = d.box;
        const m = Math.max(b.width, b.height) * 0.4;
        const x = Math.max(0, Math.floor(b.x - m));
        const y = Math.max(0, Math.floor(b.y - m));
        const w = Math.min(src.width - x, Math.ceil(b.width + 2 * m));
        const h = Math.min(src.height - y, Math.ceil(b.height + 2 * m));
        if (w < 20 || h < 20) continue;
        const { r } = region(src, x, y, w, h);
        const one = await Promise.resolve(faceapi.detectSingleFace(r, opt).withFaceLandmarks().withFaceDescriptor()).catch(() => undefined);
        if (one) all.push({ x: b.x + ox, y: b.y + oy, w: b.width, h: b.height, score: d.score, descriptor: one.descriptor });
      }
    }
  };

  await run(c, 0, 0);
  if (Math.max(c.width, c.height) >= 900) {
    const tw = Math.round(c.width * 0.6);
    const th = Math.round(c.height * 0.6);
    for (const [x, y] of [
      [0, 0],
      [c.width - tw, 0],
      [0, c.height - th],
      [c.width - tw, c.height - th],
    ]) {
      const { r, ox, oy } = region(c, x, y, tw, th);
      await run(r, ox, oy);
    }
  }
  if (!all.length) {
    const { r, ox, oy } = region(c, 0, 0, c.width, c.height, 0.5);
    await run(r, ox, oy);
  }

  // одно лицо могли найти и целиком, и в куске — оставляем самую уверенную рамку
  all.sort((a, b) => b.score - a.score);
  const keep: Found[] = [];
  for (const f of all) if (!keep.some(k => boxOverlap(k, f) > 0.4)) keep.push(f);
  // слишком мелкое и вытянутое — не лицо (узоры на одежде, тени)
  return keep.filter(f => f.w >= 20 && f.h >= 20 && f.w / f.h > 0.5 && f.w / f.h < 1.6);
}

/** Лица на фото. */
export function detectFaces(mediaId: string): Promise<Face[]> {
  const blob = mediaRegistry.get(mediaId);
  if (!blob || !blob.type.startsWith('image/')) return Promise.resolve([]);
  let p = cache.get(blob);
  if (!p) {
    p = (async () => {
      const faceapi = await loadFaces();
      const c = await photoCanvas(blob);
      let found: Found[];
      try {
        found = await findFaces(faceapi, c);
      } catch (e) {
        // видеокарта не справилась (мало памяти, потерян контекст WebGL) — считаем на процессоре: медленнее, но работает
        console.error('Распознавание лиц: ошибка, пробую без видеокарты', e);
        const tf = faceapi.tf as unknown as Tf;
        if (cpuFallback || tf.getBackend() === 'cpu') throw e;
        cpuFallback = true;
        await tf.setBackend('cpu');
        await tf.ready();
        found = await findFaces(faceapi, c);
      }
      return found
        .map(f => {
          const x = Math.max(0, f.x);
          const y = Math.max(0, f.y);
          return {
            box: { x: x / c.width, y: y / c.height, w: Math.min(f.w, c.width - x) / c.width, h: Math.min(f.h, c.height - y) / c.height },
            descriptor: f.descriptor,
          };
        })
        .sort((a, b) => a.box.x - b.box.x);
    })();
    p.catch(e => {
      console.error('Распознавание лиц: не удалось обработать фото', mediaId, e);
      cache.delete(blob);
    });
    cache.set(blob, p);
  }
  return p;
}

/* ---------- лица, сохранённые в архиве ---------- */

export function encodeDescriptor(d: Float32Array): string {
  const b = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin);
}

export function decodeDescriptor(s: string): Float32Array | null {
  try {
    const bin = atob(s);
    if (bin.length !== 512) return null;
    const b = new Uint8Array(512);
    for (let i = 0; i < 512; i++) b[i] = bin.charCodeAt(i);
    return new Float32Array(b.buffer);
  } catch {
    return null;
  }
}

/** Сохранённые лица фото → рамки и отпечатки (битые записи пропускаются, порядок сохраняется). */
function savedFaces(m: MediaItem): Face[] {
  return (m.faces ?? []).map(f => ({ box: { x: f.x, y: f.y, w: f.w, h: f.h }, descriptor: decodeDescriptor(f.d) ?? new Float32Array(128).fill(9) }));
}

/** Кто на фото по мнению архива: владелец альбома и отмеченные. */
export function peopleOnPhoto(data: ArchiveData, m: MediaItem): Set<string> {
  const ownerId = data.persons.find(p => p.media.includes(m.id))?.id;
  return new Set([...(ownerId ? [ownerId] : []), ...m.people]);
}

/** Лица фото для показа — из архива, без движка: кто узнан и о ком вопрос. */
export function savedMatches(data: ArchiveData, m: MediaItem): FaceMatch[] {
  const on = peopleOnPhoto(data, m);
  const rejected = new Set(m.notPeople ?? []);
  const faces = savedFaces(m);
  return (m.faces ?? []).map((f, i) => ({
    face: faces[i],
    knownId: f.p && on.has(f.p) ? f.p : null,
    suggestId: f.s && !on.has(f.s) && !rejected.has(f.s) ? f.s : null,
    distance: 0,
    not: f.n,
  }));
}

/** Результат распознавания → запись для архива. */
export function toMediaFaces(matches: FaceMatch[]): MediaFace[] {
  return matches.map(m => ({
    x: +m.face.box.x.toFixed(4),
    y: +m.face.box.y.toFixed(4),
    w: +m.face.box.w.toFixed(4),
    h: +m.face.box.h.toFixed(4),
    d: encodeDescriptor(m.face.descriptor),
    ...(m.knownId ? { p: m.knownId } : null),
    ...(m.suggestId ? { s: m.suggestId } : null),
    ...(m.not?.length ? { n: m.not } : null),
  }));
}

/* ---------- кого система знает ---------- */

const largest = (faces: Face[]) => faces.reduce<Face | null>((m, f) => (!m || f.box.w * f.box.h > m.box.w * m.box.h ? f : m), null);

/** Лица найдены текущей версией поиска (старые — искать заново). */
const facesCurrent = (m: MediaItem) => !!m.faces && m.facesV === FACES_VERSION;

/** Ответы со старых рамок («это он», «это не он») — на новые рамки того же лица. */
function carryOver(faces: Face[], old: MediaFace[]): { p?: string; n?: string[] }[] {
  return faces.map(f => {
    let best: MediaFace | null = null;
    let bestK = 0.4;
    old.forEach(o => {
      const k = boxOverlap(f.box, o);
      if (k > bestK) [best, bestK] = [o, k];
    });
    const b = best as MediaFace | null;
    return b ? { p: b.p, n: b.n } : {};
  });
}

/** Перекрытие рамок: доля пересечения от меньшей рамки. */
function boxOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (ix * iy) / Math.max(1e-9, Math.min(a.w * a.h, b.w * b.h));
}

/** Лица фото: сохранённые в архиве или найденные заново (новые — в found, чтобы сохранить в архив). */
async function facesOf(m: MediaItem, found: Map<string, MediaFace[]>): Promise<Face[]> {
  if (facesCurrent(m)) return savedFaces(m);
  const faces = await detectFaces(m.id).catch(() => null);
  if (!faces) return m.faces ? savedFaces(m) : [];
  const prior = carryOver(faces, m.faces ?? []);
  found.set(m.id, toMediaFaces(faces.map((face, i) => ({ face, knownId: prior[i].p ?? null, suggestId: null, distance: 1, not: prior[i].n }))));
  return faces;
}

/** Отпечатки лиц каждого человека, у кого они есть.
    Источники: лица, узнанные или подтверждённые на фото (сохранены в архиве — так система «учится»),
    фото профиля и фото в альбоме человека, где одно лицо и никто не отмечен. */
async function knownFaces(data: ArchiveData, skipMediaId: string): Promise<Map<string, Float32Array[]>> {
  const found = new Map<string, MediaFace[]>();
  const byId = new Map(data.media.map(m => [m.id, m]));
  const known = new Map<string, Float32Array[]>();
  const add = (pid: string, d: Float32Array) => known.set(pid, [...(known.get(pid) ?? []), d]);

  // подтверждённые лица со всех фото — самый надёжный источник
  for (const m of data.media) {
    if (m.id === skipMediaId || !m.faces?.length) continue;
    const on = peopleOnPhoto(data, m);
    m.faces.forEach(f => {
      const d = f.p && on.has(f.p) ? decodeDescriptor(f.d) : null;
      if (d && (known.get(f.p!)?.length ?? 0) < CONFIRMED_PER_PERSON) add(f.p!, d);
    });
  }

  for (const p of data.persons) {
    let n = 0;
    // фото профиля — почти всегда сам человек (кадрировано по лицу)
    const main = p.mainPhotoId && p.mainPhotoId !== skipMediaId ? byId.get(p.mainPhotoId) : undefined;
    if (main) {
      const f = largest(await facesOf(main, found));
      if (f) {
        add(p.id, f.descriptor);
        n++;
      }
    }
    // фото в его альбоме, где одно лицо и больше никто не отмечен
    for (const id of p.media) {
      if (n >= SAMPLES_PER_PERSON) break;
      const m = byId.get(id);
      if (!m || m.id === skipMediaId || m.kind !== 'photo' || m.people.length) continue;
      const faces = await facesOf(m, found);
      if (faces.length === 1) {
        add(p.id, faces[0].descriptor);
        n++;
      }
    }
  }
  // найденные по пути лица — в архив: в следующий раз искать их заново не придётся (это и есть «запомнил»)
  const mine = new Map([...found].filter(([id]) => {
    const m = byId.get(id)!;
    return access().canEditMediaItem(m, data.persons.find(p => p.media.includes(id) || p.mainPhotoId === id)?.id ?? null);
  }));
  if (mine.size) useArchive.getState().addFacesCache(mine);
  return known;
}

function dist(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/** Кто на фото: для каждого лица — кто уже отмечен (если узнали) и кого предложить.
    Лица фото берутся из архива, если их уже искали этой версией поиска; fresh — искать заново
    («Проверить снова»). Ответы со старых рамок переносятся на новые. */
export async function matchFaces(data: ArchiveData, item: MediaItem, onProgress?: (msg: string) => void, fresh = false): Promise<FaceMatch[]> {
  onProgress?.(facesReady() ? 'Ищу лица…' : 'Загружаю распознавание лиц (один раз, ~12 МБ)…');
  await loadFaces();
  onProgress?.('Ищу лица…');
  const useSaved = facesCurrent(item) && !fresh;
  const faces = useSaved ? savedFaces(item) : await detectFaces(item.id);
  if (!faces.length) return [];
  const prior = useSaved ? (item.faces ?? []).map(f => ({ p: f.p, n: f.n })) : carryOver(faces, item.faces ?? []);
  onProgress?.('Сравниваю с родными…');
  const known = await knownFaces(data, item.id);

  const onPhoto = peopleOnPhoto(data, item);
  const rejected = new Set(item.notPeople ?? []);
  const res: FaceMatch[] = faces.map((face, i) => ({ face, knownId: null, suggestId: null, distance: 1, not: prior[i].n }));
  const usedPeople = new Set<string>();

  // кого уже подтвердили на этом фото — остаются на своих лицах
  prior.forEach((f, i) => {
    if (f.p && onPhoto.has(f.p) && !usedPeople.has(f.p)) {
      res[i].knownId = f.p;
      res[i].distance = 0;
      usedPeople.add(f.p);
    }
  });

  // все пары «лицо — человек» с расстоянием; дальше — жадно, лучшие пары первыми, каждый человек один раз
  const pairs: { fi: number; pid: string; d: number }[] = [];
  faces.forEach((f, fi) =>
    known.forEach((ds, pid) => {
      if (prior[fi].n?.includes(pid)) return; // вы сказали «это не он»
      const d = Math.min(...ds.map(x => dist(x, f.descriptor)));
      if (d < THRESHOLD) pairs.push({ fi, pid, d });
    }),
  );
  pairs.sort((a, b) => a.d - b.d);

  for (const { fi, pid, d } of pairs) {
    const r = res[fi];
    if (r.knownId || r.suggestId || usedPeople.has(pid)) continue;
    if (onPhoto.has(pid)) r.knownId = pid;
    else if (!rejected.has(pid)) r.suggestId = pid;
    else continue;
    r.distance = d;
    usedPeople.add(pid);
  }
  return res;
}
