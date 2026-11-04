'use strict';
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const D = require('./db');
const { db, DATA, str, nid, today, logAct, token } = D;

const nowISO = () => new Date().toISOString();
const { fetchJson } = require('./http');

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

const Search = require('./search'), Assistant = require('./assistant');
module.exports = { serpKey: Search.serpKey, pfConfigured, payfastStart, payfastResult, payfastTest, base, wa, waStart, waStop, waAutoStart, aiReady: Assistant.aiReady, groqCfg: Assistant.groqCfg, groqTest: Assistant.groqTest, GROQ_MODELS: Assistant.GROQ_MODELS };
