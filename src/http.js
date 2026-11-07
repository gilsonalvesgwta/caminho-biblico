import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handlers });
    return this;
  }
  get(p, ...h) { return this.add('GET', p, ...h); }
  post(p, ...h) { return this.add('POST', p, ...h); }
  put(p, ...h) { return this.add('PUT', p, ...h); }
  patch(p, ...h) { return this.add('PATCH', p, ...h); }
  delete(p, ...h) { return this.add('DELETE', p, ...h); }
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = pathname.match(r.re);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    }
    return pathMatched ? { notAllowed: true } : null;
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, { maxAge, path: p = '/', httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${p}`, 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');
  if (config.cookieSecure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${Math.floor(maxAge)}`);
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []), parts.join('; ')]);
}

export async function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Payload muito grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function parseBody(rawBody, contentType = '') {
  if (!rawBody) return {};
  if (contentType.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(rawBody));
  try { return JSON.parse(rawBody); } catch { throw new HttpError(400, 'JSON inválido'); }
}

export function clientIp(req) {
  if (config.trustProxy) {
    const xf = req.headers['x-forwarded-for'];
    if (xf) return String(xf).split(',')[0].trim();
    if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']);
  }
  return req.socket.remoteAddress;
}

export function send(res, status, body, headers = {}) {
  if (res.headersSent) return;
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

// Rate limit simples em memória (por chave)
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const t = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < t) { buckets.set(key, { n: 1, reset: t + windowMs }); return; }
  b.n++;
  if (b.n > max) fail(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
}
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 60_000).unref();

// ---------- arquivos estáticos ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
export function serveStatic(req, res, root, pathname, { spaIndex, immutable } = {}) {
  const safe = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(root, safe);
  if (!file.startsWith(root)) return false;
  let st = fs.existsSync(file) ? fs.statSync(file) : null;
  if (st?.isDirectory()) { file = path.join(file, 'index.html'); st = fs.existsSync(file) ? fs.statSync(file) : null; }
  if (!st) {
    if (!spaIndex || path.extname(safe)) return false;
    file = spaIndex; st = fs.statSync(file);
  }
  const ext = path.extname(file);
  const etag = `W/"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
  const noCache = ext === '.html' || file.endsWith('sw.js') || ext === '.webmanifest';
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : noCache ? 'no-cache' : 'public, max-age=3600',
    ETag: etag,
  };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(file).pipe(res);
  return true;
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://www.youtube.com https://s.ytimg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' https: blob:",
    "connect-src 'self'",
    "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://*.pandavideo.com.br https://*.tv.pandavideo.com.br https://fast.wistia.net https://iframe.mediadelivery.net https://*.vturb.com.br https://scripts.converteai.net",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};
