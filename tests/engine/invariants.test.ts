// ============================================================================
// Invariant Tests — state validation and normalization
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createTestState } from '../helpers/testHelpers.ts';
import {
  checkInvariants,
  assertValidState,
  normalizeState,
} from '../../src/engine/validation/invariants.ts';

describe('checkInvariants', () => {
  it('fresh state passes all invariants', () => {
    const s = createTestState();
    const violations = checkInvariants(s);
    const errors = violations.filter(v => v.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('detects negative gold', () => {
    const s = createTestState();
    s.players[0].gold = -5;
    const violations = checkInvariants(s);
    const goldError = violations.find(v => v.rule === 'P0_GOLD_NON_NEGATIVE');
    expect(goldError).toBeDefined();
    expect(goldError!.severity).toBe('error');
  });

  it('detects card count mismatch', () => {
    const s = createTestState();
    // Remove a card from the deck without putting it anywhere
    s.deck.pop();
    const violations = checkInvariants(s);
    const countError = violations.find(v => v.rule === 'TOTAL_CARD_COUNT');
    expect(countError).toBeDefined();
  });

  it('detects invalid phase', () => {
    const s = createTestState();
    (s as any).phase = 'INVALID';
    const violations = checkInvariants(s);
    const phaseError = violations.find(v => v.rule === 'VALID_PHASE');
    expect(phaseError).toBeDefined();
  });
});

describe('hand size', () => {
  // Official Jambo rules have no hand limit — a big hand is a legal state.
  it('accepts a 20-card hand', () => {
    const s = createTestState();
    const extra = s.deck.slice(0, 15);
    const big = {
      ...s,
      deck: s.deck.slice(15),
      players: [{ ...s.players[0], hand: [...s.players[0].hand, ...extra] }, s.players[1]] as typeof s.players,
    };
    expect(big.players[0].hand.length).toBe(20);
    expect(checkInvariants(big).filter(v => v.severity !== 'warning')).toEqual([]);
  });
});

describe('assertValidState', () => {
  it('does not throw for valid state', () => {
    expect(() => assertValidState(createTestState())).not.toThrow();
  });

  it('throws for invalid state', () => {
    const s = createTestState();
    s.players[1].gold = -10;
    expect(() => assertValidState(s)).toThrow('invariant violations');
  });
});

describe('normalizeState', () => {
  it('clamps negative gold to 0', () => {
    const s = createTestState();
    s.players[0].gold = -5;
    const n = normalizeState(s);
    expect(n.players[0].gold).toBe(0);
  });

  it('clamps actionsLeft to valid range', () => {
    const s = createTestState();
    s.actionsLeft = 99;
    const n = normalizeState(s);
    expect(n.actionsLeft).toBe(5);
  });

  it('fixes invalid phase to DRAW', () => {
    const s = createTestState();
    (s as any).phase = 'BROKEN';
    const n = normalizeState(s);
    expect(n.phase).toBe('DRAW');
  });

  it('pads market slots if too few', () => {
    const s = createTestState();
    s.players[0].market = ['trinkets', null, null]; // too few (should be 6)
    const n = normalizeState(s);
    expect(n.players[0].market.length).toBe(6);
  });

  it('clamps negative ware supply to 0', () => {
    const s = createTestState();
    s.wareSupply.tea = -3;
    const n = normalizeState(s);
    expect(n.wareSupply.tea).toBe(0);
  });
});
