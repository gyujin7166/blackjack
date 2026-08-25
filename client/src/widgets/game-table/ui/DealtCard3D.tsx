import type { Card } from '@blackjack/shared';
import { useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useLayoutEffect, useRef } from 'react';
import type { Group } from 'three';

import { Card3D } from '../../../entities/card/ui/Card3D';

type Vector3Tuple = [number, number, number];

type DealtCard3DProps = {
  delay: number;
  startPosition: Vector3Tuple;
  targetPosition: Vector3Tuple;
} & (
  | { card: Card; hidden?: false }
  | { card?: never; hidden: true }
);

export function DealtCard3D({
  card,
  hidden = false,
  delay,
  startPosition,
  targetPosition,
}: DealtCard3DProps) {
  const groupRef = useRef<Group>(null);
  const previousTargetRef = useRef<Vector3Tuple | null>(null);
  const initialDealCompletedRef = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  const [startX, startY, startZ] = startPosition;
  const [targetX, targetY, targetZ] = targetPosition;

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const previousTarget = previousTargetRef.current;
    const isFirstTarget = previousTarget === null;
    const isStrictModeReplay = Boolean(
      previousTarget &&
        !initialDealCompletedRef.current &&
        previousTarget[0] === targetX &&
        previousTarget[1] === targetY &&
        previousTarget[2] === targetZ,
    );

    if (isFirstTarget) {
      group.position.set(startX, startY, startZ);
      invalidate();
    }

    previousTargetRef.current = [targetX, targetY, targetZ];
    const tween = gsap.to(group.position, {
      x: targetX,
      y: targetY,
      z: targetZ,
      delay: isFirstTarget || isStrictModeReplay ? delay : 0,
      duration: isFirstTarget || isStrictModeReplay ? 0.36 : 0.18,
      ease: 'power2.out',
      overwrite: true,
      onComplete: () => {
        initialDealCompletedRef.current = true;
        invalidate();
      },
      onUpdate: invalidate,
    });

    return () => {
      tween.kill();
    };
  }, [
    delay,
    invalidate,
    startX,
    startY,
    startZ,
    targetX,
    targetY,
    targetZ,
  ]);

  return (
    <group ref={groupRef}>
      {hidden ? <Card3D hidden /> : card ? <Card3D card={card} /> : null}
    </group>
  );
}
