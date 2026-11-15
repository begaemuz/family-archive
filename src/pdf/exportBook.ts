/* PDF-книга семьи: обложка, оглавление, схема дерева, страница на каждого человека, истории, указатель.
   Собирается в браузере (pdfmake, кириллица из коробки) и ничего не отправляет в сеть.
   Контакты (телефон, email, адрес) в книгу не попадают — книгу пересылают родственникам. */
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { relationGroups } from '../domain/kinship';
import { personMedia } from '../domain/mediaPeople';
import { layoutRows } from '../domain/layout';
import { birthYear, fullName, place, yearLine } from '../domain/people';
import { burialFilled } from '../domain/normalize';
import type { ArchiveData, MediaItem, Person } from '../domain/types';
import { downloadBlob } from '../hooks/useFilePicker';
import { useArchive } from '../store/archiveStore';
import { mediaRegistry } from '../store/mediaRegistry';
import { useUi } from '../store/uiStore';
import { treeImages } from './treeImage';

const C = { accent: '#4f63e8', text: '#172033', muted: '#687387', line: '#e4e8ef', soft: '#f3f5f9' };

/** Фото → JPEG data:URL (уменьшенный), для вставки в PDF. */
async function toJpeg(blob: Blob, maxSide: number): Promise<{ url: string; w: number; h: number } | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return { url: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height };
  } catch {
    return null;
  }
}

const anchorOf =(p: Person) => 'p_' + p.id.replace(/-/g, '');

function infoTable(rows: [string, string][]): Content | null {
  const filled = rows.filter(([, v]) => v && v.trim());
  if (!filled.length) return null;
  return {
    table: {
      widths: [140, '*'],
      body: filled.map(([k, v]) => [
        { text: k, color: C.muted, fontSize: 10 },
        { text: v, fontSize: 10.5 },
      ]),
    },
    layout: { hLineColor: () => C.line, vLineWidth: () => 0, hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0 : 0.6), paddingTop: () => 5, paddingBottom: () => 5 },
    margin: [0, 4, 0, 10],
  };
}

const sectionTitle = (t: string): Content => ({ text: t.toUpperCase(), fontSize: 9, bold: true, color: C.muted, characterSpacing: 0.8, margin: [0, 12, 0, 4] });

