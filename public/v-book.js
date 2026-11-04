/* Bookings: list, travellers, form, detail, vouchers */
'use strict';
const BF_DEF = () => ({ id: '', partyId: '', category: (S.categories || [])[0] || 'Custom', pax: [{ n: '', pp: '', dob: '', nat: 'Pakistani', g: 'M', t: 'Adult' }], services: [], notes: '', internal: '', groupRef: null, queryId: null, confirm: isAdmin(), force: false });
const SVC_DEF = type => {
  const d = { visa: { vtype: 'Umrah', entry: 'Single', duration: '', ref: '' }, hotel: { city: 'Makkah', hotel: '', stars: '5', room: '', meal: 'Room only', rooms: 1, cin: '', cout: '', dist: '' }, transport: { route: '', vehicle: '', date: '', time: '', pickup: '', drop: '' },
    flight: { airline: '', fno: '', from: '', to: '', date: '', dep: '', arr: '', pnr: '', cls: 'Economy', rfno: '', rdate: '', rfrom: '', rto: '', rdep: '', rarr: '' }, package: {}, other: { desc: '' } }[type];
  return { id: '', type, title: '', qty: 1, sell: '', cost: '', supId: '', conf: '', from: '', to: '', d: { ...d } };
};
const sfrom = s => ({ hotel: s.d.cin, flight: s.d.date, transport: s.d.date }[s.type] || s.from || ''), sto = s => ({ hotel: s.d.cout, flight: s.d.rdate || s.d.date, transport: s.d.date }[s.type] || s.to || '');

/* ======================= LIST ======================= */
const bf = () => UI.f.bookings || (UI.f.bookings = {});
CHG.bfld = (v, t) => { bf()[t.dataset.k] = v; renderView(); };
INP.bsearch = debounce(v => { bf().q = v; const r = $('#bres'); if (r) { r.innerHTML = bres(); } }, 160);
ACT.bq = k => { bf().quick = bf().quick === k ? '' : k; renderView(); };
ACT.bmore = () => { bf().lim = (bf().lim || 60) + 100; renderView(); };

/* ======================= VOUCHERS ======================= */
async function makeV(bid, kind, sid, extra = {}) {
  const w = window.open('', '_blank');
  try { const r = await rpc('makeVoucher', { bid, kind, sid, ...extra }); S.rev = -1; if (w) w.location = '/v/' + r.token; else location.href = '/v/' + r.token; toast('Voucher ready'); load().then(renderView); return r; }
  catch (e) { if (w) w.close(); toast(e.message, true); }
}
ACT.v1 = id => makeV(id, 'all', '');
ACT.vk = a => { const [bid, kind, sid] = a.split('|'); makeV(bid, kind, sid || ''); };
ACT.vmenu = (id, t) => { const open = $('.pop', t.parentElement); $$('.pop').forEach(x => x.remove()); if (open) return; const b = S.bookings.find(x => x.id === id); const d = document.createElement('div'); d.className = 'pop';
  d.innerHTML = `<small>One-tap vouchers</small><button data-act="vk" data-a="${id}|all|">${ic('ticket')}Full booking voucher</button><hr><small>Per service</small>${b.services.filter(s => ['hotel', 'transport', 'flight', 'visa', 'package'].includes(s.type)).map(s => `<button data-act="vk" data-a="${id}|${s.type}|${s.id}">${ic(SVC[s.type].ic)}${esc(SVC[s.type].label)} - ${esc(s.title.slice(0, 26))}</button>`).join('')}<hr><button data-act="vcustom" data-a="${id}">${ic('edit')}Custom voucher...</button>`;
  t.parentElement.appendChild(d); setTimeout(() => document.addEventListener('click', () => $$('.pop').forEach(x => x.remove()), { once: true }), 0); };
