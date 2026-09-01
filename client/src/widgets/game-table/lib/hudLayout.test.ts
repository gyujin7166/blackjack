import { describe, expect, it } from 'vitest';

import { calculateHudLayout } from './hudLayout';

describe('calculateHudLayout', () => {
  it.each([
    [1280, 720, 2 / 3, 0, 0],
    [1920, 1080, 1, 0, 0],
    [2560, 1440, 4 / 3, 0, 0],
    [3840, 2160, 2, 0, 0],
    [1920, 1200, 1, 0, 60],
    [1440, 1080, 0.75, 0, 135],
    [2560, 1080, 1, 320, 0],
  ])(
    'contains a 1920x1080 layer in %sx%s',
    (width, height, scale, offsetX, offsetY) => {
      expect(calculateHudLayout(width, height)).toMatchObject({
        isPortrait: false,
        offsetX,
        offsetY,
      });
      expect(calculateHudLayout(width, height).scale).toBeCloseTo(scale);
    },
  );

  it('keeps portrait HUD unscaled', () => {
    expect(calculateHudLayout(390, 844)).toEqual({
      isPortrait: true,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    });
  });
});
