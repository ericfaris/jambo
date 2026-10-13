import { createContext, useContext, useEffect, useState } from 'react';
import { nameTheOpponent } from './onlineScreenLogic.ts';
import { throneGiveOptions, throneStealOptions } from '../engine/market/throneSwap.ts';
import type { GameState, PendingResolution, InteractionResponse, WareType, DeckCardId } from '../engine/types.ts';
import { WARE_TYPES } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { CardFace, WareToken } from './CardFace.tsx';
import { MarketDisplay } from './MarketDisplay.tsx';
import { formatResolutionBreadcrumb } from './uiHints.ts';
import { isAuctionBidding } from '../engine/responder.ts';
import { canCancelAction } from '../engine/cancelAction.ts';
import { wareChoiceBlocked, binaryChoiceBlocked } from './choiceAvailability.ts';

interface InteractionPanelProps {
  state: GameState;
  dispatch: (action: import('../engine/types.ts').GameAction) => void;
  viewerPlayer?: 0 | 1;
  onMegaView?: (cardId: DeckCardId) => void;
  /** Cast clients pass this from PublicGameState; local play derives it from state. */
  canCancel?: boolean;
  /** Online: the friend's name, so waiting copy says who ("Sam is picking…"). */
  opponentName?: string;
}

function resolve(dispatch: InteractionPanelProps['dispatch'], response: InteractionResponse) {
  dispatch({ type: 'RESOLVE_INTERACTION', response });
}

/** Space a scrolling card picker keeps around its cards so a hovered card's
 *  lift, scale and shadow are never clipped by the scroll box. */
export const CARD_HOVER_ROOM_PX = 14;

export function getCardGridStyle(cardCount: number) {
  if (cardCount <= 0) {
    return { display: 'grid' } as const;
  }
  if (cardCount <= 3) {
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${cardCount}, minmax(96px, 1fr))`,
      gap: 10,
      width: '100%',
      maxWidth: 520,
      justifyContent: 'center',
      justifyItems: 'center',
      alignContent: 'start',
      // longhands: one div swaps between these styles as a pool shrinks, and
      // React warns when a shorthand and its longhand trade places
      marginTop: 0, marginRight: 'auto', marginLeft: 'auto',
      maxHeight: 'min(42vh, 360px)',
      overflowY: 'auto',
      overflowX: 'hidden',
      // room for a card's hover lift (8px up, a little scale, its shadow) inside the scroller
      padding: `${CARD_HOVER_ROOM_PX}px ${CARD_HOVER_ROOM_PX - 4}px ${CARD_HOVER_ROOM_PX * 3}px`,
      marginBottom: -20, // the shadow room overlaps what follows instead of adding a gap
    } as const;
  }
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))',
    gap: 10,
    width: '100%',
    maxWidth: '100%',
    justifyContent: 'center',
    alignItems: 'start',
    justifyItems: 'center',
    alignContent: 'start',
    marginTop: 0, marginRight: 'auto', marginLeft: 'auto',
    maxHeight: 'min(42vh, 360px)',
    overflowY: 'auto',
    overflowX: 'hidden',
    // room for a card's hover lift (8px up, a little scale, its shadow) inside the scroller
    padding: `${CARD_HOVER_ROOM_PX}px ${CARD_HOVER_ROOM_PX - 4}px ${CARD_HOVER_ROOM_PX * 3}px`,
    marginBottom: -20, // the shadow room overlaps what follows instead of adding a gap
  } as const;
}

function getWareGridStyle(wareCount: number) {
  if (wareCount <= 0) {
    return { display: 'grid' } as const;
  }
  if (wareCount <= 4) {
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${wareCount}, minmax(52px, 1fr))`,
      gap: 10,
      width: '100%',
      maxWidth: 520,
      justifyContent: 'center',
      justifyItems: 'center',
      alignContent: 'start',
      marginTop: 0, marginRight: 'auto', marginBottom: 0, marginLeft: 'auto',
    } as const;
  }
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(52px, 1fr))',
    gap: 10,
    width: '100%',
    maxWidth: '100%',
    justifyItems: 'center',
    alignContent: 'start',
    marginTop: 0, marginRight: 'auto', marginBottom: 0, marginLeft: 'auto',
  } as const;
}

function SelectableCardArea({
  cards,
  onSelect,
  onMegaView,
  selectedIndices,
  selectedCardIds,
  draftAnchors = false,
}: {
  cards: DeckCardId[];
  onSelect: (cardId: DeckCardId, index: number) => void;
  onMegaView?: (cardId: DeckCardId) => void;
  selectedIndices?: number[];
  selectedCardIds?: DeckCardId[];
  /** Draft pool: tag each card (data-draft-card) so a pick can fly from it. */
  draftAnchors?: boolean;
}) {
  const useOverlap = cards.length >= 8;

  if (!useOverlap) {
    return (
      <div style={getCardGridStyle(cards.length)}>
        {cards.map((cardId, index) => (
          <div key={`${cardId}-${index}`} data-draft-card={draftAnchors ? cardId : undefined} style={{ display: 'contents' }}>
            <CardFace
              cardId={cardId}
              small
              selected={selectedIndices?.includes(index) || selectedCardIds?.includes(cardId)}
              onClick={() => onSelect(cardId, index)}
              onMegaView={onMegaView}
            />
          </div>
        ))}
      </div>
    );
  }

  const overlap = 36;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        overflowX: 'auto',
        overflowY: 'hidden',
        maxWidth: '100%',
        // overflow-x scrolling clips vertically too: leave room for the hover lift
        padding: `${CARD_HOVER_ROOM_PX + 2}px ${CARD_HOVER_ROOM_PX - 4}px ${CARD_HOVER_ROOM_PX * 3}px`,
      marginBottom: -20, // the shadow room overlaps what follows instead of adding a gap
        scrollbarWidth: 'thin',
      }}
      className="resolve-card-row"
    >
      {cards.map((cardId, index) => (
        <div
          key={`${cardId}-${index}`}
          data-draft-card={draftAnchors ? cardId : undefined}
          style={{
            marginLeft: index === 0 ? 0 : -overlap,
            flexShrink: 0,
            zIndex: index,
            position: 'relative',
          }}
        >
          <CardFace
            cardId={cardId}
            small
            selected={selectedIndices?.includes(index) || selectedCardIds?.includes(cardId)}
            onClick={() => onSelect(cardId, index)}
            onMegaView={onMegaView}
          />
        </div>
      ))}
    </div>
  );
}

/** Online: who "the opponent" is. Solo/hotseat/Cast keep the generic copy. */
const OpponentNameContext = createContext<string | null>(null);

