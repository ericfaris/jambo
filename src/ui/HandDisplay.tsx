import { memo, useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { DeckCardId } from '../engine/types.ts';
import { CardFace } from './CardFace.tsx';
import { splitIntoRows } from './fitLayout.ts';

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
  layoutMode?: 'fan' | 'grid3' | 'twoRowAlternate' | 'fitRows';
  fixedOverlapPx?: number;
  /** fitRows only: row count from fitCardsToBox(). Cards fill rows in hand order. */
  rows?: number;
  /** fitRows only: gap between cards when fixedOverlapPx is 0. */
  gapPx?: number;
}

/** Max overlap as a fraction of card width — keeps each card's art readable. */
export const MAX_READABLE_OVERLAP_RATIO = 0.5;
/** Hand size at which the fan stops squeezing and scrolls sideways. */
export const SCROLL_HAND_SIZE = 12;

function HandDisplayComponent({ hand, onPlayCard, disabled, cardError, onMegaView, useWoodBackground = true, transparentBackground = false, showBorder = true, showHelperText = true, cardScale = 1, paddingBottom = 14, paddingX = 14, paddingLeft, paddingRight, paddingTop = 14, layoutMode = 'fan', fixedOverlapPx, rows = 1, gapPx = 8 }: HandDisplayProps) {
  const [isMobile, setIsMobile] = useState(false);
  // The opening hand deals in one card after another; later draws arrive alone
  const dealtRef = useRef(false);
  useEffect(() => { dealtRef.current = true; }, []);

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
  const isFitRows = layoutMode === 'fitRows';
  const scrollsSideways = !isGrid3 && !isTwoRowAlternate && !isFitRows && hand.length >= SCROLL_HAND_SIZE;

  // Desktop fan: a slight arc (outer cards tilt out and sit lower). Pose is
  // set with the independent rotate/translate properties (index.css › Living
  // table) so it composes with each card's idle breathing.
  const fanned = layoutMode === 'fan' && !isMobile && !scrollsSideways && hand.length > 1;
  const fanStep = Math.min(1.8, 10 / hand.length);
  const fanMid = (hand.length - 1) / 2;

  const renderCardTile = (cardId: DeckCardId, index: number, marginLeft: number, zIndex: number) => {
    const offset = index - fanMid;
    const tileStyle: Record<string, string | number> = {
      marginLeft,
      flexShrink: 0,
      zIndex,
      position: 'relative',
      '--i': index,
      '--deal-i': dealtRef.current ? 0 : index,
    };
    if (fanned) {
      tileStyle['--fan-rot'] = `${(offset * fanStep).toFixed(2)}deg`;
      tileStyle['--fan-lift'] = `${Math.min(offset * offset * 1.2, 10).toFixed(1)}px`;
    }
    return (
      <div key={cardId} className="hand-card" style={tileStyle as CSSProperties}>
        <div className="hand-card-inner">
          <CardFace
            cardId={cardId}
            scale={cardScale}
            onClick={!disabled && onPlayCard ? () => onPlayCard(cardId) : undefined}
            onMegaView={onMegaView}
          />
        </div>
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
            fontSize: 'clamp(10px, 3vw, 14px)',
            lineHeight: 1.2,
            fontWeight: 600,
            textAlign: 'center',
            padding: 6,
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
  };

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

  const fitSpacing = overlapAmount > 0 ? -overlapAmount : gapPx;
  const fitRowList = isFitRows ? splitIntoRows(indexedCards, rows) : [];

  const resolvedPaddingLeft = paddingLeft ?? paddingX;
  const resolvedPaddingRight = paddingRight ?? paddingX;

  return (
    <div
      className={!disabled && onPlayCard ? 'hand-live' : undefined}
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
        minHeight: isFitRows ? undefined : Math.min(200, Math.round(187 * cardScale) + paddingTop + paddingBottom),
        overflowX: isFitRows ? 'visible' : isGrid3 ? 'hidden' : (isMobile || isTwoRowAlternate || scrollsSideways ? 'auto' : 'hidden'),
        overflowY: isFitRows ? 'visible' : isGrid3 ? 'auto' : 'hidden',
        display: isGrid3 ? 'grid' : 'flex',
        gridTemplateColumns: isGrid3 ? 'repeat(3, minmax(0, 1fr))' : undefined,
        flexDirection: isTwoRowAlternate || isFitRows ? 'column' : undefined,
        // 'safe center' centers when the row fits and falls back to start when it scrolls
        justifyContent: isFitRows ? 'center' : isGrid3 ? undefined : (isMobile || isTwoRowAlternate ? 'flex-start' : scrollsSideways ? 'safe center' : 'center'),
        justifyItems: isGrid3 ? 'center' : undefined,
        alignItems: isFitRows ? 'stretch' : 'flex-start',
        gap: isFitRows ? 8 : isGrid3 || isTwoRowAlternate ? 10 : undefined,
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(90,64,48,0.3) transparent',
        WebkitOverflowScrolling: 'touch',
        touchAction: isGrid3 || isFitRows ? 'auto' : 'pan-x',
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
      {isFitRows ? (
        fitRowList.map((row, rowIndex) => (
          <div key={rowIndex} className="hand-fit-row">
            {row.map((entry, i) => renderCardTile(entry.cardId, entry.index, i === 0 ? 0 : fitSpacing, entry.index))}
          </div>
        ))
      ) : isTwoRowAlternate ? (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            {topRow.map((entry, rowIndex) => renderCardTile(entry.cardId, entry.index, rowIndex === 0 ? 0 : spacing, entry.index))}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            {bottomRow.map((entry, rowIndex) => renderCardTile(entry.cardId, entry.index, rowIndex === 0 ? 0 : spacing, entry.index))}
          </div>
        </>
      ) : (
        hand.map((cardId, index) => renderCardTile(cardId, index, isGrid3 ? 0 : (index === 0 ? 0 : spacing), isGrid3 ? 1 : index))
      )}
    </div>
  );
}

export const HandDisplay = memo(HandDisplayComponent);
