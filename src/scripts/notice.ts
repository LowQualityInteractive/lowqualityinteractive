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

  // Build banner
  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', TEXT.ariaLabel);

  const inner = document.createElement('div');
  inner.className = 'cookie-banner-inner';

  const icon = document.createElement('div');
  icon.className = 'cookie-banner-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';

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
  inner.append(icon, textWrap, actions);
  banner.appendChild(inner);
  document.body.appendChild(banner);

  function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  function dismiss(accept) {
    if (window.__lqiTheme) {
      window.__lqiTheme.grantConsent();
    } else {
      setCookie('lqi-ok', '1', 365);
    }
    banner.classList.add('is-hidden');
    window.setTimeout(() => banner.remove(), 380);
  }

  // Slide in after a short delay so the animation is visible
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      banner.classList.add('is-visible');
    });
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
