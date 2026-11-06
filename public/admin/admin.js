import { api, esc, toast, modal, withLoading, fmtDate, fmtDateTime, relTime, $, $$ } from '/shared/ui.js';
import { brl, pct, money, setCurrency, NOTAS_RETRATO, ARMAS, FRUTOS } from '/shared/calc.js';

const root = document.getElementById('root');
let ME = null;
const BASE = '/admin';

const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  dash: I('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.4 3.6 5.2"/>'),
  sales: I('<path d="M3 7h18v12H3z"/><path d="M3 11h18M7 15h3"/>'),
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
  ['Operação', [['', 'Visão geral', 'dash'], ['/alunos', 'Alunos', 'users'], ['/vendas', 'Vendas', 'sales'], ['/leads', 'Leads qualificados', 'leads'], ['/vozes', 'Depoimentos e recados', 'voice']]],
  ['Produto', [['/conteudo', 'Conteúdo', 'content'], ['/integracoes', 'Greenn e integrações', 'plug']]],
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
    [/^$/, pageDash], [/^\/alunos$/, pageStudents], [/^\/alunos\/(\d+)$/, pageStudent], [/^\/vendas$/, pageSales], [/^\/leads$/, pageLeads],
    [/^\/vozes$/, pageVoices], [/^\/conteudo$/, pageContent], [/^\/conteudo\/(\d+)$/, pageProduct], [/^\/integracoes$/, pageIntegrations],
    [/^\/config$/, pageSettings], [/^\/equipe$/, pageTeam], [/^\/auditoria$/, pageAudit],
  ];
  for (const [re, fn] of pages) { const m = path.match(re); if (m) { layout(path); try { await fn(...m.slice(1)); } catch (e) { if (e.status === 401) { ME = null; return pageLogin(); } $('#main').innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; } return; } }
  go('');
}

