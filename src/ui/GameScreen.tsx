import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useGameStore } from '../hooks/useGameStore.ts';
import { getAiActionByDifficulty } from '../ai/difficulties/index.ts';
import type { AIDifficulty } from '../ai/difficulties/index.ts';
import { getAiActionDescription } from '../ai/aiActionDescriptions.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { validatePlayCard, validateActivateUtility } from '../engine/validation/actionValidator.ts';
import type { DeckCardId } from '../engine/types.ts';
import { CONSTANTS } from '../engine/types.ts';
import { getResponder } from '../engine/responder.ts';
import { OpponentArea } from './OpponentArea.tsx';
import { CenterRow } from './CenterRow.tsx';
import { MarketDisplay } from './MarketDisplay.tsx';
import { UtilityArea } from './UtilityArea.tsx';
import { HandDisplay } from './HandDisplay.tsx';
import { ActionButtons, CardPlayDialog, DrawModal } from './ActionButtons.tsx';
import { InteractionPanel } from './InteractionPanel.tsx';
import { GameLog } from './GameLog.tsx';
import { EndgameOverlay } from './EndgameOverlay.tsx';
import { ResolveMegaView } from './ResolveMegaView.tsx';
import { isHandInteraction } from './HandReferenceStrip.tsx';
import { MegaView } from './MegaView.tsx';
import { TutorialOverlay } from './TutorialOverlay.tsx';
import { PassDeviceScreen, needsHandoff } from './PassDeviceScreen.tsx';
import { shouldAiAct, isWareDialogValid, shouldShowResolvePanel } from './gameScreenLogic.ts';
import { useVisualFeedback } from './useVisualFeedback.ts';
import { getDrawDisabledReason, getPlayDisabledReason, friendlyPlayError } from './uiHints.ts';
import { getVolume, setVolume as saveVolume, getMuted, setMuted as saveMuted, resetAudioSettings } from './audioSettings.ts';
import { fetchUserStatsSummary, fetchDifficultyBreakdown, recordCompletedGame } from '../persistence/userStatsApi.ts';
import type { UserStatsSummary, DifficultyBreakdown } from '../persistence/userStatsApi.ts';
import { getWinner, getFinalScores } from '../engine/endgame/EndgameManager.ts';
import { useAuthSession } from './useAuthSession.ts';
import { useLocalActionAudio } from './useAudioEvents.ts';
import { saveLocalGame, setGameActiveInTab } from '../persistence/savedGame.ts';
import { useMediaQuery, PHONE_MEDIA_QUERY } from './useMediaQuery.ts';
import { useElementSize } from './useElementSize.ts';
import { fitCardsToBox, fitMarketSlots } from './fitLayout.ts';

type AnimationSpeed = 'normal' | 'fast';
const ANIMATION_SPEED_STORAGE_KEY = 'jambo.animationSpeed';
const SHOW_LOG_STORAGE_KEY = 'jambo.showGameLog';
const DEV_TELEMETRY_STORAGE_KEY = 'jambo.devTelemetry';
const HIGH_CONTRAST_STORAGE_KEY = 'jambo.highContrast';
const UX_DEBUG_STORAGE_KEY = 'jambo.uxDebugCounters';
const TUTORIAL_SEEN_STORAGE_KEY = 'jambo.tutorialSeen';

function getInitialAnimationSpeed(): AnimationSpeed {
  if (typeof window === 'undefined') return 'normal';
  const saved = window.localStorage.getItem(ANIMATION_SPEED_STORAGE_KEY);
  return saved === 'fast' ? 'fast' : 'normal';
}

function getInitialShowLog(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SHOW_LOG_STORAGE_KEY) === 'true';
}

function getInitialDevTelemetry(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(DEV_TELEMETRY_STORAGE_KEY) === 'true';
}

function getInitialHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY) === 'true';
}

function getInitialUxDebug(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(UX_DEBUG_STORAGE_KEY) !== 'false';
}

function isDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export function GameScreen({ onBackToMenu, aiDifficulty = 'medium', localMultiplayer = false }: { onBackToMenu?: () => void; aiDifficulty?: AIDifficulty; localMultiplayer?: boolean }) {
  const { state, dispatch, error, newGame, exportReplay, importReplay, replayActions, taggedActions } = useGameStore();
  useLocalActionAudio(taggedActions);

  // Autosave after every action so a refresh can't lose the game
  // (persistence/savedGame.ts). A finished game clears the save.
  const startingPlayer = useGameStore((store) => store.startingPlayer);
  useEffect(() => {
    saveLocalGame({
      mode: localMultiplayer ? 'multiplayer' : 'solo',
      aiDifficulty,
      state,
      replayActions,
      taggedActions,
      startingPlayer,
    });
  }, [state, replayActions, taggedActions, startingPlayer, aiDifficulty, localMultiplayer]);
  useEffect(() => {
    setGameActiveInTab(true);
  }, []);
  const [wareDialog, setWareDialog] = useState<DeckCardId | null>(null);
  const [showLog, setShowLog] = useState(() => getInitialShowLog());
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawModalOpen, setDrawModalOpen] = useState(false);
  const [cardError, setCardError] = useState<{cardId: DeckCardId, message: string} | null>(null);
  const [aiMessage, setAiMessage] = useState<string>('');
  const [megaCardId, setMegaCardId] = useState<DeckCardId | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [animationSpeed, setAnimationSpeed] = useState<AnimationSpeed>(() => getInitialAnimationSpeed());
  const [showDevTelemetry, setShowDevTelemetry] = useState(() => getInitialDevTelemetry());
  const [highContrast, setHighContrast] = useState(() => getInitialHighContrast());
  const [volume, setVolume] = useState(() => getVolume());
  const [muted, setMuted] = useState(() => getMuted());
  const [showUxDebug, setShowUxDebug] = useState(() => getInitialUxDebug());
  const { authUser, authError, avatarUrl, avatarLabel, logout: authLogout } = useAuthSession();
  const [statsSummary, setStatsSummary] = useState<UserStatsSummary | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [diffBreakdown, setDiffBreakdown] = useState<DifficultyBreakdown[] | null>(null);
  const [showTutorial, setShowTutorial] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(TUTORIAL_SEEN_STORAGE_KEY) !== 'true';
  });
  const [telemetryEvents, setTelemetryEvents] = useState<string[]>([]);
  const [uxDebugCounts, setUxDebugCounts] = useState({ longPending: 0, blockedPlay: 0, blockedDraw: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  const [phoneBoardRef, phoneBoardSize] = useElementSize<HTMLDivElement>();
  const [phoneHandRef, phoneHandSize] = useElementSize<HTMLDivElement>();
  const replayInputRef = useRef<HTMLInputElement>(null);
  const pendingSecondsRef = useRef(0);
  const blockedPlaySecondsRef = useRef(0);
  const blockedDrawSecondsRef = useRef(0);
  const prevPhaseRef = useRef(state.phase);
  // Hotseat: the screen belongs to whoever must act next — including the
  // non-active player answering a Guard/Rain Maker, auction, draft, etc.
  const viewerPlayer: 0 | 1 = localMultiplayer ? getResponder(state) : 0;
  // Hotseat: whose hand is currently allowed on screen (changes only after a handoff)
  const [confirmedViewer, setConfirmedViewer] = useState<0 | 1>(viewerPlayer);
  const opponentPlayer: 0 | 1 = viewerPlayer === 0 ? 1 : 0;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-anim-speed', animationSpeed);
    window.localStorage.setItem(ANIMATION_SPEED_STORAGE_KEY, animationSpeed);
  }, [animationSpeed]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (highContrast) {
      document.documentElement.setAttribute('data-contrast', 'high');
    } else {
      document.documentElement.removeAttribute('data-contrast');
    }
    window.localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, String(highContrast));
  }, [highContrast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SHOW_LOG_STORAGE_KEY, String(showLog));
  }, [showLog]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DEV_TELEMETRY_STORAGE_KEY, String(showDevTelemetry));
  }, [showDevTelemetry]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(UX_DEBUG_STORAGE_KEY, String(showUxDebug));
  }, [showUxDebug]);


  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const [summary, breakdown] = await Promise.all([
          fetchUserStatsSummary(),
          fetchDifficultyBreakdown(),
        ]);
        if (isMounted) {
          setStatsSummary(summary);
          setDiffBreakdown(breakdown);
          setStatsError(null);
        }
      } catch {
        if (isMounted) {
          setStatsError('Stats unavailable');
        }
      }
    };

    void loadStats();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = useCallback(async () => {
    await authLogout();
    setMenuOpen(false);
    setStatsSummary(null);
  }, [authLogout]);

  useEffect(() => {
    const wasGameOver = prevPhaseRef.current === 'GAME_OVER';
    const isGameOver = state.phase === 'GAME_OVER';

    if (!wasGameOver && isGameOver) {
      const winner = getWinner(state);
      if (winner === null) {
        prevPhaseRef.current = state.phase;
        return;
      }
      const scores = getFinalScores(state);

      void recordCompletedGame({
        aiDifficulty,
        winner,
        playerGold: scores.player0,
        opponentGold: scores.player1,
        turnCount: state.turn,
        rngSeed: state.rngSeed,
        completedAt: Date.now(),
        actions: taggedActions,
      }).then(async (summary) => {
        setStatsSummary(summary);
        setStatsError(null);
        try {
          const breakdown = await fetchDifficultyBreakdown();
          setDiffBreakdown(breakdown);
        } catch { /* ignore */ }
      }).catch(() => {
        setStatsError('Stats unavailable');
      });
    }

    prevPhaseRef.current = state.phase;
  }, [aiDifficulty, state, replayActions, taggedActions]);

  const handleExportReplay = useCallback(() => {
    try {
      const replayJson = exportReplay();
      const blob = new Blob([replayJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `jambo-replay-turn-${state.turn}-seed-${state.rngSeed}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setReplayError(null);
      setMenuOpen(false);
    } catch (e) {
      setReplayError((e as Error).message);
    }
  }, [exportReplay, state.turn, state.rngSeed]);

  const handleReplayFileChange = useCallback(async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const payload = await file.text();
      importReplay(payload);
      setReplayError(null);
      setMenuOpen(false);
    } catch (e) {
      setReplayError((e as Error).message);
    } finally {
      event.target.value = '';
    }
  }, [importReplay]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Is it the AI's turn to act?
  const isAiTurn = !localMultiplayer && state.phase !== 'GAME_OVER' && getResponder(state) === 1;

  const getFriendlyErrorMessage = friendlyPlayError;

  // Handle playing a card from hand
  const handlePlayCard = useCallback((cardId: DeckCardId) => {
    const card = getCard(cardId);
    if (card.type === 'ware') {
      // For ware cards, show buy/sell dialog
      setWareDialog(cardId);
    } else {
      // For other cards, validate first
      const validation = validatePlayCard(state, cardId);
      if (!validation.valid) {
        const friendlyMessage = getFriendlyErrorMessage(validation.reason || 'Invalid play');
        setCardError({ cardId, message: friendlyMessage });
        return;
      }
      // Clear any previous error
      setCardError(null);
      dispatch({ type: 'PLAY_CARD', cardId });
    }
  }, [dispatch, state]);

  // AI move effect
  const aiAttemptRef = useRef(0);
  const prevStateRef = useRef(state);

  useEffect(() => {
    if (prevStateRef.current !== state) {
      aiAttemptRef.current = 0;
      prevStateRef.current = state;
    }
  }, [state]);

  useEffect(() => {
    if (!shouldAiAct({ isAiTurn, showTutorial, attempts: aiAttemptRef.current })) return;

    const isFirstTurn = state.turn === 0;
    const delay = isFirstTurn ? 0 : CONSTANTS.AI_ACTION_DELAY_MS;

    const timer = setTimeout(() => {
      aiAttemptRef.current++;
      const action = getAiActionByDifficulty(state, aiDifficulty);
      if (action) {
        // Set AI message before dispatching action
        const message = getAiActionDescription(action, state);
        setAiMessage(message);
        dispatch(action, `AI (${aiDifficulty})`);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [isAiTurn, state, dispatch, error, aiDifficulty, showTutorial]);

  // Auto-open draw modal when entering draw phase
  useEffect(() => {
    if (state.phase === 'DRAW' && state.currentPlayer === viewerPlayer && !drawModalOpen) {
      setDrawModalOpen(true);
    } else if (state.phase !== 'DRAW' && drawModalOpen) {
      setDrawModalOpen(false);
    }
  }, [state.phase, state.currentPlayer, drawModalOpen, viewerPlayer]);

  useEffect(() => {
    if (!cardError) return;
    const timer = setTimeout(() => setCardError(null), 5000);
    return () => clearTimeout(timer);
  }, [cardError]);

  useEffect(() => {
    if (state.phase === 'GAME_OVER' && aiMessage) {
      setAiMessage('');
    }
  }, [state.phase, aiMessage]);

  const handleAiMessageHide = useCallback(() => {
    setAiMessage('');
  }, []);

  const hasPendingInteraction = !!(
    state.pendingResolution ||
    state.pendingGuardReaction ||
    state.pendingWareCardReaction
  );
  const canTakePlayActions =
    state.phase === 'PLAY' &&
    state.currentPlayer === viewerPlayer &&
    state.actionsLeft > 0 &&
    !hasPendingInteraction;
  const playActionsDisabled = !canTakePlayActions;

  // Close a stale buy/sell dialog once its card leaves the hand or the turn moves on
  const wareDialogStillValid = isWareDialogValid(wareDialog, canTakePlayActions, state.players[viewerPlayer].hand);
  useEffect(() => {
    if (wareDialog !== null && !wareDialogStillValid) setWareDialog(null);
  }, [wareDialog, wareDialogStillValid]);

  const canTakeDrawActions =
    state.phase === 'DRAW' &&
    state.currentPlayer === viewerPlayer &&
    !isAiTurn;
  const drawActionsDisabled = !canTakeDrawActions;
  const playDisabledReason = getPlayDisabledReason({
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    viewerPlayer,
    actionsLeft: state.actionsLeft,
    hasPendingInteraction,
    isAiTurn,
  });
  const drawDisabledReason = getDrawDisabledReason({
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    viewerPlayer,
    isAiTurn,
  });

  const lastLog = state.log.length > 0 ? state.log[state.log.length - 1] : null;
  const visualFeedback = useVisualFeedback({
    phase: state.phase,
    actionsLeft: state.actionsLeft,
    deckCount: state.deck.length,
    discardCount: state.discardPile.length,
    topDiscardCard: state.discardPile.length > 0 ? state.discardPile[0] : null,
    players: [
      {
        gold: state.players[0].gold,
        handCount: state.players[0].hand.length,
        market: state.players[0].market,
      },
      {
        gold: state.players[1].gold,
        handCount: state.players[1].hand.length,
        market: state.players[1].market,
      },
    ],
    lastLog: lastLog ? { player: lastLog.player, action: lastLog.action } : null,
  });

  useEffect(() => {
    if (!showDevTelemetry) return;

    const newEvents: string[] = [];
    if (visualFeedback.trail) {
      newEvents.push(`[trail] ${visualFeedback.trail.actor === 1 ? 'opponent' : 'you'} ${visualFeedback.trail.kind}`);
    }
    if (visualFeedback.goldDeltas[0] !== 0 || visualFeedback.goldDeltas[1] !== 0) {
      newEvents.push(`[gold] you ${visualFeedback.goldDeltas[0]}, opp ${visualFeedback.goldDeltas[1]}`);
    }
    if (visualFeedback.marketFlashSlots[0].length > 0 || visualFeedback.marketFlashSlots[1].length > 0) {
      newEvents.push(`[market] you ${visualFeedback.marketFlashSlots[0].join(',') || '-'} | opp ${visualFeedback.marketFlashSlots[1].join(',') || '-'}`);
    }

    if (newEvents.length === 0) return;
    newEvents.forEach((entry) => console.debug(`[JamboUI] ${entry}`));
    setTelemetryEvents((previous) => [...newEvents, ...previous].slice(0, 8));
  }, [showDevTelemetry, visualFeedback.trail, visualFeedback.goldDeltas, visualFeedback.marketFlashSlots]);

  useEffect(() => {
    if (!showUxDebug) {
      pendingSecondsRef.current = 0;
      blockedPlaySecondsRef.current = 0;
      blockedDrawSecondsRef.current = 0;
      return;
    }

    const intervalId = window.setInterval(() => {
      if (hasPendingInteraction) {
        pendingSecondsRef.current += 1;
      } else {
        pendingSecondsRef.current = 0;
      }

      if (state.phase === 'PLAY' && state.currentPlayer === viewerPlayer && playActionsDisabled) {
        blockedPlaySecondsRef.current += 1;
      } else {
        blockedPlaySecondsRef.current = 0;
      }

      if (state.phase === 'DRAW' && state.currentPlayer === viewerPlayer && drawActionsDisabled) {
        blockedDrawSecondsRef.current += 1;
      } else {
        blockedDrawSecondsRef.current = 0;
      }

      const longPendingTick = pendingSecondsRef.current > 0 && pendingSecondsRef.current % 8 === 0;
      const blockedPlayTick = blockedPlaySecondsRef.current > 0 && blockedPlaySecondsRef.current % 5 === 0;
      const blockedDrawTick = blockedDrawSecondsRef.current > 0 && blockedDrawSecondsRef.current % 5 === 0;

      if (!longPendingTick && !blockedPlayTick && !blockedDrawTick) return;

      setUxDebugCounts((previous) => ({
        longPending: previous.longPending + (longPendingTick ? 1 : 0),
        blockedPlay: previous.blockedPlay + (blockedPlayTick ? 1 : 0),
        blockedDraw: previous.blockedDraw + (blockedDrawTick ? 1 : 0),
      }));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [showUxDebug, hasPendingInteraction, playActionsDisabled, drawActionsDisabled, state.phase, state.currentPlayer, viewerPlayer]);

  const handleCloseTutorial = useCallback(() => {
    setShowTutorial(false);
    window.localStorage.setItem(TUTORIAL_SEEN_STORAGE_KEY, 'true');
  }, []);

  const resetUiPrefs = useCallback(() => {
    setShowLog(false);
    setAnimationSpeed('normal');
    setShowDevTelemetry(false);
    setHighContrast(false);
    setVolume(50);
    setMuted(false);
    setShowUxDebug(false);
    setTelemetryEvents([]);
    setUxDebugCounts({ longPending: 0, blockedPlay: 0, blockedDraw: 0 });
    pendingSecondsRef.current = 0;
    blockedPlaySecondsRef.current = 0;
    blockedDrawSecondsRef.current = 0;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SHOW_LOG_STORAGE_KEY);
      window.localStorage.removeItem(ANIMATION_SPEED_STORAGE_KEY);
      window.localStorage.removeItem(DEV_TELEMETRY_STORAGE_KEY);
      window.localStorage.removeItem(HIGH_CONTRAST_STORAGE_KEY);
      window.localStorage.removeItem(UX_DEBUG_STORAGE_KEY);
      resetAudioSettings();
      window.dispatchEvent(new Event('jambo-volume-change'));
    }
  }, []);

  // Block the entire game UI until the tutorial is dismissed
  if (showTutorial) {
    return <TutorialOverlay onClose={handleCloseTutorial} />;
  }

  if (needsHandoff(localMultiplayer, state.phase, confirmedViewer, viewerPlayer)) {
    return <PassDeviceScreen state={state} viewerPlayer={viewerPlayer} onReady={() => setConfirmedViewer(viewerPlayer)} />;
  }

  return (
    <div className={showUxDebug ? 'ux-debug' : undefined} style={isPhone ? { position: 'relative' } : {
      display: 'flex',
      gap: 16,
      padding: '16px 20px',
      minHeight: '100vh',
      position: 'relative',
    }}>
      {isPhone ? (() => {
        // Phone: fits 100dvh, never scrolls (DESIGN.md › Layout › Phone solo board).
        const viewer = state.players[viewerPlayer];
        const opponent = state.players[opponentPlayer];
        const HEAD_PX = 20;
        const GAP_PX = 6;
        const innerW = Math.max(0, phoneBoardSize.width - 16);
        const innerH = Math.max(0, phoneBoardSize.height - 16);
        const oppMarket = fitMarketSlots(opponent.market.length, innerW, { maxSlot: 26, minSlot: 20 });
        const myMarket = fitMarketSlots(viewer.market.length, innerW, { maxSlot: 30 });
        const myMarketH = myMarket.rows * myMarket.slotSize + (myMarket.rows - 1) * 4;
        const utilCount = viewer.utilities.length;
        // Utilities yield height to big hands (no hand limit in the rules)
        const utilShare = viewer.hand.length > 12 ? 0.16 : viewer.hand.length > 8 ? 0.2 : 0.24;
        const utilRowH = utilCount > 0 ? Math.min(Math.round(innerH * utilShare), 150) : 22;
        const utilFit = fitCardsToBox({ count: utilCount, width: innerW, height: utilRowH, maxRows: 1, maxScale: 1 });
        const utilH = utilCount > 0 ? utilFit.cardHeight : utilRowH;
        // Prefer the measured hand box; fall back to the estimate before first measure
        const handH = phoneHandSize.height || Math.max(0, innerH - 3 * HEAD_PX - 5 * GAP_PX - myMarketH - utilH);
        const handFit = fitCardsToBox({ count: viewer.hand.length, width: phoneHandSize.width || innerW, height: handH, maxRows: 4, maxScale: 1.3 });
        const myGoldDelta = visualFeedback.goldDeltas[viewerPlayer];
        const isMyTurnNow = state.currentPlayer === viewerPlayer;

        return (
          <div className="player-shell phone-game">
            <div className="player-topbar">
              <span key={`my-gold-${myGoldDelta}`} className={`player-gold${myGoldDelta !== 0 ? ' gold-pop gold-pop-soft' : ''}`} style={{ position: 'relative' }} aria-label={`${viewer.gold} gold`}>
                {viewer.gold}g
                {myGoldDelta !== 0 && (
                  <span className="gold-delta-text gold-delta-text-soft" style={{
                    position: 'absolute', top: -12, right: -26, fontSize: 12, fontWeight: 700,
                    color: myGoldDelta > 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                  }}>
                    {myGoldDelta > 0 ? `+${myGoldDelta}g` : `${myGoldDelta}g`}
                  </span>
                )}
              </span>
              <div className={`player-turn-status${isMyTurnNow ? ' player-turn-status-active' : ''}`}>
                <span>{localMultiplayer ? `Player ${viewerPlayer + 1}` : 'You'}{isMyTurnNow ? ' · your turn' : ''}</span>
                {(state.turnModifiers.buyDiscount > 0 || state.turnModifiers.sellBonus > 0) ? (
                  <span style={{ color: 'var(--accent-green)', textTransform: 'none', letterSpacing: 0.4 }}>
                    {state.turnModifiers.buyDiscount > 0 && `Buy −${state.turnModifiers.buyDiscount}g `}
                    {state.turnModifiers.sellBonus > 0 && `Sell +${state.turnModifiers.sellBonus}g`}
                  </span>
                ) : (
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0.4 }}>{viewer.hand.length} cards in hand</span>
                )}
              </div>
              <div style={{ marginLeft: 'auto' }} />
              {state.phase === 'PLAY' && isMyTurnNow && (
                <button
                  className="end-turn-button"
                  onClick={() => dispatch({ type: 'END_TURN' })}
                  aria-label={`End turn, ${state.actionsLeft} actions left`}
                >
                  End Turn
                  <div className="action-pips" aria-hidden="true">
                    {Array.from({ length: 5 }, (_, i) => (
                      <div key={i} className={`action-pip${i < state.actionsLeft ? '' : ' action-pip-spent'}`} />
                    ))}
                  </div>
                </button>
              )}
            </div>

            <div className={`phone-opp-wrap turn-emphasis ${state.currentPlayer === opponentPlayer ? 'turn-emphasis-active' : 'turn-emphasis-inactive'}`} data-center-target="top">
              <OpponentArea
                compact
                player={opponent}
                aiMessage={state.phase === 'GAME_OVER' ? '' : aiMessage}
                onMessageHide={handleAiMessageHide}
                goldDelta={visualFeedback.goldDeltas[opponentPlayer]}
                marketFlashSlots={visualFeedback.marketFlashSlots[opponentPlayer]}
                label={localMultiplayer ? `Player ${opponentPlayer + 1}` : 'Opponent (AI)'}
                onMegaView={setMegaCardId}
                slotSize={oppMarket.slotSize}
                marketColumns={oppMarket.rows > 1 ? oppMarket.columns : undefined}
              />
            </div>

            <CenterRow compact state={state} dispatch={dispatch} isLocalMode={true} showGlow={false} visualFeedback={visualFeedback} actorLabels={localMultiplayer ? ['Player 1', 'Player 2'] : ['You', 'Opponent']} hiddenPlayer={localMultiplayer ? null : 1} />

            {playActionsDisabled && state.phase === 'PLAY' && playDisabledReason && (
              <div className="disabled-hint" style={{ marginBottom: 0, flexShrink: 0 }}>
                {playDisabledReason}
              </div>
            )}

            <div ref={phoneBoardRef} className={`player-board turn-emphasis ${isMyTurnNow ? 'turn-emphasis-active' : 'turn-emphasis-inactive'}`} data-center-target="bottom">
              <div className="player-board-section-head">
                <div className="panel-section-title">{localMultiplayer ? `Player ${viewerPlayer + 1} Market` : 'Your Market'}</div>
                <span className="ui-helper-text">{viewer.market.filter(Boolean).length}/{viewer.market.length}</span>
              </div>
              <div style={{ flexShrink: 0 }}>
                <MarketDisplay
                  market={viewer.market}
                  flashSlots={visualFeedback.marketFlashSlots[viewerPlayer]}
                  flashVariant="soft"
                  slotSize={myMarket.slotSize}
                  tokenSize={Math.round(myMarket.slotSize * 0.82)}
                  columns={myMarket.rows > 1 ? myMarket.columns : undefined}
                  compact
                />
              </div>
              <div className="player-board-section-head">
                <div className="panel-section-title">{localMultiplayer ? `Player ${viewerPlayer + 1} Utilities` : 'Your Utilities'}</div>
                {utilCount > 0 && <span className="ui-helper-text">{utilCount}/3</span>}
              </div>
              <div style={{ flexShrink: 0, height: utilH }}>
                <UtilityArea
                  utilities={viewer.utilities}
                  onActivate={(i) => {
                    const validation = validateActivateUtility(state, i);
                    if (!validation.valid) {
                      const friendlyMessage = getFriendlyErrorMessage(validation.reason || 'Cannot activate utility');
                      setCardError({ cardId: viewer.utilities[i].cardId, message: friendlyMessage });
                      return;
                    }
                    setCardError(null);
                    dispatch({ type: 'ACTIVATE_UTILITY', utilityIndex: i });
                  }}
                  disabled={playActionsDisabled}
                  cardError={cardError}
                  cardSize="default"
                  cardScale={utilFit.scale}
                  showHelperText={false}
                  overlapPx={utilFit.overlapPx}
                  overlapOnDesktop
                  gapPx={utilFit.gap}
                  singleRow
                  hideScrollbar
                />
              </div>
              <div className="player-board-section-head">
                <div className="panel-section-title">{localMultiplayer ? `Player ${viewerPlayer + 1} Hand` : 'Your Hand'} · {viewer.hand.length}</div>
                {state.phase === 'PLAY' && isMyTurnNow && (
                  <span className="ui-helper-text">{state.actionsLeft} action{state.actionsLeft === 1 ? '' : 's'} left</span>
                )}
              </div>
              <div ref={phoneHandRef} className="player-hand-box">
                <HandDisplay
                  hand={viewer.hand}
                  onPlayCard={handlePlayCard}
                  disabled={playActionsDisabled}
                  cardError={cardError}
                  useWoodBackground={false}
                  transparentBackground
                  showBorder={false}
                  showHelperText={false}
                  cardScale={handFit.scale}
                  paddingTop={0}
                  paddingBottom={0}
                  paddingX={0}
                  layoutMode="fitRows"
                  rows={handFit.rows}
                  fixedOverlapPx={handFit.overlapPx}
                  gapPx={handFit.gap}
                  onMegaView={setMegaCardId}
                />
              </div>
            </div>
            {cardError && (
              <div className="player-toast" role="alert" key={`${cardError.cardId}-${cardError.message}`}>
                {cardError.message}
              </div>
            )}
          </div>
        );
      })() : (
      /* Main game area (desktop) */
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 0,
      }}>
        {/* Opponent area */}
        <div className={`etched-wood-border turn-emphasis ${state.currentPlayer === opponentPlayer ? 'turn-emphasis-active' : 'turn-emphasis-inactive'}`} style={{
          borderRadius: 12,
          background: 'rgba(20,10,5,0.75)',
          backdropFilter: 'blur(3px)',
        }} data-center-target="top">
          <OpponentArea
            player={state.players[opponentPlayer]}
            aiMessage={state.phase === 'GAME_OVER' ? '' : aiMessage}
            onMessageHide={handleAiMessageHide}
            goldDelta={visualFeedback.goldDeltas[opponentPlayer]}
            marketFlashSlots={visualFeedback.marketFlashSlots[opponentPlayer]}
            label={localMultiplayer ? `Opponent (Player ${opponentPlayer + 1})` : 'Opponent (AI)'}
          />
        </div>

        {/* Center row */}
        <div>
          <CenterRow state={state} dispatch={dispatch} isLocalMode={true} showGlow={false} visualFeedback={visualFeedback} actorLabels={localMultiplayer ? ['Player 1', 'Player 2'] : ['You', 'Opponent']} hiddenPlayer={localMultiplayer ? null : 1} />
        </div>

        {/* Player sections */}
        <div className={`etched-wood-border turn-emphasis ${state.currentPlayer === viewerPlayer ? 'turn-emphasis-active' : 'turn-emphasis-inactive'}`} style={{
          borderRadius: 12,
          padding: '12px',
          background: 'rgba(20,10,5,0.75)',
          backdropFilter: 'blur(3px)',
        }} data-center-target="bottom">
          {/* Player board */}
          <div className="etched-wood-border" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            background: 'rgba(20,10,5,0.5)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 10,
          }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            {(state.turnModifiers.buyDiscount > 0 || state.turnModifiers.sellBonus > 0) && (
              <span style={{ fontSize: 13, color: '#6a8a40', fontWeight: 600 }}>
                {state.turnModifiers.buyDiscount > 0 && `Buy -${state.turnModifiers.buyDiscount}g `}
                {state.turnModifiers.sellBonus > 0 && `Sell +${state.turnModifiers.sellBonus}g`}
              </span>
            )}
          </div>
          <div style={{ position: 'relative', display: 'flex', gap: 20, alignItems: 'flex-start', paddingBottom: 36 }}>
            <MarketDisplay
              market={state.players[viewerPlayer].market}
              flashSlots={visualFeedback.marketFlashSlots[viewerPlayer]}
              flashVariant="soft"
              label={localMultiplayer ? `Player ${viewerPlayer + 1} Market` : 'Your Market'}
            />
            <UtilityArea
              utilities={state.players[viewerPlayer].utilities}
              onActivate={(i) => {
                const validation = validateActivateUtility(state, i);
                if (!validation.valid) {
                  const friendlyMessage = getFriendlyErrorMessage(validation.reason || 'Cannot activate utility');
                  setCardError({ cardId: state.players[viewerPlayer].utilities[i].cardId, message: friendlyMessage });
                  return;
                }
                setCardError(null);
                dispatch({ type: 'ACTIVATE_UTILITY', utilityIndex: i });
              }}
              disabled={playActionsDisabled}
              cardError={cardError}
              label={localMultiplayer ? `Player ${viewerPlayer + 1} Utilities` : 'Your Utilities'}
              cardSize="medium"
              showHelperText={false}
            />
            <span style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: 18,
              color: state.currentPlayer === viewerPlayer ? 'var(--gold)' : 'var(--text)',
              textShadow: '0 2px 12px rgba(0,0,0,0.6)',
            }}>
              {localMultiplayer ? `Player ${viewerPlayer + 1}` : 'You'} {state.currentPlayer === viewerPlayer && '(Active)'}
            </span>
            <div style={{ position: 'absolute', right: 0, bottom: 0, display: 'flex', gap: 16, alignItems: 'center' }}>
              <span key={`my-gold-${visualFeedback.goldDeltas[viewerPlayer]}`} className={visualFeedback.goldDeltas[viewerPlayer] !== 0 ? 'gold-pop gold-pop-soft' : undefined} style={{ fontFamily: 'var(--font-heading)', color: 'var(--gold)', fontWeight: 700, fontSize: 20, textShadow: '0 0 8px rgba(212,168,80,0.4)', position: 'relative' }}>
                {state.players[viewerPlayer].gold}g
                {visualFeedback.goldDeltas[viewerPlayer] !== 0 && (
                  <span className="gold-delta-text gold-delta-text-soft" style={{
                    position: 'absolute',
                    top: -18,
                    right: -20,
                    color: visualFeedback.goldDeltas[viewerPlayer] > 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                    fontSize: 12,
                    fontWeight: 700,
                  }}>
                    {visualFeedback.goldDeltas[viewerPlayer] > 0 ? `+${visualFeedback.goldDeltas[viewerPlayer]}g` : `${visualFeedback.goldDeltas[viewerPlayer]}g`}
                  </span>
                )}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 15 }}>
                {state.players[viewerPlayer].hand.length} cards
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <ActionButtons 
          state={state}
        />

        {playActionsDisabled && state.phase === 'PLAY' && (
          <div className="disabled-hint">
            {playDisabledReason}
          </div>
        )}

          {/* Player hand */}
          <div style={{
            marginBottom: 10,
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div className="panel-section-title" style={{ fontSize: 15, marginBottom: 0 }}>
              {localMultiplayer ? `Player ${viewerPlayer + 1} Hand` : 'Your Hand'}
            </div>
          </div>
          <HandDisplay
            hand={state.players[viewerPlayer].hand}
            onPlayCard={handlePlayCard}
            disabled={playActionsDisabled}
            cardError={cardError}
            useWoodBackground={false}
            transparentBackground={false}
            showHelperText={false}
            onMegaView={setMegaCardId}
          />
        </div>

        {/* End Turn button */}
        {state.phase === 'PLAY' && state.currentPlayer === viewerPlayer && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: 16,
          }}>
            <button
              className="end-turn-button"
              onClick={() => dispatch({ type: 'END_TURN' })}
              style={{ padding: '12px 28px', fontSize: 16 }}
              aria-label={`End turn, ${state.actionsLeft} actions left`}
            >
              End Turn
              <div className="action-pips" aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className={`action-pip${i < state.actionsLeft ? '' : ' action-pip-spent'}`} />
                ))}
              </div>
            </button>
          </div>
        )}
        </div>
      </div>
      )}

      {/* Right sidebar — Game log */}
      {showLog && !isPhone && (
        <div style={{
          width: 280,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5 }}>
            Game Log
          </div>
          <GameLog log={state.log} labels={localMultiplayer ? ['Player 1', 'Player 2'] : ['You', 'Opponent']} hiddenPlayer={localMultiplayer ? null : 1} />
        </div>
      )}

      {/* Settings hamburger menu */}
      <div ref={menuRef} style={{ position: 'fixed', top: 12, right: 16, zIndex: 50 }}>
        <button
          onClick={() => setMenuOpen(prev => !prev)}
          style={{
            width: 42,
            height: 42,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: menuOpen ? 'rgba(212,168,80,0.15)' : 'rgba(20,10,5,0.85)',
            border: menuOpen ? '1px solid var(--gold)' : '1px solid rgba(122,90,62,0.5)',
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
            background: 'rgba(20,10,5,0.92)',
            border: '1px solid rgba(122,90,62,0.5)',
            borderRadius: 10,
            padding: 12,
            minWidth: 220,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(3px)',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: 'var(--gold)', marginBottom: 12, textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>
              Settings
            </div>
            <div style={{
              padding: 10,
              border: '1px solid rgba(212,168,80,0.2)',
              borderRadius: 10,
              background: 'rgba(212,168,80,0.08)',
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
              {statsSummary && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {statsSummary.wins}-{statsSummary.losses} · {Math.round(statsSummary.winRate * 100)}% win · {statsSummary.gamesPlayed} games
                </div>
              )}
              {diffBreakdown && diffBreakdown.some((d) => d.gamesPlayed > 0) && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 8 }}>
                  {diffBreakdown.filter((d) => d.gamesPlayed > 0).map((d) => (
                    <span key={d.difficulty} style={{ opacity: d.difficulty === aiDifficulty ? 1 : 0.6 }}>
                      {d.difficulty[0]!.toUpperCase() + d.difficulty.slice(1)}: Lv{d.level}
                      <span style={{ opacity: 0.5 }}> ({d.gamesPlayed}g)</span>
                    </span>
                  ))}
                </div>
              )}
              {statsError && (
                <div style={{ fontSize: 12, color: 'var(--accent-red)', marginTop: 4 }}>
                  {statsError}
                </div>
              )}
              {authUser && (
                <button
                  onClick={() => void handleLogout()}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-muted)',
                    borderRadius: 10,
                    padding: '6px 8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 14,
                  }}
                >
                  Logout
                </button>
              )}
            </div>
            {onBackToMenu && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Menu
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onBackToMenu();
                  }}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    marginBottom: 6,
                  }}
                >
                  Back to Menu
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowTutorial(true);
                  }}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    marginBottom: 10,
                  }}
                >
                  How to Play
                </button>
                <div style={{ width: 60, height: 3, borderRadius: 2, background: 'var(--gold)', opacity: 0.5, marginBottom: 10 }} />
              </>
            )}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Settings
            </div>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              cursor: 'pointer',
              fontSize: 15,
              color: 'var(--text)',
            }}>
              Show Game Log
              <input
                type="checkbox"
                checked={showLog}
                onChange={() => setShowLog(prev => !prev)}
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
              color: 'var(--text)',
            }}>
              Animation Speed
              <select
                value={animationSpeed}
                onChange={(event) => setAnimationSpeed(event.target.value as AnimationSpeed)}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text)',
                  borderRadius: 8,
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
                UX Debug Counters
                <input
                  type="checkbox"
                  checked={showUxDebug}
                  onChange={() => setShowUxDebug((previous) => !previous)}
                  style={{ accentColor: 'var(--gold)', width: 16, height: 16, cursor: 'pointer' }}
                />
              </label>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <button
                onClick={handleExportReplay}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Export Replay JSON
              </button>
              <button
                onClick={() => replayInputRef.current?.click()}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Import Replay JSON
              </button>
              <input
                ref={replayInputRef}
                type="file"
                accept="application/json"
                onChange={handleReplayFileChange}
                style={{ display: 'none' }}
              />
              {replayError && (
                <div style={{ color: '#c04030', fontSize: 12 }}>
                  {replayError}
                </div>
              )}
              <button
                onClick={resetUiPrefs}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Reset UI Preferences
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ware buy/sell dialog */}
      {wareDialog && wareDialogStillValid && (
        <CardPlayDialog
          cardId={wareDialog}
          onBuy={() => {
            const validation = validatePlayCard(state, wareDialog, 'buy');
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
            const validation = validatePlayCard(state, wareDialog, 'sell');
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

      {/* Draw modal */}
      {drawModalOpen && (
        <DrawModal
          state={state}
          dispatch={dispatch}
          disabled={drawActionsDisabled}
          disabledReason={drawDisabledReason}
          viewerPlayer={viewerPlayer}
          onClose={() => setDrawModalOpen(false)}
          onMegaView={setMegaCardId}
        />
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
          <div style={{ color: 'var(--gold)', fontWeight: 700, marginBottom: 6 }}>UI Telemetry</div>
          {telemetryEvents.map((entry, index) => (
            <div key={`${entry}-${index}`} style={{ marginBottom: 3 }}>
              {entry}
            </div>
          ))}
        </div>
      )}

      {isDevMode() && showUxDebug && (
        <div style={{
          position: 'fixed',
          left: 12,
          bottom: showDevTelemetry && telemetryEvents.length > 0 ? 244 : 12,
          width: 300,
          background: 'rgba(20,10,5,0.88)',
          border: '1px solid var(--border-light)',
          borderRadius: 8,
          padding: 8,
          zIndex: 1500,
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          <div style={{ color: 'var(--gold)', fontWeight: 700, marginBottom: 6 }}>UX Debug Counters</div>
          <div>Long pending (&gt;=8s): {uxDebugCounts.longPending}</div>
          <div>Play blocked (&gt;=5s): {uxDebugCounts.blockedPlay}</div>
          <div>Draw blocked (&gt;=5s): {uxDebugCounts.blockedDraw}</div>
        </div>
      )}

      {/* Endgame overlay */}
      <EndgameOverlay state={state} onNewGame={() => newGame()} onMainMenu={onBackToMenu} />

      {/* Resolve mega view — also stay visible during drafts when AI is picking */}
      {shouldShowResolvePanel(hasPendingInteraction, isAiTurn, state.pendingResolution?.type) && (
        <ResolveMegaView
          verticalAlign="center"
          hand={state.players[viewerPlayer].hand}
          onMegaView={setMegaCardId}
          hideHandStrip={isHandInteraction(state.pendingResolution, viewerPlayer)}
        >
          <InteractionPanel state={state} dispatch={dispatch} viewerPlayer={viewerPlayer} onMegaView={setMegaCardId} />
        </ResolveMegaView>
      )}

      {/* Mega view */}
      {megaCardId && (
        <MegaView cardId={megaCardId} onClose={() => setMegaCardId(null)} />
      )}

    </div>
  );
}
