import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { withSpotlightHolds } from '../../src/ui/OpponentPlaySpotlight.tsx';
import { DRAW_MODAL_MAX_WAIT_MS, DRAW_MODAL_SETTLE_MS, shouldOpenDrawModal } from '../../src/ui/gameScreenLogic.ts';
import { createTestState } from '../helpers/testHelpers.ts';
import type { PlayerState } from '../../src/engine/types.ts';
import type { PlaySpotlight } from '../../src/ui/actionLog.ts';

const spot = (cardId: string, destination: PlaySpotlight['destination']) => ({ cardId, destination }) as Pick<PlaySpotlight, 'cardId' | 'destination'>;

function opponentWith(): PlayerState {
  const p = createTestState().players[1];
  return {
    ...p,
    hand: ['guard_1', 'guard_2', 'well_1'],
    utilities: [
      { cardId: 'drums_1', designId: 'drums', usedThisTurn: false },
      { cardId: 'well_2', designId: 'well', usedThisTurn: false },
    ],
  } as PlayerState;
}

describe('the board holds back what the opponent spotlight is still showing', () => {
  it('a utility being placed is not in their row until its spotlight lands', () => {
    const held = withSpotlightHolds(opponentWith(), [spot('well_2', 'utilities')]);
    expect(held.utilities.map((u) => u.cardId)).toEqual(['drums_1']);
  });

  it('holds every queued placement, not just the one on screen', () => {
    const held = withSpotlightHolds(opponentWith(), [spot('drums_1', 'utilities'), spot('guard_3', 'discard'), spot('well_2', 'utilities')]);
    expect(held.utilities).toEqual([]);
  });

  it('a card found for their hand (Supplies) joins the hand count only after its spotlight', () => {
    expect(withSpotlightHolds(opponentWith(), [spot('ware_3k_1', 'hand')]).hand).toHaveLength(2);
    // never below zero
    expect(withSpotlightHolds({ ...opponentWith(), hand: [] }, [spot('a', 'hand'), spot('b', 'hand')]).hand).toHaveLength(0);
  });

  it('discards and used utilities change nothing here (the pile and tapped state are held elsewhere)', () => {
    const p = opponentWith();
    expect(withSpotlightHolds(p, [spot('guard_3', 'discard'), spot('drums_1', 'inPlace')])).toBe(p);
    expect(withSpotlightHolds(p, [])).toBe(p);
  });
});

describe('the draw dialog waits for the opponent’s animations', () => {
  const base = { myDrawPhase: true, open: false, animating: false, waitExpired: false };
  it('opens at your draw phase once nothing is animating', () => {
    expect(shouldOpenDrawModal(base)).toBe(true);
  });
  it('waits while a spotlight or flight is still playing', () => {
    expect(shouldOpenDrawModal({ ...base, animating: true })).toBe(false);
  });
  it('opens anyway once the wait runs out, so a stuck animation never blocks the turn', () => {
    expect(shouldOpenDrawModal({ ...base, animating: true, waitExpired: true })).toBe(true);
    expect(DRAW_MODAL_MAX_WAIT_MS).toBeLessThanOrEqual(6000);
    // a short settle lets the move that started your turn queue its animations first
    expect(DRAW_MODAL_SETTLE_MS).toBeGreaterThan(100);
    expect(DRAW_MODAL_SETTLE_MS).toBeLessThan(500);
  });
  it('never reopens over a pending resolution (Mask used before drawing)', () => {
    // "Use Mask" closes the dialog; it used to reopen ~220ms later on top of
    // the Mask panel, hiding it (playtest 2026-10-14)
    expect(shouldOpenDrawModal({ ...base, pending: true })).toBe(false);
    expect(shouldOpenDrawModal({ ...base, pending: true, waitExpired: true })).toBe(false);
    // once the Mask trade resolves, the draw dialog comes back
    expect(shouldOpenDrawModal({ ...base, pending: false })).toBe(true);
  });
  it('never opens outside your draw phase, or twice', () => {
    expect(shouldOpenDrawModal({ ...base, myDrawPhase: false })).toBe(false);
    expect(shouldOpenDrawModal({ ...base, open: true })).toBe(false);
  });
  it('sits above the spotlight and flight layers, below the card zoom', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const z = (sel: string) => Number(css.slice(css.indexOf(`${sel} {`)).match(/z-index:\s*(\d+)/)?.[1]);
    const buttons = readFileSync('src/ui/ActionButtons.tsx', 'utf8');
    const drawZ = Number(buttons.slice(buttons.indexOf('export function DrawModal')).match(/zIndex: (\d+),/)?.[1]);
    expect(drawZ).toBeGreaterThan(z('.opp-spotlight'));
    expect(drawZ).toBeGreaterThan(z('.flight-layer'));
    expect(drawZ).toBeLessThan(10000);
    // turn announcements stay visible over it
    expect(z('.turn-sweep')).toBeGreaterThan(drawZ);
    expect(z('.final-turn-banner')).toBeGreaterThan(drawZ);
  });
});
