import { useState } from 'react';
import type { GameState, DeckCardId, WareType } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { keepAndPlayOptions } from './uiHints.ts';
import { validateActivateUtility } from '../engine/validation/actionValidator.ts';
import { WARE_COLORS } from './CardFace.tsx';
import { HandReferenceStrip } from './HandReferenceStrip.tsx';
import { HAND_STRIP_RESERVE_PX } from './ResolveMegaView.tsx';
import { buttonProps } from './a11y.ts';
import { MarketSummary } from './MarketSummary.tsx';

interface ActionButtonsProps {
  state: GameState;
}

export function ActionButtons({ state }: ActionButtonsProps) {
  const isMyTurn = state.currentPlayer === 0;

  // Draw phase buttons - removed, now handled by modal
  if (state.phase === 'DRAW' && isMyTurn) {
    return null;
  }

  // Play phase buttons
  if (state.phase === 'PLAY' && isMyTurn) {
    return null;
  }

  return null;
}

interface CardPlayDialogProps {
  cardId: DeckCardId;
  /** The viewer's market — the dialog covers the board, so show it here */
  market?: readonly (WareType | null)[];
  onBuy: () => void;
  onSell: () => void;
  onCancel: () => void;
}

export function CardPlayDialog({ cardId, market, onBuy, onSell, onCancel }: CardPlayDialogProps) {
  const card = getCard(cardId);
  if (!card.wares) return null;

  return (
    <div
      className="overlay-fade"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        background: 'rgba(20,10,5,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="dialog-pop linen-texture"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(380px, calc(100vw - 16px))',
          borderRadius: 14,
          padding: 8,
          border: '2px solid #a89880',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <img
          src={`/assets/cards/${card.designId}.png`}
          alt={card.name}
          className="dialog-card-art"
          style={{
            width: '100%',
            borderRadius: 10,
            display: 'block',
          }}
          draggable={false}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '2px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={onBuy} {...buttonProps(onBuy, `Buy for ${card.wares.buyPrice}g`)}>
            <img
              src={`/assets/coins/coin_${card.wares.buyPrice}.png`}
              alt={`${card.wares.buyPrice}g`}
              style={{ width: 56, height: 56 }}
              draggable={false}
            />
            <span className="coin-caption">Buy</span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 180 }}>
            {card.wares.types.map((wareType, i) => (
              <div
                key={i}
                style={{
                  width: 'clamp(30px, 9vw, 44px)',
                  height: 'clamp(30px, 9vw, 44px)',
                  borderRadius: '50%',
                  background: WARE_COLORS[wareType],
                  border: '2px solid rgba(0,0,0,0.6)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
                title={wareType}
              />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={onSell} {...buttonProps(onSell, `Sell for ${card.wares.sellPrice}g`)}>
            <img
              src={`/assets/coins/coin_${card.wares.sellPrice}.png`}
              alt={`${card.wares.sellPrice}g`}
              style={{ width: 56, height: 56 }}
              draggable={false}
            />
            <span className="coin-caption">Sell</span>
          </div>
        </div>
        {market && <div style={{ padding: '0 6px 6px' }}><MarketSummary market={market} cardId={cardId} /></div>}
      </div>
    </div>
  );
}

export function DrawModal({ state, dispatch, disabled, disabledReason, onClose, viewerPlayer = 0, onMegaView }: {
  state: GameState;
  dispatch: (action: import('../engine/types.ts').GameAction) => void;
  disabled: boolean;
  disabledReason?: string | null;
  onClose: () => void;
  viewerPlayer?: 0 | 1;
  onMegaView?: (cardId: DeckCardId) => void;
}) {
  const [showCardBack, setShowCardBack] = useState(false);
  
  // Show modal if we have a drawn card OR if we're in draw phase (even without a drawn card yet)
  const shouldShowModal = state.drawnCard || (state.phase === 'DRAW' && state.currentPlayer === viewerPlayer);
  if (!shouldShowModal && !showCardBack) return null;

  const canAct = state.currentPlayer === viewerPlayer && !disabled;
  const maskUtilityIndex = state.players[viewerPlayer].utilities.findIndex(
    (utility) => utility.designId === 'mask_of_transformation' && !utility.usedThisTurn,
  );
  const canUseMaskBeforeDraw =
    canAct &&
    state.phase === 'DRAW' &&
    state.drawnCard === null &&
    maskUtilityIndex !== -1 &&
    validateActivateUtility(state, maskUtilityIndex).valid;

  const handleDiscard = () => {
    dispatch({ type: 'DISCARD_DRAWN' });
    setShowCardBack(true);
  };

  const handleDrawCard = () => {
    dispatch({ type: 'DRAW_CARD' });
    setShowCardBack(false);
  };

  // Drawn a ware card? Offer keep-and-play in one step (same rules and
  // action cost as keeping it, then playing it from the hand).
  const keepAndPlay = keepAndPlayOptions(state, viewerPlayer);
  const handleKeepAndPlay = (mode: 'buy' | 'sell') => {
    const cardId = state.drawnCard;
    if (!cardId) return;
    dispatch({ type: 'KEEP_CARD' });
    dispatch({ type: 'PLAY_CARD', cardId, wareMode: mode });
    setShowCardBack(false);
    onClose();
  };

  const handleSkipDraw = () => {
    dispatch({ type: 'SKIP_DRAW' });
    setShowCardBack(false);
    onClose();
  };

  return (
    <div
      className="overlay-fade"
      onClick={() => {
        setShowCardBack(false);
        onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        background: 'rgba(20,10,5,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Keep the dialog clear of the fixed hand strip at the bottom
        paddingBottom: state.players[viewerPlayer].hand.length > 0 ? HAND_STRIP_RESERVE_PX : undefined,
      }}
    >
      <div
        className="dialog-pop linen-texture"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(380px, calc(100vw - 16px))',
          borderRadius: 14,
          padding: 8,
          border: '2px solid #a89880',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {showCardBack || !state.drawnCard ? (
          <img
            src="/assets/cards/card_back.png"
            alt="Card back"
            className="dialog-card-art"
            style={{
              width: '100%',
              borderRadius: 10,
              display: 'block',
            }}
            draggable={false}
          />
        ) : (
          <>
            <img
              src={`/assets/cards/${getCard(state.drawnCard!).designId}.png`}
              alt={getCard(state.drawnCard!).name}
              className="dialog-card-art"
              style={{
                width: '100%',
                borderRadius: 10,
                display: 'block',
              }}
              draggable={false}
            />
            <div style={{ padding: '0 6px 6px' }}>
              {getCard(state.drawnCard!).wares ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '2px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <img
                      src={`/assets/coins/coin_${getCard(state.drawnCard!).wares!.buyPrice}.png`}
                      alt={`Buy for ${getCard(state.drawnCard!).wares!.buyPrice}g`}
                      style={{ width: 56, height: 56 }}
                      draggable={false}
                    />
                    <span className="coin-caption">Buy</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 180 }}>
                    {getCard(state.drawnCard!).wares!.types.map((wareType, i) => (
                      <div
                        key={i}
                        style={{
                          width: 'clamp(30px, 9vw, 44px)',
                          height: 'clamp(30px, 9vw, 44px)',
                          borderRadius: '50%',
                          background: WARE_COLORS[wareType],
                          border: '2px solid rgba(0,0,0,0.6)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }}
                        title={wareType}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <img
                      src={`/assets/coins/coin_${getCard(state.drawnCard!).wares!.sellPrice}.png`}
                      alt={`Sell for ${getCard(state.drawnCard!).wares!.sellPrice}g`}
                      style={{ width: 56, height: 56 }}
                      draggable={false}
                    />
                    <span className="coin-caption">Sell</span>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1714', marginBottom: 6 }}>
                    {getCard(state.drawnCard!).name}
                  </div>
                  <div style={{ fontSize: 15, color: '#4a4540', lineHeight: 1.4 }}>
                    {getCard(state.drawnCard!).description}
                  </div>
                </>
              )}
            </div>
          </>
        )}
        <MarketSummary
          market={state.players[viewerPlayer].market}
          cardId={!showCardBack && state.drawnCard && getCard(state.drawnCard).wares ? state.drawnCard : null}
        />
        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          padding: '0 6px 6px',
          flexDirection: 'column',
        }}>
          {!canAct && (
            <div className="disabled-hint ui-helper-text" style={{ marginBottom: 2 }}>
              {disabledReason || 'Drawing is currently unavailable.'}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          {showCardBack || !state.drawnCard ? (
            <>
              <button
                className="primary"
                disabled={!canAct || state.keptCardThisDrawPhase || state.actionsLeft <= 0}
                onClick={handleDrawCard}
                style={{ flex: 1, padding: '12px' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div>Draw Card</div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <div
                        key={i}
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: i < state.actionsLeft ? 'var(--gold)' : 'rgba(90,64,48,0.5)',
                          border: '2px solid var(--gold)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </button>
              <button
                disabled={!canAct}
                onClick={handleSkipDraw}
                style={{ flex: 1, padding: '12px' }}
              >
                Skip Draw Phase
              </button>
            </>
          ) : (
            <>
              <button
                className="primary"
                disabled={!canAct}
                onClick={() => {
                  dispatch({ type: 'KEEP_CARD' });
                  setShowCardBack(false);
                  onClose();
                }}
                style={{ flex: 1, padding: '12px' }}
              >
                Keep Card
              </button>
              <button
                className="danger"
                disabled={!canAct}
                onClick={handleDiscard}
                style={{ flex: 1, padding: '12px' }}
              >
                Discard
              </button>
            </>
          )}
          </div>
          {!showCardBack && keepAndPlay && canAct && (
            <div className="keep-and-play">
              <div style={{ display: 'flex', gap: 12 }}>
                {(['buy', 'sell'] as const).map((mode) => (
                  <button
                    key={mode}
                    disabled={!keepAndPlay[mode].valid}
                    onClick={() => handleKeepAndPlay(mode)}
                    title={keepAndPlay[mode].reason}
                    style={{ flex: 1, padding: '10px 12px' }}
                  >
                    {mode === 'buy' ? 'Keep & Buy' : 'Keep & Sell'}
                  </button>
                ))}
              </div>
              <div className="ui-helper-text keep-and-play-hint">
                {keepAndPlay.buy.valid || keepAndPlay.sell.valid
                  ? 'Or keep it now and play it from your hand later.'
                  : keepAndPlay.buy.reason}
              </div>
            </div>
          )}
          {(showCardBack || !state.drawnCard) && canUseMaskBeforeDraw && (
            <button
              className="brown"
              onClick={() => {
                dispatch({ type: 'ACTIVATE_UTILITY', utilityIndex: maskUtilityIndex });
                setShowCardBack(false);
                onClose();
              }}
              style={{ width: '100%', padding: '12px' }}
            >
              Use Mask of Transformation
            </button>
          )}
        </div>
      </div>
      {state.players[viewerPlayer].hand.length > 0 && (
        <HandReferenceStrip hand={state.players[viewerPlayer].hand} onMegaView={onMegaView} />
      )}
    </div>
  );
}
