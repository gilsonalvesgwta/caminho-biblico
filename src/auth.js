import crypto from 'node:crypto';
import { db, now } from './db.js';
import { config } from './config.js';
import { parseCookies, setCookie, fail } from './http.js';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pw), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export function verifyPassword(pw, stored) {
  if (!stored) return false;
  const [alg, n, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const key = Buffer.from(keyB64, 'base64');
  const test = crypto.scryptSync(String(pw), Buffer.from(saltB64, 'base64'), key.length, { N: Number(n), r: SCRYPT.r, p: SCRYPT.p });
  return crypto.timingSafeEqual(key, test);
}
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) fail(400, 'A senha precisa ter pelo menos 8 caracteres.');
  if (pw.length > 200) fail(400, 'Senha muito longa.');
}

const COOKIE = { user: 'pb_u', admin: 'pb_a' };

export function createSession(res, kind, subjectId, req) {
  const token = randomToken();
  const ms = kind === 'admin' ? config.adminSessionHours * 3600e3 : config.sessionDays * 86400e3;
  db.run('INSERT INTO sessions (token_hash, kind, subject_id, ip, ua, expires_at, created_at) VALUES (?,?,?,?,?,?,?)',
    sha256(token), kind, subjectId, req.ip, String(req.headers['user-agent'] || '').slice(0, 250), new Date(Date.now() + ms).toISOString(), now());
  setCookie(res, COOKIE[kind], token, { maxAge: ms / 1000 });
}

export function destroySession(req, res, kind) {
  const token = parseCookies(req.headers.cookie)[COOKIE[kind]];
  if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  setCookie(res, COOKIE[kind], '', { maxAge: 0 });
}

export function sessionSubject(req, kind) {
  const token = parseCookies(req.headers.cookie)[COOKIE[kind]];
  if (!token) return null;
  const s = db.get('SELECT * FROM sessions WHERE token_hash = ? AND kind = ?', sha256(token), kind);
  if (!s) return null;
  if (s.expires_at < now()) { db.run('DELETE FROM sessions WHERE token_hash = ?', s.token_hash); return null; }
  return s.subject_id;
}

export function requireUser(req) {
  const id = sessionSubject(req, 'user');
  if (!id) fail(401, 'Faça login para continuar.');
  const user = db.get('SELECT * FROM users WHERE id = ?', id);
  if (!user || user.status !== 'active') fail(401, 'Acesso indisponível. Fale com o suporte.');
  // marca presença no máximo a cada 5 min
  if (!user.last_seen_at || Date.now() - Date.parse(user.last_seen_at) > 300e3) db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', now(), id);
  req.user = user;
  return user;
}

const ROLE_RANK = { viewer: 1, support: 2, admin: 3, owner: 4 };
export function requireAdmin(req, minRole = 'viewer') {
  const id = sessionSubject(req, 'admin');
  if (!id) fail(401, 'Sessão expirada. Entre novamente.');
  const admin = db.get('SELECT id, name, email, role, active FROM admins WHERE id = ?', id);
  if (!admin || !admin.active) fail(401, 'Acesso desativado.');
  if (ROLE_RANK[admin.role] < ROLE_RANK[minRole]) fail(403, 'Você não tem permissão para esta ação.');
  req.admin = admin;
  return admin;
}

// Tokens de primeiro acesso / redefinição
export function issueUserToken(userId, purpose = 'access', hours = 72) {
  const token = randomToken(24);
  db.run('INSERT INTO tokens (token_hash, user_id, purpose, expires_at, created_at) VALUES (?,?,?,?,?)',
    sha256(token), userId, purpose, new Date(Date.now() + hours * 3600e3).toISOString(), now());
  return token;
}
export function consumeUserToken(token) {
  const row = db.get('SELECT * FROM tokens WHERE token_hash = ?', sha256(String(token || '')));
  if (!row || row.used_at || row.expires_at < now()) return null;
  return row;
}
export function markTokenUsed(row) { db.run('UPDATE tokens SET used_at = ? WHERE token_hash = ?', now(), row.token_hash); }

export function cleanupSessions() {
  db.run('DELETE FROM sessions WHERE expires_at < ?', now());
  db.run('DELETE FROM tokens WHERE expires_at < ?', new Date(Date.now() - 7 * 86400e3).toISOString());
}
