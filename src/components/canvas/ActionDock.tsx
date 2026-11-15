import { addPersonFlow } from '../../flows/personFlows';
import { useArchive } from '../../store/archiveStore';
import { useSession } from '../../store/sessionStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { SAVE_TEXT } from '../app/SaveStatus';

/** Правая панель действий — по центру справа, как линейка поколений слева. */
export function ActionDock() {
  const status = useArchive(s => s.status);
  const storiesOpen = useUi(s => s.storiesOpen);
  const storyCount = useArchive(s => s.data?.stories.length ?? 0);
  const unsaved = status === 'dirty' || status === 'error';

  return (
    <nav className="action-dock" aria-label="Действия">
      <button
        className={'dock-btn' + (unsaved ? ' attention' : '')}
        title={`Сохранить архив (Ctrl+S) — ${SAVE_TEXT[status].toLowerCase()}`}
        disabled={status === 'saving'}
        onClick={() => useSession.getState().save()}
      >
        <span className="dock-ico">
          <Icon name="save" size={20} />
          {unsaved && <span className="dock-dot" />}
        </span>
        <span className="dock-label">{status === 'saving' ? 'Сохраняю' : 'Сохранить'}</span>
      </button>

      <button className="dock-btn primary-dock" title="Добавить человека" onClick={() => addPersonFlow()}>
        <span className="dock-ico">
          <Icon name="plus" size={22} />
        </span>
        <span className="dock-label">Добавить</span>
      </button>

      <span className="dock-sep" />

      <button
        className={'dock-btn' + (storiesOpen ? ' active' : '')}
        title="Семейные истории"
        aria-pressed={storiesOpen}
        onClick={() => useUi.getState().setStoriesOpen(!storiesOpen)}
      >
        <span className="dock-ico">
          <Icon name="story" size={20} />
          {storyCount > 0 && <span className="dock-count">{storyCount}</span>}
        </span>
        <span className="dock-label">Истории</span>
      </button>

      <button
        className="dock-btn"
        title="Автовыравнивание по поколениям"
        onClick={() => {
          useArchive.getState().autoLayout();
          useUi.getState().requestFit();
          useUi.getState().showToast('Семейное дерево выровнено по поколениям');
        }}
      >
        <span className="dock-ico">
          <Icon name="layout" size={20} />
        </span>
        <span className="dock-label">Выровнять</span>
      </button>
    </nav>
  );
}
