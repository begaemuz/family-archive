import { formatSize } from '../../archive/media';
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

function DeleteButton({ onDelete }: { onDelete(): void }) {
  return (
    <button
      className="album-del"
      title="Удалить"
      onClick={e => {
        e.stopPropagation();
        onDelete();
      }}
    >
      <Icon name="trash" />
    </button>
  );
}

function Tile({ item, onOpen, onDelete }: { item: MediaItem; onOpen(): void; onDelete(): void }) {
  const url = useMediaUrl(item.id);
  return (
    <div className={'album-item kind-' + item.kind} onClick={onOpen} title={item.name}>
      {item.kind === 'photo' && url && <img src={url} alt="" loading="lazy" draggable={false} />}
      {item.kind === 'video' && url && <video src={url} preload="metadata" muted playsInline />}
      {item.kind === 'video' && (
        <span className="play-badge">
          <Icon name="play" size={18} />
        </span>
      )}
      <DeleteButton onDelete={onDelete} />
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
  const items = p.media.map(id => media.find(m => m.id === id)).filter((m): m is MediaItem => !!m);
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
        const list = items.filter(m => m.kind === sec.kind);
        return (
          <section className="media-section" key={sec.kind}>
            <div className="sp-section-title">
              <Icon name={sec.icon} size={14} /> {sec.title}
              {list.length > 0 && <span className="rel-n">{list.length}</span>}
            </div>
            {sec.kind === 'audio' ? (
              <div className="audio-list">
                {list.map(m => (
                  <AudioRow key={m.id} item={m} onDelete={() => askDeleteMedia(m.id, p.id)} />
                ))}
                <button className="audio-add" onClick={() => add(sec.kind, sec.accept)}>
                  <Icon name="plus" /> {sec.add}
                </button>
              </div>
            ) : (
              <div className={'album' + (sec.kind === 'video' ? ' album-video' : '')}>
                {list.map((m, i) => (
                  <Tile
                    key={m.id}
                    item={m}
                    onOpen={() => openLightbox({ ids: list.map(x => x.id), index: i, ownerId: p.id })}
                    onDelete={() => askDeleteMedia(m.id, p.id)}
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
