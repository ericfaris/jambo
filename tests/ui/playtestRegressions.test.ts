// ============================================================================
// Regression tests for the UI fixes from the 2026-10-03 playtest
// ============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { GameAction } from '../../src/engine/types.ts';
import { shouldAiAct, isWareDialogValid, MAX_AI_ATTEMPTS } from '../../src/ui/gameScreenLogic.ts';
import { SpeechBubble } from '../../src/ui/SpeechBubble.tsx';
import { GameLog } from '../../src/ui/GameLog.tsx';
import { ResolveMegaView, HAND_STRIP_RESERVE_PX } from '../../src/ui/ResolveMegaView.tsx';
import { CenterRow } from '../../src/ui/CenterRow.tsx';
import { PreGameSetupModal } from '../../src/ui/screens/PreGameSetupModal.tsx';
import { MarketDisplay } from '../../src/ui/MarketDisplay.tsx';
import { formatResolutionBreadcrumb } from '../../src/ui/uiHints.ts';
import { createTestState } from '../helpers/testHelpers.ts';

const noop = () => {};
const noopDispatch = (_a: GameAction) => {};

beforeAll(() => {
  // HandReferenceStrip reads window.innerWidth during render
  if (typeof globalThis.window === 'undefined') {
    (globalThis as unknown as { window: { innerWidth: number } }).window = { innerWidth: 1400 };
  }
});

describe('AI never plays behind the first-run tutorial', () => {
  it('waits while the tutorial is open', () => {
    expect(shouldAiAct({ isAiTurn: true, showTutorial: true, attempts: 0 })).toBe(false);
    expect(shouldAiAct({ isAiTurn: true, showTutorial: false, attempts: 0 })).toBe(true);
  });
  it('still respects the attempt cap and whose turn it is', () => {
    expect(shouldAiAct({ isAiTurn: false, showTutorial: false, attempts: 0 })).toBe(false);
    expect(shouldAiAct({ isAiTurn: true, showTutorial: false, attempts: MAX_AI_ATTEMPTS })).toBe(false);
  });
});

describe('stale buy/sell dialog closes itself', () => {
  it('only valid while the card is in hand and the player can act', () => {
    expect(isWareDialogValid('ware_3k_1', true, ['ware_3k_1'])).toBe(true);
    expect(isWareDialogValid('ware_3k_1', true, ['well_1'])).toBe(false); // card left the hand
    expect(isWareDialogValid('ware_3k_1', false, ['ware_3k_1'])).toBe(false); // turn moved on
    expect(isWareDialogValid(null, true, [])).toBe(false);
  });
});

describe('AI speech bubble stays clear of the opponent gold', () => {
  it('sits left of the gold block, is click-through, and is announced politely', () => {
    const html = renderToStaticMarkup(createElement(SpeechBubble, { message: 'Hello', visible: true, onHide: noop }));
    expect(html).not.toContain('right:80px');
    expect(html).toContain('right:clamp(160px, 22vw, 260px)');
    expect(html).toContain('pointer-events:none');
    expect(html).toContain('role="status"');
    expect(html).toContain('alt=""');
  });
});

describe('Game Log speaks plainly and hides the AI’s private cards', () => {
  it('uses names, not P1/P2 or raw codes, and redacts the hidden player', () => {
    const log = [
      { turn: 1, player: 1 as const, action: 'DRAW_CARD', details: 'Drew scale_1' },
      { turn: 1, player: 0 as const, action: 'DRAW_CARD', details: 'Drew well_2' },
      { turn: 1, player: 0 as const, action: 'END_TURN' },
    ];
    const html = renderToStaticMarkup(createElement(GameLog, { log, labels: ['You', 'Opponent'], hiddenPlayer: 1 }));
    expect(html).toContain('Opponent');
    expect(html).toContain('Drew a card');
    expect(html).not.toContain('scale_1');
    expect(html).not.toContain('Scale');
    expect(html).toContain('Drew Well');
    expect(html).toContain('end turn');
    expect(html).not.toContain('END_TURN');
    expect(html).not.toMatch(/>P[12]</);
  });
});

