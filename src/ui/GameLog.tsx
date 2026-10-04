import { useEffect, useRef } from 'react';
import type { GameLogEntry } from '../engine/types.ts';
import { humanizeLogDetails } from './uiHints.ts';

interface GameLogProps {
  log: GameLogEntry[];
  labels?: readonly [string, string];
  /** Player whose card identities stay hidden (the AI in solo) */
  hiddenPlayer?: 0 | 1 | null;
}

export function GameLog({ log, labels = ['Player 1', 'Player 2'], hiddenPlayer = null }: GameLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  const recent = log.slice(-50);

  return (
    <div style={{
      background: 'rgba(20,10,5,0.85)',
      borderRadius: 10,
      border: '1px solid rgba(122,90,62,0.5)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      backdropFilter: 'blur(3px)',
      flex: 1,
      overflowY: 'auto',
      padding: 10,
      fontSize: 13,
      lineHeight: 1.6,
    }}>
      {recent.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Game log will appear here...</div>
      )}
      {recent.map((entry, i) => (
        <div key={i} className={i === recent.length - 1 ? 'log-entry' : undefined} style={{
          color: entry.player === 1 ? '#D4A574' : 'var(--text)',
          opacity: i < recent.length - 10 ? 0.6 : 1,
        }}>
          <span style={{ color: 'var(--text-muted)' }}>T{entry.turn}</span>{' '}
          <span style={{ fontWeight: 600 }}>{labels[entry.player]}</span>{' '}
          <span style={{ color: 'var(--text-muted)' }}>
            {entry.details ? humanizeLogDetails(entry.details, entry.player === hiddenPlayer) : entry.action.toLowerCase().replace(/_/g, ' ')}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
