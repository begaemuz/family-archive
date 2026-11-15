import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';

export function CanvasControls({ onZoom, onFit }: { onZoom(k: number): void; onFit(): void }) {
  const scale = useUi(s => s.view.scale);
  const dots = useUi(s => s.dots);
  const setDots = useUi(s => s.setDots);
  const theme = useUi(s => s.theme);
  const setTheme = useUi(s => s.setTheme);
  return (
    <div className="canvas-controls">
      <button title="Уменьшить" onClick={() => onZoom(1 / 1.15)}>
        <Icon name="minus" />
      </button>
      <span className="zoomlabel">{Math.round(scale * 100)}%</span>
      <button title="Увеличить" onClick={() => onZoom(1.15)}>
        <Icon name="plus" />
      </button>
      <button title="Показать всё дерево" onClick={onFit}>
        <Icon name="target" />
      </button>
      <span className="ctrl-sep" />
      <button title={dots ? 'Скрыть точки фона' : 'Показать точки фона'} aria-pressed={!dots} onClick={() => setDots(!dots)}>
        <Icon name={dots ? 'dots' : 'dots-off'} />
      </button>
      <button title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
    </div>
  );
}
