import { db, now, getSettings } from './db.js';
import { config } from './config.js';
import { issueUserToken } from './auth.js';
import { sendEmail, accessEmail, releaseEmail } from './mailer.js';
import { emit } from './events.js';
import { compute } from '../public/shared/calc.js';

export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
export const jparse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

export function upsertUser({ email, name, phone, document, greennClientId }) {
  email = normEmail(email);
  const t = now();
  const ex = db.get('SELECT * FROM users WHERE email = ?', email);
  if (ex) {
    db.run(`UPDATE users SET name = COALESCE(NULLIF(?, ''), name), phone = COALESCE(NULLIF(?, ''), phone), document = COALESCE(NULLIF(?, ''), document),
      greenn_client_id = COALESCE(NULLIF(?, ''), greenn_client_id), updated_at = ? WHERE id = ?`, name || '', phone || '', document || '', greennClientId ? String(greennClientId) : '', t, ex.id);
    return { user: db.get('SELECT * FROM users WHERE id = ?', ex.id), created: false };
  }
  const r = db.run('INSERT INTO users (name, email, phone, document, greenn_client_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
    name || '', email, phone || null, document || null, greennClientId ? String(greennClientId) : null, t, t);
  const user = db.get('SELECT * FROM users WHERE id = ?', Number(r.lastInsertRowid));
  emit('user.created', publicUser(user));
  return { user, created: true };
}

export const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, phone: u.phone });

export function grantAccess(userId, productId, { source = 'greenn', saleRef = null } = {}) {
  const t = now();
  const p = db.get('SELECT * FROM products WHERE id = ?', productId);
  const expires = p?.access_days ? new Date(Date.now() + p.access_days * 86400e3).toISOString() : null;
  const ex = db.get('SELECT * FROM enrollments WHERE user_id = ? AND product_id = ?', userId, productId);
  if (ex) {
    if (ex.status === 'active') return { enrollment: ex, activated: false };
    db.run("UPDATE enrollments SET status = 'active', source = ?, sale_ref = COALESCE(?, sale_ref), revoked_at = NULL, expires_at = ?, updated_at = ? WHERE id = ?", source, saleRef, expires, t, ex.id);
  } else {
    db.run("INSERT INTO enrollments (user_id, product_id, status, source, sale_ref, started_at, expires_at, created_at, updated_at) VALUES (?,?,'active',?,?,?,?,?,?)",
      userId, productId, source, saleRef, t, expires, t, t);
  }
  const enrollment = db.get('SELECT * FROM enrollments WHERE user_id = ? AND product_id = ?', userId, productId);
  const user = db.get('SELECT * FROM users WHERE id = ?', userId);
  emit('enrollment.activated', { user: publicUser(user), product: { id: p.id, slug: p.slug, name: p.name }, source });
  return { enrollment, activated: true };
}

export function revokeAccess(userId, productId, status = 'refunded') {
  const ex = db.get('SELECT * FROM enrollments WHERE user_id = ? AND product_id = ?', userId, productId);
  if (!ex || ex.status === status) return false;
  db.run('UPDATE enrollments SET status = ?, revoked_at = ?, updated_at = ? WHERE id = ?', status, now(), now(), ex.id);
  const p = db.get('SELECT id, slug, name FROM products WHERE id = ?', productId);
  emit('enrollment.revoked', { user: publicUser(db.get('SELECT * FROM users WHERE id = ?', userId)), product: p, status });
  return true;
}

export async function sendAccessEmail(user, { isNew = true } = {}) {
  const token = issueUserToken(user.id, 'access', 72);
  const link = `${config.appUrl}/acesso?t=${token}`;
  const { subject, html } = accessEmail({ name: user.name, link, isNew });
  const r = await sendEmail({ to: user.email, subject, html, userId: user.id, kind: 'access', ref: String(Date.now()) });
  return { ...r, link };
}

