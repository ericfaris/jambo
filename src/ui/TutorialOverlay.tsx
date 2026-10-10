import { useState, useEffect, useCallback } from 'react';

interface TutorialOverlayProps {
  onClose: () => void;
}

const TOTAL_SLIDES = 8;

function SlideHeader({ label, title }: { label: string; title: string }) {
  return (
    <>
      <div style={{
        fontSize: 15,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        color: 'var(--text-muted)',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 'clamp(32px, 7vw, 48px)',
        color: 'var(--gold)',
        textShadow: '0 2px 12px rgba(0,0,0,0.6)',
      }}>
        {title}
      </div>
      <div style={{
        width: 60,
        height: 3,
        borderRadius: 2,
        background: 'var(--gold)',
        opacity: 0.5,
      }} />
    </>
  );
}

function SlideWelcome() {
  return (
    <>
      <SlideHeader label="How to Play" title="Welcome to the Market" />
      <img
        src="/assets/menu/main_menu.png"
        alt="African marketplace"
        style={{ width: 'auto', maxWidth: '100%', maxHeight: '36dvh', borderRadius: 12, opacity: 0.8 }}
      />
      <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text)', margin: 0, maxWidth: 540 }}>
        You are a trader in a bustling African marketplace. Buy and sell exotic wares — trinkets, hides, tea, silk, fruit, and salt — to grow your fortune.
      </p>
      <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text)', margin: 0, maxWidth: 540 }}>
        Play cards to hire helpers, unleash animals on your rival, and use powerful utilities. The first trader to reach{' '}
        <span style={{ color: 'var(--gold)', fontWeight: 700 }}>60 gold</span> triggers the final round.
      </p>
    </>
  );
}

function SlideTurnOverview() {
  return (
    <>
      <SlideHeader label="Turn Structure" title="Your Turn at a Glance" />
      <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text-muted)', margin: 0, maxWidth: 560 }}>
        Each turn you get <span style={{ color: 'var(--gold)', fontWeight: 700 }}>5 actions</span>, split across two phases:
      </p>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 600 }}>
        <div style={{ flex: '1 1 220px', background: 'rgba(212,168,80,0.08)', borderRadius: 10, padding: 16, border: '1px solid rgba(212,168,80,0.2)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', color: 'var(--gold)', fontSize: 19, marginBottom: 8 }}>
            Phase 1 — Draw
          </div>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--text-muted)', margin: 0 }}>
            Draw the top card of the deck. <strong style={{ color: 'var(--text)' }}>Keep it</strong> (ends the phase) or{' '}
            <strong style={{ color: 'var(--text)' }}>discard it</strong> and try again. Each draw costs 1 action.
          </p>
        </div>
        <div style={{ flex: '1 1 220px', background: 'rgba(212,168,80,0.08)', borderRadius: 10, padding: 16, border: '1px solid rgba(212,168,80,0.2)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', color: 'var(--gold)', fontSize: 19, marginBottom: 8 }}>
            Phase 2 — Play
          </div>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--text-muted)', margin: 0 }}>
            Play cards from your hand. Each card costs 1 action. Play wares, people, animals, or utilities.
          </p>
        </div>
      </div>

      <div style={{ background: 'rgba(106,138,64,0.12)', borderRadius: 8, padding: 12, border: '1px solid rgba(106,138,64,0.2)', maxWidth: 600 }}>
        <span style={{ fontSize: 16, color: '#6a8a40', fontWeight: 600 }}>
          Bonus: End your turn with 2+ unused actions to earn +1 gold!
        </span>
      </div>
    </>
  );
}

