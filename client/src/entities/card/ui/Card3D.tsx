import type { Card, Suit } from '@blackjack/shared';
import { useEffect, useMemo } from 'react';
import { CanvasTexture, LinearFilter, Shape, SRGBColorSpace } from 'three';

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

const CARD_WIDTH = 1.12;
const CARD_HEIGHT = 1.54;
const CARD_CORNER_RADIUS = 0.085;
const CARD_TEXTURE_WIDTH = 512;
const CARD_TEXTURE_HEIGHT = 712;
const CARD_TEXTURE_SCALE = 2;
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
function prepareTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function drawCorner(
  context: CanvasRenderingContext2D,
  rank: Card['rank'],
  symbol: string,
  color: string,
) {
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.font = '700 90px Georgia, serif';
  context.fillText(rank, 64, 10);
  context.font = '74px Georgia, serif';
  context.fillText(symbol, 64, 104);
}

function drawCardCorners(
  context: CanvasRenderingContext2D,
  card: Card,
  symbol: string,
  color: string,
) {
  drawCorner(context, card.rank, symbol, color);
  context.save();
  context.translate(512, 712);
  context.rotate(Math.PI);
  drawCorner(context, card.rank, symbol, color);
  context.restore();
}

const pipLayouts: Record<string, Array<[number, number, boolean?]>> = {
  '2': [[0.5, 0.25], [0.5, 0.75, true]],
  '3': [[0.5, 0.23], [0.5, 0.5], [0.5, 0.77, true]],
  '4': [[0.34, 0.28], [0.66, 0.28], [0.34, 0.72, true], [0.66, 0.72, true]],
  '5': [[0.34, 0.26], [0.66, 0.26], [0.5, 0.5], [0.34, 0.74, true], [0.66, 0.74, true]],
  '6': [[0.34, 0.23], [0.66, 0.23], [0.34, 0.5], [0.66, 0.5], [0.34, 0.77, true], [0.66, 0.77, true]],
  '7': [[0.34, 0.21], [0.66, 0.21], [0.5, 0.36], [0.34, 0.5], [0.66, 0.5], [0.34, 0.79, true], [0.66, 0.79, true]],
  '8': [[0.34, 0.2], [0.66, 0.2], [0.5, 0.35], [0.34, 0.5], [0.66, 0.5], [0.5, 0.65, true], [0.34, 0.8, true], [0.66, 0.8, true]],
  '9': [[0.34, 0.2], [0.66, 0.2], [0.34, 0.4], [0.66, 0.4], [0.5, 0.5], [0.34, 0.6, true], [0.66, 0.6, true], [0.34, 0.8, true], [0.66, 0.8, true]],
  '10': [[0.34, 0.18], [0.66, 0.18], [0.5, 0.31], [0.34, 0.39], [0.66, 0.39], [0.34, 0.61, true], [0.66, 0.61, true], [0.5, 0.69, true], [0.34, 0.82, true], [0.66, 0.82, true]],
};

function drawPips(
  context: CanvasRenderingContext2D,
  rank: Card['rank'],
  symbol: string,
  color: string,
) {
  if (rank === 'A') {
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '270px Georgia, serif';
    context.fillText(symbol, 256, 362);
    return;
  }

  const layout = pipLayouts[rank] ?? [];
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = rank === '10' ? '112px Georgia, serif' : '126px Georgia, serif';

  layout.forEach(([x, y, inverted]) => {
    context.save();
    context.translate(x * 512, y * 712);
    if (inverted) context.rotate(Math.PI);
    context.fillText(symbol, 0, 0);
    context.restore();
  });
}

