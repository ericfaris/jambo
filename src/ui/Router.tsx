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
import { LoginModal } from './screens/LoginModal.tsx';
import { PreGameSetupModal } from './screens/PreGameSetupModal.tsx';
import { FirstPlayerReveal } from './FirstPlayerReveal.tsx';
import { TutorialOverlay } from './TutorialOverlay.tsx';
import { AvatarBadge } from './AvatarBadge.tsx';
import { useAuthSession } from './useAuthSession.ts';
import { useWebSocketGame } from '../multiplayer/client.ts';
import type { WebSocketGameState } from '../multiplayer/client.ts';
import type { AIDifficulty } from '../ai/difficulties/index.ts';
import type { RoomMode } from '../multiplayer/types.ts';
import { useGameStore } from '../hooks/useGameStore.ts';
import { extractPublicState } from '../multiplayer/stateSplitter.ts';
import { getCastSessionController } from '../cast/factory.ts';

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
  const [route, setRoute] = useState<Route>(getRoute);
  const [screen, setScreen] = useState<Screen>('menu');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('medium');
  const [pendingMode, setPendingMode] = useState<'solo' | 'multiplayer' | null>(null);
  const [showPreGameSetup, setShowPreGameSetup] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [revealFirstPlayer, setRevealFirstPlayer] = useState<0 | 1 | null>(null);
  const [pendingScreen, setPendingScreen] = useState<'solo' | 'multiplayer' | null>(null);
  const [castRoomMode, setCastRoomMode] = useState<RoomMode | null>(null);
  const [castStartError, setCastStartError] = useState<string | null>(null);
  const newGame = useGameStore((store) => store.newGame);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleMenuSelect = (option: 'login' | 'solo' | 'multiplayer' | 'settings') => {
    if (option === 'solo' || option === 'multiplayer') {
      setPendingMode(option);
      setShowPreGameSetup(true);
      setCastStartError(null);
      return;
    }
    setScreen(option);
  };

  const handleClosePreGameSetup = () => {
    setShowPreGameSetup(false);
    setPendingMode(null);
    setCastStartError(null);
  };

  const handleStartFromPreGameSetup = async ({
    castMode,
    aiDifficulty: selectedDifficulty,
  }: {
    castMode: boolean;
    aiDifficulty: AIDifficulty;
  }) => {
    if (!pendingMode) {
      return;
    }

    setShowPreGameSetup(false);
    setAiDifficulty(selectedDifficulty);
    setCastStartError(null);

    if (castMode) {
      ws.resetRoomState();
      try {
        const controller = getCastSessionController();
        if (!controller.getSession()) {
          await controller.requestSession();
        }
      } catch (error) {
        setCastStartError(error instanceof Error ? error.message : 'Failed to connect to Chromecast.');
        setShowPreGameSetup(true);
        return;
      }

      const roomMode = pendingMode === 'solo' ? 'ai' : 'pvp';
      setCastRoomMode(roomMode);
      setScreen('castHost');
      setPendingMode(null);
      return;
    }

    const firstPlayer = getRandomFirstPlayer();
    newGame(undefined, firstPlayer);
    setRevealFirstPlayer(firstPlayer);
    setPendingScreen(pendingMode);
    setPendingMode(null);
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
        <AvatarBadge avatarUrl={auth.avatarUrl} avatarLabel={auth.avatarLabel} />
      </>
    );
  }

  if (route === 'play') {
    if (ws.playerSlot !== null && ws.publicState && ws.privateState) {
      return <PlayerScreen ws={ws} />;
    }
    return (
      <>
        <CastLobby ws={ws} mode="join" aiDifficulty={aiDifficulty} roomMode={null} />
        <AvatarBadge avatarUrl={auth.avatarUrl} avatarLabel={auth.avatarLabel} />
      </>
    );
  }

  if (screen === 'menu') {
    return (
      <>
        <MainMenu
          onSelectOption={handleMenuSelect}
          onTutorial={() => setShowTutorial(true)}
          auth={auth}
        />
        {showPreGameSetup && pendingMode && (
          <PreGameSetupModal
            mode={pendingMode}
            aiDifficulty={aiDifficulty}
            onCancel={handleClosePreGameSetup}
            onStart={(options) => { void handleStartFromPreGameSetup(options); }}
            castStartError={castStartError}
          />
        )}
        <AvatarBadge avatarUrl={auth.avatarUrl} avatarLabel={auth.avatarLabel} />
        {showTutorial && <TutorialOverlay onClose={() => setShowTutorial(false)} />}
      </>
    );
  }

  if (screen === 'login') {
    return (
      <>
        <MainMenu
          onSelectOption={handleMenuSelect}
          onTutorial={() => setShowTutorial(true)}
          auth={auth}
        />
        <LoginModal onClose={() => setScreen('menu')} />
        <AvatarBadge avatarUrl={auth.avatarUrl} avatarLabel={auth.avatarLabel} />
        {showTutorial && <TutorialOverlay onClose={() => setShowTutorial(false)} />}
      </>
    );
  }

  if (screen === 'solo') {
    return <GameScreen onBackToMenu={() => setScreen('menu')} aiDifficulty={aiDifficulty} />;
  }

  if (screen === 'multiplayer') {
    return <GameScreen onBackToMenu={() => setScreen('menu')} aiDifficulty={aiDifficulty} localMultiplayer />;
  }

  if (screen === 'castHost' && castRoomMode) {
    if (ws.playerSlot !== null && ws.publicState && ws.privateState) {
      return <PlayerScreen ws={ws} />;
    }
    return (
      <>
        <CastLobby ws={ws} mode="host" aiDifficulty={aiDifficulty} roomMode={castRoomMode} />
        <AvatarBadge avatarUrl={auth.avatarUrl} avatarLabel={auth.avatarLabel} />
      </>
    );
  }

  if (screen === 'settings') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
        <AvatarBadge avatarUrl={auth.avatarUrl} avatarLabel={auth.avatarLabel} />
        <div className="etched-wood-border dialog-pop" style={{
          width: 'min(560px, 96vw)',
          borderRadius: 12,
          padding: 20,
          background: 'var(--surface)',
          color: 'var(--text)',
          textAlign: 'center',
        }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', color: 'var(--gold)', fontSize: 28, margin: '0 0 10px 0' }}>
            Settings
          </h1>
          <div style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
            Version {__APP_VERSION__}
          </div>
          <button
            onClick={() => setScreen('menu')}
            style={{
              background: 'var(--surface-accent)',
              border: '1px solid var(--border-light)',
              color: 'var(--gold)',
              borderRadius: 8,
              padding: '10px 16px',
              cursor: 'pointer',
            }}
          >
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  return null;
}
