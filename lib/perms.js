'use strict';
const MINPW = () => Math.max(6, +(require('./db').db.settings.security || {}).minPassword || 8);
/**
 * Role-based access control.
 *  - Catalog: every module x action that really exists in this CRM.
 *  - Effective permissions of a staff user = (permissions of assigned roles + direct grants) - direct denies.
 *  - The built-in administrator (id 'admin', role 'admin') always has everything.
 *  - Permissions are computed on every request from the stored data, so a change takes effect immediately.
 *  - Missing / malformed permission data = no access (deny by default).
 */
const D = require('./db');
const { db, str, fail, nid } = D;

/* ---------- catalog: [key, label, high-risk?, adminOnly?] grouped by module ---------- */
const MODULES = [
  { id: 'dashboard', name: 'Dashboard', perms: [['dashboard.view', 'View dashboard']] },
  { id: 'bookings', name: 'Bookings', perms: [['bookings.view', 'View'], ['bookings.create', 'Create'], ['bookings.edit', 'Edit'], ['bookings.delete', 'Delete', 1], ['bookings.approve', 'Approve / cancel / reopen', 1], ['bookings.costs', 'See & edit supplier costs, suppliers and profit', 1], ['bookings.override', 'Override duplicate / credit-limit / seat checks', 1]] },
  { id: 'vouchers', name: 'Vouchers', perms: [['vouchers.view', 'View'], ['vouchers.create', 'Generate'], ['vouchers.delete', 'Delete', 1]] },
  { id: 'chat', name: 'Live chat', perms: [['chat.view', 'View and reply to website chats'], ['chat.manage', 'Assign and delete chats', 1]] },
  { id: 'promos', name: 'Promotions & offers', perms: [['promos.view', 'View'], ['promos.edit', 'Create, edit and publish offers']] },
  { id: 'calculator', name: 'Package calculator', perms: [['calculator.view', 'Use calculator']] },
  { id: 'groups', name: 'Group packages', perms: [['groups.view', 'View'], ['groups.create', 'Create / import groups'], ['groups.edit', 'Edit details, prices and seats'], ['groups.delete', 'Remove groups', 1]] },
  { id: 'transport', name: 'Transport booking', perms: [['transport.view', 'Use transport engine']] },
  { id: 'rates', name: 'Rates & inventory (hotels, visa, transport fares)', perms: [['rates.view', 'View'], ['rates.edit', 'Create / edit'], ['rates.delete', 'Delete', 1]] },
  { id: 'search', name: 'Live search', perms: [['search.flights', 'Search flights'], ['search.hotels', 'Search hotels']] },
  { id: 'queries', name: 'Queries & customer records', perms: [['queries.view', 'View'], ['queries.create', 'Create'], ['queries.respond', 'Respond / accept / reject'], ['queries.delete', 'Delete', 1]] },
  { id: 'support', name: 'Help & support tickets', perms: [['support.view', 'View tickets'], ['support.reply', 'Reply, change status, assign'], ['support.delete', 'Delete tickets', 1]] },
  { id: 'agents', name: 'Agent management', perms: [['agents.view', 'View'], ['agents.create', 'Create'], ['agents.edit', 'Edit (incl. credit limit, portal login)', 1], ['agents.delete', 'Delete', 1]] },
  { id: 'suppliers', name: 'Supplier management', perms: [['suppliers.view', 'View'], ['suppliers.create', 'Create'], ['suppliers.edit', 'Edit (incl. portal login)', 1], ['suppliers.delete', 'Delete', 1]] },
  { id: 'customers', name: 'Customers (B2C accounts)', perms: [['customers.view', 'View'], ['customers.create', 'Create'], ['customers.edit', 'Edit']] },
  { id: 'ledgers.agent', name: 'Agent ledgers', perms: [['ledgers.agent.view', 'View balances & ledgers'], ['ledgers.agent.create', 'Post journal entries', 1], ['ledgers.agent.delete', 'Delete journal entries', 1], ['ledgers.agent.export', 'Export', 1]] },
  { id: 'ledgers.supplier', name: 'Supplier ledgers', perms: [['ledgers.supplier.view', 'View balances & ledgers'], ['ledgers.supplier.create', 'Post journal entries', 1], ['ledgers.supplier.delete', 'Delete journal entries', 1], ['ledgers.supplier.export', 'Export', 1]] },
  { id: 'payments', name: 'Payments & receipts', perms: [['payments.view', 'View'], ['payments.create', 'Record payment / create payment link'], ['payments.approve', 'Approve / reject payments', 1], ['payments.delete', 'Delete', 1]] },
  { id: 'expenses', name: 'Expenses', perms: [['expenses.view', 'View'], ['expenses.create', 'Add'], ['expenses.delete', 'Delete', 1]] },
  { id: 'reports', name: 'Reports', perms: [['reports.view', 'View profit & reports'], ['reports.export', 'Export', 1]] },
  { id: 'data', name: 'Data tools', perms: [['data.import', 'Import CSV data', 1], ['data.backup', 'Download full backup', 1]] },
  { id: 'staff', name: 'Staff management', perms: [['staff.view', 'View staff'], ['staff.create', 'Create staff', 1], ['staff.edit', 'Edit / activate / suspend / reset password', 1], ['staff.delete', 'Delete staff', 1]] },
  { id: 'roles', name: 'Roles & departments', perms: [['roles.manage', 'Manage role templates and departments', 1]] },
  { id: 'permissions', name: 'Permissions', perms: [['permissions.manage', 'Assign permissions (only ones you hold)', 1]] },
  { id: 'audit', name: 'Audit log', perms: [['audit.view', 'View audit log']] },
  { id: 'settings', name: 'Settings', perms: [['settings.view', 'Open Settings'], ['settings.general', 'General (public address, timezone)'], ['settings.company', 'Company profile'], ['settings.branding', 'Branding / logo'], ['settings.banking', 'Banking & QR'], ['settings.payments', 'Payment rules (minimum, receipts, methods)'], ['settings.bookings', 'Booking rules & query response times'], ['settings.pricing', 'Pricing (markup, group cost %)'], ['settings.security', 'Security settings', 1, 1]] },
  { id: 'integrations', name: 'API integrations', perms: [['integrations.view', 'View status (keys always masked)'], ['integrations.manage', 'Change keys / PayFast / WhatsApp', 1]] },
  { id: 'assistant', name: 'AI assistant', perms: [['assistant.use', 'Use (adds / removes records)', 1, 1], ['assistant.groups', 'AI assistant for group packages (limited to your own group permissions)', 1]] },
  { id: 'system', name: 'System administration', perms: [['system.admin', 'Full system administration', 1, 1]] }
];
const CATALOG = {}; MODULES.forEach(m => m.perms.forEach(([k, l, risk, ao]) => { CATALOG[k] = { key: k, label: l, module: m.id, risk: !!risk, adminOnly: !!ao }; }));
const ALL = Object.keys(CATALOG);
const ADMIN_ONLY = new Set(ALL.filter(k => CATALOG[k].adminOnly));
const known = k => Object.prototype.hasOwnProperty.call(CATALOG, k);
const clean = arr => [...new Set((Array.isArray(arr) ? arr : []).filter(x => typeof x === 'string' && known(x)))];

