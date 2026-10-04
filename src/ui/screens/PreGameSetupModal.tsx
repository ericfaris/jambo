import { useState } from 'react';
import type { AIDifficulty } from '../../ai/difficulties/index.ts';

type PreGameMode = 'solo' | 'multiplayer';

interface PreGameSetupModalProps {
  mode: PreGameMode;
  aiDifficulty: AIDifficulty;
  onCancel: () => void;
  onStart: (options: { castMode: boolean; aiDifficulty: AIDifficulty }) => void;
  castStartError?: string | null;
}

const sectionLabelStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-muted)',
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
} as const;

export function PreGameSetupModal({ mode, aiDifficulty: initialDifficulty, onCancel, onStart, castStartError }: PreGameSetupModalProps) {
  const [castMode, setCastMode] = useState(false);
  const [difficulty, setDifficulty] = useState<AIDifficulty>(initialDifficulty);

  const title = mode === 'solo' ? 'New Game' : 'New Multiplayer Game';

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
      }}
    >
      <div
        className="dialog-pop"
        style={{
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          width: 'min(460px, 90vw)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Title */}
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          color: 'var(--text-muted)',
        }}>
          Game Setup
        </div>
        <div style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'clamp(28px, 6vw, 44px)',
          color: 'var(--gold)',
          textShadow: '0 2px 12px rgba(0,0,0,0.6)',
        }}>
          {title}
        </div>
        <div style={{
          width: 60,
          height: 3,
          borderRadius: 2,
          background: 'var(--gold)',
          opacity: 0.5,
        }} />

        {/* Display mode */}
        <div style={{ width: '100%' }}>
          <div style={sectionLabelStyle}>Display</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <OptionButton
              selected={!castMode}
              onClick={() => setCastMode(false)}
              label="This Device"
              description="Play without Chromecast"
            />
            <OptionButton
              selected={castMode}
              onClick={() => setCastMode(true)}
              label="Chromecast TV"
              description="Board on TV, players on phones"
            />
          </div>
        </div>

        {/* AI difficulty (solo only) */}
        {mode === 'solo' && (
          <div style={{ width: '100%' }}>
            <div style={sectionLabelStyle}>AI Difficulty</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <OptionButton
                selected={difficulty === 'easy'}
                onClick={() => setDifficulty('easy')}
                label="Easy"
                description="Simple decisions"
              />
              <OptionButton
                selected={difficulty === 'medium'}
                onClick={() => setDifficulty('medium')}
                label="Medium"
                description="Basic strategy"
              />
              <OptionButton
                selected={difficulty === 'hard'}
                onClick={() => setDifficulty('hard')}
                label="Hard"
                description="Deep evaluation"
              />
              <OptionButton
                selected={difficulty === 'expert'}
                onClick={() => setDifficulty('expert')}
                label="Expert"
                description="Simulates future turns"
              />
            </div>
          </div>
        )}

        {/* Error */}
        {castStartError && (
          <div style={{ color: '#ff9977', fontSize: 13 }}>
            {castStartError}
          </div>
        )}

        {/* Divider */}
        <div style={{
          width: '100%',
          height: 1,
          background: 'var(--border-light)',
          opacity: 0.4,
        }} />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-light)',
              color: 'var(--text-muted)',
              borderRadius: 8,
              padding: '10px 20px',
              cursor: 'pointer',
              fontSize: 15,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onStart({ castMode, aiDifficulty: difficulty })}
            style={{
              background: 'var(--surface-accent)',
              border: '2px solid var(--gold)',
              color: 'var(--gold)',
              borderRadius: 8,
              padding: '10px 20px',
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
            }}
          >
            Start Game
          </button>
        </div>
      </div>
    </div>
  );
}

function OptionButton({ selected, onClick, label, description }: {
  selected: boolean;
  onClick: () => void;
  label: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '10px 8px',
        borderRadius: 8,
        border: selected ? '2px solid var(--gold)' : '2px solid rgba(255,255,255,0.08)',
        background: selected ? 'rgba(212,168,80,0.12)' : 'rgba(255,255,255,0.03)',
        color: selected ? 'var(--gold)' : 'var(--text)',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
    </button>
  );
}
