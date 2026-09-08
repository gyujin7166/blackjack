import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const assets = [
  {
    envName: 'CARD_PLACING_SOUND_BASE64',
    path: 'client/public/sound/placing-playing-card.mp3',
  },
  {
    envName: 'CARD_TAKING_SOUND_BASE64',
    path: 'client/public/sound/taking-playing-card.mp3',
  },
];

for (const asset of assets) {
  const encoded = process.env[asset.envName];

  if (!encoded) {
    console.log(`[sound-assets] ${asset.envName} is not set. Skipping.`);
    continue;
  }

  const target = resolve(process.cwd(), asset.path);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(encoded, 'base64'));

  console.log(`[sound-assets] Restored ${asset.path}`);
}
