/* Общие сведения о холсте для сценариев вне компонента холста. */
import { useUi } from '../store/uiStore';

let canvasEl: HTMLElement | null = null;

export function registerCanvas(el: HTMLElement | null) {
  canvasEl = el;
}

export function canvasRect(): DOMRect | null {
  return canvasEl ? canvasEl.getBoundingClientRect() : null;
}

/** экранные координаты → координаты дерева */
export function clientToWorld(x: number, y: number) {
  const r = canvasRect();
  const v = useUi.getState().view;
  return { x: (x - (r?.left ?? 0) - v.x) / v.scale, y: (y - (r?.top ?? 0) - v.y) / v.scale };
}

/** видимая часть холста (без шапки, линейки и открытой панели) — в экранных координатах холста */
export function visibleArea() {
  const r = canvasRect();
  const W = r?.width ?? window.innerWidth;
  const H = r?.height ?? window.innerHeight;
  const tb = document.querySelector('.topbar')?.getBoundingClientRect();
  const ruler = document.querySelector('.ruler') as HTMLElement | null;
  const rl = ruler && ruler.offsetParent ? ruler.getBoundingClientRect() : null;
  const panel = document.querySelector('.side-panel.open, .stories-panel.open') as HTMLElement | null;
  const narrow = window.innerWidth <= 700;
  let right = W - 16;
  let bottom = H - 16;
  if (panel) {
    const pr = panel.getBoundingClientRect();
    if (narrow) bottom = pr.top - (r?.top ?? 0) - 8;
    else right = pr.left - (r?.left ?? 0) - 16;
  }
  return {
    left: (rl ? rl.right - (r?.left ?? 0) : 0) + 16,
    top: (tb ? tb.bottom - (r?.top ?? 0) : 0) + 16,
    right,
    bottom,
  };
}

/** центр видимой области в координатах дерева */
export function worldCenter() {
  const a = visibleArea();
  const r = canvasRect();
  return clientToWorld((r?.left ?? 0) + (a.left + a.right) / 2, (r?.top ?? 0) + (a.top + a.bottom) / 2);
}
