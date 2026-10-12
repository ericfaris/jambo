// ============================================================================
// Background Music Player Hook
// Plays looping background music. Guards against multiple instances.
// ============================================================================

import { useEffect } from 'react';
import { getEffectiveVolume } from './audioSettings.ts';

export const BACKGROUND_MUSIC = [
  '/audio/African_Village_Afternoon_Soundscape.mp3',
  '/audio/Market_Morning_Mosaic.mp3',
  '/audio/River_Paths_Village_Hearts_Voice.mp3',
  '/audio/Sun_In_Our_Hands.mp3',
  '/audio/Sun_on_the_Courtyard.mp3',
  '/audio/Golden_Hour_Kalimba.mp3',
];

const MUSIC_BASE_VOLUME = 0.15;

// Market crowd/stall/birdsong bed under the music, looped forever. Three
// ElevenLabs SFX loops (30s/25s/20s) stacked into one 5-minute file, so the
// texture never repeats within the file and the file itself loops seamlessly.
export const MARKET_AMBIENCE = '/audio/Market_Ambience_Loop.mp3';
export const AMBIENCE_BASE_VOLUME = 0.1;

// Silence between music tracks — the market ambience carries the room alone
// for a while before the next song comes in.
export const TRACK_GAP_MS = 20_000;

const AUTOPLAY_RETRY_MS = 3000;
const MAX_RETRIES = 10;

// Module-level singleton guard — only one music player at a time
let activeInstance: HTMLAudioElement | null = null;

export function useBackgroundMusic(): void {
  useEffect(() => startBackgroundMusic(), []);
}

/** Starts the music playlist + ambience bed; returns the cleanup. */
export function startBackgroundMusic(): (() => void) | undefined {
  // If another instance is already playing, skip
  if (activeInstance !== null) {
    console.log('[Music] Already playing in another instance, skipping');
    return undefined;
  }

  // Shuffle playlist
  const shuffled = [...BACKGROUND_MUSIC];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const playlist = shuffled;
  let trackIndex = 0;

  // Use a DOM-attached audio element (required for Chromecast)
  const audio = document.createElement('audio');
  audio.style.display = 'none';
  document.body.appendChild(audio);
  activeInstance = audio;
  audio.loop = false;
  audio.volume = getEffectiveVolume() * MUSIC_BASE_VOLUME;

  const ambience = document.createElement('audio');
  ambience.style.display = 'none';
  document.body.appendChild(ambience);
  ambience.loop = true;
  ambience.src = MARKET_AMBIENCE;
  ambience.volume = getEffectiveVolume() * AMBIENCE_BASE_VOLUME;

  const setVolumes = (scale: number) => {
    const v = getEffectiveVolume() * scale;
    audio.volume = v * MUSIC_BASE_VOLUME;
    ambience.volume = v * AMBIENCE_BASE_VOLUME;
  };

  let retryTimer: number | null = null;
  let retryCount = 0;
  let started = false;
  let cleaned = false;

  const attemptPlay = () => {
    if (cleaned) return;
    audio.play().then(() => {
      console.log(`[Music] Playing: ${audio.src}`);
      started = true;
      retryCount = 0;
      if (ambience.paused) {
        ambience.play().catch((err: unknown) => {
          console.warn(`[Music] Ambience play blocked:`, (err as Error).message ?? err);
        });
      }
    }).catch((err: unknown) => {
      console.warn(`[Music] Play blocked:`, (err as Error).message ?? err);
      if (!started && retryCount < MAX_RETRIES && !cleaned) {
        retryCount++;
        console.log(`[Music] Retry ${retryCount}/${MAX_RETRIES} in ${AUTOPLAY_RETRY_MS}ms`);
        retryTimer = window.setTimeout(attemptPlay, AUTOPLAY_RETRY_MS);
      }
    });
  };

  const playNextTrack = () => {
    if (cleaned) return;
    if (playlist.length === 0) return;
    if (trackIndex >= playlist.length) {
      trackIndex = 0;
    }
    const trackUrl = playlist[trackIndex];
    console.log(`[Music] Loading: ${trackUrl}`);
    audio.src = trackUrl;
    trackIndex++;
    attemptPlay();
  };

  playNextTrack();

  // Resume on user interaction (helps with autoplay policies)
  const resumeOnInteraction = () => {
    if (started || cleaned) return;
    console.log('[Music] User interaction — attempting play');
    attemptPlay();
  };
  document.addEventListener('click', resumeOnInteraction, { once: true });
  document.addEventListener('touchstart', resumeOnInteraction, { once: true });

  let gapTimer: number | null = null;
  const handleEnded = () => {
    if (gapTimer !== null) window.clearTimeout(gapTimer);
    gapTimer = window.setTimeout(() => {
      gapTimer = null;
      playNextTrack();
    }, TRACK_GAP_MS);
  };
  audio.addEventListener('ended', handleEnded);

  const handleError = () => {
    const e = audio.error;
    console.error(`[Music] Audio error: code=${e?.code} message=${e?.message}`);
  };
  audio.addEventListener('error', handleError);

  const handleVolumeChange = () => setVolumes(1);
  window.addEventListener('jambo-volume-change', handleVolumeChange);

  // Big sound effects dip the music ~6 dB so they cut through, then restore
  let duckTimer: number | null = null;
  const handleDuck = (event: Event) => {
    const ms = (event as CustomEvent<number>).detail ?? 1500;
    setVolumes(0.5);
    if (duckTimer !== null) window.clearTimeout(duckTimer);
    duckTimer = window.setTimeout(() => {
      duckTimer = null;
      setVolumes(1);
    }, ms);
  };
  window.addEventListener('jambo-music-duck', handleDuck);

  return () => {
    cleaned = true;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    if (gapTimer !== null) window.clearTimeout(gapTimer);
    audio.removeEventListener('ended', handleEnded);
    audio.removeEventListener('error', handleError);
    window.removeEventListener('jambo-volume-change', handleVolumeChange);
    window.removeEventListener('jambo-music-duck', handleDuck);
    if (duckTimer !== null) window.clearTimeout(duckTimer);
    document.removeEventListener('click', resumeOnInteraction);
    document.removeEventListener('touchstart', resumeOnInteraction);
    audio.pause();
    audio.src = '';
    audio.remove();
    ambience.pause();
    ambience.src = '';
    ambience.remove();
    if (activeInstance === audio) {
      activeInstance = null;
    }
  };
}
