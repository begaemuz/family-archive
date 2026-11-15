/* Карты (Leaflet из пакета — без CDN). Плитки:
   • страница открыта с сайта — OpenStreetMap (подписи на местных языках);
   • страница открыта с диска (file://) — Esri: OpenStreetMap такие запросы блокирует (нет Referer).
   Если основной источник не отвечает — переключаемся на запасной. */
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const SOURCES = {
  osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap' },
  esri: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, &copy; OpenStreetMap',
  },
};

export function addTiles(map: L.Map) {
  const order: (keyof typeof SOURCES)[] = /^https?:$/.test(location.protocol) ? ['osm', 'esri'] : ['esri'];
  const use = (i: number) => {
    const s = SOURCES[order[i]];
    const layer = L.tileLayer(s.url, { maxZoom: 19, attribution: s.attribution }).addTo(map);
    let errors = 0;
    let loaded = 0;
    layer.on('tileload', () => loaded++);
    layer.on('tileerror', () => {
      if (++errors === 4 && !loaded && order[i + 1]) {
        map.removeLayer(layer);
        use(i + 1);
      }
    });
  };
  use(0);
  // панель выезжает с анимацией — пересчитать размер, когда остановится
  setTimeout(() => map.invalidateSize(), 350);
}

export function mapLinks(lat: number, lng: number) {
  return [
    { label: 'Яндекс Карты', href: `https://yandex.ru/maps/?pt=${lng},${lat}&z=17&l=map` },
    { label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` },
    { label: 'OpenStreetMap', href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}` },
  ];
}

export interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
}

/** Поиск места (Nominatim / OpenStreetMap). В сеть уходит только текст запроса. */
export async function searchPlaces(q: string): Promise<PlaceResult[]> {
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=ru&q=' + encodeURIComponent(q));
  const list = (await r.json()) as { display_name: string; lat: string; lon: string }[];
  return list.map(it => ({ name: String(it.display_name), lat: Number(it.lat), lng: Number(it.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export { L };
