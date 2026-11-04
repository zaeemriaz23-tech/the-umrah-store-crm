'use strict';
// Isolated MySQL adapter test. A small in-memory driver mock verifies table creation,
// safe import from the existing JSON document, and persistence of a later revision.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'umrah-mysql-test-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const hash = 'salt:hash';
  const initial = {
    v: 3, rev: 8, seq: 1005,
    users: [{ id: 'admin', role: 'admin', name: 'Administrator', login: 'admin', pw: hash }],
    parties: [{ id: 1, kind: 'agent', name: 'Test Agent' }],
    bookings: [], vouchers: [], payments: [], entries: [], expenses: [], queries: [], paylinks: [],
    groups: [], hotels: [], visaTiers: [], tVehicles: [], tRoutes: [], tPrices: [], log: [],
    sessions: {}, settings: { company: { name: 'The Umrah Store' } }
  };
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify(initial));

  const mock = { state: null, backups: [], created: [], closed: false };
  const pool = {
    async query(sql) {
      if (/^SELECT 1/.test(sql)) return [[{ 1: 1 }], []];
      if (/CREATE TABLE IF NOT EXISTS crm_state\s*\(/i.test(sql)) { mock.created.push('crm_state'); return [{}, []]; }
      if (/CREATE TABLE IF NOT EXISTS crm_state_backups\s*\(/i.test(sql)) { mock.created.push('crm_state_backups'); return [{}, []]; }
      if (/SELECT created_at FROM crm_state_backups/i.test(sql)) return [mock.backups.length ? [{ created_at: mock.backups[mock.backups.length - 1].created_at }] : [], []];
      if (/DELETE FROM crm_state_backups/i.test(sql)) { mock.backups = mock.backups.filter(x => new Date(x.created_at) >= sql[1]); return [{ affectedRows: 0 }, []]; }
      throw new Error('Unexpected mock query: ' + sql);
    },
    async execute(sql, args) {
      if (/SELECT revision, payload FROM crm_state/i.test(sql)) return [mock.state ? [{ revision: mock.state.revision, payload: mock.state.payload }] : [], []];
      if (/INSERT INTO crm_state \(/i.test(sql)) { mock.state = { revision: Number(args[0]), payload: args[1] }; return [{ affectedRows: 1 }, []]; }
      if (/UPDATE crm_state SET revision/i.test(sql)) { mock.state = { revision: Number(args[0]), payload: args[1] }; return [{ affectedRows: 1 }, []]; }
      if (/INSERT INTO crm_state_backups/i.test(sql)) { mock.backups.push({ revision: Number(args[0]), payload: args[1], created_at: new Date() }); return [{ affectedRows: 1 }, []]; }
      if (/DELETE FROM crm_state_backups/i.test(sql)) { mock.backups = mock.backups.filter(x => new Date(x.created_at) >= args[0]); return [{ affectedRows: 0 }, []]; }
      throw new Error('Unexpected mock execute: ' + sql);
    },
    async end() { mock.closed = true; }
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'mysql2/promise') return { createPool: () => pool };
    return originalLoad.call(this, request, parent, isMain);
  };

  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = dataDir;
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3306';
  process.env.DB_NAME = 'umrah_crm';
  process.env.DB_USER = 'umrah_admin';
  process.env.DB_PASSWORD = 'test-password';
  delete process.env.PUBLIC_URL;
  delete process.env.ALLOW_EMPTY_DB;

  try {
    const dbPath = path.resolve(__dirname, '../lib/db.js');
    delete require.cache[dbPath];
    const D = require(dbPath);
    await D.ready;
    assert.deepEqual(mock.created.sort(), ['crm_state', 'crm_state_backups']);
    assert.equal(mock.state.revision, 8);
    assert.equal(D.db.parties[0].name, 'Test Agent');
    assert.ok(mock.backups.length >= 1, 'initial SQL backup created');
    D.db.parties.push({ id: 2, kind: 'supplier', name: 'SQL Supplier' });
    D.save();
    await D.flush();
    const saved = JSON.parse(mock.state.payload);
    assert.equal(mock.state.revision, D.db.rev);
    assert.equal(saved.parties.at(-1).name, 'SQL Supplier');
    console.log('PASS mysql-store: creates tables, imports JSON safely, and persists revisions.');
    await pool.end();
    delete require.cache[dbPath];
  } finally {
    Module._load = originalLoad;
    for (const key of ['DATA_DIR','MYSQL_HOST','MYSQL_PORT','MYSQL_DATABASE','MYSQL_USER','MYSQL_PASSWORD','MYSQL_SSL','DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','DB_SSL','NODE_ENV','PUBLIC_URL','ALLOW_EMPTY_DB']) delete process.env[key];
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
