import { db, now, getSettings } from './db.js';
import { fail, rateLimit } from './http.js';
import { createSession, destroySession, requireUser, verifyPassword, hashPassword, validatePassword, consumeUserToken, markTokenUsed, issueUserToken } from './auth.js';
import { sendEmail, resetEmail, senderName } from './mailer.js';
import { lastProduct } from './whatsapp.js';
import { config } from './config.js';
import { normEmail, jparse, lessonStates, refreshSummary, nextLive, rulesFromSettings, loadAnswers, productPublic, audit } from './services.js';
import { syncUnlocks, claimUnlock } from './unlock.js';
import { emit } from './events.js';
import { lessonBlocks, loadBlockAnswers, saveBlockAnswer, missingRequired } from './blocks.js';

const publicSettings = (s = getSettings()) => ({
  brand_name: s.brand_name, brand_short: s.brand_short, mentor_name: s.mentor_name, brand_tagline: s.brand_tagline,
  brand_logo: s.brand_logo, brand_logo_wide: s.brand_logo_wide, brand_logo_wide_dark: s.brand_logo_wide_dark, brand_app_icon: s.brand_app_icon,
  support_email: s.support_email, support_whatsapp: s.support_whatsapp, guide_url: s.guide_url, rules: rulesFromSettings(s),
});

function lessonOut(l, full = false) {
  const o = { id: l.id, number: l.number, block: l.block, title: l.title, subtitle: l.subtitle, video_duration: l.video_duration, practice_duration: l.practice_duration, activity_key: l.activity_key };
  if (full) Object.assign(o, { objective: l.objective, video_url: l.video_url, practice_video_url: l.practice_video_url, cover_url: l.cover_url, practice_cover_url: l.practice_cover_url, key_phrases: jparse(l.key_phrases, []), verses: jparse(l.verses, []), body: l.body, tomorrow: l.tomorrow });
  return o;
}

function loadEnrollment(userId, slug) {
  const product = db.get('SELECT * FROM products WHERE slug = ? AND active = 1', slug);
  if (!product) fail(404, 'Conteúdo não encontrado.');
  const enr = db.get("SELECT * FROM enrollments WHERE user_id = ? AND product_id = ? AND status = 'active'", userId, product.id);
  if (!enr) fail(403, 'Você não tem acesso a este conteúdo.');
  if (enr.expires_at && enr.expires_at < now()) fail(403, 'O seu acesso a este conteúdo expirou.');
  const lessons = db.all('SELECT * FROM lessons WHERE product_id = ? AND published = 1 ORDER BY number', product.id);
  return { product, enr, lessons, states: lessonStates(userId, product, enr, lessons) };
}

