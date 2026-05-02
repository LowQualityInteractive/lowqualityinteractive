export function getCookiesBootstrap() {
  return String.raw`(() => {
  if (window.__lqiCookies) return;
  const get = (name) => {
    const pattern = new RegExp('(?:^|; )' + name + '=([^;]*)');
    const match = document.cookie.match(pattern);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  };
  const set = (name, value, days) => {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax' + secure;
  };
  window.__lqiCookies = { get, set };
})();`;
}
