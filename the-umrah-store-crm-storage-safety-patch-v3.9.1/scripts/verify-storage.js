#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const dir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const file = path.join(dir, 'db.json');
const fail = msg => { console.error('STORAGE CHECK FAILED: ' + msg); process.exit(1); };
if (!fs.existsSync(file)) fail('db.json not found at ' + file);
let db;
try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fail('db.json is not valid JSON: ' + e.message); }
if (!db || typeof db !== 'object' || Array.isArray(db)) fail('database root must be an object');
const keys = ['users', 'parties', 'bookings', 'vouchers', 'payments', 'entries', 'expenses', 'queries', 'paylinks', 'groups', 'hotels', 'visaTiers', 'tVehicles', 'tRoutes', 'tPrices', 'log', 'tickets', 'notifs'];
for (const k of keys) if (Object.prototype.hasOwnProperty.call(db, k) && !Array.isArray(db[k])) fail('field ' + k + ' is not an array');
const backups = path.join(dir, 'backups');
const files = fs.existsSync(backups) ? fs.readdirSync(backups).filter(x => /^db-\d{4}-\d{2}-\d{2}(?:T.*)?\.json$/.test(x)).sort() : [];
console.log('CRM storage verified');
console.log('DATA_DIR: ' + dir);
console.log('DB size: ' + fs.statSync(file).size + ' bytes');
console.log('Schema version: ' + (db.v || 'legacy/unknown'));
for (const k of ['users','parties','bookings','vouchers','payments','entries','expenses','queries','groups','hotels','tickets','notifs']) console.log(k + ': ' + (Array.isArray(db[k]) ? db[k].length : 0));
console.log('DB checkpoint backups: ' + files.length + (files.length ? ' (oldest ' + files[0] + ', newest ' + files[files.length - 1] + ')' : ''));
console.log('Initialized marker: ' + (fs.existsSync(path.join(dir, '.crm-initialized')) ? 'present' : 'missing'));
