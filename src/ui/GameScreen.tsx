import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useGameStore } from '../hooks/useGameStore.ts';
import { getAiActionByDifficulty } from '../ai/difficulties/index.ts';
import type { AIDifficulty } from '../ai/difficulties/index.ts';
import { getAiActionDescription } from '../ai/aiActionDescriptions.ts';
import type { GameAction } from '../engine/types.ts';
import { getResponder } from '../engine/responder.ts';
import { FirstPlayerReveal } from './FirstPlayerReveal.tsx';
import { buildGameStory } from './gameStory.ts';
import { createStartingState } from '../persistence/replayLog.ts';
import { traderFor } from '../ai/traders.ts';
import { traderChatter } from '../ai/traderChatter.ts';
import { useTrader } from './useTrader.ts';
import { TutorialOverlay } from './TutorialOverlay.tsx';
import { hasSeenTutorial, markTutorialSeen } from './tutorial/tutorial.ts';
import { PassDeviceScreen, needsHandoff } from './PassDeviceScreen.tsx';
import { shouldAiAct, aiActionDelayMs } from './gameScreenLogic.ts';
import type { TraderLine } from './gameScreenLogic.ts';
import { usePreferences } from './preferences.ts';
import { fetchUserStatsSummary, fetchDifficultyBreakdown, recordCompletedGame, recordAbandonedGame, abandonedGamePayload } from '../persistence/userStatsApi.ts';
import type { UserStatsSummary, DifficultyBreakdown } from '../persistence/userStatsApi.ts';
import { getWinner, getFinalScores } from '../engine/endgame/EndgameManager.ts';
import { useLocalActionAudio } from './useAudioEvents.ts';
import { saveLocalGame, setGameActiveInTab, clearLocalGame } from '../persistence/savedGame.ts';
import { ConfirmButton } from './ConfirmButton.tsx';
import { GameBoard } from './GameBoard.tsx';
import type { OpponentSeat } from './GameBoard.tsx';

const HOTSEAT_LABELS = ['Player 1', 'Player 2'] as const;
/** A trader's line stays on screen this long. */
const TRADER_LINE_MS = 4500;

