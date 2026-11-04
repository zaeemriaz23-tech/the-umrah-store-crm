'use strict';
/**
 * Inventory behind the Umrah calculator and the transport booking engine.
 * Hotels -> room types -> dated nightly rates (SAR), visa tiers, transport vehicles / routes / fares, exchange rate.
 * Nothing is hard-coded: everything is entered by the office in Rates & inventory.
 */
const D = require('./db');
const { db, nid, today, fail, need, str, num, isoDate, logAct, token } = D;
const E = require('../public/engine.js');

const isStaff = u => u && (u.role === 'admin' || u.role === 'staff');
const bool = v => v === true || v === 'true' || v === 1 || v === '1';
const ints = (v, max = 1e7) => Math.max(0, Math.min(max, Math.round(+String(v == null ? 0 : v).replace(/[^0-9.\-]/g, '') || 0)));
const OCC = E.OCC.map(o => o.v);

const ops = {
  saveHotel(u, p) {
    need(isStaff(u));
    const city = p.city === 'MADINAH' ? 'MADINAH' : 'MAKKAH', name = str(p.name, 100);
    if (!name) fail('Enter the hotel name');
    const old = p.id ? db.hotels.find(h => h.id === p.id) : null;
    if (p.id && !old) fail('Hotel not found');
    const oldRooms = old ? Object.fromEntries(old.rooms.map(r => [r.id, r])) : {};
    const rooms = (Array.isArray(p.rooms) ? p.rooms : []).slice(0, 30).map(r => {
      const rn = str(r.name, 80); if (!rn) fail('Every room type needs a name');
      const rates = (Array.isArray(r.rates) ? r.rates : []).slice(0, 40).map(x => {
        const amt = ints(x.amt), start = isoDate(x.start), end = isoDate(x.end);
        if (!amt) return null;
        if (start && end && end < start) fail('Rate period for ' + rn + ' ends before it starts');
        return { id: str(x.id, 20) || 'rt' + nid(), label: str(x.label, 60), start, end, amt };
      }).filter(Boolean);
      return { id: oldRooms[r.id] ? r.id : 'rm' + nid(), name: rn, occ: OCC.includes(r.occ) ? r.occ : 'QUAD', rates };
    });
    const h = { id: old ? old.id : 'h' + nid(), city, name, area: str(p.area, 80), dist: str(p.dist, 40), stars: Math.max(0, Math.min(5, ints(p.stars, 5))), active: p.active !== false && p.active !== 'false', order: ints(p.order, 9999), rooms };
    if (old) Object.assign(old, h); else db.hotels.push(h);
    logAct(u, old ? 'Hotel edited' : 'Hotel added', name + ' (' + city + ')');
    return { id: h.id };
  },
  delHotel(u, p) { need(isStaff(u)); const h = db.hotels.find(x => x.id === p.id); if (!h) fail('Hotel not found'); db.hotels = db.hotels.filter(x => x.id !== p.id); logAct(u, 'Hotel removed', h.name); },

  saveVisaTiers(u, p) {
    need(isStaff(u));
    const tiers = (Array.isArray(p.tiers) ? p.tiers : []).slice(0, 80).map(t => {
      const type = str(t.type, 100), min = ints(t.min, 999), max = t.max === '' || t.max == null ? null : ints(t.max, 999), amt = ints(t.amt);
      if (!type || !amt) return null;
      if (max !== null && max < min) fail('Visa tier "' + type + '": max travellers is below min');
      return { id: str(t.id, 20) || 'vt' + nid(), type, min: Math.max(1, min), max, amt, label: str(t.label, 60), active: t.active !== false && t.active !== 'false' };
    }).filter(Boolean);
    db.visaTiers = tiers; logAct(u, 'Visa pricing saved', tiers.length + ' tier(s)');
  },

  saveVehicle(u, p) {
    need(isStaff(u)); const name = str(p.name, 80); if (!name) fail('Enter the vehicle name');
    const cap = ints(p.cap, 200); if (cap < 1) fail('Enter how many passengers it carries');
    const old = p.id ? db.tVehicles.find(v => v.id === p.id) : null; if (p.id && !old) fail('Vehicle not found');
    const thr = p.thr === '' || p.thr == null ? null : ints(p.thr, 200), chg = p.chg === '' || p.chg == null ? null : ints(p.chg, 100000);
    const v = { id: old ? old.id : 'v' + nid(), name, desc: str(p.desc, 300), cap, lug: p.lug === '' || p.lug == null ? null : ints(p.lug, 500), thr: thr !== null && chg !== null ? thr : null, chg: thr !== null && chg !== null ? chg : null, active: p.active !== false && p.active !== 'false', order: ints(p.order, 9999), img: typeof p.img === 'string' && /^(data:image\/(png|jpeg|webp);base64,|\/)/.test(p.img) && p.img.length < 400000 ? p.img : (old ? old.img || '' : '') };
    if (old) Object.assign(old, v); else db.tVehicles.push(v);
    logAct(u, old ? 'Vehicle edited' : 'Vehicle added', name); return { id: v.id };
  },
  delVehicle(u, p) { need(isStaff(u)); db.tVehicles = db.tVehicles.filter(x => x.id !== p.id); db.tPrices = db.tPrices.filter(x => x.vid !== p.id); logAct(u, 'Vehicle removed', p.id); },
  saveRoute(u, p) {
    need(isStaff(u)); const origin = str(p.origin, 80), dest = str(p.dest, 80); if (!origin || !dest) fail('Enter the origin and the destination');
    const old = p.id ? db.tRoutes.find(r => r.id === p.id) : null; if (p.id && !old) fail('Route not found');
    const r = { id: old ? old.id : 'r' + nid(), origin, dest, cat: ['AIRPORT', 'INTERCITY', 'ZIYARAT', 'OTHER'].includes(p.cat) ? p.cat : 'OTHER', dur: str(p.dur, 60), km: p.km === '' || p.km == null ? null : ints(p.km, 5000), desc: str(p.desc, 400), notes: str(p.notes, 400), active: p.active !== false && p.active !== 'false', order: ints(p.order, 9999) };
    if (old) Object.assign(old, r); else db.tRoutes.push(r);
    logAct(u, old ? 'Route edited' : 'Route added', origin + ' - ' + dest); return { id: r.id };
  },
  delRoute(u, p) { need(isStaff(u)); db.tRoutes = db.tRoutes.filter(x => x.id !== p.id); db.tPrices = db.tPrices.filter(x => x.rid !== p.id); logAct(u, 'Route removed', p.id); },
  /** one fare = one route in one vehicle. amt 0 removes it (that combination is then not offered). */
  setFare(u, p) {
    need(isStaff(u));
    if (!db.tRoutes.some(r => r.id === p.rid) || !db.tVehicles.some(v => v.id === p.vid)) fail('Route or vehicle not found');
    const amt = ints(p.amt); db.tPrices = db.tPrices.filter(x => !(x.rid === p.rid && x.vid === p.vid));
    if (amt > 0) db.tPrices.push({ rid: p.rid, vid: p.vid, amt, active: true });
  },
  saveCalcSettings(u, p) {
    need(isStaff(u)); const c = db.settings.calc, rate = +p.pkrPerSar;
    if (p.pkrPerSar !== undefined) { if (!(rate >= 0 && rate < 10000)) fail('Enter the PKR value of 1 SAR, e.g. 74.5'); if (rate !== c.pkrPerSar) c.rateUpdated = today(); c.pkrPerSar = Math.round(rate * 1000) / 1000; }
    if (p.flightPkr !== undefined) c.flightPkr = ints(p.flightPkr);
    if (p.terms !== undefined) c.terms = str(p.terms, 1500);
    if (p.tTerms !== undefined) c.tTerms = str(p.tTerms, 1500);
    if (p.publicPrices !== undefined) c.publicPrices = bool(p.publicPrices);
    if (p.publicLeads !== undefined) c.publicLeads = bool(p.publicLeads);
    logAct(u, 'Rates settings saved', 'SAR/PKR ' + c.pkrPerSar);
  }
};

