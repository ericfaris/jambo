import { CONSTANTS } from '../engine/types.ts';
import { goldProgress } from './endgameHints.ts';

/**
 * A thin brass track under a gold total, filling toward the 60g endgame
 * trigger — the win condition was invisible on the board (2026-10-11 review).
 */
export function GoldTrack({ gold, width = 120, compact = false }: { gold: number; width?: number | string; compact?: boolean }) {
  const target = CONSTANTS.ENDGAME_GOLD_THRESHOLD;
  const pct = Math.round(goldProgress(gold) * 100);
  const reached = gold >= target;
  return (
    <div
      className={`gold-track${compact ? ' gold-track-compact' : ''}${reached ? ' gold-track-reached' : ''}`}
      style={{ width }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={Math.min(gold, target)}
      aria-label={`${gold} of ${target} gold to trigger the end of the game`}
      title={reached ? `${target}g reached` : `${target - gold}g to ${target}g`}
    >
      <span className="gold-track-fill" style={{ width: `${pct}%` }} />
      {!compact && <span className="gold-track-goal" aria-hidden="true">{target}g</span>}
    </div>
  );
}
