import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import './tutorial/Tutorial.css';
import { CardFace } from './CardFace.tsx';
import { TraderPortrait } from './TraderPortrait.tsx';
import { traderFor } from '../ai/traders.ts';
import type { TraderMood } from '../ai/traders.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import {
  ACTIONS_PER_TURN, ATTACK_CARD, CARD_KINDS, CHAPTERS, CHAPTER_COUNT, GUARD_CARD, MARKET_SLOTS, MAX_DRAWS,
  MAX_UTILITIES, STAND_SLOTS, STARTING_GOLD, TIPS, TRADE_BUY, TRADE_CARD, TRADE_COUNT, TRADE_SELL, TRADE_START,
  TRADE_WARE, UTILITY_EXAMPLES, WINNING_GOLD, applyTrade, clampChapter, tradeBlocker, tradeGuide,
} from './tutorial/tutorial.ts';
import type { TradeDemo, TradeMove } from './tutorial/tutorial.ts';

interface TutorialOverlayProps {
  onClose: () => void;
  /** The last chapter's gold button — e.g. "Play vs Amara" from the menu. Defaults to closing. */
  finishLabel?: string;
  onFinish?: () => void;
}

/** Mama Zawadi, the market matriarch, teaches — "let us see what you have learned". */
const GUIDE = traderFor('expert');

export function TutorialOverlay({ onClose, finishLabel = 'Start playing', onFinish }: TutorialOverlayProps) {
  const [chapter, setChapter] = useState(0);
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => new Set([0]));
  const [trade, setTrade] = useState<TradeDemo>(TRADE_START);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const goTo = useCallback((index: number) => {
    const next = clampChapter(index);
    setChapter(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }, []);

  const isLast = chapter === CHAPTER_COUNT - 1;
  const finish = onFinish ?? onClose;

  // Focus moves into the dialog, and back to whatever opened it on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && !isTextTarget(e.target)) goTo(chapter + 1);
      else if (e.key === 'ArrowLeft' && !isTextTarget(e.target)) goTo(chapter - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapter, goTo, onClose]);

  // Keep the current chapter's tab in view when the tab row scrolls (phones)
  useEffect(() => {
    dialogRef.current?.querySelector('.tut-tab-current')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [chapter]);

  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const current = CHAPTERS[chapter];
  const guide: { line: string; mood: TraderMood } = current.id === 'trade'
    ? tradeGuide(trade)
    : { line: current.guide, mood: current.id === 'tips' ? 'pleased' : 'neutral' };

  return (
    <div className="tut-scrim overlay-fade" onClick={onClose}>
      <div
        ref={dialogRef}
        className="tut-dialog dialog-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tut-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <header className="tut-head">
          <span className="tut-eyebrow">How to play</span>
          <nav className="tut-tabs" aria-label="Chapters">
            {CHAPTERS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className={`tut-tab${i === chapter ? ' tut-tab-current' : ''}${visited.has(i) && i !== chapter ? ' tut-tab-done' : ''}`}
                aria-current={i === chapter ? 'step' : undefined}
                onClick={() => goTo(i)}
              >
                <span className="tut-tab-num" aria-hidden="true">{visited.has(i) && i !== chapter ? '✓' : i + 1}</span>
                <span className="tut-tab-label">{c.tab}</span>
              </button>
            ))}
          </nav>
          <button type="button" className="tut-close" onClick={onClose} aria-label="Close how to play">✕</button>
        </header>

        <div className="tut-body">
          <aside className="tut-guide">
            <TraderPortrait trader={GUIDE} mood={guide.mood} size={76} />
            <div className="tut-bubble" aria-live="polite">
              <span className="tut-bubble-name">{GUIDE.name}</span>
              <p key={guide.line}>{guide.line}</p>
            </div>
          </aside>

          <section className="tut-stage" key={current.id}>
            <h2 id="tut-title" className="tut-title">{current.title}</h2>
            {current.id === 'goal' && <ChapterGoal />}
            {current.id === 'turn' && <ChapterTurn />}
            {current.id === 'trade' && <ChapterTrade demo={trade} onMove={(m) => setTrade((d) => applyTrade(d, m))} onReset={() => setTrade(TRADE_START)} />}
            {current.id === 'cards' && <ChapterCards />}
            {current.id === 'market' && <ChapterStall />}
            {current.id === 'attacks' && <ChapterAttacks />}
            {current.id === 'tips' && <ChapterTips />}
          </section>
        </div>

        <footer className="tut-foot">
          <button type="button" className="tut-back" onClick={chapter === 0 ? onClose : () => goTo(chapter - 1)}>
            {chapter === 0 ? 'Skip' : 'Back'}
          </button>
          <span className="tut-count">{chapter + 1} of {CHAPTER_COUNT}</span>
          {isLast
            ? <button type="button" className="tut-cta" onClick={finish}>{finishLabel}</button>
            : <button type="button" className="tut-next" onClick={() => goTo(chapter + 1)}>Next: {CHAPTERS[chapter + 1].tab}</button>}
        </footer>
      </div>
    </div>
  );
}

function isTextTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
}

// --- Chapters ----------------------------------------------------------------

function ChapterGoal() {
  const pct = (STARTING_GOLD / WINNING_GOLD) * 100;
  return (
    <>
      <div className="tut-goal-art">
        <picture>
          <source media="(max-width: 699px)" srcSet="/assets/menu/landing_hero_mobile.webp" type="image/webp" />
          <img src="/assets/menu/landing_hero.webp" alt="" draggable={false} />
        </picture>
      </div>
      <div className="tut-meter" role="img" aria-label={`You start with ${STARTING_GOLD} gold; ${WINNING_GOLD} gold ends the game`}>
        <div className="tut-meter-track">
          <div className="tut-meter-fill" style={{ '--from': STARTING_GOLD / WINNING_GOLD } as CSSProperties} />
        </div>
        <span className="tut-meter-mark" style={{ left: `${pct}%` }}>{STARTING_GOLD}g start</span>
        <span className="tut-meter-goal">{WINNING_GOLD}g</span>
      </div>
      <p className="tut-text">
        Buy wares, sell them for more, and use people, animals and tools to get ahead.
        When a trader ends a turn with <strong>{WINNING_GOLD} gold</strong> or more, the rival gets one last turn — then the most gold wins.
      </p>
    </>
  );
}

