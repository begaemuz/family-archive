import { useEffect, useRef, useState } from 'react';
import { addTiles, L, mapLinks, searchPlaces, type PlaceResult } from '../../ui/maps';
import { Icon } from '../../ui/Icon';

/** Мини-карта места захоронения в карточке (только просмотр). */
export function BurialMiniMap({ lat, lng }: { lat: number; lng: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    }).setView([lat, lng], 16);
    addTiles(m);
    L.marker([lat, lng]).addTo(m);
    return () => {
      m.remove();
    };
  }, [lat, lng]);
  return (
    <>
      <div className="burial-map" ref={ref} />
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

/** Выбор точки на карте: клик, перетаскивание маркера, поиск. */
export function BurialMapPicker({
  point,
  onChange,
  onFoundCemetery,
}: {
  point: { lat: number; lng: number } | null;
  onChange(p: { lat: number; lng: number } | null): void;
  onFoundCemetery(name: string): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlaceResult[] | 'loading' | 'empty' | 'error' | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, { zoomControl: true });
    if (point) m.setView([point.lat, point.lng], 16);
    else m.setView([48, 60], 3);
    addTiles(m);
    m.on('click', e => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapRef.current = m;
    return () => {
      m.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // маркер следует за точкой
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (!point) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const mk = L.marker([point.lat, point.lng], { draggable: true }).addTo(m);
      mk.on('dragend', () => {
        const ll = mk.getLatLng();
        onChangeRef.current({ lat: ll.lat, lng: ll.lng });
      });
      markerRef.current = mk;
    } else markerRef.current.setLatLng([point.lat, point.lng]);
  }, [point]);

  const doSearch = async () => {
    if (!q.trim()) return;
    setResults('loading');
    try {
      const r = await searchPlaces(q.trim());
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
        {results === 'error' && <div className="map-hint">Поиск недоступен — проверьте интернет</div>}
        {Array.isArray(results) &&
          results.map((r, i) => (
            <button
              type="button"
              key={i}
              className="map-result"
              onClick={() => {
                setResults(null);
                onChange({ lat: r.lat, lng: r.lng });
                mapRef.current?.setView([r.lat, r.lng], Math.max(mapRef.current.getZoom(), 16));
                if (/кладбищ|cemetery/i.test(r.name)) onFoundCemetery(r.name.split(',')[0]);
              }}
            >
              <Icon name="pin" />
              <span>{r.name}</span>
            </button>
          ))}
      </div>
      <div className="map-box" ref={ref} />
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
