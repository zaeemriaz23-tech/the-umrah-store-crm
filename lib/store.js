'use strict';
/**
 * MySQL / MariaDB storage backend for the CRM.
 *
 * Layout (all tables are used by the application; nothing is created "just in case"):
 *   crm_schema_migrations  applied schema versions
 *   crm_head               one row = the last committed revision (optimistic-concurrency token)
 *   crm_kv                 settings and every other non-collection top-level value
 *   crm_sessions           login sessions
 *   crm_<entity>           one table per CRM collection: bookings, parties, payments, ledger entries, ...
 *                          typed/indexed columns for browsing + `doc` = the complete record as JSON (authoritative)
 *   crm_backups            gzip'd full-state snapshots written automatically
 */
const zlib = require('zlib');

const V = n => 'VARCHAR(' + n + ')';
// cols: [column, sqlType, getter, indexed?]  (indexed only when <= 190 chars: safe for every InnoDB row format)
const ENTITIES = [
  { key: 'users', table: 'crm_users', cols: [['login', V(190), r => r.login, 1], ['role', V(32), r => r.role], ['party_id', V(64), r => r.pid, 1]] },
  { key: 'parties', table: 'crm_parties', cols: [['kind', V(32), r => r.kind, 1], ['name', V(255), r => r.name], ['phone', V(64), r => r.phone]] },
  { key: 'bookings', table: 'crm_bookings', cols: [['booking_no', V(64), r => r.no, 1], ['party_id', V(64), r => r.partyId, 1], ['status', V(32), r => r.status, 1], ['category', V(64), r => r.category], ['travel_from', V(10), r => r.from], ['created_at', V(32), r => r.createdAt]] },
  { key: 'vouchers', table: 'crm_vouchers', cols: [['voucher_no', V(64), r => r.no, 1], ['token', V(64), r => r.token, 1], ['booking_id', V(64), r => r.bookingId || r.bid, 1]] },
  { key: 'payments', table: 'crm_payments', cols: [['party_id', V(64), r => r.partyId, 1], ['direction', V(8), r => r.dir], ['status', V(32), r => r.status, 1], ['amount', 'BIGINT', r => r.amt], ['pay_date', V(10), r => r.date], ['booking_id', V(64), r => r.bookingId, 1]] },
  { key: 'entries', table: 'crm_ledger_entries', cols: [['party_id', V(64), r => r.partyId, 1], ['entry_date', V(10), r => r.date], ['debit', 'BIGINT', r => r.dr], ['credit', 'BIGINT', r => r.cr]] },
  { key: 'expenses', table: 'crm_expenses', cols: [['category', V(64), r => r.cat], ['expense_date', V(10), r => r.date], ['amount', 'BIGINT', r => r.amt]] },
  { key: 'queries', table: 'crm_queries', cols: [['query_no', V(64), r => r.no, 1], ['status', V(32), r => r.status, 1], ['party_id', V(64), r => r.pid || r.partyId]] },
  { key: 'paylinks', table: 'crm_paylinks', cols: [['token', V(64), r => r.token, 1], ['party_id', V(64), r => r.partyId, 1], ['status', V(32), r => r.status], ['amount', 'BIGINT', r => r.amt]] },
  { key: 'groups', table: 'crm_groups', cols: [['departure', V(10), r => r.dep, 1], ['code', V(64), r => r.code]] },
  { key: 'hotels', table: 'crm_hotels', cols: [['name', V(255), r => r.name]] },
  { key: 'visaTiers', table: 'crm_visa_tiers', cols: [] },
  { key: 'tVehicles', table: 'crm_transport_vehicles', cols: [] },
  { key: 'tRoutes', table: 'crm_transport_routes', cols: [] },
  { key: 'tPrices', table: 'crm_transport_prices', cols: [] },
  { key: 'log', table: 'crm_activity_log', keyless: true, cols: [['logged_at', V(32), r => r.t], ['actor', V(120), r => r.u], ['action', V(190), r => r.a]] },
  { key: 'tickets', table: 'crm_tickets', cols: [['ticket_no', V(64), r => r.no, 1], ['party_id', V(64), r => r.pid, 1], ['status', V(32), r => r.status]] },
  { key: 'notifs', table: 'crm_notifications', cols: [['created_at', V(32), r => r.t], ['kind', V(32), r => r.kind]] },
  { key: 'audit', table: 'crm_audit_log', cols: [['created_at', V(32), r => r.t, 1], ['user_id', V(64), r => r.uid, 1], ['action', V(190), r => r.a, 1]] },
  { key: 'chats', table: 'crm_chats', cols: [['status', V(32), r => r.status], ['updated_at', V(32), r => r.updatedAt]] },
  { key: 'promos', table: 'crm_promotions', cols: [] },
  { key: 'signups', table: 'crm_signups', cols: [['ref', V(32), r => r.ref, 1], ['email', V(190), r => r.email, 1], ['status', V(32), r => r.status]] },
  { key: 'roles', table: 'crm_roles', cols: [['name', V(190), r => r.name]] },
  { key: 'departments', table: 'crm_departments', cols: [['name', V(190), r => r.name]] },
  { key: 'mailLog', table: 'crm_mail_log', keyless: true, cols: [['sent_at', V(32), r => r.t]] }
];
const ENTITY_KEYS = new Set(ENTITIES.map(e => e.key));
const NON_KV = new Set([...ENTITY_KEYS, 'sessions', 'rev']);

