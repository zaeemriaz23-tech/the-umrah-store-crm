/* Bookings v2: KPI strip, status tabs, sort, list / cards / arrivals / travellers, bulk actions, urgency flags, detail summary */
'use strict';
const BK = { sel: new Set() };
const bkConf = b => { const n = b.services.length, c = b.services.filter(s => s.cs === 'Confirmed').length; return { n, c, all: n > 0 && c === n }; };
const bkAge = b => (Date.now() - new Date(b.createdAt || b.created)) / 36e5;
const bkWhen = b => {
  if (b.status === 'Cancelled' || !b.from) return ''; const t = todayISO(), end = b.to || b.from;
  if (b.from > t) { const d = diffDays(t, b.from); return `<span class="cd ${d <= 3 ? 'hot' : d <= 7 ? 'warm' : ''}">${d === 1 ? 'Tomorrow' : 'In ' + d + ' days'}</span>`; }
  if (b.from === t) return '<span class="cd now">Arrives today</span>';
  return end >= t ? '<span class="cd now">In country</span>' : '<span class="cd done">Completed</span>';
};
const bkFlags = b => {
  if (b.status === 'Cancelled') return ''; const f = [], t = todayISO(), cf = bkConf(b);
  if (isStaff() && b.status === 'Pending' && bkAge(b) > 24) f.push(`<span class="flag red" title="Waiting for approval">${ic('clock', 'sm')}${Math.floor(bkAge(b) / 24)}d waiting</span>`);
  if (!cf.all && b.from && b.from >= t && diffDays(t, b.from) <= 3) f.push(`<span class="flag red" title="Departing within 3 days with unconfirmed services">${ic('alert', 'sm')}Unconfirmed</span>`);
  return f.join('');
};
const bkProg = b => { const c = bkConf(b); if (!c.n) return ''; return `<span class="prog" title="${c.c} of ${c.n} services confirmed by suppliers"><i style="width:${Math.round(c.c / c.n * 100)}%"></i></span><small class="sub">${c.c}/${c.n} confirmed</small>`; };

function matchB(b, f) {
  const t = todayISO();
  if (f.status && b.status !== f.status) return false;
  if (f.cat && b.category !== f.cat) return false;
  if (f.party && b.partyId != f.party) return false;
  if (f.sup && !b.services.some(s => s.supId == f.sup)) return false;
  if (f.q) { const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean), hay = [b.no, ...b.pax.flatMap(x => [x.n, x.pp]), ...b.services.flatMap(s => [s.conf, s.title]), isStaff() ? P(b.partyId).name : ''].join(' ').toLowerCase(); if (!terms.every(x => hay.includes(x))) return false; }
  if (f.quick === 'arr' && b.from !== t) return false;
  if (f.quick === 'out' && b.to !== t) return false;
  if (f.quick === 'in' && !(b.from && b.from <= t && (b.to || b.from) >= t && b.status !== 'Cancelled')) return false;
  if (f.quick === 'wk' && !(b.from > t && b.from <= addDays(t, 7))) return false;
  if (f.quick === 'unconf' && !(b.status !== 'Cancelled' && !bkConf(b).all && (!b.from || b.from >= t))) return false;
  if (f.quick === 'noprice' && !(bSell(b) <= 0)) return false;
  const k = f.df === 'from' ? b.from : f.df === 'to' ? b.to : b.created;
  if ((f.from || f.to) && !k) return false;
  if (f.from && k < f.from) return false; if (f.to && k > f.to) return false;
  return true;
}
const bkList = () => {
  const f = bf(), rows = (S.bookings || []).filter(b => matchB(b, f)), t = todayISO();
  const by = { new: (a, b) => (b.createdAt < a.createdAt ? -1 : 1), old: (a, b) => (a.createdAt < b.createdAt ? -1 : 1), travel: (a, b) => ((a.from || '9999') < (b.from || '9999') ? -1 : 1), amt: (a, b) => bSell(b) - bSell(a) };
  if (f.sort === 'travel') return rows.sort((a, b) => { const fa = a.from >= t ? 0 : 1, fb = b.from >= t ? 0 : 1; return fa - fb || by.travel(a, b); });
  return rows.sort(by[f.sort] || by.new);
};

