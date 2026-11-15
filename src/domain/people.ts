/* Подписи и даты: ФИО, инициалы, неполные даты «ДД.ММ.ГГГГ» с «**» для неизвестного. */
import type { Gender, Person } from './types';

type Named = Pick<Person, 'lastName' | 'firstName' | 'middleName'>;

export function fullName(p: Named): string {
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ') || 'Без имени';
}

export function initials(p: Named): string {
  return [p.lastName?.[0], p.firstName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
}

/** Приводит ввод к виду ДД.ММ.ГГГГ; неизвестные части — «**». Нераспознанное возвращает как есть. */
export function normDate(input: unknown): string {
  const s = String(input ?? '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `**.${m[2]}.${m[1]}`;

  const unk = (v: string) => /^[-*?xXхХ]+$/.test(v);
  const part = (v: string, max: number): string | null => {
    if (unk(v)) return '**';
    if (!/^\d{1,2}$/.test(v) || +v < 1 || +v > max) return null;
    return v.padStart(2, '0');
  };
  const build = (d: string, mo: string, y: string): string | null => {
    const D = part(d, 31);
    const M = part(mo, 12);
    if (D === null || M === null) return null;
    return `${D}.${M}.${y}`;
  };

  // с разделителями: Д.М.ГГГГ, ДД/ММ/ГГГГ, **.05.1990, М.ГГГГ
  const parts = s.split(/[\s./]+/).filter(Boolean);
  if (parts.length === 3 && /^\d{4}$/.test(parts[2])) return build(parts[0], parts[1], parts[2]) ?? s;
  if (parts.length === 2 && /^\d{4}$/.test(parts[1])) return build('**', parts[0], parts[1]) ?? s;

  // без разделителей: ДДММГГГГ, ММГГГГ, ГГГГ
  const t = s.replace(/[-*?xXхХ]/g, '*');
  if (/^[\d*]{4}\d{4}$/.test(t)) return build(t.slice(0, 2), t.slice(2, 4), t.slice(4)) ?? s;
  if (/^[\d*]{2}\d{4}$/.test(t)) return build('**', t.slice(0, 2), t.slice(2)) ?? s;
  if (/^\d{4}$/.test(t)) return `**.**.${t}`;
  return s;
}

/** Корректна ли дата в формате ДД.ММ.ГГГГ (пустая — тоже корректна). */
export function isValidDate(v: string): boolean {
  if (!v) return true;
  const m = v.match(/^(\*\*|\d{2})\.(\*\*|\d{2})\.\d{4}$/);
  return !!m && (m[1] === '**' || (+m[1] >= 1 && +m[1] <= 31)) && (m[2] === '**' || (+m[2] >= 1 && +m[2] <= 12));
}

/** Для подписи под именем: только известные части даты. */
export function fmtDate(s: string): string {
  return String(s || '').replace(/^\*\*\.\*\*\./, '').replace(/^\*\*\./, '');
}

export function birthYear(p: Pick<Person, 'birth'>): number | null {
  const m = String(p.birth || '').match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

export function yearLine(p: Pick<Person, 'birth' | 'death' | 'deceased'>): string {
  const b = fmtDate(p.birth);
  const d = fmtDate(p.death);
  if (d) return [b, d].filter(Boolean).join(' — ');
  if (p.deceased) return b ? b + ' — †' : '†'; // умер, но дата неизвестна
  return b;
}

export function ageText(p: Pick<Person, 'birth' | 'death' | 'deceased' | 'gender'>, now = new Date()): string {
  const b = birthYear(p);
  if (!b) return '';
  const dm = String(p.death || '').match(/(\d{4})/);
  if (p.deceased && !dm) return ''; // год смерти неизвестен — возраст не считаем
  const end = dm ? Number(dm[1]) : now.getFullYear();
  const n = end - b;
  if (n < 0 || n > 130) return '';
  const word =
    n % 10 === 1 && n % 100 !== 11 ? 'год' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'года' : 'лет';
  return dm ? `Прожил${p.gender === 'Женский' ? 'а' : ''} ${n} ${word}` : `${n} ${word}`;
}

export const place = (city: string, country: string) => [city, country].filter(Boolean).join(', ');

export const genderClass = (g: Gender) => (g === 'Мужской' ? 'male' : g === 'Женский' ? 'female' : '');

/** Тройная форма слова по полу: мужской / женский / неизвестный. */
export const byGender = (g: Gender, m: string, f: string, u: string) => (g === 'Мужской' ? m : g === 'Женский' ? f : u);
