// Financeiro: faturamento bruto/líquido, taxas, reembolsos, chargebacks e marketing (ROAS, ROI, CAC).
// Todas as datas do relatório são dias do calendário de Brasília (UTC-3).
import { db, getSettings, now } from './db.js';
import { fail } from './http.js';
import crypto from 'node:crypto';

const TZ_OFFSET_H = 3;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
/** Dia local (Brasília) de agora ± n dias */
export const localDay = (deltaDays = 0) => new Date(Date.now() - TZ_OFFSET_H * 3600e3 + deltaDays * 86400e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400e3);
/** Início do dia local em UTC ISO */
const startIso = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + TZ_OFFSET_H * 3600e3).toISOString();

export function parseRange(q = {}) {
  let from = q.from, to = q.to;
  if (!isDate(from) || !isDate(to)) {
    const days = Math.min(730, Math.max(1, Number(q.days || 30)));
    to = localDay(0); from = addDays(to, -(days - 1));
  }
  if (from > to) [from, to] = [to, from];
  if (dayDiff(from, to) > 730) fail(400, 'Período máximo: 2 anos.');
  return { from, to, days: dayDiff(from, to) + 1 };
}

const APPROVED = "('paid','refunded','chargedback')";
const SALE_DAY = `COALESCE(paid_at, created_at)`;

/** Expressão SQL do líquido de cada venda: o real enviado pela Greenn ou a estimativa pela taxa configurada */
function netExpr() {
  const s = getSettings();
  const pctFee = Math.max(0, Number(String(s.fee_percent).replace(',', '.')) || 0);
  const fixed = Math.max(0, Number(String(s.fee_fixed).replace(',', '.')) || 0);
  return { sql: `COALESCE(net_amount, MAX(0, amount - amount * ${pctFee} / 100.0 - ${fixed}))`, pctFee, fixed };
}

function totals(from, to) {
  const a = startIso(from), b = startIso(addDays(to, 1));
  const { sql: NET } = netExpr();
  const r = db.get(`SELECT
      COUNT(*) approved, COALESCE(SUM(amount),0) gross,
      COALESCE(SUM(CASE WHEN status = 'refunded' THEN 1 END),0) refunds_c, COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount END),0) refunds_v,
      COALESCE(SUM(CASE WHEN status = 'chargedback' THEN 1 END),0) cb_c, COALESCE(SUM(CASE WHEN status = 'chargedback' THEN amount END),0) cb_v,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 END),0) kept_c, COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END),0) kept_v,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN ${NET} END),0) net,
      COALESCE(SUM(CASE WHEN status = 'paid' AND net_amount IS NOT NULL THEN 1 END),0) net_real_c
    FROM sales WHERE status IN ${APPROVED} AND ${SALE_DAY} >= ? AND ${SALE_DAY} < ?`, a, b);
  const pend = db.get("SELECT COUNT(*) c, COALESCE(SUM(amount),0) v FROM sales WHERE status = 'waiting_payment' AND created_at >= ? AND created_at < ?", a, b);
  const refused = db.get("SELECT COUNT(*) c FROM sales WHERE status = 'refused' AND created_at >= ? AND created_at < ?", a, b).c;
  const abandoned = db.get('SELECT COUNT(*) c FROM leads WHERE created_at >= ? AND created_at < ? AND converted = 0', a, b).c;
  const spend = db.get('SELECT COALESCE(SUM(spend),0) v, COALESCE(SUM(impressions),0) imp, COALESCE(SUM(clicks),0) clk FROM ad_spend WHERE date >= ? AND date <= ?', from, to);
  const fees = Math.max(0, r.kept_v - r.net);
  const profit = r.net - spend.v;
  return {
    gross: r.gross, approved: r.approved, ticket: r.approved ? r.gross / r.approved : 0,
    refunds: { c: r.refunds_c, v: r.refunds_v }, chargebacks: { c: r.cb_c, v: r.cb_v },
    refundRate: r.approved ? (r.refunds_c + r.cb_c) / r.approved : 0,
    kept: { c: r.kept_c, v: r.kept_v }, fees, net: r.net, netRealShare: r.kept_c ? r.net_real_c / r.kept_c : 0,
    pending: { c: pend.c, v: pend.v }, refused, abandoned,
    payRate: r.approved + pend.c + refused ? r.approved / (r.approved + pend.c + refused) : null,
    spend: spend.v, impressions: spend.imp, clicks: spend.clk,
    profit, roas: spend.v ? r.gross / spend.v : null, roi: spend.v ? profit / spend.v : null,
    cac: spend.v && r.approved ? spend.v / r.approved : null, margin: r.gross ? profit / r.gross : null,
  };
}

