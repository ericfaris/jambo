import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { buildGameStory } from '../../src/ui/gameStory.ts';
import { chartScale, GoldChart } from '../../src/ui/GoldChart.tsx';
import { EndgameOverlay, winnerHeadline, midSentence, mvpAddsToPayday } from '../../src/ui/EndgameOverlay.tsx';
import { createStartingState } from '../../src/persistence/replayLog.ts';
import { processAction } from '../../src/engine/GameEngine.ts';
import { getAiActionByDifficulty } from '../../src/ai/difficulties/index.ts';
import { getRandomAiAction } from '../../src/ai/RandomAI.ts';
import { createRng } from '../../src/utils/rng.ts';
import type { GameAction, GameState } from '../../src/engine/types.ts';

/** Play a whole seeded game and keep the action list, like the store does. */
function playGame(seed: number): { start: GameState; actions: GameAction[]; end: GameState } {
  const start = createStartingState(seed, 0);
  const rng = createRng(seed);
  let s = start;
  const actions: GameAction[] = [];
  for (let i = 0; i < 2000 && s.phase !== 'GAME_OVER'; i++) {
    const a = s.currentPlayer === 0 ? getRandomAiAction(s, rng) : getAiActionByDifficulty(s, 'medium');
    if (!a) break;
    s = processAction(s, a);
    actions.push(a);
  }
  return { start, actions, end: s };
}

describe('game story (replayed from the seeded start)', () => {
  const { start, actions, end } = playGame(4242);

  it('the timeline starts at 20g each and ends at the final totals', () => {
    const story = buildGameStory(start, actions);
    expect(end.phase).toBe('GAME_OVER');
    expect(story.timeline[0]).toEqual({ turn: 0, gold: [20, 20] });
    expect(story.timeline[story.timeline.length - 1].gold).toEqual([end.players[0].gold, end.players[1].gold]);
    const turns = story.timeline.map((p) => p.turn);
    expect([...turns].sort((a, b) => a - b)).toEqual(turns); // in order
  });

  it('finds the 60g trigger, a biggest swing, and positive paydays / MVPs', () => {
    const story = buildGameStory(start, actions);
    expect(story.triggerTurn).not.toBeNull();
    expect(story.biggestSwing?.gain).toBeGreaterThan(0);
    for (const p of [0, 1] as const) {
      if (story.bestPayday[p]) expect(story.bestPayday[p]!.gold).toBeGreaterThan(0);
      if (story.mvp[p]) expect(story.mvp[p]!.gold).toBeGreaterThan(0);
    }
    // the winner's best payday is at least one sale's worth
    expect(Math.max(story.bestPayday[0]?.gold ?? 0, story.bestPayday[1]?.gold ?? 0)).toBeGreaterThanOrEqual(10);
  });

  it('the biggest swing really is the largest one-turn gain on the other player', () => {
    const story = buildGameStory(start, actions);
    const tl = story.timeline;
    let best = 0;
    for (let i = 1; i < tl.length; i++) {
      for (const owner of [0, 1] as const) {
        const other = owner === 0 ? 1 : 0;
        best = Math.max(best, (tl[i].gold[owner] - tl[i - 1].gold[owner]) - (tl[i].gold[other] - tl[i - 1].gold[other]));
      }
    }
    expect(story.biggestSwing!.gain).toBe(best);
  });

  it('numbers turns like the game does: the last point is the final turn, not one past it', () => {
    const story = buildGameStory(start, actions);
    const tl = story.timeline;
    expect(tl[tl.length - 1].turn).toBe(end.turn);
    expect(new Set(tl.map((p) => p.turn)).size).toBe(tl.length); // one point per turn
    expect(tl[1].turn).toBe(1); // the end of turn 1
    expect(story.biggestSwing!.turn).toBeGreaterThanOrEqual(1);
    expect(story.biggestSwing!.turn).toBeLessThanOrEqual(end.turn);
    // the trigger turn is a turn someone actually ended on 60g+
    const trig = tl.find((p) => p.turn === story.triggerTurn);
    expect(trig && Math.max(...trig.gold)).toBeGreaterThanOrEqual(60);
  });

  it('counts every turn, including ones that end on their last action rather than END_TURN', () => {
    // two engine AIs spend all five actions often, so turns end without END_TURN
    const start = createStartingState(777, 0);
    let st = start;
    const acts: GameAction[] = [];
    let autoEnded = 0;
    for (let i = 0; i < 3000 && st.phase !== 'GAME_OVER'; i++) {
      const a = getAiActionByDifficulty(st, 'medium');
      if (!a) break;
      const next = processAction(st, a);
      if (next.turn !== st.turn && a.type !== 'END_TURN') autoEnded++;
      st = next;
      acts.push(a);
    }
    expect(st.phase).toBe('GAME_OVER');
    expect(autoEnded).toBeGreaterThan(0);
    const story = buildGameStory(start, acts);
    // one point per turn played, plus the start
    expect(story.timeline.map((p) => p.turn)).toEqual(Array.from({ length: st.turn + 1 }, (_, i) => i));
  });

  it('a replay that stops applying tells the story so far instead of throwing', () => {
    const broken = [...actions.slice(0, 20), { type: 'ACTIVATE_UTILITY', utilityIndex: 9 } as GameAction, ...actions.slice(20)];
    expect(() => buildGameStory(start, broken)).not.toThrow();
  });
});

