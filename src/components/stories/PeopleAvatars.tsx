import { fullName, genderClass, initials } from '../../domain/people';
import type { Person } from '../../domain/types';
import { useMediaUrl } from '../../hooks/useMediaUrl';

/** Круглая аватарка человека: фото или инициалы на цвете пола. */
export function PersonAvatar({ person, size = 28 }: { person: Person; size?: number }) {
  const url = useMediaUrl(person.mainPhotoId);
  return (
    <span className={'p-ava ' + genderClass(person.gender)} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} title={fullName(person)}>
      {url ? <img src={url} alt="" draggable={false} /> : initials(person)}
    </span>
  );
}

/** Стопка аватарок участников истории: первые несколько + «+N». */
export function PeopleAvatars({ people, max = 5, size = 28 }: { people: Person[]; max?: number; size?: number }) {
  if (!people.length) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="p-stack" aria-label={people.map(fullName).join(', ')}>
      {shown.map(p => (
        <PersonAvatar key={p.id} person={p} size={size} />
      ))}
      {rest > 0 && (
        <span className="p-ava more" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
          +{rest}
        </span>
      )}
    </span>
  );
}
