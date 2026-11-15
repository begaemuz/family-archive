/* Содержимое архива внутри шифрования — обычный ZIP со структурой:
     manifest.json          — версия формата, сведения об архиве
     persons.json           — люди
     relationships.json     — родственные связи
     media.json             — описания файлов (тип, имя, размер, SHA-256, кто отмечен на фото)
     stories/stories.json   — семейные истории
     history/history.json   — история изменений
     photos/<id>.<ext>  video/…  audio/…  documents/…
   При чтении всё проверяется заново: тип файла — по содержимому, целостность — по SHA-256. */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { normalizeArchive } from '../domain/normalize';
import type { ArchiveData, MediaKind } from '../domain/types';
import { extFromMime, sha256Hex, sniff } from './media';
import { ArchiveError, FORMAT_VERSION } from './container';

export const APP_VERSION = 'family-archive/0.1';

const FOLDER: Record<MediaKind, string> = { photo: 'photos', video: 'video', audio: 'audio', document: 'documents' };

export interface Manifest {
  format: 'family';
  version: number;
  app: string;
  archive: ArchiveData['meta'];
  counts: { persons: number; relations: number; media: number; stories: number };
  savedAt: number;
}

export async function packArchive(data: ArchiveData, blobOf: (id: string) => Blob | undefined): Promise<Uint8Array> {
  const json = (v: unknown) => strToU8(JSON.stringify(v));
  const manifest: Manifest = {
    format: 'family',
    version: FORMAT_VERSION,
    app: APP_VERSION,
    archive: data.meta,
    counts: { persons: data.persons.length, relations: data.relations.length, media: data.media.length, stories: data.stories.length },
    savedAt: Date.now(),
  };
  const files: Zippable = {
    'manifest.json': json(manifest),
    'persons.json': json(data.persons),
    'relationships.json': json(data.relations),
    'media.json': json(data.media),
    'stories/stories.json': json(data.stories),
    'history/history.json': json(data.history),
  };
  for (const m of data.media) {
    const blob = blobOf(m.id);
    if (!blob) continue;
    // медиа уже сжаты — кладём без повторного сжатия (level 0), это быстро
    files[`${FOLDER[m.kind]}/${m.id}.${extFromMime(m.mime)}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  return zipSync(files, { level: 6 });
}

export interface UnpackResult {
  data: ArchiveData;
  blobs: Map<string, Blob>;
  /** файлы, которые не прошли проверку и были пропущены */
  skipped: number;
}

export async function unpackArchive(payload: Uint8Array): Promise<UnpackResult> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(payload);
  } catch {
    throw new ArchiveError('corrupted');
  }
  const read = (name: string) => {
    const f = files[name];
    if (!f) return undefined;
    try {
      return JSON.parse(strFromU8(f));
    } catch {
      throw new ArchiveError('corrupted');
    }
  };
  const manifest = read('manifest.json') as Manifest | undefined;
  if (!manifest || manifest.format !== 'family') throw new ArchiveError('corrupted');
  if (manifest.version > FORMAT_VERSION) throw new ArchiveError('newer-version');

  const data = normalizeArchive({
    meta: manifest.archive,
    persons: read('persons.json'),
    relations: read('relationships.json'),
    media: read('media.json'),
    stories: read('stories/stories.json'),
    history: read('history/history.json'),
  });

  // файлы медиа: ищем по id, проверяем тип по содержимому и SHA-256
  const byId = new Map<string, Uint8Array>();
  for (const [name, bytes] of Object.entries(files)) {
    const m = name.match(/^(photos|video|audio|documents)\/([0-9a-zA-Z-]{8,64})\.[a-z0-9]{1,5}$/);
    if (m) byId.set(m[2], bytes);
  }
  const blobs = new Map<string, Blob>();
  let skipped = 0;
  const okMedia = [];
  for (const m of data.media) {
    const bytes = byId.get(m.id);
    const info = bytes ? sniff(bytes.subarray(0, 4096), m.name) : null;
    const hashOk = bytes && (!m.sha256 || (await sha256Hex(bytes)) === m.sha256);
    // скан документа — это картинка, хранящаяся как «документ»
    const kindOk = info && (info.kind === m.kind || (m.kind === 'document' && info.kind === 'photo'));
    if (!bytes || !info || !kindOk || !hashOk) {
      skipped++;
      continue;
    }
    // тип берём из содержимого, а не из описания — описание могли подделать
    blobs.set(m.id, new Blob([bytes as BlobPart], { type: info.mime }));
    okMedia.push({ ...m, mime: info.mime, size: bytes.length });
  }
  if (skipped) {
    const ok = new Set(okMedia.map(m => m.id));
    data.media = okMedia;
    data.persons.forEach(p => {
      if (p.mainPhotoId && !ok.has(p.mainPhotoId)) p.mainPhotoId = null;
      p.media = p.media.filter(id => ok.has(id));
      p.documents = p.documents.filter(id => ok.has(id));
    });
    data.stories.forEach(s => (s.mediaIds = s.mediaIds.filter(id => ok.has(id))));
    if (data.meta.coverId && !ok.has(data.meta.coverId)) data.meta.coverId = null;
  }
  return { data, blobs, skipped };
}
