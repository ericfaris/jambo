// ============================================================================
// Card damage marks from animal strikes (strikes.ts): which cards on the
// board are bitten / gnawed / poisoned right now, which are held out of sight
// while their strike plays, and which market wares carry a peck chip.
// GameBoard provides it; CardFace and MarketDisplay read it.
// ============================================================================

import { createContext, useContext } from 'react';
import type { DeckCardId } from '../engine/types.ts';
import type { CardDamage, ChipMark, DamageMark } from './strikes.ts';

export interface CardDamageState {
  marks: ReadonlyMap<DeckCardId, DamageMark>;
  /** Cards whose strike is still playing: their real spot stays empty until it lands. */
  hidden: ReadonlySet<DeckCardId>;
  chips: readonly ChipMark[];
}

const EMPTY: CardDamageState = { marks: new Map(), hidden: new Set(), chips: [] };

export const CardDamageContext = createContext<CardDamageState>(EMPTY);

export function useCardDamage(): CardDamageState {
  return useContext(CardDamageContext);
}

/** The overlays a damaged card face carries (the cut-out itself is a CSS mask). */
export function DamageOverlays({ damage }: { damage: CardDamage }) {
  if (damage === 'bite') {
    return (
      <svg className="card-damage-torn" viewBox="0 0 96 128" preserveAspectRatio="none" aria-hidden="true">
        <path d="M34 0L40 12L46 5L50 18L57 10L60 24L67 17L69 31L77 27L77 40L86 38L84 50L96 50" />
      </svg>
    );
  }
  if (damage === 'gnaw') return <span className="card-damage-slobber" aria-hidden="true" />;
  return (
    <>
      <span className="card-damage-venom" aria-hidden="true" />
      <span className="card-damage-fangs" aria-hidden="true" />
    </>
  );
}
