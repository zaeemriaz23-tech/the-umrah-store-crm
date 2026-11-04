/* Live chat: staff dashboard, history, and instant alerts (sound, toast, tab title, desktop notification) */
'use strict';
IC.chat = '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14h4"/>';
const CHT = { list: [], sel: '', conv: null, filter: 'open', q: '', unread: 0, online: 0, es: null, lastEvt: 0, base: document.title, flash: null, loaded: false };
const chatBadge = () => (CHT.unread > 0 ? CHT.unread : '');
const canChat = () => isStaff() && can('chat.view');
const QUICK = ['Assalam o Alaikum! How can I help you today?', 'Please share your travel dates and the number of travellers.', 'May I have your WhatsApp number so we can send details?', 'Thank you. One moment while I check availability.'];
const chAgo = t => { const s = Math.max(0, (Date.now() - new Date(t)) / 1000); return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
const hm2 = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function chime() { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = 784; g.gain.setValueAtTime(.09, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .4); o.connect(g); g.connect(c.destination); o.start(); o.frequency.setValueAtTime(1046, c.currentTime + .14); o.stop(c.currentTime + .4); } catch { /* ignore */ } }
function flashTitle(msg) { clearInterval(CHT.flash); let on = false; CHT.flash = setInterval(() => { on = !on; document.title = on ? '(' + CHT.unread + ') ' + msg : CHT.base; if (!CHT.unread || !document.hidden) { clearInterval(CHT.flash); document.title = CHT.unread ? '(' + CHT.unread + ') ' + CHT.base : CHT.base; } }, 1000); }
function alertNew(c, m) {
  chime(); toast('New chat from ' + c.name + ': ' + String(m.text).slice(0, 60)); if (document.hidden) flashTitle('New chat message');
  try { if (window.Notification && Notification.permission === 'granted' && document.hidden) { const n = new Notification('Live chat · ' + c.name, { body: m.text.slice(0, 120), tag: 'chat-' + c.id }); n.onclick = () => { window.focus(); go('chat', c.id); n.close(); }; } } catch { /* ignore */ }
}
function upsert(s) { const i = CHT.list.findIndex(x => x.id === s.id); if (i >= 0) CHT.list[i] = { ...CHT.list[i], ...s }; else CHT.list.unshift(s); CHT.list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)); }
function paintNav() { renderShellBits(); }
function onEvt(ev, d) {
  CHT.lastEvt = Date.now();
  if (ev === 'presence') { CHT.online = d.online; if (route().name === 'chat') drawHead(); return; }
  if (ev === 'read') { CHT.unread = d.unreadTotal; const c = CHT.list.find(x => x.id === d.id); if (c) { c.unread = 0; if (d.closed) c.status = 'closed'; } paintNav(); if (route().name === 'chat') drawList(); return; }
  if (ev === 'message') {
    CHT.unread = d.unreadTotal; const isV = d.message.from === 'visitor', viewing = route().name === 'chat' && CHT.sel === d.chat.id && !document.hidden;
    if (viewing) { d.chat.unread = 0; if (isV) api('/api/chat-admin/' + d.chat.id + '/read', { method: 'POST' }).catch(() => {}); if (CHT.conv && !CHT.conv.messages.some(x => x.id === d.message.id)) { CHT.conv.messages.push(d.message); drawThread(true); } }
    upsert(d.chat); if (isV && !viewing) alertNew(d.chat, d.message); paintNav(); if (route().name === 'chat') drawList();
  }
}
function chConnect() {
  if (CHT.es || !canChat()) return; if (!window.EventSource) return;
  const es = new EventSource('/api/chat-admin/stream'); CHT.es = es;
  es.addEventListener('hello', e => { CHT.lastEvt = Date.now(); const d = JSON.parse(e.data); CHT.online = d.online; CHT.unread = d.unreadTotal; paintNav(); });
  ['message', 'presence', 'read'].forEach(t => es.addEventListener(t, e => { try { onEvt(t, JSON.parse(e.data)); } catch { /* ignore */ } }));
  es.onerror = () => { /* the browser reconnects; polling below covers gaps */ };
}
async function pullList() {
  if (!canChat()) return; try {
    const r = await api('/api/chat-admin/list'); const prev = CHT.unread; CHT.online = r.online; CHT.unread = r.unreadTotal; const had = new Map(CHT.list.map(x => [x.id, x.unread]));
    CHT.list = r.items; CHT.loaded = true;
    if (CHT.unread > prev && CHT.loaded && Date.now() - CHT.lastEvt > 9000) { const n = r.items.find(x => x.unread > (had.get(x.id) || 0)); if (n) alertNew(n, { text: n.last.text }); }
    paintNav(); if (route().name === 'chat') { drawList(); drawHead(); }
  } catch { /* offline */ }
}
setInterval(() => { if (!S.user || !canChat()) return; if (!CHT.es) chConnect(); if (Date.now() - CHT.lastEvt > 9000 || !window.EventSource) pullList(); }, 5000);
window.addEventListener('load', () => setTimeout(() => { if (canChat()) { chConnect(); pullList(); } }, 800));
document.addEventListener('visibilitychange', () => { if (!document.hidden && route().name === 'chat' && CHT.sel) markRead(CHT.sel); });

