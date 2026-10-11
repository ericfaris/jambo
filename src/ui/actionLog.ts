import type { DeckCardId, GameLogEntry } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { describeLogEntry } from './uiHints.ts';

// ---------------------------------------------------------------------------
// Opponent play spotlight
// ---------------------------------------------------------------------------

/** Where the spotlit card settles once the announcement is over. */
export type SpotlightDestination = 'discard' | 'utilities';

export interface PlaySpotlight {
  /** Stable per log entry (its index), so a re-render never replays it. */
  key: number;
  cardId: DeckCardId;
  headline: string;
  detail: string | null;
  destination: SpotlightDestination;
}

function goldIn(details: string | undefined): string | null {
  return details?.match(/(\d+)g\b/)?.[1] ?? null;
}

/**
 * The announcement for one log entry, or null when it isn't a face-up card
 * play. Only entries the engine tagged with `card` qualify, so hidden draws
 * and picks can never be spotlit.
 */
export function spotlightForEntry(entry: GameLogEntry, index: number, actorLabel: string): PlaySpotlight | null {
  if (!entry.card) return null;
  let name: string;
  try {
    name = getCard(entry.card).name;
  } catch {
    return null;
  }
  const base = { key: index, cardId: entry.card, destination: 'discard' as SpotlightDestination };
  const gold = goldIn(entry.details);
  switch (entry.action) {
    case 'PLAY_WARE_BUY':
      return { ...base, headline: `${actorLabel} bought wares`, detail: gold ? `Paid ${gold}g` : null };
    case 'PLAY_WARE_SELL':
      return { ...base, headline: `${actorLabel} sold wares`, detail: gold ? `Earned ${gold}g` : null };
    case 'PLAY_UTILITY':
      return { ...base, headline: `${actorLabel} placed ${name}`, detail: 'New utility', destination: 'utilities' };
    case 'ACTIVATE_UTILITY':
      return { ...base, headline: `${actorLabel} used ${name}`, detail: null, destination: 'utilities' };
    case 'PLAY_STAND':
      return { ...base, headline: `${actorLabel} built a market stand`, detail: gold ? `Paid ${gold}g · +3 market spaces` : '+3 market spaces' };
    case 'PLAY_ANIMAL':
      return { ...base, headline: `${actorLabel} played ${name}`, detail: 'Animal attack' };
    case 'GUARD_PLAYED':
      return { ...base, headline: `${actorLabel} played Guard`, detail: entry.details?.replace(/^Guard cancelled /, 'Cancelled ') ?? null };
    case 'RAIN_MAKER_PLAYED':
      return { ...base, headline: `${actorLabel} played Rain Maker`, detail: 'Took the ware card just used' };
    case 'PLAY_PEOPLE':
    case 'PLAY_CARD':
      return { ...base, headline: `${actorLabel} played ${name}`, detail: null };
    default:
      return null;
  }
}

/** New spotlights in `log` after `fromIndex`, for plays by anyone but `viewer`. */
export function collectSpotlights(
  log: readonly GameLogEntry[],
  fromIndex: number,
  viewer: 0 | 1,
  actorLabel: string,
): PlaySpotlight[] {
  const out: PlaySpotlight[] = [];
  for (let i = Math.max(0, fromIndex); i < log.length; i++) {
    const entry = log[i];
    if (entry.player === viewer) continue;
    const spot = spotlightForEntry(entry, i, actorLabel);
    if (spot) out.push(spot);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Action log drawer
// ---------------------------------------------------------------------------

/** Bookkeeping entries a player never needs to read. */
const HIDDEN_ACTIONS = new Set(['AUTO_TRANSITION', 'RAIN_MAKER_WINDOW', 'GAME_OVER']);

export interface LogLine {
  index: number;
  player: 0 | 1;
  text: string;
  cardId: DeckCardId | null;
  /** A play with a face-up card — rendered with emphasis. */
  isPlay: boolean;
  isTurnEnd: boolean;
}

export interface LogTurn {
  turn: number;
  /** Whose turn it was. Reactions inside it can belong to the other seat. */
  owner: 0 | 1;
  lines: LogLine[];
}

/**
 * The log as turns, newest first (lines inside a turn stay chronological),
 * with hidden cards redacted for `hiddenPlayer` and bookkeeping dropped.
 */
export function groupLogByTurn(
  log: readonly GameLogEntry[],
  labels: readonly [string, string],
  hiddenPlayer: 0 | 1 | null,
): LogTurn[] {
  const turns: LogTurn[] = [];
  log.forEach((entry, index) => {
    if (HIDDEN_ACTIONS.has(entry.action)) return;
    let current = turns[turns.length - 1];
    if (!current || current.turn !== entry.turn) {
      current = { turn: entry.turn, owner: entry.player, lines: [] };
      turns.push(current);
    }
    // The turn ends with its owner's END_TURN — trust that over a reaction
    // that happened to be logged first.
    if (entry.action === 'END_TURN') current.owner = entry.player;
    current.lines.push({
      index,
      player: entry.player,
      text: describeLogEntry(entry, labels, hiddenPlayer),
      cardId: entry.card ?? null,
      isPlay: !!entry.card,
      isTurnEnd: entry.action === 'END_TURN',
    });
  });
  return turns.reverse();
}

/** Log entries by `player` after `fromIndex` — the drawer's unread badge. */
export function countUnread(log: readonly GameLogEntry[], fromIndex: number, player: 0 | 1): number {
  let n = 0;
  for (let i = Math.max(0, fromIndex); i < log.length; i++) {
    const entry = log[i];
    if (entry.player === player && !HIDDEN_ACTIONS.has(entry.action) && entry.action !== 'END_TURN') n++;
  }
  return n;
}

/**
 * What the other seat did since `viewer` last acted, oldest first — the
 * hotseat pass screen's recap. The other seat's hidden cards stay redacted.
 */
export function recapSinceLastMove(
  log: readonly GameLogEntry[],
  viewer: 0 | 1,
  labels: readonly [string, string],
  limit = 8,
): string[] {
  const other: 0 | 1 = viewer === 0 ? 1 : 0;
  const lines: string[] = [];
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (entry.player === viewer) break;
    if (HIDDEN_ACTIONS.has(entry.action) || entry.action === 'END_TURN') continue;
    lines.push(describeLogEntry(entry, labels, other));
  }
  lines.reverse();
  return lines.length > limit ? [`…and ${lines.length - limit + 1} earlier actions`, ...lines.slice(-(limit - 1))] : lines;
}
