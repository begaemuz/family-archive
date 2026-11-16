/* Создание и проверка данных. Всё, что приходит из файла (архив, старый ZIP/JSON), считается
   недоверенным: каждое поле приводится к ожидаемому типу, лишнее отбрасывается. */
import { normDate } from './people';
import type { ArchiveData, ArchiveMeta, BioSection, Burial, Gender, HistoryEntry, MediaFace, MediaItem, MediaKind, Person, RelType, Relation, Social, SocialNetwork, Story, AccessUser, Tombstone } from './types';

export const newId = (): string => crypto.randomUUID();

const str = (v: unknown, max = 20000): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const num = (v: unknown, def = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-zA-Z-]{8,64}$/.test(v);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isId) : []);

export const GENDERS: Gender[] = ['', 'Мужской', 'Женский'];
export const REL_TYPES: RelType[] = ['parent', 'spouse', 'sibling', 'other'];
export const SOCIAL_NETWORKS: { id: SocialNetwork; label: string; url: (h: string) => string }[] = [
  { id: 'telegram', label: 'Telegram', url: h => `https://t.me/${h}` },
  { id: 'whatsapp', label: 'WhatsApp', url: h => `https://wa.me/${h.replace(/\D/g, '')}` },
  { id: 'instagram', label: 'Instagram', url: h => `https://instagram.com/${h}` },
  { id: 'vk', label: 'ВКонтакте', url: h => `https://vk.com/${h}` },
  { id: 'ok', label: 'Одноклассники', url: h => `https://ok.ru/${h}` },
  { id: 'facebook', label: 'Facebook', url: h => `https://facebook.com/${h}` },
  { id: 'x', label: 'X (Twitter)', url: h => `https://x.com/${h}` },
  { id: 'tiktok', label: 'TikTok', url: h => `https://tiktok.com/@${h}` },
  { id: 'youtube', label: 'YouTube', url: h => `https://youtube.com/@${h}` },
];

/** Ник без «@», пробелов и адреса сайта — «https://t.me/ivan» → «ivan». */
export function cleanHandle(h: string): string {
  return h
    .trim()
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .replace(/\s+/g, '') // пробелы в нике не бывают, а в номере телефона — лишние
    .slice(0, 100);
}

export function socialUrl(s: Social): string | null {
  const net = SOCIAL_NETWORKS.find(n => n.id === s.network);
  const h = cleanHandle(s.handle);
  return net && h ? net.url(encodeURIComponent(h).replace(/%2B/g, '+')) : null;
}

export function normBio(bio: unknown, legacy?: unknown): BioSection[] {
  if (Array.isArray(bio))
    return bio
      .filter(b => b && typeof b === 'object')
      .map(b => ({ title: str((b as BioSection).title, 300), text: str((b as BioSection).text) }))
      .filter(b => b.title.trim() || b.text.trim());
  const l = str(legacy);
  return l.trim() ? [{ title: 'Биография', text: l }] : [];
}

export function normBurial(b: unknown): Burial {
  const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
  const n = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const lat = n(o.lat);
  const lng = n(o.lng);
  const ok = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return {
    cemetery: str(o.cemetery, 300).trim(),
    address: str(o.address, 500).trim(),
    plot: str(o.plot, 300).trim(),
    notes: str(o.notes, 5000).trim(),
    lat: ok ? lat : null,
    lng: ok ? lng : null,
  };
}

export function burialFilled(b: Burial): boolean {
  return !!(b.cemetery || b.address || b.plot || b.notes || b.lat != null);
}

export function normSocials(v: unknown): Social[] {
  if (!Array.isArray(v)) return [];
  const known = new Set(SOCIAL_NETWORKS.map(n => n.id));
  return v
    .filter(s => s && typeof s === 'object' && known.has((s as Social).network))
    .map(s => ({ network: (s as Social).network, handle: cleanHandle(str((s as Social).handle, 200)) }))
    .filter(s => s.handle);
}

