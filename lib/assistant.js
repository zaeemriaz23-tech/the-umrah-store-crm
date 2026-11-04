'use strict';
/**
 * AI assistant (Groq).
 *  - Reads data through read-only tools, proposes changes through write tools, and NOTHING is written until the person confirms.
 *  - Every tool is checked against the signed-in user's permissions, both when it is offered to the model and again when the change is confirmed.
 *    Administrator: everything. Staff with "assistant.groups": only the group-package tools their own groups.* permissions allow.
 *  - Model handling: Groq retires models regularly (llama-3.3-70b-versatile, llama-3.1-8b-instant and Llama 4 were shut down for developer
 *    accounts in 2026). The default is openai/gpt-oss-120b; if the configured model is ever rejected as unavailable, the assistant lists the
 *    models the key can use right now, switches to the best one automatically, records it in the activity log and tells the user.
 */
const D = require('./db');
const { db, str, num, today, logAct } = D;
const L = require('./ledger');
const { OPS } = require('./ops');
const PM = require('./perms');
const Gr = require('./groups');
const { fetchJson } = require('./http');

const groqUrl = () => process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const PREFERRED = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
const GROQ_MODELS = PREFERRED.slice();
const NOT_CHAT = /whisper|guard|safeguard|tts|orpheus|playai|embed|moderation|compound|vision-preview/i;
/* model ids Groq has retired or moved to enterprise-only: never kept as a default */
const OUTDATED = new Set(['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'llama3-70b-8192', 'llama3-8b-8192', 'meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'qwen/qwen3-32b', 'qwen/qwen3.6-27b', 'moonshotai/kimi-k2-instruct', 'moonshotai/kimi-k2-instruct-0905', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'deepseek-r1-distill-llama-70b', 'mistral-saba-24b', 'qwen-qwq-32b']);

const groqKey = () => process.env.GROQ_API_KEY || (db.settings.groq && db.settings.groq.apiKey) || '';
let override = null; // { from, to } - set when Groq rejected the configured model
const configuredModel = () => process.env.GROQ_MODEL || (db.settings.groq && db.settings.groq.model) || PREFERRED[0];
function groqCfg() {
  const g = db.settings.groq || {}, conf = configuredModel();
  return { key: groqKey(), model: override && override.from === conf ? override.to : conf, temperature: Math.max(0, Math.min(1, +g.temperature >= 0 ? +g.temperature : 0.2)), enabled: g.enabled !== false, allowWrites: g.allowWrites !== false, maxActions: Math.max(1, Math.min(20, +g.maxActions || 10)), instructions: String(g.instructions || '').slice(0, 1500) };
}
const aiReady = () => { const c = groqCfg(); return !!(c.key && c.enabled); };
/** who may open the assistant at all */
const aiAccess = u => !!u && (u.role === 'admin' || (u.role === 'staff' && PM.can(u, 'assistant.groups')));

/** one-time upgrade of a stored model id that Groq no longer serves to the current default */
function init() {
  const g = db.settings.groq; if (!g) return;
  if (OUTDATED.has(g.model)) { const from = g.model; g.model = PREFERRED[0]; db.settings.groqModelMigrated = { from, to: g.model, at: new Date().toISOString() }; logAct(null, 'AI model updated', from + ' is no longer available on Groq - now using ' + g.model); D.save(); }
}

const isGone = (status, code, msg) => status === 404 || /model_not_found|model_decommissioned|model_terminated/i.test(code) || (/model/i.test(msg) && /decommission|no longer supported|does not exist|do not have access|not found|deprecated/i.test(msg));
async function listModels(key) {
  const r = await fetchJson(groqUrl() + '/models', { headers: { authorization: 'Bearer ' + key } }, 15000);
  if (!r.ok) throw new Error(r.status === 401 ? 'Groq rejected this API key' : 'Groq error: ' + String((r.j.error && r.j.error.message) || r.status).slice(0, 160));
  return (r.j.data || []).map(m => m.id).filter(id => id && !NOT_CHAT.test(id)).sort();
}
const pickModel = (ids, avoid) => PREFERRED.find(m => ids.includes(m) && m !== avoid) || ids.find(m => m !== avoid && !OUTDATED.has(m)) || '';
const reasoning = m => (/^openai\/gpt-oss/.test(m) ? { reasoning_effort: 'low' } : {});

