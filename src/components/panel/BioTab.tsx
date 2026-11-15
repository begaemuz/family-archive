import { useMemo, useState } from 'react';
import { normBio } from '../../domain/normalize';
import type { BioSection, Person } from '../../domain/types';
import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';

/** Биография — разделы «заголовок + текст»: можно добавлять, переставлять, удалять. */
export function BioTab({ person: p }: { person: Person }) {
  const [draft, setDraft] = useState<BioSection[] | null>(null);
  const confirm = useUi(s => s.confirm);
  const allStories = useArchive(s => s.data!.stories);
  const stories = useMemo(() => allStories.filter(s => s.personIds.includes(p.id)), [allStories, p.id]);

  if (draft) {
    const patch = (i: number, v: Partial<BioSection>) => setDraft(d => d!.map((b, j) => (j === i ? { ...b, ...v } : b)));
    const move = (i: number, d: number) =>
      setDraft(cur => {
        const a = cur!.slice();
        [a[i], a[i + d]] = [a[i + d], a[i]];
        return a;
      });
    const del = async (i: number) => {
      const sec = draft[i];
      if (sec.title.trim() || sec.text.trim()) {
        const ok = await confirm({
          title: 'Удалить раздел?',
          body: (
            <>
              Раздел {sec.title.trim() ? <b>{sec.title}</b> : 'без заголовка'} и его текст будут удалены.
            </>
          ),
          ok: 'Удалить раздел',
        });
        if (ok !== true) return;
      }
      setDraft(d => d!.filter((_, j) => j !== i));
    };
    return (
      <>
        <div className="sp-body">
          {draft.map((b, i) => (
            <div className="bio-edit-item" key={i}>
              <div className="bio-edit-head">
                <span>Раздел {i + 1}</span>
                <div className="btns">
                  <button className="ghost" title="Выше" disabled={i === 0} onClick={() => move(i, -1)}>
                    <Icon name="chevron-up" />
                  </button>
                  <button className="ghost" title="Ниже" disabled={i === draft.length - 1} onClick={() => move(i, 1)}>
                    <Icon name="chevron-down" />
                  </button>
                  <button className="ghost danger" title="Удалить раздел" onClick={() => del(i)}>
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Заголовок</label>
                <input value={b.title} placeholder="Например: Детство и юность" onChange={e => patch(i, { title: e.target.value })} />
              </div>
              <div className="field">
                <label>Текст</label>
                <textarea value={b.text} placeholder="Расскажите историю…" onChange={e => patch(i, { text: e.target.value })} autoFocus={i === draft.length - 1} />
              </div>
            </div>
          ))}
          <button className="bio-add" onClick={() => setDraft(d => [...d!, { title: '', text: '' }])}>
            <Icon name="plus" /> Добавить раздел
          </button>
        </div>
        <div className="sp-footer">
          <button className="ghost" onClick={() => setDraft(null)}>
            Отмена
          </button>
          <button
            className="primary"
            onClick={() => {
              useArchive.getState().updatePerson(p.id, { bio: normBio(draft) });
              setDraft(null);
              useUi.getState().showToast('Биография сохранена');
            }}
          >
            Сохранить
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="sp-body">
      {stories.length > 0 && (
        <div className="bio-stories">
          <div className="sp-section-title">
            Истории <span className="rel-n">{stories.length}</span>
          </div>
          {stories.map(s => (
            <button key={s.id} className="story-item" onClick={() => useUi.getState().openStory(s.id)}>
              <b>{s.title || 'Без названия'}</b>
              {s.date && <small>{s.date}</small>}
              {s.text && <span>{s.text.slice(0, 160)}</span>}
            </button>
          ))}
        </div>
      )}
      {stories.length > 0 && p.bio.length > 0 && <div className="sp-section-title">Биография</div>}
      {p.bio.length ? (
        <>
          <div className="bio-toolbar">
            <button onClick={() => setDraft(p.bio.map(b => ({ ...b })))}>
              <Icon name="edit" /> Редактировать
            </button>
          </div>
          {p.bio.map((b, i) => (
            <div className="bio-section" key={i}>
              {b.title && <h3>{b.title}</h3>}
              {b.text && <p>{b.text}</p>}
            </div>
          ))}
        </>
      ) : (
        <div className="sp-empty">
          Биография пока не написана
          <div>
            <button className="primary" onClick={() => setDraft([{ title: 'Биография', text: '' }])}>
              <Icon name="plus" /> Добавить раздел
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
