import type { Trader, TraderMood } from '../ai/traders.ts';
import { portraitUrl } from '../ai/traders.ts';

const MOODS: TraderMood[] = ['neutral', 'pleased', 'annoyed'];

/**
 * A trader's round portrait. All three expressions are stacked and
 * cross-fade, so a mood change never waits on a network fetch.
 */
export function TraderPortrait({ trader, mood = 'neutral', size = 56, speaking = false }: {
  trader: Trader;
  mood?: TraderMood;
  size?: number;
  /** A voiced line is playing — the ring pulses. */
  speaking?: boolean;
}) {
  return (
    <span
      className={`trader-portrait${speaking ? ' trader-portrait-speaking' : ''}`}
      style={{ width: size, height: size }}
      data-mood={mood}
      role="img"
      aria-label={`${trader.name}, ${mood === 'neutral' ? trader.title.toLowerCase() : mood}`}
    >
      {MOODS.map((m) => (
        <img key={m} src={portraitUrl(trader, m)} alt="" draggable={false} style={{ opacity: m === mood ? 1 : 0 }} />
      ))}
    </span>
  );
}