export function createPerson(seq: number, x = 500, y = 500): Person {
  const now = Date.now();
  return {
    id: newId(),
    seq,
    firstName: '',
    lastName: '',
    middleName: '',
    maidenName: '',
    gender: '',
    birth: '',
    death: '',
    deceased: false,
    birthCountry: '',
    birthCity: '',
    deathCountry: '',
    deathCity: '',
    residenceCountry: '',
    residenceCity: '',
    phone: '',
    email: '',
    address: '',
    occupation: '',
    socials: [],
    bio: [],
    burial: normBurial(null),
    mainPhotoId: null,
    media: [],
    documents: [],
    x,
    y,
    collapsed: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** Проверка человека из архива. */
export function normalizePerson(raw: unknown, seqFallback: number): Person | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (!isId(p.id)) return null;
  const base = createPerson(num(p.seq, seqFallback));
  const gender = GENDERS.includes(p.gender as Gender) ? (p.gender as Gender) : '';
  const burial = normBurial(p.burial);
  const death = normDate(p.death);
  return {
    ...base,
    id: p.id,
    legacyId: typeof p.legacyId === 'number' ? p.legacyId : undefined,
    firstName: str(p.firstName, 200),
    lastName: str(p.lastName, 200),
    middleName: str(p.middleName, 200),
    maidenName: str(p.maidenName, 200),
    gender,
    birth: normDate(p.birth),
    death,
    deceased: typeof p.deceased === 'boolean' ? p.deceased : !!(death || p.deathCity || p.deathCountry || burial.cemetery || burial.lat != null),
    birthCountry: str(p.birthCountry, 200),
    birthCity: str(p.birthCity, 200),
    deathCountry: str(p.deathCountry, 200),
    deathCity: str(p.deathCity, 200),
    residenceCountry: str(p.residenceCountry, 200),
    residenceCity: str(p.residenceCity, 200),
    phone: str(p.phone, 100),
    email: str(p.email, 200),
    address: str(p.address, 500),
    occupation: str(p.occupation, 300),
    socials: normSocials(p.socials),
    bio: normBio(p.bio, p.description),
    burial,
    mainPhotoId: isId(p.mainPhotoId) ? p.mainPhotoId : null,
    media: ids(p.media),
    documents: ids(p.documents),
    x: num(p.x, 500),
    y: num(p.y, 500),
    slot: typeof p.slot === 'number' ? p.slot : undefined,
    offX: typeof p.offX === 'number' ? p.offX : undefined,
    offK: typeof p.offK === 'string' ? p.offK : undefined,
    collapsed: !!p.collapsed,
    gen: typeof p.gen === 'number' && Number.isInteger(p.gen) && p.gen >= 0 && p.gen < 100 ? p.gen : undefined,
    createdAt: num(p.createdAt, base.createdAt),
    updatedAt: num(p.updatedAt, base.updatedAt),
    ...stamps(p),
  };
}

export function normalizeRelation(raw: unknown, personIds: Set<string>): Relation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isId(r.id) || !isId(r.from) || !isId(r.to) || r.from === r.to) return null;
  if (!personIds.has(r.from) || !personIds.has(r.to)) return null;
  const type = REL_TYPES.includes(r.type as RelType) ? (r.type as RelType) : 'other';
  return { id: r.id, from: r.from, to: r.to, type, ...(typeof r.createdAt === 'number' ? { createdAt: r.createdAt } : null), ...stamps(r) };
}

export const MEDIA_KINDS: MediaKind[] = ['photo', 'video', 'audio', 'document'];

const frac = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

function normalizeFaces(raw: unknown[]): MediaFace[] {
  return raw
    .slice(0, 100)
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .filter(f => frac(f.x) && frac(f.y) && frac(f.w) && frac(f.h) && typeof f.d === 'string' && /^[A-Za-z0-9+/=]{100,2000}$/.test(f.d))
    .map(f => ({
      x: f.x as number,
      y: f.y as number,
      w: f.w as number,
      h: f.h as number,
      d: f.d as string,
      ...(isId(f.p) ? { p: f.p } : null),
      ...(isId(f.s) ? { s: f.s } : null),
      ...(ids(f.n).length ? { n: [...new Set(ids(f.n))].slice(0, 50) } : null),
      ...(f.nf === true ? { nf: true } : null),
    }));
}

