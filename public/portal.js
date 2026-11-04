/* Agent portal: landing + gated live flight search + B2B partner signup. Vanilla JS, no build step. */
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fnum = n => Math.round(+n || 0).toLocaleString('en-US');
const debounce = (f, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

/* ---------- icons ---------- */
const IC = {
  plane: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>', takeoff: '<path d="M2.5 19h19"/><path d="M4 13.5l2.3-3 3.7 1 3.5-5.2a2 2 0 0 1 3-.3l.6.6-2.6 5.3 4.6 1.4a1.8 1.8 0 0 1 .3 3.3L4 17z" stroke-width="1.6"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>', user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c.6-3.7 3.7-6 7.5-6s6.9 2.3 7.5 6"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.6 0 4.5 1.8 4.5 4.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>', phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A16.5 16.5 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>', pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16c.5-1.6 1.7-2.3 3.2-2.3s2.7.7 3.2 2.3M14.5 10h4M14.5 13.5h3"/>', camera: '<path d="M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.4"/>',
  upload: '<path d="M12 16V5"/><path d="M7.5 9L12 4.5 16.5 9"/><path d="M4 20h16"/>', check: '<path d="M5 12.5l4.5 4.5L19 7"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', down: '<path d="M6 9l6 6 6-6"/>', left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', alert: '<path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4M12 17v.5"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1.2"/>', layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12.5l9 5 9-5"/><path d="M3 17l9 5 9-5"/>', bus: '<rect x="4" y="4" width="16" height="13" rx="2.5"/><path d="M4 11h16M7 17v3M17 17v3"/><circle cx="8" cy="14" r=".7"/><circle cx="16" cy="14" r=".7"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>', chat: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 13h5"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', bag: '<rect x="5" y="8" width="14" height="12" rx="2.5"/><path d="M9 8V6a3 3 0 0 1 6 0v2M9 13h6"/>', seat: '<path d="M7 4v9a2 2 0 0 0 2 2h7l2 5M7 13H5M10 8h4"/>', leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-6 9-8"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>', moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', trend: '<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>', spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/>', logout: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M16 8l4 4-4 4M20 12H9"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>', dome: '<path d="M12 2v3"/><path d="M5 21V12a7 7 0 0 1 14 0v9"/><path d="M3 21h18M9 21v-5a3 3 0 0 1 6 0v5"/>', filter: '<path d="M4 5h16l-6 8v6l-4-2v-4L4 5z"/>', send: '<path d="M21 3L3 10.5l7 2.5 2.5 7L21 3z"/><path d="M10 13l11-10"/>', wa: '<path d="M4 20l1.3-4.2A8 8 0 1 1 8.3 18.8L4 20z"/><path d="M9 9.5c.3 2.2 2.3 4.2 4.5 4.5l1.2-1.2-1.8-1-.8.6c-.7-.3-1.4-1-1.7-1.7l.6-.8-1-1.8L9 9.5z"/>'
};
const ic = (n, c = '') => `<svg class="i ${c}" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ''}</svg>`;

/* ---------- state ---------- */
const ACTS = {}; const INIT_TITLE = document.title;
const ME = { user: null, company: {}, logoV: 0, search: true, pending: 0 };
const pad = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addD = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return isoOf(d); };
const TODAY = isoOf(new Date());
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
const dLong = s => { const d = parse(s); return ord(d.getDate()) + ' ' + MON[d.getMonth()]; };
const dSub = s => { const d = parse(s); return DAY[d.getDay()] + ', ' + d.getFullYear(); };
const dShort = s => { const d = parse(s); return DAY[d.getDay()].slice(0, 3) + ', ' + d.getDate() + ' ' + MON[d.getMonth()].slice(0, 3); };
const Q = { trip: 'oneway', from: { code: 'LHE', city: 'Lahore', name: 'Allama Iqbal Intl' }, to: { code: 'JED', city: 'Jeddah', name: 'King Abdulaziz Intl' }, date: addD(TODAY, 7), ret: '', ad: 1, ch: 0, inf: 0, cls: '1', direct: false, bags: 0 };
const CABINS = [['1', 'Economy'], ['2', 'Premium Economy'], ['3', 'Business'], ['4', 'First']];
const H = { mode: 'flights', city: 'Makkah', cin: addD(TODAY, 14), cout: addD(TODAY, 19), ad: 2, stars: '', free: false };
const paxN = () => Q.ad + Q.ch + Q.inf;
const paxTxt = () => paxN() + (paxN() === 1 ? ' Traveller' : ' Travellers');

function toast(msg, err) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.innerHTML = ic(err ? 'alert' : 'check') + '<span>' + esc(msg) + '</span>';
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), err ? 6500 : 3400);
}
async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...opts });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; Object.assign(e, j); throw e; }
  return j;
}
async function loadMe() { try { Object.assign(ME, await api('/api/portal/me')); } catch { /* offline */ } }

/* ---------- hero scenery (no stock photo needed: a dusk apron with an aircraft tail) ---------- */
function scene(kind) {
  const el = $('#scene'); el.className = 'scene' + (kind === 'hero' ? '' : kind === 'short' ? ' short' : ' full dim');
  if (kind === 'auth') { el.innerHTML = skySvg(); el.className = 'scene full'; el.style.background = 'linear-gradient(180deg,#5d95dc 0%,#9cc4f0 45%,#dcebfb 100%)'; return; }
  el.style.background = '';
  el.innerHTML = `<svg viewBox="0 0 900 900" preserveAspectRatio="xMaxYMax slice" xmlns="http://www.w3.org/2000/svg"><defs>
    <linearGradient id="tf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8e1b3f"/><stop offset=".55" stop-color="#5d1030"/><stop offset="1" stop-color="#2d0a24"/></linearGradient>
    <linearGradient id="tf2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#27346d"/><stop offset="1" stop-color="#121c45"/></linearGradient>
    <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a45" stop-opacity="0"/><stop offset="1" stop-color="#0a1235"/></linearGradient>
    <radialGradient id="sun" cx=".62" cy="1" r=".7"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".95"/><stop offset=".45" stop-color="#ff9d6c" stop-opacity=".35"/><stop offset="1" stop-color="#ff9d6c" stop-opacity="0"/></radialGradient>
    <filter id="bl"><feGaussianBlur stdDeviation="1.2"/></filter><filter id="bl2"><feGaussianBlur stdDeviation="9"/></filter></defs>
    <rect width="900" height="900" fill="url(#sun)"/>
    <g filter="url(#bl2)" opacity=".85"><path d="M150 760 L330 410 Q345 380 372 384 L520 410 L470 760Z" fill="url(#tf2)"/></g>
    <g filter="url(#bl)"><path d="M430 900 L540 300 Q548 262 585 250 L640 236 Q690 226 716 262 L900 540 L900 900Z" fill="url(#tf)"/>
      <path d="M560 330 L880 520 L880 585 L545 410Z" fill="#fff" opacity=".9"/><path d="M545 410 L880 585 L880 610 L540 436Z" fill="#c8264f" opacity=".85"/>
      <circle cx="740" cy="560" r="86" fill="#f5e9e4" opacity=".92"/><circle cx="740" cy="560" r="54" fill="#6a1233"/><path d="M700 590 Q740 520 790 548" stroke="#f5e9e4" stroke-width="14" fill="none" stroke-linecap="round"/></g>
    <rect y="720" width="900" height="180" fill="url(#gd)"/></svg>`;
}
function skySvg() {
  return `<svg viewBox="0 0 1400 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;right:0;min-width:0"><defs><filter id="cb"><feGaussianBlur stdDeviation="22"/></filter><linearGradient id="fu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#cfd9ea"/></linearGradient></defs>
  <g filter="url(#cb)" fill="#fff" opacity=".9"><ellipse cx="200" cy="640" rx="320" ry="90"/><ellipse cx="760" cy="720" rx="420" ry="90"/><ellipse cx="1250" cy="620" rx="300" ry="100"/><ellipse cx="400" cy="160" rx="200" ry="40" opacity=".6"/><ellipse cx="1100" cy="130" rx="240" ry="45" opacity=".5"/></g>
  <g opacity=".95"><path d="M-40 330 Q300 250 700 270 Q1060 285 1440 360 L1440 520 Q1000 470 640 500 Q250 530 -40 470Z" fill="url(#fu)"/><ellipse cx="760" cy="410" rx="230" ry="26" fill="#3b4c78" opacity=".3"/><path d="M-40 430 L1440 430" stroke="#2a63c9" stroke-width="6" opacity=".35"/></g></svg>`;
}