const DEPTS = ['Administration', 'Accounts & Finance', 'Operations', 'Reservations', 'Sales', 'Customer Support', 'Visa Processing', 'Transport', 'Hotel Management', 'Agent Management', 'Management'];
const P = (...x) => x;
const BASE = ['dashboard.view', 'calculator.view', 'queries.view'];
const ROLE_SEED = [
  ['Accounts Executive', 'Records payments and views ledgers', [...BASE, 'bookings.view', 'vouchers.view', 'payments.view', 'payments.create', 'ledgers.agent.view', 'ledgers.supplier.view', 'agents.view', 'suppliers.view', 'expenses.view', 'expenses.create', 'reports.view']],
  ['Accounts Manager', 'Accounts plus approvals, journals and exports', [...BASE, 'bookings.view', 'vouchers.view', 'payments.view', 'payments.create', 'payments.approve', 'ledgers.agent.view', 'ledgers.agent.create', 'ledgers.agent.export', 'ledgers.supplier.view', 'ledgers.supplier.create', 'ledgers.supplier.export', 'agents.view', 'suppliers.view', 'expenses.view', 'expenses.create', 'reports.view', 'reports.export', 'bookings.costs']],
  ['Operations Executive', 'Day-to-day booking operations (no financial ledgers)', [...BASE, 'bookings.view', 'bookings.create', 'bookings.edit', 'vouchers.view', 'vouchers.create', 'groups.view', 'transport.view', 'customers.view']],
  ['Operations Manager', 'Operations plus approvals and inventory', [...BASE, 'support.view', 'support.reply', 'bookings.view', 'bookings.create', 'bookings.edit', 'bookings.approve', 'vouchers.view', 'vouchers.create', 'groups.view', 'groups.create', 'groups.edit', 'groups.delete', 'transport.view', 'rates.view', 'rates.edit', 'customers.view', 'customers.create', 'suppliers.view']],
  ['Reservations Executive', 'Reservations, hotel/flight search and vouchers', [...BASE, 'bookings.view', 'bookings.create', 'bookings.edit', 'vouchers.view', 'vouchers.create', 'search.flights', 'search.hotels', 'queries.create', 'queries.respond', 'groups.view', 'customers.view', 'customers.create']],
  ['Sales Executive', 'Sales, queries and customers', [...BASE, 'bookings.view', 'bookings.create', 'groups.view', 'transport.view', 'queries.create', 'queries.respond', 'customers.view', 'customers.create', 'agents.view', 'search.flights', 'search.hotels']],
  ['Customer Support Agent', 'Answers queries and support tickets, views bookings', [...BASE, 'support.view', 'support.reply', 'bookings.view', 'queries.create', 'queries.respond', 'customers.view', 'vouchers.view']],
  ['Visa Processing Executive', 'Visa-related bookings', [...BASE, 'bookings.view', 'bookings.edit', 'vouchers.view']],
  ['Transport Coordinator', 'Transport bookings and fares', [...BASE, 'bookings.view', 'bookings.edit', 'transport.view', 'rates.view', 'rates.edit', 'vouchers.view', 'vouchers.create']],
  ['Hotel Manager', 'Hotel inventory, rates, hotel search', [...BASE, 'bookings.view', 'bookings.edit', 'rates.view', 'rates.edit', 'search.hotels', 'vouchers.view', 'vouchers.create', 'suppliers.view']],
  ['Agent Manager', 'Agent accounts and their bookings', [...BASE, 'support.view', 'support.reply', 'bookings.view', 'agents.view', 'agents.create', 'agents.edit', 'ledgers.agent.view', 'payments.view', 'queries.respond']],
  ['Custom Role', 'Blank template - add exactly what you need', ['dashboard.view']]
];
/* Replicates what the old "staff" role could do, so existing staff keep working after the upgrade. Admin should review it. */
const LEGACY = ['dashboard.view', 'bookings.view', 'bookings.create', 'bookings.edit', 'bookings.costs', 'bookings.override', 'vouchers.view', 'vouchers.create', 'vouchers.delete', 'calculator.view', 'groups.view', 'groups.create', 'groups.edit', 'groups.delete', 'transport.view', 'rates.view', 'rates.edit', 'rates.delete', 'search.flights', 'search.hotels', 'queries.view', 'queries.create', 'queries.respond', 'agents.view', 'suppliers.view', 'customers.view', 'customers.create', 'customers.edit', 'ledgers.agent.view', 'ledgers.agent.export', 'ledgers.supplier.view', 'ledgers.supplier.export', 'payments.view', 'payments.create', 'payments.approve', 'expenses.view', 'expenses.create', 'reports.view', 'reports.export'];

