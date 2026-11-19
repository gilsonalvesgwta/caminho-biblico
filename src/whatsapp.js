// WhatsApp pela Evolution API (v2), a mesma do CRM: envio dos dados de acesso junto com o e-mail.
// Fila com novas tentativas: o envio nunca atrasa nem trava a liberação do acesso.
import { db, getSettings, setSettings, now } from './db.js';
import { fail } from './http.js';
import { encrypt, decrypt } from './secret.js';

const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const PREFIX = 'altis-'; // instâncias criadas por esta plataforma; as demais do servidor nunca são alteradas

/** Número no formato internacional só com dígitos. Sem DDI e com 10/11 dígitos, assume o país padrão (55). */
export function normalizePhone(raw, country = '55') {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (String(raw).trim().startsWith('+')) return d.length >= 8 ? d : null;
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1); // 0 + DDD + número
  if ((d.length === 10 || d.length === 11) && !d.startsWith(country)) d = country + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export function render(tpl, vars) {
  return String(tpl || '').replace(/\[(nome|nome_completo|email|link|produto|plataforma)\]/g, (_, k) => vars[k] ?? '');
}

function cfg() {
  const s = getSettings();
  return { enabled: s.wa_enabled === 'true', url: String(s.wa_url || '').replace(/\/+$/, ''), key: decrypt(s.wa_key_enc), instance: s.wa_instance, country: s.wa_country || '55', s };
}
export const waReady = () => { const c = cfg(); return c.enabled && !!c.url && !!c.key && !!c.instance; };