describe('resolve panel keeps its buttons above the hand strip', () => {
  it('reserves the strip height when the strip is shown', () => {
    const withStrip = renderToStaticMarkup(createElement(ResolveMegaView, { hand: ['well_1'], children: 'x' }));
    expect(withStrip).toContain(`padding-bottom:${HAND_STRIP_RESERVE_PX}px`);
    expect(withStrip).toContain(`calc(100dvh - 16px - ${HAND_STRIP_RESERVE_PX}px)`);
    const noStrip = renderToStaticMarkup(createElement(ResolveMegaView, { hideHandStrip: true, children: 'x' }));
    expect(noStrip).toContain('calc(100dvh - 16px - 0px)');
  });
});

describe('status pill matches the board labels', () => {
  it('says "Your turn" in solo and seat names in hotseat', () => {
    const s = { ...createTestState(), currentPlayer: 0 as const };
    const solo = renderToStaticMarkup(createElement(CenterRow, { state: s, dispatch: noopDispatch, actorLabels: ['You', 'Opponent'] }));
    expect(solo).toContain('Your turn');
    expect(solo).not.toContain('Player 1');
    const hot = renderToStaticMarkup(createElement(CenterRow, { state: { ...s, currentPlayer: 1 }, dispatch: noopDispatch, actorLabels: ['Player 1', 'Player 2'] }));
    expect(hot).toContain('Player 2&#x27;s turn');
  });
});

describe('Expert difficulty describes how it actually plays', () => {
  it('no longer claims 2-ply look-ahead', () => {
    const html = renderToStaticMarkup(createElement(PreGameSetupModal, { mode: 'solo', aiDifficulty: 'medium', onCancel: noop, onStart: noop }));
    expect(html).toContain('Simulates future turns');
    expect(html).not.toContain('2-ply');
  });
});

describe('market shows the paid 6th space', () => {
  it('marks the large stand space that costs 2g, and only that one', () => {
    const html = renderToStaticMarkup(createElement(MarketDisplay, { market: ['silk', 'tea', null, null, null, null] }));
    expect(html.match(/6th space: costs 2 gold to fill/g)).toHaveLength(1);
    const full = renderToStaticMarkup(createElement(MarketDisplay, { market: ['silk', 'tea', 'salt', 'fruit', 'hides', 'trinkets'] }));
    expect(full).not.toContain('costs 2 gold');
  });
});

describe('breadcrumbs', () => {
  it('labels an Arabian Merchant card auction', () => {
    const pr = {
      type: 'AUCTION' as const, sourceCard: 'arabian_merchant_1', wares: [], revealedCards: ['well_1'],
      currentBid: 0, currentBidder: 1 as const, nextBidder: 0 as const, passed: [false, false],
    };
    expect(formatResolutionBreadcrumb(pr)).toBe('Auction > Cards > Bidding');
    expect(formatResolutionBreadcrumb({ ...pr, revealedCards: undefined, wares: [] })).toBe('Auction > Select Wares');
    expect(formatResolutionBreadcrumb({ ...pr, revealedCards: undefined, wares: ['silk', 'tea'] })).toBe('Auction > Bidding');
  });
});

import { shouldShowResolvePanel } from '../../src/ui/gameScreenLogic.ts';

describe('resolve panel visibility during the AI turn (playtest 2026-10-04)', () => {
  it('keeps auctions visible while the AI bids (was hidden: the human never saw the cards being auctioned)', () => {
    expect(shouldShowResolvePanel(true, true, 'AUCTION')).toBe(true);
    expect(shouldShowResolvePanel(true, true, 'DRAFT')).toBe(true);
  });
  it('hides other AI-side decisions and shows everything on the human turn', () => {
    expect(shouldShowResolvePanel(true, true, 'DECK_PEEK')).toBe(false);
    expect(shouldShowResolvePanel(true, false, 'DECK_PEEK')).toBe(true);
    expect(shouldShowResolvePanel(false, false, null)).toBe(false);
  });
});
