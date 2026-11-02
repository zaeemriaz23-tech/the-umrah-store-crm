/* Bank accounts page (agents, staff) + the one-tap "Add payment record" flow */
'use strict';
const THEME = { green: ['#073526', '#1f9a70'], gold: ['#6b4f12', '#c9a23f'], navy: ['#0b2447', '#3b6fc4'], maroon: ['#561323', '#b5314f'], slate: ['#1f2937', '#64748b'], teal: ['#0b3b3c', '#19a3a0'] };
const BKIND = { bank: 'Bank account', wallet: 'Mobile wallet', raast: 'Raast ID' };
const bankLines = b => [['Account no.', b.account], ['IBAN', b.iban], ['Wallet no.', b.wallet], ['Raast ID', b.raast], ['SWIFT', b.swift]].filter(x => x[1]);
const bankText = b => [(b.bank || '') + ' - ' + (b.title || ''), ...bankLines(b).map(x => x[0] + ': ' + x[1]), b.branch ? 'Branch: ' + b.branch : ''].filter(Boolean).join('\n');
const bankQr = b => b.qr || ((b.iban || b.account || b.wallet || b.raast) ? '/api/qr?text=' + encodeURIComponent(b.iban || b.account || b.wallet || b.raast) : '');
function bankCardHtml(b, actions = '') {
  const [c1, c2] = THEME[b.theme] || THEME.green, q = bankQr(b);
  return `<div class="bkw"><div class="bkc" style="background:linear-gradient(135deg,${c1},${c2})"><div class="tp"><div class="bkh">${BankLogo.html(b, 48)}<div><div class="kd">${esc(BKIND[b.kind] || 'Bank account')}${b.currency && b.currency !== 'PKR' ? ' · ' + esc(b.currency) : ''}${b.active === false ? ' · hidden' : ''}</div><div class="bn">${esc(b.bank || b.title)}</div><div class="tt">${esc(b.title)}${b.branch ? ' · ' + esc(b.branch) : ''}</div></div></div>${q ? `<img class="qr" src="${esc(q)}" alt="QR">` : ''}</div>
  ${bankLines(b).map(([l, v]) => `<div class="fl"><span>${l}</span><code>${esc(v)}</code><button class="cp" data-act="copyTxt" data-a="${esc(v)}">Copy</button></div>`).join('')}${b.instructions ? `<div class="in">${esc(b.instructions)}</div>` : ''}</div>${actions}</div>`;
}
ACT.copyTxt = (t, btn) => { const done = () => { if (btn) { const o = btn.textContent; btn.textContent = 'Copied'; btn.classList.add('ok'); setTimeout(() => { btn.textContent = o; btn.classList.remove('ok'); }, 1300); } else toast('Copied'); }; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(done, () => { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); done(); }); };
ACT.copyBank = i => { const b = (S.bank || []).find(x => x.id === i); if (b) ACT.copyTxt(bankText(b)); };
ACT.waBank = i => { const b = (S.bank || []).find(x => x.id === i); if (b) window.open(waLinkTo('Payment details - ' + (S.company.name || '') + '\n\n' + bankText(b)), '_blank'); };
ACT.copyPubLink = () => ACT.copyTxt(location.origin + '/bank-accounts');
ACT.waPubLink = () => window.open(waLinkTo('Our bank accounts: ' + location.origin + '/bank-accounts'), '_blank');

