import { api, esc, toast, modal, withLoading, countdown, videoEmbed, firstName, fmtDate, $ } from '/shared/ui.js';
import { compute, brl, NOTAS_RETRATO, setCurrency } from '/shared/calc.js';
import { mountActivity, casaHtml, planoHtml, fmtLive, liveDateHtml } from '/activities.js';
import { mountPlayer, youtubeId } from '/shared/player.js';
import { applyTheme, resetTheme, themeVars, varsToStyle, loadFont, normalizeTheme } from '/shared/theme.js';
import { productCardHtml } from '/shared/pcard.js';

const app = document.getElementById('app');
let ME = null;
let BRAND = null; // logo e nome da plataforma (Configurações › Marca)
let timers = [];
let cleanups = [];
const clearTimers = () => { timers.forEach(clearInterval); timers = []; cleanups.forEach((f) => { try { f(); } catch { /* */ } }); cleanups = []; };

const ICON = {
  mark: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v18M6 8h12" style="stroke:var(--gold-300)" stroke-width="1.8" stroke-linecap="round"/><path d="M4.5 19.5c2.4-1.3 4.9-2 7.5-2s5.1.7 7.5 2" style="stroke:var(--forest-300)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  file: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
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

async function loadBrand() {
  if (!BRAND) BRAND = await api('/api/app/brand').catch(() => ({}));
  applyFavicon();
  return BRAND;
}
/** Favicon e ícone do celular seguem o ícone da plataforma, quando enviado */
function applyFavicon() {
  const set = (rel, src) => { const l = document.querySelector(`link[rel="${rel}"]`); if (src && l && l.getAttribute('href') !== src) { l.setAttribute('href', src); l.removeAttribute('type'); } };
  set('icon', BRAND?.brand_logo);
  set('apple-touch-icon', BRAND?.brand_app_icon || BRAND?.brand_logo);
}
/** Compara textos ignorando maiúsculas e acentos (evita "Área de membros · Área de membros") */
const same = (a, b) => { const f = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); return f(a) === f(b); };
const subOf = (name, sub) => (same(name, sub) ? '' : sub);
/** Bloco da marca da plataforma. Sem logo enviada, devolve null e a marca original continua igual. */
function brandHtml({ dark = false, name, sub } = {}) {
  const b = BRAND || {};
  const wide = dark ? b.brand_logo_wide_dark : b.brand_logo_wide;
  if (wide) return `<span class="brand-wide"><img src="${esc(wide)}" alt="${esc(b.brand_name || '')}"></span>`;
  if (b.brand_logo) return `<span class="brand-logo brand-icon"><img src="${esc(b.brand_logo)}" alt=""></span><span class="brand-name">${esc(name ?? b.brand_name ?? '')}${(() => { const sb = subOf(name ?? b.brand_name, sub ?? b.brand_tagline ?? 'Área de membros'); return sb ? `<small>${esc(sb)}</small>` : ''; })()}</span>`;
  return null;
}
const markHtml = () => (BRAND?.brand_logo ? `<span class="brand-logo brand-icon"><img src="${esc(BRAND.brand_logo)}" alt=""></span>` : `<span class="brand-mark">${ICON.mark}</span>`);

async function loadMe() {
  try { ME = await api('/api/app/me'); BRAND = { ...(BRAND || {}), ...ME.settings }; applyFavicon(); return ME; } catch (e) { if (e.status === 401) { ME = null; return null; } throw e; }
}
const mainProduct = () => ME?.products.find((p) => p.kind === 'challenge') || ME?.products.find((p) => p.kind !== 'bonus') || ME?.products[0];
const mains = () => (ME?.products || []).filter((p) => p.kind !== 'bonus');
const isMulti = () => mains().length >= 2;
const bySlug = (slug) => ME?.products.find((p) => p.slug === slug);
let CUR = null; // produto em contexto (identidade visual, navegação)
const KIND_LABEL = { challenge: 'Desafio', course: 'Curso', bonus: 'Material' };
const FEM = new Set(['aula', 'lição', 'licao', 'semana', 'etapa', 'fase', 'parte', 'sessão', 'sessao', 'live', 'jornada', 'trilha']);
/** Concordância do rótulo da unidade (Dia/Módulo → o; Aula/Lição/Semana → a) */
const U = (p) => { const label = p?.unitLabel || 'Dia'; const f = FEM.has(label.toLowerCase()); return { label, o: f ? 'a' : 'o', O: f ? 'A' : 'O', concl: f ? 'concluída' : 'concluído', lib: f ? 'liberada' : 'liberado', este: f ? 'Esta' : 'Este', anterior: f ? 'a anterior' : 'o anterior' }; };
const productHref = (p) => (isMulti() || p.kind === 'bonus' ? `/p/${p.slug}` : '/');
const dayHref = (p, n) => `/p/${p.slug}/dia/${n}`;
const resultsHref = (p) => (isMulti() ? `/p/${p.slug}/resultados` : '/resultados');
function setContext(p) {
  CUR = p || null;
  if (p) applyTheme(p.theme); else resetTheme();
}

