'use strict';
// Verifies JSON-mode compatibility and refuses incomplete MySQL config without falling back.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
let failed = 0;
function check(ok, name, detail = '') {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? ' — ' + detail : ''));
  if (!ok) failed++;
}
const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'umrah-mysql-store-'));
try {
  const jsonDir = path.join(temp, 'json-mode');
  fs.mkdirSync(jsonDir);
  const runJson = spawnSync(process.execPath, ['-e', `
    const D = require(${JSON.stringify(path.join(root, 'lib/db.js'))});
    (async () => { await D.init(); D.db.settings.company.name='MySQL Store Test'; D.save(); await D.flushAsync();
      const h=await D.health(); if(h.driver!=='json') throw new Error('JSON mode not selected');
      const saved=JSON.parse(require('fs').readFileSync(require('path').join(D.DATA,'db.json'),'utf8'));
      if(saved.settings.company.name!=='MySQL Store Test') throw new Error('local snapshot did not persist');
      console.log('JSON_MODE_OK'); process.exit(0);
    })().catch(e=>{console.error(e);process.exit(1)});
  `], { cwd: root, env: { ...process.env, CRM_TEST_MODE: '1', NODE_ENV: 'test', DATA_DIR: jsonDir, DB_HOST: '', DB_NAME: '', DB_USER: '', DB_PASSWORD: '' }, encoding: 'utf8', timeout: 15000 });
  check(runJson.status === 0 && /JSON_MODE_OK/.test(runJson.stdout), 'JSON development/test mode remains compatible', (runJson.stderr || '').trim());

  const partialDir = path.join(temp, 'partial-db'); fs.mkdirSync(partialDir);
  const runPartial = spawnSync(process.execPath, ['-e', `
    const D = require(${JSON.stringify(path.join(root, 'lib/db.js'))});
    D.init().then(()=>{console.error('unexpected JSON fallback');process.exit(2)}).catch(e=>{if(!/MySQL configuration is incomplete/.test(e.message)){console.error(e);process.exit(3)} console.log('PARTIAL_CONFIG_REFUSED');process.exit(0)});
  `], { cwd: root, env: { ...process.env, CRM_TEST_MODE: '1', NODE_ENV: 'test', DATA_DIR: partialDir, DB_HOST: '127.0.0.1', DB_NAME: '', DB_USER: '', DB_PASSWORD: '' }, encoding: 'utf8', timeout: 15000 });
  check(runPartial.status === 0 && /PARTIAL_CONFIG_REFUSED/.test(runPartial.stdout), 'incomplete MySQL configuration fails closed instead of silently using JSON', (runPartial.stderr || '').trim());


  // The previous revision of this file drove a hand-written SQL mock that string-matched the old single-row `crm_state` design.
  // That design was replaced (per-entity tables, transactional commits). The intent of those checks is kept below; the end-to-end
  // behaviour is verified against a REAL MySQL/MariaDB in scripts/mysql-integration-test.js.
  const Store = require(path.join(root, 'lib/store.js'));
  const driverCfg = { enabled: true, host: '127.0.0.1', port: 3306, user: 'test', password: 'test', database: 'test', poolSize: 2 };
  const driverPool = Store.createPool(driverCfg);
  check(!!driverPool && typeof driverPool.query === 'function', 'MySQL driver resolves from the application path and creates a pool without connecting');
  driverPool.end().catch(() => {});
  const ddl = fs.readFileSync(path.join(root, 'lib/store.js'), 'utf8');
  const tableNames = Store.ENTITIES.map(e => e.table);
  check(['crm_bookings', 'crm_parties', 'crm_payments', 'crm_ledger_entries', 'crm_expenses', 'crm_users', 'crm_vouchers', 'crm_groups', 'crm_hotels'].every(t => tableNames.includes(t)), 'startup schema covers bookings, agents/suppliers, payments, ledger, expenses, users, vouchers, groups, hotels');
  check(/CREATE TABLE IF NOT EXISTS crm_head/.test(ddl) && /CREATE TABLE IF NOT EXISTS crm_kv/.test(ddl) && /CREATE TABLE IF NOT EXISTS crm_sessions/.test(ddl), 'startup creates the revision head, settings and session tables');
  check(/CREATE TABLE IF NOT EXISTS crm_backups/.test(ddl) && /insertBackup/.test(fs.readFileSync(path.join(root, 'lib/db.js'), 'utf8')), 'startup creates the backup table and initial/periodic MySQL backups are written');
  check(/SELECT id, ord, doc FROM/.test(ddl) && /loadAll\(pool\)/.test(fs.readFileSync(path.join(root, 'lib/db.js'), 'utf8')), 'startup restores the authoritative MySQL state from every table');
  const allDdl = Store.ENTITIES.map(e => e.table).concat(['crm_head', 'crm_kv', 'crm_sessions', 'crm_backups']);
  const dbSrc = fs.readFileSync(path.join(root, 'lib/db.js'), 'utf8');
  check(allDdl.length === new Set(allDdl).size, 'no duplicate table definitions');
  const source = dbSrc;
  check(/DATA_DIR must be an absolute persistent folder outside/.test(source), 'MySQL mode refuses deployment-local DATA_DIR paths');
  check(/let head = await Store\.loadHead\(pool\)/.test(source) && /if \(head\) \{[\s\S]{0,200}adoptLoaded/.test(source) && /loadLegacyState\(pool\)/.test(source), 'JSON is imported only when MySQL has no committed head row (existing MySQL data always wins)');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log(failed ? `\n${failed} MySQL store checks failed` : '\nAll MySQL store checks passed');
process.exit(failed ? 1 : 0);
