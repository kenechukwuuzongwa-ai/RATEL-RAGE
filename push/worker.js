/* rr-push — RATEL RAGE "come back" reminders (request 644).
 *
 * The browser keeps a push SUBSCRIPTION (an address at Google / Mozilla / Apple / Microsoft's push service)
 * once a player says yes on the menu (src/reminders.js). This worker stores those addresses in D1 and, once
 * an hour, nudges players who have been away:
 *   - away at least 10 hours (IDLE_H) since they last opened the game,
 *   - at most one reminder per 20 hours (GAP_H),
 *   - only between 10:00 and 20:59 in the player's own time (their UTC offset, sent at subscribe),
 *   - and after 4 reminders in a row with no visit (MAX_UNANSWERED) it stops until they come back.
 * Opening the game (POST /seen) resets the clock and the count.
 *
 * THE PUSH CARRIES NO DATA. A push with a body must be encrypted to each browser (RFC 8291); one without is
 * just a signed "wake up" (VAPID, RFC 8292) and the site's service worker (deploy/media-sw.js) picks the line
 * and shows it with the ratel logo. So all this worker needs is the VAPID private key (secret
 * VAPID_PRIVATE_JWK) to sign a short JWT per push service.
 *
 * Endpoints (CORS for ALLOWED_ORIGINS):
 *   POST /sub    { endpoint, tz }  store / refresh a subscription      POST /seen  { endpoint }  the game was opened
 *   POST /unsub  { endpoint }      forget it                           POST /test  { endpoint }  one reminder now (1 per 10 min)
 *   GET  /       health
 */
const H = 3600000;
const IDLE_H = 10, GAP_H = 20, MAX_UNANSWERED = 4, DAY_FROM = 10, DAY_TO = 20;
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.notify\.windows\.com$/, /^push\.services\.mozilla\.com$/];

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
const cors = (origin) => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' });
const json = (o, status, h) => new Response(JSON.stringify(o), { status, headers: { ...h, 'Content-Type': 'application/json' } });

function validEndpoint(e) {
  if (typeof e !== 'string' || e.length > 1000) return false;
  try { const u = new URL(e); return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname)); } catch { return false; }
}

// ---- VAPID (RFC 8292): an ES256 JWT for the push service's origin, signed with the private key
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uStr = (s) => b64u(new TextEncoder().encode(s));
let keyCache = null;
async function signingKey(env) {
  if (!keyCache) keyCache = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return keyCache;
}
async function vapidHeader(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const head = b64uStr(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64uStr(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT }));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(env), new TextEncoder().encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}
async function sendPush(endpoint, env) {
  const r = await fetch(endpoint, { method: 'POST', headers: { Authorization: await vapidHeader(endpoint, env), TTL: '43200', Urgency: 'normal', 'Content-Length': '0' } });
  return r.status;
}

// ---- the hourly round
async function round(env, now = Date.now()) {
  const due = await env.DB.prepare(
    'SELECT endpoint, tz FROM subs WHERE last_seen < ? AND (last_push IS NULL OR last_push < ?) AND unanswered < ? LIMIT 500')
    .bind(now - IDLE_H * H, now - GAP_H * H, MAX_UNANSWERED).all();
  let sent = 0, gone = 0, skipped = 0;
  for (const s of due.results || []) {
    const local = new Date(now + (s.tz || 0) * 60000).getUTCHours();
    if (local < DAY_FROM || local > DAY_TO) { skipped++; continue; }
    let st = 0;
    try { st = await sendPush(s.endpoint, env); } catch { st = 0; }
    if (st === 404 || st === 410) { await env.DB.prepare('DELETE FROM subs WHERE endpoint = ?').bind(s.endpoint).run(); gone++; }
    else if (st >= 200 && st < 300) { await env.DB.prepare('UPDATE subs SET last_push = ?, unanswered = unanswered + 1 WHERE endpoint = ?').bind(now, s.endpoint).run(); sent++; }
  }
  return { due: (due.results || []).length, sent, gone, skipped };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    if (req.method === 'GET' && url.pathname === '/') return new Response('rr-push ok', { headers: { 'Content-Type': 'text/plain' } });
    if (!originAllowed(origin, env)) return new Response('Forbidden', { status: 403 });
    const h = cors(origin);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (req.method !== 'POST') return json({ error: 'method' }, 405, h);
    let body = {};
    try { body = await req.json(); } catch { return json({ error: 'json' }, 400, h); }
    const ep = body.endpoint;
    if (!validEndpoint(ep)) return json({ error: 'endpoint' }, 400, h);
    const now = Date.now();
    if (url.pathname === '/sub') {
      const tz = Math.max(-840, Math.min(840, Math.round(+body.tz || 0)));
      await env.DB.prepare(`INSERT INTO subs (endpoint, tz, created, last_seen, unanswered) VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(endpoint) DO UPDATE SET tz = excluded.tz, last_seen = excluded.last_seen, unanswered = 0`).bind(ep, tz, now, now).run();
      return json({ ok: true }, 200, h);
    }
    if (url.pathname === '/seen') {
      const r = await env.DB.prepare('UPDATE subs SET last_seen = ?, unanswered = 0 WHERE endpoint = ?').bind(now, ep).run();
      return json({ ok: true, known: !!(r.meta && r.meta.changes) }, 200, h);
    }
    if (url.pathname === '/unsub') {
      await env.DB.prepare('DELETE FROM subs WHERE endpoint = ?').bind(ep).run();
      return json({ ok: true }, 200, h);
    }
    if (url.pathname === '/test') {
      const row = await env.DB.prepare('SELECT last_test FROM subs WHERE endpoint = ?').bind(ep).first();
      if (!row) return json({ error: 'unknown' }, 404, h);
      if (row.last_test && now - row.last_test < 10 * 60000) return json({ error: 'wait' }, 429, h);
      await env.DB.prepare('UPDATE subs SET last_test = ? WHERE endpoint = ?').bind(now, ep).run();
      const st = await sendPush(ep, env).catch(() => 0);
      return json({ ok: st >= 200 && st < 300, status: st }, 200, h);
    }
    return json({ error: 'not found' }, 404, h);
  },
  async scheduled(_ev, env) { await round(env); },
};
