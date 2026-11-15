/* Формат файла .family, версия 1.

   [ "FAMILYAR" ][ u32 длина заголовка ][ заголовок JSON ]          ← открыт, но защищён: его хеш входит в AAD
   [ nonce 12 ][ u32 длина ][ verifier ]                             ← проверка пароля
   [ nonce 12 ][ u32 длина ][ блок 1 ] … [ nonce ][ длина ][ блок N ] ← содержимое (ZIP), по 4 МиБ

   Каждый блок шифруется AES-256-GCM со своим случайным nonce и AAD = SHA-256(заголовок) ‖ номер ‖ «последний».
   Поэтому подмена, перестановка, обрезка или добавление блоков обнаруживаются. Пароль нигде не хранится. */
import { checkKdf, decrypt, deriveKey, encrypt, newKdf, sha256, type KdfParams } from '../../src/archive/crypto';

export const MAGIC = 'FAMILYAR';
export const FORMAT_VERSION = 1;
export const CHUNK_SIZE = 4 * 1024 * 1024;
const VERIFIER_TEXT = 'family-archive:password-ok';
const MAX_HEADER = 64 * 1024;

export interface ContainerHeader {
  format: 'family';
  version: number;
  archiveId: string;
  cipher: 'AES-256-GCM';
  kdf: KdfParams;
  chunkSize: number;
  chunkCount: number;
  createdWith: string;
}

export type ArchiveErrorCode = 'not-archive' | 'newer-version' | 'wrong-password' | 'corrupted';

