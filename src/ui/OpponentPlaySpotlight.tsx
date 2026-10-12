import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { GameLogEntry } from '../engine/types.ts';
import { CardFace } from './CardFace.tsx';
import { collectSpotlights } from './actionLog.ts';
import type { PlaySpotlight } from './actionLog.ts';

/** Phase lengths at normal speed; "fast" animation speed scales them down. */
export const SPOTLIGHT_TIMINGS = {
  enterMs: 260,
  holdMs: 1100,
  /** A ware buy/sell — common, so a shorter beat than a new card. */
  holdTradeMs: 850,
  /** Hold when more plays are already queued behind this one, or for a
   *  routine re-use of a utility. */
  holdQueuedMs: 700,
  exitMs: 480,
  /** A used utility turning sideways, at the start of its hold. */
  turnMs: 420,
} as const;

/** How long a spotlight holds before it flies off (or fades, for a used utility). */
export function spotlightHoldMs(spot: Pick<PlaySpotlight, 'weight'> & Partial<Pick<PlaySpotlight, 'destination'>>, queued: boolean): number {
  // a used utility needs time to turn, and a beat to be seen turned
  if (spot.destination === 'inPlace') return SPOTLIGHT_TIMINGS.turnMs + SPOTLIGHT_TIMINGS.holdQueuedMs;
  if (queued || spot.weight === 'routine') return SPOTLIGHT_TIMINGS.holdQueuedMs;
  if (spot.weight === 'trade') return SPOTLIGHT_TIMINGS.holdTradeMs;
  return SPOTLIGHT_TIMINGS.holdMs;
}

/** How long a spotlight keeps the AI (and response panels) waiting: the
 *  game moves on as the card starts flying away, not after it lands. */
export function spotlightBlockingMs(spot: Pick<PlaySpotlight, 'weight'> & Partial<Pick<PlaySpotlight, 'destination'>>, queued = false): number {
  return SPOTLIGHT_TIMINGS.enterMs + spotlightHoldMs(spot, queued);
}

/** Total time one spotlight occupies the screen — must stay under the AI's
 *  per-action delay so announcements never fall behind the game. */
export function spotlightDurationMs(queued: boolean, speedFactor = 1): number {
  const hold = queued ? SPOTLIGHT_TIMINGS.holdQueuedMs : SPOTLIGHT_TIMINGS.holdMs;
  return Math.round((SPOTLIGHT_TIMINGS.enterMs + hold + SPOTLIGHT_TIMINGS.exitMs) * speedFactor);
}

/** "Fast" animations and the AI speed setting (data-ai-speed) both scale it. */
function speedFactor(): number {
  if (typeof document === 'undefined') return 1;
  const root = document.documentElement;
  const anim = root.getAttribute('data-anim-speed') === 'fast' ? 0.7 : 1;
  const ai = root.getAttribute('data-ai-speed');
  return anim * (ai === 'relaxed' ? 1.3 : ai === 'brisk' ? 0.7 : 1);
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
  hand: ['[data-center-target="top"]'],
  inPlace: [],
};

/** A used utility turns sideways like a tapped card — scaled so it stays on screen. */
export const SPOTLIGHT_TURNED_TRANSFORM = 'rotate(90deg) scale(0.8)';

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
  /** The viewer is mid-turn (e.g. the opponent reacted with Rain Maker):
   *  show a smaller card up over the opponent's side and let every tap
   *  through, so the announcement never blocks the viewer's own moves. */
  unobtrusive?: boolean;
  /** The card on screen (or null) — the discard pile holds it back until
   *  the spotlight lands there. */
  onCurrentChange?: (spot: PlaySpotlight | null) => void;
  /** Solo: the trader's face beside the caption. */
  portrait?: ReactNode;
  /** What the trader is saying about it right now (their voiced line). */
  quote?: string | null;
}

type Phase = 'enter' | 'hold' | 'exit';

/**
 * When the opponent plays a card face-up, show it big in the middle of the
 * table with a one-line caption, then shrink it into the discard pile (or the
 * opponent's utility row for utilities). Purely presentational: it never
 * blocks input — tap the card to skip ahead.
 */