/* ---------- persistence bootstrap (additive, never touches existing data) ---------- */
function init() {
  db.audit = db.audit || [];
  if (!Array.isArray(db.departments)) db.departments = DEPTS.map((n, i) => ({ id: 'd' + (i + 1), name: n, active: true }));
  if (!Array.isArray(db.roles)) {
    try { const src = require('path').join(D.DATA, 'db.json'); if (require('fs').existsSync(src)) require('fs').copyFileSync(src, require('path').join(D.DATA, 'backups', 'pre-rbac-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json')); } catch { /* non-fatal */ }
    db.roles = ROLE_SEED.map(([name, desc, perms], i) => ({ id: 'r' + (i + 1), name, desc, perms: clean(perms), active: true }));
    const legacyStaff = db.users.filter(u => u.role === 'staff');
    const leg = clean(db.settings.staffCanApprove ? [...LEGACY, 'bookings.approve'] : LEGACY);
    db.roles.push({ id: 'r_legacy', name: 'Legacy Staff (migrated)', desc: 'Same access the old "staff" role had. Review and tighten per employee.', perms: leg, active: true });
    legacyStaff.forEach(u => { u.roleIds = ['r_legacy']; });
    db.rbacMigrated = new Date().toISOString();
    audit(null, 'rbac.migrated', 'system', { legacyStaff: legacyStaff.length });
  }
  db.users.forEach(u => { if (u.role === 'staff') { u.roleIds = Array.isArray(u.roleIds) ? u.roleIds : []; u.grants = Array.isArray(u.grants) ? u.grants : []; u.denies = Array.isArray(u.denies) ? u.denies : []; } });
  /* v3.8: "groups.edit" used to cover import, edit and removal. It is now split into create / edit / delete.
     Everyone who could do all of that before keeps exactly the same access (nobody gains or loses anything). */
  if (!db.permsV38) {
    const had = a => Array.isArray(a) && a.includes('groups.edit'), add = (a, ks) => { ks.forEach(k => { if (!a.includes(k)) a.push(k); }); };
    db.roles.forEach(r => { if (had(r.perms)) add(r.perms, ['groups.create', 'groups.delete']); });
    db.users.forEach(u => { if (u.role === 'staff') { if (had(u.grants)) add(u.grants, ['groups.create', 'groups.delete']); if (had(u.denies)) add(u.denies, ['groups.create', 'groups.delete']); } });
    db.roles.forEach(r => { if (Array.isArray(r.perms) && r.perms.includes('queries.view') && !r.perms.includes('chat.view')) r.perms.push('chat.view'); });
    db.permsV38 = new Date().toISOString();
  }
}

