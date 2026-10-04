// ============================================================================
// Official rulebook audit (Rio Grande English rules, 2004 — archived at
// web.archive.org/web/20120207123446/http://www.riograndegames.com/uploads/Game/Game_120_gameRules.pdf)
// Each test quotes the rule it checks. Complements rulebook.test.ts (setup,
// draw phase, bonus) and marketRules.test.ts (6th space, stands, overflow).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  createTestState, toPlayPhase, act, resolve, withHand, withMarket, withGold, withSupply, withUtility, gold,
} from '../helpers/testHelpers.ts';
import { validateAction } from '../../src/engine/validation/actionValidator.ts';
import { getCard } from '../../src/engine/cards/CardDatabase.ts';
import { getWinner } from '../../src/engine/endgame/EndgameManager.ts';
import type { DeckCardId, GameState } from '../../src/engine/types.ts';

/** Player 0 in phase 2 with 5 actions, a chosen hand, empty market, 20g. */
function play(hand: DeckCardId[], gold0 = 20): GameState {
  let s = act(createTestState(31), { type: 'SKIP_DRAW' });
  s = withHand(s, 0, hand);
  s = withMarket(s, 0, []);
  return withGold(s, 0, gold0);
}

describe('ware cards', () => {
  const card = 'ware_3k_1'; // three trinkets

  it('"pays the bank the amount … lower left … takes all the wares shown"', () => {
    const { buyPrice, types } = getCard(card).wares!;
    const s = act(play([card]), { type: 'PLAY_CARD', cardId: card, wareMode: 'buy' });
    expect(gold(s, 0)).toBe(20 - buyPrice);
    expect(s.players[0].market.filter(Boolean)).toEqual(types);
    expect(s.discardPile[0]).toBe(card); // "discarded after use"
  });

  it('"may also not play a ware card if all the wares shown on the card are not available in the supply"', () => {
    const s = withSupply(play([card]), 'trinkets', 2);
    expect(validateAction(s, { type: 'PLAY_CARD', cardId: card, wareMode: 'buy' }).valid).toBe(false);
  });

  it('"If a player does not have enough gold to pay for the wares, he may not play it"', () => {
    const s = play([card], getCard(card).wares!.buyPrice - 1);
    expect(validateAction(s, { type: 'PLAY_CARD', cardId: card, wareMode: 'buy' }).valid).toBe(false);
  });

  it('"If a player does not have enough empty places … he may not play it"', () => {
    let s = play([card], 40);
    s = withMarket(s, 0, ['tea', 'tea', 'tea', 'tea', 'tea']); // 1 free (the paid 6th)
    expect(validateAction(s, { type: 'PLAY_CARD', cardId: card, wareMode: 'buy' }).valid).toBe(false);
  });

  it('"takes from the bank the amount … lower right … places the wares … back in the supply"', () => {
    const { sellPrice } = getCard(card).wares!;
    let s = withMarket(play([card]), 0, ['trinkets', 'trinkets', 'trinkets']);
    const supplyBefore = s.wareSupply.trinkets;
    s = act(s, { type: 'PLAY_CARD', cardId: card, wareMode: 'sell' });
    expect(gold(s, 0)).toBe(20 + sellPrice);
    expect(s.players[0].market.filter(Boolean)).toEqual([]);
    expect(s.wareSupply.trinkets).toBe(supplyBefore + 3);
  });

  it('"may not play a ware card to sell wares unless he has all the wares shown"', () => {
    const s = withMarket(play([card]), 0, ['trinkets', 'trinkets']);
    expect(validateAction(s, { type: 'PLAY_CARD', cardId: card, wareMode: 'sell' }).valid).toBe(false);
  });

  it('"Generally: playing 1 card costs 1 action"', () => {
    const s = act(play([card]), { type: 'PLAY_CARD', cardId: card, wareMode: 'buy' });
    expect(s.actionsLeft).toBe(4);
  });
});

