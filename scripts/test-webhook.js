// Envia um evento no formato da Greenn para a sua instalação.
// Uso: npm run test-webhook -- <URL_DO_WEBHOOK> <ID_PRODUTO_GREENN> <email> [paid|refunded|chargedback|waiting_payment]
const [url, productId, email, status = 'paid'] = process.argv.slice(2);
if (!url || !productId || !email) { console.error('Uso: npm run test-webhook -- URL ID_PRODUTO email [status]'); process.exit(1); }
const payload = {
  type: 'sale', event: 'saleUpdated', oldStatus: 'waiting_payment', currentStatus: status,
  product: { id: Number(productId), name: 'Teste via script', amount: 97 },
  sale: { id: 'CLI-' + Date.now(), status, amount: 97, method: 'PIX', installments: 1 },
  client: { name: 'Teste Script', email, cellphone: '+5511999999999', cpf_cnpj: '' }, saleMetas: [],
};
const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
console.log(r.status, await r.text());
