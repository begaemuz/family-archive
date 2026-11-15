import { useEffect, useRef, useState } from 'react';
import { YEAR_MIN } from '../domain/normalize';
import { Icon } from './Icon';

const now = () => new Date().getFullYear();
const decadeOf = (y: number) => Math.floor(y / 10) * 10;

/** Выбор года: клик — сетка годов по десятилетиям (‹ ›), клик по заголовку — сетка десятилетий.
    Пригодится и для будущего ползунка «как выглядел в разные годы». */
export function YearPicker({
  value,
  onChange,
  hint,
  readOnly,
  placement = 'down',
  placeholder = 'Год',
}: {
  value: number | null;
  onChange(year: number | null): void;
  /** с какого десятилетия открыть, если год не выбран (например, по году рождения человека) */
  hint?: number | null;
  readOnly?: boolean;
  placement?: 'up' | 'down';
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'years' | 'decades'>('years');
  const [decade, setDecade] = useState(decadeOf(value ?? hint ?? now()));
  const ref = useRef<HTMLDivElement>(null);
  const max = now();

  useEffect(() => {
    if (!open) return;
    setMode('years');
    setDecade(decadeOf(value ?? hint ?? max));
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (y: number | null) => {
    onChange(y);
    setOpen(false);
  };

  if (readOnly)
    return (
      <span className="yp-btn readonly" title="Год снимка">
        <Icon name="calendar" size={15} />
        {value ?? 'год не указан'}
      </span>
    );

  // 12 клеток: последний год прошлого десятилетия, десятилетие, первый год следующего — как в календарях
  const years = Array.from({ length: 12 }, (_, i) => decade - 1 + i);
  const firstDecade = decadeOf(YEAR_MIN);
  const decades = Array.from({ length: Math.floor((decadeOf(max) - firstDecade) / 10) + 1 }, (_, i) => firstDecade + i * 10);

  return (
    <div className="yp" ref={ref}>
      <button type="button" className={'yp-btn' + (value ? ' has' : '')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Icon name="calendar" size={15} />
        {value ?? placeholder}
        <Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <div className={'yp-pop ' + placement} role="dialog" aria-label="Выбор года">
          <div className="yp-head">
            {mode === 'years' && (
              <button type="button" className="yp-nav" title="Раньше" disabled={decade - 10 < firstDecade} onClick={() => setDecade(d => d - 10)}>
                <Icon name="chevron-left" size={16} />
              </button>
            )}
            <button type="button" className="yp-title" title="Выбрать десятилетие" onClick={() => setMode(m => (m === 'years' ? 'decades' : 'years'))}>
              {mode === 'years' ? `${decade} – ${decade + 9}` : 'Десятилетие'}
              <Icon name={mode === 'years' ? 'chevron-down' : 'chevron-up'} size={14} />
            </button>
            {mode === 'years' && (
              <button type="button" className="yp-nav" title="Позже" disabled={decade + 10 > max} onClick={() => setDecade(d => d + 10)}>
                <Icon name="chevron-right" size={16} />
              </button>
            )}
          </div>
          {mode === 'years' ? (
            <div className="yp-grid">
              {years.map(y => (
                <button
                  type="button"
                  key={y}
                  className={'yp-cell' + (y === value ? ' on' : '') + (y === max ? ' today' : '') + (y < decade || y > decade + 9 ? ' out' : '')}
                  disabled={y > max || y < YEAR_MIN}
                  onClick={() => pick(y)}
                >
                  {y}
                </button>
              ))}
            </div>
          ) : (
            <div className="yp-grid decades">
              {decades.map(d => (
                <button
                  type="button"
                  key={d}
                  className={'yp-cell' + (value && decadeOf(value) === d ? ' on' : '')}
                  onClick={() => {
                    setDecade(d);
                    setMode('years');
                  }}
                >
                  {d}-е
                </button>
              ))}
            </div>
          )}
          <div className="yp-foot">
            <button type="button" className="ghost" onClick={() => pick(max)}>
              Этот год
            </button>
            {value !== null && (
              <button type="button" className="ghost danger" onClick={() => pick(null)}>
                Убрать
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
