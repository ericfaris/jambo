import { memo, useEffect, useState } from 'react';
import type { UtilityState } from '../engine/types.ts';
import { CardFace } from './CardFace.tsx';

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
  /** Show empty placeholder slots up to this count. */
  maxSlots?: number;
  /** Gap between non-overlapping cards (defaults: 0 on mobile, 8 on desktop). */
  gapPx?: number;
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
}: UtilityAreaProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateIsMobile = () => setIsMobile(window.innerWidth <= 768);
    updateIsMobile();
    window.addEventListener('resize', updateIsMobile);
    return () => window.removeEventListener('resize', updateIsMobile);
  }, []);

  const overlapAmount = overlapPx;
  const hasUnusedUtility = utilities.some((utility) => !utility.usedThisTurn);
  const showInteractionHint = !!onActivate && !disabled && hasUnusedUtility;

  return (
    <div>
      {label && (
        <div className="panel-section-title">
          {label}
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
        {utilities.map((u, i) => (
          <div
            key={u.cardId}
            style={{
              position: 'relative',
              flexShrink: 0,
              zIndex: i,
              marginLeft: (isMobile || overlapOnDesktop) && i > 0 ? -overlapAmount : 0,
            }}
          >
            <CardFace
              cardId={u.cardId}
              small={cardSize === 'small'}
              medium={cardSize === 'medium'}
              large={cardSize === 'large'}
              scale={cardScale}
              onClick={!disabled && onActivate && !u.usedThisTurn ? () => onActivate(i) : undefined}
            />
            {u.usedThisTurn && (
              <div className="overlay-fade" style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(20,10,5,0.7)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: '#a08060',
              }}>
                USED
              </div>
            )}
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
        ))}
        {maxSlots && utilities.length < maxSlots && Array.from({ length: maxSlots - utilities.length }, (_, i) => {
          const w = Math.round((cardSize === 'small' ? 96 : cardSize === 'medium' ? 120 : cardSize === 'large' ? 180 : 140) * cardScale);
          const h = Math.round((cardSize === 'small' ? 128 : cardSize === 'medium' ? 160 : cardSize === 'large' ? 240 : 187) * cardScale);
          return (
            <div key={`empty-${i}`} style={{
              width: w,
              height: h,
              borderRadius: 8,
              border: '2px dashed var(--border)',
              background: 'rgba(255,255,255,0.06)',
              flexShrink: 0,
            }} />
          );
        })}
      </div>
    </div>
  );
}

export const UtilityArea = memo(UtilityAreaComponent);
