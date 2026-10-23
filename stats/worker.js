/* RATEL RAGE — rr-stats Worker (see docs/STATS.md).
 *
 *   POST /e            the game's analytics batches (src/analytics.js), stored in D1
 *   GET  /dashboard    private dashboard (HTTP Basic auth, password = DASH_PASSWORD secret)
 *   GET  /api/stats    the dashboard's numbers (same auth)
 *   cron               deletes old rows (RETAIN_EVENTS_DAYS / RETAIN_SESSIONS_DAYS)
 *
 * Nothing here can slow the game: the client fires and forgets (sendBeacon /
 * no-cors fetch), so every ingest path answers 204 and never reports why it
 * dropped something. No IP address or user-agent string is stored; the only
 * location is Cloudflare's two-letter country code. */
import { DASHBOARD_HTML } from './dashboard.js';

const MAX_BODY = 64 * 1024;       // bytes per batch (the client sends <= 100 events)
const MAX_EVENTS = 100;           // per batch
const SESSION_CAP = 3000;         // events kept per session; past that a session is ignored
const NAME = /^[a-z][a-z0-9_]{1,39}$/;
const ID = /^[A-Za-z0-9-]{8,64}$/;
const ONLINE_MS = 3 * 60 * 1000;  // the client pings every 60 s while the tab is visible
const DAY = 86400000;

const str = (v, n = 40) => (typeof v === 'string' ? v.slice(0, n) : '');
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

function originAllowed(origin, env) {
  if (!origin) return false;
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.some((pat) => {
    if (!pat.includes('*')) return pat === origin;
    const [pre, post] = pat.split('*');      // one wildcard, e.g. https://*.ratel-rage.pages.dev
    return origin.startsWith(pre) && origin.endsWith(post) && origin.length > pre.length + post.length
      && !origin.slice(pre.length, origin.length - post.length).includes('/');
  });
}

// the same rules as the client's clean(), re-applied: the server trusts nothing
function cleanProps(p) {
  const o = {};
  if (!p || typeof p !== 'object' || Array.isArray(p)) return o;
  let k = 0;
  for (const key of Object.keys(p)) {
    if (++k > 20 || !/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(key)) continue;
    const v = p[key];
    if (typeof v === 'number') o[key] = isFinite(v) ? v : null;
    else if (typeof v === 'boolean' || v === null) o[key] = v;
    else if (typeof v === 'string') o[key] = v.slice(0, 200);
  }
  return o;
}

