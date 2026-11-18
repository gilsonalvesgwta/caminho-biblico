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
