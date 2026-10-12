import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useGameStore } from '../hooks/useGameStore.ts';
import { getAiActionByDifficulty } from '../ai/difficulties/index.ts';
import type { AIDifficulty } from '../ai/difficulties/index.ts';
import { getAiActionDescription } from '../ai/aiActionDescriptions.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { validatePlayCard, validateActivateUtility } from '../engine/validation/actionValidator.ts';
import type { DeckCardId, GameAction } from '../engine/types.ts';
import { getResponder } from '../engine/responder.ts';
import { OpponentArea } from './OpponentArea.tsx';
import { CenterRow } from './CenterRow.tsx';
import { MarketDisplay } from './MarketDisplay.tsx';
import { UtilityArea } from './UtilityArea.tsx';
import { HandDisplay } from './HandDisplay.tsx';
import { ActionButtons, CardPlayDialog, DrawModal } from './ActionButtons.tsx';
import { InteractionPanel } from './InteractionPanel.tsx';
import { ActionLogButton, ActionLogDrawer } from './ActionLogDrawer.tsx';
import { OpponentPlaySpotlight } from './OpponentPlaySpotlight.tsx';
import { countUnread } from './actionLog.ts';
import type { PlaySpotlight } from './actionLog.ts';
import { GoldTrack } from './GoldTrack.tsx';
import { WareSupply, supplyWareFromError } from './WareSupply.tsx';
import { FinalTurnBanner } from './FinalTurnBanner.tsx';
import { FlightLayer } from './FlightLayer.tsx';
import { TurnSweep } from './TurnSweep.tsx';
import { computeHandHints, endTurnBonus } from './handHints.ts';
import { computeUtilityHints } from './utilityHints.ts';
import { EndgameOverlay } from './EndgameOverlay.tsx';
import { FirstPlayerReveal } from './FirstPlayerReveal.tsx';
import { buildGameStory } from './gameStory.ts';
import { createStartingState } from '../persistence/replayLog.ts';
import { traderFor } from '../ai/traders.ts';
import { traderChatter } from '../ai/traderChatter.ts';
import { TraderPortrait } from './TraderPortrait.tsx';
import { PlayerAvatar } from './PlayerAvatar.tsx';
import { SeatInfo } from './SeatInfo.tsx';
import { TableauCorners } from './Tableau.tsx';
import { useTrader } from './useTrader.ts';
import { ResolveMegaView } from './ResolveMegaView.tsx';
import { isHandInteraction } from './HandReferenceStrip.tsx';
import { MegaView } from './MegaView.tsx';
import { TutorialOverlay } from './TutorialOverlay.tsx';
import { hasSeenTutorial, markTutorialSeen } from './tutorial/tutorial.ts';
import { ActionPips, AmbientLayer, GoldCount } from './life.tsx';
import { PassDeviceScreen, needsHandoff } from './PassDeviceScreen.tsx';
import { shouldAiAct, isWareDialogValid, shouldShowResolvePanel, aiActionDelayMs, quoteForSpotlight } from './gameScreenLogic.ts';
import type { TraderLine } from './gameScreenLogic.ts';
import { useVisualFeedback } from './useVisualFeedback.ts';
import { getDrawDisabledReason, getPlayDisabledReason, friendlyPlayError } from './uiHints.ts';
import { usePreferences, isDevMode } from './preferences.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { GameMenuShell } from './GameMenuShell.tsx';
import { fetchUserStatsSummary, fetchDifficultyBreakdown, recordCompletedGame, recordAbandonedGame, abandonedGamePayload } from '../persistence/userStatsApi.ts';
import type { UserStatsSummary, DifficultyBreakdown } from '../persistence/userStatsApi.ts';
import { getWinner, getFinalScores } from '../engine/endgame/EndgameManager.ts';
import { useAuthSession } from './useAuthSession.ts';
import { useLocalActionAudio, playSfx } from './useAudioEvents.ts';
import type { Flight } from './flights.ts';
import { saveLocalGame, setGameActiveInTab, clearLocalGame } from '../persistence/savedGame.ts';
import { ConfirmButton } from './ConfirmButton.tsx';
import { useMediaQuery, PHONE_MEDIA_QUERY, SHORT_DESKTOP_MEDIA_QUERY } from './useMediaQuery.ts';
import { useElementSize } from './useElementSize.ts';
import { fitCardsToBox, fitMarketSlots } from './fitLayout.ts';
import { useCornerButtonInset } from './cornerClearance.ts';
import { viewerPriceModifiers } from './WareCoin.tsx';