async function chOpen(id) {
  CHT.sel = id; CHT.conv = null; drawThread(); drawList();
  try { CHT.conv = await api('/api/chat-admin/' + id); } catch (e) { CHT.sel = ''; toast(e.message, true); }
  drawThread(true); markRead(id);
}
async function markRead(id) { const c = CHT.list.find(x => x.id === id); if (c && c.unread) { c.unread = 0; try { await api('/api/chat-admin/' + id + '/read', { method: 'POST' }); } catch { /* ignore */ } await pullList(); } }
const rowHtml = c => `<button class="cr ${CHT.sel === c.id ? 'on' : ''} ${c.unread ? 'un' : ''}" data-act="chatOpen" data-a="${c.id}"><span class="av">${esc((c.name || '?').slice(0, 1).toUpperCase())}</span><span class="cm"><b>${esc(c.name)}</b><small>${esc(c.last.from === 'staff' ? 'You: ' : '')}${esc(c.last.text)}</small></span><span class="ct">${chAgo(c.updatedAt)}${c.unread ? `<i>${c.unread}</i>` : ''}${c.status === 'closed' ? '<em>closed</em>' : ''}</span></button>`;
function drawList() {
  const el = $('#chlist'); if (!el) return; const q = CHT.q.toLowerCase();
  const rows = CHT.list.filter(c => (!CHT.filter || c.status === CHT.filter) && (!q || (c.name + c.email + c.phone + c.last.text).toLowerCase().includes(q)));
  el.innerHTML = rows.map(rowHtml).join('') || `<div class="empty" style="padding:30px 14px">${ic('chat', 'lg')}<h3>${CHT.filter === 'open' ? 'No open chats' : 'No chats'}</h3><p>${CHT.filter === 'open' ? 'New conversations from your website appear here instantly.' : 'Nothing to show.'}</p></div>`;
  $$('.chtab').forEach(b => b.classList.toggle('on', b.dataset.a === CHT.filter));
}
function drawHead() { const e = $('#chpres'); if (e) e.innerHTML = `<span class="pdot ${CHT.online ? 'on' : ''}"></span>${CHT.online ? 'You are online - visitors see "Online"' : 'Offline'}${window.Notification && Notification.permission === 'default' ? ` <button class="lnk" data-act="chatAllow">Enable desktop alerts</button>` : ''}`; }
function drawThread(scroll) {
  const el = $('#chthread'); if (!el) return; const c = CHT.conv;
  $('.chwrap') && $('.chwrap').classList.toggle('showt', !!CHT.sel);
  if (!CHT.sel) { el.innerHTML = `<div class="empty" style="margin:auto">${ic('chat', 'lg')}<h3>Select a conversation</h3><p>Reply to visitors in real time. Every message is kept in the history.</p></div>`; return; }
  if (!c) { el.innerHTML = '<div class="empty" style="margin:auto"><span class="spin"></span></div>'; return; }
  const closed = c.status === 'closed', wa = (c.phone || '').replace(/\D/g, '');
  el.innerHTML = `<div class="cth"><button class="btn ghost icon sm chback" data-act="chatBack" aria-label="Back">${ic('left')}</button><span class="av">${esc(c.name.slice(0, 1).toUpperCase())}</span><div class="cm"><b>${esc(c.name)}</b><small>${[c.phone && `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>`, c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`, c.page && esc(c.page)].filter(Boolean).join(' · ') || 'No contact details'} · started ${esc(ftime(c.createdAt))}</small></div>
    <div class="row" style="margin-left:auto;gap:6px">${wa ? `<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${wa.replace(/^0/, '92')}">${ic('wa', 'sm')}<span class="hm">WhatsApp</span></a>` : ''}${can('chat.manage') ? `<button class="btn sm" data-act="chatAssign" title="Assign to me">${ic('user', 'sm')}<span class="hm">${c.assignedName ? esc(c.assignedName) : 'Take'}</span></button>` : ''}${closed ? `<button class="btn sm" data-act="chatReopen">Reopen</button>` : `<button class="btn sm" data-act="chatClose">Close</button>`}${can('chat.manage') ? `<button class="btn sm ghost" data-act="chatDel" aria-label="Delete">${ic('trash', 'sm')}</button>` : ''}</div></div>
  <div class="cmsgs" id="cmsgs">${c.messages.map(m => `<div class="cg ${m.from}"><div>${m.from === 'staff' ? `<b>${esc(m.by)}</b>` : ''}${esc(m.text)}<small>${hm2(m.t)}</small></div></div>`).join('')}</div>
  <div class="cq">${QUICK.map((q, i) => `<button class="chip" data-act="chatQuick" data-a="${i}">${esc(q.length > 34 ? q.slice(0, 32) + '…' : q)}</button>`).join('')}</div>
  <form class="ccomp" id="chform" autocomplete="off"><textarea id="chtxt" rows="1" placeholder="${closed ? 'Replying will reopen this chat' : 'Type a reply - Enter to send, Shift+Enter for a new line'}"></textarea><button class="btn pri" type="submit">${ic('send', 'sm')}Send</button></form>`;
  const m = $('#cmsgs'); if (scroll && m) m.scrollTop = m.scrollHeight;
  const ta = $('#chtxt'), f = $('#chform'); ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
  ta.addEventListener('input', () => { ta.style.height = '44px'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
  f.onsubmit = async e => { e.preventDefault(); const t = ta.value.trim(); if (!t) return; ta.value = ''; ta.style.height = '44px'; try { const r = await api('/api/chat-admin/' + CHT.sel + '/reply', { method: 'POST', body: JSON.stringify({ text: t }) }); if (!CHT.conv.messages.some(x => x.id === r.message.id)) CHT.conv.messages.push(r.message); CHT.conv.status = 'open'; drawThread(true); $('#chtxt').focus(); } catch (x) { toast(x.message, true); ta.value = t; } };
  if (innerWidth > 800) ta.focus();
}
VIEWS.chat = {
  roles: ['admin', 'staff'], title: 'Live chat', noLive: true,
  render(id) {
    if (!can('chat.view') && !isAdmin()) return empty('shield', 'No access', 'Ask an administrator for the live chat permission.');
    if (id) CHT.sel = id;
    return `<div class="ph"><div><h1>Live chat</h1><p id="chpres" class="chpres"></p></div></div><div class="card chwrap ${CHT.sel ? 'showt' : ''}"><aside class="chside"><div class="chtools"><div class="tabs" style="margin:0">${[['open', 'Open'], ['closed', 'Closed'], ['', 'All']].map(t => `<button class="chtab ${CHT.filter === t[0] ? 'on' : ''}" data-act="chatFilter" data-a="${t[0]}">${t[1]}</button>`).join('')}</div><div class="gs" style="background:#fff;width:100%">${ic('search', 'sm')}<input placeholder="Search name, phone or message" value="${esc(CHT.q)}" data-inp="chatQ"></div></div><div id="chlist" class="chlist"></div></aside><section class="chmain" id="chthread"></section></div>`;
  },
  mount(id) { drawHead(); drawList(); pullList().then(() => { if (id && id !== (CHT.conv || {}).id) chOpen(id); else if (CHT.sel && !CHT.conv) chOpen(CHT.sel); else drawThread(true); }); }
};
ACT.chatOpen = id => { go('chat', id); chOpen(id); };
ACT.chatBack = () => { CHT.sel = ''; CHT.conv = null; history.replaceState(null, '', '#/chat'); drawThread(); drawList(); };
ACT.chatFilter = f => { CHT.filter = f; drawList(); };
INP.chatQ = debounce(v => { CHT.q = v; drawList(); }, 200);
ACT.chatQuick = i => { const t = $('#chtxt'); if (t) { t.value = QUICK[+i]; t.focus(); } };
ACT.chatAllow = async () => { try { await Notification.requestPermission(); } catch { /* ignore */ } drawHead(); };
const chatDo = async (path, method = 'POST') => { try { await api('/api/chat-admin/' + CHT.sel + path, { method }); CHT.conv = await api('/api/chat-admin/' + CHT.sel); await pullList(); drawThread(true); } catch (e) { toast(e.message, true); } };
ACT.chatClose = () => chatDo('/close'); ACT.chatReopen = () => chatDo('/reopen'); ACT.chatAssign = () => chatDo('/assign');
ACT.chatDel = async () => { if (!await confirmBox('Delete conversation', 'Delete this chat and its whole message history permanently?', 'Delete', true)) return; try { await api('/api/chat-admin/' + CHT.sel, { method: 'DELETE' }); CHT.sel = ''; CHT.conv = null; await pullList(); drawThread(); toast('Chat deleted'); } catch (e) { toast(e.message, true); } };
