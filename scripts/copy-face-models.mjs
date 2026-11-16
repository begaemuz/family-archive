// Модели распознавания лиц — из пакета @vladmandic/face-api в public/models (в git не хранятся).
// Запускается после npm install и перед сборкой. Нужны: поиск лиц, ключевые точки, «отпечаток» лица.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const from = 'node_modules/@vladmandic/face-api/model';
const to = 'public/models';
const files = ['ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model'].flatMap(n => [`${n}-weights_manifest.json`, `${n}.bin`]);

if (!existsSync(from)) {
  console.warn('face-api не установлен — модели не скопированы');
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const f of files) copyFileSync(join(from, f), join(to, f));
console.log(`Модели распознавания лиц: ${files.length} файлов → ${to}`);
