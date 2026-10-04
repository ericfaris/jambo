// ============================================================================
// Cast Mode — Player Screen
// Private player view: hand, interaction panels, action buttons.
// All actions sent via WebSocket.
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import type { WebSocketGameState } from '../multiplayer/client.ts';
import type { PublicGameState, PrivateGameState } from '../multiplayer/types.ts';
import type { GameAction, DeckCardId, WareType, GameState } from '../engine/types.ts';
import { getCard, isValidDeckCardId, ALL_DECK_CARD_IDS } from '../engine/cards/CardDatabase.ts';
import { validatePlayCard, validateActivateUtility } from '../engine/validation/actionValidator.ts';
import { UtilityArea } from './UtilityArea.tsx';
import { HandDisplay } from './HandDisplay.tsx';
import { InteractionPanel } from './InteractionPanel.tsx';
import { ResolveMegaView } from './ResolveMegaView.tsx';
import { MegaView } from './MegaView.tsx';
import { CardPlayDialog, DrawModal as SharedDrawModal } from './ActionButtons.tsx';
import { useAudioEvents } from './useAudioEvents.ts';
import { useVisualFeedback } from './useVisualFeedback.ts';
import { getVolume, setVolume as saveVolume, getMuted, setMuted as saveMuted, resetAudioSettings } from './audioSettings.ts';
import { getPlayDisabledReason, getDrawDisabledReason } from './uiHints.ts';
import { CastEndgameOverlay } from './CastEndgameOverlay.tsx';
import { useCastRoomSync } from '../cast/useCastRoomSync.ts';
import { getCastSessionController, isCastSdkEnabled } from '../cast/factory.ts';
import { useAuthSession } from './useAuthSession.ts';

type AnimationSpeed = 'normal' | 'fast';
const ANIMATION_SPEED_STORAGE_KEY = 'jambo.animationSpeed';
const DEV_TELEMETRY_STORAGE_KEY = 'jambo.devTelemetry';
const HIGH_CONTRAST_STORAGE_KEY = 'jambo.highContrast';

function getInitialAnimationSpeed(): AnimationSpeed {
  if (typeof window === 'undefined') return 'normal';
  const saved = window.localStorage.getItem(ANIMATION_SPEED_STORAGE_KEY);
  return saved === 'fast' ? 'fast' : 'normal';
}

function getInitialDevTelemetry(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(DEV_TELEMETRY_STORAGE_KEY) === 'true';
}

function getInitialHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY) === 'true';
}

function isDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

interface PlayerScreenProps {
  ws: WebSocketGameState;
}