/* ---------- navigation + footer ---------- */
const BRAND = () => `<a class="brand" href="#/"><span class="mark"><img src="/brand/logo?v=${ME.logoV || 0}" alt="" width="30" height="30"></span><span>${esc(ME.company.name || 'The Umrah Store')}<small>${esc(ME.user ? 'Agent portal' : (ME.company.tagline || 'Agent portal'))}</small></span></a>`;
const chatHref = () => (ME.company.whatsapp ? 'https://wa.me/' + String(ME.company.whatsapp).replace(/\D/g, '') : ME.company.email ? 'mailto:' + ME.company.email : '#contact');
const inits = n => String(n || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function navItems(mobile) {
  const L = [['/umrah-group-packages', 'Packages', 'layers'], ['/umrah-offers', 'Offers', 'spark'], ['/umrah-hotels', 'Hotels', 'hotel'], ['/umrah-visa', 'Visa', 'visa'], ['/umrah-package-calculator', 'Calculator', 'calc'], ['/umrah-transport-booking', 'Transport', 'bus'], ['#contact', 'Contact', 'phone']];
  return L.map(l => `<a class="l" href="${l[0]}" ${l[0] === '#contact' ? 'data-a="contact"' : ''}>${mobile ? ic(l[2]) : ''}${l[1]}</a>`).join('');
}
function renderNav() {
  const u = ME.user;
  $('#nav').innerHTML = `<div class="nav">${BRAND()}<nav class="links" aria-label="Main">${navItems()}<span class="sep"></span><a class="chat" href="${esc(chatHref())}" data-open-chat aria-label="Open live chat" title="Live chat" ${ME.company.whatsapp ? 'target="_blank" rel="noopener"' : ''}>${ic('chat')}</a>
    ${u ? `<span class="me-chip"><b>${esc(inits(u.name))}</b>${esc(u.name.split(' ')[0])}</span><a class="pill white" href="/app">${ic('grid')}Dashboard</a><button class="pill ghost" data-a="logout" aria-label="Sign out">${ic('logout')}</button>`
    : `<a class="pill white" href="#/signup"><span class="ico">${ic('users', 'sm')}</span>For Travel Agents</a><button class="pill blue" data-a="login">Login</button>`}</nav>
    <button class="burger" data-a="drawer" aria-label="Menu">${ic('menu', 'lg')}</button></div>`;
}
function renderFoot() {
  const c = Object.assign({ phone: '+92 313 693 5568', whatsapp: '+92 313 693 5568', email: 'info@theumrahstore.com' }, ME.company || {}), tel = c.phone ? `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a>` : '';
  $('#foot').innerHTML = `<div class="fin" id="contact"><div><div class="brand" style="color:#fff;margin-bottom:12px"><span class="mark"><img src="/brand/logo?v=${ME.logoV || 0}" alt="" width="30" height="30"></span><span>${esc(c.name || 'The Umrah Store')}</span></div><p style="max-width:340px">Live flight fares and Umrah services for registered travel agents. Apply once, then book at your agent rates.</p></div>
  <div><h4>Portal</h4><a href="#/signup">Become a partner</a><a href="#" data-a="login">Agent login</a><a href="#/status">Check application status</a></div>
  <div><h4>Contact</h4>${tel}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${c.whatsapp ? `<a href="${esc(chatHref())}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<p><b style="color:#fff">Branches</b><br>Lahore · Okara · Islamabad</p></div></div>
  <div class="fbot"><span>&copy; ${new Date().getFullYear()} ${esc(c.name || 'The Umrah Store')}. All rights reserved.</span><span><a href="/umrah-group-packages" style="display:inline">Group packages</a> &nbsp;&middot;&nbsp; <a href="/bank-accounts" style="display:inline">Bank accounts</a></span></div>`;
}
ACTS.drawer = () => {
  const d = document.createElement('div'); d.className = 'drawer'; d.id = 'drawer';
  d.innerHTML = `<nav>${navItems(true)}<hr style="border:0;border-top:1px solid var(--line);margin:6px 0">${ME.user ? `<a href="/app">${ic('grid')}Dashboard</a><button data-a="logout">${ic('logout')}Sign out</button>` : `<a href="#/signup">${ic('users')}For Travel Agents</a><button data-a="login" style="background:var(--blue);color:#fff;justify-content:center">Login</button>`}</nav>`;
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('a,button')) d.remove(); }); document.body.appendChild(d);
};
ACTS.contact = (a, el, e) => { e.preventDefault(); $('#contact').scrollIntoView({ behavior: 'smooth' }); };

/* ---------- popovers (fixed to the page so they never get clipped) ---------- */
let POP = null;
function closePop() { if (POP) { POP.el.remove(); POP.anchor && POP.anchor.setAttribute('aria-expanded', 'false'); POP.anchor && POP.anchor.classList.remove('open'); POP = null; } }
function openPop(kind, anchor, html, cls = '', after) {
  if (POP && POP.kind === kind) return closePop();
  closePop();
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.innerHTML = html; el.addEventListener('mousedown', e => e.stopPropagation());
  $('#layer').appendChild(el); POP = { kind, el, anchor }; anchor.setAttribute('aria-expanded', 'true'); anchor.classList.add('open');
  placePop(); after && after(el);
}
function placePop() {
  if (!POP) return; const { el, anchor } = POP, r = anchor.getBoundingClientRect(); el.style.position = 'fixed';
  const w = el.offsetWidth, vw = innerWidth; let left = Math.min(Math.max(8, r.left), vw - w - 8), top = r.bottom + 8;
  if (innerWidth < 560) left = Math.max(8, (vw - w) / 2);
  if (top + el.offsetHeight > innerHeight - 8 && r.top > el.offsetHeight + 12) top = r.top - el.offsetHeight - 8;
  el.style.left = left + 'px'; el.style.top = top + 'px';
}
addEventListener('resize', placePop); addEventListener('scroll', () => POP && placePop(), { passive: true });
document.addEventListener('mousedown', e => { if (POP && !POP.anchor.contains(e.target)) closePop(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePop(); closeModal(); } });

/* ---------- search card ---------- */
const tabsHtml = () => `<div class="stab" role="tablist"><button type="button" role="tab" class="${H.mode === 'flights' ? 'on' : ''}" aria-selected="${H.mode === 'flights'}" data-a="mode" data-v="flights">${ic('plane')}Flights</button><button type="button" role="tab" class="${H.mode === 'hotels' ? 'on' : ''}" aria-selected="${H.mode === 'hotels'}" data-a="mode" data-v="hotels">${ic('hotel')}Hotels</button></div>`;
const CITIES = ['Makkah', 'Madinah', 'Jeddah', 'Riyadh', 'Dubai', 'Istanbul'];
function hotelCard() {
  const n = Math.max(1, Math.round((parse(H.cout) - parse(H.cin)) / 864e5));
  return `<div class="sbox" id="sbox">${tabsHtml()}<form class="scard" id="sform" novalidate>
  <div class="srow1"><div class="seg"><button type="button" class="on" tabindex="-1">Stay</button></div><div class="sopt"><div class="opt"><button type="button" data-a="hstars" aria-label="Star rating">${ic('star')}<span>${H.stars ? H.stars + '+ stars' : 'Any stars'}</span></button></div></div></div>
  <div class="srow2"><label class="f fdiv"><span class="lab">Destination</span><input class="big" id="h-city" list="h-cities" value="${esc(H.city)}" placeholder="City or hotel" autocomplete="off" aria-label="Destination"><datalist id="h-cities">${CITIES.map(c => `<option value="${c}">`).join('')}</datalist><span class="small">Makkah, Madinah, Jeddah...</span></label>
    <label class="f fdiv"><span class="lab">Check-in</span><input class="big" id="h-cin" type="date" min="${TODAY}" value="${H.cin}" aria-label="Check-in date"><span class="small">${dSub(H.cin)}</span></label>
    <label class="f fdiv"><span class="lab">Check-out</span><input class="big" id="h-cout" type="date" min="${addD(H.cin, 1)}" value="${H.cout}" aria-label="Check-out date"><span class="small">${n} night${n > 1 ? 's' : ''}</span></label>
    <label class="f"><span class="lab">Guests</span><select class="big" id="h-ad" aria-label="Guests">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<option value="${k}" ${k === H.ad ? 'selected' : ''}>${k} guest${k > 1 ? 's' : ''}</option>`).join('')}</select><span class="small">Adults</span></label>
    <button class="go" type="submit" id="gobtn">${ic('search')}Search</button></div>
  <div class="ferr" id="ferr" role="alert"></div>
  <div class="srow3">${['Makkah', 'Madinah', 'Jeddah'].map(c => `<button type="button" class="chipf ${H.city === c ? 'on' : ''}" data-a="hcity" data-v="${c}">${ic('pin', 'sm')}${c}</button>`).join('')}<button type="button" class="chipf ${H.free ? 'on' : ''}" data-a="hfree">${ic('shield', 'sm')}Free cancellation</button></div></form></div>`;
}
function searchCard(compact) {
  if (H.mode === 'hotels') return hotelCard();
  const rt = Q.trip === 'return';
  return `<div class="sbox" id="sbox">${tabsHtml()}<form class="scard" id="sform" novalidate>
  <div class="srow1"><div class="seg" role="tablist"><button type="button" class="${rt ? '' : 'on'}" data-a="trip" data-v="oneway">One Way</button><button type="button" class="${rt ? 'on' : ''}" data-a="trip" data-v="return">Round Trip</button><button type="button" disabled title="Multi-city is coming soon">Multi-city<span class="soon">Soon</span></button></div>
    <div class="sopt"><div class="opt"><button type="button" data-a="paxp" aria-expanded="false" aria-label="Travellers">${ic('users')}<span id="paxlbl">${paxTxt()}</span></button></div><div class="opt"><button type="button" data-a="cabp" aria-expanded="false" aria-label="Cabin class">${ic('seat')}<span id="cablbl">${CABINS.find(c => c[0] === Q.cls)[1]}</span></button></div></div></div>
  <div class="srow2"><div class="f fdiv" data-a="airp" data-v="from" tabindex="0" role="button" aria-label="From airport" aria-expanded="false"><span class="lab">From</span><span class="big">${esc(Q.from.city)}</span><span class="small">${esc(Q.from.name || Q.from.code)} &middot; ${esc(Q.from.code)}</span>
      <button type="button" class="swap" data-a="swapAp" aria-label="Swap airports">${ic('swap', 'sm')}</button></div>
    <div class="f fdiv" data-a="airp" data-v="to" tabindex="0" role="button" aria-label="To airport" aria-expanded="false"><span class="lab">To</span>${Q.to ? `<span class="big">${esc(Q.to.city)}</span><span class="small">${esc(Q.to.name || Q.to.code)} &middot; ${esc(Q.to.code)}</span>` : '<span class="big ph">Where to?</span><span class="small">Choose an airport</span>'}</div>
    <div class="f fdiv" data-a="calp" data-v="dep" tabindex="0" role="button" aria-label="Departure date" aria-expanded="false"><span class="lab">Departure</span><span class="big">${dLong(Q.date)}</span><span class="small">${dSub(Q.date)}</span></div>
    <div class="f ${rt ? '' : 'add'}" data-a="calp" data-v="ret" tabindex="0" role="button" aria-label="Return date" aria-expanded="false"><span class="lab">Return</span>${rt ? `<span class="big">${dLong(Q.ret)}</span><span class="small">${dSub(Q.ret)}</span>` : `<span class="big">${ic('plus', 'sm')}Return</span><span class="small">Save more on a round trip</span>`}</div>
    <button class="go" type="submit" id="gobtn">${ic('search')}Search</button></div>
  <div class="ferr" id="ferr" role="alert"></div>
  <div class="srow3"><button type="button" class="chipf ${Q.to && ['JED', 'MED'].includes(Q.to.code) && rt ? 'on' : ''}" data-a="umrahFare">${ic('dome', 'sm')}Umrah Fare</button><button type="button" class="chipf ${Q.direct ? 'on' : ''}" data-a="direct">${ic('plane', 'sm')}Direct only</button>
    <div class="adv"><button type="button" data-a="advp" aria-expanded="false">Advance Search ${ic('down', 'sm')}</button></div></div></form></div>`;
}
IC.plus = '<path d="M12 5v14M5 12h14"/>'; IC.hotel = '<path d="M3 20V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v14M14 11h6a1 1 0 0 1 1 1v8M3 20h18M7 9h3M7 13h3M7 17h3"/>'; IC.star = '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8L12 3.5z"/>'; IC.visa = '<rect x="4" y="3" width="16" height="18" rx="2.5"/><circle cx="12" cy="10" r="3"/><path d="M8 16.5h8"/>';
function mountSearch(host) { host.innerHTML = searchCard(); $('#sform').addEventListener('submit', e => { e.preventDefault(); H.mode === 'hotels' ? doHotelSearch() : doSearch(); }); if (H.mode === 'hotels') bindHotelForm(); $$('.f[data-a]').forEach(f => f.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f.click(); } })); }
const repaint = () => { const h = $('#sbox') && $('#sbox').parentNode; if (h) { closePop(); mountSearch(h); } };