/* ---------- audit log (append-only; no operation edits or deletes it) ---------- */
const SECRET = /pass|pw|secret|key|token/i;
function audit(u, action, resource, meta) {
  const m = {};
  Object.keys(meta || {}).forEach(k => { m[k] = SECRET.test(k) ? '[hidden]' : (typeof meta[k] === 'object' ? JSON.parse(JSON.stringify(meta[k])) : meta[k]); });
  db.audit.push({ id: 'a' + nid(), t: new Date().toISOString(), uid: u ? u.id : 'system', u: u ? u.name : 'system', a: action, r: str(resource, 120), m });
  if (db.audit.length > 30000) db.audit.splice(0, db.audit.length - 30000);
}

/* ---------- effective permissions ---------- */
function effective(u) {
  const set = new Set();
  if (!u) return set;
  if (u.role === 'admin') { ALL.forEach(k => set.add(k)); return set; }
  if (u.role !== 'staff') return set;
  (u.roleIds || []).forEach(id => { const r = db.roles.find(x => x.id === id); if (r && r.active !== false) clean(r.perms).forEach(k => set.add(k)); });
  clean(u.grants).forEach(k => set.add(k));
  clean(u.denies).forEach(k => set.delete(k));
  ADMIN_ONLY.forEach(k => set.delete(k)); // never delegable to staff
  return set;
}
function breakdown(u) {
  const fromRoles = {}; (u.roleIds || []).forEach(id => { const r = db.roles.find(x => x.id === id); if (r) clean(r.perms).forEach(k => { (fromRoles[k] = fromRoles[k] || []).push(r.name); }); });
  const eff = effective(u), out = {};
  ALL.forEach(k => { out[k] = { eff: eff.has(k), roles: fromRoles[k] || [], direct: clean(u.grants).includes(k), denied: clean(u.denies).includes(k) }; });
  return out;
}
const can = (u, k) => !!u && (u.role === 'admin' || (u.role === 'staff' && known(k) && effective(u).has(k)));
const canAny = (u, ks) => ks.some(k => can(u, k));
const need = (u, k, m) => { if (!can(u, k)) fail(m || 'You do not have permission to do this', { perm: k, status: 403 }); };
const needAny = (u, ks, m) => { if (!canAny(u, ks)) fail(m || 'You do not have permission to do this', { status: 403 }); };

