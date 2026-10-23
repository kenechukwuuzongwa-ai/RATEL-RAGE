// Local tests for the rr-ads Worker: the real worker.js against a D1 shim over
// node:sqlite.      node ads/test/ads.test.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import worker, { today, addMonths, imageInfo, peakShares, priceFor } from '../worker.js';
import { BOARDS, uploadSize } from '../boards.js';

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
  return { raw: db, prepare: (sql) => stmt(sql),
    batch: async (list) => { db.exec('BEGIN'); try { for (const s of list) await s.run(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } } };
}
const ORIGIN = 'https://ratel-rage.pages.dev';
const mkEnv = (extra = {}) => ({ DB: d1(), ALLOWED_ORIGINS: ORIGIN + ',https://localhost', GAME_ORIGIN: ORIGIN, ADMIN_PASSWORD: 'open sesame', ...extra });
const BASE = 'https://rr-ads.example.workers.dev';
const call = (env, p, { method = 'GET', body, headers = {} } = {}) => worker.fetch(new Request(BASE + p, { method, headers,
  body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), env);
const admin = { Authorization: 'Basic ' + btoa('owner:open sesame') };

// a real PNG header of a given size (the server only reads the header)
function png(w, h) {
  const u = new Uint8Array(64);
  u.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(u.buffer); dv.setUint32(16, w); dv.setUint32(20, h);
  return 'data:image/png;base64,' + Buffer.from(u).toString('base64');
}
function jpeg(w, h) {
  const u = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
  return 'data:image/jpeg;base64,' + Buffer.from(u).toString('base64');
}
const b3 = BOARDS.find((b) => b.id === 'board-3');
const size3 = uploadSize(b3);
const form = (o = {}) => ({ slot: 'board-3', business: 'Mama Put Kitchen Ltd', brand: 'Mama Put', name: 'Ada Obi', email: 'ada@example.com',
  phone: '0800', link: 'https://mamaput.example.com', start: today(), months: 2, art: png(size3.w, size3.h), ...o });

// ---------- helpers
check('addMonths keeps the day, clamps month ends', addMonths('2026-01-31', 1) === '2026-02-28' && addMonths('2026-10-23', 2) === '2026-12-23' && addMonths('2026-11-15', 3) === '2027-02-15');
check('imageInfo reads PNG and JPEG sizes', JSON.stringify(imageInfo(Buffer.from(png(1262, 502).split(',')[1], 'base64'))) === JSON.stringify({ mime: 'image/png', w: 1262, h: 502 })
  && imageInfo(Buffer.from(jpeg(940, 378).split(',')[1], 'base64')).w === 940);

// ---------- boards
{
  const env = mkEnv();
  const r = await call(env, '/api/boards'); const o = await r.json();
  check('boards are seeded from the register', o.boards.length === BOARDS.length && o.boards.find((b) => b.id === 'board-3').price === 80000);
  check('board-1 is reserved (house advert)', o.boards.find((b) => b.id === 'board-1').bookable === false);
  const page = await call(env, '/b/board-3');
  const text = await page.text();
  check('board page renders with the upload size', page.status === 200 && text.includes(`"upload":{"w":${size3.w},"h":${size3.h}}`));
  check('landing page renders', (await call(env, '/')).status === 200);
  check('an unknown board is a 404 page', (await call(env, '/b/board-9')).status === 404);
}

// ---------- booking validation
{
  const env = mkEnv();
  const post = (o) => call(env, '/api/bookings', { method: 'POST', body: form(o), headers: { 'Content-Type': 'application/json' } });
  check('bad email refused', (await post({ email: 'nope' })).status === 400);
  check('wrong-shaped artwork refused', (await post({ art: png(1000, 1000) })).status === 400);
  check('too-small artwork refused', (await post({ art: png(300, Math.round(300 * size3.h / size3.w)) })).status === 400);
  check('a file that is not an image refused', (await post({ art: 'data:image/png;base64,' + Buffer.from('hello world, not a png').toString('base64') })).status === 400);
  check('a past start date refused', (await post({ start: '2020-01-01' })).status === 400);
  check('a javascript: link refused', (await post({ link: 'javascript:alert(1)' })).status === 400);
  check('the reserved board refuses bookings', (await post({ slot: 'board-1', art: png(978, 416) })).status === 409);
  const ok = await post({ art: jpeg(size3.w, size3.h) }); const o = await ok.json();
  check('a good booking is accepted, priced and dated', ok.status === 200 && o.amount === 160000 && o.end === addMonths(today(), 2) && /^[0-9a-f]{36}$/.test(o.token), o);
  check('no Paystack key: no pay link (invoice mode)', o.pay === null);
  const row = env.DB.raw.prepare('SELECT status, paid FROM bookings').get();
  check('it waits for review, unpaid', row.status === 'review' && row.paid === 0);
  const hp = await post({ website: 'http://spam' });
  check('honeypot: answers ok, stores nothing', hp.status === 200 && env.DB.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n === 1);

  // nothing is live yet
  let slots = await (await call(env, '/api/slots?level=1')).json();
  check('the game sees no advert before approval', slots.slots.every((s) => s.live === null) && slots.slots.length === 4);
  check('artwork is private before it is live', (await call(env, `/c/${o.id}`)).status === 404);
  check('…but the owner sees it with the status token', (await call(env, `/c/${o.id}?t=${o.token}`)).status === 200);
  const sp = await call(env, `/status/${o.token}`);
  check('the status page renders', sp.status === 200 && (await sp.text()).includes('Mama Put'));

  // admin
  check('admin needs the password', (await call(env, '/admin')).status === 401 && (await call(env, '/api/admin/data', { headers: { Authorization: 'Basic ' + btoa('x:wrong') } })).status === 401);
  check('admin page opens with it', (await call(env, '/admin', { headers: admin })).status === 200);
  const act = (id, action, extra = {}) => call(env, `/api/admin/bookings/${id}`, { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: { action, ...extra } });
  check('approve', (await act(o.id, 'approve')).status === 200);
  slots = await (await call(env, '/api/slots?level=1')).json();
  check('approved but unpaid: still not live', slots.slots.find((s) => s.id === 'board-3').live === null);
  check('mark paid', (await act(o.id, 'paid', { ref: 'INV-001' })).status === 200);
  slots = await (await call(env, '/api/slots?level=1')).json();
  const live = slots.slots.find((s) => s.id === 'board-3').live;
  check('approved + paid + in dates: live for the game', live && live.id === o.id && live.brand === 'Mama Put' && live.link === 'https://mamaput.example.com' && live.url.endsWith(`/c/${o.id}`), live);
  const img = await call(env, `/c/${o.id}`);
  check('live artwork is public, CORS-open and typed', img.status === 200 && img.headers.get('Access-Control-Allow-Origin') === '*' && img.headers.get('Content-Type') === 'image/jpeg');

  // a second booking that clashes
  const two = await (await post({ business: 'Other', brand: 'Other' })).json();
  check('a clashing booking for taken dates is refused at booking time', two.error && /fully booked/.test(two.error), two);
  const later = await (await post({ business: 'Later Co', brand: 'Later', start: addMonths(today(), 2), months: 1 })).json();
  check('the next free dates can be booked', !!later.id, later);
  check('approving it does not clash', (await act(later.id, 'approve')).status === 200);
  env.DB.raw.prepare("UPDATE bookings SET status = 'review' WHERE id = ?").run(later.id);
  env.DB.raw.prepare("UPDATE bookings SET start_day = ? WHERE id = ?").run(today(), later.id);
  check('approving an overlapping booking is refused', (await act(later.id, 'approve')).status === 409);
  check('reject with a reason', (await act(later.id, 'reject', { reason: 'Clashes' })).status === 200
    && env.DB.raw.prepare('SELECT reason FROM bookings WHERE id = ?').get(later.id).reason === 'Clashes');

  // the game's counts
  const e = (items, origin = ORIGIN) => call(env, '/api/e', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: { items } });
  await e([{ slot: 'board-3', b: o.id, k: 'v', n: 3 }, { slot: 'board-3', b: o.id, k: 't' }, { slot: 'board-2', b: '', k: 'v', n: 2 }, { slot: 'nope', k: 'v' }]);
  await e([{ slot: 'board-3', b: o.id, k: 'v', n: 999 }]);
  await e([{ slot: 'board-3', b: o.id, k: 'v', n: 5 }], 'https://evil.example');
  const st = env.DB.raw.prepare("SELECT views, taps FROM ad_stats WHERE booking = ?").get(o.id);
  check('views and taps are summed per day; n capped at 20; strangers ignored', st.views === 23 && st.taps === 1, st);
  check('house art views are counted too', env.DB.raw.prepare("SELECT views FROM ad_stats WHERE slot = 'board-2' AND booking = ''").get().views === 2);
  const data = await (await call(env, '/api/admin/data', { headers: admin })).json();
  check('admin data has the booking, live, with its numbers', data.bookings.find((b) => b.id === o.id)?.live === true && data.bookings.find((b) => b.id === o.id).views === 23);
  const price = await call(env, '/api/admin/boards/board-2', { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: { price: 45000, bookable: true } });
  check('admin edits a price', price.status === 200 && (await (await call(env, '/api/boards')).json()).boards.find((b) => b.id === 'board-2').price === 45000);
  check('delete removes booking + artwork', (await act(later.id, 'delete')).status === 200
    && env.DB.raw.prepare('SELECT COUNT(*) n FROM creatives WHERE booking = ?').get(later.id).n === 0);
}