ACTS.mode = v => { if (H.mode === v) return; H.mode = v; if (/^#\/(flights|hotels)/.test(location.hash)) { location.hash = '#/' + (v === 'hotels' ? 'hotels' : 'flights') + '?' + (v === 'hotels' ? hqs() : qs()); return; } repaint(); };
const hqs = () => new URLSearchParams({ city: H.city, cin: H.cin, cout: H.cout, ad: H.ad, stars: H.stars, free: H.free ? 1 : 0 }).toString();
function bindHotelForm() {
  const on = (id, f) => { const e = $(id); e && e.addEventListener('change', f); };
  on('#h-cin', e => { H.cin = e.target.value || H.cin; if (H.cout <= H.cin) H.cout = addD(H.cin, 1); repaint(); });
  on('#h-cout', e => { H.cout = e.target.value && e.target.value > H.cin ? e.target.value : addD(H.cin, 1); repaint(); });
  on('#h-ad', e => { H.ad = +e.target.value || 2; });
  const c = $('#h-city'); c && c.addEventListener('input', () => { H.city = c.value; });
}
ACTS.hcity = v => { H.city = v; repaint(); };
ACTS.hfree = () => { H.free = !H.free; repaint(); };
ACTS.hstars = (a, el) => openPop('stars', el, `<div class="hd">Minimum stars</div><div class="cab">${[['', 'Any'], ['3', '3 stars +'], ['4', '4 stars +'], ['5', '5 stars']].map(c => `<button type="button" class="${H.stars === c[0] ? 'on' : ''}" data-a="hstar" data-v="${c[0]}">${c[1]}${H.stars === c[0] ? ic('check', 'sm') : ''}</button>`).join('')}</div>`, 'r');
ACTS.hstar = v => { H.stars = v; closePop(); repaint(); };
function doHotelSearch() {
  const er = $('#ferr'); er.classList.remove('on'); const bad = m => { er.textContent = m; er.classList.add('on'); };
  H.city = ($('#h-city') ? $('#h-city').value : H.city).trim();
  if (H.city.length < 2) return bad('Enter a city or hotel name.'); if (H.cin < TODAY) return bad('Check-in date is in the past.'); if (H.cout <= H.cin) return bad('Check-out must be after check-in.');
  const go = () => { location.hash = '#/hotels?' + hqs(); }; if (!ME.user) return openLogin({ trip: false, hotel: true, then: go }); go();
}
ACTS.trip = (v, el) => { Q.trip = v; if (v === 'return' && !Q.ret) Q.ret = addD(Q.date, 7); if (v === 'oneway') Q.ret = ''; repaint(); };
ACTS.swapAp = (a, el, e) => { e.stopPropagation(); if (!Q.to) return; [Q.from, Q.to] = [Q.to, Q.from]; repaint(); };
ACTS.direct = () => { Q.direct = !Q.direct; repaint(); };
ACTS.umrahFare = () => { if (!Q.to || !['JED', 'MED'].includes(Q.to.code)) Q.to = { code: 'JED', city: 'Jeddah', name: 'King Abdulaziz Intl' }; if (Q.from.code === Q.to.code) Q.from = { code: 'LHE', city: 'Lahore', name: 'Allama Iqbal Intl' }; Q.trip = 'return'; Q.ret = addD(Q.date, 14); repaint(); };
ACTS.paxp = (a, el) => openPop('pax', el, paxHtml(), 'pax r', p => { p.style.right = 'auto'; });
const paxHtml = () => `<div class="hd">Travellers</div>${[['ad', 'Adults', '12+ years', 1, 9], ['ch', 'Children', '2-11 years', 0, 8], ['inf', 'Infants', 'Under 2, on lap', 0, 4]].map(r => `<div class="row"><div><b>${r[1]}</b><span>${r[2]}</span></div><div class="stp"><button type="button" data-a="stp" data-v="${r[0]}:-1" ${Q[r[0]] <= r[3] ? 'disabled' : ''} aria-label="Fewer ${r[1]}">&minus;</button><em>${Q[r[0]]}</em><button type="button" data-a="stp" data-v="${r[0]}:1" ${Q[r[0]] >= r[4] || paxN() >= 9 ? 'disabled' : ''} aria-label="More ${r[1]}">+</button></div></div>`).join('')}<div style="padding:8px 4px 2px"><button type="button" class="btn pri sm w" data-a="popdone">Done</button></div>`;
ACTS.stp = v => { const [k, d] = v.split(':'); Q[k] = Math.max(k === 'ad' ? 1 : 0, Q[k] + +d); if (Q.inf > Q.ad) Q.inf = Q.ad; if (POP) { POP.el.innerHTML = paxHtml(); } $('#paxlbl').textContent = paxTxt(); };
ACTS.popdone = () => closePop();
ACTS.cabp = (a, el) => openPop('cab', el, `<div class="hd">Cabin class</div><div class="cab">${CABINS.map(c => `<button type="button" class="${Q.cls === c[0] ? 'on' : ''}" data-a="cab" data-v="${c[0]}">${c[1]}${Q.cls === c[0] ? ic('check', 'sm') : ''}</button>`).join('')}</div>`, 'r');
ACTS.cab = v => { Q.cls = v; $('#cablbl').textContent = CABINS.find(c => c[0] === v)[1]; closePop(); };
ACTS.advp = (a, el) => openPop('adv', el, `<div class="hd">More options</div><div class="row" style="display:flex;align-items:center;justify-content:space-between;padding:9px 4px"><div><b style="color:var(--ink)">Checked bags</b><span style="font-size:12.5px;color:var(--mute);display:block">Per traveller</span></div><div class="stp"><button type="button" data-a="bags" data-v="-1" ${Q.bags <= 0 ? 'disabled' : ''}>&minus;</button><em id="bagn">${Q.bags}</em><button type="button" data-a="bags" data-v="1" ${Q.bags >= 3 ? 'disabled' : ''}>+</button></div></div>
  <label class="tgl">Direct flights only<input type="checkbox" ${Q.direct ? 'checked' : ''} data-a="directT"></label><div style="padding:6px 4px 2px"><button type="button" class="btn pri sm w" data-a="popdone">Apply</button></div>`, 'advp');
ACTS.bags = v => { Q.bags = Math.min(3, Math.max(0, Q.bags + +v)); advRefresh(); };
const advRefresh = () => { const b = $$('[data-a=bags]', POP.el); $('#bagn').textContent = Q.bags; b[0].disabled = Q.bags <= 0; b[1].disabled = Q.bags >= 3; };
ACTS.directT = (v, el) => { Q.direct = el.checked; const c = $('[data-a=direct]'); c && c.classList.toggle('on', Q.direct); };
ACTS.popdone2 = () => closePop();

/* airports */
let APCACHE = {}; const apFetch = async q => { if (APCACHE[q]) return APCACHE[q]; try { return (APCACHE[q] = await api('/api/airports?q=' + encodeURIComponent(q))); } catch { return []; } };
ACTS.airp = (which, el, e) => {
  if (e.target.closest('.swap')) return;
  openPop('ap-' + which, el, `<div class="inp" style="margin:4px 4px 8px;height:46px">${ic('search')}<input id="apq" placeholder="Search city or airport" autocomplete="off" aria-label="Search airports"></div><div id="apl" class="ap" role="listbox"></div>`, 'ap', async p => {
    const inp = $('#apq', p), list = $('#apl', p); let items = [], hl = 0;
    const draw = () => { list.innerHTML = items.length ? items.map((a, i) => `<button type="button" role="option" class="${i === hl ? 'hl' : ''}" data-i="${i}"><span class="code">${esc(a.code)}</span><div><b>${esc(a.city)}</b><span>${esc(a.name)}, ${esc(a.country)}</span></div></button>`).join('') : '<div class="none">No airports match. Try the city name or the 3-letter code.</div>'; };
    const load = async () => { items = await apFetch(inp.value.trim()); hl = 0; draw(); };
    const pick = i => { const a = items[i]; if (!a) return; const o = { code: a.code, city: a.city, name: a.name }; Q[which] = o; if (Q.to && Q.from.code === Q.to.code) { if (which === 'from') Q.to = null; else Q.from = { code: '', city: 'Select', name: '' }; } closePop(); repaint(); if (which === 'from' && !Q.to) setTimeout(() => { const t = $('.f[data-v=to]'); t && t.click(); }, 30); };
    inp.addEventListener('input', debounce(load, 140));
    inp.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { hl = Math.min(items.length - 1, hl + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter') { e.preventDefault(); pick(hl); } });
    list.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) pick(+b.dataset.i); });
    await load(); inp.focus(); placePop();
  });
};

/* calendar */
const CAL = { view: '', mode: 'dep' };
function calHtml() {
  const months = innerWidth < 860 ? 1 : 2, [vy, vm] = CAL.view.split('-').map(Number), min = TODAY;
  const mk = (y, m) => {
    const first = new Date(y, m, 1), lead = first.getDay(), days = new Date(y, m + 1, 0).getDate(); let h = `<div class="m"><h4>${MON[m]} ${y}</h4><div class="g">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<i>${d}</i>`).join('')}${'<span></span>'.repeat(lead)}`;
    for (let d = 1; d <= days; d++) {
      const s = y + '-' + pad(m + 1) + '-' + pad(d), dis = s < min, isS = s === Q.date, isE = Q.trip === 'return' && s === Q.ret, inr = Q.trip === 'return' && Q.ret && s > Q.date && s < Q.ret, rng = Q.trip === 'return' && Q.ret && Q.ret !== Q.date;
      h += `<button type="button" class="d ${isS ? 's' : ''} ${isE ? 'e' : ''} ${(isS || isE) && rng ? 'rng' : ''} ${inr ? 'in' : ''} ${s === TODAY ? 'today' : ''}" data-a="pickd" data-v="${s}" ${dis ? 'disabled' : ''} aria-label="${dShort(s)}">${d}</button>`;
    }
    return h + '</div></div>';
  };
  let ms = ''; for (let i = 0; i < months; i++) { const d = new Date(vy, vm - 1 + i, 1); ms += mk(d.getFullYear(), d.getMonth()); }
  const canPrev = CAL.view > TODAY.slice(0, 7);
  return `<div class="ct"><button type="button" data-a="calnav" data-v="-1" ${canPrev ? '' : 'disabled'} aria-label="Previous month">${ic('left')}</button><b style="color:var(--ink)">${CAL.mode === 'ret' ? 'Choose return date' : 'Choose departure date'}</b><button type="button" data-a="calnav" data-v="1" aria-label="Next month">${ic('right')}</button></div><div class="ms">${ms}</div>
  <div class="ft"><span>${Q.trip === 'return' && Q.ret ? dShort(Q.date) + '  →  ' + dShort(Q.ret) : dShort(Q.date)}</span>${Q.trip === 'return' ? '<button type="button" data-a="clearRet">One way instead</button>' : ''}</div>`;
}
ACTS.calp = (which, el) => { CAL.mode = which; const base = which === 'ret' && Q.ret ? Q.ret : Q.date; CAL.view = base.slice(0, 7); openPop('cal-' + which, el, calHtml(), 'cal'); };
ACTS.calnav = v => { const [y, m] = CAL.view.split('-').map(Number), d = new Date(y, m - 1 + +v, 1); CAL.view = d.getFullYear() + '-' + pad(d.getMonth() + 1); POP.el.innerHTML = calHtml(); placePop(); };
ACTS.clearRet = () => { Q.trip = 'oneway'; Q.ret = ''; repaint(); };
const dateFields = () => {
  const dep = $('.f[data-v=dep]'), ret = $('.f[data-v=ret]'); if (dep) dep.innerHTML = `<span class="lab">Departure</span><span class="big">${dLong(Q.date)}</span><span class="small">${dSub(Q.date)}</span>`;
  if (ret) { ret.classList.toggle('add', Q.trip !== 'return'); ret.innerHTML = Q.trip === 'return' ? `<span class="lab">Return</span><span class="big">${dLong(Q.ret)}</span><span class="small">${dSub(Q.ret)}</span>` : `<span class="lab">Return</span><span class="big">${ic('plus', 'sm')}Return</span><span class="small">Save more on a round trip</span>`; }
  $$('.seg button[data-a=trip]').forEach(b => b.classList.toggle('on', b.dataset.v === Q.trip));
};
ACTS.pickd = s => {
  if (CAL.mode === 'dep') {
    Q.date = s;
    if (Q.trip === 'return') { if (!Q.ret || Q.ret < s) Q.ret = addD(s, 7); CAL.mode = 'ret'; dateFields(); POP.el.innerHTML = calHtml(); placePop(); return; }
  } else { if (s < Q.date) { Q.date = s; if (Q.ret < s) Q.ret = addD(s, 7); } else Q.ret = s; Q.trip = 'return'; }
  repaint();
};

/* ---------- login gate ---------- */
let AFTER = null;
function closeModal() { const m = $('#modal'); if (m) m.remove(); }
function modal(html, wide) { closeModal(); const m = document.createElement('div'); m.className = 'mask'; m.id = 'modal'; m.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><button class="x" data-a="closeModal" aria-label="Close">${ic('x')}</button>${html}</div>`; m.addEventListener('mousedown', e => { if (e.target === m) closeModal(); }); document.body.appendChild(m); return m; }
ACTS.closeModal = closeModal;
function openLogin(opts = {}) {
  AFTER = opts.then || null;
  const trip = opts.trip ? `<div class="trip">${esc(Q.from.code)} ${ic('arrow', 'sm')} ${esc(Q.to ? Q.to.code : '')} <span>${esc(dShort(Q.date))}${Q.trip === 'return' && Q.ret ? ' - ' + esc(dShort(Q.ret)) : ''} &middot; ${paxTxt()}</span></div>` : '';
  const m = modal(`<div class="mhead"><div class="lk">${ic(opts.trip ? 'lock' : 'user', 'lg')}</div><h3>${opts.trip ? 'Sign in to see live fares' : opts.hotel ? 'Sign in to see live hotel rates' : 'Welcome back'}</h3><p>${opts.trip ? 'Fares are shown to approved travel agents only.' : opts.hotel ? 'Rates are shown to approved travel agents only.' : 'Sign in to your agent account.'}</p>${trip}</div>
  <form class="mbody" id="lform" novalidate><div class="formerr" id="lerr" role="alert"></div>
  <label class="fld"><span>Email or username</span><div class="inp">${ic('mail')}<input id="lg-u" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="you@company.com" required></div></label>
  <label class="fld"><span>Password</span><div class="inp">${ic('lock')}<input id="lg-p" type="password" autocomplete="current-password" placeholder="Your password" required><button type="button" class="eye" data-a="eye" aria-label="Show password">${ic('eye')}</button></div></label>
  <button class="nx" style="width:100%;margin-top:6px" type="submit" id="lbtn">Sign in</button>
  <p class="alt" style="margin-top:18px">New here? <a href="#/signup" data-a="closeModal">Apply as a travel agent</a></p></form>`);
  $('#lg-u', m).focus(); $('#lform', m).addEventListener('submit', async e => {
    e.preventDefault(); const b = $('#lbtn'), er = $('#lerr'); er.classList.remove('on');
    if (!$('#lg-u').value.trim() || !$('#lg-p').value) { er.textContent = 'Enter your email and password.'; er.classList.add('on'); return; }
    b.disabled = true; b.innerHTML = '<span class="spinner sm"></span>';
    try { await api('/api/login', { method: 'POST', body: JSON.stringify({ login: $('#lg-u').value, password: $('#lg-p').value }) }); await loadMe(); closeModal(); renderNav(); renderFoot(); const f = AFTER; AFTER = null;
      if (f) f(); else if (ME.user && ME.user.role !== 'agent') location.href = '/app'; else { toast('Signed in. Welcome back, ' + ME.user.name.split(' ')[0] + '.'); route(); } }
    catch (x) { er.textContent = x.message; er.classList.add('on'); er.style.background = x.pendingApproval ? 'var(--amberb)' : ''; er.style.color = x.pendingApproval ? 'var(--amber)' : ''; b.disabled = false; b.textContent = 'Sign in'; }
  });
}
ACTS.login = (a, el, e) => { e && e.preventDefault(); openLogin(); };
ACTS.logout = async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); ME.user = null; renderNav(); renderFoot(); location.hash = '#/'; route(); toast('Signed out'); };
ACTS.eye = (a, el) => { const i = el.parentNode.querySelector('input'); const s = i.type === 'password'; i.type = s ? 'text' : 'password'; el.innerHTML = ic(s ? 'eyeoff' : 'eye'); };

/* search submit */
function doSearch() {
  const er = $('#ferr'); er.classList.remove('on'); const bad = m => { er.textContent = m; er.classList.add('on'); };
  if (!Q.from.code) return bad('Choose where you are flying from.'); if (!Q.to) return bad('Choose where you are flying to.');
  if (Q.from.code === Q.to.code) return bad('From and To must be different airports.'); if (Q.date < TODAY) return bad('Departure date is in the past.');
  if (Q.trip === 'return' && (!Q.ret || Q.ret < Q.date)) return bad('Choose a return date on or after departure.');
  const go = () => { location.hash = '#/flights?' + qs(); };
  if (!ME.user) return openLogin({ trip: true, then: go }); go();
}
const qs = () => new URLSearchParams({ f: Q.from.code, fc: Q.from.city, fn: Q.from.name || '', t: Q.to.code, tc: Q.to.city, tn: Q.to.name || '', d: Q.date, r: Q.trip === 'return' ? Q.ret : '', a: Q.ad, c: Q.ch, i: Q.inf, k: Q.cls, x: Q.direct ? 1 : 0, b: Q.bags }).toString();
function readQs(s) {
  const p = new URLSearchParams(s); if (!p.get('f') || !p.get('t') || !p.get('d')) return false;
  Q.from = { code: p.get('f').toUpperCase(), city: p.get('fc') || p.get('f'), name: p.get('fn') || '' }; Q.to = { code: p.get('t').toUpperCase(), city: p.get('tc') || p.get('t'), name: p.get('tn') || '' };
  Q.date = p.get('d'); Q.ret = p.get('r') || ''; Q.trip = Q.ret ? 'return' : 'oneway'; Q.ad = Math.max(1, +p.get('a') || 1); Q.ch = +p.get('c') || 0; Q.inf = +p.get('i') || 0; Q.cls = p.get('k') || '1'; Q.direct = p.get('x') === '1'; Q.bags = +p.get('b') || 0; return true;
}

