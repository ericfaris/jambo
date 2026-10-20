import { useEffect, useState } from 'react';
import type { GameState } from '../engine/types.ts';
import { finalTurnCopy } from './endgameHints.ts';

export const FINAL_TURN_BANNER_MS = 3200;

/**
 * Full-width "Final turn" announcement the moment the endgame's last turn
 * begins, with how much the final-turn player needs. Click-through; the
 * phase box keeps a live one-line version afterwards.
 */
export function FinalTurnBanner({ state, labels }: { state: GameState; labels: readonly [string, string] }) {
  const isFinal = !!state.endgame?.isFinalTurn && state.phase !== 'GAME_OVER';
  // Only announce a transition seen live, not a resumed save already in it
  const [wasFinal, setWasFinal] = useState(isFinal);
  const [shown, setShown] = useState<{ headline: string; detail: string } | null>(null);

  // state is read only at the transition moment
  if (isFinal !== wasFinal) {
    setWasFinal(isFinal);
    setShown(isFinal ? finalTurnCopy(state, labels) : null);
  }

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), FINAL_TURN_BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  return (
    <div className="final-turn-banner" role="status" aria-live="assertive">
      <div className="final-turn-banner-band">
        <div className="final-turn-headline">{shown.headline}</div>
        <div className="final-turn-detail">{shown.detail}</div>
      </div>
    </div>
  );
}
