'use strict';
/**
 * Shared CRM state store. MySQL is primary when DB_* is configured; DATA_DIR/db.json is an atomic recovery snapshot.
 * v3 schema. Older v2 databases are migrated automatically on first start.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
for (const d of ['receipts', 'brand', 'backups']) fs.mkdirSync(path.join(DATA, d), { recursive: true });
const DBF = path.join(DATA, 'db.json');
const DEFAULT_ADMIN_PASSWORD = 'Zaeem@1212';

const hash = (p, s = crypto.randomBytes(16).toString('hex')) => s + ':' + crypto.scryptSync(p, s, 32).toString('hex');
const check = (p, h) => {
  try { const [s, x] = String(h).split(':'); return crypto.timingSafeEqual(Buffer.from(x, 'hex'), crypto.scryptSync(p, s, 32)); }
  catch { return false; }
};

const defaultSettings = () => ({
  company: { name: 'The Umrah Store', tagline: 'Premium Islamic Travel', phone: '+92 313 693 5568', whatsapp: '+92 313 693 5568', email: 'info@theumrahstore.com', address: 'Branches: Lahore · Okara · Islamabad', branches: 'Lahore, Okara, Islamabad', website: '', ntn: '', licence: '', footer: '', terms: '' },
  bank: [],
  categories: ['Long Stay', 'Short Stay', 'Visa Only', 'Accommodation Only', 'Meezab Group', 'QFC', 'Group Package', 'Custom'],
  expenseCats: ['Salaries', 'Rent', 'Utilities', 'Marketing', 'Software & Subscriptions', 'Office', 'Travel', 'Bank Charges', 'Other'],
  sla: { flight: 2, hotel: 6, visa: 24, transport: 12, package: 24, other: 24 },
  prefix: 'TUS', markupPct: 0, groupCostPct: 95, staffCanApprove: false, tz: 'Asia/Karachi',
  payfast: { merchantId: '', merchantName: '', securedKey: '', env: 'sandbox', storeId: '' },
  serpapiKey: '', baseUrl: '',
  groq: { apiKey: '', model: 'openai/gpt-oss-120b', temperature: 0.2, enabled: true, allowWrites: true, maxActions: 10, instructions: '' },
  payments: { minAmount: 1, requireReceipt: false, requireRef: false, autoApproveUnder: 0, agentCanRecord: true, publicBankPage: true, instructions: '', methods: ['Bank transfer', 'Cash', 'Cheque', 'Online banking / Raast', 'JazzCash / Easypaisa', 'Other'], quickAmounts: [50000, 100000, 250000, 500000] },
  security: { sessionDays: 7, minPassword: 8, loginMax: 10 },
  calc: { pkrPerSar: 0, flightPkr: 0, terms: '', tTerms: '', publicPrices: false, publicLeads: true, rateUpdated: '' }
});

let db, fresh = false, localParseError = null;
try { db = JSON.parse(fs.readFileSync(DBF, 'utf8')); }
catch (e) { fresh = !fs.existsSync(DBF); if (!fresh) localParseError = e; db = null; }

function blank() {
  return { v: 3, rev: 1, seq: 1000, users: [], parties: [], bookings: [], vouchers: [], payments: [], entries: [], expenses: [],
    queries: [], paylinks: [], groups: [], hotels: [], visaTiers: [], tVehicles: [], tRoutes: [], tPrices: [], log: [], sessions: {}, settings: defaultSettings() };
}

/* ---------- v2 -> v3 ---------- */
function migrateV2(o) {
  const n = blank();
  n.seq = o.seq || 1000; n.users = o.users || []; n.groups = o.groups || []; n.log = o.log || [];
  n.settings.company = { ...n.settings.company, ...(o.company || {}) };
  if (o.margin && o.margin.t === '%') n.settings.markupPct = +o.margin.v || 0;
  const mk = (a, kind) => ({ id: a.id, kind, name: a.name, phone: a.phone || '', email: a.email || '', city: a.city || '', address: '', notes: a.notes || '', limit: a.limit || 0, opening: 0, active: true, created: '' });
  n.parties = [...(o.agents || []).map(a => mk(a, 'agent')), ...(o.suppliers || []).map(s => mk(s, 'supplier'))];
  n.users.forEach(u => { if (u.aid) { u.pid = u.aid; delete u.aid; } });
  n.payments = (o.payments || []).map(p => { const { pt, pid, ...r } = p; return { ...r, dir: pt === 'agent' ? 'in' : 'out', partyId: pid, via: 'manual' }; });
  n.entries = (o.entries || []).map(e => { const { pt, pid, ...r } = e; return { ...r, partyId: pid }; });
  n.bookings = (o.bookings || []).map(b => ({
    id: b.id, no: makeNo(n, new Set()), partyId: b.agent, category: 'Group Package', status: b.status, pax: (b.px || []).map(x => ({ n: x.n, pp: x.pp, dob: '', nat: '', g: x.g, t: x.t })),
    services: [{ id: 's1', type: 'package', title: 'Umrah group package ' + (b.gid || ''), supId: b.sup || null, qty: b.pax, sell: b.price, cost: Math.round(b.cost || 0), conf: '', cs: 'Requested', from: b.dep, to: b.ret,
      d: { code: b.code, airline: b.airline, out: b.out, inb: b.inb, makkah: b.mk, madinah: b.md, mkn: b.mkn, mdn: b.mdn, mkd: b.mkd, mdd: b.mdd, room: b.room } }],
    from: b.dep, to: b.ret, notes: b.notes || '', internal: '', created: b.created, createdAt: (b.created || '') + 'T00:00:00.000Z', by: b.by, cdate: b.cdate, history: [] }));
  return n;
}

