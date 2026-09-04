import { describe, expect, it } from 'vitest';

import {
  GAME_TABLE_WIDE_MIN_HEIGHT,
  GAME_TABLE_WIDE_MIN_WIDTH,
  getGameTableLayoutMode,
} from './hudLayout';

describe('getGameTableLayoutMode', () => {
  it.each([
    [1920, 1080, 'wide'],
    [1600, 900, 'wide'],
    [1366, 768, 'compact'],
    [1280, 720, 'compact'],
    [1024, 768, 'compact'],
    [900, 900, 'compact'],
    [844, 390, 'compact'],
    [390, 844, 'portrait'],
  ] as const)('classifies %sx%s as %s', (width, height, mode) => {
    expect(getGameTableLayoutMode(width, height)).toBe(mode);
  });

  it('has an explicit wide width boundary', () => {
    expect(
      getGameTableLayoutMode(
        GAME_TABLE_WIDE_MIN_WIDTH - 1,
        GAME_TABLE_WIDE_MIN_HEIGHT,
      ),
    ).toBe('compact');
    expect(
      getGameTableLayoutMode(
        GAME_TABLE_WIDE_MIN_WIDTH,
        GAME_TABLE_WIDE_MIN_HEIGHT,
      ),
    ).toBe('wide');
    expect(
      getGameTableLayoutMode(
        GAME_TABLE_WIDE_MIN_WIDTH + 1,
        GAME_TABLE_WIDE_MIN_HEIGHT,
      ),
    ).toBe('wide');
  });

  it('has an explicit wide height boundary', () => {
    expect(
      getGameTableLayoutMode(
        GAME_TABLE_WIDE_MIN_WIDTH,
        GAME_TABLE_WIDE_MIN_HEIGHT - 1,
      ),
    ).toBe('compact');
    expect(
      getGameTableLayoutMode(
        GAME_TABLE_WIDE_MIN_WIDTH,
        GAME_TABLE_WIDE_MIN_HEIGHT,
      ),
    ).toBe('wide');
    expect(
      getGameTableLayoutMode(
        GAME_TABLE_WIDE_MIN_WIDTH,
        GAME_TABLE_WIDE_MIN_HEIGHT + 1,
      ),
    ).toBe('wide');
  });

  it('keeps the portrait aspect-ratio boundary explicit', () => {
    expect(getGameTableLayoutMode(799, 1000)).toBe('portrait');
    expect(getGameTableLayoutMode(800, 1000)).toBe('compact');
    expect(getGameTableLayoutMode(801, 1000)).toBe('compact');
  });
});