export function registerAppRoutes(r) {
  // Marca da plataforma (usada na tela de login, antes de entrar)
  r.get('/api/app/brand', () => { const s = getSettings(); return { brand_name: s.brand_name, brand_tagline: s.brand_tagline, brand_logo: s.brand_logo, brand_logo_wide: s.brand_logo_wide, brand_logo_wide_dark: s.brand_logo_wide_dark, brand_app_icon: s.brand_app_icon }; });
  r.post('/api/app/login', async (req, res) => {
    rateLimit(`login:${req.ip}`, 15, 15 * 60e3);
    const email = normEmail(req.body.email);
    const user = db.get('SELECT * FROM users WHERE email = ?', email);
    if (!user || !verifyPassword(req.body.password || '', user.password_hash)) {
      if (user && !user.password_hash) fail(400, 'Você ainda não criou a sua senha. Use "Primeiro acesso / esqueci a senha" para receber o link.', { code: 'no_password' });
      fail(400, 'E-mail ou senha incorretos.');
    }
    if (user.status !== 'active') fail(403, 'Seu acesso está bloqueado. Fale com o suporte.');
    createSession(res, 'user', user.id, req);
    db.run('UPDATE users SET last_login_at = ? WHERE id = ?', now(), user.id);
    return { ok: true };
  });

  r.post('/api/app/logout', (req, res) => { destroySession(req, res, 'user'); return { ok: true }; });

  r.post('/api/app/forgot', async (req) => {
    rateLimit(`forgot:${req.ip}`, 6, 15 * 60e3);
    const email = normEmail(req.body.email);
    const user = db.get('SELECT * FROM users WHERE email = ?', email);
    const hasAccess = user && db.get("SELECT 1 FROM enrollments WHERE user_id = ? AND status = 'active'", user.id);
    if (user && hasAccess && user.status === 'active') {
      rateLimit(`forgot-user:${user.id}`, 3, 60 * 60e3);
      const token = issueUserToken(user.id, user.password_hash ? 'reset' : 'access', user.password_hash ? 2 : 72);
      const product = lastProduct(user.id);
      const { subject, html } = resetEmail({ name: user.name, link: `${config.appUrl}/acesso?t=${token}`, product });
      await sendEmail({ to: user.email, subject, html, userId: user.id, kind: 'reset', ref: String(Date.now()), fromName: senderName(product) });
    }
    // resposta sempre igual: não revela se o e-mail existe
    return { ok: true, message: 'Se este e-mail tiver um acesso ativo, você vai receber um link em instantes. Confira também a caixa de spam e promoções.' };
  });

  r.post('/api/app/token/check', (req) => {
    const t = consumeUserToken(req.body.token);
    if (!t) fail(400, 'Este link expirou ou já foi usado. Peça um novo na tela de login.');
    const u = db.get('SELECT name, email FROM users WHERE id = ?', t.user_id);
    return { name: u.name, email: u.email, purpose: t.purpose };
  });

  r.post('/api/app/token/consume', (req, res) => {
    rateLimit(`token:${req.ip}`, 20, 15 * 60e3);
    const t = consumeUserToken(req.body.token);
    if (!t) fail(400, 'Este link expirou ou já foi usado. Peça um novo na tela de login.');
    validatePassword(req.body.password);
    db.run('UPDATE users SET password_hash = ?, last_login_at = ?, updated_at = ? WHERE id = ?', hashPassword(req.body.password), now(), now(), t.user_id);
    markTokenUsed(t);
    db.run("DELETE FROM sessions WHERE kind = 'user' AND subject_id = ?", t.user_id);
    createSession(res, 'user', t.user_id, req);
    return { ok: true };
  });

  r.get('/api/app/me', (req) => {
    const u = requireUser(req);
    // bônus para quem já é aluno: libera os automáticos, retira os que perderam o direito e traz as ofertas de resgate
    let unlockOffers = [];
    try { unlockOffers = syncUnlocks(u.id); } catch (e) { console.error('[unlock]', e); }
    const enrollments = db.all(`SELECT e.* FROM enrollments e JOIN products p ON p.id = e.product_id
      WHERE e.user_id = ? AND e.status = 'active' AND p.active = 1 AND (e.expires_at IS NULL OR e.expires_at > ?) ORDER BY p.position, p.id`, u.id, now());
    const owned = new Set();
    const products = enrollments.map((e) => {
      const product = db.get('SELECT * FROM products WHERE id = ?', e.product_id);
      owned.add(product.id);
      const lessons = db.all('SELECT * FROM lessons WHERE product_id = ? AND published = 1 ORDER BY number', e.product_id);
      const states = lessonStates(u.id, product, e, lessons);
      return { ...productPublic(product), startedAt: e.started_at, expiresAt: e.expires_at, gift: e.source === 'unlock',
        releaseMode: product.release_mode, releaseDelayHours: product.release_delay_hours,
        hasActivities: lessons.some((l) => l.activity_key),
        lessons: lessons.map((l, i) => ({ ...lessonOut(l), ...states[i] })) };
    });
    // Vitrine: produtos que o aluno ainda não tem, marcados para aparecer
    const lessonsCount = (id) => db.get('SELECT COUNT(*) c FROM lessons WHERE product_id = ? AND published = 1', id).c;
    const offers = unlockOffers.filter((o) => !owned.has(o.product.id)).map(({ product: p, via }) => ({ ...productPublic(p), materials: undefined, lessonsCount: lessonsCount(p.id),
      listPrice: p.list_price, offerCta: p.offer_cta, bullets: jparse(p.offer_bullets, []), via: via.short_name || via.name }));
    const offerIds = new Set(unlockOffers.map((o) => o.product.id));
    const store = db.all('SELECT * FROM products WHERE active = 1 AND show_in_store = 1 ORDER BY position, id').filter((p) => !owned.has(p.id) && !offerIds.has(p.id))
      .map((p) => ({ ...productPublic(p), salesUrl: p.sales_url, materials: undefined, lessonsCount: lessonsCount(p.id) }));
    return { user: { id: u.id, name: u.name, email: u.email, phone: u.phone }, settings: publicSettings(), products, store, offers, live: nextLive() };
  });

  // Resgatar curso grátis ("Acessar agora")
  r.post('/api/app/unlock/:slug', (req) => {
    const u = requireUser(req);
    rateLimit(`unlock:${u.id}`, 20, 60e3);
    const r0 = claimUnlock(u.id, String(req.params.slug || ''));
    if (!r0.ok) fail(r0.status, r0.error);
    if (!r0.already) audit(req, 'unlock.claim', u.id, { product: r0.slug, via: r0.via });
    return r0;
  });

  r.get('/api/app/p/:slug/day/:n', (req) => {
    const u = requireUser(req);
    const { product, lessons, states } = loadEnrollment(u.id, req.params.slug);
    const i = lessons.findIndex((l) => l.number === Number(req.params.n));
    if (i < 0) fail(404, 'Dia não encontrado.');
    const st = states[i];
    if (!st.available) return { locked: true, product: { slug: product.slug, unitLabel: product.unit_label || 'Dia', total: lessons.length }, lesson: lessonOut(lessons[i]), state: st };
    const meta = { slug: product.slug, unitLabel: product.unit_label || 'Dia', total: lessons.length, releaseMode: product.release_mode, quotesTitle: product.quotes_title || 'Para refletir', pointsTitle: product.points_title || 'Para lembrar' };
    const blocks = lessonBlocks(lessons[i]);
    const blockAnswers = loadBlockAnswers(u.id, lessons[i].id);
    const watchNote = lessons[i].watch_note ?? product.watch_note ?? '';
    return { product: meta, lesson: lessonOut(lessons[i], true), watchNote, blocks, blockAnswers, state: st, answers: loadAnswers(u.id, product.id), next: lessons[i + 1] ? { number: lessons[i + 1].number, title: lessons[i + 1].title, ...states[i + 1] } : null, live: product.show_live && i === lessons.length - 1 ? nextLive() : null, delayHours: product.release_delay_hours };
  });

  r.put('/api/app/p/:slug/answers/:day', (req) => {
    const u = requireUser(req);
    const { product, lessons, states } = loadEnrollment(u.id, req.params.slug);
    const day = Number(req.params.day);
    const i = lessons.findIndex((l) => l.number === day);
    if (i < 0 || !states[i].available) fail(403, 'Este dia ainda não foi liberado.');
    const data = req.body.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Dados inválidos.');
    const json = JSON.stringify(data);
    if (json.length > 200_000) fail(413, 'Respostas muito grandes.');
    db.run(`INSERT INTO answers (user_id, product_id, day, data, updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id, product_id, day) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, u.id, product.id, day, json, now());
    const before = db.get('SELECT live_optin, has_message FROM summaries WHERE user_id = ? AND product_id = ?', u.id, product.id);
    const c = refreshSummary(u.id, product.id);
    if (day === 4 && data.checkpoint && Object.values(data.checkpoint).some(Boolean)) emit('checkpoint.saved', { checkpoint: 1, user: { id: u.id, name: u.name, email: u.email, phone: u.phone }, fase: c.fase, renda: c.renda, sobra_real: c.sobraReal, divida_total: c.dividaTotal, ...data.checkpoint });
    if (day === 7 && data.aulaAoVivo === 'Sim' && before?.live_optin !== 'Sim') emit('live.optin', { user: { id: u.id, name: u.name, email: u.email, phone: data.whatsapp || u.phone }, fase: c.fase, lead_score: c.leadScore, direcionar: c.direcionar, sonho_imovel: data.imovelSonho, live: nextLive() });
    return { ok: true, savedAt: now() };
  });

  r.post('/api/app/p/:slug/day/:n/progress', (req) => {
    const u = requireUser(req);
    const { product, lessons, states } = loadEnrollment(u.id, req.params.slug);
    const i = lessons.findIndex((l) => l.number === Number(req.params.n));
    if (i < 0 || !states[i].available) fail(403, 'Este dia ainda não foi liberado.');
    const l = lessons[i]; const t = now();
    // desmarcar (clique sem querer): apaga só a marcação de assistida; a conclusão não muda
    const undo = { unwatched: 'watched_at', unpractice: 'practice_watched_at' }[req.body.action];
    if (undo) {
      db.run(`UPDATE progress SET ${undo} = NULL, updated_at = ? WHERE user_id = ? AND lesson_id = ?`, t, u.id, l.id);
      const fresh = lessonStates(u.id, product, db.get('SELECT * FROM enrollments WHERE user_id = ? AND product_id = ?', u.id, product.id), lessons);
      return { ok: true, state: fresh[i], next: fresh[i + 1] || null };
    }
    const col = { watched: 'watched_at', practice: 'practice_watched_at', complete: 'completed_at' }[req.body.action];
    if (!col) fail(400, 'Ação inválida.');
    if (col === 'completed_at') { const miss = missingRequired(u.id, l); if (miss) fail(400, miss); }
    if (col === 'completed_at' && l.activity_key && !db.get('SELECT 1 FROM answers WHERE user_id = ? AND product_id = ? AND day = ?', u.id, product.id, l.number)) fail(400, 'Salve a sua atividade antes de concluir o dia.');
    db.run(`INSERT INTO progress (user_id, lesson_id, ${col}, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET ${col} = COALESCE(progress.${col}, excluded.${col}), updated_at = excluded.updated_at`, u.id, l.id, t, t);
    if (col === 'completed_at') {
      refreshSummary(u.id, product.id);
      emit('day.completed', { user: { id: u.id, name: u.name, email: u.email, phone: u.phone }, day: l.number, title: l.title, product: product.slug });
    }
    const fresh = lessonStates(u.id, product, db.get('SELECT * FROM enrollments WHERE user_id = ? AND product_id = ?', u.id, product.id), lessons);
    return { ok: true, state: fresh[i], next: fresh[i + 1] || null };
  });

  // resposta de exercício / estado da lista de tarefas
  r.put('/api/app/p/:slug/day/:n/blocks/:bid', (req) => {
    const u = requireUser(req);
    const { lessons, states } = loadEnrollment(u.id, req.params.slug);
    const i = lessons.findIndex((l) => l.number === Number(req.params.n));
    if (i < 0 || !states[i].available) fail(403, 'Esta aula ainda não foi liberada.');
    return { ok: true, data: saveBlockAnswer(u.id, lessons[i], String(req.params.bid), req.body?.data || {}), savedAt: now() };
  });

  r.get('/api/app/p/:slug/results', (req) => {
    const u = requireUser(req);
    const { product } = loadEnrollment(u.id, req.params.slug);
    return { answers: loadAnswers(u.id, product.id), live: product.show_live ? nextLive() : null };
  });

  r.put('/api/app/profile', (req) => {
    const u = requireUser(req);
    const name = String(req.body.name || '').trim().slice(0, 120);
    const phone = String(req.body.phone || '').trim().slice(0, 40);
    if (!name) fail(400, 'Informe o seu nome.');
    db.run('UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?', name, phone || null, now(), u.id);
    return { ok: true };
  });

  r.post('/api/app/password', (req, res) => {
    const u = requireUser(req);
    if (u.password_hash && !verifyPassword(req.body.current || '', u.password_hash)) fail(400, 'Senha atual incorreta.');
    validatePassword(req.body.password);
    db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hashPassword(req.body.password), now(), u.id);
    db.run("DELETE FROM sessions WHERE kind = 'user' AND subject_id = ?", u.id);
    createSession(res, 'user', u.id, req);
    return { ok: true };
  });
}
