import { describe, it, expect } from 'vitest';
import { stagePreviewState } from '../../src/ui/DevPlayerPreview.tsx';
import { createInitialState } from '../../src/engine/GameState.ts';
import { checkInvariants } from '../../src/engine/validation/invariants.ts';
import { getCard } from '../../src/engine/cards/CardDatabase.ts';

const base = () => createInitialState(42);

describe('stagePreviewState (dev ?player=1 layout staging)', () => {
  it('is a no-op with no params', () => {
    const s = base();
    expect(stagePreviewState(s, new URLSearchParams())).toEqual(s);
  });

  it('grows the hand from the deck without breaking invariants', () => {
    const s = base();
    const staged = stagePreviewState(s, new URLSearchParams('hand=12&utils=3&phase=play'));
    expect(staged.players[0].hand).toHaveLength(12);
    expect(staged.players[0].utilities).toHaveLength(3);
    expect(new Set(staged.players[0].utilities.map((u) => u.designId)).size).toBe(3);
    expect(staged.players[0].hand.slice(s.players[0].hand.length).every((id) => getCard(id).type !== 'utility')).toBe(true);
    expect(staged.phase).toBe('PLAY');
    expect(staged.currentPlayer).toBe(0);
    expect(checkInvariants(staged)).toEqual([]);
  });

  it('caps utilities at 3 and never mutates the input', () => {
    const s = base();
    const snapshot = JSON.stringify(s);
    const staged = stagePreviewState(s, new URLSearchParams('utils=9'));
    expect(staged.players[0].utilities.length).toBeLessThanOrEqual(3);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
