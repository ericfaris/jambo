import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameState } from '../engine/types.ts';
import { anchorSelector, planFlights, snapshotForFlights } from './flights.ts';
import type { Flight, FlightAnchor, FlightSnapshot } from './flights.ts';

export const FLIGHT_DURATION_MS = { ware: 560, coin: 480, card: 620 } as const;
/** Give up waiting for a spotlight that never showed (it's skipped, or off). */
export const SPOTLIGHT_WAIT_FALLBACK_MS = 3200;

interface LaunchedFlight extends Flight {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

interface FlightLayerProps {
  state: GameState;
  /** The seat at the screen: the other seat's face-up plays are spotlit first. */
  viewer: 0 | 1;
  /** Whether the opponent-play spotlight runs (off in hotseat). */
  spotlightEnabled: boolean;
  /** True while a spotlight is on screen — flights wait for it to land. */
  spotlightActive: boolean;
  /** Called as each flight lands (sound hook). */
  onLand?: (flight: Flight) => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function durationFactor(): number {
  if (typeof document === 'undefined') return 1;
  return document.documentElement.getAttribute('data-anim-speed') === 'fast' ? 0.7 : 1;
}

function centerOf(anchor: FlightAnchor): { x: number; y: number } | null {
  const el = document.querySelector<HTMLElement>(anchorSelector(anchor));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function slotElement(player: 0 | 1, index: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(anchorSelector({ type: 'slot', player, index }));
}

interface PendingGroup {
  flights: Flight[];
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
export function FlightLayer({ state, viewer, spotlightEnabled, spotlightActive, onLand }: FlightLayerProps) {
  const prevRef = useRef<FlightSnapshot>(snapshotForFlights(state));
  const nextIdRef = useRef(1);
  const pendingRef = useRef<PendingGroup[]>([]);
  const [launched, setLaunched] = useState<LaunchedFlight[]>([]);
  const [tick, setTick] = useState(0);
  const onLandRef = useRef(onLand);
  onLandRef.current = onLand;

  // Plan on every state change, before paint, so arriving slots never flash.
  useLayoutEffect(() => {
    const prev = prevRef.current;
    const next = snapshotForFlights(state);
    prevRef.current = next;
    if (prefersReducedMotion()) return;
    const flights = planFlights(prev, next, nextIdRef.current);
    if (flights.length === 0) return;
    nextIdRef.current = flights[flights.length - 1].id + 1;
    for (const f of flights) {
      if (f.revealsSlot) slotElement(f.revealsSlot.player, f.revealsSlot.index)?.setAttribute('data-incoming', '');
    }
    const newEntries = state.log.slice(prev.logLength);
    const waitForSpotlight = spotlightEnabled && newEntries.some((e) => e.card && e.player !== viewer);
    pendingRef.current.push({ flights, waitForSpotlight, sawSpotlight: false, plannedAt: Date.now() });
    setTick((t) => t + 1);
    // spotlightEnabled/viewer are read at plan time on purpose
  }, [state]);

  // Launch groups whose spotlight has landed (or that never needed one).
  useEffect(() => {
    if (pendingRef.current.length === 0) return;
    const ready: Flight[] = [];
    const waiting: PendingGroup[] = [];
    for (const g of pendingRef.current) {
      if (g.waitForSpotlight && spotlightActive) g.sawSpotlight = true;
      const timedOut = Date.now() - g.plannedAt > SPOTLIGHT_WAIT_FALLBACK_MS;
      if (!g.waitForSpotlight || (g.sawSpotlight && !spotlightActive) || timedOut) ready.push(...g.flights);
      else waiting.push(g);
    }
    pendingRef.current = waiting;
    if (ready.length > 0) {
      const out: LaunchedFlight[] = [];
      for (const f of ready) {
        const from = centerOf(f.from);
        const to = centerOf(f.to);
        if (!from || !to) {
          if (f.revealsSlot) slotElement(f.revealsSlot.player, f.revealsSlot.index)?.removeAttribute('data-incoming');
          continue;
        }
        out.push({ ...f, x: from.x, y: from.y, dx: to.x - from.x, dy: to.y - from.y });
      }
      if (out.length > 0) setLaunched((cur) => [...cur, ...out]);
    }
    if (waiting.length === 0) return;
    // re-check for the fallback even if the spotlight flag never changes
    const timer = window.setTimeout(() => setTick((t) => t + 1), 400);
    return () => window.clearTimeout(timer);
  }, [spotlightActive, tick]);

  // Stable identity: sprites key their animation effect on it
  const land = useCallback((f: LaunchedFlight) => {
    setLaunched((cur) => cur.filter((x) => x.id !== f.id));
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
      {flight.kind === 'card' && <img src="/assets/cards/card_back.png" alt="" draggable={false} />}
    </div>
  );
}