function coerce(type, v) {
  if (v === undefined || v === null || v === '') return null;
  if (type === 'BIGINT') { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; }
  const m = /VARCHAR\((\d+)\)/.exec(type);
  return String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, +m[1]);
}
const rowFor = (spec, key, ord, doc, rev) => [key, ord, ...spec.cols.map(c => coerce(c[1], c[2](JSON.parse(doc)))), doc, rev];
// cheaper variant when the live object is at hand
const rowForObj = (spec, key, ord, obj, doc, rev) => [key, ord, ...spec.cols.map(c => { try { return coerce(c[1], c[2](obj)); } catch { return null; } }), doc, rev];

const CHARSET = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC';

function entityDDL(spec) {
  const cols = spec.cols.map(c => '  `' + c[0] + '` ' + c[1] + ' NULL').join(',\n');
  const idx = spec.cols.filter(c => c[3]).map(c => '  KEY `idx_' + spec.table + '_' + c[0] + '` (`' + c[0] + '`)').join(',\n');
  return 'CREATE TABLE IF NOT EXISTS `' + spec.table + '` (\n  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,\n  `ord` BIGINT NOT NULL,\n' + (cols ? cols + ',\n' : '') +
    '  `doc` LONGTEXT NOT NULL,\n  `rev` BIGINT UNSIGNED NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `idx_' + spec.table + '_ord` (`ord`)' + (idx ? ',\n' + idx : '') + '\n) ' + CHARSET;
}

const MIGRATIONS = [{
  version: 1, name: 'initial schema',
  statements: () => [
    'CREATE TABLE IF NOT EXISTS crm_head (id TINYINT UNSIGNED NOT NULL PRIMARY KEY, revision BIGINT UNSIGNED NOT NULL, last_token VARCHAR(40) NOT NULL, writer VARCHAR(120) NOT NULL, app_version VARCHAR(20) NOT NULL, committed_at DATETIME(3) NOT NULL) ' + CHARSET,
    'CREATE TABLE IF NOT EXISTS crm_kv (k VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY, v LONGTEXT NOT NULL, rev BIGINT UNSIGNED NOT NULL) ' + CHARSET,
    'CREATE TABLE IF NOT EXISTS crm_sessions (sid VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY, user_id VARCHAR(64) NULL, expires_at BIGINT NULL, doc LONGTEXT NOT NULL, rev BIGINT UNSIGNED NOT NULL, KEY idx_crm_sessions_user (user_id), KEY idx_crm_sessions_exp (expires_at)) ' + CHARSET,
    'CREATE TABLE IF NOT EXISTS crm_backups (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, revision BIGINT UNSIGNED NOT NULL, reason VARCHAR(40) NOT NULL, raw_bytes INT UNSIGNED NOT NULL, payload LONGBLOB NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_crm_backups_created (created_at)) ' + CHARSET,
    ...ENTITIES.map(entityDDL)
  ]
}];
const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

