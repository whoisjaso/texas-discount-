import { useCallback, useRef, useState } from 'react';

// Crack pattern radiating from an impact point, as a stone strike on the highway.
const IMPACT = { x: 238, y: 118 };
const CRACKS = [
  'M238 118 L262 96 L291 88 L330 64 L362 58',
  'M238 118 L270 124 L318 140 L352 168',
  'M238 118 L246 150 L240 186 L252 222',
  'M238 118 L210 132 L176 128 L132 150 L96 158',
  'M238 118 L222 92 L196 78 L170 54',
  'M238 118 L234 84 L242 50',
  'M262 96 L268 76',
  'M318 140 L326 118',
  'M176 128 L168 108',
  'M246 150 L270 168',
];
const RING = 'M226 110 L236 104 L250 108 L252 122 L244 130 L230 129 L224 120 Z';

/**
 * Drag-to-restore windshield: shattered on the left of the handle, pristine on
 * the right. With `before` and `after` photographs (the same frame, cracked and
 * replaced) it compares the photos; without them it draws the glass.
 */
export function GlassReveal({ before, after }: { before?: string; after?: string } = {}) {
  const [pos, setPos] = useState(52);
  const ref = useRef<HTMLDivElement>(null);

  const update = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    update(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 1 || e.pointerType === 'touch') update(e.clientX);
  };

  const windshield = 'M40 70 C120 30 360 30 440 70 L468 250 C330 268 150 268 12 250 Z';

  const photo = !!(before && after);

  return (
    <div className={`glass-reveal ${photo ? 'glass-reveal--photo' : ''}`} ref={ref} onPointerDown={onPointerDown} onPointerMove={onPointerMove}>
      {photo ? (
        <>
          <img className="glass-reveal__img" src={after} alt="" draggable={false} loading="lazy" />
          <img
            className="glass-reveal__img"
            src={before}
            alt=""
            draggable={false}
            loading="lazy"
            style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          />
        </>
      ) : (
      <svg viewBox="0 0 480 290" className="glass-reveal__svg" aria-hidden="true">
        <defs>
          <linearGradient id="ws-tint" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2b3a44" />
            <stop offset="0.55" stopColor="#121a20" />
            <stop offset="1" stopColor="#07090b" />
          </linearGradient>
          <linearGradient id="ws-sheen" x1="0" y1="0" x2="1" y2="0.3">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0.05" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id="ws-clip">
            <path d={windshield} />
          </clipPath>
          <clipPath id="ws-broken">
            <rect x="0" y="0" width={(pos / 100) * 480} height="290" />
          </clipPath>
          <clipPath id="ws-clean">
            <rect x={(pos / 100) * 480} y="0" width="480" height="290" />
          </clipPath>
        </defs>

        {/* frame */}
        <path d={windshield} fill="url(#ws-tint)" stroke="#2a2d31" strokeWidth="10" strokeLinejoin="round" />

        {/* pristine side */}
        <g clipPath="url(#ws-clean)">
          <g clipPath="url(#ws-clip)">
            <rect className="glass-reveal__sweep" x="-200" y="0" width="200" height="290" fill="url(#ws-sheen)" />
            <path d="M60 80 C160 52 320 52 420 80" stroke="#fff" strokeOpacity="0.12" strokeWidth="1.2" fill="none" />
          </g>
        </g>

        {/* shattered side */}
        <g clipPath="url(#ws-broken)">
          <g clipPath="url(#ws-clip)" stroke="#e8eef2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx={IMPACT.x} cy={IMPACT.y} r="22" fill="#e8eef2" fillOpacity="0.06" stroke="none" />
            {CRACKS.map((d, i) => (
              <path key={i} d={d} strokeOpacity={i < 6 ? 0.85 : 0.5} strokeWidth={i < 6 ? 1.1 : 0.7} />
            ))}
            <path d={RING} strokeOpacity="0.9" strokeWidth="1" />
            <path d="M40 180 C120 196 250 204 330 192" strokeOpacity="0.25" strokeWidth="0.8" />
          </g>
        </g>

        <path d={windshield} fill="none" stroke="#3a3e43" strokeWidth="2" />
      </svg>
      )}

      <div className="glass-reveal__handle" style={{ left: `${pos}%` }}>
        <span className="glass-reveal__knob" aria-hidden="true">
          ‹ ›
        </span>
      </div>
      <span className="glass-reveal__label glass-reveal__label--l">Before</span>
      <span className="glass-reveal__label glass-reveal__label--r">After Vega’s</span>
      <input
        className="sr-only"
        type="range"
        min={0}
        max={100}
        value={Math.round(pos)}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare cracked and replaced windshield"
      />
    </div>
  );
}
