/* Group packages: catalogue with real airline logos, filters, quick quote, share, PDF import */
'use strict';
const ROOMS = [['sh', 'Sharing', 'Sharing'], ['qd', 'Quad', 'Quad'], ['tr', 'Triple', 'Triple'], ['db', 'Double', 'Double']];
const gf = () => UI.f.grp || (UI.f.grp = {});
const seatCls = n => (n <= 0 ? 'out' : n < 10 ? 'low' : 'ok');
const gFrom = g => { const v = g.pk.flatMap(k => Object.values(k.p)).filter(x => x > 0); return v.length ? Math.min(...v) : 0; };
const kFrom = k => { const v = Object.values(k.p).filter(x => x > 0); return v.length ? Math.min(...v) : 0; };
function matchG(g, f) {
  if (f.air && g.air !== f.air) return false;
  if (f.mon && !g.dep.startsWith(f.mon)) return false;
  if (f.from && g.dep < f.from) return false; if (f.to && g.dep > f.to) return false;
  if (f.n && g.n != f.n) return false;
  if (f.avail && g.seats <= 0) return false;
  if (f.max && gFrom(g) > +f.max) return false;
  if (f.q) { const q = f.q.toLowerCase(); if (![g.id, g.code, g.airline, g.air, g.out.fn, g.inb.fn, ...g.pk.flatMap(k => [k.mk, k.md, k.id])].join(' ').toLowerCase().includes(q)) return false; }
  return true;
}
const legHtml = (t, l) => `<div class="leg"><div class="lt"><div class="ap">${esc(l.from)}</div><div class="t">${esc(l.dt)}</div></div><div class="ln"></div><div class="lt"><div class="ap">${esc(l.to)}</div><div class="t">${esc(l.at)}</div></div><div class="meta"><b>${t} ${esc(l.fn)}</b><br>${fdow(l.date)}, ${fdate(l.date)}${l.bag ? ' · ' + l.bag + ' kg baggage' : ''}</div></div>`;
function groupText(g) {
  return `*Umrah group ${g.airline}*\nDeparts ${fdow(g.dep)} ${fdate(g.dep)} · returns ${fdate(g.ret)} · ${g.n} nights\n${g.out.fn} ${g.out.from}-${g.out.to} ${g.out.dt}\n${g.inb.fn} ${g.inb.from}-${g.inb.to} ${g.inb.dt}\n\n` + g.pk.map(k => `${k.mk} (${k.mkn}N) + ${k.md} (${k.mdn}N)\n` + ROOMS.filter(r => k.p[r[0]]).map(r => `${r[1]}: PKR ${fnum(k.p[r[0]])}`).join(' · ')).join('\n\n') + `\n\nSeats left: ${g.seats}`;
}
function groupCard(g) {
  const d = DT(g.dep), out = g.seats <= 0, from = gFrom(g), staff = isStaff();
  const best = {}; ROOMS.forEach(r => { const v = g.pk.map(k => k.p[r[0]]).filter(x => x > 0); best[r[0]] = v.length ? Math.min(...v) : 0; });
  return `<div class="card gcard" id="g-${esc(g.id)}"><div class="gdate"><div class="m">${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}</div><div class="d">${p2(d.getUTCDate())}</div><div class="w">${fdow(g.dep)}</div><div class="n">${g.n} nights</div></div>
  <div><div class="gtop"><div class="air">${airBadge(g.air, g.airline, 46)}<div><b>${esc(g.airline || '')}</b><div class="sub">${esc(g.id)}${staff && g.code && g.code !== g.id ? ' · ' + esc(g.code) : ''}</div></div></div><div class="legs">${legHtml('Outbound', g.out)}${legHtml('Return', g.inb)}</div>
  <div class="gright">${from ? `<div class="gfrom"><small>from</small><b>${fnum(from)}</b><small>PKR / person</small></div>` : ''}<div class="seats ${seatCls(g.seats)}"><b>${out ? '0' : g.seats}</b><small>${out ? 'sold out' : 'seats left'}</small></div></div></div>
  <div class="pkh"><div>Makkah hotel</div><div>Madinah hotel</div>${ROOMS.map(r => `<div class="c">${r[1]}</div>`).join('')}</div>
  ${g.pk.map(k => `<div class="pkr"><div class="h"><b>${esc(k.mk || '-')}</b><small>${k.mkn} nights${k.mkd ? ' · ' + esc(k.mkd) : ''}</small></div><div class="h"><b>${esc(k.md || '-')}</b><small>${k.mdn} nights${k.mdd ? ' · ' + esc(k.mdd) : ''}</small></div>${ROOMS.map(r => `<button class="pc ${out || !k.p[r[0]] ? 'na' : ''} ${k.p[r[0]] && k.p[r[0]] === best[r[0]] && g.pk.length > 1 ? 'best' : ''}" data-act="gBook" data-a="${esc(g.id)}|${esc(k.id)}|${r[2]}" aria-label="Book ${r[1]}"><small>${r[1]}</small>${k.p[r[0]] ? fnum(k.p[r[0]]) : '-'}</button>`).join('')}</div>`).join('')}
  <div class="gfoot"><button class="btn sm" data-act="gQuote" data-a="${esc(g.id)}">${ic('terminal', 'sm')}Quote</button><a class="btn sm wa" target="_blank" rel="noopener" href="${waLinkTo(groupText(g))}">${ic('wa', 'sm')}Share</a><button class="btn sm ghost" data-act="gCopy" data-a="${esc(g.id)}">${ic('copy', 'sm')}Copy</button>${staff ? `<span class="sp"></span><button class="btn sm" data-act="gSeats" data-a="${esc(g.id)}">${ic('edit', 'sm')}Seats</button><button class="btn sm ghost" data-act="gDel" data-a="${esc(g.id)}" aria-label="Remove group">${ic('trash', 'sm')}</button>` : ''}</div></div></div>`;
}
const gList = () => {
  const f = gf(), rows = (S.groups || []).filter(g => matchG(g, f)).sort((a, b) => (f.sort === 'seats' ? b.seats - a.seats : f.sort === 'price' ? (gFrom(a) || 9e9) - (gFrom(b) || 9e9) : a.dep < b.dep ? -1 : 1));
  return rows.length ? rows.map(groupCard).join('') : `<div class="card">${(S.groups || []).length ? empty('search', 'No groups match your filters', '', '<button class="btn" data-act="gClear">Clear filters</button>') : empty('layers', 'No group packages published', isStaff() ? 'Import the latest supplier "Umrah Groups" PDF to publish departures.' : 'The office has not published any departures yet.', isStaff() ? `<button class="btn pri" data-act="gImport">${ic('upload')}Import groups PDF</button>` : '')}</div>`;
};
VIEWS.groups = {
  title: 'Group packages', roles: ['admin', 'staff', 'agent'],
  render() {
    const f = gf(), gs = S.groups || [], airs = uniq(gs.map(g => g.air)).sort(), months = uniq(gs.map(g => g.dep.slice(0, 7))).sort();
    return `<div class="ph"><div><h1>Group packages</h1><p>${gs.length} departure(s) · ${sum(gs, g => g.seats)} seats · departed groups are removed automatically</p></div><div class="sp">${isStaff() ? `<button class="btn pri" data-act="gImport">${ic('upload')}Import groups PDF</button>` : ''}<a class="btn" href="#/calculator">${ic('terminal')}Calculator</a></div></div>
    ${airs.length > 1 ? `<div class="chips" role="group" aria-label="Airline">${`<button class="chip ${!f.air ? 'on' : ''}" data-act="gAir" data-a="">All airlines</button>` + airs.map(a => `<button class="chip ${f.air === a ? 'on' : ''}" data-act="gAir" data-a="${esc(a)}">${airBadge(a, (gs.find(g => g.air === a) || {}).airline, 22)}${esc(Engine.airName(a, (gs.find(g => g.air === a) || {}).airline))}<i>${gs.filter(g => g.air === a).length}</i></button>`).join('')}</div>` : ''}
    <div class="fb"><div class="fld grow"><span>Search</span><input value="${esc(f.q || '')}" placeholder="Hotel, flight number, group code" data-inp="gQ"></div><div class="fld"><span>Month</span><select data-chg="gF" data-k="mon">${opts(months.map(m => [m, MONTHS[+m.slice(5) - 1] + ' ' + m.slice(0, 4)]), f.mon, 'Any month')}</select></div><div class="fld"><span>Nights</span><select data-chg="gF" data-k="n">${opts(uniq(gs.map(g => g.n)).sort((a, b) => a - b), f.n, 'Any')}</select></div><div class="fld"><span>Max price / person</span><input type="number" min="0" step="5000" value="${f.max || ''}" placeholder="PKR" data-chg="gF" data-k="max"></div><div class="fld"><span>Sort</span><select data-chg="gF" data-k="sort">${opts([['', 'Departure date'], ['price', 'Lowest price'], ['seats', 'Most seats']], f.sort)}</select></div><div class="qk"><label class="chk"><input type="checkbox" ${f.avail ? 'checked' : ''} data-chg="gF" data-k="avail">Only with seats</label><button class="btn sm ghost" data-act="gClear">${ic('x', 'sm')}Clear</button></div></div><div id="glist">${gList()}</div>`;
  }
};
CHG.gF = (v, t) => { gf()[t.dataset.k] = v; renderView(); };
INP.gQ = debounce(v => { gf().q = v; $('#glist').innerHTML = gList(); });
ACT.gAir = a => { gf().air = a; renderView(); };
ACT.gClear = () => { UI.f.grp = {}; renderView(); };
ACT.gCopy = id => navigator.clipboard.writeText(groupText(S.groups.find(g => g.id === id)).replace(/\*/g, '')).then(() => toast('Group details copied'));
ACT.gQuote = id => { UI.calc2 = UI.calc2 || null; UI.calcMode = 'group'; cc().gid = id; cc().pid = ''; go('calculator'); };
ACT.gBook = a => {
  const [gid, pid, room] = a.split('|'), g = S.groups.find(x => x.id === gid), k = g.pk.find(x => x.id === pid), price = k.p[ROOMS.find(r => r[2] === room)[0]];
  const cost = isStaff() ? Math.round(price * (S.groupCostPct || 95) / 100) : '';
  UI.prefill = { category: 'Group Package', groupRef: { gid, pid, room, seats: 0 }, services: [{ ...SVC_DEF('package'), type: 'package', title: `Umrah group ${g.airline} ${fdate(g.dep)} - ${room}`, qty: 1, autoQty: true, sell: price, cost, from: g.dep, to: g.ret,
    d: { code: g.id, airline: g.airline, out: g.out, inb: g.inb, makkah: k.mk, madinah: k.md, mkn: k.mkn, mdn: k.mdn, mkd: k.mkd, mdd: k.mdd, room } }] };
  go('bookingform', 'new');
};
ACT.gSeats = id => { const n = prompt('Seats remaining for ' + id, S.groups.find(g => g.id === id).seats); if (n !== null && n !== '') doRpc(null, 'setSeats', { id, seats: n }, 'Seats updated'); };
ACT.gDel = async id => { if (await confirmBox('Remove group', 'Remove ' + esc(id) + ' from the catalogue?', 'Remove', true)) await doRpc(null, 'delGroup', { id }, 'Group removed'); };

