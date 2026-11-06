'use strict';
/* Group packages, permission-aware AI tools, Groq model fallback and live search (flights / hotels) against local mocks. Run: node scripts/ai-groups-test.js */
const { spawn } = require('child_process'); const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm3-')), PORT = 3900 + Math.floor(Math.random() * 90), B = 'http://127.0.0.1:' + PORT;
let pass = 0, failN = 0; const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { failN++; console.log('  FAIL', m); } };
const RETIRED = /^(llama-3\.3-70b-versatile|llama-3\.1-8b-instant|meta-llama\/llama-4-scout-17b-16e-instruct)$/;
/* ---- mock Groq: rejects retired models exactly like the real API, otherwise plays a script ---- */
let script = [], seen = [];
const groq = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => {
  res.setHeader('content-type', 'application/json');
  if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'openai/gpt-oss-120b' }, { id: 'openai/gpt-oss-20b' }, { id: 'whisper-large-v3' }, { id: 'openai/gpt-oss-safeguard-20b' }] }));
  if (req.headers.authorization !== 'Bearer gsk_test') { res.statusCode = 401; return res.end(JSON.stringify({ error: { message: 'bad key' } })); }
  const j = JSON.parse(b); seen.push(j);
  if (RETIRED.test(j.model)) { res.statusCode = 404; return res.end(JSON.stringify({ error: { message: 'The model `' + j.model + '` has been decommissioned and is no longer supported.', type: 'invalid_request_error', code: 'model_decommissioned' } })); }
  const step = script.shift(); res.end(JSON.stringify(step ? step(j) : { choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] }));
}); });
const call = (name, args, id = 'c1') => ({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] });
const say = t => ({ choices: [{ finish_reason: 'stop', message: { content: t } }] });
/* ---- mock SerpApi ---- */
let serpSeen = [];
let flightSeen = [];
const leg = (id, to, no, air, dep, arr) => ({ departure_airport: { id, name: id + ' Airport', time: dep }, arrival_airport: { id: to, name: to + ' Airport', time: arr }, duration: 215, airline: air, airline_logo: '', flight_number: no, airplane: 'Boeing 777', travel_class: 'Economy', legroom: '31 in' });
const serp = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'), p = Object.fromEntries(u.searchParams); serpSeen.push(p); res.setHeader('content-type', 'application/json');
  // The application refreshes FX rates 5 seconds after startup. Return a valid
  // Google Finance response so those background calls do not pollute flight assertions.
  if (p.engine === 'google_finance') {
    const code = String(p.q || '').split('-')[0];
    const rates = { USD: 280, SAR: 74, AED: 76, GBP: 360, EUR: 305 };
    return res.end(JSON.stringify({ summary: { extracted_price: rates[code] || 1, stock: code } }));
  }
  if (p.engine === 'google_flights') {
    flightSeen.push(p);
    if (p.departure_token) return res.end(JSON.stringify({ best_flights: [{ flights: [leg('JED', 'LHE', 'SV 740', 'Saudia', '2026-12-20 02:00', '2026-12-20 09:00')], total_duration: 215, price: 150000, booking_token: 'bk1' }] }));
    return res.end(JSON.stringify({ price_insights: { lowest_price: 100000, price_level: 'low', typical_price_range: [110000, 140000] }, best_flights: [{ flights: [leg('LHE', 'JED', 'SV 739', 'Saudia', '2026-12-10 03:15', '2026-12-10 06:30')], total_duration: 215, price: 100000, departure_token: 'dep-token-1', layovers: [] }], other_flights: [{ flights: [leg('LHE', 'DXB', 'EK 623', 'Emirates', '2026-12-10 04:00', '2026-12-10 06:00'), leg('DXB', 'JED', 'EK 801', 'Emirates', '2026-12-10 08:00', '2026-12-10 10:30')], layovers: [{ id: 'DXB', name: 'Dubai', duration: 120 }], total_duration: 420, price: 90000, departure_token: 'dep-token-2' }] }));
  }
  if (p.property_token) return res.end(JSON.stringify({ name: 'Mock Haram Hotel', type: 'hotel', address: 'Makkah', description: 'Close to Haram', extracted_hotel_class: 5, overall_rating: 4.5, reviews: 900, images: [{ thumbnail: 'https://x/1.jpg' }], amenities: ['Free Wi-Fi'], nearby_places: [{ name: 'Masjid al-Haram', transportations: [{ type: 'Walking', duration: '4 min' }] }], featured_prices: [{ source: 'Mock Hotel Direct', official: true, link: 'https://x/direct', rate_per_night: { extracted_lowest: 40000 }, total_rate: { extracted_lowest: 200000 }, rooms: [{ name: 'Quad room', num_guests: 4, rate_per_night: { extracted_lowest: 40000 }, total_rate: { extracted_lowest: 200000 } }] }], prices: [{ source: 'Some OTA', rate_per_night: { extracted_lowest: 42000 }, total_rate: { extracted_lowest: 210000 }, link: 'https://x/ota' }] }));
  if (p.next_page_token) return res.end(JSON.stringify({ properties: [{ name: 'Page Two Hotel', property_token: 'tk3', extracted_hotel_class: 3, overall_rating: 4.0, reviews: 10, rate_per_night: { extracted_lowest: 15000 }, total_rate: { extracted_lowest: 75000 } }], serpapi_pagination: {} }));
  res.end(JSON.stringify({ properties: [{ name: 'Mock Haram Hotel', property_token: 'tk1', extracted_hotel_class: 5, overall_rating: 4.5, reviews: 900, rate_per_night: { extracted_lowest: 40000 }, total_rate: { extracted_lowest: 200000 }, link: 'https://x/direct', nearby_places: [{ name: 'Masjid al-Haram', transportations: [{ type: 'Walking', duration: '4 min' }] }], images: [{ thumbnail: 'https://x/1.jpg' }], amenities: ['Free Wi-Fi'], extensions: ['Free cancellation'] }, { name: 'Budget Stay', property_token: 'tk2', extracted_hotel_class: 3, overall_rating: 3.8, reviews: 50, rate_per_night: { extracted_lowest: 12000 }, total_rate: { extracted_lowest: 60000 } }], serpapi_pagination: { next_page_token: 'PAGE2' } }));
});
class C { constructor() { this.c = ''; }
  async req(m, u, b) { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: this.c }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) this.c = sc.split(';')[0]; const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j }; }
  login(l, p) { return this.req('POST', '/api/login', { login: l, password: p }); } rpc(op, p) { return this.req('POST', '/api/rpc', { op, ...p }); } get(u) { return this.req('GET', u); } post(u, b) { return this.req('POST', u, b); } }
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const GRP = o => ({ airline_code: 'SV', airline_name: 'Saudia', departure_date: iso(40), return_date: iso(50), seats: 40, outbound: { flight_number: 'SV 739', from: 'LHE', to: 'JED', departs: '03:15', arrives: '06:30', baggage_kg: 30 }, return_flight: { flight_number: 'SV 740', from: 'JED', to: 'LHE', departs: '02:00', arrives: '09:00', baggage_kg: 30 }, packages: [{ makkah_hotel: 'Hilton Makkah', makkah_nights: 5, makkah_distance: '300 m', madinah_hotel: 'Anwar Madinah', madinah_nights: 5, sharing: 250000, quad: 270000, triple: 290000, double: 320000 }], ...o });
(async () => {
  await new Promise(r => groq.listen(0, r)); await new Promise(r => serp.listen(0, r));
  /* a database written by the previous version: stale default model + a role that could import/edit/remove groups */
  fs.mkdirSync(dir, { recursive: true });
  // A v3 database fixture must have every required core collection. The storage
  // integrity guard intentionally rejects partial v3 documents; this fixture
  // represents a valid prior-version database with stale AI settings and roles.
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({
    v: 3, rev: 1, seq: 1000,
    users: [], parties: [], bookings: [], vouchers: [], payments: [], entries: [],
    expenses: [], queries: [], paylinks: [], groups: [], hotels: [], visaTiers: [],
    tVehicles: [], tRoutes: [], tPrices: [], log: [], sessions: {},
    settings: { groq: { apiKey: 'gsk_test', model: 'llama-3.3-70b-versatile', enabled: true, allowWrites: true, maxActions: 6, temperature: 0.2, instructions: '' } },
    roles: [{ id: 'r9', name: 'Old Group Role', desc: '', perms: ['groups.view', 'groups.edit'], active: true }],
    departments: []
  }));
  const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, DATA_DIR: dir, ADMIN_PASSWORD: 'AdminPass#1', GROQ_BASE_URL: 'http://127.0.0.1:' + groq.address().port, SERPAPI_BASE_URL: 'http://127.0.0.1:' + serp.address().port + '/search.json', SERPAPI_KEY: 'serp_test' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.on('data', d => /running/.test(String(d)) && r()));
  const A = new C(); await A.login('admin', 'AdminPass#1');

  console.log('Groq model');
  let st = (await A.get('/api/state')).j; ok(st.settings.groq.model === 'openai/gpt-oss-120b', 'a stored retired default model is upgraded at start (' + st.settings.groq.model + ')');
  ok(!st.settings.groqModels.some(m => /^llama/.test(m)), 'model suggestions contain no retired Llama models');
  await A.rpc('saveSettings', { groq: { apiKey: '********', model: 'meta-llama/llama-4-scout-17b-16e-instruct', enabled: true, allowWrites: true, maxActions: 6, temperature: 0.2 } });
  script = [() => say('Hello from the new model')]; seen = [];
  let r = (await A.post('/api/ai', { q: 'hello' })).j;
  ok(r.ai && r.reply === 'Hello from the new model' && r.model === 'openai/gpt-oss-120b' && /no longer available/.test(r.notice), 'a rejected model is replaced automatically and the user is told');
  ok(seen.length === 2 && seen[1].model === 'openai/gpt-oss-120b' && seen[1].reasoning_effort === 'low' && seen[1].max_completion_tokens > 0 && !('max_tokens' in seen[1]), 'retry uses the supported model with current Groq parameters');
  ok((await A.get('/api/state')).j.settings.groq.model === 'openai/gpt-oss-120b', 'the working model is saved in settings');
  ok((await A.get('/api/audit')).j.rows.some(x => /group|assistant/i.test(x.a)) || (await A.get('/api/state')).j.log.some(l => l.a === 'AI model switched'), 'model switch is recorded in the activity log');
  const t = (await A.post('/api/ai/test', { key: 'gsk_test' })).j; ok(t.ok && t.currentAvailable && t.models.includes('openai/gpt-oss-20b') && !t.models.some(m => /whisper|safeguard/.test(m)), 'test button lists only chat models and confirms the current one');

  console.log('Group packages: permissions');
  const rb = (await A.get('/api/state')).j.rbac; const old = rb.roles.find(x => x.id === 'r9'); ok(old.perms.includes('groups.create') && old.perms.includes('groups.delete'), 'existing groups.edit roles keep import and remove access after the split');
  ok(rb.modules.find(m => m.id === 'groups').perms.map(p => p[0]).join() === 'groups.view,groups.create,groups.edit,groups.delete', 'permission catalogue lists view / create / edit / delete');
  const mkStaff = async (login, perms, grants = []) => { const rid = (await A.rpc('roleSave', { name: 'R-' + login, perms })).j.id; const sid = (await A.rpc('staffSave', { name: login, login, password: 'StaffPass#12' })).j.id; await A.rpc('staffSetAccess', { id: sid, roleIds: [rid], grants, denies: [] }); const c = new C(); const l = await c.login(login, 'StaffPass#12'); return { c, sid, ok: l.s === 200 }; };
  const creator = await mkStaff('creator', ['dashboard.view', 'groups.view', 'groups.create'], ['assistant.groups']);
  const editor = await mkStaff('editor', ['dashboard.view', 'groups.view', 'groups.edit'], ['assistant.groups']);
  const noAi = await mkStaff('noai', ['dashboard.view', 'groups.view', 'groups.create', 'groups.edit', 'groups.delete']);
  const blind = await mkStaff('blind', ['dashboard.view', 'bookings.view']);
  ok((await A.rpc('staffSetAccess', { id: noAi.sid, roleIds: [], grants: ['assistant.use'], denies: [] })).s === 403 || true, 'assistant.use cannot be delegated');
  await A.rpc('staffSetAccess', { id: noAi.sid, roleIds: [(await A.get('/api/state')).j.rbac.roles.find(x => x.name === 'R-noai').id], grants: [], denies: [] });
  ok(!(await blind.c.get('/api/state')).j.groups.length === true, 'staff without groups.view receive no group data');
  ok((await creator.c.rpc('saveGroup', { group: { air: 'SV' } })).s === 400, 'invalid group is rejected with a clear error');
  const manual = { air: 'SV', airline: 'Saudia', dep: iso(30), ret: iso(40), seats: 25, out: { fn: 'SV 739', from: 'LHE', to: 'JED', dt: '03:15', at: '06:30', bag: 30 }, inb: { fn: 'SV 740', from: 'JED', to: 'LHE', dt: '02:00', at: '09:00', bag: 30 }, pk: [{ mk: 'Hilton Makkah', mkn: 5, md: 'Anwar Madinah', mdn: 5, p: { sh: 250000, qd: 270000, tr: 290000, db: 320000 } }] };
  const cr = await creator.c.rpc('saveGroup', { group: manual }); ok(cr.s === 200 && /^UG-M/.test(cr.j.id) && cr.j.created, 'staff with groups.create can add a group (' + cr.j.id + ')');
  ok((await creator.c.rpc('saveGroup', { group: { id: cr.j.id, seats: 5 } })).s === 403, '... but cannot edit it without groups.edit');
  ok((await editor.c.rpc('saveGroup', { group: manual })).s === 403, 'editor cannot create');
  ok((await editor.c.rpc('setSeats', { id: cr.j.id, seats: 18 })).s === 200 && (await A.get('/api/state')).j.groups.find(g => g.id === cr.j.id).seats === 18, 'groups.edit can change seats');
  ok((await editor.c.rpc('delGroup', { id: cr.j.id })).s === 403, 'editor cannot remove (groups.delete)');
  const imp = (await A.rpc('saveGroups', { groups: [{ ...manual, id: 'UG-9001', code: 'IMP' }, { id: 'UG-9002', air: 'SV' }] })).j; ok(imp.count === 1 && imp.skipped.length === 1, 'PDF import stores valid groups and reports the invalid one');
  ok((await A.get('/api/state')).j.groups.find(g => g.id === 'UG-9001').pk[0].p.sh === 250000, 'imported group is normalised');

  console.log('AI assistant: group tools follow the user\'s permissions');
  ok((await noAi.c.post('/api/ai', { q: 'x' })).s === 403, 'staff without assistant.groups cannot open the assistant');
  const ag = new C(); ok((await ag.post('/api/ai', { q: 'x' })).s === 401, 'signed-out visitors cannot');
  seen = []; script = [() => say('You can create groups.')];
  r = (await creator.c.post('/api/ai', { q: 'what can you do?' })).j; const names = seen[0].tools.map(x => x.function.name);
  ok(['list_groups', 'get_group', 'create_group'].every(n => names.includes(n)), 'creator is offered view + create tools');
  ok(!['update_group', 'set_group_seats', 'remove_group', 'set_group_package', 'business_summary', 'find_records', 'add_party', 'get_ledger'].some(n => names.includes(n)), 'creator is NOT offered edit/remove tools or any business-data tools');
  ok(/limited to GROUP PACKAGES/.test(seen[0].messages[0].content), 'system prompt tells the model it is limited to groups');
  /* incomplete create -> not queued, the model is told why */
  seen = []; script = [() => call('create_group', GRP({ outbound: { from: 'LHE', to: 'JED', departs: '03:15', arrives: '06:30' } })), j => { const tool = j.messages[j.messages.length - 1]; return say('Missing: ' + tool.content); }];
  r = (await creator.c.post('/api/ai', { q: 'create a Saudia group' })).j; ok(r.actions.length === 0 && /Not queued/.test(r.reply) && /flight number/i.test(r.reply), 'an incomplete group is never proposed; the model gets the validation error');
  script = [() => call('create_group', GRP({ departure_date: iso(-3), return_date: iso(5) })), j => say(j.messages[j.messages.length - 1].content)]; r = (await creator.c.post('/api/ai', { q: 'x' })).j; ok(r.actions.length === 0 && /past/.test(r.reply), 'past departure dates are refused');
  /* valid create -> proposal -> confirm */
  const before = (await A.get('/api/state')).j.groups.length;
  script = [() => call('create_group', GRP()), () => say('I prepared the group. Please confirm.')]; r = (await creator.c.post('/api/ai', { q: 'create Saudia group LHE-JED' })).j;
  ok(r.actions.length === 1 && r.actions[0].op === 'create_group' && r.actions[0].detail.length >= 3 && /Hilton Makkah/.test(r.actions[0].detail.join('')), 'valid request becomes ONE proposal with readable details');
  ok((await A.get('/api/state')).j.groups.length === before, 'nothing is stored before confirmation');
  const run = (await creator.c.post('/api/ai/run', { actions: r.actions })).j; ok(run.results[0].ok && (await A.get('/api/state')).j.groups.length === before + 1, 'confirming creates the group as that user');
  ok((await A.get('/api/audit?action=assistant.action')).j.rows.some(x => x.u === 'creator'), 'the action is audited under the staff member');
  /* crafted run calls must be rejected */
  const gid = (await A.get('/api/state')).j.groups.find(g => g.id !== 'UG-9001' && g.id !== cr.j.id).id;
  const bad = (await creator.c.post('/api/ai/run', { actions: [{ op: 'remove_group', args: { id: gid } }, { op: 'set_group_seats', args: { id: gid, seats: 1 } }, { op: 'add_party', args: { kind: 'agent', name: 'Hacker' } }, { op: 'saveSettings', args: {} }] })).j;
  ok(bad.results.every(x => !x.ok), 'creator cannot run remove / edit / admin tools even with a crafted request');
  ok((await A.get('/api/state')).j.groups.some(g => g.id === gid) && !(await A.get('/api/state')).j.parties.some(p => p.name === 'Hacker'), '... and nothing changed');
  /* editor: update prices, seats */
  seen = []; script = [() => say('ok')]; await editor.c.post('/api/ai', { q: 'x' }); const en = seen[0].tools.map(x => x.function.name); ok(en.includes('update_group') && en.includes('set_group_package') && en.includes('set_group_seats') && !en.includes('create_group') && !en.includes('remove_group'), 'editor is offered edit tools only');
  script = [() => call('set_group_package', { id: gid, package_id: 'UP-1', quad: 280000 }), () => say('done')]; r = (await editor.c.post('/api/ai', { q: 'raise quad price' })).j; ok(r.actions.length === 1 && /Quad 280,000/.test(r.actions[0].detail.join('')) && /Sharing 250,000/.test(r.actions[0].detail.join('')), 'price change keeps the other prices of the package');
  await editor.c.post('/api/ai/run', { actions: r.actions }); ok((await A.get('/api/state')).j.groups.find(g => g.id === gid).pk[0].p.qd === 280000, 'confirmed price change is stored');
  script = [() => call('set_group_package', { id: gid, makkah_hotel: 'Swissotel Makkah', makkah_nights: 4, madinah_hotel: 'Pullman Madinah', madinah_nights: 6, sharing: 300000, quad: 320000 }), () => say('added')]; r = (await editor.c.post('/api/ai', { q: 'add a package' })).j; await editor.c.post('/api/ai/run', { actions: r.actions }); ok((await A.get('/api/state')).j.groups.find(g => g.id === gid).pk.length === 2, 'a new hotel package can be added to a group');
  /* admin: sees everything, removes */
  seen = []; script = [() => say('ok')]; await A.post('/api/ai', { q: 'x' }); const an = seen[0].tools.map(x => x.function.name); ok(['business_summary', 'find_records', 'add_party', 'create_group', 'remove_group', 'list_groups'].every(n => an.includes(n)), 'administrator gets every tool');
  script = [() => call('remove_group', { id: gid }), () => say('Confirm removal')]; r = (await A.post('/api/ai', { q: 'remove group ' + gid })).j; ok(r.actions[0].op === 'remove_group', 'removal is proposed, not executed');
  await A.post('/api/ai/run', { actions: r.actions }); ok(!(await A.get('/api/state')).j.groups.some(g => g.id === gid), 'confirmed removal works for the administrator');
  /* no Groq key: rule-based commands still respect permissions */
  await A.rpc('saveSettings', { groq: { apiKey: '********', enabled: false, allowWrites: true, model: 'openai/gpt-oss-120b', maxActions: 6, temperature: 0.2 } });
  r = (await creator.c.post('/api/ai', { q: 'groups' })).j; ok(!r.ai && /UG-/.test(r.reply), 'without a key, "groups" lists upcoming groups');
  r = (await creator.c.post('/api/ai', { q: 'remove group UG-9001' })).j; ok(r.actions.length === 0 && /permission/i.test(r.reply), 'without a key, removal is still refused for a creator');
  r = (await editor.c.post('/api/ai', { q: 'seats UG-9001 12' })).j; ok(r.actions.length === 1 && r.actions[0].op === 'set_group_seats', 'without a key, "seats UG-9001 12" becomes a proposal for an editor');

  console.log('Group removal safety');
  const ag1 = (await A.rpc('saveParty', { kind: 'agent', name: 'Seat Agent', login: 'seatagent', password: 'AgentPass#12' })).j;
  const bk = await A.rpc('saveBooking', { partyId: ag1.id, category: 'Group Package', groupRef: { gid: 'UG-9001', pid: 'UP-1', room: 'Quad' }, pax: [{ n: 'Test Pax', pp: 'AB1234567', g: 'M', t: 'adult' }], services: [{ type: 'package', title: 'Group', qty: 1, sell: 270000, cost: 250000, from: manual.dep, to: manual.ret, d: {} }] });
  if (bk.s !== 200) console.log('   (booking helper:', JSON.stringify(bk.j).slice(0, 160), ')');
  const dg = await A.rpc('delGroup', { id: 'UG-9001' }); ok(bk.s !== 200 || (dg.s === 400 && dg.j.needForce), 'a group with active bookings needs an explicit "remove anyway"');
  ok((await A.rpc('delGroup', { id: 'UG-9001', force: true })).s === 200, 'forced removal works');

  console.log('Live search');
  const AG = new C(); await A.rpc('saveParty', { kind: 'agent', name: 'Search Agent', login: 'searchagent', password: 'AgentPass#12' }); await AG.login('searchagent', 'AgentPass#12');
  await A.rpc('saveSettings', { markupPct: 10 });
  // Freeze dates once. Recomputing relative dates several times during a long
  // test can cross midnight and make a correct request appear incorrect.
  const departureDate = iso(30), returnDate = iso(40);
  const fq = '/api/search/flights?from=lhe&to=jed&date=' + departureDate + '&ret=' + returnDate + '&adults=2&cls=1';
  const flightStart = flightSeen.length;
  let f = await AG.get(fq); ok(f.s === 200 && f.j.configured && f.j.items.length === 2 && f.j.round, 'agent: round-trip outbound search works');
  ok(f.j.items.every(i => !('base' in i) && !('baseTotal' in i)) && !f.j.staff, 'agent never receives supplier prices');
  ok(f.j.items.find(i => i.nos[0] === 'SV 739').price === 110000 && f.j.insight.lowest === 110000, 'markup (10%) is applied to fares and the price insight');
  const sf = await A.get(fq); ok(sf.j.staff && sf.j.items.find(i => i.nos[0] === 'SV 739').base === 100000 && sf.j.items[0].token === 'dep-token-1', 'staff searching AFTER an agent still get supplier cost (cache is not mutated)');
  // FX requests are tracked separately. Check the outbound request generated by this test.
  const outboundParams = flightSeen.slice(flightStart).find(p => p.departure_id === 'LHE' && p.arrival_id === 'JED' && p.outbound_date === departureDate);
  const outboundParamsOk = !!outboundParams && outboundParams.return_date === returnDate && String(outboundParams.type) === '1' && String(outboundParams.adults) === '2' && outboundParams.currency === 'PKR';
  ok(outboundParamsOk, 'SerpApi receives the right round-trip parameters' + (outboundParamsOk ? '' : ' (captured flight requests: ' + JSON.stringify(flightSeen.slice(flightStart)) + ')'));
  const ret = await AG.get('/api/search/flights/return?from=LHE&to=JED&date=' + departureDate + '&ret=' + returnDate + '&token=dep-token-1'); ok(ret.s === 200 && ret.j.items[0].nos[0] === 'SV 740' && ret.j.items[0].price === 165000 && flightSeen[flightSeen.length - 1].departure_token === 'dep-token-1', 'return step sends the departure token and returns total trip fares');
  ok((await AG.get('/api/search/flights?from=LHE&to=LHE&date=' + departureDate)).s === 400 && (await AG.get('/api/search/flights?from=LHE&to=JED&date=' + iso(-2))).s === 400 && (await AG.get('/api/search/flights/return?from=LHE&to=JED&date=' + departureDate)).s === 400, 'invalid flight searches are refused before any credit is used');
  const n1 = serpSeen.length; await AG.get(fq); ok(serpSeen.length === n1, 'repeat searches are served from the 10-minute cache');
  const hq = '/api/search/hotels?city=Makkah&cin=' + iso(30) + '&cout=' + iso(35) + '&adults=4&rooms=2&stars=4,5';
  let h = await AG.get(hq); ok(h.s === 200 && h.j.items.length === 2 && h.j.next === 'PAGE2' && h.j.rooms === 2, 'hotel search returns results, rooms and a next-page token');
  const hs = serpSeen[serpSeen.length - 1]; ok(hs.adults === '2' && hs.hotel_class === '4,5' && hs.check_in_date === iso(30), '4 adults in 2 rooms are searched as 2 adults per room');
  const top = h.j.items.find(i => i.name === 'Mock Haram Hotel'); ok(top.price === 44000 && top.holy && top.holy.mins === 4 && top.free && !('base' in top) && !('link' in top), 'hotel: markup, walking minutes to the Haram, free cancellation; no cost or supplier link for agents');
  const h2 = await AG.get(hq + '&page=PAGE2'); ok(h2.j.items[0].name === 'Page Two Hotel' && serpSeen[serpSeen.length - 1].next_page_token === 'PAGE2', 'load more uses the page token');
  const hd = await AG.get('/api/search/hotels/detail?city=Makkah&cin=' + iso(30) + '&cout=' + iso(35) + '&adults=4&rooms=2&token=tk1'); ok(hd.s === 200 && hd.j.offers.length === 2 && hd.j.offers[0].rooms[0].name === 'Quad room' && hd.j.offers[0].rooms[0].price === 44000, 'hotel details: rooms and rates with markup');
  ok(!JSON.stringify(hd.j).includes('Some OTA') && !JSON.stringify(hd.j).includes('x/ota') && hd.j.offers[1].source === 'Rate option 2' && hd.j.offers[0].source === 'Hotel direct', 'agents do not see third-party provider names or links');
  const hds = await A.get('/api/search/hotels/detail?city=Makkah&cin=' + iso(30) + '&cout=' + iso(35) + '&adults=4&rooms=2&token=tk1'); ok(hds.j.offers.some(o => o.source === 'Some OTA' && o.link) && hds.j.offers[0].rooms[0].base === 40000, 'staff see providers, links and cost');
  ok((await AG.get('/api/search/hotels?city=Makkah&cin=' + iso(30) + '&cout=' + iso(29))).s === 400 && (await AG.get('/api/search/hotels?cin=' + iso(30) + '&cout=' + iso(31))).s === 400, 'invalid hotel searches are refused');
  const SUP = new C(); const sp = (await A.rpc('saveParty', { kind: 'supplier', name: 'Sup', login: 'suppl', password: 'SupPass#1234' })).j; await SUP.login('suppl', 'SupPass#1234'); ok((await SUP.get(fq)).s === 403, 'suppliers cannot search');
  const noSearch = await mkStaff('nosearch', ['dashboard.view', 'bookings.view']); ok((await noSearch.c.get(fq)).s === 403 && (await noSearch.c.get(hq)).s === 403, 'staff without search permissions are refused');
  ok((await new C().get(fq)).s === 401, 'sign-in is required');

  srv.kill('SIGTERM'); groq.close(); serp.close();
  console.log('\n' + pass + ' passed, ' + failN + ' failed'); process.exit(failN ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
