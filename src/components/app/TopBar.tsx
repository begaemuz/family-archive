import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { addPersonFlow } from '../../flows/personFlows';
import { ArchiveMenu } from './ArchiveMenu';
import { SaveStatus } from './SaveStatus';

export function TopBar() {
  const theme = useUi(s => s.theme);
  const setTheme = useUi(s => s.setTheme);
  const hasArchive = useArchive(s => !!s.data);
  const autoLayout = useArchive(s => s.autoLayout);
  const storiesOpen = useUi(s => s.storiesOpen);
  const setStoriesOpen = useUi(s => s.setStoriesOpen);

  return (
    <header className={"topbar" + (hasArchive ? " has-archive" : "")}>
      <div className="brand">
        <div className="brand-logo">
          <Icon name="tree" />
        </div>
        <div className="brand-text">
          Семейный архив<small>история вашей семьи</small>
        </div>
      </div>

      {hasArchive && <ArchiveMenu />}

      <div className="spacer" />

      {hasArchive && <SaveStatus />}

      <button className="ghost" title="Сменить тему" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        <span className="label">{theme === 'dark' ? 'Светлая' : 'Тёмная'}</span>
      </button>

      {hasArchive && (
        <>
          <button className={'ghost' + (storiesOpen ? ' active' : '')} title="Семейные истории" onClick={() => setStoriesOpen(!storiesOpen)}>
            <Icon name="story" />
            <span className="label">Истории</span>
          </button>
          <div className="sep" />
          <button
            className="ghost"
            title="Автовыравнивание"
            onClick={() => {
              autoLayout();
              useUi.getState().requestFit();
              useUi.getState().showToast('Семейное дерево выровнено по поколениям');
            }}
          >
            <Icon name="layout" />
            <span className="label">Автовыравнивание</span>
          </button>
          <button className="primary" title="Добавить человека" onClick={() => addPersonFlow()}>
            <Icon name="plus" />
            <span className="label">Добавить</span>
          </button>
        </>
      )}
    </header>
  );
}
