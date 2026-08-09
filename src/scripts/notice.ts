import { serializeInlineData } from './inline-data';

interface CookieNoticeMessages {
  accept: string;
  ariaLabel: string;
  dismiss: string;
  message: string;
}

export function getNoticeScript(messages: CookieNoticeMessages) {
  return String.raw`(function () {
  if (window.__lqiCookies.get('lqi-ok') === '1') return;

  const TEXT = ${serializeInlineData(messages)};

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
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const dismissIcon = document.createElementNS(svgNamespace, 'svg');
  dismissIcon.setAttribute('viewBox', '0 0 24 24');
  dismissIcon.setAttribute('fill', 'none');
  dismissIcon.setAttribute('stroke', 'currentColor');
  dismissIcon.setAttribute('stroke-width', '2.5');
  dismissIcon.setAttribute('stroke-linecap', 'round');
  dismissIcon.setAttribute('stroke-linejoin', 'round');
  dismissIcon.setAttribute('aria-hidden', 'true');
  for (const [x1, y1, x2, y2] of [['18', '6', '6', '18'], ['6', '6', '18', '18']]) {
    const line = document.createElementNS(svgNamespace, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    dismissIcon.appendChild(line);
  }
  dismissButton.appendChild(dismissIcon);

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
