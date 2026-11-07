import { api, esc, toast, modal, withLoading, countdown, videoEmbed, firstName, fmtDate, $ } from '/shared/ui.js';
import { compute, brl, NOTAS_RETRATO, setCurrency } from '/shared/calc.js';
import { mountActivity, casaHtml, planoHtml, fmtLive, liveDateHtml } from '/activities.js';
import { mountPlayer, youtubeId } from '/shared/player.js';

const app = document.getElementById('app');
let ME = null;
let timers = [];
let cleanups = [];
const clearTimers = () => { timers.forEach(clearInterval); timers = []; cleanups.forEach((f) => { try { f(); } catch { /* */ } }); cleanups = []; };

const ICON = {
  mark: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v18M6 8h12" stroke="#E6CD97" stroke-width="1.8" stroke-linecap="round"/><path d="M4.5 19.5c2.4-1.3 4.9-2 7.5-2s5.1.7 7.5 2" stroke="#7FB8A2" stroke-width="1.6" stroke-linecap="round"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="5" y="10" width="14" height="10" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
};

// ---------- navegação ----------
export function go(path, replace = false) {
  if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
  route();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey) return;
  e.preventDefault(); go(a.getAttribute('href'));
});
window.addEventListener('popstate', route);

async function loadMe() {
  try { ME = await api('/api/app/me'); return ME; } catch (e) { if (e.status === 401) { ME = null; return null; } throw e; }
}
const mainProduct = () => ME?.products.find((p) => p.kind === 'challenge') || ME?.products[0];

async function route() {
  clearTimers();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const pub = { '/login': pageLogin, '/acesso': pageAccess, '/esqueci': pageForgot };
  if (pub[path]) return pub[path]();
  if (!ME) await loadMe().catch(() => null);
  if (!ME) return go('/login', true);
  window.scrollTo(0, 0);
  const m = path.match(/^\/dia\/(\d+)$/);
  if (m) return pageDay(Number(m[1]));
  if (path === '/resultados') return pageResults();
  if (path === '/perfil') return pageProfile();
  return pageHome();
}

// ---------- casca ----------
function shell(content, active, { wide } = {}) {
  const s = ME.settings;
  const nav = [['/', 'Jornada', ICON.home, 'home'], ['/resultados', 'Resultados', ICON.chart, 'results'], ['/perfil', 'Perfil', ICON.user, 'profile']];
  app.innerHTML = `
    <header class="topbar"><div class="topbar-in">
      <a class="brand" href="/" data-link><span class="brand-mark">${ICON.mark}</span><span class="brand-name">${esc(s.brand_short || 'Caminho Bíblico')}<small>${esc(s.mentor_name || '')}</small></span></a>
      <nav class="topnav">${nav.map(([h, l, , k]) => `<a href="${h}" data-link class="${active === k ? 'active' : ''}">${l}</a>`).join('')}</nav>
      <a class="avatar" href="/perfil" data-link title="Meu perfil">${esc((firstName(ME.user.name) || ME.user.email)[0].toUpperCase())}</a>
    </div></header>
    <main class="page ${wide ? 'wide' : ''}">${content}</main>
    <nav class="tabbar">${nav.map(([h, l, ic, k]) => `<a href="${h}" data-link class="${active === k ? 'active' : ''}">${ic}<span>${l}</span></a>`).join('')}</nav>`;
}

function authShell(card) {
  const s = ME?.settings || {};
  app.innerHTML = `<div class="auth">
    <div class="auth-art">
      <span class="brand"><span class="brand-mark">${ICON.mark}</span><span class="brand-name">O Caminho Bíblico<small>do Dinheiro</small></span></span>
      <div class="auth-quote"><h1>Não é sobre quanto você ganha. É sobre <em>quem governa</em> o que você ganha.</h1><p>7 dias para colocar o coração no lugar, a casa financeira em ordem e sair com um plano claro de patrimônio.</p></div>
      <div class="auth-verse">“Sobre tudo o que se deve guardar, guarda o teu coração, porque dele procedem as fontes da vida.”<span>Provérbios 4:23</span></div>
    </div>
    <div class="auth-panel"><div class="auth-card">${card}</div></div></div>`;
  void s;
}

