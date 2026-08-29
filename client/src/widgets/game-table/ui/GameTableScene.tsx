import type {
  Card,
  GamePhase,
  GameStatePayload,
  HiddenCard,
  PlayerSeat,
} from '@blackjack/shared';
import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasTexture, LinearFilter, Shape, SRGBColorSpace } from 'three';
import type { PerspectiveCamera } from 'three';

import { Card3D } from '../../../entities/card/ui/Card3D';
import {
  createDealerPresentationPlan,
  type DealerPresentationPlan,
} from '../lib/dealerPresentation';
import { DealerRevealCard3D } from './DealerRevealCard3D';
import { DealtCard3D } from './DealtCard3D';
import { GameTableHud, type GameTableHudProps } from './GameTableHud';

interface GameTableSceneProps
  extends Omit<
    GameTableHudProps,
    'dealerSequenceComplete' | 'gameState' | 'selfSeat'
  > {
  gameState: GameStatePayload;
  selfSeat: PlayerSeat;
  animationRound: number;
}

type Vector3Tuple = [number, number, number];

const DEAL_ORIGIN: Vector3Tuple = [5.75, 0.64, -2.14];
const MOBILE_DEAL_ORIGIN: Vector3Tuple = [2.1, 0.64, -2.14];
const DEAL_STAGGER_SECONDS = 0.12;

function createTableShape(
  halfWidth: number,
  top: number,
  sideBottom: number,
  centerBottom: number,
) {
  const shape = new Shape();
  shape.moveTo(-halfWidth, top);
  shape.lineTo(halfWidth, top);
  shape.lineTo(halfWidth - 0.55, sideBottom);
  shape.quadraticCurveTo(halfWidth * 0.72, centerBottom, 0, centerBottom);
  shape.quadraticCurveTo(
    -halfWidth * 0.72,
    centerBottom,
    -halfWidth + 0.55,
    sideBottom,
  );
  shape.closePath();
  return shape;
}

const FRAME_SHAPE = createTableShape(9.4, 3.9, -2.3, -3.92);
const FELT_SHAPE = createTableShape(9.05, 3.65, -2.05, -3.3);
const FRAME_EXTRUDE_OPTIONS = {
  bevelEnabled: true,
  bevelSegments: 3,
  bevelSize: 0.1,
  bevelThickness: 0.08,
  curveSegments: 48,
  depth: 0.24,
};
const FELT_EXTRUDE_OPTIONS = {
  bevelEnabled: true,
  bevelSegments: 2,
  bevelSize: 0.05,
  bevelThickness: 0.035,
  curveSegments: 48,
  depth: 0.06,
};

type DealerSequenceStage =
  | 'playing'
  | 'waiting-initial-deal'
  | 'revealing'
  | 'drawing'
  | 'complete';

function FixedCamera() {
  const camera = useThree((state) => state.camera);
  const viewportWidth = useThree((state) => state.size.width);
  const viewportHeight = useThree((state) => state.size.height);

  useEffect(() => {
    const isPortrait = viewportWidth / viewportHeight < 0.8;
    const position: Vector3Tuple = isPortrait
      ? [0, 18.5, 4]
      : [0, 20.5, 2];
    camera.position.set(...position);
    (camera as PerspectiveCamera).fov = isPortrait ? 32 : 24;
    camera.lookAt(0, 0, isPortrait ? 0.2 : 0.55);
    camera.updateProjectionMatrix();
  }, [camera, viewportHeight, viewportWidth]);

  return null;
}

