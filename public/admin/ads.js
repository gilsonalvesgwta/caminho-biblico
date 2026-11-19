// Tela de Anúncios (Meta Ads + vendas reais por UTM), no estilo Utmify: filtros, visões, KPIs, gráficos, funil e tabelas.
import { api, esc, toast, modal, withLoading, fmtDateTime, relTime, $, $$ } from '/shared/ui.js';
import { brl } from '/shared/calc.js';

// ---------- catálogo de métricas ----------
const G = { res: 'Resultado', inv: 'Investimento', traf: 'Tráfego', fun: 'Página e checkout', cri: 'Criativo', meta: 'Pixel da Meta', geral: 'Geral da plataforma' };
// fmt: money | int | pct | x | num · good: up | down | (neutro)
export const KPIS = {
  revenue: { l: 'Faturamento', g: 'res', f: 'money', good: 'up', h: 'Vendas aprovadas atribuídas aos anúncios (UTM)' },
  net: { l: 'Faturamento líquido', g: 'res', f: 'money', good: 'up', h: 'Faturamento menos taxas da plataforma de pagamento' },
  profit: { l: 'Lucro', g: 'res', f: 'money', good: 'up', h: 'Líquido − investimento' },
  roas: { l: 'ROAS', g: 'res', f: 'x', good: 'up', h: 'Faturamento ÷ investimento' },
  roi: { l: 'ROI', g: 'res', f: 'pct', good: 'up', h: '(Líquido − investimento) ÷ investimento' },
  margin: { l: 'Margem', g: 'res', f: 'pct', good: 'up', h: 'Lucro ÷ faturamento' },
  sales: { l: 'Vendas', g: 'res', f: 'int', good: 'up', h: 'Vendas aprovadas atribuídas' },
  cpa: { l: 'Custo por venda (CPA)', g: 'res', f: 'money', good: 'down', h: 'Investimento ÷ vendas' },
  ticket: { l: 'Ticket médio', g: 'res', f: 'money', good: 'up', h: 'Faturamento ÷ vendas' },
  refunds: { l: 'Reembolsos', g: 'res', f: 'int', good: 'down', h: 'Vendas atribuídas reembolsadas ou com chargeback' },
  spend: { l: 'Investimento', g: 'inv', f: 'money', h: 'Valor usado na Meta' },
  cpm: { l: 'CPM', g: 'inv', f: 'money', good: 'down', h: 'Custo por mil impressões' },
  cpc: { l: 'CPC (link)', g: 'inv', f: 'money', good: 'down', h: 'Investimento ÷ cliques no link' },
  cpc_all: { l: 'CPC (todos)', g: 'inv', f: 'money', good: 'down', h: 'Investimento ÷ todos os cliques' },
  frequency: { l: 'Frequência', g: 'inv', f: 'num', h: 'Impressões ÷ alcance (soma diária, aproximada)' },
  impressions: { l: 'Impressões', g: 'traf', f: 'int', good: 'up' },
  reach: { l: 'Alcance', g: 'traf', f: 'int', good: 'up', h: 'Soma do alcance diário (aproximado)' },
  link_clicks: { l: 'Cliques no link', g: 'traf', f: 'int', good: 'up' },
  clicks: { l: 'Cliques (todos)', g: 'traf', f: 'int', good: 'up' },
  ctr: { l: 'CTR (link)', g: 'traf', f: 'pct', good: 'up', h: 'Cliques no link ÷ impressões' },
  ctr_all: { l: 'CTR (todos)', g: 'traf', f: 'pct', good: 'up' },
  lpv: { l: 'Visualizações da página', g: 'fun', f: 'int', good: 'up', h: 'Landing page views' },
  connect_rate: { l: 'Connect rate', g: 'fun', f: 'pct', good: 'up', h: 'Visualizações da página ÷ cliques no link' },
  cost_lpv: { l: 'Custo por visualização', g: 'fun', f: 'money', good: 'down' },
  initiate_checkout: { l: 'Checkouts iniciados', g: 'fun', f: 'int', good: 'up' },
  checkout_rate: { l: 'Taxa de checkout', g: 'fun', f: 'pct', good: 'up', h: 'Checkouts ÷ visualizações da página' },
  cost_ic: { l: 'Custo por checkout', g: 'fun', f: 'money', good: 'down' },
  checkout_conv: { l: 'Conversão do checkout', g: 'fun', f: 'pct', good: 'up', h: 'Vendas ÷ checkouts iniciados' },
  page_conv: { l: 'Conversão da página', g: 'fun', f: 'pct', good: 'up', h: 'Vendas ÷ visualizações da página' },
  add_to_cart: { l: 'Adições ao carrinho', g: 'fun', f: 'int', good: 'up' },
  video_3s: { l: 'Visualizações de 3s', g: 'cri', f: 'int', good: 'up' },
  hook_rate: { l: 'Hook rate', g: 'cri', f: 'pct', good: 'up', h: 'Visualizações de 3s ÷ impressões (o gancho prende?)' },
  thruplay: { l: 'ThruPlays', g: 'cri', f: 'int', good: 'up', h: 'Vídeo assistido até o fim ou 15s' },
  hold_rate: { l: 'Hold rate', g: 'cri', f: 'pct', good: 'up', h: 'ThruPlays ÷ visualizações de 3s (o vídeo segura?)' },
  purchases: { l: 'Compras (Meta)', g: 'meta', f: 'int', good: 'up', h: 'Compras informadas pelo pixel da Meta' },
  purchase_value: { l: 'Valor de compras (Meta)', g: 'meta', f: 'money', good: 'up' },
  meta_roas: { l: 'ROAS (Meta)', g: 'meta', f: 'x', good: 'up', h: 'Valor de compras do pixel ÷ investimento' },
  meta_cpa: { l: 'CPA (Meta)', g: 'meta', f: 'money', good: 'down' },
  leads: { l: 'Leads', g: 'meta', f: 'int', good: 'up' },
  cpl: { l: 'Custo por lead', g: 'meta', f: 'money', good: 'down' },
  b_revenue: { l: 'Faturamento total', g: 'geral', f: 'money', good: 'up', h: 'Todas as vendas aprovadas da plataforma, com ou sem UTM', totalOnly: true },
  b_roas: { l: 'ROAS geral', g: 'geral', f: 'x', good: 'up', h: 'Faturamento total ÷ investimento', totalOnly: true },
  b_profit: { l: 'Lucro geral', g: 'geral', f: 'money', good: 'up', h: 'Líquido de todas as vendas − investimento', totalOnly: true },
};
const BUILTIN = [
  { id: 'geral', name: 'Visão geral', level: 'campaigns', kpis: ['revenue', 'spend', 'roas', 'profit', 'sales', 'cpa', 'roi', 'ticket', 'ctr', 'cpm', 'connect_rate', 'page_conv'], columns: ['spend', 'revenue', 'sales', 'roas', 'cpa', 'profit', 'ctr', 'cpc', 'cpm', 'connect_rate', 'page_conv'] },
  { id: 'criativos', name: 'Criativos', level: 'ads', kpis: ['spend', 'hook_rate', 'hold_rate', 'ctr', 'cpc', 'cpm', 'frequency', 'video_3s', 'thruplay', 'link_clicks', 'roas', 'cpa'], columns: ['spend', 'hook_rate', 'hold_rate', 'ctr', 'cpc', 'cpm', 'frequency', 'sales', 'roas', 'cpa'] },
  { id: 'funil', name: 'Funil', level: 'campaigns', kpis: ['impressions', 'link_clicks', 'lpv', 'initiate_checkout', 'sales', 'ctr', 'connect_rate', 'checkout_rate', 'checkout_conv', 'page_conv', 'cost_lpv', 'cost_ic'], columns: ['spend', 'link_clicks', 'lpv', 'connect_rate', 'initiate_checkout', 'checkout_conv', 'sales', 'page_conv', 'cpa'] },
  { id: 'comparativo', name: 'Meta × Real', level: 'campaigns', kpis: ['spend', 'purchases', 'sales', 'purchase_value', 'revenue', 'meta_roas', 'roas', 'meta_cpa', 'cpa', 'b_revenue', 'b_roas', 'b_profit'], columns: ['spend', 'purchases', 'sales', 'purchase_value', 'revenue', 'meta_roas', 'roas', 'meta_cpa', 'cpa'] },
];

