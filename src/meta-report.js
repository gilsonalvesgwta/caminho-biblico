// Relatório de anúncios (estilo Utmify): métricas da Meta + vendas reais da plataforma atribuídas pelos UTMs.
import { db } from './db.js';
import { parseRange, netExpr, startIso, addDays, dayDiff, SALE_DAY, APPROVED } from './finance.js';
import { metaStatus } from './meta.js';

const SUMS = ['spend', 'impressions', 'reach', 'clicks', 'link_clicks', 'lpv', 'video_3s', 'thruplay', 'add_to_cart', 'initiate_checkout', 'leads', 'purchases', 'purchase_value'];
const zero = () => ({ ...Object.fromEntries(SUMS.map((k) => [k, 0])), sales: 0, revenue: 0, net: 0, refunds: 0, refund_value: 0 });
const div = (a, b) => (b ? a / b : null);

/** Todas as métricas derivadas, a partir das somas */
export function metrics(a) {
  const profit = a.net - a.spend;
  return {
    ...a,
    profit, roas: div(a.revenue, a.spend), roi: div(profit, a.spend), cpa: div(a.spend, a.sales), ticket: div(a.revenue, a.sales), margin: div(profit, a.revenue),
    ctr: div(a.link_clicks, a.impressions), ctr_all: div(a.clicks, a.impressions), cpc: div(a.spend, a.link_clicks), cpc_all: div(a.spend, a.clicks),
    cpm: div(a.spend * 1000, a.impressions), frequency: div(a.impressions, a.reach),
    connect_rate: div(a.lpv, a.link_clicks), cost_lpv: div(a.spend, a.lpv), page_conv: div(a.sales, a.lpv), checkout_rate: div(a.initiate_checkout, a.lpv),
    cost_ic: div(a.spend, a.initiate_checkout), checkout_conv: div(a.sales, a.initiate_checkout),
    hook_rate: div(a.video_3s, a.impressions), hold_rate: div(a.thruplay, a.video_3s), cpl: div(a.spend, a.leads),
    meta_roas: div(a.purchase_value, a.spend), meta_cpa: div(a.spend, a.purchases), refund_rate: div(a.refunds, a.sales + a.refunds),
  };
}

// ---------- atribuição das vendas pelos UTMs ----------
/** "Nome da campanha|1202..." → id; aceita também só o id */
export function idFrom(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  let m = s.match(/\|\s*(\d{6,})\s*$/); if (m) return m[1];
  m = s.match(/^(\d{6,})$/); if (m) return m[1];
  m = s.match(/(?:^|[^\d])(\d{12,})(?:[^\d]|$)/); return m ? m[1] : null;
}
const nameOf = (v) => String(v || '').replace(/\|\s*\d{6,}\s*$/, '').trim().toLowerCase();

function lookups() {
  const ads = new Map(db.all('SELECT id, adset_id, campaign_id, account_id, name FROM meta_ads').map((r) => [r.id, r]));
  const sets = new Map(db.all('SELECT id, campaign_id, account_id, name FROM meta_adsets').map((r) => [r.id, r]));
  const camps = new Map(db.all('SELECT id, account_id, name FROM meta_campaigns').map((r) => [r.id, r]));
  const uniq = (rows) => { const m = new Map(), dup = new Set(); for (const r of rows) { const k = String(r.name || '').trim().toLowerCase(); if (!k) continue; if (m.has(k)) dup.add(k); m.set(k, r.id); } for (const k of dup) m.delete(k); return m; };
  return { ads, sets, camps, adByName: uniq([...ads.values()]), setByName: uniq([...sets.values()]), campByName: uniq([...camps.values()]) };
}

export function resolveSale(s, L) {
  let ad = idFrom(s.utm_content), set = idFrom(s.utm_medium), camp = idFrom(s.utm_campaign);
  if (ad && !L.ads.has(ad)) ad = null;
  if (set && !L.sets.has(set)) set = null;
  if (camp && !L.camps.has(camp)) camp = null;
  if (!ad && s.utm_content) ad = L.adByName.get(nameOf(s.utm_content)) || null;
  if (!set && s.utm_medium) set = L.setByName.get(nameOf(s.utm_medium)) || null;
  if (!camp && s.utm_campaign) camp = L.campByName.get(nameOf(s.utm_campaign)) || null;
  if (ad) { const a = L.ads.get(ad); set ||= a.adset_id; camp ||= a.campaign_id; }
  if (set && !camp) camp = L.sets.get(set)?.campaign_id || null;
  const account = (ad && L.ads.get(ad)?.account_id) || (set && L.sets.get(set)?.account_id) || (camp && L.camps.get(camp)?.account_id) || null;
  return camp || set || ad ? { ad, adset: set, campaign: camp, account } : null;
}

