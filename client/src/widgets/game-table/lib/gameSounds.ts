export type GameSound = 'initialDeal' | 'draw';
export type GameSoundTrigger = 'start' | 'complete';

const soundSources: Record<GameSound, string> = {
  initialDeal: '/sound/placing-playing-card.mp3',
  draw: '/sound/taking-playing-card.mp3',
};

const GAME_SOUND_VOLUME = 0.5;

export function getGameSoundTrigger(sound: GameSound): GameSoundTrigger {
  return sound === 'draw' ? 'start' : 'complete';
}

export function playGameSound(sound: GameSound) {
  if (typeof Audio === 'undefined') return;

  const audio = new Audio(soundSources[sound]);
  audio.volume = GAME_SOUND_VOLUME;
  try {
    void audio.play().catch(() => {
      // Sound is optional presentation; playback policy failures must not affect play.
    });
  } catch {
    // Some non-browser environments can reject playback synchronously.
  }
}
