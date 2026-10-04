import type { GameState, GameAction } from '../engine/types.ts';
import { CONSTANTS } from '../engine/types.ts';
import { CardFace } from './CardFace.tsx';
import type { VisualFeedbackState } from './useVisualFeedback.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { FEEDBACK_TIMINGS } from './animationTimings.ts';
import { formatLogRecap, formatTurnOwner } from './uiHints.ts';

interface CenterRowProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
  isLocalMode?: boolean;
  showGlow?: boolean;
  visualFeedback?: VisualFeedbackState;
  /** Names for players 0 and 1 in the action recap ("You"/"Opponent", or seat names) */
  actorLabels?: readonly [string, string];
  /** Player whose card identities must stay hidden in the recap (the AI in solo) */
  hiddenPlayer?: 0 | 1 | null;
}

export function CenterRow({ state, isLocalMode = true, showGlow = false, visualFeedback, actorLabels = ['Player 1', 'Player 2'], hiddenPlayer = null }: CenterRowProps) {
  const phaseLabel = state.phase === 'DRAW'
    ? `Draw Phase (${state.drawsThisPhase}/5)`
    : state.phase === 'PLAY'
    ? `Play Phase`
    : 'Game Over';

  const phaseColor = state.phase === 'DRAW' ? '#5a9ab0' : state.phase === 'PLAY' ? '#7a9a4a' : '#c04030';

  const topDiscard = state.discardPile.length > 0
    ? state.discardPile[0]
    : null;
  const [displayDiscardCard, setDisplayDiscardCard] = useState(topDiscard);
  const [actionTag, setActionTag] = useState<string | null>(null);
  const [lastActionRecap, setLastActionRecap] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const deckPileRef = useRef<HTMLDivElement | null>(null);
  const discardPileRef = useRef<HTMLDivElement | null>(null);
  const [drawTrailPath, setDrawTrailPath] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [discardTrailTarget, setDiscardTrailTarget] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const trail = visualFeedback?.trail;
    if (trail?.kind === 'discard' && trail.cardId) {
      const previousTop = state.discardPile.length > 1 ? state.discardPile[1] : null;
      setDisplayDiscardCard(previousTop);
      const timer = window.setTimeout(() => {
        setDisplayDiscardCard(state.discardPile.length > 0 ? state.discardPile[0] : null);
      }, FEEDBACK_TIMINGS.discardPileRevealDelayMs);
      return () => window.clearTimeout(timer);
    }

    setDisplayDiscardCard(topDiscard);
    return;
  }, [visualFeedback?.trail, state.discardPile, topDiscard]);

  useEffect(() => {
    const trail = visualFeedback?.trail;
    if (!trail) return;

    const actorLabel = trail.actor === 1 ? 'Opponent' : 'You';
    const verb = trail.kind === 'draw' ? 'drew a card' : 'discarded a card';
    setActionTag(`${actorLabel} ${verb}`);

    const timer = window.setTimeout(() => setActionTag(null), FEEDBACK_TIMINGS.actionTagDurationMs);
    return () => window.clearTimeout(timer);
  }, [visualFeedback?.trail]);

  useEffect(() => {
    if (state.log.length === 0) return;
    const latest = state.log[state.log.length - 1];
    setLastActionRecap(formatLogRecap(latest, actorLabels, hiddenPlayer));

    const timer = window.setTimeout(() => setLastActionRecap(null), 2500);
    return () => window.clearTimeout(timer);
  }, [state.log.length]);

  useEffect(() => {
    const updateDrawTrailPath = () => {
      const rowEl = rowRef.current;
      const deckEl = deckPileRef.current;
      if (!rowEl || !deckEl) return;

      const trail = visualFeedback?.trail;
      if (!trail || trail.kind !== 'draw') return;

      const targetEl = document.querySelector<HTMLElement>(`[data-center-target="${trail.actor === 1 ? 'top' : 'bottom'}"]`);
      if (!targetEl) return;

      const rowRect = rowEl.getBoundingClientRect();
      const deckRect = deckEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      setDrawTrailPath({
        startX: deckRect.left + (deckRect.width / 2) - (rowRect.left + (rowRect.width / 2)),
        startY: deckRect.top + (deckRect.height / 2) - (rowRect.top + (rowRect.height / 2)),
        endX: targetRect.left + (targetRect.width / 2) - (rowRect.left + (rowRect.width / 2)),
        endY: targetRect.top + (targetRect.height / 2) - (rowRect.top + (rowRect.height / 2)),
      });
    };

    updateDrawTrailPath();
    window.addEventListener('resize', updateDrawTrailPath);
    return () => window.removeEventListener('resize', updateDrawTrailPath);
  }, [visualFeedback?.trail]);

  useEffect(() => {
    const updateDiscardTrailTarget = () => {
      const rowEl = rowRef.current;
      const discardEl = discardPileRef.current;
      if (!rowEl || !discardEl) return;

      const rowRect = rowEl.getBoundingClientRect();
      const discardRect = discardEl.getBoundingClientRect();
      setDiscardTrailTarget({
        x: discardRect.left + (discardRect.width / 2) - (rowRect.left + (rowRect.width / 2)),
        y: discardRect.top + (discardRect.height / 2) - (rowRect.top + (rowRect.height / 2)),
      });
    };

    updateDiscardTrailTarget();
    window.addEventListener('resize', updateDiscardTrailTarget);
    return () => window.removeEventListener('resize', updateDiscardTrailTarget);
  }, []);

  const trailKind = visualFeedback?.trail?.kind;
  const trailActor = visualFeedback?.trail?.actor;

  const deckPulseClass = visualFeedback?.deckPulse
    ? isLocalMode
      ? trailKind === 'draw' && trailActor === 1
        ? 'pile-pulse-strong'
        : 'pile-pulse-soft'
      : 'pile-pulse'
    : undefined;

  const discardPulseClass = visualFeedback?.discardPulse
    ? isLocalMode
      ? trailKind === 'discard' && trailActor === 1
        ? 'pile-pulse-strong'
        : 'pile-pulse-soft'
      : 'pile-pulse'
    : undefined;

  const trailIntensityClass = isLocalMode
    ? visualFeedback?.trail?.actor === 1
      ? 'center-row-trail-strong'
      : 'center-row-trail-soft'
    : undefined;

  return (
    <div ref={rowRef} style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 32,
      padding: '12px 0',
      position: 'relative',
    }}>
      {visualFeedback?.trail && (
        <div
          key={visualFeedback.trail.id}
          className={`center-row-trail center-row-trail-${visualFeedback.trail.kind}-${visualFeedback.trail.actor === 0 ? 'bottom' : 'top'}${trailIntensityClass ? ` ${trailIntensityClass}` : ''}`}
          style={(() => {
            const vars: Record<string, string> = {};
            if (visualFeedback.trail.kind === 'draw' && drawTrailPath) {
              vars['--trail-draw-start-x'] = `${drawTrailPath.startX}px`;
              vars['--trail-draw-start-y'] = `${drawTrailPath.startY}px`;
              vars['--trail-draw-end-x'] = `${drawTrailPath.endX}px`;
              vars['--trail-draw-end-y'] = `${drawTrailPath.endY}px`;
            }
            if (visualFeedback.trail.kind === 'discard' && discardTrailTarget) {
              vars['--trail-discard-end-x'] = `${discardTrailTarget.x}px`;
              vars['--trail-discard-end-y'] = `${discardTrailTarget.y}px`;
            }
            return Object.keys(vars).length > 0 ? (vars as CSSProperties) : undefined;
          })()}
          aria-hidden
        >
          {visualFeedback.trail.kind === 'discard' && visualFeedback.trail.cardId ? (
            <img src={`/assets/cards/${getCard(visualFeedback.trail.cardId).designId}.png`} alt="" draggable={false} />
          ) : (
            <img src="/assets/cards/card_back.png" alt="" draggable={false} />
          )}
        </div>
      )}

      {actionTag && (
        <div className={`center-row-action-tag${visualFeedback?.trail?.actor === 1 ? ' center-row-action-tag-opponent' : ''}`}>
          {actionTag}
        </div>
      )}

      {lastActionRecap && (
        <div className="center-row-recap">
          {lastActionRecap}
        </div>
      )}

      {/* Deck */}
      <div ref={deckPileRef} key={`deck-${visualFeedback?.deckPulse ?? 0}`} className={deckPulseClass} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {state.deck.length > 0 ? (
          <CardFace cardId={state.deck[0]} faceDown small />
        ) : (
          <div style={{
            width: 96,
            height: 128,
            borderRadius: 10,
            border: '2px dashed var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}>
            Empty
          </div>
        )}
        <div className="panel-section-title" style={{ marginBottom: 0 }}>
          Deck ({state.deck.length})
        </div>
      </div>

      {/* Phase indicator */}
      <div key={`phase-${visualFeedback?.phasePulse ?? 0}-${visualFeedback?.actionsPulse ?? 0}`} className={(visualFeedback?.phasePulse || visualFeedback?.actionsPulse) ? 'phase-pulse' : undefined} style={{
        background: phaseColor + '20',
        borderRadius: 10,
        padding: '10px 24px',
        border: `1px solid ${phaseColor}`,
        textAlign: 'center',
        transition: 'background 0.4s ease, border-color 0.4s ease',
        ...(showGlow && {
          boxShadow: '0 0 20px rgba(212, 168, 80, 0.4), inset 0 0 20px rgba(212, 168, 80, 0.1)',
          borderRadius: 12,
        })
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Turn {state.turn} &middot; {formatTurnOwner(actorLabels[state.currentPlayer])}
        </div>
        <div style={{ fontWeight: 700, fontSize: 17, color: phaseColor, transition: 'color 0.4s ease' }}>
          {phaseLabel}
        </div>
        {state.endgame && (
          <div style={{ fontSize: 12, color: '#c04030', fontWeight: 700, marginTop: 2 }}>
            {state.endgame.isFinalTurn ? 'FINAL TURN!' : 'Endgame triggered!'}
          </div>
        )}
        {/* Action tokens */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Actions:</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: CONSTANTS.MAX_ACTIONS }, (_, i) => i < state.actionsLeft).map((active, i) => (
              <div key={i} style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: active ? 'radial-gradient(circle, var(--gold) 30%, var(--gold-dim) 100%)' : 'rgba(90,64,48,0.5)',
                border: '1px solid var(--border-light)',
                transition: 'background 0.3s ease, transform 0.3s ease, opacity 0.3s ease',
                transform: active ? 'scale(1)' : 'scale(0.8)',
                opacity: active ? 1 : 0.5,
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Discard */}
      <div ref={discardPileRef} key={`discard-${visualFeedback?.discardPulse ?? 0}`} className={discardPulseClass} style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        ...(showGlow && {
          boxShadow: '0 0 20px rgba(212, 168, 80, 0.4), inset 0 0 20px rgba(212, 168, 80, 0.1)',
          borderRadius: 12,
          padding: '8px',
          background: 'rgba(90,64,48,0.1)',
        })
      }}>
        <div key={`discard-card-${displayDiscardCard ?? 'empty'}-${state.discardPile.length}`} className="discard-soft-fade">
          {displayDiscardCard ? (
            <CardFace cardId={displayDiscardCard} small />
          ) : (
            <div style={{
              width: 96,
              height: 128,
              borderRadius: 10,
              border: '2px dashed var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}>
              Empty
            </div>
          )}
        </div>
        <div className="panel-section-title" style={{ marginBottom: 0 }}>
          Discard ({state.discardPile.length})
        </div>
      </div>
    </div>
  );
}
