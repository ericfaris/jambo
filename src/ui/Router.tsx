// ============================================================================
// Simple hash-based router
// No hash -> normal app flow | /#/play -> join cast room as a player
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { GameScreen } from './GameScreen.tsx';
import { CastLobby } from './CastLobby.tsx';
import { PlayerScreen } from './PlayerScreen.tsx';
import { OnlineGameScreen } from './OnlineGameScreen.tsx';
import { FriendLobby } from './FriendLobby.tsx';
import { parseInviteHash, homeUrl } from './friendRoute.ts';
import { DevTVPreview, isDevTVMode } from './DevTVPreview.tsx';
import { DevPlayerPreview, isDevPlayerMode } from './DevPlayerPreview.tsx';
import { DevOnlinePreview, isDevOnlineMode } from './DevOnlinePreview.tsx';
import { MainMenu } from './screens/MainMenu.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { applyDocumentPreferences, readPreferences } from './preferences.ts';
import { LoginModal } from './screens/LoginModal.tsx';
import type { AuthNotice } from './screens/LoginModal.tsx';
import { ChooseUsernameDialog, ResetPasswordDialog } from './auth/AccountLinkDialogs.tsx';
import { authApi, describeGoogleOutcome } from './auth/authApi.ts';
import { PreGameSetupModal } from './screens/PreGameSetupModal.tsx';
import { FirstPlayerReveal } from './FirstPlayerReveal.tsx';
import { TutorialOverlay } from './TutorialOverlay.tsx';
import { AvatarBadge } from './AvatarBadge.tsx';
import { useAuthSession } from './useAuthSession.ts';
import { useWebSocketGame, readLastRoom, forgetLastRoom } from '../multiplayer/client.ts';
import type { AIDifficulty } from '../ai/difficulties/index.ts';
import type { RoomMode } from '../multiplayer/types.ts';
import { useGameStore } from '../hooks/useGameStore.ts';
import { getCastSessionController, isCastSdkEnabled } from '../cast/factory.ts';
import { JOIN_TV_HASH, readLastTrader } from './screens/landing.ts';
import { markTutorialSeen } from './tutorial/tutorial.ts';
import { traderFor } from '../ai/traders.ts';
import { loadLocalGame, isGameActiveInTab, setGameActiveInTab, describeSavedGame } from '../persistence/savedGame.ts';
import type { SavedGame } from '../persistence/savedGame.ts';
import { abandonSavedGame } from '../persistence/userStatsApi.ts';

type Route = 'local' | 'play' | 'invite';
type Screen = 'menu' | 'solo' | 'multiplayer' | 'login' | 'settings' | 'castHost' | 'friendHost';

function getRoute(): Route {
  const hash = window.location.hash;
  if (hash === '#/play' || hash === '#/play/') return 'play';
  if (parseInviteHash(hash)) return 'invite';
  return 'local';
}

/** Leave every room behind and load the landing page fresh (no hash). */
function goHome(): void {
  forgetLastRoom();
  window.location.href = homeUrl(window.location);
}

const LANDING_PARAMS = ['auth', 'verify', 'reset'] as const;

/** What a Google redirect (?auth=), confirmation (?verify=) or reset (?reset=) link brought. */
function readLandingParams(): { authStatus: string | null; verifyToken: string | null; reset: string | null } {
  const params = new URL(window.location.href).searchParams;
  return { authStatus: params.get('auth'), verifyToken: params.get('verify'), reset: params.get('reset') };
}

function getRandomFirstPlayer(): 0 | 1 {
  return Math.random() < 0.5 ? 0 : 1;
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

  // Dev mode: ?online=1 renders the online (friend) board with local game state
  if (isDevOnlineMode()) {
    return <DevOnlinePreview />;
  }

  return <RouterInner />;
}

