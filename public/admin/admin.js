import { api, esc, toast, modal, withLoading, fmtDate, fmtDateTime, relTime, $, $$ } from '/shared/ui.js';
import { brl, pct, money, setCurrency, NOTAS_RETRATO, ARMAS, FRUTOS } from '/shared/calc.js';
import { youtubeId, youtubeThumb } from '/shared/player.js';
import { themeVars, varsToStyle, normalizeTheme, loadFont, contrast, FONTS } from '/shared/theme.js';

const root = document.getElementById('root');
let ME = null;
const BASE = '/admin';

const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  dash: I('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.4 3.6 5.2"/>'),
  sales: I('<path d="M3 7h18v12H3z"/><path d="M3 11h18M7 15h3"/>'),
  money: I('<path d="M4 19V5M4 19h16"/><path d="M8 15l3.5-4 3 2.5L20 7"/><path d="M16 7h4v4"/>'),
  leads: I('<path d="M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.6 6.7 19.5l1.1-6L3.4 9.3l6-.8z"/>'),
  voice: I('<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>'),
  content: I('<path d="M4 4h12l4 4v12H4z"/><path d="M8 12h8M8 16h5M15 4v4h4"/>'),
  plug: I('<path d="M9 7V3M15 7V3M6 7h12v4a6 6 0 0 1-12 0zM12 17v4"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  team: I('<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>'),
  log: I('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
  mark: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v18M6 8h12" stroke="#E6CD97" stroke-width="1.8" stroke-linecap="round"/><path d="M4.5 19.5c2.4-1.3 4.9-2 7.5-2s5.1.7 7.5 2" stroke="#7FB8A2" stroke-width="1.6" stroke-linecap="round"/></svg>',
};
const NAV = [
  ['Operação', [['', 'Visão geral', 'dash'], ['/financeiro', 'Financeiro', 'money'], ['/alunos', 'Alunos', 'users'], ['/vendas', 'Vendas', 'sales'], ['/leads', 'Leads qualificados', 'leads'], ['/vozes', 'Depoimentos e recados', 'voice']]],
  ['Produto', [['/conteudo', 'Produtos e conteúdo', 'content'], ['/integracoes', 'Greenn e integrações', 'plug']]],
  ['Sistema', [['/config', 'Configurações', 'gear'], ['/equipe', 'Equipe', 'team'], ['/auditoria', 'Auditoria', 'log']]],
];
const ROLE = { owner: 'Proprietário', admin: 'Administrador', support: 'Suporte', viewer: 'Leitura' };
const STATUS = {
  paid: ['Pago', 'ok'], waiting_payment: ['Aguardando', 'warn'], refused: ['Recusado', 'err'], refunded: ['Reembolsado', 'err'], chargedback: ['Chargeback', 'err'], trialing: ['Teste', 'gold'], canceled: ['Cancelado', 'err'], unpaid: ['Inadimplente', 'err'],
  active: ['Ativo', 'ok'], suspended: ['Suspenso', 'warn'], expired: ['Expirado', ''], blocked: ['Bloqueado', 'err'],
  ok: ['Processado', 'ok'], error: ['Erro', 'err'], unmapped: ['Produto não vinculado', 'warn'], ignored: ['Ignorado', ''], received: ['Recebido', ''],
};
const badge = (s) => { const [l, c] = STATUS[s] || [s || '—', '']; return `<span class="badge ${c}">${esc(l)}</span>`; };
const can = (role) => ({ viewer: 1, support: 2, admin: 3, owner: 4 }[ME.admin.role] >= { viewer: 1, support: 2, admin: 3, owner: 4 }[role]);

// ---------- roteamento ----------
const go = (p) => { history.pushState({}, '', BASE + p); route(); };
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-go]');
  if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); document.body.classList.remove('nav-open'); go(a.dataset.go); }
});
window.addEventListener('popstate', () => route());

async function route() {
  const path = location.pathname.replace(/^\/admin/, '').replace(/\/+$/, '') || '';
  if (!ME) { try { ME = await api('/api/admin/me'); } catch { return pageLogin(); } }
  const pages = [
    [/^$/, pageDash], [/^\/alunos$/, pageStudents], [/^\/alunos\/(\d+)$/, pageStudent], [/^\/vendas$/, pageSales], [/^\/financeiro$/, pageFinance], [/^\/leads$/, pageLeads],
    [/^\/vozes$/, pageVoices], [/^\/conteudo$/, pageContent], [/^\/conteudo\/(\d+)$/, pageProduct], [/^\/integracoes$/, pageIntegrations],
    [/^\/config$/, pageSettings], [/^\/equipe$/, pageTeam], [/^\/auditoria$/, pageAudit],
  ];
  for (const [re, fn] of pages) { const m = path.match(re); if (m) { layout(path); try { await fn(...m.slice(1)); } catch (e) { if (e.status === 401) { ME = null; return pageLogin(); } $('#main').innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; } return; } }
  go('');
}

function layout(path) {
  if (!$('#main')) {
    root.innerHTML = `<div class="mobile-top"><button id="burger" aria-label="Menu">☰</button><b class="serif">Painel</b></div><div class="layout">
      <aside class="side"><a class="brand" href="${BASE}" data-go="">${ME.brandLogoDark ? `<span class="brand-wide"><img src="${esc(ME.brandLogoDark)}" alt="${esc(ME.brand)}"></span>` : `${ME.brandLogo ? `<span class="brand-mark brand-icon"><img src="${esc(ME.brandLogo)}" alt=""></span>` : `<span class="brand-mark">${ICONS.mark}</span>`}<span><b>${esc(ME.brand)}</b><small>Painel</small></span>`}</a>
      <nav id="nav"></nav>
      <div class="side-foot"><b>${esc(ME.admin.name)}</b>${esc(ROLE[ME.admin.role])} · <a href="${ME.appUrl}" target="_blank" style="color:var(--ink-300)">ver app ↗</a><br><button id="pwd">Trocar senha</button> · <button id="logout">Sair</button></div></aside>
      <div class="content" id="main"></div></div>`;
    if (ME.brandLogo) { const l = document.querySelector('link[rel="icon"]'); if (l) { l.href = ME.brandLogo; l.removeAttribute('type'); } }
    $('#burger').onclick = () => document.body.classList.toggle('nav-open');
    $('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); ME = null; location.href = BASE; };
    $('#pwd').onclick = changePassword;
  }
  const sec = '/' + (path.split('/')[1] || '');
  $('#nav').innerHTML = NAV.map(([g, items]) => `<div class="nav-g">${g}</div>${items.map(([p, l, ic]) => `<a class="nav ${(p || '/') === sec || (p === '' && sec === '/') ? 'active' : ''}" href="${BASE}${p}" data-go="${p}">${ICONS[ic]}<span>${l}</span></a>`).join('')}`).join('');
  setCurrency('BRL');
  $('#main').innerHTML = '<div class="skeleton" style="height:36px;width:280px"></div><div class="skeleton" style="height:260px;margin-top:22px"></div>';
  window.scrollTo(0, 0);
}
const head = (title, sub, actions = '') => `<div class="ph"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;

function changePassword() {
  modal({ title: 'Trocar minha senha', body: `<form id="cp"><div class="field"><label>Senha atual</label><input class="input" type="password" name="current" required></div><div class="field"><label>Nova senha</label><input class="input" type="password" name="password" minlength="8" required></div><button class="btn btn-primary">Salvar</button></form>`,
    onMount: (m, close) => m.querySelector('#cp').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/api/admin/me/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Senha atualizada'); close(); } catch (er) { toast(er.message, { error: true }); } }) });
}

async function pageLogin() {
  const B = await api('/api/app/brand').catch(() => ({}));
  if (B.brand_logo) { const l = document.querySelector('link[rel="icon"]'); if (l) { l.href = B.brand_logo; l.removeAttribute('type'); } }
  const logoBlock = B.brand_logo_wide ? `<img src="${esc(B.brand_logo_wide)}" alt="${esc(B.brand_name || '')}" style="height:42px;max-width:240px;object-fit:contain;object-position:left"><div class="eyebrow" style="margin-left:auto">Painel</div>`
    : B.brand_logo ? `<img src="${esc(B.brand_logo)}" alt="" style="width:38px;height:38px;border-radius:11px;object-fit:contain"><div><div class="eyebrow">Painel administrativo</div><b class="serif" style="font-size:18px;font-weight:500">${esc(B.brand_name || '')}</b></div>` : '';
  root.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(700px 400px at 0% 0%, rgba(31,107,82,.4), transparent 60%),radial-gradient(600px 400px at 100% 100%, rgba(201,164,92,.22), transparent 60%),var(--ink-950)">
    <div class="panel" style="width:min(400px,100%);padding:30px"><div style="display:flex;gap:10px;align-items:center;margin-bottom:22px">${logoBlock || `<span class="brand-mark" style="width:38px;height:38px;border-radius:11px;background:var(--ink-900);display:grid;place-items:center">${ICONS.mark.replace('viewBox', 'width="20" viewBox')}</span><div><div class="eyebrow">Painel administrativo</div><b class="serif" style="font-size:18px;font-weight:500">O Caminho Bíblico do Dinheiro</b></div>`}</div>
    <div id="msg"></div><form id="lf"><div class="field"><label>E-mail</label><input class="input" name="email" type="email" autocomplete="username" required></div><div class="field"><label>Senha</label><input class="input" name="password" type="password" autocomplete="current-password" required></div><button class="btn btn-primary btn-block">Entrar</button></form></div></div>`;
  $('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    await withLoading(e.submitter, async () => {
      try { await api('/api/admin/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); ME = await api('/api/admin/me'); root.innerHTML = ''; route(); }
      catch (er) { $('#msg').innerHTML = `<div class="alert alert-error">${esc(er.message)}</div>`; }
    });
  });
}

// ---------- componentes ----------
function pager(d, onPage) {
  const pages = Math.max(1, Math.ceil(d.total / d.size));
  const html = `<div class="pager"><span>${d.total.toLocaleString('pt-BR')} registro(s) · página ${d.page} de ${pages}</span><div><button class="btn btn-soft btn-sm" data-pg="${d.page - 1}" ${d.page <= 1 ? 'disabled' : ''}>Anterior</button><button class="btn btn-soft btn-sm" data-pg="${d.page + 1}" ${d.page >= pages ? 'disabled' : ''}>Próxima</button></div></div>`;
  setTimeout(() => $$('[data-pg]').forEach((b) => (b.onclick = () => onPage(Number(b.dataset.pg)))));
  return html;
}
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();
const who = (name, email, extra = '') => `<div class="who"><b>${esc(name || '—')}</b><small>${esc(email || '')}${extra}</small></div>`;

