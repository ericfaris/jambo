import { memo } from 'react';
import type { PlayerState } from '../engine/types.ts';
import { MarketDisplay } from './MarketDisplay.tsx';
import { UtilityArea, UtilityChips } from './UtilityArea.tsx';
import type { DeckCardId } from '../engine/types.ts';
import { SpeechBubble } from './SpeechBubble.tsx';

interface OpponentAreaProps {
  player: PlayerState;
  aiMessage?: string;
  onMessageHide?: () => void;
  goldDelta?: number;
  marketFlashSlots?: number[];
  label?: string;
  /** Phone layout: one-line header, small market slots, utility chips. */
  compact?: boolean;
  onMegaView?: (cardId: DeckCardId) => void;
  /** compact only: market slot size in px (fit to width by the caller). */
  slotSize?: number;
  /** compact only: wrap the market after this many slots. */
  marketColumns?: number;
}

function OpponentAreaComponent({ player, aiMessage, onMessageHide, goldDelta = 0, marketFlashSlots, label = 'Opponent (AI)', compact = false, onMegaView, slotSize = 26, marketColumns }: OpponentAreaProps) {
  const goldEl = (
    <span key={`opp-gold-${goldDelta}`} className={goldDelta !== 0 ? 'gold-pop gold-pop-strong' : undefined} style={{ color: 'var(--gold)', fontWeight: 700, fontSize: compact ? 15 : 16, position: 'relative' }}>
      {player.gold}g
      {goldDelta !== 0 && (
        <span className="gold-delta-text gold-delta-text-strong" style={{
          position: 'absolute',
          top: -18,
          right: -20,
          color: goldDelta > 0 ? 'var(--accent-green)' : 'var(--accent-red)',
          fontSize: 12,
          fontWeight: 700,
        }}>
          {goldDelta > 0 ? `+${goldDelta}g` : `${goldDelta}g`}
        </span>
      )}
    </span>
  );

  if (compact) {
    return (
      <div style={{ position: 'relative' }}>
        <SpeechBubble
          compact
          message={aiMessage || ''}
          visible={!!aiMessage}
          onHide={onMessageHide || (() => {})}
        />
        <div className="phone-opp">
          <div className="phone-opp-head">
            <span className="phone-opp-name">{label}</span>
            {goldEl}
            <span className="ui-helper-text">{player.hand.length} cards</span>
          </div>
          <MarketDisplay
            market={player.market}
            flashSlots={marketFlashSlots}
            flashVariant="strong"
            slotSize={slotSize}
            tokenSize={Math.round(slotSize * 0.82)}
            columns={marketColumns}
            compact
          />
          <UtilityChips utilities={player.utilities} onMegaView={onMegaView} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <SpeechBubble
        message={aiMessage || ''}
        visible={!!aiMessage}
        onHide={onMessageHide || (() => {})}
      />
      <div className="etched-wood-border" style={{
        background: 'rgba(20,10,5,0.5)',
        borderRadius: 10,
        padding: 16,
      }}>
      <div style={{
        position: 'relative',
        display: 'flex',
        gap: 20,
        flexWrap: 'wrap',
        background: 'rgba(20,10,5,0.4)',
        borderRadius: 10,
        padding: '10px 10px 36px',
      }}>
        <MarketDisplay market={player.market} flashSlots={marketFlashSlots} flashVariant="strong" label="Market" />
        <UtilityArea utilities={player.utilities} disabled label="Utilities" cardSize="medium" />
        <span style={{
          position: 'absolute',
          left: 10,
          bottom: 8,
          fontFamily: 'var(--font-heading)',
          fontWeight: 700,
          fontSize: 18,
          color: 'var(--text)',
          textShadow: '0 2px 12px rgba(0,0,0,0.6)',
        }}>
          {label}
        </span>
        <div style={{ position: 'absolute', right: 10, bottom: 8, display: 'flex', gap: 16, alignItems: 'center' }}>
          {goldEl}
          <span style={{ color: 'var(--text-muted)', fontSize: 15 }}>
            {player.hand.length} cards
          </span>
        </div>
      </div>
    </div>
    </div>
  );
}

export const OpponentArea = memo(OpponentAreaComponent);
