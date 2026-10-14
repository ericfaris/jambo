import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { DeckCardId, GameState } from '../engine/types.ts';
import { CardFace, WareToken } from './CardFace.tsx';
import { anchorSelector } from './flights.ts';
import type { FlightAnchor } from './flights.ts';
import { planStrikes, pruneChips, pruneMarks, strikeMarks } from './strikes.ts';
import type { ChipMark, DamageMark, Strike } from './strikes.ts';
import { playSfx } from './useAudioEvents.ts';

/** One strike's beat at normal speed: lift → hit → hold → travel. */
export const STRIKE_TIMINGS = { liftMs: 260, hitMs: 320, travelAtMs: 980, totalMs: 1640 } as const;
/** Give up waiting for the board to clear (a spotlight that never ends). */
export const STRIKE_WAIT_FALLBACK_MS = 4500;
/** Let a closing panel fade before the strike starts. */
const STRIKE_SETTLE_MS = 180;

interface Rect { x: number; y: number; w: number; h: number }

interface QueuedStrike {
  id: number;
  strike: Strike;
  /** Where each target sat before the change removed it (utility row, hand). */
  from: Map<string, Rect>;
  queuedAt: number;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function speedFactor(): number {
  if (typeof document === 'undefined') return 1;
  return document.documentElement.getAttribute('data-anim-speed') === 'fast' ? 0.7 : 1;
}

function rectOf(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function rectOfAnchor(anchor: FlightAnchor): Rect | null {
  return rectOf(document.querySelector(anchorSelector(anchor)));
}

/** Every utility card and hand card on the board, measured now (read on the next change). */
function measureTargets(): Map<string, Rect> {
  const out = new Map<string, Rect>();
  document.querySelectorAll('[data-utility-card], [data-hand-card]').forEach((el) => {
    const id = el.getAttribute('data-utility-card') ?? el.getAttribute('data-hand-card');
    const r = rectOf(el.querySelector('.card-face') ?? el);
    if (id && r) out.set(id, r);
  });
  return out;
}

function slotEl(player: 0 | 1, index: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(anchorSelector({ type: 'slot', player, index }));
}

/** The cards each strike takes out of sight until it lands. */
function heldCards(strike: Strike, viewer: 0 | 1): { discard: DeckCardId[]; hidden: DeckCardId[] } {
  switch (strike.kind) {
    case 'bite': return { discard: [strike.cardId], hidden: [] };
    case 'venom': return { discard: strike.cardIds, hidden: [] };
    case 'gnaw': return { discard: [], hidden: strike.cardId && strike.taker === viewer ? [strike.cardId] : [] };
    default: return { discard: [], hidden: [] };
  }
}

export interface StrikeDirector {
  layer: ReactNode;
  marks: ReadonlyMap<DeckCardId, DamageMark>;
  chips: readonly ChipMark[];
  hidden: ReadonlySet<DeckCardId>;
  heldDiscard: readonly DeckCardId[];
  /** A strike is waiting or playing: the AI holds its next move. */
  busy: boolean;
}

/**
 * Animal strikes for the board: plans them from each state change, waits
 * until the board is clear (spotlights done, no panel waiting on you), plays
 * them one at a time, and keeps the marks they leave while in sight.
 */
export function useStrikes({ state, viewer, blocked, enabled }: {
  state: GameState;
  viewer: 0 | 1;
  /** A spotlight is still queued, or a panel waits on the viewer. */
  blocked: boolean;
  /** Off in hotseat? No — strikes are a shared table moment; off only when the game is over. */
  enabled: boolean;
}): StrikeDirector {
  const prevRef = useRef<GameState>(state);
  const rectsRef = useRef<Map<string, Rect>>(new Map());
  const nextId = useRef(1);
  const [queue, setQueue] = useState<QueuedStrike[]>([]);
  const [marks, setMarks] = useState<Map<DeckCardId, DamageMark>>(() => new Map());
  const [chips, setChips] = useState<ChipMark[]>([]);

  const applyMarks = useCallback((strike: Strike) => {
    const add = strikeMarks(strike, viewer);
    if (add.length > 0) {
      setMarks((cur) => {
        const out = new Map(cur);
        for (const m of add) out.set(m.cardId, { damage: m.damage, where: m.where });
        return out;
      });
    }
    if (strike.kind === 'peck') {
      setChips((cur) => [...cur.filter((c) => !(c.player === strike.thief && c.index === strike.toIndex)), { player: strike.thief, index: strike.toIndex, ware: strike.ware }]);
    }
  }, [viewer]);

  // Plan before paint, from rects measured the render before the change
  useLayoutEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    const lastRects = rectsRef.current;
    rectsRef.current = measureTargets();
    if (state.log.length < prev.log.length) {
      // a new game: forget everything
      setQueue([]);
      setMarks(new Map());
      setChips([]);
      return;
    }
    if (!enabled) return;
    const planned = planStrikes(prev, state);
    if (planned.length === 0) return;
    if (prefersReducedMotion()) {
      planned.forEach(applyMarks);
      return;
    }
    const now = Date.now();
    const fresh = planned.map((strike) => {
      const from = new Map<string, Rect>();
      const ids = strike.kind === 'bite' ? [strike.cardId] : strike.kind === 'venom' ? strike.cardIds : strike.kind === 'gnaw' && strike.cardId ? [strike.cardId] : [];
      for (const id of ids) {
        const r = lastRects.get(id);
        if (r) from.set(id, r);
      }
      // a pecked ware's new slot stays empty until it lands
      if (strike.kind === 'peck') slotEl(strike.thief, strike.toIndex)?.setAttribute('data-incoming', '');
      return { id: nextId.current++, strike, from, queuedAt: now };
    });
    setQueue((q) => [...q, ...fresh]);
    // enabled/applyMarks are read at plan time on purpose
  }, [state]);