/** Mapeia o ID de produto da Greenn para o produto da plataforma */
function productMap() {
  const map = new Map();
  for (const p of db.all('SELECT id, name, greenn_ids FROM products')) {
    for (const g of String(p.greenn_ids || '').split(',').map((x) => x.trim()).filter(Boolean)) map.set(g, p);
  }
  return map;
}

export function financeReport(q) {
  const { from, to, days } = parseRange(q);
  const prevTo = addDays(from, -1), prevFrom = addDays(prevTo, -(days - 1));
  const cur = totals(from, to);
  const prev = totals(prevFrom, prevTo);
  const a = startIso(from), b = startIso(addDays(to, 1));
  const { sql: NET, pctFee, fixed } = netExpr();
  const DAY = `substr(datetime(${SALE_DAY}, '-${TZ_OFFSET_H} hours'), 1, 10)`;

  const salesDaily = db.all(`SELECT ${DAY} d, COUNT(*) c, SUM(amount) gross, SUM(CASE WHEN status = 'paid' THEN ${NET} ELSE 0 END) net
    FROM sales WHERE status IN ${APPROVED} AND ${SALE_DAY} >= ? AND ${SALE_DAY} < ? GROUP BY d`, a, b);
  const spendDaily = db.all('SELECT date d, SUM(spend) v FROM ad_spend WHERE date >= ? AND date <= ? GROUP BY date', from, to);
  const sm = new Map(salesDaily.map((x) => [x.d, x])), pm = new Map(spendDaily.map((x) => [x.d, x.v]));
  const series = [];
  for (let d = from; d <= to; d = addDays(d, 1)) series.push({ d, c: sm.get(d)?.c || 0, gross: sm.get(d)?.gross || 0, net: sm.get(d)?.net || 0, spend: pm.get(d) || 0 });

  // por produto (agrupa pelo produto da plataforma quando o ID da Greenn está vinculado)
  const pmap = productMap();
  const rows = db.all(`SELECT provider_product_id gid, MAX(product_name) name, COUNT(*) c, SUM(amount) gross,
      SUM(CASE WHEN status IN ('refunded','chargedback') THEN amount ELSE 0 END) refunds, SUM(CASE WHEN status = 'paid' THEN ${NET} ELSE 0 END) net
    FROM sales WHERE status IN ${APPROVED} AND ${SALE_DAY} >= ? AND ${SALE_DAY} < ? GROUP BY provider_product_id`, a, b);
  const byP = new Map();
  for (const r of rows) {
    const p = pmap.get(String(r.gid));
    const key = p ? `p${p.id}` : `g${r.gid}`;
    const o = byP.get(key) || { productId: p?.id || null, name: p?.name || r.name || `Produto Greenn ${r.gid}`, c: 0, gross: 0, refunds: 0, net: 0, spend: 0 };
    o.c += r.c; o.gross += r.gross; o.refunds += r.refunds; o.net += r.net; byP.set(key, o);
  }
  let spendUnassigned = 0;
  for (const s of db.all('SELECT product_id, SUM(spend) v FROM ad_spend WHERE date >= ? AND date <= ? GROUP BY product_id', from, to)) {
    if (!s.product_id) { spendUnassigned += s.v; continue; }
    const key = `p${s.product_id}`;
    const o = byP.get(key) || { productId: s.product_id, name: db.get('SELECT name FROM products WHERE id = ?', s.product_id)?.name || 'Produto', c: 0, gross: 0, refunds: 0, net: 0, spend: 0 };
    o.spend += s.v; byP.set(key, o);
  }
  const byProduct = [...byP.values()].map((o) => ({ ...o, roas: o.spend ? o.gross / o.spend : null })).sort((x, y) => y.gross - x.gross);

  const byMethod = db.all(`SELECT UPPER(COALESCE(method, '')) method, COUNT(*) c, SUM(amount) gross, SUM(CASE WHEN status IN ('refunded','chargedback') THEN 1 ELSE 0 END) refunds
    FROM sales WHERE status IN ${APPROVED} AND ${SALE_DAY} >= ? AND ${SALE_DAY} < ? GROUP BY 1 ORDER BY gross DESC`, a, b);
  const bySource = db.all(`SELECT COALESCE(NULLIF(utm_source,''), '') source, COALESCE(NULLIF(utm_campaign,''), '') campaign, COUNT(*) c, SUM(amount) gross
    FROM sales WHERE status IN ${APPROVED} AND ${SALE_DAY} >= ? AND ${SALE_DAY} < ? GROUP BY 1, 2 ORDER BY gross DESC LIMIT 12`, a, b);
  const refundsList = db.all(`SELECT s.id, s.user_id, s.status, s.amount, s.product_name, s.provider_product_id, s.refunded_at, s.updated_at, COALESCE(u.name, s.client_name) name, s.email
    FROM sales s LEFT JOIN users u ON u.id = s.user_id WHERE s.status IN ('refunded','chargedback') AND COALESCE(s.refunded_at, s.updated_at) >= ? AND COALESCE(s.refunded_at, s.updated_at) < ?
    ORDER BY COALESCE(s.refunded_at, s.updated_at) DESC LIMIT 10`, a, b);

  return { from, to, days, prevFrom, prevTo, cur, prev, series, byProduct, spendUnassigned, byMethod, bySource, refundsList, fee: { percent: pctFee, fixed } };
}

