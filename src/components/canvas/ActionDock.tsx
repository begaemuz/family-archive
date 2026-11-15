import { useAccess } from '../../hooks/useAccess';
import { addPersonFlow } from '../../flows/personFlows';
import { useArchive } from '../../store/archiveStore';
import { useSession } from '../../store/sessionStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { SAVE_TEXT } from '../app/SaveStatus';

/** Правая панель действий — по центру справа, как линейка поколений слева.
    Порядок: Истории, Выровнять | Сохранить, Добавить. Несохранённые изменения — жёлтый индикатор на «Сохранить». */
export function ActionDock() {
  const status = useArchive(s => s.status);
  const acc = useAccess();
  const storiesOpen = useUi(s => s.storiesOpen);
  const storyCount = useArchive(s => s.data?.stories.length ?? 0);
  const saveState = status === 'dirty' ? ' unsaved' : status === 'error' ? ' save-error' : '';

  return (
    <nav className="action-dock" aria-label="Действия">
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

      {acc.canManageArchive && (
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
      )}

      <span className="dock-sep" />

      <button
        className={'dock-btn' + saveState}
        title={`Сохранить архив (Ctrl+S) — ${SAVE_TEXT[status].toLowerCase()}`}
        aria-label={`Сохранить архив. ${SAVE_TEXT[status]}`}
        disabled={status === 'saving'}
        onClick={() => useSession.getState().save()}
      >
        <span className="dock-ico">
          <Icon name="save" size={20} />
          {saveState && <span className="dock-dot" />}
        </span>
        <span className="dock-label">{status === 'saving' ? 'Сохраняю' : 'Сохранить'}</span>
      </button>

      {acc.canAddFree() && (
      <button className="dock-btn primary-dock" title="Добавить человека" onClick={() => addPersonFlow()}>
        <span className="dock-ico">
          <Icon name="plus" size={22} />
        </span>
        <span className="dock-label">Добавить</span>
      </button>
      )}
    </nav>
  );
}
