import { memo, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { UtilityState } from '../engine/types.ts';
import { CardFace } from './CardFace.tsx';
import { getCard } from '../engine/cards/CardDatabase.ts';
import type { DeckCardId } from '../engine/types.ts';
import type { UtilityHint } from './utilityHints.ts';

interface UtilityAreaProps {
  utilities: UtilityState[];
  onActivate?: (index: number) => void;
  disabled?: boolean;
  cardError?: {cardId: string, message: string} | null;
  label?: string;
  cardSize?: 'small' | 'medium' | 'default' | 'large';
  cardScale?: number;
  showHelperText?: boolean;
  overlapPx?: number;
  overlapOnDesktop?: boolean;
  singleRow?: boolean;
  hideScrollbar?: boolean;
  /** Show this used card upright for now (its "used" spotlight is still up), so it turns in view after. */
  untappedCardId?: DeckCardId | null;
  /** Show empty placeholder slots up to this count. */
  maxSlots?: number;
  /** Gap between non-overlapping cards (defaults: 0 on mobile, 8 on desktop). */
  gapPx?: number;
  /** Tapping a card's caption bar zooms it (the body still activates). */
  onMegaView?: (cardId: DeckCardId) => void;
  /** Per-utility usability (computeUtilityHints): fades and disables what can't be used now. */
  hints?: Map<DeckCardId, UtilityHint> | null;
  /** A small count chip beside the label, e.g. "2/3". */
  labelAside?: ReactNode;
}

function UtilityAreaComponent({
  utilities,
  onActivate,
  disabled,
  cardError,
  label,
  cardSize = 'small',
  cardScale = 1,
  showHelperText = true,
  overlapPx = 42,
  overlapOnDesktop = false,
  singleRow = false,
  hideScrollbar = false,
  maxSlots,
  gapPx,
  onMegaView,
  untappedCardId = null,
  hints = null,
  labelAside,
}: UtilityAreaProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateIsMobile = () => setIsMobile(window.innerWidth <= 768);
    updateIsMobile();
    window.addEventListener('resize', updateIsMobile);
    return () => window.removeEventListener('resize', updateIsMobile);
  }, []);

  const overlapAmount = overlapPx;
  const isUnusable = (u: UtilityState) => hints?.get(u.cardId)?.usable === false;
  const hasUnusedUtility = utilities.some((utility) => !utility.usedThisTurn && !isUnusable(utility));
  const showInteractionHint = !!onActivate && !disabled && hasUnusedUtility;

  return (
    <div>
      {label && (
        <div className="panel-section-title">
          {label}
          {labelAside != null && <span className="tableau-count">{labelAside}</span>}
        </div>
      )}
      {showHelperText && showInteractionHint && (
        <div className="ui-helper-text" style={{ marginBottom: 4 }}>
          Tap an unused utility to activate.
        </div>
      )}
      <div style={{
        display: 'flex',
        gap: gapPx ?? (isMobile ? 0 : 8),
        flexWrap: (isMobile || singleRow) ? 'nowrap' : 'wrap',
        overflowX: (isMobile || singleRow) ? 'auto' : 'visible',
        overflowY: 'visible',
        paddingBottom: isMobile ? 4 : 0,
        WebkitOverflowScrolling: 'touch',
        touchAction: (isMobile || singleRow) ? 'pan-x' : 'auto',
        scrollbarWidth: hideScrollbar ? 'none' : 'auto',
        msOverflowStyle: hideScrollbar ? 'none' : 'auto',
      }}>
        {!maxSlots && utilities.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 14, padding: 6 }}>
            No utilities
          </div>
        )}
        {utilities.map((u, i) => {
          const unusable = !u.usedThisTurn && isUnusable(u);
          const activatable = !!onActivate && !disabled && !u.usedThisTurn && !unusable;
          return (
          <div
            key={u.cardId}
            data-utility-card={u.cardId}
            className={activatable ? 'utility-ready' : unusable ? 'utility-unusable' : undefined}
            title={unusable ? hints?.get(u.cardId)?.reason : undefined}
            aria-disabled={unusable || undefined}
            data-usable={hints?.has(u.cardId) ? String(!unusable) : undefined}
            style={{
              position: 'relative',
              flexShrink: 0,
              zIndex: i,
              marginLeft: (isMobile || overlapOnDesktop) && i > 0 ? -overlapAmount : 0,
            }}
          >
            {/* A used utility turns sideways like a tapped card — the art stays
                visible (it used to sit under a dark "USED" overlay) */}
            <div className={u.usedThisTurn && u.cardId !== untappedCardId ? 'utility-card utility-card-tapped' : 'utility-card'}>
              <CardFace
                cardId={u.cardId}
                small={cardSize === 'small'}
                medium={cardSize === 'medium'}
                large={cardSize === 'large'}
                scale={cardScale}
                onClick={activatable && onActivate ? () => onActivate(i) : undefined}
                onMegaView={onMegaView}
              />
            </div>
            {u.usedThisTurn && u.cardId !== untappedCardId && <span className="utility-used-pill">Used</span>}
            {cardError && cardError.cardId === u.cardId && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(255, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'center',
                padding: 4,
                borderRadius: 8,
                zIndex: 1000,
                animation: 'cardErrorFadeOut 5s linear forwards',
                overflow: 'hidden',
              }}>
                {cardError.message}
              </div>
            )}
          </div>
          );
        })}
        {maxSlots && utilities.length < maxSlots && Array.from({ length: maxSlots - utilities.length }, (_, i) => {
          const w = Math.round((cardSize === 'small' ? 96 : cardSize === 'medium' ? 120 : cardSize === 'large' ? 180 : 140) * cardScale);
          const h = Math.round((cardSize === 'small' ? 128 : cardSize === 'medium' ? 160 : cardSize === 'large' ? 240 : 187) * cardScale);
          return (
            <div key={`empty-${i}`} className="empty-card-slot" style={{ width: w, height: h }}>
              <span className="empty-card-slot-mark" aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const UtilityArea = memo(UtilityAreaComponent);

/**
 * Read-only utility list as compact chips (phone opponent strip). Tap a chip
 * to zoom the card; used utilities are dimmed and struck through.
 */
export function UtilityChips({ utilities, onMegaView }: { utilities: UtilityState[]; onMegaView?: (cardId: DeckCardId) => void }) {
  if (utilities.length === 0) {
    return <span className="utility-chip-empty">No utilities</span>;
  }
  return (
    <div className="utility-chips">
      {utilities.map((u) => {
        const name = getCard(u.cardId).name;
        return (
          <button
            key={u.cardId}
            data-utility-card={u.cardId}
            type="button"
            className={`utility-chip${u.usedThisTurn ? ' utility-chip-used' : ''}`}
            onClick={onMegaView ? () => onMegaView(u.cardId) : undefined}
            aria-label={`${name}${u.usedThisTurn ? ' (used this turn)' : ''} — zoom in`}
          >
            <img src={`/assets/cards/${u.designId}.png`} alt="" draggable={false} />
            <span>{name}</span>
          </button>
        );
      })}
    </div>
  );
}