async function groqChat(c, body, state) {
  let model = c.model, b = body;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetchJson(groqUrl() + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + c.key }, body: JSON.stringify({ ...b, model, ...reasoning(model) }) }, 60000);
    if (r.ok) { state.model = model; return r.j; }
    const err = r.j.error || {}, code = String(err.code || err.type || ''), msg = String(err.message || r.j.raw || '');
    if (isGone(r.status, code, msg)) {
      const ids = await listModels(c.key), next = pickModel(ids, model);
      if (!next) throw new Error('The selected Groq model (' + model + ') is not available and no replacement was found for this API key. Open Settings > AI assistant and press "Test key & load models".');
      override = { from: configuredModel(), to: next };
      if (!process.env.GROQ_MODEL && db.settings.groq && db.settings.groq.model === override.from) { db.settings.groq.model = next; D.save(); }
      logAct(null, 'AI model switched', model + ' was rejected by Groq - now using ' + next);
      state.notice = 'The model "' + model + '" is no longer available on Groq, so the assistant switched to "' + next + '".'; model = next; continue;
    }
    if (code === 'tool_use_failed' && attempt < 3) { b = { ...b, temperature: 0 }; continue; }
    throw new Error(r.status === 401 ? 'Groq rejected the API key. Check it in Settings > AI assistant.' : r.status === 429 ? 'Groq rate limit reached. Wait a moment and try again. (' + msg.slice(0, 120) + ')' : r.status === 413 ? 'The request was too large for Groq. Try a shorter question.' : 'Groq: ' + msg.slice(0, 220));
  }
  throw new Error('Groq could not complete the request. Please try again.');
}

/** lists models the key can use now; flags whether the configured model is one of them */
async function groqTest(key) {
  const k = key || groqKey(); if (!k) throw new Error('Enter a Groq API key first');
  const ids = await listModels(k), cur = groqCfg().model, ok = ids.includes(cur), rec = pickModel(ids, '');
  return { ok: true, models: ids, current: cur, currentAvailable: ok, recommended: rec, message: ok ? 'Key works and "' + cur + '" is available.' : 'Key works, but "' + cur + '" is not available for this key. Recommended: ' + (rec || 'none found') + '.' };
}

/* ---------------------------------------------------------------------------------------------
   Tools
   --------------------------------------------------------------------------------------------- */
const admin = u => u.role === 'admin';
const gperm = k => u => PM.can(u, k);
const findParty = (kind, name) => db.parties.find(p => (!kind || p.kind === kind) && (String(p.id) === String(name) || p.name.toLowerCase() === String(name || '').trim().toLowerCase()));
const pname = id => (D.party(id) || {}).name || String(id);
const AI_TOOLS = {
  add_party: { d: 'Add a new agent, supplier or B2C customer account.', s: { kind: 'agent|supplier|customer', name: 'string', phone: 'string?', city: 'string?', limit: 'number? credit limit for agents (PKR)' },
    run: (a, u) => OPS.saveParty(u, { kind: a.kind, name: a.name, phone: a.phone, city: a.city, limit: a.limit }), label: a => `Add ${a.kind} "${a.name}"` },
  remove_party: { d: 'Remove an account that has no transactions. Pass the account id from find_records.', s: { id: 'number' }, run: (a, u) => OPS.delParty(u, { id: a.id }), label: a => 'Remove account ' + pname(a.id) },
  add_expense: { d: 'Record a business expense.', s: { amount: 'number (PKR)', category: 'string', note: 'string?', date: 'YYYY-MM-DD?' }, run: (a, u) => OPS.addExpense(u, { amt: a.amount, cat: a.category, note: a.note, date: a.date }), label: a => `Add expense PKR ${a.amount} - ${a.category}` },
  remove_expense: { d: 'Remove an expense by id (EX-...).', s: { id: 'string' }, run: (a, u) => OPS.delExpense(u, { id: a.id }), label: a => 'Remove expense ' + a.id },
  add_payment: { d: 'Record an approved payment received from an agent/customer or paid to a supplier. partyId from find_records.', s: { partyId: 'number', amount: 'number (PKR)', method: 'string?', note: 'string?', date: 'YYYY-MM-DD?' }, run: (a, u) => OPS.addPayment(u, { partyId: a.partyId, amt: a.amount, method: a.method, note: a.note, date: a.date }), label: a => `Record payment PKR ${a.amount} for ${pname(a.partyId)}` },
  remove_payment: { d: 'Remove a payment record by id (PY-...).', s: { id: 'string' }, run: (a, u) => OPS.delPayment(u, { id: a.id }), label: a => 'Remove payment ' + a.id },
  add_query: { d: 'Log a new customer query.', s: { type: 'flight|hotel|visa|transport|package|other', text: 'string', partyId: 'number?' }, run: (a, u) => OPS.addQuery(u, { type: a.type, text: a.text, partyId: a.partyId }), label: a => `Log ${a.type} query` },
  remove_query: { d: 'Remove a query by number (Q-...).', s: { id: 'string' }, run: (a, u) => OPS.delQuery(u, { id: a.id }), label: a => 'Remove query ' + a.id }
};

