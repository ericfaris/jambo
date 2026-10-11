// ============================================================================
// Flights — what visibly changes hands between two consecutive game states.
// Pure planner; FlightLayer.tsx animates the result. (2026-10-11 review:
// wares and gold appeared/vanished in place, so trades and thefts were easy
// to miss.)
// ============================================================================

import type { GameState, WareType } from '../engine/types.ts';
import { WARE_TYPES } from '../engine/types.ts';

/** Where a flight starts or lands — each maps to a data-* anchor in the DOM. */
export type FlightAnchor =
  | { type: 'slot'; player: 0 | 1; index: number }
  | { type: 'supply'; ware: WareType }
  | { type: 'gold'; player: 0 | 1 }
  | { type: 'hand'; player: 0 | 1 }
  /** The center of the table (the discard pile): the bank, a draft pool. */
  | { type: 'table' };

export interface Flight {
  id: number;
  kind: 'ware' | 'coin' | 'card';
  ware?: WareType;
  from: FlightAnchor;
  to: FlightAnchor;
  /** Stagger within one change, ms. */
  delayMs: number;
  /** Lands in a market slot that is hidden until this flight arrives. */
  revealsSlot?: { player: 0 | 1; index: number };
}

export interface FlightSnapshot {
  markets: [(WareType | null)[], (WareType | null)[]];
  supply: Record<WareType, number>;
  gold: [number, number];
  handCounts: [number, number];
  deckCount: number;
  discardCount: number;
  logLength: number;
}

export function snapshotForFlights(state: GameState): FlightSnapshot {
  return {
    markets: [state.players[0].market, state.players[1].market],
    supply: state.wareSupply,
    gold: [state.players[0].gold, state.players[1].gold],
    handCounts: [state.players[0].hand.length, state.players[1].hand.length],
    deckCount: state.deck.length,
    discardCount: state.discardPile.length,
    logLength: state.log.length,
  };
}

/** Beyond this many new log entries the change wasn't one move (a resume, a new game). */
const MAX_LOG_STEP = 8;
export const MAX_COINS_PER_FLIGHT = 6;
const COIN_STAGGER_MS = 70;
const WARE_STAGGER_MS = 90;
const CARD_STAGGER_MS = 120;

export function coinCount(delta: number): number {
  return Math.max(1, Math.min(MAX_COINS_PER_FLIGHT, Math.ceil(Math.abs(delta) / 2)));
}

interface SlotChange { player: 0 | 1; index: number; ware: WareType }

/**
 * Plan the flights for prev → next. Wares that left one market and arrived
 * in the other (Parrot, Throne) fly across; other arrivals come from the
 * supply basket when the supply shrank (buy, Basket Maker, Carrier), else
 * from the table (drafts); departures go back to the supply when it grew
 * (sell, Portuguese, Drums), else to the table. Gold flows player→player on
 * a transfer (Cheetah), otherwise between a gold total and the table. Hand
 * cards fly between hands only when nothing else could explain the change
 * (Hyena). Returns [] for anything that isn't a single move.
 */
