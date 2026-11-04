'use strict';
/**
 * Group packages: one place that defines what a valid group is.
 * Used by the manual form, the supplier-PDF import and the AI assistant, so nothing unvalidated is ever stored.
 *
 * group = { id, no?, code, air, airline, dep, ret, n, seats,
 *           out: { fn, date, from, to, dt, at, bag }, inb: { ... },
 *           pk: [ { id, mk, md, mkn, mdn, mkd, mdd, p: { sh, qd, tr, db } } ] }
 */
const D = require('./db');
const { db, fail, str, num, isoDate, today } = D;

const ROOM_KEYS = ['sh', 'qd', 'tr', 'db'];
const ROOM_NAMES = { sh: 'Sharing', qd: 'Quad', tr: 'Triple', db: 'Double' };
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const nightsBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const hhmm = v => { const m = TIME.exec(String(v || '').trim()); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; };
const iata = v => (/^[A-Za-z]{3}$/.test(String(v || '').trim()) ? String(v).trim().toUpperCase() : '');

function normLeg(raw, date, label) {
  const l = raw && typeof raw === 'object' ? raw : {};
  const fn = str(l.fn, 14).toUpperCase().replace(/\s+/g, ' ');
  if (!/^[A-Z0-9]{2}\s?\d{1,4}[A-Z]?$/.test(fn)) fail(label + ' flight number is missing or invalid (example: SV 739)');
  const from = iata(l.from), to = iata(l.to);
  if (!from || !to) fail(label + ' flight needs 3-letter airport codes (example: LHE and JED)');
  if (from === to) fail(label + ' flight departs and arrives at the same airport');
  const dt = hhmm(l.dt), at = hhmm(l.at);
  if (!dt || !at) fail(label + ' flight needs departure and arrival times as HH:MM (24 hour)');
  return { fn: fn.includes(' ') ? fn : fn.slice(0, 2) + ' ' + fn.slice(2), date, from, to, dt, at, bag: Math.min(60, num(l.bag)) };
}

function normPackage(raw, i, used) {
  const p = raw && typeof raw === 'object' ? raw : {};
  let id = str(p.id, 20).toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'UP-' + (i + 1);
  while (used.has(id)) id += 'X';
  used.add(id);
  const prices = p.p && typeof p.p === 'object' ? p.p : {};
  const pr = {}; ROOM_KEYS.forEach(k => { pr[k] = Math.min(9999999, num(prices[k])); });
  if (!ROOM_KEYS.some(k => pr[k] > 0)) fail('Package ' + id + ' needs at least one room price (sharing, quad, triple or double)');
  const mk = str(p.mk, 80), md = str(p.md, 80);
  if (!mk && !md) fail('Package ' + id + ' needs a Makkah or a Madinah hotel');
  return { id, mk, md, mkn: Math.min(60, num(p.mkn)), mdn: Math.min(60, num(p.mdn)), mkd: str(p.mkd, 50), mdd: str(p.mdd, 50), p: pr };
}

/**
 * Validates and normalises a group. `prev` is the stored group when editing (missing fields are kept from it).
 * `opts.newId()` supplies an id for new groups; `opts.allowPast` skips the "departure must be in the future" rule (edits of stored data).
 */
