'use strict';
/** Role-scoped snapshot of the data the browser needs. Agents never receive costs or suppliers. */
const D = require('./db');
const { db, today } = D;
const L = require('./ledger');
const I = require('./integrations');
const Inv = require('./inventory');
const { isStaff } = require('./ops');
const PM = require('./perms');
const X = require('./extras');

function balances() {
  const m = {}; const add = (id, v) => { m[id] = (m[id] || 0) + v; };
  db.parties.forEach(p => { if (p.opening) add(p.id, p.opening); });
  db.bookings.forEach(b => {
    if (b.status === 'Cancelled') return;
    add(b.partyId, L.bookingSell(b));
    b.services.forEach(s => { if (s.supId) add(s.supId, L.lineCost(s)); });
  });
  db.payments.forEach(x => { if (x.status === 'Approved') add(x.partyId, -x.amt); });
  db.entries.forEach(e => { const p = db.parties.find(y => y.id == e.partyId); if (p) add(p.id, p.kind === 'supplier' ? e.cr - e.dr : e.dr - e.cr); });
  return m;
}

const agentBooking = b => {
  const { internal, history, ...r } = b;
  return { ...r, services: b.services.map(({ supId, cost, ...s }) => s), history: (history || []).map(h => ({ t: h.t, u: h.u, a: /^Edited/.test(h.a) ? 'Edited' : /^Supplier/.test(h.a) ? 'Service confirmed' : h.a })) };
};
const supplierBooking = (b, pid) => ({ id: b.id, no: b.no, category: b.category, status: b.status, pax: b.pax, from: b.from, to: b.to, created: b.created, notes: b.notes, services: b.services.filter(s => s.supId == pid).map(({ sell, ...s }) => s) });

