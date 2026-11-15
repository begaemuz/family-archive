/* Снимок открытого архива — чтобы обновление страницы или случайно закрытая вкладка ничего не теряли.
   Хранится в IndexedDB ТОЛЬКО в зашифрованном виде тем же ключом, что и архив:
   без пароля его не прочитать. Пароль и ключ не сохраняются. Удаляется при «Закрыть архив». */
import { decrypt, deriveKey, encrypt, randomBytes, sha256, type KdfParams } from './crypto';
import { importDataKey, openSlot, type KeySlot, type SessionKey } from './keys';
import type { FSHandle } from './fileAccess';
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
  savedAt: number;
  /** все изменения уже записаны в файл (снимок нужен только чтобы продолжить работу) */
  saved: boolean;
}

interface DraftRecord extends DraftInfo {
  /** ячейки пользователей (как в файле) — восстановление по логину-паролю */
  slots?: KeySlot[];
  /** старые черновики: ключ — Argon2id(пароль) */
  kdf?: KdfParams;
  /** отпечаток ключа данных: сменился ключ — медиа шифруются заново */
  keyId?: string;
  json: { nonce: Uint8Array; ct: Uint8Array };
  mediaIds: string[];
  /** ссылка на файл (File System Access) — чтобы «Сохранить» снова писало в тот же файл */
  handle?: FSHandle | null;
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
  extra: { saved: boolean; handle: FSHandle | null },
): Promise<void> {
  const prev = (await tx<DraftRecord>('readonly', s => s.get('session')).catch(() => undefined)) as DraftRecord | undefined;
  const keyId = await keyIdOf(sk);
  // медиа уже зашифрованы этим же ключом — повторно не шифруем
  const have = new Set(prev && prev.archiveId === data.meta.id && prev.keyId === keyId ? prev.mediaIds : []);
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
    slots: sk.slots,
    keyId,
    savedAt: Date.now(),
    saved: extra.saved,
    handle: extra.handle,
    json,
    mediaIds: data.media.map(m => m.id),
  };
  const keep = new Set(rec.mediaIds);
  const write = (r: DraftRecord) =>
    tx('readwrite', s => {
      if (prev && (prev.archiveId !== data.meta.id || prev.keyId !== keyId)) s.clear();
      s.put(r, 'session');
      newMedia.forEach(([id, v]) => s.put(v, 'media:' + id));
      (prev?.mediaIds || []).filter(id => !keep.has(id)).forEach(id => s.delete('media:' + id));
    });
  try {
    await write(rec);
  } catch {
    await write({ ...rec, handle: null }); // ссылку на файл сохранить не удалось — без неё
  }
}

export async function draftInfo(): Promise<DraftInfo | null> {
  try {
    const r = (await tx<DraftRecord>('readonly', s => s.get('session'))) as DraftRecord | undefined;
    // у старых черновиков поля saved нет — значит, это были несохранённые изменения
    return r ? { archiveId: r.archiveId, title: r.title, fileName: r.fileName, savedAt: r.savedAt, saved: r.saved ?? false } : null;
  } catch {
    return null;
  }
}

async function keyIdOf(sk: SessionKey): Promise<string> {
  const h = await sha256(new Uint8Array([...new TextEncoder().encode('rodiva-key-id:'), ...sk.raw]));
  return [...h.subarray(0, 12)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Восстановить черновик логином и паролем. Бросает 'wrong-password', если не подходят.
    legacy — черновик старого формата: сессия получает новый ключ данных, ячейку владельца заводит сессия. */
export async function restoreDraft(
  login: string,
  password: string,
): Promise<{ data: ArchiveData; blobs: Map<string, Blob>; sk: SessionKey; fileName: string; saved: boolean; handle: FSHandle | null; legacy: boolean }> {
  const r = (await tx<DraftRecord>('readonly', s => s.get('session'))) as DraftRecord | undefined;
  if (!r) throw new Error('no-draft');
  let key: CryptoKey;
  let sk: SessionKey;
  let legacy = false;
  if (r.slots?.length) {
    const opened = await openSlot(r.slots, r.archiveId, login, password);
    if (!opened) throw new Error('wrong-password');
    key = await importDataKey(opened.raw);
    sk = { key, raw: opened.raw, slots: r.slots, userId: opened.userId };
  } else if (r.kdf) {
    key = await deriveKey(password, r.kdf);
    const raw = randomBytes(32);
    sk = { key: await importDataKey(raw), raw, slots: [], userId: '' };
    legacy = true;
  } else throw new Error('no-draft');
  let raw: unknown;
  try {
    raw = JSON.parse(dec.decode(await decrypt(key, r.json.nonce, r.json.ct, jsonAad(r.archiveId))));
  } catch {
    throw new Error('wrong-password');
  }
  const d = raw as ArchiveData;
  const data = normalizeArchive({ meta: d.meta, persons: d.persons, relations: d.relations, media: d.media, stories: d.stories, history: d.history, access: d.access, deleted: d.deleted });
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
  return { data, blobs, sk, fileName: r.fileName, saved: r.saved ?? false, handle: r.handle ?? null, legacy };
}

export async function clearDraft(): Promise<void> {
  try {
    await tx('readwrite', s => s.clear());
  } catch {
    /* нечего чистить */
  }
}
