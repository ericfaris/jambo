import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState } from '../engine/types.ts';
import type { BarkEvent, Trader, TraderMood } from '../ai/traders.ts';
import { barkUrl, traderReaction } from '../ai/traders.ts';
import { getEffectiveVolume } from './audioSettings.ts';

export const TRADER_VOICES_STORAGE_KEY = 'jambo.traderVoices';
/** A passing mood fades back to neutral after this long. */
export const MOOD_HOLD_MS = 2600;
/** Voiced lines are a treat, not commentary: at most one per this long. */
export const BARK_COOLDOWN_MS = 12_000;
const VOICE_VOLUME = 0.85;

export function getInitialTraderVoices(): boolean {
  try {
    return typeof window === 'undefined' || window.localStorage.getItem(TRADER_VOICES_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** Greeting, game end and a Guard always speak; the rest respect the cooldown. */
export function shouldBark(event: BarkEvent, lastBarkAt: number, now: number): boolean {
  if (event === 'greet' || event === 'win' || event === 'lose' || event === 'blocked') return true;
  return now - lastBarkAt >= BARK_COOLDOWN_MS;
}

/**
 * The trader across the table: their mood (portrait expression) and voiced
 * lines, driven by what happens in the game. `onLine` receives the caption
 * of a line as it plays (shown in the speech bubble).
 */
export function useTrader({ state, trader, seat, voices, onLine }: {
  state: GameState;
  trader: Trader | null;
  seat: 0 | 1;
  voices: boolean;
  onLine?: (text: string) => void;
}): { mood: TraderMood; speaking: boolean } {
  const [mood, setMood] = useState<TraderMood>('neutral');
  const [speaking, setSpeaking] = useState(false);
  const prevRef = useRef<GameState | null>(null);
  const lastBarkRef = useRef(0);
  const moodTimer = useRef<number | null>(null);
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;

  const bark = useCallback((event: BarkEvent) => {
    if (!trader) return;
    const now = Date.now();
    if (!shouldBark(event, lastBarkRef.current, now)) return;
    lastBarkRef.current = now;
    if (event === 'greet') onLineRef.current?.(trader.lines.greet);
    if (!voices || typeof Audio === 'undefined') return;
    const volume = getEffectiveVolume() * VOICE_VOLUME;
    if (volume <= 0) return;
    const audio = new Audio(barkUrl(trader, event));
    audio.volume = volume;
    audio.onplay = () => {
      setSpeaking(true);
      window.dispatchEvent(new CustomEvent('jambo-music-duck', { detail: 4500 }));
    };
    audio.onended = () => setSpeaking(false);
    audio.onerror = () => setSpeaking(false);
    // animal calls and stingers play first; the trader speaks right after
    window.setTimeout(() => {
      audio.play().catch(() => setSpeaking(false));
    }, event === 'attack' || event === 'win' || event === 'lose' ? 700 : 150);
  }, [trader, voices]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (!trader) return;
    // a new game (or the first state we see): say hello
    if (!prev || state.log.length < prev.log.length) {
      setMood('neutral');
      if (state.phase !== 'GAME_OVER' && state.log.length < 4) {
        const t = window.setTimeout(() => bark('greet'), 900);
        return () => window.clearTimeout(t);
      }
      return;
    }
    const r = traderReaction(prev, state, seat);
    if (r.mood) {
      setMood(r.mood);
      if (moodTimer.current !== null) window.clearTimeout(moodTimer.current);
      moodTimer.current = r.lasting ? null : window.setTimeout(() => setMood('neutral'), MOOD_HOLD_MS);
    }
    if (r.bark) bark(r.bark);
    return undefined;
  }, [state, trader, seat, bark]);

  useEffect(() => () => {
    if (moodTimer.current !== null) window.clearTimeout(moodTimer.current);
  }, []);

  return { mood, speaking };
}