export function PlayerScreen({ ws }: PlayerScreenProps) {
  const pub = ws.publicState;
  const priv = ws.privateState;
  const slot = ws.playerSlot;
  const castEnabled = isCastSdkEnabled();
  const castSync = useCastRoomSync({
    roomCode: ws.roomCode,
    roomMode: ws.roomMode,
    senderPlayerSlot: slot,
    castAccessToken: ws.castAccessToken,
  });
  const [wareDialog, setWareDialog] = useState<DeckCardId | null>(null);
  const [drawModalOpen, setDrawModalOpen] = useState(false);
  const [cardError, setCardError] = useState<{cardId: DeckCardId, message: string} | null>(null);
  const [megaCardId, setMegaCardId] = useState<DeckCardId | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState<AnimationSpeed>(() => getInitialAnimationSpeed());
  const [showDevTelemetry, setShowDevTelemetry] = useState(() => getInitialDevTelemetry());
  const [highContrast, setHighContrast] = useState(() => getInitialHighContrast());
  const [volume, setVolume] = useState(() => getVolume());
  const [muted, setMuted] = useState(() => getMuted());
  const { authUser, authError, avatarUrl, avatarLabel, logout: authLogout } = useAuthSession();
  const [telemetryEvents, setTelemetryEvents] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  useAudioEvents(ws.audioEvent, ws.clearAudioEvent);

  const isCardActionValidationError = (message: string) => (
    message.startsWith('Invalid action PLAY_CARD:') ||
    message.startsWith('Invalid action ACTIVATE_UTILITY:')
  );

  // Auto-open draw modal when entering draw phase
  useEffect(() => {
    if (pub && pub.phase === 'DRAW' && pub.currentPlayer === slot && !drawModalOpen) {
      setDrawModalOpen(true);
    } else if (pub && pub.phase !== 'DRAW' && drawModalOpen) {
      setDrawModalOpen(false);
    }
  }, [pub?.phase, pub?.currentPlayer, slot, drawModalOpen]);

  useEffect(() => {
    if (!cardError) return;
    const timer = setTimeout(() => setCardError(null), 5000);
    return () => clearTimeout(timer);
  }, [cardError]);

  useEffect(() => {
    if (ws.error && isCardActionValidationError(ws.error)) {
      ws.clearError();
    }
  }, [ws.error, ws.clearError]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-anim-speed', animationSpeed);
    window.localStorage.setItem(ANIMATION_SPEED_STORAGE_KEY, animationSpeed);
  }, [animationSpeed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DEV_TELEMETRY_STORAGE_KEY, String(showDevTelemetry));
  }, [showDevTelemetry]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (highContrast) {
      document.documentElement.setAttribute('data-contrast', 'high');
    } else {
      document.documentElement.removeAttribute('data-contrast');
    }
    window.localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, String(highContrast));
  }, [highContrast]);

  const handleLogout = useCallback(async () => {
    await authLogout();
    setMenuOpen(false);
  }, [authLogout]);

  if (!pub || !priv || slot === null) return null;

  const dispatch = (action: GameAction) => ws.sendAction(action);
  const handleCastRematch = useCallback(() => {
    ws.requestRematch();
  }, [ws]);
  const handleCastMainMenu = useCallback(() => {
    window.location.href = `${window.location.origin}${window.location.pathname}`;
  }, []);
  const hasRequestedRematch = slot !== null && ws.rematchVotes.includes(slot);
  const remainingRematchSlots = ws.rematchRequired.filter((requiredSlot) => !ws.rematchVotes.includes(requiredSlot));
  const rematchStatusMessage = hasRequestedRematch && remainingRematchSlots.length > 0
    ? `Waiting for ${remainingRematchSlots.map((requiredSlot) => `Player ${requiredSlot + 1}`).join(' & ')} to confirm rematch...`
    : undefined;
  const isMyTurn = isWaitingForMe(pub, priv, slot);
  const myPublic = pub.players[slot];
  const lastLog = pub.log.length > 0 ? pub.log[pub.log.length - 1] : null;

  const visualFeedback = useVisualFeedback({
    phase: pub.phase,
    actionsLeft: pub.actionsLeft,
    deckCount: pub.deckCount,
    discardCount: pub.discardPile.length,
    topDiscardCard: pub.discardPile.length > 0 ? pub.discardPile[0] : null,
    players: [
      {
        gold: pub.players[0].gold,
        handCount: pub.players[0].handCount,
        market: pub.players[0].market,
      },
      {
        gold: pub.players[1].gold,
        handCount: pub.players[1].handCount,
        market: pub.players[1].market,
      },
    ],
    lastLog: lastLog ? { player: lastLog.player, action: lastLog.action } : null,
  });

  useEffect(() => {
    if (!showDevTelemetry) return;

    const newEvents: string[] = [];
    if (visualFeedback.trail) {
      newEvents.push(`[trail] ${visualFeedback.trail.actor === slot ? 'you' : 'opponent'} ${visualFeedback.trail.kind}`);
    }
    if (visualFeedback.goldDeltas[0] !== 0 || visualFeedback.goldDeltas[1] !== 0) {
      const myDelta = visualFeedback.goldDeltas[slot];
      const oppDelta = visualFeedback.goldDeltas[slot === 0 ? 1 : 0];
      newEvents.push(`[gold] you ${myDelta}, opp ${oppDelta}`);
    }
    if (visualFeedback.marketFlashSlots[0].length > 0 || visualFeedback.marketFlashSlots[1].length > 0) {
      const mySlots = visualFeedback.marketFlashSlots[slot];
      const oppSlots = visualFeedback.marketFlashSlots[slot === 0 ? 1 : 0];
      newEvents.push(`[market] you ${mySlots.join(',') || '-'} | opp ${oppSlots.join(',') || '-'}`);
    }

    if (newEvents.length === 0) return;
    newEvents.forEach((entry) => console.debug(`[JamboPlayer] ${entry}`));
    setTelemetryEvents((previous) => [...newEvents, ...previous].slice(0, 8));
  }, [showDevTelemetry, visualFeedback.trail, visualFeedback.goldDeltas, visualFeedback.marketFlashSlots, slot]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const resetUiPrefs = useCallback(() => {
    setAnimationSpeed('normal');
    setShowDevTelemetry(false);
    setHighContrast(false);
    setVolume(50);
    setMuted(false);
    setTelemetryEvents([]);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ANIMATION_SPEED_STORAGE_KEY);
      window.localStorage.removeItem(DEV_TELEMETRY_STORAGE_KEY);
      window.localStorage.removeItem(HIGH_CONTRAST_STORAGE_KEY);
      resetAudioSettings();
      window.dispatchEvent(new Event('jambo-volume-change'));
    }
  }, []);

  const hasPendingInteraction = !!(
    priv.pendingResolution ||
    pub.pendingResolutionType ||
    (pub.pendingGuardReaction && pub.pendingGuardReaction.targetPlayer === slot) ||
    (pub.pendingWareCardReaction && pub.pendingWareCardReaction.targetPlayer === slot)
  );

  const inPlayPhase = pub.phase === 'PLAY' && pub.currentPlayer === slot;
  const actionsDisabled = !isMyTurn || (hasPendingInteraction && pub.phase !== 'DRAW');
  const opponentAction = getLatestOpponentAction(pub, slot);
  const showOpponentActionPanel = !hasPendingInteraction && !isMyTurn && opponentAction !== null && pub.phase !== 'GAME_OVER';

  const playDisabledReason = getPlayDisabledReason({
    phase: pub.phase,
    currentPlayer: pub.currentPlayer,
    viewerPlayer: slot,
    actionsLeft: pub.actionsLeft,
    hasPendingInteraction,
    isAiTurn: !isMyTurn,
  });
  const drawDisabledReason = getDrawDisabledReason({
    phase: pub.phase,
    currentPlayer: pub.currentPlayer,
    viewerPlayer: slot,
    isAiTurn: !isMyTurn,
  });

  const validationState: GameState = {
    version: 'cast-mode-validation',
    rngSeed: 0,
    rngState: 0,
    turn: pub.turn,
    currentPlayer: pub.currentPlayer,
    phase: pub.phase,
    actionsLeft: pub.actionsLeft,
    drawsThisPhase: pub.drawsThisPhase,
    drawnCard: slot === pub.currentPlayer ? priv.drawnCard : null,
    keptCardThisDrawPhase: false,
    deck: [],
    discardPile: pub.discardPile,
    reshuffleCount: 0,
    wareSupply: pub.wareSupply,
    players: [
      {
        gold: pub.players[0].gold,
        hand: slot === 0 ? priv.hand : [],
        market: pub.players[0].market,
        utilities: pub.players[0].utilities,
        smallMarketStands: pub.players[0].smallMarketStands,
      },
      {
        gold: pub.players[1].gold,
        hand: slot === 1 ? priv.hand : [],
        market: pub.players[1].market,
        utilities: pub.players[1].utilities,
        smallMarketStands: pub.players[1].smallMarketStands,
      },
    ],
    pendingResolution: priv.pendingResolution,
    turnModifiers: pub.turnModifiers,
    endgame: pub.endgame,
    pendingGuardReaction: pub.pendingGuardReaction,
    crocodileCleanup: null,
    pendingWareCardReaction: pub.pendingWareCardReaction,
    log: pub.log,
  };

  const getFriendlyErrorMessage = (reason: string) => {
    if (reason.includes('PLAY phase')) {
      return 'You can only play cards during your turn.';
    }
    if (reason.includes('No actions remaining')) {
      return "You've used all your actions this turn.";
    }
    if (reason.includes('not in hand')) {
      return 'This card is not in your hand.';
    }
    if (reason.includes('wareMode')) {
      return 'Please choose buy or sell for this ware card.';
    }
    if (reason.includes('gold') || reason.includes('cost')) {
      return 'You do not have enough gold for this action.';
    }
    if (reason.includes('market') || reason.includes('space')) {
      return 'You do not have space in your market for this ware.';
    }
    if (reason.includes('wares') || reason.includes('supply')) {
      return 'There are no wares available to buy or sell.';
    }
    return 'This card cannot be played right now.';
  };

  const handlePlayCard = useCallback((cardId: DeckCardId) => {
    if (!inPlayPhase || actionsDisabled) return;
    const cardDef = getCard(cardId);
    if (cardDef.type === 'ware') {
      setWareDialog(cardId);
    } else {
      const validation = validatePlayCard(validationState, cardId);
      if (!validation.valid) {
        const friendlyMessage = getFriendlyErrorMessage(validation.reason || 'Invalid play');
        setCardError({ cardId, message: friendlyMessage });
        return;
      }
      setCardError(null);
      dispatch({ type: 'PLAY_CARD', cardId });
    }
  }, [inPlayPhase, actionsDisabled, dispatch, validationState]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      padding: '12px 0',
      minHeight: '100vh',
      maxWidth: 600,
      margin: '0 auto',
    }}>
      {/* Error */}
      {ws.error && !isCardActionValidationError(ws.error) && (
        <div style={{
          background: '#4a1a12',
          border: '1px solid #8a3a2a',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 13,
          color: '#ff9977',
        }}
          onClick={ws.clearError}
        >
          {ws.error}
        </div>
      )}
      {/* Interaction panel */}
      {hasPendingInteraction && (
        <ResolveMegaView verticalAlign="center">
          <CastInteractionPanel pub={pub} priv={priv} slot={slot} dispatch={dispatch} onMegaView={setMegaCardId} />
        </ResolveMegaView>
      )}
      {showOpponentActionPanel && opponentAction && (
        <ResolveMegaView verticalAlign="center">
          <OpponentActionPanel {...opponentAction} />
        </ResolveMegaView>
      )}

      <div style={{
        borderRadius: 12,
        padding: 6,
        backgroundImage: 'linear-gradient(rgba(20,10,5,0.54), rgba(20,10,5,0.54)), url(/assets/panels/wood_1.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}>
        {/* Own utilities */}
        <div style={{
          position: 'relative',
          width: '100%',
          background: 'rgba(20,10,5,0.24)',
          borderRadius: 10,
          padding: '12px',
        }}>
          <div style={{ minWidth: 0, width: '100%' }}>
            <UtilityArea
              utilities={myPublic.utilities}
              onActivate={(i) => {
                const validation = validateActivateUtility(validationState, i);
                if (!validation.valid) {
                  const friendlyMessage = getFriendlyErrorMessage(validation.reason || 'Cannot activate utility');
                  setCardError({ cardId: myPublic.utilities[i].cardId, message: friendlyMessage });
                  return;
                }
                setCardError(null);
                dispatch({ type: 'ACTIVATE_UTILITY', utilityIndex: i });
              }}
              disabled={actionsDisabled || !inPlayPhase || pub.actionsLeft <= 0}
              cardError={cardError}
              label="Your Utilities"
              cardSize="default"
              cardScale={1.25}
              showHelperText={false}
              overlapPx={57}
              overlapOnDesktop
              singleRow
              hideScrollbar
            />
          </div>

          {inPlayPhase && (
            <button
              disabled={actionsDisabled}
              onClick={() => dispatch({ type: 'END_TURN' })}
              style={{
                background: 'linear-gradient(135deg, #c04030 0%, #a03020 50%, #c04030 100%)',
                border: '2px solid #ff6b5a',
                borderRadius: 8,
                padding: '10px 16px',
                color: 'white',
                fontWeight: 700,
                fontSize: 14,
                cursor: actionsDisabled ? 'default' : 'pointer',
                boxShadow: '0 0 20px rgba(192, 64, 48, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                animation: 'shimmer 2s ease-in-out infinite alternate',
                transition: 'all var(--motion-fast) var(--anim-ease-standard)',
                opacity: actionsDisabled ? 0.6 : 1,
                flexShrink: 0,
                position: 'absolute',
                top: 10,
                right: 10,
                zIndex: 6,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div>End Turn</div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: i < pub.actionsLeft ? 'var(--gold)' : 'rgba(90,64,48,0.5)',
                        border: '2px solid var(--gold)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </button>
          )}
        </div>

        {/* Play disabled hint */}
        {actionsDisabled && pub.phase === 'PLAY' && playDisabledReason && (
          <div className="disabled-hint">
            {playDisabledReason}
          </div>
        )}

        {/* Hand */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 0, padding: '6px 8px 2px 14px' }}>
            <div className="panel-section-title" style={{ fontSize: 15, marginBottom: 0 }}>
              Your Hand ({priv.hand.length} cards)
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-heading)', color: 'var(--gold)', fontWeight: 700, fontSize: 20, textShadow: '0 0 8px rgba(212,168,80,0.4)' }}>
                {myPublic.gold}g
              </span>
            </div>
          </div>
          <HandDisplay
            hand={priv.hand}
            onPlayCard={handlePlayCard}
            disabled={actionsDisabled || !inPlayPhase || pub.actionsLeft <= 0}
            cardError={cardError}
            useWoodBackground={false}
            showBorder={false}
            showHelperText={false}
            cardScale={1.25}
            paddingTop={6}
            paddingBottom={6}
            paddingX={8}
            paddingLeft={14}
            layoutMode="twoRowAlternate"
            fixedOverlapPx={75}
            onMegaView={setMegaCardId}
          />
        </div>
      </div>

      {/* Ware dialog */}
      {wareDialog && (
        <CardPlayDialog
          cardId={wareDialog}
          onBuy={() => {
            const validation = validatePlayCard(validationState, wareDialog, 'buy');
            if (!validation.valid) {
              const friendlyMessage = getFriendlyErrorMessage(validation.reason || 'Cannot buy wares');
              setCardError({ cardId: wareDialog, message: friendlyMessage });
              setWareDialog(null);
              return;
            }
            setCardError(null);
            dispatch({ type: 'PLAY_CARD', cardId: wareDialog, wareMode: 'buy' });
            setWareDialog(null);
          }}
          onSell={() => {
            const validation = validatePlayCard(validationState, wareDialog, 'sell');
            if (!validation.valid) {
              const friendlyMessage = getFriendlyErrorMessage(validation.reason || 'Cannot sell wares');
              setCardError({ cardId: wareDialog, message: friendlyMessage });
              setWareDialog(null);
              return;
            }
            setCardError(null);
            dispatch({ type: 'PLAY_CARD', cardId: wareDialog, wareMode: 'sell' });
            setWareDialog(null);
          }}
          onCancel={() => setWareDialog(null)}
        />
      )}

      {/* Connection indicator */}
      <div style={{
        position: 'fixed',
        bottom: 8,
        right: 12,
        fontSize: 11,
        color: ws.connected ? '#6a6' : '#a66',
      }}>
        {ws.connected ? 'Connected' : 'Reconnecting...'}
      </div>
      {castEnabled && castSync.status !== 'disabled' && (
        <div style={{
          position: 'fixed',
          bottom: 8,
          left: 12,
          fontSize: 11,
          color: castSync.status === 'error' ? '#ff9977' : 'var(--text-muted)',
        }}>
          Cast receiver sync: {castSync.status}
          {castSync.error ? ` (${castSync.error})` : ''}
        </div>
      )}

      {/* Settings */}
      <div ref={menuRef} style={{ position: 'fixed', top: 12, right: 16, zIndex: 50 }}>
        <button
          onClick={() => setMenuOpen((previous) => !previous)}
          style={{
            width: 42,
            height: 42,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: menuOpen ? 'var(--surface-accent)' : 'var(--surface-light)',
            border: '1px solid var(--border-light)',
            borderRadius: '50%',
            overflow: 'hidden',
          }}
          title="Profile & Settings"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="User avatar"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--text)',
            }}>
              {avatarLabel}
            </span>
          )}
        </button>

        {menuOpen && (
          <div className="dialog-pop" style={{
            position: 'absolute',
            top: 42,
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border-light)',
            borderRadius: 10,
            padding: 12,
            minWidth: 220,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: 'var(--gold)', marginBottom: 12 }}>
              Player Settings
            </div>
            <div style={{
              padding: 10,
              border: '1px solid var(--border-light)',
              borderRadius: 8,
              background: 'var(--surface-light)',
              marginBottom: 10,
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                {authUser ? `Welcome, ${authUser.name}` : 'Welcome, Trader'}
              </div>
              {authUser && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {authUser.email}
                </div>
              )}
              {authError && (
                <div style={{ fontSize: 12, color: 'var(--accent-red)', marginTop: 4 }}>
                  {authError}
                </div>
              )}
              {authUser && (
                <button
                  onClick={() => void handleLogout()}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    background: 'var(--surface)',
                    border: '1px solid var(--border-light)',
                    color: 'var(--text)',
                    borderRadius: 6,
                    padding: '6px 8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  Logout
                </button>
              )}
            </div>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              fontSize: 15,
              color: 'var(--text)',
            }}>
              Animation Speed
              <select
                value={animationSpeed}
                onChange={(event) => setAnimationSpeed(event.target.value as AnimationSpeed)}
                style={{
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: 14,
                }}
              >
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
              </select>
            </label>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 10,
              cursor: 'pointer',
              fontSize: 15,
              color: 'var(--text)',
            }}>
              Mute Audio
              <input
                type="checkbox"
                checked={muted}
                onChange={() => {
                  const next = !muted;
                  setMuted(next);
                  saveMuted(next);
                  window.dispatchEvent(new Event('jambo-volume-change'));
                }}
                style={{ accentColor: 'var(--gold)', width: 16, height: 16, cursor: 'pointer' }}
              />
            </label>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 10,
              fontSize: 15,
              color: muted ? 'var(--text-muted)' : 'var(--text)',
            }}>
              Volume
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                disabled={muted}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  saveVolume(v);
                  window.dispatchEvent(new Event('jambo-volume-change'));
                }}
                style={{ width: 100, accentColor: 'var(--gold)', cursor: muted ? 'default' : 'pointer' }}
              />
            </label>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 10,
              cursor: 'pointer',
              fontSize: 15,
              color: 'var(--text)',
            }}>
              High Contrast Mode
              <input
                type="checkbox"
                checked={highContrast}
                onChange={() => setHighContrast((previous) => !previous)}
                style={{ accentColor: 'var(--gold)', width: 16, height: 16, cursor: 'pointer' }}
              />
            </label>
            {castSync.status === 'synced' && (
              <button
                onClick={() => {
                  void getCastSessionController().sendMessage({ type: 'TOGGLE_DEBUG' });
                }}
                style={{
                  marginTop: 10,
                  width: '100%',
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 15,
                }}
              >
                Toggle TV Debug Log
              </button>
            )}
            {isDevMode() && (
              <label style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                marginTop: 10,
                cursor: 'pointer',
                fontSize: 15,
                color: 'var(--text)',
              }}>
                Dev Telemetry Overlay
                <input
                  type="checkbox"
                  checked={showDevTelemetry}
                  onChange={() => setShowDevTelemetry((previous) => !previous)}
                  style={{ accentColor: 'var(--gold)', width: 16, height: 16, cursor: 'pointer' }}
                />
              </label>
            )}
            <button
              onClick={resetUiPrefs}
              style={{
                marginTop: 12,
                width: '100%',
                background: 'var(--surface-light)',
                border: '1px solid var(--border-light)',
                color: 'var(--text)',
                borderRadius: 8,
                padding: '8px 10px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Reset UI Preferences
            </button>
          </div>
        )}
      </div>

      {/* Draw modal */}
      {drawModalOpen && (
        <DrawModal
          pub={pub}
          priv={priv}
          dispatch={dispatch}
          disabled={actionsDisabled}
          disabledReason={drawDisabledReason}
          onClose={() => setDrawModalOpen(false)}
          slot={slot}
        />
      )}

      {/* Mega view */}
      {megaCardId && (
        <MegaView cardId={megaCardId} onClose={() => setMegaCardId(null)} />
      )}

      {isDevMode() && showDevTelemetry && telemetryEvents.length > 0 && (
        <div style={{
          position: 'fixed',
          left: 12,
          bottom: 12,
          width: 300,
          maxHeight: 220,
          overflowY: 'auto',
          background: 'rgba(20,10,5,0.88)',
          border: '1px solid var(--border-light)',
          borderRadius: 8,
          padding: 8,
          zIndex: 1500,
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          <div style={{ color: 'var(--gold)', fontWeight: 700, marginBottom: 6 }}>Player Telemetry</div>
          {telemetryEvents.map((entry, index) => (
            <div key={`${entry}-${index}`} style={{ marginBottom: 3 }}>
              {entry}
            </div>
          ))}
        </div>
      )}

      {pub.phase === 'GAME_OVER' && (
        <CastEndgameOverlay
          pub={pub}
          viewerSlot={slot}
          onRematch={handleCastRematch}
          onMainMenu={handleCastMainMenu}
          rematchDisabled={hasRequestedRematch}
          rematchLabel={hasRequestedRematch ? 'Rematch Requested' : 'Rematch'}
          rematchStatusMessage={rematchStatusMessage}
        />
      )}

    </div>
  );
}

