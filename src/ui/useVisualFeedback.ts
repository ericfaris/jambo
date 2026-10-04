import { useEffect, useRef, useState } from 'react';
import type { DeckCardId, Phase, WareType } from '../engine/types.ts';
import { FEEDBACK_TIMINGS } from './animationTimings.ts';

interface FeedbackPlayerSnapshot {
  gold: number;
  handCount: number;
  market: (WareType | null)[];
}

interface FeedbackLogEntry {
  player: 0 | 1;
  action: string;
}

interface FeedbackSnapshot {
  phase: Phase;
  actionsLeft: number;
  deckCount: number;
  discardCount: number;
  topDiscardCard: DeckCardId | null;
  players: [FeedbackPlayerSnapshot, FeedbackPlayerSnapshot];
  lastLog: FeedbackLogEntry | null;
}

export interface FeedbackTrail {
  id: number;
  kind: 'draw' | 'discard';
  actor: 0 | 1;
  cardId: DeckCardId | null;
}

export interface VisualFeedbackState {
  deckPulse: number;
  discardPulse: number;
  actionsPulse: number;
  phasePulse: number;
  marketFlashSlots: [number[], number[]];
  goldDeltas: [number, number];
  trail: FeedbackTrail | null;
}

function findChangedMarketSlots(
  previousMarket: (WareType | null)[],
  nextMarket: (WareType | null)[]
): number[] {
  const max = Math.max(previousMarket.length, nextMarket.length);
  const changed: number[] = [];
  for (let index = 0; index < max; index++) {
    if ((previousMarket[index] ?? null) !== (nextMarket[index] ?? null)) {
      changed.push(index);
    }
  }
  return changed;
}

const DRAW_LOG_ACTIONS = new Set([
  'DRAW_CARD',
  'KEEP_CARD',
  'TRIBAL_ELDER_DRAW',
  'SUPPLIES_DRAW',
]);

const DISCARD_LOG_ACTIONS = new Set([
  'DISCARD_DRAWN',
  'PLAY_CARD',
  'PLAY_PEOPLE',
  'PLAY_ANIMAL',
  'PLAY_UTILITY',
  'PLAY_STAND',
  'CROCODILE_DISCARD',
  'OPPONENT_DISCARD',
]);

function detectActor(
  kind: 'draw' | 'discard',
  previousSnapshot: FeedbackSnapshot,
  nextSnapshot: FeedbackSnapshot
): 0 | 1 {
  const actionSet = kind === 'draw' ? DRAW_LOG_ACTIONS : DISCARD_LOG_ACTIONS;
  const lastLog = nextSnapshot.lastLog;

  if (lastLog && actionSet.has(lastLog.action)) {
    return lastLog.player;
  }

  if (kind === 'draw') {
    const p0Delta = nextSnapshot.players[0].handCount - previousSnapshot.players[0].handCount;
    const p1Delta = nextSnapshot.players[1].handCount - previousSnapshot.players[1].handCount;
    if (p0Delta > p1Delta && p0Delta > 0) return 0;
    if (p1Delta > 0) return 1;
  } else {
    const p0Delta = nextSnapshot.players[0].handCount - previousSnapshot.players[0].handCount;
    const p1Delta = nextSnapshot.players[1].handCount - previousSnapshot.players[1].handCount;
    if (p0Delta < p1Delta && p0Delta < 0) return 0;
    if (p1Delta < 0) return 1;
  }

  return 0;
}

