// ============================================================================
// Play a friend — the solo board, driven by the server. Each player sees the
// same table as in solo: their own hand, the friend's tableau and a fan of
// card backs, flights, the spotlight on the friend's plays, the log, audio,
// the endgame story and a rematch. The friend is a person: their name and
// avatar sit where a trader's portrait would, with a presence dot, and there
// is no trader voice or chatter.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WebSocketGameState } from '../multiplayer/client.ts';
import type { GameAction } from '../engine/types.ts';
import { GameBoard } from './GameBoard.tsx';
import type { OpponentSeat } from './GameBoard.tsx';
import { toBoardState, responderFromPublic, hasPendingFromPublic, friendWaitingHint } from './onlineView.ts';
import { useAudioEvents, useOutcomeAudio } from './useAudioEvents.ts';
import { friendlyPlayError } from './uiHints.ts';
import { FirstPlayerReveal } from './FirstPlayerReveal.tsx';
import { TutorialOverlay } from './TutorialOverlay.tsx';
import { markTutorialSeen } from './tutorial/tutorial.ts';
import { ConfirmButton } from './ConfirmButton.tsx';
import { PresenceBanner, OpponentLeftOverlay } from './OnlinePresence.tsx';
import { onlineLabels, rematchStatusLine, revealedGameKey, friendServerError } from './onlineScreenLogic.ts';

