'use strict';
/** Public, crawlable pages + SEO plumbing (meta, Open Graph, JSON-LD, sitemap, robots, manifest). */
const D = require('./db');
const { db, today } = D;
const Inv = require('./inventory');
const E = require('../public/engine.js');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = o => JSON.stringify(o).replace(/</g, '\\u003c');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fd = iso => { const d = new Date(iso + 'T00:00:00Z'); return DOW[d.getUTCDay()] + ', ' + String(d.getUTCDate()).padStart(2, '0') + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
const fnum = n => Math.round(+n || 0).toLocaleString('en-US');

const baseUrl = req => (db.settings.baseUrl || process.env.PUBLIC_URL || (req.protocol + '://' + req.get('host'))).replace(/\/+$/, '');
const co = () => db.settings.company;
const waNumber = () => String(co().phone || '').replace(/\D/g, '').replace(/^0/, '92');
const waLink = text => waNumber() ? 'https://wa.me/' + waNumber() + '?text=' + encodeURIComponent(text) : '';

const PAGES = {
  groups: { path: '/umrah-group-packages', title: 'Umrah Group Packages & Departures', h1: 'Umrah group packages', desc: 'Live Umrah group departures from Pakistan with airline, flight numbers, Makkah and Madinah hotels, room-wise prices and seats left. Book with The Umrah Store.', nav: 'Group packages' },
  flights: { path: '/umrah-flights', title: 'Flights to Jeddah & Madinah from Pakistan', h1: 'Flights to Jeddah and Madinah', desc: 'Compare airlines and book flights from Lahore, Karachi, Islamabad, Multan and more to Jeddah and Madinah. Live fares for travel agents, quotes for pilgrims.', nav: 'Flights' },
  hotels: { path: '/umrah-hotels', title: 'Makkah & Madinah Hotels for Umrah', h1: 'Makkah and Madinah hotels', desc: 'Hotels near Masjid al-Haram and Masjid an-Nabawi for Umrah: stars, distance to the Haram and room types. Get a quote from The Umrah Store.', nav: 'Hotels' },
  visa: { path: '/umrah-visa', title: 'Umrah Visa from Pakistan: Process & Rates', h1: 'Umrah visa from Pakistan', desc: 'How the Umrah visa works for Pakistani travellers: documents, processing, group rates and what is included. Apply through The Umrah Store.', nav: 'Visa' },
  calc: { path: '/umrah-package-calculator', title: 'Umrah Package Calculator: Instant Price', h1: 'Umrah package calculator', desc: 'Build your own Umrah package: pick Makkah and Madinah hotels, room type, dates, visa and private transport and see the price in SAR and PKR instantly.', nav: 'Calculator' },
  transport: { path: '/umrah-transport-booking', title: 'Umrah Transport Booking in Saudi Arabia', h1: 'Umrah transport booking', desc: 'Book private Umrah transport in Saudi Arabia: Jeddah airport transfers, Makkah-Madinah intercity, ziyarat tours. Sedans, vans, coasters and buses with fixed fares.', nav: 'Transport' },
  contact: { path: '/contact', title: 'Contact The Umrah Store - Lahore, Okara, Islamabad', h1: 'Contact us', desc: 'Call, WhatsApp or email The Umrah Store. Branches in Lahore, Okara and Islamabad. Umrah packages, flights, visas and transport.', nav: 'Contact' },
  faq: { path: '/umrah-faq', title: 'Umrah FAQ: Visa, Packages & Payments', h1: 'Umrah questions, answered', desc: 'Answers on Umrah visas, group packages, payments, flights and how booking with The Umrah Store works.', nav: 'FAQ', hidden: true }
};
const WEB_NAV = ['groups', 'flights', 'hotels', 'visa', 'calc', 'transport', 'contact'];

function shell(req, pg, { body, ld = [], extraHead = '', scripts = '', title, desc }) {
  const c = co(), base = baseUrl(req), url = base + pg.path, name = c.name || 'The Umrah Store';
  const t = title || pg.title, d = desc || pg.desc, wa = waLink('Assalam o Alaikum, I need help with Umrah booking');
  const org = { '@context': 'https://schema.org', '@type': 'TravelAgency', '@id': base + '/#org', name, url: base + '/', logo: base + '/brand/icon-512.png', image: base + '/brand/og-image.jpg', description: 'Premium Islamic travel: Umrah packages, group departures, visas, hotels and transport.', ...(c.phone ? { telephone: c.phone } : {}), ...(c.email ? { email: c.email } : {}), ...(c.address ? { address: { '@type': 'PostalAddress', streetAddress: c.address, addressCountry: 'PK' } } : {}), areaServed: ['PK', 'SA'], priceRange: '$$', contactPoint: { '@type': 'ContactPoint', contactType: 'customer service', ...(c.phone ? { telephone: c.phone } : {}), availableLanguage: ['en', 'ur'] }, location: ['Lahore', 'Okara', 'Islamabad'].map(x => ({ '@type': 'Place', name: name + ' ' + x, address: { '@type': 'PostalAddress', addressLocality: x, addressCountry: 'PK' } })) };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name, item: base + '/' }, { '@type': 'ListItem', position: 2, name: pg.nav, item: url }] };
  const nav = WEB_NAV.map(k => PAGES[k]).map(p => `<a href="${p.path}"${p.path === pg.path ? ' aria-current="page"' : ''}>${esc(p.nav)}</a>`).join('');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.includes(name) ? t : t + ' | ' + name)}</title>
