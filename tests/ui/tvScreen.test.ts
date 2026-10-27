import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { TVScreen, tvWaitingMessage, tvRematchStatus, tvMarketSlotSize, TV_LABELS } from '../../src/ui/TVScreen.tsx';
import { toTvBoardState, HIDDEN_CARD_ID } from '../../src/ui/onlineView.ts';
import { shouldSweepTurn } from '../../src/ui/TurnSweep.tsx';
import { spotlightCoversDiscard } from '../../src/ui/trailPath.ts';
import { trimSpotlightBacklog } from '../../src/ui/OpponentPlaySpotlight.tsx';
import { extractPublicState } from '../../src/multiplayer/stateSplitter.ts';
import type { PublicGameState } from '../../src/multiplayer/types.ts';
import type { WebSocketGameState } from '../../src/multiplayer/client.ts';
import { createTestState, toPlayPhase } from '../helpers/testHelpers.ts';
import { forEachRandomGameState } from '../helpers/randomGames.ts';

function wsFor(pub: PublicGameState, extra: Partial<WebSocketGameState> = {}): WebSocketGameState {
  return {
    connected: true, roomCode: '1234', castAccessToken: 'token-123', playerSlot: null, roomMode: 'pvp', roomKind: 'cast',
    seats: null, seatsReceivedAt: null, abandoned: null, story: null, gameNumber: null,
    publicState: pub, privateState: null, audioEvent: null, aiMessage: null, error: null,
    gameOver: pub.phase === 'GAME_OVER', playerJoined: null, playerDisconnected: null, rematchVotes: [], rematchRequired: [],
    createRoom: () => {}, joinRoom: () => {}, leaveRoom: async () => {}, resetRoomState: () => {}, sendAction: () => {},
    requestRematch: () => {}, clearError: () => {}, clearAudioEvent: () => {},
    ...extra,
  };
}

describe('toTvBoardState — the TV sees only public state', () => {
  it('over 20 random games: both hands and the deck are placeholders of the right length; the rest is the real state', () => {
    const problems: string[] = [];
    forEachRandomGameState(20, 88000, ({ game, step, state }) => {
      const board = toTvBoardState(extractPublicState(state));
      const ctx = `game ${game} step ${step}`;
      for (const p of [0, 1] as const) {
        if (board.players[p].hand.length !== state.players[p].hand.length) problems.push(`${ctx}: hand length ${p}`);
        if (board.players[p].hand.some((id) => id !== HIDDEN_CARD_ID)) problems.push(`${ctx}: hand ${p} not hidden`);
        if (board.players[p].gold !== state.players[p].gold) problems.push(`${ctx}: gold ${p}`);
      }
      if (board.deck.length !== state.deck.length || board.deck.some((id) => id !== HIDDEN_CARD_ID)) problems.push(`${ctx}: deck`);
      if (board.pendingResolution !== null || board.drawnCard !== null) problems.push(`${ctx}: private resolution/draw leaked`);
    });
    expect(problems.slice(0, 5)).toEqual([]);
  });
});

describe('TV status lines', () => {
  const pub = extractPublicState(toPlayPhase(createTestState()));

  it('says nothing when nobody is being waited on', () => {
    expect(tvWaitingMessage(pub)).toBeNull();
  });

  it('names the seat a reaction or resolution waits on, never the hidden card', () => {
    expect(tvWaitingMessage({ ...pub, pendingGuardReaction: { animalCard: 'parrot_1', targetPlayer: 1 } })).toBe('Player 2 may answer with a Guard…');
    expect(tvWaitingMessage({ ...pub, pendingWareCardReaction: { wareCardId: 'ware_3k_1', targetPlayer: 0 } })).toBe('Player 1 may answer with a Rain Maker…');
    expect(tvWaitingMessage({ ...pub, pendingResolutionType: 'DRAFT', waitingOnPlayer: 1 })).toBe('Player 2 is picking…');
    expect(tvWaitingMessage({ ...pub, pendingResolutionType: 'AUCTION', waitingOnPlayer: 0 })).toBe('Player 1 is bidding…');
    expect(tvWaitingMessage({ ...pub, pendingResolutionType: 'WARE_TRADE', waitingOnPlayer: 0 })).toBe('Player 1 is choosing wares…');
    expect(tvWaitingMessage({ ...pub, pendingResolutionType: 'DECK_PEEK', waitingOnPlayer: 1 })).toBe('Player 2 is choosing…');
    expect(tvWaitingMessage({ ...pub, pendingResolutionType: 'DECK_PEEK', waitingOnPlayer: null })).toBe('Resolving…');
  });

  it('is quiet once the game is over', () => {
    expect(tvWaitingMessage({ ...pub, phase: 'GAME_OVER', pendingResolutionType: 'DRAFT', waitingOnPlayer: 1 })).toBeNull();
  });

  it('rematch: who still has to vote on their phone', () => {
    expect(tvRematchStatus('PLAY', [0, 1], [])).toBeNull();
    expect(tvRematchStatus('GAME_OVER', [], [])).toBeNull();
    expect(tvRematchStatus('GAME_OVER', [0, 1], [0])).toBe('Rematch? Waiting for Player 2 to vote on their phone…');
    expect(tvRematchStatus('GAME_OVER', [0, 1], [0, 1])).toBe('Starting the rematch…');
  });
});