const bk = b => ({ id: b.id, no: b.no, party: pname(b.partyId), partyId: b.partyId, status: b.status, category: b.category, pax: b.pax.map(x => x.n).slice(0, 6), paxCount: b.pax.length, from: b.from, to: b.to, sell: L.bookingSell(b), cost: L.bookingCost(b), paid: undefined, services: b.services.map(s => ({ type: s.type, title: s.title, qty: s.qty, sell: L.lineSell(s), cost: L.lineCost(s), supplier: s.supId ? pname(s.supId) : '', confirmation: s.conf || '' })), created: b.created, notes: b.notes });
function aiFind(a) {
  const k = a.kind || 'agent', t = String(a.text || '').toLowerCase(), has = (...x) => x.join(' ').toLowerCase().includes(t);
  if (['agent', 'supplier', 'customer'].includes(k)) return db.parties.filter(p => p.kind === k && has(p.name, p.phone, p.city)).slice(0, 12).map(p => ({ id: p.id, name: p.name, phone: p.phone, city: p.city, balance: L.balance(p.id), limit: p.limit || 0, active: p.active !== false }));
  if (k === 'expense') return db.expenses.filter(e => has(e.cat, e.note, e.id)).slice(-15).map(e => ({ id: e.id, date: e.date, cat: e.cat, amt: e.amt, note: e.note }));
  if (k === 'group') return db.groups.filter(g => has(g.id, g.code, g.airline)).slice(0, 12).map(g => ({ id: g.id, code: g.code, dep: g.dep, seats: g.seats }));
  if (k === 'query') return db.queries.filter(q => has(q.no, q.text)).slice(-12).map(q => ({ id: q.no, type: q.type, status: q.status, party: q.partyId ? pname(q.partyId) : '', text: q.text.slice(0, 120) }));
  if (k === 'payment') return db.payments.filter(x => has(x.id, x.ref, pname(x.partyId), x.method)).slice(-15).map(x => ({ id: x.id, date: x.date, amt: x.amt, status: x.status, method: x.method, dir: x.dir, party: pname(x.partyId), ref: x.ref }));
  if (k === 'booking') return db.bookings.filter(b => has(b.no, b.id, pname(b.partyId), b.pax.map(x => x.n + ' ' + x.pp).join(' '))).slice(-12).map(bk);
  if (k === 'voucher') return db.vouchers.filter(v => has(v.id, v.no, v.bookingId)).slice(-12).map(v => ({ id: v.id, bookingId: v.bookingId, status: v.status, approved: v.approved }));
  return [];
}
function aiSummary() {
  const t = today(), ym = t.slice(0, 7), live = db.bookings.filter(b => b.status !== 'Cancelled'), mon = live.filter(b => (b.created || '').startsWith(ym));
  const ag = db.parties.filter(p => p.kind !== 'supplier'), su = db.parties.filter(p => p.kind === 'supplier');
  const rec = ag.map(p => ({ n: p.name, b: L.balance(p.id) })).filter(x => x.b > 0).sort((a, b) => b.b - a.b), pay = su.map(p => ({ n: p.name, b: L.balance(p.id) })).filter(x => x.b > 0).sort((a, b) => b.b - a.b);
  const sum = a => a.reduce((x, y) => x + y, 0), mexp = db.expenses.filter(e => (e.date || '').startsWith(ym));
  return { today: t, currency: 'PKR', agents: db.parties.filter(p => p.kind === 'agent').length, customers: db.parties.filter(p => p.kind === 'customer').length, suppliers: su.length,
    bookings: { total: db.bookings.length, pendingApproval: db.bookings.filter(b => b.status === 'Pending').length, confirmed: db.bookings.filter(b => b.status === 'Confirmed').length, cancelled: db.bookings.filter(b => b.status === 'Cancelled').length },
    thisMonth: { bookings: mon.length, sales: sum(mon.map(L.bookingSell)), cost: sum(mon.map(L.bookingCost)), grossProfit: sum(mon.map(b => L.bookingSell(b) - L.bookingCost(b))), expenses: sum(mexp.map(e => e.amt)) },
    receivables: { total: sum(rec.map(x => x.b)), top: rec.slice(0, 5).map(x => ({ name: x.n, owes: x.b })) }, payables: { total: sum(pay.map(x => x.b)), top: pay.slice(0, 5).map(x => ({ name: x.n, weOwe: x.b })) },
    pendingPayments: { count: db.payments.filter(p => p.status === 'Pending').length, amount: sum(db.payments.filter(p => p.status === 'Pending').map(p => p.amt)) }, openQueries: db.queries.filter(q => q.status === 'Open').length,
    upcomingDepartures: live.filter(b => b.from && b.from >= t).sort((a, b) => (a.from < b.from ? -1 : 1)).slice(0, 5).map(b => ({ no: b.no, party: pname(b.partyId), from: b.from })), groupsOpen: db.groups.filter(g => g.dep >= t).length, bankAccounts: (db.settings.bank || []).filter(b => b.active !== false).length };
}
function aiLedger(a) {
  const p = findParty(null, a.partyId) || (a.name && db.parties.find(x => x.name.toLowerCase().includes(String(a.name).toLowerCase())));
  if (!p) return { error: 'Account not found' };
  const rows = L.ledger(p.id), n = Math.min(40, Math.max(1, +a.rows || 15));
  return { id: p.id, name: p.name, kind: p.kind, balance: L.balance(p.id), meaning: p.kind === 'supplier' ? 'balance = amount we owe the supplier' : 'balance = amount the account owes us', limit: p.limit || 0, wallet: p.kind === 'agent' ? L.wallet(p.id) : undefined, lastRows: rows.slice(-n).map(r => ({ date: r.d, ref: r.ref, text: r.t, dr: r.dr, cr: r.cr, bal: r.bal })) };
}
function aiPending(a) {
  const w = a.what || 'all', o = {};
  if (w === 'all' || w === 'bookings') o.bookings = db.bookings.filter(b => b.status === 'Pending').slice(-15).map(b => ({ no: b.no, party: pname(b.partyId), sell: L.bookingSell(b), created: b.created }));
  if (w === 'all' || w === 'payments') o.payments = db.payments.filter(p => p.status === 'Pending').slice(-15).map(p => ({ id: p.id, party: pname(p.partyId), amt: p.amt, method: p.method, ref: p.ref, date: p.date }));
  if (w === 'all' || w === 'queries') o.queries = db.queries.filter(q => q.status === 'Open').slice(-15).map(q => ({ no: q.no, type: q.type, text: q.text.slice(0, 100) }));
  return o;
}

