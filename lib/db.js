'use strict';
/**
 * Data store: one JSON document, written atomically (tmp + rename), debounced.
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

let db, fresh = false;
try { db = JSON.parse(fs.readFileSync(DBF, 'utf8')); }
catch { fresh = true; db = null; }

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

if (!db) db = blank();
else if (!db.v || db.v < 3) db = migrateV2(db);
const dflt = defaultSettings();
db.settings = { ...dflt, ...(db.settings || {}), company: { ...dflt.company, ...((db.settings || {}).company || {}) }, sla: { ...dflt.sla, ...((db.settings || {}).sla || {}) }, payfast: { ...dflt.payfast, ...((db.settings || {}).payfast || {}) }, calc: { ...dflt.calc, ...((db.settings || {}).calc || {}) }, groq: { ...dflt.groq, ...((db.settings || {}).groq || {}) }, payments: { ...dflt.payments, ...((db.settings || {}).payments || {}) }, security: { ...dflt.security, ...((db.settings || {}).security || {}) } };
delete db.settings.anthropicKey;
if (!db.settings.contactV) { Object.assign(db.settings.company, { phone: '+92 313 693 5568', whatsapp: '+92 313 693 5568', email: 'info@theumrahstore.com', address: 'Branches: Lahore · Okara · Islamabad', branches: 'Lahore, Okara, Islamabad' }); db.settings.contactV = 1; }
['users', 'parties', 'bookings', 'vouchers', 'payments', 'entries', 'expenses', 'queries', 'paylinks', 'groups', 'hotels', 'visaTiers', 'tVehicles', 'tRoutes', 'tPrices', 'log', 'tickets', 'notifs'].forEach(k => { db[k] = db[k] || []; });
db.sessions = db.sessions || {}; db.rev = db.rev || 1; db.v = 3;

/* the admin account always exists */
(function ensureAdmin() {
  let a = db.users.find(u => u.id === 'admin');
  const pw = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  if (!a) { db.users.unshift({ id: 'admin', role: 'admin', name: 'Administrator', login: 'admin', pw: hash(pw), mustChange: !process.env.ADMIN_PASSWORD }); }
  else if (process.env.RESET_ADMIN === '1') { a.pw = hash(pw); a.mustChange = !process.env.ADMIN_PASSWORD; }
})();

/* ---------- persistence ---------- */
let timer = null, dirty = false, lastBackup = 0;
function writeNow() {
  if (!dirty) return;
  dirty = false;
  const tmp = DBF + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DBF);
  if (Date.now() - lastBackup > 864e5) { // one rolling backup per day, keep 14
    lastBackup = Date.now();
    try {
      fs.copyFileSync(DBF, path.join(DATA, 'backups', 'db-' + new Date().toISOString().slice(0, 10) + '.json'));
      const fl = fs.readdirSync(path.join(DATA, 'backups')).sort();
      fl.slice(0, Math.max(0, fl.length - 14)).forEach(f => fs.unlinkSync(path.join(DATA, 'backups', f)));
    } catch { /* non-fatal */ }
  }
}
const hooks = []; let inHook = false;
function save() { if (!inHook) { inHook = true; try { hooks.forEach(h => h()); } catch (e) { console.error('hook failed', e); } finally { inHook = false; } } db.rev++; dirty = true; if (!timer) timer = setTimeout(() => { timer = null; try { writeNow(); } catch (e) { console.error('save failed', e); } }, 400); }
function flush() { if (timer) { clearTimeout(timer); timer = null; } try { writeNow(); } catch (e) { console.error('flush failed', e); } }
process.on('SIGTERM', () => { flush(); process.exit(0); });
process.on('SIGINT', () => { flush(); process.exit(0); });
dirty = true; writeNow(); // persist migration / first run

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

module.exports = { hooks, db, DATA, fresh, hash, check, save, flush, nid, today, fail, need, str, num, isoDate, logAct, party, token, uniqueNo, DEFAULT_ADMIN_PASSWORD };
