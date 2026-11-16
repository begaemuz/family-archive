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
  /** выбранное поколение (с 0) — действует, пока у человека нет связей; дальше поколение задают связи */
  gen?: number;

  createdAt: number;
  updatedAt: number;
  /** кто создал / последним изменил (id пользователя архива) — для слияния копий */
  createdBy?: string;
  updatedBy?: string;
}

export interface Relation {
  id: string;
  from: string;
  to: string;
  type: RelType;
  createdAt?: number;
  createdBy?: string;
}

export type MediaKind = 'photo' | 'video' | 'audio' | 'document';

/** Лицо на фото. Рамка — в долях размеров фото. d — «отпечаток» лица (128 чисел, base64) —
    по нему узнаётся человек; хранится только внутри зашифрованного архива. */
export interface MediaFace {
  x: number;
  y: number;
  w: number;
  h: number;
  d: string;
  /** кто это (узнан или подтверждён «Да») */
  p?: string;
  /** кого система предлагает: «Кажется, это …?» */
  s?: string;
  /** кем это лицо точно не является (ответ «Это не …») */
  n?: string[];
}

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
  /** год снимка — для будущего «как выглядел в разные годы»; null — не указан */
  year: number | null;
  /** старое поле «когда снято» свободным текстом; при выборе года очищается */
  date: string;
  /** кого распознавание лиц НЕ должно предлагать на этом фото (ответ «нет») */
  notPeople?: string[];
  /** найденные на фото лица — сохраняются, чтобы не искать заново и узнавать людей в следующий раз */
  faces?: MediaFace[];
  /** каким поиском лиц найдены faces (FACES_VERSION); старые ищутся заново, ответы переносятся */
  facesV?: number;
  updatedAt?: number;
  createdBy?: string;
  updatedBy?: string;
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
  createdBy?: string;
  updatedBy?: string;
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
/* ---------- доступы ---------- */

export type AccessRight = 'change' | 'add' | 'delete';

/** Пользователь архива. Владелец — все права; участник — читает всё, меняет только свою ветку. */
export interface AccessUser {
  id: string;
  /** логин (в нижнем регистре); у владельца может быть пустым — тогда вход только по паролю */
  login: string;
  /** как показывать в интерфейсе: «Альбина» */
  name: string;
  role: 'owner' | 'member';
  /** корень ветки: человек, вся его кровная родня и их супруги; null — весь архив */
  root: string | null;
  can: Record<AccessRight, boolean>;
  createdAt: number;
  /** с какого момента правки участника ещё не слиты в основной архив */
  syncedAt: number;
}

/** Метка удаления — чтобы при слиянии копий удалённое не «воскресало». */
export interface Tombstone {
  entity: 'person' | 'relation' | 'media' | 'story';
  id: string;
  ts: number;
  by: string;
}

export interface ArchiveData {
  meta: ArchiveMeta;
  persons: Person[];
  relations: Relation[];
  media: MediaItem[];
  stories: Story[];
  history: HistoryEntry[];
  access: { users: AccessUser[] };
  deleted: Tombstone[];
}
