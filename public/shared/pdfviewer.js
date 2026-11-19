// Leitor de PDF dentro da plataforma (pdf.js, sem baixar o arquivo).
// Funciona igual no computador, Android e iPhone — o leitor nativo dos navegadores não mostra PDF em iframe no celular.
const BASE = '/shared/pdfjs/';
let lib = null;
async function pdfjs() {
  if (!lib) {
    lib = await import(`${BASE}pdf.min.mjs`);
    lib.GlobalWorkerOptions.workerSrc = `${BASE}pdf.worker.min.mjs`;
  }
  return lib;
}

const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IC = {
  close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  minus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
};
const ZOOMS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5, 3];

/** Abre o PDF numa tela cheia. Só arquivos do próprio site (materiais enviados pelo painel). */
export function openPdf({ url, title = 'Material', downloadName }) {
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const el = document.createElement('div');
  el.className = 'pdfv';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', title);
  el.innerHTML = `
    <div class="pdfv-bar">
      <button class="pdfv-ico" data-close aria-label="Fechar">${IC.close}</button>
      <div class="pdfv-title"><b>${escH(title)}</b><small id="pdfv-pg">Abrindo…</small></div>
      <div class="pdfv-tools">
        <div class="pdfv-zoom"><button class="pdfv-ico" data-z="-1" aria-label="Diminuir">${IC.minus}</button><span id="pdfv-zl">100%</span><button class="pdfv-ico" data-z="1" aria-label="Aumentar">${IC.plus}</button></div>
        <a class="pdfv-dl" href="${escH(url)}" download="${escH(downloadName || '')}" aria-label="Baixar">${IC.down}<span>Baixar</span></a>
      </div>
    </div>
    <div class="pdfv-body" tabindex="-1"><div class="pdfv-pages" id="pdfv-pages"><div class="pdfv-state"><span class="pdfv-spin"></span><b>Abrindo o material</b><small id="pdfv-prog">Só um instante…</small></div></div></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));

  const body = el.querySelector('.pdfv-body'), pagesEl = el.querySelector('#pdfv-pages');
  const pgEl = el.querySelector('#pdfv-pg'), zl = el.querySelector('#pdfv-zl');
  let doc = null, task = null, base = null, zoomI = ZOOMS.indexOf(1), closed = false, io = null, cur = 1;
  const pages = []; // { box, canvas, vp, rendered, render }

  const close = () => {
    if (closed) return; closed = true;
    io?.disconnect(); removeEventListener('keydown', onKey); removeEventListener('resize', onResize);
    for (const p of pages) p.render?.cancel?.();
    task?.destroy?.(); doc?.destroy?.();
    el.classList.remove('on');
    setTimeout(() => { el.remove(); document.body.style.overflow = prevOverflow; }, 180);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if ((e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zoom(1); }
    else if (e.key === '-' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zoom(-1); }
  };
  addEventListener('keydown', onKey);
  el.querySelector('[data-close]').onclick = close;

  const fitScale = () => {
    const w = Math.min(body.clientWidth - (body.clientWidth < 640 ? 16 : 64), 920);
    return Math.max(0.2, w / base.width);
  };
  const scale = () => fitScale() * ZOOMS[zoomI];
  const setPg = () => { if (doc) pgEl.textContent = `Página ${cur} de ${doc.numPages}`; };

  // reserva o espaço de cada página (com a proporção da página 1 até ela ser lida) e desenha só o que aparece na tela
  const layout = () => {
    const s = scale();
    for (const p of pages) {
      const vp = (p.vp || base);
      p.box.style.width = `${Math.floor(vp.width * s)}px`;
      p.box.style.height = `${Math.floor(vp.height * s)}px`;
      if (p.rendered && p.scale !== s) p.rendered = false;
    }
    zl.textContent = `${Math.round(ZOOMS[zoomI] * 100)}%`;
    io?.disconnect();
    io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) draw(pages[Number(e.target.dataset.i)]); }), { root: body, rootMargin: '900px 0px' });
    pages.forEach((p) => io.observe(p.box));
  };

  async function draw(p) {
    if (closed || p.rendered || p.busy) return;
    p.busy = true;
    try {
      const page = p.page || (p.page = await doc.getPage(p.n));
      const s = scale();
      const vp = page.getViewport({ scale: 1 });
      if (!p.vp || p.vp.width !== vp.width || p.vp.height !== vp.height) { p.vp = vp; p.box.style.width = `${Math.floor(vp.width * s)}px`; p.box.style.height = `${Math.floor(vp.height * s)}px`; }
      // nitidez de tela retina, sem estourar o limite de memória do iPhone
      let dpr = Math.min(window.devicePixelRatio || 1, 2);
      const css = page.getViewport({ scale: s });
      while (css.width * css.height * dpr * dpr > 12e6 && dpr > 1) dpr -= 0.25;
      const view = page.getViewport({ scale: s * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(view.width); canvas.height = Math.floor(view.height);
      p.render?.cancel?.();
      p.render = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: view });
      await p.render.promise;
      if (closed) return;
      p.box.querySelector('canvas')?.remove();
      p.box.appendChild(canvas);
      p.box.classList.add('ready');
      p.rendered = true; p.scale = s;
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') console.warn('[pdf]', e);
    } finally { p.busy = false; }
  }

  function zoom(dir) {
    if (!doc) return;
    const next = Math.min(ZOOMS.length - 1, Math.max(0, zoomI + dir));
    if (next === zoomI) return;
    const ratio = body.scrollTop / Math.max(1, body.scrollHeight);
    zoomI = next; layout();
    body.scrollTop = ratio * body.scrollHeight;
  }
  el.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => zoom(Number(b.dataset.z))));

  let rt = null;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(() => doc && layout(), 150); };
  addEventListener('resize', onResize);
  body.addEventListener('scroll', () => {
    const mid = body.scrollTop + body.clientHeight / 3;
    let n = 1;
    for (const p of pages) { if (p.box.offsetTop <= mid) n = p.n; else break; }
    if (n !== cur) { cur = n; setPg(); }
  }, { passive: true });

  const fail = (msg) => {
    pgEl.textContent = 'Não foi possível abrir';
    pagesEl.innerHTML = `<div class="pdfv-state"><b>Não conseguimos abrir este PDF aqui</b><small>${escH(msg)}</small><a class="btn btn-gold" href="${escH(url)}" download>Baixar o arquivo</a></div>`;
  };

  (async () => {
    try {
      const pdf = await pdfjs();
      task = pdf.getDocument({ url, isEvalSupported: false, disableRange: true, standardFontDataUrl: `${BASE}standard_fonts/`, cMapUrl: `${BASE}cmaps/`, cMapPacked: true, iccUrl: `${BASE}iccs/` });
      task.onProgress = ({ loaded, total }) => { const pr = el.querySelector('#pdfv-prog'); if (pr && total) pr.textContent = `${Math.min(100, Math.round((loaded / total) * 100))}%`; };
      doc = await task.promise;
      if (closed) return;
      const first = await doc.getPage(1);
      base = first.getViewport({ scale: 1 });
      pagesEl.innerHTML = '';
      for (let n = 1; n <= doc.numPages; n++) {
        const box = document.createElement('div');
        box.className = 'pdfv-page'; box.dataset.i = String(n - 1);
        box.setAttribute('aria-label', `Página ${n}`);
        pagesEl.appendChild(box);
        pages.push({ n, box, page: n === 1 ? first : null, vp: n === 1 ? base : null });
      }
      setPg(); layout(); body.focus({ preventScroll: true });
    } catch (e) {
      if (closed) return;
      console.warn('[pdf]', e);
      fail(e?.name === 'PasswordException' ? 'O arquivo está protegido por senha.' : 'Você pode baixar o arquivo e abrir no seu aparelho.');
    }
  })();
  return { close };
}

/** O PDF pode ser lido aqui? (arquivos enviados pelo painel ficam no próprio site) */
export function canReadPdf(url) {
  try { const u = new URL(url, location.href); return u.origin === location.origin && /\.pdf$/i.test(u.pathname); } catch { return false; }
}
