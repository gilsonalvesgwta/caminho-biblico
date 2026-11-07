import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { config } from './config.js';

const file = path.join(config.dataDir, 'app.db');
const raw = new DatabaseSync(file);
raw.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

const cache = new Map();
function stmt(sql) {
  let s = cache.get(sql);
  if (!s) { s = raw.prepare(sql); cache.set(sql, s); }
  return s;
}
const clean = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export const db = {
  file,
  raw,
  get: (sql, ...p) => stmt(sql).get(...clean(p)),
  all: (sql, ...p) => stmt(sql).all(...clean(p)),
  run: (sql, ...p) => stmt(sql).run(...clean(p)),
  exec: (sql) => raw.exec(sql),
  tx(fn) {
    raw.exec('BEGIN IMMEDIATE');
    try { const r = fn(); raw.exec('COMMIT'); return r; }
    catch (e) { raw.exec('ROLLBACK'); throw e; }
  },
};

export const now = () => new Date().toISOString();

const migrations = [
  // 1 — schema base
  `
  CREATE TABLE admins (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner','admin','support','viewer')),
    active INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT,
    document TEXT,
    password_hash TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
    greenn_client_id TEXT,
    notes TEXT,
    last_login_at TEXT,
    last_seen_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'challenge' CHECK (kind IN ('challenge','course','bonus')),
    tagline TEXT,
    description TEXT,
    greenn_ids TEXT NOT NULL DEFAULT '',
    release_mode TEXT NOT NULL DEFAULT 'after_complete' CHECK (release_mode IN ('after_complete','drip','sequential','open')),
    release_delay_hours INTEGER NOT NULL DEFAULT 24,
    access_days INTEGER,
    materials TEXT NOT NULL DEFAULT '[]',
    position INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE lessons (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    block TEXT,
    title TEXT NOT NULL,
    subtitle TEXT,
    objective TEXT,
    video_url TEXT,
    video_duration TEXT,
    practice_video_url TEXT,
    practice_duration TEXT,
    key_phrases TEXT NOT NULL DEFAULT '[]',
    verses TEXT NOT NULL DEFAULT '[]',
    body TEXT,
    activity_key TEXT,
    release_offset INTEGER NOT NULL DEFAULT 0,
    release_message TEXT,
    tomorrow TEXT,
    published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (product_id, number)
  );

  CREATE TABLE enrollments (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('active','refunded','chargedback','canceled','suspended','expired')),
    source TEXT NOT NULL DEFAULT 'greenn',
    sale_ref TEXT,
    started_at TEXT NOT NULL,
    expires_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, product_id)
  );

  CREATE TABLE sales (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'greenn',
    sale_id TEXT NOT NULL,
    provider_product_id TEXT NOT NULL,
    product_name TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    email TEXT,
    status TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    method TEXT,
    installments INTEGER,
    coupon TEXT,
    kind TEXT NOT NULL DEFAULT 'sale',
    utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (provider, sale_id, provider_product_id)
  );

  CREATE TABLE webhook_events (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    event TEXT,
    status_hint TEXT,
    email TEXT,
    payload TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'received',
    message TEXT,
    ip TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    received_at TEXT NOT NULL,
    processed_at TEXT
  );

  CREATE TABLE leads (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT, phone TEXT,
    provider_product_id TEXT,
    source TEXT NOT NULL DEFAULT 'checkout_abandoned',
    converted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    watched_at TEXT,
    practice_watched_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, lesson_id)
  );

  CREATE TABLE answers (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    day INTEGER NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, product_id, day)
  );

  CREATE TABLE summaries (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    days_completed INTEGER NOT NULL DEFAULT 0,
    fase INTEGER,
    renda REAL, sobra_real REAL, divida_total REAL, dividas_atraso INTEGER,
    guardado REAL, patrimonio REAL, direcionar REAL,
    paz_d1 REAL, paz_d7 REAL, mordomia_d4 REAL, mordomia_d7 REAL,
    imovel_proprio TEXT, mora TEXT, pais TEXT, estado_civil TEXT, filhos INTEGER,
    sonho_imovel TEXT, live_optin TEXT, whatsapp TEXT,
    share_consent TEXT, has_message INTEGER NOT NULL DEFAULT 0,
    lead_score INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, product_id)
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('user','admin')),
    subject_id INTEGER NOT NULL,
    ip TEXT, ua TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    ref TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT 'email',
    status TEXT NOT NULL DEFAULT 'sent',
    error TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, kind, ref, channel)
  );

  CREATE TABLE outbox (
    id INTEGER PRIMARY KEY,
    event TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    admin_id INTEGER,
    action TEXT NOT NULL,
    target TEXT,
    meta TEXT,
    ip TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX idx_enr_user ON enrollments(user_id);
  CREATE INDEX idx_sales_created ON sales(created_at);
  CREATE INDEX idx_sales_email ON sales(email);
  CREATE INDEX idx_wh_received ON webhook_events(received_at);
  CREATE INDEX idx_progress_lesson ON progress(lesson_id);
  CREATE INDEX idx_summ_score ON summaries(lead_score);
  CREATE INDEX idx_outbox ON outbox(status, next_attempt_at);
  CREATE INDEX idx_sessions_exp ON sessions(expires_at);
  `,
  // 2 — nome e telefone do comprador na própria venda (aparecem antes do pagamento)
  `
  ALTER TABLE sales ADD COLUMN client_name TEXT;
  ALTER TABLE sales ADD COLUMN client_phone TEXT;
  UPDATE sales SET client_name = (SELECT json_extract(w.payload, '$.client.name') FROM webhook_events w WHERE json_extract(w.payload, '$.sale.id') = sales.sale_id ORDER BY w.id DESC LIMIT 1),
                   client_phone = (SELECT json_extract(w.payload, '$.client.cellphone') FROM webhook_events w WHERE json_extract(w.payload, '$.sale.id') = sales.sale_id ORDER BY w.id DESC LIMIT 1);
  `,
  // 3 — capas personalizadas dos vídeos
  `
  ALTER TABLE lessons ADD COLUMN cover_url TEXT;
  ALTER TABLE lessons ADD COLUMN practice_cover_url TEXT;
  `,
];

