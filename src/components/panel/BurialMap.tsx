import { useRef, useState } from 'react';
import { Icon } from '../../ui/Icon';
import { mapLinks, YandexMap, type PlaceResult, type YandexMapApi } from '../../ui/YandexMap';

/** Мини-карта места захоронения в карточке (только просмотр) — Яндекс Карты. */
export function BurialMiniMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <>
      <YandexMap mode="view" point={{ lat, lng }} className="burial-map" />
      <div className="map-links">
        {mapLinks(lat, lng).map(l => (
          <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer">
            {l.label}
          </a>
        ))}
      </div>
    </>
  );
}

/** Выбор точки на карте: клик, перетаскивание метки, поиск адреса (геокодер Яндекса). */
export function BurialMapPicker({
  point,
  onChange,
  onFoundCemetery,
}: {
  point: { lat: number; lng: number } | null;
  onChange(p: { lat: number; lng: number } | null): void;
  onFoundCemetery(name: string): void;
}) {
  const api = useRef<YandexMapApi>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlaceResult[] | 'loading' | 'empty' | 'error' | null>(null);

  const doSearch = async () => {
    if (!q.trim() || !api.current) return;
    setResults('loading');
    try {
      const r = await api.current.search(q.trim());
      setResults(r.length ? r : 'empty');
    } catch {
      setResults('error');
    }
  };

  return (
    <div className="map-picker full" style={{ gridColumn: '1/-1' }}>
      <div className="map-search">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="b_search">Найти на карте</label>
          <input
            id="b_search"
            value={q}
            placeholder="Название кладбища или адрес"
            autoComplete="off"
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                doSearch();
              }
            }}
          />
        </div>
        <button type="button" title="Найти" onClick={doSearch}>
          <Icon name="search" />
        </button>
      </div>
      <div className="map-results">
        {results === 'loading' && <div className="map-hint">Ищу…</div>}
        {results === 'empty' && <div className="map-hint">Ничего не найдено</div>}
        {results === 'error' && <div className="map-hint">Поиск сейчас недоступен — поставьте точку кликом по карте</div>}
        {Array.isArray(results) &&
          results.map((r, i) => (
            <button
              type="button"
              key={i}
              className="map-result"
              onClick={() => {
                setResults(null);
                onChange({ lat: r.lat, lng: r.lng });
                if (/кладбищ|cemetery|мазар/i.test(r.name)) onFoundCemetery(r.name.split(',').pop()!.trim());
              }}
            >
              <Icon name="pin" />
              <span>{r.name}</span>
            </button>
          ))}
      </div>
      <YandexMap ref={api} mode="pick" point={point} onPick={p => onChange(p)} className="map-box" />
      <div className="map-coords">
        <span>{point ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : 'Точка не выбрана — нажмите на карту'}</span>
        {point && (
          <button type="button" className="ghost danger" onClick={() => onChange(null)}>
            <Icon name="x" /> Убрать точку
          </button>
        )}
      </div>
    </div>
  );
}
