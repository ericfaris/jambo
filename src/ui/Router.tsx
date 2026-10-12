// ============================================================================
// Simple hash-based router
// No hash -> normal app flow | /#/play -> join cast room as a player
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GameScreen } from './GameScreen.tsx';
import { CastLobby } from './CastLobby.tsx';
import { PlayerScreen } from './PlayerScreen.tsx';
import { TVScreen } from './TVScreen.tsx';
import { DevPlayerPreview, isDevPlayerMode } from './DevPlayerPreview.tsx';
import { MainMenu } from './screens/MainMenu.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { applyDocumentPreferences, readPreferences } from './preferences.ts';
import { LoginModal } from './screens/LoginModal.tsx';
import { PreGameSetupModal } from './screens/PreGameSetupModal.tsx';
import { FirstPlayerReveal } from './FirstPlayerReveal.tsx';
import { TutorialOverlay } from './TutorialOverlay.tsx';
import { AvatarBadge } from './AvatarBadge.tsx';
import { useAuthSession } from './useAuthSession.ts';
import { useWebSocketGame, readLastRoom, forgetLastRoom } from '../multiplayer/client.ts';
import type { WebSocketGameState } from '../multiplayer/client.ts';
import type { AIDifficulty } from '../ai/difficulties/index.ts';
import type { RoomMode } from '../multiplayer/types.ts';
import { useGameStore } from '../hooks/useGameStore.ts';
import { extractPublicState } from '../multiplayer/stateSplitter.ts';
import { getCastSessionController, isCastSdkEnabled } from '../cast/factory.ts';
import { JOIN_TV_HASH, readLastTrader } from './screens/landing.ts';
import { markTutorialSeen } from './tutorial/tutorial.ts';
import { traderFor } from '../ai/traders.ts';
import { loadLocalGame, isGameActiveInTab, setGameActiveInTab, describeSavedGame } from '../persistence/savedGame.ts';
import type { SavedGame } from '../persistence/savedGame.ts';
import { abandonSavedGame } from '../persistence/userStatsApi.ts';

type Route = 'local' | 'play';
type Screen = 'menu' | 'solo' | 'multiplayer' | 'login' | 'settings' | 'castHost';

function getRoute(): Route {
  const hash = window.location.hash;
  if (hash === '#/play' || hash === '#/play/') return 'play';
  return 'local';
}

function getRandomFirstPlayer(): 0 | 1 {
  return Math.random() < 0.5 ? 0 : 1;
}

function isDevTVMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('tv') === '1';
}

/** Dev-only: renders TVScreen using local game store state (no server needed). */
function DevTVPreview() {
  const gameState = useGameStore((store) => store.state);
  const publicState = useMemo(() => {
    const pub = extractPublicState(gameState);
    // Inject dummy data so we can preview all element sizes
    pub.players[0].market = ['trinkets', 'hides', 'tea', null, 'silk', null, 'fruit', 'salt', null];
    pub.players[0].utilities = [
      { cardId: 'well_1', designId: 'well', usedThisTurn: false },
      { cardId: 'drums_1', designId: 'drums', usedThisTurn: false },
      { cardId: 'throne_1', designId: 'throne', usedThisTurn: true },
    ];
    pub.players[0].gold = 35;
    pub.players[1].market = ['fruit', null, 'salt', 'trinkets', null, null];
    pub.players[1].utilities = [
      { cardId: 'boat_1', designId: 'boat', usedThisTurn: false },
      { cardId: 'scale_1', designId: 'scale', usedThisTurn: false },
    ];
    pub.players[1].gold = 28;
    return pub;
  }, [gameState]);

  const mockWs: WebSocketGameState = useMemo(() => ({
    connected: true,
    roomCode: 'DEV',
    castAccessToken: null,
    playerSlot: null,
    roomMode: 'ai',
    publicState,
    privateState: null,
    audioEvent: null,
    aiMessage: null,
    error: null,
    gameOver: gameState.phase === 'GAME_OVER',
    playerJoined: null,
    playerDisconnected: null,
    rematchVotes: [],
    rematchRequired: [],
    createRoom: () => {},
    joinRoom: () => {},
    resetRoomState: () => {},
    sendAction: () => {},
    requestRematch: () => {},
    clearError: () => {},
    clearAudioEvent: () => {},
  }), [publicState, gameState.phase]);

  return <TVScreen ws={mockWs} />;
}

