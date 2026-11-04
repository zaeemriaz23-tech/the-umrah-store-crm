'use strict';
/** Promotions: image banners, special offers, hotel deals and complete Umrah packages. Managed by staff, shown on the public site. */
const fs = require('fs');
const path = require('path');
const D = require('./db');
const { db, DATA, fail, str, num, isoDate, today, nid } = D;

const DIR = path.join(DATA, 'promos'); fs.mkdirSync(DIR, { recursive: true });
db.promos = db.promos || [];
const TYPES = { banner: 'Banner', offer: 'Special offer', hotel: 'Hotel deal', package: 'Umrah package' };
const EXT = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const sniff = b => (b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b[0] === 0x89 && b[1] === 0x50 ? 'png' : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'webp' : '');
const safeUrl = u => { u = String(u || '').trim().slice(0, 300); return /^(https?:\/\/|\/(?!\/)|#|tel:|mailto:)/i.test(u) ? u : ''; };

function saveImage(id, dataUrl) {
  const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || '')); if (!m) fail('Upload a JPG, PNG or WebP image');
  const b = Buffer.from(m[1], 'base64'); if (b.length > 3 * 1024 * 1024) fail('The image is larger than 3 MB');
  const ext = sniff(b); if (!ext) fail('That file is not a valid JPG, PNG or WebP image');
  fs.readdirSync(DIR).filter(f => f.startsWith(id + '.') || f.startsWith(id + '-')).forEach(f => fs.unlinkSync(path.join(DIR, f)));
  const name = id + '-' + Date.now().toString(36) + '.' + ext; fs.writeFileSync(path.join(DIR, name), b); return '/promo-img/' + name;
}
function dropImage(img) { const f = path.basename(String(img || '')); if (f && fs.existsSync(path.join(DIR, f))) fs.unlinkSync(path.join(DIR, f)); }

function save(p) {
  const prev = p.id ? db.promos.find(x => x.id === p.id) : null; if (p.id && !prev) fail('Promotion not found');
  const type = TYPES[p.type] ? p.type : 'offer', title = str(p.title, 90); if (title.length < 3) fail('Give the promotion a title');
  const s = isoDate(p.startsAt), e = isoDate(p.endsAt); if (s && e && e < s) fail('The end date is before the start date');
  const o = { id: prev ? prev.id : 'pr' + nid(), type, title, subtitle: str(p.subtitle, 140), desc: str(p.desc, 600), badge: str(p.badge, 24), price: num(p.price), oldPrice: num(p.oldPrice), unit: str(p.unit, 30) || (type === 'hotel' ? 'per night' : type === 'package' ? 'per person' : ''),
    ctaText: str(p.ctaText, 30) || 'Enquire now', ctaUrl: safeUrl(p.ctaUrl), startsAt: s, endsAt: e, active: p.active !== false, featured: !!p.featured, order: Math.min(999, num(p.order) || 100),
    details: (Array.isArray(p.details) ? p.details : String(p.details || '').split('\n')).map(x => str(x, 90)).filter(Boolean).slice(0, 8), image: prev ? prev.image : '', createdAt: prev ? prev.createdAt : new Date().toISOString() };
  if (o.oldPrice && o.price && o.oldPrice <= o.price) o.oldPrice = 0;
  if (p.image && String(p.image).startsWith('data:')) { if (prev && prev.image) dropImage(prev.image); o.image = saveImage(o.id, p.image); }
  else if (p.removeImage && prev) { dropImage(prev.image); o.image = ''; }
  db.promos = db.promos.filter(x => x.id !== o.id); db.promos.push(o); return o;
}
function remove(id) { const x = db.promos.find(p => p.id === id); if (!x) fail('Promotion not found'); dropImage(x.image); db.promos = db.promos.filter(p => p !== x); return x; }
const live = (p, t = today()) => p.active && (!p.startsAt || p.startsAt <= t) && (!p.endsAt || p.endsAt >= t);
const pub = p => ({ id: p.id, type: p.type, typeLabel: TYPES[p.type], title: p.title, subtitle: p.subtitle, desc: p.desc, badge: p.badge, price: p.price, oldPrice: p.oldPrice, unit: p.unit, ctaText: p.ctaText, ctaUrl: p.ctaUrl, endsAt: p.endsAt, featured: p.featured, details: p.details, image: p.image });
const sorted = a => a.sort((x, y) => (y.featured - x.featured) || (x.order - y.order) || (x.createdAt < y.createdAt ? 1 : -1));
const publicList = () => sorted(db.promos.filter(p => live(p))).map(pub);
const adminList = () => sorted(db.promos.slice()).map(p => ({ ...p, live: live(p) }));
module.exports = { TYPES, EXT, DIR, save, remove, publicList, adminList, live };
