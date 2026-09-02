import type {
  Card,
  GamePhase,
  GameStatePayload,
  HiddenCard,
  PlayerSeat,
} from '@blackjack/shared';
import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  LinearFilter,
  Shape,
  SRGBColorSpace,
} from 'three';
import type { PerspectiveCamera } from 'three';

import {
  CARD_BACK_ASSET_URL,
  getCardFaceAssetUrl,
} from '../../../entities/card/lib/cardAsset';
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

const DEAL_ORIGIN: Vector3Tuple = [-4.2, 0.64, -2.14];
const MOBILE_DEAL_ORIGIN: Vector3Tuple = [1.55, 0.64, -1.25];
const DEAL_STAGGER_SECONDS = 0.12;
const DECK_CARD_OFFSETS: Vector3Tuple[] = [
  [-0.056, -0.104, -0.056],
  [-0.042, -0.078, -0.042],
  [-0.028, -0.052, -0.028],
  [-0.014, -0.026, -0.014],
  [0, 0, 0],
];

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

function createFeltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 384;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');

  const gradient = context.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.48,
    canvas.width * 0.04,
    canvas.width * 0.5,
    canvas.height * 0.48,
    canvas.width * 0.56,
  );
  gradient.addColorStop(0, '#1687a4');
  gradient.addColorStop(0.48, '#0b7391');
  gradient.addColorStop(0.78, '#075a73');
  gradient.addColorStop(1, '#043f52');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  let seed = 0x2f6e2b1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  for (let index = 0; index < 6500; index += 1) {
    const brightness = random() > 0.54 ? 255 : 0;
    context.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${0.012 + random() * 0.022})`;
    context.fillRect(
      Math.floor(random() * canvas.width),
      Math.floor(random() * canvas.height),
      1 + Math.floor(random() * 1.4),
      1,
    );
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.repeat.set(1 / 18.1, 1 / 7.55);
  texture.offset.set(0.5, 0.5);
  return texture;
}

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
  initialDealReadinessUrls,
  x,
  z,
}: {
  cards: Card[];
  owner: PlayerSeat;
  animationRound: number;
  initialDealReadinessUrls: readonly string[];
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
            readinessUrls={index < 2 ? initialDealReadinessUrls : undefined}
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
  initialDealReadinessUrls,
  onDrawComplete,
  onHoleCardDealComplete,
  onHoleCardRevealComplete,
  revealHoleCard,
}: {
  cards: Array<Card | HiddenCard>;
  animationRound: number;
  drawIndices: number[];
  initialDealReadinessUrls: readonly string[];
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
              readinessUrls={initialDealReadinessUrls}
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
              dealReadinessUrls={initialDealReadinessUrls}
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
  const position = isPortrait ? MOBILE_DEAL_ORIGIN : DEAL_ORIGIN;

  return (
    <group position={position}>
      {DECK_CARD_OFFSETS.map((offset, index) => (
        <Card3D hidden key={index} position={offset} />
      ))}
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
  const feltTexture = useMemo(() => createFeltTexture(), []);

  useEffect(() => () => feltTexture.dispose(), [feltTexture]);

  return (
    <group>
      <mesh
        castShadow
        position={[0, 0.02, 0]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <extrudeGeometry args={[FRAME_SHAPE, FRAME_EXTRUDE_OPTIONS]} />
        <meshStandardMaterial
          color="#0e1d2a"
          metalness={0.08}
          roughness={0.5}
        />
      </mesh>
      <mesh
        position={[0, 0.3, 0]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <extrudeGeometry args={[FELT_SHAPE, FELT_EXTRUDE_OPTIONS]} />
        <meshStandardMaterial
          map={feltTexture}
          metalness={0}
          roughness={0.92}
        />
      </mesh>
      <mesh
        position={[0, 0.49, -1.75]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1.15, 0.42, 1]}
      >
        <ringGeometry args={[5.12, 5.17, 128, 1, Math.PI + 0.12, Math.PI - 0.24]} />
        <meshStandardMaterial color="#d9d0ad" metalness={0.04} roughness={0.66} />
      </mesh>
      <mesh
        position={[0, 0.485, -1.55]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1.15, 0.52, 1]}
      >
        <ringGeometry args={[5.92, 5.96, 128, 1, Math.PI + 0.12, Math.PI - 0.24]} />
        <meshStandardMaterial color="#c2ad6f" metalness={0.06} roughness={0.62} />
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
  const player1X = selfSeat === 'player1' ? 3.15 : -3.15;
  const player2X = selfSeat === 'player2' ? 3.15 : -3.15;
  const initialDealReadinessUrls = useMemo(() => {
    const urls = new Set<string>([CARD_BACK_ASSET_URL]);

    gameState.player1.hand.slice(0, 2).forEach((card) => {
      urls.add(getCardFaceAssetUrl(card));
    });
    gameState.player2.hand.slice(0, 2).forEach((card) => {
      urls.add(getCardFaceAssetUrl(card));
    });

    const dealerUpCard = gameState.dealer.hand[0];
    if (dealerUpCard && !('hidden' in dealerUpCard)) {
      urls.add(getCardFaceAssetUrl(dealerUpCard));
    }

    return [...urls];
  }, [
    gameState.dealer.hand,
    gameState.player1.hand,
    gameState.player2.hand,
  ]);
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
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
        shadows="soft"
      >
        <color attach="background" args={['#04171e']} />
        <ambientLight color="#d8edf0" intensity={0.34} />
        <directionalLight
          color="#9bcbd2"
          intensity={0.42}
          position={[-6, 7, 5]}
        />
        <spotLight
          angle={0.58}
          castShadow
          color="#fff0d2"
          decay={1.8}
          distance={30}
          intensity={125}
          penumbra={0.72}
          position={[0, 11, -0.8]}
          shadow-bias={-0.00012}
          shadow-camera-far={24}
          shadow-camera-near={1}
          shadow-mapSize-height={1024}
          shadow-mapSize-width={1024}
          shadow-normalBias={0.025}
        />
        <pointLight
          color="#61b7c8"
          decay={2}
          distance={12}
          intensity={5}
          position={[5, 4, -3]}
        />
        <FixedCamera />
        <Table />
        <PlayerHand
          animationRound={animationRound}
          cards={gameState.player1.hand}
          initialDealReadinessUrls={initialDealReadinessUrls}
          owner="player1"
          x={player1X}
          z={1.82}
        />
        <PlayerHand
          animationRound={animationRound}
          cards={gameState.player2.hand}
          initialDealReadinessUrls={initialDealReadinessUrls}
          owner="player2"
          x={player2X}
          z={1.82}
        />
        <DealerHand
          animationRound={animationRound}
          cards={gameState.dealer.hand}
          drawIndices={visibleDrawIndices}
          initialDealReadinessUrls={initialDealReadinessUrls}
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