/* ---------- KPI strip + status tabs ---------- */
function bkKpis() {
  const bs = S.bookings || [], t = todayISO(), f = bf(), liveB = bs.filter(live), sup = isSup();
  const k = (key, l, n, sub, cls, ico) => `<button class="kpi click ${f.quick === key || (key === 'Pending' && f.status === 'Pending') ? 'on' : ''}" data-act="bkK" data-a="${key}"><span>${ico ? ic(ico, 'sm') : ''}${l}</span><b class="${cls || ''}">${n}</b><small class="sub">${sub || ''}</small></button>`;
  const pend = bs.filter(b => b.status === 'Pending').length, wk = liveB.filter(b => b.from > t && b.from <= addDays(t, 7)), inC = liveB.filter(b => b.from && b.from <= t && (b.to || b.from) >= t), unc = liveB.filter(b => !bkConf(b).all && (!b.from || b.from >= t));
  return `<div class="kpis bkk no-print">${sup ? '' : k('Pending', isAgent() ? 'Awaiting approval' : 'Pending approval', pend, pend ? 'oldest ' + Math.floor(Math.max(0, ...bs.filter(b => b.status === 'Pending').map(bkAge)) / 24) + ' day(s)' : 'nothing waiting', pend && isStaff() ? 'neg' : '', 'clock')}${k('wk', 'Departing in 7 days', wk.length, sum(wk, b => b.pax.length) + ' traveller(s)', '', 'plane')}${k('in', 'In country now', inC.length, sum(inC, b => b.pax.length) + ' traveller(s)', '', 'pin')}${k('unconf', 'Services to confirm', unc.length, 'not fully confirmed', unc.length ? 'neg' : '', 'alert')}
  ${sup ? '' : `<div class="kpi"><span>${ic('wallet', 'sm')}${bf().status || bf().q || bf().quick ? 'Filtered value' : 'Total value'}</span><b>${fmt(sum(bkList().filter(live), bSell))}</b><small class="sub">${bkList().length} booking(s) shown</small></div>`}</div>`;
}
ACT.bkK = k => { const f = bf(); if (k === 'Pending') { f.status = f.status === 'Pending' ? '' : 'Pending'; f.quick = ''; } else { f.quick = f.quick === k ? '' : k; f.status = ''; } renderView(); };
const bkTabs = () => { const f = bf(), bs = S.bookings || [], c = s => bs.filter(b => b.status === s).length; const tb = (s, l, n) => `<button class="${(f.status || '') === s ? 'on' : ''}" data-act="bkSt" data-a="${s}">${l}<i>${n}</i></button>`; return `<div class="tabs no-print" style="margin-bottom:12px">${tb('', 'All', bs.length)}${tb('Pending', isAgent() ? 'Awaiting approval' : 'Pending', c('Pending'))}${tb('Confirmed', 'Approved', c('Confirmed'))}${tb('Cancelled', 'Cancelled', c('Cancelled'))}</div>`; };
ACT.bkSt = s => { bf().status = s; renderView(); };
CHG.bsort = v => { bf().sort = v; renderView(); };

function filterBar() {
  const f = bf(), staff = isStaff(), q = (k, l) => `<button class="chip ${f.quick === k ? 'on' : ''}" data-act="bq" data-a="${k}">${l}</button>`;
  return `<div class="fb no-print"><div class="fld grow"><span>Search</span><input id="bq" value="${esc(f.q || '')}" placeholder="Booking no., passport, traveller name${staff ? ', agent, confirmation no.' : ''}" data-inp="bsearch" autocomplete="off"></div>
  <div class="fld"><span>Category</span><select data-chg="bfld" data-k="cat">${opts(S.categories, f.cat, 'All')}</select></div>
  ${staff ? `<div class="fld"><span>Agent / customer</span><select data-chg="bfld" data-k="party">${opts((S.parties || []).filter(p => p.kind !== 'supplier').map(p => [p.id, p.name]), f.party, 'All')}</select></div><div class="fld"><span>Supplier</span><select data-chg="bfld" data-k="sup">${opts(partiesOf('supplier').map(p => [p.id, p.name]), f.sup, 'All')}</select></div>` : ''}
  <div class="fld"><span>Date type</span><select data-chg="bfld" data-k="df">${opts([['created', 'Booked on'], ['from', 'Check-in / travel start'], ['to', 'Check-out / travel end']], f.df || 'created')}</select></div>
  <div class="fld"><span>From</span><input type="date" value="${f.from || ''}" data-chg="bfld" data-k="from"></div><div class="fld"><span>To</span><input type="date" value="${f.to || ''}" data-chg="bfld" data-k="to"></div>
  <div class="fld"><span>Sort</span><select data-chg="bsort">${opts([['new', 'Newest first'], ['old', 'Oldest first'], ['travel', 'Travel date (soonest)'], ...(isSup() ? [] : [['amt', 'Amount (high → low)']])], f.sort || 'new')}</select></div>
  <div class="qk">${q('arr', 'Arriving today')}${q('out', 'Checking out today')}${q('in', 'In country now')}${q('wk', 'Departing in 7 days')}${q('unconf', 'Unconfirmed services')}<button class="btn sm ghost" data-act="bclear">${ic('x', 'sm')}Clear filters</button></div></div>`;
}

