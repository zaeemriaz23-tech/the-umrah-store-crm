'use strict';
/**
 * Live chat between website visitors and the team.
 * - Conversations and every message are stored in the database (history survives restarts).
 * - Real time: Server-Sent Events for visitors and for staff; the clients fall back to polling if a proxy buffers streams.
 * - Visitors only ever hold their own conversation (id + secret token). Staff need chat.view / chat.manage.
 */
const crypto = require('crypto');
const D = require('./db');
const { db, nid, str, save } = D;
const PM = require('./perms');
const X = require('./extras');
const Mail = require('./mailer');

db.chats = db.chats || [];
const staffStreams = new Set(), visitorStreams = new Map(); // res objects
const MAX_MSG = 1000, MAX_PER_CHAT = 600;
const iso = () => new Date().toISOString();
const tok = () => crypto.randomBytes(18).toString('base64url');
const safeEq = (a, b) => { try { return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; } };
const clean = (v, n) => str(v, n).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const online = () => staffStreams.size;
const find = id => db.chats.find(c => c.id === String(id));
const msgOut = m => ({ id: m.id, t: m.t, from: m.from, by: m.by, text: m.text });
const summary = c => { const last = c.messages[c.messages.length - 1] || {}; return { id: c.id, name: c.name, email: c.email, phone: c.phone, page: c.page, status: c.status, createdAt: c.createdAt, updatedAt: c.updatedAt, unread: c.unreadStaff, count: c.messages.length, assignedTo: c.assignedTo || '', assignedName: c.assignedName || '', last: { text: str(last.text, 90), from: last.from, t: last.t } }; };
const emit = (set, ev, data) => { const line = 'event: ' + ev + '\ndata: ' + JSON.stringify(data) + '\n\n'; set.forEach(r => { try { r.write(line); } catch { set.delete(r); } }); };
const toVisitor = (c, ev, data) => { const s = visitorStreams.get(c.id); if (s) emit(s, ev, data); };
const toStaff = (ev, data) => emit(staffStreams, ev, data);
const unreadTotal = () => db.chats.reduce((a, c) => a + (c.status === 'open' ? c.unreadStaff : 0), 0);

