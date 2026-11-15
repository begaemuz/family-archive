/* Черновик несохранённых изменений — на случай случайного закрытия вкладки.
   Хранится в IndexedDB ТОЛЬКО в зашифрованном виде тем же ключом, что и архив:
   без пароля его не прочитать. Пароль и ключ не сохраняются. */
import { decrypt, deriveKey, encrypt, type KdfParams } from './crypto';
import type { SessionKey } from './container';
import { normalizeArchive } from '../domain/normalize';
import type { ArchiveData } from '../domain/types';

const DB = 'familyArchive';
const STORE = 'drafts';
const enc = new TextEncoder();
const dec = new TextDecoder();

export interface DraftInfo {
  archiveId: string;
  title: string;
  fileName: string;
  kdf: KdfParams;
  savedAt: number;
}

interface DraftRecord extends DraftInfo {
  json: { nonce: Uint8Array; ct: Uint8Array };
  mediaIds: string[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req ? req.result : undefined);
    };
    t.onerror = t.onabort = () => {
      db.close();
      reject(t.error);
    };
  });
}

const mediaAad = (archiveId: string, id: string) => enc.encode(`draft-media:${archiveId}:${id}`);
const jsonAad = (archiveId: string) => enc.encode(`draft-json:${archiveId}`);

/** Записать зашифрованный черновик: JSON целиком, медиа — только новые (каждый файл шифруется один раз). */
export async function saveDraft(
  sk: SessionKey,
  data: ArchiveData,
  blobOf: (id: string) => Blob | undefined,
  fileName: string,
): Promise<void> {
  const prev = (await tx<DraftRecord>('readonly', s => s.get('session')).catch(() => undefined)) as DraftRecord | undefined;
  const have = new Set(prev && prev.archiveId === data.meta.id ? prev.mediaIds : []);
  const newMedia: [string, { nonce: Uint8Array; ct: Uint8Array }][] = [];
  for (const m of data.media) {
    if (have.has(m.id)) continue;
    const b = blobOf(m.id);
    if (!b) continue;
    newMedia.push([m.id, await encrypt(sk.key, new Uint8Array(await b.arrayBuffer()), mediaAad(data.meta.id, m.id))]);
  }
  const json = await encrypt(sk.key, enc.encode(JSON.stringify(data)), jsonAad(data.meta.id));
  const rec: DraftRecord = {
    archiveId: data.meta.id,
    title: data.meta.title,
    fileName,
    kdf: sk.kdf,
    savedAt: Date.now(),
    json,
    mediaIds: data.media.map(m => m.id),
  };
  const keep = new Set(rec.mediaIds);
  await tx('readwrite', s => {
    if (prev && prev.archiveId !== data.meta.id) s.clear();
    s.put(rec, 'session');
    newMedia.forEach(([id, v]) => s.put(v, 'media:' + id));
    (prev?.mediaIds || []).filter(id => !keep.has(id)).forEach(id => s.delete('media:' + id));
  });
}

export async function draftInfo(): Promise<DraftInfo | null> {
  try {
    const r = (await tx<DraftRecord>('readonly', s => s.get('session'))) as DraftRecord | undefined;
    return r ? { archiveId: r.archiveId, title: r.title, fileName: r.fileName, kdf: r.kdf, savedAt: r.savedAt } : null;
  } catch {
    return null;
  }
}

/** Восстановить черновик паролем. Бросает 'wrong-password', если пароль не подходит. */
export async function restoreDraft(password: string): Promise<{ data: ArchiveData; blobs: Map<string, Blob>; sk: SessionKey; fileName: string }> {
  const r = (await tx<DraftRecord>('readonly', s => s.get('session'))) as DraftRecord | undefined;
  if (!r) throw new Error('no-draft');
  const key = await deriveKey(password, r.kdf);
  let raw: unknown;
  try {
    raw = JSON.parse(dec.decode(await decrypt(key, r.json.nonce, r.json.ct, jsonAad(r.archiveId))));
  } catch {
    throw new Error('wrong-password');
  }
  const d = raw as ArchiveData;
  const data = normalizeArchive({ meta: d.meta, persons: d.persons, relations: d.relations, media: d.media, stories: d.stories, history: d.history });
  const blobs = new Map<string, Blob>();
  for (const m of data.media) {
    const v = (await tx<{ nonce: Uint8Array; ct: Uint8Array }>('readonly', s => s.get('media:' + m.id))) as
      | { nonce: Uint8Array; ct: Uint8Array }
      | undefined;
    if (!v) continue;
    try {
      blobs.set(m.id, new Blob([(await decrypt(key, v.nonce, v.ct, mediaAad(r.archiveId, m.id))) as BlobPart], { type: m.mime }));
    } catch {
      /* повреждённый файл черновика — пропускаем */
    }
  }
  return { data, blobs, sk: { key, kdf: r.kdf }, fileName: r.fileName };
}

export async function clearDraft(): Promise<void> {
  try {
    await tx('readwrite', s => s.clear());
  } catch {
    /* нечего чистить */
  }
}
