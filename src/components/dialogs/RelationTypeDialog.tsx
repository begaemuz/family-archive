import type { RelType } from '../../domain/types';
import { fullName } from '../../domain/people';
import { linkPeople } from '../../flows/personFlows';
import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';
import { Icon, type IconName } from '../../ui/Icon';

const CHOICES: { kind: RelType | 'child'; icon: IconName; title: string; hint: string }[] = [
  { kind: 'parent', icon: 'users', title: 'Родитель', hint: 'Первый человек — родитель второго' },
  { kind: 'child', icon: 'user', title: 'Ребёнок', hint: 'Первый человек — ребёнок второго' },
  { kind: 'spouse', icon: 'heart', title: 'Супруги / партнёры', hint: 'Муж и жена, партнёры' },
  { kind: 'sibling', icon: 'user', title: 'Брат / сестра', hint: 'Если общие родители не указаны' },
  { kind: 'other', icon: 'link', title: 'Другая связь', hint: 'Крёстные, опекуны и т.п.' },
];

/** Тип связи, когда «＋» протянули к другому человеку. */
export function RelationTypeDialog() {
  const req = useUi(s => s.relationReq);
  const close = useUi(s => s.closeRelation);
  const persons = useArchive(s => s.data?.persons);
  if (!req || !persons) return null;
  const a = persons.find(p => p.id === req.from);
  const b = persons.find(p => p.id === req.to);
  if (!a || !b) return null;
  return (
    <div className="overlay open" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ width: 'min(460px,100%)' }}>
        <div className="modal-header">
          <div>
            <h2>Тип родственной связи</h2>
            <p>
              Первый — {fullName(a)}, второй — {fullName(b)}
            </p>
          </div>
          <button className="icon-button ghost" title="Закрыть" onClick={close}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">
          <div className="rel-choices">
            {CHOICES.map(c => (
              <button
                key={c.kind}
                className="rel-choice"
                onClick={() => {
                  linkPeople(c.kind, a.id, b.id);
                  close();
                }}
              >
                <span className="rel-ico">
                  <Icon name={c.icon} />
                </span>
                <span>
                  <b>{c.title}</b>
                  <small>{c.hint}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
