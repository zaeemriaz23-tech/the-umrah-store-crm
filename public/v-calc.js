/* Umrah package calculator: hotel-based quote (store engine) + group-package quote. Margin, share, booking. */
'use strict';
const E = Engine;
const CITY = { MAKKAH: 'Makkah', MADINAH: 'Madinah' };
/* ---------- state ---------- */
const H0 = () => ({ adults: 2, children: 0, infants: 0, visaType: '', makkah: { hotelId: '', roomId: '', cin: '', cout: '', rooms: 1 }, madinah: { hotelId: '', roomId: '', cin: '', cout: '', rooms: 1 }, extra: [], transports: [], flight: false, flightPkr: 0, mt: '%', mv: 0, party: '' });
const hc = () => UI.hc || (UI.hc = (() => { const s = H0(), I = inv(); s.visaType = (I.visaTiers.find(t => t.active !== false) || {}).type || ''; s.flightPkr = I.calc.flightPkr || 0; return s; })());
const C0 = () => ({ gid: '', pid: '', n: { sh: 0, qd: 0, tr: 0, db: 0 }, u: { sh: 0, qd: 0, tr: 0, db: 0 }, inf: 0, infp: 0, visa: 0, trans: 0, extras: [], mt: '%', mv: 0 });
const cc = () => UI.calc || (UI.calc = C0());
const calcMode = () => UI.calcMode || (inv().hotels.length ? 'hotel' : 'group');
const hotelsOf = city => inv().hotels.filter(h => h.city === city && h.active !== false && E.priceable(h));
const hOf = (city, id) => hotelsOf(city).find(h => h.id === id);
const heads = s => s.adults + s.children;
const numF = v => Math.max(0, +v || 0);

