'use strict';
/**
 * Shared CRM state store. MySQL is the primary database when DB_* is configured (see lib/store.js); DATA_DIR/db.json is a recovery snapshot.
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

/* ====================================================================================================
 * Persistence
 *   MySQL configured  -> MySQL is the ONLY source of truth. Every save() is committed in a transaction (changed rows only,
 *                        guarded by a revision check). HTTP responses that changed data are held until the commit succeeds
 *                        (requestScope). A failed commit is retried, then rolled back in memory so "503" always means "not saved".
 *   MySQL not configured -> DATA_DIR/db.json (development / tests only).
 *   DATA_DIR/db.json in MySQL mode is a recovery snapshot of the last COMMITTED state, never read while MySQL has data.
 * ================================================================================================== */
const { AsyncLocalStorage } = require('async_hooks');
const Store = require('./store');
const APP_VERSION = require('../package.json').version;
const WRITER = require('os').hostname() + ':' + process.pid + ':' + Date.now().toString(36);
const num0 = (v, d) => (Number.isFinite(+v) ? +v : d);
const BACKUP_INTERVAL_MS = Math.max(1000, num0(process.env.DB_BACKUP_INTERVAL_MS, 6 * 60 * 60 * 1000));
const BACKUP_KEEP = Math.max(3, Math.min(500, num0(process.env.DB_BACKUP_KEEP, 30)));
const WRITE_RETRIES = Math.max(1, Math.min(10, num0(process.env.DB_WRITE_RETRIES, 4)));
const RETRY_BASE_MS = Math.max(1, num0(process.env.DB_RETRY_BASE_MS, 200));
const WRITE_TIMEOUT_MS = Math.max(500, num0(process.env.DB_WRITE_TIMEOUT_MS, 20000));
const SNAPSHOT_DELAY_MS = Math.max(0, num0(process.env.DB_SNAPSHOT_DELAY_MS, 3000));

let pool = null, mysqlEnabled = false, state = 'starting', initError = '', initialized = false;
let timer = null, dirty = false, lastBackup = 0;                 // JSON-mode debounce
const scope = new AsyncLocalStorage();
const committed = { ent: {}, kv: new Map(), sess: new Map(), nextOrd: {} };
const META = new WeakMap();                                       // record object -> { col, key, ord }
let headRev = 0;                                                  // revision physically stored in crm_head
let settledRev = 0;                                               // highest revision whose fate is decided (committed, no-op, or rolled back)
let waiters = [], flushing = null, flushTimer = null, lastError = null, lastCommitAt = '', failedCommits = 0, retriedWrites = 0, rolledBack = 0, resynced = 0;
let lastBackupAt = 0, backupRunning = false, lastBackupError = '', snapshotTimer = null, snapshotError = '', mysqlLastPingAt = 0;
let writeLock = Promise.resolve();
const exclusive = fn => { const run = writeLock.then(fn, fn); writeLock = run.catch(() => {}); return run; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const spec of Store.ENTITIES) committed.ent[spec.key] = new Map();

function mysqlConfig() { return Store.mysqlConfig(); }

