// Integração Meta Ads: conexão por token (usuário do sistema), estrutura das contas e métricas diárias por anúncio.
// Sincroniza sozinha a cada N horas (padrão 6) e alimenta o Financeiro (ad_spend, origem "meta").
import crypto from 'node:crypto';
import { db, getSettings, setSettings, now } from './db.js';
import { fail } from './http.js';
import { encrypt, decrypt } from './secret.js';

const GRAPH = (process.env.META_GRAPH_URL || 'https://graph.facebook.com').replace(/\/$/, '');
const TZ_H = 3;
const localDay = (delta = 0) => new Date(Date.now() - TZ_H * 3600e3 + delta * 86400e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class MetaError extends Error {
  constructor(message, { code, subcode, status, type } = {}) { super(message); this.code = code; this.subcode = subcode; this.status = status; this.type = type; }
}

/** Mensagens claras para os erros mais comuns da Meta */
function friendly(e) {
  const c = Number(e.code);
  if (c === 190) return 'O token da Meta expirou ou foi revogado. Gere um novo token e conecte de novo.';
  if (c === 10 || c === 200 || c === 294) return 'O token não tem permissão para ler os anúncios. Gere o token com a permissão ads_read e dê acesso às contas de anúncio.';
  if ([4, 17, 32, 613, 80000, 80003, 80004, 80014].includes(c)) return 'A Meta limitou temporariamente as consultas. A próxima sincronização tenta de novo.';
  if (c === 100) return `Parâmetro recusado pela Meta: ${e.message}`;
  return e.message || 'Erro ao falar com a Meta.';
}
const RETRY = new Set([1, 2, 4, 17, 32, 341, 613, 80000, 80003, 80004, 80014]);

function creds() {
  const s = getSettings();
  return { token: decrypt(s.meta_token_enc), secret: decrypt(s.meta_app_secret_enc), version: s.meta_api_version || 'v26.0' };
}

/** GET na Graph API com novas tentativas (limite de taxa, instabilidade) */
async function graphGet(urlOrPath, params = {}, c = creds()) {
  if (!c.token) throw new MetaError('Meta não conectada.');
  let url;
  if (/^https?:\/\//.test(urlOrPath)) url = new URL(urlOrPath);
  else {
    url = new URL(`${GRAPH}/${c.version}/${urlOrPath.replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  url.searchParams.set('access_token', c.token);
  if (c.secret) url.searchParams.set('appsecret_proof', crypto.createHmac('sha256', c.secret).update(c.token).digest('hex'));
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90_000), headers: { accept: 'application/json' } });
      const body = await res.json().catch(() => ({}));
      if (res.ok && !body.error) return body;
      const e = body.error || {};
      last = new MetaError(friendly(e), { code: e.code, subcode: e.error_subcode, status: res.status, type: e.type });
      if (!(RETRY.has(Number(e.code)) || res.status >= 500)) throw last;
    } catch (err) {
      if (err instanceof MetaError && !(RETRY.has(Number(err.code)) || err.status >= 500)) throw err;
      last = err instanceof MetaError ? err : new MetaError(`Sem resposta da Meta (${err.name === 'TimeoutError' ? 'tempo esgotado' : err.message}).`);
    }
    await sleep(Math.min(30_000, 1500 * 2 ** attempt));
  }
  throw last;
}

/** Percorre todas as páginas de um endpoint de lista */
async function graphAll(path, params, c) {
  const out = [];
  let page = await graphGet(path, params, c);
  for (let guard = 0; guard < 400; guard++) {
    out.push(...(page.data || []));
    const next = page.paging?.next;
    if (!next) break;
    const n = new URL(next); n.searchParams.delete('access_token'); n.searchParams.delete('appsecret_proof');
    page = await graphGet(n.toString(), {}, c);
  }
  return out;
}

// ---------- conexão ----------
export async function connect({ token, app_secret }) {
  token = String(token || '').trim();
  if (token.length < 20) fail(400, 'Cole o token de acesso da Meta.');
  const c = { token, secret: String(app_secret || '').trim(), version: getSettings().meta_api_version || 'v26.0' };
  let me, accounts;
  try {
    me = await graphGet('me', { fields: 'id,name' }, c);
    accounts = await graphAll('me/adaccounts', { fields: 'id,name,account_status,currency,timezone_name,business_name', limit: 200 }, c);
  } catch (e) { fail(400, e.message); }
  if (!accounts.length) fail(400, 'O token funciona, mas não tem acesso a nenhuma conta de anúncios. No Gerenciador de Negócios, dê ao usuário do sistema acesso às contas.');
  const t = now();
  db.tx(() => {
    for (const a of accounts) {
      db.run(`INSERT INTO meta_accounts (id, name, currency, timezone, account_status, business_name, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, currency = excluded.currency, timezone = excluded.timezone, account_status = excluded.account_status, business_name = excluded.business_name, updated_at = excluded.updated_at`,
        a.id, a.name, a.currency, a.timezone_name, a.account_status ?? null, a.business_name || null, a.account_status === 1 ? 1 : 0, t, t);
    }
  });
  setSettings({ meta_token_enc: encrypt(token), meta_token_hint: `${token.slice(0, 6)}…${token.slice(-4)}`, meta_app_secret_enc: c.secret ? encrypt(c.secret) : '', meta_user_name: me.name || me.id, meta_connected_at: t, meta_last_attempt_at: '' });
  return { user: me.name || me.id, accounts: accounts.length };
}

export function disconnect() {
  setSettings({ meta_token_enc: '', meta_token_hint: '', meta_app_secret_enc: '', meta_user_name: '', meta_connected_at: '' });
}

export const isConnected = () => !!getSettings().meta_token_enc;

// ---------- sincronização ----------
let running = null;
export const syncRunning = () => !!running;

/** Escolhe a primeira ação disponível na ordem de prioridade (evita somar duplicatas como purchase + omni_purchase) */
function pickAction(list, types) {
  if (!Array.isArray(list)) return 0;
  for (const t of types) { const a = list.find((x) => x.action_type === t); if (a) return Number(a.value) || 0; }
  return 0;
}
const ACT = {
  lpv: ['omni_landing_page_view', 'landing_page_view'],
  video_3s: ['video_view'],
  add_to_cart: ['omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'],
  initiate_checkout: ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'],
  leads: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'],
  purchases: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
};
const INSIGHT_FIELDS = 'date_start,account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values,video_thruplay_watched_actions';
const INSIGHT_FIELDS_MIN = 'date_start,account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,actions,action_values';

function rowFromInsight(r) {
  return {
    date: r.date_start, ad_id: r.ad_id, adset_id: r.adset_id, campaign_id: r.campaign_id,
    spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0, reach: Number(r.reach) || 0, clicks: Number(r.clicks) || 0,
    link_clicks: Number(r.inline_link_clicks) || 0, lpv: pickAction(r.actions, ACT.lpv), video_3s: pickAction(r.actions, ACT.video_3s),
    thruplay: pickAction(r.video_thruplay_watched_actions, ['video_view']) || pickAction(r.video_thruplay_watched_actions, ['video_thruplay_watched_actions']),
    add_to_cart: pickAction(r.actions, ACT.add_to_cart), initiate_checkout: pickAction(r.actions, ACT.initiate_checkout), leads: pickAction(r.actions, ACT.leads),
    purchases: pickAction(r.actions, ACT.purchases), purchase_value: pickAction(r.action_values, ACT.purchases),
  };
}

async function syncAccount(acc, since, until, c, log) {
  const t = now();
  const camps = await graphAll(`${acc.id}/campaigns`, { fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget', limit: 500 }, c);
  const sets = await graphAll(`${acc.id}/adsets`, { fields: 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal', limit: 500 }, c);
  const ads = await graphAll(`${acc.id}/ads`, { fields: 'id,name,campaign_id,adset_id,status,effective_status,creative{thumbnail_url,image_url}', limit: 500, thumbnail_width: 240, thumbnail_height: 240 }, c);
  const money = (v) => (v === undefined || v === null || v === '' ? null : Number(v) / 100); // a Meta envia orçamento em centavos
  db.tx(() => {
    for (const x of camps) db.run(`INSERT INTO meta_campaigns (id, account_id, name, objective, status, effective_status, daily_budget, lifetime_budget, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, objective = excluded.objective, status = excluded.status, effective_status = excluded.effective_status, daily_budget = excluded.daily_budget, lifetime_budget = excluded.lifetime_budget, updated_at = excluded.updated_at`,
      x.id, acc.id, x.name, x.objective || null, x.status || null, x.effective_status || null, money(x.daily_budget), money(x.lifetime_budget), t);
    for (const x of sets) db.run(`INSERT INTO meta_adsets (id, account_id, campaign_id, name, status, effective_status, daily_budget, lifetime_budget, optimization_goal, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET campaign_id = excluded.campaign_id, name = excluded.name, status = excluded.status, effective_status = excluded.effective_status, daily_budget = excluded.daily_budget, lifetime_budget = excluded.lifetime_budget, optimization_goal = excluded.optimization_goal, updated_at = excluded.updated_at`,
      x.id, acc.id, x.campaign_id || null, x.name, x.status || null, x.effective_status || null, money(x.daily_budget), money(x.lifetime_budget), x.optimization_goal || null, t);
    for (const x of ads) db.run(`INSERT INTO meta_ads (id, account_id, campaign_id, adset_id, name, status, effective_status, thumbnail_url, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET campaign_id = excluded.campaign_id, adset_id = excluded.adset_id, name = excluded.name, status = excluded.status, effective_status = excluded.effective_status, thumbnail_url = COALESCE(excluded.thumbnail_url, meta_ads.thumbnail_url), updated_at = excluded.updated_at`,
      x.id, acc.id, x.campaign_id || null, x.adset_id || null, x.name, x.status || null, x.effective_status || null, x.creative?.thumbnail_url || x.creative?.image_url || null, t);
  });
  // métricas diárias por anúncio, em blocos de 30 dias
  let rows = 0;
  for (let a = since; a <= until; a = addDays(a, 30)) {
    const b = addDays(a, 29) < until ? addDays(a, 29) : until;
    const params = { level: 'ad', time_increment: 1, time_range: { since: a, until: b }, limit: 500 };
    let data;
    try { data = await graphAll(`${acc.id}/insights`, { ...params, fields: INSIGHT_FIELDS }, c); }
    catch (e) { if (Number(e.code) !== 100) throw e; log.push(`Campos reduzidos em ${acc.name}: ${e.message}`); data = await graphAll(`${acc.id}/insights`, { ...params, fields: INSIGHT_FIELDS_MIN }, c); }
    db.tx(() => {
      db.run('DELETE FROM meta_insights WHERE account_id = ? AND date >= ? AND date <= ?', acc.id, a, b);
      for (const r of data) {
        const x = rowFromInsight(r);
        if (!x.ad_id || !x.date) continue;
        db.run(`INSERT OR REPLACE INTO meta_insights (date, ad_id, adset_id, campaign_id, account_id, spend, impressions, reach, clicks, link_clicks, lpv, video_3s, thruplay, add_to_cart, initiate_checkout, leads, purchases, purchase_value)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, x.date, x.ad_id, x.adset_id, x.campaign_id, acc.id, x.spend, x.impressions, x.reach, x.clicks, x.link_clicks, x.lpv, x.video_3s, x.thruplay, x.add_to_cart, x.initiate_checkout, x.leads, x.purchases, x.purchase_value);
        // garante a estrutura mesmo para anúncios já excluídos na Meta
        db.run("INSERT OR IGNORE INTO meta_campaigns (id, account_id, name, effective_status, updated_at) VALUES (?,?,?,'DELETED',?)", x.campaign_id, acc.id, r.campaign_name || x.campaign_id, t);
        db.run("INSERT OR IGNORE INTO meta_adsets (id, account_id, campaign_id, name, effective_status, updated_at) VALUES (?,?,?,?,'DELETED',?)", x.adset_id, acc.id, x.campaign_id, r.adset_name || x.adset_id, t);
        db.run("INSERT OR IGNORE INTO meta_ads (id, account_id, campaign_id, adset_id, name, effective_status, updated_at) VALUES (?,?,?,?,?,'DELETED',?)", x.ad_id, acc.id, x.campaign_id, x.adset_id, r.ad_name || x.ad_id, t);
        rows++;
      }
    });
  }
  rebuildSpend(acc.id, since, until);
  db.run('UPDATE meta_accounts SET last_sync_at = ?, last_error = NULL, updated_at = ? WHERE id = ?', now(), now(), acc.id);
  return rows;
}

/** Investimento por dia e campanha no Financeiro (origem "meta"), com o produto vinculado à campanha */
export function rebuildSpend(accountId, since, until) {
  const t = now();
  db.tx(() => {
    db.run("DELETE FROM ad_spend WHERE source = 'meta' AND date >= ? AND date <= ? AND campaign_id IN (SELECT id FROM meta_campaigns WHERE account_id = ?)", since, until, accountId);
    const rows = db.all(`SELECT i.date, i.campaign_id, c.name, c.product_id, SUM(i.spend) spend, SUM(i.impressions) imp, SUM(i.link_clicks) clk, SUM(i.purchases) buy
      FROM meta_insights i LEFT JOIN meta_campaigns c ON c.id = i.campaign_id WHERE i.account_id = ? AND i.date >= ? AND i.date <= ? GROUP BY i.date, i.campaign_id`, accountId, since, until);
    for (const r of rows) {
      if (!r.spend && !r.imp) continue;
      db.run(`INSERT INTO ad_spend (source, date, campaign_id, campaign_name, product_id, spend, impressions, clicks, purchases, created_at, updated_at) VALUES ('meta',?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(source, date, campaign_id) WHERE source <> 'manual' DO UPDATE SET spend = excluded.spend, impressions = excluded.impressions, clicks = excluded.clicks, purchases = excluded.purchases, campaign_name = excluded.campaign_name, product_id = excluded.product_id, updated_at = excluded.updated_at`,
        r.date, r.campaign_id, r.name, r.product_id, Math.round(r.spend * 100) / 100, r.imp, r.clk, r.buy, t, t);
    }
  });
}

/** Sincroniza todas as contas ativas. full = recarrega todo o histórico configurado. */
export function syncMeta({ full = false, trigger = 'agenda' } = {}) {
  if (running) return running;
  running = (async () => {
    const s = getSettings();
    const logId = db.run("INSERT INTO meta_sync_log (started_at, status, trigger) VALUES (?, 'running', ?)", now(), trigger).lastInsertRowid;
    setSettings({ meta_last_attempt_at: now() });
    const notes = []; let total = 0; let errors = 0;
    try {
      const c = creds();
      if (!c.token) throw new MetaError('Meta não conectada.');
      const history = Math.min(730, Math.max(7, Number(s.meta_history_days) || 90));
      const until = localDay(0);
      for (const acc of db.all('SELECT * FROM meta_accounts WHERE enabled = 1')) {
        const first = !acc.last_sync_at;
        const since = full || first ? addDays(until, -(history - 1)) : addDays(until, -6); // reprocessa 7 dias: a Meta ajusta as conversões com atraso
        try { total += await syncAccount(acc, since, until, c, notes); }
        catch (e) {
          errors++; notes.push(`${acc.name}: ${e.message}`);
          db.run('UPDATE meta_accounts SET last_error = ?, updated_at = ? WHERE id = ?', e.message, now(), acc.id);
          if (Number(e.code) === 190) break; // token inválido: não adianta tentar as outras contas
        }
      }
      const status = errors ? (total ? 'partial' : 'error') : 'ok';
      db.run('UPDATE meta_sync_log SET finished_at = ?, status = ?, message = ?, rows = ? WHERE id = ?', now(), status, notes.join(' · ').slice(0, 2000) || null, total, logId);
      if (status !== 'error') setSettings({ meta_last_sync_at: now() });
      db.run('DELETE FROM meta_sync_log WHERE id NOT IN (SELECT id FROM meta_sync_log ORDER BY id DESC LIMIT 60)');
      return { status, rows: total, notes };
    } catch (e) {
      db.run("UPDATE meta_sync_log SET finished_at = ?, status = 'error', message = ? WHERE id = ?", now(), e.message, logId);
      return { status: 'error', rows: 0, notes: [e.message] };
    } finally { running = null; }
  })();
  return running;
}

/** Intervalo entre sincronizações, em minutos (padrão: 6 horas; mínimo 15 min, máximo 24 h) */
export const DEFAULT_SYNC_MINUTES = 360;
export function syncMinutes(s = getSettings()) {
  const m = Number(s.meta_sync_minutes) || (Number(s.meta_sync_hours) || 6) * 60;
  return Math.min(1440, Math.max(15, Math.round(m)));
}
export const intervalLabel = (m) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);

/** Chamado pelo agendador: sincroniza quando passou o intervalo configurado */
export async function metaSyncIfDue() {
  const s = getSettings();
  if (!s.meta_token_enc || running) return;
  const mins = syncMinutes(s);
  const last = Date.parse(s.meta_last_attempt_at || 0) || 0;
  if (Date.now() - last < mins * 60e3 - 30e3) return;
  await syncMeta({ trigger: 'agenda' });
}

export function metaStatus() {
  const s = getSettings();
  const mins = syncMinutes(s);
  const last = s.meta_last_attempt_at;
  return {
    connected: !!s.meta_token_enc, user: s.meta_user_name, tokenHint: s.meta_token_hint, connectedAt: s.meta_connected_at, hasSecret: !!s.meta_app_secret_enc,
    apiVersion: s.meta_api_version, syncMinutes: mins, syncHours: mins / 60, syncLabel: intervalLabel(mins), syncIsDefault: mins === DEFAULT_SYNC_MINUTES, defaultSyncMinutes: DEFAULT_SYNC_MINUTES,
    historyDays: Number(s.meta_history_days) || 90,
    lastSyncAt: s.meta_last_sync_at || null, nextSyncAt: s.meta_token_enc ? new Date((Date.parse(last || 0) || Date.now()) + mins * 60e3).toISOString() : null,
    syncing: !!running,
    accounts: db.all('SELECT id, name, currency, timezone, account_status, business_name, enabled, last_sync_at, last_error FROM meta_accounts ORDER BY enabled DESC, name'),
    log: db.all('SELECT * FROM meta_sync_log ORDER BY id DESC LIMIT 12'),
    utmTemplate: 'utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}',
  };
}
