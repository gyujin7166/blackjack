import type { Card } from '@blackjack/shared';
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { Group } from 'three';

import {
  CARD_BACK_ASSET_URL,
  getCardFaceAssetUrl,
} from '../../../entities/card/lib/cardAsset';
import { getCachedCardTexture } from '../../../entities/card/lib/cardTexture';
import {
  CARD_BODY_GEOMETRY,
  CARD_BODY_MATERIAL,
  CARD_HEIGHT,
  CARD_SURFACE_GEOMETRY,
  CARD_WIDTH,
} from '../../../entities/card/ui/Card3D';
import type { CardScreenBounds } from './DealtCard3D';

type InspectionStage = 'opening' | 'inspecting' | 'closing';

interface CardInspectionOverlayProps {
  card: Card;
  closeRequested: boolean;
  getSourceBounds: () => CardScreenBounds | null;
  onClosed: () => void;
  sourceBounds: CardScreenBounds;
}

interface InspectionSceneProps extends Omit<
  CardInspectionOverlayProps,
  'closeRequested'
> {
  onOpened: () => void;
  stage: InspectionStage;
}

function getTransitionMetrics(
  bounds: CardScreenBounds,
  canvasBounds: DOMRect,
  pixelsPerUnit: number,
) {
  return {
    position: [
      (bounds.x +
        bounds.width / 2 -
        canvasBounds.left -
        canvasBounds.width / 2) /
        pixelsPerUnit,
      -(
        bounds.y +
        bounds.height / 2 -
        canvasBounds.top -
        canvasBounds.height / 2
      ) / pixelsPerUnit,
      0,
    ] as const,
    scale: Math.max(
      0.01,
      Math.min(
        bounds.width / CARD_WIDTH / pixelsPerUnit,
        bounds.height / CARD_HEIGHT / pixelsPerUnit,
      ),
    ),
  };
}

function InspectionCardModel({ card }: { card: Card }) {
  const faceTexture = getCachedCardTexture(getCardFaceAssetUrl(card));
  const backTexture = getCachedCardTexture(CARD_BACK_ASSET_URL);

  if (!faceTexture || !backTexture) return null;

  return (
    <group>
      <mesh position={[0, 0, -0.021]} scale={[1, 1, 0.5]}>
        <primitive
          attach="geometry"
          dispose={null}
          object={CARD_BODY_GEOMETRY}
        />
        <primitive
          attach="material"
          dispose={null}
          object={CARD_BODY_MATERIAL}
        />
      </mesh>

      <mesh position={[0, 0, 0.022]}>
        <primitive
          attach="geometry"
          dispose={null}
          object={CARD_SURFACE_GEOMETRY}
        />
        <meshPhysicalMaterial
          alphaTest={0.5}
          clearcoat={0.16}
          clearcoatRoughness={0.52}
          map={faceTexture}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-1}
          roughness={0.5}
        />
      </mesh>

      <mesh position={[0, 0, -0.037]} rotation={[0, Math.PI, 0]}>
        <primitive
          attach="geometry"
          dispose={null}
          object={CARD_SURFACE_GEOMETRY}
        />
        <meshPhysicalMaterial
          alphaTest={0.5}
          clearcoat={0.16}
          clearcoatRoughness={0.52}
          map={backTexture}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-1}
          roughness={0.5}
        />
      </mesh>
    </group>
  );
}

