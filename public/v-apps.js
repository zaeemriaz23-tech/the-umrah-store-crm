/* Partner applications: review KYC documents, approve (creates the agent account) or reject with a reason. */
'use strict';
const APP = () => UI.apps || (UI.apps = { tab: 'Pending', q: '', items: null, loading: false });
const APP_DOCS = [['cnicFront', 'CNIC front'], ['cnicBack', 'CNIC back'], ['photo', 'Applicant photo'], ['card', 'Visiting card'], ['licence', 'Business licence / NTN']];
async function appLoad() {
  const a = APP(); a.loading = true;
  try { const r = await api('/api/admin/signups'); a.items = r.items; S.appsPending = r.pending; } catch (e) { toast(e.message, true); a.items = a.items || []; }
  a.loading = false; renderShellBits(); const b = $('#apps-body'); if (b) b.innerHTML = appBody();
}
const appRows = () => { const a = APP(), q = a.q.toLowerCase(); return (a.items || []).filter(x => x.status === a.tab && (!q || (x.company + ' ' + x.first + ' ' + x.last + ' ' + x.email + ' ' + x.ref + ' ' + x.phone).toLowerCase().includes(q))); };
function appBody() {
  const a = APP(); if (a.items === null) return '<div class="card cp"><span class="spin dk"></span></div>';
  const rows = appRows();
  if (!rows.length) return `<div class="card">${empty('users', a.tab === 'Pending' ? 'Nothing waiting for review' : 'No ' + a.tab.toLowerCase() + ' applications', a.tab === 'Pending' ? 'New partner applications from the portal appear here.' : '')}</div>`;
  return `<div class="card" style="overflow:auto"><table class="t"><thead><tr><th>Company</th><th>Owner</th><th>Contact</th><th>City</th><th>Submitted</th><th>Docs</th><th></th></tr></thead><tbody>${rows.map(x => `<tr class="click" data-act="appOpen" data-a="${esc(x.id)}">
    <td><b>${esc(x.company)}</b><div class="sub mono">${esc(x.ref)}</div></td><td>${esc(x.first + ' ' + x.last)}</td><td>${esc(x.phone)}<div class="sub">${esc(x.email)}</div></td><td>${esc(x.city)}</td><td class="num">${esc(ftime(x.createdAt))}</td><td>${x.docs}</td>
    <td class="r">${x.status === 'Pending' ? '<span class="btn pri sm">Review</span>' : `<span class="sub">${esc(x.reviewedBy || '')}</span>`}</td></tr>`).join('')}</tbody></table></div>`;
}
VIEWS.applications = {
  roles: ['admin', 'staff'], title: 'Partner applications', noLive: true,
  render() {
    const a = APP(), cnt = s => (a.items || []).filter(x => x.status === s).length;
    return `<div class="ph"><div><h1>Partner applications</h1><p>Check the documents, then approve to create the agent account. Applicants cannot sign in until you approve.</p></div></div>
    <div class="row sb" style="margin-bottom:14px;gap:10px;flex-wrap:wrap"><div class="tabs">${['Pending', 'Approved', 'Rejected'].map(t => `<button class="${a.tab === t ? 'on' : ''}" data-act="appTab" data-a="${t}">${t} <span class="mute">${a.items ? cnt(t) : ''}</span></button>`).join('')}</div>
    <div class="gs" style="max-width:280px">${ic('search', 'sm')}<input id="apps-q" placeholder="Company, name, email, reference" value="${esc(a.q)}" data-inp="appQ"></div></div><div id="apps-body">${appBody()}</div>`;
  },
  mount() { appLoad(); }
};
INP.appQ = v => { APP().q = v; const b = $('#apps-body'); if (b) b.innerHTML = appBody(); };
ACT.appTab = t => { APP().tab = t; renderView(); };
const kv = (k, v) => (v ? `<div><span class="sub">${esc(k)}</span><div><b>${esc(v)}</b></div></div>` : '');
ACT.appOpen = async id => {
  let a; try { a = await api('/api/admin/signups/' + encodeURIComponent(id)); } catch (e) { return toast(e.message, true); }
  const docs = APP_DOCS.filter(d => a.docs && a.docs[d[0]]).map(d => { const u = `/api/admin/signups/${encodeURIComponent(a.id)}/doc/${d[0]}`, pdf = a.docs[d[0]].ext === 'pdf'; return `<a href="${u}" target="_blank" rel="noopener" style="display:block;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff">${pdf ? `<div style="height:130px;display:grid;place-items:center;background:var(--bg)">${ic('file', 'lg')}</div>` : `<img src="${u}" alt="${esc(d[1])}" loading="lazy" style="width:100%;height:130px;object-fit:cover;display:block">`}<div style="padding:8px 10px;font-weight:700;font-size:12.5px">${esc(d[1])}</div></a>`; }).join('');
  const pend = a.status === 'Pending';
  openModal({ wide: true, title: a.company, body: `<div class="g1"><div class="row" style="gap:8px;flex-wrap:wrap">${sbadge(a.status === 'Approved' ? 'Approved' : a.status === 'Rejected' ? 'Rejected' : 'Pending')}<span class="sub mono">${esc(a.ref)}</span><span class="sub">Submitted ${esc(ftime(a.createdAt))}</span></div>
    <div class="g3" style="gap:14px">${kv('Owner', a.first + ' ' + a.last)}${kv('CNIC', a.cnic)}${kv('Phone', a.phone)}${kv('Email (login)', a.email)}${kv('Business type', a.type)}${kv('City', a.city)}${kv('Address', a.address)}${kv('Website', a.website)}${kv('Licence / NTN', a.licenceNo)}${kv('IATA / IATA-agent no.', a.iata)}${kv('Years in business', a.years)}${kv('Expected monthly bookings', a.volume)}</div>
    <div><b>Documents</b><div class="g3" style="margin-top:8px">${docs || '<span class="mute">No documents</span>'}</div><p class="hint" style="margin-top:6px">Click a document to open it full size in a new tab.</p></div>
    ${pend ? `<div class="g2">${fld('Credit limit (PKR)', '<input id="ap-lim" inputmode="numeric" placeholder="0 = prepaid only">')}${fld('Reason (only if rejecting)', '<input id="ap-why" placeholder="e.g. CNIC photo is blurry">')}</div>` : a.status === 'Rejected' ? `<div class="warnbox">Rejected by ${esc(a.reviewedBy || '')}: ${esc(a.reason || '')}</div>` : `<div class="okbox">Approved by ${esc(a.reviewedBy || '')}. The partner signs in with ${esc(a.email)}.</div>`}</div>`,
    foot: pend ? `<button class="btn ghost" data-act="closeModal">Close</button><button class="btn danger" data-act="appReject" data-a="${esc(a.id)}">Reject</button><button class="btn pri" data-act="appApprove" data-a="${esc(a.id)}">${ic('check', 'sm')} Approve & create account</button>` : '<button class="btn ghost" data-act="closeModal">Close</button>' });
};
async function appDecide(btn, id, kind) {
  busy(btn, true);
  try { await api(`/api/admin/signups/${encodeURIComponent(id)}/${kind}`, { method: 'POST', body: JSON.stringify(kind === 'approve' ? { limit: val('ap-lim') } : { reason: val('ap-why') }) }); toast(kind === 'approve' ? 'Approved. The partner can sign in now.' : 'Application rejected'); closeModal(); await appLoad(); await load(); }
  catch (e) { toast(e.message, true); busy(btn, false); }
}
ACT.appApprove = (id, b) => appDecide(b, id, 'approve');
ACT.appReject = (id, b) => appDecide(b, id, 'reject');
