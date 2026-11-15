/* Ключи архива: один случайный ключ данных и «ячейки» пользователей.

   Содержимое архива шифруется ключом данных (256 бит, случайный). Для каждого пользователя
   этот ключ «завёрнут» (AES-256-GCM) его собственным ключом из логина-пароля (Argon2id, своя соль).
   Поэтому владелец и участники открывают один и тот же файл каждый своим паролем,
   а сами пароли нигде не хранятся. Логины в файле тоже не лежат — только их хеш (поиск ячейки). */
import { b64, checkKdf, decrypt, deriveKey, encrypt, newKdf, randomBytes, sha256, unb64, type KdfParams } from './crypto';
import { normLogin } from '../domain/normalize';

export interface KeySlot {
  /** id пользователя архива (AccessUser.id) */
  userId: string;
  /** SHA-256 от «архив + логин»: чтобы найти свою ячейку, не перебирая всех (Argon2id дорогой) */
  tag: string;
  kdf: KdfParams;
  nonce: string;
  ct: string;
}

/** Открытая сессия: ключ данных (неизвлекаемый — для шифрования) и его байты (нужны, чтобы выдавать новые доступы). */
export interface SessionKey {
  key: CryptoKey;
  raw: Uint8Array;
  slots: KeySlot[];
  /** кто вошёл */
  userId: string;
}

const enc = new TextEncoder();
const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('');

export async function loginTag(archiveId: string, login: string): Promise<string> {
  return hex(await sha256(enc.encode(`rodiva-slot:${archiveId}:${normLogin(login)}`)));
}

const slotAad = (archiveId: string, userId: string) => enc.encode(`rodiva-key:${archiveId}:${userId}`);

export async function importDataKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Завернуть ключ данных паролем пользователя — новая ячейка (новая соль). */
export async function makeSlot(raw: Uint8Array, archiveId: string, userId: string, login: string, password: string): Promise<KeySlot> {
  const kdf = newKdf();
  const kek = await deriveKey(password, kdf);
  const w = await encrypt(kek, raw, slotAad(archiveId, userId));
  return { userId, tag: await loginTag(archiveId, login), kdf, nonce: b64(w.nonce), ct: b64(w.ct) };
}

/** Новая сессия нового архива: случайный ключ данных + ячейка владельца. */
export async function newSession(archiveId: string, userId: string, login: string, password: string): Promise<SessionKey> {
  const raw = randomBytes(32);
  return { key: await importDataKey(raw), raw, slots: [await makeSlot(raw, archiveId, userId, login, password)], userId };
}

/** Найти ячейку по логину и раскрыть её паролем. null — нет такого логина или неверный пароль. */
export async function openSlot(slots: KeySlot[], archiveId: string, login: string, password: string): Promise<{ raw: Uint8Array; userId: string } | null> {
  const tag = await loginTag(archiveId, login);
  for (const s of slots.filter(x => x.tag === tag)) {
    try {
      const kek = await deriveKey(password, s.kdf);
      const raw = await decrypt(kek, unb64(s.nonce), unb64(s.ct), slotAad(archiveId, s.userId));
      if (raw.length === 32) return { raw, userId: s.userId };
    } catch {
      /* не тот пароль — пробуем следующую ячейку с тем же логином (обычно она одна) */
    }
  }
  return null;
}

/** Проверка ячеек из файла: формат и разумные параметры (злонамеренный файл не должен «повесить» браузер). */
export function checkSlots(v: unknown): v is KeySlot[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > 64) return false;
  return v.every(
    s =>
      s &&
      typeof s === 'object' &&
      typeof s.userId === 'string' &&
      /^[0-9a-f]{64}$/.test(s.tag) &&
      checkKdf(s.kdf) &&
      typeof s.nonce === 'string' &&
      typeof s.ct === 'string' &&
      s.ct.length < 200,
  );
}
