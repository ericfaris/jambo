// ============================================================================
// Cast Mode — TV Screen
// The shared table on the TV: the desktop board's tableaus, center row,
// spotlights and flights, for both seats at once. No private info shown —
// both hands are face down (toTvBoardState).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WebSocketGameState } from '../multiplayer/client.ts';
import type { PublicGameState } from '../multiplayer/types.ts';
import type { DeckCardId, GameState } from '../engine/types.ts';
import { MarketDisplay } from './MarketDisplay.tsx';
import { UtilityArea } from './UtilityArea.tsx';
import { CenterRow } from './CenterRow.tsx';
import { WareSupply } from './WareSupply.tsx';
import { SeatInfo } from './SeatInfo.tsx';
import { TableauCorners } from './Tableau.tsx';
import { PlayerAvatar } from './PlayerAvatar.tsx';
import { AmbientLayer } from './life.tsx';
import { OpponentPlaySpotlight, withSpotlightHolds } from './OpponentPlaySpotlight.tsx';
import type { PlaySpotlight } from './actionLog.ts';
import { FlightLayer } from './FlightLayer.tsx';
import { useStrikes } from './StrikeLayer.tsx';
import { CardDamageContext } from './cardDamage.tsx';
import { FinalTurnBanner } from './FinalTurnBanner.tsx';
import { TurnSweep } from './TurnSweep.tsx';
import { EndgameOverlay } from './EndgameOverlay.tsx';
import { useAudioEvents, useOutcomeAudio, playSfx } from './useAudioEvents.ts';
import { useBackgroundMusic } from './useBackgroundMusic.ts';
import { useVisualFeedback } from './useVisualFeedback.ts';
import { toTvBoardState } from './onlineView.ts';
import type { Flight } from './flights.ts';

/** The TV names seats by number — a Cast room has no accounts or faces. */
export const TV_LABELS: readonly [string, string] = ['Player 1', 'Player 2'];

const NO_SPOTLIGHTS: readonly PlaySpotlight[] = [];

/** Plays waiting behind the one on screen, per seat — the TV can't pause the
 *  server the way solo pauses its AI, so older ones are dropped to keep up. */
export const TV_SPOTLIGHT_BACKLOG = 2;

/**
 * What the table is waiting on, for the status plaque: a reaction window, a
 * resolution someone is answering, or nothing. Never says what a hidden card is.
 */
export function tvWaitingMessage(pub: PublicGameState, labels: readonly [string, string] = TV_LABELS): string | null {
  if (pub.phase === 'GAME_OVER') return null;
  if (pub.pendingGuardReaction) return `${labels[pub.pendingGuardReaction.targetPlayer]} may answer with a Guard…`;
  if (pub.pendingWareCardReaction) return `${labels[pub.pendingWareCardReaction.targetPlayer]} may answer with a Rain Maker…`;
  if (!pub.pendingResolutionType) return null;
  const who = pub.waitingOnPlayer;
  if (who === null) return 'Resolving…';
  switch (pub.pendingResolutionType) {
    case 'DRAFT': return `${labels[who]} is picking…`;
    case 'AUCTION': return `${labels[who]} is bidding…`;
    case 'OPPONENT_DISCARD': return `${labels[who]} is choosing cards to discard…`;
    case 'OPPONENT_CHOICE':
    case 'BINARY_CHOICE':
    case 'UTILITY_KEEP':
      return `${labels[who]} is deciding…`;
    case 'CARRIER_WARE_SELECT':
    case 'WARE_TRADE':
    case 'WARE_SELECT_MULTIPLE':
    case 'WARE_THEFT_SINGLE':
    case 'WARE_THEFT_SWAP':
    case 'WARE_RETURN':
    case 'WARE_SELL_BULK':
    case 'WARE_CASH_CONVERSION':
      return `${labels[who]} is choosing wares…`;
    default:
      return `${labels[who]} is choosing…`;
  }
}

/** Rematch votes, as the TV shows them under the result. */
export function tvRematchStatus(phase: PublicGameState['phase'], required: readonly (0 | 1)[], votes: readonly (0 | 1)[], labels: readonly [string, string] = TV_LABELS): string | null {
  if (phase !== 'GAME_OVER' || required.length === 0) return null;
  const waiting = required.filter((slot) => !votes.includes(slot));
  if (waiting.length === 0) return 'Starting the rematch…';
  return `Rematch? Waiting for ${waiting.map((slot) => labels[slot]).join(' & ')} to vote on their phone…`;
}

