import { useEffect, useState } from 'react';
import type { GameState, PendingResolution, InteractionResponse, WareType, DeckCardId } from '../engine/types.ts';
import { WARE_TYPES } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { CardFace, WareToken, WARE_COLORS } from './CardFace.tsx';
import { MarketDisplay } from './MarketDisplay.tsx';
import { formatResolutionBreadcrumb } from './uiHints.ts';
import { isAuctionBidding } from '../engine/responder.ts';
import { canCancelAction } from '../engine/cancelAction.ts';

interface InteractionPanelProps {
  state: GameState;
  dispatch: (action: import('../engine/types.ts').GameAction) => void;
  viewerPlayer?: 0 | 1;
  onMegaView?: (cardId: DeckCardId) => void;
  /** Cast clients pass this from PublicGameState; local play derives it from state. */
  canCancel?: boolean;
}

function resolve(dispatch: InteractionPanelProps['dispatch'], response: InteractionResponse) {
  dispatch({ type: 'RESOLVE_INTERACTION', response });
}

function getCardGridStyle(cardCount: number) {
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
      margin: '0 auto',
      maxHeight: 'min(42vh, 360px)',
      overflowY: 'auto',
      overflowX: 'hidden',
      paddingRight: 4,
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
    margin: '0 auto',
    maxHeight: 'min(42vh, 360px)',
    overflowY: 'auto',
    overflowX: 'hidden',
    paddingRight: 4,
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
      margin: '0 auto',
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
    margin: '0 auto',
  } as const;
}

