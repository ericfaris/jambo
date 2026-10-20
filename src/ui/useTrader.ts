import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameState } from '../engine/types.ts';
import type { BarkEvent, Trader, TraderMood } from '../ai/traders.ts';
import { barkUrl, traderReaction } from '../ai/traders.ts';
import { getEffectiveVolume } from './audioSettings.ts';

export const TRADER_VOICES_STORAGE_KEY = 'jambo.traderVoices';
/** A passing mood fades back to neutral after this long. */
export const MOOD_HOLD_MS = 2600;
/** Voiced lines are a treat, not commentary: at most one per this long. */
export const BARK_COOLDOWN_MS = 12_000;
/** …and the same kind of line (another attack, another big sale) waits longer. */
export const SAME_EVENT_GAP_MS = 40_000;
/** Each take of an everyday line is heard at most this many times a game. */
export const MAX_SAYS_PER_TAKE = 2;
/** How long a line counts as "still talking" if the audio never reports its end. */
export const LINE_BUSY_MS = 4_500;
const VOICE_VOLUME = 0.85;

/** Higher interrupts lower; equal or lower waits its turn (and is dropped). */
export const BARK_PRIORITY: Record<BarkEvent, number> = {
  greet: 1, 'big-sale': 1, 'rival-sale': 1, attack: 1, blocked: 2, win: 3, lose: 3,
};

/** Greeting, game end and a Guard always speak; the rest respect the cooldowns. */
const ALWAYS: ReadonlySet<BarkEvent> = new Set(['greet', 'blocked', 'win', 'lose']);

export interface BarkMemory {
  lastAt: number;
  lastByEvent: Partial<Record<BarkEvent, number>>;
  said: Partial<Record<BarkEvent, number>>;
  /** The line now playing (or about to): until when, and how important. */
  busyUntil: number;
  busyPriority: number;
}

export const EMPTY_BARK_MEMORY: BarkMemory = { lastAt: -Infinity, lastByEvent: {}, said: {}, busyUntil: 0, busyPriority: 0 };

export interface BarkPlan {
  /** Which take of the line (rotates through the trader's takes). */
  take: number;
  /** Stop the line that's playing first. */
  interrupt: boolean;
  memory: BarkMemory;
}

/**
 * Whether `event` gets said now, and which take — the trader's one voice:
 * lines never overlap, a Guard or the game's end cuts in, and nothing is
 * said twice in a row.
 */
export function planBark(memory: BarkMemory, event: BarkEvent, now: number, takes: number): BarkPlan | null {
  const always = ALWAYS.has(event);
  const said = memory.said[event] ?? 0;
  if (!always) {
    if (said >= Math.max(1, takes) * MAX_SAYS_PER_TAKE) return null;
    if (now - memory.lastAt < BARK_COOLDOWN_MS) return null;
    if (now - (memory.lastByEvent[event] ?? -Infinity) < SAME_EVENT_GAP_MS) return null;
  }
  const busy = now < memory.busyUntil;
  const priority = BARK_PRIORITY[event];
  if (busy && priority <= memory.busyPriority) return null;
  return {
    take: said % Math.max(1, takes),
    interrupt: busy,
    memory: {
      lastAt: now,
      lastByEvent: { ...memory.lastByEvent, [event]: now },
      said: { ...memory.said, [event]: said + 1 },
      busyUntil: now + LINE_BUSY_MS,
      busyPriority: priority,
    },
  };
}

/** Kept for callers that only ask "may this speak now?" */
export function shouldBark(event: BarkEvent, lastBarkAt: number, now: number): boolean {
  return ALWAYS.has(event) || now - lastBarkAt >= BARK_COOLDOWN_MS;
}

