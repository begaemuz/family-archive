/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';

// Две сборки:
//  • обычная (npm run build)            — сайт для GitHub Pages, в папку dist/ (работает и офлайн после первого открытия)
//  • автономная (npm run build:single)  — один файл dist-single/family-archive.html, открывается с диска без интернета

/** Content-Security-Policy: всё своё, наружу — только плитки карты и поиск адреса. */
function csp(single: boolean): string {
  const tiles = 'https://tile.openstreetmap.org https://server.arcgisonline.com';
  return [
    "default-src 'self'",
    // в однофайловой сборке скрипт встроен в страницу; wasm — для Argon2id
    `script-src 'self' ${single ? "'unsafe-inline' " : ''}'wasm-unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${tiles}`,
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self' data: blob: https://nominatim.openstreetmap.org",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join('; ');
}

const cspPlugin = (single: boolean): Plugin => ({
  name: 'family-csp',
  apply: 'build',
  transformIndexHtml: html =>
    html.replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n    <meta http-equiv="Content-Security-Policy" content="${csp(single)}">`),
});

/** Однофайловая сборка: index.html → family-archive.html. */
const renameSingle = (): Plugin => ({
  name: 'family-single-name',
  apply: 'build',
  enforce: 'post',
  generateBundle(_, bundle) {
    const html = bundle['index.html'];
    if (html) html.fileName = 'family-archive.html';
  },
});

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    // относительные пути — сайт работает и в подпапке GitHub Pages, и с диска
    base: './',
    plugins: [
      react(),
      cspPlugin(single),
      ...(single
        ? [viteSingleFile(), renameSingle()]
        : [
            VitePWA({
              registerType: 'autoUpdate',
              injectRegister: 'script-defer',
              includeAssets: ['icon.svg', 'logo.svg', 'logo-512.png'],
              manifest: {
                name: 'Семейный архив',
                short_name: 'Семья',
                description: 'Родословное древо, фото, видео и истории семьи — в одном зашифрованном файле',
                lang: 'ru',
                theme_color: '#4f63e8',
                background_color: '#0e1117',
                display: 'standalone',
                start_url: './',
                icons: [
                  { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
                  { src: 'logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                ],
              },
              workbox: {
                globPatterns: ['**/*.{js,css,html,woff,woff2,svg,webp,png}'],
                // pdfmake и шрифты PDF — крупные, но тоже нужны офлайн
                maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
                navigateFallback: 'index.html',
                // офлайн-версия одним файлом скачивается как есть, без подмены главной страницей
                navigateFallbackDenylist: [/family-archive\.html$/],
                // плитки карты и поиск адреса не кэшируем
                runtimeCaching: [],
              },
            }),
          ]),
    ],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      target: 'es2022',
      assetsInlineLimit: single ? 100_000_000 : 4096,
      chunkSizeWarningLimit: 2000,
    },
    server: { port: 5173, strictPort: true },
    test: {
      globals: true,
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  };
});
