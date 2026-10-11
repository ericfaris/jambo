// ============================================================================
// Named traders — each AI difficulty is a character with a portrait (three
// expressions), a voice and a few voiced lines. Pure data + pure reaction
// rules; the UI (TraderPortrait, useTrader) plays them.
// ============================================================================

import type { AIDifficulty } from './difficulties/index.ts';
import type { GameLogEntry, GameState } from '../engine/types.ts';
import { getWinner } from '../engine/endgame/EndgameManager.ts';

export type TraderMood = 'neutral' | 'pleased' | 'annoyed';
export type BarkEvent = 'greet' | 'big-sale' | 'rival-sale' | 'attack' | 'blocked' | 'win' | 'lose';

export interface Trader {
  id: 'kito' | 'amara' | 'baraka' | 'zawadi';
  name: string;
  /** Short role shown under the name. */
  title: string;
  /** One line for the setup screen. */
  tagline: string;
  /**
   * What each voiced line says (also its caption). Events said often have
   * more than one take; they rotate so the same line doesn't come back.
   */
  lines: Record<BarkEvent, readonly string[]>;
}

export const TRADERS: Record<AIDifficulty, Trader> = {
  easy: {
    id: 'kito',
    name: 'Kito',
    title: 'Apprentice',
    tagline: 'Simple decisions — eager, still learning',
    lines: {
      greet: ["Jambo! I'm Kito. Go easy on me, okay?"],
      'big-sale': ['Ha! Look at all that gold!', "Gold, gold, gold! I'm rich!"],
      'rival-sale': ['Whoa! How did you do that?'],
      attack: ['Sorry, sorry! I had to!', "Don't be mad! It's just the rules!"],
      blocked: ['Aww, a Guard? Not fair!'],
      win: ['I won? I actually won!'],
      lose: ["Okay, okay. You're good. Again tomorrow?"],
    },
  },
  medium: {
    id: 'amara',
    name: 'Amara',
    title: 'Cloth weaver',
    tagline: 'Basic strategy — patient and steady',
    lines: {
      greet: ['Jambo, friend. May the market be kind to us both.'],
      'big-sale': ['A good trade is woven slowly. And that was a good trade.', 'Patience pays. It always does.'],
      'rival-sale': ['Hm. A fine sale. I am watching you.'],
      attack: ['Forgive me. Business is business.', 'A small pull at the thread. Nothing more.'],
      blocked: ['Hm. You saw that coming.'],
      win: ['Well played. But the cloth is mine today.'],
      lose: ['You trade with patience. I respect that.'],
    },
  },
  hard: {
    id: 'baraka',
    name: 'Baraka',
    title: 'Spice merchant',
    tagline: 'Deep evaluation — always counting',
    lines: {
      greet: ['Jambo! Baraka, at your service. Prices are… negotiable.'],
      'big-sale': ['Ahh. The sweet smell of profit.', 'Count it twice. Baraka always counts it twice.'],
      'rival-sale': ['Eh?! That price should be illegal!'],
      attack: ['Nothing personal, my friend. Only spice.', 'Ah, ah! Do not look so surprised.'],
      blocked: ['A Guard! You are sharper than you look.'],
      win: ['Every coin finds its way to Baraka in the end.'],
      lose: ['Hmph. Enjoy it. Tomorrow the prices change.'],
    },
  },
  expert: {
    id: 'zawadi',
    name: 'Mama Zawadi',
    title: 'Market matriarch',
    tagline: 'Simulates future turns — sees you coming',
    lines: {
      greet: ['Jambo, child. Sit. Let us see what you have learned.'],
      'big-sale': ['Mm. That is how a market is run.', 'The market rewards those who wait.'],
      'rival-sale': ['Good. You were listening.'],
      attack: ['Do not take it to heart. The market takes, and the market gives.', 'Hush now. This is a lesson, not a punishment.'],
      blocked: ['Clever. Your mother taught you well.'],
      win: ['Come back when the sun is lower. You will be ready then.'],
      lose: ['Ah. The market has a new name to remember. Well done.'],
    },
  },
};

export function traderFor(difficulty: AIDifficulty): Trader {
  return TRADERS[difficulty];
}

export function portraitUrl(trader: Pick<Trader, 'id'>, mood: TraderMood = 'neutral'): string {
  return `/assets/traders/${trader.id}-${mood}.webp`;
}

/** Take 0 is `{id}-{event}.mp3`; later takes are `{id}-{event}-2.mp3`, … */
export function barkUrl(trader: Pick<Trader, 'id'>, event: BarkEvent, take = 0): string {
  return `/audio/traders/${trader.id}-${event}${take > 0 ? `-${take + 1}` : ''}.mp3`;
}

/** A one-move gold swing this big counts as a big moment. */
export const BIG_SWING_GOLD = 10;

export interface TraderReaction {
  mood: TraderMood | null;
  bark: BarkEvent | null;
  /** Game-over moods stay; everything else fades back to neutral. */
  lasting: boolean;
}

/**
 * How the trader (at seat `trader`) reacts to prev → next. Strongest moment
 * wins: game over, then a Guard against them, their animal attack, then big
 * gold swings either way.
 */
export function traderReaction(
  prev: Pick<GameState, 'phase' | 'endgame' | 'players' | 'log'>,
  next: Pick<GameState, 'phase' | 'endgame' | 'players' | 'log'>,
  trader: 0 | 1,
): TraderReaction {
  const viewer: 0 | 1 = trader === 0 ? 1 : 0;
  if (next.phase === 'GAME_OVER' && prev.phase !== 'GAME_OVER') {
    const won = getWinner(next) === trader;
    return { mood: won ? 'pleased' : 'annoyed', bark: won ? 'win' : 'lose', lasting: true };
  }
  if (next.log.length <= prev.log.length) return { mood: null, bark: null, lasting: false };
  const fresh: readonly GameLogEntry[] = next.log.slice(prev.log.length);

  if (fresh.some((e) => e.action === 'GUARD_PLAYED' && e.player === viewer)) {
    return { mood: 'annoyed', bark: 'blocked', lasting: false };
  }
  // the first announcement of the trader's animal (a declined Guard re-logs it untagged)
  if (fresh.some((e) => e.action === 'PLAY_ANIMAL' && e.player === trader && e.card)) {
    return { mood: 'pleased', bark: 'attack', lasting: false };
  }
  const traderGain = next.players[trader].gold - prev.players[trader].gold;
  const viewerGain = next.players[viewer].gold - prev.players[viewer].gold;
  if (traderGain >= BIG_SWING_GOLD) return { mood: 'pleased', bark: 'big-sale', lasting: false };
  if (viewerGain >= BIG_SWING_GOLD) return { mood: 'annoyed', bark: 'rival-sale', lasting: false };
  if (fresh.some((e) => (e.action === 'PARROT_STEAL' || e.action === 'THRONE_SWAP') && e.player === viewer)) {
    return { mood: 'annoyed', bark: null, lasting: false };
  }
  return { mood: null, bark: null, lasting: false };
}
