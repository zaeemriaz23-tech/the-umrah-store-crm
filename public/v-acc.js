/* Accounts, ledgers, payments, payment links, journal */
'use strict';
const KINDS = { agent: 'Agents', supplier: 'Suppliers', customer: 'B2C customers' };
const balTxt = (p, bal) => { const sup = p.kind === 'supplier'; if (!bal) return '<span class="faint">0</span>'; const owe = sup ? bal > 0 : bal > 0; return `<b class="num ${sup ? (bal > 0 ? 'neg' : 'pos') : (bal > 0 ? 'neg' : 'pos')}">${fmt(Math.abs(bal))}</b> <span class="sub">${sup ? (bal > 0 ? 'we owe' : 'advance') : (bal > 0 ? 'owes us' : 'advance')}</span>`; };

/* ---------- accounts list ---------- */
VIEWS.accounts = {
  roles: ['admin', 'staff'], title: 'Accounts & ledgers',
  render(kind) {
    kind = KINDS[kind] ? kind : (UI.accKind || 'agent'); UI.accKind = kind; const q = (UI.accQ || '').toLowerCase();
    const list = (S.parties || []).filter(p => p.kind === kind && (!q || (p.name + ' ' + p.phone + ' ' + p.city).toLowerCase().includes(q)));
    const all = (S.parties || []).filter(p => p.kind === kind), tot = sum(all, p => p.bal);
    return `<div class="ph"><div><h1>Accounts & ledgers</h1><p>Every agent, supplier and customer has a live ledger.</p></div><div class="sp">${can(UI.accKind === 'supplier' ? 'ledgers.supplier.export' : 'ledgers.agent.export') ? `<button class="btn" data-act="ledCsv">${ic('download')}Export balances</button>` : ''}${can((kind === 'customer' ? 'customers' : kind + 's') + '.create') ? `<button class="btn pri" data-act="partyEdit" data-a="new">${ic('plus')}Add ${kind === 'customer' ? 'customer' : kind}</button>` : ''}</div></div>
    <div class="row sb" style="margin-bottom:14px"><div class="tabs">${Object.entries(KINDS).map(([k, l]) => `<button class="${k === kind ? 'on' : ''}" data-act="accKind" data-a="${k}">${l} <span class="faint">${(S.parties || []).filter(p => p.kind === k).length}</span></button>`).join('')}</div>
    <div class="gs" style="background:#fff"><input placeholder="Search..." value="${esc(UI.accQ || '')}" data-inp="accQ"></div></div>
    <div class="stats"><div class="card stat"><div class="l">Total ${kind === 'supplier' ? 'payable' : 'receivable'}</div><div class="v">${fmt(Math.max(0, tot))}</div></div><div class="card stat"><div class="l">Accounts</div><div class="v">${all.length}</div></div>${kind === 'agent' ? `<div class="card stat"><div class="l">Credit extended</div><div class="v">${fmt(sum(all, p => p.limit))}</div></div>` : ''}</div>
    <div class="card" id="acclist">${accTable(list, kind)}</div>`;
  }
};
function accTable(list, kind) {
  if (!list.length) return empty('users', 'No ' + KINDS[kind].toLowerCase() + ' yet', isAdmin() || kind === 'customer' ? 'Add your first one to start recording bookings and ledgers.' : '');
  return `<div class="tw"><table class="t"><thead><tr><th>Name</th><th>Contact</th><th class="r">Balance</th>${kind === 'agent' ? '<th class="r">Credit limit</th><th class="r">Available</th>' : ''}<th class="r">Pending receipts</th><th></th></tr></thead><tbody>${list.sort((a, b) => a.name.localeCompare(b.name)).map(p => `<tr class="click" data-act="goAcc" data-a="${p.id}"><td><div class="row"><div class="av" style="width:32px;height:32px;font-size:12px">${esc(initials(p.name))}</div><div><b>${esc(p.name)}</b>${p.active === false ? ' <span class="bdg gray">inactive</span>' : ''}<div class="sub">${esc(p.login ? 'login: ' + p.login : '')}</div></div></div></td><td>${esc(p.phone || '')}<div class="sub">${esc(p.city || '')}</div></td><td class="r">${balTxt(p, p.bal)}</td>${kind === 'agent' ? `<td class="r num">${fmt(p.limit)}</td><td class="r num ${p.limit - p.bal < 0 ? 'neg' : ''}">${fmt(p.limit - p.bal)}</td>` : ''}<td class="r num">${p.pending ? fmt(p.pending) : '-'}</td><td class="r">${ic('arrow', 'sm')}</td></tr>`).join('')}</tbody></table></div>`;
}
ACT.accKind = k => go('accounts', k);
ACT.goAcc = id => go('account', id);
INP.accQ = debounce(v => { UI.accQ = v; const l = (S.parties || []).filter(p => p.kind === UI.accKind && (!v || (p.name + p.phone + p.city).toLowerCase().includes(v.toLowerCase()))); $('#acclist').innerHTML = accTable(l, UI.accKind); });
ACT.ledCsv = async () => {
  const kind = UI.accKind || 'agent', rows = (S.parties || []).filter(p => p.kind === kind);
  if (isStaff()) { try { await rpc('logExport', { kind: kind === 'supplier' ? 'ledger-supplier' : 'ledger-agent', what: 'balances ' + kind, rows: rows.length }); } catch (e) { return toast(e.message, true); } }
  downloadCSV('balances-' + kind + '-' + todayISO() + '.csv', [['Name', 'Type', 'Balance', 'Credit limit', 'Phone'], ...rows.map(p => [p.name, p.kind, p.bal, p.limit || '', p.phone])]);
};