/** Gráfico de colunas com 1 série (receita por dia), com tooltip por coluna */
function barChart(el, series, { days }) {
  const map = new Map(series.map((s) => [s.d, s]));
  const pts = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - 3 * 3600e3 - i * 86400e3).toISOString().slice(0, 10);
    pts.push({ d, v: map.get(d)?.v || 0, c: map.get(d)?.c || 0 });
  }
  const W = 800, H = 220, pad = { l: 46, r: 8, t: 10, b: 24 };
  const max = Math.max(...pts.map((p) => p.v), 0);
  const nice = max ? Math.pow(10, Math.floor(Math.log10(max))) : 100; const top = max ? Math.ceil(max / nice) * nice : 100;
  const bw = (W - pad.l - pad.r) / pts.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const grid = [0, 0.5, 1].map((f) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(top * f)}" y2="${y(top * f)}" stroke="#EDE8DD"/><text x="${pad.l - 8}" y="${y(top * f) + 4}" text-anchor="end" font-size="11" fill="#7C8893">${(top * f).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</text>`).join('');
  const step = Math.ceil(pts.length / 8);
  const bars = pts.map((p, i) => {
    const x = pad.l + i * bw + Math.max(1, bw * 0.18); const w = Math.max(2, bw * 0.64); const h = H - pad.b - y(p.v);
    const r = Math.min(4, w / 2, h);
    const path = h > 0 ? `M${x},${H - pad.b} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z` : '';
    return `<g data-i="${i}"><rect x="${pad.l + i * bw}" y="${pad.t}" width="${bw}" height="${H - pad.t - pad.b}" fill="transparent"/>${path ? `<path d="${path}" fill="#1F6B52"/>` : ''}${i % step === 0 ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#7C8893">${p.d.slice(8, 10)}/${p.d.slice(5, 7)}</text>` : ''}</g>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Receita por dia">${grid}<line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" stroke="#D6CEBC"/>${bars}</svg><div class="tip"></div>`;
  const tip = el.querySelector('.tip');
  el.querySelectorAll('g[data-i]').forEach((g) => {
    g.addEventListener('mouseenter', () => {
      const p = pts[g.dataset.i]; const box = el.getBoundingClientRect(); const rb = g.getBoundingClientRect();
      tip.innerHTML = `<b>${brl(p.v)}</b>${p.c} venda(s) · ${p.d.slice(8, 10)}/${p.d.slice(5, 7)}`;
      tip.style.left = `${rb.left - box.left + rb.width / 2}px`; tip.style.top = `${Math.max(30, (y(p.v) / H) * box.height)}px`; tip.style.opacity = 1;
    });
    g.addEventListener('mouseleave', () => (tip.style.opacity = 0));
  });
}

// ---------- visão geral ----------
async function pageDash(days = 30) {
  const d = await api(`/api/admin/dashboard?days=${days}`);
  const enrolled = d.funnel[0]?.v || 0;
  const finished = d.funnel.at(-1)?.v || 0;
  $('#main').innerHTML = head('Visão geral', `Olá, ${esc(ME.admin.name.split(' ')[0])}. Aqui está o pulso do desafio.`,
    `<div class="tabs" style="margin:0">${[7, 30, 90].map((n) => `<button data-days="${n}" class="${n === d.days ? 'on' : ''}">${n} dias</button>`).join('')}</div>`) + `
    ${!ME.webhookConfigured || d.whIssues ? `<div class="alert alert-warn">${d.whIssues ? `${d.whIssues} evento(s) da Greenn com erro ou produto não vinculado nos últimos 7 dias. <a href="${BASE}/integracoes" data-go="/integracoes">Ver integrações</a>` : 'Configure o webhook da Greenn para liberar acessos automaticamente.'}</div>` : ''}
    <div class="cols">
      <a class="panel kpi dark c3 kpi-link" href="${BASE}/financeiro" data-go="/financeiro"><div class="l">Faturamento bruto (${d.days}d)<span>Financeiro →</span></div><div class="v">${brl(d.fin.gross)}</div><div class="s">Líquido ${brl(d.fin.net)} · ${d.fin.approved} vendas · ticket ${brl(d.fin.ticket)}</div></a>
      <div class="panel kpi c3"><div class="l">Alunos ativos</div><div class="v">${d.students.toLocaleString('pt-BR')}</div><div class="s">+${d.newStudents} no período · ${d.active7} ativos em 7d</div></div>
      <div class="panel kpi c3"><div class="l">Conclusão do desafio</div><div class="v">${enrolled ? pct(finished / enrolled) : '—'}</div><div class="s">${finished} de ${enrolled} concluíram o Dia 7</div></div>
      <div class="panel kpi c3"><div class="l">Reembolsos e chargebacks</div><div class="v">${pct(d.fin.refundRate)}</div><div class="s">${brl(d.fin.refundValue)} · ${d.fin.refundCount} no período · ${d.pending} aguardando pagamento</div></div>
      <div class="panel c8"><div class="panel-h"><h3>Receita por dia</h3><span class="faint">Vendas pagas, horário de Brasília · <a href="${BASE}/financeiro" data-go="/financeiro">financeiro completo →</a></span></div><div class="panel-b"><div class="chart" id="ch"></div></div></div>
      <div class="panel c4"><div class="panel-h"><h3>Próxima aula ao vivo</h3></div><div class="panel-b">${d.nextLive ? `<div class="serif" style="font-size:22px">${esc(new Date(d.nextLive.startsAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }))}</div><p class="muted" style="margin-top:6px">${esc(d.nextLive.title)}</p>` : '<p class="muted">Aula ao vivo desativada.</p>'}
        <div class="cols" style="margin-top:14px"><div class="c6"><div class="faint" style="font-size:12px;font-weight:700">Querem a aula</div><div class="serif" style="font-size:28px">${d.live}</div></div><div class="c6"><div class="faint" style="font-size:12px;font-weight:700">Leads quentes (score ≥ 60)</div><div class="serif" style="font-size:28px">${d.hot}</div></div></div>
        <a class="btn btn-primary btn-sm" style="margin-top:12px" href="${BASE}/leads" data-go="/leads">Ver leads qualificados</a></div></div>
      <div class="panel c6"><div class="panel-h"><h3>Funil da jornada</h3><span class="faint">alunos que concluíram cada dia</span></div><div class="panel-b"><div class="funnel">${d.funnel.map((f) => `<div class="fr" title="${esc(f.title || '')}"><span>${esc(f.label)}</span><div class="bar"><i style="width:${enrolled ? (f.v / enrolled) * 100 : 0}%"></i></div><span>${f.v} · ${enrolled ? pct(f.v / enrolled) : '—'}</span></div>`).join('')}</div></div></div>
      <div class="panel c6"><div class="panel-h"><h3>Transformação medida</h3><span class="faint">quem fez o Dia 1 e o Dia 7</span></div><div class="panel-b">
        <div class="cols"><div class="c6"><div class="faint" style="font-size:12px;font-weight:700">Paz com o dinheiro · Dia 1</div><div class="serif" style="font-size:34px">${d.paz?.n ? d.paz.d1.toFixed(1).replace('.', ',') : '—'}</div></div><div class="c6"><div class="faint" style="font-size:12px;font-weight:700">Paz com o dinheiro · Dia 7</div><div class="serif" style="font-size:34px;color:var(--forest-500)">${d.paz?.n ? d.paz.d7.toFixed(1).replace('.', ',') : '—'}</div></div></div>
        <p class="faint" style="margin:6px 0 16px">${d.paz?.n ? `Média de ${d.paz.n} aluno(s). Ganho de ${(d.paz.d7 - d.paz.d1).toFixed(1).replace('.', ',')} ponto(s).` : 'Ainda sem alunos com Dia 1 e Dia 7.'}</p>
        <div class="faint" style="font-size:12px;font-weight:700;margin-bottom:8px">Fase financeira dos alunos</div>
        <div class="funnel">${[1, 2, 3].map((f) => { const v = d.phases.find((p) => p.fase === f)?.c || 0; const tot = d.phases.reduce((a, p) => a + p.c, 0); return `<div class="fr"><span>Fase ${f}</span><div class="bar"><i style="width:${tot ? (v / tot) * 100 : 0}%;background:var(--gold-500)"></i></div><span>${v}</span></div>`; }).join('')}</div>
      </div></div>
      <div class="panel c12"><div class="panel-h"><h3>Movimento recente</h3><a href="${BASE}/vendas" data-go="/vendas">Todas as vendas →</a></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Produto</th><th>Status</th><th class="r">Valor</th><th>Atualizado</th></tr></thead><tbody>
        ${d.recentSales.map((s) => `<tr class="click" data-user="${s.user_id || ''}"><td>${who(s.name, s.email)}</td><td>${esc(s.product_name || s.provider_product_id)}</td><td>${badge(s.status)}</td><td class="r">${brl(s.amount)}</td><td>${relTime(s.updated_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhuma venda ainda. Assim que a Greenn enviar o primeiro webhook, ela aparece aqui.</td></tr>'}
      </tbody></table></div></div>
    </div>`;
  barChart($('#ch'), d.series, { days: d.days });
  $$('[data-days]').forEach((b) => (b.onclick = () => pageDash(Number(b.dataset.days))));
  $$('tr[data-user]').forEach((tr) => tr.dataset.user && (tr.onclick = () => go(`/alunos/${tr.dataset.user}`)));
}

// ---------- financeiro ----------
const FIN = { preset: '30', from: '', to: '' };
const localDay = (delta = 0) => new Date(Date.now() - 3 * 3600e3 + delta * 86400e3).toISOString().slice(0, 10);
const fmtDay = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const METHOD = { PIX: 'Pix', CREDIT_CARD: 'Cartão de crédito', CARD: 'Cartão de crédito', TWO_CREDIT_CARDS: 'Dois cartões', BOLETO: 'Boleto', BANK_SLIP: 'Boleto', PAYPAL: 'PayPal', DEBIT_CARD: 'Cartão de débito', '': 'Não informado' };
const num = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
function finRange() {
  const today = localDay(0);
  const [y, m] = today.split('-').map(Number);
  const first = (yy, mm) => `${yy}-${String(mm).padStart(2, '0')}-01`;
  switch (FIN.preset) {
    case 'today': return { from: today, to: today };
    case '7': return { from: localDay(-6), to: today };
    case '90': return { from: localDay(-89), to: today };
    case 'month': return { from: first(y, m), to: today };
    case 'last': { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; const end = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10); return { from: first(py, pm), to: end }; }
    case 'custom': return { from: FIN.from || localDay(-29), to: FIN.to || today };
    default: return { from: localDay(-29), to: today };
  }
}
/** Variação contra o período anterior */
function delta(cur, prev, { invert = false, points = false } = {}) {
  if (cur == null || prev == null) return '';
  if (points) { const dp = (cur - prev) * 100; if (Math.abs(dp) < 0.05) return '<span class="delta">= anterior</span>'; const good = invert ? dp < 0 : dp > 0; return `<span class="delta ${good ? 'up' : 'down'}">${dp > 0 ? '▲' : '▼'} ${num(Math.abs(dp), 1)} p.p.</span>`; }
  if (!prev) return cur ? '<span class="delta up">novo</span>' : '';
  const r = (cur - prev) / Math.abs(prev);
  if (Math.abs(r) < 0.0005) return '<span class="delta">= anterior</span>';
  const good = invert ? r < 0 : r > 0;
  return `<span class="delta ${good ? 'up' : 'down'}">${r > 0 ? '▲' : '▼'} ${num(Math.abs(r) * 100, 0)}%</span>`;
}

async function pageFinance() {
  if (!can('admin')) { $('#main').innerHTML = head('Financeiro') + '<div class="alert alert-warn">Apenas administradores veem o financeiro.</div>'; return; }
  const rg = finRange();
  const [d, { rows: spend }, { rows: products }] = await Promise.all([api(`/api/admin/finance?from=${rg.from}&to=${rg.to}`), api(`/api/admin/marketing/spend?from=${rg.from}&to=${rg.to}`), api('/api/admin/products')]);
  const c = d.cur, p = d.prev;
  const presets = [['today', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['month', 'Este mês'], ['last', 'Mês passado'], ['90', '90 dias'], ['custom', 'Personalizado']];
  const kpi = (label, value, sub, extra = '', cls = '') => `<div class="panel kpi c3 ${cls}"><div class="l">${label}${extra}</div><div class="v">${value}</div><div class="s">${sub}</div></div>`;
  const hasSpend = c.spend > 0;
  const fallLine = (label, v, kind, hint = '') => `<div class="wf-row ${kind}"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><div class="wf-bar"><i style="width:${c.gross ? Math.min(100, (Math.abs(v) / c.gross) * 100) : 0}%"></i></div><b>${kind === 'minus' ? '− ' : ''}${brl(Math.abs(v))}</b></div>`;
  const prodOpts = products.filter((x) => x.kind !== 'bonus').map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  $('#main').innerHTML = head('Financeiro', `${fmtDay(d.from)} a ${fmtDay(d.to)} · horário de Brasília · comparado a ${fmtDay(d.prevFrom)}–${fmtDay(d.prevTo)}`,
    `<div class="tabs fin-tabs" style="margin:0">${presets.map(([k, l]) => `<button data-pre="${k}" class="${FIN.preset === k ? 'on' : ''}">${l}</button>`).join('')}</div>`) + `
    ${FIN.preset === 'custom' ? `<div class="panel panel-b fin-custom"><div class="field"><label>De</label><input class="input" type="date" id="ff" value="${d.from}"></div><div class="field"><label>Até</label><input class="input" type="date" id="ft" value="${d.to}" max="${localDay(0)}"></div><button class="btn btn-primary btn-sm" id="fapply">Aplicar</button></div>` : ''}
    <div class="cols">
      ${kpi('Faturamento bruto', brl(c.gross), `${c.approved} venda(s) aprovada(s) · ticket ${brl(c.ticket)}`, delta(c.gross, p.gross), 'dark')}
      ${kpi('Faturamento líquido', brl(c.net), `depois de taxas, reembolsos e chargebacks${c.netRealShare >= 0.999 || !c.kept.c ? '' : c.netRealShare > 0 ? ' · parte estimada' : ' · taxa estimada'}`, delta(c.net, p.net))}
      ${kpi(hasSpend ? 'Lucro após marketing' : 'Investimento em marketing', hasSpend ? `<span class="${c.profit < 0 ? 'neg' : ''}">${brl(c.profit)}</span>` : brl(0), hasSpend ? `líquido − ${brl(c.spend)} investidos · margem ${c.margin == null ? '—' : pct(c.margin)}` : 'Lance os gastos abaixo para ver ROI e ROAS', hasSpend ? delta(c.profit, p.profit) : '')}
      ${kpi('Reembolsos e chargebacks', brl(c.refunds.v + c.chargebacks.v), `${pct(c.refundRate)} das vendas · ${c.refunds.c} reembolso(s) · ${c.chargebacks.c} chargeback(s)`, delta(c.refundRate, p.refundRate, { invert: true, points: true }))}

      <div class="panel c12"><div class="panel-h"><h3>Marketing</h3><span class="faint">${hasSpend ? `${spend.length} campanha(s) ou lançamento(s) no período` : 'Sem gastos lançados no período'}</span></div>
        <div class="mk-grid">
          <div><span>Investimento</span><b>${brl(c.spend)}</b>${delta(c.spend, p.spend, { invert: true })}</div>
          <div><span>ROAS</span><b>${c.roas == null ? '—' : `${num(c.roas)}x`}</b><small>bruto ÷ investimento</small></div>
          <div><span>ROI</span><b class="${c.roi < 0 ? 'neg' : ''}">${c.roi == null ? '—' : pct(c.roi)}</b><small>(líquido − invest.) ÷ invest.</small></div>
          <div><span>Custo por venda (CAC)</span><b>${c.cac == null ? '—' : brl(c.cac)}</b><small>investimento ÷ vendas</small></div>
          <div><span>Lucro</span><b class="${c.profit < 0 ? 'neg' : ''}">${brl(c.profit)}</b><small>líquido − investimento</small></div>
          <div><span>Cliques · impressões</span><b>${c.clicks ? c.clicks.toLocaleString('pt-BR') : '—'}</b><small>${c.impressions ? `${c.impressions.toLocaleString('pt-BR')} impressões${c.clicks ? ` · CPC ${brl(c.spend / c.clicks)}` : ''}` : 'importando o CSV da Meta'}</small></div>
        </div></div>

      <div class="panel c8"><div class="panel-h"><h3>Faturamento por dia</h3><div class="legend"><span><i style="background:#C9D3DC"></i>Bruto</span><span><i style="background:#1F6B52"></i>Líquido</span><span><i class="ln"></i>Investimento</span></div></div><div class="panel-b"><div class="chart tall" id="fch"></div></div></div>
      <div class="panel c4"><div class="panel-h"><h3>Do bruto ao lucro</h3></div><div class="panel-b wf">
        ${fallLine('Faturamento bruto', c.gross, 'total')}
        ${fallLine('Reembolsos', c.refunds.v, 'minus', `${c.refunds.c} venda(s)`)}
        ${fallLine('Chargebacks', c.chargebacks.v, 'minus', `${c.chargebacks.c} venda(s)`)}
        ${fallLine('Taxas da plataforma', c.fees, 'minus', c.netRealShare >= 0.999 && c.kept.c ? 'valor real da Greenn' : `${num(d.fee.percent)}% + ${brl(d.fee.fixed)} por venda`)}
        ${fallLine('Faturamento líquido', c.net, 'sub')}
        ${fallLine('Marketing', c.spend, 'minus')}
        ${fallLine('Lucro', c.profit, c.profit < 0 ? 'neg-total' : 'total profit')}
        <a class="faint" style="font-size:12px" href="${BASE}/config" data-go="/config">Ajustar a taxa usada na estimativa →</a>
      </div></div>

      <div class="panel c12"><div class="panel-h"><h3>Por produto</h3><span class="faint">vendas feitas no período</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Produto</th><th class="r">Vendas</th><th class="r">Bruto</th><th class="r">Reembolsos</th><th class="r">Líquido</th><th class="r">Investimento</th><th class="r">ROAS</th></tr></thead><tbody>
        ${d.byProduct.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td class="r">${r.c}</td><td class="r">${brl(r.gross)}</td><td class="r">${r.refunds ? `<span class="neg">${brl(r.refunds)}</span>` : '—'}</td><td class="r">${brl(r.net)}</td><td class="r">${r.spend ? brl(r.spend) : '—'}</td><td class="r">${r.roas == null ? '—' : `${num(r.roas)}x`}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nenhuma venda aprovada no período.</td></tr>'}
        ${d.spendUnassigned ? `<tr><td class="faint">Investimento sem produto definido</td><td></td><td></td><td></td><td></td><td class="r">${brl(d.spendUnassigned)}</td><td></td></tr>` : ''}
      </tbody></table></div></div>

      <div class="panel c6"><div class="panel-h"><h3>Formas de pagamento</h3></div><div class="panel-b">
        ${d.byMethod.length ? `<div class="funnel">${d.byMethod.map((r) => `<div class="fr fr-wide"><span>${esc(METHOD[r.method] || r.method)}</span><div class="bar"><i style="width:${c.gross ? (r.gross / c.gross) * 100 : 0}%"></i></div><span>${brl(r.gross)} · ${r.c}</span></div>`).join('')}</div>` : '<p class="muted">Sem vendas no período.</p>'}
        <dl class="kv" style="margin-top:16px"><dt>Aguardando pagamento</dt><dd>${c.pending.c} pedido(s) · ${brl(c.pending.v)}</dd><dt>Recusadas</dt><dd>${c.refused}</dd><dt>Conversão de pedidos</dt><dd>${c.payRate == null ? '—' : pct(c.payRate)} <small class="faint">aprovadas ÷ (aprovadas + aguardando + recusadas)</small></dd><dt>Checkouts abandonados</dt><dd>${c.abandoned}</dd></dl>
      </div></div>
      <div class="panel c6"><div class="panel-h"><h3>Origem das vendas (UTM)</h3><span class="faint">utm_source · utm_campaign</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Origem</th><th>Campanha</th><th class="r">Vendas</th><th class="r">Bruto</th></tr></thead><tbody>
        ${d.bySource.map((r) => `<tr><td>${r.source ? esc(r.source) : '<span class="faint">sem UTM</span>'}</td><td>${r.campaign ? esc(r.campaign) : '<span class="faint">—</span>'}</td><td class="r">${r.c}</td><td class="r">${brl(r.gross)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Sem vendas no período.</td></tr>'}
      </tbody></table></div></div>

      <div class="panel c12"><div class="panel-h"><h3>Gastos com marketing</h3><div class="actions"><button class="btn btn-soft btn-sm" id="mkimp">Importar CSV da Meta</button><button class="btn btn-primary btn-sm" id="mkadd">+ Lançar gasto</button></div></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Campanha / descrição</th><th>Período</th><th>Produto</th><th>Origem</th><th class="r">Cliques</th><th class="r">Investido</th><th></th></tr></thead><tbody>
        ${spend.map((r, i) => `<tr><td><b>${esc(r.campaign_name || 'Sem nome')}</b></td><td>${r.date_from === r.date_to ? fmtDay(r.date_from) : `${fmtDay(r.date_from).slice(0, 5)} a ${fmtDay(r.date_to)} <small class="faint">· ${r.days} dias</small>`}</td><td>${esc(r.product_name || 'Geral')}</td><td>${r.source === 'manual' ? '<span class="badge">Manual</span>' : r.source === 'meta' ? '<span class="badge ok">Meta Ads</span>' : '<span class="badge gold">CSV da Meta</span>'}</td><td class="r">${r.clicks ? r.clicks.toLocaleString('pt-BR') : '—'}</td><td class="r"><b>${brl(r.spend)}</b></td><td class="r"><button class="btn btn-ghost btn-sm" data-sdel="${i}">Excluir</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nenhum gasto no período. Lance manualmente ou importe o relatório do Gerenciador de Anúncios.</td></tr>'}
        </tbody></table></div>
        <div class="panel-b meta-soon"><div><b>Integração direta com a Meta Ads</b><p class="faint" style="margin:4px 0 0">Próxima etapa: conectar a conta de anúncios para os gastos, cliques e impressões entrarem sozinhos todos os dias, por campanha. Enquanto isso, o CSV do Gerenciador de Anúncios já alimenta ROAS, ROI e CAC.</p></div><span class="badge gold">Em breve</span></div>
      </div>

      <div class="panel c12"><div class="panel-h"><h3>Reembolsos e chargebacks do período</h3><a href="${BASE}/vendas" data-go="/vendas">Todas as vendas →</a></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Produto</th><th>Status</th><th class="r">Valor</th><th>Quando</th></tr></thead><tbody>
        ${d.refundsList.map((s) => `<tr class="click" data-user="${s.user_id || ''}"><td>${who(s.name, s.email)}</td><td>${esc(s.product_name || s.provider_product_id)}</td><td>${badge(s.status)}</td><td class="r">${brl(s.amount)}</td><td>${fmtDateTime(s.refunded_at || s.updated_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum reembolso no período.</td></tr>'}
      </tbody></table></div></div>
    </div>`;
  finChart($('#fch'), d.series);
  $$('[data-pre]').forEach((b) => (b.onclick = () => { FIN.preset = b.dataset.pre; if (FIN.preset === 'custom' && !FIN.from) { FIN.from = d.from; FIN.to = d.to; } pageFinance(); }));
  $('#fapply')?.addEventListener('click', () => { FIN.from = $('#ff').value; FIN.to = $('#ft').value; if (!FIN.from || !FIN.to) return toast('Escolha as duas datas', { error: true }); pageFinance(); });
  $$('tr[data-user]').forEach((tr) => tr.dataset.user && (tr.onclick = () => go(`/alunos/${tr.dataset.user}`)));
  $$('[data-sdel]').forEach((b) => (b.onclick = async () => {
    const r = spend[Number(b.dataset.sdel)];
    if (!confirm(r.source === 'manual' ? `Excluir o lançamento "${r.campaign_name || 'sem nome'}" (${brl(r.spend)})?` : `Excluir os gastos da campanha "${r.campaign_name || 'sem nome'}" entre ${fmtDay(d.from)} e ${fmtDay(d.to)}?`)) return;
    try { await api(`/api/admin/marketing/spend?${qs({ source: r.source, grp: r.grp, from: d.from, to: d.to })}`, { method: 'DELETE' }); toast('Excluído'); pageFinance(); } catch (er) { toast(er.message, { error: true }); }
  }));
  $('#mkadd').onclick = () => modal({ title: 'Lançar gasto com marketing', eyebrow: 'Marketing', body: `<form id="sf2" class="form-grid">
      <div class="field"><label>Data (ou início)</label><input class="input" type="date" name="date" value="${localDay(0)}" required></div>
      <div class="field"><label>Até (opcional)</label><input class="input" type="date" name="date_to"><span class="hint">Para um período, o valor é dividido igualmente entre os dias.</span></div>
      <div class="field"><label>Valor investido (R$)</label><input class="input" name="spend" inputmode="decimal" placeholder="Ex.: 350,00" required></div>
      <div class="field"><label>Produto</label><select class="input" name="product_id"><option value="">Geral / vários produtos</option>${prodOpts}</select></div>
      <div class="field full"><label>Campanha ou descrição</label><input class="input" name="campaign_name" placeholder="Ex.: Meta · Desafio 7 dias · Público frio"></div>
      <div class="full"><button class="btn btn-primary">Lançar</button></div></form>`,
    onMount: (m, close) => m.querySelector('#sf2').addEventListener('submit', async (e) => { e.preventDefault(); await withLoading(e.submitter, async () => { try { const r = await api('/api/admin/marketing/spend', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); close(); toast(r.days > 1 ? `${brl(r.total)} lançados em ${r.days} dias` : 'Gasto lançado'); pageFinance(); } catch (er) { toast(er.message, { error: true }); } }); }) });
  $('#mkimp').onclick = () => modal({ title: 'Importar relatório da Meta', eyebrow: 'Marketing', wide: true, body: `<ol class="steps-list">
      <li>No <b>Gerenciador de Anúncios</b>, escolha o período e o nível <b>Campanhas</b>.</li>
      <li>Em <b>Detalhamento › Por tempo</b>, marque <b>Dia</b>.</li>
      <li>Clique em <b>Exportar › Exportar dados da tabela › .csv</b>.</li>
      <li>Envie o arquivo aqui. Reimportar o mesmo período <b>atualiza</b> os valores, sem duplicar.</li></ol>
      <form id="imf" class="form-grid"><div class="field"><label>Arquivo CSV</label><input class="input" type="file" name="file" accept=".csv,text/csv" required></div>
      <div class="field"><label>Produto das campanhas</label><select class="input" name="product_id"><option value="">Geral / vários produtos</option>${prodOpts}</select></div>
      <div class="full"><button class="btn btn-primary">Importar</button></div></form>`,
    onMount: (m, close) => m.querySelector('#imf').addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target.file.files[0]; if (!f) return; if (f.size > 6 * 1024 * 1024) return toast('Arquivo muito grande (máximo 6 MB).', { error: true });
      await withLoading(e.submitter, async () => { try { const csv = await f.text(); const r = await api('/api/admin/marketing/import', { method: 'POST', body: { csv, product_id: e.target.product_id.value } }); close(); toast(`${brl(r.total)} importados (${fmtDay(r.from)} a ${fmtDay(r.to)})`, { ms: 5000 }); pageFinance(); } catch (er) { toast(er.message, { error: true, ms: 7000 }); } }); }) });
}

/** Colunas agrupadas (bruto e líquido) com a linha de investimento */
function finChart(el, pts) {
  const W = 800, H = 300, pad = { l: 52, r: 8, t: 12, b: 24 };
  const max = Math.max(...pts.map((p) => Math.max(p.gross, p.spend)), 0);
  const nice = max ? Math.pow(10, Math.floor(Math.log10(max))) : 100; const top = max ? Math.ceil(max / nice) * nice : 100;
  const bw = (W - pad.l - pad.r) / pts.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const bar = (x, w, v, fill) => { const h = H - pad.b - y(v); if (h <= 0) return ''; const r = Math.min(3, w / 2, h); return `<path d="M${x},${H - pad.b} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z" fill="${fill}"/>`; };
  const grid = [0, 0.5, 1].map((f) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(top * f)}" y2="${y(top * f)}" stroke="#EDE8DD"/><text x="${pad.l - 8}" y="${y(top * f) + 4}" text-anchor="end" font-size="11" fill="#7C8893">${(top * f).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</text>`).join('');
  const step = Math.ceil(pts.length / 8);
  const gw = Math.max(2, bw * 0.72), w1 = gw / 2;
  const bars = pts.map((p, i) => { const x0 = pad.l + i * bw + (bw - gw) / 2; return `<g data-i="${i}"><rect x="${pad.l + i * bw}" y="${pad.t}" width="${bw}" height="${H - pad.t - pad.b}" fill="transparent"/>${bar(x0, w1, p.gross, '#C9D3DC')}${bar(x0 + w1, w1, p.net, '#1F6B52')}${i % step === 0 ? `<text x="${pad.l + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#7C8893">${p.d.slice(8, 10)}/${p.d.slice(5, 7)}</text>` : ''}</g>`; }).join('');
  const hasSpend = pts.some((p) => p.spend > 0);
  const line = hasSpend ? `<polyline fill="none" stroke="#C9A45C" stroke-width="2.2" stroke-linejoin="round" points="${pts.map((p, i) => `${pad.l + i * bw + bw / 2},${y(p.spend)}`).join(' ')}"/>${pts.length <= 45 ? pts.map((p, i) => `<circle cx="${pad.l + i * bw + bw / 2}" cy="${y(p.spend)}" r="2.6" fill="#C9A45C"/>`).join('') : ''}` : '';
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Faturamento por dia">${grid}<line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" stroke="#D6CEBC"/>${bars}<g style="pointer-events:none">${line}</g></svg><div class="tip"></div>`;
  const tip = el.querySelector('.tip');
  el.querySelectorAll('g[data-i]').forEach((g) => {
    g.addEventListener('mouseenter', () => {
      const p = pts[g.dataset.i]; const box = el.getBoundingClientRect(); const rb = g.getBoundingClientRect();
      tip.innerHTML = `<b>${p.d.slice(8, 10)}/${p.d.slice(5, 7)} · ${p.c} venda(s)</b>Bruto ${brl(p.gross)}<br>Líquido ${brl(p.net)}${p.spend ? `<br>Investido ${brl(p.spend)}` : ''}`;
      tip.style.left = `${Math.min(box.width - 80, Math.max(80, rb.left - box.left + rb.width / 2))}px`; tip.style.top = `${Math.max(70, (y(Math.max(p.gross, p.spend)) / H) * box.height)}px`; tip.style.opacity = 1;
    });
    g.addEventListener('mouseleave', () => (tip.style.opacity = 0));
  });
}

// ---------- alunos ----------
async function pageStudents() {
  const st = { q: '', access: '', nopass: '', page: 1 };
  $('#main').innerHTML = head('Alunos', 'Todos que compraram ou foram cadastrados manualmente.', can('support') ? '<button class="btn btn-primary" id="new">+ Cadastrar aluno</button>' : '') + `
    <div class="panel"><div class="toolbar"><input class="input search" id="q" placeholder="Buscar por nome, e-mail, telefone ou CPF"><select class="input" id="acc"><option value="">Todos</option><option value="active">Com acesso ativo</option><option value="revoked">Sem acesso</option></select><select class="input" id="np"><option value="">Qualquer senha</option><option value="1">Ainda não criou senha</option></select></div><div id="list"></div></div>`;
  const load = async () => {
    const d = await api(`/api/admin/students?${qs(st)}`);
    $('#list').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Aluno</th><th>Acesso</th><th>Progresso</th><th>Fase</th><th>Último acesso</th><th>Cadastro</th></tr></thead><tbody>
      ${d.rows.map((u) => `<tr class="click" data-id="${u.id}"><td>${who(u.name, u.email, u.phone ? ` · ${esc(u.phone)}` : '')}</td><td>${u.status === 'blocked' ? badge('blocked') : u.products ? `<span class="badge ok">${esc(u.products)}</span>` : '<span class="badge">Sem acesso</span>'}${u.has_password ? '' : ' <span class="badge warn">sem senha</span>'}</td>
        <td>${u.days_completed != null ? `${u.days_completed}/7` : '—'}</td><td>${u.fase ? `Fase ${u.fase}` : '—'}</td><td>${relTime(u.last_seen_at)}</td><td>${fmtDate(u.created_at)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhum aluno encontrado.</td></tr>'}
      </tbody></table></div>${pager(d, (p) => { st.page = p; load(); })}`;
    $$('#list tr[data-id]').forEach((tr) => (tr.onclick = () => go(`/alunos/${tr.dataset.id}`)));
  };
  $('#q').oninput = debounce(() => { st.q = $('#q').value; st.page = 1; load(); });
  $('#acc').onchange = () => { st.access = $('#acc').value; st.page = 1; load(); };
  $('#np').onchange = () => { st.nopass = $('#np').value; st.page = 1; load(); };
  $('#new')?.addEventListener('click', newStudent);
  load();
}

async function newStudent() {
  const { rows } = await api('/api/admin/products');
  modal({ title: 'Cadastrar aluno', eyebrow: 'Acesso manual', body: `<form id="ns">
    <div class="field"><label>Nome</label><input class="input" name="name" required></div>
    <div class="field"><label>E-mail</label><input class="input" name="email" type="email" required></div>
    <div class="field"><label>WhatsApp</label><input class="input" name="phone"></div>
    <div class="field"><span class="label">Liberar acesso a</span>${rows.map((p) => `<label class="switch" style="margin:4px 0"><input type="checkbox" name="p" value="${p.id}" ${p.kind === 'challenge' ? 'checked' : ''}> ${esc(p.name)}</label>`).join('<br>')}</div>
    <label class="switch"><input type="checkbox" name="send" checked> Enviar e-mail de acesso</label>
    <div style="margin-top:18px"><button class="btn btn-primary">Cadastrar</button></div></form>`,
  onMount: (m, close) => m.querySelector('#ns').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    await withLoading(e.submitter, async () => {
      try {
        const r = await api('/api/admin/students', { method: 'POST', body: { name: f.get('name'), email: f.get('email'), phone: f.get('phone'), product_ids: f.getAll('p'), send_email: !!f.get('send') } });
        close(); toast(r.created ? 'Aluno cadastrado' : 'Aluno já existia: acesso atualizado'); go(`/alunos/${r.id}`);
      } catch (er) { toast(er.message, { error: true }); }
    });
  }) });
}

/** Liberar (ou reativar / alterar validade de) um produto para o aluno */
function grantModal(d, id, productId = null, onlyExpiry = false) {
  const enr = (pid) => d.enrollments.find((e) => e.product_id === pid);
  const isActive = (pid) => { const e = enr(pid); return e && e.status === 'active' && (!e.expires_at || e.expires_at > new Date().toISOString()); };
  const options = d.products.filter((p) => p.active && (productId ? p.id === productId : !isActive(p.id)));
  if (!options.length) { toast('Este aluno já tem acesso a todos os produtos ativos.'); return; }
  const cur = productId ? enr(productId) : null;
  const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const curExp = cur?.expires_at ? new Date(Date.parse(cur.expires_at) - 3 * 3600e3).toISOString().slice(0, 10) : '';
  const defLabel = (p) => (p.access_days ? `Padrão do produto (${p.access_days} dias)` : 'Padrão do produto (vitalício)');
  modal({ title: onlyExpiry ? 'Alterar validade' : productId ? 'Reativar acesso' : 'Liberar produto', eyebrow: d.user.name || d.user.email, body: `<form id="gf">
    <div class="field"><label>Produto</label><select class="input" name="product_id" ${productId ? 'disabled' : ''}>${options.map((p) => `<option value="${p.id}">${esc(p.name)}${enr(p.id) ? ' (reativar)' : ''}</option>`).join('')}</select></div>
    <div class="field"><span class="label">Validade do acesso</span>
      <div class="radio-row">
        ${onlyExpiry ? '' : `<label class="radio"><input type="radio" name="mode" value="default" checked><span id="deflabel">${esc(defLabel(options[0]))}</span></label>`}
        <label class="radio"><input type="radio" name="mode" value="life" ${onlyExpiry && !curExp ? 'checked' : ''}><span>Vitalício</span></label>
        <label class="radio"><input type="radio" name="mode" value="date" ${onlyExpiry && curExp ? 'checked' : ''}><span>Até uma data</span></label>
      </div>
      <input class="input" type="date" name="date" min="${today}" value="${esc(curExp)}" style="margin-top:10px;${onlyExpiry && curExp ? '' : 'display:none'}">
    </div>
    ${onlyExpiry ? '' : '<label class="switch" style="margin:4px 0 6px"><input type="checkbox" name="notify" checked> Avisar o aluno por e-mail</label><p class="hint" style="margin:0 0 4px">Se ele ainda não criou a senha, recebe o link de acesso. Se já criou, recebe o aviso do produto novo.</p>'}
    <div style="margin-top:16px;display:flex;gap:8px"><button class="btn btn-primary">${onlyExpiry ? 'Salvar validade' : 'Liberar acesso'}</button><button type="button" class="btn btn-ghost" data-close>Cancelar</button></div></form>`,
  onMount: (m, close) => {
    const f = m.querySelector('#gf');
    const sync = () => { f.date.style.display = f.querySelector('[name=mode]:checked')?.value === 'date' ? '' : 'none'; const p = options.find((x) => String(x.id) === String(f.product_id.value)); const dl = m.querySelector('#deflabel'); if (dl && p) dl.textContent = defLabel(p); };
    f.addEventListener('change', sync); sync();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = f.querySelector('[name=mode]:checked')?.value || 'default';
      if (mode === 'date' && !f.date.value) { toast('Escolha a data de validade.', { error: true }); return; }
      const body = { product_id: Number(productId || f.product_id.value), notify: !onlyExpiry && f.notify?.checked };
      if (mode === 'life') body.expires_at = null; else if (mode === 'date') body.expires_at = f.date.value;
      await withLoading(e.submitter, async () => {
        try {
          const r = await api(`/api/admin/students/${id}/grant`, { method: 'POST', body });
          close();
          toast(onlyExpiry ? 'Validade atualizada' : r.email === 'failed' ? 'Acesso liberado, mas o e-mail falhou. Use "Enviar link de acesso".' : r.email ? 'Acesso liberado e aluno avisado por e-mail' : 'Acesso liberado', { error: r.email === 'failed', ms: 4500 });
          pageStudent(id);
        } catch (er) { toast(er.message, { error: true }); }
      });
    });
  } });
}

async function pageStudent(id) {
  const d = await api(`/api/admin/students/${id}`);
  const u = d.user;
  const j = d.journeys.find((x) => x.hasActivities) || null; // desafio com atividades (respostas e números)
  const c = j?.computed;
  const ans = j?.answers || {};
  setCurrency(ans[1]?.moeda || 'BRL');
  const txt = (v) => (v ? `<div class="quote">${esc(v)}</div>` : '<span class="faint">—</span>');
  $('#main').innerHTML = `<a href="${BASE}/alunos" data-go="/alunos" class="faint" style="font-weight:700">← Alunos</a>` + head(esc(u.name || u.email), `${esc(u.email)}${u.phone ? ` · ${esc(u.phone)}` : ''} · cadastrado em ${fmtDate(u.created_at)}`,
    can('support') ? `<button class="btn btn-soft" id="link">Enviar link de acesso</button><button class="btn btn-soft" id="edit">Editar</button>${can('owner') ? '<button class="btn btn-danger" id="del">Excluir</button>' : ''}` : '') + `
    <div class="cols">
      <div class="c8 gap">
        ${d.journeys.map((jj) => { const uu = jj.product.unitLabel || 'Dia'; const isJ = jj === j; return `<div class="panel"><div class="panel-h"><div><div class="eyebrow">${esc({ challenge: 'Desafio', course: 'Curso' }[jj.product.kind] || '')}${jj.status !== 'active' ? ` · ${esc(STATUS[jj.status]?.[0] || jj.status)}` : ''}</div><h3 style="margin-top:4px">${esc(jj.product.name)}</h3></div><div style="display:flex;gap:8px;align-items:center">${can('support') && jj.status === 'active' ? `<button class="btn btn-soft btn-sm" data-unlock="${jj.product.id}">Liberar ${/^(aula|lição|semana|etapa|parte|sessão)$/i.test(uu) ? 'próxima' : 'próximo'} ${esc(uu.toLowerCase())} agora</button>` : ''}</div></div><div class="panel-b">
          <div class="days" style="grid-template-columns:repeat(${Math.min(7, Math.max(1, jj.states.length))},1fr)">${jj.states.map((s) => `<div class="${s.completed ? 'done' : s.available ? 'open' : ''}" title="${esc(s.title)}"><b>${s.number}</b>${s.completed ? 'concluído' : s.available ? 'liberado' : s.availableAt ? fmtDateTime(s.availableAt).slice(0, 8) : 'bloqueado'}</div>`).join('') || '<span class="faint">Sem aulas publicadas.</span>'}</div>
          ${isJ && c ? `<div class="cols" style="margin-top:16px">${[['Renda', brl(c.renda)], ['Sobra real', ans[4] ? brl(c.sobraReal) : '—'], ['Dívidas', `${brl(c.dividaTotal)}${c.dividasAtraso ? ` · ${c.dividasAtraso} em atraso` : ''}`], ['Fase', c.faseNome || '—'], ['Guardado', ans[4] ? brl(c.guardado) : '—'], ['Pode direcionar/mês', brl(c.direcionar)], ['Paz D1 → D7', `${c.pazD1 ?? '—'} → ${c.pazD7 ?? '—'}`], ['Score de lead', `${c.leadScore}/100`]].map(([l, v]) => `<div class="c3"><div class="faint" style="font-size:12px;font-weight:700">${l}</div><div style="font-weight:700;margin-top:2px">${v}</div></div>`).join('')}</div>` : ''}
        </div></div>`; }).join('')}
        ${j ? '' : (d.journeys.length ? '' : '<div class="panel panel-b"><p class="muted" style="margin:0">Este aluno ainda não tem produtos com aulas.</p></div>')}
        <div class="panel" ${j ? '' : 'hidden'}><div class="panel-h"><h3>Respostas das atividades · ${esc(j?.product.name || '')}</h3><div class="tabs" style="margin:0" id="dtabs">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button data-d="${n}" ${ans[n] ? '' : 'style="opacity:.45"'}>D${n}</button>`).join('')}</div></div><div class="panel-b" id="dans"><p class="faint">Selecione um dia.</p></div></div>
        <div class="panel"><div class="panel-h"><h3>Compras</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Venda</th><th>Produto</th><th>Status</th><th class="r">Valor</th><th>Data</th></tr></thead><tbody>${d.sales.map((s) => `<tr><td>${esc(s.sale_id)}</td><td>${esc(s.product_name || s.provider_product_id)}</td><td>${badge(s.status)}</td><td class="r">${brl(s.amount)}</td><td>${fmtDateTime(s.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sem compras registradas (acesso manual).</td></tr>'}</tbody></table></div></div>
      </div>
      <div class="c4 gap">
        <div class="panel"><div class="panel-h"><h3>Produtos do aluno</h3>${can('support') ? '<button class="btn btn-primary btn-sm" id="grant">+ Liberar produto</button>' : ''}</div><div class="panel-b acc-list">${d.enrollments.length ? d.enrollments.map((e) => { const p = d.products.find((x) => x.id === e.product_id) || {}; const active = e.status === 'active' && (!e.expires_at || e.expires_at > new Date().toISOString()); const expired = e.status === 'active' && e.expires_at && e.expires_at <= new Date().toISOString(); return `<div class="acc"><span class="acc-dot" style="background:${esc(p.theme?.accent || '#C9A45C')};box-shadow:0 0 0 3px ${esc(p.theme?.primary || '#0B1A2A')}"></span><div class="acc-main"><b>${esc(e.pname)}</b><small>${expired ? '<span class="badge warn">Expirado</span>' : active ? '<span class="badge ok">Ativo</span>' : badge(e.status)} ${{ greenn: 'Greenn', manual: 'Manual' }[e.source] || esc(e.source)} · desde ${fmtDate(e.started_at)}${e.expires_at ? ` · até ${fmtDate(e.expires_at)}` : ' · vitalício'}</small></div>${can('support') ? `<div class="acc-act">${active || expired ? `<button class="btn btn-soft btn-sm" data-exp="${e.product_id}" title="Alterar validade">Validade</button><button class="btn btn-danger btn-sm" data-acc="revoke" data-pid="${e.product_id}">Remover</button>` : `<button class="btn btn-soft btn-sm" data-reac="${e.product_id}">Reativar</button>`}</div>` : ''}</div>`; }).join('') : '<p class="faint" style="margin:0">Nenhum produto ainda.</p>'}</div></div>
        <div class="panel"><div class="panel-h"><h3>Conta</h3></div><div class="panel-b"><dl class="kv" style="grid-template-columns:110px 1fr">
          <dt>Status</dt><dd>${badge(u.status)}</dd><dt>Senha</dt><dd>${u.has_password ? 'Criada' : '<span class="badge warn">Ainda não criou</span>'}</dd><dt>Último login</dt><dd>${fmtDateTime(u.last_login_at)}</dd><dt>Visto por último</dt><dd>${relTime(u.last_seen_at)}</dd><dt>CPF/CNPJ</dt><dd>${esc(u.document || '—')}</dd>${u.notes ? `<dt>Notas</dt><dd>${esc(u.notes)}</dd>` : ''}</dl></div></div>
        <div class="panel"><div class="panel-h"><h3>E-mails enviados</h3></div><div class="panel-b" style="font-size:13px">${d.notifications.filter((n) => n.channel === 'email').map((n) => `<div style="display:flex;justify-content:space-between;padding:5px 0"><span>${esc({ access: 'Acesso', product_access: 'Novo produto', release: `Liberação ${n.ref.split(':')[1] ? '· aula ' + n.ref.split(':')[1] : ''}`, reset: 'Senha' }[n.kind] || n.kind)}</span><span>${n.status === 'failed' ? `<span class="badge err" title="${esc(n.error)}">falhou</span>` : n.status === 'logged' ? '<span class="badge">modo teste</span>' : '<span class="badge ok">enviado</span>'} <small class="faint">${relTime(n.created_at)}</small></span></div>`).join('') || '<span class="faint">Nenhum.</span>'}</div></div>
      </div>
    </div>`;

  const dayView = (n) => {
    const a = ans[n];
    if (!a) return '<p class="faint">Ainda não preencheu este dia.</p>';
    const L = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
    const rows = (arr, cols) => (arr || []).filter((r0) => Object.values(r0 || {}).some(Boolean)).map((r0) => cols.map((k) => (typeof r0[k] === 'boolean' ? (r0[k] ? 'Sim' : '') : esc(r0[k] ?? ''))).filter(Boolean).join(' · ')).join('<br>') || '—';
    const fb = a.feedback ? `<div style="margin-top:14px"><b>Como foi a aula</b>${txt(a.feedback)}</div>` : '';
    if (n === 1) return `<dl class="kv">${L('Rendas', rows(a.rendas, ['fonte', 'tipo', 'valor']))}${L('Dívidas', rows(a.dividas, ['credor', 'saldo', 'parcela', 'situacao']))}${L('Sobra estimada', brl(Number(String(a.sobraEstimada || 0).replace(/\./g, '').replace(',', '.'))))}${NOTAS_RETRATO.map(([k, l]) => L(l, a.notas?.[k] ?? '—')).join('')}${L('Paz', a.paz ?? '—')}${L('Cenário', txt(a.cenario))}${L('Medos', (a.medos || []).filter(Boolean).map(esc).join('<br>') || '—')}${L('Dificuldades', (a.dificuldades || []).filter(Boolean).map(esc).join('<br>') || '—')}${L('Espera de Deus', txt(a.esperaDeus))}${L('Propósito', txt(a.proposito))}${L('Reflexão', txt(a.reflexao))}</dl>${fb}`;
    if (n === 2) return `<dl class="kv">${(a.altar || []).map((x, i) => L(`Altar ${i + 1}`, `${esc(x?.resposta || '—')}${x?.porque ? ` · ${esc(x.porque)}` : ''}`)).join('')}${L('No trono', txt(a.trono))}${L('Renuncia', txt(a.renuncio))}${L('Custos fixos', rows(a.custos, ['categoria', 'item', 'valor', 'essencial']))}</dl>${fb}`;
    if (n === 3) return `<dl class="kv">${L('Armas frequentes', ARMAS.filter((x) => a.armas?.[x]?.vida === 'Frequente').join(', ') || '—')}${L('Frutos', FRUTOS.filter((x) => a.frutos?.[x]).map(esc).join('<br>') || '—')}${L('Mentiras', Object.entries(a.mentiras || {}).filter(([, v]) => v?.acreditei).map(([k, v]) => `${esc(k)}${v.verdade ? ` → <i>${esc(v.verdade)}</i>` : ''}`).join('<br>') || '—')}${L('Reflexões', txt(a.reflexoes))}${L('Propósito', a.proposito ? `${esc(a.proposito.com || '')} · ${esc(a.proposito.buscar || '')} · início ${esc(a.proposito.inicio || '—')}` : '—')}</dl>${fb}`;
    if (n === 4) return `<dl class="kv">${L('Nota de mordomia', c.mordomiaD4?.toFixed(1) ?? '—')}${L('Gastos variáveis', `${brl(c.variaveis)} · ${pct(c.emocionalPct)} emocional`)}${L('Sobra real', brl(c.sobraReal))}${L('Guardado', brl(c.guardado))}${L('Patrimônio', brl(c.patrimonio))}${L('Fase', c.faseNome || '—')}${L('Checkpoint 1', a.checkpoint ? `Imóvel próprio: ${esc(a.checkpoint.imovel || '—')} · Mora: ${esc(a.checkpoint.mora || '—')} ${esc(a.checkpoint.pais || '')} · ${esc(a.checkpoint.estadoCivil || '')} · filhos: ${esc(a.checkpoint.filhos ?? '—')}` : '—')}</dl>${fb}`;
    if (n === 5) return `<dl class="kv">${L('Hoje', esc(a.hoje || '—'))}${L('Sente', esc((a.sinto || []).join(', ') || '—'))}${L('Deus falou', txt(a.falou))}${L('Dízimo mensal', brl(c.dizimo))}${L('Decisão', `${esc(a.inicio || '—')} · recebe dia ${esc(a.diasRecebo || '—')}`)}</dl>${fb}`;
    if (n === 6) return `<dl class="kv">${L('Primícia', brl(c.primicia))}${L('Ofertas', brl(c.ofertas))}${L('Generosidade', a.generosidade ? `${esc(a.generosidade.para || '')} · ${esc(a.generosidade.oque || '')} · ${esc(a.generosidade.quando || '')}` : '—')}${L('Sobra da Casa em Ordem', brl(c.sobraCasa))}</dl>${fb}`;
    return `<dl class="kv">${L('Sonhos', ['curto', 'medio', 'longo'].map((k) => a.sonhos?.[k]?.oque ? `${esc(a.sonhos[k].oque)} (${brl(Number(String(a.sonhos[k].valor || 0).replace(/\./g, '').replace(',', '.')))}, ${esc(a.sonhos[k].anos || '?')} anos)` : '').filter(Boolean).join('<br>') || '—')}${L('Sonha com imóvel', esc(a.imovelSonho || '—'))}${L('Direcionar/mês', brl(c.direcionar))}${L('Paz D1 → D7', `${c.pazD1 ?? '—'} → ${c.pazD7 ?? '—'}`)}${L('O que mudou', txt(a.mudou))}${L('Deus mostrou', txt(a.mostrou))}${L('Recado ao Rhus', txt(a.recado))}${L('Autoriza relato', esc(a.autoriza || '—'))}${L('WhatsApp', esc(a.whatsapp || '—'))}${L('Quer aula ao vivo', esc(a.aulaAoVivo || '—'))}</dl>${fb}`;
  };
  $$('#dtabs [data-d]').forEach((b) => (b.onclick = () => { $$('#dtabs button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); $('#dans').innerHTML = dayView(Number(b.dataset.d)); }));
  const lastDay = [7, 6, 5, 4, 3, 2, 1].find((n) => ans[n]);
  if (lastDay) $(`#dtabs [data-d="${lastDay}"]`).click();

  $('#link')?.addEventListener('click', async (e) => {
    await withLoading(e.currentTarget, async () => {
      const r = await api(`/api/admin/students/${id}/send-access`, { method: 'POST' });
      modal({ title: 'Link de acesso gerado', body: `<p class="muted">${r.email === 'failed' ? `O e-mail falhou (${esc(r.error)}). ` : r.email === 'logged' ? 'E-mail em modo teste (não enviado). ' : 'Enviamos por e-mail. '}Você também pode copiar e mandar pelo WhatsApp. Vale por 72h e só pode ser usado uma vez.</p><div class="copy"><input class="input" readonly value="${esc(r.link)}"><button class="btn btn-primary" data-copy>Copiar</button></div>`,
        onMount: (m) => m.querySelector('[data-copy]').addEventListener('click', () => { navigator.clipboard.writeText(r.link); toast('Link copiado'); }) });
    });
  });
  $$('[data-unlock]').forEach((b) => (b.onclick = async () => { try { const r = await api(`/api/admin/students/${id}/unlock-next`, { method: 'POST', body: { product_id: Number(b.dataset.unlock) } }); toast(`${r.day}º liberado`); pageStudent(id); } catch (er) { toast(er.message, { error: true }); } }));
  $('#grant')?.addEventListener('click', () => grantModal(d, id));
  $$('[data-reac]').forEach((b) => (b.onclick = () => grantModal(d, id, Number(b.dataset.reac))));
  $$('[data-exp]').forEach((b) => (b.onclick = () => grantModal(d, id, Number(b.dataset.exp), true)));
  $$('[data-acc]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.acc === 'revoke' && !confirm('Remover o acesso deste aluno a este produto?')) return;
    await api(`/api/admin/students/${id}/${b.dataset.acc}`, { method: 'POST', body: { product_id: Number(b.dataset.pid) } }); toast('Acesso atualizado'); pageStudent(id);
  }));
  $('#del')?.addEventListener('click', async () => { if (!confirm('Excluir definitivamente este aluno e todas as respostas? (LGPD)')) return; await api(`/api/admin/students/${id}`, { method: 'DELETE' }); toast('Aluno excluído'); go('/alunos'); });
  $('#edit')?.addEventListener('click', () => modal({ title: 'Editar aluno', body: `<form id="ef"><div class="field"><label>Nome</label><input class="input" name="name" value="${esc(u.name)}"></div><div class="field"><label>E-mail</label><input class="input" name="email" value="${esc(u.email)}"></div><div class="field"><label>WhatsApp</label><input class="input" name="phone" value="${esc(u.phone)}"></div><div class="field"><label>Status</label><select class="input" name="status"><option value="active" ${u.status === 'active' ? 'selected' : ''}>Ativo</option><option value="blocked" ${u.status === 'blocked' ? 'selected' : ''}>Bloqueado</option></select></div><div class="field"><label>Notas internas</label><textarea class="input" name="notes">${esc(u.notes)}</textarea></div><button class="btn btn-primary">Salvar</button></form>`,
    onMount: (m, close) => m.querySelector('#ef').addEventListener('submit', async (e) => { e.preventDefault(); try { await api(`/api/admin/students/${id}`, { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); close(); toast('Salvo'); pageStudent(id); } catch (er) { toast(er.message, { error: true }); } }) }));
}

// ---------- vendas ----------
async function pageSales() {
  const st = { q: '', status: '', page: 1, tab: 'sales' };
  $('#main').innerHTML = head('Vendas', 'Tudo o que a Greenn enviou: vendas, reembolsos e carrinhos abandonados.') + `<div class="tabs"><button class="on" data-t="sales">Vendas</button><button data-t="abandoned">Carrinhos abandonados</button></div><div class="panel" id="pnl"></div>`;
  const load = async () => {
    if (st.tab === 'abandoned') {
      const d = await api(`/api/admin/abandoned?page=${st.page}`);
      $('#pnl').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Contato</th><th>Telefone</th><th>Produto Greenn</th><th>Situação</th><th>Quando</th></tr></thead><tbody>${d.rows.map((l) => `<tr><td>${who(l.name, l.email)}</td><td>${l.phone ? `<a href="https://wa.me/${esc(l.phone.replace(/\D/g, ''))}" target="_blank">${esc(l.phone)}</a>` : '—'}</td><td>${esc(l.provider_product_id)}</td><td>${l.converted ? '<span class="badge ok">Comprou depois</span>' : '<span class="badge warn">Não comprou</span>'}</td><td>${fmtDateTime(l.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum carrinho abandonado. Ative o evento “Checkout abandonado” no webhook da Greenn.</td></tr>'}</tbody></table></div>${pager(d, (p) => { st.page = p; load(); })}`;
      return;
    }
    const d = await api(`/api/admin/sales?${qs({ q: st.q, status: st.status, page: st.page })}`);
    $('#pnl').innerHTML = `<div class="toolbar"><input class="input search" id="q" placeholder="E-mail, nome, ID da venda ou produto" value="${esc(st.q)}"><select class="input" id="s"><option value="">Todos os status</option>${['paid', 'waiting_payment', 'refused', 'refunded', 'chargedback'].map((s) => `<option value="${s}" ${st.status === s ? 'selected' : ''}>${STATUS[s][0]}</option>`).join('')}</select><span class="faint" style="margin-left:auto">Total pago no filtro: <b>${brl(d.paidValue)}</b></span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Produto</th><th>Status</th><th>Pagamento</th><th>Origem</th><th class="r">Valor</th><th>Data</th></tr></thead><tbody>
      ${d.rows.map((s) => { const wa = (s.phone || '').replace(/\D/g, ''); return `<tr class="${s.user_id ? 'click' : ''}" data-user="${s.user_id || ''}"><td>${who(s.name, s.email, wa ? ` · <a href="https://wa.me/${wa}" target="_blank" data-stop>${esc(s.phone)}</a>` : '')}</td><td>${esc(s.product_name || '')}<br><small class="faint">#${esc(s.provider_product_id)} · venda ${esc(s.sale_id)}</small></td><td>${badge(s.status)}</td><td>${esc(s.method || '—')}${s.installments > 1 ? ` · ${s.installments}x` : ''}${s.coupon ? `<br><small class="faint">cupom ${esc(s.coupon)}</small>` : ''}</td><td><small>${esc([s.utm_source, s.utm_campaign].filter(Boolean).join(' / ') || '—')}</small></td><td class="r">${brl(s.amount)}</td><td>${fmtDateTime(s.created_at)}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">Nenhuma venda encontrada.</td></tr>'}
      </tbody></table></div>${pager(d, (p) => { st.page = p; load(); })}`;
    $('#q').oninput = debounce(() => { st.q = $('#q').value; st.page = 1; load().then(() => { const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }); }, 400);
    $('#s').onchange = () => { st.status = $('#s').value; st.page = 1; load(); };
    $$('tr[data-user]').forEach((tr) => tr.dataset.user && (tr.onclick = (e) => { if (!e.target.closest('[data-stop]')) go(`/alunos/${tr.dataset.user}`); }));
  };
  $$('[data-t]').forEach((b) => (b.onclick = () => { $$('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); st.tab = b.dataset.t; st.page = 1; load(); }));
  load();
}

// ---------- leads ----------
async function pageLeads() {
  const st = { live: '', fase: '', imovel: '', min_score: '', min_days: '', mora: '', q: '', page: 1 };
  $('#main').innerHTML = head('Leads qualificados', 'Dados dos Checkpoints 1 e 2, com score de qualificação para a aula ao vivo e a consultoria.', can('support') ? '<a class="btn btn-primary" id="csv" href="#">Exportar CSV</a>' : '') + `
    <div class="panel"><div class="toolbar"><input class="input search" id="q" placeholder="Nome, e-mail ou WhatsApp">
      <select class="input" data-f="live"><option value="">Aula ao vivo: todos</option><option value="1">Querem a aula</option></select>
      <select class="input" data-f="fase"><option value="">Todas as fases</option><option value="1">Fase 1</option><option value="2">Fase 2</option><option value="3">Fase 3</option></select>
      <select class="input" data-f="imovel"><option value="">Sonho do imóvel: todos</option><option value="1">Sonham com imóvel</option></select>
      <select class="input" data-f="min_score"><option value="">Qualquer score</option><option value="40">Score ≥ 40</option><option value="60">Score ≥ 60</option><option value="80">Score ≥ 80</option></select>
      <select class="input" data-f="mora"><option value="">Brasil e exterior</option><option value="Brasil">Brasil</option><option value="Exterior">Exterior</option></select>
    </div><div id="list"></div></div>
    <p class="faint" style="margin-top:12px">Score (0–100): quer a aula ao vivo (+30), sonha com imóvel (+15), valor que pode direcionar por mês (até +20), fase (Fase 2 +15, Fase 3 +20), renda (até +10) e WhatsApp informado (+5).</p>`;
  const load = async () => {
    const d = await api(`/api/admin/leads?${qs(st)}`);
    $('#list').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Lead</th><th class="r">Score</th><th>Dias</th><th>Fase</th><th class="r">Renda</th><th class="r">Sobra real</th><th class="r">Direcionar/mês</th><th>Imóvel</th><th>Aula</th><th>Mora</th></tr></thead><tbody>
      ${d.rows.map((l) => { const wa = (l.whatsapp || l.phone || '').replace(/\D/g, ''); return `<tr class="click" data-id="${l.user_id}"><td>${who(l.name, l.email, wa ? ` · <a href="https://wa.me/${wa}" target="_blank" data-stop>${esc(l.whatsapp || l.phone)}</a>` : '')}</td><td class="r"><span class="badge ${l.lead_score >= 60 ? 'ok' : l.lead_score >= 40 ? 'gold' : ''}">${l.lead_score}</span></td><td>${l.days_completed}/7</td><td>${l.fase ? `Fase ${l.fase}` : '—'}</td><td class="r">${l.renda ? money(l.renda, l.data.moeda || 'BRL') : '—'}</td><td class="r">${l.sobra_real != null && l.days_completed >= 4 ? money(l.sobra_real, l.data.moeda || 'BRL') : '—'}</td><td class="r">${l.direcionar ? money(l.direcionar, l.data.moeda || 'BRL') : '—'}</td><td>${l.imovel_proprio === 'Sim' ? 'Tem' : l.imovel_proprio === 'Não' ? 'Não tem' : '—'}${l.sonho_imovel === 'Sim' ? ' · <span class="badge gold">sonha</span>' : ''}</td><td>${l.live_optin === 'Sim' ? '<span class="badge ok">Sim</span>' : l.live_optin === 'Não' ? 'Não' : '—'}</td><td>${esc(l.mora === 'Exterior' ? l.pais || 'Exterior' : l.mora || '—')}</td></tr>`; }).join('') || '<tr><td colspan="10" class="empty">Nenhum lead com esses filtros ainda.</td></tr>'}
      </tbody></table></div>${pager(d, (p) => { st.page = p; load(); })}`;
    $$('#list tr[data-id]').forEach((tr) => (tr.onclick = (e) => { if (!e.target.closest('[data-stop]')) go(`/alunos/${tr.dataset.id}`); }));
    const a = $('#csv'); if (a) a.href = `/api/admin/leads.csv?${qs({ ...st, page: '' })}`;
  };
  $$('[data-f]').forEach((s) => (s.onchange = () => { st[s.dataset.f] = s.value; st.page = 1; load(); }));
  $('#q').oninput = debounce(() => { st.q = $('#q').value; st.page = 1; load(); });
  load();
}

// ---------- vozes ----------
async function pageVoices() {
  const st = { kind: 'testimonials', day: '', page: 1 };
  $('#main').innerHTML = head('Depoimentos e recados', 'O que os alunos escreveram no Dia 7 e no feedback de cada aula.') + `<div class="tabs" id="vt"><button class="on" data-k="testimonials">Depoimentos autorizados</button><button data-k="messages">Recados para o Rhus</button><button data-k="all">Todos os relatos do Dia 7</button><button data-k="feedback">Feedback por aula</button></div><div id="vf"></div><div id="list" class="gap"></div>`;
  const load = async () => {
    $('#vf').innerHTML = st.kind === 'feedback' ? `<div class="tabs">${['', 1, 2, 3, 4, 5, 6, 7].map((n) => `<button data-day="${n}" class="${String(st.day) === String(n) ? 'on' : ''}">${n ? `Dia ${n}` : 'Todos'}</button>`).join('')}</div>` : '';
    $$('[data-day]').forEach((b) => (b.onclick = () => { st.day = b.dataset.day; st.page = 1; load(); }));
    const d = await api(`/api/admin/voices?${qs(st)}`);
    if (!d.rows.length) { $('#list').innerHTML = '<div class="panel empty">Nada por aqui ainda.</div>'; return; }
    $('#list').innerHTML = d.rows.map((r) => st.kind === 'feedback'
      ? `<div class="panel panel-b"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(r.name || r.email)}</b><span class="faint">Dia ${r.day} · ${relTime(r.updated_at)}</span></div><div class="quote">${esc(r.text)}</div></div>`
      : `<div class="panel panel-b"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${r.autoriza === 'Sim, sem meu nome' ? 'Anônimo' : esc(r.name || r.email)}</b> ${r.autoriza ? `<span class="badge ${String(r.autoriza).startsWith('Sim') ? 'ok' : ''}">${esc(r.autoriza)}</span>` : ''}</div><span class="faint">${r.paz_d1 != null && r.paz_d7 != null ? `Paz ${r.paz_d1} → <b style="color:var(--forest-500)">${r.paz_d7}</b> · ` : ''}${relTime(r.updated_at)}</span></div>
        ${r.mudou ? `<div class="faint" style="margin-top:10px;font-size:12px;font-weight:700">O QUE MUDOU</div><div class="quote">${esc(r.mudou)}</div>` : ''}${r.mostrou ? `<div class="faint" style="font-size:12px;font-weight:700">O QUE DEUS MOSTROU</div><div class="quote">${esc(r.mostrou)}</div>` : ''}${r.deusFez ? `<div class="faint" style="font-size:12px;font-weight:700">O QUE DEUS FEZ</div><div class="quote">${esc(r.deusFez)}</div>` : ''}
        ${r.recado ? `<div class="faint" style="font-size:12px;font-weight:700;color:var(--gold-600)">RECADO PARA O RHUS</div><div class="quote">${esc(r.recado)}</div>` : ''}<a class="btn btn-soft btn-sm" href="${BASE}/alunos/${r.user_id}" data-go="/alunos/${r.user_id}">Ver aluno</a></div>`).join('') + (d.rows.length === d.size ? '<button class="btn btn-soft" id="more">Carregar mais</button>' : '');
    $('#more')?.addEventListener('click', () => { st.page++; load(); });
  };
  $$('#vt [data-k]').forEach((b) => (b.onclick = () => { $$('#vt button').forEach((x) => x.classList.toggle('on', x === b)); st.kind = b.dataset.k; st.page = 1; load(); }));
  load();
}

// ---------- conteúdo ----------
const KIND = { challenge: 'Desafio', course: 'Curso', bonus: 'Bônus / material' };
const PRESETS = [
  ['Azul e dourado', { primary: '#0B1A2A', accent: '#C9A45C', secondary: '#1F6B52' }],
  ['Vinho e champanhe', { primary: '#2B0F18', accent: '#D8B48A', secondary: '#7A2E3B' }],
  ['Petróleo e coral', { primary: '#0E2A30', accent: '#F08A6C', secondary: '#2C7A7B' }],
  ['Grafite e âmbar', { primary: '#17181C', accent: '#F2A93B', secondary: '#4B5563' }],
  ['Roxo e ouro', { primary: '#1E1433', accent: '#E3C06F', secondary: '#5B3E99' }],
  ['Verde e areia', { primary: '#10261C', accent: '#D9C08C', secondary: '#3F7D58' }],
];

/** Cartão do produto como o aluno vê na vitrine (usado na lista e na prévia) */
function previewCard(p, theme) {
  const vars = varsToStyle(themeVars(theme));
  loadFont(normalizeTheme(theme).font);
  return `<div class="pv-card" style="${vars}"><div class="pv-cover">${p.cover_url ? `<img src="${esc(p.cover_url)}" alt="">` : `<div class="pv-art">${p.logo_url ? `<img class="pv-logo" src="${esc(p.logo_url)}" alt="">` : `<span class="pv-mono">${esc(((p.short_name || p.name || 'P').trim()[0]) || 'P')}</span>`}</div>`}<span class="pv-kind">${esc(p.badge || KIND[p.kind] || 'Desafio')}</span></div>
    <div class="pv-body"><b>${esc(p.name || 'Nome do produto')}</b>${p.tagline ? `<p>${esc(p.tagline)}</p>` : ''}<div class="pv-bar"><i></i></div><div class="pv-foot"><span>2 de 7</span><span class="pv-cta">Continuar →</span></div></div></div>`;
}
function previewHero(p, theme) {
  const vars = varsToStyle(themeVars(theme));
  return `<div class="pv-hero" style="${vars}"><div class="pv-top">${p.logo_url ? `<img src="${esc(p.logo_url)}" alt="">` : '<i></i>'}<span>${esc(p.short_name || p.name || 'Produto')}<small>${esc(p.mentor || '')}</small></span></div>
    <div class="pv-hero-in"><div class="pv-eyebrow">${esc(p.name || '')}</div><div class="pv-h1">Olá, <em>Maria</em>.</div><span class="pv-btn">▶ Começar ${esc((p.unit_label || 'Dia').toLowerCase())} 1</span></div></div>`;
}

async function pageContent() {
  const { rows } = await api('/api/admin/products');
  $('#main').innerHTML = head('Produtos', 'Cada produto tem a sua identidade visual, as suas aulas e o seu vínculo com a Greenn.', can('admin') ? '<button class="btn btn-primary" id="np">+ Novo produto</button>' : '') + `
    <div class="prod-grid">${rows.map((p) => `<div class="panel prod ${p.active ? '' : 'is-off'}">
      <a class="prod-pv" href="${BASE}/conteudo/${p.id}" data-go="/conteudo/${p.id}">${previewCard(p, p.theme_obj)}</a>
      <div class="panel-b"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="eyebrow">${esc(KIND[p.kind])}</span><span class="prod-status">${p.show_in_store && p.active ? '<span class="badge gold">Na vitrine</span>' : ''}${can('admin') ? `<label class="toggle" title="${p.active ? 'Desativar' : 'Ativar'} produto"><input type="checkbox" data-active="${p.id}" ${p.active ? 'checked' : ''}><i></i><span>${p.active ? 'Ativo' : 'Desativado'}</span></label>` : p.active ? '<span class="badge ok">Ativo</span>' : '<span class="badge">Desativado</span>'}</span></div>
      <dl class="kv" style="grid-template-columns:118px 1fr;margin-top:12px"><dt>Greenn</dt><dd>${p.greenn_ids ? p.greenn_ids.split(',').map((x) => `<span class="badge ink">${esc(x)}</span>`).join(' ') : '<span class="badge warn">Não vinculado</span>'}</dd><dt>${esc(p.kind === 'bonus' ? 'Materiais' : (p.unit_label || 'Dia') + 's')}</dt><dd>${p.kind === 'bonus' ? (p.materials || []).length : p.lessons}</dd><dt>Alunos ativos</dt><dd>${p.students}</dd>${p.kind !== 'bonus' ? `<dt>Liberação</dt><dd>${{ after_complete: `${p.release_delay_hours}h após concluir`, drip: 'Por calendário', sequential: 'Ao concluir o anterior', open: 'Tudo liberado' }[p.release_mode]}</dd>` : ''}</dl>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><a class="btn btn-soft btn-sm" href="${BASE}/conteudo/${p.id}" data-go="/conteudo/${p.id}">${p.kind === 'bonus' ? 'Abrir' : 'Aulas e conteúdo'}</a>${can('admin') ? `<button class="btn btn-ghost btn-sm" data-edit="${p.id}">Configurar e identidade</button>` : ''}</div></div></div>`).join('')}</div>`;
  $('#np')?.addEventListener('click', () => productModal());
  $$('[data-edit]').forEach((b) => (b.onclick = () => productModal(rows.find((x) => String(x.id) === b.dataset.edit))));
  $$('[data-active]').forEach((c) => c.addEventListener('change', async () => {
    const p = rows.find((x) => String(x.id) === c.dataset.active);
    if (!c.checked && !confirm(`Desativar "${p.name}"?\n\n• Os alunos deixam de ver este produto no app.\n• Novas compras na Greenn não liberam acesso enquanto estiver desativado.\n• O progresso e as respostas ficam guardados: ao reativar, tudo volta como estava.`)) { c.checked = true; return; }
    try { await api(`/api/admin/products/${p.id}`, { method: 'PUT', body: { active: c.checked } }); toast(c.checked ? 'Produto ativado' : 'Produto desativado'); pageContent(); }
    catch (er) { c.checked = !c.checked; toast(er.message, { error: true }); }
  }));
}

function productModal(p = {}, startTab = 'geral') {
  const mats = (p.materials || []).map((m) => `${m.title} | ${m.url}`).join('\n');
  const th = normalizeTheme(p.theme_obj || {});
  const opt = (name, list, cur) => `<select class="input" name="${name}">${list.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const color = (k, label, hint) => `<div class="field"><label>${label}</label><div class="color-in"><input type="color" data-color="${k}" value="${th[k]}"><input class="input" data-hex="${k}" value="${th[k]}" maxlength="7" spellcheck="false"></div><span class="hint">${hint}</span></div>`;
  const img = (target, label, url, hint) => `<div class="field img-field" data-target="${target}"><label>${label}</label><div class="img-box ${target}">${url ? `<img src="${esc(url)}" alt="">` : `<span>${p.id ? 'Nenhuma imagem' : 'Salve o produto para enviar'}</span>`}</div>
    ${p.id ? `<div class="cover-actions"><label class="btn btn-soft btn-sm">${url ? 'Trocar' : 'Enviar imagem'}<input type="file" accept="image/png,image/jpeg,image/webp${target === 'logo' ? ',image/svg+xml' : ''}" hidden></label>${url ? '<button type="button" class="btn btn-ghost btn-sm" data-img-del>Remover</button>' : ''}</div>` : ''}<span class="hint">${hint}</span></div>`;
  modal({ title: p.id ? p.name : 'Novo produto', eyebrow: p.id ? 'Configurar produto' : 'Produto', wide: true, body: `
    <div class="tabs" id="ptabs"><button type="button" data-t="geral">Geral</button><button type="button" data-t="visual">Identidade visual</button><button type="button" data-t="vitrine">Vitrine e vendas</button></div>
    <form id="pf">
    <section data-sec="geral" class="form-grid">
      <div class="full status-bar"><label class="toggle"><input type="checkbox" name="active" ${p.active !== 0 ? 'checked' : ''}><i></i><span data-active-label>${p.active !== 0 ? 'Produto ativo' : 'Produto desativado'}</span></label><span class="hint" style="margin:0">Desativado, o produto some do app dos alunos e novas compras não liberam acesso. O progresso fica guardado.</span></div>
      <div class="field"><label>Nome completo</label><input class="input" name="name" value="${esc(p.name)}" required></div>
      <div class="field"><label>Nome curto (topo do app)</label><input class="input" name="short_name" value="${esc(p.short_name)}" placeholder="Ex.: Caminho Bíblico"></div>
      <div class="field"><label>Identificador na URL</label><input class="input" name="slug" value="${esc(p.slug)}" placeholder="desafio-7-dias" required><span class="hint">Endereço do produto: /p/<b>${esc(p.slug || 'identificador')}</b></span></div>
      <div class="field"><label>Mentor / autor</label><input class="input" name="mentor" value="${esc(p.mentor)}" placeholder="Ex.: Rhus Moreira"></div>
      <div class="field"><label>Tipo</label>${opt('kind', [['challenge', 'Desafio (aulas + atividades)'], ['course', 'Curso (aulas)'], ['bonus', 'Bônus / material para download']], p.kind || 'challenge')}</div>
      <div class="field"><label>Cada aula se chama</label>${opt('unit_label', [['Dia', 'Dia (Dia 1, Dia 2…)'], ['Aula', 'Aula'], ['Módulo', 'Módulo'], ['Lição', 'Lição'], ['Semana', 'Semana'], ['Episódio', 'Episódio'], ['Material', 'Material']], p.unit_label || 'Dia')}</div>
      <div class="field full"><label>Frase de apoio</label><input class="input" name="tagline" value="${esc(p.tagline)}" placeholder="Aparece na vitrine e no topo da jornada"></div>
      <div class="field"><label>IDs do produto na Greenn</label><input class="input" name="greenn_ids" value="${esc(p.greenn_ids)}" placeholder="Ex.: 123456, 123457"><span class="hint">Número da URL de edição do produto na Greenn. Vários separados por vírgula.</span></div>
      <div class="field"><label>Duração do acesso (dias)</label><input class="input" name="access_days" type="number" min="1" value="${esc(p.access_days ?? '')}" placeholder="Vazio = vitalício"></div>
      <div class="field"><label>Liberação das aulas</label>${opt('release_mode', [['after_complete', 'X horas após concluir a anterior'], ['sequential', 'Na hora, ao concluir a anterior'], ['drip', 'Por calendário (dias após a compra)'], ['open', 'Tudo liberado de uma vez']], p.release_mode || 'after_complete')}</div>
      <div class="field"><label>Intervalo de liberação (horas)</label><input class="input" name="release_delay_hours" type="number" min="0" value="${esc(p.release_delay_hours ?? 24)}"><span class="hint" data-delay-hint></span></div>
      <div class="field full"><label>Materiais para download (um por linha: Título | URL)</label><textarea class="input" name="materials" placeholder="Guia rápido | https://…/guia.pdf">${esc(mats)}</textarea></div>
      <label class="switch full"><input type="checkbox" name="show_live" ${p.show_live ? 'checked' : ''}> Mostrar o convite da aula ao vivo neste produto</label>
    </section>
    <section data-sec="visual" hidden>
      <div class="visual-grid"><div>
        <div class="field"><span class="label">Paletas prontas</span><div class="presets">${PRESETS.map(([n, c], i) => `<button type="button" class="preset" data-preset="${i}" title="${esc(n)}"><i style="background:${c.primary}"></i><i style="background:${c.accent}"></i><i style="background:${c.secondary}"></i><span>${esc(n)}</span></button>`).join('')}</div></div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr">${color('primary', 'Cor base', 'Fundos escuros, topo e botões principais')}${color('accent', 'Cor de destaque', 'Botões dourados, progresso, detalhes')}${color('secondary', 'Cor de apoio', 'Concluído, gradientes, confirmações')}</div>
        <div id="contrast"></div>
        <div class="field"><label>Fonte dos títulos</label><select class="input" data-font>${Object.entries(FONTS).map(([k, f]) => `<option value="${esc(k)}" ${th.font === k ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></div>
        <div class="form-grid">${img('logo', 'Logo', p.logo_url, 'PNG ou SVG com fundo transparente, quadrado, 512 × 512 px.')}${img('cover', 'Capa da vitrine', p.cover_url, '1600 × 900 px (16:9), JPG ou WebP, até 5 MB.')}</div>
      </div>
      <div class="pv-col"><span class="label">Prévia</span><div id="pv"></div><p class="hint">É assim que o aluno vê o produto na vitrine e no topo da jornada.</p></div></div>
    </section>
    <section data-sec="vitrine" hidden class="form-grid">
      <div class="field full"><p class="muted" style="margin:0">Alunos que têm <b>mais de um produto</b> entram numa vitrine com todos os seus conteúdos. Você também pode mostrar este produto para quem <b>ainda não comprou</b>, com um botão para a página de vendas.</p></div>
      <label class="switch full"><input type="checkbox" name="show_in_store" ${p.show_in_store ? 'checked' : ''}> Mostrar na vitrine para quem ainda não tem este produto</label>
      <div class="field full"><label>Link da página de vendas</label><input class="input" name="sales_url" value="${esc(p.sales_url)}" placeholder="https://…"><span class="hint">Abre ao clicar em "Quero conhecer". Sem link, o cartão aparece como "Em breve".</span></div>
      <div class="field"><label>Selo do cartão</label><input class="input" name="badge" value="${esc(p.badge)}" maxlength="24" placeholder="Ex.: Novo, Bônus, Mais vendido"><span class="hint">Opcional. Vazio = tipo do produto.</span></div>
      <div class="field"><label>Ordem na vitrine</label><input class="input" name="position" type="number" value="${esc(p.position ?? 0)}"><span class="hint">Menor aparece primeiro.</span></div>
    </section>
    ${can('admin') ? '<div style="margin-top:18px;display:flex;gap:8px"><button class="btn btn-primary">Salvar produto</button><button type="button" class="btn btn-ghost" data-close>Cancelar</button></div>' : ''}
    </form>`,
  onMount: (m, close) => {
    const f = m.querySelector('#pf');
    const theme = { ...th };
    const state = { ...p };
    const tab = (t) => { m.querySelectorAll('#ptabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); m.querySelectorAll('[data-sec]').forEach((x) => (x.hidden = x.dataset.sec !== t)); };
    m.querySelectorAll('#ptabs button').forEach((b) => (b.onclick = () => tab(b.dataset.t)));
    tab(startTab);
    const live = () => {
      const fd = Object.fromEntries(new FormData(f));
      Object.assign(state, { name: fd.name, short_name: fd.short_name, mentor: fd.mentor, tagline: fd.tagline, kind: fd.kind, unit_label: fd.unit_label, badge: fd.badge });
      m.querySelector('#pv').innerHTML = previewHero(state, theme) + previewCard(state, theme);
      const c1 = contrast(theme.accent, themeVars(theme)['--on-gold'] || '#07121D');
      const c2 = contrast(theme.primary, '#ffffff');
      const warn = [c2 < 4.5 && 'A cor base está clara demais: textos brancos sobre ela ficam difíceis de ler. Prefira um tom escuro.', c1 < 3 && 'O texto sobre a cor de destaque terá pouco contraste.'].filter(Boolean);
      m.querySelector('#contrast').innerHTML = warn.length ? `<div class="alert alert-warn">${warn.join(' ')}</div>` : '';
    };
    const setColor = (k, v) => { theme[k] = v; m.querySelector(`[data-color="${k}"]`).value = v; m.querySelector(`[data-hex="${k}"]`).value = v; live(); };
    m.querySelectorAll('[data-color]').forEach((i) => i.addEventListener('input', () => setColor(i.dataset.color, i.value)));
    m.querySelectorAll('[data-hex]').forEach((i) => i.addEventListener('input', () => { const v = i.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) setColor(i.dataset.hex, v.toUpperCase()); }));
    m.querySelector('[data-font]').addEventListener('change', (e) => { theme.font = e.target.value; loadFont(theme.font); live(); });
    m.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => { const c = PRESETS[Number(b.dataset.preset)][1]; ['primary', 'accent', 'secondary'].forEach((k) => setColor(k, c[k])); }));
    f.addEventListener('input', (e) => { if (!e.target.matches('[data-color],[data-hex]')) live(); });
    // campos que só fazem sentido em alguns modos
    const syncRelease = () => {
      const kind = f.kind.value, mode = f.release_mode.value, delay = f.release_delay_hours;
      const bonus = kind === 'bonus';
      f.release_mode.disabled = bonus;
      delay.disabled = bonus || mode !== 'after_complete';
      const hints = { sequential: 'Não se aplica: a próxima aula libera assim que a anterior é concluída.', drip: 'Não se aplica: no calendário, cada aula tem o seu dia definido na própria aula.', open: 'Não se aplica: todas as aulas ficam liberadas de uma vez.' };
      m.querySelector('[data-delay-hint]').textContent = bonus ? 'Não se aplica a materiais para download.' : mode === 'after_complete' ? 'Ex.: 24 = a próxima aula libera 24 horas depois de concluir a anterior.' : hints[mode];
      m.querySelector('[data-active-label]').textContent = f.active.checked ? 'Produto ativo' : 'Produto desativado';
    };
    ['kind', 'release_mode', 'active'].forEach((n) => f[n].addEventListener('change', syncRelease));
    syncRelease();
    // imagens (logo e capa)
    m.querySelectorAll('.img-field').forEach((box) => {
      const target = box.dataset.target;
      box.querySelector('input[type=file]')?.addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
          box.querySelector('.img-box').classList.add('is-loading');
          const { data, warn } = await prepareImage(file, { maxWidth: target === 'logo' ? 800 : 1600, keepRatio: target === 'logo' });
          const r = await api(`/api/admin/products/${p.id}/image`, { method: 'POST', body: { target, data } });
          state[target === 'logo' ? 'logo_url' : 'cover_url'] = r.url; p[target === 'logo' ? 'logo_url' : 'cover_url'] = r.url;
          box.querySelector('.img-box').innerHTML = `<img src="${esc(r.url)}" alt="">`;
          box.querySelector('.img-box').classList.remove('is-loading');
          toast(warn || 'Imagem atualizada', { ms: warn ? 5000 : 2500 }); live();
        } catch (er) { toast(er.message, { error: true }); box.querySelector('.img-box').classList.remove('is-loading'); }
      });
      box.querySelector('[data-img-del]')?.addEventListener('click', async () => {
        await api(`/api/admin/products/${p.id}/image?target=${target}`, { method: 'DELETE' });
        state[target === 'logo' ? 'logo_url' : 'cover_url'] = null; p[target === 'logo' ? 'logo_url' : 'cover_url'] = null;
        box.querySelector('.img-box').innerHTML = '<span>Nenhuma imagem</span>'; box.querySelector('[data-img-del]').remove(); toast('Imagem removida'); live();
      });
    });
    live();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(f));
      fd.active = !!fd.active; fd.show_live = !!fd.show_live; fd.show_in_store = !!fd.show_in_store;
      fd.theme = theme;
      fd.materials = String(fd.materials || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]).map(([title, url]) => ({ title, url: url || '' }));
      await withLoading(e.submitter, async () => {
        try {
          if (p.id) { await api(`/api/admin/products/${p.id}`, { method: 'PUT', body: fd }); close(); toast('Produto salvo'); route(); }
          else { const r = await api('/api/admin/products', { method: 'POST', body: fd }); close(); toast('Produto criado. Agora envie o logo e a capa.'); const { rows } = await api('/api/admin/products'); go(`/conteudo/${r.id}`); setTimeout(() => productModal(rows.find((x) => x.id === r.id), 'visual'), 400); }
        } catch (er) { toast(er.message, { error: true }); }
      });
    });
  } });
}

async function pageProduct(id) {
  const [{ rows: products }, { rows: lessons }] = await Promise.all([api('/api/admin/products'), api(`/api/admin/products/${id}/lessons`)]);
  const p = products.find((x) => String(x.id) === String(id));
  if (!p) return go('/conteudo');
  $('#main').innerHTML = `<a href="${BASE}/conteudo" data-go="/conteudo" class="faint" style="font-weight:700">← Conteúdo</a>` + head(esc(p.name), esc(p.tagline || ''), can('admin') ? `<button class="btn btn-soft" id="cfg">Configurar produto</button>${p.kind !== 'bonus' ? '<button class="btn btn-primary" id="nl">+ Nova aula</button>' : ''}` : '') + `
    <div class="panel">${lessons.map((l) => `<div class="lesson-item" data-id="${l.id}"><div class="n">${l.number}</div><div style="flex:1;min-width:0"><b style="font-size:15px">${esc(l.title)}</b><br><small class="faint">${esc(l.block || '')}${l.video_duration ? ` · ${esc(l.video_duration)}` : ''} · ${l.video_url ? 'aula ✓' : '<span style="color:var(--warn)">aula sem vídeo</span>'} · ${l.practice_video_url ? 'prática ✓' : '<span style="color:var(--warn)">prática sem vídeo</span>'}</small></div>${l.published ? '<span class="badge ok">Publicada</span>' : '<span class="badge">Rascunho</span>'}</div>`).join('') || '<div class="empty">Nenhuma aula neste produto.</div>'}</div>`;
  $('#cfg')?.addEventListener('click', () => productModal(p));
  $('#nl')?.addEventListener('click', async () => { const r = await api(`/api/admin/products/${id}/lessons`, { method: 'POST', body: {} }); toast('Aula criada'); await pageProduct(id); lessonModal(r.id, id); });
  $$('.lesson-item').forEach((el) => (el.onclick = () => lessonModal(Number(el.dataset.id), id)));
}

// ---------- capa personalizada dos vídeos ----------
function coverField(target, label, url, videoUrl) {
  const yt = youtubeId(videoUrl);
  const src = url || (yt ? youtubeThumb(yt) : '');
  return `<div class="cover-field" data-target="${target}">
    <span class="label">${label}</span>
    <div class="cover-box">${src ? `<img src="${esc(src)}" alt="" referrerpolicy="no-referrer">` : '<div class="cover-empty">Sem vídeo ainda</div>'}<span class="cover-tag">${url ? 'Capa personalizada' : yt ? 'Capa do YouTube' : ''}</span></div>
    <div class="cover-actions">
      <label class="btn btn-soft btn-sm">${url ? 'Trocar imagem' : 'Escolher imagem'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
      ${url ? '<button type="button" class="btn btn-ghost btn-sm" data-cover-del>Usar a do YouTube</button>' : ''}
    </div>
    <span class="hint">Ideal: 1920 × 1080 px (16:9), JPG ou WebP, até 5 MB. Imagens maiores são reduzidas automaticamente.</span>
  </div>`;
}
const readDataUrl = (file) => new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => j(new Error('Não foi possível ler o arquivo.')); fr.readAsDataURL(file); });
async function prepareImage(file, { maxWidth = 1920, keepRatio = false } = {}) {
  if (file.type === 'image/svg+xml') { if (file.size > 1024 * 1024) throw new Error('SVG muito grande (máximo 1 MB).'); return { data: await readDataUrl(file), warn: '' }; }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use uma imagem JPG, PNG ou WebP.');
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Não foi possível ler a imagem.')); i.src = url; }).finally(() => setTimeout(() => URL.revokeObjectURL(url), 1000));
  const ratio = img.naturalWidth / img.naturalHeight;
  const warn = !keepRatio && Math.abs(ratio - 16 / 9) > 0.05 ? `A imagem tem ${img.naturalWidth}×${img.naturalHeight}. Ela será cortada para 16:9.` : '';
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) return { data: await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); }), warn };
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  let data = keepRatio && file.type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/webp', 0.86);
  if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', 0.86);
  return { data, warn };
}
function bindCovers(m, lid) { m.querySelectorAll('.cover-field').forEach((box) => bindCover(box, lid)); }
function bindCover(box, lid) {
  {
    const target = box.dataset.target;
    const refresh = async () => {
      const lessons = (await api(`/api/admin/products/${currentProductId}/lessons`)).rows;
      const l = lessons.find((x) => x.id === lid);
      const isV = target === 'video';
      const tmp = document.createElement('div');
      tmp.innerHTML = coverField(target, isV ? 'Capa da aula' : 'Capa da prática', isV ? l.cover_url : l.practice_cover_url, isV ? l.video_url : l.practice_video_url);
      const fresh = tmp.firstElementChild;
      box.replaceWith(fresh);
      bindCover(fresh, lid);
    };
    box.querySelector('input[type=file]')?.addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        box.querySelector('.cover-box').classList.add('is-loading');
        const { data, warn } = await prepareImage(file);
        await api(`/api/admin/lessons/${lid}/cover`, { method: 'POST', body: { target, data } });
        toast(warn || 'Capa atualizada', { ms: warn ? 5000 : 3200 });
        await refresh();
      } catch (er) { toast(er.message, { error: true }); box.querySelector('.cover-box')?.classList.remove('is-loading'); }
    });
    box.querySelector('[data-cover-del]')?.addEventListener('click', async () => {
      try { await api(`/api/admin/lessons/${lid}/cover?target=${target}`, { method: 'DELETE' }); toast('Voltou para a capa do YouTube'); await refresh(); }
      catch (er) { toast(er.message, { error: true }); }
    });
  }
}
let currentProductId = null;

