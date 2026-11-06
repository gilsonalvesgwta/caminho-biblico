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

  const bk = (await call('admin', 'POST', '/api/admin/backups')).json;
  assert.ok(bk.ok && bk.name);
  const lista = (await call('admin', 'GET', '/api/admin/backups')).json.rows;
  assert.equal(lista[0].name, bk.name);
  const dl = await fetch(BASE + '/api/admin/backups/' + bk.name, { headers: { cookie: jar.admin } });
  assert.equal(dl.status, 200); assert.ok((await dl.arrayBuffer()).byteLength > 10000);
  assert.equal((await call('x', 'GET', '/api/admin/backups/' + bk.name)).status, 401);
  step('backup: criar, listar e baixar (só administrador)');

  for (const p of ['/', '/login', '/admin', '/app.js', '/admin/admin.js', '/shared/calc.js', '/manifest.webmanifest', '/sw.js']) assert.equal((await fetch(BASE + p)).status, 200, p);
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
