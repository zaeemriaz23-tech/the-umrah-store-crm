/* Dashboard */
'use strict';
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const live = b => b.status !== 'Cancelled';
const lead = b => b.pax[0] ? b.pax[0].n + (b.pax.length > 1 ? ' +' + (b.pax.length - 1) : '') : '';
const svcChips = b => uniq(b.services.map(s => s.type)).map(t => `<span class="stype" style="color:${SVC[t].c}">${ic(SVC[t].ic)}${SVC[t].label}</span>`).join('');
const bRow = b => `<div class="item click" data-act="open" data-a="${esc(b.id)}"><div class="mid"><span class="bno">${esc(b.no)}</span> ${sbadge(b.status)}<div class="sub">${esc(lead(b))} &middot; ${b.from ? fshort(b.from) + (b.to ? ' → ' + fshort(b.to) : '') : esc(b.category)}${isStaff() ? ' &middot; ' + esc(P(b.partyId).name) : ''}</div></div><div class="r num"><b>${isSup() ? '' : fmt(bSell(b))}</b></div></div>`;
ACT.open = id => go('booking', id);

function monthSeries(n = 6) {
  const t = todayISO(), out = []; let y = +t.slice(0, 4), m = +t.slice(5, 7);
  for (let i = 0; i < n; i++) { out.unshift(y + '-' + p2(m)); m--; if (!m) { m = 12; y--; } }
  return out.map(ym => { const bs = (S.bookings || []).filter(b => live(b) && b.created.slice(0, 7) === ym); return { ym, sell: sum(bs, bSell), cost: sum(bs, bCost), n: bs.length }; });
}
const chart = ser => { const mx = Math.max(1, ...ser.map(x => x.sell)); return `<div class="bars">${ser.map(x => `<div class="b"><u>${x.sell ? fshortM(x.sell) : ''}</u><i style="height:${Math.max(2, x.sell / mx * 100)}%"></i><em>${MONTHS[+x.ym.slice(5) - 1]}</em></div>`).join('')}</div>`; };

