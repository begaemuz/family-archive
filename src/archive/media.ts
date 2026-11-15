/* Проверка загружаемых файлов: тип определяется по содержимому (первым байтам), а не по имени.
   Разрешён только список безопасных форматов; HTML, SVG и скрипты не принимаются никогда. */
import { MAX_MEDIA_BYTES } from '../domain/constants';
import type { MediaKind } from '../domain/types';

export interface SniffResult {
  kind: MediaKind;
  mime: string;
  ext: string;
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, from: number, len: number) => String.fromCharCode(...b.slice(from, from + len));

/** Тип файла по сигнатуре. null — формат не поддерживается. */
export function sniff(head: Uint8Array, name = ''): SniffResult | null {
  const b = head;
  // изображения
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { kind: 'photo', mime: 'image/jpeg', ext: 'jpg' };
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'photo', mime: 'image/png', ext: 'png' };
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return { kind: 'photo', mime: 'image/gif', ext: 'gif' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return { kind: 'photo', mime: 'image/webp', ext: 'webp' };
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (brand === 'avif' || brand === 'avis') return { kind: 'photo', mime: 'image/avif', ext: 'avif' };
    if (['heic', 'heix', 'mif1', 'msf1'].includes(brand)) return { kind: 'photo', mime: 'image/heic', ext: 'heic' };
    if (brand === 'M4A ' || brand === 'M4B ') return { kind: 'audio', mime: 'audio/mp4', ext: 'm4a' };
    if (brand === 'qt  ') return { kind: 'video', mime: 'video/quicktime', ext: 'mov' };
    return { kind: 'video', mime: 'video/mp4', ext: 'mp4' }; // isom, mp41, mp42, avc1, 3gp…
  }
  // видео
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) {
    const isWebm = /webm/i.test(name) || /webm/.test(ascii(b, 0, Math.min(64, b.length)));
    return isWebm ? { kind: 'video', mime: 'video/webm', ext: 'webm' } : { kind: 'video', mime: 'video/x-matroska', ext: 'mkv' };
  }
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'AVI ') return { kind: 'video', mime: 'video/x-msvideo', ext: 'avi' };
  // аудио
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') return { kind: 'audio', mime: 'audio/wav', ext: 'wav' };
  if (ascii(b, 0, 4) === 'OggS') return { kind: 'audio', mime: 'audio/ogg', ext: 'ogg' };
  if (ascii(b, 0, 4) === 'fLaC') return { kind: 'audio', mime: 'audio/flac', ext: 'flac' };
  // документы
  if (ascii(b, 0, 5) === '%PDF-') return { kind: 'document', mime: 'application/pdf', ext: 'pdf' };
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
    const low = name.toLowerCase();
    if (low.endsWith('.docx'))
      return { kind: 'document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
    if (low.endsWith('.xlsx'))
      return { kind: 'document', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
    if (low.endsWith('.pptx'))
      return { kind: 'document', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' };
    if (low.endsWith('.odt')) return { kind: 'document', mime: 'application/vnd.oasis.opendocument.text', ext: 'odt' };
    return null; // произвольные ZIP не принимаем
  }
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0])) {
    const low = name.toLowerCase();
    if (low.endsWith('.doc')) return { kind: 'document', mime: 'application/msword', ext: 'doc' };
    if (low.endsWith('.xls')) return { kind: 'document', mime: 'application/vnd.ms-excel', ext: 'xls' };
    return null;
  }
  // обычный текст (.txt): только если это действительно текст без разметки
  if (/\.txt$/i.test(name) && isPlainText(b)) return { kind: 'document', mime: 'text/plain', ext: 'txt' };
  return null;
}

function isPlainText(b: Uint8Array): boolean {
  const s = new TextDecoder('utf-8', { fatal: false }).decode(b.slice(0, 4096));
  if (/<\s*(html|script|svg|iframe|!doctype)/i.test(s)) return false;
  // нет управляющих байтов, кроме табуляции и переводов строки
  for (let i = 0; i < Math.min(b.length, 4096); i++) {
    const c = b[i];
    if (c < 9 || (c > 13 && c < 32)) return false;
  }
  return true;
}

export type ValidationError = 'too-big' | 'unsupported' | 'wrong-kind' | 'empty';

export async function validateFile(
  file: Blob & { name?: string },
  allowed: MediaKind[],
): Promise<{ ok: true; info: SniffResult } | { ok: false; error: ValidationError }> {
  if (!file.size) return { ok: false, error: 'empty' };
  if (file.size > MAX_MEDIA_BYTES) return { ok: false, error: 'too-big' };
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const info = sniff(head, file.name || '');
  if (!info) return { ok: false, error: 'unsupported' };
  if (!allowed.includes(info.kind)) return { ok: false, error: 'wrong-kind' };
  return { ok: true, info };
}

export function validationMessage(e: ValidationError, name: string): string {
  switch (e) {
    case 'too-big':
      return `«${name}» больше 200 МБ — такой файл добавить нельзя`;
    case 'empty':
      return `«${name}» пустой`;
    case 'wrong-kind':
      return `«${name}» сюда не подходит`;
    default:
      return `«${name}» — неподдерживаемый формат`;
  }
}

export async function sha256Hex(data: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const h = await crypto.subtle.digest('SHA-256', buf as BufferSource);
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Можно ли показать файл прямо в браузере (картинка/видео/аудио/PDF/текст). */
export function isPreviewable(mime: string): boolean {
  return /^(image\/(jpeg|png|gif|webp|avif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|wav|ogg|flac)|application\/pdf|text\/plain)$/.test(mime);
}

export const extFromMime = (mime: string): string =>
  ({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/heic': 'heic',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
    'video/x-msvideo': 'avi',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
  })[mime] || 'bin';

export function formatSize(n: number): string {
  if (n < 1024) return n + ' Б';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' КБ';
  return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' МБ';
}
