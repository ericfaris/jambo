import { memo, useState, useEffect } from 'react';
import type { DeckCardId } from '../engine/types.ts';
import { CardFace } from './CardFace.tsx';

interface HandDisplayProps {
  hand: DeckCardId[];
  onPlayCard?: (cardId: DeckCardId) => void;
  disabled?: boolean;
  cardError?: {cardId: DeckCardId, message: string} | null;
  onMegaView?: (cardId: DeckCardId) => void;
  useWoodBackground?: boolean;
  transparentBackground?: boolean;
  showBorder?: boolean;
  showHelperText?: boolean;
  cardScale?: number;
  paddingBottom?: number;
  paddingX?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  layoutMode?: 'fan' | 'grid3' | 'twoRowAlternate';
  fixedOverlapPx?: number;
}

/** Max overlap as a fraction of card width — keeps each card's art readable. */
export const MAX_READABLE_OVERLAP_RATIO = 0.5;
/** Hand size at which the fan stops squeezing and scrolls sideways. */
export const SCROLL_HAND_SIZE = 12;

function HandDisplayComponent({ hand, onPlayCard, disabled, cardError, onMegaView, useWoodBackground = true, transparentBackground = false, showBorder = true, showHelperText = true, cardScale = 1, paddingBottom = 14, paddingX = 14, paddingLeft, paddingRight, paddingTop = 14, layoutMode = 'fan', fixedOverlapPx }: HandDisplayProps) {
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile(); // Initial check
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const cardWidth = 140;
  const minGap = hand.length <= 8 ? 20 : 10;
  const containerWidth = 600;

  let overlapAmount = 0;
  if (isMobile) {
    overlapAmount = 40;
  } else if (hand.length >= 9) {
    const cardsOverBase = hand.length - 9;

    let baseOverlap = 0;
    if (hand.length <= 11) {
      baseOverlap = hand.length === 9 ? 4 : hand.length === 10 ? 14.5 : 25;
    } else {
      baseOverlap = 25 + (cardsOverBase - 2) * 8;
    }

    const totalCardWidth = hand.length * cardWidth;
    const totalGapSpace = (hand.length - 1) * minGap;
    const totalNeededSpace = totalCardWidth + totalGapSpace;

    let spaceBasedOverlap = 0;
    if (totalNeededSpace > containerWidth) {
      const excessSpace = totalNeededSpace - containerWidth;
      spaceBasedOverlap = excessSpace / (hand.length - 1);
    }

    overlapAmount = Math.max(baseOverlap, spaceBasedOverlap);
    // Never squeeze cards past half-overlapped; big hands scroll instead
    // (official rules have no hand limit, so 15–20 card hands are legal)
    overlapAmount = Math.min(overlapAmount, MAX_READABLE_OVERLAP_RATIO * cardWidth);
    overlapAmount = Math.max(overlapAmount, 0);
  }

  if (fixedOverlapPx !== undefined) {
    overlapAmount = fixedOverlapPx;
  }

  const spacing = overlapAmount > 0 ? -overlapAmount : minGap;
  const isGrid3 = layoutMode === 'grid3';
  const isTwoRowAlternate = layoutMode === 'twoRowAlternate';
  const scrollsSideways = !isGrid3 && !isTwoRowAlternate && hand.length >= SCROLL_HAND_SIZE;

  const renderCardTile = (cardId: DeckCardId, index: number, marginLeft: number, zIndex: number) => (
    <div
      key={`${cardId}-${index}`}
      style={{
        marginLeft,
        flexShrink: 0,
        zIndex,
        position: 'relative',
      }}
    >
      <CardFace
        cardId={cardId}
        scale={cardScale}
        onClick={!disabled && onPlayCard ? () => onPlayCard(cardId) : undefined}
        onMegaView={onMegaView}
      />
      {cardError && cardError.cardId === cardId && (
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
          fontSize: 14,
          fontWeight: 600,
          textAlign: 'center',
          padding: 8,
          borderRadius: 8,
          zIndex: 1000,
          animation: 'cardErrorFadeOut 5s linear forwards',
        }}>
          {cardError.message}
        </div>
      )}
    </div>
  );

  const indexedCards = hand.map((cardId, index) => ({ cardId, index }));
  const topRow = indexedCards.length <= 6 ? indexedCards.slice(0, 3) : indexedCards.slice(0, 3);
  const bottomRow = indexedCards.length <= 6 ? indexedCards.slice(3, 6) : indexedCards.slice(3, 6);
  if (indexedCards.length > 6) {
    const remaining = indexedCards.slice(6);
    remaining.forEach((entry, entryIndex) => {
      if (entryIndex % 2 === 0) {
        topRow.push(entry);
      } else {
        bottomRow.push(entry);
      }
    });
  }

  const resolvedPaddingLeft = paddingLeft ?? paddingX;
  const resolvedPaddingRight = paddingRight ?? paddingX;

  return (
    <div 
      style={{
        position: 'relative',
        padding: `${paddingTop}px ${resolvedPaddingRight}px ${paddingBottom}px ${resolvedPaddingLeft}px`,
        ...(useWoodBackground
          ? {
              backgroundImage: 'linear-gradient(rgba(20,10,5,0.54), rgba(20,10,5,0.54)), url(/assets/panels/wood_1.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }
          : {
              background: transparentBackground ? 'transparent' : 'rgba(20,10,5,0.2)',
            }),
        border: showBorder ? '1px dashed var(--border)' : 'none',
        borderRadius: 10,
        minHeight: 200,
        overflowX: isGrid3 ? 'hidden' : (isMobile || isTwoRowAlternate || scrollsSideways ? 'auto' : 'hidden'),
        overflowY: isGrid3 ? 'auto' : 'hidden',
        display: isGrid3 ? 'grid' : 'flex',
        gridTemplateColumns: isGrid3 ? 'repeat(3, minmax(0, 1fr))' : undefined,
        flexDirection: isTwoRowAlternate ? 'column' : undefined,
        // 'safe center' centers when the row fits and falls back to start when it scrolls
        justifyContent: isGrid3 ? undefined : (isMobile || isTwoRowAlternate ? 'flex-start' : scrollsSideways ? 'safe center' : 'center'),
        justifyItems: isGrid3 ? 'center' : undefined,
        alignItems: 'flex-start',
        gap: isGrid3 || isTwoRowAlternate ? 10 : undefined,
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(90,64,48,0.3) transparent',
        WebkitOverflowScrolling: 'touch',
        touchAction: isGrid3 ? 'auto' : 'pan-x',
      } as any}
    >
      {showHelperText && !disabled && !!onPlayCard && hand.length > 0 && (
        <div className="ui-helper-text" style={{
          position: 'absolute',
          top: 4,
          left: 8,
          zIndex: 5,
        }}>
          Tap a card to play it.
        </div>
      )}
      {scrollsSideways && (
        <div className="ui-helper-text" style={{
          position: 'absolute',
          top: 4,
          right: 8,
          // Above every card in the fan (cards stack with zIndex = index)
          zIndex: hand.length + 10,
        }}>
          {hand.length} cards in hand
        </div>
      )}
      {hand.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: 12, fontSize: 14 }}>
          No cards in hand
        </div>
      )}
      {isTwoRowAlternate ? (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            {topRow.map((entry, rowIndex) => renderCardTile(entry.cardId, entry.index, rowIndex === 0 ? 0 : spacing, entry.index))}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            {bottomRow.map((entry, rowIndex) => renderCardTile(entry.cardId, entry.index, rowIndex === 0 ? 0 : spacing, entry.index))}
          </div>
        </>
      ) : (
        hand.map((cardId, index) => (
          <div
            key={cardId}
            style={{
              marginLeft: isGrid3 ? 0 : (index === 0 ? 0 : spacing),
              flexShrink: 0,
              zIndex: isGrid3 ? 1 : index,
              position: 'relative',
            }}
          >
            <CardFace
              cardId={cardId}
              scale={cardScale}
              onClick={!disabled && onPlayCard ? () => onPlayCard(cardId) : undefined}
              onMegaView={onMegaView}
            />
            {cardError && cardError.cardId === cardId && (
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
                fontSize: 14,
                fontWeight: 600,
                textAlign: 'center',
                padding: 8,
                borderRadius: 8,
                zIndex: 1000,
                animation: 'cardErrorFadeOut 5s linear forwards',
              }}>
                {cardError.message}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export const HandDisplay = memo(HandDisplayComponent);