export async function buildBook(data: ArchiveData, onStep: (s: string) => void): Promise<Blob> {
  onStep('Готовлю фотографии…');
  const pdfMakeMod = await import('pdfmake/build/pdfmake');
  const pdfMake = (pdfMakeMod as unknown as { default: typeof import('pdfmake/build/pdfmake') }).default ?? pdfMakeMod;
  // vfs_fonts.js пишет шрифты в `this.pdfMake`, а в собранном модуле `this` не определён.
  // Поэтому берём файл как текст: объект шрифтов в нём — чистый JSON (без eval, CSP не нарушается).
  const raw = (await import('pdfmake/build/vfs_fonts.js?raw')).default;
  const start = raw.indexOf('{', raw.indexOf('.vfs ='));
  const end = raw.indexOf('\n}', start) + 2;
  const vfs = JSON.parse(raw.slice(start, end)) as Record<string, string>;
  (pdfMake as unknown as { vfs: unknown }).vfs = vfs;

  const persons = data.persons.map(p => ({ ...p }));
  const L = layoutRows(persons, data.relations);
  const byMedia = new Map(data.media.map(m => [m.id, m]));

  // фото профиля (для схемы и страниц) и фото альбомов
  const photoBitmaps = new Map<string, ImageBitmap>();
  const photoJpeg = new Map<string, { url: string; w: number; h: number }>();
  for (const p of persons) {
    if (!p.mainPhotoId) continue;
    const b = mediaRegistry.get(p.mainPhotoId);
    if (!b) continue;
    try {
      photoBitmaps.set(p.mainPhotoId, await createImageBitmap(b));
    } catch {
      /* фото не читается — будут инициалы */
    }
    const j = await toJpeg(b, 500);
    if (j) photoJpeg.set(p.mainPhotoId, j);
  }

  onStep('Рисую схему дерева…');
  const tree = await treeImages(L, persons, data.relations, photoBitmaps);
  photoBitmaps.forEach(b => b.close());

  // порядок людей: по поколениям, затем по году рождения
  const order = persons
    .slice()
    .sort((a, b) => (L.levelOf.get(a.id) ?? 99) - (L.levelOf.get(b.id) ?? 99) || (birthYear(a) ?? 9999) - (birthYear(b) ?? 9999) || a.seq - b.seq);

  const content: Content[] = [];

  /* ---------- обложка ---------- */
  const cover = data.meta.coverId ? mediaRegistry.get(data.meta.coverId) : undefined;
  const coverImg = cover ? await toJpeg(cover, 1400) : null;
  content.push(
    { text: 'СЕМЕЙНАЯ КНИГА', fontSize: 11, bold: true, color: C.accent, characterSpacing: 2, margin: [0, 60, 0, 10], alignment: 'center' },
    { text: data.meta.title, fontSize: 32, bold: true, alignment: 'center', margin: [0, 0, 0, 12] },
    ...(data.meta.description ? [{ text: data.meta.description, fontSize: 12, color: C.muted, alignment: 'center' as const, margin: [40, 0, 40, 20] as [number, number, number, number] }] : []),
    ...(coverImg ? [{ image: coverImg.url, fit: [440, 380] as [number, number], alignment: 'center' as const, margin: [0, 10, 0, 20] as [number, number, number, number] }] : []),
    {
      text: `${persons.length} чел. · ${data.relations.length} связей · ${data.stories.length} историй`,
      fontSize: 10,
      color: C.muted,
      alignment: 'center',
      margin: [0, 20, 0, 0],
    },
    { text: 'Составлено ' + new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }), fontSize: 10, color: C.muted, alignment: 'center', pageBreak: 'after' },
  );

  /* ---------- оглавление ---------- */
  content.push({ toc: { title: { text: 'Содержание', fontSize: 22, bold: true, margin: [0, 0, 0, 16] } } });

  /* ---------- схема (альбомные листы) ---------- */
  if (tree.overview) {
    content.push({ text: 'Родословное древо', fontSize: 22, bold: true, tocItem: true, margin: [0, 0, 0, 10], pageBreak: 'before', pageOrientation: 'landscape' } as Content);
    content.push({ image: tree.overview.dataUrl, fit: [742, 440], alignment: 'center' });
    tree.tiles.forEach((t, i) =>
      content.push(
        { text: `Древо крупно — лист ${i + 1} из ${tree.tiles.length}`, fontSize: 10, color: C.muted, pageBreak: 'before', pageOrientation: 'landscape', margin: [0, 0, 0, 6] } as Content,
        { image: t.dataUrl, fit: [742, 450], alignment: 'center' },
      ),
    );
  }

  /* ---------- люди ---------- */
  onStep('Собираю страницы людей…');
  content.push({ text: 'Люди', fontSize: 22, bold: true, tocItem: true, pageBreak: 'before', pageOrientation: 'portrait', margin: [0, 0, 0, 8] } as Content);
  let first = true;
  let prevRich = false;
  for (const p of order) {
    const head: Content[] = [];
    const ph = p.mainPhotoId ? photoJpeg.get(p.mainPhotoId) : null;
    head.push({
      columns: [
        ...(ph ? [{ image: ph.url, width: 110, height: 110, margin: [0, 0, 14, 0] as [number, number, number, number] }] : []),
        {
          width: '*',
          stack: [
            { text: fullName(p), fontSize: 20, bold: true, id: anchorOf(p) } as Content,
            ...(yearLine(p) ? [{ text: yearLine(p), fontSize: 12, color: C.muted, margin: [0, 4, 0, 0] as [number, number, number, number] }] : []),
            ...(p.occupation ? [{ text: p.occupation, fontSize: 11, margin: [0, 6, 0, 0] as [number, number, number, number] }] : []),
          ],
        },
      ],
      margin: [0, 0, 0, 8],
    } as Content);

    const life = infoTable([
      ['Девичья фамилия', p.maidenName],
      ['Дата рождения', p.birth],
      ['Место рождения', place(p.birthCity, p.birthCountry)],
      ['Дата смерти', p.death],
      ['Место смерти', place(p.deathCity, p.deathCountry)],
      ['Место проживания', place(p.residenceCity, p.residenceCountry)],
    ]);

    const groups = relationGroups(p, persons, data.relations).filter(g => ['Родители', 'Супруги', 'Дети', 'Братья и сёстры'].includes(g.title));
    const rel: Content[] = groups.map(g => ({
      text: [
        { text: g.title + ': ', color: C.muted },
        ...g.items.flatMap((it, i) => [
          { text: fullName(it.other), linkToDestination: anchorOf(it.other), color: C.accent },
          { text: i < g.items.length - 1 ? ', ' : '' },
        ]),
      ],
      fontSize: 10.5,
      margin: [0, 2, 0, 2],
    }));

    const bio: Content[] = p.bio.flatMap(b => [
      ...(b.title ? [{ text: b.title, fontSize: 13, bold: true, margin: [0, 10, 0, 4] as [number, number, number, number] }] : []),
      { text: b.text, fontSize: 10.5, lineHeight: 1.35 },
    ]);

    // свои фото и фото других людей, где человек отмечен
    const mine = personMedia(p, data.media, persons).map(e => e.item);
    const albumPhotos = mine.filter(m => m.kind === 'photo');
    const albumImgs: { url: string; date: string }[] = [];
    for (const m of albumPhotos.slice(0, 12)) {
      const b = mediaRegistry.get(m.id);
      const j = b ? await toJpeg(b, 700) : null;
      if (j) albumImgs.push({ url: j.url, date: m.year ? String(m.year) : m.date });
    }
    const others = mine.filter(m => m.kind !== 'photo');
    const videos = others.filter(m => m.kind === 'video').length;
    const audios = others.filter(m => m.kind === 'audio').length;
    const docs = p.documents.map(id => byMedia.get(id)).filter((m): m is MediaItem => !!m);

    const block: Content[] = [...head];
    if (life) block.push(sectionTitle('Жизнь'), life);
    if (rel.length) block.push(sectionTitle('Семья'), ...rel);
    if (p.deceased && burialFilled(p.burial)) {
      const b = p.burial;
      block.push(
        sectionTitle('Место захоронения'),
        infoTable([
          ['Кладбище', b.cemetery],
          ['Адрес', b.address],
          ['Участок', b.plot],
          ['Координаты', b.lat != null ? `${b.lat.toFixed(6)}, ${b.lng!.toFixed(6)}` : ''],
          ['Заметки', b.notes],
        ]) ?? { text: '' },
      );
    }
    if (bio.length) block.push(sectionTitle('Биография'), ...bio);
    if (albumImgs.length) {
      block.push(sectionTitle(`Фотографии${albumPhotos.length > albumImgs.length ? ` (показаны ${albumImgs.length} из ${albumPhotos.length})` : ''}`));
      for (let i = 0; i < albumImgs.length; i += 3)
        block.push({
          // под фото — дата снимка, если указана
          columns: albumImgs.slice(i, i + 3).map(a => ({
            width: 165,
            stack: [
              { image: a.url, fit: [160, 160] as [number, number] },
              ...(a.date ? [{ text: a.date, fontSize: 8.5, color: C.muted, margin: [0, 3, 0, 0] as [number, number, number, number] }] : []),
            ],
          })),
          columnGap: 8,
          margin: [0, 0, 0, 8],
        });
    }
    if (videos || audios || docs.length)
      block.push({
        text: [videos ? `Видео: ${videos}` : '', audios ? `Аудио: ${audios}` : '', docs.length ? `Документы: ${docs.map(d => d.name).join(', ')}` : '']
          .filter(Boolean)
          .join(' · '),
        fontSize: 9.5,
        color: C.muted,
        margin: [0, 8, 0, 0],
      });

    // у кого есть биография или фотографии — своя страница; короткие карточки идут подряд, не разрываясь
    const rich = bio.length > 0 || albumImgs.length > 0;
    if (!first && !rich && !prevRich)
      content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.6, lineColor: C.line }], margin: [0, 14, 0, 16] });
    content.push({ stack: block, unbreakable: !rich, pageBreak: !first && (rich || prevRich) ? 'before' : undefined } as Content);
    first = false;
    prevRich = rich;
  }

  /* ---------- истории ---------- */
  if (data.stories.length) {
    onStep('Добавляю истории…');
    content.push({ text: 'Семейные истории', fontSize: 22, bold: true, tocItem: true, pageBreak: 'before', margin: [0, 0, 0, 8] } as Content);
    for (const s of data.stories) {
      const who = s.personIds.map(id => persons.find(p => p.id === id)).filter((p): p is Person => !!p);
      content.push(
        { text: s.title || 'Без названия', fontSize: 15, bold: true, margin: [0, 14, 0, 2] } as Content,
        ...(s.date || who.length
          ? [{ text: [s.date, who.map(fullName).join(', ')].filter(Boolean).join(' · '), fontSize: 9.5, color: C.muted, margin: [0, 0, 0, 6] as [number, number, number, number] }]
          : []),
        { text: s.text, fontSize: 10.5, lineHeight: 1.35 },
      );
    }
  }

  /* ---------- указатель ---------- */
  content.push({ text: 'Указатель имён', fontSize: 22, bold: true, tocItem: true, pageBreak: 'before', margin: [0, 0, 0, 10] } as Content);
  const idx = persons.slice().sort((a, b) => fullName(a).localeCompare(fullName(b), 'ru'));
  content.push({
    columns: [0, 1].map(col => ({
      stack: idx
        .filter((_, i) => (i < Math.ceil(idx.length / 2) ? 0 : 1) === col)
        .map(p => ({
          columns: [
            { text: fullName(p), linkToDestination: anchorOf(p), fontSize: 10, width: '*' },
            { pageReference: anchorOf(p), fontSize: 10, width: 30, alignment: 'right' as const, color: C.muted },
          ],
          margin: [0, 1.5, 0, 1.5] as [number, number, number, number],
        })),
    })),
    columnGap: 24,
  } as Content);

  const doc: TDocumentDefinitions = {
    info: { title: data.meta.title, subject: 'Семейная книга' },
    pageSize: 'A4',
    pageMargins: [50, 50, 50, 56],
    defaultStyle: { font: 'Roboto', fontSize: 11, color: C.text },
    content,
    footer: (page, pages) =>
      page === 1 ? null : { text: `${data.meta.title} · ${page} / ${pages}`, alignment: 'center', fontSize: 8, color: C.muted, margin: [0, 20, 0, 0] },
  };

  onStep('Собираю PDF…');
  return new Promise(resolve => (pdfMake as unknown as { createPdf(d: TDocumentDefinitions): { getBlob(cb: (b: Blob) => void): void } }).createPdf(doc).getBlob(resolve));
}

/** Кнопка «Скачать PDF-книгу». */
export async function exportPdfBook() {
  const data = useArchive.getState().data;
  const ui = useUi.getState();
  if (!data) return;
  if (!data.persons.length) return ui.showToast('В архиве пока нет людей');
  try {
    const blob = await buildBook(data, s => ui.showToast(s));
    const name = (data.meta.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Семейная книга') + '.pdf';
    downloadBlob(blob, name);
    ui.showToast(`Книга готова: «${name}»`);
  } catch (e) {
    console.error(e);
    ui.showToast('Не удалось собрать PDF: ' + ((e as Error)?.message || 'ошибка'));
  }
}