function ChapterTurn() {
  return (
    <>
      <div className="tut-pips" aria-label={`${ACTIONS_PER_TURN} actions`}>
        {Array.from({ length: ACTIONS_PER_TURN }, (_, i) => (
          <span key={i} className="tut-pip" style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <div className="tut-phases">
        <div className="tut-phase">
          <div className="tut-draw" aria-hidden="true">
            <div className="tut-draw-card tut-draw-back"><CardFace cardId={TRADE_CARD} faceDown small /></div>
            <div className="tut-draw-card tut-draw-front"><CardFace cardId={TRADE_CARD} small /></div>
          </div>
          <div>
            <h3 className="tut-phase-name"><span>1</span> Draw</h3>
            <p className="tut-text-sm">
              Turn over the top card. <strong>Keep it</strong> and drawing ends, or <strong>discard it</strong> and try again — up to {MAX_DRAWS} times.
              Each look costs 1 action. You can skip drawing.
            </p>
          </div>
        </div>
        <div className="tut-phase">
          <div className="tut-play" aria-hidden="true">
            <div className="tut-play-card"><CardFace cardId="basket_maker_1" small /></div>
          </div>
          <div>
            <h3 className="tut-phase-name"><span>2</span> Play</h3>
            <p className="tut-text-sm">
              Spend what's left: play a card from your hand, or use a tool already on the table. Each one costs 1 action.
            </p>
          </div>
        </div>
      </div>
      <p className="tut-callout">End your turn with 2 or more actions unused and earn <strong>+1 gold</strong>.</p>
    </>
  );
}

function ChapterTrade({ demo, onMove, onReset }: { demo: TradeDemo; onMove: (m: TradeMove) => void; onReset: () => void }) {
  const buyBlock = tradeBlocker(demo, 'buy');
  const sellBlock = tradeBlocker(demo, 'sell');
  const hint = demo.sold ? null : !demo.bought ? null : sellBlock;
  return (
    <>
      <div className="tut-trade">
        <div className="tut-trade-card"><CardFace cardId={TRADE_CARD} medium /></div>
        <div className="tut-trade-side">
          <div className="tut-purse" aria-live="polite">
            <img src="/assets/coins/coins.png" alt="" draggable={false} />
            <span key={demo.gold} className="tut-purse-gold">{demo.gold}</span>
            <span className="tut-purse-unit">gold</span>
          </div>
          <div className="tut-stall" aria-label={`Your stall: ${demo.wares} ${TRADE_WARE}`}>
            {Array.from({ length: MARKET_SLOTS }, (_, i) => (
              <span key={i} className="tut-slot">
                {i < demo.wares && (
                  <img className="tut-token" src={`/assets/tokens/${TRADE_WARE}.png`} alt={TRADE_WARE} style={{ '--i': i } as CSSProperties} draggable={false} />
                )}
              </span>
            ))}
          </div>
          <div className="tut-trade-buttons">
            <button type="button" className="tut-buy" disabled={!!buyBlock} title={buyBlock ?? undefined} onClick={() => onMove('buy')}>
              Buy {TRADE_COUNT} tea · {TRADE_BUY}g
            </button>
            <button type="button" className="tut-sell" disabled={!!sellBlock} title={sellBlock ?? undefined} onClick={() => onMove('sell')}>
              Sell {TRADE_COUNT} tea · {TRADE_SELL}g
            </button>
          </div>
          {hint && <p className="tut-hint">{hint}</p>}
          {demo.sold && <button type="button" className="tut-link" onClick={onReset}>Try it again</button>}
        </div>
      </div>
      <p className="tut-text-sm">
        In a game, tap the coins on a ware card: <strong className="tut-buy-word">left buys</strong>, <strong className="tut-sell-word">right sells</strong>.
        The squares between them are the wares it trades. Wares are shared — when the supply of one runs out, nobody can buy it.
      </p>
    </>
  );
}

function ChapterCards() {
  const [picked, setPicked] = useState(0);
  const card = getCard(CARD_KINDS[picked].example);
  return (
    <>
      <div className="tut-kinds" role="radiogroup" aria-label="Card types">
        {CARD_KINDS.map((k, i) => (
          <button
            key={k.label}
            type="button"
            role="radio"
            aria-checked={i === picked}
            className={`tut-kind${i === picked ? ' tut-kind-picked' : ''}`}
            style={{ '--kind': k.color, '--i': i } as CSSProperties}
            onClick={() => setPicked(i)}
          >
            <span className="tut-kind-card" aria-hidden="true"><CardFace cardId={k.example} small /></span>
            <span className="tut-kind-label">{k.label}</span>
            <span className="tut-kind-blurb">{k.blurb}</span>
          </button>
        ))}
      </div>
      <div className="tut-detail" aria-live="polite" style={{ '--kind': CARD_KINDS[picked].color } as CSSProperties}>
        <strong>{card.name}</strong> — {card.description}
      </div>
      <p className="tut-text-sm">Every card costs 1 action to play. In a game, tap the bottom strip of any card to see it full size.</p>
    </>
  );
}

function ChapterStall() {
  return (
    <div className="tut-stall-chapter">
      <div className="tut-panel">
        <h3 className="tut-panel-title">Stall: {MARKET_SLOTS} spaces</h3>
        <div className="tut-stall tut-stall-static" aria-hidden="true">
          {(['trinkets', 'hides', 'tea', 'silk', 'fruit'] as const).map((w) => (
            <span key={w} className="tut-slot"><img className="tut-token tut-token-still" src={`/assets/tokens/${w}.png`} alt="" draggable={false} /></span>
          ))}
          <span className="tut-slot tut-slot-fee">2g</span>
        </div>
        <p className="tut-text-sm">
          Bought wares sit here until you sell them. Filling the 6th space costs 2 gold each time.
          A <strong>Small Market Stand</strong> adds {STAND_SLOTS} more spaces.
        </p>
      </div>
      <div className="tut-panel tut-panel-green">
        <h3 className="tut-panel-title">Tools: up to {MAX_UTILITIES}</h3>
        <div className="tut-utils" aria-hidden="true">
          {UTILITY_EXAMPLES.map((id, i) => (
            <span key={id} className="tut-util" style={{ '--i': i } as CSSProperties}><CardFace cardId={id} small scale={0.72} /></span>
          ))}
        </div>
        <p className="tut-text-sm">
          Utility cards stay on the table. Use each one once per turn, for 1 action — a Well turns 1 gold into a card, every turn.
        </p>
      </div>
    </div>
  );
}

function ChapterAttacks() {
  return (
    <>
      <div className="tut-clash" aria-hidden="true">
        <span className="tut-clash-animal"><CardFace cardId={ATTACK_CARD} small /></span>
        <span className="tut-clash-guard"><CardFace cardId={GUARD_CARD} small /></span>
        <span className="tut-clash-stamp">Blocked</span>
      </div>
      <ul className="tut-list">
        <li><strong>Animals</strong> hit your rival: a Parrot steals a ware, a Hyena takes a card from their hand and gives one back, a Crocodile uses one of their tools and then throws it away.</li>
        <li><strong>Guard</strong> cancels any animal. <strong>Rain Maker</strong> grabs the ware card your rival just used. Both are played on your rival's turn and cost no action.</li>
      </ul>
    </>
  );
}

function ChapterTips() {
  return (
    <ol className="tut-tips">
      {TIPS.map((t, i) => (
        <li key={t.title} style={{ '--i': i } as CSSProperties}>
          <strong>{t.title}</strong> {t.body}
        </li>
      ))}
    </ol>
  );
}
