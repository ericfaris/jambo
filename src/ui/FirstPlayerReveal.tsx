import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { playSfx } from './useAudioEvents.ts';

interface FirstPlayerRevealProps {
  firstPlayer: 0 | 1;
  onComplete: () => void;
  /** Hotseat: name the seats instead of "You"/"Opponent" */
  localMultiplayer?: boolean;
}

/** Coin toss timeline, ms. */
export const COIN_TOSS_TIMINGS = { spinMs: 1400, revealAt: 1450, fadeAt: 2700, doneAt: 3400 } as const;

/** Final rotation: whole turns, landing on the first player's face. */
export function coinTossRotation(firstPlayer: 0 | 1, turns = 5): number {
  return turns * 360 + (firstPlayer === 0 ? 0 : 180);
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Who goes first, as a brass coin toss: the coin spins and lands on the
 * first player's face, then the line appears. (It used to be plain text on
 * black — the first thing anyone sees after Start Game.)
 */
export function FirstPlayerReveal({ firstPlayer, onComplete, localMultiplayer = false }: FirstPlayerRevealProps) {
  const reduced = prefersReducedMotion();
  const [phase, setPhase] = useState<'spinning' | 'revealed' | 'fading'>(reduced ? 'revealed' : 'spinning');

  useEffect(() => {
    const timers = [
      window.setTimeout(() => {
        setPhase('revealed');
        playSfx('coin');
      }, reduced ? 0 : COIN_TOSS_TIMINGS.revealAt),
      window.setTimeout(() => setPhase('fading'), COIN_TOSS_TIMINGS.fadeAt),
      window.setTimeout(onComplete, COIN_TOSS_TIMINGS.doneAt),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [onComplete, reduced]);

  const label = localMultiplayer
    ? `Player ${firstPlayer + 1} goes first`
    : firstPlayer === 0 ? 'You go first' : 'Opponent goes first';
  const faces: [string, string] = localMultiplayer ? ['P1', 'P2'] : ['You', 'AI'];

  return (
    <div
      className="coin-toss"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9500,
        background: 'rgba(20,10,5,0.90)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: phase === 'fading' ? 0 : 1,
        transition: 'opacity 0.7s ease-out',
      }}
    >
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--text-muted)' }}>
          First Player
        </div>
        <div className="coin-toss-stage" aria-hidden="true">
          <div
            className={`coin-toss-coin${phase === 'spinning' ? ' coin-toss-spinning' : ''}`}
            style={{ '--coin-end': `${coinTossRotation(firstPlayer)}deg` } as CSSProperties}
          >
            <span className="coin-face coin-face-front">{faces[0]}</span>
            <span className="coin-face coin-face-back">{faces[1]}</span>
          </div>
          <div className="coin-toss-shadow" />
        </div>
        <div
          role="status"
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'clamp(32px, 7vw, 52px)',
            color: 'var(--gold)',
            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
            opacity: phase === 'spinning' ? 0 : 1,
            transform: phase === 'spinning' ? 'translateY(8px)' : 'none',
            transition: 'opacity 0.35s ease-out, transform 0.35s ease-out',
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
