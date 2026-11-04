/* Live chat widget for website visitors. Self-contained (own CSS), real time via Server-Sent Events with automatic polling fallback. */
(function () {
  if (window.__umrahChat || /^\/app/.test(location.pathname)) return; window.__umrahChat = 1;
  var KEY = 'umrah.chat', st = { open: false, id: '', token: '', name: '', last: 0, unread: 0, es: null, poll: null, online: false, closed: false }, el = {};
  try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.id && s.token) { st.id = s.id; st.token = s.token; st.name = s.name || ''; } } catch (e) { /* ignore */ }
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify({ id: st.id, token: st.token, name: st.name })); } catch (e) { /* ignore */ } };
  var css = '#uc-b{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:99990;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;color:#fff;background:linear-gradient(135deg,#0a1a4a,#1d4fb8);box-shadow:0 10px 30px rgba(10,26,74,.45);display:grid;place-items:center;transition:transform .2s}#uc-b:hover{transform:scale(1.07)}#uc-b svg{width:28px;height:28px}#uc-b i{position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;border-radius:11px;background:#e5484d;color:#fff;font:700 12px/22px system-ui,sans-serif;text-align:center;padding:0 5px;font-style:normal}#uc-b i[hidden]{display:none}' +
    '#uc-p{position:fixed;right:18px;bottom:calc(92px + env(safe-area-inset-bottom));z-index:99991;width:380px;max-width:calc(100vw - 24px);height:640px;max-height:calc(100dvh - 120px);background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(10,26,74,.35);display:none;flex-direction:column;overflow:hidden;font:15px/1.45 "Plus Jakarta Sans",system-ui,-apple-system,Segoe UI,sans-serif;color:#14213d}#uc-p.on{display:flex;animation:ucin .22s ease}@keyframes ucin{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}' +
    '#uc-h{background:linear-gradient(135deg,#0a1a4a,#1d4fb8);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px}#uc-h .av{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.16);display:grid;place-items:center;flex:none}#uc-h b{display:block;font-size:16px}#uc-h small{display:flex;align-items:center;gap:6px;opacity:.9;font-size:12.5px}#uc-h small:before{content:"";width:8px;height:8px;border-radius:50%;background:#9aa4b8}#uc-h.on small:before{background:#3ddc84;box-shadow:0 0 0 3px rgba(61,220,132,.25)}#uc-x{margin-left:auto;background:rgba(255,255,255,.14);border:0;color:#fff;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:20px;line-height:1}' +
    '#uc-m{flex:1;overflow-y:auto;padding:14px;background:#f4f6fb;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain}.uc-g{max-width:84%;padding:9px 13px;border-radius:16px;white-space:pre-wrap;word-wrap:break-word;font-size:14.5px}.uc-g small{display:block;font-size:11px;opacity:.6;margin-top:3px}.uc-g.v{align-self:flex-end;background:#1d4fb8;color:#fff;border-bottom-right-radius:5px}.uc-g.s{align-self:flex-start;background:#fff;border:1px solid #e1e6f0;border-bottom-left-radius:5px}.uc-g.s b{display:block;font-size:11.5px;color:#1d4fb8;margin-bottom:2px}.uc-g.y{align-self:center;background:transparent;color:#5b6784;font-size:12.5px;text-align:center;max-width:94%}' +
    '#uc-f{display:flex;gap:8px;padding:10px;border-top:1px solid #e1e6f0;background:#fff}#uc-f input,#uc-f textarea,#uc-s input,#uc-s textarea{font:inherit;border:1.5px solid #d5dbe8;border-radius:12px;padding:10px 12px;outline:0;width:100%;box-sizing:border-box;background:#fff;color:#14213d}#uc-f textarea{resize:none;height:44px;max-height:110px}#uc-f input:focus,#uc-f textarea:focus,#uc-s input:focus,#uc-s textarea:focus{border-color:#1d4fb8}#uc-f button,#uc-s button.go{border:0;background:#1d4fb8;color:#fff;border-radius:12px;padding:0 16px;font-family:inherit;font-weight:700;font-size:14px;cursor:pointer;min-height:44px}#uc-f button:disabled,#uc-s button:disabled{opacity:.55}' +
    '#uc-s{padding:16px;display:grid;grid-auto-rows:max-content;align-content:start;gap:10px;overflow-y:auto;flex:1;min-height:0;background:#f4f6fb}#uc-s p{margin:0 0 2px;color:#42506e;font-size:14px}#uc-s label{display:grid;gap:4px;font-size:12.5px;font-weight:600;color:#42506e}#uc-s button.go{position:sticky;bottom:0;box-shadow:0 -8px 12px 4px #f4f6fb}#uc-s .e{color:#c0262d;font-size:13px;min-height:16px}#uc-s .wa{text-align:center;font-size:13px;color:#42506e}#uc-s .wa a{color:#0a7a45;font-weight:700}.uc-hp{position:absolute;left:-9999px}' +
    '@media(max-width:560px){#uc-p{right:0;left:0;bottom:0;top:0;width:100%;max-width:100%;height:100dvh;max-height:100dvh;border-radius:0}#uc-b{width:56px;height:56px;right:14px;bottom:calc(14px + env(safe-area-inset-bottom))}#uc-m{padding-bottom:18px}#uc-f{padding-bottom:calc(10px + env(safe-area-inset-bottom))}#uc-f input,#uc-f textarea,#uc-s input,#uc-s textarea{font-size:16px}}' +
    '#uc-t{position:fixed;right:18px;bottom:calc(88px + env(safe-area-inset-bottom));z-index:99989;max-width:260px;background:#fff;color:#14213d;border-radius:16px 16px 4px 16px;padding:12px 34px 12px 14px;box-shadow:0 14px 40px rgba(10,26,74,.25);font:600 14px/1.4 \"Plus Jakarta Sans\",system-ui,sans-serif;cursor:pointer;display:none;animation:ucin .3s ease}#uc-t.on{display:block}#uc-t button{position:absolute;top:4px;right:6px;border:0;background:none;font-size:18px;color:#8792ab;cursor:pointer}' +
    '#uc-b:after{content:\"\";position:absolute;inset:0;border-radius:50%;border:2px solid rgba(29,79,184,.5);animation:ucpulse 2.4s infinite;pointer-events:none}@keyframes ucpulse{0%{transform:scale(1);opacity:.8}100%{transform:scale(1.5);opacity:0}}@media(prefers-reduced-motion:reduce){#uc-b:after{animation:none}#uc-p.on,#uc-t{animation:none}}' +
    '.uc-ch{display:flex;flex-wrap:wrap;gap:6px}.uc-ch button{border:1.5px solid #cfd8ee;background:#fff;color:#1d4fb8;border-radius:999px;padding:5px 11px;font-family:inherit;font-weight:600;font-size:13px;cursor:pointer}.uc-ch button:hover,.uc-ch button.on{background:#1d4fb8;color:#fff;border-color:#1d4fb8}' +
    '.uc-g.p{opacity:.6}#uc-b[aria-expanded=true]:after{display:none}' +
    '@media(max-width:560px){#uc-t{right:14px;bottom:calc(80px + env(safe-area-inset-bottom))}}';
  var $ = function (t, a, h) { var e = document.createElement(t); if (a) for (var k in a) e.setAttribute(k, a[k]); if (h) e.innerHTML = h; return e; };
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14h4"/></svg>';
  var fetchJson = function (u, o) { o = o || {}; o.headers = Object.assign({ 'content-type': 'application/json' }, o.headers); return fetch(u, o).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; } return j; }); }); };
  var tm = function (t) { try { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  var beep = function () { try { var c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.value = .05; o.connect(g); g.connect(c.destination); o.start(); setTimeout(function () { o.stop(); c.close(); }, 140); } catch (e) { /* ignore */ } };

  function build() {
    var wa = (document.querySelector('a[href^="https://wa.me/"]') || {}).href || '';
    el.btn = $('button', { id: 'uc-b', type: 'button', 'aria-label': 'Open live chat' }, ICON + '<i hidden>0</i>');
    el.p = $('div', { id: 'uc-p', role: 'dialog', 'aria-label': 'Live chat' }, '<div id="uc-h"><div class="av">' + ICON + '</div><div><b>Chat with our team</b><small id="uc-st">Checking availability...</small></div><button id="uc-x" type="button" aria-label="Close chat">&times;</button></div><div id="uc-body" style="display:flex;flex-direction:column;flex:1;min-height:0"></div>');
    document.body.appendChild(el.btn); document.body.appendChild(el.p); el.wa = wa;
    el.btn.onclick = function () { toggle(); }; el.p.querySelector('#uc-x').onclick = function () { toggle(false); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && st.open) toggle(false); });
    var style = $('style'); style.textContent = css; document.head.appendChild(style);
  }
  function badge() { var i = el.btn.querySelector('i'); i.hidden = !st.unread; i.textContent = st.unread > 9 ? '9+' : st.unread; }
  function presence(on) { st.online = !!on; var h = el.p.querySelector('#uc-h'); h.classList.toggle('on', st.online); el.p.querySelector('#uc-st').textContent = st.online ? 'Online - we reply in minutes' : 'Offline - leave a message'; }
  function body() { return el.p.querySelector('#uc-body'); }
  function form() {
    var b = body(); b.innerHTML = '<form id="uc-s" novalidate><p>' + (st.online ? 'Hi! How can we help you with your Umrah plans?' : 'We are offline right now. Send us a message and we will reply as soon as we are back.') + '</p><div class=\"uc-ch\" id=\"uc-ch\" role=\"group\" aria-label=\"Topic\"><button type=\"button\">Umrah package</button><button type=\"button\">Flights</button><button type=\"button\">Hotel &amp; visa</button><button type=\"button\">Agent account</button></div><label>Your name<input name="name" autocomplete="name" maxlength="60" required value="' + (st.name || '').replace(/"/g, '&quot;') + '"></label><label>Phone / WhatsApp (optional)<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30"></label><label>Email (optional)<input name="email" type="email" autocomplete="email" maxlength="120"></label><label>Your message<textarea name="message" rows="3" maxlength="1000" required placeholder="e.g. I need a 14-night Umrah package for 4 people in March"></textarea></label><input class="uc-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><div class="e" id="uc-e" role="alert"></div><button class="go" type="submit">Start chat</button>' + (el.wa ? '<div class="wa">Prefer WhatsApp? <a href="' + el.wa + '" target="_blank" rel="noopener">Message us there</a></div>' : '') + '</form>';
    var f = b.querySelector('form'); var chips = f.querySelectorAll('#uc-ch button'); Array.prototype.forEach.call(chips, function (c) { c.onclick = function () { var ta = f.querySelector('textarea'); Array.prototype.forEach.call(chips, function (x) { x.classList.remove('on'); }); c.classList.add('on'); if (!ta.value.trim() || /^I am interested in/.test(ta.value)) ta.value = 'I am interested in: ' + c.textContent.replace('&amp;', '&') + '. '; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }; });
    f.onsubmit = function (e) {
      e.preventDefault(); var d = new FormData(f), btn = f.querySelector('button.go'), er = f.querySelector('#uc-e'); er.textContent = '';
      if (d.get('website')) return; if (!String(d.get('name')).trim()) { er.textContent = 'Please enter your name.'; return; } if (!String(d.get('message')).trim()) { er.textContent = 'Please type your message.'; return; }
      btn.disabled = true; btn.textContent = 'Starting...';
      fetchJson('/api/chat/start', { method: 'POST', body: JSON.stringify({ name: d.get('name'), phone: d.get('phone'), email: d.get('email'), message: d.get('message'), page: location.pathname + location.search }) }).then(function (r) {
        st.id = r.id; st.token = r.token; st.name = String(d.get('name')).trim(); st.last = 0; st.closed = false; save(); thread(r.messages); connect();
      }).catch(function (x) { er.textContent = x.message; btn.disabled = false; btn.textContent = 'Start chat'; });
    };
  }
  function thread(list) {
    var b = body(); b.innerHTML = '<div id="uc-m" aria-live="polite"></div><form id="uc-f" autocomplete="off"><textarea placeholder="Type your message..." maxlength="1000" aria-label="Message" rows="1"></textarea><button type="submit">Send</button></form>';
    list.forEach(add); var f = b.querySelector('#uc-f'), ta = f.querySelector('textarea');
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true })); } });
    ta.addEventListener('input', function () { ta.style.height = '44px'; ta.style.height = Math.min(110, ta.scrollHeight) + 'px'; });
    f.onsubmit = function (e) { e.preventDefault(); var t = ta.value.trim(); if (!t) return; var btn = f.querySelector('button'); btn.disabled = true; ta.value = ''; ta.style.height = '44px';
      fetchJson('/api/chat/' + st.id + '/send', { method: 'POST', body: JSON.stringify({ token: st.token, text: t }) }).then(function (r) { add(r.message); }).catch(function (x) { if (x.status === 409) closed(); else { sys('Not sent: ' + x.message); ta.value = t; } }).then(function () { btn.disabled = false; ta.focus(); }); };
    if (st.open) ta.focus();
  }
  function box() { return el.p.querySelector('#uc-m'); }
  function sys(t) { var m = box(); if (!m) return; var g = $('div', { 'class': 'uc-g y' }); g.textContent = t; m.appendChild(g); m.scrollTop = m.scrollHeight; }
  function add(m) {
    if (m.id <= st.last && st.last) return; st.last = Math.max(st.last, m.id); var b = box(); if (!b) return;
    var g = $('div', { 'class': 'uc-g ' + (m.from === 'visitor' ? 'v' : m.from === 'staff' ? 's' : 'y') }); if (m.from === 'staff') { var n = $('b'); n.textContent = m.by || 'Team'; g.appendChild(n); }
    g.appendChild(document.createTextNode(m.text)); if (m.from !== 'system') { var t = $('small'); t.textContent = tm(m.t); g.appendChild(t); } b.appendChild(g); b.scrollTop = b.scrollHeight;
    if (m.from === 'staff') { if (!st.open || document.hidden) { st.unread++; badge(); beep(); } }
  }
  function closed() { st.closed = true; disconnect(); var f = el.p.querySelector('#uc-f'); if (f) f.outerHTML = '<div id="uc-s"><p>This chat has ended.</p><button class="go" type="button" id="uc-new">Start a new chat</button></div>'; var n = el.p.querySelector('#uc-new'); if (n) n.onclick = function () { st.id = ''; st.token = ''; st.last = 0; save(); form(); }; }
  function disconnect() { if (st.es) { st.es.close(); st.es = null; } clearInterval(st.poll); st.poll = null; }
  function pull() { if (!st.id) return; fetchJson('/api/chat/' + st.id + '/messages?token=' + encodeURIComponent(st.token) + '&after=' + st.last).then(function (r) { presence(r.online); (r.messages || []).forEach(add); if (r.status === 'closed' && !st.closed) closed(); }).catch(function (x) { if (x.status === 404) { st.id = ''; st.token = ''; save(); disconnect(); if (st.open) form(); } }); }
  function connect() {
    disconnect(); if (!st.id) return;
    var startPoll = function () { if (!st.poll) st.poll = setInterval(pull, 3500); };
    if (window.EventSource) {
      try { var es = new EventSource('/api/chat/' + st.id + '/stream?token=' + encodeURIComponent(st.token)); st.es = es; var ok = false;
        es.addEventListener('hello', function (e) { ok = true; try { presence(JSON.parse(e.data).online); } catch (x) { /* ignore */ } });
        es.addEventListener('message', function (e) { try { add(JSON.parse(e.data).message); } catch (x) { /* ignore */ } });
        es.addEventListener('closed', closed);
        es.onerror = function () { if (!ok) { es.close(); st.es = null; startPoll(); } else startPoll(); }; es.onopen = function () { if (st.poll && ok) { clearInterval(st.poll); st.poll = null; } };
        setTimeout(function () { if (!ok) startPoll(); }, 4000);
      } catch (e) { startPoll(); }
    } else startPoll();
    pull();
  }
  function toggle(v) {
    st.open = v === undefined ? !st.open : v; el.p.classList.toggle('on', st.open); el.btn.setAttribute('aria-expanded', st.open); if (document.body) document.body.style.overflow = st.open && innerWidth < 560 ? 'hidden' : '';
    if (!st.open) return; st.unread = 0; badge();
    if (st.id) { if (!box()) { fetchJson('/api/chat/' + st.id + '/messages?token=' + encodeURIComponent(st.token)).then(function (r) { presence(r.online); st.last = 0; thread(r.messages || []); if (r.status === 'closed') closed(); else connect(); }).catch(function () { st.id = ''; st.token = ''; save(); form(); }); } else { var t = el.p.querySelector('textarea'); t && t.focus(); } }
    else { fetchJson('/api/chat/status').then(function (r) { presence(r.online); }).catch(function () { presence(false); }).then(function () { if (!st.id) form(); }); }
  }
  function teaser() {
    if (st.id || /^\/app/.test(location.pathname)) return; try { if (sessionStorage.getItem('uc.t')) return; } catch (e) { /* ignore */ }
    setTimeout(function () { if (st.open || st.id) return; var t = $('div', { id: 'uc-t', role: 'button', tabindex: '0' }, 'Hi! \ud83d\udc4b Questions about Umrah packages or flights? Chat with us.<button type="button" aria-label="Dismiss">&times;</button>'); document.body.appendChild(t); t.classList.add('on');
      var hide = function () { t.remove(); try { sessionStorage.setItem('uc.t', '1'); } catch (e) { /* ignore */ } };
      t.onclick = function (e) { hide(); if (e.target.tagName !== 'BUTTON') toggle(true); }; t.onkeydown = function (e) { if (e.key === 'Enter') { hide(); toggle(true); } }; setTimeout(hide, 20000); }, 6000);
  }
  window.umrahChat = { open: function () { if (!el.p) return; toggle(true); var t = document.getElementById('uc-t'); if (t) t.remove(); }, close: function () { toggle(false); } };
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('[data-open-chat]'); if (a) { e.preventDefault(); window.umrahChat.open(); } });
  function init() { build(); teaser(); presence(false); if (st.id) { fetchJson('/api/chat/' + st.id + '/messages?token=' + encodeURIComponent(st.token)).then(function (r) { presence(r.online); (r.messages || []).forEach(function (m) { if (m.from === 'staff') st.unread++; }); st.last = (r.messages || []).length ? r.messages[r.messages.length - 1].id : 0; try { var seen = +sessionStorage.getItem('uc.seen.' + st.id) || 0; if (seen) st.unread = Math.max(0, (r.messages || []).filter(function (m) { return m.from === 'staff' && m.id > seen; }).length); } catch (e) { /* ignore */ } st.last = 0; badge(); if (r.status !== 'closed') connect(); }).catch(function () { st.id = ''; st.token = ''; save(); }); } }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && st.open) { st.unread = 0; badge(); } });
  window.addEventListener('beforeunload', function () { try { if (st.id) sessionStorage.setItem('uc.seen.' + st.id, String(st.last || 0)); } catch (e) { /* ignore */ } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
