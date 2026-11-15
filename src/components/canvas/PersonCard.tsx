import { memo } from 'react';
import { fullName, genderClass, initials, yearLine } from '../../domain/people';
import type { Person } from '../../domain/types';
import { useMediaUrl } from '../../hooks/useMediaUrl';

export interface CardActions {
  onPointerDown(e: React.PointerEvent, id: string): void;
  onClick(e: React.MouseEvent, id: string): void;
  onView(id: string): void;
  onEdit(id: string): void;
  onLinkStart(e: React.PointerEvent, id: string): void;
  onToggleCollapse(id: string): void;
  registerEl(id: string, el: HTMLDivElement | null): void;
}

interface Props {
  person: Person;
  selected: boolean;
  linkTarget: boolean;
  /** всего потомков (для «+N» у свёрнутого) */
  descCount: number;
  /** видимых потомков (кнопка «свернуть» только если они есть) */
  visibleDesc: number;
  actions: CardActions;
  /** права: менять этого человека / добавлять от него связи (у участника — только в своей ветке) */
  canEdit: boolean;
  canLink: boolean;
}

/* Иконки кнопок вокруг круга — как в прежней версии (26 px). */
const BtnIcon = ({ d }: { d: React.ReactNode }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', pointerEvents: 'none' }}>
    {d}
  </svg>
);

export const PersonCard = memo(function PersonCard({ person: p, selected, linkTarget, descCount, visibleDesc, actions, canEdit, canLink }: Props) {
  const photo = useMediaUrl(p.mainPhotoId);
  const stop = (e: React.PointerEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const showCollapse = !p.collapsed && visibleDesc > 0;
  const showExpand = p.collapsed && descCount > 0;

  return (
    <div
      ref={el => actions.registerEl(p.id, el)}
      className={['person', genderClass(p.gender), selected ? 'selected' : '', linkTarget ? 'link-target' : ''].filter(Boolean).join(' ')}
      data-id={p.id}
      style={{ left: p.x, top: p.y }}
      onPointerDown={e => actions.onPointerDown(e, p.id)}
      onClick={e => actions.onClick(e, p.id)}
    >
      <div className="avatar-wrap">
        <div className="avatar">{photo ? <img src={photo} alt={fullName(p)} draggable={false} /> : initials(p)}</div>

        <button
          className="direction-btn direction-up"
          title="Открыть карточку"
          onPointerDown={stop}
          onClick={e => {
            e.stopPropagation();
            actions.onView(p.id);
          }}
        >
          <BtnIcon d={<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>} />
        </button>
        {canEdit && (
        <button
          className="direction-btn direction-left"
          title="Редактировать"
          onPointerDown={stop}
          onClick={e => {
            e.stopPropagation();
            actions.onEdit(p.id);
          }}
        >
          <BtnIcon d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></>} />
        </button>
        )}
        {canLink && (
        <button
          className="direction-btn direction-right"
          title="Добавить связь (нажмите или потяните к человеку)"
          onPointerDown={e => {
            stop(e);
            actions.onLinkStart(e, p.id);
          }}
          onClick={e => e.stopPropagation()}
        >
          <BtnIcon d={<path d="M12 5v14M5 12h14" />} />
        </button>
        )}
        {(showCollapse || showExpand) && (
          <button
            className={'direction-btn direction-down' + (showExpand ? ' expand' : '')}
            title={showExpand ? `Развернуть род (${descCount})` : 'Свернуть род'}
            onPointerDown={stop}
            onClick={e => {
              e.stopPropagation();
              actions.onToggleCollapse(p.id);
            }}
          >
            {showExpand ? '+' + descCount : <BtnIcon d={<path d="M5 12h14" />} />}
          </button>
        )}
        {showExpand && (
          <div
            className="collapse-badge"
            title={`Развернуть род (${descCount})`}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              actions.onToggleCollapse(p.id);
            }}
          >
            +{descCount}
          </div>
        )}
      </div>
      <div className="person-name">{fullName(p)}</div>
      {yearLine(p) && <div className="person-years">{yearLine(p)}</div>}
    </div>
  );
});
