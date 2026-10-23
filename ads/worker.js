/* RATEL RAGE — rr-ads Worker: the billboard ad system (see docs/ADS.md).
 *
 * Public (advertisers):
 *   GET  /                    every board, its size, price and when it is free
 *   GET  /b/:board            one board: details, template, artwork upload + in-game preview, booking form
 *   GET  /status/:token       the advertiser's private page: review/payment state, dates, views and taps
 *   POST /api/bookings        a booking with its artwork (JSON, artwork as a data URL)
 *   POST /api/pay/:token      Paystack checkout for a booking (only when PAYSTACK_SECRET is set)
 *   POST /api/paystack        Paystack webhook (signature-checked) -> booking paid
 * Game:
 *   GET  /api/slots?level=1   what each board shows right now (cached 60 s, CORS *)
 *   GET  /c/:booking          the artwork (live ones for anyone; others to the owner's token or admin)
 *   POST /api/e               view/tap counts from the game (origin-checked, fire-and-forget)
 * Owner:
 *   GET  /admin               review queue, approve/reject, mark paid, prices, numbers (HTTP Basic, ADMIN_PASSWORD)
 *   /api/admin/...            the same, as JSON
 *
 * A board shows an advert only when its booking is APPROVED and PAID and today
 * is inside its dates. Everything else shows the game's own house art. */
import { BOARDS, boardById, uploadSize, ART_SCALE, SAFE_MARGIN } from './boards.js';
import { landingPage, boardPage, statusPage, adminPage } from './pages.js';

const DAY = 86400000;
const MAX_ART_B64 = 1_600_000;       // ~1.2 MB of image; D1 rows top out at 2 MB
const MAX_OPEN_PER_BOARD = 25;       // bookings waiting for review per board (spam brake)
const LAGOS_MS = 3600000;            // WAT, UTC+1, no DST: "today" is Lagos's today

const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
const html = (body, status = 200) => new Response(body, { status, headers: {
  'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://api.paystack.co; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' } });
const CORS = { 'Access-Control-Allow-Origin': '*' };

export const today = (now = Date.now()) => new Date(now + LAGOS_MS).toISOString().slice(0, 10);
export function addMonths(day, months) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
const validDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'))
  && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const overlaps = (a, b) => a.start_day < b.end_day && b.start_day < a.end_day;
const rid = (n = 16) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

function originAllowed(origin, env) {
  if (!origin) return false;
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.some((pat) => {
    if (!pat.includes('*')) return pat === origin;
    const [pre, post] = pat.split('*');
    return origin.startsWith(pre) && origin.endsWith(post) && origin.length > pre.length + post.length
      && !origin.slice(pre.length, origin.length - post.length).includes('/');
  });
}

