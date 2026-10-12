// ============================================================================
// Player preferences — one source of truth for every setting, so the main
// menu's Settings screen and the in-game menus read and write the same thing.
// Stored per browser in localStorage under the keys the app has always used.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { getVolume, getMuted, setVolume as saveVolume, setMuted as saveMuted, resetAudioSettings } from './audioSettings.ts';
import { parseAiSpeed } from './gameScreenLogic.ts';
import type { AiSpeed } from './gameScreenLogic.ts';
import { AMBIENT_STORAGE_KEY } from './life.tsx';
import { TRADER_VOICES_STORAGE_KEY } from './useTrader.ts';

export type AnimationSpeed = 'normal' | 'fast';

export interface Preferences {
  volume: number;
  muted: boolean;
  traderVoices: boolean;
  animationSpeed: AnimationSpeed;
  aiSpeed: AiSpeed;
  highContrast: boolean;
  ambientMotion: boolean;
  logPinned: boolean;
  devTelemetry: boolean;
  uxDebug: boolean;
}

export type PreferenceKey = keyof Preferences;

/** What a fresh browser gets (and what "Reset" goes back to). */
export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  volume: 50,
  muted: false,
  traderVoices: true,
  animationSpeed: 'normal',
  aiSpeed: 'normal',
  highContrast: false,
  ambientMotion: true,
  logPinned: false,
  devTelemetry: false,
  uxDebug: true,
};

/** Storage keys for everything but audio (audioSettings.ts owns those). */
export const PREFERENCE_STORAGE_KEYS = {
  traderVoices: TRADER_VOICES_STORAGE_KEY,
  animationSpeed: 'jambo.animationSpeed',
  aiSpeed: 'jambo.aiSpeed',
  highContrast: 'jambo.highContrast',
  ambientMotion: AMBIENT_STORAGE_KEY,
  logPinned: 'jambo.logPinned',
  devTelemetry: 'jambo.devTelemetry',
  uxDebug: 'jambo.uxDebugCounters',
} as const satisfies Partial<Record<PreferenceKey, string>>;

/** Fired on window whenever a preference changes, so other mounted readers follow. */
export const PREFERENCES_CHANGE_EVENT = 'jambo-prefs-change';
/** Audio code listens for this to re-read volume/mute. */
export const VOLUME_CHANGE_EVENT = 'jambo-volume-change';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function readPreferences(): Preferences {
  const k = PREFERENCE_STORAGE_KEYS;
  let volume = DEFAULT_PREFERENCES.volume;
  let muted = DEFAULT_PREFERENCES.muted;
  try {
    volume = getVolume();
    muted = getMuted();
  } catch { /* storage blocked — defaults */ }
  return {
    volume,
    muted,
    traderVoices: read(k.traderVoices) !== 'false',
    animationSpeed: read(k.animationSpeed) === 'fast' ? 'fast' : 'normal',
    aiSpeed: parseAiSpeed(read(k.aiSpeed)),
    highContrast: read(k.highContrast) === 'true',
    ambientMotion: read(k.ambientMotion) !== 'false',
    logPinned: read(k.logPinned) === 'true',
    devTelemetry: read(k.devTelemetry) === 'true',
    uxDebug: read(k.uxDebug) !== 'false',
  };
}

export function writePreference<K extends PreferenceKey>(key: K, value: Preferences[K]): void {
  try {
    if (key === 'volume') saveVolume(value as number);
    else if (key === 'muted') saveMuted(value as boolean);
    else storage()?.setItem(PREFERENCE_STORAGE_KEYS[key as keyof typeof PREFERENCE_STORAGE_KEYS], String(value));
  } catch { /* storage blocked — the setting just won't persist */ }
}

export function clearPreferences(): void {
  try {
    const s = storage();
    if (!s) return;
    s.removeItem('jambo.showGameLog'); // retired sidebar setting
    for (const key of Object.values(PREFERENCE_STORAGE_KEYS)) s.removeItem(key);
    resetAudioSettings();
  } catch { /* storage blocked — nothing stored to clear */ }
}

/** Reflect the visual preferences on <html> (CSS keys off these attributes). */
export function applyDocumentPreferences(prefs: Preferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-anim-speed', prefs.animationSpeed);
  // OpponentPlaySpotlight reads this to scale its hold with the AI's pace
  root.setAttribute('data-ai-speed', prefs.aiSpeed);
  if (prefs.highContrast) root.setAttribute('data-contrast', 'high');
  else root.removeAttribute('data-contrast');
  if (prefs.ambientMotion) root.removeAttribute('data-ambient');
  else root.setAttribute('data-ambient', 'off');
}

function announce(key: PreferenceKey | null): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  if (key === null || key === 'volume' || key === 'muted') window.dispatchEvent(new Event(VOLUME_CHANGE_EVENT));
  window.dispatchEvent(new Event(PREFERENCES_CHANGE_EVENT));
}

export function isDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export interface PreferencesApi {
  prefs: Preferences;
  setPref: <K extends PreferenceKey>(key: K, value: Preferences[K]) => void;
  resetPrefs: () => void;
}

/** Live preferences: read once, persisted and applied on every change. */
export function usePreferences(): PreferencesApi {
  const [prefs, setPrefs] = useState<Preferences>(readPreferences);

  useEffect(() => {
    applyDocumentPreferences(prefs);
  }, [prefs]);

  useEffect(() => {
    // Another settings surface changed something — pick it up
    const sync = () => setPrefs((current) => {
      const next = readPreferences();
      return (Object.keys(next) as PreferenceKey[]).some((k) => next[k] !== current[k]) ? next : current;
    });
    window.addEventListener(PREFERENCES_CHANGE_EVENT, sync);
    return () => window.removeEventListener(PREFERENCES_CHANGE_EVENT, sync);
  }, []);

  const setPref = useCallback(<K extends PreferenceKey>(key: K, value: Preferences[K]) => {
    setPrefs((current) => (current[key] === value ? current : { ...current, [key]: value }));
    writePreference(key, value);
    announce(key);
  }, []);

  const resetPrefs = useCallback(() => {
    clearPreferences();
    setPrefs({ ...DEFAULT_PREFERENCES });
    announce(null);
  }, []);

  return { prefs, setPref, resetPrefs };
}
