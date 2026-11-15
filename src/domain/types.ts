/* Модель данных семейного архива.
   ID у людей, связей, медиа и историй — постоянные UUID: по ним в будущем
   будут сравниваться и сливаться версии архива от разных родственников. */

export type Gender = 'Мужской' | 'Женский' | '';
export type RelType = 'parent' | 'spouse' | 'sibling' | 'other';

export interface BioSection {
  title: string;
  text: string;
}

export interface Burial {
  cemetery: string;
  address: string;
  plot: string;
  notes: string;
  lat: number | null;
  lng: number | null;
}

export type SocialNetwork =
  | 'telegram'
  | 'whatsapp'
  | 'instagram'
  | 'vk'
  | 'ok'
  | 'facebook'
  | 'x'
  | 'tiktok'
  | 'youtube';

export interface Social {
  network: SocialNetwork;
  handle: string;
}

export interface Person {
  id: string;
  /** порядковый номер создания — для стабильной сортировки (раньше роль играл числовой id) */
  seq: number;
  /** числовой id из старой версии приложения (при импорте) */
  legacyId?: number;

  firstName: string;
  lastName: string;
  middleName: string;
  maidenName: string;
  gender: Gender;

  birth: string;
  death: string;
  deceased: boolean;

  birthCountry: string;
  birthCity: string;
  deathCountry: string;
  deathCity: string;
  residenceCountry: string;
  residenceCity: string;

  phone: string;
  email: string;
  address: string;
  occupation: string;
  socials: Social[];

  bio: BioSection[];
  burial: Burial;

  /** фото профиля (квадрат) — id медиа */
  mainPhotoId: string | null;
  /** альбом: фото, видео, аудио — id медиа */
  media: string[];
  /** документы — id медиа */
  documents: string[];

  /* раскладка на холсте */
  x: number;
  y: number;
  slot?: number;
  offX?: number;
  offK?: string;
  collapsed: boolean;

  createdAt: number;
  updatedAt: number;
}

export interface Relation {
  id: string;
  from: string;
  to: string;
  type: RelType;
}

export type MediaKind = 'photo' | 'video' | 'audio' | 'document';

export interface MediaItem {
  id: string;
  kind: MediaKind;
  mime: string;
  name: string;
  size: number;
  sha256: string;
  createdAt: number;
  /** кто ещё на фото/видео (кроме владельца — того, в чьём альбоме файл); у них файл тоже виден */
  people: string[];
}

export interface Story {
  id: string;
  title: string;
  text: string;
  date: string;
  personIds: string[];
  mediaIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type HistoryAction = 'create' | 'update' | 'delete';
export type HistoryEntity = 'person' | 'relation' | 'media' | 'story' | 'archive';

export interface HistoryEntry {
  ts: number;
  action: HistoryAction;
  entity: HistoryEntity;
  id: string;
  summary: string;
}

export interface ArchiveMeta {
  id: string;
  title: string;
  description: string;
  coverId: string | null;
  createdAt: number;
  updatedAt: number;
  /** следующий порядковый номер для Person.seq */
  nextSeq: number;
}

/** Всё содержимое архива (без самих файлов медиа — они лежат отдельно как Blob). */
export interface ArchiveData {
  meta: ArchiveMeta;
  persons: Person[];
  relations: Relation[];
  media: MediaItem[];
  stories: Story[];
  history: HistoryEntry[];
}
