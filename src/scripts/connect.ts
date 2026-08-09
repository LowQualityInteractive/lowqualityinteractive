export function getConnectScript(): string {
  return `(() => {
    const button = document.querySelector('[data-email-copy]');
    if (!(button instanceof HTMLButtonElement)) return;

    const email = button.dataset.email ?? '';
    const copyLabel = button.dataset.copyLabel ?? 'Copy email address';
    const copiedLabel = button.dataset.copiedLabel ?? 'Copied';
    const businessLabel = button.dataset.businessLabel ?? copyLabel;
    let resetTimer = 0;
    button.addEventListener('click', async () => {
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(email);
          copied = true;
        }
      } catch {}
      window.clearTimeout(resetTimer);
      button.classList.toggle('is-copied', copied);
      button.title = copied ? copiedLabel : copyLabel;
      button.setAttribute('aria-label', copied ? copiedLabel : copyLabel);
      resetTimer = window.setTimeout(() => {
        button.classList.remove('is-copied');
        button.title = businessLabel;
        button.setAttribute('aria-label', copyLabel);
      }, 1800);
    });
  })();`;
}
