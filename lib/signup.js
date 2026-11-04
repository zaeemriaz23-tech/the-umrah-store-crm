'use strict';
/**
 * B2B partner signup + admin approval.
 *  - Public: submit an application (owner, company, KYC documents, password), check status.
 *  - Admin / staff with "agents.create": review documents, approve (creates the agent account + login) or reject with a reason.
 * Nothing can sign in until approved. Passwords are hashed at submit time; documents live on the persistent disk
 * under DATA/kyc/<reference>/ and are only served to signed-in reviewers.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const D = require('./db');
const { db, DATA, hash, save, nid, today, str, num, logAct } = D;
const PM = require('./perms');
const { isAdmin } = require('./ops');

db.signups = db.signups || [];
const KYC = path.join(DATA, 'kyc'); fs.mkdirSync(KYC, { recursive: true });

const DOCS = { cnicFront: { label: 'CNIC front', req: true, img: true }, cnicBack: { label: 'CNIC back', req: true, img: true }, photo: { label: 'Your photo', req: true, img: true }, card: { label: 'Visiting card', req: false }, licence: { label: 'Business licence / NTN', req: false } };
const MAXF = 2.5 * 1024 * 1024;
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
function sniff(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (b.length > 12 && b.slice(0, 5).toString() === '%PDF-') return 'pdf';
  return null;
}
const err = (m, status = 400) => Object.assign(new Error(m), { status });
const minPw = () => Math.max(6, +db.settings.security.minPassword || 8);
const normEmail = v => str(v, 120).toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const digits = v => String(v || '').replace(/\D/g, '');
const cnicFmt = v => { const d = digits(v); return d.length === 13 ? d.slice(0, 5) + '-' + d.slice(5, 12) + '-' + d.slice(12) : ''; };

function emailTaken(email, exceptId) {
  if (db.users.some(u => u.login === email)) return 'This email already has an account. Please sign in.';
  if (db.parties.some(p => p.kind === 'agent' && String(p.email || '').toLowerCase() === email && p.active !== false)) return 'This email is already registered with us. Please sign in or contact the office.';
  const s = db.signups.find(x => x.email === email && x.id !== exceptId && (x.status === 'Pending' || x.status === 'Approved'));
  if (s) return s.status === 'Pending' ? 'An application with this email is already waiting for review.' : 'This email is already approved. Please sign in.';
  return '';
}

const refNo = () => { const A = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; for (;;) { const r = 'AP-' + Array.from(crypto.randomBytes(6), x => A[x % A.length]).join(''); if (!db.signups.some(s => s.ref === r)) return r; } };

function submit(b) {
  b = b || {};
  const first = str(b.first, 50), last = str(b.last, 50), email = normEmail(b.email), phone = str(b.phone, 24).replace(/[^\d+]/g, '');
  const company = str(b.company, 100), city = str(b.city, 60), address = str(b.address, 200), cnic = cnicFmt(b.cnic), type = str(b.type, 40);
  if (!first || !last) throw err('Enter your first and last name.');
  if (!EMAIL.test(email)) throw err('Enter a valid email address.');
  if (digits(phone).length < 10) throw err('Enter a valid phone number with country code.');
  if (!company) throw err('Enter your company name.');
  if (!city) throw err('Enter your city.');
  if (!address) throw err('Enter your office address.');
  if (!cnic) throw err('Enter your 13-digit CNIC number.');
  const pw = String(b.password || ''); if (pw.length < minPw()) throw err('Password must be at least ' + minPw() + ' characters.');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw err('Password must contain letters and numbers.');
  if (!b.terms) throw err('Please accept the terms to continue.');
  const taken = emailTaken(email); if (taken) throw err(taken, 409);
  if (db.signups.some(s => s.cnic === cnic && (s.status === 'Pending' || s.status === 'Approved'))) throw err('An application with this CNIC already exists.', 409);

  const files = {}; let total = 0;
  for (const [k, def] of Object.entries(DOCS)) {
    const v = b.docs && b.docs[k];
    if (!v) { if (def.req) throw err(def.label + ' is required.'); continue; }
    const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(String(v)); if (!m) throw err(def.label + ' could not be read. Please upload it again.');
    const buf = Buffer.from(m[2], 'base64'), ext = sniff(buf);
    if (!ext || (def.img && ext === 'pdf')) throw err(def.label + ' must be a ' + (def.img ? 'JPG, PNG or WebP image.' : 'JPG, PNG, WebP or PDF file.'));
    if (buf.length > MAXF) throw err(def.label + ' is too large (max 2.5 MB).');
    total += buf.length; files[k] = { buf, ext };
  }
  if (total > 9 * 1024 * 1024) throw err('Documents are too large in total. Use smaller photos.');

  const ref = refNo(), dir = path.join(KYC, ref); fs.mkdirSync(dir, { recursive: true });
  const docs = {};
  for (const [k, f] of Object.entries(files)) { fs.writeFileSync(path.join(dir, k + '.' + f.ext), f.buf); docs[k] = { ext: f.ext, size: f.buf.length }; }
  const a = { id: 'a' + nid(), ref, status: 'Pending', createdAt: new Date().toISOString(), first, last, email, phone, cnic, company, type, city, address, website: str(b.website, 120), licenceNo: str(b.licenceNo, 60), iata: str(b.iata, 30), years: str(b.years, 20), volume: str(b.volume, 30), docs, pw: hash(pw) };
  db.signups.push(a); logAct(null, 'Partner application', company + ' (' + ref + ')');
  return { ref };
}

const pub = (a, full) => { const { pw, ...r } = a; return full ? r : { id: r.id, ref: r.ref, status: r.status, createdAt: r.createdAt, first: r.first, last: r.last, company: r.company, city: r.city, phone: r.phone, email: r.email, docs: Object.keys(r.docs || {}).length, reviewedBy: r.reviewedBy, reviewedAt: r.reviewedAt }; };
const canReview = u => !!u && (isAdmin(u) || (u.role === 'staff' && PM.can(u, 'agents.create')));
const pendingCount = () => db.signups.filter(s => s.status === 'Pending').length;

function approve(u, id, p) {
  const a = db.signups.find(x => x.id === id); if (!a) throw err('Application not found', 404);
  if (a.status === 'Approved') throw err('This application is already approved.');
  if (db.users.some(x => x.login === a.email)) throw err('A login with this email already exists.', 409);
  let name = a.company; if (db.parties.some(x => x.kind === 'agent' && x.name.toLowerCase() === name.toLowerCase())) name += ' (' + a.city + ')'; if (db.parties.some(x => x.kind === 'agent' && x.name.toLowerCase() === name.toLowerCase())) name += ' ' + a.ref;
  const t = { id: nid(), kind: 'agent', name, phone: a.phone, email: a.email, city: a.city, address: a.address, notes: 'Owner: ' + a.first + ' ' + a.last + ' | CNIC ' + a.cnic + ' | Application ' + a.ref, limit: num(p.limit), opening: 0, active: true, created: today() };
  db.parties.push(t);
  db.users.push({ id: 'u' + t.id, role: 'agent', pid: t.id, name: a.first + ' ' + a.last, login: a.email, pw: a.pw, active: true });
  Object.assign(a, { status: 'Approved', reviewedBy: u.name, reviewedAt: new Date().toISOString(), partyId: t.id, note: str(p.note, 300), reason: '' });
  PM.audit(u, 'partner.approved', a.ref, { company: a.company, limit: t.limit }); logAct(u, 'Partner approved', a.company);
  return { partyId: t.id };
}
function reject(u, id, p) {
  const a = db.signups.find(x => x.id === id); if (!a) throw err('Application not found', 404);
  if (a.status === 'Approved') throw err('This application is already approved. Deactivate the agent account instead.');
  const reason = str(p.reason, 300); if (!reason) throw err('Write a short reason so the applicant knows what to fix.');
  Object.assign(a, { status: 'Rejected', reason, reviewedBy: u.name, reviewedAt: new Date().toISOString() });
  PM.audit(u, 'partner.rejected', a.ref, { company: a.company }); logAct(u, 'Partner rejected', a.company);
}

function mount(app, { auth, limit }) {
  const need = (req, res, next) => (canReview(req.u) ? next() : res.status(req.u ? 403 : 401).json({ error: req.u ? 'You do not have permission to review applications' : 'Login required' }));
  const wrap = f => (req, res) => { try { const out = f(req) || {}; save(); res.json({ ok: true, ...out }); } catch (e) { res.status(e.status || 400).json({ error: e.message }); } };

  app.get('/api/public/signup/check', (req, res) => {
    if (!limit('sgc:' + req.ip, 40, 36e5)) return res.status(429).json({ error: 'Too many checks. Try again later.' });
    const email = normEmail(req.query.email); if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const m = emailTaken(email); res.status(m ? 409 : 200).json(m ? { error: m } : { ok: true });
  });
  app.post('/api/public/signup', (req, res) => {
    if (!limit('sg:' + req.ip, 5, 36e5)) return res.status(429).json({ error: 'Too many applications from this connection. Please try again later.' });
    if (req.body && req.body.website_url) return res.json({ ok: true, ref: 'AP-OK' }); // honeypot
    try { const r = submit(req.body); save(); res.json({ ok: true, ...r }); } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });
  app.post('/api/public/signup/status', (req, res) => {
    if (!limit('sgs:' + req.ip, 20, 36e5)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    const ref = str(req.body.ref, 20).toUpperCase(), email = normEmail(req.body.email), a = db.signups.find(x => x.ref === ref && x.email === email);
    if (!a) return res.status(404).json({ error: 'No application matches that reference and email.' });
    res.json({ ref: a.ref, status: a.status, company: a.company, submitted: a.createdAt, reason: a.status === 'Rejected' ? a.reason : '', reviewed: a.reviewedAt || '' });
  });

  app.get('/api/admin/signups', auth, need, (req, res) => res.json({ items: db.signups.slice().reverse().map(a => pub(a)), pending: pendingCount() }));
  app.get('/api/admin/signups/:id', auth, need, (req, res) => { const a = db.signups.find(x => x.id === req.params.id); if (!a) return res.status(404).json({ error: 'Not found' }); res.json(pub(a, true)); });
  app.get('/api/admin/signups/:id/doc/:kind', auth, need, (req, res) => {
    const a = db.signups.find(x => x.id === req.params.id), k = req.params.kind, d = a && a.docs && a.docs[k];
    if (!d || !DOCS[k]) return res.sendStatus(404);
    const f = path.join(KYC, a.ref, k + '.' + d.ext); if (!fs.existsSync(f)) return res.sendStatus(404);
    res.set({ 'Content-Type': MIME[d.ext], 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="' + a.ref + '-' + k + '.' + d.ext + '"', 'X-Content-Type-Options': 'nosniff' }).sendFile(f);
  });
  app.post('/api/admin/signups/:id/approve', auth, need, wrap(req => approve(req.u, req.params.id, req.body || {})));
  app.post('/api/admin/signups/:id/reject', auth, need, wrap(req => reject(req.u, req.params.id, req.body || {})));
}

/** Used by /api/login so an applicant who is not approved yet gets a clear message instead of "wrong password". */
function loginHint(login, password) {
  const a = db.signups.find(x => x.email === String(login || '').toLowerCase().trim() && x.status !== 'Approved');
  if (!a || !D.check(String(password || ''), a.pw)) return null;
  return a.status === 'Pending' ? 'Your application (' + a.ref + ') is still being reviewed. You can sign in as soon as it is approved.' : 'Your application (' + a.ref + ') was not approved: ' + (a.reason || 'please contact the office') + '. You can apply again with corrected details.';
}
module.exports = { mount, loginHint, pendingCount, canReview, DOCS };