async function route() {
  clearTimers();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const pub = { '/login': pageLogin, '/acesso': pageAccess, '/esqueci': pageForgot };
  if (pub[path]) { await loadBrand(); return pub[path](); }
  if (!ME) await loadMe().catch(() => null);
  if (!ME) return go('/login', true);
  window.scrollTo(0, 0);
  let m;
  // links antigos (/dia/N e /resultados) continuam funcionando: apontam para o desafio principal
  if ((m = path.match(/^\/dia\/(\d+)$/))) { const mp = mainProduct(); return mp ? go(dayHref(mp, Number(m[1])), true) : pageHome(); }
  if (path === '/resultados') { const mp = mainProduct(); if (mp) { setContext(mp); return pageResults(mp); } }
  if ((m = path.match(/^\/p\/([\w-]+)(?:\/(dia\/(\d+)|resultados))?$/))) {
    const p = bySlug(m[1]);
    if (!p) return pageNotOwned(m[1]);
    setContext(p);
    if (m[3]) return pageDay(p, Number(m[3]));
    if (m[2] === 'resultados') return pageResults(p);
    return p.kind === 'bonus' ? pageBonus(p) : pageHome(p);
  }
  if (path === '/perfil') { setContext(isMulti() ? null : mainProduct()); return pageProfile(); }
  if (isMulti()) { setContext(null); return pageStore(); }
  const only = mainProduct();
  setContext(only);
  if (only?.kind === 'bonus') return pageBonus(only);
  return pageHome(only);
}

