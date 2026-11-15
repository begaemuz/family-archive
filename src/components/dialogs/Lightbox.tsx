import { useEffect, useMemo, useRef, useState } from 'react';
import { mediaOwnerId } from '../../domain/mediaPeople';
import { fullName } from '../../domain/people';
import type { MediaItem } from '../../domain/types';
import { askDeleteMedia, viewPersonFlow } from '../../flows/personFlows';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';

/** «На фото:» — владелец альбома и отмеченные люди; можно отметить ещё кого-то.
    Отмеченным фото/видео показывается у них во вкладке «Медиа». */
function PhotoPeople({ item, onOpenPerson }: { item: MediaItem; onOpenPerson(id: string): void }) {
  const persons = useArchive(s => s.data!.persons);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const ownerId = useMemo(() => mediaOwnerId(persons, item.id), [persons, item.id]);
  const owner = ownerId ? persons.find(p => p.id === ownerId) : null;
  const tagged = item.people.map(id => persons.find(p => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const found = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return persons
      .filter(p => p.id !== ownerId && !item.people.includes(p.id) && fullName(p).toLowerCase().includes(t))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), 'ru'))
      .slice(0, 8);
  }, [persons, q, ownerId, item.people]);

  useEffect(() => {
    setAdding(false);
    setQ('');
  }, [item.id]);
  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const setPeople = (ids: string[]) => useArchive.getState().setMediaPeople(item.id, ids);

  return (
    <div className="lb-people" onClick={e => e.stopPropagation()}>
      <span className="lb-people-title">
        <Icon name="users" size={15} /> На фото:
      </span>
      {owner && (
        <button className="lb-chip owner" title="Фото в альбоме этого человека — открыть карточку" onClick={() => onOpenPerson(owner.id)}>
          {fullName(owner)}
        </button>
      )}
      {tagged.map(p => (
        <span className="lb-chip" key={p.id}>
          <button className="lb-chip-name" title="Открыть карточку" onClick={() => onOpenPerson(p.id)}>
            {fullName(p)}
          </button>
          <button className="lb-chip-x" title="Убрать отметку" onClick={() => setPeople(item.people.filter(x => x !== p.id))}>
            <Icon name="x" size={13} />
          </button>
        </span>
      ))}
      {!adding ? (
        <button className="lb-chip add" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> Отметить
        </button>
      ) : (
        <div className="lb-tag-picker">
          <input
            ref={inputRef}
            value={q}
            placeholder="Кто на фото? Начните вводить имя…"
            autoComplete="off"
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && found[0]) {
                setPeople([...item.people, found[0].id]);
                setQ('');
              }
              if (e.key === 'Escape') {
                e.stopPropagation();
                setAdding(false);
              }
            }}
          />
          {found.length > 0 && (
            <div className="lb-tag-list">
              {found.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPeople([...item.people, p.id]);
                    setQ('');
                    inputRef.current?.focus();
                  }}
                >
                  <Icon name="user" size={14} /> {fullName(p)}
                </button>
              ))}
            </div>
          )}
          {!found.length && q.trim() && <div className="lb-tag-empty">Никого не нашлось</div>}
        </div>
      )}
    </div>
  );
}

/** Просмотр на весь экран: фото, видео и аудио; стрелки, Esc, удаление, отметки людей. */
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
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return; // печатают имя — стрелки не листают
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
      {(item.kind === 'photo' || item.kind === 'video') && (
        <PhotoPeople
          item={item}
          onOpenPerson={pid => {
            setLb(null);
            viewPersonFlow(pid);
          }}
        />
      )}
    </div>
  );
}
