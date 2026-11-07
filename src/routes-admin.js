import { db, now, getSettings, setSettings } from './db.js';
import { fail, rateLimit } from './http.js';
import { config } from './config.js';
import { createSession, destroySession, requireAdmin, verifyPassword, hashPassword, validatePassword, randomToken } from './auth.js';
import { upsertUser, grantAccess, revokeAccess, sendAccessEmail, normEmail, isEmail, jparse, lessonStates, loadAnswers, refreshSummary, nextLive, audit, rulesFromSettings } from './services.js';
import { reprocessWebhook, handleWebhook } from './greenn.js';
import { sendEmail, emailLayout } from './mailer.js';
import { flushOutbox } from './events.js';
import { compute } from '../public/shared/calc.js';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { makeBackup, listBackups, backupDir } from './backup.js';

const page = (q) => { const p = Math.max(1, Number(q.page || 1)); const size = Math.min(200, Math.max(10, Number(q.size || 25))); return { limit: size, offset: (p - 1) * size, page: p, size }; };
const sinceDays = (d) => new Date(Date.now() - d * 86400e3).toISOString();
const like = (s) => `%${String(s || '').trim()}%`;

export function registerAdminRoutes(r) {
  // ---------- sessão ----------
  r.post('/api/admin/login', (req, res) => {
    rateLimit(`alogin:${req.ip}`, 10, 15 * 60e3);
    const a = db.get('SELECT * FROM admins WHERE email = ?', normEmail(req.body.email));
    if (!a || !a.active || !verifyPassword(req.body.password || '', a.password_hash)) fail(400, 'E-mail ou senha incorretos.');
    createSession(res, 'admin', a.id, req);
    db.run('UPDATE admins SET last_login_at = ? WHERE id = ?', now(), a.id);
    req.admin = a; audit(req, 'login');
    return { ok: true };
  });
  r.post('/api/admin/logout', (req, res) => { destroySession(req, res, 'admin'); return { ok: true }; });
  r.get('/api/admin/me', (req) => {
    const a = requireAdmin(req);
    const s = getSettings();
    return { admin: a, brand: s.brand_name, webhookConfigured: !!s.greenn_webhook_token, appUrl: config.appUrl };
  });
  r.post('/api/admin/me/password', (req) => {
    const a = requireAdmin(req);
    const full = db.get('SELECT * FROM admins WHERE id = ?', a.id);
    if (!verifyPassword(req.body.current || '', full.password_hash)) fail(400, 'Senha atual incorreta.');
    validatePassword(req.body.password);
    db.run('UPDATE admins SET password_hash = ? WHERE id = ?', hashPassword(req.body.password), a.id);
    audit(req, 'password.change');
    return { ok: true };
  });

  // ---------- dashboard ----------
  r.get('/api/admin/dashboard', (req) => {
    requireAdmin(req);
    const days = Math.min(365, Math.max(1, Number(req.query.days || 30)));
    const since = sinceDays(days);
    const main = db.get("SELECT * FROM products WHERE kind = 'challenge' ORDER BY position LIMIT 1");
    const paid = db.get("SELECT COUNT(*) c, COALESCE(SUM(amount),0) v FROM sales WHERE status = 'paid' AND COALESCE(paid_at, created_at) >= ?", since);
    const refunds = db.get("SELECT COUNT(*) c, COALESCE(SUM(amount),0) v FROM sales WHERE status IN ('refunded','chargedback') AND updated_at >= ?", since);
    const pending = db.get("SELECT COUNT(*) c FROM sales WHERE status = 'waiting_payment' AND created_at >= ?", since).c;
    const series = db.all(`SELECT substr(datetime(COALESCE(paid_at, created_at), '-3 hours'), 1, 10) d, COUNT(*) c, SUM(amount) v FROM sales
      WHERE status = 'paid' AND COALESCE(paid_at, created_at) >= ? GROUP BY d ORDER BY d`, since);
    const byProduct = db.all(`SELECT COALESCE(product_name, provider_product_id) name, COUNT(*) c, SUM(amount) v FROM sales WHERE status = 'paid' AND COALESCE(paid_at, created_at) >= ? GROUP BY provider_product_id ORDER BY v DESC LIMIT 8`, since);
    const students = db.get("SELECT COUNT(DISTINCT user_id) c FROM enrollments WHERE status = 'active'").c;
    const newStudents = db.get('SELECT COUNT(*) c FROM users WHERE created_at >= ?', since).c;
    const active7 = db.get('SELECT COUNT(*) c FROM users WHERE last_seen_at >= ?', sinceDays(7)).c;
    let funnel = [], paz = null, live = 0, hot = 0, phases = [];
    if (main) {
      const enrolled = db.get("SELECT COUNT(*) c FROM enrollments WHERE product_id = ? AND status = 'active'", main.id).c;
      const lessons = db.all('SELECT id, number, title FROM lessons WHERE product_id = ? ORDER BY number', main.id);
      funnel = [{ label: 'Inscritos', v: enrolled }, ...lessons.map((l) => ({ label: `Dia ${l.number}`, title: l.title, v: db.get('SELECT COUNT(*) c FROM progress WHERE lesson_id = ? AND completed_at IS NOT NULL', l.id).c }))];
      paz = db.get('SELECT AVG(paz_d1) d1, AVG(paz_d7) d7, COUNT(*) n FROM summaries WHERE product_id = ? AND paz_d1 IS NOT NULL AND paz_d7 IS NOT NULL', main.id);
      live = db.get("SELECT COUNT(*) c FROM summaries WHERE product_id = ? AND live_optin = 'Sim'", main.id).c;
      hot = db.get('SELECT COUNT(*) c FROM summaries WHERE product_id = ? AND lead_score >= 60', main.id).c;
      phases = db.all('SELECT fase, COUNT(*) c FROM summaries WHERE product_id = ? AND fase IS NOT NULL GROUP BY fase ORDER BY fase', main.id);
    }
    const abandoned = db.get('SELECT COUNT(*) c FROM leads WHERE created_at >= ? AND converted = 0', since).c;
    const whIssues = db.get("SELECT COUNT(*) c FROM webhook_events WHERE outcome IN ('error','unmapped') AND received_at >= ?", sinceDays(7)).c;
    const lastWebhook = db.get('SELECT received_at, outcome FROM webhook_events ORDER BY id DESC LIMIT 1');
    const recentSales = db.all(`SELECT s.*, COALESCE(u.name, s.client_name) name FROM sales s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.updated_at DESC LIMIT 8`);
    return {
      days, revenue: paid.v, sales: paid.c, ticket: paid.c ? paid.v / paid.c : 0, refunds: refunds.c, refundValue: refunds.v,
      refundRate: paid.c ? refunds.c / paid.c : 0, pending, series, byProduct, students, newStudents, active7, funnel, paz, live, hot, phases,
      abandoned, whIssues, lastWebhook, recentSales, nextLive: nextLive(),
    };
  });

  // ---------- alunos ----------
  r.get('/api/admin/students', (req) => {
    requireAdmin(req);
    const q = req.query; const pg = page(q);
    const where = ['1=1']; const args = [];
    if (q.q) { where.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.document LIKE ?)'); args.push(like(q.q), like(q.q), like(q.q), like(q.q)); }
    if (q.status === 'blocked') where.push("u.status = 'blocked'");
    if (q.access === 'active') where.push("EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id AND e.status = 'active')");
    if (q.access === 'revoked') where.push("NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id AND e.status = 'active')");
    if (q.nopass === '1') where.push('u.password_hash IS NULL');
    const w = where.join(' AND ');
    const total = db.get(`SELECT COUNT(*) c FROM users u WHERE ${w}`, ...args).c;
    const rows = db.all(`SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at, u.last_seen_at, u.password_hash IS NOT NULL has_password,
      (SELECT GROUP_CONCAT(p.name, ' · ') FROM enrollments e JOIN products p ON p.id = e.product_id WHERE e.user_id = u.id AND e.status = 'active') products,
      (SELECT MAX(days_completed) FROM summaries s WHERE s.user_id = u.id) days_completed,
      (SELECT MAX(fase) FROM summaries s WHERE s.user_id = u.id) fase
      FROM users u WHERE ${w} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`, ...args, pg.limit, pg.offset);
    return { total, rows, ...pg };
  });

  r.get('/api/admin/students/:id', (req) => {
    requireAdmin(req);
    const u = db.get('SELECT * FROM users WHERE id = ?', Number(req.params.id));
    if (!u) fail(404, 'Aluno não encontrado.');
    const enrollments = db.all('SELECT e.*, p.name pname, p.slug, p.kind FROM enrollments e JOIN products p ON p.id = e.product_id WHERE e.user_id = ? ORDER BY p.position', u.id);
    const journeys = enrollments.filter((e) => e.kind === 'challenge').map((e) => {
      const product = db.get('SELECT * FROM products WHERE id = ?', e.product_id);
      const lessons = db.all('SELECT * FROM lessons WHERE product_id = ? ORDER BY number', product.id);
      const answers = loadAnswers(u.id, product.id);
      return { product: { id: product.id, name: product.name, slug: product.slug }, states: lessonStates(u.id, product, e, lessons).map((s, i) => ({ ...s, title: lessons[i].title })), answers, computed: compute(answers, rulesFromSettings()) };
    });
    const sales = db.all('SELECT * FROM sales WHERE user_id = ? OR email = ? ORDER BY created_at DESC', u.id, u.email);
    const notifications = db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', u.id);
    const { password_hash, ...safe } = u;
    return { user: { ...safe, has_password: !!password_hash }, enrollments, journeys, sales, notifications, products: db.all('SELECT id, name, kind FROM products ORDER BY position') };
  });

  r.post('/api/admin/students', async (req) => {
    requireAdmin(req, 'support');
    const email = normEmail(req.body.email);
    if (!isEmail(email)) fail(400, 'E-mail inválido.');
    const { user, created } = upsertUser({ email, name: String(req.body.name || '').trim(), phone: req.body.phone });
    for (const pid of req.body.product_ids || []) grantAccess(user.id, Number(pid), { source: 'manual' });
    let link = null;
    if (req.body.send_email !== false) link = (await sendAccessEmail(user, { isNew: true })).link;
    audit(req, 'student.create', user.id, { email, products: req.body.product_ids });
    return { ok: true, id: user.id, created, link };
  });

  r.put('/api/admin/students/:id', (req) => {
    requireAdmin(req, 'support');
    const id = Number(req.params.id);
    const u = db.get('SELECT * FROM users WHERE id = ?', id);
    if (!u) fail(404, 'Aluno não encontrado.');
    const b = req.body;
    const email = b.email !== undefined ? normEmail(b.email) : u.email;
    if (!isEmail(email)) fail(400, 'E-mail inválido.');
    if (email !== u.email && db.get('SELECT 1 FROM users WHERE email = ? AND id <> ?', email, id)) fail(400, 'Já existe outro aluno com este e-mail.');
    const status = ['active', 'blocked'].includes(b.status) ? b.status : u.status;
    db.run('UPDATE users SET name = ?, email = ?, phone = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?',
      b.name ?? u.name, email, b.phone ?? u.phone, status, b.notes ?? u.notes, now(), id);
    if (status === 'blocked') db.run("DELETE FROM sessions WHERE kind = 'user' AND subject_id = ?", id);
    audit(req, 'student.update', id, { email, status });
    return { ok: true };
  });

  r.post('/api/admin/students/:id/grant', (req) => {
    requireAdmin(req, 'support');
    grantAccess(Number(req.params.id), Number(req.body.product_id), { source: 'manual' });
    audit(req, 'access.grant', req.params.id, { product: req.body.product_id });
    return { ok: true };
  });
  r.post('/api/admin/students/:id/revoke', (req) => {
    requireAdmin(req, 'support');
    revokeAccess(Number(req.params.id), Number(req.body.product_id), 'canceled');
    audit(req, 'access.revoke', req.params.id, { product: req.body.product_id });
    return { ok: true };
  });
  r.post('/api/admin/students/:id/send-access', async (req) => {
    requireAdmin(req, 'support');
    const u = db.get('SELECT * FROM users WHERE id = ?', Number(req.params.id));
    if (!u) fail(404, 'Aluno não encontrado.');
    const out = await sendAccessEmail(u, { isNew: !u.password_hash });
    audit(req, 'access.email', u.id);
    return { ok: true, link: out.link, email: out.status, error: out.error };
  });
  r.post('/api/admin/students/:id/unlock-next', (req) => {
    requireAdmin(req, 'support');
    const id = Number(req.params.id);
    const product = db.get('SELECT * FROM products WHERE id = ?', Number(req.body.product_id));
    const e = product && db.get('SELECT * FROM enrollments WHERE user_id = ? AND product_id = ?', id, product.id);
    if (!e) fail(404, 'Matrícula não encontrada.');
    const lessons = db.all('SELECT * FROM lessons WHERE product_id = ? AND published = 1 ORDER BY number', product.id);
    const st = lessonStates(id, product, e, lessons);
    const i = st.findIndex((s) => !s.available);
    if (i < 0) fail(400, 'Todos os dias já estão liberados.');
    const prev = st[i - 1];
    if (!prev?.completed) fail(400, `O aluno ainda não concluiu o Dia ${prev?.number}. A liberação depende da conclusão.`);
    const back = new Date(Date.now() - (product.release_delay_hours || 0) * 3600e3 - 60e3).toISOString();
    db.run('UPDATE progress SET completed_at = ? WHERE user_id = ? AND lesson_id = ?', back, id, prev.lessonId);
    audit(req, 'lesson.unlock', id, { day: st[i].number });
    return { ok: true, day: st[i].number };
  });
  r.delete('/api/admin/students/:id', (req) => {
    requireAdmin(req, 'owner');
    const id = Number(req.params.id);
    const u = db.get('SELECT email FROM users WHERE id = ?', id);
    if (!u) fail(404, 'Aluno não encontrado.');
    db.run('DELETE FROM users WHERE id = ?', id);
    audit(req, 'student.delete', id, { email: u.email });
    return { ok: true };
  });

  // ---------- vendas ----------
  r.get('/api/admin/sales', (req) => {
    requireAdmin(req);
    const q = req.query; const pg = page(q);
    const where = ['1=1']; const args = [];
    if (q.status) { where.push('s.status = ?'); args.push(q.status); }
    if (q.q) { where.push('(s.email LIKE ? OR s.sale_id LIKE ? OR u.name LIKE ? OR s.client_name LIKE ? OR s.client_phone LIKE ? OR s.product_name LIKE ?)'); args.push(like(q.q), like(q.q), like(q.q), like(q.q), like(q.q), like(q.q)); }
    if (q.from) { where.push('s.created_at >= ?'); args.push(q.from); }
    const w = where.join(' AND ');
    const total = db.get(`SELECT COUNT(*) c, COALESCE(SUM(CASE WHEN s.status='paid' THEN s.amount END),0) v FROM sales s LEFT JOIN users u ON u.id = s.user_id WHERE ${w}`, ...args);
    const rows = db.all(`SELECT s.*, COALESCE(u.name, s.client_name) name, COALESCE(u.phone, s.client_phone) phone FROM sales s LEFT JOIN users u ON u.id = s.user_id WHERE ${w} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`, ...args, pg.limit, pg.offset);
    return { total: total.c, paidValue: total.v, rows, ...pg };
  });

  r.get('/api/admin/abandoned', (req) => {
    requireAdmin(req);
    const pg = page(req.query);
    return { total: db.get('SELECT COUNT(*) c FROM leads').c, rows: db.all('SELECT * FROM leads ORDER BY id DESC LIMIT ? OFFSET ?', pg.limit, pg.offset), ...pg };
  });

  // ---------- webhooks ----------
  r.get('/api/admin/webhooks', (req) => {
    requireAdmin(req);
    const q = req.query; const pg = page(q);
    const where = ['1=1']; const args = [];
    if (q.outcome) { where.push('outcome = ?'); args.push(q.outcome); }
    if (q.q) { where.push('(email LIKE ? OR payload LIKE ?)'); args.push(like(q.q), like(q.q)); }
    const w = where.join(' AND ');
    return { total: db.get(`SELECT COUNT(*) c FROM webhook_events WHERE ${w}`, ...args).c,
      rows: db.all(`SELECT id, provider, event, status_hint, email, outcome, message, attempts, received_at, processed_at FROM webhook_events WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, ...args, pg.limit, pg.offset), ...pg };
  });
  r.get('/api/admin/webhooks/:id', (req) => {
    requireAdmin(req);
    const ev = db.get('SELECT * FROM webhook_events WHERE id = ?', Number(req.params.id));
    if (!ev) fail(404, 'Evento não encontrado.');
    return { ...ev, payload: jparse(ev.payload, {}) };
  });
  r.post('/api/admin/webhooks/:id/reprocess', async (req) => {
    requireAdmin(req, 'support');
    const out = await reprocessWebhook(Number(req.params.id));
    audit(req, 'webhook.reprocess', req.params.id, out);
    return out;
  });
  r.post('/api/admin/webhooks/simulate', async (req) => {
    requireAdmin(req, 'admin');
    const b = req.body;
    const email = normEmail(b.email);
    if (!isEmail(email)) fail(400, 'Informe um e-mail válido para o teste.');
    const payload = {
      type: 'sale', event: 'saleUpdated', oldStatus: 'waiting_payment', currentStatus: b.status || 'paid', _simulated: true,
      product: { id: Number(b.product_id) || String(b.product_id), name: b.product_name || 'Produto de teste', amount: Number(b.amount || 97) },
      sale: { id: 'TESTE-' + Date.now(), status: b.status || 'paid', amount: Number(b.amount || 97), method: 'CREDIT_CARD', installments: 1 },
      client: { name: b.name || 'Aluno Teste', email, cellphone: b.phone || '' }, saleMetas: [],
    };
    const out = await handleWebhook(payload, 'admin-simulation');
    audit(req, 'webhook.simulate', out.id, { email, status: payload.currentStatus });
    return out;
  });

  // ---------- leads qualificados (checkpoints) ----------
  const leadsQuery = (q) => {
    const where = ['1=1']; const args = [];
    if (q.product_id) { where.push('s.product_id = ?'); args.push(Number(q.product_id)); }
    if (q.live === '1') where.push("s.live_optin = 'Sim'");
    if (q.imovel === '1') where.push("s.sonho_imovel = 'Sim'");
    if (q.fase) { where.push('s.fase = ?'); args.push(Number(q.fase)); }
    if (q.min_score) { where.push('s.lead_score >= ?'); args.push(Number(q.min_score)); }
    if (q.min_days) { where.push('s.days_completed >= ?'); args.push(Number(q.min_days)); }
    if (q.mora) { where.push('s.mora = ?'); args.push(q.mora); }
    if (q.q) { where.push('(u.name LIKE ? OR u.email LIKE ? OR s.whatsapp LIKE ?)'); args.push(like(q.q), like(q.q), like(q.q)); }
    return { w: where.join(' AND '), args };
  };
  r.get('/api/admin/leads', (req) => {
    requireAdmin(req);
    const pg = page(req.query); const { w, args } = leadsQuery(req.query);
    const order = { score: 's.lead_score DESC', recent: 's.updated_at DESC', renda: 's.renda DESC' }[req.query.order] || 's.lead_score DESC, s.updated_at DESC';
    return { total: db.get(`SELECT COUNT(*) c FROM summaries s JOIN users u ON u.id = s.user_id WHERE ${w}`, ...args).c,
      rows: db.all(`SELECT s.*, u.name, u.email, u.phone FROM summaries s JOIN users u ON u.id = s.user_id WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, pg.limit, pg.offset).map((x) => ({ ...x, data: jparse(x.data, {}) })), ...pg };
  });
  r.get('/api/admin/leads.csv', (req, res) => {
    requireAdmin(req, 'support');
    const { w, args } = leadsQuery(req.query);
    const rows = db.all(`SELECT s.*, json_extract(s.data, '$.moeda') moeda, u.name, u.email, u.phone FROM summaries s JOIN users u ON u.id = s.user_id WHERE ${w} ORDER BY s.lead_score DESC`, ...args);
    const cols = [['name', 'Nome'], ['email', 'E-mail'], ['whatsapp', 'WhatsApp (D7)'], ['phone', 'Telefone (compra)'], ['lead_score', 'Score'], ['days_completed', 'Dias concluídos'], ['fase', 'Fase'], ['moeda', 'Moeda'], ['renda', 'Renda'], ['sobra_real', 'Sobra real'], ['divida_total', 'Dívida total'], ['dividas_atraso', 'Dívidas em atraso'], ['guardado', 'Guardado'], ['patrimonio', 'Patrimônio'], ['direcionar', 'Pode direcionar/mês'], ['imovel_proprio', 'Imóvel próprio'], ['sonho_imovel', 'Sonha com imóvel'], ['mora', 'Mora'], ['pais', 'País'], ['estado_civil', 'Estado civil'], ['filhos', 'Filhos'], ['paz_d1', 'Paz D1'], ['paz_d7', 'Paz D7'], ['live_optin', 'Quer aula ao vivo'], ['updated_at', 'Atualizado em']];
    const esc = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = '﻿' + [cols.map((c) => c[1]).join(';'), ...rows.map((r0) => cols.map(([k]) => esc(typeof r0[k] === 'number' ? String(r0[k]).replace('.', ',') : r0[k])).join(';'))].join('\n');
    audit(req, 'leads.export', null, { count: rows.length });
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"` });
    res.end(csv);
  });

  // ---------- depoimentos, recados e feedback por aula ----------
  r.get('/api/admin/voices', (req) => {
    requireAdmin(req);
    const kind = req.query.kind || 'testimonials';
    const pg = page(req.query);
    if (kind === 'feedback') {
      const day = Number(req.query.day || 0);
      const rows = db.all(`SELECT a.user_id, a.day, a.updated_at, json_extract(a.data, '$.feedback') text, u.name, u.email FROM answers a JOIN users u ON u.id = a.user_id
        WHERE COALESCE(json_extract(a.data, '$.feedback'), '') <> '' ${day ? 'AND a.day = ?' : ''} ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`, ...(day ? [day] : []), pg.limit, pg.offset);
      return { rows, ...pg };
    }
    const rows = db.all(`SELECT a.user_id, a.updated_at, u.name, u.email, json_extract(a.data, '$.mudou') mudou, json_extract(a.data, '$.mostrou') mostrou, json_extract(a.data, '$.deusFez') deusFez,
        json_extract(a.data, '$.recado') recado, json_extract(a.data, '$.autoriza') autoriza, s.paz_d1, s.paz_d7
      FROM answers a JOIN users u ON u.id = a.user_id LEFT JOIN summaries s ON s.user_id = a.user_id AND s.product_id = a.product_id
      WHERE a.day = 7 AND (COALESCE(json_extract(a.data, '$.mudou'),'') <> '' OR COALESCE(json_extract(a.data, '$.recado'),'') <> '' OR COALESCE(json_extract(a.data, '$.mostrou'),'') <> '')
      ${kind === 'messages' ? "AND COALESCE(json_extract(a.data, '$.recado'),'') <> ''" : ''}
      ${kind === 'testimonials' ? "AND json_extract(a.data, '$.autoriza') LIKE 'Sim%'" : ''}
      ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`, pg.limit, pg.offset);
    return { rows, ...pg };
  });

  // ---------- produtos e conteúdo ----------
  r.get('/api/admin/products', (req) => {
    requireAdmin(req);
    return { rows: db.all(`SELECT p.*, (SELECT COUNT(*) FROM lessons l WHERE l.product_id = p.id) lessons, (SELECT COUNT(*) FROM enrollments e WHERE e.product_id = p.id AND e.status = 'active') students FROM products p ORDER BY position, id`).map((p) => ({ ...p, materials: jparse(p.materials, []) })) };
  });
  const productFields = (b, cur = {}) => {
    const slug = String(b.slug ?? cur.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) fail(400, 'Informe um identificador (slug).');
    if (!String(b.name ?? cur.name ?? '').trim()) fail(400, 'Informe o nome.');
    return [slug, b.name ?? cur.name, b.kind ?? cur.kind ?? 'challenge', b.tagline ?? cur.tagline ?? '', b.description ?? cur.description ?? '',
      String(b.greenn_ids ?? cur.greenn_ids ?? '').split(/[\s,;]+/).filter(Boolean).join(','), b.release_mode ?? cur.release_mode ?? 'after_complete',
      Number(b.release_delay_hours ?? cur.release_delay_hours ?? 24), b.access_days === '' || b.access_days === null ? null : Number(b.access_days ?? cur.access_days) || null,
      JSON.stringify(b.materials ?? jparse(cur.materials, [])), Number(b.position ?? cur.position ?? 0), b.active === undefined ? (cur.active ?? 1) : (b.active ? 1 : 0)];
  };
  r.post('/api/admin/products', (req) => {
    requireAdmin(req, 'admin');
    const f = productFields(req.body);
    if (db.get('SELECT 1 FROM products WHERE slug = ?', f[0])) fail(400, 'Já existe um produto com este identificador.');
    const res0 = db.run(`INSERT INTO products (slug, name, kind, tagline, description, greenn_ids, release_mode, release_delay_hours, access_days, materials, position, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...f, now(), now());
    audit(req, 'product.create', res0.lastInsertRowid, { slug: f[0] });
    return { ok: true, id: Number(res0.lastInsertRowid) };
  });
  r.put('/api/admin/products/:id', (req) => {
    requireAdmin(req, 'admin');
    const cur = db.get('SELECT * FROM products WHERE id = ?', Number(req.params.id));
    if (!cur) fail(404, 'Produto não encontrado.');
    const f = productFields(req.body, cur);
    if (db.get('SELECT 1 FROM products WHERE slug = ? AND id <> ?', f[0], cur.id)) fail(400, 'Já existe um produto com este identificador.');
    db.run(`UPDATE products SET slug=?, name=?, kind=?, tagline=?, description=?, greenn_ids=?, release_mode=?, release_delay_hours=?, access_days=?, materials=?, position=?, active=?, updated_at=? WHERE id = ?`, ...f, now(), cur.id);
    audit(req, 'product.update', cur.id, { greenn_ids: f[5] });
    return { ok: true };
  });
  r.get('/api/admin/products/:id/lessons', (req) => {
    requireAdmin(req);
    return { rows: db.all('SELECT * FROM lessons WHERE product_id = ? ORDER BY number', Number(req.params.id)).map((l) => ({ ...l, key_phrases: jparse(l.key_phrases, []), verses: jparse(l.verses, []) })) };
  });
  const lessonFields = (b, cur = {}) => [b.number ?? cur.number, b.block ?? cur.block ?? '', b.title ?? cur.title, b.subtitle ?? cur.subtitle ?? '', b.objective ?? cur.objective ?? '',
    b.video_url ?? cur.video_url ?? '', b.video_duration ?? cur.video_duration ?? '', b.practice_video_url ?? cur.practice_video_url ?? '', b.practice_duration ?? cur.practice_duration ?? '',
    JSON.stringify(b.key_phrases ?? jparse(cur.key_phrases, [])), JSON.stringify(b.verses ?? jparse(cur.verses, [])), b.body ?? cur.body ?? '',
    b.activity_key === undefined ? (cur.activity_key ?? null) : (b.activity_key || null), Number(b.release_offset ?? cur.release_offset ?? 0),
    b.release_message ?? cur.release_message ?? '', b.tomorrow ?? cur.tomorrow ?? '', b.published === undefined ? (cur.published ?? 1) : (b.published ? 1 : 0)];
  r.post('/api/admin/products/:id/lessons', (req) => {
    requireAdmin(req, 'admin');
    const pid = Number(req.params.id);
    const nextN = (db.get('SELECT MAX(number) m FROM lessons WHERE product_id = ?', pid).m || 0) + 1;
    const f = lessonFields({ number: nextN, title: 'Nova aula', ...req.body });
    const res0 = db.run(`INSERT INTO lessons (product_id, number, block, title, subtitle, objective, video_url, video_duration, practice_video_url, practice_duration, key_phrases, verses, body, activity_key, release_offset, release_message, tomorrow, published, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, pid, ...f, now(), now());
    audit(req, 'lesson.create', res0.lastInsertRowid);
    return { ok: true, id: Number(res0.lastInsertRowid) };
  });
  r.put('/api/admin/lessons/:id', (req) => {
    requireAdmin(req, 'admin');
    const cur = db.get('SELECT * FROM lessons WHERE id = ?', Number(req.params.id));
    if (!cur) fail(404, 'Aula não encontrada.');
    const f = lessonFields(req.body, cur);
    if (db.get('SELECT 1 FROM lessons WHERE product_id = ? AND number = ? AND id <> ?', cur.product_id, f[0], cur.id)) fail(400, `Já existe uma aula com o número ${f[0]}.`);
    db.run(`UPDATE lessons SET number=?, block=?, title=?, subtitle=?, objective=?, video_url=?, video_duration=?, practice_video_url=?, practice_duration=?, key_phrases=?, verses=?, body=?, activity_key=?, release_offset=?, release_message=?, tomorrow=?, published=?, updated_at=? WHERE id = ?`, ...f, now(), cur.id);
    audit(req, 'lesson.update', cur.id, { title: f[2] });
    return { ok: true };
  });
  r.post('/api/admin/lessons/:id/cover', (req) => {
    requireAdmin(req, 'admin');
    const l = db.get('SELECT * FROM lessons WHERE id = ?', Number(req.params.id));
    if (!l) fail(404, 'Aula não encontrada.');
    const col = req.body.target === 'practice' ? 'practice_cover_url' : 'cover_url';
    const m = String(req.body.data || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) fail(400, 'Envie uma imagem JPG, PNG ou WebP.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 5 * 1024 * 1024) fail(413, 'Imagem muito grande. O máximo é 5 MB.');
    const kind = buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg' : buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'png' : buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP' ? 'webp' : null;
    if (!kind) fail(400, 'O arquivo não é uma imagem válida.');
    const dir = path.join(config.dataDir, 'uploads', 'covers');
    fs.mkdirSync(dir, { recursive: true });
    const name = `aula-${l.id}-${col === 'cover_url' ? 'v' : 'p'}-${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12)}.${kind}`;
    fs.writeFileSync(path.join(dir, name), buf);
    const old = l[col];
    db.run(`UPDATE lessons SET ${col} = ?, updated_at = ? WHERE id = ?`, `/media/covers/${name}`, now(), l.id);
    if (old && old.startsWith('/media/covers/') && old !== `/media/covers/${name}`) fs.rm(path.join(dir, path.basename(old)), { force: true }, () => {});
    audit(req, 'lesson.cover', l.id, { target: col });
    return { ok: true, url: `/media/covers/${name}` };
  });
  r.delete('/api/admin/lessons/:id/cover', (req) => {
    requireAdmin(req, 'admin');
    const l = db.get('SELECT * FROM lessons WHERE id = ?', Number(req.params.id));
    if (!l) fail(404, 'Aula não encontrada.');
    const col = req.query.target === 'practice' ? 'practice_cover_url' : 'cover_url';
    if (l[col]?.startsWith('/media/covers/')) fs.rm(path.join(config.dataDir, 'uploads', 'covers', path.basename(l[col])), { force: true }, () => {});
    db.run(`UPDATE lessons SET ${col} = NULL, updated_at = ? WHERE id = ?`, now(), l.id);
    audit(req, 'lesson.cover.remove', l.id, { target: col });
    return { ok: true };
  });
  r.delete('/api/admin/lessons/:id', (req) => {
    requireAdmin(req, 'owner');
    db.run('DELETE FROM lessons WHERE id = ?', Number(req.params.id));
    audit(req, 'lesson.delete', req.params.id);
    return { ok: true };
  });

  // ---------- configurações e integrações ----------
  r.get('/api/admin/settings', (req) => {
    requireAdmin(req, 'admin');
    const s = getSettings({ maskSecrets: true });
    const raw = getSettings();
    return { settings: s, webhookUrl: raw.greenn_webhook_token ? `${config.appUrl}/api/webhooks/greenn/${raw.greenn_webhook_token}` : null, appUrl: config.appUrl,
      outbox: db.get("SELECT SUM(status='pending') pending, SUM(status='failed') failed, SUM(status='sent') sent FROM outbox") };
  });
  r.put('/api/admin/settings', (req) => {
    requireAdmin(req, 'admin');
    setSettings(req.body || {});
    audit(req, 'settings.update', null, { keys: Object.keys(req.body || {}) });
    // recalcula resumos se regras de fase mudaram
    if (['phase_reserve_months', 'phase3_patrimony', 'phase3_patrimony_foreign', 'tithe_percent'].some((k) => k in (req.body || {}))) {
      for (const s of db.all('SELECT user_id, product_id FROM summaries')) refreshSummary(s.user_id, s.product_id);
    }
    return { ok: true };
  });
  r.post('/api/admin/settings/webhook-token', (req) => {
    requireAdmin(req, 'owner');
    const token = randomToken(24);
    setSettings({ greenn_webhook_token: token });
    audit(req, 'webhook.token.rotate');
    return { ok: true, webhookUrl: `${config.appUrl}/api/webhooks/greenn/${token}` };
  });
  r.post('/api/admin/settings/test-email', async (req) => {
    const a = requireAdmin(req, 'admin');
    const to = normEmail(req.body.to || a.email);
    const out = await sendEmail({ to, subject: 'Teste de e-mail da plataforma', html: emailLayout({ heading: 'Tudo certo por aqui ✅', paragraphs: ['Se você recebeu esta mensagem, o envio de e-mails da plataforma está funcionando.'] }) });
    return out;
  });
  r.post('/api/admin/outbox/retry', async (req) => {
    requireAdmin(req, 'admin');
    db.run("UPDATE outbox SET status = 'pending', next_attempt_at = ? WHERE status = 'failed'", now());
    await flushOutbox();
    return { ok: true };
  });
  r.get('/api/admin/outbox', (req) => {
    requireAdmin(req, 'admin');
    return { rows: db.all('SELECT id, event, status, attempts, last_error, created_at FROM outbox ORDER BY id DESC LIMIT 100') };
  });

  // ---------- backup ----------
  r.get('/api/admin/backups', (req) => {
    requireAdmin(req, 'admin');
    return { rows: listBackups(), lastAuto: db.get("SELECT value FROM settings WHERE key = '_last_backup_at'")?.value || null };
  });
  r.post('/api/admin/backups', async (req) => {
    requireAdmin(req, 'owner');
    const file = await makeBackup('manual');
    audit(req, 'backup.create', path.basename(file));
    return { ok: true, name: path.basename(file) };
  });
  r.get('/api/admin/backups/:name', (req, res) => {
    requireAdmin(req, 'owner');
    const name = path.basename(req.params.name);
    const file = path.join(backupDir(), name);
    if (!/^app-[\w-]+\.db$/.test(name) || !fs.existsSync(file)) fail(404, 'Cópia não encontrada.');
    audit(req, 'backup.download', name);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="caminho-biblico-${name}"`, 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });

  // ---------- equipe ----------
  r.get('/api/admin/team', (req) => { requireAdmin(req, 'admin'); return { rows: db.all('SELECT id, name, email, role, active, last_login_at, created_at FROM admins ORDER BY id') }; });
  r.post('/api/admin/team', (req) => {
    requireAdmin(req, 'owner');
    const email = normEmail(req.body.email);
    if (!isEmail(email)) fail(400, 'E-mail inválido.');
    if (db.get('SELECT 1 FROM admins WHERE email = ?', email)) fail(400, 'Este e-mail já faz parte da equipe.');
    validatePassword(req.body.password);
    const role = ['owner', 'admin', 'support', 'viewer'].includes(req.body.role) ? req.body.role : 'support';
    db.run('INSERT INTO admins (name, email, password_hash, role, created_at) VALUES (?,?,?,?,?)', String(req.body.name || email), email, hashPassword(req.body.password), role, now());
    audit(req, 'team.create', email, { role });
    return { ok: true };
  });
  r.put('/api/admin/team/:id', (req) => {
    const me = requireAdmin(req, 'owner');
    const id = Number(req.params.id);
    const cur = db.get('SELECT * FROM admins WHERE id = ?', id);
    if (!cur) fail(404, 'Membro não encontrado.');
    if (id === me.id && (req.body.active === false || (req.body.role && req.body.role !== 'owner'))) fail(400, 'Você não pode rebaixar ou desativar a si mesmo.');
    const role = ['owner', 'admin', 'support', 'viewer'].includes(req.body.role) ? req.body.role : cur.role;
    db.run('UPDATE admins SET name = ?, role = ?, active = ? WHERE id = ?', req.body.name ?? cur.name, role, req.body.active === undefined ? cur.active : (req.body.active ? 1 : 0), id);
    if (req.body.password) { validatePassword(req.body.password); db.run('UPDATE admins SET password_hash = ? WHERE id = ?', hashPassword(req.body.password), id); }
    if (req.body.active === false) db.run("DELETE FROM sessions WHERE kind = 'admin' AND subject_id = ?", id);
    audit(req, 'team.update', id, { role, active: req.body.active });
    return { ok: true };
  });
  r.get('/api/admin/audit', (req) => {
    requireAdmin(req, 'admin');
    const pg = page(req.query);
    return { rows: db.all('SELECT l.*, a.name admin_name FROM audit_log l LEFT JOIN admins a ON a.id = l.admin_id ORDER BY l.id DESC LIMIT ? OFFSET ?', pg.limit, pg.offset), ...pg };
  });
}