// ---------- casca ----------
function shell(content, active, { wide } = {}) {
  const s = ME.settings;
  const p = CUR;
  const nav = [];
  if (isMulti()) nav.push(['/', 'Início', ICON.grid, 'store']);
  if (p && p.kind !== 'bonus') nav.push([productHref(p), isMulti() ? (p.kind === 'challenge' ? 'Jornada' : 'Conteúdo') : 'Jornada', ICON.home, 'home']);
  if (p?.hasActivities) nav.push([resultsHref(p), 'Resultados', ICON.chart, 'results']);
  nav.push(['/perfil', 'Perfil', ICON.user, 'profile']);
  const brandName = p ? p.shortName || p.name : s.brand_name || 'Área de membros';
  const brandSub = p ? p.mentor || (isMulti() ? KIND_LABEL[p.kind] : s.mentor_name) || '' : s.brand_tagline || 'Área de membros';
  const mark = p?.logo ? `<span class="brand-logo"><img src="${esc(p.logo)}" alt=""></span>` : markHtml();
  const platform = !p ? brandHtml({ name: brandName, sub: brandSub }) : null;
  app.innerHTML = `
    <header class="topbar"><div class="topbar-in">
      <a class="brand" href="${p ? productHref(p) : '/'}" data-link>${platform || `${mark}<span class="brand-name">${esc(brandName)}${subOf(brandName, brandSub) ? `<small>${esc(brandSub)}</small>` : ''}</span>`}</a>
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
      <span class="brand">${brandHtml({ dark: true }) || `<span class="brand-mark">${ICON.mark}</span><span class="brand-name">O Caminho Bíblico<small>do Dinheiro</small></span>`}</span>
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
  return `<div class="ring"><svg viewBox="0 0 104 104"><circle cx="52" cy="52" r="${r}" stroke="rgba(255,255,255,.12)" stroke-width="7" fill="none"/><circle cx="52" cy="52" r="${r}" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" style="stroke:var(--gold-500);transition:stroke-dashoffset 1s var(--ease)"/></svg>
    <div class="ring-label"><div><b>${done}</b><small>de ${total}</small></div></div></div>`;
}

/** Estado de progresso de um produto (usado na jornada e na vitrine) */
function progressOf(p) {
  const L = p.lessons || [];
  const done = L.filter((l) => l.completed).length;
  const current = L.find((l) => l.available && !l.completed);
  const nextLocked = L.find((l) => !l.available);
  return { L, done, total: L.length, current, nextLocked, finished: L.length > 0 && done === L.length, started: L.some((l) => l.watched || l.completed) };
}

function pageHome(p) {
  const name = firstName(ME.user.name);
  if (!p) { shell(`<div class="card"><h2>Nenhum conteúdo ativo</h2><p class="muted">Não encontramos uma inscrição ativa no seu e-mail. Se você acabou de comprar, aguarde alguns minutos.</p></div>`, 'home'); return; }
  const u = U(p);
  const { L, done, current, nextLocked, finished } = progressOf(p);
  const isChallenge = p.hasActivities;
  let cta;
  if (finished) cta = p.hasActivities ? `<a class="btn btn-gold" href="${resultsHref(p)}" data-link>Ver meus resultados</a>` : `<a class="btn btn-gold" href="${dayHref(p, L[0].number)}" data-link>Rever o conteúdo</a>`;
  else if (current) cta = `<a class="btn btn-gold" href="${dayHref(p, current.number)}" data-link>${ICON.play} ${current.watched ? 'Continuar' : 'Começar'} ${u.o} ${u.label} ${current.number}</a>`;
  else if (nextLocked?.availableAt) cta = `<span class="lock-note">${ICON.lock.replace(/28/g, '16')} ${u.label} ${nextLocked.number} libera em <b data-cd="${nextLocked.availableAt}">${countdown(nextLocked.availableAt)}</b></span>`;
  else if (nextLocked) cta = `<span class="lock-note">Conclua ${u.anterior} para liberar ${u.o} ${u.label} ${nextLocked.number}</span>`;

  const blocks = [];
  for (const l of L) { const b = l.block || ''; let g = blocks.find((x) => x.b === b); if (!g) blocks.push((g = { b, items: [] })); g.items.push(l); }
  const blockSub = { Coração: 'onde estou', Princípios: 'honra', Patrimônio: 'para onde vou' };
  const dayCard = (l) => {
    const cls = l.completed ? 'is-done' : l.available ? 'is-current' : 'is-locked';
    const state = l.completed ? `<span class="badge ok">${ICON.check} ${u.concl[0].toUpperCase() + u.concl.slice(1)}</span>`
      : l.available ? `<span class="badge gold">${u.lib[0].toUpperCase() + u.lib.slice(1)}</span>`
        : l.availableAt ? `<span class="faint day-state">em <span data-cd="${l.availableAt}">${countdown(l.availableAt)}</span></span>` : `<span class="faint day-state">${ICON.lock.replace(/28/g, '18')}</span>`;
    const inner = `<div class="day-num">${l.completed ? ICON.check : l.number}</div><div class="day-body"><h4>${esc(l.title)}</h4><p>${esc(u.label)} ${l.number}${l.video_duration ? ` · ${isChallenge ? 'aula de ' : ''}${esc(l.video_duration)}` : ''}</p></div>${state}`;
    return l.available ? `<a class="day ${cls}" href="${dayHref(p, l.number)}" data-link>${inner}</a>` : `<div class="day ${cls}" aria-disabled="true">${inner}</div>`;
  };
  const releaseNote = p.releaseMode === 'after_complete' && L.length > 1 ? `Cada ${u.label.toLowerCase()} libera ${p.releaseDelayHours}h após concluir ${u.anterior}` : p.releaseMode === 'sequential' ? `${u.O}s ${u.label.toLowerCase()}s liberam em sequência` : '';
  const bonus = isMulti() ? [] : ME.products.filter((x) => x.kind === 'bonus' && x.materials.length);

  shell(`
    ${isMulti() ? `<a class="back no-print" href="/" data-link>${ICON.back} Meus conteúdos</a>` : ''}
    <section class="hero">
      ${p.cover ? `<div class="hero-cover" style="background-image:url('${esc(p.cover)}')"></div>` : p.logo && isMulti() ? `<div class="hero-logo" aria-hidden="true"><img src="${esc(p.logo)}" alt=""></div>` : ''}
      <div class="hero-row">${ring(done, L.length)}<div><div class="eyebrow" style="color:var(--gold-300)">${esc(p.name)}</div><h1 style="margin-top:6px">${finished ? `Você concluiu, <em>${esc(name)}</em>.` : `Olá, <em>${esc(name || 'seja bem-vindo')}</em>.`}</h1>
      <p class="muted" style="margin:6px 0 0">${finished ? (isChallenge ? `Que Deus continue a obra que começou em você nestes ${L.length} dias.` : 'Parabéns por concluir todo o conteúdo.') : current ? `${isChallenge ? 'Hoje' : 'Agora'}: ${esc(current.title)}` : isChallenge ? 'Cada dia tem uma aula curta e uma atividade prática.' : esc(p.tagline || '')}</p></div></div>
      <div class="hero-cta">${cta || ''}</div>
    </section>
    ${p.showLive && ME.live && (done >= L.length - 1 || finished) ? liveCard(ME.live) : ''}
    <div class="section-h"><h2>${isChallenge ? 'Sua jornada' : 'Conteúdo'}</h2><span class="faint" style="font-size:13px">${releaseNote}</span></div>
    ${blocks.map((g) => `${g.b ? `<div class="block-label"><span class="eyebrow">${esc(g.b)}${blockSub[g.b] ? ` · ${blockSub[g.b]}` : ''}</span></div>` : '<div style="height:6px"></div>'}<div class="day-list">${g.items.map(dayCard).join('')}</div>`).join('')}
    ${L.length ? '' : '<div class="card"><p class="muted" style="margin:0">O conteúdo deste produto será publicado em breve.</p></div>'}
    <div id="sum"></div>
    ${p.materials?.length ? `<div class="section-h"><h2>Materiais</h2></div><div class="card">${p.materials.map((m) => `<a class="btn btn-ghost btn-sm" href="${esc(m.url)}" target="_blank" rel="noopener" style="margin:4px 6px 0 0">${ICON.file} ${esc(m.title)}</a>`).join('')}</div>` : ''}
    ${bonus.map((b) => `<div class="section-h"><h2>${esc(b.name)}</h2></div><div class="card">${b.tagline ? `<p class="muted">${esc(b.tagline)}</p>` : ''}${b.materials.map((m) => `<a class="btn btn-ghost btn-sm" href="${esc(m.url)}" target="_blank" rel="noopener" style="margin:4px 6px 0 0">${esc(m.title)}</a>`).join('')}</div>`).join('')}
    ${!isMulti() && ME.store?.length ? storeSection(ME.store) : ''}
    ${installTip()}
  `, 'home');
  tickCountdowns();
  bindInstall();
  if (done >= 1 && p.hasActivities) loadHomeSummary(p);
}

// ---------- vitrine (aluno com mais de um produto) ----------
// eslint-disable-next-line no-unused-vars
const initials = (p) => { const w = (p.shortName || p.name || '').split(/\s+/).filter((x) => x.length > 2 || /^[A-ZÁ-Ú]/.test(x)).filter((x) => !/^(de|da|do|das|dos|e|o|a|os|as|em)$/i.test(x)); return ((w[0]?.[0] || '•') + (w[1]?.[0] || '')).toUpperCase(); };
function productCard(p) {
  const pr = progressOf(p);
  const u = U(p);
  let cta, status = '';
  if (p.kind === 'bonus') { cta = 'Abrir'; status = `${p.materials.length} ${p.materials.length === 1 ? 'material' : 'materiais'}`; }
  else if (pr.finished) { cta = 'Rever'; status = `${u.concl[0].toUpperCase() + u.concl.slice(1)} · ${pr.total} de ${pr.total}`; }
  else if (pr.current) { cta = pr.started ? 'Continuar' : 'Começar'; status = `${esc(u.label)} ${pr.current.number} de ${pr.total}`; }
  else if (pr.nextLocked?.availableAt) { cta = 'Ver jornada'; status = `${esc(u.label)} ${pr.nextLocked.number} em <span data-cd="${pr.nextLocked.availableAt}">${countdown(pr.nextLocked.availableAt)}</span>`; }
  else { cta = 'Acessar'; status = pr.total ? `${pr.done} de ${pr.total}` : 'Em breve'; }
  const pct = p.kind === 'bonus' || !pr.total ? null : Math.round((pr.done / pr.total) * 100);
  return productCardHtml({ href: `/p/${p.slug}`, theme: p.theme, cover: p.cover, logo: p.logo, name: p.name, shortName: p.shortName, mentor: p.mentor, kindLabel: p.badge || KIND_LABEL[p.kind],
    tagline: p.tagline, progress: { label: status, pct }, done: pr.finished && p.kind !== 'bonus', footNote: p.expiresAt ? `Até ${fmtDate(p.expiresAt, { day: '2-digit', month: '2-digit', year: 'numeric' })}` : 'Acesso vitalício', cta });
}
function storeCard(p) {
  const n = p.lessonsCount || 0;
  const unit = U(p).label.toLowerCase();
  return productCardHtml({ href: p.salesUrl || '', external: true, theme: p.theme, cover: p.cover, logo: p.logo, name: p.name, shortName: p.shortName, mentor: p.mentor, kindLabel: p.badge || KIND_LABEL[p.kind],
    tagline: p.tagline, progress: n ? { label: `${n} ${esc(unit)}${n > 1 ? (/l$/.test(unit) ? 'is' : /ão$/.test(unit) ? 'ões' : 's') : ''}`, pct: null } : null, store: true, cta: p.salesUrl ? 'Quero conhecer' : 'Em breve', ctaArrow: !!p.salesUrl });
}
function storeSection(store) {
  return `<div class="section-h"><h2>Conheça também</h2></div><div class="pgrid">${store.map(storeCard).join('')}</div>`;
}

function pageStore() {
  const name = firstName(ME.user.name);
  const own = [...ME.products].sort((a, b) => {
    const rank = (p) => { const pr = progressOf(p); return p.kind === 'bonus' ? 3 : pr.finished ? 2 : pr.started ? 0 : 1; };
    return rank(a) - rank(b);
  });
  const resume = own.find((p) => p.kind !== 'bonus' && progressOf(p).started && !progressOf(p).finished && progressOf(p).current);
  shell(`
    <section class="store-hero">
      <div class="eyebrow">${esc(ME.settings?.brand_tagline || 'Área de membros')}</div>
      <h1>Olá, <em>${esc(name || 'seja bem-vindo')}</em>.</h1>
      <p class="muted">Seus conteúdos estão aqui. Escolha por onde quer continuar.</p>
      ${resume ? `<a class="resume" href="${dayHref(resume, progressOf(resume).current.number)}" data-link style="${varsToStyle(themeVars(resume.theme))}">
        <span class="resume-ico">${ICON.play}</span><span class="resume-txt"><small>Continue de onde parou</small><b>${esc(resume.shortName || resume.name)} · ${esc(U(resume).label)} ${progressOf(resume).current.number}</b><span>${same(progressOf(resume).current.title, `${U(resume).label} ${progressOf(resume).current.number}`) ? `${progressOf(resume).done} de ${progressOf(resume).total} concluíd${U(resume).o}s` : esc(progressOf(resume).current.title)}</span></span>${ICON.arrow}</a>` : ''}
    </section>
    <div class="section-h"><h2>Meus conteúdos</h2><span class="faint" style="font-size:13px">${own.length} ${own.length === 1 ? 'produto' : 'produtos'}</span></div>
    <div class="pgrid">${own.map(productCard).join('')}</div>
    ${ME.store?.length ? storeSection(ME.store) : ''}
    ${installTip()}
  `, 'store', { wide: true });
  tickCountdowns();
  bindInstall();
}

function pageBonus(p) {
  shell(`
    ${isMulti() ? `<a class="back" href="/" data-link>${ICON.back} Meus conteúdos</a>` : ''}
    <section class="hero">${p.cover ? `<div class="hero-cover" style="background-image:url('${esc(p.cover)}')"></div>` : ''}<div class="eyebrow" style="color:var(--gold-300)">${esc(p.badge || 'Material')}</div><h1 style="margin-top:6px">${esc(p.name)}</h1>${p.tagline ? `<p class="muted" style="margin:8px 0 0">${esc(p.tagline)}</p>` : ''}</section>
    <div class="section-h"><h2>Materiais</h2></div>
    <div class="stack">${p.materials.length ? p.materials.map((m) => `<a class="material" href="${esc(m.url)}" target="_blank" rel="noopener"><span class="material-ico">${ICON.file}</span><span><b>${esc(m.title)}</b><small>Abrir em nova aba</small></span>${ICON.arrow}</a>`).join('') : '<div class="card"><p class="muted" style="margin:0">Os materiais serão publicados em breve.</p></div>'}</div>
    ${installTip()}
  `, 'home');
  bindInstall();
}

function pageNotOwned(slug) {
  setContext(null);
  const st = ME.store?.find((x) => x.slug === slug);
  shell(`<div class="locked-page"><div class="ico">${ICON.lock}</div><h1 style="font-size:30px">${st ? esc(st.name) : 'Conteúdo indisponível'}</h1>
    <p class="muted" style="margin-top:12px">${st ? 'Este conteúdo ainda não faz parte da sua conta.' : 'Você não tem acesso a este conteúdo, ou ele não está mais disponível.'}</p>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px">${st?.salesUrl ? `<a class="btn btn-gold" href="${esc(st.salesUrl)}" target="_blank" rel="noopener">Quero conhecer</a>` : ''}<a class="btn btn-primary" href="/" data-link>Ir para meus conteúdos</a></div></div>`, 'store');
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
    $('#sum').innerHTML = `<div class="section-h"><h2>Seus números</h2><a href="${resultsHref(p)}" data-link style="font-size:14px;font-weight:700">Ver tudo →</a></div><div class="grid-3">${items.map(([l, v, cls]) => `<div class="metric"><div class="label">${l}</div><div class="val ${cls}">${v}</div></div>`).join('')}</div>`;
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
async function pageDay(p, n) {
  const u = U(p);
  const home = productHref(p);
  shell('<div class="skeleton" style="height:42px;width:60%"></div><div class="skeleton" style="height:320px;margin-top:20px"></div>', 'home');
  let d;
  try { d = await api(`/api/app/p/${p.slug}/day/${n}`); }
  catch (e) { shell(`<div class="card"><h2>Não foi possível abrir</h2><p class="muted">${esc(e.message)}</p><a class="btn btn-primary" href="${home}" data-link>Voltar</a></div>`, 'home'); return; }

  if (d.locked) {
    shell(`<a class="back" href="${home}" data-link>${ICON.back} ${p.hasActivities ? 'Jornada' : 'Conteúdo'}</a><div class="locked-page"><div class="ico">${ICON.lock}</div><div class="eyebrow">${esc(u.label)} ${n}</div><h1 style="font-size:32px;margin-top:8px">${esc(d.lesson.title)}</h1>
      ${d.state.availableAt ? `<p class="muted" style="margin-top:14px">${u.este} ${esc(u.label.toLowerCase())} é ${u.lib} em</p><div class="countdown-big" data-cd="${d.state.availableAt}">${countdown(d.state.availableAt)}</div><p class="faint">Use esse tempo para colocar em prática o que você aprendeu.</p>` : `<p class="muted" style="margin-top:14px">Conclua ${u.anterior} para liberar este conteúdo.</p><a class="btn btn-primary" href="${home}" data-link>Voltar</a>`}</div>`, 'home');
    tickCountdowns();
    return;
  }

  const L = d.lesson, st = d.state;
  // YouTube → player próprio; outros provedores → incorporação padrão
  const own1 = youtubeId(L.video_url), own2 = youtubeId(L.practice_video_url);
  const v1 = own1 ? `<div id="pp1"></div>` : videoEmbed(L.video_url, `${u.label} ${n}`);
  const v2 = own2 ? `<div id="pp2"></div>` : videoEmbed(L.practice_video_url, `Prática · ${u.label} ${n}`);
  const player = (html, label) => (html && html.startsWith('<div id="pp') ? html : `<div class="player">${html || `<div class="player-empty"><div><b>${label}</b>O vídeo será publicado em breve.</div></div>`}</div>`);
  shell(`
    <a class="back no-print" href="${home}" data-link>${ICON.back} ${p.hasActivities ? 'Jornada' : 'Conteúdo'}</a>
    <header class="day-head"><div class="eyebrow">${esc(u.label)} ${n} de ${d.product?.total || p.lessons.length} ${L.block ? `<span class="badge" style="letter-spacing:0;text-transform:none">${esc(L.block)}</span>` : ''}</div>
      <h1>${esc(L.title)}</h1>${L.subtitle ? `<p>${esc(L.subtitle)}</p>` : ''}
      <div class="steps" id="steps"><span></span><span></span><span></span></div></header>

    <section class="step-card"><div class="step-h"><span class="step-n ${st.watched ? 'done' : ''}" id="s1">1</span><h2>A aula</h2><span class="meta">${esc(L.video_duration || '')}</span></div>
      ${player(v1, 'Aula do dia')}
      <div class="watch-row">${d.watchNote ? `<span class="faint" style="font-size:13px">${esc(d.watchNote)}</span>` : '<span></span>'}${watchBtn('w1', st.watched, 'Aula assistida', 'Marcar aula como assistida')}</div>
    </section>

    ${L.objective ? `<div class="objective" style="margin-top:22px"><div class="eyebrow" style="margin-bottom:6px">${u.label === 'Dia' ? 'Objetivo de hoje' : `Objetivo d${u.o} ${esc(u.label.toLowerCase())}`}</div>${esc(L.objective)}</div>` : ''}
    ${quotesHtml(d.product?.quotesTitle || 'Para refletir', L.verses)}
    ${pointsHtml(d.product?.pointsTitle || 'Para lembrar', L.key_phrases)}
    ${(d.blocks || []).length ? `<div class="lesson-blocks" id="blocks">${d.blocks.map((b) => blockHtml(b, d.blockAnswers?.[b.id])).join('')}</div>` : ''}

    ${L.activity_key ? `<section class="step-card"><div class="step-h"><span class="step-n ${st.practiceWatched ? 'done' : ''}" id="s2">2</span><h2>A prática</h2><span class="meta">${esc(L.practice_duration || '')}</span></div>
      ${v2 ? player(v2, '') + `<div class="watch-row"><span></span>${watchBtn('w2', st.practiceWatched, 'Prática assistida', 'Marcar como assistida')}</div>` : '<p class="muted">Siga os passos abaixo. Leva cerca de ' + esc(L.practice_duration || '15 min') + '.</p>'}
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
  const markBtn = (sel, label, stepSel) => { const b = $(sel); if (b) b.outerHTML = watchBtn(b.id, true, label, b.dataset.off); bindWatch(sel); $(stepSel)?.classList.add('done'); };
  // marcar / desmarcar como assistida (desfaz um clique sem querer)
  const WATCH = { '#w1': ['watched', 'unwatched', 'watched', 'Aula assistida', '#s1'], '#w2': ['practice', 'unpractice', 'practiceWatched', 'Prática assistida', '#s2'] };
  function bindWatch(sel) {
    const b = $(sel); if (!b) return;
    b.addEventListener('click', async () => {
      const [on, off, key, label, stepSel] = WATCH[sel];
      const turnOn = !st[key];
      try {
        await withLoading(b, () => progress(turnOn ? on : off));
        const fresh = $(sel); fresh.outerHTML = watchBtn(fresh.id, turnOn, label, fresh.dataset.off); bindWatch(sel);
        $(stepSel)?.classList.toggle('done', turnOn);
        if (!turnOn) toast('Marcação desfeita');
      } catch (er) { toast(er.message, { error: true }); }
    });
  }
  if (own1) {
    const pl = mountPlayer($('#pp1'), { url: L.video_url, cover: L.cover_url, title: norm(L.title) === norm(`${u.label} ${n}`) ? L.title : `${u.label} ${n} · ${L.title}`, storageKey: `${ME.user.id}:${p.slug}:${n}:aula`,
      onWatched: async () => { if (st.watched) return; try { await progress('watched'); markBtn('#w1', 'Aula assistida', '#s1'); } catch { /* */ } } });
    if (pl) cleanups.push(() => pl.destroy());
  }
  if (own2) {
    const pl = mountPlayer($('#pp2'), { url: L.practice_video_url, cover: L.practice_cover_url, title: `Prática · ${u.label} ${n}`, storageKey: `${ME.user.id}:${p.slug}:${n}:pratica`,
      onWatched: async () => { if (st.practiceWatched) return; try { await progress('practice'); markBtn('#w2', 'Prática assistida', '#s2'); } catch { /* */ } } });
    if (pl) cleanups.push(() => pl.destroy());
  }
  bindWatch('#w1'); bindWatch('#w2');
  bindBlocks(p, n, d.blocks || [], d.blockAnswers || {});

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
      const last = !nx;
      fin.innerHTML = `<div class="eyebrow" style="color:var(--gold-300)">${esc(u.label)} ${n} ${u.concl}</div><h3 style="margin-top:8px">${last ? (p.hasActivities ? 'Você chegou ao fim do desafio.' : 'Você concluiu todo o conteúdo.') : p.hasActivities ? 'Que Deus confirme em você o que ouviu hoje.' : 'Mais um passo dado.'}</h3>
        ${L.tomorrow ? `<p style="margin-top:10px">${esc(L.tomorrow)}</p>` : ''}
        ${nx ? (nx.available ? `<a class="btn btn-gold" href="${dayHref(p, nx.number)}" data-link>Ir para ${u.o} ${esc(u.label)} ${nx.number}</a>` : nx.availableAt ? `<p>${u.O} ${esc(u.label)} ${nx.number} libera em <b data-cd="${nx.availableAt}">${countdown(nx.availableAt)}</b>. Você recebe um aviso por e-mail.</p><a class="btn btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.3)" href="${home}" data-link>Voltar para ${p.hasActivities ? 'a jornada' : 'o conteúdo'}</a>` : '') : p.hasActivities ? `<a class="btn btn-gold" href="${resultsHref(p)}" data-link>Ver o meu antes e depois</a>` : `<a class="btn btn-gold" href="${isMulti() ? '/' : home}" data-link>${isMulti() ? 'Voltar para meus conteúdos' : 'Voltar ao início'}</a>`}`;
      tickCountdowns();
    } else {
      const isLast = !d.next;
      const nextNote = isLast ? '' : d.product?.releaseMode === 'after_complete' ? `Ao concluir, ${u.o} próxim${u.o} ${esc(u.label.toLowerCase())} é ${u.lib} em ${d.delayHours || 24} horas.` : d.product?.releaseMode === 'sequential' ? `Ao concluir, ${u.o} próxim${u.o} ${esc(u.label.toLowerCase())} é ${u.lib} na hora.` : '';
      fin.innerHTML = `<h3>${L.activity_key ? 'Terminou a aula e a atividade?' : 'Terminou esta aula?'}</h3>${nextNote ? `<p>${nextNote}</p>` : ''}<button class="btn btn-gold" id="complete">Concluir ${u.o} ${esc(u.label)} ${n}</button>`;
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
            celebrate(p, n, !d.next);
            loadMe();
          } catch (err) { toast(err.message, { error: true }); }
        });
      });
    }
  };
  renderFinish();
}


