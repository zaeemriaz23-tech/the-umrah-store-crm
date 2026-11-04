'use strict';
/** Small fetch wrapper: JSON in/out, hard timeout, never throws on HTTP errors (returns ok/status/j). */
async function fetchJson(url, opt, ms = 25000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { ...opt, signal: ac.signal }), txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
    return { ok: r.ok, status: r.status, j };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('The service took too long to answer. Please try again.');
    throw new Error('Could not reach the service (' + ((e && e.cause && e.cause.code) || (e && e.message) || 'network error') + ').');
  } finally { clearTimeout(t); }
}
module.exports = { fetchJson };