/* one delegated listener drives every data-a control */
document.addEventListener('click', e => { const t = e.target.closest('[data-a]'); if (!t || t.disabled) return; const f = ACTS[t.dataset.a]; if (f) { if (t.tagName === 'A' && t.getAttribute('href') === '#') e.preventDefault(); f(t.dataset.v, t, e); } });
document.addEventListener('change', e => { const t = e.target.closest('[data-a]'); if (t && t.type === 'checkbox' && ACTS[t.dataset.a] && t.dataset.a === 'directT') ACTS.directT(t.value, t); });

/* =====================================================================
   LANDING
   ===================================================================== */
const APS = { LHE: ['Lahore', 'Allama Iqbal Intl'], KHI: ['Karachi', 'Jinnah Intl'], ISB: ['Islamabad', 'Islamabad Intl'], PEW: ['Peshawar', 'Bacha Khan Intl'], MUX: ['Multan', 'Multan Intl'], SKT: ['Sialkot', 'Sialkot Intl'], JED: ['Jeddah', 'King Abdulaziz Intl'], MED: ['Madinah', 'Prince Mohammad bin Abdulaziz'], DXB: ['Dubai', 'Dubai Intl'], RUH: ['Riyadh', 'King Khalid Intl'] };
const ap = c => ({ code: c, city: APS[c][0], name: APS[c][1] });
const ROUTES = [['LHE', 'JED'], ['KHI', 'JED'], ['ISB', 'JED'], ['LHE', 'MED'], ['KHI', 'MED'], ['ISB', 'MED'], ['MUX', 'JED'], ['LHE', 'DXB']];
ACTS.route = v => { const [a, b] = v.split(':'); Q.from = ap(a); Q.to = ap(b); scrollTo({ top: 0, behavior: 'smooth' }); repaint(); setTimeout(() => { const f = $('.f[data-v=dep]'); f && f.focus({ preventScroll: true }); }, 350); };