// ---------- no HTML injection from advertiser text
{
  const env = mkEnv();
  const r = await (await call(env, '/api/bookings', { method: 'POST', body: form({ business: '</script><script>alert(1)</script>', brand: '<img src=x onerror=alert(1)>' }) })).json();
  const t = await (await call(env, `/status/${r.token}`)).text();
  check('advertiser text cannot break out of the data block', !t.includes('</script><script>alert(1)') && t.includes('\\u003c/script>'));
}

// ---------- Paystack
{
  const env = mkEnv({ PAYSTACK_SECRET: 'sk_test_x' });
  const o = await (await call(env, '/api/bookings', { method: 'POST', body: form() })).json();
  check('with a Paystack key the booking offers a pay link', o.pay === `/api/pay/${o.token}`);
  const evt = JSON.stringify({ event: 'charge.success', data: { reference: o.id, amount: o.amount * 100, id: 99 } });
  const bad = await call(env, '/api/paystack', { method: 'POST', body: evt, headers: { 'x-paystack-signature': 'deadbeef' } });
  check('webhook with a bad signature is refused', bad.status === 401 && env.DB.raw.prepare('SELECT paid FROM bookings').get().paid === 0);
  const sig = createHmac('sha512', 'sk_test_x').update(evt).digest('hex');
  const good = await call(env, '/api/paystack', { method: 'POST', body: evt, headers: { 'x-paystack-signature': sig } });
  check('a signed charge.success for the full amount marks it paid', good.status === 200 && env.DB.raw.prepare('SELECT paid FROM bookings').get().paid === 1);
  const short = JSON.stringify({ event: 'charge.success', data: { reference: o.id, amount: 100 } });
  env.DB.raw.prepare('UPDATE bookings SET paid = 0').run();
  await call(env, '/api/paystack', { method: 'POST', body: short, headers: { 'x-paystack-signature': createHmac('sha512', 'sk_test_x').update(short).digest('hex') } });
  check('an underpayment does not mark it paid', env.DB.raw.prepare('SELECT paid FROM bookings').get().paid === 0);
}