function normGroup(raw, prev, opts = {}) {
  if (!raw || typeof raw !== 'object') fail('Group details are missing');
  const src = prev ? { ...prev, ...raw, out: { ...prev.out, ...(raw.out || {}) }, inb: { ...prev.inb, ...(raw.inb || {}) }, pk: Array.isArray(raw.pk) ? raw.pk : prev.pk } : raw;
  let id = str(src.id, 24).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (prev) id = prev.id; else if (!id) id = opts.newId ? opts.newId() : 'UG-NEW';
  const air = str(src.air, 3).toUpperCase();
  if (!/^[A-Z0-9]{2}$/.test(air)) fail('Airline code must be the 2-letter IATA code (example: SV, PK, EK)');
  const dep = isoDate(src.dep), ret = isoDate(src.ret);
  if (!dep) fail('Departure date is missing or invalid (use YYYY-MM-DD)');
  if (!ret) fail('Return date is missing or invalid (use YYYY-MM-DD)');
  if (ret <= dep) fail('Return date must be after the departure date');
  if (!opts.allowPast && dep < today()) fail('Departure date is in the past');
  const nights = nightsBetween(dep, ret);
  if (nights > 120) fail('A group cannot be longer than 120 nights');
  const given = num(src.n);
  const seats = src.seats === '' || src.seats == null ? fail('Seats are missing') : Math.min(999, num(src.seats));
  const used = new Set();
  const pkRaw = Array.isArray(src.pk) ? src.pk : [];
  if (!pkRaw.length) fail('Add at least one hotel package with prices');
  if (pkRaw.length > 12) fail('A group can have at most 12 hotel packages');
  const g = {
    id, ...(src.no != null && Number.isFinite(+src.no) ? { no: +src.no } : {}), code: str(src.code, 60) || id,
    air, airline: str(src.airline, 60) || air, dep, ret, n: given > 0 && Math.abs(given - nights) <= 1 ? given : nights, seats,
    out: normLeg(src.out, dep, 'Outbound'), inb: normLeg(src.inb, ret, 'Return'),
    pk: pkRaw.map((p, i) => normPackage(p, i, used))
  };
  return g;
}

/** insert or replace by id, keep the list sorted by departure */
function upsert(g) {
  db.groups = db.groups.filter(x => x.id !== g.id); db.groups.push(g);
  db.groups.sort((a, b) => (a.dep < b.dep ? -1 : a.dep > b.dep ? 1 : a.id < b.id ? -1 : 1));
}

const cheapest = g => { const v = g.pk.flatMap(k => ROOM_KEYS.map(r => k.p[r])).filter(x => x > 0); return v.length ? Math.min(...v) : 0; };
const find = id => db.groups.find(g => g.id === String(id || '').trim().toUpperCase());
const bookedSeats = id => db.bookings.filter(b => b.status !== 'Cancelled' && b.groupRef && b.groupRef.gid === id).reduce((a, b) => a + (b.groupRef.seats || 0), 0);

/** compact description for lists and for the AI (never includes anything but what staff and agents already see) */
const brief = g => ({ id: g.id, code: g.code, airline: g.airline + ' (' + g.air + ')', departs: g.dep, returns: g.ret, nights: g.n, seatsLeft: g.seats, fromPricePKR: cheapest(g), outbound: `${g.out.fn} ${g.out.from}-${g.out.to} ${g.out.dt}`, inbound: `${g.inb.fn} ${g.inb.from}-${g.inb.to} ${g.inb.dt}`, packages: g.pk.length });
const detail = g => ({ ...brief(g), outboundFlight: g.out, returnFlight: g.inb, bookedSeats: bookedSeats(g.id), packages: g.pk.map(k => ({ id: k.id, makkahHotel: k.mk, makkahNights: k.mkn, makkahDistance: k.mkd, madinahHotel: k.md, madinahNights: k.mdn, madinahDistance: k.mdd, pricePerPersonPKR: { sharing: k.p.sh, quad: k.p.qd, triple: k.p.tr, double: k.p.db } })) });

/** filter used by the AI list tool and by the quick filters */
function search(a = {}) {
  const t = today(), q = String(a.query || '').toLowerCase().trim(), mon = String(a.month || ''), air = String(a.airline || '').toLowerCase().trim();
  const max = num(a.maxPrice), lim = Math.min(25, Math.max(1, num(a.limit) || 12));
  return db.groups.filter(g => g.dep >= t
    && (!q || [g.id, g.code, g.airline, g.air, g.out.fn, g.inb.fn, ...g.pk.flatMap(k => [k.mk, k.md, k.id])].join(' ').toLowerCase().includes(q))
    && (!mon || g.dep.startsWith(mon)) && (!air || g.air.toLowerCase() === air || g.airline.toLowerCase().includes(air))
    && (!a.availableOnly || g.seats > 0) && (!max || (cheapest(g) > 0 && cheapest(g) <= max))).slice(0, lim);
}

module.exports = { ROOM_KEYS, ROOM_NAMES, normGroup, normLeg, normPackage, upsert, find, cheapest, brief, detail, search, bookedSeats, nightsBetween };
