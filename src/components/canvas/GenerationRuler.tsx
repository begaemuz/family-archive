import { useMemo } from 'react';
import { rulerItems } from '../../domain/edges';
import { birthYear } from '../../domain/people';
import { useArchive } from '../../store/archiveStore';
import { useUi } from '../../store/uiStore';

/** Линейка поколений слева: годы рождения поколения или оценка «≈ год». */
export function GenerationRuler() {
  const layout = useArchive(s => s.layout);
  const view = useUi(s => s.view);
  const items = useMemo(() => rulerItems(layout, birthYear), [layout]);
  if (!items.length) return null;
  const h = typeof window !== 'undefined' ? window.innerHeight : 1000;
  return (
    <div className="ruler">
      {items.map(it => {
        const top = view.y + it.y * view.scale;
        if (top < -40 || top > h + 40) return null;
        return (
          <div className="ruler-item" key={it.level} style={{ top }}>
            <div className={'ruler-year' + (it.est ? ' est' : '')}>{it.text}</div>
            <div className="ruler-gen">{it.level + 1} поколение</div>
          </div>
        );
      })}
    </div>
  );
}
