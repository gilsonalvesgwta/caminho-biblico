// Uso: npm run create-admin -- email@dominio.com "Senha Forte" "Nome" [owner|admin|support|viewer]
import { db, migrate, now } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
migrate();
const [email, password, name = 'Administrador', role = 'owner'] = process.argv.slice(2);
if (!email || !password || password.length < 8) { console.error('Uso: npm run create-admin -- email senha(8+) "Nome" [owner|admin|support|viewer]'); process.exit(1); }
const ex = db.get('SELECT id FROM admins WHERE email = ?', email.toLowerCase());
if (ex) { db.run('UPDATE admins SET password_hash = ?, role = ?, active = 1 WHERE id = ?', hashPassword(password), role, ex.id); console.log('Senha e papel atualizados para', email); }
else { db.run('INSERT INTO admins (name, email, password_hash, role, created_at) VALUES (?,?,?,?,?)', name, email.toLowerCase(), hashPassword(password), role, now()); console.log('Administrador criado:', email, `(${role})`); }
