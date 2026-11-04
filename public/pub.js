/* Public pages: group filters, enquiry dialog, calculator, transport booking. Uses Engine (engine.js). */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fnum = n => Math.round(+n || 0).toLocaleString('en-US');
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ---------- enquiry dialog ---------- */
  const dlg = $('#lead'); let leadCtx = null;
  function openLead(kind, summary, ref) {
    if (!dlg) return; leadCtx = { kind, summary, ref }; $('#leadsum').textContent = summary; $('#leaderr').textContent = '';
    $('#leadgo').disabled = false; $('#leadgo').textContent = 'Send enquiry'; dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
  }
  if (dlg) {
    $('#leadx').addEventListener('click', () => dlg.close());
    $('#leadf').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target, b = $('#leadgo'); b.disabled = true; b.textContent = 'Sending…';
      try {
        const r = await fetch('/api/public/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...leadCtx, name: f.name.value, phone: f.phone.value, email: f.email.value, message: f.message.value, website: f.website.value }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not send');
        $('#leadf').innerHTML = '<h2>Thank you</h2><p class="ok">Your enquiry ' + esc(j.no) + ' has been received.</p><p class="mut">Our team will contact you on WhatsApp / phone shortly.</p><div class="ac"><button class="b pri" value="x" onclick="document.getElementById(\'lead\').close()">Close</button></div>';
      } catch (er) { $('#leaderr').textContent = er.message; b.disabled = false; b.textContent = 'Send enquiry'; }
    });
    document.addEventListener('click', e => { const t = e.target.closest('[data-lead]'); if (t) openLead(t.dataset.lead, t.dataset.sum || '', t.dataset.ref || ''); });
  }

  /* ---------- group filters ---------- */
  const gl = $('#glist');
  if (gl && $('#gfilters')) {
    const run = () => {
      const a = $('#fAir').value, m = $('#fMon').value, n = $('#fN').value, s = $('#fSeats').checked; let shown = 0;
      $$('.gc', gl).forEach(c => { const ok = (!a || c.dataset.air === a) && (!m || c.dataset.dep.startsWith(m)) && (!n || c.dataset.n === n) && (!s || !c.querySelector('.st.out')); c.hidden = !ok; if (ok) shown++; });
      $('#gnone').hidden = shown > 0;
    };
    $$('#gfilters select, #gfilters input').forEach(el => el.addEventListener('change', run));
  }

  /* ---------- shared helpers for apps ---------- */
  const app = $('#app'); if (!app || !window.Engine) return;
  const E = window.Engine; let INV = null, ST = null;
  const sar = n => 'SAR ' + fnum(n), pkr = n => 'PKR ' + fnum(n);
  const opt = (list, sel, blank) => (blank ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
  const counter = (k, v, min = 0, max = 99) => '<div class="cnt"><button type="button" data-dec="' + k + '" aria-label="Decrease">−</button><output>' + v + '</output><button type="button" data-inc="' + k + '" aria-label="Increase">+</button></div>';
  const fetchInv = () => fetch('/api/public/inventory').then(r => r.json());

  /* ---------- calculator ---------- */
  function calcInit() {
    const t = todayISO(), mk = INV.hotels.filter(h => h.city === 'MAKKAH'), md = INV.hotels.filter(h => h.city === 'MADINAH');
    ST = { adults: 2, children: 0, infants: 0, visaType: ((INV.visaTiers[0] || {}).type) || '', makkah: { hotelId: '', roomId: '', cin: '', cout: '', rooms: 1 }, madinah: { hotelId: '', roomId: '', cin: '', cout: '', rooms: 1 }, extra: [], transports: [], flight: false, flightPkr: INV.calc.flightPkr || 0, t, mk, md };
  }
  const people = () => ST.adults + ST.children;
  const hotelOf = (city, id) => (city === 'MAKKAH' ? ST.mk : ST.md).find(h => h.id === id);
  function pickHotel(s, city, id) { s.hotelId = id; const h = hotelOf(city, id), r = h && h.rooms[0]; s.roomId = r ? r.id : ''; s.rooms = r ? E.suggestRooms(r.occ, people()) : 1; }
  function stayHtml(label, key, s, city, idx) {
    const hs = city === 'MAKKAH' ? ST.mk : ST.md, h = hotelOf(city, s.hotelId), pre = key + (idx != null ? '.' + idx : '');
    const room = h && h.rooms.find(r => r.id === s.roomId), nights = E.nightsBetween(s.cin, s.cout);
    return '<div class="cd"><h3>' + esc(label) + (idx != null ? ' <button type="button" class="b" style="height:30px;padding:0 10px;float:right" data-rmx="' + idx + '">Remove</button>' : '') + '</h3><div class="g1"><label class="f">Hotel<select data-k="' + pre + '.hotelId">' + opt(hs.map(h => [h.id, h.name + (h.stars ? ' · ' + h.stars + '★' : '') + (h.dist ? ' · ' + h.dist : '')]), s.hotelId, 'Select hotel') + '</select></label>' +
      (h ? '<div class="g2"><label class="f">Room type<select data-k="' + pre + '.roomId">' + opt(h.rooms.map(r => [r.id, r.name + ' (' + (E.occ(r.occ) || {}).label + ')']), s.roomId) + '</select></label><label class="f">Rooms' + counter(pre + '.rooms', s.rooms, 1, 30) + '</label></div>' : '') +
      '<div class="g2"><label class="f">Check-in<input type="date" min="' + ST.t + '" value="' + esc(s.cin) + '" data-k="' + pre + '.cin"></label><label class="f">Check-out<input type="date" min="' + esc(s.cin || ST.t) + '" value="' + esc(s.cout) + '" data-k="' + pre + '.cout"></label></div>' + (nights ? '<p class="hint">' + nights + ' night' + (nights > 1 ? 's' : '') + (room ? ' · ' + esc((E.occ(room.occ) || {}).label) : '') + '</p>' : '') + '</div></div>';
  }
  function trHtml(t, i) {
    const routes = INV.tRoutes.filter(r => E.routeOptions(r.id, INV.tVehicles, INV.tPrices).length), opts = t.routeId ? E.routeOptions(t.routeId, INV.tVehicles, INV.tPrices) : [];
    return '<div class="g1" style="border-top:1px solid var(--line2);padding-top:10px;margin-top:10px"><div class="g2"><label class="f">Route<select data-k="tr.' + i + '.routeId">' + opt(routes.map(r => [r.id, r.origin + ' → ' + r.dest]), t.routeId, 'Select route') + '</select></label>' +
      '<label class="f">Vehicle<select data-k="tr.' + i + '.vehicleId">' + opt(opts.map(o => [o.vehicle.id, o.vehicle.name + ' (' + o.vehicle.cap + ' pax) · ' + sar(o.amt)]), t.vehicleId, 'Select vehicle') + '</select></label></div><div class="g2"><label class="chk"><input type="checkbox" data-k="tr.' + i + '.roundTrip" ' + (t.roundTrip ? 'checked' : '') + '> Return trip</label><button type="button" class="b" data-rmt="' + i + '">Remove transport</button></div></div>';
  }
  function calcRender() {
    const sel = { adults: ST.adults, children: ST.children, infants: ST.infants, visaType: ST.visaType, makkah: ST.makkah, madinah: ST.madinah, extra: ST.extra, transports: ST.transports, flightPkr: ST.flight ? ST.flightPkr : 0 };
    const q = E.priceQuote({ sel, makkah: ST.mk, madinah: ST.md, tiers: INV.visaTiers, rate: INV.calc.pkrPerSar, routes: INV.tRoutes, vehicles: INV.tVehicles, prices: INV.tPrices });
    ST.q = q; const types = [...new Set(INV.visaTiers.map(t => t.type))];
    const tr = INV.tRoutes.some(r => E.routeOptions(r.id, INV.tVehicles, INV.tPrices).length);
    app.innerHTML = '<div class="app"><div class="col"><div class="cd"><h2>Travellers</h2><div class="g3"><label class="f">Adults' + counter('adults', ST.adults) + '</label><label class="f">Children (2–11)' + counter('children', ST.children) + '</label><label class="f">Infants (under 2)' + counter('infants', ST.infants) + '</label></div></div>' +
      '<div class="cd"><h2>Visa</h2><label class="f">Visa option<select data-k="visaType">' + opt([...types.map(t => [t, t]), ['NONE', 'I already have a visa']], ST.visaType) + '</select></label></div>' +
      stayHtml('Makkah hotel', 'makkah', ST.makkah, 'MAKKAH') + stayHtml('Madinah hotel', 'madinah', ST.madinah, 'MADINAH') +
      ST.extra.map((s, i) => stayHtml('Extra stay ' + (i + 1) + ' - ' + (s.city === 'MAKKAH' ? 'Makkah' : 'Madinah'), 'ex', s, s.city, i)).join('') +
      '<div class="ac"><button type="button" class="b" data-addx="MAKKAH">+ Extra Makkah stay</button><button type="button" class="b" data-addx="MADINAH">+ Extra Madinah stay</button></div>' +
      (tr ? '<div class="cd"><h2>Private transport</h2>' + ST.transports.map(trHtml).join('') + '<div class="ac"><button type="button" class="b" data-addt="1">+ Add transport</button></div></div>' : '') +
      '<div class="cd"><h2>Flights</h2><label class="chk"><input type="checkbox" data-k="flight" ' + (ST.flight ? 'checked' : '') + '> Include flights in my quote</label>' + (ST.flight ? '<label class="f" style="margin-top:10px">Budget per person (PKR)<input type="number" min="0" step="1000" value="' + (ST.flightPkr || '') + '" data-k="flightPkr" placeholder="e.g. 140000"></label>' : '') + '</div>' +
      (INV.calc.terms ? '<p class="hint">' + esc(INV.calc.terms) + '</p>' : '') + '</div>' + totHtml(q) + '</div>';
  }
  function totHtml(q) {
    const hasLines = q.lines.length > 0;
    return '<aside class="tot" aria-live="polite"><small>Estimated total</small><div class="big">' + (q.totalPkr ? pkr(q.totalPkr) : '—') + '</div><div class="sub">' + (q.totalSar ? sar(q.totalSar) + ' · ' : '') + (q.perPersonPkr ? pkr(q.perPersonPkr) + ' per person · ' : '') + q.travellers.total + ' traveller' + (q.travellers.total === 1 ? '' : 's') + '</div>' +
      '<div style="margin-top:12px">' + (hasLines ? q.lines.map(l => '<div class="ln"><span>' + esc(l.label) + '<small>' + esc(l.detail || '') + '</small></span><b>' + (q.rate ? pkr(l.pkr) : sar(l.sar)) + '</b></div>').join('') : '<p class="sub">Choose your hotels and dates to see the price build up.</p>') + '</div>' +
      (q.issues.length ? '<ul class="iss">' + q.issues.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '') +
      '<button type="button" class="b pri" data-send="calc"' + (hasLines ? '' : ' disabled') + '>Request this quote</button><p class="sub" style="margin-top:8px;font-size:12px">Estimate only. Availability and final price are confirmed by our team.</p></aside>';
  }
  function calcSummary() {
    const q = ST.q; return 'Calculator quote: ' + q.travellers.adults + 'A ' + q.travellers.children + 'C ' + q.travellers.infants + 'I · ' + [q.makkah, q.madinah, ...q.extras].filter(s => s.hotelName).map(s => s.city + ' ' + s.hotelName + ' ' + s.cin + '→' + s.cout + ' (' + s.roomName + ' x' + s.rooms + ')').join(' | ') + ' · Visa: ' + ST.visaType + ' · Total PKR ' + fnum(q.totalPkr) + ' (SAR ' + fnum(q.totalSar) + ')';
  }
  const setPath = (o, path, v) => { const ks = path.split('.'); let t = o; ks.slice(0, -1).forEach(k => { t = t[k]; }); t[ks[ks.length - 1]] = v; };
  function calcSet(k, v) {
    const ks = k.split('.'), s = ST;
    if (ks[0] === 'tr') { const t = s.transports[+ks[1]]; t[ks[2]] = v; if (ks[2] === 'routeId') { t.vehicleId = ''; const sv = E.suggestVehicle(E.routeOptions(v, INV.tVehicles, INV.tPrices), people() + s.infants); t.vehicleId = sv ? sv.id : ''; } return; }
    const stay = ks[0] === 'makkah' ? s.makkah : ks[0] === 'madinah' ? s.madinah : ks[0] === 'ex' ? s.extra[+ks[1]] : null;
    if (stay) {
      const f = ks[ks.length - 1], city = ks[0] === 'makkah' ? 'MAKKAH' : ks[0] === 'madinah' ? 'MADINAH' : stay.city;
      if (f === 'hotelId') pickHotel(stay, city, v);
      else if (f === 'roomId') { stay.roomId = v; const h = hotelOf(city, stay.hotelId), r = h && h.rooms.find(x => x.id === v); stay.rooms = r ? E.suggestRooms(r.occ, people()) : 1; }
      else stay[f] = f === 'rooms' ? +v : v;
      if (ks[0] === 'makkah' && f === 'cout') s.madinah.cin = v; // first-sector continuity
      if (f === 'cin' && stay.cout && stay.cout <= v) stay.cout = '';
      return;
    }
    s[k] = (k === 'flightPkr') ? +v || 0 : (k === 'flight') ? !!v : v;
  }
  function calcBind() {
    app.addEventListener('change', e => { const t = e.target.closest('[data-k]'); if (!t) return; calcSet(t.dataset.k, t.type === 'checkbox' ? t.checked : t.value); calcRender(); });
    app.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.inc || t.dataset.dec) {
        const k = t.dataset.inc || t.dataset.dec, d = t.dataset.inc ? 1 : -1;
        if (/^(adults|children|infants)$/.test(k)) { ST[k] = Math.max(k === 'adults' ? 1 : 0, Math.min(60, ST[k] + d)); [ST.makkah, ST.madinah, ...ST.extra].forEach(s => { const h = hotelOf(s.city || (s === ST.madinah ? 'MADINAH' : 'MAKKAH'), s.hotelId), r = h && h.rooms.find(x => x.id === s.roomId); if (r) s.rooms = E.suggestRooms(r.occ, people()); }); }
        else { const cur = k.split('.').reduce((o, p) => o[p], ST); calcSet(k, Math.max(1, Math.min(30, cur + d))); }
        calcRender();
      } else if (t.dataset.addx) { ST.extra.push({ city: t.dataset.addx, hotelId: '', roomId: '', cin: '', cout: '', rooms: 1 }); calcRender(); }
      else if (t.dataset.rmx) { ST.extra.splice(+t.dataset.rmx, 1); calcRender(); }
      else if (t.dataset.addt) { ST.transports.push({ routeId: '', vehicleId: '', roundTrip: false, count: 1 }); calcRender(); }
      else if (t.dataset.rmt) { ST.transports.splice(+t.dataset.rmt, 1); calcRender(); }
      else if (t.dataset.send) openLead('calc', calcSummary(), '');
    });
  }

  /* ---------- transport ---------- */
  const CATS = { AIRPORT: 'Airport transfers', INTERCITY: 'Intercity', ZIYARAT: 'Ziyarat', OTHER: 'Other' };
  function trInit() {
    const routes = INV.tRoutes.filter(r => E.routeOptions(r.id, INV.tVehicles, INV.tPrices).length);
    ST = { routes, routeId: '', vehicleId: '', pax: 2, date: '', time: '', round: false, rdate: '', rtime: '', pickup: '', drop: '', flight: '', t: todayISO() };
  }
  function trRender() {
    const rate = INV.calc.pkrPerSar, r = ST.routes.find(x => x.id === ST.routeId), opts = r ? E.routeOptions(r.id, INV.tVehicles, INV.tPrices) : [], maxCap = Math.max(1, ...opts.map(o => o.vehicle.cap));
    if (r && !opts.some(o => o.vehicle.id === ST.vehicleId)) { const sv = E.suggestVehicle(opts, ST.pax); ST.vehicleId = sv ? sv.id : ''; }
    const o = opts.find(x => x.vehicle.id === ST.vehicleId), q = o ? E.transportQuote(o, ST.pax, ST.round) : null;
    const groups = {}; ST.routes.forEach(x => { (groups[x.cat] = groups[x.cat] || []).push(x); });
    const dateOk = ST.date && ST.date >= ST.t, retOk = !ST.round || (ST.rdate && ST.rdate >= ST.date);
    ST.q = q; ST.o = o; ST.r = r;
    app.innerHTML = '<div class="app"><div class="col"><div class="cd"><h2>Route</h2><label class="f">Where are you travelling?<select data-k="routeId"><option value="">Select route</option>' + Object.keys(groups).map(c => '<optgroup label="' + esc(CATS[c] || c) + '">' + opt(groups[c].map(x => [x.id, x.origin + ' → ' + x.dest + (x.dur ? ' (' + x.dur + ')' : '')]), ST.routeId) + '</optgroup>').join('') + '</select></label>' + (r && (r.desc || r.notes) ? '<p class="hint" style="margin-top:8px">' + esc(r.desc || '') + ' ' + esc(r.notes || '') + '</p>' : '') + '</div>' +
      (r ? '<div class="cd"><h2>Passengers & vehicle</h2><label class="f" style="max-width:220px">Passengers' + counter('pax', ST.pax, 1, 60) + '</label><div class="vh" style="margin-top:12px">' + opts.map(x => { const qq = E.transportQuote(x, ST.pax, false); return '<button type="button" class="vc" data-veh="' + x.vehicle.id + '" aria-pressed="' + (x.vehicle.id === ST.vehicleId) + '">' + (x.vehicle.img ? '<img src="' + esc(x.vehicle.img) + '" alt="' + esc(x.vehicle.name) + '" loading="lazy">' : '') + '<b>' + esc(x.vehicle.name) + '</b><small>Up to ' + x.vehicle.cap + ' passengers' + (x.vehicle.lug ? ' · ' + x.vehicle.lug + ' bags' : '') + '</small><br><em>' + sar(qq.perLeg) + '</em>' + (qq.extraPassengers ? '<small> incl. ' + qq.extraPassengers + ' extra pax</small>' : '') + (ST.pax > x.vehicle.cap ? '<br><small style="color:var(--red)">Too small for ' + ST.pax + '</small>' : '') + '</button>'; }).join('') + '</div></div>' +
        '<div class="cd"><h2>Journey details</h2><div class="g2"><label class="f">Date<input type="date" min="' + ST.t + '" value="' + esc(ST.date) + '" data-k="date"></label><label class="f">Pick-up time<input type="time" value="' + esc(ST.time) + '" data-k="time"></label></div><label class="chk" style="margin:12px 0"><input type="checkbox" data-k="round" ' + (ST.round ? 'checked' : '') + '> Add return trip (' + esc(r.dest) + ' → ' + esc(r.origin) + ')</label>' + (ST.round ? '<div class="g2"><label class="f">Return date<input type="date" min="' + esc(ST.date || ST.t) + '" value="' + esc(ST.rdate) + '" data-k="rdate"></label><label class="f">Return time<input type="time" value="' + esc(ST.rtime) + '" data-k="rtime"></label></div>' : '') + '<div class="g2" style="margin-top:12px"><label class="f">Pick-up location<input value="' + esc(ST.pickup) + '" data-k="pickup" placeholder="Hotel / terminal"></label><label class="f">Drop-off location<input value="' + esc(ST.drop) + '" data-k="drop" placeholder="Hotel name"></label></div>' + (r.cat === 'AIRPORT' ? '<label class="f" style="margin-top:12px">Flight number (optional)<input value="' + esc(ST.flight) + '" data-k="flight" placeholder="e.g. SV 727"></label>' : '') + '</div>' : '') +
      (INV.calc.tTerms ? '<p class="hint">' + esc(INV.calc.tTerms) + '</p>' : '') + '</div>' +
      '<aside class="tot" aria-live="polite"><small>Transport fare</small><div class="big">' + (q ? (rate ? pkr(q.total * rate) : sar(q.total)) : '—') + '</div><div class="sub">' + (q ? sar(q.total) + (q.legs > 1 ? ' · return included' : '') : 'Choose a route and vehicle') + '</div>' +
      (q ? '<div style="margin-top:12px"><div class="ln"><span>' + esc(r.origin) + ' → ' + esc(r.dest) + '<small>' + esc(o.vehicle.name) + ' · ' + ST.pax + ' pax</small></span><b>' + sar(q.base) + '</b></div>' + (q.extraCharge ? '<div class="ln"><span>Extra passengers<small>' + q.extraPassengers + ' x ' + o.vehicle.chg + ' SAR</small></span><b>' + sar(q.extraCharge) + '</b></div>' : '') + (q.legs > 1 ? '<div class="ln"><span>Return trip<small>same fare</small></span><b>' + sar(q.perLeg) + '</b></div>' : '') + '</div>' : '') +
      (q && ST.pax > o.vehicle.cap ? '<ul class="iss"><li>This vehicle carries ' + o.vehicle.cap + '. Choose a larger vehicle or send an enquiry for two vehicles.</li></ul>' : '') +
      '<button type="button" class="b pri" data-send="transport"' + (q && dateOk && retOk ? '' : ' disabled') + '>Request this booking</button>' + (q && !dateOk ? '<p class="sub" style="margin-top:8px;font-size:12px">Pick a travel date to continue.</p>' : '') + '</aside></div>';
  }
  function trBind() {
    app.addEventListener('change', e => { const t = e.target.closest('[data-k]'); if (!t) return; const k = t.dataset.k, v = t.type === 'checkbox' ? t.checked : t.value; ST[k] = v; if (k === 'routeId') ST.vehicleId = ''; trRender(); });
    app.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.veh) { ST.vehicleId = t.dataset.veh; trRender(); }
      else if (t.dataset.inc || t.dataset.dec) { ST.pax = Math.max(1, Math.min(60, ST.pax + (t.dataset.inc ? 1 : -1))); ST.vehicleId = ''; trRender(); }
      else if (t.dataset.send) {
        const r = ST.r, o = ST.o, q = ST.q;
        openLead('transport', 'Transport: ' + r.origin + ' → ' + r.dest + ' · ' + o.vehicle.name + ' · ' + ST.pax + ' pax · ' + ST.date + (ST.time ? ' ' + ST.time : '') + (ST.round ? ' · return ' + ST.rdate + (ST.rtime ? ' ' + ST.rtime : '') : '') + (ST.pickup ? ' · from ' + ST.pickup : '') + (ST.drop ? ' · to ' + ST.drop : '') + (ST.flight ? ' · flight ' + ST.flight : '') + ' · SAR ' + fnum(q.total), r.id);
      }
    });
  }

  fetchInv().then(inv => {
    INV = inv; const kind = app.dataset.app;
    if (kind === 'calc') { calcInit(); calcBind(); calcRender(); } else if (kind === 'transport') { trInit(); trBind(); trRender(); }
  }).catch(() => { app.innerHTML = '<div class="em"><h2>Could not load</h2><p>Please refresh the page or contact us on WhatsApp.</p></div>'; });
})();
