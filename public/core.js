/* The Umrah Store CRM v3 - core: helpers, icons, api, state, ui, shell, router */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fnum = n => Math.round(+n || 0).toLocaleString('en-US');
var CUR = { fmt: n => 'PKR ' + fnum(n), conv: n => +n || 0, code: 'PKR' }; // replaced/extended by extras.js (live currency switcher)
const fmt = n => CUR.fmt(n);
const fmtN = n => (+n < 0 ? '- ' + CUR.fmt(-n) : CUR.fmt(n)); // negative balances read "- PKR 5,000"
const fshortM = n => { n = Math.round(CUR.conv(n) || 0); const a = Math.abs(n); return (n < 0 ? '-' : '') + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'K' : a); };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DT = iso => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return new Date(Date.UTC(+y, +m - 1, +d)); };
const p2 = n => String(n).padStart(2, '0');
const fdate = iso => { if (!iso) return '-'; const d = DT(iso); return p2(d.getUTCDate()) + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
const fshort = iso => { if (!iso) return '-'; const d = DT(iso); return p2(d.getUTCDate()) + ' ' + MONTHS[d.getUTCMonth()]; };
const fdow = iso => DOW[DT(iso).getUTCDay()];
const addDays = (iso, n) => { const d = DT(iso); d.setUTCDate(d.getUTCDate() + n); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); };
const diffDays = (a, b) => Math.round((DT(b) - DT(a)) / 864e5);
const todayISO = () => (S && S.today) || new Date().toISOString().slice(0, 10);
const ftime = iso => { try { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch { return iso; } };
const initials = n => String(n || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const uniq = a => [...new Set(a)];
const csvCell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
const downloadCSV = (name, rows) => { const b = new Blob(['\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const debounce = (f, ms = 180) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

/* ---------- icons ---------- */
const IC = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12.5l9 5 9-5"/><path d="M3 17l9 5 9-5"/>',
  plane: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>',
  bed: '<path d="M3 18V6"/><path d="M3 14h18v4"/><path d="M21 14v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11" r="1.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.6 0 4.5 1.8 4.5 4.5"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M4 21a2 2 0 0 1 2-2h13"/><path d="M9 8h6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  download: '<path d="M12 4v11"/><path d="M7.5 11L12 15.5 16.5 11"/><path d="M4 20h16"/>',
  upload: '<path d="M12 16V5"/><path d="M7.5 9L12 4.5 16.5 9"/><path d="M4 20h16"/>',
  logout: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M16 8l4 4-4 4M20 12H9"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z"/><path d="M10 21h4"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  bus: '<rect x="4" y="4" width="16" height="13" rx="2.5"/><path d="M4 11h16M7 17v3M17 17v3"/><circle cx="8" cy="14" r=".7"/><circle cx="16" cy="14" r=".7"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  dome: '<path d="M12 2v3"/><path d="M5 21V12a7 7 0 0 1 14 0v9"/><path d="M3 21h18M9 21v-5a3 3 0 0 1 6 0v5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  alert: '<path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4M12 17v.5"/>',
  trend: '<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 10l3 2-3 2M12 15h5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  ticket: '<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/>',
  filter: '<path d="M4 5h16l-6 8v6l-4-2v-4L4 5z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A16.5 16.5 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1"/>',
  wa: '<path d="M4 20l1.3-4.2A8 8 0 1 1 8.3 18.8L4 20z"/><path d="M9 9.5c.3 2.2 2.3 4.2 4.5 4.5l1.2-1.2-1.8-1-.8.6c-.7-.3-1.4-1-1.7-1.7l.6-.8-1-1.8L9 9.5z"/>'
};

IC.left='<path d="M15 5l-7 7 7 7"/>';
IC.mail='<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>';
IC.image='<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>';
IC.card='<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h3"/>';
IC.link='<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>';
IC.qr='<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h3v3h-3zM20 14v6h-3M14 20h.01"/>';
IC.star='<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8L12 3.5z"/>';
IC.spark='<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z"/>';
IC.passport='<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8.5 16.5h7"/>';
IC.swap='<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>';
IC.refresh='<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>';
IC.copy='<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>';
IC.send='<path d="M21 3L3 10.5l7 2.5 2.5 7L21 3z"/><path d="M10 13l11-10"/>';
IC.stamp='<path d="M9 14a4 4 0 1 1 6 0c-.8.8-1 1.5-1 3H10c0-1.5-.2-2.2-1-3z"/><path d="M6 20h12"/>';
IC.hotel='<path d="M3 20V5M21 20v-7a3 3 0 0 0-3-3h-8v6"/><path d="M3 15h18"/><circle cx="6.5" cy="11" r="1.6"/>';
const ic = (n, c = '') => `<svg class="i ${c}" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ''}</svg>`;

/* ---------- state + api ---------- */
let S = { user: null, company: {}, groups: [] };
const ACT = {}, INP = {}, CHG = {}, VIEWS = {}, UI = { f: {} };
async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...opts });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && S.user) { S.user = null; renderRoot(); }
  if (!r.ok) { const e = new Error(j.error || 'Request failed'); Object.assign(e, j); throw e; }
  return j;
}
const rpc = (op, p = {}) => api('/api/rpc', { method: 'POST', body: JSON.stringify({ op, ...p }) });
async function load() { S = await api('/api/state'); if (typeof Notifs !== 'undefined') Notifs.onState(); }

