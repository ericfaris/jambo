import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../engine/types.ts';
import { DRAW_MODAL_MAX_WAIT_MS, DRAW_MODAL_SETTLE_MS } from './gameScreenLogic.ts';

export const TURN_SWEEP_MS = 1300;

/** A waiting sweep plays once the board has been still for a beat, or the wait runs out. */
export function sweepReady({ held, waitedMs }: { held: boolean; waitedMs: number }): boolean {
  return !held || waitedMs >= DRAW_MODAL_MAX_WAIT_MS;
}

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

/**
 * A brief click-through "Your turn" band when the turn comes back to you —
 * held, like the draw dialog, until the opponent's last move has finished
 * animating (spotlight, flights, strikes), so it never sweeps over them.
 */
export function TurnSweep({ state, viewer, enabled = true, held = false, onActiveChange }: {
  state: GameState;
  viewer: 0 | 1;
  enabled?: boolean;
  /** The opponent's last move is still on screen. */
  held?: boolean;
  /** Waiting or sweeping — the draw dialog opens after it. */
  onActiveChange?: (active: boolean) => void;
}) {
  const [key, setKey] = useState(0);
  const [shown, setShown] = useState(false);
  // a hand-over waiting for the board to go still (counted, so each wait is its own)
  const [pending, setPending] = useState(false);
  const [handOvers, setHandOvers] = useState(0);
  const pendingSinceRef = useRef<{ handOver: number; at: number } | null>(null);
  const [recheck, setRecheck] = useState(0);

  // React to the turn changing during render (the previous values live in state)
  const [prev, setPrev] = useState({ currentPlayer: state.currentPlayer, turn: state.turn, phase: state.phase, enabled, viewer });
  if (prev.currentPlayer !== state.currentPlayer || prev.turn !== state.turn || prev.phase !== state.phase || prev.enabled !== enabled || prev.viewer !== viewer) {
    setPrev({ currentPlayer: state.currentPlayer, turn: state.turn, phase: state.phase, enabled, viewer });
    if (!enabled || state.phase === 'GAME_OVER') {
      // never over the results (or once switched off)
      setShown(false);
      setPending(false);
    } else {
      // the turn moved on before it could sweep: drop it
      if (state.currentPlayer !== viewer) setPending(false);
      if (shouldSweepTurn(prev, state, viewer)) {
        setHandOvers((n) => n + 1);
        setPending(true);
      }
    }
  }

  // Sweep once the board has been still for a beat (cancelled if it moves again)
  useEffect(() => {
    if (!pending) return;
    const current = pendingSinceRef.current;
    const since = current && current.handOver === handOvers ? current : { handOver: handOvers, at: Date.now() };
    pendingSinceRef.current = since;
    const waited = Date.now() - since.at;
    if (!sweepReady({ held, waitedMs: waited })) {
      // look again when the wait runs out, even if `held` never changes
      const t = window.setTimeout(() => setRecheck((n) => n + 1), Math.max(200, DRAW_MODAL_MAX_WAIT_MS - waited));
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setPending(false);
      setKey((k) => k + 1);
      setShown(true);
    }, held ? 0 : DRAW_MODAL_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [pending, handOvers, held, recheck]);

  const active = pending || shown;
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);
  useEffect(() => () => onActiveChange?.(false), [onActiveChange]);

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
