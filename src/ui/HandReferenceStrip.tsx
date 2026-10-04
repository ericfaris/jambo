import type { DeckCardId, PendingResolution } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { WARE_COLORS } from './CardFace.tsx';
import { buttonProps } from './a11y.ts';

interface HandReferenceStripProps {
  hand: DeckCardId[];
  onMegaView?: (cardId: DeckCardId) => void;
}

const CARD_TYPE_COLORS: Record<string, string> = {
  people: 'var(--card-people)',
  animal: 'var(--card-animal)',
  utility: 'var(--card-utility)',
  ware: 'var(--card-ware)',
  stand: 'var(--card-stand)',
};

export function HandReferenceStrip({ hand, onMegaView }: HandReferenceStripProps) {
  if (hand.length === 0) return null;

  const PEEK_WIDTH = 80;
  const PEEK_HEIGHT = 45;
  // Calculate overlap: if cards fit at full width, no overlap; otherwise compress
  const maxContainerWidth = Math.min(600, window.innerWidth - 32);
  const totalFullWidth = hand.length * PEEK_WIDTH;
  const minVisible = 28;
  const effectiveWidth = totalFullWidth <= maxContainerWidth
    ? PEEK_WIDTH
    : Math.max(minVisible, (maxContainerWidth - PEEK_WIDTH) / Math.max(hand.length - 1, 1));

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9001,
        background: 'rgba(20,10,5,0.6)',
        borderRadius: '8px 8px 0 0',
        padding: '4px 8px 2px',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
      }}>
        {hand.map((cardId, i) => {
          const card = getCard(cardId);
          const isLast = i === hand.length - 1;
          const offset = totalFullWidth <= maxContainerWidth ? 0 : -(PEEK_WIDTH - effectiveWidth);

          return (
            <div
              key={cardId}
              onClick={() => onMegaView?.(cardId)}
              {...buttonProps(onMegaView ? () => onMegaView(cardId) : undefined, `View ${card.name}`)}
              style={{
                width: PEEK_WIDTH,
                height: PEEK_HEIGHT,
                marginRight: isLast ? 0 : offset,
                borderRadius: '6px 6px 0 0',
                overflow: 'hidden',
                cursor: onMegaView ? 'pointer' : 'default',
                flexShrink: 0,
                position: 'relative',
                zIndex: i,
                border: '1px solid rgba(168,152,128,0.5)',
                borderBottom: 'none',
              }}
            >
              {card.wares ? (
                <WareCardPeek cardId={cardId} />
              ) : (
                <NonWareCardPeek cardId={cardId} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WareCardPeek({ cardId }: { cardId: DeckCardId }) {
  const card = getCard(cardId);
  if (!card.wares) return null;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 2,
      padding: 2,
    }}>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        {card.wares.types.map((w, i) => (
          <div key={i} style={{
            width: 12,
            height: 12,
            borderRadius: 3,
            background: WARE_COLORS[w],
            border: '1px solid rgba(0,0,0,0.6)',
          }} />
        ))}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 9,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: 600,
      }}>
        <img
          src={`/assets/coins/coin_${card.wares.buyPrice}.png`}
          alt={`${card.wares.buyPrice}g`}
          style={{ width: 14, height: 14 }}
          draggable={false}
        />
        <span style={{ opacity: 0.5 }}>/</span>
        <img
          src={`/assets/coins/coin_${card.wares.sellPrice}.png`}
          alt={`${card.wares.sellPrice}g`}
          style={{ width: 14, height: 14 }}
          draggable={false}
        />
      </div>
    </div>
  );
}

function NonWareCardPeek({ cardId }: { cardId: DeckCardId }) {
  const card = getCard(cardId);
  const typeColor = CARD_TYPE_COLORS[card.type] || '#666';

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'rgba(255,255,255,0.88)',
      borderLeft: `3px solid ${typeColor}`,
      display: 'flex',
      alignItems: 'center',
      padding: '2px 4px',
    }}>
      <div style={{
        fontSize: 8,
        fontWeight: 700,
        color: '#1a1714',
        lineHeight: 1.1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        width: '100%',
      }}>
        {card.name}
      </div>
    </div>
  );
}

/**
 * Returns true if the pending resolution involves the player's hand as the
 * primary interaction subject (making the hand strip redundant).
 */
export function isHandInteraction(pr: PendingResolution | null, viewerPlayer: 0 | 1): boolean {
  if (!pr) return false;

  switch (pr.type) {
    case 'HAND_SWAP':
      return pr.step === 'GIVE'; // step 2: giving a card from hand
    case 'SUPPLIES_DISCARD':
      return true; // discarding from hand
    case 'UTILITY_EFFECT':
      return pr.step === 'SELECT_CARD'; // Kettle/Boat/Weapons: discarding from hand
    case 'WARE_CASH_CONVERSION':
      return pr.step === 'SELECT_CARD'; // Dancer: selecting ware card from hand
    case 'DRAW_MODIFIER':
      return true; // Mask: selecting card from hand to trade
    case 'OPPONENT_DISCARD':
      return pr.targetPlayer === viewerPlayer; // discarding own cards
    default:
      return false;
  }
}
