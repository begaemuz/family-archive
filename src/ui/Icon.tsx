/* Иконки (24×24, stroke). Сгенерировано из спрайта прежней версии + новые для архива. */
import type { ReactElement, SVGProps } from 'react';

type IconDef = { props: SVGProps<SVGSVGElement>; body: ReactElement };
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const ICONS: Record<string, IconDef> = {
  'plus': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><path d="M12 5v14M5 12h14" /></> },
  'minus': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' }, body: <><path d="M5 12h14" /></> },
  'layout': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><rect x="9" y="3" width="6" height="5" rx="1.5" /><rect x="3" y="16" width="6" height="5" rx="1.5" /><rect x="15" y="16" width="6" height="5" rx="1.5" /><path d="M12 8v4M6 16v-2h12v2" /></> },
  'sun': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' }, body: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> },
  'moon': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></> },
  'folder': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinejoin: 'round' }, body: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></> },
  'download': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></> },
  'upload': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><path d="M12 20V9M7 14l5-5 5 5M5 4h14" /></> },
  'target': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' }, body: <><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /><circle cx="12" cy="12" r="2.5" /></> },
  'x': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' }, body: <><path d="M6 6l12 12M18 6L6 18" /></> },
  'edit': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></> },
  'trash': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></> },
  'user': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' }, body: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></> },
  'image': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></> },
  'users': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' }, body: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></> },
  'book': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M8 7h7" /></> },
  'chevron-down': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><path d="M6 9l6 6 6-6" /></> },
  'chevron-up': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><path d="M18 15l-6-6-6 6" /></> },
  'chevron-left': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><path d="M15 18l-6-6 6-6" /></> },
  'chevron-right': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><path d="M9 6l6 6-6 6" /></> },
  'heart': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinejoin: 'round' }, body: <><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></> },
  'link': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' }, body: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></> },
  'pin': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></> },
  'search': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' }, body: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></> },
  'eye': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></> },
  'dots': { props: { fill: 'currentColor' }, body: <><circle cx="6" cy="6" r="1.6" /><circle cx="12" cy="6" r="1.6" /><circle cx="18" cy="6" r="1.6" /><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /><circle cx="6" cy="18" r="1.6" /><circle cx="12" cy="18" r="1.6" /><circle cx="18" cy="18" r="1.6" /></> },
  'dots-off': { props: {  }, body: <><g fill="currentColor" opacity=".45"><circle cx="6" cy="6" r="1.6" /><circle cx="12" cy="6" r="1.6" /><circle cx="18" cy="6" r="1.6" /><circle cx="6" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /><circle cx="6" cy="18" r="1.6" /><circle cx="12" cy="18" r="1.6" /><circle cx="18" cy="18" r="1.6" /></g><path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></> },
  'tree': { props: { fill: 'none', stroke: 'currentColor', strokeWidth: '2.2', strokeLinecap: 'round', strokeLinejoin: 'round' }, body: <><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="M12 7.5V12M5 16.5V14h14v2.5M12 12v2" /></> },
  // ---- новые ----
  'video': { props: S, body: <><rect x="3" y="5" width="13" height="14" rx="2.5" /><path d="M16 10l5-3v10l-5-3" /></> },
  'audio': { props: S, body: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></> },
  'file': { props: S, body: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></> },
  'lock': { props: S, body: <><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></> },
  'unlock': { props: S, body: <><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 7.5-2" /></> },
  'save': { props: S, body: <><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M7 3v5h8V3M7 21v-7h10v7" /></> },
  'story': { props: S, body: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5M8 7h8M8 11h6" /></> },
  'play': { props: { fill: 'currentColor', stroke: 'none' }, body: <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.5-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z" /> },
  'key': { props: S, body: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M14 9l2 2" /></> },
  'logout': { props: S, body: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></> },
  'info': { props: S, body: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></> },
  'globe': { props: S, body: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></> },
  'book-pdf': { props: S, body: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 13h6M9 17h6M9 9h2" /></> },
  'menu': { props: S, body: <path d="M4 7h16M4 12h16M4 17h16" /> },
  'archive': { props: S, body: <><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" /></> },
  'calendar': { props: S, body: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></> },
  'shield': { props: S, body: <><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></> },
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size, className = 'i', ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const def = ICONS[name];
  if (!def) return null;
  const style = size ? { width: size, height: size, ...rest.style } : rest.style;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...def.props} {...rest} style={style}>
      {def.body}
    </svg>
  );
}