function SlideCardTypes() {
  const types = [
    { name: 'Ware', color: '#a08050', desc: 'Buy or sell goods', example: 'ware_3k' },
    { name: 'People', color: 'var(--card-people, #4a7a9b)', desc: 'One-time helpers', example: 'guard' },
    { name: 'Animal', color: 'var(--card-animal, #c04030)', desc: 'Attack your rival', example: 'crocodile' },
    { name: 'Utility', color: 'var(--card-utility, #6a8a40)', desc: 'Reusable each turn', example: 'well' },
    { name: 'Stand', color: '#8B7355', desc: 'Expand your market', example: 'small_market_stand' },
  ];

  return (
    <>
      <SlideHeader label="Card Types" title="Five Kinds of Cards" />
      <p style={{ fontSize: 17, lineHeight: 1.5, color: 'var(--text-muted)', margin: 0 }}>
        The 110-card deck has five types. Each costs 1 action to play.
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
        gap: 14,
        width: '100%',
        maxWidth: 700,
      }}>
        {types.map((t) => (
          <div key={t.name} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}>
            <img
              src={`/assets/cards/${t.example}.png`}
              alt={t.name}
              style={{
                width: '100%',
                maxWidth: 130,
                aspectRatio: '5 / 7',
                objectFit: 'cover',
                borderRadius: 6,
              }}
            />
            <span style={{
              display: 'inline-block',
              background: t.color,
              color: '#fff',
              borderRadius: 4,
              padding: '3px 10px',
              fontSize: 14,
              fontWeight: 700,
            }}>
              {t.name}
            </span>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.3 }}>{t.desc}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function SlideBuyingSelling() {
  return (
    <>
      <SlideHeader label="Trading" title="Buying & Selling Wares" />
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 640 }}>
        {/* Card with overlay mock */}
        <div style={{ position: 'relative', width: 150, flexShrink: 0 }}>
          <img src="/assets/cards/ware_3k.png" alt="Ware card example" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
          {/* Overlay matching CardFace.tsx */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 5,
            background: 'rgba(0,0,0,0.35)',
            borderRadius: '0 0 8px 8px',
          }}>
            <img src="/assets/coins/coin_3.png" alt="Buy 3g" style={{ width: 32, height: 32 }} draggable={false} />
            <div style={{ display: 'flex', gap: 5 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  background: 'var(--ware-trinkets)',
                  border: '1.5px solid rgba(0,0,0,0.6)',
                }} />
              ))}
            </div>
            <img src="/assets/coins/coin_10.png" alt="Sell 10g" style={{ width: 32, height: 32 }} draggable={false} />
          </div>

          {/* Buy arrow label */}
          <div style={{
            position: 'absolute',
            bottom: -28,
            left: 0,
            fontSize: 13,
            fontWeight: 700,
            color: '#6a8a40',
            textAlign: 'center',
            width: 50,
          }}>
            Buy
          </div>
          {/* Sell arrow label */}
          <div style={{
            position: 'absolute',
            bottom: -28,
            right: 0,
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--gold)',
            textAlign: 'center',
            width: 50,
          }}>
            Sell
          </div>
        </div>

        <div style={{ flex: '1 1 280px', textAlign: 'left' }}>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text)', marginTop: 0, marginBottom: 12 }}>
            Every ware card can <strong>buy</strong> or <strong>sell</strong> — you choose when you play it.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--text-muted)', marginTop: 0, marginBottom: 14 }}>
            Tap the <strong style={{ color: '#6a8a40' }}>left coin</strong> to buy wares from the supply.
            Tap the <strong style={{ color: 'var(--gold)' }}>right coin</strong> to sell wares for gold.
            The colored circles show which ware types the card trades.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, background: 'rgba(106,138,64,0.12)', borderRadius: 8, padding: 12, border: '1px solid rgba(106,138,64,0.2)' }}>
              <div style={{ fontWeight: 700, color: '#6a8a40', fontSize: 16, marginBottom: 4 }}>Buy</div>
              <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>Pay gold, receive wares from supply.</div>
            </div>
            <div style={{ flex: 1, background: 'rgba(212,168,80,0.12)', borderRadius: 8, padding: 12, border: '1px solid rgba(212,168,80,0.2)' }}>
              <div style={{ fontWeight: 700, color: 'var(--gold)', fontSize: 16, marginBottom: 4 }}>Sell</div>
              <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>Return wares to supply, receive gold.</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        {(['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt'] as const).map((w) => (
          <div key={w} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <img src={`/assets/tokens/${w}.png`} alt={w} style={{ width: 48, height: 48, borderRadius: 4 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{w}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function SlideMarketUtilities() {
  return (
    <>
      <SlideHeader label="Equipment" title="Your Market & Utilities" />
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 620 }}>
        <div style={{ flex: '1 1 240px', background: 'rgba(212,168,80,0.08)', borderRadius: 10, padding: 16, border: '1px solid rgba(212,168,80,0.2)', textAlign: 'left' }}>
          <div style={{ fontFamily: 'var(--font-heading)', color: 'var(--gold)', fontSize: 19, marginBottom: 8 }}>
            Market (6 slots)
          </div>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--text-muted)', margin: 0 }}>
            Your market holds wares you've bought. Play a <strong style={{ color: 'var(--text)' }}>Small Market Stand</strong> to add 3 more slots. Fill your market, then sell for profit!
          </p>
        </div>
        <div style={{ flex: '1 1 240px', background: 'rgba(106,138,64,0.08)', borderRadius: 10, padding: 16, border: '1px solid rgba(106,138,64,0.2)', textAlign: 'left' }}>
          <div style={{ fontFamily: 'var(--font-heading)', color: '#6a8a40', fontSize: 19, marginBottom: 8 }}>
            Utilities (max 3)
          </div>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--text-muted)', margin: 0 }}>
            Play utility cards face-up. <strong style={{ color: 'var(--text)' }}>Activate</strong> each once per turn for 1 action.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <img src="/assets/cards/well.png" alt="Well" style={{ width: 52, height: 75, objectFit: 'cover', borderRadius: 4 }} />
            <img src="/assets/cards/drums.png" alt="Drums" style={{ width: 52, height: 75, objectFit: 'cover', borderRadius: 4 }} />
            <img src="/assets/cards/boat.png" alt="Boat" style={{ width: 52, height: 75, objectFit: 'cover', borderRadius: 4 }} />
          </div>
        </div>
      </div>
    </>
  );
}

function SlideHelpersAttackers() {
  return (
    <>
      <SlideHeader label="Characters" title="Helpers & Attackers" />
      <div style={{ maxWidth: 560, width: '100%' }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 14, alignItems: 'flex-start', textAlign: 'left' }}>
          <img src="/assets/cards/basket_maker.png" alt="People card" style={{ width: 70, height: 100, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--card-people, #4a7a9b)', marginBottom: 4 }}>People Cards</div>
            <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--text-muted)', margin: 0 }}>
              One-time effects — hire a Basket Maker for cheap wares, a Dancer to sell at premium prices, or a Psychic to peek at the deck.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, marginBottom: 14, alignItems: 'flex-start', textAlign: 'left' }}>
          <img src="/assets/cards/crocodile.png" alt="Animal card" style={{ width: 70, height: 100, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--card-animal, #c04030)', marginBottom: 4 }}>Animal Cards</div>
            <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--text-muted)', margin: 0 }}>
              Attack your opponent! Steal wares with a Parrot, swap hands with a Hyena, or use their utility with a Crocodile.
            </p>
          </div>
        </div>

        <div style={{ background: 'rgba(212,168,80,0.08)', borderRadius: 8, padding: 14, border: '1px solid rgba(212,168,80,0.2)', textAlign: 'left' }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--gold)', marginBottom: 6 }}>Reactions (free!)</div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <img src="/assets/cards/guard.png" alt="Guard" style={{ width: 52, height: 75, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
            <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--text-muted)', margin: 0 }}>
              <strong style={{ color: 'var(--text)' }}>Guard</strong> — cancel any animal attack.{' '}
              <strong style={{ color: 'var(--text)' }}>Rain Maker</strong> — steal an opponent's ware card after they trade.
              Cost 0 actions.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function SlideMegaView() {
  return (
    <>
      <SlideHeader label="Interface" title="Need a Closer Look?" />
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 600 }}>
        {/* Card with highlighted bottom bar */}
        <div style={{ position: 'relative', width: 150, flexShrink: 0 }}>
          <img src="/assets/cards/guard.png" alt="Guard card" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
          {/* Mock bottom overlay matching CardFace.tsx */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'rgba(255,255,255,0.85)',
            padding: '5px 6px',
            borderRadius: '0 0 8px 8px',
            boxShadow: '0 0 12px rgba(212,168,80,0.6), 0 0 24px rgba(212,168,80,0.3)',
            border: '2px solid var(--gold)',
            borderTop: '2px solid var(--gold)',
          }}>
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#1a1714',
              lineHeight: 1,
              textAlign: 'center',
            }}>
              Guard
            </div>
            <div style={{
              fontSize: 9,
              color: '#4a4540',
              lineHeight: 1.2,
              textAlign: 'center',
              marginTop: 2,
            }}>
              Cancel an animal attack
            </div>
          </div>
          {/* Tap here label */}
          <div style={{
            position: 'absolute',
            bottom: -30,
            left: 0,
            right: 0,
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--gold)',
            textAlign: 'center',
          }}>
            Tap here
          </div>
        </div>

        <div style={{ flex: '1 1 280px', textAlign: 'left' }}>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text)', marginTop: 0, marginBottom: 12 }}>
            Tap the <strong style={{ color: 'var(--gold)' }}>bottom bar</strong> on any card in your hand to open <strong>Mega View</strong> — a full-size display of the card with all its details.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--text-muted)', marginTop: 0, marginBottom: 0 }}>
            For ware cards, tap the coin overlays to buy or sell directly. The bottom bar on other cards shows the card name and a short description.
          </p>
        </div>
      </div>
    </>
  );
}

