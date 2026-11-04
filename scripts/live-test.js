'use strict';
/* Live chat, multi-account email (real SMTP conversation with a local mock server), promotions, offers SEO. Run: node scripts/live-test.js */
const { spawn } = require('child_process'); const http = require('http'); const net = require('net'); const fs = require('fs'); const os = require('os'); const path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm4-')), PORT = 4100 + Math.floor(Math.random() * 90), B = 'http://127.0.0.1:' + PORT;
let pass = 0, failN = 0; const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { failN++; console.log('  FAIL', m); } };
/* ---- mock SMTP server: EHLO, AUTH PLAIN, MAIL/RCPT/DATA ---- */
const mails = [];
const smtp = net.createServer(sock => {
  let data = false, buf = '', cur = { to: [] };
  sock.write('220 mock ESMTP\r\n');
  sock.on('data', d => { buf += d.toString(); let i; while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2);
    if (data) { if (line === '.') { data = false; cur.raw = cur.body; mails.push(cur); cur = { to: [] }; sock.write('250 queued\r\n'); } else (cur.body = (cur.body || '') + line + '\n'); continue; }
    if (/^EHLO/i.test(line)) sock.write('250-mock\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n');
    else if (/^AUTH PLAIN/i.test(line)) { const [, u, p] = Buffer.from(line.split(' ')[2], 'base64').toString().split('\0'); if (u === 'bookings@mock.test' && p === 'secret-pass') sock.write('235 ok\r\n'); else sock.write('535 5.7.8 bad credentials\r\n'); }
    else if (/^MAIL FROM/i.test(line)) { cur.from = line.slice(10); sock.write('250 ok\r\n'); }
    else if (/^RCPT TO/i.test(line)) { cur.to.push(line.slice(8).replace(/[<>]/g, '')); sock.write('250 ok\r\n'); }
    else if (/^DATA/i.test(line)) { data = true; sock.write('354 go\r\n'); }
    else if (/^QUIT/i.test(line)) { sock.write('221 bye\r\n'); sock.end(); } else sock.write('250 ok\r\n'); } });
});
class C { constructor() { this.c = ''; }
  async req(m, u, b) { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: this.c }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) this.c = sc.split(';')[0]; const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j, h: r.headers }; }
  login(l, p) { return this.req('POST', '/api/login', { login: l, password: p }); } rpc(op, p) { return this.req('POST', '/api/rpc', { op, ...p }); } get(u) { return this.req('GET', u); } post(u, b) { return this.req('POST', u, b); } }