function RouterInner() {
  const ws = useWebSocketGame();
  const auth = useAuthSession();
  // High contrast, motion and pace apply from the first screen, not just in-game
  useEffect(() => { applyDocumentPreferences(readPreferences()); }, []);
  const [route, setRoute] = useState<Route>(getRoute);
  const [inviteCode, setInviteCode] = useState<string | null>(() => parseInviteHash(window.location.hash));
  // A refresh mid-game in this tab drops straight back into the autosaved
  // game; a fresh visit offers "Resume game" on the menu instead.
  const [autoResume] = useState<SavedGame | null>(() => {
    const saved = getRoute() === 'local' && isGameActiveInTab() ? loadLocalGame() : null;
    if (saved) useGameStore.getState().restore(saved);
    return saved;
  });
  // Landing from a Google redirect, an email confirmation or a password-reset
  // link: read once on load (the effect below strips it from the address bar)
  const [landing] = useState(() => {
    const params = readLandingParams();
    return { ...params, googleOutcome: params.authStatus ? describeGoogleOutcome(params.authStatus) : null };
  });
  const [screen, setScreen] = useState<Screen>(landing.googleOutcome ? 'login' : autoResume ? autoResume.mode : 'menu');
  const handleBackFromSettings = useCallback(() => setScreen('menu'), []);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(autoResume?.aiDifficulty ?? 'medium');
  const [savedGame, setSavedGame] = useState<SavedGame | null>(() => autoResume ?? loadLocalGame());
  const [showTvSetup, setShowTvSetup] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [revealFirstPlayer, setRevealFirstPlayer] = useState<0 | 1 | null>(null);
  const [pendingScreen, setPendingScreen] = useState<'solo' | 'multiplayer' | null>(null);
  const [castRoomMode, setCastRoomMode] = useState<RoomMode | null>(null);
  const [castStartError, setCastStartError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<AuthNotice | null>(landing.googleOutcome);
  const [resetToken, setResetToken] = useState<string | null>(landing.reset);
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

  // The landing link (above) is acted on once, then stripped from the address
  // bar so a refresh or a shared URL doesn't replay it.
  const { refresh: refreshAuth } = auth;
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!LANDING_PARAMS.some((key) => url.searchParams.has(key))) return;
    const verifyToken = url.searchParams.get('verify');
    for (const key of LANDING_PARAMS) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, '', url.toString());

    if (verifyToken) {
      void authApi.verifyEmail(verifyToken).then((result) => {
        setAuthNotice(result.ok
          ? { message: 'Email confirmed — your account is all set.', isError: false }
          : { message: result.error ?? 'That confirmation link is invalid or has expired.', isError: true });
        setScreen('login');
        void refreshAuth();
      });
    }
  }, [refreshAuth]);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getRoute());
      setInviteCode(parseInviteHash(window.location.hash));
    };
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

  const handlePlayFriend = () => {
    ws.resetRoomState();
    setScreen('friendHost');
  };

  // Warm the Cast SDK up front so the TV is already discovered when the
  // device picker opens (see WebCastSessionController.prepare)
  useEffect(() => {
    if (isCastSdkEnabled()) void getCastSessionController().prepare().catch(() => {});
  }, []);

  const handleOpenTvSetup = () => {
    void getCastSessionController().prepare().catch(() => {});
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
    && (route === 'play' || route === 'invite' || screen === 'menu');
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

  // The room's kind (from the server), not the URL, picks the board: a
  // friend game gets the full table, a Cast game the phone controller.
  const inRoomGame = ws.playerSlot !== null && !!ws.publicState && !!ws.privateState;
  const renderRoomBoard = () => (ws.roomKind === 'friend'
    ? <OnlineGameScreen ws={ws} onLeftToMenu={goHome} />
    : <PlayerScreen ws={ws} />);
  const signedIn = !!auth.authUser;

  // A refreshed host (Cast or friend) or player tab rejoins its room
  // automatically (multiplayer/client.ts); show the game as soon as its
  // state arrives — or, for a friend room still waiting, the lobby again.
  if (route === 'local' && screen === 'menu') {
    if (inRoomGame) return renderRoomBoard();
    if (ws.roomKind === 'friend' && ws.playerSlot !== null) {
      return <FriendLobby ws={ws} mode="host" signedIn={signedIn} onExit={goHome} />;
    }
  }

  if (route === 'invite') {
    if (inRoomGame) return renderRoomBoard();
    return (
      <>
        <FriendLobby ws={ws} mode="join" inviteCode={inviteCode} signedIn={signedIn} onExit={goHome} />
        <AvatarBadge avatarUrl={auth.avatarUrl} />
      </>
    );
  }

  if (route === 'play') {
    if (inRoomGame) return renderRoomBoard();
    return (
      <>
        <CastLobby ws={ws} mode="join" aiDifficulty={aiDifficulty} roomMode={null} />
        <AvatarBadge avatarUrl={auth.avatarUrl} />
      </>
    );
  }

  if (screen === 'menu' || screen === 'login') {
    const needsUsername = !!auth.authUser?.needsUsername && !resetToken;
    const overlayOpen = screen === 'login' || showTvSetup || showTutorial || !!resetToken || needsUsername;
    return (
      <>
        <MainMenu
          onSelectOption={handleMenuSelect}
          onPlayTrader={(difficulty) => startLocalGame('solo', difficulty)}
          onPassAndPlay={() => startLocalGame('multiplayer', aiDifficulty)}
          onPlayFriend={handlePlayFriend}
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
        {screen === 'login' && !resetToken && !needsUsername && (
          <LoginModal auth={auth} notice={authNotice} onClose={() => { setAuthNotice(null); setScreen('menu'); }} />
        )}
        {resetToken && (
          <ResetPasswordDialog
            token={resetToken}
            onClose={() => setResetToken(null)}
            onDone={() => {
              setResetToken(null);
              setAuthNotice(null);
              setScreen('login');
              void auth.refresh();
            }}
          />
        )}
        {needsUsername && auth.authUser && (
          <ChooseUsernameDialog
            user={auth.authUser}
            onSaved={() => void auth.refresh()}
            onSignOut={() => void auth.logout()}
          />
        )}
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

  if (screen === 'friendHost') {
    if (inRoomGame) return renderRoomBoard();
    return (
      <>
        <FriendLobby ws={ws} mode="host" signedIn={signedIn} onExit={goHome} />
        <AvatarBadge avatarUrl={auth.avatarUrl} />
      </>
    );
  }

  if (screen === 'castHost' && castRoomMode) {
    if (inRoomGame) return renderRoomBoard();
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