/* ---------- RPC operation -> required permission(s) (deny by default for staff) ---------- */
const OP = {
  saveBooking: (u, p) => (p.id ? 'bookings.edit' : 'bookings.create'),
  setStatus: (u, p) => (p.status === 'Confirmed' ? 'bookings.approve' : 'bookings.edit'),
  svcConfirm: 'bookings.edit', delBooking: 'bookings.delete',
  makeVoucher: 'vouchers.create', delVoucher: 'vouchers.delete',
  addPayment: 'payments.create', approvePayment: 'payments.approve', rejectPayment: 'payments.approve', delPayment: 'payments.delete',
  createPaylink: 'payments.create', cancelPaylink: 'payments.create',
  addEntry: (u, p) => { const x = db.parties.find(y => y.id == p.partyId); return x && x.kind === 'supplier' ? 'ledgers.supplier.create' : 'ledgers.agent.create'; },
  delEntry: (u, p) => { const e = db.entries.find(y => y.id === p.id), x = e && db.parties.find(y => y.id == e.partyId); return x && x.kind === 'supplier' ? 'ledgers.supplier.delete' : 'ledgers.agent.delete'; },
  addExpense: 'expenses.create', delExpense: 'expenses.delete',
  saveParty: (u, p) => { const k = ['agent', 'supplier', 'customer'].includes(p.kind) ? p.kind : 'agent'; return k + 's.' + (p.id ? 'edit' : 'create'); },
  delParty: (u, p) => { const x = db.parties.find(y => y.id == p.id); return (x ? x.kind : 'agent') + 's.delete'; },
  addQuery: 'queries.create', respondQuery: 'queries.respond', rejectQuery: 'queries.respond', acceptQuery: 'queries.respond', cancelQuery: 'queries.respond', delQuery: 'queries.delete',
  saveGroup: (u, p) => (db.groups.some(g => g.id === String(p.id || (p.group && p.group.id) || '').toUpperCase()) ? 'groups.edit' : 'groups.create'),
  saveGroups: (u, p) => ['groups.create', ...((p.groups || []).some(g => g && db.groups.some(x => x.id === g.id)) ? ['groups.edit'] : [])],
  setSeats: 'groups.edit', delGroup: 'groups.delete', savePromo: 'promos.edit', delPromo: 'promos.edit', testMail: 'integrations.manage',
  saveHotel: 'rates.edit', delHotel: 'rates.delete', saveVisaTiers: 'rates.edit', saveVehicle: 'rates.edit', delVehicle: 'rates.delete', saveRoute: 'rates.edit', delRoute: 'rates.delete', setFare: 'rates.edit', saveCalcSettings: 'rates.edit',
  importData: 'data.import',
  markNotifs: null, openTicket: null, replyTicket: null, setTicketStatus: null, setTicketMeta: null, delTicket: null, // own rules inside lib/extras.js
  logExport: null, changePassword: null, // own password: any signed-in user
  saveSettings: null, setLogo: 'settings.branding', resetLogo: 'settings.branding', // saveSettings is checked field-by-field in ops.js
  saveUser: null, delUser: null // replaced by the staff-management operations below
};
/** Returns the permission list required for a staff-role user to run op, or throws. null = no gate here (op has own rules). */
function gate(u, op, p) {
  if (!u || u.role !== 'staff') return; // admin: full; agent/supplier: governed by role checks inside the ops
  if (!(op in OP) && !op.startsWith('staff') && !op.startsWith('role') && !op.startsWith('dept')) fail('You do not have permission to do this', { status: 403 });
  const r = OP[op]; if (r === null || r === undefined) return;
  [].concat(typeof r === 'function' ? r(u, p) : r).forEach(k => need(u, k));
}

