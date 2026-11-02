'use strict';
const QRCode = require('qrcode');
const D = require('./db');
const { db, party } = D;
const L = require('./ledger');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fd = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); if (!y) return ''; return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${String(d).padStart(2, '0')} ${MON[m - 1]} ${y}`; };
const fdt = iso => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: db.settings.tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch { return iso; } };
const money = n => 'PKR ' + Math.round(+n || 0).toLocaleString('en-US');
const nights = (a, b) => { if (!a || !b) return 0; const t = x => { const [y, m, d] = x.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.max(0, Math.round((t(b) - t(a)) / 864e5)); };
const logoUrl = () => '/brand/logo?v=' + (db.settings.logoV || 0);
const origin = req => db.settings.baseUrl || (req.protocol + '://' + req.get('host'));

const CSS = `
:root{--g9:#073526;--g7:#126047;--g5:#1f9a70;--au:#b8902f;--au2:#e9d9a6;--ink:#13201a;--mute:#66736c;--line:#e3e0d5;--bg:#eceae2;--red:#b42318}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Manrope','Segoe UI',system-ui,-apple-system,Roboto,Arial,sans-serif;color:var(--ink);background:var(--bg);font-size:12.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar{position:sticky;top:0;z-index:9;background:#fff;border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.bar b{margin-right:auto;font-size:13px}.bar button,.bar a{border:1px solid var(--line);background:#fff;border-radius:9px;padding:8px 14px;font:600 12.5px inherit;cursor:pointer;color:var(--ink);text-decoration:none}
.bar .pri{background:var(--g9);border-color:var(--g9);color:#fff}
.sheet{position:relative;width:210mm;min-height:297mm;margin:18px auto;background:#fff;padding:13mm 14mm 12mm;box-shadow:0 8px 40px rgba(7,53,38,.15);overflow:hidden}
.wm{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%) rotate(-28deg);font:800 118px/1 Georgia,serif;letter-spacing:.06em;color:rgba(180,35,24,.13);border:10px solid rgba(180,35,24,.13);padding:6px 36px;border-radius:18px;pointer-events:none;white-space:nowrap;z-index:5;user-select:none}
.wm.cx{color:rgba(90,90,90,.16);border-color:rgba(90,90,90,.16)}
.hd{display:flex;align-items:center;gap:18px;padding-bottom:12px;border-bottom:3px solid var(--g9);position:relative}
.hd::after{content:"";position:absolute;left:0;bottom:-6px;width:100%;height:2px;background:linear-gradient(90deg,var(--au),var(--au2),var(--au))}
.hd img{height:72px;width:auto;display:block}.hd .co{margin-left:auto;text-align:right;font-size:11px;color:var(--mute);line-height:1.55}.hd .co b{display:block;font:700 17px Georgia,serif;color:var(--g9);margin-bottom:1px}
.ti{display:flex;justify-content:space-between;align-items:flex-end;margin:20px 0 12px;gap:16px}
.ti h1{font:700 25px Georgia,'Times New Roman',serif;color:var(--g9);letter-spacing:.01em}.ti small{display:block;color:var(--mute);font-size:11px;margin-top:2px}
.no{text-align:right}.no .l{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--mute);font-weight:700}.no .v{font:800 21px ui-monospace,Consolas,monospace;letter-spacing:.04em;color:var(--ink)}
.st{display:inline-block;padding:3px 11px;border-radius:20px;font-weight:800;font-size:10px;letter-spacing:.1em;text-transform:uppercase;margin-top:4px}
.st.ok{background:#e2f4ea;color:#0f7a4f}.st.pe{background:#fdeceb;color:var(--red)}.st.cx{background:#eee;color:#555}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--line);border-radius:10px;margin-bottom:14px;overflow:hidden}
.meta div{padding:8px 12px;border-right:1px solid var(--line)}.meta div:last-child{border:0}.meta .l{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);font-weight:700}.meta .v{font-weight:700;margin-top:1px}
h2{font:800 10px inherit;letter-spacing:.2em;text-transform:uppercase;color:var(--au);margin:16px 0 7px;display:flex;align-items:center;gap:10px}h2::after{content:"";flex:1;height:1px;background:var(--line)}
table.t{width:100%;border-collapse:collapse}table.t th{text-align:left;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);padding:6px 8px;background:#f7f5ee;border-bottom:1px solid var(--line)}table.t td{padding:7px 8px;border-bottom:1px solid #efece3;vertical-align:top}
.svc{border:1px solid var(--line);border-left:4px solid var(--g7);border-radius:10px;margin-bottom:10px;overflow:hidden;break-inside:avoid}
.svc .sh{display:flex;align-items:center;gap:10px;padding:9px 13px;background:linear-gradient(90deg,#f4f8f5,#fff)}.svc .sh b{font-size:14px;color:var(--g9)}.svc .sh .ty{font-size:9px;letter-spacing:.16em;text-transform:uppercase;font-weight:800;color:#fff;background:var(--g7);padding:3px 9px;border-radius:5px}
.svc .sh .cf{margin-left:auto;text-align:right;font-size:10px;color:var(--mute)}.svc .sh .cf b{display:block;font:800 13px ui-monospace,Consolas,monospace;color:var(--g9)}
.kv{display:grid;grid-template-columns:repeat(3,1fr);gap:9px 16px;padding:11px 13px}.kv .l{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);font-weight:700}.kv .v{font-weight:600}
.stars{color:var(--au);letter-spacing:2px;font-size:13px}
.leg{display:flex;align-items:center;gap:14px;padding:4px 13px 11px}.leg .c{font:800 20px ui-monospace,Consolas,monospace}.leg .tm{font-size:11px;color:var(--mute)}.leg .ln{flex:1;border-top:2px dotted var(--au);position:relative;height:0}.leg .ln::after{content:"\\2708";position:absolute;left:50%;top:-11px;transform:translateX(-50%);background:#fff;padding:0 6px;color:var(--g7);font-size:15px}
.note{background:#fbf8ee;border:1px solid var(--au2);border-radius:9px;padding:9px 12px;margin-top:6px}
.ft{display:flex;gap:18px;align-items:flex-end;margin-top:18px;padding-top:12px;border-top:1px solid var(--line);break-inside:avoid}.ft .tx{flex:1;font-size:10.5px;color:var(--mute);white-space:pre-line}.ft .qr{text-align:center;font-size:8.5px;color:var(--mute)}.ft .qr svg{width:82px;height:82px;display:block}
.cut{text-align:center;color:var(--mute);font-size:10.5px;margin-top:8px}
@media(max-width:820px){.sheet{width:auto;margin:0;min-height:0;padding:16px}.kv{grid-template-columns:1fr 1fr}.meta{grid-template-columns:1fr 1fr}.wm{font-size:60px}.hd img{height:54px}.ti{flex-direction:column;align-items:flex-start}.no{text-align:left}}
@media print{body{background:#fff}.bar{display:none}.sheet{margin:0;box-shadow:none;width:auto;min-height:0}@page{size:A4;margin:0}}
`;
let HOST = '';
const rememberHost = h => { HOST = h; };
const ogBase = () => (db.settings.baseUrl || process.env.PUBLIC_URL || HOST || '').replace(/\/+$/, '');
/* Link previews (WhatsApp, Facebook, Telegram, X): title, description and the brand image. Private pages stay noindex. */
const page = (title, body, extraHead = '', desc = '') => {
  const c = db.settings.company || {}, b = ogBase(), name = c.name || 'The Umrah Store', d = desc || (c.tagline || 'Premium Islamic Travel') + ' - Umrah packages, flights, visas and transport.', img = b ? b + '/brand/og-image.jpg' : '/brand/og-image.jpg', full = title.includes(name) ? title : title + ' | ' + name;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(full)}</title>
<meta name="description" content="${esc(d)}"><meta name="theme-color" content="#0a1a4a"><meta property="og:type" content="website"><meta property="og:site_name" content="${esc(name)}"><meta property="og:title" content="${esc(full)}"><meta property="og:description" content="${esc(d)}"><meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(full)}"><meta name="twitter:description" content="${esc(d)}"><meta name="twitter:image" content="${esc(img)}">
<link rel="icon" href="/brand/favicon.ico" sizes="any"><link rel="apple-touch-icon" href="/brand/icon-180.png"><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet"><style>${CSS}</style>${extraHead}</head><body>${body}</body></html>`;
};

const letterhead = () => {
  const c = db.settings.company;
  return `<div class="hd"><img src="${logoUrl()}" alt="${esc(c.name)}"><div class="co"><b>${esc(c.name)}</b>${c.tagline ? esc(c.tagline) + '<br>' : ''}${[c.address, c.phone, c.email, c.website].filter(Boolean).map(esc).join('<br>')}</div></div>`;
};
const kv = (l, v) => (v || v === 0 ? `<div><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>` : '');
const stars = n => (n ? `<span class="stars">${'&#9733;'.repeat(Math.min(7, +n))}</span>` : '');

function svcBlock(s) {
  const d = s.d || {}, conf = s.conf ? `<div class="cf">Confirmation No.<b>${esc(s.conf)}</b></div>` : '';
  const head = (ty, title, extra = '') => `<div class="sh"><span class="ty">${ty}</span><b>${esc(title)}</b>${extra}${conf}</div>`;
  if (s.type === 'hotel') {
    const n = nights(d.cin || s.from, d.cout || s.to);
    return `<div class="svc">${head('Hotel', d.hotel || s.title, d.stars ? ' ' + stars(d.stars) : '')}<div class="kv">${kv('City', d.city)}${kv('Check-in', fd(d.cin || s.from))}${kv('Check-out', fd(d.cout || s.to))}${kv('Nights', n || '')}${kv('Room type', d.room)}${kv('Rooms', d.rooms)}${kv('Meal plan', d.meal)}${kv('Distance', d.dist)}${kv('Guests', d.guests || '')}</div></div>`;
  }
  if (s.type === 'transport') return `<div class="svc">${head('Transport', s.title)}<div class="kv">${kv('Route', d.route)}${kv('Vehicle', d.vehicle)}${kv('Date', fd(d.date || s.from))}${kv('Pick-up time', d.time)}${kv('Pick-up', d.pickup)}${kv('Drop-off', d.drop)}${kv('Passengers', s.qty)}</div></div>`;
  if (s.type === 'visa') return `<div class="svc">${head('Visa', s.title)}<div class="kv">${kv('Visa type', d.vtype)}${kv('Entry', d.entry)}${kv('Validity', d.duration)}${kv('Applicants', s.qty)}${kv('Reference', d.ref)}</div></div>`;
  if (s.type === 'flight') {
    const leg = (t, f, dt, a, b, dp, ar) => `<div class="leg"><div><div class="c">${esc(a)}</div><div class="tm">${esc(dp)}</div></div><div class="ln"></div><div style="text-align:right"><div class="c">${esc(b)}</div><div class="tm">${esc(ar)}</div></div><div style="min-width:150px;font-size:11px"><b>${esc(t)}</b> ${esc(f)}<br>${esc(fd(dt))}</div></div>`;
    return `<div class="svc">${head('Flight', s.title)}<div class="kv">${kv('Airline', d.airline)}${kv('PNR', d.pnr)}${kv('Class', d.cls)}${kv('Baggage', d.bag)}${kv('Passengers', s.qty)}</div>${d.from ? leg('Outbound', d.fno || '', d.date || s.from, d.from, d.to, d.dep || '', d.arr || '') : ''}${d.rfrom || d.rfno ? leg('Return', d.rfno || '', d.rdate || s.to, d.rfrom || d.to, d.rto || d.from, d.rdep || '', d.rarr || '') : ''}</div>`;
  }
  if (s.type === 'package') {
    const o = d.out, i = d.inb, leg = (t, f) => (f && f.from ? `<div class="leg"><div><div class="c">${esc(f.from)}</div><div class="tm">${esc(f.dt)}</div></div><div class="ln"></div><div style="text-align:right"><div class="c">${esc(f.to)}</div><div class="tm">${esc(f.at)}</div></div><div style="min-width:150px;font-size:11px"><b>${t}</b> ${esc(f.fn)}<br>${esc(fd(f.date))}${f.bag ? '<br>Baggage ' + esc(f.bag) + ' kg' : ''}</div></div>` : '');
    return `<div class="svc">${head('Package', s.title)}<div class="kv">${kv('Airline', d.airline)}${kv('Room type', d.room)}${kv('Group', d.code)}${kv('Makkah', d.makkah ? d.makkah + ' - ' + (d.mkn || '') + ' nights' : '')}${kv('Madinah', d.madinah ? d.madinah + ' - ' + (d.mdn || '') + ' nights' : '')}${kv('Distance', [d.mkd && 'Makkah ' + d.mkd, d.mdd && 'Madinah ' + d.mdd].filter(Boolean).join(' / '))}</div>${leg('Outbound', o)}${leg('Return', i)}</div>`;
  }
  return `<div class="svc">${head('Service', s.title)}<div class="kv">${kv('Details', d.desc)}${kv('Date', fd(s.from))}${kv('Quantity', s.qty)}</div></div>`;
}

const TITLES = { all: 'Booking Voucher', hotel: 'Hotel Voucher', transport: 'Transport Voucher', flight: 'Flight Itinerary', visa: 'Visa Voucher', package: 'Package Voucher', other: 'Service Voucher', custom: '' };

async function voucherHtml(v, req) {
  const b = db.bookings.find(x => x.id === v.bookingId); if (!b) return null;
  const c = db.settings.company, pty = party(b.partyId), url = origin(req) + '/v/' + v.token;
  const approved = b.status === 'Confirmed', cancelled = b.status === 'Cancelled';
  let svcs = v.kind === 'all' ? b.services : v.kind === 'custom' ? [] : b.services.filter(s => (v.sid ? s.id === v.sid : s.type === v.kind));
  const title = v.kind === 'custom' ? (v.custom.title || 'Voucher') : TITLES[v.kind];
  const qr = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
  const wm = cancelled ? '<div class="wm cx">CANCELLED</div>' : approved ? '' : '<div class="wm">PENDING</div>';
  const st = cancelled ? '<span class="st cx">Cancelled</span>' : approved ? '<span class="st ok">Approved</span>' : '<span class="st pe">Pending approval</span>';
  const custom = v.kind === 'custom' ? `<h2>Details</h2><table class="t"><tbody>${v.custom.rows.map(r => `<tr><td style="width:32%;color:var(--mute);font-weight:700">${esc(r.k)}</td><td>${esc(r.v)}</td></tr>`).join('')}</tbody></table>${v.custom.notes ? `<div class="note">${esc(v.custom.notes)}</div>` : ''}` : '';
  const body = `<div class="bar"><b>${esc(title)} &middot; ${esc(b.no)}</b><button class="pri" onclick="window.print()">Print / Save as PDF</button><button onclick="navigator.clipboard&&navigator.clipboard.writeText('${esc(url)}').then(()=>{this.textContent='Link copied'})">Copy link</button><a target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(title + ' ' + b.no + ' - ' + url)}">Share on WhatsApp</a></div>
<div class="sheet">${wm}${letterhead()}
<div class="ti"><div><h1>${esc(title)}</h1><small>Issued ${esc(fdt(v.createdAt))} &middot; Voucher ${esc(v.no)}</small>${st}</div><div class="no"><div class="l">Booking number</div><div class="v">${esc(b.no)}</div></div></div>
<div class="meta"><div><div class="l">Booked by</div><div class="v">${esc(pty ? pty.name : '')}</div></div><div><div class="l">Category</div><div class="v">${esc(b.category)}</div></div><div><div class="l">Travel from</div><div class="v">${esc(fd(b.from) || '-')}</div></div><div><div class="l">Travel to</div><div class="v">${esc(fd(b.to) || '-')}</div></div></div>
<h2>Travellers (${b.pax.length})</h2><table class="t"><thead><tr><th style="width:28px">#</th><th>Name</th><th>Passport no.</th><th>Type</th><th>Nationality</th></tr></thead><tbody>${b.pax.map((x, i) => `<tr><td>${i + 1}</td><td><b>${esc(x.n)}</b></td><td style="font-family:ui-monospace,Consolas,monospace">${esc(x.pp)}</td><td>${esc(x.t)}</td><td>${esc(x.nat)}</td></tr>`).join('')}</tbody></table>
${svcs.length ? '<h2>Services</h2>' + svcs.map(svcBlock).join('') : ''}${custom}
${b.notes ? `<h2>Notes</h2><div class="note">${esc(b.notes)}</div>` : ''}
<div class="ft"><div class="tx">${esc([c.terms, c.footer].filter(Boolean).join('\n\n'))}${approved ? '' : '\n\nThis voucher is not valid for travel until it is approved by ' + esc(c.name) + '.'}</div><div class="qr">${qr}<div>Scan to verify</div></div></div></div>`;
  return page(title + ' ' + b.no, body, '', 'Your travel voucher from ' + (db.settings.company.name || 'The Umrah Store') + '. Open the link to view, print or share it.');
}

async function receiptHtml(p, req) {
  const pty = party(p.partyId), c = db.settings.company, sup = p.dir === 'out', ok = p.status === 'Approved';
  const url = origin(req) + '/api/receipt/' + p.id;
  const body = `<div class="bar"><b>${sup ? 'Payment voucher' : 'Receipt'} ${esc(p.id)}</b><button class="pri" onclick="window.print()">Print / Save as PDF</button></div>
<div class="sheet" style="min-height:0">${ok ? '' : `<div class="wm">${esc(p.status.toUpperCase())}</div>`}${letterhead()}
<div class="ti"><div><h1>${sup ? 'Payment Voucher' : 'Payment Receipt'}</h1><small>${esc(fdt(p.created || p.date))}</small><span class="st ${ok ? 'ok' : 'pe'}">${esc(p.status)}</span></div><div class="no"><div class="l">Reference</div><div class="v">${esc(p.id)}</div></div></div>
<div class="meta"><div><div class="l">${sup ? 'Paid to' : 'Received from'}</div><div class="v">${esc(pty ? pty.name : '')}</div></div><div><div class="l">Method</div><div class="v">${esc(p.method)}</div></div><div><div class="l">Date</div><div class="v">${esc(fd(p.date))}</div></div><div><div class="l">Amount</div><div class="v" style="font-size:16px">${money(p.amt)}</div></div></div>
<table class="t"><tbody>${p.ref ? `<tr><td style="width:30%;color:var(--mute);font-weight:700">Transaction / ref</td><td>${esc(p.ref)}</td></tr>` : ''}${p.bookingId ? `<tr><td style="color:var(--mute);font-weight:700">Booking</td><td>${esc((db.bookings.find(b => b.id === p.bookingId) || {}).no || '')}</td></tr>` : ''}${p.note ? `<tr><td style="color:var(--mute);font-weight:700">Note</td><td>${esc(p.note)}</td></tr>` : ''}<tr><td style="color:var(--mute);font-weight:700">Recorded by</td><td>${esc(p.by)}</td></tr></tbody></table>
<div class="ft"><div class="tx">${esc(c.footer || 'Thank you for your business.')}</div></div></div>`;
  return page('Receipt ' + p.id, body, '', 'Payment receipt from ' + (db.settings.company.name || 'The Umrah Store') + '.');
}

/* ---------- public payment link page ---------- */

/* ---------- bank accounts: shared card renderer (public page + payment links) ---------- */
const THEMES = { green: ['#073526', '#1f9a70'], gold: ['#6b4f12', '#c9a23f'], navy: ['#0b2447', '#3b6fc4'], maroon: ['#561323', '#b5314f'], slate: ['#1f2937', '#64748b'], teal: ['#0b3b3c', '#19a3a0'] };
const KIND = { bank: 'Bank account', wallet: 'Mobile wallet', raast: 'Raast ID' };
const liveBanks = () => (db.settings.bank || []).filter(b => b.active !== false);
const publicBanks = () => (db.settings.payments.publicBankPage ? liveBanks().filter(b => b.public !== false) : []).map(b => ({ id: b.id, kind: b.kind, title: b.title, bank: b.bank, branch: b.branch, account: b.account, iban: b.iban, swift: b.swift, wallet: b.wallet, raast: b.raast, currency: b.currency, instructions: b.instructions, theme: b.theme, qr: b.qr || '', logo: b.logo || '' }));
const BL = require('../public/banklogo.js');
const BANK_CSS = `<style>${BL.css}.bkc .lg2{display:flex;gap:12px;align-items:center;position:relative;z-index:1}.bkc{border-radius:18px;color:#fff;padding:20px 20px 16px;margin:12px 0;position:relative;overflow:hidden;box-shadow:0 10px 30px rgba(7,53,38,.2)}.bkc::after{content:"";position:absolute;right:-50px;top:-50px;width:170px;height:170px;border-radius:50%;background:rgba(255,255,255,.09)}
.bkc .tp{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.bkc .kd{font:800 10px inherit;letter-spacing:.16em;text-transform:uppercase;opacity:.75}.bkc .bn{font:700 20px Georgia,serif;margin-top:2px}.bkc .tt{opacity:.9;margin-top:2px;font-size:13px}.bkc img.qr{width:84px;height:84px;background:#fff;border-radius:10px;padding:4px;object-fit:contain;position:relative;z-index:1}
.bkc .fl{margin-top:12px;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.13);border-radius:11px;padding:8px 10px;position:relative;z-index:1}.bkc .fl span{font:700 9.5px inherit;letter-spacing:.12em;text-transform:uppercase;opacity:.75;min-width:62px}.bkc .fl code{flex:1;font:700 14px ui-monospace,Consolas,monospace;letter-spacing:.04em;word-break:break-all;background:none;color:#fff;padding:0}
.bkc .cp{border:0;background:rgba(255,255,255,.2);color:#fff;border-radius:8px;padding:6px 10px;font:700 11px inherit;cursor:pointer}.bkc .cp.ok{background:#fff;color:#073526}.bkc .in{margin-top:10px;font-size:11.5px;opacity:.85;position:relative;z-index:1}</style>`;
const BANK_JS = `<script>document.addEventListener('click',function(e){var b=e.target.closest('.cp');if(!b)return;var t=b.dataset.v;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).catch(function(){var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove()});var o=b.textContent;b.textContent='Copied';b.classList.add('ok');setTimeout(function(){b.textContent=o;b.classList.remove('ok')},1400)})</script>`;
async function bankCard(b) {
  const [c1, c2] = THEMES[b.theme] || THEMES.green, f = (l, v) => (v ? `<div class="fl"><span>${l}</span><code>${esc(v)}</code><button class="cp" data-v="${esc(v)}">Copy</button></div>` : '');
  let qr = b.qr; if (!qr) { const x = b.iban || b.account || b.wallet || b.raast; if (x) qr = 'data:image/svg+xml;utf8,' + encodeURIComponent(await QRCode.toString(x, { type: 'svg', margin: 1 })); }
  return `<div class="bkc" style="background:linear-gradient(135deg,${c1},${c2})"><div class="tp"><div class="lg2">${BL.html(b, 46)}<div><div class="kd">${esc(KIND[b.kind] || 'Bank account')}${b.currency && b.currency !== 'PKR' ? ' &middot; ' + esc(b.currency) : ''}</div><div class="bn">${esc(b.bank || b.title)}</div><div class="tt">${esc(b.title)}${b.branch ? ' &middot; ' + esc(b.branch) : ''}</div></div></div>${qr ? `<img class="qr" src="${qr}" alt="QR">` : ''}</div>${f('Account no.', b.account)}${f('IBAN', b.iban)}${f('Wallet no.', b.wallet)}${f('Raast ID', b.raast)}${f('SWIFT', b.swift)}${b.instructions ? `<div class="in">${esc(b.instructions)}</div>` : ''}</div>`;
}
async function bankPageHtml(req) {
  const c = db.settings.company, list = publicBanks(), cards = (await Promise.all(list.map(bankCard))).join(''), pi = db.settings.payments.instructions;
  const wa = String(c.whatsapp || c.phone || '').replace(/\D/g, '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Bank accounts - ${esc(c.name)}</title><meta name="description" content="Official bank accounts, JazzCash, Easypaisa and Raast details of ${esc(c.name)}."><meta name="theme-color" content="#0a1a4a"><meta property="og:type" content="website"><meta property="og:title" content="Bank accounts - ${esc(c.name)}"><meta property="og:description" content="Official bank accounts and wallets for payments to ${esc(c.name)}."><meta property="og:image" content="${esc(ogBase() || origin(req))}/brand/og-image.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/favicon.ico"><style>${CSS}</style>${BANK_CSS}<style>.w{max-width:560px;margin:0 auto;padding:18px}.hd2{text-align:center;padding:14px 0 6px}.hd2 img{height:60px}.hd2 h1{font:700 24px Georgia,serif;color:var(--g9);margin-top:8px}.hd2 p{color:var(--mute);margin-top:4px}.note{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:12px;color:var(--ink)}.ft{text-align:center;color:var(--mute);font-size:11px;margin:20px 0}.act{display:flex;gap:8px;margin-top:12px}.act a{flex:1;text-align:center;padding:13px;border-radius:12px;font:700 14px inherit;text-decoration:none;background:var(--g9);color:#fff}.act a.alt{background:#fff;color:var(--g9);border:1px solid var(--g9)}</style></head><body><div class="w"><div class="hd2"><img src="${logoUrl()}" alt=""><h1>Our bank accounts</h1><p>${esc(c.name)} &middot; pay by bank transfer, Raast or mobile wallet</p></div>
${cards || '<div class="note">No bank accounts are published right now. Please contact us for payment details.</div>'}
${pi ? `<div class="note">${esc(pi)}</div>` : ''}<div class="note"><b>After you pay</b><br>Send us the receipt and your name / booking number so we can credit your account quickly. Agents can add a payment record from their portal in one tap.</div>
<div class="act"><a href="/">Agent login</a>${wa ? `<a class="alt" href="https://wa.me/${wa}?text=${encodeURIComponent('Hello, I have made a payment. Receipt attached.')}">Send receipt on WhatsApp</a>` : ''}</div>
<div class="ft">${esc(c.name)} ${esc([c.phone, c.email].filter(Boolean).join(' · '))}</div></div>${BANK_JS}</body></html>`;
}

async function payPageHtml(l, req, msg) {
  const c = db.settings.company, pty = party(l.partyId), pf = require('./integrations').pfConfigured();
  const banks = await Promise.all(liveBanks().map(bankCard));
  const open = l.status === 'Open';
  const css = BANK_CSS + `<style>.pay{max-width:520px;margin:0 auto;padding:18px}.card{background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(7,53,38,.12);padding:22px;margin-bottom:14px}.card img.lg{height:64px;display:block;margin:0 auto 10px}.amt{font:800 34px Georgia,serif;color:var(--g9);text-align:center}.sub{text-align:center;color:var(--mute);margin:2px 0 14px}.m{color:var(--mute)}
.btn{display:block;width:100%;border:0;border-radius:12px;padding:14px;font:700 15px inherit;cursor:pointer;background:var(--g9);color:#fff;margin-top:8px}.btn.alt{background:#fff;color:var(--g9);border:1px solid var(--g9)}.bk{display:flex;gap:12px;justify-content:space-between;align-items:center;border:1px solid var(--line);border-radius:12px;padding:12px;margin:8px 0}.bk img{width:96px;height:96px;object-fit:contain}code{background:#f4f1e8;padding:1px 6px;border-radius:5px;font-size:12px}
input{width:100%;padding:11px;border:1px solid var(--line);border-radius:10px;font:inherit;margin-top:6px}.ok{background:#e2f4ea;color:#0f7a4f;padding:12px;border-radius:10px;font-weight:700;text-align:center}.er{background:#fdeceb;color:var(--red);padding:12px;border-radius:10px;font-weight:700;text-align:center;margin-bottom:10px}h3{font:800 11px inherit;letter-spacing:.16em;text-transform:uppercase;color:var(--au);margin-bottom:6px}</style>`;
  const body = `<div class="pay"><div class="card"><img class="lg" src="${logoUrl()}" alt=""><div class="amt">${money(l.amt)}</div><div class="sub">${esc(l.purpose)}<br>For ${esc(pty ? pty.name : '')} &middot; ${esc(c.name)}</div>
${msg ? `<div class="${msg.ok ? 'ok' : 'er'}">${esc(msg.t)}</div>` : ''}${l.status === 'Paid' ? '<div class="ok">Paid - thank you.</div>' : !open ? `<div class="er">This payment link is ${esc(l.status.toLowerCase())}.</div>` : ''}
${open ? `${pf ? '<h3>Pay online</h3><button class="btn" id="pf">Pay with card / wallet / bank (PayFast)</button>' : ''}
${banks.length ? '<h3 style="margin-top:18px">Bank transfer</h3>' + banks.join('') + `<h3 style="margin-top:14px">Upload your transfer receipt</h3><input id="ref" placeholder="Transaction reference (optional)"><input id="fl" type="file" accept="image/*,.pdf"><button class="btn alt" id="sub">Submit receipt for approval</button>` : (pf ? '' : '<div class="er">No payment method is available yet. Please contact ' + esc(c.name) + '.</div>')}` : ''}</div>
<div class="m" style="text-align:center;font-size:11px">${esc(c.name)} ${esc([c.phone, c.email].filter(Boolean).join(' &middot; '))}</div></div>
${BANK_JS}<script>
const T=${JSON.stringify(l.token)},j=(u,b)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})}).then(r=>r.json());
const pf=document.getElementById('pf');if(pf)pf.onclick=async()=>{pf.disabled=true;pf.textContent='Redirecting...';const r=await j('/pay/'+T+'/start');if(r.error){alert(r.error);pf.disabled=false;pf.textContent='Pay with card / wallet / bank (PayFast)';return}
const f=document.createElement('form');f.method='POST';f.action=r.action;Object.entries(r.fields).forEach(([k,v])=>{const i=document.createElement('input');i.type='hidden';i.name=k;i.value=v;f.appendChild(i)});document.body.appendChild(f);f.submit()};
const sub=document.getElementById('sub');if(sub)sub.onclick=async()=>{const fl=document.getElementById('fl').files[0];if(!fl){alert('Choose your receipt image or PDF');return}
if(fl.size>6e6){alert('File too large (max 6 MB)');return}const d=await new Promise(r=>{const x=new FileReader();x.onload=()=>r(x.result);x.readAsDataURL(fl)});
sub.disabled=true;const r=await j('/pay/'+T+'/proof',{ref:document.getElementById('ref').value,file:{name:fl.name,data:d}});if(r.error){alert(r.error);sub.disabled=false}else location.href='/pay/'+T+'?sent=1'};
</script>`;
  return page('Pay ' + money(l.amt) + ' - ' + c.name, body, css, 'Secure payment request of ' + money(l.amt) + (l.purpose ? ' for ' + l.purpose : '') + '. Pay by card, wallet or bank transfer.');
}

const infoPage = (title, msg, ok, back = '/') => page(title, `<div style="max-width:460px;margin:12vh auto;padding:18px"><div style="background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(7,53,38,.12);padding:28px;text-align:center"><img src="${logoUrl()}" style="height:70px;margin-bottom:14px" alt=""><h1 style="font:700 22px Georgia,serif;color:${ok ? '#0f7a4f' : '#b42318'}">${esc(title)}</h1><p style="margin:10px 0 18px;color:#66736c">${esc(msg)}</p><a href="${back}" style="display:inline-block;background:#073526;color:#fff;border-radius:10px;padding:11px 22px;font-weight:700;text-decoration:none">Back to ${esc(db.settings.company.name)}</a></div></div>`);

module.exports = { rememberHost, voucherHtml, receiptHtml, payPageHtml, infoPage, esc, bankPageHtml, publicBanks };
