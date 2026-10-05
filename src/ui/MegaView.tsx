import { useEffect } from 'react';
import type { DeckCardId, WareType } from '../engine/types.ts';
import { MarketSummary } from './MarketSummary.tsx';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { WARE_COLORS } from './CardFace.tsx';

interface MegaViewProps {
  cardId: DeckCardId;
  onClose: () => void;
  /** The viewer's market — the zoom covers the board, so show it here */
  market?: readonly (WareType | null)[];
}

export function MegaView({ cardId, onClose, market }: MegaViewProps) {
  const card = getCard(cardId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="overlay-fade"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(20,10,5,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="dialog-pop linen-texture"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(380px, calc(100vw - 16px))',
          borderRadius: 14,
          padding: 8,
          border: '2px solid #a89880',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          className="mega-view-art"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const xRatio = (e.clientX - rect.left) / rect.width - 0.5;
            const yRatio = (e.clientY - rect.top) / rect.height - 0.5;
            const rotateY = xRatio * 5;
            const rotateX = yRatio * -5;
            e.currentTarget.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-2px)`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)';
          }}
        >
          <img
            src={`/assets/cards/${card.designId}.png`}
            alt={card.name}
            style={{
              width: '100%',
              borderRadius: 10,
              display: 'block',
            }}
            draggable={false}
          />
        </div>
        <div style={{ padding: '0 6px 6px', textAlign: 'center', minHeight: 96, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {card.wares ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              padding: '6px 8px',
            }}>
              <img
                src={`/assets/coins/coin_${card.wares.buyPrice}.png`}
                alt={`${card.wares.buyPrice}g`}
                style={{ width: 54, height: 54, flexShrink: 0 }}
                draggable={false}
              />
              <div style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                justifyContent: 'center',
                maxWidth: 200,
              }}>
                {card.wares.types.map((wareType, index) => (
                  <span
                    key={`${wareType}-${index}`}
                    title={wareType}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: WARE_COLORS[wareType],
                      border: '2px solid rgba(0,0,0,0.6)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  />
                ))}
              </div>
              <img
                src={`/assets/coins/coin_${card.wares.sellPrice}.png`}
                alt={`${card.wares.sellPrice}g`}
                style={{ width: 54, height: 54, flexShrink: 0 }}
                draggable={false}
              />
            </div>
          ) : (
            <>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1714', marginBottom: 6 }}>
                {card.name}
              </div>
              <div style={{ fontSize: 15, color: '#4a4540', lineHeight: 1.4, textAlign: 'center' }}>
                {card.description}
              </div>
            </>
          )}
        </div>
        {market && <div style={{ padding: '0 6px 6px' }}><MarketSummary market={market} cardId={card.wares ? cardId : null} /></div>}
      </div>
    </div>
  );
}
