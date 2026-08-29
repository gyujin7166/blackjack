import { afterEach, describe, expect, it, vi } from 'vitest';

import { getGameSoundTrigger, playGameSound } from './gameSounds';

class AudioMock {
  static instances: AudioMock[] = [];

  readonly play = vi.fn(() => Promise.resolve());
  readonly src: string;
  volume = 1;

  constructor(src: string) {
    this.src = src;
    AudioMock.instances.push(this);
  }
}

describe('playGameSound', () => {
  afterEach(() => {
    AudioMock.instances = [];
    vi.unstubAllGlobals();
  });

  it('maps each game sound to its asset at a moderate volume', () => {
    vi.stubGlobal('Audio', AudioMock);

    playGameSound('initialDeal');
    playGameSound('draw');

    expect(AudioMock.instances.map(({ src }) => src)).toEqual([
      '/sound/placing-playing-card.mp3',
      '/sound/taking-playing-card.mp3',
    ]);
    expect(AudioMock.instances.every(({ volume }) => volume === 0.5)).toBe(true);
    expect(AudioMock.instances.every(({ play }) => play.mock.calls.length === 1))
      .toBe(true);
  });

  it('creates a separate audio instance for overlapping card deals', () => {
    vi.stubGlobal('Audio', AudioMock);

    playGameSound('initialDeal');
    playGameSound('initialDeal');

    expect(AudioMock.instances).toHaveLength(2);
    expect(AudioMock.instances[0]).not.toBe(AudioMock.instances[1]);
  });

  it('does not throw when playback is rejected', async () => {
    class RejectedAudioMock extends AudioMock {
      override readonly play = vi.fn(() => Promise.reject(new Error('blocked')));
    }
    vi.stubGlobal('Audio', RejectedAudioMock);

    expect(() => playGameSound('draw')).not.toThrow();
    await Promise.resolve();
  });
});

describe('getGameSoundTrigger', () => {
  it('plays initial deals on arrival and additional draws on movement start', () => {
    expect(getGameSoundTrigger('initialDeal')).toBe('complete');
    expect(getGameSoundTrigger('draw')).toBe('start');
  });
});
