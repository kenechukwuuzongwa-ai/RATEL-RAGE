# Ratel Rage: Public Web Deployment

Status (2026-10-09): **ready to upload, not yet deployed.** The production build is
generated and tested locally (see section 6). Nothing has been published to a public
URL, and no real Android phone or non-Chrome browser has run the web build yet.

---

## 1. Audit

**Entry point.** `index.html` loads, in order:
`analytics-config.js` → `src/analytics.js` → `src/webshell.js` → `src/touch.js`, then
the ES module `src/game.js`, which imports `frontend.js`, `aftermath.js`, `story.js`,
`playarea.js` and `worldConfig.js`.

**Dependencies.** None at runtime beyond the browser: plain Canvas 2D, Web Audio,
`<video>`/`<audio>`, ES modules. Montserrat is self-hosted (`frontend/fonts`), and
lottie-web is vendored (`frontend/ui/lottie`). No CDN, no npm packages, no bundler.

**Assets.** `layers/`, `sprites/`, `sounds/`, `music/`, `frontend/` (fonts, menu, splash,
intro, UI, audio), `buildings/`, `level1/`. Every path is relative and resolved
against the module (`new URL('../' + path, import.meta.url)`), so the game runs from
any folder or sub-path of a static host.

**Can it be static-hosted?** Yes. It needs no server code, only correct MIME types,
HTTP Range support for the media and HTTPS. Note: Cloudflare Pages answered every
Range request with a full `200` (no `206`) when tested on 2026-10-09; see section 4.

### Blockers found, and what was done

