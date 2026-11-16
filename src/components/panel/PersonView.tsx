import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccess } from '../../hooks/useAccess';
import { relationGroups } from '../../domain/kinship';
import { personMedia } from '../../domain/mediaPeople';
import { ageText, fullName, genderClass, initials, yearLine } from '../../domain/people';
import type { Person } from '../../domain/types';
import { askDeletePerson, editPersonFlow } from '../../flows/personFlows';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import { useArchive } from '../../store/archiveStore';
import { useUi, type PanelTab } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { BioTab } from './BioTab';
import { StoriesTab } from './StoriesTab';
import { DocumentsTab } from './DocumentsTab';
import { InfoTab } from './InfoTab';
import { MediaTab } from './MediaTab';
import { RelationsTab } from './RelationsTab';

export function Avatar({ person, cls = 'avatar' }: { person: Person; cls?: string }) {
  const url = useMediaUrl(person.mainPhotoId);
  return url ? <img src={url} alt={fullName(person)} draggable={false} /> : <div className={cls}>{initials(person)}</div>;
}

/** Кнопки карточки: на компьютере — «изменить» и «удалить» иконками, на телефоне — меню «⋮». */
function PersonActions({ person: p, onClose }: { person: Person; onClose(): void }) {
  const acc = useAccess();
  const canEdit = acc.canEditPerson(p.id);
  const canDelete = acc.canDeletePerson(p.id);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [menu]);
  useEffect(() => setMenu(false), [p.id]);

  return (
    <div className="sp-actions">
      {canEdit && (
        <button className="ghost wide-only" title="Редактировать" onClick={() => editPersonFlow(p.id)}>
          <Icon name="edit" />
        </button>
      )}
      {canDelete && (
        <button className="ghost danger wide-only" title="Удалить человека" onClick={() => askDeletePerson(p.id)}>
          <Icon name="trash" />
        </button>
      )}
      {(canEdit || canDelete) && (
        <div className="sp-more narrow-only" ref={ref}>
          <button className="ghost" title="Действия" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
            <Icon name="more-v" />
          </button>
          {menu && (
            <div className="sp-more-menu" role="menu">
              {canEdit && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    editPersonFlow(p.id);
                  }}
                >
                  <Icon name="edit" size={16} /> Редактировать
                </button>
              )}
              {canDelete && (
                <button
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setMenu(false);
                    askDeletePerson(p.id);
                  }}
                >
                  <Icon name="trash" size={16} /> Удалить
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {!canEdit && (
        <span className="ro-badge" title="Этот человек не из вашей ветки — только просмотр">
          <Icon name="eye" size={14} />
          <span className="wide-only">просмотр</span>
        </span>
      )}
      <button className="ghost" title="Закрыть" onClick={onClose}>
        <Icon name="x" />
      </button>
    </div>
  );
}

export function PersonView({ person: p }: { person: Person }) {
  const tab = useUi(s => s.panel.tab);
  const setTab = useUi(s => s.setTab);
  const closePanel = useUi(s => s.closePanel);
  const persons = useArchive(s => s.data!.persons);
  const relations = useArchive(s => s.data!.relations);
  const groups = useMemo(() => relationGroups(p, persons, relations), [p, persons, relations]);
  const relCount = groups.reduce((s, g) => s + g.items.length, 0);
  const stories = useArchive(s => s.data!.stories);
  const media = useArchive(s => s.data!.media);
  // в счётчике «Медиа» — и фото других людей, где этот человек отмечен
  const mediaCount = useMemo(() => personMedia(p, media, persons).length, [p, media, persons]);
  const storyCount = useMemo(() => stories.filter(s => s.personIds.includes(p.id)).length, [stories, p.id]);
  const chips = [p.gender, ageText(p), p.occupation].filter(Boolean);

  // вкладки: иконка + подпись; на узкой панели остаются только иконки (стили — side-panel.css)
  const tabs: [PanelTab, string, string, number | null][] = [
    ['info', 'Основное', 'user', null],
    ['media', 'Медиа', 'image', mediaCount || null],
    ['documents', 'Документы', 'file', p.documents.length || null],
    ['relations', 'Связи', 'users', relCount || null],
    ['bio', 'Биография', 'book', p.bio.length || null],
    ['stories', 'Истории', 'story', storyCount || null],
  ];

  return (
    <>
      <div className="sp-head">
        <div className="sp-person">
          <div className={'sp-avatar ' + genderClass(p.gender)}>
            <Avatar person={p} />
          </div>
          <div className="sp-info">
            {/* ФИО и кнопки — в один ряд; длинное ФИО обрезается «…», целиком — в подсказке */}
            <div className="sp-title-row">
              <div className="sp-name" title={fullName(p)}>
                {fullName(p)}
              </div>
              <PersonActions person={p} onClose={closePanel} />
            </div>
            {yearLine(p) && <div className="sp-years">{yearLine(p)}</div>}
            {chips.length > 0 && (
              <div className="chips">
                {chips.map(c => (
                  <span className="chip" key={c}>
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <nav className="tabs" role="tablist">
        {tabs.map(([key, label, icon, count]) => (
          <button key={key} className={'tab' + (tab === key ? ' active' : '')} role="tab" aria-selected={tab === key} title={label} onClick={() => setTab(key)}>
            <Icon name={icon} size={16} />
            <span className="tab-label">{label}</span>
            {count ? <span className="count">{count}</span> : null}
          </button>
        ))}
      </nav>
      {tab === 'info' && <InfoTab person={p} />}
      {tab === 'media' && <MediaTab person={p} />}
      {tab === 'documents' && <DocumentsTab person={p} />}
      {tab === 'relations' && <RelationsTab person={p} groups={groups} />}
      {tab === 'bio' && <BioTab person={p} />}
      {tab === 'stories' && <StoriesTab person={p} />}
    </>
  );
}