// --- Sub-components ---

function DrawModal({ pub, priv, dispatch, disabled, disabledReason, onClose, slot }: {
  pub: PublicGameState;
  priv: PrivateGameState;
  dispatch: (action: GameAction) => void;
  disabled: boolean;
  disabledReason?: string | null;
  onClose: () => void;
  slot: 0 | 1;
}) {
  // Build a synthetic GameState matching what SharedDrawModal reads:
  // drawnCard, phase, currentPlayer, players[slot].utilities, players[slot].hand,
  // actionsLeft, keptCardThisDrawPhase, discardPile, wareSupply
  const syntheticState = {
    drawnCard: priv.drawnCard,
    phase: pub.phase,
    currentPlayer: pub.currentPlayer,
    actionsLeft: pub.actionsLeft,
    keptCardThisDrawPhase: false,
    discardPile: pub.discardPile,
    wareSupply: pub.wareSupply,
    players: [
      { ...pub.players[0], hand: slot === 0 ? priv.hand : [] as DeckCardId[] },
      { ...pub.players[1], hand: slot === 1 ? priv.hand : [] as DeckCardId[] },
    ],
  } as unknown as GameState;

  return (
    <SharedDrawModal
      state={syntheticState}
      dispatch={dispatch}
      disabled={disabled}
      disabledReason={disabledReason}
      onClose={onClose}
      viewerPlayer={slot}
    />
  );
}

