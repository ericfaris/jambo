import { describe, expect, it } from 'vitest';
import { getCoreImageManifest, preloadImage } from '../../src/ui/imageCache.ts';

describe('imageCache', () => {
  it('builds a deduplicated image manifest with core assets', () => {
    const manifest = getCoreImageManifest();
    const uniqueManifest = new Set(manifest);

    expect(manifest.length).toBe(uniqueManifest.size);
    expect(manifest).toContain('/assets/cards/card_back.png');
    expect(manifest).toContain('/assets/menu/landing_hero.webp');
    expect(manifest).toContain('/assets/panels/wood_1.png');
    expect(manifest).toContain('/assets/coins/coin_18.png');
    expect(manifest).toContain('/assets/tokens/trinkets.png');
    expect(manifest).toContain('/assets/wares/silk.png');
  });

  it('handles preload calls in non-browser test environments', async () => {
    await expect(preloadImage('/assets/cards/card_back.png')).resolves.toBeUndefined();
  });
});
