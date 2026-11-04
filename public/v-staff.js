/* Staff & access: staff list, permission matrix, role templates, departments, audit log. Every control calls a server operation that re-checks permission. */
'use strict';
const SF = () => UI.staff || (UI.staff = { tab: 'staff', q: '', dept: '', role: '', status: '', audit: { q: '', action: '', user: '', from: '', to: '', off: 0 } });
const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'manage'];
let ED = null; // permission editor state { id, roleIds, grants:Set, denies:Set, dirty, open:Set, base }
const rb = () => S.rbac || { modules: [], roles: [], departments: [], grantable: [] };
const roleName = id => (rb().roles.find(r => r.id === id) || { name: '(removed)' }).name;
const stfTabs = () => [['staff', 'Staff', can('staff.view')], ['roles', 'Role templates', canAny('roles.manage', 'staff.view')], ['depts', 'Departments', canAny('roles.manage', 'staff.view')], ['audit', 'Audit log', can('audit.view')]].filter(x => x[2]);
const statusOf = u => (u.suspended ? ['Suspended', 'red'] : u.active === false ? ['Inactive', 'gray'] : ['Active', 'green']);
const lastSeen = u => (u.lastLogin ? ftime(u.lastLogin) : 'Never');

VIEWS.staff = {
  roles: ['admin', 'staff'], title: 'Staff & access', noLive: true,
  render() {
    const f = SF(), tabs = stfTabs(); if (!tabs.some(x => x[0] === f.tab)) f.tab = tabs[0] ? tabs[0][0] : 'staff';
    return `<div class="ph"><div><h1>Staff & access</h1><p>Each employee has their own login. Access is granted per permission - departments are only labels.</p></div><div class="sp">${f.tab === 'staff' && can('staff.create') ? `<button class="btn pri" data-act="stfNew">${ic('plus')}Add staff</button>` : ''}${f.tab === 'roles' && can('roles.manage') ? `<button class="btn pri" data-act="roleNew">${ic('plus')}New role template</button>` : ''}${f.tab === 'depts' && can('roles.manage') ? `<button class="btn pri" data-act="deptNew">${ic('plus')}Add department</button>` : ''}</div></div>
    <div class="tabs" style="margin-bottom:14px">${tabs.map(x => `<button class="${f.tab === x[0] ? 'on' : ''}" data-act="stfTab" data-a="${x[0]}">${x[1]}</button>`).join('')}</div>
    <div id="stf-body">${f.tab === 'staff' ? stfList() : f.tab === 'roles' ? roleList() : f.tab === 'depts' ? deptList() : auditShell()}</div>`;
  },
  mount() { if (SF().tab === 'audit') auditLoad(); }
};
ACT.stfTab = t => { SF().tab = t; renderView(); };