async function lessonModal(lid, pid) {
  currentProductId = pid;
  const { rows } = await api(`/api/admin/products/${pid}/lessons`);
  const l = rows.find((x) => x.id === lid);
  const ro = !can('admin') ? 'disabled' : '';
  modal({ title: `Dia ${l.number}: ${l.title}`, eyebrow: 'Editar aula', wide: true, body: `<form id="lf" class="form-grid"><fieldset ${ro} style="display:contents">
    <div class="field"><label>Número do dia</label><input class="input" type="number" name="number" value="${l.number}"></div>
    <div class="field"><label>Bloco</label><input class="input" name="block" value="${esc(l.block)}" placeholder="Coração, Princípios, Patrimônio"></div>
    <div class="field full"><label>Título</label><input class="input" name="title" value="${esc(l.title)}"></div>
    <div class="field full"><label>Subtítulo</label><input class="input" name="subtitle" value="${esc(l.subtitle)}"></div>
    <div class="field full"><label>Objetivo do dia</label><textarea class="input" name="objective">${esc(l.objective)}</textarea></div>
    <div class="field"><label>Vídeo 1 · Aula (link)</label><input class="input" name="video_url" value="${esc(l.video_url)}" placeholder="YouTube, Vimeo, Panda Video, Bunny…"></div>
    <div class="field"><label>Duração da aula</label><input class="input" name="video_duration" value="${esc(l.video_duration)}"></div>
    <div class="field"><label>Vídeo 2 · Prática (link)</label><input class="input" name="practice_video_url" value="${esc(l.practice_video_url)}"></div>
    <div class="field"><label>Duração da prática</label><input class="input" name="practice_duration" value="${esc(l.practice_duration)}"></div>
    <div class="full cover-grid">${coverField('video', 'Capa da aula', l.cover_url, l.video_url)}${coverField('practice', 'Capa da prática', l.practice_cover_url, l.practice_video_url)}</div>
    <div class="field full"><label>Versículos (um por linha: Referência | Texto)</label><textarea class="input" name="verses" rows="5">${esc(l.verses.map((v) => `${v.ref} | ${v.text}`).join('\n'))}</textarea></div>
    <div class="field full"><label>Frases-chave (uma por linha)</label><textarea class="input" name="key_phrases" rows="4">${esc(l.key_phrases.join('\n'))}</textarea></div>
    <div class="field full"><label>Curiosidade para o próximo dia</label><textarea class="input" name="tomorrow">${esc(l.tomorrow)}</textarea></div>
    <div class="field full"><label>Mensagem de liberação (e-mail e WhatsApp)</label><textarea class="input" name="release_message" rows="6">${esc(l.release_message)}</textarea><span class="hint">Use [nome] e [link]. Vai no e-mail “Dia liberado” e no evento <code>day.released</code> para automação de WhatsApp.</span></div>
    <div class="field"><label>Atividade</label><select class="input" name="activity_key"><option value="">Sem atividade</option>${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="d${n}" ${l.activity_key === `d${n}` ? 'selected' : ''}>Atividade do Dia ${n}</option>`).join('')}</select></div>
    <div class="field"><label>Dias após a compra (só no modo calendário)</label><input class="input" type="number" name="release_offset" value="${l.release_offset}"></div>
    <label class="switch full"><input type="checkbox" name="published" ${l.published ? 'checked' : ''}> Publicada</label>
    ${ro ? '' : `<div class="full" style="margin-top:16px;display:flex;gap:8px"><button class="btn btn-primary">Salvar aula</button>${can('owner') ? '<button type="button" class="btn btn-danger" id="dl">Excluir</button>' : ''}</div>`}</fieldset></form>`,
  onMount: (m, close) => {
    m.querySelector('#lf').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      f.published = !!f.published; f.number = Number(f.number); f.release_offset = Number(f.release_offset || 0);
      f.key_phrases = String(f.key_phrases).split('\n').map((x) => x.trim()).filter(Boolean);
      f.verses = String(f.verses).split('\n').map((x) => x.split('|')).filter((x) => x[0].trim()).map(([ref, ...t]) => ({ ref: ref.trim(), text: t.join('|').trim() }));
      try { await api(`/api/admin/lessons/${lid}`, { method: 'PUT', body: f }); close(); toast('Aula salva'); pageProduct(pid); } catch (er) { toast(er.message, { error: true }); }
    });
    bindCovers(m, lid);
    m.querySelector('#dl')?.addEventListener('click', async () => { if (!confirm('Excluir esta aula? O progresso dos alunos nela será perdido.')) return; await api(`/api/admin/lessons/${lid}`, { method: 'DELETE' }); close(); pageProduct(pid); });
  } });
}

// ---------- integrações ----------
async function pageIntegrations() {
  const isAdm = can('admin');
  const s = isAdm ? await api('/api/admin/settings') : null;
  const { rows: products } = await api('/api/admin/products');
  const st = { outcome: '', q: '', page: 1 };
  $('#main').innerHTML = head('Greenn e integrações', 'Liberação automática de acesso por webhook e envio de eventos para o seu CRM ou automação de WhatsApp.') + `
    <div class="cols">
      ${isAdm ? `<div class="panel c7"><div class="panel-h"><h3>Webhook da Greenn</h3>${s.webhookUrl ? '<span class="badge ok">Pronto</span>' : ''}</div><div class="panel-b">
        <label class="label">URL para colar na Greenn</label><div class="copy" style="margin:6px 0 16px"><input class="input" readonly id="wurl" value="${esc(s.webhookUrl || '')}"><button class="btn btn-primary" id="cw">Copiar</button></div>
        <ol class="steps-list"><li>Na Greenn, abra o produto e vá em <b>Conteúdos › Adicionar Conteúdo › Sistema Externo › Webhook</b>.</li><li>Cole a URL acima e marque os eventos: <b>Venda paga, Reembolsada, Chargeback, Recusada, Aguardando pagamento</b> e <b>Checkout abandonado</b>.</li><li>Em <a href="${BASE}/conteudo" data-go="/conteudo">Conteúdo</a>, informe o <b>ID do produto da Greenn</b> no produto certo (o número da URL de edição do produto). O order bump do Guia vai no produto “Guia rápido”.</li><li>Faça uma compra de teste (ou use o simulador ao lado) e confira o log abaixo.</li></ol>
        ${can('owner') ? '<button class="btn btn-ghost btn-sm" id="rot" style="margin-top:16px">Gerar nova URL (invalida a atual)</button>' : ''}</div></div>
      <div class="panel c5"><div class="panel-h"><h3>Simular uma compra</h3></div><div class="panel-b"><form id="sim">
        <div class="field"><label>Produto (ID da Greenn)</label><select class="input" name="product_id">${products.flatMap((p) => (p.greenn_ids ? p.greenn_ids.split(',') : []).map((g) => `<option value="${esc(g)}">${esc(g)} · ${esc(p.name)}</option>`)).join('') || '<option value="">Vincule um ID em Conteúdo primeiro</option>'}</select></div>
        <div class="field"><label>E-mail do comprador</label><input class="input" name="email" type="email" required placeholder="voce@exemplo.com"></div>
        <div class="field"><label>Nome</label><input class="input" name="name" placeholder="Aluno Teste"></div>
        <div class="field"><label>Status</label><select class="input" name="status"><option value="paid">Venda paga</option><option value="refunded">Reembolso</option><option value="chargedback">Chargeback</option><option value="waiting_payment">Aguardando pagamento</option></select></div>
        <button class="btn btn-primary btn-block">Enviar evento de teste</button><p class="hint" style="margin-top:8px">Passa exatamente pelo mesmo processamento do webhook real.</p></form></div></div>
      <div class="panel c12"><div class="panel-h"><h3>Eventos de saída (CRM / n8n / WhatsApp)</h3><span class="faint">enviados: ${s.outbox?.sent || 0} · na fila: ${s.outbox?.pending || 0} · falharam: ${s.outbox?.failed || 0}</span></div><div class="panel-b">
        <p class="muted" style="margin-top:0">Cada acontecimento importante gera um POST JSON assinado (cabeçalho <code>X-PB-Signature: sha256=…</code>) para a URL configurada. Use no WTA CRM, n8n ou Make para disparar o WhatsApp de cada dia e recuperar carrinhos.</p>
        <div class="form-grid"><div class="field"><label>URL de destino</label><input class="input" id="obu" value="${esc(s.settings.outbound_webhook_url)}" placeholder="https://crm.wtatech…/webhook/principios"></div><div class="field"><label>Segredo para assinatura</label><input class="input" id="obs" value="${esc(s.settings.outbound_webhook_secret)}" placeholder="uma frase longa e aleatória"></div></div>
        <p class="faint" style="font-size:12.5px">Eventos: <code>user.created</code> · <code>enrollment.activated</code> · <code>enrollment.revoked</code> · <code>day.released</code> (com a mensagem de WhatsApp pronta) · <code>day.completed</code> · <code>checkpoint.saved</code> · <code>live.optin</code> · <code>checkout.abandoned</code> · <code>sale.waiting_payment</code> · <code>sale.refused</code></p>
        <button class="btn btn-primary btn-sm" id="obsave">Salvar destino</button> ${s.outbox?.failed ? '<button class="btn btn-soft btn-sm" id="obretry">Reenviar os que falharam</button>' : ''}</div></div>` : ''}
      <div class="panel c12"><div class="panel-h"><h3>Log de webhooks recebidos</h3></div><div class="toolbar"><input class="input search" id="wq" placeholder="Buscar por e-mail ou conteúdo"><select class="input" id="wo"><option value="">Todos</option><option value="ok">Processados</option><option value="error">Com erro</option><option value="unmapped">Produto não vinculado</option><option value="ignored">Ignorados</option></select></div><div id="wl"></div></div>
    </div>`;
  const loadLog = async () => {
    const d = await api(`/api/admin/webhooks?${qs(st)}`);
    $('#wl').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Evento</th><th>E-mail</th><th>Resultado</th><th>Mensagem</th><th>Recebido</th><th></th></tr></thead><tbody>
      ${d.rows.map((w) => `<tr><td>${w.id}</td><td>${esc(w.event || '—')}<br><small class="faint">${esc(w.status_hint || '')}</small></td><td>${esc(w.email || '—')}</td><td>${badge(w.outcome)}</td><td style="max-width:380px"><small>${esc(w.message || '')}</small></td><td>${fmtDateTime(w.received_at)}</td><td style="white-space:nowrap"><button class="btn btn-soft btn-sm" data-view="${w.id}">Ver</button> ${can('support') ? `<button class="btn btn-soft btn-sm" data-rep="${w.id}">Reprocessar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nenhum webhook recebido ainda.</td></tr>'}
      </tbody></table></div>${pager(d, (p) => { st.page = p; loadLog(); })}`;
    $$('[data-view]').forEach((b) => (b.onclick = async () => { const ev = await api(`/api/admin/webhooks/${b.dataset.view}`); modal({ title: `Webhook #${ev.id}`, wide: true, body: `<p>${badge(ev.outcome)} ${esc(ev.message || '')}</p><div class="code">${esc(JSON.stringify(ev.payload, null, 2))}</div>` }); }));
    $$('[data-rep]').forEach((b) => (b.onclick = async () => { await withLoading(b, async () => { const r = await api(`/api/admin/webhooks/${b.dataset.rep}/reprocess`, { method: 'POST' }); toast(r.message || r.outcome, { error: r.outcome === 'error' }); loadLog(); }); }));
  };
  $('#wq').oninput = debounce(() => { st.q = $('#wq').value; st.page = 1; loadLog(); });
  $('#wo').onchange = () => { st.outcome = $('#wo').value; st.page = 1; loadLog(); };
  loadLog();
  if (!isAdm) return;
  $('#cw').onclick = () => { navigator.clipboard.writeText($('#wurl').value); toast('URL copiada'); };
  $('#rot')?.addEventListener('click', async () => { if (!confirm('Gerar uma nova URL? A atual para de funcionar e você precisa atualizar na Greenn.')) return; const r = await api('/api/admin/settings/webhook-token', { method: 'POST' }); $('#wurl').value = r.webhookUrl; toast('Nova URL gerada'); });
  $('#sim').addEventListener('submit', async (e) => { e.preventDefault(); await withLoading(e.submitter, async () => { try { const r = await api('/api/admin/webhooks/simulate', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast(r.message || r.outcome, { error: r.outcome !== 'ok', ms: 5000 }); loadLog(); } catch (er) { toast(er.message, { error: true }); } }); });
  $('#obsave').onclick = async () => { await api('/api/admin/settings', { method: 'PUT', body: { outbound_webhook_url: $('#obu').value.trim(), outbound_webhook_secret: $('#obs').value } }); toast('Destino salvo'); };
  $('#obretry')?.addEventListener('click', async () => { await api('/api/admin/outbox/retry', { method: 'POST' }); toast('Reenvio iniciado'); pageIntegrations(); });
}

// ---------- logo da plataforma ----------
const LOGO_KINDS = [
  ['icon', 'brand_logo', 'Ícone', 'Quadrado, 512 × 512 px, PNG ou SVG com fundo transparente. Substitui o símbolo ao lado do nome, o ícone da aba do navegador e o do celular.'],
  ['wide', 'brand_logo_wide', 'Logo horizontal · fundo claro', 'Opcional. 600 × 160 px, PNG ou SVG transparente. Substitui ícone + nome no topo do app.'],
  ['wide_dark', 'brand_logo_wide_dark', 'Logo horizontal · fundo escuro', 'Opcional. Versão clara da logo, para a tela de login e o painel.'],
];
function logoFields(s) {
  return `<div class="full logo-row">${LOGO_KINDS.map(([t, k, label, hint]) => `<div class="field img-field brand-logo-field" data-logo="${t}"><label>${label}</label>
    <div class="img-box logo ${t === 'wide_dark' ? 'dark' : ''} ${t === 'icon' ? 'square' : ''}">${s[k] ? `<img src="${esc(s[k])}" alt="">` : '<span>Nenhuma imagem</span>'}</div>
    <div class="cover-actions"><label class="btn btn-soft btn-sm">${s[k] ? 'Trocar' : 'Enviar'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>${s[k] ? '<button type="button" class="btn btn-ghost btn-sm" data-logo-del>Remover</button>' : ''}</div>
    <span class="hint">${hint}</span></div>`).join('')}</div><div class="full" style="border-top:1px solid var(--line);margin:4px 0 10px"></div>`;
}
function bindLogoFields(root, s) {
  (root.matches?.('[data-logo]') ? [root] : root.querySelectorAll('[data-logo]')).forEach((box) => {
    const t = box.dataset.logo; const key = LOGO_KINDS.find((x) => x[0] === t)[1];
    const redraw = () => { const tmp = document.createElement('div'); tmp.innerHTML = logoFields(s); const fresh = tmp.querySelector(`[data-logo="${t}"]`); box.replaceWith(fresh); bindLogoFields(fresh, s); };
    box.querySelector('input[type=file]')?.addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const ib = box.querySelector('.img-box');
      try {
        ib.classList.add('is-loading');
        const { data } = await prepareImage(file, { maxWidth: t === 'icon' ? 512 : 1200, keepRatio: true });
        const r = await api('/api/admin/settings/logo', { method: 'POST', body: { target: t, data } });
        s[key] = r.url; refreshBrand(t, r.url); redraw(); toast('Logo atualizada. Os alunos veem a nova logo no próximo acesso.', { ms: 4000 });
      } catch (er) { ib.classList.remove('is-loading'); toast(er.message, { error: true }); }
    });
    box.querySelector('[data-logo-del]')?.addEventListener('click', async () => {
      await api(`/api/admin/settings/logo?target=${t}`, { method: 'DELETE' });
      s[key] = ''; refreshBrand(t, ''); redraw(); toast('Logo removida');
    });
  });
}
/** Atualiza a marca do menu lateral na hora, sem recarregar */
function refreshBrand(t, url) {
  if (t === 'icon') ME.brandLogo = url; else if (t === 'wide_dark') ME.brandLogoDark = url; else return;
  const brand = document.querySelector('.side .brand'); if (!brand) return;
  brand.innerHTML = ME.brandLogoDark ? `<span class="brand-wide"><img src="${esc(ME.brandLogoDark)}" alt=""></span>` : `${ME.brandLogo ? `<span class="brand-mark brand-icon"><img src="${esc(ME.brandLogo)}" alt=""></span>` : `<span class="brand-mark">${ICONS.mark}</span>`}<span><b>${esc(ME.brand)}</b><small>Painel</small></span>`;
}

