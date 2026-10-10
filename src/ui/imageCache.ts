import { ALL_DECK_CARD_IDS, getCard } from '../engine/cards/CardDatabase.ts';
import type { WareType } from '../engine/types.ts';

const imageLoadPromises = new Map<string, Promise<void>>();
const loadedImages = new Set<string>();

const WARE_TYPES: WareType[] = ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt'];

function toUrl(path: string): string {
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) {
    return path;
  }
  return path.startsWith('/') ? path : `/${path}`;
}

export function preloadImage(path: string): Promise<void> {
  if (typeof Image === 'undefined') {
    return Promise.resolve();
  }

  const src = toUrl(path);
  if (loadedImages.has(src)) {
    return Promise.resolve();
  }

  const existingPromise = imageLoadPromises.get(src);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = new Promise<void>((resolve) => {
    const img = new Image();

    img.onload = () => {
      loadedImages.add(src);
      imageLoadPromises.delete(src);
      resolve();
    };

    img.onerror = () => {
      imageLoadPromises.delete(src);
      resolve();
    };

    img.decoding = 'async';
    img.src = src;
  });

  imageLoadPromises.set(src, promise);
  return promise;
}

export async function preloadImages(paths: Iterable<string>): Promise<void> {
  const uniquePaths = [...new Set(Array.from(paths).map(toUrl))];
  if (uniquePaths.length === 0) {
    return;
  }

  await Promise.all(uniquePaths.map((path) => preloadImage(path)));
}

let coreImageManifestCache: string[] | null = null;

export function getCoreImageManifest(): string[] {
  if (coreImageManifestCache) {
    return coreImageManifestCache;
  }

  const designIds = new Set<string>();
  const coinValues = new Set<number>();

  for (const cardId of ALL_DECK_CARD_IDS) {
    const card = getCard(cardId);
    designIds.add(card.designId);
    if (card.wares) {
      coinValues.add(card.wares.buyPrice);
      coinValues.add(card.wares.sellPrice);
    }
  }

  const imagePaths: string[] = ['/assets/cards/card_back.png'];

  for (const designId of designIds) {
    imagePaths.push(`/assets/cards/${designId}.png`);
  }

  for (const value of coinValues) {
    imagePaths.push(`/assets/coins/coin_${value}.png`);
  }

  for (const ware of WARE_TYPES) {
    imagePaths.push(`/assets/tokens/${ware}.png`);
    imagePaths.push(`/assets/wares/${ware}.png`);
  }

  imagePaths.push('/assets/menu/main_menu.png');
  imagePaths.push('/assets/panels/wood_1.png');

  coreImageManifestCache = imagePaths;
  return imagePaths;
}