export function OnlineGameScreen({ ws, onLeftToMenu }: { ws: WebSocketGameState; onLeftToMenu: () => void }) {
  const slot = ws.playerSlot ?? 0;
  const pub = ws.publicState;
  const priv = ws.privateState;
  const boardState = useMemo(() => (pub && priv ? toBoardState(pub, priv, slot) : null), [pub, priv, slot]);
  const opponentSlot: 0 | 1 = slot === 0 ? 1 : 0;
  const friendSeat = ws.seats?.[opponentSlot] ?? null;
  const name = friendSeat?.name ?? 'Opponent';
  const labels = useMemo(() => onlineLabels(slot, name), [slot, name]);

  // The server's audio cues (plays, wares, coins) and the win/lose sting
  useAudioEvents(ws.audioEvent, ws.clearAudioEvent);
  useOutcomeAudio(pub, slot);

  // The reconnect countdown ticks only while someone is away
  const someoneAway = !!ws.seats?.some((seat) => seat?.status === 'reconnecting') || !ws.connected;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!someoneAway) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [someoneAway]);
  const elapsedMs = ws.seatsReceivedAt === null ? 0 : Math.max(0, now - ws.seatsReceivedAt);

  // Server errors (a move that lost a race, an invalid action) — the same toast as a play error
  const [externalError, setExternalError] = useState<{ message: string; key: number } | null>(null);
  const { error, clearError } = ws;
  useEffect(() => {
    if (!error) return;
    const message = friendServerError(error, name, friendlyPlayError);
    if (message) setExternalError({ message, key: Date.now() });
    clearError();
  }, [error, clearError, name]);

  // Coin toss: once per game per tab (a refresh doesn't replay it)
  const [revealDone, setRevealDone] = useState<number | null>(() => readRevealed(ws.roomCode));
  const showReveal = !!pub && ws.gameNumber !== null && ws.gameNumber !== revealDone && pub.log.length === 0 && pub.phase !== 'GAME_OVER';
  useEffect(() => {
    // Joined mid-game: there's nothing to toss for
    if (pub && ws.gameNumber !== null && ws.gameNumber !== revealDone && pub.log.length > 0) {
      writeRevealed(ws.roomCode, ws.gameNumber);
      setRevealDone(ws.gameNumber);
    }
  }, [pub, ws.gameNumber, ws.roomCode, revealDone]);
  const handleRevealDone = useCallback(() => {
    if (ws.gameNumber === null) return;
    writeRevealed(ws.roomCode, ws.gameNumber);
    setRevealDone(ws.gameNumber);
  }, [ws.gameNumber, ws.roomCode]);

  const [showTutorial, setShowTutorial] = useState(false);
  const { leaveRoom } = ws;
  const leave = useCallback(async () => {
    await leaveRoom();
    onLeftToMenu();
  }, [leaveRoom, onLeftToMenu]);

  const dispatch = useCallback((action: GameAction) => ws.sendAction(action), [ws.sendAction]);

  // Dev only: the E2E driver reads the views and plays through this hook
  useEffect(() => {
    if (!import.meta.env.DEV || !pub || !priv || !boardState) return;
    const w = window as unknown as { __jamboOnline?: unknown };
    w.__jamboOnline = { slot, view: () => ({ pub, priv }), boardState: () => boardState, send: ws.sendAction };
  }, [slot, pub, priv, boardState, ws.sendAction]);

  if (!pub || !priv || !boardState) return null;

  const isGameOver = pub.phase === 'GAME_OVER';
  const friendLeft = friendSeat?.status === 'left';
  const opponent: OpponentSeat = {
    kind: 'human',
    name,
    avatarUrl: friendSeat?.avatarUrl ?? null,
    presence: friendSeat,
    presenceElapsedMs: elapsedMs,
  };

  return (
    <GameBoard
      state={boardState}
      dispatch={dispatch}
      viewer={slot}
      mode="online"
      responder={responderFromPublic(pub)}
      hasPendingInteraction={hasPendingFromPublic(pub)}
      canCancel={pub.canCancel}
      labels={labels}
      opponent={opponent}
      waitingHint={friendWaitingHint(pub, slot, name)}
      externalError={externalError}
      endgame={{
        story: ws.story,
        onRematch: ws.requestRematch,
        rematchLabel: 'Rematch',
        rematchStatus: rematchStatusLine({ votes: ws.rematchVotes, slot, name, friendLeft }),
        rematchDisabled: friendLeft || ws.rematchVotes.includes(slot),
        onMainMenu: () => { void leave(); },
        record: null,
      }}
      menu={{
        showAiOptions: false,
        actions: (closeMenu) => (
          <>
            <button
              type="button"
              className="game-menu-action"
              onClick={() => { closeMenu(); setShowTutorial(true); }}
            >
              How to Play
            </button>
            {isGameOver ? (
              <button type="button" className="game-menu-action" onClick={() => { closeMenu(); void leave(); }}>
                Main Menu
              </button>
            ) : (
              <ConfirmButton
                className="menu-abandon"
                label="Leave game"
                question="Leave this game? It ends for both of you and counts as abandoned."
                confirmLabel="Leave"
                cancelLabel="Keep playing"
                onConfirm={() => { closeMenu(); void leave(); }}
              />
            )}
          </>
        ),
      }}
      overlays={(
        <>
          <PresenceBanner name={name} seat={friendSeat} elapsedMs={elapsedMs} selfConnected={ws.connected} />
          {showReveal && (
            <FirstPlayerReveal
              key={`reveal-${ws.gameNumber}`}
              firstPlayer={pub.currentPlayer}
              viewer={slot}
              names={labels}
              onComplete={handleRevealDone}
            />
          )}
          {showTutorial && (
            <TutorialOverlay
              onClose={() => { markTutorialSeen(); setShowTutorial(false); }}
              finishLabel="Back to the game"
            />
          )}
          {ws.abandoned && (
            <OpponentLeftOverlay
              name={name}
              reason={ws.abandoned.reason}
              onMainMenu={onLeftToMenu}
            />
          )}
        </>
      )}
    />
  );
}

function readRevealed(code: string | null): number | null {
  if (!code) return null;
  try {
    const raw = window.sessionStorage.getItem(revealedGameKey(code));
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeRevealed(code: string | null, gameNumber: number): void {
  if (!code) return;
  try { window.sessionStorage.setItem(revealedGameKey(code), String(gameNumber)); } catch { /* best effort */ }
}