function mysqlConfig(env = process.env) {
  const keys = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  if (!keys.some(k => env[k] !== undefined && env[k] !== '')) return { enabled: false };
  const missing = keys.filter(k => !env[k]);
  if (missing.length) throw new Error('MySQL configuration is incomplete. Missing: ' + missing.join(', '));
  const ssl = String(env.DB_SSL || '').toLowerCase();
  return {
    enabled: true, host: env.DB_HOST, port: Math.max(1, +(env.DB_PORT || 3306)), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
    ssl: ssl === 'insecure' ? { rejectUnauthorized: false } : /^(1|true|yes|on)$/.test(ssl) ? {} : undefined,
    poolSize: Math.max(2, +(env.DB_POOL_SIZE || 5))
  };
}

function createPool(cfg) {
  let mysql;
  try { mysql = require('mysql2/promise'); } catch { throw new Error('mysql2 is required for MySQL mode. Run npm install.'); }
  return mysql.createPool({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database, ssl: cfg.ssl,
    waitForConnections: true, connectionLimit: cfg.poolSize, queueLimit: 0, charset: 'utf8mb4', timezone: 'Z',
    connectTimeout: +(process.env.DB_CONNECT_TIMEOUT_MS || 8000), enableKeepAlive: true, keepAliveInitialDelay: 10000,
    maxIdle: Math.min(2, cfg.poolSize), idleTimeout: 30000, supportBigNumbers: true, bigNumberStrings: false
  });
}

async function migrate(pool) {
  const conn = await pool.getConnection();
  try {
    const [[lk]] = await conn.query("SELECT GET_LOCK('crm_schema_migrate', 60) AS l");
    if (!lk || +lk.l !== 1) throw new Error('Could not obtain the schema-migration lock (another instance is migrating).');
    try {
      await conn.query('CREATE TABLE IF NOT EXISTS crm_schema_migrations (version INT NOT NULL PRIMARY KEY, name VARCHAR(120) NOT NULL, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ' + CHARSET);
      const [rows] = await conn.query('SELECT version FROM crm_schema_migrations');
      const done = new Set(rows.map(r => +r.version)), applied = [];
      for (const m of MIGRATIONS) {
        if (done.has(m.version)) continue;
        for (const sql of m.statements()) await conn.query(sql);   // every statement is IF NOT EXISTS: safe to re-run after a crash
        await conn.query('INSERT INTO crm_schema_migrations (version, name) VALUES (?, ?)', [m.version, m.name]);
        applied.push(m.version);
      }
      return { applied, version: SCHEMA_VERSION };
    } finally { try { await conn.query("SELECT RELEASE_LOCK('crm_schema_migrate')"); } catch { /* connection may be gone */ } }
  } finally { conn.release(); }
}

async function loadHead(pool) {
  const [r] = await pool.query('SELECT revision, last_token, writer, app_version, committed_at FROM crm_head WHERE id = 1');
  return r.length ? { revision: +r[0].revision, token: r[0].last_token, writer: r[0].writer, committedAt: r[0].committed_at } : null;
}