// ---------- rotation (request 448)
check('peakShares: back-to-back bookings do not add up, overlapping ones do',
  peakShares([{ start_day: '2026-11-01', end_day: '2026-12-01', shares: 2 }, { start_day: '2026-12-01', end_day: '2027-01-01', shares: 2 }], '2026-11-01', '2027-01-01') === 2
  && peakShares([{ start_day: '2026-11-01', end_day: '2026-12-15', shares: 2 }, { start_day: '2026-12-01', end_day: '2027-01-01', shares: 1 }], '2026-11-01', '2027-01-01') === 3);
check('priceFor: a share is its fraction of the whole board', priceFor({ price: 90000, shares: 3 }, 1, 2) === 60000 && priceFor({ price: 80000, shares: 3 }, 3, 1) === 80000);
{
  const env = mkEnv();
  const post = (o) => call(env, '/api/bookings', { method: 'POST', body: form(o) });
  const act = (id, action, extra = {}) => call(env, `/api/admin/bookings/${id}`, { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: { action, ...extra } });
  const a = await (await post({ brand: 'A', shares: 1 })).json();
  const b = await (await post({ brand: 'B', shares: 2 })).json();
  check('a one-share booking costs a third of the board', a.amount === Math.round(80000 / 3) * 2 && a.shares === 1, a);
  check('shares outside 1..3 are refused', (await post({ shares: 4 })).status === 400 && (await post({ shares: 0 })).status === 400);
  for (const x of [a, b]) { await act(x.id, 'approve'); await act(x.id, 'paid'); }
  const slots = await (await call(env, '/api/slots?level=1')).json();
  const s3 = slots.slots.find((s) => s.id === 'board-3');
  check('both live bookings rotate on the board, weighted by shares', s3.rotation.length === 2 && s3.rotation.map((r) => r.weight).sort().join() === '1,2' && s3.live.id === s3.rotation[0].id, s3.rotation);
  const full = await post({ brand: 'C', shares: 1 });
  check('the board is full (1 + 2 of 3): a new booking for those dates is refused', full.status === 409, await full.json());
  const later = await (await post({ brand: 'D', shares: 3, start: addMonths(today(), 2), months: 1 })).json();
  check('the whole board is still bookable once those end', !!later.id, later);
  await act(b.id, 'cancel');
  const c = await (await post({ brand: 'C', shares: 2 })).json();
  const e = await (await post({ brand: 'E', shares: 1 })).json();
  check('approve C (1 + 2 = 3 shares)', (await act(c.id, 'approve')).status === 200);
  const over = await act(e.id, 'approve');
  check("approving past the board's shares is refused with a reason", over.status === 409 && /free shares/.test((await over.json()).error));
  const shrink = await call(env, '/api/admin/boards/board-3', { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: { price: 80000, shares: 2, bookable: true } });
  check('shares cannot drop below what approved bookings hold', shrink.status === 409);
  const grow = await call(env, '/api/admin/boards/board-3', { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: { price: 80000, shares: 4, bookable: true } });
  check('…but can grow, and then E fits', grow.status === 200 && (await act(e.id, 'approve')).status === 200);
  const pub = (await (await call(env, '/api/boards')).json()).boards.find((x) => x.id === 'board-3');
  check('the board list reports shares and what is free today', pub.shares === 4 && pub.freeToday === 0, { shares: pub.shares, free: pub.freeToday });
  check('the status page shows the share', (await (await call(env, `/status/${a.token}`)).text()).includes('"shares":1'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
