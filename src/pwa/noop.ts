/* Заглушка virtual:pwa-register для автономного однофайлового архива (там нет service worker). */
export function registerSW() {
  return () => Promise.resolve();
}
