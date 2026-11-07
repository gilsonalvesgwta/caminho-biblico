/**
 * Player próprio da plataforma.
 * O vídeo continua hospedado no YouTube (mesma entrega adaptativa e sem travamentos),
 * mas toda a interface é nossa: capa, controles, velocidade, volume, tela cheia,
 * atalhos e retomada de onde parou. A interface do YouTube fica escondida e
 * não recebe cliques (não há link para o YouTube, título nem vídeos sugeridos).
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function youtubeId(url) {
  if (!url) return null;
  let u; try { u = new URL(String(url).trim()); } catch { return null; }
  const h = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (h.endsWith('youtube.com') || h.endsWith('youtube-nocookie.com')) {
    id = u.searchParams.get('v');
    if (!id) { const m = u.pathname.match(/\/(embed|shorts|live|v)\/([^/?#]+)/); if (m) id = m[2]; }
  }
  return id && /^[\w-]{6,20}$/.test(id) ? id : null;
}
export const youtubeThumb = (id) => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;

let apiPromise = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error('Não foi possível carregar o vídeo. Verifique a sua conexão.')); };
    document.head.append(s);
  });
  return apiPromise;
}

const ICO = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><text x="12" y="15.6" text-anchor="middle" font-size="7.5" font-weight="800" fill="currentColor" stroke="none" font-family="sans-serif">10</text></svg>',
  fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/><text x="12" y="15.6" text-anchor="middle" font-size="7.5" font-weight="800" fill="currentColor" stroke="none" font-family="sans-serif">10</text></svg>',
  vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  exit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  replay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
};
const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
};
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * Monta o player em `el`.
 * opts: { url, cover, title, storageKey, onProgress(fraction), onWatched() }
 * Retorna { destroy() } ou null se o link não for do YouTube.
 */
