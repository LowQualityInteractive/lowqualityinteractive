// The synthesizer is about 40 KB minified. Load it on the first sign of user
// interaction instead of charging every page view for audio that may never
// play. Pointer hover and focus normally finish the import before activation.
const activationEvents = ['pointerover', 'focusin', 'touchstart', 'keydown'] as const;
let loading = false;

const loadSoundLayer = () => {
  if (loading) return;
  loading = true;
  for (const eventName of activationEvents) {
    document.removeEventListener(eventName, loadSoundLayer, true);
  }

  void import('uisfx')
    .then(({ bindUISFX, createUISFX }) => {
      const player = createUISFX({
        pack: 'minimal',
        volume: 0.28,
        maxVoices: 3,
        preferences: { key: 'lqi-sfx' },
      });
      bindUISFX(document, { player });
    })
    .catch(() => undefined);
};

for (const eventName of activationEvents) {
  document.addEventListener(eventName, loadSoundLayer, { capture: true, passive: true });
}
