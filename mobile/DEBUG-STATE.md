# RATEL RAGE — ANDROID PACKAGING: DEBUG STATE & HANDOFF

**Date:** 2026-09-13
**Purpose:** A complete handoff document for debugging the Android investor-demo build
on another platform/machine/agent. Read this before touching anything.

---

## 0. STANDING SAFEGUARDS (binding on any further work)

1. A complete rollback checkpoint exists — see §6. Restore from it before any risky move.
2. Existing game source must remain functional on desktop/web. Do **not** modify,
   delete, rename, restructure or overwrite game source files unless absolutely
   technically necessary. So far, the entire packaging effort has touched exactly
   **two game files, a handful of added lines** (see §5).
3. All Android packaging work lives under `mobile/`. Keep it there.
4. The touch layer (Option A) is **additive** and drives the existing centralized
   `input` path by dispatching the same synthetic events a keyboard/mouse would
   produce. It must not rewrite the combat/input system and must not break
   keyboard or Gamepad API controls.
5. The first debug APK predates any optimization. Goal order: prove Level 1 runs
   on a phone → *then* optimize, *then* release-sign.
6. The APK must work fully offline. Audited: zero `http(s)://` URLs in shipped
   code; every runtime-fetched path resolves inside the package. INTERNET
   permission is **removed**.
7. No lossy conversion of original assets. Optimized copies are generated into
   `mobile/assets-mobile/` only. Originals in `layers/` and `sprites/` untouched.
8. Measure Android memory/performance **before** optimizing the big plates.
   The level plates are 9259×1124 (~41.6MB RGBA each when decoded).
9. Landscape orientation only; the game's 16:9 letterbox presentation is preserved
   by design (black side-bars on taller screens are EXPECTED and correct).
10. No changes to gameplay, AI, combat, animations, level design, story, character
    behaviour, or existing visual assets are permitted as part of packaging.
11. **No release keystore yet.** Debug APK first; release signing/AAB after phone
    validation.
12. Report after every major stage: files created / modified / deleted (none) /
    commands / build status / risks.

---

## 1. PROJECT SNAPSHOT

### 1.1 Engine
- Hand-rolled **HTML5 Canvas 2D** engine. No game engine, no framework, no bundler,
  **zero runtime dependencies**.
- `src/game.js` (~17,000 lines, ~883KB ES module) — the entire game.
- `src/frontend.js` (~246KB) — menu/level-select front end (pointer-event driven,
  video backgrounds, own canvas work).
- Support modules: `src/aftermath.js`, `src/playarea.js`, `src/story.js`,
  `src/worldConfig.js`.
- Audio: WebAudio (`AudioContext` + `decodeAudioData` via fetch), unlocked by
  `resumeAudio()` on the first interaction (already mobile-correct).
- Video: `<video>` elements (`muted autoplay playsinline`) — menu loop
  `frontend/menu/uibg2.mp4`, splash `frontend/splash/studio-splash.mp4`, intro
  `frontend/intro/Intro.mp4` (~70MB).
- Fonts: self-hosted Montserrat woff2.

### 1.2 Geometry / rendering
- Virtual space: **1280×720** (16:9), one canvas `#game` in a CSS shell
  `min(100vw, 100vh*16/9)` (letterbox).
- Backing store: `syncBacking()` per frame — backing = CSS size × DPR, capped
  **2× / max 2560px wide**; `baseScale()` maps the virtual space onto it.
- Scene zoom `tune.zoom = 1.2` as a canvas transform; HUD drawn outside it.
- World constants: `WORLD_W = 9259`, `WORLD_H = 1124`, `WORLD_STEPS = 39`.
- Load: `loadWorld()` = **one `Promise.all` over 39 tracked items** —
  35 `loadSpriteFrames(...)` sheet preps + 4 `loadImage(...)` plate decodes
  (level-sky / level-background / level-main / level-vehicles, each 9259×1124).
  Progress % = landed items / 39. The **de-spill** (green-screen fringe cleanup)
  runs *after* all 39 land, per plate, in the prep lane.