function useOpponentName(): { Name: string; name: string; say: (text: string) => string } {
  const named = useContext(OpponentNameContext);
  const say = (text: string) => nameTheOpponent(text, named);
  return named ? { Name: named, name: named, say } : { Name: 'Opponent', name: 'opponent', say };
}

export function InteractionPanel(props: InteractionPanelProps) {
  const body = <InteractionPanelBody {...props} />;
  return props.opponentName
    ? <OpponentNameContext.Provider value={props.opponentName}>{body}</OpponentNameContext.Provider>
    : body;
}

function InteractionPanelBody({ state, dispatch, viewerPlayer = 0, onMegaView, canCancel }: InteractionPanelProps) {
  const { Name, name } = useOpponentName();
  // Guard reaction
  if (state.pendingGuardReaction) {
    const animalCard = getCard(state.pendingGuardReaction.animalCard);
    const isMyReaction = state.pendingGuardReaction.targetPlayer === viewerPlayer;
    if (!isMyReaction) return <PanelShell title={`Waiting: ${name} deciding Guard reaction`} />;
    const guardCardId = findHandCardByDesign(state, viewerPlayer, 'guard');
    return (
      <PanelShell title={`${animalCard.name} played! Play Guard to cancel?`} sourceCardId={state.pendingGuardReaction.animalCard} onMegaView={onMegaView}>
        <ReactionDecisionPanel
          reactionCardId={guardCardId}
          reactionLabel="Your Guard"
          primaryLabel="Play Guard"
          onPrimary={() => dispatch({ type: 'GUARD_REACTION', play: true })}
          onSecondary={() => dispatch({ type: 'GUARD_REACTION', play: false })}
          onMegaView={onMegaView}
        />
      </PanelShell>
    );
  }

  // Ware card reaction
  if (state.pendingWareCardReaction) {
    const isMyReaction = state.pendingWareCardReaction.targetPlayer === viewerPlayer;
    if (!isMyReaction) return <PanelShell title={`Waiting: ${name} deciding Rain Maker reaction`} />;
    const rainMakerCardId = findHandCardByDesign(state, viewerPlayer, 'rain_maker');
    return (
      <PanelShell
        title={`${Name} used a ware card! Play Rain Maker to take it?`}
        sourceCardId={state.pendingWareCardReaction.wareCardId}
        onMegaView={onMegaView}
      >
        <ReactionDecisionPanel
          reactionCardId={rainMakerCardId}
          reactionLabel="Your Rain Maker"
          primaryLabel="Play Rain Maker"
          onPrimary={() => dispatch({ type: 'WARE_CARD_REACTION', play: true })}
          onSecondary={() => dispatch({ type: 'WARE_CARD_REACTION', play: false })}
          onMegaView={onMegaView}
        />
      </PanelShell>
    );
  }

  const pr = state.pendingResolution;
  if (!pr) return null;

  const source = getCard(pr.sourceCard);
  const compactSourceCard = shouldUseCompactSourceCard(pr);
  const breadcrumb = formatResolutionBreadcrumb(pr);
  const cancellable = state.currentPlayer === viewerPlayer && (canCancel ?? canCancelAction(state));

  return (
    <PanelShell
      title={source.name}
      breadcrumb={breadcrumb}
      sourceCardId={pr.sourceCard}
      onMegaView={onMegaView}
      compactSourceCard={compactSourceCard}
      onCancel={cancellable ? () => dispatch({ type: 'CANCEL_ACTION' }) : undefined}
      cancelLabel={`Cancel ${source.name} and get your action back`}
      draftSource={pr.type === 'DRAFT'}
    >
      <ResolutionContent state={state} pr={pr} dispatch={dispatch} viewerPlayer={viewerPlayer} onMegaView={onMegaView} />
    </PanelShell>
  );
}

function findHandCardByDesign(state: GameState, player: 0 | 1, designId: 'guard' | 'rain_maker'): DeckCardId | undefined {
  return state.players[player].hand.find((cardId) => getCard(cardId).designId === designId);
}

function ReactionDecisionPanel({
  reactionCardId,
  reactionLabel,
  primaryLabel,
  onPrimary,
  onSecondary,
  onMegaView,
}: {
  reactionCardId?: DeckCardId;
  reactionLabel: string;
  primaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  onMegaView?: (cardId: DeckCardId) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, color: '#6a5a48', fontWeight: 700 }}>↳</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div className="ui-helper-text">{reactionLabel}</div>
          {reactionCardId ? (
            <ReactionCardTile cardId={reactionCardId} onMegaView={onMegaView} />
          ) : (
            <div style={{ width: 136, height: 188, borderRadius: 10, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 8, textAlign: 'center' }}>
              Card not in hand
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="primary" onClick={onPrimary}>{primaryLabel}</button>
        <button onClick={onSecondary}>Decline</button>
      </div>
    </div>
  );
}

function ReactionCardTile({ cardId, onMegaView }: { cardId: DeckCardId; onMegaView?: (cardId: DeckCardId) => void }) {
  const card = getCard(cardId);

  return (
    <div
      onClick={onMegaView ? () => onMegaView(cardId) : undefined}
      className="linen-texture"
      style={{
        width: 136,
        borderRadius: 10,
        padding: 5,
        border: '1px solid #b8ab97',
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
        cursor: onMegaView ? 'zoom-in' : 'default',
      }}
    >
      <img
        src={`/assets/cards/${card.designId}.png`}
        alt={card.name}
        style={{ width: '100%', borderRadius: 8, display: 'block' }}
        draggable={false}
      />
    </div>
  );
}

function shouldUseCompactSourceCard(pr: PendingResolution): boolean {
  switch (pr.type) {
    case 'DECK_PEEK':
    case 'DISCARD_PICK':
    case 'DRAW_MODIFIER':
      return true;
    case 'HAND_SWAP':
    case 'SUPPLIES_DISCARD':
      return true;
    case 'OPPONENT_DISCARD':
      return pr.targetPlayer === 0;
    case 'DRAFT':
      return pr.draftMode !== 'wares';
    case 'AUCTION':
      return (pr.revealedCards?.length ?? 0) > 0;
    case 'WARE_CASH_CONVERSION':
      return pr.step === 'SELECT_CARD';
    case 'UTILITY_EFFECT':
      return pr.step === 'SELECT_CARD';
    default:
      return false;
  }
}