function makeNo(d, taken) {
  const A = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ', pre = (d.settings && d.settings.prefix) || 'TUS';
  for (;;) {
    const r = crypto.randomBytes(8), s = Array.from(r, x => A[x % A.length]).join('');
    const no = pre + '-' + s.slice(0, 4) + '-' + s.slice(4);
    if (/\d/.test(s) && /[A-Z]/.test(s) && !taken.has(no)) { taken.add(no); return no; }
  }
}

function normalizeState(input) {
  let o = input;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('CRM database document is not a JSON object');
  if (!o.v || o.v < 3) o = migrateV2(o);
  const dflt = defaultSettings();
  o.settings = { ...dflt, ...(o.settings || {}), company: { ...dflt.company, ...((o.settings || {}).company || {}) }, sla: { ...dflt.sla, ...((o.settings || {}).sla || {}) }, payfast: { ...dflt.payfast, ...((o.settings || {}).payfast || {}) }, calc: { ...dflt.calc, ...((o.settings || {}).calc || {}) }, groq: { ...dflt.groq, ...((o.settings || {}).groq || {}) }, payments: { ...dflt.payments, ...((o.settings || {}).payments || {}) }, security: { ...dflt.security, ...((o.settings || {}).security || {}) } };
  delete o.settings.anthropicKey;
  if (!o.settings.contactV) { Object.assign(o.settings.company, { phone: '+92 313 693 5568', whatsapp: '+92 313 693 5568', email: 'info@theumrahstore.com', address: 'Branches: Lahore · Okara · Islamabad', branches: 'Lahore, Okara, Islamabad' }); o.settings.contactV = 1; }
  ['users', 'parties', 'bookings', 'vouchers', 'payments', 'entries', 'expenses', 'queries', 'paylinks', 'groups', 'hotels', 'visaTiers', 'tVehicles', 'tRoutes', 'tPrices', 'log', 'tickets', 'notifs', 'audit'].forEach(k => { if (!Array.isArray(o[k])) o[k] = []; });
  o.sessions = o.sessions && typeof o.sessions === 'object' && !Array.isArray(o.sessions) ? o.sessions : {};
  o.seq = Number.isFinite(+o.seq) ? +o.seq : 1000;
  o.rev = Number.isFinite(+o.rev) && +o.rev > 0 ? +o.rev : 1;
  o.v = 3;
  return o;
}

