import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { getResponder, getPendingResponder } from '../../src/engine/responder.ts';
import { InteractionPanel } from '../../src/ui/InteractionPanel.tsx';
import type { GameAction, GameState } from '../../src/engine/types.ts';
import { createTestState, toPlayPhase, withHand, act } from '../helpers/testHelpers.ts';

const noopDispatch = (_action: GameAction) => {};

function guardWindowState(): GameState {
  // P0 plays Cheetah while P1 holds a Guard → Guard reaction window for P1
  let s = toPlayPhase(createTestState());
  s = withHand(s, 0, ['cheetah_1']);
  s = withHand(s, 1, ['guard_1']);
  return act(s, { type: 'PLAY_CARD', cardId: 'cheetah_1' });
}

describe('getResponder', () => {
  it('is the current player with nothing pending', () => {
    const s = toPlayPhase(createTestState());
    expect(getResponder(s)).toBe(s.currentPlayer);
  });

  it('is the Guard holder during a Guard reaction window', () => {
    const s = guardWindowState();
    expect(s.pendingGuardReaction).not.toBeNull();
    expect(s.currentPlayer).toBe(0);
    expect(getResponder(s)).toBe(1);
  });

  it('is the opponent for OPPONENT_CHOICE (Cheetah)', () => {
    const s = act(guardWindowState(), { type: 'GUARD_REACTION', play: false });
    expect(s.pendingResolution?.type).toBe('OPPONENT_CHOICE');
    expect(getPendingResponder(s)).toBe(1);
    expect(getResponder(s)).toBe(1);
  });
});

// Regression: hotseat Multiplayer used currentPlayer as the viewer, so the
// non-active player could never answer (only "Waiting: opponent ..." showed).
describe('hotseat viewer = responder', () => {
  it('shows the Guard decision to the responding player', () => {
    const s = guardWindowState();
    const asActive = renderToStaticMarkup(createElement(InteractionPanel, { state: s, dispatch: noopDispatch, viewerPlayer: s.currentPlayer }));
    const asResponder = renderToStaticMarkup(createElement(InteractionPanel, { state: s, dispatch: noopDispatch, viewerPlayer: getResponder(s) }));
    expect(asActive).toContain('Waiting: opponent deciding Guard reaction');
    expect(asResponder).toContain('Play Guard');
  });
});
