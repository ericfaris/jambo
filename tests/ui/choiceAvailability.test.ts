import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { wareChoiceBlocked, binaryChoiceBlocked } from '../../src/ui/choiceAvailability.ts';
import { InteractionPanel } from '../../src/ui/InteractionPanel.tsx';
import { processAction } from '../../src/engine/GameEngine.ts';
import { createTestState, withGold, withSupply, withMarket } from '../helpers/testHelpers.ts';
import type { GameState, PendingResolution, WareType } from '../../src/engine/types.ts';
import { WARE_TYPES } from '../../src/engine/types.ts';

const basket: PendingResolution = { type: 'WARE_SELECT_MULTIPLE', sourceCard: 'basket_maker_1', count: 2 };
const supplies: PendingResolution = { type: 'BINARY_CHOICE', sourceCard: 'supplies_1', options: ['Pay 1g first', 'Discard 1 card from hand first'] };
const withPending = (s: GameState, pr: PendingResolution): GameState => ({ ...s, currentPlayer: 0, phase: 'PLAY', pendingResolution: pr });
const allSupply = (s: GameState, n: number) => WARE_TYPES.reduce((acc, w) => withSupply(acc, w as WareType, n), s);

describe('choice availability (fuzz finding: UI offered options the engine rejects)', () => {
  it('Basket Maker: wares with fewer than 2 in supply are blocked, with the count', () => {
    let s = withSupply(createTestState(), 'tea', 1);
    s = withSupply(s, 'silk', 0);
    expect(wareChoiceBlocked(s, basket, 'tea')).toBe('Only 1 left in supply');
    expect(wareChoiceBlocked(s, basket, 'silk')).toBe('None left in supply');
    expect(wareChoiceBlocked(s, basket, 'salt')).toBeNull();
  });

  it('Supplies: "Pay 1g first" is blocked at 0 gold; discarding never is', () => {
    const s = withPending(withGold(createTestState(), 0, 0), supplies);
    expect(binaryChoiceBlocked(s, supplies, 0)).toBe('Needs 1g');
    expect(binaryChoiceBlocked(s, supplies, 1)).toBeNull();
    expect(binaryChoiceBlocked(withGold(s, 0, 1), supplies, 0)).toBeNull();
  });

  it('Shaman give step: only wares you actually have are pickable', () => {
    const s = withPending(withMarket(createTestState(), 0, ['tea', 'tea']), { type: 'WARE_TRADE', sourceCard: 'shaman_1', step: 'SELECT_GIVE' });
    const pr = s.pendingResolution!;
    expect(wareChoiceBlocked(s, pr, 'tea')).toBeNull();
    expect(wareChoiceBlocked(s, pr, 'salt')).toBe('None in your market');
  });

  it('a picker with nothing pickable offers Continue — never a dead end — and Continue resolves cleanly', () => {
    const s = withPending(allSupply(createTestState(), 1), basket); // every ware has < 2
    const html = renderToStaticMarkup(createElement(InteractionPanel, { state: s, dispatch: () => {} }));
    expect(html).toContain('Continue');
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>.*?trinkets/); // not a grid of dead buttons
    // the Continue response triggers the engine's empty-state guard
    const next = processAction(s, { type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' } });
    expect(next.pendingResolution).toBeNull();
  });

  it('a normal picker shows blocked wares disabled with their reason', () => {
    const s = withPending(withSupply(createTestState(), 'tea', 1), basket);
    const html = renderToStaticMarkup(createElement(InteractionPanel, { state: s, dispatch: () => {} }));
    expect(html).toContain('aria-label="tea — Only 1 left in supply"');
    expect(html).not.toContain('Continue');
  });
});