function PlayerHand({
  cards,
  owner,
  animationRound,
  x,
  z,
}: {
  cards: Card[];
  owner: PlayerSeat;
  animationRound: number;
  x: number;
  z: number;
}) {
  const isPortrait = useThree(
    (state) => state.size.width / state.size.height < 0.8,
  );
  const handX = isPortrait ? Math.sign(x) * 1.3 : x;
  const dealOrigin = isPortrait ? MOBILE_DEAL_ORIGIN : DEAL_ORIGIN;
  const spacing = 0.56;
  const ownerOrder = owner === 'player1' ? 0 : 1;

  return (
    <>
      {cards.map((card, index) => {
        const centerOffset = index - (cards.length - 1) / 2;
        const rotationY = Math.max(
          -0.2,
          Math.min(0.2, -centerOffset * 0.18),
        );
        return (
          <DealtCard3D
            card={card}
            delay={index < 2
              ? (index * 3 + ownerOrder) * DEAL_STAGGER_SECONDS
              : 0}
            initialDealSound={index < 2 ? 'initialDeal' : 'draw'}
            key={`${animationRound}:${owner}:${index}`}
            startPosition={dealOrigin}
            targetPosition={[
              handX + centerOffset * spacing,
              0.5 + index * 0.01,
              z + Math.abs(centerOffset) * 0.075,
            ]}
            targetRotation={[0, rotationY, 0]}
          />
        );
      })}
    </>
  );
}

function DealerHand({
  cards,
  animationRound,
  drawIndices,
  onDrawComplete,
  onHoleCardDealComplete,
  onHoleCardRevealComplete,
  revealHoleCard,
}: {
  cards: Array<Card | HiddenCard>;
  animationRound: number;
  drawIndices: number[];
  onDrawComplete: () => void;
  onHoleCardDealComplete: () => void;
  onHoleCardRevealComplete: () => void;
  revealHoleCard: boolean;
}) {
  const isPortrait = useThree(
    (state) => state.size.width / state.size.height < 0.8,
  );
  const dealOrigin = isPortrait ? MOBILE_DEAL_ORIGIN : DEAL_ORIGIN;
  const spacing = 0.64;
  const visibleIndices = [0, 1, ...drawIndices].filter(
    (index) => index < cards.length,
  );

  return (
    <>
      {visibleIndices.map((index, visibleIndex) => {
        const card = cards[index];
        if (!card) return null;
        const position: Vector3Tuple = [
          (visibleIndex - (visibleIndices.length - 1) / 2) * spacing,
          0.5 + index * 0.009,
          -2.02,
        ];

        if (index === 0) {
          return 'hidden' in card ? null : (
            <DealtCard3D
              card={card}
              delay={2 * DEAL_STAGGER_SECONDS}
              initialDealSound="initialDeal"
              key={`${animationRound}:dealer:0`}
              startPosition={dealOrigin}
              targetPosition={position}
            />
          );
        }

        if (index === 1) {
          return (
            <DealerRevealCard3D
              card={'hidden' in card ? null : card}
              dealDelay={5 * DEAL_STAGGER_SECONDS}
              initialDealSound="initialDeal"
              key={`${animationRound}:dealer:1`}
              onInitialDealComplete={onHoleCardDealComplete}
              onRevealComplete={onHoleCardRevealComplete}
              reveal={revealHoleCard}
              startPosition={dealOrigin}
              targetPosition={position}
            />
          );
        }

        return 'hidden' in card ? null : (
          <DealtCard3D
            card={card}
            delay={0}
            initialDealSound="draw"
            key={`${animationRound}:dealer:${index}`}
            onInitialDealComplete={onDrawComplete}
            startPosition={dealOrigin}
            targetPosition={position}
          />
        );
      })}
    </>
  );
}