describe('utility cards', () => {
  it('"may use the function … even on the turn when he plays the card" and "each use … costs 1 action marker"', () => {
    let s = act(play(['weapons_1', 'guard_1']), { type: 'PLAY_CARD', cardId: 'weapons_1' });
    expect(s.actionsLeft).toBe(4);
    s = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s.actionsLeft).toBe(3);
  });

  it('"may use each of his utility cards only once per turn"', () => {
    let s = act(play(['weapons_1', 'guard_1', 'shaman_1']), { type: 'PLAY_CARD', cardId: 'weapons_1' });
    s = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    s = resolve(s, { type: 'SELECT_CARD', cardId: 'guard_1' });
    expect(validateAction(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 }).valid).toBe(false);
  });

  it('"At the end of his turn, the player turns his used utility cards back"', () => {
    let s = act(play(['weapons_1', 'guard_1']), { type: 'PLAY_CARD', cardId: 'weapons_1' });
    s = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    s = resolve(s, { type: 'SELECT_CARD', cardId: 'guard_1' });
    expect(s.players[0].utilities[0].usedThisTurn).toBe(true);
    s = act(s, { type: 'END_TURN' });
    expect(s.players[0].utilities[0].usedThisTurn).toBe(false);
  });

  it('"may have more than one of the same utility card … use that function more than once (but, just once per card)"', () => {
    let s = play(['guard_1', 'shaman_1']);
    s = withUtility(s, 0, 'weapons_1', 'weapons');
    s = withUtility(s, 0, 'weapons_2', 'weapons');
    s = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    s = resolve(s, { type: 'SELECT_CARD', cardId: 'guard_1' });
    expect(validateAction(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 1 }).valid).toBe(true);
    s = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 1 });
    s = resolve(s, { type: 'SELECT_CARD', cardId: 'shaman_1' });
    expect(gold(s, 0)).toBe(24);
  });

  it('"If a player wants to play a 4th utility card, he must first discard one … He may even discard a card he has already used"', () => {
    let s = play(['guard_1', 'boat_1']);
    s = withUtility(s, 0, 'weapons_1', 'weapons');
    s = withUtility(s, 0, 'well_1', 'well');
    s = withUtility(s, 0, 'drums_1', 'drums');
    s = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    s = resolve(s, { type: 'SELECT_CARD', cardId: 'guard_1' }); // weapons used
    s = act(s, { type: 'PLAY_CARD', cardId: 'boat_1' });
    s = resolve(s, { type: 'SELECT_UTILITY', utilityIndex: 0 }); // discard the used Weapons
    expect(s.players[0].utilities.map((u) => u.designId)).toEqual(expect.arrayContaining(['boat', 'well', 'drums']));
    expect(s.players[0].utilities).toHaveLength(3);
    expect(s.discardPile).toContain('weapons_1');
  });
});

describe('people and animals', () => {
  it('"executes the action described … and discards the card"', () => {
    let s = withMarket(play(['portuguese_1']), 0, ['tea', 'salt']);
    s = act(s, { type: 'PLAY_CARD', cardId: 'portuguese_1' });
    s = resolve(s, { type: 'SELL_WARES', wareIndices: [0, 1] });
    expect(s.discardPile[0]).toBe('portuguese_1');
    expect(gold(s, 0)).toBe(24);
  });

  it('"The playing of a guard card costs no action markers"', () => {
    let s = play(['parrot_1']);
    s = withHand(s, 1, ['guard_1']);
    s = withMarket(s, 1, ['tea']);
    s = act(s, { type: 'PLAY_CARD', cardId: 'parrot_1' });
    const opponentHandBefore = s.players[1].hand.length;
    s = act(s, { type: 'GUARD_REACTION', play: true });
    expect(s.actionsLeft).toBe(4); // only the Parrot play cost an action
    expect(s.players[1].hand.length).toBe(opponentHandBefore - 1);
    expect(s.discardPile.slice(0, 2)).toEqual(expect.arrayContaining(['parrot_1', 'guard_1']));
    expect(s.players[1].market).toContain('tea'); // negated for both players
  });
});

describe('important rules', () => {
  it('"If a player has no gold and wants to take an action that costs gold, he may not take the action"', () => {
    let s = play(['basket_maker_1'], 0);
    s = withUtility(s, 0, 'well_1', 'well');
    s = withUtility(s, 0, 'leopard_statue_1', 'leopard_statue');
    expect(validateAction(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 }).valid).toBe(false); // Well: pay 1g
    expect(validateAction(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 1 }).valid).toBe(false); // Leopard: pay 2g
    expect(validateAction(s, { type: 'PLAY_CARD', cardId: 'basket_maker_1' }).valid).toBe(false); // pay 2g
  });

  it('"The players can have as many cards in their hands as they want"', () => {
    let s = createTestState(31);
    s = withHand(s, 0, s.deck.slice(0, 20));
    s = act(s, { type: 'SKIP_DRAW' });
    s = act(s, { type: 'END_TURN' });
    expect(s.players[0].hand).toHaveLength(20);
  });

  it('"If the card supply is exhausted, shuffle the discard stack and place it face-down as the new card supply"', () => {
    let s = createTestState(31);
    s = { ...s, discardPile: [...s.deck.slice(1)], deck: s.deck.slice(0, 1) };
    s = act(s, { type: 'DRAW_CARD' });
    s = act(s, { type: 'DISCARD_DRAWN' });
    expect(s.deck.length).toBe(0);
    s = act(s, { type: 'DRAW_CARD' });
    expect(s.drawnCard).not.toBeNull();
    expect(s.deck.length).toBeGreaterThan(0);
  });
});

