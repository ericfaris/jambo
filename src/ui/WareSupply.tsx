import { useRef } from 'react';
import type { CSSProperties } from 'react';
import type { WareType } from '../engine/types.ts';
import { INITIAL_WARE_SUPPLY, WARE_TYPES } from '../engine/types.ts';

type SupplyChange = 'took' | 'got' | null;

/**
 * Which way each ware's count last moved, kept for as long as the count
 * stays put — so a re-render mid-animation never cuts the lift/drop short.
 * Pure — exported for tests.
 */
export function supplyChanges(
  prev: Record<WareType, { n: number; change: SupplyChange }> | null,
  supply: Record<WareType, number>,
): Record<WareType, { n: number; change: SupplyChange }> {
  const out = {} as Record<WareType, { n: number; change: SupplyChange }>;
  for (const w of WARE_TYPES) {
    const before = prev?.[w];
    const n = supply[w];
    out[w] = !before ? { n, change: null }
      : n === before.n ? before
      : { n, change: n < before.n ? 'took' : 'got' };
  }
  return out;
}

/**
 * The shared ware supply as six baskets with live counts. Supply limits
 * decide whether a buy is possible, but the pool used to be invisible
 * (2026-10-11 review). Each basket carries data-supply-ware so trade
 * animations can fly tokens to and from it.
 *
 * Desktop (2026-10-13): a framed tray like the turn plaque; each basket's
 * gold ring drains as that ware runs out, and a token lifts out / drops in
 * when its count changes.
 */
export function WareSupply({ supply, compact = false, highlight = null }: {
  supply: Record<WareType, number>;
  compact?: boolean;
  /** A ware that just blocked a play ("supply has run out of tea") — pulses. */
  highlight?: WareType | null;
}) {
  const total = WARE_TYPES.reduce((n, w) => n + supply[w], 0);
  const changesRef = useRef<Record<WareType, { n: number; change: SupplyChange }> | null>(null);
  const changes = supplyChanges(changesRef.current, supply);
  changesRef.current = changes;
  return (
    <div className={compact ? 'ware-supply ware-supply-compact' : 'ware-supply ware-supply-tray'} aria-label={`Ware supply: ${WARE_TYPES.map((w) => `${supply[w]} ${w}`).join(', ')}`}>
      {!compact && (
        <>
          <span className="supply-stud supply-stud-l" aria-hidden="true" />
          <span className="supply-stud supply-stud-r" aria-hidden="true" />
          <div className="ware-supply-title">
            <span className="turn-plaque-rule" aria-hidden="true" />
            Supply
            <span className="turn-plaque-rule" aria-hidden="true" />
          </div>
        </>
      )}
      <div className="ware-supply-grid">
        {WARE_TYPES.map((ware, i) => {
          const n = supply[ware];
          const full = INITIAL_WARE_SUPPLY[ware];
          const low = n > 0 && n <= Math.ceil(full / 3);
          const change = changes[ware].change;
          return (
            <div
              key={ware}
              data-supply-ware={ware}
              className={`ware-basket${n === 0 ? ' ware-basket-empty' : ''}${low ? ' ware-basket-low' : ''}${highlight === ware ? ' ware-basket-alert' : ''}`}
              style={{ '--left': `${Math.round((n / full) * 360)}deg`, '--i': i } as CSSProperties}
              title={n === 0 ? `No ${ware} left in the supply` : `${n} of ${full} ${ware} left in the supply`}
            >
              {/* keyed on the count: each change replays the lift-out / drop-in */}
              <span key={n} className={`ware-basket-token${change ? ` ware-basket-${change}` : ''}`}>
                <img src={`/assets/tokens/${ware}.png`} alt="" draggable={false} />
              </span>
              <span key={`c${n}`} className={`ware-basket-count${change ? ' ware-basket-count-changed' : ''}`}>{n}</span>
            </div>
          );
        })}
      </div>
      {!compact && <div className="ware-supply-total">{total} {total === 1 ? 'ware' : 'wares'} left</div>}
    </div>
  );
}

/** "The supply has run out of tea." → 'tea' (friendlyPlayError wording). */
export function supplyWareFromError(message: string | null | undefined): WareType | null {
  const m = message?.match(/run out of (\w+)/);
  const w = m?.[1];
  return w && (WARE_TYPES as readonly string[]).includes(w) ? (w as WareType) : null;
}
