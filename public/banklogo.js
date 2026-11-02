/* Bank logo badges: brand-coloured marks for Pakistani banks and wallets, plus custom uploaded logos.
   Works in the browser (global BankLogo) and in Node (require). */
(function (root) {
  'use strict';
  /* [match regex, short mark, background, text colour] */
  const B = [
    [/meezan/i, 'MBL', '#6a1b9a', '#fff'], [/\bhbl\b|habib bank/i, 'HBL', '#00796b', '#fff'], [/\bubl\b|united bank/i, 'UBL', '#0072bc', '#fff'],
    [/\bmcb\b|muslim commercial/i, 'MCB', '#007a3d', '#fff'], [/allied|\babl\b/i, 'ABL', '#00833e', '#fff'], [/alfalah/i, 'BAF', '#e31837', '#fff'],
    [/askari/i, 'AKBL', '#123a7a', '#ffd23f'], [/faysal/i, 'FBL', '#0a6e58', '#fff'], [/standard chartered|\bscb\b/i, 'SC', '#0473ea', '#fff'],
    [/habib ?metro|hmb/i, 'HMB', '#1a4c8b', '#ffd23f'], [/al ?habib|bahl/i, 'BAH', '#0a7a46', '#fff'], [/soneri/i, 'SNB', '#00843d', '#ffd23f'],
    [/js bank/i, 'JS', '#1c3d7c', '#ff9a1f'], [/silk/i, 'SLK', '#c2185b', '#fff'], [/summit/i, 'SMBL', '#0b5aa6', '#fff'], [/samba/i, 'SAM', '#00a0df', '#fff'],
    [/national bank|\bnbp\b/i, 'NBP', '#00703c', '#fff'], [/dubai islamic|\bdib\b/i, 'DIB', '#0f4c3a', '#fff'], [/bank of punjab|\bbop\b/i, 'BOP', '#00743a', '#fff'],
    [/khyber|bok\b/i, 'BOK', '#0b6b3a', '#fff'], [/sindh bank/i, 'SB', '#b71c1c', '#fff'], [/zarai|ztbl/i, 'ZT', '#2e7d32', '#fff'], [/bank islami/i, 'BIP', '#1b5e20', '#fff'],
    [/mcb islamic/i, 'MCBI', '#0b7a3f', '#fff'], [/\bbankislami/i, 'BIP', '#1b5e20', '#fff'], [/easypaisa|easy paisa/i, 'ep', '#2fb34a', '#fff'],
    [/jazz ?cash|jazzcash/i, 'JC', '#d0112b', '#ffd400'], [/sada ?pay/i, 'SP', '#00cfc1', '#0a2540'], [/naya ?pay/i, 'NP', '#ff6a1a', '#fff'],
    [/raast/i, 'RAAST', '#00a99d', '#fff'], [/u ?paisa/i, 'UP', '#6a1b9a', '#fff'], [/cash/i, 'CASH', '#475467', '#fff']
  ];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function info(b) {
    const name = typeof b === 'string' ? b : [b.bank, b.title].filter(Boolean).join(' ');
    for (const r of B) if (r[0].test(name)) return { mark: r[1], bg: r[2], fg: r[3] };
    const w = String(name || 'Bank').replace(/\b(bank|limited|ltd|pakistan|islamic)\b/ig, '').trim().split(/\s+/).filter(Boolean);
    const mark = (w.length > 1 ? w.slice(0, 3).map(x => x[0]).join('') : (w[0] || 'BK').slice(0, 3)).toUpperCase();
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return { mark, bg: 'hsl(' + h + ',55%,36%)', fg: '#fff' };
  }
  /** HTML for a rounded logo tile. size in px. */
  function html(b, size) {
    size = size || 44;
    if (b && typeof b === 'object' && b.logo) return '<span class="blg" style="width:' + size + 'px;height:' + size + 'px"><img src="' + esc(b.logo) + '" alt="' + esc(b.bank || '') + '" style="width:100%;height:100%;object-fit:contain"></span>';
    const i = info(b || ''), fs = Math.round(size * (i.mark.length > 3 ? .27 : i.mark.length > 2 ? .33 : .4));
    return '<span class="blg" style="width:' + size + 'px;height:' + size + 'px;background:' + i.bg + ';color:' + i.fg + ';font-size:' + fs + 'px" aria-hidden="true">' + esc(i.mark) + '</span>';
  }
  const css = '.blg{display:inline-grid;place-items:center;border-radius:12px;font:800 13px/1 "Plus Jakarta Sans",system-ui,sans-serif;letter-spacing:-.02em;flex:none;overflow:hidden;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.18),inset 0 0 0 1px rgba(255,255,255,.25);text-align:center}';
  const api = { info, html, css, list: B.map(x => x[1]) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BankLogo = api;
})(typeof window !== 'undefined' ? window : this);
