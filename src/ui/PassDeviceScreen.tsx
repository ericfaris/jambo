// ============================================================================
// Pass-device screen for hotseat Multiplayer
// Covers the board whenever the acting player changes so hands stay private.
// ============================================================================

import type { GameState } from '../engine/types.ts';

/** Hotseat needs a handoff when someone other than the confirmed viewer must act. */
export function needsHandoff(
  localMultiplayer: boolean,
  phase: GameState['phase'],
  confirmedViewer: 0 | 1,
  viewerPlayer: 0 | 1,
): boolean {
  return localMultiplayer && phase !== 'GAME_OVER' && confirmedViewer !== viewerPlayer;
}

/** Why the device is being passed, so the incoming player knows what's waiting. */
export function getHandoffReason(state: GameState, viewerPlayer: 0 | 1): string {
  if (state.pendingGuardReaction?.targetPlayer === viewerPlayer) return 'Your opponent played an animal — you may react with a Guard.';
  if (state.pendingWareCardReaction?.targetPlayer === viewerPlayer) return 'Your opponent used a ware card — you may react with a Rain Maker.';
  if (state.pendingResolution && state.currentPlayer !== viewerPlayer) return 'Your opponent needs a response from you.';
  if (state.pendingResolution) return 'Back to you to finish your card.';
  return 'Your turn.';
}

export function PassDeviceScreen({ state, viewerPlayer, onReady }: { state: GameState; viewerPlayer: 0 | 1; onReady: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pass-device-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9500,
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="etched-wood-border dialog-pop"
        style={{
          width: 'min(440px, 96vw)',
          borderRadius: 12,
          padding: 24,
          background: 'var(--surface)',
          color: 'var(--text)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--text-muted)' }}>
          Pass the device
        </div>
        <h2 id="pass-device-title" style={{ fontFamily: 'var(--font-heading)', color: 'var(--gold)', fontSize: 30, margin: 0 }}>
          Player {viewerPlayer + 1}
        </h2>
        <div style={{ color: 'var(--text-muted)' }}>{getHandoffReason(state, viewerPlayer)}</div>
        <button className="primary" onClick={onReady} autoFocus style={{ marginTop: 8, padding: '10px 20px' }}>
          I'm Player {viewerPlayer + 1} — show my hand
        </button>
      </div>
    </div>
  );
}
