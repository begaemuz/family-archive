import { useId } from 'react';

/* Логотип Rodiva: схема родства — предок и два потомка — белыми линиями на плитке
   с фирменным градиентом. Вне плитки фон прозрачный. Те же формы — в public/logo.svg. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Rodiva">
      <defs>
        <linearGradient id={`rg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b6cff" />
          <stop offset="1" stopColor="#9a6bff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#rg${id})`} />
      <g fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="32" cy="19.5" r="5.6" />
        <path d="M32 25.1 V31" />
        <path d="M20.5 39.5 V35 a4 4 0 0 1 4 -4 H39.5 a4 4 0 0 1 4 4 V39.5" />
        <circle cx="20.5" cy="45" r="5.6" />
        <circle cx="43.5" cy="45" r="5.6" />
      </g>
    </svg>
  );
}
