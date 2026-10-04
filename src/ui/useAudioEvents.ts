// ============================================================================
// Sound effect player. Cast mode feeds it AudioEvents from the server;
// solo/hotseat (GameScreen) feeds it the local store's actions via
// useLocalActionAudio(). Both map actions with detectAudioEvent().
// Fails silently (autoplay blocked, file missing) — sound is never load-bearing.
// ============================================================================

import { useEffect, useRef } from 'react';
import type { AudioEvent } from '../multiplayer/types.ts';
import { getEffectiveVolume } from './audioSettings.ts';
import { detectAudioEvent } from '../multiplayer/audioEvents.ts';
import type { TaggedAction } from '../hooks/useGameStore.ts';

export const AUDIO_FILES: Record<AudioEvent, string> = {
  'coin': '/audio/sfx/coin.mp3',
  'card-play': '/audio/sfx/card-play.mp3',
  'card-draw': '/audio/sfx/card-draw.mp3',
  'turn-end': '/audio/sfx/turn-end.mp3',
  'attack': '/audio/sfx/attack.mp3',
  'guard': '/audio/sfx/guard.mp3',
};

const SFX_BASE_VOLUME = 0.5;

/** Play one sound effect at the user's volume (respects mute). */
export function playSfx(event: AudioEvent): void {
  if (typeof Audio === 'undefined') return;
  const volume = getEffectiveVolume() * SFX_BASE_VOLUME;
  if (volume <= 0) return;
  const audio = new Audio(AUDIO_FILES[event]);
  audio.volume = volume;
  audio.play().catch(() => {
    // Autoplay blocked or file missing — sound is optional
  });
}

/** Sounds for actions[from..], in order, de-duplicated. Pure — exported for tests. */
export function newActionSounds(actions: TaggedAction[], from: number): AudioEvent[] {
  const events: AudioEvent[] = [];
  for (const { action } of actions.slice(Math.max(0, from))) {
    const event = detectAudioEvent(action);
    if (event && !events.includes(event)) events.push(event);
  }
  return events;
}

/**
 * Solo/hotseat: play the sound for each newly applied action (human or AI).
 * Keyed on the action count so a re-render never replays a sound, and a new
 * game (count drops back to 0) starts clean.
 */
export function useLocalActionAudio(taggedActions: TaggedAction[]): void {
  const lastCount = useRef(taggedActions.length);
  useEffect(() => {
    const count = taggedActions.length;
    if (count > lastCount.current) {
      // Every action applied since the last render, each sound at most once
      for (const event of newActionSounds(taggedActions, lastCount.current)) playSfx(event);
    }
    lastCount.current = count;
  }, [taggedActions]);
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