<meta name="description" content="${esc(d)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta name="theme-color" content="#0a1a4a">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(name)}"><meta property="og:title" content="${esc(t)}"><meta property="og:description" content="${esc(d)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(base)}/brand/og-image.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:alt" content="${esc(name)} - Umrah packages, flights, visas and transport"><meta property="og:locale" content="en_PK"><meta name="author" content="${esc(name)}"><meta name="format-detection" content="telephone=yes">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(t)}"><meta name="twitter:description" content="${esc(d)}"><meta name="twitter:image" content="${esc(base)}/brand/og-image.jpg"><meta name="twitter:image:alt" content="${esc(name)}">
<link rel="icon" href="/brand/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/brand/icon-32.png"><link rel="apple-touch-icon" href="/brand/icon-180.png"><link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="image" href="/brand/logo-320.webp" type="image/webp">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/pub.css">
<script type="application/ld+json">${json(org)}</script><script type="application/ld+json">${json(crumbs)}</script>${ld.map(x => `<script type="application/ld+json">${json(x)}</script>`).join('')}${extraHead}
</head><body>
<a class="skip" href="#main">Skip to content</a>
<header class="hd"><div class="w hdi"><a class="lg" href="/" aria-label="${esc(name)} home"><picture><source srcset="/brand/logo-320.webp 1x,/brand/logo-640.webp 2x" type="image/webp"><img src="/brand/logo-320.png" width="45" height="50" alt="${esc(name)} logo"></picture><span><b>${esc(name)}</b><small>${esc(c.tagline || 'Premium Islamic Travel')}</small></span></a>
<nav class="nv" aria-label="Main">${nav}<a href="/" class="si">Agent login</a></nav>${wa ? `<a class="wa" href="${esc(wa)}" rel="noopener" target="_blank">WhatsApp</a>` : ''}</div></header>
<main id="main">${body}</main>
<footer class="ft"><div class="w"><div class="fg"><div><b>${esc(name)}</b><p>${esc(c.tagline || 'Premium Islamic Travel')}</p>${c.address ? `<p>${esc(c.address)}</p>` : ''}</div><div>${c.phone ? `<p>Phone / WhatsApp: <a href="tel:${esc(c.phone.replace(/[^+\d]/g, ''))}">${esc(c.phone)}</a></p>` : ''}${c.email ? `<p>Email: <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>` : ''}</div><div>${['groups', 'flights', 'hotels', 'visa', 'calc', 'transport', 'faq'].map(k => `<p><a href="${PAGES[k].path}">${esc(PAGES[k].h1)}</a></p>`).join('')}</div></div><p class="cp">&copy; ${new Date().getFullYear()} ${esc(name)}. Prices are indicative and confirmed by our team before booking.</p></div></footer>
${scripts}</body></html>`;
}

/* ---------- group packages (server-rendered for crawlers, enhanced by pub.js) ---------- */
function groupsPage(req) {
  const pg = PAGES.groups, t = today(), inv = Inv.publicSnapshot(), showP = !!inv.calc.publicPrices, base = baseUrl(req);
  const gs = db.groups.filter(g => g.dep >= t).sort((a, b) => (a.dep < b.dep ? -1 : 1));
  const from = g => { const v = g.pk.flatMap(k => Object.values(k.p)).filter(x => x > 0); return v.length ? Math.min(...v) : 0; };
  const leg = (l, lab) => `<div class="leg"><div class="lt"><b>${esc(l.from)}</b><span>${esc(l.dt)}</span></div><div class="ll"><i></i></div><div class="lt"><b>${esc(l.to)}</b><span>${esc(l.at)}</span></div><div class="lm"><b>${lab} ${esc(l.fn)}</b><span>${fd(l.date)}${l.bag ? ' · ' + l.bag + ' kg baggage' : ''}</span></div></div>`;
  const card = g => {
    const left = g.seats <= 0 ? '<span class="st out">Sold out</span>' : g.seats < 10 ? `<span class="st low">${g.seats} seats left</span>` : `<span class="st ok">${g.seats} seats</span>`;
    const hotels = g.pk.map(k => `<li><b>${esc(k.mk || '-')}</b> <span>${k.mkn} nights Makkah${k.mkd ? ' · ' + esc(k.mkd) : ''}</span> + <b>${esc(k.md || '-')}</b> <span>${k.mdn} nights Madinah${k.mdd ? ' · ' + esc(k.mdd) : ''}</span>${showP ? ` <em>from PKR ${fnum(Math.min(...Object.values(k.p).filter(x => x > 0)))}</em>` : ''}</li>`).join('');
    const msg = `Assalam o Alaikum, I am interested in the Umrah group departing ${g.dep} (${g.airline}, ${g.out.fn}). Please share details.`;
    return `<article class="gc" data-air="${esc(g.air)}" data-dep="${g.dep}" data-n="${g.n}"><div class="gd"><small>${MON[+g.dep.slice(5, 7) - 1]} ${g.dep.slice(0, 4)}</small><b>${g.dep.slice(8)}</b><span>${g.n} nights</span></div>
