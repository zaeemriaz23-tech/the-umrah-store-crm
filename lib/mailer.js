'use strict';
/**
 * Email: several SMTP accounts, and a routing table that says which account sends which kind of notification.
 * Zero dependencies - a small SMTP client (SSL/TLS on 465, STARTTLS on 587, or plain for local relays; AUTH PLAIN/LOGIN).
 *
 * settings.mail = {
 *   accounts: [{ id, name, host, port, security: 'ssl'|'starttls'|'none', user, pass, fromName, fromEmail, replyTo, active, allowSelfSigned }],
 *   routes:   { '<event>': { account: '<id>' | '' (off), to: 'a@x.com, b@y.com' (staff-facing events) } },
 *   defaultAccount: '<id>'
 * }
 * Every in-app notification (lib/extras.js push) is mapped to an event and, when routed, also sent by email.
 */
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const D = require('./db');
const { db, str, nid, logAct } = D;

const EVENTS = [
  { id: 'chat.new', label: 'Live chat: new conversation / visitor message', who: 'staff', help: 'Sent to your team when a visitor starts a chat or writes while nobody is online.' },
  { id: 'lead.new', label: 'Website enquiry / lead received', who: 'staff', help: 'Enquiries sent from the public website.' },
  { id: 'signup.new', label: 'New partner (agent) application', who: 'staff', help: 'A travel agent applied for an account.' },
  { id: 'booking.new', label: 'New booking awaiting approval', who: 'staff', help: 'Agent created a booking.' },
  { id: 'booking.status', label: 'Booking approved / cancelled', who: 'party', help: 'Sent to the agent who owns the booking.' },
  { id: 'payment.new', label: 'Payment recorded / awaiting approval', who: 'staff', help: 'Agent recorded a payment.' },
  { id: 'payment.status', label: 'Payment approved / rejected', who: 'party', help: 'Sent to the paying agent.' },
  { id: 'query.new', label: 'New query (flight, hotel, visa...)', who: 'staff', help: 'Agent or website sent a query.' },
  { id: 'query.status', label: 'Query quoted / rejected', who: 'party', help: 'Sent to the agent who asked.' },
  { id: 'ticket.new', label: 'Support ticket opened / customer reply', who: 'staff', help: 'Help & support requests.' },
  { id: 'ticket.status', label: 'Support ticket answered', who: 'party', help: 'Sent to the ticket owner.' },
  { id: 'system', label: 'Other alerts (overdue tickets, SLA, etc.)', who: 'staff', help: 'Everything else.' }
];
const EVENT_IDS = EVENTS.map(e => e.id);
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
const SEC = ['ssl', 'starttls', 'none'];

const cfg = () => { const m = db.settings.mail = db.settings.mail || {}; m.accounts = Array.isArray(m.accounts) ? m.accounts : []; m.routes = m.routes && typeof m.routes === 'object' ? m.routes : {}; return m; };
db.mailLog = db.mailLog || [];
const log = (o) => { db.mailLog.push({ t: new Date().toISOString(), ...o }); if (db.mailLog.length > 300) db.mailLog.splice(0, db.mailLog.length - 300); };
const recipients = s => String(s || '').split(/[,;\s]+/).map(x => x.trim()).filter(x => EMAIL.test(x)).slice(0, 10);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------ settings ------------------------------------------------ */
function normAccount(a, prev) {
  const pass = String(a.pass == null ? '' : a.pass);
  const o = { id: str(a.id, 20) || (prev && prev.id) || 'm' + nid(), name: str(a.name, 60) || str(a.host, 60), host: str(a.host, 120).toLowerCase(), port: Math.min(65535, Math.max(1, parseInt(a.port, 10) || 587)),
    security: SEC.includes(a.security) ? a.security : 'starttls', user: str(a.user, 160), pass: /^\*+$/.test(pass) && prev ? prev.pass : pass.slice(0, 200), fromName: str(a.fromName, 80), fromEmail: str(a.fromEmail, 160).toLowerCase() || str(a.user, 160).toLowerCase(), replyTo: str(a.replyTo, 160).toLowerCase(), active: a.active !== false, allowSelfSigned: !!a.allowSelfSigned };
  if (!o.host) throw new Error('SMTP host is required for ' + (o.name || 'the account'));
  if (!EMAIL.test(o.fromEmail)) throw new Error('"From" must be a valid email address (' + (o.name || o.host) + ')');
  if (o.replyTo && !EMAIL.test(o.replyTo)) throw new Error('Reply-to must be a valid email address');
  return o;
}
/** replaces the whole email configuration (called by saveSettings) */
function save(p) {
  const m = cfg(), old = new Map(m.accounts.map(a => [a.id, a])), seen = new Set(), accounts = [];
  (Array.isArray(p.accounts) ? p.accounts : []).slice(0, 12).forEach(a => { const n = normAccount(a || {}, old.get(a && a.id)); while (seen.has(n.id)) n.id += 'x'; seen.add(n.id); accounts.push(n); });
  const routes = {};
  EVENT_IDS.forEach(id => { const r = (p.routes || {})[id] || {}, acc = accounts.some(a => a.id === r.account) ? r.account : ''; routes[id] = { account: acc, to: recipients(r.to).join(', ') }; });
  m.accounts = accounts; m.routes = routes; m.defaultAccount = accounts.some(a => a.id === p.defaultAccount) ? p.defaultAccount : (accounts[0] ? accounts[0].id : '');
}
const publicConfig = (full = true) => { const m = cfg(); return { events: EVENTS, defaultAccount: m.defaultAccount || '', routes: m.routes, accounts: m.accounts.map(a => ({ ...a, pass: a.pass ? '********' : '' })), recent: full ? db.mailLog.slice(-25).reverse() : [] }; };

