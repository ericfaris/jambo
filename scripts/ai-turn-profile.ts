/// <reference types="node" />
// Profiles how an AI spends its turns: early END_TURN (idle +1g bonus) vs draws, buys, sells.
// Usage: tsx scripts/ai-turn-profile.ts <subject> <opponent> [games] [seedBase]
// PROFILE_DEBUG=1 prints every turn ended with 4+ actions unused (with Expert's candidate scores).
import { createInitialState } from '../src/engine/GameState.ts';
import { processAction } from '../src/engine/GameEngine.ts';
import { getResponder } from '../src/engine/responder.ts';
import { getCard } from '../src/engine/cards/CardDatabase.ts';
import type { AIDifficulty } from '../src/ai/difficulties/index.ts';
import { getAiActionByDifficulty } from '../src/ai/difficulties/index.ts';
import { scoreExpertCandidates } from '../src/ai/difficulties/ExpertAI.ts';
import type { GameAction } from '../src/engine/types.ts';
const label = (a: GameAction) => a.type === 'PLAY_CARD' ? `${a.wareMode ?? 'play'} ${getCard(a.cardId).name}` : a.type === 'ACTIVATE_UTILITY' ? `use#${a.utilityIndex}` : a.type;

const [subject = 'expert', opponent = 'hard', gamesArg = '10', seedArg = '31000'] = process.argv.slice(2);
const games = Number(gamesArg);
const t = { turns: 0, idleEnds: 0, idleActionsLeft: 0, draws: 0, keeps: 0, buys: 0, sells: 0, sellGold: 0, people: 0, animals: 0, utilPlays: 0, activations: 0, wins: 0, gold: 0, oppGold: 0, gameTurns: 0 };
for (let g = 0; g < games; g++) {
  const seat = (g % 2) as 0 | 1;
  let s = createInitialState(Number(seedArg) + g);
  let steps = 0;
  while (s.phase !== 'GAME_OVER' && steps++ < 4000) {
    const r = getResponder(s);
    const diff = (r === seat ? subject : opponent) as AIDifficulty;
    const a = getAiActionByDifficulty(s, diff);
    if (!a) break;
    if (r === seat && !s.pendingResolution && !s.pendingGuardReaction && !s.pendingWareCardReaction) {
      if (a.type === 'END_TURN' && process.env.PROFILE_DEBUG && s.actionsLeft >= 4) {
        const me = s.players[seat];
        if (subject === 'expert') console.log('    ' + scoreExpertCandidates(s).sort((x, y) => y.score - x.score).map(c => `${label(c.action)} ${c.score.toFixed(1)}(h${c.hScore.toFixed(1)})`).join('; '));
        console.log(`  idle T${s.turn} ${s.actionsLeft} left, ${me.gold}g vs ${s.players[1 - seat].gold}g, mkt [${me.market.map(w => w ?? '-').join(',')}], hand [${me.hand.map(id => getCard(id).name).join(' | ')}], utils [${me.utilities.map(u => u.designId + (u.usedThisTurn ? '*' : '')).join(',')}]`);
      }
      if (a.type === 'END_TURN') { t.turns++; if (s.actionsLeft >= 2) { t.idleEnds++; t.idleActionsLeft += s.actionsLeft; } }
      if (a.type === 'DRAW_CARD') t.draws++;
      if (a.type === 'KEEP_CARD') t.keeps++;
      if (a.type === 'ACTIVATE_UTILITY') t.activations++;
      if (a.type === 'PLAY_CARD') {
        const c = getCard(a.cardId);
        if (a.wareMode === 'buy') t.buys++;
        else if (a.wareMode === 'sell') { t.sells++; t.sellGold += c.wares!.sellPrice; }
        else if (c.type === 'people') t.people++;
        else if (c.type === 'animal') t.animals++;
        else if (c.type === 'utility') t.utilPlays++;
      }
    }
    s = processAction(s, a);
  }
  t.gameTurns += s.turn;
  t.gold += s.players[seat].gold; t.oppGold += s.players[1 - seat].gold;
  if (s.players[seat].gold > s.players[1 - seat].gold) t.wins++;
}
const per = (n: number) => (n / t.turns).toFixed(2);
console.log(`${subject} vs ${opponent}, ${games} games: win ${t.wins}/${games}, avg gold ${(t.gold / games).toFixed(1)} vs ${(t.oppGold / games).toFixed(1)}, avg game turns ${(t.gameTurns / games).toFixed(1)}`);
console.log(`per turn: draws ${per(t.draws)}, buys ${per(t.buys)}, sells ${per(t.sells)}, people ${per(t.people)}, animals ${per(t.animals)}, utilPlays ${per(t.utilPlays)}, activations ${per(t.activations)}`);
console.log(`idle ends (>=2 actions left): ${t.idleEnds}/${t.turns} = ${(100 * t.idleEnds / t.turns).toFixed(0)}%, avg actions wasted when idle ${(t.idleActionsLeft / Math.max(1, t.idleEnds)).toFixed(2)}`);
