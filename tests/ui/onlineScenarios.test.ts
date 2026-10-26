import { describe, it, expect } from 'vitest';
import {
  ONLINE_SCENARIOS,
  stageOnlineScenario,
  stageViewerExtras,
  parseOnlinePreviewParams,
  previewSeats,
  PREVIEW_GRACE_MS,
} from '../../src/ui/onlineScenarios.ts';
import type { OnlineScenario } from '../../src/ui/onlineScenarios.ts';
import { createStartingState } from '../../src/persistence/replayLog.ts';
import { checkInvariants } from '../../src/engine/validation/invariants.ts';
import { validateAction, validatePlayCard, validateActivateUtility } from '../../src/engine/validation/actionValidator.ts';
import { processAction } from '../../src/engine/GameEngine.ts';
import { getResponder } from '../../src/engine/responder.ts';
import { getCard } from '../../src/engine/cards/CardDatabase.ts';
import type { CardDesignId, GameState } from '../../src/engine/types.ts';

const SEEDS = [1, 7, 42, 2026, 90210];
const SEATS = [0, 1] as const;

function handCard(state: GameState, seat: 0 | 1, design: CardDesignId) {
  const id = state.players[seat].hand.find((c) => getCard(c).designId === design);
  if (!id) throw new Error(`seat ${seat} holds no ${design}`);
  return id;
}

/** The card the viewer is meant to open each viewer-driven scenario with. */
const OPENER: Partial<Record<OnlineScenario, CardDesignId>> = {
  elephant: 'elephant',
  ape: 'ape',
  lion: 'lion',
  auction: 'traveling_merchant',
  arabian: 'arabian_merchant',
};

describe('stageOnlineScenario — dev preview tables', () => {
  for (const scenario of ONLINE_SCENARIOS) {
    for (const viewer of SEATS) {
      it(`${scenario} as seat ${viewer}: invariants hold and the base is untouched`, () => {
        for (const seed of SEEDS) {
          for (const first of SEATS) {
            const base = createStartingState(seed, first);
            const snapshot = JSON.stringify(base);
            const { state } = stageOnlineScenario(base, scenario, viewer);
            expect(checkInvariants(state).filter((v) => v.severity === 'error')).toEqual([]);
            expect(JSON.stringify(base)).toBe(snapshot);
          }
        }
      });
    }
  }

  for (const viewer of SEATS) {
    const other: 0 | 1 = viewer === 0 ? 1 : 0;

    it(`guard (seat ${viewer}): the friend's Parrot asks you for a Guard`, () => {
      for (const seed of SEEDS) {
        const { state, script } = stageOnlineScenario(createStartingState(seed, 0), 'guard', viewer);
        expect(getResponder(state)).toBe(other);
        expect(script).toHaveLength(1);
        expect(validateAction(state, script[0]!).valid).toBe(true);
        const after = processAction(state, script[0]!);
        expect(after.pendingGuardReaction?.targetPlayer).toBe(viewer);
        expect(getResponder(after)).toBe(viewer);
        handCard(after, viewer, 'guard');
      }
    });

    it(`rainmaker (seat ${viewer}): the friend's ware buy offers you the Rain Maker`, () => {
      for (const seed of SEEDS) {
        const { state, script } = stageOnlineScenario(createStartingState(seed, 0), 'rainmaker', viewer);
        expect(validateAction(state, script[0]!).valid).toBe(true);
        const after = processAction(state, script[0]!);
        expect(after.pendingWareCardReaction?.targetPlayer).toBe(viewer);
      }
    });

    for (const [scenario, design] of Object.entries(OPENER) as [OnlineScenario, CardDesignId][]) {
      it(`${scenario} (seat ${viewer}): it's your play and the ${design} is playable`, () => {
        for (const seed of SEEDS) {
          const { state, script } = stageOnlineScenario(createStartingState(seed, 1), scenario, viewer);
          expect(script).toEqual([]);
          expect(state.phase).toBe('PLAY');
          expect(getResponder(state)).toBe(viewer);
          const id = handCard(state, viewer, design);
          expect(validatePlayCard(state, id).valid).toBe(true);
          const after = processAction(state, { type: 'PLAY_CARD', cardId: id });
          // Animals: the friend holds no Guard, so the draft opens straight away
          expect(after.pendingGuardReaction).toBeNull();
          expect(after.pendingResolution).not.toBeNull();
        }
      });
    }

    it(`cancel (seat ${viewer}): Boat starts and ✕ restores the table exactly`, () => {
      for (const seed of SEEDS) {
        const { state } = stageOnlineScenario(createStartingState(seed, 0), 'cancel', viewer);
        const boat = state.players[viewer].utilities.findIndex((u) => u.designId === 'boat');
        expect(boat).toBeGreaterThanOrEqual(0);
        expect(validateActivateUtility(state, boat).valid).toBe(true);
        expect(state.players[viewer].utilities.some((u) => u.designId === 'throne')).toBe(true);
        expect(validatePlayCard(state, handCard(state, viewer, 'shaman')).valid).toBe(true);
        const started = processAction(state, { type: 'ACTIVATE_UTILITY', utilityIndex: boat });
        expect(started.pendingResolution).not.toBeNull();
        const cancelled = processAction(started, { type: 'CANCEL_ACTION' });
        expect(cancelled.players).toEqual(state.players);
        expect(cancelled.actionsLeft).toBe(state.actionsLeft);
        expect(cancelled.pendingResolution).toBeNull();
      }
    });

    it(`tribalelder (seat ${viewer}): the friend's Tribal Elder leaves you picking discards`, () => {
      for (const seed of SEEDS) {
        const staged = stageOnlineScenario(createStartingState(seed, 0), 'tribalelder', viewer);
        let s = staged.state;
        const { script } = staged;
        expect(s.players[viewer].hand.length).toBeGreaterThan(3);
        for (const action of script) {
          expect(validateAction(s, action).valid).toBe(true);
          s = processAction(s, action);
        }
        expect(s.pendingResolution).toMatchObject({ type: 'OPPONENT_DISCARD', targetPlayer: viewer, discardTo: 3 });
        expect(getResponder(s)).toBe(viewer);
      }
    });

    it(`endgame (seat ${viewer}): one salt sale takes you past 60g`, () => {
      for (const seed of SEEDS) {
        const { state } = stageOnlineScenario(createStartingState(seed, 0), 'endgame', viewer);
        const id = handCard(state, viewer, 'ware_3s');
        expect(validatePlayCard(state, id, 'sell').valid).toBe(true);
        let after = processAction(state, { type: 'PLAY_CARD', cardId: id, wareMode: 'sell' });
        // the friend may answer with a Rain Maker — decline it
        if (after.pendingWareCardReaction) {
          after = processAction(after, { type: 'WARE_CARD_REACTION', play: false });
        }
        expect(after.players[viewer].gold).toBeGreaterThanOrEqual(60);
      }
    });
  }
});

