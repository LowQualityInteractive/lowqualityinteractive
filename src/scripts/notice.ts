interface CookieNoticeMessages {
  accept: string;
  ariaLabel: string;
  dismiss: string;
  message: string;
}

export function getNoticeScript(messages: CookieNoticeMessages) {
  return String.raw`(function () {
  if (document.cookie.includes('lqi-ok=')) return;

  const TEXT = ${JSON.stringify(messages)};

  // Keep the notice quiet and compact. It only appears until the user chooses
  // an option, then leaves without blocking the page.
  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', TEXT.ariaLabel);

  const inner = document.createElement('div');
  inner.className = 'cookie-banner-inner';

  const textWrap = document.createElement('div');
  textWrap.className = 'cookie-banner-text';

  const message = document.createElement('p');
  message.textContent = TEXT.message;

  textWrap.appendChild(message);

  const actions = document.createElement('div');
  actions.className = 'cookie-banner-actions';

  const acceptButton = document.createElement('button');
  acceptButton.type = 'button';
  acceptButton.className = 'button primary cookie-accept';
  acceptButton.textContent = TEXT.accept;

  const dismissButton = document.createElement('button');
  dismissButton.type = 'button';
  dismissButton.className = 'cookie-dismiss';
  dismissButton.setAttribute('aria-label', TEXT.dismiss);
  dismissButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  actions.append(acceptButton, dismissButton);
  inner.append(textWrap, actions);
  banner.appendChild(inner);
  document.body.appendChild(banner);

  function dismiss(accept) {
    if (accept) {
      if (window.__lqiTheme) {
        window.__lqiTheme.grantConsent();
      } else {
        window.__lqiCookies.set('lqi-ok', '1', 365);
      }
    }
    banner.classList.add('is-hidden');
    window.setTimeout(() => banner.remove(), 220);
  }

  // One frame is enough to let the compact fade settle in without a large
  // slide or a delayed entrance sequence.
  window.requestAnimationFrame(() => {
    banner.classList.add('is-visible');
  });

  acceptButton.addEventListener('click', () => dismiss(true), { once: true });
  dismissButton.addEventListener('click', () => dismiss(false), { once: true });

  banner.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    if (event.shiftKey) {
      if (document.activeElement === acceptButton) {
        event.preventDefault();
        dismissButton.focus();
      }
    } else if (document.activeElement === dismissButton) {
      event.preventDefault();
      acceptButton.focus();
    }
  });

  acceptButton.focus();
})();`;
}
