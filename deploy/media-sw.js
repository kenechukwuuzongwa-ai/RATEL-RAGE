/* Ratel Rage — MEDIA CACHE service worker (web build only; request 537).
 *
 * Copied to the site root by deploy/build-web.js, which also adds the one-line
 * registration to index.html. The APK and the editor preview never load it.
 *
 * WHY IT EXISTS. Chrome keeps images in its HTTP cache but never audio/* or
 * video/* responses (proved with identical bytes under four Content-Types,
 * _chromakey/req535/cacheprobe3.js). So every reload and every return visit
 * downloaded every sound, the music and the 10 MB menu video again, whatever
 * _headers said. Cache Storage has no such rule, so this worker keeps them there.
 *
 * WHAT IT DOES, for same-origin .mp3/.wav/.ogg/.m4a/.mp4/.webm GETs only (all
 * other requests, and the story cuts under frontend/intro/, are not touched):
 *   cached   -> one conditional request (If-None-Match) per file per worker
 *               life: 304 serves the saved copy (a few hundred bytes on the
 *               wire), 200 replaces it (a new deploy), no network serves the
 *               saved copy. Range requests (<video>/<audio>) are cut from it.
 *   missing  -> fetched once and saved while it plays: the body is teed, one
 *               branch to the page, one to the cache, so the first visit does
 *               not download anything twice. A <video>'s opening "bytes=0-"
 *               gets the whole file back as a 206 so it stays seekable.
 * A file saved under an old ?v= query is dropped when its new one is saved. */
const CACHE = 'ror-media-v1';
const MEDIA = /\.(mp3|wav|ogg|m4a|mp4|webm)$/i;
/* The story cuts (7.6-16.8 MB) are watched once and often skipped: saving one
 * means downloading all of it, so they keep streaming straight from the network. */
const STREAM_ONLY = /^\/frontend\/intro\//i;
const VALIDATE_MS = 4000;              // past this a revalidation gives up and the saved copy plays

const validated = new Set();           // URLs checked against the server in this worker's life
const inflight = new Map();            // URL -> Promise of the cache.put for a first download

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('ror-media-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !MEDIA.test(url.pathname) || STREAM_ONLY.test(url.pathname)) return;
  e.respondWith(serve(req, url).catch(() => fetch(req)));
});

async function serve(req, url) {
  const cache = await caches.open(CACHE);
  const key = url.href;
  const range = parseRange(req.headers.get('range'));
  let hit = await cache.match(key);
  if (hit && !validated.has(key)) hit = await revalidate(cache, key, hit);
  if (hit) return range ? slice(hit, range) : hit;

  // Not saved yet. A partial request we cannot answer from a whole file goes
  // straight through (a seek during the first download, a bounded range).
  if (range && !(range.start === 0 && range.end == null)) return fetch(req);
  if (inflight.has(key)) {
    if (range) return fetch(req);
    await inflight.get(key).catch(() => {});
    const now = await cache.match(key);
    return now || fetch(req);
  }
  const res = await fetch(key, { cache: 'no-store', credentials: 'same-origin' });
  const len = +res.headers.get('content-length');
  if (res.status !== 200 || !res.body || (range && !len)) return res;
  const [toPage, toCache] = res.body.tee();
  const saved = cache.put(key, new Response(toCache, { status: 200, statusText: res.statusText, headers: res.headers }))
    .then(() => { validated.add(key); return dropOldVersions(cache, url); })
    .finally(() => inflight.delete(key));
  inflight.set(key, saved);
  saved.catch(() => {});
  if (!range) return new Response(toPage, { status: 200, statusText: res.statusText, headers: res.headers });
  const h = new Headers(res.headers);
  h.set('Content-Range', `bytes 0-${len - 1}/${len}`);
  h.set('Accept-Ranges', 'bytes');
  return new Response(toPage, { status: 206, statusText: 'Partial Content', headers: h });
}

async function revalidate(cache, key, hit) {
  const etag = hit.headers.get('etag');
  if (!etag) { validated.add(key); return hit; }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), VALIDATE_MS);
  try {
    const res = await fetch(key, { cache: 'no-store', credentials: 'same-origin', headers: { 'If-None-Match': etag }, signal: ctl.signal });
    validated.add(key);
    if (res.status === 304) return hit;
    if (res.status === 200) {
      // A new deploy changed the file: save it and play the new one.
      await cache.put(key, res.clone());
      return res;
    }
    return hit;                        // 404/5xx: keep playing what we have
  } catch {
    return hit;                        // offline or slow: the saved copy plays
  } finally { clearTimeout(timer); }
}

