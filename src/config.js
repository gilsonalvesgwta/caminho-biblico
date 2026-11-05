import fs from 'node:fs';
import path from 'node:path';

// Carrega .env simples (KEY=VALUE) sem dependências
const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const env = process.env;
export const config = {
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  dataDir: path.resolve(env.DATA_DIR || './data'),
  appUrl: (env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : (env.APP_URL || '').startsWith('https'),
  sessionDays: Number(env.SESSION_DAYS || 60),
  adminSessionHours: Number(env.ADMIN_SESSION_HOURS || 12),
  trustProxy: env.TRUST_PROXY !== 'false',
  bootstrapAdmin: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, name: env.ADMIN_NAME || 'Administrador' },
  // Brasil sem horário de verão desde 2019: UTC-3 fixo
  tzOffsetMinutes: Number(env.TZ_OFFSET_MINUTES || -180),
  schedulerMinutes: Number(env.SCHEDULER_MINUTES || 10),
  isProd: env.NODE_ENV === 'production',
};
fs.mkdirSync(config.dataDir, { recursive: true });
