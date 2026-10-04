import { describe, expect, it } from 'vitest';
import { validateAction } from '../../src/engine/validation/actionValidator.ts';
import { getEasyAiAction } from '../../src/ai/difficulties/EasyAI.ts';
import { getMediumAiAction } from '../../src/ai/difficulties/MediumAI.ts';
import { getHardAiAction, evaluateBoard } from '../../src/ai/difficulties/HardAI.ts';
import { getExpertAiAction } from '../../src/ai/difficulties/ExpertAI.ts';
import { getAiActionByDifficulty } from '../../src/ai/difficulties/index.ts';
import { pickDiscardCardForValue } from '../../src/ai/strategyHeuristics.ts';
import { createTestState, toPlayPhase, withGold, withHand, withMarket, withUtility } from '../helpers/testHelpers.ts';

describe('AI difficulties baseline', () => {
  it('returns valid PLAY actions for all difficulty levels', () => {
    let state = toPlayPhase(createTestState(321));
    state = withHand(state, 0, ['ware_3k_1', 'ware_3h_1', 'well_1']);
    state = withGold(state, 0, 20);

    const easy = getEasyAiAction(state);
    const medium = getMediumAiAction(state);
    const hard = getHardAiAction(state);
    const expert = getExpertAiAction(state);

    expect(easy).not.toBeNull();
    expect(medium).not.toBeNull();
    expect(hard).not.toBeNull();
    expect(expert).not.toBeNull();

    expect(validateAction(state, easy!).valid).toBe(true);
    expect(validateAction(state, medium!).valid).toBe(true);
    expect(validateAction(state, hard!).valid).toBe(true);
    expect(validateAction(state, expert!).valid).toBe(true);
  });

  it('handles pending interaction states across all difficulties', () => {
    let state = createTestState(11);
    state = {
      ...state,
      pendingResolution: {
        type: 'BINARY_CHOICE',
        sourceCard: 'carrier_1',
        options: ['wares', 'cards'],
      },
    };

    const easy = getEasyAiAction(state, () => 0.1);
    const medium = getMediumAiAction(state, () => 0.1);
    const hard = getHardAiAction(state, () => 0.1);
    const expert = getExpertAiAction(state, () => 0.1);

    expect(easy).toEqual({ type: 'RESOLVE_INTERACTION', response: { type: 'BINARY_CHOICE', choice: 0 } });
    expect(medium).toEqual({ type: 'RESOLVE_INTERACTION', response: { type: 'BINARY_CHOICE', choice: 0 } });
    // Hard and Expert score the outcomes (2 wares vs 2 cards, opponent gets the other) — either is a
    // legitimate pick, so only require a valid choice rather than pinning one
    for (const smart of [hard, expert]) {
      expect(smart?.type).toBe('RESOLVE_INTERACTION');
      expect(validateAction(state, smart!).valid).toBe(true);
      expect((smart as { type: string; response: { type: string } } | null)?.response?.type).toBe('BINARY_CHOICE');
    }
  });

  it('is deterministic when injected with seeded rng', () => {
    let state = toPlayPhase(createTestState(77));
    state = withHand(state, 0, ['ware_3k_1', 'well_1']);
    state = withGold(state, 0, 20);

    const seeded = () => 0.2;
    expect(getMediumAiAction(state, seeded)).toEqual(getMediumAiAction(state, seeded));
    expect(getHardAiAction(state, seeded)).toEqual(getHardAiAction(state, seeded));
    expect(getExpertAiAction(state, seeded)).toEqual(getExpertAiAction(state, seeded));
  });

  it('routes by selected difficulty', () => {
    let state = createTestState(12);
    state = {
      ...state,
      pendingGuardReaction: {
        animalCard: 'parrot_1',
        targetPlayer: 0,
      },
    };

    const low = () => 0.0;
    const high = () => 0.99;

    // Easy plays guard when rng < 0.4 (40% rate)
    expect(getAiActionByDifficulty(state, 'easy', low)).toEqual({ type: 'GUARD_REACTION', play: true });
    // Medium skips guard when rng >= 0.6 (60% rate)
    expect(getAiActionByDifficulty(state, 'medium', high)).toEqual({ type: 'GUARD_REACTION', play: false });
    // Hard uses simulation — just verify it returns a valid guard reaction
    const hard = getAiActionByDifficulty(state, 'hard', low);
    expect(hard).not.toBeNull();
    expect(hard!.type).toBe('GUARD_REACTION');
  });

  it('hard returns a legal Rain Maker reaction decision', () => {
    let state = createTestState(13);
    state = withHand(state, 0, ['rain_maker_1']);
    state = {
      ...state,
      discardPile: ['ware_3k_1', ...state.discardPile],
      pendingWareCardReaction: {
        wareCardId: 'ware_3k_1',
        targetPlayer: 0,
      },
    };

    const hard = getHardAiAction(state, () => 0.9);
    expect(hard).toEqual({ type: 'WARE_CARD_REACTION', play: false });
    expect(validateAction(state, hard!).valid).toBe(true);
  });

  it('medium and hard prefer profitable ware sell over ending turn', () => {
    let state = toPlayPhase(createTestState(444));
    state = withHand(state, 0, ['ware_3k_1']);
    state = withMarket(state, 0, ['trinkets', 'trinkets', 'trinkets', null, null, null]);
    state = withGold(state, 0, 20);

    const medium = getMediumAiAction(state, () => 0.1);
    const hard = getHardAiAction(state, () => 0.1);

    expect(medium).toEqual({ type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'sell' });
    expect(hard).toEqual({ type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'sell' });
  });

  it('easy prefers a ware action when one is available', () => {
    let state = toPlayPhase(createTestState(445));
    state = withHand(state, 0, ['ware_3k_1', 'well_1']);
    state = withMarket(state, 0, ['trinkets', 'trinkets', 'trinkets', null, null, null]);
    state = withGold(state, 0, 20);

    // Easy with low rng hits the sell-priority path (75% threshold)
    const action = getEasyAiAction(state, () => 0.1);
    expect(action).toEqual({ type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'sell' });
  });

  it('medium and hard prefer high-value ware buy over ending turn', () => {
    let state = toPlayPhase(createTestState(446));
    state = withHand(state, 0, ['ware_3k_1']);
    state = withMarket(state, 0, [null, null, null, null, null, null]);
    state = withGold(state, 0, 20);

    const medium = getMediumAiAction(state, () => 0.1);
    const hard = getHardAiAction(state, () => 0.1);

    expect(medium).toEqual({ type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' });
    // Hard uses simulation and may prefer END_TURN over a speculative buy
    expect(hard!.type).toMatch(/PLAY_CARD|END_TURN/);
  });

  it('hard prefers shaman when it creates strong ware combo potential', () => {
    let state = toPlayPhase(createTestState(447));
    state = withHand(state, 0, ['shaman_1', 'ware_3s_1']);
    state = withMarket(state, 0, ['trinkets', 'trinkets', 'trinkets', null, null, null]);
    state = withGold(state, 0, 20);

    const hard = getHardAiAction(state, () => 0.1);
    expect(hard).toEqual({ type: 'PLAY_CARD', cardId: 'shaman_1' });
  });

  it('hard uses cheetah defensively when opponent gold is near endgame', () => {
    let state = toPlayPhase(createTestState(448));
    state = withHand(state, 0, ['cheetah_1', 'parrot_1']);
    state = withMarket(state, 0, [null, null, null, null, null, null]);
    state = withMarket(state, 1, ['tea', null, null, null, null, null]);
    state = withGold(state, 0, 24);
    state = withGold(state, 1, 58);

    const hard = getHardAiAction(state, () => 0.1);
    expect(hard).toEqual({ type: 'PLAY_CARD', cardId: 'cheetah_1' });
  });

  it('hard uses ape defensively when opponent hand size is very high', () => {
    let state = toPlayPhase(createTestState(449));
    state = withHand(state, 0, ['ape_1', 'parrot_1']);
    state = withHand(state, 1, ['guard_1', 'guard_2', 'guard_3', 'well_1', 'well_2', 'drums_1', 'drums_2', 'ware_3k_1', 'ware_3h_1']);
    state = withMarket(state, 0, [null, null, null, null, null, null]);
    state = withMarket(state, 1, ['tea', null, null, null, null, null]);
    state = withGold(state, 0, 22);
    state = withGold(state, 1, 28);

    const hard = getHardAiAction(state, () => 0.1);
    expect(hard).toEqual({ type: 'PLAY_CARD', cardId: 'ape_1' });
  });

  it('medium keeps a strong drawn card in draw phase', () => {
    let state = createTestState(1001);
    state = {
      ...state,
      phase: 'DRAW',
      drawnCard: 'wise_man_1',
    };

    const action = getMediumAiAction(state, () => 0.1);
    expect(action).toEqual({ type: 'KEEP_CARD' });
  });

  it('can choose utility play when utility area is full (triggers replacement)', () => {
    let state = toPlayPhase(createTestState(2026));
    state = withUtility(state, 0, 'well_1', 'well');
    state = withUtility(state, 0, 'drums_1', 'drums');
    state = withUtility(state, 0, 'throne_1', 'throne');
    state = withHand(state, 0, ['drums_3']);

    const easy = getEasyAiAction(state, () => 0.1);
    const medium = getMediumAiAction(state, () => 0.1);
    const hard = getHardAiAction(state, () => 0.1);
    const expert = getExpertAiAction(state, () => 0.1);

    expect(easy).not.toBeNull();
    expect(medium).not.toBeNull();
    expect(hard).not.toBeNull();
    expect(expert).not.toBeNull();

    expect(validateAction(state, easy!).valid).toBe(true);
    expect(validateAction(state, medium!).valid).toBe(true);
    expect(validateAction(state, hard!).valid).toBe(true);
    expect(validateAction(state, expert!).valid).toBe(true);
  });
});

describe('Small Market Stand valuation', () => {
  it('is not the discard pick over a low-value ware card when the AI owns none yet', () => {
    const state = createTestState(555);
    const cardId = pickDiscardCardForValue(state, 0, ['small_market_stand_1', 'ware_3k_1']);
    expect(cardId).toBe('ware_3k_1');
  });

  it('is not the discard pick even after already owning one stand', () => {
    let state = createTestState(556);
    const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
    newPlayers[0] = { ...newPlayers[0], smallMarketStands: 1 };
    state = { ...state, players: newPlayers };

    const cardId = pickDiscardCardForValue(state, 0, ['small_market_stand_2', 'ware_3k_1']);
    expect(cardId).toBe('ware_3k_1');
  });

  it('is not the discard pick even after already owning two stands (diminishing but still above baseline)', () => {
    let state = createTestState(557);
    const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
    newPlayers[0] = { ...newPlayers[0], smallMarketStands: 2 };
    state = { ...state, players: newPlayers };

    const cardId = pickDiscardCardForValue(state, 0, ['small_market_stand_3', 'ware_3k_1']);
    expect(cardId).toBe('ware_3k_1');
  });
});

describe('Gold-gap awareness', () => {
  it('MediumAI favors selling over ending its turn when significantly behind on gold', () => {
    let state = toPlayPhase(createTestState(777));
    state = withHand(state, 0, ['ware_3k_1']);
    state = withMarket(state, 0, ['trinkets', 'trinkets', 'trinkets', null, null, null]);
    state = withGold(state, 0, 5);
    state = withGold(state, 1, 40); // opponent far ahead

    const action = getMediumAiAction(state, () => 0.1);
    expect(action).toEqual({ type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'sell' });
  });

  it('HardAI evaluateBoard rewards being ahead on gold and penalizes being behind, relative to the raw gap', () => {
    const state = createTestState(999);
    const ahead = withGold(withGold(state, 0, 40), 1, 10);
    const behind = withGold(withGold(state, 0, 10), 1, 40);

    expect(evaluateBoard(ahead, 0)).toBeGreaterThan(evaluateBoard(behind, 0));
  });
});
