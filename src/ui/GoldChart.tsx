import { CONSTANTS } from '../engine/types.ts';
import type { GoldPoint } from './gameStory.ts';

const W = 320;
const H = 130;
const PAD = { left: 30, right: 10, top: 10, bottom: 20 };

/** Plot coordinates for a timeline — exported for tests. */
export function chartScale(timeline: readonly GoldPoint[]) {
  const maxTurn = Math.max(1, timeline[timeline.length - 1]?.turn ?? 1);
  const maxGold = Math.max(CONSTANTS.ENDGAME_GOLD_THRESHOLD + 10, ...timeline.flatMap((p) => p.gold));
  const x = (turn: number) => PAD.left + (turn / maxTurn) * (W - PAD.left - PAD.right);
  const y = (gold: number) => PAD.top + (1 - gold / maxGold) * (H - PAD.top - PAD.bottom);
  return { x, y, maxTurn, maxGold };
}

/**
 * Gold over the game for both players, with the 60g line. Drawn to scale:
 * every label is a value the axes actually reach.
 */
export function GoldChart({ timeline, labels, highlightTurn, viewer = 0 }: {
  timeline: readonly GoldPoint[];
  labels: readonly [string, string];
  /** e.g. the biggest swing — marked with a dot on its turn */
  highlightTurn?: number | null;
  /** Whose line gets the "you" (gold, solid) styling; the rival is teal, dashed. */
  viewer?: 0 | 1;
}) {
  if (timeline.length < 2) return null;
  const { x, y, maxTurn } = chartScale(timeline);
  const line = (p: 0 | 1) => timeline.map((pt) => `${x(pt.turn).toFixed(1)},${y(pt.gold[p]).toFixed(1)}`).join(' ');
  const goal = CONSTANTS.ENDGAME_GOLD_THRESHOLD;
  const hl = highlightTurn != null ? timeline.find((p) => p.turn === highlightTurn) : undefined;
  const last = timeline[timeline.length - 1];
  // Styling classes are by role: -0 = the viewer, -1 = the rival
  const near: 0 | 1 = viewer;
  const far: 0 | 1 = viewer === 0 ? 1 : 0;
  return (
    <figure className="gold-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gold over ${maxTurn} turns: ${labels[near]} finished with ${last.gold[near]}g, ${labels[far]} with ${last.gold[far]}g`}>
        {[0, 20, 40].map((g) => (
          <g key={g}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} className="gold-chart-grid" />
            <text x={PAD.left - 5} y={y(g) + 3} className="gold-chart-axis" textAnchor="end">{g}</text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(goal)} y2={y(goal)} className="gold-chart-goal" />
        <text x={PAD.left - 5} y={y(goal) + 3} className="gold-chart-axis gold-chart-goal-label" textAnchor="end">{goal}</text>
        <text x={PAD.left} y={H - 5} className="gold-chart-axis">Start</text>
        <text x={W - PAD.right} y={H - 5} className="gold-chart-axis" textAnchor="end">Turn {maxTurn}</text>
        <polyline points={line(far)} className="gold-chart-line gold-chart-line-1" fill="none" />
        <polyline points={line(near)} className="gold-chart-line gold-chart-line-0" fill="none" />
        {hl && <circle cx={x(hl.turn)} cy={y(Math.max(...hl.gold))} r={4} className="gold-chart-mark" />}
        <circle cx={x(last.turn)} cy={y(last.gold[near])} r={3.5} className="gold-chart-end gold-chart-end-0" />
        <circle cx={x(last.turn)} cy={y(last.gold[far])} r={3.5} className="gold-chart-end gold-chart-end-1" />
      </svg>
      <figcaption className="gold-chart-legend">
        <span className="gold-chart-key gold-chart-key-0">{labels[near]}</span>
        <span className="gold-chart-key gold-chart-key-1">{labels[far]}</span>
      </figcaption>
    </figure>
  );
}
