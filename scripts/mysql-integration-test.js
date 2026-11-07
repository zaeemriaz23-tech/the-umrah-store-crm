'use strict';
/**
 * Integration tests against a REAL MySQL / MariaDB server (no mocks).
 * Needs a server where TEST_DB_USER may create databases named crmtest_*:
 *   TEST_DB_HOST (127.0.0.1)  TEST_DB_PORT (3306)  TEST_DB_USER  TEST_DB_PASSWORD
 * Without TEST_DB_USER the suite reports SKIPPED (exit 0) unless REQUIRE_MYSQL_TESTS=1, which makes a missing server a failure (used in CI).
 */
const { spawn, spawnSync } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT = path.join(__dirname, '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const T = { host: process.env.TEST_DB_HOST || '127.0.0.1', port: +(process.env.TEST_DB_PORT || 3306), user: process.env.TEST_DB_USER, password: process.env.TEST_DB_PASSWORD || '' };
if (!T.user) {
  if (process.env.REQUIRE_MYSQL_TESTS === '1') { console.error('FAIL: TEST_DB_USER is not set but REQUIRE_MYSQL_TESTS=1'); process.exit(1); }
  console.log('SKIPPED: mysql-integration-test needs a real MySQL/MariaDB (set TEST_DB_USER / TEST_DB_PASSWORD / TEST_DB_HOST / TEST_DB_PORT). NOT RUN.');
  process.exit(0);
}

let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  PASS', m); } else { failN++; console.log('  FAIL', m, extra === undefined ? '' : '-> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000, step = 60) => { const t0 = Date.now(); for (;;) { try { const v = await f(); if (v) return v; } catch { /* keep polling */ } if (Date.now() - t0 > ms) return false; await sleep(step); } };
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-int-'));
const dbs = [], servers = [];

