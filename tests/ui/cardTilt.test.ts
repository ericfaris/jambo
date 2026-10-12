import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { tiltFromPointer, FLAT_POSE } from '../../src/ui/cardTilt.ts';
import { TiltCardArt, PARALLAX_LAYERS } from '../../src/ui/TiltCardArt.tsx';

describe('card tilt', () => {
  it('a pointer at the centre leaves the card flat', () => {
    expect(tiltFromPointer(0.5, 0.5, 10)).toEqual(FLAT_POSE);
  });

  it('leans toward the pointer, never past the limit, and the glare follows it', () => {
    const topRight = tiltFromPointer(1, 0, 10);
    expect(topRight.ry).toBe(10); // right edge
    expect(topRight.rx).toBe(10); // top edge tips toward the pointer
    expect(topRight.gx).toBe(100);
    expect(topRight.gy).toBe(0);
    // the picture slides the other way, behind the frame
    expect(topRight.px).toBe(-1);
    expect(topRight.py).toBe(1);
    // pointers outside the card are clamped
    expect(tiltFromPointer(3, -2, 10)).toEqual(topRight);
  });

  it('the zoomed card renders the picture behind a frame with a glare layer', () => {
    const html = renderToStaticMarkup(createElement(TiltCardArt, { designId: 'well', alt: 'Well' }));
    expect(html).toContain('card-tilt-window');
    expect(html).toContain('card-tilt-glare');
    expect(html).toContain('/assets/cards/well.png');
  });

  it('every layered card ships its layers, back to front, web-sized', async () => {
    const { existsSync, statSync } = await import('node:fs');
    for (const [id, layers] of Object.entries(PARALLAX_LAYERS)) {
      expect(layers!.length, id).toBeGreaterThanOrEqual(2);
      for (const layer of layers!) {
        expect(existsSync(`public${layer.src}`), layer.src).toBe(true);
        expect(statSync(`public${layer.src}`).size).toBeLessThan(400_000);
      }
      // the farthest layer moves with the scenery, the nearest toward the viewer
      expect(layers![0].shift).toBeGreaterThan(layers![layers!.length - 1].shift);
    }
  });

  it('the Dancer renders as layers, each with its own depth', () => {
    const html = renderToStaticMarkup(createElement(TiltCardArt, { designId: 'dancer', alt: 'Dancer' }));
    expect(html).toContain('card-tilt-layered');
    expect(html.match(/card-tilt-depth/g)).toHaveLength(3);
    expect(html).toContain('dancer-figure.webp');
  });
});