const FAQ = [['Who can see live fares?', 'Live airline fares and hotel rates are shown to approved travel agents. Apply once with your CNIC and company details and we activate your account after review.'], ['Can pilgrims book here too?', 'Yes. Browse group packages, price a trip in the calculator or send an enquiry. Our team confirms availability and the final price before you pay.'], ['How do agents pay?', 'Bookings post to your own ledger. Pay by bank transfer, JazzCash, Easypaisa or online by card and wallet through PayFast, and every payment gets a receipt.'], ['How long does approval take?', 'Most applications are reviewed within one working day once the documents are clear. You can check progress with your reference number.'], ['Where are your offices?', 'Lahore, Okara and Islamabad. Call or WhatsApp us to visit or to book remotely.']];
function viewHome() {
  scene('hero'); document.body.dataset.page = 'home';
  $('#view').innerHTML = `<section class="hero"><span class="eyebrow"><i></i>Flights across Pakistan and beyond</span><h1>Live fares for every Umrah route, on one screen</h1><p class="sub">Compare airlines, pick the fare that suits the trip, and send it to the desk in a few taps.</p><div id="shost" class="sbox-host"></div></section>
  <section class="sec promos" id="promos" hidden></section>
  <section class="sec" id="routes"><h2>Popular routes from Pakistan</h2><p class="lead">Tap a route to fill the search. Live fares appear after you sign in.</p><div class="routes">${ROUTES.map(r => `<button class="route" data-a="route" data-v="${r[0]}:${r[1]}"><div><div class="cc">${r[0]} ${ic('plane', 'sm')} ${r[1]}</div><small>${APS[r[0]][0]} to ${APS[r[1]][0]}</small></div><span class="go2">${ic('arrow', 'sm')}</span></button>`).join('')}</div></section>
  <section class="sec"><h2>Everything an Umrah desk needs, in one account</h2><div class="feat"><div class="fc dark"><div class="ic">${ic('plane', 'lg')}</div><h3>Live airline fares</h3><p>Search real-time fares across airlines, filter by stops, departure time and flight number, and compare Best, Cheapest and Fastest side by side.</p><div class="tags"><span>One way and return</span><span>Cabin and baggage</span><span>Layover details</span><span>Fare insight</span></div></div>
    <div class="fc"><div class="ic">${ic('wallet', 'lg')}</div><h3>Your own ledger and wallet</h3><p>Every booking posts to your account automatically. See your balance, credit limit and payments at any time.</p></div>
    <div class="fc"><div class="ic">${ic('file', 'lg')}</div><h3>Vouchers in one click</h3><p>Share a clean voucher link with your customer. Supplier names never appear on it.</p></div></div></section>
  <section class="sec"><h2>Become a partner in three steps</h2><p class="lead">Registration is open to licensed travel agents and Umrah operators. Accounts are activated after our team checks your documents.</p>
    <div class="steps"><div class="st"><h3>Apply online</h3><p>Fill in four short steps: owner details, company details, documents and a password.</p></div><div class="st"><h3>We verify your documents</h3><p>Our team reviews your CNIC, photo and company details before activating your account.</p></div><div class="st"><h3>Sign in and book</h3><p>Once approved, sign in with your email and password to search fares and place bookings.</p></div></div></section>
  <section class="sec"><h2>Open to everyone, no login needed</h2><p class="lead">Browse departures, price a trip or send an enquiry. No account required.</p><div class="tools">${[['/umrah-group-packages', 'layers', 'Umrah group packages', 'Upcoming departures with seats and airlines'], ['/umrah-hotels', 'hotel', 'Makkah and Madinah hotels', 'Stars, distance to the Haram, room types'], ['/umrah-visa', 'visa', 'Umrah visa', 'Documents, process and group rates'], ['/umrah-flights', 'plane', 'Flights to Jeddah and Madinah', 'Routes from every major Pakistani city'], ['/umrah-package-calculator', 'calc', 'Package calculator', 'Price hotels, visa and transport together'], ['/umrah-transport-booking', 'bus', 'Transport booking', 'Jeddah, Makkah and Madinah transfers']].map(t => `<a class="tool" href="${t[0]}"><span class="ic">${ic(t[1])}</span><div><b>${t[2]}</b><span>${t[3]}</span></div></a>`).join('')}</div></section>
  <section class="sec"><h2>Frequently asked questions</h2><div class="faqs">${FAQ.map(f => `<details><summary>${esc(f[0])}</summary><p>${esc(f[1])}</p></details>`).join('')}</div></section>
  <section class="help" aria-labelledby="helph"><div class="helpin"><div><h2 id="helph">Talk to a real person</h2><p>Our desk answers Umrah, flight, hotel and visa questions the same day.</p></div><div class="helpb"><button class="pill blue" type="button" data-open-chat>${ic('chat')}Live chat</button>${(ME.company.whatsapp || '+92 313 693 5568') ? `<a class="pill wa" href="https://wa.me/${esc(String(ME.company.whatsapp || '+92 313 693 5568').replace(/\D/g, ''))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<a class="pill white2" href="tel:${esc(String(ME.company.phone || '+92 313 693 5568').replace(/[^\d+]/g, ''))}">Call us</a></div></div></section>
  <div class="cta"><div><h2>Ready to book with agent rates?</h2><p>Apply once with your CNIC and company details. We will email you when your account is active.</p></div><div class="acts"><a class="pill white" href="#/signup" style="height:50px">Apply as a travel agent</a>${ME.user ? '' : '<button class="pill ghost" data-a="login" style="height:50px">I already have an account</button>'}</div></div>`;
  mountSearch($('#shost')); flyby(); loadPromos();
}
const FLYSVG = '<svg viewBox="0 0 120 48" aria-hidden="true"><path d="M2 26l40-4 28-18c3-2 7-2 9 0l-9 19 30 2c5 .5 8 3 8 5s-3 4.5-8 5l-30 2 9 19c-2 2-6 2-9 0L42 38 2 34c-1.500-.2-2-1-2-4s.5-3.800 2-4z" fill="#fff"/></svg>';
function flyby() {
  const el = $('#scene'); if (!el || el.querySelector('.flyby')) return;
  el.insertAdjacentHTML('beforeend', '<div class="flyby f1" aria-hidden="true"><i class="trail"></i>' + FLYSVG + '</div><div class="flyby f2" aria-hidden="true"><i class="trail"></i>' + FLYSVG + '</div><div class="cloud c1"></div><div class="cloud c2"></div>');
}
async function loadPromos() {
  let list = []; try { list = (await api('/api/public/promos')).items || []; } catch { return; }
  const el = $('#promos'); if (!el || !list.length) return; el.hidden = false;
  const card = p => { const href = p.ctaUrl || '/umrah-offers#' + p.id, ext = /^https?:/.test(href); return `<article class="pc">${p.image ? `<a class="pi" href="${esc(href)}" ${ext ? 'target="_blank" rel="noopener"' : ''} tabindex="-1" aria-hidden="true"><img src="${esc(p.image)}" alt="" width="640" height="360" loading="lazy" decoding="async"></a>` : `<a class="pi ph" href="${esc(href)}" tabindex="-1" aria-hidden="true">${ic('plane', 'lg')}</a>`}<div class="pbody"><span class="pbadge">${esc(p.badge || p.typeLabel)}</span><h3>${esc(p.title)}</h3>${p.subtitle ? `<p>${esc(p.subtitle)}</p>` : ''}<div class="pfoot">${p.price ? `<div class="pp"><small>${esc(p.unit || 'from')}</small><b>PKR ${fnum(p.price)}</b>${p.oldPrice ? `<s>PKR ${fnum(p.oldPrice)}</s>` : ''}</div>` : '<span></span>'}<a class="pill white sm" href="${esc(href)}" ${ext ? 'target="_blank" rel="noopener"' : ''}>${esc(p.ctaText || 'View offer')}</a></div></div></article>`; };
  el.innerHTML = `<div class="phead"><div><h2>Offers and special deals</h2><p class="lead">Complete Umrah packages, hotel deals and limited-time promotions.</p></div><a class="pill ghost-dark" href="/umrah-offers">View all offers</a></div><div class="ptrack" tabindex="0" aria-label="Current offers">${list.slice(0, 10).map(card).join('')}</div>`;
}

/* =====================================================================
   RESULTS
   ===================================================================== */
const R = { res: null, loading: false, err: null, sort: 'best', f: { stops: 'any', bands: [], air: [], max: 0, fno: '' }, tok: 0 };
const hm = s => String(s || '').slice(11, 16), dOf = s => String(s || '').slice(0, 10);
const dur = m => { m = Math.round(+m || 0); return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm'; };
const plusDays = i => Math.round((parse(dOf(i.arr)) - parse(dOf(i.dep))) / 864e5);
const pkr = n => 'PKR ' + fnum(n);
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
window.logoFail = img => { const p = img.parentNode; p.style.background = `hsl(${p.dataset.h},55%,42%)`; p.textContent = p.dataset.i; };
const logo = (name, url) => { const h = hue(name), ini = esc(String(name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()); return url ? `<span class="lg" data-h="${h}" data-i="${ini}"><img src="${esc(url)}" alt="" loading="lazy" onerror="logoFail(this)"></span>` : `<span class="lg" data-h="${h}" data-i="${ini}" style="background:hsl(${h},55%,42%)">${ini}</span>`; };
const stopsOf = i => (i.stops >= 2 ? 2 : i.stops);
const band = i => { const h = +hm(i.dep).slice(0, 2); return h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3; };
const BANDS = [['Early morning', '12am - 6am'], ['Morning', '6am - 12pm'], ['Afternoon', '12pm - 6pm'], ['Evening', '6pm - 12am']];

async function viewFlights(qstr) {
  if (!readQs(qstr)) { location.hash = '#/'; return; }
  scene('short'); document.body.dataset.page = 'flights';
  $('#view').innerHTML = `<div class="rhead"><div id="shost"></div></div><div class="rpage"><aside class="filters" id="filters" aria-label="Filters"></aside><section id="rmain"></section></div>`;
  mountSearch($('#shost'));
  if (!ME.user) { $('#rmain').innerHTML = `<div class="state"><div class="ic">${ic('lock', 'lg')}</div><h3>Sign in to see live fares</h3><p>Flight fares are available to approved travel agents. Sign in, or apply for a partner account if you do not have one yet.</p><div class="acts"><button class="btn pri" data-a="gate">Sign in</button><a class="btn out" href="#/signup">Apply as a travel agent</a></div></div>`; $('#filters').style.display = 'none'; openLogin({ trip: true, then: () => route() }); return; }
  R.sort = 'best'; R.f = { stops: 'any', bands: [], air: [], max: 0, fno: '' }; R.res = null; R.err = null; R.loading = true; const tok = ++R.tok; paintMain();
  try {
    const p = new URLSearchParams({ from: Q.from.code, to: Q.to.code, date: Q.date, adults: Q.ad, children: Q.ch, infants: Q.inf, cls: Q.cls }); if (Q.ret) p.set('ret', Q.ret); if (Q.direct) p.set('direct', '1'); if (Q.bags) p.set('bags', Q.bags);
    const r = await api('/api/search/flights?' + p); if (tok !== R.tok) return; r.items = (r.items || []).map((x, k) => ({ ...x, _k: k })); R.res = r;
    const max = Math.max(0, ...r.items.map(x => x.price)); R.f.max = max;
  } catch (e) { if (tok !== R.tok) return; if (e.status === 401) { ME.user = null; renderNav(); return route(); } R.err = e; }
  R.loading = false; paintFilters(); paintMain();
}
ACTS.gate = () => openLogin({ trip: true, then: () => route() });

function visible() {
  const f = R.f; let a = R.res.items.filter(i => (f.stops === 'any' || stopsOf(i) === +f.stops) && (!f.bands.length || f.bands.includes(band(i))) && (!f.air.length || i.airlines.some(x => f.air.includes(x))) && (!f.max || i.price <= f.max) && (!f.fno || i.nos.join(' ').replace(/\s/g, '').toLowerCase().includes(f.fno.replace(/\s/g, '').toLowerCase())));
  if (R.sort === 'cheap') a = a.slice().sort((x, y) => x.price - y.price || x.dur - y.dur); else if (R.sort === 'fast') a = a.slice().sort((x, y) => x.dur - y.dur || x.price - y.price);
  return a;
}
function paintFilters() {
  const el = $('#filters'); if (!R.res || !R.res.items.length) { el.style.display = 'none'; return; } el.style.display = '';
  const its = R.res.items, minP = a => (a.length ? pkr(Math.min(...a.map(x => x.price))) : '-'), prices = its.map(x => x.price), lo = Math.min(...prices), hi = Math.max(...prices);
  const airs = [...new Set(its.flatMap(i => i.airlines))].sort(), logoOf = n => (its.find(i => i.airlines.includes(n) && i.airline === n) || its.find(i => i.airline === n) || {}).logo || '';
  el.innerHTML = `<div class="fh"><h3>Filters</h3><button data-a="resetF">Reset all</button></div>
  <div class="fg"><h4>Stops</h4>${[['any', 'Any'], ['0', 'Non-stop'], ['1', '1 stop'], ['2', '2+ stops']].map(s => { const sub = s[0] === 'any' ? its : its.filter(i => stopsOf(i) === +s[0]); return sub.length ? `<label class="ck"><input type="radio" name="stp" value="${s[0]}" data-a="fStops" ${R.f.stops === s[0] ? 'checked' : ''}>${s[1]}<span class="p">${minP(sub)}</span></label>` : ''; }).join('')}</div>
  <div class="fg"><h4>Departure time</h4><div class="bands">${BANDS.map((b, k) => `<button type="button" class="${R.f.bands.includes(k) ? 'on' : ''}" data-a="fBand" data-v="${k}">${b[0]}<small>${b[1]}</small></button>`).join('')}</div></div>
  <div class="fg"><h4>Max price</h4><input class="rng" type="range" min="${lo}" max="${hi}" step="500" value="${R.f.max || hi}" data-a="fPrice" aria-label="Maximum price"><div class="rv"><span>${pkr(lo)}</span><b id="pmax" style="color:var(--ink)">${pkr(R.f.max || hi)}</b></div></div>
  <div class="fg"><h4>Airlines</h4>${airs.map(a => `<label class="ck"><input type="checkbox" data-a="fAir" value="${esc(a)}" ${R.f.air.includes(a) ? 'checked' : ''}>${logo(a, logoOf(a)).replace('class="lg"', 'class="al" style="display:grid;place-items:center;font-size:9px;color:#fff;font-weight:800"')}<span style="min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(a)}</span><span class="p">${minP(its.filter(i => i.airlines.includes(a)))}</span></label>`).join('')}</div>
  <div class="fg"><h4>Flight number</h4><input class="tin" placeholder="e.g. PK 761" value="${esc(R.f.fno)}" data-a="fFno" aria-label="Flight number"></div><button class="btn pri w fbtn" data-a="filt" style="margin-top:8px">Show flights</button>`;
}
ACTS.resetF = () => { R.f = { stops: 'any', bands: [], air: [], max: Math.max(...R.res.items.map(x => x.price)), fno: '' }; paintFilters(); paintMain(); };
ACTS.fStops = v => { R.f.stops = v; paintMain(); };
ACTS.fBand = (v, el) => { const k = +v, i = R.f.bands.indexOf(k); i < 0 ? R.f.bands.push(k) : R.f.bands.splice(i, 1); el.classList.toggle('on'); paintMain(); };
ACTS.fAir = (v, el) => { const i = R.f.air.indexOf(v); i < 0 ? R.f.air.push(v) : R.f.air.splice(i, 1); paintMain(); };
document.addEventListener('input', e => { const t = e.target; if (t.dataset && t.dataset.a === 'fPrice') { R.f.max = +t.value; $('#pmax').textContent = pkr(t.value); paintMainSoft(); } else if (t.dataset && t.dataset.a === 'fFno') { R.f.fno = t.value; paintMainSoft(); } });
const paintMainSoft = debounce(() => paintMain(), 120);
ACTS.filt = () => { const f = $('#filters'); f.classList.toggle('sheet'); let b = $('#fback'); if (f.classList.contains('sheet')) { b = document.createElement('div'); b.id = 'fback'; b.className = 'drawer'; b.style.zIndex = 89; b.addEventListener('click', ACTS.filt); document.body.appendChild(b); } else if (b) b.remove(); };
ACTS.sort = v => { R.sort = v; paintMain(); };
ACTS.day = v => { const d = addD(Q.date, +v); if (d < TODAY) return; if (Q.trip === 'return' && Q.ret < d) Q.ret = addD(d, 7); Q.date = d; location.hash = '#/flights?' + qs(); };
ACTS.fdet = (v, el) => { const d = $('#fd-' + v), open = d.hasAttribute('hidden'); d.toggleAttribute('hidden', !open); el.setAttribute('aria-expanded', open); el.querySelector('span').textContent = open ? 'Hide details' : 'Flight details'; };

function card(i, all) {
  const ps = plusDays(i), best = i.best && i._k === all.best, tags = [];
  if (i._k === all.cheap) tags.push('<span class="tg g">Cheapest</span>'); if (i._k === all.fast) tags.push('<span class="tg b">Fastest</span>'); if (i.best) tags.push('<span class="tg b">Top pick</span>');
  if (i.overnight) tags.push(`<span class="tg a">${ic('moon', 'sm')} Overnight</span>`); if (i.segs.some(s => s.delayed)) tags.push('<span class="tg r">Often delayed 30+ min</span>'); if (i.co2diff < 0) tags.push(`<span class="tg g">${ic('leaf', 'sm')} ${Math.abs(i.co2diff)}% lower CO2</span>`);
  if (Q.bags) tags.push(`<span class="tg">${Q.bags} checked bag${Q.bags > 1 ? 's' : ''} included in search</span>`); (i.ext || []).slice(0, 2).forEach(x => tags.push(`<span class="tg">${esc(x)}</span>`));
  const dots = i.stops ? Array.from({ length: i.stops }, (_, k) => `<i style="left:${Math.round(((k + 1) / (i.stops + 1)) * 100)}%"></i>`).join('') : '';
  const air = i.airlines.length > 1 ? i.airlines.join(' + ') : i.airline;
  return `<article class="fcard"><div class="fmain"><div class="air">${logo(i.airline, i.logo)}<div style="min-width:0"><b>${esc(air)}</b><span>${esc(i.nos.join(' · ') || i.cls || '')}</span></div></div>
   <div class="tl"><div class="pt"><b>${hm(i.dep)}</b><span>${esc(i.from)}</span></div><div class="mid"><div class="du">${dur(i.dur)}</div><div class="line">${dots}</div><div class="stp2 ${i.stops ? 'st1' : 'ns'}">${i.stops ? i.stops + (i.stops > 1 ? ' stops' : ' stop') + (i.via ? ' · ' + esc(i.via) : '') : 'Non-stop'}</div></div><div class="pt e"><b>${hm(i.arr)}${ps > 0 ? `<sup>+${ps}</sup>` : ''}</b><span>${esc(i.to)}</span></div></div>
   <div class="buy"><div><div class="price"><small>PKR</small>${fnum(i.price)}</div><div class="pn">${paxN() > 1 ? 'Total for ' + paxN() + ' travellers' : 'Per traveller'}${i.round ? ' · round trip' : ''}</div></div><button class="btn pri" data-a="req" data-v="${i._k}">Request booking</button></div></div>
   ${tags.length ? `<div class="ftag">${tags.join('')}</div>` : ''}
   <div class="fbar"><button class="dt" data-a="fdet" data-v="${i._k}" aria-expanded="false"><span>Flight details</span>${ic('down', 'sm')}</button><span>${esc(i.cls || 'Economy')}${i.plane ? ' · ' + esc(i.plane) : ''}</span></div>
   <div class="fdet" id="fd-${i._k}" hidden>${i.segs.map((s, k) => `${k ? layover(i.lay[k - 1], s) : ''}<div class="seg2"><div class="tm"><b>${hm(s.dep)}</b><span>${dShort(dOf(s.dep)).replace(/^\w+, /, '')}</span></div><div class="rail"><i></i></div><div class="bd"><b>${esc(s.fromName || s.from)} (${esc(s.from)})</b><div class="ds">${logo(s.air, s.logo).replace('class="lg"', 'class="lg" style="display:inline-grid;vertical-align:middle;width:22px;height:22px;border-radius:6px;font-size:9px;color:#fff;margin-right:6px"')}${esc(s.air)} ${esc(s.no)} · ${dur(s.dur)}</div><div class="segc">${s.plane ? `<span>${ic('plane', 'sm')}${esc(s.plane)}</span>` : ''}${s.legroom ? `<span>${ic('seat', 'sm')}${esc(s.legroom)} legroom</span>` : ''}${s.night ? `<span>${ic('moon', 'sm')}Overnight</span>` : ''}</div></div></div>
     <div class="seg2" style="padding-top:0"><div class="tm"><b>${hm(s.arr)}</b><span>${dShort(dOf(s.arr)).replace(/^\w+, /, '')}</span></div><div class="rail"><i style="border-color:#8da6dd"></i></div><div class="bd"><b>${esc(s.toName || s.to)} (${esc(s.to)})</b></div></div>`).join('')}
     ${i.co2 ? `<p class="note">${ic('leaf', 'sm')} Estimated ${i.co2} kg CO2 per traveller${i.co2diff ? ' (' + (i.co2diff > 0 ? '+' : '') + i.co2diff + '% vs typical)' : ''}.</p>` : ''}${i.round ? '<p class="note">The fare shown is the round-trip price for this outbound flight. Our desk confirms the return flight when you request the booking.</p>' : ''}</div></article>`;
}
const layover = (l, s) => (l ? `<div class="lay ${l.night ? 'night' : ''}">${ic('clock', 'sm')}Layover ${dur(l.dur)} in ${esc(l.name || l.id)} (${esc(l.id)})${l.night ? ' · overnight' : ''}</div>` : '');

function paintMain() {
  const m = $('#rmain'); if (!m) return;
  const title = `<div class="rtop"><div><div class="rtitle">${esc(Q.from.city)} ${ic('arrow')} ${esc(Q.to.city)}</div><div class="rmeta">${dShort(Q.date)}${Q.ret ? ' - ' + dShort(Q.ret) : ''} &middot; ${paxTxt()} &middot; ${CABINS.find(c => c[0] === Q.cls)[1]}</div></div>
    <button class="btn out sm fbtn" data-a="filt">${ic('filter', 'sm')}Filters</button><div class="dnav"><button data-a="day" data-v="-1" ${Q.date <= TODAY ? 'disabled' : ''}>${ic('left', 'sm')}Previous day</button><span>${dShort(Q.date)}</span><button data-a="day" data-v="1">Next day${ic('right', 'sm')}</button></div></div>`;
  if (R.loading) { m.innerHTML = title + `<div class="loadbar"><div style="flex:none"><span class="spinner dk"></span></div><div style="flex:1"><b>Comparing airlines and fares live</b><span>This usually takes a few seconds.</span><div class="tr" style="margin-top:10px"></div></div></div>` + Array.from({ length: 4 }, () => '<div class="sk"><div style="display:flex;gap:10px;align-items:center"><i class="l"></i><i style="width:70px"></i></div><div style="display:grid;gap:10px"><i style="width:70%"></i><i style="width:90%"></i></div><i class="b"></i></div>').join(''); return; }
  if (R.err) { m.innerHTML = title + `<div class="state"><div class="ic">${ic('alert', 'lg')}</div><h3>We could not load fares</h3><p>${esc(R.err.status === 403 ? 'Your account does not have access to flight search.' : R.err.message)}</p><div class="acts"><button class="btn pri" data-a="retry">Try again</button></div></div>`; return; }
  if (!R.res.configured) { m.innerHTML = title + `<div class="state"><div class="ic">${ic('plane', 'lg')}</div><h3>Live fares are not connected yet</h3><p>The administrator needs to add the flight search key in the CRM settings. You can still send a request to the desk and we will quote you by hand.</p><div class="acts"><a class="btn pri" href="/app#/queries">Open the query desk</a></div></div>`; return; }
  const all = R.res.items; if (!all.length) { m.innerHTML = title + `<div class="state"><div class="ic">${ic('search', 'lg')}</div><h3>No flights found</h3><p>Try a different date, a nearby airport, or turn off Direct only.</p><div class="acts"><button class="btn pri" data-a="day" data-v="1">Try the next day</button></div></div>`; return; }
  const cheap = all.reduce((a, b) => (b.price < a.price ? b : a)), fast = all.reduce((a, b) => (b.dur < a.dur ? b : a)), top = all.find(i => i.best) || all[0], flag = { cheap: cheap._k, fast: fast._k, best: top._k };
  const rows = visible(), ins = R.res.insight, lvl = ins && ins.level ? String(ins.level).toLowerCase() : '';
  const insight = ins ? `<div class="insight ${lvl === 'low' ? 'low' : lvl === 'high' ? 'high' : ''}"><div class="ic">${ic('trend')}</div><div><b>${lvl === 'low' ? 'Fares on this route are low right now' : lvl === 'high' ? 'Fares on this route are higher than usual' : 'Fares are in the typical range'}</b><span>Lowest today ${pkr(ins.lowest)}${ins.typical && ins.typical.length === 2 ? ' · usually ' + pkr(ins.typical[0]) + ' to ' + pkr(ins.typical[1]) : ''}</span></div></div>` : '';
  const S = (k, n, sub) => `<button class="${R.sort === k ? 'on' : ''}" data-a="sort" data-v="${k}"><b>${n}</b><span>${sub}</span></button>`;
  m.innerHTML = title + insight + `<div class="sorts">${S('best', 'Best', pkr(top.price) + ' · ' + dur(top.dur))}${S('cheap', 'Cheapest', pkr(cheap.price) + ' · ' + dur(cheap.dur))}${S('fast', 'Fastest', pkr(fast.price) + ' · ' + dur(fast.dur))}</div>
    <div class="rmeta" style="margin:0 2px 12px"><b style="color:var(--ink)">${rows.length}</b> of ${all.length} flights${R.res.staff && R.res.markup ? ' · includes ' + R.res.markup + '% markup' : ''} · live fares, refreshed every 10 minutes</div>
    ${rows.length ? rows.map(i => card(i, flag)).join('') : `<div class="state"><div class="ic">${ic('filter', 'lg')}</div><h3>No flights match these filters</h3><p>Reset the filters to see all ${all.length} flights.</p><div class="acts"><button class="btn pri" data-a="resetF">Reset filters</button></div></div>`}`;
}
ACTS.retry = () => route();

/* request a booking = a flight query on the agent's desk */
const fText = i => `${i.airline} ${i.nos.join('/')} · ${i.from} ${hm(i.dep)} → ${i.to} ${hm(i.arr)} · ${i.stops ? i.stops + ' stop' : 'non-stop'} · ${Q.date}${Q.ret ? ' / return ' + Q.ret : ''} · ${paxN()} traveller${paxN() > 1 ? 's' : ''} · ${pkr(i.price)}`;
ACTS.req = v => {
  const i = R.res.items.find(x => x._k === +v); if (!i) return;
  const m = modal(`<div class="mhead"><div class="lk">${ic('send', 'lg')}</div><h3>Request this booking</h3><p>The desk will confirm the fare and seats, then you can book from your dashboard.</p></div><div class="mbody"><div class="trip" style="flex-wrap:wrap;text-align:center">${esc(i.airline)} ${esc(i.nos.join('/'))}<span>${esc(i.from)} ${hm(i.dep)} to ${esc(i.to)} ${hm(i.arr)} · ${pkr(i.price)}</span></div>
    <label class="fld" style="margin-top:16px"><span>Notes for the desk <small>optional</small></span><div class="inp ta"><textarea id="rq-n" rows="3" placeholder="Passenger names, preferred time, baggage..."></textarea></div></label><button class="nx" style="width:100%" id="rq-go">Send request</button></div>`);
  $('#rq-go', m).addEventListener('click', async ev => {
    const b = ev.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner sm"></span>';
    try { await api('/api/rpc', { method: 'POST', body: JSON.stringify({ op: 'addQuery', type: 'flight', source: 'portal', text: fText(i) + ($('#rq-n').value.trim() ? '\n' + $('#rq-n').value.trim() : ''), details: { kind: 'flight', airline: i.airline, fno: i.nos.join('/'), from: i.from, to: i.to, date: Q.date, ret: Q.ret || '', pax: paxN() } }) });
      modal(`<div class="mbody" style="padding-top:36px;text-align:center"><div class="done"><div class="big">${ic('check')}</div><h3 style="font-size:23px">Request sent</h3><p style="margin:10px auto 22px">The desk has your request. You will see the quote in your queries as soon as it is ready.</p></div><a class="btn pri w" href="/app#/queries">View my queries</a><button class="btn out w" style="margin-top:10px" data-a="closeModal">Keep searching</button></div>`); }
    catch (e) { toast(e.message, true); b.disabled = false; b.textContent = 'Send request'; }
  });
};


/* =====================================================================
   HOTEL RESULTS
   ===================================================================== */
const HR = { res: null, loading: false, err: null, sort: 'price', stars: 0, free: false, tok: 0 };
function readHq(s) { const p = new URLSearchParams(s); if (!p.get('city') || !p.get('cin') || !p.get('cout')) return false; H.city = p.get('city'); H.cin = p.get('cin'); H.cout = p.get('cout'); H.ad = Math.max(1, +p.get('ad') || 2); H.stars = p.get('stars') || ''; H.free = p.get('free') === '1'; return true; }
async function viewHotels(qstr) {
  if (!readHq(qstr)) { location.hash = '#/'; return; }
  H.mode = 'hotels'; scene('short'); document.body.dataset.page = 'flights';
  $('#view').innerHTML = `<div class="rhead"><div id="shost"></div></div><div class="rpage one"><section id="rmain"></section></div>`; mountSearch($('#shost'));
  if (!ME.user) { $('#rmain').innerHTML = `<div class="state"><div class="ic">${ic('lock', 'lg')}</div><h3>Sign in to see live hotel rates</h3><p>Hotel rates are available to approved travel agents. Sign in, or apply for a partner account.</p><div class="acts"><button class="btn pri" data-a="hgate">Sign in</button><a class="btn out" href="#/signup">Apply as a travel agent</a></div></div>`; openLogin({ hotel: true, then: () => route() }); return; }
  HR.res = null; HR.err = null; HR.loading = true; HR.stars = +H.stars || 0; HR.free = H.free; HR.sort = 'price'; const tok = ++HR.tok; paintHotels();
  try { const p = new URLSearchParams({ city: H.city, cin: H.cin, cout: H.cout, adults: H.ad }); if (H.stars) p.set('stars', H.stars === '5' ? '5' : '3,4,5'.split(',').filter(x => +x >= +H.stars).join(',')); if (H.free) p.set('free', '1');
    const r = await api('/api/search/hotels?' + p); if (tok !== HR.tok) return; r.items = (r.items || []).map((x, k) => ({ ...x, _k: k })); HR.res = r; }
  catch (e) { if (tok !== HR.tok) return; if (e.status === 401) { ME.user = null; renderNav(); return route(); } HR.err = e; }
  HR.loading = false; paintHotels();
}
ACTS.hgate = () => openLogin({ hotel: true, then: () => route() });
const nightsN = () => Math.max(1, Math.round((parse(H.cout) - parse(H.cin)) / 864e5));
function hotelCardHtml(h) {
  const n = nightsN(), tot = h.total || h.price * n, near = (h.near || []).map(x => `<span>${ic('pin', 'sm')}${esc(x.name)}${x.t ? ' · ' + esc(x.t) : ''}</span>`).join('');
  const rl = h.rating >= 4.5 ? 'Exceptional' : h.rating >= 4 ? 'Very good' : h.rating >= 3.5 ? 'Good' : h.rating ? 'Fair' : '';
  return `<article class="hcard"><div class="himg">${h.img ? `<img src="${esc(h.img)}" alt="${esc(h.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}${h.deal ? `<span class="deal">${esc(h.deal)}</span>` : ''}</div>
  <div class="hbody"><div class="htop"><div><h3>${esc(h.name)}</h3><div class="hmeta">${h.stars ? `<span class="stars" aria-label="${h.stars} stars">${'&#9733;'.repeat(h.stars)}</span>` : ''}<span>${esc(h.type === 'vacation rental' ? 'Apartment' : 'Hotel')}</span></div></div>${h.rating ? `<div class="score"><b>${h.rating.toFixed(1)}</b><span>${rl}${h.reviews ? '<br>' + fnum(h.reviews) + ' reviews' : ''}</span></div>` : ''}</div>
  ${near ? `<div class="hnear">${near}</div>` : ''}<div class="htags">${h.free ? `<span class="tg g">${ic('shield', 'sm')}Free cancellation</span>` : ''}${(h.amenities || []).slice(0, 4).map(a => `<span class="tg">${esc(a)}</span>`).join('')}</div>
  <div class="hbuy"><div><div class="price"><small>PKR</small>${fnum(h.price)}</div><div class="pn">per night · ${fnum(tot)} total for ${n} night${n > 1 ? 's' : ''}</div></div><button class="btn pri" data-a="hreq" data-v="${h._k}">Request quote</button></div></div></article>`;
}
function paintHotels() {
  const m = $('#rmain'); if (!m) return; const n = nightsN();
  const title = `<div class="rtop"><div><div class="rtitle">${ic('hotel')} ${esc(H.city)}</div><div class="rmeta">${dShort(H.cin)} - ${dShort(H.cout)} &middot; ${n} night${n > 1 ? 's' : ''} &middot; ${H.ad} guest${H.ad > 1 ? 's' : ''}</div></div></div>`;
  if (HR.loading) { m.innerHTML = title + `<div class="loadbar"><div style="flex:none"><span class="spinner dk"></span></div><div style="flex:1"><b>Finding hotels and live rates</b><span>This usually takes a few seconds.</span><div class="tr" style="margin-top:10px"></div></div></div>` + Array.from({ length: 3 }, () => '<div class="sk"><div style="display:flex;gap:10px;align-items:center"><i class="l"></i><i style="width:70px"></i></div><div style="display:grid;gap:10px"><i style="width:70%"></i><i style="width:90%"></i></div><i class="b"></i></div>').join(''); return; }
  if (HR.err) { m.innerHTML = title + `<div class="state"><div class="ic">${ic('alert', 'lg')}</div><h3>We could not load hotels</h3><p>${esc(HR.err.status === 403 ? 'Your account does not have access to hotel search.' : HR.err.message)}</p><div class="acts"><button class="btn pri" data-a="retry">Try again</button></div></div>`; return; }
  if (!HR.res.configured) { m.innerHTML = title + `<div class="state"><div class="ic">${ic('hotel', 'lg')}</div><h3>Live hotel rates are not connected yet</h3><p>The administrator needs to add the search key in the CRM settings. You can still send a request to the desk.</p><div class="acts"><button class="btn pri" data-a="hdesk">Ask the desk for a quote</button></div></div>`; return; }
  let a = HR.res.items.filter(h => (!HR.stars || h.stars >= HR.stars) && (!HR.free || h.free));
  a = a.slice().sort((x, y) => HR.sort === 'rating' ? y.rating - x.rating : HR.sort === 'reviews' ? y.reviews - x.reviews : x.price - y.price);
  const S = (k, t) => `<button class="${HR.sort === k ? 'on' : ''}" data-a="hsort" data-v="${k}"><b>${t}</b></button>`;
  m.innerHTML = title + `<div class="hfilters"><div class="sorts hs">${S('price', 'Lowest price')}${S('rating', 'Best rated')}${S('reviews', 'Most reviewed')}</div><div class="hchips">${[0, 3, 4, 5].map(s => `<button class="${HR.stars === s ? 'on' : ''}" data-a="hstarf" data-v="${s}">${s ? s + '+ stars' : 'All stars'}</button>`).join('')}<button class="${HR.free ? 'on' : ''}" data-a="hfreef">Free cancellation</button></div></div>
  <div class="rmeta" style="margin:0 2px 12px"><b style="color:var(--ink)">${a.length}</b> of ${HR.res.items.length} properties${HR.res.staff && HR.res.markup ? ' · includes ' + HR.res.markup + '% markup' : ''} · live rates</div>
  ${a.length ? a.map(hotelCardHtml).join('') : `<div class="state"><div class="ic">${ic('search', 'lg')}</div><h3>No hotels found</h3><p>Try different dates, another city, or clear the filters.</p><div class="acts"><button class="btn pri" data-a="hclear">Clear filters</button></div></div>`}`;
}
ACTS.hsort = v => { HR.sort = v; paintHotels(); };
ACTS.hstarf = v => { HR.stars = +v; paintHotels(); };
ACTS.hfreef = () => { HR.free = !HR.free; paintHotels(); };
ACTS.hclear = () => { HR.stars = 0; HR.free = false; paintHotels(); };
const hotelSummary = h => `${h.name} (${h.stars || '?'}★) · ${H.city} · ${H.cin} → ${H.cout} · ${H.ad} guest${H.ad > 1 ? 's' : ''}${h ? ' · ' + pkr(h.price) + ' per night' : ''}`;
async function sendHotelQuery(h, note, b) {
  try { await api('/api/rpc', { method: 'POST', body: JSON.stringify({ op: 'addQuery', type: 'hotel', source: 'portal', text: (h ? hotelSummary(h) : `Hotel in ${H.city} · ${H.cin} → ${H.cout} · ${H.ad} guests`) + (note ? '\n' + note : ''), details: { kind: 'hotel', hotel: h ? h.name : '', city: H.city, cin: H.cin, cout: H.cout, pax: H.ad } }) });
    modal(`<div class="mbody" style="padding-top:36px;text-align:center"><div class="done"><div class="big">${ic('check')}</div><h3 style="font-size:23px">Request sent</h3><p style="margin:10px auto 22px">The desk has your request and will reply with a quote.</p></div><a class="btn pri w" href="/app#/queries">View my queries</a><button class="btn out w" style="margin-top:10px" data-a="closeModal">Keep searching</button></div>`); }
  catch (e) { toast(e.message, true); if (b) { b.disabled = false; b.textContent = 'Send request'; } }
}
ACTS.hreq = v => {
  const h = HR.res.items.find(x => x._k === +v); if (!h) return;
  const m = modal(`<div class="mhead"><div class="lk">${ic('send', 'lg')}</div><h3>Request this hotel</h3><p>The desk will confirm availability and the final price.</p></div><div class="mbody"><div class="trip" style="flex-wrap:wrap;text-align:center">${esc(h.name)}<span>${dShort(H.cin)} to ${dShort(H.cout)} · ${pkr(h.price)} / night</span></div><label class="fld" style="margin-top:16px"><span>Notes for the desk <small>optional</small></span><div class="inp ta"><textarea id="rq-n" rows="3" placeholder="Rooms, bed type, guest names..."></textarea></div></label><button class="nx" style="width:100%" id="rq-go">Send request</button></div>`);
  $('#rq-go', m).addEventListener('click', ev => { const b = ev.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner sm"></span>'; sendHotelQuery(h, $('#rq-n').value.trim(), b); });
};
ACTS.hdesk = () => { const b = document.createElement('button'); sendHotelQuery(null, '', b); };

/* =====================================================================
   PARTNER SIGNUP  (owner -> company -> documents -> password), reviewed by an administrator
   ===================================================================== */
const CCODES = [['PK', '+92'], ['AE', '+971'], ['SA', '+966'], ['GB', '+44'], ['US', '+1'], ['BD', '+880'], ['IN', '+91'], ['QA', '+974'], ['OM', '+968'], ['KW', '+965'], ['BH', '+973'], ['TR', '+90'], ['AF', '+93'], ['AU', '+61']];
const TYPES = ['Travel agency', 'Umrah / Hajj operator', 'Tour operator', 'Ticketing agent', 'Freelance agent', 'Other'];
const YEARS = ['Less than 1 year', '1 to 3 years', '3 to 5 years', '5 to 10 years', 'More than 10 years'], VOL = ['Under 20', '20 to 50', '50 to 150', '150 to 500', 'Over 500'];
const DOCS = [['cnicFront', 'CNIC front', true, 'id', 'All four corners visible, no glare', false], ['cnicBack', 'CNIC back', true, 'id', 'Both sides are checked against your number', false], ['photo', 'Your photo', true, 'camera', 'A clear face photo, no sunglasses', false], ['card', 'Visiting card', false, 'file', 'Image or PDF', true], ['licence', 'Business licence / NTN', false, 'building', 'Image or PDF', true]];
const STEPS = ['Owner Info', 'Company Info', 'Documents', 'Password'];
const W = { step: 0, d: { first: '', last: '', email: '', cc: '+92', phone: '', cnic: '', company: '', type: '', city: '', address: '', website: '', licenceNo: '', iata: '', years: '', volume: '', pw: '', pw2: '', terms: false }, files: {}, emailState: '', done: null, touched: {}, busy: false };
try { Object.assign(W.d, JSON.parse(sessionStorage.getItem('sg-draft') || '{}'), { pw: '', pw2: '', terms: false }); } catch { /* ignore */ }
const save = () => { try { const { pw, pw2, terms, ...r } = W.d; sessionStorage.setItem('sg-draft', JSON.stringify(r)); } catch { /* private mode */ } };
const dg = v => String(v || '').replace(/\D/g, '');
const EMAILRE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const pwRules = p => [['At least 8 characters', p.length >= 8], ['A letter', /[A-Za-z]/.test(p)], ['A number', /\d/.test(p)], ['A symbol or capital (stronger)', /[^A-Za-z0-9]/.test(p) || /[A-Z]/.test(p)]];
function errOf(k) {
  const d = W.d, v = String(d[k] || '').trim();
  switch (k) {
    case 'first': case 'last': return v.length < 2 ? 'Enter at least 2 letters' : '';
    case 'email': return !EMAILRE.test(v) ? 'Enter a valid email address' : W.emailState === 'taken' ? (W.emailMsg || 'This email is already registered') : '';
    case 'phone': return dg(d.phone).replace(/^0+/, '').length < 9 ? 'Enter your mobile number' : '';
    case 'cnic': return dg(d.cnic).length !== 13 ? 'CNIC has 13 digits' : '';
    case 'company': return v.length < 2 ? 'Enter your company name' : '';
    case 'type': return !v ? 'Choose a business type' : '';
    case 'city': return v.length < 2 ? 'Enter your city' : '';
    case 'address': return v.length < 6 ? 'Enter your office address' : '';
    case 'pw': return d.pw.length < 8 ? 'Use at least 8 characters' : !/[A-Za-z]/.test(d.pw) || !/\d/.test(d.pw) ? 'Include letters and numbers' : '';
    case 'pw2': return d.pw2 !== d.pw ? 'Passwords do not match' : '';
    default: return '';
  }
}
const STEPKEYS = [['first', 'last', 'email', 'phone', 'cnic'], ['company', 'type', 'city', 'address'], [], ['pw', 'pw2']];
function stepOk(s) {
  if (s === 2) return DOCS.filter(x => x[2]).every(x => W.files[x[0]]);
  if (s === 3) return !STEPKEYS[3].some(errOf) && W.d.terms;
  return !STEPKEYS[s].some(errOf);
}
function fld(k, label, o = {}) {
  const v = W.d[k], e = W.touched[k] ? errOf(k) : '', ctl = o.select ? `<select data-k="${k}" aria-label="${esc(label)}"><option value="">${esc(o.ph || 'Select')}</option>${o.select.map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : o.area ? `<textarea data-k="${k}" rows="2" placeholder="${esc(o.ph || '')}" autocomplete="${o.ac || 'off'}">${esc(v)}</textarea>` : `<input data-k="${k}" type="${o.type || 'text'}" value="${esc(v)}" placeholder="${esc(o.ph || '')}" autocomplete="${o.ac || 'off'}" ${o.mode ? `inputmode="${o.mode}"` : ''} ${o.max ? `maxlength="${o.max}"` : ''}>`;
  return `<div class="fld ${e ? 'bad' : ''}" data-f="${k}"><span>${esc(label)}${o.req === false ? ' <small>optional</small>' : '<em>*</em>'}</span><div class="inp ${o.area ? 'ta' : ''}">${o.cc ? `<div class="cc"><select data-k="cc" aria-label="Country code">${CCODES.map(c => `<option value="${c[1]}" ${c[1] === W.d.cc ? 'selected' : ''}>${c[0]} ${c[1]}</option>`).join('')}</select></div>` : o.icon ? ic(o.icon) : ''}${ctl}${o.extra || ''}</div><div class="err">${esc(e)}</div>${o.hint ? `<div class="hint ${o.hintCls || ''}" id="h-${k}">${o.hint}</div>` : ''}</div>`;
}
const emailExtra = () => `<button type="button" class="act ${W.emailState === 'ok' ? 'ok' : ''}" data-a="chkEmail" ${W.emailState === 'checking' ? 'disabled' : ''}>${W.emailState === 'checking' ? '<span class="spinner dk sm"></span>' : ic('shield', 'sm')}${W.emailState === 'ok' ? 'Available' : 'Check'}</button>`;

function stepHtml() {
  const s = W.step;
  if (s === 0) return `<div class="g2">${fld('first', 'First Name', { icon: 'user', ph: 'Enter first name', ac: 'given-name' })}${fld('last', 'Last Name', { icon: 'user', ph: 'Enter last name', ac: 'family-name' })}</div>
    <div class="g2">${fld('email', 'Owner Email', { icon: 'mail', ph: 'you@company.com', type: 'email', ac: 'email', extra: emailExtra(), hint: W.emailState === 'ok' ? 'This email is available. You will sign in with it.' : 'You will sign in with this email.', hintCls: W.emailState === 'ok' ? 'ok' : '' })}${fld('phone', 'Owner Phone', { cc: 1, ph: '300 1234567', type: 'tel', ac: 'tel-national', mode: 'tel' })}</div>${fld('cnic', 'Owner CNIC number', { icon: 'id', ph: '35202-1234567-1', mode: 'numeric', max: 15, hint: 'Found on the front of your CNIC. It must match the uploaded photos.' })}`;
  if (s === 1) return `${fld('company', 'Company Name', { icon: 'building', ph: 'Registered or trading name' })}<div class="g2">${fld('type', 'Business Type', { select: TYPES, ph: 'Select type', icon: 'briefcase' in IC ? 'briefcase' : 'building' })}${fld('city', 'City', { icon: 'pin', ph: 'e.g. Lahore', ac: 'address-level2' })}</div>${fld('address', 'Office Address', { area: 1, ph: 'Shop / office, street, area', ac: 'street-address' })}
    <div class="g2">${fld('website', 'Website or Facebook page', { icon: 'globe', ph: 'https://', req: false, type: 'url' })}${fld('licenceNo', 'Licence / NTN number', { icon: 'file', ph: 'If you have one', req: false })}</div><div class="g2">${fld('years', 'Years in business', { select: YEARS, ph: 'Select', req: false, icon: 'clock' })}${fld('volume', 'Expected bookings per month', { select: VOL, ph: 'Select', req: false, icon: 'trend' })}</div>`;
  if (s === 2) return `<div class="tipbox">${ic('info')}<div><b>Use clear, uncropped photos.</b> Blurry or cut-off documents are the most common reason for a delay. Your files are stored securely and only our review team can open them.</div></div><div class="drops">${DOCS.map(dropHtml).join('')}</div>`;
  const rules = pwRules(W.d.pw), score = rules.filter(r => r[1]).length - (W.d.pw.length >= 8 ? 0 : 0), col = ['#e4e8f0', '#f04438', '#f79009', '#12b76a', '#067647'][Math.min(4, score)];
  return `<div class="g2"><div>${fld('pw', 'Password', { icon: 'lock', type: 'password', ph: 'Create a password', ac: 'new-password', extra: `<button type="button" class="eye" data-a="eye" aria-label="Show password">${ic('eye')}</button>` })}<div class="meter">${[1, 2, 3, 4].map(n => `<i style="background:${score >= n ? col : ''}"></i>`).join('')}</div><div class="rules">${rules.map(r => `<span class="${r[1] ? 'ok' : ''}">${ic(r[1] ? 'check' : 'x')}${r[0]}</span>`).join('')}</div></div>${fld('pw2', 'Confirm Password', { icon: 'lock', type: 'password', ph: 'Repeat the password', ac: 'new-password' })}</div>
  <div class="review"><div><span>Owner</span><b>${esc(W.d.first + ' ' + W.d.last)}</b></div><div><span>Company</span><b>${esc(W.d.company)}</b></div><div><span>Login email</span><b>${esc(W.d.email)}</b></div><div><span>Documents</span><b>${Object.keys(W.files).length} uploaded</b></div></div>
  <label class="agree"><input type="checkbox" id="terms" data-k="terms" ${W.d.terms ? 'checked' : ''}><span>I confirm the details and documents are genuine, and I agree that my account is activated only after review by the administrator.</span></label>`;
}
function dropHtml(d) {
  const [k, label, req, icn, hint, pdf] = d, f = W.files[k];
  return `<div class="drop ${f ? 'has' : ''}" data-drop="${k}">${f ? `${f.pdf ? `<div class="pdf">${ic('file', 'lg')}</div>` : `<img src="${f.data}" alt="${esc(label)}">`}<button type="button" class="rm" data-a="rmFile" data-v="${k}" aria-label="Remove ${esc(label)}">${ic('x', 'sm')}</button><div class="cap"><span>${esc(label)}</span><span>${ic('check', 'sm')}</span></div>`
    : `<div>${req ? '' : '<span class="opt">Optional</span>'}<div class="ic">${ic(icn, 'lg')}</div><b>${esc(label)}${req ? ' <em>*</em>' : ''}</b><span>${esc(hint)}</span><span style="color:var(--blue);font-weight:700;margin-top:8px">Tap to upload or drop here</span></div><input type="file" data-file="${k}" accept="${pdf ? 'image/*,application/pdf' : 'image/*'}" ${k === 'photo' ? 'capture="user"' : ''} aria-label="${esc(label)}">`}</div>`;
}
function paintSignup() {
  const h = $('#sgbody'); if (!h) return;
  h.innerHTML = `<div class="wiz" role="list">${STEPS.map((s, i) => `<div class="${i === W.step ? 'on' : i < W.step ? 'done' : ''}" role="listitem" ${i === W.step ? 'aria-current="step"' : ''}>${i + 1}. <span>${s}</span></div>`).join('')}</div><div class="formerr" id="sgerr" role="alert"></div><form id="sgform" novalidate>${stepHtml()}<div class="btnw">${W.step ? `<button type="button" class="bk" data-a="sgBack">${ic('back', 'sm')}Back</button>` : ''}<button class="nx" type="submit" id="nx" ${stepOk(W.step) && !W.busy ? '' : 'disabled'}>${W.step === 3 ? 'Submit application' : 'Next'}</button></div></form><p class="alt">Already have an account? Please, <a href="#" data-a="login">Sign In</a></p>`;
  $('#sgform').addEventListener('submit', e => { e.preventDefault(); sgNext(); }); bindDrops();
}
function viewSignup() {
  scene('auth'); document.body.dataset.page = 'signup';
  if (W.done) return viewDone();
  $('#view').innerHTML = `<div class="auth"><div class="acard"><div class="alogo"><span class="mark"><img src="/brand/logo?v=${ME.logoV || 0}" alt=""></span><b>${esc(ME.company.name || 'The Umrah Store')}<small>Agent portal</small></b></div><h2>B2B Partner Signup</h2><div id="sgbody"></div></div></div>`; paintSignup();
}
const nxState = () => { const b = $('#nx'); if (b) b.disabled = !stepOk(W.step) || W.busy; };
document.addEventListener('input', e => {
  const t = e.target.closest('[data-k]'); if (!t || !$('#sgbody')) return; const k = t.dataset.k;
  if (k === 'terms') W.d.terms = t.checked; else if (k === 'cnic') { const x = dg(t.value).slice(0, 13); t.value = x.length > 12 ? x.slice(0, 5) + '-' + x.slice(5, 12) + '-' + x.slice(12) : x.length > 5 ? x.slice(0, 5) + '-' + x.slice(5) : x; W.d.cnic = t.value; }
  else if (k === 'phone') { t.value = t.value.replace(/[^\d\s-]/g, ''); W.d.phone = t.value; } else W.d[k] = t.value;
  if (k === 'email') { W.emailState = ''; const b = $('[data-a=chkEmail]'); if (b) { b.className = 'act'; b.innerHTML = ic('shield', 'sm') + 'Check'; } const h = $('#h-email'); if (h) { h.className = 'hint'; h.textContent = 'You will sign in with this email.'; } }
  if (W.touched[k]) fieldErr(k); if (k === 'pw' || k === 'pw2') pwLive(k); save(); nxState();
});
document.addEventListener('change', e => { const t = e.target.closest('[data-k]'); if (t && t.tagName === 'SELECT' && $('#sgbody')) { W.d[t.dataset.k] = t.value; save(); nxState(); if (W.touched[t.dataset.k]) fieldErr(t.dataset.k); } if (t && t.dataset.k === 'terms') nxState(); const f = e.target.closest('[data-file]'); if (f && f.files[0]) takeFile(f.dataset.file, f.files[0]); });
document.addEventListener('focusout', e => { const t = e.target.closest('[data-k]'); if (!t || !$('#sgbody') || t.type === 'checkbox') return; W.touched[t.dataset.k] = true; fieldErr(t.dataset.k); if (t.dataset.k === 'email' && !errOf('email') && !W.emailState) ACTS.chkEmail(); });
function fieldErr(k) { const f = $(`.fld[data-f="${k}"]`); if (!f) return; const m = errOf(k); f.classList.toggle('bad', !!m); $('.err', f).textContent = m; }
function pwLive(k) { if (k === 'pw') { const rules = pwRules(W.d.pw), score = rules.filter(r => r[1]).length, col = ['#e4e8f0', '#f04438', '#f79009', '#12b76a', '#067647'][Math.min(4, score)]; $$('.meter i').forEach((i, n) => { i.style.background = score >= n + 1 ? col : ''; }); $$('.rules span').forEach((s, n) => { s.className = rules[n][1] ? 'ok' : ''; s.querySelector('svg').innerHTML = IC[rules[n][1] ? 'check' : 'x']; }); if (W.touched.pw2) fieldErr('pw2'); } }
ACTS.chkEmail = async () => {
  if (errOf('email') && W.emailState !== 'taken') { W.touched.email = true; fieldErr('email'); return; }
  W.emailState = 'checking'; const b = $('[data-a=chkEmail]'); if (b) { b.disabled = true; b.innerHTML = '<span class="spinner dk sm"></span>Checking'; }
  try { await api('/api/public/signup/check?email=' + encodeURIComponent(W.d.email.trim())); W.emailState = 'ok'; W.emailMsg = ''; } catch (e) { W.emailState = e.status === 409 ? 'taken' : ''; W.emailMsg = e.message; if (e.status !== 409) toast(e.message, true); }
  if ($('#sgbody') && W.step === 0) { const keep = document.activeElement && document.activeElement.dataset.k; paintSignup(); if (keep) { const n = $(`[data-k="${keep}"]`); n && n.focus(); } W.touched.email = true; fieldErr('email'); }
};
ACTS.sgBack = () => { W.step = Math.max(0, W.step - 1); paintSignup(); scrollTo({ top: 0, behavior: 'smooth' }); };
async function sgNext() {
  if (!stepOk(W.step)) { STEPKEYS[W.step].forEach(k => { W.touched[k] = true; fieldErr(k); }); return; }
  if (W.step < 3) { if (W.step === 0 && W.emailState !== 'ok') { await ACTS.chkEmail(); if (W.emailState === 'taken') return; } W.step++; paintSignup(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const er = $('#sgerr'); er.classList.remove('on'); W.busy = true; const b = $('#nx'); b.disabled = true; b.innerHTML = '<span class="spinner sm"></span>Submitting';
  const d = W.d, docs = {}; Object.entries(W.files).forEach(([k, f]) => { docs[k] = f.data; });
  try { const r = await api('/api/public/signup', { method: 'POST', body: JSON.stringify({ first: d.first.trim(), last: d.last.trim(), email: d.email.trim(), phone: d.cc + dg(d.phone).replace(/^0+/, ''), cnic: d.cnic, company: d.company.trim(), type: d.type, city: d.city.trim(), address: d.address.trim(), website: d.website.trim(), licenceNo: d.licenceNo.trim(), iata: d.iata, years: d.years, volume: d.volume, password: d.pw, terms: d.terms, docs }) });
    W.done = { ref: r.ref, email: d.email.trim(), company: d.company.trim() }; sessionStorage.removeItem('sg-draft'); W.d.pw = W.d.pw2 = ''; W.files = {}; W.busy = false; viewDone(); scrollTo({ top: 0 }); }
  catch (e) { W.busy = false; er.textContent = e.message; er.classList.add('on'); er.scrollIntoView({ behavior: 'smooth', block: 'center' }); b.disabled = false; b.textContent = 'Submit application'; if (e.status === 409) { W.step = 0; W.emailState = 'taken'; W.emailMsg = e.message; setTimeout(() => { paintSignup(); const x = $('#sgerr'); x.textContent = e.message; x.classList.add('on'); }, 600); } }
}
function viewDone() {
  const r = W.done; document.body.dataset.page = 'signup';
  $('#view').innerHTML = `<div class="auth"><div class="acard sm"><div class="done"><div class="big">${ic('check')}</div><h2>Application received</h2><p>Thank you, ${esc(r.company)}. Our team will review your documents. You can sign in with <b>${esc(r.email)}</b> once your account is approved.</p>
  <div class="refbox"><div><small>Your reference</small><b>${esc(r.ref)}</b></div><button class="btn out sm" data-a="copyRef" data-v="${esc(r.ref)}">${ic('copy', 'sm')}Copy</button></div>
  <div class="next"><div><i>1</i><span><b>We check your documents</b>CNIC, photo and company details are reviewed by an administrator.</span></div><div><i>2</i><span><b>Your account is activated</b>Approved partners get an agent account with their own ledger.</span></div><div><i>3</i><span><b>Sign in and search fares</b>Use the email and password you just created.</span></div></div>
  <div style="display:flex;gap:10px;justify-content:center;margin-top:22px;flex-wrap:wrap"><a class="btn pri" href="#/status">Check status</a><a class="btn out" href="#/">Back to home</a></div></div></div></div>`;
}
ACTS.copyRef = async v => { try { await navigator.clipboard.writeText(v); toast('Reference copied'); } catch { toast(v); } };

/* documents: compress images in the browser so uploads stay small and fast */
async function compress(file) {
  const url = URL.createObjectURL(file); try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.84, 0.72, 0.6, 0.5]) { const d = c.toDataURL('image/jpeg', q); if (d.length * 0.75 < 1.8e6) return d; } throw new Error('too big');
  } finally { URL.revokeObjectURL(url); }
}
async function takeFile(k, file) {
  const def = DOCS.find(x => x[0] === k); if (!file) return;
  try {
    if (file.type === 'application/pdf') { if (!def[5]) throw new Error('Please upload a photo (JPG or PNG) for ' + def[1] + '.'); if (file.size > 2.4e6) throw new Error('That PDF is over 2.4 MB. Please upload a smaller file.'); W.files[k] = { pdf: true, name: file.name, data: await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }) }; }
    else { if (!/^image\//.test(file.type)) throw new Error('Unsupported file. Use JPG, PNG or PDF.'); W.files[k] = { name: file.name, data: await compress(file) }; }
    paintSignup();
  } catch (e) { toast(/too big|decode|load/i.test(e.message) || !e.message ? 'We could not read that image. Try a JPG or PNG.' : e.message, true); }
}
ACTS.rmFile = k => { delete W.files[k]; paintSignup(); };
function bindDrops() { $$('.drop[data-drop]').forEach(z => { ['dragenter', 'dragover'].forEach(n => z.addEventListener(n, e => { e.preventDefault(); z.classList.add('over'); })); ['dragleave', 'drop'].forEach(n => z.addEventListener(n, e => { e.preventDefault(); z.classList.remove('over'); })); z.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; f && takeFile(z.dataset.drop, f); }); }); }

/* status check */
function viewStatus() {
  scene('auth'); document.body.dataset.page = 'signup';
  $('#view').innerHTML = `<div class="auth"><div class="acard sm"><div class="alogo"><span class="mark"><img src="/brand/logo?v=${ME.logoV || 0}" alt=""></span><b>${esc(ME.company.name || 'The Umrah Store')}<small>Agent portal</small></b></div><h2>Check application status</h2>
  <form id="stform" novalidate><label class="fld"><span>Reference <em>*</em></span><div class="inp">${ic('file')}<input id="st-ref" placeholder="AP-XXXXXX" autocapitalize="characters" autocomplete="off" value="${esc((W.done && W.done.ref) || '')}"></div></label><label class="fld"><span>Email used to apply <em>*</em></span><div class="inp">${ic('mail')}<input id="st-em" type="email" placeholder="you@company.com" value="${esc((W.done && W.done.email) || W.d.email || '')}"></div></label><button class="nx" style="width:100%" id="st-go">Check status</button></form><div id="st-out"></div><p class="alt"><a href="#/signup">Start a new application</a></p></div></div>`;
  $('#stform').addEventListener('submit', async e => {
    e.preventDefault(); const b = $('#st-go'), o = $('#st-out'); b.disabled = true; b.innerHTML = '<span class="spinner sm"></span>';
    try { const r = await api('/api/public/signup/status', { method: 'POST', body: JSON.stringify({ ref: $('#st-ref').value, email: $('#st-em').value }) }); const k = r.status === 'Approved' ? ['a', 'check', 'Approved', 'Your account is active. Sign in with your email and password.'] : r.status === 'Rejected' ? ['r', 'x', 'Not approved', r.reason || 'Please contact the office.'] : ['p', 'clock', 'Under review', 'Our team is checking your documents. You will be able to sign in as soon as it is approved.'];
      o.innerHTML = `<div class="stbox"><span class="bd ${k[0]}">${ic(k[1], 'sm')}${k[2]}</span><p style="color:var(--tx)">${esc(k[3])}</p><p class="hint" style="margin-top:8px">${esc(r.company)} &middot; ${esc(r.ref)}</p>${r.status === 'Approved' ? '<button class="btn pri" style="margin-top:12px" data-a="login">Sign in</button>' : r.status === 'Rejected' ? '<a class="btn pri" style="margin-top:12px" href="#/signup">Apply again</a>' : ''}</div>`; }
    catch (x) { o.innerHTML = `<div class="formerr on" style="margin-top:16px">${esc(x.message)}</div>`; }
    b.disabled = false; b.textContent = 'Check status';
  });
}

/* =====================================================================
   ROUTER + BOOT
   ===================================================================== */
function route() {
  closePop(); const fb = $('#fback'); fb && fb.remove(); const h = location.hash.replace(/^#\/?/, ''), [p, q] = [h.split('?')[0], h.split('?').slice(1).join('?')];
  if (p === 'contact') { location.hash = '#/'; return; }
  const V = { '': viewHome, signup: viewSignup, status: viewStatus, flights: () => { H.mode = 'flights'; return viewFlights(q); }, hotels: () => viewHotels(q) }; (V[p] || viewHome)();
  if (p !== 'flights' && p !== '') { /* keep scroll at top for form pages */ } renderFoot(); scrollTo(0, 0);
  const f = $('#foot'); f.style.display = p === 'signup' || p === 'status' ? 'none' : ''; const nm = ME.company.name || 'The Umrah Store'; document.title = { signup: 'Become a partner | ' + nm, status: 'Application status | ' + nm, flights: Q.from.city + ' to ' + (Q.to ? Q.to.city : '') + ' flights | ' + nm, hotels: 'Hotels in ' + H.city + ' | ' + nm }[p] || INIT_TITLE;
}
addEventListener('hashchange', route);
(async function boot() {
  await loadMe(); renderNav(); route();
  const sp = new URLSearchParams(location.search); const pf = c => (c && /^[A-Za-z]{3}$/.test(c) && ((APS[c.toUpperCase()] && ap(c.toUpperCase())) || { code: c.toUpperCase(), city: c.toUpperCase(), name: '' })) || null; if (sp.get('from') || sp.get('to')) { const a = pf(sp.get('from')), b2 = pf(sp.get('to')); if (a) Q.from = a; if (b2) Q.to = b2; if (Q.from.code === (Q.to || {}).code) Q.from = ap('LHE'); history.replaceState(null, '', location.pathname + location.hash); if ((location.hash || '#/') === '#/') repaint(); }
  if (sp.get('login') && !ME.user) { history.replaceState(null, '', location.pathname + location.hash); openLogin(); }
  /* the server-rendered <title> is the SEO title: only retitle app screens, never the landing page */
})();
addEventListener('scroll', () => { const n = $('#nav'); n && n.classList.toggle('solid', scrollY > 40); }, { passive: true });
