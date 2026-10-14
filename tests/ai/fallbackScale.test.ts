import { describe, expect, it } from 'vitest';
import { getFallbackInteractionResponses } from '../../src/ai/RandomAI.ts';
import { processAction } from '../../src/engine/GameEngine.ts';
import { createTestState, toPlayPhase, withUtility } from '../helpers/testHelpers.ts';
import { splitState } from '../../src/multiplayer/stateSplitter.ts';
import { toBoardState } from '../../src/ui/onlineView.ts';
import type { GameState } from '../../src/engine/types.ts';

function scaleStarted(): GameState {
  const s = withUtility(toPlayPhase(createTestState()), 0, 'scale_1', 'scale');
  return processAction(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
}

describe('fallback responses: Scale', () => {
  it('offers only the 2 drawn cards, and every one is accepted by the engine', () => {
    const s = scaleStarted();
    const pr = s.pendingResolution;
    expect(pr?.type === 'UTILITY_EFFECT' && pr.selectedCards).toHaveLength(2);
    const responses = getFallbackInteractionResponses(s);
    expect(responses.length).toBe(2);
    for (const response of responses) {
      expect(() => processAction(s, { type: 'RESOLVE_INTERACTION', response })).not.toThrow();
    }
  });

  it('works from the online board too (the phone policy reasons on toBoardState)', () => {
    // Regression: the friend-room server test looped 3,000 steps on
    // "Card <hand card> not among drawn cards" once Scale stopped being cancellable
    const s = scaleStarted();
    const v = splitState(s, 0);
    const first = getFallbackInteractionResponses(toBoardState(v.public, v.private, 0))[0];
    expect(() => processAction(s, { type: 'RESOLVE_INTERACTION', response: first! })).not.toThrow();
  });
});