async function sha(s) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
async function isAdmin(req, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Basic ')) return false;
  let pass = '';
  try { pass = atob(h.slice(6)).split(':').slice(1).join(':'); } catch { return false; }
  const [a, b] = await Promise.all([sha(pass), sha(env.ADMIN_PASSWORD)]);
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
const askAuth = (env) => new Response(env.ADMIN_PASSWORD ? 'Password required.' : 'Admin not configured: set the ADMIN_PASSWORD secret.', {
  status: env.ADMIN_PASSWORD ? 401 : 503, headers: { 'WWW-Authenticate': 'Basic realm="Ratel Rage ads", charset="UTF-8"', 'Cache-Control': 'no-store' } });

// ---- the image: magic bytes and pixel size, read straight from the file header
function b64bytes(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
export function imageInfo(u) {
  if (u.length > 24 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) {
    const w = (u[16] << 24 | u[17] << 16 | u[18] << 8 | u[19]) >>> 0, h = (u[20] << 24 | u[21] << 16 | u[22] << 8 | u[23]) >>> 0;
    return { mime: 'image/png', w, h };
  }
  if (u.length > 4 && u[0] === 0xff && u[1] === 0xd8) {
    let i = 2;
    while (i + 9 < u.length) {
      if (u[i] !== 0xff) { i++; continue; }
      const m = u[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = u[i + 2] << 8 | u[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { mime: 'image/jpeg', h: u[i + 5] << 8 | u[i + 6], w: u[i + 7] << 8 | u[i + 8] };
      i += 2 + len;
    }
  }
  return null;
}

// ---- boards and what is live
async function boardRows(env) {
  const rows = (await env.DB.prepare('SELECT id, price, bookable FROM boards').all()).results || [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const missing = BOARDS.filter((b) => !byId.has(b.id));
  if (missing.length) {
    await env.DB.batch(missing.map((b) => env.DB.prepare('INSERT OR IGNORE INTO boards (id, price, bookable) VALUES (?, ?, ?)').bind(b.id, b.price, b.bookable)));
    for (const b of missing) byId.set(b.id, { id: b.id, price: b.price, bookable: b.bookable });
  }
  return BOARDS.map((b) => ({ ...b, price: byId.get(b.id).price, bookable: !!byId.get(b.id).bookable, upload: uploadSize(b) }));
}
async function liveBookings(env, day = today()) {
  return (await env.DB.prepare(`SELECT id, slot, brand, link, start_day, end_day FROM bookings
    WHERE status = 'approved' AND paid = 1 AND start_day <= ? AND end_day > ? ORDER BY start_day`).bind(day, day).all()).results || [];
}
async function boardsPublic(env) {
  const day = today();
  const boards = await boardRows(env);
  const taken = (await env.DB.prepare(`SELECT slot, start_day, end_day FROM bookings WHERE status = 'approved' AND end_day > ? ORDER BY start_day`).bind(day).all()).results || [];
  const since = today(Date.now() - 30 * DAY);
  const views = (await env.DB.prepare('SELECT slot, SUM(views) v, SUM(taps) t FROM ad_stats WHERE day >= ? GROUP BY slot').bind(since).all()).results || [];
  const vMap = new Map(views.map((r) => [r.slot, r]));
  return boards.map((b) => ({
    id: b.id, level: b.level, name: b.name, where: b.where, art: b.art, artW: b.artW, artH: b.artH,
    face: b.face, upload: b.upload, safe: SAFE_MARGIN, price: b.price, bookable: b.bookable,
    taken: taken.filter((t) => t.slot === b.id).map((t) => ({ start: t.start_day, end: t.end_day })),
    views30: vMap.get(b.id)?.v || 0,
  }));
}

// ---- bookings
async function createBooking(req, env) {
  let body;
  try { const t = await req.text(); if (t.length > MAX_ART_B64 + 8000) return json({ error: 'The artwork is too large (1.2 MB at most).' }, 413); body = JSON.parse(t); }
  catch { return json({ error: 'Could not read the form.' }, 400); }
  if (body.website) return json({ ok: true, id: 'x', token: 'x' });          // honeypot: a bot filled the hidden field
  const b = boardById(str(body.slot, 20));
  if (!b) return json({ error: 'Unknown board.' }, 400);
  const board = (await boardRows(env)).find((x) => x.id === b.id);
  if (!board.bookable) return json({ error: 'This board is not open for booking.' }, 409);
  const f = {
    business: str(body.business, 80), brand: str(body.brand, 30), name: str(body.name, 80),
    email: str(body.email, 120), phone: str(body.phone, 30), link: str(body.link, 300), note: str(body.note, 600),
  };
  if (!f.business || !f.brand || !f.name) return json({ error: 'Business, brand and contact name are required.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return json({ error: 'Please give a valid email address.' }, 400);
  if (f.link && !/^https?:\/\/[^\s<>"']+\.[^\s<>"']+$/i.test(f.link)) return json({ error: 'The link must start with https:// (or leave it empty).' }, 400);
  const months = Math.round(Number(body.months));
  if (!(months >= 1 && months <= 12)) return json({ error: 'Choose 1 to 12 months.' }, 400);
  const start = str(body.start, 10);
  if (!validDay(start)) return json({ error: 'Choose a start date.' }, 400);
  if (start < today()) return json({ error: 'The start date is in the past.' }, 400);
  if (start > addMonths(today(), 12)) return json({ error: 'Bookings open up to a year ahead.' }, 400);
  const end = addMonths(start, months);
  const clash = (await env.DB.prepare(`SELECT start_day, end_day FROM bookings WHERE slot = ? AND status = 'approved'`).bind(b.id).all()).results || [];
  if (clash.some((c) => overlaps(c, { start_day: start, end_day: end }))) return json({ error: 'Those dates are already booked on this board. See the dates shown as taken.' }, 409);
  const open = await env.DB.prepare(`SELECT COUNT(*) n FROM bookings WHERE slot = ? AND status = 'review'`).bind(b.id).first();
  if ((open?.n || 0) >= MAX_OPEN_PER_BOARD) return json({ error: 'This board has too many bookings waiting for review. Please try again later.' }, 429);

  const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(typeof body.art === 'string' ? body.art : '');
  if (!m) return json({ error: 'Attach the artwork as a PNG or JPEG.' }, 400);
  if (m[2].length > MAX_ART_B64) return json({ error: 'The artwork is too large (1.2 MB at most).' }, 413);
  let info;
  try { info = imageInfo(b64bytes(m[2])); } catch { info = null; }
  if (!info || info.mime !== m[1]) return json({ error: 'The artwork file is not a valid PNG or JPEG.' }, 400);
  const want = uploadSize(b);
  const aspect = (info.w / info.h) / (want.w / want.h);
  if (aspect < 0.97 || aspect > 1.03) return json({ error: `The artwork must have the board's shape: ${want.w} x ${want.h} px (yours is ${info.w} x ${info.h}).` }, 400);
  if (info.w < b.face.w) return json({ error: `The artwork is too small: at least ${b.face.w} px wide, ideally ${want.w}.` }, 400);

  const id = 'rr' + rid(8), token = rid(18), now = Date.now();
  const amount = board.price * months;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO bookings (id, token, slot, business, brand, name, email, phone, link, note, start_day, end_day, months, amount, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, token, b.id, f.business, f.brand, f.name, f.email, f.phone, f.link, f.note, start, end, months, amount, now, now),
    env.DB.prepare('INSERT INTO creatives (booking, mime, w, h, data) VALUES (?, ?, ?, ?, ?)').bind(id, info.mime, info.w, info.h, m[2]),
  ]);
  return json({ ok: true, id, token, status: `/status/${token}`, amount, end, pay: env.PAYSTACK_SECRET ? `/api/pay/${token}` : null });
}

async function bookingByToken(env, token) {
  if (!/^[0-9a-f]{36}$/.test(token || '')) return null;
  return env.DB.prepare('SELECT * FROM bookings WHERE token = ?').bind(token).first();
}
async function bookingStats(env, id) {
  const rows = (await env.DB.prepare('SELECT day, views, taps FROM ad_stats WHERE booking = ? ORDER BY day').bind(id).all()).results || [];
  return { days: rows, views: rows.reduce((a, r) => a + r.views, 0), taps: rows.reduce((a, r) => a + r.taps, 0) };
}
const publicBooking = (r) => ({ id: r.id, slot: r.slot, business: r.business, brand: r.brand, link: r.link,
  start: r.start_day, end: r.end_day, months: r.months, amount: r.amount, status: r.status, paid: !!r.paid, reason: r.reason });

// ---- payments (Paystack): amounts are in kobo
async function payInit(req, env, token) {
  if (!env.PAYSTACK_SECRET) return json({ error: 'Online payment is not set up yet. We will send you an invoice.' }, 503);
  const r = await bookingByToken(env, token);
  if (!r) return json({ error: 'Unknown booking.' }, 404);
  if (r.paid) return json({ error: 'This booking is already paid.' }, 409);
  if (r.status === 'rejected' || r.status === 'cancelled') return json({ error: 'This booking is closed.' }, 409);
  const origin = new URL(req.url).origin;
  const res = await fetch('https://api.paystack.co/transaction/initialize', { method: 'POST',
    headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: r.email, amount: r.amount * 100, currency: env.CURRENCY || 'NGN', reference: r.id,
      callback_url: `${origin}/status/${r.token}`, metadata: { slot: r.slot, brand: r.brand } }) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out?.data?.authorization_url) return json({ error: 'The payment page could not be opened. Please try again.' }, 502);
  return json({ url: out.data.authorization_url });
}
async function hmac512hex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
  return [...sig].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function payWebhook(req, env) {
  if (!env.PAYSTACK_SECRET) return new Response(null, { status: 404 });
  const raw = await req.text();
  const sig = req.headers.get('x-paystack-signature') || '';
  const want = await hmac512hex(env.PAYSTACK_SECRET, raw);
  if (sig.length !== want.length) return new Response(null, { status: 401 });
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return new Response(null, { status: 401 });
  let ev; try { ev = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  if (ev?.event === 'charge.success' && ev.data?.reference) {
    const r = await env.DB.prepare('SELECT id, amount FROM bookings WHERE id = ?').bind(String(ev.data.reference)).first();
    // the full amount, in naira, or it stays unpaid for the owner to look at
    if (r && Number(ev.data.amount) >= r.amount * 100) {
      await env.DB.prepare('UPDATE bookings SET paid = 1, pay_ref = ?, updated = ? WHERE id = ?').bind(String(ev.data.id || ev.data.reference).slice(0, 60), Date.now(), r.id).run();
    }
  }
  return new Response(null, { status: 200 });
}

// ---- the game's view/tap counts
async function ingest(req, env) {
  const nothing = new Response(null, { status: 204, headers: CORS });
  if (!originAllowed(req.headers.get('Origin'), env)) return nothing;
  let body;
  try { const t = await req.text(); if (t.length > 16384) return nothing; body = JSON.parse(t); } catch { return nothing; }
  if (!body || !Array.isArray(body.items)) return nothing;
  const day = today();
  const known = new Set(BOARDS.map((b) => b.id));
  const sum = new Map();
  for (const it of body.items.slice(0, 60)) {
    if (!it || !known.has(it.slot)) continue;
    const booking = typeof it.b === 'string' && /^rr[0-9a-f]{16}$/.test(it.b) ? it.b : '';
    const n = Math.max(0, Math.min(20, Math.round(Number(it.n) || 1)));
    const key = it.slot + '|' + booking;
    const s = sum.get(key) || { slot: it.slot, booking, views: 0, taps: 0 };
    if (it.k === 'v') s.views += n; else if (it.k === 't') s.taps += n; else continue;
    sum.set(key, s);
  }
  if (!sum.size) return nothing;
  await env.DB.batch([...sum.values()].map((s) => env.DB.prepare(`INSERT INTO ad_stats (day, slot, booking, views, taps) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (day, slot, booking) DO UPDATE SET views = views + excluded.views, taps = taps + excluded.taps`).bind(day, s.slot, s.booking, s.views, s.taps)));
  return nothing;
}

// ---- admin
async function adminAction(req, env, id) {
  let body; try { body = await req.json(); } catch { return json({ error: 'bad body' }, 400); }
  const r = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
  if (!r) return json({ error: 'Unknown booking.' }, 404);
  const now = Date.now();
  const set = (sql, ...a) => env.DB.prepare(`UPDATE bookings SET ${sql}, updated = ? WHERE id = ?`).bind(...a, now, id).run();
  switch (body.action) {
    case 'approve': {
      const others = (await env.DB.prepare(`SELECT id, start_day, end_day FROM bookings WHERE slot = ? AND status = 'approved' AND id != ?`).bind(r.slot, id).all()).results || [];
      const hit = others.find((o) => overlaps(o, r));
      if (hit) return json({ error: `Clashes with approved booking ${hit.id} (${hit.start_day} to ${hit.end_day}).` }, 409);
      await set("status = 'approved', reason = ''"); break;
    }
    case 'reject': await set("status = 'rejected', reason = ?", str(body.reason, 300)); break;
    case 'review': await set("status = 'review'"); break;
    case 'cancel': await set("status = 'cancelled'"); break;
    case 'paid': await set("paid = 1, pay_ref = ?", str(body.ref, 60) || 'invoice'); break;
    case 'unpaid': await set("paid = 0, pay_ref = ''"); break;
    case 'delete':
      await env.DB.batch([env.DB.prepare('DELETE FROM creatives WHERE booking = ?').bind(id), env.DB.prepare('DELETE FROM bookings WHERE id = ?').bind(id),
        env.DB.prepare('DELETE FROM ad_stats WHERE booking = ?').bind(id)]);
      return json({ ok: true, deleted: id });
    default: return json({ error: 'Unknown action.' }, 400);
  }
  return json({ ok: true, booking: { ...(await env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first()), token: undefined } });
}
async function adminData(env) {
  const bookings = (await env.DB.prepare(`SELECT id, token, slot, business, brand, name, email, phone, link, note, start_day, end_day, months, amount, status, paid, pay_ref, reason, created FROM bookings ORDER BY created DESC LIMIT 500`).all()).results || [];
  const live = new Set((await liveBookings(env)).map((b) => b.id));
  const since = today(Date.now() - 30 * DAY);
  const stats = (await env.DB.prepare('SELECT slot, booking, SUM(views) views, SUM(taps) taps FROM ad_stats WHERE day >= ? GROUP BY slot, booking').bind(since).all()).results || [];
  const totals = (await env.DB.prepare('SELECT booking, SUM(views) views, SUM(taps) taps FROM ad_stats GROUP BY booking').all()).results || [];
  const tMap = new Map(totals.map((t) => [t.booking, t]));
  return {
    today: today(), boards: await boardsPublic(env), stats30: stats, payments: !!env.PAYSTACK_SECRET,
    bookings: bookings.map((b) => ({ ...b, paid: !!b.paid, live: live.has(b.id), views: tMap.get(b.id)?.views || 0, taps: tMap.get(b.id)?.taps || 0 })),
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    const M = req.method;
    try {
      if (M === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });

      if (M === 'GET' && p === '/favicon.ico') return Response.redirect(`${env.GAME_ORIGIN || 'https://ratel-rage.pages.dev'}/favicon.png`, 302);
      // the game
      if (M === 'GET' && p === '/api/slots') {
        const level = Number(url.searchParams.get('level')) || 1;
        const live = await liveBookings(env);
        const slots = BOARDS.filter((b) => b.level === level).map((b) => {
          const L = live.find((x) => x.slot === b.id);
          return { id: b.id, page: `${url.origin}/b/${b.id}`,
            live: L ? { id: L.id, url: `${url.origin}/c/${L.id}`, brand: L.brand, link: L.link, until: L.end_day } : null };
        });
        return json({ day: today(), slots }, 200, { ...CORS, 'Cache-Control': 'public, max-age=60' });
      }
      if (M === 'POST' && p === '/api/e') return ingest(req, env);
      let m;
      if (M === 'GET' && (m = /^\/c\/(rr[0-9a-f]{16})$/.exec(p))) {
        const r = await env.DB.prepare('SELECT b.status, b.paid, b.token, b.start_day, b.end_day, c.mime, c.data FROM bookings b JOIN creatives c ON c.booking = b.id WHERE b.id = ?').bind(m[1]).first();
        if (!r) return new Response('not found', { status: 404, headers: CORS });
        const d = today();
        const isLive = r.status === 'approved' && r.paid && r.start_day <= d && r.end_day > d;
        if (!isLive && url.searchParams.get('t') !== r.token && !(await isAdmin(req, env))) return new Response('not found', { status: 404, headers: CORS });
        return new Response(b64bytes(r.data), { headers: { ...CORS, 'Content-Type': r.mime, 'X-Content-Type-Options': 'nosniff',
          'Cache-Control': isLive ? 'public, max-age=3600' : 'private, no-store' } });
      }

      // advertisers
      if (M === 'GET' && p === '/') return html(landingPage({ boards: await boardsPublic(env), gameOrigin: env.GAME_ORIGIN }));
      if (M === 'GET' && p === '/api/boards') return json({ today: today(), boards: await boardsPublic(env), payments: !!env.PAYSTACK_SECRET });
      if (M === 'GET' && (m = /^\/b\/(board-\d+)$/.exec(p))) {
        const all = await boardsPublic(env);
        const board = all.find((b) => b.id === m[1]);
        if (!board) return html(landingPage({ boards: all, gameOrigin: env.GAME_ORIGIN, notFound: true }), 404);
        return html(boardPage({ board, today: today(), gameOrigin: env.GAME_ORIGIN, payments: !!env.PAYSTACK_SECRET, artScale: ART_SCALE }));
      }
      if (M === 'POST' && p === '/api/bookings') return createBooking(req, env);
      if ((m = /^\/status\/([0-9a-f]{36})$/.exec(p)) && M === 'GET') {
        const r = await bookingByToken(env, m[1]);
        if (!r) return html(statusPage({ missing: true }), 404);
        return html(statusPage({ booking: { ...publicBooking(r), token: r.token }, stats: await bookingStats(env, r.id),
          board: boardById(r.slot), gameOrigin: env.GAME_ORIGIN, payments: !!env.PAYSTACK_SECRET, today: today() }));
      }
      if (M === 'POST' && (m = /^\/api\/pay\/([0-9a-f]{36})$/.exec(p))) return payInit(req, env, m[1]);
      if (M === 'POST' && p === '/api/paystack') return payWebhook(req, env);

      // owner
      if (p === '/admin' || p.startsWith('/api/admin')) {
        if (!(await isAdmin(req, env))) return askAuth(env);
        if (M === 'GET' && p === '/admin') return html(adminPage({ gameOrigin: env.GAME_ORIGIN }));
        if (M === 'GET' && p === '/api/admin/data') return json(await adminData(env));
        if (M === 'POST' && (m = /^\/api\/admin\/bookings\/(rr[0-9a-f]{16})$/.exec(p))) return adminAction(req, env, m[1]);
        if (M === 'POST' && (m = /^\/api\/admin\/boards\/(board-\d+)$/.exec(p))) {
          if (!boardById(m[1])) return json({ error: 'Unknown board.' }, 404);
          let body; try { body = await req.json(); } catch { return json({ error: 'bad body' }, 400); }
          await boardRows(env);
          const price = Math.round(Number(body.price));
          if (!(price >= 0 && price <= 100_000_000)) return json({ error: 'Price must be a number of naira.' }, 400);
          await env.DB.prepare('UPDATE boards SET price = ?, bookable = ? WHERE id = ?').bind(price, body.bookable ? 1 : 0, m[1]).run();
          return json({ ok: true });
        }
      }
      return new Response('not found', { status: 404 });
    } catch (e) {
      console.error(e);
      return json({ error: 'Server error. Please try again.' }, 500, CORS);
    }
  },
};