export function OpponentPlaySpotlight({ log, viewer, actorLabel, enabled = true, onActiveChange, unobtrusive = false, onCurrentChange, portrait, quote }: OpponentPlaySpotlightProps) {
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

  // Switched off (game over, hotseat): drop anything still waiting so it
  // never plays over the results screen
  useEffect(() => {
    if (!enabled) setQueue([]);
  }, [enabled]);

  const current = queue[0] ?? null;
  const queued = queue.length > 1;

  useEffect(() => {
    // Released as the card starts flying off (the exit overlaps the next move)
    onActiveChange?.(current !== null && phase !== 'exit');
    onCurrentChange?.(current);
  }, [current, phase, onActiveChange, onCurrentChange]);
  useEffect(() => () => onActiveChange?.(false), [onActiveChange]);

  // Drive enter → hold → exit → next.
  useEffect(() => {
    if (!current) return;
    const f = speedFactor();
    const ms = phase === 'enter'
      ? SPOTLIGHT_TIMINGS.enterMs
      : phase === 'hold'
        ? spotlightHoldMs(current, queued)
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

  // On exit, fly toward the destination's on-screen position (an 'inPlace'
  // card has none: it fades where it is).
  useLayoutEffect(() => {
    if (phase !== 'exit' || !current || current.destination === 'inPlace' || prefersReducedMotion()) return;
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
  const fullScale = typeof window === 'undefined' ? 1 : spotlightCardScale(window.innerWidth, window.innerHeight);
  const cardScale = unobtrusive ? Math.max(0.6, fullScale * 0.55) : fullScale;
  const exitMs = Math.round(SPOTLIGHT_TIMINGS.exitMs * f);
  // Used utility: turn sideways once it's on screen, then fade out right there
  const turns = current.destination === 'inPlace';
  const cardStyle: CSSProperties = turns
    ? {
      pointerEvents: unobtrusive ? 'none' : 'auto',
      cursor: unobtrusive ? undefined : 'pointer',
      transition: phase === 'exit'
        ? `opacity ${exitMs}ms ease-in`
        : `transform ${Math.round(SPOTLIGHT_TIMINGS.turnMs * f)}ms var(--anim-ease-emphasis, ease-out)`,
      transform: phase === 'enter' ? undefined : SPOTLIGHT_TURNED_TRANSFORM,
      opacity: phase === 'exit' ? 0 : 1,
    }
    : {
      pointerEvents: unobtrusive ? 'none' : 'auto',
      cursor: unobtrusive ? undefined : 'pointer',
      transition: phase === 'exit'
        ? `transform ${exitMs}ms cubic-bezier(0.55, 0, 0.75, 0.3), opacity ${exitMs}ms ease-in`
        : undefined,
      transform: phase === 'exit' ? (exitTransform ?? 'scale(0.6)') : undefined,
      opacity: phase === 'exit' ? (exitTransform ? 0.9 : 0) : 1,
    };

  return (
    <div className={`opp-spotlight opp-spotlight-${phase}${unobtrusive ? ' opp-spotlight-unobtrusive' : ''}`}>
      <div className="opp-spotlight-backdrop" />
      <div className="opp-spotlight-stage">
        <div role="status" aria-live="polite" className={`opp-spotlight-caption${portrait ? ' opp-spotlight-caption-portrait' : ''}`} style={{ opacity: phase === 'exit' ? 0 : 1 }}>
          {portrait && <span className="opp-spotlight-portrait" aria-hidden="true">{portrait}</span>}
          <div>
            <div className="opp-spotlight-headline">{current.headline}</div>
            {current.detail && <div className="opp-spotlight-detail">{current.detail}</div>}
            {quote && <div className="opp-spotlight-quote">“{quote}”</div>}
          </div>
        </div>
        <div
          key={current.key}
          ref={cardRef}
          className={turns ? 'opp-spotlight-card opp-spotlight-card-turns' : 'opp-spotlight-card'}
          style={cardStyle}
          onClick={unobtrusive ? undefined : skip}
          title={unobtrusive ? undefined : 'Tap to continue'}
        >
          <CardFace cardId={current.cardId} large scale={cardScale} />
        </div>
      </div>
    </div>
  );
}
