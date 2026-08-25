import type {
  Card,
  GameStatePayload,
  HiddenCard,
  PlayerSeat,
} from '@blackjack/shared';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';

import { Card3D } from '../../../entities/card/ui/Card3D';
import { DealtCard3D } from './DealtCard3D';
import { GameTableHud, type GameTableHudProps } from './GameTableHud';

interface GameTableSceneProps
  extends Omit<GameTableHudProps, 'gameState' | 'selfSeat'> {
  gameState: GameStatePayload;
  selfSeat: PlayerSeat;
  animationRound: number;
}

type Vector3Tuple = [number, number, number];

const DEAL_ORIGIN: Vector3Tuple = [3.25, 0.54, -0.76];
const DEAL_STAGGER_SECONDS = 0.12;

function FixedCamera() {
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function PlayerHand({
  cards,
  owner,
  animationRound,
  z,
}: {
  cards: Card[];
  owner: PlayerSeat;
  animationRound: number;
  z: number;
}) {
  const spacing = 0.58;
  const ownerOrder = owner === 'player1' ? 0 : 1;

  return (
    <>
      {cards.map((card, index) => (
        <DealtCard3D
          card={card}
          delay={index < 2
            ? (index * 3 + ownerOrder) * DEAL_STAGGER_SECONDS
            : 0}
          key={`${animationRound}:${owner}:${index}`}
          startPosition={DEAL_ORIGIN}
          targetPosition={[
            (index - (cards.length - 1) / 2) * spacing,
            0.38 + index * 0.006,
            z,
          ]}
        />
      ))}
    </>
  );
}

function DealerHand({
  cards,
  animationRound,
}: {
  cards: Array<Card | HiddenCard>;
  animationRound: number;
}) {
  const spacing = 0.58;

  return (
    <>
      {cards.map((card, index) => {
        const position: Vector3Tuple = [
          (index - (cards.length - 1) / 2) * spacing,
          0.38 + index * 0.006,
          -0.72,
        ];

        if (index >= 2) {
          return 'hidden' in card ? (
            <Card3D
              hidden
              key={`${animationRound}:dealer:${index}`}
              position={position}
            />
          ) : (
            <Card3D
              card={card}
              key={`${animationRound}:dealer:${index}`}
              position={position}
            />
          );
        }

        return 'hidden' in card ? (
          <DealtCard3D
            delay={(index * 3 + 2) * DEAL_STAGGER_SECONDS}
            hidden
            key={`${animationRound}:dealer:${index}`}
            startPosition={DEAL_ORIGIN}
            targetPosition={position}
          />
        ) : (
          <DealtCard3D
            card={card}
            delay={(index * 3 + 2) * DEAL_STAGGER_SECONDS}
            key={`${animationRound}:dealer:${index}`}
            startPosition={DEAL_ORIGIN}
            targetPosition={position}
          />
        );
      })}
    </>
  );
}

function VisualDeck() {
  return (
    <group position={[3.25, 0.42, -0.78]} rotation={[0, -0.18, 0]}>
      {[0, 0.04, 0.08].map((height, index) => (
        <Card3D hidden key={height} position={[0, height, index * 0.012]} />
      ))}
    </group>
  );
}

function Table() {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[10.2, 0.32, 6.9]} />
        <meshStandardMaterial color="#075c42" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.04, -3.5]}>
        <boxGeometry args={[10.65, 0.46, 0.34]} />
        <meshStandardMaterial color="#4d2e1d" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.04, 3.5]}>
        <boxGeometry args={[10.65, 0.46, 0.34]} />
        <meshStandardMaterial color="#4d2e1d" roughness={0.78} />
      </mesh>
      <mesh position={[-5.18, 0.04, 0]}>
        <boxGeometry args={[0.34, 0.46, 7.34]} />
        <meshStandardMaterial color="#4d2e1d" roughness={0.78} />
      </mesh>
      <mesh position={[5.18, 0.04, 0]}>
        <boxGeometry args={[0.34, 0.46, 7.34]} />
        <meshStandardMaterial color="#4d2e1d" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.172, 0.68]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.35, 2.38, 64, 1, 0.18, Math.PI - 0.36]} />
        <meshBasicMaterial color="#d6b971" />
      </mesh>
    </group>
  );
}

export function GameTableScene({
  gameState,
  selfSeat,
  animationRound,
  ...hudProps
}: GameTableSceneProps) {
  const player1Z = selfSeat === 'player1' ? 2.48 : -2.45;
  const player2Z = selfSeat === 'player2' ? 2.48 : -2.45;

  return (
    <section
      aria-label="블랙잭 게임 테이블"
      className="relative h-[540px] w-full overflow-hidden rounded-2xl border border-emerald-900 bg-[#06140f] sm:h-[620px]"
    >
      <Canvas
        aria-hidden="true"
        camera={{ fov: 42, near: 0.1, far: 50, position: [0, 8.1, 9.2] }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ alpha: false, antialias: true }}
      >
        <color attach="background" args={['#06140f']} />
        <ambientLight intensity={1.35} />
        <directionalLight intensity={2.1} position={[-4, 8, 5]} />
        <pointLight color="#d8f3df" intensity={18} position={[4, 5, -3]} />
        <FixedCamera />
        <Table />
        <PlayerHand
          animationRound={animationRound}
          cards={gameState.player1.hand}
          owner="player1"
          z={player1Z}
        />
        <PlayerHand
          animationRound={animationRound}
          cards={gameState.player2.hand}
          owner="player2"
          z={player2Z}
        />
        <DealerHand
          animationRound={animationRound}
          cards={gameState.dealer.hand}
        />
        <VisualDeck />
      </Canvas>
      <GameTableHud gameState={gameState} selfSeat={selfSeat} {...hudProps} />
    </section>
  );
}
