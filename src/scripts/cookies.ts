// Inline snippet defining window.__lqiCookies.{get,set}. Idempotent.
export function getCookiesBootstrap() {
  return String.raw`(() => {
  if (window.__lqiCookies) return;
  const get = (name) => {
    const pattern = new RegExp('(?:^|; )' + name + '=([^;]*)');
    const match = document.cookie.match(pattern);
    return match ? decodeURIComponent(match[1]) : null;
  };
  const set = (name, value, days) => {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
  };
  window.__lqiCookies = { get, set };
})();`;
}
