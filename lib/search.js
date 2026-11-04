'use strict';
/**
 * Live flights and hotels through SerpApi (Google Flights / Google Hotels).
 *  - The cache holds RAW results (supplier price in `base`). Markup, cost visibility and provider names are applied per request in `forUser`,
 *    so one user's view can never leak into another's (agents never receive `base`, staff always do).
 *  - Round trips are a two-step search: outbound options first, then the return options for the chosen outbound (`flightReturn`).
 *  - Hotels: pagination (`next`), multi-room estimate, property details with room rates (`hotelDetail`).
 */
const D = require('./db');
const { db } = D;
const { fetchJson } = require('./http');

const cache = new Map(), hits = new Map();
const LIMIT_PER_HOUR = 60;
const serpKey = () => process.env.SERPAPI_KEY || db.settings.serpapiKey || '';
const endpoint = () => process.env.SERPAPI_BASE_URL || 'https://serpapi.com/search.json';
const markup = n => Math.round((+n || 0) * (1 + (db.settings.markupPct || 0) / 100));
const int = (v, d, mn, mx) => Math.min(mx, Math.max(mn, parseInt(v, 10) || d));
const ISO = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const csv = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);

const friendly = m => {
  m = String(m || '');
  if (/invalid api key/i.test(m)) return 'The live-search key was rejected. Ask the administrator to check the SerpApi key in Settings > Integrations.';
  if (/run out of searches|out of searches|plan.*(limit|exceeded)/i.test(m)) return 'The live-search plan has no searches left this month. Ask the administrator to top it up.';
  return m;
};