/* ------------------------------------------------ SMTP client ------------------------------------------------ */
function smtp(a, build, ms = 25000) {
  return new Promise((resolve, reject) => {
    let sock, buf = '', waiter = null, done = false, stage = 'connect';
    const fail = e => { if (done) return; done = true; try { sock && sock.destroy(); } catch { /* ignore */ } reject(e instanceof Error ? e : new Error(String(e))); };
    const timer = setTimeout(() => fail(new Error('The mail server did not answer in time (' + stage + ')')), ms);
    const finish = v => { if (done) return; done = true; clearTimeout(timer); try { sock.end(); } catch { /* ignore */ } resolve(v); };
    const onData = d => { buf += d.toString('utf8'); pump(); };
    const pump = () => {
      for (;;) {
        const lines = buf.split('\r\n'); if (lines.length < 2) return;
        let end = -1; for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) { end = i; break; }
        if (end < 0) return;
        const block = lines.slice(0, end + 1); buf = lines.slice(end + 1).join('\r\n');
        const code = +block[end].slice(0, 3), w = waiter; waiter = null; if (w) w({ code, lines: block.map(l => l.slice(4)) });
      }
    };
    const read = () => new Promise(r => { waiter = r; pump(); });
    const send = async (line, ok) => { stage = line.split(' ')[0]; sock.write(line + '\r\n'); const r = await read(); if (ok && !ok.includes(r.code)) throw new Error('Mail server said: ' + r.code + ' ' + r.lines.join(' ').slice(0, 200)); return r; };
    const opts = { host: a.host, port: a.port, servername: net.isIP(a.host) ? undefined : a.host, rejectUnauthorized: !a.allowSelfSigned };
    const upgrade = () => new Promise((res, rej) => { const s2 = tls.connect({ ...opts, socket: sock }, () => res(s2)); s2.once('error', rej); });
    const run = async () => {
      const g = await read(); if (g.code !== 220) throw new Error('Mail server refused the connection: ' + g.code + ' ' + g.lines.join(' ').slice(0, 160));
      const me = (db.settings.baseUrl || '').replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/gi, '') || 'localhost';
      let ehlo = await send('EHLO ' + me, [250]);
      if (a.security === 'starttls') {
        if (!ehlo.lines.some(l => /^STARTTLS/i.test(l))) throw new Error('This server does not offer STARTTLS. Choose "SSL/TLS" or "None".');
        await send('STARTTLS', [220]); sock.removeListener('data', onData); sock = await upgrade(); sock.on('data', onData); sock.on('error', fail); buf = '';
        ehlo = await send('EHLO ' + me, [250]);
      }
      if (a.user) {
        const mech = (ehlo.lines.find(l => /^AUTH\s/i.test(l)) || '').toUpperCase();
        if (/PLAIN/.test(mech) || !mech) { const r = await send('AUTH PLAIN ' + Buffer.from('\0' + a.user + '\0' + a.pass).toString('base64')); if (r.code !== 235) throw new Error(r.code === 535 || r.code === 534 ? 'The mail server rejected the username or password (' + r.code + '). Gmail and Outlook need an app password.' : 'Login failed: ' + r.code + ' ' + r.lines.join(' ').slice(0, 160)); }
        else { await send('AUTH LOGIN', [334]); await send(Buffer.from(a.user).toString('base64'), [334]); const r = await send(Buffer.from(a.pass).toString('base64')); if (r.code !== 235) throw new Error('The mail server rejected the username or password (' + r.code + ').'); }
      }
      const out = await build(send); await send('QUIT').catch(() => {}); return out;
    };
    const connected = () => { sock.setTimeout(ms, () => fail(new Error('Connection timed out'))); sock.on('data', onData); sock.on('error', fail); run().then(finish, fail); };
    sock = a.security === 'ssl' ? tls.connect(opts, connected) : net.connect({ host: a.host, port: a.port }, connected);
    sock.once('error', e => fail(new Error(e.code === 'ENOTFOUND' ? 'Server "' + a.host + '" was not found. Check the host name.' : e.code === 'ECONNREFUSED' ? 'Connection refused on port ' + a.port + '. Check the port and security type.' : /certificate|self.signed|hostname/i.test(e.message) ? 'The server certificate is not trusted (' + e.message + '). Fix the host name or tick "allow self-signed certificate".' : e.code === 'ETIMEDOUT' ? 'The connection timed out. The host may block this port.' : /wrong version number|ssl3_get_record/i.test(e.message) ? 'SSL error - the port and security type do not match (use SSL/TLS on 465, STARTTLS on 587).' : e.message)));
  });
}
const b64 = s => Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
const hdr = s => (/^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=');
function mime(a, { to, subject, text, html }) {
  const fromName = a.fromName || (db.settings.company && db.settings.company.name) || '', bound = 'b' + crypto.randomBytes(12).toString('hex'), host = a.fromEmail.split('@')[1] || 'localhost';
  const h = [`From: ${fromName ? hdr(fromName) + ' ' : ''}<${a.fromEmail}>`, `To: ${to.join(', ')}`, a.replyTo ? `Reply-To: ${a.replyTo}` : '', `Subject: ${hdr(subject)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomBytes(12).toString('hex')}@${host}>`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${bound}"`, 'X-Auto-Response-Suppress: All'].filter(Boolean);
  const body = [`--${bound}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(text), `--${bound}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(html), `--${bound}--`, ''];
  return h.join('\r\n') + '\r\n\r\n' + body.join('\r\n');
}
const layout = (title, text, link) => { const c = db.settings.company || {}; return `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Segoe UI,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:24px 14px"><div style="background:#0b3d2e;color:#fff;padding:18px 22px;border-radius:14px 14px 0 0;font-size:17px;font-weight:700">${esc(c.name || 'The Umrah Store')}</div><div style="background:#fff;padding:22px;border:1px solid #e3e8e6;border-top:0;border-radius:0 0 14px 14px"><h2 style="margin:0 0 10px;font-size:18px;color:#0b3d2e">${esc(title)}</h2><div style="font-size:14.5px;line-height:1.6;color:#1c2b26;white-space:pre-line">${esc(text)}</div>${link ? `<p style="margin:18px 0 0"><a href="${esc(link)}" style="background:#0b3d2e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:9px;font-weight:600;display:inline-block">Open</a></p>` : ''}</div><p style="text-align:center;color:#8a9893;font-size:12px;margin-top:12px">${esc([c.phone, c.email].filter(Boolean).join(' · '))}</p></div></body></html>`; };

/** sends one message through one account; resolves { ok } and writes the mail log */
async function sendVia(a, { to, subject, text, html, event }) {
  const list = (Array.isArray(to) ? to : recipients(to)).filter(x => EMAIL.test(x));
  if (!list.length) throw new Error('No valid recipient');
  const raw = mime(a, { to: list, subject, text, html: html || layout(subject, text) });
  try {
    await smtp(a, async send => { await send('MAIL FROM:<' + a.fromEmail + '>', [250]); for (const r of list) await send('RCPT TO:<' + r + '>', [250, 251]); await send('DATA', [354]); await send(raw.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..') + '\r\n.', [250]); });
    log({ event: event || 'send', to: list.join(', '), subject: subject.slice(0, 100), account: a.name, ok: true }); return { ok: true };
  } catch (e) { log({ event: event || 'send', to: list.join(', '), subject: subject.slice(0, 100), account: a.name, ok: false, err: String(e.message).slice(0, 220) }); throw e; }
}
const accountFor = event => { const m = cfg(), r = m.routes[event]; const id = r && r.account ? r.account : ''; const a = m.accounts.find(x => x.id === id && x.active !== false); return a || null; };

/** fire-and-forget email for an event. Never throws, never blocks the request. */
function send(event, { to, subject, text, link }) {
  try {
    const a = accountFor(event); if (!a) return false;
    const r = (cfg().routes[event] || {}), list = to ? recipients(to) : recipients(r.to);
    if (!list.length) return false;
    const base = (db.settings.baseUrl || process.env.PUBLIC_URL || '').replace(/\/+$/, ''), url = link && base ? base + '/app' + link : '';
    sendVia(a, { to: list, subject, text: text + (url ? '\n\n' + url : ''), html: layout(subject, text, url), event }).catch(e => console.error('Email failed (' + event + '): ' + e.message));
    return true;
  } catch (e) { console.error('Email error', e.message); return false; }
}

const EVENT_BY_TITLE = [[/^New (live chat|chat message)/i, 'chat.push'], [/^New booking awaiting/i, 'booking.new'], [/^Booking (approved|cancelled|moved)/i, 'booking.status'], [/payment.*(awaiting|recorded|received|new)|new payment/i, 'payment.new'], [/^Payment (approved|rejected|received)/i, 'payment.status'], [/^New query|new .*query/i, 'query.new'], [/^Query|^Quote|quoted|auto-rejected/i, 'query.status'], [/ticket.*(overdue|opened|new|reply)|^New (support )?ticket|^Customer reply/i, 'ticket.new'], [/^Ticket (answered|reply)|^Support replied|answered/i, 'ticket.status'], [/^New partner|application/i, 'signup.new'], [/^New (website )?(enquiry|lead)/i, 'lead.new']];
/** called for every in-app notification: n = { to: {role|pid|uid}, title, body, link } */
function onNotif(n) {
  try {
    let ev = 'system'; for (const [re, id] of EVENT_BY_TITLE) if (re.test(n.title)) { ev = id; break; }
    const r = cfg().routes[ev]; if (!r || !r.account) return;
    if (n.to && n.to.role === 'staff') return send(ev, { subject: n.title, text: n.body, link: n.link });
    if (n.to && n.to.pid) { const p = D.party(n.to.pid); if (p && EMAIL.test(String(p.email || '').trim())) return send(ev, { to: p.email, subject: n.title, text: n.body, link: n.link }); }
  } catch (e) { console.error('onNotif', e.message); }
}

/** settings screen: check the connection + login, optionally send a real test message */
async function test(id, to) {
  const a = cfg().accounts.find(x => x.id === id); if (!a) throw new Error('Save the account first, then test it');
  const list = recipients(to || a.fromEmail); if (!list.length) throw new Error('Enter a valid test recipient');
  await sendVia(a, { to: list, subject: 'Test email from ' + ((db.settings.company || {}).name || 'your CRM'), text: 'This is a test message. Your SMTP account "' + a.name + '" (' + a.host + ':' + a.port + ') works.\n\nSent ' + new Date().toISOString(), event: 'test' });
  logAct(null, 'Email test', a.name + ' -> ' + list.join(', ')); return { ok: true, to: list };
}

/** checks host, port, security and login of an UNSAVED form without sending anything */
async function verify(p) {
  const prev = cfg().accounts.find(x => x.id === p.id), a = normAccount({ ...p, host: p.host, fromEmail: p.fromEmail || p.user || 'test@example.com' }, prev);
  await smtp(a, async () => true); return { ok: true, message: 'Connected to ' + a.host + ':' + a.port + (a.user ? ' and signed in as ' + a.user : '') + '.' };
}
module.exports = { verify, EVENTS, save, publicConfig, send, sendVia, onNotif, test, recipients, layout };