const nf = (v, d = 0) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export function fmt(key, v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const f = KPIS[key]?.f || 'num';
  if (f === 'money') return brl(v);
  if (f === 'int') return nf(Math.round(v));
  if (f === 'pct') return `${nf(v * 100, Math.abs(v) < 0.1 ? 2 : 1)}%`;
  if (f === 'x') return `${nf(v, 2)}x`;
  return nf(v, 2);
}
const valueOf = (key, totals, blended) => (key.startsWith('b_') ? (blended ? { b_revenue: blended.revenue, b_roas: blended.roas, b_profit: blended.profit }[key] : null) : totals[key]);

// ---------- datas ----------
const localDay = (delta = 0) => new Date(Date.now() - 3 * 3600e3 + delta * 86400e3).toISOString().slice(0, 10);
const PRESETS = [['today', 'Hoje'], ['yesterday', 'Ontem'], ['7', '7 dias'], ['14', '14 dias'], ['30', '30 dias'], ['month', 'Este mês'], ['last', 'Mês passado'], ['custom', 'Personalizado']];
function rangeOf(f) {
  const t = localDay(0); const [y, m] = t.split('-').map(Number); const first = (yy, mm) => `${yy}-${String(mm).padStart(2, '0')}-01`;
  switch (f.preset) {
    case 'today': return [t, t];
    case 'yesterday': return [localDay(-1), localDay(-1)];
    case '7': return [localDay(-6), t];
    case '14': return [localDay(-13), t];
    case 'month': return [first(y, m), t];
    case 'last': { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return [first(py, pm), new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10)]; }
    case 'custom': return [f.from || localDay(-29), f.to || t];
    default: return [localDay(-29), t];
  }
}
const dmy = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const inHours = (iso) => { if (!iso) return ''; const ms = Date.parse(iso) - Date.now(); if (ms <= 60e3) return 'em instantes'; const tm = Math.round(ms / 60e3), h = Math.floor(tm / 60), m = tm % 60; return h ? `em ${h} h${m ? ` ${m} min` : ''}` : `em ${m} min`; };
const STATUS = { ACTIVE: ['Ativo', 'on'], PAUSED: ['Pausado', 'off'], CAMPAIGN_PAUSED: ['Campanha pausada', 'off'], ADSET_PAUSED: ['Conjunto pausado', 'off'], DELETED: ['Excluído', 'gone'], ARCHIVED: ['Arquivado', 'gone'], IN_PROCESS: ['Em análise', 'wait'], WITH_ISSUES: ['Com problemas', 'warn'], DISAPPROVED: ['Reprovado', 'warn'], PENDING_REVIEW: ['Em análise', 'wait'] };
const statusPill = (s) => { const [l, c] = STATUS[s] || [s ? s.toLowerCase() : '—', 'gone']; return `<span class="ad-st ${c}"><i></i>${esc(l)}</span>`; };

// ---------- estado ----------
let S = null; // { f: filtros, viewId, level, sort, q, prefs, report, products, tab }
const defaultPrefs = () => ({ v: 1, defaults: { preset: '7', account: '', status: '' }, views: [], overrides: {} });
const allViews = () => [...BUILTIN.map((b) => ({ ...b, ...(S.prefs.overrides[b.id] || {}), builtin: true })), ...S.prefs.views];
const curView = () => allViews().find((v) => v.id === S.viewId) || allViews()[0];
const savePrefs = () => api('/api/admin/meta/prefs', { method: 'PUT', body: { prefs: S.prefs } }).catch((e) => toast(e.message, { error: true }));

export async function pageAds({ head, can, BASE, products }) {
  const main = $('#main');
  if (!can('admin')) { main.innerHTML = head('Anúncios') + '<div class="alert alert-warn">Apenas administradores veem os anúncios.</div>'; return; }
  if (!S) {
    const { prefs } = await api('/api/admin/meta/prefs');
    const p = { ...defaultPrefs(), ...(prefs || {}) };
    S = { prefs: p, f: { ...p.defaults, campaign: '', adset: '', ad: '' }, viewId: p.defaults.view || 'geral', level: null, sort: { key: 'spend', dir: -1 }, q: '', tab: 'painel' };
  }
  S.products = products;
  S.ctx = { head, can, BASE };
  const st = await api('/api/admin/meta/status');
  S.status = st;
  if (!st.connected && !st.accounts.length) { S.tab = 'conexao'; return renderConnection(); }
  return S.tab === 'conexao' ? renderConnection() : renderDash();
}

function shell(body) {
  const st = S.status;
  const chip = st.syncing ? '<span class="ad-sync busy"><i></i>Sincronizando com a Meta…</span>'
    : st.connected ? `<span class="ad-sync ${S.status.log?.[0]?.status === 'error' ? 'err' : ''}" title="${st.lastSyncAt ? `Última sincronização: ${fmtDateTime(st.lastSyncAt)}` : ''}"><i></i>${st.lastSyncAt ? `Atualizado ${relTime(st.lastSyncAt)}` : 'Aguardando a primeira sincronização'}${st.nextSyncAt ? ` · próxima ${inHours(st.nextSyncAt)}` : ''}</span>`
      : '<span class="ad-sync err"><i></i>Meta desconectada</span>';
  $('#main').innerHTML = S.ctx.head('Anúncios', 'Meta Ads com as vendas reais da plataforma, atribuídas pelos UTMs · horário de Brasília',
    `${chip}${st.connected ? `<button class="btn btn-soft btn-sm" id="ad-sync" ${st.syncing ? 'disabled' : ''}>Sincronizar agora</button>` : ''}`) + `
    <div class="tabs ad-tabs"><button data-tab="painel" class="${S.tab === 'painel' ? 'on' : ''}">Painel</button><button data-tab="conexao" class="${S.tab === 'conexao' ? 'on' : ''}">Conexão e configurações</button></div>${body}`;
  $$('[data-tab]').forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; S.tab === 'conexao' ? renderConnection() : renderDash(); }));
  $('#ad-sync')?.addEventListener('click', () => startSync(false));
  if (st.syncing) pollSync();
}

