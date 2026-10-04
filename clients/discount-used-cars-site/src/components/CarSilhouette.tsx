import { useId } from 'react';
import type { BodyStyle } from '../data/inventory';

interface Shape {
  body: string;
  glass: string;
  wheels: [number, number];
  r: number;
  ground: number;
  /** x positions of window pillars */
  pillars: number[];
  shoulder: string;
  head: [number, number];
  tail: [number, number];
}

// Profiles drawn on a 400 × 140 canvas, nose pointing left.
const SHAPES: Record<BodyStyle, Shape> = {
  Coupe: {
    body:
      'M20 106 C18 96 24 89 40 86 C70 81 108 77 140 71 C160 57 180 43 205 41 C240 39 276 49 312 67 C336 78 360 82 374 86 C382 90 384 100 380 108 L331 108 A26 26 0 0 0 279 108 L121 108 A26 26 0 0 0 69 108 Z',
    glass: 'M152 71 C168 58 186 49 206 48 C232 47 258 55 284 68 Z',
    wheels: [95, 305],
    r: 21,
    ground: 108,
    pillars: [222],
    shoulder: 'M44 90 C120 84 240 80 372 90',
    head: [30, 92],
    tail: [376, 94],
  },
  Sedan: {
    body:
      'M18 106 C17 95 25 88 44 86 L118 80 C140 64 162 52 192 50 L262 50 C284 52 302 66 320 78 L370 82 C381 86 384 98 380 108 L333 108 A26 26 0 0 0 281 108 L123 108 A26 26 0 0 0 71 108 Z',
    glass: 'M128 80 C146 66 164 57 192 56 L260 56 C278 58 292 68 306 79 Z',
    wheels: [97, 307],
    r: 21,
    ground: 108,
    pillars: [214],
    shoulder: 'M46 92 C140 86 260 84 372 88',
    head: [28, 94],
    tail: [377, 92],
  },
  SUV: {
    body:
      'M24 102 C22 86 30 72 50 68 L118 60 C132 44 146 30 176 27 L322 28 C344 29 358 36 366 50 L376 76 C380 90 380 100 376 108 L334 108 A30 30 0 0 0 274 108 L130 108 A30 30 0 0 0 70 108 L24 108 Z',
    glass: 'M128 60 C140 46 152 34 178 33 L320 34 C338 35 350 42 356 52 L360 60 Z',
    wheels: [100, 304],
    r: 25,
    ground: 108,
    pillars: [214, 288],
    shoulder: 'M44 78 C140 72 260 70 374 72',
    head: [30, 80],
    tail: [375, 64],
  },
  Truck: {
    body:
      'M16 104 C15 88 22 78 42 76 L108 71 C120 54 132 37 158 35 L232 35 C240 35 244 41 246 51 L248 71 L384 71 C388 71 390 74 390 78 L390 108 L346 108 A29 29 0 0 0 288 108 L126 108 A29 29 0 0 0 68 108 L16 108 Z',
    glass: 'M118 71 C128 56 138 42 160 41 L230 41 C236 41 239 45 240 52 L241 71 Z',
    wheels: [97, 317],
    r: 24,
    ground: 108,
    pillars: [190],
    shoulder: 'M40 84 C120 80 200 78 246 78 M252 80 L386 80',
    head: [24, 88],
    tail: [386, 82],
  },
};

interface Props {
  body: BodyStyle;
  paint?: string;
  className?: string;
  variant?: 'solid' | 'line';
  title?: string;
}

export function CarSilhouette({ body, paint = '#1a1b1e', className = '', variant = 'solid', title }: Props) {
  const s = SHAPES[body];
  const id = useId().replace(/:/g, '');
  const line = variant === 'line';
  return (
    <svg className={className} viewBox="0 0 400 140" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={`paint-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.28" stopColor={paint} stopOpacity="1" />
          <stop offset="1" stopColor="#000" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`glass-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dfe9ee" stopOpacity="0.85" />
          <stop offset="0.5" stopColor="#6c808c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#0d1114" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id={`shadow-${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      {!line && <ellipse cx="200" cy={s.ground + 16} rx="190" ry="10" fill={`url(#shadow-${id})`} />}
      <path
        className="car__body"
        d={s.body}
        fill={line ? 'none' : paint}
        stroke={line ? 'currentColor' : 'rgba(255,255,255,0.18)'}
        strokeWidth={line ? 1.2 : 0.6}
        strokeLinejoin="round"
      />
      {!line && <path d={s.body} fill={`url(#paint-${id})`} opacity="0.6" />}
      <path
        className="car__glass"
        d={s.glass}
        fill={line ? 'none' : `url(#glass-${id})`}
        stroke={line ? 'currentColor' : 'rgba(255,255,255,0.25)'}
        strokeWidth={line ? 1 : 0.5}
        strokeLinejoin="round"
      />
      {!line && (
        <>
          <clipPath id={`gclip-${id}`}>
            <path d={s.glass} />
          </clipPath>
          <g clipPath={`url(#gclip-${id})`}>
            {s.pillars.map((x) => (
              <rect key={x} x={x - 3} y="0" width="6" height="140" fill={paint} />
            ))}
            <path d={s.glass} fill={`url(#paint-${id})`} opacity="0.12" />
          </g>
          <path d={s.shoulder} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.8" />
          <path d={s.shoulder} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="0.8" transform="translate(0 1.2)" />
          <ellipse cx={s.head[0]} cy={s.head[1]} rx="7" ry="2.2" fill="#fff6e2" opacity="0.9" />
          <ellipse cx={s.head[0]} cy={s.head[1]} rx="16" ry="5" fill="#fff6e2" opacity="0.12" />
          <rect x={s.tail[0] - 8} y={s.tail[1] - 1.8} width="9" height="3.6" rx="1.8" fill="#c21d25" opacity="0.95" />
        </>
      )}
      {s.wheels.map((cx) => (
        <g key={cx} className="car__wheel">
          <circle cx={cx} cy={s.ground} r={s.r} fill={line ? 'none' : '#0b0b0c'} stroke={line ? 'currentColor' : '#2a2b2e'} strokeWidth={line ? 1.2 : 2} />
          <circle cx={cx} cy={s.ground} r={s.r * 0.62} fill={line ? 'none' : '#5d6167'} stroke={line ? 'currentColor' : '#9aa0a6'} strokeWidth={line ? 0.8 : 0.8} />
          {!line &&
            [0, 72, 144, 216, 288].map((a) => (
              <line
                key={a}
                x1={cx}
                y1={s.ground}
                x2={cx + Math.cos((a * Math.PI) / 180) * s.r * 0.58}
                y2={s.ground + Math.sin((a * Math.PI) / 180) * s.r * 0.58}
                stroke="#2c2e31"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            ))}
          {!line && <circle cx={cx} cy={s.ground} r={s.r * 0.14} fill="#c9ccd0" />}
        </g>
      ))}
    </svg>
  );
}
