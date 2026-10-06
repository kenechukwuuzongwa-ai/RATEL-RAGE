# RATEL RAGE — Mobile Controls, Gestures & Media: Detailed Reference

**Date:** 2026-09-16
**Scope:** everything added on top of the packaging work described in
`DEBUG-STATE.md` — the customizable touch HUD, the gesture layers, the
pause-button path, and the video/audio pipeline fixes. Written so another
agent (or the next session) can work on this without re-deriving it.

---

## 0. THE FIVE RULES THIS CODE HOLDS TO

1. The game's combat, combo, grab, execution, pause, AI, animation and sprite
   systems are NOT modified. Every touch control drives them by dispatching
   the *same synthetic events a keyboard/mouse would produce*: real
   `KeyboardEvent`s on `window`, real `MouseEvent`s on the game canvas.
2. Keyboard and Gamepad paths are untouched; everything mobile is additive.
3. Original media files are never altered. Optimized copies are generated
   into `mobile/assets-mobile/` and overlaid into the generated `www/`.
4. Desktop behaviour is the reference and stays byte-identical in effect.
   Every mobile-specific branch is gated on `IS_ANDROID` or UA checks.
5. Nothing is committed, no release keystore exists; the debug APK is the
   deliverable and phone validation comes first.

---

## 1. FILE MAP (who owns what)

| File | Role |
|---|---|
| `src/touch.js` | **The entire mobile layer.** HUD layout config, control elements, editor, movement region, rush flick, menu/pause gestures, diagnostic banner. Plain script, loaded before the game module. |
| `src/game.js` | Game engine. Mobile additions are limited to: `IS_ANDROID` const, widened `VIEW_W`, `__ror` hooks (`frontActive`, `paused`, `prepNow`, `vehicleAt`, `assetMover`, `regionEditor`), the pause-menu `CUSTOMIZE CONTROLS` entry + activation, pause input gates while the editor is open, the sprite-prep upsample guard + readback flag, the Android plate-scale compensation, the deferred world load, and `startWorld`. |
| `src/frontend.js` | Menus/cinematics. Mobile additions: widened `W`, splash/intro **cover** scaling + mobile 720p twins, splash autoplay-safe start, intro voice retry + rate-limited sync + clip-clock ending, briefing buffering hold, centered story loading bar, `introPlayed` no-replay gate. |
| `mobile/gen-mobile-assets.js` | Generates `assets-mobile/` (plates per `PLATE_SCALE` — sky/background 50%, **street full-res**, see §4.10.4; sheets cell-by-cell to 1280px, idle twin, fixed-geometry exclusions). |
| `mobile/gen-icons.ps1` | Launcher icons from `frontend/ui/ratel-logo-title.png` (ffmpeg). |
| `mobile/build-demo.js` | Allowlist-copies the web root into `www/`, overlays `assets-mobile/`, drops the master intro when the mobile twin exists. |
| `_chromakey/androidrepro.js` | Serves `mobile/www` under an Android UA with touch spoofed; verifies load, HUD editor, swipe gestures, story gate. |
| `_chromakey/spriteheights.js` | Measures drawn sprite heights on desktop vs packaged builds (the walk-size regression detector). |
| `_chromakey/workprobe.js`, `walkcells.js`, `walkalpha.js` | The union-box/upsample forensics tools. |

---

## 2. THE CUSTOMIZABLE HUD (`src/touch.js`)

### 2.1 One centralized layout
```js
const HUD_KEY = 'ror.hud.v1';           // versioned persistence key
{ id: { x, y, scale, opacity, visible, base } }
```
- `x`, `y`: **normalized fractions of the viewport** (0..1). Resolution- and
  aspect-independent: the same layout holds on any screen.
- `scale`: 0.6..1.8 player multiplier; `opacity`: 0.25..1; `visible`: bool.
- `base`: design diameter in reference pixels; rendered size =
  `base * scale * (min(vw,vh) / 412)` so tablets and small phones agree.
- Controls are declared ONCE in `CONTROLS` with their label and the events
  they dispatch. No positions exist anywhere else.

