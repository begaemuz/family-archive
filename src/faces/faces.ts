/* Распознавание лиц — целиком на устройстве: фото никуда не отправляются.
   Модели (~7 МБ) подгружаются при первом использовании из ./models и дальше берутся из кэша (работает офлайн).
   Кого система «знает»: человека по фото профиля, по фото в его альбоме, где одно лицо и никто не отмечен,
   и по лицам, которые вы подтвердили кнопкой «Да». «Отпечатки» лиц живут только в памяти, в файл не пишутся. */
import type { ArchiveData, MediaItem } from '../domain/types';
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
}

/** порог похожести: меньше — строже. 0.5 — мало ложных совпадений на семейных фото */
const THRESHOLD = 0.5;
/** сколько фото на человека смотреть, чтобы его «запомнить» */
const SAMPLES_PER_PERSON = 4;

let api: Promise<FaceApi> | null = null;
let loaded = false;

/** в автономном однофайловом архиве распознавания нет (модели с диска не загрузить) */
export const facesAvailable = import.meta.env.MODE !== 'single';
export const facesReady = () => loaded;

/** Загрузить движок и модели (один раз). */
export function loadFaces(): Promise<FaceApi> {
  api ??= (async () => {
    const faceapi = await import('@vladmandic/face-api');
    // в типах пакета tf описан не полностью — нужные два метода объявляем сами
    const tf = faceapi.tf as unknown as { setBackend(b: string): Promise<boolean>; ready(): Promise<void> };
    if (!(await tf.setBackend('webgl').catch(() => false))) await tf.setBackend('cpu');
    await tf.ready();
    const base = new URL('models', document.baseURI).href;
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(base),
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

/** Фото на холсте не больше max px. pad — поля вокруг (доля стороны): лицо «во весь кадр»,
    как на кадрированном фото профиля, детектор находит только с полями. */
function toCanvas(bmp: ImageBitmap, pad = 0, max = 1600) {
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const px = Math.round(w * pad);
  const py = Math.round(h * pad);
  const c = document.createElement('canvas');
  c.width = w + 2 * px;
  c.height = h + 2 * py;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, px, py, w, h);
  return { c, px, py, w, h };
}

/** Лица на фото. Мелкие и сомнительные отбрасываются. */
export function detectFaces(mediaId: string): Promise<Face[]> {
  const blob = mediaRegistry.get(mediaId);
  if (!blob || !blob.type.startsWith('image/')) return Promise.resolve([]);
  let p = cache.get(blob);
  if (!p) {
    p = (async () => {
      const faceapi = await loadFaces();
      const bmp = await createImageBitmap(blob);
      try {
        // сначала как есть, крупной сеткой — для групповых фото с мелкими лицами;
        // не нашли — с полями и мелкой сеткой: так находится лицо «во весь кадр»
        for (const [pad, inputSize] of [
          [0, 608],
          [0.6, 416],
        ]) {
          const { c, px, py, w, h } = toCanvas(bmp, pad);
          const found = await faceapi
            .detectAllFaces(c, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptors();
          const faces = found
            .filter(f => f.detection.box.width >= 28)
            .map(f => {
              const b = f.detection.box;
              const x = Math.max(0, b.x - px);
              const y = Math.max(0, b.y - py);
              return {
                box: { x: x / w, y: y / h, w: Math.min(b.width, w - x) / w, h: Math.min(b.height, h - y) / h },
                descriptor: f.descriptor,
              };
            })
            .sort((a, b) => a.box.x - b.box.x);
          if (faces.length) return faces;
        }
        return [];
      } finally {
        bmp.close();
      }
    })();
    p.catch(() => cache.delete(blob));
    cache.set(blob, p);
  }
  return p;
}

/* ---------- кого система знает ---------- */

/** подтверждённые вами лица в этом сеансе: человек → отпечатки */
const confirmed = new Map<string, Float32Array[]>();

/** «Да, это он» — запомнить лицо, чтобы узнавать его дальше. */
export function learnFace(personId: string, face: Face) {
  confirmed.set(personId, [...(confirmed.get(personId) ?? []), face.descriptor]);
}

const largest = (faces: Face[]) => faces.reduce<Face | null>((m, f) => (!m || f.box.w * f.box.h > m.box.w * m.box.h ? f : m), null);

/** Отпечатки лиц каждого человека, у кого они есть. */
async function knownFaces(data: ArchiveData, skipMediaId: string): Promise<Map<string, Float32Array[]>> {
  const byId = new Map(data.media.map(m => [m.id, m]));
  const known = new Map<string, Float32Array[]>();
  const add = (pid: string, d: Float32Array) => known.set(pid, [...(known.get(pid) ?? []), d]);
  confirmed.forEach((ds, pid) => ds.forEach(d => add(pid, d)));

  for (const p of data.persons) {
    let n = 0;
    // фото профиля — почти всегда сам человек (кадрировано по лицу)
    if (p.mainPhotoId && p.mainPhotoId !== skipMediaId) {
      const f = largest(await detectFaces(p.mainPhotoId).catch(() => []));
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
      const faces = await detectFaces(id).catch(() => []);
      if (faces.length === 1) {
        add(p.id, faces[0].descriptor);
        n++;
      }
    }
  }
  return known;
}

function dist(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/** Кто на фото: для каждого лица — кто уже отмечен (если узнали) и кого предложить. */
export async function matchFaces(data: ArchiveData, item: MediaItem, onProgress?: (msg: string) => void): Promise<FaceMatch[]> {
  onProgress?.(facesReady() ? 'Ищу лица…' : 'Загружаю распознавание лиц (один раз, ~7 МБ)…');
  await loadFaces();
  onProgress?.('Ищу лица…');
  const faces = await detectFaces(item.id);
  if (!faces.length) return [];
  onProgress?.('Сравниваю с родными…');
  const known = await knownFaces(data, item.id);

  const ownerId = data.persons.find(p => p.media.includes(item.id))?.id ?? null;
  const onPhoto = new Set([...(ownerId ? [ownerId] : []), ...item.people]);
  const rejected = new Set(item.notPeople ?? []);

  // все пары «лицо — человек» с расстоянием; дальше — жадно, лучшие пары первыми, каждый человек один раз
  const pairs: { fi: number; pid: string; d: number }[] = [];
  faces.forEach((f, fi) =>
    known.forEach((ds, pid) => {
      const d = Math.min(...ds.map(x => dist(x, f.descriptor)));
      if (d < THRESHOLD) pairs.push({ fi, pid, d });
    }),
  );
  pairs.sort((a, b) => a.d - b.d);

  const res: FaceMatch[] = faces.map(face => ({ face, knownId: null, suggestId: null, distance: 1 }));
  const usedPeople = new Set<string>();
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
