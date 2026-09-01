export const HUD_REFERENCE_WIDTH = 1920;
export const HUD_REFERENCE_HEIGHT = 1080;

export interface HudLayout {
  isPortrait: boolean;
  offsetX: number;
  offsetY: number;
  scale: number;
}

export function calculateHudLayout(width: number, height: number): HudLayout {
  if (width <= 0 || height <= 0) {
    return { isPortrait: false, offsetX: 0, offsetY: 0, scale: 1 };
  }

  if (width / height < 0.8) {
    return { isPortrait: true, offsetX: 0, offsetY: 0, scale: 1 };
  }

  const scale = Math.min(
    width / HUD_REFERENCE_WIDTH,
    height / HUD_REFERENCE_HEIGHT,
  );
  return {
    isPortrait: false,
    offsetX: (width - HUD_REFERENCE_WIDTH * scale) / 2,
    offsetY: (height - HUD_REFERENCE_HEIGHT * scale) / 2,
    scale,
  };
}