// ---------- liberação dos dias ----------
export function lessonStates(userId, product, enrollment, lessons) {
  const prog = new Map(db.all('SELECT * FROM progress WHERE user_id = ?', userId).map((p) => [p.lesson_id, p]));
  const start = Date.parse(enrollment.started_at);
  const delay = (product.release_delay_hours ?? 24) * 3600e3;
  const t = Date.now();
  let prev = null;
  return lessons.map((l, i) => {
    const p = prog.get(l.id) || {};
    let availableAt = start;
    if (i > 0) {
      const prevDone = prev.completed_at ? Date.parse(prev.completed_at) : null;
      if (product.release_mode === 'after_complete') availableAt = prevDone ? prevDone + delay : null;
      else if (product.release_mode === 'sequential') availableAt = prevDone ?? null;
      else if (product.release_mode === 'drip') availableAt = startOfLocalDay(start) + (l.release_offset || 0) * 86400e3 + releaseHourMs();
      else availableAt = start;
      if (product.release_mode === 'drip' && i > 0 && availableAt < start) availableAt = start;
    }
    const available = availableAt !== null && availableAt <= t;
    prev = { completed_at: p.completed_at };
    return { lessonId: l.id, number: l.number, available, availableAt: availableAt ? new Date(availableAt).toISOString() : null, watched: !!p.watched_at, practiceWatched: !!p.practice_watched_at, completed: !!p.completed_at, completedAt: p.completed_at || null };
  });
}
const tzMs = () => config.tzOffsetMinutes * 60e3;
function startOfLocalDay(ms) { const local = ms + tzMs(); return local - (local % 86400e3) - tzMs(); }
function releaseHourMs() { return Number(getSettings().release_hour || 0) * 3600e3; }

// ---------- resumo por aluno (alimenta painel, leads e CSV) ----------
export function rulesFromSettings(s = getSettings()) {
  return { reserveMonths: Number(s.phase_reserve_months || 6), phase3Patrimony: Number(s.phase3_patrimony || 100000), phase3PatrimonyForeign: Number(s.phase3_patrimony_foreign || 20000), tithePercent: Number(s.tithe_percent || 10) };
}
export function loadAnswers(userId, productId) {
  const out = {};
  for (const r of db.all('SELECT day, data FROM answers WHERE user_id = ? AND product_id = ?', userId, productId)) out[r.day] = jparse(r.data, {});
  return out;
}
export function refreshSummary(userId, productId) {
  const ans = loadAnswers(userId, productId);
  const c = compute(ans, rulesFromSettings());
  const d4 = ans[4] || {}, d7 = ans[7] || {};
  const cp = d4.checkpoint || {};
  const done = db.get('SELECT COUNT(*) c FROM progress pr JOIN lessons l ON l.id = pr.lesson_id WHERE pr.user_id = ? AND l.product_id = ? AND pr.completed_at IS NOT NULL', userId, productId).c;
  const vals = [done, c.fase, c.renda, c.sobraReal, c.dividaTotal, c.dividasAtraso, c.guardado, c.patrimonio, c.direcionar, c.pazD1, c.pazD7, c.mordomiaD4, c.mordomiaD7,
    cp.imovel || null, cp.mora || null, cp.pais || null, cp.estadoCivil || null, cp.filhos === '' || cp.filhos == null ? null : Number(cp.filhos),
    d7.imovelSonho || null, d7.aulaAoVivo || null, d7.whatsapp || null, d7.autoriza || null, d7.recado ? 1 : 0, c.leadScore,
    JSON.stringify({ moeda: c.moeda, sobraEstimada: c.sobraEstimada, custosFixos: c.custosFixos, variaveis: c.variaveis, emocionalPct: c.emocionalPct, dizimo: c.dizimo, primicia: c.primicia, sobraCasa: c.sobraCasa, sonhoPrincipal: c.sonhoPrincipal, sonhoValor: c.sonhoValor, armasFrequentes: c.armasFrequentes, frutos: c.frutos }), now()];
  db.run(`INSERT INTO summaries (user_id, product_id, days_completed, fase, renda, sobra_real, divida_total, dividas_atraso, guardado, patrimonio, direcionar, paz_d1, paz_d7, mordomia_d4, mordomia_d7,
      imovel_proprio, mora, pais, estado_civil, filhos, sonho_imovel, live_optin, whatsapp, share_consent, has_message, lead_score, data, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id, product_id) DO UPDATE SET days_completed=excluded.days_completed, fase=excluded.fase, renda=excluded.renda, sobra_real=excluded.sobra_real,
      divida_total=excluded.divida_total, dividas_atraso=excluded.dividas_atraso, guardado=excluded.guardado, patrimonio=excluded.patrimonio, direcionar=excluded.direcionar,
      paz_d1=excluded.paz_d1, paz_d7=excluded.paz_d7, mordomia_d4=excluded.mordomia_d4, mordomia_d7=excluded.mordomia_d7, imovel_proprio=excluded.imovel_proprio,
      mora=excluded.mora, pais=excluded.pais, estado_civil=excluded.estado_civil, filhos=excluded.filhos, sonho_imovel=excluded.sonho_imovel, live_optin=excluded.live_optin,
      whatsapp=excluded.whatsapp, share_consent=excluded.share_consent, has_message=excluded.has_message, lead_score=excluded.lead_score, data=excluded.data, updated_at=excluded.updated_at`,
    userId, productId, ...vals);
  return c;
}