async function loadAll(pool) {
  const out = { entities: {}, kv: [], sessions: [] };
  for (const spec of ENTITIES) {
    const [rows] = await pool.query('SELECT id, ord, doc FROM `' + spec.table + '` ORDER BY ord ASC, id ASC');
    out.entities[spec.key] = rows.map(r => ({ key: r.id, ord: +r.ord, s: r.doc }));
  }
  const [kv] = await pool.query('SELECT k, v FROM crm_kv'); out.kv = kv.map(r => ({ k: r.k, s: r.v }));
  const [ss] = await pool.query('SELECT sid, doc FROM crm_sessions'); out.sessions = ss.map(r => ({ sid: r.sid, s: r.doc }));
  return out;
}

/** legacy v3.10-v3.12 single-row store: read-only source for a one-time upgrade */
async function loadLegacyState(pool) {
  const [t] = await pool.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'crm_state'");
  if (!+t[0].n) return null;
  const [r] = await pool.query('SELECT revision, payload FROM crm_state WHERE id = 1');
  return r.length ? { revision: +r[0].revision, payload: r[0].payload } : null;
}

const chunkRows = (rows, maxBytes = +(process.env.DB_BATCH_BYTES || 2e6), maxRows = 400) => {
  const out = []; let cur = [], bytes = 0;
  for (const r of rows) { const b = (r[r.length - 2] || '').length + 200; if (cur.length && (bytes + b > maxBytes || cur.length >= maxRows)) { out.push(cur); cur = []; bytes = 0; } cur.push(r); bytes += b; }
  if (cur.length) out.push(cur);
  return out;
};

function codeOf(e) { return e && (e.code || e.errno); }
const conflict = m => Object.assign(new Error(m), { code: 'CRM_CONFLICT' });

/**
 * Commit one plan atomically. plan = { rev, token, truncate?, tables:[{spec, ups:[row], dels:[key]}], kv:{ups:[[k,v]],dels:[k]}, sess:{ups:[row],dels:[sid]} }
 * opts = { expectRev: number|null (null => first write, head row must not exist), writer, appVersion, timeoutMs }
 * Resolves { alreadyCommitted } ; throws CRM_CONFLICT when another writer changed the head.
 */
