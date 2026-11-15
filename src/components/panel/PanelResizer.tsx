import { useRef, useState } from 'react';

const KEY = 'rodiva.panelWidth';
const MIN = 380;

const maxWidth = () => Math.min(960, window.innerWidth - 120);

function apply(w: number | null) {
  const root = document.documentElement;
  if (w === null) root.style.removeProperty('--panel-w');
  else root.style.setProperty('--panel-w', `${Math.round(Math.max(MIN, Math.min(maxWidth(), w)))}px`);
}

/** Ширина, которую пользователь задал раньше (если задавал). Вызывается при запуске приложения. */
export function restorePanelWidth() {
  try {
    const w = Number(localStorage.getItem(KEY));
    if (w > 0) apply(w);
  } catch {
    /* хранилище недоступно — ширина по умолчанию */
  }
}

/** Ручка на левом краю боковой панели: тянуть — шире/уже, двойной щелчок — ширина по умолчанию. */
export function PanelResizer() {
  const [drag, setDrag] = useState(false);
  // признак «тяну» — в ref: движение может прийти раньше, чем React перерисует ручку
  const dragging = useRef(false);
  return (
    <div
      className={'panel-resizer' + (drag ? ' dragging' : '')}
      title="Потяните, чтобы изменить ширину. Двойной щелчок — как было"
      onPointerDown={e => {
        if (e.button !== 0) return;
        e.preventDefault();
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* захват указателя недоступен — тянуть всё равно можно, пока курсор над ручкой */
        }
        dragging.current = true;
        setDrag(true);
        document.body.classList.add('resizing-panel');
      }}
      onPointerMove={e => {
        if (!dragging.current) return;
        // панель прижата к правому краю (отступ 12px): ширина = от курсора до края
        apply(window.innerWidth - e.clientX - 12);
      }}
      onPointerUp={() => {
        if (!dragging.current) return;
        dragging.current = false;
        setDrag(false);
        document.body.classList.remove('resizing-panel');
        try {
          localStorage.setItem(KEY, String(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w'), 10) || ''));
        } catch {
          /* не запомним — не страшно */
        }
      }}
      onDoubleClick={() => {
        apply(null);
        try {
          localStorage.removeItem(KEY);
        } catch {
          /* ничего */
        }
      }}
    />
  );
}
