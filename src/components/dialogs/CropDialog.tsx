import { useEffect, useRef, useState } from 'react';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';

/* Квадратный кадр для фото профиля: фото двигается внутри рамки, масштаб — ползунок/колесо/два пальца.
   На выходе JPEG до 800×800 (прозрачное — на белом фоне). */
export function CropDialog() {
  const req = useUi(s => s.cropReq);
  const resolve = useUi(s => s.resolveCrop);
  const stageRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [st, setSt] = useState({ V: 0, min: 1, max: 5, s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setImg(null);
    if (!req) return;
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => resolve(null);
    im.src = req.src;
  }, [req, resolve]);

  useEffect(() => {
    if (!img || !stageRef.current) return;
    const V = stageRef.current.clientWidth;
    const min = V / Math.min(img.naturalWidth, img.naturalHeight); // фото закрывает квадрат целиком
    setSt({ V, min, max: min * 5, s: min, x: (V - img.naturalWidth * min) / 2, y: (V - img.naturalHeight * min) / 2 });
  }, [img]);

  if (!req) return null;

  const clamp = (s: typeof st) => {
    if (!img) return s;
    const w = img.naturalWidth * s.s;
    const h = img.naturalHeight * s.s;
    return { ...s, x: Math.min(0, Math.max(s.V - w, s.x)), y: Math.min(0, Math.max(s.V - h, s.y)) };
  };
  const zoom = (newS: number, cx = st.V / 2, cy = st.V / 2) =>
    setSt(cur => {
      const s = Math.max(cur.min, Math.min(cur.max, newS));
      const k = s / cur.s;
      return clamp({ ...cur, s, x: cx - (cx - cur.x) * k, y: cy - (cy - cur.y) * k });
    });
  const xy = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = stageRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const rangeValue = st.max > st.min ? Math.round((1000 * Math.log(st.s / st.min)) / Math.log(st.max / st.min)) : 0;

  const finish = (ok: boolean) => {
    if (!ok || !img) return resolve(null);
    const side = st.V / st.s; // сторона квадрата в пикселях исходника
    const out = Math.round(Math.max(200, Math.min(800, side)));
    const c = document.createElement('canvas');
    c.width = c.height = out;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, out, out);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, -st.x / st.s, -st.y / st.s, side, side, 0, 0, out, out);
    c.toBlob(b => resolve(b), 'image/jpeg', 0.9);
  };

  return (
    <div className="overlay crop-overlay open" onClick={e => e.target === e.currentTarget && finish(false)}>
      <div className="modal crop-modal" role="dialog" aria-modal="true" aria-labelledby="cropTitle">
        <div className="modal-header">
          <div>
            <h2 id="cropTitle">Выберите кадр</h2>
            <p>Перетащите фото и настройте масштаб — в круге будет видно то, что внутри</p>
          </div>
          <button className="icon-button ghost" title="Отмена" onClick={() => finish(false)}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">
          <div
            ref={stageRef}
            className={'crop-stage' + (dragging ? ' dragging' : '')}
            onPointerDown={e => {
              stageRef.current!.setPointerCapture(e.pointerId);
              pointers.current.set(e.pointerId, xy(e));
              setDragging(true);
              if (pointers.current.size === 2) {
                const [a, b] = [...pointers.current.values()];
                pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: st.s };
              }
            }}
            onPointerMove={e => {
              if (!pointers.current.has(e.pointerId)) return;
              const prev = pointers.current.get(e.pointerId)!;
              const cur = xy(e);
              pointers.current.set(e.pointerId, cur);
              if (pointers.current.size === 2 && pinch.current) {
                const [a, b] = [...pointers.current.values()];
                zoom((pinch.current.s * Math.hypot(a[0] - b[0], a[1] - b[1])) / pinch.current.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
              } else if (pointers.current.size === 1) {
                setSt(s => clamp({ ...s, x: s.x + cur[0] - prev[0], y: s.y + cur[1] - prev[1] }));
              }
            }}
            onPointerUp={e => {
              pointers.current.delete(e.pointerId);
              if (pointers.current.size < 2) pinch.current = null;
              if (!pointers.current.size) setDragging(false);
            }}
            onPointerCancel={e => {
              pointers.current.delete(e.pointerId);
              pinch.current = null;
              setDragging(false);
            }}
            onWheel={e => {
              const [cx, cy] = xy(e);
              zoom(st.s * (e.deltaY < 0 ? 1.1 : 1 / 1.1), cx, cy);
            }}
          >
            {img && (
              <img
                src={req.src}
                alt=""
                draggable={false}
                style={{ width: img.naturalWidth, height: img.naturalHeight, transform: `translate(${st.x}px, ${st.y}px) scale(${st.s})` }}
              />
            )}
            <div className="crop-mask" />
          </div>
          <div className="crop-zoom">
            <button className="ghost icon-button" title="Уменьшить" onClick={() => zoom(st.s / 1.2)}>
              <Icon name="minus" />
            </button>
            <input
              type="range"
              min={0}
              max={1000}
              value={rangeValue}
              aria-label="Масштаб"
              onChange={e => zoom(st.min * Math.pow(st.max / st.min, Number(e.target.value) / 1000))}
            />
            <button className="ghost icon-button" title="Увеличить" onClick={() => zoom(st.s * 1.2)}>
              <Icon name="plus" />
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="ghost" onClick={() => finish(false)}>
            Отмена
          </button>
          <button className="primary" onClick={() => finish(true)} disabled={!img}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
