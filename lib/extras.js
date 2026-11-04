'use strict';
/**
 * Notifications (event-driven, persisted, per user), Help & Support tickets, and live currency rates (SerpApi Google Finance).
 * Notifications are produced by diffing bookings / payments / queries / tickets against the last state we saw, so every code path
 * (RPC, PayFast IPN, payment links, SLA sweep, AI assistant) notifies without being wired individually.
 */
const D = require('./db');
const { db, nid, str, fail, need, logAct } = D;
const PM = require('./perms');
const I = require('./integrations');
const Mail = require('./mailer');
const L = require('./ledger');

const nowISO = () => new Date().toISOString();
const isStaff = u => u && (u.role === 'admin' || u.role === 'staff');
['tickets', 'notifs'].forEach(k => { db[k] = db[k] || []; });
db.fx = db.fx || { perUnit: {}, updated: '', source: '', error: '' };

/* ======================= NOTIFICATIONS ======================= */
const push = (to, title, body, link, kind, perm) => {
  db.notifs.push({ id: 'n' + nid(), t: nowISO(), to, title: str(title, 120), body: str(body, 220), link: link || '', kind: kind || 'info', perm: perm || '', readBy: [] });
  if (db.notifs.length > 1500) db.notifs.splice(0, db.notifs.length - 1500);
  Mail.onNotif({ to, title: str(title, 120), body: str(body, 220), link: link || '' });
};
const toStaff = (title, body, link, kind, perm) => push({ role: 'staff' }, title, body, link, kind, perm);
const toParty = (pid, title, body, link, kind) => pid && push({ pid }, title, body, link, kind);
const pname = id => (D.party(id) || {}).name || 'Account';
const money = n => 'PKR ' + Math.round(+n || 0).toLocaleString('en-US');

function visible(u, n) {
  if (n.to.uid) return n.to.uid === u.id;
  if (n.to.role === 'staff') return isStaff(u) && (!n.perm || PM.can(u, n.perm));
  if (n.to.pid) return !isStaff(u) && u.pid == n.to.pid;
  return false;
}
function listFor(u) {
  const mine = db.notifs.filter(n => visible(u, n));
  const unread = mine.filter(n => !n.readBy.includes(u.id)).length;
  return { unread, items: mine.slice(-40).reverse().map(n => ({ id: n.id, t: n.t, title: n.title, body: n.body, link: n.link, kind: n.kind, read: n.readBy.includes(u.id) })) };
}