async function call(P, user, ttl = 6e5) {
  const key = serpKey(); if (!key) return null;
  const ck = JSON.stringify(P), c = cache.get(ck);
  if (c && Date.now() - c.t < ttl) return c.v;
  const h = (hits.get(user.id) || []).filter(x => Date.now() - x < 36e5);
  if (h.length >= LIMIT_PER_HOUR) throw new Error('Search limit reached (' + LIMIT_PER_HOUR + ' live searches per hour). Please try again later.');
  const u = new URL(endpoint());
  Object.entries({ ...P, api_key: key }).forEach(([a, b]) => { if (b != null && b !== '') u.searchParams.set(a, b); });
  const r = await fetchJson(u.toString(), undefined, 40000);
  hits.set(user.id, [...h, Date.now()]);
  if (r.j && r.j.error && !/hasn't returned any results|no results|fully empty/i.test(String(r.j.error))) throw new Error(friendly(r.j.error));
  if (!r.ok && !(r.j && r.j.search_metadata)) throw new Error('The search service answered with an error (' + r.status + '). Please try again.');
  cache.set(ck, { t: Date.now(), v: r.j }); if (cache.size > 300) cache.delete(cache.keys().next().value);
  return r.j;
}

/* ---------------------------------------------------------------- flights ---------------------------------------------------------------- */
function flightParams(q) {
  const ret = ISO(q.ret), ad = int(q.adults, 1, 1, 9), ch = int(q.children, 0, 0, 8), inf = int(q.infants, 0, 0, 4);
  return { engine: 'google_flights', departure_id: String(q.from).toUpperCase(), arrival_id: String(q.to).toUpperCase(), outbound_date: ISO(q.date), return_date: ret || undefined, type: ret ? 1 : 2, adults: ad, children: ch || undefined, infants_in_seat: inf || undefined,
    travel_class: ['1', '2', '3', '4'].includes(String(q.cls)) ? q.cls : undefined, stops: q.direct === '1' || q.direct === true ? 1 : undefined, bags: int(q.bags, 0, 0, 5) || undefined, currency: 'PKR', hl: 'en', gl: 'pk' };
}
function mapFlight(f, best) {
  const a = f.flights[0], z = f.flights[f.flights.length - 1], lay = f.layovers || [];
  return { best: !!best, token: f.departure_token || '', bookingToken: f.booking_token || '', airline: a.airline, logo: f.airline_logo || a.airline_logo || '', airlines: [...new Set(f.flights.map(x => x.airline))], nos: f.flights.map(x => (x.flight_number || '').trim()).filter(Boolean),
    from: a.departure_airport.id, fromName: a.departure_airport.name || '', to: z.arrival_airport.id, toName: z.arrival_airport.name || '', dep: a.departure_airport.time, arr: z.arrival_airport.time, dur: f.total_duration, stops: f.flights.length - 1, via: lay.map(l => l.id).join(', '), cls: a.travel_class || '', plane: a.airplane || '',
    co2: f.carbon_emissions && f.carbon_emissions.this_flight ? Math.round(f.carbon_emissions.this_flight / 1000) : 0, co2diff: f.carbon_emissions ? f.carbon_emissions.difference_percent : 0, ext: (f.extensions || []).slice(0, 4), overnight: f.flights.some(x => x.overnight),
    lay: lay.map(l => ({ id: l.id, name: l.name || '', dur: l.duration, night: !!l.overnight })),
    segs: f.flights.map(x => ({ no: (x.flight_number || '').trim(), from: x.departure_airport.id, fromName: x.departure_airport.name || '', to: x.arrival_airport.id, toName: x.arrival_airport.name || '', dep: x.departure_airport.time, arr: x.arrival_airport.time, air: x.airline, logo: x.airline_logo || '', dur: x.duration, plane: x.airplane || '', legroom: x.legroom || '', delayed: !!x.often_delayed_by_over_30_min, night: !!x.overnight })),
    base: f.price };
}
const flightItems = j => [...(j.best_flights || []).map(f => [f, true]), ...(j.other_flights || []).map(f => [f, false])].filter(([f]) => f.price && f.flights && f.flights.length).map(([f, b]) => mapFlight(f, b)).slice(0, 80);

async function flights(q, user) {
  if (!serpKey()) return { configured: false };
  const j = await call(flightParams(q), user);
  const pi = j.price_insights;
  return { configured: true, kind: 'flights', round: !!ISO(q.ret), items: flightItems(j), insight: pi ? { lowest: pi.lowest_price || 0, level: pi.price_level || '', typical: pi.typical_price_range || [] } : null };
}
/** step 2 of a round trip: return options for the chosen outbound (price = total for the whole trip) */
async function flightReturn(q, user) {
  if (!serpKey()) return { configured: false };
  if (!q.token) throw new Error('Choose an outbound flight first');
  if (!ISO(q.ret)) throw new Error('A return date is needed to see return flights');
  const j = await call({ ...flightParams(q), departure_token: String(q.token).slice(0, 2000) }, user);
  return { configured: true, kind: 'flights-return', round: true, items: flightItems(j) };
}

/* ---------------------------------------------------------------- hotels ---------------------------------------------------------------- */
const mins = s => { const t = String(s || ''), h = /(\d+)\s*h/i.exec(t), m = /(\d+)\s*min/i.exec(t); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); };
const HOLY = /haram|nabawi|nabawī|prophet|kaaba|kaabah|grand mosque/i;
function holyDistance(near) {
  const n = (near || []).find(x => HOLY.test(x.name || ''));
  if (!n) return null;
  const t = (n.transportations || [])[0] || {};
  return { name: n.name, mode: t.type || '', mins: mins(t.duration) || 0, text: t.duration || '' };
}
const hotelParams = (q, rooms) => {
  const ad = int(q.adults, 2, 1, 16), ch = int(q.children, 0, 0, 12), r = int(q.rooms, 1, 1, 8), perAd = Math.max(1, Math.ceil(ad / r)), perCh = Math.ceil(ch / r);
  rooms.n = r;
  return { engine: 'google_hotels', q: String(q.city || 'Makkah').slice(0, 120), check_in_date: ISO(q.cin), check_out_date: ISO(q.cout), adults: Math.min(perAd, 8), children: perCh || undefined,
    children_ages: perCh ? (String(q.ages || '').split(',').filter(Boolean).slice(0, perCh).join(',') || Array(perCh).fill(8).join(',')) : undefined,
    hotel_class: csv(q.stars).filter(x => /^[2-5]$/.test(x)).join(',') || undefined, sort_by: ['3', '8', '13'].includes(String(q.sort)) ? q.sort : undefined, rating: ['7', '8', '9'].includes(String(q.rating)) ? q.rating : undefined,
    free_cancellation: q.free === '1' || q.free === true ? 'true' : undefined, min_price: int(q.minp, 0, 0, 1e7) || undefined, max_price: int(q.maxp, 0, 0, 1e7) || undefined, next_page_token: q.page ? String(q.page).slice(0, 600) : undefined, currency: 'PKR', hl: 'en', gl: 'pk' };
};
function mapHotel(h) {
  const base = (h.rate_per_night && h.rate_per_night.extracted_lowest) || 0, tot = h.total_rate && h.total_rate.extracted_lowest;
  const imgs = (h.images || []).map(i => i.thumbnail || i.original_image).filter(Boolean).slice(0, 8);
  return { token: h.property_token || '', name: h.name, type: h.type || 'hotel', img: imgs[0] || '', imgs, stars: h.extracted_hotel_class || 0, rating: h.overall_rating || 0, reviews: h.reviews || 0, desc: h.description || '', amenities: (h.amenities || []).slice(0, 14), cin: h.check_in_time || '', cout: h.check_out_time || '',
    near: (h.nearby_places || []).slice(0, 4).map(n => ({ name: n.name, t: n.transportations && n.transportations[0] ? n.transportations[0].type + ' ' + n.transportations[0].duration : '' })), holy: holyDistance(h.nearby_places),
    free: /free cancellation/i.test(JSON.stringify(h.extensions || []) + (h.deal_description || '')), eco: !!h.eco_certified, gps: h.gps_coordinates ? [h.gps_coordinates.latitude, h.gps_coordinates.longitude] : null,
    base, baseTotal: tot || 0, deal: h.deal || '', link: h.link || '' };
}
async function hotels(q, user) {
  if (!serpKey()) return { configured: false };
  const rooms = {}, j = await call(hotelParams(q, rooms), user);
  const pg = j.serpapi_pagination || {};
  return { configured: true, kind: 'hotels', rooms: rooms.n, items: (j.properties || []).map(mapHotel).filter(x => x.base), next: pg.next_page_token || '' };
}
/** property page: description, photos, amenities and the rates per room type */
async function hotelDetail(q, user) {
  if (!serpKey()) return { configured: false };
  if (!q.token) throw new Error('Choose a hotel first');
  const rooms = {}, P = hotelParams({ ...q, page: '' }, rooms);
  const j = await call({ ...P, property_token: String(q.token).slice(0, 600), next_page_token: undefined, sort_by: undefined, hotel_class: undefined, rating: undefined, free_cancellation: undefined, min_price: undefined, max_price: undefined }, user, 18e5);
  const money = o => (o && o.extracted_lowest) || 0;
  const offers = [...(j.featured_prices || []).map(o => ({ ...o, _f: true })), ...(j.prices || [])].map(o => ({
    source: o.source || '', official: !!o.official, featured: !!o._f, base: money(o.rate_per_night), baseTotal: money(o.total_rate), link: o.link || '',
    rooms: (o.rooms || []).map(r => ({ name: r.name || '', guests: r.num_guests || 0, img: ((r.images || [])[0]) || '', base: money(r.rate_per_night), baseTotal: money(r.total_rate) })).filter(r => r.name || r.base).slice(0, 8) })).filter(o => o.base || o.rooms.length).slice(0, 8);
  const near = (j.nearby_places || []).slice(0, 8).map(n => ({ name: n.name, t: n.transportations && n.transportations[0] ? n.transportations[0].type + ' ' + n.transportations[0].duration : '' }));
  return { configured: true, kind: 'hotel-detail', rooms: rooms.n, name: j.name || '', type: j.type || '', address: j.address || '', phone: j.phone || '', desc: j.description || '', stars: j.extracted_hotel_class || 0, rating: j.overall_rating || 0, reviews: j.reviews || 0,
    cin: j.check_in_time || '', cout: j.check_out_time || '', imgs: (j.images || []).map(i => i.thumbnail || i.original_image).filter(Boolean).slice(0, 12), amenities: (j.amenities || []).slice(0, 30), near, holy: holyDistance(j.nearby_places),
    ratings: (j.ratings || []).map(r => ({ stars: r.stars, count: r.count })).slice(0, 5), essential: (j.essential_info || []).slice(0, 6), offers };
}

