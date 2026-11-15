/* Фото и видео человека с учётом отметок: свои файлы + файлы других людей, где он отмечен. */
import type { MediaItem, Person } from './types';

export interface PersonMedia {
  item: MediaItem;
  /** файл в альбоме этого человека (иначе — он только отмечен на чужом) */
  own: boolean;
  /** владелец файла — в чьём альбоме он лежит */
  ownerId: string | null;
}

/** Владелец файла: человек, в чьём альбоме он лежит. */
export function mediaOwnerId(persons: Person[], mediaId: string): string | null {
  return persons.find(p => p.media.includes(mediaId))?.id ?? null;
}

/** Свои медиа (в порядке альбома), затем те, где человек отмечен (новые сверху). */
export function personMedia(p: Person, media: MediaItem[], persons: Person[]): PersonMedia[] {
  const byId = new Map(media.map(m => [m.id, m]));
  const own: PersonMedia[] = p.media.map(id => byId.get(id)).filter((m): m is MediaItem => !!m).map(item => ({ item, own: true, ownerId: p.id }));
  const ownIds = new Set(p.media);
  const tagged: PersonMedia[] = media
    .filter(m => !ownIds.has(m.id) && m.people.includes(p.id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(item => ({ item, own: false, ownerId: mediaOwnerId(persons, item.id) }));
  return [...own, ...tagged];
}

export interface YearGroup<T> {
  /** год снимка; null — год не указан */
  year: number | null;
  items: T[];
}

/** Как телефонная книга: группы по годам по порядку, внутри — в порядке добавления; без года — в конце. */
export function groupByYear<T extends { item: MediaItem }>(entries: T[]): YearGroup<T>[] {
  const by = new Map<number | null, T[]>();
  entries.forEach(e => {
    const y = e.item.year ?? null;
    by.set(y, [...(by.get(y) ?? []), e]);
  });
  return [...by.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(([year, items]) => ({ year, items: items.slice().sort((a, b) => a.item.createdAt - b.item.createdAt) }));
}
