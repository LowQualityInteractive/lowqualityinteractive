import { bindUISFX, createUISFX } from 'uisfx';

// Keep the sound layer deliberately small: only controls that change state or
// confirm an action opt in through data-uisfx attributes in the markup.
const player = createUISFX({
  pack: 'minimal',
  volume: 0.28,
  maxVoices: 3,
  preferences: { key: 'lqi-sfx' },
});

bindUISFX(document, { player });
