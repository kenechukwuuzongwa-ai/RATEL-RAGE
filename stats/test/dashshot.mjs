// Renders the dashboard with ~30 days of synthetic sessions (worker.js + the
// node:sqlite D1 shim behind puppeteer's request interception; no server) and
// screenshots it light + dark.   node stats/test/dashshot.mjs <out-dir>
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import worker from '../worker.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../../_chromakey/package.json'));
const puppeteer = require('puppeteer');
const out = process.argv[2] || here;

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(path.join(here, '..', 'schema.sql'), 'utf8'));
const plain = (o) => (o ? { ...o } : null);
const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), first: async () => plain(db.prepare(sql).get(...args)),
  all: async () => ({ results: db.prepare(sql).all(...args).map(plain) }), run: async () => db.prepare(sql).run(...args) });
const env = { DB: { prepare: (s) => stmt(s), batch: async (l) => { for (const s of l) await s.run(); } }, DASH_PASSWORD: 'pw' };

// synthetic month: growing daily players, deaths mostly in section 2-3
let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const now = Date.now(), DAY = 86400000;
const S = db.prepare('INSERT INTO sessions (sid, aid, first_ts, last_ts, seconds, events, platform, device, browser, os, lang, build, country) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
const E = db.prepare('INSERT INTO events (ts, sid, aid, e, level, props) VALUES (?,?,?,?,?,?)');
let k = 0;
for (let d = 29; d >= 0; d--) {
  const n = Math.round(4 + (29 - d) * 1.3 + rnd() * 6);
  for (let i = 0; i < n; i++) {
    const sid = 'sess-' + (++k), aid = rnd() < 0.9 ? 'player-' + Math.floor(rnd() * (k * 0.7 + 5)) : '';
    const t = now - d * DAY - rnd() * DAY * 0.9, sec = Math.round(60 + rnd() * 1400);
    const mob = rnd() < 0.72;
    S.run(sid, aid, t, d === 0 && i < 3 ? now - 30000 : t + sec * 1000, sec, 10, rnd() < 0.15 ? 'android-app' : 'web', mob ? 'mobile' : 'desktop',
      mob ? (rnd() < 0.7 ? 'chrome 131' : 'samsung 25') : 'chrome 131', mob ? 'android 14' : 'windows', 'en', 'web-x', rnd() < 0.8 ? 'NG' : (rnd() < 0.5 ? 'GH' : 'GB'));
    E.run(t, sid, aid, 'level_start', 1, JSON.stringify({ level: 1, difficulty: rnd() < 0.7 ? 'NORMAL' : 'HARD' }));
    E.run(t, sid, aid, 'perf_boot', null, JSON.stringify({ ms: 600 + rnd() * 2000 }));
    E.run(t, sid, aid, 'perf_fps', null, JSON.stringify({ fps: 40 + rnd() * 20 }));
    const deaths = Math.floor(rnd() * 3);
    for (let j = 0; j < deaths; j++) {
      E.run(t + 1, sid, aid, 'game_over', 1, JSON.stringify({ level: 1, section: Math.floor(1 + rnd() * 4), boss: rnd() < 0.2 }));
      if (rnd() < 0.7) E.run(t + 2, sid, aid, 'retry', 1, '{"level":1}');
    }
    if (rnd() < 0.3) E.run(t + 3, sid, aid, 'level_complete', 1, JSON.stringify({ level: 1, time: 240 + rnd() * 300, score: Math.round(5000 + rnd() * 9000), rank: rnd() < 0.5 ? 'B' : 'A' }));
    if (rnd() < 0.05) E.run(t + 4, sid, aid, 'js_error', null, JSON.stringify({ msg: 'TypeError: cannot read properties of undefined (reading "x")', file: 'game.js' }));
  }
}

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
for (const scheme of ['light', 'dark']) {
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setRequestInterception(true);
  p.on('request', async (r) => {
    const res = await worker.fetch(new Request(r.url(), { headers: { Authorization: 'Basic ' + btoa('u:pw') } }), env);
    const h = {}; res.headers.forEach((v, k2) => { h[k2] = v; });
    r.respond({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) });
  });
  await p.goto('https://rr-stats.test/dashboard');
  await p.waitForFunction(() => document.getElementById('t-players').textContent !== '–', { timeout: 30000 });
  await p.click('button[data-r="30"]');
  await p.waitForFunction(() => /30|29/.test(String(document.querySelectorAll('#chart path').length)), { timeout: 30000 });
  const box = await p.$$eval('#chart rect', (rs) => { const r = rs[24].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height - 10]; });
  await p.mouse.move(box[0], box[1]);
  console.log(scheme, 'tooltip:', await p.$eval('.tip', (t) => getComputedStyle(t).display + ' | ' + t.textContent));
  await p.screenshot({ path: path.join(out, `dash-${scheme}.png`), fullPage: true });
  console.log(scheme, 'bars:', await p.evaluate(() => document.querySelectorAll('#chart path').length), 'errors:', JSON.stringify(errs));
  await p.close();
}
await b.close();
