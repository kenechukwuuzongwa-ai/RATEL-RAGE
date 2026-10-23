// Local tests for the rr-stats Worker: the real worker.js against a D1 shim
// over node:sqlite (same SQLite engine family D1 runs).   node stats/test/stats.test.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import worker from '../worker.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (label, ok, detail) => { ok ? pass++ : fail++; console.log((ok ? '  ok   ' : '  FAIL ') + label + (ok ? '' : '  ' + JSON.stringify(detail))); };

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(path.join(here, '..', 'schema.sql'), 'utf8'));
  const plain = (o) => (o ? { ...o } : null);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => plain(db.prepare(sql).get(...args)),
    all: async () => ({ results: db.prepare(sql).all(...args).map(plain) }),
    run: async () => db.prepare(sql).run(...args),
  });
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    batch: async (list) => {               // D1 batches are a transaction
      db.exec('BEGIN');
      try { for (const s of list) await s.run(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

const ORIGIN = 'https://ratel-rage.pages.dev';
const mkEnv = () => ({ DB: d1(), ALLOWED_ORIGINS: 'https://ratel-rage.pages.dev,https://*.ratel-rage.pages.dev,https://localhost', DASH_PASSWORD: 'correct horse' });
const post = (env, body, { origin = ORIGIN, country = 'NG', raw } = {}) => {
  const text = raw != null ? raw : JSON.stringify(body);
  const req = new Request('https://rr-stats.example.workers.dev/e', { method: 'POST', body: text,
    headers: { 'Content-Type': 'text/plain', ...(origin ? { Origin: origin } : {}), 'CF-IPCountry': country } });
  return worker.fetch(req, env);
};
const ctx = { build: 'web-test', platform: 'web', device: 'mobile', browser: 'chrome 131', os: 'android 14', lang: 'en', win: '915x412' };
const ev = (e, sid, aid, p = {}) => ({ e, t: Date.now(), sid, n: 1, p, ...(aid ? { aid } : {}) });
const count = (env, sql) => env.DB.raw.prepare(sql).get().n;
const auth = (pw) => ({ Authorization: 'Basic ' + btoa('owner:' + pw) });
const getStats = async (env, qs = '', pw = 'correct horse') => worker.fetch(new Request('https://x/api/stats' + qs, { headers: pw ? auth(pw) : {} }), env);

const S1 = '11111111-aaaa-4bbb-8ccc-000000000001', S2 = '11111111-aaaa-4bbb-8ccc-000000000002', S3 = '11111111-aaaa-4bbb-8ccc-000000000003';
const A1 = '22222222-aaaa-4bbb-8ccc-000000000001', A2 = '22222222-aaaa-4bbb-8ccc-000000000002';

// ---------- ingest
{
  const env = mkEnv();
  let r = await post(env, { v: 1, ctx, events: [ev('session_start', S1, A1, { reload: false }), ev('level_start', S1, A1, { level: 1, difficulty: 'NORMAL' })] });
  check('ingest answers 204', r.status === 204, r.status);
  check('a session row and the non-ping events are stored', count(env, 'SELECT COUNT(*) n FROM sessions') === 1 && count(env, 'SELECT COUNT(*) n FROM events') === 2);
  const s = env.DB.raw.prepare('SELECT * FROM sessions').get();
  check('session keeps context + country, player id', s.device === 'mobile' && s.browser === 'chrome 131' && s.country === 'NG' && s.aid === A1 && s.platform === 'web', s);
  await post(env, { ctx, events: [ev('session_ping', S1, A1, { seconds: 61 })] });
  await post(env, { ctx, events: [ev('session_ping', S1, A1, { seconds: 125 }), ev('game_over', S1, A1, { level: 1, section: 2, time: 80, boss: false })] });
  const s2 = env.DB.raw.prepare('SELECT * FROM sessions').get();
  check('pings update the session (seconds = max) and are not stored as events', s2.seconds === 125 && count(env, "SELECT COUNT(*) n FROM events WHERE e='session_ping'") === 0, s2);
  check('event count accumulates on the session', s2.events === 5, s2.events);
  await post(env, { ctx, events: [ev('session_ping', S1, A1, { seconds: 30 })] });
  check('a late, smaller ping never shrinks play time', env.DB.raw.prepare('SELECT seconds FROM sessions').get().seconds === 125);
  const lvl = env.DB.raw.prepare("SELECT level, props FROM events WHERE e='game_over'").get();
  check('level column + props JSON stored', lvl.level === 1 && JSON.parse(lvl.props).section === 2, lvl);

  // rejections (always 204, nothing stored)
  const before = count(env, 'SELECT COUNT(*) n FROM events');
  for (const [label, opts, body] of [
    ['foreign origin', { origin: 'https://evil.example' }, { ctx, events: [ev('level_start', S2, A2)] }],
    ['missing origin', { origin: null }, { ctx, events: [ev('level_start', S2, A2)] }],
    ['look-alike origin', { origin: 'https://ratel-rage.pages.dev.evil.example' }, { ctx, events: [ev('level_start', S2, A2)] }],
    ['broken JSON', { raw: '{nope' }, null],
    ['oversized body', { raw: JSON.stringify({ ctx, events: [ev('level_start', S2, A2, { msg: 'x'.repeat(70000) })] }) }, null],
    ['bad event name', {}, { ctx, events: [ev('DROP TABLE', S2, A2), ev('<script>', S2, A2)] }],
    ['bad session id', {}, { ctx, events: [ev('level_start', "x'; --", A2)] }],
  ]) {
    const rr = await post(env, body, opts);
    check(`rejected quietly: ${label}`, rr.status === 204 && count(env, 'SELECT COUNT(*) n FROM events') === before, rr.status);
  }
  check('preview deployments are allowed (https://<hash>.ratel-rage.pages.dev)',
    (await post(env, { ctx, events: [ev('level_start', S2, A2, { level: 1 })] }, { origin: 'https://fa8d8eb8.ratel-rage.pages.dev' })).status === 204
    && count(env, 'SELECT COUNT(*) n FROM events') === before + 1);
  const big = Array.from({ length: 150 }, () => ev('perf_fps', S3, '', { fps: 60 }));
  await post(env, { ctx, events: big });
  check('at most 100 events per batch', count(env, `SELECT COUNT(*) n FROM events WHERE sid='${S3}'`) === 100);
  check('no player id stored when the browser sent none', env.DB.raw.prepare(`SELECT aid FROM sessions WHERE sid='${S3}'`).get().aid === '');
  env.DB.raw.exec(`UPDATE sessions SET events = 3000 WHERE sid='${S3}'`);
  await post(env, { ctx, events: [ev('perf_fps', S3, '', { fps: 60 })] });
  check('a session past the 3000-event cap is ignored', count(env, `SELECT COUNT(*) n FROM events WHERE sid='${S3}'`) === 100);
  const weird = '33333333-aaaa-4bbb-8ccc-000000000009';
  await post(env, { ctx: { device: 'x'.repeat(500) }, events: [ev('level_start', weird, '', { ['k'.repeat(80)]: 1, nested: { a: 1 }, arr: [1], ok: 'y'.repeat(500) })] });
  const w = env.DB.raw.prepare(`SELECT props FROM events WHERE sid='${weird}'`).get();
  const ws = env.DB.raw.prepare(`SELECT device FROM sessions WHERE sid='${weird}'`).get();
  check('props are re-cleaned server side (no long keys, no objects, strings <= 200)', w && JSON.stringify(JSON.parse(w.props)) === JSON.stringify({ ok: 'y'.repeat(200) }) && ws.device.length === 16, w);
}

// ---------- dashboard auth
{
  const env = mkEnv();
  check('stats API without a password: 401 + Basic challenge', (await getStats(env, '', null)).status === 401);
  const wrong = await getStats(env, '', 'guess');
  check('wrong password: 401', wrong.status === 401 && /Basic/.test(wrong.headers.get('WWW-Authenticate') || ''));
  const dash = await worker.fetch(new Request('https://x/dashboard', { headers: auth('correct horse') }), env);
  const html = await dash.text();
  check('dashboard with the password: 200 HTML, no-store, framing denied, CSP set', dash.status === 200 && /player stats/.test(html)
    && dash.headers.get('Cache-Control') === 'no-store' && dash.headers.get('X-Frame-Options') === 'DENY' && /connect-src 'self'/.test(dash.headers.get('Content-Security-Policy') || ''));
  check('dashboard never uses innerHTML (player-sent text is rendered as text)', !/innerHTML|insertAdjacentHTML|document\.write/.test(html));
  const noPw = { ...env, DASH_PASSWORD: '' };
  check('no DASH_PASSWORD configured: 503, never open', (await getStats(noPw, '', 'anything')).status === 503);
}

// ---------- numbers
{
  const env = mkEnv();
  const now = Date.now(), DAY = 86400000;
  // three players: A1 two sessions (one 10 days ago), A2 one session; one anonymous session
  const ins = env.DB.raw.prepare('INSERT INTO sessions (sid, aid, first_ts, last_ts, seconds, events, platform, device, browser, os, lang, build, country) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  ins.run('s-old-0001', A1, now - 10 * DAY, now - 10 * DAY, 300, 5, 'web', 'desktop', 'chrome 131', 'windows', 'en', 'b', 'NG');
  ins.run('s-new-0001', A1, now - 2 * DAY, now - 2 * DAY, 600, 5, 'web', 'mobile', 'chrome 131', 'android 14', 'en', 'b', 'NG');
  ins.run('s-new-0002', A2, now - 1 * DAY, now - 60000, 900, 5, 'web', 'mobile', 'samsung 25', 'android 13', 'en', 'b', 'GH');
  ins.run('s-new-0003', '', now - 3 * DAY, now - 3 * DAY, 60, 5, 'android-app', 'mobile', 'webview 131', 'android 12', 'en', 'b', 'NG');
  const e = env.DB.raw.prepare('INSERT INTO events (ts, sid, aid, e, level, props) VALUES (?,?,?,?,?,?)');
  e.run(now - 2 * DAY, 's-new-0001', A1, 'level_start', 1, '{"level":1,"difficulty":"NORMAL"}');
  e.run(now - 2 * DAY, 's-new-0001', A1, 'game_over', 1, '{"level":1,"section":2,"boss":false}');
  e.run(now - 2 * DAY, 's-new-0001', A1, 'retry', 1, '{"level":1}');
  e.run(now - 1 * DAY, 's-new-0002', A2, 'level_start', 1, '{"level":1,"difficulty":"HARD"}');
  e.run(now - 1 * DAY, 's-new-0002', A2, 'game_over', 1, '{"level":1,"section":4,"boss":true}');
  e.run(now - 1 * DAY, 's-new-0002', A2, 'level_complete', 1, '{"level":1,"time":300,"score":12000,"rank":"A"}');
  e.run(now - 1 * DAY, 's-new-0002', A2, 'js_error', null, '{"msg":"<img src=x onerror=alert(1)>","file":"game.js"}');
  e.run(now - 1 * DAY, 's-new-0002', A2, 'perf_boot', null, '{"ms":800}');
  const r = await getStats(env, `?from=${now - 7 * DAY}&to=${now + 1000}&tz=60`);
  const s = await r.json();
  check('stats API: 200 JSON', r.status === 200);
  check('online now = sessions seen in the last 3 minutes', s.online === 1, s.online);
  check('7-day sessions / players / anonymous sessions', s.sessions === 3 && s.players === 2 && s.anonSessions === 1, s);
  check('new vs returning players (A1 first played 10 days ago)', s.newPlayers === 1 && s.returningPlayers === 1, [s.newPlayers, s.returningPlayers]);
  check('time played total / average / median', s.seconds === 1560 && s.avgSeconds === 520 && s.medianSeconds === 600, [s.seconds, s.avgSeconds, s.medianSeconds]);
  check('daily series has one row per active day', s.daily.length === 3 && s.daily.reduce((a, d) => a + d.sessions, 0) === 3, s.daily);
  const f = Object.fromEntries(s.funnel.map((x) => [x.e, x.players]));
  check('level funnel: 2 started, 2 died, 1 retry, 1 won', f.level_start === 2 && f.game_over === 2 && f.retry === 1 && f.level_complete === 1, f);
  check('deaths at the boss', s.bossDeaths === 1, s.bossDeaths);
  check('wins: count, time, best score, rank', s.wins.n === 1 && s.wins.bestTime === 300 && s.wins.bestScore === 12000 && s.ranks[0].k === 'A', s.wins);
  check('breakdowns (device, country, platform)', s.breakdown.device[0].k === 'mobile' && s.breakdown.device[0].n === 3
    && s.breakdown.country.find((x) => x.k === 'GH').n === 1 && s.breakdown.platform.find((x) => x.k === 'android-app').n === 1, s.breakdown);
  check('errors grouped, message passed through as data', s.errors.length === 1 && s.errors[0].msg.startsWith('<img') && s.errors[0].n === 1, s.errors);
  check('perf average', s.perf.bootMs === 800, s.perf);
  const live = await getStats(env, '?only=online');
  const lj = await live.json();
  check('auto-refresh endpoint returns only the online count', live.status === 200 && lj.online === 1 && Object.keys(lj).sort().join() === 'now,online', lj);
  check('auto-refresh endpoint is password-protected too', (await getStats(env, '?only=online', null)).status === 401);
  const today = await (await getStats(env, `?from=${now - 1000}&to=${now + 1000}`)).json();
  check('an empty range returns zeros, not errors', today.sessions === 0 && today.players === 0 && today.medianSeconds === 0 && today.online === 1, today);
}

// ---------- retention
{
  const env = mkEnv();
  const now = Date.now(), DAY = 86400000;
  env.DB.raw.prepare('INSERT INTO sessions (sid, aid, first_ts, last_ts) VALUES (?,?,?,?)').run('s-ancient1', '', now - 500 * DAY, now - 500 * DAY);
  env.DB.raw.prepare('INSERT INTO sessions (sid, aid, first_ts, last_ts) VALUES (?,?,?,?)').run('s-recent1', '', now - DAY, now - DAY);
  env.DB.raw.prepare('INSERT INTO events (ts, sid, e) VALUES (?,?,?)').run(now - 200 * DAY, 's-ancient1', 'level_start');
  env.DB.raw.prepare('INSERT INTO events (ts, sid, e) VALUES (?,?,?)').run(now - DAY, 's-recent1', 'level_start');
  await worker.scheduled({}, env);
  check('retention: events > 180 days and sessions > 400 days deleted, recent kept',
    count(env, 'SELECT COUNT(*) n FROM events') === 1 && count(env, 'SELECT COUNT(*) n FROM sessions') === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
