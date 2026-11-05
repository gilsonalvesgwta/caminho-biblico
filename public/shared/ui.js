export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export class ApiError extends Error { constructor(status, message, data) { super(message); this.status = status; this.data = data; } }

export async function api(path, { method = 'GET', body, raw } = {}) {
  const r = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (raw) return r;
  let data = null;
  try { data = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) throw new ApiError(r.status, data?.error || 'Não foi possível concluir. Verifique a sua conexão.', data);
  return data;
}

export function toast(msg, { error = false, ms = 3200 } = {}) {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
  const t = document.createElement('div');
  t.className = 'toast' + (error ? ' err' : '');
  t.textContent = msg;
  box.append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, ms);
}

export function modal({ title, body, eyebrow, onMount, wide }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="${wide ? 'width:min(880px,100%)' : ''}">
    <div class="modal-head"><div>${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}<h2 style="font-size:24px;margin-top:4px">${esc(title)}</h2></div><button class="modal-x" aria-label="Fechar">×</button></div>
    <div class="modal-body">${body}</div></div>`;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => e.key === 'Escape' && close();
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('.modal-x') || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  onMount?.(back.querySelector('.modal'), close);
  return close;
}

export async function withLoading(btn, fn) {
  if (!btn) return fn();
  const html = btn.innerHTML;
  btn.classList.add('is-loading');
  btn.innerHTML = `<span class="spin"></span>${btn.dataset.loading || ''}`;
  try { return await fn(); } finally { btn.classList.remove('is-loading'); btn.innerHTML = html; }
}

export const fmtDate = (iso, opts = { day: '2-digit', month: 'short', year: 'numeric' }) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', ...opts }) : '—');
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export function relTime(iso) {
  if (!iso) return '—';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `há ${Math.floor(s / 86400)} d`;
  return fmtDate(iso);
}
export function countdown(iso) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'agora';
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m} min`;
}

/** Converte link de vídeo (YouTube, Vimeo, Panda, Bunny, Wistia, mp4) em embed seguro */
export function videoEmbed(url, title = 'Vídeo') {
  if (!url) return null;
  let u; try { u = new URL(url.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  let src = null;
  if (host === 'youtu.be') src = `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}?rel=0&modestbranding=1`;
  else if (host.endsWith('youtube.com')) {
    const id = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop();
    src = `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
  } else if (host === 'vimeo.com') src = `https://player.vimeo.com/video/${u.pathname.split('/').filter(Boolean).join('?h=')}`;
  else if (/(pandavideo\.com\.br|player\.vimeo\.com|mediadelivery\.net|wistia\.net|youtube-nocookie\.com|vturb\.com\.br|converteai\.net)$/.test(host)) src = u.href;
  if (src) return `<iframe src="${esc(src)}" title="${esc(title)}" loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  if (/\.(mp4|webm|m3u8)$/i.test(u.pathname)) return `<video src="${esc(u.href)}" controls playsinline preload="metadata"></video>`;
  return null;
}

export const firstName = (n) => (n || '').trim().split(/\s+/)[0] || '';