function detect() {
  const first = !db.nstate;
  const st = db.nstate = db.nstate || { b: {}, s: {}, p: {}, q: {}, k: {} };
  const say = (fn, ...a) => { if (!first) fn(...a); };
  const nowMs = Date.now();

  db.bookings.forEach(b => {
    const prev = st.b[b.id];
    if (prev === undefined) {
      if (b.status === 'Pending') say(toStaff, 'New booking awaiting approval', b.no + ' · ' + ((b.pax[0] || {}).n || '') + ' · ' + pname(b.partyId) + ' · ' + money(L.bookingSell(b)), '#/booking/' + b.id, 'booking', 'bookings.view');
    } else if (prev !== b.status) {
      if (b.status === 'Confirmed') say(toParty, b.partyId, 'Booking approved', b.no + ' is approved. Vouchers are now valid.', '#/booking/' + b.id, 'ok');
      if (b.status === 'Cancelled') { say(toParty, b.partyId, 'Booking cancelled', b.no + ' was cancelled.', '#/booking/' + b.id, 'warn'); say(toStaff, 'Booking cancelled', b.no + ' · ' + pname(b.partyId), '#/booking/' + b.id, 'warn', 'bookings.view'); }
      if (b.status === 'Pending' && prev === 'Confirmed') say(toParty, b.partyId, 'Booking moved back to pending', b.no, '#/booking/' + b.id, 'warn');
    }
    st.b[b.id] = b.status;
    b.services.forEach(s => {
      const key = b.id + ':' + s.id, ps = st.s[key], cur = (s.cs || '') + '|' + (s.supId || '');
      if (ps !== cur) {
        const [pcs, psup] = (ps || '|').split('|');
        if (s.supId && b.status !== 'Cancelled' && String(psup) !== String(s.supId)) say(toParty, s.supId, 'New service assigned', b.no + ' · ' + (s.title || s.type), '#/booking/' + b.id, 'booking');
        if (s.cs === 'Confirmed' && pcs !== 'Confirmed' && ps !== undefined) {
          say(toParty, b.partyId, 'Service confirmed', b.no + ' · ' + (s.title || s.type) + (s.conf ? ' · conf. ' + s.conf : ''), '#/booking/' + b.id, 'ok');
          say(toStaff, 'Supplier confirmed a service', b.no + ' · ' + (s.title || s.type) + (s.conf ? ' · ' + s.conf : ''), '#/booking/' + b.id, 'ok', 'bookings.view');
        }
        st.s[key] = cur;
      }
    });
  });

  db.payments.forEach(p => {
    const prev = st.p[p.id];
    if (prev !== p.status) {
      if (p.status === 'Pending' && prev === undefined) say(toStaff, 'Payment awaiting approval', money(p.amt) + ' · ' + pname(p.partyId) + (p.ref ? ' · ' + p.ref : ''), '#/payments', 'pay', 'payments.view');
      if (p.status === 'Approved' && prev !== undefined) {
        say(toParty, p.partyId, 'Payment received', money(p.amt) + ' was credited to your account.', '#/account/' + p.partyId, 'ok');
        if (p.via === 'payfast') say(toStaff, 'Online payment received', money(p.amt) + ' · ' + pname(p.partyId) + ' · PayFast', '#/payments', 'ok', 'payments.view');
      }
      if (p.status === 'Rejected' && prev !== undefined) say(toParty, p.partyId, 'Payment rejected', money(p.amt) + (p.ref ? ' · ' + p.ref : '') + ' could not be verified. Contact the office.', '#/payments', 'bad');
      st.p[p.id] = p.status;
    }
  });

  db.queries.forEach(q => {
    const prev = st.q[q.id];
    if (prev !== q.status) {
      if (prev === undefined && q.status === 'Open') say(toStaff, 'New ' + q.type + ' query', q.no + ' · ' + str(q.text, 80) + ' · ' + (q.partyId ? pname(q.partyId) : (q.contact && q.contact.phone) || q.source), '#/queries', 'query', 'queries.view');
      if (q.status === 'Quoted' && prev !== undefined) say(toParty, q.partyId, 'Quote received', q.no + (q.resp && q.resp.amt ? ' · ' + money(q.resp.amt) : ''), '#/queries', 'ok');
      if ((q.status === 'Expired' || q.status === 'Rejected') && prev !== undefined) say(toParty, q.partyId, q.status === 'Expired' ? 'Query auto-rejected' : 'Query rejected', q.no + (q.status === 'Expired' ? ' was not answered in time.' : ''), '#/queries', 'warn');
      if (q.status === 'Accepted' && prev !== undefined) say(toStaff, 'Quote accepted', q.no + ' · ' + (q.partyId ? pname(q.partyId) : ''), '#/queries', 'ok', 'queries.view');
      st.q[q.id] = q.status;
    }
    if (q.status === 'Open' && q.dueAt && !st.k['q' + q.id] && new Date(q.dueAt).getTime() - nowMs < 30 * 60000) { st.k['q' + q.id] = 1; say(toStaff, 'Query deadline in under 30 minutes', q.no + ' · ' + q.type, '#/queries', 'warn', 'queries.view'); }
  });

  db.tickets.forEach(t => {
    if (t.status !== 'Closed' && t.status !== 'Resolved' && t.dueAt && !t.overdueNotified && new Date(t.dueAt).getTime() < nowMs) { t.overdueNotified = true; say(toStaff, 'Ticket overdue', t.no + ' · ' + t.subject, '#/support/' + t.id, 'warn', 'support.view'); }
  });
}

/* ======================= SUPPORT TICKETS ======================= */
const TK_CATS = ['Booking', 'Payment', 'Ledger / balance', 'Voucher', 'Visa', 'Hotel', 'Transport', 'Flight', 'Technical issue', 'Other'];
const TK_PRI = ['Low', 'Normal', 'High', 'Urgent'];
const TK_STAT = ['Open', 'In progress', 'Answered', 'Resolved', 'Closed'];
const SLA_H = { Urgent: 2, High: 8, Normal: 24, Low: 48 };
const dueFor = pri => new Date(Date.now() + (SLA_H[pri] || 24) * 36e5).toISOString();

