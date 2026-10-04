import { describe, it, expect } from 'vitest';
import { detectAudioEvent } from '../../src/multiplayer/audioEvents.ts';
import { AUDIO_FILES, newActionSounds } from '../../src/ui/useAudioEvents.ts';
import type { TaggedAction } from '../../src/hooks/useGameStore.ts';
import type { GameAction } from '../../src/engine/types.ts';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

describe('detectAudioEvent', () => {
  it('maps every sound-worthy action', () => {
    expect(detectAudioEvent({ type: 'DRAW_CARD' })).toBe('card-draw');
    expect(detectAudioEvent({ type: 'KEEP_CARD' })).toBe('card-draw');
    expect(detectAudioEvent({ type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' })).toBe('coin');
    expect(detectAudioEvent({ type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'sell' })).toBe('coin');
    expect(detectAudioEvent({ type: 'PLAY_CARD', cardId: 'parrot_1' })).toBe('attack');
    expect(detectAudioEvent({ type: 'PLAY_CARD', cardId: 'shaman_1' })).toBe('card-play');
    expect(detectAudioEvent({ type: 'PLAY_CARD', cardId: 'well_1' })).toBe('card-play');
    expect(detectAudioEvent({ type: 'END_TURN' })).toBe('turn-end');
    expect(detectAudioEvent({ type: 'GUARD_REACTION', play: true })).toBe('guard');
  });

  it('stays quiet for everything else', () => {
    expect(detectAudioEvent({ type: 'GUARD_REACTION', play: false })).toBeNull();
    expect(detectAudioEvent({ type: 'SKIP_DRAW' })).toBeNull();
    expect(detectAudioEvent({ type: 'CANCEL_ACTION' })).toBeNull();
    expect(detectAudioEvent({ type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toBeNull();
  });
});

describe('sound effect files', () => {
  it.each(Object.entries(AUDIO_FILES))('%s → %s exists and is a small, non-empty clip', (_event, url) => {
    const file = resolve('public', url.replace(/^\//, ''));
    expect(existsSync(file)).toBe(true);
    const size = statSync(file).size;
    expect(size).toBeGreaterThan(2_000);
    expect(size).toBeLessThan(150_000); // short SFX, web-sized
  });
});

describe('newActionSounds (solo/hotseat)', () => {
  const tag = (action: GameAction): TaggedAction => ({ player: 0, playerLabel: 'Player', action });
  const log = [
    tag({ type: 'DRAW_CARD' }),
    tag({ type: 'KEEP_CARD' }),
    tag({ type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' }),
    tag({ type: 'SKIP_DRAW' }),
    tag({ type: 'END_TURN' }),
  ];

  it('plays only actions added since the last render', () => {
    expect(newActionSounds(log, 4)).toEqual(['turn-end']);
    expect(newActionSounds(log, 5)).toEqual([]);
  });

  it('plays every sound in a batch once, in order', () => {
    expect(newActionSounds(log, 0)).toEqual(['card-draw', 'coin', 'turn-end']);
  });
});
