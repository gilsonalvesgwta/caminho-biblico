// API da Meta simulada, para testes (CI e navegador). Imita /me, /me/adaccounts, campanhas, conjuntos, anúncios e insights,
// com paginação por cursor, erro de token inválido e um limite de taxa na primeira consulta de insights.
// Uso direto: node scripts/fake-meta.js 4999
import http from 'node:http';

export const VALID_TOKEN = 'EAAB-teste-token-valido-0123456789';
const ACC = 'act_1111111111';
const CAMPS = [
  { id: '120200000000000001', name: 'Desafio 7 Dias · Público Frio', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '15000' },
  { id: '120200000000000002', name: 'Desafio 7 Dias · Remarketing', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '5000' },
  { id: '120200000000000003', name: 'Riqueza a Dois · Lançamento', objective: 'OUTCOME_SALES', status: 'PAUSED', effective_status: 'PAUSED', lifetime_budget: '300000' },
];
const SETS = [
  { id: '120210000000000011', campaign_id: CAMPS[0].id, name: 'Interesses · Finanças 25-45', status: 'ACTIVE', effective_status: 'ACTIVE', optimization_goal: 'OFFSITE_CONVERSIONS' },
  { id: '120210000000000012', campaign_id: CAMPS[0].id, name: 'Aberto · Advantage+', status: 'ACTIVE', effective_status: 'ACTIVE', optimization_goal: 'OFFSITE_CONVERSIONS' },
  { id: '120210000000000021', campaign_id: CAMPS[1].id, name: 'Visitantes 30d', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '5000', optimization_goal: 'OFFSITE_CONVERSIONS' },
  { id: '120210000000000031', campaign_id: CAMPS[2].id, name: 'Casais 28-50', status: 'PAUSED', effective_status: 'PAUSED', optimization_goal: 'OFFSITE_CONVERSIONS' },
];
const ADS = [
  { id: '120220000000000111', adset_id: SETS[0].id, campaign_id: CAMPS[0].id, name: 'Vídeo · Depoimento Maria', effective_status: 'ACTIVE', k: 1.0 },
  { id: '120220000000000112', adset_id: SETS[0].id, campaign_id: CAMPS[0].id, name: 'Imagem · Bíblia e calculadora', effective_status: 'ACTIVE', k: 0.6 },
  { id: '120220000000000121', adset_id: SETS[1].id, campaign_id: CAMPS[0].id, name: 'Vídeo · Rhus explica o desafio', effective_status: 'ACTIVE', k: 1.3 },
  { id: '120220000000000211', adset_id: SETS[2].id, campaign_id: CAMPS[1].id, name: 'Carrossel · 7 dias', effective_status: 'ACTIVE', k: 0.5 },
  { id: '120220000000000311', adset_id: SETS[3].id, campaign_id: CAMPS[2].id, name: 'Vídeo · Carol e Rhus', effective_status: 'PAUSED', k: 0.9 },
];
// anúncio já excluído na Meta: some da lista de anúncios, mas tem métricas no histórico
const GHOST = { id: '120220000000000199', adset_id: SETS[0].id, campaign_id: CAMPS[0].id, name: 'Vídeo antigo (excluído)', effective_status: 'ACTIVE', k: 0.4 };
const seed = (s) => { let x = Math.sin(s) * 10000; return x - Math.floor(x); };
const days = (a, b) => { const out = []; for (let d = a; d <= b; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400e3).toISOString().slice(0, 10)) out.push(d); return out; };

