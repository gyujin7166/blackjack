import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  TextureLoader,
} from 'three';

export const CARD_TEXTURE_WIDTH = 750;
export const CARD_TEXTURE_HEIGHT = 1050;

export type CardTextureCacheEntry = {
  promise: Promise<CanvasTexture> | null;
  texture: CanvasTexture | null;
};

export type CardTextureLoadFailure = {
  error: unknown;
  url: string;
};

const cardTextureCache = new Map<string, CardTextureCacheEntry>();
const svgTextureLoader = new TextureLoader();

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

function rasterizeSvgTexture(image: HTMLImageElement) {
  const canvas = document.createElement('canvas');

  canvas.width = CARD_TEXTURE_WIDTH;
  canvas.height = CARD_TEXTURE_HEIGHT;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  const drawRect = getContainedImageRect(
    sourceWidth,
    sourceHeight,
    canvas.width,
    canvas.height,
  );

  context.drawImage(
    image,
    drawRect.x,
    drawRect.y,
    drawRect.width,
    drawRect.height,
  );

  const texture = new CanvasTexture(canvas);

  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;

  return texture;
}

function loadCardTexture(url: string) {
  return new Promise<CanvasTexture>((resolve, reject) => {
    svgTextureLoader.load(
      url,
      (sourceTexture) => {
        try {
          resolve(rasterizeSvgTexture(
            sourceTexture.image as HTMLImageElement,
          ));
        } catch (error) {
          reject(error);
        } finally {
          sourceTexture.dispose();
        }
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
