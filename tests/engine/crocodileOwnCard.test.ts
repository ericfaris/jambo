// Regression (2026-10-12 report): after playing a Crocodile and borrowing an
// opponent's utility that costs a hand card, the Crocodile you just played must
// not be one of the cards you can pay with — in the engine or on screen.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  createTestState, toPlayPhase, withHand, withUtility, withGold, act, resolve, hand,
} from '../helpers/testHelpers.ts';
import { checkInvariants } from '../../src/engine/validation/invariants.ts';
import { InteractionPanel } from '../../src/ui/InteractionPanel.tsx';
import type { DeckCardId, GameState, InteractionResponse, UtilityDesignId } from '../../src/engine/types.ts';

type Case = {
  design: UtilityDesignId;
  utility: DeckCardId;
  /** Steps after picking the utility that lead to the hand-card picker. */
  toPicker: InteractionResponse[];
  pick: (cardId: DeckCardId) => InteractionResponse;
};

const CASES: Case[] = [
  { design: 'weapons', utility: 'weapons_1', toPicker: [], pick: (cardId) => ({ type: 'SELECT_CARD', cardId }) },
  { design: 'boat', utility: 'boat_1', toPicker: [], pick: (cardId) => ({ type: 'SELECT_CARD', cardId }) },
  { design: 'kettle', utility: 'kettle_1', toPicker: [], pick: (cardId) => ({ type: 'SELECT_CARDS', cardIds: [cardId] }) },
  { design: 'supplies', utility: 'supplies_1', toPicker: [{ type: 'BINARY_CHOICE', choice: 1 }], pick: (cardId) => ({ type: 'SELECT_CARD', cardId }) },
];

/** You play crocodile_1 holding a second Crocodile and a Parrot; the opponent has the utility. */
function atPicker(c: Case): GameState {
  let s = toPlayPhase(createTestState());
  s = withHand(s, 0, ['crocodile_1', 'crocodile_2', 'parrot_1']);
  s = withHand(s, 1, []); // no Guard
  s = withGold(s, 0, 20);
  s = withUtility(s, 1, c.utility, c.design);
  s = act(s, { type: 'PLAY_CARD', cardId: 'crocodile_1' });
  s = resolve(s, { type: 'SELECT_UTILITY', utilityIndex: 0 });
  for (const r of c.toPicker) s = resolve(s, r);
  return s;
}

describe('Crocodile never pays for its own effect', () => {
  for (const c of CASES) {
    describe(`borrowing ${c.design}`, () => {
      it('the played Crocodile has left your hand while you choose', () => {
        const s = atPicker(c);
        expect(s.pendingResolution).not.toBeNull();
        expect(hand(s, 0)).toEqual(['crocodile_2', 'parrot_1']);
        expect(checkInvariants(s)).toEqual([]);
      });

      it('the engine refuses the played Crocodile as the discard', () => {
        expect(() => resolve(atPicker(c), c.pick('crocodile_1'))).toThrow(/not in hand/i);
      });

      it('a second Crocodile copy is a legal discard, and the played one still ends in the discard pile', () => {
        const s = resolve(atPicker(c), c.pick('crocodile_2'));
        expect(hand(s, 0)).not.toContain('crocodile_1');
        expect(hand(s, 0)).not.toContain('crocodile_2');
        expect(s.discardPile).toContain('crocodile_2');
        if (s.pendingResolution === null) expect(s.discardPile).toContain('crocodile_1');
      });

      it('the picker on screen offers only what is still in hand', () => {
        const s = atPicker(c);
        const html = renderToStaticMarkup(createElement(InteractionPanel, { state: s, dispatch: () => {}, viewerPlayer: 0 }));
        expect(html).toContain('/assets/cards/parrot.png');
        // exactly one Crocodile face: the second copy, not the one being played
        // (count <img src>, not React 19's <link rel="preload" href> for the same image)
        expect(html.match(/src="\/assets\/cards\/crocodile\.png"/g) ?? []).toHaveLength(1);
      });
    });
  }

  it('the invariant flags a played card that is still in a hand', () => {
    const s = atPicker(CASES[0]!);
    const broken: GameState = {
      ...s,
      players: [{ ...s.players[0], hand: [...s.players[0].hand, 'crocodile_1'] }, s.players[1]],
    };
    expect(checkInvariants(broken).map((v) => v.rule)).toContain('P0_PLAYED_CARD_IN_HAND');
  });
});
