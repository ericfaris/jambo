import type { WareType } from '../engine/types.ts';
import { INITIAL_WARE_SUPPLY, WARE_TYPES } from '../engine/types.ts';

/**
 * The shared ware supply as six baskets with live counts. Supply limits
 * decide whether a buy is possible, but the pool used to be invisible
 * (2026-10-11 review). Each basket carries data-supply-ware so trade
 * animations can fly tokens to and from it.
 */
export function WareSupply({ supply, compact = false, highlight = null }: {
  supply: Record<WareType, number>;
  compact?: boolean;
  /** A ware that just blocked a play ("supply has run out of tea") — pulses. */
  highlight?: WareType | null;
}) {
  const total = WARE_TYPES.reduce((n, w) => n + supply[w], 0);
  return (
    <div className={compact ? 'ware-supply ware-supply-compact' : 'ware-supply'} aria-label={`Ware supply: ${WARE_TYPES.map((w) => `${supply[w]} ${w}`).join(', ')}`}>
      {!compact && <div className="panel-section-title ware-supply-title">Supply · {total}</div>}
      <div className="ware-supply-grid">
        {WARE_TYPES.map((ware) => {
          const n = supply[ware];
          const low = n > 0 && n <= Math.ceil(INITIAL_WARE_SUPPLY[ware] / 3);
          return (
            <div
              key={ware}
              data-supply-ware={ware}
              className={`ware-basket${n === 0 ? ' ware-basket-empty' : ''}${low ? ' ware-basket-low' : ''}${highlight === ware ? ' ware-basket-alert' : ''}`}
              title={n === 0 ? `No ${ware} left in the supply` : `${n} ${ware} in the supply`}
            >
              <img src={`/assets/tokens/${ware}.png`} alt="" draggable={false} />
              <span className="ware-basket-count">{n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "The supply has run out of tea." → 'tea' (friendlyPlayError wording). */
export function supplyWareFromError(message: string | null | undefined): WareType | null {
  const m = message?.match(/run out of (\w+)/);
  const w = m?.[1];
  return w && (WARE_TYPES as readonly string[]).includes(w) ? (w as WareType) : null;
}
