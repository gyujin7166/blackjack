import type { Card } from '@blackjack/shared';
import { useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { type ReactNode, useLayoutEffect, useRef } from 'react';
import type { Group } from 'three';

import { Card3D } from '../../../entities/card/ui/Card3D';

type Vector3Tuple = [number, number, number];

type DealtCard3DProps = {
  delay: number;
  onInitialDealComplete?: () => void;
  startPosition: Vector3Tuple;
  targetPosition: Vector3Tuple;
  targetRotation?: Vector3Tuple;
} & (
  | { card: Card; children?: never; hidden?: false }
  | { card?: never; children?: never; hidden: true }
  | { card?: never; children: ReactNode; hidden?: never }
);

export function DealtCard3D({
  card,
  children,
  hidden = false,
  delay,
  onInitialDealComplete,
  startPosition,
  targetPosition,
  targetRotation = [0, 0, 0],
}: DealtCard3DProps) {
  const groupRef = useRef<Group>(null);
  const previousTargetRef = useRef<Vector3Tuple | null>(null);
  const initialDealCompletedRef = useRef(false);
  const initialDealCompleteCallbackRef = useRef(onInitialDealComplete);
  initialDealCompleteCallbackRef.current = onInitialDealComplete;
  const invalidate = useThree((state) => state.invalidate);
  const [startX, startY, startZ] = startPosition;
  const [targetX, targetY, targetZ] = targetPosition;
  const [rotationX, rotationY, rotationZ] = targetRotation;

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
    const positionTween = gsap.to(group.position, {
      x: targetX,
      y: targetY,
      z: targetZ,
      delay: isFirstTarget || isStrictModeReplay ? delay : 0,
      duration: isFirstTarget || isStrictModeReplay ? 0.36 : 0.18,
      ease: 'power2.out',
      overwrite: true,
      onComplete: () => {
        const isInitialDeal = !initialDealCompletedRef.current;
        initialDealCompletedRef.current = true;
        invalidate();
        if (isInitialDeal) {
          initialDealCompleteCallbackRef.current?.();
        }
      },
      onUpdate: invalidate,
    });
    const rotationTween = gsap.to(group.rotation, {
      x: rotationX,
      y: rotationY,
      z: rotationZ,
      delay: isFirstTarget || isStrictModeReplay ? delay : 0,
      duration: isFirstTarget || isStrictModeReplay ? 0.36 : 0.18,
      ease: 'power2.out',
      overwrite: true,
      onUpdate: invalidate,
    });

    return () => {
      positionTween.kill();
      rotationTween.kill();
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
    rotationX,
    rotationY,
    rotationZ,
  ]);

  return (
    <group ref={groupRef}>
      {children ?? (hidden
        ? <Card3D hidden />
        : card
          ? <Card3D card={card} />
          : null)}
    </group>
  );
}
