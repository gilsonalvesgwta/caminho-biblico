import fs from 'node:fs';
import path from 'node:path';
import { backup } from 'node:sqlite';
import { db, now } from './db.js';
import { config } from './config.js';

export const backupDir = () => path.join(config.dataDir, 'backups');
const KEEP = Number(process.env.BACKUP_KEEP || 14);

/** Cópia consistente do banco, mesmo com o sistema em uso. Mantém as últimas N. */
export async function makeBackup(tag = 'auto') {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date(Date.now() + config.tzOffsetMinutes * 60e3).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(dir, `app-${stamp}-${tag}.db`);
  await backup(db.raw, file);
  const all = listBackups();
  for (const b of all.slice(KEEP)) fs.unlinkSync(path.join(dir, b.name));
  return file;
}

export function listBackups() {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.startsWith('app-') && f.endsWith('.db'))
    .map((name) => { const st = fs.statSync(path.join(dir, name)); return { name, size: st.size, created_at: st.mtime.toISOString() }; })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Uma vez por dia, a partir das 3h (Brasília). */
export async function dailyBackupIfDue() {
  const local = new Date(Date.now() + config.tzOffsetMinutes * 60e3);
  if (local.getUTCHours() < 3) return null;
  const today = local.toISOString().slice(0, 10);
  if (db.get("SELECT value FROM settings WHERE key = '_last_backup_day'")?.value === today) return null;
  const file = await makeBackup('auto');
  db.run("INSERT INTO settings (key, value) VALUES ('_last_backup_day', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", today);
  db.run("INSERT INTO settings (key, value) VALUES ('_last_backup_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", now());
  console.log('[backup] cópia diária:', path.basename(file));
  return file;
}
