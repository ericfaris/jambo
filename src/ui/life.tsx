/**
 * "Living table" helpers — the small React side of the idle/ambient motion
 * layer in index.css (see DESIGN.md › Life). All of it is decorative and
 * degrades to static output under reduced motion or `data-ambient="off"`.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

export const AMBIENT_STORAGE_KEY = 'jambo.ambientMotion';

export function getInitialAmbient(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(AMBIENT_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** Reflect the "Ambient motion" setting on <html> and persist it. */
export function applyAmbient(on: boolean): void {
  if (typeof document === 'undefined') return;
  if (on) document.documentElement.removeAttribute('data-ambient');
  else document.documentElement.setAttribute('data-ambient', 'off');
  try {
    window.localStorage.setItem(AMBIENT_STORAGE_KEY, String(on));
  } catch {
    // private mode — the setting just won't persist
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Ease-out roll from the previous value to `value` over `durationMs`. */
export function countUpFrame(from: number, to: number, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const eased = 1 - Math.pow(1 - clamped, 3);
  return Math.round(from + (to - from) * eased);
}

/**
 * Gold totals roll to their new value instead of jumping. Returns the number
 * to display plus whether it is currently rising (for the glint class).
 */
export function useCountUp(value: number, durationMs = 650): { shown: number; rising: boolean } {
  const [shown, setShown] = useState(value);
  const [rising, setRising] = useState(false);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = value;
    if (from === value) return;
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      setShown(value);
      return;
    }
    setRising(value > from);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - start) / durationMs;
      setShown(countUpFrame(from, value, t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setRising(false);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setShown(value);
      setRising(false);
    };
  }, [value, durationMs]);

  return { shown, rising };
}

/** Indices of the action pips spent by the latest change (they pop out). */
export function justSpentPips(prev: number, now: number): number[] {
  if (now >= prev) return [];
  return Array.from({ length: prev - now }, (_, k) => now + k);
}

export function useJustSpent(actionsLeft: number): number[] {
  const prevRef = useRef(actionsLeft);
  const [spent, setSpent] = useState<number[]>([]);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = actionsLeft;
    setSpent(justSpentPips(prev, actionsLeft));
  }, [actionsLeft]);
  return spent;
}

/** Five pips under End Turn — spent ones pop out rather than blink off. */
export function ActionPips({ actionsLeft, total = 5 }: { actionsLeft: number; total?: number }) {
  const spent = useJustSpent(actionsLeft);
  return (
    <div className="action-pips" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={`${i}-${spent.includes(i) ? actionsLeft : 'x'}`}
          className={`action-pip${i < actionsLeft ? '' : ' action-pip-spent'}${spent.includes(i) ? ' pip-spent-now' : ''}`}
        />
      ))}
    </div>
  );
}

/** A gold total that rolls and glints when it rises. */
export function GoldCount({ value, className, style }: { value: number; className?: string; style?: CSSProperties }) {
  const { shown, rising } = useCountUp(value);
  return (
    <span className={`gold-count${rising ? ' gold-count-rising' : ''}${className ? ` ${className}` : ''}`} style={style}>
      {shown}g
    </span>
  );
}

/**
 * Deck thickness: one hairline layer per ~12 cards (max 8), drawn as stacked
 * box-shadows so the pile visibly shrinks over the game.
 */
export function deckThicknessShadow(deckSize: number): string {
  const layers = Math.min(8, Math.ceil(deckSize / 12));
  if (layers <= 0) return 'none';
  const parts: string[] = [];
  for (let k = 1; k <= layers; k++) {
    const edge = k % 2 === 0 ? '#c9b48e' : '#8c7354';
    parts.push(`${k * 0.5}px ${k}px 0 ${edge}`);
  }
  parts.push(`${layers * 0.5 + 1}px ${layers + 3}px 8px rgba(0,0,0,0.55)`);
  return parts.join(', ');
}

/** Loose cards peeking out under the discard's top card (deterministic angles). */
export function discardGhostPoses(pileSize: number): Array<{ rotate: number; x: number; y: number }> {
  const poses = [
    { rotate: -6, x: -3, y: 2 },
    { rotate: 5, x: 4, y: 1 },
  ];
  return poses.slice(0, Math.max(0, Math.min(2, pileSize - 1)));
}

const MOTES = [
  { left: 8, size: 3, dur: 26, delay: -3, sway: 40, peak: 0.55 },
  { left: 17, size: 2, dur: 31, delay: -17, sway: -25, peak: 0.45 },
  { left: 29, size: 4, dur: 34, delay: -9, sway: 30, peak: 0.35 },
  { left: 41, size: 2, dur: 24, delay: -21, sway: -40, peak: 0.6 },
  { left: 52, size: 3, dur: 29, delay: -5, sway: 22, peak: 0.5 },
  { left: 63, size: 2, dur: 37, delay: -28, sway: -30, peak: 0.4 },
  { left: 74, size: 3, dur: 27, delay: -13, sway: 35, peak: 0.55 },
  { left: 86, size: 2, dur: 33, delay: -1, sway: -20, peak: 0.45 },
  { left: 93, size: 4, dur: 39, delay: -24, sway: 26, peak: 0.3 },
];

/** Warm lamp pool + dust drifting up through it. Fixed, behind the board. */
export function AmbientLayer() {
  return (
    <div className="ambient-layer" aria-hidden="true">
      <div className="ambient-lamp" />
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="ambient-mote"
          style={{
            left: `${m.left}%`,
            '--size': `${m.size}px`,
            '--dur': `${m.dur}s`,
            '--delay': `${m.delay}s`,
            '--sway': `${m.sway}px`,
            '--peak': m.peak,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** The opponent's hand as a little fan of card backs that sways. */
export function OpponentHandFan({ count, thinking = false, max = 9 }: { count: number; thinking?: boolean; max?: number }) {
  const shown = Math.min(count, max);
  const mid = (shown - 1) / 2;
  return (
    <div className={`opp-hand-fan${thinking ? ' opp-hand-fan-thinking' : ''}`} aria-hidden="true">
      {Array.from({ length: shown }, (_, i) => (
        <span
          key={i}
          className="opp-hand-card"
          style={{ '--i': i, '--sway-base': `${((i - mid) * 5).toFixed(1)}deg` } as CSSProperties}
        />
      ))}
    </div>
  );
}
