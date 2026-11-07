'use strict';
/**
 * Public website layer: header / navigation / footer shell, homepage, hotel list + detail, agent login, booking tracking.
 * Everything here reads the real CRM data (groups, promotions, hotels, settings). Nothing is mocked: if a section has no data it is hidden or shows an honest empty state.
 */
const D = require('./db');
const { db, today } = D;
const Inv = require('./inventory');
const E = require('../public/engine.js');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = o => JSON.stringify(o).replace(/</g, '\\u003c');
const fnum = n => Math.round(+n || 0).toLocaleString('en-US');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const co = () => db.settings.company || {};
const waNumber = () => String(co().whatsapp || co().phone || '').replace(/\D/g, '').replace(/^0/, '92');
const waLink = text => (waNumber() ? 'https://wa.me/' + waNumber() + '?text=' + encodeURIComponent(text) : '');
const telOf = s => String(s || '').replace(/[^+\d]/g, '');

/* ---------- icons (inline SVG, no external requests) ---------- */
const ICONS = {
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  bed: '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  doc: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  bus: '<path d="M8 6v6M16 6v6M2 12h20"/><path d="M7 18H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14c2.5 0 3.5 1.5 4 4l1 4v3a2 2 0 0 1-2 2h-1"/><circle cx="8" cy="18" r="2"/><circle cx="16" cy="18" r="2"/>',
  calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M9.9 4.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="m2 2 20 20"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  headset: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-2 2z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  track: '<path d="M21 10V8l-9-5-9 5v8l9 5"/><circle cx="17" cy="17" r="3"/><path d="m21 21-1.9-1.9"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  bank: '<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-7 10 7"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v3a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-3a3 3 0 0 1 0-6V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/><path d="M13 5v14" stroke-dasharray="2 3"/>',
  map: '<path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2z"/><path d="M9 3v16M15 5v16"/>'
};
const ic = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true" focusable="false" viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`;

/* ---------- navigation model (every link points at a real route) ---------- */
const NAV_MAIN = ['groups', 'offers', 'hotels', 'flights'];
const NAV_SERVICES = [['visa', 'doc', 'Umrah visa processing for individuals and groups'], ['transport', 'bus', 'Airport, intercity and ziyarat transport'], ['calc', 'calc', 'Price your own Umrah package instantly']];
const PORTAL_LINKS = [
  ['/agent-login', 'lock', 'Agent login', 'Sign in to your agent account'],
  ['/agent-portal', 'plane', 'Agent portal', 'Live airline fares and B2B tools'],
  ['/agent-portal#/signup', 'users', 'Become an agent', 'Apply for a partner account'],
  ['/agent-portal#/status', 'clock', 'Application status', 'Check your partner application'],
  ['/track-booking', 'track', 'Track a booking', 'Customers: booking status and voucher'],
  ['/bank-accounts', 'bank', 'Bank accounts', 'Official payment details']
];