const getTicket = (u, id) => {
  const t = db.tickets.find(x => x.id === id || x.no === id); if (!t) fail('Ticket not found');
  if (isStaff(u)) { PM.need(u, 'support.view'); return t; }
  if (t.pid != u.pid) fail('Ticket not found');
  return t;
};
function ticketView(u, t) {
  const staff = isStaff(u);
  return { ...t, msgs: t.msgs.filter(m => staff || !m.internal).map(m => ({ ...m })), party: undefined };
}
function ticketsFor(u) {
  if (isStaff(u)) return PM.can(u, 'support.view') ? db.tickets.map(t => ticketView(u, t)) : [];
  return db.tickets.filter(t => t.pid == u.pid).map(t => ticketView(u, t));
}
const TOPS = {
  openTicket(u, p) {
    const staff = isStaff(u); if (!staff && u.role !== 'agent' && u.role !== 'supplier') fail('Not allowed');
    if (staff) PM.need(u, 'support.reply');
    const pid = staff ? +p.partyId : u.pid; if (!pid || !D.party(pid)) fail(staff ? 'Choose the agent or supplier this ticket is for' : 'Account not found');
    const subject = str(p.subject, 120), text = str(p.text, 3000); if (subject.length < 3) fail('Add a short subject'); if (text.length < 3) fail('Describe the problem');
    const recent = db.tickets.filter(t => t.pid == pid && Date.now() - new Date(t.createdAt) < 36e5).length; if (!staff && recent >= 8) fail('Too many tickets in the last hour. Please wait or call the office.');
    let bookingNo = ''; if (p.bookingNo) { const b = db.bookings.find(x => x.no === p.bookingNo); if (b && (staff || (u.role === 'agent' ? b.partyId == pid : b.services.some(s => s.supId == pid)))) bookingNo = b.no; }
    const pri = TK_PRI.includes(p.priority) ? p.priority : 'Normal', t = {
      id: 't' + nid(), no: 'TK-' + nid(), pid, kind: D.party(pid).kind, subject, category: TK_CATS.includes(p.category) ? p.category : 'Other', priority: pri, bookingNo,
      status: 'Open', createdAt: nowISO(), updatedAt: nowISO(), by: u.name, assignee: '', assigneeName: '', dueAt: dueFor(pri),
      msgs: [{ id: 'm' + nid(), t: nowISO(), by: u.name, role: u.role, text }]
    };
    db.tickets.push(t); logAct(u, 'Ticket opened', t.no);
    toStaff('New support ticket' + (pri === 'Urgent' || pri === 'High' ? ' (' + pri + ')' : ''), t.no + ' · ' + subject + ' · ' + pname(pid), '#/support/' + t.id, 'ticket', 'support.view');
    return { id: t.id, no: t.no };
  },
  replyTicket(u, p) {
    const t = getTicket(u, p.id), staff = isStaff(u), text = str(p.text, 3000); if (text.length < 1) fail('Write a message');
    if (staff) PM.need(u, 'support.reply');
    const internal = staff && !!p.internal;
    t.msgs.push({ id: 'm' + nid(), t: nowISO(), by: u.name, role: u.role, text, internal });
    t.updatedAt = nowISO();
    if (staff && !internal) {
      t.status = TK_STAT.includes(p.status) ? p.status : (t.status === 'Closed' || t.status === 'Resolved' ? t.status : 'Answered'); t.dueAt = ''; t.overdueNotified = false;
      if (!t.firstReplyAt) t.firstReplyAt = nowISO();
      toParty(t.pid, 'Support replied', t.no + ' · ' + str(text, 120), '#/support/' + t.id, 'ticket');
    } else if (staff && internal) { /* private note */ }
    else {
      t.status = 'Open'; t.dueAt = dueFor(t.priority); t.overdueNotified = false;
      if (t.assignee) push({ uid: t.assignee }, 'Customer replied', t.no + ' · ' + str(text, 120), '#/support/' + t.id, 'ticket');
      else toStaff('Ticket reply', t.no + ' · ' + u.name + ': ' + str(text, 100), '#/support/' + t.id, 'ticket', 'support.view');
    }
    logAct(u, 'Ticket reply', t.no);
  },
  setTicketStatus(u, p) {
    const t = getTicket(u, p.id), staff = isStaff(u), s = p.status; if (!TK_STAT.includes(s)) fail('Bad status');
    if (staff) PM.need(u, 'support.reply'); else need(s === 'Closed' || s === 'Open', 'Not allowed');
    if (t.status === s) return;
    t.status = s; t.updatedAt = nowISO(); if (s === 'Resolved' || s === 'Closed') t.dueAt = ''; else if (s === 'Open' && !t.dueAt) t.dueAt = dueFor(t.priority);
    t.msgs.push({ id: 'm' + nid(), t: nowISO(), by: u.name, role: u.role, text: 'Status changed to ' + s, system: true });
    if (staff && (s === 'Resolved' || s === 'Closed')) toParty(t.pid, 'Ticket ' + s.toLowerCase(), t.no + ' · ' + t.subject, '#/support/' + t.id, 'ok');
    if (!staff) toStaff('Ticket ' + (s === 'Closed' ? 'closed by user' : 'reopened'), t.no + ' · ' + pname(t.pid), '#/support/' + t.id, 'ticket', 'support.view');
    logAct(u, 'Ticket ' + s, t.no);
  },
  setTicketMeta(u, p) {
    const t = getTicket(u, p.id); need(isStaff(u)); PM.need(u, 'support.reply');
    if (p.priority && TK_PRI.includes(p.priority) && p.priority !== t.priority) { t.priority = p.priority; if (t.dueAt) t.dueAt = dueFor(p.priority); }
    if (p.assignee !== undefined) {
      const a = p.assignee ? db.users.find(x => x.id === p.assignee && (x.role === 'staff' || x.role === 'admin')) : null;
      if (p.assignee && !a) fail('Staff member not found');
      if (a && a.id !== t.assignee) push({ uid: a.id }, 'Ticket assigned to you', t.no + ' · ' + t.subject, '#/support/' + t.id, 'ticket');
      t.assignee = a ? a.id : ''; t.assigneeName = a ? a.name : '';
    }
    t.updatedAt = nowISO();
  },
  delTicket(u, p) { need(isStaff(u)); PM.need(u, 'support.delete'); const n = db.tickets.length; db.tickets = db.tickets.filter(t => t.id !== p.id); if (n === db.tickets.length) fail('Ticket not found'); logAct(u, 'Ticket deleted', p.id); },
  markNotifs(u, p) {
    db.notifs.forEach(n => { if ((p.all || n.id === p.id) && visible(u, n) && !n.readBy.includes(u.id)) n.readBy.push(u.id); });
  }
};

