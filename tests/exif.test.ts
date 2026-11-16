/* Год съёмки из EXIF: только «Дата съёмки», не дата оцифровки и не дата файла. */
import { exifYearFromBytes } from '../src/archive/exif';

/** Минимальный JPEG с EXIF: IFD0 → указатель на Exif IFD → нужный тег с датой. */
function jpeg(date: string | null, { le = true, tag = 0x9003 } = {}): Uint8Array {
  const tiff: number[] = [];
  const u16 = (n: number) => (le ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) => (le ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  const str = date ? [...date].map(c => c.charCodeAt(0)).concat(0) : [];
  // заголовок TIFF (8) | IFD0: 1 запись (2+12+4=18) → смещение 8 | Exif IFD с 26: 1 запись (18) | строка с 44
  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  tiff.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26), ...u32(0));
  tiff.push(...u16(date ? 1 : 0));
  if (date) tiff.push(...u16(tag), ...u16(2), ...u32(str.length), ...u32(44));
  tiff.push(...u32(0));
  while (tiff.length < 44) tiff.push(0);
  tiff.push(...str);
  const app1 = [...'Exif'].map(c => c.charCodeAt(0)).concat(0, 0, ...tiff);
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
}

describe('год съёмки из фото', () => {
  it('берёт год из «Даты съёмки» (оба порядка байтов)', () => {
    expect(exifYearFromBytes(jpeg('2015:07:23 14:03:24'))).toBe(2015);
    expect(exifYearFromBytes(jpeg('1998:01:02 10:00:00', { le: false }))).toBe(1998);
  });

  it('дата оцифровки (скан старого фото) не считается датой съёмки', () => {
    expect(exifYearFromBytes(jpeg('2023:05:01 12:00:00', { tag: 0x9004 }))).toBeNull();
  });

  it('нет даты, пустая дата или мусор — года нет', () => {
    expect(exifYearFromBytes(jpeg(null))).toBeNull();
    expect(exifYearFromBytes(jpeg('0000:00:00 00:00:00'))).toBeNull();
    expect(exifYearFromBytes(jpeg('2999:01:01 00:00:00'))).toBeNull();
    expect(exifYearFromBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(exifYearFromBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4, 1, 2]))).toBeNull();
  });
});
