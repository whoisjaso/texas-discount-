import { useEffect, useState } from 'react';
import { Logo } from './Brand';

const SEEN_KEY = 'vegas.intro.seen';

function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Intro: the emblem resolves out of black, the name draws beneath it in wide
 * capitals, a hairline runs out, and the curtain lifts. Once per session.
 */
export function Loader() {
  const [phase, setPhase] = useState<'play' | 'exit' | 'done'>(() => (alreadySeen() ? 'done' : 'play'));

  useEffect(() => {
    if (alreadySeen()) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.classList.add('is-loading');
    const t1 = window.setTimeout(() => {
      setPhase('exit');
      document.documentElement.classList.remove('is-loading');
    }, reduced ? 300 : 2200);
    const t2 = window.setTimeout(() => {
      setPhase('done');
      try {
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* ignore */
      }
    }, reduced ? 600 : 3100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      document.documentElement.classList.remove('is-loading');
    };
  }, []);

  if (phase === 'done') return null;

  return (
    <div className={`loader ${phase === 'exit' ? 'loader--exit' : ''}`} role="presentation">
      <div className="loader__stage">
        <Logo size={220} className="loader__emblem" priority />
        <div className="loader__word" aria-hidden="true">
          VEGA’S
        </div>
        <div className="loader__line" />
      </div>
    </div>
  );
}
