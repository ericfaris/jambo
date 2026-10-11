import type { GameLogEntry } from './types.ts';

/**
 * Log details name card ids. Most are public (played, placed, discarded
 * face-up), but draws, kept cards and Psychic picks stay in the actor's hand
 * unseen — those become "a card" for anyone else (the Cast TV and phones, the
 * opponent's log in solo and hotseat).
 */
const HIDDEN_CARD_PATTERN = /\b(Drew|drew|Kept|picked)\s+[a-z]+(?:_[a-z0-9]+)*_\d+\b/g;

export function redactHiddenCardDetails(details: string): string {
  return details.replace(HIDDEN_CARD_PATTERN, '$1 a card');
}

export function redactHiddenCards(entry: GameLogEntry): GameLogEntry {
  if (!entry.details) return entry;
  const details = redactHiddenCardDetails(entry.details);
  return details === entry.details ? entry : { ...entry, details };
}