<div class="gb"><div class="gh"><div class="al"><span class="alogo"><b style="background:${E.airColor(g.air)}">${esc(g.air)}</b><img src="${E.airLogo(g.air)}" width="44" height="44" alt="${esc(g.airline)} logo" loading="lazy" decoding="async" onerror="this.remove()"></span><div><h2>${esc(g.airline)}</h2><p>Departs ${fd(g.dep)}</p></div></div>${left}${showP && from(g) ? `<div class="pr"><small>from</small><b>PKR ${fnum(from(g))}</b><small>per person</small></div>` : ''}</div>
<div class="legs">${leg(g.out, 'Outbound')}${leg(g.inb, 'Return')}</div><ul class="hl">${hotels}</ul><div class="ac"><button class="b pri" data-lead="group" data-ref="${esc(g.id)}" data-sum="${esc('Group ' + g.id + ' · ' + g.airline + ' · departs ' + g.dep + ' · ' + g.n + ' nights')}">${g.seats <= 0 ? 'Join waiting list' : 'Enquire now'}</button>${waLink(msg) ? `<a class="b" href="${esc(waLink(msg))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div></div></article>`;
  };
  const airs = [...new Set(gs.map(g => g.air))], months = [...new Set(gs.map(g => g.dep.slice(0, 7)))];
  const ld = [{ '@context': 'https://schema.org', '@type': 'ItemList', name: pg.h1, numberOfItems: gs.length, itemListElement: gs.slice(0, 50).map((g, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'TouristTrip', name: 'Umrah group ' + g.airline + ' departing ' + g.dep, description: g.n + ' nights Umrah with ' + g.airline + ' flights ' + g.out.fn + ' / ' + g.inb.fn + '. ' + g.pk.slice(0, 3).map(k => k.mk + ' / ' + k.md).join('; '), touristType: 'Umrah pilgrims', url: base + pg.path + '#' + g.id, provider: { '@type': 'TravelAgency', name: co().name }, ...(showP && from(g) ? { offers: { '@type': 'Offer', price: from(g), priceCurrency: 'PKR', availability: g.seats > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut', validThrough: g.dep } } : {}) } })) },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: 'How do Umrah group packages work?', acceptedAnswer: { '@type': 'Answer', text: 'Each group has a fixed departure date, airline and flights. You choose a Makkah and Madinah hotel combination and a room type (sharing, quad, triple or double) and the price is per person.' } },
      { '@type': 'Question', name: 'Are the seats shown live?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Seats left update as bookings are made and a group disappears automatically after its departure date.' } },
      { '@type': 'Question', name: 'How do I book?', acceptedAnswer: { '@type': 'Answer', text: 'Press Enquire now or message us on WhatsApp. Our team confirms availability and the final price before any payment.' } }] }];
  const body = `<section class="hero"><div class="w"><h1>${pg.h1}</h1><p class="lead">${gs.length ? gs.length + ' departures with ' + gs.reduce((a, g) => a + g.seats, 0) + ' seats available' : 'Departures are published as soon as they are confirmed'} - with real airline flights, Makkah and Madinah hotels and room-wise pricing.</p></div></section>
<section class="w sec"><div class="fl" id="gfilters" ${gs.length ? '' : 'hidden'}><label>Airline<select id="fAir"><option value="">All airlines</option>${airs.map(a => `<option value="${esc(a)}">${esc(E.airName(a, (gs.find(g => g.air === a) || {}).airline))} (${esc(a)})</option>`).join('')}</select></label><label>Month<select id="fMon"><option value="">Any month</option>${months.map(m => `<option value="${m}">${MON[+m.slice(5) - 1]} ${m.slice(0, 4)}</option>`).join('')}</select></label><label>Nights<select id="fN"><option value="">Any</option>${[...new Set(gs.map(g => g.n))].sort((a, b) => a - b).map(n => `<option>${n}</option>`).join('')}</select></label><label class="ck"><input type="checkbox" id="fSeats"> Only with seats</label></div>
<div id="glist">${gs.length ? gs.map(card).join('') : `<div class="em"><h2>No departures published right now</h2><p>Message us on WhatsApp and we will share the next available groups.</p></div>`}</div><p class="nr" id="gnone" hidden>No departures match these filters.</p></section>
<section class="w sec txt"><h2>Umrah group packages from Pakistan</h2><p>Group Umrah packages are the most economical way to perform Umrah: flights, visa, hotels and transport are booked together on a fixed departure date. ${esc(co().name || 'The Umrah Store')} lists every confirmed departure with the airline, the outbound and return flight numbers, the Makkah and Madinah hotels with their distance from the Haram, and the price for sharing, quad, triple and double rooms.</p><p>Need your own dates or a different hotel? Use the <a href="${PAGES.calc.path}">Umrah package calculator</a> or add private transfers with <a href="${PAGES.transport.path}">Umrah transport booking</a>.</p></section>
${leadDialog()}`;
  return shell(req, pg, { body, ld, scripts: '<script src="/pub.js" defer></script>' });
}

const leadDialog = () => `<dialog id="lead"><form method="dialog" id="leadf"><h2>Send enquiry</h2><p class="mut" id="leadsum"></p><label>Your name<input name="name" required autocomplete="name"></label><label>Phone / WhatsApp<input name="phone" required type="tel" autocomplete="tel" inputmode="tel"></label><label>Email (optional)<input name="email" type="email" autocomplete="email"></label><label>Message (optional)<textarea name="message" rows="2"></textarea></label><input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true"><p class="err" id="leaderr" role="alert"></p><div class="ac"><button type="button" class="b" id="leadx">Cancel</button><button class="b pri" id="leadgo">Send enquiry</button></div></form></dialog>`;

/* ---------- calculator ---------- */
function calcPage(req) {
  const pg = PAGES.calc, inv = Inv.publicSnapshot(), c = inv.calc;
  const ld = [{ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Umrah Package Calculator', url: baseUrl(req) + pg.path, applicationCategory: 'TravelApplication', operatingSystem: 'Any', description: pg.desc, offers: { '@type': 'Offer', price: '0', priceCurrency: 'PKR' } },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: 'How is the Umrah package price calculated?', acceptedAnswer: { '@type': 'Answer', text: 'Hotel rates are per night. Sharing rates are per person; every other room type is per room. Visa is charged per traveller on a tier that gets cheaper as the group grows, and the total is converted from Saudi riyals to Pakistani rupees at the current rate.' } },
      { '@type': 'Question', name: 'Are infants charged?', acceptedAnswer: { '@type': 'Answer', text: 'Infants do not take a bed so no hotel charge is added, but they are counted for the visa because a visa is issued per passport.' } },
      { '@type': 'Question', name: 'Is the calculator price final?', acceptedAnswer: { '@type': 'Answer', text: 'It is an instant estimate from our current rates. Our team confirms availability and the final price before you pay anything.' } }] }];
  const ready = inv.hotels.length && inv.visaTiers.length && c.pkrPerSar;
  const body = `<section class="hero"><div class="w"><h1>${pg.h1}</h1><p class="lead">Pick your hotels, dates, visa and transport. The price updates as you go, in Saudi riyals and Pakistani rupees.</p></div></section>
<section class="w sec"><div id="app" data-app="calc"><noscript><p class="em">Please enable JavaScript to use the calculator, or WhatsApp us your dates and we will quote you.</p></noscript>${ready ? '<div class="ld">Loading calculator…</div>' : '<div class="em"><h2>Calculator is being updated</h2><p>Our rates are being refreshed. Message us on WhatsApp for an instant quote.</p></div>'}</div></section>
<section class="w sec txt"><h2>How the Umrah package price is worked out</h2><p>Hotels are priced per night using the rate that applies on your check-in date. Sharing rooms are charged per person; double, triple, quad and quint rooms are charged per room. Umrah visa is priced per traveller, and the per-person visa fee drops as your group gets bigger. Add private transport between Jeddah, Makkah and Madinah and flights if you need them.</p><p>Looking for fixed-date departures instead? See our <a href="${PAGES.groups.path}">Umrah group packages</a>.</p></section>${leadDialog()}`;
  return shell(req, pg, { body, ld, scripts: ready ? '<script src="/engine.js"></script><script src="/pub.js" defer></script>' : '<script src="/pub.js" defer></script>' });
}

/* ---------- transport ---------- */
function transportPage(req) {
  const pg = PAGES.transport, inv = Inv.publicSnapshot(), c = inv.calc, base = baseUrl(req);
  const routes = inv.tRoutes.map(r => ({ r, opts: E.routeOptions(r.id, inv.tVehicles, inv.tPrices) })).filter(x => x.opts.length);
  const ld = [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Umrah transport routes', itemListElement: routes.slice(0, 50).map(({ r, opts }, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Service', name: r.origin + ' to ' + r.dest + ' transfer', serviceType: 'Umrah transport', areaServed: 'Saudi Arabia', provider: { '@type': 'TravelAgency', name: co().name }, offers: { '@type': 'AggregateOffer', priceCurrency: 'SAR', lowPrice: Math.min(...opts.map(o => o.amt)), highPrice: Math.max(...opts.map(o => o.amt)), offerCount: opts.length } } })) },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: 'How much is a Jeddah airport to Makkah transfer?', acceptedAnswer: { '@type': 'Answer', text: 'Fares are fixed per vehicle and route. Pick the route and vehicle in the booking tool to see the exact price in Saudi riyals and Pakistani rupees.' } },
      { '@type': 'Question', name: 'Can I book a return transfer?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Tick return trip and the reverse journey is added to the same booking.' } },
      { '@type': 'Question', name: 'What if I have more passengers than the vehicle standard capacity?', acceptedAnswer: { '@type': 'Answer', text: 'Some vehicles have a small extra-passenger charge beyond a threshold. It is added to the total automatically.' } }] }];
  const list = routes.length ? `<ul class="rl">${routes.map(({ r, opts }) => `<li><b>${esc(r.origin)} → ${esc(r.dest)}</b> <span>${esc(r.dur || '')}${r.km ? ' · ' + r.km + ' km' : ''}</span> <em>from SAR ${fnum(Math.min(...opts.map(o => o.amt)))}</em></li>`).join('')}</ul>` : '';
  const body = `<section class="hero"><div class="w"><h1>${pg.h1}</h1><p class="lead">Fixed fares for airport transfers, Makkah-Madinah intercity journeys and ziyarat tours. Choose a route, a vehicle and your date.</p></div></section>
<section class="w sec"><div id="app" data-app="transport"><noscript><p class="em">Please enable JavaScript to book online, or WhatsApp us your route and date.</p></noscript>${routes.length ? '<div class="ld">Loading transport booking…</div>' : '<div class="em"><h2>Transport fares are being updated</h2><p>Message us on WhatsApp for an instant quote.</p></div>'}</div>${list}</section>
<section class="w sec txt"><h2>Private transport for Umrah in Saudi Arabia</h2><p>We arrange sedans, family vans, coasters and buses with experienced drivers for Jeddah and Madinah airport transfers, Makkah to Madinah journeys and Makkah and Madinah ziyarat. Combine transport with a hotel quote in the <a href="${PAGES.calc.path}">Umrah package calculator</a>, or see ready-made <a href="${PAGES.groups.path}">Umrah group packages</a>.</p></section>${leadDialog()}`;
  return shell(req, pg, { body, ld, scripts: '<script src="/engine.js"></script><script src="/pub.js" defer></script>' });
}

