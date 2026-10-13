// ============================================================================
// Dev-only scenarios for the online board preview (`/?online=1&stage=…`):
// exact table states for the moments a random game rarely reaches — a Guard
// answer, Rain Maker, each draft, both auctions, cancelling, the endgame.
// Cards are moved out of the deck / the other hand / the discard pile, never
// conjured; wares come out of the supply. Pure — tests pin the invariants.
// ============================================================================

import type { CardDesignId, DeckCardId, GameAction, GameState, PlayerState, UtilityDesignId, WareType } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import type { OnlineSeatView } from '../multiplayer/types.ts';

export const ONLINE_SCENARIOS = ['guard', 'rainmaker', 'elephant', 'ape', 'lion', 'auction', 'arabian', 'cancel', 'endgame'] as const;
export type OnlineScenario = typeof ONLINE_SCENARIOS[number];

export function isOnlineScenario(value: string | null): value is OnlineScenario {
  return value !== null && (ONLINE_SCENARIOS as readonly string[]).includes(value);
}

export interface StagedScenario {
  state: GameState;
  /** Moves the other (auto-played) seat makes first, before its AI takes over. */
  script: GameAction[];
}

type Seat = 0 | 1;

function withPlayer(state: GameState, seat: Seat, update: Partial<PlayerState>): GameState {
  const players: [PlayerState, PlayerState] = [
    seat === 0 ? { ...state.players[0], ...update } : state.players[0],
    seat === 1 ? { ...state.players[1], ...update } : state.players[1],
  ];
  return { ...state, players };
}

/** Take a card of `design` from wherever it isn't in use: deck, then the other hand, then the discard pile. */
function takeCard(state: GameState, design: CardDesignId, receiver: Seat): { state: GameState; cardId: DeckCardId } {
  const other: Seat = receiver === 0 ? 1 : 0;
  const isIt = (id: DeckCardId) => getCard(id).designId === design;
  const fromDeck = state.deck.find(isIt);
  if (fromDeck) return { state: { ...state, deck: state.deck.filter((id) => id !== fromDeck) }, cardId: fromDeck };
  const fromOther = state.players[other].hand.find(isIt);
  if (fromOther) return { state: withPlayer(state, other, { hand: state.players[other].hand.filter((id) => id !== fromOther) }), cardId: fromOther };
  const fromDiscard = state.discardPile.find(isIt);
  if (fromDiscard) return { state: { ...state, discardPile: state.discardPile.filter((id) => id !== fromDiscard) }, cardId: fromDiscard };
  throw new Error(`No free ${design} card to stage`);
}

function giveCard(state: GameState, seat: Seat, design: CardDesignId): { state: GameState; cardId: DeckCardId } {
  const already = state.players[seat].hand.find((id) => getCard(id).designId === design);
  if (already) return { state, cardId: already };
  const taken = takeCard(state, design, seat);
  return { state: withPlayer(taken.state, seat, { hand: [...taken.state.players[seat].hand, taken.cardId] }), cardId: taken.cardId };
}

function placeUtility(state: GameState, seat: Seat, design: UtilityDesignId): GameState {
  if (state.players[seat].utilities.some((u) => u.designId === design)) return state;
  if (state.players[seat].utilities.length >= 3) return state;
  const taken = takeCard(state, design, seat);
  return withPlayer(taken.state, seat, {
    utilities: [...taken.state.players[seat].utilities, { cardId: taken.cardId, designId: design, usedThisTurn: false }],
  });
}

/** Put these wares in the seat's first empty slots, out of the supply. */
function stockMarket(state: GameState, seat: Seat, wares: readonly WareType[]): GameState {
  let supply = { ...state.wareSupply };
  const market = [...state.players[seat].market];
  for (const ware of wares) {
    const slot = market.indexOf(null);
    if (slot === -1 || supply[ware] <= 0) continue;
    market[slot] = ware;
    supply = { ...supply, [ware]: supply[ware] - 1 };
  }
  return { ...withPlayer(state, seat, { market }), wareSupply: supply };
}

/** Send every card of a design out of a seat's hand, back into the deck. */
function removeFromHand(state: GameState, seat: Seat, design: CardDesignId): GameState {
  const hand = state.players[seat].hand;
  const out = hand.filter((id) => getCard(id).designId === design);
  if (out.length === 0) return state;
  return { ...withPlayer(state, seat, { hand: hand.filter((id) => !out.includes(id)) }), deck: [...state.deck, ...out] };
}

/** It's `seat`'s play phase, fresh. */
function playPhase(state: GameState, seat: Seat): GameState {
  // a drawn card in limbo goes back on the deck
  const deck = state.drawnCard ? [state.drawnCard, ...state.deck] : state.deck;
  return { ...state, deck, drawnCard: null, phase: 'PLAY', currentPlayer: seat, actionsLeft: 5, drawsThisPhase: 0, keptCardThisDrawPhase: true, pendingResolution: null, pendingGuardReaction: null, pendingWareCardReaction: null };
}

function withGold(state: GameState, seat: Seat, gold: number): GameState {
  return withPlayer(state, seat, { gold });
}

