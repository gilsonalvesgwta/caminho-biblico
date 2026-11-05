// Backup a quente e consistente do SQLite. Mantém os últimos N arquivos (padrão 14).
import { backup } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';
import { config } from '../src/config.js';
const dir = path.resolve(process.env.BACKUP_DIR || path.join(config.dataDir, 'backups'));
const keep = Number(process.env.BACKUP_KEEP || 14);
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `app-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`);
await backup(db.raw, file);
const all = fs.readdirSync(dir).filter((f) => f.startsWith('app-') && f.endsWith('.db')).sort();
for (const f of all.slice(0, Math.max(0, all.length - keep))) fs.unlinkSync(path.join(dir, f));
console.log('Backup salvo em', file);