ACT.vcustom = id => { UI.cv = [{ k: '', v: '' }, { k: '', v: '' }, { k: '', v: '' }]; openModal({ title: 'Custom voucher', body: `<div class="g1">${fld('Voucher title', '<input id="cv-t" placeholder="e.g. Ziyarat tour voucher">')}<div id="cv-rows"></div><button class="btn sm" data-act="cvAdd">${ic('plus', 'sm')}Add row</button>${fld('Notes', '<textarea id="cv-n"></textarea>')}</div>`, foot: `<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="cvGo" data-a="${id}">Create voucher</button>`, onOpen: cvDraw }); };
const cvDraw = () => { $('#cv-rows').innerHTML = UI.cv.map((r, i) => `<div class="g2" style="margin-bottom:8px"><input placeholder="Label" value="${esc(r.k)}" data-inp="cvk" data-i="${i}"><input placeholder="Value" value="${esc(r.v)}" data-inp="cvv" data-i="${i}"></div>`).join(''); };
INP.cvk = (v, t) => { UI.cv[t.dataset.i].k = v; }; INP.cvv = (v, t) => { UI.cv[t.dataset.i].v = v; };
ACT.cvAdd = () => { UI.cv.push({ k: '', v: '' }); cvDraw(); };
ACT.cvGo = async id => { closeModal(); await makeV(id, 'custom', '', { title: val('cv-t'), rows: UI.cv, notes: val('cv-n') }); };

