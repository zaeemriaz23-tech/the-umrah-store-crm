// node scripts/engine-check.js  - unit tests for the pricing engine
const E = require('../public/engine.js'); let bad = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log((ok ? '  PASS  ' : '  FAIL  ') + m + (ok ? '' : '  got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b))); if (!ok) bad++; };
const mk = [{ id: 'm1', name: 'Test Makkah', stars: 4, rooms: [
  { id: 'q', name: 'Quad', occ: 'QUAD', rates: [{ amt: 200 }, { label: 'Peak', start: '2026-09-01', end: '2026-09-30', amt: 300 }] },
  { id: 's', name: 'Bed', occ: 'SHARING', rates: [{ amt: 100 }] }] }];
const md = [{ id: 'd1', name: 'Test Madinah', rooms: [{ id: 'dq', name: 'Quad', occ: 'QUAD', rates: [{ amt: 150 }] }] }];
const tiers = [{ type: 'Visa A', min: 1, max: 5, amt: 400 }, { type: 'Visa A', min: 6, max: null, amt: 300 }];
const base = o => ({ adults: 4, children: 0, infants: 0, visaType: 'Visa A', makkah: { hotelId: 'm1', roomId: 'q', cin: '2026-10-01', cout: '2026-10-11', rooms: 1 }, madinah: { hotelId: 'd1', roomId: 'dq', cin: '2026-10-11', cout: '2026-10-16', rooms: 1 }, extra: [], transports: [], flightPkr: 0, ...o });
const inp = sel => ({ sel, makkah: mk, madinah: md, tiers, rate: 75 });
eq(E.nightsBetween('2026-10-01', '2026-10-11'), 10, 'nights');
eq(E.nightsBetween('2026-10-11', '2026-10-01'), 0, 'reversed range is 0');
eq(E.rateForDate(mk[0].rooms[0], '2026-09-15').amt, 300, 'dated rate wins');
eq(E.rateForDate(mk[0].rooms[0], '2026-10-15').amt, 200, 'standing fallback');
let q = E.priceQuote(inp(base()));
eq(q.makkah.sar, 2000, 'quad room is per ROOM (1 room x 10n x 200), not per traveller');
eq(q.madinah.sar, 750, 'madinah 1 x 5 x 150');
eq(q.lines.find(l => l.kind === 'visa').sar, 1600, 'visa 4 x 400');
eq(q.totalSar, 4350, 'total SAR'); eq(q.totalPkr, 326250, 'total PKR'); eq(q.ok, true, 'quote ok');
q = E.priceQuote(inp(base({ makkah: { hotelId: 'm1', roomId: 's', cin: '2026-10-01', cout: '2026-10-11', rooms: 1 } })));
eq(q.makkah.sar, 4000, 'sharing is per bed: 4 pax x 10n x 100');
q = E.priceQuote(inp(base({ adults: 6 }))); eq(q.issues.some(i => /sleeps 4/.test(i)), true, 'warns when rooms too small');
eq(q.lines.find(l => l.kind === 'visa').unitSar, 300, 'visa tier 6+');
q = E.priceQuote(inp(base({ adults: 2, infants: 1 }))); eq(q.travellers.billable, 2, 'infant not billable'); eq(q.lines.find(l => l.kind === 'visa').qty, 3, 'infant counted for visa');
q = E.priceQuote(inp(base({ madinah: { ...base().madinah, cin: '2026-10-12' } }))); eq(q.issues.some(i => /same day/.test(i)), true, 'sector continuity enforced');
const veh = [{ id: 'v1', name: 'Van', cap: 7, thr: 4, chg: 15 }, { id: 'v2', name: 'Bus', cap: 40 }], pr = [{ rid: 'r1', vid: 'v1', amt: 200 }, { rid: 'r1', vid: 'v2', amt: 600 }], rt = [{ id: 'r1', origin: 'Jeddah Airport', dest: 'Makkah' }];
eq(E.transportQuote(E.routeOptions('r1', veh, pr)[0], 6, false).total, 230, 'transport surcharge 2 extra x 15');
eq(E.transportQuote(E.routeOptions('r1', veh, pr)[0], 6, true).total, 460, 'return doubles');
eq(E.suggestVehicle(E.routeOptions('r1', veh, pr), 12).name, 'Bus', 'suggest vehicle that fits');
q = E.priceQuote({ ...inp(base({ transports: [{ routeId: 'r1', vehicleId: 'v1', roundTrip: true, count: 1 }] })), routes: rt, vehicles: veh, prices: pr });
eq(q.lines.find(l => l.kind === 'transport').sar, 400, 'transport line in quote (4 pax, no surcharge, return)');
eq(E.withMargin(100000, 4, '%', 10), { margin: 10000, total: 110000, per: 27500 }, 'margin %'); eq(E.withMargin(100000, 4, 'PKR', 500).total, 102000, 'margin per head');
eq(E.airLogo('sv'), '/brand/airline/SV.png', 'airline logo url'); eq(E.airLogo('x'), '', 'bad code rejected');
console.log(bad ? '\n' + bad + ' FAILED' : '\nAll engine tests passed'); process.exit(bad ? 1 : 0);
