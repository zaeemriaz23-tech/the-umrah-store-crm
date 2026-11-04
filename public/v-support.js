/* Help & support: agents and suppliers raise tickets; staff answer them */
'use strict';
Object.assign(STAT, { 'In progress': 'blue', Answered: 'green', Resolved: 'green' });
const PRI = { Urgent: 'red', High: 'amber', Normal: 'gray', Low: 'gray' };
const pbadge = p => `<span class="bdg ${PRI[p] || 'gray'}">${esc(p)}</span>`;
const tkLabel = (t, staff) => (!staff && t.status === 'Answered' ? 'Reply received' : t.status);
const tkf = () => UI.f.support || (UI.f.support = {});
const tkAll = () => S.tickets || [];
const CANNED = ['Thank you for contacting us - we are looking into this now.', 'Please share the booking number and passport number so we can check this quickly.', 'This is resolved on our side. Please confirm and we will close the ticket.'];
const FAQ = {
  agent: [['Why is my booking "Pending approval"?', 'New bookings are reviewed by the office. Vouchers carry a PENDING watermark until approved, then become valid automatically.'],
    ['How is my available balance calculated?', 'Available balance = your credit limit − outstanding amount. Advance deposits increase it. You can always book, even at zero balance - the amount then shows with a minus sign until you settle it.'],
    ['How do I pay or top up?', 'Open Payments → pay online with PayFast, or transfer to one of our bank accounts and upload the receipt. Receipts are credited after the office approves them.'],
    ['Can I change or cancel a booking?', 'You can edit or cancel while it is still pending. After approval, raise a ticket on that booking and the office will help.']],
  supplier: [['How do I confirm a service?', 'Open Services, choose the booking, enter your confirmation number and save. The agent and the office are notified immediately.'],
    ['How is my balance calculated?', 'Your ledger shows the cost of every assigned service (credit) less payments made to you. The balance is what the company owes you.'],
    ['A service looks wrong or was changed', 'Raise a ticket on that booking with the details - the office will correct it or contact you.']]
};
const contactCard = () => { const c = S.company || {}, wa = (c.whatsapp || c.phone || '').replace(/[^0-9]/g, ''); return `<div class="card cp"><div class="sec">Need it urgently?</div><p class="hint" style="margin-bottom:10px">For anything time-critical (same-day travel, visa issues) also contact the office directly.</p><div class="row">${wa ? `<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${wa}">${ic('wa', 'sm')}WhatsApp</a>` : ''}${c.phone ? `<a class="btn" href="tel:${esc(c.phone)}">${ic('phone', 'sm')}${esc(c.phone)}</a>` : ''}${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</div><div class="hint" style="margin-top:10px">Branches: Lahore · Okara · Islamabad</div>${!wa && !c.phone && !c.email ? '<p class="hint">The office has not added contact details yet.</p>' : ''}</div>`; };

function tkMatch(t) {
  const f = tkf(), staff = isStaff();
  if (f.st && (f.st === 'active' ? ['Resolved', 'Closed'].includes(t.status) : t.status !== f.st)) return false;
  if (f.pri && t.priority !== f.pri) return false; if (f.cat && t.category !== f.cat) return false;
  if (f.mine && t.assignee !== S.user.id) return false; if (f.q) { const q = f.q.toLowerCase(); if (![t.no, t.subject, t.bookingNo, t.by, staff ? P(t.pid).name : ''].join(' ').toLowerCase().includes(q)) return false; }
  return true;
}
const tkSorted = () => tkAll().filter(tkMatch).sort((a, b) => { const o = { Open: 0, 'In progress': 1, Answered: 2, Resolved: 3, Closed: 4 }; return (o[a.status] - o[b.status]) || (b.updatedAt < a.updatedAt ? -1 : 1); });
function tkTable() {
  const staff = isStaff(), rows = tkSorted();
  if (!rows.length) return empty('ticket', tkAll().length ? 'No tickets match' : staff ? 'No tickets yet' : 'No tickets yet', tkAll().length ? 'Try clearing the filters.' : staff ? 'Tickets raised by agents and suppliers will appear here.' : 'Something not right? Raise a ticket and we will reply here.', tkAll().length ? '<button class="btn" data-act="tkClear">Clear filters</button>' : staff ? '' : `<button class="btn pri" data-act="tkNew">${ic('plus', 'sm')}Raise a ticket</button>`);
  return `<div class="tw"><table class="t"><thead><tr><th>Ticket</th>${staff ? '<th>From</th>' : ''}<th>Category</th><th>Priority</th><th>Status</th>${staff ? '<th>Assigned</th><th>Reply due</th>' : ''}<th>Updated</th></tr></thead><tbody>${rows.map(t => `<tr class="click ${!staff && t.status === 'Answered' ? 'unread' : ''}" data-act="tkOpen" data-a="${esc(t.id)}"><td><span class="bno">${esc(t.no)}</span><div class="sub tkS">${esc(t.subject)}${t.bookingNo ? ' · ' + esc(t.bookingNo) : ''}</div></td>${staff ? `<td>${esc(P(t.pid).name)}<div class="sub">${esc(t.kind)}</div></td>` : ''}<td>${esc(t.category)}</td><td>${pbadge(t.priority)}</td><td>${badge(t.status, tkLabel(t, staff))}</td>${staff ? `<td>${t.assigneeName ? esc(t.assigneeName) : '<span class="faint">-</span>'}</td><td>${t.dueAt && !['Resolved', 'Closed'].includes(t.status) ? slaChip(t.dueAt) : '<span class="faint">-</span>'}</td>` : ''}<td class="sub">${ago(t.updatedAt)}</td></tr>`).join('')}</tbody></table></div>`;
}
ACT.tkOpen = id => go('support', id);
ACT.tkClear = () => { UI.f.support = {}; renderView(); };
INP.tkSearch = debounce(v => { tkf().q = v; const e = $('#tkres'); if (e) e.innerHTML = tkTable(); }, 150);
CHG.tkF = (v, t) => { tkf()[t.dataset.k] = t.type === 'checkbox' ? v : v; renderView(); };
ACT.tkQ = k => { tkf().st = tkf().st === k ? '' : k; renderView(); };

function tkList() {
  const staff = isStaff(), f = tkf(), all = tkAll(), cnt = s => all.filter(t => t.status === s).length;
  const kp = (k, l, n, cls) => `<button class="kpi click ${f.st === k ? 'on' : ''}" data-act="tkQ" data-a="${k}"><span>${l}</span><b class="${cls || ''}">${n}</b></button>`;
  const od = all.filter(t => t.dueAt && !['Resolved', 'Closed'].includes(t.status) && new Date(t.dueAt) < Date.now()).length;
  const filters = `<div class="fb no-print"><div class="fld grow"><span>Search</span><input value="${esc(f.q || '')}" placeholder="Ticket no., subject, booking${staff ? ', agent' : ''}" data-inp="tkSearch" autocomplete="off"></div>
    <div class="fld"><span>Status</span><select data-chg="tkF" data-k="st">${opts([['active', 'Not closed'], ...(S.tk ? S.tk.stat : []).map(x => [x, x])], f.st, 'All')}</select></div>
    <div class="fld"><span>Priority</span><select data-chg="tkF" data-k="pri">${opts(S.tk ? S.tk.pri : [], f.pri, 'All')}</select></div>
    <div class="fld"><span>Category</span><select data-chg="tkF" data-k="cat">${opts(S.tk ? S.tk.cats : [], f.cat, 'All')}</select></div>
    ${staff ? `<label class="chk" style="padding-bottom:9px"><input type="checkbox" ${f.mine ? 'checked' : ''} data-chg="tkF" data-k="mine">Assigned to me</label>` : ''}<button class="btn sm ghost" data-act="tkClear">${ic('x', 'sm')}Clear</button></div>`;
  if (staff) return `<div class="kpis" style="margin-bottom:14px">${kp('Open', 'Open (needs reply)', cnt('Open'), cnt('Open') ? 'neg' : '')}${kp('In progress', 'In progress', cnt('In progress'))}${kp('Answered', 'Waiting on user', cnt('Answered'))}<div class="kpi"><span>Overdue replies</span><b class="${od ? 'neg' : ''}">${od}</b></div>${kp('Resolved', 'Resolved', cnt('Resolved'))}</div>${filters}<div class="card" id="tkres">${tkTable()}</div>`;
  const faq = FAQ[role()] || [];
  return `<div class="gm"><div>${all.some(t => t.status === 'Answered') ? `<div class="okbox" style="margin-bottom:12px">${ic('check')}<span>You have ${cnt('Answered')} ticket(s) with a reply from the office.</span></div>` : ''}${filters}<div class="card" id="tkres">${tkTable()}</div></div>
  <div>${contactCard()}<div class="gap"></div><div class="card cp"><div class="sec">Quick answers</div>${faq.map(([q, a]) => `<details class="more" style="margin-bottom:8px"><summary>${esc(q)}</summary><p class="hint" style="margin-top:8px;font-size:13px;line-height:1.55">${esc(a)}</p></details>`).join('')}</div></div></div>`;
}

/* ---- new ticket ---- */
ACT.tkNew = bookingNo => {
  const staff = isStaff(), bs = (S.bookings || []).slice().sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1)).slice(0, 300);
  openModal({ title: 'Raise a support ticket', wide: false, body: `<div class="g1">
    ${staff ? fld('On behalf of *', `<select id="tk-p">${opts((S.parties || []).filter(p => p.kind === 'agent' || p.kind === 'supplier').map(p => [p.id, p.name + ' (' + p.kind + ')']), '', 'Select agent or supplier...')}</select>`) : ''}
    <div class="g2">${fld('Category', `<select id="tk-c">${opts(S.tk.cats, bookingNo ? 'Booking' : 'Other')}</select>`)}${fld('Priority', `<select id="tk-pr">${opts(S.tk.pri, 'Normal')}</select>`)}</div>
    ${fld('Related booking (optional)', `<input id="tk-b" list="tk-bl" value="${esc(typeof bookingNo === 'string' ? bookingNo : '')}" placeholder="Booking no." autocomplete="off"><datalist id="tk-bl">${bs.map(b => `<option value="${esc(b.no)}">${esc(lead(b))}</option>`).join('')}</datalist>`)}
    ${fld('Subject *', '<input id="tk-s" maxlength="120" placeholder="Short summary of the problem">')}${fld('Describe the problem *', '<textarea id="tk-t" rows="6" maxlength="3000" placeholder="What happened, what you expected, passport / booking numbers..."></textarea>')}
    <p class="hint">Urgent same-day issues: please also call or WhatsApp the office.</p></div>`,
    foot: `<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="tkCreate">${ic('send', 'sm')}Submit ticket</button>` });
};
ACT.tkCreate = async (a, b) => {
  busy(b, true);
  try { const r = await rpc('openTicket', { partyId: val('tk-p'), category: val('tk-c'), priority: val('tk-pr'), bookingNo: val('tk-b').trim(), subject: val('tk-s'), text: val('tk-t') }); closeModal(); toast('Ticket ' + r.no + ' submitted'); await load(); go('support', r.id); renderShellBits(); }
  catch (e) { toast(e.message, true); busy(b, false); }
};

