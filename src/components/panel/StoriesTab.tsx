import { useAccess } from '../../hooks/useAccess';
import { useMemo } from 'react';
import { fullName } from '../../domain/people';
import type { Person } from '../../domain/types';
import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { PeopleAvatars } from '../stories/PeopleAvatars';

/** Истории, в которых отмечен человек: карточки с аватарками участников. */
export function StoriesTab({ person: p }: { person: Person }) {
  const acc = useAccess();
  const all = useArchive(s => s.data!.stories);
  const persons = useArchive(s => s.data!.persons);
  const stories = useMemo(() => all.filter(s => s.personIds.includes(p.id)).sort((a, b) => b.updatedAt - a.updatedAt), [all, p.id]);
  const byId = useMemo(() => new Map(persons.map(x => [x.id, x])), [persons]);

  return (
    <div className="sp-body">
      {acc.canAddStory() && (
        <button className="bio-add doc-add" onClick={() => useUi.getState().newStory(p.id)}>
          <Icon name="plus" /> Новая история с {p.firstName || fullName(p)}
        </button>
      )}
      {stories.map(s => {
        const people = s.personIds.map(id => byId.get(id)).filter((x): x is Person => !!x);
        return (
          <button key={s.id} className="story-item" onClick={() => useUi.getState().openStory(s.id)}>
            <span className="story-item-head">
              <b>{s.title || 'Без названия'}</b>
              <PeopleAvatars people={people} size={26} />
            </span>
            {s.date && <small>{s.date}</small>}
            {s.text && <span>{s.text.slice(0, 160)}</span>}
          </button>
        );
      })}
      {!stories.length && <div className="sp-empty">Историй с этим человеком пока нет. Запишите воспоминание — как познакомились, где жили, чем запомнился.</div>}
    </div>
  );
}