function add(c, from, by, text) {
  const m = { id: c.messages.length ? c.messages[c.messages.length - 1].id + 1 : 1, t: iso(), from, by: by || '', text };
  c.messages.push(m); if (c.messages.length > MAX_PER_CHAT) c.messages.splice(0, c.messages.length - MAX_PER_CHAT);
  c.updatedAt = m.t; return m;
}
function start(p, ip, ua) {
  const name = clean(p.name, 60), text = clean(p.message, MAX_MSG);
  if (name.length < 2) throw Object.assign(new Error('Please enter your name.'), { status: 400 });
  if (!text) throw Object.assign(new Error('Please type your message.'), { status: 400 });
  const email = clean(p.email, 120), phone = clean(p.phone, 30).replace(/[^\d+ ()-]/g, '');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw Object.assign(new Error('That email address does not look right.'), { status: 400 });
  const c = { id: 'c' + nid(), token: tok(), name, email, phone, page: clean(p.page, 200), ua: clean(ua, 160), ip: String(ip || '').slice(0, 45), status: 'open', createdAt: iso(), updatedAt: iso(), unreadStaff: 0, unreadVisitor: 0, messages: [] };
  db.chats.push(c); const m = add(c, 'visitor', name, text); c.unreadStaff = 1;
  const sys = add(c, 'system', 'Team', online() ? 'Thanks ' + name.split(' ')[0] + '. A team member will reply here in a moment.' : 'Thanks ' + name.split(' ')[0] + '. Our team is offline right now. Leave your number or email and we will get back to you soon.');
  announce(c, m, true); save(); return { id: c.id, token: c.token, messages: [m, sys].map(msgOut), online: online() > 0 };
}
function announce(c, m, isNew) {
  const s = summary(c);
  toStaff('message', { chat: s, message: msgOut(m), unreadTotal: unreadTotal() });
  if (isNew || c.unreadStaff === 1) X.push({ role: 'staff' }, isNew ? 'New live chat' : 'New chat message', c.name + ': ' + str(m.text, 120), '#/chat/' + c.id, 'chat', 'chat.view');
  if (isNew || (!online() && Date.now() - (c.lastMail || 0) > 6e5)) { c.lastMail = Date.now(); Mail.send('chat.new', { subject: (isNew ? 'New live chat from ' : 'New chat message from ') + c.name, text: c.name + (c.phone ? ' · ' + c.phone : '') + (c.email ? ' · ' + c.email : '') + (c.page ? '\nPage: ' + c.page : '') + '\n\n' + m.text, link: '#/chat/' + c.id }); }
}
function visitorSend(c, text) {
  text = clean(text, MAX_MSG); if (!text) throw Object.assign(new Error('Type a message first.'), { status: 400 });
  if (c.status === 'closed') throw Object.assign(new Error('This chat was closed. Start a new one.'), { status: 409 });
  const m = add(c, 'visitor', c.name, text); c.unreadStaff++; announce(c, m, false); save(); return msgOut(m);
}
function staffReply(u, c, text) {
  text = clean(text, 2000); if (!text) throw Object.assign(new Error('Type a reply first.'), { status: 400 });
  const m = add(c, 'staff', u.name, text); c.unreadStaff = 0; c.unreadVisitor++; if (c.status === 'closed') c.status = 'open';
  if (!c.assignedTo) { c.assignedTo = u.id; c.assignedName = u.name; }
  toVisitor(c, 'message', { message: msgOut(m) }); toStaff('message', { chat: summary(c), message: msgOut(m), unreadTotal: unreadTotal() }); save(); return msgOut(m);
}
function sweep() { const cut = Date.now() - 365 * 864e5, n = db.chats.length; db.chats = db.chats.filter(c => Date.parse(c.updatedAt) > cut); return n - db.chats.length; }

function sse(req, res, set, hello) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.statusCode = 200; res.write('retry: 4000\n\n'); set.add(res); if (hello) res.write('event: hello\ndata: ' + JSON.stringify(hello) + '\n\n');
  const beat = setInterval(() => { try { res.write(': ping\n\n'); } catch { clearInterval(beat); set.delete(res); } }, 20000);
  req.on('close', () => { clearInterval(beat); set.delete(res); if (set === staffStreams) toStaff('presence', { online: online() }); });
}

