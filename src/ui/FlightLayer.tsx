import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameState } from '../engine/types.ts';
import { CardFace } from './CardFace.tsx';
import { anchorSelector, planFlights, snapshotForFlights } from './flights.ts';
import { planStrikes, strikeOwnsFlight } from './strikes.ts';
import type { Flight, FlightAnchor, FlightSnapshot } from './flights.ts';

export const FLIGHT_DURATION_MS = { ware: 560, coin: 480, card: 620 } as const;
/** A flying card: CardFace's `small` (96×128) at two-thirds. */
const FLIGHT_CARD_SCALE = 0.66;
/** Give up waiting for a spotlight that never showed (it's skipped, or off). */
export const SPOTLIGHT_WAIT_FALLBACK_MS = 3200;

interface PlannedFlight extends Flight {
  /** Resolved at plan time (a draft card's element is gone by launch). */
  fromPoint?: { x: number; y: number };
}

interface LaunchedFlight extends Flight {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

interface FlightLayerProps {
  state: GameState;
  /** The seat at the screen: the other seat's face-up plays are spotlit first.
   *  Null on the TV, which spotlights both seats' plays. */
  viewer: 0 | 1 | null;
  /** Whether the opponent-play spotlight runs (off in hotseat). */
  spotlightEnabled: boolean;
  /** True while a spotlight is on screen — flights wait for it to land. */
  spotlightActive: boolean;
  /** Called as each flight lands (sound hook). */
  onLand?: (flight: Flight) => void;
  /** True while any flight is waiting or in the air (the draw dialog waits for it). */
  onBusyChange?: (busy: boolean) => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function durationFactor(): number {
  if (typeof document === 'undefined') return 1;
  return document.documentElement.getAttribute('data-anim-speed') === 'fast' ? 0.7 : 1;
}

function centerOfElement(el: Element | null): { x: number; y: number } | null {
  if (!el) return null;
  let r = el.getBoundingClientRect();
  // display:contents wrappers have no box — measure what they hold
  if (r.width === 0 && r.height === 0 && el.firstElementChild) r = el.firstElementChild.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function centerOf(anchor: FlightAnchor): { x: number; y: number } | null {
  const at = centerOfElement(document.querySelector(anchorSelector(anchor)));
  if (at) return at;
  // a pool card not laid out (yet): the card running the draft, then the table
  if (anchor.type === 'draft-card') return centerOf({ type: 'draft-source' });
  if (anchor.type === 'draft-source') return centerOf({ type: 'table' });
  return null;
}

/** Where every draft-pool card sits right now (read before the next change). */
function measureDraftCards(): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  document.querySelectorAll<HTMLElement>('[data-draft-card]').forEach((el) => {
    const c = centerOfElement(el);
    const id = el.getAttribute('data-draft-card');
    if (c && id) out.set(id, c);
  });
  return out;
}

function draftCardElement(cardId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-draft-card="${cardId}"]`);
}

function slotElement(player: 0 | 1, index: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(anchorSelector({ type: 'slot', player, index }));
}

interface PendingGroup {
  flights: PlannedFlight[];
  waitForSpotlight: boolean;
  sawSpotlight: boolean;
  plannedAt: number;
}

/**
 * Animates what changes hands between game states: wares between markets
 * and the supply baskets, coins between gold totals and the table, cards
 * between hands. Purely presentational and click-through; skipped under
 * reduced motion.
 */
export function FlightLayer({ state, viewer, spotlightEnabled, spotlightActive, onLand, onBusyChange }: FlightLayerProps) {
  const prevRef = useRef<FlightSnapshot>(snapshotForFlights(state));
  const prevStateRef = useRef<GameState>(state);
  const nextIdRef = useRef(1);
  const pendingRef = useRef<PendingGroup[]>([]);
  const [launched, setLaunched] = useState<LaunchedFlight[]>([]);
  const [plannedThrough, setPlannedThrough] = useState(0);
  // Re-check timer for groups still waiting on a spotlight
  const [tick, setTick] = useState(0);
  const onLandRef = useRef(onLand);
  useLayoutEffect(() => {
    onLandRef.current = onLand;
  }, [onLand]);
  const draftCardsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Plan on every state change, before paint, so arriving slots never flash.
  useLayoutEffect(() => {
    const prev = prevRef.current;
    const next = snapshotForFlights(state);
    prevRef.current = next;
    const prevState = prevStateRef.current;
    prevStateRef.current = state;
    const lastDraftCards = draftCardsRef.current;
    draftCardsRef.current = measureDraftCards();
    if (prefersReducedMotion()) return;
    // an animal strike animates its own move (the stolen ware, the clawed coins)
    const strikes = planStrikes(prevState, state);
    const flights: PlannedFlight[] = planFlights(prev, next, nextIdRef.current)
      .filter((f) => !strikeOwnsFlight(strikes, f))
      .map((f) => f.from.type === 'draft-card' ? { ...f, fromPoint: lastDraftCards.get(f.from.cardId) } : f);
    if (flights.length === 0) return;
    nextIdRef.current = flights[flights.length - 1].id + 1;
    for (const f of flights) {
      if (f.revealsSlot) slotElement(f.revealsSlot.player, f.revealsSlot.index)?.setAttribute('data-incoming', '');
    }
    const newEntries = state.log.slice(prev.logLength);
    const waitForSpotlight = spotlightEnabled && newEntries.some((e) => e.card && (viewer === null || e.player !== viewer));
    pendingRef.current.push({ flights, waitForSpotlight, sawSpotlight: false, plannedAt: Date.now() });
    // Wakes the launch effect: the newest plan is identified by the next flight id
    setPlannedThrough(nextIdRef.current);
    // spotlightEnabled/viewer are read at plan time on purpose
  }, [state]);

  // Launch groups whose spotlight has landed (or that never needed one).
  useEffect(() => {
    if (pendingRef.current.length === 0) return;
    const ready: PlannedFlight[] = [];
    const waiting: PendingGroup[] = [];
    for (const pending of pendingRef.current) {
      const g = pending.waitForSpotlight && spotlightActive ? { ...pending, sawSpotlight: true } : pending;
      const timedOut = Date.now() - g.plannedAt > SPOTLIGHT_WAIT_FALLBACK_MS;
      if (!g.waitForSpotlight || (g.sawSpotlight && !spotlightActive) || timedOut) ready.push(...g.flights);
      else waiting.push(g);
    }
    pendingRef.current = waiting;
    if (ready.length > 0) {
      const out: LaunchedFlight[] = [];
      for (const f of ready) {
        const from = f.fromPoint ?? (f.from.type === 'draft-card' ? null : centerOf(f.from));
        const to = centerOf(f.to);
        if (!from || !to) {
          if (f.revealsSlot) slotElement(f.revealsSlot.player, f.revealsSlot.index)?.removeAttribute('data-incoming');
          continue;
        }
        out.push({ ...f, x: from.x, y: from.y, dx: to.x - from.x, dy: to.y - from.y });
        // a card flying into the draft pool: its spot stays empty until it lands
        if (f.to.type === 'draft-card') draftCardElement(f.to.cardId)?.setAttribute('data-incoming', '');
      }
      // DOM was measured above; commit the sprites from a microtask, not the effect body
      if (out.length > 0) queueMicrotask(() => setLaunched((cur) => [...cur, ...out]));
    }
    if (waiting.length === 0) return;
    // re-check for the fallback even if the spotlight flag never changes
    const timer = window.setTimeout(() => setTick((t) => t + 1), 400);
    return () => window.clearTimeout(timer);
  }, [spotlightActive, plannedThrough, tick]);

  // Pending groups live in a ref, so busy is read after the launch effect ran
  const flying = launched.length > 0;
  useEffect(() => {
    onBusyChange?.(flying || pendingRef.current.length > 0);
  }, [flying, plannedThrough, tick, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  // Stable identity: sprites key their animation effect on it
  const land = useCallback((f: LaunchedFlight) => {
    setLaunched((cur) => cur.filter((x) => x.id !== f.id));
    if (f.to.type === 'draft-card') draftCardElement(f.to.cardId)?.removeAttribute('data-incoming');
    if (f.revealsSlot) {
      const el = slotElement(f.revealsSlot.player, f.revealsSlot.index);
      el?.removeAttribute('data-incoming');
      el?.classList.add('market-slot-landed');
      window.setTimeout(() => el?.classList.remove('market-slot-landed'), 420);
    }
    onLandRef.current?.(f);
  }, []);

  if (launched.length === 0) return null;
  return (
    <div className="flight-layer" aria-hidden="true">
      {launched.map((f) => <FlightSprite key={f.id} flight={f} onDone={land} />)}
    </div>
  );
}

function FlightSprite({ flight, onDone }: { flight: LaunchedFlight; onDone: (f: LaunchedFlight) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    const duration = Math.round(FLIGHT_DURATION_MS[flight.kind] * durationFactor());
    const arc = Math.min(90, 30 + Math.hypot(flight.dx, flight.dy) * 0.18);
    if (!el || typeof el.animate !== 'function') {
      const t = window.setTimeout(() => onDone(flight), flight.delayMs + duration);
      return () => window.clearTimeout(t);
    }
    const anim = el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.85)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.08 },
        { transform: `translate(calc(-50% + ${flight.dx / 2}px), calc(-50% + ${flight.dy / 2 - arc}px)) scale(1.18)`, opacity: 1, offset: 0.5 },
        { transform: `translate(calc(-50% + ${flight.dx}px), calc(-50% + ${flight.dy}px)) scale(0.92)`, opacity: 1 },
      ],
      { duration, delay: flight.delayMs, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'both' },
    );
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDone(flight);
    };
    anim.onfinish = finish;
    anim.oncancel = finish;
    return () => {
      anim.onfinish = null;
      anim.oncancel = null;
    };
  }, [flight, onDone]);

  return (
    <div ref={ref} className={`flight flight-${flight.kind}`} style={{ left: flight.x, top: flight.y }}>
      {flight.kind === 'ware' && flight.ware && <img src={`/assets/tokens/${flight.ware}.png`} alt="" draggable={false} />}
      {flight.kind === 'coin' && <span className="flight-coin" />}
      {/* a real card face — white frame and name — never bare art */}
      {flight.kind === 'card' && (flight.cardId
        ? <CardFace cardId={flight.cardId} small scale={FLIGHT_CARD_SCALE} />
        : <CardFace cardId="ware_3k_1" faceDown small scale={FLIGHT_CARD_SCALE} />)}
    </div>
  );
}
