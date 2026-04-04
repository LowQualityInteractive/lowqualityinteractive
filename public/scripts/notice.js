(function () {
  if (document.cookie.includes('lqi-ok=')) return;

  var banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Preference notice');

  var message = document.createElement('p');
  message.textContent = 'We use one cookie to remember your light/dark mode preference. No tracking, no analytics.';

  var actions = document.createElement('div');
  actions.className = 'cookie-banner-actions';

  var acceptButton = document.createElement('button');
  acceptButton.type = 'button';
  acceptButton.className = 'button primary cookie-accept';
  acceptButton.textContent = 'Got it';

  var dismissButton = document.createElement('button');
  dismissButton.type = 'button';
  dismissButton.className = 'cookie-dismiss';
  dismissButton.setAttribute('aria-label', 'Dismiss');
  dismissButton.textContent = '✕';

  actions.append(acceptButton, dismissButton);
  banner.append(message, actions);

  document.body.appendChild(banner);

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  function dismiss(accept) {
    if (accept && window.__lqiTheme) {
      window.__lqiTheme.grantConsent();
    } else {
      setCookie('lqi-ok', '0', 365);
    }
    banner.classList.add('is-hidden');
    setTimeout(function () { banner.remove(); }, 320);
  }

  acceptButton.addEventListener('click', function () { dismiss(true); }, { once: true });
  dismissButton.addEventListener('click', function () { dismiss(false); }, { once: true });
})();
