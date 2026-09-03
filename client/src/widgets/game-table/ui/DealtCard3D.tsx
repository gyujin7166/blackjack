import type { Card } from '@blackjack/shared';
import { type ThreeEvent, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';
import type { Camera, Group } from 'three';

import {
  CARD_BACK_ASSET_URL,
  getCardFaceAssetUrl,
} from '../../../entities/card/lib/cardAsset';
import {
  areCardTexturesReady,
  prepareCardTextures,
} from '../../../entities/card/lib/cardTexture';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  Card3D,
} from '../../../entities/card/ui/Card3D';
import {
  getGameSoundTrigger,
  playGameSound,
  type GameSound,
} from '../lib/gameSounds';

type Vector3Tuple = [number, number, number];

const HOVER_LIFT = 0.12;

export interface CardScreenBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface CardInspectionSource {
  card: Card;
  getCurrentBounds: () => CardScreenBounds | null;
  id: string;
  initialBounds: CardScreenBounds;
}

function getCardScreenBounds(
  group: Group,
  camera: Camera,
  canvas: HTMLCanvasElement,
): CardScreenBounds | null {
  if (!group.parent) return null;

  group.updateWorldMatrix(true, false);
  const canvasBounds = canvas.getBoundingClientRect();
  const corners = [
    [-CARD_WIDTH / 2, 0, -CARD_HEIGHT / 2],
    [CARD_WIDTH / 2, 0, -CARD_HEIGHT / 2],
    [CARD_WIDTH / 2, 0, CARD_HEIGHT / 2],
    [-CARD_WIDTH / 2, 0, CARD_HEIGHT / 2],
  ] as const;
  const projected = corners.map(([x, y, z]) => {
    const point = new Vector3(x, y, z).applyMatrix4(group.matrixWorld);
    point.project(camera);
    return {
      x: canvasBounds.left + ((point.x + 1) / 2) * canvasBounds.width,
      y: canvasBounds.top + ((1 - point.y) / 2) * canvasBounds.height,
    };
  });
  const xValues = projected.map((point) => point.x);
  const yValues = projected.map((point) => point.y);
  const left = Math.min(...xValues);
  const right = Math.max(...xValues);
  const top = Math.min(...yValues);
  const bottom = Math.max(...yValues);

  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  };
}

type DealtCard3DProps = {
  delay: number;
  initialDealSound?: GameSound;
  inspectionEnabled?: boolean;
  inspectionHidden?: boolean;
  inspectionId?: string;
  interactive?: boolean;
  onInitialDealComplete?: () => void;
  onInspect?: (source: CardInspectionSource) => void;
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
  inspectionEnabled = false,
  inspectionHidden = false,
  inspectionId,
  interactive = false,
  onInitialDealComplete,
  onInspect,
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
  const camera = useThree((state) => state.camera);
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

  useLayoutEffect(() => {
    if (!inspectionHidden) return;

    interactionTweenRef.current?.kill();
    interactionGroupRef.current?.position.set(0, 0, 0);
    if (hoverActiveRef.current) canvas.style.cursor = '';
    hoverActiveRef.current = false;
    invalidate();
  }, [canvas, inspectionHidden, invalidate]);

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    if (
      event.pointerType !== 'mouse' ||
      inspectionHidden ||
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

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (
      !card ||
      !inspectionEnabled ||
      inspectionHidden ||
      !inspectionId ||
      !onInspect ||
      !initialDealCompletedRef.current
    ) {
      return;
    }

    const interactionGroup = interactionGroupRef.current;
    if (!interactionGroup) return;

    const initialBounds = getCardScreenBounds(interactionGroup, camera, canvas);
    if (!initialBounds) return;

    event.stopPropagation();
    onInspect({
      card,
      getCurrentBounds: () =>
        getCardScreenBounds(interactionGroup, camera, canvas),
      id: inspectionId,
      initialBounds,
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
        onClick={interactive ? handleClick : undefined}
        onPointerCancel={interactive ? handlePointerOut : undefined}
        onPointerOut={interactive ? handlePointerOut : undefined}
        onPointerOver={interactive ? handlePointerOver : undefined}
        ref={interactionGroupRef}
        visible={!inspectionHidden}
      >
        {texturesReady
          ? (children ??
            (hidden ? <Card3D hidden /> : card ? <Card3D card={card} /> : null))
          : null}
      </group>
    </group>
  );
}