/* ---------- sitemap / robots / manifest / index meta ---------- */
function sitemap(req) {
  const b = baseUrl(req), t = today(), urls = [['/', '1.0', 'weekly'], ...Object.values(PAGES).map(p => [p.path, p.path === PAGES.groups.path ? '0.9' : p.path === PAGES.contact.path || p.path === PAGES.faq.path ? '0.6' : '0.8', p.path === PAGES.groups.path ? 'daily' : 'weekly'])];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, p, f]) => `<url><loc>${esc(b + u)}</loc><lastmod>${t}</lastmod><changefreq>${f}</changefreq><priority>${p}</priority></url>`).join('\n')}\n</urlset>\n`;
}
const robots = req => `User-agent: *\nAllow: /\n${Object.values(PAGES).map(p => 'Allow: ' + p.path).join('\n')}\nDisallow: /api/\nDisallow: /v/\nDisallow: /pay/\nDisallow: /receipt\nDisallow: /receipts/\nDisallow: /payfast/\n\nSitemap: ${baseUrl(req)}/sitemap.xml\n`;
const manifest = req => ({ name: co().name || 'The Umrah Store', short_name: 'Umrah Store', description: 'Umrah packages, group departures, visas, hotels and transport.', start_url: '/', scope: '/', display: 'standalone', background_color: '#f3f6fc', theme_color: '#0a1a4a', lang: 'en', icons: [{ src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] });

/** SEO head + crawlable fallback for the app shell (index.html) */
function indexHtml(req, raw) {
  const c = co(), b = baseUrl(req), name = c.name || 'The Umrah Store', desc = 'Umrah group packages, hotels, visas, flights and private transport. Agents and suppliers sign in to manage bookings, vouchers and ledgers.';
  const org = { '@context': 'https://schema.org', '@graph': [{ '@type': 'TravelAgency', '@id': b + '/#org', name, url: b + '/', logo: b + '/brand/icon-512.png', image: b + '/brand/og-image.jpg', description: 'Premium Islamic travel: Umrah packages, group departures, visas, hotels and transport.', ...(c.phone ? { telephone: c.phone } : {}), ...(c.email ? { email: c.email } : {}), areaServed: ['PK', 'SA'] }, { '@type': 'WebSite', '@id': b + '/#site', url: b + '/', name, publisher: { '@id': b + '/#org' } }] };
  const head = `<title>${esc(name)} - Umrah Packages, Group Departures, Visas &amp; Transport</title>
<meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(b)}/"><meta name="robots" content="index,follow">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(name)}"><meta property="og:title" content="${esc(name)} - Umrah Packages &amp; Group Departures"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(b)}/"><meta property="og:image" content="${esc(b)}/brand/og-image.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(name)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(b)}/brand/og-image.jpg">
<link rel="icon" href="/brand/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/brand/icon-32.png"><link rel="apple-touch-icon" href="/brand/icon-180.png"><link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" as="image" href="/brand/logo-320.webp" type="image/webp">
<script type="application/ld+json">${json(org)}</script>`;
  const noscript = `<noscript><main style="font-family:system-ui;max-width:640px;margin:8vh auto;padding:18px"><h1>${esc(name)}</h1><p>${esc(desc)}</p><ul><li><a href="${PAGES.groups.path}">Umrah group packages</a></li><li><a href="${PAGES.calc.path}">Umrah package calculator</a></li><li><a href="${PAGES.transport.path}">Umrah transport booking</a></li></ul><p>Please enable JavaScript to sign in.</p></main></noscript>`;
  return raw.replace(/<title>[\s\S]*?<\/title>\s*<meta name="theme-color"[^>]*>\s*<link rel="icon"[^>]*>/, '<meta name="theme-color" content="#0a1a4a">\n' + head).replace('<div id="root">', noscript + '<div id="root">');
}


/* ---------- content pages (flights, hotels, visa, contact, faq) + landing page head ---------- */
const FAQS = {
  general: [
    ['What does The Umrah Store offer?', 'Umrah group packages, custom Umrah packages, flights to Jeddah and Madinah, Makkah and Madinah hotels, Umrah visas and private transport in Saudi Arabia. Travel agents get a B2B portal with their own ledger, vouchers and live fares.'],
    ['How do I book?', 'Send an enquiry on this website or WhatsApp us. Our team confirms availability and the final price before you pay anything. Registered travel agents can book directly from their agent account.'],
    ['How can I pay?', 'You can pay by bank transfer, JazzCash, Easypaisa or online by card, wallet and bank through PayFast. We send a payment link and issue a receipt for every payment.'],
    ['Is my booking confirmed instantly?', 'Bookings are confirmed after our team approves them and the suppliers confirm each service. You receive a voucher with a shareable link once it is approved.'],
    ['What are your office locations?', 'We have branches in Lahore, Okara and Islamabad. Call or WhatsApp the office to visit or to book remotely.']
  ],
  visa: [
    ['Which documents are needed for an Umrah visa?', 'A passport valid for at least six months, a clear passport-size photo with a white background and, for some travellers, vaccination proof. Women under a certain age may need a mahram. Our team checks the current rules for every booking.'],
    ['How long does the Umrah visa take?', 'Processing time depends on the season and the Saudi authorities. We tell you the expected time when you apply and keep you updated until the visa is issued.'],
    ['Is the visa included in group packages?', 'Yes. Group packages include the visa, flights, hotels and transport as listed on each departure.'],
    ['Can I get a visa without a package?', 'Yes. Ask for a visa-only quote. Group size changes the rate, so tell us how many travellers there are.']
  ],
  hotels: [
    ['Which hotels are closest to the Haram?', 'Each hotel lists its distance from Masjid al-Haram or Masjid an-Nabawi. Closer hotels cost more, so choose by walking distance and budget.'],
    ['What room types are available?', 'Sharing (per person), double, triple, quad and quint rooms depending on the hotel. Sharing is priced per person; other room types are priced per room.'],
    ['Can I choose the number of nights in Makkah and Madinah?', 'Yes. Use the Umrah package calculator to set nights for each city and see the price instantly.']
  ],
  flights: [
    ['Which cities do you fly from?', 'Lahore, Karachi, Islamabad, Multan, Peshawar, Sialkot and other Pakistani airports to Jeddah and Madinah, plus other worldwide routes on request.'],
    ['Are fares shown live?', 'Live fares are shown to registered travel agents. Pilgrims can send an enquiry and our desk replies with the best available fare and baggage details.'],
    ['Do you sell group seats?', 'Yes. Group departures list the airline, flight numbers, dates and seats left on the group packages page.']
  ]
};
const faqLd = list => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: list.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
const faqHtml = list => `<div class="faq">${list.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;
const ctaBlock = (title, text, kind, summary) => `<div class="cta2"><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div><div class="ac"><button class="b pri" data-lead="${kind}" data-sum="${esc(summary)}">Send enquiry</button>${waLink('Assalam o Alaikum, ' + summary) ? `<a class="b wa2" href="${esc(waLink('Assalam o Alaikum, ' + summary))}" target="_blank" rel="noopener">WhatsApp us</a>` : ''}</div></div>`;
const hero = (pg, lead, acts = '') => `<section class="hero"><div class="w"><div class="crumb"><a href="/">Home</a> / ${esc(pg.nav)}</div><h1>${esc(pg.h1)}</h1><p class="lead">${esc(lead)}</p>${acts ? `<div class="acts">${acts}</div>` : ''}</div></section>`;

const ROUTES = [['Lahore', 'LHE', 'Jeddah', 'JED'], ['Karachi', 'KHI', 'Jeddah', 'JED'], ['Islamabad', 'ISB', 'Jeddah', 'JED'], ['Multan', 'MUX', 'Jeddah', 'JED'], ['Peshawar', 'PEW', 'Jeddah', 'JED'], ['Sialkot', 'SKT', 'Jeddah', 'JED'], ['Lahore', 'LHE', 'Madinah', 'MED'], ['Karachi', 'KHI', 'Madinah', 'MED'], ['Islamabad', 'ISB', 'Madinah', 'MED']];

function flightsPage(req) {
  const pg = PAGES.flights, base = baseUrl(req);
  const cards = ROUTES.map(r => `<a class="ic2" href="/?from=${r[1]}&amp;to=${r[3]}" style="text-decoration:none"><span class="tag">${r[1]} to ${r[3]}</span><h3>${r[0]} to ${r[2]} flights</h3><p>Compare airlines, timings and baggage for Umrah travel.</p></a>`).join('');
  const ld = [faqLd(FAQS.flights), { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Umrah flight routes from Pakistan', itemListElement: ROUTES.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: r[0] + ' to ' + r[2] + ' flights', url: base + '/?from=' + r[1] + '&to=' + r[3] })) }];
  const body = hero(pg, 'Flights from Pakistan to Jeddah and Madinah for Umrah. Registered agents see live fares; pilgrims get a quote from our desk.', '<a class="b pri" href="/">Search live fares</a><a class="b" href="/#/signup">Become a partner</a>') +
`<section class="w sec"><h2 style="font:800 22px var(--sans);margin-bottom:12px">Popular Umrah routes</h2><div class="cards">${cards}</div></section>
<section class="w sec txt"><h2>Book Umrah flights with confidence</h2><p>Most pilgrims fly into Jeddah (JED) for Makkah or into Madinah (MED) when starting with the Prophet's Mosque. Direct flights are available from the major Pakistani cities and one-stop options are often cheaper in peak season. Baggage allowance, flight times and fare rules differ by airline, so we confirm every detail before you pay.</p><p>Travel agents can sign in to the agent portal for live airline fares, cabin and baggage options, layover details and instant requests to our desk. Everything posts to your own ledger automatically.</p></section>
<section class="w sec txt"><h2>Flight FAQs</h2>${faqHtml(FAQS.flights)}</section>
<div class="w">${ctaBlock('Need a fare for your dates?', 'Tell us the route, dates and number of travellers and we will reply with the best fare.', 'flight', 'Flight enquiry from the website')}</div>${leadDialog()}`;
  return shell(req, pg, { body, ld, scripts: '<script src="/pub.js" defer></script>' });
}

function hotelsPage(req) {
  const pg = PAGES.hotels, inv = Inv.publicSnapshot();
  const by = c => inv.hotels.filter(h => h.city === c);
  const card = h => `<div class="ic2"><span class="tag">${h.city === 'MADINAH' ? 'Madinah' : 'Makkah'}${h.area ? ' · ' + esc(h.area) : ''}</span><h3>${esc(h.name)}</h3>${h.stars ? `<span class="stars" aria-label="${h.stars} star hotel">${'&#9733;'.repeat(h.stars)}</span>` : ''}<p>${h.dist ? esc(h.dist) + ' from the ' + (h.city === 'MADINAH' ? 'Prophet\'s Mosque' : 'Haram') : 'Close to the Haram area'}${h.rooms && h.rooms.length ? ' · ' + h.rooms.length + ' room type' + (h.rooms.length > 1 ? 's' : '') : ''}</p><button class="b" data-lead="hotel" data-sum="${esc('Hotel enquiry: ' + h.name + ' (' + h.city + ')')}">Get a quote</button></div>`;
  const sect = (t, a) => a.length ? `<section class="w sec"><h2 style="font:800 22px var(--sans);margin-bottom:12px">${t}</h2><div class="cards">${a.map(card).join('')}</div></section>` : '';
  const ld = [faqLd(FAQS.hotels), ...(inv.hotels.length ? [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Umrah hotels', itemListElement: inv.hotels.slice(0, 40).map((h, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Hotel', name: h.name, address: { '@type': 'PostalAddress', addressLocality: h.city === 'MADINAH' ? 'Madinah' : 'Makkah', addressCountry: 'SA' }, ...(h.stars ? { starRating: { '@type': 'Rating', ratingValue: h.stars } } : {}) } })) }] : [])];
  const body = hero(pg, 'Stay close to Masjid al-Haram and Masjid an-Nabawi. Choose by stars, walking distance and room type, then price the whole trip in the calculator.', `<a class="b pri" href="${PAGES.calc.path}">Price my trip</a>`) +
    (sect('Makkah hotels', by('MAKKAH')) + sect('Madinah hotels', by('MADINAH')) || `<section class="w sec"><div class="em"><h2>Hotel list is being updated</h2><p>Message us your dates and budget and we will send the best options near the Haram.</p></div></section>`) +