/* minimal SSE reader */
function sse(url, cookie) { const ev = []; const req = http.get(url, { headers: cookie ? { cookie } : {} }, res => { let b = ''; res.on('data', d => { b += d; let i; while ((i = b.indexOf('\n\n')) >= 0) { const blk = b.slice(0, i); b = b.slice(i + 2); const m = /event: (\w+)\ndata: (.*)/s.exec(blk); if (m) ev.push({ e: m[1], d: JSON.parse(m[2]) }); } }); }); req.on('error', () => {}); return { ev, close: () => req.destroy() }; }
const wait = (f, ms = 3000) => new Promise(r => { const t0 = Date.now(); const k = () => (f() ? r(true) : Date.now() - t0 > ms ? r(false) : setTimeout(k, 40)); k(); });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
(async () => {
  await new Promise(r => smtp.listen(0, '127.0.0.1', r)); const SP = smtp.address().port;
  const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, DATA_DIR: dir, ADMIN_PASSWORD: 'AdminPass#1' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.on('data', d => /running/.test(String(d)) && r()));
  const A = new C(); await A.login('admin', 'AdminPass#1');

  console.log('Email accounts and routing');
  const acc = { id: 'new1', name: 'Bookings desk', host: '127.0.0.1', port: SP, security: 'none', user: 'bookings@mock.test', pass: 'secret-pass', fromName: 'Umrah Store', fromEmail: 'bookings@mock.test', active: true };
  ok((await A.post('/api/mail/verify', acc)).j.ok, 'connection + login test succeeds with the right credentials');
  const bad = await A.post('/api/mail/verify', { ...acc, pass: 'wrong' }); ok(bad.s === 400 && /username or password/i.test(bad.j.error), 'wrong password gives a clear message');
  const dead = await A.post('/api/mail/verify', { ...acc, port: 1 }); ok(dead.s === 400 && /refused|timed out/i.test(dead.j.error), 'a closed port is reported clearly');
  ok((await A.rpc('saveSettings', { mail: { accounts: [acc, { id: 'm2', name: 'Support', host: 'smtp.example.com', port: 587, security: 'starttls', user: 'a', pass: 'b', fromEmail: 'support@example.com' }], routes: { 'chat.new': { account: 'new1', to: 'team@mock.test, owner@mock.test, nonsense' }, 'lead.new': { account: 'new1', to: 'team@mock.test' }, 'booking.status': { account: 'm2' } } } })).s === 200, 'two accounts and routing saved');
  let st = (await A.get('/api/state')).j; const m = st.settings.mail; ok(m.accounts.length === 2 && m.accounts.every(a => a.pass === '********'), 'passwords are masked in the settings screen');
  ok(m.routes['chat.new'].to === 'team@mock.test, owner@mock.test' && m.routes['chat.new'].account === 'new1', 'invalid recipients are dropped; routing stored');
  await A.rpc('saveSettings', { mail: { accounts: m.accounts, routes: m.routes } }); const t1 = await A.post('/api/mail/test', { id: 'new1', to: 'me@mock.test' });
  ok(t1.j.ok && mails.length === 1 && mails[0].to[0] === 'me@mock.test', 'test email is delivered through the saved account (masked password kept)');
  ok(/Subject: Test email/.test(mails[0].raw) && /multipart\/alternative/.test(mails[0].raw) && /charset=utf-8/.test(mails[0].raw), 'message is a proper multipart UTF-8 email');
  ok((await A.get('/api/state')).j.settings.mail.recent[0].ok === true, 'send log is kept');
  const ns = new C(); await A.rpc('roleSave', { name: 'Noperm', perms: ['dashboard.view'] }); ok((await ns.post('/api/mail/test', { id: 'new1' })).s === 401, 'email test needs sign-in');

  console.log('Live chat');
  const V = new C(); ok((await V.get('/api/chat/status')).j.online === false, 'visitors see "offline" while no staff are connected');
  ok((await V.post('/api/chat/start', { name: 'A', message: 'hi' })).s === 400 && (await V.post('/api/chat/start', { name: 'Ali Khan', message: '  ' })).s === 400 && (await V.post('/api/chat/start', { name: 'Ali Khan', message: 'hi', email: 'bad' })).s === 400, 'start validates name, message and email');
  const mailsBefore = mails.length;
  const s1 = (await V.post('/api/chat/start', { name: 'Ali Khan', phone: '0300 1234567', message: 'Need a 14 night Umrah package', page: '/umrah-group-packages' })).j;
  ok(s1.id && s1.token && s1.messages.length === 2 && /offline/i.test(s1.messages[1].text), 'visitor starts a chat and gets an offline notice');
  ok(await wait(() => mails.length > mailsBefore), 'team is emailed about the new chat'); const cm = mails[mails.length - 1]; ok(cm.to.includes('team@mock.test') && cm.to.includes('owner@mock.test') && /New live chat from Ali Khan/.test(cm.raw), 'email goes to every configured recipient');
  ok((await V.get('/api/chat/' + s1.id + '/messages?token=wrong')).s === 404 && (await V.get('/api/chat/' + s1.id + '/stream')).s === 404, 'a wrong token cannot read the conversation');
  ok((await V.get('/api/chat-admin/list')).s === 401 && (await V.get('/api/chat-admin/' + s1.id)).s === 401, 'visitors cannot reach the staff API');
  const list = (await A.get('/api/chat-admin/list')).j; ok(list.items.length === 1 && list.items[0].unread === 1 && list.unreadTotal === 1 && list.items[0].name === 'Ali Khan', 'admin sees the conversation with an unread counter');
  ok((await A.get('/api/state')).j.notifs.items.some(n => /New live chat/.test(n.title) && n.link === '#/chat/' + s1.id), 'in-app notification created for staff');
  /* real time both ways */
  const staffStream = sse(B + '/api/chat-admin/stream', A.c); ok(await wait(() => staffStream.ev.some(e => e.e === 'hello')), 'staff stream connects'); ok((await V.get('/api/chat/status')).j.online === true, 'visitors now see the team as online');
  const visStream = sse(B + '/api/chat/' + s1.id + '/stream?token=' + encodeURIComponent(s1.token)); await wait(() => visStream.ev.some(e => e.e === 'hello'));
  await V.post('/api/chat/' + s1.id + '/send', { token: s1.token, text: 'Are you there?' }); ok(await wait(() => staffStream.ev.some(e => e.e === 'message' && e.d.message.text === 'Are you there?' && e.d.unreadTotal === 2)), 'staff receive the visitor message instantly');
  const rep = await A.post('/api/chat-admin/' + s1.id + '/reply', { text: 'Walaikum assalam, how can I help?' }); ok(rep.j.message.from === 'staff', 'staff reply');
  ok(await wait(() => visStream.ev.some(e => e.e === 'message' && /how can I help/.test(e.d.message.text))), 'the visitor receives the reply instantly');
  const hist = (await V.get('/api/chat/' + s1.id + '/messages?token=' + encodeURIComponent(s1.token) + '&after=2')).j; ok(hist.messages.length === 2 && hist.messages[0].text === 'Are you there?', 'history can be reloaded after a refresh (polling fallback works)');
  ok((await A.get('/api/chat-admin/' + s1.id)).j.unread === 0, 'replying clears the unread counter');
  const searchR = (await A.get('/api/chat-admin/list?q=umrah%20package')).j; ok(searchR.items.length === 1, 'search finds text inside conversations');
  /* permissions */
  const mk = async (login, perms) => { const rid = (await A.rpc('roleSave', { name: 'R-' + login, perms })).j.id; const sid = (await A.rpc('staffSave', { name: login, login, password: 'StaffPass#12' })).j.id; await A.rpc('staffSetAccess', { id: sid, roleIds: [rid], grants: [], denies: [] }); const c = new C(); await c.login(login, 'StaffPass#12'); return c; };
  const none = await mk('nochat', ['dashboard.view']), viewer = await mk('viewer', ['dashboard.view', 'chat.view']);
  ok((await none.get('/api/chat-admin/list')).s === 403 && (await none.post('/api/chat-admin/' + s1.id + '/reply', { text: 'x' })).s === 403, 'staff without chat.view are refused');
  ok((await viewer.get('/api/chat-admin/list')).s === 200 && (await viewer.req('DELETE', '/api/chat-admin/' + s1.id)).s === 403, 'chat.view can reply but not delete (chat.manage)');
  ok((await A.post('/api/chat-admin/' + s1.id + '/close')).s === 200 && (await V.post('/api/chat/' + s1.id + '/send', { token: s1.token, text: 'late' })).s === 409, 'closing a chat stops further visitor messages');
  ok(visStream.ev.some(e => e.e === 'closed'), 'the visitor is told the chat was closed');
  staffStream.close(); visStream.close();
  ok((await A.req('DELETE', '/api/chat-admin/' + s1.id)).s === 200 && (await A.get('/api/chat-admin/list')).j.items.length === 0, 'admin can delete a conversation and its history');
  let lim = 0; for (let i = 0; i < 8; i++) lim = (await new C().post('/api/chat/start', { name: 'Spam Bot', message: 'x' })).s; ok(lim === 429, 'chat starts are rate limited');
  ok(/EventSource/.test((await V.get('/chat.js')).j) && (await V.get('/')).j.includes('/chat.js') && (await V.get('/umrah-offers')).j.includes('/chat.js'), 'the widget is loaded on the landing page and public pages');

  console.log('Promotions');
  const nv = await A.rpc('savePromo', { type: 'package', title: '14-night Umrah from Lahore', subtitle: 'Hilton + Anwar', price: 285000, oldPrice: 320000, details: ['Visa included', 'Return flights'], image: PNG, featured: true, ctaText: 'Get this deal' });
  ok(nv.s === 200 && nv.j.id, 'a promotion with an image is created');
  const pr = (await V.get('/api/public/promos')).j.items; ok(pr.length === 1 && /^\/promo-img\//.test(pr[0].image) && pr[0].price === 285000 && !('createdAt' in pr[0]), 'it appears on the public API (internal fields hidden)');
  const img = await fetch(B + pr[0].image); ok(img.status === 200 && img.headers.get('content-type') === 'image/png' && /immutable/.test(img.headers.get('cache-control')), 'image is served with long-term caching');
  ok((await A.rpc('savePromo', { title: 'Bad image', image: 'data:image/png;base64,AAAA' })).s === 400 && (await A.rpc('savePromo', { title: 'x' })).s === 400, 'invalid images and titles are rejected');
  await A.rpc('savePromo', { type: 'hotel', title: 'Future deal', startsAt: iso(5), endsAt: iso(20) }); await A.rpc('savePromo', { type: 'offer', title: 'Old deal', endsAt: iso(-2) }); const hid = (await A.rpc('savePromo', { type: 'offer', title: 'Hidden deal', active: false })).j.id;
  ok((await V.get('/api/public/promos')).j.items.length === 1, 'scheduled, expired and hidden promotions are not public');
  ok((await A.get('/api/state')).j.promos.length === 4 && (await A.get('/api/state')).j.promos.find(p => p.title === 'Old deal').live === false, 'admin sees all of them with their status');
  const pn = await mk('nopromo', ['dashboard.view', 'promos.view']); ok((await pn.rpc('savePromo', { title: 'Nope nope' })).s === 403 && (await pn.get('/api/state')).j.promos.length === 4, 'promos.view can look but not change');
  ok((await new C().rpc('savePromo', { title: 'Anon deal' })).s === 401, 'sign-in is required to change promotions');
  const pf = (await A.get('/api/state')).j.promos.find(p => p.type === 'package').image.split('/').pop(); ok((await A.rpc('delPromo', { id: hid })).s === 200, 'a promotion can be deleted');
  const page = (await V.get('/umrah-offers')).j; ok(/14-night Umrah from Lahore/.test(page) && /"@type":"Offer"/.test(page) && /PKR 285,000/.test(page) && /rel="canonical"/.test(page) && !/Future deal|Hidden deal/.test(page), 'the offers page is server-rendered with Offer structured data and only live offers');
  ok(/umrah-offers/.test((await V.get('/sitemap.xml')).j), 'the offers page is in the sitemap');
  const home = (await V.get('/')).j; ok(/<title>/.test(home) && /application\/ld\+json/.test(home) && /og:image/.test(home), 'landing page keeps its meta tags and structured data');
  const lead = await V.post('/api/public/lead', { kind: 'offer', name: 'Sara', phone: '0321 5551234', summary: '14-night Umrah from Lahore', ref: 'x' }); ok(lead.j.ok, 'an enquiry from an offer is accepted');
  ok(await wait(() => mails.some(x => /Website enquiry/.test(x.raw))), 'the enquiry is emailed to the team (lead.new route)');
  const logo = await fetch(B + '/brand/airline/ZZ.png'); ok(logo.status === 200 && /svg|png/.test(logo.headers.get('content-type')), 'airline logos never 404 (generated badge when the logo file is unavailable)');
  ok((await V.get('/healthz')).j.ok === true, 'health check');

  srv.kill('SIGTERM'); smtp.close(); console.log('\n' + pass + ' passed, ' + failN + ' failed'); process.exit(failN ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