/* ---------- staff management (privilege-escalation safe) ---------- */
const isFull = u => u.role === 'admin';
const subset = (a, b) => [...a].every(x => b.has(x));
function grantable(actor) { const mine = effective(actor); return k => isFull(actor) ? true : (mine.has(k) && !ADMIN_ONLY.has(k)); }
function guardTarget(actor, t, action) {
  if (!t) fail('Staff account not found');
  if (t.role !== 'staff') fail('This account is protected and cannot be managed here', { status: 403 });
  if (t.id === actor.id) fail('You cannot change your own access. Ask an administrator.', { status: 403 });
  if (!isFull(actor) && !subset(effective(t), effective(actor))) fail('This account has more access than you hold, so you cannot manage it.', { status: 403 });
}
const pubUser = u => ({
  id: u.id, name: u.name, login: u.login, role: u.role, dept: u.dept || '', title: u.title || '', roleIds: u.roleIds || [], grants: u.grants || [], denies: u.denies || [],
  active: u.active !== false, suspended: !!u.suspended, lastLogin: u.lastLogin || '', created: u.created || '', pid: u.pid,
  sessions: Object.values(db.sessions).filter(s => s.uid === u.id && s.exp > Date.now()).length
});
function revokeSessions(uid) { Object.keys(db.sessions).forEach(k => { if (db.sessions[k].uid === uid) delete db.sessions[k]; }); }
const validPerms = (actor, arr) => { const g = grantable(actor), c = clean(arr); c.forEach(k => { if (!g(k)) fail('You cannot delegate the permission "' + k + '"', { status: 403 }); }); return c; };
const validRoles = (actor, ids) => (Array.isArray(ids) ? ids : []).map(String).filter(id => db.roles.find(r => r.id === id)).map(id => {
  const r = db.roles.find(x => x.id === id); if (!isFull(actor)) { const g = grantable(actor); clean(r.perms).forEach(k => { if (!g(k)) fail('Role "' + r.name + '" contains permissions you cannot delegate', { status: 403 }); }); } return id;
});
const login = v => str(v, 40).toLowerCase().replace(/[^a-z0-9._-]/g, '');

