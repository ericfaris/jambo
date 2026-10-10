// Reported 2026-10-10: the AI used Throne to steal tea and give tea back —
// a swap that changes nothing but still spends the action and the Throne.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { GameState } from '../../src/engine/types.ts';
import { throneStealOptions, throneGiveOptions, hasUsefulThroneSwap } from '../../src/engine/market/throneSwap.ts';
import { validateAction, getValidActions } from '../../src/engine/validation/actionValidator.ts';
import { getRandomInteractionResponse } from '../../src/ai/RandomAI.ts';
import { getAiActionByDifficulty } from '../../src/ai/difficulties/index.ts';
import type { AIDifficulty } from '../../src/ai/difficulties/index.ts';
import { InteractionPanel } from '../../src/ui/InteractionPanel.tsx';
import { MarketDisplay } from '../../src/ui/MarketDisplay.tsx';
import { formatResolutionBreadcrumb } from '../../src/ui/uiHints.ts';
import {
  createTestState, toPlayPhase, withHand, withGold, withMarket, withUtility, act, resolve, market,
} from '../helpers/testHelpers.ts';

function setup(mine: Parameters<typeof withMarket>[2], theirs: Parameters<typeof withMarket>[2]): GameState {
  let s = toPlayPhase(createTestState());
  s = withHand(s, 0, []);
  s = withGold(s, 0, 20);
  s = withMarket(s, 0, mine);
  s = withMarket(s, 1, theirs);
  s = withUtility(s, 0, 'throne_1', 'throne');
  return s;
}

const swapCount = (s: GameState) => getValidActions(s).filter((a) => a.type === 'ACTIVATE_UTILITY').length;

describe('Throne never trades a ware for the same type', () => {
  it('lists only exchanges that change something', () => {
    const s = setup(['tea', 'tea', 'silk'], ['tea', 'fruit']);
    // Opponent's tea can be taken for your silk; their fruit for anything
    expect(throneStealOptions(s, 0)).toEqual([0, 1]);
    expect(throneGiveOptions(s, 0, 'tea')).toEqual([2]);
    expect(throneGiveOptions(s, 0, 'fruit')).toEqual([0, 1, 2]);
  });

  it('cannot be activated when every swap is like-for-like', () => {
    const s = setup(['tea', 'tea'], ['tea', 'tea', 'tea']);
    expect(hasUsefulThroneSwap(s, 0)).toBe(false);
    expect(validateAction(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 }).valid).toBe(false);
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/same type/);
    expect(swapCount(s)).toBe(0); // so the AI never even considers it
  });

  it('still activates when one useful swap exists', () => {
    const s = setup(['tea'], ['tea', 'silk']);
    expect(validateAction(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 }).valid).toBe(true);
  });

  it('rejects taking a ware you could only pay back in kind', () => {
    const s = setup(['tea'], ['tea', 'silk']);
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(() => resolve(s2, { type: 'SELECT_WARE', wareIndex: 0 })).toThrow(/no different ware/);
    const s3 = resolve(s2, { type: 'SELECT_WARE', wareIndex: 1 });
    expect(market(resolve(s3, { type: 'SELECT_WARE', wareIndex: 0 }), 0)[0]).toBe('silk');
  });

  it('rejects giving back the type you just took', () => {
    const s = setup(['tea', 'silk'], ['tea']);
    const s2 = resolve(act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 }), { type: 'SELECT_WARE', wareIndex: 0 });
    expect(() => resolve(s2, { type: 'SELECT_WARE', wareIndex: 0 })).toThrow(/same-type swap/);
    const done = resolve(s2, { type: 'SELECT_WARE', wareIndex: 1 });
    expect(market(done, 0).slice(0, 2)).toEqual(['tea', 'tea']);
    expect(market(done, 1)[0]).toBe('silk');
  });

  it('auto-resolves (no stall) if a like-for-like-only swap is ever pending', () => {
    const s: GameState = { ...setup(['tea'], ['tea']), pendingResolution: { type: 'WARE_THEFT_SWAP', sourceCard: 'throne_1', step: 'STEAL' } };
    const next = resolve(s, { type: 'SELECT_WARE', wareIndex: 0 });
    expect(next.pendingResolution).toBeNull();
    expect(market(next, 0)[0]).toBe('tea');
  });

  it("a Crocodile borrowing the opponent's Throne skips a pointless swap", () => {
    let s = toPlayPhase(createTestState());
    s = withMarket(s, 0, ['salt']);
    s = withMarket(s, 1, ['salt', 'salt']);
    s = withUtility(s, 1, 'throne_1', 'throne');
    s = withHand(s, 0, ['crocodile_1']);
    s = withHand(s, 1, []); // no Guard to block
    let next = act(s, { type: 'PLAY_CARD', cardId: 'crocodile_1' });
    for (let i = 0; i < 4 && next.pendingResolution; i++) {
      const r = getRandomInteractionResponse(next, () => 0.3);
      if (!r) break;
      next = resolve(next, r);
    }
    expect(next.pendingResolution).toBeNull();
    expect(market(next, 0)[0]).toBe('salt');
  });
});

describe('AI picks only real Throne swaps', () => {
  it('Random AI responses never steal X and give X', () => {
    const s = setup(['tea', 'tea', 'silk', 'tea'], ['tea', 'tea', 'fruit']);
    const pending = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    for (let seed = 0; seed < 50; seed++) {
      const rng = () => ((seed * 9301 + 49297) % 233280) / 233280;
      const steal = getRandomInteractionResponse(pending, rng)!;
      const afterSteal = resolve(pending, steal);
      const stolen = market(pending, 1)[(steal as { wareIndex: number }).wareIndex];
      const give = getRandomInteractionResponse(afterSteal, rng)!;
      expect(market(afterSteal, 0)[(give as { wareIndex: number }).wareIndex]).not.toBe(stolen);
    }
  });

  it.each(['easy', 'medium', 'hard', 'expert'] as AIDifficulty[])('%s AI never gives the stolen type back', (difficulty) => {
    const s = setup(['tea', 'tea', 'silk'], ['tea', 'tea', 'tea']);
    let state = resolve(act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 }), { type: 'SELECT_WARE', wareIndex: 0 });
    const give = getAiActionByDifficulty(state, difficulty);
    expect(give).not.toBeNull();
    expect(validateAction(state, give!).valid).toBe(true);
    state = act(state, give!);
    expect(market(state, 1)[0]).toBe('silk');
  });
});

describe('Throne panel', () => {
  it('greys out like-for-like choices instead of offering them', () => {
    const s = setup(['tea', 'silk'], ['tea']);
    const s2 = resolve(act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 }), { type: 'SELECT_WARE', wareIndex: 0 });
    const html = renderToStaticMarkup(createElement(InteractionPanel, { state: s2, dispatch: () => {} }));
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('Same as the tea');
    expect(html).toContain('1 available');
  });

  it('disabled market slots are not clickable', () => {
    const html = renderToStaticMarkup(createElement(MarketDisplay, { market: ['tea', 'silk'], onSlotClick: () => {}, disabledSlots: [0] }));
    expect(html.match(/role="button"/g)).toHaveLength(1);
  });

  it('breadcrumb names the right card', () => {
    expect(formatResolutionBreadcrumb({ type: 'WARE_THEFT_SWAP', sourceCard: 'throne_1', step: 'STEAL' })).toBe('Throne > Take Ware');
  });
});