// ---------- aula ao vivo (data fixa semanal) ----------
export function nextLive(s = getSettings()) {
  if (s.live_enabled !== 'true') return null;
  const wd = Number(s.live_weekday); const [hh, mm] = String(s.live_time || '20:00').split(':').map(Number);
  const off = tzMs();
  const local = new Date(Date.now() + off);
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh, mm));
  let add = (wd - d.getUTCDay() + 7) % 7;
  if (add === 0 && d.getTime() <= local.getTime() - 2 * 3600e3) add = 7; // ainda mostra até 2h depois do início
  const when = new Date(d.getTime() + add * 86400e3 - off);
  return { title: s.live_title, description: s.live_description, url: s.live_url, startsAt: when.toISOString() };
}

// ---------- notificações agendadas: e-mail "Dia X liberado" + evento p/ WhatsApp ----------
export async function processReleases() {
  const s = getSettings();
  const rows = db.all(`SELECT e.*, u.name, u.email, u.phone, u.status ustatus FROM enrollments e JOIN users u ON u.id = e.user_id
    JOIN products p ON p.id = e.product_id WHERE e.status = 'active' AND p.kind = 'challenge' AND p.active = 1 AND u.status = 'active'`);
  let sent = 0;
  for (const e of rows) {
    const product = db.get('SELECT * FROM products WHERE id = ?', e.product_id);
    const lessons = db.all('SELECT * FROM lessons WHERE product_id = ? AND published = 1 ORDER BY number', e.product_id);
    const states = lessonStates(e.user_id, product, e, lessons);
    for (const st of states) {
      if (!st.available || st.number === 1) continue; // Dia 1 vai no e-mail de boas-vindas
      const ref = `${e.product_id}:${st.number}`;
      if (db.get("SELECT 1 FROM notifications WHERE user_id = ? AND kind = 'release' AND ref = ? AND channel = 'event'", e.user_id, ref)) continue;
      const lesson = lessons.find((l) => l.id === st.lessonId);
      db.run("INSERT OR IGNORE INTO notifications (user_id, kind, ref, channel, status, created_at) VALUES (?,?,?,?,?,?)", e.user_id, 'release', ref, 'event', 'sent', now());
      const first = (e.name || '').split(' ')[0];
      const link = `${config.appUrl}/dia/${st.number}`;
      emit('day.released', { user: { id: e.user_id, name: e.name, email: e.email, phone: e.phone }, day: st.number, title: lesson.title, link,
        whatsapp_message: (lesson.release_message || '').replace(/\[nome\]/gi, first).replace(/\[link\]/gi, link) });
      if (s.release_emails === 'true') {
        const { subject, html } = releaseEmail({ name: e.name, lesson });
        await sendEmail({ to: e.email, subject, html, userId: e.user_id, kind: 'release', ref });
      }
      sent++;
    }
  }
  return sent;
}

export function audit(req, action, target, meta) {
  db.run('INSERT INTO audit_log (admin_id, action, target, meta, ip, created_at) VALUES (?,?,?,?,?,?)', req.admin?.id ?? null, action, target ? String(target) : null, meta ? JSON.stringify(meta) : null, req.ip, now());
}