// ---------- configurações ----------
async function pageSettings() {
  if (!can('admin')) { $('#main').innerHTML = head('Configurações') + '<div class="alert alert-warn">Apenas administradores podem alterar configurações.</div>'; return; }
  const { settings: s } = await api('/api/admin/settings');
  const f = (k, label, o = {}) => `<div class="field ${o.full ? 'full' : ''}"><label>${label}</label>${o.area ? `<textarea class="input" name="${k}">${esc(s[k])}</textarea>` : o.opts ? `<select class="input" name="${k}">${o.opts.map(([v, l]) => `<option value="${v}" ${String(s[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>` : `<input class="input" name="${k}" type="${o.type || 'text'}" value="${esc(s[k])}" placeholder="${esc(o.ph || '')}">`}${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</div>`;
  const sw = (k, label) => `<label class="switch full" style="margin:6px 0 14px"><input type="checkbox" data-bool="${k}" ${s[k] === 'true' ? 'checked' : ''}> ${label}</label>`;
  const tabs = {
    brand: ['Marca e suporte', `${logoFields(s)}${f('brand_name', 'Nome da plataforma (e-mails, login e vitrine de produtos)', { full: true })}${f('brand_tagline', 'Frase abaixo do nome', { ph: 'Área de membros', hint: 'Aparece no topo da vitrine, ao lado do ícone.' })}${f('brand_short', 'Nome curto (topo do app)')}${f('mentor_name', 'Mentor')}${f('support_email', 'E-mail de suporte', { type: 'email' })}${f('support_whatsapp', 'WhatsApp de suporte', { ph: '+55 11 99999-9999' })}${f('guide_url', 'Link do Guia rápido Casa em Ordem (PDF)', { full: true, hint: 'Aparece no fim da atividade do Dia 6.' })}`],
    email: ['E-mail', `${f('email_provider', 'Provedor de envio', { opts: [['log', 'Modo teste (não envia, só registra)'], ['resend', 'Resend (recomendado)'], ['brevo', 'Brevo'], ['smtp', 'SMTP próprio']] })}${f('email_from_address', 'E-mail remetente', { type: 'email', ph: 'contato@seudominio.com.br', hint: 'O domínio precisa estar verificado no provedor (SPF/DKIM).' })}${f('email_from_name', 'Nome do remetente')}${f('resend_api_key', 'Resend · API key')}${f('brevo_api_key', 'Brevo · API key')}${f('smtp_host', 'SMTP · servidor')}${f('smtp_port', 'SMTP · porta', { ph: '465 ou 587' })}${f('smtp_user', 'SMTP · usuário')}${f('smtp_pass', 'SMTP · senha', { type: 'password' })}${f('smtp_secure', 'SMTP · TLS', { opts: [['true', 'TLS direto (porta 465)'], ['false', 'STARTTLS (porta 587)']] })}
      ${sw('release_emails', 'Enviar e-mail automático quando cada dia for liberado')}<div class="full"><button type="button" class="btn btn-soft btn-sm" id="te">Enviar e-mail de teste para mim</button></div>`],
    live: ['Aula ao vivo', `${sw('live_enabled', 'Mostrar o convite da aula ao vivo (Dias 6 e 7 e resultados)')}${f('live_title', 'Título', { full: true })}${f('live_weekday', 'Dia da semana', { opts: [[0, 'Domingo'], [1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'], [5, 'Sexta'], [6, 'Sábado']] })}${f('live_time', 'Horário (Brasília)', { type: 'time' })}${f('live_url', 'Link da aula (YouTube, Zoom, StreamYard…)', { full: true })}${f('live_description', 'Descrição', { full: true, area: true })}`],
    finance: ['Financeiro', `<p class="muted full" style="margin:0 0 6px">Usado para calcular o <b>faturamento líquido</b> quando a Greenn não envia o valor líquido da venda. Quando envia, o valor real é usado automaticamente.</p>${f('fee_percent', 'Taxa da plataforma de pagamento (%)', { type: 'number', ph: '4.99', hint: 'Greenn: confira em Minha conta › Taxas. Ex.: 4,99' })}${f('fee_fixed', 'Taxa fixa por venda (R$)', { type: 'number', ph: '1.00', hint: 'Ex.: 1,00' })}`],
    rules: ['Regras do desafio', `${f('phase_reserve_months', 'Meses de reserva para sair da Fase 1', { type: 'number', hint: 'Padrão do roteiro: 6 (ideal 12).' })}${f('phase3_patrimony', 'Patrimônio para entrar na Fase 3 (R$)', { type: 'number' })}${f('phase3_patrimony_foreign', 'Patrimônio para a Fase 3 · quem recebe em euro/dólar', { type: 'number', hint: 'Na moeda do aluno. Padrão: 20.000.' })}${f('tithe_percent', 'Percentual do dízimo (%)', { type: 'number' })}${f('release_hour', 'Hora de liberação no modo calendário (0–23)', { type: 'number' })}<p class="hint full">Ao alterar as regras, as fases de todos os alunos são recalculadas.</p>`],
  };
  tabs.backup = ['Backup', ''];
  $('#main').innerHTML = head('Configurações', 'Tudo o que muda o comportamento da plataforma, sem mexer em código.') + `<div class="tabs" id="st">${Object.entries(tabs).map(([k, [l]], i) => `<button data-k="${k}" class="${i ? '' : 'on'}">${l}</button>`).join('')}</div><div class="panel panel-b" id="sp"><form id="sf" class="form-grid"></form><div style="margin-top:8px"><button class="btn btn-primary" id="ss">Salvar alterações</button></div></div><div class="panel" id="bk" style="display:none"></div>`;
  const showBackup = async () => {
    const d = await api('/api/admin/backups');
    $('#bk').innerHTML = `<div class="panel-h"><div><h3>Cópias de segurança</h3><p class="faint" style="margin:4px 0 0">Automática todo dia a partir das 3h (Brasília). Ficam as 14 mais recentes, dentro da VPS. ${d.lastAuto ? `Última automática: ${fmtDateTime(d.lastAuto)}.` : 'A primeira automática roda na próxima madrugada.'}</p></div>${can('owner') ? '<button class="btn btn-primary btn-sm" id="bknew">Fazer cópia agora</button>' : ''}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cópia</th><th>Tamanho</th><th>Criada em</th><th></th></tr></thead><tbody>${d.rows.map((b) => `<tr><td><code>${esc(b.name)}</code></td><td>${(b.size / 1024).toFixed(0)} KB</td><td>${fmtDateTime(b.created_at)}</td><td>${can('owner') ? `<a class="btn btn-soft btn-sm" href="/api/admin/backups/${encodeURIComponent(b.name)}">Baixar</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nenhuma cópia ainda. Clique em “Fazer cópia agora”.</td></tr>'}</tbody></table></div>
      <div class="panel-b"><p class="faint" style="margin:0">Recomendado: uma vez por semana, clique em <b>Baixar</b> na cópia mais recente e guarde no Google Drive. Se a VPS tiver qualquer problema, os alunos, as vendas e as respostas estão nesse arquivo.</p></div>`;
    $('#bknew')?.addEventListener('click', async (e) => { await withLoading(e.currentTarget, async () => { try { await api('/api/admin/backups', { method: 'POST' }); toast('Cópia criada'); showBackup(); } catch (er) { toast(er.message, { error: true }); } }); });
  };
  const show = (k) => {
    $('#sp').style.display = k === 'backup' ? 'none' : ''; $('#bk').style.display = k === 'backup' ? '' : 'none';
    if (k === 'backup') return showBackup();
    $('#sf').innerHTML = tabs[k][1]; bindLogoFields($('#sf'), s); $$('#sf input[type=number]').forEach((i) => (i.step = 'any')); $('#te')?.addEventListener('click', async (e) => { await withLoading(e.currentTarget, async () => { const r = await api('/api/admin/settings/test-email', { method: 'POST', body: {} }); toast(r.status === 'sent' ? 'E-mail enviado. Confira a sua caixa.' : r.status === 'logged' ? 'Modo teste ativo: escolha um provedor para enviar de verdade.' : `Falhou: ${r.error}`, { error: r.status === 'failed', ms: 6000 }); }); }); };
  $$('#st [data-k]').forEach((b) => (b.onclick = () => { $$('#st button').forEach((x) => x.classList.toggle('on', x === b)); show(b.dataset.k); }));
  show('brand');
  $('#ss').onclick = async (e) => {
    const body = Object.fromEntries(new FormData($('#sf')));
    $$('#sf [data-bool]').forEach((c) => (body[c.dataset.bool] = c.checked ? 'true' : 'false'));
    await withLoading(e.currentTarget, async () => { try { await api('/api/admin/settings', { method: 'PUT', body }); toast('Configurações salvas'); } catch (er) { toast(er.message, { error: true }); } });
  };
}

// ---------- equipe e auditoria ----------
async function pageTeam() {
  if (!can('admin')) { $('#main').innerHTML = head('Equipe') + '<div class="alert alert-warn">Sem permissão.</div>'; return; }
  const { rows } = await api('/api/admin/team');
  $('#main').innerHTML = head('Equipe', 'Quem acessa o painel e o que cada um pode fazer.', can('owner') ? '<button class="btn btn-primary" id="na">+ Adicionar pessoa</button>' : '') + `
    <div class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pessoa</th><th>Papel</th><th>Status</th><th>Último acesso</th><th></th></tr></thead><tbody>${rows.map((a) => `<tr><td>${who(a.name, a.email)}</td><td>${ROLE[a.role]}</td><td>${a.active ? '<span class="badge ok">Ativo</span>' : '<span class="badge">Desativado</span>'}</td><td>${relTime(a.last_login_at)}</td><td>${can('owner') ? `<button class="btn btn-soft btn-sm" data-ed="${a.id}">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="panel panel-b" style="margin-top:16px"><b>Papéis</b><dl class="kv" style="margin-top:10px"><dt>Proprietário</dt><dd>Tudo, incluindo equipe, exclusão de alunos e nova URL de webhook.</dd><dt>Administrador</dt><dd>Conteúdo, configurações, integrações e operação.</dd><dt>Suporte</dt><dd>Alunos (acesso, links, liberar dia), reprocessar webhooks, exportar leads.</dd><dt>Leitura</dt><dd>Só visualiza.</dd></dl></div>`;
  const form = (a = {}) => modal({ title: a.id ? 'Editar pessoa' : 'Adicionar pessoa', body: `<form id="tf"><div class="field"><label>Nome</label><input class="input" name="name" value="${esc(a.name)}" required></div>${a.id ? '' : '<div class="field"><label>E-mail</label><input class="input" name="email" type="email" required></div>'}<div class="field"><label>Papel</label><select class="input" name="role">${Object.entries(ROLE).map(([k, l]) => `<option value="${k}" ${a.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="field"><label>${a.id ? 'Nova senha (opcional)' : 'Senha inicial'}</label><input class="input" name="password" type="password" ${a.id ? '' : 'required minlength="8"'}></div>${a.id ? `<label class="switch"><input type="checkbox" name="active" ${a.active ? 'checked' : ''}> Ativo</label>` : ''}<div style="margin-top:16px"><button class="btn btn-primary">Salvar</button></div></form>`,
    onMount: (m, close) => m.querySelector('#tf').addEventListener('submit', async (e) => { e.preventDefault(); const b = Object.fromEntries(new FormData(e.target)); if (a.id) b.active = !!b.active; if (!b.password) delete b.password; try { await api(a.id ? `/api/admin/team/${a.id}` : '/api/admin/team', { method: a.id ? 'PUT' : 'POST', body: b }); close(); toast('Salvo'); pageTeam(); } catch (er) { toast(er.message, { error: true }); } }) });
  $('#na')?.addEventListener('click', () => form());
  $$('[data-ed]').forEach((b) => (b.onclick = () => form(rows.find((x) => String(x.id) === b.dataset.ed))));
}

async function pageAudit(page = 1) {
  if (!can('admin')) { $('#main').innerHTML = head('Auditoria') + '<div class="alert alert-warn">Sem permissão.</div>'; return; }
  const d = await api(`/api/admin/audit?page=${page}&size=50`);
  $('#main').innerHTML = head('Auditoria', 'Registro de tudo o que a equipe fez no painel.') + `<div class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Alvo</th><th>Detalhes</th></tr></thead><tbody>${d.rows.map((r) => `<tr><td>${fmtDateTime(r.created_at)}</td><td>${esc(r.admin_name || '—')}</td><td><code>${esc(r.action)}</code></td><td>${esc(r.target || '')}</td><td><small class="faint">${esc(r.meta || '')}</small></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sem registros.</td></tr>'}</tbody></table></div>
    <div class="pager"><span>Página ${page}</span><div><button class="btn btn-soft btn-sm" id="pv" ${page <= 1 ? 'disabled' : ''}>Anterior</button><button class="btn btn-soft btn-sm" id="nx" ${d.rows.length < 50 ? 'disabled' : ''}>Próxima</button></div></div></div>`;
  $('#pv').onclick = () => pageAudit(page - 1); $('#nx').onclick = () => pageAudit(page + 1);
}

route();
