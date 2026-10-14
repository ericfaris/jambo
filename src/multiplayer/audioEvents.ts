// ============================================================================
// Game action -> sound effect mapping. Shared by the Cast server (broadcast
// to phones + TV) and the local solo/hotseat GameScreen, so every mode plays
// the same sounds for the same moves.
// ============================================================================

import type { GameAction, GameState } from '../engine/types.ts';
import type { AnimalSound, AudioEvent, UtilitySound } from './types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { getWinner } from '../engine/endgame/EndgameManager.ts';
import type { ScoringView } from '../engine/endgame/EndgameManager.ts';

/** What outcome sounds read — GameState or the Cast public state. */
export type OutcomeView = ScoringView & { log: readonly { action: string; card?: string }[] };

/** People/stand cards with a sound of their own (the rest get the card tap). */
const CARD_SOUNDS: Record<string, AudioEvent> = {
  drummer: 'drummer',
  small_market_stand: 'market-stand',
};

const ANIMAL_SOUNDS: Record<string, AnimalSound> = {
  parrot: 'parrot', elephant: 'elephant', snake: 'snake', hyena: 'hyena',
  crocodile: 'crocodile', ape: 'ape', lion: 'lion', cheetah: 'cheetah',
};
const UTILITY_SOUNDS: Record<string, UtilitySound> = {
  drums: 'drums', well: 'well', kettle: 'kettle', boat: 'boat', scale: 'scale', weapons: 'weapons',
};

/**
 * The sound for one action. `before` (the state the action was applied to)
 * lets a utility activation name its utility; without it activations stay
 * quiet, as before.
 */
export function detectAudioEvent(action: GameAction, before?: GameState): AudioEvent | null {
  switch (action.type) {
    // The draw gets the swish; keeping or discarding it gets its own slight cue
    case 'DRAW_CARD':
      return 'card-draw';
    case 'KEEP_CARD':
      return 'card-keep';
    case 'DISCARD_DRAWN':
      return 'card-discard';
    case 'PLAY_CARD': {
      if (action.wareMode) return action.wareMode === 'buy' ? 'coin-out' : 'coin';
      const card = getCard(action.cardId);
      if (card.type === 'animal') return ANIMAL_SOUNDS[card.designId] ?? 'attack';
      return CARD_SOUNDS[card.designId] ?? 'card-play';
    }
    case 'ACTIVATE_UTILITY': {
      if (!before) return null;
      const utility = before.players[before.currentPlayer].utilities[action.utilityIndex];
      return (utility && UTILITY_SOUNDS[utility.designId]) ?? (utility ? 'card-play' : null);
    }
    case 'END_TURN':
      return 'turn-end';
    case 'GUARD_REACTION':
      return action.play ? 'guard' : null;
    default:
      return null;
  }
}

/**
 * Sounds for what *happened* between two states rather than for an action:
 * an auction knocked down, the end-of-turn gold bonus, the final turn
 * beginning, the game ending.
 * `viewer` is the seat at this screen (null on the TV / in hotseat, where
 * every ending gets the victory flourish).
 */
export function detectOutcomeSounds(prev: OutcomeView, next: OutcomeView, viewer: 0 | 1 | null): AudioEvent[] {
  const out: AudioEvent[] = [];
  const fresh = next.log.length > prev.log.length ? next.log.slice(prev.log.length) : [];
  if (fresh.some((e) => e.action === 'AUCTION_WON')) out.push('gavel');
  // Supplies turned up its ware (the found card is public in the log)
  if (fresh.some((e) => (e.action === 'SUPPLIES_PAY' || e.action === 'SUPPLIES_DRAW') && e.card)) out.push('card-found');
  // Ending a turn with 2+ actions to spare pays +1g: let it be heard
  if (fresh.some((e) => e.action === 'ACTION_BONUS')) out.push('coin');
  if (next.endgame?.isFinalTurn && !prev.endgame?.isFinalTurn && next.phase !== 'GAME_OVER') out.push('final-turn');
  if (next.phase === 'GAME_OVER' && prev.phase !== 'GAME_OVER') {
    const winner = getWinner(next);
    out.push(viewer === null || winner === viewer ? 'win' : 'lose');
  }
  return out;
}

/** Gold that came into either purse between two states — sizes the coin sound. */
export function goldGained(prev: Pick<ScoringView, 'players'> | null | undefined, next: Pick<ScoringView, 'players'>): number {
  if (!prev) return 0;
  return next.players.reduce((sum, p, i) => sum + Math.max(0, p.gold - prev.players[i].gold), 0);
}

/** Big moments duck the background music so they cut through. */
export const DUCKING_SOUNDS: ReadonlySet<AudioEvent> = new Set<AudioEvent>([
  'attack', 'guard', 'win', 'lose', 'final-turn',
  'elephant-stomp', 'parrot', 'elephant', 'snake', 'hyena', 'crocodile', 'ape', 'lion', 'cheetah',
]);
