import type { DeckCardId, WareType } from '../engine/types.ts';
import { WARE_TYPES } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { WARE_COLORS } from './CardFace.tsx';

// Dialogs (draw, Buy/Sell, zoom, resolve panels) cover the board, so the
// player loses sight of their own market stands exactly when deciding what
// to do with a ware card. This compact row shows every stall slot in order
// (filled = ware colour, empty = dashed outline) plus, for a ware card,
// whether its wares are on hand to sell.

export interface SellCheck {
  canSell: boolean;
  /** Wares still missing to sell this card, one entry per missing ware */
  missing: WareType[];
}

/** Which of a ware card's wares the market is missing for a sale. */
export function checkSell(cardId: DeckCardId, market: readonly (WareType | null)[]): SellCheck | null {
  const wares = getCard(cardId).wares;
  if (!wares) return null;
  const have: Record<WareType, number> = { trinkets: 0, hides: 0, tea: 0, silk: 0, fruit: 0, salt: 0 };
  for (const slot of market) if (slot) have[slot] += 1;
  const missing: WareType[] = [];
  for (const type of wares.types) {
    if (have[type] > 0) have[type] -= 1;
    else missing.push(type);
  }
  return { canSell: missing.length === 0, missing };
}

function wareLabel(type: WareType, count: number): string {
  if (type === 'tea' || type === 'silk' || type === 'fruit' || type === 'salt') return type;
  return count === 1 ? type.slice(0, -1) : type; // trinket(s), hide(s)
}

function describeMissing(missing: readonly WareType[]): string {
  return WARE_TYPES
    .map((type) => ({ type, n: missing.filter((m) => m === type).length }))
    .filter(({ n }) => n > 0)
    .map(({ type, n }) => `${n} ${wareLabel(type, n)}`)
    .join(', ');
}

interface MarketSummaryProps {
  market: readonly (WareType | null)[];
  /** A ware card being considered — adds a "can you sell it?" line */
  cardId?: DeckCardId | null;
  /** Light text for dark overlays (resolve panels); dark text on linen dialogs (default) */
  tone?: 'onLinen' | 'onDark';
}

export function MarketSummary({ market, cardId, tone = 'onLinen' }: MarketSummaryProps) {
  const filled = market.filter((slot) => slot !== null).length;
  const free = market.length - filled;
  const sell = cardId ? checkSell(cardId, market) : null;
  const textColor = tone === 'onDark' ? 'var(--text)' : '#4a3a2a';
  const mutedColor = tone === 'onDark' ? 'var(--text-muted)' : '#6b5843';

  return (
    <div
      className="market-summary"
      aria-label={`Your market: ${filled} ware${filled === 1 ? '' : 's'}, ${free} free slot${free === 1 ? '' : 's'}`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: textColor }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: mutedColor }}>
          Your market
        </span>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 260 }}>
          {market.map((slot, i) => (
            <div
              key={i}
              data-ware={slot ?? 'empty'}
              title={slot ?? 'empty'}
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                boxSizing: 'border-box',
                background: slot ? WARE_COLORS[slot] : 'transparent',
                border: slot ? '1.5px solid rgba(0,0,0,0.55)' : `1.5px dashed ${mutedColor}`,
                // Gap between the large stand (6) and each small stand (3)
                marginLeft: i >= 6 && (i - 6) % 3 === 0 ? 6 : 0,
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 12, color: mutedColor }}>{free} free</span>
      </div>
      {sell && (
        <div className="market-summary-sell" style={{ fontSize: 13, fontWeight: 600, color: sell.canSell ? (tone === 'onDark' ? '#9cc46a' : '#3f6a1e') : textColor }}>
          {sell.canSell
            ? '✓ You have the wares to sell this'
            : `To sell, you still need: ${describeMissing(sell.missing)}`}
        </div>
      )}
    </div>
  );
}
