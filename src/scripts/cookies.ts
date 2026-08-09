export function getCookiesBootstrap() {
  return String.raw`(() => {
  if (window.__lqiCookies) return;
  const COOKIE_NAME = /^[A-Za-z0-9_-]{1,64}$/;
  const get = (name) => {
    if (typeof name !== 'string' || !COOKIE_NAME.test(name)) return null;
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
    if (
      typeof name !== 'string' || !COOKIE_NAME.test(name)
      || typeof value !== 'string' || value.length > 256
      || typeof days !== 'number' || !Number.isFinite(days)
    ) return false;
    const lifetimeDays = Math.min(400, Math.max(0, Math.floor(days)));
    const expires = new Date(Date.now() + lifetimeDays * 864e5).toUTCString();
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Strict' + secure;
    return true;
  };
  window.__lqiCookies = { get, set };
})();`;
}
