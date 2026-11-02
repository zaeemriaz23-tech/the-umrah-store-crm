/* Umrah Groups PDF parser. Works in the browser (pdf.js) and in Node (tests / seeding).
   parseGroupsFromPages(pages, now) where pages = [{width, items:[{str,x,y}]}] */
(function (root) {
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const COLS = [0.02, 0.163, 0.394, 0.625, 0.7145, 0.8017, 0.8897, 1.01]; // pkg, makkah, madinah, sharing, quad, triple, double
  const FLT = /([A-Z]{2})\s?(\d{2,4})\s+(\d{1,2})\s([A-Za-z]{3})\s+([A-Z]{3})-([A-Z]{3})\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s+Baggage:\s*(\d+)\s*Kg/g;
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);
  const cleanDist = s => {
    s = String(s || '').replace(/^Distance:\s*/i, '').trim();
    s = s.replace(/\s*m$/i, '').replace(/\bMTR\b|\bMtr\b/gi, 'm').replace(/\s*M\s*$/i, '').trim();
    if (/^shuttle service/i.test(s)) return 'Shuttle service';
    if (/^shuttle/i.test(s)) return 'Shuttle';
    if (!s) return '';
    return /m$/i.test(s) ? s.replace(/\s+/g, ' ') : s + ' m';
  };
  function rowsOf(page) {
    const items = page.items.filter(i => i.str && i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x), rows = [];
    for (const it of items) {
      const r = rows.find(r => Math.abs(r.y - it.y) <= 2.6);
      if (r) r.items.push(it); else rows.push({ y: it.y, items: [it], w: page.width });
    }
    rows.forEach(r => r.items.sort((a, b) => a.x - b.x));
    return rows.sort((a, b) => b.y - a.y);
  }
  function cols(row) {
    const out = ['', '', '', '', '', '', ''];
    for (const it of row.items) {
      const f = it.x / row.w; let c = -1;
      for (let i = 0; i < 7; i++) if (f >= COLS[i] && f < COLS[i + 1]) { c = i; break; }
      if (c >= 0) out[c] += (out[c] ? ' ' : '') + it.str.trim();
    }
    return out;
  }
  function parseGroupsFromPages(pages, now) {
    now = now || new Date();
    let gen = null;
    for (const p of pages) for (const it of p.items) { const m = /Generated:\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(it.str); if (m) gen = { y: +m[3], m: +m[2] - 1 }; }
    gen = gen || { y: now.getFullYear(), m: now.getMonth() };
    const yearFor = (m, base) => (m < base.m - 0 && base === gen ? gen.y + 1 : gen.y);
    const groups = []; let g = null, pk = null;
    const finish = () => { if (g && g.id && g.out && g.inb && g.pk.length) groups.push(g); g = null; pk = null; };
    for (const page of pages) for (const row of rowsOf(page)) {
      const text = row.items.map(i => i.str.trim()).join(' ').replace(/\s+/g, ' ');
      let m;
      if ((m = /^Group (\d+):\s*(.+)$/.exec(text))) { finish(); g = { no: +m[1], code: m[2].trim(), id: '', pk: [] }; continue; }
      if (!g) continue;
      if ((m = /Airline:\s*([A-Z0-9]{2})\s*-\s*(.+)$/.exec(text))) { g.air = m[1]; g.airline = m[2].trim(); continue; }
      const ug = /\bUG-\d+\b/.exec(text); if (ug && !g.id) g.id = ug[0];
      FLT.lastIndex = 0; const fl = []; let fm;
      while ((fm = FLT.exec(text))) fl.push(fm);
      if (fl.length && !g.out) {
        const f = fl[0], pre = text.slice(0, f.index), post = text.slice(f.index + f[0].length);
        const nm = /(\d+)\s*$/.exec(pre.replace(/Nights/i, '').trim()), sm = /^\s*(\d+)/.exec(post);
        if (nm) g.n = +nm[1]; if (sm) g.seats = +sm[1]; g._f1 = f;
      }
      if (fl.length) for (const f of fl) {
        const leg = { fn: f[1] + ' ' + f[2], d: +f[3], mo: MON[f[4].toLowerCase()], from: f[5], to: f[6], dt: f[7], at: f[8], bag: +f[9] };
        if (!g.out) g.out = leg; else if (!g.inb && (leg.fn !== g.out.fn || leg.d !== g.out.d || leg.mo !== g.out.mo)) g.inb = leg;
      }
      if (g.out && g.seats == null && (m = /^(\d{1,3})\s+(\d{1,4})$/.exec(text))) { g.n = +m[1]; g.seats = +m[2]; continue; }
      const c = cols(row);
      if (/^UP-\d+$/.test(c[0].split(' ')[0]) && c[3].replace(/\D/g, '')) {
        pk = { id: c[0].split(' ')[0], mk: c[1], md: c[2], mkn: 0, mdn: 0, mkd: '', mdd: '', p: { sh: +c[3].replace(/\D/g, ''), qd: +c[4].replace(/\D/g, ''), tr: +c[5].replace(/\D/g, ''), db: +c[6].replace(/\D/g, '') } };
        g.pk.push(pk); continue;
      }
      if (pk && (m = /Makkah:\s*(\d+)\s*Madinah:\s*(\d+)/.exec(c[0]))) { pk.mkn = +m[1]; pk.mdn = +m[2]; pk.mkd = cleanDist(/^Distance/i.test(c[1]) ? c[1] : ''); pk.mdd = cleanDist(/^Distance/i.test(c[2]) ? c[2] : ''); pk = null; }
    }
    finish();
    for (const g of groups) {
      const o = g.out, i = g.inb, y0 = o.mo < gen.m ? gen.y + 1 : gen.y, y1 = i.mo < o.mo ? y0 + 1 : y0;
      g.dep = iso(y0, o.mo, o.d); g.ret = iso(y1, i.mo, i.d);
      g.out = { fn: o.fn, date: g.dep, from: o.from, to: o.to, dt: o.dt, at: o.at, bag: o.bag };
      g.inb = { fn: i.fn, date: g.ret, from: i.from, to: i.to, dt: i.dt, at: i.at, bag: i.bag };
      delete g._f1;
      if (!g.n) g.n = Math.round((new Date(g.ret) - new Date(g.dep)) / 864e5);
    }
    return groups;
  }
  // converts pdf.js text content to upright viewport coordinates (handles rotated pages)
  const pageFrom = (vp, tc) => ({ width: vp.width, items: tc.items.map(t => { const v = vp.convertToViewportPoint(t.transform[4], t.transform[5]); return { str: t.str, x: v[0], y: vp.height - v[1] }; }) });
  const api = { parseGroupsFromPages, cleanDist, pageFrom };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PdfParse = api;
  // browser helper
  if (root.pdfjsLib) {
    api.parsePdfFile = async function (file) {
      root.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
      const doc = await root.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, pages = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const pg = await doc.getPage(n), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
        pages.push(api.pageFrom(vp, tc));
      }
      return parseGroupsFromPages(pages);
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