/* ======================= LIVE CURRENCY (SerpApi Google Finance) ======================= */
const FX_CODES = ['USD', 'SAR', 'AED', 'GBP', 'EUR'];
let fxBusy = null;
async function fxOne(code, key) {
  const u = new URL(process.env.SERPAPI_BASE_URL || 'https://serpapi.com/search.json');
  u.searchParams.set('engine', 'google_finance'); u.searchParams.set('q', code + '-PKR'); u.searchParams.set('hl', 'en'); u.searchParams.set('api_key', key);
  const r = await fetch(u, { signal: AbortSignal.timeout(15000) }), j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(String(j.error));
  const s = j.summary || {}, v = +(s.extracted_price != null ? s.extracted_price : String(s.price || '').replace(/[^0-9.]/g, ''));
  if (!(v > 0) || (s.stock && !String(s.stock).toUpperCase().startsWith(code))) throw new Error('No rate returned for ' + code);
  return v;
}
function fxRefresh(force) {
  const key = I.serpKey(); if (!key) return Promise.resolve(db.fx);
  if (!force && db.fx.updated && Date.now() - new Date(db.fx.updated) < 6 * 36e5) return Promise.resolve(db.fx);
  if (fxBusy) return fxBusy;
  fxBusy = (async () => {
    const res = await Promise.allSettled(FX_CODES.map(c => fxOne(c, key))), per = { ...db.fx.perUnit }, errs = [];
    res.forEach((r, i) => { if (r.status === 'fulfilled') per[FX_CODES[i]] = r.value; else errs.push(FX_CODES[i] + ': ' + r.reason.message); });
    if (res.some(r => r.status === 'fulfilled')) { db.fx = { perUnit: per, updated: nowISO(), source: 'SerpApi · Google Finance', error: errs.join('; ') }; }
    else db.fx = { ...db.fx, error: errs[0] || 'Could not fetch rates', failedAt: nowISO() };
    D.save(); return db.fx;
  })().finally(() => { fxBusy = null; });
  return fxBusy;
}
function fxSnapshot() {
  const manualSar = +((db.settings.calc || {}).pkrPerSar) || 0, per = { ...db.fx.perUnit }, src = { ...Object.fromEntries(Object.keys(per).map(k => [k, 'live'])) };
  if (!per.SAR && manualSar) { per.SAR = manualSar; src.SAR = 'manual'; }
  return { configured: !!I.serpKey(), base: 'PKR', perUnit: per, src, updated: db.fx.updated || '', source: db.fx.source || '', error: db.fx.error || '', codes: ['PKR', ...FX_CODES] };
}

function init() { D.hooks.push(detect); detect(); }
module.exports = { init, TOPS, listFor, ticketsFor, fxRefresh, fxSnapshot, TK_CATS, TK_PRI, TK_STAT, detect, push };
