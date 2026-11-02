/* Live flight & hotel search (SerpApi) and the query desk */
'use strict';
const SR = () => UI.sr || (UI.sr = { tab: 'flights', f: { trip: 'return', from: 'LHE', fromT: 'Lahore (LHE)', to: '', toT: '', date: '', ret: '', adults: 1, children: 0, infants: 0, cls: '1', direct: false }, h: { city: 'Makkah', cin: '', cout: '', adults: 2, children: 0, stars: '', free: false }, res: null, err: '', loading: false, fa: [], stops: '', fn: '', sort: 'best', tb: [], maxp: 0, hs: [], hsort: '', hr: 0, hfree: false, hmax: 0, pax: false });
const mins = m => Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
const hm = s => String(s || '').slice(-5);
const CABIN = { 1: 'Economy', 2: 'Premium economy', 3: 'Business', 4: 'First' };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const sdate = iso => { if (!iso) return ''; const d = DT(iso); return WD[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; };
const hour = s => +String(s || '').slice(-5, -3) || 0;
const band = h => h < 6 ? 'n' : h < 12 ? 'm' : h < 18 ? 'a' : 'e';
const BANDS = [['m', 'Morning', '06:00 - 12:00'], ['a', 'Afternoon', '12:00 - 18:00'], ['e', 'Evening', '18:00 - 24:00'], ['n', 'Night', '00:00 - 06:00']];
const paxTxt = (g, hotel) => { const n = (+g.adults || 1), c = +g.children || 0, i = +g.infants || 0; return n + (hotel ? (n > 1 ? ' guests' : ' guest') : (n > 1 ? ' adults' : ' adult')) + (c ? ', ' + c + (c > 1 ? ' children' : ' child') : '') + (i ? ', ' + i + (i > 1 ? ' infants' : ' infant') : '') + (hotel ? '' : ' · ' + CABIN[g.cls || 1]); };
const ratingLbl = r => r >= 4.6 ? 'Exceptional' : r >= 4.3 ? 'Excellent' : r >= 4 ? 'Very good' : r >= 3.5 ? 'Good' : 'Fair';

function paxPop() {
  const s = SR(), fl = s.tab === 'flights', g = fl ? s.f : s.h, k = fl ? 'f' : 'h';
  const row = (lbl, sub, key, mn, mx) => `<div class="px"><div><b>${lbl}</b><small>${sub}</small></div><div class="stp"><button type="button" data-act="paxStep" data-a="${k}:${key}:-1:${mn}:${mx}" ${(+g[key] || 0) <= mn ? 'disabled' : ''}>−</button><output>${+g[key] || 0}</output><button type="button" data-act="paxStep" data-a="${k}:${key}:1:${mn}:${mx}" ${(+g[key] || 0) >= mx ? 'disabled' : ''}>+</button></div></div>`;
  return `${fl ? `<div class="px"><div><b>Cabin class</b></div><select data-chg="srCls">${Object.entries(CABIN).map(([v, l]) => `<option value="${v}" ${String(g.cls) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
  ${row(fl ? 'Adults' : 'Guests', fl ? '12+ years' : 'Adults', 'adults', 1, fl ? 9 : 12)}${row('Children', fl ? '2 - 11 years' : 'Ages 0 - 17', 'children', 0, 8)}${fl ? row('Infants', 'Under 2, on lap/seat', 'infants', 0, 4) : ''}<button type="button" class="btn pri sm" data-act="paxDone" style="width:100%;margin-top:10px">Done</button>`;
}
const paxCell = () => { const s = SR(), fl = s.tab === 'flights'; return `<div class="sx-cell sx-pax"><span>${fl ? 'Travellers & cabin' : 'Guests'}</span><button type="button" class="sx-in" data-act="paxToggle" id="paxbtn">${esc(paxTxt(fl ? s.f : s.h, !fl))}</button><div class="sx-pop" id="paxpop" ${s.pax ? '' : 'hidden'}>${paxPop()}</div></div>`; };
ACT.paxToggle = () => { const s = SR(); s.pax = !s.pax; const p = $('#paxpop'); if (p) p.hidden = !s.pax; };
ACT.paxDone = () => { SR().pax = false; const p = $('#paxpop'); if (p) p.hidden = true; };
ACT.paxStep = a => { const [k, key, d, mn, mx] = a.split(':'), g = SR()[k]; g[key] = Math.min(+mx, Math.max(+mn, (+g[key] || 0) + +d)); const p = $('#paxpop'), b = $('#paxbtn'); if (p) p.innerHTML = paxPop(); if (b) b.textContent = paxTxt(g, k === 'h'); };
CHG.srCls = v => { SR().f.cls = v; const b = $('#paxbtn'); if (b) b.textContent = paxTxt(SR().f); };
document.addEventListener('click', e => { const s = UI.sr, path = e.composedPath ? e.composedPath() : [], inC = c => path.some(n => n.classList && n.classList.contains(c)); if (s && s.pax && !inC('sx-pax')) { s.pax = false; const p = $('#paxpop'); if (p) p.hidden = true; } if (!inC('sx-ap')) document.querySelectorAll('.sx-ac').forEach(x => { x.hidden = true; }); });
document.addEventListener('mousedown', e => { if (e.target.closest('.sx-ac')) e.preventDefault(); });

/* airport autocomplete */
const apItem = a => `<button type="button" class="sx-opt" data-act="apPick" data-a="${esc(a.code + '|' + a.city)}"><span class="cd">${esc(a.code)}</span><span><b>${esc(a.city)}</b><small>${esc(a.name)} · ${esc(a.country)}</small></span></button>`;
const apFetch = debounce(async (g, k, v) => {
  const box = $('#ac-' + k); if (!box) return;
  try { const r = await api('/api/airports?q=' + encodeURIComponent(v)); box.innerHTML = r.length ? r.map(apItem).join('') : '<div class="sx-none">No airports found</div>'; box.hidden = false; } catch (e) { box.hidden = true; }
}, 140);
INP.apq = (v, t) => { const k = t.dataset.k, f = SR().f; f[k + 'T'] = v; f[k] = /^[a-zA-Z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : (/\(([A-Z]{3})\)\s*$/.test(v) ? v.match(/\(([A-Z]{3})\)\s*$/)[1] : ''); apFetch('f', k, v.replace(/\(.*$/, '').trim()); };
ACT.apFocus = (k, t) => { t.select && t.select(); apFetch('f', k, ''); };
document.addEventListener('focusin', e => { const t = e.target; if (t.matches && t.matches('input[data-inp=apq]')) { t.select(); apFetch('f', t.dataset.k, t.value.includes('(') ? '' : t.value.trim()); } });
ACT.apPick = a => { const [code, city] = a.split('|'), f = SR().f, k = $('#ac-from') && !$('#ac-from').hidden ? 'from' : 'to'; f[k] = code; f[k + 'T'] = city + ' (' + code + ')'; const i = $('input[data-inp=apq][data-k=' + k + ']'); if (i) i.value = f[k + 'T']; document.querySelectorAll('.sx-ac').forEach(x => { x.hidden = true; }); if (k === 'from' && !f.to) { const t = $('input[data-inp=apq][data-k=to]'); t && t.focus(); } else if (k === 'to' && !f.date) { const d = $('#sx-date'); d && d.focus(); } };
const apCell = (k, lbl, ph) => { const f = SR().f; return `<div class="sx-cell sx-ap"><span>${lbl}</span><input class="sx-in" data-inp="apq" data-k="${k}" value="${esc(f[k + 'T'] || '')}" placeholder="${ph}" autocomplete="off" spellcheck="false"><div class="sx-ac" id="ac-${k}" hidden></div>${k === 'from' ? `<button class="sx-swap" data-act="srSwap" title="Swap" aria-label="Swap airports" type="button">${ic('swap', 'sm')}</button>` : ''}</div>`; };
const dateCell = (lbl, g, k, id, min, off) => { const o = SR()[g]; return `<label class="sx-cell"><span>${lbl}</span>${off ? `<em class="sx-off">${off}</em>` : `<input class="sx-in" id="${id}" type="date" value="${esc(o[k] || '')}" min="${min}" data-inp="srf" data-g="${g}" data-k="${k}">`}</label>`; };

const ROUTES = [['LHE', 'Lahore', 'JED', 'Jeddah'], ['KHI', 'Karachi', 'JED', 'Jeddah'], ['ISB', 'Islamabad', 'MED', 'Madinah'], ['LHE', 'Lahore', 'MED', 'Madinah'], ['LHE', 'Lahore', 'DXB', 'Dubai'], ['KHI', 'Karachi', 'DXB', 'Dubai'], ['ISB', 'Islamabad', 'LHR', 'London']];
function searchBar() {
  const s = SR(), f = s.f, h = s.h, fl = s.tab === 'flights', t = todayISO();
  return `<div class="sx"><div class="sx-tabs"><button class="${fl ? 'on' : ''}" data-act="srTab" data-a="flights">${ic('plane', 'sm')} Flights</button><button class="${!fl ? 'on' : ''}" data-act="srTab" data-a="hotels">${ic('hotel', 'sm')} Hotels</button></div>
  <h2 class="sx-h">${fl ? 'Search live flights, one simple search' : 'Find the right stay near the Haram'}</h2>
  ${fl ? `<div class="sx-opts"><div class="seg"><button class="${f.trip === 'return' ? 'on' : ''}" data-act="srTrip" data-a="return">Return</button><button class="${f.trip === 'one' ? 'on' : ''}" data-act="srTrip" data-a="one">One way</button></div>
  <label class="sx-ck"><input type="checkbox" ${f.direct ? 'checked' : ''} data-chg="srDirect"><i></i>Direct flights only</label></div>
  <div class="sx-row">${apCell('from', 'From', 'Country, city or airport')}${apCell('to', 'To', 'Country, city or airport')}${dateCell('Depart', 'f', 'date', 'sx-date', t)}${dateCell('Return', 'f', 'ret', 'sx-ret', f.date || t, f.trip === 'return' ? '' : 'One way')}${paxCell()}<button class="sx-go" data-act="srGo">${ic('search')}<span>Search</span></button></div>
  <div class="sx-pop2">${ROUTES.map(r => `<button class="sx-chip" data-act="srRoute" data-a="${r[0]}|${r[1]}|${r[2]}|${r[3]}">${r[0]} <i>→</i> ${r[2]}</button>`).join('')}</div>`
  : `<div class="sx-opts"><label class="sx-ck"><input type="checkbox" ${h.free ? 'checked' : ''} data-chg="srFree"><i></i>Free cancellation</label></div>
  <div class="sx-row h"><div class="sx-cell"><span>Destination</span><input class="sx-in" value="${esc(h.city)}" data-inp="srf" data-g="h" data-k="city" list="hcl" placeholder="Makkah, Madinah, Jeddah..."><datalist id="hcl"><option>Makkah</option><option>Madinah</option><option>Jeddah</option><option>Riyadh</option><option>Dubai</option><option>Istanbul</option></datalist></div>
  ${dateCell('Check-in', 'h', 'cin', 'sx-cin', t)}${dateCell('Check-out', 'h', 'cout', 'sx-cout', h.cin || t)}${paxCell()}<div class="sx-cell"><span>Stars</span><select class="sx-in" data-chg="srStars"><option value="">Any</option>${[3, 4, 5].map(n => `<option value="${n}" ${h.stars == n ? 'selected' : ''}>${n}★ and up</option>`).join('')}</select></div><button class="sx-go" data-act="srGo">${ic('search')}<span>Search</span></button></div>
  <div class="sx-pop2">${['Makkah', 'Madinah', 'Jeddah'].map(c => `<button class="sx-chip" data-act="hoCity" data-a="${c}">${c}</button>`).join('')}</div>`}</div>`;
}
INP.srf = (v, t) => { const o = SR()[t.dataset.g], k = t.dataset.k; o[k] = v; const g = t.dataset.g;
  if (g === 'f' && k === 'date' && v && (!o.ret || o.ret < v) && o.trip === 'return') { o.ret = addDays(v, 7); const r = $('#sx-ret'); if (r) r.value = o.ret; }
  if (g === 'f' && k === 'date') { const r = $('#sx-ret'); if (r) r.min = v; }
  if (g === 'h' && k === 'cin' && v) { if (!o.cout || o.cout <= v) { o.cout = addDays(v, 3); const r = $('#sx-cout'); if (r) r.value = o.cout; } const r = $('#sx-cout'); if (r) r.min = addDays(v, 1); } };
CHG.srDirect = v => { SR().f.direct = v; }; CHG.srFree = v => { SR().h.free = v; };
CHG.srStars = v => { SR().h.stars = v; };
ACT.srTrip = a => { SR().f.trip = a; if (a === 'one') SR().f.ret = ''; renderView(); };
ACT.srRoute = a => { const [fc, fn, tc, tn] = a.split('|'), f = SR().f; Object.assign(f, { from: fc, fromT: fn + ' (' + fc + ')', to: tc, toT: tn + ' (' + tc + ')' }); renderView(); };
ACT.hoCity = c => { SR().h.city = c; renderView(); };
ACT.srTab = t => { const s = SR(); s.tab = t; s.res = null; s.err = ''; s.pax = false; renderView(); };
ACT.srSwap = () => { const f = SR().f; [f.from, f.to] = [f.to, f.from]; [f.fromT, f.toT] = [f.toT, f.fromT]; document.querySelectorAll('input[data-inp=apq]').forEach(i => { i.value = f[i.dataset.k + 'T'] || ''; }); };
ACT.srGo = async () => {
  const s = SR(), fl = s.tab === 'flights';
  if (fl) { const f = s.f; if (!/^[A-Z]{3}$/.test(f.from || '')) { toast('Choose a departure airport from the list', 1); return; } if (!/^[A-Z]{3}$/.test(f.to || '')) { toast('Choose a destination airport from the list', 1); return; } if (!f.date) { toast('Pick a departure date', 1); return; } if (f.trip === 'return' && !f.ret) { toast('Pick a return date or choose One way', 1); return; } }
  else if (!s.h.city || !s.h.cin || !s.h.cout) { toast('Enter destination, check-in and check-out dates', 1); return; }
  const q = fl ? { from: s.f.from, to: s.f.to, date: s.f.date, ret: s.f.trip === 'return' ? s.f.ret : '', adults: s.f.adults, children: s.f.children, infants: s.f.infants, cls: s.f.cls, direct: s.f.direct ? '1' : '' } : { city: s.h.city, cin: s.h.cin, cout: s.h.cout, adults: s.h.adults, children: s.h.children, stars: s.h.stars ? [3, 4, 5].filter(n => n >= s.h.stars).join(',') : '', free: s.h.free ? '1' : '' };
  s.loading = true; s.err = ''; s.res = null; s.fa = []; s.hs = []; s.stops = ''; s.tb = []; s.maxp = 0; s.hmax = 0; s.hr = 0; s.hfree = false; s.fn = ''; drawRes();
  const el = $('#srres'); el && el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try { s.res = await api('/api/search/' + s.tab + '?' + new URLSearchParams(q)); s.sentQ = { ...q, fromT: s.f.fromT, toT: s.f.toT }; } catch (e) { s.err = e.message; }
  s.loading = false; drawRes();
};
const drawRes = () => { const e = $('#srres'); if (e) e.innerHTML = resHtml(); };
const skel = n => Array.from({ length: n }, () => '<div class="sx-sk"><i></i><i></i><i></i></div>').join('');
function resHtml() {
  const s = SR();
  if (s.loading) return `<div class="sx-load"><div class="sx-bar"></div><b>${s.tab === 'flights' ? 'Comparing airlines and fares live...' : 'Checking live hotel rates...'}</b><span>This usually takes a few seconds.</span></div>${skel(4)}`;
  if (s.err) return `<div class="errbox">${ic('alert')} ${esc(s.err)}</div>`;
  if (!s.res) return `<div class="card">${empty(s.tab === 'flights' ? 'plane' : 'hotel', s.tab === 'flights' ? 'Where to next?' : 'Where are you staying?', 'Enter your trip above. Results come from live market data' + (isAgent() ? '.' : ' and include your markup.'))}</div>`;
  if (!s.res.configured) return `<div class="card cp">${empty('settings', 'Live search is not connected yet', isAdmin() ? 'Add your SerpApi key in Settings → Integrations to enable live flight and hotel search.' : 'The administrator needs to connect the search service.', isAdmin() ? '<a class="btn pri" href="#/settings">Open settings</a>' : '')}</div>`;
  return s.tab === 'flights' ? flightRes() : hotelRes();
}
const stopTxt = i => i.stops ? i.stops + ' stop' + (i.stops > 1 ? 's' : '') : 'Direct';
const fxBadge = (i, sz = 40) => i.logo ? `<img class="al-i" style="width:${sz}px;height:${sz}px" src="${esc(i.logo)}" alt="" loading="lazy">` : `<span class="al-i al-t" style="width:${sz}px;height:${sz}px">${esc((i.airline || '?').slice(0, 2).toUpperCase())}</span>`;
function flightCard(i, k, all) {
  const q = SR().sentQ, segs = i.segs.map((g, n) => `${n ? `<div class="fd-lay">${ic('clock', 'sm')} ${i.lay[n - 1] ? 'Layover ' + mins(i.lay[n - 1].dur) + ' in ' + esc(i.lay[n - 1].name || i.lay[n - 1].id) + (i.lay[n - 1].night ? ' · overnight' : '') : 'Change of plane'}</div>` : ''}
    <div class="fd-seg"><div class="fd-tl"><b>${hm(g.dep)}</b><i></i><b>${hm(g.arr)}</b></div><div class="fd-in"><div><b>${esc(g.from)}</b> ${esc(g.fromName)}</div><div class="sub">${esc(g.air)} ${esc(g.no)} · ${mins(g.dur)}${g.plane ? ' · ' + esc(g.plane) : ''}${g.legroom ? ' · ' + esc(g.legroom) + ' legroom' : ''}</div><div><b>${esc(g.to)}</b> ${esc(g.toName)}</div>${g.delayed ? '<div class="fd-w">Often delayed by 30+ min</div>' : ''}</div></div>`).join('');
  return `<article class="fx"><div class="fx-m"><div class="fx-air">${fxBadge(i)}<div><b>${esc(i.airlines.length > 1 ? i.airlines.join(' + ') : i.airline)}</b><div class="sub">${esc(i.nos.join(' · '))}${i.cls ? ' · ' + esc(i.cls) : ''}</div></div></div>
  <div class="fx-t"><div class="tmb"><div class="tt">${hm(i.dep)}</div><div class="sub">${esc(i.from)}</div></div><div class="fx-mid"><span>${mins(i.dur)}</span><div class="ln"><u></u>${Array.from({ length: i.stops }, () => '<em></em>').join('')}<u></u></div><span class="${i.stops ? 'st' : 'st dr'}">${stopTxt(i)}${i.via ? ' · ' + esc(i.via) : ''}</span></div><div class="tmb"><div class="tt">${hm(i.arr)}</div><div class="sub">${esc(i.to)}</div></div></div>
  <div class="fx-p"><b>${fmt(i.price)}</b><small>${q.ret ? 'return · per person' : 'one way · per person'}</small>${i.best ? '<span class="bdg green">Top pick</span>' : ''}</div></div>
  <div class="fx-f"><button class="lnk" data-act="srOpen" data-a="${k}">Flight details ${ic('chev', 'sm')}</button><span class="fx-tags">${i.overnight ? '<span class="tg">Overnight</span>' : ''}${i.co2 ? `<span class="tg ${i.co2diff < 0 ? 'g' : ''}">${i.co2} kg CO₂${i.co2diff ? ' (' + (i.co2diff > 0 ? '+' : '') + i.co2diff + '%)' : ''}</span>` : ''}</span><span class="grow"></span><button class="btn sm" data-act="srQuote" data-a="${k}">Request quote</button>${isStaff() ? `<button class="btn sm pri" data-act="srBook" data-a="${k}">Create booking</button>` : ''}</div>
  <div class="fx-d" id="fd-${k}" hidden>${segs}${(i.ext || []).length ? `<div class="fx-tags" style="margin-top:10px">${i.ext.map(x => `<span class="tg">${esc(x)}</span>`).join('')}</div>` : ''}${q.ret ? `<p class="hint" style="margin-top:8px">Fare shown is for the complete return trip. Return flight options are confirmed by the office when you request a quote.</p>` : ''}</div></article>`;
}
function flightRes() {
  const s = SR(), all = s.res.items, q = s.sentQ; if (!all.length) return `<div class="card">${empty('search', 'No flights found', 'Try different dates, nearby airports or remove Direct only.')}</div>`;
  const airs = uniq(all.map(i => i.airline)).sort(), mx = Math.max(...all.map(i => i.price)), mn = Math.min(...all.map(i => i.price)), cap = s.maxp || mx;
  const fnq = s.fn.toLowerCase().replace(/\s/g, '');
  const base = all.filter(i => (!s.fa.length || s.fa.includes(i.airline)) && (!s.tb.length || s.tb.includes(band(hour(i.dep)))) && i.price <= cap && (!fnq || i.nos.join('').toLowerCase().replace(/\s/g, '').includes(fnq)));
  const rows = base.filter(i => s.stops === '' || i.stops <= +s.stops).sort((a, b) => s.sort === 'cheap' ? a.price - b.price : s.sort === 'fast' ? a.dur - b.dur : (b.best ? 1 : 0) - (a.best ? 1 : 0) || a.price - b.price);
  const low = a => a.length ? Math.min(...a.map(i => i.price)) : 0, best = [...all].sort((a, b) => (b.best ? 1 : 0) - (a.best ? 1 : 0) || a.price - b.price)[0], fast = [...all].sort((a, b) => a.dur - b.dur)[0], cheap = [...all].sort((a, b) => a.price - b.price)[0];
  const sortTab = (id, l, it, sub) => `<button class="sx-st ${s.sort === id ? 'on' : ''}" data-act="srSortTab" data-a="${id}"><b>${l}</b><strong>${fmt(it.price)}</strong><small>${sub}</small></button>`;
  const ins = s.res.insight;
  const stopOpt = [['', 'Any', all], ['0', 'Direct', all.filter(i => !i.stops)], ['1', '1 stop or fewer', all.filter(i => i.stops <= 1)]];
  return `<div class="sx-sum"><div><h3>${esc(q.fromT || q.from)} <i>→</i> ${esc(q.toT || q.to)}</h3><p>${esc(sdate(q.date))}${q.ret ? ' – ' + esc(sdate(q.ret)) : ' · one way'} · ${esc(paxTxt({ adults: q.adults, children: q.children, infants: q.infants, cls: q.cls }))}</p></div>
  ${ins && ins.level ? `<div class="sx-ins ${esc(ins.level)}"><b>Prices are ${esc(ins.level)} right now</b><span>${ins.typical.length === 2 ? 'Typical ' + fmt(ins.typical[0]) + ' – ' + fmt(ins.typical[1]) : ''}</span></div>` : ''}</div>
  <div class="sx-sorts">${sortTab('best', 'Best', best, mins(best.dur) + ' · ' + stopTxt(best))}${sortTab('cheap', 'Cheapest', cheap, mins(cheap.dur) + ' · ' + stopTxt(cheap))}${sortTab('fast', 'Fastest', fast, mins(fast.dur) + ' · ' + stopTxt(fast))}</div>
  <div class="rs"><aside class="card fside"><div class="row sb"><b style="font-size:15px">Filters</b><button class="lnk" data-act="srReset">Reset</button></div>
  <h4>Stops</h4>${stopOpt.map(o => `<label><input type="radio" name="st" ${s.stops === o[0] ? 'checked' : ''} data-chg="srStops" value="${o[0]}">${o[1]}<span class="pf">${o[2].length ? fmt(low(o[2])) : '–'}</span></label>`).join('')}
  <h4>Departure time</h4><div class="sx-bands">${BANDS.map(b => `<button class="${s.tb.includes(b[0]) ? 'on' : ''}" data-act="srBand" data-a="${b[0]}"><b>${b[1]}</b><small>${b[2]}</small></button>`).join('')}</div>
  <h4>Max price <span class="sx-val">${fmt(cap)}</span></h4><input type="range" class="sx-rng" min="${mn}" max="${mx}" step="500" value="${cap}" data-inp="srMax" data-chg="srMaxC">
  <h4>Airlines</h4>${airs.map(a => `<label><input type="checkbox" ${s.fa.includes(a) ? 'checked' : ''} data-chg="srAir" value="${esc(a)}">${esc(a)}<span class="pf">${fmt(low(all.filter(i => i.airline === a)))}</span></label>`).join('')}
  <h4>Flight number</h4><input placeholder="e.g. SV 739" value="${esc(s.fn)}" data-inp="srFn"></aside>
  <div><div class="row sb" style="margin-bottom:10px"><b>${rows.length} of ${all.length} flights</b><span class="sub">${s.res.staff && s.res.markup ? 'Includes ' + s.res.markup + '% markup · ' : ''}live fares, cached up to 10 min</span></div>
  ${rows.map(i => flightCard(i, all.indexOf(i), all)).join('') || `<div class="card">${empty('filter', 'No flights match these filters', 'Reset the filters to see all results.')}</div>`}</div></div>`;
}
ACT.srOpen = (k, t) => { const d = $('#fd-' + k); if (!d) return; d.hidden = !d.hidden; t.classList.toggle('open', !d.hidden); };
ACT.srSortTab = v => { SR().sort = v; drawRes(); };
ACT.srBand = v => { const s = SR(); s.tb = s.tb.includes(v) ? s.tb.filter(x => x !== v) : [...s.tb, v]; drawRes(); };
ACT.srReset = () => { const s = SR(); Object.assign(s, { fa: [], stops: '', tb: [], maxp: 0, fn: '', hs: [], hr: 0, hfree: false, hmax: 0 }); drawRes(); };
INP.srMax = (v, t) => { const o = t.parentElement.querySelector('.sx-val'); if (o) o.textContent = fmt(+v); };
CHG.srMaxC = v => { const s = SR(); s.maxp = +v; s.hmax = +v; drawRes(); };
CHG.srStops = v => { SR().stops = v; drawRes(); };
CHG.srAir = (c, t) => { const s = SR(); s.fa = c ? [...s.fa, t.value] : s.fa.filter(x => x !== t.value); drawRes(); };
INP.srFn = debounce(v => { SR().fn = v; drawRes(); const e = $('input[data-inp=srFn]'); if (e) { e.focus(); e.setSelectionRange(v.length, v.length); } }, 300);

function hotelRes() {
  const s = SR(), all = s.res.items, q = s.sentQ; if (!all.length) return `<div class="card">${empty('search', 'No hotels found', 'Try different dates or destination.')}</div>`;
  const n = Math.max(1, diffDays(q.cin, q.cout)), mx = Math.max(...all.map(i => i.price)), mn = Math.min(...all.map(i => i.price)), cap = s.hmax || mx;
  const rows = all.filter(i => (!s.hs.length || s.hs.includes(String(i.stars))) && (!s.hr || i.rating >= s.hr) && (!s.hfree || i.free) && i.price <= cap)
    .sort((a, b) => s.hsort === 'rating' ? b.rating - a.rating : s.hsort === 'cheap' ? a.price - b.price : s.hsort === 'reviews' ? b.reviews - a.reviews : 0);
  return `<div class="sx-sum"><div><h3>${esc(q.city)}</h3><p>${esc(sdate(q.cin))} – ${esc(sdate(q.cout))} · ${n} night${n > 1 ? 's' : ''} · ${esc(paxTxt({ adults: q.adults, children: q.children }, 1))}</p></div>
  <select data-chg="srHs" class="sx-sel">${opts([['', 'Best match'], ['cheap', 'Lowest price'], ['rating', 'Top rated'], ['reviews', 'Most reviewed']], s.hsort)}</select></div>
  <div class="rs"><aside class="card fside"><div class="row sb"><b style="font-size:15px">Filters</b><button class="lnk" data-act="srReset">Reset</button></div>
  <h4>Star rating</h4><div class="chips">${[5, 4, 3].map(n2 => `<button class="chip ${s.hs.includes(String(n2)) ? 'on' : ''}" data-act="srStar" data-a="${n2}">${n2}★</button>`).join('')}</div>
  <h4>Guest rating</h4>${[[0, 'Any'], [3.5, '3.5+ Good'], [4, '4.0+ Very good'], [4.5, '4.5+ Exceptional']].map(o => `<label><input type="radio" name="hr" ${+s.hr === o[0] ? 'checked' : ''} data-chg="srHr" value="${o[0]}">${o[1]}</label>`).join('')}
  <h4>Booking</h4><label><input type="checkbox" ${s.hfree ? 'checked' : ''} data-chg="srHfree">Free cancellation</label>
  <h4>Max price / night <span class="sx-val">${fmt(cap)}</span></h4><input type="range" class="sx-rng" min="${mn}" max="${mx}" step="500" value="${cap}" data-inp="srMax" data-chg="srMaxC"></aside>
  <div><div class="row sb" style="margin-bottom:10px"><b>${rows.length} of ${all.length} stays</b><span class="sub">${s.res.staff && s.res.markup ? 'Includes ' + s.res.markup + '% markup · ' : ''}prices per night</span></div>
  ${rows.map(i => { const k = all.indexOf(i); return `<article class="hx"><div class="hx-im"><div class="m" ${i.img ? `style="background-image:url('${esc(i.img)}')"` : ''}></div><div class="th">${(i.imgs || []).slice(1, 4).map(u => `<div style="background-image:url('${esc(u)}')"></div>`).join('')}</div></div>
  <div class="hx-b"><div class="row sb" style="align-items:flex-start"><div><h4>${esc(i.name)}</h4>${i.stars ? `<span class="hx-st">${'★'.repeat(i.stars)}</span>` : ''}${i.eco ? '<span class="tg g">Eco certified</span>' : ''}</div>${i.rating ? `<div class="hx-rt"><span><b>${ratingLbl(i.rating)}</b>${i.reviews ? '<small>' + i.reviews.toLocaleString() + ' reviews</small>' : ''}</span><em>${i.rating.toFixed(1)}</em></div>` : ''}</div>
  ${(i.near || []).length ? `<div class="hx-n">${(i.near || []).map(x => `<span>${ic('pin', 'sm')} ${esc(x.name)}${x.t ? ' · ' + esc(x.t) : ''}</span>`).join('')}</div>` : ''}
  <div class="hx-am">${(i.amenities || []).slice(0, 6).map(a => `<span class="tg">${esc(a)}</span>`).join('')}</div>
  <div class="hx-f"><div>${i.free ? '<span class="tg g">Free cancellation</span> ' : ''}${i.deal ? `<span class="tg r">${esc(i.deal)}</span>` : ''}</div><div class="hx-pr"><small>per night</small><b>${fmt(i.price)}</b>${i.total ? `<small>${fmt(i.total)} total · ${n} night${n > 1 ? 's' : ''}</small>` : ''}</div></div>
  <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn sm" data-act="hoQuote" data-a="${k}">Request quote</button>${isStaff() ? `<button class="btn sm pri" data-act="hoBook" data-a="${k}">Create booking</button>` : ''}</div></div></article>`; }).join('') || `<div class="card">${empty('filter', 'No stays match these filters', 'Reset the filters to see all results.')}</div>`}</div></div>`;
}
ACT.srStar = n => { const s = SR(); s.hs = s.hs.includes(n) ? s.hs.filter(x => x !== n) : [...s.hs, n]; drawRes(); };
CHG.srHs = v => { SR().hsort = v; drawRes(); }; CHG.srHr = v => { SR().hr = +v; drawRes(); }; CHG.srHfree = v => { SR().hfree = v; drawRes(); };
VIEWS.search = { title: 'Flights & hotels', roles: ['admin', 'staff', 'agent'], noLive: true, render() { return `${searchBar()}<div id="srres">${resHtml()}</div>`; } };

/* result -> query / booking */
const flightText = i => `${i.airline} ${i.nos.join('/')} · ${i.from} ${hm(i.dep)} → ${i.to} ${hm(i.arr)} · ${i.stops ? i.stops + ' stop' : 'non-stop'} · ${SR().sentQ.date}${SR().sentQ.ret ? ' / return ' + SR().sentQ.ret : ''} · ${SR().sentQ.adults} traveller(s)`;
const hotelText = i => `${i.name} (${i.stars || '?'}★) · ${SR().sentQ.city} · ${SR().sentQ.cin} → ${SR().sentQ.cout} · ${SR().sentQ.adults} guest(s)`;
function askQuote(type, text, details) {
  openModal({ title: 'Request a quote', body: `<div class="okbox" style="margin-bottom:12px">${esc(text)}</div>${fld('Additional notes', '<textarea id="qq-n" placeholder="Number of rooms, preferred times, passenger names..."></textarea>')}<p class="hint" style="margin-top:8px">${esc(type === 'flight' ? 'Flight' : 'Hotel')} queries are auto-rejected if the office does not respond within ${S.sla[type]} hour(s).</p>`,
    foot: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="qqSend">Send query</button>' }); UI.qq = { type, text, details };
}
ACT.qqSend = async (a, b) => { const q = UI.qq; await doRpc(b, 'addQuery', { type: q.type, text: q.text + (val('qq-n') ? '\n' + val('qq-n') : ''), details: q.details, source: 'search' }, 'Query sent', () => { closeModal(); go('queries'); }); };
ACT.srQuote = k => { const i = SR().res.items[k]; askQuote('flight', flightText(i), { kind: 'flight', airline: i.airline, fno: i.nos.join('/'), from: i.from, to: i.to, date: SR().sentQ.date, ret: SR().sentQ.ret || '', pax: SR().sentQ.adults }); };
ACT.hoQuote = k => { const i = SR().res.items[k]; askQuote('hotel', hotelText(i), { kind: 'hotel', hotel: i.name, city: SR().sentQ.city, cin: SR().sentQ.cin, cout: SR().sentQ.cout, pax: SR().sentQ.adults }); };
ACT.srBook = k => {
  const i = SR().res.items[k], q = SR().sentQ, s = SVC_DEF('flight'); Object.assign(s.d, { airline: i.airline, fno: i.nos[0] || '', from: i.from, to: i.to, date: q.date, dep: hm(i.dep), arr: hm(i.arr), cls: i.cls || 'Economy' }); if (q.ret) { s.d.rdate = q.ret; s.d.rfrom = i.to; s.d.rto = i.from; }
  Object.assign(s, { qty: +q.adults || 1, sell: i.price, cost: i.base, title: `${i.airline} ${i.nos[0] || ''} ${i.from}-${i.to}`.trim() }); UI.prefill = { category: 'Custom', services: [s] }; toast('Check the fare per traveller before saving'); go('bookingform', 'new');
};
ACT.hoBook = k => {
  const i = SR().res.items[k], q = SR().sentQ, s = SVC_DEF('hotel'), n = Math.max(1, diffDays(q.cin, q.cout)); Object.assign(s.d, { hotel: i.name, city: q.city, stars: String(i.stars || ''), cin: q.cin, cout: q.cout });
  Object.assign(s, { qty: n, sell: i.price, cost: i.base, title: i.name }); UI.prefill = { category: 'Accommodation Only', services: [s] }; toast('Quantity is nights - price per night'); go('bookingform', 'new');
};

/* ======================= QUERY DESK ======================= */
const qf = () => UI.f.q || (UI.f.q = { tab: 'active' });
const QIC = { flight: 'plane', hotel: 'hotel', visa: 'passport', transport: 'bus', package: 'dome', other: 'bell' };
const qrows = () => { const f = qf(), g = { active: ['Open', 'Quoted'], done: ['Accepted', 'Booked'], closed: ['Rejected', 'Expired', 'Cancelled'] }[f.tab]; return (S.queries || []).filter(q => g.includes(q.status) && (!f.type || q.type === f.type) && (!f.q || (q.no + q.text + q.contact.phone + q.contact.name + (q.partyId ? P(q.partyId).name : '')).toLowerCase().includes(f.q.toLowerCase()))).sort((a, b) => (f.tab === 'active' ? (a.dueAt < b.dueAt ? -1 : 1) : (b.createdAt < a.createdAt ? -1 : 1))); };
function qCard(q) {
  const staff = isStaff(), who = q.partyId ? P(q.partyId).name : (q.contact.name || q.contact.phone || '');
  return `<div class="card qc"><div class="qi">${ic(QIC[q.type])}</div><div><div class="row"><b class="bno">${esc(q.no)}</b><span class="pill">${esc(q.type)}</span>${q.source === 'whatsapp' ? `<span class="bdg green">${ic('wa', 'sm')} WhatsApp</span>` : q.source === 'search' ? '<span class="bdg blue">from search</span>' : ''}${badge(q.status, LABEL[q.status])}</div>
  <div class="sub" style="margin-top:3px">${esc(who)}${q.contact.phone && q.partyId ? ' · ' + esc(q.contact.phone) : q.source === 'whatsapp' && !q.partyId ? '' : ''} · ${ftime(q.createdAt)}</div><div class="tx">${esc(q.text)}</div>
  ${q.resp ? `<div class="resp ${q.status === 'Rejected' || q.status === 'Expired' ? 'rj' : ''}"><b>${q.status === 'Quoted' || q.status === 'Accepted' || q.status === 'Booked' ? (q.resp.amt ? 'Quote: ' + fmt(q.resp.amt) : 'Response') : q.status === 'Expired' ? 'Auto-rejected' : 'Rejected'}</b> · ${esc(q.resp.by)}<br>${esc(q.resp.text)}</div>` : ''}</div>
  <div style="text-align:right;display:grid;gap:6px;justify-items:end">${q.status === 'Open' ? `<div><div class="sub">Respond within</div>${slaChip(q.dueAt)}</div>` : ''}
  ${staff && ['Open', 'Quoted', 'Expired'].includes(q.status) ? `<button class="btn sm pri" data-act="qResp" data-a="${q.id}">${q.status === 'Quoted' ? 'Update quote' : 'Reply with quote'}</button>` : ''}
  ${staff && ['Open', 'Quoted'].includes(q.status) ? `<button class="btn sm" data-act="qRej" data-a="${q.id}">Reject</button>` : ''}${staff && ['Open', 'Quoted', 'Accepted'].includes(q.status) ? `<button class="btn sm gold" data-act="qBook" data-a="${q.id}">Convert to booking</button>` : ''}
  ${!staff && q.status === 'Quoted' ? `<button class="btn sm pri" data-act="qAcc" data-a="${q.id}">Accept quote</button>` : ''}${!staff && q.status === 'Accepted' ? '<span class="sub">The office will create your booking</span>' : ''}
  ${(q.status === 'Open' || q.status === 'Quoted') && (!staff) ? `<button class="btn sm ghost" data-act="qCancel" data-a="${q.id}">Cancel query</button>` : ''}${isAdmin() ? `<button class="btn sm ghost" data-act="qDel" data-a="${q.id}">${ic('trash', 'sm')}</button>` : ''}</div></div>`;
}
const qList = () => { const r = qrows(); return r.length ? r.map(qCard).join('') : `<div class="card">${empty('bell', 'No queries here', qf().tab === 'active' ? (isStaff() ? 'New queries from agents, search results and WhatsApp land here.' : 'Ask the office for any flight, hotel, visa or transport quote.') : 'Nothing in this list yet.')}</div>`; };
VIEWS.queries = {
  title: 'Queries', roles: ['admin', 'staff', 'agent'],
  render() {
    const f = qf(), n = k => (S.queries || []).filter(q => ({ active: ['Open', 'Quoted'], done: ['Accepted', 'Booked'], closed: ['Rejected', 'Expired', 'Cancelled'] }[k]).includes(q.status)).length;
    return `<div class="ph"><div><h1>Queries</h1><p>Requests are auto-rejected when unanswered: ${Object.entries(S.sla).map(([k, v]) => k + ' ' + v + 'h').join(' · ')}</p></div><div class="sp"><button class="btn pri" data-act="qNew">${ic('plus')}New query</button></div></div>
    <div class="row sb" style="margin-bottom:14px"><div class="tabs">${[['active', 'Active'], ['done', 'Accepted / booked'], ['closed', 'Closed']].map(t => `<button class="${f.tab === t[0] ? 'on' : ''}" data-act="qTab" data-a="${t[0]}">${t[1]} <span class="faint">${n(t[0])}</span></button>`).join('')}</div><div class="row"><select data-chg="qF" data-k="type" style="width:auto">${opts(['flight', 'hotel', 'visa', 'transport', 'package', 'other'], f.type, 'All types')}</select><div class="gs" style="background:#fff;width:220px"><input placeholder="Search..." value="${esc(f.q || '')}" data-inp="qQ"></div></div></div><div id="qlist">${qList()}</div>`;
  }
};
ACT.qTab = t => { qf().tab = t; renderView(); };
CHG.qF = (v, t) => { qf()[t.dataset.k] = v; renderView(); };
INP.qQ = debounce(v => { qf().q = v; $('#qlist').innerHTML = qList(); });
ACT.qNew = () => openModal({ title: 'New query', body: `<div class="g1">${isStaff() ? fld('Agent / customer (optional)', `<select id="nq-p">${opts((S.parties || []).filter(p => p.kind !== 'supplier').map(p => [p.id, p.name]), '', 'Walk-in / unknown')}</select>`) : ''}${fld('Type', `<select id="nq-t">${opts([['flight', 'Flight'], ['hotel', 'Hotel'], ['visa', 'Visa'], ['transport', 'Transport'], ['package', 'Package'], ['other', 'Other']])}</select>`)}${fld('What do you need? *', '<textarea id="nq-x" placeholder="Sector, dates, number of travellers, hotel preferences..."></textarea>')}${isStaff() ? `<div class="g2">${fld('Contact name', '<input id="nq-cn">')}${fld('Contact phone', '<input id="nq-cp">')}</div>` : ''}<p class="hint">Unanswered queries are rejected automatically after the response time for their type (flights: ${S.sla.flight}h).</p></div>`, foot: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="nqSave">Send query</button>' });
ACT.nqSave = async (a, b) => { await doRpc(b, 'addQuery', { type: val('nq-t'), text: val('nq-x'), partyId: val('nq-p') ? +val('nq-p') : undefined, contactName: val('nq-cn'), contactPhone: val('nq-cp') }, 'Query created', closeModal); };
ACT.qResp = id => { const q = S.queries.find(x => x.id === id); openModal({ title: 'Reply to ' + q.no, body: `<div class="g1"><div class="okbox" style="white-space:pre-line">${esc(q.text)}</div>${fld('Quoted amount (PKR)', `<input id="qr-a" type="number" value="${q.resp ? q.resp.amt : ''}">`)}${fld('Message to the agent', `<textarea id="qr-t">${esc(q.resp ? q.resp.text : '')}</textarea>`)}</div>`, foot: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="qrSend" data-a="' + id + '">Send quote</button>' }); };
ACT.qrSend = async (id, b) => { await doRpc(b, 'respondQuery', { id, amt: val('qr-a'), text: val('qr-t') }, 'Quote sent', closeModal); };
ACT.qRej = id => { const t = prompt('Reason for rejecting (shown to the agent)'); if (t !== null) doRpc(null, 'rejectQuery', { id, text: t }, 'Query rejected'); };
ACT.qAcc = async id => { if (await confirmBox('Accept quote', 'Accept this quote? The office will then create your booking.', 'Accept')) await doRpc(null, 'acceptQuery', { id }, 'Quote accepted'); };
ACT.qCancel = async id => { await doRpc(null, 'cancelQuery', { id }, 'Query cancelled'); };
ACT.qDel = async id => { if (await confirmBox('Delete query', 'Remove this query permanently?', 'Delete', true)) await doRpc(null, 'delQuery', { id }, 'Query deleted'); };
ACT.qBook = id => {
  const q = S.queries.find(x => x.id === id), type = ['flight', 'hotel', 'visa', 'transport'].includes(q.type) ? q.type : q.type === 'package' ? 'package' : 'other', s = SVC_DEF(type), d = q.details || {};
  if (type === 'flight' && d.from) Object.assign(s.d, { airline: d.airline, fno: d.fno, from: d.from, to: d.to, date: d.date, rdate: d.ret || '' }); if (type === 'hotel' && d.hotel) Object.assign(s.d, { hotel: d.hotel, city: d.city, cin: d.cin, cout: d.cout });
  if (type === 'other') s.d.desc = q.text.slice(0, 120); s.title = type === 'other' ? q.text.slice(0, 60) : ''; s.sell = q.resp ? q.resp.amt : ''; if (d.pax) s.qty = +d.pax || 1;
  UI.prefill = { partyId: q.partyId || '', services: [s], notes: q.text, queryId: q.id, category: type === 'visa' ? 'Visa Only' : type === 'hotel' ? 'Accommodation Only' : 'Custom' }; go('bookingform', 'new');
};
