/* Работа с файлом архива на устройстве.
   Chrome/Edge (File System Access API): можно сохранять прямо в исходный файл после разрешения.
   Остальные браузеры: открытие через обычный выбор файла, сохранение — скачиванием новой версии. */
import { downloadBlob, pickFiles } from '../hooks/useFilePicker';

export type FSHandle = FileSystemFileHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
};

interface PickerWindow extends Window {
  showOpenFilePicker?: (o?: unknown) => Promise<FSHandle[]>;
  showSaveFilePicker?: (o?: unknown) => Promise<FSHandle>;
}
const w = window as PickerWindow;

export const canWriteFiles = () => typeof w.showSaveFilePicker === 'function';

const TYPES = [{ description: 'Архив Rodiva', accept: { 'application/octet-stream': ['.family'] } }];

export function safeFileName(title: string): string {
  return (title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Семейный архив').slice(0, 80) + '.family';
}

/** Выбрать файл .family. Возвращает файл и, если браузер умеет, «ручку» для сохранения на место. */
export async function pickArchiveFile(): Promise<{ file: File; handle: FSHandle | null } | null> {
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const [handle] = await w.showOpenFilePicker({ types: TYPES, excludeAcceptAllOption: false, multiple: false });
      return { file: await handle.getFile(), handle };
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
      // в некоторых окружениях (iframe) API есть, но запрещён — используем обычный выбор
    }
  }
  const [file] = await pickFiles('.family,application/octet-stream');
  return file ? { file, handle: null } : null;
}

/** Записать архив: в известный файл (если есть разрешение) или выбрать место / скачать. */
export async function writeArchive(
  blob: Blob,
  opts: { handle: FSHandle | null; suggestedName: string; forcePick?: boolean },
): Promise<{ handle: FSHandle | null; fileName: string; method: 'file' | 'download' } | null> {
  let handle = opts.forcePick ? null : opts.handle;
  if (!handle && canWriteFiles()) {
    try {
      handle = await w.showSaveFilePicker!({ suggestedName: opts.suggestedName, types: TYPES });
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
      handle = null;
    }
  }
  if (handle) {
    let perm: PermissionState = 'granted';
    if (handle.queryPermission) perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && handle.requestPermission) perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { handle, fileName: handle.name, method: 'file' };
    }
  }
  downloadBlob(blob, opts.suggestedName);
  return { handle: null, fileName: opts.suggestedName, method: 'download' };
}