export function mountPlayer(el, opts) {
  const id = youtubeId(opts.url);
  if (!id) return null;
  const cover = opts.cover || youtubeThumb(id);
  el.classList.add('pp');
  el.tabIndex = 0;
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', opts.title || 'Vídeo');
  el.innerHTML = `
    <div class="pp-stage"><div class="pp-yt"></div></div>
    <div class="pp-shield" aria-hidden="true"></div>
    <div class="pp-cover"><img alt="" src="${esc(cover)}" referrerpolicy="no-referrer"><div class="pp-cover-shade"></div>
      <button class="pp-big" aria-label="Assistir">${ICO.play}</button>
      <div class="pp-cover-meta">${opts.title ? `<b>${esc(opts.title)}</b>` : ''}<span class="pp-resume"></span></div></div>
    <div class="pp-spinner" aria-hidden="true"></div>
    <div class="pp-flash" aria-hidden="true"></div>
    <div class="pp-end"><button class="pp-big pp-replay" aria-label="Assistir de novo">${ICO.replay}</button><span>Assistir de novo</span></div>
    <div class="pp-ui">
      <div class="pp-bar" role="slider" aria-label="Linha do tempo" aria-valuemin="0" tabindex="0">
        <div class="pp-bar-track"><i class="pp-buf"></i><i class="pp-prog"></i><i class="pp-hover"></i></div>
        <div class="pp-knob"></div><div class="pp-tip">0:00</div>
      </div>
      <div class="pp-row">
        <button class="pp-btn pp-play" aria-label="Reproduzir">${ICO.play}</button>
        <button class="pp-btn pp-rw" aria-label="Voltar 10 segundos">${ICO.back}</button>
        <button class="pp-btn pp-ff" aria-label="Avançar 10 segundos">${ICO.fwd}</button>
        <div class="pp-vol"><button class="pp-btn pp-mute" aria-label="Silenciar">${ICO.vol}</button><input class="pp-vol-range" type="range" min="0" max="100" value="100" aria-label="Volume"></div>
        <span class="pp-time"><b class="pp-cur">0:00</b> / <span class="pp-dur">0:00</span></span>
        <span class="pp-grow"></span>
        <div class="pp-speed"><button class="pp-btn pp-rate" aria-label="Velocidade" aria-haspopup="true">1x</button>
          <div class="pp-menu" role="menu">${RATES.map((r) => `<button role="menuitemradio" data-rate="${r}">${r === 1 ? 'Normal' : `${String(r).replace('.', ',')}x`}</button>`).join('')}</div></div>
        <button class="pp-btn pp-fs" aria-label="Tela cheia">${ICO.full}</button>
      </div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const ui = { bar: $('.pp-bar'), prog: $('.pp-prog'), buf: $('.pp-buf'), hover: $('.pp-hover'), knob: $('.pp-knob'), tip: $('.pp-tip'), cur: $('.pp-cur'), dur: $('.pp-dur'), play: $('.pp-play'), mute: $('.pp-mute'), vol: $('.pp-vol-range'), rate: $('.pp-rate'), menu: $('.pp-menu'), fs: $('.pp-fs') };
  const key = opts.storageKey ? `pp:${opts.storageKey}` : null;
  const saved = (() => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } })();
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('pp:prefs') || '{}'); } catch { return {}; } })();
  if (saved?.t > 15) $('.pp-resume').textContent = `Continuar de ${fmt(saved.t)}`;

  let yt = null, ready = false, started = false, duration = 0, raf = 0, hideTimer = 0, dragging = false, watchedFired = false, lastSave = 0, destroyed = false;

  const setPlaying = (on) => {
    el.classList.toggle('is-playing', on);
    ui.play.innerHTML = on ? ICO.pause : ICO.play;
    ui.play.setAttribute('aria-label', on ? 'Pausar' : 'Reproduzir');
  };
  const flash = (html) => { const f = $('.pp-flash'); f.innerHTML = html; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); };
  const showUi = () => {
    el.classList.add('ui-on');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (el.classList.contains('is-playing') && !dragging && !ui.menu.classList.contains('open')) el.classList.remove('ui-on'); }, 2600);
  };
  const savePos = (t, force) => {
    if (!key || (!force && Date.now() - lastSave < 4000)) return;
    lastSave = Date.now();
    try { localStorage.setItem(key, JSON.stringify({ t: duration && t > duration - 20 ? 0 : t, at: Date.now() })); } catch { /* sem espaço */ }
  };
  const render = () => {
    if (!yt || !ready) return;
    const t = dragging ? Number(ui.bar.dataset.drag || 0) : yt.getCurrentTime() || 0;
    duration = yt.getDuration() || duration;
    const p = duration ? t / duration : 0;
    ui.prog.style.width = `${p * 100}%`;
    ui.knob.style.left = `${p * 100}%`;
    ui.buf.style.width = `${(yt.getVideoLoadedFraction() || 0) * 100}%`;
    ui.cur.textContent = fmt(t);
    ui.dur.textContent = fmt(duration);
    ui.bar.setAttribute('aria-valuemax', String(Math.floor(duration)));
    ui.bar.setAttribute('aria-valuenow', String(Math.floor(t)));
    if (!dragging && duration) {
      savePos(t);
      opts.onProgress?.(p);
      if (!watchedFired && p >= 0.9) { watchedFired = true; opts.onWatched?.(); }
    }
  };
  const loop = () => { render(); raf = requestAnimationFrame(loop); };

  const create = () => loadYouTubeApi().then((YT) => {
    if (destroyed) return;
    el.classList.add('is-loading');
    yt = new YT.Player($('.pp-yt'), {
      host: 'https://www.youtube-nocookie.com',
      videoId: id,
      width: '100%', height: '100%',
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, playsinline: 1, cc_load_policy: 0, origin: location.origin, start: saved?.t > 15 ? Math.floor(saved.t) : 0 },
      events: {
        onReady: () => {
          ready = true;
          const v = prefs.volume ?? 100;
          yt.setVolume(v); ui.vol.value = v;
          if (prefs.muted) { yt.mute(); ui.mute.innerHTML = ICO.mute; }
          if (prefs.rate && prefs.rate !== 1) setRate(prefs.rate, true);
          yt.playVideo();
          cancelAnimationFrame(raf); loop();
        },
        onStateChange: (e) => {
          const S = YT.PlayerState;
          if (e.data === S.PLAYING) { el.classList.remove('is-loading', 'is-ended'); el.classList.add('is-started'); setPlaying(true); showUi(); }
          else if (e.data === S.BUFFERING) el.classList.add('is-loading');
          else if (e.data === S.PAUSED) { el.classList.remove('is-loading'); setPlaying(false); el.classList.add('ui-on'); savePos(yt.getCurrentTime(), true); }
          else if (e.data === S.ENDED) {
            setPlaying(false); el.classList.remove('is-loading'); el.classList.add('is-ended', 'ui-on');
            savePos(0, true);
            if (!watchedFired) { watchedFired = true; opts.onWatched?.(); }
          }
        },
        onError: () => { el.classList.remove('is-loading'); $('.pp-cover-meta').innerHTML = '<b>Não foi possível reproduzir este vídeo.</b><span>Tente recarregar a página.</span>'; el.classList.remove('is-started'); },
      },
    });
  }).catch((err) => { el.classList.remove('is-loading'); $('.pp-cover-meta').innerHTML = `<b>${esc(err.message)}</b>`; });

  const start = () => { if (started) return; started = true; el.classList.add('is-booting'); create(); };
  const toggle = () => {
    if (!started) return start();
    if (!ready) return;
    if (el.classList.contains('is-ended')) { yt.seekTo(0, true); yt.playVideo(); return; }
    const st = yt.getPlayerState();
    if (st === 1 || st === 3) { yt.pauseVideo(); flash(ICO.pause); } else { yt.playVideo(); flash(ICO.play); }
  };
  const seekBy = (d) => { if (!ready) return; const t = Math.min(Math.max(0, yt.getCurrentTime() + d), duration - 0.5); yt.seekTo(t, true); flash(d < 0 ? ICO.back : ICO.fwd); showUi(); };
  const setRate = (r, silent) => {
    if (!ready) return;
    yt.setPlaybackRate(r);
    ui.rate.textContent = `${String(r).replace('.', ',')}x`;
    ui.menu.querySelectorAll('[data-rate]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.rate) === r)));
    prefs.rate = r; try { localStorage.setItem('pp:prefs', JSON.stringify(prefs)); } catch { /* */ }
    if (!silent) flash(`<b style="font-size:20px">${String(r).replace('.', ',')}x</b>`);
  };
  const setVol = (v) => {
    if (!ready) return;
    v = Math.max(0, Math.min(100, v));
    yt.setVolume(v); ui.vol.value = v;
    if (v > 0 && yt.isMuted()) yt.unMute();
    const muted = v === 0 || yt.isMuted();
    ui.mute.innerHTML = muted ? ICO.mute : ICO.vol;
    ui.vol.style.setProperty('--v', `${v}%`);
    prefs.volume = v; prefs.muted = v === 0 ? true : false; try { localStorage.setItem('pp:prefs', JSON.stringify(prefs)); } catch { /* */ }
  };
  const toggleMute = () => {
    if (!ready) return;
    if (yt.isMuted() || Number(ui.vol.value) === 0) { yt.unMute(); if (Number(ui.vol.value) === 0) setVol(60); ui.mute.innerHTML = ICO.vol; prefs.muted = false; }
    else { yt.mute(); ui.mute.innerHTML = ICO.mute; prefs.muted = true; }
    try { localStorage.setItem('pp:prefs', JSON.stringify(prefs)); } catch { /* */ }
  };

  // tela cheia (com alternativa para iPhone, que não permite tela cheia de elementos)
  const nativeFs = () => document.fullscreenElement || document.webkitFullscreenElement;
  const toggleFs = async () => {
    const on = nativeFs() === el || el.classList.contains('pp-pseudo-fs');
    if (on) {
      if (nativeFs()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      el.classList.remove('pp-pseudo-fs'); document.documentElement.classList.remove('pp-lock');
    } else if (el.requestFullscreen || el.webkitRequestFullscreen) {
      try { await (el.requestFullscreen || el.webkitRequestFullscreen).call(el); screen.orientation?.lock?.('landscape').catch(() => {}); }
      catch { el.classList.add('pp-pseudo-fs'); document.documentElement.classList.add('pp-lock'); }
    } else { el.classList.add('pp-pseudo-fs'); document.documentElement.classList.add('pp-lock'); }
    updFs();
  };
  const updFs = () => { const on = nativeFs() === el || el.classList.contains('pp-pseudo-fs'); ui.fs.innerHTML = on ? ICO.exit : ICO.full; el.classList.toggle('is-fs', on); };
  document.addEventListener('fullscreenchange', updFs);
  document.addEventListener('webkitfullscreenchange', updFs);

  // linha do tempo
  const posFromEvent = (e) => { const r = ui.bar.getBoundingClientRect(); const x = (e.touches?.[0] || e.changedTouches?.[0] || e).clientX; return Math.min(1, Math.max(0, (x - r.left) / r.width)); };
  ui.bar.addEventListener('pointermove', (e) => {
    if (!duration) return;
    const p = posFromEvent(e);
    ui.hover.style.width = `${p * 100}%`;
    ui.tip.textContent = fmt(p * duration);
    ui.tip.style.left = `${p * 100}%`;
    if (dragging) { ui.bar.dataset.drag = String(p * duration); render(); }
  });
  ui.bar.addEventListener('pointerdown', (e) => {
    if (!ready || !duration) return;
    dragging = true; ui.bar.setPointerCapture(e.pointerId); el.classList.add('is-scrubbing');
    ui.bar.dataset.drag = String(posFromEvent(e) * duration); render();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false; el.classList.remove('is-scrubbing');
    const t = posFromEvent(e) * duration;
    yt.seekTo(t, true); savePos(t, true); showUi();
  };
  ui.bar.addEventListener('pointerup', endDrag);
  ui.bar.addEventListener('pointercancel', () => { dragging = false; el.classList.remove('is-scrubbing'); });
  ui.bar.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); seekBy(5); } if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); seekBy(-5); } });

  // cliques
  $('.pp-cover').addEventListener('click', start);
  $('.pp-replay').addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  ui.play.addEventListener('click', toggle);
  $('.pp-rw').addEventListener('click', () => seekBy(-10));
  $('.pp-ff').addEventListener('click', () => seekBy(10));
  ui.mute.addEventListener('click', toggleMute);
  ui.vol.addEventListener('input', () => setVol(Number(ui.vol.value)));
  ui.fs.addEventListener('click', toggleFs);
  ui.rate.addEventListener('click', (e) => { e.stopPropagation(); ui.menu.style.maxHeight = `${Math.max(120, el.clientHeight - 70)}px`; ui.menu.classList.toggle('open'); showUi(); });
  ui.menu.addEventListener('click', (e) => { const b = e.target.closest('[data-rate]'); if (!b) return; setRate(Number(b.dataset.rate)); ui.menu.classList.remove('open'); });
  const closeMenu = (e) => { if (!e.target.closest('.pp-speed')) ui.menu.classList.remove('open'); };
  document.addEventListener('click', closeMenu);

  // escudo sobre o YouTube: clique = play/pause; toque duplo nas laterais = ±10s
  const shield = $('.pp-shield');
  let lastTap = 0, tapTimer = 0;
  shield.addEventListener('click', (e) => {
    const touch = matchMedia('(hover: none)').matches;
    const now = Date.now();
    const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width;
    if (now - lastTap < 280) { clearTimeout(tapTimer); lastTap = 0; if (x < 0.35) seekBy(-10); else if (x > 0.65) seekBy(10); else toggleFs(); return; }
    lastTap = now;
    tapTimer = setTimeout(() => { if (touch && !el.classList.contains('ui-on')) showUi(); else toggle(); }, touch ? 260 : 200);
  });
  el.addEventListener('mousemove', showUi);
  el.addEventListener('touchstart', showUi, { passive: true });
  el.addEventListener('mouseleave', () => { if (el.classList.contains('is-playing') && !ui.menu.classList.contains('open') && !dragging) el.classList.remove('ui-on'); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  // atalhos
  el.addEventListener('keydown', (e) => {
    if (e.target.matches('input')) return;
    const k = e.key.toLowerCase();
    const map = { ' ': toggle, k: toggle, arrowleft: () => seekBy(-5), j: () => seekBy(-10), arrowright: () => seekBy(5), l: () => seekBy(10), f: toggleFs, m: toggleMute,
      arrowup: () => setVol(Number(ui.vol.value) + 10), arrowdown: () => setVol(Number(ui.vol.value) - 10),
      '>': () => setRate(RATES[Math.min(RATES.length - 1, RATES.indexOf(prefs.rate || 1) + 1)]), '<': () => setRate(RATES[Math.max(0, RATES.indexOf(prefs.rate || 1) - 1)]) };
    if (map[k]) { e.preventDefault(); map[k](); showUi(); }
    else if (/^[0-9]$/.test(k) && ready) { yt.seekTo(duration * Number(k) / 10, true); showUi(); }
  });
  const onHide = () => { if (document.hidden && ready) savePos(yt.getCurrentTime(), true); };
  const onLeave = () => { if (ready) savePos(yt.getCurrentTime(), true); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onLeave);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf); clearTimeout(hideTimer);
      if (ready) savePos(yt.getCurrentTime(), true);
      try { yt?.destroy(); } catch { /* */ }
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('fullscreenchange', updFs);
      document.removeEventListener('webkitfullscreenchange', updFs);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      document.documentElement.classList.remove('pp-lock');
    },
  };
}
