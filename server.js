'use strict';
/**
 * The Umrah Store CRM v3 - B2B / B2C travel operations platform
 * Express + JSON store. Roles: admin, staff, agent, supplier.
 */
const express = require('express');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const D = require('./lib/db');
const { db, DATA, check, save, today, str } = D;
const L = require('./lib/ledger');
const { OPS, sweep, isAdmin, isStaff } = require('./lib/ops');
const I = require('./lib/integrations');
const R = require('./lib/render');
const { snapshot } = require('./lib/state');
const SEO = require('./lib/seo');
const Inv = require('./lib/inventory');
const PM = require('./lib/perms');
const X = require('./lib/extras');
const SU = require('./lib/signup');

const PORT = process.env.PORT || 3000;
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});

/* ---------- auth ---------- */
const cookie = (req, k) => (req.headers.cookie || '').split(';').map(s => s.trim().split('=')).find(x => x[0] === k)?.[1];
app.use((req, res, next) => {
  const s = db.sessions[cookie(req, 'sid')];
  if (s && s.exp > Date.now()) { const u = db.users.find(x => x.id === s.uid); if (u && u.active !== false && !u.suspended) req.u = u; }
  next();
});
const auth = (req, res, next) => (req.u ? next() : res.status(401).json({ error: 'Login required' }));
const perm = (...ks) => (req, res, next) => (req.u && PM.canAny(req.u, ks) ? next() : res.status(req.u ? 403 : 401).json({ error: req.u ? 'You do not have permission to do this' : 'Login required' }));
const adminOnly = (req, res, next) => (req.u && isAdmin(req.u) ? next() : res.status(403).json({ error: 'Administrator only' }));
const bucket = new Map();
const limit = (key, max, ms) => { const t = (bucket.get(key) || []).filter(x => Date.now() - x < ms); if (t.length >= max) return false; t.push(Date.now()); bucket.set(key, t); return true; };
setInterval(() => { for (const [k, v] of bucket) if (!v.some(x => Date.now() - x < 36e5)) bucket.delete(k); }, 6e5).unref();

app.use((req, res, next) => { if (req.method === 'GET' && !req.path.startsWith('/api/')) R.rememberHost(SEO.baseUrl(req)); next(); });
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.post('/api/login', (req, res) => {
  if (!limit('login:' + req.ip, Math.max(3, +db.settings.security.loginMax || 10), 9e5)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const u = db.users.find(x => x.login === String(req.body.login || '').toLowerCase().trim());
  if (!u || u.active === false || u.suspended || !check(String(req.body.password || ''), u.pw)) { const h = !u && SU.loginHint(req.body.login, req.body.password); return res.status(h ? 403 : 401).json({ error: h || 'Incorrect username or password', pendingApproval: !!h }); }
  const sid = crypto.randomBytes(24).toString('hex');
  const sd = Math.max(1, +db.settings.security.sessionDays || 7); db.sessions[sid] = { uid: u.id, exp: Date.now() + 864e5 * sd };
  u.lastLogin = new Date().toISOString(); D.logAct(u, 'login', ''); save();
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 864e5 * sd });
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { delete db.sessions[cookie(req, 'sid')]; save(); res.clearCookie('sid'); res.json({ ok: true }); });

/* ---------- data ---------- */
app.get('/api/rev', auth, (req, res) => res.json({ rev: db.rev }));
app.get('/api/state', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(snapshot(req.u)); });

app.get('/api/ledger/:pid', auth, (req, res) => {
  const pid = +req.params.pid, p = db.parties.find(x => x.id === pid);
  if (!p) return res.status(404).json({ error: 'Account not found' });
  if (!isStaff(req.u) && req.u.pid !== pid) return res.sendStatus(403);
  if (isStaff(req.u) && !PM.can(req.u, p.kind === 'supplier' ? 'ledgers.supplier.view' : 'ledgers.agent.view')) return res.status(403).json({ error: 'You do not have permission to view this ledger' });
  res.json({ party: { id: p.id, kind: p.kind, name: p.name, phone: p.phone, city: p.city, limit: p.limit }, rows: L.ledger(pid), wallet: p.kind === 'agent' ? L.wallet(pid) : null });
});