function layout(path) {
  if (!$('#main')) {
    root.innerHTML = `<div class="mobile-top"><button id="burger" aria-label="Menu">☰</button><b class="serif">Painel</b></div><div class="layout">
      <aside class="side"><a class="brand" href="${BASE}" data-go=""><span class="brand-mark">${ICONS.mark}</span><span><b>${esc(ME.brand)}</b><small>Painel</small></span></a>
      <nav id="nav"></nav>
      <div class="side-foot"><b>${esc(ME.admin.name)}</b>${esc(ROLE[ME.admin.role])} · <a href="${ME.appUrl}" target="_blank" style="color:var(--ink-300)">ver app ↗</a><br><button id="pwd">Trocar senha</button> · <button id="logout">Sair</button></div></aside>
      <div class="content" id="main"></div></div>`;
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

function pageLogin() {
  root.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(700px 400px at 0% 0%, rgba(31,107,82,.4), transparent 60%),radial-gradient(600px 400px at 100% 100%, rgba(201,164,92,.22), transparent 60%),var(--ink-950)">
    <div class="panel" style="width:min(400px,100%);padding:30px"><div style="display:flex;gap:10px;align-items:center;margin-bottom:22px"><span class="brand-mark" style="width:38px;height:38px;border-radius:11px;background:var(--ink-900);display:grid;place-items:center">${ICONS.mark.replace('viewBox', 'width="20" viewBox')}</span><div><div class="eyebrow">Painel administrativo</div><b class="serif" style="font-size:18px;font-weight:500">O Caminho Bíblico do Dinheiro</b></div></div>
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
      <div class="panel kpi dark c3"><div class="l">Receita (${d.days}d)</div><div class="v">${brl(d.revenue)}</div><div class="s">${d.sales} vendas · ticket ${brl(d.ticket)}</div></div>
      <div class="panel kpi c3"><div class="l">Alunos ativos</div><div class="v">${d.students.toLocaleString('pt-BR')}</div><div class="s">+${d.newStudents} no período · ${d.active7} ativos em 7d</div></div>
      <div class="panel kpi c3"><div class="l">Conclusão do desafio</div><div class="v">${enrolled ? pct(finished / enrolled) : '—'}</div><div class="s">${finished} de ${enrolled} concluíram o Dia 7</div></div>
      <div class="panel kpi c3"><div class="l">Reembolsos</div><div class="v">${pct(d.refundRate)}</div><div class="s">${d.refunds} no período · ${d.pending} aguardando pagamento</div></div>
      <div class="panel c8"><div class="panel-h"><h3>Receita por dia</h3><span class="faint">Vendas pagas, horário de Brasília</span></div><div class="panel-b"><div class="chart" id="ch"></div></div></div>
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

async function pageStudent(id) {
  const d = await api(`/api/admin/students/${id}`);
  const u = d.user;
  const j = d.journeys[0];
  const c = j?.computed;
  const ans = j?.answers || {};
  setCurrency(ans[1]?.moeda || 'BRL');
  const txt = (v) => (v ? `<div class="quote">${esc(v)}</div>` : '<span class="faint">—</span>');
  $('#main').innerHTML = `<a href="${BASE}/alunos" data-go="/alunos" class="faint" style="font-weight:700">← Alunos</a>` + head(esc(u.name || u.email), `${esc(u.email)}${u.phone ? ` · ${esc(u.phone)}` : ''} · cadastrado em ${fmtDate(u.created_at)}`,
    can('support') ? `<button class="btn btn-soft" id="link">Enviar link de acesso</button><button class="btn btn-soft" id="edit">Editar</button>${can('owner') ? '<button class="btn btn-danger" id="del">Excluir</button>' : ''}` : '') + `
    <div class="cols">
      <div class="c8 gap">
        ${j ? `<div class="panel"><div class="panel-h"><h3>${esc(j.product.name)}</h3><div style="display:flex;gap:8px;align-items:center">${can('support') ? '<button class="btn btn-soft btn-sm" id="unlock">Liberar próximo dia agora</button>' : ''}</div></div><div class="panel-b">
          <div class="days">${j.states.map((s) => `<div class="${s.completed ? 'done' : s.available ? 'open' : ''}" title="${esc(s.title)}"><b>${s.number}</b>${s.completed ? 'concluído' : s.available ? 'liberado' : s.availableAt ? fmtDateTime(s.availableAt).slice(0, 8) : 'bloqueado'}</div>`).join('')}</div>
          ${c ? `<div class="cols" style="margin-top:16px">${[['Renda', brl(c.renda)], ['Sobra real', ans[4] ? brl(c.sobraReal) : '—'], ['Dívidas', `${brl(c.dividaTotal)}${c.dividasAtraso ? ` · ${c.dividasAtraso} em atraso` : ''}`], ['Fase', c.faseNome || '—'], ['Guardado', ans[4] ? brl(c.guardado) : '—'], ['Pode direcionar/mês', brl(c.direcionar)], ['Paz D1 → D7', `${c.pazD1 ?? '—'} → ${c.pazD7 ?? '—'}`], ['Score de lead', `${c.leadScore}/100`]].map(([l, v]) => `<div class="c3"><div class="faint" style="font-size:12px;font-weight:700">${l}</div><div style="font-weight:700;margin-top:2px">${v}</div></div>`).join('')}</div>` : ''}
        </div></div>
        <div class="panel"><div class="panel-h"><h3>Respostas das atividades</h3><div class="tabs" style="margin:0" id="dtabs">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button data-d="${n}" ${ans[n] ? '' : 'style="opacity:.45"'}>D${n}</button>`).join('')}</div></div><div class="panel-b" id="dans"><p class="faint">Selecione um dia.</p></div></div>` : '<div class="panel panel-b"><p class="muted">Este aluno não está inscrito no desafio.</p></div>'}
        <div class="panel"><div class="panel-h"><h3>Compras</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Venda</th><th>Produto</th><th>Status</th><th class="r">Valor</th><th>Data</th></tr></thead><tbody>${d.sales.map((s) => `<tr><td>${esc(s.sale_id)}</td><td>${esc(s.product_name || s.provider_product_id)}</td><td>${badge(s.status)}</td><td class="r">${brl(s.amount)}</td><td>${fmtDateTime(s.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sem compras registradas (acesso manual).</td></tr>'}</tbody></table></div></div>
      </div>
      <div class="c4 gap">
        <div class="panel"><div class="panel-h"><h3>Acessos</h3></div><div class="panel-b">${d.products.map((p) => { const e = d.enrollments.find((x) => x.product_id === p.id); const active = e?.status === 'active'; return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)"><div><b>${esc(p.name)}</b><br><small class="faint">${e ? `${STATUS[e.status]?.[0] || e.status} · ${e.source} · ${fmtDate(e.started_at)}` : 'sem acesso'}</small></div>${can('support') ? `<button class="btn btn-sm ${active ? 'btn-danger' : 'btn-soft'}" data-acc="${active ? 'revoke' : 'grant'}" data-pid="${p.id}">${active ? 'Remover' : 'Liberar'}</button>` : ''}</div>`; }).join('')}</div></div>
        <div class="panel"><div class="panel-h"><h3>Conta</h3></div><div class="panel-b"><dl class="kv" style="grid-template-columns:110px 1fr">
          <dt>Status</dt><dd>${badge(u.status)}</dd><dt>Senha</dt><dd>${u.has_password ? 'Criada' : '<span class="badge warn">Ainda não criou</span>'}</dd><dt>Último login</dt><dd>${fmtDateTime(u.last_login_at)}</dd><dt>Visto por último</dt><dd>${relTime(u.last_seen_at)}</dd><dt>CPF/CNPJ</dt><dd>${esc(u.document || '—')}</dd>${u.notes ? `<dt>Notas</dt><dd>${esc(u.notes)}</dd>` : ''}</dl></div></div>
        <div class="panel"><div class="panel-h"><h3>E-mails enviados</h3></div><div class="panel-b" style="font-size:13px">${d.notifications.filter((n) => n.channel === 'email').map((n) => `<div style="display:flex;justify-content:space-between;padding:5px 0"><span>${esc({ access: 'Acesso', release: `Liberação ${n.ref.split(':')[1] ? 'Dia ' + n.ref.split(':')[1] : ''}`, reset: 'Senha' }[n.kind] || n.kind)}</span><span>${n.status === 'failed' ? `<span class="badge err" title="${esc(n.error)}">falhou</span>` : n.status === 'logged' ? '<span class="badge">modo teste</span>' : '<span class="badge ok">enviado</span>'} <small class="faint">${relTime(n.created_at)}</small></span></div>`).join('') || '<span class="faint">Nenhum.</span>'}</div></div>
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
  $('#unlock')?.addEventListener('click', async () => { try { const r = await api(`/api/admin/students/${id}/unlock-next`, { method: 'POST', body: { product_id: j.product.id } }); toast(`Dia ${r.day} liberado`); pageStudent(id); } catch (er) { toast(er.message, { error: true }); } });
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
async function pageContent() {
  const { rows } = await api('/api/admin/products');
  $('#main').innerHTML = head('Conteúdo', 'Produtos, dias do desafio, vídeos e textos. Vincule aqui os IDs dos produtos da Greenn.', can('admin') ? '<button class="btn btn-primary" id="np">+ Novo produto</button>' : '') + `
    <div class="cols">${rows.map((p) => `<div class="panel c6"><div class="panel-h"><div><div class="eyebrow">${{ challenge: 'Desafio', course: 'Curso', bonus: 'Bônus / order bump' }[p.kind]}</div><h3 style="margin-top:4px">${esc(p.name)}</h3></div>${p.active ? '<span class="badge ok">Ativo</span>' : '<span class="badge">Inativo</span>'}</div>
      <div class="panel-b"><dl class="kv" style="grid-template-columns:150px 1fr"><dt>IDs na Greenn</dt><dd>${p.greenn_ids ? p.greenn_ids.split(',').map((x) => `<span class="badge ink">${esc(x)}</span>`).join(' ') : '<span class="badge warn">Não vinculado</span>'}</dd><dt>Aulas</dt><dd>${p.lessons}</dd><dt>Alunos ativos</dt><dd>${p.students}</dd><dt>Liberação</dt><dd>${{ after_complete: `${p.release_delay_hours}h após concluir o dia anterior`, drip: 'Por calendário (dias após a compra)', sequential: 'Imediata ao concluir o anterior', open: 'Tudo liberado' }[p.release_mode]}</dd></dl>
      <a class="btn btn-soft btn-sm" style="margin-top:14px" href="${BASE}/conteudo/${p.id}" data-go="/conteudo/${p.id}">Editar produto e aulas</a></div></div>`).join('')}</div>`;
  $('#np')?.addEventListener('click', () => productModal());
}

function productModal(p = {}) {
  const mats = (p.materials || []).map((m) => `${m.title} | ${m.url}`).join('\n');
  modal({ title: p.id ? 'Configurar produto' : 'Novo produto', wide: true, body: `<form id="pf" class="form-grid">
    <div class="field"><label>Nome</label><input class="input" name="name" value="${esc(p.name)}" required></div>
    <div class="field"><label>Identificador (slug)</label><input class="input" name="slug" value="${esc(p.slug)}" placeholder="desafio-7-dias" required></div>
    <div class="field"><label>Tipo</label><select class="input" name="kind">${[['challenge', 'Desafio (dias com atividades)'], ['course', 'Curso'], ['bonus', 'Bônus / order bump (materiais)']].map(([v, l]) => `<option value="${v}" ${p.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label>IDs do produto na Greenn</label><input class="input" name="greenn_ids" value="${esc(p.greenn_ids)}" placeholder="Ex.: 123456, 123457"><span class="hint">O número que aparece na URL de edição do produto na Greenn. Separe vários por vírgula (oferta principal, ofertas com outro preço, combo…).</span></div>
    <div class="field"><label>Liberação dos dias</label><select class="input" name="release_mode">${[['after_complete', 'X horas após concluir o dia anterior (recomendado)'], ['sequential', 'Imediata ao concluir o anterior'], ['drip', 'Por calendário (dias após a compra)'], ['open', 'Tudo liberado de uma vez']].map(([v, l]) => `<option value="${v}" ${(p.release_mode || 'after_complete') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label>Intervalo de liberação (horas)</label><input class="input" name="release_delay_hours" type="number" min="0" value="${esc(p.release_delay_hours ?? 24)}"></div>
    <div class="field"><label>Duração do acesso (dias)</label><input class="input" name="access_days" type="number" min="1" value="${esc(p.access_days ?? '')}" placeholder="Vazio = vitalício"></div>
    <div class="field"><label>Ordem</label><input class="input" name="position" type="number" value="${esc(p.position ?? 0)}"></div>
    <div class="field full"><label>Frase de apoio</label><input class="input" name="tagline" value="${esc(p.tagline)}"></div>
    <div class="field full"><label>Materiais para download (um por linha: Título | URL)</label><textarea class="input" name="materials" placeholder="Guia rápido: Casa em Ordem | https://…/guia.pdf">${esc(mats)}</textarea></div>
    <label class="switch full"><input type="checkbox" name="active" ${p.active !== 0 ? 'checked' : ''}> Produto ativo</label>
    <div class="full" style="margin-top:16px"><button class="btn btn-primary">Salvar</button></div></form>`,
  onMount: (m, close) => m.querySelector('#pf').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    f.active = !!f.active; f.materials = String(f.materials || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]).map(([title, url]) => ({ title, url: url || '' }));
    try { if (p.id) await api(`/api/admin/products/${p.id}`, { method: 'PUT', body: f }); else await api('/api/admin/products', { method: 'POST', body: f }); close(); toast('Produto salvo'); route(); }
    catch (er) { toast(er.message, { error: true }); }
  }) });
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

async function lessonModal(lid, pid) {
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

// ---------- configurações ----------
async function pageSettings() {
  if (!can('admin')) { $('#main').innerHTML = head('Configurações') + '<div class="alert alert-warn">Apenas administradores podem alterar configurações.</div>'; return; }
  const { settings: s } = await api('/api/admin/settings');
  const f = (k, label, o = {}) => `<div class="field ${o.full ? 'full' : ''}"><label>${label}</label>${o.area ? `<textarea class="input" name="${k}">${esc(s[k])}</textarea>` : o.opts ? `<select class="input" name="${k}">${o.opts.map(([v, l]) => `<option value="${v}" ${String(s[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>` : `<input class="input" name="${k}" type="${o.type || 'text'}" value="${esc(s[k])}" placeholder="${esc(o.ph || '')}">`}${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</div>`;
  const sw = (k, label) => `<label class="switch full" style="margin:6px 0 14px"><input type="checkbox" data-bool="${k}" ${s[k] === 'true' ? 'checked' : ''}> ${label}</label>`;
  const tabs = {
    brand: ['Marca e suporte', `${f('brand_name', 'Nome do produto (aparece em e-mails e no app)', { full: true })}${f('brand_short', 'Nome curto (topo do app)')}${f('mentor_name', 'Mentor')}${f('support_email', 'E-mail de suporte', { type: 'email' })}${f('support_whatsapp', 'WhatsApp de suporte', { ph: '+55 11 99999-9999' })}${f('guide_url', 'Link do Guia rápido Casa em Ordem (PDF)', { full: true, hint: 'Aparece no fim da atividade do Dia 6.' })}`],
    email: ['E-mail', `${f('email_provider', 'Provedor de envio', { opts: [['log', 'Modo teste (não envia, só registra)'], ['resend', 'Resend (recomendado)'], ['brevo', 'Brevo'], ['smtp', 'SMTP próprio']] })}${f('email_from_address', 'E-mail remetente', { type: 'email', ph: 'contato@seudominio.com.br', hint: 'O domínio precisa estar verificado no provedor (SPF/DKIM).' })}${f('email_from_name', 'Nome do remetente')}${f('resend_api_key', 'Resend · API key')}${f('brevo_api_key', 'Brevo · API key')}${f('smtp_host', 'SMTP · servidor')}${f('smtp_port', 'SMTP · porta', { ph: '465 ou 587' })}${f('smtp_user', 'SMTP · usuário')}${f('smtp_pass', 'SMTP · senha', { type: 'password' })}${f('smtp_secure', 'SMTP · TLS', { opts: [['true', 'TLS direto (porta 465)'], ['false', 'STARTTLS (porta 587)']] })}
      ${sw('release_emails', 'Enviar e-mail automático quando cada dia for liberado')}<div class="full"><button type="button" class="btn btn-soft btn-sm" id="te">Enviar e-mail de teste para mim</button></div>`],
    live: ['Aula ao vivo', `${sw('live_enabled', 'Mostrar o convite da aula ao vivo (Dias 6 e 7 e resultados)')}${f('live_title', 'Título', { full: true })}${f('live_weekday', 'Dia da semana', { opts: [[0, 'Domingo'], [1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'], [5, 'Sexta'], [6, 'Sábado']] })}${f('live_time', 'Horário (Brasília)', { type: 'time' })}${f('live_url', 'Link da aula (YouTube, Zoom, StreamYard…)', { full: true })}${f('live_description', 'Descrição', { full: true, area: true })}`],
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
    $('#sf').innerHTML = tabs[k][1]; $('#te')?.addEventListener('click', async (e) => { await withLoading(e.currentTarget, async () => { const r = await api('/api/admin/settings/test-email', { method: 'POST', body: {} }); toast(r.status === 'sent' ? 'E-mail enviado. Confira a sua caixa.' : r.status === 'logged' ? 'Modo teste ativo: escolha um provedor para enviar de verdade.' : `Falhou: ${r.error}`, { error: r.status === 'failed', ms: 6000 }); }); }); };
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
