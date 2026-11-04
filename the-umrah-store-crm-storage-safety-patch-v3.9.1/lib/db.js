'use strict';
/**
 * Data store: one JSON document, written atomically (tmp + rename), debounced.
 * v3 schema. Older v2 databases are migrated automatically on first start.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const APP_ROOT = path.resolve(__dirname, '..');
const APP_DATA = path.join(APP_ROOT, 'data');
const configuredDataDir = String(process.env.DATA_DIR || '').trim();
// Hostinger may not expose NODE_ENV consistently in every Node.js app runtime.
// Treat a configured public production URL as production unless explicitly in dev/test.
const strictPersistentStorage = process.env.NODE_ENV === 'production' ||
  (!['development', 'test'].includes(process.env.NODE_ENV) && /^https?:\/\//i.test(String(process.env.PUBLIC_URL || '')));
if (strictPersistentStorage && !configuredDataDir) {
  throw new Error('Unsafe CRM storage configuration: set DATA_DIR to an absolute directory outside the deployed application (for example /home/USER/umrah-data).');
}
if (strictPersistentStorage && configuredDataDir && !path.isAbsolute(configuredDataDir)) {
  throw new Error('Unsafe CRM storage configuration: DATA_DIR must be an absolute path outside the deployed application.');
}
const DATA = path.resolve(configuredDataDir || APP_DATA);
const isInside = (parent, child) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
};
if (configuredDataDir && isInside(APP_ROOT, DATA) && process.env.ALLOW_IN_APP_DATA_DIR !== '1') {
  throw new Error('Unsafe CRM storage configuration: DATA_DIR points inside the deployment folder. Set DATA_DIR to a persistent path outside hbuilds (for example /home/USER/umrah-data).');
}

// The JSON database is intentionally retained for this release. The current CRM
// is built around a single-process in-memory document store; changing to MySQL
// would require a separate, tested data-layer migration, not just a new setting.
fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
try { fs.chmodSync(DATA, 0o700); } catch { /* hosting filesystem may not expose chmod */ }
// Resolve symlinks too: a path that looks external can still point back into the
// deployment directory. This check runs after the target directory exists.
if (strictPersistentStorage && configuredDataDir && process.env.ALLOW_IN_APP_DATA_DIR !== '1') {
  const realApp = fs.realpathSync(APP_ROOT);
  const realData = fs.realpathSync(DATA);
  if (isInside(realApp, realData)) {
    throw new Error('Unsafe CRM storage configuration: DATA_DIR resolves inside the deployed application. Use a real persistent directory outside hbuilds.');
  }
}
for (const d of ['receipts', 'brand', 'backups', 'promos', 'kyc', 'wa-auth']) {
  fs.mkdirSync(path.join(DATA, d), { recursive: true, mode: 0o700 });
  try { fs.chmodSync(path.join(DATA, d), 0o700); } catch { /* best effort */ }
}
const DBF = path.join(DATA, 'db.json');
const INIT_MARKER = path.join(DATA, '.crm-initialized');
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function copyMissingTree(src, dest) {
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) return;
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.isSymbolicLink() || ent.name === 'db.json.tmp') continue;
    const a = path.join(src, ent.name), b = path.join(dest, ent.name);
    if (ent.isDirectory()) copyMissingTree(a, b);
    else if (ent.isFile() && !fs.existsSync(b)) {
      fs.mkdirSync(path.dirname(b), { recursive: true, mode: 0o700 });
      fs.copyFileSync(a, b, fs.constants.COPYFILE_EXCL);
      try { fs.chmodSync(b, 0o600); } catch { /* best effort */ }
    }
  }
}
function readDatabaseFile(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (e) { throw e; }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { throw new Error('CRM database is present but invalid JSON at ' + file + '. Startup stopped to protect the existing data. Original error: ' + e.message); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('CRM database at ' + file + ' is not a valid database object. Startup stopped to protect the existing data.');
  }
  return parsed;
}
function validateDatabaseShape(o, file) {
  const arrays = ['users', 'parties', 'bookings', 'vouchers', 'payments', 'entries', 'expenses', 'queries', 'paylinks', 'groups', 'hotels', 'visaTiers', 'tVehicles', 'tRoutes', 'tPrices', 'log', 'tickets', 'notifs'];
  // A v3 document must contain all core collections. Silently filling a missing
  // collection with [] can turn a truncated-but-valid JSON file into apparent data loss.
  const coreArrays = ['users', 'parties', 'bookings', 'vouchers', 'payments', 'entries', 'expenses', 'queries', 'paylinks', 'groups', 'hotels', 'visaTiers', 'tVehicles', 'tRoutes', 'tPrices', 'log'];
  if (Number(o.v) >= 3) {
    for (const key of coreArrays) {
      if (!Object.prototype.hasOwnProperty.call(o, key)) {
        throw new Error('CRM database is missing required v3 collection  + key +  in ' + file + '. Startup stopped to protect potentially truncated data.');
      }
    }
    for (const key of ['settings', 'sessions']) {
      if (!Object.prototype.hasOwnProperty.call(o, key)) {
        throw new Error('CRM database is missing required v3 field  + key +  in ' + file + '. Startup stopped to protect potentially truncated data.');
      }
    }
  }
  for (const key of arrays) {
    if (Object.prototype.hasOwnProperty.call(o, key) && !Array.isArray(o[key])) {
      throw new Error('CRM database field "' + key + '" is not an array in ' + file + '. Startup stopped rather than replacing it with an empty list.');
    }
  }
  for (const key of ['settings', 'sessions']) {
    if (Object.prototype.hasOwnProperty.call(o, key) && (!o[key] || typeof o[key] !== 'object' || Array.isArray(o[key]))) {
      throw new Error('CRM database field "' + key + '" is invalid in ' + file + '. Startup stopped to protect existing data.');
    }
  }
  return o;
}