`<section class="w sec txt"><h2>Choosing an Umrah hotel</h2><p>The walking distance to the Haram matters most for elderly pilgrims and families. Hotels in towers close to the Haram cost more per night; hotels a short shuttle away are cheaper. In Madinah, the area around the Prophet's Mosque is compact, so even mid-range hotels are an easy walk.</p><p>Use our <a href="${PAGES.calc.path}">Umrah package calculator</a> to combine hotels, visa and transport, or send an enquiry and our team will propose a package.</p></section>
<section class="w sec txt"><h2>Hotel FAQs</h2>${faqHtml(FAQS.hotels)}</section><div class="w">${ctaBlock('Want help choosing?', 'Tell us dates, group size and budget. We reply with hotel options and a price.', 'hotel', 'Hotel enquiry from the website')}</div>${leadDialog()}`;
  return shell(req, pg, { body, ld, scripts: '<script src="/pub.js" defer></script>' });
}

function visaPage(req) {
  const pg = PAGES.visa, inv = Inv.publicSnapshot(), showP = !!inv.calc.publicPrices;
  const tiers = inv.visaTiers.map(t => `<div class="ic2"><span class="tag">${esc(t.type || 'Umrah visa')}</span><h3>${esc(t.label || (t.min + (t.max == null ? '+' : ' to ' + t.max) + ' travellers'))}</h3><p>${t.min}${t.max == null ? '+' : ' to ' + t.max} travellers</p>${showP ? `<div class="pr2">SAR ${fnum(t.amt)} <small style="font-size:12px;color:var(--mute)">per person</small></div>` : '<p>Ask us for today\'s rate.</p>'}</div>`).join('');
  const steps = [['Send passports', 'Share clear passport scans and photos on WhatsApp or through your agent account.'], ['We check and submit', 'Our team verifies the documents and submits the visa application.'], ['Receive your visa', 'You get the visa copy and travel voucher before departure.']];
  const ld = [faqLd(FAQS.visa), { '@context': 'https://schema.org', '@type': 'Service', name: 'Umrah visa processing', serviceType: 'Umrah visa', provider: { '@type': 'TravelAgency', name: co().name || 'The Umrah Store', url: baseUrl(req) + '/' }, areaServed: 'PK', description: pg.desc }];
  const body = hero(pg, 'Visa processing for individuals, families and groups, handled by a team that does it every day.', '<button class="b pri" data-lead="visa" data-sum="Umrah visa enquiry from the website">Apply for a visa</button>') +
`<section class="w sec"><h2 style="font:800 22px var(--sans);margin-bottom:12px">How it works</h2><div class="cards">${steps.map((x, i) => `<div class="ic2"><span class="tag">Step ${i + 1}</span><h3>${x[0]}</h3><p>${x[1]}</p></div>`).join('')}</div></section>
${tiers ? `<section class="w sec"><h2 style="font:800 22px var(--sans);margin:10px 0 12px">Visa rates by group size</h2><div class="cards">${tiers}</div></section>` : ''}
<section class="w sec txt"><h2>Umrah visa from Pakistan: what to know</h2><p>You need a passport valid for at least six months and a recent photo. Visa rules and processing times are set by the Saudi authorities and can change, so we confirm the latest requirements for each application. Group size can change the per-person visa rate.</p></section>
<section class="w sec txt"><h2>Visa FAQs</h2>${faqHtml(FAQS.visa)}</section><div class="w">${ctaBlock('Ready to apply?', 'Send your details and our visa desk will contact you.', 'visa', 'Umrah visa enquiry from the website')}</div>${leadDialog()}`;
  return shell(req, pg, { body, ld, scripts: '<script src="/pub.js" defer></script>' });
}

