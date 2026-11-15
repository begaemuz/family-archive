import { suggestFaces } from '../../flows/faceFlows';
import { useAccess } from '../../hooks/useAccess';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatSize } from '../../archive/media';
import { fullName } from '../../domain/people';
import { groupByYear, personMedia, type PersonMedia } from '../../domain/mediaPeople';
import type { MediaItem, MediaKind, Person } from '../../domain/types';
import { prepareFiles } from '../../flows/mediaFlows';
import { askDeleteMedia } from '../../flows/personFlows';
import { pickFiles } from '../../hooks/useFilePicker';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';

type Kind = Exclude<MediaKind, 'document'>;

const SECTIONS: { kind: Kind; title: string; icon: string; accept: string; add: string; empty: string }[] = [
  { kind: 'photo', title: 'Фото', icon: 'image', accept: 'image/jpeg,image/png,image/gif,image/webp,image/avif', add: 'Добавить фото', empty: 'Фото пока нет' },
  { kind: 'video', title: 'Видео', icon: 'video', accept: 'video/*,.mp4,.mov,.webm,.mkv,.avi', add: 'Добавить видео', empty: 'Видео пока нет' },
  { kind: 'audio', title: 'Аудио', icon: 'audio', accept: 'audio/*,.mp3,.m4a,.wav,.ogg,.flac', add: 'Добавить аудио', empty: 'Аудиозаписей пока нет' },
];

function DeleteButton({ onDelete, title = 'Удалить' }: { onDelete(): void; title?: string }) {
  return (
    <button
      className="album-del"
      title={title}
      onClick={e => {
        e.stopPropagation();
        onDelete();
      }}
    >
      <Icon name="trash" />
    </button>
  );
}

function Tile({ entry, ownerName, onOpen, onDelete }: { entry: PersonMedia; ownerName: string; onOpen(): void; onDelete: (() => void) | null }) {
  const { item, own } = entry;
  const url = useMediaUrl(item.id);
  const tagCount = item.people.length;
  return (
    <div className={'album-item kind-' + item.kind + (own ? '' : ' tagged')} onClick={onOpen} title={(item.year ?? item.date ? `${item.year ?? item.date} · ` : '') + (own ? item.name : `Отмечен(а) на фото из альбома: ${ownerName}`)}>
      {item.kind === 'photo' && url && <img src={url} alt="" loading="lazy" draggable={false} />}
      {item.kind === 'video' && url && <video src={url} preload="metadata" muted playsInline />}
      {item.kind === 'video' && (
        <span className="play-badge">
          <Icon name="play" size={18} />
        </span>
      )}
      {(item.year || item.date) && <span className="date-badge">{item.year ?? item.date}</span>}
      {/* чужое фото, где человек отмечен, — или своё, на котором отмечены другие */}
      {!own ? (
        <span className="tag-badge" title={`Из альбома: ${ownerName}`}>
          <Icon name="users" size={13} />
        </span>
      ) : tagCount > 0 ? (
        <span className="tag-badge" title={`Отмечено людей: ${tagCount}`}>
          <Icon name="users" size={13} /> {tagCount}
        </span>
      ) : null}
      {onDelete && <DeleteButton onDelete={onDelete} title={own ? 'Удалить' : 'Убрать отметку'} />}
    </div>
  );
}

/** Аудиозапись — строкой со встроенным плеером: слушать можно прямо в карточке. */
function AudioRow({ item, onDelete }: { item: MediaItem; onDelete: (() => void) | null }) {
  const url = useMediaUrl(item.id);
  return (
    <div className="audio-row">
      <div className="audio-row-head">
        <span className="doc-ico">
          <Icon name="audio" />
        </span>
        <div className="audio-row-meta">
          <b title={item.name}>{item.name}</b>
          <small>{formatSize(item.size)}</small>
        </div>
        {onDelete && (
          <button className="ghost danger icon-button" title="Удалить" onClick={onDelete}>
            <Icon name="trash" />
          </button>
        )}
      </div>
      {url && <audio src={url} controls preload="none" />}
    </div>
  );
}

const yearKey = (y: number | null) => (y === null ? 'none' : String(y));

