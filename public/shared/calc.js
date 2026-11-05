/**
 * Regras de cálculo do desafio — fonte única, usada no app (navegador) e no servidor.
 * Espelha o Roteiro Mestre e a Planilha do Aluno.
 */
export const n = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/[R$\s]/g, '');
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const x = Number(norm);
  return Number.isFinite(x) ? x : 0;
};
const has = (v) => v !== null && v !== undefined && v !== '';
const sum = (arr, f) => (arr || []).reduce((a, x) => a + n(f(x)), 0);
const avg = (vals) => { const v = vals.filter(has).map(n); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

export const ARMAS = ['Escassez', 'Avareza', 'Consumismo', 'Perdas excessivas', 'Desperdício', 'Medo e preocupações', 'Esterilidade financeira'];
export const FRUTOS = [
  'Falsa segurança: só há segurança quando há dinheiro',
  'Excesso de trabalho: tudo depende da força do meu braço',
  'Grandes passos travados pelo medo da falta',
  '"Deus não tem nada a ver com o meu dinheiro"',
  'Gastão: ganho bem, mas gasto sem controle',
  'Acumulador: travo completamente os recursos',
  'Me acostumei a viver com pouco',
  'Paralisia ministerial',
  '"O meu dinheiro e o seu dinheiro" no casamento',
  'Controle de pessoas por meio do dinheiro',
  'Afastamento da família por causa de dinheiro',
  'Dinheiro como régua do valor das pessoas',
];
export const MENTIRAS = [
  'Só há segurança quando há dinheiro', 'Eu sou o que eu tenho', 'Tudo depende da força do meu braço',
  'Deus não tem nada a ver com o meu dinheiro', 'Ou adoro a Deus, ou sou rico', 'Humildade é ser pobre',
  'Dinheiro não importa', 'O meu dinheiro é meu (no casamento)', 'Dinheiro é bom só na minha mão',
];
export const AREAS_CASAL = ['Intenções', 'Decisões', 'Funções de cada um', 'Prestação de contas', 'Exemplo para os filhos', 'Objetivos e conquistas'];
export const PERGUNTAS_ALTAR = [
  { q: 'Em um momento de dificuldade, para onde eu olho primeiro?', opts: ['Deus', 'Conta bancária', 'Outro'] },
  { q: 'O que dita a minha paz e tranquilidade?', opts: ['Deus', 'Meus recursos', 'Outro'] },
  { q: 'O que aumenta a minha coragem para tomar riscos e iniciativas?', opts: ['Deus', 'O dinheiro', 'Outro'] },
];
export const PERGUNTAS_MORDOMO = [
  'Como cuido dos centavos e dos grandes montantes na hora de comprar?',
  'Como estou gerindo os recursos efetivamente?',
  'Como uso o dinheiro quando estou abalado (para o bem ou para o mal)?',
  'Como cuido dos bens materiais que Deus me confiou?',
  'Como cuido de tudo o que Ele me confiou além do dinheiro?',
];
export const CATEGORIAS_FIXOS = ['Moradia', 'Contas da casa', 'Transporte', 'Educação', 'Saúde', 'Seguros', 'Assinaturas', 'Outros'];
export const CATEGORIAS_VARIAVEIS = ['Mercado', 'Alimentação fora/delivery', 'Transporte variável', 'Compras', 'Lazer', 'Presentes', 'Apostas', 'Outros'];
export const NOTAS_RETRATO = [['espiritual', 'Vida espiritual'], ['familia', 'Família'], ['trabalho', 'Trabalho'], ['financas', 'Finanças']];

export const DEFAULT_RULES = { reserveMonths: 6, phase3Patrimony: 100000, phase3PatrimonyForeign: 20000, tithePercent: 10 };

/** Calcula todos os indicadores a partir das respostas { 1: {...}, 2: {...}, ... } */
export function compute(ans = {}, rules = DEFAULT_RULES) {
  const r = { ...DEFAULT_RULES, ...rules };
  const d1 = ans[1] || {}, d2 = ans[2] || {}, d3 = ans[3] || {}, d4 = ans[4] || {}, d5 = ans[5] || {}, d6 = ans[6] || {}, d7 = ans[7] || {};
  const o = {};
  o.moeda = d1.moeda || 'BRL';
  const estrangeira = o.moeda !== 'BRL';

  // Dia 1 — Raio-X
  const rendas = (d1.rendas || []).filter((x) => has(x.fonte) || n(x.valor));
  const dividas = (d1.dividas || []).filter((x) => has(x.credor) || n(x.saldo) || n(x.parcela));
  o.renda = sum(rendas, (x) => x.valor);
  o.rendaVariavel = rendas.some((x) => x.tipo === 'Variável');
  o.dividaTotal = sum(dividas, (x) => x.saldo);
  o.parcelasTotal = sum(dividas, (x) => x.parcela);
  o.dividasAtraso = dividas.filter((x) => x.situacao === 'Em atraso').length;
  o.sobraEstimada = has(d1.sobraEstimada) ? n(d1.sobraEstimada) : null;
  o.pazD1 = has(d1.paz) ? n(d1.paz) : null;

  // Dia 2 — custos fixos (as parcelas vêm do Dia 1)
  const custos = (d2.custos || []).filter((x) => has(x.item) || n(x.valor));
  o.custosItens = sum(custos, (x) => x.valor);
  o.custosFixos = o.custosItens + o.parcelasTotal;
  o.naoEssencial = sum(custos.filter((x) => x.essencial === 'Não'), (x) => x.valor);
  o.sobraAntesVariaveis = o.renda - o.custosFixos;

  // Dia 3 — Mamom
  o.armasFrequentes = ARMAS.filter((a) => d3.armas?.[a]?.vida === 'Frequente').length;
  o.armasFamilia = ARMAS.filter((a) => d3.armas?.[a]?.familia === 'Sim').length;
  o.frutos = FRUTOS.filter((f) => d3.frutos?.[f]).length;
  o.mentiras = MENTIRAS.filter((m) => d3.mentiras?.[m]?.acreditei).length;
  if (d3.casado) {
    const medias = AREAS_CASAL.map((a) => ({ a, m: avg([d3.casal?.[a]?.eu, d3.casal?.[a]?.conjuge]) })).filter((x) => x.m !== null);
    o.casalMenor = medias.length ? medias.reduce((p, c) => (c.m < p.m ? c : p)) : null;
    o.casalMedias = medias;
  }

  // Dia 4 — mordomia, sobra real, dívidas, fase
  o.mordomiaD4 = avg((d4.mordomia || []).map((x) => x?.nota));
  const extrato = (d4.extrato || []).filter((x) => has(x.descricao) || n(x.valor));
  o.variaveis = sum(extrato, (x) => x.valor);
  o.emocional = sum(extrato.filter((x) => x.emocional), (x) => x.valor);
  o.emocionalPct = o.variaveis ? o.emocional / o.variaveis : 0;
  o.porCategoria = CATEGORIAS_VARIAVEIS.map((c) => ({ c, v: sum(extrato.filter((x) => (x.categoria || 'Outros') === c), (x) => x.valor) })).filter((x) => x.v > 0);
  o.sobraReal = o.renda - o.custosFixos - o.variaveis;
  o.diferencaSobra = o.sobraEstimada === null ? null : o.sobraReal - o.sobraEstimada;
  o.mapaDividas = dividas.map((dv, i) => {
    const extra = d4.dividasExtra?.[i] || {};
    const atraso = dv.situacao === 'Em atraso';
    return { credor: dv.credor || `Dívida ${i + 1}`, saldo: n(dv.saldo), parcela: n(dv.parcela), atraso, juros: has(extra.juros) ? n(extra.juros) : null, tipo: extra.tipo || 'Consumo', idx: i, score: (atraso ? 1000 : 0) + n(extra.juros) };
  }).sort((a, b) => b.score - a.score).map((x, i) => ({ ...x, prioridade: i + 1 }));
  o.guardado = n(d4.guardado);
  o.patrimonio = n(d4.patrimonio);
  o.custoVida = o.custosFixos + o.variaveis;
  o.reservaMeses = o.custoVida ? o.guardado / o.custoVida : 0;
  const d4ok = has(d4.guardado) || extrato.length > 0;
  if (d4ok) {
    if (o.dividasAtraso > 0 || o.reservaMeses < r.reserveMonths) o.fase = 1;
    else if (o.patrimonio < (estrangeira ? r.phase3PatrimonyForeign : r.phase3Patrimony)) o.fase = 2;
    else o.fase = 3;
  } else o.fase = null;
  o.faseNome = { 1: 'Fase 1: Reserva', 2: 'Fase 2: Construir patrimônio', 3: 'Fase 3: Multiplicar' }[o.fase] || null;
  o.proximoDegrau = { 1: 'Completar a reserva e quitar as dívidas em atraso', 2: 'Começar a construir patrimônio', 3: 'Multiplicar o patrimônio que já tenho' }[o.fase] || null;
  o.faltaReserva = Math.max(0, r.reserveMonths * o.custoVida - o.guardado);

  // Dia 5 — dízimo
  o.dizimo = o.renda * (n(r.tithePercent) / 100);
  o.dizimoNosGastos = d5.jaNosGastos === 'Sim';
  o.sobraDepoisDizimo = o.dizimoNosGastos ? o.sobraReal : o.sobraReal - o.dizimo;

  // Dia 6 — primícia e ofertas
  const tipoRenda = d6.tipoRenda || (o.rendaVariavel ? 'Variável' : 'Fixa');
  o.tipoRenda = tipoRenda;
  const meses = [d6.m3, d6.m2, d6.m1].filter(has);
  o.mediaVariavel = meses.length ? meses.reduce((a, b) => a + n(b), 0) / meses.length : null;
  o.primicia = tipoRenda === 'Variável' ? (o.mediaVariavel ? o.mediaVariavel / 30 : 0) : o.renda / 30;
  o.ofertas = n(d6.ofertas);

  // Casa em Ordem (na ordem dos princípios)
  const variaveisSemDizimo = o.variaveis - (o.dizimoNosGastos ? o.dizimo : 0);
  o.casa = [
    { linha: 'Dízimo', v: o.dizimo },
    { linha: 'Primícia', v: o.primicia },
    { linha: 'Ofertas', v: o.ofertas },
    { linha: 'Custos fixos', v: o.custosFixos },
    { linha: 'Gastos variáveis', v: Math.max(0, variaveisSemDizimo) },
  ];
  o.saidas = o.casa.reduce((a, x) => a + x.v, 0);
  o.sobraCasa = o.renda - o.saidas;

  // Dia 7 — plano de patrimônio e retrato depois
  o.direcionar = has(d7.direcionar) ? n(d7.direcionar) : null;
  o.sonhoPrincipal = d7.sonhos?.longo?.oque || d7.sonhos?.medio?.oque || d7.sonhos?.curto?.oque || null;
  const sp = d7.sonhos?.longo?.oque ? d7.sonhos.longo : d7.sonhos?.medio?.oque ? d7.sonhos.medio : d7.sonhos?.curto;
  o.sonhoValor = sp && has(sp.valor) ? n(sp.valor) : null;
  o.sonhoAnos = sp && has(sp.anos) ? n(sp.anos) : null;
  o.pazD7 = has(d7.depois?.paz) ? n(d7.depois.paz) : null;
  o.mordomiaD7 = has(d7.depois?.mordomia) ? n(d7.depois.mordomia) : null;
  o.pazGanho = o.pazD1 !== null && o.pazD7 !== null ? o.pazD7 - o.pazD1 : null;

  // Score de qualificação para a aula ao vivo / consultoria (0–100)
  let score = 0;
  if (d7.aulaAoVivo === 'Sim') score += 30;
  if (d7.imovelSonho === 'Sim') score += 15;
  if (o.direcionar && o.direcionar > 0) score += Math.min(20, Math.round((estrangeira ? o.direcionar * 5 : o.direcionar) / 100));
  if (o.fase === 2) score += 15; else if (o.fase === 3) score += 20; else if (o.fase === 1 && o.dividasAtraso === 0) score += 5;
  const rendaRef = estrangeira ? o.renda * 5 : o.renda; // equivalência aproximada só para o score
  if (rendaRef >= 5000) score += 10; else if (rendaRef >= 3000) score += 5;
  if (d7.whatsapp) score += 5;
  o.leadScore = Math.min(100, score);
  return o;
}

// Moeda do aluno (brasileiros no Brasil e no exterior). Definida no Dia 1.
export const MOEDAS = [['BRL', 'Real (R$)', 'R$'], ['EUR', 'Euro (€)', '€'], ['USD', 'Dólar americano (US$)', 'US$'], ['CAD', 'Dólar canadense (C$)', 'C$'], ['AUD', 'Dólar australiano (A$)', 'A$'], ['GBP', 'Libra (£)', '£'], ['CHF', 'Franco suíço (CHF)', 'CHF'], ['JPY', 'Iene (¥)', '¥']];
let CUR = 'BRL';
export const setCurrency = (c) => { CUR = MOEDAS.some((m) => m[0] === c) ? c : 'BRL'; return CUR; };
export const currency = () => CUR;
export const curSymbol = (c = CUR) => (MOEDAS.find((m) => m[0] === c) || MOEDAS[0])[2];
export const money = (v, c = CUR) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: c }));
export const brl = (v) => money(v);
export const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(0)}%`);
