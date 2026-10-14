// ============================================================================
// Pure decisions behind GameScreen effects (kept here so they're unit-testable)
// ============================================================================

import type { DeckCardId } from '../engine/types.ts';

/** Max consecutive AI attempts on an unchanged state before giving up. */
export const MAX_AI_ATTEMPTS = 10;

/** Should the AI take its next action now? Never behind the first-run tutorial. */
export function shouldAiAct({ isAiTurn, showTutorial, attempts }: { isAiTurn: boolean; showTutorial: boolean; attempts: number }): boolean {
  return isAiTurn && !showTutorial && attempts < MAX_AI_ATTEMPTS;
}

/** A buy/sell dialog stays open only while its card is in hand and the player can still act. */
export function isWareDialogValid(wareDialog: DeckCardId | null, canTakePlayActions: boolean, hand: readonly DeckCardId[]): boolean {
  return wareDialog !== null && canTakePlayActions && hand.includes(wareDialog);
}

/**
 * Show the resolve panel? Always on the human's turn; during the AI's turn
 * only for drafts and auctions, which stay visible read-only so the human
 * can follow the pool / the bidding (the panels render a "waiting" state).
 */
/** The longest the draw dialog waits for the opponent's last moves to finish animating. */
export const DRAW_MODAL_MAX_WAIT_MS = 5000;
/** How long the board must sit still before the draw dialog opens. */
export const DRAW_MODAL_SETTLE_MS = 220;

/**
 * Open the draw dialog at the start of your turn — but only once the
 * opponent's spotlights and flights have played out (or the wait runs out),
 * so their last move never animates over it.
 */
export function shouldOpenDrawModal({ myDrawPhase, open, animating, waitExpired }: {
  myDrawPhase: boolean;
  open: boolean;
  animating: boolean;
  waitExpired: boolean;
}): boolean {
  return myDrawPhase && !open && (!animating || waitExpired);
}

export function shouldShowResolvePanel(hasPendingInteraction: boolean, isAiTurn: boolean, pendingType: string | null | undefined, spotlightActive = false): boolean {
  if (!hasPendingInteraction) return false;
  // Let the opponent's card announcement land before asking for a response
  if (spotlightActive) return false;
  return !isAiTurn || pendingType === 'DRAFT' || pendingType === 'AUCTION';
}

// ---------------------------------------------------------------------------
// AI pacing (2026-10-11 review: a flat 3s per action made AI turns 15–20s,
// most of it a still board while the AI drew and kept)
// ---------------------------------------------------------------------------

export type AiSpeed = 'relaxed' | 'normal' | 'brisk';
export const AI_SPEEDS: readonly AiSpeed[] = ['relaxed', 'normal', 'brisk'];
export const AI_SPEED_LABELS: Record<AiSpeed, string> = { relaxed: 'Relaxed', normal: 'Normal', brisk: 'Brisk' };

/** Multiplies AI pauses and the opponent-play spotlight. */
export const AI_SPEED_FACTOR: Record<AiSpeed, number> = { relaxed: 1.5, normal: 1, brisk: 0.6 };

export function parseAiSpeed(value: string | null | undefined): AiSpeed {
  return value === 'relaxed' || value === 'brisk' ? value : 'normal';
}

/**
 * Pause before the AI performs `action`, at Normal speed. Hidden moves (draw,
 * keep) are quick — nothing new is shown; face-up plays get a beat so the
 * player sees them coming. The spotlight that follows a play is waited out
 * separately (the AI holds while one is on screen).
 */
export const AI_BASE_DELAY_MS = {
  // +300ms each (2026-10-12): a little more room to breathe between moves
  hidden: 1050,
  choice: 1300,
  // the spotlight that follows a play carries the beat
  play: 1200,
  endTurn: 1100,
} as const;

export function aiActionDelayMs(actionType: string, speed: AiSpeed = 'normal'): number {
  let base: number;
  switch (actionType) {
    case 'DRAW_CARD':
    case 'KEEP_CARD':
    case 'DISCARD_DRAWN':
    case 'SKIP_DRAW':
      base = AI_BASE_DELAY_MS.hidden;
      break;
    case 'PLAY_CARD':
    case 'ACTIVATE_UTILITY':
      base = AI_BASE_DELAY_MS.play;
      break;
    case 'END_TURN':
      base = AI_BASE_DELAY_MS.endTurn;
      break;
    default:
      // RESOLVE_INTERACTION, reactions, cancels: a visible decision
      base = AI_BASE_DELAY_MS.choice;
  }
  return Math.round(base * AI_SPEED_FACTOR[speed]);
}

/** A trader's voiced line, and when they said it. */
export interface TraderLine {
  text: string;
  at: number;
}

/**
 * The line to caption on the spotlit card: only one said about this card —
 * since it arrived, or just before (the line can land a beat ahead of it) —
 * never something left over from an earlier moment.
 */
export function quoteForSpotlight(line: TraderLine | null, spotlightSince: number | null, graceMs = 800): string | null {
  if (!line || spotlightSince === null) return null;
  return line.at >= spotlightSince - graceMs ? line.text : null;
}
