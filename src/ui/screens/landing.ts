// ============================================================================
// Landing page (main menu) — pure helpers, kept apart from the component so
// they can be unit-tested without a DOM.
// ============================================================================

import type { AIDifficulty } from '../../ai/difficulties/index.ts';
import type { DeckCardId, WareType } from '../../engine/types.ts';
import type { UserStatsSummary } from '../../persistence/userStatsApi.ts';

/** The trader the player last chose, so "Play" is one click next time. */
export const LAST_TRADER_STORAGE_KEY = 'jambo.lastTrader';

export const TRADER_ORDER: readonly AIDifficulty[] = ['easy', 'medium', 'hard', 'expert'];

/** A one-line pitch: every claim is a real rule (CLAUDE.md › Game Rules). */
export const LANDING_PITCH = 'Buy low, sell high, outwit a rival trader. First to 60 gold wins.';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readLastTrader(store: KeyValueStore | null = defaultStore()): AIDifficulty {
  try {
    const saved = store?.getItem(LAST_TRADER_STORAGE_KEY);
    return (TRADER_ORDER as readonly string[]).includes(saved ?? '') ? (saved as AIDifficulty) : 'medium';
  } catch {
    return 'medium';
  }
}

export function writeLastTrader(difficulty: AIDifficulty, store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(LAST_TRADER_STORAGE_KEY, difficulty);
  } catch { /* storage blocked — just won't be remembered */ }
}

/** A new visitor's 0-0 record is negative proof — only show a record that exists. */
export function statsLine(summary: UserStatsSummary | null): string | null {
  if (!summary || summary.gamesPlayed <= 0) return null;
  const games = `${summary.gamesPlayed} game${summary.gamesPlayed === 1 ? '' : 's'}`;
  return `${summary.wins}–${summary.losses} · ${Math.round(summary.winRate * 100)}% won · ${games}`;
}

export interface PlayerRecord {
  wins: number;
  losses: number;
  /** Whole-number win percentage */
  pct: number;
  /** "33 games" */
  games: string;
}

/** The record beside the greeting, in parts; null until there is one (same rule as statsLine). */
export function playerRecord(summary: UserStatsSummary | null): PlayerRecord | null {
  if (!summary || summary.gamesPlayed <= 0) return null;
  return {
    wins: summary.wins,
    losses: summary.losses,
    pct: Math.round(summary.winRate * 100),
    games: `${summary.gamesPlayed} game${summary.gamesPlayed === 1 ? '' : 's'}`,
  };
}

/** The hero's card fan: an animal, a person, the sale demo's ware, a utility, the big ware. */
export const FAN_CARDS = ['elephant_1', 'dancer_1', 'ware_3t_1', 'well_1', 'ware_6all_1'] as const satisfies readonly DeckCardId[];
/** ware_3t (three tea) — the card the hero's sale demo plays: 3 tea sell for 10g. */
export const FAN_DEMO_INDEX = 2;
export const DEMO_SALE = { ware: 'tea', count: 3, gold: 10 } as const satisfies { ware: WareType; count: number; gold: number };

/** The phone side of a Cast game lives on its own route. */
export const JOIN_TV_HASH = '#/play';