function salesInRange(from, to) {
  const { sql: NET } = netExpr();
  return db.all(`SELECT id, status, amount, ${NET} net, utm_source, utm_medium, utm_campaign, utm_content, substr(datetime(${SALE_DAY}, '-3 hours'), 1, 10) d
    FROM sales WHERE is_test = 0 AND status IN ${APPROVED} AND ${SALE_DAY} >= ? AND ${SALE_DAY} < ?`, startIso(from), startIso(addDays(to, 1)));
}
const addSale = (o, s) => {
  if (s.status === 'paid') { o.sales++; o.revenue += s.amount; o.net += s.net; }
  else { o.refunds++; o.refund_value += s.amount; }
};

// ---------- relatório ----------
const PAUSED = new Set(['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED']);
const GONE = new Set(['DELETED', 'ARCHIVED']);
/** Filtro de status da tabela: ativos, pausados, excluídos/arquivados ou inativos (pausados + excluídos) */
export function statusMatch(st, f) {
  if (!f) return true;
  if (f === 'active') return st === 'ACTIVE';
  if (f === 'paused') return PAUSED.has(st);
  if (f === 'deleted') return GONE.has(st);
  return st !== 'ACTIVE'; // 'inactive' e o antigo 'paused' genérico
}
function where(f, alias = 'i') {
  const w = [`${alias}.date >= ?`, `${alias}.date <= ?`]; const p = [f.from, f.to];
  if (f.account) { w.push(`${alias}.account_id = ?`); p.push(f.account); }
  if (f.campaign) { w.push(`${alias}.campaign_id = ?`); p.push(f.campaign); }
  if (f.adset) { w.push(`${alias}.adset_id = ?`); p.push(f.adset); }
  if (f.ad) { w.push(`${alias}.ad_id = ?`); p.push(f.ad); }
  return { sql: w.join(' AND '), p };
}
const SUM_SQL = SUMS.map((k) => `COALESCE(SUM(${k}),0) ${k}`).join(', ');
const inFilter = (r, f) => r && (!f.account || r.account === f.account) && (!f.campaign || r.campaign === f.campaign) && (!f.adset || r.adset === f.adset) && (!f.ad || r.ad === f.ad);

function totalsFor(f, L) {
  const w = where(f);
  const a = { ...zero(), ...db.get(`SELECT ${SUM_SQL} FROM meta_insights i WHERE ${w.sql}`, ...w.p) };
  const all = zero();
  let unattributed = 0, unattributedValue = 0;
  for (const s of salesInRange(f.from, f.to)) {
    const r = resolveSale(s, L);
    addSale(all, s);
    if (!r) { if (s.status === 'paid') { unattributed++; unattributedValue += s.amount; } continue; }
    if (inFilter(r, f)) addSale(a, s);
  }
  return { agg: a, all, unattributed, unattributedValue };
}

