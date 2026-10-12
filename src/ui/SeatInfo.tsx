import type { ReactNode } from 'react';
import { GoldCount, OpponentHandFan } from './life.tsx';
import { GoldTrack } from './GoldTrack.tsx';

/**
 * A seat's portrait, name, gold, gold track and hand-size fan. The opponent's
 * panel and yours share it on desktop so the two blocks read and line up the same.
 */
export function SeatInfo({ seat, label, subtitle, portrait, gold, goldDelta = 0, handCount, isActive = false, rightInset = 0, handAnchor = false, children }: {
  seat?: 0 | 1;
  label: string;
  /** Under the name, e.g. "Spice merchant · Hard". */
  subtitle?: string;
  portrait?: ReactNode;
  gold: number;
  goldDelta?: number;
  handCount: number;
  /** Their turn: gold name, fan sways. */
  isActive?: boolean;
  /** Keeps the block clear of the fixed corner button, when it overlaps. */
  rightInset?: number;
  /** Card flights land on this fan (the opponent's; yours land on your real hand). */
  handAnchor?: boolean;
  /** Extra lines under the fan, e.g. Wise Man modifiers. */
  children?: ReactNode;
}) {
  return (
    <div className="seat-info" style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'flex-start', paddingRight: rightInset }}>
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
          <span key={`seat-gold-${goldDelta}`} data-gold-anchor={seat} className={goldDelta !== 0 ? 'gold-pop gold-pop-strong' : undefined} style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 20, fontFamily: 'var(--font-heading)', position: 'relative' }} aria-label={`${gold} gold`}>
            <GoldCount value={gold} />
            {goldDelta !== 0 && (
              <span className="gold-delta-text gold-delta-text-strong" style={{
                position: 'absolute',
                // beside the number, so it never rises into the subtitle
                top: 4, right: '100%', marginRight: 8, whiteSpace: 'nowrap',
                color: goldDelta > 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                fontSize: 12,
                fontWeight: 700,
              }}>
                {goldDelta > 0 ? `+${goldDelta}g` : `${goldDelta}g`}
              </span>
            )}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 15 }}>
            {handCount} {handCount === 1 ? 'card' : 'cards'}
          </span>
        </div>
        <GoldTrack gold={gold} />
        <div data-hand-anchor={handAnchor ? seat : undefined}>
          <OpponentHandFan count={handCount} thinking={isActive} />
        </div>
        {children}
      </div>
    </div>
  );
}
