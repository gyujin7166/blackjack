import type { Card, Suit } from '@blackjack/shared';
import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

type Vector3Tuple = [number, number, number];

type Card3DProps = {
  position?: Vector3Tuple;
  rotation?: Vector3Tuple;
} & (
  | { card: Card; hidden?: false }
  | { card?: never; hidden: true }
);

const suitSymbols: Record<Suit, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

function createCardTexture(card: Card) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 356;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  const symbol = suitSymbols[card.suit];
  const color = card.suit === 'diamonds' || card.suit === 'hearts'
    ? '#b4232c'
    : '#15171c';

  context.fillStyle = '#f8f5ec';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#d7d0bf';
  context.lineWidth = 8;
  context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  context.fillStyle = color;
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.font = '700 54px system-ui, sans-serif';
  context.fillText(card.rank, 24, 18);
  context.font = '48px system-ui, sans-serif';
  context.fillText(symbol, 26, 72);

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '120px system-ui, sans-serif';
  context.fillText(symbol, canvas.width / 2, canvas.height / 2 + 18);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function Card3D({
  card,
  hidden = false,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: Card3DProps) {
  const texture = useMemo(
    () => (card ? createCardTexture(card) : null),
    [card?.rank, card?.suit],
  );

  useEffect(() => () => texture?.dispose(), [texture]);

  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[0.86, 0.055, 1.2]} />
        <meshStandardMaterial color={hidden ? '#173f72' : '#e8e2d5'} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.8, 1.14]} />
        {hidden ? (
          <meshStandardMaterial color="#255b9c" roughness={0.72} />
        ) : (
          <meshStandardMaterial map={texture} roughness={0.66} />
        )}
      </mesh>
      {hidden && (
        <mesh position={[0, 0.033, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.64, 0.96]} />
          <meshStandardMaterial color="#16365d" roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}
