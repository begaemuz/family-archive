import type { KinGroup } from '../../domain/kinship';
import { fullName, genderClass, yearLine } from '../../domain/people';
import type { Person } from '../../domain/types';
import { askDeleteRelation, viewPersonFlow } from '../../flows/personFlows';
import { Icon } from '../../ui/Icon';
import { Avatar } from './PersonView';

export function RelationsTab({ person: p, groups }: { person: Person; groups: KinGroup[] }) {
  return (
    <div className="sp-body">
      {groups.map(g => (
        <div className="rel-group" key={g.title}>
          <div className="sp-section-title">
            {g.title} <span className="rel-n">{g.items.length}</span>
          </div>
          {g.items.map(item => (
            <div className="rel-item" key={item.other.id + (item.rel?.id ?? '')} onClick={() => viewPersonFlow(item.other.id)}>
              <div className={'rel-ava ' + genderClass(item.other.gender)}>
                <Avatar person={item.other} cls="x" />
              </div>
              <div className="rel-meta">
                <b>{fullName(item.other)}</b>
                <small>
                  {item.label}
                  {yearLine(item.other) ? ' · ' + yearLine(item.other) : ''}
                </small>
              </div>
              {item.rel && (
                <button
                  className="ghost danger rel-del"
                  title="Удалить связь"
                  onClick={e => {
                    e.stopPropagation();
                    askDeleteRelation(p.id, item.rel!);
                  }}
                >
                  <Icon name="x" />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
      {!groups.length && (
        <div className="sp-empty">
          Связей пока нет.
          <br />
          Наведите на человека на холсте и нажмите «＋» или потяните к другому человеку.
        </div>
      )}
      {groups.length > 0 && (
        <div className="rel-legend">
          Связи с крестиком — заданы вручную. Остальное родство (двоюродные, дяди, родня по браку…) вычисляется автоматически по родителям и супругам.
        </div>
      )}
    </div>
  );
}
