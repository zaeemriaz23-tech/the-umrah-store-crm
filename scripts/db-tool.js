'use strict';
/**
 * Database maintenance (plain Node, uses the same DB_* environment variables as the app).
 *   node scripts/db-tool.js status            connection, schema, revision, row counts
 *   node scripts/db-tool.js backups           list automatic / manual backups stored in MySQL
 *   node scripts/db-tool.js backup            take a backup now
 *   node scripts/db-tool.js restore <id>      replace ALL data with backup <id> (a pre-restore backup is taken first). Stop the app first.
 *   node scripts/db-tool.js verify            reload every table and check it equals what a fresh start would load
 */
require('../lib/env');
const D = require('../lib/db');
const Store = require('../lib/store');
const [, , cmd, arg] = process.argv;

(async () => {
  if (!Store.mysqlConfig().enabled) throw new Error('MySQL is not configured (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD).');
  await D.init();
  if (cmd === 'status') {
    console.log(JSON.stringify(await D.health(), null, 2));
    const mysql = require('mysql2/promise'), cfg = Store.mysqlConfig();
    const c = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database, ssl: cfg.ssl });
    for (const e of Store.ENTITIES) { const [[r]] = await c.query('SELECT COUNT(*) n FROM `' + e.table + '`'); console.log(e.table.padEnd(26), r.n); }
    const [[s]] = await c.query('SELECT COUNT(*) n FROM crm_sessions'); console.log('crm_sessions'.padEnd(26), s.n); await c.end();
  } else if (cmd === 'backups') {
    const l = await D.listBackups(); if (!l.length) console.log('(no backups)');
    l.forEach(b => console.log('#' + b.id, 'rev ' + b.revision, b.reason.padEnd(12), (b.bytes / 1024).toFixed(0) + ' KB', new Date(b.createdAt).toISOString()));
  } else if (cmd === 'backup') {
    console.log('Backup written:', JSON.stringify(await D.backupNow('manual')));
  } else if (cmd === 'restore') {
    if (!/^\d+$/.test(arg || '')) throw new Error('Usage: node scripts/db-tool.js restore <backup id>   (see "backups")');
    console.log('Restored:', JSON.stringify(await D.restoreBackup(+arg)));
  } else if (cmd === 'verify') {
    const pool = Store.createPool(Store.mysqlConfig());
    const head = await Store.loadHead(pool), loaded = await Store.loadAll(pool);
    const mem = JSON.parse(JSON.stringify(D.db)); let bad = 0;
    for (const e of Store.ENTITIES) {
      const disk = loaded.entities[e.key].map(r => JSON.parse(r.s));
      const same = JSON.stringify(disk) === JSON.stringify(mem[e.key] || []);
      if (!same) bad++; console.log((same ? 'OK   ' : 'DIFF ') + e.table + ' (' + disk.length + ' rows)');
    }
    console.log('head revision', head && head.revision); await pool.end();
    if (bad) process.exitCode = 1;
  } else { console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace('/**', '')); }
  await D.shutdown();
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