  // Marks heal once their card or ware leaves where it was left
  useEffect(() => {
    setMarks((cur) => (cur.size === 0 ? cur : pruneMarks(cur, state.discardPile, state.players[viewer].hand)));
    setChips((cur) => (cur.length === 0 ? cur : pruneChips(cur, [state.players[0].market, state.players[1].market])));
  }, [state, viewer]);

  // Start the head of the queue once the board is clear (or the wait runs out)
  const current = queue[0] ?? null;
  const [playing, setPlaying] = useState<number | null>(null);
  useEffect(() => {
    if (!current || playing === current.id) return;
    const waited = Date.now() - current.queuedAt;
    if (blocked && waited < STRIKE_WAIT_FALLBACK_MS) {
      const t = window.setTimeout(() => setQueue((q) => [...q]), Math.max(200, STRIKE_WAIT_FALLBACK_MS - waited));
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setPlaying(current.id), STRIKE_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [current, blocked, playing]);

  const finish = useCallback((q: QueuedStrike) => {
    applyMarks(q.strike);
    if (q.strike.kind === 'peck') slotEl(q.strike.thief, q.strike.toIndex)?.removeAttribute('data-incoming');
    setQueue((cur) => cur.filter((x) => x.id !== q.id));
    setPlaying(null);
  }, [applyMarks]);

  const { heldDiscard, hidden } = useMemo(() => {
    const d: DeckCardId[] = [];
    const h = new Set<DeckCardId>();
    for (const q of queue) {
      const held = heldCards(q.strike, viewer);
      d.push(...held.discard);
      held.hidden.forEach((id) => h.add(id));
    }
    return { heldDiscard: d, hidden: h };
  }, [queue, viewer]);

  const layer = queue.length === 0 ? null : (
    <div className="strike-layer" aria-hidden="true">
      {current && <StrikeSprite key={current.id} queued={current} viewer={viewer} started={playing === current.id} onDone={finish} />}
    </div>
  );

  return { layer, marks, chips, hidden, heldDiscard, busy: queue.length > 0 };
}

// --- One strike on screen ----------------------------------------------------

function StrikeSprite({ queued, viewer, started, onDone }: { queued: QueuedStrike; viewer: 0 | 1; started: boolean; onDone: (q: QueuedStrike) => void }) {
  const { strike } = queued;
  const [hit, setHit] = useState(false);
  const [travel, setTravel] = useState(false);

  // Destinations, measured as the strike starts
  const geometry = useMemo(() => strikeGeometry(queued, viewer), [queued, viewer, started]);

  useEffect(() => {
    if (!started) return;
    const f = speedFactor();
    const timers = [
      window.setTimeout(() => {
        setHit(true);
        if (strike.kind === 'bite') playSfx('crocodile', 0.9);
        if (strike.kind === 'peck') {
          playSfx('ware-land', 0.6, 1.25);
          window.setTimeout(() => playSfx('ware-land', 0.5, 1.35), 110);
          window.setTimeout(() => playSfx('ware-land', 0.5, 1.2), 220);
        }
      }, Math.round(STRIKE_TIMINGS.hitMs * f)),
      window.setTimeout(() => setTravel(true), Math.round(STRIKE_TIMINGS.travelAtMs * f)),
      window.setTimeout(() => onDone(queued), Math.round(STRIKE_TIMINGS.totalMs * f)),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [started, queued, onDone, strike.kind]);

  const phase = !started ? 'rest' : travel ? 'travel' : hit ? 'hit' : 'lift';
  return (
    <>
      {geometry.pieces.map((p) => (
        <div
          key={p.key}
          className={`strike strike-${strike.kind} strike-${phase}`}
          style={{
            left: p.at.x,
            top: p.at.y,
            width: p.at.w,
            height: p.at.h,
            '--dx': `${p.to ? p.to.x + p.to.w / 2 - (p.at.x + p.at.w / 2) : 0}px`,
            '--dy': `${p.to ? p.to.y + p.to.h / 2 - (p.at.y + p.at.h / 2) : 0}px`,
            '--to-scale': p.to ? Math.max(0.35, Math.min(1.2, p.to.h / Math.max(1, p.at.h))).toFixed(3) : '1',
            '--stagger': `${p.stagger}ms`,
          } as CSSProperties}
        >
          {p.body(phase !== 'rest' && phase !== 'lift')}
        </div>
      ))}
      {strike.kind === 'venom' && started && geometry.kept.map((r, i) => (
        <div key={`kept-${i}`} className="strike-kept" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
      ))}
    </>
  );
}

interface Piece {
  key: string;
  at: Rect;
  to: Rect | null;
  stagger: number;
  body: (damaged: boolean) => ReactNode;
}

function centered(anchor: Rect | null, w: number, h: number): Rect | null {
  if (!anchor) return null;
  return { x: anchor.x + anchor.w / 2 - w / 2, y: anchor.y + anchor.h / 2 - h / 2, w, h };
}

const CARD_W = 72;
const CARD_H = 96;

function cardBody(cardId: DeckCardId | null, damage: 'bite' | 'gnaw' | 'venom') {
  return (damaged: boolean) => (
    <div className="strike-card">
      {cardId
        ? <CardFace cardId={cardId} fill strikeOverlay damage={damaged ? damage : null} />
        : <CardFace cardId="ware_3k_1" faceDown small />}
    </div>
  );
}

function strikeGeometry(q: QueuedStrike, viewer: 0 | 1): { pieces: Piece[]; kept: Rect[] } {
  const { strike } = q;
  const discard = rectOf(document.querySelector('[data-spotlight-target="discard"] .card-face') ?? document.querySelector('[data-spotlight-target="discard"]'));
  const pieces: Piece[] = [];
  const kept: Rect[] = [];
  switch (strike.kind) {
    case 'bite': {
      const at = q.from.get(strike.cardId) ?? centered(rectOfAnchor({ type: 'utilities', player: strike.victim }), CARD_W, CARD_H);
      if (at) pieces.push({ key: strike.cardId, at, to: discard, stagger: 0, body: cardBody(strike.cardId, 'bite') });
      break;
    }
    case 'venom': {
      strike.cardIds.forEach((id, i) => {
        const at = q.from.get(id) ?? centered(rectOfAnchor({ type: 'utilities', player: strike.owners[i] }), CARD_W, CARD_H);
        if (at) pieces.push({ key: id, at, to: discard, stagger: i * 90, body: cardBody(id, 'venom') });
      });
      for (const id of strike.kept) {
        const r = rectOf(document.querySelector(`[data-utility-card="${id}"] .card-face`) ?? document.querySelector(`[data-utility-card="${id}"]`));
        if (r) kept.push(r);
      }
      break;
    }
    case 'gnaw': {
      // out of the victim's hand: your own card from where it sat, theirs from their fan
      // (the take lands in the taker's hand a step before the swap is logged)
      const fromHand = strike.victim === viewer && strike.cardId ? q.from.get(strike.cardId) : undefined;
      const at = fromHand ?? centered(rectOfAnchor({ type: 'hand', player: strike.victim }), CARD_W, CARD_H);
      const toHand = strike.taker === viewer && strike.cardId
        ? rectOf(document.querySelector(`[data-hand-card="${strike.cardId}"] .card-face`)) ?? rectOfAnchor({ type: 'hand', player: strike.taker })
        : centered(rectOfAnchor({ type: 'hand', player: strike.taker }), CARD_W * 0.6, CARD_H * 0.6);
      // the victim's hidden hand: show the card the hyena chose, face up
      if (at) pieces.push({ key: 'gnaw', at, to: toHand, stagger: 0, body: cardBody(strike.cardId, 'gnaw') });
      break;
    }
    case 'peck': {
      const from = rectOfAnchor({ type: 'slot', player: strike.victim, index: strike.fromIndex });
      const to = rectOfAnchor({ type: 'slot', player: strike.thief, index: strike.toIndex });
      const at = centered(from, 38, 38);
      if (at) {
        pieces.push({
          key: 'peck', at, to: centered(to, 38, 38), stagger: 0,
          body: (damaged) => (
            <div className="strike-token">
              <span className={damaged ? 'ware-chipped' : undefined}><WareToken type={strike.ware} size={38} /></span>
              <span className="strike-feathers"><i /><i /><i /><i /></span>
            </div>
          ),
        });
      }
      break;
    }
    case 'claw': {
      const from = rectOfAnchor({ type: 'gold', player: strike.victim });
      const to = rectOfAnchor({ type: 'gold', player: strike.payee });
      const at = centered(from, 30 * strike.coins + 12, 46);
      if (at) {
        pieces.push({
          key: 'claw', at, to: centered(to, at.w, at.h), stagger: 0,
          body: () => (
            <div className="strike-coins">
              {Array.from({ length: strike.coins }, (_, i) => <span key={i} className="strike-coin">g</span>)}
              <svg className="strike-claws" viewBox="0 0 100 46" preserveAspectRatio="none"><path d="M6 6 C 34 18, 60 28, 94 40" /><path d="M2 18 C 30 28, 56 38, 86 46" /><path d="M16 0 C 44 10, 70 20, 100 30" /></svg>
              <span className="strike-speed" />
            </div>
          ),
        });
      }
      break;
    }
    case 'guard': {
      const area = rectOf(document.querySelector(`[data-center-target="${strike.defender === viewer ? 'bottom' : 'top'}"]`));
      const at = centered(area ?? { x: window.innerWidth / 2 - 60, y: window.innerHeight / 2 - 80, w: 120, h: 160 }, 96, 128);
      if (at) {
        pieces.push({
          key: 'guard', at, to: null, stagger: 0,
          body: () => (
            <div className="strike-shield">
              <CardFace cardId={strike.guardCard} fill strikeOverlay damage={null} />
              <span className="strike-spark" />
            </div>
          ),
        });
      }
      break;
    }
  }
  return { pieces, kept };
}
