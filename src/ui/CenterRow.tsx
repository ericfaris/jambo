import type { GameState, GameAction } from '../engine/types.ts';
import { CONSTANTS } from '../engine/types.ts';
import { CardFace } from './CardFace.tsx';
import type { VisualFeedbackState } from './useVisualFeedback.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { FEEDBACK_TIMINGS } from './animationTimings.ts';
import { measureTrailPath, spotlightCoversDiscard } from './trailPath.ts';
import type { TrailPath } from './trailPath.ts';
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
  // room between a pile and its title: clears the deck's stacked-edge shadow (up to ~8px)
  const pileTitleGap = compact ? 6 : 16;
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
  // Both ends of the current trail, measured from the board before it paints
  const [trailPath, setTrailPath] = useState<TrailPath | null>(null);

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

  // Measured in a layout effect so the first painted frame already starts on
  // the deck / the actor's hand — never at a placeholder spot
  useLayoutEffect(() => {
    const trail = visualFeedback?.trail;
    const rowEl = rowRef.current;
    if (!trail || !rowEl) { setTrailPath(null); return; }
    const update = () => setTrailPath(measureTrailPath(trail, rowEl.getBoundingClientRect()));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [visualFeedback?.trail]);

  const latestLog = state.log.length > 0 ? state.log[state.log.length - 1] : null;
  const showTrail = !!visualFeedback?.trail && !!trailPath
    && !(visualFeedback.trail.kind === 'discard' && spotlightCoversDiscard(latestLog, spotlitPlayer));

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
      padding: compact ? '2px 0' : '12px 0 18px',
      position: 'relative',
    }}>
      {showTrail && visualFeedback?.trail && trailPath && (
        <div
          key={visualFeedback.trail.id}
          className={`center-row-trail center-row-trail-${visualFeedback.trail.kind}${trailIntensityClass ? ` ${trailIntensityClass}` : ''}`}
          style={{
            '--trail-start-x': `${trailPath.startX}px`,
            '--trail-start-y': `${trailPath.startY}px`,
            '--trail-end-x': `${trailPath.endX}px`,
            '--trail-end-y': `${trailPath.endY}px`,
          } as CSSProperties}
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
      <div data-deck-anchor key={`deck-${visualFeedback?.deckPulse ?? 0}`} className={deckPulseClass} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: pileTitleGap }}>
        {state.deck.length > 0 ? (
          <div className="deck-stack" style={{ '--deck-thickness': deckThicknessShadow(state.deck.length) } as CSSProperties}>
            <CardFace cardId={state.deck[0]} faceDown small scale={pileScale} />
          </div>
        ) : (
          <div className="empty-card-slot" style={{ width: pileW, height: pileH }} />
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
      <div key={`discard-${visualFeedback?.discardPulse ?? 0}`} className={discardPulseClass} data-spotlight-target="discard" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: pileTitleGap,
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
            <div className="empty-card-slot" style={{ width: pileW, height: pileH }} />
          )}
        </div>
        </div>
        <div className="panel-section-title" style={{ marginBottom: 0 }}>
          Discard ({state.discardPile.length})
        </div>
      </div>

      {supplySlot && (
        <div className="center-side-slot" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}>
          {supplySlot}
        </div>
      )}

      {endTurnSlot && (
        <div className="center-side-slot" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}>
          {endTurnSlot}
        </div>
      )}
    </div>
  );
}
