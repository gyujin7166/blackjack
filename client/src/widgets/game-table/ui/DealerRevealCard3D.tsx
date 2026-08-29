import type { Card } from '@blackjack/shared';
import { useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Group } from 'three';

import { Card3D } from '../../../entities/card/ui/Card3D';
import type { GameSound } from '../lib/gameSounds';
import { DealtCard3D } from './DealtCard3D';

type Vector3Tuple = [number, number, number];

interface DealerRevealCard3DProps {
  card: Card | null;
  dealDelay: number;
  initialDealSound?: GameSound;
  onInitialDealComplete: () => void;
  onRevealComplete: () => void;
  reveal: boolean;
  startPosition: Vector3Tuple;
  targetPosition: Vector3Tuple;
}

export function DealerRevealCard3D({
  card,
  dealDelay,
  initialDealSound,
  onInitialDealComplete,
  onRevealComplete,
  reveal,
  startPosition,
  targetPosition,
}: DealerRevealCard3DProps) {
  const flipGroupRef = useRef<Group>(null);
  const revealCompleteCallbackRef = useRef(onRevealComplete);
  const revealCompletedRef = useRef(false);
  const [showFace, setShowFace] = useState(false);
  const invalidate = useThree((state) => state.invalidate);
  revealCompleteCallbackRef.current = onRevealComplete;

  useLayoutEffect(() => {
    const group = flipGroupRef.current;
    if (!group) return;

    if (!reveal || !card) {
      revealCompletedRef.current = false;
      group.rotation.z = 0;
      setShowFace(false);
      invalidate();
      return;
    }

    if (revealCompletedRef.current) {
      setShowFace(true);
      group.rotation.z = 0;
      invalidate();
      return;
    }

    const timeline = gsap.timeline({
      onComplete: () => {
        if (revealCompletedRef.current) return;
        revealCompletedRef.current = true;
        invalidate();
        revealCompleteCallbackRef.current();
      },
    });
    timeline
      .to(group.rotation, {
        z: Math.PI / 2,
        duration: 0.2,
        ease: 'power2.in',
        onUpdate: invalidate,
      })
      .call(() => {
        setShowFace(true);
        group.rotation.z = -Math.PI / 2;
        invalidate();
      })
      .to(group.rotation, {
        z: 0,
        duration: 0.2,
        ease: 'power2.out',
        onUpdate: invalidate,
      });

    return () => {
      timeline.kill();
    };
  }, [card?.rank, card?.suit, invalidate, reveal]);

  return (
    <DealtCard3D
      delay={dealDelay}
      initialDealSound={initialDealSound}
      onInitialDealComplete={onInitialDealComplete}
      startPosition={startPosition}
      targetPosition={targetPosition}
    >
      <group ref={flipGroupRef}>
        {showFace && card ? <Card3D card={card} /> : <Card3D hidden />}
      </group>
    </DealtCard3D>
  );
}
