import { useMemo } from 'react';
import { formatSize } from '../../archive/media';
import { fullName } from '../../domain/people';
import { personMedia, type PersonMedia } from '../../domain/mediaPeople';
import type { MediaItem, MediaKind, Person } from '../../domain/types';
import { prepareFiles } from '../../flows/mediaFlows';
import { askDeleteMedia } from '../../flows/personFlows';
import { pickFiles } from '../../hooks/useFilePicker';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';

type Kind = Exclude<MediaKind, 'document'>;

const SECTIONS: { kind: Kind; title: string; icon: string; accept: string; add: string }[] = [
  { kind: 'photo', title: 'Фото', icon: 'image', accept: 'image/jpeg,image/png,image/gif,image/webp,image/avif', add: 'Добавить' },
  { kind: 'video', title: 'Видео', icon: 'video', accept: 'video/*,.mp4,.mov,.webm,.mkv,.avi', add: 'Добавить видео' },
  { kind: 'audio', title: 'Аудио', icon: 'audio', accept: 'audio/*,.mp3,.m4a,.wav,.ogg,.flac', add: 'Добавить аудио' },
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

function Tile({ entry, ownerName, onOpen, onDelete }: { entry: PersonMedia; ownerName: string; onOpen(): void; onDelete(): void }) {
  const { item, own } = entry;
  const url = useMediaUrl(item.id);
  const tagCount = item.people.length;
  return (
    <div className={'album-item kind-' + item.kind + (own ? '' : ' tagged')} onClick={onOpen} title={own ? item.name : `Отмечен(а) на фото из альбома: ${ownerName}`}>
      {item.kind === 'photo' && url && <img src={url} alt="" loading="lazy" draggable={false} />}
      {item.kind === 'video' && url && <video src={url} preload="metadata" muted playsInline />}
      {item.kind === 'video' && (
        <span className="play-badge">
          <Icon name="play" size={18} />
        </span>
      )}
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
      <DeleteButton onDelete={onDelete} title={own ? 'Удалить' : 'Убрать отметку'} />
    </div>
  );
}

/** Аудиозапись — строкой со встроенным плеером: слушать можно прямо в карточке. */
function AudioRow({ item, onDelete }: { item: MediaItem; onDelete(): void }) {
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
        <button className="ghost danger icon-button" title="Удалить" onClick={onDelete}>
          <Icon name="trash" />
        </button>
      </div>
      {url && <audio src={url} controls preload="none" />}
    </div>
  );
}

/** Медиа человека по разделам: фото, видео (до 200 МБ) и аудио. */
export function MediaTab({ person: p }: { person: Person }) {
  const media = useArchive(s => s.data!.media);
  const persons = useArchive(s => s.data!.persons);
  // свои файлы + фото/видео других людей, где этот человек отмечен
  const entries = useMemo(() => personMedia(p, media, persons), [p, media, persons]);
  const nameOf = (id: string | null) => {
    const o = id ? persons.find(x => x.id === id) : null;
    return o ? fullName(o) : '';
  };
  const openLightbox = useUi(s => s.openLightbox);

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
  };

  return (
    <div className="sp-body">
      {SECTIONS.map(sec => {
        const list = entries.filter(e => e.item.kind === sec.kind);
        return (
          <section className="media-section" key={sec.kind}>
            <div className="sp-section-title">
              <Icon name={sec.icon} size={14} /> {sec.title}
              {list.length > 0 && <span className="rel-n">{list.length}</span>}
            </div>
            {sec.kind === 'audio' ? (
              <div className="audio-list">
                {list.map(({ item: m }) => (
                  <AudioRow key={m.id} item={m} onDelete={() => askDeleteMedia(m.id, p.id)} />
                ))}
                <button className="audio-add" onClick={() => add(sec.kind, sec.accept)}>
                  <Icon name="plus" /> {sec.add}
                </button>
              </div>
            ) : (
              <div className={'album' + (sec.kind === 'video' ? ' album-video' : '')}>
                {list.map((e, i) => (
                  <Tile
                    key={e.item.id}
                    entry={e}
                    ownerName={nameOf(e.ownerId)}
                    onOpen={() => openLightbox({ ids: list.map(x => x.item.id), index: i, ownerId: p.id })}
                    onDelete={() => askDeleteMedia(e.item.id, p.id)}
                  />
                ))}
                <button className="album-add" onClick={() => add(sec.kind, sec.accept)}>
                  <Icon name="plus" />
                  {sec.add}
                </button>
              </div>
            )}
          </section>
        );
      })}
      <p className="muted-note">До 200 МБ на файл. Всё хранится внутри зашифрованного архива.</p>
    </div>
  );
}