function VisualDeck() {
  const isPortrait = useThree(
    (state) => state.size.width / state.size.height < 0.8,
  );
  const position: Vector3Tuple = isPortrait
    ? [2.25, 0.43, -2.72]
    : [5.9, 0.4, -2.72];

  return (
    <group position={position} rotation={[0, -0.25, 0]}>
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[1.9, 0.12, 1.16]} />
        <meshStandardMaterial color="#101d2d" roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.1, 0.01]}>
        <boxGeometry args={[1.58, 0.08, 0.98]} />
        <meshStandardMaterial color="#263b55" roughness={0.56} />
      </mesh>
      <mesh position={[-0.87, 0.16, -0.02]}>
        <boxGeometry args={[0.14, 0.26, 1.08]} />
        <meshStandardMaterial color="#172a40" roughness={0.52} />
      </mesh>
      <mesh position={[0.87, 0.16, -0.02]}>
        <boxGeometry args={[0.14, 0.26, 1.08]} />
        <meshStandardMaterial color="#172a40" roughness={0.52} />
      </mesh>
      <mesh position={[0, 0.25, -0.43]} rotation={[0.14, 0, 0]}>
        <boxGeometry args={[1.82, 0.13, 0.42]} />
        <meshStandardMaterial color="#223a55" roughness={0.5} />
      </mesh>
      <group position={[0, 0.18, 0.01]} scale={[0.7, 0.7, 0.7]}>
        {[0, 0.045, 0.09].map((height, index) => (
          <Card3D
            hidden
            key={height}
            position={[index * 0.015, height, index * 0.018]}
          />
        ))}
      </group>
      <mesh position={[0, 0.16, 0.52]}>
        <boxGeometry args={[1.3, 0.16, 0.13]} />
        <meshStandardMaterial color="#223a55" roughness={0.5} />
      </mesh>
      <mesh position={[-0.68, 0.15, 0.42]}>
        <boxGeometry args={[0.18, 0.2, 0.24]} />
        <meshStandardMaterial color="#172a40" roughness={0.52} />
      </mesh>
      <mesh position={[0.68, 0.15, 0.42]}>
        <boxGeometry args={[0.18, 0.2, 0.24]} />
        <meshStandardMaterial color="#172a40" roughness={0.52} />
      </mesh>
    </group>
  );
}

function TableMarking() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext('2d');

    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = '#e9e3d0';
      context.font = '700 90px Arial, sans-serif';
      context.letterSpacing = '16px';
      context.fillText('BLACKJACK', 512, 98);
      context.fillStyle = '#d9b85e';
      context.font = '54px Georgia, serif';
      context.letterSpacing = '22px';
      context.fillText('♠  ♥  ♦  ♣', 512, 192);
    }

    const canvasTexture = new CanvasTexture(canvas);
    canvasTexture.colorSpace = SRGBColorSpace;
    canvasTexture.minFilter = LinearFilter;
    return canvasTexture;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={[0, 0.53, 1.02]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[5.25, 1.28]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}

function Table() {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[FRAME_SHAPE, FRAME_EXTRUDE_OPTIONS]} />
        <meshStandardMaterial color="#142536" metalness={0.06} roughness={0.56} />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[FELT_SHAPE, FELT_EXTRUDE_OPTIONS]} />
        <meshStandardMaterial color="#066b8d" roughness={0.9} />
      </mesh>
      <mesh
        position={[0, 0.49, -1.75]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1.15, 0.42, 1]}
      >
        <ringGeometry args={[5.12, 5.17, 128, 1, Math.PI + 0.12, Math.PI - 0.24]} />
        <meshBasicMaterial color="#d9d0ad" />
      </mesh>
      <mesh
        position={[0, 0.485, -1.55]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1.15, 0.52, 1]}
      >
        <ringGeometry args={[5.92, 5.96, 128, 1, Math.PI + 0.12, Math.PI - 0.24]} />
        <meshBasicMaterial color="#c2ad6f" />
      </mesh>
      <TableMarking />
    </group>
  );
}

