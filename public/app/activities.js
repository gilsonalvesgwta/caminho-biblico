import { esc } from '/shared/ui.js';
import { compute, brl, pct, MOEDAS, setCurrency, curSymbol, ARMAS, FRUTOS, MENTIRAS, AREAS_CASAL, PERGUNTAS_ALTAR, PERGUNTAS_MORDOMO, CATEGORIAS_FIXOS, CATEGORIAS_VARIAVEIS, NOTAS_RETRATO } from '/shared/calc.js';

// ---------- caminho ("rendas.0.valor") ----------
const split = (p) => p.split('.').map((k) => (/^\d+$/.test(k) ? Number(k) : k));
export function getAt(obj, p) { return split(p).reduce((o, k) => (o == null ? undefined : o[k]), obj); }
export function setAt(obj, p, v) {
  const ks = split(p); let o = obj;
  ks.slice(0, -1).forEach((k, i) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = typeof ks[i + 1] === 'number' ? [] : {}; o = o[k]; });
  o[ks.at(-1)] = v;
}

const FMT = {
  brl: (v) => brl(v ?? 0), pct: (v) => pct(v), int: (v) => (v == null ? '—' : String(Math.round(v))),
  dec: (v) => (v == null ? '—' : Number(v).toFixed(1).replace('.', ',')), text: (v) => (v ?? '—'),
  months: (v) => (v == null ? '—' : `${Number(v).toFixed(1).replace('.', ',')} meses`),
};