/* ---------- party editor ---------- */
ACT.partyEdit = id => {
  const nw = id === 'new', kind = nw ? (UI.accKind || 'agent') : P(id).kind, p = nw ? { kind, name: '', phone: '', email: '', city: '', address: '', notes: '', limit: 0, opening: 0, active: true } : P(id);
  const login = !nw && p.login;
  openModal({ title: nw ? 'Add ' + kind : 'Edit ' + p.name, body: `<div class="g2">${fld('Name *', `<input id="pe-n" value="${esc(p.name)}">`)}${fld('Phone / WhatsApp', `<input id="pe-p" value="${esc(p.phone)}">`)}${fld('Email', `<input id="pe-e" value="${esc(p.email)}">`)}${fld('City', `<input id="pe-c" value="${esc(p.city)}">`)}
  ${kind === 'agent' ? fld('Credit limit (PKR)', `<input id="pe-l" type="number" value="${p.limit || 0}">`) : ''}${isAdmin() ? fld('Opening balance (PKR)', `<input id="pe-o" type="number" value="${p.opening || 0}" placeholder="0">`) : ''}</div>
  ${fld('Address', `<input id="pe-a" value="${esc(p.address || '')}">`, '')}<div class="gap"></div>${fld('Notes', `<textarea id="pe-nt">${esc(p.notes || '')}</textarea>`)}
  ${kind !== 'customer' && can(kind + 's.edit') ? `<div class="gap"></div><div class="sec">Portal login ${login ? '(exists: ' + esc(p.login) + ')' : ''}</div><div class="g2">${login ? '' : fld('Username', '<input id="pe-u" autocomplete="off">')}${fld(login ? 'New password (leave blank to keep)' : 'Password (8+ characters)', '<input id="pe-pw" type="text" autocomplete="off">')}</div><p class="hint">${kind === 'agent' ? 'Agents can only see their own bookings, ledger and payments.' : 'Suppliers see only the services assigned to them.'}</p>` : ''}
  ${!nw ? `<div class="gap"></div><label class="chk"><input type="checkbox" id="pe-act" ${p.active !== false ? 'checked' : ''}>Account active</label>` : ''}<div class="hint" style="margin-top:8px">Opening balance: ${kind === 'supplier' ? 'positive = we owe them' : 'positive = they owe us'}.</div>`,
    foot: `${!nw && can((kind === 'customer' ? 'customers' : kind + 's') + '.delete') ? `<button class="btn ghost" style="margin-right:auto;color:var(--red)" data-act="partyDel" data-a="${id}">${ic('trash', 'sm')}Delete</button>` : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="partySave" data-a="${id}">Save</button>` });
};
ACT.partySave = async (id, b) => { const nw = id === 'new', kind = nw ? (UI.accKind || 'agent') : P(id).kind; await doRpc(b, 'saveParty', { id: nw ? undefined : +id, kind, name: val('pe-n'), phone: val('pe-p'), email: val('pe-e'), city: val('pe-c'), address: val('pe-a'), notes: val('pe-nt'), limit: val('pe-l'), opening: val('pe-o'), login: val('pe-u'), password: val('pe-pw'), active: nw ? true : $('#pe-act').checked }, 'Saved', () => closeModal()); };
ACT.partyDel = async id => { if (await confirmBox('Delete account', 'Accounts with transactions cannot be deleted. Continue?', 'Delete', true)) { try { await rpc('delParty', { id: +id }); closeModal(); toast('Deleted'); await load(); go('accounts'); } catch (e) { toast(e.message, true); } } };