### 1.3 Sprite-prep cost (the phone stall mechanism)
`prepSpriteFrames()` per sheet:
- `img.decode()` — the sheet's full bitmap decodes at full resolution.
- A **canvas + full `getImageData` readback per frame** (pass 1: key-out +
  bounding-box measurement), count = cols×rows (the boss stance: 81 frames).
- Several Darki sheets are **8192×6704 (≈219MB RGBA decoded, ≈55Mpx)**; the
  execution sheets are 5356×2256.
- The engine's own comment documents the killer: under memory pressure,
  individual readbacks "swing by whole seconds" (measured 1887ms for a 0.07Mpx
  canvas against a ~6ms mean).

### 1.4 Memory math (why a phone stalls)
| Asset class | Compressed on disk | Decoded RGBA in memory |
|---|---|---|
| 35 sprite sheets | ~119MB | **~300-500MB** (some single sheets ≈219MB) |
| 4 level plates | ~66MB | **~166MB** (4 in parallel at load start) |
| Front end canvases/videos | — | ~30-60MB |
| **Total** | **~250MB files** | **~500-700MB** |

A phone's Chromium renderer budget is roughly **256MB (low-RAM devices) to
512MB-1GB (modern flagships)**. Mid-range phones therefore exhaust the budget
during the sheet prep stage, allocations fail/evict, the image cache thrashes,
and the load crawls — observed as a frozen percentage.

---

## 2. PACKAGING STATE (what exists now)

### 2.1 The `mobile/` shell (all packaging is isolated here)
```
mobile/
  package.json              # capacitor core/cli/android ^6.2.1 (devDeps)
  capacitor.config.json     # appId com.ratelrage.demo · webDir www · androidScheme https
  build-demo.js             # cleans www/, copies the WEB ROOT by ALLOWLIST,
                            # overlays assets-mobile/ (downscaled set) if present
  gen-mobile-assets.js      # generates assets-mobile/ (downscaled plates/sheets)
  assets-mobile/            # GENERATED mobile-only assets (originals untouched)
    layers/                 # level-sky/background/main at 50% (4630×562)
    sprites/                # 43 sheets: longest side capped at 1536 (+ metas copied)
  www/                      # GENERATED web copy (325MB allowlist + overlay)
  android/                  # the Capacitor Android project (npx cap add android)
    app/build/outputs/apk/debug/app-debug.apk
    app/src/main/AndroidManifest.xml   # landscape lock, keepScreenOn, NO INTERNET
    app/src/main/res/values/styles.xml # windowFullscreen + cutout shortEdges
  build-log.txt             # gradle log
  toolchain (outside project): C:\Users\kenec\AndroidDev\
    jdk-17.0.20.1+1\        # portable Temurin JDK
    android-sdk\            # platform-tools, platforms;android-34, build-tools;34.0.0
```

### 2.2 Build pipeline (the exact commands, from the project root)
```powershell
# 1. generate mobile assets (only after art changes)
cd mobile; node gen-mobile-assets.js

# 2. copy web root -> www (allowlist) + overlay mobile assets
node build-demo.js

# 3. sync into the android project
npx cap sync android

# 4. build the debug APK  (cd INSIDE the command — see the path trap below)
cmd /c "set JAVA_HOME=C:\Users\kenec\AndroidDev\jdk-17.0.20.1+1&& set ANDROID_HOME=C:\Users\kenec\AndroidDev\android-sdk&& cd android&& gradlew.bat clean assembleDebug --console=plain --no-daemon > build-log.txt 2>&1"
```
**PATH TRAP (cost an hour):** `cmd /c` must `cd android` *inside the command
string*. Running `gradlew.bat` from `mobile/` fails silently and the tail you
read belongs to a **previous successful log** — always check `build-log.txt`'s
freshness/timestamp and the APK's `LastWriteTime` after every build.

### 2.3 Verification after each build
```powershell
# APK exists, fresh, size
Get-Item mobile\android\app\build\outputs\apk\debug\app-debug.apk |
  Select LastWriteTime, Length

# embedded asset spot-checks (sizes prove the overlay applied)
tar -xf <apk> -C <tmp> "assets/public/layers/level-main.png"   # expect ~4.2MB
tar -xf <apk> -C <tmp> "assets/public/sprites/darki-walk.png"  # expect ~0.8MB
tar -xf <apk> -C <tmp> "assets/public/src/touch.js"            # expect current

# permissions: must be NO android.permission.INTERNET
aapt dump permissions <apk>
```