function PanelShell({ title, breadcrumb, children, sourceCardId, onMegaView, compactSourceCard, onCancel, cancelLabel, draftSource }: { title: string; breadcrumb?: string; children?: React.ReactNode; sourceCardId?: DeckCardId; onMegaView?: (cardId: DeckCardId) => void; /** The content is wide (a row of cards to pick from) */ compactSourceCard?: boolean; onCancel?: () => void; cancelLabel?: string; /** The source card holds a ware draft's pool: wares fly onto / off it. */ draftSource?: boolean }) {
  // Esc backs out too, while the panel offers it
  useEffect(() => {
    if (!onCancel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // The full card sits in the upper left, the title and controls beside it
  const maxWidth = sourceCardId ? (compactSourceCard ? 980 : 720) : 460;
  return (
    <div className="panel-slide" style={{ maxWidth, margin: '0 auto', width: '100%' }}>
      <div
        className={`dialog-pop linen-texture resolve-panel${sourceCardId ? ' resolve-panel-with-card' : ''}`}
        style={{
          borderRadius: 14,
          padding: 'clamp(6px, 2vw, 10px)',
          border: '2px solid #a89880',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          position: 'relative',
        }}
      >
        {onCancel && (
          <button
            type="button"
            className="panel-cancel-x"
            onClick={onCancel}
            aria-label={cancelLabel ?? 'Cancel'}
            title={cancelLabel ?? 'Cancel'}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {sourceCardId && (
          <div
            className="resolve-source"
            data-draft-source={draftSource ? '' : undefined}
            onClick={onMegaView ? () => onMegaView(sourceCardId) : undefined}
            style={{ cursor: onMegaView ? 'zoom-in' : 'default' }}
          >
            <CardFace cardId={sourceCardId} fill onMegaView={onMegaView} />
          </div>
        )}

        <div className="linen-texture resolve-body" style={{
          borderRadius: 10,
          padding: 'clamp(10px, 2.5vw, 14px)',
          border: 'none',
          color: '#1a1714',
          minWidth: 0,
        }}>
          <div className={`resolve-head${onCancel ? ' resolve-head-clear-x' : ''}`}>
            {breadcrumb && (
              <div className="resolve-eyebrow">
                <span className="resolve-eyebrow-rule" aria-hidden="true" />
                {breadcrumb}
                <span className="resolve-eyebrow-rule" aria-hidden="true" />
              </div>
            )}
            <h3 className="resolve-title">{title}</h3>
            <div className="resolve-divider" aria-hidden="true"><span /></div>
          </div>
          {children}
          {onCancel && (
            <div className="resolve-footer">
              <button type="button" className="resolve-cancel" onClick={onCancel} title={cancelLabel ?? 'Cancel'}>
                Cancel — take it back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function ResolutionContent({ state, pr, dispatch, viewerPlayer, onMegaView }: { state: GameState; pr: PendingResolution; dispatch: InteractionPanelProps['dispatch']; viewerPlayer: 0 | 1; onMegaView?: (cardId: DeckCardId) => void }) {
  switch (pr.type) {
    case 'WARE_TRADE':
      return <WareTradePanel state={state} pr={pr} dispatch={dispatch} />;
    case 'WARE_SELECT_MULTIPLE':
    case 'CARRIER_WARE_SELECT':
      return <WareTypePicker prompt={pr.type === 'WARE_SELECT_MULTIPLE' ? `Pick a ware type (receive x${pr.count})` : 'Choose a ware type'} onPick={(wt) => resolve(dispatch, { type: 'SELECT_WARE_TYPE', wareType: wt })} blocked={(wt) => wareChoiceBlocked(state, pr, wt)} />;
    case 'BINARY_CHOICE':
      return <BinaryChoicePanel options={pr.options} onChoice={(c) => resolve(dispatch, { type: 'BINARY_CHOICE', choice: c })} blocked={(c) => binaryChoiceBlocked(state, pr, c)} />;
    case 'OPPONENT_CHOICE':
      return <BinaryChoicePanel options={pr.options} onChoice={(c) => resolve(dispatch, { type: 'OPPONENT_CHOICE', choice: c })} blocked={(c) => binaryChoiceBlocked(state, pr, c)} />;
    case 'AUCTION':
      return <AuctionPanel pr={pr} state={state} viewerPlayer={viewerPlayer} dispatch={dispatch} onMegaView={onMegaView} />;
    case 'DECK_PEEK':
      return <DeckPeekPanel pr={pr} dispatch={dispatch} onMegaView={onMegaView} />;
    case 'DISCARD_PICK':
      return <DiscardPickPanel pr={pr} dispatch={dispatch} onMegaView={onMegaView} />;
    case 'WARE_CASH_CONVERSION':
      return <WareCashPanel state={state} pr={pr} dispatch={dispatch} onMegaView={onMegaView} />;
    case 'WARE_SELL_BULK':
      return <WareSellBulkPanel state={state} pr={pr} dispatch={dispatch} />;
    case 'WARE_RETURN':
      return <WareReturnPanel state={state} dispatch={dispatch} />;
    case 'WARE_THEFT_SINGLE':
      return <WareTheftSinglePanel state={state} dispatch={dispatch} />;
    case 'WARE_THEFT_SWAP':
      return <WareTheftSwapPanel state={state} pr={pr} dispatch={dispatch} />;

    case 'HAND_SWAP':
      return <HandSwapPanel state={state} pr={pr} dispatch={dispatch} onMegaView={onMegaView} />;
    case 'OPPONENT_DISCARD':
      return <OpponentDiscardPanel state={state} pr={pr} viewerPlayer={viewerPlayer} dispatch={dispatch} onMegaView={onMegaView} />;
    case 'DRAFT':
      return <DraftPanel pr={pr} viewerPlayer={viewerPlayer} dispatch={dispatch} onMegaView={onMegaView} />;
    case 'SUPPLIES_DISCARD':
      return <SuppliesDiscardPanel state={state} dispatch={dispatch} onMegaView={onMegaView} />;
    case 'UTILITY_KEEP':
      return <UtilityKeepPanel state={state} pr={pr} viewerPlayer={viewerPlayer} dispatch={dispatch} onMegaView={onMegaView} />;
    case 'UTILITY_REPLACE':
      return <UtilityReplacePanel state={state} pr={pr} dispatch={dispatch} onMegaView={onMegaView} />;
    case 'CROCODILE_USE':
      return <CrocodilePanel state={state} pr={pr} dispatch={dispatch} onMegaView={onMegaView} />;
    case 'UTILITY_EFFECT':
      return <UtilityEffectPanel state={state} pr={pr} dispatch={dispatch} onMegaView={onMegaView} />;
    case 'DRAW_MODIFIER':
      return <DrawModifierPanel state={state} dispatch={dispatch} onMegaView={onMegaView} />;
    case 'TURN_MODIFIER':
      return <div className="ui-helper-text">Auto-resolving...</div>;
    default:
      return <div className="ui-helper-text">Unknown resolution type</div>;
  }
}

// --- Sub-components ---

function WareTypePicker({ prompt, onPick, exclude, blocked }: { prompt: string; onPick: (wt: WareType) => void; exclude?: WareType; blocked?: (wt: WareType) => string | null }) {
  const types = exclude ? WARE_TYPES.filter(w => w !== exclude) : WARE_TYPES;
  // Nothing pickable: the resolver's empty-state guard auto-resolves on any
  // response, so offer Continue (stall prevention — never leave nothing to tap)
  if (blocked && types.every((wt) => blocked(wt) !== null)) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div className="ui-prompt-text">No ware type is available right now — this has no effect.</div>
        <button className="primary" onClick={() => onPick(types[0])}>Continue</button>
      </div>
    );
  }
  return (
    <div>
      <div className="ui-prompt-text">{prompt}</div>
      <div style={getWareGridStyle(types.length)}>
        {types.map(wt => {
          const reason = blocked?.(wt) ?? null;
          return (
            <button
              key={wt}
              onClick={() => onPick(wt)}
              disabled={reason !== null}
              title={reason ?? wt}
              aria-label={reason ? `${wt} — ${reason}` : wt}
              className="ware-pick"
            >
              <WareToken type={wt} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BinaryChoicePanel({ options, onChoice, blocked }: { options: [string, string]; onChoice: (c: 0 | 1) => void; blocked?: (c: 0 | 1) => string | null }) {
  const { say } = useOpponentName();
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
      {([0, 1] as const).map((c) => {
        const reason = blocked?.(c) ?? null;
        return (
          <button key={c} className="primary" disabled={reason !== null} title={reason ?? undefined} onClick={() => onChoice(c)}>
            {say(options[c])}{reason ? ` (${say(reason)})` : ''}
          </button>
        );
      })}
    </div>
  );
}

function WareTradePanel({ state, pr, dispatch }: { state: GameState; pr: Extract<PendingResolution, { type: 'WARE_TRADE' }>; dispatch: InteractionPanelProps['dispatch'] }) {
  if (pr.step === 'SELECT_GIVE') {
    return <WareTypePicker prompt="Select ware type to give (all of that type)" onPick={(wt) => resolve(dispatch, { type: 'SELECT_WARE_TYPE', wareType: wt })} blocked={(wt) => wareChoiceBlocked(state, pr, wt)} />;
  }
  const receivePrompt = pr.giveType != null && pr.giveCount != null
    ? `Trade all ${pr.giveCount} ${pr.giveType} — pick a type to receive:`
    : 'Select ware type to receive';
  return <WareTypePicker prompt={receivePrompt} onPick={(wt) => resolve(dispatch, { type: 'SELECT_WARE_TYPE', wareType: wt })} exclude={pr.giveType} blocked={(wt) => wareChoiceBlocked(state, pr, wt)} />;
}

function AuctionPanel({ pr, state, viewerPlayer, dispatch, onMegaView }: { pr: Extract<PendingResolution, { type: 'AUCTION' }>; state: GameState; viewerPlayer: 0 | 1; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const revealedCards = pr.revealedCards ?? [];
  if (revealedCards.length > 0) {
    return <CardAuctionPanel pr={pr} cards={revealedCards} state={state} viewerPlayer={viewerPlayer} dispatch={dispatch} onMegaView={onMegaView} />;
  }

  // Ware selection phase: active player picks 2 ware types from supply
  if (!isAuctionBidding(pr)) {
    const isMyPick = state.currentPlayer === viewerPlayer;
    if (!isMyPick) return <div className="ui-helper-text">Step 1/2: waiting for opponent to select auction wares...</div>;
    const prompt = pr.wares.length === 0
      ? 'Pick first ware from supply for auction'
      : 'Pick second ware from supply';
    return (
      <div>
        {pr.wares.length === 1 && (
          <div className="auction-lot auction-lot-partial">
            <span className="auction-lot-label">On the block</span>
            <div className="auction-lot-wares">
              <WareToken type={pr.wares[0]} />
              <span className="auction-lot-open" aria-label="second ware still to pick" />
            </div>
          </div>
        )}
        <WareTypePicker prompt={prompt} onPick={(wt) => resolve(dispatch, { type: 'SELECT_WARE_TYPE', wareType: wt })} blocked={(wt) => wareChoiceBlocked(state, pr, wt)} />
      </div>
    );
  }

  // Bidding phase
  const isMyBid = pr.nextBidder === viewerPlayer;
  const nextBid = pr.currentBid + 1;
  return (
    <div className="auction">
      <div className="auction-lot">
        <span className="auction-lot-label">On the block</span>
        <div className="auction-lot-wares">
          {pr.wares.map((wt, i) => <WareToken key={i} type={wt} />)}
        </div>
      </div>
      <AuctionBidBoard
        pr={pr}
        viewerPlayer={viewerPlayer}
        myGold={state.players[viewerPlayer].gold}
        theirGold={state.players[viewerPlayer === 0 ? 1 : 0].gold}
        onBid={() => resolve(dispatch, { type: 'AUCTION_BID', amount: nextBid })}
        onPass={() => resolve(dispatch, { type: 'AUCTION_PASS' })}
        canAfford={state.players[viewerPlayer].gold >= nextBid}
        isMyBid={isMyBid}
      />
    </div>
  );
}

/**
 * The bidding half of an auction: the current bid as a big coin, who leads,
 * both purses, and Bid / Pass — or who's thinking, while it isn't your call.
 */
function AuctionBidBoard({ pr, viewerPlayer, myGold, theirGold, onBid, onPass, canAfford, isMyBid }: {
  pr: Extract<PendingResolution, { type: 'AUCTION' }>;
  viewerPlayer: 0 | 1;
  myGold: number;
  /** The opponent's purse is public — and it caps how high they can go */
  theirGold: number;
  onBid: () => void;
  onPass: () => void;
  canAfford: boolean;
  isMyBid: boolean;
}) {
  const { Name, name } = useOpponentName();
  const nextBid = pr.currentBid + 1;
  const leading = pr.currentBid > 0 ? (pr.currentBidder === viewerPlayer ? 'mine' : 'theirs') : 'none';
  return (
    <div className="auction-board">
      <div className="auction-standing">
        <div className="auction-purse">
          <span className="auction-caption">Your gold</span>
          <span className="auction-purse-amount">{myGold}g</span>
        </div>
        <div className="auction-current">
          <span className="auction-caption">Current bid</span>
          <span className={`ware-coin auction-coin${pr.currentBid === 0 ? ' auction-coin-empty' : ''}`} aria-label={`${pr.currentBid}g`}>
            {pr.currentBid > 0 ? pr.currentBid : '–'}
          </span>
          <span className={`auction-leader auction-leader-${leading}`}>
            {leading === 'mine' ? 'You lead' : leading === 'theirs' ? `${Name} leads` : 'No bids yet'}
          </span>
        </div>
        <div className="auction-purse auction-purse-theirs">
          <span className="auction-caption">{`${Name}'s gold`}</span>
          <span className="auction-purse-amount">{theirGold}g</span>
        </div>
      </div>
      {isMyBid ? (
        <>
          <div className="dialog-actions auction-actions">
            <button className="primary" disabled={!canAfford} onClick={onBid}>
              Bid {nextBid}g
            </button>
            <button onClick={onPass}>Pass</button>
          </div>
          <div className="auction-note">
            {canAfford ? 'Your call — raise or pass. Passing ends the auction.' : `You can't cover ${nextBid}g — pass to end the auction.`}
          </div>
        </>
      ) : (
        <div className="auction-waiting" role="status">
          Waiting for {name === 'opponent' ? 'opponent bid' : `${name}'s bid`}<span className="auction-waiting-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
        </div>
      )}
    </div>
  );
}

/** Arabian Merchant: bid on the revealed top deck cards; no bids → discarded. */
function CardAuctionPanel({ pr, cards, state, viewerPlayer, dispatch, onMegaView }: { pr: Extract<PendingResolution, { type: 'AUCTION' }>; cards: DeckCardId[]; state: GameState; viewerPlayer: 0 | 1; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const isMyBid = pr.nextBidder === viewerPlayer;
  const nextBid = pr.currentBid + 1;
  return (
    <div className="auction">
      <div className="ui-prompt-text">
        Auction for {cards.length} card{cards.length === 1 ? '' : 's'} — winner takes them all. If nobody bids, they are discarded.
      </div>
      <div className="auction-lot auction-lot-cards">
        <SelectableCardArea cards={cards} onSelect={() => {}} onMegaView={onMegaView} />
      </div>
      <AuctionBidBoard
        pr={pr}
        viewerPlayer={viewerPlayer}
        myGold={state.players[viewerPlayer].gold}
        theirGold={state.players[viewerPlayer === 0 ? 1 : 0].gold}
        onBid={() => resolve(dispatch, { type: 'AUCTION_BID', amount: nextBid })}
        onPass={() => resolve(dispatch, { type: 'AUCTION_PASS' })}
        canAfford={state.players[viewerPlayer].gold >= nextBid}
        isMyBid={isMyBid}
      />
    </div>
  );
}

function DeckPeekPanel({ pr, dispatch, onMegaView }: { pr: Extract<PendingResolution, { type: 'DECK_PEEK' }>; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  return (
    <div>
      <div className="ui-prompt-text">
        Pick {pr.pickCount} card(s) to keep — the rest return to the top of the deck in order.
      </div>
      <SelectableCardArea
        cards={pr.revealedCards}
        onSelect={(_, i) => resolve(dispatch, { type: 'DECK_PEEK_PICK', cardIndex: i })}
        onMegaView={onMegaView}
      />
    </div>
  );
}

function DiscardPickPanel({ pr, dispatch, onMegaView }: { pr: Extract<PendingResolution, { type: 'DISCARD_PICK' }>; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  return (
    <div>
      <div className="ui-prompt-text">
        Pick 1 card from the discard pile ({pr.eligibleCards.length} available).
      </div>
      <SelectableCardArea
        cards={pr.eligibleCards}
        onSelect={(cardId) => resolve(dispatch, { type: 'DISCARD_PICK', cardId })}
        onMegaView={onMegaView}
      />
    </div>
  );
}

function WareCashPanel({ state, pr, dispatch, onMegaView }: { state: GameState; pr: Extract<PendingResolution, { type: 'WARE_CASH_CONVERSION' }>; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const [selectedWares, setSelectedWares] = useState<number[]>([]);
  const cp = state.currentPlayer;
  const player = state.players[cp];

  if (pr.step === 'SELECT_CARD') {
    const wareCards = player.hand.filter(id => getCard(id).type === 'ware');
    return (
      <div>
        <div className="ui-prompt-text">
          Select 1 ware card from your hand ({wareCards.length} ware card{wareCards.length === 1 ? '' : 's'} available).
        </div>
        <SelectableCardArea
          cards={wareCards}
          onSelect={(cardId) => resolve(dispatch, { type: 'SELECT_CARD', cardId })}
          onMegaView={onMegaView}
        />
      </div>
    );
  }

  if (pr.step === 'SELECT_WARES') {
    const toggleSlot = (i: number) => {
      setSelectedWares(prev => prev.includes(i) ? prev.filter(x => x !== i) : prev.length < 3 ? [...prev, i] : prev);
    };
    return (
      <div>
        <div className="ui-prompt-text">
          Select 3 wares to return ({selectedWares.length}/3 selected).
          {pr.selectedCard && getCard(pr.selectedCard).wares && (
            <> You'll receive {getCard(pr.selectedCard).wares!.sellPrice}g.</>
          )}
        </div>
        <div className="ui-helper-text" style={{ marginBottom: 8, opacity: 0.9 }}>
          You currently have {player.market.filter(w => w !== null).length} ware(s) in market.
        </div>
        <MarketDisplay market={player.market} onSlotClick={toggleSlot} selectedSlots={selectedWares} />
        <button className="primary" disabled={selectedWares.length !== 3} onClick={() => { resolve(dispatch, { type: 'SELECT_WARES', wareIndices: selectedWares }); setSelectedWares([]); }} style={{ margin: '8px auto 0', display: 'block' }}>
          Confirm
        </button>
      </div>
    );
  }

  return <div className="ui-helper-text">Processing...</div>;
}

/** Indices of the market slots holding a ware — Portuguese's "Select all". */
export function filledMarketSlots(market: readonly (string | null)[]): number[] {
  return market.flatMap((ware, i) => (ware ? [i] : []));
}

function WareSellBulkPanel({ state, pr, dispatch }: { state: GameState; pr: Extract<PendingResolution, { type: 'WARE_SELL_BULK' }>; dispatch: InteractionPanelProps['dispatch'] }) {
  const [selected, setSelected] = useState<number[]>([]);
  const cp = state.currentPlayer;
  const player = state.players[cp];

  const toggleSlot = (i: number) => {
    setSelected(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  };
  const filledSlots = filledMarketSlots(player.market);
  const allSelected = filledSlots.length > 0 && filledSlots.every(i => selected.includes(i));

  if (!player.market.some(w => w !== null)) {
    return (
      <div>
        <div className="ui-prompt-text">No wares in your market to sell.</div>
        <button className="primary" onClick={() => resolve(dispatch, { type: 'SELL_WARES', wareIndices: [] })} style={{ margin: '8px auto 0', display: 'block' }}>
          Continue
        </button>
      </div>
    );
  }

  // Wise Man's +2g applies once per sale, when at least one ware is sold
  const sellTotal = selected.length * pr.pricePerWare;

  return (
    <div>
      <div className="ui-prompt-text">
        Select wares to sell at {pr.pricePerWare}g each ({selected.length} selected = {sellTotal}g):
      </div>
      <MarketDisplay market={player.market} onSlotClick={toggleSlot} selectedSlots={selected} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        <button onClick={() => setSelected(allSelected ? [] : filledSlots)} aria-pressed={allSelected}>
          {allSelected ? 'Clear' : `Select all (${filledSlots.length})`}
        </button>
        <button className="primary" disabled={selected.length === 0} onClick={() => { resolve(dispatch, { type: 'SELL_WARES', wareIndices: selected }); setSelected([]); }}>
          Sell ({sellTotal}g)
        </button>
      </div>
    </div>
  );
}

function WareReturnPanel({ state, dispatch }: { state: GameState; dispatch: InteractionPanelProps['dispatch'] }) {
  const cp = state.currentPlayer;
  const player = state.players[cp];
  const marketCount = player.market.filter(w => w !== null).length;
  return (
    <div>
      <div className="ui-prompt-text">
        Select 1 ware to return ({marketCount} ware{marketCount === 1 ? '' : 's'} available).
      </div>
      <MarketDisplay market={player.market} onSlotClick={(i) => resolve(dispatch, { type: 'RETURN_WARE', wareIndex: i })} />
    </div>
  );
}

function WareTheftSinglePanel({ state, dispatch }: { state: GameState; dispatch: InteractionPanelProps['dispatch'] }) {
  const cp = state.currentPlayer;
  const opponent: 0 | 1 = cp === 0 ? 1 : 0;
  const opponentWareCount = state.players[opponent].market.filter(w => w !== null).length;
  return (
    <div>
      <div className="ui-prompt-text">
        Select 1 ware to steal from opponent ({opponentWareCount} available).
      </div>
      <MarketDisplay market={state.players[opponent].market} onSlotClick={(i) => resolve(dispatch, { type: 'SELECT_WARE', wareIndex: i })} />
    </div>
  );
}

function WareTheftSwapPanel({ state, pr, dispatch }: { state: GameState; pr: Extract<PendingResolution, { type: 'WARE_THEFT_SWAP' }>; dispatch: InteractionPanelProps['dispatch'] }) {
  const { say } = useOpponentName();
  const cp = state.currentPlayer;
  const opponent: 0 | 1 = cp === 0 ? 1 : 0;
  const giving = pr.step === 'GIVE' || !pr.givenWare;
  const market = giving ? state.players[cp].market : state.players[opponent].market;
  // Same-type exchanges change nothing, so they're never offered (engine rejects them too)
  const options = giving ? throneGiveOptions(state, cp) : throneStealOptions(state, cp, pr.givenWare);
  const disabledSlots = market.map((w, i) => (w !== null && !options.includes(i) ? i : -1)).filter((i) => i >= 0);

  if (options.length === 0) {
    return (
      <div>
        <div className="ui-prompt-text">No swap would change anything — every ware matches.</div>
        <button onClick={() => resolve(dispatch, { type: 'SELECT_WARE', wareIndex: 0 })}>Continue</button>
      </div>
    );
  }

  if (giving) {
    return (
      <div>
        <div className="ui-prompt-text">
          Step 1/2: pick 1 of your wares to give ({options.length} available).
        </div>
        <MarketDisplay
          market={market}
          onSlotClick={(i) => resolve(dispatch, { type: 'SELECT_WARE', wareIndex: i })}
          disabledSlots={disabledSlots}
          disabledReason="Your opponent has nothing different to trade for this"
        />
      </div>
    );
  }
  return (
    <div>
      <div className="ui-prompt-text" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        Step 2/2: pick 1 of {say("your opponent's")} wares ({options.length} available) to take for
        {pr.givenWare && <WareToken type={pr.givenWare} size={28} />}
      </div>
      <MarketDisplay
        market={market}
        onSlotClick={(i) => resolve(dispatch, { type: 'SELECT_WARE', wareIndex: i })}
        disabledSlots={disabledSlots}
        disabledReason={pr.givenWare ? `Same as the ${pr.givenWare} you're giving` : undefined}
      />
    </div>
  );
}


function HandSwapPanel({ state, pr, dispatch, onMegaView }: { state: GameState; pr: Extract<PendingResolution, { type: 'HAND_SWAP' }>; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const { Name, say } = useOpponentName();
  const cp = state.currentPlayer;
  if (pr.step === 'TAKE') {
    if (pr.revealedHand.length === 0) {
      return (
        <div>
          <div className="ui-prompt-text">{Name} has no cards to take.</div>
          <button className="primary" onClick={() => resolve(dispatch, { type: 'SELECT_CARD', cardId: '' })} style={{ margin: '8px auto 0', display: 'block' }}>
            Continue
          </button>
        </div>
      );
    }
    return (
      <div>
        <div className="ui-prompt-text">
          Step 1/2: take 1 card from {say("opponent's")} hand ({pr.revealedHand.length} available).
        </div>
        <SelectableCardArea
          cards={pr.revealedHand}
          onSelect={(cardId) => resolve(dispatch, { type: 'SELECT_CARD', cardId })}
          onMegaView={onMegaView}
        />
      </div>
    );
  }
  const giveOptions = state.players[cp].hand.filter(cardId => cardId !== pr.takenCard);
  return (
    <div>
      <div className="ui-prompt-text">
        Step 2/2: give 1 card to {say('opponent')} ({giveOptions.length} valid choices).
      </div>
      <div className="ui-helper-text" style={{ marginBottom: 8, opacity: 0.9 }}>
        You cannot give back the card you just took.
      </div>
      <SelectableCardArea
        cards={giveOptions}
        onSelect={(cardId) => resolve(dispatch, { type: 'SELECT_CARD', cardId })}
        onMegaView={onMegaView}
      />
    </div>
  );
}

function OpponentDiscardPanel({ state, pr, viewerPlayer, dispatch, onMegaView }: { state: GameState; pr: Extract<PendingResolution, { type: 'OPPONENT_DISCARD' }>; viewerPlayer: 0 | 1; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const { Name } = useOpponentName();
  const [selected, setSelected] = useState<number[]>([]);
  const target = state.players[pr.targetPlayer];
  const discardCount = target.hand.length - pr.discardTo;

  // Already at or below target — auto-resolve
  if (discardCount <= 0) {
    return (
      <div>
        <div className="ui-prompt-text">
          {Name} has {target.hand.length} card(s); discard target is {pr.discardTo}. No cards need to be discarded.
        </div>
        <button className="primary" onClick={() => resolve(dispatch, { type: 'OPPONENT_DISCARD_SELECTION', cardIndices: [] })} style={{ margin: '8px auto 0', display: 'block' }}>
          Continue
        </button>
      </div>
    );
  }

  if (pr.targetPlayer !== viewerPlayer) {
    return <div className="ui-helper-text">{Name} is choosing cards to discard...</div>;
  }

  const toggleCard = (i: number) => {
    setSelected(prev => prev.includes(i) ? prev.filter(x => x !== i) : prev.length < discardCount ? [...prev, i] : prev);
  };

  return (
    <div>
      <div className="ui-prompt-text">
        Discard {discardCount} card(s) to reach {pr.discardTo} in hand — {selected.length}/{discardCount} selected.
      </div>
      <SelectableCardArea
        cards={target.hand}
        selectedIndices={selected}
        onSelect={(_, i) => toggleCard(i)}
        onMegaView={onMegaView}
      />
      <button className="primary" disabled={selected.length !== discardCount} onClick={() => { resolve(dispatch, { type: 'OPPONENT_DISCARD_SELECTION', cardIndices: selected }); setSelected([]); }} style={{ margin: '8px auto 0', display: 'block' }}>
        Confirm Discard
      </button>
    </div>
  );
}

function DraftPanel({ pr, viewerPlayer, dispatch, onMegaView }: { pr: Extract<PendingResolution, { type: 'DRAFT' }>; viewerPlayer: 0 | 1; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const { Name } = useOpponentName();
  const isMyPick = pr.currentPicker === viewerPlayer;

  if (pr.draftMode === 'wares') {
    return (
      <div>
        <div className="ui-prompt-text">
          {isMyPick
            ? `Pick 1 ware to keep — you and your opponent alternate. (${pr.availableWares.length} in pool)`
            : `${Name} is picking... (${pr.availableWares.length} in pool)`}
        </div>
        <div style={getWareGridStyle(pr.availableWares.length)}>
          {pr.availableWares.map((wt, i) => (
            isMyPick ? (
              <button key={i} className="ware-pick" aria-label={wt} onClick={() => resolve(dispatch, { type: 'SELECT_WARE', wareIndex: i })}>
                <WareToken type={wt} />
              </button>
            ) : (
              <div key={i} className="ware-pick ware-pick-waiting">
                <WareToken type={wt} />
              </div>
            )
          ))}
        </div>
      </div>
    );
  }

  const cards = pr.availableCards || [];
  return (
    <div>
      <div className="ui-prompt-text">
        {isMyPick
          ? `Pick 1 ${pr.draftMode === 'cards' ? 'card' : 'utility'} to keep — you and your opponent alternate. (${cards.length} in pool)`
          : `${Name} is picking a ${pr.draftMode === 'cards' ? 'card' : 'utility'}... (${cards.length} in pool)`}
      </div>
      {isMyPick ? (
        <SelectableCardArea
          cards={cards}
          onSelect={(cardId) => resolve(dispatch, { type: 'SELECT_CARD', cardId })}
          onMegaView={onMegaView}
          draftAnchors
        />
      ) : (
        <SelectableCardArea
          cards={cards}
          onSelect={() => {}}
          onMegaView={onMegaView}
          draftAnchors
        />
      )}
    </div>
  );
}

function SuppliesDiscardPanel({ state, dispatch, onMegaView }: { state: GameState; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const cp = state.currentPlayer;
  const hand = state.players[cp].hand;

  if (hand.length === 0) {
    return (
      <div>
        <div className="ui-prompt-text">No cards to discard. Continue to auto-draw until a ware is found.</div>
        <button className="primary" onClick={() => resolve(dispatch, { type: 'SELECT_CARD', cardId: '' })} style={{ margin: '8px auto 0', display: 'block' }}>
          Continue
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="ui-prompt-text">
        Select 1 card to discard ({hand.length} available).
      </div>
      <SelectableCardArea
        cards={hand}
        onSelect={(cardId) => resolve(dispatch, { type: 'SELECT_CARD', cardId })}
        onMegaView={onMegaView}
      />
    </div>
  );
}

function UtilityReplacePanel({ state, pr: _pr, dispatch, onMegaView }: { state: GameState; pr: Extract<PendingResolution, { type: 'UTILITY_REPLACE' }>; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const cp = state.currentPlayer;
  const utils = state.players[cp].utilities;

  if (utils.length === 0) {
    return (
      <div>
        <div className="ui-prompt-text">No utilities to replace.</div>
        <button className="primary" onClick={() => resolve(dispatch, { type: 'SELECT_UTILITY', utilityIndex: 0 })} style={{ margin: '8px auto 0', display: 'block' }}>
          Continue
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="ui-prompt-text">
        Select a utility to replace with the new one.
      </div>
      <SelectableCardArea
        cards={utils.map((u) => u.cardId)}
        onSelect={(_, i) => resolve(dispatch, { type: 'SELECT_UTILITY', utilityIndex: i })}
        onMegaView={onMegaView}
      />
    </div>
  );
}

function UtilityKeepPanel({ state, pr, viewerPlayer, dispatch, onMegaView }: { state: GameState; pr: Extract<PendingResolution, { type: 'UTILITY_KEEP' }>; viewerPlayer: 0 | 1; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const { Name } = useOpponentName();
  const cp = state.currentPlayer;
  const responder = pr.step === 'ACTIVE_CHOOSE' ? cp : (cp === 0 ? 1 : 0);

  if (responder !== viewerPlayer) {
    return <div className="ui-helper-text">Waiting: {Name === 'Opponent' ? 'opponent' : Name} chooses utility to keep.</div>;
  }

  const utils = state.players[responder].utilities;

  if (utils.length === 0) {
    return (
      <div>
        <div className="ui-prompt-text">You have no utilities.</div>
        <button className="primary" onClick={() => resolve(dispatch, { type: 'SELECT_UTILITY', utilityIndex: 0 })} style={{ margin: '8px auto 0', display: 'block' }}>
          Continue
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="ui-prompt-text">
        Choose 1 utility to keep ({utils.length} available, {Math.max(0, utils.length - 1)} will be discarded).
      </div>
      <SelectableCardArea
        cards={utils.map((u) => u.cardId)}
        onSelect={(_, i) => resolve(dispatch, { type: 'SELECT_UTILITY', utilityIndex: i })}
        onMegaView={onMegaView}
      />
    </div>
  );
}

function CrocodilePanel({ state, pr, dispatch, onMegaView }: { state: GameState; pr: Extract<PendingResolution, { type: 'CROCODILE_USE' }>; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const { Name } = useOpponentName();
  if (pr.step === 'SELECT_UTILITY') {
    const opUtils = state.players[pr.opponentPlayer].utilities;
    if (opUtils.length === 0) {
      return (
        <div>
          <div className="ui-prompt-text">{Name} has no utilities to use.</div>
          <button className="primary" onClick={() => resolve(dispatch, { type: 'SELECT_UTILITY', utilityIndex: 0 })} style={{ margin: '8px auto 0', display: 'block' }}>
            Continue
          </button>
        </div>
      );
    }
    return (
      <div>
        <div className="ui-prompt-text">
          Select 1 opponent utility to use and discard ({opUtils.length} available).
          {opUtils.some((u) => u.designId === 'mask_of_transformation') && ' A Mask of Transformation can only be discarded, not used.'}
        </div>
        <SelectableCardArea
          cards={opUtils.map((u) => u.cardId)}
          onSelect={(_, i) => resolve(dispatch, { type: 'SELECT_UTILITY', utilityIndex: i })}
          onMegaView={onMegaView}
        />
      </div>
    );
  }
  return <div className="ui-helper-text">Using opponent's utility...</div>;
}

function UtilityEffectPanel({ state, pr, dispatch, onMegaView }: { state: GameState; pr: Extract<PendingResolution, { type: 'UTILITY_EFFECT' }>; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const [selectedCards, setSelectedCards] = useState<DeckCardId[]>([]);
  const cp = state.currentPlayer;
  const player = state.players[cp];

  // Drums: return 1 ware from market, draw 1 card
  if (pr.utilityDesign === 'drums') {
    const filledSlots = player.market.map((w, i) => ({ w, i })).filter(s => s.w !== null);
    if (filledSlots.length === 0) {
      // Auto-resolve: no wares to return, resolver draws a card anyway
      return (
        <div>
          <div className="ui-prompt-text">No wares to return. Continue to draw 1 card.</div>
          <button className="primary" onClick={() => resolve(dispatch, { type: 'RETURN_WARE', wareIndex: 0 })} style={{ margin: '8px auto 0', display: 'block' }}>
            Draw a card
          </button>
        </div>
      );
    }
    return (
      <div>
        <div className="ui-prompt-text">Select a ware to return (then draw 1 card):</div>
        <MarketDisplay market={player.market} onSlotClick={(i) => resolve(dispatch, { type: 'RETURN_WARE', wareIndex: i })} />
      </div>
    );
  }

  // Scale: draw 2 cards, keep 1, give 1 to opponent
  if (pr.utilityDesign === 'scale') {
    if (!pr.selectedCards || pr.selectedCards.length === 0) {
      // First phase: trigger the draw
      return (
        <div>
          <div className="ui-prompt-text">Scale step 1/2: draw 2 cards.</div>
          <button className="primary" onClick={() => resolve(dispatch, { type: 'SELECT_CARD', cardId: '' })} style={{ margin: '8px auto 0', display: 'block' }}>
            Draw cards
          </button>
        </div>
      );
    }
    // Second phase: pick which drawn card to keep
    return (
      <div>
        <div className="ui-prompt-text">Keep 1 card — the other goes to your opponent.</div>
        <SelectableCardArea
          cards={pr.selectedCards}
          onSelect={(cardId) => resolve(dispatch, { type: 'SELECT_CARD', cardId })}
          onMegaView={onMegaView}
        />
      </div>
    );
  }

  // Kettle / Boat / Weapons: select card(s) from hand
  if (pr.step === 'SELECT_CARD') {
    // Empty hand — resolver auto-resolves; show Continue button
    if (player.hand.length === 0) {
      const dummyResponse: InteractionResponse = pr.utilityDesign === 'kettle'
        ? { type: 'SELECT_CARDS', cardIds: [] }
        : { type: 'SELECT_CARD', cardId: '' };
      return (
        <div>
          <div className="ui-prompt-text">No cards in hand.</div>
          <button className="primary" onClick={() => resolve(dispatch, dummyResponse)} style={{ margin: '8px auto 0', display: 'block' }}>
            Continue
          </button>
        </div>
      );
    }

    const maxCards = pr.utilityDesign === 'kettle' ? 2 : 1;
    const toggleCard = (cardId: DeckCardId) => {
      setSelectedCards(prev => prev.includes(cardId) ? prev.filter(c => c !== cardId) : prev.length < maxCards ? [...prev, cardId] : prev);
    };

    if (maxCards === 1) {
      // Single card selection — click to confirm immediately
      return (
        <div>
          <div className="ui-prompt-text">Select a card from your hand:</div>
          <SelectableCardArea
            cards={player.hand}
            onSelect={(cardId) => resolve(dispatch, { type: 'SELECT_CARD', cardId })}
            onMegaView={onMegaView}
          />
        </div>
      );
    }

    return (
      <div>
        <div className="ui-prompt-text">
          Select 1-2 cards from your hand ({selectedCards.length} selected):
        </div>
        <SelectableCardArea
          cards={player.hand}
          selectedCardIds={selectedCards}
          onSelect={(cardId) => toggleCard(cardId)}
          onMegaView={onMegaView}
        />
        <button className="primary" disabled={selectedCards.length === 0} onClick={() => { resolve(dispatch, { type: 'SELECT_CARDS', cardIds: selectedCards }); setSelectedCards([]); }} style={{ margin: '8px auto 0', display: 'block' }}>
          Confirm
        </button>
      </div>
    );
  }

  if (pr.step === 'SELECT_WARE_TYPE') {
    return <WareTypePicker prompt="Choose a ware type to receive" onPick={(wt) => resolve(dispatch, { type: 'SELECT_WARE_TYPE', wareType: wt })} blocked={(wt) => wareChoiceBlocked(state, pr, wt)} />;
  }

  return <div className="ui-helper-text">Processing...</div>;
}

function DrawModifierPanel({ state, dispatch, onMegaView }: { state: GameState; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const cp = state.currentPlayer;
  const hand = state.players[cp].hand;

  if (hand.length === 0 || state.discardPile.length === 0) {
    return (
      <div>
        <div className="ui-prompt-text">
          {hand.length === 0 ? 'No cards in hand to trade.' : 'Discard pile is empty.'}
        </div>
        <button className="primary" onClick={() => resolve(dispatch, { type: 'SELECT_CARD', cardId: '' })} style={{ margin: '8px auto 0', display: 'block' }}>
          Continue
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="ui-prompt-text">
        Mask of Transformation: Select a card from your hand to trade for top of discard pile:
      </div>
      <SelectableCardArea
        cards={hand}
        onSelect={(cardId) => resolve(dispatch, { type: 'SELECT_CARD', cardId })}
        onMegaView={onMegaView}
      />
    </div>
  );
}
