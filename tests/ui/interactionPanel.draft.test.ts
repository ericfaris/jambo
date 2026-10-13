import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { InteractionPanel } from '../../src/ui/InteractionPanel.tsx';
import type { GameAction, GameState, PendingDraft, WareType, DeckCardId } from '../../src/engine/types.ts';
import { createTestState } from '../helpers/testHelpers.ts';

const noopDispatch = (_action: GameAction) => {};

function withWareDraft(
  state: GameState,
  opts: {
    sourceCard: DeckCardId;
    availableWares: WareType[];
    currentPicker: 0 | 1;
  },
): GameState {
  const pending: PendingDraft = {
    type: 'DRAFT',
    sourceCard: opts.sourceCard,
    draftMode: 'wares',
    availableWares: opts.availableWares,
    currentPicker: opts.currentPicker,
    picks: [[], []],
  };
  return { ...state, currentPlayer: 0, pendingResolution: pending };
}

function withCardDraft(
  state: GameState,
  opts: {
    sourceCard: DeckCardId;
    draftMode: 'cards' | 'utilities';
    availableCards: DeckCardId[];
    currentPicker: 0 | 1;
  },
): GameState {
  const pending: PendingDraft = {
    type: 'DRAFT',
    sourceCard: opts.sourceCard,
    draftMode: opts.draftMode,
    availableWares: [],
    availableCards: opts.availableCards,
    currentPicker: opts.currentPicker,
    picks: [[], []],
    cardPicks: [[], []],
  };
  return { ...state, currentPlayer: 0, pendingResolution: pending };
}

describe('Draft panel stays visible during opponent pick', () => {
  describe('Elephant (ware draft)', () => {
    it('renders interactive panel when it is the viewer\'s pick', () => {
      const state = withWareDraft(createTestState(), {
        sourceCard: 'elephant_1',
        availableWares: ['trinkets', 'hides', 'tea', 'silk'],
        currentPicker: 0,
      });

      const html = renderToStaticMarkup(
        createElement(InteractionPanel, { state, dispatch: noopDispatch, viewerPlayer: 0 }),
      );

      expect(html).toContain('Pick 1 ware to keep');
      expect(html).toContain('4 in pool');
      // Buttons should be present (interactive)
      expect(html).toContain('<button');
    });

    it('renders read-only panel with pool when it is the opponent\'s pick', () => {
      const state = withWareDraft(createTestState(), {
        sourceCard: 'elephant_1',
        availableWares: ['trinkets', 'hides', 'tea', 'silk'],
        currentPicker: 1, // AI picking
      });

      const html = renderToStaticMarkup(
        createElement(InteractionPanel, { state, dispatch: noopDispatch, viewerPlayer: 0 }),
      );

      expect(html).toContain('Opponent is picking...');
      expect(html).toContain('4 in pool');
      // Should NOT have clickable buttons — wares rendered as divs with opacity
      expect(html).toContain('ware-pick-waiting');
    });

    it('shows updated pool as wares are picked', () => {
      const state = withWareDraft(createTestState(), {
        sourceCard: 'elephant_1',
        availableWares: ['trinkets', 'hides'], // 2 left after some picks
        currentPicker: 1,
      });

      const html = renderToStaticMarkup(
        createElement(InteractionPanel, { state, dispatch: noopDispatch, viewerPlayer: 0 }),
      );

      expect(html).toContain('2 in pool');
    });
  });

  describe('Ape (card draft)', () => {
    it('renders interactive panel when it is the viewer\'s pick', () => {
      const state = withCardDraft(createTestState(), {
        sourceCard: 'ape_1',
        draftMode: 'cards',
        availableCards: ['guard_1', 'well_1', 'ware_3k_1'],
        currentPicker: 0,
      });

      const html = renderToStaticMarkup(
        createElement(InteractionPanel, { state, dispatch: noopDispatch, viewerPlayer: 0 }),
      );

      expect(html).toContain('Pick 1 card to keep');
      expect(html).toContain('3 in pool');
    });

    it('renders read-only panel with cards when it is the opponent\'s pick', () => {
      const state = withCardDraft(createTestState(), {
        sourceCard: 'ape_1',
        draftMode: 'cards',
        availableCards: ['guard_1', 'well_1', 'ware_3k_1'],
        currentPicker: 1,
      });

      const html = renderToStaticMarkup(
        createElement(InteractionPanel, { state, dispatch: noopDispatch, viewerPlayer: 0 }),
      );

      expect(html).toContain('Opponent is picking a card...');
      expect(html).toContain('3 in pool');
      // Panel should still be rendered (not null/empty)
      expect(html).toContain('resolve-title">Ape<');
    });
  });

  describe('Lion (utility draft)', () => {
    it('renders interactive panel when it is the viewer\'s pick', () => {
      const state = withCardDraft(createTestState(), {
        sourceCard: 'lion_1',
        draftMode: 'utilities',
        availableCards: ['well_1', 'drums_1'],
        currentPicker: 0,
      });

      const html = renderToStaticMarkup(
        createElement(InteractionPanel, { state, dispatch: noopDispatch, viewerPlayer: 0 }),
      );

      expect(html).toContain('Pick 1 utility to keep');
      expect(html).toContain('2 in pool');
    });

    it('renders read-only panel with utilities when it is the opponent\'s pick', () => {
      const state = withCardDraft(createTestState(), {
        sourceCard: 'lion_1',
        draftMode: 'utilities',
        availableCards: ['well_1', 'drums_1'],
        currentPicker: 1,
      });

      const html = renderToStaticMarkup(
        createElement(InteractionPanel, { state, dispatch: noopDispatch, viewerPlayer: 0 }),
      );

      expect(html).toContain('Opponent is picking a utility...');
      expect(html).toContain('2 in pool');
      expect(html).toContain('resolve-title">Lion<');
    });
  });

  describe('Panel continuity across turns', () => {
    it('shows panel for both viewer pick and opponent pick in same draft', () => {
      const base = createTestState();

      // Viewer's turn to pick
      const myPick = withWareDraft(base, {
        sourceCard: 'elephant_1',
        availableWares: ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt'],
        currentPicker: 0,
      });

      // After viewer picks, opponent's turn
      const oppPick = withWareDraft(base, {
        sourceCard: 'elephant_1',
        availableWares: ['hides', 'tea', 'silk', 'fruit', 'salt'], // 1 fewer
        currentPicker: 1,
      });

      const htmlMyPick = renderToStaticMarkup(
        createElement(InteractionPanel, { state: myPick, dispatch: noopDispatch, viewerPlayer: 0 }),
      );
      const htmlOppPick = renderToStaticMarkup(
        createElement(InteractionPanel, { state: oppPick, dispatch: noopDispatch, viewerPlayer: 0 }),
      );

      // Both should render the Elephant resolve panel
      expect(htmlMyPick).toContain('resolve-title">Elephant<');
      expect(htmlOppPick).toContain('resolve-title">Elephant<');

      // My pick is interactive, opp pick shows waiting text
      expect(htmlMyPick).toContain('Pick 1 ware to keep');
      expect(htmlOppPick).toContain('Opponent is picking...');

      // Pool sizes differ
      expect(htmlMyPick).toContain('6 in pool');
      expect(htmlOppPick).toContain('5 in pool');
    });
  });
});

describe('card pool styles', () => {
  it('never mix the margin shorthand with longhands (a shrinking pool swaps them on one div)', async () => {
    const { getCardGridStyle } = await import('../../src/ui/InteractionPanel.tsx');
    for (let n = 0; n <= 20; n++) expect(getCardGridStyle(n)).not.toHaveProperty('margin');
  });
});
