'use strict';
/* PayFast flow test: token request, payment record, signature / amount / failure handling, idempotency. Mocks the PayFast API; no network. */
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-'));
const D = require('../lib/db'), I = require('../lib/integrations');
const { db } = D; let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const req = { protocol: 'https', get: () => 'crm.example.com' };
(async () => {
  let calls = [];
  global.fetch = async (u, o) => { calls.push({ u: String(u), body: String(o && o.body || '') }); return { ok: true, status: 200, text: async () => JSON.stringify({ ACCESS_TOKEN: 'tok123' }) }; };
  db.settings.payfast = { merchantId: '1234', merchantName: 'Umrah Store', securedKey: 'SECRET', env: 'sandbox', storeId: '' };
  ok(I.pfConfigured(), 'configured once credentials are saved');
  let thrown = ''; try { await I.payfastStart(req, { partyId: 1, amt: 50 }); } catch (e) { thrown = e.message; } ok(/at least PKR 100/.test(thrown), 'amount under PKR 100 rejected');
  const start = async amt => I.payfastStart(req, { partyId: 1, amt, note: 'Top-up', userName: 'Agent', email: 'a@b.pk', phone: '+92 300 1234567' });
  const r = await start(5000);
  ok(calls[0].u.startsWith('https://ipguat.apps.net.pk') && /GetAccessToken/.test(calls[0].u), 'sandbox endpoint used for token');
  ok(r.fields.TOKEN === 'tok123' && r.fields.TXNAMT === '5000' && r.fields.CURRENCY_CODE === 'PKR', 'checkout fields carry token and amount');
  ok(r.fields.SUCCESS_URL === 'https://crm.example.com/payfast/return' && r.fields.CHECKOUT_URL.endsWith('/payfast/ipn'), 'return and IPN URLs built from the public address');
  ok(r.fields.CUSTOMER_MOBILE_NO === '03001234567', 'mobile normalised to 03xx format');
  const pay = () => db.payments.find(p => p.id === r.id), basket = pay().basket;
  ok(pay().status === 'Initiated', 'payment stored as Initiated');
  // bad signature
  I.payfastResult({ basket_id: basket, err_code: '000', validation_hash: 'deadbeef', transaction_id: 'T1' });
  ok(pay().status === 'Pending', 'success with a wrong signature goes to manual review, not approved');
  // amount mismatch with valid signature
  const good = sha([basket, 'SECRET', '1234', '000'].join('|'));
  I.payfastResult({ basket_id: basket, err_code: '000', validation_hash: good, transaction_id: 'T1', transaction_amount: '10' });
  ok(pay().status === 'Pending', 'amount mismatch is never auto-approved');
  // valid
  const p2 = I.payfastResult({ basket_id: basket, err_code: '000', validation_hash: good.toUpperCase(), transaction_id: 'T1', transaction_amount: '5000.00' });
  ok(p2 && pay().status === 'Approved' && pay().ref === 'T1', 'valid signature and amount approves the payment');
  // idempotent
  const n = db.audit ? db.audit.length : 0; I.payfastResult({ basket_id: basket, err_code: '001', validation_hash: sha([basket, 'SECRET', '1234', '001'].join('|')) });
  ok(pay().status === 'Approved', 'a later failure callback cannot reverse an approved payment');
  // failure
  const r2 = await start(2000), b2 = db.payments.find(p => p.id === r2.id).basket;
  I.payfastResult({ basket_id: b2, err_code: '106', err_msg: 'Declined', validation_hash: sha([b2, 'SECRET', '1234', '106'].join('|')) });
  ok(db.payments.find(p => p.id === r2.id).status === 'Failed', 'declined payment marked Failed');
  // bare visit
  const r3 = await start(3000), b3 = db.payments.find(p => p.id === r3.id).basket;
  I.payfastResult({ basket_id: b3 }); ok(db.payments.find(p => p.id === r3.id).status === 'Initiated', 'bare visit to return URL changes nothing');
  ok(I.payfastResult({ basket_id: 'NOPE' }) === null, 'unknown basket returns null');
  // live env + token failure
  db.settings.payfast.env = 'live'; calls = []; await start(1000); ok(calls[0].u.startsWith('https://ipg1.apps.net.pk'), 'live endpoint used when env = live');
  global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ message: 'Invalid merchant' }) }); thrown = ''; try { await start(1000); } catch (e) { thrown = e.message; } ok(/Invalid merchant/.test(thrown), 'token failure surfaces the PayFast message');
  const t = await I.payfastTest({ merchantId: '1', securedKey: 'x', env: 'sandbox' }); ok(t.ok === false && /rejected/.test(t.message), 'connection test reports rejected credentials');
  console.log(fails ? '\n' + fails + ' PayFast test(s) failed' : '\nAll PayFast tests passed'); process.exit(fails ? 1 : 0);
})();