export function getInitialTraderVoices(): boolean {
  try {
    return typeof window === 'undefined' || window.localStorage.getItem(TRADER_VOICES_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** Animal calls and stingers play first; the trader speaks right after. */
function speakDelayMs(event: BarkEvent): number {
  return event === 'attack' || event === 'win' || event === 'lose' ? 700 : 150;
}

/**
 * The trader across the table: their mood (portrait expression) and voiced
 * lines, driven by what happens in the game. `onLine` receives the caption
 * of every line they say — with or without voices on.
 * `ready` is false while something covers the table (the coin toss); the
 * greeting waits for it.
 */
export function useTrader({ state, trader, seat, voices, ready = true, onLine }: {
  state: GameState;
  trader: Trader | null;
  seat: 0 | 1;
  voices: boolean;
  ready?: boolean;
  onLine?: (text: string, event: BarkEvent) => void;
}): { mood: TraderMood; speaking: boolean } {
  const [mood, setMood] = useState<TraderMood>('neutral');
  const [speaking, setSpeaking] = useState(false);
  const prevRef = useRef<GameState | null>(null);
  const memoryRef = useRef<BarkMemory>(EMPTY_BARK_MEMORY);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakTimer = useRef<number | null>(null);
  const moodTimer = useRef<number | null>(null);
  const greetTimer = useRef<number | null>(null);
  const greetedGame = useRef<number | null>(null);
  const onLineRef = useRef(onLine);
  useLayoutEffect(() => {
    onLineRef.current = onLine;
  }, [onLine]);

  const stopVoice = useCallback(() => {
    if (speakTimer.current !== null) window.clearTimeout(speakTimer.current);
    speakTimer.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const hush = useCallback(() => {
    stopVoice();
    setSpeaking(false);
  }, [stopVoice]);

  const bark = useCallback((event: BarkEvent) => {
    if (!trader) return;
    const takes = trader.lines[event];
    const plan = planBark(memoryRef.current, event, Date.now(), takes.length);
    if (!plan) return;
    memoryRef.current = plan.memory;
    if (plan.interrupt) hush();
    onLineRef.current?.(takes[plan.take], event);
    if (!voices || typeof Audio === 'undefined') return;
    const volume = getEffectiveVolume() * VOICE_VOLUME;
    if (volume <= 0) return;
    const audio = new Audio(barkUrl(trader, event, plan.take));
    audio.volume = volume;
    const done = () => {
      if (audioRef.current !== audio) return;
      audioRef.current = null;
      memoryRef.current = { ...memoryRef.current, busyUntil: 0, busyPriority: 0 };
      setSpeaking(false);
    };
    audio.onplay = () => {
      setSpeaking(true);
      window.dispatchEvent(new CustomEvent('jambo-music-duck', { detail: 4500 }));
    };
    audio.onended = done;
    audio.onerror = done;
    audioRef.current = audio;
    speakTimer.current = window.setTimeout(() => {
      speakTimer.current = null;
      audio.play().catch(done);
    }, speakDelayMs(event));
  }, [trader, voices, hush]);

  // Say hello once per game, after the table is uncovered
  useEffect(() => {
    if (!trader || !ready || state.phase === 'GAME_OVER') return;
    if (greetedGame.current === state.rngSeed || greetTimer.current !== null) return;
    if (state.log.length > 12) {
      greetedGame.current = state.rngSeed; // resumed mid-game: no hello
      return;
    }
    // marked greeted only once said: an unmount (StrictMode's double mount)
    // cancels the timer, and the next mount schedules it again
    const seed = state.rngSeed;
    greetTimer.current = window.setTimeout(() => {
      greetTimer.current = null;
      greetedGame.current = seed;
      bark('greet');
    }, 500);
  }, [trader, ready, state.phase, state.rngSeed, state.log.length, bark]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (!trader) return;
    // a new game: forget the last one
    if (!prev || prev.rngSeed !== state.rngSeed || state.log.length < prev.log.length) {
      setMood('neutral');
      if (prev) {
        hush();
        memoryRef.current = EMPTY_BARK_MEMORY;
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
  }, [state, trader, seat, bark, hush]);

  // Voices switched off mid-line: stop talking
  useEffect(() => {
    if (!voices) stopVoice();
  }, [voices, stopVoice]);
  if (!voices && speaking) setSpeaking(false);

  useEffect(() => () => {
    if (moodTimer.current !== null) window.clearTimeout(moodTimer.current);
    if (greetTimer.current !== null) window.clearTimeout(greetTimer.current);
    greetTimer.current = null;
    if (speakTimer.current !== null) window.clearTimeout(speakTimer.current);
    speakTimer.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  return { mood, speaking };
}