function makeShell({ PAGES, baseUrl }) {
  const faqLd = list => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: list.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });

  function header(pg, name, c) {
    const cur = p => (pg.path === p || (p !== '/' && pg.path.startsWith(p + '/')) ? ' aria-current="page"' : '');
    const A = k => `<a href="${PAGES[k].path}"${cur(PAGES[k].path)}>${esc(PAGES[k].nav)}</a>`;
    const svc = NAV_SERVICES.map(([k, i, d]) => `<a href="${PAGES[k].path}" role="menuitem">${ic(i)}<div><b>${esc(PAGES[k].nav)}</b><span>${esc(d)}</span></div></a>`).join('');
    const por = PORTAL_LINKS.map(([h, i, t, d]) => `<a href="${h}" role="menuitem">${ic(i)}<div><b>${esc(t)}</b><span>${esc(d)}</span></div></a>`).join('');
    const dd = (id, label, items) => `<div class="dd"><button type="button" aria-haspopup="true" aria-expanded="false" aria-controls="${id}">${label}${ic('chev')}</button><div class="dm" id="${id}" role="menu">${items}</div></div>`;
    const tel = telOf(c.phone), top = [tel ? `<a href="tel:${esc(tel)}">${ic('phone', 'sm')}${esc(c.phone)}</a>` : '', c.email ? `<a class="ml" href="mailto:${esc(c.email)}">${ic('mail', 'sm')}${esc(c.email)}</a>` : ''].join('');
    const drawer = `<div class="dr" id="drawer" aria-hidden="true"><div class="bd" data-close></div><div class="pn" role="dialog" aria-modal="true" aria-label="Menu"><div class="ph"><a class="lg" href="/"><b>${esc(name)}</b></a><button type="button" class="x" data-close aria-label="Close menu">${ic('x')}</button></div>
<a class="m" href="/"${pg.path === '/' ? ' aria-current="page"' : ''}>${ic('moon')}Home</a>${[...NAV_MAIN].map(k => `<a class="m" href="${PAGES[k].path}"${cur(PAGES[k].path)}>${ic({ groups: 'layers', offers: 'tag', hotels: 'bed', flights: 'plane' }[k])}${esc(PAGES[k].nav)}</a>`).join('')}
<h4>Services</h4>${NAV_SERVICES.map(([k, i]) => `<a class="m" href="${PAGES[k].path}"${cur(PAGES[k].path)}>${ic(i)}${esc(PAGES[k].nav)}</a>`).join('')}
<h4>Portals</h4>${PORTAL_LINKS.map(([h, i, t]) => `<a class="m" href="${h}">${ic(i)}${esc(t)}</a>`).join('')}
<h4>Help</h4><a class="m" href="${PAGES.contact.path}"${cur(PAGES.contact.path)}>${ic('phone')}Contact us</a><a class="m" href="${PAGES.faq.path}">${ic('help')}FAQ</a>
<div class="cta"><a class="b pri lg" href="/agent-login">${ic('lock')}Agent login</a><a class="b lg" href="/track-booking">${ic('track')}Track booking</a>${waLink('Assalam o Alaikum, I need help with Umrah booking') ? `<a class="b wa2 lg" href="${esc(waLink('Assalam o Alaikum, I need help with Umrah booking'))}" target="_blank" rel="noopener">${ic('chat')}WhatsApp</a>` : ''}</div></div></div>`;
    return `<div class="tb"><div class="w tbi">${top}<span class="sp"></span><span class="tl"><a href="/agent-portal">Agent portal</a><a href="/agent-login">Agent login</a><a class="x" href="/track-booking">Track booking</a><a class="x" href="${PAGES.contact.path}">Contact</a></span></div></div>
<header class="hd" id="hd"><div class="w hdi"><a class="lg" href="/" aria-label="${esc(name)} home"><picture><source srcset="/brand/logo-320.webp 1x,/brand/logo-640.webp 2x" type="image/webp"><img src="/brand/logo-320.png" width="48" height="50" alt=""></picture><span><b>${esc(name)}</b><small>${esc(c.tagline || 'Premium Islamic Travel')}</small></span></a>
<nav class="nv" aria-label="Main">${NAV_MAIN.map(A).join('')}${dd('dm-svc', 'Services', svc)}${dd('dm-por', 'Portals', por)}</nav>
<div class="hcta"><a class="b sm o" href="/track-booking">${ic('track', 'sm')}Track booking</a><a class="b pri sm" href="/agent-login">${ic('lock', 'sm')}Agent login</a></div>
<button type="button" class="bg" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="drawer">${ic('menu', 'lg')}</button></div></header>${drawer}`;
  }

  function footer(name, c) {
    const tel = telOf(c.phone), wa = waLink('Assalam o Alaikum, I need help with Umrah booking');
    const ex = ['groups', 'offers', 'hotels', 'flights', 'visa', 'transport', 'calc'].map(k => `<li><a href="${PAGES[k].path}">${esc(PAGES[k].nav)}</a></li>`).join('');
    const por = PORTAL_LINKS.map(([h, , t]) => `<li><a href="${h}">${esc(t)}</a></li>`).join('');
    return `<footer class="ft"><div class="w"><div class="fg"><div><div class="br"><img src="/brand/logo-320.png" width="58" height="62" alt="" loading="lazy"><b>${esc(name)}</b></div><p>${esc(c.tagline || 'Premium Islamic Travel')}. Umrah packages, group departures, visas, hotels, flights and private transport.</p>${c.address ? `<p>${esc(c.address)}</p>` : ''}<p>Branches: Lahore · Okara · Islamabad</p></div>
<div><h4>Explore</h4><ul>${ex}</ul></div><div><h4>Portals</h4><ul>${por}</ul></div>
<div><h4>Contact</h4>${tel ? `<div class="ci">${ic('phone', 'sm')}<a href="tel:${esc(tel)}">${esc(c.phone)}</a></div>` : ''}${wa ? `<div class="ci">${ic('chat', 'sm')}<a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp us</a></div>` : ''}${c.email ? `<div class="ci">${ic('mail', 'sm')}<a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}<ul style="margin-top:14px"><li><a href="${PAGES.contact.path}">Contact page</a></li><li><a href="${PAGES.faq.path}">FAQ</a></li></ul></div></div>
<div class="cp"><span>&copy; ${new Date().getFullYear()} ${esc(name)}. Prices are indicative and confirmed by our team before booking.</span><span><a href="/agent-login">Agent login</a> · <a href="/track-booking">Track booking</a> · <a href="/sitemap.xml">Sitemap</a></span></div></div></footer>`;
  }

  function shell(req, pg, { body, ld = [], extraHead = '', scripts = '', title, desc, noindex, image }) {
    const c = co(), base = baseUrl(req), url = base + (pg.path === '/' ? '/' : pg.path), name = c.name || 'The Umrah Store';
    const t = title || pg.title, d = desc || pg.desc, img = image ? (/^https?:/.test(image) ? image : base + image) : base + '/brand/og-image.jpg';
    const org = { '@context': 'https://schema.org', '@type': 'TravelAgency', '@id': base + '/#org', name, url: base + '/', logo: base + '/brand/icon-512.png', image: base + '/brand/og-image.jpg', description: 'Premium Islamic travel: Umrah packages, group departures, visas, hotels and transport.', ...(c.phone ? { telephone: c.phone } : {}), ...(c.email ? { email: c.email } : {}), ...(c.address ? { address: { '@type': 'PostalAddress', streetAddress: c.address, addressCountry: 'PK' } } : {}), areaServed: ['PK', 'SA'], priceRange: '$$', contactPoint: { '@type': 'ContactPoint', contactType: 'customer service', ...(c.phone ? { telephone: c.phone } : {}), availableLanguage: ['en', 'ur'] }, location: ['Lahore', 'Okara', 'Islamabad'].map(x => ({ '@type': 'Place', name: name + ' ' + x, address: { '@type': 'PostalAddress', addressLocality: x, addressCountry: 'PK' } })) };
    const crumbItems = [{ '@type': 'ListItem', position: 1, name, item: base + '/' }];
    (pg.crumbs || (pg.path === '/' ? [] : [[pg.nav, pg.path]])).forEach(([n, p], i) => crumbItems.push({ '@type': 'ListItem', position: i + 2, name: n, item: base + p }));
    const jl = [org, ...(crumbItems.length > 1 ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbItems }] : []), ...(pg.path === '/' ? [{ '@context': 'https://schema.org', '@type': 'WebSite', '@id': base + '/#site', url: base + '/', name, inLanguage: 'en', publisher: { '@id': base + '/#org' } }] : []), ...ld];
    const sc = String(scripts).replace('<script src="/pub.js" defer></script>', '');
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(t.includes(name) ? t : t + ' | ' + name)}</title>
<meta name="description" content="${esc(d)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1'}">
<meta name="theme-color" content="#0b5d2e">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(name)}"><meta property="og:title" content="${esc(t)}"><meta property="og:description" content="${esc(d)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(img)}"><meta property="og:image:alt" content="${esc(name)} - Umrah packages, flights, visas and transport"><meta property="og:locale" content="en_PK"><meta name="author" content="${esc(name)}"><meta name="format-detection" content="telephone=yes">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(t)}"><meta name="twitter:description" content="${esc(d)}"><meta name="twitter:image" content="${esc(img)}">
<link rel="icon" href="/brand/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/brand/icon-32.png"><link rel="apple-touch-icon" href="/brand/icon-180.png"><link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="image" href="/brand/logo-320.webp" type="image/webp">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/pub.css">
${jl.map(x => `<script type="application/ld+json">${json(x)}</script>`).join('')}${extraHead}
</head><body>
<a class="skip" href="#main">Skip to content</a>
${header(pg, name, c)}
<main id="main">${body}</main>
${footer(name, c)}
<script src="/chat.js" defer></script>${sc}<script src="/pub.js" defer></script></body></html>`;
  }
  return { shell, faqLd };
}