async function startSync(full) {
  try { await api('/api/admin/meta/sync', { method: 'POST', body: { full } }); toast(full ? 'Recarregando todo o histórico. Isso pode levar alguns minutos.' : 'Sincronização iniciada'); S.status.syncing = true; S.tab === 'conexao' ? renderConnection() : renderDash(); }
  catch (e) { toast(e.message, { error: true }); }
}
let pollT = null;
function pollSync() {
  clearTimeout(pollT);
  pollT = setTimeout(async () => {
    if (!document.querySelector('.ad-tabs')) return; // saiu da tela
    const st = await api('/api/admin/meta/status').catch(() => null);
    if (!st) return;
    if (st.syncing) return pollSync();
    S.status = st;
    const last = st.log?.[0];
    if (last) toast(last.status === 'ok' ? 'Dados da Meta atualizados' : last.status === 'partial' ? 'Atualizado com avisos. Veja em Conexão.' : `Falha na sincronização: ${last.message || ''}`, { error: last.status === 'error', ms: 5000 });
    S.tab === 'conexao' ? renderConnection() : renderDash();
  }, 3000);
}

// ---------- painel ----------
async function renderDash() {
  const [from, to] = rangeOf(S.f);
  const q = new URLSearchParams({ from, to, account: S.f.account || '', campaign: S.f.campaign || '', adset: S.f.adset || '', ad: S.f.ad || '', status: S.f.status || '' });
  shell('<div class="ad-loading"><span class="ad-spin"></span> Carregando métricas…</div>');
  let r;
  try { r = await api(`/api/admin/meta/report?${q}`); } catch (e) { $('.ad-loading').outerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; return; }
  S.report = r;
  const v = curView();
  if (!S.level) S.level = v.level || 'campaigns';
  const o = r.options;
  const camps = o.campaigns.filter((c) => !S.f.account || c.account_id === S.f.account);
  const sets = o.adsets.filter((x) => (!S.f.campaign || x.campaign_id === S.f.campaign) && (!S.f.account || camps.some((c) => c.id === x.campaign_id)));
  const ads = o.ads.filter((x) => (!S.f.adset || x.adset_id === S.f.adset) && (!S.f.campaign || x.campaign_id === S.f.campaign) && (!S.f.account || camps.some((c) => c.id === x.campaign_id)));
  const sel = (id, label, all, items, val) => `<label class="ad-sel"><span>${label}</span><select class="input" id="${id}"><option value="">${all}</option>${items.map((x) => `<option value="${esc(x.id)}" ${x.id === val ? 'selected' : ''}>${esc(x.name)}${x.status && x.status !== 'ACTIVE' ? ' · inativo' : ''}</option>`).join('')}</select></label>`;
  const noData = !r.sync.hasData;
  const body = `
    <div class="panel ad-filters">
      <div class="ad-periods">${PRESETS.map(([k, l]) => `<button data-pre="${k}" class="${S.f.preset === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${S.f.preset === 'custom' ? `<div class="ad-custom"><input class="input" type="date" id="ad-from" value="${from}" max="${localDay(0)}"><span>até</span><input class="input" type="date" id="ad-to" value="${to}" max="${localDay(0)}"><button class="btn btn-primary btn-sm" id="ad-apply">Aplicar</button></div>` : ''}
      <div class="ad-selects">
        ${sel('f-account', 'Conta', 'Todas as contas', o.accounts.filter((a) => a.enabled), S.f.account)}
        ${sel('f-campaign', 'Campanha', 'Todas as campanhas', camps, S.f.campaign)}
        ${sel('f-adset', 'Conjunto', 'Todos os conjuntos', sets, S.f.adset)}
        ${sel('f-ad', 'Anúncio', 'Todos os anúncios', ads, S.f.ad)}
        <label class="ad-sel ad-sel-s"><span>Status</span><select class="input" id="f-status"><option value="">Todos</option><option value="active" ${S.f.status === 'active' ? 'selected' : ''}>Ativos</option><option value="paused" ${S.f.status === 'paused' ? 'selected' : ''}>Inativos</option></select></label>
      </div>
      <div class="ad-factions">
        <span class="faint">${dmy(r.from)}${r.from !== r.to ? ` a ${dmy(r.to)}` : ''} · comparado a ${dmy(r.prevFrom)}${r.prevFrom !== r.prevTo ? `–${dmy(r.prevTo)}` : ''}</span>
        ${S.f.campaign || S.f.adset || S.f.ad || S.f.account ? '<button class="btn btn-ghost btn-sm" id="f-clear">Limpar filtros</button>' : ''}
        <button class="btn btn-ghost btn-sm" id="f-default" title="Período, conta e status abrem assim da próxima vez">Salvar como padrão</button>
      </div>
    </div>
    ${noData ? `<div class="panel panel-b ad-empty"><b>${S.status.syncing ? 'Buscando os dados da Meta…' : 'Ainda não há dados da Meta.'}</b><p class="muted">${S.status.syncing ? 'A primeira carga traz o histórico configurado e pode levar alguns minutos. Esta tela atualiza sozinha.' : 'Conecte a conta de anúncios em "Conexão e configurações".'}</p></div>` : ''}
    <div class="ad-views">
      <div class="ad-vtabs">${allViews().map((x) => `<button data-view="${esc(x.id)}" class="${x.id === v.id ? 'on' : ''}">${esc(x.name)}</button>`).join('')}<button class="ad-vadd" id="v-new" title="Criar visão personalizada">+ Nova visão</button></div>
      <button class="btn btn-soft btn-sm" id="v-edit">Personalizar</button>
    </div>
    <div class="ad-kpis">${v.kpis.map((k, i) => kpiCard(k, r, i === 0)).join('')}</div>
    ${r.unattributed.sales ? `<div class="ad-note"><b>${r.unattributed.sales} venda(s) · ${brl(r.unattributed.revenue)}</b> sem UTM de anúncio no período. Elas entram no "Faturamento total", mas não aparecem por campanha. <a href="#" id="go-utm">Como configurar os parâmetros de URL →</a></div>` : ''}
    <div class="cols">
      <div class="panel c8"><div class="panel-h"><h3>Investimento × faturamento</h3><div class="legend"><span><i style="background:#C9D3DC"></i>Investimento</span><span><i style="background:#1F6B52"></i>Faturamento</span><span><i class="ln"></i>ROAS</span></div></div><div class="panel-b"><div class="chart tall" id="ad-chart"></div></div></div>
      <div class="panel c4"><div class="panel-h"><h3>Funil</h3><span class="faint">da impressão à venda</span></div><div class="panel-b">${funnelHtml(r.totals)}</div></div>
    </div>
    <div class="panel ad-table-p">
      <div class="panel-h ad-th">
        <div class="ad-levels">${[['campaigns', 'Campanhas'], ['adsets', 'Conjuntos'], ['ads', 'Anúncios']].map(([k, l]) => `<button data-level="${k}" class="${S.level === k ? 'on' : ''}">${l} <span>${r.rows[k].length}</span></button>`).join('')}</div>
        <div class="actions"><input class="input ad-search" id="ad-q" placeholder="Buscar por nome" value="${esc(S.q)}"><button class="btn btn-ghost btn-sm" id="ad-csv">Exportar CSV</button></div>
      </div>
      <div class="tbl-wrap" id="ad-tbl"></div>
    </div>`;
  shell(body);
  adsChart($('#ad-chart'), r.series);
  renderTable();
  // eventos
  $$('[data-pre]').forEach((b) => (b.onclick = () => { S.f.preset = b.dataset.pre; if (S.f.preset === 'custom' && !S.f.from) { S.f.from = r.from; S.f.to = r.to; } renderDash(); }));
  $('#ad-apply')?.addEventListener('click', () => { S.f.from = $('#ad-from').value; S.f.to = $('#ad-to').value; if (!S.f.from || !S.f.to) return toast('Escolha as duas datas', { error: true }); renderDash(); });
  $('#f-account').onchange = (e) => { S.f.account = e.target.value; S.f.campaign = S.f.adset = S.f.ad = ''; renderDash(); };
  $('#f-campaign').onchange = (e) => { S.f.campaign = e.target.value; S.f.adset = S.f.ad = ''; if (S.f.campaign && S.level === 'campaigns') S.level = 'adsets'; renderDash(); };
  $('#f-adset').onchange = (e) => { S.f.adset = e.target.value; S.f.ad = ''; if (S.f.adset) S.level = 'ads'; renderDash(); };
  $('#f-ad').onchange = (e) => { S.f.ad = e.target.value; if (S.f.ad) S.level = 'ads'; renderDash(); };
  $('#f-status').onchange = (e) => { S.f.status = e.target.value; renderDash(); };
  $('#f-clear')?.addEventListener('click', () => { S.f.account = S.f.campaign = S.f.adset = S.f.ad = ''; S.level = curView().level; renderDash(); });
  $('#f-default').onclick = async () => { S.prefs.defaults = { preset: S.f.preset, account: S.f.account, status: S.f.status, view: S.viewId, from: S.f.from, to: S.f.to }; await savePrefs(); toast('Filtros salvos como padrão'); };
  $$('[data-view]').forEach((b) => (b.onclick = () => { S.viewId = b.dataset.view; S.level = curView().level || S.level; S.sort = { key: curView().columns[0] || 'spend', dir: -1 }; renderDash(); }));
  $('#v-new').onclick = () => editView(true);
  $('#v-edit').onclick = () => editView(false);
  $$('[data-level]').forEach((b) => (b.onclick = () => { S.level = b.dataset.level; $$('[data-level]').forEach((x) => x.classList.toggle('on', x === b)); renderTable(); }));
  $('#ad-q').addEventListener('input', (e) => { S.q = e.target.value; renderTable(); });
  $('#ad-csv').onclick = exportCsv;
  $('#go-utm')?.addEventListener('click', (e) => { e.preventDefault(); S.tab = 'conexao'; renderConnection().then(() => $('#utm-box')?.scrollIntoView({ behavior: 'smooth' })); });
}

function kpiCard(k, r, hero) {
  const def = KPIS[k]; if (!def) return '';
  const cur = valueOf(k, r.totals, r.blended);
  let prev = valueOf(k, r.prev, null);
  if (k === 'b_revenue' && r.blended) prev = r.blended.prevRevenue;
  let delta = '';
  if (cur !== null && cur !== undefined && prev !== null && prev !== undefined && !k.startsWith('b_r') && k !== 'b_profit') {
    const ch = prev ? (cur - prev) / Math.abs(prev) : cur ? 1 : 0;
    if (Math.abs(ch) >= 0.0005) { const good = def.good === 'up' ? ch > 0 : def.good === 'down' ? ch < 0 : null; delta = `<span class="delta ${good === null ? '' : good ? 'up' : 'down'}">${ch > 0 ? '▲' : '▼'} ${prev ? `${nf(Math.abs(ch) * 100, 0)}%` : 'novo'}</span>`; }
  }
  const neg = (k === 'profit' || k === 'b_profit' || k === 'roi') && cur < 0;
  return `<div class="ad-kpi ${hero ? 'hero' : ''}" title="${esc(def.h || '')}"><div class="l">${esc(def.l)}${delta}</div><div class="v ${neg ? 'neg' : ''}">${fmt(k, cur)}</div><div class="s">${def.totalOnly && !r.blended ? 'só sem filtro de campanha' : esc(G[def.g])}</div></div>`;
}

function funnelHtml(t) {
  const steps = [['Impressões', t.impressions], ['Cliques no link', t.link_clicks, t.ctr, 'CTR'], ['Visualizações da página', t.lpv, t.connect_rate, 'connect rate'], ['Checkouts iniciados', t.initiate_checkout, t.checkout_rate, 'da página'], ['Vendas', t.sales, t.checkout_conv, 'do checkout']];
  const max = Math.max(1, t.impressions || 0);
  return `<div class="ad-funnel">${steps.map(([l, v, rate, rl], i) => `<div class="af-row"><div class="af-l"><span>${l}</span><b>${nf(v || 0)}</b></div><div class="af-bar"><i style="width:${Math.max(i ? 2 : 0, Math.sqrt((v || 0) / max) * 100)}%"></i></div>${i ? `<div class="af-rate">${rate === null || rate === undefined ? '—' : fmt('ctr', rate)} <small>${rl}</small></div>` : '<div class="af-rate"></div>'}</div>`).join('')}</div>
    <dl class="kv" style="margin-top:14px"><dt>Custo por venda</dt><dd>${fmt('cpa', t.cpa)}</dd><dt>Conversão da página</dt><dd>${fmt('page_conv', t.page_conv)}</dd></dl>`;
}

function renderTable() {
  const r = S.report, v = curView();
  const lvl = S.level;
  let rows = r.rows[lvl] || [];
  if (S.q) { const q = S.q.toLowerCase(); rows = rows.filter((x) => String(x.name).toLowerCase().includes(q) || String(x.campaign_name || '').toLowerCase().includes(q) || String(x.adset_name || '').toLowerCase().includes(q)); }
  const { key, dir } = S.sort;
  rows = [...rows].sort((a, b) => { const x = key === 'name' ? String(a.name).localeCompare(String(b.name)) : (a[key] ?? -Infinity) - (b[key] ?? -Infinity); return x * dir; });
  const cols = v.columns.filter((c) => KPIS[c] && !KPIS[c].totalOnly);
  const tot = rows.reduce((acc, x) => { for (const k of ['spend', 'impressions', 'reach', 'clicks', 'link_clicks', 'lpv', 'video_3s', 'thruplay', 'add_to_cart', 'initiate_checkout', 'leads', 'purchases', 'purchase_value', 'sales', 'revenue', 'net', 'refunds']) acc[k] = (acc[k] || 0) + (x[k] || 0); return acc; }, {});
  // sem busca nem filtro de status, o total é exatamente o dos cards (evita diferença de centavos)
  const T = !S.q && !S.f.status ? r.totals : derive(tot);
  const prodOpts = (sel) => `<option value="">Produto: geral</option>${S.products.filter((p) => p.kind !== 'bonus').map((p) => `<option value="${p.id}" ${String(sel) === String(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}`;
  const th = (k, l) => `<th class="${k === 'name' ? '' : 'r'} sortable ${key === k ? (dir < 0 ? 'desc' : 'asc') : ''}" data-sort="${k}">${l}</th>`;
  const nameCell = (x) => {
    const sub = lvl === 'adsets' ? x.campaign_name : lvl === 'ads' ? `${x.campaign_name} › ${x.adset_name}` : x.budget ? `${brl(x.budget)} ${x.budgetType === 'diário' ? '/dia' : 'total'}` : x.objective ? x.objective.replace('OUTCOME_', '').toLowerCase() : '';
    return `<td class="ad-name">${lvl === 'ads' ? `<span class="ad-thumb">${x.thumbnail ? `<img src="${esc(x.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>` : ''}<div><button class="ad-drill" data-drill="${esc(x.id)}" title="${lvl === 'ads' ? 'Filtrar por este anúncio' : 'Ver o que está dentro'}">${esc(x.name)}</button><small>${statusPill(x.status)}${sub ? ` <span>${esc(sub)}</span>` : ''}</small>${lvl === 'campaigns' && S.ctx.can('admin') ? `<select class="ad-prod" data-prod="${esc(x.id)}" title="Produto desta campanha (usado no Financeiro)">${prodOpts(x.product_id)}</select>` : ''}</div></td>`;
  };
  $('#ad-tbl').innerHTML = rows.length ? `<table class="tbl ad-tbl"><thead><tr>${th('name', lvl === 'campaigns' ? 'Campanha' : lvl === 'adsets' ? 'Conjunto' : 'Anúncio')}${cols.map((c) => th(c, esc(KPIS[c].l))).join('')}</tr></thead>
    <tbody>${rows.map((x) => `<tr>${nameCell(x)}${cols.map((c) => `<td class="r ${(c === 'profit' || c === 'roi') && x[c] < 0 ? 'neg' : ''} ${c === 'roas' ? roasClass(x.roas) : ''}">${fmt(c, x[c])}</td>`).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr><td><b>Total</b> <small class="faint">${rows.length} ${lvl === 'campaigns' ? 'campanha(s)' : lvl === 'adsets' ? 'conjunto(s)' : 'anúncio(s)'}</small></td>${cols.map((c) => `<td class="r"><b>${fmt(c, T[c])}</b></td>`).join('')}</tr></tfoot></table>`
    : `<div class="empty" style="padding:28px">${S.q ? 'Nada encontrado com essa busca.' : 'Sem dados para esses filtros e período.'}</div>`;
  $$('[data-sort]').forEach((t) => (t.onclick = () => { const k = t.dataset.sort; S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : k === 'name' ? 1 : -1 }; renderTable(); }));
  $$('[data-drill]').forEach((b) => (b.onclick = () => {
    const id = b.dataset.drill;
    if (lvl === 'campaigns') { S.f.campaign = id; S.f.adset = S.f.ad = ''; S.level = 'adsets'; }
    else if (lvl === 'adsets') { S.f.adset = id; S.f.ad = ''; const s = S.report.options.adsets.find((x) => x.id === id); if (s) S.f.campaign = s.campaign_id; S.level = 'ads'; }
    else { S.f.ad = id; const a = S.report.options.ads.find((x) => x.id === id); if (a) { S.f.adset = a.adset_id; S.f.campaign = a.campaign_id; } }
    renderDash();
  }));
  $$('[data-prod]').forEach((s) => s.addEventListener('change', async () => { try { await api(`/api/admin/meta/campaigns/${s.dataset.prod}`, { method: 'PUT', body: { product_id: s.value || null } }); toast('Produto da campanha atualizado. O Financeiro já considera esse vínculo.'); const row = S.report.rows.campaigns.find((x) => x.id === s.dataset.prod); if (row) row.product_id = s.value || null; } catch (e) { toast(e.message, { error: true }); } }));
}
const roasClass = (v) => (v === null || v === undefined ? '' : v >= 2 ? 'ad-good' : v < 1 ? 'ad-bad' : 'ad-mid');
/** Recalcula as métricas derivadas no navegador (linha de total da tabela) */
function derive(a) {
  const d = (x, y) => (y ? x / y : null); const profit = (a.net || 0) - (a.spend || 0);
  return { ...a, profit, roas: d(a.revenue, a.spend), roi: d(profit, a.spend), cpa: d(a.spend, a.sales), ticket: d(a.revenue, a.sales), margin: d(profit, a.revenue), ctr: d(a.link_clicks, a.impressions), ctr_all: d(a.clicks, a.impressions), cpc: d(a.spend, a.link_clicks), cpc_all: d(a.spend, a.clicks), cpm: d(a.spend * 1000, a.impressions), frequency: d(a.impressions, a.reach), connect_rate: d(a.lpv, a.link_clicks), cost_lpv: d(a.spend, a.lpv), page_conv: d(a.sales, a.lpv), checkout_rate: d(a.initiate_checkout, a.lpv), cost_ic: d(a.spend, a.initiate_checkout), checkout_conv: d(a.sales, a.initiate_checkout), hook_rate: d(a.video_3s, a.impressions), hold_rate: d(a.thruplay, a.video_3s), cpl: d(a.spend, a.leads), meta_roas: d(a.purchase_value, a.spend), meta_cpa: d(a.spend, a.purchases) };
}

function exportCsv() {
  const v = curView(), lvl = S.level, rows = S.report.rows[lvl];
  const cols = v.columns.filter((c) => KPIS[c] && !KPIS[c].totalOnly);
  const head = ['Nome', 'Status', ...(lvl !== 'campaigns' ? ['Campanha'] : []), ...(lvl === 'ads' ? ['Conjunto'] : []), ...cols.map((c) => KPIS[c].l)];
  const num = (c, x) => (x === null || x === undefined ? '' : KPIS[c].f === 'pct' ? (x * 100).toFixed(2).replace('.', ',') : KPIS[c].f === 'int' ? String(Math.round(x)) : Number(x).toFixed(2).replace('.', ','));
  const lines = [head, ...rows.map((x) => [x.name, x.status, ...(lvl !== 'campaigns' ? [x.campaign_name] : []), ...(lvl === 'ads' ? [x.adset_name] : []), ...cols.map((c) => num(c, x[c]))])];
  const csv = '﻿' + lines.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `anuncios-${lvl}-${S.report.from}-a-${S.report.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- personalizar visões ----------
function editView(isNew) {
  const base = curView();
  const st = { name: isNew ? '' : base.name, kpis: [...base.kpis], columns: [...base.columns], level: base.level || 'campaigns' };
  const groups = Object.entries(G);
  const listHtml = (kind) => {
    const sel = st[kind];
    const keys = Object.keys(KPIS).filter((k) => kind === 'kpis' || !KPIS[k].totalOnly);
    return `<div class="ve-cols"><div class="ve-pick">${groups.map(([g, gl]) => { const ks = keys.filter((k) => KPIS[k].g === g); return ks.length ? `<div class="ve-g"><b>${gl}</b>${ks.map((k) => `<label><input type="checkbox" data-k="${kind}" value="${k}" ${sel.includes(k) ? 'checked' : ''}> ${esc(KPIS[k].l)}</label>`).join('')}</div>` : ''; }).join('')}</div>
      <div class="ve-order"><b>Ordem (${sel.length})</b><ol>${sel.map((k, i) => `<li><span>${esc(KPIS[k].l)}</span><button type="button" data-mv="${kind}:${i}:-1" ${i ? '' : 'disabled'}>↑</button><button type="button" data-mv="${kind}:${i}:1" ${i < sel.length - 1 ? '' : 'disabled'}>↓</button></li>`).join('')}</ol></div></div>`;
  };
  modal({ title: isNew ? 'Nova visão' : `Personalizar: ${base.name}`, eyebrow: 'Painel de anúncios', wide: true, body: `
    <div class="form-grid"><div class="field"><label>Nome da visão</label><input class="input" id="ve-name" value="${esc(st.name)}" maxlength="40" placeholder="Ex.: Escala, Teste de criativos" ${!isNew && base.builtin ? 'disabled' : ''}></div>
    <div class="field"><label>Tabela abre em</label><select class="input" id="ve-level"><option value="campaigns">Campanhas</option><option value="adsets">Conjuntos</option><option value="ads">Anúncios</option></select></div></div>
    <div class="tabs" id="ve-tabs" style="margin:6px 0 12px"><button type="button" data-ve="kpis" class="on">Indicadores (cards)</button><button type="button" data-ve="columns">Colunas da tabela</button></div>
    <div id="ve-body"></div>
    <div class="modal-actions"><button class="btn btn-primary" id="ve-save">${isNew ? 'Criar visão' : 'Salvar'}</button>${!isNew && base.builtin && S.prefs.overrides[base.id] ? '<button class="btn btn-ghost" id="ve-reset">Restaurar padrão</button>' : ''}${!isNew && !base.builtin ? '<button class="btn btn-danger" id="ve-del">Excluir visão</button>' : ''}</div>`,
  onMount: (m, close) => {
    let tab = 'kpis';
    m.querySelector('#ve-level').value = st.level;
    const draw = () => {
      m.querySelector('#ve-body').innerHTML = listHtml(tab);
      m.querySelectorAll('[data-k]').forEach((c) => c.addEventListener('change', () => { const arr = st[c.dataset.k]; if (c.checked) { if (!arr.includes(c.value)) arr.push(c.value); } else st[c.dataset.k] = arr.filter((x) => x !== c.value); draw(); }));
      m.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => { const [k, i, d] = b.dataset.mv.split(':'); const a = st[k]; const j = +i + +d; [a[i], a[j]] = [a[j], a[i]]; draw(); }));
    };
    m.querySelectorAll('[data-ve]').forEach((b) => (b.onclick = () => { tab = b.dataset.ve; m.querySelectorAll('[data-ve]').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
    draw();
    m.querySelector('#ve-save').onclick = async () => {
      st.level = m.querySelector('#ve-level').value;
      if (!st.kpis.length || !st.columns.length) return toast('Escolha pelo menos um indicador e uma coluna.', { error: true });
      if (isNew) {
        const name = m.querySelector('#ve-name').value.trim(); if (!name) return toast('Dê um nome para a visão.', { error: true });
        const id = `v${Date.now().toString(36)}`; S.prefs.views.push({ id, name, kpis: st.kpis, columns: st.columns, level: st.level }); S.viewId = id;
      } else if (base.builtin) S.prefs.overrides[base.id] = { kpis: st.kpis, columns: st.columns, level: st.level };
      else { const v = S.prefs.views.find((x) => x.id === base.id); Object.assign(v, { name: m.querySelector('#ve-name').value.trim() || v.name, kpis: st.kpis, columns: st.columns, level: st.level }); }
      S.level = st.level; await savePrefs(); close(); toast('Visão salva'); renderDash();
    };
    m.querySelector('#ve-reset')?.addEventListener('click', async () => { delete S.prefs.overrides[base.id]; await savePrefs(); close(); toast('Visão restaurada'); renderDash(); });
    m.querySelector('#ve-del')?.addEventListener('click', async () => { if (!confirm(`Excluir a visão "${base.name}"?`)) return; S.prefs.views = S.prefs.views.filter((x) => x.id !== base.id); S.viewId = 'geral'; await savePrefs(); close(); renderDash(); });
  } });
}

// ---------- gráfico ----------
function adsChart(el, pts) {
  const W = 800, H = 300, pad = { l: 56, r: 44, t: 14, b: 26 };
  const max = Math.max(...pts.map((p) => Math.max(p.spend, p.revenue)), 0);
  const nice = max ? 10 ** Math.floor(Math.log10(max)) : 100; const top = max ? Math.ceil(max / nice) * nice : 100;
  const rmax = Math.max(2, ...pts.map((p) => p.roas || 0)); const rtop = Math.ceil(rmax);
  const bw = (W - pad.l - pad.r) / pts.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top), yr = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / rtop);
  const bar = (x, w, v, fill) => { const h = H - pad.b - y(v); if (h <= 0) return ''; const r = Math.min(3, w / 2, h); return `<path d="M${x},${H - pad.b} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z" fill="${fill}"/>`; };
  const grid = [0, 0.5, 1].map((f) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(top * f)}" y2="${y(top * f)}" stroke="#EDE8DD"/><text x="${pad.l - 8}" y="${y(top * f) + 4}" text-anchor="end" font-size="11" fill="#7C8893">${(top * f).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</text><text x="${W - pad.r + 8}" y="${yr(rtop * f) + 4}" font-size="11" fill="#B08A3E">${nf(rtop * f, rtop * f % 1 ? 1 : 0)}x</text>`).join('');
  const step = Math.ceil(pts.length / 8), gw = Math.max(2, bw * 0.72), w1 = gw / 2;
  const bars = pts.map((p, i) => { const x0 = pad.l + i * bw + (bw - gw) / 2; return `<g data-i="${i}"><rect x="${pad.l + i * bw}" y="${pad.t}" width="${bw}" height="${H - pad.t - pad.b}" fill="transparent"/>${bar(x0, w1, p.spend, '#C9D3DC')}${bar(x0 + w1, w1, p.revenue, '#1F6B52')}${i % step === 0 ? `<text x="${pad.l + i * bw + bw / 2}" y="${H - 7}" text-anchor="middle" font-size="11" fill="#7C8893">${dmy(p.d)}</text>` : ''}</g>`; }).join('');
  const pr = pts.map((p, i) => (p.roas === null ? null : `${pad.l + i * bw + bw / 2},${yr(Math.min(p.roas, rtop))}`));
  const segs = []; let cur = []; for (const pt of pr) { if (pt) cur.push(pt); else if (cur.length) { segs.push(cur); cur = []; } } if (cur.length) segs.push(cur);
  const line = segs.map((s) => `<polyline fill="none" stroke="#C9A45C" stroke-width="2.2" stroke-linejoin="round" points="${s.join(' ')}"/>`).join('') + (pts.length <= 45 ? pr.filter(Boolean).map((p) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="2.6" fill="#C9A45C"/>`).join('') : '');
  const one = yr(1) > pad.t ? `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yr(1)}" y2="${yr(1)}" stroke="#C9A45C" stroke-dasharray="3 4" stroke-opacity=".55"/>` : '';
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Investimento e faturamento por dia">${grid}${one}<line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" stroke="#D6CEBC"/>${bars}<g style="pointer-events:none">${line}</g></svg><div class="tip"></div>`;
  const tip = el.querySelector('.tip');
  el.querySelectorAll('g[data-i]').forEach((g) => {
    g.addEventListener('mouseenter', () => {
      const p = pts[g.dataset.i]; const box = el.getBoundingClientRect(); const rb = g.getBoundingClientRect();
      tip.innerHTML = `<b>${dmy(p.d)} · ${p.sales} venda(s)</b>Investido ${brl(p.spend)}<br>Faturamento ${brl(p.revenue)}<br>ROAS ${p.roas === null ? '—' : `${nf(p.roas, 2)}x`}`;
      tip.style.left = `${Math.min(box.width - 80, Math.max(80, rb.left - box.left + rb.width / 2))}px`; tip.style.top = `${Math.max(78, (y(Math.max(p.spend, p.revenue)) / H) * box.height)}px`; tip.style.opacity = 1;
    });
    g.addEventListener('mouseleave', () => (tip.style.opacity = 0));
  });
}

// ---------- conexão ----------
async function renderConnection() {
  const st = S.status = await api('/api/admin/meta/status');
  const owner = S.ctx.can('owner');
  const guide = `<ol class="steps-list ad-guide">
      <li>Em <b>business.facebook.com</b>, abra <b>Configurações do negócio › Usuários › Usuários do sistema</b> e crie um usuário do sistema com função <b>Administrador</b>.</li>
      <li>Clique em <b>Atribuir ativos</b>, escolha <b>Contas de anúncios</b>, marque as contas e dê a permissão <b>Ver desempenho</b>.</li>
      <li>Ainda no usuário do sistema, clique em <b>Gerar novo token</b>, escolha o seu aplicativo (se não tiver, crie um do tipo <b>Empresa</b> em developers.facebook.com), marque a permissão <b>ads_read</b> e a validade <b>Nunca expira</b>.</li>
      <li>Copie o token e cole abaixo. Ele fica guardado criptografado e nunca aparece de novo inteiro.</li></ol>`;
  const form = owner ? `<form id="mc-form" class="form-grid">
      <div class="field full"><label>Token de acesso (usuário do sistema)</label><input class="input" name="token" autocomplete="off" placeholder="EAAB…" required></div>
      <div class="field full"><label>Chave secreta do aplicativo <span class="faint">(opcional, mais segurança)</span></label><input class="input" name="app_secret" autocomplete="off" placeholder="Em developers.facebook.com › seu app › Configurações › Básico"></div>
      <div class="full"><button class="btn btn-primary">${st.connected ? 'Trocar token' : 'Conectar e importar'}</button></div></form>` : '<div class="alert alert-warn">Apenas o proprietário pode conectar a conta da Meta.</div>';
  const body = !st.connected ? `
    <div class="cols"><div class="panel c7"><div class="panel-h"><h3>Conectar a conta de anúncios da Meta</h3></div><div class="panel-b">${guide}${form}</div></div>
    <div class="panel c5"><div class="panel-h"><h3>O que você ganha</h3></div><div class="panel-b ad-benefits">
      <p><b>Tudo em um painel:</b> investimento, impressões, cliques, CTR, CPC, CPM, connect rate, checkout, hook e hold rate por campanha, conjunto e anúncio.</p>
      <p><b>Vendas reais, não só o pixel:</b> cada venda aprovada na Greenn é ligada ao anúncio pelo UTM, com ROAS, ROI, CPA e lucro de verdade.</p>
      <p><b>Atualização automática</b> a cada ${st.syncHours} horas, sem exportar planilha.</p>
      <p><b>O Financeiro também usa esses gastos:</b> ROAS e lucro da plataforma sem lançamento manual.</p></div></div></div>`
    : `
    <div class="cols">
      <div class="panel c7"><div class="panel-h"><h3>Conexão</h3><span class="badge ok">Conectada</span></div><div class="panel-b">
        <dl class="kv"><dt>Usuário</dt><dd>${esc(st.user)}</dd><dt>Token</dt><dd><code>${esc(st.tokenHint)}</code>${st.hasSecret ? ' · com chave secreta' : ''}</dd><dt>Conectada em</dt><dd>${fmtDateTime(st.connectedAt)}</dd><dt>Versão da API</dt><dd>${esc(st.apiVersion)}</dd><dt>Última sincronização</dt><dd>${st.lastSyncAt ? `${fmtDateTime(st.lastSyncAt)} (${relTime(st.lastSyncAt)})` : '—'}</dd><dt>Próxima</dt><dd>${st.syncing ? 'sincronizando agora…' : st.nextSyncAt ? `${fmtDateTime(st.nextSyncAt)} (${inHours(st.nextSyncAt)})` : '—'}</dd></dl>
        <div class="ad-cbtns"><button class="btn btn-primary btn-sm" id="mc-sync" ${st.syncing ? 'disabled' : ''}>Sincronizar agora</button><button class="btn btn-soft btn-sm" id="mc-full" ${st.syncing ? 'disabled' : ''}>Recarregar histórico completo</button>${owner ? '<button class="btn btn-ghost btn-sm" id="mc-swap">Trocar token</button><button class="btn btn-danger btn-sm" id="mc-off">Desconectar</button>' : ''}</div>
        <div id="mc-swap-box" hidden style="margin-top:16px">${form}</div>
      </div></div>
      <div class="panel c5"><div class="panel-h"><h3>Atualização</h3></div><div class="panel-b form-grid">
        <div class="field"><label>Sincronizar a cada</label><select class="input" id="mc-hours">${[1, 2, 3, 4, 6, 8, 12, 24].map((h) => `<option value="${h}" ${st.syncHours === h ? 'selected' : ''}>${h} hora${h > 1 ? 's' : ''}</option>`).join('')}</select></div>
        <div class="field"><label>Histórico importado</label><select class="input" id="mc-days">${[30, 60, 90, 180, 365, 730].map((d) => `<option value="${d}" ${st.historyDays === d ? 'selected' : ''}>${d} dias</option>`).join('')}</select></div>
        <p class="hint full" style="margin:0">A cada sincronização, os últimos 7 dias são recalculados, porque a Meta ajusta as conversões com atraso. O histórico completo é importado na conexão ou ao clicar em "Recarregar histórico completo".</p>
      </div></div>
      <div class="panel c12"><div class="panel-h"><h3>Contas de anúncios</h3><span class="faint">marque as contas que entram no painel</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Conta</th><th>ID</th><th>Moeda</th><th>Situação na Meta</th><th>Última sincronização</th><th class="r">No painel</th></tr></thead><tbody>
        ${st.accounts.map((a) => `<tr><td><b>${esc(a.name)}</b>${a.business_name ? `<br><small class="faint">${esc(a.business_name)}</small>` : ''}${a.last_error ? `<br><small class="neg">${esc(a.last_error)}</small>` : ''}</td><td><code>${esc(a.id.replace('act_', ''))}</code></td><td>${esc(a.currency || '')}</td><td>${a.account_status === 1 ? '<span class="badge ok">Ativa</span>' : '<span class="badge">Inativa</span>'}</td><td>${a.last_sync_at ? relTime(a.last_sync_at) : '—'}</td><td class="r"><label class="toggle"><input type="checkbox" data-acc="${esc(a.id)}" ${a.enabled ? 'checked' : ''}><i></i></label></td></tr>`).join('')}
      </tbody></table></div></div>
    </div>`;
  const utm = `<div class="panel c12" id="utm-box"><div class="panel-h"><h3>Parâmetros de URL dos anúncios</h3><span class="faint">é o que liga cada venda ao anúncio</span></div><div class="panel-b">
      <p class="muted" style="margin-top:0">No Gerenciador de Anúncios, em cada anúncio (ou em massa, selecionando vários), vá em <b>Rastreamento › Parâmetros de URL</b> e cole:</p>
      <div class="ad-utm"><code id="utm-text">${esc(st.utmTemplate)}</code><button class="btn btn-primary btn-sm" id="utm-copy">Copiar</button></div>
      <p class="hint">A Meta troca os campos entre chaves pelo nome e ID reais. A Greenn repassa esses UTMs na venda e o painel liga a venda à campanha, ao conjunto e ao anúncio. Vendas com o nome da campanha no utm_campaign também são reconhecidas.</p></div></div>`;
  const log = st.log.length ? `<div class="panel c12"><div class="panel-h"><h3>Histórico de sincronizações</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Início</th><th>Origem</th><th>Situação</th><th class="r">Linhas</th><th>Detalhes</th></tr></thead><tbody>
      ${st.log.map((l) => `<tr><td>${fmtDateTime(l.started_at)}</td><td>${esc(l.trigger || '')}</td><td>${l.status === 'ok' ? '<span class="badge ok">Concluída</span>' : l.status === 'running' ? '<span class="badge gold">Em andamento</span>' : l.status === 'partial' ? '<span class="badge gold">Com avisos</span>' : '<span class="badge err">Falhou</span>'}</td><td class="r">${l.rows ?? '—'}</td><td class="ad-logmsg">${esc(l.message || '')}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  shell(`${body}<div class="cols" style="margin-top:16px">${utm}${log}</div>`);
  $('#mc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await withLoading(e.submitter, async () => {
      try { const r = await api('/api/admin/meta/connect', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast(`Conectado como ${r.user}. Importando ${r.accounts} conta(s)…`, { ms: 5000 }); S.status.syncing = true; S.tab = 'painel'; renderDash(); }
      catch (er) { toast(er.message, { error: true, ms: 8000 }); }
    });
  });
  $('#mc-sync')?.addEventListener('click', () => startSync(false));
  $('#mc-full')?.addEventListener('click', () => { if (confirm('Recarregar todo o histórico configurado? Pode levar alguns minutos.')) startSync(true); });
  $('#mc-swap')?.addEventListener('click', () => { $('#mc-swap-box').hidden = !$('#mc-swap-box').hidden; });
  $('#mc-off')?.addEventListener('click', async () => { if (!confirm('Desconectar a Meta? Os dados já importados continuam no painel, mas param de atualizar.')) return; await api('/api/admin/meta/disconnect', { method: 'POST' }); toast('Meta desconectada'); renderConnection(); });
  $('#mc-hours')?.addEventListener('change', async (e) => { await api('/api/admin/meta/settings', { method: 'PUT', body: { sync_hours: Number(e.target.value) } }); toast(`Sincronização a cada ${e.target.value} h`); renderConnection(); });
  $('#mc-days')?.addEventListener('change', async (e) => { await api('/api/admin/meta/settings', { method: 'PUT', body: { history_days: Number(e.target.value) } }); toast('Histórico atualizado. Use "Recarregar histórico completo" para importar agora.', { ms: 5000 }); });
  $$('[data-acc]').forEach((c) => c.addEventListener('change', async () => { await api(`/api/admin/meta/accounts/${encodeURIComponent(c.dataset.acc)}`, { method: 'PUT', body: { enabled: c.checked } }); toast(c.checked ? 'Conta incluída. Os dados chegam na próxima sincronização.' : 'Conta removida do painel'); }));
  $('#utm-copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(st.utmTemplate); toast('Parâmetros copiados'); } catch { const r = document.createRange(); r.selectNode($('#utm-text')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Selecionado. Use Ctrl+C para copiar.'); } });
}