function drawCourtHalf(
  context: CanvasRenderingContext2D,
  rank: Card['rank'],
  color: string,
) {
  context.fillStyle = '#d6a824';
  context.beginPath();
  context.moveTo(-88, -112);
  context.lineTo(-52, -155);
  context.lineTo(-14, -116);
  context.lineTo(20, -158);
  context.lineTo(62, -112);
  context.closePath();
  context.fill();
  context.fillStyle = '#f0c59d';
  context.beginPath();
  context.arc(0, -72, rank === 'J' ? 43 : 48, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#1b2230';
  context.fillRect(-52, -84, 104, 18);
  context.beginPath();
  context.moveTo(-76, -30);
  context.lineTo(0, -66);
  context.lineTo(76, -30);
  context.lineTo(112, 100);
  context.lineTo(-112, 100);
  context.closePath();
  context.fill();
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(-82, -18);
  context.lineTo(0, 28);
  context.lineTo(82, -18);
  context.lineTo(105, 96);
  context.lineTo(-105, 96);
  context.closePath();
  context.fill();
  context.fillStyle = '#d6a824';
  context.fillRect(-14, -6, 28, 108);
  context.fillStyle = '#f8f1db';
  context.beginPath();
  context.moveTo(-72, 5);
  context.lineTo(0, 50);
  context.lineTo(72, 5);
  context.lineTo(50, 80);
  context.lineTo(0, 58);
  context.lineTo(-50, 80);
  context.closePath();
  context.fill();
}

function drawCourtCard(
  context: CanvasRenderingContext2D,
  rank: Card['rank'],
  symbol: string,
  color: string,
) {
  context.save();
  context.beginPath();
  context.rect(92, 116, 328, 480);
  context.clip();
  context.translate(256, 356);
  drawCourtHalf(context, rank, color);
  context.rotate(Math.PI);
  drawCourtHalf(context, rank, color);
  context.restore();
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '76px Georgia, serif';
  context.fillText(symbol, 256, 356);
}

function createCardTexture(card: Card) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_TEXTURE_WIDTH * CARD_TEXTURE_SCALE;
  canvas.height = CARD_TEXTURE_HEIGHT * CARD_TEXTURE_SCALE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  context.scale(CARD_TEXTURE_SCALE, CARD_TEXTURE_SCALE);

  const symbol = suitSymbols[card.suit];
  const color = card.suit === 'diamonds' || card.suit === 'hearts'
    ? '#c51f2f'
    : '#151820';
  context.fillStyle = '#faf7ee';
  context.fillRect(0, 0, CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT);
  drawCardCorners(context, card, symbol, color);

  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') {
    drawCourtCard(context, card.rank, symbol, color);
  } else {
    drawPips(context, card.rank, symbol, color);
  }

  return prepareTexture(canvas);
}

function createCardBackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_TEXTURE_WIDTH * CARD_TEXTURE_SCALE;
  canvas.height = CARD_TEXTURE_HEIGHT * CARD_TEXTURE_SCALE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  context.scale(CARD_TEXTURE_SCALE, CARD_TEXTURE_SCALE);

  context.fillStyle = '#f8f2e8';
  context.fillRect(0, 0, CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT);
  context.fillStyle = '#b7192e';
  context.fillRect(18, 18, 476, 676);
  context.strokeStyle = '#f8f2e8';
  context.lineWidth = 4;
  context.strokeRect(27, 27, 458, 658);
  context.lineWidth = 2.5;

  for (let y = 42; y < 680; y += 28) {
    for (let x = 40; x < 480; x += 28) {
      context.save();
      context.translate(x + ((y / 28) % 2) * 14, y);
      context.rotate(Math.PI / 4);
      context.strokeRect(-7, -7, 14, 14);
      context.restore();
    }
  }

  return prepareTexture(canvas);
}

export function Card3D({
  card,
  hidden = false,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: Card3DProps) {
  const faceTexture = useMemo(
    () => (card ? createCardTexture(card) : null),
    [card?.rank, card?.suit],
  );
  const backTexture = useMemo(
    () => (hidden ? createCardBackTexture() : null),
    [hidden],
  );

  useEffect(
    () => () => {
      faceTexture?.dispose();
      backTexture?.dispose();
    },
    [backTexture, faceTexture],
  );

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, -0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[CARD_SHAPE, CARD_EXTRUDE_OPTIONS]} />
        <meshStandardMaterial color="#faf7ee" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.036, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.105, 1.525]} />
        <meshStandardMaterial
          map={hidden ? backTexture : faceTexture}
          roughness={0.66}
        />
      </mesh>
    </group>
  );
}
