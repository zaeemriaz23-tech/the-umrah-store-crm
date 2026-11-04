/* Transport booking engine: route -> vehicle -> passengers/date -> fare (SAR + PKR) -> booking / office query */
'use strict';
const T0 = () => ({ routeId: '', vehicleId: '', pax: 2, count: 1, round: false, date: '', time: '', rdate: '', rtime: '', pickup: '', drop: '', flight: '', mt: '%', mv: 0 });
const tc = () => UI.tr || (UI.tr = T0());
const TCATS = { AIRPORT: 'Airport transfers', INTERCITY: 'Intercity', ZIYARAT: 'Ziyarat', OTHER: 'Other' };
const trRoutes = () => inv().tRoutes.filter(r => r.active !== false && Engine.routeOptions(r.id, inv().tVehicles, inv().tPrices).length);
function trCalc() {
  const s = tc(), I = inv(), rate = I.calc.pkrPerSar, r = I.tRoutes.find(x => x.id === s.routeId), opts = r ? Engine.routeOptions(r.id, I.tVehicles, I.tPrices) : [], o = opts.find(x => x.vehicle.id === s.vehicleId), issues = [];
  if (!r) return { issues: ['Choose a route.'], r, o, opts };
  if (!o) issues.push('Choose a vehicle.');
  const per = Math.ceil(s.pax / Math.max(1, s.count)), q = o ? Engine.transportQuote(o, per, s.round) : null;
  if (o && o.vehicle.cap && per > o.vehicle.cap) issues.push(`${s.count} × ${o.vehicle.name} carries ${s.count * o.vehicle.cap}; you have ${s.pax} passengers.`);
  if (!s.date) issues.push('Set the travel date.'); if (s.round && (!s.rdate || s.rdate < s.date)) issues.push('Set a return date on or after the travel date.');
  if (!rate) issues.push('SAR → PKR rate not set (Rates & inventory).');
  const sar = q ? q.total * s.count : 0, pkr = Math.round(sar * (rate || 0)), m = Engine.withMargin(pkr, s.pax, s.mt, s.mv);
  return { r, o, opts, q, sar, pkr, m, issues, per };
}
const trText = c => { const s = tc(), co = (S.company || {}).name || 'The Umrah Store'; return `*${co} - Transport quote*\n${c.r.origin} → ${c.r.dest}\n${s.count} × ${c.o.vehicle.name} · ${s.pax} passenger(s)\nDate: ${s.date ? fdate(s.date) : '-'}${s.time ? ' ' + s.time : ''}${s.round ? '\nReturn: ' + (s.rdate ? fdate(s.rdate) : '-') + (s.rtime ? ' ' + s.rtime : '') : ''}${s.pickup ? '\nPick-up: ' + s.pickup : ''}${s.drop ? '\nDrop-off: ' + s.drop : ''}${s.flight ? '\nFlight: ' + s.flight : ''}\n\n*Total: PKR ${fnum(c.m.total)}* (SAR ${fnum(c.sar)})`; };
function trOut() {
  const c = trCalc(), ok = c.q && c.o, s = tc(); UI.trTxt = ok ? trText(c) : '';
  return `<div class="stat card hot"><div class="l">Transport fare</div><div class="v">${ok && c.pkr ? fmt(c.m.total) : '—'}</div><div class="s">${ok ? 'SAR ' + fnum(c.sar) + (c.q.legs > 1 ? ' · return included' : '') + ' · ' + s.count + ' vehicle(s)' : 'Choose a route and vehicle'}</div></div>
  ${ok ? `<div class="card cp" style="margin-top:12px"><div class="row sb"><span>${esc(c.r.origin)} → ${esc(c.r.dest)}<span class="sub" style="display:block">${s.count} × ${esc(c.o.vehicle.name)} · ${c.per} pax each</span></span><b class="num">SAR ${fnum(c.q.base * s.count)}</b></div>${c.q.extraCharge ? `<div class="row sb"><span>Extra passengers<span class="sub" style="display:block">${c.q.extraPassengers} × ${c.o.vehicle.chg} SAR${s.count > 1 ? ' × ' + s.count : ''}</span></span><b class="num">SAR ${fnum(c.q.extraCharge * s.count)}</b></div>` : ''}${c.q.legs > 1 ? `<div class="row sb"><span>Return trip</span><b class="num">SAR ${fnum(c.q.perLeg * s.count)}</b></div>` : ''}<div class="row sb" style="border-top:1px solid var(--line);margin-top:8px;padding-top:8px"><span>In rupees (× ${inv().calc.pkrPerSar || '?'})</span><b class="num">${fnum(c.pkr)}</b></div>${c.m.margin ? `<div class="row sb"><span>Margin</span><b class="num">${fnum(c.m.margin)}</b></div>` : ''}</div>` : ''}
  ${c.issues.length ? `<div class="warnbox" style="margin-top:12px"><ul>${c.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>` : ''}
  <div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn" data-act="trCopy" ${ok ? '' : 'disabled'}>${ic('copy', 'sm')}Copy</button><a class="btn wa" target="_blank" rel="noopener" href="${ok ? waLinkTo(UI.trTxt) : '#'}">${ic('wa', 'sm')}WhatsApp</a>${ok ? `<button class="btn pri" data-act="trBook">${ic('plus', 'sm')}Create booking</button>` : ''}${ok && isAgent() ? `<button class="btn" data-act="trQuery">${ic('bell', 'sm')}Ask office</button>` : ''}</div>`;
}
const trCnt = (k, v, min) => `<div class="cnt"><button type="button" data-act="trStep" data-a="${k}|-1|${min}">−</button><output>${v}</output><button type="button" data-act="trStep" data-a="${k}|1|${min}">+</button></div>`;
VIEWS.transport = {
  title: 'Transport booking', roles: ['admin', 'staff', 'agent'],
  render() {
    const s = tc(), I = inv(), routes = trRoutes(), c = trCalc(), groups = {}; routes.forEach(r => (groups[r.cat] = groups[r.cat] || []).push(r));
    if (!routes.length) return `<div class="ph"><div><h1>Transport booking</h1></div></div><div class="card">${empty('bus', 'No transport fares yet', isStaff() ? 'Add vehicles, routes and fares in Rates & inventory.' : 'Ask the office to publish transport fares.', isStaff() ? '<a class="btn pri" href="#/rates">Open Rates & inventory</a>' : '')}</div>`;
    return `<div class="ph"><div><h1>Transport booking</h1><p>Airport transfers, Makkah ↔ Madinah and ziyarat - fixed fares, SAR and PKR.</p></div><div class="sp"><button class="btn" data-act="trReset">Reset</button></div></div>
    <div class="gm"><div><div class="card cp"><div class="sec">Route</div>${fld('Journey', `<select data-chg="trSet" data-k="routeId"><option value="">Select route</option>${Object.keys(groups).map(k => `<optgroup label="${esc(TCATS[k] || k)}">${opts(groups[k].map(r => [r.id, r.origin + ' → ' + r.dest + (r.dur ? ' (' + r.dur + ')' : '')]), s.routeId)}</optgroup>`).join('')}</select>`)}${c.r && (c.r.desc || c.r.notes) ? `<div class="hint" style="margin-top:8px">${esc(c.r.desc || '')} ${esc(c.r.notes || '')}</div>` : ''}</div>
      ${c.r ? `<div class="gap"></div><div class="card cp"><div class="sec">Passengers & vehicle</div><div class="g3">${fld('Passengers', trCnt('pax', s.pax, 1))}${fld('Vehicles', trCnt('count', s.count, 1))}<span></span></div><div class="vgrid">${c.opts.map(o => { const qq = Engine.transportQuote(o, Math.ceil(s.pax / s.count), false); return `<button class="vcard ${o.vehicle.id === s.vehicleId ? 'on' : ''}" data-act="trVeh" data-a="${o.vehicle.id}">${o.vehicle.img ? `<img src="${esc(o.vehicle.img)}" alt="" loading="lazy">` : `<span class="vic">${ic('car')}</span>`}<b>${esc(o.vehicle.name)}</b><small>Up to ${o.vehicle.cap} pax${o.vehicle.lug ? ' · ' + o.vehicle.lug + ' bags' : ''}</small><em>SAR ${fnum(qq.perLeg)}</em>${qq.extraPassengers ? `<small>incl. ${qq.extraPassengers} extra pax</small>` : ''}${Math.ceil(s.pax / s.count) > o.vehicle.cap ? '<small class="neg">too small</small>' : ''}</button>`; }).join('')}</div></div>
      <div class="gap"></div><div class="card cp"><div class="sec">Journey</div><div class="g2">${fld('Date', `<input type="date" value="${esc(s.date)}" data-chg="trSet" data-k="date">`)}${fld('Pick-up time', `<input type="time" value="${esc(s.time)}" data-chg="trSet" data-k="time">`)}</div><label class="chk" style="margin:12px 0"><input type="checkbox" ${s.round ? 'checked' : ''} data-chg="trSet" data-k="round">Return trip (${esc(c.r.dest)} → ${esc(c.r.origin)})</label>${s.round ? `<div class="g2">${fld('Return date', `<input type="date" min="${esc(s.date)}" value="${esc(s.rdate)}" data-chg="trSet" data-k="rdate">`)}${fld('Return time', `<input type="time" value="${esc(s.rtime)}" data-chg="trSet" data-k="rtime">`)}</div>` : ''}<div class="g2" style="margin-top:12px">${fld('Pick-up location', `<input value="${esc(s.pickup)}" data-inp="trTxt" data-k="pickup" placeholder="Hotel / terminal">`)}${fld('Drop-off location', `<input value="${esc(s.drop)}" data-inp="trTxt" data-k="drop" placeholder="Hotel / terminal">`)}</div>${c.r.cat === 'AIRPORT' ? `<div style="margin-top:12px">${fld('Flight number', `<input value="${esc(s.flight)}" data-inp="trTxt" data-k="flight" placeholder="SV 727">`)}</div>` : ''}</div>
      <div class="gap"></div><div class="card cp"><div class="sec">Margin</div><div class="g2">${fld('Type', `<select data-chg="trSet" data-k="mt">${opts([['%', 'Percent of fare'], ['PKR', 'PKR per passenger']], s.mt)}</select>`)}${fld('Value', `<input type="number" min="0" value="${s.mv || ''}" data-inp="trNum" data-k="mv">`)}</div></div>${I.calc.tTerms ? `<p class="hint" style="margin-top:10px">${esc(I.calc.tTerms)}</p>` : ''}` : ''}</div>
    <div id="trout" class="sticky-out">${trOut()}</div></div>`;
  }
};
CHG.trSet = (v, t) => { const s = tc(), k = t.dataset.k; s[k] = v; if (k === 'routeId') { s.vehicleId = ''; const r = Engine.suggestVehicle(Engine.routeOptions(v, inv().tVehicles, inv().tPrices), s.pax); if (r) { s.vehicleId = r.id; s.count = Math.max(1, Math.ceil(s.pax / r.cap)); } } renderView(); };
INP.trTxt = (v, t) => { tc()[t.dataset.k] = v; $('#trout').innerHTML = trOut(); };
INP.trNum = (v, t) => { tc()[t.dataset.k] = Math.max(0, +v || 0); $('#trout').innerHTML = trOut(); };
ACT.trStep = a => { const [k, d, min] = a.split('|'), s = tc(); s[k] = Math.max(+min, Math.min(k === 'pax' ? 80 : 20, s[k] + +d)); const v = (inv().tVehicles || []).find(x => x.id === s.vehicleId); if (k === 'pax' && v) s.count = Math.max(1, Math.ceil(s.pax / v.cap)); renderView(); };
ACT.trVeh = id => { const s = tc(), v = inv().tVehicles.find(x => x.id === id); s.vehicleId = id; if (v) s.count = Math.max(1, Math.ceil(s.pax / v.cap)); renderView(); };
ACT.trReset = () => { UI.tr = T0(); renderView(); };
ACT.trCopy = () => navigator.clipboard.writeText((UI.trTxt || '').replace(/\*/g, '')).then(() => toast('Quote copied'));
ACT.trBook = () => {
  const c = trCalc(), s = tc(), staff = isStaff(), f = c.pkr ? c.m.total / c.pkr : 1;
  const mk = (title, date, time, pk, dr, amt) => ({ ...SVC_DEF('transport'), type: 'transport', title, qty: 1, sell: Math.round(amt * f), cost: staff ? amt : '', d: { route: c.r.origin + ' → ' + c.r.dest, vehicle: s.count + ' × ' + c.o.vehicle.name, date, time, pickup: pk, drop: dr } });
  const one = Math.round(c.q.perLeg * s.count * (inv().calc.pkrPerSar || 0)), sv = [mk('Transport: ' + c.r.origin + ' → ' + c.r.dest, s.date, s.time, s.pickup, s.drop, one)];
  if (s.round) { const r = { ...mk('Transport (return): ' + c.r.dest + ' → ' + c.r.origin, s.rdate, s.rtime, s.drop, s.pickup, one) }; r.d.route = c.r.dest + ' → ' + c.r.origin; sv.push(r); }
  UI.prefill = { category: 'Custom', from: s.date, to: s.round ? s.rdate : s.date, services: sv, notes: s.flight ? 'Flight ' + s.flight : '', pax: Array.from({ length: s.pax }, () => ({ n: '', pp: '', dob: '', nat: 'Pakistani', g: 'M', t: 'Adult' })) };
  go('bookingform', 'new');
};
ACT.trQuery = async (a, b) => { const c = trCalc(); await doRpc(b, 'addQuery', { type: 'transport', text: 'Transport quote - please confirm.\n' + trText(c).replace(/\*/g, ''), details: { total: c.m.total, pax: tc().pax } }, 'Sent to the office - see Queries'); };