// ---------- login / acesso ----------
function pageLogin() {
  authShell(`<div class="eyebrow">Área do aluno</div><h2>Bem-vindo de volta</h2><p class="muted">Entre com o e-mail usado na compra.</p>
    <div id="msg"></div>
    <form id="f" novalidate>
      <div class="field"><label for="email">E-mail</label><input class="input" id="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="pw">Senha</label><input class="input" id="pw" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary btn-block" style="margin-top:6px">Entrar</button>
    </form>
    <div class="auth-links"><a href="/esqueci" data-link>Primeiro acesso ou esqueci a senha</a></div>`);
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || $('#f button');
    await withLoading(btn, async () => {
      try {
        await api('/api/app/login', { method: 'POST', body: { email: $('#email').value, password: $('#pw').value } });
        await loadMe(); go('/', true);
      } catch (err) {
        $('#msg').innerHTML = `<div class="alert alert-error">${esc(err.message)}${err.data?.code === 'no_password' ? ' <a href="/esqueci" data-link>Receber link</a>' : ''}</div>`;
      }
    });
  });
}

function pageForgot() {
  authShell(`<a class="back" href="/login" data-link>${ICON.back} Voltar</a><h2>Receber link de acesso</h2><p class="muted">Informe o e-mail usado na compra. Enviamos um link para você criar ou redefinir a sua senha.</p>
    <div id="msg"></div><form id="f"><div class="field"><label for="email">E-mail</label><input class="input" id="email" type="email" autocomplete="email" required></div>
    <button class="btn btn-primary btn-block">Enviar link</button></form>
    ${'<p class="hint" style="margin-top:18px">Comprou agora? O link de acesso também foi enviado para o seu e-mail logo após a confirmação do pagamento.</p>'}`);
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    await withLoading($('#f button'), async () => {
      try { const r = await api('/api/app/forgot', { method: 'POST', body: { email: $('#email').value } }); $('#msg').innerHTML = `<div class="alert alert-ok">${esc(r.message)}</div>`; }
      catch (err) { $('#msg').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`; }
    });
  });
}

async function pageAccess() {
  const token = new URLSearchParams(location.search).get('t');
  authShell('<div class="skeleton" style="height:240px"></div>');
  let info;
  try { info = await api('/api/app/token/check', { method: 'POST', body: { token } }); }
  catch (e) { authShell(`<h2>Link expirado</h2><p class="muted">${esc(e.message)}</p><a class="btn btn-primary btn-block" href="/esqueci" data-link>Pedir um novo link</a>`); return; }
  authShell(`<div class="eyebrow">${info.purpose === 'reset' ? 'Nova senha' : 'Primeiro acesso'}</div><h2>${esc(firstName(info.name) || 'Olá')}, crie a sua senha</h2><p class="muted">${esc(info.email)}</p>
    <div id="msg"></div><form id="f">
    <div class="field"><label for="pw">Senha</label><input class="input" id="pw" type="password" minlength="8" autocomplete="new-password" required><span class="hint">Mínimo de 8 caracteres.</span></div>
    <div class="field"><label for="pw2">Confirme a senha</label><input class="input" id="pw2" type="password" autocomplete="new-password" required></div>
    <button class="btn btn-gold btn-block">Salvar e começar</button></form>`);
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('#pw').value !== $('#pw2').value) { $('#msg').innerHTML = '<div class="alert alert-error">As senhas não são iguais.</div>'; return; }
    await withLoading($('#f button'), async () => {
      try { await api('/api/app/token/consume', { method: 'POST', body: { token, password: $('#pw').value } }); await loadMe(); go('/', true); toast('Senha criada. Seja bem-vindo!'); }
      catch (err) { $('#msg').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`; }
    });
  });
}

// ---------- jornada ----------
function ring(done, total) {
  const r = 44, c = 2 * Math.PI * r, p = total ? done / total : 0;
  return `<div class="ring"><svg viewBox="0 0 104 104"><circle cx="52" cy="52" r="${r}" stroke="rgba(255,255,255,.12)" stroke-width="7" fill="none"/><circle cx="52" cy="52" r="${r}" stroke="#C9A45C" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" style="transition:stroke-dashoffset 1s var(--ease)"/></svg>
    <div class="ring-label"><div><b>${done}</b><small>de ${total}</small></div></div></div>`;
}

