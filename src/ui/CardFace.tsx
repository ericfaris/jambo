import { useState } from 'react';
import type { DeckCardId, WareType } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { buttonProps } from './a11y.ts';

const CARD_TYPE_COLORS: Record<string, string> = {
  people: 'var(--card-people)',
  animal: 'var(--card-animal)',
  utility: 'var(--card-utility)',
  ware: 'var(--card-ware)',
  stand: 'var(--card-stand)',
};

// Cards that have artwork in public/assets/cards/
const CARDS_WITH_IMAGES = new Set([
  'guard', 'rain_maker', 'shaman', 'psychic', 'tribal_elder',
  'wise_man', 'portuguese', 'basket_maker', 'traveling_merchant',
  'arabian_merchant', 'dancer', 'carrier', 'drummer',
  'crocodile', 'parrot', 'hyena', 'snake', 'elephant', 'ape', 'lion', 'cheetah',
  'well', 'drums', 'throne', 'boat', 'scale',
  'mask_of_transformation', 'supplies', 'kettle', 'leopard_statue', 'weapons',
  'ware_slk', 'ware_khl', 'ware_skf', 'ware_fht', 'ware_tsf', 'ware_lht',
  'ware_2k1f', 'ware_2l1s', 'ware_2t1l', 'ware_2s1k', 'ware_2f1h', 'ware_2h1t',
  'ware_3k', 'ware_3h', 'ware_3t', 'ware_3l', 'ware_3f', 'ware_3s',
  'ware_6all',
  'small_market_stand',
]);

const WARE_COLORS: Record<WareType, string> = {
  trinkets: 'var(--ware-trinkets)',
  hides: 'var(--ware-hides)',
  tea: 'var(--ware-tea)',
  silk: 'var(--ware-silk)',
  fruit: 'var(--ware-fruit)',
  salt: 'var(--ware-salt)',
};

interface CardFaceProps {
  cardId: DeckCardId;
  onClick?: () => void;
  selected?: boolean;
  small?: boolean;
  medium?: boolean;
  large?: boolean;
  extraLarge?: boolean;
  faceDown?: boolean;
  scale?: number;
  onMegaView?: (cardId: DeckCardId) => void;
}