export async function ingest(req, env) {
  const nothing = new Response(null, { status: 204 });
  if (!originAllowed(req.headers.get('Origin'), env)) return nothing;
  const len = +req.headers.get('Content-Length') || 0;
  if (len > MAX_BODY) return nothing;
  let body;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return nothing;
    body = JSON.parse(text);
  } catch { return nothing; }
  if (!body || !Array.isArray(body.events)) return nothing;
  const c = body.ctx && typeof body.ctx === 'object' ? body.ctx : {};
  const country = str((req.cf && req.cf.country) || req.headers.get('CF-IPCountry') || '', 2);
  const now = Date.now();

  // group the batch by session (one tab sends one sid, but trust nothing)
  const bySid = new Map();
  for (const ev of body.events.slice(0, MAX_EVENTS)) {
    if (!ev || !NAME.test(ev.e) || !ID.test(ev.sid)) continue;
    if (!bySid.has(ev.sid)) bySid.set(ev.sid, []);
    bySid.get(ev.sid).push(ev);
  }
  const stmts = [];
  for (const [sid, evs] of bySid) {
    const row = await env.DB.prepare('SELECT events FROM sessions WHERE sid = ?').bind(sid).first();
    if (row && row.events >= SESSION_CAP) continue;
    const aidEv = evs.find((ev) => typeof ev.aid === 'string' && ID.test(ev.aid));
    const aid = aidEv ? aidEv.aid : '';
    let seconds = 0;
    const kept = [];
    for (const ev of evs) {
      const p = cleanProps(ev.p);
      if (ev.e === 'session_ping') { seconds = Math.max(seconds, Math.min(num(p.seconds) || 0, 86400)); continue; }
      kept.push([ev.e, num(p.level) === null ? null : Math.round(p.level), JSON.stringify(p)]);
    }
    stmts.push(env.DB.prepare(
      `INSERT INTO sessions (sid, aid, first_ts, last_ts, seconds, events, platform, device, browser, os, lang, build, country)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET
         last_ts = excluded.last_ts,
         seconds = MAX(sessions.seconds, excluded.seconds),
         events  = sessions.events + excluded.events,
         aid     = CASE WHEN excluded.aid != '' THEN excluded.aid ELSE sessions.aid END,
         build   = excluded.build`
    ).bind(sid, aid, now, now, seconds, evs.length, str(c.platform, 16), str(c.device, 16), str(c.browser, 24),
      str(c.os, 24), str(c.lang, 8), str(c.build, 32), country));
    for (const [e, level, props] of kept) {
      stmts.push(env.DB.prepare('INSERT INTO events (ts, sid, aid, e, level, props) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(now, sid, aid, e, level, props));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return nothing;
}

// ---- dashboard auth: HTTP Basic, any user name, password = DASH_PASSWORD
async function sha(s) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
async function authorised(req, env) {
  if (!env.DASH_PASSWORD) return false;
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Basic ')) return false;
  let pass = '';
  try { const dec = atob(h.slice(6)); pass = dec.slice(dec.indexOf(':') + 1); } catch { return false; }
  const [a, b] = await Promise.all([sha(pass), sha(env.DASH_PASSWORD)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];   // constant time
  return diff === 0;
}
const PRIVATE = {
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

export async function stats(env, from, to, tzMin) {
  const DB = env.DB, now = Date.now();
  const one = (sql, ...a) => DB.prepare(sql).bind(...a).first();
  const all = async (sql, ...a) => (await DB.prepare(sql).bind(...a).all()).results || [];
  const tz = (tzMin || 0) * 60000;   // shift so a "day" is the viewer's local day

  const online = await one('SELECT COUNT(*) AS n FROM sessions WHERE last_ts > ?', now - ONLINE_MS);
  const tot = await one(
    `SELECT COUNT(*) AS sessions,
            COUNT(DISTINCT CASE WHEN aid != '' THEN aid END) AS players,
            SUM(CASE WHEN aid = '' THEN 1 ELSE 0 END) AS anonSessions,
            COALESCE(SUM(seconds), 0) AS seconds, COALESCE(AVG(seconds), 0) AS avgSeconds
       FROM sessions WHERE first_ts >= ? AND first_ts < ?`, from, to);
  const fresh = await one(
    `SELECT COUNT(*) AS n FROM (SELECT aid, MIN(first_ts) AS f FROM sessions WHERE aid != '' GROUP BY aid)
      WHERE f >= ? AND f < ?`, from, to);
  const med = tot.sessions
    ? await one('SELECT seconds FROM sessions WHERE first_ts >= ? AND first_ts < ? ORDER BY seconds LIMIT 1 OFFSET ?',
      from, to, Math.floor((tot.sessions - 1) / 2))
    : null;
  const daily = await all(
    `SELECT CAST((first_ts + ?) / ${DAY} AS INTEGER) AS day, COUNT(*) AS sessions,
            COUNT(DISTINCT CASE WHEN aid != '' THEN aid END) AS players, COALESCE(SUM(seconds), 0) AS seconds
       FROM sessions WHERE first_ts >= ? AND first_ts < ? GROUP BY day ORDER BY day`, tz, from, to);
  const funnel = await all(
    `SELECT e, level, COUNT(*) AS n, COUNT(DISTINCT sid) AS sessions,
            COUNT(DISTINCT CASE WHEN aid != '' THEN aid END) AS players
       FROM events WHERE ts >= ? AND ts < ? AND e IN ('level_start','game_over','retry','quit','level_complete')
      GROUP BY e, level`, from, to);
  const bossDeaths = await one(
    `SELECT COUNT(*) AS n FROM events WHERE e = 'game_over' AND ts >= ? AND ts < ? AND json_extract(props, '$.boss') = 1`, from, to);
  const sections = await all(
    `SELECT json_extract(props, '$.level') AS level, json_extract(props, '$.section') AS section, COUNT(*) AS n
       FROM events WHERE e = 'game_over' AND ts >= ? AND ts < ? GROUP BY level, section ORDER BY n DESC LIMIT 12`, from, to);
  const difficulty = await all(
    `SELECT json_extract(props, '$.difficulty') AS k, COUNT(*) AS n FROM events
      WHERE e = 'level_start' AND ts >= ? AND ts < ? GROUP BY k ORDER BY n DESC`, from, to);
  const wins = await one(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT COALESCE(NULLIF(aid, ''), sid)) AS players, AVG(json_extract(props, '$.time')) AS avgTime, MIN(json_extract(props, '$.time')) AS bestTime,
            MAX(json_extract(props, '$.score')) AS bestScore
       FROM events WHERE e = 'level_complete' AND ts >= ? AND ts < ?`, from, to);
  const ranks = await all(
    `SELECT json_extract(props, '$.rank') AS k, COUNT(*) AS n FROM events
      WHERE e = 'level_complete' AND ts >= ? AND ts < ? GROUP BY k ORDER BY n DESC`, from, to);
  const by = (col) => all(`SELECT COALESCE(NULLIF(${col}, ''), 'unknown') AS k, COUNT(*) AS n FROM sessions
      WHERE first_ts >= ? AND first_ts < ? GROUP BY k ORDER BY n DESC LIMIT 10`, from, to);
  const [platform, device, browser, os, country] = await Promise.all(
    ['platform', 'device', 'browser', 'os', 'country'].map(by));
  const perf = await one(
    `SELECT AVG(CASE WHEN e = 'perf_boot' THEN json_extract(props, '$.ms') END) AS bootMs,
            AVG(CASE WHEN e = 'perf_world' THEN json_extract(props, '$.ms') END) AS worldMs,
            AVG(CASE WHEN e = 'perf_fps' THEN json_extract(props, '$.fps') END) AS fps
       FROM events WHERE ts >= ? AND ts < ? AND e IN ('perf_boot','perf_world','perf_fps')`, from, to);
  const errors = await all(
    `SELECT e, COALESCE(json_extract(props, '$.msg'), '') AS msg, COALESCE(json_extract(props, '$.file'), '') AS file,
            COUNT(*) AS n, COUNT(DISTINCT sid) AS sessions, MAX(ts) AS last
       FROM events WHERE ts >= ? AND ts < ? AND e IN ('js_error','asset_error','load_error')
      GROUP BY e, msg, file ORDER BY n DESC LIMIT 15`, from, to);

  return {
    now, from, to, tzMin: tzMin || 0, onlineWindowMin: ONLINE_MS / 60000,
    online: online.n,
    sessions: tot.sessions, players: tot.players, anonSessions: tot.anonSessions || 0,
    newPlayers: fresh.n, returningPlayers: Math.max(0, tot.players - fresh.n),
    seconds: tot.seconds, avgSeconds: Math.round(tot.avgSeconds), medianSeconds: med ? med.seconds : 0,
    daily, funnel, bossDeaths: bossDeaths.n, sections, difficulty, wins, ranks,
    breakdown: { platform, device, browser, os, country },
    perf, errors,
  };
}

export async function retention(env) {
  const now = Date.now();
  const ev = +(env.RETAIN_EVENTS_DAYS || 180), se = +(env.RETAIN_SESSIONS_DAYS || 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM events WHERE ts < ?').bind(now - ev * DAY),
    env.DB.prepare('DELETE FROM sessions WHERE last_ts < ?').bind(now - se * DAY),
  ]);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'POST' && (url.pathname === '/e' || url.pathname === '/')) {
      try { return await ingest(req, env); } catch { return new Response(null, { status: 204 }); }
    }
    if (req.method === 'GET' && (url.pathname === '/dashboard' || url.pathname === '/api/stats')) {
      if (!(await authorised(req, env))) {
        return new Response(env.DASH_PASSWORD ? 'Password required.' : 'Dashboard not configured: set the DASH_PASSWORD secret.', {
          status: env.DASH_PASSWORD ? 401 : 503,
          headers: { ...PRIVATE, 'WWW-Authenticate': 'Basic realm="Ratel Rage stats", charset="UTF-8"' },
        });
      }
      if (url.pathname === '/dashboard') {
        return new Response(DASHBOARD_HTML, { headers: { ...PRIVATE, 'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
      }
      const now = Date.now();
      // the dashboard's 30 s auto-refresh asks only for this (one indexed count), so a
      // tab left open does not re-run every query against the free daily read allowance
      if (url.searchParams.get('only') === 'online') {
        const o = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE last_ts > ?').bind(now - ONLINE_MS).first();
        return new Response(JSON.stringify({ now, online: o.n }), { headers: { ...PRIVATE, 'Content-Type': 'application/json' } });
      }
      const to = Math.min(+url.searchParams.get('to') || now, now + DAY);
      const from = Math.max(+url.searchParams.get('from') || now - 7 * DAY, to - 400 * DAY);
      const tz = Math.max(-840, Math.min(840, +url.searchParams.get('tz') || 0));
      const data = await stats(env, from, to, tz);
      return new Response(JSON.stringify(data), { headers: { ...PRIVATE, 'Content-Type': 'application/json' } });
    }
    if (req.method === 'GET' && url.pathname === '/') return new Response('rr-stats ok', { headers: { 'Content-Type': 'text/plain' } });
    return new Response('Not found', { status: 404 });
  },
  async scheduled(_ev, env) { await retention(env); },
};
