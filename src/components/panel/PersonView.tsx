import { useEffect, useMemo, useRef, useState } from 'react';
import { relationGroups } from '../../domain/kinship';
import { ageText, fullName, genderClass, initials, yearLine } from '../../domain/people';
import type { Person } from '../../domain/types';
import { askDeletePerson, editPersonFlow } from '../../flows/personFlows';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import { useArchive } from '../../store/archiveStore';
import { useUi, type PanelTab } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { BioTab } from './BioTab';
import { DocumentsTab } from './DocumentsTab';
import { InfoTab } from './InfoTab';
import { MediaTab } from './MediaTab';
import { RelationsTab } from './RelationsTab';

export function Avatar({ person, cls = 'avatar' }: { person: Person; cls?: string }) {
  const url = useMediaUrl(person.mainPhotoId);
  return url ? <img src={url} alt={fullName(person)} draggable={false} /> : <div className={cls}>{initials(person)}</div>;
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
  const storyCount = useMemo(() => stories.filter(s => s.personIds.includes(p.id)).length, [stories, p.id]);
  const chips = [p.gender, ageText(p), p.occupation].filter(Boolean);

  // на узком экране вкладки прокручиваются: выбранную держим в поле зрения, справа — затухание-подсказка
  const tabsRef = useRef<HTMLElement>(null);
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const checkTabs = () => {
    const el = tabsRef.current;
    if (el) setTabsOverflow(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    checkTabs();
  }, [tab, p.id]);
  useEffect(() => {
    window.addEventListener('resize', checkTabs);
    return () => window.removeEventListener('resize', checkTabs);
  }, []);

  const tabs: [PanelTab, string, number | null][] = [
    ['info', 'Основное', null],
    ['media', 'Медиа', p.media.length || null],
    ['documents', 'Документы', p.documents.length || null],
    ['relations', 'Связи', relCount || null],
    ['bio', 'Биография', p.bio.length + storyCount || null],
  ];

  return (
    <>
      <div className="sp-head">
        <div className="sp-actions">
          <button className="ghost" title="Редактировать" onClick={() => editPersonFlow(p.id)}>
            <Icon name="edit" />
          </button>
          <button className="ghost danger" title="Удалить человека" onClick={() => askDeletePerson(p.id)}>
            <Icon name="trash" />
          </button>
          <button className="ghost" title="Закрыть" onClick={closePanel}>
            <Icon name="x" />
          </button>
        </div>
        <div className="sp-person">
          <div className={'sp-avatar ' + genderClass(p.gender)}>
            <Avatar person={p} />
          </div>
          <div>
            <div className="sp-name">{fullName(p)}</div>
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
      <nav className={'tabs' + (tabsOverflow ? ' overflow' : '')} role="tablist" ref={tabsRef} onScroll={checkTabs}>
        {tabs.map(([key, label, count]) => (
          <button key={key} className={'tab' + (tab === key ? ' active' : '')} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {label}
            {count ? <span className="count">{count}</span> : null}
          </button>
        ))}
      </nav>
      {tab === 'info' && <InfoTab person={p} />}
      {tab === 'media' && <MediaTab person={p} />}
      {tab === 'documents' && <DocumentsTab person={p} />}
      {tab === 'relations' && <RelationsTab person={p} groups={groups} />}
      {tab === 'bio' && <BioTab person={p} />}
    </>
  );
}