/* ---------- shared bits ---------- */
const lowestRate = h => { const v = (h.rooms || []).flatMap(r => (r.rates || []).map(x => +x.amt)).filter(x => x > 0); return v.length ? Math.min(...v) : 0; };
const distM = s => { const m = /([\d.,]+)\s*(km|m)\b/i.exec(String(s || '')); if (!m) return 0; const n = parseFloat(m[1].replace(',', '.')); return /km/i.test(m[2]) ? Math.round(n * 1000) : Math.round(n); };
const cityName = c => (c === 'MADINAH' ? 'Madinah' : 'Makkah');
const holy = c => (c === 'MADINAH' ? "Prophet's Mosque" : 'Haram');

function hotelCardHtml(h, showP) {
  const cover = (h.photos || [])[0], low = lowestRate(h), fac = (h.facilities || []).slice(0, 3);
  const media = cover ? `<div class="im"><img src="${esc(cover.url)}" alt="${esc(cover.alt || h.name + ' - ' + cityName(h.city))}" width="640" height="400" loading="lazy" decoding="async"></div>` : `<div class="im ph"><span class="ico">${ic('bed')}</span></div>`;
  return `<a class="hc" href="/umrah-hotels/${esc(h.slug)}" data-city="${h.city}" data-stars="${h.stars || 0}" data-name="${esc((h.name + ' ' + (h.area || '') + ' ' + cityName(h.city)).toLowerCase())}" data-dist="${distM(h.dist) || ''}" data-price="${showP && low ? low : ''}" data-order="${esc(h.order || 0)}">
${media.replace('</div>', `<span class="bd">${ic('pin', 'sm')}${cityName(h.city)}</span>${showP && low ? `<span class="pc">from <b>SAR ${fnum(low)}</b> / night</span>` : ''}</div>`)}
<div class="bx"><h3>${esc(h.name)}</h3>${h.stars ? `<span class="stars" role="img" aria-label="${h.stars} star hotel">${'&#9733;'.repeat(h.stars)}</span>` : ''}
<div class="loc">${ic('pin')}${h.dist ? esc(h.dist) + ' from the ' + holy(h.city) : esc(h.area || 'Close to the ' + holy(h.city))}</div>${fac.length ? `<div class="fc">${fac.map(f => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
<div class="ft2"><span class="mut">${(h.rooms || []).length} room type${(h.rooms || []).length === 1 ? '' : 's'}</span><span class="go" style="color:var(--em7);font-weight:800;display:inline-flex;gap:6px;align-items:center">View &amp; book ${ic('arrow', 'sm')}</span></div></div></a>`;
}

module.exports = { esc, json, fnum, MON, MONL, co, waLink, telOf, ICONS, ic, makeShell, lowestRate, distM, cityName, holy, hotelCardHtml, NAV_MAIN, NAV_SERVICES, PORTAL_LINKS };