/* ---------- staff list ---------- */
function stfRows() {
  const f = SF(), q = f.q.toLowerCase();
  return (S.users || []).filter(u => u.role === 'staff' || u.role === 'admin').filter(u => (!q || (u.name + ' ' + u.login + ' ' + (u.title || '')).toLowerCase().includes(q)) && (!f.dept || u.dept === f.dept) && (!f.role || (u.roleIds || []).includes(f.role)) && (!f.status || statusOf(u)[0] === f.status));
}
function stfList() {
  const f = SF(), r = rb(), rows = stfRows();
  return `<div class="fb"><div class="gs" style="background:#fff">${ic('search', 'sm')}<input placeholder="Search name or username..." value="${esc(f.q)}" data-inp="stfQ"></div>
  <div class="fld"><span>Department</span><select data-chg="stfF" data-k="dept">${opts(r.departments.map(d => d.name), f.dept, 'All')}</select></div>
  <div class="fld"><span>Role</span><select data-chg="stfF" data-k="role">${opts(r.roles.map(x => [x.id, x.name]), f.role, 'All')}</select></div>
  <div class="fld"><span>Status</span><select data-chg="stfF" data-k="status">${opts(['Active', 'Inactive', 'Suspended'], f.status, 'All')}</select></div></div>
  <div class="card tw"><table class="t"><thead><tr><th>Employee</th><th>Department / title</th><th>Roles</th><th>Status</th><th>Last login</th><th></th></tr></thead><tbody id="stf-rows">${stfBody(rows)}</tbody></table></div>`;
}
function stfBody(rows) {
  return rows.map(u => { const [sl, sc] = statusOf(u), adm = u.role === 'admin';
    return `<tr><td><div class="row"><div class="av" style="width:32px;height:32px;font-size:12px">${esc(initials(u.name))}</div><div><b>${esc(u.name)}</b><div class="sub">${esc(u.login)}</div></div></div></td><td>${esc(u.dept || '-')}<div class="sub">${esc(u.title || '')}</div></td>
    <td>${adm ? '<span class="bdg green">Full administrator</span>' : ((u.roleIds || []).map(id => `<span class="tag">${esc(roleName(id))}</span>`).join(' ') || '<span class="mute">none</span>') + ((u.grants || []).length ? ` <span class="pill">+${u.grants.length} extra</span>` : '') + ((u.denies || []).length ? ` <span class="pill">−${u.denies.length} removed</span>` : '')}</td>
    <td><span class="bdg ${sc}">${sl}</span></td><td class="sub">${lastSeen(u)}${u.sessions ? ' · ' + u.sessions + ' session(s)' : ''}</td>
    <td class="r">${adm ? '<span class="sub">Protected</span>' : `<button class="btn sm" data-act="stfOpen" data-a="${esc(u.id)}">${can('permissions.manage') || can('staff.edit') ? 'Manage' : 'View'}</button>`}</td></tr>`; }).join('') || `<tr><td colspan="6">${empty('users', 'No staff match', 'Add an employee or change the filters.')}</td></tr>`;
}
INP.stfQ = v => { SF().q = v; $('#stf-rows').innerHTML = stfBody(stfRows()); };
CHG.stfF = (v, t) => { SF()[t.dataset.k] = v; renderView(); };

