import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { TutorialOverlay } from '../../src/ui/TutorialOverlay.tsx';
import {
  ACTIONS_PER_TURN, ATTACK_CARD, CARD_KINDS, CHAPTERS, CHAPTER_COUNT, GUARD_CARD, MARKET_SLOTS, STAND_SLOTS,
  STARTING_GOLD, TIPS, TRADE_BUY, TRADE_CARD, TRADE_COUNT, TRADE_SELL, TRADE_START, TRADE_WARE,
  TUTORIAL_SEEN_STORAGE_KEY, UTILITY_EXAMPLES, WINNING_GOLD,
  applyTrade, clampChapter, hasSeenTutorial, markTutorialSeen, tradeBlocker, tradeGuide,
} from '../../src/ui/tutorial/tutorial.ts';
import { getCard, isValidDeckCardId } from '../../src/engine/cards/CardDatabase.ts';
import { createInitialState } from '../../src/engine/GameState.ts';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

const noop = () => {};

describe('tutorial content matches the real rules', () => {
  it('starting gold, win line, actions and market sizes are the engine\'s', () => {
    const state = createInitialState(1);
    expect(state.players[0].gold).toBe(STARTING_GOLD);
    expect(state.players[0].market).toHaveLength(MARKET_SLOTS);
    expect(state.actionsLeft).toBe(ACTIONS_PER_TURN);
    expect(WINNING_GOLD).toBe(60);
  });

  it('the hands-on trade uses a real card at its real prices', () => {
    const card = getCard(TRADE_CARD);
    expect(card.wares?.types).toEqual(Array(TRADE_COUNT).fill(TRADE_WARE));
    expect(card.wares?.buyPrice).toBe(TRADE_BUY);
    expect(card.wares?.sellPrice).toBe(TRADE_SELL);
  });

  it('every card shown is a real card of the type it is shown as', () => {
    for (const id of [TRADE_CARD, ATTACK_CARD, GUARD_CARD, ...UTILITY_EXAMPLES, ...CARD_KINDS.map((k) => k.example)]) {
      expect(isValidDeckCardId(id)).toBe(true);
    }
    expect(CARD_KINDS.map((k) => getCard(k.example).type)).toEqual(['ware', 'people', 'animal', 'utility', 'stand']);
    expect(getCard(ATTACK_CARD).type).toBe('animal');
    expect(getCard(GUARD_CARD).designId).toBe('guard');
    for (const id of UTILITY_EXAMPLES) expect(getCard(id).type).toBe('utility');
    expect(getCard('small_market_stand_1').description).toContain(`${STAND_SLOTS} extra market spaces`);
  });

  it('has the goal first and the tips last, each chapter with a guide line', () => {
    expect(CHAPTERS[0].id).toBe('goal');
    expect(CHAPTERS[CHAPTER_COUNT - 1].id).toBe('tips');
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(CHAPTER_COUNT);
    for (const c of CHAPTERS) expect(c.guide.length).toBeGreaterThan(10);
    expect(TIPS).toHaveLength(3);
  });
});

describe('hands-on trade', () => {
  it('buy then sell nets the card\'s spread', () => {
    const bought = applyTrade(TRADE_START, 'buy');
    expect(bought).toMatchObject({ gold: STARTING_GOLD - TRADE_BUY, wares: TRADE_COUNT, bought: true, sold: false });
    const sold = applyTrade(bought, 'sell');
    expect(sold).toMatchObject({ gold: STARTING_GOLD - TRADE_BUY + TRADE_SELL, wares: 0, sold: true });
    expect(tradeGuide(sold).line).toContain(`+${TRADE_SELL - TRADE_BUY} gold`);
    expect(tradeGuide(sold).mood).toBe('pleased');
  });

  it('can\'t sell wares you don\'t have, and a blocked move changes nothing', () => {
    expect(tradeBlocker(TRADE_START, 'sell')).toMatch(/Buy first/);
    expect(applyTrade(TRADE_START, 'sell')).toBe(TRADE_START);
  });

  it('can\'t overfill the stall or overspend', () => {
    const twice = applyTrade(applyTrade(TRADE_START, 'buy'), 'buy');
    expect(twice.wares).toBe(MARKET_SLOTS);
    expect(tradeBlocker(twice, 'buy')).toMatch(/full/);
    expect(tradeBlocker({ ...TRADE_START, gold: TRADE_BUY - 1 }, 'buy')).toMatch(/gold/);
  });

  it('clamps chapter indices', () => {
    expect(clampChapter(-1)).toBe(0);
    expect(clampChapter(99)).toBe(CHAPTER_COUNT - 1);
    expect(clampChapter(Number.NaN)).toBe(0);
  });
});

describe('tutorial seen flag', () => {
  it('remembers being seen, and never traps the player when storage is blocked', () => {
    const s = memoryStorage();
    expect(hasSeenTutorial(s)).toBe(false);
    markTutorialSeen(s);
    expect(s.getItem(TUTORIAL_SEEN_STORAGE_KEY)).toBe('true');
    expect(hasSeenTutorial(s)).toBe(true);
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(hasSeenTutorial(blocked)).toBe(true);
    expect(() => markTutorialSeen(blocked)).not.toThrow();
  });
});

describe('tutorial overlay', () => {
  it('opens on the goal as a labelled modal with every chapter tab, a guide and a Skip', () => {
    const html = renderToStaticMarkup(createElement(TutorialOverlay, { onClose: noop }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('First to 60 gold');
    for (const c of CHAPTERS) expect(html).toContain(c.tab);
    expect(html).toContain('Mama Zawadi');
    expect(html).toContain('Skip');
    expect(html).toContain('Next: Your turn');
    expect(html).toContain('aria-current="step"');
    // only the last chapter has the gold button
    expect(html).not.toContain('class="tut-cta"');
  });
});
