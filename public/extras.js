/* Header tools: live currency switcher (SerpApi rates), balance chip, real notifications, working global search */
'use strict';
Object.assign(IC, { globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9S9.4 5.8 12 3z"/>' });
const ago = iso => { const s = Math.max(0, (Date.now() - new Date(iso)) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return ftime(iso); };

/* ======================= CURRENCY ======================= */
const CURNAME = { PKR: 'Pakistani Rupee', USD: 'US Dollar', SAR: 'Saudi Riyal', AED: 'UAE Dirham', GBP: 'British Pound', EUR: 'Euro' };
(() => {
  let saved = 'PKR'; try { saved = localStorage.getItem('cur') || 'PKR'; } catch { /* private mode */ }
  const fx = () => S.fx || { perUnit: {}, src: {}, codes: ['PKR'] };
  Object.assign(CUR, {
    code: saved,
    per: c => (c === 'PKR' ? 1 : +(fx().perUnit || {})[c] || 0),
    ok: c => c === 'PKR' || CUR.per(c) > 0,
    active() { return CUR.ok(CUR.code) ? CUR.code : 'PKR'; },
    conv(n) { const c = CUR.active(); return c === 'PKR' ? (+n || 0) : (+n || 0) / CUR.per(c); },
    fmt(n) { const c = CUR.active(); if (c === 'PKR') return 'PKR ' + fnum(n); return c + ' ' + CUR.conv(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    set(c) { CUR.code = c; try { localStorage.setItem('cur', c); } catch { /* ignore */ } }
  });
})();

/* ======================= HEADER ======================= */
const Hdr = {
  balance() {
    if (isAgent() && S.wallet) { const w = S.wallet; return { label: w.available < 0 ? 'Balance' : 'Available', amt: w.available, bad: w.available <= 0, href: '#/account/' + S.user.pid, tip: 'Credit limit ' + fmt(w.limit) + ' · outstanding ' + fmt(w.balance) + (w.pending ? ' · pending payments ' + fmt(w.pending) : '') }; }
    if (isSup()) { const p = (S.parties || [])[0]; if (p) return { label: 'Balance due to you', amt: p.bal || 0, bad: false, href: '#/account/' + S.user.pid, tip: 'Open your ledger' }; }
    if (isStaff() && (S.parties || []).some(p => p.bal !== undefined)) { const r = sum((S.parties || []).filter(p => p.kind !== 'supplier' && p.bal > 0), p => p.bal); return { label: 'Receivable', amt: r, bad: false, href: '#/accounts', tip: 'Owed by agents & customers' }; }
    return null;
  },
  balHtml() { const b = this.balance(); if (!b) return ''; return `<a class="hbal ${b.bad ? 'bad' : ''}" href="${b.href}" title="${esc(b.tip)}">${ic('wallet', 'sm')}<span><small>${esc(b.label)}</small><b class="num">${esc(fmtN(b.amt))}</b></span></a>`; },
  curHtml() { return `<button class="hbtn" data-act="curToggle" title="Display currency" aria-label="Currency">${ic('globe', 'sm')}<b>${esc(CUR.active())}</b>${ic('chev', 'sm')}</button><div class="hpop" id="cur-pop" hidden></div>`; },
  bellHtml() { const n = (S.notifs || {}).unread || 0; return `<button class="hbtn icon" data-act="bellToggle" title="Notifications" aria-label="Notifications">${ic('bell')}<i class="hdot" id="bell-n" ${n ? '' : 'hidden'}>${n > 99 ? '99+' : n}</i></button><div class="hpop np" id="bell-pop" hidden></div>`; },
  render() { const h = $('#hd'); if (!h) return; h.innerHTML = `<span id="hd-bal">${this.balHtml()}</span><span class="hpw" id="hd-cur">${this.curHtml()}</span><span class="hpw" id="hd-bell">${this.bellHtml()}</span>`; },
  update() {
    if (!$('#hd')) return;
    const b = $('#hd-bal'); if (b) b.innerHTML = this.balHtml();
    const n = (S.notifs || {}).unread || 0, d = $('#bell-n'); if (d) { d.hidden = !n; d.textContent = n > 99 ? '99+' : n; }
    const cb = $('#hd-cur .hbtn b'); if (cb) cb.textContent = CUR.active();
    if (!$('#bell-pop').hidden) Notifs.paint(); if (!$('#cur-pop').hidden) Cur.paint();
  }
};
document.addEventListener('mousedown', e => {
  if (!e.target.closest('.hpw')) $$('.hpop').forEach(p => { p.hidden = true; });
  if (!e.target.closest('#gs')) { const r = $('#gsr'); if (r) r.hidden = true; }
});

/* ======================= CURRENCY MENU ======================= */
const Cur = {
  paint() {
    const f = S.fx || { codes: ['PKR'], perUnit: {}, src: {} }, p = $('#cur-pop'); if (!p) return;
    const rows = (f.codes || ['PKR']).map(c => {
      const per = CUR.per(c), on = CUR.active() === c, tag = c === 'PKR' ? 'base' : (f.src || {})[c] === 'manual' ? 'manual' : per ? 'live' : '';
      return `<button class="cur ${on ? 'on' : ''}" ${c !== 'PKR' && !per ? 'disabled' : ''} data-act="curSet" data-a="${c}"><b>${c}</b><span>${esc(CURNAME[c] || c)}<small>${c === 'PKR' ? 'Base currency' : per ? '1 ' + c + ' = PKR ' + per.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'rate unavailable'}</small></span>${tag ? `<em class="${tag}">${tag}</em>` : ''}${on ? ic('check', 'sm') : ''}</button>`;
    }).join('');
    const foot = !f.configured ? `<div class="cfoot warn">${ic('alert', 'sm')}<span>Live rates need a SerpApi key. ${isAdmin() || can('integrations.manage') ? '<a href="#/settings">Add it in Settings → Integrations</a>.' : 'Ask the administrator to add it in Settings.'}${(f.perUnit || {}).SAR ? '' : ''}</span></div>`
      : `<div class="cfoot">${f.updated ? 'Live · ' + esc(f.source || 'SerpApi') + ' · updated ' + ago(f.updated) : (f.error ? '<span class="neg">' + esc(f.error) + '</span>' : 'Fetching live rates…')}<button class="lnk" data-act="curRefresh">${ic('refresh', 'sm')}Refresh</button></div>${f.error && f.updated ? `<div class="cfoot warn"><span>Some rates failed: ${esc(f.error)}</span></div>` : ''}`;
    p.innerHTML = `<div class="ph2">Display currency</div>${rows}${foot}<div class="cnote">Display only. Bookings, ledgers and payments are always recorded in PKR.</div>`;
  }
};
ACT.curToggle = async () => {
  const p = $('#cur-pop'), open = p.hidden; $$('.hpop').forEach(x => { x.hidden = true; }); if (!open) return; p.hidden = false; Cur.paint();
  if (S.fx && S.fx.configured && !S.fx.updated) { try { S.fx = await api('/api/fx'); } catch { /* shown in popover */ } Hdr.update(); Cur.paint(); }
};
ACT.curSet = c => { if (!CUR.ok(c)) return toast('No live rate for ' + c + ' yet', true); CUR.set(c); $$('.hpop').forEach(x => { x.hidden = true; }); Hdr.update(); renderShellBits(); renderView(); toast('Showing amounts in ' + c); };
ACT.curRefresh = async (a, b) => { busy(b, true); try { S.fx = await api('/api/fx/refresh', { method: 'POST', body: '{}' }); Cur.paint(); Hdr.update(); renderView(); toast(S.fx.error && !S.fx.updated ? S.fx.error : 'Rates refreshed', !!(S.fx.error && !S.fx.updated)); } catch (e) { toast(e.message, true); busy(b, false); } };

/* ======================= NOTIFICATIONS ======================= */
const NIC = { booking: 'briefcase', pay: 'wallet', query: 'bell', ticket: 'ticket', ok: 'check', warn: 'alert', bad: 'alert', info: 'info' };
const Notifs = {
  init: false, seen: new Set(),
  items: () => (S.notifs || {}).items || [],
  onState() {
    const it = this.items(); if (!S.user) return;
    if (!this.init) { this.init = true; it.forEach(n => this.seen.add(n.id)); this.title(); return; }
    const fresh = it.filter(n => !this.seen.has(n.id) && !n.read); it.forEach(n => this.seen.add(n.id));
    fresh.slice(0, 3).forEach(n => toast(n.title + (n.body ? ' — ' + n.body : '')));
    if (fresh.length > 3) toast(fresh.length - 3 + ' more notifications');
    if (fresh.length && document.hidden && 'Notification' in window && Notification.permission === 'granted') fresh.slice(0, 3).forEach(n => { try { new Notification(n.title, { body: n.body, icon: '/brand/icon-192.png', tag: n.id }); } catch { /* unsupported */ } });
    this.title();
  },
  title() { const n = (S.notifs || {}).unread || 0, base = document.title.replace(/^\(\d+\)\s*/, ''); document.title = (n ? '(' + n + ') ' : '') + base; },
  paint() {
    const p = $('#bell-pop'); if (!p) return; const it = this.items(), un = (S.notifs || {}).unread || 0;
    p.innerHTML = `<div class="nh"><b>Notifications</b>${un ? `<button class="lnk" data-act="nAll">Mark all read</button>` : ''}</div><div class="nl">${it.length ? it.map(n => `<button class="ni ${n.read ? '' : 'un'} k-${esc(n.kind)}" data-act="nGo" data-a="${esc(n.id)}"><span class="nic">${ic(NIC[n.kind] || 'info', 'sm')}</span><span class="nt"><b>${esc(n.title)}</b><small>${esc(n.body)}</small><em>${ago(n.t)}</em></span>${n.read ? '' : '<i class="udot"></i>'}</button>`).join('') : `<div class="nempty">${ic('bell', 'lg')}<p>You're all caught up.<br><small>New bookings, payments, quotes and ticket replies appear here.</small></p></div>`}</div>
    ${'Notification' in window && Notification.permission === 'default' ? `<div class="nf"><button class="btn sm" data-act="nPerm">${ic('bell', 'sm')}Enable desktop alerts</button></div>` : ''}`;
  }
};
ACT.bellToggle = () => { const p = $('#bell-pop'), open = p.hidden; $$('.hpop').forEach(x => { x.hidden = true; }); if (open) { p.hidden = false; Notifs.paint(); } };
ACT.nGo = async id => {
  const n = Notifs.items().find(x => x.id === id); $$('.hpop').forEach(x => { x.hidden = true; }); if (!n) return;
  if (!n.read) { n.read = true; S.notifs.unread = Math.max(0, S.notifs.unread - 1); Hdr.update(); Notifs.title(); rpc('markNotifs', { id }).catch(() => {}); }
  if (n.link) { if (location.hash === n.link) renderView(); else location.hash = n.link; }
};
ACT.nAll = async () => { try { await rpc('markNotifs', { all: true }); Notifs.items().forEach(n => { n.read = true; }); S.notifs.unread = 0; Notifs.paint(); Hdr.update(); Notifs.title(); } catch (e) { toast(e.message, true); } };
ACT.nPerm = async () => { try { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Desktop alerts enabled' : 'Desktop alerts blocked in the browser', r !== 'granted'); } catch { /* ignore */ } Notifs.paint(); };

/* ======================= GLOBAL SEARCH ======================= */
const GS = { idx: -1, hits: [] };
function gsRun(q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean); if (!terms.length) return [];
  const m = (hay, key) => { hay = hay.toLowerCase(); if (!terms.every(t => hay.includes(t))) return 0; return (key && String(key).toLowerCase().startsWith(terms[0]) ? 3 : 1) + (hay.split(/\s+/).includes(terms[0]) ? 1 : 0); };
  const out = [], add = (grp, icn, title, sub, href, sc) => out.push({ grp, icn, title, sub, href, sc });
  const staff = isStaff();
  (S.bookings || []).forEach(b => {
    const hay = [b.no, ...b.pax.flatMap(x => [x.n, x.pp]), ...b.services.flatMap(s => [s.conf, s.title]), staff ? P(b.partyId).name : ''].join(' '), sc = m(hay, b.no) || m(hay, (b.pax[0] || {}).pp);
    if (sc) add('Bookings', 'briefcase', b.no + ' · ' + lead(b), [b.category, b.from ? fdate(b.from) : '', staff ? P(b.partyId).name : '', b.status].filter(Boolean).join(' · '), '#/booking/' + b.id, sc + (b.no.toLowerCase().startsWith(terms[0]) ? 2 : 0));
  });
  (S.vouchers || []).forEach(v => { const sc = m([v.no, v.kind, v.createdBy].join(' '), v.no); if (sc) { const b = (S.bookings || []).find(x => x.id === v.bookingId); add('Vouchers', 'ticket', 'Voucher ' + v.no, b ? 'Booking ' + b.no + ' · ' + lead(b) : '', b ? '#/booking/' + b.id : '#/bookings', sc); } });
  (S.queries || []).forEach(q2 => { const sc = m([q2.no, q2.type, q2.text, q2.contact && q2.contact.name, q2.contact && q2.contact.phone, q2.partyId && staff ? P(q2.partyId).name : ''].join(' '), q2.no); if (sc) add('Queries', 'bell', q2.no + ' · ' + q2.type, (q2.text || '').slice(0, 70) + ' · ' + (LABEL[q2.status] || q2.status), '#/queries', sc); });
  if (staff) (S.parties || []).forEach(p => { const sc = m([p.name, p.phone, p.email, p.city].join(' '), p.name); if (sc) add('Accounts', p.kind === 'supplier' ? 'building' : 'users', p.name, [p.kind, p.phone, p.city].filter(Boolean).join(' · '), '#/account/' + p.id, sc); });
  (S.payments || []).forEach(p => { const sc = m([p.id, p.ref, p.method, p.amt, p.note, staff ? P(p.partyId).name : ''].join(' '), p.ref); if (sc) add('Payments', 'wallet', fmt(p.amt) + ' · ' + p.method, [p.status, p.ref, p.date, staff ? P(p.partyId).name : ''].filter(Boolean).join(' · '), staff ? '#/payments' : '#/payments', sc); });
  (S.tickets || []).forEach(t => { const sc = m([t.no, t.subject, t.category, t.bookingNo].join(' '), t.no); if (sc) add('Support tickets', 'ticket', t.no + ' · ' + t.subject, t.status + ' · ' + t.category, '#/support/' + t.id, sc); });
  if (!isSup()) (S.groups || []).forEach(g => { const sc = m([g.airline, g.code, g.makkah, g.madinah, g.dep].join(' '), g.airline); if (sc) add('Group packages', 'layers', (g.airline || 'Group') + (g.code ? ' · ' + g.code : ''), 'Departs ' + fdate(g.dep) + ' · ' + (g.seats != null ? g.seats + ' seats' : ''), '#/groups', sc); });
  $$('#nav a').forEach(a => { const t = a.querySelector('span') ? a.querySelector('span').textContent : ''; const sc = m(t, t); if (sc) add('Go to', 'arrow', t, '', a.getAttribute('href'), sc - 0.5); });
  const order = ['Bookings', 'Vouchers', 'Queries', 'Accounts', 'Payments', 'Support tickets', 'Group packages', 'Go to'], res = [];
  order.forEach(g => out.filter(x => x.grp === g).sort((a, b) => b.sc - a.sc).slice(0, g === 'Bookings' ? 6 : 4).forEach(x => res.push(x)));
  return res;
}
function gsPaint() {
  const r = $('#gsr'), q = ($('#gsearch') || {}).value || ''; if (!r) return;
  if (!q.trim()) { r.hidden = true; return; }
  GS.hits = gsRun(q); GS.idx = GS.hits.length ? 0 : -1;
  const nb = (S.bookings || []).length;
  let g = '', html = '';
  GS.hits.forEach((h, i) => { if (h.grp !== g) { g = h.grp; html += `<div class="gh">${esc(g)}</div>`; } html += `<a class="gi ${i === GS.idx ? 'on' : ''}" href="${esc(h.href)}" data-i="${i}">${ic(h.icn, 'sm')}<span><b>${esc(h.title)}</b>${h.sub ? `<small>${esc(h.sub)}</small>` : ''}</span></a>`; });
  if (!GS.hits.length) html = `<div class="gnone">${ic('search')}<p>No match for “${esc(q.trim())}” in your bookings, queries${isStaff() ? ', accounts' : ''} or payments.</p></div>`;
  html += `<div class="gf">${nb ? `<a href="#/bookings" data-act="gsAll">${ic('briefcase', 'sm')}All bookings matching “${esc(q.trim())}”</a>` : ''}${isSup() ? '' : `<a href="#/search">${ic('plane', 'sm')}Search flights & hotels</a>`}</div>`;
  r.innerHTML = html; r.hidden = false;
}
INP.gs = debounce(gsPaint, 90);
const gsMove = d => { if (!GS.hits.length) return; GS.idx = (GS.idx + d + GS.hits.length) % GS.hits.length; $$('#gsr .gi').forEach(a => a.classList.toggle('on', +a.dataset.i === GS.idx)); const a = $('#gsr .gi.on'); a && a.scrollIntoView({ block: 'nearest' }); };
ACT.gsAll = () => { UI.f.bookings = { q: ($('#gsearch') || {}).value.trim() }; $('#gsr').hidden = true; if (location.hash === '#/bookings') renderView(); };
ACT.gsearch = () => { const q = (($('#gsearch') || {}).value || '').trim(); if (!q) return; const h = GS.hits[GS.idx]; if (h) { $('#gsr').hidden = true; $('#gsearch').blur(); location.hash = h.href; } else { UI.f.bookings = { q }; $('#gsr').hidden = true; go('bookings'); } };
document.addEventListener('keydown', e => {
  const inp = $('#gsearch'); if (!inp) return;
  if ((e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); inp.focus(); inp.select(); return; }
  if (e.target !== inp) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); gsMove(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); gsMove(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); ACT.gsearch(); } else if (e.key === 'Escape') { $('#gsr').hidden = true; inp.blur(); }
});
document.addEventListener('focusin', e => { if (e.target.id === 'gsearch' && e.target.value.trim()) gsPaint(); });
document.addEventListener('click', e => { const a = e.target.closest('#gsr .gi'); if (a) { $('#gsr').hidden = true; $('#gsearch').value = ''; } });
