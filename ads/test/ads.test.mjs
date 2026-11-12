// Local tests for the rr-ads Worker: the real worker.js against a D1 shim over
// node:sqlite.      node ads/test/ads.test.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import worker, { today, addMonths, imageInfo, peakShares, priceFor, refundFor } from '../worker.js';
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
  phone: '0800', link: 'https://mamaput.example.com', start: today(), months: 2, art: png(size3.w, size3.h), agree: true, ...o });

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
  const land = await call(env, '/'); const landText = await land.text();
  check('landing page renders, links the policy, no 18+ wording', land.status === 200 && landText.includes('href="/policy"') && !landText.includes('18+'));
  const pol = await call(env, '/policy'); const polText = await pol.text();
  check('policy page renders the bans and the all-ages rule', pol.status === 200 && /Betting and gambling/.test(polText) && /Alcohol/.test(polText) && /all ages/.test(polText));
  check('board page asks for policy agreement', text.includes('id="agree"') && text.includes('href="/policy"'));
  check('admin page links the policy', (await (await call(env, '/admin', { headers: admin })).text()).includes('href="/policy"'));
  check('an unknown board is a 404 page', (await call(env, '/b/board-9')).status === 404);
}

// ---------- booking validation
{
  const env = mkEnv();
  const post = (o) => call(env, '/api/bookings', { method: 'POST', body: form(o), headers: { 'Content-Type': 'application/json' } });
  check('bad email refused', (await post({ email: 'nope' })).status === 400);
  check('a booking without policy agreement refused', (await post({ agree: undefined })).status === 400 && (await post({ agree: 'yes' })).status === 400);
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

// ---------- refunds (request 593)
{
  const B = { paid: 1, amount: 30000, start_day: '2026-11-01', end_day: '2026-12-01' };   // 30 days
  check('refundFor: unpaid owes nothing', refundFor({ ...B, paid: 0 }, '2026-11-10', 'cancel') === 0 && refundFor({ ...B, paid: 0 }, '2026-10-01', 'rejected') === 0);
  check('refundFor: not approved is a full refund', refundFor(B, '2026-11-20', 'rejected') === 30000);
  check('refundFor: cancelled before the start is a full refund', refundFor(B, '2026-10-31', 'cancel') === 30000);
  check('refundFor: cancelled with 12 of 30 days left gets 12/30 back', refundFor(B, '2026-11-18', 'cancel') === 12000);
  check('refundFor: the day you cancel counts as used', refundFor(B, '2026-11-01', 'cancel') === 29000 && refundFor(B, '2026-11-30', 'cancel') === 0);
  check('refundFor: a policy breach gets nothing back', refundFor(B, '2026-10-20', 'breach') === 0 && refundFor(B, '2026-11-18', 'breach') === 0);
  check('refundFor rounds down to whole naira', refundFor({ ...B, amount: 26667 }, '2026-11-18', 'cancel') === Math.floor(26667 * 12 / 30));
}
{
  const env = mkEnv({ PAYSTACK_SECRET: 'sk_test_x' });
  const shift = (n) => new Date(Date.parse(today() + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const post = (o) => call(env, '/api/bookings', { method: 'POST', body: form(o) }).then((r) => r.json());
  const act = (id, action, extra = {}) => call(env, `/api/admin/bookings/${id}`, { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: { action, ...extra } });
  const cancel = (token) => call(env, `/api/cancel/${token}`, { method: 'POST' });
  const row = (id) => env.DB.raw.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  const pol = await (await call(env, '/policy')).text();
  check('policy page has the refund terms, version 2', /id="refunds"/.test(pol) && /Cancel after it starts/.test(pol) && /12\/30/.test(pol) && /10 working days/.test(pol) && /Version 2/.test(pol));
  check('board page: agreeing covers the refund terms', (await (await call(env, '/b/board-3')).text()).includes('href="/policy#refunds"'));

  // unpaid: cancel at no cost
  const u = await post({ brand: 'U', shares: 1, start: shift(3), months: 1 });
  check('a booking records the policy version agreed to', row(u.id).policy === '2');
  const cu = await cancel(u.token); const cuo = await cu.json();
  check('advertiser cancels an unpaid booking: nothing owed', cu.status === 200 && cuo.refundDue === 0 && row(u.id).status === 'cancelled' && row(u.id).cancelled_by === 'advertiser');
  check('cancelling twice is refused; an unknown token is a 404', (await cancel(u.token)).status === 409 && (await cancel('0'.repeat(36))).status === 404);
  check('a cancelled booking cannot be approved again, or rejected', (await act(u.id, 'approve')).status === 409 && (await act(u.id, 'reject', { reason: 'x' })).status === 409);
  const sig = (o) => { const t = JSON.stringify(o); return { body: t, headers: { 'x-paystack-signature': createHmac('sha512', 'sk_test_x').update(t).digest('hex') } }; };
  const late = sig({ event: 'charge.success', data: { reference: u.id, amount: u.amount * 100, id: 501 } });
  await call(env, '/api/paystack', { method: 'POST', ...late });
  check('paid by Paystack after it was cancelled: all of it is owed back', row(u.id).paid === 1 && row(u.id).refund_due === u.amount);

  // paid, not started: full refund
  const f = await post({ brand: 'F', shares: 1, start: shift(5), months: 1 });
  await act(f.id, 'approve'); await act(f.id, 'paid', { ref: 'INV-9' });
  const sp0 = await (await call(env, `/status/${f.token}`)).text();
  check('status page offers Cancel with the full refund before the start', sp0.includes('id="cancelbox"') && sp0.includes(`"refundIfCancelled":${f.amount}`));
  const cf = await (await cancel(f.token)).json();
  check('advertiser cancels a paid booking before it starts: full refund', cf.refundDue === f.amount && row(f.id).refund_due === f.amount);
  const sp1 = await (await call(env, `/status/${f.token}`)).text();
  check('status page shows the refund owed', sp1.includes(`"refundDue":${f.amount}`) && sp1.includes('"cancelledBy":"advertiser"'));

  // paid and live for 10 of 30 days: the days left after today
  const L = await post({ brand: 'L', shares: 1, start: today(), months: 1 });
  env.DB.raw.prepare('UPDATE bookings SET start_day = ?, end_day = ? WHERE id = ?').run(shift(-10), shift(20), L.id);
  await act(L.id, 'approve'); await act(L.id, 'paid');
  const cl = await (await cancel(L.token)).json();
  check('advertiser cancels a live booking: the days left after today, day by day', cl.refundDue === Math.floor(L.amount * 19 / 30), cl);
  check('the cancelled advert is off the board', !(await (await call(env, '/api/slots?level=1')).json()).slots.find((s) => s.id === 'board-3').rotation.some((x) => x.id === L.id));

  // owner: reject a paid booking, reopen it, take one down for a breach or not
  const R = await post({ brand: 'R', shares: 1, start: shift(2), months: 1 });
  await act(R.id, 'paid');
  await act(R.id, 'reject', { reason: 'Betting advert' });
  check('rejecting a paid booking owes everything back', row(R.id).refund_due === R.amount && /full refund/.test(row(R.id).refund_note));
  await act(R.id, 'review');
  check('reopening it for review clears a refund not yet sent', row(R.id).refund_due === 0 && row(R.id).status === 'review');
  const T = await post({ brand: 'T', shares: 1, start: today(), months: 1 });
  env.DB.raw.prepare('UPDATE bookings SET start_day = ?, end_day = ? WHERE id = ?').run(shift(-10), shift(20), T.id);
  await act(T.id, 'approve'); await act(T.id, 'paid');
  const adm = await (await call(env, '/api/admin/data', { headers: admin })).json();
  check('admin data gives the refund if cancelled now', adm.bookings.find((b) => b.id === T.id).refundIfCancelled === Math.floor(T.amount * 19 / 30));
  await act(T.id, 'cancel', { why: 'breach' });
  check('taken down for a policy breach: no refund', row(T.id).status === 'cancelled' && row(T.id).cancelled_by === 'owner' && row(T.id).refund_due === 0);
  await act(R.id, 'approve');
  await act(R.id, 'cancel', { why: 'other' });
  check('cancelled by us before the start, not their fault: full refund', row(R.id).refund_due === R.amount);

  // setting and sending refunds
  check('a refund larger than the price is refused', (await act(T.id, 'refund', { amount: T.amount + 1 })).status === 400);
  check('the owner sets a refund by hand (days lost to our fault)', (await act(T.id, 'refund', { amount: 2000, note: '2 days down' })).status === 200 && row(T.id).refund_due === 2000 && row(T.id).refund_note === '2 days down');
  check('mark refund sent', (await act(T.id, 'refunded', { ref: 'RF-1' })).status === 200 && row(T.id).refunded === 2000 && row(T.id).refund_ref === 'RF-1');
  check('nothing more owed: marking it sent again is refused', (await act(T.id, 'refunded')).status === 409);
  check('a refund cannot drop below what was already sent', (await act(T.id, 'refund', { amount: 1000 })).status === 409);
  const sp2 = await (await call(env, `/status/${T.token}`)).text();
  check('status page shows the refund as sent', sp2.includes('"refunded":2000') && sp2.includes('"refundRef":"RF-1"'));
  const ap = await (await call(env, '/admin', { headers: admin })).text();
  check('admin page has the refund controls', ap.includes('Mark refund sent') && ap.includes('broke the policy (no refund)') && ap.includes('Set refund'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
