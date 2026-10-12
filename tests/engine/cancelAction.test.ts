// ============================================================================
// Cancel Action — backing out of a just-started card/utility before its
// first choice (engine/cancelAction.ts).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  createTestState,
  toPlayPhase,
  act,
  resolve,
  withHand,
  withMarket,
  withGold,
  withUtility,
  withDiscard,
} from '../helpers/testHelpers.ts';
import type { DeckCardId, GameAction, GameState, UtilityDesignId } from '../../src/engine/types.ts';
import { validateAction, getValidActions } from '../../src/engine/validation/actionValidator.ts';
import { canCancelAction } from '../../src/engine/cancelAction.ts';
import { getResponder } from '../../src/engine/responder.ts';
import { extractPublicState } from '../../src/multiplayer/stateSplitter.ts';
import { checkInvariants } from '../../src/engine/validation/invariants.ts';

/** Move ids back into the deck from wherever they are, so the fixture helpers stay card-count safe. */
function claim(s: GameState, ids: DeckCardId[]): GameState {
  const drop = (list: DeckCardId[]) => list.filter((id) => !ids.includes(id));
  const players: GameState['players'] = [
    { ...s.players[0], hand: drop(s.players[0].hand) },
    { ...s.players[1], hand: drop(s.players[1].hand) },
  ];
  return { ...s, players, discardPile: drop(s.discardPile), deck: [...drop(s.deck), ...ids] };
}

const FILLER: DeckCardId[] = ['ware_3k_1', 'ware_2h1t_1', 'guard_1'];
const DISCARDS: DeckCardId[] = ['well_2', 'kettle_2'];

/** A rich state where every card/utility below is playable by player 0. */
function richState(handCards: DeckCardId[], utility?: [DeckCardId, UtilityDesignId], phase: 'PLAY' | 'DRAW' = 'PLAY'): GameState {
  let s = createTestState();
  if (phase === 'PLAY') s = toPlayPhase(s);
  expect(s.currentPlayer).toBe(0);
  s = claim(s, [...handCards, ...FILLER, ...DISCARDS, ...(utility ? [utility[0]] : [])]);
  s = withHand(s, 0, [...handCards, ...FILLER]);
  s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'silk']);
  s = withMarket(s, 1, ['fruit', 'salt', 'tea']);
  s = withGold(s, 0, 20);
  s = withDiscard(s, DISCARDS);
  if (utility) s = withUtility(s, 0, utility[0], utility[1]);
  return s;
}

/** Everything except the log (which records the cancel) must match. */
function comparable(s: GameState) {
  return { ...s, log: [], cancellableAction: null };
}

function expectExactUndo(before: GameState, action: GameAction) {
  const started = act(before, action);
  expect(started.pendingResolution).not.toBeNull();
  expect(canCancelAction(started)).toBe(true);
  expect(validateAction(started, { type: 'CANCEL_ACTION' }).valid).toBe(true);
  expect(extractPublicState(started).canCancel).toBe(true);

  const cancelled = act(started, { type: 'CANCEL_ACTION' });
  expect(comparable(cancelled)).toEqual(comparable(before));
  expect(cancelled.pendingResolution).toBeNull();
  expect(cancelled.cancellableAction).toBeNull();
  expect(cancelled.log.at(-1)?.action).toBe('CANCEL_ACTION');
  expect(checkInvariants(cancelled)).toEqual([]);
  return cancelled;
}

