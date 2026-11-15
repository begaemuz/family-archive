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