function contactPage(req) {
  const pg = PAGES.contact, c = co(), base = baseUrl(req), tel = String(c.phone || '').replace(/[^+\d]/g, '');
  const ld = [{ '@context': 'https://schema.org', '@type': 'ContactPage', name: pg.title, url: base + pg.path, mainEntity: { '@id': base + '/#org' } }];
  const body = hero(pg, 'Talk to a real person. We reply on WhatsApp fastest.') +
`<section class="w sec"><div class="cards">${tel ? `<div class="ic2"><span class="tag">Phone</span><h3><a href="tel:${esc(tel)}">${esc(c.phone)}</a></h3><p>Call the main office.</p></div>` : ''}${waLink('Assalam o Alaikum') ? `<div class="ic2"><span class="tag">WhatsApp</span><h3><a href="${esc(waLink('Assalam o Alaikum, I need help with Umrah booking'))}" target="_blank" rel="noopener">Chat on WhatsApp</a></h3><p>Fastest way to get a quote.</p></div>` : ''}${c.email ? `<div class="ic2"><span class="tag">Email</span><h3><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></h3><p>For documents and agent enquiries.</p></div>` : ''}<div class="ic2"><span class="tag">Branches</span><h3>Lahore · Okara · Islamabad</h3><p>${esc(c.address || 'Visit any of our offices.')}</p></div></div></section>
<section class="w sec txt"><h2>Questions</h2>${faqHtml(FAQS.general)}</section><div class="w">${ctaBlock('Send us your plan', 'Share dates, travellers and budget. We will reply with options.', 'contact', 'General enquiry from the website')}</div>${leadDialog()}`;
  return shell(req, pg, { body, ld, scripts: '<script src="/pub.js" defer></script>' });
}