export function normalizeMedia(raw: unknown): MediaItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (!isId(m.id) || !MEDIA_KINDS.includes(m.kind as MediaKind)) return null;
  return {
    id: m.id,
    kind: m.kind as MediaKind,
    mime: str(m.mime, 100),
    name: str(m.name, 300),
    size: num(m.size),
    sha256: str(m.sha256, 64),
    createdAt: num(m.createdAt, Date.now()),
    people: [...new Set(ids(m.people))],
    date: str(m.date, 60),
    year: mediaYear(m.year, m.date),
    ...(ids(m.notPeople).length ? { notPeople: [...new Set(ids(m.notPeople))] } : null),
    ...(Array.isArray(m.faces) ? { faces: normalizeFaces(m.faces) } : null),
    ...(typeof m.facesV === 'number' && Number.isInteger(m.facesV) ? { facesV: m.facesV } : null),
    ...(typeof m.updatedAt === 'number' ? { updatedAt: m.updatedAt } : null),
    ...stamps(m),
  };
}

export function normalizeStory(raw: unknown): Story | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (!isId(s.id)) return null;
  return {
    id: s.id,
    title: str(s.title, 300),
    text: str(s.text, 200000),
    date: str(s.date, 50),
    personIds: ids(s.personIds),
    mediaIds: ids(s.mediaIds),
    createdAt: num(s.createdAt, Date.now()),
    updatedAt: num(s.updatedAt, Date.now()),
    ...stamps(s),
  };
}

export const YEAR_MIN = 1850;
/** версия поиска лиц: 1 — быстрый детектор (пропускал мелкие лица), 2 — SSD + увеличенные куски фото,
    3 — исправлен отбор узких рамок, 4 — проверка формы лица по 68 точкам, IoU при удалении дублей */
export const FACES_VERSION = 4;
/** Год снимка: число из поля year или год из старого текста («лето 1985» → 1985). */
export function mediaYear(year: unknown, date: unknown): number | null {
  const max = new Date().getFullYear() + 1;
  if (typeof year === 'number' && Number.isInteger(year) && year >= YEAR_MIN && year <= max) return year;
  const m = typeof date === 'string' ? date.match(/(?:^|\D)(1[89]\d\d|20\d\d)(?:\D|$)/) : null;
  const y = m ? Number(m[1]) : NaN;
  return y >= YEAR_MIN && y <= max ? y : null;
}

/** «кто создал / изменил» — только корректные id */
function stamps(o: Record<string, unknown>): { createdBy?: string; updatedBy?: string } {
  return { ...(isId(o.createdBy) ? { createdBy: o.createdBy } : null), ...(isId(o.updatedBy) ? { updatedBy: o.updatedBy } : null) };
}

const RIGHTS = ['change', 'add', 'delete'] as const;

export function normalizeUser(raw: unknown): AccessUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  if (!isId(u.id)) return null;
  const can = (u.can && typeof u.can === 'object' ? u.can : {}) as Record<string, unknown>;
  const role = u.role === 'owner' ? 'owner' : 'member';
  return {
    id: u.id,
    login: normLogin(str(u.login, 60)),
    name: str(u.name, 100),
    role,
    root: role === 'owner' ? null : isId(u.root) ? u.root : null,
    can: Object.fromEntries(RIGHTS.map(r => [r, role === 'owner' || can[r] === true])) as AccessUser['can'],
    createdAt: num(u.createdAt, Date.now()),
    syncedAt: num(u.syncedAt, num(u.createdAt, Date.now())),
  };
}

/** Логин: без пробелов по краям, в нижнем регистре. */
export const normLogin = (s: string) => s.normalize('NFC').trim().toLowerCase();

export function normalizeTombstone(raw: unknown): Tombstone | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (!isId(t.id) || !['person', 'relation', 'media', 'story'].includes(t.entity as string)) return null;
  return { entity: t.entity as Tombstone['entity'], id: t.id, ts: num(t.ts, 0), by: isId(t.by) ? t.by : '' };
}

/** Владелец по умолчанию: архив без списка доступов (старые файлы) — один владелец без логина. */
export function ownerUser(id = newId()): AccessUser {
  const now = Date.now();
  return { id, login: '', name: 'Владелец', role: 'owner', root: null, can: { change: true, add: true, delete: true }, createdAt: now, syncedAt: now };
}

export function normalizeHistory(raw: unknown): HistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, unknown>;
  const actions = ['create', 'update', 'delete'];
  const entities = ['person', 'relation', 'media', 'story', 'archive'];
  if (!actions.includes(h.action as string) || !entities.includes(h.entity as string)) return null;
  return {
    ts: num(h.ts),
    action: h.action as HistoryEntry['action'],
    entity: h.entity as HistoryEntry['entity'],
    id: str(h.id, 64),
    summary: str(h.summary, 500),
  };
}