function SlideTips() {
  return (
    <>
      <SlideHeader label="Strategy" title="Beginner Tips" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 560 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 14, textAlign: 'left' }}>
          <span style={{ fontSize: 22, flexShrink: 0, color: 'var(--gold)', fontWeight: 700 }}>1.</span>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--text)', margin: 0 }}>
            <strong>Buy low, sell high.</strong> Fill your market with cheap 3-ware cards, then sell everything with an expensive 6-ware card for big profit.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 14, textAlign: 'left' }}>
          <span style={{ fontSize: 22, flexShrink: 0, color: 'var(--gold)', fontWeight: 700 }}>2.</span>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--text)', margin: 0 }}>
            <strong>Keep a Guard handy.</strong> Animal attacks can be devastating — a Guard protects you from Elephants, Crocodiles, and other threats.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 14, textAlign: 'left' }}>
          <span style={{ fontSize: 22, flexShrink: 0, color: 'var(--gold)', fontWeight: 700 }}>3.</span>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--text)', margin: 0 }}>
            <strong>Don't waste actions.</strong> End your turn early with 2+ unused actions to earn a +1 gold bonus.
          </p>
        </div>
      </div>
    </>
  );
}

export function TutorialOverlay({ onClose }: TutorialOverlayProps) {
  const [slideIndex, setSlideIndex] = useState(0);

  const handleNext = useCallback(() => {
    setSlideIndex((prev) => Math.min(prev + 1, TOTAL_SLIDES - 1));
  }, []);

  const handleBack = useCallback(() => {
    setSlideIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (slideIndex < TOTAL_SLIDES - 1) handleNext();
        else onClose();
      } else if (e.key === 'ArrowLeft') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, slideIndex, handleNext, handleBack]);

  const slides = [
    <SlideWelcome key="welcome" />,
    <SlideTurnOverview key="turn" />,
    <SlideCardTypes key="cards" />,
    <SlideBuyingSelling key="wares" />,
    <SlideMarketUtilities key="market" />,
    <SlideHelpersAttackers key="helpers" />,
    <SlideMegaView key="mega" />,
    <SlideTips key="tips" />,
  ];

  const isLastSlide = slideIndex === TOTAL_SLIDES - 1;

  return (
    <div
      className="overlay-fade"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,10,5,0.92)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        className="dialog-pop"
        onClick={(e) => e.stopPropagation()}
        style={{
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          maxWidth: 720,
          width: '94vw',
          maxHeight: '88vh',
          overflowY: 'auto',
          padding: '8px 16px',
        }}
      >
        {/* Slide content */}
        {slides[slideIndex]}

        {/* Nav stays pinned to the bottom of the scroller: on a 900px laptop
            the first slide's art used to push Next/Close below the fold */}
        <div style={{
          position: 'sticky',
          bottom: -8,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          padding: '8px 0',
          background: 'linear-gradient(to bottom, rgba(16,9,4,0), rgba(16,9,4,0.96) 22%)',
        }}>
        {/* Divider before nav */}
        <div style={{
          width: '100%',
          height: 1,
          background: 'var(--border-light)',
          opacity: 0.3,
          marginTop: 4,
        }} />

        {/* Dot indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
          {Array.from({ length: TOTAL_SLIDES }, (_, i) => (
            <button
              key={i}
              onClick={() => setSlideIndex(i)}
              style={{
                width: i === slideIndex ? 20 : 8,
                height: 8,
                borderRadius: 4,
                border: 'none',
                background: i === slideIndex ? 'var(--gold)' : 'rgba(212,168,80,0.25)',
                cursor: 'pointer',
                padding: 0,
                transition: 'all 0.2s ease',
              }}
            />
          ))}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 400 }}>
          <button
            onClick={slideIndex === 0 ? onClose : handleBack}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 14,
              fontFamily: 'var(--font-heading)',
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            {slideIndex === 0 ? 'Close' : 'Back'}
          </button>

          <button
            onClick={isLastSlide ? onClose : handleNext}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 8,
              border: '2px solid var(--gold)',
              background: 'rgba(212,168,80,0.10)',
              color: 'var(--gold)',
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,168,80,0.20)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(212,168,80,0.10)'; }}
          >
            {isLastSlide ? 'Start Playing' : 'Next'}
          </button>
        </div>

        {/* Page counter */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', opacity: 0.6 }}>
          {slideIndex + 1} / {TOTAL_SLIDES}
        </div>
        </div>
      </div>
    </div>
  );
}
