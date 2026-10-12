import type { GameState, GameAction } from '../engine/types.ts';
import { CONSTANTS } from '../engine/types.ts';
import { CardFace } from './CardFace.tsx';
import type { VisualFeedbackState } from './useVisualFeedback.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { FEEDBACK_TIMINGS } from './animationTimings.ts';
import { describeTrailTag, formatLogRecap, formatTurnOwner } from './uiHints.ts';
import { finalTurnStatus } from './endgameHints.ts';
import { deckThicknessShadow, discardGhostPoses, useJustSpent } from './life.tsx';

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
  /** Phone layout: smaller piles and phase box (~100px tall instead of ~180px) */
  compact?: boolean;
  /** Desktop: the End Turn control, pinned to the right end of the row. */
  endTurnSlot?: ReactNode;
  /** A card still being announced by the spotlight: the pile shows what was
   *  under it until the spotlight lands, so the hand-off reads. */
  heldDiscardCard?: string | null;
  /** Desktop: the ware supply, pinned to the left end of the row. */
  supplySlot?: ReactNode;
  /** Seat whose face-up plays get the big spotlight — skip the duplicate recap pill. */
  spotlitPlayer?: 0 | 1 | null;
}

export function CenterRow({ state, isLocalMode = true, showGlow = false, visualFeedback, actorLabels = ['Player 1', 'Player 2'], hiddenPlayer = null, compact = false, endTurnSlot, supplySlot, spotlitPlayer = null, heldDiscardCard = null }: CenterRowProps) {
  const pileScale = compact ? 0.62 : 1;
  const pileW = Math.round(96 * pileScale);
  const pileH = Math.round(128 * pileScale);
  const phaseLabel = state.phase === 'DRAW'
    ? `Draw Phase (${state.drawsThisPhase}/5)`
    : state.phase === 'PLAY'
    ? `Play Phase`
    : 'Game Over';

  const phaseColor = state.phase === 'DRAW' ? '#5a9ab0' : state.phase === 'PLAY' ? '#7a9a4a' : '#c04030';

  const spentPips = useJustSpent(state.actionsLeft);

  const topDiscard = state.discardPile.length > 0
    ? state.discardPile[0]
    : null;
  const [trailDiscardCard, setDisplayDiscardCard] = useState(topDiscard);
  const displayDiscardCard = heldDiscardCard && trailDiscardCard === heldDiscardCard
    ? (state.discardPile.find((c) => c !== heldDiscardCard) ?? null)
    : trailDiscardCard;
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

    // Phones show only the recap pill — two labels stacked over the slim
    // center row read as noise (2026-10-11 review).
    if (compact) return;
    setActionTag(describeTrailTag(trail.kind, actorLabels[trail.actor], state.log.slice(-6)));

    const timer = window.setTimeout(() => setActionTag(null), FEEDBACK_TIMINGS.actionTagDurationMs);
    return () => window.clearTimeout(timer);
  }, [visualFeedback?.trail]);

  useEffect(() => {
    if (state.log.length === 0) return;
    const latest = state.log[state.log.length - 1];
    if (latest.card && latest.player === spotlitPlayer) {
      setLastActionRecap(null);
      return;
    }
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
    <div ref={rowRef} className={compact ? 'center-row-compact' : undefined} style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: compact ? 14 : 32,
      padding: compact ? '2px 0' : '12px 0',
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
      <div ref={deckPileRef} key={`deck-${visualFeedback?.deckPulse ?? 0}`} className={deckPulseClass} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compact ? 3 : 6 }}>
        {state.deck.length > 0 ? (
          <div className="deck-stack" style={{ '--deck-thickness': deckThicknessShadow(state.deck.length) } as CSSProperties}>
            <CardFace cardId={state.deck[0]} faceDown small scale={pileScale} />
          </div>
        ) : (
          <div style={{
            width: pileW,
            height: pileH,
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

      {/* Phase indicator: a brass turn plaque */}
      <div
        key={`phase-${visualFeedback?.phasePulse ?? 0}-${visualFeedback?.actionsPulse ?? 0}`}
        className={`turn-plaque${compact ? ' turn-plaque-compact' : ''}${actorLabels[state.currentPlayer] === 'You' ? ' turn-plaque-mine' : ''}${showGlow ? ' turn-plaque-glow' : ''}${(visualFeedback?.phasePulse || visualFeedback?.actionsPulse) ? ' phase-pulse' : ''}`}
        style={{ '--phase-color': phaseColor } as CSSProperties}
      >
        <span className="turn-plaque-stud turn-plaque-stud-l" aria-hidden="true" />
        <span className="turn-plaque-stud turn-plaque-stud-r" aria-hidden="true" />
        <div className="turn-plaque-eyebrow">
          <span className="turn-plaque-rule" aria-hidden="true" />
          Turn {state.turn} &middot; {formatTurnOwner(actorLabels[state.currentPlayer])}
          <span className="turn-plaque-rule" aria-hidden="true" />
        </div>
        <div className="turn-plaque-phase">{phaseLabel}</div>
        <span className="turn-plaque-gem" aria-hidden="true" />
        {state.endgame && (
          <div className="turn-plaque-endgame">
            {finalTurnStatus(state, actorLabels) ?? (state.endgame.isFinalTurn ? 'FINAL TURN!' : 'Endgame triggered!')}
          </div>
        )}
        {/* Action tokens: minted coins in carved sockets */}
        <div className="turn-plaque-actions" role="meter" aria-valuemin={0} aria-valuemax={CONSTANTS.MAX_ACTIONS} aria-valuenow={state.actionsLeft} aria-label={`${state.actionsLeft} of ${CONSTANTS.MAX_ACTIONS} actions left`}>
          <div className="turn-plaque-coins">
            {Array.from({ length: CONSTANTS.MAX_ACTIONS }, (_, i) => i < state.actionsLeft).map((active, i) => (
              <span key={`${i}-${spentPips.includes(i) ? state.actionsLeft : 'x'}`} className="turn-plaque-socket">
                <span className={`turn-plaque-coin${active ? '' : ' turn-plaque-coin-spent'}${spentPips.includes(i) ? ' pip-spent-now' : ''}`} />
              </span>
            ))}
          </div>
          <span className="turn-plaque-count">
            {state.actionsLeft} {state.actionsLeft === 1 ? 'action' : 'actions'} left
          </span>
        </div>
      </div>

      {/* Discard */}
      <div ref={discardPileRef} key={`discard-${visualFeedback?.discardPulse ?? 0}`} className={discardPulseClass} data-spotlight-target="discard" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: compact ? 3 : 6,
        ...(showGlow && {
          boxShadow: '0 0 20px rgba(212, 168, 80, 0.4), inset 0 0 20px rgba(212, 168, 80, 0.1)',
          borderRadius: 12,
          padding: '8px',
          background: 'rgba(90,64,48,0.1)',
        })
      }}>
        <div className="discard-pile">
        {displayDiscardCard && discardGhostPoses(state.discardPile.length).map((pose, i) => (
          <span key={i} className="discard-ghost" style={{ transform: `translate(${pose.x}px, ${pose.y}px) rotate(${pose.rotate}deg)` }} />
        ))}
        <div key={`discard-card-${displayDiscardCard ?? 'empty'}-${state.discardPile.length}`} className="discard-soft-fade" style={{ position: 'relative' }}>
          {displayDiscardCard ? (
            <CardFace cardId={displayDiscardCard} small scale={pileScale} />
          ) : (
            <div style={{
              width: pileW,
              height: pileH,
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
        </div>
        <div className="panel-section-title" style={{ marginBottom: 0 }}>
          Discard ({state.discardPile.length})
        </div>
      </div>

      {supplySlot && (
        <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}>
          {supplySlot}
        </div>
      )}

      {endTurnSlot && (
        <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}>
          {endTurnSlot}
        </div>
      )}
    </div>
  );
}
