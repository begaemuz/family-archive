/* Содержимое медиафайлов живёт только в памяти: Blob + object URL для показа.
   При закрытии архива всё освобождается (URL отзываются, ссылки на Blob сбрасываются). */

const blobs = new Map<string, Blob>();
const urls = new Map<string, string>();
const listeners = new Set<() => void>();

export const mediaRegistry = {
  set(id: string, blob: Blob) {
    blobs.set(id, blob);
    const old = urls.get(id);
    if (old) {
      URL.revokeObjectURL(old);
      urls.delete(id);
    }
    listeners.forEach(l => l());
  },
  get(id: string): Blob | undefined {
    return blobs.get(id);
  },
  has(id: string) {
    return blobs.has(id);
  },
  /** object URL для <img>/<video>/<audio>; создаётся один раз */
  url(id: string | null | undefined): string | null {
    if (!id) return null;
    const cached = urls.get(id);
    if (cached) return cached;
    const b = blobs.get(id);
    if (!b) return null;
    const u = URL.createObjectURL(b);
    urls.set(id, u);
    return u;
  },
  delete(id: string) {
    const u = urls.get(id);
    if (u) URL.revokeObjectURL(u);
    urls.delete(id);
    blobs.delete(id);
  },
  entries() {
    return blobs.entries();
  },
  /** закрытие архива: отозвать все URL и забыть содержимое */
  clear() {
    urls.forEach(u => URL.revokeObjectURL(u));
    urls.clear();
    blobs.clear();
    listeners.forEach(l => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