/* ======================= DETAIL ======================= */
function svcDetail(s) {
  const d = s.d || {}, kv = (l, v) => (v ? `<div><div class="l">${l}</div><div class="v">${esc(v)}</div></div>` : '');
  const rows = { hotel: [kv('City', d.city), kv('Stars', d.stars ? '★'.repeat(+d.stars) : ''), kv('Check-in', fdate(d.cin)), kv('Check-out', fdate(d.cout)), kv('Room', d.room), kv('Rooms', d.rooms), kv('Meal', d.meal), kv('Distance', d.dist)],
    transport: [kv('Route', d.route), kv('Vehicle', d.vehicle), kv('Date', d.date ? fdate(d.date) : ''), kv('Time', d.time), kv('Pick-up', d.pickup), kv('Drop-off', d.drop)],
    flight: [kv('Airline', d.airline), kv('Flight', d.fno), kv('Sector', (d.from || '') + ' → ' + (d.to || '')), kv('Date', d.date ? fdate(d.date) : ''), kv('Times', (d.dep || '') + ' - ' + (d.arr || '')), kv('PNR', d.pnr), kv('Return', d.rfno ? d.rfno + ' · ' + fdate(d.rdate) : '')],
    visa: [kv('Type', d.vtype), kv('Entry', d.entry), kv('Validity', d.duration), kv('Reference', d.ref)], package: [kv('Airline', d.airline), kv('Room', d.room), kv('Makkah', d.makkah ? d.makkah + ' (' + d.mkn + 'N)' : ''), kv('Madinah', d.madinah ? d.madinah + ' (' + d.mdn + 'N)' : ''), kv('Group', d.code)], other: [kv('Details', d.desc)] }[s.type] || [];
  return rows.join('');
}
const canEdit = b => (isStaff() && can('bookings.edit')) || (isAgent() && b.status === 'Pending');
VIEWS.booking = {
  title: id => { const b = (S.bookings || []).find(x => x.id === id); return b ? 'Booking ' + b.no : 'Booking'; },
  render(id) {
    const b = (S.bookings || []).find(x => x.id === id || x.no === id); if (!b) return empty('search', 'Booking not found', 'It may have been removed.', '<a class="btn" href="#/bookings">Back to bookings</a>');
    const staff = isStaff(), sup = isSup(), pay = (S.payments || []).filter(p => p.bookingId === b.id && p.status === 'Approved'), vs = (S.vouchers || []).filter(v => v.bookingId === b.id);
    const sell = bSell(b), cost = bCost(b), cancelled = b.status === 'Cancelled';
    return `<div class="no-print" style="margin-bottom:10px"><a class="btn ghost sm" href="#/bookings">${ic('back', 'sm')}All bookings</a></div>
    ${b.status === 'Pending' ? `<div class="pendbar">${ic('clock')}<span>Awaiting administrator approval - vouchers show a PENDING watermark until approved.</span>${canApprove() ? `<span class="sp"><button class="btn pri sm" data-act="approve" data-a="${esc(b.id)}">${ic('check', 'sm')}Approve booking</button></span>` : ''}</div>` : ''}
    <div class="card"><div class="bhead"><div><div class="sub">Booking number</div><div class="big">${esc(b.no)}</div><div class="row" style="margin-top:6px">${sbadge(b.status)}<span class="pill">${esc(b.category)}</span>${staff ? `<span class="pill">${ic('users', 'sm')}<a href="#/account/${b.partyId}">${esc(P(b.partyId).name)}</a></span>` : ''}</div></div>
    <div class="acts no-print">${sup ? '' : `<div class="rel"><button class="btn gold" data-act="vmenu" data-a="${esc(b.id)}">${ic('ticket')}Voucher ${ic('chev', 'sm')}</button></div>`}${canEdit(b) && !cancelled ? `<a class="btn" href="#/bookingform/edit/${esc(b.id)}">${ic('edit')}Edit</a>` : ''}
    ${staff && can('bookings.edit') && b.status === 'Confirmed' ? `<button class="btn" data-act="setSt" data-a="${esc(b.id)}|Pending">Move to pending</button>` : ''}${(staff || (isAgent() && b.status === 'Pending')) && !cancelled ? `<button class="btn" data-act="cancelB" data-a="${esc(b.id)}">Cancel booking</button>` : ''}${staff && cancelled ? `<button class="btn" data-act="setSt" data-a="${esc(b.id)}|Pending">Reopen</button>` : ''}${can('bookings.delete') ? `<button class="btn ghost" data-act="delB" data-a="${esc(b.id)}" title="Delete permanently">${ic('trash')}</button>` : ''}</div></div>
    <div class="cp" style="border-top:1px solid var(--line2)"><div class="kvg"><div><div class="l">Travel start</div><div class="v">${b.from ? fdate(b.from) : '-'}</div></div><div><div class="l">Travel end / check-out</div><div class="v">${b.to ? fdate(b.to) : '-'}</div></div><div><div class="l">Booked</div><div class="v">${fdate(b.created)} &middot; ${esc(b.by)}</div></div>${b.approvedBy ? `<div><div class="l">Approved</div><div class="v">${esc(b.approvedBy)}</div></div>` : ''}${b.groupRef ? `<div><div class="l">Group package</div><div class="v">${esc(b.groupRef.gid)}</div></div>` : ''}</div></div></div>
    <div class="gap"></div><div class="gm"><div>
    <div class="card"><div class="ch"><h3>Travellers (${b.pax.length})</h3></div><div class="tw"><table class="t"><thead><tr><th>#</th><th>Name</th><th>Passport</th><th>Type</th><th>Nationality</th><th>DOB</th></tr></thead><tbody>${b.pax.map((x, i) => `<tr><td>${i + 1}</td><td><b>${esc(x.n)}</b></td><td class="mono">${esc(x.pp)}</td><td>${esc(x.t)}</td><td>${esc(x.nat)}</td><td>${x.dob ? fdate(x.dob) : '-'}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="gap"></div>${b.services.map(s => `<div class="card" style="margin-bottom:12px"><div class="ch"><span class="stype" style="color:${SVC[s.type].c}">${ic(SVC[s.type].ic)}${SVC[s.type].label}</span><h3>${esc(s.title)}</h3><span class="sp">${canCost() ? (s.supId ? `<span class="pill">${ic('building', 'sm')}${esc(P(s.supId).name)}</span>` : '<span class="pill">No supplier</span>') : ''}${s.cs === 'Confirmed' ? `<span class="bdg green">Conf. ${esc(s.conf)}</span>` : '<span class="bdg gray">Awaiting confirmation</span>'}</span></div>
    <div class="cp"><div class="kvg">${svcDetail(s)}</div><div class="row sb" style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--line)"><span class="sub">Qty ${s.qty}${sup ? '' : ' × ' + fmt(s.sell)}${canCost() ? ' &middot; cost ' + fmt(s.cost) + ' each' : ''}${sup ? ' &middot; cost ' + fmt(s.cost) + ' each' : ''}</span>${sup ? `<b>${fmt(lineCost(s))}</b>` : `<b class="num">${fmt(lineSell(s))}</b>`}</div>
    ${staff || sup ? `<div class="row no-print" style="margin-top:8px"><input id="cf-${esc(s.id)}" value="${esc(s.conf)}" placeholder="Supplier confirmation no." style="max-width:240px"><button class="btn sm" data-act="supConf" data-a="${esc(b.id)}|${esc(s.id)}">Save confirmation</button></div>` : ''}</div></div>`).join('')}
    ${b.notes ? `<div class="card cp"><div class="sec">Notes</div>${esc(b.notes)}</div>` : ''}${staff && b.internal ? `<div class="gap"></div><div class="card cp" style="background:var(--au0)"><div class="sec">Internal notes (staff only)</div>${esc(b.internal)}</div>` : ''}</div>
    <div>${sup ? '' : `<div class="card"><div class="ch"><h3>Financial summary</h3></div><div class="cp"><div class="row sb"><span>Total ${staff ? 'sale' : 'amount'}</span><b class="num">${fmt(sell)}</b></div>${staff ? `<div class="row sb"><span>Supplier cost</span><b class="num">${fmt(cost)}</b></div><div class="row sb" style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px"><span>Profit</span><b class="num ${sell - cost < 0 ? 'neg' : 'pos'}">${fmt(sell - cost)}</b></div>` : ''}${cancelled ? '<div class="hint" style="margin-top:8px">Cancelled - amounts were reversed in the ledgers.</div>' : ''}${pay.length ? `<div class="sec" style="margin-top:14px">Payments linked</div>${pay.map(p => `<div class="row sb sm"><span>${fdate(p.date)} ${esc(p.method)}</span><b>${fmt(p.amt)}</b></div>`).join('')}` : ''}</div></div><div class="gap"></div>`}
    ${vs.length ? `<div class="card"><div class="ch"><h3>Vouchers issued</h3></div>${vs.map(v => `<div class="item"><div class="mid"><b>${esc(v.no)}</b> <span class="pill">${esc(v.kind === 'all' ? 'Full' : v.kind)}</span><div class="sub">${ftime(v.createdAt)} &middot; ${esc(v.createdBy)}</div></div><a class="btn sm" target="_blank" href="/v/${v.token}">Open</a><button class="btn sm ghost" data-act="copyV" data-a="${v.token}" title="Copy share link">${ic('copy', 'sm')}</button></div>`).join('')}</div><div class="gap"></div>` : ''}
    <div class="card"><div class="ch"><h3>History</h3></div><div class="cp tl">${[...(b.history || [])].reverse().slice(0, 14).map(h => `<div><b style="font-size:13px">${esc(h.a)}</b><div class="sub">${esc(h.u)} &middot; ${ftime(h.t)}</div></div>`).join('')}</div></div></div></div>`;
  }
};
ACT.copyV = t => { navigator.clipboard.writeText(location.origin + '/v/' + t).then(() => toast('Voucher link copied')); };
ACT.setSt = async a => { const [id, status] = a.split('|'); await doRpc(null, 'setStatus', { id, status }, 'Booking updated'); };
ACT.cancelB = async id => { if (await confirmBox('Cancel booking', 'Cancelling reverses the amounts in the agent and supplier ledgers. Continue?', 'Cancel booking', true)) await doRpc(null, 'setStatus', { id, status: 'Cancelled' }, 'Booking cancelled'); };
ACT.delB = async id => { if (await confirmBox('Delete booking', 'This permanently removes the booking and its vouchers. Prefer cancelling so the history is kept.', 'Delete', true)) { await doRpc(null, 'delBooking', { id }, 'Booking deleted'); go('bookings'); } };

/* ======================= FORM ======================= */
let BF = null;
const setPath = (o, path, v) => { const k = path.split('.'); let c = o; for (let i = 0; i < k.length - 1; i++) c = c[k[i]]; c[k[k.length - 1]] = v; };
const knownPax = () => { const m = {}; (S.bookings || []).forEach(b => b.pax.forEach(x => { m[x.pp] = x; })); return m; };
function bfTotals() {
  if (!BF) return; const sell = sum(BF.services, lineSell), cost = sum(BF.services, lineCost), e = $('#bf-tot'); if (!e) return;
  e.innerHTML = `<div><span>Total</span><b>${fmt(sell)}</b></div>${canCost() ? `<div><span>Cost</span><b>${fmt(cost)}</b></div><div><span>Profit</span><b class="${sell - cost < 0 ? 'neg' : ''}">${fmt(sell - cost)}</b></div>` : ''}`;
  const dts = BF.services.flatMap(s => [sfrom(s), sto(s)]).filter(Boolean).sort(), d = $('#bf-dates'); if (d) d.textContent = dts.length ? fdate(dts[0]) + (dts.length > 1 && dts[dts.length - 1] !== dts[0] ? ' → ' + fdate(dts[dts.length - 1]) : '') : 'Set by your service dates';
}
const inpB = (path, v, ph = '', t = 'text', extra = '') => `<input type="${t}" value="${esc(v)}" placeholder="${esc(ph)}" data-inp="b" data-p="${path}" ${extra}>`;
const selB = (path, v, list) => `<select data-chg="bsel" data-p="${path}">${opts(list, v)}</select>`;
INP.b = (v, t) => { setPath(BF, t.dataset.p, t.type === 'number' ? v : v); if (/^services\.\d+\.(qty|sell|cost)$/.test(t.dataset.p)) bfTotals(); else if (/\.(cin|cout|date|rdate|from|to)$/.test(t.dataset.p)) bfTotals(); };
CHG.bsel = (v, t) => { setPath(BF, t.dataset.p, v); if (t.dataset.p === 'partyId') bfAcct(); };
CHG.bpp = (v, t) => { const k = knownPax()[String(v).toUpperCase().replace(/\s+/g, '')], i = t.dataset.i; if (k && !BF.pax[i].n) { Object.assign(BF.pax[i], { n: k.n, dob: k.dob, nat: k.nat, g: k.g, t: k.t }); bfRender(); toast('Traveller found from a previous booking'); } };
function paxRow(x, i) {
  return `<div class="paxrow"><div class="fld"><span>Passport no. *</span><input value="${esc(x.pp)}" placeholder="AB1234567" data-inp="b" data-p="pax.${i}.pp" data-chg="bpp" data-i="${i}" list="ppl" style="text-transform:uppercase" autocomplete="off"></div>
  <div class="fld"><span>Full name *</span>${inpB('pax.' + i + '.n', x.n, 'As in passport')}</div><div class="fld"><span>Type</span>${selB('pax.' + i + '.t', x.t, ['Adult', 'Child', 'Infant'])}</div><div class="fld"><span>Sex</span>${selB('pax.' + i + '.g', x.g, [['M', 'Male'], ['F', 'Female']])}</div>
  <div class="fld"><span>Date of birth</span>${inpB('pax.' + i + '.dob', x.dob, '', 'date')}</div><div class="fld"><span>Nationality</span>${inpB('pax.' + i + '.nat', x.nat)}</div><div>${BF.pax.length > 1 ? `<button class="btn ghost icon" data-act="bfDelPax" data-a="${i}">${ic('trash')}</button>` : ''}</div></div>`;
}
function svcForm(s, i) {
  const p = 'services.' + i + '.', d = p + 'd.', D = s.d, staff = canCost();
  const body = {
    hotel: `<div class="sg">${fld('Hotel name', inpB(d + 'hotel', D.hotel, 'Hotel name'))}${fld('City', selB(d + 'city', D.city, ['Makkah', 'Madinah', 'Jeddah', 'Other']))}${fld('Star category', selB(d + 'stars', D.stars, [['', 'Unrated'], '2', '3', '4', '5']))}${fld('Rooms', inpB(d + 'rooms', D.rooms, '', 'number', 'min=1'))}</div>
      <div class="sg">${fld('Check-in', inpB(d + 'cin', D.cin, '', 'date'))}${fld('Check-out', inpB(d + 'cout', D.cout, '', 'date'))}${fld('Room type', inpB(d + 'room', D.room, 'Double / Quad...'))}${fld('Meal plan', selB(d + 'meal', D.meal, ['Room only', 'Breakfast', 'Half board', 'Full board']))}</div>${fld('Distance from Haram', inpB(d + 'dist', D.dist, 'e.g. 400 m'))}`,
    transport: `<div class="sg">${fld('Route', inpB(d + 'route', D.route, 'Jeddah Airport → Makkah'))}${fld('Vehicle', inpB(d + 'vehicle', D.vehicle, 'GMC / Hiace / Bus'))}${fld('Date', inpB(d + 'date', D.date, '', 'date'))}${fld('Pick-up time', inpB(d + 'time', D.time, '', 'time'))}</div><div class="g2">${fld('Pick-up point', inpB(d + 'pickup', D.pickup))}${fld('Drop-off point', inpB(d + 'drop', D.drop))}</div>`,
    flight: `<div class="sg">${fld('Airline', inpB(d + 'airline', D.airline))}${fld('Flight no.', inpB(d + 'fno', D.fno, 'SV 739'))}${fld('From', inpB(d + 'from', D.from, 'LHE'))}${fld('To', inpB(d + 'to', D.to, 'JED'))}</div><div class="sg">${fld('Date', inpB(d + 'date', D.date, '', 'date'))}${fld('Departs', inpB(d + 'dep', D.dep, '', 'time'))}${fld('Arrives', inpB(d + 'arr', D.arr, '', 'time'))}${fld('PNR', inpB(d + 'pnr', D.pnr))}</div>
      <div class="sec" style="margin:4px 0 0">Return flight (optional)</div><div class="sg">${fld('Flight no.', inpB(d + 'rfno', D.rfno))}${fld('Date', inpB(d + 'rdate', D.rdate, '', 'date'))}${fld('Departs', inpB(d + 'rdep', D.rdep, '', 'time'))}${fld('Arrives', inpB(d + 'rarr', D.rarr, '', 'time'))}</div>`,
    visa: `<div class="sg">${fld('Visa type', inpB(d + 'vtype', D.vtype))}${fld('Entry', selB(d + 'entry', D.entry, ['Single', 'Multiple']))}${fld('Validity', inpB(d + 'duration', D.duration, '30 days'))}${fld('Reference', inpB(d + 'ref', D.ref))}</div>`,
    package: `<div class="sg">${fld('Airline', inpB(d + 'airline', D.airline))}${fld('Room type', inpB(d + 'room', D.room))}${fld('Makkah hotel', inpB(d + 'makkah', D.makkah))}${fld('Madinah hotel', inpB(d + 'madinah', D.madinah))}</div><div class="sg">${fld('From', inpB(p + 'from', s.from, '', 'date'))}${fld('To', inpB(p + 'to', s.to, '', 'date'))}</div>`,
    other: `${fld('Description', inpB(d + 'desc', D.desc, 'What is being provided'))}<div class="sg">${fld('Date from', inpB(p + 'from', s.from, '', 'date'))}${fld('Date to', inpB(p + 'to', s.to, '', 'date'))}</div>`
  }[s.type];
  return `<div class="svcc" style="border-left-color:${SVC[s.type].c}"><div class="sh"><span style="color:${SVC[s.type].c}">${ic(SVC[s.type].ic)}</span><b>${SVC[s.type].label} service</b><button class="btn ghost icon sm" data-act="bfDelSvc" data-a="${i}">${ic('trash', 'sm')}</button></div><div class="sb">
  ${fld('Title shown on voucher (optional)', inpB(p + 'title', s.title, 'Auto-filled from details'))}${body}
  <div class="sg c3">${fld('Quantity', inpB(p + 'qty', s.qty, '', 'number', 'min=1'))}${fld(staff ? 'Sell price per unit (PKR)' : 'Price per unit (PKR, as quoted)', inpB(p + 'sell', s.sell, '0', 'number', 'min=0'))}${staff ? fld('Cost per unit (PKR)', inpB(p + 'cost', s.cost, '0', 'number', 'min=0')) : ''}</div>
  ${staff ? `<div class="g2">${fld('Supplier (posts to supplier ledger)', `<select data-chg="bsel" data-p="${p}supId">${opts(partiesOf('supplier').map(x => [x.id, x.name]), s.supId, 'No supplier')}</select>`)}${fld('Supplier confirmation no.', inpB(p + 'conf', s.conf))}</div>` : ''}</div></div>`;
}
const bfAcct = () => { const e = $('#bf-acct'); if (e) e.innerHTML = acctBox(); };
function acctBox() {
  if (isAgent()) { const w = S.wallet; return `<div class="row"><div class="av">${esc(initials(S.user.name))}</div><div><b>${esc(S.user.name)}</b><div class="sub">This booking is created on your own ledger</div></div><div class="sp" style="margin-left:auto;text-align:right"><div class="sub">Available balance</div><b class="${w.available < 0 ? 'neg' : ''}">${fmtN(w.available)}</b></div></div>`; }
  const p = BF.partyId ? P(BF.partyId) : null;
  return `<div class="g2">${fld('Agent or customer (ledger) *', `<select data-chg="bsel" data-p="partyId">${opts((S.parties || []).filter(x => x.kind !== 'supplier' && x.active !== false).map(x => [x.id, x.name + (x.kind === 'customer' ? '  (B2C customer)' : '')]), BF.partyId, 'Select account...')}</select>`)}
  <div class="fld"><span>&nbsp;</span>${p ? `<div class="sub" style="padding:9px 0">Outstanding <b class="${p.bal > 0 ? 'neg' : ''}">${fmt(p.bal)}</b>${p.kind === 'agent' ? ' &middot; limit ' + fmt(p.limit) : ''}</div>` : '<div class="sub" style="padding:9px 0">Booking and ledger entry go to this account</div>'}</div></div>${isStaff() ? '<button class="btn sm" data-act="newCust" style="margin-top:8px">' + ic('plus', 'sm') + 'New B2C customer</button>' : ''}`;
}
function bfRender() {
  const st = isStaff(), edit = !!BF.id;
  $('#bf').innerHTML = `<datalist id="ppl">${Object.keys(knownPax()).map(k => `<option value="${esc(k)}">${esc(knownPax()[k].n)}</option>`).join('')}</datalist>
  <div class="card cp"><div class="sec">1 · Account</div><div id="bf-acct">${acctBox()}</div></div><div class="gap"></div>
  <div class="card cp"><div class="row sb"><div class="sec" style="margin:0">2 · Travellers (identified by passport number)</div><button class="btn sm" data-act="bfAddPax">${ic('plus', 'sm')}Add traveller</button></div>${BF.pax.map(paxRow).join('')}</div><div class="gap"></div>
  <div class="card cp"><div class="sec">3 · Category</div><div class="g3">${fld('Booking category', selB('category', BF.category, S.categories))}<div class="fld"><span>Travel dates (from services)</span><div style="padding:9px 0;font-weight:700" id="bf-dates">-</div></div></div></div><div class="gap"></div>
  <div class="card cp"><div class="sec">4 · Services</div>${BF.services.map(svcForm).join('')}<div class="addsvc">${Object.keys(SVC).map(k => `<button data-act="bfAddSvc" data-a="${k}"><span style="color:${SVC[k].c}">${ic(SVC[k].ic, 'lg')}</span>${SVC[k].label}</button>`).join('')}</div>${BF.services.length ? '' : '<div class="hint" style="margin-top:10px">A booking can contain any mix of visa, hotel, transport, flights, packages or custom services - each can use a different supplier.</div>'}</div><div class="gap"></div>
  <div class="card cp"><div class="sec">5 · Notes</div><div class="g2">${fld('Notes (printed on voucher)', `<textarea data-inp="b" data-p="notes">${esc(BF.notes)}</textarea>`)}${st ? fld('Internal notes (staff only)', `<textarea data-inp="b" data-p="internal">${esc(BF.internal)}</textarea>`) : ''}</div></div>
  <div class="sticky-bar"><div class="tot" id="bf-tot"></div>${!edit && canApprove() ? `<label class="chk"><input type="checkbox" ${BF.confirm ? 'checked' : ''} data-chg="bchk" data-p="confirm">Approve immediately</label>` : ''}<a class="btn" href="#/bookings">Cancel</a><button class="btn pri lg" data-act="bfSave">${edit ? 'Save changes' : 'Create booking'}</button></div>`;
  bfTotals();
}
CHG.bchk = (v, t) => { BF[t.dataset.p] = v; };
const syncQty = () => BF.services.forEach(s => { if (s.autoQty) s.qty = BF.pax.length; });
ACT.bfAddPax = () => { BF.pax.push({ n: '', pp: '', dob: '', nat: 'Pakistani', g: 'M', t: 'Adult' }); syncQty(); bfRender(); };
ACT.bfDelPax = i => { BF.pax.splice(+i, 1); syncQty(); bfRender(); };
ACT.bfAddSvc = t => { BF.services.push(SVC_DEF(t)); bfRender(); setTimeout(() => $$('.svcc').pop().scrollIntoView({ behavior: 'smooth', block: 'center' }), 30); };
ACT.bfDelSvc = i => { BF.services.splice(+i, 1); bfRender(); };
ACT.newCust = () => openModal({ title: 'New B2C customer', body: `<div class="g1">${fld('Customer name *', '<input id="nc-n">')}${fld('Phone', '<input id="nc-p">')}</div><p class="hint" style="margin-top:10px">Customers get their own separate ledger and never log in.</p>`, foot: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="ncSave">Add customer</button>' });
ACT.ncSave = async (a, b) => { try { const r = await rpc('saveParty', { kind: 'customer', name: val('nc-n'), phone: val('nc-p') }); closeModal(); await load(); BF.partyId = r.id; bfRender(); } catch (e) { toast(e.message, true); } };
ACT.bfSave = async (a, btn) => {
  const body = { ...BF, services: BF.services.map(s => ({ ...s, from: sfrom(s), to: sto(s) })) };
  busy(btn, true);
  try { const r = await rpc('saveBooking', body); toast((BF.id ? 'Booking updated ' : 'Booking created ') + r.no); await load(); BF = null; go('booking', r.id); }
  catch (e) {
    busy(btn, false);
    if ((e.dup || e.limit || e.seats) && isStaff()) { if (await confirmBox(e.dup ? 'Similar booking exists' : e.seats ? 'Not enough seats' : 'Limit exceeded', esc(e.message) + '<br><br>Create it anyway?', 'Create anyway', true)) { BF.force = true; return ACT.bfSave(a, btn); } }
    else { const bx = $('#bf-err'); if (bx) { bx.innerHTML = `<div class="errbox">${ic('alert')} ${esc(e.message)}${e.dupNo ? ` <a href="#/bookings" data-act="dupGo" data-a="${esc(e.dupNo)}"><u>Open ${esc(e.dupNo)}</u></a>` : ''}</div>`; bx.scrollIntoView({ behavior: 'smooth', block: 'center' }); } toast(e.message, true); }
  }
};
ACT.dupGo = no => { UI.f.bookings = { q: no }; };
VIEWS.bookingform = {
  noLive: true, title: (m, id) => (m === 'edit' ? 'Edit booking' : 'New booking'),
  render(mode, id) {
    if (isSup()) return empty('shield', 'Not available', '');
    if (mode === 'edit') { const b = S.bookings.find(x => x.id === id); if (!b) return empty('search', 'Booking not found', ''); BF = JSON.parse(JSON.stringify(b)); BF.partyId = b.partyId; BF.services.forEach(s => { s.supId = s.supId || ''; }); BF.force = false; }
    else { BF = BF_DEF(); if (UI.prefill) { Object.assign(BF, UI.prefill); UI.prefill = null; } }
    return `<div class="ph"><div><h1>${mode === 'edit' ? 'Edit booking ' + esc(BF.no || '') : 'New booking'}</h1><p>${mode === 'edit' ? 'Every field is editable - ledgers update automatically.' : isAgent() ? 'Created on your own ledger. The office approves it before vouchers become valid.' : 'Passport number first. A unique booking number is generated on save.'}</p></div></div><div id="bf-err"></div><div id="bf"></div>`;
  },
  mount() { bfRender(); }
};
