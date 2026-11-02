'use strict';
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const D = require('./db');
const { db, DATA, str, nid, today, logAct, token } = D;
const L = require('./ledger');
const { OPS } = require('./ops');

const nowISO = () => new Date().toISOString();
const fetchJson = async (url, opt, ms = 25000) => {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { ...opt, signal: ac.signal }); const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; } return { ok: r.ok, status: r.status, j }; }
  finally { clearTimeout(t); }
};

/* =====================================================================
   SerpApi - live flights and hotels (cached 10 minutes to save credits)
   ===================================================================== */
const cache = new Map(), hits = new Map();
const serpKey = () => process.env.SERPAPI_KEY || db.settings.serpapiKey || '';
const markup = n => Math.round(n * (1 + (db.settings.markupPct || 0) / 100));
const hhmm = s => String(s || '').slice(-5);

async function serp(kind, q, user) {
  const key = serpKey(); if (!key) return { configured: false };
  const h = (hits.get(user.id) || []).filter(x => Date.now() - x < 36e5);
  if (h.length >= 40) throw new Error('Search limit reached (40 per hour). Please try again later.');
  const ck = kind + JSON.stringify(q), c = cache.get(ck); if (c && Date.now() - c.t < 6e5) return c.v;
  const u = new URL('https://serpapi.com/search.json');
  const staff = user.role === 'admin' || user.role === 'staff';
  const int = (v, d, mx) => Math.min(mx, Math.max(0, parseInt(v, 10) || d));
  const ad = int(q.adults, 1, 9), ch = int(q.children, 0, 8), inf = int(q.infants, 0, 4);
  const P = kind === 'flights'
    ? { engine: 'google_flights', departure_id: q.from, arrival_id: q.to, outbound_date: q.date, return_date: q.ret || undefined, type: q.ret ? 1 : 2, adults: ad || 1, children: ch || undefined, infants_in_seat: inf || undefined,
        travel_class: ['1', '2', '3', '4'].includes(String(q.cls)) ? q.cls : undefined, stops: q.direct === '1' ? 1 : undefined, bags: int(q.bags, 0, 5) || undefined, currency: 'PKR', hl: 'en', gl: 'pk' }
    : { engine: 'google_hotels', q: q.city || 'Makkah', check_in_date: q.cin, check_out_date: q.cout, adults: ad || 2, children: ch || undefined, children_ages: ch ? (q.ages || Array(ch).fill(8).join(',')) : undefined,
        hotel_class: q.stars || undefined, sort_by: ['3', '8', '13'].includes(String(q.sort)) ? q.sort : undefined, rating: ['7', '8', '9'].includes(String(q.rating)) ? q.rating : undefined, free_cancellation: q.free === '1' ? 'true' : undefined, currency: 'PKR', hl: 'en', gl: 'pk' };
  Object.entries({ ...P, api_key: key }).forEach(([a, b]) => b != null && b !== '' && u.searchParams.set(a, b));
  const r = await fetchJson(u); hits.set(user.id, [...h, Date.now()]);
  if (r.j.error && !/hasn't returned any results|no results/i.test(String(r.j.error))) throw new Error(String(r.j.error));
  let items = [], extra = {};
  if (kind === 'flights') {
    const pi = r.j.price_insights;
    if (pi) extra.insight = { lowest: markup(pi.lowest_price || 0), level: pi.price_level || '', typical: (pi.typical_price_range || []).map(markup) };
    items = [...(r.j.best_flights || []).map(f => ({ ...f, best: true })), ...(r.j.other_flights || [])].filter(f => f.price && f.flights && f.flights.length).map(f => {
      const a = f.flights[0], z = f.flights[f.flights.length - 1], lay = f.layovers || [];
      return { best: !!f.best, airline: a.airline, logo: f.airline_logo || a.airline_logo || '', airlines: [...new Set(f.flights.map(x => x.airline))], nos: f.flights.map(x => (x.flight_number || '').trim()).filter(Boolean),
        from: a.departure_airport.id, fromName: a.departure_airport.name || '', to: z.arrival_airport.id, toName: z.arrival_airport.name || '',
        dep: a.departure_airport.time, arr: z.arrival_airport.time, dur: f.total_duration, stops: f.flights.length - 1, via: lay.map(l => l.id).join(', '), cls: a.travel_class || '', plane: a.airplane || '',
        co2: f.carbon_emissions && f.carbon_emissions.this_flight ? Math.round(f.carbon_emissions.this_flight / 1000) : 0, co2diff: f.carbon_emissions ? f.carbon_emissions.difference_percent : 0,
        ext: (f.extensions || []).slice(0, 4), overnight: f.flights.some(x => x.overnight),
        lay: lay.map(l => ({ id: l.id, name: l.name || '', dur: l.duration, night: !!l.overnight })),
        segs: f.flights.map(x => ({ no: (x.flight_number || '').trim(), from: x.departure_airport.id, fromName: x.departure_airport.name || '', to: x.arrival_airport.id, toName: x.arrival_airport.name || '', dep: x.departure_airport.time, arr: x.arrival_airport.time, air: x.airline, logo: x.airline_logo || '', dur: x.duration, plane: x.airplane || '', legroom: x.legroom || '', delayed: !!x.often_delayed_by_over_30_min, night: !!x.overnight })),
        base: f.price, price: markup(f.price), round: !!q.ret };
    });
  } else {
    items = (r.j.properties || []).map(h2 => {
      const base = (h2.rate_per_night && h2.rate_per_night.extracted_lowest) || 0, tot = h2.total_rate && h2.total_rate.extracted_lowest;
      const imgs = (h2.images || []).map(i => i.thumbnail || i.original_image).filter(Boolean).slice(0, 5);
      return { name: h2.name, type: h2.type || 'hotel', img: imgs[0] || '', imgs, stars: h2.extracted_hotel_class || 0, rating: h2.overall_rating || 0, reviews: h2.reviews || 0,
        desc: h2.description || '', amenities: (h2.amenities || []).slice(0, 8), cin: h2.check_in_time || '', cout: h2.check_out_time || '',
        near: (h2.nearby_places || []).slice(0, 3).map(n => ({ name: n.name, t: n.transportations && n.transportations[0] ? n.transportations[0].type + ' ' + n.transportations[0].duration : '' })),
        free: /free cancellation/i.test(JSON.stringify(h2.extensions || []) + (h2.deal_description || '')), eco: !!h2.eco_certified, gps: h2.gps_coordinates ? [h2.gps_coordinates.latitude, h2.gps_coordinates.longitude] : null,
        base, price: markup(base), total: tot ? markup(tot) : 0, deal: h2.deal || '', link: h2.link || '' };
    }).filter(x => x.base);
  }
  const v = { configured: true, kind, items: items.slice(0, 60), staff, markup: db.settings.markupPct || 0, ...extra };
  cache.set(ck, { t: Date.now(), v }); if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}

/* =====================================================================
   PayFast (APPS / GoPayFast Pakistan): token -> hosted checkout -> return/IPN
   ===================================================================== */
const pfBase = () => (db.settings.payfast.env === 'live' ? 'https://ipg1.apps.net.pk' : 'https://ipguat.apps.net.pk') + '/Ecommerce/api/Transaction';
const pfConfigured = () => !!(db.settings.payfast.merchantId && db.settings.payfast.securedKey);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const base = req => db.settings.baseUrl || (req.protocol + '://' + req.get('host'));

async function payfastStart(req, { partyId, amt, note, bookingId, linkId, userName, email, phone }) {
  if (!pfConfigured()) throw new Error('Online payment is not configured yet. Ask the office to add PayFast credentials in Settings.');
  amt = Math.round(+amt);
  if (!(amt >= 100)) throw new Error('Enter an amount of at least PKR 100.');
  const pf = db.settings.payfast, id = 'PY-' + nid(), basket = 'PF' + Date.now().toString(36).toUpperCase() + id.slice(3);
  const tr = await fetchJson(pfBase() + '/GetAccessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ MERCHANT_ID: pf.merchantId, SECURED_KEY: pf.securedKey, BASKET_ID: basket, TXNAMT: String(amt), CURRENCY_CODE: 'PKR' }).toString() });
  const tok = tr.j && (tr.j.ACCESS_TOKEN || tr.j.access_token);
  if (!tok) throw new Error('PayFast did not issue a token' + (tr.j && (tr.j.message || tr.j.ERROR_MESSAGE) ? ': ' + (tr.j.message || tr.j.ERROR_MESSAGE) : '') + '. Check the merchant ID and secured key.');
  const o = base(req), pty = D.party(partyId);
  db.payments.push({ id, dir: 'in', partyId, amt, method: 'PayFast', ref: basket, date: today(), rc: '', status: 'Initiated', by: userName || (pty && pty.name) || 'Online', note: str(note, 300), bookingId: bookingId || '', via: 'payfast', basket, linkId: linkId || '', created: nowISO() });
  D.save();
  const fields = { CURRENCY_CODE: 'PKR', MERCHANT_ID: pf.merchantId, MERCHANT_NAME: pf.merchantName || db.settings.company.name, TOKEN: tok, BASKET_ID: basket, TXNAMT: String(amt),
    ORDER_DATE: new Date().toISOString().replace('T', ' ').slice(0, 19), SUCCESS_URL: o + '/payfast/return', FAILURE_URL: o + '/payfast/return', CHECKOUT_URL: o + '/payfast/ipn',
    CUSTOMER_EMAIL_ADDRESS: email || (pty && pty.email) || db.settings.company.email || 'info@theumrahstore.com', CUSTOMER_MOBILE_NO: String(phone || (pty && pty.phone) || db.settings.company.phone || '03136935568').replace(/[^\d]/g, '').replace(/^92/, '0').slice(0, 15), SIGNATURE: crypto.randomBytes(8).toString('hex'),
    VERSION: 'THEUMRAHSTORE-1.0', TXNDESC: str(note, 100) || 'Payment to ' + db.settings.company.name, PROCCODE: '00', TRAN_TYPE: 'ECOMM_PURCHASE' };
  if (pf.storeId) fields.STORE_ID = pf.storeId;
  return { action: pfBase() + '/PostTransaction', fields, id };
}

/** Admin 'Test connection': asks PayFast for an access token (no money moves, nothing is stored). */
async function payfastTest(over = {}) {
  const c = db.settings.payfast, pf = { ...c, ...Object.fromEntries(Object.entries(over).filter(([k, v]) => v && !/^\*+$/.test(v))) };
  if (!pf.merchantId || !pf.securedKey) throw new Error('Enter the merchant ID and secured key first.');
  const base0 = (pf.env === 'live' ? 'https://ipg1.apps.net.pk' : 'https://ipguat.apps.net.pk') + '/Ecommerce/api/Transaction';
  const tr = await fetchJson(base0 + '/GetAccessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ MERCHANT_ID: pf.merchantId, SECURED_KEY: pf.securedKey, BASKET_ID: 'TEST' + Date.now().toString(36), TXNAMT: '100', CURRENCY_CODE: 'PKR' }).toString() }, 15000);
  const ok = !!(tr.j && (tr.j.ACCESS_TOKEN || tr.j.access_token));
  return { ok, env: pf.env, message: ok ? 'PayFast accepted the credentials (' + (pf.env === 'live' ? 'live' : 'sandbox') + ').' : 'PayFast rejected the credentials' + (tr.j && (tr.j.message || tr.j.ERROR_MESSAGE) ? ': ' + (tr.j.message || tr.j.ERROR_MESSAGE) : '') + '.' };
}

/** Handles both the browser return and the server IPN. Returns the payment (or null). */
function payfastResult(q) {
  const basket = String(q.basket_id || q.BASKET_ID || ''), code = String(q.err_code || q.ERR_CODE || ''), vh = String(q.validation_hash || q.VALIDATION_HASH || '');
  const p = db.payments.find(x => x.via === 'payfast' && x.basket === basket); if (!p) return null;
  if (p.status === 'Approved') return p;
  if (!vh && !code) return p; // bare visit to the return URL: nothing to settle yet
  const pf = db.settings.payfast, expect = sha([basket, pf.securedKey, pf.merchantId, code].join('|'));
  const success = code === '000' || code === '00';
  const paidAmt = +String(q.transaction_amount || q.TRANSACTION_AMOUNT || q.txnamt || q.TXNAMT || '').replace(/,/g, ''), amtBad = paidAmt > 0 && Math.abs(paidAmt - p.amt) > 0.5;
  p.txn = str(q.transaction_id || q.TRANSACTION_ID, 60); p.pfMsg = str(q.err_msg || q.ERR_MSG, 160);
  if (success && vh && safeEq(vh.toLowerCase(), expect) && !amtBad) {
    p.status = 'Approved'; p.note = (p.note ? p.note + ' | ' : '') + 'PayFast txn ' + (p.txn || basket); p.ref = p.txn || p.ref;
    if (p.linkId) { const l = db.paylinks.find(x => x.id === p.linkId); if (l) { l.status = 'Paid'; l.paymentId = p.id; } }
    logAct(null, 'PayFast payment received', p.id + ' PKR ' + p.amt);
  } else if (success) {
    p.status = 'Pending'; p.note = (p.note ? p.note + ' | ' : '') + (amtBad ? 'PayFast reported PKR ' + paidAmt + ' but PKR ' + p.amt + ' was expected - verify in the PayFast dashboard before approving.' : 'PayFast reported success but the signature did not match - verify in the PayFast dashboard before approving.'); logAct(null, 'PayFast payment needs review', p.id);
  } else { p.status = 'Failed'; logAct(null, 'PayFast payment failed', p.id + ' ' + code); }
  D.save(); return p;
}

/* =====================================================================
   WhatsApp (Baileys, linked by QR). Optional dependency.
   ===================================================================== */
const wa = { status: 'off', qr: '', number: '', error: '', sock: null, retry: 0 };
const AUTH = path.join(DATA, 'wa-auth');
const stubLog = { level: 'silent', trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child() { return stubLog; } };

function waIncoming({ phone, name, text, jid }) {
  if (!text) return;
  const open = db.queries.find(q => q.source === 'whatsapp' && q.contact.phone === phone && q.status === 'Open' && Date.now() - new Date(q.createdAt).getTime() < 30 * 60000);
  if (open) { open.text = (open.text + '\n' + text).slice(0, 2000); open.log.push({ t: nowISO(), m: text.slice(0, 200) }); D.save(); return; }
  const known = db.parties.find(p => p.phone && phone && p.phone.replace(/\D/g, '').slice(-9) === phone.replace(/\D/g, '').slice(-9) && p.kind !== 'supplier');
  const q = { id: 'q' + nid(), no: 'Q-' + token(3).replace(/[^A-Za-z0-9]/g, 'x').toUpperCase().slice(0, 5), type: 'other', source: 'whatsapp', partyId: known ? known.id : null, contact: { name: name || (known && known.name) || '', phone, jid }, text: text.slice(0, 2000),
    details: {}, status: 'Open', createdAt: nowISO(), dueAt: new Date(Date.now() + (db.settings.sla.other || 24) * 36e5).toISOString(), by: 'WhatsApp', log: [] };
  db.queries.push(q); logAct(null, 'WhatsApp query received', q.no + ' from ' + phone); D.save();
}

async function waStart() {
  if (wa.sock || wa.status === 'starting') return;
  let B; try { B = await import('@whiskeysockets/baileys'); } catch { wa.status = 'unavailable'; wa.error = 'WhatsApp library is not installed on this server.'; return; }
  wa.status = 'starting'; wa.error = '';
  try {
    const makeWASocket = B.default || B.makeWASocket, { state, saveCreds } = await B.useMultiFileAuthState(AUTH);
    let version; try { version = (await B.fetchLatestBaileysVersion()).version; } catch { /* use bundled */ }
    const sock = makeWASocket({ auth: state, version, logger: stubLog, browser: ['The Umrah Store CRM', 'Chrome', '1.0'], markOnlineOnConnect: false, syncFullHistory: false });
    wa.sock = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', u => {
      if (u.qr) { wa.qr = u.qr; wa.status = 'qr'; }
      if (u.connection === 'open') { wa.status = 'open'; wa.qr = ''; wa.retry = 0; wa.number = String((sock.user && sock.user.id) || '').split(':')[0].split('@')[0]; }
      if (u.connection === 'close') {
        const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
        wa.sock = null; wa.qr = '';
        if (code === (B.DisconnectReason || {}).loggedOut) { wa.status = 'off'; wa.number = ''; try { fs.rmSync(AUTH, { recursive: true, force: true }); } catch { /* ignore */ } }
        else { wa.status = 'starting'; setTimeout(() => { wa.status = 'off'; waStart(); }, Math.min(30000, 3000 * ++wa.retry)); }
      }
    });
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) {
        try {
          const k = m.key || {}; if (k.fromMe || !k.remoteJid || /@g\.us$|status@broadcast|@newsletter/.test(k.remoteJid)) continue;
          const msg = m.message || {}, text = msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text) || (msg.imageMessage && msg.imageMessage.caption) || (msg.documentMessage && msg.documentMessage.caption) || '';
          const alt = k.remoteJidAlt || k.senderPn || '', jid = /@s\.whatsapp\.net$/.test(k.remoteJid) ? k.remoteJid : (alt || k.remoteJid);
          waIncoming({ phone: '+' + String(jid).split('@')[0].split(':')[0], name: m.pushName || '', text: String(text).trim(), jid: k.remoteJid });
        } catch (e) { console.error('wa message', e.message); }
      }
    });
  } catch (e) { wa.status = 'off'; wa.sock = null; wa.error = e.message; }
}
async function waStop(logout) {
  try { if (wa.sock) { if (logout) await wa.sock.logout(); else wa.sock.end(); } } catch { /* ignore */ }
  wa.sock = null; wa.qr = ''; wa.status = 'off'; wa.number = '';
  if (logout) try { fs.rmSync(AUTH, { recursive: true, force: true }); } catch { /* ignore */ }
}
const waAutoStart = () => { if (fs.existsSync(path.join(AUTH, 'creds.json'))) waStart(); };

