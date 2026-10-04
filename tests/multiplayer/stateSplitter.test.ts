import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../src/engine/GameState.ts';
import { splitState, extractPublicState, extractPrivateState } from '../../src/multiplayer/stateSplitter.ts';
import { redactHiddenCards } from '../../src/multiplayer/stateSplitter.ts';
import type { GameState } from '../../src/engine/types.ts';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialState(42), ...overrides };
}

describe('stateSplitter', () => {
  describe('extractPublicState', () => {
    it('includes deck count but not deck contents', () => {
      const state = makeState();
      const pub = extractPublicState(state);

      expect(pub.deckCount).toBe(state.deck.length);
      // pub should not expose deck array
      expect((pub as Record<string, unknown>)['deck']).toBeUndefined();
    });

    it('includes public player fields but not hands', () => {
      const state = makeState();
      const pub = extractPublicState(state);

      expect(pub.players[0].gold).toBe(state.players[0].gold);
      expect(pub.players[0].handCount).toBe(state.players[0].hand.length);
      expect((pub.players[0] as Record<string, unknown>)['hand']).toBeUndefined();
      expect(pub.players[1].handCount).toBe(state.players[1].hand.length);
    });

    it('includes turn/phase/actions info', () => {
      const state = makeState();
      const pub = extractPublicState(state);

      expect(pub.turn).toBe(state.turn);
      expect(pub.phase).toBe(state.phase);
      expect(pub.currentPlayer).toBe(state.currentPlayer);
      expect(pub.actionsLeft).toBe(state.actionsLeft);
    });

    it('shows pendingResolutionType when resolution exists', () => {
      const state = makeState({
        pendingResolution: {
          type: 'WARE_TRADE',
          sourceCard: 'shaman_1',
          step: 'SELECT_GIVE',
        },
      });
      const pub = extractPublicState(state);
      expect(pub.pendingResolutionType).toBe('WARE_TRADE');
    });

    it('shows null pendingResolutionType when no resolution', () => {
      const state = makeState();
      const pub = extractPublicState(state);
      expect(pub.pendingResolutionType).toBeNull();
    });
  });

  describe('extractPrivateState', () => {
    it('includes own hand', () => {
      const state = makeState();
      const priv0 = extractPrivateState(state, 0);
      const priv1 = extractPrivateState(state, 1);

      expect(priv0.hand).toEqual(state.players[0].hand);
      expect(priv1.hand).toEqual(state.players[1].hand);
    });

    it('shows drawnCard only to current player in DRAW phase', () => {
      const state = makeState({
        phase: 'DRAW',
        currentPlayer: 0,
        drawnCard: 'guard_1',
      });

      const priv0 = extractPrivateState(state, 0);
      const priv1 = extractPrivateState(state, 1);

      expect(priv0.drawnCard).toBe('guard_1');
      expect(priv1.drawnCard).toBeNull();
    });

    it('hides drawnCard from current player in PLAY phase', () => {
      const state = makeState({
        phase: 'PLAY',
        currentPlayer: 0,
        drawnCard: 'guard_1',
      });

      const priv0 = extractPrivateState(state, 0);
      expect(priv0.drawnCard).toBeNull();
    });

    it('shows pendingResolution to the waiting player only', () => {
      const state = makeState({
        currentPlayer: 0,
        pendingResolution: {
          type: 'WARE_TRADE',
          sourceCard: 'shaman_1',
          step: 'SELECT_GIVE',
        },
      });

      const priv0 = extractPrivateState(state, 0);
      const priv1 = extractPrivateState(state, 1);

      expect(priv0.pendingResolution).not.toBeNull();
      expect(priv0.pendingResolution!.type).toBe('WARE_TRADE');
      expect(priv1.pendingResolution).toBeNull();
    });

    it('shows AUCTION to both players', () => {
      const state = makeState({
        currentPlayer: 0,
        pendingResolution: {
          type: 'AUCTION',
          sourceCard: 'traveling_merchant_1',
          wares: ['tea', 'silk'],
          currentBid: 0,
          currentBidder: 0,
          nextBidder: 0,
          passed: [false, false],
        },
      });

      const priv0 = extractPrivateState(state, 0);
      const priv1 = extractPrivateState(state, 1);

      // Active bidder sees full resolution
      expect(priv0.pendingResolution).not.toBeNull();
      // Non-active bidder also sees auction (special case)
      expect(priv1.pendingResolution).not.toBeNull();
      expect(priv1.pendingResolution!.type).toBe('AUCTION');
    });
  });

  describe('splitState', () => {
    it('returns both public and private', () => {
      const state = makeState();
      const result = splitState(state, 0);

      expect(result.public).toBeDefined();
      expect(result.private).toBeDefined();
      expect(result.public.deckCount).toBeGreaterThan(0);
      expect(result.private.hand.length).toBeGreaterThan(0);
    });
  });

  describe('waitingOnPlayer', () => {
    it('detects guard reaction waiting player', () => {
      const state = makeState({
        pendingGuardReaction: { animalCard: 'crocodile_1', targetPlayer: 1 },
      });
      const pub = extractPublicState(state);
      expect(pub.waitingOnPlayer).toBe(1);
    });

    it('detects OPPONENT_DISCARD waiting player', () => {
      const state = makeState({
        pendingResolution: {
          type: 'OPPONENT_DISCARD',
          sourceCard: 'tribal_elder_1',
          targetPlayer: 1,
          discardTo: 3,
        },
      });
      const pub = extractPublicState(state);
      expect(pub.waitingOnPlayer).toBe(1);
    });

    it('detects DRAFT current picker', () => {
      const state = makeState({
        currentPlayer: 0,
        pendingResolution: {
          type: 'DRAFT',
          sourceCard: 'elephant_1',
          draftMode: 'wares',
          availableWares: ['tea', 'silk'],
          currentPicker: 1,
          picks: [[], []],
        },
      });
      const pub = extractPublicState(state);
      expect(pub.waitingOnPlayer).toBe(1);
    });

    it('returns null when no pending state', () => {
      const state = makeState();
      const pub = extractPublicState(state);
      expect(pub.waitingOnPlayer).toBeNull();
    });
  });
});

describe('public log hides private card identities', () => {
  it('redacts drawn / kept / picked cards but keeps public info', () => {
    expect(redactHiddenCards({ turn: 1, player: 1, action: 'DRAW_CARD', details: 'Drew scale_1' }).details).toBe('Drew a card');
    expect(redactHiddenCards({ turn: 1, player: 1, action: 'ACTIVATE_UTILITY', details: 'Well: paid 1g, drew ware_3k_2' }).details).toBe('Well: paid 1g, drew a card');
    expect(redactHiddenCards({ turn: 1, player: 1, action: 'SCALE_EFFECT', details: 'Kept guard_1, gave well_2 to opponent' }).details).toBe('Kept a card, gave well_2 to opponent');
    expect(redactHiddenCards({ turn: 1, player: 1, action: 'DECK_PEEK', details: 'Peeked at 6 cards, picked lion_1' }).details).toBe('Peeked at 6 cards, picked a card');
    // Discards are face-up and stay visible
    expect(redactHiddenCards({ turn: 1, player: 1, action: 'DISCARD_DRAWN', details: 'Discarded parrot_2' }).details).toBe('Discarded parrot_2');
  });
});
