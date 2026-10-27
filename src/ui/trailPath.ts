import type { FeedbackTrail } from './useVisualFeedback.ts';
import type { GameLogEntry } from '../engine/types.ts';

// Every card trail starts and ends on something real: the deck, the discard
// pile, or the actor's own hand (the opponent's card-back fan, your hand).
// The player should physically see where the opponent's cards come from and go.

const DECK = '[data-deck-anchor]';
const DISCARD = '[data-spotlight-target="discard"]';
const hand = (player: 0 | 1) => `[data-hand-anchor="${player}"]`;
const utilities = (player: 0 | 1) => `[data-utility-anchor="${player}"]`;

/** DOM selectors for where a trail starts and lands. */
export function trailEndpoints(trail: Pick<FeedbackTrail, 'kind' | 'actor' | 'source'>): { from: string; to: string } {
  if (trail.kind === 'draw') return { from: DECK, to: hand(trail.actor) };
  return { from: trail.source === 'utilities' ? utilities(trail.actor) : hand(trail.actor), to: DISCARD };
}

/**
 * A card the opponent played is already shown big and flown to the discard
 * by the spotlight; a second trail from their hand would double it up.
 */
export function spotlightCoversDiscard(latest: Pick<GameLogEntry, 'card' | 'player'> | null | undefined, spotlitPlayer: 0 | 1 | 'both' | null): boolean {
  return !!latest?.card && spotlitPlayer !== null && (spotlitPlayer === 'both' || latest.player === spotlitPlayer);
}

export interface TrailPath { startX: number; startY: number; endX: number; endY: number }

/** Offsets of both ends from the center of `origin` (the trail's positioning box). */
export function measureTrailPath(trail: Pick<FeedbackTrail, 'kind' | 'actor' | 'source'>, origin: DOMRect, doc: Pick<Document, 'querySelector'> = document): TrailPath | null {
  const { from, to } = trailEndpoints(trail);
  const fromEl = doc.querySelector<HTMLElement>(from);
  const toEl = doc.querySelector<HTMLElement>(to);
  if (!fromEl || !toEl) return null;
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  if (a.width === 0 || b.width === 0) return null;
  const cx = origin.left + origin.width / 2;
  const cy = origin.top + origin.height / 2;
  return {
    startX: Math.round(a.left + a.width / 2 - cx),
    startY: Math.round(a.top + a.height / 2 - cy),
    endX: Math.round(b.left + b.width / 2 - cx),
    endY: Math.round(b.top + b.height / 2 - cy),
  };
}