export function useVisualFeedback(snapshot: FeedbackSnapshot): VisualFeedbackState {
  const previousRef = useRef<FeedbackSnapshot | null>(null);
  const clearTrailTimerRef = useRef<number | null>(null);
  const clearMarketTimerRef = useRef<number | null>(null);
  const clearGoldTimerRef = useRef<number | null>(null);

  const [deckPulse, setDeckPulse] = useState(0);
  const [discardPulse, setDiscardPulse] = useState(0);
  const [actionsPulse, setActionsPulse] = useState(0);
  const [phasePulse, setPhasePulse] = useState(0);
  const [marketFlashSlots, setMarketFlashSlots] = useState<[number[], number[]]>([[], []]);
  const [goldDeltas, setGoldDeltas] = useState<[number, number]>([0, 0]);
  const [trail, setTrail] = useState<FeedbackTrail | null>(null);

  useEffect(() => {
    const previousSnapshot = previousRef.current;
    if (!previousSnapshot) {
      previousRef.current = snapshot;
      return;
    }

    if (snapshot.phase !== previousSnapshot.phase) {
      setPhasePulse((value) => value + 1);
    }

    if (snapshot.actionsLeft < previousSnapshot.actionsLeft) {
      setActionsPulse((value) => value + 1);
    }

    if (snapshot.deckCount < previousSnapshot.deckCount) {
      setDeckPulse((value) => value + 1);
      const actor = detectActor('draw', previousSnapshot, snapshot);
      const nextTrail: FeedbackTrail = {
        id: Date.now(),
        kind: 'draw',
        actor,
        cardId: null,
      };
      setTrail(nextTrail);
      if (clearTrailTimerRef.current) {
        window.clearTimeout(clearTrailTimerRef.current);
      }
      clearTrailTimerRef.current = window.setTimeout(() => setTrail(null), FEEDBACK_TIMINGS.trailDurationMs);
    }

    if (snapshot.discardCount > previousSnapshot.discardCount) {
      setDiscardPulse((value) => value + 1);
      const actor = detectActor('discard', previousSnapshot, snapshot);
      const nextTrail: FeedbackTrail = {
        id: Date.now() + 1,
        kind: 'discard',
        actor,
        cardId: snapshot.topDiscardCard,
      };
      setTrail(nextTrail);
      if (clearTrailTimerRef.current) {
        window.clearTimeout(clearTrailTimerRef.current);
      }
      clearTrailTimerRef.current = window.setTimeout(() => setTrail(null), FEEDBACK_TIMINGS.trailDurationMs);
    }

    const nextMarketFlashSlots: [number[], number[]] = [
      findChangedMarketSlots(previousSnapshot.players[0].market, snapshot.players[0].market),
      findChangedMarketSlots(previousSnapshot.players[1].market, snapshot.players[1].market),
    ];

    if (nextMarketFlashSlots[0].length > 0 || nextMarketFlashSlots[1].length > 0) {
      setMarketFlashSlots(nextMarketFlashSlots);
      if (clearMarketTimerRef.current) {
        window.clearTimeout(clearMarketTimerRef.current);
      }
      clearMarketTimerRef.current = window.setTimeout(() => setMarketFlashSlots([[], []]), FEEDBACK_TIMINGS.marketFlashDurationMs);
    }

    const nextGoldDeltas: [number, number] = [
      snapshot.players[0].gold - previousSnapshot.players[0].gold,
      snapshot.players[1].gold - previousSnapshot.players[1].gold,
    ];

    if (nextGoldDeltas[0] !== 0 || nextGoldDeltas[1] !== 0) {
      setGoldDeltas(nextGoldDeltas);
      if (clearGoldTimerRef.current) {
        window.clearTimeout(clearGoldTimerRef.current);
      }
      clearGoldTimerRef.current = window.setTimeout(() => setGoldDeltas([0, 0]), FEEDBACK_TIMINGS.goldDeltaDurationMs);
    }

    previousRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    return () => {
      if (clearTrailTimerRef.current) {
        window.clearTimeout(clearTrailTimerRef.current);
      }
      if (clearMarketTimerRef.current) {
        window.clearTimeout(clearMarketTimerRef.current);
      }
      if (clearGoldTimerRef.current) {
        window.clearTimeout(clearGoldTimerRef.current);
      }
    };
  }, []);

  return {
    deckPulse,
    discardPulse,
    actionsPulse,
    phasePulse,
    marketFlashSlots,
    goldDeltas,
    trail,
  };
}