import type { Card } from '@blackjack/shared';
import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import {
  ExtrudeGeometry,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Shape,
} from 'three';

import { CARD_BACK_ASSET_URL, getCardFaceAssetUrl } from '../lib/cardAsset';
import { ensureCardTexture, getCachedCardTexture } from '../lib/cardTexture';

type Vector3Tuple = [number, number, number];

type Card3DProps = {
  position?: Vector3Tuple;
  rotation?: Vector3Tuple;
} & ({ card: Card; hidden?: false } | { card?: never; hidden: true });

const CARD_WIDTH = 1.105;
const CARD_HEIGHT = 1.5325;
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

const CARD_BODY_GEOMETRY = new ExtrudeGeometry(
  CARD_SHAPE,
  CARD_EXTRUDE_OPTIONS,
);
const CARD_SURFACE_GEOMETRY = new PlaneGeometry(
  CARD_SURFACE_WIDTH,
  CARD_SURFACE_HEIGHT,
);
const CARD_BODY_MATERIAL = new MeshPhysicalMaterial({
  clearcoat: 0.12,
  clearcoatRoughness: 0.62,
  color: '#f8f3e9',
  metalness: 0,
  roughness: 0.54,
});

function useCardTexture(url: string) {
  const invalidate = useThree((state) => state.invalidate);

  const [loadedTexture, setLoadedTexture] = useState<{
    texture: ReturnType<typeof getCachedCardTexture>;
    url: string;
  }>(() => ({
    texture: getCachedCardTexture(url),
    url,
  }));

  useEffect(() => {
    let active = true;

    const handleTextureReady = (
      texture: NonNullable<ReturnType<typeof getCachedCardTexture>>,
    ) => {
      if (!active) return;

      setLoadedTexture({
        texture,
        url,
      });

      invalidate();
    };

    const cachedTexture = getCachedCardTexture(url);
    if (cachedTexture) {
      handleTextureReady(cachedTexture);
    } else {
      void ensureCardTexture(url).then(handleTextureReady, (error) => {
        console.error(`Failed to load card texture: ${url}`, error);
      });
    }

    return () => {
      active = false;
    };
  }, [invalidate, url]);

  if (loadedTexture.url === url) {
    return loadedTexture.texture ?? getCachedCardTexture(url);
  }

  return getCachedCardTexture(url);
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

  if (!texture) return null;

  return (
    <group position={position} rotation={rotation}>
      <mesh
        castShadow
        position={[0, -0.035, 0]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <primitive
          attach="geometry"
          dispose={null}
          object={CARD_BODY_GEOMETRY}
        />
        <primitive
          attach="material"
          dispose={null}
          object={CARD_BODY_MATERIAL}
        />
      </mesh>

      <mesh
        position={[0, 0.036, 0]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <primitive
          attach="geometry"
          dispose={null}
          object={CARD_SURFACE_GEOMETRY}
        />
        <meshPhysicalMaterial
          clearcoat={0.16}
          clearcoatRoughness={0.52}
          key={texture?.uuid ?? 'pending'}
          map={texture}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-1}
          roughness={0.5}
          alphaTest={0.5}
        />
      </mesh>
    </group>
  );
}
