import { useAccess } from '../../hooks/useAccess';
import { useEffect, useMemo, useState } from 'react';
import { newId } from '../../domain/normalize';
import { fullName } from '../../domain/people';
import type { MediaItem, Person, Story } from '../../domain/types';
import { prepareFiles } from '../../flows/mediaFlows';
import { viewPersonFlow } from '../../flows/personFlows';
import { pickFiles } from '../../hooks/useFilePicker';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { PeopleAvatars, PersonAvatar } from './PeopleAvatars';

const NO_STORIES: Story[] = [];
const NO_PERSONS: Person[] = [];

/** Семейные истории: воспоминания, события, рассказы — с отмеченными людьми и файлами. */
export function StoriesPanel() {
  const open = useUi(s => s.storiesOpen);
  const stories = useArchive(s => s.data?.stories ?? NO_STORIES);
  const [editing, setEditing] = useState<Story | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const viewed = stories.find(s => s.id === viewId) ?? null;
  // открыли конкретную историю (например, из биографии человека)
  const storyId = useUi(s => s.storyId);
  useEffect(() => {
    if (!storyId) return;
    setEditing(null);
    setViewId(storyId);
    useUi.setState({ storyId: null });
  }, [storyId]);
  // «Новая история с …» из карточки человека — сразу редактор с отмеченным человеком
  const storyNewFor = useUi(s => s.storyNewFor);
  useEffect(() => {
    if (!storyNewFor) return;
    const now = Date.now();
    setViewId(null);
    setEditing({ id: newId(), title: '', text: '', date: '', personIds: [storyNewFor], mediaIds: [], createdAt: now, updatedAt: now });
    useUi.setState({ storyNewFor: null });
  }, [storyNewFor]);
  const sorted = useMemo(() => stories.slice().sort((a, b) => b.updatedAt - a.updatedAt), [stories]);
  const acc = useAccess();
  const persons = useArchive(s => s.data?.persons ?? NO_PERSONS);
  const byId = useMemo(() => new Map(persons.map(x => [x.id, x])), [persons]);

  return (
    <aside className={'side-panel stories-panel' + (open ? ' open' : '') + (editing ? ' form-mode' : '')} aria-label="Семейные истории">
      {open && editing && <StoryEditor story={editing} onDone={id => (setEditing(null), setViewId(id))} />}
      {open && !editing && viewed && <StoryView story={viewed} onBack={() => setViewId(null)} onEdit={() => setEditing({ ...viewed })} />}
      {open && !editing && !viewed && (
        <>
          <div className="modal-header">
            <div>
              <h2>Семейные истории</h2>
              <p>Воспоминания, события, рассказы старших</p>
            </div>
            <button className="icon-button ghost" title="Закрыть" onClick={() => useUi.getState().setStoriesOpen(false)}>
              <Icon name="x" />
            </button>
          </div>
          <div className="sp-body">
            {sorted.map(s => (
              <button key={s.id} className="story-item" onClick={() => setViewId(s.id)}>
                <span className="story-item-head">
                  <b>{s.title || 'Без названия'}</b>
                  <PeopleAvatars people={s.personIds.map(id => byId.get(id)).filter((x): x is Person => !!x)} size={26} />
                </span>
                <small>{[s.date, s.mediaIds.length ? `файлов: ${s.mediaIds.length}` : ''].filter(Boolean).join(' · ') || 'История'}</small>
                <span>{s.text.slice(0, 140)}</span>
              </button>
            ))}
            {!stories.length && <div className="sp-empty">Историй пока нет. Запишите первую — например, как познакомились бабушка с дедушкой.</div>}
          </div>
          <div className="sp-footer">
            {acc.canAddStory() && (
            <button
              className="primary"
              onClick={() => {
                const now = Date.now();
                setEditing({ id: newId(), title: '', text: '', date: '', personIds: [], mediaIds: [], createdAt: now, updatedAt: now });
              }}
            >
              <Icon name="plus" /> Новая история
            </button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function MediaThumb({ m, onClick }: { m: MediaItem; onClick(): void }) {
  const url = useMediaUrl(m.id);
  return (
    <div className={'album-item kind-' + m.kind} onClick={onClick} title={m.name}>
      {m.kind === 'photo' && url && <img src={url} alt="" />}
      {m.kind === 'video' && url && <video src={url} preload="metadata" muted playsInline />}
      {m.kind === 'audio' && (
        <div className="audio-tile">
          <Icon name="audio" size={28} />
          <span>{m.name}</span>
        </div>
      )}
      {m.kind === 'video' && (
        <span className="play-badge">
          <Icon name="play" size={18} />
        </span>
      )}
    </div>
  );
}

function StoryView({ story: s, onBack, onEdit }: { story: Story; onBack(): void; onEdit(): void }) {
  const acc = useAccess();
  const persons = useArchive(st => st.data!.persons);
  const media = useArchive(st => st.data!.media);
  const items = s.mediaIds.map(id => media.find(m => m.id === id)).filter((m): m is MediaItem => !!m);
  return (
    <>
      <div className="modal-header">
        <div>
          <h2>{s.title || 'Без названия'}</h2>
          <p>{s.date || 'Семейная история'}</p>
        </div>
        <div className="sp-actions static">
          {acc.canEditStory(s) && (
          <button className="ghost" title="Редактировать" onClick={onEdit}>
            <Icon name="edit" />
          </button>
          )}
          {acc.canDeleteStory(s) && (
          <button
            className="ghost danger"
            title="Удалить историю"
            onClick={async () => {
              const ok = await useUi.getState().confirm({ title: 'Удалить историю?', body: <>История «{s.title || 'без названия'}» будет удалена вместе с прикреплёнными к ней файлами.</>, ok: 'Удалить историю' });
              if (ok !== true) return;
              const st = useArchive.getState();
              s.mediaIds.forEach(id => {
                const usedElsewhere = st.data!.persons.some(p => p.media.includes(id) || p.documents.includes(id) || p.mainPhotoId === id);
                if (!usedElsewhere) st.deleteMedia(id);
              });
              useArchive.getState().deleteStory(s.id);
              onBack();
            }}
          >
            <Icon name="trash" />
          </button>
          )}
          <button className="ghost" title="Назад к списку" onClick={onBack}>
            <Icon name="chevron-left" />
          </button>
        </div>
      </div>
      <div className="sp-body">
        {s.personIds.length > 0 && (
          <div className="chips story-people">
            {s.personIds.map(id => {
              const p = persons.find(x => x.id === id);
              return p ? (
                <button key={id} className="chip with-ava" onClick={() => viewPersonFlow(id)}>
                  <PersonAvatar person={p} size={24} />
                  {fullName(p)}
                </button>
              ) : null;
            })}
          </div>
        )}
        <div className="bio-section">
          <p>{s.text}</p>
        </div>
        {items.length > 0 && (
          <div className="album" style={{ marginTop: 16 }}>
            {items.map((m, i) => (
              <MediaThumb key={m.id} m={m} onClick={() => useUi.getState().openLightbox({ ids: items.map(x => x.id), index: i, ownerId: null })} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function StoryEditor({ story, onDone }: { story: Story; onDone(id: string | null): void }) {
  const persons = useArchive(st => st.data!.persons);
  const media = useArchive(st => st.data!.media);
  const exists = useArchive(st => st.data!.stories.some(x => x.id === story.id));
  const [s, setS] = useState<Story>(story);
  const [q, setQ] = useState('');
  const found = q.trim()
    ? persons.filter(p => !s.personIds.includes(p.id) && fullName(p).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];
  const items = s.mediaIds.map(id => media.find(m => m.id === id)).filter((m): m is MediaItem => !!m);

  const attach = async () => {
    const files = await pickFiles('image/*,video/*,audio/*', true);
    if (!files.length) return;
    const ready = await prepareFiles(files, ['photo', 'video', 'audio']);
    const st = useArchive.getState();
    ready.forEach(r => st.addMedia(r.item, r.blob));
    setS(cur => ({ ...cur, mediaIds: [...cur.mediaIds, ...ready.map(r => r.item.id)] }));
  };

  return (
    <>
      <div className="modal-header">
        <div>
          <h2>{exists ? 'Редактирование истории' : 'Новая история'}</h2>
          <p>Отметьте людей — история появится у них во вкладке «Связи»</p>
        </div>
        <button className="icon-button ghost" title="Закрыть" onClick={() => onDone(exists ? story.id : null)}>
          <Icon name="x" />
        </button>
      </div>
      <div className="modal-body">
        <div className="form-grid one">
          <div className="field">
            <label htmlFor="st_title">Заголовок</label>
            <input id="st_title" value={s.title} autoFocus placeholder="Например: Как переехали в Ташкент" onChange={e => setS({ ...s, title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="st_date">Когда (необязательно)</label>
            <input id="st_date" value={s.date} placeholder="Например: лето 1966" onChange={e => setS({ ...s, date: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="st_text">Рассказ</label>
            <textarea id="st_text" className="tall" value={s.text} placeholder="Расскажите, как это было…" onChange={e => setS({ ...s, text: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="st_people">Кто в этой истории</label>
            <input id="st_people" value={q} placeholder="Начните вводить имя…" autoComplete="off" onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        {found.length > 0 && (
          <div className="map-results">
            {found.map(p => (
              <button
                key={p.id}
                type="button"
                className="map-result"
                onClick={() => {
                  setS({ ...s, personIds: [...s.personIds, p.id] });
                  setQ('');
                }}
              >
                <Icon name="user" />
                <span>{fullName(p)}</span>
              </button>
            ))}
          </div>
        )}
        {s.personIds.length > 0 && (
          <div className="chips story-people">
            {s.personIds.map(id => {
              const p = persons.find(x => x.id === id);
              return p ? (
                <button key={id} className="chip removable with-ava" title="Убрать" onClick={() => setS({ ...s, personIds: s.personIds.filter(x => x !== id) })}>
                  <PersonAvatar person={p} size={22} />
                  {fullName(p)} <Icon name="x" size={12} />
                </button>
              ) : null;
            })}
          </div>
        )}
        <div className="form-section-title" style={{ marginTop: 20 }}>
          <Icon name="image" /> Фото, видео, аудио
        </div>
        <div className="album">
          <button className="album-add" onClick={attach}>
            <Icon name="plus" />
            Добавить
          </button>
          {items.map(m => (
            <div key={m.id} style={{ position: 'relative' }}>
              <MediaThumb m={m} onClick={() => {}} />
              <button className="album-del" style={{ opacity: 1 }} title="Открепить" onClick={() => setS({ ...s, mediaIds: s.mediaIds.filter(x => x !== m.id) })}>
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="modal-footer">
        <button className="ghost" onClick={() => onDone(exists ? story.id : null)}>
          Отмена
        </button>
        <button
          className="primary"
          disabled={!s.title.trim() && !s.text.trim()}
          onClick={() => {
            useArchive.getState().saveStory({ ...s, title: s.title.trim(), updatedAt: Date.now() });
            useUi.getState().showToast('История сохранена');
            onDone(s.id);
          }}
        >
          Сохранить
        </button>
      </div>
    </>
  );
}