/* ---- thread ---- */
UI.draft = UI.draft || {};
INP.tkDraft = (v, t) => { UI.draft[t.dataset.id] = v; };
function tkThread(id) {
  const t = tkAll().find(x => x.id === id || x.no === id), staff = isStaff();
  if (!t) return empty('ticket', 'Ticket not found', 'It may have been removed.', '<a class="btn" href="#/support">Back to tickets</a>');
  const closed = t.status === 'Closed', mine = m => m.role === S.user.role && m.by === S.user.name;
  const msgs = t.msgs.map(m => m.system ? `<div class="tkm sys">${esc(m.text)} · ${ftime(m.t)}</div>` : `<div class="tkm ${mine(m) ? 'me' : ''} ${m.internal ? 'note' : ''}"><div class="who"><b>${esc(m.by)}</b><span>${m.role === 'agent' ? 'Agent' : m.role === 'supplier' ? 'Supplier' : 'Support'}${m.internal ? ' · internal note' : ''}</span><em>${ftime(m.t)}</em></div><div class="tx">${esc(m.text)}</div></div>`).join('');
  const sidebar = `<div class="card"><div class="ch"><h3>Details</h3></div><div class="cp"><div class="kvg" style="grid-template-columns:1fr">
    <div><div class="l">Status</div><div class="v">${badge(t.status, tkLabel(t, staff))}</div></div>
    <div><div class="l">From</div><div class="v">${staff ? `<a href="#/account/${t.pid}">${esc(P(t.pid).name)}</a>` : esc(t.by)}<span class="sub"> · ${esc(t.kind)}</span></div></div>
    <div><div class="l">Category</div><div class="v">${esc(t.category)}</div></div>
    ${t.bookingNo ? `<div><div class="l">Booking</div><div class="v"><a class="bno" href="#/bookings" data-act="tkBk" data-a="${esc(t.bookingNo)}">${esc(t.bookingNo)}</a></div></div>` : ''}
    <div><div class="l">Opened</div><div class="v">${ftime(t.createdAt)}</div></div>
    ${t.dueAt && !['Resolved', 'Closed'].includes(t.status) ? `<div><div class="l">${staff ? 'Reply due' : 'Expected first reply'}</div><div class="v">${slaChip(t.dueAt)}</div></div>` : ''}</div>
    ${staff && can('support.reply') ? `<div class="g1" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line2)">${fld('Priority', `<select data-chg="tkMeta" data-k="priority" data-id="${esc(t.id)}">${opts(S.tk.pri, t.priority)}</select>`)}${fld('Assigned to', `<select data-chg="tkMeta" data-k="assignee" data-id="${esc(t.id)}">${opts((S.supportStaff || []).map(s => [s.id, s.name]), t.assignee, 'Unassigned')}</select>`)}${fld('Status', `<select data-chg="tkStatus" data-id="${esc(t.id)}">${opts(S.tk.stat, t.status)}</select>`)}
      <button class="btn sm" data-act="tkMe" data-a="${esc(t.id)}">Assign to me</button></div>` : `<div class="row" style="margin-top:14px">${pbadge(t.priority)}</div>`}
    ${!staff ? `<div class="row" style="margin-top:14px">${closed || t.status === 'Resolved' ? `<button class="btn" data-act="tkSt" data-a="${esc(t.id)}|Open">${ic('refresh', 'sm')}Reopen</button>` : `<button class="btn" data-act="tkSt" data-a="${esc(t.id)}|Closed">${ic('check', 'sm')}Mark solved & close</button>`}</div>` : ''}
    ${staff && can('support.delete') ? `<button class="btn sm ghost neg" style="margin-top:10px" data-act="tkDel" data-a="${esc(t.id)}">${ic('trash', 'sm')}Delete ticket</button>` : ''}</div></div>`;
  const reply = closed && !staff ? `<div class="card cp c"><p class="mute" style="margin-bottom:10px">This ticket is closed.</p><button class="btn" data-act="tkSt" data-a="${esc(t.id)}|Open">${ic('refresh', 'sm')}Reopen ticket</button></div>`
    : staff && !can('support.reply') ? '' : `<div class="card cp"><div class="sec">${staff ? 'Reply' : 'Add a reply'}</div>${staff ? `<div class="chips" style="margin-bottom:8px">${CANNED.map((c, i) => `<button class="chip" data-act="tkCan" data-a="${i}">${esc(c.slice(0, 34))}…</button>`).join('')}</div>` : ''}<textarea id="tk-text" rows="4" data-inp="tkDraft" data-id="${esc(t.id)}" placeholder="Write your message...">${esc(UI.draft[t.id] || '')}</textarea>
    <div class="row sb" style="margin-top:10px">${staff ? `<label class="chk"><input type="checkbox" id="tk-int">Internal note (not visible to the ${esc(t.kind)})</label>` : '<span></span>'}<button class="btn pri" data-act="tkSend" data-a="${esc(t.id)}">${ic('send', 'sm')}Send</button></div></div>`;
  return `<div class="no-print" style="margin-bottom:10px"><a class="btn ghost sm" href="#/support">${ic('back', 'sm')}All tickets</a></div><div class="ph"><div><div class="sub">${esc(t.no)}</div><h1 style="font-size:23px">${esc(t.subject)}</h1></div></div>
  <div class="gm"><div><div class="card"><div class="chat tkchat" id="tk-chat">${msgs}</div></div><div class="gap"></div>${reply}</div><div>${sidebar}</div></div>`;
}
ACT.tkBk = no => { UI.f.bookings = { q: no }; };
CHG.tkMeta = async (v, t) => { try { await rpc('setTicketMeta', { id: t.dataset.id, [t.dataset.k]: v }); toast('Ticket updated'); await refresh(); } catch (e) { toast(e.message, true); } };
CHG.tkStatus = async (v, t) => { try { await rpc('setTicketStatus', { id: t.dataset.id, status: v }); toast('Status set to ' + v); await refresh(); } catch (e) { toast(e.message, true); } };
ACT.tkMe = async id => { try { await rpc('setTicketMeta', { id, assignee: S.user.id }); toast('Assigned to you'); await refresh(); } catch (e) { toast(e.message, true); } };
ACT.tkSt = async a => { const [id, status] = a.split('|'); await doRpc(null, 'setTicketStatus', { id, status }, status === 'Closed' ? 'Ticket closed' : 'Ticket reopened'); };
ACT.tkDel = async id => { if (await confirmBox('Delete ticket', 'This permanently removes the ticket and its messages.', 'Delete', true)) { await doRpc(null, 'delTicket', { id }, 'Ticket deleted'); go('support'); } };
ACT.tkCan = i => { const e = $('#tk-text'); if (e) { e.value = (e.value ? e.value + '\n' : '') + CANNED[+i]; e.dispatchEvent(new Event('input', { bubbles: true })); e.focus(); } };
ACT.tkSend = async (id, b) => {
  const text = val('tk-text').trim(); if (!text) return toast('Write a message first', true);
  busy(b, true);
  try { await rpc('replyTicket', { id, text, internal: !!($('#tk-int') || {}).checked }); delete UI.draft[id]; toast('Message sent'); await load(); renderView(); renderShellBits(); }
  catch (e) { toast(e.message, true); busy(b, false); }
};

VIEWS.support = {
  title: id => (id ? 'Ticket' : isStaff() ? 'Support tickets' : 'Help & support'),
  render(id) {
    if (id) return tkThread(id);
    const staff = isStaff();
    return `<div class="ph"><div><h1>${staff ? 'Support tickets' : 'Help & support'}</h1><p>${staff ? tkAll().length + ' ticket(s) from agents and suppliers' : 'Raise a ticket and the office will reply right here. You will be notified instantly.'}</p></div><div class="sp">${!staff || can('support.reply') ? `<button class="btn pri" data-act="tkNew">${ic('plus', 'sm')}${staff ? 'New ticket' : 'Raise a ticket'}</button>` : ''}</div></div>${tkList()}`;
  },
  mount(id) { const c = $('#tk-chat'); if (c) c.scrollTop = c.scrollHeight; }
};
