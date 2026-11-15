/* Импорт дерева из прежней версии приложения: ZIP (data.json + img/) или data.json (фото внутри как data:URL).
   Старые числовые id заменяются постоянными UUID; порядок создания (seq) = старый id, чтобы
   раскладка дерева совпала с прежней. */
import { unzipSync } from 'fflate';
import { createMeta, newId, normBio, normBurial, ownerUser } from '../domain/normalize';
import { normDate } from '../domain/people';
import type { ArchiveData, MediaItem, Person, RelType, Relation } from '../domain/types';
import { sha256Hex, sniff } from './media';

export interface ImportResult {
  data: ArchiveData;
  blobs: Map<string, Blob>;
  /** сколько фото не удалось прочитать */
  missingPhotos: number;
}

type LegacyPerson = Record<string, unknown> & { id?: unknown };
interface LegacyData {
  persons?: unknown;
  relations?: unknown;
}

const REL: RelType[] = ['parent', 'spouse', 'sibling', 'other'];
const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

function dataUrlToBytes(url: string): Uint8Array | null {
  const m = url.match(/^data:[^;,]*;base64,(.*)$/s);
  if (!m) return null;
  try {
    const bin = atob(m[1]);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * Преобразует старый data.json в архив. readRef получает ссылку на фото («img/…» или data:URL)
 * и возвращает байты файла или null.
 */
export async function legacyToArchive(
  json: LegacyData,
  readRef: (ref: string) => Promise<Uint8Array | null> | Uint8Array | null,
  title = 'Семейный архив',
): Promise<ImportResult> {
  const rawPersons = (Array.isArray(json.persons) ? json.persons : []) as LegacyPerson[];
  // как в старом normalizeData: повторяющиеся/пустые id получают новые номера
  const used = new Set<number>();
  let free = Math.max(0, ...rawPersons.map(p => n(p.id, 0))) + 1;
  const oldIds: number[] = rawPersons.map(p => {
    let id = n(p.id, NaN);
    if (!Number.isFinite(id) || id <= 0 || used.has(id)) id = free++;
    used.add(id);
    return id;
  });

  const idMap = new Map<number, string>();
  oldIds.forEach(id => idMap.set(id, newId()));

  const blobs = new Map<string, Blob>();
  const media: MediaItem[] = [];
  let missingPhotos = 0;

  async function addPhoto(ref: unknown): Promise<string | null> {
    if (typeof ref !== 'string' || !ref) return null;
    const bytes = await readRef(ref);
    const info = bytes ? sniff(bytes.slice(0, 4096)) : null;
    if (!bytes || !info || info.kind !== 'photo') {
      missingPhotos++;
      return null;
    }
    const id = newId();
    const blob = new Blob([bytes as BlobPart], { type: info.mime });
    blobs.set(id, blob);
    media.push({ id, kind: 'photo', mime: info.mime, name: `photo.${info.ext}`, size: bytes.length, sha256: await sha256Hex(bytes), createdAt: Date.now(), people: [], date: '', year: null });
    return id;
  }

  const persons: Person[] = [];
  for (let i = 0; i < rawPersons.length; i++) {
    const p = rawPersons[i];
    const old = oldIds[i];
    const burial = normBurial(p.burial);
    const death = normDate(p.death);
    const mainPhotoId = await addPhoto(p.mainPhoto);
    const extra: string[] = [];
    for (const ref of Array.isArray(p.extraPhotos) ? p.extraPhotos : []) {
      const id = await addPhoto(ref);
      if (id) extra.push(id);
    }
    const now = Date.now();
    persons.push({
      id: idMap.get(old)!,
      seq: old,
      legacyId: old,
      firstName: s(p.firstName || p.name),
      lastName: s(p.lastName),
      middleName: s(p.middleName),
      maidenName: s(p.maidenName),
      gender: p.gender === 'Мужской' || p.gender === 'Женский' ? p.gender : '',
      birth: normDate(p.birth),
      death,
      deceased: typeof p.deceased === 'boolean' ? p.deceased : !!(death || p.deathCity || p.deathCountry || burial.cemetery || burial.lat != null),
      birthCountry: s(p.birthCountry),
      birthCity: s(p.birthCity),
      deathCountry: s(p.deathCountry),
      deathCity: s(p.deathCity),
      residenceCountry: s(p.residenceCountry),
      residenceCity: s(p.residenceCity),
      phone: s(p.phone),
      email: s(p.email),
      address: s(p.address),
      occupation: s(p.occupation),
      socials: [],
      bio: normBio(p.bio, p.description),
      burial,
      mainPhotoId,
      media: extra,
      documents: [],
      x: n(p.x, 500 + i * 230),
      y: n(p.y, 500),
      slot: typeof p.slot === 'number' ? p.slot : undefined,
      collapsed: !!p.collapsed,
      createdAt: now,
      updatedAt: now,
    });
  }

  const relations: Relation[] = [];
  const seen = new Set<string>();
  for (const r of (Array.isArray(json.relations) ? json.relations : []) as Record<string, unknown>[]) {
    const from = idMap.get(n(r.from, NaN));
    const to = idMap.get(n(r.to, NaN));
    if (!from || !to || from === to) continue;
    const type = REL.includes(r.type as RelType) ? (r.type as RelType) : 'other';
    const a = n(r.from, 0);
    const b = n(r.to, 0);
    const k = type + ':' + Math.min(a, b) + ':' + Math.max(a, b);
    if (seen.has(k)) continue;
    seen.add(k);
    relations.push({ id: newId(), from, to, type });
  }

  const meta = createMeta(title);
  meta.nextSeq = Math.max(1, ...persons.map(p => p.seq + 1));
  return { data: { meta, persons, relations, media, stories: [], history: [], access: { users: [ownerUser()] }, deleted: [] }, blobs, missingPhotos };
}

/** Старый ZIP-архив (data.json + img/). */
export async function importLegacyZip(bytes: Uint8Array, title?: string): Promise<ImportResult> {
  const files = unzipSync(bytes);
  const dataFile = files['data.json'];
  if (!dataFile) throw new Error('В архиве нет data.json');
  const json = JSON.parse(new TextDecoder().decode(dataFile)) as LegacyData;
  return legacyToArchive(
    json,
    ref => (ref.startsWith('data:') ? dataUrlToBytes(ref) : files[ref.replace(/^\.?\//, '')] ?? null),
    title,
  );
}

/** Старый data.json (фото внутри как data:URL; ссылки на img/ прочитать нельзя). */
export async function importLegacyJson(text: string, title?: string): Promise<ImportResult> {
  const json = JSON.parse(text) as LegacyData;
  return legacyToArchive(json, ref => (ref.startsWith('data:') ? dataUrlToBytes(ref) : null), title);
}
