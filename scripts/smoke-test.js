// Teste de ponta a ponta usado no CI: sobe o servidor num banco vazio e percorre o fluxo principal.
// Uso: node --no-warnings scripts/smoke-test.js
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { compute } from '../public/shared/calc.js';

const PORT = 3990;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caminho-teste-'));
let logs = '';

const srv = spawn(process.execPath, ['--no-warnings', 'server.js'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, APP_URL: BASE, ADMIN_EMAIL: 'dono@teste.com', ADMIN_PASSWORD: 'senha-forte-123', NODE_ENV: 'production', SCHEDULER_MINUTES: '60' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stdout.on('data', (d) => (logs += d));
srv.stderr.on('data', (d) => (logs += d));

const jar = { admin: '', user: '' };
async function call(who, method, url, body) {
  const r = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', cookie: jar[who] || '' }, body: body ? JSON.stringify(body) : undefined });
  const set = r.headers.getSetCookie?.() || [];
  if (set.length) jar[who] = set.map((c) => c.split(';')[0]).join('; ');
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}
const step = (n) => console.log(`✓ ${n}`);

try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  assert.equal((await call('admin', 'GET', '/health')).json.ok, true); step('servidor no ar');

  // regras de cálculo (planilha do aluno)
  const c = compute({ 1: { rendas: [{ valor: '5.000,00' }, { valor: '800' }], dividas: [{ credor: 'Cartão', saldo: '4200', parcela: '600', situacao: 'Em atraso' }], sobraEstimada: '900' }, 2: { custos: [{ valor: '1800' }, { valor: '90', essencial: 'Não' }, { valor: '350' }] }, 4: { extrato: [{ valor: '1200' }, { valor: '450', emocional: true }, { valor: '300', emocional: true }], guardado: '2000', patrimonio: '0' } });
  assert.equal(c.renda, 5800); assert.equal(c.custosFixos, 2840); assert.equal(c.variaveis, 1950); assert.equal(c.sobraReal, 1010); assert.equal(c.fase, 1); assert.equal(c.dizimo, 580);
  step('cálculos (renda, custos, sobra real, fase, dízimo)');

  assert.equal((await call('admin', 'POST', '/api/admin/login', { email: 'dono@teste.com', password: 'senha-forte-123' })).status, 200); step('login do painel');
  assert.equal((await call('admin', 'PUT', '/api/admin/products/1', { greenn_ids: '12345' })).status, 200); step('produto vinculado à Greenn');

  const s = (await call('admin', 'GET', '/api/admin/settings')).json;
  const hook = s.webhookUrl.replace(/^https?:\/\/[^/]+/, '');
  const venda = { type: 'sale', event: 'saleUpdated', currentStatus: 'paid', product: { id: 12345, name: 'Desafio' }, sale: { id: 9001, amount: 97, method: 'PIX' }, client: { name: 'Maria Teste', email: 'Maria@Teste.com', cellphone: '+5511999990000' } };
  assert.equal((await call('x', 'POST', hook + 'errado', venda)).status, 401); step('webhook recusa token inválido');
  assert.equal((await call('x', 'POST', hook, { ...venda, currentStatus: 'waiting_payment', sale: { id: 9000, amount: 97, method: 'PIX' } })).json.outcome, 'ok');
  const pend = (await call('admin', 'GET', '/api/admin/sales?status=waiting_payment')).json.rows[0];
  assert.equal(pend.name, 'Maria Teste'); assert.equal(pend.phone, '+5511999990000');
  assert.equal((await call('admin', 'GET', '/api/admin/students')).json.total, 0); step('Pix gerado e não pago: aparece com nome e telefone, sem liberar acesso');
  assert.equal((await call('x', 'POST', hook, venda)).json.outcome, 'ok');
  assert.equal((await call('x', 'POST', hook, venda)).json.outcome, 'ok'); step('webhook de venda paga (idempotente)');

  const alunos = (await call('admin', 'GET', '/api/admin/students')).json;
  assert.equal(alunos.total, 1); assert.equal(alunos.rows[0].email, 'maria@teste.com'); step('aluno criado com acesso');

  const token = (logs.match(/acesso\?t=([A-Za-z0-9_-]+)/) || [])[1];
  assert.ok(token, 'link de acesso no e-mail (modo teste)');
  assert.equal((await call('user', 'POST', '/api/app/token/consume', { token, password: 'aluno-123456' })).status, 200); step('aluno cria a senha pelo link');

  const me = (await call('user', 'GET', '/api/app/me')).json;
  const L = me.products[0].lessons;
  assert.equal(L[0].available, true); assert.equal(L[1].available, false); step('Dia 1 liberado e Dia 2 bloqueado');

  assert.equal((await call('user', 'PUT', '/api/app/p/desafio-7-dias/answers/1', { data: { rendas: [{ valor: '3000' }], paz: 4 } })).status, 200);
  const done = (await call('user', 'POST', '/api/app/p/desafio-7-dias/day/1/progress', { action: 'complete' })).json;
  assert.equal(done.state.completed, true); assert.equal(done.next.available, false);
  const horas = (Date.parse(done.next.availableAt) - Date.now()) / 3600e3;
  assert.ok(horas > 23.9 && horas <= 24, 'Dia 2 libera 24h depois'); step('concluir Dia 1 → Dia 2 libera em 24h');
  assert.equal((await call('user', 'PUT', '/api/app/p/desafio-7-dias/answers/2', { data: {} })).status, 403); step('Dia 2 não aceita respostas antes da hora');

  assert.equal((await call('x', 'POST', hook, { ...venda, currentStatus: 'refunded' })).json.outcome, 'ok');
  assert.equal((await call('user', 'GET', '/api/app/p/desafio-7-dias/day/1')).status, 403); step('reembolso remove o acesso');

  // ---------- multiproduto ----------
  const temaRiqueza = { primary: '#2B0F18', accent: '#D8B48A', secondary: '#7A2E3B', font: 'Playfair Display' };
  const p2 = (await call('admin', 'POST', '/api/admin/products', { name: 'Riqueza a Dois', slug: 'riqueza-a-dois', kind: 'course', unit_label: 'Aula', release_mode: 'sequential', greenn_ids: '777', theme: { ...temaRiqueza, primary: 'vermelho' }, short_name: 'Riqueza a Dois', mentor: 'Rhus e Carol' })).json;
  assert.ok(p2.id);
  const p3 = (await call('admin', 'POST', '/api/admin/products', { name: 'Comunidade Patrimônio', slug: 'comunidade', kind: 'course', show_in_store: true, sales_url: 'https://exemplo.com/comunidade', badge: 'Novo' })).json;
  assert.equal((await call('admin', 'POST', '/api/admin/products', { name: 'X', slug: 'x2', sales_url: 'javascript:alert(1)' })).status, 400);
  await call('admin', 'PUT', `/api/admin/products/${p2.id}`, { theme: temaRiqueza });
  for (const t of ['Introdução', 'Finanças do casal']) await call('admin', 'POST', `/api/admin/products/${p2.id}/lessons`, { title: t, activity_key: '' });
  const prods = (await call('admin', 'GET', '/api/admin/products')).json.rows;
  const r2 = prods.find((x) => x.id === p2.id);
  assert.equal(r2.theme_obj.primary, '#2B0F18'); assert.equal(r2.theme_obj.font, 'Playfair Display'); assert.equal(r2.unit_label, 'Aula');
  step('produto novo com identidade visual própria (cores inválidas e links perigosos recusados)');

  const svgMau = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  assert.equal((await call('admin', 'POST', `/api/admin/products/${p2.id}/image`, { target: 'logo', data: svgMau })).status, 400);
  const svgBom = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>').toString('base64');
  const lg = (await call('admin', 'POST', `/api/admin/products/${p2.id}/image`, { target: 'logo', data: svgBom })).json;
  assert.ok(lg.url.startsWith('/media/products/produto-')); assert.equal((await fetch(BASE + lg.url)).status, 200);
  step('logo do produto (SVG com script é bloqueado)');

  const novo = (await call('admin', 'POST', '/api/admin/students', { name: 'João Teste', email: 'joao@teste.com', product_ids: [1], send_email: false })).json;
  const link = (await call('admin', 'POST', `/api/admin/students/${novo.id}/send-access`)).json.link;
  jar.user = '';
  assert.equal((await call('user', 'POST', '/api/app/token/consume', { token: link.split('t=')[1], password: 'joao-123456' })).status, 200);
  let me2 = (await call('user', 'GET', '/api/app/me')).json;
  assert.equal(me2.products.length, 1); assert.equal(me2.store.length, 1); assert.equal(me2.store[0].salesUrl, 'https://exemplo.com/comunidade');
  step('aluno com 1 produto + vitrine "Conheça também"');

  assert.equal((await call('admin', 'POST', `/api/admin/students/${novo.id}/grant`, { product_id: p2.id, expires_at: '2000-01-01' })).status, 400);
  const venc = new Date(Date.now() + 40 * 86400e3).toISOString().slice(0, 10);
  const g = (await call('admin', 'POST', `/api/admin/students/${novo.id}/grant`, { product_id: p2.id, expires_at: venc, notify: true })).json;
  assert.equal(g.activated, true); assert.ok(['logged', 'sent'].includes(g.email));
  assert.ok(/Novo acesso liberado: Riqueza a Dois/.test(logs), 'e-mail de novo produto');
  me2 = (await call('user', 'GET', '/api/app/me')).json;
  const rq = me2.products.find((x) => x.slug === 'riqueza-a-dois');
  assert.ok(rq && rq.expiresAt.startsWith(venc.slice(0, 7))); assert.equal(rq.theme.accent, '#D8B48A'); assert.equal(rq.unitLabel, 'Aula'); assert.equal(rq.hasActivities, false);
  assert.ok(rq.logo);
  step('liberação manual com validade e aviso por e-mail; tema chega ao app');

  const a1 = (await call('user', 'GET', '/api/app/p/riqueza-a-dois/day/1')).json;
  assert.equal(a1.product.unitLabel, 'Aula'); assert.equal(a1.product.total, 2); assert.equal(a1.live, null);
  assert.equal((await call('user', 'GET', '/api/app/p/riqueza-a-dois/day/2')).json.locked, true);
  // frase abaixo do vídeo: padrão do produto, personalizada na aula ou nenhuma
  assert.equal(a1.watchNote, '');
  const prodsWn = (await call('admin', 'GET', '/api/admin/products')).json.rows;
  assert.equal(prodsWn.find((x) => x.slug === 'desafio-7-dias').watch_note, 'Assista com atenção. Se puder, tenha uma Bíblia por perto.');
  await call('admin', 'PUT', `/api/admin/products/${p2.id}`, { watch_note: 'Frase do curso' });
  const note = async () => (await call('user', 'GET', '/api/app/p/riqueza-a-dois/day/1')).json.watchNote;
  assert.equal(await note(), 'Frase do curso');
  const l1 = (await call('admin', 'GET', `/api/admin/products/${p2.id}/lessons`)).json.rows[0];
  await call('admin', 'PUT', `/api/admin/lessons/${l1.id}`, { watch_note: 'Só desta aula' }); assert.equal(await note(), 'Só desta aula');
  await call('admin', 'PUT', `/api/admin/lessons/${l1.id}`, { watch_note: '' }); assert.equal(await note(), '');
  await call('admin', 'PUT', `/api/admin/lessons/${l1.id}`, { watch_note: null }); assert.equal(await note(), 'Frase do curso');
  // marcar e desmarcar como assistida
  assert.equal((await call('user', 'POST', '/api/app/p/riqueza-a-dois/day/1/progress', { action: 'watched' })).json.state.watched, true);
  assert.equal((await call('user', 'POST', '/api/app/p/riqueza-a-dois/day/1/progress', { action: 'unwatched' })).json.state.watched, false);
  step('frase abaixo do vídeo (produto, aula, nenhuma) e desmarcar aula assistida');

  // blocos da aula: materiais, exercícios, tarefas, destaques…
  const blocosOk = [
    { type: 'text', title: 'Resumo', body: '**Importante**: leia.' },
    { type: 'materials', items: [{ title: 'Planilha', url: 'https://exemplo.com/p.xlsx' }, { title: '', url: '' }] },
    { type: 'exercise', title: 'Reflexão', questions: ['Pergunta 1', 'Pergunta 2'], required: true },
    { type: 'checklist', title: 'Tarefas', items: ['Baixar', 'Preencher'], required: true },
    { type: 'callout', variant: 'warning', body: 'Atenção' }, { type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    { type: 'button', label: 'Grupo', url: 'https://exemplo.com/grupo' }, { type: 'quotes', items: [{ text: 'Frase', ref: 'Autor' }] }, { type: 'points', items: ['A', 'B'] },
  ];
  assert.equal((await call('admin', 'PUT', `/api/admin/lessons/${l1.id}`, { blocks: [{ type: 'materials', items: [{ title: 'x', url: 'javascript:alert(1)' }] }] })).status, 400);
  assert.equal((await call('admin', 'PUT', `/api/admin/lessons/${l1.id}`, { blocks: [{ type: 'script' }] })).status, 400);
  assert.equal((await call('admin', 'PUT', `/api/admin/lessons/${l1.id}`, { blocks: blocosOk })).status, 200);
  const dB = (await call('user', 'GET', '/api/app/p/riqueza-a-dois/day/1')).json;
  assert.equal(dB.blocks.length, 9); assert.equal(dB.blocks[1].items.length, 1); assert.ok(dB.blocks.every((b) => /^[a-z0-9]{4,24}$/.test(b.id)));
  const ex = dB.blocks[2], ck = dB.blocks[3];
  const comp = async () => call('user', 'POST', '/api/app/p/riqueza-a-dois/day/1/progress', { action: 'complete' });
  assert.match((await comp()).json.error || '', /Responda o exercício/);
  await call('user', 'PUT', `/api/app/p/riqueza-a-dois/day/1/blocks/${ex.id}`, { data: { answers: ['Minha resposta 1', 'Minha resposta 2'] } });
  assert.equal((await call('user', 'PUT', `/api/app/p/riqueza-a-dois/day/1/blocks/${ck.id}`, { data: { done: [0] } })).json.data.done.length, 1);
  assert.match((await comp()).json.error || '', /Conclua as tarefas/);
  assert.deepEqual((await call('user', 'PUT', `/api/app/p/riqueza-a-dois/day/1/blocks/${ck.id}`, { data: { done: [1, 0, 7, 'x'] } })).json.data.done, [0, 1]);
  assert.equal((await call('user', 'PUT', `/api/app/p/riqueza-a-dois/day/1/blocks/nao-existe`, { data: {} })).status, 404);
  assert.equal((await call('user', 'PUT', `/api/app/p/riqueza-a-dois/day/1/blocks/${dB.blocks[0].id}`, { data: {} })).status, 404);
  const dB2 = (await call('user', 'GET', '/api/app/p/riqueza-a-dois/day/1')).json;
  assert.equal(dB2.blockAnswers[ex.id].answers[1], 'Minha resposta 2');
  const ficha = (await call('admin', 'GET', `/api/admin/students/${novo.id}`)).json;
  const ba = ficha.journeys.find((j) => j.product.slug === 'riqueza-a-dois').blockAnswers;
  assert.equal(ba.length, 2); assert.equal(ba[0].items[0].a, 'Minha resposta 1'); assert.equal(ba[1].items.every((x) => x.done), true);
  // arquivos de materiais
  const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%teste\n').toString('base64');
  const upf = (await call('admin', 'POST', '/api/admin/files', { name: 'Guia Prático (v2).pdf', data: pdf })).json;
  assert.match(upf.url, /^\/media\/files\/[a-f0-9]{12}-guia-pratico-v2\.pdf$/);
  const rf = await fetch(BASE + upf.url); assert.equal(rf.status, 200); assert.equal(rf.headers.get('content-type'), 'application/pdf');
  assert.equal((await call('admin', 'POST', '/api/admin/files', { name: 'virus.exe', data: pdf })).status, 400);
  assert.equal((await call('admin', 'POST', '/api/admin/files', { name: 'pagina.svg', data: pdf })).status, 400);
  assert.equal((await call('admin', 'POST', '/api/admin/files', { name: 'falso.pdf', data: 'data:application/pdf;base64,' + Buffer.from('<html>').toString('base64') })).status, 400);
  assert.equal((await call('user', 'POST', '/api/admin/files', { name: 'a.pdf', data: pdf })).status, 401);
  step('blocos da aula: validação, exercícios e tarefas obrigatórios, respostas no painel e upload de materiais');
  const c1 = (await call('user', 'POST', '/api/app/p/riqueza-a-dois/day/1/progress', { action: 'complete' })).json;
  assert.equal(c1.next.available, true); step('curso sem atividade: concluir aula 1 libera a aula 2 na hora');

  // compra pela Greenn de quem já é aluno: avisa do produto novo
  await call('admin', 'POST', `/api/admin/students/${novo.id}/revoke`, { product_id: p2.id });
  assert.equal((await call('user', 'GET', '/api/app/me')).json.products.length, 1);
  const compra2 = { type: 'sale', event: 'saleUpdated', currentStatus: 'paid', product: { id: 777, name: 'Riqueza a Dois' }, sale: { id: 9100, amount: 197 }, client: { name: 'João Teste', email: 'joao@teste.com' } };
  const rc = (await call('x', 'POST', hook, compra2)).json;
  assert.equal(rc.outcome, 'ok');
  const evs = (await call('admin', 'GET', '/api/admin/webhooks')).json.rows;
  assert.ok(/Aviso de novo produto enviado/.test(evs[0].message), evs[0].message);
  assert.equal((await call('user', 'GET', '/api/app/me')).json.products.length, 2);
  step('aluno que já existe compra outro produto: acesso + aviso, sem reenviar senha');

  const det = (await call('admin', 'GET', `/api/admin/students/${novo.id}`)).json;
  assert.equal(det.journeys.length, 2); assert.ok(det.journeys.some((x) => x.product.unitLabel === 'Aula'));
  step('painel mostra o progresso de cada produto do aluno');
  for (const pth of ['/p/riqueza-a-dois', '/p/riqueza-a-dois/dia/1', '/shared/theme.js']) assert.equal((await fetch(BASE + pth)).status, 200, pth);

  // capa personalizada (PNG mínimo válido)
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const cv = (await call('admin', 'POST', '/api/admin/lessons/1/cover', { target: 'video', data: png })).json;
  assert.ok(cv.url?.startsWith('/media/covers/aula-1-v-'));
  assert.equal((await fetch(BASE + cv.url)).status, 200);
  assert.equal((await call('admin', 'POST', '/api/admin/lessons/1/cover', { target: 'video', data: 'data:image/png;base64,' + Buffer.from('não é imagem').toString('base64') })).status, 400);
  assert.equal((await call('x', 'POST', '/api/admin/lessons/1/cover', { target: 'video', data: png })).status, 401);
  assert.equal((await call('admin', 'DELETE', '/api/admin/lessons/1/cover?target=video')).status, 200);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await fetch(BASE + cv.url)).status, 404);
  step('capa da aula: enviar, validar arquivo, proteger e remover');

  const bk = (await call('admin', 'POST', '/api/admin/backups')).json;
  assert.ok(bk.ok && bk.name);
  const lista = (await call('admin', 'GET', '/api/admin/backups')).json.rows;
  assert.equal(lista[0].name, bk.name);
  const dl = await fetch(BASE + '/api/admin/backups/' + bk.name, { headers: { cookie: jar.admin } });
  assert.equal(dl.status, 200); assert.ok((await dl.arrayBuffer()).byteLength > 10000);
  assert.equal((await call('x', 'GET', '/api/admin/backups/' + bk.name)).status, 401);
  step('backup: criar, listar e baixar (só administrador)');

  // financeiro: bruto, líquido (real da Greenn e estimado), reembolsos, marketing
  const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const daysAgo = (n) => new Date(Date.now() - 3 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
  const fin = async (q = `from=${today}&to=${today}`) => (await call('admin', 'GET', `/api/admin/finance?${q}`)).json;
  const f0 = await fin();
  const base = { type: 'sale', event: 'saleUpdated', product: { id: 12345, name: 'Desafio' }, client: { name: 'Fin Teste', email: 'fin@teste.com' } };
  await call('x', 'POST', hook, { ...base, currentStatus: 'paid', sale: { id: 9500, amount: 100, seller_balance: 90, method: 'CREDIT_CARD' }, saleMetas: [{ meta_key: 'utm_source', meta_value: 'facebook' }, { meta_key: 'utm_campaign', meta_value: 'desafio-frio' }] });
  await call('x', 'POST', hook, { ...base, currentStatus: 'paid', sale: { id: 9501, amount: 200, method: 'PIX' } });
  await call('x', 'POST', hook, { ...base, currentStatus: 'paid', sale: { id: 9502, amount: 50, method: 'PIX' } });
  await call('x', 'POST', hook, { ...base, currentStatus: 'refunded', sale: { id: 9502, amount: 50, method: 'PIX' } });
  const f1 = await fin();
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} ≠ ${b}`);
  near(f1.cur.gross - f0.cur.gross, 350, 'bruto');
  assert.equal(f1.cur.approved - f0.cur.approved, 3);
  assert.equal(f1.cur.refunds.c - f0.cur.refunds.c, 1); near(f1.cur.refunds.v - f0.cur.refunds.v, 50, 'reembolsos');
  near(f1.cur.net - f0.cur.net, 90 + (200 - 200 * 0.0499 - 1), 'líquido (real 90 + estimado 189,02)');
  assert.ok(f1.byMethod.some((m) => m.method === 'CREDIT_CARD') && f1.bySource.some((s) => s.source === 'facebook' && s.campaign === 'desafio-frio'));
  assert.ok(f1.byProduct.length && f1.series.length === 1 && f1.refundsList.some((r) => r.amount === 50));
  step('financeiro: bruto, líquido real e estimado, reembolsos, formas de pagamento e UTM');

  assert.equal((await call('admin', 'POST', '/api/admin/marketing/spend', { date: daysAgo(2), date_to: today, spend: '300,00', campaign_name: 'Teste', product_id: 1 })).json.days, 3);
  assert.equal((await call('admin', 'POST', '/api/admin/marketing/spend', { date: today, spend: '0' })).status, 400);
  const csv = 'Início dos relatórios;Término dos relatórios;Nome da campanha;Valor usado (BRL);Impressões;Cliques no link\n' + `${today};${today};"Campanha; Frio";"1.234,56";10.000;250\n`;
  const imp1 = (await call('admin', 'POST', '/api/admin/marketing/import', { csv })).json;
  assert.equal(imp1.imported, 1); near(imp1.total, 1234.56, 'csv');
  await call('admin', 'POST', '/api/admin/marketing/import', { csv }); // reimportar não duplica
  assert.equal((await call('admin', 'POST', '/api/admin/marketing/import', { csv: 'a,b\n1,2' })).status, 400);
  const f2 = await fin();
  near(f2.cur.spend, 100 + 1234.56, 'investimento do dia'); assert.equal(f2.cur.clicks, 250);
  near(f2.cur.roas, f2.cur.gross / f2.cur.spend, 'ROAS'); near(f2.cur.profit, f2.cur.net - f2.cur.spend, 'lucro');
  near((await fin(`from=${daysAgo(2)}&to=${today}`)).cur.spend, 300 + 1234.56, 'investimento de 3 dias');
  const rows = (await call('admin', 'GET', `/api/admin/marketing/spend?from=${daysAgo(2)}&to=${today}`)).json.rows;
  assert.equal(rows.length, 2); const man = rows.find((r) => r.source === 'manual');
  assert.equal(man.days, 3); near(man.spend, 300, 'lançamento agrupado');
  assert.equal((await call('admin', 'DELETE', `/api/admin/marketing/spend?source=manual&grp=${man.grp}&from=${today}&to=${today}`)).json.rows, 3);
  near((await fin(`from=${daysAgo(2)}&to=${today}`)).cur.spend, 1234.56, 'após excluir o lançamento inteiro');
  assert.equal((await call('admin', 'PUT', '/api/admin/settings', { fee_percent: 'abc' })).status, 400);
  const fA = await fin();
  await call('admin', 'PUT', '/api/admin/settings', { fee_percent: '10', fee_fixed: '0' });
  const fB = await fin();
  assert.ok(fB.cur.net < fA.cur.net); near(fB.cur.fees, fB.cur.kept.v - fB.cur.net, 'taxas = mantido − líquido');
  await call('admin', 'PUT', '/api/admin/settings', { fee_percent: '4.99', fee_fixed: '1' });
  const dash = (await call('admin', 'GET', '/api/admin/dashboard?days=30')).json;
  assert.ok(dash.fin && dash.fin.gross >= 350 && dash.fin.net > 0);
  step('marketing: lançamento por período, CSV da Meta sem duplicar, ROAS, lucro e taxa configurável');

  // logo da plataforma
  const logoPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  assert.equal((await call('x', 'GET', '/api/app/brand')).json.brand_logo, '');
  const up = (await call('admin', 'POST', '/api/admin/settings/logo', { target: 'icon', data: logoPng })).json;
  assert.match(up.url, /^\/media\/brand\/marca-icon-[a-f0-9]{12}\.png$/);
  assert.equal((await fetch(BASE + up.url)).status, 200);
  assert.equal((await call('x', 'GET', '/api/app/brand')).json.brand_logo, up.url);
  assert.equal((await call('admin', 'GET', '/api/admin/me')).json.brandLogo, up.url);
  await call('admin', 'PUT', '/api/admin/settings', { brand_logo: 'https://malicioso.example/x.png', brand_tagline: 'Escola Online' });
  const br = (await call('x', 'GET', '/api/app/brand')).json;
  assert.equal(br.brand_logo, up.url); assert.equal(br.brand_tagline, 'Escola Online');
  const bad = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>').toString('base64');
  assert.equal((await call('admin', 'POST', '/api/admin/settings/logo', { target: 'wide', data: bad })).status, 400);
  assert.equal((await call('admin', 'POST', '/api/admin/settings/logo', { target: 'outro', data: logoPng })).status, 400);
  assert.equal((await call('x', 'POST', '/api/admin/settings/logo', { target: 'icon', data: logoPng })).status, 401);
  assert.equal((await call('admin', 'DELETE', '/api/admin/settings/logo?target=icon')).status, 200);
  assert.equal((await call('x', 'GET', '/api/app/brand')).json.brand_logo, '');
  step('logo da plataforma: enviar, aplicar, bloquear SVG perigoso e remover');

  for (const p of ['/', '/login', '/admin', '/app.js', '/admin/admin.js', '/shared/calc.js', '/shared/player.js', '/shared/player.css', '/manifest.webmanifest', '/sw.js']) assert.equal((await fetch(BASE + p)).status, 200, p);
  step('arquivos do app e do painel');
  console.log('\nTodos os testes passaram.');
  process.exitCode = 0;
} catch (e) {
  console.error('\n✗ FALHOU:', e.message, '\n--- logs do servidor ---\n' + logs.slice(-3000));
  process.exitCode = 1;
} finally {
  srv.kill('SIGTERM');
  fs.rmSync(dataDir, { recursive: true, force: true });
}