/** Market slot size on the TV: 56px, 44px once a market passes 15 spaces (4+ rows). */
export function tvMarketSlotSize(spaces: number): number {
  return spaces > 15 ? 44 : 56;
}

interface TVScreenProps {
  ws: WebSocketGameState;
}

export function TVScreen({ ws }: TVScreenProps) {
  if (!ws.publicState) return null;
  return <TVBoard ws={ws} pub={ws.publicState} />;
}

function TVBoard({ ws, pub }: { ws: WebSocketGameState; pub: PublicGameState }) {
  const state = useMemo(() => toTvBoardState(pub), [pub]);
  useAudioEvents(ws.audioEvent, ws.clearAudioEvent, pub);
  useOutcomeAudio(pub, null);
  useBackgroundMusic();

  // The TV page owns the whole viewport: no scrollbars, no centered column
  useEffect(() => {
    const root = document.getElementById('root');
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.display = 'block';
    if (root) {
      root.style.maxWidth = 'none';
      root.style.width = '100%';
      root.style.margin = '0';
      root.style.padding = '0';
    }
    return () => {
      html.style.overflow = '';
      body.style.overflow = '';
      body.style.display = '';
      if (root) {
        root.style.maxWidth = '';
        root.style.width = '';
        root.style.margin = '';
        root.style.padding = '';
      }
    };
  }, []);

  // Both seats' face-up plays are announced: one spotlight per actor, indexed
  // by the seat it announces (a spotlight's `viewer` is the *other* seat)
  const [queues, setQueues] = useState<[readonly PlaySpotlight[], readonly PlaySpotlight[]]>([NO_SPOTLIGHTS, NO_SPOTLIGHTS]);
  const [active, setActive] = useState<[boolean, boolean]>([false, false]);
  const [current, setCurrent] = useState<[PlaySpotlight | null, PlaySpotlight | null]>([null, null]);
  const setQueue0 = useCallback((q: readonly PlaySpotlight[]) => setQueues((prev) => [q, prev[1]]), []);
  const setQueue1 = useCallback((q: readonly PlaySpotlight[]) => setQueues((prev) => [prev[0], q]), []);
  const setActive0 = useCallback((a: boolean) => setActive((prev) => (prev[0] === a ? prev : [a, prev[1]])), []);
  const setActive1 = useCallback((a: boolean) => setActive((prev) => (prev[1] === a ? prev : [prev[0], a])), []);
  const setCurrent0 = useCallback((s: PlaySpotlight | null) => setCurrent((prev) => (prev[0] === s ? prev : [s, prev[1]])), []);
  const setCurrent1 = useCallback((s: PlaySpotlight | null) => setCurrent((prev) => (prev[1] === s ? prev : [prev[0], s])), []);
  const spotlightActive = active[0] || active[1];
  const spotlightsQueued = queues[0].length > 0 || queues[1].length > 0;

  const [flightsBusy, setFlightsBusy] = useState(false);
  const strikes = useStrikes({
    state,
    // seat 0 sits at the bottom, like a viewer's own seat
    viewer: 0,
    blocked: spotlightsQueued,
    enabled: state.phase !== 'GAME_OVER',
  });
  const cardDamage = useMemo(() => ({ marks: strikes.marks, hidden: strikes.hidden, chips: strikes.chips }), [strikes.marks, strikes.hidden, strikes.chips]);

  const spotlitDiscardKey = current.flatMap((spot) => (spot && spot.destination === 'discard' ? [spot.cardId] : [])).join(',');
  const heldDiscardCards = useMemo(
    () => [...(spotlitDiscardKey ? spotlitDiscardKey.split(',') : []), ...strikes.heldDiscard],
    [spotlitDiscardKey, strikes.heldDiscard],
  );
  const untapped = (seat: 0 | 1): DeckCardId | null => {
    const spot = current[seat];
    return spot && spot.destination === 'inPlace' ? spot.cardId : null;
  };

  // A soft tap as each ware lands — throttled so a 6-ware buy doesn't clatter
  const lastLandSound = useRef(0);
  const handleFlightLand = useCallback((flight: Flight) => {
    if (flight.kind !== 'ware' || flight.to.type !== 'slot') return;
    const now = Date.now();
    if (now - lastLandSound.current < 70) return;
    lastLandSound.current = now;
    playSfx('ware-land');
  }, []);

  const lastLog = state.log.length > 0 ? state.log[state.log.length - 1] : null;
  const visualFeedback = useVisualFeedback({
    phase: state.phase,
    actionsLeft: state.actionsLeft,
    deckCount: state.deck.length,
    discardCount: state.discardPile.length,
    topDiscardCard: state.discardPile.length > 0 ? state.discardPile[0] : null,
    players: [
      { gold: state.players[0].gold, handCount: state.players[0].hand.length, market: state.players[0].market, utilityCount: state.players[0].utilities.length },
      { gold: state.players[1].gold, handCount: state.players[1].hand.length, market: state.players[1].market, utilityCount: state.players[1].utilities.length },
    ],
    lastLog: lastLog ? { player: lastLog.player, action: lastLog.action } : null,
  });

  const waiting = tvWaitingMessage(pub);
  const rematchStatus = tvRematchStatus(pub.phase, ws.rematchRequired, ws.rematchVotes);
  const opponentMoveAnimating = spotlightsQueued || flightsBusy || strikes.busy;

  return (
    <CardDamageContext.Provider value={cardDamage}>
      <div className="game-root tv-root">
        <AmbientLayer />
        <div className="tv-board">
          <TVSeat
            seat={1}
            state={state}
            spotlightQueue={queues[1]}
            untappedUtility={untapped(1)}
            goldDelta={visualFeedback.goldDeltas[1]}
            marketFlashSlots={visualFeedback.marketFlashSlots[1]}
            position="top"
          />

          <CenterRow
            state={state}
            dispatch={() => {}}
            isLocalMode={true}
            visualFeedback={visualFeedback}
            actorLabels={TV_LABELS}
            spotlitPlayer="both"
            heldDiscardCards={heldDiscardCards}
            viewer={null}
            supplySlot={<WareSupply supply={state.wareSupply} />}
            endTurnSlot={<TVStatusPlaque message={waiting} turnModifiers={state.turnModifiers} currentLabel={TV_LABELS[state.currentPlayer]} />}
          />

          <TVSeat
            seat={0}
            state={state}
            spotlightQueue={queues[0]}
            untappedUtility={untapped(0)}
            goldDelta={visualFeedback.goldDeltas[0]}
            marketFlashSlots={visualFeedback.marketFlashSlots[0]}
            position="bottom"
          />
        </div>

        <div className={`tv-connection${ws.connected ? '' : ' tv-connection-lost'}`} role="status">
          <span className="tv-connection-dot" aria-hidden="true" />
          {ws.connected ? `Room ${ws.roomCode ?? ''}` : 'Reconnecting…'}
        </div>

        <EndgameOverlay
          state={state}
          labels={TV_LABELS}
          viewer={null}
          playerPortrait={<PlayerAvatar avatarUrl={null} size={56} label={TV_LABELS[0]} />}
          opponentPortrait={<PlayerAvatar avatarUrl={null} size={56} label={TV_LABELS[1]} />}
          rematchStatus={rematchStatus}
        />

        {/* Player 1's plays (viewer 1 announces seat 0), then Player 2's. One
            card on screen at a time: Player 1 goes first when both are waiting */}
        <OpponentPlaySpotlight
          log={state.log}
          viewer={1}
          actorLabel={TV_LABELS[0]}
          enabled={state.phase !== 'GAME_OVER'}
          onActiveChange={setActive0}
          onQueueChange={setQueue0}
          onCurrentChange={setCurrent0}
          maxBacklog={TV_SPOTLIGHT_BACKLOG}
          held={active[1]}
          portrait={<PlayerAvatar avatarUrl={null} size={44} label={TV_LABELS[0]} />}
        />
        <OpponentPlaySpotlight
          log={state.log}
          viewer={0}
          actorLabel={TV_LABELS[1]}
          enabled={state.phase !== 'GAME_OVER'}
          onActiveChange={setActive1}
          onQueueChange={setQueue1}
          onCurrentChange={setCurrent1}
          maxBacklog={TV_SPOTLIGHT_BACKLOG}
          held={(active[0] || queues[0].length > 0) && !active[1]}
          portrait={<PlayerAvatar avatarUrl={null} size={44} label={TV_LABELS[1]} />}
        />

        <FinalTurnBanner state={state} labels={TV_LABELS} />
        <TurnSweep state={state} viewer={null} labels={TV_LABELS} held={opponentMoveAnimating} />

        <FlightLayer
          state={state}
          viewer={null}
          spotlightEnabled={true}
          spotlightActive={spotlightActive}
          onLand={handleFlightLand}
          onBusyChange={setFlightsBusy}
        />

        {strikes.layer}
      </div>
    </CardDamageContext.Provider>
  );
}