const obj = (properties, required = []) => ({ type: 'object', properties, required });
const S = d => ({ type: 'string', description: d }), N = d => ({ type: 'number', description: d }), B = d => ({ type: 'boolean', description: d });
const LEG = obj({ flight_number: S('Airline code + number, e.g. SV 739'), from: S('3-letter departure airport code, e.g. LHE'), to: S('3-letter arrival airport code, e.g. JED'), departs: S('Departure time HH:MM (24h)'), arrives: S('Arrival time HH:MM (24h)'), baggage_kg: N('Checked baggage in kg') }, ['flight_number', 'from', 'to', 'departs', 'arrives']);
const LEG_PART = obj({ flight_number: S('e.g. SV 739'), from: S('3-letter code'), to: S('3-letter code'), departs: S('HH:MM'), arrives: S('HH:MM'), baggage_kg: N('kg') });
const PKG = { makkah_hotel: S('Makkah hotel name'), makkah_nights: N('Nights in Makkah'), makkah_distance: S('Distance from Haram, e.g. 300 m'), madinah_hotel: S('Madinah hotel name'), madinah_nights: N('Nights in Madinah'), madinah_distance: S('Distance from Masjid an-Nabawi'), sharing: N('Price per person, sharing (PKR)'), quad: N('Price per person, quad room (PKR)'), triple: N('Price per person, triple room (PKR)'), double: N('Price per person, double room (PKR)') };
const legIn = l => ({ fn: l.flight_number, from: l.from, to: l.to, dt: l.departs, at: l.arrives, bag: l.baggage_kg });
const pkgIn = p => ({ mk: p.makkah_hotel, mkn: p.makkah_nights, mkd: p.makkah_distance, md: p.madinah_hotel, mdn: p.madinah_nights, mdd: p.madinah_distance, p: { sh: p.sharing, qd: p.quad, tr: p.triple, db: p.double } });
const pick = (o, ks) => Object.fromEntries(ks.filter(k => o[k] !== undefined && o[k] !== null && o[k] !== '').map(k => [k, o[k]]));
const money = n => 'PKR ' + Math.round(n || 0).toLocaleString('en-US');
const describe = g => [`${g.airline} (${g.air}) · departs ${g.dep} · returns ${g.ret} · ${g.n} nights · ${g.seats} seats`, `Outbound ${g.out.fn} ${g.out.from}-${g.out.to} ${g.out.dt}-${g.out.at} · Return ${g.inb.fn} ${g.inb.from}-${g.inb.to} ${g.inb.dt}-${g.inb.at}`,
  ...g.pk.map(k => `${k.id}: ${k.mk || '-'} ${k.mkn}N + ${k.md || '-'} ${k.mdn}N — ` + [['Sharing', k.p.sh], ['Quad', k.p.qd], ['Triple', k.p.tr], ['Double', k.p.db]].filter(x => x[1]).map(x => x[0] + ' ' + x[1].toLocaleString('en-US')).join(' · '))];

