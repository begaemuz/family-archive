/* Добавление файлов: проверка типа и размера, уменьшение больших фото, контрольная сумма. */
import { sha256Hex, validateFile, validationMessage } from '../archive/media';
import { newId } from '../domain/normalize';
import type { ArchiveData, MediaItem, MediaKind } from '../domain/types';
import { useUi } from '../store/uiStore';

/** Уменьшает слишком большие фото (длинная сторона ≤ maxSide). GIF сохраняются как есть. */
async function shrinkPhoto(blob: Blob, mime: string, maxSide: number): Promise<Blob> {
  if (mime === 'image/gif') return blob;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return blob;
  }
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  if (k >= 1 && blob.size < 1.5e6) {
    bmp.close();
    return blob;
  }
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext('2d')!;
  if (mime !== 'image/png') {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
  }
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const type = mime === 'image/png' ? 'image/png' : 'image/jpeg';
  return new Promise(res => c.toBlob(b => res(b || blob), type, 0.9));
}

export interface PreparedMedia {
  item: MediaItem;
  blob: Blob;
}

/** Проверить и подготовить файлы. Ошибки показываются уведомлением, такие файлы пропускаются. */
export async function prepareFiles(files: File[], allowed: MediaKind[]): Promise<PreparedMedia[]> {
  const out: PreparedMedia[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const v = await validateFile(file, allowed);
    if (!v.ok) {
      errors.push(validationMessage(v.error, file.name));
      continue;
    }
    if (v.info.mime === 'image/heic') {
      errors.push(`«${file.name}» в формате HEIC — браузер его не показывает. Сохраните фото как JPEG`);
      continue;
    }
    let blob: Blob = file.slice(0, file.size, v.info.mime);
    if (v.info.kind === 'photo') blob = await shrinkPhoto(blob, v.info.mime, 2000);
    const mime = blob.type || v.info.mime;
    out.push({
      item: {
        id: newId(),
        kind: v.info.kind,
        mime,
        name: file.name.slice(0, 200),
        size: blob.size,
        sha256: await sha256Hex(blob),
        createdAt: Date.now(),
      },
      blob,
    });
  }
  if (errors.length) useUi.getState().showToast(errors.slice(0, 2).join(' · ') + (errors.length > 2 ? ` · и ещё ${errors.length - 2}` : ''));
  return out;
}

/** Обложка архива при создании (кадрирование не обязательно). */
export async function addCoverToData(data: ArchiveData, blobs: Map<string, Blob>, cover: Blob) {
  const [p] = await prepareFiles([new File([cover], 'cover.jpg', { type: cover.type })], ['photo']);
  if (!p) return;
  data.media.push(p.item);
  blobs.set(p.item.id, p.blob);
  data.meta.coverId = p.item.id;
}

/** Квадратное фото профиля из уже обрезанного Blob. */
export async function preparedFromBlob(blob: Blob, name: string): Promise<PreparedMedia> {
  return {
    item: { id: newId(), kind: 'photo', mime: blob.type || 'image/jpeg', name, size: blob.size, sha256: await sha256Hex(blob), createdAt: Date.now() },
    blob,
  };
}