// One-time, non-destructive migration: when DATA_DIR is moved outside hbuilds,
// copy the old application's data tree into it only if the new db.json is absent.
// Existing target files are never overwritten, and the source is never deleted.
if (!fs.existsSync(INIT_MARKER)) {
  const legacyCandidates = [process.env.LEGACY_DATA_DIR, APP_DATA]
    .filter(Boolean).map(x => path.resolve(x)).filter((x, i, a) => a.indexOf(x) === i && x !== DATA);
  for (const legacyDir of legacyCandidates) {
    const legacyDb = path.join(legacyDir, 'db.json');
    if (!fs.existsSync(legacyDb)) continue;
    // Validate before copying. A corrupt source must not be treated as a fresh install.
    validateDatabaseShape(readDatabaseFile(legacyDb), legacyDb);
    // Copy missing assets as well when an operator copied db.json first. Never overwrite.
    copyMissingTree(legacyDir, DATA);
    console.warn('[storage] Checked legacy CRM data at ' + legacyDir + ' and copied any missing files into persistent DATA_DIR. Source was left untouched.');
    break;
  }
}

const DBF_EXISTS = fs.existsSync(DBF);
if (!DBF_EXISTS && fs.existsSync(INIT_MARKER)) {
  throw new Error('CRM database is missing from the initialized DATA_DIR. Refusing to create a blank database. Restore db.json from DATA_DIR/backups or correct DATA_DIR.');
}
if (!DBF_EXISTS && process.env.ALLOW_EMPTY_DB !== '1') {
  throw new Error('CRM database not found at ' + DBF + '. Startup stopped instead of creating an empty database. Set DATA_DIR to the existing persistent folder, or set ALLOW_EMPTY_DB=1 only for a deliberate first-time installation.');
}
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

let db, fresh = !DBF_EXISTS;
if (DBF_EXISTS) db = validateDatabaseShape(readDatabaseFile(DBF), DBF);

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

if (fresh) db = blank();
else if (!db.v || db.v < 3) db = migrateV2(db);
const dflt = defaultSettings();
db.settings = { ...dflt, ...(db.settings || {}), company: { ...dflt.company, ...((db.settings || {}).company || {}) }, sla: { ...dflt.sla, ...((db.settings || {}).sla || {}) }, payfast: { ...dflt.payfast, ...((db.settings || {}).payfast || {}) }, calc: { ...dflt.calc, ...((db.settings || {}).calc || {}) }, groq: { ...dflt.groq, ...((db.settings || {}).groq || {}) }, payments: { ...dflt.payments, ...((db.settings || {}).payments || {}) }, security: { ...dflt.security, ...((db.settings || {}).security || {}) } };
delete db.settings.anthropicKey;
if (!db.settings.contactV) { Object.assign(db.settings.company, { phone: '+92 313 693 5568', whatsapp: '+92 313 693 5568', email: 'info@theumrahstore.com', address: 'Branches: Lahore · Okara · Islamabad', branches: 'Lahore, Okara, Islamabad' }); db.settings.contactV = 1; }
['users', 'parties', 'bookings', 'vouchers', 'payments', 'entries', 'expenses', 'queries', 'paylinks', 'groups', 'hotels', 'visaTiers', 'tVehicles', 'tRoutes', 'tPrices', 'log', 'tickets', 'notifs'].forEach(k => { if (!Object.prototype.hasOwnProperty.call(db, k)) db[k] = []; });
if (!Object.prototype.hasOwnProperty.call(db, 'sessions')) db.sessions = {}; db.rev = db.rev || 1; db.v = 3;

/* the admin account always exists */
(function ensureAdmin() {
  let a = db.users.find(u => u.id === 'admin');
  if (!a) {
    if (!DEFAULT_ADMIN_PASSWORD) throw new Error('No administrator exists. Set a strong ADMIN_PASSWORD before initializing this CRM.');
    db.users.unshift({ id: 'admin', role: 'admin', name: 'Administrator', login: 'admin', pw: hash(DEFAULT_ADMIN_PASSWORD), mustChange: true });
  } else if (process.env.RESET_ADMIN === '1') {
    if (!DEFAULT_ADMIN_PASSWORD) throw new Error('RESET_ADMIN=1 requires a strong ADMIN_PASSWORD.');
    a.pw = hash(DEFAULT_ADMIN_PASSWORD); a.mustChange = true;
  }
})();