### 2.4 Asset-size reference (after the mobile pass v3, 22:16 build)
| File | Source | Mobile |
|---|---|---|
| level-main.png | 15.2MB (decodes ~41MB) | 4.2MB |
| darki-walk.png | ~10MB (decodes ≈219MB) | 0.6MB (cell-resized; the union box is protected by the upsample guard, see below) |
| **Intro.mp4** | 67.3MB (master) | master dropped from www; **intro-mobile.mp4 7.6MB** (720p H.264 faststart, ffmpeg) ships instead, loaded on Android only |
| sheets capped | 38 of 43 at 1280px | 1 kept; 4 fixed-geometry full-res; 1 mobile idle twin |
| **APK** | 328MB | **161.6MB** (debug APK 22:16) |

### 2.5 Two rendering fixes discovered while packaging (both Android-gated)
1. **`darki-idle` memory split** — menu keeps the full sheet (fixed cell
   geometry); Android gameplay loads a 1280px twin. 110MB decoded → ~7MB.
2. **THE UPSAMPLE GUARD (the "walk cycle is smaller" bug).** With capped
   sheets, each cell (e.g. the walk's 130px) is UPSCALED into the 480px work
   canvas, and Chromium's `imageSmoothingQuality: 'high'` filter **samples
   outside the source rectangle** — the neighbouring cell's feet bled in as a
   line along the top of the frame. That inflated the shared union box, which
   the prep maps to `drawH`, so the walk drew at 132px instead of 186px
   (measured with `_chromakey/spriteheights.js`). Fix: when a cell will be
   upscaled, the source rect is inset by 2px on Android (`prepSpriteFrames`),
   keeping the filter kernel inside the cell. Post-fix measurement: walk 187,
   idle 186, combatwalk 184 — all matching the desktop build.
   Diagnostics kept: `_chromakey/spriteheights.js` (drawn-height per sheet in
   desktop vs packaged modes), `workprobe.js` (per-frame union-box probe),
   `walkcells.js`/`walkalpha.js` (per-cell ink analysis).

---

## 3. CURRENT BLOCKERS (as reported from the device)

### 3.1 Fullscreen — TRUE fullscreen shipped for BOTH renderers (2026-09-13, 17:49 build)
**What now happens on the phone:**
- **Everything fills the screen.** On Android, both the game (`VIEW_W`) and the
  front end (`W`) widen their virtual viewport to the device aspect (same rule,
  clamp 2200; height stays 720), and the shell CSS grows to `100vw/100vh`. The
  world is 9259px wide and camera-clamped, so the game's side areas show real
  street; the menus spread across the full width with their layouts still
  centred. No letterbox, no side art on wide phones.
- The old 16:9 path remains for any device narrower than 16:9 (guarded in both
  modules and the shell CSS).
- System status/navigation bars: hidden via immersive-sticky in MainActivity,
  re-armed on window focus.
**Verified:** Android-UA emulated run exercises the widened code path with no
errors; desktop unchanged (zoomverify 20/20, assetmover 18/18).

### 3.2 Sprite sheets leaking into the main menu — ROOT CAUSE FIXED (2026-09-13, 11:53 build)
**Root cause (found by inspection):** two independent bugs stacked.
1. **A TDZ ReferenceError in touch.js killed the entire touch layer on device**
   (`buildDiag()` ran before `let diagEl` was declared). No banner, no touch
   controls, no video taming, no side-fill — all silently dead from script
   start.
2. **The mobile sheet downscale broke fixed-geometry consumers.** The front
   end's main-menu Darki hard-codes `fw: 964, fh: 956, cols: 6` for
   `sprites/darki-idle.png`; the downscaled file made every cell read the
   wrong region — the looping character became a glitching tile sheet. The
   finisher sheets (`exec-*.png`) likewise have literal grids (`cw/ch`).
**Fixes shipped:**
- touch.js now declares `diagEl` before first use; verified no page errors in
  the Android-emulated repro.
- `gen-mobile-assets.js` keeps `darki-idle.png` + the three `exec-*.png`
  sheets at SOURCE SIZE (`KEEP_FULL_RES`); verified byte-identical in the
  built APK.

### 3.3 Load stuck at 15% on the "Street Tax" screen — ROOT CAUSE FOUND & FIXED (2026-09-13, 17:49 build)
**The user's screenshot named the stall: "LOADING STORY 15%".** That screen is
the FRONT END's intro preloader, not the game's world load — all earlier work on
the world pipeline was downstream of it.
**Mechanism:** `preloadIntro()` sets `introLoadProgress = 0.15` when the intro
`<video>` element is created and only advances to 1 when the video fires
`loadeddata` (readyState ≥ 2). Two compounding bugs:
1. **Regression (my own):** the Android "video taming" forced `preload='metadata'`
   on every video — metadata-only preload can never fire `loadeddata`, so the
   story gate could never pass on device.
2. **Latent bug (predates packaging):** on `error` the promise rejected an
   **un-awaited** promise; the phase machine is gated on
   `introLoadProgress >= 1`, so any failure or slow first frame parked the bar
   at 15% forever. No timeout, no fallback.
**Fixes shipped:**
- The taming is REMOVED (touch.js no longer touches video elements).
- `preloadIntro()` is now un-wedgeable: a 15s watchdog and the `error` path both
  set `introFailed = true; introLoadProgress = 1`, and the intro phase skips
  the cinematic straight to the case file when `introFailed`.
- Verified in the Android-emulated repro: front end driven through its own flow,
  `title → loading → levelTitle` completes with zero page errors.
**Future work (needs ffmpeg on the build machine — both download mirrors
truncated here):** transcode the 67MB intro to a 720p H.264 mobile twin
(~8-12MB) and load it on Android only; the source is faststart H.264/AAC, so
the master does play where the codec and storage budget allow.
**What the mobile pass already did (v2, debug APK 10:53):** all 43 sheets capped
at 1280px (the ≈219MB Darki sheets → ~3-7MB), the three opaque plates at 50%,
and a **mobile-only video preload taming** in touch.js (the front end's videos —
including the ~70MB intro — are forced to `preload='metadata'` on Android so
their buffering stops competing with the load budget). Decoded asset totals drop
from ~500-700MB to roughly **~120-170MB**.
**What to capture from the device (the green monospace banner, top-left, present
from script start through the splash and the Street Tax screen):**
```
waiting for game module...        ← the module never finished evaluating (script error)
loading N/39 · heap X/YMB · ram~ZGB   ← the load count + memory pressure
ERROR: ...                        ← the loader's actual failure
```
It hides itself once the world is ready. A screenshot of that line is the single
most valuable datum.
**Fixes shipped this round (2026-09-13, 11:53 build, APK 220.6MB):**
1. **`willReadFrequently: true` on the sprite-prep work canvas, Android-only**
   (desktop measured no difference; the de-spill already uses this flag across
   the file). On Android a GPU-backed readback is a sync — with ~4,266 of them
   in a world load, that is the crawl.
2. **A 6s decode() race on Android** — WebView builds have shipped decode()
   promises that never settle; one hung decode used to wedge the whole prep
   lane forever.
3. **Android prep slice budget ×4** (still yields; the load runs under the
   loading screen, frame rate there matters less than finishing).
4. **The touch layer actually runs now** (see §3.2's TDZ fix), which also
   restored the video-preload taming on device.
**AND (2026-09-13, 15:44 build, APK 221.4MB) — the "loop" clue addressed:**
5. **The on-device banner is now a proper instrument.** It shows:
   - `boot #N` — a counter in localStorage that increments on every app/WebView
     restart. If the app is crash-looping, N grows between attempts (the user
     reported "something like a loop").
   - `now <sheet>` — the exact asset the prep lane is working on (via
     `__ror.prepNow`). A stall names its sheet.
   - `STALLED Ns on that asset` — printed when progress hasn't moved for 20s.
   - `prepMaxSlice Nms` and the JS heap, as before.
6. **`darki-idle` memory split:** the menu keeps the full-resolution sheet
   (fixed cell geometry); **Android gameplay loads `darki-idle-mobile.png`**, a
   1280px twin. The full sheet is ~110MB decoded — real pressure at load time.
**Re-verified with a desktop Android-emulated repro of the packaged www**
(`_chromakey/androidrepro.js`, Android UA + touch + phone viewport): world
load completes to 100% with zero page errors, `prepMaxSlice` ≈ 200-550ms under
the loading screen. **The next device run should report the banner's contents,
which will name the stall point exactly.**

---

## 4. THE ADDITIVE TOUCH LAYER (Option A — implemented)

**File:** `src/touch.js` (NEW; a plain script, loaded from index.html before the
game module). Shows only on touch-capable coarse-pointer devices, only during
live gameplay; hides across menus and neutralizes the stick so no direction
sticks across a menu.
**Mechanism:** dispatches the same synthetic events a physical keyboard/mouse
produce — `KeyboardEvent(code)` on window for movement/jump/block
(`ArrowLeft/Right/Up/Down`, `Space`, `KeyL`), `MouseEvent` on the canvas for the
combat trio (`mousedown button 0/1/2` = LMB jab / MMB grab / RMB kick; the
uppercut chord is hold-KICK + tap-JAB and reuses the existing `rmbDown` logic).
**No game input/combat code was modified.** Keyboard and Gamepad paths untouched.
**Wiring:** one added line in `index.html` (`<script src="src/touch.js?v=...">`)
and one added hook in `game.js`'s `__ror` block:
`get frontActive() { return !!(frontEnd && frontEnd.active); }`.
**Layout:** stick bottom-left (walk + depth), GRAB/JUMP/JAB/KICK in a 2×2
bottom-right, BLOCK as a slim hold bar above the grid.

---

## 5. COMPLETE CHANGE LEDGER (packaging session)

### Files created
- `..\RatelRage_checkpoint_2026-09-13\` — the full checkpoint (1,094 files, 676MB,
  includes `.git`)
- `mobile/package.json`, `mobile/capacitor.config.json`, `mobile/build-demo.js`
- `mobile/package-lock.json`, `mobile/node_modules/**`
- `mobile/www/**` (generated, 325MB)
- `mobile/gen-mobile-assets.js`, `mobile/assets-mobile/**` (generated)
- `mobile/android/**` (generated Android project) + `app-debug.apk` (208MB)
- `src/touch.js` (NEW game-side file)
- Toolchain outside the project: `C:\Users\kenec\AndroidDev\{jdk-17.0.20.1+1,
  android-sdk, *.zip}`

### Existing files modified (complete list)
1. **`index.html`** — one added line: the `touch.js` script tag before the module.
2. **`src/game.js`** — three additive edits, no existing line modified:
   - `get frontActive()` inside the `__ror` hooks (touch-layer detection);
   - the ASSETS-panel coarse-pointer/touch gate in the boot;
   - the Android-only plate-scale gate (10 lines, after the `streetScale`
     derivation) + `TUNE_KEY` v5 → v6.
3. `mobile/android/app/src/main/AndroidManifest.xml` — generated project only:
   `screenOrientation="sensorLandscape"`, `keepScreenOn`, INTERNET removed.
4. `mobile/android/app/src/main/res/values/styles.xml` — generated project only:
   fullscreen themes.

### Files deleted
**NONE.** (`mobile/www/` is cleaned-and-recopied build output only.)

### Desktop functionality
Unaffected and verified after every change: zoomverify 20/20, waveverify 14/14,
assetmover 18/18, playareabound/playareacamera ALL PASS. The touch layer no-ops
on mouse-only machines (gated on `maxTouchPoints` + coarse pointer).

---

## 6. ROLLBACK PROCEDURE

The checkpoint is a plain filesystem copy (the repo's own git state was NOT
mutated; the checkpoint contains `.git` too).

```powershell
# restore the whole project from the checkpoint
Remove-Item "..\RAGE OF RATELS\RAGE OF RATELS" -Recurse -Force   # DESTRUCTIVE — confirm first
robocopy "C:\Users\kenec\OneDrive\Desktop\RAGE OF RATELS\RatelRage_checkpoint_2026-09-13" `
         "C:\Users\kenec\OneDrive\Desktop\RAGE OF RATELS\RAGE OF RATELS" /E
```
To roll back ONLY the packaging session's game-side edits (keep the checkpoint
intact): restore `index.html`, `src/game.js` from the checkpoint and delete
`src/touch.js` (it is the only game-side addition).

---

## 7. DEBUG PLATFORMS: HOW TO SEE WHAT THE PHONE SEES

1. **WebView remote debugging — NOW ENABLED** in `MainActivity.java`
   (`WebView.setWebContentsDebuggingEnabled(true)`; gate behind `BuildConfig.DEBUG`
   for any release build). From a desktop Chrome: `chrome://inspect` → the
   Capacitor WebView appears → open its console. The loader's errors and any
   front-end exception appear with full stack traces. **This is the first thing
   to use on the next device run.**
2. **Logcat:** `adb logcat -s chromium Console` during load; JS errors print.
3. **Memory:** `adb shell dumpsys meminfo com.ratelrage.demo` (native + graphics
   lines tell whether the plates/sheets are resident).
4. **The on-device banner** (touch.js) — see §3.3.

---

## 8. REGRESSION HARNESS KNOWLEDGE (desktop web)

Run from `_chromakey` (puppeteer + jimp live in its `node_modules`):
- `zoomverify.js` — 20 checks (backing store, zoom, bands, framing modes,
  vehicles at their tuned rows, the solid rectangle, the boss lock).
- `waveverify.js` — 14 checks (waves, reinforcements, the carried survivor).
- `assetmover.js` — 18 checks (the F3 panel, steppers, exact numbers, teleport,
  drag, block, export, F2).
- `areawalk.js` — 4 checks (AREA 2's roster walks in; the wave clears).
- `playareabound.js` / `playareacamera.js` — bounds/camera invariants.
Environment notes: headless Chrome needs `--use-gl=swiftshader` (rAF is dead and
canvas readbacks take 500ms+ without it — 7 harnesses already patched);
`protocolTimeout` 600-900s; big evaluate step-loops must be split.

---

## 9. OPEN DECISIONS (awaiting the project owner)

1. Fullscreen: approve the `MainActivity` immersive-sticky edit.
2. The load: if the diagnostic shows further memory pressure, approve the
   escalation ladder (§3.3).
3. Optimization scope: the sheets' cap level; the exec sheets in/out; the intro
   re-encode (mobile-only) — originals always untouched.
4. Release signing + AAB: only after the debug build is validated on the phone.

---

## 10. QUICK FACTS FOR THE NEXT AGENT

- The game is one ~883KB module; line numbers shift with any edit — locate by
  symbol, not number.
- The jump arc's sign convention: **airborne is `jumpY < 0`** (bit a collision
  guard once).
- `toSection(i)` benches the pool and stages the section's wave; it CAPS at the
  boss section − 1. For the boss room use `toBoss()` or the real path (clear the
  wave → cross the gate).
- `__ror.step(dt)` = update + draw (the harnesses' driver);
  `rorSkipToGameplay` in sessionStorage skips the menu.
- The file's older comments contain **mojibake** (`â€"`, `â„¢`-style) — edits must
  match exactly; write ASCII-only in new code.
- Engine constants live in `src/game.js`: `WORLD_W 9259`, `WORLD_H 1124`,
  `GROUND_Y 620` (legacy anchor; the boss stands at `GROUND_Y+34`),
  `PLAYER_LANE_TOP 645` (Darki's back edge), `RESIDENTS_LANE_TOP 470` (the mob's),
  `VEHICLE_ROW`-equivalent per-vehicle `y` in `VEHICLE_ART`
  (keke-a 2416/692 · danfo 3789/694 · keke-b 4948/620 · keke-c 5361/610 ·
  bus 6172/610 — the user-tuned defaults).
- The tuning plates/versions: `TUNE_KEY 'ror.tune.v6'` (dev-panel scales),
  `ASSET_KEY 'ror.assets.v1'` (the mover's saved placements), `REGION_KEY`
  (the F2 editor's bands).
