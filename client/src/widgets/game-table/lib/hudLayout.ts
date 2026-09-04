export type GameTableLayoutMode = 'wide' | 'compact' | 'portrait';

export const GAME_TABLE_PORTRAIT_ASPECT_RATIO = 0.8;
export const GAME_TABLE_WIDE_MIN_HEIGHT = 700;
export const GAME_TABLE_WIDE_MIN_WIDTH = 1440;

export function getGameTableLayoutMode(
  width: number,
  height: number,
): GameTableLayoutMode {
  if (width <= 0 || height <= 0) return 'wide';
  if (width / height < GAME_TABLE_PORTRAIT_ASPECT_RATIO) return 'portrait';
  if (
    width >= GAME_TABLE_WIDE_MIN_WIDTH &&
    height >= GAME_TABLE_WIDE_MIN_HEIGHT
  ) {
    return 'wide';
  }
  return 'compact';
}
