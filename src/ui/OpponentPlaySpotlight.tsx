import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GameLogEntry } from '../engine/types.ts';
import { CardFace } from './CardFace.tsx';
import { collectSpotlights } from './actionLog.ts';
import type { PlaySpotlight } from './actionLog.ts';

/** Phase lengths at normal speed; "fast" animation speed scales them down. */
export const SPOTLIGHT_TIMINGS = {
  enterMs: 260,
  holdMs: 1250,
  /** Hold when more plays are already queued behind this one. */
  holdQueuedMs: 700,
  exitMs: 480,
} as const;

/** Total time one spotlight occupies the screen — must stay under the AI's
 *  per-action delay so announcements never fall behind the game. */
export function spotlightDurationMs(queued: boolean, speedFactor = 1): number {
  const hold = queued ? SPOTLIGHT_TIMINGS.holdQueuedMs : SPOTLIGHT_TIMINGS.holdMs;
  return Math.round((SPOTLIGHT_TIMINGS.enterMs + hold + SPOTLIGHT_TIMINGS.exitMs) * speedFactor);
}

function speedFactor(): number {
  if (typeof document === 'undefined') return 1;
  return document.documentElement.getAttribute('data-anim-speed') === 'fast' ? 0.7 : 1;
}

/** Scale for a `large` (180×240) card so the spotlight reads as a zoom:
 *  about half the viewport tall, never wider than ~60% of it. */
export function spotlightCardScale(viewportW: number, viewportH: number): number {
  const byHeight = (viewportH * 0.52) / 240;
  const byWidth = (viewportW * 0.6) / 180;
  return Math.max(0.8, Math.min(1.6, byHeight, byWidth));
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const TARGET_SELECTORS: Record<PlaySpotlight['destination'], string[]> = {
  discard: ['[data-spotlight-target="discard"]'],
  utilities: ['[data-spotlight-target="opponent-utilities"]', '[data-center-target="top"]'],
};

interface OpponentPlaySpotlightProps {
  log: readonly GameLogEntry[];
  /** The seat looking at the screen; plays by the other seat are announced. */
  viewer: 0 | 1;
  /** How to name the other seat ("Opponent"). */
  actorLabel: string;
  /** Off in hotseat (the incoming player gets a recap on the pass screen). */
  enabled?: boolean;
  /** Fires true while a card is on screen, so the caller can hold its own
   *  overlays (a response panel) until the announcement lands. */
  onActiveChange?: (active: boolean) => void;
}

type Phase = 'enter' | 'hold' | 'exit';

/**
 * When the opponent plays a card face-up, show it big in the middle of the
 * table with a one-line caption, then shrink it into the discard pile (or the
 * opponent's utility row for utilities). Purely presentational: it never
 * blocks input — tap the card to skip ahead.
 */
export function OpponentPlaySpotlight({ log, viewer, actorLabel, enabled = true, onActiveChange }: OpponentPlaySpotlightProps) {
  // Entries already in the log when we mount (a resumed game) are history.
  const seenRef = useRef(log.length);
  const [queue, setQueue] = useState<PlaySpotlight[]>([]);
  const [phase, setPhase] = useState<Phase>('enter');
  const [exitTransform, setExitTransform] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (log.length < seenRef.current) {
      // new game / rematch — the log restarted
      seenRef.current = log.length;
      setQueue([]);
      return;
    }
    if (log.length === seenRef.current) return;
    const fresh = enabled ? collectSpotlights(log, seenRef.current, viewer, actorLabel) : [];
    seenRef.current = log.length;
    if (fresh.length > 0) setQueue((q) => [...q, ...fresh]);
  }, [log, viewer, actorLabel, enabled]);

  const current = queue[0] ?? null;
  const queued = queue.length > 1;

  useEffect(() => {
    onActiveChange?.(current !== null);
  }, [current, onActiveChange]);
  useEffect(() => () => onActiveChange?.(false), [onActiveChange]);

  // Drive enter → hold → exit → next.
  useEffect(() => {
    if (!current) return;
    const f = speedFactor();
    const ms = phase === 'enter'
      ? SPOTLIGHT_TIMINGS.enterMs
      : phase === 'hold'
        ? (queued ? SPOTLIGHT_TIMINGS.holdQueuedMs : SPOTLIGHT_TIMINGS.holdMs)
        : SPOTLIGHT_TIMINGS.exitMs;
    const timer = window.setTimeout(() => {
      if (phase === 'enter') setPhase('hold');
      else if (phase === 'hold') setPhase('exit');
      else {
        setQueue((q) => q.slice(1));
        setPhase('enter');
        setExitTransform(null);
      }
    }, Math.round(ms * f));
    return () => window.clearTimeout(timer);
  }, [current, phase, queued]);

  // On exit, fly toward the destination's on-screen position.
  useLayoutEffect(() => {
    if (phase !== 'exit' || !current || prefersReducedMotion()) return;
    const card = cardRef.current;
    if (!card) return;
    const target = TARGET_SELECTORS[current.destination]
      .map((sel) => document.querySelector<HTMLElement>(sel))
      .find((el) => el && el.getBoundingClientRect().width > 0);
    if (!target) return;
    const from = card.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(0.12, Math.min(0.5, to.height / from.height));
    setExitTransform(`translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${scale.toFixed(3)})`);
  }, [phase, current]);

  if (!current) return null;

  const skip = () => {
    if (phase !== 'exit') setPhase('exit');
  };

  const f = speedFactor();
  const cardScale = typeof window === 'undefined' ? 1 : spotlightCardScale(window.innerWidth, window.innerHeight);
  const cardStyle: CSSProperties = {
    pointerEvents: 'auto',
    cursor: 'pointer',
    transition: phase === 'exit'
      ? `transform ${Math.round(SPOTLIGHT_TIMINGS.exitMs * f)}ms cubic-bezier(0.55, 0, 0.75, 0.3), opacity ${Math.round(SPOTLIGHT_TIMINGS.exitMs * f)}ms ease-in`
      : undefined,
    transform: phase === 'exit' ? (exitTransform ?? 'scale(0.6)') : undefined,
    opacity: phase === 'exit' ? (exitTransform ? 0.9 : 0) : 1,
  };

  return (
    <div className={`opp-spotlight opp-spotlight-${phase}`} aria-hidden={false}>
      <div className="opp-spotlight-backdrop" />
      <div className="opp-spotlight-stage">
        <div role="status" aria-live="polite" className="opp-spotlight-caption" style={{ opacity: phase === 'exit' ? 0 : 1 }}>
          <div className="opp-spotlight-headline">{current.headline}</div>
          {current.detail && <div className="opp-spotlight-detail">{current.detail}</div>}
        </div>
        <div
          key={current.key}
          ref={cardRef}
          className="opp-spotlight-card"
          style={cardStyle}
          onClick={skip}
          title="Tap to continue"
        >
          <CardFace cardId={current.cardId} large scale={cardScale} />
        </div>
      </div>
    </div>
  );
}