### 2.2 Controls and their events
| id | label | Dispatches | Behaviour |
|---|---|---|---|
| `stick` | (joystick graphic) | `ArrowLeft/Right/Up/Down` | 8-way, 14px dead zone; follows the touch origin |
| `jump` | JUMP | `Space` | the game's jump |
| `block` | BLOCK | `KeyL` (hold) | guard while held; **round**, was a 1.8x pill |
| `kick` | KICK | mouse button 2 | High Kick (back+KICK = Back Kick via movement) |
| `jab` | JAB | mouse button 0 | Left Jab; double-tap = the 5-hit combo (game's own click run) |
| `grab` | GRAB | `KeyE` (hold) | **hold = carry; release = throw**, and it is also the EXECUTION — `KeyE` is the game's own execute/pickup hold, so the exec badge names this button (§4.10.5) |
| `pause` | (gear) | `KeyP` | toggles the pause menu (phones have no keyboard); drawn SVG, see §4.10.5 |

All base sizes/positions: see `HUD_DEFAULTS` in the file.

### 2.3 The editor ("CUSTOMIZE CONTROLS")
- Reachable ONLY through the pause menu (pause is freezed gameplay, so the
  sim is already stopped — that is the "disable gameplay" guarantee).
- While `editing`:
  - `send`/`sendMouse` are no-ops → no control can fire gameplay events.
  - The pause overlay is hidden (`draw` gate) and the pause menu's keyboard
    and pointer input are gated off so Enter can't resume behind the editor.
  - Controls show regardless of `visible`; invisible ones render dimmed.
  - Tap a control to select (amber outline); **drag to move** (clamped so the
    whole body stays ~6px inside the viewport).
  - The bottom glass panel: **SIZE** slider, **OPACITY** slider, **HIDE/SHOW**,
    **RESET** (confirm dialog), **SAVE**, **DONE**.
- **DONE returns to the pause menu** (never straight into combat); RESUME
  resumes the fight.
- The editor is driven by `window.__rorTouch`:
  `openEditor()`, `closeEditor()`, `.editing`, `.layout`.

### 2.4 Persistence
- `localStorage['ror.hud.v1'] = { v: 1, controls: {...} }`; loaded at boot
  with clamping, saved on drag-end, slider input, toggle, Save and Done.
- RESET restores `HUD_DEFAULTS()` and saves. Survives restarts/reloads;
  unknown versions are ignored safely.

### 2.5 Movement (left half) and pointer ownership
- A transparent region covers the **entire left half** of the screen. A touch
  anywhere there claims that pointer as the movement finger; the joystick
  graphic **jumps to the touch origin** and the knob shows the drag relative
  to it (dead zone 14px; diagonals allowed).
- One movement finger at a time; each control `setPointerCapture`s its own
  pointer, so right-thumb combat buttons and the left-thumb stick never steal
  from each other. (All captures are wrapped in try/catch so synthetic test
  pointers can't break the handlers.)

### 2.6 Rush by flick (gameplay)
- A fast horizontal flick on the movement region runs the game's own
  **forward-forward** sequence: release → tap → release → tap, with the final
  press **held**.
- **The flick is a SPEED test, measured over a rolling window** — `FLICK_PX`
  (80px sideways, >1.4× the vertical travel) inside `FLICK_MS` (180ms), from a
  sample point that is re-taken whenever it goes stale. It is NOT measured from
  the touch-down point: that version asked only "has the thumb ever ended up
  80px sideways, within 450ms of landing", which an ordinary push-out-and-hold
  to walk satisfies, and players triggered the rush constantly by accident
  (§4.7.1).
- The game's `updateRushFree` ends the sprint the moment the held side is
  released — so **lifting the finger stops the rush**, with zero engine changes.
- **Reversing the thumb also ends it.** Pushing back the other way past the dead
  zone calls `breakRush()` and hands the finger straight back to the stick, so a
  direction change never has to wait for a lift. `commitRush` re-anchors the
  stick under the thumb as it fires, so "the other way" is a short reversal
  rather than a drag back across the original touch point.

---

## 3. GESTURE LAYERS (menus + pause)

A separate transparent layer (`#ror-gest`) is shown ONLY when an interactive
menu owns the screen: the front-end phases
`title, menu, difficulty, character(s), shop, controls, options, levelSelect,
briefing, levelTitle, extras, credits` **or while the game is paused**.
It is NOT gated on `worldReady` (see §4.8.2) and is explicitly OFF during `splash`, `loading` and `intro` — cinematics
belong to the director; a stray swipe there skipped the clip and could
ping-pong the flow (see §5.1).

| Gesture | Action | Mechanism |
|---|---|---|
| Swipe RIGHT | Enter / select | dispatches an `Enter` tap (the front end's `accept`) |
| Swipe LEFT | Back | dispatches an `Escape` tap (the front end's `back`) |
| Swipe UP/DOWN (right half) | Scroll options | one `ArrowUp`/`ArrowDown` tap per 46px of travel |
| Tap **on a row/button** | that button's press | forwarded to the canvas as a real `pointermove`+`pointerdown`+`pointerup` **and** `mousemove`+`mousedown`+`mouseup` sequence, so the pointer-driven front end and the mouse-driven pause/level-select menus all respond. Hover and press pulses behave exactly as before. See §4.8.1 |
| Tap **on empty space, right half** | Enter / activate the selection | `Enter` tap. The right half already scrolls the highlight, so picking and confirming are the same thumb in the same place |
| Tap **on empty space, left half** | nothing | the left half is the BACK side; a stray tap there must not commit |

While paused, the same layer drives the pause menu (taps + swipes), and the
gameplay controls hide (`wrap` display none) so the menu is unobstructed.

---

## 4. MEDIA PIPELINE FIXES (all in `src/frontend.js` unless noted)

### 4.1 The studio splash (KenCraft)
- **Cover fit**: fills every device aspect (was letterboxing).
- **No fallback pop**: while the clip is loading the screen stays on its black
  stage; the drawn wordmark appears only on genuine failure.
- **Plays WITH ITS SOUND, on every platform** (corrected 2026-09-16 — see
  §4.9). It briefly started muted on Android, guarding against a restriction
  that was never in force.
- **Waits for the first decodable frame** before playing (no mid-buffer start);
  2.5s ceiling so a stalled network can't hold the phase.
- **Deferred world load** (`src/game.js` `startWorld`): the sprite-prep lane's
  main-thread slices are what stuttered the moving clip; the load now starts
  at the splash's held last frame / ≤8s, and the title's loading bar shows it.
- **0.33MB 720p twin** (`studio-splash-mobile.mp4`) for Android; 4.7MB master
  stays for desktop.

### 4.2 The level-intro cinematic
- **Cover fit** (fills the screen).
- **Plays once per level run** — see §5.1.
- **Voice-over autoplay retry**: `play()` is retried once a second until a
  real tap unlocks the page; on success the narration seeks to the picture's
  current time so audio and video rejoin in sync. (A single rejected play()
  used to leave the whole cinematic silent.)
- **Sync without seek storms**: drift is corrected with playback-rate nudging
  (±15%k), hard resyncs only >0.5s and at most every 2.5s.
- **Ends on the clip's own clock** (no blunt 40s cap cutting it mid-scene);
  fallback only when no media clock exists; hard ceiling 120s.
- **0.33→7.6MB 720p twin** (`intro-mobile.mp4`) for Android; the 67MB master
  is dropped from the packaged www.

### 4.3 The briefing (case file)
- The typewriter clock follows the VO; if the VO is merely **buffering**, the
  clock HOLDS (up to a 3s grace) instead of running ahead on dt — the window
  no longer "finishes" before the narrator.

### 4.4 The story loading bar
- Was hardcoded at `390..890` (centred for the old 1280 frame); now
  `W/2 - bw/2` against the live viewport, so it is centred on every aspect.

### 4.5 Sprite/sheet rendering on the packaged build
- **The walk-is-smaller bug**: capped sheets are upscaled into the prep's
  480px measurement canvas, and Chromium's `high` smoothing samples OUTSIDE
  the source rect — the neighbouring cell's feet bled in as a top line,
  inflating the shared union box (which maps to `drawH`) and drawing the
  character ~30% small. Fix: 2px source-rect inset whenever a cell will be
  upscaled (Android-gated).
- **Readback flag**: `willReadFrequently` on the prep work canvas on Android
  (a GPU-backed readback is a sync; the load does ~4,266 of them).
- **`darki-idle` split**: menu keeps the full-res sheet (fixed cell geometry);
  Android gameplay loads a 1280px twin.

---

## 4.6 THE RANGE-REQUEST BUG — the one cause under almost all of it (2026-09-15)

**Symptom on device:** the studio splash glitched, the intro cinematic played in
short loops or with no narration, the briefing VO stopped mid-line, the gameplay
VO never fired and the banner just waited out its 18.8 s. Everything with an
`.mp3` or `.mp4` behind it was unreliable — and *intermittently* so.

**Root cause — `@capacitor/android@6.2.2`,
`WebViewLocalServer.handleLocalRequest()` (lines 346-373):** it answers a
`Range` request with HTTP 206 and a `Content-Range` header naming the requested
offset, **but hands back a stream opened at byte 0**. `LollipopLazyInputStream`
(line 756) just reopens the asset; nothing in the package ever calls `.skip()`.

Android's media stack uses Range requests for progressive playback **and for
every seek**. So a seek to t>0 fed the decoder the top of the file labelled as
the middle. The front end seeks constantly — and the worst offender was the
intro's drift resync (`introVideo.currentTime = voice.currentTime`, every 2.5 s
past 0.5 s of drift): each one re-served frame 1, the picture jumped back to the
start, drift grew, and it resynced again. **That is the "short loops".**

A second factor made it intermittent rather than constant: seven
`preload='auto'` media elements were alive from boot, and under the world load's
memory pressure Android suspends them and drops their buffers. Waking one
re-fetches — straight back into the bug.

**Fixes shipped:**

| # | Fix | Where |
|---|---|---|
| 1 | **Honest byte ranges.** A `BridgeWebViewClient` subclass intercepts ranged requests for media only, skips to the real offset, bounds the stream to the slice, and sends a truthful `Content-Range`/`Content-Length`. Everything else falls through to Capacitor untouched. | `android/app/src/main/java/com/ratelrage/demo/RangeAwareWebViewClient.java` (new), wired in `MainActivity.onCreate` via `bridge.setWebViewClient(...)` |
| 2 | **The three narration reads stop streaming on Android.** `VoiceClip` decodes the whole file into a WebAudio buffer (one `fetch`, no Range header, no element for the platform to suspend) and presents the slice of the `HTMLAudioElement` surface the front end uses, so no call site changed. `makeVoice()` returns a real element off Android — desktop is untouched. | `src/frontend.js` |
| 3 | **No seek in the intro sync path at all.** Only the ±15% playback-rate nudge remains; it closes half a second of drift invisibly, where a seek costs a re-buffer and a visible jump. | `src/frontend.js` |
| 4 | **`LEVEL_INTRO` no longer names the master.** It pointed at `intro.mp4?v=master37-fixed` with no Android branch — a file `build-demo.js` *deletes* from the packaged www, and whose real name is `Intro.mp4` (capital I; Android asset paths are case-sensitive). Every route through `startLevel` — the post-mission "play 02" and "run 01 again" — therefore 404'd and silently skipped the cinematic, which is why a first run looked fine and a replay did not. Now `INTRO_MASTER`, one constant, Android-gated. | `src/frontend.js` |

**Why the ambience stays an element:** `bg2.mp3` is 6.2 MB looping, over 100 MB
decoded as PCM. It only ever plays start-to-end on repeat and never seeks, so it
was never exposed to the bug. The three reads that moved are 0.29 / 0.57 /
0.70 MB — affordable to hold decoded.

**Why `openFd` is safe here:** it throws on a *compressed* asset. Verified all
63 media files in the APK are STORED, not DEFLATED — so the handler applies to
every one. If that ever changes, the handler logs `range passthrough for ...`
and defers to Capacitor (no worse than before, but the bug returns).

**NOTE — the class must not be vendored by copying.** `capacitor-android` is a
Gradle **source project** (`capacitor.settings.gradle` points at
`node_modules/@capacitor/android/capacitor`), so a same-FQCN copy of
`WebViewLocalServer.java` under `app/` is a duplicate-class dex error, not a
shadow. Subclassing `BridgeWebViewClient` in our own package is the way in, and
it survives `npm install` and `npx cap sync`.

---

## 4.7 THREE MORE DEVICE REPORTS (2026-09-15, APK v5)

### 4.7.1 The stick would not change direction until the finger was lifted
**Reported:** "holding a direction and then deciding to change direction, the
character keeps moving the old way until I release and hold again."

**Root cause — `src/touch.js`, two defects stacked:**
1. `pointermove` opened with a bare `if (rushLock) return;`. Once the rush flick
   had the finger, **`applyStick` was never called again**, so the direction was
   frozen until `pointerup` cleared the lock. That is the reported symptom
   exactly.
2. The flick test was `e.clientX - moveStart.x` against the touch-down point,
   and `moveStart` was never updated — so it asked "has the thumb ever ended up
   80px sideways of where it landed, within 450ms", which an ordinary
   push-out-and-hold to WALK satisfies. Players were entering the lock
   constantly without asking for it.

**Fixed:** the flick is now measured over a **rolling 180ms window**
(`FLICK_MS`/`FLICK_PX`, re-sampled whenever the sample goes stale), which makes
it a real speed test — 80px in 180ms is ~440px/s, where a deliberate walking
push is ~250px/s and then stationary. And pushing the thumb back the other way
past the dead zone now calls `breakRush()` and hands the finger back to the
stick on the same frame. `commitRush` also re-anchors the stick under the thumb,
so "the other way" means a short reversal rather than a drag all the way back
across the original touch point.

### 4.7.2 The studio splash looped once, early
**Root cause — `src/frontend.js` `startSplashVideo()`:** `begin()` was reachable
from BOTH the `loadeddata` listener and the 2.5s ceiling timer. `{ once: true }`
de-duplicates the listener and does nothing about the timer, so on a phone
(clip ready in well under 2.5s) the card started, played ~1.7s, and then the
timer ran `currentTime = 0` a second time. One loop, every run, always about
two and a half seconds in.

**Fixed:** `begin()` latches on a `begun` flag and clears the pending timer.

### 4.7.3 The entry bars glitched as they left frame
**Root cause — `src/game.js` `drawLetterboxPx()`:** the warm hairline on the bar
edge is faded by `openness`, which only describes the CLOSING half of the travel
— it reaches 1 at the hold depth and clamps there. Retracting, the line stayed
at **full strength until the bar was gone and then vanished between two frames**:
two bright lines snapping off the top and bottom of the street.

**Fixed:** a second factor, `min(1, depth / HAIRLINE_OUT_PX)` (40 bar px), fades
the line out with the last of the bar, and the line is positioned on the
UNROUNDED depth so it glides on sub-pixels while the black fill behind it stays
on whole pixels and keeps a crisp edge. The closed-gate appearance is unchanged
(alpha is still exactly 0 at full black). Applies to the boss cutscene bars too,
which shared the function and the defect.

---

## 4.8 MENU TAPS, LIVE EDITING, AND LEAVING (2026-09-16, APK v6)

### 4.8.1 Tapping
The right half of a menu already scrolled the highlight (swipe up/down). It now
also **commits**, so picking and confirming are the same thumb in the same
place. A tap resolves in priority order:

1. **On a row or button** -> that button's press. The thing under the thumb wins.
2. **Empty space, right half** -> activate the current selection (`Enter`).
3. **Anywhere else** -> forwarded as a click, as before. The left half stays
   neutral deliberately: it is the BACK side (swipe left), and a stray tap there
   committing the selection is the opposite of what the hand meant.

`__ror.menuHitAt(clientX, clientY)` is the probe that separates (1) from (2).
Both menus push their rows through the same `ui.button()`, so one probe answers
for the front end, the pause list and the level-select cards alike.

**Tapping actual rows only half-worked before.** The front end is POINTER-driven
(`pointermove/pointerdown/pointerup` on the canvas); the pause menu and the
post-mission level select are MOUSE-driven (`mousemove/mousedown/mouseup`). A
synthetic `PointerEvent` does **not** generate the compatibility mouse events a
real finger would, so `forwardTap` — which sent pointer events only — could not
touch a pause row at all. It now sends both families. The mouse half is gated on
`__ror.menuOwnsFrame`, because during a live fight `mousedown` button 0 on the
canvas is a **jab**, and the gesture layer's visibility is only re-evaluated on
a 200ms interval — a tap landing in the gap between the fight resuming and the
layer hiding would otherwise throw a punch.

### 4.8.2 The gesture layer was dead for the first ~30 seconds
`menuShow` required `R.worldReady`. The menus do not need the level — the title
and main menu are up and interactive long before the 39 sheets land, which is
the entire point of the background load — so swiping AND tapping were dead on
exactly the screens the player meets first, and the game looked frozen until the
world happened to finish. The gate is now just "a menu owns the frame". The
gameplay controls (`wrap`) still require `worldReady`, correctly.

### 4.8.3 The HUD editor now redraws live
`refreshSel()` only rewrote the PANEL (the label and the two slider positions).
What actually sizes and fades a control is `placeControl`, and nothing was
calling it — so a control kept its old geometry until something else re-placed
it: dragging it, or SAVE/DONE/RESET. Sliding SIZE and seeing nothing happen
until you poked the button was that gap. All three editor mutations (size,
opacity, visibility) now go through one `liveEdit()` that refreshes the panel
**and** re-places every control, so a control added later cannot forget to
redraw. Measured: 76.0px -> 121.6px on the frame the slider moved.

### 4.8.4 Quitting to the phone's home screen
`QUIT GAME` used to print "QUIT IS CONTROLLED BY THE GAME HOST" — true in a
browser tab, where `window.close()` is refused for a page the user opened
themselves. The packaged build now HAS a host: `MainActivity.Host` is exposed as
`window.RatelHost` with `canQuit()` and `quit()`, the latter calling
`finishAndRemoveTask()` on the UI thread (not `finish()`, which would leave the
task in recents looking like a still-running game).

- **Main menu**: `QUIT GAME` now really quits.
- **Pause menu**: a `QUIT TO DESKTOP` row is **appended only where a host can
  honour it**, read once at module load. On desktop the row simply is not
  offered, rather than being a row that answers a press with an apology.
- **Both take two presses.** The first arms and says `PRESS … AGAIN TO EXIT`;
  the arming rides the message's own 2.2s lifetime, so the prompt vanishing and
  the arming lapsing are the same event. One quit path (`ui.requestQuit`) serves
  both menus, so they cannot disagree about whether leaving is possible.
- The pause screen draws `ui.messagePlate()` and ages the clock via
  `ui.tickMessage(dt)` from `updatePauseInput`, because the front end's own
  `update()`/`draw()` do not run behind a paused fight — a two-press
  confirmation nobody can see is a button that ignores the first press.

**SECURITY NOTE.** `addJavascriptInterface` exposes a native object to all JS in
the WebView. It is acceptable here *only* because the app is a self-contained
offline package with no INTERNET permission and no remote content of any kind —
everything in this WebView ships inside the APK. Keep that surface to one method
and reconsider the whole thing the moment anything remote can load.

---

## 4.9 THE SPLASH GOT ITS SOUND BACK (2026-09-16, APK v7)

Fixing the one-time loop (§4.7.2) made the card smooth and left it **silent on
the phone** — and the silence was a separate, older mistake that the glitch had
been masking.

`startSplashVideo` did `splashVideo.muted = android`, on the stated grounds that
"the packaged WebView rejects an unmuted play() before any gesture". **It does
not.** Capacitor calls `settings.setMediaPlaybackRequiresUserGesture(false)`
when it builds the WebView (`Bridge.java:573`), which lifts the gesture
requirement for exactly this case. The card was muted on Android for a
restriction that was never in force.

The "visible hiccup at the top of the card" that the muting was introduced to
avoid was almost certainly the **double-`begin()` restart** (§4.7.2) — the card
jumping back to frame one about 2.5s in looks exactly like a failed unmuted
attempt retrying. One symptom, two fixes, and the second one was wrong.

**Now:** sound first, silence second, never neither, on every platform. The
unmuted attempt is still not assumed to work — a rejection falls back to
muted-and-playing, and the retry does NOT reset `currentTime`, so the fallback
resumes instead of restarting. `__rorMenu.splash.muted` reports which rung took
(`false` = sound, `true` = fell back, `null` = no attempt resolved yet).

**Measured, so the hold cannot be blamed next time:** the clip is 6.006s but its
audio runs 0 → 3.02s and is silent after that (`silencedetect -45dB`). The card
parks on the wordmark at `SPLASH_HOLD_AT` 4.75s, which is comfortably AFTER the
sound has finished — so the park does not cut the audio, and moving it would not
bring more sound back. Both the master and the 720p twin carry the same stereo
AAC track; the twin was never the problem.

**Harness:** `touchverify.js` asserts `__rorMenu.splash.muted === false`. Note
the limitation — headless runs with `--autoplay-policy=no-user-gesture-required`,
so this proves the code ATTEMPTS the unmuted rung and that it succeeds when the
policy allows. The native guarantee is Capacitor's setting above, read from
source rather than measured on device.

---

## 4.10 PRESENTATION AND THE BOSS FIGHT (2026-09-16, APK v8)

### 4.10.1 The opening gate jump-cut
The entry bars were `max(gateBarH * letterbox, (VIEW_H/2) * blackout)` — two
curves aimed at DIFFERENT targets (180 and 0), crossing wherever they happened
to. They met at t≈1.0s with the black side falling through the steepest part of
its smoothstep at **~600 px/s** while the letterbox side had been flat at 180 for
a third of a second, so the bars raced down and stopped dead inside one frame.

Now the two beats **add**: depth = gate (owned by `letterbox`) + the extra black
above it (owned by `blackout`). The bars start CLOSED (`setBars(levelEntry, 1)`
when there is a prologue — a short entry keeps 0 or it would flash a bar at a
scene that is already over), so the only moving part during the prologue is the
black, easing to rest on a smoothstep. The final opening uses `easeRest` (a pure
smoothstep) rather than the shared `easeBars`, which keeps 27% of a linear ramp
and would start the move at 27% of its average speed — a visible kick off a gate
that has been still for seventeen seconds.

`entrysmooth.js` measures the DRAWN depth every frame and asserts on the
derivatives, because the defect is in the velocity and no screenshot can show
it. It also rebuilds the OLD curve from the same run as a **control**: old worst
10.00 px/frame², new 1.00 (pure integer rounding). A smoothness bound that
passes on the broken curve too would prove nothing.

### 4.10.2 The boss stand-off is the same shot every time
`startBossIntro` left Darki wherever the fight had left him and the `push` beat
walked him toward his mark FROM THERE — a different performance every run, and
**nothing at all** if he had crossed the gate past the mark, since the walk only
closes a positive gap. (`finishBossIntro` never repositioned him; only
`skipCutscene` did, so the normal path had no correction.) The `gap > 4` arrival
threshold also left him up to 4px short even when the walk ran.

He now starts on `CUT.playerStartX` — a fixed 420px back from his mark, 2.0s of
walking inside a 2.60s beat — held as a distance BACK FROM THE MARK rather than
a camera-relative point, so the performance is identical on every aspect even
though the frame edge he appears past is not. He is also put on Olodo's row, so
"opposite" is literal. `bossentry.js`: 26 checks across four crossing points,
all producing one identical signature.

### 4.10.3 MC_Olodo's two gears
He no longer fights the whole bout alone. `BOSS_PHASE` / `bossFight`:

| phase | what happens |
|---|---|
| `solo` | the stand-off, from the entrance |
| `away` | at **75%** he breaks off, sprints out of frame right, and 4 Agberos hold the street. `offstage` takes him out of `isEnemyHittable`; `active` (the cutscene's own AI gate) stops him attacking. **He does not heal.** |
| `returning` | crew beaten → he walks back to `CUT.bossMark` |
| `crew` | he fights on, with 3 Agbero + 2 Senior reinforcements topped up for the rest of the bout |

ONE retreat, deliberately: a boss who runs every time you hurt him teaches the
player to stop swinging.

**THE TRAP:** the boss section's quota is **0**, so a crew death falling through
to the section machinery ran `waveKills >= sec.quota` — 1 >= 0 — and flipped
`waveState` to 'cleared' mid-fight, taking the locked camera, the arena bounds
and the boss HUD with it. `onEnemyDefeated` now returns early during
`inBossStage()`; the crew is counted by the living, not the dead.

### 4.10.4 The blurry background
All three opaque plates shipped at a blanket 50%, so the STREET — the only plate
carrying close, sharp, high-detail art — derived `streetScale = 2.0` and was
drawn at **2.4x its stored pixels** once `tune.zoom` (1.2) was applied. On a
~2400px phone that is roughly a **3.6x** magnification of the source against
~1.9x on desktop: mobile was about twice as soft as desktop, which is exactly
what testers reported.

`PLATE_SCALE` in `gen-mobile-assets.js` is now per-plate and the street ships
FULL RESOLUTION (+31MB decoded, +11MB APK). Sky and background stay at 50% —
distant, parallaxed, low-frequency, and what the memory ceiling is actually for.
Verified under an Android UA: street now **1.20x**, sky/background still
compensated at 2. **`TUNE_KEY` bumped to v7**: `streetScale` self-derives from
the image width, but a saved v6 state pins the old 2.0 and would draw the street
at double the world's size.

### 4.10.5 Contextual prompts, and the controls that exist
- **Prompt glyphs** are swapped in `icon()` by `TOUCH_ICON`, not at the ~20 call
  sites, so a hint added later is contextual without its author remembering:
  `cross`/`triangleBtn` → a tap, `circleBtn` → swipe-left, `dpad` → swipe
  up/down. Gated on `isTouchUI()` (coarse pointer AND real touch points), the
  same gate the gesture layer uses — a laptop with a touchscreen keeps the pad
  prompts. Labels needed no change: they were already verbs.
- **The EXECUTION was already on GRAB** — the touch GRAB dispatches `KeyE`,
  which IS the game's execute/pickup hold. Only the floating badge was wrong: it
  read `L2` or `E`, neither of which exists on a phone. It now reads **GRAB**.
- **`__ror.missionOver`** (outro or aftermath) hides the combat pad and shows the
  gesture layer. Both are drawn by game.js, so `frontActive` is false through
  them and the touch layer previously kept a full set of punch buttons over a
  screen with nothing to punch. The evidence pickup is deliberately excluded —
  Darki still walks to the ledger.
- **Pause is a drawn gear** (SVG via `CONTROLS.svg`, not a font glyph): the
  button also opens CUSTOMIZE CONTROLS, and a gear says more than two bars.
  **Block is round**; it was the only 1.8x pill in the cluster.

### 4.10.6 Walking behind the parked traffic
Two independent blockers, and the RENDERING was never one of them — the draw
pass has always sorted vehicles into the depth by their own wheel row.

1. The collision band was symmetric (`|y - v.y| < 66`), making the strip behind
   a vehicle as solid as the strip in front. `VEHICLE_BEHIND_GAP` (8) makes it
   one-sided: the road side is unchanged, so nothing can be shoved through a
   vehicle and "walk around it" still works, but stepping past the wheels puts
   you behind it.
2. Three vehicles park at rows SHALLOWER than Darki's global back edge of 645 —
   bus and keke-c at 610, keke-b at 620 — so behind them was unreachable
   whatever the collision allowed. `clampPlayerLane` hard-coded `PLAYER_LANE_TOP`
   and ignored the region's own value, so no authored band could help. A region
   may now name **`playerTop`**; two pockets carry it.

Pockets need ~200px of LEAD-IN either side: sized to the vehicle alone, Darki is
clamped to 645 on the approach and arrives already in front of it. Measured with
tight pockets, all three shallow vehicles still failed.

Measured behind-the-wheel-row depths: keke-a 662, danfo 664, keke-b 590,
keke-c 582, bus 582.

**TASTE CHECK:** the pockets are the only change here that alters where the
player may physically STAND (back edge 560 vs the 645 that keeps him off the
pavement furniture). If stepping behind the bus reads as walking on the kerb,
raise the number or delete the pockets — the collision fix alone still frees
keke-a and the danfo, which need no pocket. **`REGION_KEY` bumped to v2**: a
saved v1 state predates both the pockets and `playerTop`.

`zoomverify`'s "nor in the band above its wheels" asserted the OLD symmetric
band and was REPLACED (not deleted) with the new invariant — still cannot stand
inside a vehicle, but the strip behind its wheels is walkable.

---

## 4.11 EIGHT DEVICE NOTES (2026-09-20, APK v17)

Eight items off one play session. They are unrelated bugs with one thing in
common: each is something the eye catches but the code thought was fine.

### 4.11.1 The intro is skippable — but only the second time
`frontend.js`. `INTRO_SEEN_KEY = 'ror.introSeen'` is written in `finishIntro()`,
so the FIRST viewing always plays through; every viewing after that arms a tap
skip once `INTRO_TAP_SKIP_AT = 3.0` seconds of the clip have played. The 3s
delay exists so a stray tap carried over from the press that started the scene
cannot eat the cinematic. `onPointerDown` handles it before any other routing
and swallows the tap when not armed, so an unarmed tap does nothing at all
rather than falling through to the menu forwarder. The "TAP TO SKIP" prompt is
drawn only on touch UI and only while armed — it never advertises a control
that would not respond.

### 4.11.2 The mission-card check mark that would not leave
`icon()` set `ctx.globalAlpha = alpha` instead of multiplying it. Any icon drawn
inside a parent that was fading out reset the alpha to its own local value, so
the green check mark stayed at full opacity while the card it belonged to faded
away — leaving a tick floating over the street. One character: `*=`. The bug is
worth remembering because it is invisible until something with a nonzero local
alpha is drawn inside a fading parent, which is exactly the case a card reveal
creates.

### 4.11.3 One continuous shot through the gate
The report was "feels like the camera snaps and reframes" just as the bars
leave. It did. There were TWO problems, both real:

1. `updateLevelEntry` framed the shot with `bandFramingY(walkY) + lift *
   letterbox` — a static composed shot — and `finishLevelEntry` then set
   `cameraY = 0` before handing over to the follow camera, which immediately
   pulled to its own row. Three different framings in about a second.
   `followCamY()` is now extracted from `updateCamera` and is the ONLY thing
   that decides the row, during the entry and after it. The `cameraY = 0` line
   is gone. Measured step across the handover: **0px**.
2. `entryBarPx()` was a `max()` of two curves aimed at DIFFERENT targets (the
   gate bar height and the half-screen blackout). As the blackout released, the
   max switched curves and the bar height jumped. It is now a **sum**, with the
   bars starting closed (`setBars(..., lead > 0 ? 1 : 0)`). Measured
   acceleration at the handover fell from **10.00 to 1.00 px/frame²**
   (`entrysmooth.js` keeps a control that reconstructs the old curve, so the
   comparison stays honest as the scene changes).

Only the bars move now. The shot the voice-over plays over is the same shot the
level opens on.

### 4.11.4 The area counter is gone
`drawWaveHud`'s `fighting` branch printed "AREA 3 — 5 LEFT" across the top
centre — the one part of the frame the fight is always happening in front of.
Removed rather than relocated: the men still standing are the count, and the GO
arrow already says when the gate opens. The state branch is kept (with the
reasoning in a comment) so the wave HUD's shape is unchanged.

### 4.11.5 "Sprites struggling for who will display"
Darki flickered between his normal and combat cycles. Two causes, both fixed:

- **The threshold had no hysteresis.** `enemyInFightRange()` used a hard
  distance test, so an enemy hovering on the boundary flipped the stance every
  frame. It is now a Schmitt trigger: `fightStanceOn` widens the box by
  `FIGHT_RANGE_EXIT = 1.22` once engaged, so leaving costs more than entering.
- **The phase reset on every swap.** Even a legitimate walk↔combatwalk change
  set `frame = 0`, snapping the leg mid-stride. `sameCycle()` recognises the
  walk/combatwalk and idle/combatidle pairs as the same cycle at a different
  dress and preserves `frame`/`animTime` across them.

Measured after: **1 change per 300 frames**, down from a change most frames.

### 4.11.6 Vehicles are solid all the way up
Jumping "over" a vehicle let Darki pass through its body, because the collision
had no vertical extent — it was a ground-plane rectangle. `vehicleClearedBy()`
now compares his airborne height against the vehicle's actual art height
(`v.h`), with `VEHICLE_CLEAR_EASE = 14` of forgiveness at the top, and
`resolveVehicleCollision` skips only the vehicles he has genuinely cleared.

**This had a consequence, since corrected — see 4.12.** Measured against their
own artwork the danfo (201px) and the bus (308px) were both unjumpable, and the
kekes (158px) cleared by under 2px. The danfo and the kekes now sit on a shared
clearance bar set from his arc; the bus is still meant to be gone around, which
is what the walk-behind pockets are for. The apex figure quoted here as 152px is
the closed form — the stepped arc is 145.6, and 4.12 explains why that is the
number that counts.

### 4.11.7 The boss arena shot was cropping the murals
`BOSS_CAM_LIFT = 96` lifts `BOSS_CAM_Y` above the plain band framing so the
wall art behind the arena is in frame while the narration is talking about the
man painted on it. `zoomverify`'s old check pinned the pre-lift row (324 ± 70)
and was REPLACED with the relationship — the camera sits clearly above band
framing AND both fighters stay inside the view — so the check survives a
retune and still fails if the lift is lost or overdone. camY: 324 → **228**.

### 4.11.8 The KenCrafts card holds for two seconds
`SPLASH_CARD_LEAD = 2.0`. The black-background presents card is now scene one
in its own right: `drawSplash` draws it alone while `phaseT < SPLASH_CARD_LEAD`
and `startSplashVideo()` is called from `update` only once that lead elapses.
`SPLASH_MAX` was extended by the same amount so nothing downstream shortened.
The card has a dual envelope — a held opacity during the lead, and the old
half-sine if the video fails — so a failed clip still reads as a deliberate
title rather than a stall.

---

## 4.12 THE DANFO IS JUMPABLE AGAIN (2026-09-20, APK v18)

Making the parked line solid in height (4.11.6) was right and had a cost: the
danfo became a wall in a row of traffic he can otherwise get past. Asked to
"adjust the danfo collision just enough for Darki to be able to jump".

**There was nothing to reclaim from the artwork.** The danfo's sprite box was
pixel-scanned first, in case 201px was a loose crop hiding empty margin: it is
opaque from row 0 and 75% of full width by row 9. 201 really is its roof, so
this is a tuning decision and is labelled as one in the code rather than dressed
up as a measurement correction.

**The arc is 145.6px, not 152.1.** The closed form `jumpVel² / (2·gravity)` =
780²/4000 says 152.1. The frame-stepped integrator loses `jumpVel·dt/2` on top
of that — 6.5px at 60fps — and the collision only ever sees the stepped number.
Every bar is now set against the measured arc, and the harness measures it live
rather than recomputing the formula.

**`JUMPABLE_CLEAR_H = 144`** (130 after `VEHICLE_CLEAR_EASE`) is the one bar
shared by everything meant to be jumpable — the danfo and all three kekes. The
bus keeps its own 308px roof and is still meant to be gone around.

**The kekes came along because measuring exposed a real bug.** At their art
height they cleared by **1.7px** at 60fps, and the stepped apex falls with the
frame rate:

| frame rate | stepped apex | vs the old keke bar (144) |
|---|---|---|
| 60fps | 145.6 | clears by 1.7px |
| 50fps | 144.3 | clears by 0.3px |
| 30fps | 139.1 | **does not clear** |

So the same jump worked or failed depending on how busy the phone was. On the
shared bar they clear by 15.7px at 60fps and 9.2px at 30fps. This is not making
them newly jumpable — they already were, nominally. It is making that true on
the device instead of on the desk.

**What the bar does not do** is put him above the danfo's roofline. Nothing can
at this jump height; he crosses at its shoulder and the depth sort takes him
behind it. If he should visibly top it, that is `PLAYER.jumpVel`, not this.

`_chromakey/vehiclejump.js` (18 checks) pins both directions: a hop and a
near-miss are still stopped, the bar and apex are read live so retuning either
moves the checks with them, and the bus is asserted UNCHANGED so nothing becomes
jumpable by accident. `vehiclesAt()` now reports each vehicle's span, art height
and clearance bar, so the harness hardcodes none of them.

**Two harness traps found the hard way here**, both of which produced confident
nonsense before they were understood:

- **The wave gate.** While `waveState === 'fighting'` the player is clamped to
  `currentGate() - 60`. A probe that parks him at the bus (x 6500) silently
  tests whatever sits at x=4983 instead — which is how "the bus is jumpable"
  was briefly, and wrongly, measured. `freeRoam()` first, always.
- **Pinning `jumpY` is not pinning height.** The step integrates
  `jumpY += vy·dt`, so leaving `vy` to accumulate decays a pinned height a few
  px per frame until the body quietly drops under the bar. Re-zero `vy` with
  every pin.

---

## 5. ROOT CAUSES WORTH REMEMBERING

### 5.1 The intro "loop"
The briefing's Back (`levelTitle → briefing`) and Forward (`briefing →
loading`) re-ran the pipeline, and the loading gate sent the flow back through
`intro` — replaying the clip. Guards now:
- `introPlayed` is set in `finishIntro()` and cleared ONLY by `startLevel()`,
  so the loading gate goes straight to `levelTitle` on re-entry.
- The gesture layer is disabled during `splash`/`loading`/`intro`, so stray
  swipes can't trigger the ping-pong at all.
- A fresh level start still plays the cinematic exactly once.

### 5.2 The cache-bust landmine (still the most likely "nothing changed" cause)
The module URLs carried UNCHANGED `?v=` tags through many builds
(`game.js?v=ratelrage-camarea-v1`, `frontend.js?v=ratelrage-montserrat-v1`,
`touch.js?v=ratelrage-touch-v1`), so the WebView could serve cached modules.
All tags are now **`ratelrage-mobile-v3`** (index.html's two script tags and
game.js's frontend import). **RULE: bump the tag on every shipped build.**
Also uninstall the old app once after a tag change to clear prior caches.

### 5.3 The load deadlock (fixed)
Deferring `loadWorld()` on `phase === 'splash'` deadlocked harness pages whose
front end waits for `worldReady` before leaving the phase. The deferral is now
capped at 8 seconds and then starts regardless.

### 5.4 Old friends that bit us
- touch.js TDZ: `let` declarations used before their line threw at script
  start and silently killed the whole layer (banner, controls, taming).
- `setPointerCapture` on synthetic pointers throws — always guard.
- The main-thread cost that framed several bugs: the sprite prep's per-frame
  readbacks; on the phone they must stay CPU-raster (`willReadFrequently`).

---

## 6. BUILD PIPELINE (from the project root)

```powershell
# 0. (only after art/media changes) regenerate the mobile assets
cd mobile; node gen-mobile-assets.js

# 1. web copy + mobile overlay
node build-demo.js

# 2. sync into the Android project
npx cap sync android

# 3. debug APK  (cd INSIDE the command string — the well-known trap)
cmd /c "set JAVA_HOME=C:\Users\kenec\AndroidDev\jdk-17.0.20.1+1&& set ANDROID_HOME=C:\Users\kenec\AndroidDev\android-sdk&& cd android&& gradlew.bat clean assembleDebug --console=plain --no-daemon > build-log.txt 2>&1"
```
Latest APK: `mobile\android\app\build\outputs\apk\debug\app-debug.apk`
(162.3MB, 2026-09-16, tags at `ratelrage-mobile-v7`). Bump the `?v=` tags
before every shipped build (§5.2).

**THE PATH TRAP IS REAL AND IT BIT AGAIN (2026-09-15).** The `cmd /c "... cd
android&& gradlew.bat ..."` one-liner returned exit 0, printed a BUILD
SUCCESSFUL tail, and built nothing — the log and APK were both twelve hours
stale. Prefer running gradle with the working directory already set:

```powershell
$env:JAVA_HOME  = "C:\Users\kenec\AndroidDev\jdk-17.0.20.1+1"
$env:ANDROID_HOME = "C:\Users\kenec\AndroidDev\android-sdk"
Set-Location "<project>\mobile\android"
& .\gradlew.bat assembleDebug --console=plain --no-daemon
```

and ALWAYS confirm against the clock, never against the log's contents:

```powershell
Get-Item app\build\outputs\apk\debug\app-debug.apk | Select LastWriteTime, Length
Get-Date
```

Transcodes (ffmpeg at `C:\Users\kenec\AndroidDev\ff\...\ffmpeg.exe`):
```
ffmpeg -y -i frontend/intro/Intro.mp4 -vf scale=-2:720 -c:v libx264 -preset veryfast \
  -crf 26 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart \
  mobile/assets-mobile/frontend/intro/intro-mobile.mp4
ffmpeg -y -i frontend/splash/studio-splash.mp4 -map 0:v:0 -map "0:a?" -vf scale=-2:720 \
  -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart \
  mobile/assets-mobile/frontend/splash/studio-splash-mobile.mp4
```
NOTE: `gen-mobile-assets.js` wipes only `layers/` and `sprites/` — the
`frontend/` twins must survive (a full wipe once deleted them).

---

## 7. VERIFICATION PLAYBOOK

| Harness (in `_chromakey`) | What it proves |
|---|---|
| `androidrepro.js` | Serves `mobile/www` under an Android UA (maxTouchPoints spoofed): world load completes, **no page errors**, the HUD editor builds/closes (`{built,closed,controls:[...]}`), a rightward swipe advances `title → menu`, and the front end reaches `levelTitle`. |
| `entrysmooth.js` | **The opening gate (§4.10.1).** 11 checks: steps the entry on a fixed dt, samples the DRAWN bar depth every frame and asserts the derivatives — full black to open, monotone, parks at the half gate, and no abrupt change of speed anywhere. Carries a **control** that rebuilds the old max() curve from the same run and shows the measure catching it (10.00 vs 1.00 px/frame²). |
| `bossentry.js` | **The stand-off (§4.10.2).** 26 checks: runs the entrance from four wildly different crossing points (including PAST the mark, the old no-walk case) and asserts one identical shot — same fixed start, same 420px walk, same marks, facing Olodo, on his row, no teleport. |
| `menutapverify.js` | **The §4.8 work.** 24 checks under an Android UA, with `window.RatelHost` stubbed to COUNT quits instead of leaving (so the run survives its own quit test): the gesture layer is up on the menu, tapping a row opens it, tapping empty right-hand space activates the selection, a tap on empty LEFT space commits nothing, QUIT arms on the first press and goes on the second (and a lapsed arming does not), `QUIT TO DESKTOP` appears in the pause list and is reachable BY TAP, and the editor's size/opacity sliders resize the control on the frame they move. |
| `pauseverify.js` | 34 checks on the pause menu. **Was 8/26 before 2026-09-16** — for two reasons, both in the harness: a hardcoded five-item roster that went stale when CUSTOMIZE CONTROLS was added, and no wait for the narrated level entry (`togglePause` refuses while `levelEntryActive`, so every KeyP was being discarded). It now reads the roster from `__ror.pauseMenu.items`, finds named rows by label, asserts pad movement as movement rather than as named rows, and waits out the entry. Waits are 20 frames, not 4-6: the front end's press beat is 0.19s. |
| `touchverify.js` | **The three §4.7 glitches.** 14 checks under an Android UA. Splash: samples `__rorMenu.splash.t` every frame across the whole card and asserts it never jumps backwards. Stick: dispatches real PointerEvents at `#ror-move` and asserts on the synthetic keys that come out — a walking push presses the direction ONCE (no accidental rush), reversing the thumb releases right then presses left in that order, a genuine fast flick still fires tap-release-tap, and lifting still releases. Bars: re-derives the shipped alpha curve and asserts it is monotone and already gone before the bar leaves frame. **Loads the page twice on purpose** — the stick half needs `rorSkipToGameplay`, which would skip the splash the first half is measuring. |
| `voiceverify.js` | **The narration path (§4.6).** 10 checks under an Android UA: the front end opens one AudioContext (two total, the other is game.js's — three means `initSfx` ran twice and stranded the decoded reads), the case-file read decodes to its real 45.897 s, it plays, `currentTime` advances in real time, `briefT` tracks the narrator instead of falling to its dt fallback, a seek lands where asked, `pause()` freezes the clock, no page errors. Needs `--mute-audio`, or headless has no output device and the context never leaves `suspended`. |
| `spriteheights.js desktop\|android` | Drawn heights per sheet in both worlds — walk 187 / idle 186 / combatwalk 184 must match across modes. |
| `zoomverify.js` | 21 checks: backing store, zoom, bands, vehicles, collisions, boss framing. Expect 21/21. Its boss check asserts the shot sits deliberately ABOVE plain band framing with both fighters still in view (§4.11.7) — it used to pin the pre-lift row and had to be replaced, not renumbered. |
| `vehiclejump.js` | **Vehicle clearance (§4.12).** 18 checks: measures the stepped arc LIVE (145.7px, not the 152.1 the closed form gives), reads every span/height/bar from `vehiclesAt()` so retuning moves the checks with it, and pins both directions — a hop and a near-miss are still stopped, the danfo and kekes go over, the bus is asserted unchanged. Calls `freeRoam()` first: under `fighting` the player is clamped to the wave gate and a probe at the bus silently tests x=4983 instead. |
| `waveverify.js` | 14 checks on waves/reinforcements. Expect 14/14. |
| `assetmover.js` | The F3 asset editor (desktop-only tool). 18/18. |

All harnesses run from `_chromakey` with puppeteer + `--use-gl=swiftshader`
(without it rAF is dead in headless and the load stalls).

---

## 8. MANUAL TEST CHECKLIST (phone)

1. **Splash**: KenCraft card plays cleanly, full-screen, no pop/stutter, no loop.
2. **Intro**: plays once, **with narration**; tap if it starts silent. Backing
   out of the case file and going forward again must NOT replay it.
3. **Briefing**: text runs with the VO to the end (no early finish).
4. **Menus**: swipe right = enter, left = back, up/down on the right half
   scrolls; taps on buttons still work.
5. **Pause**: the `II` button pauses; menu taps/swipes navigate; taps are
   accurate.
6. **CUSTOMIZE CONTROLS**: from the pause menu; drag every control; SIZE and
   OPACITY sliders; HIDE/SHOW; SAVE; DONE returns to the pause menu; RESUME
   resumes. Kill and reopen the app → the layout persists. RESET restores.
7. **Movement**: touch far-left, centre-left, bottom-left and on the stick —
   all move; the stick snaps to the touch origin.
8. **Multi-touch**: move + jab/kick/jump/block/grab simultaneously.
9. **GRAB**: hold on an enemy → carried; release → thrown.
10. **Rush**: fast flick left/right in the movement region → burst; lifting
    the finger stops it.
11. **Edges**: controls at min/max scale near each screen edge stay tappable.
12. **Full-screen**: gameplay, menus and both cinematics fill the display.

---

## 9. OPEN ITEMS / RISKS

- The gesture swipe thresholds (60px horizontal, 46px steps) are first-pass
  values — tune on device if they feel loose or twitchy.
- The pause menu's hitboxes are canvas-drawn; forwarded taps use the same
  coordinates, so if a future menu change moves hitboxes, the forwarder keeps
  working (it is coordinate-transparent) but verify after any menu redesign.
- The mobile twins assume the masters' durations (37.13s intro, 6.006s splash)
  are preserved by the transcode — they are, but re-check after re-encoding.
- `mobile/DEBUG-STATE.md` remains the packaging-level handoff; this document
  is the controls/media reference. Keep both current.