/* ---------------------------------------------------------------- per-user view ---------------------------------------------------------------- */
const withPrice = (o, staff, keys) => { const r = { ...o }; keys.forEach(([b, p]) => { if (r[b] !== undefined) r[p] = markup(r[b]); }); if (!staff) { delete r.base; delete r.baseTotal; delete r.link; } return r; };
/** applies markup and hides supplier-side data. Never mutates the cached object. */
function forUser(res, user) {
  const staff = user.role === 'admin' || user.role === 'staff', out = { ...res, staff, markup: db.settings.markupPct || 0 };
  if (res.insight) out.insight = { ...res.insight, lowest: markup(res.insight.lowest), typical: (res.insight.typical || []).map(markup) };
  if (res.items) out.items = res.items.map(i => withPrice(i, staff, [['base', 'price'], ['baseTotal', 'total']]));
  if (res.kind === 'hotel-detail') out.offers = res.offers.map((o, n) => { const r = withPrice(o, staff, [['base', 'price'], ['baseTotal', 'total']]); r.rooms = o.rooms.map(x => withPrice(x, staff, [['base', 'price'], ['baseTotal', 'total']])); if (!staff) { r.source = o.official ? 'Hotel direct' : 'Rate option ' + (n + 1); } return r; });
  return out;
}

module.exports = { serpKey, flights, flightReturn, hotels, hotelDetail, forUser, markup };
