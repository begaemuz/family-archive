import type { MediaItem, Person } from '../../domain/types';
import { prepareFiles } from '../../flows/mediaFlows';
import { askDeleteMedia } from '../../flows/personFlows';
import { pickFiles } from '../../hooks/useFilePicker';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/avif,video/*,audio/*,.mp3,.m4a,.wav,.ogg,.flac,.mp4,.mov,.webm,.mkv,.avi';

function Tile({ item, onOpen, onDelete }: { item: MediaItem; onOpen(): void; onDelete(): void }) {
  const url = useMediaUrl(item.id);
  return (
    <div className={'album-item kind-' + item.kind} onClick={onOpen} title={item.name}>
      {item.kind === 'photo' && url && <img src={url} alt="" loading="lazy" draggable={false} />}
      {item.kind === 'video' && url && <video src={url} preload="metadata" muted playsInline />}
      {item.kind === 'audio' && (
        <div className="audio-tile">
          <Icon name="audio" size={28} />
          <span>{item.name}</span>
        </div>
      )}
      {item.kind === 'video' && (
        <span className="play-badge">
          <Icon name="play" size={18} />
        </span>
      )}
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
    </div>
  );
}

/** Медиа человека: фото, видео (до 200 МБ) и аудио. */
export function MediaTab({ person: p }: { person: Person }) {
  const media = useArchive(s => s.data!.media);
  const items = p.media.map(id => media.find(m => m.id === id)).filter((m): m is MediaItem => !!m);
  const openLightbox = useUi(s => s.openLightbox);

  const add = async () => {
    const files = await pickFiles(ACCEPT, true);
    if (!files.length) return;
    useUi.getState().showToast('Добавляю файлы…');
    const ready = await prepareFiles(files, ['photo', 'video', 'audio']);
    if (!ready.length) return;
    const st = useArchive.getState();
    ready.forEach(r => st.addMedia(r.item, r.blob));
    st.updatePerson(p.id, { media: [...(st.data!.persons.find(x => x.id === p.id)?.media ?? []), ...ready.map(r => r.item.id)] });
    useUi.getState().showToast(`Добавлено: ${ready.length}`);
  };

  const counts = { photo: 0, video: 0, audio: 0 } as Record<string, number>;
  items.forEach(i => counts[i.kind]++);

  return (
    <div className="sp-body">
      {items.length > 0 && (
        <div className="media-summary">
          {counts.photo > 0 && <span>Фото: {counts.photo}</span>}
          {counts.video > 0 && <span>Видео: {counts.video}</span>}
          {counts.audio > 0 && <span>Аудио: {counts.audio}</span>}
        </div>
      )}
      <div className="album">
        {items.map((m, i) => (
          <Tile key={m.id} item={m} onOpen={() => openLightbox({ ids: items.map(x => x.id), index: i, ownerId: p.id })} onDelete={() => askDeleteMedia(m.id, p.id)} />
        ))}
        <button className="album-add" onClick={add}>
          <Icon name="plus" />
          Добавить
        </button>
      </div>
      {!items.length && <div className="sp-empty" style={{ marginTop: 14 }}>Здесь будут фото, видео и аудиозаписи (до 200 МБ на файл)</div>}
    </div>
  );
}