export function CardFace({ cardId, onClick, selected, small, medium, large, extraLarge, faceDown, scale = 1, onMegaView }: CardFaceProps) {
  const [imgError, setImgError] = useState(false);
  const baseFaceWidth = small ? 96 : medium ? 120 : extraLarge ? 364 : large ? 180 : 140;
  const baseFaceHeight = small ? 128 : medium ? 160 : extraLarge ? 485 : large ? 240 : 187;
  const baseFallbackWidth = small ? 80 : medium ? 100 : extraLarge ? 364 : large ? 150 : 116;
  const baseFallbackHeight = small ? 107 : medium ? 133 : extraLarge ? 485 : large ? 200 : 155;
  const faceWidth = Math.round(baseFaceWidth * scale);
  const faceHeight = Math.round(baseFaceHeight * scale);
  const fallbackWidth = Math.round(baseFallbackWidth * scale);
  const fallbackHeight = Math.round(baseFallbackHeight * scale);

  if (faceDown) {
    return (
      <div
        style={{
          width: faceWidth,
          height: faceHeight,
          borderRadius: 10,
          backgroundImage: 'url(/assets/cards/card_back.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          border: '2px solid var(--border)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
          flexShrink: 0,
        }}
      />
    );
  }

  const card = getCard(cardId);
  const hasImage = CARDS_WITH_IMAGES.has(card.designId) && !imgError;
  const headerColor = CARD_TYPE_COLORS[card.type] || '#666';
  const cardTypeLabel = card.type.charAt(0).toUpperCase() + card.type.slice(1);
  const tooltipLines = [
    card.name,
    `Type: ${cardTypeLabel}`,
    card.description,
  ];
  if (card.wares) {
    tooltipLines.push(`Buy: ${card.wares.buyPrice}g | Sell: ${card.wares.sellPrice}g`);
  }
  const tooltip = tooltipLines.join('\n');

  // The coin/pip strip on a ware card is where players tap to buy or sell.
  // When the card is playable it must play the card (open Buy/Sell — that
  // dialog shows the full art, so it doubles as the zoom); it only zooms when
  // the card can't be played. It used to always zoom, so tapping the coins
  // opened a dead-end view with no Buy/Sell — "intermittent" depending on
  // where on the card you tapped (reported 2026-10-04).
  const wareStripProps = onClick
    ? {}
    : {
      onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onMegaView?.(cardId); },
      ...buttonProps(onMegaView ? () => onMegaView(cardId) : undefined, `Zoom in on ${card.name}`),
    };

  if (hasImage) {
    const pad = small || medium ? 2 : large ? 4 : 3;
    // Fitted phone layouts can render cards far below the named sizes; scale
    // the caption chrome with the real width so it never swamps the art.
    const compactFace = small || faceWidth < 100;
    const tinyFace = faceWidth < 70;
    const pipSize = tinyFace ? 9 : compactFace ? 16 : 20;
    const coinSize = tinyFace ? 12 : compactFace ? 18 : 26;
    const pipGap = tinyFace ? 2 : compactFace ? 3 : 4;
    return (<>
      <div
        title={tooltip}
        onClick={onClick}
        {...buttonProps(onClick, card.name)}
        className="linen-texture"
        style={{
          width: faceWidth,
          height: faceHeight,
          borderRadius: 10,
          padding: pad,
          boxSizing: 'border-box',
          border: `1px solid ${selected ? 'var(--gold)' : '#a89880'}`,
          boxShadow: selected ? '0 0 0 2px var(--gold)' : '0 2px 6px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.08)',
          cursor: onClick ? 'pointer' : 'default',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
          transition: 'border-color var(--motion-fast) var(--anim-ease-standard), box-shadow var(--motion-fast) var(--anim-ease-standard), transform var(--motion-fast) var(--anim-ease-standard)',
        }}
        onMouseEnter={(e) => {
          if (onClick) (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = '';
        }}
      >
        <div style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 6,
        }}>
          <img
            src={`/assets/cards/${card.designId}.png`}
            alt={card.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
            draggable={false}
            onError={() => setImgError(true)}
          />
          {card.wares ? (
            card.wares.types.length > 3 ? (
            /* 6-ware layout: top row of 3 pips, bottom row with coins + 3 pips */
            <div
              {...wareStripProps}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: tinyFace ? 1 : compactFace ? 2 : 3,
                padding: tinyFace ? 2 : compactFace ? 3 : 4,
                background: 'rgba(0,0,0,0.35)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', gap: pipGap, justifyContent: 'center' }}>
                {card.wares.types.slice(0, 3).map((w, i) => (
                  <div key={i} style={{
                    width: pipSize,
                    height: pipSize,
                    borderRadius: tinyFace ? 2 : compactFace ? 4 : 5,
                    background: WARE_COLORS[w],
                    border: '1.5px solid rgba(0,0,0,0.6)',
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <img
                  src={`/assets/coins/coin_${card.wares.buyPrice}.png`}
                  alt={`${card.wares.buyPrice}g`}
                  style={{ width: coinSize, height: coinSize }}
                  draggable={false}
                />
                <div style={{ display: 'flex', gap: pipGap }}>
                  {card.wares.types.slice(3).map((w, i) => (
                    <div key={i} style={{
                      width: pipSize,
                      height: pipSize,
                      borderRadius: tinyFace ? 2 : compactFace ? 4 : 5,
                      background: WARE_COLORS[w],
                      border: '1.5px solid rgba(0,0,0,0.6)',
                    }} />
                  ))}
                </div>
                <img
                  src={`/assets/coins/coin_${card.wares.sellPrice}.png`}
                  alt={`${card.wares.sellPrice}g`}
                  style={{ width: coinSize, height: coinSize }}
                  draggable={false}
                />
              </div>
            </div>
            ) : (
            <div
              {...wareStripProps}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: tinyFace ? 2 : compactFace ? 3 : 4,
                background: 'rgba(0,0,0,0.35)',
                cursor: 'pointer',
              }}
            >
              <img
                src={`/assets/coins/coin_${card.wares.buyPrice}.png`}
                alt={`${card.wares.buyPrice}g`}
                style={{ width: coinSize, height: coinSize }}
                draggable={false}
              />
              <div style={{ display: 'flex', gap: pipGap }}>
                {card.wares.types.map((w, i) => (
                  <div key={i} style={{
                    width: pipSize,
                    height: pipSize,
                    borderRadius: tinyFace ? 2 : compactFace ? 4 : 5,
                    background: WARE_COLORS[w],
                    border: '1.5px solid rgba(0,0,0,0.6)',
                  }} />
                ))}
              </div>
              <img
                src={`/assets/coins/coin_${card.wares.sellPrice}.png`}
                alt={`${card.wares.sellPrice}g`}
                style={{ width: coinSize, height: coinSize }}
                draggable={false}
              />
            </div>
            )
          ) : (
            <div
              onClick={(e) => { e.stopPropagation(); onMegaView?.(cardId); }}
              {...buttonProps(onMegaView ? () => onMegaView(cardId) : undefined, `Zoom in on ${card.name}`)}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'rgba(255,255,255,0.85)',
                padding: compactFace ? '2px 3px' : '3px 4px',
                cursor: 'pointer',
              }}
            >
              <div style={{
                fontSize: compactFace ? 7 : 8,
                fontWeight: 700,
                color: '#1a1714',
                lineHeight: 1,
                textAlign: 'center',
                whiteSpace: compactFace ? 'nowrap' : undefined,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {card.name}
              </div>
              {!compactFace && (
                <div style={{
                  fontSize: 7,
                  color: '#4a4540',
                  lineHeight: 1.1,
                  textAlign: 'center',
                }}>
                  {card.description}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>);
  }

  return (
    <div
      title={tooltip}
      onClick={onClick}
      {...buttonProps(onClick, card.name)}
      style={{
        width: fallbackWidth,
        height: fallbackHeight,
        borderRadius: 10,
        border: `2px solid ${selected ? 'var(--gold)' : 'var(--border)'}`,
        background: selected ? 'var(--surface-accent)' : 'var(--surface)',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'border-color var(--motion-fast) var(--anim-ease-standard), transform var(--motion-fast) var(--anim-ease-standard)',
      }}
      onMouseEnter={(e) => {
        if (onClick) (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = '';
      }}
    >
      {/* Header bar with type color */}
      <div style={{
        background: headerColor,
        padding: small ? '3px 5px' : '4px 8px',
        fontSize: small ? 10 : 12,
        fontWeight: 700,
        textTransform: 'uppercase',
        color: '#000',
        letterSpacing: '0.5px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>{card.type}</span>
      </div>

      {/* Card name */}
      <div style={{
        flex: 1,
        padding: small ? 4 : 6,
        fontSize: small ? 10 : 13,
        fontWeight: 600,
        lineHeight: 1.2,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
      }}>
        {card.name}
      </div>

      {/* Wares section for ware cards */}
      {card.wares && (
        <div style={{
          padding: small ? '3px 4px' : '4px 6px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          fontSize: small ? 9 : 11,
        }}>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
            {card.wares.types.map((w, i) => (
              <span key={i} style={{
                background: WARE_COLORS[w],
                borderRadius: 4,
                width: small ? 14 : 18,
                height: small ? 14 : 18,
                display: 'inline-block',
              }} />
            ))}
          </div>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            {card.wares.buyPrice}g / {card.wares.sellPrice}g
          </div>
        </div>
      )}
    </div>
  );
}

export function WareToken({ type, onClick, selected, size = 42 }: { type: WareType; onClick?: () => void; selected?: boolean; size?: number }) {
  return (
    <img
      src={`/assets/tokens/${type}.png`}
      alt={type}
      onClick={onClick}
      {...buttonProps(onClick, type)}
      style={{
        width: size,
        height: size,
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
        outline: selected ? '2px solid var(--gold)' : 'none',
        borderRadius: 5,
      }}
      draggable={false}
    />
  );
}

export { WARE_COLORS };
