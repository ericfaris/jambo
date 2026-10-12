// ============================================================================
// How to Play — pure content and helpers, kept apart from the overlay so they
// can be unit-tested without a DOM. Every rule stated here is a real rule
// (CLAUDE.md › Game Rules); the test file checks the numbers against the
// card database.
// ============================================================================

import { CONSTANTS } from '../../engine/types.ts';
import type { DeckCardId, WareType } from '../../engine/types.ts';
import type { TraderMood } from '../../ai/traders.ts';

/** Set once the player has closed the tutorial anywhere — the first game won't show it again. */
export const TUTORIAL_SEEN_STORAGE_KEY = 'jambo.tutorialSeen';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function hasSeenTutorial(store: KeyValueStore | null = defaultStore()): boolean {
  try {
    return store?.getItem(TUTORIAL_SEEN_STORAGE_KEY) === 'true';
  } catch {
    // storage blocked: don't trap the player behind a tutorial every game
    return true;
  }
}

export function markTutorialSeen(store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(TUTORIAL_SEEN_STORAGE_KEY, 'true');
  } catch { /* storage blocked — nothing to remember */ }
}

// --- Chapters ---------------------------------------------------------------

export type ChapterId = 'goal' | 'turn' | 'trade' | 'cards' | 'market' | 'attacks' | 'tips';

export interface Chapter {
  id: ChapterId;
  /** Short tab label. */
  tab: string;
  title: string;
  /** What the guide says on this chapter (her speech bubble). */
  guide: string;
}

/** Theme and goal first, then the turn, then generic → specific (BGA's tutorial guidance). */
export const CHAPTERS: readonly Chapter[] = [
  {
    id: 'goal',
    tab: 'Goal',
    title: 'First to 60 gold',
    guide: 'Jambo, child. You and your rival each open a stall with 20 gold. Reach 60 and the market is yours.',
  },
  {
    id: 'turn',
    tab: 'Your turn',
    title: 'Five actions a turn',
    guide: 'Every turn you have five actions. Draw first if you like, then play your cards.',
  },
  {
    id: 'trade',
    tab: 'Trade',
    title: 'Buy low, sell high',
    guide: 'Here, try one. Buy the tea, then sell it back. Watch your purse.',
  },
  {
    id: 'cards',
    tab: 'Cards',
    title: 'Five kinds of cards',
    guide: 'Not every card is a ware. Tap one and I will tell you what it does.',
  },
  {
    id: 'market',
    tab: 'Stall',
    title: 'Your stall',
    guide: 'Wares wait in your stall until you sell them. Tools stay in front of you and work every turn.',
  },
  {
    id: 'attacks',
    tab: 'Attacks',
    title: 'Animals and Guards',
    guide: 'Your rival will send animals after your stall. Keep a Guard close.',
  },
  {
    id: 'tips',
    tab: 'Tips',
    title: 'Before you trade',
    guide: 'That is all you need. The rest you learn at the stall.',
  },
];

export const CHAPTER_COUNT = CHAPTERS.length;

export function clampChapter(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), CHAPTER_COUNT - 1);
}

// --- Goal -------------------------------------------------------------------

export const STARTING_GOLD = CONSTANTS.STARTING_GOLD;
export const WINNING_GOLD = CONSTANTS.ENDGAME_GOLD_THRESHOLD;

// --- Turn -------------------------------------------------------------------

export const ACTIONS_PER_TURN = CONSTANTS.MAX_ACTIONS;
export const MAX_DRAWS = CONSTANTS.MAX_DRAW_PHASE_DRAWS;

// --- Trade: the hands-on step ------------------------------------------------

/** Tea Stall: three tea, buy 3g / sell 10g. */
export const TRADE_CARD: DeckCardId = 'ware_3t_1';
export const TRADE_WARE: WareType = 'tea';
export const TRADE_COUNT = 3;
export const TRADE_BUY = 3;
export const TRADE_SELL = 10;
export const MARKET_SLOTS = CONSTANTS.MARKET_SLOTS;

