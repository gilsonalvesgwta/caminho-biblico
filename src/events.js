import crypto from 'node:crypto';
import { db, now, getSettings } from './db.js';

/**
 * Eventos de saída (webhook para CRM / n8n / automação de WhatsApp).
 * Gravados numa outbox e enviados com retentativa exponencial — nada se perde se o destino cair.
 */
export function emit(event, data) {
  const s = getSettings();
  if (!s.outbound_webhook_url) return;
  db.run('INSERT INTO outbox (event, payload, next_attempt_at, created_at) VALUES (?,?,?,?)',
    event, JSON.stringify({ event, data, sent_at: null, brand: s.brand_name }), now(), now());
  setImmediate(() => flushOutbox().catch(() => {}));
}

let flushing = false;
export async function flushOutbox() {
  if (flushing) return;
  flushing = true;
  try {
    const s = getSettings();
    if (!s.outbound_webhook_url) return;
    const rows = db.all("SELECT * FROM outbox WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY id LIMIT 50", now());
    for (const row of rows) {
      const body = JSON.stringify({ ...JSON.parse(row.payload), id: row.id, sent_at: now() });
      const sig = crypto.createHmac('sha256', s.outbound_webhook_secret || '').update(body).digest('hex');
      try {
        const r = await fetch(s.outbound_webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-PB-Event': row.event, 'X-PB-Signature': `sha256=${sig}` },
          body, signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        db.run("UPDATE outbox SET status = 'sent', attempts = attempts + 1, last_error = NULL WHERE id = ?", row.id);
      } catch (e) {
        const attempts = row.attempts + 1;
        const dead = attempts >= 8;
        const wait = Math.min(2 ** attempts, 360) * 60e3; // 2min, 4min ... até 6h
        db.run('UPDATE outbox SET status = ?, attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?',
          dead ? 'failed' : 'pending', attempts, String(e.message).slice(0, 300), new Date(Date.now() + wait).toISOString(), row.id);
      }
    }
  } finally { flushing = false; }
}
