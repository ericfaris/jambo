import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MarketDisplay, marketStands } from '../../src/ui/MarketDisplay.tsx';
import { UtilityArea } from '../../src/ui/UtilityArea.tsx';
import { SeatInfo } from '../../src/ui/SeatInfo.tsx';
import { HandDisplay } from '../../src/ui/HandDisplay.tsx';
import { OpponentArea } from '../../src/ui/OpponentArea.tsx';
import { TableauCorners } from '../../src/ui/Tableau.tsx';
import { ALL_DECK_CARD_IDS, getCard } from '../../src/engine/cards/CardDatabase.ts';
import { createTestState } from '../helpers/testHelpers.ts';
import type { UtilityDesignId, WareType } from '../../src/engine/types.ts';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('player tableau', () => {
  it('groups market slots into the large stand, then 3 per small stand', () => {
    expect(marketStands(6)).toEqual([[0, 1, 2, 3, 4, 5]]);
    expect(marketStands(9)).toEqual([[0, 1, 2, 3, 4, 5], [6, 7, 8]]);
    expect(marketStands(12)).toEqual([[0, 1, 2, 3, 4, 5], [6, 7, 8], [9, 10, 11]]);
    expect(marketStands(21).flat()).toEqual(Array.from({ length: 21 }, (_, i) => i));
  });

  it('the board market sits on a shelf per stand and keeps every flight anchor', () => {
    const market: (WareType | null)[] = ['tea', 'silk', null, null, null, null, 'salt', null, null];
    const out = html(createElement(MarketDisplay, { market, owner: 0 }));
    expect(out.match(/class="market-stand /g)).toHaveLength(2);
    expect(out).toContain('market-stand-large');
    expect(out).toContain('market-stand-small');
    expect(out.match(/market-stand-shelf/g)).toHaveLength(2);
    for (let i = 0; i < market.length; i++) expect(out).toContain(`data-market-slot="0-${i}"`);
  });

  it('copies in dialogs and the compact phone row stay one flat row (fit math assumes it)', () => {
    const market: (WareType | null)[] = ['tea', null, null, null, null, null, null, null, null];
    expect(html(createElement(MarketDisplay, { market, onSlotClick: () => {} }))).not.toContain('market-stand');
    expect(html(createElement(MarketDisplay, { market, owner: 0, compact: true }))).not.toContain('market-stand');
    expect(html(createElement(MarketDisplay, { market, owner: 1, columns: 5 }))).not.toContain('market-stand');
  });

  it('filled wells carry their ware colour; selection and the 2g space are classes, not inline borders', () => {
    const out = html(createElement(MarketDisplay, { market: ['silk', null, null, null, null, null], onSlotClick: () => {}, selectedSlots: [0] }));
    expect(out).toContain('market-slot market-slot-filled market-slot-selected');
    expect(out).toContain('--ware-c:var(--ware-silk)');
    expect(out).toContain('market-slot-fee');
    expect(out).not.toContain('2px solid');
  });

  it('the TV/dashed market keeps its flat look', () => {
    const out = html(createElement(MarketDisplay, { market: ['tea', null], dashedBorder: true }));
    expect(out).not.toMatch(/class="market-slot[ "]/);
    expect(out).toContain('dashed');
  });

  it('section labels can carry a count chip', () => {
    expect(html(createElement(MarketDisplay, { market: ['tea', null, null, null, null, null], label: 'Your Market', labelAside: '1/6' })))
      .toContain('<span class="tableau-count">1/6</span>');
    expect(html(createElement(UtilityArea, { utilities: [], label: 'Your Utilities', labelAside: '0/3', maxSlots: 3 })))
      .toContain('<span class="tableau-count">0/3</span>');
    // no chip unless asked for
    expect(html(createElement(MarketDisplay, { market: [null], label: 'Market' }))).not.toContain('tableau-count');
  });

  it('empty utility spaces are sockets with an embossed mark', () => {
    const well = ALL_DECK_CARD_IDS.find((id) => getCard(id).designId === 'well')!;
    const out = html(createElement(UtilityArea, {
      utilities: [{ cardId: well, designId: 'well' as UtilityDesignId, usedThisTurn: false }],
      maxSlots: 3,
    }));
    expect(out.match(/class="empty-card-slot"/g)).toHaveLength(2);
    expect(out.match(/empty-card-slot-mark/g)).toHaveLength(2);
  });

  it('the seat shows a coin beside the gold and lights the name on its turn', () => {
    const mine = html(createElement(SeatInfo, { seat: 0, label: 'You · your turn', gold: 31, handCount: 2, isActive: true }));
    expect(mine).toContain('seat-coin');
    expect(mine).toContain('seat-name seat-name-active');
    expect(mine).toContain('data-gold-anchor="0"');
    expect(mine).toContain('aria-label="31 gold"');
    const idle = html(createElement(SeatInfo, { seat: 1, label: 'Kito', gold: 8, handCount: 2 }));
    expect(idle).not.toContain('seat-name-active');
  });

  it('the hand mat replaces the dashed box', () => {
    const deck = createTestState().deck.slice(0, 3);
    const mat = html(createElement(HandDisplay, { hand: deck, mat: true }));
    expect(mat).toContain('hand-mat');
    expect(mat).not.toContain('1px dashed');
    expect(html(createElement(HandDisplay, { hand: deck }))).toContain('1px dashed');
  });

  it('the opponent panel no longer draws its own inner frame (the tableau frames it)', () => {
    const out = html(createElement(OpponentArea, { player: createTestState().players[1], seat: 1 }));
    expect(out).not.toContain('etched-wood-border');
    expect(out).toContain('market-stand');
  });

  it('corner brackets are decorative only', () => {
    const out = html(createElement(TableauCorners));
    expect(out.match(/tableau-corner /g)).toHaveLength(4);
    expect(out.match(/aria-hidden="true"/g)).toHaveLength(4);
  });
});
