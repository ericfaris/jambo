import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../engine/types.ts';

export const TURN_SWEEP_MS = 1300;

/**
 * Should "Your turn" sweep in? Only on a live hand-over to the viewer — not
 * on the opening turn (the coin toss already said who goes first), not on
 * the final turn (FinalTurnBanner says it louder), not at game over.
 */
export function shouldSweepTurn(prev: Pick<GameState, 'currentPlayer' | 'turn'> | null, next: Pick<GameState, 'currentPlayer' | 'turn' | 'phase' | 'endgame'>, viewer: 0 | 1): boolean {
  if (!prev) return false;
  if (next.phase === 'GAME_OVER' || next.endgame?.isFinalTurn) return false;
  return next.currentPlayer === viewer && prev.currentPlayer !== viewer && next.turn > 0;
}

/** A brief click-through "Your turn" band when the turn comes back to you. */
export function TurnSweep({ state, viewer, enabled = true }: { state: GameState; viewer: 0 | 1; enabled?: boolean }) {
  const prevRef = useRef<Pick<GameState, 'currentPlayer' | 'turn'> | null>(null);
  const [key, setKey] = useState(0);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { currentPlayer: state.currentPlayer, turn: state.turn };
    // never over the results (or once switched off)
    if (!enabled || state.phase === 'GAME_OVER') {
      setShown(false);
      return;
    }
    if (!shouldSweepTurn(prev, state, viewer)) return;
    setKey((k) => k + 1);
    setShown(true);
  }, [state.currentPlayer, state.turn, state.phase, enabled, viewer]);

  // The band's own timer: a quick turn change mustn't cancel it and leave
  // the band stuck on screen
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(false), TURN_SWEEP_MS);
    return () => window.clearTimeout(timer);
  }, [shown, key]);

  if (!shown) return null;
  return (
    <div key={key} className="turn-sweep" role="status" aria-live="polite">
      <span className="turn-sweep-band">Your turn</span>
    </div>
  );
}