| # | Blocker | Effect on the public web | Fix |
|---|---------|--------------------------|-----|
| 1 | The game treats *any* Android user agent as "the phone build". It asks for files that only exist inside the APK (`darki-idle-mobile.png`, `intro-mobile.mp4`, `studio-splash-mobile.mp4`) and draws the sky and background plates at 2x, assuming the APK's half-size copies | Android Chrome would get 404s, and the backdrop would be drawn at double size | The web build ships the phone files, plus the phone copies of the plates and sheets under `lowres/`. `game.js` points Android browsers there and desktop keeps full resolution |
| 2 | On wide Android screens the shell was forced to `100vw x 100vh` | In a browser, the address bar makes the window a different shape from the screen, so the game **stretched** | Outside the app, the shell keeps the game's exact view shape and letterboxes. Fullscreen (first tap) fills the screen. The app is unchanged |
| 3 | `frontend/intro/Intro.mp4` is 67 MB | Over Cloudflare Pages' 25 MiB-per-file limit, and a 67 MB wait before the intro | The web build ships the 720p transcode (7.6 MB) under the same name. The game renders at 1280x720. `--full-intro` keeps the 1080p master |
| 4 | Authoring tools are live for every desktop visitor: the ASSETS vehicle mover, the F2 region editor, the F3 mover, the F7 grade cycle | The public can move scenery and open editor panels | Hidden in the web build (`RR_WEB.production`). `?debug` on the URL brings them back. The editor's Play and the APK are unchanged |
| 5 | One failed image download stalls the whole load, leaving the player on an error line with no way out | A flaky phone connection means a dead game | Images retry 3 times. A file that still fails shows "THE STREETS DID NOT LOAD", the file name, and a TRY AGAIN button |
| 6 | Page gestures were only blocked on the canvas | Pinch-zoom, pull-to-refresh, text selection and long-press menus around the touch buttons | Blocked page-wide (CSS + `webshell.js`), and the viewport is non-zoomable |
| 7 | A phone held upright gets a tiny letterboxed game | Looks broken | A "TURN YOUR PHONE SIDEWAYS" screen in portrait. Fullscreen + landscape lock on the first tap (Android Chrome) |
| 8 | `index.html` title was double-encoded (`RATEL RAGE â€” The Street Tax`) | Garbled browser tab title | Fixed |
| 9 | No favicon | A 404 on every visit, and a blank tab icon | `favicon.png` (the app's launcher art) |

### Not code: decisions before going public

* **Real brands on the billboards and shopfronts: done (2026-10-09).** BET9JA (two
  signs) became KOBOBET, NAIJA WIN became SURE BANKER, STAR LAGER became AGBERO LAGER,
  and the Miva University billboard (board-1) became a "Ratel Open University" advert
  using the ratel from the title art. Repainted in `layers/level-main.png` (and its phone
  copy in `mobile/assets-mobile/layers/`) and `layers/adverts/board-1.png` by
  `_chromakey/_brand/signs.js`, which re-reads the originals from `_chromakey/_brand/backup/`.
  Still in the art and NOT changed: the political murals and vehicle wraps that name or
  show real politicians and parties. That is a content call for the owner, not a brand swap.
* **Age gate** (the plan's 18+ choice) is not built.
* **iPhone/iPad** are not a target of this pass. Without the Android code path they get
  the desktop-resolution art, which may exceed Safari's canvas memory on older
  iPhones. They also have no fullscreen API for pages.
* **Download size:** about 379 MB total, of which roughly 200-250 MB is fetched before
  the first fight (the world loads behind the menus). That is heavy on mobile data
  and is the biggest remaining performance item (section 7).

---

## 2. Modified and added files

| File | Change |
|------|--------|
| `index.html` | Fixed title/loading text encoding. Non-zoomable viewport, favicon, description. "Rotate" screen. Loads `analytics-config.js`, `src/analytics.js`, `src/webshell.js` |
| `styles.css` | Page-wide gesture/selection blocking, dynamic-viewport (`dvh`) sizing for mobile address bars, the load-failure panel, the portrait prompt |
| `src/game.js` | `LOWRES` + `assetPath()` (Android browsers use `lowres/`). Image retries (3 tries). `showLoadFailure()` (message + TRY AGAIN). `DEV_TOOLS` gate on the ASSETS panel and F2/F3/F7. Analytics calls: `level_start`, `game_over`, `retry`, `quit`, `level_complete`, `load_error` |
| `src/touch.js` | Wide-phone shell: keeps the view's aspect ratio in a browser, fills the screen in the app |
| `src/webshell.js` **(new)** | Browser-only: blocks context menu, double-tap and pinch gestures; fullscreen + landscape lock on first tap on touch devices; does nothing inside the Capacitor app |
| `src/analytics.js` **(new)** | Optional analytics client (section 8). A no-op when not configured |
| `analytics-config.js` **(new)** | Analytics switch. Off by default (empty `endpoint`) |
| `favicon.png` **(new)** | Copy of the Android launcher icon |
| `deploy/build-web.js` **(new)** | Builds the public site into `deploy/dist/` |
| `mobile/build-demo.js` | Also packages `analytics-config.js` and `favicon.png` (index.html references them) |
| `_chromakey/webverify.js` **(new)** | Local production test (section 6) |

Gameplay, animation, combat, audio, levels, UI and controls code paths are untouched.
The only in-game differences in the public build are the hidden authoring tools and
the 720p intro.

---

## 3. Build the site

Requires Node 18 or newer. From the project folder (`RAGE OF RATELS/`):

```
node deploy/build-web.js            # -> deploy/dist/  (329 files, ~379 MB)
node deploy/build-web.js --full-intro   # keep the 67 MB 1080p intro (NOT for Cloudflare Pages)
```

`deploy/dist/` is the whole site: `index.html` at its root, plus `_headers` (cache and
security headers for Cloudflare Pages / Netlify) and `build-info.json` (what went in).
The script warns if any file is over 25 MiB. If the phone art is regenerated
(`mobile/gen-mobile-assets.js`), rebuild. Bump the `?v=` tags in `index.html` and the
`frontend.js` import in `game.js` on each release, as for the APK, so browsers
fetch the new code.

---

## 4. Deploy

### Recommended: Cloudflare Pages (direct HTTPS URL, honours `_headers`)

The WEB site (`../WEB`) is built for Cloudflare (Workers + D1/R2) but is not deployed
there yet; its only live copy is a static GitHub Pages preview. Hosting the game on
Cloudflare too keeps both in one account once the site moves there.

1. Install Wrangler and log in once: `npm i -g wrangler`, then `wrangler login`.
2. Upload:
   ```
   wrangler pages deploy deploy/dist --project-name ratel-rage
   ```
   The game is live at `https://ratel-rage.pages.dev`, and each later run publishes a
   new version (add `--branch main --commit-dirty=true`: the folder is not a git checkout).
3. Optional: a custom domain under Pages → *Custom domains* (HTTPS is automatic).

**What happened on the first deploy (2026-10-09, Wrangler 4.149):** Wrangler now hands
Pages commands to Cloudflare Workers, and `pages project create` failed there for want
of a Worker config. The project was created once with
`wrangler pages project create ratel-rage --production-branch main --force` (classic
Pages); later deploys go straight to Pages without `--force`. Deployed: 333 files plus
`_headers`. Live checks: the page, plates and scripts return 200, the security and
cache headers are applied, the live plate is byte-identical to the repainted one, and
headless Chrome boots the live URL to the studio splash with no failed requests and
no page or console errors.

**Known gap: no byte ranges.** Every `Range:` request (curl and Chrome, mp3/mp4/png)
came back `200` with the whole file, never `206`. Chrome plays it, as the boot showed,
but seeking inside a track refetches from the start (the trap in the music keep-alive
notes), and Safari/iOS is known to be strict about 206 for video. Not yet tested on a
real phone. If it bites: serve the media from R2 or Workers static assets and check
they return 206.

Cloudflare Pages limits to keep in mind: 25 MiB per file (met: largest is about 15 MB)
and 20,000 files per site (we have 329). Check the current limits in Cloudflare's docs
before relying on them.

### Alternative: itch.io (the plan's "feedback build")

1. Zip the **contents** of `deploy/dist` so that `index.html` sits at the root of the zip:
   ```powershell
   Compress-Archive -Path "deploy\dist\*" -DestinationPath "ratel-rage-web.zip"
   ```
2. On itch.io: *Create new project* → Kind of project **HTML** → upload the zip → tick
   "This file will be played in the browser".
3. Embed options: viewport **1280 x 720**, tick **Mobile friendly** (orientation
   *Landscape*), tick **Fullscreen button**, and enable scrollbars **off**.
4. itch.io has its own HTML5 limits (total extracted size, file count, per-file size).
   Check them against `build-info.json` before uploading. `_headers` is ignored there.
   The game runs in an iframe on itch.zone, so the browser's own fullscreen
   button is the itch one.

### Other static hosts

Netlify (drag `deploy/dist` onto app.netlify.com/drop; `_headers` works), GitHub Pages,
Firebase Hosting, S3 + CloudFront: any of them works as long as `.mp4` is served as
`video/mp4` with Range support and `.js` as JavaScript. File names are
**case-sensitive** on all of them. The local test already checks every request with
exact case.

### After deploying: verify on the real URL

* **Desktop** (Chrome, Edge, Firefox; Safari if available): title, TAP/PRESS to enter,
  the menu music after the first click, start Level 1, the intro, a fight, pause,
  game over → RETRY. Browser console: no red errors. DevTools → Network: no 404s.
  The window resized narrow/wide stays letterboxed and never stretches.
* **Android Chrome** (a real mid-range phone, on mobile data as well as Wi-Fi):
  * The first tap goes fullscreen and landscape.
  * Turning the phone upright shows the prompt.
  * The touch controls work, with no zoom or scroll when mashing buttons.
  * Audio starts after the first tap.
  * The intro plays.
  * Note the time from first tap to the first fight, and whether the fight is smooth.
* Remote debugging for the phone: `chrome://inspect` on the desktop with USB debugging on.

---

## 5. Controls

* **Keyboard/mouse:** unchanged (see the in-game hint line and CONTROLS screen).
* **Touch:** unchanged (`src/touch.js` HUD, customisable from the pause menu).
* **Gamepad:** unchanged.

---

## 6. Test report (local production test)

`_chromakey/webverify.js` serves `deploy/dist` through Chrome's request interception
acting as a strict static host:
* https origin
* case-sensitive paths
* real MIME types
* HTTP 206 Range for media
* 404 for anything missing

No server process is started.

| Scenario | Checks | Result |
|---|---|---|
| Desktop 1280x720 | Clean title. Zero 404s on a case-sensitive host. No other origins contacted. No page/console errors. Full-res art only. 16:9 and letterboxed at 1600x1000, never stretched. Authoring tools absent, F3 inert. Analytics silent by default. Audio context running after the first click. Reaches gameplay through the game's own RETRY path | **pass (11/11)** |
| Android Chrome emulation (Pixel 7 class, 915x412 screen, address bar showing, touch, DPR 2.625) | Zero 404s. No errors. Phone art served (40 lowres files, never the full-res sky/background). The phone-only files resolve. Coarse pointer detected. Page gestures off. **Not stretched** with the address bar (the shell letterboxes to 2.222:1). Fullscreen fills 915x412 exactly. Audio running after the first tap. Touch HUD up in gameplay | **pass** |
| Android held upright | Rotate prompt shown | **pass** |
| Failed loads | A request that fails once is retried and the game loads. A file that never arrives is tried 3 times, then the message + TRY AGAIN shows. No uncaught errors | **pass** |
| Analytics configured | `session_start`, `perf_boot`, `perf_world`, `js_error`, `session_resume`, `level_start`, `game_over`, `retry` all arrive. One session across the game's reload. One anonymous ID. Device/browser as categories, no raw user-agent | **pass** |
| Analytics endpoint down | The game loads and runs, with no page errors | **pass** |

Measured in that headless run:

| | Desktop | Android emulation |
|---|---|---|
| First screen up (`__rorBootMs`) | 0.3-0.55 s | 0.2-0.4 s |
| World fully prepared | ~80 s | ~47 s |
| JS heap after load (canvas memory is extra) | ~154 MB | ~108-135 MB |

**What these numbers are not.** The test machine renders with SwiftShader (software
GPU), so frame rates of about 24 fps on desktop, and about 5 fps under 4x CPU
throttling, measure the test rig, not a phone. Load times come from local disk with
no network. Treat them as relative figures only.

**Not tested (must be done on real hardware/the real URL):**
* Real Android Chrome performance and memory.
* Firefox and Safari.
* iOS.
* The real autoplay gesture rule: headless Chrome does not enforce it, so audio
  read "running" even before the click.
* Fullscreen and orientation lock: headless has no real fullscreen; the test resized
  the window to the screen instead.
* The `level_complete` event, which needs a full boss win.
* Download time on mobile data.
* The deployed URL itself.

---

## 7. Performance notes for mid-range Android

Already in the build:
* Phone-sized plates and sheets (the same set the APK runs on).
* World prep on a CPU raster (`willReadFrequently`) on Android.
* Backing store capped at 2x DPR.
* The world streams in behind the menus.
* A 720p intro and splash.

Next steps, in order of value:
1. **Regenerate the phone art.** `mobile/assets-mobile` dates from 2026-09-16, so every
   sheet added since (all the machete/bat/Aye/tornado sheets, 7168 px wide and more) is
   served to phones at desktop size. Re-run `mobile/gen-mobile-assets.js` after checking
   its 1280 px cap against the newer sheets' cell sizes (the tornado's 14-column grid
   would drop to 91 px cells at that cap, too soft to use as-is).
2. **WebP for the big PNG sheets.** This roughly halves the download; it is a pipeline
   change, not a code change.
3. **Service worker cache,** so a second visit loads from disk.

---

## 8. Analytics

**Cloudflare Web Analytics (on since 2026-10-10):** `deploy/build-web.js` adds Cloudflare's beacon
(token in `CF_BEACON_TOKEN`) before `</body>` of the WEB build only; the APK and local runs never
load it, and `--no-beacon` leaves it out. It counts visits and page views (Cloudflare dashboard →
Analytics & Logs → Web Analytics → ratel-rage.pages.dev). It knows nothing about gameplay; that is
the game's own analytics below. webverify answers the beacon with an empty script and checks it loads.

### Switching it on
Edit `analytics-config.js` in the deployed site (no rebuild needed):
```js
window.RR_ANALYTICS = { endpoint: 'https://stats.example.com/e', anonymousId: true, sampleRate: 1 };
```
Empty `endpoint` = off. Analytics never blocks the game. Failed sends are dropped.

### What it records

**Context, once per batch:**
* build
* platform (`web` or `android-app`)
* device category (`desktop`, `mobile`, `tablet`)
* browser family + major version
* OS family + version
* language subtag
* window size
* device pixel ratio
* device memory class and CPU cores

**Events:**

| Event | When | Properties |
|---|---|---|
| `session_start` / `session_resume` | page load (resume = the game's own reload inside the same tab session) | `reload` |
| `session_ping` | every 60 s while visible, and when the tab hides | `seconds` since session start |
| `level_start` | gameplay begins | `level`, `difficulty` |
| `game_over` | Darki is KO'd (a death) | `level`, `section`, `time`, `kos`, `maxCombo`, `boss` |
| `retry` / `quit` | RETRY / GIVE UP / QUIT TO MENU chosen | `level`, `from` |
| `level_complete` | the post-boss aftermath starts | `level`, `difficulty`, `time`, `score`, `rank`, `kos`, `hp` |
| `perf_boot` / `perf_world` | first screen up / world prepared | `ms` |
| `perf_fps` | once a minute while visible (max 15) | `fps`, `slow_frames`, `heap_mb` |
| `js_error` / `asset_error` / `load_error` | runtime error / failed DOM resource / failed game load | message (200 chars), file name, line |

**Identity and privacy:**
* `sid` is a random ID per browser tab session.
* `aid` is a random anonymous player ID in `localStorage`, only when `anonymousId` is
  true and the browser does not send Do Not Track or Global Privacy Control.
* Nothing else identifies a person: no names, emails, accounts, location or full
  user-agent string.
* If you serve players in the EU/UK, set `anonymousId: false` until a consent prompt
  exists. Nigeria's NDPA also expects a privacy notice on the page that links the game.

**Built and live (2026-10-10): see `docs/STATS.md`.** The game reports to the rr-stats Worker, which uses
D1 instead of Analytics Engine, with a private dashboard at
https://rr-stats.kenechukwuuzongwa.workers.dev/dashboard. The design below is kept for reference.

### Receiving it: a Cloudflare Worker + Analytics Engine (fits the launch plan)

1. In Cloudflare: *Workers & Pages* → create a Worker `rr-stats`. In
   `wrangler.toml`, add an Analytics Engine dataset binding:
   ```toml
   [[analytics_engine_datasets]]
   binding = "RR"
   dataset = "rr_events"
   ```
2. Worker code:
   ```js
   export default {
     async fetch(req, env) {
       const cors = { 'Access-Control-Allow-Origin': '*' };
       if (req.method !== 'POST') return new Response('ok', { headers: cors });
       let body; try { body = JSON.parse(await req.text()); } catch { return new Response(null, { status: 400, headers: cors }); }
       const c = body.ctx || {};
       for (const ev of (body.events || []).slice(0, 100)) {
         const p = ev.p || {};
         env.RR.writeDataPoint({
           indexes: [String(ev.sid || '')],
           blobs: [ev.e, ev.sid, ev.aid || '', c.platform, c.device, c.browser, c.os, String(p.level ?? ''), c.build, String(p.msg || '')],
           doubles: [ev.t, p.seconds || 0, p.ms || 0, p.fps || 0, p.score || 0, p.time || 0],
         });
       }
       return new Response(null, { status: 204, headers: cors });
     },
   };
   ```
   It does not store IP addresses.
3. Put the Worker's URL in `analytics-config.js` as `endpoint`.
4. Query with the Analytics Engine SQL API (blob1 = event, blob2 = session,
   blob3 = player, blob4 = platform, blob5 = device). Analytics Engine samples at high
   volume, so weight counts with `_sample_interval`:
   * **Sessions per day:**
     `SELECT toStartOfDay(timestamp) AS day, SUM(_sample_interval) AS sessions FROM rr_events WHERE blob1 = 'session_start' GROUP BY day ORDER BY day`
   * **Unique players in the last 7 days:**
     `SELECT COUNT(DISTINCT blob3) FROM rr_events WHERE blob3 != '' AND timestamp > NOW() - INTERVAL '7' DAY`
   * **Online now** (a session pinged in the last 3 minutes):
     `SELECT COUNT(DISTINCT blob2) FROM rr_events WHERE timestamp > NOW() - INTERVAL '3' MINUTE`
   * **Level funnel:** count `level_start` vs `level_complete` vs `game_over` by `blob8` (level).
   * **Retries per death:** `retry` / `game_over`.
   * **Session length:** per `blob2`, the max of `double2` (seconds) from `session_ping`.
   * **Devices and browsers:** group `session_start` by `blob5`, `blob6`.
   * **Errors:** `js_error` / `load_error` grouped by `blob10` (message).

   This answers request 362 (how many are online, and how many played in a period). The
   same Worker can later feed the in-game "street stats" the launch plan describes.

### Alternative: GameAnalytics (the plan's private dashboard)

Add their JavaScript SDK to `index.html`, initialise it with your game key/secret, and
forward events by wrapping `RRAnalytics.track`. For example, `level_start` →
`addProgressionEvent(Start, 'level' + level)`, `level_complete` → `Complete`, and
`game_over` → `Fail`. GameAnalytics handles users/sessions/devices itself. Keep the
same no-PII rule.

---

## 9. Re-running the local test

```
node deploy/build-web.js
cd ../_chromakey && node webverify.js all     # or: desktop | android | portrait | failure | analytics
```
Screenshots land in `_chromakey/webshots/`.