describe('game end', () => {
  it('"When a player has 60 or more gold at the end of his turn" — not mid-turn', () => {
    let s = play(['weapons_1', 'guard_1'], 59);
    s = act(s, { type: 'PLAY_CARD', cardId: 'weapons_1' });
    s = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    s = resolve(s, { type: 'SELECT_CARD', cardId: 'guard_1' }); // 61g mid-turn
    expect(gold(s, 0)).toBe(61);
    expect(s.endgame).toBeNull();
    s = act(s, { type: 'END_TURN' });
    expect(s.endgame).toEqual({ triggerPlayer: 0, finalTurnPlayer: 1, isFinalTurn: true });
  });

  function finish(goldTrigger: number, goldFinal: number) {
    let s = act(play([], 70), { type: 'END_TURN' });
    s = withGold(s, 0, goldTrigger);
    s = act(s, { type: 'SKIP_DRAW' });
    s = withGold(s, 1, goldFinal);
    s = act(s, { type: 'END_TURN' });
    return s;
  }

  it('"His opponent takes one last turn … if the opponent has the same amount or more gold … he is the winner"', () => {
    const tie = finish(65, 64); // final-turn player gets +1 bonus → 65 = tie
    expect(tie.phase).toBe('GAME_OVER');
    expect(getWinner(tie)).toBe(1);
  });

  it('"Otherwise, the player who triggered the end of the game is the winner"', () => {
    const s = finish(70, 60);
    expect(s.phase).toBe('GAME_OVER');
    expect(getWinner(s)).toBe(0);
  });
});

// Known deviation (documented in docs/CARD_REFERENCE.md): "he can choose which
// to take and which to leave in the supply" — the engine keeps wares in the
// order received. Only matters for a Traveling Merchant win of two different
// wares with exactly one usable space; marketRules.test.ts pins current
// behaviour (keeps what fits, the rest returns to the supply, nothing is lost).

describe('house rules (decided 2026-10-04)', () => {
  it('Wise Man\'s +2g applies to a Dancer sale', () => {
    let s = play(['wise_man_1', 'dancer_1', 'ware_3k_1']);
    s = withMarket(s, 0, ['tea', 'salt', 'silk']);
    s = act(s, { type: 'PLAY_CARD', cardId: 'wise_man_1' });
    s = act(s, { type: 'PLAY_CARD', cardId: 'dancer_1' });
    s = resolve(s, { type: 'SELECT_CARD', cardId: 'ware_3k_1' });
    s = resolve(s, { type: 'SELECT_WARES', wareIndices: [0, 1, 2] });
    expect(gold(s, 0)).toBe(20 + getCard('ware_3k_1').wares!.sellPrice + 2);
  });

  it('Wise Man\'s +2g applies once per Portuguese sale, not per ware', () => {
    let s = play(['wise_man_1', 'portuguese_1']);
    s = withMarket(s, 0, ['tea', 'salt', 'silk', 'fruit']);
    s = act(s, { type: 'PLAY_CARD', cardId: 'wise_man_1' });
    s = act(s, { type: 'PLAY_CARD', cardId: 'portuguese_1' });
    s = resolve(s, { type: 'SELL_WARES', wareIndices: [0, 1, 2, 3] });
    expect(gold(s, 0)).toBe(20 + 4 * 2 + 2);
  });

  it('a Portuguese "sale" of nothing is rejected, so it can\'t farm the Wise Man bonus', () => {
    let s = play(['wise_man_1', 'portuguese_1']);
    s = withMarket(s, 0, ['tea']);
    s = act(s, { type: 'PLAY_CARD', cardId: 'wise_man_1' });
    s = act(s, { type: 'PLAY_CARD', cardId: 'portuguese_1' });
    expect(() => resolve(s, { type: 'SELL_WARES', wareIndices: [] })).toThrow(/at least 1 ware/);
  });

  it('without Wise Man, Dancer and Portuguese pay their normal amounts', () => {
    let s = play(['portuguese_1']);
    s = withMarket(s, 0, ['tea', 'salt']);
    s = act(s, { type: 'PLAY_CARD', cardId: 'portuguese_1' });
    s = resolve(s, { type: 'SELL_WARES', wareIndices: [0, 1] });
    expect(gold(s, 0)).toBe(24);
  });

  it('only Mask of Transformation can be used before drawing', () => {
    let s = createTestState(31);
    s = withHand(s, 0, ['guard_1']);
    s = withUtility(s, 0, 'weapons_1', 'weapons');
    s = withUtility(s, 0, 'mask_of_transformation_1', 'mask_of_transformation');
    s = { ...s, discardPile: [s.deck[0], ...s.discardPile], deck: s.deck.slice(1) };
    expect(s.phase).toBe('DRAW');
    expect(validateAction(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 }).valid).toBe(false); // Weapons
    expect(validateAction(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 1 }).valid).toBe(true);  // Mask
  });
});