/* ---------- persistence ---------- */
let timer = null, dirty = false;
const BACKUP_RETENTION_DAYS = Math.max(7, Math.min(90, +(process.env.BACKUP_RETENTION_DAYS || 30)));
const BACKUP_INTERVAL_HOURS = Math.max(1, Math.min(24, +(process.env.BACKUP_INTERVAL_HOURS || 6)));
const checkpointName = () => 'db-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
const checkpointPattern = /^db-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/;
function createCheckpointBackup(force = false) {
  if (!fs.existsSync(DBF)) return false;
  const dir = path.join(DATA, 'backups');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const files = fs.readdirSync(dir).filter(f => checkpointPattern.test(f)).map(name => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs })).sort((a, b) => a.mtime - b.mtime);
  const latest = files[files.length - 1];
  const intervalMs = BACKUP_INTERVAL_HOURS * 60 * 60 * 1000;
  if (!force && latest && Date.now() - latest.mtime < intervalMs) return false;
  const dest = path.join(dir, checkpointName());
  const tmp = dest + '.tmp';
  fs.copyFileSync(DBF, tmp);
  try { fs.chmodSync(tmp, 0o600); } catch { /* best effort */ }
  fs.renameSync(tmp, dest);
  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 864e5;
  for (const f of fs.readdirSync(dir)) {
    if (!/^db-\d{4}-\d{2}-\d{2}(?:T.*)?\.json$/.test(f)) continue;
    try { if (fs.statSync(path.join(dir, f)).mtimeMs < cutoff) fs.unlinkSync(path.join(dir, f)); }
    catch (e) { console.error('[storage] Could not prune backup ' + f + ':', e.message); }
  }
  return true;
}
function atomicWrite(file, content) {
  const tmp = file + '.tmp';
  let fd;
  try {
    fd = fs.openSync(tmp, 'w', 0o600);
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = null;
    fs.renameSync(tmp, file);
    try {
      const dfd = fs.openSync(path.dirname(file), 'r');
      try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
    } catch { /* directory fsync is not supported by every hosting filesystem */ }
    try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
  } catch (e) {
    if (fd !== undefined && fd !== null) { try { fs.closeSync(fd); } catch { /* ignore */ } }
    throw e;
  }
}
function writeNow() {
  if (!dirty) return;
  // Snapshot the last known-good file BEFORE replacing it. The old code backed up
  // after writing, which could preserve the already-updated file instead.
  const hadPrevious = fs.existsSync(DBF);
  if (hadPrevious) {
    try { createCheckpointBackup(); }
    catch (e) { console.error('[storage] Pre-write backup failed; preserving the live write and reporting the backup error:', e && e.message || e); }
  }
  atomicWrite(DBF, JSON.stringify(db));
  dirty = false;
  if (!fs.existsSync(INIT_MARKER)) {
    atomicWrite(INIT_MARKER, JSON.stringify({ initializedAt: new Date().toISOString(), db: 'db.json', version: 1 }));
  }
  // First install has no previous file to snapshot; save its first valid state now.
  if (!hadPrevious) {
    try { createCheckpointBackup(true); }
    catch (e) { console.error('[storage] Initial backup failed:', e && e.message || e); }
  }
}
const hooks = []; let inHook = false;
function scheduleWrite(ms = 400) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { writeNow(); }
    catch (e) { dirty = true; console.error('[storage] Save failed; data remains dirty and will be retried:', e && e.stack || e); scheduleWrite(5000); }
  }, ms);
  if (timer.unref) timer.unref();
}
function save() {
  if (!inHook) {
    inHook = true;
    try { hooks.forEach(h => h()); }
    catch (e) { console.error('hook failed', e); }
    finally { inHook = false; }
  }
  db.rev++; dirty = true; scheduleWrite();
}
function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  try { writeNow(); }
  catch (e) { dirty = true; console.error('[storage] Flush failed:', e && e.stack || e); }
}
process.on('SIGTERM', () => { flush(); process.exit(0); });
process.on('SIGINT', () => { flush(); process.exit(0); });
process.on('exit', () => { try { if (dirty) writeNow(); } catch { /* process is exiting; log from normal flush path */ } });
// Ensure the app's current schema is committed and take an initial checkpoint snapshot.
dirty = true;
writeNow();
const backupTimer = setInterval(() => {
  try { createCheckpointBackup(); }
  catch (e) { console.error('[storage] Scheduled backup failed:', e && e.message || e); }
}, 60 * 60 * 1000);
if (backupTimer.unref) backupTimer.unref();

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

module.exports = { hooks, db, APP_ROOT, DATA, DBF, isInside, fresh, hash, check, save, flush, nid, today, fail, need, str, num, isoDate, logAct, party, token, uniqueNo, DEFAULT_ADMIN_PASSWORD };
