// Evolution API (v2) simulada para testes: chave global, instâncias, QR code e envio de texto.
// Número terminado em 0000 = "não tem WhatsApp". Uso direto: node scripts/fake-evolution.js 4998
import http from 'node:http';

export const EVO_KEY = 'evo-chave-teste-123';
export function startFakeEvolution(port) {
  const sent = [];
  const instances = [{ name: 'crmwta-principal', connectionStatus: 'open', ownerJid: '5551999990000@s.whatsapp.net', profileName: 'WTA' }];
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.headers.apikey !== EVO_KEY) return send(401, { status: 401, error: 'Unauthorized', response: { message: 'Unauthorized' } });
      const u = new URL(req.url, 'http://x'); const body = raw ? JSON.parse(raw) : {};
      let m;
      if (req.method === 'GET' && u.pathname === '/instance/fetchInstances') return send(200, instances);
      if ((m = u.pathname.match(/^\/instance\/connectionState\/(.+)$/))) { const i = instances.find((x) => x.name === decodeURIComponent(m[1])); return i ? send(200, { instance: { instanceName: i.name, state: i.connectionStatus } }) : send(404, { response: { message: ['instância não existe'] } }); }
      if (req.method === 'POST' && u.pathname === '/instance/create') { instances.push({ name: body.instanceName, connectionStatus: 'connecting' }); return send(201, { instance: { instanceName: body.instanceName }, qrcode: { base64: 'data:image/png;base64,iVBORw0KGgo=', pairingCode: 'ABCD-EFGH' } }); }
      if ((m = u.pathname.match(/^\/instance\/connect\/(.+)$/))) return send(200, { base64: 'data:image/png;base64,iVBORw0KGgo=', pairingCode: 'ABCD-EFGH' });
      if ((m = u.pathname.match(/^\/message\/sendText\/(.+)$/))) {
        if (/0000$/.test(body.number)) return send(400, { status: 400, error: 'Bad Request', response: { message: [{ exists: false, jid: `${body.number}@s.whatsapp.net`, number: body.number }] } });
        sent.push({ instance: decodeURIComponent(m[1]), number: body.number, text: body.text });
        return send(201, { key: { remoteJid: `${body.number}@s.whatsapp.net`, fromMe: true, id: `MSG${sent.length}` }, status: 'PENDING' });
      }
      send(404, { response: { message: ['rota desconhecida'] } });
    });
  });
  srv.listen(port, '127.0.0.1');
  return { srv, sent, instances };
}
if (process.argv[1] && process.argv[1].endsWith('fake-evolution.js')) { startFakeEvolution(Number(process.argv[2] || 4998)); console.log('Evolution simulada no ar'); }
