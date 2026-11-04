/* The Umrah Store - shared pricing engine (calculator + transport + airlines).
   Ported from the-umrah-store (src/lib/calculator/pricing.ts, src/lib/transport/types.ts).
   Pure functions: no DOM, no database. Runs in the browser, on public pages and in Node (server + tests). */
(function (root) {
  'use strict';
  const OCC = [
    { v: 'SINGLE', label: 'Single', short: 'SGL', guests: 1 },
    { v: 'DOUBLE', label: 'Double', short: 'DBL', guests: 2 },
    { v: 'TRIPLE', label: 'Triple', short: 'TPL', guests: 3 },
    { v: 'QUAD', label: 'Quad', short: 'QD', guests: 4 },
    { v: 'QUINT', label: 'Quint', short: 'QNT', guests: 5 },
    { v: 'SHARING', label: 'Sharing (per bed)', short: 'SHR', guests: null }
  ];
  const occ = v => OCC.find(o => o.v === v);
  const round = n => Math.round(+n || 0);
  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  /** Whole nights between two ISO dates. Invalid or reversed ranges give 0. */
  function nightsBetween(a, b) {
    if (!ISO.test(a || '') || !ISO.test(b || '')) return 0;
    const n = Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
    return n > 0 ? n : 0;
  }
  const addDaysISO = (iso, n) => { const d = new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5); return d.toISOString().slice(0, 10); };

  /** The rate that applies on the check-in date. A dated period wins (newest start first); a rate with no dates is the standing fallback. */
  function rateForDate(room, checkIn) {
    if (!room || !checkIn) return null;
    const d = String(checkIn).slice(0, 10), rates = (room.rates || []).filter(r => +r.amt > 0);
    const dated = rates.filter(r => (r.start || r.end) && (!r.start || d >= r.start) && (!r.end || d <= r.end)).sort((a, b) => (b.start || '0000-01-01').localeCompare(a.start || '0000-01-01'));
    return dated[0] || rates.find(r => !r.start && !r.end) || null;
  }
  /** Rooms needed as a starting suggestion. */
  function suggestRooms(occupancy, people) {
    const g = (occ(occupancy) || {}).guests;
    return !g ? 1 : Math.max(1, Math.ceil((people || 1) / g));
  }
  /** Visa tier covering a group of this size and type. */
  const visaTierFor = (tiers, pax, type) => (tiers || []).find(t => t.active !== false && t.type === type && pax >= t.min && (t.max == null || pax <= t.max)) || null;

  /** Does this hotel have at least one room with a usable rate? */
  const priceable = h => (h.rooms || []).some(r => (r.rates || []).some(x => +x.amt > 0));

  function priceStay(label, hotels, sel, people, issues) {
    const empty = { city: label, hotelName: null, roomName: null, occupancy: null, nights: 0, rooms: sel.rooms || 1, nightly: null, rateLabel: null, cin: sel.cin, cout: sel.cout, sar: 0 };
    const hotel = (hotels || []).find(h => h.id === sel.hotelId);
    if (!hotel) { issues.push('Choose a ' + label + ' hotel.'); return empty; }
    const room = (hotel.rooms || []).find(r => r.id === sel.roomId);
    if (!room) { issues.push('Choose a room type for ' + hotel.name + '.'); return { ...empty, hotelName: hotel.name }; }
    const nights = nightsBetween(sel.cin, sel.cout);
    if (!sel.cin || !sel.cout) issues.push('Set ' + label + ' check-in and check-out dates.');
    else if (nights < 1) issues.push(label + ' check-out must be after check-in.');
    const rate = rateForDate(room, sel.cin);
    if (!rate && sel.cin) issues.push(hotel.name + ' has no published rate for those dates - request a manual quote.');
    const meta = occ(room.occ), per = meta ? meta.guests : null, rooms = Math.max(1, sel.rooms || 1);
    const units = per === null ? people : rooms;
    const sar = rate && nights > 0 ? rate.amt * nights * units : 0;
    if (per !== null && rooms * per < people) issues.push(rooms + ' x ' + (meta ? meta.label : room.occ) + ' in ' + label + ' sleeps ' + rooms * per + ', but ' + people + ' need beds.');
    return { city: label, hotelName: hotel.name, hotelId: hotel.id, stars: hotel.stars || 0, dist: hotel.dist || '', roomName: room.name, occupancy: room.occ, nights, rooms, units, perRoom: per, nightly: rate ? rate.amt : null, rateLabel: rate ? rate.label || '' : null, cin: sel.cin, cout: sel.cout, sar: round(sar) };
  }

  /** Transport price for one route + vehicle + passengers (+ optional return leg). */
  function transportQuote(opt, pax, roundTrip) {
    if (!opt || !opt.vehicle) return null;
    const v = opt.vehicle, thr = v.thr, chg = v.chg;
    const extra = thr != null && chg != null && thr !== '' && chg !== '' && pax > +thr ? pax - +thr : 0;
    const extraCharge = extra * (+chg || 0), one = (+opt.amt || 0) + extraCharge, legs = roundTrip ? 2 : 1;
    return { base: +opt.amt || 0, extraPassengers: extra, extraCharge, perLeg: one, legs, total: one * legs };
  }
  /** Vehicles priced for one route (only active price rows exist as options). */
  function routeOptions(routeId, vehicles, prices) {
    return (prices || []).filter(p => p.rid === routeId && p.active !== false && +p.amt > 0).map(p => ({ vehicle: (vehicles || []).find(v => v.id === p.vid && v.active !== false), amt: +p.amt })).filter(o => o.vehicle).sort((a, b) => (a.vehicle.order || 0) - (b.vehicle.order || 0) || a.amt - b.amt);
  }
  /** Smallest vehicle that fits the group (falls back to the largest). */
  function suggestVehicle(options, pax) {
    const fit = options.filter(o => o.vehicle.cap >= pax).sort((a, b) => a.amt - b.amt || a.vehicle.cap - b.vehicle.cap);
    return (fit[0] || options.slice().sort((a, b) => b.vehicle.cap - a.vehicle.cap)[0] || {}).vehicle || null;
  }

  /** The whole quote. input: {sel, makkah, madinah, tiers, rate (PKR per SAR), routes, vehicles, prices} */
  function priceQuote(input) {
    const sel = input.sel, issues = [], rate = +input.rate || 0;
    const adults = Math.max(0, +sel.adults || 0), children = Math.max(0, +sel.children || 0), infants = Math.max(0, +sel.infants || 0);
    const total = adults + children + infants, billable = adults + children;
    if (total < 1) issues.push('Add at least one traveller.');
    if (billable < 1 && total > 0) issues.push('An infant cannot travel without an adult.');
    const mk = priceStay('Makkah', input.makkah, sel.makkah, billable, issues);
    const md = priceStay('Madinah', input.madinah, sel.madinah, billable, issues);
    if (sel.makkah.cout && sel.madinah.cin && sel.makkah.cout !== sel.madinah.cin) issues.push('Madinah check-in must be the same day you leave Makkah (' + sel.makkah.cout + ').');
    const extras = (sel.extra || []).map((s, i) => priceStay((s.city === 'MAKKAH' ? 'Makkah' : 'Madinah') + ' (extra stay ' + (i + 1) + ')', s.city === 'MAKKAH' ? input.makkah : input.madinah, s, billable, issues));
    const toPkr = sar => (rate ? round(sar * rate) : 0), lines = [];
    // visa
    const tiers = input.tiers || [], vt = sel.visaType, tier = visaTierFor(tiers, total, vt);
    if (!tiers.length) issues.push('Visa pricing has not been published yet.');
    else if (!vt) issues.push('Choose a visa option.');
    else if (vt === 'NONE') { /* visa not required */ }
    else if (!tier) issues.push('No "' + vt + '" rate is published for a group of ' + total + '.');
    else lines.push({ id: 'visa', kind: 'visa', label: vt, detail: total + ' x ' + tier.amt + ' SAR' + (tier.label ? ' (' + tier.label + ')' : ''), qty: total, unitSar: tier.amt, sar: tier.amt * total, pkr: toPkr(tier.amt * total) });
    // hotels
    [['mk', mk], ['md', md], ...extras.map((e, i) => ['ex' + i, e])].forEach(([k, s]) => {
      if (s.sar <= 0) return;
      const word = s.perRoom === null ? 'traveller' : 'room';
      lines.push({ id: k, kind: 'hotel', label: s.city + ' - ' + s.hotelName, detail: s.units + ' ' + word + (s.units === 1 ? '' : 's') + ' x ' + s.nights + ' night' + (s.nights === 1 ? '' : 's') + ' x ' + s.nightly + ' SAR' + (s.rateLabel ? ' (' + s.rateLabel + ')' : ''), qty: s.units, unitSar: s.nightly, sar: s.sar, pkr: toPkr(s.sar), stay: s });
    });
    // transport legs
    const tr = [];
    (sel.transports || []).forEach((t, i) => {
      if (!t.routeId) return;
      const route = (input.routes || []).find(r => r.id === t.routeId); if (!route) return;
      const opts = routeOptions(t.routeId, input.vehicles, input.prices), opt = opts.find(o => o.vehicle.id === t.vehicleId);
      if (!opt) { issues.push('Choose a vehicle for ' + route.origin + ' to ' + route.dest + '.'); return; }
      const vehicles = Math.max(1, +t.count || 1), perVeh = Math.ceil(total / vehicles);
      if (opt.vehicle.cap && perVeh > opt.vehicle.cap) issues.push(vehicles + ' x ' + opt.vehicle.name + ' carries ' + vehicles * opt.vehicle.cap + ', but there are ' + total + ' travellers.');
      const q = transportQuote(opt, perVeh, !!t.roundTrip), sar = q.total * vehicles;
      tr.push({ route, vehicle: opt.vehicle, q, vehicles });
      lines.push({ id: 'tr' + i, kind: 'transport', label: route.origin + ' to ' + route.dest, detail: vehicles + ' x ' + opt.vehicle.name + (t.roundTrip ? ' (return)' : '') + ' x ' + q.perLeg + ' SAR' + (t.roundTrip ? ' x 2' : '') + (q.extraPassengers ? ', incl. ' + q.extraPassengers + ' extra pax' : ''), qty: vehicles, unitSar: q.perLeg, sar, pkr: toPkr(sar) });
    });
    // flights (PKR per person)
    const fl = +sel.flightPkr || 0;
    if (fl > 0) lines.push({ id: 'flight', kind: 'flight', label: 'Flights', detail: total + ' x ' + fl.toLocaleString('en-US') + ' PKR', qty: total, unitSar: rate ? fl / rate : 0, sar: rate ? round(fl * total / rate) : 0, pkr: fl * total });
    if (!rate) issues.push('The SAR to PKR rate has not been set yet - set it in Settings > Rates, so a rupee total can be shown.');
    const totalSar = lines.reduce((a, l) => a + l.sar, 0), totalPkr = lines.reduce((a, l) => a + l.pkr, 0);
    return { ok: !issues.length && lines.length > 0, issues, travellers: { adults, children, infants, total, billable }, makkah: mk, madinah: md, extras, transports: tr, lines, rate, totalSar: round(totalSar), totalPkr: round(totalPkr), perPersonPkr: total ? round(totalPkr / total) : 0 };
  }

  /** Margin on a PKR total. type '%' = percent of total, 'PKR' = per traveller. */
  function withMargin(totalPkr, heads, type, value) {
    const m = type === '%' ? totalPkr * (+value || 0) / 100 : (+value || 0) * heads;
    return { margin: round(m), total: round(totalPkr + m), per: heads ? round((totalPkr + m) / heads) : 0 };
  }

  /* ---- airlines: brand colour for the fallback badge + logo URL (cached by the server) ---- */
  const AIR = { SV: ['Saudia', '#0a6b3d'], PK: ['PIA', '#00693c'], EK: ['Emirates', '#d71920'], QR: ['Qatar Airways', '#5c0632'], EY: ['Etihad Airways', '#b8903b'], TK: ['Turkish Airlines', '#c8102e'], WY: ['Oman Air', '#8f1b2c'], GF: ['Gulf Air', '#a87c3a'], KU: ['Kuwait Airways', '#00629b'], SQ: ['Singapore Airlines', '#f0a30a'], ER: ['SereneAir', '#0a4a8a'], PA: ['AirBlue', '#0b3d91'], '9P': ['Fly Jinnah', '#a4123f'], XY: ['flynas', '#00a0df'], F3: ['flyadeal', '#e6007e'], FZ: ['flydubai', '#e2231a'], G9: ['Air Arabia', '#d7282f'], J9: ['Jazeera Airways', '#f58220'], MS: ['EgyptAir', '#00226b'], AI: ['Air India', '#e03a3e'], MH: ['Malaysia Airlines', '#c8102e'], TG: ['Thai Airways', '#5b2c83'], BG: ['Biman', '#00844e'], UL: ['SriLankan', '#00467f'], RJ: ['Royal Jordanian', '#a6192e'], ET: ['Ethiopian', '#009a49'] };
  const airName = (code, fallback) => (AIR[String(code || '').toUpperCase()] || [fallback || code || ''])[0];
  const airColor = code => (AIR[String(code || '').toUpperCase()] || [0, '#126047'])[1];
  const airLogo = code => /^[A-Z0-9]{2}$/i.test(code || '') ? '/brand/airline/' + String(code).toUpperCase() + '.png' : '';

  const api = { OCC, occ, nightsBetween, addDaysISO, rateForDate, suggestRooms, visaTierFor, priceable, priceStay, priceQuote, withMargin, transportQuote, routeOptions, suggestVehicle, AIR, airName, airColor, airLogo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