function staffHome() {
  const t = todayISO(), bs = S.bookings || [], ym = t.slice(0, 7), mo = bs.filter(b => live(b) && b.created.slice(0, 7) === ym);
  const recv = sum((S.parties || []).filter(p => p.kind !== 'supplier' && p.bal > 0), p => p.bal), pay = sum((S.parties || []).filter(p => p.kind === 'supplier' && p.bal > 0), p => p.bal);
  const pendB = bs.filter(b => b.status === 'Pending'), pendP = (S.payments || []).filter(p => p.status === 'Pending'), openQ = (S.queries || []).filter(q => q.status === 'Open').sort((a, b) => a.dueAt < b.dueAt ? -1 : 1);
  const arr = bs.filter(b => live(b) && b.from === t), dep = bs.filter(b => live(b) && b.to === t), soon = bs.filter(b => live(b) && b.from > t && b.from <= addDays(t, 7)).sort((a, b) => a.from < b.from ? -1 : 1);
  const profit = sum(mo, b => bSell(b) - bCost(b));
  return `<div class="ph"><div><h1>${greet()}, ${esc(S.user.name.split(' ')[0])}</h1><p>${esc(S.company.name)} &middot; ${fdow(t)}, ${fdate(t)}</p></div><div class="sp"><a class="btn" href="#/bookingform/new">${ic('plus')}New booking</a><a class="btn" href="#/search">${ic('search')}Search flights & hotels</a></div></div>
  <div class="stats"><div class="card stat hot"><div class="l">${ic('trend', 'sm')}Sales this month</div><div class="v">${fmt(sum(mo, bSell))}</div><div class="s">${mo.length} booking(s) &middot; profit ${fmt(profit)}</div></div>
  <div class="card stat"><div class="l">${ic('wallet', 'sm')}Receivable</div><div class="v">${fmt(recv)}</div><div class="s">owed by agents & customers</div><a class="go" href="#/accounts"></a></div>
  <div class="card stat"><div class="l">${ic('building', 'sm')}Payable</div><div class="v">${fmt(pay)}</div><div class="s">owed to suppliers</div><a class="go" href="#/accounts/supplier"></a></div>
  <div class="card stat"><div class="l">${ic('shield', 'sm')}Awaiting approval</div><div class="v">${pendB.length + pendP.length}</div><div class="s">${pendB.length} booking(s) &middot; ${pendP.length} payment(s)</div></div>
  <div class="card stat"><div class="l">${ic('bell', 'sm')}Open queries</div><div class="v">${openQ.length}</div><div class="s">${openQ[0] ? 'next deadline ' + slaChip(openQ[0].dueAt) : 'nothing waiting'}</div><a class="go" href="#/queries"></a></div></div>
  <div class="gm"><div>
    <div class="card"><div class="ch"><h3>Needs your attention</h3><span class="sp"><a class="btn sm" href="#/bookings" data-act="fPend">All pending</a></span></div>
    ${[...openQ.slice(0, 4).map(q => `<div class="item click" data-act="goQ"><div class="qi" style="width:36px;height:36px">${ic(q.type === 'flight' ? 'plane' : q.type === 'hotel' ? 'bed' : 'bell')}</div><div class="mid"><b>${esc(q.no)} &middot; ${esc(q.type)} query</b><div class="sub">${esc((q.text || '').slice(0, 70))} &middot; ${esc(q.partyId ? P(q.partyId).name : q.contact.phone || q.source)}</div></div>${slaChip(q.dueAt)}</div>`),
      ...pendB.slice(0, 5).map(b => `<div class="item"><div class="mid click" data-act="open" data-a="${esc(b.id)}"><span class="bno">${esc(b.no)}</span> ${sbadge('Pending')}<div class="sub">${esc(lead(b))} &middot; ${esc(P(b.partyId).name)} &middot; ${fmt(bSell(b))}</div></div>${canApprove() ? `<button class="btn sm pri" data-act="approve" data-a="${esc(b.id)}">${ic('check', 'sm')}Approve</button>` : ''}</div>`),
      ...pendP.slice(0, 4).map(p => `<div class="item"><div class="qi" style="width:36px;height:36px">${ic('wallet')}</div><div class="mid"><b>${fmt(p.amt)} ${esc(p.method)}</b><div class="sub">${esc(P(p.partyId).name)} &middot; ${esc(p.ref || p.id)}</div></div><button class="btn sm pri" data-act="payOk" data-a="${esc(p.id)}">Approve</button><button class="btn sm" data-act="payNo" data-a="${esc(p.id)}">Reject</button></div>`)].join('') || empty('check', 'All clear', 'No approvals or queries are waiting.')}</div>
    <div class="gap"></div><div class="card"><div class="ch"><h3>Sales - last 6 months</h3></div><div class="cp">${chart(monthSeries())}</div></div></div>
  <div><div class="card"><div class="ch"><h3>Today</h3><span class="sp pill">${fdate(t)}</span></div>
    <div class="item"><div class="mid"><b>${ic('plane', 'sm')} Arriving today</b><div class="sub">${arr.length ? arr.map(b => esc(lead(b))).slice(0, 4).join(', ') : 'No arrivals'}</div></div><span class="bdg green">${sum(arr, b => b.pax.length)}</span></div>
    <div class="item"><div class="mid"><b>${ic('logout', 'sm')} Checking out today</b><div class="sub">${dep.length ? dep.map(b => esc(lead(b))).slice(0, 4).join(', ') : 'No check-outs'}</div></div><span class="bdg amber">${sum(dep, b => b.pax.length)}</span></div>
    <div class="item"><div class="mid"><b>${ic('layers', 'sm')} Live group packages</b><div class="sub">${(S.groups || []).length} departing from ${(S.groups || [])[0] ? fdate(S.groups[0].dep) : '-'}</div></div></div></div>
  <div class="gap"></div><div class="card"><div class="ch"><h3>Departing within 7 days</h3></div>${soon.slice(0, 7).map(bRow).join('') || '<div class="cp mute">No departures in the next 7 days.</div>'}</div>
  ${isAdmin() ? `<div class="gap"></div><div class="card"><div class="ch"><h3>Recent activity</h3></div>${(S.log || []).slice(0, 7).map(l => `<div class="item"><div class="mid"><b style="font-size:13px">${esc(l.a)}</b><div class="sub">${esc(l.d)}</div></div><span class="sub">${esc(l.u)} &middot; ${ftime(l.t)}</span></div>`).join('')}</div>` : ''}</div></div>`;
}
ACT.fPend = () => { UI.f.bookings = { status: 'Pending' }; };
ACT.goQ = () => go('queries');
ACT.approve = async (id, b) => { await doRpc(b, 'setStatus', { id, status: 'Confirmed' }, 'Booking approved'); };
ACT.payOk = async (id, b) => { await doRpc(b, 'approvePayment', { id }, 'Payment approved'); };
ACT.payNo = async id => { const r = prompt('Reason for rejection (optional)'); if (r === null) return; await doRpc(null, 'rejectPayment', { id, reason: r }, 'Payment rejected'); };