/* ---------- roles & lookups ---------- */
const role = () => (S.user && S.user.role) || '';
const isAdmin = () => role() === 'admin';
const isStaff = () => role() === 'admin' || role() === 'staff';
const isAgent = () => role() === 'agent';
const isSup = () => role() === 'supplier';
const canApprove = () => !!(S.flags && S.flags.canApprove);
const can = k => isAdmin() || (S.perms || []).includes(k);
const canAny = (...k) => k.some(can);
const canCost = () => isAdmin() || can('bookings.costs');
/* page -> permission(s) (any of). Staff only; the server enforces the same rules on every request. */
const VPERM = { applications: ['agents.create'], support: ['support.view'], home: ['dashboard.view'], bookings: ['bookings.view'], booking: ['bookings.view'], bookingform: ['bookings.create', 'bookings.edit'], queries: ['queries.view'], search: ['search.flights', 'search.hotels'], groups: ['groups.view'], chat: ['chat.view'], promos: ['promos.view', 'promos.edit'], assistant: ['assistant.groups'], calculator: ['calculator.view'], transport: ['transport.view'], rates: ['rates.view'],
  accounts: ['agents.view', 'suppliers.view', 'customers.view', 'ledgers.agent.view', 'ledgers.supplier.view'], account: ['agents.view', 'suppliers.view', 'customers.view', 'ledgers.agent.view', 'ledgers.supplier.view'], payments: ['payments.view'], banking: ['payments.view', 'payments.create', 'settings.banking', 'ledgers.agent.view'], reports: ['reports.view'],
  staff: ['staff.view', 'roles.manage', 'permissions.manage', 'audit.view'], settings: ['settings.view', 'settings.company', 'settings.general', 'settings.branding', 'settings.banking', 'settings.bookings', 'settings.pricing', 'integrations.view', 'integrations.manage', 'data.import', 'data.backup', 'audit.view'] };