/* ---------- helpers ---------- */
async function admin() { return mysql.createConnection({ host: T.host, port: T.port, user: T.user, password: T.password }); }
async function newDb(tag) {
  const name = 'crmtest_' + process.pid + '_' + tag; const c = await admin();
  await c.query('DROP DATABASE IF EXISTS `' + name + '`'); await c.query('CREATE DATABASE `' + name + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'); await c.end(); dbs.push(name); return name;
}
async function q(db, sql, args) { const c = await mysql.createConnection({ host: T.host, port: T.port, user: T.user, password: T.password, database: db }); try { const [r] = await c.query(sql, args); return r; } finally { await c.end(); } }
const dataDir = tag => { const d = path.join(tmp, tag); fs.mkdirSync(d, { recursive: true }); return d; };

class Proxy {
  constructor() { this.socks = new Set(); this.srv = null; this.port = 0; }
  async start() {
    this.srv = net.createServer(c => { const t = net.connect(T.port, T.host); this.socks.add(c); this.socks.add(t); c.pipe(t); t.pipe(c); const done = () => { c.destroy(); t.destroy(); this.socks.delete(c); this.socks.delete(t); }; c.on('error', done); t.on('error', done); c.on('close', done); t.on('close', done); });
    await new Promise(r => this.srv.listen(this.port || 0, '127.0.0.1', r)); this.port = this.srv.address().port;
  }
  stop() { if (this.srv) { this.srv.close(); this.srv = null; } this.socks.forEach(s => s.destroy()); this.socks.clear(); }
}

class Srv {
  constructor(o) { this.o = o; this.out = ''; this.port = 0; this.proc = null; }
  async start(extra = {}) {
    this.port = await freePort();
    const env = { ...process.env, CRM_TEST_MODE: '1', NODE_ENV: 'test', ENV_FILE: '', PORT: String(this.port), DATA_DIR: this.o.dir, ADMIN_PASSWORD: 'AdminPass#1', DB_HOST: T.host, DB_PORT: String(this.o.dbPort || T.port), DB_NAME: this.o.db, DB_USER: T.user, DB_PASSWORD: T.password, DB_SSL: '0',
      DB_RETRY_BASE_MS: '100', DB_SNAPSHOT_DELAY_MS: '100', ...this.o.env, ...extra };
    this.proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    this.exited = new Promise(r => this.proc.on('exit', (code, sig) => r({ code, sig })));
    this.proc.stdout.on('data', d => { this.out += d; }); this.proc.stderr.on('data', d => { this.out += d; });
    servers.push(this);
    await until(() => /listening on port|running on port/.test(this.out), 15000);
    return this;
  }
  get base() { return 'http://127.0.0.1:' + this.port; }
  async ready(ms = 15000) { return until(async () => (await fetch(this.base + '/healthz')).status === 200, ms, 100); }
  async stop(sig = 'SIGTERM') { if (!this.proc || this.proc.exitCode !== null) return this.exited; this.proc.kill(sig); const r = await Promise.race([this.exited, sleep(15000).then(() => 'timeout')]); if (r === 'timeout') { this.proc.kill('SIGKILL'); } return r; }
  health() { return fetch(this.base + '/healthz').then(async r => ({ status: r.status, j: await r.json() })); }
}
class C {
  constructor(base) { this.base = base; this.c = ''; }
  async req(m, u, b) { const r = await fetch(this.base + u, { method: m, headers: { 'content-type': 'application/json', cookie: this.c }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) this.c = sc.split(';')[0]; const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j }; }
  login(l, p) { return this.req('POST', '/api/login', { login: l, password: p }); } rpc(op, p) { return this.req('POST', '/api/rpc', { op, ...p }); } get(u) { return this.req('GET', u); } post(u, b) { return this.req('POST', u, b); }
}
const PAX = n => [{ n, pp: 'PK' + Math.random().toString(36).slice(2, 9).toUpperCase(), g: 'M', t: 'adult' }];
const svc = (sell = 100000) => [{ type: 'other', title: 'Test service', qty: 1, sell, cost: 60000, cs: 'Requested', from: '2027-03-01', to: '2027-03-10' }];
async function login(s) { const a = new C(s.base); const r = await a.login('admin', 'AdminPass#1'); if (r.s !== 200) throw new Error('admin login failed: ' + JSON.stringify(r)); return a; }
const unq = v => (typeof v === 'string' && v.startsWith('"') ? JSON.parse(v) : v);   // mysql2 may or may not parse JSON_EXTRACT results
const sub = (o, ks) => Object.fromEntries(ks.map(k => [k, o[k]]));
const DATA_KEYS = ['parties', 'bookings', 'payments', 'entries', 'expenses', 'vouchers', 'users', 'groups', 'hotels', 'queries', 'paylinks'];

const EXPECTED_TABLES = ['crm_activity_log', 'crm_audit_log', 'crm_backups', 'crm_bookings', 'crm_chats', 'crm_departments', 'crm_expenses', 'crm_groups', 'crm_head', 'crm_hotels', 'crm_kv', 'crm_ledger_entries', 'crm_mail_log', 'crm_notifications', 'crm_parties', 'crm_paylinks', 'crm_payments', 'crm_promotions', 'crm_queries', 'crm_roles', 'crm_schema_migrations', 'crm_sessions', 'crm_signups', 'crm_tickets', 'crm_transport_prices', 'crm_transport_routes', 'crm_transport_vehicles', 'crm_users', 'crm_visa_tiers', 'crm_vouchers'];

(async () => {
  /* ============================================================ 1. fresh database */
  console.log('1. Fresh MySQL database: automatic schema creation + health');
  const db1 = await newDb('fresh'), dir1 = dataDir('fresh');
  const s1 = await new Srv({ db: db1, dir: dir1 }).start();
  ok(await s1.ready(), 'server becomes healthy on an empty database');
  let h = await s1.health();
  ok(h.status === 200 && h.j.ok === true && h.j.status === 'healthy', 'GET /healthz is 200/healthy', h);
  ok(h.j.version === VERSION, 'health reports the application version (' + VERSION + ')', h.j.version);
  ok(h.j.storage.driver === 'mysql' && h.j.storage.healthy === true && h.j.storage.connected === true, 'storage.driver=mysql, connected, healthy', h.j.storage);
  ok(h.j.storage.pendingWrites === 0 && h.j.storage.committedRevision === h.j.storage.revision, 'no uncommitted revision', h.j.storage);
  const tables = (await q(db1, 'SHOW TABLES')).map(r => Object.values(r)[0]).sort();
  ok(JSON.stringify(tables) === JSON.stringify(EXPECTED_TABLES), 'exactly the application tables exist (no unused/legacy tables)', tables);
  ok((await q(db1, 'SELECT version FROM crm_schema_migrations')).map(r => r.version).join() === '1', 'schema migration v1 recorded');
  ok((await q(db1, 'SELECT COUNT(*) n FROM crm_users WHERE id = "admin"'))[0].n === 1, 'administrator persisted in crm_users');
  ok((await q(db1, 'SELECT COUNT(*) n FROM crm_kv WHERE k = "settings"'))[0].n === 1, 'settings persisted in crm_kv');
  ok(fs.existsSync(path.join(dir1, 'db.json')), 'local recovery snapshot written');
  ok((await q(db1, 'SELECT COUNT(*) n FROM crm_backups'))[0].n >= 1, 'an initial database backup exists');
  let A = await login(s1);
  ok((await q(db1, 'SELECT COUNT(*) n FROM crm_sessions'))[0].n === 1, 'login session is stored in crm_sessions (committed before the login response)');

  /* ============================================================ 2. create / update agent, supplier, booking, payments, ledger */
  console.log('2. Agents, suppliers, bookings, payments, ledger, expenses');
  const ag = (await A.rpc('saveParty', { kind: 'agent', name: 'Al Noor Travels', phone: '0300 1112223', city: 'Lahore', limit: 5e6, login: 'alnoor', password: 'AgentPass#1' })).j;
  const sp = (await A.rpc('saveParty', { kind: 'supplier', name: 'Makkah Hotels Co', phone: '0311 0000000' })).j;
  ok(ag.ok && sp.ok, 'agent and supplier created', [ag, sp]);
  ok((await q(db1, 'SELECT name, kind FROM crm_parties ORDER BY ord')).map(r => r.kind + ':' + r.name).join('|') === 'agent:Al Noor Travels|supplier:Makkah Hotels Co', 'both rows are in crm_parties in order');
  ok((await A.rpc('saveParty', { id: ag.id, kind: 'agent', name: 'Al Noor Travels', phone: '0300 9999999', city: 'Karachi', limit: 7e6 })).s === 200, 'agent updated');
  ok((await q(db1, 'SELECT phone, JSON_EXTRACT(doc, "$.city") c FROM crm_parties WHERE id = ?', [String(ag.id)]))[0].phone === '0300 9999999', 'update is visible in the typed column');
  const bk = (await A.rpc('saveBooking', { partyId: ag.id, category: 'Custom', pax: PAX('Ahmed Raza'), services: svc(150000) })).j;
  ok(bk.ok && bk.id, 'booking created', bk);
  const bkRow = (await q(db1, 'SELECT booking_no, party_id, status FROM crm_bookings WHERE id = ?', [bk.id]))[0];
  ok(bkRow && bkRow.party_id === String(ag.id) && bkRow.status === 'Pending', 'booking row committed with its agent relationship', bkRow);
  ok((await A.rpc('setStatus', { id: bk.id, status: 'Confirmed' })).s === 200, 'booking status updated');
  ok((await q(db1, 'SELECT status FROM crm_bookings WHERE id = ?', [bk.id]))[0].status === 'Confirmed', 'status change persisted');
  const pay = (await A.rpc('addPayment', { partyId: ag.id, amt: 80000, method: 'Bank transfer', ref: 'TXN-1' })).j;
  ok(pay.ok && pay.status === 'Approved', 'payment recorded and approved', pay);
  const pay2 = (await A.rpc('addPayment', { partyId: sp.id, amt: 30000, method: 'Cash' })).j;
  ok(pay2.ok, 'supplier payment recorded');
  const je = (await A.rpc('addEntry', { partyId: ag.id, dr: 5000, t: 'Adjustment' })).j; ok(je.ok, 'ledger journal entry posted');
  const ex = (await A.rpc('addExpense', { cat: 'Rent', amt: 45000, note: 'Office' })).j; ok(ex.ok, 'expense added');
  const pr = (await q(db1, 'SELECT direction, amount, status, party_id FROM crm_payments ORDER BY ord')).map(r => r.direction + ':' + r.amount + ':' + r.status + ':' + r.party_id);
  ok(pr.join('|') === 'in:80000:Approved:' + ag.id + '|out:30000:Approved:' + sp.id, 'payments stored with direction/amount/party', pr);
  ok((await q(db1, 'SELECT debit, credit FROM crm_ledger_entries WHERE id = ?', [je.id]))[0].debit === 5000, 'ledger entry stored with debit amount');
  ok((await q(db1, 'SELECT amount, category FROM crm_expenses WHERE id = ?', [ex.id]))[0].amount === 45000, 'expense stored');
  const led = (await A.get('/api/ledger/' + ag.id)).j; ok(led.rows && led.rows.length >= 2, 'ledger API computes rows from persisted data', led.rows && led.rows.length);
  const beforeRestart = (await A.get('/api/backup')).j;
  const rowsLog = (await q(db1, 'SELECT COUNT(*) n FROM crm_activity_log'))[0].n; ok(rowsLog >= 6, 'activity log rows persisted (' + rowsLog + ')');
  const head1 = (await q(db1, 'SELECT revision FROM crm_head'))[0].revision; h = await s1.health();
  ok(h.j.storage.headRevision === +head1 && h.j.storage.committedRevision >= +head1 - 0 && h.j.storage.pendingWrites === 0, 'health revision equals crm_head.revision', [h.j.storage.headRevision, head1]);

  /* ============================================================ 3. restart */
  console.log('3. Restart: data and sessions survive');
  const cookieBefore = A.c;
  const r1 = await s1.stop(); ok(r1.code === 0, 'graceful SIGTERM exits with code 0', r1);
  ok(/Pending data committed/.test(s1.out), 'shutdown logged "Pending data committed"');
  const s1b = await new Srv({ db: db1, dir: dir1 }).start(); ok(await s1b.ready(), 'restarted server is healthy');
  const A2 = new C(s1b.base); A2.c = cookieBefore;
  ok((await A2.get('/api/portal/me')).j.user?.role === 'admin', 'login session survived the restart');
  const st = (await A2.get('/api/state')).j;
  ok(st.bookings.some(b => b.id === bk.id), 'booking reopens after restart (/api/state)');
  ok(st.parties.some(p => p.id === ag.id && p.city === 'Karachi'), 'agent update present after restart');
  const afterRestart = (await A2.get('/api/backup')).j;
  ok(JSON.stringify(sub(afterRestart, DATA_KEYS)) === JSON.stringify(sub(beforeRestart, DATA_KEYS)), 'all CRM collections are byte-identical after restart (order and content)');
  ok(afterRestart.seq === beforeRestart.seq + 1, 'ID sequence counter preserved (+1 = the audit entry of the /api/backup call itself)', [afterRestart.seq, beforeRestart.seq]);
  ok(JSON.stringify(afterRestart.settings) === JSON.stringify(beforeRestart.settings), 'settings identical after restart');
  ok(((await A2.rpc('saveBooking', { id: bk.id, partyId: ag.id, category: 'Custom', pax: beforeRestart.bookings[0].pax, services: svc(175000), notes: 'edited after restart' })).s) === 200, 'reopened booking can be edited');
  ok((await q(db1, 'SELECT JSON_EXTRACT(doc, "$.notes") n FROM crm_bookings WHERE id = ?', [bk.id])).map(r => unq(r.n))[0] === 'edited after restart', 'edit after restart is committed');

  /* ============================================================ 4. concurrent writes */
  console.log('4. Concurrent writes');
  const N = 40;
  const results = await Promise.all(Array.from({ length: N }, (_, i) => (i % 3 === 0 ? A2.rpc('addExpense', { cat: 'Other', amt: 1000 + i, note: 'c' + i }) : i % 3 === 1 ? A2.rpc('saveParty', { kind: 'agent', name: 'Concurrent Agent ' + i }) : A2.rpc('addEntry', { partyId: ag.id, cr: 100 + i, t: 'c' + i }))));
  ok(results.every(r => r.s === 200), 'all ' + N + ' parallel writes returned success', results.filter(r => r.s !== 200).slice(0, 2));
  const cnt = async t => (await q(db1, 'SELECT COUNT(*) n FROM ' + t))[0].n;
  ok((await q(db1, 'SELECT COUNT(*) n FROM crm_expenses WHERE JSON_EXTRACT(doc,"$.note") LIKE "\\"c%"'))[0].n === 14, '14 concurrent expenses all persisted');
  ok((await q(db1, 'SELECT COUNT(*) n FROM crm_parties WHERE name LIKE "Concurrent Agent%"'))[0].n === 13, '13 concurrent agents all persisted');
  ok((await q(db1, 'SELECT COUNT(*) n FROM crm_ledger_entries WHERE JSON_EXTRACT(doc,"$.t") LIKE "\\"c%"'))[0].n === 13, '13 concurrent ledger entries all persisted');
  const ids = (await q(db1, 'SELECT id FROM crm_parties')).map(r => r.id); ok(new Set(ids).size === ids.length, 'no duplicated IDs');
  h = await s1b.health(); const head2 = (await q(db1, 'SELECT revision FROM crm_head'))[0].revision;
  ok(h.j.storage.pendingWrites === 0 && h.j.storage.headRevision === +head2 && h.j.storage.healthy, 'revisions are in order and fully committed after the burst', h.j.storage);
  const memState = (await A2.get('/api/backup')).j; ok(memState.expenses.length === (await cnt('crm_expenses')) && memState.parties.length === (await cnt('crm_parties')), 'memory and database row counts agree');

  /* ============================================================ 5. database disconnection and recovery */
  console.log('5. Database disconnection and recovery');
  const db5 = await newDb('outage'), dir5 = dataDir('outage'), px = new Proxy(); await px.start();
  const s5 = await new Srv({ db: db5, dir: dir5, dbPort: px.port }).start(); ok(await s5.ready(), 'server healthy through the proxy');
  const A5 = await login(s5);
  ok((await A5.rpc('saveParty', { kind: 'agent', name: 'Before Outage' })).s === 200, 'write before outage succeeds');
  px.stop();                                                    // connection loss
  const t0 = Date.now(); const w = await A5.rpc('saveParty', { kind: 'agent', name: 'During Outage' });
  ok(w.s === 503 && /not saved|not applied/i.test(JSON.stringify(w.j)), 'write during outage is NOT reported as success (503)', w);
  ok(Date.now() - t0 < 20000, 'the failed write answered within a bounded time (' + (Date.now() - t0) + ' ms)');
  h = await s5.health(); ok(h.status === 503 && h.j.ok === false && h.j.storage.connected === false && h.j.storage.healthy === false && h.j.storage.driver === 'mysql', '/healthz is 503 / connected=false / healthy=false while MySQL is unreachable', h);
  ok((await A5.get('/api/state')).j.parties.every(p => p.name !== 'During Outage'), 'the unsaved change was rolled back in memory (no phantom data)');
  ok((await A5.rpc('saveParty', { kind: 'agent', name: 'During Outage 2' })).s === 503, 'writes keep failing cleanly while down');
  await px.start();                                              // recovery (same port)
  ok(await until(async () => (await s5.health()).status === 200, 15000), '/healthz recovers to 200 by itself after reconnect', await s5.health());
  ok((await A5.rpc('saveParty', { kind: 'agent', name: 'After Outage' })).s === 200, 'writes succeed again without restarting the app');
  const names5 = (await q(db5, 'SELECT name FROM crm_parties ORDER BY ord')).map(r => r.name);
  ok(names5.join('|') === 'Before Outage|After Outage', 'database holds exactly the acknowledged writes, none lost, none phantom', names5);
  // transient blip: connection comes back inside the retry window -> transparent success, exactly once
  px.stop(); const pending = A5.rpc('saveParty', { kind: 'agent', name: 'Retried Write' }); await sleep(350); await px.start();
  const rw = await pending; ok(rw.s === 200, 'a brief outage inside the retry window is retried transparently', rw);
  ok((await q(db5, 'SELECT COUNT(*) n FROM crm_parties WHERE name = "Retried Write"'))[0].n === 1, 'retried write was stored exactly once');
  ok((await s5.health()).j.storage.retriedWrites >= 1, 'health counts the retried writes');
  await s5.stop(); px.stop();

  /* ============================================================ 6. invalid credentials */
  console.log('6. Invalid credentials');
  const db6 = await newDb('badcred'), dir6 = dataDir('badcred');
  fs.writeFileSync(path.join(dir6, 'db.json'), JSON.stringify({ v: 3, rev: 5, seq: 1500, users: [], parties: [{ id: 5, kind: 'agent', name: 'JSON Only Agent' }], bookings: [], settings: {} }));
  const s6 = await new Srv({ db: db6, dir: dir6, env: { DB_PASSWORD: 'definitely-wrong' } }).start();
  await sleep(1500);
  h = await s6.health(); ok(h.status === 503 && h.j.storage.driver === 'mysql' && h.j.storage.healthy === false && /access denied/i.test(JSON.stringify(h.j.storage)), '/healthz = 503, driver mysql, error mentions "Access denied"', h);
  const api6 = await fetch(s6.base + '/api/state'); ok(api6.status === 503, 'the CRM API refuses to serve (no silent fallback to the JSON file)', api6.status);
  ok((await fetch(s6.base + '/')).status === 503, 'the site returns 503 instead of serving stale JSON data');
  ok(/retrying/i.test(s6.out) && /NOT use JSON/i.test(s6.out), 'startup log explains it will not use JSON');
  ok(JSON.parse(fs.readFileSync(path.join(dir6, 'db.json'), 'utf8')).parties[0].name === 'JSON Only Agent', 'db.json is untouched while MySQL is unreachable');
  await s6.stop();
  const s6b = await new Srv({ db: db6, dir: dir6 }).start(); ok(await s6b.ready(), 'with the correct password the same data directory starts normally');
  await s6b.stop();

  /* ============================================================ 7. JSON -> MySQL migration */
  console.log('7. Existing db.json is migrated exactly once');
  const db7 = await newDb('migrate'), dir7 = dataDir('migrate');
  const sid = 'a'.repeat(48), future = Date.now() + 864e5 * 3;
  const legacyJson = { v: 3, rev: 41, seq: 3050, settings: { prefix: 'ZZZ', company: { name: 'Migrated Co' } },
    users: [{ id: 'admin', role: 'admin', name: 'Administrator', login: 'admin', pw: 'x:y' }],
    parties: [{ id: 101, kind: 'agent', name: 'Imported Agent Ünïcode ✓', phone: '0300', email: '', city: 'Okara', address: '', notes: '', limit: 900000, opening: 1234, active: true, created: '2025-01-01' }, { id: 102, kind: 'supplier', name: 'Imported Supplier', phone: '', email: '', city: '', address: '', notes: '', limit: 0, opening: 0, active: true, created: '2025-01-01' }],
    bookings: [{ id: 'b2001', no: 'ZZZ-AB12-CD34', partyId: 101, category: 'Custom', status: 'Confirmed', pax: [{ n: 'Old Pax', pp: 'OLD1', g: 'M', t: 'adult' }], services: [{ id: 's1', type: 'other', title: 'Old', qty: 1, sell: 111000, cost: 50000, cs: 'Requested' }], from: '2026-01-01', to: '2026-01-05', notes: '', internal: '', created: '2025-12-01', createdAt: '2025-12-01T00:00:00.000Z', by: 'Administrator', history: [] }],
    payments: [{ id: 'PY-3001', dir: 'in', partyId: 101, amt: 111000, method: 'Cash', ref: '', date: '2025-12-02', rc: '', status: 'Approved', by: 'Administrator', note: '', bookingId: 'b2001' }],
    entries: [{ id: 'JV-3002', partyId: 101, date: '2025-12-03', t: 'Opening', dr: 0, cr: 500, by: 'Administrator' }], expenses: [{ id: 'EX-3003', date: '2025-12-04', cat: 'Rent', amt: 9000, note: '', by: 'Administrator' }],
    vouchers: [], queries: [], paylinks: [], groups: [], hotels: [{ id: 'h1', name: 'Imported Hotel' }], visaTiers: [], tVehicles: [], tRoutes: [], tPrices: [], log: [{ t: '2025-12-01T00:00:00.000Z', u: 'Administrator', a: 'Booking created', d: 'x' }], sessions: { [sid]: { uid: 'admin', exp: future } } };
  fs.writeFileSync(path.join(dir7, 'db.json'), JSON.stringify(legacyJson));
  const s7 = await new Srv({ db: db7, dir: dir7 }).start(); ok(await s7.ready(), 'server starts on empty MySQL + existing db.json');
  ok(/imported DATA_DIR\/db.json \(1 bookings, 2 accounts, 1 payments\)/.test(s7.out), 'startup log reports the one-time import');
  const m = (await q(db7, 'SELECT id, name FROM crm_parties ORDER BY ord')); ok(m.map(r => r.id + ':' + r.name).join('|') === '101:Imported Agent Ünïcode ✓|102:Imported Supplier', 'agent/supplier IDs, order and unicode preserved', m);
  ok((await q(db7, 'SELECT party_id, status, booking_no FROM crm_bookings WHERE id = "b2001"'))[0].party_id === '101', 'booking keeps its relationship to agent 101');
  ok((await q(db7, 'SELECT amount, booking_id FROM crm_payments WHERE id = "PY-3001"'))[0].amount === 111000, 'payment migrated with amount');
  ok((await q(db7, 'SELECT credit FROM crm_ledger_entries WHERE id = "JV-3002"'))[0].credit === 500, 'ledger entry migrated');
  ok((await q(db7, 'SELECT amount FROM crm_expenses WHERE id = "EX-3003"'))[0].amount === 9000, 'expense migrated');
  ok((await q(db7, 'SELECT user_id FROM crm_sessions WHERE sid = ?', [sid])).length === 1, 'existing login session migrated');
  const S7 = new C(s7.base); S7.c = 'sid=' + sid; ok((await S7.get('/api/portal/me')).j.user?.role === 'admin', 'the migrated session still logs the user in');
  ok(unq((await q(db7, 'SELECT JSON_EXTRACT(v,"$.prefix") p FROM crm_kv WHERE k="settings"'))[0].p) === 'ZZZ', 'settings migrated (custom prefix kept)');
  ok((await q(db7, 'SELECT v FROM crm_kv WHERE k="seq"'))[0].v >= 3050, 'ID sequence preserved (' + (await q(db7, 'SELECT v FROM crm_kv WHERE k="seq"'))[0].v + ')');
  ok(fs.readdirSync(path.join(dir7, 'backups')).some(f => /^pre-mysql-migration-/.test(f)), 'the original db.json was copied aside before migrating');
  await s7.stop();
  // never overwrite populated MySQL with an old JSON file
  fs.writeFileSync(path.join(dir7, 'db.json'), JSON.stringify({ ...legacyJson, parties: [{ id: 999, kind: 'agent', name: 'STALE JSON AGENT' }], bookings: [], payments: [] }));
  const s7b = await new Srv({ db: db7, dir: dir7 }).start(); ok(await s7b.ready(), 'restart with a stale db.json in DATA_DIR');
  ok((await q(db7, 'SELECT COUNT(*) n FROM crm_parties WHERE name = "STALE JSON AGENT"'))[0].n === 0 && (await q(db7, 'SELECT COUNT(*) n FROM crm_bookings'))[0].n === 1, 'populated MySQL data is NEVER overwritten by an old JSON file');
  ok(!(await (await new C(s7b.base).get('/api/state')).j.parties || []).some(p => p.id === 999), 'the stale JSON is not visible in the application');
  await s7b.stop();
  // invalid JSON + empty MySQL must stop, not create an empty CRM
  const db7c = await newDb('badjson'), dir7c = dataDir('badjson'); fs.writeFileSync(path.join(dir7c, 'db.json'), '{ not json');
  const s7c = await new Srv({ db: db7c, dir: dir7c }).start(); const ex7 = await Promise.race([s7c.exited, sleep(6000).then(() => null)]);
  ok(ex7 && ex7.code === 1 && /not valid JSON/.test(s7c.out), 'corrupt db.json + empty MySQL: startup stops with a clear error instead of creating an empty database', ex7);
  ok((await q(db7c, 'SELECT COUNT(*) n FROM crm_head'))[0].n === 0, '...and nothing was written to MySQL');
  // upgrade from the previous single-row crm_state layout (v3.10-v3.12)
  const db7d = await newDb('legacy'), dir7d = dataDir('legacy');
  await q(db7d, 'CREATE TABLE crm_state (id TINYINT UNSIGNED NOT NULL PRIMARY KEY, revision BIGINT UNSIGNED NOT NULL, payload LONGTEXT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)');
  await q(db7d, 'INSERT INTO crm_state (id, revision, payload) VALUES (1, 77, ?)', [JSON.stringify({ ...legacyJson, rev: 77, parties: [{ id: 555, kind: 'agent', name: 'From Legacy MySQL Row' }], bookings: [], payments: [] })]);
  fs.writeFileSync(path.join(dir7d, 'db.json'), JSON.stringify({ ...legacyJson, parties: [{ id: 556, kind: 'agent', name: 'Older JSON File' }] }));
  const s7d = await new Srv({ db: db7d, dir: dir7d }).start(); ok(await s7d.ready(), 'server starts over a legacy crm_state table');
  const lp = (await q(db7d, 'SELECT name FROM crm_parties')).map(r => r.name); ok(lp.join() === 'From Legacy MySQL Row', 'legacy MySQL data (not the older JSON file) is what gets migrated', lp);
  ok((await q(db7d, 'SELECT COUNT(*) n FROM crm_state'))[0].n === 1, 'the legacy table is left untouched');
  await s7d.stop();

  /* ============================================================ 8. backup & restore */
  console.log('8. Automatic backups, manual backup, restore');
  const db8 = await newDb('backup'), dir8 = dataDir('backup');
  const s8 = await new Srv({ db: db8, dir: dir8, env: { DB_BACKUP_INTERVAL_MS: '1500', DB_BACKUP_KEEP: '4' } }).start(); ok(await s8.ready(), 'server up with a 1.5 s backup interval');
  const A8 = await login(s8); await A8.rpc('saveParty', { kind: 'agent', name: 'Keep Me 1' });
  const man = await A8.post('/api/db/backups', {}); ok(man.s === 200 && man.j.ok && man.j.revision > 0, 'manual backup via API', man);
  const lst0 = (await A8.get('/api/db/backups')).j.items; const manualId = lst0.find(b => b.reason === 'manual').id; ok(lst0.length >= 2, 'backups are listed (' + lst0.length + ')');
  await A8.rpc('saveParty', { kind: 'agent', name: 'Added After Backup' }); await A8.rpc('addExpense', { cat: 'Rent', amt: 777, note: 'after backup' });
  await sleep(1800); await A8.rpc('addExpense', { cat: 'Rent', amt: 778, note: 'trigger auto backup' });
  ok(await until(async () => (await q(db8, 'SELECT COUNT(*) n FROM crm_backups WHERE reason = "auto"'))[0].n >= 1, 6000), 'an automatic backup was written after the interval');
  for (let i = 0; i < 6; i++) { await sleep(1700); await A8.rpc('addExpense', { cat: 'Other', amt: 10 + i }); }
  ok(await until(async () => (await q(db8, 'SELECT COUNT(*) n FROM crm_backups'))[0].n <= 4, 5000), 'old backups are pruned (DB_BACKUP_KEEP=4)', (await q(db8, 'SELECT COUNT(*) n FROM crm_backups'))[0].n);
  // the manual backup may have been pruned; take a fresh known-good one
  await A8.rpc('saveParty', { kind: 'agent', name: 'Final Before Snapshot' }); const good = await A8.post('/api/db/backups', {}); const goodRev = good.j.revision;
  const gid = (await A8.get('/api/db/backups')).j.items.find(b => b.revision === goodRev && b.reason === 'manual').id;
  await A8.rpc('saveParty', { kind: 'agent', name: 'Mistake Agent' }); await A8.rpc('delParty', { id: (await A8.get('/api/state')).j.parties.find(p => p.name === 'Keep Me 1').id });
  ok((await q(db8, 'SELECT COUNT(*) n FROM crm_parties WHERE name = "Mistake Agent"'))[0].n === 1 && (await q(db8, 'SELECT COUNT(*) n FROM crm_parties WHERE name = "Keep Me 1"'))[0].n === 0, 'simulated mistakes exist in the database (agent added, another deleted)');
  await s8.stop();
  const rst = spawnSync(process.execPath, ['scripts/db-tool.js', 'restore', String(gid)], { cwd: ROOT, env: { ...process.env, CRM_TEST_MODE: '1', ENV_FILE: '', DATA_DIR: dir8, DB_HOST: T.host, DB_PORT: String(T.port), DB_NAME: db8, DB_USER: T.user, DB_PASSWORD: T.password, DB_SNAPSHOT_DELAY_MS: '50' }, encoding: 'utf8', timeout: 60000 });
  ok(rst.status === 0 && /Restored/.test(rst.stdout), 'scripts/db-tool.js restore <id> succeeds', rst.stdout + rst.stderr);
  const names8 = (await q(db8, 'SELECT name FROM crm_parties ORDER BY ord')).map(r => r.name);
  ok(names8.includes('Keep Me 1') && names8.includes('Final Before Snapshot') && !names8.includes('Mistake Agent'), 'restore brought back the deleted agent and removed the later mistake', names8);
  ok((await q(db8, 'SELECT COUNT(*) n FROM crm_backups WHERE reason = "pre-restore"'))[0].n === 1, 'a pre-restore safety backup was taken');
  const s8b = await new Srv({ db: db8, dir: dir8 }).start(); ok(await s8b.ready(), 'app starts on the restored database');
  const st8 = (await (await login(s8b)).get('/api/state')).j; ok(st8.parties.some(p => p.name === 'Keep Me 1') && !st8.parties.some(p => p.name === 'Mistake Agent'), 'application shows the restored data');
  const ver = spawnSync(process.execPath, ['scripts/db-tool.js', 'verify'], { cwd: ROOT, env: { ...process.env, CRM_TEST_MODE: '1', ENV_FILE: '', DATA_DIR: dir8, DB_HOST: T.host, DB_PORT: String(T.port), DB_NAME: db8, DB_USER: T.user, DB_PASSWORD: T.password, DB_SNAPSHOT_DELAY_MS: '50' }, encoding: 'utf8', timeout: 60000 });
  ok(ver.status === 0 && !/DIFF/.test(ver.stdout), 'db-tool verify: every table reloads to exactly the in-memory state', ver.stdout + ver.stderr);
  await s8b.stop();
  const snap = JSON.parse(fs.readFileSync(path.join(dir8, 'db.json'), 'utf8'));
  ok(snap.parties.map(p => p.name).join('|') === (await q(db8, 'SELECT name FROM crm_parties ORDER BY ord')).map(r => r.name).join('|'), 'local recovery snapshot (db.json) equals the committed MySQL state');

  /* ============================================================ 9. shutdown commits pending writes */
  console.log('9. Safe shutdown commits pending writes');
  const db9 = await newDb('shutdown'), dir9 = dataDir('shutdown'); const s9 = await new Srv({ db: db9, dir: dir9 }).start(); await s9.ready(); const A9 = await login(s9);
  const inflight = Array.from({ length: 25 }, (_, i) => A9.rpc('addExpense', { cat: 'Other', amt: 100 + i, note: 'sd' + i }).catch(e => ({ s: 0, e: String(e) })));
  await sleep(15); const stopP = s9.stop('SIGTERM'); const rs = await Promise.all(inflight); const ex9 = await stopP;
  const okIds = rs.filter(r => r.s === 200).length; const inDb = (await q(db9, 'SELECT COUNT(*) n FROM crm_expenses'))[0].n;
  ok(ex9.code === 0, 'process exited cleanly (code 0)', ex9);
  ok(okIds > 0 && inDb === okIds, 'every write acknowledged with 200 before exit is in the database (' + okIds + ' acked, ' + inDb + ' stored)', { okIds, inDb, statuses: rs.map(r => r.s).join('') });

  /* ============================================================ 10. two overlapping instances (deploy overlap) */
  console.log('10. Two instances on one database: no lost updates');
  const db10 = await newDb('twin'), dir10a = dataDir('twinA'), dir10b = dataDir('twinB');
  const sa = await new Srv({ db: db10, dir: dir10a }).start(); await sa.ready(); const sb = await new Srv({ db: db10, dir: dir10b }).start(); await sb.ready();
  const Aa = await login(sa); let Ab; try { Ab = await login(sb); } catch { Ab = await login(sb); }   // B's first write is refused once (stale revision) and triggers its re-sync
  const a1 = await Aa.rpc('saveParty', { kind: 'agent', name: 'Written By A (stale)' });
  ok(a1.s === 503, 'instance A is now stale (B wrote after A loaded): its write is refused instead of overwriting B', a1);
  ok((await Aa.rpc('saveParty', { kind: 'agent', name: 'Written By A' })).s === 200, 'after its automatic re-sync instance A can write again');
  const b1 = await Ab.rpc('saveParty', { kind: 'agent', name: 'Written By B (stale)' });
  ok(b1.s === 503, 'instance B (stale revision) is refused instead of overwriting A', b1);
  ok((await Ab.get('/api/state')).j.parties.some(p => p.name === 'Written By A'), "instance B re-synced from the database and now sees A's data");
  ok((await Ab.rpc('saveParty', { kind: 'agent', name: 'Written By B' })).s === 200, 'instance B can write again after the re-sync');
  const nm = (await q(db10, 'SELECT name FROM crm_parties ORDER BY ord')).map(r => r.name); ok(nm.join('|') === 'Written By A|Written By B', 'no lost updates; refused writes left no trace in the database', nm);
  await sa.stop(); await sb.stop();

  /* ============================================================ 11. record ordering / identity engine */
  console.log('11. Row identity and ordering (unshift, middle delete, reorder, replace, front-trim)');
  const db11 = await newDb('order'), dir11 = dataDir('order');
  const script = f => `const D=require(${JSON.stringify(path.join(ROOT, 'lib/db.js'))});const sleep=ms=>new Promise(r=>setTimeout(r,ms));(async()=>{await D.init();${f}await D.shutdown();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`;
  const run = f => spawnSync(process.execPath, ['-e', script(f)], { cwd: ROOT, env: { ...process.env, CRM_TEST_MODE: '1', ENV_FILE: '', DATA_DIR: dir11, DB_HOST: T.host, DB_PORT: String(T.port), DB_NAME: db11, DB_USER: T.user, DB_PASSWORD: T.password, DB_SNAPSHOT_DELAY_MS: '10' }, encoding: 'utf8', timeout: 60000 });
  const p1 = run(`const d=D.db;const C=async()=>{D.save();await D.commit()};for(let i=1;i<=6;i++)d.hotels.push({id:'h'+i,name:'Hotel '+i});d.hotels.unshift({id:'h0',name:'Hotel 0'});await C();
    d.hotels.splice(3,1);await C();           // delete from the middle
    d.hotels.splice(2,0,{id:'hmid',name:'Inserted mid'});await C();  // insert in the middle
    d.hotels.sort((a,b)=>b.id<a.id?-1:1);await C();                   // reorder in place
    d.hotels[0].name='Renamed';d.hotels=d.hotels.map(h=>({...h}));await C(); // replace every object (new identity)
    for(let i=0;i<30;i++){D.logAct(null,'act'+i,'x');} await C(); d.log.splice(0,10);await C(); // keyless collection trimmed from the front
    const want=JSON.stringify({hotels:d.hotels,log:d.log});require('fs').writeFileSync(process.env.DATA_DIR+'/expect.json',want);`);
  ok(p1.status === 0, 'ordering operations ran and committed', p1.stderr);
  const p2 = run(`const want=require('fs').readFileSync(process.env.DATA_DIR+'/expect.json','utf8');const got=JSON.stringify({hotels:D.db.hotels,log:D.db.log.slice(-20)});const exp=JSON.parse(want);
    if(JSON.stringify(D.db.hotels)!==JSON.stringify(exp.hotels))throw new Error('hotels differ: '+JSON.stringify(D.db.hotels.map(h=>h.id))+' vs '+JSON.stringify(exp.hotels.map(h=>h.id)));
    if(JSON.stringify(D.db.log.slice(-exp.log.length))!==JSON.stringify(exp.log))throw new Error('log tail differs');console.log('ORDER_OK '+D.db.hotels.map(h=>h.id).join(','));`);
  ok(p2.status === 0 && /ORDER_OK/.test(p2.stdout), 'a fresh process loads the identical order and content from MySQL', p2.stderr || p2.stdout);
  ok((await q(db11, 'SELECT COUNT(*) n FROM crm_hotels'))[0].n === 7, 'row count matches (deletes were applied)');

  /* ============================================================ 12. hard kill */
  console.log('12. kill -9 during a write burst: acknowledged writes survive, database stays consistent');
  const db12 = await newDb('kill9'), dir12 = dataDir('kill9'); const s12 = await new Srv({ db: db12, dir: dir12 }).start(); await s12.ready(); const A12 = await login(s12);
  let ackedN = 0;
  const burst = Array.from({ length: 150 }, (_, i) => A12.rpc('addExpense', { cat: 'Other', amt: 500 + i, note: 'k' + i }).then(r => { if (r.s === 200) ackedN++; return r; }).catch(() => ({ s: 0 })));
  await until(() => ackedN >= 5, 10000, 2); s12.proc.kill('SIGKILL'); const br = await Promise.all(burst); await s12.exited;
  ok(ackedN >= 5 && ackedN < 150, 'the process was killed mid-burst (' + ackedN + ' of 150 acknowledged)');
  const acked = br.filter(r => r.s === 200).map(r => r.j.id), stored = new Set((await q(db12, 'SELECT id FROM crm_expenses')).map(r => r.id));
  ok(acked.every(id => stored.has(id)), 'every write acknowledged before the crash is in MySQL (' + acked.length + ' acked, ' + stored.size + ' stored)', acked.filter(id => !stored.has(id)));
  const s12b = await new Srv({ db: db12, dir: dir12 }).start(); ok(await s12b.ready(), 'app restarts cleanly after a hard kill');
  const st12 = (await (await login(s12b)).get('/api/state')).j; ok(st12.expenses.length === stored.size, 'application state equals the database after the crash (' + st12.expenses.length + ')');
  ok((await s12b.health()).j.storage.healthy === true, 'health is healthy after crash recovery');
  await s12b.stop();

  /* ============================================================ done */
})().catch(e => { failN++; console.error('TEST HARNESS ERROR:', e && e.stack || e); }).finally(async () => {
  for (const s of servers) { try { if (s.proc && s.proc.exitCode === null) s.proc.kill('SIGKILL'); } catch { /* ignore */ } }
  try { const c = await admin(); for (const d of dbs) await c.query('DROP DATABASE IF EXISTS `' + d + '`'); await c.end(); } catch { /* ignore */ }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + pass + ' passed, ' + failN + ' failed');
  process.exit(failN ? 1 : 0);
});
