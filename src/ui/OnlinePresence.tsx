// ============================================================================
// Presence on the online board: the dot on the friend's portrait, the banner
// that says they dropped (with the reconnect countdown) or that you did, and
// the card that ends the game when they don't come back.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type { OnlineSeatView } from '../multiplayer/types.ts';
import { presenceDotState, PRESENCE_DOT_LABELS, presenceBannerLine, BACK_NOTICE_MS } from './presence.ts';

export function PresenceDot({ seat, size = 'small' }: { seat: OnlineSeatView; size?: 'small' | 'large' }) {
  const state = presenceDotState(seat);
  return (
    <span
      className={`presence-dot presence-dot-${state} presence-dot-${size}`}
      role="img"
      aria-label={PRESENCE_DOT_LABELS[state]}
      title={PRESENCE_DOT_LABELS[state]}
    />
  );
}

/**
 * Fixed at the top center, so it never moves the board. "Sam disconnected —
 * holding their seat 4:32", then "Sam is back" for a moment; or "Reconnecting
 * to the server…" when it's your own connection that dropped.
 */
export function PresenceBanner({ name, seat, elapsedMs, selfConnected }: {
  name: string;
  seat: OnlineSeatView | null;
  elapsedMs: number;
  selfConnected: boolean;
}) {
  const [back, setBack] = useState(false);
  const status = seat?.status ?? null;
  const [wasAway, setWasAway] = useState(status === 'reconnecting');
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (status === 'reconnecting') {
      setWasAway(true);
      setBack(false);
    } else if (status === 'connected' && wasAway) {
      setWasAway(false);
      setBack(true);
    } else if (status === 'left') {
      setWasAway(false);
      setBack(false);
    }
  }
  useEffect(() => {
    if (!back) return;
    const t = window.setTimeout(() => setBack(false), BACK_NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [back]);

  let line: string | null = null;
  let tone: 'away' | 'back' | 'self' = 'away';
  if (!selfConnected) {
    line = 'Reconnecting to the server…';
    tone = 'self';
  } else if (status === 'reconnecting') {
    line = presenceBannerLine(name, seat, elapsedMs);
  } else if (back) {
    line = `${name} is back`;
    tone = 'back';
  }
  if (!line) return null;
  return (
    <div className={`presence-banner presence-banner-${tone}`} role="status" aria-live="polite">
      <span className={`presence-banner-dot presence-banner-dot-${tone}`} aria-hidden="true" />
      <span>{line}</span>
    </div>
  );
}

/** The friend left (or never came back): the game is over, one way home. */
export function OpponentLeftOverlay({ name, reason, onMainMenu }: {
  name: string;
  reason: 'left' | 'timeout';
  onMainMenu: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { buttonRef.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="overlay-fade endgame-overlay opponent-left-overlay" role="dialog" aria-modal="true" aria-labelledby="opponent-left-title">
      <div className="dialog-pop endgame-card opponent-left-card">
        <div className="endgame-eyebrow">Game over</div>
        <h2 id="opponent-left-title" className="endgame-title opponent-left-title">
          {reason === 'left' ? `${name} left the game` : `${name} didn't come back`}
        </h2>
        <p className="opponent-left-body">
          The game has ended.{reason === 'timeout' ? ' Their seat was held, but the time ran out.' : ''}
        </p>
        <div className="endgame-actions">
          <button ref={buttonRef} className="primary" onClick={onMainMenu}>Main menu</button>
        </div>
      </div>
    </div>
  );
}
