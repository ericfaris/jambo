// ============================================================================
// Elephant stomp (2026-10-14) — when an Elephant's ware draft opens and its
// trumpet has sounded, the elephant pounds the ground: a stomp sound, the whole screen shakes, every
// pooled ware is thrown up out of sight, then they fall back into the draft
// slots one by one, each landing with the ware tap.
//
// Pure schedule + a once-per-draft gate here; DraftPanel runs the animation
// (Web Animations API, so each token gets its own timeline).
// ============================================================================

import type { PendingResolution } from '../engine/types.ts';
import type { AudioEvent } from '../multiplayer/types.ts';

type Draft = Extract<PendingResolution, { type: 'DRAFT' }>;

/** The screen shake, starting with the stomp. */
export const STOMP_SHAKE_MS = 520;
/** Wares leave the ground a beat after the stomp and are gone by this time. */
const TOSS_START_MS = 120;
const TOSS_END_MS = 520;
/** The first ware starts falling here, then one every FALL_GAP_MS. */
const FIRST_FALL_MS = 700;
const FALL_GAP_MS = 130;
const FALL_MS = 420;

export interface WareDrop {
  tossStart: number;
  tossEnd: number;
  fallStart: number;
  /** When it lands in its slot (the tap plays here). */
  land: number;
}

/** Timeline for each of `count` wares, in slot order. */
export function elephantDropSchedule(count: number): WareDrop[] {
  return Array.from({ length: count }, (_, i) => {
    const fallStart = FIRST_FALL_MS + i * FALL_GAP_MS;
    return { tossStart: TOSS_START_MS, tossEnd: TOSS_END_MS, fallStart, land: fallStart + FALL_MS };
  });
}

/** An Elephant's ware draft nobody has picked from yet. */
export function isFreshElephantDraft(pr: Draft): boolean {
  return pr.draftMode === 'wares' && pr.availableWares.length > 0 && pr.picks[0].length === 0 && pr.picks[1].length === 0;
}

/** A fresh draft is the same draft again within this long (the panel remounting). */
const SAME_DRAFT_MS = 15_000;
let lastStomp: { key: string; at: number } | null = null;
/** Until when picks are locked (epoch ms): the trumpet wait plus the drop. */
let lockedUntil = 0;

/**
 * True the first time a fresh Elephant draft is seen, false when the panel
 * re-renders or remounts on that same draft. A later Elephant (even the same
 * card after a cancel) stomps again.
 */
export function claimElephantStomp(pr: Draft, now: number = Date.now()): boolean {
  if (!isFreshElephantDraft(pr)) return false;
  const key = `${pr.sourceCard}|${pr.availableWares.join(',')}`;
  if (lastStomp && lastStomp.key === key && now - lastStomp.at < SAME_DRAFT_MS) return false;
  lastStomp = { key, at: now };
  return true;
}

/** Tests only. */
export function resetElephantStompForTests(): void {
  lastStomp = null;
  lockedUntil = 0;
}

/** The stomp lands this long after the trumpet starts (it fades from ~1.2s). */
export const TRUMPET_LEAD_MS = 1150;
/** A trumpet older than this belongs to an earlier play, not this draft. */
const TRUMPET_FRESH_MS = 6000;

/**
 * How long to hold the stomp so the Elephant's trumpet is heard first.
 * `sinceTrumpet` = ms since the trumpet last started (Infinity = never). No
 * fresh trumpet means it arrives with this same state (online/Cast), so wait
 * the full lead; a solo spotlight may already have played most of it.
 */
export function stompDelayAfterTrumpet(sinceTrumpet: number): number {
  if (!(sinceTrumpet >= 0) || sinceTrumpet > TRUMPET_FRESH_MS) return TRUMPET_LEAD_MS;
  return Math.max(0, TRUMPET_LEAD_MS - sinceTrumpet);
}

/** Per-token keyframes: up and away, then down into the slot with a small bounce. */
export function wareDropKeyframes(drop: WareDrop, i: number): Keyframe[] {
  const total = drop.land;
  const at = (ms: number) => Math.min(1, ms / total);
  const spin = (i % 2 === 0 ? 1 : -1) * (140 + (i * 37) % 120);
  const drift = ((i * 53) % 90) - 45;
  return [
    { offset: 0, transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { offset: at(drop.tossStart), transform: 'translate(0, 6px) scale(0.92)', opacity: 1, easing: 'cubic-bezier(.2,.7,.3,1)' },
    { offset: at(drop.tossEnd), transform: `translate(${drift}px, -70vh) rotate(${spin}deg) scale(1.1)`, opacity: 0 },
    { offset: at(drop.fallStart), transform: `translate(${-drift / 2}px, -55vh) rotate(${-spin}deg)`, opacity: 0 },
    { offset: at(drop.fallStart + 1), transform: `translate(${-drift / 2}px, -55vh) rotate(${-spin}deg)`, opacity: 1, easing: 'cubic-bezier(.55,0,1,.6)' },
    { offset: at(drop.land - 90), transform: 'translate(0, 6px) rotate(0deg) scale(1.04, 0.92)', opacity: 1, easing: 'ease-out' },
    { offset: 1, transform: 'translate(0, 0) scale(1)', opacity: 1 },
  ];
}

export const SHAKE_KEYFRAMES: Keyframe[] = [
  { transform: 'translate(0, 0)' },
  { transform: 'translate(-7px, 5px)' },
  { transform: 'translate(6px, -6px)' },
  { transform: 'translate(-5px, 3px)' },
  { transform: 'translate(4px, -2px)' },
  { transform: 'translate(-2px, 1px)' },
  { transform: 'translate(0, 0)' },
];

export function stompLockRemaining(now: number = Date.now()): number {
  return Math.max(0, lockedUntil - now);
}

export interface StompStage {
  sound: (event: AudioEvent, gain?: number, rate?: number) => void;
  /** The draft's ware tokens as they are on screen when the stomp lands. */
  pool: () => HTMLElement[];
  /** What shakes (the app root). */
  shake: () => HTMLElement | null;
}

/**
 * Stomp after `delayMs`: the sound always, the shake and the toss-and-drop
 * when `animate`. Timers are module-level on purpose — a panel remounting
 * during the trumpet must not cancel the stomp.
 */
export function scheduleElephantStomp(delayMs: number, animate: boolean, stage: StompStage, now: number = Date.now()): void {
  lockedUntil = animate ? now + delayMs + 2000 : 0; // refined once the pool size is known
  setTimeout(() => {
    stage.sound('elephant-stomp');
    const tokens = animate ? stage.pool() : [];
    if (tokens.length === 0 || typeof tokens[0].animate !== 'function') {
      lockedUntil = 0;
      return;
    }
    stage.shake()?.animate(SHAKE_KEYFRAMES, { duration: STOMP_SHAKE_MS, easing: 'ease-out' });
    const drops = elephantDropSchedule(tokens.length);
    lockedUntil = Date.now() + drops[drops.length - 1].land;
    drops.forEach((drop, i) => {
      tokens[i].animate(wareDropKeyframes(drop, i), { duration: drop.land, fill: 'backwards' });
      setTimeout(() => stage.sound('ware-land', 0.8, 0.95 + (i % 3) * 0.05), drop.land - 40);
    });
  }, delayMs);
}