/* ---------- account page + ledger ---------- */
VIEWS.account = {
  title: id => P(id).name || 'Account',
  render(id) {
    id = +id; const p = (S.parties || []).find(x => x.id === id); if (!p) return empty('search', 'Account not found', '');
    if (!isStaff() && S.user.pid !== id) return empty('shield', 'Not available', '');
    const w = isAgent() ? S.wallet : null, staff = isStaff(), tab = UI.accTab || 'ledger';
    const hero = p.kind === 'supplier' ? `<div class="stat card hot"><div class="l">Payable to ${esc(p.name)}</div><div class="v">${fmt(p.bal)}</div></div>` : `<div class="wallet"><div class="card stat hot"><div class="l">Available balance</div><div class="v ${(p.limit || 0) - p.bal < 0 ? 'neg' : ''}">${fmtN((p.limit || 0) - p.bal)}</div><div class="s">${(p.limit || 0) - p.bal < 0 ? 'bookings stay open - settle when you can' : 'credit limit − outstanding'}</div></div><div class="card stat"><div class="l">Outstanding</div><div class="v ${p.bal > 0 ? 'neg' : ''}">${fmt(p.bal)}</div><div class="s">${p.bal < 0 ? 'advance deposit' : 'to be paid'}</div></div>${p.kind === 'agent' ? `<div class="card stat"><div class="l">Credit limit</div><div class="v">${fmt(p.limit)}</div></div>` : ''}<div class="card stat"><div class="l">Receipts awaiting approval</div><div class="v">${fmt(w ? w.pending : p.pending)}</div></div></div>`;
    return `<div class="no-print">${staff ? `<a class="btn ghost sm" href="#/accounts/${p.kind}">${ic('back', 'sm')}${KINDS[p.kind]}</a>` : ''}</div>
    <div class="ph"><div><h1>${esc(p.name)}</h1><p><span class="tag">${p.kind === 'customer' ? 'B2C customer' : p.kind}</span> ${esc([p.phone, p.email, p.city].filter(Boolean).join(' · '))}</p></div><div class="sp no-print">
    ${p.kind !== 'supplier' && !isSup() ? `<button class="btn pri" data-act="payAdd" data-a="${p.id}">${ic('receipt')}Add payment record</button>` : ''}${staff && p.kind === 'supplier' ? `<button class="btn pri" data-act="payAdd" data-a="${p.id}">${ic('wallet')}Pay supplier</button>` : ''}
    ${isAgent() && S.flags.payfast ? `<button class="btn gold" data-act="payOnline">${ic('card')}Pay online</button>` : ''}${staff && p.kind !== 'supplier' ? `<button class="btn" data-act="linkNew" data-a="${p.id}">${ic('link')}Payment link</button>` : ''}${can(p.kind === 'supplier' ? 'ledgers.supplier.create' : 'ledgers.agent.create') ? `<button class="btn" data-act="jvNew" data-a="${p.id}">${ic('edit')}Journal entry</button><button class="btn" data-act="partyEdit" data-a="${p.id}">${ic('settings')}Edit</button>` : ''}</div></div>
    <div class="pr-only" style="margin-bottom:14px"><img src="${logoUrl()}" style="height:70px"><h2>Statement of account - ${esc(p.name)}</h2></div>${hero}
    <div class="tabs no-print" style="margin-bottom:14px">${['ledger', ...(isSup() ? [] : ['bookings']), 'payments'].map(t => `<button class="${tab === t ? 'on' : ''}" data-act="accTab" data-a="${t}">${{ ledger: 'Ledger', bookings: 'Bookings', payments: 'Payments' }[t]}</button>`).join('')}</div><div id="acc-body">${tab === 'ledger' ? '<div class="card cp"><span class="spin dk"></span></div>' : tab === 'bookings' ? accBookings(p) : accPays(p)}</div>`;
  },
  mount(id) { if ((UI.accTab || 'ledger') === 'ledger') loadLedger(+id); }
};
ACT.accTab = t => { UI.accTab = t; renderView(); };
const accBookings = p => { const bs = (S.bookings || []).filter(b => b.partyId == p.id).sort((a, b) => b.createdAt < a.createdAt ? -1 : 1); return `<div class="card">${bs.length ? bs.map(bRow).join('') : empty('briefcase', 'No bookings yet', '')}</div>`; };
const accPays = p => { const ps = (S.payments || []).filter(x => x.partyId == p.id).sort((a, b) => b.created < a.created ? -1 : 1); return `<div class="card">${payTable(ps, false)}</div>`; };
async function loadLedger(id) {
  try { const r = await api('/api/ledger/' + id); UI.led = r; drawLedger(); } catch (e) { const b = $('#acc-body'); if (b) b.innerHTML = `<div class="card cp err">${esc(e.message)}</div>`; }
}
function drawLedger() {
  const r = UI.led, b = $('#acc-body'); if (!r || !b || (UI.accTab || 'ledger') !== 'ledger') return; const sup = r.party.kind === 'supplier', f = UI.ledF || (UI.ledF = {});
  let open = 0, rows = r.rows;
  if (f.from) { const before = rows.filter(x => x.d < f.from); open = before.length ? before[before.length - 1].bal : 0; rows = rows.filter(x => x.d >= f.from); }
  if (f.to) rows = rows.filter(x => x.d <= f.to);
  const dr = sum(rows, x => x.dr), cr = sum(rows, x => x.cr), close = rows.length ? rows[rows.length - 1].bal : open;
  b.innerHTML = `<div class="fb no-print"><div class="fld"><span>From</span><input type="date" value="${f.from || ''}" data-chg="ledF" data-k="from"></div><div class="fld"><span>To</span><input type="date" value="${f.to || ''}" data-chg="ledF" data-k="to"></div><div class="qk"><button class="btn sm" data-act="ledClear">Clear</button><button class="btn sm" data-act="ledPrint">${ic('print', 'sm')}Print statement</button><button class="btn sm" data-act="ledExport">${ic('download', 'sm')}CSV</button></div></div>
  <div class="card"><div class="tw"><table class="t"><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th></tr></thead><tbody>
  ${f.from ? `<tr><td colspan="5"><i class="mute">Balance brought forward</i></td><td class="r num"><b>${fnum(open)}</b></td></tr>` : ''}${rows.map(x => `<tr><td class="num">${fdate(x.d)}</td><td>${x.bid ? `<a class="bno" href="#/booking/${esc(x.bid)}">${esc(x.ref)}</a>` : x.k === 'payment' ? `<a href="/receipt/${esc(x.ref)}" target="_blank" class="bno">${esc(x.ref)}</a>` : esc(x.ref)}</td><td>${esc(x.t)}${x.k === 'journal' && isAdmin() ? ` <button class="btn ghost sm no-print" data-act="jvDel" data-a="${esc(x.eid)}" title="Delete entry">${ic('trash', 'sm')}</button>` : ''}</td><td class="r num">${x.dr ? fnum(x.dr) : ''}</td><td class="r num">${x.cr ? fnum(x.cr) : ''}</td><td class="r num"><b>${fnum(x.bal)}</b></td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="3">Totals · closing balance ${sup ? '(payable)' : '(receivable)'}</td><td class="r num">${fnum(dr)}</td><td class="r num">${fnum(cr)}</td><td class="r num ${close > 0 && !sup ? 'neg' : ''}">${fnum(close)}</td></tr></tfoot></table></div>${rows.length || f.from ? '' : empty('book', 'No transactions yet', 'Bookings, payments and journal entries will post here instantly.')}</div>`;
}
CHG.ledF = (v, t) => { UI.ledF[t.dataset.k] = v; drawLedger(); };
ACT.ledClear = () => { UI.ledF = {}; drawLedger(); };
ACT.ledPrint = () => window.print();
ACT.ledExport = () => downloadCSV((UI.led.party.name) + '-ledger.csv', [['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'], ...UI.led.rows.map(x => [x.d, x.ref, x.t, x.dr, x.cr, x.bal])]);
ACT.jvNew = id => openModal({ title: 'Journal entry', body: `<div class="g1">${fld('Account', `<select id="jv-p">${opts((S.parties || []).map(p => [p.id, p.name + ' (' + p.kind + ')']), id)}</select>`)}<div class="g2">${fld('Date', `<input id="jv-d" type="date" value="${todayISO()}">`)}${fld('Description', '<input id="jv-t" placeholder="Adjustment, discount, correction...">')}</div><div class="g2">${fld('Debit (PKR)', '<input id="jv-dr" type="number" min="0">')}${fld('Credit (PKR)', '<input id="jv-cr" type="number" min="0">')}</div><p class="hint">Agents/customers: debit increases what they owe. Suppliers: credit increases what we owe.</p></div>`, foot: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="jvSave">Post entry</button>' });
ACT.jvSave = async (a, b) => { await doRpc(b, 'addEntry', { partyId: +val('jv-p'), date: val('jv-d'), t: val('jv-t'), dr: val('jv-dr'), cr: val('jv-cr') }, 'Entry posted', closeModal); };
ACT.jvDel = async id => { if (await confirmBox('Delete entry', 'Remove this journal entry from the ledger?', 'Delete', true)) { await doRpc(null, 'delEntry', { id }, 'Entry removed'); if (UI.led) loadLedger(UI.led.party.id); } };

/* ---------- payments ---------- */
const pf = () => UI.f.pay || (UI.f.pay = {});
function payTable(ps, showParty = true) {
  if (!ps.length) return empty('wallet', 'No payments', 'Payments and receipts will appear here.');
  return `<div class="tw"><table class="t"><thead><tr><th>Date</th><th>Ref</th>${showParty ? '<th>Account</th>' : ''}<th>Method</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>${ps.map(p => `<tr><td class="num">${fdate(p.date)}</td><td><span class="bno">${esc(p.id)}</span><div class="sub">${esc(p.ref || '')}</div></td>${showParty ? `<td><a href="#/account/${p.partyId}"><b>${esc(P(p.partyId).name)}</b></a><div class="sub">${p.dir === 'out' ? 'Paid out' : 'Received'}</div></td>` : ''}<td>${esc(p.method)}${p.bankName ? `<div class="sub">${esc(p.bankName)}</div>` : ''}${p.via === 'payfast' ? ' <span class="bdg blue">online</span>' : p.via === 'link' ? ' <span class="bdg blue">link</span>' : ''}${p.bookingId ? `<div class="sub">${esc(((S.bookings || []).find(b => b.id === p.bookingId) || {}).no || '')}</div>` : ''}</td><td class="r num"><b>${fmt(p.amt)}</b></td><td>${badge(p.status)}</td>
  <td class="r" style="white-space:nowrap"><a class="btn sm ghost" target="_blank" href="/receipt/${esc(p.id)}" title="Printable receipt">${ic('print', 'sm')}</a>${p.rcd ? `<a class="btn sm ghost" target="_blank" href="${esc(p.rcd)}" title="Uploaded proof">${ic('file', 'sm')}</a>` : ''}${isStaff() && p.status === 'Pending' ? `<button class="btn sm pri" data-act="payOk" data-a="${esc(p.id)}">Approve</button><button class="btn sm" data-act="payNo" data-a="${esc(p.id)}">Reject</button>` : ''}${isAdmin() ? `<button class="btn sm ghost" data-act="payDel" data-a="${esc(p.id)}">${ic('trash', 'sm')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
const payRows = () => { const f = pf(), q = (f.q || '').toLowerCase(); return (S.payments || []).filter(p => (!f.status || p.status === f.status) && (!f.party || p.partyId == f.party) && (!f.from || p.date >= f.from) && (!f.to || p.date <= f.to) && (!q || (p.id + p.ref + P(p.partyId).name + p.note).toLowerCase().includes(q))).sort((a, b) => (b.created || b.date) < (a.created || a.date) ? -1 : 1); };
VIEWS.payments = {
  title: 'Payments',
  render() {
    const f = pf(), rows = payRows(), staff = isStaff(), links = (S.paylinks || []).filter(l => l.status === 'Open');
    const inn = sum(rows.filter(p => p.status === 'Approved' && p.dir === 'in'), p => p.amt), out = sum(rows.filter(p => p.status === 'Approved' && p.dir === 'out'), p => p.amt);
    return `<div class="ph"><div><h1>Payments</h1><p>${staff ? 'Received ' + fmt(inn) + ' · paid out ' + fmt(out) : 'Your payment history and receipts'}</p></div><div class="sp">${isAgent() && S.flags.payfast ? `<button class="btn gold" data-act="payOnline">${ic('card')}Pay online (PayFast)</button>` : ''}<button class="btn" data-act="bankInfo">${ic('qr')}Bank details & QR</button>${staff ? `<button class="btn" data-act="linkNew">${ic('link')}Payment link</button>` : ''}${isSup() ? '' : `<button class="btn pri" data-act="payAdd">${ic('plus')}Add payment record</button>`}</div></div>
    <div class="fb"><div class="fld grow"><span>Search</span><input value="${esc(f.q || '')}" placeholder="Reference, account, note" data-inp="payQ"></div><div class="fld"><span>Status</span><select data-chg="payF" data-k="status">${opts(['Pending', 'Approved', 'Rejected', 'Initiated', 'Failed'], f.status, 'All')}</select></div>${staff ? `<div class="fld"><span>Account</span><select data-chg="payF" data-k="party">${opts((S.parties || []).map(p => [p.id, p.name]), f.party, 'All')}</select></div>` : ''}<div class="fld"><span>From</span><input type="date" value="${f.from || ''}" data-chg="payF" data-k="from"></div><div class="fld"><span>To</span><input type="date" value="${f.to || ''}" data-chg="payF" data-k="to"></div><div class="qk"><button class="btn sm ghost" data-act="payClear">${ic('x', 'sm')}Clear filters</button></div></div>
    <div class="card" id="paylist">${payTable(rows, staff)}</div>
    ${staff && links.length ? `<div class="gap"></div><div class="card"><div class="ch"><h3>Open payment links</h3></div>${links.map(l => `<div class="item"><div class="mid"><b>${fmt(l.amt)}</b> · ${esc(P(l.partyId).name)}<div class="sub">${esc(l.purpose)} · expires ${ftime(l.expiresAt)}</div></div><button class="btn sm" data-act="linkCopy" data-a="${l.token}">${ic('copy', 'sm')}Copy</button><a class="btn sm wa" target="_blank" href="https://wa.me/?text=${encodeURIComponent('Payment link for ' + fmt(l.amt) + ' (' + l.purpose + '): ' + location.origin + '/pay/' + l.token)}">WhatsApp</a><button class="btn sm ghost" data-act="linkCancel" data-a="${l.id}">${ic('x', 'sm')}</button></div>`).join('')}</div>` : ''}`;
  }
};
CHG.payF = (v, t) => { pf()[t.dataset.k] = v; renderView(); };
INP.payQ = debounce(v => { pf().q = v; $('#paylist').innerHTML = payTable(payRows(), isStaff()); });
ACT.payClear = () => { UI.f.pay = {}; renderView(); };
ACT.payDel = async id => { if (await confirmBox('Delete payment', 'This removes the payment and its ledger entry.', 'Delete', true)) await doRpc(null, 'delPayment', { id }, 'Payment deleted'); };
ACT.payAdd = pid => {
  const staff = isStaff(), P0 = pid ? +pid : '';
  openModal({ title: 'Add payment record', body: `<div class="g1">${staff ? fld('Account *', `<select id="py-p" data-chg="pyParty">${opts((S.parties || []).filter(p => p.active !== false).map(p => [p.id, p.name + ' (' + (p.kind === 'supplier' ? 'supplier - payment out' : p.kind + ' - receipt') + ')']), P0, 'Select account...')}</select>`) : ''}
  <div class="g2">${fld('Amount (PKR) *', '<input id="py-a" type="number" min="1">')}${fld('Date', `<input id="py-d" type="date" value="${todayISO()}">`)}</div><div class="g2">${fld('Method', `<select id="py-m">${opts(['Bank transfer', 'Cash', 'Cheque', 'Online banking / Raast', 'JazzCash / Easypaisa', 'Other'])}</select>`)}${fld('Reference / transaction ID', '<input id="py-r">')}</div>
  ${fld('Against booking (optional)', `<select id="py-b">${bookOpts(isAgent() ? S.user.pid : P0)}</select>`)}${fld('Note', '<input id="py-n">')}${fld('Receipt (image or PDF)', '<input id="py-f" type="file" accept="image/*,.pdf">')}${staff ? '<p class="hint">Recorded by staff - posts to the ledger immediately.</p>' : '<p class="hint">Your receipt is posted to your ledger once the office approves it.</p>'}</div>`, foot: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="paySave">Save payment</button>' });
};
const bookOpts = pid => '<option value="">None</option>' + (S.bookings || []).filter(b => pid && b.partyId == pid && b.status !== 'Cancelled').map(b => `<option value="${esc(b.id)}">${esc(b.no)} - ${esc(lead(b))} (${fmt(bSell(b))})</option>`).join('');
CHG.pyParty = v => { $('#py-b').innerHTML = bookOpts(+v); };
ACT.paySave = async (a, b) => {
  const f = $('#py-f').files[0]; let file; if (f) { if (f.size > 6e6) return toast('Receipt too large (max 6 MB)', true); file = { name: f.name, data: await readFile(f) }; }
  await doRpc(b, 'addPayment', { partyId: isStaff() ? +val('py-p') : undefined, amt: val('py-a'), date: val('py-d'), method: val('py-m'), ref: val('py-r'), note: val('py-n'), bookingId: val('py-b'), file }, 'Payment saved', closeModal);
};
ACT.payOnline = () => openModal({ title: 'Pay online with PayFast', body: `<div class="g1">${fld('Amount (PKR) *', '<input id="po-a" type="number" min="100" placeholder="e.g. 250000">')}${fld('For booking (optional)', `<select id="po-b">${bookOpts(S.user.pid)}</select>`)}${fld('Note', '<input id="po-n" placeholder="Account top-up">')}<p class="hint">You will be redirected to PayFast's secure page. The amount is added to your ledger automatically after a successful payment.</p></div>`, foot: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn gold" data-act="poGo">Continue to PayFast</button>' });
ACT.poGo = async (a, b) => {
  busy(b, true);
  try { const r = await api('/api/payfast/start', { method: 'POST', body: JSON.stringify({ amt: val('po-a'), bookingId: val('po-b'), note: val('po-n') }) }); const f = document.createElement('form'); f.method = 'POST'; f.action = r.action; Object.entries(r.fields).forEach(([k, v]) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i); }); document.body.appendChild(f); f.submit(); }
  catch (e) { toast(e.message, true); busy(b, false); }
};
ACT.bankInfo = () => openModal({ title: 'Bank details', wide: (S.bank || []).length > 1, body: (S.bank || []).length ? (S.bank || []).map(b => `<div class="card cp row sb" style="margin-bottom:10px;align-items:center"><div><b>${esc(b.title || b.bank)}</b><div class="sub">${esc(b.bank)}</div>${b.account ? `<div>Account: <span class="mono">${esc(b.account)}</span></div>` : ''}${b.iban ? `<div>IBAN: <span class="mono">${esc(b.iban)}</span></div>` : ''}</div>${b.qr || b.iban || b.account ? `<img src="${esc(b.qr || '/api/qr?text=' + encodeURIComponent(b.iban || b.account))}" style="width:120px;height:120px;object-fit:contain" alt="QR">` : ''}</div>`).join('') + '<p class="hint">After transferring, use "Add payment record" and attach your receipt.</p>' : empty('wallet', 'No bank account added', 'The administrator can add bank accounts and QR codes under Settings.') });
ACT.linkNew = pid => openModal({ title: 'Create payment link', body: `<div class="g1">${fld('Agent / customer *', `<select id="pl-p">${opts((S.parties || []).filter(p => p.kind !== 'supplier').map(p => [p.id, p.name]), pid, 'Select...')}</select>`)}<div class="g2">${fld('Amount (PKR) *', '<input id="pl-a" type="number" min="1">')}${fld('Valid for (days)', '<input id="pl-d" type="number" value="7">')}</div>${fld('Purpose', '<input id="pl-t" placeholder="Booking / account top-up">')}<p class="hint">The payer opens the link without logging in and pays by PayFast or bank transfer with receipt upload.</p></div>`, foot: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="linkMake">Create link</button>' });
ACT.linkMake = async (a, b) => { try { const r = await doRpc(b, 'createPaylink', { partyId: +val('pl-p'), amt: val('pl-a'), days: val('pl-d'), purpose: val('pl-t') }); const url = location.origin + '/pay/' + r.token; openModal({ title: 'Payment link ready', body: `<div class="okbox" style="word-break:break-all">${esc(url)}</div><div class="row" style="margin-top:14px"><button class="btn pri" data-act="linkCopy" data-a="${r.token}">${ic('copy', 'sm')}Copy link</button><a class="btn wa" target="_blank" href="https://wa.me/?text=${encodeURIComponent('Payment link: ' + url)}">Share on WhatsApp</a></div>` }); } catch { /* shown */ } };
ACT.linkCopy = t => navigator.clipboard.writeText(location.origin + '/pay/' + t).then(() => toast('Payment link copied'));
ACT.linkCancel = async id => { await doRpc(null, 'cancelPaylink', { id }, 'Link cancelled'); };
