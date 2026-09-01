import type { Card } from "@blackjack/shared";
import { useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Shape,
  SRGBColorSpace,
  TextureLoader,
} from "three";

import { CARD_BACK_ASSET_URL, getCardFaceAssetUrl } from "../lib/cardAsset";
import {
  CARD_TEXTURE_HEIGHT,
  CARD_TEXTURE_WIDTH,
  type CardTextureCacheEntry,
  getCardTextureCacheEntry,
  getContainedImageRect,
} from "../lib/cardTexture";

type Vector3Tuple = [number, number, number];

type Card3DProps = {
  position?: Vector3Tuple;
  rotation?: Vector3Tuple;
} & ({ card: Card; hidden?: false } | { card?: never; hidden: true });

const CARD_WIDTH = 1.12;
const CARD_HEIGHT = 1.54;
const CARD_CORNER_RADIUS = 0.085;

const CARD_SURFACE_HEIGHT = 1.525;
const CARD_SURFACE_WIDTH = CARD_SURFACE_HEIGHT * (5 / 7);

const CARD_EXTRUDE_OPTIONS = {
  bevelEnabled: true,
  bevelSegments: 3,
  bevelSize: 0.018,
  bevelThickness: 0.012,
  curveSegments: 12,
  depth: 0.055,
};

function createRoundedRectShape(width: number, height: number, radius: number) {
  const shape = new Shape();

  const left = -width / 2;
  const right = width / 2;
  const top = height / 2;
  const bottom = -height / 2;

  shape.moveTo(left + radius, bottom);
  shape.lineTo(right - radius, bottom);
  shape.quadraticCurveTo(right, bottom, right, bottom + radius);
  shape.lineTo(right, top - radius);
  shape.quadraticCurveTo(right, top, right - radius, top);
  shape.lineTo(left + radius, top);
  shape.quadraticCurveTo(left, top, left, top - radius);
  shape.lineTo(left, bottom + radius);
  shape.quadraticCurveTo(left, bottom, left + radius, bottom);

  return shape;
}

const CARD_SHAPE = createRoundedRectShape(
  CARD_WIDTH,
  CARD_HEIGHT,
  CARD_CORNER_RADIUS,
);

const svgTextureLoader = new TextureLoader();

function rasterizeSvgTexture(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");

  canvas.width = CARD_TEXTURE_WIDTH;
  canvas.height = CARD_TEXTURE_HEIGHT;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
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

function loadCardTexture(url: string, entry: CardTextureCacheEntry) {
  if (entry.loading || entry.texture) return;

  entry.loading = true;

  svgTextureLoader.load(
    url,
    (sourceTexture) => {
      const texture = rasterizeSvgTexture(
        sourceTexture.image as HTMLImageElement,
      );

      sourceTexture.dispose();

      entry.texture = texture;
      entry.loading = false;

      entry.listeners.forEach((listener) => {
        listener(texture);
      });

      entry.listeners.clear();
    },
    undefined,
    () => {
      entry.loading = false;
    },
  );
}

function useCardTexture(url: string) {
  const invalidate = useThree((state) => state.invalidate);

  const [loadedTexture, setLoadedTexture] = useState<{
    texture: CanvasTexture | null;
    url: string;
  }>(() => ({
    texture: getCardTextureCacheEntry(url).texture,
    url,
  }));

  useEffect(() => {
    const entry = getCardTextureCacheEntry(url);

    let active = true;

    const handleTextureReady = (texture: CanvasTexture) => {
      if (!active) return;

      setLoadedTexture({
        texture,
        url,
      });

      invalidate();
    };

    if (entry.texture) {
      handleTextureReady(entry.texture);
    } else {
      entry.listeners.add(handleTextureReady);
      loadCardTexture(url, entry);
    }

    return () => {
      active = false;
      entry.listeners.delete(handleTextureReady);
    };
  }, [invalidate, url]);

  if (loadedTexture.url === url) {
    return loadedTexture.texture;
  }

  return getCardTextureCacheEntry(url).texture;
}

export function Card3D({
  card,
  hidden = false,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: Card3DProps) {
  const textureUrl =
    hidden || !card ? CARD_BACK_ASSET_URL : getCardFaceAssetUrl(card);

  const texture = useCardTexture(textureUrl);

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, -0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[CARD_SHAPE, CARD_EXTRUDE_OPTIONS]} />
        <meshStandardMaterial color="#faf7ee" roughness={0.62} />
      </mesh>

      <mesh position={[0, 0.036, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CARD_SURFACE_WIDTH, CARD_SURFACE_HEIGHT]} />
        <meshStandardMaterial
          key={texture?.uuid ?? "pending"}
          map={texture}
          polygonOffset
          polygonOffsetFactor={-1}
          roughness={0.66}
        />
      </mesh>
    </group>
  );
}