/* =====================================================================
   AI assistant (Groq). Reads anything in the CRM (read-only tools) and can
   ONLY add or remove records; every change is proposed first and executed
   only after the administrator confirms it. API keys are never exposed to it.
   ===================================================================== */
const GROQ_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'meta-llama/llama-4-scout-17b-16e-instruct'];
const groqKey = () => process.env.GROQ_API_KEY || (db.settings.groq && db.settings.groq.apiKey) || '';
const groqCfg = () => { const g = db.settings.groq || {}; return { key: groqKey(), model: process.env.GROQ_MODEL || g.model || GROQ_MODELS[0], temperature: Math.max(0, Math.min(1, +g.temperature >= 0 ? +g.temperature : 0.2)), enabled: g.enabled !== false, allowWrites: g.allowWrites !== false, maxActions: Math.max(1, Math.min(20, +g.maxActions || 10)), instructions: String(g.instructions || '').slice(0, 1500) }; };
const aiReady = () => { const c = groqCfg(); return !!(c.key && c.enabled); };

const findParty = (kind, name) => db.parties.find(p => (!kind || p.kind === kind) && (String(p.id) === String(name) || p.name.toLowerCase() === String(name || '').trim().toLowerCase()));
const ADMIN = () => db.users.find(u => u.id === 'admin');
const pname = id => (D.party(id) || {}).name || String(id);
const AI_TOOLS = {
  add_party: { d: 'Add a new agent, supplier or B2C customer account.', s: { kind: 'agent|supplier|customer', name: 'string', phone: 'string?', city: 'string?', limit: 'number? credit limit for agents (PKR)' },
    run: a => OPS.saveParty(ADMIN(), { kind: a.kind, name: a.name, phone: a.phone, city: a.city, limit: a.limit }), label: a => `Add ${a.kind} "${a.name}"` },
  remove_party: { d: 'Remove an account that has no transactions. Pass the account id from find_records.', s: { id: 'number' }, run: a => OPS.delParty(ADMIN(), { id: a.id }), label: a => 'Remove account ' + pname(a.id) },
  add_expense: { d: 'Record a business expense.', s: { amount: 'number (PKR)', category: 'string', note: 'string?', date: 'YYYY-MM-DD?' }, run: a => OPS.addExpense(ADMIN(), { amt: a.amount, cat: a.category, note: a.note, date: a.date }), label: a => `Add expense PKR ${a.amount} - ${a.category}` },
  remove_expense: { d: 'Remove an expense by id (EX-...).', s: { id: 'string' }, run: a => OPS.delExpense(ADMIN(), { id: a.id }), label: a => 'Remove expense ' + a.id },
  add_payment: { d: 'Record an approved payment received from an agent/customer or paid to a supplier. partyId from find_records.', s: { partyId: 'number', amount: 'number (PKR)', method: 'string?', note: 'string?', date: 'YYYY-MM-DD?' }, run: a => OPS.addPayment(ADMIN(), { partyId: a.partyId, amt: a.amount, method: a.method, note: a.note, date: a.date }), label: a => `Record payment PKR ${a.amount} for ${pname(a.partyId)}` },
  remove_payment: { d: 'Remove a payment record by id (PY-...).', s: { id: 'string' }, run: a => OPS.delPayment(ADMIN(), { id: a.id }), label: a => 'Remove payment ' + a.id },
  remove_group: { d: 'Remove a group package by id (UG-...).', s: { id: 'string' }, run: a => OPS.delGroup(ADMIN(), { id: a.id }), label: a => 'Remove group ' + a.id },
  add_query: { d: 'Log a new customer query.', s: { type: 'flight|hotel|visa|transport|package|other', text: 'string', partyId: 'number?' }, run: a => OPS.addQuery(ADMIN(), { type: a.type, text: a.text, partyId: a.partyId }), label: a => `Log ${a.type} query` },
  remove_query: { d: 'Remove a query by number (Q-...).', s: { id: 'string' }, run: a => OPS.delQuery(ADMIN(), { id: a.id }), label: a => 'Remove query ' + a.id }
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
const READ_TOOLS = {
  find_records: { d: 'Read-only lookup by text. kind: agent, supplier, customer, expense, group, query, payment, booking (by booking no., passenger name, passport or agent), voucher.', p: { kind: { type: 'string', enum: ['agent', 'supplier', 'customer', 'expense', 'group', 'query', 'payment', 'booking', 'voucher'] }, text: { type: 'string' } }, req: ['kind'], run: aiFind },
  business_summary: { d: 'Read-only overview: counts, this month sales/cost/profit/expenses, receivables, payables, pending approvals, open queries, upcoming departures.', p: {}, req: [], run: aiSummary },
  get_ledger: { d: 'Read-only ledger and balance for an account (partyId or name).', p: { partyId: { type: 'number' }, name: { type: 'string' }, rows: { type: 'number' } }, req: [], run: aiLedger },
  list_pending: { d: 'Read-only list of items waiting for action. what: all, bookings, payments, queries.', p: { what: { type: 'string', enum: ['all', 'bookings', 'payments', 'queries'] } }, req: [], run: aiPending }
};
const toolDefs = c => [...Object.entries(READ_TOOLS).map(([name, t]) => ({ type: 'function', function: { name, description: t.d, parameters: { type: 'object', properties: t.p, required: t.req } } })),
  ...(c.allowWrites ? Object.entries(AI_TOOLS).map(([name, t]) => ({ type: 'function', function: { name, description: t.d, parameters: { type: 'object', properties: Object.fromEntries(Object.entries(t.s).map(([k, v]) => [k, { type: /number/.test(v) ? 'number' : 'string', description: v }])), required: Object.entries(t.s).filter(([, v]) => !/\?/.test(v)).map(([k]) => k) } } })) : [])];

/** rule-based fallback when no Groq key is configured */
function aiRules(q) {
  let m; const A = [], c = groqCfg();
  const add = (op, args) => A.push({ op, args, label: AI_TOOLS[op].label(args) });
  const j = o => JSON.stringify(o, null, 1);
  if (/^(summary|overview|status|dashboard)\b/i.test(q)) { const s = aiSummary(); return { reply: `Today ${s.today}. Bookings: ${s.bookings.total} (${s.bookings.pendingApproval} pending). This month: sales PKR ${s.thisMonth.sales.toLocaleString('en-US')}, profit PKR ${s.thisMonth.grossProfit.toLocaleString('en-US')}. Receivable PKR ${s.receivables.total.toLocaleString('en-US')}, payable PKR ${s.payables.total.toLocaleString('en-US')}. Pending payments: ${s.pendingPayments.count}. Open queries: ${s.openQueries}.`, actions: [] }; }
  if (/^pending\b/i.test(q)) { const p = aiPending({}); return { reply: `Pending: ${p.bookings.length} booking(s), ${p.payments.length} payment(s), ${p.queries.length} quer${p.queries.length === 1 ? 'y' : 'ies'}.`, actions: [] }; }
  if (!c.allowWrites && /^(add|remove) /i.test(q)) return { reply: 'The assistant is read-only (changes are switched off in Settings > AI assistant).', actions: [] };
  if ((m = q.match(/^add (agent|supplier|customer) (.+)/i))) add('add_party', { kind: m[1].toLowerCase(), name: m[2].trim() });
  else if ((m = q.match(/^remove (agent|supplier|customer) (.+)/i))) { const p = findParty(m[1].toLowerCase(), m[2]); if (!p) return { reply: 'I could not find that ' + m[1] + '.', actions: [] }; add('remove_party', { id: p.id }); }
  else if ((m = q.match(/^add expense (\d+)\s+(.+)/i))) add('add_expense', { amount: +m[1], category: db.settings.expenseCats.find(x => m[2].toLowerCase().startsWith(x.toLowerCase())) || 'Other', note: m[2] });
  else if ((m = q.match(/^remove expense (\S+)/i))) add('remove_expense', { id: m[1].toUpperCase() });
  else if ((m = q.match(/^remove group (\S+)/i))) add('remove_group', { id: m[1].toUpperCase() });
  else if ((m = q.match(/^remove query (\S+)/i))) add('remove_query', { id: m[1].toUpperCase() });
  else if ((m = q.match(/^remove payment (\S+)/i))) add('remove_payment', { id: m[1].toUpperCase() });
  else if ((m = q.match(/^add payment (\d+) (?:from|to|for) (.+?)(?: (cash|bank|cheque|online))?$/i))) { const p = findParty(null, m[2]); if (!p) return { reply: 'I could not find "' + m[2] + '".', actions: [] }; add('add_payment', { partyId: p.id, amount: +m[1], method: m[3] || 'Cash' }); }
  else if ((m = q.match(/balance (?:of|for) (.+)/i))) { const p = findParty(null, m[1]) || db.parties.find(x => x.name.toLowerCase().includes(m[1].trim().toLowerCase())); return { reply: p ? p.name + ': PKR ' + Math.round(L.balance(p.id)).toLocaleString('en-US') + (p.kind === 'supplier' ? ' payable to supplier' : ' receivable') : 'I could not find that account.', actions: [] }; }
  else return { reply: 'Groq is not connected, so I understand simple commands only: "summary", "pending", "balance of Al Noor", "add agent Al Noor Travels", "add expense 25000 rent", "add payment 100000 from Al Noor bank", "remove expense EX-1012". Add a Groq API key in Settings > AI assistant for full natural-language answers about everything in the CRM.', actions: [] };
  return { reply: 'Please confirm the change below.', actions: A };
}

const groqCall = async (c, body) => {
  const r = await fetchJson(GROQ_URL + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + c.key }, body: JSON.stringify(body) }, 45000);
  if (!r.ok) { const m = (r.j.error && r.j.error.message) || r.j.raw || 'Groq request failed'; throw new Error(r.status === 401 ? 'Groq rejected the API key. Check it in Settings > AI assistant.' : r.status === 429 ? 'Groq rate limit reached. Wait a moment and try again. (' + String(m).slice(0, 120) + ')' : 'Groq: ' + String(m).slice(0, 220)); }
  return r.j;
};
async function aiAsk(q, history) {
  const c = groqCfg(); if (!aiReady()) return aiRules(q);
  const system = `You are the built-in assistant of a travel agency CRM (${db.settings.company.name || 'The Umrah Store'}, Pakistan; currency PKR). You answer questions about ANY data in the CRM - bookings, passengers, agents, suppliers, customers, ledgers, balances, payments, expenses, groups, queries, vouchers, profit - by calling the read-only tools; never guess numbers, always look them up. ${c.allowWrites ? 'You may ONLY add or remove records using the add_/remove_ tools; you cannot edit, approve, cancel or change anything else. Look up ids with find_records before removing. Each add/remove call is only a proposal: the administrator confirms it afterwards, so say that confirmation is needed.' : 'You are READ-ONLY: you cannot add, remove or change anything; if asked, say that changes are switched off.'} Balance meaning: for agents/customers = what they owe us; for suppliers = what we owe them. Today is ${today()}. Format money as PKR with thousands separators. Be concise and direct, use short lists when listing records. Never reveal passwords, API keys or secrets (you have no access to them).${c.instructions ? '\nExtra instructions from the administrator: ' + c.instructions : ''}`;
  const msgs = [{ role: 'system', content: system }, ...(Array.isArray(history) ? history : []).slice(-8).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content || '').slice(0, 1500) })), { role: 'user', content: q }], actions = []; let reply = '';
  const tools = toolDefs(c);
  for (let i = 0; i < 6; i++) {
    const j = await groqCall(c, { model: c.model, temperature: c.temperature, max_tokens: 1200, messages: msgs, tools, tool_choice: 'auto' });
    const m = (j.choices && j.choices[0] && j.choices[0].message) || {}; if (m.content) reply = m.content.trim();
    const calls = m.tool_calls || []; if (!calls.length) break;
    msgs.push({ role: 'assistant', content: m.content || null, tool_calls: calls });
    for (const t of calls) {
      let args = {}; try { args = JSON.parse(t.function.arguments || '{}'); } catch { /* empty */ }
      const name = t.function.name; let out;
      if (READ_TOOLS[name]) { try { out = JSON.stringify(READ_TOOLS[name].run(args)).slice(0, 7000); } catch (e) { out = JSON.stringify({ error: e.message }); } }
      else if (AI_TOOLS[name] && c.allowWrites) { if (actions.length >= c.maxActions) out = 'Limit reached: too many changes in one request.'; else { actions.push({ op: name, args, label: AI_TOOLS[name].label(args) }); out = 'Queued - awaiting administrator confirmation.'; } }
      else out = 'Unknown or disabled tool';
      msgs.push({ role: 'tool', tool_call_id: t.id, content: out });
    }
    if (j.choices[0].finish_reason !== 'tool_calls') break;
  }
  return { reply: reply || (actions.length ? 'Please confirm the changes below.' : 'Nothing to do.'), actions, ai: true, model: c.model };
}
function aiRun(actions) {
  const res = [], c = groqCfg();
  (actions || []).slice(0, c.maxActions).forEach(a => {
    const t = AI_TOOLS[a.op];
    if (!t || !c.allowWrites) return res.push({ ok: false, m: 'Not permitted: ' + a.op });
    try { t.run(a.args || {}); res.push({ ok: true, m: t.label(a.args || {}) }); } catch (e) { res.push({ ok: false, m: t.label(a.args || {}) + ' - ' + e.message }); }
  });
  logAct(ADMIN(), 'AI assistant', res.filter(r => r.ok).length + ' change(s) confirmed'); return res;
}
/** lists the models the key can use (also proves the key works) */
async function groqTest(key) {
  const k = key || groqKey(); if (!k) throw new Error('Enter a Groq API key first');
  const r = await fetchJson(GROQ_URL + '/models', { headers: { authorization: 'Bearer ' + k } }, 15000);
  if (!r.ok) throw new Error(r.status === 401 ? 'Groq rejected this API key' : 'Groq error: ' + String((r.j.error && r.j.error.message) || r.status).slice(0, 160));
  const ids = (r.j.data || []).map(m => m.id).filter(id => !/whisper|guard|tts|playai|distil-whisper/i.test(id)).sort();
  return { ok: true, models: ids };
}

module.exports = { serp, serpKey, pfConfigured, payfastStart, payfastResult, payfastTest, base, wa, waStart, waStop, waAutoStart, aiAsk, aiRun, aiReady, groqCfg, groqTest, GROQ_MODELS };
