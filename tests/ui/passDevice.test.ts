import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { needsHandoff, getHandoffReason, PassDeviceScreen } from '../../src/ui/PassDeviceScreen.tsx';
import { FirstPlayerReveal } from '../../src/ui/FirstPlayerReveal.tsx';
import { createTestState, toPlayPhase, withHand, act } from '../helpers/testHelpers.ts';

describe('hotseat pass-device screen', () => {
  it('only hands off in local multiplayer when the acting player changes', () => {
    expect(needsHandoff(true, 'PLAY', 0, 1)).toBe(true);
    expect(needsHandoff(true, 'PLAY', 1, 1)).toBe(false);
    expect(needsHandoff(false, 'PLAY', 0, 1)).toBe(false);
    expect(needsHandoff(true, 'GAME_OVER', 0, 1)).toBe(false);
  });

  it('explains a Guard handoff to the reacting player', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['cheetah_1']);
    s = withHand(s, 1, ['guard_1']);
    s = act(s, { type: 'PLAY_CARD', cardId: 'cheetah_1' });
    expect(getHandoffReason(s, 1)).toMatch(/Guard/);
    const html = renderToStaticMarkup(createElement(PassDeviceScreen, { state: s, viewerPlayer: 1, onReady: () => {} }));
    expect(html).toContain('Player 2');
    expect(html).not.toContain('guard_1');
  });

  it('first-player reveal names seats in hotseat', () => {
    const hot = renderToStaticMarkup(createElement(FirstPlayerReveal, { firstPlayer: 1, onComplete: () => {}, localMultiplayer: true }));
    const solo = renderToStaticMarkup(createElement(FirstPlayerReveal, { firstPlayer: 1, onComplete: () => {} }));
    expect(hot).toContain('Player 2 goes first');
    expect(solo).toContain('Opponent goes first');
  });
});
