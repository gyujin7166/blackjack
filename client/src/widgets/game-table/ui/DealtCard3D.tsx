import type { Card } from '@blackjack/shared';
import { type ThreeEvent, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import type { Group } from 'three';

import {
  CARD_BACK_ASSET_URL,
  getCardFaceAssetUrl,
} from '../../../entities/card/lib/cardAsset';
import {
  areCardTexturesReady,
  prepareCardTextures,
} from '../../../entities/card/lib/cardTexture';
import { Card3D } from '../../../entities/card/ui/Card3D';
import {
  getGameSoundTrigger,
  playGameSound,
  type GameSound,
} from '../lib/gameSounds';

type Vector3Tuple = [number, number, number];

const HOVER_LIFT = 0.12;

type DealtCard3DProps = {
  delay: number;
  initialDealSound?: GameSound;
  interactive?: boolean;
  onInitialDealComplete?: () => void;
  readinessUrls?: readonly string[];
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
  initialDealSound,
  interactive = false,
  onInitialDealComplete,
  readinessUrls,
  startPosition,
  targetPosition,
  targetRotation = [0, 0, 0],
}: DealtCard3DProps) {
  const dealGroupRef = useRef<Group>(null);
  const interactionGroupRef = useRef<Group>(null);
  const interactionTweenRef = useRef<ReturnType<typeof gsap.to> | null>(null);
  const previousTargetRef = useRef<Vector3Tuple | null>(null);
  const initialDealCompletedRef = useRef(false);
  const dealInProgressRef = useRef(true);
  const initialDealSoundPlayedRef = useRef(false);
  const hoverActiveRef = useRef(false);
  const [preparedReadinessKey, setPreparedReadinessKey] = useState<
    string | null
  >(null);
  const initialDealCompleteCallbackRef = useRef(onInitialDealComplete);
  initialDealCompleteCallbackRef.current = onInitialDealComplete;
  const invalidate = useThree((state) => state.invalidate);
  const canvas = useThree((state) => state.gl.domElement);
  const [startX, startY, startZ] = startPosition;
  const [targetX, targetY, targetZ] = targetPosition;
  const [rotationX, rotationY, rotationZ] = targetRotation;
  const ownTextureUrl = hidden
    ? CARD_BACK_ASSET_URL
    : card
      ? getCardFaceAssetUrl(card)
      : null;
  const readinessKey = (
    readinessUrls ?? (ownTextureUrl ? [ownTextureUrl] : [])
  ).join('\n');
  const textureUrls = readinessKey ? readinessKey.split('\n') : [];
  const texturesReady =
    areCardTexturesReady(textureUrls) || preparedReadinessKey === readinessKey;

  useLayoutEffect(() => {
    const group = dealGroupRef.current;
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

    if (isFirstTarget || isStrictModeReplay) {
      group.visible = false;
      invalidate();
    }

    if (!texturesReady) {
      let active = true;

      void prepareCardTextures(textureUrls).then(() => {
        if (active) setPreparedReadinessKey(readinessKey);
      });

      return () => {
        active = false;
      };
    }

    previousTargetRef.current = [targetX, targetY, targetZ];
    dealInProgressRef.current = true;
    if (hoverActiveRef.current) {
      hoverActiveRef.current = false;
      canvas.style.cursor = '';
      interactionTweenRef.current?.kill();
      interactionGroupRef.current?.position.set(0, 0, 0);
      invalidate();
    }
    if (
      !initialDealCompletedRef.current &&
      !initialDealSoundPlayedRef.current &&
      initialDealSound &&
      getGameSoundTrigger(initialDealSound) === 'start'
    ) {
      initialDealSoundPlayedRef.current = true;
      playGameSound(initialDealSound);
    }
    const positionTween = gsap.to(group.position, {
      x: targetX,
      y: targetY,
      z: targetZ,
      delay: isFirstTarget || isStrictModeReplay ? delay : 0,
      duration: isFirstTarget || isStrictModeReplay ? 0.36 : 0.18,
      ease: 'power2.out',
      overwrite: true,
      onStart: () => {
        group.visible = true;
        invalidate();
      },
      onComplete: () => {
        const isInitialDeal = !initialDealCompletedRef.current;
        initialDealCompletedRef.current = true;
        dealInProgressRef.current = false;
        invalidate();
        if (isInitialDeal) {
          if (
            initialDealSound &&
            !initialDealSoundPlayedRef.current &&
            getGameSoundTrigger(initialDealSound) === 'complete'
          ) {
            initialDealSoundPlayedRef.current = true;
            playGameSound(initialDealSound);
          }
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
    initialDealSound,
    invalidate,
    canvas,
    startX,
    startY,
    startZ,
    targetX,
    targetY,
    targetZ,
    rotationX,
    rotationY,
    rotationZ,
    readinessKey,
    texturesReady,
  ]);

  useLayoutEffect(() => {
    return () => {
      interactionTweenRef.current?.kill();
      interactionGroupRef.current?.position.set(0, 0, 0);
      if (hoverActiveRef.current) canvas.style.cursor = '';
      hoverActiveRef.current = false;
      invalidate();
    };
  }, [canvas, invalidate]);

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    if (
      event.pointerType !== 'mouse' ||
      !initialDealCompletedRef.current ||
      dealInProgressRef.current
    ) {
      return;
    }

    event.stopPropagation();
    if (hoverActiveRef.current) return;

    const interactionGroup = interactionGroupRef.current;
    if (!interactionGroup) return;

    hoverActiveRef.current = true;
    canvas.style.cursor = 'pointer';
    interactionTweenRef.current?.kill();
    interactionTweenRef.current = gsap.to(interactionGroup.position, {
      y: HOVER_LIFT,
      duration: 0.16,
      ease: 'power2.out',
      overwrite: true,
      onUpdate: invalidate,
    });
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    if (!hoverActiveRef.current) return;

    event.stopPropagation();
    hoverActiveRef.current = false;
    canvas.style.cursor = '';

    const interactionGroup = interactionGroupRef.current;
    if (!interactionGroup) return;

    interactionTweenRef.current?.kill();
    interactionTweenRef.current = gsap.to(interactionGroup.position, {
      y: 0,
      duration: 0.2,
      ease: 'power2.out',
      overwrite: true,
      onUpdate: invalidate,
    });
  };

  return (
    <group ref={dealGroupRef}>
      <group
        onPointerCancel={interactive ? handlePointerOut : undefined}
        onPointerOut={interactive ? handlePointerOut : undefined}
        onPointerOver={interactive ? handlePointerOver : undefined}
        ref={interactionGroupRef}
      >
        {texturesReady
          ? (children ??
            (hidden ? <Card3D hidden /> : card ? <Card3D card={card} /> : null))
          : null}
      </group>
    </group>
  );
}
