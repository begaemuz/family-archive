import { useId } from 'react';

/* Логотип «Семейный архив»: лист, чьи прожилки — родословная.
   Главная прожилка — ствол рода, ответвления ведут к людям-узлам. Лист — род и рост,
   вторая половина чуть светлее для объёма. Фон прозрачный, прожилки вырезаны насквозь —
   знак одинаково читается на светлом и тёмном фоне. Те же формы — в public/logo.svg. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Семейный архив">
      <defs>
        <linearGradient id={`lg${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#5b6cff" />
          <stop offset="1" stopColor="#8a6bff" />
        </linearGradient>
        <mask id={`lm${id}`}>
          <rect width="64" height="64" fill="#fff" />
          <g stroke="#000" strokeWidth="3.2" strokeLinecap="round" fill="none">
            <path d="M21 43 L41 23" />
            <path d="M27.5 36.5 L24.5 25.5" />
            <path d="M34 30 L44 33.5" />
          </g>
          <g fill="#000">
            <circle cx="24" cy="23.5" r="4.2" />
            <circle cx="45.5" cy="34" r="4.2" />
            <circle cx="42.5" cy="21.5" r="4.8" />
          </g>
        </mask>
      </defs>
      <path d="M15 49 L6.5 57.5" stroke={`url(#lg${id})`} strokeWidth="4.5" strokeLinecap="round" />
      <g mask={`url(#lm${id})`}>
        <path d="M12 52 C6 28 24 8 56 8 C56 40 36 58 12 52 Z" fill={`url(#lg${id})`} />
        <path d="M12 52 C22 48 40 30 56 8 C56 40 36 58 12 52 Z" fill="#fff" opacity=".16" />
      </g>
    </svg>
  );
}