/* ---------- result views ---------- */
const bkBox = b => (isStaff() && (canApprove() || can('bookings.edit')) ? `<td><input type="checkbox" data-act="bkSel" data-a="${esc(b.id)}" ${BK.sel.has(b.id) ? 'checked' : ''} aria-label="Select ${esc(b.no)}"></td>` : '');
const bkActs = b => `${isStaff() && b.status === 'Pending' && canApprove() ? `<button class="btn sm pri" data-act="approve" data-a="${esc(b.id)}" title="Approve booking">${ic('check', 'sm')}Approve</button> ` : ''}${isSup() ? '' : `<button class="btn sm" data-act="v1" data-a="${esc(b.id)}" title="Create voucher in one click">${ic('ticket', 'sm')}Voucher</button>`}`;
const bkTravel = b => b.from ? fshort(b.from) + (b.to && b.to !== b.from ? ' → ' + fdate(b.to) : '') : '<span class="faint">-</span>';
function bkTable(rows, lim) {
  const sel = isStaff() && (canApprove() || can('bookings.edit')), ids = rows.slice(0, lim).map(b => b.id);
  return `<div class="card"><div class="tw"><table class="t"><thead><tr>${sel ? `<th style="width:34px"><input type="checkbox" data-act="bkAll" ${ids.length && ids.every(i => BK.sel.has(i)) ? 'checked' : ''} aria-label="Select all"></th>` : ''}<th>Booking</th><th>Traveller</th><th>Services</th><th>Travel</th>${isStaff() ? '<th>Account</th>' : ''}${isSup() ? '' : '<th class="r">Amount</th>'}<th>Status</th><th></th></tr></thead><tbody>
  ${rows.slice(0, lim).map(b => `<tr class="click ${BK.sel.has(b.id) ? 'sel' : ''}" data-act="open" data-a="${esc(b.id)}">${bkBox(b)}<td><span class="bno">${esc(b.no)}</span><div class="sub">${esc(b.category)} &middot; ${fdate(b.created)}</div></td><td><b>${esc(lead(b))}</b><div class="sub mono">${esc((b.pax[0] || {}).pp || '')}</div></td><td>${svcChips(b)}<div class="pgr">${bkProg(b)}</div></td>
  <td class="num">${bkTravel(b)}<div>${bkWhen(b)}</div></td>${isStaff() ? `<td>${esc(P(b.partyId).name)}</td>` : ''}${isSup() ? '' : `<td class="r num"><b>${fmt(bSell(b))}</b></td>`}<td>${sbadge(b.status)}<div>${bkFlags(b)}</div></td><td class="r">${bkActs(b)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
const bkCards = (rows, lim) => `<div class="bgrid">${rows.slice(0, lim).map(b => `<div class="card bcard click ${b.status === 'Cancelled' ? 'dim' : ''}" data-act="open" data-a="${esc(b.id)}"><div class="row sb"><span class="bno">${esc(b.no)}</span>${sbadge(b.status)}</div><h4>${esc(lead(b))}</h4><div class="sub">${esc(b.category)}${isStaff() ? ' · ' + esc(P(b.partyId).name) : ''}</div><div class="bmeta">${ic('calendar', 'sm')}<span class="num">${bkTravel(b)}</span>${bkWhen(b)}</div><div>${svcChips(b)}</div><div class="pgr">${bkProg(b)}</div>${bkFlags(b) ? `<div>${bkFlags(b)}</div>` : ''}<div class="row sb bfoot">${isSup() ? '<span></span>' : `<b class="num">${fmt(bSell(b))}</b>`}<span>${bkActs(b)}</span></div></div>`).join('')}</div>`;
function bkArrivals(rows) {
  const t = todayISO(), upto = addDays(t, 30), list = rows.filter(b => b.status !== 'Cancelled' && b.from && b.from >= addDays(t, -1) && b.from <= upto).sort((a, b) => (a.from < b.from ? -1 : 1));
  if (!list.length) return `<div class="card">${empty('plane', 'No arrivals in the next 30 days', 'Bookings with a travel start date in the coming month are grouped by day here.')}</div>`;
  const days = uniq(list.map(b => b.from));
  return days.map(d => { const bs = list.filter(b => b.from === d), lbl = d === t ? 'Today' : d === addDays(t, 1) ? 'Tomorrow' : d < t ? 'Yesterday' : fdow(d) + ', ' + fdate(d);
    return `<div class="card" style="margin-bottom:12px"><div class="ch"><h3>${lbl}</h3><span class="sub">${fdate(d)}</span><span class="sp"><span class="bdg ${d === t ? 'green' : 'gray'}">${sum(bs, b => b.pax.length)} traveller(s)</span><span class="bdg gray">${bs.length} booking(s)</span></span></div>${bs.map(b => `<div class="item click" data-act="open" data-a="${esc(b.id)}"><div class="mid"><span class="bno">${esc(b.no)}</span> ${sbadge(b.status)} ${bkFlags(b)}<div class="sub">${esc(lead(b))}${isStaff() ? ' · ' + esc(P(b.partyId).name) : ''} · ${b.pax.length} pax</div></div><div>${svcChips(b)}</div><div class="pgr" style="min-width:110px">${bkProg(b)}</div></div>`).join('')}</div>`; }).join('');
}
function bkTrav(rows, lim) {
  const tr = rows.flatMap(b => b.pax.map(x => ({ b, x })));
  return `<div class="card"><div class="tw"><table class="t"><thead><tr><th>Traveller</th><th>Passport</th><th>Type</th><th>Booking</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr></thead><tbody>${tr.slice(0, lim * 2).map(({ b, x }) => `<tr class="click" data-act="open" data-a="${esc(b.id)}"><td><b>${esc(x.n)}</b></td><td class="mono">${esc(x.pp)}</td><td>${esc(x.t)}</td><td><span class="bno">${esc(b.no)}</span></td><td>${b.from ? fdate(b.from) : '-'}</td><td>${b.to ? fdate(b.to) : '-'}</td><td>${sbadge(b.status)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function bkBar() {
  const n = BK.sel.size; if (!n) return '';
  const pend = [...BK.sel].filter(id => { const b = (S.bookings || []).find(x => x.id === id); return b && b.status === 'Pending'; }).length;
  return `<div class="bbar no-print"><b>${n} selected</b>${canApprove() ? `<button class="btn sm pri" data-act="bbApprove" ${pend ? '' : 'disabled'}>${ic('check', 'sm')}Approve ${pend || ''} pending</button>` : ''}${isStaff() && can('bookings.approve') ? `<button class="btn sm" data-act="bbCancel">Cancel selected</button>` : ''}<button class="btn sm" data-act="bbCsv">${ic('download', 'sm')}Export selected</button><button class="btn sm ghost" data-act="bbClear">${ic('x', 'sm')}Clear</button></div>`;
}
function bres() {
  const f = bf(), rows = bkList(), lim = f.lim || 60, v = f.view || '';
  const gone = [...BK.sel].filter(id => !(S.bookings || []).some(b => b.id === id)); gone.forEach(id => BK.sel.delete(id));
  if (!rows.length) return `<div class="card">${(S.bookings || []).length ? empty('search', 'No bookings match these filters', 'Try clearing a filter.', '<button class="btn" data-act="bclear">Clear filters</button>') : empty('briefcase', 'No bookings yet', isSup() ? 'Services assigned to you will appear here.' : 'Create a booking with a passport number to get started.', isSup() ? '' : '<a class="btn pri" href="#/bookingform/new">New booking</a>')}</div>`;
  const body = v === 'trav' ? bkTrav(rows, lim) : v === 'arr' ? bkArrivals(rows) : v === 'cards' ? bkCards(rows, lim) : bkTable(rows, lim);
  return `<div id="bbar">${bkBar()}</div>${body}${rows.length > lim && v !== 'arr' ? `<div class="c" style="padding:14px"><button class="btn" data-act="bmore">Show more (${rows.length - lim} left)</button></div>` : ''}`;
}

/* ---------- selection + bulk ---------- */
const bkRepaintBar = () => { const e = $('#bbar'); if (e) e.innerHTML = bkBar(); $$('#bres tbody tr').forEach(tr => tr.classList.toggle('sel', BK.sel.has(tr.dataset.a))); };
ACT.bkSel = (id, t) => { t.checked ? BK.sel.add(id) : BK.sel.delete(id); bkRepaintBar(); };
ACT.bkAll = (a, t) => { const ids = bkList().slice(0, bf().lim || 60).map(b => b.id); ids.forEach(i => (t.checked ? BK.sel.add(i) : BK.sel.delete(i))); $$('#bres tbody input[type=checkbox]').forEach(c => { c.checked = t.checked; }); bkRepaintBar(); };
ACT.bbClear = () => { BK.sel.clear(); $$('#bres input[type=checkbox]').forEach(c => { c.checked = false; }); bkRepaintBar(); };
const bkSelRows = () => (S.bookings || []).filter(b => BK.sel.has(b.id));
async function bkBulk(status, label) {
  const rows = bkSelRows().filter(b => (status === 'Confirmed' ? b.status === 'Pending' : b.status !== 'Cancelled')); if (!rows.length) return toast('Nothing to ' + label.toLowerCase() + ' in the selection', true);
  if (!(await confirmBox(label + ' ' + rows.length + ' booking(s)', status === 'Cancelled' ? 'Cancelling reverses the amounts in the agent and supplier ledgers.' : 'Vouchers for these bookings become valid.', label, status === 'Cancelled'))) return;
  let ok = 0, bad = [];
  for (const b of rows) { try { await rpc('setStatus', { id: b.id, status }); ok++; } catch (e) { bad.push(b.no + ': ' + e.message); } }
  BK.sel.clear(); await load(); renderView(); toast(ok + ' booking(s) updated' + (bad.length ? ', ' + bad.length + ' failed - ' + bad[0] : ''), !!bad.length && !ok);
}
ACT.bbApprove = () => bkBulk('Confirmed', 'Approve'); ACT.bbCancel = () => bkBulk('Cancelled', 'Cancel');
function bkCsv(rows) {
  downloadCSV('bookings-' + todayISO() + '.csv', [['Booking no', 'Status', 'Category', ...(isStaff() ? ['Account'] : []), 'Lead traveller', 'Passport', 'Travellers', 'Services', 'Confirmed', 'From', 'To', ...(isSup() ? [] : ['Sell (PKR)']), ...(canCost() ? ['Cost (PKR)', 'Profit (PKR)'] : []), 'Created'],
    ...rows.map(b => [b.no, b.status, b.category, ...(isStaff() ? [P(b.partyId).name] : []), (b.pax[0] || {}).n, (b.pax[0] || {}).pp, b.pax.length, uniq(b.services.map(s => SVC[s.type].label)).join(' + '), bkConf(b).c + '/' + bkConf(b).n, b.from, b.to, ...(isSup() ? [] : [bSell(b)]), ...(canCost() ? [bCost(b), bSell(b) - bCost(b)] : []), b.created])]);
}
ACT.bbCsv = async () => { const rows = bkSelRows(); if (isStaff()) { try { await rpc('logExport', { kind: 'bookings', what: 'selected bookings', rows: rows.length }); } catch (e) { return toast(e.message, true); } } bkCsv(rows); };
ACT.bcsv = async () => { const rows = bkList(); if (isStaff()) { try { await rpc('logExport', { kind: 'bookings', what: 'bookings list', rows: rows.length }); } catch (e) { return toast(e.message, true); } } bkCsv(rows); };
ACT.bview = v => { bf().view = v; renderView(); };
ACT.bclear = () => { UI.f.bookings = {}; BK.sel.clear(); renderView(); };

VIEWS.bookings = {
  title: () => (isAgent() ? 'My bookings' : isSup() ? 'Services' : 'Bookings'),
  render() {
    const f = bf(), rows = bkList(), v = f.view || '', vb = (k, l, i) => `<button class="${v === k ? 'on' : ''}" data-act="bview" data-a="${k}">${ic(i, 'sm')}${l}</button>`;
    return `<div class="ph"><div><h1>${isSup() ? 'Assigned services' : 'Bookings'}</h1><p>${rows.length} of ${(S.bookings || []).length} shown${isSup() ? '' : ' &middot; ' + fmt(sum(rows.filter(live), bSell)) + ' total'}</p></div><div class="sp no-print"><div class="tabs">${vb('', 'List', 'list')}${vb('cards', 'Cards', 'grid')}${vb('arr', 'Arrivals', 'plane')}${vb('trav', 'Travellers', 'users')}</div><button class="btn" data-act="bcsv">${ic('download')}Export</button>${isSup() ? '' : `<a class="btn pri" href="#/bookingform/new">${ic('plus')}New booking</a>`}</div></div>
    ${bkKpis()}${bkTabs()}${filterBar()}<div id="bres">${bres()}</div>`;
  }
};

/* ---------- detail page: summary strip ---------- */
const _bookingRender = VIEWS.booking.render;
VIEWS.booking.render = function (id) {
  let h = _bookingRender.call(this, id); const b = (S.bookings || []).find(x => x.id === id || x.no === id); if (!b) return h;
  const staff = isStaff(), cf = bkConf(b), pay = (S.payments || []).filter(p => p.bookingId === b.id && p.status === 'Approved'), paid = sum(pay, p => p.amt), sell = bSell(b), tks = (S.tickets || []).filter(t => t.bookingNo === b.no);
  const wa = waLinkTo(`Booking ${b.no}\n${lead(b)}${b.from ? '\n' + fdate(b.from) + (b.to ? ' → ' + fdate(b.to) : '') : ''}\nStatus: ${LABEL[b.status] || b.status}`);
  const strip = `<div class="bstrip no-print">
    <div class="bs"><span>${ic('calendar', 'sm')}Travel</span><b>${bkWhen(b) || '<span class="faint">No dates</span>'}</b><small class="sub">${b.from ? fdate(b.from) + (b.to && b.to !== b.from ? ' → ' + fdate(b.to) : '') : 'Set dates on services'}</small></div>
    <div class="bs"><span>${ic('check', 'sm')}Services confirmed</span><b>${cf.c} / ${cf.n}</b><div class="pgr"><span class="prog"><i style="width:${cf.n ? Math.round(cf.c / cf.n * 100) : 0}%"></i></span></div></div>
    ${isSup() ? '' : `<div class="bs"><span>${ic('wallet', 'sm')}Payments on this booking</span><b>${pay.length ? fmt(paid) : '<span class="faint">None linked</span>'}</b><small class="sub">${pay.length ? 'of ' + fmt(sell) + ' · ' + pay.length + ' payment(s)' : 'General top-ups are in the ledger'}</small></div>`}
    <div class="bs acts"><span>${ic('send', 'sm')}Quick actions</span><div class="row"><button class="btn sm" data-act="bCopy" data-a="${esc(b.no)}">${ic('copy', 'sm')}Copy no.</button><a class="btn sm wa" target="_blank" rel="noopener" href="${wa}">${ic('wa', 'sm')}Share</a>${staff && !can('support.reply') ? '' : `<button class="btn sm" data-act="tkNew" data-a="${esc(b.no)}">${ic('ticket', 'sm')}Raise ticket</button>`}</div>${tks.length ? `<small class="sub">${tks.length} ticket(s): ${tks.slice(0, 3).map(t => `<a href="#/support/${esc(t.id)}"><u>${esc(t.no)}</u></a>`).join(', ')}</small>` : ''}</div></div>`;
  return h.replace('<div class="card"><div class="bhead">', strip + '<div class="card"><div class="bhead">');
};
ACT.bCopy = no => { navigator.clipboard.writeText(no).then(() => toast('Booking number copied')); };
