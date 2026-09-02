import {
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  areCardTexturesReady,
  ensureCardTexture,
  getCachedCardTexture,
  getCardTextureCacheEntry,
  prepareCardTextures,
} from './cardTexture';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('card texture URL cache', () => {
  it('reuses one entry for the same card URL and card back URL', () => {
    const faceUrl =
      '/cards/opendecks/raster/fronts/spades/king_of_spades.webp';
    const backUrl = '/cards/opendecks/raster/card-back-red.webp';

    expect(getCardTextureCacheEntry(faceUrl)).toBe(
      getCardTextureCacheEntry(faceUrl),
    );
    expect(getCardTextureCacheEntry(backUrl)).toBe(
      getCardTextureCacheEntry(backUrl),
    );
  });

  it('uses different entries for different card URLs', () => {
    expect(getCardTextureCacheEntry(
      '/cards/opendecks/raster/fronts/spades/king_of_spades.webp',
    )).not.toBe(getCardTextureCacheEntry(
      '/cards/opendecks/raster/fronts/hearts/king_of_hearts.webp',
    ));
  });

  it('shares one in-flight load and immediately exposes the cached texture', async () => {
    const url = '/cards/opendecks/raster/fronts/clubs/ace_of_clubs.webp';
    let handleLoad: Parameters<TextureLoader['load']>[1] | undefined;

    const loadSpy = vi.spyOn(TextureLoader.prototype, 'load')
      .mockImplementation((_url, onLoad) => {
        handleLoad = onLoad;
        return new Texture();
      });
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
    const loadedTexture = new Texture<HTMLImageElement>(sourceImage);
    handleLoad?.(loadedTexture);

    const texture = await firstRequest;

    expect(texture).toBe(loadedTexture);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(await secondRequest).toBe(texture);
    expect(getCachedCardTexture(url)).toBe(texture);
    expect(areCardTexturesReady([url])).toBe(true);
    expect(await ensureCardTexture(url)).toBe(texture);
    expect(loadSpy).toHaveBeenCalledOnce();
  });

  it('reports load failure and allows a later request to retry', async () => {
    const url =
      '/cards/opendecks/raster/fronts/diamonds/ace_of_diamonds.webp';
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
      '/cards/opendecks/raster/fronts/hearts/2_of_hearts.webp',
      '/cards/opendecks/raster/fronts/spades/2_of_spades.webp',
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
