import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/expert-idle-game-2026-10-04.json' with { type: 'json' };
import { createStartingState } from '../../src/persistence/replayLog.ts';
import { processAction } from '../../src/engine/GameEngine.ts';
import type { GameAction, GameState } from '../../src/engine/types.ts';
import { getExpertAiAction } from '../../src/ai/difficulties/ExpertAI.ts';
import { evaluateBoard, getAssetValueGold, standPlayBonus } from '../../src/ai/difficulties/HardAI.ts';
import { createTestState, toPlayPhase, withGold, withHand, withMarket } from '../helpers/testHelpers.ts';

function fixtureState(): GameState {
  let s = createStartingState(fixture.rngSeed, fixture.startingPlayer as 0 | 1);
  for (const a of fixture.actions as GameAction[]) s = processAction(s, a);
  return s;
}

describe('Expert plays the economy instead of banking the idle bonus', () => {
  it('real game: with an empty hand it draws and trades instead of passing with 5 actions', () => {
    // 2026-10-04 game: from here the old Expert did SKIP_DRAW + END_TURN(5 left)
    // for 15 straight turns (+1g each) while the human caught up from 22g to 60g.
    let s = fixtureState();
    expect(s.currentPlayer).toBe(1);
    expect(s.phase).toBe('DRAW');
    expect(s.players[1].hand).toHaveLength(0);

    expect(getExpertAiAction(s)?.type).toBe('DRAW_CARD');

    const types: string[] = [];
    while (s.currentPlayer === 1 && types.length < 30) {
      const a = getExpertAiAction(s)!;
      types.push(a.type);
      s = processAction(s, a);
    }
    const used = types.filter(t => t !== 'END_TURN' && t !== 'SKIP_DRAW' && t !== 'RESOLVE_INTERACTION').length;
    expect(used).toBeGreaterThanOrEqual(2);
  });

  it('a drawn-but-undecided card counts as an asset, so drawing is not scored as a wasted action', () => {
    const s = createTestState(5);
    const drawn = processAction(s, { type: 'DRAW_CARD' });
    expect(drawn.drawnCard).not.toBeNull();
    expect(getAssetValueGold(drawn, s.currentPlayer)).toBeGreaterThan(getAssetValueGold(s, s.currentPlayer));
  });

  it('a ware card that can sell against the market is worth more than one that cannot', () => {
    const base = toPlayPhase(createTestState(5));
    const me = base.currentPlayer;
    const ready = withMarket(withHand(base, me, ['ware_3k_1']), me, ['trinkets', 'trinkets', 'trinkets']);
    const notReady = withMarket(withHand(base, me, ['ware_3k_1']), me, ['tea', 'tea', 'tea']);
    expect(getAssetValueGold(ready, me)).toBeGreaterThan(getAssetValueGold(notReady, me));
    expect(evaluateBoard(ready, me)).toBeGreaterThan(evaluateBoard(notReady, me));
  });

  it('buying wares that complete a sale in hand scores better than a buy with no plan', () => {
    const base = withGold(toPlayPhase(createTestState(5)), 0, 20);
    const s = { ...base, currentPlayer: 0 as const };
    // Hand: Trinket Stall (buy 3 trinkets) + another Trinket Stall (sell them)
    const withPlan = withHand(s, 0, ['ware_3k_1', 'ware_3k_2']);
    const noPlan = withHand(s, 0, ['ware_3k_1', 'guard_1']);
    const delta = (st: GameState) => evaluateBoard(processAction(st, { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' }), 0) - evaluateBoard(st, 0);
    expect(delta(withPlan)).toBeGreaterThan(delta(noPlan));
  });
});

describe('Small Market Stand is valued by the plays it opens up', () => {
  const setup = (market: (string | null)[], handIds: string[]) => {
    const base = withGold(toPlayPhase(createTestState(5)), 0, 30);
    const s = { ...base, currentPlayer: 0 as const };
    return withMarket(withHand(s, 0, ['small_market_stand_1', ...handIds] as never), 0, market as never);
  };

  it('is worth a big bonus when it unlocks a Grand Market (6-ware) buy with a sale to follow', () => {
    // Buy one Grand Market, sell all six with the other — impossible without the extra slots
    const s = setup(['tea', 'salt', null, null, null, null], ['ware_6all_1', 'ware_6all_2']);
    expect(standPlayBonus(s, 0, 'small_market_stand_1')).toBeGreaterThan(20);
  });

  it('is worth a bonus when the market is too full for any 3-ware buy', () => {
    const s = setup(['tea', 'salt', 'silk', 'hides', null, null], ['ware_3k_1']);
    expect(standPlayBonus(s, 0, 'small_market_stand_1')).toBeGreaterThan(0);
  });

  it('gets no bonus for unlocking a buy that has no sale behind it', () => {
    const s = setup(['tea', 'salt', null, null, null, null], ['ware_6all_1']);
    expect(standPlayBonus(s, 0, 'small_market_stand_1')).toBe(0);
  });

  it('gets no bonus when the market already has room for everything in hand', () => {
    const s = setup([null, null, null, null, null, null], ['ware_3k_1']);
    expect(standPlayBonus(s, 0, 'small_market_stand_1')).toBe(0);
  });
});