ACT.stfNew = () => { const d = rb().departments.filter(x => x.active); openModal({ title: 'Add staff account', body: `<div class="g1">${fld('Full name', '<input id="sn-n">')}<div class="g2">${fld('Username', '<input id="sn-l" autocomplete="off">')}${fld('Temporary password (8+)', '<input id="sn-p" type="text" autocomplete="off">')}</div><div class="g2">${fld('Department', `<select id="sn-d">${opts(d.map(x => x.name), '', 'Select...')}</select>`)}${fld('Job title', '<input id="sn-t">')}</div><p class="hint">The account starts with <b>no access</b>. Assign a role and permissions next. The employee is asked to change the password at first sign-in.</p></div>`, foot: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="stfCreate">Create account</button>' }); };
ACT.stfCreate = async (a, b) => { try { const r = await doRpc(b, 'staffSave', { name: val('sn-n'), login: val('sn-l'), password: val('sn-p'), dept: val('sn-d'), title: val('sn-t') }, 'Staff account created'); closeModal(); setTimeout(() => ACT.stfOpen(r.id), 50); } catch { /* shown */ } };

/* ---------- staff editor: details + permission matrix ---------- */
const ctxAll = new Set();
function edInit(u) { ED = { id: u.id, roleIds: [...(u.roleIds || [])], grants: new Set(u.grants || []), denies: new Set(u.denies || []), dirty: false, open: new Set(), eff: null, tab: 'access' }; }
ACT.stfOpen = id => { const u = (S.users || []).find(x => x.id === id); if (!u) return; edInit(u); go('staff', 'edit', id); };
const origRender = VIEWS.staff.render;
VIEWS.staff.render = function () { const r = route(); if (r.args[0] === 'edit') return editPage(r.args[1]); return origRender.call(this); };
function roleSet() { const s = new Set(); ED.roleIds.forEach(id => { const r = rb().roles.find(x => x.id === id); if (r && r.active !== false) (r.perms || []).forEach(k => s.add(k)); }); return s; }
const effSet = () => { const s = roleSet(); ED.grants.forEach(k => s.add(k)); ED.denies.forEach(k => s.delete(k)); return s; };
const canGrant = k => isAdmin() || (rb().grantable || []).includes(k);
const adminOnlyPerm = k => ['settings.security', 'assistant.use', 'system.admin'].includes(k);

function editPage(id) {
  const u = (S.users || []).find(x => x.id === id); if (!u) return empty('search', 'Staff account not found', '', '<a class="btn" href="#/staff">Back</a>');
  if (!ED || ED.id !== id) edInit(u);
  const mine = u.id === S.user.id, canAcc = ED.canAcc = can('permissions.manage') && !mine, canEd = can('staff.edit') && !mine, [sl, sc] = statusOf(u), r = rb();
  const tabs = [['access', 'Permissions'], ['effective', 'Effective summary'], ['account', 'Account & security']];
  return `<div class="no-print" style="margin-bottom:10px"><a class="btn ghost sm" href="#/staff" data-act="stfBack">${ic('back', 'sm')}All staff</a></div>
  <div class="ph"><div><h1>${esc(u.name)} <span class="bdg ${sc}" style="vertical-align:middle">${sl}</span></h1><p>${esc(u.login)} · ${esc(u.dept || 'No department')}${u.title ? ' · ' + esc(u.title) : ''} · last login ${lastSeen(u)}</p></div></div>
  ${mine ? `<div class="warnbox" style="margin-bottom:14px">${ic('alert')}You cannot change your own access. Another administrator or permission manager must do it.</div>` : ''}
  <div class="tabs" style="margin-bottom:14px">${tabs.map(x => `<button class="${ED.tab === x[0] ? 'on' : ''}" data-act="edTab" data-a="${x[0]}">${x[1]}</button>`).join('')}</div>
  <div id="ed-body">${ED.tab === 'access' ? accessTab(u, canAcc) : ED.tab === 'effective' ? effTab(u) : acctTab(u, canEd)}</div>`;
}
ACT.stfBack = (a, b, e) => { if (ED && ED.dirty && !confirm('You have unsaved permission changes. Leave without saving?')) { e.preventDefault(); return; } ED = null; };
window.addEventListener('hashchange', () => { if (ED && ED.dirty && !/^#\/staff\/edit\//.test(location.hash)) { if (confirm('You have unsaved permission changes. Leave without saving?')) ED = null; else location.hash = '#/staff/edit/' + encodeURIComponent(ED.id); } });
ACT.edTab = t => { ED.tab = t; if (t === 'effective') { ED.eff = null; rpc('staffEffective', { id: ED.id }).then(r => { ED.eff = r.breakdown; renderView(); }).catch(e => toast(e.message, true)); } renderView(); };

function accessTab(u, canAcc) {
  const r = rb(), eff = effSet(), roleP = roleSet();
  return `<div class="gm"><div>
  <div class="card cp"><div class="sec">Role templates (optional - combine as needed)</div><div class="chips">${r.roles.filter(x => x.active !== false || ED.roleIds.includes(x.id)).map(x => `<label class="chk" style="margin-right:12px"><input type="checkbox" ${ED.roleIds.includes(x.id) ? 'checked' : ''} ${canAcc ? '' : 'disabled'} data-chg="edRole" data-k="${esc(x.id)}">${esc(x.name)}</label>`).join('')}</div></div><div class="gap"></div>
  <div class="card"><div class="ch"><h3>Permission matrix</h3><span class="sp"><button class="btn sm" data-act="edExpand">Expand all</button><button class="btn sm" data-act="edCollapse">Collapse all</button>${canAcc ? `<button class="btn sm" data-act="edReset">Reset to role defaults</button>` : ''}</span></div>
  <div class="cp hint">Dot colours: <b>role</b> = from a role template · <b>direct</b> = granted to this person · <b>removed</b> = explicitly taken away. ⚠ marks high-risk permissions.${isAdmin() ? '' : ' You can only delegate permissions you hold.'}</div>
  ${r.modules.map(m => modBlock(m, eff, roleP, canAcc)).join('')}</div></div>
  <div><div class="card cp" style="position:sticky;top:76px"><div class="sec">Summary</div><div class="kv"><div><span class="l">Roles</span><b>${ED.roleIds.length}</b></div><div><span class="l">Effective permissions</span><b>${eff.size}</b></div><div><span class="l">Direct extras</span><b>${ED.grants.size}</b></div><div><span class="l">Removed</span><b>${ED.denies.size}</b></div></div>
  <div id="ed-warn">${riskWarn(eff)}</div>${canAcc ? `<div class="row" style="margin-top:14px"><button class="btn pri" data-act="edSave" id="ed-save" ${ED.dirty ? '' : 'disabled'}>Save changes</button><button class="btn" data-act="edCancel">Cancel</button></div><div class="hint" id="ed-dirty" style="margin-top:8px">${ED.dirty ? 'You have unsaved changes.' : 'No unsaved changes.'}</div>` : '<div class="hint" style="margin-top:12px">View only.</div>'}</div></div></div>`;
}
function riskWarn(eff) { const hi = [...eff].filter(k => (S.rbac.modules.flatMap(m => m.perms).find(p => p[0] === k) || [])[2]); return hi.length ? `<div class="warnbox" style="margin-top:12px">${ic('alert')}<span>${hi.length} high-risk permission(s) active: ${esc(hi.slice(0, 6).join(', '))}${hi.length > 6 ? '…' : ''}</span></div>` : ''; }
function modBlock(m, eff, roleP, canAcc) {
  const open = ED.open.has(m.id), n = m.perms.filter(p => eff.has(p[0])).length;
  return `<div class="item" style="display:block;padding:0"><div class="row sb click" style="padding:12px 16px" data-act="edToggle" data-a="${esc(m.id)}"><b>${ic('chev', 'sm')} ${esc(m.name)}</b><span><span class="pill">${n}/${m.perms.length}</span></span></div>
  ${open ? `<div style="padding:0 16px 14px">${canAcc ? `<div class="row" style="margin-bottom:8px"><button class="btn sm" data-act="edAll" data-a="${esc(m.id)}">Select all in module</button><button class="btn sm" data-act="edNone" data-a="${esc(m.id)}">Clear module</button></div>` : ''}<table class="t"><tbody>${m.perms.map(p => permRow(p, eff, roleP, canAcc)).join('')}</tbody></table></div>` : ''}</div>`;
}
function permRow([k, label, risk], eff, roleP, canAcc) {
  const on = eff.has(k), src = ED.denies.has(k) ? '<span class="pill" style="color:var(--red)">removed</span>' : ED.grants.has(k) && !roleP.has(k) ? '<span class="pill" style="color:var(--blue,#175cd3)">direct</span>' : roleP.has(k) ? '<span class="pill">role</span>' : '';
  const locked = !canAcc || !canGrant(k) || adminOnlyPerm(k);
  return `<tr><td style="width:44px"><input type="checkbox" ${on ? 'checked' : ''} ${locked ? 'disabled' : ''} data-chg="edPerm" data-k="${esc(k)}" aria-label="${esc(label)}"></td><td>${esc(label)}${risk ? ' <span title="High-risk permission">⚠</span>' : ''}${adminOnlyPerm(k) ? ' <span class="sub">(administrator only)</span>' : ''}<div class="sub mono">${esc(k)}</div></td><td class="r">${src}</td></tr>`;
}
const redraw = () => { const y = window.scrollY; $('#ed-body').innerHTML = accessTab((S.users || []).find(x => x.id === ED.id), !!ED.canAcc); window.scrollTo(0, y); };
ACT.edToggle = id => { ED.open.has(id) ? ED.open.delete(id) : ED.open.add(id); redraw(); };
ACT.edExpand = () => { rb().modules.forEach(m => ED.open.add(m.id)); redraw(); };
ACT.edCollapse = () => { ED.open.clear(); redraw(); };
CHG.edRole = (v, t) => { const id = t.dataset.k; ED.roleIds = ED.roleIds.filter(x => x !== id); if (v) ED.roleIds.push(id); ED.dirty = true; redraw(); };
CHG.edPerm = (v, t) => {
  const k = t.dataset.k, rp = roleSet();
  if (v) { ED.denies.delete(k); if (!rp.has(k)) ED.grants.add(k); } else { ED.grants.delete(k); if (rp.has(k)) ED.denies.add(k); }
  ED.dirty = true; redraw();
};
const modKeys = id => (rb().modules.find(m => m.id === id) || { perms: [] }).perms.map(p => p[0]).filter(k => canGrant(k) && !adminOnlyPerm(k));
ACT.edAll = id => { const rp = roleSet(); modKeys(id).forEach(k => { ED.denies.delete(k); if (!rp.has(k)) ED.grants.add(k); }); ED.dirty = true; redraw(); };
ACT.edNone = id => { const rp = roleSet(); modKeys(id).forEach(k => { ED.grants.delete(k); if (rp.has(k)) ED.denies.add(k); }); ED.dirty = true; redraw(); };
ACT.edReset = async () => { if (!(await confirmBox('Reset to role defaults', 'Remove all direct extras and removals so only the selected roles apply?', 'Reset'))) return; ED.grants.clear(); ED.denies.clear(); ED.dirty = true; redraw(); };
ACT.edCancel = async () => { if (ED.dirty && !(await confirmBox('Discard changes', 'Discard unsaved permission changes?', 'Discard', true))) return; const u = S.users.find(x => x.id === ED.id); edInit(u); renderView(); };
ACT.edSave = async (a, b) => {
  const eff = effSet(), hi = [...eff].filter(k => (rb().modules.flatMap(m => m.perms).find(p => p[0] === k) || [])[2]);
  const u = S.users.find(x => x.id === ED.id);
  if (!(await confirmBox('Save access for ' + esc(u.name), `This sets <b>${eff.size}</b> effective permission(s)${hi.length ? `, including <b>${hi.length} high-risk</b>: ${esc(hi.slice(0, 8).join(', '))}` : ''}. Changes apply immediately.`, 'Save changes', hi.length > 0))) return;
  try { await doRpc(b, 'staffSetAccess', { id: ED.id, roleIds: ED.roleIds, grants: [...ED.grants], denies: [...ED.denies] }, 'Access saved'); ED.dirty = false; renderView(); } catch { /* toast shown */ }
};
window.addEventListener('beforeunload', e => { if (ED && ED.dirty) { e.preventDefault(); e.returnValue = ''; } });

function effTab(u) {
  if (!ED.eff) return '<div class="card cp"><span class="spin dk"></span> Loading saved permissions from the server…</div>';
  const rows = rb().modules.map(m => { const ps = m.perms.map(p => ({ p, d: ED.eff[p[0]] })).filter(x => x.d && x.d.eff); return ps.length ? `<div class="item" style="display:block"><b>${esc(m.name)}</b><div class="sub" style="margin-top:6px">${ps.map(({ p, d }) => `<div>${esc(p[1])} <span class="mono faint">${esc(p[0])}</span> · ${d.direct && !d.roles.length ? '<span class="pill">direct</span>' : d.roles.map(x => `<span class="pill">${esc(x)}</span>`).join(' ') + (d.direct ? ' <span class="pill">+direct</span>' : '')}</div>`).join('')}</div></div>` : ''; }).join('');
  const denied = Object.entries(ED.eff).filter(([, d]) => d.denied && d.roles.length);
  return `<div class="card"><div class="ch"><h3>What ${esc(u.name)} can do right now (as saved on the server)</h3></div>${rows || empty('shield', 'No access', 'This account currently has no permissions.')}${denied.length ? `<div class="cp"><div class="sec">Removed from roles</div>${denied.map(([k]) => `<span class="tag mono">${esc(k)}</span> `).join('')}</div>` : ''}</div>`;
}
function acctTab(u, canEd) {
  const r = rb(), d = r.departments.filter(x => x.active || x.name === u.dept);
  return `<div class="g2" style="align-items:start"><div class="card cp"><div class="sec">Details</div><div class="g1">${fld('Full name', `<input id="ac-n" value="${esc(u.name)}" ${canEd ? '' : 'disabled'}>`)}${fld('Department (label only - does not grant access)', `<select id="ac-d" ${canEd ? '' : 'disabled'}>${opts(d.map(x => x.name), u.dept, 'None')}</select>`)}${fld('Job title', `<input id="ac-t" value="${esc(u.title || '')}" ${canEd ? '' : 'disabled'}>`)}${canEd ? `<button class="btn pri" data-act="acSave">Save details</button>` : ''}</div></div>
  <div class="card cp"><div class="sec">Account status & security</div><p class="hint" style="margin-bottom:10px">Status: <b>${statusOf(u)[0]}</b> · ${u.sessions || 0} active session(s) · created ${u.created ? fdate(u.created.slice(0, 10)) : '-'}</p>
  ${canEd ? `<div class="row" style="flex-wrap:wrap;gap:8px">${u.suspended || u.active === false ? `<button class="btn pri" data-act="acStatus" data-a="active">Activate</button>` : `<button class="btn" data-act="acStatus" data-a="suspended">Suspend</button><button class="btn" data-act="acStatus" data-a="inactive">Deactivate</button>`}<button class="btn" data-act="acReset">Reset password</button><button class="btn" data-act="acRevoke">Sign out all sessions</button>${can('staff.delete') ? `<button class="btn danger" data-act="acDel">Delete</button>` : ''}</div>` : '<span class="mute">You cannot manage this account.</span>'}</div></div>`;
}
ACT.acSave = async (a, b) => { await doRpc(b, 'staffSave', { id: ED.id, name: val('ac-n'), dept: val('ac-d'), title: val('ac-t') }, 'Details saved'); };
ACT.acStatus = async (st, b) => { if (st !== 'active' && !(await confirmBox('Change status', 'This signs the employee out immediately and blocks access until reactivated.', 'Confirm', true))) return; await doRpc(b, 'staffSetStatus', { id: ED.id, status: st }, 'Status updated'); };
ACT.acReset = () => openModal({ title: 'Reset password', body: fld('New temporary password (8+ characters)', '<input id="ac-pw" type="text" autocomplete="off">') + '<p class="hint" style="margin-top:8px">All their sessions are signed out and they must change it at next login. Passwords are never shown or stored in readable form.</p>', foot: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="acReset2">Reset</button>' });
ACT.acReset2 = async (a, b) => { await doRpc(b, 'staffResetPassword', { id: ED.id, password: val('ac-pw') }, 'Password reset', closeModal); };
ACT.acRevoke = async (a, b) => { await doRpc(b, 'staffRevokeSessions', { id: ED.id }, 'Sessions revoked'); };
ACT.acDel = async () => { if (await confirmBox('Delete staff account', 'Permanently delete this login? Their past actions stay in the audit log. Consider deactivating instead.', 'Delete', true)) { try { await rpc('staffDelete', { id: ED.id }); toast('Deleted'); ED = null; await load(); go('staff'); } catch (e) { toast(e.message, true); } } };

/* ---------- roles ---------- */
function roleList() {
  const r = rb(); return `<div class="card tw"><table class="t"><thead><tr><th>Role template</th><th>Description</th><th class="r">Permissions</th><th class="r">Staff</th><th></th></tr></thead><tbody>${r.roles.map(x => `<tr><td><b>${esc(x.name)}</b>${x.active === false ? ' <span class="bdg gray">Inactive</span>' : ''}</td><td class="sub">${esc(x.desc || '')}</td><td class="r num">${(x.perms || []).length}</td><td class="r num">${(S.users || []).filter(u => (u.roleIds || []).includes(x.id)).length}</td><td class="r"><button class="btn sm" data-act="roleEdit" data-a="${esc(x.id)}">${can('roles.manage') ? 'Edit' : 'View'}</button></td></tr>`).join('')}</tbody></table></div>`;
}
let RE = null;
ACT.roleNew = () => { RE = { id: '', name: '', desc: '', perms: new Set(), active: true }; roleModal(); };
ACT.roleEdit = id => { const x = rb().roles.find(r => r.id === id); RE = { id, name: x.name, desc: x.desc || '', perms: new Set(x.perms || []), active: x.active !== false }; roleModal(); };
function roleModal() {
  const ed = can('roles.manage');
  openModal({ title: RE.id ? 'Role template: ' + RE.name : 'New role template', wide: true, body: `<div class="g2">${fld('Name', `<input id="rl-n" value="${esc(RE.name)}" ${ed ? '' : 'disabled'}>`)}${fld('Description', `<input id="rl-d" value="${esc(RE.desc)}" ${ed ? '' : 'disabled'}>`)}</div><label class="chk" style="margin:10px 0"><input type="checkbox" id="rl-a" ${RE.active ? 'checked' : ''} ${ed ? '' : 'disabled'}>Active (can be assigned)</label>
  <div style="max-height:50vh;overflow:auto">${rb().modules.map(m => `<div class="item" style="display:block"><b>${esc(m.name)}</b><div class="row" style="flex-wrap:wrap;gap:4px 16px;margin-top:6px">${m.perms.map(([k, l, risk]) => `<label class="chk"><input type="checkbox" ${RE.perms.has(k) ? 'checked' : ''} ${!ed || !canGrant(k) || adminOnlyPerm(k) ? 'disabled' : ''} data-chg="rlPerm" data-k="${esc(k)}">${esc(l)}${risk ? ' ⚠' : ''}</label>`).join('')}</div></div>`).join('')}</div>`,
    foot: `${RE.id && ed ? '<button class="btn ghost" style="margin-right:auto;color:var(--red)" data-act="roleDel">Delete</button>' : ''}<button class="btn ghost" data-act="closeModal">Close</button>${ed ? '<button class="btn pri" data-act="roleSave">Save role</button>' : ''}` });
}
CHG.rlPerm = (v, t) => { v ? RE.perms.add(t.dataset.k) : RE.perms.delete(t.dataset.k); };
ACT.roleSave = async (a, b) => { await doRpc(b, 'roleSave', { id: RE.id || undefined, name: val('rl-n'), desc: val('rl-d'), active: $('#rl-a').checked, perms: [...RE.perms] }, 'Role saved. Changes apply to everyone who has it.', closeModal); };
ACT.roleDel = async () => { if (await confirmBox('Delete role', 'Delete this role template?', 'Delete', true)) { try { await rpc('roleDelete', { id: RE.id }); closeModal(); toast('Role deleted'); await refresh(); } catch (e) { toast(e.message, true); } } };

/* ---------- departments ---------- */
function deptList() {
  return `<div class="card">${rb().departments.map(d => `<div class="item"><div class="mid"><b>${esc(d.name)}</b><div class="sub">${(S.users || []).filter(u => u.dept === d.name).length} staff · organisational label only</div></div>${d.active ? '<span class="bdg green">Active</span>' : '<span class="bdg gray">Inactive</span>'}${can('roles.manage') ? `<button class="btn sm" data-act="deptEdit" data-a="${esc(d.id)}">Edit</button>` : ''}</div>`).join('')}</div>`;
}
ACT.deptNew = () => openModal({ title: 'Add department', body: fld('Name', '<input id="dp-n">'), foot: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="deptSave">Save</button>' });
ACT.deptEdit = id => { const d = rb().departments.find(x => x.id === id); openModal({ title: 'Edit department', body: fld('Name', `<input id="dp-n" value="${esc(d.name)}">`) + `<label class="chk" style="margin-top:10px"><input type="checkbox" id="dp-a" ${d.active ? 'checked' : ''}>Active</label>`, foot: `<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn pri" data-act="deptSave" data-a="${esc(id)}">Save</button>` }); };
ACT.deptSave = async (id, b) => { await doRpc(b, 'deptSave', { id: id || undefined, name: val('dp-n'), active: $('#dp-a') ? $('#dp-a').checked : undefined }, 'Department saved', closeModal); };

/* ---------- audit log ---------- */
function auditShell() {
  const a = SF().audit;
  return `<div class="fb"><div class="fld"><span>Search</span><input id="au-q" value="${esc(a.q)}" placeholder="resource or detail" data-enter="auGo"></div><div class="fld"><span>User</span><input id="au-u" value="${esc(a.user)}" data-enter="auGo"></div><div class="fld"><span>Action</span><select id="au-a"><option value="">All</option></select></div><div class="fld"><span>From</span><input type="date" id="au-f" value="${a.from}"></div><div class="fld"><span>To</span><input type="date" id="au-t" value="${a.to}"></div><button class="btn pri" data-act="auGo">Apply</button></div><div class="card" id="au-list"><div class="cp"><span class="spin dk"></span></div></div>`;
}
async function auditLoad() {
  const a = SF().audit, qs = new URLSearchParams({ q: a.q, user: a.user, action: a.action, from: a.from, to: a.to, offset: a.off });
  try {
    const r = await api('/api/audit?' + qs); const sel = $('#au-a'); if (sel) sel.innerHTML = opts(r.actions, a.action, 'All');
    $('#au-list').innerHTML = `<div class="tw"><table class="t"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Resource</th><th>Details</th></tr></thead><tbody>${r.rows.map(x => `<tr><td class="num">${ftime(x.t)}</td><td>${esc(x.u)}</td><td><span class="tag">${esc(x.a)}</span></td><td>${esc(x.r)}</td><td class="sub mono" style="max-width:340px;word-break:break-all">${esc(Object.keys(x.m || {}).length ? JSON.stringify(x.m).slice(0, 220) : '')}</td></tr>`).join('') || `<tr><td colspan="5">${empty('shield', 'No matching entries', '')}</td></tr>`}</tbody></table></div><div class="row sb cp"><span class="sub">${r.total} entr${r.total === 1 ? 'y' : 'ies'} · read-only</span><span><button class="btn sm" data-act="auPage" data-a="-1" ${a.off ? '' : 'disabled'}>Newer</button> <button class="btn sm" data-act="auPage" data-a="1" ${a.off + 100 < r.total ? '' : 'disabled'}>Older</button></span></div>`;
  } catch (e) { const el = $('#au-list'); if (el) el.innerHTML = `<div class="cp err">${esc(e.message)}</div>`; }
}
ACT.auGo = () => { const a = SF().audit; Object.assign(a, { q: val('au-q'), user: val('au-u'), action: val('au-a'), from: val('au-f'), to: val('au-t'), off: 0 }); auditLoad(); };
ACT.auPage = d => { const a = SF().audit; a.off = Math.max(0, a.off + 100 * +d); auditLoad(); };