function faqPage(req) {
  const pg = PAGES.faq, all = [...FAQS.general, ...FAQS.visa, ...FAQS.hotels, ...FAQS.flights];
  const body = hero(pg, 'Quick answers on visas, packages, hotels, flights and payments.') + `<section class="w sec txt">${faqHtml(all)}</section><div class="w">${ctaBlock('Still have a question?', 'Ask our team directly.', 'contact', 'Question from the FAQ page')}</div>${leadDialog()}`;
  return shell(req, pg, { body, ld: [faqLd(all)], scripts: '<script src="/pub.js" defer></script>' });
}

/** Landing page (agent portal) head: full SEO + social preview + crawlable fallback content. */
function portalHtml(req, raw) {
  const c = co(), b = baseUrl(req), name = c.name || 'The Umrah Store';
  const t = name + ' | Umrah Packages, Flights & Agent Portal';
  const d = 'Umrah group packages, flights to Jeddah and Madinah, Makkah and Madinah hotels, visas and transport from Pakistan. Travel agents: live airline fares, ledger and vouchers in one B2B portal. Lahore, Okara, Islamabad.';
  const org = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'TravelAgency', '@id': b + '/#org', name, url: b + '/', logo: b + '/brand/icon-512.png', image: b + '/brand/og-image.jpg', description: d, ...(c.phone ? { telephone: c.phone } : {}), ...(c.email ? { email: c.email } : {}), areaServed: ['PK', 'SA'], priceRange: '$$', contactPoint: { '@type': 'ContactPoint', contactType: 'customer service', ...(c.phone ? { telephone: c.phone } : {}), availableLanguage: ['en', 'ur'] }, location: ['Lahore', 'Okara', 'Islamabad'].map(x => ({ '@type': 'Place', name: name + ' ' + x, address: { '@type': 'PostalAddress', addressLocality: x, addressCountry: 'PK' } })) },
    { '@type': 'WebSite', '@id': b + '/#site', url: b + '/', name, inLanguage: 'en', publisher: { '@id': b + '/#org' } },
    { '@type': 'WebPage', '@id': b + '/#home', url: b + '/', name: t, isPartOf: { '@id': b + '/#site' }, about: { '@id': b + '/#org' }, primaryImageOfPage: { '@type': 'ImageObject', url: b + '/brand/og-image.jpg', width: 1200, height: 630 } }] };
  const head = `<title>${esc(t)}</title>
<meta name="description" content="${esc(d)}">
<meta name="keywords" content="Umrah packages, Umrah group packages Pakistan, flights to Jeddah, Madinah flights, Umrah visa, Makkah hotels, travel agent portal, B2B flights Pakistan, The Umrah Store">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<meta name="theme-color" content="#0a1a4a"><meta name="author" content="${esc(name)}"><meta name="format-detection" content="telephone=yes">
<link rel="canonical" href="${esc(b)}/">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(name)}"><meta property="og:locale" content="en_PK"><meta property="og:title" content="${esc(t)}"><meta property="og:description" content="${esc(d)}"><meta property="og:url" content="${esc(b)}/"><meta property="og:image" content="${esc(b)}/brand/og-image.jpg"><meta property="og:image:secure_url" content="${esc(b)}/brand/og-image.jpg"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(name)} - Umrah packages, flights, visas and transport">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(t)}"><meta name="twitter:description" content="${esc(d)}"><meta name="twitter:image" content="${esc(b)}/brand/og-image.jpg"><meta name="twitter:image:alt" content="${esc(name)}">
<link rel="icon" href="/brand/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/brand/icon-32.png"><link rel="apple-touch-icon" href="/brand/icon-180.png"><link rel="manifest" href="/manifest.webmanifest">
<script type="application/ld+json">${json(org)}</script><script type="application/ld+json">${json(faqLd(FAQS.general))}</script>`;
  const links = ['groups', 'flights', 'hotels', 'visa', 'calc', 'transport', 'contact', 'faq'].map(k => `<li><a href="${PAGES[k].path}">${esc(PAGES[k].h1)}</a></li>`).join('');
  const seo = `<section class="seo" aria-label="About ${esc(name)}"><div class="seoin"><h2>${esc(name)}: Umrah packages, flights and agent portal</h2><p>${esc(d)}</p><ul>${links}</ul></div></section>`;
  const nos = `<noscript><main style="font-family:system-ui;max-width:680px;margin:8vh auto;padding:18px;color:#fff"><h1>${esc(name)}</h1><p>${esc(d)}</p><ul>${links}</ul><p>Please enable JavaScript to use the agent portal.</p></main></noscript>`;
  return raw.replace(/<title>[\s\S]*?<link rel="manifest"[^>]*>/, head).replace(/<noscript>[\s\S]*?<\/noscript>/, nos).replace('<footer id="foot"></footer>', seo + '<footer id="foot"></footer>').replace(/__BASE__/g, b);
}

const notFoundPage = req => shell(req, { path: '/404', title: 'Page not found', nav: 'Not found', h1: 'Page not found', desc: 'This page does not exist.' }, { title: 'Page not found', desc: 'This page does not exist.', body: `<section class="hero"><div class="w"><h1>Page not found</h1><p class="lead">The page you are looking for has moved or does not exist.</p><div class="acts"><a class="b pri" href="/">Go home</a><a class="b" href="${PAGES.contact.path}">Contact us</a></div></div></section><section class="w sec txt"><h2>Popular pages</h2><div class="chips">${WEB_NAV.map(k => `<a href="${PAGES[k].path}">${esc(PAGES[k].h1)}</a>`).join('')}</div></section>`, extraHead: '<meta name="robots" content="noindex">' }).replace('<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">', '<meta name="robots" content="noindex">');

module.exports = { PAGES, WEB_NAV, flightsPage, hotelsPage, visaPage, contactPage, faqPage, portalHtml, notFoundPage, groupsPage, calcPage, transportPage, sitemap, robots, manifest, indexHtml, baseUrl, esc };