const P = id => (S.parties || []).find(p => p.id == id) || { name: '(removed)', kind: 'agent' };
const partiesOf = k => (S.parties || []).filter(p => p.kind === k && p.active !== false);
const lineSell = s => Math.round((+s.sell || 0) * (+s.qty || 1));
const lineCost = s => Math.round((+s.cost || 0) * (+s.qty || 1));
const bSell = b => sum(b.services, lineSell);
const bCost = b => sum(b.services, lineCost);
const SVC = {
  visa: { label: 'Visa', ic: 'passport', c: '#6d28d9' }, hotel: { label: 'Hotel', ic: 'hotel', c: '#0f7a4f' }, transport: { label: 'Transport', ic: 'bus', c: '#b54708' },
  flight: { label: 'Flight', ic: 'plane', c: '#175cd3' }, package: { label: 'Package', ic: 'dome', c: '#8c6a1f' }, other: { label: 'Other', ic: 'briefcase', c: '#475467' }
};
const STAT = { Pending: 'amber', Confirmed: 'green', Cancelled: 'gray', Approved: 'green', Rejected: 'red', Initiated: 'gray', Failed: 'red', Open: 'amber', Quoted: 'blue', Accepted: 'green', Booked: 'green', Expired: 'red', Closed: 'gray', Paid: 'green' };
const badge = (s, label) => `<span class="bdg ${STAT[s] || 'gray'}">${esc(label || s)}</span>`;
const LABEL = { Expired: 'Auto-rejected', Confirmed: 'Approved', Pending: 'Pending approval' };
const sbadge = s => badge(s, LABEL[s] || s);
const empty = (icn, title, sub, btn = '') => `<div class="empty">${ic(icn, 'lg')}<h3>${esc(title)}</h3><p>${esc(sub || '')}</p>${btn}</div>`;
const fld = (label, inner, cls = '') => `<label class="fld ${cls}"><span>${esc(label)}</span>${inner}</label>`;
const opts = (list, sel, blank) => (blank != null ? `<option value="">${esc(blank)}</option>` : '') + list.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
const logoUrl = () => '/brand/logo?v=' + (S.logoV || 0);
const logoImg = (alt, w = 160) => `<img src="${logoUrl()}" srcset="/brand/logo?s=lg&v=${S.logoV || 0} 2x" width="${w}" height="${Math.round(w * 1.106)}" decoding="async" fetchpriority="high" alt="${esc(alt)}">`;

