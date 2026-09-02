import { CanvasTexture, Texture, TextureLoader } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CARD_TEXTURE_HEIGHT,
  CARD_TEXTURE_WIDTH,
  areCardTexturesReady,
  ensureCardTexture,
  getCachedCardTexture,
  getCardTextureCacheEntry,
  getContainedImageRect,
  prepareCardTextures,
} from './cardTexture';

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('shares one in-flight load and immediately exposes the cached texture', async () => {
    const url = '/cards/opendecks/fronts/clubs/ace_of_clubs.svg';
    let handleLoad: Parameters<TextureLoader['load']>[1] | undefined;

    const loadSpy = vi.spyOn(TextureLoader.prototype, 'load')
      .mockImplementation((_url, onLoad) => {
        handleLoad = onLoad;
        return new Texture();
      });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    const firstRequest = ensureCardTexture(url);
    const secondRequest = ensureCardTexture(url);

    expect(firstRequest).toBe(secondRequest);
    expect(loadSpy).toHaveBeenCalledOnce();

    const sourceImage = {
      height: 1050,
      naturalHeight: 1050,
      naturalWidth: 750,
      width: 750,
    } as HTMLImageElement;
    const sourceTexture = new Texture<HTMLImageElement>(sourceImage);
    handleLoad?.(sourceTexture);

    const texture = await firstRequest;

    expect(texture).toBeInstanceOf(CanvasTexture);
    expect(await secondRequest).toBe(texture);
    expect(getCachedCardTexture(url)).toBe(texture);
    expect(areCardTexturesReady([url])).toBe(true);
    expect(await ensureCardTexture(url)).toBe(texture);
    expect(loadSpy).toHaveBeenCalledOnce();
  });

  it('reports load failure and allows a later request to retry', async () => {
    const url = '/cards/opendecks/fronts/diamonds/ace_of_diamonds.svg';
    const errors: Array<Parameters<TextureLoader['load']>[3]> = [];
    const loadSpy = vi.spyOn(TextureLoader.prototype, 'load')
      .mockImplementation((_url, _onLoad, _onProgress, onError) => {
        errors.push(onError);
        return new Texture();
      });

    const firstRequest = ensureCardTexture(url);
    const loadError = new Error('texture failed');
    errors[0]?.(loadError);

    await expect(firstRequest).rejects.toBe(loadError);
    expect(getCardTextureCacheEntry(url).promise).toBeNull();
    expect(getCachedCardTexture(url)).toBeNull();

    void ensureCardTexture(url).catch(() => undefined);
    expect(loadSpy).toHaveBeenCalledTimes(2);
    errors[1]?.(loadError);
  });

  it('waits for every requested texture to settle before fallback', async () => {
    const urls = [
      '/cards/opendecks/fronts/hearts/2_of_hearts.svg',
      '/cards/opendecks/fronts/spades/2_of_spades.svg',
    ];
    const loads: Array<{
      onError: Parameters<TextureLoader['load']>[3];
      onLoad: NonNullable<Parameters<TextureLoader['load']>[1]>;
    }> = [];
    vi.spyOn(TextureLoader.prototype, 'load')
      .mockImplementation((_url, onLoad, _onProgress, onError) => {
        loads.push({ onError, onLoad: onLoad! });
        return new Texture();
      });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    let settled = false;
    const readiness = prepareCardTextures(urls).then((failures) => {
      settled = true;
      return failures;
    });

    loads[0]?.onError?.(new Error('first texture failed'));
    await Promise.resolve();
    expect(settled).toBe(false);

    const sourceImage = {
      height: 1050,
      naturalHeight: 1050,
      naturalWidth: 750,
      width: 750,
    } as HTMLImageElement;
    const sourceTexture = new Texture<HTMLImageElement>(sourceImage);
    loads[1]!.onLoad(sourceTexture);

    const failures = await readiness;
    expect(failures).toHaveLength(1);
    expect(failures[0]?.url).toBe(urls[0]);
  });
});
