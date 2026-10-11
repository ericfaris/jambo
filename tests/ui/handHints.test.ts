import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { computeHandHints, endTurnBonus, REACTION_HINT } from '../../src/ui/handHints.ts';
import { HandDisplay } from '../../src/ui/HandDisplay.tsx';
import { validatePlayCard } from '../../src/engine/validation/actionValidator.ts';
import { getRandomAiAction } from '../../src/ai/RandomAI.ts';
import { processAction } from '../../src/engine/GameEngine.ts';
import { createInitialState } from '../../src/engine/GameState.ts';
import { getCard } from '../../src/engine/cards/CardDatabase.ts';
import { createRng } from '../../src/utils/rng.ts';
import type { GameState } from '../../src/engine/types.ts';
import { createTestState, toPlayPhase, withHand, withMarket, withGold } from '../helpers/testHelpers.ts';

describe('hand hints agree with the engine', () => {
  it('match validatePlayCard for every card across 40 random games', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let s: GameState = createInitialState(seed);
      const rng = createRng(seed * 7919);
      for (let step = 0; step < 400 && s.phase !== 'GAME_OVER'; step++) {
        const hints = computeHandHints(s, s.currentPlayer);
        if (hints) {
          for (const [cardId, hint] of hints) {
            if (hint.reaction) {
              expect(validatePlayCard(s, cardId).valid).toBe(false);
              continue;
            }
            if (getCard(cardId).type === 'ware') {
              const buy = validatePlayCard(s, cardId, 'buy').valid;
              const sell = validatePlayCard(s, cardId, 'sell').valid;
              expect(hint.playable).toBe(buy || sell);
              expect(!!hint.sellReady).toBe(sell);
            } else {
              expect(hint.playable).toBe(validatePlayCard(s, cardId).valid);
            }
            if (!hint.playable) expect(hint.reason).toBeTruthy();
            checked++;
          }
        }
        const action = getRandomAiAction(s, rng);
        if (!action) break;
        s = processAction(s, action);
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('dims nothing when the hand is not actionable', () => {
    const s = createTestState();
    expect(computeHandHints({ ...s, phase: 'DRAW' }, s.currentPlayer)).toBeNull();
    const p = toPlayPhase(s);
    expect(computeHandHints({ ...p, actionsLeft: 0 }, p.currentPlayer)).toBeNull();
    expect(computeHandHints(p, p.currentPlayer === 0 ? 1 : 0)).toBeNull();
  });

  it('marks a sellable ware card and an unaffordable one', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1', 'ware_6all_1']);
    s = withMarket(s, 0, ['trinkets', 'trinkets', 'trinkets', null, null, null]);
    s = withGold(s, 0, 0);
    const hints = computeHandHints(s, 0)!;
    expect(hints.get('ware_3k_1')).toMatchObject({ playable: true, sellReady: true });
    expect(hints.get('ware_6all_1')).toMatchObject({ playable: false, sellReady: false });
    expect(hints.get('ware_6all_1')!.reason).toBe('Not enough room in your market for these wares.');
  });

  it('never dims reactions — they explain themselves instead', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['guard_1']);
    expect(computeHandHints(s, 0)!.get('guard_1')).toEqual({ playable: false, reaction: true, reason: REACTION_HINT });
  });
});

describe('hand rendering', () => {
  it('dims unplayable cards with the reason, badges sell-ready ones, leaves reactions bright', () => {
    const hints = new Map([
      ['ware_3k_1', { playable: true, sellReady: true }],
      ['ware_6all_1', { playable: false, reason: 'Buying costs 10g — you have 0g.' }],
      ['guard_1', { playable: false, reaction: true, reason: REACTION_HINT }],
    ]);
    const html = renderToStaticMarkup(createElement(HandDisplay, { hand: ['ware_3k_1', 'ware_6all_1', 'guard_1'], hints }));
    expect(html.match(/hand-card-unplayable/g)).toHaveLength(1);
    expect(html).toContain('title="Buying costs 10g — you have 0g."');
    expect(html.match(/Sell ✓/g)).toHaveLength(1);
  });
});

describe('End Turn bonus', () => {
  it('shows +1g only with 2+ actions left', () => {
    expect(endTurnBonus(5)).toBe(1);
    expect(endTurnBonus(2)).toBe(1);
    expect(endTurnBonus(1)).toBe(0);
    expect(endTurnBonus(0)).toBe(0);
  });
});
