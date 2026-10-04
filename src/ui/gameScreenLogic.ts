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
