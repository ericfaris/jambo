import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { computeUtilityHints, friendlyUtilityError } from '../../src/ui/utilityHints.ts';
import { UtilityArea } from '../../src/ui/UtilityArea.tsx';
import { validateActivateUtility } from '../../src/engine/validation/actionValidator.ts';
import { getRandomAiAction } from '../../src/ai/RandomAI.ts';
import { processAction } from '../../src/engine/GameEngine.ts';
import { createInitialState } from '../../src/engine/GameState.ts';
import { createRng } from '../../src/utils/rng.ts';
import type { GameState } from '../../src/engine/types.ts';
import { createTestState, toPlayPhase, withGold, withUtility, withMarket } from '../helpers/testHelpers.ts';

describe('utility hints agree with the engine', () => {
  it('match validateActivateUtility for every unused utility across 40 random games', () => {
    let checked = 0;
    let faded = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let s: GameState = createInitialState(seed);
      const rng = createRng(seed * 104729);
      for (let step = 0; step < 400 && s.phase !== 'GAME_OVER'; step++) {
        const hints = computeUtilityHints(s, s.currentPlayer);
        if (hints) {
          s.players[s.currentPlayer].utilities.forEach((u, i) => {
            const hint = hints.get(u.cardId);
            if (u.usedThisTurn) {
              expect(hint).toBeUndefined();
              return;
            }
            expect(hint?.usable).toBe(validateActivateUtility(s, i).valid);
            if (!hint?.usable) {
              faded++;
              expect(hint?.reason).toBeTruthy();
            }
            checked++;
          });
        }
        const action = getRandomAiAction(s, rng);
        if (!action) break;
        s = processAction(s, action);
      }
    }
    expect(checked).toBeGreaterThan(200);
    expect(faded).toBeGreaterThan(0);
  });

  it('nothing fades outside your own play phase', () => {
    const s = withUtility(toPlayPhase(createTestState()), 0, 'well_1', 'well');
    expect(computeUtilityHints({ ...s, phase: 'DRAW' }, 0)).toBeNull();
    expect(computeUtilityHints(s, 1)).toBeNull();
    expect(computeUtilityHints({ ...s, actionsLeft: 0 }, 0)).toBeNull();
  });

  it('a broke Well fades and says why; a funded one is usable', () => {
    const base = withUtility(toPlayPhase(createTestState()), 0, 'well_1', 'well');
    expect(computeUtilityHints(withGold(base, 0, 0), 0)?.get('well_1')).toEqual({ usable: false, reason: 'Needs 1 gold.' });
    expect(computeUtilityHints(withGold(base, 0, 5), 0)?.get('well_1')).toEqual({ usable: true });
  });

  it('Drums with an empty market fades', () => {
    const s = withMarket(withUtility(toPlayPhase(createTestState()), 0, 'drums_1', 'drums'), 0, [null, null, null, null, null, null]);
    expect(computeUtilityHints(s, 0)?.get('drums_1')).toEqual({ usable: false, reason: 'You need a ware in your market to return.' });
  });

  it('rewrites engine reasons in player words', () => {
    expect(friendlyUtilityError('Cannot activate Leopard Statue: need at least 2g')).toBe('Needs 2 gold.');
    expect(friendlyUtilityError('Mask of Transformation can only be activated before drawing')).toContain('before you draw');
    expect(friendlyUtilityError('Cannot activate Mask: discard pile is empty')).toBe('The discard pile is empty.');
    expect(friendlyUtilityError('Cannot activate Throne: opponent has no wares')).toBe('Your opponent has no wares to swap with.');
    expect(friendlyUtilityError('something new')).toBe('This utility cannot be used right now.');
  });
});

describe('the utility row fades and disables what cannot be used', () => {
  const utilities = [
    { cardId: 'well_1', designId: 'well' as const, usedThisTurn: false },
    { cardId: 'drums_1', designId: 'drums' as const, usedThisTurn: false },
  ];

  it('an unusable utility is faded, explained, and not clickable; a usable one stays ready', () => {
    const hints = new Map([['well_1', { usable: false, reason: 'Needs 1 gold.' }], ['drums_1', { usable: true }]]);
    const html = renderToStaticMarkup(createElement(UtilityArea, { utilities, hints, onActivate: () => {} }));
    expect(html).toContain('utility-unusable');
    expect(html).toContain('title="Needs 1 gold."');
    expect(html).toContain('aria-disabled="true"');
    expect(html.match(/utility-ready/g)).toHaveLength(1);
    expect(html.match(/card-face-playable/g)).toHaveLength(1);
  });

  it('without hints nothing fades', () => {
    const html = renderToStaticMarkup(createElement(UtilityArea, { utilities, onActivate: () => {} }));
    expect(html).not.toContain('utility-unusable');
    expect(html.match(/utility-ready/g)).toHaveLength(2);
  });
});
