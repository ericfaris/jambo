import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { GameLogEntry, GameState } from '../../src/engine/types.ts';
import {
  createTestState, toPlayPhase, act, withHand, withMarket, withGold, withUtility, removeFromDeck,
} from '../helpers/testHelpers.ts';
import {
  collectSpotlights, countUnread, groupLogByTurn, recapSinceLastMove, spotlightForEntry,
} from '../../src/ui/actionLog.ts';
import { describeLogEntry, formatLogRecap, humanizeLogDetails } from '../../src/ui/uiHints.ts';
import { shouldShowResolvePanel } from '../../src/ui/gameScreenLogic.ts';
import { ActionLogButton, ActionLogDrawer } from '../../src/ui/ActionLogDrawer.tsx';
import { OpponentPlaySpotlight, spotlightCardScale, spotlightDurationMs } from '../../src/ui/OpponentPlaySpotlight.tsx';
import { extractPublicState } from '../../src/multiplayer/stateSplitter.ts';

const LABELS = ['You', 'Opponent'] as const;
const last = (s: GameState) => s.log[s.log.length - 1];

function guardScenario() {
  let s = toPlayPhase(createTestState());
  s = withHand(s, 0, ['parrot_1']);
  s = withHand(s, 1, ['guard_1']);
  s = removeFromDeck(s, 'parrot_1');
  s = removeFromDeck(s, 'guard_1');
  s = withMarket(s, 1, ['trinkets', null, null, null, null, null]);
  return s;
}

function rainMakerScenario() {
  let s = toPlayPhase(createTestState());
  s = withHand(s, 0, ['ware_3k_1']);
  s = withHand(s, 1, ['rain_maker_1']);
  s = removeFromDeck(s, 'ware_3k_1');
  s = removeFromDeck(s, 'rain_maker_1');
  return withGold(s, 0, 20);
}

