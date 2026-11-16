/* Обновление сайта. Приложение хранит себя в браузере для работы без интернета, поэтому новая версия
   включается не сразу: она скачивается в фоне, и мы показываем «Доступна новая версия — Обновить».
   В автономном однофайловом архиве и при разработке этого нет. */
import { useSyncExternalStore } from 'react';

let apply: (() => void) | null = null;
const listeners = new Set<() => void>();

export function startUpdateCheck() {
  if (import.meta.env.DEV || import.meta.env.MODE === 'single') return;
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const update = registerSW({
        onNeedRefresh() {
          apply = () => void update(true);
          listeners.forEach(l => l());
        },
      });
      // вкладку держат открытой днями — проверяем новую версию раз в час
      setInterval(() => navigator.serviceWorker?.getRegistration().then(r => r?.update()), 60 * 60 * 1000);
    })
    .catch(() => {
      /* без service worker — просто без уведомления */
    });
}

/** Функция «обновить сейчас», если новая версия уже скачана. */
export function useUpdate(): (() => void) | null {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => apply,
  );
}
