import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.js';
import { db, migrate, getSettings, setSettings, now } from './src/db.js';
import { Router, HttpError, readBody, parseBody, clientIp, send, serveStatic, SECURITY_HEADERS, rateLimit } from './src/http.js';
import { hashPassword, cleanupSessions, randomToken } from './src/auth.js';
import { seedContent } from './src/content-seed.js';
import { registerAppRoutes } from './src/routes-app.js';
import { registerAdminRoutes } from './src/routes-admin.js';
import { handleWebhook } from './src/greenn.js';
import { processReleases } from './src/services.js';
import { flushOutbox } from './src/events.js';
import { dailyBackupIfDue } from './src/backup.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(ROOT, 'public');

migrate();
seedContent();

// Primeiro administrador (via .env) e token do webhook
if (!db.get('SELECT 1 FROM admins LIMIT 1')) {
  const { email, password, name } = config.bootstrapAdmin;
  if (email && password) {
    db.run("INSERT INTO admins (name, email, password_hash, role, created_at) VALUES (?,?,?,'owner',?)", name, email.toLowerCase(), hashPassword(password), now());
    console.log(`[setup] administrador ${email} criado (owner)`);
  } else console.warn('[setup] nenhum administrador. Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env ou rode: npm run create-admin');
}
if (!getSettings().greenn_webhook_token) setSettings({ greenn_webhook_token: randomToken(24) });

const router = new Router();
registerAppRoutes(router);
registerAdminRoutes(router);

router.get('/health', () => ({ ok: true, time: now() }));

router.post('/api/webhooks/greenn/:token', async (req) => {
  rateLimit(`wh:${req.ip}`, 600, 60e3);
  const expected = getSettings().greenn_webhook_token;
  const got = req.params.token;
  const ok = expected && got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  if (!ok) throw new HttpError(401, 'Token inválido');
  const out = await handleWebhook(req.body || {}, req.ip);
  return { received: true, id: out?.id, outcome: out?.outcome };
});

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  const url = new URL(req.url, 'http://x');
  req.ip = clientIp(req);
  req.query = Object.fromEntries(url.searchParams);
  const pathname = url.pathname;

  try {
    if (pathname.startsWith('/api/') || pathname === '/health') {
      const m = router.match(req.method, pathname);
      if (!m) return send(res, 404, { error: 'Rota não encontrada' });
      if (m.notAllowed) return send(res, 405, { error: 'Método não permitido' });
      const isWebhook = pathname.startsWith('/api/webhooks/');
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        // CSRF: chamadas do navegador precisam vir da mesma origem
        if (!isWebhook) {
          const origin = req.headers.origin;
          const host = req.headers['x-forwarded-host'] || req.headers.host;
          if (origin && new URL(origin).host !== host) throw new HttpError(403, 'Origem não permitida');
        }
        req.body = parseBody(await readBody(req), req.headers['content-type']);
      } else req.body = {};
      req.params = m.params;
      let out;
      for (const h of m.route.handlers) out = await h(req, res);
      if (!res.headersSent) send(res, 200, out ?? { ok: true });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método não permitido');
    if (pathname.startsWith('/shared/') && serveStatic(req, res, PUB, pathname)) return;
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      if (serveStatic(req, res, PUB, pathname, { spaIndex: path.join(PUB, 'admin', 'index.html') })) return;
    }
    if (serveStatic(req, res, path.join(PUB, 'app'), pathname, { spaIndex: path.join(PUB, 'app', 'index.html') })) return;
    send(res, 404, 'Não encontrado');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error(`[erro] ${req.method} ${pathname}`, e);
    send(res, status, { error: status >= 500 ? 'Erro interno. Tente novamente em instantes.' : e.message, ...(e.extra || {}) });
  } finally {
    if (!config.isProd && pathname.startsWith('/api/')) console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.listen(config.port, config.host, () => console.log(`[ok] ${getSettings().brand_name} em ${config.appUrl} (porta ${config.port})`));

// ---------- tarefas agendadas ----------
let running = false;
async function tick() {
  if (running) return; running = true;
  try {
    const n = await processReleases();
    if (n) console.log(`[agenda] ${n} liberação(ões) notificada(s)`);
    await flushOutbox();
    await dailyBackupIfDue();
    cleanupSessions();
  } catch (e) { console.error('[agenda]', e); }
  finally { running = false; }
}
setTimeout(tick, 5000).unref();
setInterval(tick, Math.min(config.schedulerMinutes, 30) * 60e3).unref();

function shutdown(sig) {
  console.log(`[${sig}] encerrando…`);
  server.close(() => { try { db.raw.close(); } catch {} process.exit(0); });
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
