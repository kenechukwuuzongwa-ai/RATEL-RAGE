# Turn diary

## 2026-08-26 19:49 — Menu Darki placement: make the code default authoritative
**User asked:** Their manual placement of Darki on the menu reverted to the code default; bake their current positioning in as the default and always load it.
**What I did:**
- Traced the placement to `src/frontend.js` — `L.darki` (line ~67) is the code default; the F9 tool / `__rorMenu.darki` persists overrides to `localStorage['ratelrage.darkiPlacement']`.
- Went looking for their saved numbers so I could bake them: searched WizardGenie's Electron Local Storage leveldb (both partitions) and the Chrome/Edge default profiles. **No `ratelrage.*` key survives anywhere** — not even `ratelrage.settings`. The store was wiped, which is exactly why he snapped back to `{ cx: 900, feet: 628, scale: 1, flip: 1 }`. So the numbers are not recoverable from disk.
- Fixed the half of this I could do without them: added `DARKI_STAMP` — every save now records the code default it was nudged away from, and `loadDarkiPlacement()` drops any save whose stamp no longer matches. Previously a stored override outranked `L.darki` forever, so editing the default would have moved him for nobody who had ever dragged him. Now baking a placement actually takes effect.
- `node --check src/frontend.js` passes.
**Result:** Mechanism ready; the numbers are still missing. Asked the user to press F9 → C in the menu (copies a paste-ready `darki: { ... },` line to the clipboard and logs it) and hand it over, then I write it into `L.darki`.

## 2026-08-26 19:57 — Baked the menu Darki placement in as the code default
**User asked:** Supplied their placement — `darki: { cx: 777.1, feet: 683, scale: 0.92, flip: 1 }` — to become the default.
**What I did:**
- Wrote it into `L.darki` at `src/frontend.js:67`, replacing `{ cx: 900, feet: 628, scale: 1, flip: 1 }`.
- Rewrote the comment above it so the value reads as intentional: it is placed by eye, not derived. Recorded the arithmetic a future tidier would otherwise "fix" — feet 683 is 337 px below the horizon, so `GROUND` says 400 px tall and the 0.92 draws 368, deliberately 8% under the plate's perspective because the crouched idle reads too big at the honest height.
- Verified all three values pass `clampPlacement` untouched (cx within ±400 of the frame, feet below `horizon+20`, scale within 0.1–4) — a clamped value would have silently shipped something other than what they placed.
- `node --check src/frontend.js` passes.
**Result:** Done. Last turn's `DARKI_STAMP` does its job on this very edit: the stamp is derived from `L.darki`, so changing the default invalidates every stored override automatically and the new placement loads on first launch without needing `darkiReset()`. Console will log "dropped a saved placement from an older code default" once, then go quiet.

## 2026-08-26 23:05 — Killed the two-session leak; moved Olodo's speech inside the letterbox
**User asked:** (1) After beating Olodo, picking a level restarts Level 1 but the old soundtrack keeps playing — feels like two parallel sessions. (2) The Olodo speech should play inside the letterbox transition, with Olodo emoting but not attacking, Darki idle until the line ends, and the letterbox also covering his walk-in.
**What I did:**
- **Session leak** — found the cause: `onChooseLevel` called `frontEnd.startLevel()` and nothing else. The front end going active only *hid* the finished run. `musicStarted` stayed true so `startMusic()` at the next handover was a no-op and the old score played on under the menu ambience; worse, `aftermath.active` stayed true, and game.js's keydown/mouse/pad handlers all check it *first* — so once gameplay resumed the dead sequence swallowed X/Enter/Space/arrows before the sim saw them. Added `endMission()` (game.js:7787) — stops the aftermath, drops the case file, kills voice + music — called from the level-select door *and* from `startLevelEntry`, so no future route into a level can forget it.
- **Boss speech** — the 21.7 s `reachOlodo` line used to run over free play in a `waveState === 'approach'` that held the last gate shut with a "GATE OPENS IN 21" countdown, with Olodo not yet on screen. Moved it into the entrance cutscene: new dynamic `speech` phase whose length is *derived* (`line − beats that play under it` = 17.39 s), so the line ends exactly as `ready` begins. Bars stay in for all of it, Olodo emotes with his AI asleep, Darki holds combat idle. `CUT.silentHold` (0.80 s) covers muted/blocked audio so the scene can't hold 17 silent seconds. `skipCutscene` now stops the line. Removed the now-purposeless `approach` state and its countdown HUD.
- **Verification** — wrote `_chromakey/speechscene.js` (relaxes autoplay policy so the line really plays) and `_chromakey/sessionleak.js`. Fixed `bossverify.js`, whose 1200-frame cap cut the longer scene off and whose screenshots were driven to fixed times; both now follow named phases.
**Result:** All green. speechscene: scene 22.78 s, narration covered with +0.10 s slack, bars never reopen, neither fighter swings. sessionleak: 6/6. aftermathverify 35/35, outroverify and bossverify unchanged. Flagged to the user that the stand-off is ~17 s of two men holding, and where the knob is.

## 2026-08-26 23:40 — Letterboxed the Level 1 opening narration + a controls-disabled caption
**User asked:** Play the Level 1 entry VO behind letterbox bars to mark it as cinematic, and tell the player their controls are off for it.
**What I did:**
- The entry was already a cutscene in everything but appearance — `updateLevelEntry` calls `swallowInput()` for its whole 18.8 s (the duration *is* the narration's, handed over by the front end), and the walk-in only accounts for the first three of those. So the player held a dead pad for ~15 s with nothing on screen saying why.
- Added `levelEntry.letterbox`, damped in over the dossier dissolve and pulled back `LEVEL_ENTRY.barsOut` (0.75 s) before the line ends, through the **same** `drawLetterbox()` the boss entrance and outro use — one visual language for "this is a scene". `outAt` is clamped at 0 so a short entry (test hooks pass 0.4 s / 6 s) degrades to never closing rather than flashing bars at a scene that is already over.
- New `drawEntryNotice()` puts the reason in the bottom bar: **CONTROLS DISABLED** / *NARRATION IN PROGRESS*, plus a thin progress rule drawn off the narration's own clock — "controls disabled" with no end in sight is only half an answer. It rides the bars (alpha scales with `letterbox`), holds back until the bar is deep enough to contain the text, and waits out the dossier dissolve so it isn't printed across the case file.
- Wrote `_chromakey/entryscene.js` — traces the bars across a real 18.779 s entry, mashes every attack throughout, and shoots four beats.
**Result:** 6/6. Bars peak at 1.0, never dip mid-narration, and are at 0.000 on the frame control returns; nothing mashed registered; `waveState` reaches `fighting` normally; the 0.4 s entry peaks at 0.0. Screenshots confirm the caption is absent during the dissolve, present and legible mid-narration, and gone at hand-back. aftermathverify 35/35 and sessionleak still green.

## 2026-08-26 23:52 — (greeting)
**User asked:** "hi" — no task.
**What I did:** Nothing to the project. Recapped the session's three landed changes (menu Darki default, the post-mission session teardown, the two letterboxed narrations) and asked what to pick up next.
**Result:** Idle, awaiting direction. No files touched.