export function stageOnlineScenario(base: GameState, scenario: OnlineScenario, viewer: Seat): StagedScenario {
  const other: Seat = viewer === 0 ? 1 : 0;
  let s = base;
  switch (scenario) {
    case 'guard': {
      // The friend plays a Parrot on your market; you hold a Guard
      s = playPhase(s, other);
      s = giveCard(s, viewer, 'guard').state;
      s = stockMarket(s, viewer, ['silk', 'tea']);
      const parrot = giveCard(s, other, 'parrot');
      s = parrot.state;
      return { state: s, script: [{ type: 'PLAY_CARD', cardId: parrot.cardId }] };
    }
    case 'rainmaker': {
      // The friend buys with a ware card; you hold a Rain Maker to take it
      s = playPhase(s, other);
      s = giveCard(s, viewer, 'rain_maker').state;
      s = withGold(s, other, 30);
      const ware = giveCard(s, other, 'ware_3t');
      s = ware.state;
      return { state: s, script: [{ type: 'PLAY_CARD', cardId: ware.cardId, wareMode: 'buy' }] };
    }
    case 'elephant': {
      s = playPhase(s, viewer);
      s = removeFromHand(s, other, 'guard');
      s = stockMarket(s, viewer, ['silk', 'tea', 'salt']);
      s = stockMarket(s, other, ['fruit', 'hides', 'trinkets', 'tea']);
      s = giveCard(s, viewer, 'elephant').state;
      return { state: s, script: [] };
    }
    case 'ape': {
      s = playPhase(s, viewer);
      s = removeFromHand(s, other, 'guard');
      s = giveCard(s, viewer, 'ape').state;
      return { state: s, script: [] };
    }
    case 'lion': {
      s = playPhase(s, viewer);
      s = removeFromHand(s, other, 'guard');
      s = placeUtility(s, viewer, 'well');
      s = placeUtility(s, viewer, 'drums');
      s = placeUtility(s, other, 'boat');
      s = placeUtility(s, other, 'scale');
      s = giveCard(s, viewer, 'lion').state;
      return { state: s, script: [] };
    }
    case 'auction': {
      s = playPhase(s, viewer);
      s = withGold(s, viewer, 25);
      s = withGold(s, other, 25);
      s = giveCard(s, viewer, 'traveling_merchant').state;
      return { state: s, script: [] };
    }
    case 'arabian': {
      s = playPhase(s, viewer);
      s = withGold(s, viewer, 25);
      s = withGold(s, other, 25);
      s = giveCard(s, viewer, 'arabian_merchant').state;
      return { state: s, script: [] };
    }
    case 'cancel': {
      // Start a Boat, a Throne or a Shaman — then back out with ✕
      s = playPhase(s, viewer);
      s = stockMarket(s, viewer, ['silk', 'silk', 'tea']);
      s = stockMarket(s, other, ['fruit', 'salt']);
      s = placeUtility(s, viewer, 'boat');
      s = placeUtility(s, viewer, 'throne');
      s = giveCard(s, viewer, 'shaman').state;
      return { state: s, script: [] };
    }
    case 'endgame': {
      // One sale takes you past 60g; end the turn and the friend gets a final turn
      s = playPhase(s, viewer);
      s = withGold(s, viewer, 58);
      s = withGold(s, other, 40);
      s = stockMarket(s, viewer, ['salt', 'salt', 'salt']);
      s = giveCard(s, viewer, 'ware_3s').state;
      return { state: s, script: [] };
    }
  }
}

// ---------------------------------------------------------------------------
// The preview's URL: `/?online=1&slot=0|1&stage=<scenario>&hand=N&utils=N&presence=away|left`
// ---------------------------------------------------------------------------

export interface OnlinePreviewParams {
  slot: Seat;
  stage: OnlineScenario | null;
  hand: number;
  utils: number;
  presence: OnlineSeatView['status'];
}

export function parseOnlinePreviewParams(params: URLSearchParams): OnlinePreviewParams {
  const stage = params.get('stage');
  const presence = params.get('presence');
  const count = (key: string, max: number) => {
    const n = Math.floor(Number(params.get(key)));
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
  };
  return {
    slot: params.get('slot') === '1' ? 1 : 0,
    stage: isOnlineScenario(stage) ? stage : null,
    hand: count('hand', 30),
    utils: count('utils', 3),
    presence: presence === 'away' ? 'reconnecting' : presence === 'left' ? 'left' : 'connected',
  };
}

/** Grow the viewer's hand / utilities out of the deck (layout stress), never conjuring cards. */
export function stageViewerExtras(base: GameState, viewer: Seat, hand: number, utils: number): GameState {
  let s = base;
  if (utils > 0) {
    for (const id of s.deck) {
      if (s.players[viewer].utilities.length >= utils) break;
      const card = getCard(id);
      if (card.type !== 'utility') continue;
      s = placeUtility(s, viewer, card.designId as UtilityDesignId);
    }
  }
  const missing = hand - s.players[viewer].hand.length;
  if (missing > 0) {
    const extra = s.deck.filter((id) => getCard(id).type !== 'utility').slice(0, missing);
    s = { ...withPlayer(s, viewer, { hand: [...s.players[viewer].hand, ...extra] }), deck: s.deck.filter((id) => !extra.includes(id)) };
  }
  return s;
}

/** The mock ROOM_PLAYERS for the preview: you, and "Sam" in the given state. */
export const PREVIEW_FRIEND_NAME = 'Sam';
export const PREVIEW_GRACE_MS = 4 * 60_000 + 59_000;

export function previewSeats(viewer: Seat, friendStatus: OnlineSeatView['status']): [OnlineSeatView, OnlineSeatView] {
  const you: OnlineSeatView = { name: 'You', avatarUrl: null, signedIn: false, status: 'connected', graceMsLeft: null };
  const friend: OnlineSeatView = {
    name: PREVIEW_FRIEND_NAME,
    avatarUrl: null,
    signedIn: true,
    status: friendStatus,
    graceMsLeft: friendStatus === 'reconnecting' ? PREVIEW_GRACE_MS : null,
  };
  return viewer === 0 ? [you, friend] : [friend, you];
}