export function createMeta(title: string, description = ''): ArchiveMeta {
  const now = Date.now();
  return { id: newId(), title: title.trim() || 'Семейный архив', description, coverId: null, createdAt: now, updatedAt: now, nextSeq: 1 };
}

export function normalizeMeta(raw: unknown): ArchiveMeta {
  const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const base = createMeta(str(m.title, 200));
  return {
    id: isId(m.id) ? m.id : base.id,
    title: base.title,
    description: str(m.description, 5000),
    coverId: isId(m.coverId) ? m.coverId : null,
    createdAt: num(m.createdAt, base.createdAt),
    updatedAt: num(m.updatedAt, base.updatedAt),
    nextSeq: Math.max(1, num(m.nextSeq, 1)),
  };
}

/** Полная проверка содержимого архива: ссылки только на существующих людей и медиа. */
export function normalizeArchive(raw: {
  meta: unknown;
  persons: unknown;
  relations: unknown;
  media: unknown;
  stories: unknown;
  history: unknown;
  access?: unknown;
  deleted?: unknown;
}): ArchiveData {
  const meta = normalizeMeta(raw.meta);
  const persons: Person[] = [];
  const seen = new Set<string>();
  (Array.isArray(raw.persons) ? raw.persons : []).forEach((r, i) => {
    const p = normalizePerson(r, i + 1);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      persons.push(p);
    }
  });
  const relations: Relation[] = [];
  const relSeen = new Set<string>();
  (Array.isArray(raw.relations) ? raw.relations : []).forEach(r => {
    const rel = normalizeRelation(r, seen);
    if (!rel) return;
    const k = rel.type + ':' + [rel.from, rel.to].sort().join(':');
    if (relSeen.has(k)) return;
    relSeen.add(k);
    relations.push(rel);
  });
  const media = (Array.isArray(raw.media) ? raw.media : []).map(normalizeMedia).filter((m): m is MediaItem => !!m);
  const mediaIds = new Set(media.map(m => m.id));
  persons.forEach(p => {
    if (p.mainPhotoId && !mediaIds.has(p.mainPhotoId)) p.mainPhotoId = null;
    p.media = p.media.filter(id => mediaIds.has(id));
    p.documents = p.documents.filter(id => mediaIds.has(id));
  });
  if (meta.coverId && !mediaIds.has(meta.coverId)) meta.coverId = null;
  // отметки людей на фото: только существующие люди и не сам владелец файла
  const ownerOf = new Map<string, string>();
  persons.forEach(p => p.media.forEach(id => ownerOf.set(id, p.id)));
  media.forEach(m => {
    m.people = m.people.filter(id => seen.has(id) && id !== ownerOf.get(m.id));
  });
  const stories = (Array.isArray(raw.stories) ? raw.stories : [])
    .map(normalizeStory)
    .filter((s): s is Story => !!s)
    .map(s => ({ ...s, personIds: s.personIds.filter(id => seen.has(id)), mediaIds: s.mediaIds.filter(id => mediaIds.has(id)) }));
  const history = (Array.isArray(raw.history) ? raw.history : []).map(normalizeHistory).filter((h): h is HistoryEntry => !!h);
  meta.nextSeq = Math.max(meta.nextSeq, ...persons.map(p => p.seq + 1), 1);
  // доступы: ровно один владелец; у участников корень ветки — существующий человек
  const accessRaw = (raw.access && typeof raw.access === 'object' ? (raw.access as { users?: unknown }).users : null) ?? [];
  const users: AccessUser[] = [];
  (Array.isArray(accessRaw) ? accessRaw : []).forEach(r => {
    const u = normalizeUser(r);
    if (!u || users.some(x => x.id === u.id || (u.login && x.login === u.login))) return;
    if (u.role === 'owner' && users.some(x => x.role === 'owner')) u.role = 'member';
    if (u.root && !seen.has(u.root)) u.root = null;
    users.push(u);
  });
  if (!users.some(u => u.role === 'owner')) users.unshift(ownerUser());
  const deleted = (Array.isArray(raw.deleted) ? raw.deleted : []).map(normalizeTombstone).filter((t): t is Tombstone => !!t);
  return { meta, persons, relations, media, stories, history, access: { users }, deleted };
}
