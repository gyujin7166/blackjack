import type { CanvasTexture } from 'three';

export const CARD_TEXTURE_WIDTH = 750;
export const CARD_TEXTURE_HEIGHT = 1050;

export type CardTextureCacheEntry = {
  listeners: Set<(texture: CanvasTexture) => void>;
  loading: boolean;
  texture: CanvasTexture | null;
};

const cardTextureCache = new Map<string, CardTextureCacheEntry>();

export function getCardTextureCacheEntry(url: string) {
  const cachedEntry = cardTextureCache.get(url);
  if (cachedEntry) return cachedEntry;

  const entry: CardTextureCacheEntry = {
    listeners: new Set(),
    loading: false,
    texture: null,
  };
  cardTextureCache.set(url, entry);
  return entry;
}

export function getContainedImageRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  if (
    sourceWidth <= 0
    || sourceHeight <= 0
    || targetWidth <= 0
    || targetHeight <= 0
  ) {
    throw new RangeError('Image dimensions must be positive.');
  }

  const scale = Math.min(
    targetWidth / sourceWidth,
    targetHeight / sourceHeight,
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    height,
    width,
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
  };
}
