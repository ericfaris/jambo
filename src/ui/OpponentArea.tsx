import { memo } from 'react';
import type { ReactNode } from 'react';
import type { PlayerState } from '../engine/types.ts';
import { MarketDisplay } from './MarketDisplay.tsx';
import { UtilityArea, UtilityChips } from './UtilityArea.tsx';
import type { DeckCardId } from '../engine/types.ts';
import { SpeechBubble } from './SpeechBubble.tsx';
import { GoldCount, OpponentHandFan } from './life.tsx';
import { GoldTrack } from './GoldTrack.tsx';

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
  /** It's this player's turn (their card backs shuffle, name lights up). */
  isActive?: boolean;
  /** This player's seat — anchors for the trade animations. */
  seat?: 0 | 1;
  /** The AI trader's portrait (solo), beside the name. */
  portrait?: ReactNode;
  /** compact: a smaller portrait for the phone strip. */
  compactPortrait?: ReactNode;
  /** Under the name, e.g. "Spice merchant · Hard". */
  subtitle?: string;
}

function OpponentAreaComponent({ player, aiMessage, onMessageHide, goldDelta = 0, marketFlashSlots, label = 'Opponent (AI)', compact = false, onMegaView, slotSize = 26, marketColumns, isActive = false, seat, portrait, compactPortrait, subtitle }: OpponentAreaProps) {
  const goldEl = (
    <span key={`opp-gold-${goldDelta}`} data-gold-anchor={seat} className={goldDelta !== 0 ? 'gold-pop gold-pop-strong' : undefined} style={{ color: 'var(--gold)', fontWeight: 700, fontSize: compact ? 15 : 20, fontFamily: 'var(--font-heading)', position: 'relative' }} aria-label={`${player.gold} gold`}>
      <GoldCount value={player.gold} />
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
            {compactPortrait}
            <span className="phone-opp-name">{label}</span>
            {goldEl}
            <span className="ui-helper-text" data-hand-anchor={seat}>{player.hand.length} cards</span>
          </div>
          <GoldTrack gold={player.gold} width="100%" compact />
          <MarketDisplay
            market={player.market}
            flashSlots={marketFlashSlots}
            flashVariant="strong"
            slotSize={slotSize}
            tokenSize={Math.round(slotSize * 0.82)}
            columns={marketColumns}
            compact
            owner={seat}
          />
          <div data-spotlight-target="opponent-utilities" data-utility-anchor={seat}>
            <UtilityChips utilities={player.utilities} onMegaView={onMegaView} />
          </div>
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
        right={portrait ? 'clamp(290px, 30vw, 350px)' : undefined}
      />
      <div className="etched-wood-border" style={{
        background: 'rgba(20,10,5,0.5)',
        borderRadius: 10,
        padding: '10px 16px',
        display: 'flex',
        gap: 24,
        alignItems: 'flex-start',
      }}>
        <MarketDisplay market={player.market} flashSlots={marketFlashSlots} flashVariant="strong" label="Market" owner={seat} />
        {/* maxSlots reserves the row's height so the board never jumps when a utility lands */}
        <div data-spotlight-target="opponent-utilities" data-utility-anchor={seat}>
          <UtilityArea utilities={player.utilities} disabled label="Utilities" cardSize="small" maxSlots={3} onMegaView={onMegaView} />
        </div>
        {/* right padding keeps the name clear of the fixed avatar/settings button */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'flex-start', paddingRight: 44 }}>
        {portrait}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, paddingTop: 2 }}>
          <span style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: 18,
            color: isActive ? 'var(--gold)' : 'var(--text)',
            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
          }}>
            {label}
          </span>
          {subtitle && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -4 }}>{subtitle}</span>}
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
            {goldEl}
            <span style={{ color: 'var(--text-muted)', fontSize: 15 }}>
              {player.hand.length} {player.hand.length === 1 ? 'card' : 'cards'}
            </span>
          </div>
          <GoldTrack gold={player.gold} />
          <div data-hand-anchor={seat}>
            <OpponentHandFan count={player.hand.length} thinking={isActive} />
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

export const OpponentArea = memo(OpponentAreaComponent);