describe('CANCEL_ACTION — utilities refund the action and the once-per-turn use', () => {
  const cases: [string, DeckCardId, UtilityDesignId][] = [
    ['Boat', 'boat_1', 'boat'],
    ['Kettle', 'kettle_1', 'kettle'],
    ['Weapons', 'weapons_1', 'weapons'],
    ['Drums', 'drums_1', 'drums'],
    ['Leopard Statue', 'leopard_statue_1', 'leopard_statue'],
    ['Throne', 'throne_1', 'throne'],
    ['Supplies', 'supplies_1', 'supplies'],
    ['Scale (before drawing)', 'scale_1', 'scale'],
  ];

  for (const [name, cardId, design] of cases) {
    it(name, () => {
      const before = richState([], [cardId, design]);
      const cancelled = expectExactUndo(before, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
      expect(cancelled.players[0].utilities[0].usedThisTurn).toBe(false);
      // ...and it can be used again this turn
      expect(validateAction(cancelled, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 }).valid).toBe(true);
    });
  }

  it('Mask of Transformation (draw phase, before drawing)', () => {
    const before = richState([], ['mask_of_transformation_1', 'mask_of_transformation'], 'DRAW');
    expect(before.phase).toBe('DRAW');
    const cancelled = expectExactUndo(before, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(cancelled.phase).toBe('DRAW');
  });

  it('the reported case: Boat with a single card in hand keeps that card', () => {
    let before = richState([], ['boat_1', 'boat']);
    before = withHand(before, 0, ['guard_1']);
    const cancelled = expectExactUndo(before, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(cancelled.players[0].hand).toEqual(['guard_1']);
    expect(cancelled.actionsLeft).toBe(before.actionsLeft);
  });
});

describe('CANCEL_ACTION — people cards go back to the same hand position', () => {
  const cases: [string, DeckCardId][] = [
    ['Shaman', 'shaman_1'],
    ['Tribal Elder', 'tribal_elder_1'],
    ['Carrier', 'carrier_1'],
    ['Portuguese', 'portuguese_1'],
    ['Basket Maker', 'basket_maker_1'],
    ['Dancer', 'dancer_1'],
    ['Drummer', 'drummer_1'],
    ['Traveling Merchant', 'traveling_merchant_1'],
  ];

  for (const [name, cardId] of cases) {
    it(name, () => {
      const before = richState(['kettle_1', cardId]); // card sits mid-hand
      const cancelled = expectExactUndo(before, { type: 'PLAY_CARD', cardId });
      expect(cancelled.players[0].hand.indexOf(cardId)).toBe(before.players[0].hand.indexOf(cardId));
    });
  }

  it('placing a 4th utility (choose which to replace)', () => {
    let before = richState(['scale_1']);
    before = claim(before, ['well_1', 'drums_1', 'throne_1']);
    before = withUtility(before, 0, 'well_1', 'well');
    before = withUtility(before, 0, 'drums_1', 'drums');
    before = withUtility(before, 0, 'throne_1', 'throne');
    const started = act(before, { type: 'PLAY_CARD', cardId: 'scale_1' });
    expect(started.pendingResolution?.type).toBe('UTILITY_REPLACE');
    expectExactUndo(before, { type: 'PLAY_CARD', cardId: 'scale_1' });
  });
});

function expectNotCancellable(s: GameState) {
  expect(canCancelAction(s)).toBe(false);
  expect(validateAction(s, { type: 'CANCEL_ACTION' }).valid).toBe(false);
  expect(extractPublicState(s).canCancel).toBe(false);
  expect(() => act(s, { type: 'CANCEL_ACTION' })).toThrow(/no longer be cancelled/);
}

/** Cancel from a later screen restores `before` exactly (2026-10-12: cancel reaches every screen). */
function expectRestores(before: GameState, s: GameState) {
  expect(canCancelAction(s)).toBe(true);
  expect(extractPublicState(s).canCancel).toBe(true);
  const cancelled = act(s, { type: 'CANCEL_ACTION' });
  expect(comparable(cancelled)).toEqual(comparable(before));
  expect(cancelled.log.at(-1)?.action).toBe('CANCEL_ACTION');
  expect(checkInvariants(cancelled)).toEqual([]);
}

describe('CANCEL_ACTION — every resolution screen, until the opponent acts', () => {
  it('Psychic: the 6 peeked cards go back on the deck in order', () => {
    const before = richState(['psychic_1']);
    expectRestores(before, act(before, { type: 'PLAY_CARD', cardId: 'psychic_1' }));
  });

  it('Arabian Merchant: before the opponent bids; never once they have', () => {
    const before = richState(['arabian_merchant_1']);
    const s = act(before, { type: 'PLAY_CARD', cardId: 'arabian_merchant_1' });
    expect(s.pendingResolution?.type).toBe('AUCTION');
    if (getResponder(s) === 0) {
      expectRestores(before, s);
      const bid = resolve(s, { type: 'AUCTION_BID', amount: 1 });
      if (bid.pendingResolution) expectNotCancellable(bid); // now it's the opponent's call
    } else {
      expectNotCancellable(s);
    }
  });

  it('animals the opponent could not Guard — Parrot and Hyena (hand already shown)', () => {
    for (const cardId of ['parrot_1', 'hyena_1'] as DeckCardId[]) {
      let before = richState([cardId]);
      before = claim(before, ['ware_3k_2']);
      before = withHand(before, 1, ['ware_3k_2']); // opponent has no Guard
      const s = act(before, { type: 'PLAY_CARD', cardId });
      expect(s.pendingResolution).not.toBeNull();
      expectRestores(before, s);
    }
  });

  it('an animal waiting on the opponent’s Guard decision, or after it, is not cancellable', () => {
    let before = richState(['parrot_1']);
    before = claim(before, ['guard_2']);
    before = withHand(before, 1, ['guard_2']);
    const s = act(before, { type: 'PLAY_CARD', cardId: 'parrot_1' });
    expect(s.pendingGuardReaction).toBeTruthy();
    expect(canCancelAction(s)).toBe(false);
    const declined = act(s, { type: 'GUARD_REACTION', play: false });
    expect(declined.pendingResolution).not.toBeNull();
    expectNotCancellable(declined); // the opponent has acted
  });

  it('after a first choice of your own (Boat: card already discarded) — still restores everything', () => {
    const before = richState([], ['boat_1', 'boat']);
    const started = act(before, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    const afterFirst = resolve(started, { type: 'SELECT_CARD', cardId: 'guard_1' });
    expect(afterFirst.pendingResolution).not.toBeNull();
    expectRestores(before, afterFirst);
  });

  it('Scale goes straight to "keep 1" (no draw button) and cancel puts both cards back', () => {
    const before = richState([], ['scale_1', 'scale']);
    const started = act(before, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(started.pendingResolution?.type).toBe('UTILITY_EFFECT');
    if (started.pendingResolution?.type === 'UTILITY_EFFECT') expect(started.pendingResolution.selectedCards).toHaveLength(2);
    expect(started.deck.length).toBe(before.deck.length - 2);
    expectRestores(before, started);
  });

  it('once the effect has finished there is nothing to cancel', () => {
    const before = richState([], ['scale_1', 'scale']);
    const started = act(before, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    const pr = started.pendingResolution;
    const keep = pr?.type === 'UTILITY_EFFECT' ? pr.selectedCards![0] : '';
    const done = resolve(started, { type: 'SELECT_CARD', cardId: keep });
    expect(done.pendingResolution).toBeNull();
    expect(done.cancellableAction ?? null).toBeNull();
  });

  it('with nothing pending', () => {
    expectNotCancellable(richState([]));
  });

  it('the snapshot never reaches the public (Cast) state', () => {
    const s = act(richState(['psychic_1']), { type: 'PLAY_CARD', cardId: 'psychic_1' });
    expect(JSON.stringify(extractPublicState(s))).not.toContain('restore');
  });
});

describe('CANCEL_ACTION — AI and bookkeeping', () => {
  it('is never offered to the AI via getValidActions (it would loop cancel/re-activate)', () => {
    const started = act(richState([], ['boat_1', 'boat']), { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(canCancelAction(started)).toBe(true);
    expect(getValidActions(started).some((a) => a.type === 'CANCEL_ACTION')).toBe(false);
  });

  it('does not add cancellableAction to states that never had one', () => {
    const before = withMarket(richState(['ware_3k_2']), 0, []);
    const s = act(before, { type: 'PLAY_CARD', cardId: 'ware_3k_2', wareMode: 'buy' });
    expect('cancellableAction' in s).toBe(false);
  });
});
