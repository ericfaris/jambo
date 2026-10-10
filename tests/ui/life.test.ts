import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  countUpFrame,
  justSpentPips,
  deckThicknessShadow,
  discardGhostPoses,
  ActionPips,
  GoldCount,
  OpponentHandFan,
  AmbientLayer,
} from '../../src/ui/life.tsx';
import { HandDisplay } from '../../src/ui/HandDisplay.tsx';
import { CardFace } from '../../src/ui/CardFace.tsx';
import { MarketDisplay } from '../../src/ui/MarketDisplay.tsx';
import { OpponentArea } from '../../src/ui/OpponentArea.tsx';
import { SpeechBubble } from '../../src/ui/SpeechBubble.tsx';
import { createTestState } from '../helpers/testHelpers.ts';

describe('living table helpers', () => {
  it('count-up eases from the old value to the new one and lands exactly', () => {
    expect(countUpFrame(20, 32, 0)).toBe(20);
    expect(countUpFrame(20, 32, 1)).toBe(32);
    expect(countUpFrame(20, 32, 5)).toBe(32);
    const mid = countUpFrame(20, 32, 0.5);
    expect(mid).toBeGreaterThan(26); // ease-out: past halfway at t=0.5
    expect(mid).toBeLessThan(32);
    expect(countUpFrame(30, 18, 1)).toBe(18);
  });

  it('only pips spent by the latest change pop', () => {
    expect(justSpentPips(5, 4)).toEqual([4]);
    expect(justSpentPips(4, 2)).toEqual([2, 3]);
    expect(justSpentPips(2, 5)).toEqual([]); // new turn refills, nothing pops
    expect(justSpentPips(3, 3)).toEqual([]);
  });

  it('the deck stack thins as the deck shrinks and vanishes when empty', () => {
    expect(deckThicknessShadow(0)).toBe('none');
    const layers = (s: string) => s.split('px 0 ').length - 1;
    expect(layers(deckThicknessShadow(100))).toBe(8);
    expect(layers(deckThicknessShadow(30))).toBe(3);
    expect(layers(deckThicknessShadow(1))).toBe(1);
  });

  it('the discard pile shows up to two loose cards beneath the top one', () => {
    expect(discardGhostPoses(0)).toHaveLength(0);
    expect(discardGhostPoses(1)).toHaveLength(0);
    expect(discardGhostPoses(2)).toHaveLength(1);
    expect(discardGhostPoses(40)).toHaveLength(2);
  });
});

describe('living table components', () => {
  const deck = createTestState().deck;

  it('ActionPips marks spent pips and keeps five', () => {
    const html = renderToStaticMarkup(createElement(ActionPips, { actionsLeft: 3 }));
    expect(html.match(/class="action-pip[ "]/g)).toHaveLength(5);
    expect(html.match(/action-pip-spent/g)).toHaveLength(2);
  });

  it('GoldCount renders the value with a g suffix', () => {
    expect(renderToStaticMarkup(createElement(GoldCount, { value: 42 }))).toContain('>42g<');
  });

  it("the opponent's hand fan caps how many backs it draws", () => {
    const html = renderToStaticMarkup(createElement(OpponentHandFan, { count: 20 }));
    expect(html.match(/opp-hand-card/g)).toHaveLength(9);
    expect(renderToStaticMarkup(createElement(OpponentHandFan, { count: 0 }))).not.toContain('opp-hand-card');
    expect(renderToStaticMarkup(createElement(OpponentHandFan, { count: 3, thinking: true }))).toContain('opp-hand-fan-thinking');
  });

  it('the ambient layer is decorative only', () => {
    const html = renderToStaticMarkup(createElement(AmbientLayer));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('ambient-lamp');
  });

  it('hand cards breathe on their own phase, and the desktop hand fans out', () => {
    const html = renderToStaticMarkup(createElement(HandDisplay, { hand: deck.slice(0, 5) }));
    expect(html.match(/class="hand-card"/g)).toHaveLength(5);
    expect(html).toContain('hand-card-inner');
    expect(html).toContain('--i:4');
    expect(html).toContain('--fan-rot:-3.60deg'); // 5 cards: 1.8° per step, outermost is 2 steps out
    expect(html).toContain('--fan-rot:0.00deg');
  });

  it('fitted (phone) hands never fan — the fit math assumes upright cards', () => {
    const html = renderToStaticMarkup(createElement(HandDisplay, { hand: deck.slice(0, 6), layoutMode: 'fitRows', rows: 2 }));
    expect(html).not.toContain('--fan-rot');
  });

  it('a playable hand is marked live; a locked one is not', () => {
    const live = renderToStaticMarkup(createElement(HandDisplay, { hand: deck.slice(0, 2), onPlayCard: () => {} }));
    expect(live).toContain('class="hand-live"');
    const locked = renderToStaticMarkup(createElement(HandDisplay, { hand: deck.slice(0, 2), onPlayCard: () => {}, disabled: true }));
    expect(locked).not.toContain('hand-live');
  });

  it('cards get hover physics only when they can be played (CSS, not JS handlers)', () => {
    const playable = renderToStaticMarkup(createElement(CardFace, { cardId: deck[0], onClick: () => {} }));
    expect(playable).toContain('card-face-playable');
    const inert = renderToStaticMarkup(createElement(CardFace, { cardId: deck[0] }));
    expect(inert).toContain('card-face');
    expect(inert).not.toContain('card-face-playable');
  });

  it('market wares settle into their slots; empty slots are wells', () => {
    const html = renderToStaticMarkup(createElement(MarketDisplay, { market: ['tea', null, 'silk', null, null, null] }));
    expect(html.match(/ware-in-slot/g)).toHaveLength(2);
    expect(html.match(/class="market-slot/g)).toHaveLength(6);
    // interactive/dashed variants (dialogs, TV) keep their flat look
    const dashed = renderToStaticMarkup(createElement(MarketDisplay, { market: ['tea', null], dashedBorder: true }));
    expect(dashed).not.toContain('market-slot"');
  });

  it("desktop opponent panel reserves 3 utility spaces so the board can't jump", () => {
    const player = createTestState().players[1];
    const html = renderToStaticMarkup(createElement(OpponentArea, { player: { ...player, utilities: [] } }));
    expect(html.match(/border:2px dashed/g)?.length).toBe(3);
    expect(html).toContain('opp-hand-fan');
  });

  it('the AI speech bubble is a styled element, not the old comic-bubble PNG', () => {
    const html = renderToStaticMarkup(createElement(SpeechBubble, { message: 'Hello', visible: true, onHide: () => {} }));
    expect(html).toContain('speech-bubble');
    expect(html).not.toContain('speech_bubble.png');
  });
});

describe('ambient motion setting', () => {
  beforeEach(() => {
    // node test env: no DOM; the helpers must not throw without one
  });
  it('applyAmbient/getInitialAmbient are safe without a DOM', async () => {
    const { applyAmbient, getInitialAmbient } = await import('../../src/ui/life.tsx');
    expect(() => applyAmbient(false)).not.toThrow();
    expect(getInitialAmbient()).toBe(true);
  });
});