function SelectableCardArea({
  cards,
  onSelect,
  onMegaView,
  selectedIndices,
  selectedCardIds,
}: {
  cards: DeckCardId[];
  onSelect: (cardId: DeckCardId, index: number) => void;
  onMegaView?: (cardId: DeckCardId) => void;
  selectedIndices?: number[];
  selectedCardIds?: DeckCardId[];
}) {
  const useOverlap = cards.length >= 8;

  if (!useOverlap) {
    return (
      <div style={getCardGridStyle(cards.length)}>
        {cards.map((cardId, index) => (
          <CardFace
            key={`${cardId}-${index}`}
            cardId={cardId}
            small
            selected={selectedIndices?.includes(index) || selectedCardIds?.includes(cardId)}
            onClick={() => onSelect(cardId, index)}
            onMegaView={onMegaView}
          />
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
        padding: '2px 4px 6px',
        scrollbarWidth: 'thin',
      }}
    >
      {cards.map((cardId, index) => (
        <div
          key={`${cardId}-${index}`}
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

export function InteractionPanel({ state, dispatch, viewerPlayer = 0, onMegaView, canCancel }: InteractionPanelProps) {
  // Guard reaction
  if (state.pendingGuardReaction) {
    const animalCard = getCard(state.pendingGuardReaction.animalCard);
    const isMyReaction = state.pendingGuardReaction.targetPlayer === viewerPlayer;
    if (!isMyReaction) return <PanelShell title="Waiting: opponent deciding Guard reaction" />;
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
    if (!isMyReaction) return <PanelShell title="Waiting: opponent deciding Rain Maker reaction" />;
    const rainMakerCardId = findHandCardByDesign(state, viewerPlayer, 'rain_maker');
    const opponentWareCard = getCard(state.pendingWareCardReaction.wareCardId);
    return (
      <PanelShell
        title="Opponent used a ware card! Play Rain Maker to take it?"
        sourceCardId={state.pendingWareCardReaction.wareCardId}
        onMegaView={onMegaView}
        sourceCardOverlay={opponentWareCard.wares ? (
          <WareCardTradeOverlay
            buyPrice={opponentWareCard.wares.buyPrice}
            sellPrice={opponentWareCard.wares.sellPrice}
            wareTypes={opponentWareCard.wares.types}
          />
        ) : undefined}
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
      title={`${source.name} - Resolve`}
      breadcrumb={breadcrumb}
      sourceCardId={pr.sourceCard}
      onMegaView={onMegaView}
      compactSourceCard={compactSourceCard}
      onCancel={cancellable ? () => dispatch({ type: 'CANCEL_ACTION' }) : undefined}
      cancelLabel={`Cancel ${source.name} and get your action back`}
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

function WareCardTradeOverlay({ buyPrice, sellPrice, wareTypes }: { buyPrice: number; sellPrice: number; wareTypes: WareType[] }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 8,
        right: 8,
        bottom: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '6px 8px',
        borderRadius: 10,
        background: 'rgba(20,10,5,0.55)',
        backdropFilter: 'blur(2px)',
        pointerEvents: 'none',
      }}
    >
      <img src={`/assets/coins/coin_${buyPrice}.png`} alt={`${buyPrice}g`} style={{ width: 54, height: 54 }} draggable={false} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 200 }}>
        {wareTypes.map((wareType, index) => (
          <div
            key={`${wareType}-${index}`}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: WARE_COLORS[wareType],
              border: '2px solid rgba(0,0,0,0.6)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
            title={wareType}
          />
        ))}
      </div>
      <img src={`/assets/coins/coin_${sellPrice}.png`} alt={`${sellPrice}g`} style={{ width: 54, height: 54 }} draggable={false} />
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

function PanelShell({ title, breadcrumb, children, sourceCardId, onMegaView, compactSourceCard, sourceCardOverlay, onCancel, cancelLabel }: { title: string; breadcrumb?: string; children?: React.ReactNode; sourceCardId?: DeckCardId; onMegaView?: (cardId: DeckCardId) => void; compactSourceCard?: boolean; sourceCardOverlay?: React.ReactNode; onCancel?: () => void; cancelLabel?: string }) {
  const sourceCard = sourceCardId ? getCard(sourceCardId) : null;

  // Esc backs out too, while the panel offers it
  useEffect(() => {
    if (!onCancel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="panel-slide" style={{ maxWidth: compactSourceCard ? 980 : 460, margin: '0 auto', width: '100%' }}>
      <div
        className="dialog-pop linen-texture"
        style={{
          borderRadius: 14,
          padding: 'clamp(6px, 2vw, 10px)',
          border: '2px solid #a89880',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          display: compactSourceCard ? 'flex' : 'block',
          flexWrap: compactSourceCard ? 'wrap' : undefined,
          gap: compactSourceCard ? 10 : 0,
          alignItems: 'start',
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
            ✕
          </button>
        )}
        {sourceCard && (
          <div
            onClick={sourceCardId && onMegaView ? () => onMegaView(sourceCardId) : undefined}
            style={{
              cursor: sourceCardId && onMegaView ? 'zoom-in' : 'default',
              maxWidth: compactSourceCard ? 180 : undefined,
              width: compactSourceCard ? 'min(180px, 40vw)' : undefined,
              flex: compactSourceCard ? '0 0 auto' : undefined,
              margin: compactSourceCard ? '0 auto' : undefined,
              position: 'relative',
            }}
          >
            <img
              src={`/assets/cards/${sourceCard.designId}.png`}
              alt={sourceCard.name}
              className={compactSourceCard ? 'panel-source-art-compact' : 'panel-source-art'}
              style={{ width: '100%', borderRadius: 10, display: 'block' }}
              draggable={false}
            />
            {sourceCardOverlay}
          </div>
        )}

        <div className="linen-texture" style={{
          marginTop: sourceCard && !compactSourceCard ? 8 : 0,
          borderRadius: 10,
          padding: 'clamp(10px, 2.5vw, 14px)',
          border: 'none',
          color: '#1a1714',
          flex: compactSourceCard ? '1 1 320px' : undefined,
          minWidth: compactSourceCard ? 0 : undefined,
        }}>
          {breadcrumb && (
            <div style={{
              fontSize: 12,
              color: '#6a5a48',
              textAlign: 'center',
              marginBottom: 6,
              fontWeight: 600,
            }}>
              {breadcrumb}
            </div>
          )}
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 10, color: '#1a1714', letterSpacing: 0.2, textAlign: 'center' }}>
            {title}
          </div>
          {children}
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
      return <WareTypePicker prompt={pr.type === 'WARE_SELECT_MULTIPLE' ? `Pick a ware type (receive x${pr.count})` : 'Choose a ware type'} onPick={(wt) => resolve(dispatch, { type: 'SELECT_WARE_TYPE', wareType: wt })} />;
    case 'BINARY_CHOICE':
      return <BinaryChoicePanel options={pr.options} onChoice={(c) => resolve(dispatch, { type: 'BINARY_CHOICE', choice: c })} />;
    case 'OPPONENT_CHOICE':
      return <BinaryChoicePanel options={pr.options} onChoice={(c) => resolve(dispatch, { type: 'OPPONENT_CHOICE', choice: c })} />;
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

function WareTypePicker({ prompt, onPick, exclude }: { prompt: string; onPick: (wt: WareType) => void; exclude?: WareType }) {
  const types = exclude ? WARE_TYPES.filter(w => w !== exclude) : WARE_TYPES;
  return (
    <div>
      <div className="ui-prompt-text">{prompt}</div>
      <div style={getWareGridStyle(types.length)}>
        {types.map(wt => (
          <button key={wt} onClick={() => onPick(wt)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            <WareToken type={wt} />
          </button>
        ))}
      </div>
    </div>
  );
}

function BinaryChoicePanel({ options, onChoice }: { options: [string, string]; onChoice: (c: 0 | 1) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      <button className="primary" onClick={() => onChoice(0)}>{options[0]}</button>
      <button className="primary" onClick={() => onChoice(1)}>{options[1]}</button>
    </div>
  );
}

function WareTradePanel({ pr, dispatch }: { state: GameState; pr: Extract<PendingResolution, { type: 'WARE_TRADE' }>; dispatch: InteractionPanelProps['dispatch'] }) {
  if (pr.step === 'SELECT_GIVE') {
    return <WareTypePicker prompt="Select ware type to give (all of that type)" onPick={(wt) => resolve(dispatch, { type: 'SELECT_WARE_TYPE', wareType: wt })} />;
  }
  const receivePrompt = pr.giveType != null && pr.giveCount != null
    ? `Trade all ${pr.giveCount} ${pr.giveType} — pick a type to receive:`
    : 'Select ware type to receive';
  return <WareTypePicker prompt={receivePrompt} onPick={(wt) => resolve(dispatch, { type: 'SELECT_WARE_TYPE', wareType: wt })} exclude={pr.giveType} />;
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span className="ui-helper-text">First pick:</span>
            <WareToken type={pr.wares[0]} />
          </div>
        )}
        <WareTypePicker prompt={prompt} onPick={(wt) => resolve(dispatch, { type: 'SELECT_WARE_TYPE', wareType: wt })} />
      </div>
    );
  }

  // Bidding phase
  const isMyBid = pr.nextBidder === viewerPlayer;
  if (!isMyBid) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="ui-helper-text">Step 2/2: waiting for opponent bid...</span>
        <div style={getWareGridStyle(pr.wares.length)}>
          {pr.wares.map((wt, i) => <WareToken key={i} type={wt} />)}
        </div>
        <span className="ui-helper-text">(Current: {pr.currentBid}g)</span>
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span className="ui-helper-text">Auction:</span>
        <div style={getWareGridStyle(pr.wares.length)}>
          {pr.wares.map((wt, i) => <WareToken key={i} type={wt} />)}
        </div>
        <span className="ui-helper-text">Current bid: {pr.currentBid}g. Your turn.</span>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="primary" onClick={() => resolve(dispatch, { type: 'AUCTION_BID', amount: pr.currentBid + 1 })}>
          Bid {pr.currentBid + 1}g
        </button>
        <button onClick={() => resolve(dispatch, { type: 'AUCTION_PASS' })}>Pass</button>
      </div>
    </div>
  );
}

/** Arabian Merchant: bid on the revealed top deck cards; no bids → discarded. */
function CardAuctionPanel({ pr, cards, state, viewerPlayer, dispatch, onMegaView }: { pr: Extract<PendingResolution, { type: 'AUCTION' }>; cards: DeckCardId[]; state: GameState; viewerPlayer: 0 | 1; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const isMyBid = pr.nextBidder === viewerPlayer;
  const nextBid = pr.currentBid + 1;
  const canAfford = state.players[viewerPlayer].gold >= nextBid;
  const leader = pr.currentBid > 0 ? (pr.currentBidder === viewerPlayer ? 'You lead' : 'Opponent leads') : 'No bids yet';
  return (
    <div>
      <div className="ui-prompt-text">
        Auction for {cards.length} card{cards.length === 1 ? '' : 's'} — winner takes them all. If nobody bids, they are discarded.
      </div>
      <SelectableCardArea cards={cards} onSelect={() => {}} onMegaView={onMegaView} />
      <div className="ui-helper-text" style={{ textAlign: 'center', margin: '8px 0' }}>
        {leader}{pr.currentBid > 0 ? ` at ${pr.currentBid}g` : ''}.{' '}
        {isMyBid ? 'Your turn — raise or pass. Passing ends the auction.' : 'Waiting for opponent bid...'}
      </div>
      {isMyBid && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="primary" disabled={!canAfford} onClick={() => resolve(dispatch, { type: 'AUCTION_BID', amount: nextBid })}>
            Bid {nextBid}g
          </button>
          <button onClick={() => resolve(dispatch, { type: 'AUCTION_PASS' })}>Pass</button>
        </div>
      )}
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

function WareSellBulkPanel({ state, pr, dispatch }: { state: GameState; pr: Extract<PendingResolution, { type: 'WARE_SELL_BULK' }>; dispatch: InteractionPanelProps['dispatch'] }) {
  const [selected, setSelected] = useState<number[]>([]);
  const cp = state.currentPlayer;
  const player = state.players[cp];

  const toggleSlot = (i: number) => {
    setSelected(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  };

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

  return (
    <div>
      <div className="ui-prompt-text">
        Select wares to sell at {pr.pricePerWare}g each ({selected.length} selected = {selected.length * pr.pricePerWare}g):
      </div>
      <MarketDisplay market={player.market} onSlotClick={toggleSlot} selectedSlots={selected} />
      <button className="primary" disabled={selected.length === 0} onClick={() => { resolve(dispatch, { type: 'SELL_WARES', wareIndices: selected }); setSelected([]); }} style={{ margin: '8px auto 0', display: 'block' }}>
        Sell ({selected.length * pr.pricePerWare}g)
      </button>
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
  const cp = state.currentPlayer;
  const opponent: 0 | 1 = cp === 0 ? 1 : 0;

  if (pr.step === 'STEAL') {
    const opponentWareCount = state.players[opponent].market.filter(w => w !== null).length;
    return (
      <div>
        <div className="ui-prompt-text">
          Step 1/2: pick 1 of your opponent's wares to take ({opponentWareCount} available).
        </div>
        <MarketDisplay market={state.players[opponent].market} onSlotClick={(i) => resolve(dispatch, { type: 'SELECT_WARE', wareIndex: i })} />
      </div>
    );
  }
  const myWareCount = state.players[cp].market.filter(w => w !== null).length;
  return (
    <div>
      <div className="ui-prompt-text" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        Step 2/2: pick 1 of your wares ({myWareCount} available) to exchange for
        {pr.stolenWare && <WareToken type={pr.stolenWare} size={28} />}
      </div>
      <MarketDisplay market={state.players[cp].market} onSlotClick={(i) => resolve(dispatch, { type: 'SELECT_WARE', wareIndex: i })} />
    </div>
  );
}


function HandSwapPanel({ state, pr, dispatch, onMegaView }: { state: GameState; pr: Extract<PendingResolution, { type: 'HAND_SWAP' }>; dispatch: InteractionPanelProps['dispatch']; onMegaView?: (cardId: DeckCardId) => void }) {
  const cp = state.currentPlayer;
  if (pr.step === 'TAKE') {
    if (pr.revealedHand.length === 0) {
      return (
        <div>
          <div className="ui-prompt-text">Opponent has no cards to take.</div>
          <button className="primary" onClick={() => resolve(dispatch, { type: 'SELECT_CARD', cardId: '' })} style={{ margin: '8px auto 0', display: 'block' }}>
            Continue
          </button>
        </div>
      );
    }
    return (
      <div>
        <div className="ui-prompt-text">
          Step 1/2: take 1 card from opponent's hand ({pr.revealedHand.length} available).
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
        Step 2/2: give 1 card to opponent ({giveOptions.length} valid choices).
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
  const [selected, setSelected] = useState<number[]>([]);
  const target = state.players[pr.targetPlayer];
  const discardCount = target.hand.length - pr.discardTo;

  // Already at or below target — auto-resolve
  if (discardCount <= 0) {
    return (
      <div>
        <div className="ui-prompt-text">
          Opponent has {target.hand.length} card(s); discard target is {pr.discardTo}. No cards need to be discarded.
        </div>
        <button className="primary" onClick={() => resolve(dispatch, { type: 'OPPONENT_DISCARD_SELECTION', cardIndices: [] })} style={{ margin: '8px auto 0', display: 'block' }}>
          Continue
        </button>
      </div>
    );
  }

  if (pr.targetPlayer !== viewerPlayer) {
    return <div className="ui-helper-text">Opponent is choosing cards to discard...</div>;
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
  const isMyPick = pr.currentPicker === viewerPlayer;

  if (pr.draftMode === 'wares') {
    return (
      <div>
        <div className="ui-prompt-text">
          {isMyPick
            ? `Pick 1 ware to keep — you and your opponent alternate. (${pr.availableWares.length} in pool)`
            : `Opponent is picking... (${pr.availableWares.length} in pool)`}
        </div>
        <div style={getWareGridStyle(pr.availableWares.length)}>
          {pr.availableWares.map((wt, i) => (
            isMyPick ? (
              <button key={i} onClick={() => resolve(dispatch, { type: 'SELECT_WARE', wareIndex: i })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                <WareToken type={wt} />
              </button>
            ) : (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
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
          : `Opponent is picking a ${pr.draftMode === 'cards' ? 'card' : 'utility'}... (${cards.length} in pool)`}
      </div>
      {isMyPick ? (
        <SelectableCardArea
          cards={cards}
          onSelect={(cardId) => resolve(dispatch, { type: 'SELECT_CARD', cardId })}
          onMegaView={onMegaView}
        />
      ) : (
        <SelectableCardArea
          cards={cards}
          onSelect={() => {}}
          onMegaView={onMegaView}
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
  const cp = state.currentPlayer;
  const responder = pr.step === 'ACTIVE_CHOOSE' ? cp : (cp === 0 ? 1 : 0);

  if (responder !== viewerPlayer) {
    return <div className="ui-helper-text">Waiting: opponent chooses utility to keep.</div>;
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
  if (pr.step === 'SELECT_UTILITY') {
    const opUtils = state.players[pr.opponentPlayer].utilities;
    if (opUtils.length === 0) {
      return (
        <div>
          <div className="ui-prompt-text">Opponent has no utilities to use.</div>
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
        <div className="ui-prompt-text">Scale step 2/2: keep 1 card (the other goes to opponent).</div>
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
    return <WareTypePicker prompt="Choose a ware type to receive" onPick={(wt) => resolve(dispatch, { type: 'SELECT_WARE_TYPE', wareType: wt })} />;
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