function pageHome() {
  const p = mainProduct();
  const name = firstName(ME.user.name);
  if (!p) { shell(`<div class="card"><h2>Nenhum conteúdo ativo</h2><p class="muted">Não encontramos uma inscrição ativa no seu e-mail. Se você acabou de comprar, aguarde alguns minutos.</p></div>`, 'home'); return; }
  const L = p.lessons;
  const done = L.filter((l) => l.completed).length;
  const current = L.find((l) => l.available && !l.completed);
  const nextLocked = L.find((l) => !l.available);
  const finished = done === L.length && L.length > 0;
  let cta;
  if (finished) cta = `<a class="btn btn-gold" href="/resultados" data-link>Ver meus resultados</a>`;
  else if (current) cta = `<a class="btn btn-gold" href="/dia/${current.number}" data-link>${ICON.play} ${current.watched ? 'Continuar' : 'Começar'} o Dia ${current.number}</a>`;
  else if (nextLocked?.availableAt) cta = `<span class="lock-note">${ICON.lock.replace('28', '16').replace('28', '16')} Dia ${nextLocked.number} libera em <b data-cd="${nextLocked.availableAt}">${countdown(nextLocked.availableAt)}</b></span>`;
  else if (nextLocked) cta = `<span class="lock-note">Conclua o dia anterior para liberar o Dia ${nextLocked.number}</span>`;

  const blocks = [];
  for (const l of L) { const b = l.block || 'Jornada'; let g = blocks.find((x) => x.b === b); if (!g) blocks.push((g = { b, items: [] })); g.items.push(l); }
  const blockSub = { Coração: 'onde estou', Princípios: 'honra', Patrimônio: 'para onde vou' };
  const dayCard = (l) => {
    const cls = l.completed ? 'is-done' : l.available ? 'is-current' : 'is-locked';
    const state = l.completed ? `<span class="badge ok">${ICON.check} Concluído</span>`
      : l.available ? '<span class="badge gold">Liberado</span>'
        : l.availableAt ? `<span class="faint day-state">em <span data-cd="${l.availableAt}">${countdown(l.availableAt)}</span></span>` : `<span class="faint day-state">${ICON.lock.replace(/28/g, '18')}</span>`;
    const inner = `<div class="day-num">${l.completed ? ICON.check : l.number}</div><div class="day-body"><h4>${esc(l.title)}</h4><p>Dia ${l.number}${l.video_duration ? ` · aula de ${esc(l.video_duration)}` : ''}</p></div>${state}`;
    return l.available ? `<a class="day ${cls}" href="/dia/${l.number}" data-link>${inner}</a>` : `<div class="day ${cls}" aria-disabled="true">${inner}</div>`;
  };

  shell(`
    <section class="hero">
      <div class="hero-row">${ring(done, L.length)}<div><div class="eyebrow" style="color:var(--gold-300)">${esc(p.name)}</div><h1 style="margin-top:6px">${finished ? `Você concluiu, <em>${esc(name)}</em>.` : `Olá, <em>${esc(name || 'seja bem-vindo')}</em>.`}</h1>
      <p class="muted" style="margin:6px 0 0">${finished ? 'Que Deus continue a obra que começou em você nestes 7 dias.' : current ? `Hoje: ${esc(current.title)}` : 'Cada dia tem uma aula curta e uma atividade prática.'}</p></div></div>
      <div class="hero-cta">${cta || ''}</div>
    </section>
    ${ME.live && (done >= 6 || finished) ? liveCard(ME.live) : ''}
    <div class="section-h"><h2>Sua jornada</h2><span class="faint" style="font-size:13px">${p.releaseMode === 'after_complete' ? `Cada dia libera ${p.releaseDelayHours}h após concluir o anterior` : ''}</span></div>
    ${blocks.map((g) => `<div class="block-label"><span class="eyebrow">${esc(g.b)}${blockSub[g.b] ? ` · ${blockSub[g.b]}` : ''}</span></div><div class="day-list">${g.items.map(dayCard).join('')}</div>`).join('')}
    <div id="sum"></div>
    ${ME.products.filter((x) => x.kind === 'bonus' && x.materials.length).map((b) => `<div class="section-h"><h2>${esc(b.name)}</h2></div><div class="card">${b.tagline ? `<p class="muted">${esc(b.tagline)}</p>` : ''}${b.materials.map((m) => `<a class="btn btn-ghost btn-sm" href="${esc(m.url)}" target="_blank" rel="noopener" style="margin:4px 6px 0 0">${esc(m.title)}</a>`).join('')}</div>`).join('')}
    ${installTip()}
  `, 'home');
  tickCountdowns();
  bindInstall();
  if (done >= 1) loadHomeSummary(p);
}

