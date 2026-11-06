'use strict';
/**
 * Loads KEY=VALUE pairs from a .env file next to the app (or ENV_FILE) into process.env, without overriding values that are already set.
 * Needed on shared/managed Node hosting where variables are often kept in a file. No dependency.
 */
const fs = require('fs');
const path = require('path');
for (const f of (process.env.CRM_TEST_MODE === '1' || process.env.NODE_ENV === 'test' ? [] : [process.env.ENV_FILE, path.join(__dirname, '..', '.env')].filter(Boolean))) {
  let txt; try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
  txt.split(/\r?\n/).forEach(line => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) return;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    if (process.env[m[1]] === undefined || process.env[m[1]] === '') process.env[m[1]] = v;
  });
}