function agentHome() {
  const w = S.wallet || { balance: 0, limit: 0, available: 0, pending: 0 }, bs = [...S.bookings].sort((a, b) => b.createdAt < a.createdAt ? -1 : 1), qs = [...S.queries].sort((a, b) => b.createdAt < a.createdAt ? -1 : 1);
  const pend = bs.filter(b => b.status === 'Pending').length;
  return `<div class="hero"><div><div class="l">Available balance</div><div class="big">${fmtN(w.available)}</div></div><div class="kv"><div><span class="l">Outstanding</span><b>${fmt(w.balance)}</b></div><div><span class="l">Credit limit</span><b>${fmt(w.limit)}</b></div>${w.pending ? `<div><span class="l">Receipts awaiting approval</span><b>${fmt(w.pending)}</b></div>` : ''}</div>
  <div class="sp"><a class="btn gold" href="#/bookingform/new">${ic('plus')}New booking</a>${S.flags.payfast ? `<button class="btn" data-act="payOnline">${ic('card')}Pay online</button>` : ''}<button class="btn" data-act="payRecord">${ic('receipt')}Add payment record</button><a class="btn" href="#/queries">${ic('bell')}New query</a></div></div>
  <div class="stats"><div class="card stat"><div class="l">Bookings</div><div class="v">${bs.length}</div><div class="s">${pend} awaiting approval</div></div><div class="card stat"><div class="l">Open queries</div><div class="v">${qs.filter(q => q.status === 'Open').length}</div><div class="s">${qs.filter(q => q.status === 'Quoted').length} quote(s) to review</div></div></div>
  <div class="g2"><div class="card"><div class="ch"><h3>Recent bookings</h3><span class="sp"><a class="btn sm" href="#/bookings">View all</a></span></div>${bs.slice(0, 6).map(bRow).join('') || empty('briefcase', 'No bookings yet', 'Create your first booking with a passport number.', '<a class="btn pri" href="#/bookingform/new">New booking</a>')}</div>
  <div class="card"><div class="ch"><h3>My queries</h3><span class="sp"><a class="btn sm" href="#/queries">Open</a></span></div>${qs.slice(0, 5).map(q => `<div class="item click" data-act="goQ"><div class="mid"><b>${esc(q.no)} &middot; ${esc(q.type)}</b><div class="sub">${esc((q.text || '').slice(0, 60))}</div></div>${q.status === 'Open' ? slaChip(q.dueAt) : sbadge(q.status)}</div>`).join('') || empty('bell', 'No queries', 'Ask for flight, hotel or visa quotes any time.')}</div></div>`;
}
function supHome() {
  const all = S.bookings.flatMap(b => b.services.map(s => ({ b, s }))), todo = all.filter(x => x.s.cs !== 'Confirmed');
  return `<div class="ph"><div><h1>${greet()}, ${esc(S.user.name.split(' ')[0])}</h1><p>Services assigned to you</p></div></div>
  <div class="stats"><div class="card stat hot"><div class="l">Payable to you</div><div class="v">${fmt(P(S.user.pid).bal)}</div></div><div class="card stat"><div class="l">Awaiting your confirmation</div><div class="v">${todo.length}</div></div></div>
  <div class="card"><div class="ch"><h3>Services to confirm</h3></div>${todo.map(x => `<div class="item"><div class="mid"><span class="bno">${esc(x.b.no)}</span> <b>${esc(x.s.title)}</b><div class="sub">${esc(lead(x.b))} &middot; ${x.s.from ? fdate(x.s.from) : ''}${x.s.to ? ' → ' + fdate(x.s.to) : ''}</div></div><input id="cf-${esc(x.s.id)}" placeholder="Confirmation no." style="width:170px"><button class="btn sm pri" data-act="supConf" data-a="${esc(x.b.id)}|${esc(x.s.id)}">Confirm</button></div>`).join('') || empty('check', 'Nothing waiting', 'All services assigned to you are confirmed.')}</div>`;
}
ACT.supConf = async (a, b) => { const [bid, sid] = a.split('|'); await doRpc(b, 'svcConfirm', { bid, sid, conf: val('cf-' + sid) }, 'Confirmation saved'); };

VIEWS.home = { title: 'Overview', render: () => (isSup() ? supHome() : isAgent() ? agentHome() : staffHome()) };
