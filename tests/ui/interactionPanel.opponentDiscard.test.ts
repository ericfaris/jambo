import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { InteractionPanel, SelectableCardArea, SelectionCounter } from '../../src/ui/InteractionPanel.tsx';
import type { DeckCardId, GameAction, GameState } from '../../src/engine/types.ts';
import { createTestState, toPlayPhase, withHand } from '../helpers/testHelpers.ts';

const HAND: DeckCardId[] = ['ware_3k_1', 'guard_1', 'well_1', 'parrot_1', 'dancer_1'];

function tribalElderState(viewer: 0 | 1): GameState {
  const s = withHand(toPlayPhase(createTestState()), 1, HAND);
  return {
    ...s,
    currentPlayer: viewer === 1 ? 1 : 0,
    pendingResolution: { type: 'OPPONENT_DISCARD', sourceCard: 'tribal_elder_1', targetPlayer: 1, discardTo: 3 },
  };
}

const render = (s: GameState, viewerPlayer: 0 | 1) =>
  renderToStaticMarkup(createElement(InteractionPanel, { state: s, dispatch: (_a: GameAction) => {}, viewerPlayer }));

describe('Tribal Elder discard: picks are unmistakable', () => {
  it('the target sees a big counter and a confirm that says how many are left', () => {
    const html = render(tribalElderState(1), 1);
    expect(html).toContain('0 of 2 selected');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Pick 2 more/);
    expect(html).not.toContain('card-mark-stamp'); // nothing picked yet
  });

  it('selected cards get a Discard stamp; unselected ones do not', () => {
    const html = renderToStaticMarkup(createElement(SelectableCardArea, {
      cards: HAND, selectedIndices: [1, 3], onSelect: () => {}, selectedMark: 'Discard',
    }));
    expect(html.match(/card-mark-stamp/g)).toHaveLength(2);
    expect(html.match(/class="card-marked"/g)).toHaveLength(2);
    expect(html).toContain('>Discard<');
  });

  it('without selectedMark, other pickers render as before (no stamp)', () => {
    const html = renderToStaticMarkup(createElement(SelectableCardArea, {
      cards: HAND, selectedIndices: [1], onSelect: () => {},
    }));
    expect(html).not.toContain('card-mark-stamp');
    expect(html).toContain('display:contents');
  });

  it('counter turns to the done state when every pick is made', () => {
    const partial = renderToStaticMarkup(createElement(SelectionCounter, { selected: 1, needed: 2 }));
    expect(partial).toContain('1 of 2 selected');
    expect(partial).not.toContain('selection-counter-done');
    expect(partial.match(/selection-pip-on/g)).toHaveLength(1);
    const done = renderToStaticMarkup(createElement(SelectionCounter, { selected: 2, needed: 2 }));
    expect(done).toContain('selection-counter-done');
    expect(done).toContain('2 of 2 selected ✓');
  });

  it('the player of the card just waits', () => {
    const html = render(tribalElderState(0), 0);
    expect(html).toContain('choosing cards to discard');
    expect(html).not.toContain('selection-counter');
  });
});