async function loadHomeSummary(p) {
  try {
    const r = await api(`/api/app/p/${p.slug}/results`);
    setCurrency(r.answers[1]?.moeda);
    const c = compute(r.answers, ME.settings.rules);
    const items = [];
    if (r.answers[1]) items.push(['Renda mensal', brl(c.renda), '']);
    if (r.answers[4]) items.push(['Sobra real', brl(c.sobraReal), c.sobraReal < 0 ? 'neg' : 'pos']);
    if (c.fase) items.push(['Minha fase', `Fase ${c.fase}`, '']);
    else if (r.answers[1]) items.push(['Paz com o dinheiro', `${c.pazD1 ?? '—'}/10`, '']);
    if (!items.length) return;
    $('#sum').innerHTML = `<div class="section-h"><h2>Seus números</h2><a href="/resultados" data-link style="font-size:14px;font-weight:700">Ver tudo →</a></div><div class="grid-3">${items.map(([l, v, cls]) => `<div class="metric"><div class="label">${l}</div><div class="val ${cls}">${v}</div></div>`).join('')}</div>`;
  } catch { /* silencioso */ }
}

function liveCard(live) {
  const ics = icsLink(live);
  return `<div class="live-card" style="margin-top:16px">${liveDateHtml(live)}<div style="flex:1;min-width:200px"><div class="eyebrow" style="color:var(--gold-300)">Aula ao vivo</div><h3 style="margin-top:4px">${esc(live.title)}</h3><p>${esc(fmtLive(live.startsAt))}</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${live.url ? `<a class="btn btn-gold btn-sm" href="${esc(live.url)}" target="_blank" rel="noopener">Acessar a aula</a>` : ''}<a class="btn btn-ghost btn-sm" style="color:#fff;border-color:rgba(255,255,255,.3)" href="${ics}" download="aula-ao-vivo.ics">Salvar na agenda</a></div></div>`;
}
function icsLink(live) {
  const dt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = new Date(Date.parse(live.startsAt) + 90 * 60e3).toISOString();
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CaminhoBiblico//PT', 'BEGIN:VEVENT', `UID:${Date.parse(live.startsAt)}@caminhobiblico`, `DTSTAMP:${dt(new Date().toISOString())}`, `DTSTART:${dt(live.startsAt)}`, `DTEND:${dt(end)}`, `SUMMARY:${live.title}`, `DESCRIPTION:${(live.url || '').replace(/[,;]/g, '')}`, 'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Aula ao vivo', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(body);
}

function tickCountdowns() {
  const run = () => {
    let reload = false;
    document.querySelectorAll('[data-cd]').forEach((el) => { el.textContent = countdown(el.dataset.cd); if (Date.parse(el.dataset.cd) <= Date.now()) reload = true; });
    if (reload) { clearTimers(); loadMe().then(route); }
  };
  timers.push(setInterval(run, 30_000));
}