describe('TV board render', () => {
  it('shows both seats on the desktop tableau, top = Player 2, bottom = Player 1', () => {
    const pub = extractPublicState(toPlayPhase(createTestState()));
    const html = renderToStaticMarkup(createElement(TVScreen, { ws: wsFor(pub) }));
    const top = html.indexOf('data-center-target="top"');
    const bottom = html.indexOf('data-center-target="bottom"');
    expect(top).toBeGreaterThan(-1);
    expect(bottom).toBeGreaterThan(top);
    expect(html.slice(top, bottom)).toContain('Player 2');
    expect(html.slice(bottom)).toContain('Player 1');
    expect(html).toContain('tableau-corner');
    expect(html).toContain('ware-supply-tray');
    // the turn plaque names the seat, never "Your turn"
    expect(html).toContain(`${TV_LABELS[pub.currentPlayer]}&#x27;s turn`);
    expect(html).not.toContain('Your turn');
    expect(html).not.toContain(HIDDEN_CARD_ID);
  });

  it('has no rematch or menu buttons (the TV has nothing to press)', () => {
    const pub = extractPublicState({ ...toPlayPhase(createTestState()), phase: 'GAME_OVER' });
    const html = renderToStaticMarkup(createElement(TVScreen, { ws: wsFor(pub, { rematchRequired: [0, 1], rematchVotes: [1] }) }));
    expect(html).toContain('endgame-overlay');
    expect(html).not.toContain('<button');
    expect(html).toContain('Waiting for Player 1 to vote on their phone');
  });

  it('renders nothing before the room syncs', () => {
    expect(renderToStaticMarkup(createElement(TVScreen, { ws: { ...wsFor(extractPublicState(createTestState())), publicState: null } }))).toBe('');
  });
});

describe('both seats spotlit (TV)', () => {
  it('the turn sweep fires on every hand-over when there is no viewer', () => {
    const s = (currentPlayer: 0 | 1, turn: number) => ({ currentPlayer, turn, phase: 'DRAW' as const, endgame: null });
    expect(shouldSweepTurn(s(0, 3), s(1, 4), null)).toBe(true);
    expect(shouldSweepTurn(s(1, 3), s(0, 4), null)).toBe(true);
    expect(shouldSweepTurn(s(0, 3), s(0, 3), null)).toBe(false);
    expect(shouldSweepTurn(null, s(0, 1), null)).toBe(false);
  });

  it('a spotlight for both seats covers either seat’s discard trail', () => {
    expect(spotlightCoversDiscard({ card: 'guard_1', player: 0 }, 'both')).toBe(true);
    expect(spotlightCoversDiscard({ card: 'guard_1', player: 1 }, 'both')).toBe(true);
    expect(spotlightCoversDiscard({ card: undefined, player: 1 }, 'both')).toBe(false);
    expect(spotlightCoversDiscard({ card: 'guard_1', player: 1 }, 0)).toBe(false);
  });
});

describe('TV spotlight backlog', () => {
  it('keeps the card on screen and the newest plays, dropping the ones between', () => {
    expect(trimSpotlightBacklog([1, 2, 3], 2)).toEqual([1, 2, 3]);
    expect(trimSpotlightBacklog([1, 2, 3, 4, 5, 6], 2)).toEqual([1, 5, 6]);
    expect(trimSpotlightBacklog([1], 0)).toEqual([1]);
    expect(trimSpotlightBacklog([1, 2, 3], 0)).toEqual([1]);
  });

  it('without a limit (solo, online) nothing is dropped', () => {
    expect(trimSpotlightBacklog([1, 2, 3, 4, 5, 6], undefined)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('TV market fits 720p', () => {
  it('slots shrink once a market passes 15 spaces (a fourth row of stands)', () => {
    expect(tvMarketSlotSize(6)).toBe(56);
    expect(tvMarketSlotSize(15)).toBe(56);
    expect(tvMarketSlotSize(18)).toBe(44);
    expect(tvMarketSlotSize(21)).toBe(44);
  });
});