function InspectionScene({
  card,
  getSourceBounds,
  onClosed,
  onOpened,
  sourceBounds,
  stage,
}: InspectionSceneProps) {
  const transitionGroupRef = useRef<Group>(null);
  const rotationGroupRef = useRef<Group>(null);
  const transitionTweenRef = useRef<gsap.core.Timeline | null>(null);
  const capturedPointerRef = useRef<{
    pointerId: number;
    target: Element;
  } | null>(null);
  const dragRef = useRef<{
    lastX: number;
    lastY: number;
    pointerId: number;
  } | null>(null);
  const openingStartedRef = useRef(false);
  const openingCompletedRef = useRef(false);
  const closingCompletedRef = useRef(false);
  const canvas = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const viewport = useThree((state) => state.viewport);
  const pixelsPerUnit = size.width / viewport.width;
  const targetScale = Math.min(
    Math.min(size.width * 0.56, 420) / CARD_WIDTH / pixelsPerUnit,
    Math.min(size.height * 0.68, 600) / CARD_HEIGHT / pixelsPerUnit,
  );

  const releasePointer = useCallback(() => {
    const capturedPointer = capturedPointerRef.current;
    if (
      capturedPointer &&
      capturedPointer.target.hasPointerCapture(capturedPointer.pointerId)
    ) {
      capturedPointer.target.releasePointerCapture(capturedPointer.pointerId);
    }
    capturedPointerRef.current = null;
    dragRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const transitionGroup = transitionGroupRef.current;
    const rotationGroup = rotationGroupRef.current;
    if (!transitionGroup || !rotationGroup) return;

    transitionTweenRef.current?.kill();
    const canvasBounds = canvas.getBoundingClientRect();

    if (stage === 'opening') {
      const start = getTransitionMetrics(
        sourceBounds,
        canvasBounds,
        pixelsPerUnit,
      );
      if (!openingStartedRef.current) {
        openingStartedRef.current = true;
        transitionGroup.position.set(...start.position);
        transitionGroup.scale.setScalar(start.scale);
      }

      transitionTweenRef.current = gsap
        .timeline({
          onComplete: () => {
            if (openingCompletedRef.current) return;
            openingCompletedRef.current = true;
            onOpened();
          },
          onUpdate: invalidate,
        })
        .to(
          transitionGroup.position,
          { x: 0, y: 0, z: 0, duration: 0.34, ease: 'power2.out' },
          0,
        )
        .to(
          transitionGroup.scale,
          {
            x: targetScale,
            y: targetScale,
            z: targetScale,
            duration: 0.34,
            ease: 'power2.out',
          },
          0,
        );
    } else if (stage === 'inspecting') {
      transitionGroup.position.set(0, 0, 0);
      transitionGroup.scale.setScalar(targetScale);
      invalidate();
    } else {
      releasePointer();
      const currentSourceBounds = getSourceBounds();
      if (!currentSourceBounds) {
        if (!closingCompletedRef.current) {
          closingCompletedRef.current = true;
          onClosed();
        }
        return;
      }

      const target = getTransitionMetrics(
        currentSourceBounds,
        canvasBounds,
        pixelsPerUnit,
      );
      transitionTweenRef.current = gsap
        .timeline({
          onComplete: () => {
            if (closingCompletedRef.current) return;
            closingCompletedRef.current = true;
            onClosed();
          },
          onUpdate: invalidate,
        })
        .to(
          rotationGroup.rotation,
          { x: 0, y: 0, z: 0, duration: 0.26, ease: 'power2.out' },
          0,
        )
        .to(
          transitionGroup.position,
          {
            x: target.position[0],
            y: target.position[1],
            z: 0,
            duration: 0.26,
            ease: 'power2.inOut',
          },
          0,
        )
        .to(
          transitionGroup.scale,
          {
            x: target.scale,
            y: target.scale,
            z: target.scale,
            duration: 0.26,
            ease: 'power2.inOut',
          },
          0,
        );
    }

    return () => {
      transitionTweenRef.current?.kill();
    };
  }, [
    canvas,
    getSourceBounds,
    invalidate,
    onClosed,
    onOpened,
    pixelsPerUnit,
    releasePointer,
    size.height,
    size.width,
    sourceBounds,
    stage,
    targetScale,
  ]);

  useEffect(() => {
    return () => {
      transitionTweenRef.current?.kill();
      releasePointer();
      canvas.style.cursor = '';
    };
  }, [canvas, releasePointer]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (stage !== 'inspecting') return;

    event.stopPropagation();
    const target = event.target as Element;
    target.setPointerCapture(event.pointerId);
    capturedPointerRef.current = { pointerId: event.pointerId, target };
    dragRef.current = {
      lastX: event.clientX,
      lastY: event.clientY,
      pointerId: event.pointerId,
    };
    canvas.style.cursor = 'grabbing';
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current;
    const rotationGroup = rotationGroupRef.current;
    if (!drag || !rotationGroup || drag.pointerId !== event.pointerId) return;

    event.stopPropagation();
    rotationGroup.rotation.x += (event.clientY - drag.lastY) * 0.012;
    rotationGroup.rotation.y += (event.clientX - drag.lastX) * 0.012;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    invalidate();
  };

  const handlePointerEnd = (event: ThreeEvent<PointerEvent>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;

    event.stopPropagation();
    releasePointer();
    canvas.style.cursor = 'grab';
  };

  return (
    <>
      <ambientLight intensity={1.45} />
      <directionalLight intensity={2.2} position={[-3, 4, 6]} />
      <group ref={transitionGroupRef}>
        <group
          onClick={(event) => event.stopPropagation()}
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerOut={() => {
            if (!dragRef.current) canvas.style.cursor = '';
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            if (!dragRef.current && stage === 'inspecting') {
              canvas.style.cursor = 'grab';
            }
          }}
          onPointerUp={handlePointerEnd}
          ref={rotationGroupRef}
        >
          <InspectionCardModel card={card} />
        </group>
      </group>
    </>
  );
}

export function CardInspectionOverlay({
  card,
  closeRequested,
  getSourceBounds,
  onClosed,
  sourceBounds,
}: CardInspectionOverlayProps) {
  const [stage, setStage] = useState<InspectionStage>('opening');
  const stageRef = useRef<InspectionStage>('opening');

  const requestClose = useCallback(() => {
    if (stageRef.current === 'closing') return;
    stageRef.current = 'closing';
    setStage('closing');
  }, []);

  const handleOpened = useCallback(() => {
    if (stageRef.current !== 'opening') return;
    stageRef.current = 'inspecting';
    setStage('inspecting');
  }, []);

  useEffect(() => {
    if (closeRequested) requestClose();
  }, [closeRequested, requestClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') requestClose();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [requestClose]);

  return (
    <div
      aria-label="카드 3D 검사"
      aria-modal="true"
      className="pointer-events-auto absolute inset-0 z-40 bg-black/60"
      role="dialog"
    >
      <Canvas
        camera={{ position: [0, 0, 10], zoom: 100 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ alpha: true, antialias: true }}
        onPointerMissed={requestClose}
        orthographic
        style={{ touchAction: 'none' }}
      >
        <InspectionScene
          card={card}
          getSourceBounds={getSourceBounds}
          onClosed={onClosed}
          onOpened={handleOpened}
          sourceBounds={sourceBounds}
          stage={stage}
        />
      </Canvas>
    </div>
  );
}
