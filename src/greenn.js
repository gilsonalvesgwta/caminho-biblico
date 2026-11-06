import { db, now } from './db.js';
import { upsertUser, grantAccess, revokeAccess, sendAccessEmail, normEmail, isEmail, publicUser } from './services.js';
import { emit } from './events.js';

/**
 * Processa um evento da Greenn.
 * Formatos documentados (greenn.com.br/ajuda/vendo/webhook):
 *  - type "sale",     event "saleUpdated":       currentStatus paid | refused | refunded | chargedback | waiting_payment
 *  - type "contract", event "contractUpdated":   currentStatus paid | trialing | pending_payment | unpaid | canceled
 *  - type "lead",     event "checkoutAbandoned"
 * Campos usados: client{name,email,cellphone,cpf_cnpj,id}, product{id,name}, sale{id,amount,method,installments,coupon}, saleMetas[] (utm_*)
 * Idempotente: pode ser reprocessado quantas vezes for preciso.
 */
export async function processGreennEvent(p) {
  const type = p.type || (p.event === 'checkoutAbandoned' ? 'lead' : 'sale');
  const status = String(p.currentStatus || p.sale?.status || p.contract?.status || '').toLowerCase();
  const client = p.client || p.lead || p.customer || {};
  const email = normEmail(client.email || p.email);
  const gpid = String(p.product?.id ?? p.product_id ?? '');

  if (!email || !isEmail(email)) return { outcome: 'error', message: 'Evento sem e-mail válido do cliente' };

  if (type === 'lead' || p.event === 'checkoutAbandoned') {
    db.run('INSERT INTO leads (email, name, phone, provider_product_id, source, created_at) VALUES (?,?,?,?,?,?)', email, client.name || null, client.cellphone || null, gpid, 'checkout_abandoned', now());
    emit('checkout.abandoned', { email, name: client.name, phone: client.cellphone, product_id: gpid, product_name: p.product?.name });
    return { outcome: 'ok', message: 'Checkout abandonado registrado' };
  }

  if (!gpid) return { outcome: 'error', message: 'Evento sem product.id' };
  const products = db.all("SELECT * FROM products WHERE active = 1 AND (',' || REPLACE(greenn_ids, ' ', '') || ',') LIKE ?", `%,${gpid},%`);

  // Registra a venda (mesmo que o produto ainda não esteja mapeado)
  const saleId = String(p.sale?.id ?? p.contract?.id ?? p.sale_id ?? '');
  const metas = Object.fromEntries((p.saleMetas || []).map((m) => [m.meta_key, m.meta_value]));
  if (saleId) {
    const t = now();
    db.run(`INSERT INTO sales (provider, sale_id, provider_product_id, product_name, email, client_name, client_phone, status, amount, method, installments, coupon, kind, utm_source, utm_medium, utm_campaign, utm_content, paid_at, created_at, updated_at)
      VALUES ('greenn',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(provider, sale_id, provider_product_id) DO UPDATE SET status = excluded.status, amount = CASE WHEN excluded.amount > 0 THEN excluded.amount ELSE sales.amount END,
        method = COALESCE(excluded.method, sales.method), client_name = COALESCE(excluded.client_name, sales.client_name), client_phone = COALESCE(excluded.client_phone, sales.client_phone), paid_at = COALESCE(sales.paid_at, excluded.paid_at), updated_at = excluded.updated_at`,
      saleId, gpid, p.product?.name || null, email, client.name || null, client.cellphone || null, status, Number(p.sale?.amount ?? p.contract?.amount ?? p.product?.amount ?? 0) || 0,
      p.sale?.method || null, p.sale?.installments || null, p.sale?.coupon?.name || null, type,
      metas.utm_source || null, metas.utm_medium || null, metas.utm_campaign || null, metas.utm_content || null,
      status === 'paid' ? t : null, p.sale?.created_at ? toIso(p.sale.created_at) : t, t);
  }

  if (!products.length) {
    return { outcome: 'unmapped', message: `Produto Greenn ${gpid} (${p.product?.name || 'sem nome'}) não está vinculado a nenhum produto. Vincule em Produtos e reprocesse.` };
  }

  const grantStatuses = type === 'contract' ? ['paid', 'trialing'] : ['paid'];
  const revokeMap = { refunded: 'refunded', chargedback: 'chargedback', canceled: 'canceled', unpaid: 'suspended' };

  if (grantStatuses.includes(status)) {
    const { user, created } = upsertUser({ email, name: client.name, phone: client.cellphone, document: client.cpf_cnpj || client.cpf, greennClientId: client.id });
    if (saleId) db.run("UPDATE sales SET user_id = ? WHERE provider = 'greenn' AND sale_id = ?", user.id, saleId);
    db.run('UPDATE leads SET converted = 1 WHERE email = ?', email);
    const activated = [];
    for (const prod of products) {
      const r = grantAccess(user.id, prod.id, { source: 'greenn', saleRef: saleId });
      if (r.activated) activated.push(prod.name);
    }
    let mail = '';
    const recentMail = db.get("SELECT 1 FROM notifications WHERE user_id = ? AND kind = 'access' AND created_at > ?", user.id, new Date(Date.now() - 15 * 60e3).toISOString());
    if (activated.length && (!user.password_hash || created) && !recentMail) {
      const r = await sendAccessEmail(user, { isNew: true });
      mail = r.status === 'failed' ? ` E-mail de acesso falhou: ${r.error}` : ' E-mail de acesso enviado.';
    }
    return { outcome: 'ok', userId: user.id, message: activated.length ? `Acesso liberado: ${activated.join(', ')}.${mail}` : 'Acesso já estava ativo.' };
  }

  if (revokeMap[status]) {
    const user = db.get('SELECT * FROM users WHERE email = ?', email);
    if (!user) return { outcome: 'ok', message: `Status ${status}: aluno não existe, nada a revogar` };
    const done = products.filter((prod) => revokeAccess(user.id, prod.id, revokeMap[status])).map((x) => x.name);
    return { outcome: 'ok', userId: user.id, message: done.length ? `Acesso removido (${status}): ${done.join(', ')}` : `Status ${status}: nada a alterar` };
  }

  if (status === 'waiting_payment' || status === 'pending_payment') {
    emit('sale.waiting_payment', { email, name: client.name, phone: client.cellphone, product_id: gpid, method: p.sale?.method });
    return { outcome: 'ok', message: 'Aguardando pagamento (boleto/Pix). Nenhum acesso liberado ainda.' };
  }
  if (status === 'refused') {
    emit('sale.refused', { email, name: client.name, phone: client.cellphone, product_id: gpid });
    return { outcome: 'ok', message: 'Pagamento recusado. Evento enviado para recuperação.' };
  }
  return { outcome: 'ignored', message: `Status "${status || 'vazio'}" sem ação definida` };
}

function toIso(s) {
  const d = new Date(String(s).replace(' ', 'T') + (/[zZ+]/.test(s) ? '' : '-03:00'));
  return Number.isNaN(d.getTime()) ? now() : d.toISOString();
}

export async function handleWebhook(payload, ip) {
  const r = db.run('INSERT INTO webhook_events (provider, event, status_hint, email, payload, ip, received_at) VALUES (?,?,?,?,?,?,?)',
    'greenn', payload.event || payload.type || null, payload.currentStatus || null, normEmail(payload.client?.email || payload.lead?.email || '') || null, JSON.stringify(payload), ip, now());
  const id = Number(r.lastInsertRowid);
  return reprocessWebhook(id);
}

export async function reprocessWebhook(id) {
  const ev = db.get('SELECT * FROM webhook_events WHERE id = ?', id);
  if (!ev) return null;
  let result;
  try { result = await processGreennEvent(JSON.parse(ev.payload)); }
  catch (e) { result = { outcome: 'error', message: String(e.message || e) }; console.error('[greenn]', e); }
  db.run('UPDATE webhook_events SET outcome = ?, message = ?, attempts = attempts + 1, processed_at = ? WHERE id = ?', result.outcome, result.message, now(), id);
  return { id, ...result };
}