// ---------- página do dia ----------
async function pageDay(n) {
  const p = mainProduct();
  shell('<div class="skeleton" style="height:42px;width:60%"></div><div class="skeleton" style="height:320px;margin-top:20px"></div>', 'home');
  let d;
  try { d = await api(`/api/app/p/${p.slug}/day/${n}`); }
  catch (e) { shell(`<div class="card"><h2>Não foi possível abrir</h2><p class="muted">${esc(e.message)}</p><a class="btn btn-primary" href="/" data-link>Voltar</a></div>`, 'home'); return; }

  if (d.locked) {
    shell(`<a class="back" href="/" data-link>${ICON.back} Jornada</a><div class="locked-page"><div class="ico">${ICON.lock}</div><div class="eyebrow">Dia ${n}</div><h1 style="font-size:32px;margin-top:8px">${esc(d.lesson.title)}</h1>
      ${d.state.availableAt ? `<p class="muted" style="margin-top:14px">Este dia é liberado em</p><div class="countdown-big" data-cd="${d.state.availableAt}">${countdown(d.state.availableAt)}</div><p class="faint">Use esse tempo para colocar em prática o que você aprendeu.</p>` : `<p class="muted" style="margin-top:14px">Conclua o Dia ${n - 1} para liberar este conteúdo.</p><a class="btn btn-primary" href="/dia/${n - 1}" data-link>Ir para o Dia ${n - 1}</a>`}</div>`, 'home');
    tickCountdowns();
    return;
  }

  const L = d.lesson, st = d.state;
  // YouTube → player próprio; outros provedores → incorporação padrão
  const own1 = youtubeId(L.video_url), own2 = youtubeId(L.practice_video_url);
  const v1 = own1 ? `<div id="pp1"></div>` : videoEmbed(L.video_url, `Aula do Dia ${n}`);
  const v2 = own2 ? `<div id="pp2"></div>` : videoEmbed(L.practice_video_url, `Prática do Dia ${n}`);
  const player = (html, label) => (html && html.startsWith('<div id="pp') ? html : `<div class="player">${html || `<div class="player-empty"><div><b>${label}</b>O vídeo será publicado em breve.</div></div>`}</div>`);
  shell(`
    <a class="back no-print" href="/" data-link>${ICON.back} Jornada</a>
    <header class="day-head"><div class="eyebrow">Dia ${n} de 7 ${L.block ? `<span class="badge" style="letter-spacing:0;text-transform:none">${esc(L.block)}</span>` : ''}</div>
      <h1>${esc(L.title)}</h1>${L.subtitle ? `<p>${esc(L.subtitle)}</p>` : ''}
      <div class="steps" id="steps"><span></span><span></span><span></span></div></header>

    <section class="step-card"><div class="step-h"><span class="step-n ${st.watched ? 'done' : ''}" id="s1">1</span><h2>A aula</h2><span class="meta">${esc(L.video_duration || '')}</span></div>
      ${player(v1, 'Aula do dia')}
      <div class="watch-row"><span class="faint" style="font-size:13px">Assista com atenção. Se puder, tenha uma Bíblia por perto.</span><button class="btn btn-soft btn-sm" id="w1" ${st.watched ? 'disabled' : ''}>${st.watched ? `${ICON.check} Aula assistida` : 'Marcar aula como assistida'}</button></div>
    </section>

    ${L.objective ? `<div class="objective" style="margin-top:22px"><div class="eyebrow" style="margin-bottom:6px">Objetivo de hoje</div>${esc(L.objective)}</div>` : ''}
    ${L.verses?.length ? `<div class="section-h"><h2 style="font-size:20px">A Palavra de hoje</h2></div><div class="verses">${L.verses.map((v) => `<div class="verse"><p>${esc(v.text)}</p><span>${esc(v.ref)}</span></div>`).join('')}</div>` : ''}
    ${L.key_phrases?.length ? `<div class="section-h"><h2 style="font-size:20px">Para guardar no coração</h2></div><ul class="phrases">${L.key_phrases.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}

    ${L.activity_key ? `<section class="step-card"><div class="step-h"><span class="step-n ${st.practiceWatched ? 'done' : ''}" id="s2">2</span><h2>A prática</h2><span class="meta">${esc(L.practice_duration || '')}</span></div>
      ${v2 ? player(v2, '') + `<div class="watch-row"><span></span><button class="btn btn-soft btn-sm" id="w2" ${st.practiceWatched ? 'disabled' : ''}>${st.practiceWatched ? `${ICON.check} Prática assistida` : 'Marcar como assistida'}</button></div>` : '<p class="muted">Siga os passos abaixo. Leva cerca de ' + esc(L.practice_duration || '15 min') + '.</p>'}
    </section>
    <section class="step-card"><div class="step-h"><span class="step-n ${st.completed ? 'done' : ''}" id="s3">3</span><h2>A sua atividade de hoje</h2></div><div id="activity"></div></section>
    <div class="save-state no-print"><span id="save">Suas respostas são salvas automaticamente</span></div>` : ''}

    <div class="finish" id="finish"></div>
  `, 'home');

  const steps = () => { const on = [st.watched, st.practiceWatched || !L.practice_video_url, st.completed]; document.querySelectorAll('#steps span').forEach((s, i) => s.classList.toggle('on', on[i])); };
  steps();
  const progress = async (action) => {
    const r = await api(`/api/app/p/${p.slug}/day/${n}/progress`, { method: 'POST', body: { action } });
    Object.assign(st, r.state);
    steps(); return r;
  };
  const markBtn = (sel, label, stepSel) => { const b = $(sel); if (b) { b.innerHTML = `${ICON.check} ${label}`; b.disabled = true; } $(stepSel)?.classList.add('done'); };
  if (own1) {
    const pl = mountPlayer($('#pp1'), { url: L.video_url, cover: L.cover_url, title: `Dia ${n} · ${L.title}`, storageKey: `${ME.user.id}:${p.slug}:${n}:aula`,
      onWatched: async () => { if (st.watched) return; try { await progress('watched'); markBtn('#w1', 'Aula assistida', '#s1'); } catch { /* */ } } });
    if (pl) cleanups.push(() => pl.destroy());
  }
  if (own2) {
    const pl = mountPlayer($('#pp2'), { url: L.practice_video_url, cover: L.practice_cover_url, title: `Prática do Dia ${n}`, storageKey: `${ME.user.id}:${p.slug}:${n}:pratica`,
      onWatched: async () => { if (st.practiceWatched) return; try { await progress('practice'); markBtn('#w2', 'Prática assistida', '#s2'); } catch { /* */ } } });
    if (pl) cleanups.push(() => pl.destroy());
  }
  $('#w1')?.addEventListener('click', async (e) => { await withLoading(e.currentTarget, () => progress('watched')); e.currentTarget.innerHTML = `${ICON.check} Aula assistida`; e.currentTarget.disabled = true; $('#s1').classList.add('done'); });
  $('#w2')?.addEventListener('click', async (e) => { await withLoading(e.currentTarget, () => progress('practice')); e.currentTarget.innerHTML = `${ICON.check} Prática assistida`; e.currentTarget.disabled = true; $('#s2')?.classList.add('done'); });

  // atividade com salvamento automático (servidor + rascunho local)
  let act = null, saveTimer = null, dirty = false, saving = null;
  const draftKey = `pb:draft:${ME.user.id}:${n}`;
  const save = async () => {
    if (!act || !dirty) return;
    dirty = false;
    $('#save').textContent = 'Salvando…';
    saving = api(`/api/app/p/${p.slug}/answers/${n}`, { method: 'PUT', body: { data: act.data } })
      .then(() => { $('#save') && ($('#save').textContent = 'Tudo salvo ✓'); localStorage.removeItem(draftKey); })
      .catch(() => { dirty = true; $('#save') && ($('#save').textContent = 'Sem conexão. Guardamos aqui e tentamos de novo.'); setTimeout(save, 5000); });
    return saving;
  };
  if (L.activity_key) {
    const answers = d.answers || {};
    try { const draft = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (draft && JSON.stringify(draft) !== JSON.stringify(answers[n] || {})) { answers[n] = draft; dirty = true; } } catch { /* ignora */ }
    act = mountActivity($('#activity'), {
      day: n, answers, rules: ME.settings.rules, live: d.live, guideUrl: ME.settings.guide_url,
      onChange: (data) => { dirty = true; try { localStorage.setItem(draftKey, JSON.stringify(data)); } catch { /* cheio */ } $('#save').textContent = 'Alterações não salvas…'; clearTimeout(saveTimer); saveTimer = setTimeout(save, 1200); },
    });
    if (dirty) save();
    const flush = () => { if (dirty && act) fetch(`/api/app/p/${p.slug}/answers/${n}`, { method: 'PUT', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: act.data }) }).catch(() => {}); };
    window.addEventListener('pagehide', flush, { once: true });
    window.addEventListener('popstate', flush, { once: true });
  }

  const renderFinish = () => {
    const fin = $('#finish');
    if (st.completed) {
      const nx = d.next;
      fin.innerHTML = `<div class="eyebrow" style="color:var(--gold-300)">Dia ${n} concluído</div><h3 style="margin-top:8px">${n === 7 ? 'Você chegou ao fim do desafio.' : 'Que Deus confirme em você o que ouviu hoje.'}</h3>
        ${L.tomorrow ? `<p style="margin-top:10px">${esc(L.tomorrow)}</p>` : ''}
        ${nx ? (nx.available ? `<a class="btn btn-gold" href="/dia/${nx.number}" data-link>Ir para o Dia ${nx.number}</a>` : nx.availableAt ? `<p>O Dia ${nx.number} libera em <b data-cd="${nx.availableAt}">${countdown(nx.availableAt)}</b>. Você recebe um aviso por e-mail.</p><a class="btn btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.3)" href="/" data-link>Voltar para a jornada</a>` : '') : `<a class="btn btn-gold" href="/resultados" data-link>Ver o meu antes e depois</a>`}`;
      tickCountdowns();
    } else {
      fin.innerHTML = `<h3>Terminou a aula e a atividade?</h3><p>Ao concluir, o próximo dia é liberado em ${d.delayHours || 24} horas.</p><button class="btn btn-gold" id="complete">Concluir o Dia ${n}</button>`;
      $('#complete').addEventListener('click', async (e) => {
        if (act) {
          const miss = act.missing();
          if (miss.length) { toast(miss[0], { error: true }); return; }
          dirty = true; clearTimeout(saveTimer); await save(); await saving;
        }
        await withLoading(e.currentTarget, async () => {
          try {
            if (!st.watched) await progress('watched');
            const r = await progress('complete'); d.next = r.next ? { ...d.next, ...r.next } : null;
            renderFinish(); $('#s3')?.classList.add('done');
            celebrate(n);
            loadMe();
          } catch (err) { toast(err.message, { error: true }); }
        });
      });
    }
  };
  renderFinish();
}

function celebrate(n) {
  modal({ eyebrow: `Dia ${n} concluído`, title: n === 7 ? 'Glória a Deus! Você concluiu os 7 dias.' : 'Mais um passo dado.', body: `<p class="muted">${n === 7 ? 'Veja agora o seu antes e depois e o seu Plano de Patrimônio completo.' : 'Volte amanhã: vamos te avisar por e-mail assim que o próximo dia for liberado.'}</p><button class="btn btn-primary btn-block" data-close>${n === 7 ? 'Continuar' : 'Amém'}</button>` });
}

// ---------- resultados ----------
async function pageResults() {
  const p = mainProduct();
  shell('<div class="skeleton" style="height:300px"></div>', 'results');
  const r = await api(`/api/app/p/${p.slug}/results`);
  const a = r.answers; setCurrency(a[1]?.moeda); const c = compute(a, ME.settings.rules);
  const d1 = a[1] || {}, d7 = a[7] || {};
  const empty = (day, label) => `<div class="card"><h3>${label}</h3><p class="muted">Disponível depois da atividade do Dia ${day}.</p></div>`;
  const delta = (x, y) => (x == null || y == null || x === '' || y === '' ? '' : `<span class="delta ${y - x < 0 ? 'neg' : ''}">${y - x > 0 ? '+' : ''}${(y - x).toFixed(0)}</span>`);
  shell(`
    <header class="day-head"><div class="eyebrow">Meus resultados</div><h1>A sua casa financeira</h1><p>Tudo o que você construiu nas atividades, num só lugar.</p>
    <button class="btn btn-ghost btn-sm no-print" style="margin-top:14px" id="print">Imprimir ou salvar em PDF</button></header>
    ${a[1] ? `<div class="grid-3"><div class="metric"><div class="label">Renda mensal</div><div class="val">${brl(c.renda)}</div></div><div class="metric"><div class="label">Total em dívidas</div><div class="val">${brl(c.dividaTotal)}</div><div class="sub">${c.dividasAtraso} em atraso</div></div><div class="metric"><div class="label">Sobra real</div><div class="val ${c.sobraReal < 0 ? 'neg' : 'pos'}">${a[4] ? brl(c.sobraReal) : '—'}</div><div class="sub">Você estimava ${brl(c.sobraEstimada)}</div></div></div>` : empty(1, 'Raio-X')}
    <div class="section-h"><h2>Minha fase</h2></div>
    ${c.fase ? `<div class="card"><div class="phase-badge" style="margin:0"><div class="n">${c.fase}</div><div><h4>${esc(c.faseNome)}</h4><p>Próximo passo: ${esc(c.proximoDegrau)}.</p></div></div></div>` : empty(4, 'Minha fase')}
    <div class="section-h"><h2>Mapa de dívidas</h2></div>
    ${c.mapaDividas.length ? `<div class="card"><div class="debt-list" style="margin:0">${c.mapaDividas.map((d) => `<div class="debt"><div class="p">${d.prioridade}</div><div class="d"><b>${esc(d.credor)}</b><small>Saldo ${brl(d.saldo)} · parcela ${brl(d.parcela)}</small></div>${d.atraso ? '<span class="badge err">Em atraso</span>' : ''}</div>`).join('')}</div></div>` : '<div class="card"><p class="muted" style="margin:0">Nenhuma dívida registrada.</p></div>'}
    <div class="section-h"><h2>Minha Casa em Ordem</h2></div>
    ${a[6] || a[5] ? `<div class="card">${casaHtml(c)}</div>` : empty(6, 'Casa em Ordem')}
    <div class="section-h"><h2>Plano de Patrimônio</h2></div>
    ${a[7] ? `<div class="card">${planoHtml(c, a)}</div>` : empty(7, 'Plano de Patrimônio')}
    <div class="section-h"><h2>Meu retrato: antes e depois</h2></div>
    ${a[7]?.depois ? `<div class="card" style="overflow-x:auto"><table class="retro"><thead><tr><th></th><th>Dia 1</th><th>Dia 7</th><th></th></tr></thead><tbody>
      ${NOTAS_RETRATO.map(([k, l]) => `<tr><td>${l}</td><td>${d1.notas?.[k] ?? '—'}</td><td>${d7.depois?.notas?.[k] ?? '—'}</td><td>${delta(d1.notas?.[k], d7.depois?.notas?.[k])}</td></tr>`).join('')}
      <tr><td>Paz com o dinheiro</td><td>${d1.paz ?? '—'}</td><td>${d7.depois?.paz ?? '—'}</td><td>${delta(d1.paz, d7.depois?.paz)}</td></tr>
      <tr><td>Nota de mordomia</td><td>${c.mordomiaD4 != null ? c.mordomiaD4.toFixed(1).replace('.', ',') : '—'}</td><td>${d7.depois?.mordomia ?? '—'}</td><td>${delta(c.mordomiaD4 != null ? Math.round(c.mordomiaD4) : null, d7.depois?.mordomia)}</td></tr>
      </tbody></table>
      ${[[d1.cenario, d7.depois?.cenario, 'Cenário financeiro']].map(([x, y, l]) => `<div class="grid-2" style="margin-top:14px"><div class="objective"><div class="eyebrow">${l} · Dia 1</div>${esc(x || '—')}</div><div class="objective" style="background:var(--forest-100)"><div class="eyebrow" style="color:var(--forest-700)">${l} · Dia 7</div>${esc(y || '—')}</div></div>`).join('')}
      ${d7.mudou ? `<div class="objective" style="margin-top:14px"><div class="eyebrow">O que mudou em mim</div>${esc(d7.mudou)}</div>` : ''}
    </div>` : empty(7, 'Retrato depois')}
    ${r.live ? liveCard(r.live) : ''}
  `, 'results');
  $('#print').addEventListener('click', () => window.print());
}

// ---------- perfil ----------
function pageProfile() {
  const u = ME.user, s = ME.settings;
  shell(`
    <header class="day-head"><div class="eyebrow">Meu perfil</div><h1>${esc(u.name || 'Meu perfil')}</h1><p>${esc(u.email)}</p></header>
    <div class="card"><div class="card-title"><h3>Meus dados</h3></div><form id="pf">
      <div class="field"><label>Nome</label><input class="input" name="name" value="${esc(u.name)}"></div>
      <div class="field"><label>WhatsApp</label><input class="input" name="phone" value="${esc(u.phone)}" placeholder="+55 11 99999-9999"></div>
      <button class="btn btn-primary">Salvar</button></form></div>
    <div class="card"><div class="card-title"><h3>Trocar senha</h3></div><form id="pw">
      <div class="field"><label>Senha atual</label><input class="input" type="password" name="current" autocomplete="current-password"></div>
      <div class="field"><label>Nova senha</label><input class="input" type="password" name="password" minlength="8" autocomplete="new-password"></div>
      <button class="btn btn-primary">Atualizar senha</button></form></div>
    ${installTip()}
    ${s.support_email || s.support_whatsapp ? `<div class="card"><h3>Precisa de ajuda?</h3><p class="muted">Nosso time responde rapidinho.</p>${s.support_whatsapp ? `<a class="btn btn-soft btn-sm" target="_blank" rel="noopener" href="https://wa.me/${esc(s.support_whatsapp.replace(/\D/g, ''))}">WhatsApp do suporte</a> ` : ''}${s.support_email ? `<a class="btn btn-soft btn-sm" href="mailto:${esc(s.support_email)}">${esc(s.support_email)}</a>` : ''}</div>` : ''}
    <button class="btn btn-ghost btn-block" id="out" style="margin-top:20px">Sair da conta</button>
  `, 'profile');
  bindInstall();
  $('#pf').addEventListener('submit', async (e) => { e.preventDefault(); const f = new FormData(e.target); await withLoading(e.submitter, async () => { try { await api('/api/app/profile', { method: 'PUT', body: Object.fromEntries(f) }); await loadMe(); toast('Dados salvos'); } catch (er) { toast(er.message, { error: true }); } }); });
  $('#pw').addEventListener('submit', async (e) => { e.preventDefault(); const f = new FormData(e.target); await withLoading(e.submitter, async () => { try { await api('/api/app/password', { method: 'POST', body: Object.fromEntries(f) }); e.target.reset(); toast('Senha atualizada'); } catch (er) { toast(er.message, { error: true }); } }); });
  $('#out').addEventListener('click', async () => { await api('/api/app/logout', { method: 'POST' }); ME = null; go('/login', true); });
}

// ---------- PWA ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; document.querySelectorAll('[data-install]').forEach((b) => b.classList.remove('hidden')); });
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function installTip() {
  if (standalone()) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<div class="install-tip no-print"><span class="brand-mark" style="flex:none">${ICON.mark}</span><div style="flex:1;font-size:14px"><b>Use como aplicativo</b><br><span class="muted">${ios ? 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.' : 'Instale na tela inicial para abrir com um toque.'}</span></div>${ios ? '' : `<button class="btn btn-primary btn-sm ${deferredPrompt ? '' : 'hidden'}" data-install>Instalar</button>`}</div>`;
}
function bindInstall() {
  document.querySelectorAll('[data-install]').forEach((b) => b.addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; b.closest('.install-tip')?.remove(); }));
}
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

route();
