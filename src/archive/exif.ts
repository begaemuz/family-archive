/* Год съёмки из самого фото (EXIF «Дата съёмки», DateTimeOriginal). Только JPEG — так снимают телефоны и камеры.
   Сознательно НЕ берём:
   • дату файла (создан/изменён) — это день копирования или скачивания, а не съёмки;
   • «дату оцифровки» (DateTimeDigitized) — у сканов старых фото это день сканирования.
   Нет даты съёмки (соцсети, мессенджеры, сканы, скриншоты) — год не ставим. */
import { YEAR_MIN } from '../domain/normalize';

const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_ORIGINAL = 0x9003;

/** Год из байтов JPEG или null. */
export function exifYearFromBytes(b: Uint8Array): number | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let pos = 2;
  // идём по сегментам JPEG до APP1 «Exif»
  while (pos + 4 <= b.length && b[pos] === 0xff) {
    const marker = b[pos + 1];
    if (marker === 0xda || marker === 0xd9) break; // дальше данные изображения
    const len = view.getUint16(pos + 2);
    if (len < 2) break;
    if (marker === 0xe1 && pos + 10 <= b.length && String.fromCharCode(...b.subarray(pos + 4, pos + 8)) === 'Exif') {
      return readTiff(view, pos + 10, Math.min(b.length, pos + 2 + len));
    }
    pos += 2 + len;
  }
  return null;
}

function readTiff(v: DataView, start: number, end: number): number | null {
  try {
    const order = v.getUint16(start);
    const le = order === 0x4949; // «II» — младший байт первым
    if (!le && order !== 0x4d4d) return null;
    const u16 = (o: number) => v.getUint16(start + o, le);
    const u32 = (o: number) => v.getUint32(start + o, le);
    const len = end - start;

    const findTag = (ifd: number, tag: number): number | null => {
      if (ifd + 2 > len) return null;
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > len) return null;
        if (u16(e) === tag) return e;
      }
      return null;
    };

    const exifPtr = findTag(u32(4), TAG_EXIF_IFD);
    if (exifPtr === null) return null;
    const dateEntry = findTag(u32(exifPtr + 8), TAG_DATE_ORIGINAL);
    if (dateEntry === null) return null;
    const count = u32(dateEntry + 4);
    const at = count > 4 ? u32(dateEntry + 8) : dateEntry + 8;
    if (count < 4 || at + 4 > len) return null;
    // «ГГГГ:ММ:ДД чч:мм:сс»
    let s = '';
    for (let i = 0; i < 4; i++) s += String.fromCharCode(v.getUint8(start + at + i));
    const year = Number(s);
    return Number.isInteger(year) && year >= YEAR_MIN && year <= new Date().getFullYear() ? year : null;
  } catch {
    return null;
  }
}

/** Год съёмки фото (читаются только первые 256 КБ — EXIF всегда в начале файла). */
export async function exifYear(file: Blob): Promise<number | null> {
  try {
    return exifYearFromBytes(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()));
  } catch {
    return null;
  }
}
