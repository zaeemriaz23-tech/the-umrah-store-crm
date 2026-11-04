/* Shared UI extras: extra icons, airline logo badge, lazy PDF loader, WhatsApp helper */
'use strict';
Object.assign(IC, {
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  hotel: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16"/><path d="M15 10h4a1 1 0 0 1 1 1v10"/><path d="M8 8h3M8 12h3M8 16h3M3 21h18"/>',
  passport: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 16.5h6"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8L12 3.5z"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8-9-9z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  car: '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="16" r="1"/><circle cx="16.5" cy="16" r="1"/>'
});
const airBadge = (code, name, sz = 44) => `<span class="alogo" style="width:${sz}px;height:${sz}px"><b style="background:${Engine.airColor(code)}">${esc(code || '?')}</b>${Engine.airLogo(code) ? `<img src="${Engine.airLogo(code)}" alt="${esc(name || code)} logo" loading="lazy" decoding="async" onerror="this.remove()">` : ''}</span>`;
const waLinkTo = text => 'https://wa.me/?text=' + encodeURIComponent(text);
const loadScript = src => new Promise((res, rej) => { if ([...document.scripts].some(s => s.src.endsWith(src))) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
const loadPdf = async () => { if (!window.pdfjsLib) await loadScript('/vendor/pdf.min.js'); if (!window.PdfParse || !PdfParse.parsePdfFile) { const old = [...document.scripts].find(s => s.src.endsWith('/pdfparse.js')); if (old) old.remove(); await loadScript('/pdfparse.js'); } };
const inv = () => S.inv || { hotels: [], visaTiers: [], tVehicles: [], tRoutes: [], tPrices: [], calc: { pkrPerSar: 0, flightPkr: 0 } };
const todayPlus = n => addDays(todayISO(), n);
