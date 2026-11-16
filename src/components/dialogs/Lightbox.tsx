import { useAccess } from '../../hooks/useAccess';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mediaOwnerId } from '../../domain/mediaPeople';
import { birthYear, fullName } from '../../domain/people';
import { YearPicker } from '../../ui/YearPicker';
import type { MediaItem } from '../../domain/types';
import { askDeleteMedia, viewPersonFlow } from '../../flows/personFlows';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { FaceBoxes, FaceQuestions, FaceScanButton, useFaceScan, type FaceScan } from './LightboxFaces';

/** Год снимка — выбор из сетки годов. Без выбранного года пикер открывается на молодости владельца фото. */
function MediaYear({ item, readOnly, hint }: { item: MediaItem; readOnly: boolean; hint: number | null }) {
  return (
    <YearPicker
      value={item.year}
      hint={hint}
      readOnly={readOnly}
      placement="up"
      placeholder={item.date || 'Год снимка'}
      onChange={y => useArchive.getState().setMediaYear(item.id, y)}
    />
  );
}

const TAGS_SHOWN = 8;

/** «На фото:» — владелец альбома и отмеченные люди; можно отметить ещё кого-то.
    Отмеченным фото/видео показывается у них во вкладке «Медиа». */
function PhotoPeople({ item, scan, onOpenPerson }: { item: MediaItem; scan: FaceScan; onOpenPerson(id: string): void }) {
  const persons = useArchive(s => s.data!.persons);
  const acc = useAccess();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const ownerId = useMemo(() => mediaOwnerId(persons, item.id), [persons, item.id]);
  const owner = ownerId ? persons.find(p => p.id === ownerId) : null;
  // владелец альбома показан первым (синим) — среди отмеченных его не повторяем
  const tagged = item.people
    .filter(id => id !== ownerId)
    .map(id => persons.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  // много отмеченных — показываем первых, остальные по кнопке «ещё N» (строка не разрастается на пол-экрана)
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? tagged : tagged.slice(0, TAGS_SHOWN);
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
    setShowAll(false);
  }, [item.id]);
  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const setPeople = (ids: string[]) => useArchive.getState().setMediaPeople(item.id, ids);
  // менять дату и отметки можно, если владелец фото — в вашей ветке
  const editable = acc.canEditMediaItem(item, ownerId);

  return (
    <div className="lb-people" onClick={e => e.stopPropagation()}>
      <MediaYear item={item} readOnly={!editable} hint={owner && birthYear(owner) ? birthYear(owner)! + 20 : null} />
      <span className="lb-sep" />
      <span className="lb-people-title">
        <Icon name="users" size={15} /> На фото:
      </span>
      {owner && (
        <button className="lb-chip owner" title="Фото в альбоме этого человека — открыть карточку" onClick={() => onOpenPerson(owner.id)}>
          {fullName(owner)}
        </button>
      )}
      {shown.map(p => (
        <span className="lb-chip" key={p.id}>
          <button className="lb-chip-name" title="Открыть карточку" onClick={() => onOpenPerson(p.id)}>
            {fullName(p)}
          </button>
          {editable && (
            <button className="lb-chip-x" title="Убрать отметку" onClick={() => setPeople(item.people.filter(x => x !== p.id))}>
              <Icon name="x" size={13} />
            </button>
          )}
        </span>
      ))}
      {tagged.length > shown.length && (
        <button className="lb-chip more" title="Показать всех" onClick={() => setShowAll(true)}>
          ещё {tagged.length - shown.length}
        </button>
      )}
      {!editable ? null : !adding ? (
        <>
          <button className="lb-chip add" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} /> Отметить
          </button>
          {item.kind === 'photo' && <FaceScanButton scan={scan} />}
        </>
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
  const persons = useArchive(s => s.data?.persons);
  const acc = useAccess();
  const id = lb ? lb.ids[lb.index] : null;
  const item = media?.find(m => m.id === id);
  const url = useMediaUrl(id);
  const n = lb ? lb.ids.length : 0;
  const [facesOn, setFacesOn] = useState(false);
  // высота нижней строки (год, «На фото», вопросы) растёт с числом отметок — фото ужимается над ней
  const boxRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hasBar = !!item && (item.kind === 'photo' || item.kind === 'video');
  useEffect(() => {
    const bar = barRef.current;
    const box = boxRef.current;
    if (!bar || !box) return;
    const ro = new ResizeObserver(() => box.style.setProperty('--lb-bar', `${Math.ceil(bar.getBoundingClientRect().height)}px`));
    ro.observe(bar);
    return () => ro.disconnect();
  }, [hasBar, !!lb]);
  const ownerId = useMemo(() => (persons && item ? mediaOwnerId(persons, item.id) : null), [persons, item]);
  // распознавание — только там, где можно менять отметки
  const scan = useFaceScan(item, !!item && acc.canEditMediaItem(item, ownerId), !!lb?.scan);
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
  // удалить своё фото — право «удалять»; снять отметку с себя на чужом — право «менять» этого человека
  const viewerOwns = !!lb.ownerId && !!persons?.find(p => p.id === lb.ownerId)?.media.includes(item.id);
  const canDeleteHere = !!lb.ownerId && (viewerOwns ? acc.canDeleteMedia(lb.ownerId) : acc.canEditPerson(lb.ownerId));

  return (
    <div className="lightbox open" ref={boxRef} onClick={e => e.target === e.currentTarget && setLb(null)}>
      {item.kind === 'photo' && url && (
        <div className={'lb-photo' + (facesOn ? ' faces-on' : '')} onClick={e => {
          e.stopPropagation();
          // на сенсорном экране наведения нет — рамки лиц по нажатию
          if (matchMedia('(hover: none)').matches) setFacesOn(v => !v);
        }}>
          <img src={url} alt={item.name} />
          <FaceBoxes scan={scan} item={item} />
        </div>
      )}
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
      {lb.ownerId && canDeleteHere && (
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
        <div className="lb-bottom" ref={barRef}>
          {item.kind === 'photo' && <FaceQuestions item={item} scan={scan} />}
          <PhotoPeople
            item={item}
            scan={scan}
            onOpenPerson={pid => {
              setLb(null);
              viewPersonFlow(pid);
            }}
          />
        </div>
      )}
    </div>
  );
}