async function writePlan(pool, plan, opts) {
  const conn = await pool.getConnection();
  let timer, destroyed = false;
  const run = (async () => {
    await conn.beginTransaction();
    if (opts.expectRev === null) {
      try { await conn.query('INSERT INTO crm_head (id, revision, last_token, writer, app_version, committed_at) VALUES (1, ?, ?, ?, ?, NOW(3))', [plan.rev, plan.token, opts.writer, opts.appVersion]); }
      catch (e) { if (codeOf(e) === 'ER_DUP_ENTRY' || codeOf(e) === 1062) throw conflict('Another process initialised the database first.'); throw e; }
    } else {
      const [h] = await conn.query('SELECT revision, last_token FROM crm_head WHERE id = 1 FOR UPDATE');
      if (!h.length) throw conflict('crm_head row is missing.');
      if (+h[0].revision === plan.rev && h[0].last_token === plan.token) { await conn.rollback(); return { alreadyCommitted: true }; }
      if (+h[0].revision !== opts.expectRev) throw conflict('The database is at revision ' + h[0].revision + ' but this process expected ' + opts.expectRev + ' (another instance wrote to it).');
    }
    if (plan.truncate) { for (const spec of ENTITIES) await conn.query('DELETE FROM `' + spec.table + '`'); await conn.query('DELETE FROM crm_kv'); await conn.query('DELETE FROM crm_sessions'); }
    for (const t of plan.tables) {
      const cols = ['id', 'ord', ...t.spec.cols.map(c => c[0]), 'doc', 'rev'];
      const upd = cols.slice(1).map(c => '`' + c + '` = VALUES(`' + c + '`)').join(', ');
      for (const part of chunkRows(t.ups)) await conn.query('INSERT INTO `' + t.spec.table + '` (' + cols.map(c => '`' + c + '`').join(', ') + ') VALUES ? ON DUPLICATE KEY UPDATE ' + upd, [part]);
      for (let i = 0; i < t.dels.length; i += 500) await conn.query('DELETE FROM `' + t.spec.table + '` WHERE id IN (?)', [t.dels.slice(i, i + 500)]);
    }
    for (const part of chunkRows(plan.kv.ups.map(([k, v]) => [k, v, plan.rev]), undefined, 200))
      await conn.query('INSERT INTO crm_kv (k, v, rev) VALUES ? ON DUPLICATE KEY UPDATE v = VALUES(v), rev = VALUES(rev)', [part]);
    if (plan.kv.dels.length) await conn.query('DELETE FROM crm_kv WHERE k IN (?)', [plan.kv.dels]);
    for (const part of chunkRows(plan.sess.ups)) await conn.query('INSERT INTO crm_sessions (sid, user_id, expires_at, doc, rev) VALUES ? ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), expires_at = VALUES(expires_at), doc = VALUES(doc), rev = VALUES(rev)', [part]);
    for (let i = 0; i < plan.sess.dels.length; i += 500) await conn.query('DELETE FROM crm_sessions WHERE sid IN (?)', [plan.sess.dels.slice(i, i + 500)]);
    if (opts.expectRev !== null) {
      const [u] = await conn.query('UPDATE crm_head SET revision = ?, last_token = ?, writer = ?, app_version = ?, committed_at = NOW(3) WHERE id = 1 AND revision = ?', [plan.rev, plan.token, opts.writer, opts.appVersion, opts.expectRev]);
      if (!u.affectedRows) throw conflict('Head revision changed during the transaction.');
    }
    await conn.commit();
    return { alreadyCommitted: false };
  })();
  run.catch(() => {});
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => { destroyed = true; try { conn.destroy(); } catch { /* ignore */ } rej(Object.assign(new Error('MySQL write timed out after ' + opts.timeoutMs + ' ms'), { code: 'CRM_TIMEOUT' })); }, opts.timeoutMs); });
  try { return await Promise.race([run, timeout]); }
  catch (e) { if (!destroyed) { try { await conn.rollback(); } catch { /* connection already broken */ } } throw e; }
  finally { clearTimeout(timer); if (!destroyed) { try { conn.release(); } catch { /* ignore */ } } }
}

const gz = s => zlib.gzipSync(Buffer.from(s, 'utf8'), { level: 6 });
const gunzip = b => zlib.gunzipSync(b).toString('utf8');

async function insertBackup(pool, revision, reason, json, keep) {
  const raw = Buffer.byteLength(json);
  await pool.query('INSERT INTO crm_backups (revision, reason, raw_bytes, payload) VALUES (?, ?, ?, ?)', [revision, reason, raw, gz(json)]);
  await pool.query('DELETE FROM crm_backups WHERE id NOT IN (SELECT id FROM (SELECT id FROM crm_backups ORDER BY id DESC LIMIT ?) k)', [keep]);
}
async function listBackups(pool) {
  const [r] = await pool.query('SELECT id, revision, reason, raw_bytes, created_at FROM crm_backups ORDER BY id DESC');
  return r.map(x => ({ id: +x.id, revision: +x.revision, reason: x.reason, bytes: +x.raw_bytes, createdAt: x.created_at }));
}
async function readBackup(pool, id) {
  const [r] = await pool.query('SELECT payload FROM crm_backups WHERE id = ?', [id]);
  if (!r.length) throw new Error('Backup #' + id + ' not found');
  return gunzip(r[0].payload);
}
async function lastBackupTime(pool) { const [r] = await pool.query('SELECT UNIX_TIMESTAMP(MAX(created_at)) * 1000 AS t FROM crm_backups'); return r[0] && r[0].t ? +r[0].t : 0; }

module.exports = { ENTITIES, ENTITY_KEYS, NON_KV, SCHEMA_VERSION, mysqlConfig, createPool, migrate, loadHead, loadAll, loadLegacyState, writePlan, rowForObj, rowFor, insertBackup, listBackups, readBackup, lastBackupTime, codeOf };