async function dropOldVersions(cache, url) {
  for (const r of await cache.keys()) {
    const u = new URL(r.url);
    if (u.pathname === url.pathname && u.search !== url.search) await cache.delete(r);
  }
}

function parseRange(h) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((h || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') return { suffix: +m[2] };
  return { start: +m[1], end: m[2] === '' ? null : +m[2] };
}

async function slice(hit, r) {
  const blob = await hit.blob();
  const size = blob.size;
  let start = r.suffix != null ? Math.max(0, size - r.suffix) : r.start;
  let end = r.suffix != null || r.end == null ? size - 1 : Math.min(r.end, size - 1);
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const h = new Headers(hit.headers);
  h.set('Content-Range', `bytes ${start}-${end}/${size}`);
  h.set('Content-Length', String(end - start + 1));
  h.set('Accept-Ranges', 'bytes');
  return new Response(blob.slice(start, end + 1, h.get('content-type') || ''), { status: 206, statusText: 'Partial Content', headers: h });
}

/* ---- RETURN REMINDERS (request 644) ---------------------------------------------------------------------
 * rr-push (push/worker.js) sends an EMPTY, signed push to a player who has been away (10+ hours, at most one
 * per 20 hours, in their daytime). This worker turns it into the notification: one of the lines below, the
 * ratel logo on a transparent ground as the icon, a white R as Android's status-bar badge. Tapping it opens
 * the game (or brings an open one forward). Lines rotate so the same one never shows twice running. */
const PUSH_API = 'https://rr-push.kenechukwuuzongwa.workers.dev';
const VAPID_PUBLIC = 'BG4RUld2t-Cxm8B2qxZLDtskQGCHvHEUt5TEVI4H9J6LIbN8GHsxqjHl-UQ8hPwgWIJk2CjEgNfraai9BYOMqWo';
const RETURN_LINES = [
  ['AGBEROS ON BALOGUN STREET', 'They are taxing the traders again. No receipt, no mercy. Darki, the streets need you.'],
  ['THE MOTOR PARK IS PAYING', 'MC Olodo\'s boys are collecting "levy" from every bus. Are you going to let them?'],
  ['A TRADER JUST PAID DOUBLE', 'The street tax went up while you were away. Come and cancel it.'],
  ['LAGOS NO BE FOR THE WEAK', 'The Agberos think you have gone soft. Prove them wrong.'],
  ['YOUR COMBO IS GETTING COLD', 'Your best run is waiting to be beaten. Faster this time.'],
  ['THE CABAL IS WATCHING', 'Evidence is piling up and the bosses are moving. Get back on the case.'],
  ['MAMA PUT GOT SHAKEN DOWN', 'They took her day\'s sales "for protection". Ratel, it is time.'],
];
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let i = 0;
    try {
      const c = await caches.open('ror-push-v1');
      const r = await c.match('/__line');
      i = ((r ? +(await r.text()) : Math.floor(Math.random() * RETURN_LINES.length)) + 1) % RETURN_LINES.length;
      await c.put('/__line', new Response(String(i)));
    } catch (err) { i = Math.floor(Math.random() * RETURN_LINES.length); }
    const [title, body] = RETURN_LINES[i];
    await self.registration.showNotification(title, {
      body,
      icon: 'frontend/icons/notify-192.png',
      badge: 'frontend/icons/badge-96.png',
      tag: 'rr-return', renotify: true,
      data: { url: './?from=reminder' },
    });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of open) if (new URL(c.url).origin === self.location.origin && 'focus' in c) return c.focus();
    return self.clients.openWindow(url);
  })());
});
// a push service may rotate the subscription: take the new one and tell rr-push, so reminders keep arriving
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const old = e.oldSubscription && e.oldSubscription.endpoint;
    const sub = e.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC });
    const post = (p, endpoint, extra) => fetch(PUSH_API + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ endpoint }, extra || {})) }).catch(() => {});
    if (old) await post('/unsub', old);
    await post('/sub', sub.endpoint, { tz: -new Date().getTimezoneOffset() });
  })());
});