const HOTSEAT_LABELS = ['Player 1', 'Player 2'] as const;
/** A trader's line stays on screen this long. */
const TRADER_LINE_MS = 4500;

export function GameScreen({ onBackToMenu, aiDifficulty = 'medium', localMultiplayer = false }: { onBackToMenu?: () => void; aiDifficulty?: AIDifficulty; localMultiplayer?: boolean }) {
  const { state, dispatch, error, newGame, exportReplay, importReplay, replayActions, taggedActions } = useGameStore();
  // Hotseat: every ending gets the victory flourish (both players are here)
  useLocalActionAudio(taggedActions, state, localMultiplayer ? null : 0);

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
  // Settings — shared with the main menu's Settings screen (preferences.ts)
  const preferences = usePreferences();
  const { prefs, setPref, resetPrefs } = preferences;
  const { aiSpeed, traderVoices, devTelemetry: showDevTelemetry, uxDebug: showUxDebug } = prefs;
  const logPinnedPref = prefs.logPinned;
  const [logOpen, setLogOpen] = useState(false);
  // Solo: the AI is a named trader with a face and a voice (step 11)
  const trader = useMemo(() => (localMultiplayer ? null : traderFor(aiDifficulty)), [localMultiplayer, aiDifficulty]);
  const soloLabels = useMemo<readonly [string, string] | null>(() => (trader ? ['You', trader.name] : null), [trader]);
  const difficultyLabel = `${aiDifficulty.charAt(0).toUpperCase()}${aiDifficulty.slice(1)}`;
  // Rematch: a fresh coin toss decides who goes first (as from the menu)
  const [rematchReveal, setRematchReveal] = useState<0 | 1 | null>(null);
  // Log length when the drawer was last open — newer opponent entries are "unread"
  const [logSeenLength, setLogSeenLength] = useState(() => state.log.length);
  const [spotlightActive, setSpotlightActive] = useState(false);
  const [spotlitDiscard, setSpotlitDiscard] = useState<DeckCardId | null>(null);
  // A utility the opponent is using stays upright on the board until its
  // spotlight clears, so you see it turn there too
  const [spotlitUtility, setSpotlitUtility] = useState<DeckCardId | null>(null);
  // A soft tap as each ware lands — throttled so a 6-ware buy doesn't clatter
  const lastLandSound = useRef(0);
  const handleFlightLand = useCallback((flight: Flight) => {
    if (flight.kind !== 'ware' || flight.to.type !== 'slot') return;
    const now = Date.now();
    if (now - lastLandSound.current < 70) return;
    lastLandSound.current = now;
    playSfx('ware-land');
  }, []);
  // When the card now in the spotlight arrived (a trader line belongs to it
  // only if said since then)
  const [spotlightSince, setSpotlightSince] = useState<number | null>(null);
  const spotlightKey = useRef<PlaySpotlight['key'] | null>(null);
  const handleSpotlightCurrent = useCallback((spot: PlaySpotlight | null) => {
    setSpotlitDiscard(spot && spot.destination === 'discard' ? spot.cardId : null);
    setSpotlitUtility(spot && spot.destination === 'inPlace' ? spot.cardId : null);
    const key = spot?.key ?? null;
    if (key !== spotlightKey.current) {
      spotlightKey.current = key;
      setSpotlightSince(key === null ? null : Date.now());
    }
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawModalOpen, setDrawModalOpen] = useState(false);
  const [cardError, setCardError] = useState<{cardId: DeckCardId, message: string} | null>(null);
  const [aiMessage, setAiMessage] = useState<string>('');
  // What the trader just said (a voiced line's caption) — outranks chatter
  const [traderLineSaid, setTraderLineSaid] = useState<TraderLine | null>(null);
  const traderLine = traderLineSaid?.text ?? null;
  const setTraderLine = useCallback((text: string | null) => setTraderLineSaid(text ? { text, at: Date.now() } : null), []);
  const [megaCardId, setMegaCardId] = useState<DeckCardId | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const { authUser, authError, avatarUrl, logout: authLogout } = useAuthSession();
  const [topPanelRef, cornerInset] = useCornerButtonInset<HTMLDivElement>();
  const [statsSummary, setStatsSummary] = useState<UserStatsSummary | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [diffBreakdown, setDiffBreakdown] = useState<DifficultyBreakdown[] | null>(null);
  const [showTutorial, setShowTutorial] = useState(() => typeof window !== 'undefined' && !hasSeenTutorial());
  // Reopened from the in-game menu: its last button goes back to the game
  const [tutorialFromMenu, setTutorialFromMenu] = useState(false);
  const [telemetryEvents, setTelemetryEvents] = useState<string[]>([]);
  const [uxDebugCounts, setUxDebugCounts] = useState({ longPending: 0, blockedPlay: 0, blockedDraw: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  // A phone has no room to dock the log; the pin preference waits for a wider screen
  const logPinned = logPinnedPref && !isPhone;
  const logVisible = logOpen || logPinned;
  const isShortDesktop = useMediaQuery(SHORT_DESKTOP_MEDIA_QUERY);
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
  // Wise Man: your ware coins show this turn's prices
  const priceModifiers = viewerPriceModifiers(state.turnModifiers, state.currentPlayer, viewerPlayer);
  // Hotseat: whose hand is currently allowed on screen (changes only after a handoff)
  const [confirmedViewer, setConfirmedViewer] = useState<0 | 1>(viewerPlayer);
  const opponentPlayer: 0 | 1 = viewerPlayer === 0 ? 1 : 0;

  useEffect(() => {
    // While open, everything is read; a shorter log means a new game started
    if (logVisible || state.log.length < logSeenLength) setLogSeenLength(state.log.length);
  }, [logVisible, state.log.length, logSeenLength]);
  const toggleLogPin = useCallback(() => {
    setPref('logPinned', !logPinnedPref);
    setLogOpen(false);
  }, [setPref, logPinnedPref]);
  const closeLog = useCallback(() => setLogOpen(false), []);
  // One voice per moment: the spotlight caption replaces the AI's line about
  // the same play (a hidden bubble would otherwise pop up stale afterwards).
  // A trader line outlives a short spotlight: it carries on in the bubble.
  useEffect(() => {
    if (spotlightActive) setAiMessage('');
  }, [spotlightActive]);
  useEffect(() => {
    if (!traderLine) return;
    const t = window.setTimeout(() => setTraderLine(null), TRADER_LINE_MS);
    return () => window.clearTimeout(t);
  }, [traderLine]);

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

  // The AI's chosen move for the current state — computed once, after any
  // spotlight has landed (an Expert search mid-animation would stutter it).
  const aiPlanRef = useRef<{ state: typeof state; action: GameAction | null } | null>(null);

  useEffect(() => {
    // never behind the tutorial or a rematch's coin toss
    if (!shouldAiAct({ isAiTurn, showTutorial: showTutorial || rematchReveal !== null, attempts: aiAttemptRef.current })) return;
    // Hold while the opponent's last play is still being announced
    if (spotlightActive) return;

    let dispatchTimer: ReturnType<typeof setTimeout> | undefined;
    const planTimer = setTimeout(() => {
      const started = Date.now();
      if (aiPlanRef.current?.state !== state) {
        aiPlanRef.current = { state, action: getAiActionByDifficulty(state, aiDifficulty) };
      }
      const action = aiPlanRef.current.action;
      const wait = action ? aiActionDelayMs(action.type, aiSpeed) - (Date.now() - started) : 0;
      dispatchTimer = setTimeout(() => {
        aiAttemptRef.current++;
        if (action) {
          // Set AI message before dispatching action
          setAiMessage(trader ? traderChatter(trader, action, state) : getAiActionDescription(action, state));
          dispatch(action, `AI (${aiDifficulty})`);
        }
      }, Math.max(0, wait));
    }, 30);

    return () => {
      clearTimeout(planTimer);
      if (dispatchTimer) clearTimeout(dispatchTimer);
    };
  }, [isAiTurn, state, dispatch, error, aiDifficulty, showTutorial, spotlightActive, aiSpeed, rematchReveal, trader]);

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
    setTraderLine(null);
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
  const { mood: traderMood, speaking: traderSpeaking } = useTrader({
    state,
    trader,
    seat: opponentPlayer,
    voices: traderVoices,
    ready: rematchReveal === null && !showTutorial,
    onLine: setTraderLine,
  });
  // The story of a finished game: replayed from the seeded start
  const isGameOver = state.phase === 'GAME_OVER';
  const gameStory = useMemo(() => {
    if (!isGameOver) return null;
    try {
      return buildGameStory(createStartingState(state.rngSeed, startingPlayer), replayActions);
    } catch {
      return null;
    }
  }, [isGameOver, state.rngSeed, startingPlayer, replayActions]);
  const endgameRecord = useMemo(() => {
    if (localMultiplayer || !diffBreakdown) return null;
    const row = diffBreakdown.find((d) => d.difficulty === aiDifficulty);
    return row ? { wins: row.humanWins, losses: row.aiWins } : null;
  }, [localMultiplayer, diffBreakdown, aiDifficulty]);
  const handleRematch = useCallback(() => {
    const first: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    newGame(undefined, first);
    setRematchReveal(first);
  }, [newGame]);
  const handleRematchRevealDone = useCallback(() => setRematchReveal(null), []);
  const handHints = useMemo(() => computeHandHints(state, viewerPlayer), [state, viewerPlayer]);
  const utilityHints = useMemo(() => computeUtilityHints(state, viewerPlayer), [state, viewerPlayer]);
  const turnBonus = endTurnBonus(state.actionsLeft);
  const supplyAlert = supplyWareFromError(cardError?.message);
  const logLabels: readonly [string, string] = soloLabels ?? HOTSEAT_LABELS;
  const logUnread = logVisible ? 0 : countUnread(state.log, logSeenLength, opponentPlayer);
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
        utilityCount: state.players[0].utilities.length,
      },
      {
        gold: state.players[1].gold,
        handCount: state.players[1].hand.length,
        market: state.players[1].market,
        utilityCount: state.players[1].utilities.length,
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
    setTutorialFromMenu(false);
    markTutorialSeen();
  }, []);

  const resetUiPrefs = useCallback(() => {
    resetPrefs();
    setTelemetryEvents([]);
    setUxDebugCounts({ longPending: 0, blockedPlay: 0, blockedDraw: 0 });
    pendingSecondsRef.current = 0;
    blockedPlaySecondsRef.current = 0;
    blockedDrawSecondsRef.current = 0;
  }, [resetPrefs]);

  // Block the entire game UI until the tutorial is dismissed
  if (showTutorial) {
    return <TutorialOverlay onClose={handleCloseTutorial} finishLabel={tutorialFromMenu ? 'Back to the game' : 'Start playing'} />;
  }

  if (needsHandoff(localMultiplayer, state.phase, confirmedViewer, viewerPlayer)) {
    return <PassDeviceScreen state={state} viewerPlayer={viewerPlayer} onReady={() => setConfirmedViewer(viewerPlayer)} />;
  }

  return (
    <div className={`game-root${showUxDebug ? ' ux-debug' : ''}`} style={isPhone ? { position: 'relative' } : {
      display: 'flex',
      gap: 16,
      // extra left gutter keeps the board clear of the Action Log tab
      padding: `${isShortDesktop ? 8 : 16}px 20px ${isShortDesktop ? 8 : 16}px ${logPinned ? 20 : 44}px`,
      minHeight: '100vh',
      position: 'relative',
    }}>
      <AmbientLayer />
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
              <span key={`my-gold-${myGoldDelta}`} data-gold-anchor={viewerPlayer} className={`player-gold${myGoldDelta !== 0 ? ' gold-pop gold-pop-soft' : ''}`} style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }} aria-label={`${viewer.gold} gold`}>
                <GoldCount value={viewer.gold} />
                <GoldTrack gold={viewer.gold} width={44} compact />
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
              <ActionLogButton compact onClick={() => setLogOpen(true)} unread={logUnread} />
              {state.phase === 'PLAY' && isMyTurnNow && (
                <button
                  className="end-turn-button"
                  onClick={() => dispatch({ type: 'END_TURN' })}
                  aria-label={`End turn, ${state.actionsLeft} actions left${turnBonus ? `, earns +${turnBonus}g` : ''}`}
                >
                  <span>End Turn{turnBonus > 0 && <span className="end-turn-bonus">+{turnBonus}g</span>}</span>
                  <ActionPips actionsLeft={state.actionsLeft} />
                </button>
              )}
            </div>

            <div className={`phone-opp-wrap turn-emphasis ${state.currentPlayer === opponentPlayer ? 'turn-emphasis-active' : 'turn-emphasis-inactive'}`} data-center-target="top">
              <OpponentArea
                seat={opponentPlayer}
                compact
                player={opponent}
                aiMessage={state.phase === 'GAME_OVER' || spotlightActive ? '' : (traderLine ?? aiMessage)}
                onMessageHide={handleAiMessageHide}
                goldDelta={visualFeedback.goldDeltas[opponentPlayer]}
                marketFlashSlots={visualFeedback.marketFlashSlots[opponentPlayer]}
                label={trader ? trader.name : `Player ${opponentPlayer + 1}`}
                compactPortrait={trader ? <TraderPortrait trader={trader} mood={traderMood} speaking={traderSpeaking} size={26} /> : undefined}
                isActive={state.currentPlayer === opponentPlayer}
                onMegaView={setMegaCardId}
                slotSize={oppMarket.slotSize}
                marketColumns={oppMarket.rows > 1 ? oppMarket.columns : undefined}
              />
            </div>

            <CenterRow compact state={state} dispatch={dispatch} isLocalMode={true} showGlow={false} visualFeedback={visualFeedback} actorLabels={logLabels} hiddenPlayer={opponentPlayer} spotlitPlayer={localMultiplayer ? null : opponentPlayer} heldDiscardCard={spotlitDiscard} />
            <WareSupply supply={state.wareSupply} compact highlight={supplyAlert} />

            {playActionsDisabled && state.phase === 'PLAY' && playDisabledReason && (
              <div className="disabled-hint" style={{ marginBottom: 0, flexShrink: 0 }}>
                {playDisabledReason}
              </div>
            )}

            <div ref={phoneBoardRef} className={`player-board turn-emphasis ${isMyTurnNow ? 'turn-emphasis-active' : 'turn-emphasis-inactive'}`} data-center-target="bottom">
              <div className="player-board-section-head">
                <div className="panel-section-title">{localMultiplayer ? `Player ${viewerPlayer + 1} Market` : 'Your Market'}</div>
                <span className="tableau-count">{viewer.market.filter(Boolean).length}/{viewer.market.length}</span>
              </div>
              <div style={{ flexShrink: 0 }}>
                <MarketDisplay
                  owner={viewerPlayer}
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
                {utilCount > 0 && <span className="tableau-count">{utilCount}/3</span>}
              </div>
              <div style={{ flexShrink: 0, height: utilH }} data-utility-anchor={viewerPlayer}>
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
                  hints={utilityHints}
                  onMegaView={setMegaCardId}
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
                <div className="panel-section-title">{localMultiplayer ? `Player ${viewerPlayer + 1} Hand` : 'Your Hand'}<span className="tableau-count">{viewer.hand.length}</span></div>
                {state.phase === 'PLAY' && isMyTurnNow && (
                  <span className="ui-helper-text">{state.actionsLeft} action{state.actionsLeft === 1 ? '' : 's'} left</span>
                )}
              </div>
              <div ref={phoneHandRef} className="player-hand-box" data-hand-anchor={viewerPlayer}>
                <HandDisplay
                  priceModifiers={priceModifiers}
                  hand={viewer.hand}
                  onPlayCard={handlePlayCard}
                  disabled={playActionsDisabled}
                  hints={handHints}
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
        <div ref={topPanelRef} className={`tableau turn-emphasis ${state.currentPlayer === opponentPlayer ? 'turn-emphasis-active' : 'turn-emphasis-inactive'}`} data-center-target="top">
          <TableauCorners />
          <OpponentArea
            seat={opponentPlayer}
            player={state.players[opponentPlayer]}
            aiMessage={state.phase === 'GAME_OVER' || spotlightActive ? '' : (traderLine ?? aiMessage)}
            onMessageHide={handleAiMessageHide}
            goldDelta={visualFeedback.goldDeltas[opponentPlayer]}
            marketFlashSlots={visualFeedback.marketFlashSlots[opponentPlayer]}
            label={trader ? trader.name : `Opponent (Player ${opponentPlayer + 1})`}
            subtitle={trader ? `${trader.title} · ${difficultyLabel}` : undefined}
            portrait={trader ? <TraderPortrait trader={trader} mood={traderMood} speaking={traderSpeaking} size={72} /> : undefined}
            isActive={state.currentPlayer === opponentPlayer}
            onMegaView={setMegaCardId}
            rightInset={cornerInset}
            untappedUtility={spotlitUtility}
          />
        </div>

        {/* Center row — End Turn sits at its right end, next to the action count */}
        <div style={isShortDesktop ? { margin: '-8px 0' } : undefined}>
          <CenterRow
            state={state}
            dispatch={dispatch}
            isLocalMode={true}
            showGlow={false}
            visualFeedback={visualFeedback}
            actorLabels={logLabels}
            hiddenPlayer={opponentPlayer}
            spotlitPlayer={localMultiplayer ? null : opponentPlayer}
            heldDiscardCard={spotlitDiscard}
            supplySlot={<WareSupply supply={state.wareSupply} highlight={supplyAlert} />}
            endTurnSlot={state.phase === 'PLAY' && state.currentPlayer === viewerPlayer ? (
              <button
                className="end-turn-button"
                onClick={() => dispatch({ type: 'END_TURN' })}
                style={{ padding: '12px 10px', fontSize: 16 }}
                aria-label={`End turn, ${state.actionsLeft} actions left${turnBonus ? `, earns +${turnBonus}g` : ''}`}
              >
                <span>End Turn{turnBonus > 0 && <span className="end-turn-bonus">+{turnBonus}g</span>}</span>
                <ActionPips actionsLeft={state.actionsLeft} />
              </button>
            ) : undefined}
          />
        </div>

        {/* Player sections */}
        <div className={`tableau turn-emphasis ${state.currentPlayer === viewerPlayer ? 'turn-emphasis-active' : 'turn-emphasis-inactive'}`} style={{
          padding: '12px',
        }} data-center-target="bottom">
          <TableauCorners />
          {/* Player board: market · utilities · you (name, gold, turn modifiers) */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', padding: '2px 4px 10px' }}>
            <MarketDisplay
              owner={viewerPlayer}
              market={state.players[viewerPlayer].market}
              flashSlots={visualFeedback.marketFlashSlots[viewerPlayer]}
              flashVariant="soft"
              label={localMultiplayer ? `Player ${viewerPlayer + 1} Market` : 'Your Market'}
              labelAside={`${state.players[viewerPlayer].market.filter(Boolean).length}/${state.players[viewerPlayer].market.length}`}
            />
            {/* utilities never squeeze into two rows; a long market wraps whole stands instead */}
            <div data-utility-anchor={viewerPlayer} style={{ flexShrink: 0 }}>
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
              hints={utilityHints}
              onMegaView={setMegaCardId}
              cardError={cardError}
              label={localMultiplayer ? `Player ${viewerPlayer + 1} Utilities` : 'Your Utilities'}
              labelAside={`${state.players[viewerPlayer].utilities.length}/3`}
              cardSize={isShortDesktop ? 'small' : 'medium'}
              maxSlots={3}
              showHelperText={false}
            />
            </div>
            {/* same block and inset as the opponent's above, so the two match and line up */}
            <SeatInfo
              seat={viewerPlayer}
              label={`${localMultiplayer ? `Player ${viewerPlayer + 1}` : 'You'}${state.currentPlayer === viewerPlayer ? ' · your turn' : ''}`}
              portrait={localMultiplayer ? undefined : <PlayerAvatar avatarUrl={avatarUrl} size={72} active={state.currentPlayer === viewerPlayer} />}
              gold={state.players[viewerPlayer].gold}
              goldDelta={visualFeedback.goldDeltas[viewerPlayer]}
              handCount={state.players[viewerPlayer].hand.length}
              isActive={state.currentPlayer === viewerPlayer}
              rightInset={cornerInset}
            >
              {(state.turnModifiers.buyDiscount > 0 || state.turnModifiers.sellBonus > 0) && (
                <span style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 700 }}>
                  {state.turnModifiers.buyDiscount > 0 && `Buy −${state.turnModifiers.buyDiscount}g `}
                  {state.turnModifiers.sellBonus > 0 && `Sell +${state.turnModifiers.sellBonus}g`}
                </span>
              )}
            </SeatInfo>
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
          }} data-hand-anchor={viewerPlayer}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div className="panel-section-title" style={{ marginBottom: 0 }}>
              {localMultiplayer ? `Player ${viewerPlayer + 1} Hand` : 'Your Hand'}
              <span className="tableau-count">{state.players[viewerPlayer].hand.length}</span>
            </div>
          </div>
          <HandDisplay
            priceModifiers={priceModifiers}
            hand={state.players[viewerPlayer].hand}
            onPlayCard={handlePlayCard}
            disabled={playActionsDisabled}
            hints={handHints}
            cardError={cardError}
            useWoodBackground={false}
            transparentBackground={false}
            mat
            showHelperText={false}
            onMegaView={setMegaCardId}
            cardScale={isShortDesktop ? 0.76 : 1}
            paddingTop={isShortDesktop ? 8 : 14}
            paddingBottom={isShortDesktop ? 8 : 14}
          />
        </div>

        </div>
      </div>
      )}

      {/* Profile & settings menu */}
      <div ref={menuRef} style={{ position: 'fixed', top: 12, right: 16, zIndex: 50 }}>
        <GameMenuShell
          open={menuOpen}
          onToggle={() => setMenuOpen(prev => !prev)}
          avatarUrl={avatarUrl}
          authUser={authUser}
          authError={authError ?? statsError}
          onLogout={() => void handleLogout()}
          stats={statsSummary && (
            <>
              {statsSummary.wins}-{statsSummary.losses} · {Math.round(statsSummary.winRate * 100)}% win · {statsSummary.gamesPlayed} games
            </>
          )}
          levels={diffBreakdown && diffBreakdown.some((d) => d.gamesPlayed > 0) && (
            diffBreakdown.filter((d) => d.gamesPlayed > 0).map((d) => (
              <span key={d.difficulty} style={{ opacity: d.difficulty === aiDifficulty ? 1 : 0.6 }}>
                {d.difficulty[0]!.toUpperCase() + d.difficulty.slice(1)} Lv{d.level}
                <span style={{ opacity: 0.6 }}> ({d.gamesPlayed}g)</span>
              </span>
            ))
          )}
          actions={onBackToMenu && (
            <>
              <button
                type="button"
                className="game-menu-action"
                onClick={() => {
                  setMenuOpen(false);
                  onBackToMenu();
                }}
              >
                Main Menu
              </button>
              <button
                type="button"
                className="game-menu-action"
                onClick={() => {
                  setMenuOpen(false);
                  setTutorialFromMenu(true);
                  setShowTutorial(true);
                }}
              >
                How to Play
              </button>
              {state.phase !== 'GAME_OVER' && (
                <ConfirmButton
                  className="menu-abandon"
                  label="Abandon Game"
                  question={localMultiplayer ? 'Abandon this game? It ends for both players and can\'t be resumed.' : 'Abandon this game? It can\'t be resumed.'}
                  confirmLabel="Abandon"
                  cancelLabel="Keep playing"
                  onConfirm={() => {
                    recordAbandonedGame(abandonedGamePayload(state, localMultiplayer ? 'multiplayer' : 'solo', aiDifficulty));
                    // Delete the save first, so the menu offers no "Resume Game"
                    clearLocalGame();
                    setMenuOpen(false);
                    onBackToMenu();
                  }}
                />
              )}
            </>
          )}
          tools={
            <>
              <button type="button" className="game-menu-tool" onClick={handleExportReplay}>
                Export replay
              </button>
              <button type="button" className="game-menu-tool" onClick={() => replayInputRef.current?.click()}>
                Import replay
              </button>
              <input
                ref={replayInputRef}
                type="file"
                accept="application/json"
                onChange={handleReplayFileChange}
                style={{ display: 'none' }}
              />
              {replayError && <div className="game-menu-error" style={{ flexBasis: '100%' }}>{replayError}</div>}
            </>
          }
        >
          <SettingsPanel
            {...preferences}
            resetPrefs={resetUiPrefs}
            showAiOptions={!localMultiplayer}
            showLogPin={!isPhone}
            compact
          />
        </GameMenuShell>
      </div>

      {/* Ware buy/sell dialog */}
      {wareDialog && wareDialogStillValid && (
        <CardPlayDialog
          cardId={wareDialog}
          priceModifiers={priceModifiers}
          market={state.players[viewerPlayer].market}
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
      <EndgameOverlay
        state={state}
        story={gameStory}
        labels={logLabels}
        playerPortrait={trader ? <PlayerAvatar avatarUrl={avatarUrl} size={56} /> : undefined}
        opponentPortrait={trader ? <TraderPortrait trader={trader} mood={traderMood} size={56} /> : undefined}
        opponentQuote={trader && isGameOver ? trader.lines[getWinner(state) === opponentPlayer ? 'win' : 'lose'][0] : null}
        viewer={localMultiplayer ? null : 0}
        onRematch={handleRematch}
        rematchLabel={trader ? `Rematch ${trader.name} · ${difficultyLabel}` : 'Rematch'}
        onMainMenu={onBackToMenu}
        record={endgameRecord}
      />
      {rematchReveal !== null && (
        <FirstPlayerReveal firstPlayer={rematchReveal} onComplete={handleRematchRevealDone} localMultiplayer={localMultiplayer} />
      )}

      {/* Resolve mega view — also stay visible during drafts when AI is picking */}
      {shouldShowResolvePanel(hasPendingInteraction, isAiTurn, state.pendingResolution?.type, spotlightActive && state.currentPlayer !== viewerPlayer) && (
        <ResolveMegaView
          verticalAlign="center"
          hand={state.players[viewerPlayer].hand}
          onMegaView={setMegaCardId}
          hideHandStrip={isHandInteraction(state.pendingResolution, viewerPlayer)}
          market={state.players[viewerPlayer].market}
        >
          <InteractionPanel state={state} dispatch={dispatch} viewerPlayer={viewerPlayer} onMegaView={setMegaCardId} />
        </ResolveMegaView>
      )}

      {/* Opponent's face-up plays, announced big and then put away */}
      <OpponentPlaySpotlight
        log={state.log}
        viewer={viewerPlayer}
        actorLabel={trader?.name ?? 'Opponent'}
        enabled={!localMultiplayer && state.phase !== 'GAME_OVER'}
        onActiveChange={setSpotlightActive}
        unobtrusive={state.currentPlayer === viewerPlayer}
        onCurrentChange={handleSpotlightCurrent}
        portrait={trader ? <TraderPortrait trader={trader} mood={traderMood} speaking={traderSpeaking} size={44} /> : undefined}
        quote={quoteForSpotlight(traderLineSaid, spotlightSince)}
      />

      <FinalTurnBanner state={state} labels={logLabels} />
      {/* hotseat: the pass-device screen already says whose turn it is */}
      <TurnSweep state={state} viewer={viewerPlayer} enabled={!localMultiplayer} />

      {/* Wares, coins and cards travel between markets, supply, gold and hands */}
      <FlightLayer
        state={state}
        viewer={viewerPlayer}
        spotlightEnabled={!localMultiplayer}
        spotlightActive={spotlightActive}
        onLand={handleFlightLand}
      />

      {/* Action log: left tab on desktop, topbar button on phones */}
      {!isPhone && !logPinned && <ActionLogButton onClick={() => setLogOpen(true)} unread={logUnread} />}
      <ActionLogDrawer
        pinned={logPinned}
        onTogglePin={isPhone ? undefined : toggleLogPin}
        open={logOpen}
        onClose={closeLog}
        log={state.log}
        labels={logLabels}
        hiddenPlayer={opponentPlayer}
        viewer={viewerPlayer}
        onMegaView={setMegaCardId}
      />

      {/* Mega view */}
      {megaCardId && (
        <MegaView cardId={megaCardId} onClose={() => setMegaCardId(null)} market={state.players[viewerPlayer].market} priceModifiers={priceModifiers} />
      )}

    </div>
  );
}