function GameTableRound({
  gameState,
  selfSeat,
  animationRound,
  ...hudProps
}: GameTableSceneProps) {
  const player1X = selfSeat === 'player1' ? 4.45 : -4.45;
  const player2X = selfSeat === 'player2' ? 4.45 : -4.45;
  const initialPlan = createDealerPresentationPlan({
    dealerHand: gameState.dealer.hand,
    phase: gameState.phase,
    previousPhase: null,
  });
  const [dealerPlan, setDealerPlan] = useState<DealerPresentationPlan>(initialPlan);
  const [dealerStage, setDealerStage] = useState<DealerSequenceStage>(
    initialPlan.shouldRevealHoleCard
      ? 'waiting-initial-deal'
      : 'playing',
  );
  const [visibleDrawCount, setVisibleDrawCount] = useState(0);
  const previousPhaseRef = useRef<GamePhase>(gameState.phase);
  const initialDealerDealCompleteRef = useRef(false);

  useEffect(() => {
    const plan = createDealerPresentationPlan({
      dealerHand: gameState.dealer.hand,
      phase: gameState.phase,
      previousPhase: previousPhaseRef.current,
    });
    previousPhaseRef.current = gameState.phase;

    if (gameState.phase !== 'finished') {
      setDealerStage('playing');
      setVisibleDrawCount(0);
      return;
    }

    if (!plan.shouldRevealHoleCard) return;
    setDealerPlan(plan);
    setVisibleDrawCount(0);
    setDealerStage(
      !initialDealerDealCompleteRef.current
        ? 'waiting-initial-deal'
        : 'revealing',
    );
  }, [gameState.dealer.hand, gameState.phase]);

  const handleHoleCardDealComplete = useCallback(() => {
    initialDealerDealCompleteRef.current = true;
    setDealerStage((stage) =>
      stage === 'waiting-initial-deal' ? 'revealing' : stage,
    );
  }, []);

  const handleHoleCardRevealComplete = useCallback(() => {
    if (dealerPlan.drawIndices.length === 0) {
      setDealerStage('complete');
      return;
    }

    setVisibleDrawCount(1);
    setDealerStage('drawing');
  }, [dealerPlan.drawIndices.length]);

  const handleDealerDrawComplete = useCallback(() => {
    setVisibleDrawCount((count) => {
      if (count >= dealerPlan.drawIndices.length) {
        setDealerStage('complete');
        return count;
      }
      return count + 1;
    });
  }, [dealerPlan.drawIndices.length]);

  const visibleDrawIndices = dealerPlan.drawIndices.slice(0, visibleDrawCount);
  const dealerSequenceComplete = dealerStage === 'complete';
  const revealHoleCard = dealerStage === 'revealing'
    || dealerStage === 'drawing'
    || dealerStage === 'complete';

  return (
    <section
      aria-label="블랙잭 게임 테이블"
      className="relative h-full w-full overflow-hidden bg-[#06140f]"
    >
      <Canvas
        aria-hidden="true"
        camera={{ fov: 24, near: 0.1, far: 50, position: [0, 20.5, 2] }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ alpha: false, antialias: true }}
      >
        <color attach="background" args={['#04171e']} />
        <ambientLight intensity={1.15} />
        <directionalLight color="#e6f4f5" intensity={2.35} position={[-4, 9, 5]} />
        <pointLight color="#7dd8e6" intensity={17} position={[4, 5, -3]} />
        <FixedCamera />
        <Table />
        <PlayerHand
          animationRound={animationRound}
          cards={gameState.player1.hand}
          owner="player1"
          x={player1X}
          z={1.82}
        />
        <PlayerHand
          animationRound={animationRound}
          cards={gameState.player2.hand}
          owner="player2"
          x={player2X}
          z={1.82}
        />
        <DealerHand
          animationRound={animationRound}
          cards={gameState.dealer.hand}
          drawIndices={visibleDrawIndices}
          onDrawComplete={handleDealerDrawComplete}
          onHoleCardDealComplete={handleHoleCardDealComplete}
          onHoleCardRevealComplete={handleHoleCardRevealComplete}
          revealHoleCard={revealHoleCard}
        />
        <VisualDeck />
      </Canvas>
      <GameTableHud
        dealerSequenceComplete={dealerSequenceComplete}
        gameState={gameState}
        selfSeat={selfSeat}
        {...hudProps}
      />
    </section>
  );
}

export function GameTableScene(props: GameTableSceneProps) {
  return <GameTableRound key={props.animationRound} {...props} />;
}
