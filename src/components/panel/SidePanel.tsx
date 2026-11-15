import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';
import { PersonForm } from './PersonForm';
import { PersonView } from './PersonView';

/** Боковая панель: карточка человека или форма добавления/редактирования. */
export function SidePanel() {
  const panel = useUi(s => s.panel);
  const person = useArchive(s => (panel.personId ? s.data?.persons.find(p => p.id === panel.personId) : undefined));
  const hidden = useArchive(s => (panel.personId ? s.layout.hidden.has(panel.personId) : false));
  const formOpen = !!panel.form;
  const open = panel.open && (formOpen || (!!person && !hidden));
  return (
    <aside className={'side-panel' + (open ? ' open' : '') + (formOpen ? ' form-mode' : '')} aria-label="Карточка человека">
      {open && formOpen && <PersonForm key={(panel.form!.personId ?? 'new') + (panel.form!.anchorId ?? '')} ctx={panel.form!} />}
      {open && !formOpen && person && <PersonView key={person.id} person={person} />}
    </aside>
  );
}
