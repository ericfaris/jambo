// ============================================================================
// Sound effect player. Cast mode feeds it AudioEvents from the server;
// solo/hotseat (GameScreen) feeds it the local store's actions via
// useLocalActionAudio(). Both map actions with detectAudioEvent().
// Fails silently (autoplay blocked, file missing) — sound is never load-bearing.
// ============================================================================

import { useEffect, useRef } from 'react';
import type { AudioEvent } from '../multiplayer/types.ts';
import type { GameState } from '../engine/types.ts';
import { getEffectiveVolume } from './audioSettings.ts';
import { detectAudioEvent, detectOutcomeSounds, DUCKING_SOUNDS } from '../multiplayer/audioEvents.ts';
import type { OutcomeView } from '../multiplayer/audioEvents.ts';
import type { TaggedAction } from '../hooks/useGameStore.ts';

const sfx = (name: string) => `/audio/sfx/${name}.mp3`;

export const AUDIO_FILES: Record<AudioEvent, string> = {
  'coin': sfx('coin'),
  'coin-out': sfx('coin-out'),
  'card-play': sfx('card-play'),
  'card-draw': sfx('card-draw'),
  'turn-end': sfx('turn-end'),
  'attack': sfx('attack'),
  'guard': sfx('guard'),
  'ware-land': sfx('ware-land'),
  'win': sfx('win'),
  'lose': sfx('lose'),
  'final-turn': sfx('final-turn'),
  'gavel': sfx('gavel'),
  'parrot': sfx('parrot'),
  'elephant': sfx('elephant'),
  'snake': sfx('snake'),
  'hyena': sfx('hyena'),
  'crocodile': sfx('crocodile'),
  'ape': sfx('ape'),
  'lion': sfx('lion'),
  'cheetah': sfx('cheetah'),
  'drums': sfx('drums'),
  'well': sfx('well'),
  'kettle': sfx('kettle'),
  'boat': sfx('boat'),
  'scale': sfx('scale'),
  'weapons': sfx('weapons'),
};

/** How long the music dips under a big sound (useBackgroundMusic listens). */
export const MUSIC_DUCK_MS = 1600;

const SFX_BASE_VOLUME = 0.5;

/** Play one sound effect at the user's volume (respects mute). */
export function playSfx(event: AudioEvent): void {
  if (typeof Audio === 'undefined') return;
  const volume = getEffectiveVolume() * SFX_BASE_VOLUME;
  if (volume <= 0) return;
  if (DUCKING_SOUNDS.has(event) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jambo-music-duck', { detail: MUSIC_DUCK_MS }));
  }
  const audio = new Audio(AUDIO_FILES[event]);
  audio.volume = volume;
  audio.play().catch(() => {
    // Autoplay blocked or file missing — sound is optional
  });
}

/** Sounds for actions[from..], in order, de-duplicated. Pure — exported for tests.
 *  `before` is the state the first of them was applied to (names utilities). */
export function newActionSounds(actions: TaggedAction[], from: number, before?: GameState): AudioEvent[] {
  const events: AudioEvent[] = [];
  for (const { action } of actions.slice(Math.max(0, from))) {
    const event = detectAudioEvent(action, before);
    if (event && !events.includes(event)) events.push(event);
  }
  return events;
}

/**
 * Solo/hotseat: play the sound for each newly applied action (human or AI).
 * Keyed on the action count so a re-render never replays a sound, and a new
 * game (count drops back to 0) starts clean.
 */
export function useLocalActionAudio(taggedActions: TaggedAction[], state?: GameState, viewer: 0 | 1 | null = 0): void {
  const lastCount = useRef(taggedActions.length);
  const prevState = useRef(state);
  useEffect(() => {
    const count = taggedActions.length;
    const before = prevState.current;
    const played: AudioEvent[] = [];
    if (count > lastCount.current) {
      // Every action applied since the last render, each sound at most once
      for (const event of newActionSounds(taggedActions, lastCount.current, before)) {
        playSfx(event);
        played.push(event);
      }
    }
    if (before && state && before !== state && count >= lastCount.current) {
      for (const event of detectOutcomeSounds(before, state, viewer)) {
        if (!played.includes(event)) playSfx(event);
      }
    }
    lastCount.current = count;
    prevState.current = state;
  }, [taggedActions, state, viewer]);
}

/**
 * Cast phones and the TV: the server sends one sound per action, so the
 * outcome sounds (gavel, final turn, win/lose) are worked out here from the
 * public state stream. `viewer` is this phone's seat; null on the TV.
 */
export function useOutcomeAudio(state: OutcomeView | null, viewer: 0 | 1 | null): void {
  const prev = useRef<OutcomeView | null>(null);
  useEffect(() => {
    if (!state) return;
    const before = prev.current;
    prev.current = state;
    // the first state after (re)joining is history, not news
    if (!before || state.log.length < before.log.length) return;
    for (const event of detectOutcomeSounds(before, state, viewer)) playSfx(event);
  }, [state, viewer]);
}

export function useAudioEvents(audioEvent: AudioEvent | null, clearAudioEvent: () => void): void {
  const lastPlayed = useRef<string | null>(null);

  useEffect(() => {
    if (!audioEvent) return;

    // Avoid replaying the same event
    const key = `${audioEvent}-${Date.now()}`;
    if (lastPlayed.current === key) return;
    lastPlayed.current = key;

    playSfx(audioEvent);

    clearAudioEvent();
  }, [audioEvent, clearAudioEvent]);
}
