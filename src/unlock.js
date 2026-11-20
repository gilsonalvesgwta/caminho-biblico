// Cursos grátis para quem já é aluno: "quem tem o produto X (ou qualquer produto) ganha o Y".
// Regra no próprio produto Y: unlock_from = '' (desligado) | '*' (qualquer produto) | '3,5' (ids);
// unlock_mode = 'claim' (o aluno vê a oferta e resgata com um clique) | 'auto' (entra sozinho na conta).
import { db, now } from './db.js';
import { emit } from './events.js';
import { publicUser } from './services.js';

const LOST = 'unlock:lost'; // marcado quando o aluno perde o direito (ex.: reembolso do produto que dava acesso)

const parseFrom = (s) => (String(s || '').trim() === '*' ? '*' : String(s || '').split(/[\s,;]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0));
export const normalizeUnlockFrom = (v) => {
  if (Array.isArray(v)) v = v.join(',');
  const f = parseFrom(v);
  return f === '*' ? '*' : [...new Set(f)].join(',');
};

const unlockProducts = () => db.all("SELECT * FROM products WHERE active = 1 AND COALESCE(unlock_from, '') <> ''");
const activeEnrollments = (uid) => db.all(`SELECT e.* FROM enrollments e JOIN products p ON p.id = e.product_id
  WHERE e.user_id = ? AND e.status = 'active' AND p.active = 1 AND (e.expires_at IS NULL OR e.expires_at > ?)`, uid, now());

/** Produto que dá direito ao Y (ou null). Bônus liberado não libera outro bônus — evita corrente. */
function qualifyingProduct(p, enr) {
  const from = parseFrom(p.unlock_from);
  const pool = enr.filter((e) => e.product_id !== p.id && e.source !== 'unlock');
  const hit = from === '*' ? pool[0] : pool.find((e) => from.includes(e.product_id));
  return hit ? db.get('SELECT id, name, short_name FROM products WHERE id = ?', hit.product_id) : null;
}

const expiresFor = (p) => (p.access_days ? new Date(Date.now() + p.access_days * 86400e3).toISOString() : null);

/** Libera o Y para o aluno (cria ou reativa a matrícula como "bônus") */
function grant(uid, p, via) {
  const t = now();
  const cur = db.get('SELECT * FROM enrollments WHERE user_id = ? AND product_id = ?', uid, p.id);
  if (cur) db.run("UPDATE enrollments SET status = 'active', source = 'unlock', sale_ref = ?, started_at = ?, expires_at = ?, revoked_at = NULL, updated_at = ? WHERE id = ?", `unlock:${via.id}`, cur.started_at || t, expiresFor(p), t, cur.id);
  else db.run("INSERT INTO enrollments (user_id, product_id, status, source, sale_ref, started_at, expires_at, created_at, updated_at) VALUES (?,?, 'active', 'unlock', ?, ?, ?, ?, ?)", uid, p.id, `unlock:${via.id}`, t, expiresFor(p), t, t);
  emit('enrollment.activated', { user: publicUser(db.get('SELECT * FROM users WHERE id = ?', uid)), product: { id: p.id, slug: p.slug, name: p.name }, source: 'unlock', via: { id: via.id, name: via.name } });
}

/** Pode oferecer/liberar? Não volta a liberar se a equipe removeu o acesso manualmente. */
function blocked(row) {
  if (!row) return false;
  if (row.status === 'active' && (!row.expires_at || row.expires_at > now())) return true; // já tem
  if (row.status === 'suspended') return true;
  if (row.source === 'unlock' && row.sale_ref !== LOST) return true; // removido pela equipe
  return false;
}

/**
 * Mantém os bônus em dia para o aluno: libera os automáticos, tira os que perderam o direito
 * e devolve as ofertas de resgate (modo "claim") que ele pode ver.
 */
export function syncUnlocks(uid) {
  const list = unlockProducts();
  if (!list.length && !db.get("SELECT 1 FROM enrollments WHERE user_id = ? AND source = 'unlock' AND status = 'active'", uid)) return [];
  const enr = activeEnrollments(uid);
  const offers = [];
  const t = now();
  // perdeu o direito (reembolso, expirou, regra mudou): o bônus sai junto
  for (const row of db.all("SELECT e.*, p.unlock_from FROM enrollments e JOIN products p ON p.id = e.product_id WHERE e.user_id = ? AND e.source = 'unlock' AND e.status = 'active'", uid)) {
    if (!String(row.unlock_from || '').trim() || !qualifyingProduct(row, enr)) {
      db.run("UPDATE enrollments SET status = 'canceled', sale_ref = ?, revoked_at = ?, updated_at = ? WHERE id = ?", LOST, t, t, row.id);
    }
  }
  for (const p of list) {
    const row = db.get('SELECT * FROM enrollments WHERE user_id = ? AND product_id = ?', uid, p.id);
    if (blocked(row)) continue;
    const via = qualifyingProduct(p, enr);
    if (!via) continue;
    if (p.unlock_mode === 'auto') grant(uid, p, via);
    else offers.push({ product: p, via });
  }
  return offers;
}

/** Resgate pelo aluno (botão "Acessar agora") */
export function claimUnlock(uid, slug) {
  const p = db.get("SELECT * FROM products WHERE slug = ? AND active = 1 AND COALESCE(unlock_from, '') <> ''", slug);
  if (!p) return { ok: false, status: 404, error: 'Esta oferta não está mais disponível.' };
  const row = db.get('SELECT * FROM enrollments WHERE user_id = ? AND product_id = ?', uid, p.id);
  if (row && row.status === 'active' && (!row.expires_at || row.expires_at > now())) return { ok: true, slug: p.slug, already: true };
  if (blocked(row)) return { ok: false, status: 403, error: 'Esta oferta não está disponível para a sua conta. Fale com o suporte.' };
  const via = qualifyingProduct(p, activeEnrollments(uid));
  if (!via) return { ok: false, status: 403, error: 'Esta oferta é exclusiva para quem tem um dos produtos participantes.' };
  grant(uid, p, via);
  return { ok: true, slug: p.slug, name: p.name, via: via.short_name || via.name };
}