/**
 * Wraps InteractionPanel for cast mode by constructing a synthetic GameState
 * from the public + private data. InteractionPanel expects a full GameState.
 */
function CastInteractionPanel({ pub, priv, slot, dispatch, onMegaView }: {
  pub: PublicGameState;
  priv: PrivateGameState;
  slot: 0 | 1;
  dispatch: (action: GameAction) => void;
  onMegaView?: (cardId: DeckCardId) => void;
}) {
  // Build a minimal synthetic GameState that InteractionPanel can work with.
  // It only reads: pendingResolution, pendingGuardReaction, pendingWareCardReaction,
  // currentPlayer, players[cp].hand, players[cp].market, players[opp].market,
  // players[opp].utilities, wareSupply, discardPile
  const syntheticState = {
    currentPlayer: pub.currentPlayer,
    phase: pub.phase,
    pendingResolution: priv.pendingResolution,
    pendingGuardReaction: pub.pendingGuardReaction?.targetPlayer === slot ? pub.pendingGuardReaction : null,
    pendingWareCardReaction: pub.pendingWareCardReaction?.targetPlayer === slot ? pub.pendingWareCardReaction : null,
    wareSupply: pub.wareSupply,
    discardPile: pub.discardPile,
    players: [
      { ...pub.players[0], hand: slot === 0 ? priv.hand : [] as DeckCardId[] },
      { ...pub.players[1], hand: slot === 1 ? priv.hand : [] as DeckCardId[] },
    ] as [
      { gold: number; market: (WareType | null)[]; utilities: typeof pub.players[0]['utilities']; hand: DeckCardId[]; smallMarketStands: number },
      { gold: number; market: (WareType | null)[]; utilities: typeof pub.players[1]['utilities']; hand: DeckCardId[]; smallMarketStands: number },
    ],
    log: pub.log,
    turnModifiers: pub.turnModifiers,
    endgame: pub.endgame,
  };

  // InteractionPanel expects GameState — cast as any since we're providing a subset
  if (!syntheticState.pendingResolution && pub.pendingResolutionType) {
    const resolvingMessage = getResolutionStatusMessage(pub.pendingResolutionType);
    return (
      <div className="panel-slide" style={{ maxWidth: 460, margin: '0 auto', width: '100%' }}>
        <div className="dialog-pop" style={{ borderRadius: 14, padding: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{resolvingMessage}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <InteractionPanel
      state={syntheticState as import('../engine/types.ts').GameState}
      dispatch={dispatch}
      viewerPlayer={slot}
      onMegaView={onMegaView}
    />
  );
}

interface OpponentActionInfo {
  cardId: DeckCardId | null;
  message: string;
  wareStolen?: WareType | null;
  wareGivenBack?: WareType | null;
  wareSelected?: WareType | null;
  affectedUtilityCardId?: DeckCardId | null;
  cardTakenId?: DeckCardId | null;
  cardGivenId?: DeckCardId | null;
  extraCardIds?: DeckCardId[];
  extraWareTypes?: WareType[];
}

function OpponentActionPanel({
  cardId,
  message,
  wareStolen,
  wareGivenBack,
  wareSelected,
  affectedUtilityCardId,
  cardTakenId,
  cardGivenId,
  extraCardIds,
  extraWareTypes,
}: OpponentActionInfo) {
  const card = cardId ? getCard(cardId) : null;
  const affectedUtility = affectedUtilityCardId ? getCard(affectedUtilityCardId) : null;
  const takenCard = cardTakenId ? getCard(cardTakenId) : null;
  const givenCard = cardGivenId ? getCard(cardGivenId) : null;
  return (
    <div className="panel-slide" style={{ maxWidth: 460, margin: '0 auto', width: '100%' }}>
      <div className="dialog-pop" style={{ borderRadius: 14, padding: 12 }}>
        <div style={{ textAlign: 'center', fontWeight: 700, marginBottom: 8 }}>
          Opponent Action
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          {card && (
            <img
              src={`/assets/cards/${card.designId}.png`}
              alt={card.name}
              draggable={false}
              style={{ width: 116, borderRadius: 8, display: 'block' }}
            />
          )}
          <div style={{ maxWidth: 260, textAlign: 'left' }}>
            {card && <div style={{ fontWeight: 700, marginBottom: 4 }}>{card.name}</div>}
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{message}</div>
            {(wareStolen || wareGivenBack || wareSelected || affectedUtility || takenCard || givenCard || (extraCardIds && extraCardIds.length > 0) || (extraWareTypes && extraWareTypes.length > 0)) && (
              <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {wareStolen && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Stole</span>
                    <img
                      src={`/assets/wares/${wareStolen}.png`}
                      alt={`${wareStolen} ware`}
                      draggable={false}
                      style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid var(--border-light)' }}
                    />
                  </div>
                )}
                {wareGivenBack && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gave</span>
                    <img
                      src={`/assets/wares/${wareGivenBack}.png`}
                      alt={`${wareGivenBack} ware`}
                      draggable={false}
                      style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid var(--border-light)' }}
                    />
                  </div>
                )}
                {wareSelected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Selected</span>
                    <img
                      src={`/assets/wares/${wareSelected}.png`}
                      alt={`${wareSelected} ware`}
                      draggable={false}
                      style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid var(--border-light)' }}
                    />
                  </div>
                )}
                {affectedUtility && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Your Utility</span>
                    <img
                      src={`/assets/cards/${affectedUtility.designId}.png`}
                      alt={affectedUtility.name}
                      draggable={false}
                      style={{ width: 46, borderRadius: 6, display: 'block' }}
                    />
                  </div>
                )}
                {takenCard && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Took</span>
                    <img
                      src={`/assets/cards/${takenCard.designId}.png`}
                      alt={takenCard.name}
                      draggable={false}
                      style={{ width: 46, borderRadius: 6, display: 'block' }}
                    />
                  </div>
                )}
                {givenCard && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gave</span>
                    <img
                      src={`/assets/cards/${givenCard.designId}.png`}
                      alt={givenCard.name}
                      draggable={false}
                      style={{ width: 46, borderRadius: 6, display: 'block' }}
                    />
                  </div>
                )}
                {extraCardIds?.map((id) => {
                  const c = getCard(id);
                  return (
                    <div key={`extra-card-${id}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Card</span>
                      <img
                        src={`/assets/cards/${c.designId}.png`}
                        alt={c.name}
                        draggable={false}
                        style={{ width: 46, borderRadius: 6, display: 'block' }}
                      />
                    </div>
                  );
                })}
                {extraWareTypes?.map((w, idx) => (
                  <div key={`extra-ware-${w}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ware</span>
                    <img
                      src={`/assets/wares/${w}.png`}
                      alt={`${w} ware`}
                      draggable={false}
                      style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid var(--border-light)' }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getResolutionStatusMessage(type: NonNullable<PublicGameState['pendingResolutionType']>): string {
  switch (type) {
    case 'AUCTION':
      return 'Resolving auction...';
    case 'DRAFT':
      return 'Resolving draft picks...';
    case 'OPPONENT_DISCARD':
      return 'Opponent is choosing cards to discard...';
    case 'OPPONENT_CHOICE':
    case 'BINARY_CHOICE':
      return 'Waiting for a decision...';
    case 'HAND_SWAP':
      return 'Resolving hand swap...';
    case 'WARE_TRADE':
    case 'WARE_SELECT_MULTIPLE':
    case 'WARE_SELL_BULK':
    case 'WARE_RETURN':
    case 'WARE_CASH_CONVERSION':
    case 'CARRIER_WARE_SELECT':
      return 'Resolving ware transaction...';
    case 'WARE_THEFT_SINGLE':
    case 'WARE_THEFT_SWAP':
      return 'Resolving ware theft...';

    case 'UTILITY_KEEP':
    case 'UTILITY_REPLACE':
    case 'UTILITY_EFFECT':
    case 'CROCODILE_USE':
      return 'Resolving utility effect...';
    case 'SUPPLIES_DISCARD':
      return 'Resolving Supplies card...';
    case 'DECK_PEEK':
      return 'Resolving card selection...';
    case 'DISCARD_PICK':
      return 'Resolving discard pile pick...';
    case 'DRAW_MODIFIER':
      return 'Resolving draw effect...';
    case 'TURN_MODIFIER':
      return 'Applying turn effect...';
    default:
      return 'Resolving card effect...';
  }
}

function getLatestOpponentAction(pub: PublicGameState, slot: 0 | 1): OpponentActionInfo | null {
  const opponent: 0 | 1 = slot === 0 ? 1 : 0;
  for (let i = pub.log.length - 1; i >= 0; i--) {
    const entry = pub.log[i];
    if (!entry || entry.player === slot) continue;
    if (entry.turn !== pub.turn) continue;
    if (!isOpponentActionForPanel(entry.action)) continue;
    const actionInfo = parseOpponentAction(entry.action, entry.details ?? '', pub, opponent);
    if (!actionInfo) continue;
    return actionInfo;
  }
  return null;
}

function isOpponentActionForPanel(action: string): boolean {
  return (
    action.startsWith('PLAY_') ||
    action === 'ACTIVATE_UTILITY' ||
    action === 'DRAW_CARD' ||
    action === 'KEEP_CARD' ||
    action === 'DISCARD_DRAWN' ||
    action === 'SKIP_DRAW' ||
    action === 'PARROT_STEAL' ||
    action === 'THRONE_SWAP' ||
    action === 'CROCODILE_DISCARD' ||
    action === 'CROCODILE_USE' ||
    action === 'HYENA_SWAP' ||
    action === 'LEOPARD_STATUE_EFFECT' ||
    action === 'LEOPARD_RETURN' ||
    action === 'GUARD_PLAYED' ||
    action === 'RAIN_MAKER_PLAYED' ||
    action === 'RAIN_MAKER_DECLINED' ||
    action === 'CHEETAH_EFFECT' ||
    action === 'SCALE_EFFECT' ||
    action === 'BOAT_EFFECT' ||
    action === 'DRUMS_EFFECT' ||
    action === 'KETTLE_EFFECT' ||
    action === 'WEAPONS_EFFECT' ||
    action === 'UTILITY_REPLACE' ||
    action === 'SHAMAN_TRADE' ||
    action === 'PORTUGUESE_SELL' ||
    action === 'BASKET_MAKER' ||
    action === 'CARRIER_WARES' ||
    action === 'DANCER_CONVERSION' ||
    action === 'DRUMMER_PICK' ||
    action === 'PSYCHIC_PEEK' ||
    action === 'TRIBAL_ELDER_DISCARD' ||
    action === 'TRIBAL_ELDER_DRAW' ||
    action === 'OPPONENT_DISCARD' ||
    action === 'AUCTION_WON' ||
    action === 'AUCTION_NO_WINNER' ||
    action === 'DRAFT_COMPLETE' ||
    action === 'SUPPLIES_DRAW' ||
    action === 'SUPPLIES_PAY' ||
    action === 'SUPPLIES_DISCARD_CHOICE' ||
    action === 'ACTION_BONUS' ||
    action === 'END_TURN'
  );
}

export function parseOpponentAction(
  action: string,
  details: string,
  pub: PublicGameState,
  opponent: 0 | 1,
): OpponentActionInfo | null {
  const humanDetails = humanizeLogDetails(details);

  if (action === 'ACTIVATE_UTILITY') {
    const cardId = extractPlayedCardId(details, pub, opponent);
    if (!cardId) return { cardId: null, message: 'Opponent activated a utility card.' };
    return { cardId, message: 'Opponent activated a utility card.' };
  }

  if (action === 'DRAW_CARD') return { cardId: null, message: 'Opponent drew a card and is deciding whether to keep it.' };
  if (action === 'KEEP_CARD') return { cardId: null, message: 'Opponent kept the drawn card.' };
  if (action === 'DISCARD_DRAWN') return { cardId: null, message: 'Opponent discarded the drawn card.' };
  if (action === 'SKIP_DRAW') return { cardId: null, message: 'Opponent skipped the draw phase.' };

  if (action.startsWith('PLAY_')) {
    const cardId = extractPlayedCardId(details, pub, opponent);
    if (!cardId) return null;
    if (action === 'PLAY_WARE_BUY') return { cardId, message: 'Opponent played a ware card and bought wares.' };
    if (action === 'PLAY_WARE_SELL') return { cardId, message: 'Opponent played a ware card and sold wares.' };
    return { cardId, message: 'Opponent played a card.' };
  }

  if (action === 'PARROT_STEAL') {
    const ware = extractWareFromSteal(details);
    return {
      cardId: findAnyCardIdByDesign('parrot'),
      message: ware ? 'Opponent stole one of your wares.' : (humanDetails || 'Opponent stole one of your wares.'),
      wareStolen: ware,
    };
  }

  if (action === 'THRONE_SWAP') {
    const stole = asWareType(details.match(/Stole\s+([a-z_]+)/i)?.[1]);
    const gave = asWareType(details.match(/gave\s+([a-z_]+)/i)?.[1]);
    return {
      cardId: findUtilityCardIdByDesign(pub, opponent, 'throne') ?? findAnyCardIdByDesign('throne'),
      message: stole && gave
        ? 'Opponent swapped wares with you.'
        : stole
          ? 'Opponent stole one of your wares.'
          : (humanDetails || 'Opponent swapped wares using Throne.'),
      wareStolen: stole,
      wareGivenBack: gave,
    };
  }

  if (action === 'CROCODILE_DISCARD') {
    const removedCardId = details.match(/Discarded opponent's\s+([a-z0-9_]+)/i)?.[1]?.trim() ?? null;
    const utilityCardId = removedCardId && isValidDeckCardId(removedCardId) ? removedCardId : null;
    return {
      cardId: findAnyCardIdByDesign('crocodile'),
      message: utilityCardId
        ? 'Opponent discarded one of your utility cards.'
        : (humanDetails || 'Opponent discarded one of your utility cards.'),
      affectedUtilityCardId: utilityCardId,
    };
  }

  if (action === 'CROCODILE_USE') {
    const usedName = details.match(/opponent's\s+([A-Za-z ]+?)(?:\s+\(|$)/i)?.[1]?.trim() ?? null;
    const affectedUtilityCardId = usedName ? findUtilityCardIdByName(pub, slotForOpponent(opponent), usedName) : null;
    const utilityName = affectedUtilityCardId ? getCard(affectedUtilityCardId).name : usedName;
    return {
      cardId: findAnyCardIdByDesign('crocodile'),
      message: utilityName
        ? 'Opponent used one of your utility cards.'
        : (humanDetails || 'Opponent used one of your utilities.'),
      affectedUtilityCardId,
    };
  }

  if (action === 'HYENA_SWAP') {
    const tookCardId = details.match(/Took\s+([a-z0-9_]+)/i)?.[1]?.trim();
    const gaveCardId = details.match(/gave\s+([a-z0-9_]+)/i)?.[1]?.trim();
    const tookName = tookCardId && isValidDeckCardId(tookCardId) ? getCard(tookCardId).name : null;
    const gaveName = gaveCardId && isValidDeckCardId(gaveCardId) ? getCard(gaveCardId).name : null;
    const message = tookName || gaveName
      ? 'Opponent swapped cards with your hand.'
      : humanDetails || 'Opponent swapped cards with your hand.';
    return {
      cardId: findAnyCardIdByDesign('hyena'),
      message,
      cardTakenId: tookCardId && isValidDeckCardId(tookCardId) ? tookCardId : null,
      cardGivenId: gaveCardId && isValidDeckCardId(gaveCardId) ? gaveCardId : null,
    };
  }

  if (action === 'LEOPARD_STATUE_EFFECT') {
    const selectedWare = asWareType(details.match(/received\s+([a-z_]+)/i)?.[1]);
    return {
      cardId: findUtilityCardIdByDesign(pub, opponent, 'leopard_statue') ?? findAnyCardIdByDesign('leopard_statue'),
      message: selectedWare
        ? 'Opponent used Leopard Statue and selected a ware.'
        : (humanDetails || 'Opponent used Leopard Statue.'),
      wareSelected: selectedWare,
    };
  }

  if (action === 'RAIN_MAKER_PLAYED') {
    const takenCardId = details.match(/took\s+([a-z0-9_]+)\s+from discard/i)?.[1]?.trim();
    const takenCardName = takenCardId && isValidDeckCardId(takenCardId) ? getCard(takenCardId).name : null;
    return {
      cardId: findAnyCardIdByDesign('rain_maker'),
      message: takenCardName
        ? 'Opponent played Rain Maker and took a card from the discard pile.'
        : (humanDetails || 'Opponent played Rain Maker.'),
      extraCardIds: takenCardId && isValidDeckCardId(takenCardId) ? [takenCardId] : undefined,
    };
  }

  if (action === 'RAIN_MAKER_DECLINED') {
    return {
      cardId: findAnyCardIdByDesign('rain_maker'),
      message: 'Opponent declined to use Rain Maker.',
    };
  }

  if (action === 'GUARD_PLAYED') {
    return {
      cardId: findAnyCardIdByDesign('guard'),
      message: humanDetails || 'Opponent played Guard to cancel an attack.',
    };
  }

  if (action === 'SCALE_EFFECT') {
    const gaveCardId = details.match(/gave\s+([a-z0-9_]+)\s+to opponent/i)?.[1]?.trim();
    const gaveCardName = gaveCardId && isValidDeckCardId(gaveCardId) ? getCard(gaveCardId).name : null;
    // The kept card is redacted in the public log; only the given card is known
    if (gaveCardName) {
      return {
        cardId: findUtilityCardIdByDesign(pub, opponent, 'scale') ?? findAnyCardIdByDesign('scale'),
        message: 'Opponent used Scale and gave you a card.',
        cardGivenId: details.match(/gave\s+([a-z0-9_]+)\s+to opponent/i)?.[1]?.trim() ?? null,
      };
    }
  }

  if (action === 'CHEETAH_EFFECT') {
    return {
      cardId: findAnyCardIdByDesign('cheetah'),
      message: humanDetails || 'Opponent resolved Cheetah.',
    };
  }

  if (action === 'UTILITY_REPLACE') {
    return {
      cardId: null,
      message: humanDetails || 'Opponent replaced a utility card.',
    };
  }

  if (action === 'AUCTION_WON' || action === 'AUCTION_NO_WINNER' || action === 'DRAFT_COMPLETE') {
    return {
      cardId: null,
      message: humanDetails || 'Opponent resolved a shared market effect.',
    };
  }

  if (
    action === 'LEOPARD_RETURN' ||
    action === 'BOAT_EFFECT' ||
    action === 'DRUMS_EFFECT' ||
    action === 'KETTLE_EFFECT' ||
    action === 'WEAPONS_EFFECT' ||
    action === 'SHAMAN_TRADE' ||
    action === 'PORTUGUESE_SELL' ||
    action === 'BASKET_MAKER' ||
    action === 'CARRIER_WARES' ||
    action === 'DANCER_CONVERSION' ||
    action === 'DRUMMER_PICK' ||
    action === 'PSYCHIC_PEEK' ||
    action === 'TRIBAL_ELDER_DISCARD' ||
    action === 'TRIBAL_ELDER_DRAW' ||
    action === 'OPPONENT_DISCARD' ||
    action === 'SUPPLIES_DRAW' ||
    action === 'SUPPLIES_PAY' ||
    action === 'SUPPLIES_DISCARD_CHOICE' ||
    action === 'ACTION_BONUS' ||
    action === 'END_TURN'
  ) {
    return {
      cardId: null,
      message: humanDetails || `Opponent resolved ${action.toLowerCase().replace(/_/g, ' ')}.`,
    };
  }

  return null;
}

function extractWareFromSteal(details: string): WareType | null {
  return asWareType(details.match(/Stole\s+([a-z_]+)\s+from opponent/i)?.[1]);
}

function extractPlayedCardId(
  details: string,
  pub: PublicGameState,
  opponent: 0 | 1,
): DeckCardId | null {
  for (const pattern of [/\bPlaced\s+([a-z0-9_]+)\s+in play area\b/i, /\bvia\s+([a-z0-9_]+)\b/i]) {
    const raw = details.match(pattern)?.[1]?.trim();
    if (raw && isValidDeckCardId(raw)) return raw;
  }

  const cardName = details.match(/^Played\s+(.+?)(?:\s+\(|\s+-|$)/i)?.[1]?.trim();
  const utilityName = details.match(/^Activated\s+(.+?)(?:\s+\(|\s+-|$)/i)?.[1]?.trim()
    ?? details.match(/^([A-Za-z ]+):/)?.[1]?.trim()
    ?? null;

  if (cardName) {
    const normalized = cardName.toLowerCase();
    for (const id of ALL_DECK_CARD_IDS) {
      if (getCard(id).name.toLowerCase() === normalized) return id;
    }
  }

  if (utilityName) {
    const normalizedUtility = utilityName.toLowerCase();
    const utilityMatch = pub.players[opponent].utilities.find(
      (utility) => getCard(utility.cardId).name.toLowerCase() === normalizedUtility,
    );
    if (utilityMatch) return utilityMatch.cardId;
  }

  return null;
}

function findAnyCardIdByDesign(designId: string): DeckCardId | null {
  for (const id of ALL_DECK_CARD_IDS) {
    if (getCard(id).designId === designId) return id;
  }
  return null;
}

function findUtilityCardIdByDesign(pub: PublicGameState, player: 0 | 1, designId: string): DeckCardId | null {
  const match = pub.players[player].utilities.find((utility) => utility.designId === designId);
  return match?.cardId ?? null;
}

function findUtilityCardIdByName(pub: PublicGameState, player: 0 | 1, utilityName: string): DeckCardId | null {
  const normalizedName = utilityName.trim().toLowerCase();
  const match = pub.players[player].utilities.find(
    (utility) => getCard(utility.cardId).name.toLowerCase() === normalizedName,
  );
  return match?.cardId ?? null;
}

function asWareType(value: string | undefined | null): WareType | null {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === 'trinkets' ||
    normalized === 'hides' ||
    normalized === 'tea' ||
    normalized === 'silk' ||
    normalized === 'fruit' ||
    normalized === 'salt'
  ) {
    return normalized;
  }
  return null;
}

function slotForOpponent(opponent: 0 | 1): 0 | 1 {
  return opponent === 0 ? 1 : 0;
}

function humanizeLogDetails(details: string): string {
  if (!details) return '';
  return details.replace(/\b([a-z][a-z0-9]*_[a-z0-9_]+)\b/gi, (token) => {
    if (!isValidDeckCardId(token)) return token;
    return getCard(token).name;
  });
}

// --- Helpers ---

function isWaitingForMe(
  pub: PublicGameState,
  priv: PrivateGameState,
  slot: 0 | 1,
): boolean {
  if (pub.phase === 'GAME_OVER') return false;

  // Guard reaction
  if (pub.pendingGuardReaction?.targetPlayer === slot) return true;
  // Ware card reaction
  if (pub.pendingWareCardReaction?.targetPlayer === slot) return true;
  // Resolution
  if (priv.pendingResolution && pub.waitingOnPlayer === slot) return true;
  // Normal turn
  if (!pub.pendingGuardReaction && !pub.pendingWareCardReaction && !pub.pendingResolutionType) {
    return pub.currentPlayer === slot;
  }

  return pub.waitingOnPlayer === slot;
}

