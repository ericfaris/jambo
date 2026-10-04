import { useEffect, useState } from 'react';

interface FirstPlayerRevealProps {
  firstPlayer: 0 | 1;
  onComplete: () => void;
  /** Hotseat: name the seats instead of "You"/"Opponent" */
  localMultiplayer?: boolean;
}

export function FirstPlayerReveal({ firstPlayer, onComplete, localMultiplayer = false }: FirstPlayerRevealProps) {
  const [phase, setPhase] = useState<'visible' | 'fading'>('visible');

  useEffect(() => {
    const showTimer = window.setTimeout(() => {
      setPhase('fading');
    }, 1800);

    const doneTimer = window.setTimeout(() => {
      onComplete();
    }, 2600);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete]);

  const label = localMultiplayer
    ? `Player ${firstPlayer + 1} goes first`
    : firstPlayer === 0 ? 'You go first' : 'Opponent goes first';

  return (
    <div
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
        transition: 'opacity 0.8s ease-out',
      }}
    >
      <div
        className="dialog-pop"
        style={{
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          color: 'var(--text-muted)',
        }}>
          First Player
        </div>
        <div style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'clamp(32px, 7vw, 52px)',
          color: 'var(--gold)',
          textShadow: '0 2px 12px rgba(0,0,0,0.6)',
        }}>
          {label}
        </div>
        <div style={{
          width: 60,
          height: 3,
          borderRadius: 2,
          background: 'var(--gold)',
          opacity: 0.5,
          marginTop: 4,
        }} />
      </div>
    </div>
  );
}