/** Builds the exact group (or seat/removal) that a proposal would store; throws a readable error when it is invalid. */
function groupPlan(name, a, u) {
  const need = id => { const g = Gr.find(id); if (!g) throw new Error('No group with id "' + str(id, 30) + '". Use list_groups to find the right id.'); return g; };
  if (name === 'create_group') {
    const raw = { air: a.airline_code, airline: a.airline_name, code: a.group_code, dep: a.departure_date, ret: a.return_date, seats: a.seats, out: legIn(a.outbound || {}), inb: legIn(a.return_flight || {}), pk: (a.packages || []).map(pkgIn) };
    const g = Gr.normGroup(raw, null, { newId: () => 'UG-NEW' });
    return { op: 'saveGroup', payload: { group: raw }, label: `Create group ${g.airline} departing ${g.dep} (${g.seats} seats, ${g.pk.length} package${g.pk.length > 1 ? 's' : ''})`, detail: describe(g) };
  }
  if (name === 'update_group') {
    const prev = need(a.id), raw = { id: prev.id, ...pick({ air: a.airline_code, airline: a.airline_name, code: a.group_code, dep: a.departure_date, ret: a.return_date, seats: a.seats }, ['air', 'airline', 'code', 'dep', 'ret', 'seats']) };
    if (a.outbound) raw.out = pick(legIn(a.outbound), ['fn', 'from', 'to', 'dt', 'at', 'bag']); if (a.return_flight) raw.inb = pick(legIn(a.return_flight), ['fn', 'from', 'to', 'dt', 'at', 'bag']);
    const g = Gr.normGroup(raw, prev, { allowPast: prev.dep < today() });
    return { op: 'saveGroup', payload: { group: raw }, label: `Update group ${prev.id}`, detail: describe(g) };
  }
  if (name === 'set_group_package') {
    const prev = need(a.id), idx = a.package_id ? prev.pk.findIndex(k => k.id === String(a.package_id).toUpperCase()) : -1, inc = pkgIn(a);
    const old = idx >= 0 ? prev.pk[idx] : null, merged = old ? { ...old, ...pick(inc, ['mk', 'mkn', 'mkd', 'md', 'mdn', 'mdd']), p: { ...old.p, ...pick(inc.p, ['sh', 'qd', 'tr', 'db']) } } : inc;
    if (old && a.package_id) merged.id = old.id; else if (a.package_id) merged.id = String(a.package_id).toUpperCase();
    const pk = old ? prev.pk.map((k, i) => (i === idx ? merged : k)) : [...prev.pk, merged];
    const g = Gr.normGroup({ id: prev.id, pk }, prev, { allowPast: prev.dep < today() });
    return { op: 'saveGroup', payload: { group: { id: prev.id, pk } }, label: `${old ? 'Update' : 'Add'} package ${old ? old.id : ''} on ${prev.id}`.replace('  ', ' '), detail: describe(g) };
  }
  if (name === 'remove_group_package') {
    const prev = need(a.id), id = String(a.package_id || '').toUpperCase(), pk = prev.pk.filter(k => k.id !== id);
    if (pk.length === prev.pk.length) throw new Error('Group ' + prev.id + ' has no package "' + id + '".');
    const g = Gr.normGroup({ id: prev.id, pk }, prev, { allowPast: prev.dep < today() });
    return { op: 'saveGroup', payload: { group: { id: prev.id, pk } }, label: `Remove package ${id} from ${prev.id}`, detail: describe(g) };
  }
  if (name === 'set_group_seats') { const g = need(a.id); return { op: 'setSeats', payload: { id: g.id, seats: a.seats }, label: `Set seats of ${g.id} to ${Math.max(0, Math.round(+a.seats || 0))} (now ${g.seats})`, detail: [] }; }
  if (name === 'remove_group') { const g = need(a.id); return { op: 'delGroup', payload: { id: g.id }, label: `Remove group ${g.id} (${g.airline}, ${g.dep})`, detail: describe(g) }; }
  throw new Error('Unknown tool');
}
const GROUP_WRITE = (d, params, perm) => ({ d, params, ok: u => PM.can(u, perm) || (admin(u)), group: true });

