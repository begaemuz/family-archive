import { useEffect } from 'react';
import { askDeleteMedia } from '../../flows/personFlows';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';

/** Просмотр на весь экран: фото, видео и аудио; стрелки, Esc, удаление. */
export function Lightbox() {
  const lb = useUi(s => s.lightbox);
  const setLb = useUi(s => s.setLightbox);
  const media = useArchive(s => s.data?.media);
  const id = lb ? lb.ids[lb.index] : null;
  const item = media?.find(m => m.id === id);
  const url = useMediaUrl(id);
  const n = lb ? lb.ids.length : 0;
  function step(d: number) {
    if (!lb || !n) return;
    setLb({ ...lb, index: (lb.index + d + n) % n });
  }

  useEffect(() => {
    if (!lb) return;
    const onKey = (e: KeyboardEvent) => {
      if (useUi.getState().confirmReq) return;
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!lb || !item) return null;

  return (
    <div className="lightbox open" onClick={e => e.target === e.currentTarget && setLb(null)}>
      {item.kind === 'photo' && url && <img src={url} alt={item.name} />}
      {item.kind === 'video' && url && <video key={id} src={url} controls autoPlay playsInline className="lb-media" />}
      {item.kind === 'audio' && url && (
        <div className="lb-audio">
          <Icon name="audio" size={56} />
          <div className="lb-audio-name">{item.name}</div>
          <audio key={id} src={url} controls autoPlay />
        </div>
      )}
      {n > 1 && (
        <>
          <button className="lb-prev" title="Предыдущее" onClick={() => step(-1)}>
            <Icon name="chevron-left" />
          </button>
          <button className="lb-next" title="Следующее" onClick={() => step(1)}>
            <Icon name="chevron-right" />
          </button>
        </>
      )}
      <button className="lb-close" title="Закрыть" onClick={() => setLb(null)}>
        <Icon name="x" />
      </button>
      {lb.ownerId && (
        <button
          className="lb-delete"
          title="Удалить"
          onClick={async () => {
            if (!(await askDeleteMedia(item.id, lb.ownerId))) return;
            const ids = lb.ids.filter(x => x !== item.id);
            if (!ids.length) setLb(null);
            else setLb({ ...lb, ids, index: Math.min(lb.index, ids.length - 1) });
          }}
        >
          <Icon name="trash" />
        </button>
      )}
      <div className="lb-count">{n > 1 ? `${lb.index + 1} из ${n}` : ''}</div>
    </div>
  );
}