/** Фото по годам — как телефонная книга: заголовок года, справа указатель годов для быстрого перехода. */
function PhotoYears({
  list,
  nameOf,
  onOpen,
  deleteFor,
}: {
  list: PersonMedia[];
  nameOf(id: string | null): string;
  onOpen(ids: string[], index: number): void;
  deleteFor(e: PersonMedia): (() => void) | null;
}) {
  const groups = useMemo(() => groupByYear(list), [list]);
  const ids = useMemo(() => groups.flatMap(g => g.items.map(e => e.item.id)), [groups]);
  const refs = useRef(new Map<string, HTMLElement>());
  // много лет — в указателе десятилетия (переход к первому году десятилетия)
  const marks = useMemo(() => {
    const years = groups.map(g => g.year);
    const label = (y: number | null, decades: boolean) => (y === null ? 'б/г' : decades ? `${Math.floor(y / 10) * 10}-е` : String(y));
    const decades = years.filter(y => y !== null).length > 14;
    const out: { label: string; to: string }[] = [];
    years.forEach(y => {
      const l = label(y, decades);
      if (!out.some(o => o.label === l)) out.push({ label: l, to: yearKey(y) });
    });
    return out;
  }, [groups]);
  const go = (to: string) => refs.current.get(to)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className={'photo-years' + (groups.length > 1 ? ' with-index' : '')}>
      <div className="photo-years-list">
        {groups.map(g => (
          <section
            className="year-group"
            key={yearKey(g.year)}
            ref={el => {
              if (el) refs.current.set(yearKey(g.year), el);
              else refs.current.delete(yearKey(g.year));
            }}
          >
            <div className="year-head">
              <b>{g.year ?? 'Год не указан'}</b>
              <span>{g.items.length}</span>
            </div>
            <div className="album">
              {g.items.map(e => (
                <Tile key={e.item.id} entry={e} ownerName={nameOf(e.ownerId)} onOpen={() => onOpen(ids, ids.indexOf(e.item.id))} onDelete={deleteFor(e)} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {groups.length > 1 && (
        <nav className="year-index" aria-label="Перейти к году">
          {marks.map(m => (
            <button key={m.label} title={`Перейти: ${m.label}`} onClick={() => go(m.to)}>
              {m.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

const firstNonEmpty = (lists: Record<Kind, PersonMedia[]>): Kind => SECTIONS.find(s => lists[s.kind].length)?.kind ?? 'photo';

/** Медиа человека — вкладками: фото (по годам), видео (до 200 МБ) и аудио. */
export function MediaTab({ person: p }: { person: Person }) {
  const media = useArchive(s => s.data!.media);
  const persons = useArchive(s => s.data!.persons);
  // свои файлы + фото/видео других людей, где этот человек отмечен
  const entries = useMemo(() => {
    const all = personMedia(p, media, persons);
    return [...all.filter(e => e.own).reverse(), ...all.filter(e => !e.own)];
  }, [p, media, persons]);
  const lists = useMemo(
    () => Object.fromEntries(SECTIONS.map(sec => [sec.kind, entries.filter(e => e.item.kind === sec.kind)])) as Record<Kind, PersonMedia[]>,
    [entries],
  );
  // открываем первую непустую вкладку; у другого человека — заново
  const [kind, setKind] = useState<Kind>(() => firstNonEmpty(lists));
  useEffect(() => setKind(firstNonEmpty(lists)), [p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (id: string | null) => {
    const o = id ? persons.find(x => x.id === id) : null;
    return o ? fullName(o) : '';
  };
  const acc = useAccess();
  const canAdd = acc.canAddMedia(p.id);
  const canDelete = acc.canDeleteMedia(p.id);
  const canUntag = acc.canEditPerson(p.id);
  const openLightbox = useUi(s => s.openLightbox);
  const deleteFor = (e: PersonMedia) => ((e.own ? canDelete : canUntag) ? () => askDeleteMedia(e.item.id, p.id) : null);

  const add = async (kind: Kind, accept: string) => {
    const files = await pickFiles(accept, true);
    if (!files.length) return;
    useUi.getState().showToast('Добавляю файлы…');
    const ready = await prepareFiles(files, [kind]);
    if (!ready.length) return;
    const st = useArchive.getState();
    ready.forEach(r => st.addMedia(r.item, r.blob));
    st.updatePerson(p.id, { media: [...(st.data!.persons.find(x => x.id === p.id)?.media ?? []), ...ready.map(r => r.item.id)] });
    useUi.getState().showToast(`Добавлено: ${ready.length}`);
    const photos = ready.filter(r => r.item.kind === 'photo').map(r => r.item.id);
    if (photos.length) suggestFaces(photos, p.id);
  };

  const sec = SECTIONS.find(s => s.kind === kind)!;
  const list = lists[kind];

  return (
    <div className="sp-body media-tab">
      <div className="media-tabs" role="tablist">
        {SECTIONS.map(s => (
          <button key={s.kind} role="tab" aria-selected={s.kind === kind} className={s.kind === kind ? 'on' : ''} onClick={() => setKind(s.kind)}>
            <Icon name={s.icon} size={15} /> {s.title}
            {lists[s.kind].length > 0 && <span className="media-tab-n">{lists[s.kind].length}</span>}
          </button>
        ))}
      </div>

      {canAdd && (
        <button className="media-add" onClick={() => add(sec.kind, sec.accept)}>
          <Icon name="plus" /> {sec.add}
        </button>
      )}

      {!list.length && <p className="media-empty">{sec.empty}</p>}

      {kind === 'photo' && list.length > 0 && (
        <PhotoYears list={list} nameOf={nameOf} onOpen={(ids, index) => openLightbox({ ids, index, ownerId: p.id })} deleteFor={deleteFor} />
      )}

      {kind === 'video' && list.length > 0 && (
        <div className="album album-video">
          {list.map((e, i) => (
            <Tile
              key={e.item.id}
              entry={e}
              ownerName={nameOf(e.ownerId)}
              onOpen={() => openLightbox({ ids: list.map(x => x.item.id), index: i, ownerId: p.id })}
              onDelete={deleteFor(e)}
            />
          ))}
        </div>
      )}

      {kind === 'audio' && list.length > 0 && (
        <div className="audio-list">
          {list.map(e => (
            <AudioRow key={e.item.id} item={e.item} onDelete={deleteFor(e)} />
          ))}
        </div>
      )}

      <p className="muted-note">До 200 МБ на файл. Всё хранится внутри зашифрованного архива.</p>
    </div>
  );
}
