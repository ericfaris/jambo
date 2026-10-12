import { memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { WareType } from '../engine/types.ts';
import { WareToken } from './CardFace.tsx';
import { buttonProps } from './a11y.ts';
import { getSixthSpaceIndex } from '../engine/market/MarketManager.ts';
import { CONSTANTS } from '../engine/types.ts';

interface MarketDisplayProps {
  market: (WareType | null)[];
  onSlotClick?: (index: number) => void;
  selectedSlots?: number[];
  flashSlots?: number[];
  flashVariant?: 'soft' | 'normal' | 'strong';
  label?: string;
  /** Max slots per row — wraps to additional rows. Defaults to unlimited. */
  columns?: number;
  /** Slot size in px. Defaults to 48. */
  slotSize?: number;
  /** Ware token size in px. Defaults to 42. */
  tokenSize?: number;
  /** Hide slot borders. */
  borderless?: boolean;
  /** Use dashed borders on slots. */
  dashedBorder?: boolean;
  /** Tight single-row phone variant: no wrap, no outer padding. */
  compact?: boolean;
  /** Filled slots that can't be picked right now (dimmed, not clickable). */
  disabledSlots?: number[];
  /** Tooltip / label for a disabled slot. */
  disabledReason?: string;
  /** The board market of this seat: slots get data-market-slot anchors for
   *  the trade animations. Omit for copies inside panels. */
  owner?: 0 | 1;
  /** A small count chip beside the label, e.g. "5/9". */
  labelAside?: ReactNode;
}

function MarketDisplayComponent({ market, onSlotClick, selectedSlots, flashSlots, flashVariant = 'normal', label, columns, slotSize = 48, tokenSize, borderless, dashedBorder, compact = false, disabledSlots, disabledReason, owner, labelAside }: MarketDisplayProps) {
  const isInteractive = !!onSlotClick;

  const sixthSpace = getSixthSpaceIndex(market);

  return (
    <div>
      {label && (
        <div className="panel-section-title">
          {label}
          {labelAside != null && <span className="tableau-count">{labelAside}</span>}
        </div>
      )}
      {isInteractive && (
        <div className="ui-helper-text" style={{ marginBottom: 4 }}>
          Tap a filled slot to select.
        </div>
      )}
      {(() => {
        const renderSlot = (ware: WareType | null, i: number) => {
          const pickable = !!onSlotClick && !!ware && !disabledSlots?.includes(i);
          const disabled = !!onSlotClick && !!ware && !pickable;
          const selected = !!selectedSlots?.includes(i);
          const carved = !borderless && !dashedBorder;
          const classes = [
            carved ? 'market-slot' : '',
            carved && ware ? 'market-slot-filled' : '',
            carved && selected ? 'market-slot-selected' : '',
            flashSlots?.includes(i) ? `market-slot-flash market-slot-flash-${flashVariant}` : '',
          ].filter(Boolean).join(' ');
          return (
          <div key={i} data-market-slot={owner !== undefined ? `${owner}-${i}` : undefined} title={disabled ? disabledReason : undefined} aria-disabled={disabled || undefined} className={classes || undefined} style={{
            width: slotSize,
            height: slotSize,
            borderRadius: compact ? 6 : 8,
            flexShrink: 0,
            // the carved well (border, inset shadow, ware glow) lives in .market-slot
            ...(carved
              ? { '--ware-c': ware ? `var(--ware-${ware})` : undefined }
              : {
                  border: borderless ? 'none' : '2px dashed var(--border)',
                  background: dashedBorder ? (ware ? 'transparent' : 'rgba(255,255,255,0.06)') : 'transparent',
                }),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: pickable ? 'pointer' : 'default',
            opacity: disabled ? 0.38 : 1,
            filter: disabled ? 'grayscale(0.7)' : undefined,
          } as CSSProperties}
          onClick={pickable ? () => onSlotClick(i) : undefined}
          {...buttonProps(pickable ? () => onSlotClick(i) : undefined, `${ware} in slot ${i + 1}`)}
          >
            {ware ? (
              // keyed by ware so a new arrival (or a swap) settles in
              <span key={ware} className="ware-in-slot" style={{ '--i': i } as CSSProperties}>
                <WareToken type={ware} size={tokenSize} />
              </span>
            ) : i === sixthSpace ? (
              <span
                className="market-slot-fee"
                title="Filling the large stand's 6th space costs 2g"
                aria-label="6th space: costs 2 gold to fill"
                style={{ fontSize: Math.max(9, Math.round(slotSize * 0.22)), width: Math.round(slotSize * 0.56), height: Math.round(slotSize * 0.56) }}
              >
                2g
              </span>
            ) : (
              <span />
            )}
          </div>
          );
        };

        // The board market reads as real stands: the large stand, then each
        // small stand, every one on its own wooden shelf.
        if (owner !== undefined && !compact && !columns) {
          return (
            <div className="market-stands">
              {marketStands(market.length).map((slots, s) => (
                <div key={s} className={`market-stand${s === 0 ? ' market-stand-large' : ' market-stand-small'}`} data-stand={s}>
                  <div className="market-stand-slots">
                    {slots.map((i) => renderSlot(market[i] ?? null, i))}
                  </div>
                  <span className="market-stand-shelf" aria-hidden="true" />
                </div>
              ))}
            </div>
          );
        }

        return (
          <div style={{
            display: columns ? 'grid' : 'flex',
            gridTemplateColumns: columns ? `repeat(${columns}, auto)` : undefined,
            gap: compact ? 4 : 6,
            flexWrap: columns || compact ? undefined : 'wrap',
            background: 'transparent',
            borderRadius: 10,
            padding: compact ? 0 : '10px 10px 10px 0',
            boxShadow: 'none',
          }}>
            {market.map(renderSlot)}
          </div>
        );
      })()}
    </div>
  );
}

/** Slot indices grouped by stand: the large stand's 6, then 3 per small stand. */
export function marketStands(length: number): number[][] {
  const large = CONSTANTS.MARKET_SLOTS;
  const stands: number[][] = [Array.from({ length: Math.min(large, length) }, (_, i) => i)];
  for (let start = large; start < length; start += 3) {
    stands.push(Array.from({ length: Math.min(3, length - start) }, (_, k) => start + k));
  }
  return stands;
}

export const MarketDisplay = memo(MarketDisplayComponent);