function replaceState(next) {
  if (next === db) return;
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, next);
}

function ensureAdmin() {
  let a = db.users.find(u => u.id === 'admin');
  const pw = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  if (!a) { db.users.unshift({ id: 'admin', role: 'admin', name: 'Administrator', login: 'admin', pw: hash(pw), mustChange: !process.env.ADMIN_PASSWORD }); return true; }
  if (process.env.RESET_ADMIN === '1') { a.pw = hash(pw); a.mustChange = !process.env.ADMIN_PASSWORD; return true; }
  return false;
}

/* ---------- persistence: JSON recovery snapshot + optional MySQL primary store ---------- */
let timer = null, dirty = false, lastBackup = 0;
let pool = null, mysqlEnabled = false, initialized = false, mysqlQueue = Promise.resolve();
let mysqlRevision = 0, persistedRevision = 0, mysqlLastError = '', mysqlLastWriteAt = '', mysqlLastPingAt = 0;
const BACKUP_INTERVAL_MS = Math.max(60 * 60 * 1000, +(process.env.DB_BACKUP_INTERVAL_MS || 6 * 60 * 60 * 1000));
const BACKUP_KEEP = Math.max(5, Math.min(120, +(process.env.DB_BACKUP_KEEP || 30)));

function mysqlConfig() {
  const keys = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const supplied = keys.some(k => process.env[k] !== undefined && process.env[k] !== '');
  if (!supplied) return { enabled: false };
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) throw new Error('MySQL configuration is incomplete. Missing: ' + missing.join(', '));
  return { enabled: true, host: process.env.DB_HOST, port: Math.max(1, +(process.env.DB_PORT || 3306)), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: /^(1|true|yes)$/i.test(process.env.DB_SSL || '') };
}

function writeLocalSnapshot(json) {
  const tmp = DBF + '.tmp';
  fs.writeFileSync(tmp, json, { mode: 0o600 });
  fs.renameSync(tmp, DBF);
  if (Date.now() - lastBackup > 864e5) {
    lastBackup = Date.now();
    try {
      fs.copyFileSync(DBF, path.join(DATA, 'backups', 'db-' + new Date().toISOString().slice(0, 10) + '.json'));
      const fl = fs.readdirSync(path.join(DATA, 'backups')).filter(f => /^db-.*\.json$/.test(f)).sort();
      fl.slice(0, Math.max(0, fl.length - 14)).forEach(f => fs.unlinkSync(path.join(DATA, 'backups', f)));
    } catch (e) { console.warn('Local backup warning:', e.message); }
  }
}