/**
 * A local game — solo vs a trader, or pass-and-play on one device. Owns the
 * store, the AI, autosave, stats and the trader; the table itself is the
 * shared GameBoard (the online friend game renders the same board).
 */
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
  const { prefs } = usePreferences();
  const { aiSpeed, traderVoices } = prefs;
  // Solo: the AI is a named trader with a face and a voice (step 11)
  const trader = useMemo(() => (localMultiplayer ? null : traderFor(aiDifficulty)), [localMultiplayer, aiDifficulty]);
  const soloLabels = useMemo<readonly [string, string] | null>(() => (trader ? ['You', trader.name] : null), [trader]);
  const difficultyLabel = `${aiDifficulty.charAt(0).toUpperCase()}${aiDifficulty.slice(1)}`;
  // Rematch: a fresh coin toss decides who goes first (as from the menu)
  const [rematchReveal, setRematchReveal] = useState<0 | 1 | null>(null);
  // The board reports its opponent-play spotlight; the AI waits it out
  const [spotlightActive, setSpotlightActive] = useState(false);
  const [aiMessage, setAiMessage] = useState<string>('');
  // What the trader just said (a voiced line's caption) — outranks chatter
  const [traderLineSaid, setTraderLineSaid] = useState<TraderLine | null>(null);
  const traderLine = traderLineSaid?.text ?? null;
  const setTraderLine = useCallback((text: string | null) => setTraderLineSaid(text ? { text, at: Date.now() } : null), []);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [statsSummary, setStatsSummary] = useState<UserStatsSummary | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [diffBreakdown, setDiffBreakdown] = useState<DifficultyBreakdown[] | null>(null);
  const [showTutorial, setShowTutorial] = useState(() => typeof window !== 'undefined' && !hasSeenTutorial());
  // Reopened from the in-game menu: its last button goes back to the game
  const [tutorialFromMenu, setTutorialFromMenu] = useState(false);
  const replayInputRef = useRef<HTMLInputElement>(null);
  const prevPhaseRef = useRef(state.phase);
  // Hotseat: the screen belongs to whoever must act next — including the
  // non-active player answering a Guard/Rain Maker, auction, draft, etc.
  const viewerPlayer: 0 | 1 = localMultiplayer ? getResponder(state) : 0;
  // Hotseat: whose hand is currently allowed on screen (changes only after a handoff)
  const [confirmedViewer, setConfirmedViewer] = useState<0 | 1>(viewerPlayer);
  const opponentPlayer: 0 | 1 = viewerPlayer === 0 ? 1 : 0;

  // One voice per moment: the spotlight caption replaces the AI's line about
  // the same play (a hidden bubble would otherwise pop up stale afterwards).
  // A trader line outlives a short spotlight: it carries on in the bubble.
  if (spotlightActive && aiMessage) setAiMessage('');
  useEffect(() => {
    if (!traderLine) return;
    const t = window.setTimeout(() => setTraderLine(null), TRADER_LINE_MS);
    return () => window.clearTimeout(t);
  }, [traderLine]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      fetchUserStatsSummary(),
      fetchDifficultyBreakdown(),
    ]).then(([summary, breakdown]) => {
      if (isMounted) {
        setStatsSummary(summary);
        setDiffBreakdown(breakdown);
        setStatsError(null);
      }
    }).catch(() => {
      if (isMounted) {
        setStatsError('Stats unavailable');
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLoggedOut = useCallback(() => {
    setStatsSummary(null);
  }, []);

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

  const handleExportReplay = useCallback((closeMenu: () => void) => {
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
      closeMenu();
    } catch (e) {
      setReplayError((e as Error).message);
    }
  }, [exportReplay, state.turn, state.rngSeed]);

  const handleReplayFileChange = useCallback(async (
    event: ChangeEvent<HTMLInputElement>,
    closeMenu: () => void,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const payload = await file.text();
      importReplay(payload);
      setReplayError(null);
      closeMenu();
    } catch (e) {
      setReplayError((e as Error).message);
    } finally {
      event.target.value = '';
    }
  }, [importReplay]);

  // Is it the AI's turn to act?
  const isAiTurn = !localMultiplayer && state.phase !== 'GAME_OVER' && getResponder(state) === 1;

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

  if (state.phase === 'GAME_OVER' && aiMessage) setAiMessage('');

  const handleAiMessageHide = useCallback(() => {
    setAiMessage('');
    setTraderLine(null);
  }, []);

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

  const handleCloseTutorial = useCallback(() => {
    setShowTutorial(false);
    setTutorialFromMenu(false);
    markTutorialSeen();
  }, []);

  const opponent: OpponentSeat = trader
    ? {
        kind: 'trader',
        trader,
        mood: traderMood,
        speaking: traderSpeaking,
        subtitle: `${trader.title} · ${difficultyLabel}`,
        bubble: traderLine ?? aiMessage,
        onBubbleHide: handleAiMessageHide,
        line: traderLineSaid,
        endQuote: isGameOver ? trader.lines[getWinner(state) === opponentPlayer ? 'win' : 'lose'][0] ?? null : null,
      }
    : { kind: 'hotseat' };

  // Block the entire game UI until the tutorial is dismissed; hotseat hands
  // the device over between seats. Both cover the table (its state persists).
  const cover = showTutorial
    ? <TutorialOverlay onClose={handleCloseTutorial} finishLabel={tutorialFromMenu ? 'Back to the game' : 'Start playing'} />
    : needsHandoff(localMultiplayer, state.phase, confirmedViewer, viewerPlayer)
      ? <PassDeviceScreen state={state} viewerPlayer={viewerPlayer} onReady={() => setConfirmedViewer(viewerPlayer)} />
      : null;

  return (
    <GameBoard
      state={state}
      dispatch={dispatch}
      viewer={viewerPlayer}
      mode={localMultiplayer ? 'hotseat' : 'solo'}
      responder={isGameOver ? null : getResponder(state)}
      hasPendingInteraction={!!(state.pendingResolution || state.pendingGuardReaction || state.pendingWareCardReaction)}
      labels={soloLabels ?? HOTSEAT_LABELS}
      opponent={opponent}
      cover={cover}
      onSpotlightActiveChange={setSpotlightActive}
      overlays={rematchReveal !== null && (
        <FirstPlayerReveal firstPlayer={rematchReveal} onComplete={handleRematchRevealDone} localMultiplayer={localMultiplayer} />
      )}
      endgame={{
        story: gameStory,
        onRematch: handleRematch,
        rematchLabel: trader ? `Rematch ${trader.name} · ${difficultyLabel}` : 'Rematch',
        onMainMenu: onBackToMenu,
        record: endgameRecord,
      }}
      menu={{
        error: statsError,
        showAiOptions: !localMultiplayer,
        onLoggedOut: handleLoggedOut,
        stats: statsSummary && (
          <>
            {statsSummary.wins}-{statsSummary.losses} · {Math.round(statsSummary.winRate * 100)}% win · {statsSummary.gamesPlayed} games
          </>
        ),
        levels: diffBreakdown && diffBreakdown.some((d) => d.gamesPlayed > 0) && (
          diffBreakdown.filter((d) => d.gamesPlayed > 0).map((d) => (
            <span key={d.difficulty} style={{ opacity: d.difficulty === aiDifficulty ? 1 : 0.6 }}>
              {d.difficulty[0]!.toUpperCase() + d.difficulty.slice(1)} Lv{d.level}
              <span style={{ opacity: 0.6 }}> ({d.gamesPlayed}g)</span>
            </span>
          ))
        ),
        actions: (closeMenu) => onBackToMenu && (
          <>
            <button
              type="button"
              className="game-menu-action"
              onClick={() => {
                closeMenu();
                onBackToMenu();
              }}
            >
              Main Menu
            </button>
            <button
              type="button"
              className="game-menu-action"
              onClick={() => {
                closeMenu();
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
                  closeMenu();
                  onBackToMenu();
                }}
              />
            )}
          </>
        ),
        tools: (closeMenu) => (
          <>
            <button type="button" className="game-menu-tool" onClick={() => handleExportReplay(closeMenu)}>
              Export replay
            </button>
            <button type="button" className="game-menu-tool" onClick={() => replayInputRef.current?.click()}>
              Import replay
            </button>
            <input
              ref={replayInputRef}
              type="file"
              accept="application/json"
              onChange={(event) => { void handleReplayFileChange(event, closeMenu); }}
              style={{ display: 'none' }}
            />
            {replayError && <div className="game-menu-error" style={{ flexBasis: '100%' }}>{replayError}</div>}
          </>
        ),
      }}
    />
  );
}
