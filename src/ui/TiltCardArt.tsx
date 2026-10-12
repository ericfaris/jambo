import type { CSSProperties } from 'react';
import type { CardDesignId } from '../engine/types.ts';
import { useCardTilt } from './cardTilt.ts';

export interface ParallaxLayer {
  src: string;
  /**
   * How far this layer slides as the card tilts, in % of the card: positive
   * drifts with the scenery (far away), negative toward the viewer (near).
   */
  shift: number;
  /** Over-scale so a shifted layer never shows its edge (opaque layers only). */
  scale?: number;
}

/**
 * Cards whose illustration is split into depth layers (back to front), which
 * move against each other as the card tilts. Every other card slides its
 * single picture behind the frame instead.
 */
export const PARALLAX_LAYERS: Partial<Record<CardDesignId, readonly ParallaxLayer[]>> = {
  dancer: [
    { src: '/assets/cards/parallax/dancer-back.webp', shift: 3, scale: 1.1 },
    { src: '/assets/cards/parallax/dancer-figure.webp', shift: 0.6, scale: 1.04 },
    { src: '/assets/cards/parallax/dancer-front.webp', shift: -2, scale: 1.08 },
  ],
};

/** A card's illustration that tilts, catches the light and shows depth. */
export function TiltCardArt({ designId, alt }: { designId: CardDesignId; alt: string }) {
  const tilt = useCardTilt({ maxDeg: 11, touch: true });
  const layers = PARALLAX_LAYERS[designId];
  return (
    <div className={`card-tilt card-tilt-mega${layers ? ' card-tilt-layered' : ''}`} {...tilt}>
      <div className="card-tilt-window">
        {layers ? (
          layers.map((layer, i) => (
            <img
              key={layer.src}
              className="card-tilt-layer card-tilt-depth"
              src={layer.src}
              alt={i === 0 ? alt : ''}
              draggable={false}
              style={{ '--shift': layer.shift, '--scale': layer.scale ?? 1.04 } as CSSProperties}
            />
          ))
        ) : (
          <img className="card-tilt-layer card-tilt-flat" src={`/assets/cards/${designId}.png`} alt={alt} draggable={false} />
        )}
      </div>
      <span className="card-tilt-glare" aria-hidden="true" />
    </div>
  );
}