export function migrate() {
  raw.exec('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const cur = raw.prepare('SELECT COALESCE(MAX(version),0) v FROM _migrations').get().v;
  for (let i = cur; i < migrations.length; i++) {
    db.tx(() => {
      raw.exec(migrations[i]);
      raw.prepare('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)').run(i + 1, now());
    });
    console.log(`[db] migração ${i + 1} aplicada`);
  }
}

// ---------- settings ----------
export const SETTING_DEFAULTS = {
  brand_name: 'O Caminho Bíblico do Dinheiro',
  brand_short: 'Caminho Bíblico',
  mentor_name: 'Rhus Moreira',
  support_email: '',
  support_whatsapp: '',
  greenn_webhook_token: '',
  email_provider: 'log', // log | resend | brevo | smtp
  email_from_name: 'O Caminho Bíblico do Dinheiro',
  email_from_address: '',
  resend_api_key: '',
  brevo_api_key: '',
  smtp_host: '', smtp_port: '465', smtp_user: '', smtp_pass: '', smtp_secure: 'true',
  outbound_webhook_url: '',
  outbound_webhook_secret: '',
  live_enabled: 'true',
  live_title: 'Aula ao vivo: do princípio ao patrimônio',
  live_weekday: '4', // 0=dom ... 4=qui
  live_time: '20:00',
  live_url: '',
  live_description: 'Como construir patrimônio usando o crédito de forma inteligente: autoquitação, aumento de aporte e acompanhamento especializado.',
  phase_reserve_months: '6',
  phase3_patrimony: '100000',
  phase3_patrimony_foreign: '20000',
  tithe_percent: '10',
  guide_url: '',
  release_hour: '6',
  release_emails: 'true',
};
const SECRET_KEYS = new Set(['greenn_webhook_token', 'resend_api_key', 'brevo_api_key', 'smtp_pass', 'outbound_webhook_secret']);

export function getSettings({ maskSecrets = false } = {}) {
  const rows = db.all('SELECT key, value FROM settings');
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  if (maskSecrets) for (const k of SECRET_KEYS) if (out[k]) out[k] = '••••••' + String(out[k]).slice(-4);
  return out;
}
export const getSetting = (k) => db.get('SELECT value FROM settings WHERE key = ?', k)?.value ?? SETTING_DEFAULTS[k];
export function setSettings(obj) {
  db.tx(() => {
    for (const [k, v] of Object.entries(obj)) {
      if (!(k in SETTING_DEFAULTS)) continue;
      if (SECRET_KEYS.has(k) && typeof v === 'string' && v.startsWith('••••••')) continue; // não sobrescreve máscara
      db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, v == null ? '' : String(v));
    }
  });
}