const READ_TOOLS = {
  list_groups: { d: 'Read-only. Search upcoming Umrah group packages (departures that have not left yet). Returns id, airline, dates, seats left, lowest price, flights.', ok: gperm('groups.view'), params: obj({ query: S('Text: group id, hotel, airline, flight number'), airline: S('Airline code or name'), month: S('Departure month as YYYY-MM'), available_only: B('Only groups with seats left'), max_price: N('Maximum lowest price per person (PKR)'), limit: N('Max results (default 12)') }), run: a => { const r = Gr.search({ query: a.query, airline: a.airline, month: a.month, availableOnly: a.available_only, maxPrice: a.max_price, limit: a.limit }); return { count: r.length, groups: r.map(Gr.brief) }; } },
  get_group: { d: 'Read-only. Full details of one group: flights, every hotel package with room prices, seats left and seats booked.', ok: gperm('groups.view'), params: obj({ id: S('Group id such as UG-1234') }, ['id']), run: a => { const g = Gr.find(a.id); return g ? Gr.detail(g) : { error: 'Group not found' }; } },
  find_records: { d: 'Read-only lookup by text. kind: agent, supplier, customer, expense, group, query, payment, booking (by booking no., passenger name, passport or agent), voucher.', ok: admin, params: obj({ kind: { type: 'string', enum: ['agent', 'supplier', 'customer', 'expense', 'group', 'query', 'payment', 'booking', 'voucher'] }, text: S('Search text') }, ['kind']), run: aiFind },
  business_summary: { d: 'Read-only overview: counts, this month sales/cost/profit/expenses, receivables, payables, pending approvals, open queries, upcoming departures.', ok: admin, params: obj({}), run: aiSummary },
  get_ledger: { d: 'Read-only ledger and balance for an account (partyId or name).', ok: admin, params: obj({ partyId: N('Account id'), name: S('Account name'), rows: N('Rows') }), run: aiLedger },
  list_pending: { d: 'Read-only list of items waiting for action. what: all, bookings, payments, queries.', ok: admin, params: obj({ what: { type: 'string', enum: ['all', 'bookings', 'payments', 'queries'] } }), run: aiPending }
};
const GW = {
  create_group: GROUP_WRITE('Propose a NEW group package. Needs every field below; ask the person for anything missing instead of guessing. Prices are per person in PKR.', obj({ airline_code: S('2-letter IATA code, e.g. SV'), airline_name: S('Airline name'), group_code: S('Optional internal code'), departure_date: S('YYYY-MM-DD'), return_date: S('YYYY-MM-DD'), seats: N('Seats available'), outbound: LEG, return_flight: LEG, packages: { type: 'array', description: 'One entry per hotel combination', items: obj(PKG) } }, ['airline_code', 'departure_date', 'return_date', 'seats', 'outbound', 'return_flight', 'packages']), 'groups.create'),
  update_group: GROUP_WRITE('Propose changes to an existing group (dates, airline, seats, flight details). Only send the fields that change.', obj({ id: S('Group id'), airline_code: S('2-letter code'), airline_name: S('Airline name'), group_code: S('Internal code'), departure_date: S('YYYY-MM-DD'), return_date: S('YYYY-MM-DD'), seats: N('Seats'), outbound: LEG_PART, return_flight: LEG_PART }, ['id']), 'groups.edit'),
  set_group_package: GROUP_WRITE('Propose adding a hotel package to a group, or changing prices/hotels of an existing package (give package_id such as UP-1). Only send the fields that change.', obj({ id: S('Group id'), package_id: S('Existing package id to change; omit to add a new package'), ...PKG }, ['id']), 'groups.edit'),
  remove_group_package: GROUP_WRITE('Propose removing one hotel package from a group (a group keeps at least one).', obj({ id: S('Group id'), package_id: S('Package id, e.g. UP-2') }, ['id', 'package_id']), 'groups.edit'),
  set_group_seats: GROUP_WRITE('Propose setting the seats remaining on a group.', obj({ id: S('Group id'), seats: N('Seats remaining') }, ['id', 'seats']), 'groups.edit'),
  remove_group: GROUP_WRITE('Propose removing a group package.', obj({ id: S('Group id') }, ['id']), 'groups.delete')
};
const toWrite = (name, t) => ({ d: t.d, params: t.params || obj(Object.fromEntries(Object.entries(t.s).map(([k, v]) => [k, { type: /number/.test(v) ? 'number' : 'string', description: v }])), Object.entries(t.s).filter(([, v]) => !/\?/.test(v)).map(([k]) => k)), ok: admin, plan: (a, u) => ({ op: name, payload: a, label: t.label(a), detail: [] }), legacy: t });
const WRITE_TOOLS = { ...Object.fromEntries(Object.entries(AI_TOOLS).map(([k, t]) => [k, toWrite(k, t)])), ...GW };

const canUse = (t, u) => { try { return !!t.ok(u); } catch { return false; } };
const toolDefs = (u, c) => [...Object.entries(READ_TOOLS).filter(([, t]) => canUse(t, u)).map(([name, t]) => ({ type: 'function', function: { name, description: t.d, parameters: t.params } })),
  ...(c.allowWrites ? Object.entries(WRITE_TOOLS).filter(([, t]) => canUse(t, u)).map(([name, t]) => ({ type: 'function', function: { name, description: t.d, parameters: t.params } })) : [])];

/** turns a write-tool call into a validated proposal { op, args, label, detail } */
function propose(name, a, u) {
  const t = WRITE_TOOLS[name]; if (!t || !canUse(t, u)) throw new Error('You do not have permission to do that.');
  if (t.group) { const p = groupPlan(name, a, u); return { op: name, args: a, label: p.label, detail: p.detail }; }
  return { op: name, args: a, label: t.legacy.label(a), detail: [] };
}
function execute(name, a, u) {
  const t = WRITE_TOOLS[name]; if (!t || !canUse(t, u)) throw new Error('Not permitted: ' + name);
  if (t.group) { const p = groupPlan(name, a, u); PM.gate(u, p.op, p.payload); OPS[p.op](u, p.payload); return p.label; }
  t.legacy.run(a, u); return t.legacy.label(a);
}