export function Router() {
  // Dev mode: ?tv=1 renders the TV view with local game state (no server needed)
  if (isDevTVMode()) {
    return <DevTVPreview />;
  }

  // Dev mode: ?player=1 renders the phone PlayerScreen with local game state
  if (isDevPlayerMode()) {
    return <DevPlayerPreview />;
  }

  return <RouterInner />;
}

function RouterInner() {
  const ws = useWebSocketGame();
  const auth = useAuthSession();
  // High contrast, motion and pace apply from the first screen, not just in-game
  useEffect(() => { applyDocumentPreferences(readPreferences()); }, []);
  const [route, setRoute] = useState<Route>(getRoute);
  // A refresh mid-game in this tab drops straight back into the autosaved
  // game; a fresh visit offers "Resume game" on the menu instead.
  const [autoResume] = useState<SavedGame | null>(() => {
    const saved = getRoute() === 'local' && isGameActiveInTab() ? loadLocalGame() : null;
    if (saved) useGameStore.getState().restore(saved);
    return saved;
  });
  const [screen, setScreen] = useState<Screen>(autoResume ? autoResume.mode : 'menu');
  const handleBackFromSettings = useCallback(() => setScreen('menu'), []);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(autoResume?.aiDifficulty ?? 'medium');
  const [savedGame, setSavedGame] = useState<SavedGame | null>(() => autoResume ?? loadLocalGame());
  const [showTvSetup, setShowTvSetup] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [revealFirstPlayer, setRevealFirstPlayer] = useState<0 | 1 | null>(null);
  const [pendingScreen, setPendingScreen] = useState<'solo' | 'multiplayer' | null>(null);
  const [castRoomMode, setCastRoomMode] = useState<RoomMode | null>(null);
  const [castStartError, setCastStartError] = useState<string | null>(null);
  const newGame = useGameStore((store) => store.newGame);
  const restoreGame = useGameStore((store) => store.restore);

  const handleBackToMenu = useCallback(() => {
    setGameActiveInTab(false);
    setSavedGame(loadLocalGame());
    setScreen('menu');
  }, []);

  const handleAbandonSaved = useCallback(() => {
    abandonSavedGame();
    setSavedGame(null);
  }, []);

  const handleResume = useCallback(() => {
    const saved = loadLocalGame();
    if (!saved) {
      setSavedGame(null);
      return;
    }
    restoreGame(saved);
    setAiDifficulty(saved.aiDifficulty);
    setScreen(saved.mode);
  }, [restoreGame]);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleMenuSelect = (option: 'login' | 'settings') => setScreen(option);

  /** Solo vs a trader, or pass-and-play: straight from the landing page. */
  const startLocalGame = (mode: 'solo' | 'multiplayer', difficulty: AIDifficulty) => {
    setAiDifficulty(difficulty);
    // A new local game overwrites the save, so an unfinished one counts as abandoned
    // (the landing page asks before this when a save exists)
    abandonSavedGame();
    setSavedGame(null);
    const firstPlayer = getRandomFirstPlayer();
    newGame(undefined, firstPlayer);
    setRevealFirstPlayer(firstPlayer);
    setPendingScreen(mode);
  };

  const handleOpenTvSetup = () => {
    setCastStartError(null);
    setShowTvSetup(true);
  };

  const handleStartOnTv = async ({ roomMode, aiDifficulty: selectedDifficulty }: { roomMode: RoomMode; aiDifficulty: AIDifficulty }) => {
    setShowTvSetup(false);
    setAiDifficulty(selectedDifficulty);
    setCastStartError(null);
    ws.resetRoomState();
    try {
      const controller = getCastSessionController();
      if (!controller.getSession()) {
        await controller.requestSession();
      }
    } catch (error) {
      setCastStartError(error instanceof Error ? error.message : 'Failed to connect to Chromecast.');
      setShowTvSetup(true);
      return;
    }
    setCastRoomMode(roomMode);
    setScreen('castHost');
  };

  const handleRevealComplete = useCallback(() => {
    if (pendingScreen) {
      setScreen(pendingScreen);
    }
    setRevealFirstPlayer(null);
    setPendingScreen(null);
  }, [pendingScreen]);

  if (revealFirstPlayer !== null) {
    return (
      <>
        <FirstPlayerReveal
          firstPlayer={revealFirstPlayer}
          onComplete={handleRevealComplete}
          localMultiplayer={pendingScreen === 'multiplayer'}
        />
        <AvatarBadge avatarUrl={auth.avatarUrl} />
      </>
    );
  }

  // While the remembered Cast room is being rejoined, say so instead of
  // flashing the menu / code entry (and invite a mid-rejoin click elsewhere).
  const rejoining = ws.roomCode !== null && ws.playerSlot === null && !ws.error && readLastRoom() !== null
    && (route === 'play' || screen === 'menu');
  if (rejoining) {
    return (
      <div className="main-menu-root">
        <div className="main-menu-content dialog-pop">
          <div className="main-menu-label">Room {ws.roomCode}</div>
          <div className="main-menu-title" style={{ fontSize: 32 }}>Rejoining your game…</div>
          <div className="main-menu-actions">
            <button
              className="menu-action menu-action-subtle"
              onClick={() => { forgetLastRoom(); ws.resetRoomState(); }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // A refreshed Cast host (or player) tab rejoins its room automatically
  // (multiplayer/client.ts); show the game as soon as its state arrives.
  if (route === 'local' && screen === 'menu' && ws.playerSlot !== null && ws.publicState && ws.privateState) {
    return <PlayerScreen ws={ws} />;
  }

  if (route === 'play') {
    if (ws.playerSlot !== null && ws.publicState && ws.privateState) {
      return <PlayerScreen ws={ws} />;
    }
    return (
      <>
        <CastLobby ws={ws} mode="join" aiDifficulty={aiDifficulty} roomMode={null} />
        <AvatarBadge avatarUrl={auth.avatarUrl} />
      </>
    );
  }

  if (screen === 'menu' || screen === 'login') {
    const overlayOpen = screen === 'login' || showTvSetup || showTutorial;
    return (
      <>
        <MainMenu
          onSelectOption={handleMenuSelect}
          onPlayTrader={(difficulty) => startLocalGame('solo', difficulty)}
          onPassAndPlay={() => startLocalGame('multiplayer', aiDifficulty)}
          onPlayOnTv={isCastSdkEnabled() ? handleOpenTvSetup : undefined}
          onJoinTv={() => { window.location.hash = JOIN_TV_HASH; }}
          onTutorial={() => setShowTutorial(true)}
          auth={auth}
          resumeLabel={savedGame ? describeSavedGame(savedGame) : null}
          onResume={handleResume}
          onAbandon={handleAbandonSaved}
          dimmed={overlayOpen}
        />
        {showTvSetup && (
          <PreGameSetupModal
            aiDifficulty={aiDifficulty}
            onCancel={() => { setShowTvSetup(false); setCastStartError(null); }}
            onStart={(options) => { void handleStartOnTv(options); }}
            castStartError={castStartError}
          />
        )}
        {screen === 'login' && <LoginModal onClose={() => setScreen('menu')} />}
        {showTutorial && (
          <TutorialOverlay
            onClose={() => { markTutorialSeen(); setShowTutorial(false); }}
            // Straight from the lesson into a game — unless that would overwrite a saved one
            {...(savedGame ? { finishLabel: 'Done' } : {
              finishLabel: `Play vs ${traderFor(readLastTrader()).name}`,
              onFinish: () => { markTutorialSeen(); setShowTutorial(false); startLocalGame('solo', readLastTrader()); },
            })}
          />
        )}
      </>
    );
  }

  if (screen === 'solo') {
    return <GameScreen onBackToMenu={handleBackToMenu} aiDifficulty={aiDifficulty} />;
  }

  if (screen === 'multiplayer') {
    return <GameScreen onBackToMenu={handleBackToMenu} aiDifficulty={aiDifficulty} localMultiplayer />;
  }

  if (screen === 'castHost' && castRoomMode) {
    if (ws.playerSlot !== null && ws.publicState && ws.privateState) {
      return <PlayerScreen ws={ws} />;
    }
    return (
      <>
        <CastLobby ws={ws} mode="host" aiDifficulty={aiDifficulty} roomMode={castRoomMode} />
        <AvatarBadge avatarUrl={auth.avatarUrl} />
      </>
    );
  }

  if (screen === 'settings') {
    return <SettingsScreen onBack={handleBackFromSettings} />;
  }

  return null;
}
