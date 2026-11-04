#!/usr/bin/env node
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const project = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (condition, label) => { console.log((condition ? '  PASS  ' : '  FAIL  ') + label); if (condition) pass++; else fail++; };
const temp = name => fs.mkdtempSync(path.join(os.tmpdir(), 'umrah-' + name + '-'));
const run = (dir, extra = {}, code = "require('./lib/db')") => cp.spawnSync(process.execPath, ['-e', code], {
  cwd: project, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir, ADMIN_PASSWORD: 'Storage-Test-Admin#2026', ...extra }
});
(async () => {
  // Missing initialized DB must fail closed and must not create a blank file.
  const missing = temp('missing');
  const a = run(missing, { ALLOW_EMPTY_DB: '0' });
  ok(a.status !== 0 && /instead of creating an empty database/.test(a.stderr) && !fs.existsSync(path.join(missing, 'db.json')), 'missing database fails closed without writing a blank database');

  // Explicit first install works and creates initialization marker + daily backup.
  const fresh = temp('fresh');
  const b = run(fresh, { ALLOW_EMPTY_DB: '1' });
  ok(b.status === 0 && fs.existsSync(path.join(fresh, 'db.json')) && fs.existsSync(path.join(fresh, '.crm-initialized')), 'explicit first install creates database and permanent initialization marker');
  ok(fs.readdirSync(path.join(fresh, 'backups')).some(x => /^db-\d{4}-\d{2}-\d{2}(?:T.*)?\.json$/.test(x)), 'first install creates an initial database checkpoint');

  // An initialized store missing its DB may never reinitialize.
  fs.unlinkSync(path.join(fresh, 'db.json'));
  const c = run(fresh, { ALLOW_EMPTY_DB: '1' });
  ok(c.status !== 0 && /initialized DATA_DIR/.test(c.stderr) && !fs.existsSync(path.join(fresh, 'db.json')), 'initialized store refuses to recreate a missing database even if ALLOW_EMPTY_DB is set');
  const staleSource = temp('stale-source');
  fs.writeFileSync(path.join(staleSource, 'db.json'), JSON.stringify({ v: 3, users: [{ id: 'admin', role: 'admin', name: 'Old', login: 'admin', pw: 'x:y' }], parties: [], bookings: [], vouchers: [], payments: [], entries: [], expenses: [], queries: [], paylinks: [], groups: [], hotels: [], visaTiers: [], tVehicles: [], tRoutes: [], tPrices: [], log: [], sessions: {}, settings: {} }));
  const c2 = run(fresh, { ALLOW_EMPTY_DB: '1', LEGACY_DATA_DIR: staleSource });
  ok(c2.status !== 0 && /initialized DATA_DIR/.test(c2.stderr) && !fs.existsSync(path.join(fresh, 'db.json')), 'initialized store does not resurrect stale legacy data if its live DB disappears');

  // Malformed JSON remains untouched.
  const corrupt = temp('corrupt');
  fs.writeFileSync(path.join(corrupt, 'db.json'), '{broken');
  const d = run(corrupt, { ALLOW_EMPTY_DB: '1' });
  ok(d.status !== 0 && /invalid JSON/.test(d.stderr) && fs.readFileSync(path.join(corrupt, 'db.json'), 'utf8') === '{broken', 'corrupt database fails closed and is not overwritten');

  // A wrong-shaped record collection must never be normalized to an empty list.
  const wrongShape = temp('wrong-shape');
  fs.writeFileSync(path.join(wrongShape, 'db.json'), JSON.stringify({ v: 3, users: [], parties: 'not-an-array', bookings: [], vouchers: [], payments: [], entries: [], expenses: [], queries: [], paylinks: [], groups: [], hotels: [], visaTiers: [], tVehicles: [], tRoutes: [], tPrices: [], log: [], settings: {}, sessions: {} }));
  const shape = run(wrongShape);
  ok(shape.status !== 0 && /parties.*not an array/.test(shape.stderr), 'wrong-shaped collection fails closed instead of becoming empty');

  // A syntactically valid but truncated v3 file must not have missing collections filled with empty arrays.
  const truncated = temp('truncated-v3');
  fs.writeFileSync(path.join(truncated, 'db.json'), JSON.stringify({ v: 3, users: [], settings: {}, sessions: {} }));
  const trunc = run(truncated, { ALLOW_EMPTY_DB: '1' });
  ok(trunc.status !== 0 && /missing required v3 collection/.test(trunc.stderr), 'truncated v3 database fails closed instead of inventing empty collections');

  // Copy old data tree to an external persistent location; source is retained.
  const legacy = temp('legacy'), target = temp('target');
  const legacyDb = { v: 3, rev: 7, seq: 1001, users: [{ id: 'admin', role: 'admin', name: 'Administrator', login: 'admin', pw: 'x:y' }], parties: [{ id: 44, kind: 'agent', name: 'Do Not Lose' }], bookings: [], vouchers: [], payments: [], entries: [], expenses: [], queries: [], paylinks: [], groups: [], hotels: [], visaTiers: [], tVehicles: [], tRoutes: [], tPrices: [], log: [], sessions: {}, settings: {} };
  fs.mkdirSync(path.join(legacy, 'receipts'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'db.json'), JSON.stringify(legacyDb));
  fs.writeFileSync(path.join(legacy, 'receipts', 'sample.txt'), 'receipt-kept');
  const e = run(target, { LEGACY_DATA_DIR: legacy });
  const migrated = JSON.parse(fs.readFileSync(path.join(target, 'db.json'), 'utf8'));
  ok(e.status === 0 && migrated.parties.some(x => x.name === 'Do Not Lose'), 'legacy DB is copied into external DATA_DIR without losing records');
  ok(fs.readFileSync(path.join(target, 'receipts', 'sample.txt'), 'utf8') === 'receipt-kept' && fs.existsSync(path.join(legacy, 'db.json')), 'uploaded-file folders are copied and original data remains untouched');

  // A production deployment must not use the app directory.
  const f = run(path.join(project, 'data'), { NODE_ENV: 'production', ALLOW_EMPTY_DB: '1' });
  ok(f.status !== 0 && /points inside the deployment folder/.test(f.stderr), 'production rejects DATA_DIR inside deployed application');
  const noDataDir = cp.spawnSync(process.execPath, ['-e', "require('./lib/db')"], { cwd: project, encoding: 'utf8', env: { ...process.env, DATA_DIR: '', NODE_ENV: 'hosted', PUBLIC_URL: 'https://portal.theumrahstore.com' } });
  ok(noDataDir.status !== 0 && /set DATA_DIR to an absolute directory outside/.test(noDataDir.stderr), 'hosted public URL requires explicit persistent DATA_DIR even if NODE_ENV is absent');

  // A symlink placed outside the app but resolving into it is also rejected.
  const linkedPath = path.join(os.tmpdir(), 'umrah-linked-' + process.pid);
  try {
    fs.rmSync(linkedPath, { recursive: true, force: true });
    fs.mkdirSync(path.join(project, 'data'), { recursive: true });
    fs.symlinkSync(path.join(project, 'data'), linkedPath, 'dir');
    const linked = run(linkedPath, { NODE_ENV: 'production', ALLOW_EMPTY_DB: '1' });
    ok(linked.status !== 0 && /resolves inside the deployed application/.test(linked.stderr), 'production rejects external-looking symlink into deployed application');
  } catch (e) {
    console.log('  SKIP  symlink safety test unavailable: ' + e.message);
  } finally { fs.rmSync(linkedPath, { recursive: true, force: true }); fs.rmSync(path.join(project, 'data'), { recursive: true, force: true }); }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
