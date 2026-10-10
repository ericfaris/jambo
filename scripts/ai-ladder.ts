/// <reference types="node" />
/**
 * Difficulty ladder check: each level vs the levels next to it, both seat
 * orders on the same seeds, one child process per matchup (runs in parallel).
 *
 *   npm run ai:ladder -- [games=200] [seedBase=41000]
 *
 * Prints the stronger level's combined win rate per adjacent step with a 95%
 * Wilson interval, plus the implied strength gap in logits (Elo-style: equal
 * gaps = an evenly spaced ladder). Targets live in docs/AI_DIFFICULTY_TUNING.md.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AIDifficulty } from '../src/ai/difficulties/index.ts';
import { DIFFICULTY_BLEND } from '../src/ai/difficulties/index.ts';
import { runAiMatchups } from './ai-matchups.ts';

const LEVELS: AIDifficulty[] = ['easy', 'medium', 'hard', 'expert'];
const LIMITS = { maxSteps: 2500, maxGameMs: 15000 };

interface SeatResult { p0: AIDifficulty; p1: AIDifficulty; p0Wins: number; p1Wins: number; ties: number; stalls: number; avgTurns: number }

export function wilson(wins: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export function logit(p: number): number {
  const c = Math.min(0.995, Math.max(0.005, p));
  return Math.log(c / (1 - c));
}

function runWorker(p0: AIDifficulty, p1: AIDifficulty, games: number, seedBase: number): void {
  // Sweep hooks: LADDER_BLEND_MEDIUM / LADDER_BLEND_HARD override the shipped blend
  if (process.env.LADDER_BLEND_MEDIUM) DIFFICULTY_BLEND.medium = Number(process.env.LADDER_BLEND_MEDIUM);
  if (process.env.LADDER_BLEND_HARD) DIFFICULTY_BLEND.hard = Number(process.env.LADDER_BLEND_HARD);
  const s = runAiMatchups(games, seedBase, LIMITS, [[p0, p1]]).summaries[0];
  const out: SeatResult = { p0, p1, p0Wins: s.p0Wins, p1Wins: s.p1Wins, ties: s.ties, stalls: s.stalls, avgTurns: s.avgTurns };
  process.stdout.write(JSON.stringify(out));
}

function spawnWorker(p0: AIDifficulty, p1: AIDifficulty, games: number, seedBase: number): Promise<SeatResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), 'worker', p0, p1, String(games), String(seedBase)], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let buf = '';
    child.stdout.on('data', (d) => { buf += String(d); });
    child.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`${p0} vs ${p1} exited ${code}`));
      try { resolvePromise(JSON.parse(buf.slice(buf.indexOf('{'))) as SeatResult); } catch (e) { reject(e); }
    });
  });
}

async function main(): Promise<void> {
  const games = Number(process.argv[2] ?? 200);
  const seedBase = Number(process.argv[3] ?? 41000);
  const started = Date.now();
  const pairs: Array<[AIDifficulty, AIDifficulty]> = [];
  for (let i = 0; i < LEVELS.length - 1; i++) {
    pairs.push([LEVELS[i], LEVELS[i + 1]], [LEVELS[i + 1], LEVELS[i]]);
  }
  const results = await Promise.all(pairs.map(([a, b]) => spawnWorker(a, b, games, seedBase)));

  console.log(`blend: medium ${process.env.LADDER_BLEND_MEDIUM ?? DIFFICULTY_BLEND.medium}, hard ${process.env.LADDER_BLEND_HARD ?? DIFFICULTY_BLEND.hard}`);
  console.log(`AI ladder — ${games} games per seat order (${games * 2} per step), seeds ${seedBase}+, ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
  console.log('step              stronger wins   95% CI        gap(logit)  as P0  as P1  stalls  turns');
  let cumulative = 0;
  const ratings: string[] = ['easy 0.00'];
  for (let i = 0; i < LEVELS.length - 1; i++) {
    const weak = LEVELS[i];
    const strong = LEVELS[i + 1];
    const a = results.find((r) => r.p0 === strong && r.p1 === weak)!; // strong in seat 0
    const b = results.find((r) => r.p0 === weak && r.p1 === strong)!; // strong in seat 1
    const wins = a.p0Wins + b.p1Wins + (a.ties + b.ties) / 2;
    const n = games * 2;
    const rate = wins / n;
    const [lo, hi] = wilson(wins, n);
    const gap = logit(rate);
    cumulative += gap;
    ratings.push(`${strong} ${cumulative.toFixed(2)}`);
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    console.log(
      `${`${strong} > ${weak}`.padEnd(18)}${pct(rate).padStart(13)}   ${`${pct(lo)}–${pct(hi)}`.padEnd(14)}${gap.toFixed(2).padStart(9)}  ${pct(a.p0Wins / games).padStart(5)}  ${pct(b.p1Wins / games).padStart(5)}  ${String(a.stalls + b.stalls).padStart(6)}  ${((a.avgTurns + b.avgTurns) / 2).toFixed(1).padStart(5)}`,
    );
  }
  console.log(`\nimplied strength (logits from easy): ${ratings.join(' · ')}`);
}

if (process.argv[2] === 'worker') {
  runWorker(process.argv[3] as AIDifficulty, process.argv[4] as AIDifficulty, Number(process.argv[5]), Number(process.argv[6]));
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