/* ---------- PDF import ---------- */
let IMP = [];
ACT.gImport = () => openModal({ title: 'Import supplier groups PDF', wide: true, body: `<div class="drop" data-act="gPick" id="drop">${ic('upload', 'lg')}<h3>Choose the "Umrah Groups" PDF</h3><p class="mute">Groups, flights, hotels, prices and seats are extracted automatically. Nothing is published until you confirm.</p><input type="file" id="gfile" accept="application/pdf" class="hide" data-chg="gFile"></div><div id="gprev"></div>` });
ACT.gPick = () => $('#gfile').click();
CHG.gFile = async (v, t) => {
  const f = t.files[0]; if (!f) return; const pv = $('#gprev'); pv.innerHTML = '<div class="c" style="padding:18px"><span class="spin dk"></span><div class="mute" style="margin-top:8px">Reading PDF...</div></div>';
  try {
    await loadPdf();
    IMP = await PdfParse.parsePdfFile(f); const t0 = todayISO(), live = IMP.filter(g => g.dep >= t0);
    if (!IMP.length) { pv.innerHTML = '<div class="errbox">No groups could be read from this PDF. Make sure it is the supplier "Umrah Groups" export.</div>'; return; }
    pv.innerHTML = `<div class="okbox" style="margin:14px 0">${IMP.length} group(s), ${sum(IMP, g => g.pk.length)} package(s) found${live.length < IMP.length ? ` · ${IMP.length - live.length} already departed will be skipped` : ''}.</div><div class="card tw" style="max-height:300px;overflow:auto"><table class="t"><thead><tr><th>Group</th><th>Departure</th><th>Return</th><th>Flight</th><th>Seats</th><th>Pkgs</th></tr></thead><tbody>${IMP.map(g => `<tr><td>${esc(g.id)}</td><td>${fdate(g.dep)}</td><td>${fdate(g.ret)}</td><td>${esc(g.out.fn)} / ${esc(g.inb.fn)}</td><td>${g.seats}</td><td>${g.pk.length}</td></tr>`).join('')}</tbody></table></div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn pri" data-act="gPub">Publish ${live.length} group(s)</button></div>`;
  } catch (e) { pv.innerHTML = `<div class="errbox">${esc(e.message)}</div>`; }
};
ACT.gPub = async (a, b) => { await doRpc(b, 'saveGroups', { groups: IMP }, 'Groups published', closeModal); };