describe('engine tags face-up plays on the log', () => {
  it('tags a ware buy with the exact card played', () => {
    const s = act(rainMakerScenario(), { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' });
    const buy = s.log.find((e) => e.action === 'PLAY_WARE_BUY');
    expect(buy?.card).toBe('ware_3k_1');
    expect(buy?.player).toBe(0);
  });

  it('credits Rain Maker to the player who reacted, with their card', () => {
    let s = act(rainMakerScenario(), { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' });
    s = act(s, { type: 'WARE_CARD_REACTION', play: true });
    expect(last(s)).toMatchObject({ action: 'RAIN_MAKER_PLAYED', player: 1, card: 'rain_maker_1' });
  });

  it('credits a declined Rain Maker to the decliner', () => {
    let s = act(rainMakerScenario(), { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' });
    s = act(s, { type: 'WARE_CARD_REACTION', play: false });
    expect(last(s)).toMatchObject({ action: 'RAIN_MAKER_DECLINED', player: 1 });
    expect(last(s).card).toBeUndefined();
  });

  it('credits Guard to the defender, with the Guard card', () => {
    let s = act(guardScenario(), { type: 'PLAY_CARD', cardId: 'parrot_1' });
    expect(last(s)).toMatchObject({ action: 'PLAY_ANIMAL', player: 0, card: 'parrot_1' });
    s = act(s, { type: 'GUARD_REACTION', play: true });
    expect(last(s)).toMatchObject({ action: 'GUARD_PLAYED', player: 1, card: 'guard_1' });
  });

  it('announces an animal once, even when a Guard window came first', () => {
    let s = act(guardScenario(), { type: 'PLAY_CARD', cardId: 'parrot_1' });
    s = act(s, { type: 'GUARD_REACTION', play: false });
    const tagged = s.log.filter((e) => e.card === 'parrot_1');
    expect(tagged).toHaveLength(1);
  });

  it('tags a utility activation with the utility, but never the drawn card', () => {
    let s = toPlayPhase(createTestState());
    s = withUtility(s, 0, 'well_1', 'well');
    s = withGold(s, 0, 5);
    s = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    const entry = last(s);
    expect(entry.card).toBe('well_1');
    // the drawn card is in the details but stays hidden from the other seat
    expect(humanizeLogDetails(entry.details!, true)).toBe('Well: paid 1g, drew a card');
  });

  it('never tags a draw', () => {
    const s = act(createTestState(), { type: 'DRAW_CARD' });
    expect(last(s).action).toBe('DRAW_CARD');
    expect(last(s).card).toBeUndefined();
  });

  it('keeps the card tag in the Cast public log', () => {
    const s = act(rainMakerScenario(), { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' });
    expect(extractPublicState(s).log.some((e) => e.card === 'ware_3k_1')).toBe(true);
  });
});

describe('log text redacts only what is actually hidden', () => {
  it("names the opponent's face-up plays (it used to say \"via a card\")", () => {
    expect(humanizeLogDetails('Sold wares for 12g via ware_3k_1', true)).toBe('Sold wares for 12g via Trinket Stall');
    expect(humanizeLogDetails('Placed well_1 in play area', true)).toBe('Placed Well in play area');
  });

  it('hides draws, kept cards and Psychic picks', () => {
    expect(humanizeLogDetails('Drew parrot_1', true)).toBe('Drew a card');
    expect(humanizeLogDetails('Kept parrot_1', true)).toBe('Kept a card');
    expect(humanizeLogDetails('Peeked at 6 cards, picked lion_1', true)).toBe('Peeked at 6 cards, picked a card');
    expect(humanizeLogDetails('Drew parrot_1', false)).toBe('Drew Parrot');
  });

  it('drops engine status suffixes', () => {
    expect(describeLogEntry({ player: 1, action: 'PLAY_ANIMAL', details: 'Played Parrot - awaiting Guard reaction from opponent' }, LABELS))
      .toBe('Played Parrot');
    expect(formatLogRecap({ player: 1, action: 'PLAY_PEOPLE', details: 'Played Shaman - awaiting resolution' }, LABELS))
      .toBe('Opponent: Played Shaman');
  });
});

describe('opponent play spotlight', () => {
  const entry = (e: Partial<GameLogEntry>): GameLogEntry => ({ turn: 3, player: 1, action: 'PLAY_PEOPLE', ...e });

  it('announces tagged plays with a caption and a destination', () => {
    expect(spotlightForEntry(entry({ action: 'PLAY_WARE_SELL', details: 'Sold wares for 12g via ware_3k_1', card: 'ware_3k_1' }), 7, 'Opponent'))
      .toMatchObject({ key: 7, cardId: 'ware_3k_1', headline: 'Opponent sold wares', detail: 'Earned 12g', destination: 'discard' });
    expect(spotlightForEntry(entry({ action: 'PLAY_UTILITY', card: 'well_1' }), 0, 'Opponent'))
      .toMatchObject({ headline: 'Opponent placed Well', destination: 'utilities' });
    expect(spotlightForEntry(entry({ action: 'ACTIVATE_UTILITY', card: 'well_1' }), 0, 'Opponent'))
      .toMatchObject({ headline: 'Opponent used Well', destination: 'utilities' });
    expect(spotlightForEntry(entry({ action: 'GUARD_PLAYED', details: 'Guard cancelled Parrot', card: 'guard_1' }), 0, 'Opponent'))
      .toMatchObject({ headline: 'Opponent played Guard', detail: 'Cancelled Parrot' });
  });

  it('ignores untagged entries, so hidden draws can never be shown', () => {
    expect(spotlightForEntry(entry({ action: 'DRAW_CARD', details: 'Drew parrot_1' }), 0, 'Opponent')).toBeNull();
    expect(spotlightForEntry(entry({ action: 'PLAY_PEOPLE', card: 'not_a_card_9' }), 0, 'Opponent')).toBeNull();
  });

  it("only collects the other seat's plays after the given index", () => {
    const log: GameLogEntry[] = [
      entry({ player: 1, action: 'PLAY_PEOPLE', card: 'shaman_1' }),
      entry({ player: 0, action: 'PLAY_PEOPLE', card: 'dancer_1' }),
      entry({ player: 1, action: 'DRAW_CARD', details: 'Drew parrot_1' }),
      entry({ player: 1, action: 'PLAY_ANIMAL', card: 'parrot_1' }),
    ];
    expect(collectSpotlights(log, 1, 0, 'Opponent').map((s) => s.cardId)).toEqual(['parrot_1']);
    expect(collectSpotlights(log, 0, 0, 'Opponent').map((s) => s.key)).toEqual([0, 3]);
  });

  it('keeps each announcement short (the AI waits for it before moving on)', () => {
    expect(spotlightDurationMs(false)).toBeLessThan(2500);
    expect(spotlightDurationMs(true)).toBeLessThan(spotlightDurationMs(false));
  });

  it('does not replay history when a saved game is resumed', () => {
    const log: GameLogEntry[] = [entry({ card: 'shaman_1' })];
    const html = renderToStaticMarkup(createElement(OpponentPlaySpotlight, { log, viewer: 0, actorLabel: 'Opponent' }));
    expect(html).toBe('');
  });

  it('holds the response panel until the announcement lands', () => {
    expect(shouldShowResolvePanel(true, false, 'HAND_SWAP', true)).toBe(false);
    expect(shouldShowResolvePanel(true, false, 'HAND_SWAP', false)).toBe(true);
    expect(shouldShowResolvePanel(true, false, 'HAND_SWAP')).toBe(true);
  });
});

describe('action log drawer', () => {
  const log: GameLogEntry[] = [
    { turn: 0, player: 0, action: 'DRAW_CARD', details: 'Drew well_2' },
    { turn: 0, player: 0, action: 'AUTO_TRANSITION', details: 'No actions remaining, transitioning to PLAY phase' },
    { turn: 0, player: 0, action: 'END_TURN', details: "Turn ended. Player 2's turn begins (turn 1)" },
    { turn: 1, player: 1, action: 'DRAW_CARD', details: 'Drew scale_1' },
    { turn: 1, player: 1, action: 'PLAY_ANIMAL', details: 'Played Parrot - awaiting Guard reaction from opponent', card: 'parrot_1' },
    { turn: 1, player: 0, action: 'GUARD_PLAYED', details: 'Guard cancelled Parrot', card: 'guard_1' },
    { turn: 1, player: 1, action: 'END_TURN', details: "Turn ended. Player 1's turn begins (turn 2)" },
  ];

  it('groups newest turn first, keeps reactions inside the turn they interrupted', () => {
    const turns = groupLogByTurn(log, LABELS, 1);
    expect(turns.map((t) => [t.turn, t.owner])).toEqual([[1, 1], [0, 0]]);
    expect(turns[0].lines.map((l) => l.text)).toEqual(['Drew a card', 'Played Parrot', 'Guard cancelled Parrot', 'Ended their turn']);
    expect(turns[0].lines[2].player).toBe(0);
    expect(turns[1].lines.map((l) => l.text)).toEqual(['Drew Well', 'Ended your turn']);
  });

  it('counts unread opponent actions, not turn ends or bookkeeping', () => {
    expect(countUnread(log, 0, 1)).toBe(2);
    expect(countUnread(log, 5, 1)).toBe(0);
  });

  it('renders turns with zoomable card chips and never leaks hidden cards', () => {
    const html = renderToStaticMarkup(createElement(ActionLogDrawer, {
      open: true, onClose: () => {}, log, labels: LABELS, hiddenPlayer: 1, viewer: 0, onMegaView: () => {},
    }));
    expect(html).toContain('Opponent&#x27;s turn');
    expect(html).toContain('Turn 2');
    expect(html).toContain('Zoom Parrot');
    expect(html).toContain('You: </span>');
    expect(html).not.toContain('Scale');
    expect(html).not.toContain('AUTO_TRANSITION');
  });

  it('is hidden from assistive tech while closed', () => {
    const html = renderToStaticMarkup(createElement(ActionLogDrawer, {
      open: false, onClose: () => {}, log, labels: LABELS, hiddenPlayer: 1, viewer: 0,
    }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('log-drawer-open');
  });

  it('pinned: a docked, non-modal panel with no backdrop or close button', () => {
    const html = renderToStaticMarkup(createElement(ActionLogDrawer, {
      open: false, pinned: true, onTogglePin: () => {}, onClose: () => {}, log, labels: LABELS, hiddenPlayer: 1, viewer: 0,
    }));
    expect(html).toContain('log-drawer-pinned');
    expect(html).toContain('role="complementary"');
    expect(html).not.toContain('aria-modal');
    expect(html).not.toContain('log-drawer-backdrop');
    expect(html).not.toContain('Close action log');
    expect(html).toContain('aria-pressed="true"');
    // content renders even though the drawer was never "opened"
    expect(html).toContain('Played Parrot');
  });

  it('offers the pin only when the caller allows it (not on phones)', () => {
    const props = { open: true, onClose: () => {}, log, labels: LABELS, hiddenPlayer: 1 as const, viewer: 0 as const };
    expect(renderToStaticMarkup(createElement(ActionLogDrawer, props))).not.toContain('log-drawer-pin');
    expect(renderToStaticMarkup(createElement(ActionLogDrawer, { ...props, onTogglePin: () => {} }))).toContain('aria-pressed="false"');
  });

  it('shows an unread badge on the open button', () => {
    expect(renderToStaticMarkup(createElement(ActionLogButton, { onClick: () => {}, unread: 3 }))).toContain('3 new');
    expect(renderToStaticMarkup(createElement(ActionLogButton, { onClick: () => {}, unread: 12 }))).toContain('9+');
  });
});

describe('hotseat pass screen recap', () => {
  const seats = ['Player 1', 'Player 2'] as const;
  it("lists the other seat's moves since the viewer last acted, hiding their draws", () => {
    const log: GameLogEntry[] = [
      { turn: 0, player: 0, action: 'DRAW_CARD', details: 'Drew well_2' },
      { turn: 0, player: 0, action: 'END_TURN' },
      { turn: 1, player: 1, action: 'DRAW_CARD', details: 'Drew scale_1' },
      { turn: 1, player: 1, action: 'PLAY_WARE_BUY', details: 'Bought wares for 3g via ware_3k_1', card: 'ware_3k_1' },
      { turn: 1, player: 1, action: 'END_TURN' },
    ];
    expect(recapSinceLastMove(log, 0, seats)).toEqual(['Drew a card', 'Bought wares for 3g via Trinket Stall']);
    expect(recapSinceLastMove(log, 1, seats)).toEqual([]);
  });

  it('summarises long turns', () => {
    const log: GameLogEntry[] = Array.from({ length: 12 }, (_, i) => ({ turn: 1, player: 1 as const, action: 'X', details: `step ${i}` }));
    const recap = recapSinceLastMove(log, 0, seats, 5);
    expect(recap).toHaveLength(5);
    expect(recap[0]).toBe('…and 8 earlier actions');
    expect(recap[4]).toBe('Step 11');
  });
});

describe('spotlight card size', () => {
  it('reads as a zoom on desktop and still fits a phone', () => {
    expect(spotlightCardScale(1440, 900)).toBeGreaterThan(1.5);
    const phone = spotlightCardScale(390, 844);
    expect(180 * phone).toBeLessThanOrEqual(390 * 0.6 + 1);
    expect(spotlightCardScale(200, 200)).toBe(0.8);
  });
});