async function createMysqlSchema(conn) {
  await conn.query(`CREATE TABLE IF NOT EXISTS crm_state (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    revision BIGINT UNSIGNED NOT NULL,
    payload LONGTEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await conn.query(`CREATE TABLE IF NOT EXISTS crm_state_backups (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    revision BIGINT UNSIGNED NOT NULL,
    payload LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crm_state_backups_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function mysqlWriteSnapshot(json, revision) {
  if (!pool) return;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT revision, payload, updated_at FROM crm_state WHERE id = 1 FOR UPDATE');
    if (!rows.length) {
      await conn.execute('INSERT INTO crm_state (id, revision, payload) VALUES (1, ?, ?)', [revision, json]);
      await conn.execute('INSERT INTO crm_state_backups (revision, payload) VALUES (?, ?)', [revision, json]);
    } else {
      const current = Number(rows[0].revision || 0);
      if (current > revision) throw new Error('MySQL revision is newer than this CRM process. Refusing to overwrite newer data.');
      if (current === revision && rows[0].payload !== json) {
        let same = false;
        try { same = JSON.stringify(JSON.parse(rows[0].payload)) === json; } catch {}
        if (!same) throw new Error('Concurrent CRM write conflict at revision ' + revision + '. Refusing to overwrite another running process.');
      }
      if (current < revision) {
        const backupDue = !rows[0].updated_at || (Date.now() - new Date(rows[0].updated_at).getTime()) >= BACKUP_INTERVAL_MS;
        if (backupDue) await conn.execute('INSERT INTO crm_state_backups (revision, payload) VALUES (?, ?)', [current, rows[0].payload]);
        await conn.execute('UPDATE crm_state SET revision = ?, payload = ? WHERE id = 1', [revision, json]);
      }
    }
    await conn.commit();
    mysqlRevision = Math.max(mysqlRevision, revision);
    persistedRevision = Math.max(persistedRevision, revision);
    mysqlLastError = ''; mysqlLastWriteAt = new Date().toISOString();
    await conn.query('DELETE FROM crm_state_backups WHERE id NOT IN (SELECT id FROM (SELECT id FROM crm_state_backups ORDER BY id DESC LIMIT ?) keep_rows)', [BACKUP_KEEP]);
  } catch (e) {
    try { await conn.rollback(); } catch {}
    mysqlLastError = e.message;
    throw e;
  } finally { conn.release(); }
}

function queueMysqlSnapshot(json, revision) {
  if (!pool) return mysqlQueue;
  mysqlQueue = mysqlQueue.then(() => mysqlWriteSnapshot(json, revision)).catch(e => {
    mysqlLastError = e.message;
    console.error('MySQL persistence failed:', e.message);
  });
  return mysqlQueue;
}

function writeNow() {
  if (!dirty) return;
  dirty = false;
  const json = JSON.stringify(db), revision = Number(db.rev || 1);
  writeLocalSnapshot(json);
  if (pool) queueMysqlSnapshot(json, revision);
}

const hooks = []; let inHook = false;
function save() {
  if (!inHook) { inHook = true; try { hooks.forEach(h => h()); } catch (e) { console.error('hook failed', e); } finally { inHook = false; } }
  db.rev++; dirty = true;
  if (!timer) timer = setTimeout(() => { timer = null; try { writeNow(); } catch (e) { console.error('save failed', e); } }, 120);
}
function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  try { writeNow(); } catch (e) { console.error('flush failed', e); }
}
async function flushAsync() { flush(); await mysqlQueue; if (dirty) { flush(); await mysqlQueue; } }

async function init() {
  if (initialized) return;
  const cfg = mysqlConfig();
  if (cfg.enabled) {
    mysqlEnabled = true;
    const DATA_ABS = path.resolve(DATA), APP_ABS = path.resolve(__dirname, '..');
    if (!path.isAbsolute(DATA) || DATA_ABS === APP_ABS || DATA_ABS.startsWith(APP_ABS + path.sep)) throw new Error('DATA_DIR must be an absolute persistent folder outside the deployed application when MySQL is enabled.');
    let mysql;
    try { mysql = require('mysql2/promise'); } catch { throw new Error('mysql2 is required for MySQL mode. Deploy with npm install after adding the mysql2 dependency.'); }
    pool = mysql.createPool({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database, waitForConnections: true, connectionLimit: Math.max(2, +(process.env.DB_POOL_SIZE || 5)), queueLimit: 0, charset: 'utf8mb4', timezone: 'Z', ssl: cfg.ssl ? {} : undefined, enableKeepAlive: true, keepAliveInitialDelay: 0 });
    await pool.query('SELECT 1');
    await createMysqlSchema(pool);
    const [rows] = await pool.execute('SELECT revision, payload FROM crm_state WHERE id = 1');
    if (rows.length) {
      let stored;
      try { stored = JSON.parse(rows[0].payload); } catch { throw new Error('MySQL crm_state.payload contains invalid JSON. Startup stopped to protect CRM data.'); }
      const beforeNormalize = JSON.stringify(stored);
      const restored = normalizeState(stored);
      const normalizedChanged = beforeNormalize !== JSON.stringify(restored);
      replaceState(restored);
      mysqlRevision = Number(rows[0].revision || restored.rev || 1);
      persistedRevision = mysqlRevision;
      const needsRewrite = normalizedChanged || Number(db.rev || 1) !== mysqlRevision;
      if (needsRewrite) { db.rev = Math.max(Number(db.rev || 1), mysqlRevision) + 1; dirty = true; }
    } else {
      if (localParseError) throw new Error('The local db.json exists but is invalid, and MySQL has no saved CRM record. Startup stopped to avoid importing an empty database.');
      replaceState(normalizeState(db || blank()));
      const initial = JSON.stringify(db);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute('INSERT INTO crm_state (id, revision, payload) VALUES (1, ?, ?)', [Number(db.rev || 1), initial]);
        await conn.execute('INSERT INTO crm_state_backups (revision, payload) VALUES (?, ?)', [Number(db.rev || 1), initial]);
        await conn.commit();
      } catch (e) { try { await conn.rollback(); } catch {} throw e; }
      finally { conn.release(); }
      mysqlRevision = Number(db.rev || 1); persistedRevision = mysqlRevision;
    }
    const before = JSON.stringify(db);
    ensureAdmin();
    const after = JSON.stringify(db);
    if (before !== after) { db.rev = Math.max(Number(db.rev || 1), mysqlRevision) + 1; dirty = true; }
    // Always refresh the local recovery snapshot from the authoritative MySQL row.
    dirty = true; writeNow();
    await mysqlQueue;
    if (mysqlLastError) throw new Error('MySQL initial persistence failed: ' + mysqlLastError);
    console.log('Storage driver: MySQL (crm_state + crm_state_backups)');
    console.log('MySQL database connected; persisted revision ' + persistedRevision);
  } else {
    replaceState(normalizeState(db || blank()));
    ensureAdmin();
    dirty = true; writeNow();
    console.log('Storage driver: JSON (DATA_DIR/db.json). MySQL environment variables are not configured.');
  }
  initialized = true;
}

