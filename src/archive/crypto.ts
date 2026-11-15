/* Криптография архива — только проверенные реализации:
   • Argon2id (hash-wasm) — ключ из пароля, устойчив к перебору на видеокартах;
   • AES-256-GCM (Web Crypto браузера) — шифрование с проверкой подлинности.
   Ключ импортируется как НЕИЗВЛЕКАЕМЫЙ CryptoKey: его нельзя прочитать из памяти страницы. */
import { argon2id } from 'hash-wasm';

export interface KdfParams {
  alg: 'argon2id';
  /** память, КиБ */
  m: number;
  /** проходы */
  t: number;
  /** параллельность */
  p: number;
  /** соль, base64 */
  salt: string;
}

/** 64 МиБ памяти, 3 прохода — рекомендация OWASP; на телефоне ~1–2 с */
export const KDF_DEFAULTS = { alg: 'argon2id' as const, m: 65536, t: 3, p: 1 };

export const NONCE_BYTES = 12;

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function newKdf(): KdfParams {
  return { ...KDF_DEFAULTS, salt: b64(randomBytes(16)) };
}

/** Проверка параметров из файла: не даём злонамеренному файлу «повесить» браузер. */
export function checkKdf(k: unknown): k is KdfParams {
  if (!k || typeof k !== 'object') return false;
  const o = k as KdfParams;
  return (
    o.alg === 'argon2id' &&
    Number.isInteger(o.m) && o.m >= 8192 && o.m <= 1048576 &&
    Number.isInteger(o.t) && o.t >= 1 && o.t <= 20 &&
    Number.isInteger(o.p) && o.p >= 1 && o.p <= 16 &&
    typeof o.salt === 'string' && unb64(o.salt).length >= 16
  );
}

export async function deriveKey(password: string, kdf: KdfParams): Promise<CryptoKey> {
  const raw = (await argon2id({
    password: password.normalize('NFC'),
    salt: unb64(kdf.salt),
    parallelism: kdf.p,
    iterations: kdf.t,
    memorySize: kdf.m,
    hashLength: 32,
    outputType: 'binary',
  })) as Uint8Array;
  try {
    return await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } finally {
    raw.fill(0); // сырой ключ больше не нужен
  }
}

export async function encrypt(key: CryptoKey, data: Uint8Array, aad: Uint8Array): Promise<{ nonce: Uint8Array; ct: Uint8Array }> {
  const nonce = randomBytes(NONCE_BYTES); // свой случайный nonce для каждой операции
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource, additionalData: aad as BufferSource }, key, data as BufferSource),
  );
  return { nonce, ct };
}

/** Бросает ошибку, если данные изменены, ключ неверный или не совпадает «связанный» заголовок. */
export async function decrypt(key: CryptoKey, nonce: Uint8Array, ct: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource, additionalData: aad as BufferSource }, key, ct as BufferSource),
  );
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));
}

/** Надёжность пароля 0–4 (простая оценка для подсказки). */
export function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-zа-яё]/.test(pw) && /[A-ZА-ЯЁ]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^\p{L}\d]/u.test(pw)) score++;
  if (pw.length >= 16) score = Math.min(4, score + 1);
  if (pw.length < 6) score = 0;
  return { score, label: ['Слишком простой', 'Слабый', 'Средний', 'Хороший', 'Надёжный'][score] };
}
