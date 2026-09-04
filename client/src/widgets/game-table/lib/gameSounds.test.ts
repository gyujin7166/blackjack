import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class AudioMock {
  static instances: AudioMock[] = [];

  currentTime = 0;
  ended = false;
  readonly load = vi.fn();
  paused = true;
  readonly play = vi.fn(() => {
    this.ended = false;
    this.paused = false;
    return Promise.resolve();
  });
  preload = '';
  readonly src: string;
  volume = 1;

  constructor(src: string) {
    this.src = src;
    AudioMock.instances.push(this);
  }
}

async function loadGameSounds() {
  vi.resetModules();
  return import('./gameSounds');
}

describe('game sounds', () => {
  beforeEach(() => {
    AudioMock.instances = [];
    vi.stubGlobal('Audio', AudioMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preloads six channels for both assets at a moderate volume', async () => {
    const { prepareGameSounds } = await loadGameSounds();

    prepareGameSounds();

    expect(AudioMock.instances).toHaveLength(12);
    expect(
      AudioMock.instances.filter(({ src }) =>
        src.endsWith('/sound/placing-playing-card.mp3'),
      ),
    ).toHaveLength(6);
    expect(
      AudioMock.instances.filter(({ src }) =>
        src.endsWith('/sound/taking-playing-card.mp3'),
      ),
    ).toHaveLength(6);
    expect(AudioMock.instances.every(({ preload }) => preload === 'auto')).toBe(
      true,
    );
    expect(AudioMock.instances.every(({ volume }) => volume === 0.5)).toBe(
      true,
    );
    expect(
      AudioMock.instances.every(({ load }) => load.mock.calls.length === 1),
    ).toBe(true);
  });

  it('does not create duplicate pools when prepared more than once', async () => {
    const { prepareGameSounds } = await loadGameSounds();

    prepareGameSounds();
    prepareGameSounds();

    expect(AudioMock.instances).toHaveLength(12);
  });

  it('uses separate channels for overlapping card deals', async () => {
    const { playGameSound, prepareGameSounds } = await loadGameSounds();
    prepareGameSounds();
    const dealChannels = AudioMock.instances.filter(({ src }) =>
      src.endsWith('/sound/placing-playing-card.mp3'),
    );

    playGameSound('initialDeal');
    playGameSound('initialDeal');

    expect(dealChannels[0]?.play).toHaveBeenCalledTimes(1);
    expect(dealChannels[1]?.play).toHaveBeenCalledTimes(1);
    expect(AudioMock.instances).toHaveLength(12);
  });

  it('reuses a channel after its playback ends', async () => {
    const { playGameSound, prepareGameSounds } = await loadGameSounds();
    prepareGameSounds();
    const dealChannels = AudioMock.instances.filter(({ src }) =>
      src.endsWith('/sound/placing-playing-card.mp3'),
    );

    playGameSound('initialDeal');
    const firstChannel = dealChannels[0];
    if (!firstChannel) throw new Error('Expected a preloaded deal channel');
    firstChannel.currentTime = 1;
    firstChannel.ended = true;
    playGameSound('initialDeal');

    expect(firstChannel.play).toHaveBeenCalledTimes(2);
    expect(firstChannel.currentTime).toBe(0);
    expect(dealChannels[1]?.play).not.toHaveBeenCalled();
  });

  it('uses a temporary channel when every pooled channel is playing', async () => {
    const { playGameSound, prepareGameSounds } = await loadGameSounds();
    prepareGameSounds();

    for (let index = 0; index < 7; index += 1) {
      playGameSound('initialDeal');
    }

    expect(AudioMock.instances).toHaveLength(13);
    expect(AudioMock.instances[12]?.src).toBe(
      '/sound/placing-playing-card.mp3',
    );
    expect(AudioMock.instances[12]?.play).toHaveBeenCalledTimes(1);
  });

  it('lazily prepares the pools when playback happens first', async () => {
    const { playGameSound } = await loadGameSounds();

    expect(() => playGameSound('draw')).not.toThrow();

    expect(AudioMock.instances).toHaveLength(12);
    const drawChannel = AudioMock.instances.find(({ src }) =>
      src.endsWith('/sound/taking-playing-card.mp3'),
    );
    expect(drawChannel?.play).toHaveBeenCalledTimes(1);
  });

  it('does not throw when playback is rejected', async () => {
    class RejectedAudioMock extends AudioMock {
      override readonly play = vi.fn(() =>
        Promise.reject(new Error('blocked')),
      );
    }
    vi.stubGlobal('Audio', RejectedAudioMock);
    const { playGameSound } = await loadGameSounds();

    expect(() => playGameSound('draw')).not.toThrow();
    await Promise.resolve();
  });

  it('does not expose synchronous media API failures', async () => {
    class FailingAudioMock extends AudioMock {
      override readonly load = vi.fn(() => {
        throw new Error('load failed');
      });
      override readonly play = vi.fn(() => {
        throw new Error('play failed');
      });

      constructor(src: string) {
        super(src);
        Object.defineProperty(this, 'currentTime', {
          get: () => 0,
          set: () => {
            throw new Error('seek failed');
          },
        });
      }
    }
    vi.stubGlobal('Audio', FailingAudioMock);
    const { playGameSound, prepareGameSounds } = await loadGameSounds();

    expect(() => prepareGameSounds()).not.toThrow();
    expect(() => playGameSound('initialDeal')).not.toThrow();
  });

  it('keeps the existing animation trigger timing', async () => {
    const { getGameSoundTrigger } = await loadGameSounds();

    expect(getGameSoundTrigger('initialDeal')).toBe('complete');
    expect(getGameSoundTrigger('draw')).toBe('start');
  });
});