const STAFF_OPS = {
  staffSave(u, p) {
    const hasPw = String(p.password || '');
    let t;
    if (p.id) { need(u, 'staff.edit'); t = db.users.find(x => x.id === p.id); guardTarget(u, t); }
    else {
      need(u, 'staff.create');
      const lg = login(p.login); if (!lg) fail('Enter a username (letters, numbers, . _ -)');
      if (db.users.find(x => x.login === lg)) fail('This username is already taken');
      if (hasPw.length < MINPW()) fail('Password must be at least ' + MINPW() + ' characters');
      t = { id: 's' + nid(), role: 'staff', login: lg, pw: D.hash(hasPw), roleIds: [], grants: [], denies: [], created: new Date().toISOString(), mustChange: true };
      db.users.push(t); audit(u, 'staff.created', t.login, { id: t.id });
    }
    const before = { dept: t.dept, title: t.title, name: t.name };
    t.name = str(p.name, 80) || t.name || t.login;
    if (p.dept !== undefined) t.dept = str(p.dept, 60);
    if (p.title !== undefined) t.title = str(p.title, 80);
    if (p.id) audit(u, 'staff.updated', t.login, { before, after: { dept: t.dept, title: t.title, name: t.name } });
    return { id: t.id };
  },
  staffSetAccess(u, p) {
    need(u, 'permissions.manage'); const t = db.users.find(x => x.id === p.id); guardTarget(u, t);
    const old = { roles: [...(t.roleIds || [])], grants: [...(t.grants || [])], denies: [...(t.denies || [])] };
    const roleIds = validRoles(u, p.roleIds), grants = validPerms(u, p.grants), denies = clean(p.denies);
    /* a delegate may not remove a permission it cannot itself grant/hold either: denies only apply to perms they hold */
    if (!isFull(u)) { const g = grantable(u); denies.forEach(k => { if (!g(k)) fail('You cannot change "' + k + '"', { status: 403 }); }); }
    t.roleIds = roleIds; t.grants = grants.filter(k => !denies.includes(k)); t.denies = denies;
    audit(u, 'staff.access_changed', t.login, { before: old, after: { roles: t.roleIds, grants: t.grants, denies: t.denies } });
    return {};
  },
  staffSetStatus(u, p) {
    need(u, 'staff.edit'); const t = db.users.find(x => x.id === p.id); guardTarget(u, t);
    const st = p.status; if (!['active', 'suspended', 'inactive'].includes(st)) fail('Bad status');
    t.active = st !== 'inactive'; t.suspended = st === 'suspended';
    if (st !== 'active') revokeSessions(t.id);
    audit(u, 'staff.status_' + st, t.login, {}); return {};
  },
  staffResetPassword(u, p) {
    need(u, 'staff.edit'); const t = db.users.find(x => x.id === p.id); guardTarget(u, t);
    const pw = String(p.password || ''); if (pw.length < MINPW()) fail('Password must be at least ' + MINPW() + ' characters');
    t.pw = D.hash(pw); t.mustChange = true; revokeSessions(t.id);
    audit(u, 'staff.password_reset', t.login, {}); return {};
  },
  staffRevokeSessions(u, p) { need(u, 'staff.edit'); const t = db.users.find(x => x.id === p.id); guardTarget(u, t); revokeSessions(t.id); audit(u, 'staff.sessions_revoked', t.login, {}); return {}; },
  staffDelete(u, p) {
    need(u, 'staff.delete'); const t = db.users.find(x => x.id === p.id); guardTarget(u, t);
    revokeSessions(t.id); db.users = db.users.filter(x => x !== t); audit(u, 'staff.deleted', t.login, {}); return {};
  },
  staffEffective(u, p) {
    needAny(u, ['staff.view', 'permissions.manage']); const t = db.users.find(x => x.id === p.id); if (!t || t.role !== 'staff') fail('Staff account not found');
    return { breakdown: breakdown(t) };
  },
  roleSave(u, p) {
    need(u, 'roles.manage');
    const perms = validPerms(u, p.perms); let r;
    if (p.id) { r = db.roles.find(x => x.id === p.id); if (!r) fail('Role not found'); if (!isFull(u)) { const g = grantable(u); clean(r.perms).forEach(k => { if (!g(k)) fail('This role has permissions you cannot delegate, so you cannot edit it', { status: 403 }); }); } }
    else { r = { id: 'r' + nid(), active: true, perms: [] }; db.roles.push(r); }
    const before = [...r.perms]; r.name = str(p.name, 60) || r.name || 'Role'; r.desc = str(p.desc, 160); r.perms = perms; if (p.active !== undefined) r.active = !!p.active;
    audit(u, p.id ? 'role.updated' : 'role.created', r.name, { before, after: r.perms }); return { id: r.id };
  },
  roleDelete(u, p) {
    need(u, 'roles.manage'); const r = db.roles.find(x => x.id === p.id); if (!r) fail('Role not found');
    if (db.users.some(x => (x.roleIds || []).includes(r.id))) fail('This role is assigned to staff. Remove it from them first, or deactivate the role.');
    db.roles = db.roles.filter(x => x !== r); audit(u, 'role.deleted', r.name, {}); return {};
  },
  deptSave(u, p) {
    need(u, 'roles.manage'); const name = str(p.name, 60); if (!name) fail('Enter a department name');
    let d = p.id ? db.departments.find(x => x.id === p.id) : null;
    if (db.departments.some(x => x.name.toLowerCase() === name.toLowerCase() && x !== d)) fail('Department already exists');
    if (!d) { d = { id: 'd' + nid(), active: true }; db.departments.push(d); }
    const old = d.name; d.name = name; if (p.active !== undefined) d.active = !!p.active;
    if (old && old !== name) db.users.forEach(x => { if (x.dept === old) x.dept = name; });
    audit(u, p.id ? 'dept.updated' : 'dept.created', name, {}); return { id: d.id };
  },
  logExport(u, p) {
    const k = String(p.kind || '');
    const need_ = { report: 'reports.export', bookings: 'reports.export', 'ledger-agent': 'ledgers.agent.export', 'ledger-supplier': 'ledgers.supplier.export' }[k];
    if (!need_) fail('Unknown export'); need(u, need_, 'You do not have permission to export this');
    audit(u, 'export.' + k, str(p.what, 100), { rows: +p.rows || 0 }); return {};
  }
};

module.exports = { MODULES, CATALOG, ALL, ADMIN_ONLY, DEPTS, init, audit, effective, breakdown, can, canAny, need, needAny, gate, STAFF_OPS, pubUser, grantable, clean };
