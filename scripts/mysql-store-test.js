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


  const mysqlDir = path.join(temp, 'mysql-mode'); fs.mkdirSync(mysqlDir);
  fs.writeFileSync(path.join(mysqlDir, 'db.json'), JSON.stringify({ v: 3, rev: 9, seq: 2000, users: [], parties: [{ id: 77, kind: 'agent', name: 'Existing Agent Import Test' }], bookings: [], vouchers: [], payments: [], entries: [], expenses: [], queries: [], paylinks: [], groups: [], hotels: [], visaTiers: [], tVehicles: [], tRoutes: [], tPrices: [], log: [], sessions: {}, settings: {} }));
  const mysqlScript = `
    const Module=require('module'); const original=Module._load;
    const memory={state:null,backups:[],ddl:[]};
    const ok=async()=>[[],[]];
    const q=async(sql,args=[])=>{
      if(/^CREATE TABLE/i.test(sql)){memory.ddl.push(sql);return ok()}
      if(/^SELECT 1/i.test(sql))return ok();
      if(/^DELETE FROM crm_state_backups/i.test(sql))return [{affectedRows:0},[]];
      if(/^SELECT revision, payload FROM crm_state WHERE id = 1/i.test(sql))return [memory.state?[memory.state]:[],[]];
      if(/^SELECT revision, payload, updated_at FROM crm_state WHERE id = 1/i.test(sql))return [memory.state?[memory.state]:[],[]];
      throw new Error('Unexpected mock SQL: '+sql);
    };
    const ex=async(sql,args=[])=>{
      if(/^SELECT/i.test(sql))return q(sql,args);
      if(sql.startsWith('INSERT INTO crm_state (')){memory.state={revision:Number(args[0]),payload:String(args[1]),updated_at:new Date()};return [{affectedRows:1},[]]}
      if(/^INSERT INTO crm_state_backups/i.test(sql)){memory.backups.push({revision:Number(args[0]),payload:String(args[1])});return [{affectedRows:1},[]]}
      if(/^UPDATE crm_state SET revision/i.test(sql)){memory.state={revision:Number(args[0]),payload:String(args[1]),updated_at:new Date()};return [{affectedRows:1},[]]}
      throw new Error('Unexpected mock execute: '+sql);
    };
    const conn={query:q,execute:ex,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}};
    const pool={query:q,execute:ex,getConnection:async()=>conn};
    Module._load=function(request,parent,isMain){if(request==='mysql2/promise')return {createPool:()=>pool};return original.apply(this,arguments)};
    const D=require(${JSON.stringify(path.join(root,'lib/db.js'))});
    (async()=>{
      await D.init();
      if(memory.ddl.length!==2)throw new Error('schema DDL was not executed twice');
      let h=await D.health(); if(h.driver!=='mysql'||!h.connected||!h.healthy)throw new Error('MySQL startup health is not healthy: '+JSON.stringify(h));
      if(!memory.state)throw new Error('initial local CRM state was not inserted to MySQL');
      let state=JSON.parse(memory.state.payload); if(!state.users.some(x=>x.id==='admin'))throw new Error('initial admin was not persisted');
      if(!state.parties.some(x=>x.name==='Existing Agent Import Test'))throw new Error('existing local db.json data was not imported to MySQL');
      D.db.settings.company.name='Persisted in mocked MySQL'; D.save(); await D.flushAsync();
      state=JSON.parse(memory.state.payload); if(state.settings.company.name!=='Persisted in mocked MySQL')throw new Error('updated CRM state not persisted');
      h=await D.health(); if(!h.healthy||h.persistedRevision!==h.revision)throw new Error('post-save MySQL health check failed: '+JSON.stringify(h));
      console.log('MYSQL_MOCK_OK'); process.exit(0);
    })().catch(e=>{console.error(e);process.exit(1)});
  `;
  const runMysql = spawnSync(process.execPath, ['-e', mysqlScript], { cwd: root, env: { ...process.env, CRM_TEST_MODE: '1', NODE_ENV: 'test', DATA_DIR: mysqlDir, DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: 'test_db', DB_USER: 'test_user', DB_PASSWORD: 'test_password', DB_SSL: '0' }, encoding: 'utf8', timeout: 15000 });
  check(runMysql.status === 0 && /MYSQL_MOCK_OK/.test(runMysql.stdout), 'MySQL startup, existing JSON import, schema creation, state save and health use the MySQL driver', (runMysql.stderr || '').trim());

  const source = fs.readFileSync(path.join(root, 'lib/db.js'), 'utf8');
  check(/CREATE TABLE IF NOT EXISTS crm_state\s*\(/.test(source), 'startup creates the primary CRM state table');
  check(/CREATE TABLE IF NOT EXISTS crm_state_backups\s*\(/.test(source), 'startup creates the revisioned backup table');
  check(/SELECT revision, payload FROM crm_state WHERE id = 1/.test(source), 'startup restores the authoritative MySQL state');
  check(/INSERT INTO crm_state_backups/.test(source), 'initial and periodic MySQL state backups are written');
  check(/DATA_DIR must be an absolute persistent folder outside/.test(source), 'MySQL mode refuses deployment-local DATA_DIR paths');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log(failed ? `\n${failed} MySQL store checks failed` : '\nAll MySQL store checks passed');
process.exit(failed ? 1 : 0);
