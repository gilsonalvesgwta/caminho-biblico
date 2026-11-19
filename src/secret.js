// Criptografia de credenciais (token da Meta) com AES-256-GCM. A chave fica no volume de dados, fora do banco e dos backups do banco.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

let key = null;
function getKey() {
  if (key) return key;
  if (process.env.APP_SECRET) return (key = crypto.createHash('sha256').update(process.env.APP_SECRET).digest());
  const f = path.join(config.dataDir, '.secret-key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  return (key = Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'base64'));
}
export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}
export function decrypt(blob) {
  if (!blob) return '';
  const [v, iv, tag, data] = String(blob).split(':');
  if (v !== 'v1') return '';
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch { return ''; }
}