/**
 * One seat's tableau, the desktop board's opponent panel at TV size: market,
 * utilities, and the seat block (name, gold, gold track, face-down hand).
 * Plays still in the spotlight are held back so they never land early.
 */
function TVSeat({ seat, state, spotlightQueue, untappedUtility, goldDelta, marketFlashSlots, position }: {
  seat: 0 | 1;
  state: GameState;
  /** This seat's plays still being announced. */
  spotlightQueue: readonly PlaySpotlight[];
  untappedUtility: DeckCardId | null;
  goldDelta: number;
  marketFlashSlots: number[];
  position: 'top' | 'bottom';
}) {
  const player = withSpotlightHolds(state.players[seat], spotlightQueue);
  const isActive = state.currentPlayer === seat && state.phase !== 'GAME_OVER';
  // Every stand wraps to a new row: past 15 spaces the slots shrink so a
  // fourth row still fits the 720px TV
  const slotSize = tvMarketSlotSize(player.market.length);
  return (
    <div
      className={`tableau tv-seat turn-emphasis ${isActive ? 'turn-emphasis-active' : 'turn-emphasis-inactive'}`}
      data-center-target={position}
    >
      <TableauCorners />
      <div className="tv-seat-row">
        <MarketDisplay
          owner={seat}
          market={player.market}
          flashSlots={marketFlashSlots}
          flashVariant="strong"
          label="Market"
          labelAside={`${player.market.filter(Boolean).length}/${player.market.length}`}
          slotSize={slotSize}
          tokenSize={Math.round(slotSize * 0.82)}
        />
        {/* maxSlots reserves the row so the board never jumps when a utility lands */}
        <div data-spotlight-target={position === 'top' ? 'opponent-utilities' : undefined} data-utility-anchor={seat} style={{ flexShrink: 0 }}>
          <UtilityArea
            utilities={player.utilities}
            disabled
            label="Utilities"
            labelAside={`${player.utilities.length}/3`}
            cardSize="medium"
            maxSlots={3}
            showHelperText={false}
            untappedCardId={untappedUtility}
          />
        </div>
        <SeatInfo
          seat={seat}
          label={TV_LABELS[seat]}
          subtitle={isActive ? 'Their turn' : undefined}
          portrait={<PlayerAvatar avatarUrl={null} size={72} active={isActive} label={TV_LABELS[seat]} />}
          gold={player.gold}
          goldDelta={goldDelta}
          handCount={player.hand.length}
          isActive={isActive}
          handAnchor
        />
      </div>
    </div>
  );
}

/**
 * The right end of the center row (where End Turn sits on a player's board):
 * what the table is waiting on, or this turn's Wise Man prices.
 */
function TVStatusPlaque({ message, turnModifiers, currentLabel }: {
  message: string | null;
  turnModifiers: GameState['turnModifiers'];
  currentLabel: string;
}) {
  const priceNote = turnModifiers.buyDiscount > 0 || turnModifiers.sellBonus > 0
    ? [
      turnModifiers.buyDiscount > 0 ? `Buy −${turnModifiers.buyDiscount}g` : null,
      turnModifiers.sellBonus > 0 ? `Sell +${turnModifiers.sellBonus}g` : null,
    ].filter(Boolean).join(' · ')
    : null;
  if (!message && !priceNote) return <div className="tv-status-plaque tv-status-plaque-empty" aria-hidden="true" />;
  return (
    <div className="tv-status-plaque" role="status" aria-live="polite">
      {message && <div key={message} className="tv-status-message">{message}</div>}
      {priceNote && <div className="tv-status-prices">{currentLabel}: {priceNote}</div>}
    </div>
  );
}