VIEWS.banking = {
  title: 'Bank accounts', noLive: false,
  render() {
    const banks = (S.bank || []).filter(b => isStaff() || b.active !== false), staff = isStaff(), pr = S.payRules || {}, w = S.wallet;
    const mine = (S.payments || []).filter(p => isAgent() ? true : false).sort((a, b) => ((b.created || b.date) < (a.created || a.date) ? -1 : 1)).slice(0, 4);
    const online = isAgent() && S.flags.payfast;
    return `<div class="ph"><div><h1>Bank accounts</h1><p>${staff ? 'Accounts agents can pay into' : 'Pay into any account below, then add your payment record'}</p></div><div class="sp">${online ? `<button class="btn gold" data-act="payOnline">${ic('card')}Pay online</button>` : ''}${staff && can('settings.banking') ? `<button class="btn" data-act="goBankSet">${ic('settings')}Manage accounts</button>` : ''}${isSup() ? '' : `<button class="btn pri" data-act="payAdd">${ic('plus')}Add payment record</button>`}</div></div>
    ${w ? `<div class="kpis"><div class="kpi"><span>Outstanding</span><b>${fmt(w.balance)}</b></div><div class="kpi"><span>Credit available</span><b class="${w.available < 0 ? 'neg' : 'pos'}">${fmtN(w.available)}</b></div><div class="kpi"><span>Awaiting approval</span><b>${fmt(w.pending)}</b></div></div><div class="gap"></div>` : ''}
    ${pr.instructions ? `<div class="okbox" style="margin-bottom:14px">${esc(pr.instructions)}</div>` : ''}
    ${banks.length ? `<div class="bkg">${banks.map(b => bankCardHtml(b, `<div class="bka"><button class="btn sm pri" data-act="payAdd" data-a="" data-bank="${esc(b.id)}">${ic('check', 'sm')}I paid this account</button><button class="btn sm" data-act="copyBank" data-a="${esc(b.id)}">${ic('copy', 'sm')}Copy details</button><button class="btn sm wa" data-act="waBank" data-a="${esc(b.id)}">WhatsApp</button></div>`)).join('')}</div>` : `<div class="card">${empty('wallet', 'No bank accounts yet', staff ? 'Add your bank accounts, wallets and Raast IDs under Settings > Banking.' : 'The office has not published any bank accounts yet.', staff && can('settings.banking') ? `<button class="btn pri" data-act="goBankSet">Add bank account</button>` : '')}</div>`}
    ${pr.publicBankPage !== false && banks.length ? `<div class="card cp" style="margin-top:14px"><div class="row sb" style="gap:10px;flex-wrap:wrap"><div><b>Public bank page</b><div class="sub">Anyone can open this list - no login needed: <span class="mono">${esc(location.origin)}/bank-accounts</span></div></div><div class="row"><button class="btn sm" data-act="copyPubLink">${ic('copy', 'sm')}Copy link</button><button class="btn sm wa" data-act="waPubLink">Share on WhatsApp</button><a class="btn sm" target="_blank" href="/bank-accounts">Open</a></div></div></div>` : ''}
    ${mine.length ? `<div class="gap"></div><div class="card"><div class="ch"><h3>Your latest payments</h3><a class="lnk" href="#/payments">View all</a></div>${mine.map(p => `<div class="item"><div class="mid"><b>${fmt(p.amt)}</b> · ${esc(p.method)}${p.bankName ? ' · ' + esc(p.bankName) : ''}<div class="sub">${fdate(p.date)} ${esc(p.ref || '')}</div></div>${badge(p.status)}</div>`).join('')}</div>` : ''}`;
  }
};
ACT.goBankSet = () => { UI.setTab = 'bank'; go('settings'); };