// ---------- gastos de marketing ----------
const round2 = (n) => Math.round(n * 100) / 100;

export function addSpend(body) {
  const from = body.date, to = body.date_to || body.date;
  if (!isDate(from) || !isDate(to) || to < from) fail(400, 'Informe a data (ou o período) do gasto.');
  const total = typeof body.spend === 'number' ? body.spend : parseNum(body.spend);
  if (!Number.isFinite(total) || total <= 0) fail(400, 'Informe o valor investido.');
  const n = dayDiff(from, to) + 1;
  if (n > 366) fail(400, 'Período máximo: 1 ano.');
  const productId = body.product_id ? Number(body.product_id) : null;
  if (productId && !db.get('SELECT 1 FROM products WHERE id = ?', productId)) fail(400, 'Produto inválido.');
  const per = Math.floor((total / n) * 100) / 100;
  const t = now();
  const batch = crypto.randomBytes(8).toString('hex');
  db.tx(() => {
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? round2(total - per * (n - 1)) : per;
      db.run('INSERT INTO ad_spend (source, date, campaign_id, campaign_name, product_id, spend, note, batch, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        'manual', addDays(from, i), '', String(body.campaign_name || '').trim().slice(0, 160) || null, productId, v, String(body.note || '').trim().slice(0, 300) || null, batch, t, t);
    }
  });
  return { days: n, total, batch };
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** Número em formato brasileiro ("1.234,56") ou internacional ("1,234.56" / "1234.56") */
export function parseNum(v) {
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = s.replace(/\.(?=\d{3})/g, '').replace(',', '.');
  else if (ld > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : first.includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
/** Datas do relatório da Meta: 2026-11-01, 01/11/2026 */
function parseDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/** Importa o CSV exportado do Gerenciador de Anúncios da Meta (colunas em português ou inglês) */
export function importMetaCsv(text, productId = null) {
  const rows = parseCsv(text);
  if (rows.length < 2) fail(400, 'O arquivo está vazio ou não é um CSV.');
  const head = rows[0].map(norm);
  const col = (...names) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const iStart = col('dia', 'day', 'data', 'inicio dos relatorios', 'reporting starts', 'date');
  const iEnd = col('termino dos relatorios', 'reporting ends');
  const iCamp = col('nome da campanha', 'campaign name', 'campanha', 'nome do conjunto de anuncios', 'ad set name', 'nome do anuncio', 'ad name');
  const iSpend = col('valor usado', 'amount spent', 'valor gasto', 'gasto', 'investimento', 'spend');
  const iImp = col('impressoes', 'impressions');
  const iClk = col('cliques no link', 'link clicks', 'cliques (todos)', 'clicks (all)', 'cliques', 'clicks');
  const iBuy = col('compras', 'purchases', 'compras no site', 'website purchases');
  if (iStart < 0 || iSpend < 0) fail(400, 'Não encontrei as colunas de data e de valor usado. No Gerenciador de Anúncios, exporte com "Detalhamento › Por tempo › Dia" e a coluna "Valor usado".');
  if (productId && !db.get('SELECT 1 FROM products WHERE id = ?', Number(productId))) fail(400, 'Produto inválido.');
  const t = now();
  let imported = 0, total = 0, skipped = 0;
  const agg = new Map();
  for (const r of rows.slice(1)) {
    const d0 = parseDate(r[iStart]); const d1 = iEnd >= 0 ? parseDate(r[iEnd]) || d0 : d0;
    const spend = parseNum(r[iSpend]);
    if (!d0 || spend <= 0) { skipped++; continue; }
    const camp = iCamp >= 0 ? String(r[iCamp] || '').trim().slice(0, 160) : '';
    const n = Math.max(1, Math.min(366, dayDiff(d0, d1 < d0 ? d0 : d1) + 1));
    for (let i = 0; i < n; i++) {
      const key = `${addDays(d0, i)}|${camp}`;
      const o = agg.get(key) || { date: addDays(d0, i), camp, spend: 0, imp: 0, clk: 0, buy: 0 };
      o.spend += spend / n; o.imp += (iImp >= 0 ? parseNum(r[iImp]) : 0) / n; o.clk += (iClk >= 0 ? parseNum(r[iClk]) : 0) / n; o.buy += (iBuy >= 0 ? parseNum(r[iBuy]) : 0) / n;
      agg.set(key, o);
    }
  }
  db.tx(() => {
    for (const o of agg.values()) {
      db.run(`INSERT INTO ad_spend (source, date, campaign_id, campaign_name, product_id, spend, impressions, clicks, purchases, created_at, updated_at) VALUES ('meta_csv',?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(source, date, campaign_id) WHERE source <> 'manual' DO UPDATE SET spend = excluded.spend, impressions = excluded.impressions, clicks = excluded.clicks, purchases = excluded.purchases,
          campaign_name = excluded.campaign_name, product_id = COALESCE(excluded.product_id, ad_spend.product_id), updated_at = excluded.updated_at`,
        o.date, o.camp, o.camp || null, productId ? Number(productId) : null, round2(o.spend), Math.round(o.imp), Math.round(o.clk), Math.round(o.buy), t, t);
      imported++; total += o.spend;
    }
  });
  if (!imported) fail(400, 'Nenhuma linha com gasto encontrada no arquivo.');
  const dates = [...agg.values()].map((o) => o.date).sort();
  return { imported, skipped, total: round2(total), from: dates[0], to: dates.at(-1) };
}

/** Gastos do período agrupados: cada lançamento manual (mesmo dividido em dias) ou cada campanha importada vira uma linha */
export function listSpend(q) {
  const { from, to } = parseRange(q);
  return db.all(`SELECT a.source, CASE WHEN a.source = 'manual' THEN COALESCE(a.batch, 'id' || a.id) ELSE a.campaign_id END grp,
      MAX(COALESCE(a.campaign_name, a.note)) campaign_name, a.product_id, p.name product_name, MIN(a.date) date_from, MAX(a.date) date_to, COUNT(*) days,
      SUM(a.spend) spend, SUM(a.clicks) clicks, SUM(a.impressions) impressions
    FROM ad_spend a LEFT JOIN products p ON p.id = a.product_id WHERE a.date >= ? AND a.date <= ?
    GROUP BY a.source, grp, a.product_id ORDER BY date_to DESC, spend DESC LIMIT 300`, from, to);
}

/** Exclui um grupo: o lançamento manual inteiro, ou a campanha importada dentro do período */
export function deleteSpend(q) {
  const { from, to } = parseRange(q);
  const grp = String(q.grp ?? '');
  if (q.source === 'manual') {
    const r = grp.startsWith('id') && /^id\d+$/.test(grp) ? db.run("DELETE FROM ad_spend WHERE source = 'manual' AND id = ?", Number(grp.slice(2))) : db.run("DELETE FROM ad_spend WHERE source = 'manual' AND batch = ?", grp);
    return r.changes;
  }
  if (!['meta_csv', 'meta'].includes(q.source)) fail(400, 'Origem inválida.');
  return db.run('DELETE FROM ad_spend WHERE source = ? AND campaign_id = ? AND date >= ? AND date <= ?', q.source, grp, from, to).changes;
}
