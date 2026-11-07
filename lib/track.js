'use strict';
/**
 * Customer booking tracking (public). A booking is revealed only to someone who knows BOTH the booking number and a
 * traveller's passport number. The reply is limited to what a traveller may see: status, dates, traveller names (masked),
 * service status and the voucher link. Suppliers, costs, prices, balances and staff names are never returned.
 */
const crypto = require('crypto');
const D = require('./db');
const { db, str } = D;

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const maskName = n => { const p = String(n || '').trim().split(/\s+/).filter(Boolean); return p.length > 1 ? p[0] + ' ' + p[p.length - 1][0].toUpperCase() + '.' : (p[0] || 'Traveller'); };
const TYPE = { visa: 'Visa', hotel: 'Hotel', transport: 'Transport', flight: 'Flight', package: 'Umrah package', other: 'Service' };
const STATUS = {
  Pending: { label: 'Received - awaiting approval', note: 'We have received your booking. Our team is checking it and will approve it shortly.' },
  Confirmed: { label: 'Confirmed', note: 'Your booking is approved. Your voucher is ready below.' },
  Cancelled: { label: 'Cancelled', note: 'This booking has been cancelled. Please contact our team if you have questions.' }
};

function lookup(body) {
  const no = norm(body.no), pp = norm(body.pp);
  if (no.length < 6 || no.length > 24 || pp.length < 5 || pp.length > 24) { const e = new Error('Enter your booking number and a passport number.'); e.status = 400; throw e; }
  const b = db.bookings.find(x => norm(x.no) === no);
  const ok = b && (b.pax || []).some(x => same(norm(x.pp), pp));
  if (!ok) { const e = new Error('We could not find a booking with those details. Check the booking number and passport number, or contact our team.'); e.status = 404; throw e; }
  const st = STATUS[b.status] || { label: b.status, note: '' };
  const v = b.status === 'Confirmed' ? db.vouchers.find(x => x.bookingId === b.id && x.kind === 'full') : null;
  return {
    no: b.no, status: b.status, statusLabel: st.label, note: st.note, category: str(b.category, 60), from: b.from || '', to: b.to || '', created: b.created || '',
    approvedAt: b.approvedAt ? String(b.approvedAt).slice(0, 10) : '', cancelledOn: b.status === 'Cancelled' ? (b.cdate || '') : '',
    travellers: (b.pax || []).map(x => ({ name: maskName(x.n), type: x.t || 'Adult' })),
    services: (b.services || []).map(s => ({ type: TYPE[s.type] || 'Service', title: str(s.title, 160), from: s.from || '', to: s.to || '', state: s.cs === 'Confirmed' ? 'Confirmed' : 'Being arranged' })),
    voucher: v ? '/v/' + v.token : ''
  };
}
module.exports = { lookup };