/* ---------- Add payment record: amount, which account you paid, receipt - done ---------- */
const PY = { bank: '', file: null };
const methodFor = b => (b ? (b.kind === 'wallet' ? 'JazzCash / Easypaisa' : b.kind === 'raast' ? 'Online banking / Raast' : 'Bank transfer') : 'Cash');
const owedOf = pid => { if (isAgent()) { const w = S.wallet || {}; return { owed: Math.max(0, w.balance || 0), avail: w.available, name: S.user.name }; } const p = (S.parties || []).find(x => x.id == pid); return p ? { owed: Math.max(0, p.bal || 0), avail: p.kind === 'agent' ? (p.limit || 0) - (p.bal || 0) : null, name: p.name, supplier: p.kind === 'supplier' } : null; };
function paySummary(pid) {
  const o = owedOf(pid); if (!o) return '<div class="pysum empty">Select an account to see what is outstanding</div>';
  const neg = o.avail != null && o.avail < 0;
  return `<div class="pysum"><div><small>${o.supplier ? 'We owe supplier' : 'Total outstanding'}</small><b class="${o.owed > 0 ? 'neg' : ''}">${fmt(o.owed)}</b></div>${o.avail != null ? `<div><small>Balance</small><b class="${neg ? 'neg' : ''}">${fmtN(o.avail)}</b></div>` : ''}${o.owed > 0 ? `<button type="button" class="btn sm pri" data-act="pyFull" data-a="${o.owed}">${ic('check', 'sm')}Pay total ${fnum(o.owed)}</button>` : ''}</div>`;
}
const bankTile = (b, on) => `<button type="button" class="bkt ${on ? 'on' : ''}" data-act="pyBank" data-a="${esc(b.id)}">${BankLogo.html(b, 40)}<span><b>${esc(b.bank || b.title)}</b><small>${esc(BKIND[b.kind])}${(b.account || b.wallet || b.raast || b.iban) ? ' · …' + esc(String(b.account || b.wallet || b.raast || b.iban).replace(/\s/g, '').slice(-4)) : ''}</small></span><i>${ic('check', 'sm')}</i></button>`;
ACT.payAdd = (pid, btn) => {
  const staff = isStaff(), P0 = pid ? +pid : '', pr = S.payRules || { methods: ['Bank transfer', 'Cash', 'Cheque', 'Other'], quickAmounts: [] }, banks = (S.bank || []).filter(b => b.active !== false);
  PY.bank = (btn && btn.dataset && btn.dataset.bank) || ''; PY.file = null;
  const reqR = !staff && pr.requireReceipt, reqF = !staff && pr.requireRef, who = isAgent() ? S.user.pid : P0;
  openModal({ title: 'Add payment', wide: true, body: `<div class="pyw">
  <div class="pyl"><div class="pystep"><span>1</span>Who and how much</div>
  ${staff ? fld('Account *', `<select id="py-p" data-chg="pyParty">${opts((S.parties || []).filter(p => p.active !== false).map(p => [p.id, p.name + ' (' + (p.kind === 'supplier' ? 'supplier - payment out' : p.kind + ' - receipt') + ')']), P0, 'Select account...')}</select>`) : ''}
  <div id="py-sum">${paySummary(who)}</div>
  ${fld('Amount (PKR) *', '<input id="py-a" type="number" inputmode="numeric" min="1" placeholder="0" class="pybig">')}
  ${(pr.quickAmounts || []).length ? `<div class="chips">${pr.quickAmounts.map(n => `<button type="button" class="chip" data-act="pyAmt" data-a="${n}">${fnum(n)}</button>`).join('')}</div>` : ''}
  ${fld('Against booking (optional)', `<select id="py-b" data-chg="pyBook">${bookOpts(who)}</select>`)}
  </div>
  <div class="pyr"><div class="pystep"><span>2</span>Where was it paid</div>
  <div class="bkts" id="py-banks">${banks.map(b => bankTile(b, PY.bank === b.id)).join('')}<button type="button" class="bkt ${PY.bank === '' ? 'on' : ''}" data-act="pyBank" data-a=""><span class="blg" style="width:40px;height:40px;background:#475467;color:#fff;font-size:12px">CASH</span><span><b>Cash / cheque / other</b><small>Paid at the office</small></span><i>${ic('check', 'sm')}</i></button></div>
  <div class="pystep" style="margin-top:14px"><span>3</span>Proof</div>
  <label class="drop" id="py-drop"><input id="py-f" type="file" accept="image/*,.pdf" class="hide" data-chg="pyFile"><span id="py-fn">${ic('upload')}<b>${reqR ? 'Receipt required - ' : ''}Tap to add receipt</b><small>Photo or PDF, max 6 MB</small></span></label>
  ${fld('Reference / transaction ID' + (reqF ? ' *' : ''), '<input id="py-r" placeholder="Optional but speeds up approval">')}
  <details class="more"><summary>More details</summary><div class="g1" style="margin-top:10px"><div class="g2">${fld('Date', `<input id="py-d" type="date" value="${todayISO()}">`)}${fld('Method', `<select id="py-m">${opts(pr.methods, methodFor(banks.find(b => b.id === PY.bank)))}</select>`)}</div>${fld('Note', '<input id="py-n">')}</div></details></div>
  </div><p class="hint" style="margin-top:12px">${staff ? 'Recorded by staff - ' + (can('payments.approve') ? 'posts to the ledger immediately.' : 'goes to the approval queue.') : (pr.autoApproveUnder > 0 ? 'Receipts up to ' + fmt(pr.autoApproveUnder) + ' post to your ledger instantly; larger ones after the office approves.' : 'Posted to your ledger as soon as the office approves it.')}</p>`, foot: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="paySave">Save payment</button>' });
};
CHG.pyParty = v => { const b = $('#py-b'); if (b) b.innerHTML = bookOpts(+v); const s = $('#py-sum'); if (s) s.innerHTML = paySummary(+v); };
CHG.pyBook = v => { const bk = (S.bookings || []).find(x => x.id === v); if (bk && !val('py-a')) $('#py-a').value = Math.round(bSell(bk)); };
ACT.pyFull = n => { $('#py-a').value = n; };
ACT.pyAmt = n => { $('#py-a').value = n; };
ACT.pyBank = id => { PY.bank = id; $$('#py-banks .bkt').forEach(c => c.classList.toggle('on', c.dataset.a === id)); const b = (S.bank || []).find(x => x.id === id), m = $('#py-m'); if (m) m.value = methodFor(b); };
CHG.pyFile = (v, t) => { const f = t.files[0]; PY.file = f || null; const n = $('#py-fn'); if (!f) return; if (f.size > 6e6) { PY.file = null; t.value = ''; return toast('Receipt too large (max 6 MB)', true); } n.innerHTML = /^image\//.test(f.type) ? `<img src="${URL.createObjectURL(f)}" class="pv" alt=""><small>${esc(f.name)} · tap to change</small>` : `${ic('file')}<b>${esc(f.name)}</b><small>tap to change</small>`; };
ACT.paySave = async (a, b) => {
  const f = PY.file; let file; if (f) file = { name: f.name, data: await readFile(f) };
  try { const r = await doRpc(b, 'addPayment', { partyId: isStaff() ? +val('py-p') : undefined, amt: val('py-a'), date: val('py-d'), method: val('py-m'), ref: val('py-r'), note: val('py-n'), bookingId: val('py-b'), bankId: PY.bank, file }); closeModal(); toast(r.status === 'Approved' ? 'Payment saved and posted to the ledger' : 'Payment submitted - waiting for approval'); } catch { /* shown by doRpc */ }
};
ACT.bankInfo = () => go('banking');
