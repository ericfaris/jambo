import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { validatePlayCard, validateActivateUtility } from '../engine/validation/actionValidator.ts';
import type { DeckCardId, GameAction, GameState } from '../engine/types.ts';
import type { Trader, TraderMood } from '../ai/traders.ts';
import type { OnlineSeatView } from '../multiplayer/types.ts';
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
import type { GameStory } from './gameStory.ts';
import { TraderPortrait } from './TraderPortrait.tsx';
import { PlayerAvatar } from './PlayerAvatar.tsx';
import { SeatInfo } from './SeatInfo.tsx';
import { TableauCorners } from './Tableau.tsx';
import { ResolveMegaView } from './ResolveMegaView.tsx';
import { isHandInteraction } from './HandReferenceStrip.tsx';
import { MegaView } from './MegaView.tsx';
import { ActionPips, AmbientLayer, GoldCount } from './life.tsx';
import { isWareDialogValid, shouldShowResolvePanel, quoteForSpotlight } from './gameScreenLogic.ts';
import type { TraderLine } from './gameScreenLogic.ts';
import { useVisualFeedback } from './useVisualFeedback.ts';
import { getDrawDisabledReason, getPlayDisabledReason, friendlyPlayError } from './uiHints.ts';
import { usePreferences, isDevMode } from './preferences.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { GameMenuShell } from './GameMenuShell.tsx';
import { useAuthSession } from './useAuthSession.ts';
import { playSfx } from './useAudioEvents.ts';
import type { Flight } from './flights.ts';
import { useMediaQuery, PHONE_MEDIA_QUERY, SHORT_DESKTOP_MEDIA_QUERY } from './useMediaQuery.ts';
import { useElementSize } from './useElementSize.ts';
import { fitCardsToBox, fitMarketSlots } from './fitLayout.ts';
import { useCornerButtonInset } from './cornerClearance.ts';
import { viewerPriceModifiers } from './WareCoin.tsx';

/** Who sits across the table. */
export type OpponentSeat =
  /** Solo: a named trader with a face, moods and a voice. */
  | {
      kind: 'trader';
      trader: Trader;
      mood: TraderMood;
      speaking: boolean;
      /** Title · difficulty, under the name. */
      subtitle: string;
      /** What the trader is saying in the speech bubble ('' = nothing). */
      bubble: string;
      onBubbleHide: () => void;
      /** The trader's latest voiced line — captions the spotlight while fresh. */
      line: TraderLine | null;
      /** Said on the endgame card. */
      endQuote: string | null;
    }
  /** Online: a friend — their name and avatar, and whether they're still here. */
  | { kind: 'human'; name: string; avatarUrl: string | null; presence: OnlineSeatView | null; presenceNow: number }
  /** Pass and play: the other player is on this device. */
  | { kind: 'hotseat' };

export interface GameBoardProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
  /** The seat this screen belongs to. */
  viewer: 0 | 1;
  mode: 'solo' | 'hotseat' | 'online';
  /** Who must act next; null at GAME_OVER. */
  responder: 0 | 1 | null;
  /** A resolution or reaction window is open (online: from the public view). */
  hasPendingInteraction: boolean;
  /** Online: the server's word on cancelling; local: derived from the state. */
  canCancel?: boolean;
  /** Seat-indexed names; the viewer's is 'You' (hotseat: 'Player N'). */
  labels: readonly [string, string];
  opponent: OpponentSeat;
  /** Online: what the friend is doing while they hold the decision. */
  waitingHint?: string | null;
  /** Shown instead of the table (tutorial, pass-device) — board state persists. */
  cover?: ReactNode;
  /** Rendered last inside the root (coin toss, presence banner, left overlay). */
  overlays?: ReactNode;
  endgame: {
    story: GameStory | null;
    onRematch: () => void;
    rematchLabel: string;
    rematchStatus?: string | null;
    rematchDisabled?: boolean;
    onMainMenu?: () => void;
    record: { wins: number; losses: number } | null;
  };
  menu: {
    actions: (close: () => void) => ReactNode;
    tools?: (close: () => void) => ReactNode;
    stats?: ReactNode;
    levels?: ReactNode;
    error?: string | null;
    showAiOptions: boolean;
    onLoggedOut?: () => void;
  };
  /** Errors from outside the board (online: the server) — shown like a play error. */
  externalError?: { message: string; key: number } | null;
  onSpotlightActiveChange?: (active: boolean) => void;
}