/* ---------- local recovery snapshot ---------- */
function writeLocalSnapshot(json) {
  const tmp = DBF + '.tmp';
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeSync(fd, json); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
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

/* ---------- committed state <-> memory ---------- */
function exportCommitted() {
  const o = { v: 3, rev: headRev };
  for (const spec of Store.ENTITIES) o[spec.key] = [...committed.ent[spec.key].entries()].sort((a, b) => a[1].ord - b[1].ord).map(([, c]) => JSON.parse(c.s));
  o.sessions = {}; for (const [sid, s] of committed.sess) o.sessions[sid] = JSON.parse(s);
  for (const [k, s] of committed.kv) o[k] = JSON.parse(s);
  return o;
}
function exportCommittedJson() {
  // built from strings, no re-serialisation of live objects: always exactly what MySQL holds
  const parts = ['"v":3', '"rev":' + headRev];
  for (const spec of Store.ENTITIES) parts.push(JSON.stringify(spec.key) + ':[' + [...committed.ent[spec.key].values()].sort((a, b) => a.ord - b.ord).map(c => c.s).join(',') + ']');
  parts.push('"sessions":{' + [...committed.sess.entries()].map(([k, s]) => JSON.stringify(k) + ':' + s).join(',') + '}');
  for (const [k, s] of committed.kv) parts.push(JSON.stringify(k) + ':' + s);
  return '{' + parts.join(',') + '}';
}

function bindRows(spec, rows) {
  const arr = rows.map(r => { const o = JSON.parse(r.s); META.set(o, { col: spec.key, key: r.key, ord: r.ord }); return o; });
  committed.ent[spec.key] = new Map(rows.map(r => [r.key, { s: r.s, ord: r.ord }]));
  committed.nextOrd[spec.key] = rows.reduce((m, r) => Math.max(m, r.ord), 0) + 1;
  return arr;
}
function adoptLoaded(loaded, head) {
  const next = {};
  for (const spec of Store.ENTITIES) next[spec.key] = bindRows(spec, loaded.entities[spec.key] || []);
  committed.sess = new Map(loaded.sessions.map(r => [r.sid, r.s]));
  next.sessions = {}; loaded.sessions.forEach(r => { next.sessions[r.sid] = JSON.parse(r.s); });
  committed.kv = new Map(loaded.kv.map(r => [r.k, r.s]));
  loaded.kv.forEach(r => { next[r.k] = JSON.parse(r.s); });
  headRev = head.revision;
  next.rev = head.revision;
  return next;
}
function resetCommitted() { for (const spec of Store.ENTITIES) { committed.ent[spec.key] = new Map(); committed.nextOrd[spec.key] = 1; } committed.kv = new Map(); committed.sess = new Map(); headRev = 0; }

/* Re-apply what other modules do at require() time, so state loaded from MySQL is complete. All of it is additive/idempotent. */
function afterLoad() {
  ['audit', 'tickets', 'notifs', 'mailLog', 'promos', 'signups', 'chats'].forEach(k => { if (!Array.isArray(db[k])) db[k] = []; });
  if (!db.fx || typeof db.fx !== 'object') db.fx = { perUnit: {}, updated: '', source: '', error: '' };
  require('./perms').init();
}

/* ---------- planning: diff live memory against the last committed state (synchronous, so it is a consistent snapshot) ---------- */
function assignOrds(spec, arr) {
  const items = [], n = arr.length;
  for (const o of arr) if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Collection "' + spec.key + '" contains a value that is not a record; refusing to persist it.');
  const metas = arr.map(o => { const m = META.get(o); return m && m.col === spec.key ? m : null; });
  const ex = []; metas.forEach((m, i) => { if (m) ex.push(i); });
  let ok = true;
  for (let j = 1; j < ex.length; j++) if (metas[ex[j]].ord <= metas[ex[j - 1]].ord) { ok = false; break; }
  if (ok && ex.length) for (let i = ex[0]; i <= ex[ex.length - 1]; i++) if (!metas[i]) { ok = false; break; }
  const used = new Set(); let next = committed.nextOrd[spec.key] || 1;
  const ords = new Array(n);
  if (!ok || !ex.length) {
    const base = Math.max(next, ...metas.filter(Boolean).map(m => m.ord + 1), 1);
    for (let i = 0; i < n; i++) ords[i] = base + i;
    next = base + n;
    const reuse = ok; // (no existing metas) -> nothing to reuse
    for (let i = 0; i < n; i++) { const m = metas[i]; const rec = arr[i]; let key = !reuse && m ? m.key : null; if (key && used.has(key)) key = null; if (!key) key = spec.keyless || rec.id === undefined || rec.id === null || rec.id === '' ? 'k' + ords[i] : String(rec.id).slice(0, 64); while (used.has(key)) key = 'k' + (next++); used.add(key); items.push({ o: rec, key, ord: ords[i] }); }
  } else {
    const first = ex[0];
    metas.forEach(m => { if (m) used.add(m.key); });
    for (let i = 0; i < n; i++) {
      const m = metas[i], rec = arr[i];
      if (m) { items.push({ o: rec, key: m.key, ord: m.ord }); continue; }
      const ord = i < first ? metas[first].ord - (first - i) : next++;
      let key = spec.keyless || rec.id === undefined || rec.id === null || rec.id === '' ? 'k' + ord : String(rec.id).slice(0, 64);
      while (used.has(key)) key = 'k' + (next++);
      used.add(key); items.push({ o: rec, key, ord });
    }
  }
  committed.nextOrd[spec.key] = next;
  return items;
}

function buildPlan(rev) {
  const plan = { rev, token: crypto.randomBytes(16).toString('hex'), tables: [], kv: { ups: [], dels: [] }, sess: { ups: [], dels: [] }, _apply: [], empty: true };
  for (const spec of Store.ENTITIES) {
    const arr = db[spec.key]; if (arr === undefined) continue;
    if (!Array.isArray(arr)) throw new Error('Collection "' + spec.key + '" is not an array; refusing to persist it.');
    const cm = committed.ent[spec.key], items = assignOrds(spec, arr), seen = new Set(), ups = [], upMeta = [];
    for (const it of items) {
      seen.add(it.key); META.set(it.o, { col: spec.key, key: it.key, ord: it.ord });
      const s = JSON.stringify(it.o), c = cm.get(it.key);
      if (!c || c.s !== s || c.ord !== it.ord) { ups.push(Store.rowForObj(spec, it.key, it.ord, it.o, s, rev)); upMeta.push([it.key, s, it.ord]); }
    }
    const dels = []; for (const k of cm.keys()) if (!seen.has(k)) dels.push(k);
    if (ups.length || dels.length) { plan.tables.push({ spec, ups, dels }); plan.empty = false; plan._apply.push(() => { upMeta.forEach(([k, s, o]) => cm.set(k, { s, ord: o })); dels.forEach(k => cm.delete(k)); }); }
  }
  const kvNow = new Map();
  for (const k of Object.keys(db)) { if (Store.NON_KV.has(k)) continue; const v = db[k]; if (v === undefined || typeof v === 'function') continue; kvNow.set(k, JSON.stringify(v)); }
  const kvUp = [], kvDel = [];
  for (const [k, s] of kvNow) if (committed.kv.get(k) !== s) kvUp.push([k, s]);
  for (const k of committed.kv.keys()) if (!kvNow.has(k)) kvDel.push(k);
  if (kvUp.length || kvDel.length) { plan.kv = { ups: kvUp, dels: kvDel }; plan.empty = false; plan._apply.push(() => { kvUp.forEach(([k, s]) => committed.kv.set(k, s)); kvDel.forEach(k => committed.kv.delete(k)); }); }
  const sessNow = new Map(); for (const [sid, s] of Object.entries(db.sessions || {})) sessNow.set(sid, JSON.stringify(s));
  const sUp = [], sDel = [];
  for (const [sid, s] of sessNow) if (committed.sess.get(sid) !== s) sUp.push([sid, s]);
  for (const sid of committed.sess.keys()) if (!sessNow.has(sid)) sDel.push(sid);
  if (sUp.length || sDel.length) {
    plan.sess = { ups: sUp.map(([sid, s]) => { const o = db.sessions[sid]; return [sid.slice(0, 64), o && o.uid != null ? String(o.uid).slice(0, 64) : null, o && Number.isFinite(+o.exp) ? Math.round(+o.exp) : null, s, rev]; }), dels: sDel };
    plan.empty = false; plan._apply.push(() => { sUp.forEach(([sid, s]) => committed.sess.set(sid, s)); sDel.forEach(sid => committed.sess.delete(sid)); });
  }
  return plan;
}
const applyPlan = plan => { plan._apply.forEach(f => f()); headRev = plan.rev; };

/* ---------- commit pipeline ---------- */
function settle(rev) {
  settledRev = Math.max(settledRev, rev);
  const keep = [];
  for (const w of waiters) (w.rev <= settledRev ? w.resolve : () => keep.push(w))();
  waiters = keep;
}
function failWaiters(err) {
  const all = waiters; waiters = [];
  const e = Object.assign(new Error('Your change could not be saved to the database and was not applied. ' + (err && err.message ? '(' + err.message + ')' : '')), { status: 503, code: 'STORAGE_UNAVAILABLE', cause: err });
  all.forEach(w => w.reject(e));
}
const permanent = e => { const c = Store.codeOf(e); return c === 'CRM_CONFLICT' || c === 'ER_ACCESS_DENIED_ERROR' || c === 'ER_DBACCESS_DENIED_ERROR' || c === 'ER_DATA_TOO_LONG' || c === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || c === 'ER_NO_SUCH_TABLE'; };

async function writeWithRetry(plan, expectRev) {
  let err;
  for (let a = 1; a <= WRITE_RETRIES; a++) {
    try { return await Store.writePlan(pool, plan, { expectRev, writer: WRITER, appVersion: APP_VERSION, timeoutMs: WRITE_TIMEOUT_MS }); }
    catch (e) {
      err = e; lastError = { message: e.message, code: String(Store.codeOf(e) || ''), at: new Date().toISOString() };
      if (permanent(e) || a === WRITE_RETRIES) break;
      retriedWrites++; await sleep(RETRY_BASE_MS * 2 ** (a - 1));
    }
  }
  throw err;
}

/** memory := last committed state (no database round-trip needed). Revision numbers keep increasing, never reused. */
function rollbackMemory() {
  const rev = Math.max(Number(db.rev) || 1, settledRev);
  const next = exportCommitted(); next.rev = rev;
  for (const spec of Store.ENTITIES) {          // objects are new: re-bind their stable row identity
    const sorted = [...committed.ent[spec.key].entries()].sort((x, y) => x[1].ord - y[1].ord);
    next[spec.key].forEach((o, i) => META.set(o, { col: spec.key, key: sorted[i][0], ord: sorted[i][1].ord }));
  }
  replaceState(next); rolledBack++;
  return rev;
}
async function resyncFromDatabase() {
  const head = await Store.loadHead(pool); if (!head) throw new Error('crm_head is missing');
  const loaded = await Store.loadAll(pool);
  const rev = Math.max(Number(db.rev) || 1, settledRev, head.revision) + 1;
  const next = adoptLoaded(loaded, head); next.rev = rev;
  replaceState(next); resynced++;
  return rev;
}

async function flushOnce() {
  const rev = Number(db.rev) || 1;
  let plan;
  try { plan = buildPlan(rev); } catch (e) { lastError = { message: e.message, code: 'PLAN', at: new Date().toISOString() }; failedCommits++; settledRev = rev; rollbackMemory(); failWaiters(e); return; }
  if (plan.empty) { settle(rev); return; }
  try {
    await writeWithRetry(plan, headRev);
    applyPlan(plan); lastCommitAt = new Date().toISOString(); lastError = lastError && lastError.sticky ? lastError : null;
    settle(rev); scheduleSnapshot(); maybeBackup();
  } catch (e) {
    failedCommits++;
    console.error('MySQL commit failed (revision ' + rev + '), change rolled back:', e.message);
    let newRev;
    try { newRev = Store.codeOf(e) === 'CRM_CONFLICT' ? await resyncFromDatabase() : rollbackMemory(); }
    catch (e2) { console.error('Could not resync from MySQL:', e2.message); newRev = rollbackMemory(); }
    settledRev = Math.max(settledRev, newRev, Number(db.rev) || 0); db.rev = Math.max(Number(db.rev) || 0, newRev);
    failWaiters(e);
  }
}

function runFlush() {
  if (flushing) return flushing;
  flushing = exclusive(async () => {
    while ((Number(db.rev) || 1) > settledRev) {
      try { await flushOnce(); }
      catch (e) { console.error('Unexpected commit pipeline error:', e && e.stack || e); failedCommits++; settledRev = Math.max(settledRev, Number(db.rev) || 1); failWaiters(e); }
    }
  }).finally(() => { flushing = null; if ((Number(db.rev) || 1) > settledRev) scheduleFlush(); });
  return flushing;
}
function scheduleFlush() { if (flushTimer || !mysqlEnabled) return; flushTimer = setTimeout(() => { flushTimer = null; runFlush().catch(() => {}); }, 0); }

/** Resolves once the current revision is durably committed; rejects (503) if it could not be stored. */
function commit() {
  const target = Number(db.rev) || 1;
  if (!mysqlEnabled) { try { writeNow(true); } catch (e) { return Promise.reject(Object.assign(new Error('Could not write db.json: ' + e.message), { status: 503, code: 'STORAGE_UNAVAILABLE' })); } return Promise.resolve(); }
  if (state !== 'ready' && state !== 'initializing') return Promise.reject(Object.assign(new Error('Database is not available'), { status: 503, code: 'STORAGE_UNAVAILABLE' }));
  if (target <= settledRev) return Promise.resolve();
  const p = new Promise((resolve, reject) => waiters.push({ rev: target, resolve, reject }));
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  runFlush().catch(() => {});
  return p;
}

/* ---------- backups ---------- */
async function backupNow(reason = 'manual') {
  if (!mysqlEnabled || !pool) throw new Error('Database backups need MySQL mode');
  const json = exportCommittedJson();
  await Store.insertBackup(pool, headRev, reason, json, BACKUP_KEEP);
  lastBackupAt = Date.now(); lastBackupError = '';
  return { revision: headRev, bytes: Buffer.byteLength(json) };
}
function maybeBackup() {
  if (backupRunning || Date.now() - lastBackupAt < BACKUP_INTERVAL_MS) return;
  backupRunning = true;
  backupNow('auto').catch(e => { lastBackupError = e.message; console.warn('Automatic database backup failed:', e.message); lastBackupAt = Date.now() - BACKUP_INTERVAL_MS + 6e4; }).finally(() => { backupRunning = false; });
}
const listBackups = () => Store.listBackups(pool);

/** Replace the whole database with a backup (single transaction). A safety backup of the current state is taken first. */
async function restoreBackup(id) {
  if (!mysqlEnabled) throw new Error('Restore needs MySQL mode');
  const json = await Store.readBackup(pool, +id);
  const incoming = normalizeState(JSON.parse(json));
  return exclusive(async () => {
    await backupNow('pre-restore');
    const keepRev = Math.max(Number(db.rev) || 1, headRev, Number(incoming.rev) || 0) + 1;
    const saved = { ent: { ...committed.ent }, kv: committed.kv, sess: committed.sess, nextOrd: { ...committed.nextOrd }, headRev };
    replaceState(incoming); db.rev = keepRev;
    resetCommitted();
    try {
      const plan = buildPlan(keepRev); plan.truncate = true;
      for (const spec of Store.ENTITIES) if (!plan.tables.find(t => t.spec === spec)) plan.tables.push({ spec, ups: [], dels: [] });
      await writeWithRetry(plan, saved.headRev);
      applyPlan(plan);                                   // committed maps now describe exactly what was written
    } catch (e) {
      Object.assign(committed.ent, saved.ent); committed.kv = saved.kv; committed.sess = saved.sess; committed.nextOrd = saved.nextOrd; headRev = saved.headRev;
      rollbackMemory(); throw e;
    }
    settledRev = keepRev; db.rev = keepRev; lastCommitAt = new Date().toISOString();
    waiters.forEach(w => w.resolve()); waiters = [];
    scheduleSnapshot();
    return { restoredBackup: +id, revision: keepRev };
  });
}

/* ---------- local snapshot scheduling (MySQL mode) ---------- */
function scheduleSnapshot() {
  if (snapshotTimer) return;
  snapshotTimer = setTimeout(() => { snapshotTimer = null; writeSnapshotNow(); }, SNAPSHOT_DELAY_MS); snapshotTimer.unref();
}
function writeSnapshotNow() {
  try { writeLocalSnapshot(exportCommittedJson()); snapshotError = ''; } catch (e) { snapshotError = e.message; console.warn('Local recovery snapshot failed:', e.message); }
}

/* ---------- JSON mode (no MySQL configured: development & tests) ---------- */
function writeNow(force) {
  if (!dirty && !force) return;
  dirty = false;
  writeLocalSnapshot(JSON.stringify(db));
  settledRev = Number(db.rev) || 1;
}
const hooks = []; let inHook = false;
function save() {
  if (!inHook) { inHook = true; try { hooks.forEach(h => h()); } catch (e) { console.error('hook failed', e); } finally { inHook = false; } }
  db.rev++;
  const s = scope.getStore(); if (s) s.rev = db.rev;
  if (mysqlEnabled) { scheduleFlush(); return; }
  dirty = true;
  if (!timer) timer = setTimeout(() => { timer = null; try { writeNow(); } catch (e) { console.error('save failed', e); } }, 120);
}
function flush() {
  if (!mysqlEnabled) { if (timer) { clearTimeout(timer); timer = null; } try { writeNow(); } catch (e) { console.error('flush failed', e); } return; }
  scheduleFlush();
}
async function flushAsync() {
  if (!mysqlEnabled) { flush(); return; }
  if (state !== 'ready') return;
  try { await commit(); } catch (e) { console.error('final commit failed:', e.message); }
  if (flushing) await flushing.catch(() => {});
}

/** Express middleware: any response produced after save() in this request is held until its revision is committed. */
function requestScope(req, res, next) {
  const store = { rev: 0 };
  scope.run(store, () => {
    const w = res.write, e = res.end, h = res.writeHead; let held = null;
    const restore = () => { res.write = w; res.end = e; res.writeHead = h; };
    const hold = name => function (...a) {
      if (!store.rev || store.rev <= settledRev) { restore(); return ({ write: w, end: e, writeHead: h })[name].apply(res, a); }
      if (!held) {
        held = [];
        commit().then(() => { restore(); const q = held; held = null; q.forEach(([n, args]) => ({ write: w, end: e, writeHead: h })[n].apply(res, args)); },
          err => { restore(); held = null; sendStorageFailure(req, res, err, e); });
      }
      held.push([name, a]);
      return name === 'write' ? true : res;
    };
    res.write = hold('write'); res.end = hold('end'); res.writeHead = hold('writeHead');
    next();
  });
}
function sendStorageFailure(req, res, err, rawEnd) {
  try {
    if (res.headersSent) { res.destroy(); return; }
    ['Content-Length', 'ETag', 'Set-Cookie', 'Content-Encoding', 'Content-Type', 'Cache-Control'].forEach(n => res.removeHeader(n));
    const api = /^\/(api|pay|payfast)\b/.test(req.path) || /json/.test(req.headers.accept || '');
    const msg = 'Your change could not be saved to the database and was not applied. Please try again in a moment.';
    res.statusCode = 503; res.setHeader('Cache-Control', 'no-store'); res.setHeader('Retry-After', '5');
    const body = api ? JSON.stringify({ error: msg, code: 'STORAGE_UNAVAILABLE' }) : '<!doctype html><meta charset="utf-8"><title>Not saved</title><p style="font:16px system-ui;margin:3rem auto;max-width:34rem">' + msg + '</p>';
    res.setHeader('Content-Type', api ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8'); res.setHeader('Content-Length', Buffer.byteLength(body));
    rawEnd.call(res, body);
  } catch (e) { try { res.destroy(); } catch { /* ignore */ } }
  console.error('Response withheld (storage failure):', err && err.message);
}

/* ---------- initialisation ---------- */
async function init() {
  if (initialized) return;
  const cfg = mysqlConfig();
  if (!cfg.enabled) {
    replaceState(normalizeState(db || blank()));
    ensureAdmin();
    dirty = true; writeNow();
    state = 'ready'; initialized = true;
    console.log('Storage driver: JSON (DATA_DIR/db.json). MySQL environment variables are not configured - development/test mode only.');
    return;
  }
  mysqlEnabled = true; state = 'initializing';
  try {
    const DATA_ABS = path.resolve(DATA), APP_ABS = path.resolve(__dirname, '..');
    if (!path.isAbsolute(DATA) || DATA_ABS === APP_ABS || DATA_ABS.startsWith(APP_ABS + path.sep)) throw Object.assign(new Error('DATA_DIR must be an absolute persistent folder outside the deployed application when MySQL is enabled.'), { fatal: true });
    if (!pool) pool = Store.createPool(cfg);
    await pool.query('SELECT 1');
    const mig = await Store.migrate(pool);
    if (mig.applied.length) console.log('MySQL schema migrations applied: ' + mig.applied.join(', '));
    let head = await Store.loadHead(pool), source = 'mysql';
    resetCommitted();
    if (head) {
      replaceState(normalizeState(adoptLoaded(await Store.loadAll(pool), head)));
      settledRev = Number(db.rev) || head.revision;
    } else {
      // Database is empty: import exactly once. MySQL-held legacy state beats the local JSON file; the JSON file is never read again afterwards.
      const legacy = await Store.loadLegacyState(pool);
      let src;
      if (legacy) { try { src = JSON.parse(legacy.payload); } catch { throw Object.assign(new Error('Legacy crm_state.payload is not valid JSON; refusing to import.'), { fatal: true }); } source = 'legacy crm_state table (revision ' + legacy.revision + ')'; }
      else if (localParseError) throw Object.assign(new Error('DATA_DIR/db.json exists but is not valid JSON, and MySQL is empty. Startup stopped so an empty database is not created over your data. Fix or restore db.json.'), { fatal: true });
      else { src = db; source = fresh ? 'new empty database' : 'DATA_DIR/db.json'; }
      if (!fresh && source === 'DATA_DIR/db.json') { try { fs.copyFileSync(DBF, path.join(DATA, 'backups', 'pre-mysql-migration-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json')); } catch (e) { console.warn('Could not copy db.json before migration:', e.message); } }
      replaceState(normalizeState(src)); ensureAdmin();
      db.rev = Math.max(Number(db.rev) || 1, legacy ? legacy.revision : 0, 1);
      afterLoad();
      const plan = buildPlan(db.rev);
      for (const spec of Store.ENTITIES) if (!plan.tables.find(t => t.spec === spec)) plan.tables.push({ spec, ups: [], dels: [] });
      try { await writeWithRetry(plan, null); applyPlan(plan); }
      catch (e) {
        if (Store.codeOf(e) !== 'CRM_CONFLICT') throw e;
        head = await Store.loadHead(pool); resetCommitted();   // someone else imported first: adopt theirs
        replaceState(normalizeState(adoptLoaded(await Store.loadAll(pool), head))); source = 'mysql (imported by another instance)';
      }
      settledRev = db.rev; headRev = Math.max(headRev, db.rev);
      console.log('MySQL was empty - imported ' + source + ' (' + db.bookings.length + ' bookings, ' + db.parties.length + ' accounts, ' + db.payments.length + ' payments).');
      await Store.insertBackup(pool, headRev, 'migration', exportCommittedJson(), BACKUP_KEEP).catch(e => { lastBackupError = e.message; });
    }
    afterLoad(); ensureAdmin();
    state = 'ready'; initialized = true;                  // allow commit() during the startup commit
    db.rev = Math.max(Number(db.rev) || 1, settledRev) + 0;
    const before = (Number(db.rev) || 1); save();         // persists normalisation / migrations if any rows changed
    await commit(); void before;
    lastBackupAt = await Store.lastBackupTime(pool).catch(() => 0);
    if (!lastBackupAt) await backupNow('startup').catch(e => { lastBackupError = e.message; });
    writeSnapshotNow();
    initError = '';
    console.log('Storage driver: MySQL (' + cfg.database + '@' + cfg.host + ':' + cfg.port + '), schema v' + Store.SCHEMA_VERSION + ', committed revision ' + headRev + '.');
  } catch (e) {
    state = 'failed'; initialized = false; initError = e.message;
    if (pool) { try { await pool.end(); } catch { /* ignore */ } pool = null; }
    throw e;
  }
}

/** Keep trying until the database is reachable (credentials errors included, slowly). Never falls back to JSON. */
async function initWithRetry(log = console) {
  let attempt = 0;
  for (;;) {
    try { await init(); return; }
    catch (e) {
      if (e.fatal) throw e;
      attempt++; const wait = Math.min(60000, 2000 * 2 ** Math.min(attempt - 1, 5));
      log.error('MySQL not ready (attempt ' + attempt + '): ' + e.message + ' - retrying in ' + Math.round(wait / 1000) + 's. The application stays offline until the database works; it will NOT use JSON files instead.');
      await sleep(wait);
    }
  }
}

async function shutdown() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!mysqlEnabled) { flush(); return; }
  if (state === 'ready') { await flushAsync(); if (snapshotTimer) { clearTimeout(snapshotTimer); snapshotTimer = null; } writeSnapshotNow(); }
  state = 'stopped';
  if (pool) { try { await pool.end(); } catch { /* ignore */ } pool = null; }
}