/* ---------- toast / modal ---------- */
function toast(msg, err) {
  let w = $('.toasts'); if (!w) { w = document.createElement('div'); w.className = 'toasts'; document.body.appendChild(w); }
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.innerHTML = (err ? ic('alert') : ic('check')) + '<span>' + esc(msg) + '</span>';
  w.appendChild(t); setTimeout(() => t.remove(), err ? 7000 : 3400);
}
function openModal({ title, body, foot = '', wide = false, onOpen }) {
  closeModal();
  const m = document.createElement('div'); m.className = 'mask'; m.id = 'modal';
  m.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="mh"><h3>${esc(title)}</h3><button class="btn ghost icon sm" data-act="closeModal" aria-label="Close">${ic('x')}</button></div><div class="mb">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div>`;
  m.addEventListener('mousedown', e => { if (e.target === m) closeModal(); });
  document.body.appendChild(m); const f = $('input:not([type=hidden]):not([type=file]),select,textarea', m); if (f && !wide) f.focus();
  if (onOpen) onOpen(m); return m;
}
const closeModal = () => { const m = $('#modal'); if (m) m.remove(); };
ACT.closeModal = closeModal;
function confirmBox(title, msg, ok = 'Confirm', danger = false) {
  return new Promise(res => {
    openModal({ title, body: `<p style="font-size:14.5px;line-height:1.6">${msg}</p>`, foot: `<button class="btn ghost" data-act="cbNo">Cancel</button><button class="btn ${danger ? 'danger' : 'pri'}" data-act="cbYes">${esc(ok)}</button>` });
    ACT.cbYes = () => { closeModal(); res(true); }; ACT.cbNo = () => { closeModal(); res(false); };
  });
}
const busy = (btn, on) => { if (!btn) return; if (on) { btn._h = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; } else { btn.disabled = false; if (btn._h) btn.innerHTML = btn._h; } };
/** run an rpc with button spinner + toast + state refresh */
async function doRpc(btn, op, p, okMsg, then) {
  busy(btn, true);
  try { const r = await rpc(op, p); if (okMsg) toast(okMsg); await refresh(); if (then) then(r); return r; }
  catch (e) { toast(e.message, true); busy(btn, false); throw e; }
}
async function refresh() { await load(); renderShellBits(); renderView(); }
const val = (id, r = document) => { const e = $('#' + id, r); return e ? e.value : ''; };
const readFile = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

/* ---------- event delegation ---------- */
document.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (!t || t.disabled) return; const f = ACT[t.dataset.act]; if (f) { if (t.tagName === 'A' && !t.getAttribute('href')) e.preventDefault(); f(t.dataset.a, t, e); } });
document.addEventListener('input', e => { const t = e.target.closest('[data-inp]'); if (t && INP[t.dataset.inp]) INP[t.dataset.inp](t.value, t, e); });
document.addEventListener('change', e => { const t = e.target.closest('[data-chg]'); if (t && CHG[t.dataset.chg]) CHG[t.dataset.chg](t.type === 'checkbox' ? t.checked : t.value, t, e); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); if (e.key === 'Enter' && e.target.matches('[data-enter]')) { e.preventDefault(); ACT[e.target.dataset.enter](e.target.value, e.target); } });

/* ---------- router ---------- */
const route = () => { const h = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent); return { name: h[0] || 'home', args: h.slice(1) }; };
const go = (...p) => { const h = '#/' + p.map(encodeURIComponent).join('/'); if (location.hash === h) renderView(); else location.hash = h; };
window.addEventListener('hashchange', () => { closeModal(); $('.side') && $('.side').classList.remove('open'); renderView(); window.scrollTo(0, 0); });

function nav() {
  const pend = isStaff() ? (S.bookings || []).filter(b => b.status === 'Pending').length : 0, pq = isStaff() ? (S.queries || []).filter(q => q.status === 'Open').length : isAgent() ? (S.queries || []).filter(q => q.status === 'Quoted').length : 0;
  const pp = isStaff() ? (S.payments || []).filter(p => p.status === 'Pending').length : 0;
  const items = isSup() ? [['SECTION', 'Work'], ['home', 'Overview', 'home'], ['bookings', 'Services', 'briefcase'], ['account/' + S.user.pid, 'My ledger', 'book'], ['SECTION', 'Help'], ['support', 'Help & support', 'ticket', tkBadge()]]
    : isStaff() ? (() => {
      const w = [can('agents.create') && ['applications', 'Partner applications', 'users', S.appsPending || ''], can('dashboard.view') && ['home', 'Overview', 'home'], canAny(...VPERM.bookings) && ['bookings', 'Bookings', 'briefcase', pend || ''], can('queries.view') && ['queries', 'Queries', 'bell', pq || ''], can('chat.view') && ['chat', 'Live chat', 'chat', typeof chatBadge === 'function' ? chatBadge() : ''], (can('promos.view') || can('promos.edit')) && ['promos', 'Promotions', 'tag'], can('support.view') && ['support', 'Support tickets', 'ticket', tkBadge()], canAny(...VPERM.search) && ['search', 'Flights & hotels', 'search'], can('groups.view') && ['groups', 'Group packages', 'layers'], can('calculator.view') && ['calculator', 'Umrah calculator', 'terminal'], can('transport.view') && ['transport', 'Transport booking', 'bus']].filter(Boolean);
      const m = [can('rates.view') && ['rates', 'Rates & inventory', 'tag'], canAny(...VPERM.accounts) && ['accounts', 'Accounts & ledgers', 'users'], can('payments.view') && ['payments', 'Payments', 'wallet', pp || ''], canAny(...VPERM.banking) && ['banking', 'Bank accounts', 'card'], can('reports.view') && ['reports', 'Profit & reports', 'chart']].filter(Boolean);
      const a = [canAny(...VPERM.staff) && ['staff', 'Staff & access', 'shield'], (isAdmin() || can('assistant.groups')) && ['assistant', 'AI assistant', 'spark'], canAny(...VPERM.settings) && ['settings', 'Settings', 'settings']].filter(Boolean);
      return [['SECTION', 'Work'], ...w, ...(m.length ? [['SECTION', 'Money'], ...m] : []), ...(a.length ? [['SECTION', 'Admin'], ...a] : [])];
    })()
    : [['SECTION', 'Work'], ['home', 'Overview', 'home'], ['bookings', 'My bookings', 'briefcase', pend || ''], ['queries', 'Queries', 'bell', pq || ''], ['search', 'Flights & hotels', 'search'], ['groups', 'Group packages', 'layers'], ['calculator', 'Umrah calculator', 'terminal'], ['transport', 'Transport booking', 'bus'],
      ['SECTION', 'Money'], ['account/' + S.user.pid, 'My ledger', 'book'], ['payments', 'Payments', 'wallet', pp || ''], ['banking', 'Bank accounts', 'card'],
      ['SECTION', 'Help'], ['support', 'Help & support', 'ticket', tkBadge()]];
  const cur = route(), on = (k) => (k === cur.name || (k.split('/')[0] === 'account' && cur.name === 'account' && cur.args[0] == k.split('/')[1]) || (k === 'accounts' && cur.name === 'account' && isStaff()) || (k === 'bookings' && ['booking', 'bookingform'].includes(cur.name)));
  return items.map(i => i[0] === 'SECTION' ? `<div class="nav-l">${i[1]}</div>` : `<a href="#/${i[0]}" class="${on(i[0]) ? 'on' : ''}">${ic(i[2])}<span>${i[1]}</span>${i[3] ? `<b class="nb">${i[3]}</b>` : ''}</a>`).join('');
}
const tkBadge = () => { const t = S.tickets || []; return (isStaff() ? t.filter(x => x.status === 'Open').length : t.filter(x => x.status === 'Answered').length) || ''; };
function renderShellBits() { const n = $('#nav'); if (n) n.innerHTML = nav(); if (typeof Hdr !== 'undefined') Hdr.update(); }

function renderRoot() {
  const root = $('#root');
  if (!S.user) { location.replace('/?login=1'); return; }
  const co = S.company || {};
  root.innerHTML = `<div class="app"><aside class="side"><a class="brand" href="#/home">${logoImg(co.name, 46)}<span><b>${esc(co.name || 'The Umrah Store')}</b><small>${esc(co.tagline || 'Premium Islamic Travel')}</small></span></a><nav class="nav" id="nav">${nav()}</nav>
  <div class="scon"><b>Contact</b><a href="tel:+923136935568">+92 313 693 5568</a><a href="mailto:info@theumrahstore.com">info@theumrahstore.com</a><span>Lahore · Okara · Islamabad</span></div>
  <div class="me"><div class="av">${esc(initials(S.user.name))}</div><div class="mi"><b>${esc(S.user.name)}</b><small>${esc(S.user.role === 'staff' ? (S.user.title || 'staff') : S.user.role)}</small></div><button class="btn ghost icon sm" data-act="pw" title="Change password">${ic('key')}</button><button class="btn ghost icon sm" data-act="logout" title="Sign out">${ic('logout')}</button></div></aside>
  <div class="scrim" data-act="menu"></div><main class="main"><header class="top"><button class="btn ghost icon burger" data-act="menu" aria-label="Menu">${ic('menu')}</button><div class="crumb" id="crumb"></div>
  <div class="gs" id="gs">${ic('search', 'sm')}<input id="gsearch" placeholder="Search bookings, passports, queries, accounts...   ( / )" data-inp="gs" autocomplete="off" spellcheck="false"><div class="gsr" id="gsr" hidden></div></div><div class="hd" id="hd"></div>
  ${isSup() || (isStaff() && !can('bookings.create')) ? '' : `<a class="btn pri" href="#/bookingform/new">${ic('plus', 'sm')}<span class="hm">New booking</span></a>`}</header>
  ${S.user.mustChange ? `<div class="banner">${ic('shield')}<span>${isAdmin() ? 'You are using the default administrator password.' : 'Your password was set by an administrator.'} <a data-act="pw" href="#">Change it now</a>.</span></div>` : ''}<div class="page" id="page"></div></main></div>`;
  if (typeof Hdr !== 'undefined') Hdr.render();
  renderView();
}
ACT.menu = () => $('.side').classList.toggle('open');
ACT.gsearch = v => { v = (v || '').trim(); if (!v) return; UI.f.bookings = { q: v }; go('bookings'); };
ACT.logout = async () => { if (typeof Notifs !== 'undefined') Notifs.init = false; await api('/api/logout', { method: 'POST' }).catch(() => {}); S = { user: null, company: S.company, groups: [] }; location.href = '/'; };
ACT.pw = () => openModal({ title: 'Change password', body: `<div class="g1">${fld('Current password', '<input id="pw0" type="password" autocomplete="current-password">')}${fld('New password (8+ characters)', '<input id="pw1" type="password" autocomplete="new-password">')}</div>`,
  foot: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="pwSave">Update password</button>' });
ACT.pwSave = async (a, b) => { busy(b, true); try { await rpc('changePassword', { old: val('pw0'), pw: val('pw1') }); toast('Password updated'); closeModal(); await refresh(); } catch (e) { toast(e.message, true); busy(b, false); } };

function renderView() {
  if (!S.user) return;
  const r = route(), v = VIEWS[r.name] || VIEWS.home, pg = $('#page'); if (!pg) return;
  const vp = VPERM[r.name]; if (vp && role() === 'staff' && !canAny(...vp)) { pg.innerHTML = empty('shield', 'No access', 'Ask an administrator to grant you access to this area.'); $('#crumb').innerHTML = ''; return; }
  if (v.roles && !v.roles.includes(role())) { pg.innerHTML = empty('shield', 'Not available', 'Your account does not have access to this page.'); return; }
  const y = window.scrollY, keep = $('#modal');
  try { pg.innerHTML = v.render(...r.args); $('#crumb').innerHTML = `<b>${esc(v.title ? (typeof v.title === 'function' ? v.title(...r.args) : v.title) : '')}</b>`; v.mount && v.mount(...r.args); } catch (e) { console.error(e); pg.innerHTML = empty('alert', 'Something went wrong', e.message); }
  renderShellBits(); if (keep) window.scrollTo(0, y);
}

/* ---------- login ---------- */
function loginHtml() {
  const co = S.company || {};
  return `<div class="login"><div class="lcard">${logoImg(co.name || '', 84)}<h1>Sign in</h1><p class="mute">Agents, suppliers and staff portal</p>
  <div class="g1">${fld('Username', '<input id="lg-user" autocomplete="username" data-enter="login">')}${fld('Password', '<input id="lg-pass" type="password" autocomplete="current-password" data-enter="login">')}</div>
  <div class="lerr" id="lg-err"></div><button class="btn pri lg w100" data-act="login">Sign in</button><a class="bklink" href="/bank-accounts" target="_blank">View our bank accounts</a></div><div class="lfoot">${esc(co.name || '')} &middot; ${esc([co.phone, co.email].filter(Boolean).join(' · '))}</div></div>`;
}
ACT.login = async (a, b) => {
  const btn = $('.lcard .btn.pri'); busy(btn, true);
  try { await api('/api/login', { method: 'POST', body: JSON.stringify({ login: val('lg-user'), password: val('lg-pass') }) }); await load(); location.hash = '#/home'; renderRoot(); }
  catch (e) { $('#lg-err').textContent = e.message; busy(btn, false); }
};

/* ---------- live refresh ---------- */
setInterval(async () => {
  if (!S.user || document.hidden) return;
  try {
    const r = await api('/api/rev'); if (r.rev === S.rev) return;
    const v = VIEWS[route().name]; if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.id !== 'gsearch') { await load(); renderShellBits(); return; }
    await load(); renderShellBits(); if (!$('#modal') && !(v && v.noLive)) renderView();
  } catch { /* offline */ }
}, 8000);
setInterval(() => $$('.sla[data-due]').forEach(el => { const t = slaText(el.dataset.due); el.innerHTML = t.h; el.className = 'sla ' + t.c; }), 20000);
function slaText(due) {
  const ms = new Date(due) - Date.now();
  if (ms <= 0) return { h: ic('clock', 'sm') + 'Time is up', c: 'bad' };
  const m = Math.floor(ms / 60000), t = m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + ' min';
  return { h: ic('clock', 'sm') + t + ' left', c: m < 30 ? 'bad' : m < 120 ? 'warn' : 'ok' };
}
const slaChip = due => { const t = slaText(due); return `<span class="sla ${t.c}" data-due="${due}">${t.h}</span>`; };

/* ---------- boot ---------- */
window.addEventListener('load', async function boot() {
  try { await load(); } catch { /* show login */ }
  document.title = (S.company && S.company.name ? S.company.name + ' · ' : '') + 'Operations';
  renderRoot();
});
