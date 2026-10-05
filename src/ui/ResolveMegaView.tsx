import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DeckCardId, WareType } from '../engine/types.ts';
import { MarketSummary } from './MarketSummary.tsx';
import { HandReferenceStrip } from './HandReferenceStrip.tsx';

interface ResolveMegaViewProps {
  children: ReactNode;
  verticalAlign?: 'top' | 'center';
  hand?: DeckCardId[];
  onMegaView?: (cardId: DeckCardId) => void;
  hideHandStrip?: boolean;
  /** The viewer's market — the panel covers the board, so show it above the panel */
  market?: readonly (WareType | null)[];
}

/** Height reserved for the fixed HandReferenceStrip (45px peeks + padding + border). */
export const HAND_STRIP_RESERVE_PX = 60;

export function ResolveMegaView({ children, verticalAlign = 'top', hand, onMegaView, hideHandStrip, market }: ResolveMegaViewProps) {
  const showStrip = !hideHandStrip && hand && hand.length > 0;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  // Show a "More below" cue while the panel's buttons are scrolled out of view
  const updateMoreBelow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateMoreBelow();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateMoreBelow) : null;
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    window.addEventListener('resize', updateMoreBelow);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateMoreBelow);
    };
  }, [updateMoreBelow, children]);

  return (
    <div
      className="overlay-fade"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(20,10,5,0.85)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: verticalAlign === 'center' ? 'center' : 'flex-start',
        justifyContent: 'center',
        padding: 'clamp(8px, 3vw, 24px)',
        // Keep the scroll area clear of the fixed hand strip so buttons never sit under it
        paddingBottom: showStrip ? HAND_STRIP_RESERVE_PX : undefined,
        overflowY: 'auto',
      }}
    >
      <div
        ref={scrollRef}
        onScroll={updateMoreBelow}
        className="dialog-pop"
        style={{
          width: 'min(980px, 100%)',
          maxHeight: `calc(100dvh - 16px - ${showStrip ? HAND_STRIP_RESERVE_PX : 0}px)`,
          overflowY: 'auto',
          border: 'none',
          background: 'transparent',
          boxShadow: 'none',
          margin: '0 auto',
          position: 'relative',
        }}
      >
        {market && <div style={{ marginBottom: 8 }}><MarketSummary market={market} tone="onDark" /></div>}
        <div>{children}</div>
        {moreBelow && (
          <button
            type="button"
            onClick={() => scrollRef.current?.scrollBy({ top: scrollRef.current.clientHeight * 0.8, behavior: 'smooth' })}
            style={{
              position: 'sticky',
              bottom: 8,
              display: 'block',
              margin: '0 auto',
              zIndex: 2,
              borderRadius: 999,
              padding: '6px 16px',
              fontSize: 14,
              fontWeight: 700,
              background: 'var(--gold)',
              color: '#1a1714',
              border: '1px solid #1a1714',
              boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
            }}
          >
            More below ↓
          </button>
        )}
      </div>
      {showStrip && (
        <HandReferenceStrip hand={hand} onMegaView={onMegaView} />
      )}
    </div>
  );
}