const AUDITED = { setStatus: 'booking.status', delBooking: 'booking.deleted', saveBooking: 'booking.saved', addPayment: 'payment.recorded', approvePayment: 'payment.approved', rejectPayment: 'payment.rejected', delPayment: 'payment.deleted', createPaylink: 'paylink.created',
  addEntry: 'ledger.entry_posted', delEntry: 'ledger.entry_deleted', delExpense: 'expense.deleted', addExpense: 'expense.added', saveParty: 'party.saved', delParty: 'party.deleted', importData: 'data.imported', saveUser: 'staff.legacy_user_saved', delUser: 'staff.legacy_user_deleted', delVoucher: 'voucher.deleted', delQuery: 'query.deleted', setLogo: 'branding.logo_changed', resetLogo: 'branding.logo_reset' };
app.post('/api/rpc', auth, (req, res) => {
  try {
    const op = String(req.body.op || ''), f = OPS[op]; if (!f || op.startsWith('_') || !Object.prototype.hasOwnProperty.call(OPS, op)) throw new Error('Unknown operation');
    PM.gate(req.u, op, req.body);
    const out = f(req.u, req.body) || {};
    if (AUDITED[op] && isStaff(req.u)) PM.audit(req.u, AUDITED[op], String(req.body.id || req.body.partyId || req.body.login || out.no || out.id || ''), { op, status: req.body.status, amt: req.body.amt, kind: req.body.kind });
    save(); res.json({ ok: true, ...out });
  } catch (e) { res.status(e.status || 400).json({ error: e.message, limit: e.limit, seats: e.seats, dup: e.dup, dupNo: e.dupNo }); }
});
app.get('/api/audit', auth, perm('audit.view'), (req, res) => {
  const q = req.query, from = q.from || '', to = q.to ? q.to + 'T23:59:59.999Z' : '', act = String(q.action || '').toLowerCase(), who = String(q.user || '').toLowerCase(), text = String(q.q || '').toLowerCase();
  let rows = db.audit.filter(r => (!from || r.t >= from) && (!to || r.t <= to) && (!act || r.a.toLowerCase().includes(act)) && (!who || (r.u + ' ' + r.uid).toLowerCase().includes(who)) && (!text || (r.r + ' ' + JSON.stringify(r.m)).toLowerCase().includes(text)));
  const total = rows.length, off = Math.max(0, +q.offset || 0);
  res.json({ total, rows: rows.slice().reverse().slice(off, off + 100), actions: [...new Set(db.audit.map(r => r.a))].sort() });
});

SU.mount(app, { auth, limit });
app.get('/api/portal/me', (req, res) => {
  const c = db.settings.company || {}, u = req.u;
  res.set('Cache-Control', 'no-store').json({ user: u ? { name: u.name, role: u.role, pid: u.pid || null } : null, company: { name: c.name, tagline: c.tagline, phone: c.phone, whatsapp: c.whatsapp, email: c.email, address: c.address }, logoV: db.settings.logoV || 0, search: !!I.serpKey(), pending: u && SU.canReview(u) ? SU.pendingCount() : 0 });
});

/* ---------- live currency rates (SerpApi Google Finance, cached 6h) ---------- */
app.get('/api/fx', auth, async (req, res) => { try { await X.fxRefresh(false); } catch { /* snapshot carries the error */ } res.set('Cache-Control', 'no-store').json(X.fxSnapshot()); });
app.post('/api/fx/refresh', auth, async (req, res) => {
  if (!limit('fx:' + req.u.id, 4, 36e5)) return res.status(429).json({ error: 'Rates were refreshed a few times already. Try again in an hour.' });
  await X.fxRefresh(true).catch(() => {}); res.json(X.fxSnapshot());
});

