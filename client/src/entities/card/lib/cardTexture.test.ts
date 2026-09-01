import { describe, expect, it } from 'vitest';

import {
  CARD_TEXTURE_HEIGHT,
  CARD_TEXTURE_WIDTH,
  getCardTextureCacheEntry,
  getContainedImageRect,
} from './cardTexture';

describe('card texture rasterization', () => {
  it('fills the fixed texture without distortion for OpenDecks 5:7 SVGs', () => {
    expect(getContainedImageRect(
      750,
      1050,
      CARD_TEXTURE_WIDTH,
      CARD_TEXTURE_HEIGHT,
    )).toEqual({
      height: 1400,
      width: 1000,
      x: 0,
      y: 0,
    });
  });

  it('centers a narrower source without stretching or cropping it', () => {
    const rect = getContainedImageRect(360, 540, 1000, 1400);

    expect(rect.x).toBeCloseTo(100 / 3);
    expect(rect.y).toBe(0);
    expect(rect.width).toBeCloseTo(2800 / 3);
    expect(rect.height).toBe(1400);
    expect(rect.width / rect.height).toBeCloseTo(360 / 540);
  });

  it('centers a wider source without stretching or cropping it', () => {
    const rect = getContainedImageRect(750, 1000, 1000, 1400);

    expect(rect.x).toBe(0);
    expect(rect.y).toBeCloseTo(100 / 3);
    expect(rect.width).toBe(1000);
    expect(rect.height).toBeCloseTo(4000 / 3);
    expect(rect.width / rect.height).toBeCloseTo(750 / 1000);
  });

  it('rejects invalid source or target dimensions', () => {
    expect(() => getContainedImageRect(0, 1050, 1000, 1400)).toThrow(
      RangeError,
    );
    expect(() => getContainedImageRect(750, 1050, 1000, -1)).toThrow(
      RangeError,
    );
  });
});

describe('card texture URL cache', () => {
  it('reuses one entry for the same card URL and card back URL', () => {
    const faceUrl = '/cards/opendecks/fronts/spades/king_of_spades.svg';
    const backUrl = '/cards/opendecks/card-back-red.svg';

    expect(getCardTextureCacheEntry(faceUrl)).toBe(
      getCardTextureCacheEntry(faceUrl),
    );
    expect(getCardTextureCacheEntry(backUrl)).toBe(
      getCardTextureCacheEntry(backUrl),
    );
  });

  it('uses different entries for different card URLs', () => {
    expect(getCardTextureCacheEntry(
      '/cards/opendecks/fronts/spades/king_of_spades.svg',
    )).not.toBe(getCardTextureCacheEntry(
      '/cards/opendecks/fronts/hearts/king_of_hearts.svg',
    ));
  });
});
