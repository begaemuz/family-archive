import { useAccess } from '../../hooks/useAccess';
import { addPersonFlow } from '../../flows/personFlows';
import { Icon } from '../../ui/Icon';

/** Архив открыт, но людей ещё нет. */
export function EmptyTree() {
  const acc = useAccess();
  return (
    <div className="empty-state empty-tree">
      <div className="empty-icon">
        <Icon name="tree" size={30} />
      </div>
      <strong>Добавьте первого человека</strong>
      <span className="empty-sub">Начните с себя, родителей или старшего поколения — дальше родственников удобно добавлять кнопкой «＋» у круга.</span>
      <div className="start-actions">
        {acc.canAddFree() && (
        <button className="primary" onClick={() => addPersonFlow()}>
          <Icon name="plus" />
          Добавить человека
        </button>
        )}
      </div>
    </div>
  );
}