// ---------- blocos de conteúdo da aula ----------
function quotesHtml(title, items) {
  if (!items?.length) return '';
  return `<div class="section-h"><h2 style="font-size:20px">${esc(title)}</h2></div><div class="verses ${items.length === 1 ? 'one' : ''}">${items.map((v) => `<div class="verse"><p>${esc(v.text)}</p>${v.ref ? `<span>${esc(v.ref)}</span>` : ''}</div>`).join('')}</div>`;
}
function pointsHtml(title, items) {
  if (!items?.length) return '';
  return `<div class="section-h"><h2 style="font-size:20px">${esc(title)}</h2></div><ul class="phrases">${items.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`;
}
/** Texto simples com **negrito**, *itálico*, [links](https://…) e listas com "- " */
function richText(src) {
  const inline = (t) => esc(t)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, a, h) => `<a href="${h}" target="_blank" rel="noopener noreferrer">${a}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  return String(src || '').split(/\n{2,}/).map((para) => {
    const lines = para.split('\n');
    if (lines.every((l) => /^\s*[-•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}
const FILE_ICON = { pdf: 'PDF', doc: 'DOC', docx: 'DOC', xls: 'XLS', xlsx: 'XLS', csv: 'CSV', ppt: 'PPT', pptx: 'PPT', zip: 'ZIP', mp3: 'MP3', m4a: 'M4A', png: 'IMG', jpg: 'IMG', jpeg: 'IMG' };
const fileKind = (url) => { const e = (String(url).split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase(); return FILE_ICON[e] || null; };
const BLOCK_ICON = {
  materials: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
  exercise: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  checklist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="14" height="14" rx="3"/><path d="M17 10l4-2.5v9L17 14"/></svg>',
};
const SV = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const CALLOUT = {
  tip: ['Dica', SV('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>')],
  info: ['Para saber', SV('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>')],
  warning: ['Atenção', SV('<path d="M10.3 4.2L2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>')],
  important: ['Importante', SV('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>')],
};
function blockHtml(b, ans) {
  const head = (fallback, icon) => `<div class="blk-h">${icon ? `<span class="blk-ico">${icon}</span>` : ''}<h2>${esc(b.title || fallback)}</h2></div>`;
  switch (b.type) {
    case 'text': return `<section class="blk blk-text">${b.title ? `<h2 class="blk-t">${esc(b.title)}</h2>` : ''}<div class="rich">${richText(b.body)}</div></section>`;
    case 'quotes': return `<section class="blk-bare">${quotesHtml(b.title || 'Para refletir', b.items)}</section>`;
    case 'points': return `<section class="blk-bare">${pointsHtml(b.title || 'Para lembrar', b.items)}</section>`;
    case 'callout': { const [lab, ic] = CALLOUT[b.variant] || CALLOUT.tip; return `<aside class="blk callout ${b.variant || 'tip'}"><span class="co-ic" aria-hidden="true">${ic}</span><div><b>${esc(b.title || lab)}</b><div class="rich">${richText(b.body)}</div></div></aside>`; }
    case 'materials': return `<section class="blk">${head('Materiais de apoio', BLOCK_ICON.materials)}<div class="mats">${(b.items || []).map((m) => { const k = fileKind(m.url); return `<a class="mat" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer"${k && k !== 'IMG' ? ' download' : ''}><span class="mat-k ${k ? '' : 'link'}">${k || '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>'}</span><span class="mat-t"><b>${esc(m.title)}</b>${m.desc ? `<small>${esc(m.desc)}</small>` : ''}</span><span class="mat-go">${k && k !== 'IMG' ? 'Baixar' : 'Abrir'} ${ICON.arrow}</span></a>`; }).join('')}</div></section>`;
    case 'exercise': return `<section class="blk blk-ex" data-blk="${b.id}">${head('Exercício', BLOCK_ICON.exercise)}${b.required ? '<span class="blk-req">Obrigatório para concluir</span>' : ''}${b.questions.map((q, i) => `<div class="field ex-q"><label>${b.questions.length > 1 ? `<span class="ex-n">${i + 1}</span>` : ''}${esc(q)}</label><textarea class="input" rows="3" data-q="${i}" placeholder="Escreva a sua resposta">${esc(ans?.answers?.[i] || '')}</textarea></div>`).join('')}<div class="blk-save" data-save>${ans ? 'Resposta salva' : 'As respostas são salvas automaticamente'}</div></section>`;
    case 'checklist': { const done = new Set(ans?.done || []); return `<section class="blk blk-ck" data-blk="${b.id}">${head('Tarefas', BLOCK_ICON.checklist)}${b.required ? '<span class="blk-req">Obrigatório para concluir</span>' : ''}<div class="ck-prog"><span data-ckc>${done.size} de ${b.items.length}</span><i><b style="width:${(done.size / b.items.length) * 100}%"></b></i></div><ul class="ck">${b.items.map((t, i) => `<li><label class="${done.has(i) ? 'on' : ''}"><input type="checkbox" data-i="${i}" ${done.has(i) ? 'checked' : ''}><span class="ck-box">${ICON.check}</span><span>${esc(t)}</span></label></li>`).join('')}</ul></section>`; }
    case 'video': { const own = youtubeId(b.url); return `<section class="blk blk-vid">${head('Vídeo complementar', BLOCK_ICON.video)}${b.duration ? `<span class="blk-meta">${esc(b.duration)}</span>` : ''}${own ? `<div id="pv-${b.id}"></div>` : `<div class="player">${videoEmbed(b.url, b.title || 'Vídeo') || '<div class="player-empty"><div><b>Vídeo</b>Em breve.</div></div>'}</div>`}</section>`; }
    case 'button': return `<section class="blk blk-cta">${b.title ? `<h2 class="blk-t">${esc(b.title)}</h2>` : ''}${b.body ? `<p class="muted">${esc(b.body)}</p>` : ''}<a class="btn btn-gold" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">${esc(b.label || 'Acessar')} ${ICON.arrow}</a></section>`;
    default: return '';
  }
}
function bindBlocks(p, n, blocks, answers) {
  const save = (b, data, el) => api(`/api/app/p/${p.slug}/day/${n}/blocks/${b.id}`, { method: 'PUT', body: { data } })
    .then(() => { if (el) el.textContent = 'Resposta salva'; answers[b.id] = data; })
    .catch((e) => { if (el) el.textContent = 'Não foi possível salvar. Verifique a conexão.'; toast(e.message, { error: true }); });
  for (const b of blocks) {
    const box = document.querySelector(`[data-blk="${b.id}"]`);
    if (b.type === 'exercise' && box) {
      let t = null; const st = box.querySelector('[data-save]');
      const collect = () => ({ answers: [...box.querySelectorAll('[data-q]')].map((x) => x.value) });
      box.addEventListener('input', () => { st.textContent = 'Salvando…'; clearTimeout(t); t = setTimeout(() => save(b, collect(), st), 900); });
      box.addEventListener('focusout', () => { if (t) { clearTimeout(t); t = null; save(b, collect(), st); } });
      cleanups.push(() => { if (t) { clearTimeout(t); save(b, collect(), null); } });
    }
    if (b.type === 'checklist' && box) {
      box.addEventListener('change', (e) => {
        const c = e.target.closest('input[type=checkbox]'); if (!c) return;
        c.closest('label').classList.toggle('on', c.checked);
        const done = [...box.querySelectorAll('input[type=checkbox]')].map((x, i) => (x.checked ? i : -1)).filter((i) => i >= 0);
        box.querySelector('[data-ckc]').textContent = `${done.length} de ${b.items.length}`;
        box.querySelector('.ck-prog b').style.width = `${(done.length / b.items.length) * 100}%`;
        if (done.length === b.items.length) toast('Tarefas concluídas!');
        save(b, { done }, null);
      });
    }
    if (b.type === 'video' && youtubeId(b.url)) {
      const pl = mountPlayer(document.getElementById(`pv-${b.id}`), { url: b.url, title: b.title || 'Vídeo complementar', storageKey: `${ME.user.id}:${p.slug}:${n}:${b.id}` });
      if (pl) cleanups.push(() => pl.destroy());
    }
  }
}