export function planFlights(prev: FlightSnapshot, next: FlightSnapshot, startId = 1): Flight[] {
  const logStep = next.logLength - prev.logLength;
  if (logStep <= 0 || logStep > MAX_LOG_STEP) return [];

  let id = startId;
  const flights: Flight[] = [];

  // --- wares ---------------------------------------------------------------
  const arrivals: SlotChange[] = [];
  const departures: SlotChange[] = [];
  for (const player of [0, 1] as const) {
    const before = prev.markets[player];
    const after = next.markets[player];
    const len = Math.max(before.length, after.length);
    for (let index = 0; index < len; index++) {
      const was = before[index] ?? null;
      const now = after[index] ?? null;
      if (was === now) continue;
      if (was) departures.push({ player, index, ware: was });
      if (now) arrivals.push({ player, index, ware: now });
    }
  }

  const supplyBudget = new Map<WareType, number>();
  for (const w of WARE_TYPES) supplyBudget.set(w, next.supply[w] - prev.supply[w]);

  const usedDepartures = new Set<SlotChange>();
  const matchedArrivals = new Set<SlotChange>();
  let wareOrder = 0;
  const wareDelay = () => 120 + (wareOrder++) * WARE_STAGGER_MS;

  // 1) across the table: a ware left one market and arrived in the other
  for (const a of arrivals) {
    const d = departures.find((x) => !usedDepartures.has(x) && x.player !== a.player && x.ware === a.ware);
    if (!d) continue;
    usedDepartures.add(d);
    flights.push({ id: id++, kind: 'ware', ware: a.ware, from: { type: 'slot', player: d.player, index: d.index }, to: { type: 'slot', player: a.player, index: a.index }, delayMs: wareDelay(), revealsSlot: { player: a.player, index: a.index } });
    matchedArrivals.add(a);
  }
  // 2) remaining arrivals: from the supply if it shrank, else the table
  for (const a of arrivals) {
    if (matchedArrivals.has(a)) continue;
    const budget = supplyBudget.get(a.ware) ?? 0;
    const fromSupply = budget < 0;
    if (fromSupply) supplyBudget.set(a.ware, budget + 1);
    flights.push({ id: id++, kind: 'ware', ware: a.ware, from: fromSupply ? { type: 'supply', ware: a.ware } : { type: 'table' }, to: { type: 'slot', player: a.player, index: a.index }, delayMs: wareDelay(), revealsSlot: { player: a.player, index: a.index } });
  }
  // 3) remaining departures: to the supply if it grew, else the table
  for (const d of departures) {
    if (usedDepartures.has(d)) continue;
    const budget = supplyBudget.get(d.ware) ?? 0;
    const toSupply = budget > 0;
    if (toSupply) supplyBudget.set(d.ware, budget - 1);
    flights.push({ id: id++, kind: 'ware', ware: d.ware, from: { type: 'slot', player: d.player, index: d.index }, to: toSupply ? { type: 'supply', ware: d.ware } : { type: 'table' }, delayMs: wareDelay() });
  }

  // --- gold ------------------------------------------------------------------
  const g0 = next.gold[0] - prev.gold[0];
  const g1 = next.gold[1] - prev.gold[1];
  const coin = (from: FlightAnchor, to: FlightAnchor, n: number) => {
    for (let i = 0; i < n; i++) flights.push({ id: id++, kind: 'coin', from, to, delayMs: i * COIN_STAGGER_MS });
  };
  if (g0 !== 0 && g1 !== 0 && Math.sign(g0) !== Math.sign(g1)) {
    // a transfer between players (Cheetah's 2g): straight across
    const payer: 0 | 1 = g0 < 0 ? 0 : 1;
    const payee: 0 | 1 = payer === 0 ? 1 : 0;
    coin({ type: 'gold', player: payer }, { type: 'gold', player: payee }, coinCount(Math.min(Math.abs(g0), Math.abs(g1))));
  } else {
    for (const [player, delta] of [[0, g0], [1, g1]] as const) {
      if (delta < 0) coin({ type: 'gold', player }, { type: 'table' }, coinCount(delta));
      if (delta > 0) coin({ type: 'table' }, { type: 'gold', player }, coinCount(delta));
    }
  }

  // --- hand to hand (Hyena) -------------------------------------------------
  const h0 = next.handCounts[0] - prev.handCounts[0];
  const h1 = next.handCounts[1] - prev.handCounts[1];
  if (h0 !== 0 && h0 === -h1 && next.deckCount === prev.deckCount && next.discardCount === prev.discardCount) {
    const giver: 0 | 1 = h0 < 0 ? 0 : 1;
    const taker: 0 | 1 = giver === 0 ? 1 : 0;
    for (let i = 0; i < Math.min(3, Math.abs(h0)); i++) {
      flights.push({ id: id++, kind: 'card', from: { type: 'hand', player: giver }, to: { type: 'hand', player: taker }, delayMs: i * CARD_STAGGER_MS });
    }
  }

  return flights;
}

/** The DOM selector for an anchor (data-* attributes on the board). */
export function anchorSelector(anchor: FlightAnchor): string {
  switch (anchor.type) {
    case 'slot': return `[data-market-slot="${anchor.player}-${anchor.index}"]`;
    case 'supply': return `[data-supply-ware="${anchor.ware}"]`;
    case 'gold': return `[data-gold-anchor="${anchor.player}"]`;
    case 'hand': return `[data-hand-anchor="${anchor.player}"]`;
    case 'table': return '[data-spotlight-target="discard"]';
  }
}