/** public enquiry from the website calculator / transport / group pages -> staff Queries inbox */
function publicLead(p) {
  const c = db.settings.calc; if (c.publicLeads === false) fail('Online enquiries are switched off. Please call the office.');
  const name = str(p.name, 80), phone = str(p.phone, 40).replace(/[^0-9+\-\s()]/g, '');
  if (!name) fail('Enter your name'); if (phone.replace(/\D/g, '').length < 7) fail('Enter a valid phone / WhatsApp number');
  const kind = ['calc', 'transport', 'group', 'hotel', 'visa', 'flight', 'contact', 'offer'].includes(p.kind) ? p.kind : 'calc';
  const type = { transport: 'transport', hotel: 'hotel', visa: 'visa', flight: 'flight' }[kind] || 'package', hrs = db.settings.sla[type] || 24;
  const email = str(p.email, 100), msg = str(p.message, 600);
  const q = { id: 'q' + nid(), no: 'Q-' + token(3).replace(/[^A-Za-z0-9]/g, 'x').toUpperCase().slice(0, 5), type, source: 'website', partyId: null, contact: { name, phone }, text: ('[Website ' + kind + '] ' + str(p.summary, 900) + (msg ? '\nNote: ' + msg : '') + (email ? '\nEmail: ' + email : '')).slice(0, 1200), details: { kind, ref: str(p.ref, 60) }, status: 'Open', createdAt: new Date().toISOString(), dueAt: new Date(Date.now() + hrs * 36e5).toISOString(), by: 'Website', log: [] };
  db.queries.push(q); logAct(null, 'Website enquiry', q.no + ' ' + kind + ' - ' + name);
  require('./mailer').send('lead.new', { subject: 'Website enquiry ' + q.no + ' (' + kind + ') from ' + name, text: name + ' · ' + phone + (email ? ' · ' + email : '') + '\n\n' + q.text, link: '#/queries' });
  return { no: q.no };
}

/** inventory the browser / public pages need. Rates are customer-facing prices, so every role may read them. */
function snapshot() {
  const c = db.settings.calc;
  return {
    hotels: db.hotels.slice().sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    visaTiers: db.visaTiers, tVehicles: db.tVehicles.slice().sort((a, b) => a.order - b.order), tRoutes: db.tRoutes.slice().sort((a, b) => a.order - b.order), tPrices: db.tPrices,
    calc: { pkrPerSar: c.pkrPerSar, flightPkr: c.flightPkr, terms: c.terms, tTerms: c.tTerms, rateUpdated: c.rateUpdated, publicPrices: !!c.publicPrices, publicLeads: c.publicLeads !== false }
  };
}
/** same inventory, only what is bookable (active, priceable) - for public pages */
function publicSnapshot() {
  const s = snapshot();
  s.hotels = s.hotels.filter(h => h.active !== false && E.priceable(h)).map(h => ({ ...h, rooms: h.rooms.filter(r => r.rates.length) }));
  s.tVehicles = s.tVehicles.filter(v => v.active !== false); s.tRoutes = s.tRoutes.filter(r => r.active !== false);
  s.visaTiers = s.visaTiers.filter(t => t.active !== false);
  return s;
}
module.exports = { ops, publicLead, snapshot, publicSnapshot };
