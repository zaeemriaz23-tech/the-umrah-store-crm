'use strict';
// Run test servers in isolated mode so a developer's or production .env can never connect tests to live MySQL.
// Pass 1: every suite in JSON mode (no database needed).
// Pass 2: when TEST_DB_USER is set, the behavioural suites run AGAIN against a fresh real MySQL/MariaDB database each,
//         followed by the MySQL integration suite. With REQUIRE_MYSQL_TESTS=1 a missing test database is a failure.
const { spawnSync } = require('child_process');
const path = require('path');
const tests = [
  'engine-check.js', 'rbac-test.js', 'bank-ai-test.js', 'extras-test.js',
  'payfast-test.js', 'ai-groups-test.js', 'live-test.js', 'mysql-store-test.js'
];
const serverSuites = ['rbac-test.js', 'bank-ai-test.js', 'extras-test.js', 'payfast-test.js', 'ai-groups-test.js', 'live-test.js'];
const env = { ...process.env, CRM_TEST_MODE: '1', NODE_ENV: 'test', ENV_FILE: '' };
for (const key of Object.keys(env)) if (/^(DB_|MYSQL_|DATABASE_URL$)/.test(key)) delete env[key];

function run(test, e, label) {
  console.log(`\n========== ${label || test} ==========`);
  const r = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit', env: e, timeout: 600000 });
  if (r.error) { console.error(r.error.message); process.exit(1); }
  if (r.status !== 0) { console.error(`\nFAILED: ${label || test} (exit ${r.status})`); process.exit(r.status || 1); }
}

console.log('##### PASS 1: JSON mode #####');
for (const test of tests) run(test, env);

(async () => {
  const user = process.env.TEST_DB_USER;
  if (!user) {
    if (process.env.REQUIRE_MYSQL_TESTS === '1') { console.error('\nFAILED: REQUIRE_MYSQL_TESTS=1 but TEST_DB_USER is not set'); process.exit(1); }
    console.log('\n##### PASS 2 (real MySQL) SKIPPED: set TEST_DB_USER / TEST_DB_PASSWORD (/ TEST_DB_HOST / TEST_DB_PORT) to run it. #####');
    console.log('\nJSON-MODE TESTS PASSED - MySQL tests NOT RUN');
    return;
  }
  const mysql = require('mysql2/promise');
  const T = { host: process.env.TEST_DB_HOST || '127.0.0.1', port: +(process.env.TEST_DB_PORT || 3306), user, password: process.env.TEST_DB_PASSWORD || '' };
  console.log('\n##### PASS 2: existing suites against a real MySQL database #####');
  for (const test of serverSuites) {
    const name = 'crmtest_' + process.pid + '_' + test.replace(/\W/g, '').slice(0, 16);
    const admin = await mysql.createConnection(T);
    await admin.query('DROP DATABASE IF EXISTS `' + name + '`'); await admin.query('CREATE DATABASE `' + name + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    try { run(test, { ...env, DB_HOST: T.host, DB_PORT: String(T.port), DB_NAME: name, DB_USER: T.user, DB_PASSWORD: T.password, DB_SSL: '0' }, test + ' [MySQL mode]'); }
    finally { await admin.query('DROP DATABASE IF EXISTS `' + name + '`'); await admin.end(); }
  }
  run('mysql-integration-test.js', { ...env, TEST_DB_HOST: T.host, TEST_DB_PORT: String(T.port), TEST_DB_USER: T.user, TEST_DB_PASSWORD: T.password });
  console.log('\nALL CRM TESTS PASSED (JSON mode + real MySQL mode)');
})().catch(e => { console.error(e); process.exit(1); });