/* ---------- hotel-mode engine glue ---------- */
function hQuote() {
  const s = hc(), I = inv(), sel = { ...s, flightPkr: s.flight ? s.flightPkr : 0 };
  const q = E.priceQuote({ sel, makkah: hotelsOf('MAKKAH'), madinah: hotelsOf('MADINAH'), tiers: I.visaTiers.filter(t => t.active !== false), rate: I.calc.pkrPerSar, routes: I.tRoutes.filter(r => r.active !== false), vehicles: I.tVehicles, prices: I.tPrices });
  q.m = E.withMargin(q.totalPkr, q.travellers.total, s.mt, s.mv); return q;
}
function hText(q) {
  const s = hc(), co = (S.company || {}).name || 'The Umrah Store';
  const st = [q.makkah, q.madinah, ...q.extras].filter(x => x.hotelName).map(x => `${x.city}: ${x.hotelName}${x.stars ? ' ' + x.stars + '★' : ''} · ${x.roomName} x${x.rooms} · ${fdate(x.cin)} to ${fdate(x.cout)} (${x.nights}N)`);
  return `*${co} - Umrah package quote*\n${q.travellers.adults} adult(s)${q.travellers.children ? ', ' + q.travellers.children + ' child(ren)' : ''}${q.travellers.infants ? ', ' + q.travellers.infants + ' infant(s)' : ''}\n${st.join('\n')}${s.visaType && s.visaType !== 'NONE' ? '\nVisa: ' + s.visaType : ''}${q.transports.map(t => '\nTransport: ' + t.route.origin + ' to ' + t.route.dest + ' · ' + t.vehicles + ' x ' + t.vehicle.name + (t.q.legs > 1 ? ' (return)' : '')).join('')}${s.flight ? '\nFlights included' : ''}\n\n*Total: PKR ${fnum(q.m.total)}*\nPer person: PKR ${fnum(q.m.per)}\n\nPrices are indicative and subject to availability.`;
}
const lineRows = (q, factor = 1) => q.lines.map(l => `<div class="row sb"><span>${esc(l.label)}<span class="sub" style="display:block">${esc(l.detail || '')}</span></span><b class="num">${fnum(l.pkr * factor)}</b></div>`).join('');
function hOut() {
  const q = hQuote(), has = q.lines.length, f = q.totalPkr ? q.m.total / q.totalPkr : 1; UI.calcTxt = has ? hText(q) : '';
  return `<div class="stat card hot"><div class="l">Total quote</div><div class="v">${q.totalPkr ? fmt(q.m.total) : '—'}</div><div class="s">${q.travellers.total} traveller(s) · ${q.totalPkr ? fmt(q.m.per) + ' per person' : 'complete the form to price'}${q.totalSar ? ' · SAR ' + fnum(q.totalSar) : ''}</div></div>
  <div class="card cp" style="margin-top:12px">${has ? lineRows(q) + `<div class="row sb" style="border-top:1px solid var(--line);margin-top:8px;padding-top:8px"><span>Subtotal</span><b class="num">${fnum(q.totalPkr)}</b></div>${q.m.margin ? `<div class="row sb"><span>Margin</span><b class="num">${fnum(q.m.margin)}</b></div>` : ''}` : '<div class="mute">Choose hotels, dates and a visa option to build the quote.</div>'}</div>
  ${q.issues.length ? `<div class="warnbox" style="margin-top:12px"><ul>${q.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>` : ''}
  <div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn" data-act="calcCopy" ${has ? '' : 'disabled'}>${ic('copy', 'sm')}Copy</button><a class="btn wa" target="_blank" rel="noopener" href="${has ? waLinkTo(UI.calcTxt) : '#'}">${ic('wa', 'sm')}WhatsApp</a><button class="btn" data-act="calcPrint" ${has ? '' : 'disabled'}>${ic('print', 'sm')}Print</button>${has ? `<button class="btn pri" data-act="hcBook">${ic('plus', 'sm')}Create booking</button>` : ''}${has && isAgent() ? `<button class="btn" data-act="hcQuery">${ic('bell', 'sm')}Ask office to confirm</button>` : ''}</div>`;
}
const cnt = (k, v, min = 0) => `<div class="cnt"><button type="button" data-act="hcStep" data-a="${k}|-1|${min}" aria-label="Decrease">−</button><output>${v}</output><button type="button" data-act="hcStep" data-a="${k}|1|${min}" aria-label="Increase">+</button></div>`;
function stayCard(label, key, s, city, idx) {
  const hs = hotelsOf(city), h = hOf(city, s.hotelId), room = h && h.rooms.find(r => r.id === s.roomId), n = E.nightsBetween(s.cin, s.cout), p = key + (idx != null ? '.' + idx : '');
  const rate = room && s.cin ? E.rateForDate(room, s.cin) : null;
  return `<div class="card cp"><div class="row sb"><div class="sec" style="margin:0">${esc(label)}</div>${idx != null ? `<button class="btn sm ghost" data-act="hcRmx" data-a="${idx}">${ic('trash', 'sm')}Remove</button>` : ''}</div><div class="g1" style="margin-top:10px">${fld('Hotel', `<select data-chg="hcSet" data-k="${p}.hotelId">${opts(hs.map(x => [x.id, x.name + (x.stars ? ' · ' + x.stars + '★' : '') + (x.dist ? ' · ' + x.dist : '')]), s.hotelId, hs.length ? 'Select hotel' : 'No ' + CITY[city] + ' hotels with rates yet')}</select>`)}
  ${h ? `<div class="g2">${fld('Room type', `<select data-chg="hcSet" data-k="${p}.roomId">${opts(h.rooms.filter(r => r.rates.length).map(r => [r.id, r.name + ' (' + (E.occ(r.occ) || {}).label + ')']), s.roomId)}</select>`)}${fld('Rooms', cnt(p + '.rooms', s.rooms, 1))}</div>` : ''}
  <div class="g2">${fld('Check-in', `<input type="date" value="${esc(s.cin)}" data-chg="hcSet" data-k="${p}.cin">`)}${fld('Check-out', `<input type="date" min="${esc(s.cin)}" value="${esc(s.cout)}" data-chg="hcSet" data-k="${p}.cout">`)}</div>
  ${n ? `<div class="hint">${n} night${n > 1 ? 's' : ''}${rate ? ` · SAR ${fnum(rate.amt)}/night${rate.label ? ' (' + esc(rate.label) + ')' : ''}` : ''}</div>` : ''}</div></div>`;
}
function trCard(t, i) {
  const I = inv(), routes = I.tRoutes.filter(r => r.active !== false && E.routeOptions(r.id, I.tVehicles, I.tPrices).length), opt = t.routeId ? E.routeOptions(t.routeId, I.tVehicles, I.tPrices) : [];
  return `<div class="g3" style="margin-top:10px;align-items:end">${fld('Route', `<select data-chg="hcSet" data-k="tr.${i}.routeId">${opts(routes.map(r => [r.id, r.origin + ' → ' + r.dest]), t.routeId, 'Select route')}</select>`)}${fld('Vehicle', `<select data-chg="hcSet" data-k="tr.${i}.vehicleId">${opts(opt.map(o => [o.vehicle.id, o.vehicle.name + ' (' + o.vehicle.cap + ') · SAR ' + fnum(o.amt)]), t.vehicleId, 'Select vehicle')}</select>`)}<div class="row"><label class="chk"><input type="checkbox" ${t.roundTrip ? 'checked' : ''} data-chg="hcSet" data-k="tr.${i}.roundTrip">Return</label><button class="btn sm ghost" data-act="hcRmt" data-a="${i}">${ic('trash', 'sm')}</button></div></div>`;
}
function hcForm() {
  const s = hc(), I = inv(), types = uniq(I.visaTiers.filter(t => t.active !== false).map(t => t.type)), hasTr = I.tRoutes.some(r => r.active !== false && E.routeOptions(r.id, I.tVehicles, I.tPrices).length);
  const setup = !hotelsOf('MAKKAH').length && !hotelsOf('MADINAH').length;
  return `${setup ? `<div class="warnbox" style="margin-bottom:14px">No hotel rates have been entered yet. ${isStaff() ? '<a href="#/rates">Add hotels and rates</a> to use the hotel calculator.' : 'Ask the office to publish hotel rates.'}</div>` : ''}
  ${!I.calc.pkrPerSar ? `<div class="warnbox" style="margin-bottom:14px">SAR → PKR rate is not set. ${isStaff() ? '<a href="#/rates">Set it in Rates & inventory</a>.' : ''}</div>` : ''}
  <div class="card cp"><div class="sec">Travellers & visa</div><div class="g4">${fld('Adults', cnt('adults', s.adults, 1))}${fld('Children (2–11)', cnt('children', s.children))}${fld('Infants (<2)', cnt('infants', s.infants))}${fld('Visa', `<select data-chg="hcSet" data-k="visaType">${opts([...types.map(t => [t, t]), ['NONE', 'Visa not needed']], s.visaType, types.length ? null : 'No visa pricing yet')}</select>`)}</div></div><div class="gap"></div>
  ${stayCard('Makkah hotel', 'makkah', s.makkah, 'MAKKAH')}<div class="gap"></div>${stayCard('Madinah hotel', 'madinah', s.madinah, 'MADINAH')}
  ${s.extra.map((x, i) => `<div class="gap"></div>${stayCard('Extra stay ' + (i + 1) + ' · ' + CITY[x.city], 'ex', x, x.city, i)}`).join('')}
  <div class="row" style="margin:10px 0"><button class="btn sm" data-act="hcAddx" data-a="MAKKAH">${ic('plus', 'sm')}Extra Makkah stay</button><button class="btn sm" data-act="hcAddx" data-a="MADINAH">${ic('plus', 'sm')}Extra Madinah stay</button></div>
  ${hasTr ? `<div class="card cp"><div class="row sb"><div class="sec" style="margin:0">Private transport</div><button class="btn sm" data-act="hcAddt">${ic('plus', 'sm')}Add transport</button></div>${s.transports.map(trCard).join('') || '<div class="hint" style="margin-top:8px">Airport transfers, Makkah ↔ Madinah, ziyarat. Fares come from Rates & inventory.</div>'}</div><div class="gap"></div>` : ''}
  <div class="card cp"><div class="g3" style="align-items:end"><label class="chk"><input type="checkbox" ${s.flight ? 'checked' : ''} data-chg="hcSet" data-k="flight">Include flights</label>${s.flight ? fld('Flight per person (PKR)', `<input type="number" min="0" value="${s.flightPkr || ''}" data-inp="hcNum" data-k="flightPkr">`) : '<span></span>'}<span></span></div></div><div class="gap"></div>
  <div class="card cp"><div class="sec">Margin</div><div class="g2">${fld('Type', `<select data-chg="hcSet" data-k="mt">${opts([['%', 'Percent of total'], ['PKR', 'PKR per traveller']], s.mt)}</select>`)}${fld('Value', `<input type="number" min="0" value="${s.mv || ''}" placeholder="0" data-inp="hcNum" data-k="mv">`)}</div></div>`;
}
/* ---------- hotel-mode events ---------- */
function stayRef(key) { const [a, i] = key.split('.'), s = hc(); return a === 'makkah' ? [s.makkah, 'MAKKAH'] : a === 'madinah' ? [s.madinah, 'MADINAH'] : [s.extra[+i], s.extra[+i].city]; }
function pickRooms(stay, city) { const h = hOf(city, stay.hotelId), r = h && h.rooms.find(x => x.id === stay.roomId); stay.rooms = r ? E.suggestRooms(r.occ, heads(hc())) : 1; }
function hcApply(k, v) {
  const s = hc(), ks = k.split('.');
  if (ks[0] === 'tr') { const t = s.transports[+ks[1]]; t[ks[2]] = v; if (ks[2] === 'routeId') { const sv = E.suggestVehicle(E.routeOptions(v, inv().tVehicles, inv().tPrices), s.adults + s.children + s.infants); t.vehicleId = sv ? sv.id : ''; } return; }
  if (['makkah', 'madinah', 'ex'].includes(ks[0])) {
    const [stay, city] = stayRef(ks.slice(0, ks[0] === 'ex' ? 2 : 1).join('.')), f = ks[ks.length - 1];
    if (f === 'hotelId') { stay.hotelId = v; const h = hOf(city, v); stay.roomId = h ? h.rooms.filter(r => r.rates.length)[0].id : ''; pickRooms(stay, city); }
    else if (f === 'roomId') { stay.roomId = v; pickRooms(stay, city); }
    else if (f === 'rooms') stay.rooms = Math.max(1, +v || 1);
    else { stay[f] = v; if (f === 'cin' && stay.cout && stay.cout <= v) stay.cout = ''; if (ks[0] === 'makkah' && f === 'cout') s.madinah.cin = v; }
    return;
  }
  s[k] = (k === 'flight') ? !!v : v;
}
CHG.hcSet = (v, t) => { hcApply(t.dataset.k, v); renderView(); };
INP.hcNum = (v, t) => { hc()[t.dataset.k] = numF(v); $('#hcout').innerHTML = hOut(); };
ACT.hcStep = a => {
  const [k, d, min] = a.split('|'), s = hc();
  if (/^(adults|children|infants)$/.test(k)) { s[k] = Math.max(+min, Math.min(60, s[k] + +d)); ['makkah:MAKKAH', 'madinah:MADINAH'].forEach(x => { const [n, c] = x.split(':'); pickRooms(s[n], c); }); s.extra.forEach(x => pickRooms(x, x.city)); }
  else { const [stay] = stayRef(k.split('.').slice(0, k.startsWith('ex') ? 2 : 1).join('.')); stay.rooms = Math.max(1, Math.min(30, stay.rooms + +d)); }
  renderView();
};
ACT.hcAddx = c => { hc().extra.push({ city: c, hotelId: '', roomId: '', cin: '', cout: '', rooms: 1 }); renderView(); };
ACT.hcRmx = i => { hc().extra.splice(+i, 1); renderView(); };
ACT.hcAddt = () => { hc().transports.push({ routeId: '', vehicleId: '', roundTrip: false, count: 1 }); renderView(); };
ACT.hcRmt = i => { hc().transports.splice(+i, 1); renderView(); };
ACT.hcBook = () => {
  const q = hQuote(), s = hc(), staff = isStaff(), f = q.totalPkr ? q.m.total / q.totalPkr : 1, T = q.travellers, sv = [];
  q.lines.forEach(l => {
    const sell = Math.round(l.pkr * f), cost = staff ? l.pkr : '';
    if (l.kind === 'hotel') { const x = l.stay, d = { city: x.city.replace(/ \(.*/, ''), hotel: x.hotelName, stars: String(x.stars || ''), room: x.roomName, meal: 'Room only', rooms: x.rooms, cin: x.cin, cout: x.cout, dist: x.dist || '' }; sv.push({ ...SVC_DEF('hotel'), type: 'hotel', title: l.label, qty: 1, sell, cost, from: x.cin, to: x.cout, d }); }
    else if (l.kind === 'visa') sv.push({ ...SVC_DEF('visa'), type: 'visa', title: 'Umrah visa - ' + l.label, qty: l.qty, sell: Math.round(sell / l.qty), cost: staff ? Math.round(l.pkr / l.qty) : '', d: { vtype: 'Umrah', entry: 'Single', duration: '', ref: '' } });
    else if (l.kind === 'transport') { const tt = q.transports[+l.id.slice(2)]; sv.push({ ...SVC_DEF('transport'), type: 'transport', title: l.label, qty: 1, sell, cost, d: { route: l.label, vehicle: tt ? tt.vehicle.name : '', date: '', time: '', pickup: '', drop: '' } }); }
    else sv.push({ ...SVC_DEF('flight'), type: 'flight', title: 'Flights', qty: 1, sell, cost, d: { ...SVC_DEF('flight').d } });
  });
  const dates = [q.makkah.cin, q.madinah.cin, q.makkah.cout, q.madinah.cout, ...q.extras.flatMap(x => [x.cin, x.cout])].filter(Boolean).sort();
  UI.prefill = { category: 'Custom', from: dates[0] || '', to: dates[dates.length - 1] || '', services: sv, notes: 'Built in Umrah calculator: ' + (s.visaType || ''), pax: [...Array(T.adults).fill('Adult'), ...Array(T.children).fill('Child'), ...Array(T.infants).fill('Infant')].map(t => ({ n: '', pp: '', dob: '', nat: 'Pakistani', g: 'M', t })) };
  go('bookingform', 'new');
};
ACT.hcQuery = async (a, b) => { const q = hQuote(); await doRpc(b, 'addQuery', { type: 'package', text: 'Calculator quote - please confirm availability.\n' + hText(q).replace(/\*/g, ''), details: { total: q.m.total, pax: q.travellers.total } }, 'Sent to the office - see Queries'); };
/* ---------- group mode ---------- */
function calcLines() {
  const c = cc(), L = []; ROOMS.forEach(r => { if (c.n[r[0]] > 0) L.push({ label: 'Package - ' + r[1], qty: +c.n[r[0]], unit: +c.u[r[0]] || 0, type: 'package' }); });
  const pax = sum(ROOMS, r => +c.n[r[0]] || 0), all = pax + (+c.inf || 0);
  if (c.inf > 0) L.push({ label: 'Infant', qty: +c.inf, unit: +c.infp || 0, type: 'other' });
  if (+c.visa) L.push({ label: 'Visa', qty: all, unit: +c.visa, type: 'visa' });
  if (+c.trans) L.push({ label: 'Transport', qty: all, unit: +c.trans, type: 'transport' });
  c.extras.forEach(x => { if (+x.amt) L.push({ label: x.name || 'Extra', qty: x.per ? all : 1, unit: +x.amt, type: 'other' }); });
  const base = sum(L, l => l.qty * l.unit), m = E.withMargin(base, all, c.mt, c.mv);
  return { L, pax, heads: all, base, margin: m.margin, total: m.total };
}
function calcOut() {
  const r = calcLines(), g = (S.groups || []).find(x => x.id === cc().gid), over = g && r.heads > g.seats;
  UI.calcTxt = `Umrah package quote\n${g ? g.airline + ' · departs ' + fdate(g.dep) + ' · ' + g.n + ' nights\n' : ''}${r.L.map(l => `${l.label}: ${l.qty} × ${fnum(l.unit)}`).join('\n')}\nTotal for ${r.heads} traveller(s): PKR ${fnum(r.total)}\nPer person: PKR ${fnum(r.heads ? r.total / r.heads : 0)}`;
  return `<div class="stat card hot"><div class="l">Total quote</div><div class="v">${fmt(r.total)}</div><div class="s">${r.heads} traveller(s) · ${fmt(r.heads ? r.total / r.heads : 0)} per person</div></div>
  <div class="card cp" style="margin-top:12px">${r.L.length ? r.L.map(l => `<div class="row sb"><span>${esc(l.label)} <span class="sub">${l.qty} × ${fnum(l.unit)}</span></span><b class="num">${fnum(l.qty * l.unit)}</b></div>`).join('') + `<div class="row sb" style="border-top:1px solid var(--line);margin-top:8px;padding-top:8px"><span>Subtotal</span><b class="num">${fnum(r.base)}</b></div>${r.margin ? `<div class="row sb"><span>Margin</span><b class="num">${fnum(r.margin)}</b></div>` : ''}` : '<div class="mute">Enter travellers and prices to build a quote.</div>'}</div>
  ${over ? `<div class="warnbox" style="margin-top:12px">Only ${g.seats} seat(s) left on this group, the quote is for ${r.heads}.</div>` : ''}
  <div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn" data-act="calcCopy" ${r.L.length ? '' : 'disabled'}>${ic('copy', 'sm')}Copy</button><a class="btn wa" target="_blank" rel="noopener" href="${r.L.length ? waLinkTo(UI.calcTxt) : '#'}">${ic('wa', 'sm')}WhatsApp</a><button class="btn" data-act="calcPrint" ${r.L.length ? '' : 'disabled'}>${ic('print', 'sm')}Print</button>${r.heads ? `<button class="btn pri" data-act="calcBook">${ic('plus', 'sm')}Create booking</button>` : ''}</div>`;
}
const numIn = (k, v) => `<input type="number" min="0" value="${v || ''}" data-inp="calc" data-k="${k}" placeholder="0">`;
INP.calc = (v, t) => { const [a, b] = t.dataset.k.split('.'), c = cc(); if (b) c[a][b] = +v || 0; else c[a] = ['mv', 'visa', 'trans', 'inf', 'infp'].includes(a) ? +v || 0 : v; $('#calcout').innerHTML = calcOut(); };
CHG.calcSel = (v, t) => {
  const c = cc(), k = t.dataset.k; if (k === 'gid') { c.gid = v; c.pid = ''; } if (k === 'pid') { c.pid = v; const pk = ((S.groups || []).find(g => g.id === c.gid) || { pk: [] }).pk.find(x => x.id === v); if (pk) ROOMS.forEach(r => { c.u[r[0]] = pk.p[r[0]] || 0; }); } if (k === 'mt') c.mt = v; renderView();
};
function groupForm() {
  const c = cc(), g = (S.groups || []).find(x => x.id === c.gid);
  return `<div class="card cp"><div class="sec">Group package</div><div class="g2">${fld('Group', `<select data-chg="calcSel" data-k="gid">${opts((S.groups || []).map(x => [x.id, fdate(x.dep) + ' · ' + x.airline + ' · ' + x.n + 'N · ' + x.seats + ' seats']), c.gid, 'Custom pricing')}</select>`)}${fld('Package', `<select data-chg="calcSel" data-k="pid" ${g ? '' : 'disabled'}>${opts(g ? g.pk.map(k => [k.id, (k.mk || '') + ' / ' + (k.md || '')]) : [], c.pid, 'Select package')}</select>`)}</div>${g ? `<div class="row" style="margin-top:12px;gap:10px">${airBadge(g.air, g.airline, 34)}<span class="sub">${esc(g.airline)} · ${esc(g.out.fn)} / ${esc(g.inb.fn)} · ${fdate(g.dep)} → ${fdate(g.ret)}</span></div>` : ''}</div><div class="gap"></div>
  <div class="card cp"><div class="sec">Travellers and per-person prices</div><div class="g4" style="align-items:end">${ROOMS.map(r => `<div class="g1">${fld(r[1] + ' - persons', numIn('n.' + r[0], c.n[r[0]]))}${fld('Price per person', numIn('u.' + r[0], c.u[r[0]]))}</div>`).join('')}</div><div class="gap"></div><div class="g4">${fld('Infants', numIn('inf', c.inf))}${fld('Infant price', numIn('infp', c.infp))}${fld('Visa per person', numIn('visa', c.visa))}${fld('Transport per person', numIn('trans', c.trans))}</div></div><div class="gap"></div>
  <div class="card cp"><div class="row sb"><div class="sec" style="margin:0">Extras</div><button class="btn sm" data-act="calcExtra">${ic('plus', 'sm')}Add extra</button></div>${c.extras.map((x, i) => `<div class="g3" style="margin-top:8px;align-items:end">${fld('Name', `<input value="${esc(x.name)}" data-inp="calcX" data-i="${i}" data-f="name">`)}${fld('Amount', `<input type="number" value="${x.amt || ''}" data-inp="calcX" data-i="${i}" data-f="amt">`)}<div class="row"><label class="chk"><input type="checkbox" ${x.per ? 'checked' : ''} data-chg="calcXp" data-i="${i}">Per person</label><button class="btn sm ghost" data-act="calcXdel" data-a="${i}">${ic('trash', 'sm')}</button></div></div>`).join('') || '<div class="hint" style="margin-top:8px">Ziyarat, insurance, SIM cards, laundry...</div>'}</div><div class="gap"></div>
  <div class="card cp"><div class="sec">Margin</div><div class="g2">${fld('Type', `<select data-chg="calcSel" data-k="mt">${opts([['%', 'Percent of total'], ['PKR', 'PKR per traveller']], c.mt)}</select>`)}${fld('Value', numIn('mv', c.mv))}</div></div>`;
}
INP.calcX = (v, t) => { cc().extras[t.dataset.i][t.dataset.f] = t.dataset.f === 'amt' ? +v || 0 : v; $('#calcout').innerHTML = calcOut(); };
CHG.calcXp = (v, t) => { cc().extras[t.dataset.i].per = v; $('#calcout').innerHTML = calcOut(); };
ACT.calcExtra = () => { cc().extras.push({ name: '', amt: 0, per: true }); renderView(); };
ACT.calcXdel = i => { cc().extras.splice(+i, 1); renderView(); };
ACT.calcBook = () => {
  const r = calcLines(), c = cc(), g = (S.groups || []).find(x => x.id === c.gid), staff = isStaff(), f = r.base ? r.total / r.base : 1;
  const sv = r.L.map(l => { const s = SVC_DEF(l.type); s.title = l.label; s.qty = l.qty; s.sell = Math.round(l.unit * f); if (staff) s.cost = l.unit; if (l.type === 'package' && g) { s.from = g.dep; s.to = g.ret; s.d = { code: g.id, airline: g.airline, out: g.out, inb: g.inb, room: l.label.replace('Package - ', '') }; } if (l.type === 'other') s.d.desc = l.label; return s; });
  UI.prefill = { services: sv, category: g ? 'Group Package' : 'Custom', groupRef: g ? { gid: g.id, pid: c.pid, room: '', seats: 0 } : null, pax: Array.from({ length: r.heads }, (_, i) => ({ n: '', pp: '', dob: '', nat: 'Pakistani', g: 'M', t: i >= r.pax ? 'Infant' : 'Adult' })) };
  go('bookingform', 'new');
};
/* ---------- view ---------- */
VIEWS.calculator = {
  title: 'Umrah package calculator', roles: ['admin', 'staff', 'agent'],
  render() {
    const m = calcMode();
    return `<div class="ph"><div><h1>Umrah package calculator</h1><p>Build a quote from hotel rates, visa tiers and transport - or price a live group package.</p></div><div class="sp"><button class="btn" data-act="calcReset">Reset</button></div></div>
    <div class="tabs" role="tablist"><button class="tab ${m === 'hotel' ? 'on' : ''}" data-act="calcMode" data-a="hotel" role="tab">${ic('hotel', 'sm')}Hotel package</button><button class="tab ${m === 'group' ? 'on' : ''}" data-act="calcMode" data-a="group" role="tab">${ic('layers', 'sm')}Group package</button></div>
    <div class="gm"><div>${m === 'hotel' ? hcForm() : groupForm()}${m === 'hotel' && inv().calc.terms ? `<p class="hint" style="margin-top:10px">${esc(inv().calc.terms)}</p>` : ''}</div><div id="calcout" class="sticky-out">${m === 'hotel' ? '<div id="hcout">' + hOut() + '</div>' : calcOut()}</div></div>`;
  }
};
ACT.calcMode = m => { UI.calcMode = m; renderView(); };
ACT.calcReset = () => { if (calcMode() === 'hotel') UI.hc = null; else UI.calc = C0(); renderView(); };
ACT.calcCopy = () => navigator.clipboard.writeText((UI.calcTxt || '').replace(/\*/g, '')).then(() => toast('Quote copied'));
ACT.calcPrint = () => {
  const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print', true);
  const co = S.company || {}; w.document.write(`<!DOCTYPE html><title>Quote</title><body style="font:14px/1.6 system-ui;max-width:640px;margin:30px auto;padding:0 18px"><img src="${logoUrl()}" width="90" alt=""><h2>${esc(co.name || '')}</h2><pre style="white-space:pre-wrap;font:inherit">${esc((UI.calcTxt || '').replace(/\*/g, ''))}</pre><p style="color:#666;font-size:12px">${esc(co.phone || '')} ${esc(co.email || '')}<br>Prices are indicative and subject to availability.</p><script>onload=()=>print()<\/script>`); w.document.close();
};