function insight(ad, d) {
  const n = Number(d.replace(/-/g, '')) + Number(ad.id.slice(-3));
  const r = seed(n);
  const paused = ad.effective_status === 'PAUSED';
  const spend = paused ? 0 : +(40 * ad.k * (0.7 + r * 0.6)).toFixed(2);
  if (!spend) return null;
  const imp = Math.round(spend * (95 + r * 40)), reach = Math.round(imp / (1.2 + r * 0.5));
  const link = Math.round(imp * (0.011 + r * 0.008)), clicks = Math.round(link * 1.6), lpv = Math.round(link * (0.72 + r * 0.15));
  const v3 = Math.round(imp * (0.25 + r * 0.12)), thru = Math.round(v3 * (0.18 + r * 0.1));
  const ic = Math.round(lpv * (0.09 + r * 0.05)), buy = Math.round(ic * (0.35 + r * 0.2));
  return {
    date_start: d, date_stop: d, account_id: ACC.slice(4), campaign_id: ad.campaign_id, campaign_name: CAMPS.find((c) => c.id === ad.campaign_id).name,
    adset_id: ad.adset_id, adset_name: SETS.find((s) => s.id === ad.adset_id).name, ad_id: ad.id, ad_name: ad.name,
    spend: String(spend), impressions: String(imp), reach: String(reach), clicks: String(clicks), inline_link_clicks: String(link),
    actions: [{ action_type: 'link_click', value: String(link) }, { action_type: 'landing_page_view', value: String(lpv) }, { action_type: 'omni_landing_page_view', value: String(lpv) },
      { action_type: 'video_view', value: String(v3) }, { action_type: 'initiate_checkout', value: String(ic) }, { action_type: 'omni_initiated_checkout', value: String(ic) },
      { action_type: 'purchase', value: String(buy) }, { action_type: 'omni_purchase', value: String(buy) }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: String(buy) }],
    action_values: [{ action_type: 'purchase', value: String(buy * 27) }, { action_type: 'omni_purchase', value: String(buy * 27) }],
    video_thruplay_watched_actions: [{ action_type: 'video_view', value: String(thru) }],
  };
}

export function startFakeMeta(port) {
  let rateLimitedOnce = false;
  const calls = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    calls.push(u.pathname);
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (u.searchParams.get('access_token') !== VALID_TOKEN) return send(400, { error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190 } });
    const p = u.pathname.replace(/^\/v\d+\.\d+\//, '');
    const page = (items) => {
      const limit = Math.min(Number(u.searchParams.get('limit') || 25), 500);
      const after = Number(u.searchParams.get('after') || 0);
      const slice = items.slice(after, after + limit);
      const body = { data: slice };
      if (after + limit < items.length) { const n = new URL(u); n.searchParams.set('after', String(after + limit)); body.paging = { cursors: { after: String(after + limit) }, next: n.toString() }; }
      send(200, body);
    };
    if (p === 'me') return send(200, { id: '999', name: 'Usuário do Sistema · Altis' });
    if (p === 'me/adaccounts') return page([{ id: ACC, name: 'Altis · Conta Principal', account_status: 1, currency: 'BRL', timezone_name: 'America/Sao_Paulo', business_name: 'Servocar' }, { id: 'act_2222222222', name: 'Conta Antiga (desativada)', account_status: 2, currency: 'BRL', timezone_name: 'America/Sao_Paulo' }]);
    if (p === `${ACC}/campaigns`) return page(CAMPS);
    if (p === `${ACC}/adsets`) return page(SETS);
    if (p === `${ACC}/ads`) return page(ADS.map((a) => ({ id: a.id, name: a.name, adset_id: a.adset_id, campaign_id: a.campaign_id, status: a.effective_status, effective_status: a.effective_status, creative: { id: `cr${a.id}`, thumbnail_url: `https://placehold.co/240x240/0B1A2A/C9A45C/png?text=${encodeURIComponent(a.name.split(' · ')[0])}` } })));
    if (p === `${ACC}/insights`) {
      if (!rateLimitedOnce) { rateLimitedOnce = true; return send(400, { error: { message: 'User request limit reached', code: 17 } }); }
      const tr = JSON.parse(u.searchParams.get('time_range') || '{}');
      const rows = [];
      for (const d of days(tr.since, tr.until)) for (const ad of [...ADS, GHOST]) { const x = insight(ad, d); if (x) rows.push(x); }
      return page(rows);
    }
    if (/^act_\d+\//.test(p)) return send(200, { data: [] });
    send(404, { error: { message: `Unknown path ${p}`, code: 803 } });
  });
  srv.listen(port, '127.0.0.1');
  return { srv, calls, ids: { ACC, CAMPS, SETS, ADS } };
}

if (process.argv[1] && process.argv[1].endsWith('fake-meta.js')) {
  const port = Number(process.argv[2] || 4999);
  startFakeMeta(port);
  console.log(`API da Meta simulada em http://127.0.0.1:${port}`);
}
