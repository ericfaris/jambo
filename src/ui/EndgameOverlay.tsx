import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { GameState, DeckCardId } from '../engine/types.ts';
import { getWinner, getFinalScores } from '../engine/endgame/EndgameManager.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import type { GameStory } from './gameStory.ts';
import { GoldChart } from './GoldChart.tsx';

interface EndgameOverlayProps {
  state: GameState;
  /** Replayed story of the game (chart, swing, paydays, MVP); optional. */
  story?: GameStory | null;
  /** Seat names: ['You', 'AI'] in solo, ['Player 1', 'Player 2'] in hotseat. */
  labels?: readonly [string, string];
  /** The seat at the screen; null in hotseat (both players are here). */
  viewer?: 0 | 1 | null;
  onRematch: () => void;
  /** e.g. "Rematch · Hard" */
  rematchLabel?: string;
  onMainMenu?: () => void;
  /** Your record against this difficulty, after this game. */
  record?: { wins: number; losses: number } | null;
}

/** "You win!" / "AI wins!" / "Player 2 wins!" */
export function winnerHeadline(winner: 0 | 1 | null, labels: readonly [string, string]): string {
  if (winner === null) return 'Game over';
  return labels[winner] === 'You' ? 'You win!' : `${labels[winner]} wins!`;
}

function cardName(id: DeckCardId): string {
  return getCard(id).name;
}

const COINS = Array.from({ length: 16 }, (_, i) => i);

export function EndgameOverlay({ state, story = null, labels = ['You', 'AI'], viewer = 0, onRematch, rematchLabel = 'Rematch', onMainMenu, record = null }: EndgameOverlayProps) {
  const rematchRef = useRef<HTMLButtonElement | null>(null);
  const isOver = state.phase === 'GAME_OVER';
  useEffect(() => {
    if (isOver) rematchRef.current?.focus();
  }, [isOver]);
  const scores = useMemo(() => (isOver ? getFinalScores(state) : null), [isOver, state]);
  if (!isOver || !scores) return null;

  const winner = getWinner(state);
  // Hotseat: someone at the table always won
  const celebrate = viewer === null || winner === viewer;
  const accent = celebrate ? 'var(--gold)' : 'var(--accent-red)';
  const me = viewer ?? 0;
  const mvp = story?.mvp[me] ?? null;
  const payday = story?.bestPayday[me] ?? null;
  const theirPayday = story?.bestPayday[me === 0 ? 1 : 0] ?? null;
  const swing = story?.biggestSwing ?? null;

  return (
    <div className="overlay-fade endgame-overlay" role="dialog" aria-modal="true" aria-labelledby="endgame-title">
      {celebrate && (
        <div className="coin-shower" aria-hidden="true">
          {COINS.map((i) => <span key={i} className="coin-shower-coin" style={{ '--i': i } as CSSProperties} />)}
        </div>
      )}
      <div className="dialog-pop endgame-card" style={{ borderColor: accent }}>
        <div className="endgame-eyebrow">Game over · {state.turn} turns</div>
        <h2 id="endgame-title" className="endgame-title" style={{ color: accent }}>{winnerHeadline(winner, labels)}</h2>
        <div className="endgame-scores">
          <div>
            <div className="endgame-score-label">{labels[0]}</div>
            <div className="endgame-score endgame-score-0">{scores.player0}g</div>
          </div>
          <div className="endgame-vs">vs</div>
          <div>
            <div className="endgame-score-label">{labels[1]}</div>
            <div className="endgame-score endgame-score-1">{scores.player1}g</div>
          </div>
        </div>

        {story && <GoldChart timeline={story.timeline} labels={labels} highlightTurn={swing?.turn ?? null} />}

        {story && (
          <div className="endgame-facts">
            {swing && (
              <div className="endgame-fact">
                <div className="endgame-fact-label">Biggest swing</div>
                <div className="endgame-fact-value">Turn {swing.turn}</div>
                <div className="endgame-fact-detail">{labels[swing.player]} gained {swing.gain}g on {swing.player === 0 ? labels[1] : labels[0]}</div>
              </div>
            )}
            {payday && (
              <div className="endgame-fact">
                <div className="endgame-fact-label">{viewer === null ? `${labels[0]}'s best payday` : 'Your best payday'}</div>
                <div className="endgame-fact-value">+{payday.gold}g</div>
                <div className="endgame-fact-detail">{cardName(payday.cardId)}, turn {payday.turn + 1}</div>
              </div>
            )}
            {theirPayday && (
              <div className="endgame-fact">
                <div className="endgame-fact-label">{labels[me === 0 ? 1 : 0]}'s best payday</div>
                <div className="endgame-fact-value">+{theirPayday.gold}g</div>
                <div className="endgame-fact-detail">{cardName(theirPayday.cardId)}, turn {theirPayday.turn + 1}</div>
              </div>
            )}
            {mvp && (
              <div className="endgame-fact endgame-fact-mvp">
                <img src={`/assets/cards/${getCard(mvp.cardId).designId}.png`} alt="" />
                <div>
                  <div className="endgame-fact-label">{viewer === null ? `${labels[0]}'s MVP card` : 'Your MVP card'}</div>
                  <div className="endgame-fact-value">{cardName(mvp.cardId)}</div>
                  <div className="endgame-fact-detail">+{mvp.gold}g net over {mvp.plays} {mvp.plays === 1 ? 'play' : 'plays'}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {record && (record.wins + record.losses > 0) && (
          <div className="endgame-record">Your record at this level: {record.wins}–{record.losses}</div>
        )}

        <div className="endgame-actions">
          <button ref={rematchRef} className="primary" onClick={onRematch}>{rematchLabel}</button>
          {onMainMenu && <button onClick={onMainMenu}>Main Menu</button>}
        </div>
      </div>
    </div>
  );
}