describe('stageViewerExtras — layout stress from the deck', () => {
  it('grows the viewer hand and utilities without breaking invariants', () => {
    for (const viewer of SEATS) {
      const base = createStartingState(42, 0);
      const s = stageViewerExtras(base, viewer, 20, 3);
      expect(s.players[viewer].hand).toHaveLength(20);
      expect(s.players[viewer].utilities).toHaveLength(3);
      expect(s.players[viewer === 0 ? 1 : 0]).toEqual(base.players[viewer === 0 ? 1 : 0]);
      expect(checkInvariants(s).filter((v) => v.severity === 'error')).toEqual([]);
    }
  });

  it('is a no-op at zero', () => {
    const base = createStartingState(42, 0);
    expect(stageViewerExtras(base, 0, 0, 0)).toEqual(base);
  });
});

describe('parseOnlinePreviewParams', () => {
  it('defaults to seat 0, live game, friend connected', () => {
    expect(parseOnlinePreviewParams(new URLSearchParams('online=1'))).toEqual({
      slot: 0, stage: null, hand: 0, utils: 0, presence: 'connected',
    });
  });

  it('reads slot, stage, counts (capped) and presence; ignores junk', () => {
    expect(parseOnlinePreviewParams(new URLSearchParams('slot=1&stage=lion&hand=99&utils=9&presence=away'))).toEqual({
      slot: 1, stage: 'lion', hand: 30, utils: 3, presence: 'reconnecting',
    });
    expect(parseOnlinePreviewParams(new URLSearchParams('slot=7&stage=nope&hand=-3&presence=left'))).toMatchObject({
      slot: 0, stage: null, hand: 0, presence: 'left',
    });
  });
});

describe('previewSeats', () => {
  it('puts You at the viewer seat and Sam opposite, with a grace while away', () => {
    const [a, b] = previewSeats(1, 'reconnecting');
    expect(b.name).toBe('You');
    expect(a).toMatchObject({ name: 'Sam', status: 'reconnecting', graceMsLeft: PREVIEW_GRACE_MS });
    expect(previewSeats(0, 'connected')[1].graceMsLeft).toBeNull();
  });
});
