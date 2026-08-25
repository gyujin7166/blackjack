import type {
  Card,
  GameStatePayload,
  HiddenCard,
  PlayerSeat,
} from '@blackjack/shared';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';

import { Card3D } from '../../../entities/card/ui/Card3D';

interface GameTableSceneProps {
  gameState: GameStatePayload;
  selfSeat: PlayerSeat;
}

type Vector3Tuple = [number, number, number];

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
  position,
}: {
  cards: Card[];
  position: Vector3Tuple;
}) {
  const spacing = 0.58;

  return (
    <group position={position}>
      {cards.map((card, index) => (
        <Card3D
          card={card}
          key={`${card.suit}:${card.rank}:${index}`}
          position={[(index - (cards.length - 1) / 2) * spacing, index * 0.006, 0]}
        />
      ))}
    </group>
  );
}

function DealerHand({ cards }: { cards: Array<Card | HiddenCard> }) {
  const spacing = 0.58;

  return (
    <group position={[0, 0.38, -0.72]}>
      {cards.map((card, index) => {
        const position: Vector3Tuple = [
          (index - (cards.length - 1) / 2) * spacing,
          index * 0.006,
          0,
        ];

        return 'hidden' in card ? (
          <Card3D hidden key={`hidden:${index}`} position={position} />
        ) : (
          <Card3D
            card={card}
            key={`${card.suit}:${card.rank}:${index}`}
            position={position}
          />
        );
      })}
    </group>
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

export function GameTableScene({ gameState, selfSeat }: GameTableSceneProps) {
  const self = gameState[selfSeat];
  const opponent = selfSeat === 'player1'
    ? gameState.player2
    : gameState.player1;

  return (
    <div
      aria-label="현재 블랙잭 테이블의 3D 보기"
      className="h-[350px] w-full overflow-hidden rounded-2xl border border-emerald-900 bg-[#06140f] sm:h-[470px]"
      role="img"
    >
      <Canvas
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
        <PlayerHand cards={opponent.hand} position={[0, 0.38, -2.45]} />
        <DealerHand cards={gameState.dealer.hand} />
        <PlayerHand cards={self.hand} position={[0, 0.38, 2.48]} />
        <VisualDeck />
      </Canvas>
    </div>
  );
}