export function metaReport(q = {}) {
  const { from, to, days } = parseRange(q);
  const f = { from, to, account: q.account || '', campaign: q.campaign || '', adset: q.adset || '', ad: q.ad || '' };
  const status = q.status || '';
  const prevTo = addDays(from, -1), prevFrom = addDays(prevTo, -(days - 1));
  const L = lookups();
  const cur = totalsFor(f, L);
  const prev = totalsFor({ ...f, from: prevFrom, to: prevTo }, L);
  const filtered = !!(f.account || f.campaign || f.adset || f.ad);

  // série diária
  const w = where(f);
  const byDay = new Map(db.all(`SELECT date d, ${SUM_SQL} FROM meta_insights i WHERE ${w.sql} GROUP BY date`, ...w.p).map((r) => [r.d, r]));
  const salesDay = new Map();
  for (const s of salesInRange(from, to)) { const r = resolveSale(s, L); if (!inFilter(r, f) || s.status !== 'paid') continue; const o = salesDay.get(s.d) || { sales: 0, revenue: 0 }; o.sales++; o.revenue += s.amount; salesDay.set(s.d, o); }
  const series = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { const m = byDay.get(d) || {}; const sd = salesDay.get(d) || {}; series.push({ d, spend: m.spend || 0, impressions: m.impressions || 0, link_clicks: m.link_clicks || 0, sales: sd.sales || 0, revenue: sd.revenue || 0, roas: m.spend ? (sd.revenue || 0) / m.spend : null }); }

  // linhas por nível
  const level = (col, table, extra) => {
    const rows = new Map();
    for (const r of db.all(`SELECT i.${col} id, ${SUM_SQL} FROM meta_insights i WHERE ${w.sql} GROUP BY i.${col}`, ...w.p)) rows.set(r.id, { ...zero(), ...r });
    const key = { campaign_id: 'campaign', adset_id: 'adset', ad_id: 'ad' }[col];
    for (const s of salesInRange(from, to)) { const r = resolveSale(s, L); if (!inFilter(r, f) || !r[key]) continue; const o = rows.get(r[key]) || { ...zero(), id: r[key] }; addSale(o, s); rows.set(r[key], o); }
    const meta = new Map(db.all(`SELECT * FROM ${table}`).map((x) => [x.id, x]));
    return [...rows.values()].map((r) => { const m = meta.get(r.id) || {}; return { id: r.id, name: m.name || r.id, status: m.effective_status || '', ...extra(m), ...metrics(r) }; })
      .filter((r) => statusMatch(r.status, status))
      .sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);
  };
  const campName = (id) => L.camps.get(id)?.name || '';
  const setName = (id) => L.sets.get(id)?.name || '';
  const rows = {
    campaigns: level('campaign_id', 'meta_campaigns', (m) => ({ account_id: m.account_id, objective: m.objective, budget: m.daily_budget ?? m.lifetime_budget ?? null, budgetType: m.daily_budget ? 'diário' : m.lifetime_budget ? 'total' : null, product_id: m.product_id ?? null })),
    adsets: level('adset_id', 'meta_adsets', (m) => ({ campaign_id: m.campaign_id, campaign_name: campName(m.campaign_id), budget: m.daily_budget ?? m.lifetime_budget ?? null, budgetType: m.daily_budget ? 'diário' : m.lifetime_budget ? 'total' : null })),
    ads: level('ad_id', 'meta_ads', (m) => ({ campaign_id: m.campaign_id, adset_id: m.adset_id, campaign_name: campName(m.campaign_id), adset_name: setName(m.adset_id), thumbnail: m.thumbnail_url })),
  };

  // opções dos filtros (entidades com dados nos últimos 365 dias ou ativas)
  const recent = addDays(to, -365);
  const options = {
    accounts: db.all('SELECT id, name, currency, enabled FROM meta_accounts ORDER BY name'),
    campaigns: db.all("SELECT id, name, account_id, effective_status status FROM meta_campaigns WHERE effective_status = 'ACTIVE' OR id IN (SELECT DISTINCT campaign_id FROM meta_insights WHERE date >= ?) ORDER BY name", recent),
    adsets: db.all("SELECT id, name, campaign_id, effective_status status FROM meta_adsets WHERE effective_status = 'ACTIVE' OR id IN (SELECT DISTINCT adset_id FROM meta_insights WHERE date >= ?) ORDER BY name", recent),
    ads: db.all("SELECT id, name, adset_id, campaign_id, effective_status status FROM meta_ads WHERE effective_status = 'ACTIVE' OR id IN (SELECT DISTINCT ad_id FROM meta_insights WHERE date >= ?) ORDER BY name", recent),
  };

  const st = metaStatus();
  return {
    from, to, days, prevFrom, prevTo, filtered,
    totals: metrics(cur.agg), prev: metrics(prev.agg),
    blended: filtered ? null : { sales: cur.all.sales, revenue: cur.all.revenue, net: cur.all.net, roas: div(cur.all.revenue, cur.agg.spend), profit: cur.all.net - cur.agg.spend, prevRevenue: prev.all.revenue },
    unattributed: { sales: cur.unattributed, revenue: cur.unattributedValue },
    series, rows, options,
    sync: { connected: st.connected, lastSyncAt: st.lastSyncAt, nextSyncAt: st.nextSyncAt, syncing: st.syncing, hasData: !!db.get('SELECT 1 FROM meta_insights LIMIT 1') },
    currency: options.accounts.find((a) => a.enabled)?.currency || 'BRL',
    dayCount: dayDiff(from, to) + 1,
  };
}