/* ---------- branding, files ---------- */
const FILE_OK = f => fs.existsSync(f) && fs.statSync(f).isFile();
const PUB = path.join(__dirname, 'public');
/* Logo: a custom upload wins; otherwise the optimised set (WebP for modern browsers, PNG fallback). ?s=lg serves the 2x asset. */
app.get('/brand/logo', (req, res) => {
  const f = fs.readdirSync(path.join(DATA, 'brand')).find(x => x.startsWith('logo.'));
  res.set({ 'Cache-Control': 'public, max-age=86400', Vary: 'Accept' });
  if (f) return res.sendFile(path.join(DATA, 'brand', f));
  const webp = /image\/webp/.test(req.headers.accept || '');
  res.sendFile(path.join(PUB, 'brand', webp ? (req.query.s === 'lg' ? 'logo-640.webp' : 'logo-320.webp') : 'logo-320.png'));
});
/* Airline logos: fetched once from a public logo CDN, cached on the persistent disk, then served locally. Unknown codes -> 404 and the UI shows a coloured code badge. */
const AIRDIR = path.join(DATA, 'brand', 'airlines'); fs.mkdirSync(AIRDIR, { recursive: true });
const airPending = new Map(), airMiss = new Map();
async function airlineLogo(code) {
  const f = path.join(AIRDIR, code + '.png'); if (FILE_OK(f)) return f;
  if ((airMiss.get(code) || 0) > Date.now()) return null;
  if (!airPending.has(code)) airPending.set(code, (async () => {
    try {
      for (const u of ['https://pics.avs.io/200/200/' + code + '.png', 'https://images.kiwi.com/airlines/128x128/' + code + '.png']) {
        try {
          const r = await fetch(u, { signal: AbortSignal.timeout(6000) }); if (!r.ok || !/image\//.test(r.headers.get('content-type') || '')) continue;
          const b = Buffer.from(await r.arrayBuffer()); if (b.length < 200 || b.length > 300000) continue;
          fs.writeFileSync(f, b); return f;
        } catch { /* try next source */ }
      }
      airMiss.set(code, Date.now() + 36e5); return null;
    } finally { airPending.delete(code); }
  })());
  return airPending.get(code);
}
app.get('/brand/airline/:code.png', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase(); if (!/^[A-Z0-9]{2}$/.test(code)) return res.sendStatus(404);
  const f = await airlineLogo(code); if (!f) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=2592000, immutable').sendFile(f);
});
const payView = (req, res, next) => (!isStaff(req.u) || PM.can(req.u, 'payments.view') ? next() : res.sendStatus(403));
app.get('/receipts/:f', auth, payView, (req, res) => {
  const f = path.basename(req.params.f), pay = db.payments.find(p => p.id === f.replace(/\.[^.]+$/, ''));
  if (!pay || (!isStaff(req.u) && pay.partyId != req.u.pid)) return res.sendStatus(404);
  res.sendFile(path.join(DATA, 'receipts', f));
});
app.get('/receipt/:id', auth, payView, async (req, res) => {
  const p = db.payments.find(x => x.id === req.params.id);
  if (!p || (!isStaff(req.u) && p.partyId != req.u.pid)) return res.status(404).send('Not found');
  res.send(await R.receiptHtml(p, req));
});
app.get('/api/backup', auth, perm('data.backup'), (req, res) => {
  PM.audit(req.u, 'export.backup', 'full database', {}); save();
  res.set({ 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="umrah-store-backup-' + today() + '.json"' });
  res.send(JSON.stringify({ ...db, sessions: {} }));
});

app.get('/api/qr', auth, async (req, res) => { res.type('image/svg+xml').send(await QRCode.toString(String(req.query.text || '').slice(0, 400) || ' ', { type: 'svg', margin: 1 })); });

/* ---------- vouchers (public, unguessable link) ---------- */
app.get('/v/:token', async (req, res) => {
  const v = db.vouchers.find(x => x.token === req.params.token);
  const h = v && await R.voucherHtml(v, req);
  if (!h) return res.status(404).send(R.infoPage('Voucher not found', 'This voucher link is not valid.', false));
  res.set('Cache-Control', 'no-store').send(h);
});

/* ---------- live search (SerpApi) ---------- */
app.get('/api/airports', (req, res) => limit('apt:' + req.ip, 240, 6e4) ? res.json(require('./lib/airports').find(req.query.q)) : res.status(429).json({ error: 'Too many requests' }));
app.get('/api/search/:k', auth, async (req, res) => {
  if (req.u.role === 'supplier') return res.sendStatus(403);
  const q = req.query, k = req.params.k === 'hotels' ? 'hotels' : 'flights';
  if (!limit('search:' + req.u.id, 120, 36e5)) return res.status(429).json({ error: 'Search limit reached for this hour. Please try again shortly.' });
  if (isStaff(req.u) && !PM.can(req.u, k === 'hotels' ? 'search.hotels' : 'search.flights')) return res.status(403).json({ error: 'You do not have permission to use this search' });
  try {
    if (k === 'flights' && (!/^[A-Za-z]{3}$/.test(q.from || '') || !/^[A-Za-z]{3}$/.test(q.to || '') || !q.date)) throw new Error('Enter From, To (3-letter airport codes) and a departure date');
    if (k === 'hotels' && (!q.city || !q.cin || !q.cout)) throw new Error('Enter a destination, check-in and check-out dates');
    const r = await I.serp(k, { ...q, from: String(q.from || '').toUpperCase(), to: String(q.to || '').toUpperCase() }, req.u);
    if (req.u.role === 'agent' && r.items) r.items.forEach(i => { delete i.base; });
    res.json(r);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

/* ---------- payments: PayFast + one-link ---------- */
app.post('/api/payfast/start', auth, async (req, res) => {
  try {
    const u = req.u; if (u.role !== 'agent') throw new Error('Only agents pay online from their own account. Staff can create a payment link instead.');
    const amt = Math.round(+req.body.amt); if (!(amt >= 100)) throw new Error('Enter an amount of at least PKR 100');
    const pty = D.party(u.pid), bk = req.body.bookingId && db.bookings.find(b => b.id === req.body.bookingId && b.partyId == u.pid);
    res.json(await I.payfastStart(req, { partyId: u.pid, amt, note: str(req.body.note, 200) || (bk ? 'Booking ' + bk.no : 'Account top-up'), bookingId: bk ? bk.id : '', userName: u.name, email: pty && pty.email, phone: pty && pty.phone }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/payfast/test', auth, perm('integrations.manage'), async (req, res) => {
  if (!limit('pftest:' + req.u.id, 10, 36e5)) return res.status(429).json({ error: 'Too many tests. Try again later.' });
  try { PM.audit(req.u, 'integrations.payfast_test', 'payfast', {}); res.json(await I.payfastTest({ merchantId: str(req.body.merchantId, 60), securedKey: str(req.body.securedKey, 120), env: req.body.env === 'live' ? 'live' : 'sandbox' })); } catch (e) { res.status(400).json({ error: e.message }); }
});
const pfDone = (req, res) => {
  const q = { ...req.query, ...(req.body && typeof req.body === 'object' ? req.body : {}) };
  const p = I.payfastResult(q);
  if (req.method === 'POST' && req.path === '/payfast/ipn') return res.sendStatus(200);
  if (!p) return res.send(R.infoPage('Payment not found', 'We could not match this payment. If money was deducted, contact the office with your bank reference.', false));
  const ok = p.status === 'Approved', lk = p.linkId && db.paylinks.find(x => x.id === p.linkId), back = lk ? '/pay/' + lk.token : '/app';
  res.set('Cache-Control', 'no-store').send(R.infoPage(ok ? 'Payment received' : p.status === 'Pending' ? 'Payment under review' : 'Payment not completed', ok ? 'PKR ' + p.amt.toLocaleString('en-US') + ' has been added to your account.' : p.status === 'Pending' ? 'Your payment was received and is awaiting verification by the office.' : (p.pfMsg || 'The payment was not completed. You have not been charged.'), ok || p.status === 'Pending', back));
};
app.get('/payfast/return', pfDone);
app.post('/payfast/return', pfDone);
app.post('/payfast/ipn', pfDone);
app.get('/payfast/ipn', pfDone);

const link = (req, res) => {
  const l = db.paylinks.find(x => x.token === req.params.token);
  if (!l) { res.status(404).send(R.infoPage('Link not found', 'This payment link is not valid.', false)); return null; }
  return l;
};
app.get('/pay/:token', async (req, res) => {
  const l = link(req, res); if (!l) return;
  res.send(await R.payPageHtml(l, req, req.query.sent ? { ok: true, t: 'Receipt submitted. It will be credited once the office approves it.' } : null));
});
app.post('/pay/:token/start', async (req, res) => {
  const l = db.paylinks.find(x => x.token === req.params.token);
  if (!l || l.status !== 'Open' || !limit('pay:' + req.ip, 20, 36e5)) return res.status(400).json({ error: 'This link cannot be paid right now' });
  try { const pty = D.party(l.partyId); res.json(await I.payfastStart(req, { partyId: l.partyId, amt: l.amt, note: l.purpose, bookingId: l.bookingId, linkId: l.id, userName: pty && pty.name, email: pty && pty.email, phone: pty && pty.phone })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/pay/:token/proof', (req, res) => {
  const l = db.paylinks.find(x => x.token === req.params.token);
  if (!l || l.status !== 'Open' || !limit('proof:' + req.ip, 8, 36e5)) return res.status(400).json({ error: 'This link cannot accept a receipt right now' });
  try {
    const sys = { id: 'system', role: 'agent', pid: l.partyId, name: (D.party(l.partyId) || {}).name || 'Payment link' };
    OPS.addPayment(sys, { amt: l.amt, method: 'Bank transfer', ref: req.body.ref, note: 'Via payment link ' + l.id + ' - ' + l.purpose, bookingId: l.bookingId, file: req.body.file });
    const p = db.payments[db.payments.length - 1]; p.via = 'link'; p.linkId = l.id; save(); res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ---------- WhatsApp (admin) ---------- */
app.get('/api/wa', auth, perm('integrations.view', 'integrations.manage'), async (req, res) => {
  const w = I.wa; let qr = ''; if (w.qr) qr = await QRCode.toDataURL(w.qr, { margin: 1, width: 280 });
  res.json({ status: w.status, number: w.number, error: w.error, qr });
});
app.post('/api/wa/start', auth, perm('integrations.manage'), async (req, res) => { PM.audit(req.u, 'integrations.whatsapp_start', 'whatsapp', {}); I.waStart(); res.json({ ok: true }); });
app.post('/api/wa/stop', auth, perm('integrations.manage'), async (req, res) => { PM.audit(req.u, 'integrations.whatsapp_' + (req.body.logout ? 'unlinked' : 'paused'), 'whatsapp', {}); await I.waStop(!!req.body.logout); res.json({ ok: true }); });

/* ---------- AI assistant (add / remove only, admin confirms) ---------- */
app.post('/api/ai', auth, adminOnly, async (req, res) => {
  if (!limit('ai:' + req.u.id, 40, 6e4)) return res.status(429).json({ error: 'Slow down a little - too many requests.' });
  try { res.json(await I.aiAsk(str(req.body.q, 800), req.body.history)); } catch (e) { res.status(502).json({ error: e.message }); }
});
app.post('/api/ai/run', auth, adminOnly, (req, res) => { PM.audit(req.u, 'assistant.run', 'ai', { n: (req.body.actions || []).length }); const r = I.aiRun(req.body.actions); save(); res.json({ results: r }); });
app.post('/api/ai/test', auth, perm('integrations.manage'), async (req, res) => {
  try { const k = String(req.body.key || ''); res.json(await I.groqTest(/^\*+$/.test(k) ? '' : k)); } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ---------- bank accounts (public page + open API for the public list) ---------- */
app.get('/api/public/banks', (req, res) => res.set('Cache-Control', 'public, max-age=30').json(R.publicBanks()));
app.get('/bank-accounts', async (req, res) => res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' }).send(await R.bankPageHtml(req)));

/* ---------- SEO + public pages (no login) ---------- */
const html = (res, h, ttl = 300) => res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=' + ttl }).send(h);
app.get(SEO.PAGES.groups.path, (req, res) => html(res, SEO.groupsPage(req)));
app.get(SEO.PAGES.calc.path, (req, res) => html(res, SEO.calcPage(req)));
app.get(SEO.PAGES.transport.path, (req, res) => html(res, SEO.transportPage(req)));
app.get(SEO.PAGES.flights.path, (req, res) => html(res, SEO.flightsPage(req)));
app.get(SEO.PAGES.hotels.path, (req, res) => html(res, SEO.hotelsPage(req)));
app.get(SEO.PAGES.visa.path, (req, res) => html(res, SEO.visaPage(req)));
app.get(SEO.PAGES.contact.path, (req, res) => html(res, SEO.contactPage(req)));
app.get(SEO.PAGES.faq.path, (req, res) => html(res, SEO.faqPage(req)));
app.get('/sitemap.xml', (req, res) => res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(SEO.sitemap(req)));
app.get('/robots.txt', (req, res) => res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(SEO.robots(req)));
app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').set('Cache-Control', 'public, max-age=3600').json(SEO.manifest(req)));
app.get('/favicon.ico', (req, res) => res.set('Cache-Control', 'public, max-age=604800').sendFile(path.join(PUB, 'brand', 'favicon.ico')));
app.get('/api/public/inventory', (req, res) => res.set('Cache-Control', 'public, max-age=60').json(Inv.publicSnapshot()));
app.post('/api/public/lead', (req, res) => {
  if (!limit('lead:' + req.ip, 6, 36e5)) return res.status(429).json({ error: 'Too many requests. Please call us instead.' });
  if (req.body.website) return res.json({ ok: true }); // honeypot
  try { const r = Inv.publicLead(req.body || {}); save(); res.json({ ok: true, ...r }); } catch (e) { res.status(400).json({ error: e.message }); }
});
let INDEX_RAW = null, PORTAL_RAW = null;
app.get(['/', '/index.html'], (req, res) => {
  PORTAL_RAW = PORTAL_RAW || fs.readFileSync(path.join(PUB, 'portal.html'), 'utf8');
  html(res, SEO.portalHtml(req, PORTAL_RAW), 0);
});
app.get(['/app', '/app/'], (req, res) => {
  INDEX_RAW = INDEX_RAW || fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  html(res, SEO.indexHtml(req, INDEX_RAW), 0);
});

/* ---------- app shell ---------- */
app.use(express.static(PUB, { index: false, maxAge: '7d', setHeaders: (res, f) => { if (/\.(js|css|html)$/.test(f) && !/vendor/.test(f)) res.set('Cache-Control', 'no-cache'); } }));

/* friendly 404 for pages, JSON for the API */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).send(SEO.notFoundPage(req));
});
app.use((err, req, res, next) => { console.error(err); if (res.headersSent) return next(err); if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Something went wrong' }); res.status(500).send(R.infoPage('Something went wrong', 'Please try again in a moment.', false)); });

X.init(); sweep(); setInterval(() => { sweep(); const n = db.notifs.length; X.detect(); if (db.notifs.length !== n) D.save(); }, 60000).unref();
setInterval(() => X.fxRefresh(false).catch(() => {}), 36e5).unref(); setTimeout(() => X.fxRefresh(false).catch(() => {}), 5000).unref();
app.listen(PORT, () => { console.log('The Umrah Store CRM v3 running on port ' + PORT); I.waAutoStart(); });