class EvoError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
function evoMsg(body) {
  const m = body?.response?.message ?? body?.message ?? body?.error;
  if (Array.isArray(m)) {
    if (m.some((x) => x && typeof x === 'object' && x.exists === false)) return 'Este número não tem WhatsApp.';
    return m.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ').slice(0, 300);
  }
  return typeof m === 'string' ? m.slice(0, 300) : null;
}
async function evo(method, path, body, c = cfg(), timeout = 25_000) {
  if (!c.url || !c.key) throw new EvoError(0, 'Configure o endereço e a chave da Evolution API.');
  let res;
  try {
    res = await fetch(`${c.url}${path}`, { method, headers: { apikey: c.key, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
  } catch (e) { throw new EvoError(0, `A Evolution API não respondeu (${e.name === 'TimeoutError' ? 'tempo esgotado' : 'sem conexão'}). Confira o endereço.`); }
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (res.status === 401 || res.status === 403) throw new EvoError(res.status, 'Chave da Evolution API recusada. Confira a chave (AUTHENTICATION_API_KEY).');
  if (!res.ok) throw new EvoError(res.status, evoMsg(data) || `A Evolution API respondeu ${res.status}.`);
  return data;
}

// ---------- instâncias ----------
export async function listInstances(c = cfg()) {
  const r = await evo('GET', '/instance/fetchInstances', null, c);
  const list = Array.isArray(r) ? r : r ? [r] : [];
  return list.map((it) => {
    const x = it.instance ?? it;
    return { name: x.name ?? x.instanceName, state: x.connectionStatus ?? x.status ?? x.state ?? 'unknown', number: String(x.ownerJid ?? x.owner ?? '').split('@')[0] || null, profileName: x.profileName ?? null };
  }).filter((x) => x.name);
}
export async function instanceState(name, c = cfg()) {
  const r = await evo('GET', `/instance/connectionState/${encodeURIComponent(name)}`, null, c);
  return (r?.instance ?? r)?.state || 'unknown';
}
export async function createInstance(name) {
  if (!new RegExp(`^${PREFIX}[a-z0-9-]{2,30}$`).test(name)) fail(400, `O nome precisa começar com "${PREFIX}" e ter só letras minúsculas, números e hífen.`);
  try {
    const r = await evo('POST', '/instance/create', { instanceName: name, integration: 'WHATSAPP-BAILEYS', qrcode: true, groupsIgnore: true });
    const qr = r?.qrcode || {};
    return { qr: qr.base64 || null, pairingCode: qr.pairingCode || null };
  } catch (e) { fail(400, e.message); }
}
export async function connectQr(name) {
  if (!name.startsWith(PREFIX)) fail(400, 'Só é possível gerar QR code para instâncias criadas por esta plataforma.');
  try { const r = await evo('GET', `/instance/connect/${encodeURIComponent(name)}`); return { qr: r?.base64 || null, pairingCode: r?.pairingCode || null, state: r?.instance?.state || null }; }
  catch (e) { fail(400, e.message); }
}

// ---------- configuração ----------
export async function saveConfig(body) {
  const out = {};
  if (body.url !== undefined) {
    const u = String(body.url || '').trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\/[^\s]+$/.test(u)) fail(400, 'Endereço inválido. Ex.: https://evolution.seudominio.com.br');
    out.wa_url = u;
  }
  if (body.key) { const k = String(body.key).trim(); if (k.length < 8) fail(400, 'Chave muito curta.'); out.wa_key_enc = encrypt(k); out.wa_key_hint = `${k.slice(0, 4)}…${k.slice(-4)}`; }
  if (body.instance !== undefined) out.wa_instance = String(body.instance || '').trim().slice(0, 80);
  if (body.country !== undefined) { const c = String(body.country).replace(/\D/g, ''); if (!c || c.length > 3) fail(400, 'DDI inválido.'); out.wa_country = c; }
  for (const k of ['tpl_access', 'tpl_product']) if (body[k] !== undefined) { const t = String(body[k]).trim(); if (!t.includes('[link]')) fail(400, 'A mensagem precisa ter o [link].'); if (t.length > 3000) fail(400, 'Mensagem muito longa.'); out[`wa_${k}`] = t; }
  if (body.enabled !== undefined) out.wa_enabled = body.enabled ? 'true' : 'false';
  // valida a conexão antes de ligar
  const next = { ...cfg(), url: out.wa_url ?? cfg().url, key: out.wa_key_enc ? decrypt(out.wa_key_enc) : cfg().key, instance: out.wa_instance ?? cfg().instance };
  if ((out.wa_url !== undefined || out.wa_key_enc) && next.url && next.key) { try { await listInstances(next); } catch (e) { fail(400, e.message); } }
  if (out.wa_enabled === 'true' && (!next.url || !next.key || !next.instance)) fail(400, 'Para ligar, preencha o endereço, a chave e escolha a instância (número).');
  setSettings(out);
}

export async function waStatus() {
  const c = cfg();
  let state = null, error = null;
  if (c.url && c.key && c.instance) { try { state = await instanceState(c.instance, c); } catch (e) { error = e.message; } }
  const counts = Object.fromEntries(db.all("SELECT status, COUNT(*) c FROM wa_messages WHERE created_at >= ? GROUP BY status", new Date(Date.now() - 30 * 86400e3).toISOString()).map((r) => [r.status, r.c]));
  return {
    enabled: c.enabled, url: c.url, keyHint: c.s.wa_key_hint || '', hasKey: !!c.key, instance: c.instance, country: c.country, state, error,
    tplAccess: c.s.wa_tpl_access, tplProduct: c.s.wa_tpl_product, prefix: PREFIX, counts,
    messages: db.all(`SELECT m.id, m.user_id, m.phone, m.kind, m.status, m.attempts, m.error, m.created_at, m.sent_at, m.text, u.name, u.email
      FROM wa_messages m LEFT JOIN users u ON u.id = m.user_id ORDER BY m.id DESC LIMIT 50`),
  };
}

// ---------- fila ----------
const BACKOFF_MIN = [1, 5, 15, 60, 180];

/** Produto mais recente do aluno (o principal, não o bônus) — usado quando a mensagem não diz qual é */
export function lastProduct(userId) {
  return db.get(`SELECT p.id, p.name, p.slug, p.short_name, p.kind FROM enrollments e JOIN products p ON p.id = e.product_id
    WHERE e.user_id = ? AND e.status = 'active' ORDER BY (p.kind = 'bonus'), e.created_at DESC, e.id DESC LIMIT 1`, userId) || null;
}

/** Coloca na fila e tenta enviar na hora (sem esperar). Retorna o registro criado. */
export function queueWhatsApp({ user, kind, link, product, text, phone }) {
  const c = cfg();
  if (!c.enabled && kind !== 'test') return null;
  if (!product && user?.id) product = lastProduct(user.id);
  const vars = { nome: firstName(user?.name) || 'tudo bem', nome_completo: user?.name || '', email: user?.email || '', link: link || '', produto: product?.name || c.s.brand_name || 'Área de membros', plataforma: c.s.brand_name || 'Área de membros' };
  const body = text || render(kind === 'product' ? c.s.wa_tpl_product : c.s.wa_tpl_access, vars);
  const number = normalizePhone(phone ?? user?.phone, c.country);
  const t = now();
  // evita duplicar quando a Greenn reenvia o mesmo aviso
  if (user && kind !== 'test' && db.get("SELECT 1 FROM wa_messages WHERE user_id = ? AND kind = ? AND status IN ('queued','sent') AND created_at > ?", user.id, kind, new Date(Date.now() - 10 * 60e3).toISOString())) return null;
  const r = db.run('INSERT INTO wa_messages (user_id, phone, kind, text, status, error, ref, next_try_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    user?.id || null, number, kind, body, number ? 'queued' : 'skipped', number ? null : 'Aluno sem telefone válido no cadastro.', product ? String(product.id) : null, t, t);
  const id = Number(r.lastInsertRowid);
  if (number) setImmediate(() => processWaQueue({ onlyId: id }).catch(() => {}));
  return db.get('SELECT * FROM wa_messages WHERE id = ?', id);
}

let busy = false;
export async function processWaQueue({ onlyId } = {}) {
  if (busy && !onlyId) return 0;
  if (!onlyId) busy = true;
  let sent = 0;
  try {
    const c = cfg();
    const rows = onlyId ? db.all("SELECT * FROM wa_messages WHERE id = ? AND status = 'queued'", onlyId)
      : db.all("SELECT * FROM wa_messages WHERE status = 'queued' AND next_try_at <= ? ORDER BY id LIMIT 30", now());
    for (const m of rows) {
      if (!c.url || !c.key || !c.instance) { db.run("UPDATE wa_messages SET error = ? WHERE id = ?", 'WhatsApp não configurado.', m.id); continue; }
      try {
        const r = await evo('POST', `/message/sendText/${encodeURIComponent(c.instance)}`, { number: m.phone, text: m.text }, c, 30_000);
        db.run("UPDATE wa_messages SET status = 'sent', attempts = attempts + 1, error = NULL, message_id = ?, sent_at = ? WHERE id = ?", r?.key?.id || null, now(), m.id);
        sent++;
      } catch (e) {
        const attempts = m.attempts + 1;
        const final = /não tem WhatsApp/.test(e.message) || (e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 404) || attempts >= BACKOFF_MIN.length;
        db.run('UPDATE wa_messages SET status = ?, attempts = ?, error = ?, next_try_at = ? WHERE id = ?', final ? 'failed' : 'queued', attempts, e.message, new Date(Date.now() + BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length - 1)] * 60e3).toISOString(), m.id);
      }
    }
  } finally { if (!onlyId) busy = false; }
  return sent;
}

export function resend(id) {
  const m = db.get('SELECT * FROM wa_messages WHERE id = ?', id);
  if (!m) fail(404, 'Mensagem não encontrada.');
  let phone = m.phone;
  if (m.user_id) { const u = db.get('SELECT phone FROM users WHERE id = ?', m.user_id); phone = normalizePhone(u?.phone, cfg().country) || phone; } // usa o telefone atualizado da ficha
  if (!phone) fail(400, 'O aluno está sem telefone válido. Atualize o telefone na ficha do aluno e tente de novo.');
  db.run("UPDATE wa_messages SET status = 'queued', phone = ?, attempts = 0, error = NULL, next_try_at = ? WHERE id = ?", phone, now(), id);
  setImmediate(() => processWaQueue({ onlyId: id }).catch(() => {}));
}
