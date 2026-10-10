import { memo } from 'react';
import type { CSSProperties } from 'react';
import type { WareType } from '../engine/types.ts';
import { WareToken } from './CardFace.tsx';
import { buttonProps } from './a11y.ts';
import { getSixthSpaceIndex } from '../engine/market/MarketManager.ts';

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
}

function MarketDisplayComponent({ market, onSlotClick, selectedSlots, flashSlots, flashVariant = 'normal', label, columns, slotSize = 48, tokenSize, borderless, dashedBorder, compact = false }: MarketDisplayProps) {
  const isInteractive = !!onSlotClick;

  const sixthSpace = getSixthSpaceIndex(market);

  return (
    <div>
      {label && (
        <div className="panel-section-title">
          {label}
        </div>
      )}
      {isInteractive && (
        <div className="ui-helper-text" style={{ marginBottom: 4 }}>
          Tap a filled slot to select.
        </div>
      )}
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
        {market.map((ware, i) => (
          <div key={i} className={`${borderless || dashedBorder ? '' : 'market-slot'}${flashSlots?.includes(i) ? ` market-slot-flash market-slot-flash-${flashVariant}` : ''}`} style={{
            width: slotSize,
            height: slotSize,
            borderRadius: compact ? 6 : 8,
            flexShrink: 0,
            border: borderless ? 'none' : dashedBorder ? '2px dashed var(--border)' : `2px solid ${selectedSlots?.includes(i) ? 'var(--gold)' : 'var(--border)'}`,
            background: dashedBorder ? (ware ? 'transparent' : 'rgba(255,255,255,0.06)') : borderless ? 'transparent' : selectedSlots?.includes(i) ? 'rgba(212,168,80,0.15)' : 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: onSlotClick && ware ? 'pointer' : 'default',
          }}
          onClick={onSlotClick && ware ? () => onSlotClick(i) : undefined}
          {...buttonProps(onSlotClick && ware ? () => onSlotClick(i) : undefined, `${ware} in slot ${i + 1}`)}
          >
            {ware ? (
              // keyed by ware so a new arrival (or a swap) settles in
              <span key={ware} className="ware-in-slot" style={{ '--i': i } as CSSProperties}>
                <WareToken type={ware} size={tokenSize} />
              </span>
            ) : i === sixthSpace ? (
              <span
                title="Filling the large stand's 6th space costs 2g"
                aria-label="6th space: costs 2 gold to fill"
                style={{ fontSize: Math.max(10, Math.round(slotSize * 0.26)), fontWeight: 700, color: 'var(--gold-dim)', opacity: 0.85 }}
              >
                2g
              </span>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export const MarketDisplay = memo(MarketDisplayComponent);