/** rule-based fallback when no Groq key is configured */
function aiRules(q, u) {
  let m; const A = [], c = groqCfg(), j = o => JSON.stringify(o);
  const add = name => (args => { const p = propose(name, args, u); A.push(p); });
  const R = (reply, actions = []) => ({ reply, actions });
  const fmtG = g => `${g.id}: ${g.airline} · ${g.departs} · ${g.seatsLeft} seats · from ${money(g.fromPricePKR)}`;
  if (aiAccess(u) && /^(list |show |find )?groups?\b/i.test(q) && !/^group\s+ug-/i.test(q)) {
    if (!canUse(READ_TOOLS.list_groups, u)) return R('You do not have permission to view group packages.');
    const t = q.replace(/^(list |show |find )?groups?\s*/i, '').trim(), r = Gr.search({ query: t, limit: 15 });
    return R(r.length ? r.length + ' upcoming group(s):\n' + r.map(Gr.brief).map(fmtG).join('\n') : 'No upcoming groups' + (t ? ' match "' + t + '"' : '') + '.');
  }
  if ((m = q.match(/^group\s+(ug-\S+)/i))) { if (!canUse(READ_TOOLS.get_group, u)) return R('You do not have permission to view group packages.'); const g = Gr.find(m[1]); return R(g ? describe(g).join('\n') : 'I could not find that group.'); }
  if ((m = q.match(/^(?:set )?seats\s+(ug-\S+)\s+(\d+)/i))) { try { add('set_group_seats')({ id: m[1], seats: +m[2] }); } catch (e) { return R(e.message); } return R('Please confirm the change below.', A); }
  if ((m = q.match(/^remove group\s+(ug-\S+)/i))) { try { add('remove_group')({ id: m[1] }); } catch (e) { return R(e.message); } return R('Please confirm the change below.', A); }
  if (!admin(u)) return R('Groq is not connected, so I understand simple group commands only: "groups", "groups saudia", "group UG-1234", "seats UG-1234 20", "remove group UG-1234". To create a group, use the Add group button on the Group packages page, or ask your administrator to connect Groq.');
  if (/^(summary|overview|status|dashboard)\b/i.test(q)) { const s = aiSummary(); return R(`Today ${s.today}. Bookings: ${s.bookings.total} (${s.bookings.pendingApproval} pending). This month: sales ${money(s.thisMonth.sales)}, profit ${money(s.thisMonth.grossProfit)}. Receivable ${money(s.receivables.total)}, payable ${money(s.payables.total)}. Pending payments: ${s.pendingPayments.count}. Open queries: ${s.openQueries}.`); }
  if (/^pending\b/i.test(q)) { const p = aiPending({}); return R(`Pending: ${p.bookings.length} booking(s), ${p.payments.length} payment(s), ${p.queries.length} quer${p.queries.length === 1 ? 'y' : 'ies'}.`); }
  if (!c.allowWrites && /^(add|remove) /i.test(q)) return R('The assistant is read-only (changes are switched off in Settings > AI assistant).');
  const pr = (name, args) => { try { add(name)(args); return R('Please confirm the change below.', A); } catch (e) { return R(e.message); } };
  if ((m = q.match(/^add (agent|supplier|customer) (.+)/i))) return pr('add_party', { kind: m[1].toLowerCase(), name: m[2].trim() });
  if ((m = q.match(/^remove (agent|supplier|customer) (.+)/i))) { const p = findParty(m[1].toLowerCase(), m[2]); return p ? pr('remove_party', { id: p.id }) : R('I could not find that ' + m[1] + '.'); }
  if ((m = q.match(/^add expense (\d+)\s+(.+)/i))) return pr('add_expense', { amount: +m[1], category: db.settings.expenseCats.find(x => m[2].toLowerCase().startsWith(x.toLowerCase())) || 'Other', note: m[2] });
  if ((m = q.match(/^remove expense (\S+)/i))) return pr('remove_expense', { id: m[1].toUpperCase() });
  if ((m = q.match(/^remove query (\S+)/i))) return pr('remove_query', { id: m[1].toUpperCase() });
  if ((m = q.match(/^remove payment (\S+)/i))) return pr('remove_payment', { id: m[1].toUpperCase() });
  if ((m = q.match(/^add payment (\d+) (?:from|to|for) (.+?)(?: (cash|bank|cheque|online))?$/i))) { const p = findParty(null, m[2]); return p ? pr('add_payment', { partyId: p.id, amount: +m[1], method: m[3] || 'Cash' }) : R('I could not find "' + m[2] + '".'); }
  if ((m = q.match(/balance (?:of|for) (.+)/i))) { const p = findParty(null, m[1]) || db.parties.find(x => x.name.toLowerCase().includes(m[1].trim().toLowerCase())); return R(p ? p.name + ': ' + money(L.balance(p.id)) + (p.kind === 'supplier' ? ' payable to supplier' : ' receivable') : 'I could not find that account.'); }
  return R('Groq is not connected, so I understand simple commands only: "summary", "pending", "groups", "group UG-1234", "seats UG-1234 20", "remove group UG-1234", "balance of Al Noor", "add agent Al Noor Travels", "add expense 25000 rent", "add payment 100000 from Al Noor bank". Add a Groq API key in Settings > AI assistant for full natural-language answers and for creating groups.');
}