describe('gold chart', () => {
  const tl = [{ turn: 0, gold: [20, 20] as [number, number] }, { turn: 10, gold: [44, 30] as [number, number] }, { turn: 20, gold: [66, 58] as [number, number] }];
  it('keeps the 60g line inside the plot and scales past it when needed', () => {
    const { y, maxGold } = chartScale(tl);
    expect(maxGold).toBeGreaterThanOrEqual(70);
    expect(y(60)).toBeGreaterThan(0);
    expect(y(0)).toBeGreaterThan(y(60));
  });
  it('labels only values the axes reach', () => {
    const html = renderToStaticMarkup(createElement(GoldChart, { timeline: tl, labels: ['You', 'AI'] }));
    expect(html).toContain('Turn 20');
    expect(html).toContain('>60<');
    expect(html).toContain('You finished with 66g');
  });
});

describe('endgame overlay', () => {
  it('headlines read for solo and hotseat', () => {
    expect(winnerHeadline(0, ['You', 'AI'])).toBe('You win!');
    expect(winnerHeadline(1, ['You', 'AI'])).toBe('AI wins!');
    expect(winnerHeadline(1, ['Player 1', 'Player 2'])).toBe('Player 2 wins!');
  });

  it('shows the story, the record and a same-difficulty rematch', () => {
    const { start, actions, end } = playGame(4242);
    const story = buildGameStory(start, actions);
    const html = renderToStaticMarkup(createElement(EndgameOverlay, {
      state: end, story, labels: ['You', 'AI'], viewer: 0, onRematch: () => {}, rematchLabel: 'Rematch · Hard', record: { wins: 3, losses: 2 },
    }));
    expect(html).toContain('Rematch · Hard');
    expect(html).toContain('Biggest swing');
    expect(html).toContain('gold-chart');
    expect(html).toContain('Your record at this level: 3–2');
  });

  it('hotseat never says "AI"', () => {
    const { end } = playGame(4242);
    const html = renderToStaticMarkup(createElement(EndgameOverlay, { state: end, labels: ['Player 1', 'Player 2'], viewer: null, onRematch: () => {} }));
    expect(html).not.toContain('AI');
    const winner = html.match(/Player ([12]) wins!/)![1];
    // the facts follow the winner, not always Player 1
    if (html.includes('MVP card')) expect(html).toContain(`Player ${winner}&#x27;s MVP card`);
  });
});

describe('endgame portraits', () => {
  it('puts your avatar above "You", like the trader above theirs', () => {
    const { end } = playGame(4242);
    const html = renderToStaticMarkup(createElement(EndgameOverlay, {
      state: end, labels: ['You', 'Baraka'], viewer: 0, onRematch: () => {},
      playerPortrait: createElement('span', { className: 'test-you-portrait' }),
      opponentPortrait: createElement('span', { className: 'test-trader-portrait' }),
    }));
    // each portrait sits in its side's column, before that side's name
    expect(html.indexOf('test-you-portrait')).toBeLessThan(html.indexOf('>You<'));
    expect(html.indexOf('>You<')).toBeLessThan(html.indexOf('test-trader-portrait'));
    expect(html.indexOf('test-trader-portrait')).toBeLessThan(html.indexOf('>Baraka<'));
  });
});

describe('endgame copy', () => {
  it('"You" mid-sentence reads "you"; names stay capitalized', () => {
    expect(midSentence('You')).toBe('you');
    expect(midSentence('Mama Zawadi')).toBe('Mama Zawadi');
  });
});

describe('endgame facts and the trader’s last word', () => {
  it('skips an MVP tile that only repeats the best payday', () => {
    expect(mvpAddsToPayday({ cardId: 'dancer_1', plays: 1 }, { cardId: 'dancer_2' })).toBe(false);
    expect(mvpAddsToPayday({ cardId: 'dancer_1', plays: 3 }, { cardId: 'dancer_2' })).toBe(true);
    expect(mvpAddsToPayday({ cardId: 'weapons_1', plays: 1 }, { cardId: 'dancer_1' })).toBe(true);
    expect(mvpAddsToPayday({ cardId: 'weapons_1', plays: 1 }, null)).toBe(true);
    expect(mvpAddsToPayday(null, { cardId: 'dancer_1' })).toBe(false);
  });

  it('quotes the trader under the scores', () => {
    const { end } = playGame(4242);
    const html = renderToStaticMarkup(createElement(EndgameOverlay, {
      state: end, labels: ['You', 'Baraka'], viewer: 0, onRematch: () => {}, opponentQuote: 'Hmph. Enjoy it.',
    }));
    expect(html).toContain('endgame-quote');
    expect(html).toContain('“Hmph. Enjoy it.”');
    expect(html).toContain('— Baraka');
    const none = renderToStaticMarkup(createElement(EndgameOverlay, { state: end, labels: ['Player 1', 'Player 2'], viewer: null, onRematch: () => {} }));
    expect(none).not.toContain('endgame-quote');
  });
});
