export type GameSound = 'initialDeal' | 'draw';
export type GameSoundTrigger = 'start' | 'complete';

const soundSources: Record<GameSound, string> = {
  initialDeal: '/sound/placing-playing-card.mp3',
  draw: '/sound/taking-playing-card.mp3',
};

const GAME_SOUND_VOLUME = 0.5;
const GAME_SOUND_POOL_SIZE = 6;
const gameSounds: GameSound[] = ['initialDeal', 'draw'];
const soundPools = new Map<GameSound, HTMLAudioElement[]>();

function createGameSoundAudio(sound: GameSound): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;

  try {
    const audio = new Audio(soundSources[sound]);
    audio.volume = GAME_SOUND_VOLUME;
    audio.preload = 'auto';

    try {
      audio.load();
    } catch {
      // Sound preload is optional presentation and must not affect play.
    }

    return audio;
  } catch {
    // Some environments do not provide a usable media implementation.
    return null;
  }
}

export function getGameSoundTrigger(sound: GameSound): GameSoundTrigger {
  return sound === 'draw' ? 'start' : 'complete';
}

export function prepareGameSounds() {
  if (typeof Audio === 'undefined') return;

  for (const sound of gameSounds) {
    if (soundPools.has(sound)) continue;

    const channels: HTMLAudioElement[] = [];

    for (let index = 0; index < GAME_SOUND_POOL_SIZE; index += 1) {
      const audio = createGameSoundAudio(sound);
      if (audio) channels.push(audio);
    }

    soundPools.set(sound, channels);
  }
}

export function playGameSound(sound: GameSound) {
  if (typeof Audio === 'undefined') return;

  prepareGameSounds();

  const audio =
    soundPools.get(sound)?.find((channel) => channel.paused || channel.ended) ??
    createGameSoundAudio(sound);

  if (!audio) return;

  try {
    audio.currentTime = 0;
  } catch {
    // Media metadata may not be ready yet; playback can still be attempted.
  }

  try {
    void audio.play().catch(() => {
      // Sound is optional presentation; playback policy failures must not affect play.
    });
  } catch {
    // Some non-browser environments can reject playback synchronously.
  }
}