const isReady = () => state === 'ready';

async function health() {
  const base = { driver: mysqlEnabled ? 'mysql' : 'json', configured: mysqlEnabled, ready: state === 'ready', state, schemaVersion: mysqlEnabled ? Store.SCHEMA_VERSION : null,
    revision: Number(db.rev || 1), committedRevision: Math.min(settledRev, Number(db.rev || 1)), pendingWrites: Math.max(0, (Number(db.rev) || 1) - settledRev),
    headRevision: mysqlEnabled ? headRev : null, lastCommitAt: lastCommitAt || null, failedCommits, retriedWrites, rolledBack, resynced,
    lastError: lastError || (initError ? { message: initError, at: null } : null), lastBackupAt: lastBackupAt ? new Date(lastBackupAt).toISOString() : null, lastBackupError: lastBackupError || null, localSnapshotError: snapshotError || null };
  if (!mysqlEnabled) return { ...base, connected: false, healthy: true, note: 'MySQL is not configured: using DATA_DIR/db.json (development/test only).' };
  if (state !== 'ready') return { ...base, connected: false, healthy: false, error: initError || 'Database is not ready (' + state + ')' };
  let connected = false, error = null, headOk = false;
  try {
    const head = await Promise.race([Store.loadHead(pool), new Promise((_, rej) => setTimeout(() => rej(new Error('database ping timed out')), 4000).unref())]);
    connected = true; mysqlLastPingAt = Date.now();
    headOk = !!head && head.revision === headRev;
    if (!head) error = 'crm_head row is missing';
    else if (!headOk) error = 'The database is at revision ' + head.revision + ' but this process last committed ' + headRev + ' (another instance wrote to it).';
  } catch (e) { error = e.message; }
  const pending = base.pendingWrites;
  const healthy = connected && headOk && pending === 0 && !flushing;
  return { ...base, connected, healthy, error: error || (pending ? pending + ' revision(s) not yet committed' : null) };
}

// Normalize the shared object at module load so modules that capture D.db keep the same reference.
db = normalizeState(db || blank());

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

module.exports = { hooks, get db() { return db; }, DATA, fresh, hash, check, save, commit, requestScope, flush, flushAsync, init, initWithRetry, shutdown, isReady, health, backupNow, listBackups, restoreBackup, exportCommitted, status: () => ({ state, error: initError }), nid, today, fail, need, str, num, isoDate, logAct, party, token, uniqueNo, DEFAULT_ADMIN_PASSWORD };