// ---------- widgets ----------
function W(data) {
  const val = (p) => getAt(data, p);
  const attr = (p) => `data-p="${esc(p)}" id="f-${esc(p)}"`;
  const lbl = (p, label, hint) => (label ? `<label for="f-${esc(p)}">${esc(label)}</label>` : '') + (hint ? `<span class="hint">${esc(hint)}</span>` : '');
  const w = {
    val,
    text: (p, label, o = {}) => `<div class="field ${o.cls || ''}">${lbl(p, label, o.hint)}<input class="input" ${attr(p)} value="${esc(val(p))}" placeholder="${esc(o.ph || '')}" autocomplete="off"></div>`,
    money: (p, label, o = {}) => `<div class="field ${o.cls || ''}">${lbl(p, label, o.hint)}<div class="input-money" data-cur="${esc(curSymbol())}"><input class="input" inputmode="decimal" ${attr(p)} value="${esc(val(p))}" placeholder="${esc(o.ph || '0,00')}" autocomplete="off"></div></div>`,
    num: (p, label, o = {}) => `<div class="field ${o.cls || ''}">${lbl(p, label, o.hint)}<input class="input" inputmode="decimal" ${attr(p)} value="${esc(val(p))}" placeholder="${esc(o.ph || '')}" autocomplete="off"></div>`,
    date: (p, label, o = {}) => `<div class="field ${o.cls || ''}">${lbl(p, label, o.hint)}<input class="input" type="date" ${attr(p)} value="${esc(val(p))}"></div>`,
    area: (p, label, o = {}) => `<div class="field ${o.cls || ''}">${lbl(p, label, o.hint)}<textarea class="input" ${attr(p)} placeholder="${esc(o.ph || '')}" rows="${o.rows || 3}">${esc(val(p))}</textarea></div>`,
    select: (p, label, opts, o = {}) => `<div class="field ${o.cls || ''}">${lbl(p, label, o.hint)}<select class="input" ${attr(p)}><option value="">Selecione</option>${opts.map((x) => `<option ${val(p) === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>`,
    pills: (p, label, opts, o = {}) => {
      const cur = val(p) ?? o.def;
      const multi = !!o.multi;
      return `<div class="field ${o.cls || ''}">${label ? `<span class="label">${esc(label)}</span>` : ''}${o.hint ? `<span class="hint">${esc(o.hint)}</span>` : ''}<div class="pills ${o.sm ? 'sm' : ''}" role="${multi ? 'group' : 'radiogroup'}">${opts.map((x) => {
        const on = multi ? (cur || []).includes(x) : cur === x;
        return `<label class="pill"><input type="${multi ? 'checkbox' : 'radio'}" name="${esc(p)}" data-p="${esc(p)}" ${multi ? 'data-multi' : ''} value="${esc(x)}" ${on ? 'checked' : ''}><span>${esc(x)}</span></label>`;
      }).join('')}</div></div>`;
    },
    scale: (p, label, o = {}) => `<div class="field">${label ? `<span class="label">${esc(label)}</span>` : ''}<div class="scale" role="radiogroup">${Array.from({ length: 11 }, (_, i) => `<label><input type="radio" name="${esc(p)}" data-p="${esc(p)}" data-num value="${i}" ${String(val(p)) === String(i) ? 'checked' : ''}><span>${i}</span></label>`).join('')}</div><div class="scale-ends"><span>${esc(o.lo || 'Nada')}</span><span>${esc(o.hi || 'Totalmente')}</span></div></div>`,
    check: (p, label, o = {}) => `<label class="check"><input type="checkbox" data-p="${esc(p)}" data-bool ${val(p) ? 'checked' : ''}><span>${esc(label)}${o.sub ? `<br><small class="faint">${esc(o.sub)}</small>` : ''}</span></label>`,
    rows: (p, cols, o = {}) => {
      let arr = val(p);
      if (!Array.isArray(arr)) { arr = []; setAt(data, p, arr); }
      while (arr.length < (o.min || 1)) arr.push({});
      const tpl = cols.map((c) => c.w || '1fr').join(' ');
      return `<div class="rows">${arr.map((_, i) => `<div class="row ${arr.length > (o.min || 1) || o.removable ? 'has-x' : ''}" style="grid-template-columns:${tpl}">
        ${cols.map((c) => {
          const cp = `${p}.${i}.${c.k}`;
          const o2 = { cls: c.span ? 'span-2' : '', ph: c.ph };
          if (c.t === 'money') return w.money(cp, c.label, o2);
          if (c.t === 'num') return w.num(cp, c.label, o2);
          if (c.t === 'date') return w.date(cp, c.label, o2);
          if (c.t === 'select') return w.select(cp, c.label, c.opts, o2);
          if (c.t === 'bool') return `<div class="field ${o2.cls}"><label>${esc(c.label)}</label><label class="check" style="padding:9px 12px"><input type="checkbox" data-p="${esc(cp)}" data-bool ${val(cp) ? 'checked' : ''}><span style="font-size:13.5px">${esc(c.on || 'Sim')}</span></label></div>`;
          return w.text(cp, c.label, o2);
        }).join('')}
        ${arr.length > (o.min || 1) ? `<button type="button" class="row-x" data-del="${esc(p)}" data-i="${i}" aria-label="Remover linha">×</button>` : ''}
      </div>`).join('')}</div><button type="button" class="add-row" data-add="${esc(p)}">+ ${esc(o.add || 'Adicionar linha')}</button>`;
    },
    calc: (key, label, f = 'brl', o = {}) => `<div class="calc ${o.big ? 'big' : ''}"><span>${esc(label)}</span><b data-c="${key}" data-f="${f}" ${o.signed ? 'data-signed' : ''}>—</b></div>`,
    block: (name) => `<div data-block="${name}"></div>`,
    section: (tag, title, intro, body) => `<section class="act-section">${tag ? `<span class="act-tag">${esc(tag)}</span>` : ''}<h3>${esc(title)}</h3>${intro ? `<p class="intro">${intro}</p>` : '<div style="height:14px"></div>'}${body}</section>`,
    feedback: () => w.section('Opcional', 'Como foi essa aula pra você?', 'Compartilhe seus maiores aprendizados e coisas que Deus revelou para você.', w.area('feedback', '', { ph: 'Escreva aqui…', rows: 4 })),
  };
  return w;
}

// ---------- blocos calculados ----------
const BLOCKS = {
  compareSobraD2: (c) => `<div class="compare"><div><small>Você estimou no Dia 1</small><b>${brl(c.sobraEstimada)}</b></div><div><small>Sobra antes dos variáveis</small><b class="${c.sobraAntesVariaveis < 0 ? 'neg' : ''}">${brl(c.sobraAntesVariaveis)}</b></div></div><p class="callout">No Dia 4, com o extrato, você vai descobrir o que sobra de verdade.</p>`,
  compareSobraD4: (c) => `<div class="compare"><div><small>O que você achava (Dia 1)</small><b>${brl(c.sobraEstimada)}</b></div><div><small>O que realmente sobra</small><b class="${c.sobraReal < 0 ? 'neg' : ''}">${brl(c.sobraReal)}</b></div></div>
    ${c.diferencaSobra !== null ? `<p class="callout ${c.diferencaSobra >= 0 ? 'green' : ''}">Essa é a diferença entre o que você acha e o que acontece: <b>${brl(c.diferencaSobra)}</b>.</p>` : ''}`,
  emocional: (c) => (c.variaveis ? `<p class="callout">${pct(c.emocionalPct)} dos seus gastos variáveis foram emocionais (${brl(c.emocional)}).</p>` : ''),
  mapaDividas: (c) => (c.mapaDividas.length ? `<div class="debt-list">${c.mapaDividas.map((d) => `<div class="debt"><div class="p">${d.prioridade}</div><div class="d"><b>${esc(d.credor)}</b><small>Saldo ${brl(d.saldo)} · parcela ${brl(d.parcela)}${d.juros !== null ? ` · ${String(d.juros).replace('.', ',')}% a.m.` : ''}</small></div>${d.atraso ? '<span class="badge err">Em atraso</span>' : `<span class="badge">${esc(d.tipo)}</span>`}</div>`).join('')}</div><p class="hint" style="margin-top:8px">Ordem de prioridade: primeiro as em atraso, depois as de maior juros.</p>` : '<p class="callout green">Você não registrou dívidas no Dia 1. Glória a Deus!</p>'),
  fase: (c) => (c.fase ? `<div class="phase-badge"><div class="n">${c.fase}</div><div><h4>Você está na ${esc(c.faseNome)}</h4><p>Próximo passo: ${esc(c.proximoDegrau)}.</p></div></div>
    <div class="grid-2" style="margin-top:10px"><div class="metric"><div class="label">Custo de vida mensal</div><div class="val">${brl(c.custoVida)}</div></div><div class="metric"><div class="label">Sua reserva cobre</div><div class="val">${FMT.months(c.reservaMeses)}</div>${c.faltaReserva > 0 ? `<div class="sub">Faltam ${brl(c.faltaReserva)} para a reserva mínima</div>` : ''}</div></div>` : '<p class="hint">Preencha quanto você tem guardado para descobrir a sua fase.</p>'),
  dizimo: (c) => `<div class="compare"><div><small>Sobra real (Dia 4)</small><b>${brl(c.sobraReal)}</b></div><div><small>Sobra depois do dízimo</small><b class="${c.sobraDepoisDizimo < 0 ? 'neg' : ''}">${brl(c.sobraDepoisDizimo)}</b></div></div>
    ${c.sobraDepoisDizimo < 0 ? '<p class="callout">Se a conta ficou negativa, lembre-se do que você ouviu hoje: este é um grande teste de fé. Os próximos dias vão te ajudar a reorganizar a casa.</p>' : ''}`,
  primicia: (c) => `<div class="calc big"><span>Sua primícia mensal (um dia de trabalho)</span><b>${brl(c.primicia)}</b></div>${c.tipoRenda === 'Fixa' ? `<p class="hint" style="margin-top:8px">Renda de ${brl(c.renda)} ÷ 30 dias.</p>` : c.mediaVariavel ? `<p class="hint" style="margin-top:8px">Média dos últimos 3 meses (${brl(c.mediaVariavel)}) ÷ 30. Recalcule todo mês.</p>` : ''}`,
  casa: (c) => casaHtml(c),
  plano: (c, all) => planoHtml(c, all),
  casal: (c) => (c.casalMenor ? `<p class="callout">Menor nota: <b>${esc(c.casalMenor.a)}</b> (${FMT.dec(c.casalMenor.m)}). Conversem sobre esta área.</p>` : ''),
  termometro: (c) => (c.mordomiaD4 == null ? '' : `<p class="callout ${c.mordomiaD4 >= 8 ? 'green' : ''}">Termômetro do mordomo: <b>${c.mordomiaD4 >= 8 ? 'mordomo fiel. Continue assim.' : c.mordomiaD4 >= 5 ? 'no caminho, com pontos a ajustar.' : 'precisa de atenção. Comece pelo que você escreveu em “o que preciso mudar”.'}</b></p>`),
  resumoD3: (c) => `<div class="grid-2" style="margin-top:12px"><div class="metric"><div class="label">Armas frequentes na sua vida</div><div class="val">${c.armasFrequentes} de 7</div></div><div class="metric"><div class="label">Frutos que você reconhece</div><div class="val">${c.frutos} de 12</div></div></div>`,
};

export function casaHtml(c) {
  return `<table class="budget">${c.casa.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.linha)}</td><td>${brl(l.v)}</td></tr>`).join('')}
    <tr class="total"><td></td><td>Renda</td><td>${brl(c.renda)}</td></tr><tr class="total"><td></td><td>Sobra</td><td class="${c.sobraCasa < 0 ? 'neg' : ''}" style="color:${c.sobraCasa < 0 ? 'var(--danger)' : 'var(--forest-500)'}">${brl(c.sobraCasa)}</td></tr></table>
    ${c.naoEssencial || c.emocional ? `<p class="callout">Pontos de atenção: ${brl(c.naoEssencial)} em custos não essenciais (Dia 2) e ${brl(c.emocional)} em gastos emocionais (Dia 4).</p>` : ''}`;
}
export function planoHtml(c, all = {}) {
  const d7 = all[7] || {};
  return `<div class="phase-badge"><div class="n">${c.fase || '?'}</div><div><h4>${esc(c.faseNome || 'Fase ainda não calculada')}</h4><p>Próximo degrau: ${esc(c.proximoDegrau || 'complete o Dia 4')}</p></div></div>
    <div class="grid-2" style="margin-top:10px">
      <div class="metric"><div class="label">Sobra da Casa em Ordem</div><div class="val ${c.sobraCasa < 0 ? 'neg' : ''}">${brl(c.sobraCasa)}</div></div>
      <div class="metric"><div class="label">Vou direcionar por mês</div><div class="val">${brl(c.direcionar)}</div></div>
      <div class="metric" style="grid-column:1/-1"><div class="label">Sonho principal</div><div class="val" style="font-size:21px">${esc(c.sonhoPrincipal || '—')}</div><div class="sub">${c.sonhoValor ? brl(c.sonhoValor) : ''}${c.sonhoAnos ? ` · em ${c.sonhoAnos} anos` : ''}${d7.imovelSonho === 'Sim' ? ' · ter um imóvel está entre os seus sonhos' : ''}</div></div>
    </div>
    <p class="callout green" style="margin-top:12px"><b>Meu próximo passo:</b> participar da aula ao vivo.</p>`;
}

// ---------- definição de cada dia ----------
const DAYS = {
  1: {
    required: (d, c) => [!c.renda && 'Informe pelo menos uma fonte de renda', d.paz == null && 'Dê a sua nota de paz'].filter(Boolean),
    render: (w) => [
      w.section('Antes de começar', 'Em que moeda você recebe?', 'Se você mora fora do Brasil, use a moeda do país onde vive. Todos os cálculos do desafio vão usar esta moeda.',
        `<div class="field"><select class="input" data-p="moeda" data-rerender>${MOEDAS.map(([c, l]) => `<option value="${c}" ${(w.val('moeda') || 'BRL') === c ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`),
      w.section('Parte 1', 'Quanto entra', 'Liste cada fonte de renda líquida do mês: o que de fato cai na sua conta. Ninguém precisa ver estes números além de você.',
        w.rows('rendas', [{ k: 'fonte', label: 'Fonte', ph: 'Salário, empresa, extra…', span: 1, w: '1.6fr' }, { k: 'tipo', label: 'Tipo', t: 'select', opts: ['Fixa', 'Variável'] }, { k: 'valor', label: 'Valor mensal', t: 'money' }], { add: 'Adicionar fonte de renda' }) + w.calc('renda', 'Renda total')),
      w.section('Parte 2', 'Quanto você deve', 'Liste cada dívida: credor, saldo total, valor da parcela e se está em dia ou em atraso. Se não tem dívidas, deixe em branco.',
        w.rows('dividas', [{ k: 'credor', label: 'Credor', ph: 'Banco, cartão, loja…', w: '1.4fr', span: 1 }, { k: 'saldo', label: 'Saldo total', t: 'money' }, { k: 'parcela', label: 'Parcela', t: 'money' }, { k: 'situacao', label: 'Situação', t: 'select', opts: ['Em dia', 'Em atraso'] }], { add: 'Adicionar dívida' })
        + w.calc('dividaTotal', 'Total das dívidas') + w.calc('parcelasTotal', 'Parcelas por mês')),
      w.section('Parte 3', 'Quanto sobra', 'Sem abrir o extrato, escreva quanto você acha que sobra por mês. No Dia 4 vamos comparar com o real.', w.money('sobraEstimada', 'Quanto eu acho que sobra por mês')),
      w.section('Parte 4', 'Meu retrato hoje', 'Tudo o que você responder aqui fica guardado e reaparece no Dia 7, lado a lado com as novas respostas.',
        NOTAS_RETRATO.map(([k, l]) => w.scale(`notas.${k}`, l)).join('') + w.scale('paz', 'De 0 a 10, quanta paz você tem hoje em relação ao dinheiro?', { lo: 'Nenhuma', hi: 'Paz total' })
        + w.area('cenario', 'Meu cenário financeiro hoje', { ph: 'Descreva com sinceridade…' })
        + `<div class="grid-3">${[0, 1, 2].map((i) => w.text(`medos.${i}`, `Medo ${i + 1}`)).join('')}</div>`
        + `<div class="grid-3">${[0, 1, 2].map((i) => w.text(`dificuldades.${i}`, `Dificuldade ${i + 1}`)).join('')}</div>`
        + w.area('esperaDeus', 'O que eu espero que Deus faça nestes 7 dias')),
      w.section('Parte 5', 'Meu propósito', 'Escreva, com as suas palavras, o propósito que você fez com Deus para estes 7 dias.', w.area('proposito', '', { ph: 'Senhor, nestes 7 dias eu…', rows: 4 })),
      w.section('Reflexão', 'Se a minha renda dobrasse…', '', w.area('reflexao', 'O que mudaria de verdade na minha vida?')),
      w.feedback(),
    ].join(''),
  },
  2: {
    required: (d) => [PERGUNTAS_ALTAR.some((_, i) => !d.altar?.[i]?.resposta) && 'Responda as 3 perguntas do altar'].filter(Boolean),
    render: (w) => [
      w.section('Parte A', 'O altar', 'Responda com sinceridade. Depois, ore e peça ao Espírito Santo que mostre quem ou o que está no trono do seu coração.',
        PERGUNTAS_ALTAR.map((q, i) => `<div style="padding:14px 0;border-bottom:1px dashed var(--line-strong)">${w.pills(`altar.${i}.resposta`, q.q, q.opts)}${w.text(`altar.${i}.porque`, 'Por quê?')}</div>`).join('')
        + '<div style="height:12px"></div>' + w.area('trono', 'Depois da oração: o que (ou quem) o Espírito Santo me mostrou que está no trono?') + w.area('renuncio', 'O que eu renuncio hoje')),
      w.section('Parte B', 'Custos fixos', 'Os compromissos que o seu dinheiro tem todo mês. As parcelas das dívidas já vêm do Dia 1 e não precisam ser digitadas de novo.',
        w.rows('custos', [{ k: 'categoria', label: 'Categoria', t: 'select', opts: CATEGORIAS_FIXOS }, { k: 'item', label: 'Item', ph: 'Aluguel, luz…', w: '1.3fr' }, { k: 'valor', label: 'Valor', t: 'money' }, { k: 'vencimento', label: 'Vence dia', t: 'num', w: '.6fr' }, { k: 'essencial', label: 'Essencial?', t: 'select', opts: ['Sim', 'Não'], w: '.8fr' }], { min: 3, add: 'Adicionar custo fixo' })
        + w.calc('parcelasTotal', 'Parcelas de dívidas (vem do Dia 1)') + w.calc('custosFixos', 'Total de custos fixos') + w.calc('naoEssencial', 'Total não essencial') + w.calc('sobraAntesVariaveis', 'Sobra antes dos gastos variáveis', 'brl', { big: true }) + w.block('compareSobraD2')),
      w.feedback(),
    ].join(''),
  },
  3: {
    required: () => [],
    render: (w) => [
      w.section('Parte A', 'As armas de Mamom', 'Para cada arma, marque com que frequência ela aparece na sua vida e se você a vê na história da sua família.',
        ARMAS.map((a) => `<div style="padding:12px 0;border-bottom:1px dashed var(--line-strong)"><b style="display:block;margin-bottom:8px">${esc(a)}</b><div class="grid-2">${w.pills(`armas.${a}.vida`, 'Na minha vida', ['Nunca', 'Às vezes', 'Frequente'], { sm: true })}${w.pills(`armas.${a}.familia`, 'Na história da minha família', ['Sim', 'Não'], { sm: true })}</div></div>`).join('')),
      w.section('Parte A', 'Os frutos', 'Marque os frutos que você reconhece na sua vida.', `<div class="check-list">${FRUTOS.map((f) => w.check(`frutos.${f}`, f)).join('')}</div>` + w.block('resumoD3')),
      w.section('Parte B', 'Mentira × Verdade', 'Marque as mentiras em que você já acreditou e escreva, ao lado, a verdade: um versículo ou uma frase do desafio.',
        MENTIRAS.map((m) => `<div style="padding:10px 0;border-bottom:1px dashed var(--line-strong)">${w.check(`mentiras.${m}.acreditei`, `“${m}”`)}${w.text(`mentiras.${m}.verdade`, '', { ph: 'A verdade é…' })}</div>`).join('')
        + '<div style="height:12px"></div>' + w.area('outrasMentiras', 'Outras mentiras que percebi') + w.area('reflexoes', 'Minhas reflexões até aqui')),
      w.section('Parte C', 'Fortalecendo o meu propósito', '', `<div data-block="propositoD1"></div>`
        + w.pills('proposito.com', 'Vou fortalecer com', ['Jejum', 'Oração', 'Jejum e oração', 'Outro']) + w.area('proposito.buscar', 'O que vou buscar em Deus')
        + `<div class="grid-2">${w.date('proposito.inicio', 'Data de início')}${w.text('proposito.duracao', 'Duração', { ph: 'Ex.: 3 dias, 21 dias' })}</div>` + w.pills('proposito.quem', 'Quem vai comigo', ['Sozinho', 'Cônjuge', 'Família'])),
      w.section('Parte D · para casados', 'Unidade do casal', 'Notas de 0 a 10 para cada área, preenchidas pelos dois.',
        w.check('casado', 'Sou casado(a) e quero fazer esta parte com o meu cônjuge') + `<div data-show="casado" style="margin-top:12px">${AREAS_CASAL.map((a) => `<div class="grid-2" style="align-items:end"><div class="field"><b>${esc(a)}</b></div><div class="grid-2">${w.num(`casal.${a}.eu`, 'Minha nota', { ph: '0–10' })}${w.num(`casal.${a}.conjuge`, 'Cônjuge', { ph: '0–10' })}</div></div>`).join('')}${w.block('casal')}</div>`),
      w.feedback(),
    ].join(''),
  },
  4: {
    required: (d) => [!(d.guardado !== undefined && d.guardado !== '') && 'Informe quanto você tem guardado hoje (pode ser 0)'].filter(Boolean),
    render: (w, all) => {
      const dividas = (all[1]?.dividas || []).filter((x) => x.credor || x.saldo || x.parcela);
      return [
        w.section('Parte A', 'O mordomo presta contas', 'Para cada pergunta, uma nota de 0 a 10 e o que você precisa mudar.',
          PERGUNTAS_MORDOMO.map((q, i) => `<div style="padding:12px 0;border-bottom:1px dashed var(--line-strong)">${w.scale(`mordomia.${i}.nota`, q, { lo: 'Muito mal', hi: 'Muito bem' })}${w.text(`mordomia.${i}.mudar`, 'O que preciso mudar')}</div>`).join('') + w.calc('mordomiaD4', 'Sua nota de mordomia', 'dec', { big: true }) + w.block('termometro')),
        w.section('Parte B', 'Extrato de 30 dias: a sobra real', 'Pegue o extrato da conta e a fatura do cartão dos últimos 30 dias e lance os gastos variáveis. “Emocional” é o que você comprou por ansiedade, tristeza, comparação, para agradar alguém ou como recompensa.',
          w.rows('extrato', [{ k: 'data', label: 'Data', t: 'date', w: '1fr' }, { k: 'descricao', label: 'Descrição', w: '1.4fr' }, { k: 'valor', label: 'Valor', t: 'money' }, { k: 'categoria', label: 'Categoria', t: 'select', opts: CATEGORIAS_VARIAVEIS }, { k: 'emocional', label: 'Emocional?', t: 'bool', w: '.8fr' }], { min: 3, add: 'Adicionar gasto' })
          + w.calc('renda', 'Renda (Dia 1)') + w.calc('custosFixos', 'Custos fixos (Dia 2)') + w.calc('variaveis', 'Gastos variáveis') + w.block('emocional') + w.calc('sobraReal', 'Sobra real', 'brl', { big: true }) + w.block('compareSobraD4')),
        w.section('Parte C', 'Mapa de dívidas', dividas.length ? 'As dívidas vêm do seu Raio-X. Complete os juros (se souber) e o tipo. A lista se organiza sozinha.' : '',
          (dividas.length ? `<div class="rows">${dividas.map((dv, i) => `<div class="row" style="grid-template-columns:1.3fr 1fr 1.4fr"><div class="field"><label>Credor</label><div style="padding:10px 0;font-weight:700">${esc(dv.credor || `Dívida ${i + 1}`)}</div></div>${w.num(`dividasExtra.${i}.juros`, 'Juros ao mês (%)', { ph: 'Ex.: 12' })}${w.pills(`dividasExtra.${i}.tipo`, 'Tipo', ['Consumo', 'Crédito para patrimônio'], { sm: true, def: 'Consumo' })}</div>`).join('')}</div>` : '') + w.block('mapaDividas')),
        w.section('Parte D', 'Minha fase', 'Dois números para descobrir em qual das 3 fases financeiras você está.',
          `<div class="grid-2">${w.money('guardado', 'Quanto tenho guardado hoje')}${w.money('patrimonio', 'Patrimônio além da reserva', { hint: 'Imóveis além da moradia, investimentos, cotas, empresa' })}</div>` + w.block('fase')),
        w.section('Checkpoint 1', 'Só mais 3 perguntas', 'Elas ajudam o Rhus a preparar a aula ao vivo para a sua realidade.',
          w.pills('checkpoint.imovel', 'Tem imóvel próprio?', ['Sim', 'Não']) + w.pills('checkpoint.mora', 'Onde mora?', ['Brasil', 'Exterior']) + `<div data-show="checkpoint.mora=Exterior">${w.text('checkpoint.pais', 'País')}</div>`
          + `<div class="grid-2">${w.select('checkpoint.estadoCivil', 'Estado civil', ['Solteiro(a)', 'Casado(a) / união estável', 'Divorciado(a)', 'Viúvo(a)'])}${w.num('checkpoint.filhos', 'Número de filhos', { ph: '0' })}</div>`),
        w.feedback(),
      ].join('');
    },
  },
  5: {
    required: (d) => [!d.hoje && 'Responda como está a sua relação com o dízimo hoje', !d.jaNosGastos && 'Diga se o dízimo já está nos gastos do Dia 4'].filter(Boolean),
    render: (w) => [
      w.section('Parte A', 'Minha relação com o dízimo hoje', '', w.pills('hoje', 'Hoje eu', ['Entrego fielmente', 'Entrego às vezes', 'Não entrego']) + w.pills('sinto', 'Quando entrego, sinto', ['Alegria', 'Gratidão', 'Peso', 'Obrigação', 'Medo de faltar'], { multi: true }) + w.area('falou', 'O que Deus falou comigo sobre isso hoje?')),
      w.section('Parte B', 'O dízimo como primeira linha', 'O seu orçamento passa a começar pela linha “Dízimo”, antes de qualquer outro gasto. Para renda variável: 10% de cada entrada.',
        w.calc('renda', 'Renda que entra (Dia 1)') + w.calc('dizimo', 'Dízimo mensal', 'brl', { big: true }) + w.pills('jaNosGastos', 'O dízimo já está nos gastos que você anotou no Dia 4?', ['Sim', 'Não']) + w.block('dizimo')),
      w.section('Parte C', 'Minha decisão', 'Vou entregar o meu dízimo como a primeira coisa, no dia em que recebo.', `<div class="grid-2">${w.date('inicio', 'A partir de')}${w.text('diasRecebo', 'Dia(s) do mês em que recebo', { ph: 'Ex.: 5 e 20' })}</div>`),
      w.feedback(),
    ].join(''),
  },
  6: {
    required: () => [],
    render: (w, all, c) => [
      w.section('Parte A', 'Minha primícia', 'O primeiro dia de trabalho de cada mês pertence a Deus. A primícia é entregue todo mês, no início do mês, antes de qualquer outro gasto.',
        w.pills('tipoRenda', 'Tipo de renda', ['Fixa', 'Variável'], { def: c.rendaVariavel ? 'Variável' : 'Fixa' })
        + `<div data-show="tipoRenda=Variável" data-show-def="${c.rendaVariavel ? 'Variável' : 'Fixa'}"><p class="hint">Some o que entrou em cada um dos últimos 3 meses.</p><div class="grid-3">${w.money('m3', 'Há 3 meses')}${w.money('m2', 'Há 2 meses')}${w.money('m1', 'Mês passado')}</div></div>`
        + w.block('primicia') + '<div style="height:12px"></div>' + w.text('diaEntrega', 'Dia da entrega', { ph: 'Ex.: dia 1º' })),
      w.section('Parte B', 'Ofertas e generosidade', 'A oferta é a verdade que quebra as mentiras de Mamom. O valor é seu; pode ser zero agora.',
        w.money('ofertas', 'Ofertas mensais') + '<div class="label" style="margin:8px 0 10px">Meu ato de generosidade desta semana</div>' + `<div class="grid-3">${w.text('generosidade.para', 'Para quem')}${w.select('generosidade.oque', 'O quê', ['Dinheiro', 'Tempo', 'Talento', 'Outro'])}${w.text('generosidade.quando', 'Quando')}</div>`),
      w.section('Parte C', 'Minha Casa em Ordem', 'Montada sozinha a partir dos Dias 1 a 6, na ordem dos princípios.', w.block('casa') + `<div data-block="guia"></div>`),
      w.feedback(),
    ].join(''),
  },
  7: {
    required: (d) => [!d.aulaAoVivo && 'Responda se quer participar da aula ao vivo'].filter(Boolean),
    render: (w, all) => {
      const d1 = all[1] || {};
      const v1 = (x) => (x === undefined || x === null || x === '' ? '<span class="faint">—</span>' : esc(x));
      return [
        w.section('Parte A', 'Meus sonhos', 'Cada etapa da vida possibilita certos movimentos financeiros. Dê nome, valor e prazo aos seus sonhos.',
          [['curto', 'Curto prazo (este ano)', 'Um computador novo, uma viagem pequena…'], ['medio', 'Médio prazo (até 5 anos)', 'Uma reforma, trocar de carro…'], ['longo', 'Longo prazo (10 anos ou mais)', 'Mais imóveis, a faculdade dos filhos…']].map(([k, l, ph]) => `<div class="row" style="grid-template-columns:2fr 1fr .7fr;margin-bottom:10px"><div class="field span-2"><label>${l}</label><input class="input" data-p="sonhos.${k}.oque" value="${esc(w.val(`sonhos.${k}.oque`))}" placeholder="${ph}"></div>${w.money(`sonhos.${k}.valor`, 'Valor')}${w.num(`sonhos.${k}.anos`, 'Em quantos anos')}</div>`).join('')
          + `<div class="grid-2">${w.money('aposentadoriaRenda', 'Aposentadoria: renda mensal passiva que desejo')}${w.num('aposentadoriaIdade', 'Com que idade')}</div>` + w.pills('imovelSonho', 'Ter um imóvel (ou mais um) está entre os meus sonhos?', ['Sim', 'Não'])),
        w.section('Parte B', 'Meu Plano de Patrimônio', 'Gerado a partir da sua fase (Dia 4), da sua Casa em Ordem (Dia 6) e dos seus sonhos.', w.money('direcionar', 'Quanto posso direcionar por mês para construir patrimônio') + w.block('plano')),
        w.section('Parte C', 'Meu retrato depois', 'As mesmas perguntas do Dia 1. À esquerda, o que você respondeu há 7 dias.',
          NOTAS_RETRATO.map(([k, l]) => `<div style="padding:10px 0;border-bottom:1px dashed var(--line-strong)"><div class="hint">Dia 1: <b>${v1(d1.notas?.[k])}</b></div>${w.scale(`depois.notas.${k}`, `${l} hoje`)}</div>`).join('')
          + `<div style="padding:10px 0;border-bottom:1px dashed var(--line-strong)"><div class="hint">Dia 1: <b>${v1(d1.paz)}</b></div>${w.scale('depois.paz', 'Paz com o dinheiro hoje', { lo: 'Nenhuma', hi: 'Paz total' })}</div>`
          + `<div style="padding:10px 0;border-bottom:1px dashed var(--line-strong)"><div class="hint">Nota de mordomia no Dia 4: <b data-c="mordomiaD4" data-f="dec">—</b></div>${w.scale('depois.mordomia', 'Minha nota de mordomia hoje')}</div>`
          + `<div style="margin-top:14px"><div class="hint">Dia 1: ${v1(d1.cenario)}</div>${w.area('depois.cenario', 'Meu cenário financeiro hoje')}</div>`
          + [0, 1, 2].map((i) => `<div class="grid-2"><div class="field"><label>Medo ${i + 1} no Dia 1</label><div class="objective" style="padding:10px 12px;font-size:14px">${v1(d1.medos?.[i])}</div></div>${w.text(`depois.medos.${i}`, 'E hoje?')}</div>`).join('')
          + [0, 1, 2].map((i) => `<div class="grid-2"><div class="field"><label>Dificuldade ${i + 1} no Dia 1</label><div class="objective" style="padding:10px 12px;font-size:14px">${v1(d1.dificuldades?.[i])}</div></div>${w.text(`depois.dificuldades.${i}`, 'E hoje?')}</div>`).join('')
          + w.area('mudou', 'O que mudou em mim') + w.area('mostrou', 'O que Deus me mostrou nestes 7 dias')
          + `<div class="hint" style="margin-bottom:6px">No Dia 1 você esperava: ${v1(d1.esperaDeus)}</div>` + w.area('deusFez', 'O que Deus fez em relação ao que eu esperava no Dia 1')
          + w.area('recado', 'Tem um recado que deseja mandar diretamente para o Rhus? Se sim, escreva aqui e ele receberá essa mensagem!', { rows: 4 })
          + w.pills('autoriza', 'Posso compartilhar o meu relato?', ['Sim, com meu nome', 'Sim, sem meu nome', 'Não'])),
        w.section('Checkpoint 2', 'O seu convite', 'A aula ao vivo é onde o Rhus mostra, com números reais, como sair da sua fase e começar a construir patrimônio.',
          `<div data-block="live"></div>` + w.text('whatsapp', 'WhatsApp (com DDD e país)', { ph: '+55 11 99999-9999' }) + w.pills('aulaAoVivo', 'Quero participar da aula ao vivo', ['Sim', 'Não'])),
        w.feedback(),
      ].join('');
    },
  },
};

/** Monta a atividade dentro de `root`, com cálculo ao vivo e callback de mudança */
export function mountActivity(root, { day, answers, rules, live, guideUrl, onChange }) {
  const def = DAYS[day];
  if (!def) { root.innerHTML = ''; return null; }
  const all = JSON.parse(JSON.stringify(answers || {}));
  all[day] = all[day] || {};
  const data = all[day];
  const extraBlocks = {
    propositoD1: () => (all[1]?.proposito ? `<div class="objective" style="margin-bottom:14px"><div class="eyebrow" style="margin-bottom:6px">O seu propósito no Dia 1</div>${esc(all[1].proposito)}</div>` : ''),
    guia: () => (guideUrl ? `<a class="btn btn-ghost btn-sm" style="margin-top:12px" href="${esc(guideUrl)}" target="_blank" rel="noopener">Abrir o Guia rápido: Casa em Ordem</a>` : ''),
    live: () => (live ? `<div class="live-card" style="margin-bottom:16px">${liveDateHtml(live)}<div style="flex:1;min-width:200px"><h3>${esc(live.title)}</h3><p>${esc(fmtLive(live.startsAt))}</p></div></div>` : ''),
  };

  function render() {
    setCurrency(all[1]?.moeda || 'BRL');
    const c = compute(all, rules);
    root.innerHTML = def.render(W(data), all, c);
    update();
  }
  function update() {
    const c = compute(all, rules);
    root.querySelectorAll('[data-c]').forEach((el) => {
      const v = c[el.dataset.c];
      el.textContent = (FMT[el.dataset.f] || FMT.brl)(v);
      el.classList.toggle('neg', typeof v === 'number' && v < 0 && el.dataset.f === 'brl');
    });
    root.querySelectorAll('[data-block]').forEach((el) => {
      const fn = BLOCKS[el.dataset.block] || extraBlocks[el.dataset.block];
      if (fn) el.innerHTML = fn(c, all);
    });
    root.querySelectorAll('[data-show]').forEach((el) => {
      const [p, v] = el.dataset.show.split('=');
      const cur = getAt(data, p) ?? (el.dataset.showDef || undefined);
      el.classList.toggle('hidden', v === undefined ? !cur : cur !== v);
    });
    return c;
  }
  const readInput = (el) => {
    if (el.hasAttribute('data-bool')) return el.checked;
    if (el.hasAttribute('data-multi')) return [...root.querySelectorAll(`[name="${CSS.escape(el.name)}"]:checked`)].map((x) => x.value);
    if (el.hasAttribute('data-num')) return Number(el.value);
    return el.value;
  };
  const onInput = (e) => {
    const el = e.target.closest('[data-p]');
    if (!el) return;
    setAt(data, el.dataset.p, readInput(el));
    if (el.hasAttribute('data-rerender')) { render(); onChange?.(data); return; }
    update();
    onChange?.(data);
  };
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  root.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    const del = e.target.closest('[data-del]');
    if (add) { const arr = getAt(data, add.dataset.add) || []; arr.push({}); setAt(data, add.dataset.add, arr); render(); root.querySelector(`[data-p^="${add.dataset.add}.${arr.length - 1}."]`)?.focus(); onChange?.(data); }
    if (del) { const arr = getAt(data, del.dataset.del); arr.splice(Number(del.dataset.i), 1); render(); onChange?.(data); }
  });
  render();
  return { data, missing: () => def.required(data, compute(all, rules)), computed: () => compute(all, rules) };
}

export function fmtLive(iso) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }).replace(',', ' ·') + ' (Brasília)';
}
export function liveDateHtml(live) {
  const d = new Date(live.startsAt);
  const day = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' });
  const mon = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'short' }).replace('.', '');
  return `<div class="live-date"><small>${esc(mon)}</small><b>${day}</b></div>`;
}
