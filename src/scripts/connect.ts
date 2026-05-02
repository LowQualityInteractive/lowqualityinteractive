export function getConnectScript(copy: string, copied: string, email: string) {
  return String.raw`(() => {
  const TEXT = ${JSON.stringify({ copy, copied, email })};
  const button = document.getElementById('copy-email');
  const label = document.getElementById('copy-label');

  if (!(button instanceof HTMLButtonElement) || !(label instanceof HTMLElement)) {
    return;
  }

  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(TEXT.email);
      label.textContent = TEXT.copied;
      window.setTimeout(() => {
        label.textContent = TEXT.copy;
      }, 2000);
    } catch {
      label.textContent = TEXT.copy;
    }
  });
})();`;
}
