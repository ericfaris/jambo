import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../src/engine/GameState.ts';
import { splitState, extractPublicState, extractPrivateState } from '../../src/multiplayer/stateSplitter.ts';
import { redactHiddenCards } from '../../src/multiplayer/stateSplitter.ts';
import type { GameState } from '../../src/engine/types.ts';
import { forEachRandomGameState } from '../helpers/randomGames.ts';

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

describe('DRAFT is public (the pool is laid face up)', () => {
  const modes = [
    { draftMode: 'wares' as const, sourceCard: 'elephant_1', availableWares: ['tea', 'silk'] as const, availableCards: undefined },
    { draftMode: 'cards' as const, sourceCard: 'ape_1', availableWares: [] as const, availableCards: ['guard_1', 'well_1'] },
    { draftMode: 'utilities' as const, sourceCard: 'lion_1', availableWares: [] as const, availableCards: ['well_1', 'boat_1'] },
  ];
  for (const m of modes) {
    it(`the non-picker sees the ${m.draftMode} draft (pool, picks, picker)`, () => {
      const state = makeState({
        currentPlayer: 0,
        pendingResolution: {
          type: 'DRAFT',
          sourceCard: m.sourceCard,
          draftMode: m.draftMode,
          availableWares: [...m.availableWares],
          ...(m.availableCards ? { availableCards: m.availableCards, cardPicks: [['kettle_1'], []] } : {}),
          currentPicker: 1,
          picks: [m.draftMode === 'wares' ? ['fruit'] : [], []],
        },
      });
      const nonPicker = extractPrivateState(state, 0);
      expect(nonPicker.pendingResolution).toEqual(state.pendingResolution);
      const picker = extractPrivateState(state, 1);
      expect(picker.pendingResolution).toEqual(state.pendingResolution);
    });
  }
});

describe('property: a split view never leaks hidden cards', () => {
  const FORBIDDEN_KEYS = ['deck', 'rngSeed', 'rngState', 'cancellableAction', 'restore', 'crocodileCleanup'];

  function keysIn(value: unknown, out: Set<string>): Set<string> {
    if (Array.isArray(value)) value.forEach((v) => keysIn(v, out));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) { out.add(k); keysIn(v, out); }
    }
    return out;
  }

  /** Every string value in `value`, with its path. */
  function stringsIn(value: unknown, path: string, out: Array<{ path: string; text: string }>): typeof out {
    if (typeof value === 'string') out.push({ path, text: value });
    else if (Array.isArray(value)) value.forEach((v, i) => stringsIn(v, `${path}[${i}]`, out));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) stringsIn(v, `${path}.${k}`, out);
    }
    return out;
  }

  it('over 30 random games, at every state, for both seats', () => {
    const problems: string[] = [];
    let checked = 0;
    let prevLogLength = 0;
    // Every card id each seat has legitimately seen so far this game
    let seen: [Set<string>, Set<string>] = [new Set(), new Set()];
    forEachRandomGameState(30, 61000, ({ game, step, state, action }) => {
      if (step === 0) seen = [new Set(), new Set()];
      // A log line is checked once, when it is written: an old "Discarded X"
      // stays true history after X is reshuffled into the deck.
      // (A cancel restores a shorter log plus one "Cancelled" line.)
      const firstNewLog = step === 0 ? 0 : state.log.length < prevLogLength ? state.log.length - 1 : prevLogLength;
      prevLogLength = state.log.length;
      for (const slot of [0, 1] as const) {
        const view = splitState(state, slot);
        checked++;
        const ctx = `game ${game} step ${step} turn ${state.turn} after ${action ? JSON.stringify(action).slice(0, 80) : 'deal'} (slot ${slot})`;

        // (a) structural: nothing secret by name
        const keys = keysIn({ ...view, public: { ...view.public, log: [] } }, new Set());
        for (const k of FORBIDDEN_KEYS) if (keys.has(k)) problems.push(`${ctx}: key "${k}" present`);
        for (const p of view.public.players) if ('hand' in p) problems.push(`${ctx}: public player has a hand`);

        // (b) no hidden card id anywhere it isn't sanctioned
        const hidden = new Set<string>([...state.players[1 - slot].hand, ...state.deck]);
        const waiting = view.public.waitingOnPlayer === slot;
        const strings = stringsIn({ ...view, public: { ...view.public, log: [] } }, 'view', []);
        for (const { path, text } of strings) {
          const sanctioned =
            path.startsWith('view.public.discardPile') ||
            /^view\.public\.players\[\d\]\.utilities/.test(path) ||
            path.startsWith('view.public.pendingGuardReaction') ||
            path.startsWith('view.public.pendingWareCardReaction') ||
            (path.startsWith('view.private.pendingResolution') &&
              (waiting || state.pendingResolution?.type === 'DRAFT' || state.pendingResolution?.type === 'AUCTION')) ||
            (waiting && (path.startsWith('view.private.revealedCards') || path.startsWith('view.private.revealedHand')));
          if (!sanctioned && hidden.has(text)) problems.push(`${ctx}: ${path} = hidden ${text}`);
          if (sanctioned || path.startsWith('view.private.hand') || path.startsWith('view.private.drawnCard')) seen[slot].add(text);
        }
        for (const entry of view.public.log) if (entry.card) seen[slot].add(entry.card);
        // A new line may name a card the viewer already knew (their own hand,
        // the face-up discard pile) even if it's hidden now — Hyena, Rain Maker
        view.public.log.forEach((entry, i) => {
          if (i < firstNewLog) return;
          // entry.card is a face-up reveal by design; the viewer knows what they did themselves
          if (entry.player === slot || !entry.details) return;
          // Face-up by the rules: a discard, and the ware Supplies finds ("the ware found is revealed")
          const details = entry.details.replace(/\b(Discarded|found) \w+/g, '$1');
          for (const id of hidden) {
            if (seen[slot].has(id)) continue;
            if (new RegExp(`\\b${id}\\b`).test(details)) problems.push(`${ctx}: log[${i}].details names hidden ${id}: "${entry.details}"`);
          }
        });
      }
    });
    expect(checked).toBeGreaterThan(5000);
    expect(problems.slice(0, 15)).toEqual([]);
  }, 60_000);

  it('a cancellable resolution never sends the snapshot', () => {
    let seen = 0;
    forEachRandomGameState(10, 62000, ({ state }) => {
      if (!state.cancellableAction) return;
      seen++;
      for (const slot of [0, 1] as const) {
        const json = JSON.stringify(splitState(state, slot));
        expect(json).not.toContain('"restore"');
        expect(json).not.toContain('"cancellableAction"');
      }
    });
    expect(seen).toBeGreaterThan(0);
  });
});
