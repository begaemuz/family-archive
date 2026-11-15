import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CARD_W } from '../../domain/constants';
import { buildEdges, linkPreviewPath } from '../../domain/edges';
import { descGraph, descendantsOf } from '../../domain/graph';
import { freeX, guideLines } from '../../domain/layout';
import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';
import { clientToWorld, registerCanvas, visibleArea } from '../../flows/canvasGeometry';
import { createRelativeFlow, editPersonFlow, viewPersonFlow } from '../../flows/personFlows';
import { PersonCard, type CardActions } from './PersonCard';
import { GenerationRuler } from './GenerationRuler';
import { CanvasControls } from './CanvasControls';
import { ActionDock } from './ActionDock';
import { EmptyTree } from './EmptyTree';

interface DragState {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  dx: number;
  moved: boolean;
}
interface LinkState {
  from: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  target: string | null;
}
interface PanState {
  pointerId: number;
  x: number;
  y: number;
  ox: number;
  oy: number;
}

export function TreeCanvas() {
  const data = useArchive(s => s.data);
  const layout = useArchive(s => s.layout);
  const view = useUi(s => s.view);
  const setView = useUi(s => s.setView);
  const selectedId = useUi(s => s.selectedId);
  const dots = useUi(s => s.dots);
  const fitTick = useUi(s => s.fitTick);

  const canvasRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const [heights, setHeights] = useState<Map<string, number>>(new Map());
  const [link, setLink] = useState<LinkState | null>(null);
  const [panning, setPanning] = useState(false);
  const drag = useRef<DragState | null>(null);
  const pan = useRef<PanState | null>(null);
  const suppressClick = useRef<string | null>(null);
  const linkRef = useRef<LinkState | null>(null);
  linkRef.current = link;

  useEffect(() => {
    registerCanvas(canvasRef.current);
    return () => registerCanvas(null);
  }, []);

  const persons = data?.persons ?? [];
  const relations = data?.relations ?? [];
  const visible = layout.visible;

  /* ---------- вписать дерево в экран ---------- */
  const fitTree = useCallback(() => {
    const L = useArchive.getState().layout;
    const all = useArchive.getState().data?.persons ?? [];
    const c = canvasRef.current;
    if (!c) return;
    if (!all.length) {
      setView({ x: c.clientWidth / 2 - 3000, y: c.clientHeight / 2 - 2000, scale: 1 });
      return;
    }
    const P = L.visible.length ? L.visible : all;
    const minX = Math.min(...P.map(p => p.x)) - 120;
    const minY = Math.min(...P.map(p => p.y)) - 100;
    const maxX = Math.max(...P.map(p => p.x)) + 320;
    const maxY = Math.max(...P.map(p => p.y)) + 250;
    const w = maxX - minX;
    const h = maxY - minY;
    const a = visibleArea();
    const aw = a.right - a.left;
    const ah = a.bottom - a.top;
    const scale = Math.max(0.2, Math.min((aw - 40) / w, (ah - 40) / h, 1.3));
    setView({ scale, x: a.left + (aw - w * scale) / 2 - minX * scale, y: a.top + (ah - h * scale) / 2 - minY * scale });
  }, [setView]);

  useEffect(() => {
    // панель выезжает с анимацией — вписываем после неё
    const t = setTimeout(fitTree, 30);
    return () => clearTimeout(t);
  }, [fitTick, fitTree]);

  /* ---------- зум ---------- */
  const setZoom = useCallback(
    (next: number, cx?: number, cy?: number) => {
      const c = canvasRef.current;
      if (!c) return;
      const v = useUi.getState().view;
      next = Math.max(0.2, Math.min(2.5, next));
      const px = cx ?? c.clientWidth / 2;
      const py = cy ?? c.clientHeight / 2;
      const wx = (px - v.x) / v.scale;
      const wy = (py - v.y) / v.scale;
      setView({ scale: next, x: px - wx * next, y: py - wy * next });
    },
    [setView],
  );

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      setZoom(useUi.getState().view.scale * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX - r.left, e.clientY - r.top);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  /* ---------- высота карточек (для линий от нижнего края) ---------- */
  useLayoutEffect(() => {
    let changed = false;
    const next = new Map(heights);
    cardEls.current.forEach((el, id) => {
      const h = el.offsetHeight;
      if (h && next.get(id) !== h) {
        next.set(id, h);
        changed = true;
      }
    });
    if (changed) setHeights(next);
  });

  /* ---------- перемещение, связи, панорама ---------- */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (d && e.pointerId === d.pointerId) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 3) d.moved = true;
        if (!d.moved) return;
        const q = clientToWorld(e.clientX, e.clientY);
        const L = useArchive.getState().layout;
        useArchive.getState().movePerson(d.id, Math.max(0, Math.min(L.worldW - 300, q.x - d.dx)));
        return;
      }
      const l = linkRef.current;
      if (l && e.pointerId === l.pointerId) {
        const q = clientToWorld(e.clientX, e.clientY);
        const card = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.person') as HTMLElement | null;
        const tid = card?.dataset.id ?? null;
        setLink({
          ...l,
          x: q.x,
          y: q.y,
          moved: l.moved || Math.hypot(e.clientX - l.startX, e.clientY - l.startY) > 6,
          target: tid && tid !== l.from ? tid : null,
        });
        return;
      }
      const p = pan.current;
      if (p && e.pointerId === p.pointerId) {
        const v = useUi.getState().view;
        setView({ ...v, x: p.ox + (e.clientX - p.x), y: p.oy + (e.clientY - p.y) });
      }
    };
    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      if (d && e.pointerId === d.pointerId) {
        drag.current = null;
        if (d.moved) {
          suppressClick.current = d.id;
          const st = useArchive.getState();
          const p = st.data?.persons.find(x => x.id === d.id);
          if (p) st.movePerson(d.id, freeX(st.layout, p, p.x), true);
        }
      }
      const l = linkRef.current;
      if (l && e.pointerId === l.pointerId) {
        setLink(null);
        document.body.classList.remove('linking');
        const card = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.person') as HTMLElement | null;
        const tid = card?.dataset.id ?? null;
        if (l.moved && tid && tid !== l.from) useUi.getState().askRelation(l.from, tid);
        else if (l.moved && !tid) createRelativeFlow(l.from, clientToWorld(e.clientX, e.clientY));
        else createRelativeFlow(l.from);
      }
      if (pan.current && e.pointerId === pan.current.pointerId) {
        pan.current = null;
        setPanning(false);
      }
    };
    const onCancel = (e: PointerEvent) => {
      if (drag.current?.pointerId === e.pointerId) {
        if (drag.current.moved) useArchive.getState().movePerson(drag.current.id, useArchive.getState().data!.persons.find(p => p.id === drag.current!.id)!.x, true);
        drag.current = null;
      }
      if (linkRef.current?.pointerId === e.pointerId) {
        setLink(null);
        document.body.classList.remove('linking');
      }
      if (pan.current?.pointerId === e.pointerId) {
        pan.current = null;
        setPanning(false);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [setView]);

  const actions = useMemo<CardActions>(
    () => ({
      onPointerDown(e, id) {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('.direction-btn, .collapse-badge')) return;
        e.stopPropagation();
        const p = useArchive.getState().data?.persons.find(x => x.id === id);
        if (!p) return;
        const q = clientToWorld(e.clientX, e.clientY);
        suppressClick.current = null;
        useUi.getState().select(id);
        drag.current = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dx: q.x - p.x, moved: false };
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* указатель уже отпущен */
        }
      },
      onClick(e, id) {
        if ((e.target as HTMLElement).closest('.direction-btn, .collapse-badge')) return;
        if (suppressClick.current === id) {
          suppressClick.current = null;
          return;
        }
        useUi.getState().select(id); // клик только выделяет (карточка — по «глазу»)
      },
      onView: id => viewPersonFlow(id),
      onEdit: id => editPersonFlow(id),
      onLinkStart(e, id) {
        const q = clientToWorld(e.clientX, e.clientY);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* не страшно */
        }
        document.body.classList.add('linking');
        setLink({ from: id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: q.x, y: q.y, moved: false, target: null });
      },
      onToggleCollapse: id => useArchive.getState().toggleCollapse(id),
      registerEl(id, el) {
        if (el) cardEls.current.set(id, el);
        else cardEls.current.delete(id);
      },
    }),
    [],
  );

  /* ---------- производные данные ---------- */
  const desc = useMemo(() => {
    const g = descGraph(relations);
    const m = new Map<string, { all: number; visible: number }>();
    for (const p of visible) {
      const ids = descendantsOf(p.id, g);
      let vis = 0;
      ids.forEach(id => !layout.hidden.has(id) && vis++);
      m.set(p.id, { all: ids.size, visible: vis });
    }
    return m;
  }, [relations, visible, layout.hidden]);

  const edges = useMemo(() => buildEdges(layout, persons, relations, id => heights.get(id)), [layout, persons, relations, heights]);
  const guides = useMemo(() => guideLines(layout), [layout]);
  const linkFrom = link ? persons.find(p => p.id === link.from) : null;
  const linkTarget = link?.target ? persons.find(p => p.id === link.target) ?? null : null;

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('.person, button, .canvas-controls, .empty-tree')) return;
    if (useUi.getState().selectedId) useUi.getState().select(null);
    pan.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, ox: view.x, oy: view.y };
    setPanning(true);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  return (
    <div
      ref={canvasRef}
      className={'canvas' + (panning ? ' panning' : '') + (dots ? '' : ' no-dots')}
      onPointerDown={onCanvasPointerDown}
      onDragStart={e => e.preventDefault()}
    >
      <div
        className="world"
        style={{ width: layout.worldW, height: layout.worldH, transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})` }}
      >
        <svg className="edges" style={{ width: layout.worldW, height: layout.worldH }} viewBox={`0 0 ${layout.worldW} ${layout.worldH}`}>
          {guides.map(y => (
            <line key={y} className="gen-line" x1={0} x2={layout.worldW} y1={y} y2={y} />
          ))}
        </svg>
        <svg className="edges" style={{ width: layout.worldW, height: layout.worldH }} viewBox={`0 0 ${layout.worldW} ${layout.worldH}`}>
          {edges.map(e => (
            <path key={e.key} d={e.d} className={e.cls} />
          ))}
          {link && linkFrom && (
            <path d={linkPreviewPath(linkFrom, linkTarget, link.x, link.y)} className={'edge-preview' + (linkTarget ? ' on-target' : '')} />
          )}
        </svg>
        <div>
          {visible.map(p => (
            <PersonCard
              key={p.id}
              person={p}
              selected={selectedId === p.id}
              linkTarget={link?.target === p.id}
              descCount={desc.get(p.id)?.all ?? 0}
              visibleDesc={desc.get(p.id)?.visible ?? 0}
              actions={actions}
            />
          ))}
        </div>
      </div>
      <GenerationRuler />
      {data && !persons.length && <EmptyTree />}
      <ActionDock />
      <CanvasControls onZoom={k => setZoom(useUi.getState().view.scale * k)} onFit={fitTree} />
    </div>
  );
}

export { CARD_W };