function mount(app, { auth, limit }) {
  const canView = (req, res, next) => (req.u && PM.can(req.u, 'chat.view') ? next() : res.status(req.u ? 403 : 401).json({ error: req.u ? 'You do not have permission to use live chat' : 'Login required' }));
  const canManage = (req, res, next) => (req.u && PM.can(req.u, 'chat.manage') ? next() : res.status(req.u ? 403 : 401).json({ error: 'You do not have permission to manage chats' }));
  const mine = (req, res) => { const c = find(req.params.id), t = String(req.query.token || (req.body && req.body.token) || ''); if (!c || !safeEq(c.token, t)) { res.status(404).json({ error: 'Chat not found' }); return null; } return c; };
  const wrap = f => (req, res) => { try { res.json(f(req, res) || { ok: true }); } catch (e) { res.status(e.status || 400).json({ error: e.message }); } };

  /* ---- visitors (no login) ---- */
  app.get('/api/chat/status', (req, res) => res.set('Cache-Control', 'no-store').json({ online: online() > 0 }));
  app.post('/api/chat/start', (req, res) => { if (!limit('chs:' + req.ip, 6, 36e5)) return res.status(429).json({ error: 'Too many chats started. Please call or WhatsApp us.' }); try { res.json(start(req.body || {}, req.ip, req.get('user-agent'))); } catch (e) { res.status(e.status || 400).json({ error: e.message }); } });
  app.get('/api/chat/:id/messages', (req, res) => { const c = mine(req, res); if (!c) return; const after = +req.query.after || 0; c.unreadVisitor = 0; res.set('Cache-Control', 'no-store').json({ status: c.status, online: online() > 0, messages: c.messages.filter(m => m.id > after).map(msgOut) }); });
  app.post('/api/chat/:id/send', (req, res) => { const c = mine(req, res); if (!c) return; if (!limit('chm:' + c.id, 20, 6e4)) return res.status(429).json({ error: 'You are sending messages too fast.' }); try { res.json({ message: visitorSend(c, req.body.text) }); } catch (e) { res.status(e.status || 400).json({ error: e.message }); } });
  app.get('/api/chat/:id/stream', (req, res) => { const c = mine(req, res); if (!c) return; if (!visitorStreams.has(c.id)) visitorStreams.set(c.id, new Set()); const s = visitorStreams.get(c.id); sse(req, res, s, { online: online() > 0 }); req.on('close', () => { if (!s.size) visitorStreams.delete(c.id); }); });

  /* ---- staff ---- */
  app.get('/api/chat-admin/stream', auth, canView, (req, res) => { sse(req, res, staffStreams, { online: online() + 1, unreadTotal: unreadTotal() }); toStaff('presence', { online: online() }); });
  app.get('/api/chat-admin/list', auth, canView, (req, res) => { const q = String(req.query.q || '').toLowerCase().trim(), st = req.query.status; res.set('Cache-Control', 'no-store').json({ unreadTotal: unreadTotal(), online: online(), items: db.chats.filter(c => (!st || c.status === st) && (!q || (c.name + ' ' + c.email + ' ' + c.phone + ' ' + c.messages.map(m => m.text).join(' ')).toLowerCase().includes(q))).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 200).map(summary) }); });
  app.get('/api/chat-admin/:id', auth, canView, (req, res) => { const c = find(req.params.id); if (!c) return res.status(404).json({ error: 'Chat not found' }); res.set('Cache-Control', 'no-store').json({ ...summary(c), ua: c.ua, messages: c.messages.map(msgOut) }); });
  app.post('/api/chat-admin/:id/reply', auth, canView, (req, res) => { const c = find(req.params.id); if (!c) return res.status(404).json({ error: 'Chat not found' }); try { res.json({ message: staffReply(req.u, c, req.body.text) }); } catch (e) { res.status(e.status || 400).json({ error: e.message }); } });
  app.post('/api/chat-admin/:id/read', auth, canView, wrap(req => { const c = find(req.params.id); if (!c) throw Object.assign(new Error('Chat not found'), { status: 404 }); c.unreadStaff = 0; save(); toStaff('read', { id: c.id, unreadTotal: unreadTotal() }); }));
  app.post('/api/chat-admin/:id/close', auth, canView, wrap(req => { const c = find(req.params.id); if (!c) throw Object.assign(new Error('Chat not found'), { status: 404 }); c.status = 'closed'; add(c, 'system', 'Team', 'This chat was closed by ' + req.u.name + '. Start a new chat any time.'); toVisitor(c, 'closed', {}); toStaff('read', { id: c.id, unreadTotal: unreadTotal(), closed: true }); save(); }));
  app.post('/api/chat-admin/:id/reopen', auth, canView, wrap(req => { const c = find(req.params.id); if (!c) throw Object.assign(new Error('Chat not found'), { status: 404 }); c.status = 'open'; save(); }));
  app.post('/api/chat-admin/:id/assign', auth, canManage, wrap(req => { const c = find(req.params.id); if (!c) throw Object.assign(new Error('Chat not found'), { status: 404 }); c.assignedTo = req.u.id; c.assignedName = req.u.name; save(); }));
  app.delete('/api/chat-admin/:id', auth, canManage, wrap(req => { const c = find(req.params.id); if (!c) throw Object.assign(new Error('Chat not found'), { status: 404 }); db.chats = db.chats.filter(x => x !== c); D.logAct(req.u, 'Chat deleted', c.name); save(); toStaff('read', { id: c.id, unreadTotal: unreadTotal(), closed: true }); }));
}
module.exports = { mount, sweep, online, unreadTotal, start, find };
