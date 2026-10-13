// ============================================================================
// Online (friend) board — small pure rules behind OnlineGameScreen.
// ============================================================================

import type { PlayerSlot } from '../multiplayer/types.ts';

/** Seat-indexed names with "You" at your seat (a friend literally named "You" is told apart). */
export function onlineLabels(slot: 0 | 1, friendName: string): readonly [string, string] {
  const name = friendName.trim().toLowerCase() === 'you' ? `${friendName} (friend)` : friendName;
  return slot === 0 ? ['You', name] : [name, 'You'];
}

/** Under the endgame buttons: who still has to say yes, or why there's no rematch. */
export function rematchStatusLine({ votes, slot, name, friendLeft }: {
  votes: readonly PlayerSlot[];
  slot: 0 | 1;
  name: string;
  friendLeft: boolean;
}): string | null {
  if (friendLeft) return `${name} left the table`;
  const mine = votes.includes(slot);
  const theirs = votes.includes(slot === 0 ? 1 : 0);
  if (mine && !theirs) return `Waiting for ${name}…`;
  if (theirs && !mine) return `${name} wants a rematch`;
  return null;
}

/** This tab already tossed the coin for game N of this room. */
export function revealedGameKey(code: string): string {
  return `jambo:revealed:${code}`;
}

/** A server ERROR during a friend game, said for a person (null = nothing to show). */
export function friendServerError(message: string, friendName: string, friendly: (reason: string) => string): string | null {
  if (message === 'Not your turn') return `It's ${friendName}'s move.`;
  if (message === 'Room not found' || message === 'Not in an active game' || message.startsWith('Rematch is only')) return null;
  if (message === 'Invalid message') return 'That move didn’t go through — try again.';
  return friendly(message.replace(/^Invalid action [A-Z_]+:\s*/, ''));
}