function snapshot(u) {
  const S = db.settings, t = today(), staff = !!u && isStaff(u);
  const out = {
    rev: db.rev, today: t, user: u ? { id: u.id, role: u.role, name: u.name, login: u.login, pid: u.pid, mustChange: !!u.mustChange, title: u.title || '', dept: u.dept || '' } : null,
    company: S.company, logoV: S.logoV || 0, categories: S.categories, expenseCats: S.expenseCats, sla: S.sla, prefix: S.prefix
  };
  if (!u) return out;
  out.notifs = X.listFor(u); out.tickets = X.ticketsFor(u); out.fx = X.fxSnapshot(); out.tk = { cats: X.TK_CATS, pri: X.TK_PRI, stat: X.TK_STAT };
  if (staff && PM.can(u, 'support.reply')) out.supportStaff = db.users.filter(x => x.role === 'staff' || x.role === 'admin').map(x => ({ id: x.id, name: x.name }));
  out.groups = db.groups.filter(g => g.dep >= t);
  out.inv = staff ? Inv.snapshot() : Inv.publicSnapshot();
  const liveBank = (S.bank || []).filter(b => b.active !== false);
  out.bank = liveBank; out.payRules = { minAmount: S.payments.minAmount, requireReceipt: S.payments.requireReceipt, requireRef: S.payments.requireRef, methods: S.payments.methods, quickAmounts: S.payments.quickAmounts, instructions: S.payments.instructions, agentCanRecord: S.payments.agentCanRecord, autoApproveUnder: S.payments.autoApproveUnder, publicBankPage: S.payments.publicBankPage };
  out.flags = { payfast: I.pfConfigured(), search: !!I.serpKey(), ai: I.aiReady(), staffCanApprove: S.staffCanApprove, canApprove: u.role === 'admin' || (u.role === 'staff' && S.staffCanApprove), payfastEnv: S.payfast.env };
  const bal = balances();
  if (staff) {
    const can = k => PM.can(u, k), any = (...k) => PM.canAny(u, k);
    out.perms = u.role === 'admin' ? PM.ALL : [...PM.effective(u)];
    if (!can('groups.view')) out.groups = [];
    out.promos = can('promos.view') || can('promos.edit') ? require('./promos').adminList() : [];
    out.flags.aiAccess = u.role === 'admin' || can('assistant.groups');
    out.flags.canApprove = can('bookings.approve');
    const costs = can('bookings.costs');
    const seeKind = {
      agent: any('agents.view', 'ledgers.agent.view', 'bookings.view', 'bookings.create', 'payments.view', 'payments.create', 'queries.view', 'queries.create', 'reports.view'),
      customer: any('customers.view', 'ledgers.agent.view', 'bookings.view', 'bookings.create', 'payments.view', 'payments.create', 'queries.view', 'queries.create', 'reports.view'),
      supplier: any('suppliers.view', 'ledgers.supplier.view', 'bookings.costs', 'payments.view', 'reports.view')
    };
    const ledKind = k => (k === 'supplier' ? can('ledgers.supplier.view') : can('ledgers.agent.view'));
    const manage = k => can((k === 'customer' ? 'customers' : k + 's') + '.edit');
    out.parties = db.parties.filter(p => seeKind[p.kind]).map(p => {
      const o = { id: p.id, kind: p.kind, name: p.name, phone: p.phone, email: p.email, city: p.city, address: p.address, notes: p.notes, active: p.active, created: p.created };
      if (ledKind(p.kind)) { o.bal = bal[p.id] || 0; o.limit = p.limit; o.opening = p.opening; } else if (p.kind === 'agent' && can('agents.edit')) o.limit = p.limit;
      if (can('payments.view')) o.pending = db.payments.filter(x => x.partyId == p.id && x.status === 'Pending').reduce((a, x) => a + x.amt, 0);
      if (manage(p.kind) && p.kind !== 'customer') o.login = (db.users.find(x => x.pid == p.id) || {}).login || '';
      return o;
    });
    const stripCost = b => { const { internal, ...r } = b; return { ...r, services: b.services.map(({ supId, cost, ...x }) => x) }; };
    out.bookings = can('bookings.view') ? (costs ? db.bookings : db.bookings.map(stripCost)) : [];
    out.payments = can('payments.view') ? db.payments : [];
    out.paylinks = can('payments.view') ? db.paylinks : [];
    out.entries = db.entries.filter(e => { const p = db.parties.find(y => y.id == e.partyId); return p && ledKind(p.kind); });
    out.expenses = can('expenses.view') || can('reports.view') ? db.expenses : [];
    out.queries = can('queries.view') ? db.queries : [];
    out.vouchers = any('vouchers.view', 'bookings.view') ? db.vouchers : [];
    out.markupPct = S.markupPct; out.groupCostPct = costs ? S.groupCostPct : undefined;
    out.inv = any('rates.view', 'calculator.view', 'transport.view') ? Inv.snapshot() : Inv.publicSnapshot();
    if (!any('search.flights', 'search.hotels')) out.flags.search = false;
    out.bank = can('settings.banking') ? S.bank : (any('payments.view', 'payments.create', 'ledgers.agent.view') ? liveBank : []);
    if (any('staff.view', 'roles.manage', 'permissions.manage')) {
      out.rbac = { modules: PM.MODULES, roles: db.roles, departments: db.departments, grantable: PM.ALL.filter(PM.grantable(u)) };
      out.users = db.users.filter(x => x.role === 'staff' || x.role === 'admin').map(x => (x.role === 'admin' ? { id: x.id, name: x.name, login: x.login, role: 'admin', active: true, lastLogin: x.lastLogin || '', roleIds: [], grants: [], denies: [], sessions: 0 } : PM.pubUser(x)));
    }
    if (u.role === 'admin') out.users = [...out.users.filter(x => x.role !== 'agent' && x.role !== 'supplier'), ...db.users.filter(x => x.role === 'agent' || x.role === 'supplier').map(x => ({ id: x.id, role: x.role, name: x.name, login: x.login, pid: x.pid }))];
    if (u.role === 'admin' || can('agents.create')) out.appsPending = require('./signup').pendingCount();
    if (can('audit.view') || u.role === 'admin') out.log = db.log.slice(-500).reverse();
    const mask = v => (v ? '********' : '');
    const st = {};
    if (can('settings.company')) st.company = S.company;
    if (can('settings.banking')) st.bank = S.bank;
    if (can('settings.bookings')) Object.assign(st, { categories: S.categories, expenseCats: S.expenseCats, sla: S.sla, prefix: S.prefix });
    if (can('settings.pricing')) Object.assign(st, { markupPct: S.markupPct, groupCostPct: S.groupCostPct });
    if (can('settings.general')) Object.assign(st, { baseUrl: S.baseUrl, tz: S.tz });
    if (can('settings.security')) Object.assign(st, { staffCanApprove: S.staffCanApprove, security: S.security });
    if (can('settings.payments')) st.payments = S.payments;
    if (any('integrations.view', 'integrations.manage')) Object.assign(st, { payfast: { ...S.payfast, securedKey: mask(S.payfast.securedKey) }, serpapiKey: mask(S.serpapiKey), groq: { ...S.groq, apiKey: mask(S.groq.apiKey) }, mail: require('./mailer').publicConfig(), groqModels: I.GROQ_MODELS, envKeys: { serp: !!process.env.SERPAPI_KEY, groq: !!process.env.GROQ_API_KEY } });
    if (Object.keys(st).length || can('settings.view')) out.settings = st;
    if (u.role === 'admin') out.settings = { ...S, payfast: { ...S.payfast, securedKey: mask(S.payfast.securedKey) }, serpapiKey: mask(S.serpapiKey), groq: { ...S.groq, apiKey: mask(S.groq.apiKey) }, mail: require('./mailer').publicConfig(), groqModels: I.GROQ_MODELS, envKeys: { serp: !!process.env.SERPAPI_KEY, groq: !!process.env.GROQ_API_KEY } };
  } else if (u.role === 'agent') {
    const me = db.parties.find(p => p.id == u.pid) || {};
    out.parties = [{ id: me.id, kind: 'agent', name: me.name, phone: me.phone, email: me.email, city: me.city, limit: me.limit, bal: bal[me.id] || 0 }];
    out.wallet = L.wallet(me.id);
    out.bookings = db.bookings.filter(b => b.partyId == u.pid).map(agentBooking);
    out.payments = db.payments.filter(x => x.partyId == u.pid);
    out.queries = db.queries.filter(q => q.partyId == u.pid);
    const mine = new Set(out.bookings.map(b => b.id)); out.vouchers = db.vouchers.filter(v => mine.has(v.bookingId));
    out.markupPct = 0;
  } else if (u.role === 'supplier') {
    const me = db.parties.find(p => p.id == u.pid) || {};
    out.parties = [{ id: me.id, kind: 'supplier', name: me.name, phone: me.phone, bal: bal[me.id] || 0 }];
    out.bookings = db.bookings.filter(b => b.status !== 'Cancelled' && b.services.some(s => s.supId == u.pid)).map(b => supplierBooking(b, u.pid));
    out.payments = db.payments.filter(x => x.partyId == u.pid && x.status === 'Approved');
    out.groups = []; out.inv = null; out.queries = []; out.vouchers = []; out.bank = []; out.payRules = null;
  }
  return out;
}
module.exports = { snapshot, balances };