function systemPrompt(u, c) {
  const can = toolDefs(u, c).map(t => t.function.name);
  const scope = admin(u) ? `You answer questions about ANY data in the CRM - bookings, passengers, agents, suppliers, customers, ledgers, balances, payments, expenses, groups, queries, vouchers, profit - by calling the read-only tools.` : `You are limited to GROUP PACKAGES. You may only see and change what this person's permissions allow (${u.name}, staff). You cannot see bookings, ledgers, payments or any other data - if asked, say it is outside what they can use here.`;
  return `You are the built-in assistant of a travel agency CRM (${db.settings.company.name || 'The Umrah Store'}, Pakistan; currency PKR). ${scope} Never guess numbers, ids or prices: look them up with a tool. ${c.allowWrites ? 'Changes are only PROPOSED with the tools; nothing is saved until the person presses Confirm, so say that confirmation is needed. You cannot approve, cancel or edit anything beyond your tools. To change or remove something, first look up its exact id with list_groups / find_records. When creating a group, ask for any missing detail (airline, dates, both flights with times, seats, each hotel package and its room prices) before calling create_group - never invent flights, hotels or prices. If a tool returns an error, read it, fix the arguments or ask the person; do not give up silently.' : 'You are READ-ONLY: you cannot add, remove or change anything; if asked, say that changes are switched off.'} Group room prices are per person in PKR for Sharing, Quad, Triple and Double rooms. Balance meaning: agents/customers = what they owe us; suppliers = what we owe them. Today is ${today()}. Tools available to you now: ${can.join(', ')}. Format money as PKR with thousands separators. Be concise and direct, use short lists. Never reveal passwords, API keys or secrets (you have no access to them).${c.instructions ? '\nExtra instructions from the administrator: ' + c.instructions : ''}`;
}

async function aiAsk(u, q, history) {
  if (!aiAccess(u)) throw Object.assign(new Error('The AI assistant is not enabled for your account.'), { status: 403 });
  const c = groqCfg(); if (!aiReady()) return aiRules(q, u);
  const msgs = [{ role: 'system', content: systemPrompt(u, c) }, ...(Array.isArray(history) ? history : []).slice(-8).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content || '').slice(0, 1500) })), { role: 'user', content: q }];
  const actions = [], tools = toolDefs(u, c), state = {}; let reply = '';
  for (let i = 0; i < 8; i++) {
    const j = await groqChat(c, { temperature: c.temperature, max_completion_tokens: 3000, messages: msgs, tools, tool_choice: 'auto' }, state);
    const ch = (j.choices && j.choices[0]) || {}, m = ch.message || {}; if (m.content) reply = String(m.content).trim();
    const calls = m.tool_calls || []; if (!calls.length) break;
    msgs.push({ role: 'assistant', content: m.content || null, tool_calls: calls });
    for (const t of calls) {
      let args = {}; try { args = JSON.parse(t.function.arguments || '{}'); } catch { /* empty */ }
      const name = t.function.name; let out;
      if (READ_TOOLS[name] && canUse(READ_TOOLS[name], u)) { try { out = JSON.stringify(READ_TOOLS[name].run(args, u)).slice(0, 7000); } catch (e) { out = JSON.stringify({ error: e.message }); } }
      else if (WRITE_TOOLS[name] && c.allowWrites && canUse(WRITE_TOOLS[name], u)) {
        if (actions.length >= c.maxActions) out = 'Limit reached: too many changes in one request.';
        else { try { actions.push(propose(name, args, u)); out = 'Queued - awaiting confirmation by the person. Tell them what you are proposing.'; } catch (e) { out = 'Not queued: ' + e.message; } }
      } else out = 'Unknown tool, or you are not allowed to use it.';
      msgs.push({ role: 'tool', tool_call_id: t.id, content: out });
    }
    if (ch.finish_reason !== 'tool_calls') break;
  }
  return { reply: reply || (actions.length ? 'Please confirm the changes below.' : 'Nothing to do.'), actions, ai: true, model: state.model || c.model, notice: state.notice || '' };
}

/** runs confirmed proposals as the signed-in user; every one is re-validated and re-checked against that user's permissions */
function aiRun(u, actions) {
  if (!aiAccess(u)) throw Object.assign(new Error('The AI assistant is not enabled for your account.'), { status: 403 });
  const res = [], c = groqCfg();
  (Array.isArray(actions) ? actions : []).slice(0, c.maxActions).forEach(a => {
    const name = String((a && a.op) || ''), args = a && typeof a.args === 'object' && a.args ? a.args : {};
    if (!c.allowWrites || !WRITE_TOOLS[name]) return res.push({ ok: false, m: 'Not permitted: ' + name });
    let label = name; try { label = propose(name, args, u).label; } catch (e) { return res.push({ ok: false, m: name + ' - ' + e.message }); }
    try { execute(name, args, u); res.push({ ok: true, m: label }); PM.audit(u, 'assistant.action', name, { label }); } catch (e) { res.push({ ok: false, m: label + ' - ' + e.message }); }
  });
  logAct(u, 'AI assistant', res.filter(r => r.ok).length + ' change(s) confirmed'); return res;
}

module.exports = { aiAsk, aiRun, aiReady, aiAccess, groqCfg, groqTest, init, toolDefs, propose, GROQ_MODELS, PREFERRED, OUTDATED };
