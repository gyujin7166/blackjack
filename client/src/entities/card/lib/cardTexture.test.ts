import { describe, expect, it } from 'vitest';

import {
  CARD_TEXTURE_HEIGHT,
  CARD_TEXTURE_WIDTH,
  getCardTextureCacheEntry,
  getContainedImageRect,
} from './cardTexture';

describe('card texture rasterization', () => {
  it('uses the OpenDecks source dimensions as the fixed texture size', () => {
    expect(CARD_TEXTURE_WIDTH).toBe(750);
    expect(CARD_TEXTURE_HEIGHT).toBe(1050);
  });

  it('fills the fixed texture without distortion for OpenDecks 5:7 SVGs', () => {
    expect(getContainedImageRect(
      750,
      1050,
      CARD_TEXTURE_WIDTH,
      CARD_TEXTURE_HEIGHT,
    )).toEqual({
      height: 1050,
      width: 750,
      x: 0,
      y: 0,
    });
  });

  it('centers a narrower source without stretching or cropping it', () => {
    const rect = getContainedImageRect(
      360,
      540,
      CARD_TEXTURE_WIDTH,
      CARD_TEXTURE_HEIGHT,
    );

    expect(rect.x).toBe(25);
    expect(rect.y).toBe(0);
    expect(rect.width).toBe(700);
    expect(rect.height).toBe(1050);
    expect(rect.width / rect.height).toBeCloseTo(360 / 540);
  });

  it('centers a wider source without stretching or cropping it', () => {
    const rect = getContainedImageRect(
      750,
      1000,
      CARD_TEXTURE_WIDTH,
      CARD_TEXTURE_HEIGHT,
    );

    expect(rect.x).toBe(0);
    expect(rect.y).toBe(25);
    expect(rect.width).toBe(750);
    expect(rect.height).toBe(1000);
    expect(rect.width / rect.height).toBeCloseTo(750 / 1000);
  });

  it('rejects invalid source or target dimensions', () => {
    expect(() => getContainedImageRect(
      0,
      1050,
      CARD_TEXTURE_WIDTH,
      CARD_TEXTURE_HEIGHT,
    )).toThrow(
      RangeError,
    );
    expect(() => getContainedImageRect(
      750,
      1050,
      CARD_TEXTURE_WIDTH,
      -1,
    )).toThrow(
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