export interface TradeDemo {
  gold: number;
  /** Tea in the stall. */
  wares: number;
  bought: boolean;
  sold: boolean;
}

export const TRADE_START: TradeDemo = { gold: STARTING_GOLD, wares: 0, bought: false, sold: false };

export type TradeMove = 'buy' | 'sell';

/** Why a move can't happen right now, or null when it can — same rules as the engine. */
export function tradeBlocker(demo: TradeDemo, move: TradeMove): string | null {
  if (move === 'buy') {
    if (demo.gold < TRADE_BUY) return `You need ${TRADE_BUY} gold to buy.`;
    if (demo.wares + TRADE_COUNT > MARKET_SLOTS) return 'Your stall is full — sell first.';
    return null;
  }
  if (demo.wares < TRADE_COUNT) return `Selling needs ${TRADE_COUNT} tea in your stall. Buy first.`;
  return null;
}

export function applyTrade(demo: TradeDemo, move: TradeMove): TradeDemo {
  if (tradeBlocker(demo, move)) return demo;
  return move === 'buy'
    ? { ...demo, gold: demo.gold - TRADE_BUY, wares: demo.wares + TRADE_COUNT, bought: true }
    : { ...demo, gold: demo.gold + TRADE_SELL, wares: demo.wares - TRADE_COUNT, sold: true };
}

/** The guide's reaction to the trade step so far. */
export function tradeGuide(demo: TradeDemo): { line: string; mood: TraderMood } {
  if (demo.sold) {
    const profit = demo.gold - STARTING_GOLD;
    return { line: `${profit > 0 ? `+${profit}` : profit} gold from one card. Do that a few times and you win.`, mood: 'pleased' };
  }
  if (demo.bought) return { line: `Good. Three tea in your stall for ${TRADE_BUY} gold. Now sell them for ${TRADE_SELL}.`, mood: 'pleased' };
  return { line: CHAPTERS[2].guide, mood: 'neutral' };
}

// --- Cards ------------------------------------------------------------------

export interface CardKind {
  label: string;
  /** The CSS colour token CardFace uses for this type. */
  color: string;
  blurb: string;
  example: DeckCardId;
}

export const CARD_KINDS: readonly CardKind[] = [
  { label: 'Ware', color: 'var(--card-ware)', blurb: 'Buy or sell goods', example: 'ware_6all_1' },
  { label: 'People', color: 'var(--card-people)', blurb: 'One-time help', example: 'basket_maker_1' },
  { label: 'Animal', color: 'var(--card-animal)', blurb: 'Attack your rival', example: 'parrot_1' },
  { label: 'Utility', color: 'var(--card-utility)', blurb: 'Use once every turn', example: 'well_1' },
  { label: 'Stand', color: 'var(--card-stand)', blurb: '+3 stall spaces', example: 'small_market_stand_1' },
];

// --- Stall ------------------------------------------------------------------

export const STAND_SLOTS = CONSTANTS.STAND_EXPANSION_SLOTS;
export const MAX_UTILITIES = CONSTANTS.MAX_UTILITIES;
export const UTILITY_EXAMPLES: readonly DeckCardId[] = ['well_1', 'drums_1', 'boat_1'];

// --- Attacks ----------------------------------------------------------------

export const ATTACK_CARD: DeckCardId = 'crocodile_1';
export const GUARD_CARD: DeckCardId = 'guard_1';

// --- Tips -------------------------------------------------------------------

export const TIPS: readonly { title: string; body: string }[] = [
  {
    title: 'Sell for more than you paid.',
    body: 'Every ware card buys cheap and sells dear: three tea cost 3 gold and sell for 10. Fill your stall, then cash it in.',
  },
  {
    title: 'Keep a Guard in hand.',
    body: 'A Guard cancels any animal, costs no action, and works on your rival\'s turn.',
  },
  {
    title: 'Leave two actions for +1 gold.',
    body: 'Ending your turn with 2 or more actions unused earns a gold coin. Don\'t draw or play just to fill the turn.',
  },
];
