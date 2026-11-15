import { useId } from 'react';

/* Логотип Rodiva: буква R, нарисованная линиями родословной. Три её конца —
   основание ствола, «ножка» и изгиб — заканчиваются кольцами-узлами, как люди на древе.
   Центры колец вырезаны насквозь, фон прозрачный — знак читается на светлом и тёмном фоне.
   Те же формы — в public/logo.svg. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const g = `url(#rg${id})`;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Rodiva">
      <defs>
        <linearGradient id={`rg${id}`} gradientUnits="userSpaceOnUse" x1="10" y1="8" x2="54" y2="60">
          <stop offset="0" stopColor="#5b6cff" />
          <stop offset="1" stopColor="#8a6bff" />
        </linearGradient>
        <mask id={`rm${id}`}>
          <rect width="64" height="64" fill="#fff" />
          <circle cx="18" cy="53" r="3" fill="#000" />
          <circle cx="45" cy="52" r="3" fill="#000" />
          <circle cx="45.5" cy="24.5" r="3" fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#rm${id})`}>
        <g fill="none" stroke={g} strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 51 V13 H32.5 a11.5 11.5 0 0 1 0 23 H18" />
          <path d="M30 36 L42.5 49.5" />
        </g>
        <g fill={g}>
          <circle cx="18" cy="53" r="7.2" />
          <circle cx="45" cy="52" r="7.2" />
          <circle cx="45.5" cy="24.5" r="7.2" />
        </g>
      </g>
    </svg>
  );
}
