import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const quote = String.fromCharCode(39);
const requiredDirectives = [
  `script-src-attr ${quote}none${quote}`,
  `base-uri ${quote}none${quote}`,
  `form-action ${quote}none${quote}`,
  `object-src ${quote}none${quote}`,
  `require-trusted-types-for ${quote}script${quote}`,
  `trusted-types ${quote}none${quote}`,
];

function collectHtmlFiles(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectHtmlFiles(fullPath, output);
    else if (entry.name.endsWith('.html')) output.push(fullPath);
  }
  return output;
}

function fail(message, file) {
  throw new Error(`${message}: ${path.relative(process.cwd(), file)}`);
}

const htmlFiles = collectHtmlFiles(distDir);
let inlineScriptCount = 0;

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const cspMatch = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i);
  if (!cspMatch) fail('Missing Content Security Policy', file);
  const csp = cspMatch[1];

  for (const directive of requiredDirectives) {
    if (!csp.includes(directive)) fail(`Missing CSP directive ${directive}`, file);
  }

  const markupWithoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  if (/<[^>]+\son[a-z]+\s*=/i.test(markupWithoutScripts)) {
    fail('Inline event handler bypasses script-src-attr', file);
  }

  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(script[1])) continue;
    inlineScriptCount += 1;
    const hash = createHash('sha256').update(script[2]).digest('base64');
    if (!csp.includes(`${quote}sha256-${hash}${quote}`)) {
      fail('Inline script is missing its CSP hash', file);
    }
  }
}

const englishHome = readFileSync(path.join(distDir, 'index.html'), 'utf8');
const localizedHome = readFileSync(path.join(distDir, 'de', 'index.html'), 'utf8');
const gamesPage = readFileSync(path.join(distDir, 'games', 'index.html'), 'utf8');
if (englishHome.includes('lingva.ml')) fail('English page exposes the translation origin', path.join(distDir, 'index.html'));
if (!localizedHome.includes('https://lingva.ml')) fail('Localized CSP is missing the translation origin', path.join(distDir, 'de', 'index.html'));

const proxyEnabled = process.env.PUBLIC_ROBLOX_PROXY === '1';
if (gamesPage.includes('/api/roblox-presence') !== proxyEnabled) {
  fail('Presence client does not match PUBLIC_ROBLOX_PROXY', path.join(distDir, 'games', 'index.html'));
}

for (const staleScript of ['blogs.js', 'notice.js', 'site.js']) {
  const stalePath = path.join(distDir, 'scripts', staleScript);
  if (existsSync(stalePath)) fail('Stale public script was emitted', stalePath);
}

const headersPath = path.join(distDir, '_headers');
const headersFile = readFileSync(headersPath, 'utf8');
const defaultHeaderBlock = headersFile.match(/^\/\*\r?\n((?: {2}[^\r\n]*\r?\n)+)/m)?.[1];
if (!defaultHeaderBlock) fail('Missing default header block', headersPath);
for (const requiredHeader of [
  'Strict-Transport-Security:',
  'X-Frame-Options: DENY',
  "Content-Security-Policy: frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy: same-origin',
  'Origin-Agent-Cluster: ?1',
  'X-Content-Type-Options: nosniff',
  'X-Permitted-Cross-Domain-Policies: none',
  'Permissions-Policy:',
]) {
  if (!defaultHeaderBlock.includes(requiredHeader)) fail(`Missing default header ${requiredHeader}`, headersPath);
}
if (/^ {2}(?:Link|Vary):/m.test(defaultHeaderBlock)) {
  fail('Link or Vary must not apply to every asset', headersPath);
}
if (!headersFile.includes('Cache-Control: public, max-age=31536000, immutable')) {
  fail('Missing immutable asset cache policy', headersPath);
}
if (!headersFile.includes('Cache-Control: public, max-age=300, must-revalidate')) {
  fail('Missing revalidation policy for HTML', headersPath);
}
if (headersFile.includes('Cache-Control: public, max-age=300, stale-while-revalidate')) {
  fail('HTML can outlive its content-hashed CSS and JavaScript assets', headersPath);
}

console.log(`Security check passed: ${htmlFiles.length} HTML files, ${inlineScriptCount} CSP-hashed inline scripts.`);
