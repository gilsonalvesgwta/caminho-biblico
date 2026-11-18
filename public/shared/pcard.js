// Cartão de produto da vitrine. O mesmo desenho é usado no app do aluno e na prévia do painel.
import { esc } from '/shared/ui.js';
import { themeVars, varsToStyle, loadFont, normalizeTheme } from '/shared/theme.js';

const ARROW = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const CAL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="10" width="14" height="10" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';

/** Capa: a imagem enviada, inteira e sem nada por cima; sem imagem, uma capa tipográfica com as cores do produto */
export function coverHtml({ cover, logo, name, kindLabel, mentor }) {
  if (cover) return `<div class="pc-cover has-img"><img src="${esc(cover)}" alt="" loading="lazy" decoding="async"></div>`;
  return `<div class="pc-cover"><div class="pc-art ${logo ? 'has-logo' : ''}"><span class="pc-frame"></span>
    ${logo ? `<img class="pc-logo" src="${esc(logo)}" alt="">` : `<div class="pc-type"><span class="pc-type-k">${esc(kindLabel || '')}</span><span class="pc-type-n">${esc(name || '')}</span>${mentor ? `<span class="pc-type-m">${esc(mentor)}</span>` : ''}</div>`}</div></div>`;
}

/**
 * @param o.href, o.external, o.theme, o.cover, o.logo, o.name, o.shortName, o.mentor, o.kindLabel, o.tagline
 * @param o.progress {label, pct} | null  · o.done (concluído) · o.store (produto à venda)
 * @param o.footNote texto do rodapé (validade) · o.cta texto do botão · o.tag "a" | "div"
 */
export function productCardHtml(o) {
  const th = normalizeTheme(o.theme || {});
  loadFont(th.font);
  const vars = varsToStyle(themeVars(o.theme || {}));
  const attrs = o.href ? `href="${esc(o.href)}" ${o.external ? 'target="_blank" rel="noopener"' : 'data-link'}` : '';
  const tag = o.href ? 'a' : 'div';
  const chip = o.done ? `<span class="pc-chip ok">${CHECK} Concluído</span>` : o.store ? `<span class="pc-chip lock">${LOCK} Disponível</span>` : '';
  return `<${tag} class="pcard2 ${o.store ? 'is-store' : ''} ${o.done ? 'is-done' : ''}" ${attrs} style="${vars}">
    ${coverHtml({ cover: o.cover, logo: o.logo, name: o.shortName || o.name, kindLabel: o.kindLabel, mentor: o.mentor })}
    <div class="pc-body">
      <div class="pc-meta"><span class="pc-kind">${esc(o.kindLabel || '')}</span>${o.mentor ? `<span class="pc-dot"></span><span class="pc-mentor">${esc(o.mentor)}</span>` : ''}${chip}</div>
      <h3 class="pc-title">${esc(o.name || '')}</h3>
      <p class="pc-tag">${esc(o.tagline || '')}</p>
      <div class="pc-prog">${o.progress ? `<div class="pc-prog-row"><span>${o.progress.label}</span>${o.progress.pct !== null && o.progress.pct !== undefined ? `<b>${o.progress.pct}%</b>` : ''}</div>${o.progress.pct !== null && o.progress.pct !== undefined ? `<div class="pc-bar" role="progressbar" aria-valuenow="${o.progress.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${o.progress.pct}%"></i></div>` : ''}` : ''}</div>
      <div class="pc-foot"><span class="pc-note">${o.footNote ? `${CAL}<span>${o.footNote}</span>` : ''}</span><span class="pc-cta">${esc(o.cta || 'Acessar')}${o.ctaArrow === false ? '' : ARROW}</span></div>
    </div></${tag}>`;
}
