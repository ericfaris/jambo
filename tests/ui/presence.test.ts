import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { formatGrace, graceLeft, opponentPresenceLine, presenceDotState, presenceBannerLine } from '../../src/ui/presence.ts';
import { PresenceDot, PresenceBanner, OpponentLeftOverlay } from '../../src/ui/OnlinePresence.tsx';
import { onlineLabels, rematchStatusLine, friendServerError } from '../../src/ui/onlineScreenLogic.ts';
import { friendlyPlayError } from '../../src/ui/uiHints.ts';
import type { OnlineSeatView } from '../../src/multiplayer/types.ts';

const seat = (over: Partial<OnlineSeatView>): OnlineSeatView => ({ name: 'sam', avatarUrl: null, signedIn: false, status: 'connected', graceMsLeft: null, ...over });

describe('presence copy', () => {
  it('formats the reconnect countdown', () => {
    expect(formatGrace(272_000)).toBe('4:32');
    expect(formatGrace(299_001)).toBe('5:00');
    expect(formatGrace(9_000)).toBe('0:09');
    expect(formatGrace(0)).toBe('0:00');
    expect(formatGrace(-500)).toBe('0:00');
  });
  it('counts down from when the seat view arrived, never below zero', () => {
    const away = seat({ status: 'reconnecting', graceMsLeft: 10_000 });
    expect(graceLeft(away, 4_000)).toBe(6_000);
    expect(graceLeft(away, 60_000)).toBe(0);
    expect(graceLeft(seat({}), 0)).toBeNull();
  });
  it('says nothing while the friend is here', () => {
    expect(opponentPresenceLine(seat({}))).toBeNull();
    expect(opponentPresenceLine(seat({ status: 'reconnecting', graceMsLeft: 272_000 }))).toBe('Reconnecting… 4:32');
    expect(opponentPresenceLine(seat({ status: 'left' }))).toBe('Left the game');
  });
  it('maps statuses to dot states', () => {
    expect(presenceDotState(seat({}))).toBe('online');
    expect(presenceDotState(seat({ status: 'reconnecting', graceMsLeft: 1 }))).toBe('away');
    expect(presenceDotState(seat({ status: 'left' }))).toBe('gone');
  });
  it('the banner names the friend and their time left', () => {
    expect(presenceBannerLine('sam', seat({ status: 'reconnecting', graceMsLeft: 299_000 }), 0)).toBe('sam disconnected — holding their seat 4:59');
    expect(presenceBannerLine('sam', seat({}), 0)).toBeNull();
    expect(presenceBannerLine('sam', null, 0)).toBeNull();
  });
});

describe('presence components', () => {
  it('PresenceDot', () => {
    const html = renderToStaticMarkup(createElement(PresenceDot, { seat: seat({ status: 'reconnecting', graceMsLeft: 5 }), size: 'large' }));
    expect(html).toContain('presence-dot presence-dot-away presence-dot-large');
    expect(html).toContain('aria-label="Reconnecting"');
  });
  it('PresenceBanner: the countdown, your own connection, nothing when all is well', () => {
    const away = renderToStaticMarkup(createElement(PresenceBanner, { name: 'sam', seat: seat({ status: 'reconnecting', graceMsLeft: 120_000 }), elapsedMs: 0, selfConnected: true }));
    expect(away).toContain('presence-banner');
    expect(away).toContain('role="status"');
    expect(away).toContain('sam disconnected — holding their seat 2:00');
    const self = renderToStaticMarkup(createElement(PresenceBanner, { name: 'sam', seat: seat({}), elapsedMs: 0, selfConnected: false }));
    expect(self).toContain('Reconnecting to the server…');
    expect(renderToStaticMarkup(createElement(PresenceBanner, { name: 'sam', seat: seat({}), elapsedMs: 0, selfConnected: true }))).toBe('');
  });
  it('OpponentLeftOverlay: why the game ended, and one way home', () => {
    const left = renderToStaticMarkup(createElement(OpponentLeftOverlay, { name: 'sam', reason: 'left', onMainMenu: () => {} }));
    expect(left).toContain('sam left the game');
    expect(left).toContain('The game has ended.');
    expect(left).toContain('Main menu');
    expect(left).toContain('endgame-overlay');
    const timeout = renderToStaticMarkup(createElement(OpponentLeftOverlay, { name: 'sam', reason: 'timeout', onMainMenu: () => {} }));
    expect(timeout).toContain('sam didn&#x27;t come back');
  });
});

describe('online screen rules', () => {
  it('labels put "You" at your seat', () => {
    expect(onlineLabels(0, 'sam')).toEqual(['You', 'sam']);
    expect(onlineLabels(1, 'sam')).toEqual(['sam', 'You']);
    expect(onlineLabels(0, 'you')).toEqual(['You', 'you (friend)']);
  });
  it('rematch status from the votes', () => {
    expect(rematchStatusLine({ votes: [], slot: 0, name: 'sam', friendLeft: false })).toBeNull();
    expect(rematchStatusLine({ votes: [0], slot: 0, name: 'sam', friendLeft: false })).toBe('Waiting for sam…');
    expect(rematchStatusLine({ votes: [1], slot: 0, name: 'sam', friendLeft: false })).toBe('sam wants a rematch');
    expect(rematchStatusLine({ votes: [0, 1], slot: 1, name: 'sam', friendLeft: false })).toBeNull();
    expect(rematchStatusLine({ votes: [0], slot: 0, name: 'sam', friendLeft: true })).toBe('sam left the table');
  });
  it('server errors read like a person', () => {
    expect(friendServerError('Not your turn', 'sam', friendlyPlayError)).toBe("It's sam's move.");
    expect(friendServerError('Room not found', 'sam', friendlyPlayError)).toBeNull();
    expect(friendServerError('Invalid action PLAY_CARD: Not enough gold: need 5g, have 2g', 'sam', friendlyPlayError)).toBe('Buying costs 5g — you have 2g.');
  });
});
