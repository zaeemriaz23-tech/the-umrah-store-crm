'use strict';
// Run test servers in isolated mode so a developer's or production .env can never connect tests to live MySQL.
const { spawnSync } = require('child_process');
const path = require('path');
const tests = [
  'engine-check.js', 'rbac-test.js', 'bank-ai-test.js', 'extras-test.js',
  'payfast-test.js', 'ai-groups-test.js', 'live-test.js', 'mysql-store-test.js'
];
const env = { ...process.env, CRM_TEST_MODE: '1', NODE_ENV: 'test', ENV_FILE: '' };
for (const key of Object.keys(env)) if (/^(DB_|MYSQL_|DATABASE_URL$)/.test(key)) delete env[key];
for (const test of tests) {
  console.log(`\n========== ${test} ==========`);
  const r = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit', env, timeout: 180000 });
  if (r.error) { console.error(r.error.message); process.exit(1); }
  if (r.status !== 0) { console.error(`\nFAILED: ${test} (exit ${r.status})`); process.exit(r.status || 1); }
}
console.log('\nALL CRM TESTS PASSED');
