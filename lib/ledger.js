'use strict';
/**
 * Accounting. Ledgers are derived live from bookings, payments and journal entries,
 * so every change (edit a booking, change a supplier, cancel) is reflected instantly.
 *  - agent / customer ledger:  balance = what they owe us   (debit - credit)
 *  - supplier ledger:          balance = what we owe them   (credit - debit)
 */
const { db } = require('./db');

const lineSell = s => Math.round((+s.sell || 0) * (+s.qty || 1));
const lineCost = s => Math.round((+s.cost || 0) * (+s.qty || 1));
const bookingSell = b => b.services.reduce((t, s) => t + lineSell(s), 0);
const bookingCost = b => b.services.reduce((t, s) => t + lineCost(s), 0);

const svcLabel = s => ({ visa: 'Visa', hotel: 'Hotel', transport: 'Transport', flight: 'Flight', package: 'Package', other: 'Service' }[s.type] || 'Service') + ' - ' + (s.title || '');

function ledger(pid) {
  const p = db.parties.find(x => x.id == pid);
  if (!p) return [];
  const sup = p.kind === 'supplier', rows = [];
  if (p.opening) rows.push({ d: p.created || '0000-00-00', ref: '', t: 'Opening balance', dr: p.opening > 0 && !sup ? p.opening : (p.opening < 0 && sup ? -p.opening : 0), cr: p.opening > 0 && sup ? p.opening : (p.opening < 0 && !sup ? -p.opening : 0), k: 'opening' });
  if (!sup) {
    db.bookings.filter(b => b.partyId == pid).forEach(b => {
      const tot = bookingSell(b);
      rows.push({ d: b.created, ref: b.no, bid: b.id, t: `Booking ${b.no} - ${b.pax[0] ? b.pax[0].n : ''}${b.pax.length > 1 ? ' +' + (b.pax.length - 1) : ''} (${b.category})`, dr: tot, cr: 0, k: 'booking' });
      if (b.status === 'Cancelled') rows.push({ d: b.cdate || b.created, ref: b.no, bid: b.id, t: `Cancellation reversal ${b.no}`, dr: 0, cr: tot, k: 'cancel' });
    });
  } else {
    db.bookings.forEach(b => {
      const mine = b.services.filter(s => s.supId == pid && lineCost(s));
      if (!mine.length) return;
      const tot = mine.reduce((t, s) => t + lineCost(s), 0), what = mine.map(svcLabel).join('; ');
      rows.push({ d: b.created, ref: b.no, bid: b.id, t: `${b.no} - ${what}`.slice(0, 160), dr: 0, cr: tot, k: 'booking' });
      if (b.status === 'Cancelled') rows.push({ d: b.cdate || b.created, ref: b.no, bid: b.id, t: `Cancellation reversal ${b.no}`, dr: tot, cr: 0, k: 'cancel' });
    });
  }
  db.payments.filter(x => x.partyId == pid && x.status === 'Approved').forEach(x => {
    const t = (sup ? 'Payment' : 'Receipt') + ' - ' + (x.method || 'Cash') + (x.ref ? ' (' + x.ref + ')' : '') + (x.note ? ' - ' + x.note : '');
    rows.push(sup ? { d: x.date, ref: x.id, t, dr: x.amt, cr: 0, k: 'payment', pid: x.id } : { d: x.date, ref: x.id, t, dr: 0, cr: x.amt, k: 'payment', pid: x.id });
  });
  db.entries.filter(e => e.partyId == pid).forEach(e => rows.push({ d: e.date, ref: e.id, t: e.t, dr: e.dr, cr: e.cr, k: 'journal', eid: e.id }));
  rows.forEach((r, i) => { r.i = i; });
  rows.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i));
  let bal = 0;
  rows.forEach(r => { bal += sup ? r.cr - r.dr : r.dr - r.cr; r.bal = bal; delete r.i; });
  return rows;
}
const balance = pid => { const l = ledger(pid); return l.length ? l[l.length - 1].bal : 0; };

/** Agent's spendable position. available = credit limit - outstanding (advance deposits increase it). */
function wallet(pid) {
  const p = db.parties.find(x => x.id == pid), bal = balance(pid), limit = p ? p.limit || 0 : 0;
  const pending = db.payments.filter(x => x.partyId == pid && x.status === 'Pending').reduce((t, x) => t + x.amt, 0);
  return { balance: bal, limit, available: limit - bal, pending };
}

module.exports = { ledger, balance, wallet, lineSell, lineCost, bookingSell, bookingCost, svcLabel };