const norm = (x) => String(x || '').trim().toLowerCase();
/** Botão de assistida: ligado mostra ✓ e, ao passar o mouse, "Desmarcar" */
function watchBtn(id, on, labelOn, labelOff) {
  return on
    ? `<button class="btn btn-soft btn-sm watch-on" id="${id}" data-off="${esc(labelOff)}" aria-pressed="true" title="Clique para desmarcar"><span class="w-on">${ICON.check} ${esc(labelOn)}</span><span class="w-undo">Desmarcar</span></button>`
    : `<button class="btn btn-soft btn-sm" id="${id}" data-off="${esc(labelOff)}">${esc(labelOff)}</button>`;
}

function celebrate(p, n, last) {
  const u = U(p);
  if (p.hasActivities) {
    modal({ eyebrow: `${u.label} ${n} ${u.concl}`, title: last ? `Glória a Deus! Você concluiu os ${p.lessons.length} dias.` : 'Mais um passo dado.', body: `<p class="muted">${last ? 'Veja agora o seu antes e depois e o seu Plano de Patrimônio completo.' : `Volte amanhã: vamos te avisar por e-mail assim que ${u.o} próxim${u.o} ${u.label.toLowerCase()} for ${u.lib}.`}</p><button class="btn btn-primary btn-block" data-close>${last ? 'Continuar' : 'Amém'}</button>` });
  } else {
    modal({ eyebrow: `${u.label} ${n} ${u.concl}`, title: last ? 'Parabéns! Você concluiu todo o conteúdo.' : 'Mais um passo dado.', body: `<p class="muted">${last ? 'Você pode rever qualquer aula quando quiser.' : `Siga para ${u.o} próxim${u.o} ${u.label.toLowerCase()} quando estiver ${u.lib}.`}</p><button class="btn btn-primary btn-block" data-close>Continuar</button>` });
  }
}

// ---------- resultados ----------
async function pageResults(p) {
  if (!p.hasActivities) return go(productHref(p), true);
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
  return `<div class="install-tip no-print">${BRAND?.brand_logo ? `<span class="brand-logo brand-icon" style="flex:none"><img src="${esc(BRAND.brand_logo)}" alt=""></span>` : `<span class="brand-mark" style="flex:none">${ICON.mark}</span>`}<div style="flex:1;font-size:14px"><b>Use como aplicativo</b><br><span class="muted">${ios ? 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.' : 'Instale na tela inicial para abrir com um toque.'}</span></div>${ios ? '' : `<button class="btn btn-primary btn-sm ${deferredPrompt ? '' : 'hidden'}" data-install>Instalar</button>`}</div>`;
}
function bindInstall() {
  document.querySelectorAll('[data-install]').forEach((b) => b.addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; b.closest('.install-tip')?.remove(); }));
}
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

route();
