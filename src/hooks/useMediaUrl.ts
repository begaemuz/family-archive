import { useSyncExternalStore } from 'react';
import { mediaRegistry } from '../store/mediaRegistry';

/** object URL файла из архива (или null); обновляется, если файл заменили. */
export function useMediaUrl(id: string | null | undefined): string | null {
  return useSyncExternalStore(
    mediaRegistry.subscribe,
    () => mediaRegistry.url(id),
    () => null,
  );
}
