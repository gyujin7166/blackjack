import {
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  TextureLoader,
} from 'three';
import type { Texture } from 'three';

export type CardTextureCacheEntry = {
  promise: Promise<Texture> | null;
  texture: Texture | null;
};

export type CardTextureLoadFailure = {
  error: unknown;
  url: string;
};

const cardTextureCache = new Map<string, CardTextureCacheEntry>();
const cardTextureLoader = new TextureLoader();

export function getCardTextureCacheEntry(url: string) {
  const cachedEntry = cardTextureCache.get(url);
  if (cachedEntry) return cachedEntry;

  const entry: CardTextureCacheEntry = {
    promise: null,
    texture: null,
  };
  cardTextureCache.set(url, entry);
  return entry;
}

function loadCardTexture(url: string) {
  return new Promise<Texture>((resolve, reject) => {
    cardTextureLoader.load(
      url,
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.generateMipmaps = true;
        texture.magFilter = LinearFilter;
        texture.minFilter = LinearMipmapLinearFilter;
        resolve(texture);
      },
      undefined,
      (error) => {
        reject(error);
      },
    );
  });
}

export function getCachedCardTexture(url: string) {
  return getCardTextureCacheEntry(url).texture;
}

export function ensureCardTexture(url: string) {
  const entry = getCardTextureCacheEntry(url);

  if (entry.texture) return Promise.resolve(entry.texture);
  if (entry.promise) return entry.promise;

  entry.promise = loadCardTexture(url).then(
    (texture) => {
      entry.texture = texture;
      entry.promise = null;
      return texture;
    },
    (error) => {
      entry.promise = null;
      throw error;
    },
  );

  return entry.promise;
}

export function areCardTexturesReady(urls: readonly string[]) {
  return urls.every((url) => getCachedCardTexture(url) !== null);
}

export async function prepareCardTextures(urls: readonly string[]) {
  const uniqueUrls = [...new Set(urls)];
  const results = await Promise.allSettled(
    uniqueUrls.map((url) => ensureCardTexture(url)),
  );

  return results.flatMap<CardTextureLoadFailure>((result, index) =>
    result.status === 'rejected'
      ? [{ error: result.reason, url: uniqueUrls[index] }]
      : [],
  );
}
