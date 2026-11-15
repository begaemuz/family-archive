/* Карта Яндекса в изолированной рамке.
   Страница public/map.html загружает JavaScript API Яндекса внутри iframe sandbox="allow-scripts"
   (без allow-same-origin): у кода Яндекса нет доступа к странице приложения и к расшифрованному архиву.
   Обмен — только сообщениями: координаты точки и текст поиска туда, выбранная точка и найденные места обратно. */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const KEY = (import.meta.env.VITE_YANDEX_MAPS_KEY as string | undefined) ?? '';
/** ключ «Геосаджеста» — поиск по названиям (кладбища, храмы, организации); без него ищутся только адреса */
const SUGGEST_KEY = (import.meta.env.VITE_YANDEX_SUGGEST_KEY as string | undefined) ?? '';
const SRC = `${import.meta.env.BASE_URL}map.html?k=${encodeURIComponent(KEY)}${SUGGEST_KEY ? `&s=${encodeURIComponent(SUGGEST_KEY)}` : ''}`;

export interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
}

export interface YandexMapApi {
  /** поиск адреса или места геокодером Яндекса */
  search(q: string): Promise<PlaceResult[]>;
}

type Point = { lat: number; lng: number } | null;

interface Props {
  mode: 'view' | 'pick';
  point: Point;
  onPick?(p: { lat: number; lng: number }): void;
  className?: string;
}

type Incoming =
  | { type: 'ready' | 'loaded' }
  | { type: 'error'; message: string }
  | { type: 'pick'; lat: number; lng: number }
  | { type: 'results'; id: number; items: { name: string; title?: string; lat: number; lng: number }[]; error?: boolean; message?: string };

export const YandexMap = forwardRef<YandexMapApi, Props>(function YandexMap({ mode, point, onPick, className }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const pointRef = useRef(point);
  const lastSent = useRef<string>('');
  const searches = useRef(new Map<number, { resolve(r: PlaceResult[]): void; reject(e: Error): void }>());
  const nextId = useRef(1);

  const post = (data: object) => frame.current?.contentWindow?.postMessage({ yandexMap: true, ...data }, '*');

  // сообщения принимаем только от своей рамки
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow || !e.data?.yandexMap) return;
      const d = e.data as Incoming;
      if (d.type === 'ready') setState('ready');
      if (d.type === 'error') {
        setState('error');
        setError(d.message);
      }
      if (d.type === 'pick' && Number.isFinite(d.lat) && Number.isFinite(d.lng)) {
        lastSent.current = `${d.lat},${d.lng}`;
        onPickRef.current?.({ lat: d.lat, lng: d.lng });
      }
      if (d.type === 'results') {
        const s = searches.current.get(d.id);
        if (!s) return;
        searches.current.delete(d.id);
        if (d.error) s.reject(new Error(d.message || 'search failed'));
        else
          s.resolve(
            (d.items || [])
              .filter(it => Number.isFinite(it.lat) && Number.isFinite(it.lng))
              .map(it => ({ name: String(it.name || it.title || ''), lat: it.lat, lng: it.lng })),
          );
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // точку поменяли снаружи (поиск, «убрать точку») — передаём в карту
  useEffect(() => {
    pointRef.current = point;
    if (state !== 'ready') return;
    const k = point ? `${point.lat},${point.lng}` : '';
    if (k === lastSent.current) return;
    lastSent.current = k;
    post({ type: 'set', lat: point?.lat ?? null, lng: point?.lng ?? null });
  }, [point, state]);

  useImperativeHandle(ref, () => ({
    search(q: string) {
      return new Promise<PlaceResult[]>((resolve, reject) => {
        const id = nextId.current++;
        searches.current.set(id, { resolve, reject });
        post({ type: 'search', id, q });
        setTimeout(() => {
          if (searches.current.delete(id)) reject(new Error('timeout'));
        }, 15000);
      });
    },
  }));

  if (!KEY) return <div className={'ymap ' + (className ?? '')}><div className="map-hint">Карта недоступна: не задан ключ Яндекс Карт</div></div>;

  return (
    <div className={'ymap ' + (className ?? '')}>
      <iframe
        ref={frame}
        src={SRC}
        title={mode === 'pick' ? 'Выбор места на карте' : 'Место на карте'}
        // allow-popups — чтобы ссылки Яндекса («Условия использования») открывались в новой вкладке
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        onLoad={() => {
          const p = pointRef.current;
          lastSent.current = p ? `${p.lat},${p.lng}` : '';
          post({ type: 'init', mode, lat: p?.lat, lng: p?.lng });
        }}
      />
      {state !== 'ready' && <div className="ymap-overlay">{state === 'error' ? error || 'Карта недоступна — нужен интернет' : 'Загружаю карту…'}</div>}
    </div>
  );
});

export function mapLinks(lat: number, lng: number) {
  return [
    { label: 'Открыть в Яндекс Картах', href: `https://yandex.ru/maps/?pt=${lng},${lat}&z=17&l=map` },
    { label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` },
  ];
}
