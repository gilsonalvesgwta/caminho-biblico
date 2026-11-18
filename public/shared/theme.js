/**
 * Identidade visual por produto.
 * A partir de 3 cores (base escura, destaque e apoio) gera toda a escala usada pela interface,
 * escolhe automaticamente a cor de texto legível sobre o destaque e carrega a fonte de títulos.
 * A paleta padrão é exatamente a da plataforma: quem não personaliza não vê diferença.
 */
export const DEFAULT_THEME = { primary: '#0B1A2A', accent: '#C9A45C', secondary: '#1F6B52', font: 'Fraunces' };

export const FONTS = {
  Fraunces: { css: 'Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500', stack: '"Fraunces", Georgia, serif', label: 'Fraunces (clássica editorial)' },
  'Playfair Display': { css: 'Playfair+Display:ital,wght@0,400..700;1,400..600', stack: '"Playfair Display", Georgia, serif', label: 'Playfair Display (elegante)' },
  'Cormorant Garamond': { css: 'Cormorant+Garamond:ital,wght@0,400..700;1,400..600', stack: '"Cormorant Garamond", Georgia, serif', label: 'Cormorant Garamond (sofisticada)' },
  'DM Serif Display': { css: 'DM+Serif+Display:ital@0;1', stack: '"DM Serif Display", Georgia, serif', label: 'DM Serif Display (forte)' },
  Lora: { css: 'Lora:ital,wght@0,400..700;1,400..600', stack: '"Lora", Georgia, serif', label: 'Lora (acolhedora)' },
  Manrope: { css: 'Manrope:wght@400..800', stack: '"Manrope", system-ui, sans-serif', label: 'Manrope (moderna, sem serifa)' },
};

const hexOk = (h) => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);
const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(toRgb(a).map((v, i) => v + (toRgb(b)[i] - v) * t));
const lum = (h) => { const [r, g, b] = toRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

export function normalizeTheme(t = {}) {
  return {
    primary: hexOk(t.primary) ? t.primary : DEFAULT_THEME.primary,
    accent: hexOk(t.accent) ? t.accent : DEFAULT_THEME.accent,
    secondary: hexOk(t.secondary) ? t.secondary : DEFAULT_THEME.secondary,
    font: FONTS[t.font] ? t.font : DEFAULT_THEME.font,
  };
}

export const isDefaultTheme = (t) => { const n = normalizeTheme(t); return n.primary.toUpperCase() === DEFAULT_THEME.primary && n.accent.toUpperCase() === DEFAULT_THEME.accent && n.secondary.toUpperCase() === DEFAULT_THEME.secondary && n.font === DEFAULT_THEME.font; };

/** Variáveis CSS do tema. A paleta padrão devolve vazio: valem as cores originais da plataforma, sem recálculo. */
export function themeVars(t) {
  if (isDefaultTheme(t)) return {};
  const { primary, accent, secondary, font } = normalizeTheme(t);
  const W = '#ffffff', K = '#000000';
  const onAccent = contrast(accent, '#07121D') >= contrast(accent, W) ? mix(primary, K, 0.35) : W;
  return {
    '--ink-950': mix(primary, K, 0.35), '--ink-900': primary, '--ink-800': mix(primary, W, 0.07), '--ink-700': mix(primary, W, 0.17),
    '--ink-500': mix(primary, W, 0.38), '--ink-400': mix(primary, W, 0.52), '--ink-300': mix(primary, W, 0.68),
    '--gold-600': mix(accent, K, 0.18), '--gold-500': accent, '--gold-300': mix(accent, W, 0.45), '--gold-100': mix(accent, W, 0.84),
    '--forest-900': mix(secondary, K, 0.5), '--forest-700': mix(secondary, K, 0.28), '--forest-500': secondary, '--forest-300': mix(secondary, W, 0.45), '--forest-100': mix(secondary, W, 0.85),
    '--ok': secondary, '--ok-bg': mix(secondary, W, 0.85),
    '--on-gold': onAccent,
    '--font-display': FONTS[font].stack,
  };
}

export const varsToStyle = (vars) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');

const loaded = new Set(['Fraunces', 'Manrope']);
export function loadFont(name) {
  if (!FONTS[name] || loaded.has(name)) return;
  loaded.add(name);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${FONTS[name].css}&display=swap`;
  document.head.append(l);
}

/** Aplica o tema no documento (app do aluno dentro de um produto) */
let applied = [];
export function applyTheme(t) {
  const n = normalizeTheme(t);
  const vars = themeVars(n);
  const root = document.documentElement;
  for (const k of applied) root.style.removeProperty(k);
  applied = Object.keys(vars);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  loadFont(n.font);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', n.primary);
}
export function resetTheme() { applyTheme(DEFAULT_THEME); }