// Normalize the shared object at module load so modules that capture D.db keep the same reference.
db = normalizeState(db || blank());

async function health() {
  const base = { driver: mysqlEnabled ? 'mysql' : 'json', configured: mysqlEnabled, revision: Number(db.rev || 1), persistedRevision, lastWriteAt: mysqlLastWriteAt || null };
  if (!mysqlEnabled) return { ...base, connected: false, healthy: false, note: 'MySQL environment variables are not configured.' };
  let connected = false, error = mysqlLastError;
  try { await pool.query('SELECT 1'); connected = true; mysqlLastPingAt = Date.now(); if (!error) mysqlLastError = ''; }
  catch (e) { error = e.message; mysqlLastError = error; }
  const healthy = connected && persistedRevision >= Number(db.rev || 1) && !mysqlLastError;
  return { ...base, connected, healthy, error: error || null };
}

/* ---------- helpers ---------- */
const nid = () => ++db.seq;
const today = () => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: db.settings.tz || 'Asia/Karachi' }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); } };
const fail = (m, x) => { throw Object.assign(new Error(m), x || {}); };
const need = (c, m = 'Not allowed') => { if (!c) fail(m); };
const str = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const num = v => Math.max(0, Math.round(+String(v == null ? 0 : v).replace(/[^0-9.\-]/g, '') || 0));
const isoDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const logAct = (u, a, d) => { db.log.push({ t: new Date().toISOString(), u: u ? u.name : 'system', a, d: str(d, 240) }); if (db.log.length > 4000) db.log.splice(0, db.log.length - 4000); };
const party = id => db.parties.find(p => p.id == id);
const token = (n = 18) => crypto.randomBytes(n).toString('base64url');
const uniqueNo = () => makeNo(db, new Set(db.bookings.map(b => b.no)));

module.exports = { hooks, get db() { return db; }, DATA, fresh, hash, check, save, flush, flushAsync, init, health, nid, today, fail, need, str, num, isoDate, logAct, party, token, uniqueNo, DEFAULT_ADMIN_PASSWORD };