function opponentPortraitFor(opponent: OpponentSeat, size: number, isActive = false): ReactNode {
  if (opponent.kind === 'trader') return <TraderPortrait trader={opponent.trader} mood={opponent.mood} speaking={opponent.speaking} size={size} />;
  if (opponent.kind === 'human') return <PlayerAvatar avatarUrl={opponent.avatarUrl} size={size} active={isActive} label={opponent.name} />;
  return undefined;
}

export function GameBoard({
  state, dispatch, viewer: viewerPlayer, mode, responder, hasPendingInteraction, canCancel, labels, opponent,
  waitingHint = null, cover, overlays, endgame, menu, externalError = null, onSpotlightActiveChange,
}: GameBoardProps) {
  const localMultiplayer = mode === 'hotseat';
  const [wareDialog, setWareDialog] = useState<DeckCardId | null>(null);
  // Settings — shared with the main menu's Settings screen (preferences.ts)
  const preferences = usePreferences();
  const { prefs, setPref, resetPrefs } = preferences;
  const { devTelemetry: showDevTelemetry, uxDebug: showUxDebug } = prefs;
  const logPinnedPref = prefs.logPinned;
  const [logOpen, setLogOpen] = useState(false);
  // Log length when the drawer was last open — newer opponent entries are "unread"
  const [logSeenLength, setLogSeenLength] = useState(() => state.log.length);
  const [spotlightActive, setSpotlightActiveState] = useState(false);
  const setSpotlightActive = useCallback((active: boolean) => {
    setSpotlightActiveState(active);
    onSpotlightActiveChange?.(active);
  }, [onSpotlightActiveChange]);
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
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const [drawModalOpen, setDrawModalOpen] = useState(false);
  const [cardError, setCardError] = useState<{cardId: DeckCardId, message: string} | null>(null);
  const [megaCardId, setMegaCardId] = useState<DeckCardId | null>(null);
  const { authUser, authError, avatarUrl, logout: authLogout } = useAuthSession();
  const [topPanelRef, cornerInset] = useCornerButtonInset<HTMLDivElement>();
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
  const pendingSecondsRef = useRef(0);
  const blockedPlaySecondsRef = useRef(0);
  const blockedDrawSecondsRef = useRef(0);
  // Wise Man: your ware coins show this turn's prices
  const priceModifiers = viewerPriceModifiers(state.turnModifiers, state.currentPlayer, viewerPlayer);
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

  const handleLogout = useCallback(async () => {
    await authLogout();
    setMenuOpen(false);
    menu.onLoggedOut?.();
  }, [authLogout, menu.onLoggedOut]);

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

  // Is the other side (the AI, or the friend online) the one to act?
  const isAiTurn = mode !== 'hotseat' && responder !== null && responder !== viewerPlayer;

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

  // A server error (online) shows in the same toast as a play error, then fades
  const [shownExternalError, setShownExternalError] = useState<{ message: string; key: number } | null>(null);
  useEffect(() => {
    if (!externalError) return;
    setShownExternalError(externalError);
    const timer = setTimeout(() => setShownExternalError((current) => (current?.key === externalError.key ? null : current)), 5000);
    return () => clearTimeout(timer);
  }, [externalError]);

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
  // Online: the disabled reasons name the friend ("Waiting for Sam…")
  const opponentLabel = mode === 'online' ? labels[opponentPlayer] : undefined;
  const playDisabledReason = getPlayDisabledReason({
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    viewerPlayer,
    actionsLeft: state.actionsLeft,
    hasPendingInteraction,
    isAiTurn,
    opponentLabel,
  });
  const drawDisabledReason = getDrawDisabledReason({
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    viewerPlayer,
    isAiTurn,
    opponentLabel,
  });

  const lastLog = state.log.length > 0 ? state.log[state.log.length - 1] : null;
  const isGameOver = state.phase === 'GAME_OVER';
  // (online, a resolution the friend is answering is hidden from this view —
  //  nothing in hand is playable then, so nothing is dimmed)
  const handHints = hasPendingInteraction ? null : computeHandHints(state, viewerPlayer);
  const utilityHints = computeUtilityHints(state, viewerPlayer);
  const turnBonus = endTurnBonus(state.actionsLeft);
  const supplyAlert = supplyWareFromError(cardError?.message);
  const logLabels = labels;
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

  const resetUiPrefs = useCallback(() => {
    resetPrefs();
    setTelemetryEvents([]);
    setUxDebugCounts({ longPending: 0, blockedPlay: 0, blockedDraw: 0 });
    pendingSecondsRef.current = 0;
    blockedPlaySecondsRef.current = 0;
    blockedDrawSecondsRef.current = 0;
  }, [resetPrefs]);

  // The tutorial (solo) or the pass-device screen (hotseat) covers the whole
  // table; everything above keeps its state for when the table comes back
  if (cover) {
    return <>{cover}</>;
  }

  const seatTitle = (seat: 0 | 1) => (localMultiplayer ? `Player ${seat + 1}` : 'You');
  const opponentBubble = opponent.kind === 'trader' && !isGameOver && !spotlightActive ? opponent.bubble : '';
  const onOpponentBubbleHide = opponent.kind === 'trader' ? opponent.onBubbleHide : undefined;
  const opponentSubtitle = opponent.kind === 'trader' ? opponent.subtitle : undefined;
  const hintText = waitingHint ?? (playActionsDisabled && state.phase === 'PLAY' ? playDisabledReason : null);
  const toast = shownExternalError ?? null;

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
        const opponentState = state.players[opponentPlayer];
        const HEAD_PX = 20;
        const GAP_PX = 6;
        const innerW = Math.max(0, phoneBoardSize.width - 16);
        const innerH = Math.max(0, phoneBoardSize.height - 16);
        const oppMarket = fitMarketSlots(opponentState.market.length, innerW, { maxSlot: 26, minSlot: 20 });
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
                <span>{seatTitle(viewerPlayer)}{isMyTurnNow ? ' · your turn' : ''}</span>
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
                player={opponentState}
                aiMessage={opponentBubble}
                onMessageHide={onOpponentBubbleHide}
                goldDelta={visualFeedback.goldDeltas[opponentPlayer]}
                marketFlashSlots={visualFeedback.marketFlashSlots[opponentPlayer]}
                label={opponent.kind === 'trader' ? opponent.trader.name : opponent.kind === 'human' ? opponent.name : `Player ${opponentPlayer + 1}`}
                compactPortrait={opponentPortraitFor(opponent, 26)}
                isActive={state.currentPlayer === opponentPlayer}
                onMegaView={setMegaCardId}
                slotSize={oppMarket.slotSize}
                marketColumns={oppMarket.rows > 1 ? oppMarket.columns : undefined}
              />
            </div>

            <CenterRow compact state={state} dispatch={dispatch} isLocalMode={true} showGlow={false} visualFeedback={visualFeedback} actorLabels={logLabels} hiddenPlayer={opponentPlayer} spotlitPlayer={localMultiplayer ? null : opponentPlayer} heldDiscardCard={spotlitDiscard} viewer={viewerPlayer} />
            <WareSupply supply={state.wareSupply} compact highlight={supplyAlert} />

            {hintText && (
              <div className={`disabled-hint${waitingHint ? ' waiting-hint' : ''}`} style={{ marginBottom: 0, flexShrink: 0 }} role={waitingHint ? 'status' : undefined}>
                {hintText}
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
            {!cardError && toast && (
              <div className="player-toast" role="alert" key={`ext-${toast.key}`}>
                {toast.message}
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
            aiMessage={opponentBubble}
            onMessageHide={onOpponentBubbleHide}
            goldDelta={visualFeedback.goldDeltas[opponentPlayer]}
            marketFlashSlots={visualFeedback.marketFlashSlots[opponentPlayer]}
            label={opponent.kind === 'trader' ? opponent.trader.name : opponent.kind === 'human' ? opponent.name : `Opponent (Player ${opponentPlayer + 1})`}
            subtitle={opponentSubtitle}
            portrait={opponentPortraitFor(opponent, 72, state.currentPlayer === opponentPlayer)}
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
            viewer={viewerPlayer}
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
              label={`${seatTitle(viewerPlayer)}${state.currentPlayer === viewerPlayer ? ' · your turn' : ''}`}
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

        {hintText && (
          <div className={`disabled-hint${waitingHint ? ' waiting-hint' : ''}`} role={waitingHint ? 'status' : undefined}>
            {hintText}
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
        {toast && (
          <div className="player-toast board-toast" role="alert" key={`ext-${toast.key}`}>
            {toast.message}
          </div>
        )}
      </div>
      )}

      {/* Profile & settings menu */}
      <div ref={menuRef} style={{ position: 'fixed', top: 12, right: 16, zIndex: 50 }}>
        <GameMenuShell
          open={menuOpen}
          onToggle={() => setMenuOpen(prev => !prev)}
          avatarUrl={avatarUrl}
          authUser={authUser}
          authError={authError ?? menu.error ?? null}
          onLogout={() => void handleLogout()}
          stats={menu.stats}
          levels={menu.levels}
          actions={menu.actions(closeMenu)}
          tools={menu.tools?.(closeMenu)}
        >
          <SettingsPanel
            {...preferences}
            resetPrefs={resetUiPrefs}
            showAiOptions={menu.showAiOptions}
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
        story={endgame.story}
        labels={logLabels}
        playerPortrait={opponent.kind === 'hotseat' ? undefined : <PlayerAvatar avatarUrl={avatarUrl} size={56} />}
        opponentPortrait={opponent.kind === 'trader'
          ? <TraderPortrait trader={opponent.trader} mood={opponent.mood} size={56} />
          : opponent.kind === 'human' ? <PlayerAvatar avatarUrl={opponent.avatarUrl} size={56} label={opponent.name} /> : undefined}
        opponentQuote={opponent.kind === 'trader' && isGameOver ? opponent.endQuote : null}
        viewer={localMultiplayer ? null : viewerPlayer}
        onRematch={endgame.onRematch}
        rematchLabel={endgame.rematchLabel}
        rematchStatus={endgame.rematchStatus}
        rematchDisabled={endgame.rematchDisabled}
        onMainMenu={endgame.onMainMenu}
        record={endgame.record}
      />

      {/* Resolve mega view — also stay visible during drafts when AI is picking */}
      {shouldShowResolvePanel(hasPendingInteraction, isAiTurn, state.pendingResolution?.type, spotlightActive && state.currentPlayer !== viewerPlayer) && (
        <ResolveMegaView
          verticalAlign="center"
          hand={state.players[viewerPlayer].hand}
          onMegaView={setMegaCardId}
          hideHandStrip={isHandInteraction(state.pendingResolution, viewerPlayer)}
          market={state.players[viewerPlayer].market}
        >
          <InteractionPanel state={state} dispatch={dispatch} viewerPlayer={viewerPlayer} onMegaView={setMegaCardId} canCancel={canCancel} />
        </ResolveMegaView>
      )}

      {/* Opponent's face-up plays, announced big and then put away */}
      <OpponentPlaySpotlight
        log={state.log}
        viewer={viewerPlayer}
        actorLabel={opponent.kind === 'trader' ? opponent.trader.name : opponent.kind === 'human' ? opponent.name : 'Opponent'}
        enabled={!localMultiplayer && state.phase !== 'GAME_OVER'}
        onActiveChange={setSpotlightActive}
        unobtrusive={state.currentPlayer === viewerPlayer}
        onCurrentChange={handleSpotlightCurrent}
        portrait={opponent.kind === 'hotseat' ? undefined : opponentPortraitFor(opponent, 44)}
        quote={opponent.kind === 'trader' ? quoteForSpotlight(opponent.line, spotlightSince) : null}
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

      {overlays}
    </div>
  );
}