export class ArchiveError extends Error {
  constructor(public code: ArchiveErrorCode) {
    super(
      {
        'not-archive': 'Этот файл не является семейным архивом',
        'newer-version': 'Архив создан в более новой версии приложения — обновите приложение',
        'wrong-password': 'Неверный пароль',
        corrupted: 'Файл повреждён — его не удаётся прочитать',
      }[code],
    );
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

async function chunkAad(headerHash: Uint8Array, index: number, last: boolean): Promise<Uint8Array> {
  const a = new Uint8Array(headerHash.length + 5);
  a.set(headerHash);
  new DataView(a.buffer).setUint32(headerHash.length, index, false);
  a[headerHash.length + 4] = last ? 1 : 0;
  return a;
}

export interface SessionKey {
  key: CryptoKey;
  kdf: KdfParams;
}

/** Новый ключ: новая соль + Argon2id. */
export async function createKey(password: string): Promise<SessionKey> {
  const kdf = newKdf();
  return { key: await deriveKey(password, kdf), kdf };
}

/** Зашифровать содержимое (байты ZIP) в контейнер .family. */
export async function sealContainer(payload: Uint8Array, sk: SessionKey, archiveId: string, appVersion: string): Promise<Blob> {
  const chunkCount = Math.max(1, Math.ceil(payload.length / CHUNK_SIZE));
  const header: ContainerHeader = {
    format: 'family',
    version: FORMAT_VERSION,
    archiveId,
    cipher: 'AES-256-GCM',
    kdf: sk.kdf,
    chunkSize: CHUNK_SIZE,
    chunkCount,
    createdWith: appVersion,
  };
  const headerBytes = enc.encode(JSON.stringify(header));
  const hh = await sha256(headerBytes);
  const parts: BlobPart[] = [enc.encode(MAGIC), u32(headerBytes.length), headerBytes];

  const v = await encrypt(sk.key, enc.encode(VERIFIER_TEXT), await chunkAad(hh, 0xffffffff, false));
  parts.push(v.nonce, u32(v.ct.length), v.ct);

  for (let i = 0; i < chunkCount; i++) {
    const piece = payload.subarray(i * CHUNK_SIZE, Math.min(payload.length, (i + 1) * CHUNK_SIZE));
    const c = await encrypt(sk.key, piece, await chunkAad(hh, i, i === chunkCount - 1));
    parts.push(c.nonce, u32(c.ct.length), c.ct);
  }
  return new Blob(parts as BlobPart[], { type: 'application/octet-stream' });
}

/** Прочитать заголовок без пароля (имя формата, версия, параметры KDF). */
export async function readHeader(file: Blob): Promise<{ header: ContainerHeader; headerBytes: Uint8Array; offset: number }> {
  if (file.size < MAGIC.length + 4) throw new ArchiveError('not-archive');
  const head = new Uint8Array(await file.slice(0, MAGIC.length + 4).arrayBuffer());
  if (dec.decode(head.subarray(0, MAGIC.length)) !== MAGIC) throw new ArchiveError('not-archive');
  const hlen = new DataView(head.buffer).getUint32(MAGIC.length, false);
  if (hlen < 2 || hlen > MAX_HEADER || MAGIC.length + 4 + hlen > file.size) throw new ArchiveError('corrupted');
  const headerBytes = new Uint8Array(await file.slice(MAGIC.length + 4, MAGIC.length + 4 + hlen).arrayBuffer());
  let header: ContainerHeader;
  try {
    header = JSON.parse(dec.decode(headerBytes));
  } catch {
    throw new ArchiveError('corrupted');
  }
  if (header?.format !== 'family') throw new ArchiveError('not-archive');
  if (typeof header.version !== 'number') throw new ArchiveError('corrupted');
  if (header.version > FORMAT_VERSION) throw new ArchiveError('newer-version');
  if (
    header.cipher !== 'AES-256-GCM' ||
    !checkKdf(header.kdf) ||
    !Number.isInteger(header.chunkCount) || header.chunkCount < 1 || header.chunkCount > 1_000_000 ||
    header.chunkSize !== CHUNK_SIZE
  )
    throw new ArchiveError('corrupted');
  return { header, headerBytes, offset: MAGIC.length + 4 + hlen };
}

async function readBlock(file: Blob, offset: number): Promise<{ nonce: Uint8Array; ct: Uint8Array; next: number }> {
  if (offset + 16 > file.size) throw new ArchiveError('corrupted');
  const pre = new Uint8Array(await file.slice(offset, offset + 16).arrayBuffer());
  const len = new DataView(pre.buffer).getUint32(12, false);
  if (len < 16 || len > CHUNK_SIZE + 16 || offset + 16 + len > file.size) throw new ArchiveError('corrupted');
  const ct = new Uint8Array(await file.slice(offset + 16, offset + 16 + len).arrayBuffer());
  return { nonce: pre.subarray(0, 12), ct, next: offset + 16 + len };
}

/** Проверить пароль и получить ключ (без расшифровки содержимого). */
export async function unlockContainer(file: Blob, password: string): Promise<SessionKey & { header: ContainerHeader }> {
  const { header, headerBytes, offset } = await readHeader(file);
  const hh = await sha256(headerBytes);
  const key = await deriveKey(password, header.kdf);
  const v = await readBlock(file, offset);
  try {
    const plain = await decrypt(key, v.nonce, v.ct, await chunkAad(hh, 0xffffffff, false));
    if (dec.decode(plain) !== VERIFIER_TEXT) throw new Error();
  } catch {
    throw new ArchiveError('wrong-password');
  }
  return { key, kdf: header.kdf, header };
}

/** Расшифровать содержимое контейнера (ключ уже проверен unlockContainer). */
export async function openContainer(file: Blob, key: CryptoKey, onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
  const { header, headerBytes, offset } = await readHeader(file);
  const hh = await sha256(headerBytes);
  let pos = (await readBlock(file, offset)).next; // пропускаем verifier
  const pieces: Uint8Array[] = [];
  let total = 0;
  for (let i = 0; i < header.chunkCount; i++) {
    const b = await readBlock(file, pos);
    try {
      pieces.push(await decrypt(key, b.nonce, b.ct, await chunkAad(hh, i, i === header.chunkCount - 1)));
    } catch {
      throw new ArchiveError('corrupted');
    }
    total += pieces[i].length;
    pos = b.next;
    onProgress?.(i + 1, header.chunkCount);
  }
  if (pos !== file.size) throw new ArchiveError('corrupted'); // лишние байты в конце
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of pieces) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
