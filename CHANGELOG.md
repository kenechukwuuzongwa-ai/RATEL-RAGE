# Changelog

## 2026-07-12 — Lagos street side-scroller slice

- Added `src/game.js`: side-scroller with movement (A/D, arrows), jump
  (Space/W/Up, with coyote time, jump buffering and variable height), camera
  follow, and a code-rendered Lagos street tileset (asphalt, yellow lane
  markings, potholes, zebra crossing, paving slabs, kerb + open gutter,
  laterite earth) plus street props: kiosks with painted signboards,
  corrugated zinc roofs, danfo buses, power poles with sagging cables,
  harmattan-haze sky and parallax skyline.
- Player uses `VDM-Walk .png` (4×4 sheet, frames auto-sized from the image;
  the stale frame sizes in `VDM-Walk.json` are ignored). Animations are read
  from `VDM-Walk.json` at load: `animation.sections` (walk/idle/jump matched
  by name or role) when present, otherwise the full `defaultAnimation` range
  drives the walk cycle. Opaque sheet backgrounds are keyed out at load by
  flood fill from the frame border, then every frame is cropped to the union
  opaque bounding box so the character — not the frame padding — is anchored
  feet-down and centred over his shadow.
- Added `tests/drive.html`: deterministic input-driven simulation harness
  (steps the game loop with fixed dt and logs player state) for headless
  verification.

## 2026-07-14 — Uppercut combat (VDM-Uppercut sheet)

- Integrated `VDM-Uppercut.png` (6×5 grid, 1024×836 frames; cells 27–29 are
  empty) as the player's uppercut attack on J / K, grounded only. Movement,
  lane change and jump are locked for the swing; the animation plays once
  (30 fps, frames 0–26) and settles back to idle.
- Authored `VDM-Uppercut.json` in the Sorceress Sprite Analyzer manifest
  format (no analyzer export existed — `ASSETS/sprite_sheets.json` covers a
  different stance sheet and reports `combatFiles: 0`). Custom sections tag
  windup (0–8), strike (9–14) and recovery (15–26); the manifest's `combat`
  field points at `VDM-Uppercut.hits.json`.
- Authored `VDM-Uppercut.hits.json` (analyzer hitbox format, exported-frame
  pixel space): fist + forearm boxes on frames 9–14 with `active: true`,
  damage 14, knockback {240, −460}. The loader maps boxes into draw space
  through the same key-out/crop/scale pipeline as the frames and only deals
  damage on listed active frames; one hit per enemy per swing.
- Sprite loader: honours a `combat` pointer generically, respects
  `defaultAnimation.loop`/section `loop` flags, and a new `bodyFrame` config
  scales a named stance frame (not the union box, which the raised fist
  inflates) to the shared character height so sheets match visually.
- Enemies now have a comic non-lethal reaction state machine: hit (sails
  back, tilted, with knockback physics) → down (KO'd flat on the tarmac with
  circling stars, 1.6 s) → back up and walking. Depth-sorted overlap with the
  player unchanged.
- `tests/drive.html`: added a deterministic uppercut scenario (teleport into
  range, swing, assert enemy hit → down → recovered) plus a mid-strike
  screenshot state; `window.__ror.debugHitboxes = true` draws live hitboxes.

## 2026-07-15 — New walk cycle (Newwalksprite sheet)

- Swapped the player's walk cycle from `VDM-Walk .png` (4×4) to
  `Newwalksprite.png` (5×4 grid, 512×418 frames). Animation is fully
  manifest-driven from `Newwalksprite.json` (copied from ASSETS): 20-frame
  loop, frames 0–19 at 27 fps per `defaultAnimation` — no sections defined.
  Same load pipeline (background key-out, union-box crop, foot anchoring);
  idle and uppercut sheets unchanged.
- `tests/drive.html`: added a `?walkshot=N` mode that walks N fixed steps and
  stops mid-stride for visual screenshot checks.

## 2026-07-15 — Painted building backdrops (BUILDINGS folder)

- Replaced the code-drawn shop buildings (drawShop, SIGN_NAMES, SHOP_COLORS)
  with the five painted buildings from `../BUILDINGS`, copied to
  `buildings/` as shanty1/shanty2/corner1/corner2 (.jpg) and tenement.png.
- Background removal is data-driven from `buildings/buildings.json`. Each
  entry defines its boundary: a source-pixel crop rect + paper-key tolerance
  for the four watercolor pieces (excludes splatter and background washes),
  or a cutout polygon for tenement.png, whose background is a full city
  scene (the polygon also excludes the bottom watermark).
- New `keyOutPaper()` removes the paper backgrounds: a border flood fill on a
  1/8-scale copy finds the background region (thin drawn wires vanish at that
  scale, so pockets they seal off reconnect to the border), the mask is
  dilated 2 cells, then full-res pixels are erased only when inside the mask
  AND within colour tolerance of the paper — preserving wires and painted
  white walls.
- Street placement mixes the five cutouts in a shuffled bag with 0.85–1.15×
  scale variation and 40–220 px gaps; danfo buses moved to fixed positions.
  Buildings still render behind the power poles, sidewalk and road.

## 2026-07-15 — Depth + fog for the building row

- Pushed the painted buildings into the background: they now scroll at 0.75×
  camera speed in their own backdrop layer, are scaled to 0.72× of their
  former size, and stand on the red-earth strip behind the sidewalk
  (BUILDING_BASE) instead of the kerb line.
- Fog: a harmattan haze tint (rgba 218,209,190 @ .38) is baked into each
  cutout at load, plus a per-frame vertical fog gradient over the backdrop
  that thickens toward the buildings' bases. Poles, wires, danfos, road and
  actors stay unfogged in front for depth contrast.
- Replaced the old hard-edged haze band with the gradient and softened the
  far parallax skyline boxes to a fainter blue-gray so all three distance
  layers (skyline → buildings → street) read as receding planes.

## 2026-07-15 — Buildings grounded, moving danfo traffic

- Lowered the building row ~2 scene metres (BUILDING_BASE now GROUND_Y − 10):
  the raised walkway hides their feet so they read as planted, not floating.
- Replaced the two parked danfos with six moving buses on the far lane
  (BUS_LANE_Y): random speeds 130–240 px/s in both directions, wrap around
  the world, 0.7–0.82× scale, drawn at 85% alpha inside the parallax
  backdrop under the fog gradient — wheels hidden behind the walkway.
  drawDanfo() now takes an explicit baseline for reuse at any depth.

## 2026-07-15 — Project structure + design docs (RageOfRatel/)

- Created the formal project tree `RageOfRatel/` (docs, assets, sprites,
  sounds, music, cutscenes, levels) per the production brief.
- Wrote the six docs: instruction.md (working agreement: combat first,
  arcade first, animation/combat rules), game_design.md, combat_design.md
  (attack anatomy: startup/active/recovery, hit stop, knockback, sparks,
  shake; enemy archetypes; boss phases), asset_pipeline.md (Sprite Analyzer
  format + runtime pipeline as implemented), prompt_library.md, and
  mvp_checklist.md (prioritized, with current implementation state checked).
- Runtime stays at the repo root for now; migration into the tree is a
  checklist item so the playable slice never breaks mid-reorg.

## 2026-07-17 — Sprite enemies (Ginger + wizard) and player jump animation

- New street enemy "Ginger" from `Ginger.png` (9×9 grid of 512×512). The
  81-frame export had no sections, so `Ginger.json` hand-segments it after
  frame inspection: guard idle 0–26 (loop 35 fps), hit recoil 27–44 (once),
  guard advance 45–62 (walk, loop 30 fps), block flinch 63–80 (spare).
  resolveAnims now also maps hit/hurt/recoil sections and "advance" walks.
- Second enemy type: pixel wizard from `EnemyWizard-Walk.png` (6×6, frames
  0–30 drawn; hand-authored manifest). Walk-only — hit/down reactions fall
  back to a frozen frame with the tilt/knockdown physics.
- Enemies are now fully sprite-rendered (rectangles gone): foot-anchored,
  facing-flipped, guard-up + face the player within 170 px, tilt while
  airborne from a hit, and lie flat (sprite rotated) with KO stars while
  down. Fixed the hit test to accept the new guard state.
- Player jump animation from `Jump.png` (Jump.zip export, 6×6 of 2048×1676,
  frames 0–31 @ 30 fps, loop off): plays once per jump and holds the final
  falling pose on long arcs; landing hands back to walk/idle.
- `tests/drive.html`: new `?jumpshot=N` mid-air capture mode; sim re-verified
  (uppercut chain vs both enemy kinds, jump frame progression).
- Note: `Jump_2048x1676_sheet.png` (raw 8×8 export) and
  `Wizard_Walk_sheet_xi56.png` (duplicate) are unused; the game reads
  `Jump.png` + `Jump.json` and `EnemyWizard-Walk.png` + `.json`.

## 2026-07-17 — Enemy facing, seek AI, size up

- Both enemy sheets actually face RIGHT (confirmed via sheet close-ups);
  flipped `faces` on GINGER_SHEET and WIZARD_SHEET — this was the wizard
  moonwalk and the wrong-way guard stance.
- Replaced decorative patrolling with seek AI: enemies in sight (Δx < 560,
  same lane band) advance on the player — including across lanes — and
  switch to guard at punching range (Δx ≤ 130); they only patrol when the
  player is far. Ginger's planted-feet guard shuffle now always moves toward
  the player, so it reads as an advance instead of a backwards slide.
- Scaled enemies up: Ginger 185 → 205, wizard 190 → 210.
- `tests/drive.html`: new `?enemywatch=1` mode logging enemy state/anim/
  frame/facing over time; full sim re-verified (hit chain, getup re-seek).

## 2026-07-17 — Removed the wizard enemy

- Removed the wizard enemy type: WIZARD_SHEET config, sprite load, and the
  kind branch are gone; all four spawns are Ginger now. Deleted the derived
  `EnemyWizard-Walk.png` / `.json` (the original `Wizard_Walk_sheet_*.png`
  uploads remain untouched in the folder). Sim re-verified.

## 2026-07-17 — Enemy stride walk cycle (enemywalk sheet)

- Ginger now walks with the new `Enemywalk.png` stride cycle (6×6 grid of
  512×512, frames 0–34 @ 30 fps per the analyzer manifest, saved as
  `Enemywalk.json`). Idle and hit reactions stay on `Ginger.png`;
  enemySpriteFor(anim) picks the sheet per animation, and the guard-advance
  shuffle section is no longer used for locomotion.
- Wizard enemy removal confirmed (no references; files already deleted).

## 2026-07-17 — Enemy movement speed doubled

- Doubled enemy speeds (46–64 → 92–128 px/s) so ground movement matches the
  stride length of the new walk cycle instead of foot-sliding.

## 2026-07-17 — Randomized mob behaviour (roles)

- Enemies no longer mirror each other. Each gets a role — front (press to a
  personal standoff distance), flank (cross to the player's far side), lurk
  (hold ~300–390 px out, gingering in guard) — plus seeded per-enemy quirks:
  standoff 115–170, lurk distance, lane bias ±24 so nobody stacks, and a
  2.5–5.5 s role re-roll timer that keeps the mob reshuffling mid-fight.
  All randomness is seeded (mulberry32) so test runs stay deterministic.

## 2026-07-17 — Glassmorphism dev tuner + lane separation

- Added an on-screen glassmorphism control panel (top-right gear, starts
  collapsed). Paired slider+number inputs drive a live `tune` object:
  player/enemy scale, building scale/base-Y/parallax, bus lane-Y/scale, fog
  density, and the two body-separation gaps; plus a Lane-sep toggle, Reset,
  and Copy-to-JSON. Scales are draw-time cosmetic previews (foot-anchored) —
  find a value, then bake it into the sheet's drawH. Exposed as
  `window.__ror.tune`; suppressed in tests via `window.__rorNoPanel`.
- Keyboard handlers now ignore events while typing in panel inputs, so WASD
  no longer moves the character when tuning.
- Lane separation: `separateActors()` pushes overlapping bodies apart along
  the axis of least penetration (stacked → different lanes, side-by-side →
  horizontal), 2 relaxation passes/frame; the player is immovable so enemies
  can't shove him. Airborne/downed actors are exempt.
- Draw order hardened: actor depth is bucketed (8 px) with a stable id tie-
  break, ending the per-frame z-sort flicker when two actors shared a lane.
- `tests/drive.html`: added `?overlap=1` (asserts two stacked enemies end up
  separated) and a `__rorNoPanel` flag; verified alongside the combat sim.

## 2026-07-18 — Streets-of-Rage mob AI + steering collision avoidance

- Researched Bare Knuckle / Streets of Rage enemy behaviour (SoR4 design
  talks + Celia Wagar's beat-em-up AI writeup + the attack-token pattern) and
  prototyped the blueprint. Replaced the role-based movement with a per-enemy
  state machine (`stepEnemyAI`): patrol → menace (orbit an assigned slot
  around the player, some behind) → windup (telegraph) → attack (lunge) →
  recover → cooldown.
- **Attack token**: a shared `attackTokens` set caps simultaneous attackers
  at `ENEMY.maxTokens` (1). Non-holders menace — circle from spread slots,
  never clump — and take turns; the token frees on recover or when the holder
  is hit. Per-enemy cooldowns + amble speeds keep them asynchronous.
- **Telegraph**: a red flashing chevron over the head during windup ("attack
  about to go off") so the player can react.
- **Collision avoidance is steering-first**: `moveToward` + `laneDodge` make
  enemies walk AROUND bodies in their path (including rounding behind Darki);
  `separateActors` is now only a gentle, speed-capped last-resort nudge (and
  the call site's missing `dt` bug is fixed). Enemies pass each other and the
  player instead of shoving/glitching.
- `tests/drive.html`: added `?mobwatch=1` — verifies max 1 token at a time,
  enemies on both sides (surround), and a minimum body gap (no overlap).
  Verified: maxTokensSeen=1, bothSides=true, minBodyGap≈32; combat chain and
  `?overlap=1` still pass.
- Exposed `window.__ror.tokens`. Enemies render from the walk sheet in all
  states (avoids the Ginger/walk frame-index mismatch); dedicated attack/hurt
  sheets remain a TODO.

## 2026-07-18 — Shadow tuning controls

- Added ground-shadow transform + scale to the `tune` object and the dev
  panel: Shadow scale X/Y, offset X/Y, and opacity. Applied to both the
  player and enemy shadows (the enemy shadow's opacity is now unified with
  the player's under `shadowAlpha`). Defaults reproduce the current look
  (scale 1/1, offset 0/0, alpha 0.30) so opening the panel shows live values.

## 2026-07-18 — Enemies keep a safe distance; no more frozen walk

- Fixed enemies running into Darki and freezing their walk. The orbit ring
  collapsed onto his column in the shallow lane space (so "sides" of the ring
  landed on top of him), and squared-up enemies hard-froze on frame 0.
- Rewrote the menace behaviour: each enemy holds a SAFE standoff (150–220 px)
  on its assigned side, fanned across depth by laneBias, doing an in/out
  footwork bob so it keeps distance and its feet keep moving. Only the token
  holder leaves the standoff — 'approach' closes to strike range, the lunge
  now stops at `ENEMY.minGap` (66 px, never buries in), and 'recover' steps
  back out before the token frees. Enemies occasionally flank to the other
  side (walking around Darki via the existing steering).
- Walk animation now cycles in every active state (only hit/down hold a
  pose), so squared-up enemies bounce on their feet instead of freezing.
- Verified: maxTokens=1, both sides occupied, min body gap ~31, non-attackers
  stay 150+ px out; combat knockdown chain still passes.

## 2026-07-18 — Impact feedback: hit stop, sparks, screen shake

- Added the combat-feel "juice" trio to the uppercut hit path (combat is
  priority #1). On a confirmed hit, `triggerHitFx` fires all three:
  - **Hit stop**: `update` freezes the whole sim for `tune.hitStop` (0.09 s
    ≈ 5–6 frames) while effects keep animating (`advanceFx` runs first).
  - **Hit sparks**: a white flash + yellow starburst at the contact point,
    drawn in world space, ~0.22 s life.
  - **Screen shake**: a short decaying camera jolt (`tune.shakeMag`, 8 px)
    applied as a draw-time translate; the HUD stays steady, and the sky is
    overscanned so the shake never exposes an edge.
- Both `hitStop` and `shakeMag` are live-tunable in the dev panel; exposed
  `window.__ror.hitStop/shake/sparkCount` for tests.
- Gave each enemy a distinct depth lane (`laneBias = -33 + id*22`) so
  same-side enemies never target the same spot (min body gap back to ~33).
- `tests/drive.html`: added `?hitfx=1` (asserts hit stop + spark + shake all
  fire on a pinned hit) and `?hitfx=shot` (freezes on the impact frame).
  Verified: peakHitStop 0.09, spark spawned, shake 0.16; combat hit→down→walk
  chain, mobwatch (1 token, both sides, gap 33) and overlap all still pass.

## 2026-07-18 — Dev panel settings persist

- The tuner now saves to localStorage (`ror.tune.v1`) on every change and
  reloads it on boot, so the debug settings stay "as they are now" across
  refreshes instead of resetting to the baked-in defaults. Reset restores the
  built-in defaults and clears the saved copy. Verified: pre-seeded values
  load on init; tests (panel suppressed via __rorNoPanel) stay deterministic.

## 2026-07-19 — Ginger enemy animation set wired in

- Finished the enemy (Ginger) animation integration — closes the earlier TODO
  ("enemies render from the walk sheet in all states; dedicated attack/hurt
  sheets remain a TODO"). `Ginger.png` was loaded but unused; enemies froze on
  walk-frame-0 whenever they were struck.
- New `enemyAnim(enemy)` router picks the sheet + section per state/mode and is
  the single source of truth for both `update()` and `drawEnemy()`:
  - **patrol / menace** (roaming footwork) → `Enemywalk.png` stride cycle;
  - **approach / attack / recover** (committed to a strike) → Ginger
    *guard advance* (the guard-up shuffle) — the enemy visibly squares up;
  - **windup** (`state='guard'`, the telegraph) → Ginger *guard idle*
    (fists-up bob) under the existing red chevron;
  - **hit / down** → Ginger *hit recoil* — a one-shot (loop:false) that holds
    its final frame through the KO, which the draw lays flat on the tarmac.
- The two sheets both face right and are foot-anchored at the same height, so
  swapping between them never flips or shifts the body. `enemy.animSpec` tracks
  the active section and resets `animTime` on a change so each state plays from
  its first frame (the recoil starts on the head-snap). The ground shadow width
  is pinned to the stride sheet so it doesn't pop when he squares up. `enemyAnim`
  also tags `enemy.anim` (walk/advance/guard/hit) for dev introspection.
- Verified headless (`_chromakey/enemyanim.js`): the router selects the right
  section for every state, facing stays left toward the player across all swaps
  (no flip), and there are no console errors. Existing `drive.html` scenarios
  still pass — combat chain (hit → down → walk), mobwatch (1 token, both sides,
  gap 32), overlap (separated), and hitfx (hit stop 0.09 + spark + shake 0.16).

## 2026-07-19 — Combat overhaul: Quick Jabs, uppercut rework, HP, rage

- **Modular attack system** (`ATTACKS` table + generic resolver). Each move
  lists curated sheet frames, an fps, a cancel window, and hit "windows" (keyed
  by step, grouped so an enemy is struck once per group). `resolveAttackHits`
  builds a world-space AABB per active window and tests it against each enemy's
  body box on the same lane. New attacks are a table entry, nothing more.
- **Quick Jabs** (`Quick_jabs.png`, LMB / J): a fast two-hit flurry — two
  distinct hit frames, light damage, quick recovery, small stagger (no
  knockdown) so it's a close-range pressure tool.
- **Uppercut rework** (RMB / K only; removed the old "either mouse button"):
  heavier and more telegraphed (9-frame windup), a single big launching hit
  (damage 20, strong vertical knockback) with a bigger flash/shake/hitstop.
- **Cancel / combo**: pressing right after the jabs (LMB→RMB "in quick
  succession") cancels the flurry into the uppercut via a short input buffer.
- **Health + damage**: Darki and each enemy have HP. Light hits stagger; heavy
  hits / killing blows launch. Enemy lunges now actually damage Darki (i-frames
  + hurtstun after a hit). Enemies KO and fade at 0 HP, then recycle into the
  wave off-screen so the brawl stays continuous. Darki KO → second-wind revive.
- **Rage bar** (under the health bar): fills as Darki deals and takes damage.
  At full it auto-bursts — gold screen flash, shockwave that knocks nearby
  enemies back, then a ~7s power state (×1.6 damage, faster movement + swings,
  pulsing golden aura + rising embers).
- **UI**: Darki HP + rage meters top-left (chunky arcade bars with a trailing
  "chip" on damage), floating HP bars above damaged enemies, hit flashes, KO
  fade. **Feel**: parameterized hitstop/screen-shake/flash per attack weight,
  shock rings, ember particles.
- Verified headless (`_chromakey/combatverify.js`): jab lands 2 hits (15 dmg),
  uppercut launches (20 dmg), jab→uppercut cancel fires, enemy lunge damages
  Darki, rage fills → activates with burst, KO → revive. mobwatch/overlap and
  the (now uppercut-driven) hit→down→walk chain still pass.

## 2026-07-19 — Single walk sprite (removed old walk + combat walk)

- Replaced Darki's walk with `NEW_WALK.png` (from `ASSETS/NEW SPRITES/`; 5×5
  grid, 22 frames, cells 22-24 empty) as the one and only walk animation — a
  fists-up fighting stride. Deleted the old walk (`Darki-VDM-Walk.*`), the
  separate combat-walk sheet (`combatwalk.png`/`Combatwalk.json`), and an
  interim `qVDM-Walk.*` swap.
- Removed the in-range "combat posture" switching (`combatwalk`/`combatidle`
  anim states, `COMBATWALK_SHEET`, `enemyInFightRange`): Darki now uses the new
  walk when moving and the idle stance when standing, in or out of a fight.
- Verified headless: walk/idle animate on the new sheet (foot-anchored, matched
  height), and the full combat suite still passes.

## 2026-07-19 — Two walks restored + project housekeeping

- **`NEW_WALK` is now the combat walk**, and the casual walk is back:
  `SHEET` = `darki-walk` (arms-down stride, out of range), `COMBATWALK_SHEET` =
  `darki-combat-walk` (the fists-up `NEW_WALK`, enemy in range). Restored the
  in-range posture switching (`enemyInFightRange`, `combatwalk`/`combatidle`
  anim states, rate scaling) so Darki squares up within `FIGHT_RANGE_X` and
  relaxes back to the casual walk when the coast is clear.
- **Housekeeping — all character sheets consolidated into `sprites/`** with
  consistent names: `darki-walk`, `darki-combat-walk`, `darki-idle`,
  `darki-jump`, `darki-uppercut` (+`.hits`), `darki-jab`, `enemy-ginger`,
  `enemy-walk`. Every `SHEET` src/metaSrc and the uppercut manifest's `combat`
  pointer were repathed; the root now holds only `index.html`, `styles.css`,
  `CHANGELOG.md`, `README.md`, `.gitignore` plus the folders.
- Retired duplicate/old source art, sprite zips, and the unzipped
  `Enemywalksprite/` into `_unused/`; moved the `.docx` design walkthroughs into
  `docs/`. Updated `README.md` (accurate controls + project layout) and the
  `_chromakey/facecheck.js` + `tests/sheetview.html` sprite paths.
- Verified headless: posture switching (far→walk/idle, near→combatwalk/
  combatidle), the full combat suite (jab/uppercut/cancel/enemy-hit/rage/KO),
  drive.html chain + mobwatch + overlap + hitfx, and a clean full boot with no
  missing-asset errors.

## 2026-07-19 — Idle sized to match the walk

- Darki "popped" a touch taller when he stopped: the idle art fills its frame
  more than the walk art, so at a shared `drawH` the idle rendered ~198px tall
  vs the walk's ~187px typical. Trimmed `IDLE_SHEET.drawH` to `200×187/198 ≈189`
  so the idle now renders at 187px — matching the walk's on-screen height (also
  fixes the hurt/KO poses, which reuse the idle sheet). Measured + confirmed
  with `_chromakey/measure.js`.

## 2026-07-19 — Idle faces the enemy · idle skin matched to the other sheets

- **Idle auto-facing**: when Darki isn't steering left/right he now turns to
  face the nearest live enemy (`nearestEnemy()` in `update()`), so he's always
  squared up and his next jab/uppercut lands the right way — the beat-em-up
  resting behaviour. Movement still overrides facing while walking.
- **Idle skin tone matched**: the idle sheet's midtones/shadows already matched
  the other Darki sheets, but its skin *highlights* rendered lighter and more
  yellow (`~168,103,66` vs the ensemble's true-skin `~168,92,60`). Recolored
  `sprites/darki-idle.png` with a brightness-ramped correction on warm-skin
  pixels only (G −11%, B −9% at the highlights; midtones/shadows and the white
  agbada / black tank untouched). Original preserved at
  `_unused/darki-idle.orig.png`; reproducible via `_chromakey/recolor-idle.js`.
- Verified headless: idle faces left/right toward the enemy, the recolored idle
  loads and renders in-game, and the full combat suite still passes.

## 2026-07-19 — Skin match v2 · combat-walk scale · pause · sprite debug

- **Idle skin re-matched to the walk** (v1 highlight tweak was too weak): the
  idle skin was both less saturated *and* more scattered than the walk (skin
  mean G `71` vs `51`; G/B spread ~2×). Replaced the ramp with a per-channel
  **mean+std colour transfer** (Reinhard) mapping idle skin → the walk sheet,
  classifying skin by **hue** (red-orange `(G-B)/(R-B) ≤ 0.48`) so the yellower
  cream agbada is left alone. Idle now carries the walk's saturated tone.
  Idempotent via `_chromakey/recolor-idle.js` (restores the pristine original
  first); `_chromakey/skinstats.js`→ folded into `measureskin.js`.
- **Combat walk scaled up**: its crouched fists-up stance read small next to the
  other sheets. Added per-sheet draw transforms; combat defaults to 1.1×.
- **Pause**: P or Enter toggles pause — freezes the sim (loop skips `update`),
  dims the frame with a "PAUSED" plate, and clears buffered presses so nothing
  fires on resume. `window.__ror.paused` / `togglePause()` exposed.
- **Darki sprite-transform debug**: new "Darki sprites (per-sheet)" dev-panel
  section with a scale + Y-offset per sheet (walk/combat/idle/jump/jab/
  uppercut), applied in `drawPlayer` on top of `playerScale` and persisted with
  the tuner — so any remaining size/alignment mismatch can be dialled in live.
- Verified headless: pause freezes then resumes movement (real loop), the combat
  suite + idle-facing still pass, and a clean boot with the expanded dev panel.

## 2026-07-19 — Left/right jabs + triple-click 5-hit combo (Quick_jabs removed)

- Replaced the single Quick_jabs move with three dedicated sheets in `sprites/`:
  `darki-jab-left` (LMB), `darki-jab-right` (RMB), `darki-combo` (5-hit). Old
  `darki-jab.*` retired to `_unused/`.
- **Controls**: LMB = Left Jab (quick lead, 7 dmg), RMB = Right Jab (heavier
  cross, 10 dmg), **triple-LMB in quick succession = the 5-Hit Combo**. Uppercut
  moved to keyboard **K** only (it lost RMB). J still mirrors the left jab.
- **Triple-click detection** (`registerLmbClick`): keeps the last three LMB
  timestamps and fires the combo only when both gaps are ≤ `COMBO_CLICK_WINDOW`
  (350 ms, a tunable const) — the third rapid click upgrades into the combo
  instead of a third jab; slow clicks stay individual jabs (no accidental
  triggers, verified with rapid-vs-slow real-loop tests).
- **5-Hit Combo**: `lock: true` in the ATTACKS table → uninterruptible; movement
  and other attacks are ignored for its duration, its five hit `groups` land
  five escalating hits (6/7/8/9 + an 18-dmg launching kick finisher = 48), then
  it settles back to the combat idle. Combo has priority — it interrupts an
  in-progress jab immediately; jabs still chain into each other / the uppercut
  past their `cancelStart`. The move table stays modular: a new move = one table
  entry + one line in `consumeAttackInput`'s priority list.
- Per-sheet transform debug + `spriteFor`/`darkiSheetKey` extended for
  jab-L/jab-R/combo. Verified headless: left/right jabs land + stagger, combo is
  uninterruptible/reaches the finisher/returns to idle, triple-click timing
  window works, uppercut + rage + KO + drive.html regressions all still pass.

## 2026-07-20 — Cinematic follow camera + parallax ratios

- Replaced the simple lerp with a SoR4 / TMNT-style follow camera (`updateCamera`,
  critically-damped `damp()`): the player is framed ~37% from the leading edge
  (bias eases on turns), with speed-proportional predictive **look-ahead**
  (±200px, eased in/out, softened ~45% near enemies), a soft **dead zone** (90px
  H / 50px V) that ignores micro-movement, and boundary clamping that stays
  smooth against the walls. Combat nudges the focus toward the player↔enemy
  midpoint so the nearest foe stays framed; never zooms or shakes. Verified
  headless: 37% framing both directions, 0 reversals / ~1px-per-frame max accel
  (glassy, no jitter/overshoot), clamps to [0, 4320], combat reduces look-ahead.
- Vertical follow (`cameraY`) is wired with its own dead zone + slower smoothing
  + lane-change threshold, but clamped to the level's vertical room — inert while
  `WORLD_H == VIEW_H` (single-screen level), ready for taller arenas.
- **Parallax ratios** updated to the requested depth: sky 0.05, far skyline
  0.12, residential 0.25, gameplay 1.0 (all driven from `cameraX`). No foreground
  1.35 layer exists yet (no art) — easy to add when there is one.
- New tunable camera params (`camFollow`, `camLookSmooth`, `camLookAhead`,
  `camDeadX/Y`, `camFrame`) live in `tune` with a dev-panel **Camera** section.

## 2026-07-20 — Uppercut chord (hold RMB + click LMB)

- Uppercut is now also thrown by **holding the right mouse button and clicking
  left** (in addition to K). While RMB is held (`rmbDown`), an LMB click fires
  the uppercut instead of a left jab; plain LMB is still a left jab, and a tapped
  RMB is still a right jab. Cleared on mouseup / mouseleave / window blur so it
  can't stick. Verified headless (real mouse events): chord → uppercut, not a
  left jab; plain LMB → left jab.

## 2026-07-21 — 5-hit combo → looping punch flurry + RMB kick finisher

- Reworked the combo into two phases. **Triple-LMB** starts `comboLoop` — the
  4-punch flurry (jab→cross→punch→hook, sheet frames 0-21) which **loops**
  (`loop:true`, `advanceAttack` wraps and resets the hit ledger each cycle so
  every pass connects). It's uninterruptible by jabs/uppercut. **One RMB** fires
  `comboKick` — the turn→high-kick→recovery finisher (frames 22-34, launching
  18-dmg kick), then it returns to the combat idle. **Without RMB the punches
  keep looping** (as requested) — RMB is the only way to break into the kick.
- `consumeAttackInput` special-cases RMB while `comboLoop` is active → `comboKick`
  (so RMB means "finish", not a right jab, during the flurry). Combo still has
  input priority and both phases are `lock`ed. Modular as ever: two table
  entries, one trigger line.
- Made `tests/drive.html` deterministic — it now stubs `requestAnimationFrame`
  (like the other verify harnesses) so scenarios advance only via manual
  `step()`, ending the dual-simulation nondeterminism.
- Verified headless: triple-LMB → `comboLoop`; the flurry loops (wraps) and its
  punches connect every cycle with no launch and can't be interrupted; RMB →
  `comboKick` launches and returns to idle; jabs / uppercut / chord / rage / KO
  and the drive.html chain + mobwatch + overlap + hitfx all still pass.

## 2026-07-21 — Enemy punch animation (Agbero_Jab)

- Enemies now throw a real jab when they attack. Imported `Agbero_Jab` (4×4/14f)
  → `sprites/enemy-jab.png` and added `ENEMYJAB_SHEET`/`gingerJabSprite`. The
  `enemyAnim` router plays it across the whole punch commit — **wind-up (`guard`)
  → lunge (`attack`) → recover** — as one continuous swing (same spec reference,
  so the clock doesn't reset). Boot builds a `jab` spec (14 frames, fps 22, loop
  false) tuned so the fist extends right as the lunge connects, then holds the
  retract through recovery. `approach` still uses the guard-advance; roaming the
  stride; hit/KO the recoil.
- Faces right like the other Ginger sheets and is foot-anchored at the same
  `drawH` (205), so no flip or size pop when swapping in/out of the jab.
- Verified headless (`enemyanim.js`): windup + attack both route to the jab sheet
  facing the player (no flip); size matches the stride/guard sheets; the combat
  suite, enemy-hit-Darki, drive.html chain + mobwatch + overlap + hitfx and a
  clean boot all still pass.

## 2026-07-21 — Combo: double-tap trigger + mash-sustained flurry

- The combo now opens on **two rapid LMB clicks** (was three) — `registerLmbClick`
  fires the flurry on the second click within `COMBO_CLICK_WINDOW`.
- The punch flurry is **mash-sustained** instead of looping indefinitely: it now
  self-ends `COMBO_HOLD` (0.28 s) after the last LMB click, so **it stops the
  instant you stop clicking** (no more commit-until-RMB softlock). Each LMB click
  during the flurry refreshes the keep-alive (`player.comboKeepAlive`, decremented
  in `advanceAttack` → `endAttack` on expiry); RMB still fires the kick finisher.
- Both timings are exposed consts (`COMBO_CLICK_WINDOW`, `COMBO_HOLD`).
- Verified headless: double-LMB → `comboLoop`; mashing sustains it (loops, punches
  connect, uninterruptible, no launch); it auto-stops to idle when the mash stops;
  RMB → `comboKick` launches and returns to idle; regressions all still pass.

## 2026-07-21 — Kicks: RMB high kick + back+RMB back kick (right jab retired)

- **RMB is now the kick button.** Imported `HighKick` (4×4/13f) and `BackKick`
  (4×4/15f) → `sprites/darki-highkick.png` / `darki-backkick.png`. The old right
  jab (RMB) is retired (`darki-jab-right.*` → `_unused/`).
- **RMB → High Kick** (`highKick`): foot up-and-forward, launches an enemy in
  front (15 dmg, `big`). **Back + RMB → Back Kick** (`backKick`): Darki spin-kicks
  BEHIND him — `kickWanted()` picks it when the held direction is opposite his
  facing (read before the movement step flips facing). Its hit window carries
  `box.back:true`, so `attackBox` places the hitbox on the side *opposite* the
  facing — it hits the enemy behind, not the one in front, and Darki keeps facing
  forward. Both are foot-anchored via `bodyFrame:0` (raised leg extends above the
  body box, so no shrink).
- RMB stays context-aware: during the combo flurry it's the kick finisher
  (`comboKick`); the hold-RMB+LMB uppercut chord still works (the uppercut now
  interrupts any non-locked move, so it overrides the high kick the RMB press
  fires). Input flag renamed `rightJabPressed` → `kickPressed`. Per-sheet debug +
  spriteFor/darkiSheetKey extended for high/back kick.
- Verified headless: RMB → high kick launches the front enemy; back+RMB hits the
  BEHIND enemy (not the front one) while keeping facing; combo finisher, uppercut
  chord, rage, KO, enemy jab and all drive.html regressions still pass.

## 2026-07-21 — Baked the tuned scene settings as defaults

- Promoted the dev-panel-tuned values to the code `tune` defaults so the game
  loads with them every time: `dScaleWalk` 1→1.08 and the ground shadow
  (`shadowScaleX` 1→1.62, `shadowOffsetX` 0→4, `shadowOffsetY` 0→-8,
  `shadowAlpha` 0.30→0.45). All other tuned values already matched the defaults.
- Bumped the persisted-settings key `ror.tune.v1` → `v2` so any stale saved tune
  can't override the new defaults; these load on every fresh boot (until the
  panel's **Save** writes a new v2 override). Verified headless on a clean boot.

## 2026-07-21 — Combo trigger → four rapid RMB clicks (single auto-combo)

- The 5-hit combo is now fired by **four rapid RMB clicks** and plays the whole
  thing once (jab→cross→punch→hook→launching kick, `combo5`, `lock`, 48 dmg),
  then returns to idle. Reverted the mash-sustained loop/kick split back to one
  auto-combo. LMB double-click no longer triggers anything (just a jab).
- `mousedown` counts a rapid-RMB run (`rmbCount`, gaps ≤ `COMBO_CLICK_WINDOW`):
  clicks 1–3 fire the normal High/Back Kick, the 4th fires `input.comboPressed`
  (and the combo interrupts the in-progress kick). Removed `COMBO_HOLD` /
  `comboKeepAlive` / the LMB double-click detector.
- Verified headless: 1 RMB → high kick, RMBx4 → `combo5` (full 5 hits, launch,
  uninterruptible, ends idle); high/back kick, uppercut, chord, rage, KO, enemy
  jab still pass. (Boot is slow (~30s) under heavy system load, so the verify
  harnesses now use `domcontentloaded` + a 90s boot wait instead of a 30s
  `networkidle2` navigation timeout.)

## 2026-07-21 — Enemies telegraph with the Ginger squaring-up bob before striking

- Restored the enemy tell: the wind-up now plays Ginger's **guard-idle "squaring
  up" bob** (fists up, weight shifting) instead of the jab's chamber — the strike
  (`mode:'attack'`) and pull-back (`recover`) still ride the jab sheet. Gives the
  gingers personality and readability before they throw hands. (When the jab was
  wired in, the wind-up had been folded into the jab sheet, which erased the
  distinct telegraph.)
- **Feints for personality**: each wind-up rolls `ENEMY.strikeChance` (0.78) —
  most commit to the punch, ~1 in 5 telegraph then pull back without swinging, so
  the player can't treat every square-up as a guaranteed hit.
- Retuned the swing so the jab reads as a punch now that it starts fresh on the
  strike: `windup` 0.36→0.45 (clearer bob), `active` 0.20→0.40 (fist has time to
  extend), and a `connectDelay` 0.16 so the hit lands as the arm extends, not on
  the chambered first frame.
- Verified headless: committed run shows the `guard` telegraph → `jab` strike →
  connects (8 dmg); feint shows the `guard` telegraph but never enters `attack`
  and deals no damage. Screenshot confirms the fists-up guard pose renders
  (foot-anchored, faces the player, no flip).

## 2026-07-21 — Combo trigger → four rapid LMB clicks (full fists-and-legs anim)

- Moved the 5-hit combo trigger from RMBx4 to **four rapid LMB clicks**. RMB is
  now purely the kick button (High Kick / back+RMB Back Kick) and no longer feeds
  the combo counter. `mousedown` counts a rapid-LMB run (`lmbCount`, gaps ≤
  `COMBO_CLICK_WINDOW` 350 ms): clicks 1–3 throw the Left Jab, the 4th fires
  `input.comboPressed`; being a `lock` move the combo interrupts the jab-in-
  progress and plays through. Holding RMB + LMB is still the Uppercut chord (that
  LMB doesn't count toward the combo run).
- The combo plays its **full 35-frame animation** — the fist strikes
  (jab→cross→punch→hook) *and* the leg-strike launcher finisher — start to
  finish (`advanceAttack` runs frames 0→34 before `endAttack`).
- Verified headless: 1 LMB → `jabLeft`, 1 RMB → `highKick`, LMBx4 → `combo5`
  (reaches the final frame, all 5 hits = 48 dmg, launches, uninterruptible, ends
  idle). All other moves unchanged.

## 2026-07-22 — Wave progression: gated arenas + "GO →" (MVP wave system)

- The street is now split into **three gated arenas** (`SECTIONS`, gates at
  1500 / 3050 / 4600, kill quotas 4 / 5 / 6). An invisible wall holds Darki (and
  the camera's right edge) inside the arena until the wave is cleared; then the
  wall lifts, a pulsing **"GO →"** shows, and crossing the gate advances the
  section. Past the last gate → **AREA CLEARED** banner (boss hook).
- Replaced the old infinite `respawnEnemy` recycle with a wave manager: the
  4-enemy pool is **drip-fed** to meet each quota (concurrency capped at the pool
  size) via `onEnemyDefeated` (reinforce vs. bench), then benched (parked
  off-screen in a spent `ko` state, skipped by the update loop and all the
  `ko`-gated helpers) until `advanceSection` seeds the next wave.
- HUD: "AREA n · k LEFT" counter while fighting, the GO arrow when cleared, the
  cleared banner at the end.
- Test hooks on `__ror`: `waveState`/`section`/`waveKills`/`gateX` getters,
  `freeRoam()` (drops walls for the camera/movement harnesses — wired into
  `cameracheck.js` + drive.html's `overlap`), and `tko()` (deterministic defeat).
- Verified headless: boot → `fighting` §0 with 4 enemies in-arena, wall holds the
  player at ~1434; clear 4 → `GO`; cross → §1 (5) → §2 (6) → `complete`. GO-arrow
  screenshot confirmed. No console errors.

## 2026-07-22 — Combo trigger → two rapid LMB clicks

- Moved the 5-hit combo trigger from LMBx4 to **two rapid LMB clicks**. `mousedown`
  counts a rapid-LMB run (`lmbCount`, gaps ≤ `COMBO_CLICK_WINDOW`): the 1st click
  throws the Left Jab, the 2nd fires `input.comboPressed` (the `lock` combo
  interrupts the jab-in-progress and plays all 35 frames). RMB stays the plain
  kick button (High Kick / back+RMB Back Kick, no combo counting); hold-RMB + LMB
  is still the Uppercut chord. Added `__ror.resetClicks()` so the verify harness
  can isolate the rapid-click counter between scenarios.
- Verified headless: LMBx2 → `combo5` (full anim, 48 dmg, launches), 1 LMB →
  `jabLeft`, 1 RMB → `highKick`; chord/kicks/uppercut/rage/KO unchanged.

## 2026-07-23 — Level 1 backdrop → single protest-wall mural

- Replaced the 4-layer parallax background with one full-scene mural
  (`layers/level1_map.png`, 4344×724 — night sky, protest wall, danfos and wet
  cobblestone baked into a single opaque image). Boot loads just that image
  (`bg = { map }`, three fewer image fetches); `drawFrontage()` draws it ONCE (no
  horizontal tiling, so the unique scene never repeats), scrolling 1:1 with the
  camera and scaled so it spans the world exactly (`streetScale = WORLD_W/img.width`).
- `MAP_ANCHOR_Y` (646) pins the mural's ground row to `tune.streetY` (620) so the
  fighters stand on the cobblestone; `drawSkyline()/drawBackdrop()` (far/mid) are
  no-ops. The dev panel's **Street** section still positions the mural live; its
  far/mid/atmosphere sliders are now inert. `TUNE_KEY` bumped `v2 → v3` so a stale
  saved `streetScale` can't misplace the new art.
- **Sky kept** (per follow-up): the updated mural ships a `#10C419` green screen
  for the sky region, chroma-keyed to transparent (green-dominance `G-max(R,B)`,
  hard>90 / feather 40–90 with green despill so scaling can't bleed a halo, in
  `_chromakey`; pristine green-screen source at `layers/level1_map.orig.png`).
  `drawSky()` still paints the harmattan gradient + `sky.png` clouds behind it —
  so the sky shows through the ragged wall top, the gaps between panels, and any
  keyed holes in the wall. Muted scene greens (flag, RATEL shield, green text)
  sit below the key threshold and are preserved.
- Verified headless: renders full-frame at the arena start and mid-world with the
  player grounded on the street, sky visible above the wall, scrolls with no
  seams/repeats, no console errors. Old `far/mid/gameplay.png` remain in `layers/`
  (unused); `sky.png` is back in use.

## 2026-07-23 — Hit SFX (varied punch sounds on every strike)

- Every confirmed strike on an enemy now plays a hit sound (`playHit` hooked into
  `hitEnemy`), from three samples in `sounds/` (`hit1/2/3.mp3`). Web-Audio one-shots
  through a master `sfxGain`.
- Anti-repetition + weight mixing (Capcom-style): samples are drawn from a
  reshuffled **bag** so no clip repeats back-to-back and all three cycle evenly;
  each strike is **pitch-jittered** (`playbackRate` ±6%) and **volume-jittered**
  (±~10%); **heavy hits** (uppercut / kick finisher / launchers, `win.big`) drop
  in pitch (0.9×) and rise in gain so they land meatier than a jab. All variation
  uses `Math.random`, never `combatRng`, so it can't perturb the deterministic sim.
- Audio is unlocked on first key/click (`resumeAudio` — browser autoplay policy),
  **M** mutes SFX, and every audio path is guarded so it never throws when audio
  is unavailable (headless). Decoding runs in the background so boot isn't blocked.
- Verified headless: all 3 samples decode (`sfxLoaded=3`), the SFX fires per enemy
  struck (jab + combo), mute defaults off, no console errors.

## 2026-07-23 — Combo taunt voice-overs (screen-panned)

- Landing a **full 5-hit combo** (all of `combo5`'s groups c1–c5 connect) fires one
  of Darki's two taunts — `you_all_gonna_learn_the_hardway` / `you_will_learn_new_things`
  (`sounds/vo_*.mp3`) — chosen randomly with no immediate repeat. A broken combo
  (enemy dies/leaves before all 5 land) stays silent.
- Full-combo detection: `startAttack('combo5')` resets a `comboHits` group ledger;
  `hitEnemy` adds each landed group and, when the finisher (`c5`) lands with all 5
  present, calls `playComboVoice()` once (`comboVoDone` guard).
- The line is **panned to Darki's on-screen position** via a `StereoPanner`
  (screen-x → −1 left … +1 right) for positional "surround", routed through the
  shared `sfxGain`; only one line plays at a time (`voicePlaying` guard), and it's
  muted by **M** with the rest of the SFX.
- Verified headless: both lines decode (`voiceLoaded=2`), a full combo triggers the
  taunt once, a partial combo triggers none, no console errors.

## 2026-07-23 — Level 1 background music (looping, fade-in)

- Added streamed looping BGM (`music/level1.webm`) via an `HTMLAudioElement`
  (`musicEl`, `loop=true`) — streamed rather than decoded into a Web-Audio buffer
  so a multi-minute track stays light on memory.
- Starts **from the top of the level** on the first user gesture (`startMusic()`
  from `resumeAudio`, gated by the same autoplay policy as the SFX), **quiet
  (~0.03) and ramps up to normal (0.5) over ~6 s** — `updateMusic(dt)` runs every
  frame from `loop()` (even while paused) and does the linear fade.
- **M** ducks the music to silence alongside the SFX (and un-ducks on unmute);
  every path is guarded so nothing throws when audio is unavailable (headless).
- Verified headless: music element ready, `startMusic` begins at 0.03, the fade
  reaches ~0.5, and `M` ramps it back to 0; no console errors.

## 2026-08-02 — Grab combat: hold, automatic beat-down, and a player-driven combo

- **Grab (G)** — `sprites/darki-grab` (10x9 / 84 frames, the faster cut) and
  `darki-grabfail` (5x4 / 17). Timings were read off the art by per-frame
  silhouette/motion analysis, not guessed: 0-8 wind-up, **9 the snatch**, 10-14
  pull-in, strikes at **17/28/41/45/57/68**, **75 the throw**, 79-83 recovery.
  Both moves are ordinary `ATTACKS` entries (`lock: true`), so the existing input
  buffer, cancel rules, hit-stop, sparks, shake, SFX, rage and `launchEnemy`
  knockback all drive them unchanged.
- **Miss** plays GrabFail forward then back once (`PING`, 33 steps ≈ 0.69 s) —
  the sheet only holds the reach, so the ping-pong IS the retract. No damage, no
  grab state.
- **Hold** — the nearest eligible body in front (bosses / corpses / downed /
  invulnerable / already-held are never eligible) is latched at the snatch frame,
  eased onto a configurable anchor by smoothstep (no teleport), then pinned. Its
  AI, navigation, attacks and reactions are suspended via a dedicated `'grabbed'`
  state that `isGrounded`, `isEnemyHittable` and the rage shockwave all exclude,
  and it's forced to sort behind Darki for the whole hold.
- **Manual takeover** — `Cont.Combo` (`darki-contcombo`, 7x6 / 38). Frame 3 of
  that sheet is pixel-identical to GrabAttack frame 17 — the grab's first
  damaging frame — so a click in the takeover window swaps control there with no
  snap and the automatic strike is suppressed.
- **The circle** — Cont.Combo runs as ONE continuous loop (frames 3→28, wrapping)
  that alternating LMB/RMB sustains; it never restarts or switches sections.
  Impacts at frames 9/17/23 fire once per lap (per-lap ledger + "crossed, not
  equalled" → never skipped at low fps, never doubled at high). Repeating the
  same button is ignored entirely. Stopping, an invalid input, a dead target or
  spent stamina flags a wind-down that leaves only on a clean punch boundary
  (13/20/28) into the sheet's own throw; a late click before that boundary
  rescues the loop.
- **5-second stamina** (new; there was no prior stamina system to conflict with):
  starts on takeover, burns elapsed `dt` not frames, freezes with the game pause
  for free, rejects input at zero, and draws as a bar with a "next: LMB/RMB" prompt.
- **States** — one `grabState`: `GrabStartup → GrabPull → GrabAutoAttack |
  ManualCombo → GrabRelease → Recovery`, plus `GrabFail`/`None`. Every exit
  (throw, lethal hit, player hurt/KO, animation end, bench, wave reset) funnels
  through `releaseGrab`, so nobody is left attached, frozen or invulnerable.
- Both sheets were downsampled 2:1 (512x315 per frame, still 1.6x the 200 px
  on-screen height) — the original grab sheet decoded to ~312 MB of RGBA and was
  blowing out boot.
- Verified headless (`_chromakey/grabverify.js`): takeover switches before the
  first auto strike and stays anchored; the circle runs 5 laps inside frames
  3-28 at ~3.2 impacts/lap; alternating lands 19 hits over 7.3 s vs 4 for
  same-button mashing; stamina caps the loop at 5 s (+ at most one punch
  segment, by design); stop / enemy death / player interrupt all end clean with
  nothing stuck; automatic path = 6 strikes + throw = 47 dmg, identical at
  144/60/20 fps; held enemy always behind Darki.

## 2026-08-10 — Screen flash reserved for heavy hits

- The full-frame flash had become the background hum of every exchange rather
  than an event: it fired on **every** connected strike while rage was active
  (jabs, all five combo links, every beat-down filler hit), on every grab
  release, and on **every** hit Darki took — and a ginger's jab is the only
  damage enemies deal, so a swarm strobed the screen continuously.
- Flash is now gated on a single explicit test, `isHeavyHit(w)`: a payload that
  is `big` **and** either launches or deals ≥ `HEAVY_DAMAGE` (12). `big` alone
  was the wrong test — the beat-down's `g5` carries it for its spark size at 6
  damage. So: high kick, back kick, the combo's kick finisher, uppercut, the
  throw and the grab finisher flash; nothing else does, in rage or out.
- Incoming damage flashes red only at ≥ `HEAVY_DAMAGE`, so ordinary ginger jabs
  (`ENEMY.damage` = 8) no longer wash the screen. The hit still reads through
  Darki's red sprite flash, the hit-stop, the shake and the HP-bar chip.
- The rage burst (gold, 0.4 s) and a KO (white, 0.3 s) are unchanged — both are
  rare, deliberate moments.
- Verified headless (`_chromakey/flashverify.js`, new): peak flash is 0 for jab,
  combo, beat-down filler and a light incoming hit **both** in rage and out, and
  still > 0 for uppercut, high kick, a heavy incoming hit, the rage burst and a
  KO. `combatverify.js` re-run clean — damage, launches, combo routing, rage
  build and KO/revive all unchanged.

## 2026-08-11 — MC_Olodo: Level 1 boss, and the entrance that takes control

- **The stance sheet had to be rebuilt.** `ASSETS/NEW SPRITES/MC_Olodo EMOTE.png`
  is a valid 10240x5160 RGBA PNG whose every pixel is `0,0,0,0` — a dead export,
  not a keying problem. The stance is rebuilt from `ASSETS/MC_Olodo EMOTE.mp4`
  (2032x1024, 30fps, 328 frames) by `_chromakey/emote_build.js`: key the violet
  screen on `min(R,B) - G` (the screen measures 112-128 across the clip, the
  character's solid pixels well under 75, so 75→110 keys it and leaves a soft
  blend fringe), despill, and crop every frame to ONE shared box. The despill
  clamps R and B to just above G on **every kept pixel**, not just the soft
  fringe: h.264 4:2:0 smears the violet a couple of pixels *inside* the
  silhouette, and a fringe-only pass left a purple rim around him on screen. It
  cannot touch his palette — white is `k = 0`, and orange skin / green kit /
  yellow boots are all strongly negative `k`.
- **The loop is measured, not guessed.** `emote_analyze.js` compares every
  1.2-4 s window's first frame against its one-past-last on foot-anchored
  silhouettes; source frames **59-139** wrap with the lowest difference of any
  candidate, so the 81-frame / 30 fps stance never visibly pops. It ends on his
  raised-fist taunt, which is what sells the entrance.
- **His two sheets ship facing OPPOSITE ways** — the trap on this character.
  The emote clip was shot facing **left** (cap peak, shades and beard all point
  left); SpecialMove faces **right**, and the ground truth there is frame 26,
  whose punch extends right. So `OLODO_STANCE_SHEET.faces` is `-1` while
  `OLODO_SPECIAL_SHEET.faces` is `1`. Setting the stance to `1` to match its
  sibling mirrors it and MC_Olodo turns his back on Darki for the whole
  entrance. The silhouette is near-symmetric in a boxing guard, so this is not
  reliably readable from a thumbnail or a bbox — check the cap peak on a
  blown-up head, against SpecialMove f26.
- **His EMOTE loop *is* his combat stance.** MC_Olodo has no walk cycle by
  design: he holds the bob and shuffles in and out of the stand-off still
  bobbing, and only the fist combo takes him out of it — a Capcom boss holding
  the screen, not a Ginger with more HP.
- **The fist combo** is read off `MC_Olodo_SpecialMove`'s own silhouettes
  (per-frame reach from the foot anchor): the sheet holds a squared-up guard
  (18-25) into a straight right (26-28), a side-on guard (0-3) into a cross
  (4-5), and a turn-and-flex flourish (6-16) — frame **17 carries a render
  artefact and is never played**. Ordered as telegraph → straight → cross →
  showboat, it reads as one 31-step / 24 fps move whose flourish doubles as the
  recovery, so the taunt IS the player's punish window. Hit steps are tested as
  **crossed, not equalled**: 11 + 18 damage lands identically at 144/60/20 fps.
- **Super armour.** Light hits chip him and flash him white but never break his
  rhythm — verified: a jab takes 7 and leaves him in `special`. Only a HEAVY blow
  (`isHeavyHit`) jolts him (0.14 s), only the killing blow puts him down, and the
  rage shockwave chips-and-jolts rather than flooring him. A jab string can't
  stun-lock the boss the way it can a Ginger.
- **He out-ranges Darki on purpose.** He commits inside 200 px, closes to 170 and
  punches 185; Darki's longest box reaches ~166 centre-to-centre. The player has
  to work the gap instead of camping it.
- **The boss room** is a fourth `SECTIONS` entry with no quota: clearing wave 3
  now shows the GO arrow (it used to end the level), and walking past gate 3 cues
  the entrance. The arena runs 4640→5480 and the camera **locks** at
  `WORLD_W - VIEW_W` for the whole fight, so both fighters are always in shot and
  there is no walking away from him. Exactly one MC_Olodo can ever exist —
  re-entering the intro retires the previous body (they share an id, so a second
  copy would have made a single swing damage only one of them).
- **The entrance takes control.** Four beats off one clock, so it is identical at
  any frame rate: bars close and Darki takes his last strides in (0.70 s) → Olodo
  swaggers in from off-screen right on an ease-out, emoting the whole way
  (2.30 s) → he plants and the name plate SLAMS in on a white flash, a shake and
  embers (1.30 s) → bars pull back, FIGHT! pops and his AI wakes on the same
  frame control returns (1.00 s). Every input edge is swallowed for the duration,
  so nothing the player mashed fires when it ends; Enter / Start **skips** rather
  than pauses, landing everything exactly where the script would have.
- Sheets are foot-anchored to matched body heights (stance frame 0 vs special
  frame 18 → 214 vs 212 px on screen), measured — he stands **1.40x** Darki.
  `loadSpriteFrames` gained an optional `config.workH` so an 81-frame sheet
  doesn't upscale every frame to 480; with the sheet stored at its own 380 px the
  PNG went 12.7 MB → 7.4 MB, and it was the slowest asset in the level.
- Verified headless (`_chromakey/bossverify.js`, new): all four beats play and
  hand control back; 81 distinct stance frames during the walk-in (he emotes, he
  doesn't freeze); mashing jab/combo/grab through the scene starts nothing, then
  or after; skip lands on the same marks; the combo lands 11 + 18 and never shows
  frame 17; light vs heavy armour behaves as above; he can be beaten and that
  sets `complete`. `combatverify`, `grabverify` and `flashverify` re-run clean.

## 2026-08-11 — The case file: MC_Olodo's ledger, and the ending

- **Level 1 now ENDS.** Beating MC_Olodo used to set `waveState = 'complete'` and
  leave the player standing in a locked room under an AREA CLEARED plate with
  nothing to do. He now drops the ledger Darki came for, Darki walks over and
  picks it up, and a CASE CLOSED file slams up over the frozen street.
- **The outro is built exactly like the entrance** — one clock, a phase list, no
  input — so the level is bracketed by the same machine at both ends: `fall`
  (1.20 s, the ledger flutters out and lands) → `walk` (Darki crosses to it and
  takes it) → `card` (0.85 s, the file slams in on a white flash and a shake) →
  `file`, which has **no duration and holds**. There is no reset path in the
  build, so an ending that handed control back would hand it back to nothing.
  Retime or restage it by editing those four rows, same as `CUT`.
- **The walk beat's 4.20 s is a cap, not a pace.** It ends EARLY, the moment the
  pickup finishes — which is what actually happens, since Olodo dies next to
  Darki. The number only exists so the ending can never hang, and it is sized off
  the worst case the arena allows: the longest walk there is (840 − `reach`) is
  2.99 s at 260 px/s. Shorten it and a far drop stops being a walk — the
  `grabBy` safety net fires and the ledger lifts out of thin air short of his
  hand. Caught by staging a 620 px drop, which is what a rage shockwave
  finishing him at range would produce.
- **The bars come in THIN for the action beats** (0.30) and only close all the
  way under the card. At full height the bottom bar covers y 628-720 and the
  ledger rests at ~648, so the entrance's framing would have hidden the one prop
  these two beats exist to show. The close doubles as the frame shutting on the
  card.
- **`onBossDefeated` read `b.x` after parking it**, so the victory embers had
  been spawning at −9999 — off-screen, every time, since the boss landed. His
  fall position is now read first and the ledger drops there too.
- **A retry retires the previous ending.** `startBossIntro` already guaranteed
  exactly one MC_Olodo; it now clears `outro`/`evidence` the same way. Without
  it the next fight runs under a case file that never comes down, because the
  outro holds forever and owns both the input and the frame.
- The ledger on the tarmac and the exhibit pinned in the file's left margin are
  the same `drawLedgerFace` at two scales, so the thing you picked up is visibly
  the thing the file is built on. `swallowInput`, `advancePlayerAnim` and
  `drawLetterbox` are now shared with the entrance rather than duplicated.
- The case copy is data (`CASE_FILE`), held apart from the staging: rewriting the
  case never means touching a beat. It carries the next-case teaser. Fiction —
  MC_Olodo, his corner and his ledger are invented for the game.
- `levelKills` counts the whole street (`waveKills` resets per section), so the
  file can report what the run cost: `N DOWN ON THE STREET · MC OLODO DOWN ·
  DARKI hp/max`.
- Verified headless (`_chromakey/outroverify.js`, new): the ending fires off a
  real killing blow and runs `fall → walk → card → file` in order, then holds;
  the ledger falls 166 px, lands at 0.77 s, is taken at 1.77 s and is clear of
  the letterbox the whole time; mashing everything through it starts nothing,
  then or after, and the only movement is the scripted walk; skip lands him at
  exactly `reach`; a 620 px drop is still WALKED to (65 px standoff), not
  grabbed from afar; identical at 144 / 60 / 20 fps; a retry clears it.
  `bossverify`, `combatverify`, `grabverify` and `flashverify` re-run clean.

## 2026-08-11 — MC_Olodo's spinning hook kick, the multi-spin super, and a calmer boss

- **`MC_Olodo_SpiningHookKick` is in the fight.** Prepped through the existing
  `_chromakey/olodo_prep.js` (2:1 downsample, 6144x3096 → `boss-olodo-hookkick`
  at 3072x1548) alongside the fist combo, so both boss attack sheets come off
  one pipeline. Frame map read off the art, not guessed: 0-2 wind up, 3-5 turn
  away and coil, **6 is the extension that connects**, 7-11 spin down, 12 is the
  guard he lands in; 13-31 are a near-identical standing guard tail the game
  never plays.
- **The sheet faces LEFT** — like the EMOTE stance and OPPOSITE to SpecialMove.
  Checked the way the existing note says to (blow up the head, read the cap peak
  and shades) on frames 0, 12, 20 and 31, all of which point left, with frame 6's
  leftward kick as the confirmation. This is the third sheet on this character
  and the second facing left; "fixing" it to `1` for consistency would have him
  spin away from Darki.
- **He now carries the move he is playing.** `BOSS.combo` was hard-wired into the
  stepper, the sheet swap and the telegraph; there are three moves now, so each
  is a table (`frames`, `hits` by STEP, `drive` ranges, `driveSpeed`, `sheet`)
  and `b.move` is whichever he committed to. Retiming a move touches one table.
- **The super is BUILT at commit time.** `buildHookSuper` splices `laps` copies
  of one spin between a lead-in and a way out, giving each lap its own hit step
  and drive window — so 2, 3 and 4 kicks are one table rather than three, and the
  stepper cannot tell a built table from a hand-written one. Laps are rolled per
  performance, so it is never the same show twice.
- **"Not abused" is three separate gates**, not a vibe: second gear only
  (`bossEnraged`), its own 10-16 s cooldown on top of the normal rest, and a
  1.5 s extra recovery after one. Measured: **zero** supers in a 60 s bout at
  full health, **2** in a 60 s bout held at 20% health. Each lap lands 28 (vs 52
  for the single kick) because a flurry that hit like the single would be a
  coin-flip kill; the worst case, 4 laps all connecting, is 112 — just under the
  fist combo's 116, so it is not an escalation of what he could already do.
- **Strategic, meaning he decides BEFORE he moves.** His intent is picked once,
  the moment his rest runs out, and he then closes to THAT move's range: past his
  fists the boot is the only thing that reaches (so backing out of punching range
  stops being safe), inside it he still leads with his hands, and the spins want
  room so he winds them up at kick distance rather than in Darki's chest.
  `hookRangeX`/`hookReach`/`driveSpeed` were set by arithmetic, not feel — he
  commits at 300, travels ~38px through the four steps before the boot lands, so
  it connects at ~262 inside a 270 reach. Raise the commit range without raising
  the reach and he throws kicks that always whiff.
- **His aggression is down.** Rest between attacks was 0.32-0.77 s, which read as
  relentless once he had more than one thing to throw. At 0.70-1.45 s
  (`enrageCooldownMul` 0.5 → 0.62) he still owns the space and still out-ranges
  you, but the fight has a rhythm. Against the standing target: **12 attacks /
  1348 damage per 20 s → 9 / 788** at full health (−42% output), and **14 / 1580
  → 12 / 1232** enraged — second gear still clearly above base. The kit shows up
  in the mix: calm is 5 combos to 4 kicks, enraged 9 combos, 2 kicks and 1 super.
- **Cosmetics no longer perturb the gameplay random stream.** Embers are spawned
  per frame (the rage aura, his second-gear sparks) and drew from `combatRng`, so
  by any given moment the stream had advanced seven times further at 144 fps than
  at 20. Nothing showed it until a roll became visible — and then the same fight
  produced **2 kicks at 144 fps and 4 at 20**. FX now draw from their own `fxRng`;
  gameplay rolls are event-driven, which is what makes them frame-rate
  independent. `combatRng` is wrapped in a draw counter so this is testable
  rather than asserted.
- `bg` was reading `assets[17]`/`assets[18]` positionally, so adding a sheet to
  the load list would have silently handed the mural the wrong image. Now indexed
  from the end, where those two actually live.
- Verified headless (`_chromakey/hookverify.js`, new): the kick plays its own 14
  steps off its own sheet for one 52-damage blow; at a 290px gap the boot lands
  and **neither punch does** (both moves drive forward, so that is the honest
  range test) while up close the fists still win 2 blows to 1; the super rolls
  2, 3 and 4 laps with exactly one hit per lap at 28 each; it is never picked at
  full health; a heavy blow breaks him out of the spins; every lap connects for
  exactly 28 at 144/60/20 fps; and a 3 s bloodied bout in which he commits to
  nothing consumes **0** gameplay RNG draws at all three rates. `bossverify`
  (extended to report the move mix), `outroverify`, `combatverify`, `grabverify`
  and `flashverify` re-run clean.

## 2026-08-15 — A shorter flinch, Darki's guard, and the Agbero's side kick

Three pieces of art landed together, and they turned out to be one feature: the
guard gives Darki an answer to pressure, and the side kick is what stops that
answer being a place to live.

- **The flinch was redrawn short** — `Darki_Hit_Reaction_1` came back as 3
  frames instead of 11 (2×2, `sprites/darki-hit.{png,json}`, re-prepped by
  `_chromakey/newmoves_prep.js`). The sheet is now an impact and a stance with
  no settle drawn between them, so `REACTIONS.flinch` does **not** play 0-1-2:
  it snaps 0→2 at 30 fps and walks back down 2→1→0 at 20, finishing on the
  guard that idle already looks like rather than freezing on the extreme of the
  recoil. 0.217 s against the old 0.34.
  Frame 0 came back measuring **384 source px — the same number as before** —
  so `HURT_REF_H` and every `hurtDrawH()` derived from it survived the swap and
  `darki-hitlift` / `hitair` / `fall` needed no change at all. That was luck
  rather than a rule, and the comment on `HURT_REF_H` now says so.
- **Darki can block** (`Darki_Block`, 2×2/4 frames → `sprites/darki-block.*`).
  Hold **L** or **Left Shift** on the keyboard, **L1** on a pad. It is a HELD
  state, not a move, so it lives outside `ATTACKS` in its own `BLOCK` table:
  raise 0→3, hold on 3, drop 2→0. A blow from the front is absorbed — no hurt
  reaction, no launch, no red wash, and only 16% chip through — but it grants
  no i-frames and no hurtstun either, so blocking buys you the exchange, not a
  free moment. He is planted while it is up and can turn but not travel, and
  the guard only covers the way he faces, which is what makes the mob AI's
  existing flankers matter.
- **Blocked blows slide him instead of staggering him.** `updateBlockGlide` is
  a decaying velocity, not a knockback: MC_Olodo's two heavy blows (the cross
  and the spinning hook, the ones already carrying `heavy` in `BOSS_BLOWS`)
  shove him ~47 px, and everything else ~13 px. It is clamped by
  `clampPlayerToArena`, so a shove cannot slide him through a wave gate any
  more than a launch can fly him through one.
- **Gamepad: Grab moved off L1 to L2 (button 6).** The artist's manifest asked
  for the guard on L1, and a hold-to-block button that also grabs would fire a
  grab every time you raised your hands. Keyboard and mouse are untouched —
  Grab is still G / MMB.
- **The Agbero has a second attack** (`Agberosidekick`, 4×3/10 →
  `sprites/enemy-sidekick.*`, copied at source resolution like the rest of the
  Ginger family). His kit is now a `GINGER_MOVES` table of two, in the shape
  `BOSS_BLOWS` already established: the kick out-ranges the jab (178 vs 96),
  telegraphs half again as long (0.62 s vs 0.45), hurts nearly twice as much
  (14 vs 8) — and **goes through Darki's guard**, breaking it open and locking
  him out of blocking for 0.55 s. Seeing Darki behind a raised guard roughly
  doubles the odds he picks it (0.34 → 0.72), so turtling does not stop the
  street, it changes what the street throws at you.
  The sheet stops at full extension with no retraction drawn, so the frame list
  walks back down through it (`…8, 9, 9, 8, 6, 4, 2, 0`) and ends on frame 0 —
  which is pixel-identical to `enemy-jab` frame 0, so the two attack sheets
  share a neutral and choosing between them never shows as a pop. That shared
  pose is also why this sheet carries `bodyFrame: 0` and `drawH: 203`: mapping
  its union box to 205 the way the jab sheet does would have drawn the same
  drawing 1.5% smaller.
- **Enemy blows now have a connect WINDOW, not a connect instant**
  (`connectUntil`). The blow waits on `reach` as well as the clock, and the two
  do not have to come true together — a kick thrown at someone still drifting
  into range passed `connectAt` while out of reach and then landed on the first
  frame he wasn't, which could be a frame where the leg was already folding
  back up. The kick's window is the extension the artist drew sparks on
  (indices 8–11); the jab keeps its shipped open-ended behaviour, because its
  sheet holds the extended fist for most of the swing and there is no wrong
  frame for it to land on.
- Tuning that came out of the harness rather than feel: the kick commits from
  **215 px, not 230**. He commits the first frame the gap is under `rangeX`, so
  the worst case is committing at the very edge; the slowest Agbero then travels
  ~57 px before the window shuts, and at 230 that left him at ~173 — outside
  `reach`, so the two longest starting gaps in the harness whiffed *every* time.
- Verification: new `_chromakey/newmovesverify.js` — 13 headless scenarios
  covering sheet scale on the drawn canvases (Darki's block guard and the
  flinch guard both come out 200 px, matching his jab guard's 201; the Agbero's
  two neutrals come out 203 and 204), the flinch's play order and duration,
  raise/hold/drop, absorption (1.28 chip off an 8-damage jab, no reaction, no
  i-frames), the glide at both weights, all four of MC_Olodo's real blows read
  off his own table, a blow from behind taking full damage through an open
  back, the guard break and its lockout expiring, kick timing, a live Agbero
  committing to the kick from four starting gaps (all four now connect on the
  extension), planted-but-can-turn, and the gate clamp. Runs clean with an
  empty error list.
- Fixed two faults in the **harnesses** themselves, both of which had been
  reporting passes for the wrong reason. `hurtverify`'s gate scenario ran last,
  after other scenarios had already called `freeRoam()` — which sets
  `waveState` to `'complete'` for the rest of the page's life, so it was
  testing a gate the game had already opened and reporting
  `heldBehindWall: false` as though the clamp were broken. It now runs first,
  against the boot state, and passes. Both harnesses also answer `/favicon.ico`
  with 204, so the browser's unprompted request stops showing up in the error
  list as an indistinguishable 404.
- `hurtverify`, `bossverify` and `hookverify` all re-run clean.

## 2026-08-15 — Impact_hit: the sound of Darki taking one

- Added `sounds/impact_hit.mp3` (from `ASSETS/SOUNDCUES/Impact_hit.mp3`) and
  `playImpact()`, fired from `damagePlayer` whenever a blow actually lands on
  Darki. One call site covers every attacker by construction — a Ginger's jab,
  the Agbero side kick and all four of MC_Olodo's blows already route through
  that function, and the next enemy added gets the cue for free. `heavy` drops
  it lower and louder, the way `playHit` weights a big blow, and it is panned to
  Darki's screen position like his combo taunts.
- It is a **separate cue from the HIT1-3 bag, not a fourth clip in it.** Those
  three are the sound of Darki's fists landing; the whole point of this one is
  that being hit does not sound like hitting.
- **One voice, and a re-trigger stops the one already playing.** The sample
  decodes to 1.13 s — MC_Olodo's super lands 2-4 blows inside a second and his
  fist combo two more, so fire-and-forget would stack a second of audio on top
  of itself and pile up gain. Cutting the previous instance is also the truthful
  reading: the second impact interrupts the first, it does not harmonise with it.
- Blocked blows do **not** fire it. A blow the guard ate is absorbed, not
  received, and it keeps the lighter existing spark sound — so blocked and
  unblocked are audibly different, which is the distinction the guard is for. A
  guard *broken* by the side kick does fire it, because that one gets through.
- Verified in `newmovesverify` by the `sfxImpacts` wiring counter (it increments
  even when the audio path is silent, which is the only way to test this
  headless): exactly one trigger each for the Ginger jab, the side kick, all
  four boss blows, a blow from behind, a broken guard, and a live Agbero
  connecting through the real AI — and **zero** for a blocked light blow, a
  blocked heavy blow, and a blow arriving during i-frames. A separate probe that
  spies on `AudioBufferSourceNode.start` confirms the graph is really built and
  started: one source per hit, playbackRate ~1.02 light and ~0.91 heavy.
- `hurtverify` re-runs clean.

## 2026-08-16 — The guard stops the damage flat, and an enemy landing one is heard

- **A blocked blow now costs Darki nothing.** `BLOCK.chip` 0.16 → **0**: a blow
  thrown at the front of a raised guard takes no health at all, where it used to
  bleed 16% through. The chip multiply is left in place rather than deleted, so
  putting a number back is a one-token change — but everything downstream of it
  is now conditional on it being non-zero, which matters for the next point.
- **Nothing about him changes when it lands, either.** The red "that hurt" tint
  (`hpFlash`) and the KO check only fire if chip is dialled back above zero — a
  bar that flinches while the number underneath it never moves is the game
  saying a hit hurt when it did not. What a blocked blow still does is what it
  always did: the shove, the spark, and its own muffled cue.
- The guard pose is **held through a barrage**, which is the other half of the
  request. It already was — the animation stage rewrites `anim`/`frame` from
  `blockFrame()` every frame while `player.blocking` — but it was never actually
  measured, only reasoned about. Now it is: `blockrepro`'s new `poseHeld`
  scenario holds the guard through **ten** blows, alternating light (8) and
  heavy (40), and watches the sheet and the frame on every single step rather
  than at the end. Result: hp 100 → 100, exactly one pose seen the whole way
  (`block#3`), no reaction, no tint, still covering, still being shoved (glide
  −269). A one-frame flicker would have shown up in that set; there isn't one.
- **Unchanged, deliberately: the two ways past a guard.** A blow from BEHIND
  still lands in full (8 of 8), and the Agbero's side kick still goes through it
  in full (14 of 14) and locks him out for 0.55 s. The guard stopping everything
  from every angle would make holding it a place to live, which is the exact
  thing the side kick was built to prevent. `blockrepro`'s wave sample still
  reports **63%** of a guard-up wave's commitments dying on the guard against
  **0%** guard-down — the same number as before this change, because what moved
  was how much a blocked blow costs, not how often one is blocked.
- **Enemy impact cues are boosted 8x** — `ENEMY_IMPACT_BOOST`, applied to
  `playImpact` (a blow landing on Darki) and `playBlock` (one his guard ate),
  through a new `impactBus`: a brick-wall limiter (threshold −2 dB, knee 0,
  ratio 20, 1 ms attack) into a 4x-oversampled **tanh saturator**, with the
  existing `sfxGain` 0.9 behind it. At 8x the limiter is mostly a safety net —
  it stays because the boost is the one number anyone will reach for, and past
  ~16x without it you get a square wave rather than a loud hit.
- **Why it was inaudible: the sample, not the mix.** `impact_hit.mp3` renders to
  a peak of **0.061**, against 0.66 for the hit1-3 bag. The cue was never mixed
  low; the file is low.
- The level was **measured against the sound it sits next to**, not guessed.
  `_chromakey/impactloudness.js` renders the real samples through their real
  node graphs in an `OfflineAudioContext` (which does not clamp, so a peak over
  1.0 is sample the sound card would have flattened) and compares the loudest
  100 ms window of each — whole-file RMS is no use here, since impact_hit is
  1.13 s of decay against ~0.2 s cracks and averaging scores the long sample
  lower for being long. Against Darki's own light fist: 4x is *quieter* than his
  punch (−3.1 dB), 6x is level with it, **8x is +2.7 dB light and +4.5 dB
  heavy** — clearly the heavier sound in the room without taking the room over —
  and the 500x this started at was +12 dB, every impact pinning the ceiling for
  a full second. 8x is +21 dB on what shipped, peaks 0.65 light / 0.76 heavy,
  and clips nothing.
- **`sounds/hit3.mp3` decodes to pure silence** — 17 KB of file, peak 0.0 on
  both channels, while hit1 and hit2 peak at 0.66. It is one of the three clips
  in `playHit`'s shuffled bag, so **one in three of Darki's own punches makes no
  sound at all**. Found while measuring the above; left alone, because fixing it
  means either replacing the asset or dropping it from the bag and that is an
  art call, not a code one.
- Both cues take the same boost and the same bus, so the thing that still tells
  a blocked blow from a landed one by ear is `playBlock`'s lowpass and pitch
  drop — which is the difference that was always doing the real work anyway.
- `blockrepro` now waits on `sfxImpacts + sfxBlocks` rather than on a change in
  HP to decide that a blow arrived. With chip at 0 the old test spins out every
  scenario the guard wins, which is most of them; the SFX counters increment
  even with no audio device, so they are the signal that survives. `blockrepro`
  and `newmovesverify` both re-run clean, with no page errors.

## 2026-08-16 — Boots on the tarmac, and bodies landing on it

- **Enemy footsteps.** `sounds/step1-3.mp3` (ENEMYFOOSTEP 1-3), fired from the
  mob's walk cycle. Anti-pattern is **three** mechanisms, not one: a shuffled bag
  (each clip once per cycle, reshuffled, and never the same clip twice in a row
  even across a bag boundary) fixes the ORDER, and per-step pitch (0.92-1.09x)
  and gain (0.82-1.12x) jitter fix the fact that the same clip twice in a minute
  is still recognisably the same clip. Two of the three would not have been
  enough — a shuffled bag of three untouched samples still becomes familiar
  inside one wave.
- **The footfall frames were measured, not chosen.**
  `_chromakey/stride_analyze.js` takes the opaque pixels in the bottom 12% of the
  body (the boots) for every frame of a cycle and reports how far apart they are;
  a stride plants at maximum spread. enemy-walk's 35 frames measured two clean
  humps peaking at **index 5 and index 23** — two steps a cycle. A footstep on
  the wrong frame does not read as slightly off, it reads as a limp.
- The **guard advance** measured a dead-flat 283 across all 18 frames: it is a
  shuffle with the feet never leaving the ground, not a walk. There is no plant
  to find, so it gets an even cadence (indices 0 and 9) at 0.7 weight — a scuff,
  not a stride.
- Footsteps fire on animation **crossings**, not on "is the current frame a
  plant", which is what makes them frame-rate independent: the naive test fires
  the same step three times at 144 Hz and misses it entirely on a long frame.
  They are also gated on the body actually TRAVELLING (40 px/s) — the mob plays
  its walk cycle while holding station in `menace`, and a man bobbing on the spot
  who sounds like he is marching is worse than one who is silent. **MC_Olodo has
  none**: his stance is a swagger with no stride to measure, so guessing plants
  for him was not worth it.
- **The fall thud.** `sounds/fallthud.mp3` fires the instant a body reaches the
  deck — Darki's launch and KO, and every Ginger knocked off his feet. Same
  sample for both, because it is the same event; the enemy's is lighter (0.75)
  since there can be four of him and only ever one of you.
- **NONE OF THESE CLIPS ARE TRIMMED, and that changed the implementation.**
  `_chromakey/onsets.js` measured the transients at 0.27 s, 0.13 s and 0.09 s
  into the three footsteps, and fallthud's slam at **0.43 s**. Fired the obvious
  way — `start()` on the frame the boot lands — the three "interchangeable"
  footsteps would arrive at three different times, which the ear reads as a limp
  rather than as variety, and the thud would land half a second after the body
  did. Every cue now starts at its own measured onset via `start(when, offset)`,
  with the offset written beside the file it belongs to.
- **A bounce on landing.** A body dropped on a road does not stop dead, and both
  Darki's launch and a floored Ginger did exactly that — the arc reached the
  ground and the number went to zero on the same frame. Now it comes up again:
  17 px over 0.16 s, then 5 px over 0.10 s, then flat. Deliberately a written
  table rather than a physics restitution loop — a loop gives a different rhythm
  every time it runs and nothing to tune when it looks wrong. One curve for
  Darki and the mob both; the enemy scales his by the velocity he actually landed
  with (clamped 0.45-1.35), so a Ginger dropped by a jab does not bounce like one
  launched by the uppercut.
- The landing gets grit and a camera jolt but **no hit-stop**. A freeze there
  reads as a hitch rather than as weight: it lands three frames into the bounce
  and pins him mid-hop — measured as five identical frames at 2 px before the arc
  carried on. The blow that launched him already spent its hit-stop.
- **The Agbero goes down on real art.** `AgbeoFall` → `sprites/enemy-fall.png`
  (source resolution, matching the rest of the Ginger family). Frames read off
  the contact sheet rather than guessed: 7-12 struck and going over, 13-27 the
  crash and the settle, split at exactly the point the SIM splits it — `hit` is
  physics (airborne until jumpY says otherwise) and `down`/`ko` are timers.
  0-6 (a standing reel) are unused: a stagger is not a fall, so it keeps the
  Ginger recoil.
- **The sheet ships MIRRORED against the rest of the Ginger family**, the same
  trap as MC_Olodo's emote and hook sheets against his special — its config
  carries `faces: -1`. The ground truth is not the standing frames, it is where
  his HEAD ends up: the sim already turns a falling body to face its attacker,
  and a man knocked off his feet lands with his head AWAY from whoever hit him
  and his boots pointing back at them. Shipped as `faces: 1` it laid every body
  down head-first toward Darki, reaching back at him — which is what a man
  falling TOWARDS you looks like. `fallshot.js` now shoots the knockdown in BOTH
  directions, because an orientation that reads right knocked one way is a 50/50
  guess until the mirror is checked.
- **The old fake had to come out with it.** A floored Ginger was the hit-recoil
  frame rotated 90° in the draw code, and a falling one was tilted 0.35 rad —
  both stand-ins from before there was art, exactly like Darki's KO before
  Darki_Fall. Rotating drawn art lays the man out twice. Both are now gated on
  `onFallSheet()`, so MC_Olodo — who has no fall sheet — still gets the old
  treatment, stars and all.
- Verified by `_chromakey/fallstepverify.js`: the bounce curve leaves the ground,
  returns, leaves again smaller and is exactly 0 by the end (never negative,
  never parks a body in the air); Darki's landing fires **one** thud at t 0.483
  against a landT of 0.478 and bounces 17 px; a Ginger runs `fallAir → fallDown →
  walk`, thuds on the same frame he lands, bounces 14 px and settles flat; the
  walk fires **1.75 steps/second** with even 34/36-frame gaps and **zero** while
  standing still; and over 400 draws the bag deals 134/133/133 with **no**
  back-to-back repeats, a worst gap of 5 (the theoretical bound for a 3-bag) and
  periodicity at chance (0.28/0.31 against 0.33). `_chromakey/fallshot.js` shoots
  the knockdown at eight moments for the things numbers cannot answer — scale,
  which way round he lies, and whether he settles on his own shadow.
- Levels chosen on the same yardstick as the impact boost (`impactloudness.js`,
  loudest 100 ms window against Darki's own fist): footsteps **−17.5 to −18.2 dB**
  (the shuffle −20.9), Darki's thud **+2.1 dB**, an enemy's **−0.4 dB**. The three
  footstep clips land within 0.7 dB of each other, so the bag never jumps level
  between them. New tool `_chromakey/soundlevels.js` reports duration, per-channel
  peak, punch and peak position for every file in `sounds/` — it is what caught
  hit3.mp3 decoding to silence, and it is how the next cue should be checked
  before it is wired.

## 2026-08-16 — The knockdown that slid back at you: a foot anchor on a body with no feet down

- **A floored Ginger visibly slid ~57 px BACK toward Darki as he settled**, while
  his world x never moved a pixel. Reported as "they bounce towards me instead of
  away from me — the knockdown force, making the physics unrealistic", and the
  report was right even though every number in the sim said otherwise.
- **The sim was never wrong.** Measured on a real uppercut
  (`_chromakey/fallstrip.js`): `dir = sign(e.x - player.x)`, `vx = dir * kb.x`,
  net travel **+103 px away**, and every `kb.x` in the game is positive. Chasing
  the launch direction would have been chasing nothing.
- **It was the ANCHOR.** `footAnchorX` centres each frame on the opaque pixels in
  its bottom 12% — the boots. That is exactly right for anyone standing: his
  boots stay under him, so centring on them keeps him planted. It is meaningless
  once he is horizontal. There the lowest band is whichever part happens to be
  down — a shoulder, then his back, then his legs as they come out of the air —
  so the anchor hops from body part to body part, and each hop TRANSLATES the
  whole man sideways on screen. His centre was pinned; his body was not.
- Fixed with a new loader option, `anchorFrame`: freeze the whole sheet's anchor
  to one frame's. `ENEMYFALL_SHEET` uses frame **7**, the frame the blow lands on
  and the one he enters the sheet through, so the sheet draws as the artist
  composed it and the only horizontal motion left is the sim's knockback plus the
  slide that was actually drawn. Opt-in, so no other sheet changes.
- **Measured, not eyeballed, before and after.** `_chromakey/fallextent.js`
  shoots each moment twice — once normally, once with the body's alpha at 0 — and
  diffs the pair, so the changed pixels ARE him: no assumptions about anchors,
  crops or scale. Tracking the gap from Darki to the nearest part of the body
  through the landing and settle:
  - before: 117 → **87 → 85 → 69** → 93 (a 48 px lurch back at him)
  - after: 117 → **123 → 138 → 138** → 129 (away, then a 9 px settle as his legs
    come down)
  - nearest-edge travel over the whole knockdown: **+57 px → +93 px**, away.
- Needed a `__ror.redraw()` hook: re-render the current state without advancing
  it, since a test that renders one frame twice cannot use `step()`.
- **Darki's own fall chain has the same latent defect and was left alone.** His
  anchors swing 95 px across `darki-fall` and **127 px** across `darki-hitair`
  (149 → 22 on a 287 px canvas), so his launch gets yanked sideways the same way.
  Nobody has reported it and that animation has shipped and been accepted for
  weeks, so changing how it reads is a call to make deliberately, not a silent
  side effect of an enemy bug fix.
- `enemyanim.js` was still booting on `networkidle2` with a 30 s timeout, which
  the Agbero fall sheet (2.1 MB, 28 frames to key) plus the new cues pushed it
  past. It now waits on the game's own ready signal like every newer harness —
  a boot gate that cannot be outrun by adding assets.

## 2026-08-16 — Death is not a knockdown, and the combat cue table

### The Agbero goes down two different ways

- **`Agbero Fall_Death` → `sprites/enemy-death.png`, `Agbero Fall_Getup_sheet` →
  `sprites/enemy-getup.png`.** Which one plays is decided by **health**, never by
  the fact that he is horizontal, and the split happens on the FIRST airborne
  frame — a man who is going to get up and a man who is not do not fall the same
  way, and that has to be visible from the blow, not revealed at the end.
- **`dying` is a new, durable flag, and it had to be.** The existing `dead` is
  CONSUMED on landing (it only chooses which state he lands in), so by the time
  the body is on the tarmac it is already false again — it cannot be what an
  animation reads. `dying` is set from the health check in `launchEnemy` and
  stays true until the slot is reused.
- Frame maps read off the contact sheets, not guessed. Death: 6-10 struck,
  11-18 the tumble, 19-31 the crash and the roll face-down. It **stops at 40**
  because frames 38-57 are pixel-identical (bbox 219x781 on every one), and
  playing twenty copies of one drawing is a hold with extra steps. Get-up: 4-11
  air, 12-20 crash, **21-26 the recovery** — which the old sheet did not have at
  all.
- **The knockdown now has a get-up.** It is timed to FINISH as the down timer
  expires (`GETUP_LEAD` = 6/18 s, the recovery's own length), so he is on his way
  up before he is walking instead of popping from flat to a stride.
- A corpse now **lies there for the whole death performance before anything
  fades** (`DEATH_HOLD`, then the existing `KO_FADE` 1.2 s unchanged), where the
  old fade started on the landing frame and dissolved him through his own fall.
  The tally and despawn are the same code as before — only the moment they start
  moved. MC_Olodo is explicitly excluded: he has no death sheet and his 1.2 s is
  wired into the outro.
- **`AgbeoFall`/`enemy-fall.png` is RETIRED.** The get-up sheet is the same
  knockdown with the recovery drawn, so keeping both meant loading 2 MB to play
  the worse one.

### Sound

- **A cue TABLE, not eight more copies of the same graph.** `CUES` holds every
  one-shot with its measured onset, its length and its gain beside the file it
  describes; `playCue` plays one at a world position. One fetch per distinct
  file, so the two slices of the 2-hit punch decode once.
- **Nothing was trimmed, and that changed the design again**
  (`_chromakey/onsets.js`): the whiffs do not start until **0.18-0.39 s** in,
  `2hits_punch1` not until **0.96 s**, and every death cry carries a SECOND burst
  after 1.5-2 s of silence. Each cue now starts at its own measured onset, and
  the death cries are cut at the end of their first burst — the second one would
  land after the body had faded and been tallied.
- **Whiffs are resolved by the rule, not by the animation.** The animation says
  WHEN the blow happens; the collision says WHETHER it connected. So a whiff can
  only be decided when a hit window CLOSES with nothing in the ledger for it —
  and because a window is a `group` that can span several steps (the uppercut's
  runs 9-14), it closes when the group changes, not every step, or one swing
  would whiff six times. Priority is specific fist → specific kick → generic
  `MissedHit.mp3`, and the fallback keys off whether the clip DECODED rather than
  whether playback returned true (with no audio device every call "fails", which
  would fire two cues for one swing).
- The enemy's miss resolves somewhere else entirely — his swing is a timed reach
  test, not a hitbox scan — so it fires on the `attack → recover` edge when
  `didHit` is false. **A blocked blow is not a whiff:** it connected, the guard
  ate it, and it already made its own sound.
- **Blocking now freezes the picture** (`BLOCK.hitStop` 0.09, 0.13 heavy) and
  plays `ATTACKBLOCKING.mp3`. The freeze is deliberately LONGER than a light
  hit's 0.06: a blow you absorbed should read as heavier than one that glanced
  off you, and by design a block has no other feedback at all — no damage, no
  reaction, no change of pose. The old derived cue (Impact_hit through a lowpass)
  is gone, and the real clip goes straight to `sfxGain` rather than through the
  enemy-impact bus — that bus exists to make a blow that GOT THROUGH loud.
- **Vocals split on the same health test as the animation.** `AGBERO_GROAN` for a
  blow he takes and stays up for; the fall groans for a knockdown; the four
  `Agbero Fall_Die_*` as a no-repeat pool for a death. `diedVo` makes it
  once-per-death — a body can be re-launched by a rage burst or a second blow in
  the same frame, and a corpse crying out twice only shows up in play.
- **Darki's boots**, on his own measured plants: his casual walk is 57 frames
  with FOUR (spread peaks at 7, 22, 36, 51) and his combat stride is 22 with two
  (7, 18). Silent while airborne, attacking, reacting, blocking or standing
  still.
- `2hits_punch1` is a recording of a punch SEQUENCE, not a stinger, so it is
  sliced into two bursts and the combo's opening pair of fists takes one each —
  fired from the hit itself, which is what puts them on the impact frame. A
  window can now name its own `cue`, replacing the generic bag rather than
  stacking on it.

### Two data problems found while measuring, both reported rather than patched over

- **`AGBERO_GROAN.mp3`, `AGBERO_FALL_GROANS.mp3` and `AGBERO_FALL_GROANS1.mp3`
  are the SAME 0.37 s recording** — sample-for-sample identical, maximum
  difference 0.000000. So "randomise between the two fall groans" cannot vary
  anything until the files differ. The pool is wired regardless, so replacing a
  file is all it takes.
- **`DarkiFootStep1.mp3` and `DarkiFootStep2.mp3` are also identical.** The three
  ENEMY footsteps are genuinely different, which is why those do vary.
- (`hit3.mp3` still decodes to silence — one in three of Darki's own punches.)

### Verification

- New `_chromakey/combatcuesverify.js`. Death: `deathAir → deathDown`, never the
  get-up, never `walk`, **1** death cry, **0** fall groans, fade starts at frame
  77 and the body is gone at 149. Knockdown: `fallAir → fallDown → getUp → walk`,
  **0** death cries, **1** fall groan, death sheet never touched. Three lethal
  blows on one body → still exactly **1** cry. The pool over 200 draws:
  50/50/50/50 with **zero** back-to-back repeats. Whiffs: 1 on a miss and **0**
  on a hit for the jab, the high kick and the uppercut, with the fist clip for
  fists and the kick clip for kicks; the enemy's isolated swing gives 1 whiff /
  0 impacts short, 0 whiffs / 1 impact in reach, and 0 whiffs / 1 block against
  the guard. Block: 2 blows → 2 cues, freeze 0.09 and 0.13, **0** hp. Combo:
  `punch2a` and `punch2b` once each with the other three hits on the generic bag.
  Darki's boots: **2.0/s** walking, **0** standing still, **0** airborne, **0**
  while attacking.
- Levels against Darki's own fist (`impactloudness.js`): his steps −18.3 dB (the
  mob's are −17.5 to −18.2, so one footstep bed), whiffs −8.7 to −10.2, block
  +0.1, groan −5.8, fall groan −3.8, 2-hit punch +0.1, and the death pool at
  **−1.6 / −1.7 / −1.6 / −1.7** — four clips that arrived 9 dB apart brought
  level by their per-clip gains.
- `hurtverify`, `newmovesverify`, `blockrepro`, `fallstepverify`, `enemyanim` and
  `bossverify` all re-run with no page errors; the guard still stops 65% of a
  wave's commitments.
- Two harness bugs worth remembering, both of which reported working features as
  broken: scenarios must clear the WHOLE input object between runs (`backKick()`
  holds `input.left` to aim, which turned Darki around and put a "blocked" blow
  behind his guard), and a scenario must step a FIXED span rather than
  `while (player.attack)` — the move does not exist until the frame after the
  button, so that condition is false on entry and the loop runs zero times.

## 2026-08-16 — Nobody falls on the same frame

- **One blow that floors a group used to floor it in lockstep.** The rage
  shockwave catches everyone in front of Darki and a launcher can catch two men
  standing together; given identical knockback on identical frames they were
  doing the same thing at the same millisecond — one stacked THUD instead of
  three, one groan playing over itself, and the whole group sitting up in
  unison like a drill squad. The bodies were never the problem; the SYNCHRONY
  was.
- Every launch now draws its own timings (`FALL_VARY`, from `combatRng` — these
  move bodies, so they are gameplay and stay deterministic for the harnesses).
  Four independent sources, because fixing one leaves the rest in step:
  - **`hold`** — the big one, and the truthful one. A struck man does not leave
    the ground instantly: he takes the blow, folds, *then* goes over. He is held
    on the fall sheet's struck frames for up to 0.2 s first, drifting at a
    fraction of his knockback rather than standing still, because a man being hit
    is already moving — just not falling yet. Everything downstream is measured
    from when the arc starts, so this is what actually separates the landings.
  - **`lift` / `shove`** (0.82-1.18 / 0.84-1.16 on kb) — different arcs and
    different flight times, so they do not fly in formation.
  - **`down`** (0.72-1.34 on the 1.6 s) — the get-ups scatter too. The recovery
    is keyed to the timer's tail (`GETUP_LEAD`), so varying the timer varies the
    whole performance for free.
  - **`rate`** (0.90-1.10) — fall/get-up playback speed, so two men who *do* land
    together are still not the same man twice. Deliberately scoped to the fall
    and death sheets only: the side kick's connect frame is tied to `KICK_FPS` by
    arithmetic, and jittering that fps would jitter when his boot lands.
- **Randomness alone was not enough, and the measurement is why we know.** With
  only the random draws, four bodies landed inside **5 frames** — four
  independent samples from a 0.2 s range cluster far more often than intuition
  says. So `FALL_VARY.stagger` (0.085 s) gives every body floored ON THE SAME
  FRAME a queue position: each waits that much longer than the one before, and
  the random hold on top decides by how much more. Guaranteed separation where
  randomness could only offer it on average.
- **The shockwave now reaches the nearest man first.** The burst sorts by
  distance before launching, so the queue order is the order they go over — which
  is both what a blast actually does and what makes a group knockdown read as a
  wave travelling outward instead of a row of skittles falling.
- Fall groans and death cries are delayed by the faller's own `fallHold` plus a
  little more, so the man who goes over last cries out last. Two copies of one
  recording started together do not sound like two men, they sound like one man
  twice as loud.
- Measured by the new `_chromakey/fallspread.js` — one rage burst, four Gingers,
  three separate waves. Landing spread went from **5 frames to 13, 12 and 20**
  (0.22-0.33 s, four distinct landing frames), get-up spread is **34, 39 and 67
  frames** (0.6-1.1 s), and four men killed at once produce **four cries drawn
  from four different clips**. `hurtverify`, `newmovesverify`, `blockrepro`,
  `fallstepverify`, `combatcuesverify`, `enemyanim` and `bossverify` all re-run
  clean; the knockdown still runs `fallAir → fallDown → getUp → walk` with its
  thud on the landing frame.
- Harness note: `fallspread.js` waits for `cuesLoaded` before stepping. The death
  cries are 3-4 s files that decode well after boot, and without the wait it
  reported zero death sounds for four deaths — a harness faster than its own
  assets, not a broken pool.

## 2026-08-16 — The guard cancels the swing

- **Holding block now interrupts whatever Darki is throwing, on the frame the
  button goes down** — a jab, either kick, the uppercut, the 5-hit combo, the
  grab, the manual grab-combo. He used to have to see a move out to its last
  frame and could be punished for a commitment he had already changed his mind
  about; the guard is now the way out of one.
- It deliberately **ignores `lock`**, the 5-hit combo's uninterruptible flag.
  That flag exists to stop other moves chaining out of the string mid-way; it was
  never meant to trap him inside it while somebody is winding up on him, and the
  whole point of this change is that the guard outranks any swing he is halfway
  through.
- The three conditions it does NOT ignore are the ones `canBlock` was always
  built on: a hurt reaction owns the body, a guard needs feet on the ground, and
  a broken guard stays broken for its lockout. Only "he is mid-move" was dropped.
- The cancel runs inside `updateBlock`, which the update order already places
  **before** attack input is read — so the interrupt and the raise happen in the
  same frame instead of a frame apart, and the move queued behind the one being
  cancelled (`bufferedAttack`) is dropped with it rather than firing into the
  guard.
- `endAttack` does the work, so everything it already guarantees still holds: a
  held enemy is released rather than left attached, the manual-combo state is
  cleared, and the swing's open hit window is resolved — which means a swing
  cancelled before it connected still plays its whiff, because it still missed.
- **Design note, stated plainly:** this makes the guard a universal cancel out of
  recovery frames. That is what was asked for and it is what shipped, but it does
  remove the commitment cost of every move in the game. If whiffing a heavy
  launcher should still be punishable, the lever is a short lockout before the
  guard may rise (the `guardBreak` timer already models exactly that).
- Verified in `combatcuesverify.js` — six moves, each interrupted mid-swing: the
  jab (step 1), high kick (1), uppercut (3), the combo at step 4 **and** at step
  10, and the grab at step 16 with a man actually in his hands. All six report
  `cancelledInOneFrame`, all six end up blocking, the grab **drops** its hold,
  and a blow thrown into the resulting guard costs **0** hp in every case.
  `blockrepro`, `newmovesverify`, `hurtverify` and `fallstepverify` re-run clean;
  the guard still stops 65% of a wave's commitments.

## 2026-08-16 — The knockdown stops lying there

- **A floored Agbero now plays the crash and the recovery as ONE continuous run
  of the sheet, with nothing held in between.** He hit the tarmac, the sheet
  finished in 0.71 s, and then he lay motionless on the last crash frame for up
  to another 1.4 s waiting for a timer that had nothing to do with the animation.
  That pause was the stall.
- The timer is now **derived from the animation instead of set beside it**:
  `DOWN_DUR = FALLDOWN_DUR + GETUP_DUR` (9 frames at 24 fps, then 6 at 18),
  divided by that body's own playback rate. Whatever the frame lists say is how
  long he is down, so the two can never drift apart again — retiming a section
  retimes the knockdown for free.
- The handover to the recovery is expressed as time LEFT rather than time
  elapsed, and scaled by the same rate, or a man who gets up quick would start
  rising before his crash had finished.
- **`FALL_VARY.down` is gone.** What it actually varied was how long he lay
  still, and there is no longer a stillness to vary. Its job passed to `rate`,
  widened 0.90-1.10 → 0.84-1.16: that varies how fast he goes down and gets up,
  which is a man moving at his own speed rather than a man waiting a random
  while.
- Measured by a new `noDwell` scenario in `fallstepverify.js`, which does not ask
  "does he get up" — a stall is a REPEATED FRAME, so it counts how long each pose
  is held. All fifteen drawn frames now appear in order, each for 2-4 sim frames
  (`12x2 13x2 14x3 15x2 16x3 17x2 18x3 19x2 20x4 21x3 22x3 23x3 24x4 25x3 26x3`)
  with a longest hold of 4 — the natural 24/18 fps cadence at 60 Hz, and nothing
  parked. Time on the deck 0.70 s against a predicted 0.708.
- Group desync survives it (`fallspread.js`, three waves of four): landing spread
  18/15/7 frames and get-up spread 16/17/12, still **four distinct landing frames
  and four distinct get-up frames every time**. The get-up spread is smaller than
  before — it used to come from the random dwell — and now comes from the landing
  spread plus playback rate instead.
- **Pacing consequence, stated plainly:** time on the deck drops from 1.15-2.14 s
  to **0.61-0.84 s**, so a knocked-down Ginger is back in the fight roughly twice
  as fast and a wave presses harder. That follows directly from "no holding him
  on the ground" and is the intended trade. If it needs slowing without
  reintroducing a pause, the lever is the section fps — drop `getUp` from 18 to
  12 and the recovery is half again as long while still running straight through.
- `fallstepverify`, `combatcuesverify` and `blockrepro` re-run clean; the death
  path is untouched (it holds on purpose — a corpse is meant to lie there).

## 2026-08-17 — Halved: the Agbero and MC_Olodo

Both characters at half strength on request ("it's difficult to beat"). Health and
damage, since "strength" is both and the difficulty was both.

**The Agbero** — `ENEMY.hpMul` 10 → 5 (420 → **210** hp), `ENEMY.damage` 8 → **4**
(the jab), `GINGER_MOVES.kick.damage` 14 → **7** (the side kick, his other damage
source and the one that goes through a guard).

**MC_Olodo** — both POWER DIALS halved, which is what they are for:
`damageMul` 4 → 2 and `hpMul` 4 → 2. That makes him a deliberate two-star boss:
2480 → **1240** hp, straight 44 → **22**, cross 72 → **36**, hook 52 → **26**,
spin 28 → **14**.

Measured off the running game rather than the arithmetic — Darki's 100 hp now
takes **25** Agbero jabs (was ~13), **15** side kicks (was ~8) or **3** of the
boss's crosses (was 2) to empty.

**READ THIS BEFORE TUNING IT AGAIN.** `ENEMY.hpMul` is not a balance dial, it is a
**debug leftover** — its own comment says "TEST KNOB — set back to 1 before
shipping", raised to 10 so a full combo could be watched several times over
without the Ginger dying mid-string. Halving it to 5 still leaves every street
thug on **five times** his design health: 210 hp against an intended 42. Driven
for real, one Agbero now takes **four complete 5-hit combos** to put down, where
the shipping value would drop him inside a single string. So if the fight still
grinds, the answer is not another halving — it is `hpMul: 1`. Left at 5 because
"half" is what was asked for, and dropping a thug from 420 hp to 42 in one step
is a bigger change than that.

The boss's dials are the opposite case: real design values, documented as the
things to trade against each other, so 2x is a considered setting rather than a
number to get back to.

`newmovesverify` and `blockrepro` re-run clean; the side kick now reports 7
through a broken guard instead of 14, and the guard still stops 65% of a wave's
commitments.

## 2026-08-17 — The execution had no button on a pad

- The finisher shipped bound to **E on the keyboard only**. On a controller there
  was no way to trigger it at all — the feature was unreachable for anyone playing
  the way the game is meant to be played. Now on **RT / R2 (button 7)**.
- R2 mirrors grab on L2: both are the deliberate two-handed presses rather than
  the four face buttons you mash. It was also the only free button that suits a
  finisher — 0-6 and 9 are taken and the rest are stick clicks.
- The on-screen control strip now lists `EXECUTE E / R2`.
- **Neither trigger path had ever been tested.** The execution harness called
  `tryExecute()` directly, which bypasses input entirely, so a missing binding
  could not have shown up in it. Both are now driven for real: a genuine `KeyE`
  keydown, and a stubbed PS4 pad reporting button 7 through the actual
  `pollGamepad`. Both start the execution and put Darki in `exec`; R2 sets no
  other action flag.
- That needed a new `__ror.pollPad()` hook. `step()` deliberately does not poll
  (harnesses drive `input` directly), which meant EVERY gamepad binding in the
  game was unreachable from a test, not just this one.

## 2026-08-17 — "You can finish him": the execution prompt, and the pair drawn right

### The prompt

- A flashing **EXECUTE / [button]** badge over the target's head the moment the
  finisher becomes legal. Without it the mechanic was effectively invisible: it is
  legal on one man, in a window, at a health you cannot read precisely, so the
  only way to discover it was ON was to mash the button through the whole fight.
- Drawn where this game already puts the attack telegraph, so "look at this man"
  is a language the player has learnt — and flashing at 6 Hz against the danger
  chevron's 14 Hz, with a soft pulse underneath so it never fully vanishes. It
  reads as an invitation rather than a warning.
- **It names the button in the player's hands.** `padSeen` is set the moment a
  controller reports in, so the badge says `R2` on a pad and `E` on a keyboard.
- Recomputed once per frame (`updateExecPrompt`), not once per enemy per draw.
  Gating verified: nothing while the boss is too healthy, out of range, behind
  Darki, or already being executed.

### …and the pair was drawing at half size, in the air

Seeing it on screen for the first time caught what the numbers had not.

- **`drawH` 248 → 400.** The first value came from "Darki's art is 304 px tall",
  which is the union across all 151 cells. In FRAME 0 — the one that has to match
  his normal sprite — he is only **188** of the window's 376 px, exactly half. So
  he entered the execution at 124 px beside a 200 px Darki.
- **`groundFrac` added (320/376).** The window bottom is not the ground line; it
  is 56 px below Darki's frame-0 soles, and that space belongs to Olodo, whose art
  goes deeper as he is put on the tarmac. Anchoring the window's bottom left the
  pair floating ~60 px in the air. The anchor is now his frame-0 FEET, which is
  the whole job of an anchor — he starts exactly where he was standing.
- Both confirmed by screenshot: at frame 0 he now measures the same as his normal
  sprite; at frame 90 the two have swapped sides (Olodo left of Darki) exactly as
  the inspection's centre-gap data predicted for that cell; at 150 Olodo is thrown
  clear to the left, matching the −586 gap. Darki growing taller through the
  sequence is the ARTIST's drawing (art height runs 188-296 across cells) and is
  preserved rather than normalised away, which is what the brief required.

`execverify` and `blockrepro` re-run clean.

## 2026-08-17 — The execution as a combo finisher, with its own track

### Triggered by a complete 5-hit combo

- Landing **all five hits of the combo on MC_Olodo** now chains straight into the
  execution. The manual R2 / E press stays, still gated on 35% health.
- Checked against `attackHits` (keyed `enemy@group`) rather than `comboHits`
  (groups only, any target): with a crowd around him a string spread across three
  bodies is not a combo *on* one of them.
- It cannot start where it is detected. That code runs inside
  `resolveAttackHits`' loop over the enemies, and `startExecution` calls
  `endAttack`, which nulls `attackHits` — the very set the next iteration is about
  to read. So it is queued on `player.pendingExec` and started once the frame's
  attack step is done.
- `fromCombo` exempts this route from two gates: the health check (it is earned by
  the five hits instead) and "you are mid-move" — which it is *by definition*,
  since the fifth hit is the trigger. That second one is why the first attempt
  silently did nothing: the combo landed all 48 damage and `canExecute` rejected
  it with `player-attacking-combo5`.

### It is no longer a guaranteed kill, because "each time" has to mean something

- FINAL_HIT no longer forces the victim to zero. The events now total **0.40 of
  max health** and completion is lethal only if that damage actually emptied him.
- So the same sequence is a big cinematic burst at full health and a finisher at
  low health, and the boss takes two to three of them. Verified: a full combo at
  100% leaves him at **56%** and walking; the same thing at 30% kills him.

### ExecutionSFX.mp3

- 5.12 s against the sequence's 5.033 s — a track authored for the whole finisher,
  so it is played **once at EXECUTION_START** and runs the length of it rather
  than being cut into per-event stingers. Level 0.38 → **+2.5 dB over Darki's own
  fist**, in line with the fall thud, which is where a signature moment belongs.
- Its source node is kept so `endExecution` can stop it. An abort otherwise
  leaves five seconds of finisher music playing over ordinary combat.
- Needed `playCueSustained`, a sibling of `playCue` that returns the node. The
  one-shots are fire-and-forget because they are all under half a second; a track
  that has to end when its sequence ends cannot be.

### The hit-stops had to go, and the audio is why

- The events carried **0.58 s of freeze** across a 5.03 s sequence. A freeze stops
  the sim while audio keeps running, so by FINAL_HIT the picture was more than
  half a second behind the sound. You cannot have both a continuous synced track
  and a stuttering clock.
- The freezes are gone; the shake, the flash and the per-event impacts stay. They
  carry it here because the animation is already doing the work a hit-stop
  normally has to fake. Total hit-stop in the timeline is now **0**.

Verified end to end: a full combo at full health starts it and plays the track
once; the boss survives and it is repeatable; at 30% the same sequence kills him;
an **interrupted** string triggers neither the execution nor the track; and an
abort stops both. `execverify` and `combatcuesverify` re-run clean.

## 2026-08-18 — Making the execution seamless with gameplay

Three reported symptoms, one seam: the sim and the choreography disagreed about
where the two men were and how big they are.

### Olodo ended up on the wrong side

- The pair SWAP SIDES during the throw — Olodo starts at window-x 658 of 824
  (Darki's right) and finishes at 110 (far to his left), while Darki travels from
  374 to 696. The sim never knew: it held both bodies at their entry positions for
  the whole five seconds, so the instant the execution ended the real sprites
  popped back to the wrong sides of each other, and the beaten Olodo appeared
  opposite the place he had just been thrown.
- `endAttackerFrac` / `endVictimFrac` record where the last frame actually leaves
  each man, and the sim adopts those on completion — mirrored by `facing`, so it
  works from either side, and applied BEFORE the kill, since `launchEnemy` throws
  the body from wherever it is standing.
- **Fixed at the exit, not by swapping the entry.** Entering pre-swapped (the
  suggested fix) would put Darki on the far side of a man he has not grabbed yet
  — trading a wrong exit for a wrong entrance. Measured: gap goes from +110 before
  to **−406** after a lethal one and **−303** after a survivable one, with both
  men turned to face each other. The victim's restored facing no longer comes from
  `saved.eFacing` either — that is where he was looking when he was GRABBED.

### The sprites were 57% oversized

- `drawH` has now been wrong twice for the same reason: anchored to the wrong
  frame. First the union box across all 151 cells; then frame 0 — but frame 0 is
  Darki **braced and crouched** (188 of the window's 376 px), while the 200 px he
  stands at in play is an UPRIGHT guard. Anchoring a crouch to a standing height
  inflates everything else to match, so his upright frames (296 px) drew at 315.
  Frame 0 looked right, which is exactly why a single screenshot of it missed this.
- Anchored to his upright frames instead: `drawH` **400 → 260**, putting his
  standing moments at 205 — within 2% of his normal sprite — and letting his
  crouches draw smaller, which is what a crouch should do.
- **One scale cannot match both men, and that is a property of the art.** In game
  the boss is 1.34x Darki (268 vs 200); in this sheet he is only 1.09x (324 vs
  296). At 260 Olodo comes out ~224 against his usual 268. The two tracks cannot
  be scaled independently — the shared window is what holds their bodies in the
  positions the artist drew, and separate scales would pull the choreography
  apart. Darki is the one matched, because he is the figure on screen all game.
  `drawH: 311` would make Olodo exact and Darki 22% oversized instead.

`execverify` and `combatcuesverify` re-run clean.

**Harness note.** The first run of the position test reported the fix as doing
nothing — positions unchanged before and after. Nothing was broken: it staged the
boss at 90% health and used the MANUAL route, which still carries the 35% gate, so
no execution ever started. `execWhyNot` says `target-too-healthy` and the probe
was not asking. Same lesson as the last three of these: check the thing STARTED
before concluding anything about what it did.

## 2026-08-18 — Three finishers, a bar that drains, and a coin flip on the last pixel

The damage table had been retuned **0.40 → 0.26** of max health at the end of the
last session, two minutes after the changelog was written — so the one number that
had just changed was the one number nothing was watching. `execverify` cannot fail
on it: it runs ONE execution per scenario and stages the boss at 20% health, so
"how many finishers does he survive" is outside everything it measures.

`execthrice.js` measures it, and found two real faults on the way.

### The retune is right, exactly as predicted

Four full combos on one boss, damage accumulating: **70% / 40% / 10% / dead on the
fourth**, matching the comment in `game.js` value for value. Three finishers play
out with him still standing, which is what the brief asked for. The expectation is
computed from the events table rather than hard-coded, so retuning the events
retunes the test with it.

(The file's own naive prediction — 74/48/22 — is the table alone. The extra 4
points a round are the combo's own 48 damage, which lands before the execution it
triggers. The comment's arithmetic already included it; the harness's did not.)

This is also the first test of the combo route at a health a player actually meets
it at. The manual press still carries the 35% gate, so at full health the chain is
the only way in.

### The bar did not drain — on the one execution anyone watches

The code claimed, in a comment, that "the intermediate hits NEVER empty him — they
leave a sliver, and FINAL_HIT takes it". **No code implemented it.** Line 2598 was a
plain `Math.max(0, hp - maxHp * dmg)`, so on the LETHAL finisher — entering at 5%
health — the first two hits zeroed him and the bar sat empty through the beat-down,
the knee, the kick and the final blow. Harmless to the sim (he cannot die before
completion) but it throws away the sequence's only feedback, and it does it on the
killing execution, the one the player is watching the bar for.

Implemented as a running total against the health he walked in with (`victimHp0` +
`dmgFrac`) rather than by clamping in place — clamping would let the sliver absorb
the overflow and turn a lethal sequence into a survived one. Verified: the lethal
round now floors at **1 hp** instead of 0, and still kills, with the trail
unchanged at 70/40/10/0. The reveal is bound to the last DAMAGE event found in the
table, not to the name `FINAL_HIT`, so retiming cannot pin it to an event that no
longer carries the last blow.

`execverify` had a field for exactly this claim, `hpFloorHeldUntilFinal`, and it
was **useless**: `min(hpTrail.slice(0, -2)) >= 1` assumes the final hit is the
second-to-last sample, but it lands at frame 138 of 150 — 24 sim steps early — so
~22 legitimate post-kill zeros stayed in the window and the field read `false` for
a perfectly healthy run. It reported `false` before the bug and `false` after it.
Now measured against `fired`, and reporting the number beside the verdict.

### A complete combo failed to trigger the finisher, by one pixel

With the boss's AI left alone, five natural strings: two landed all five hits, and
only ONE of them chained. The other was rejected `out-of-range` at a gap of **166
against a range of 165**.

The combo's own knockback carries him outward as the string lands, so by c5 he sits
right on the boundary of the gate's own reach — the two complete strings finished
at 158 and 166. The flagship route was a coin flip on the last pixel of the move
that earns it, presenting as "the finisher only sometimes works", which is
unreadable to a player.

**The fifth hit connecting IS the range check**, and it is the stronger one: a
chain has proved contact with that specific body, which no distance threshold can
do. So `range` now applies to the manual press only — the same reasoning that
already exempts the combo route from the health and mid-move gates. Verified: both
complete strings chain, `fullStringsThatFailedToChain` is empty, and the manual
route still rejects a 600 px gap with `out-of-range`.

### Harness notes, both of which nearly became bug reports

- The first run measured **c4 whiffing at a gap of 187** and very nearly filed it
  as a game bug. It was entirely the staging: `atkCooldown` is not only the boss's
  swing timer, it is what `stepBossAI` reads as `closing`, so holding it high pins
  him to `BOSS.standoff` and he WALKS AWAY to get there. Suppressing his attack
  and pinning his position are two different jobs.
- `toBoss()` ends in `advanceSection()`, which SPAWNS the boss at full health.
  Called per round — the obvious place to put it — it would have reset the
  accumulation the whole file exists to measure, and every round would have read
  as survivable whatever the damage table said. It is called once.
- Added `__ror.execWhyNotCombo`. Plain `execWhyNot` reports the MANUAL route's
  reason, so a full string that failed to chain and a press on a healthy boss both
  read `target-too-healthy` — the actual `out-of-range` was invisible until the
  combo route could be asked its own question.

`execverify`, `combatcuesverify` and `bossverify` re-run clean.

## 2026-08-18 — The execution's scale, anchored to a typical frame at last

Reported: both men read a little smaller than their normal combat size the moment
the sequence starts. Correct, and `drawH` has now been wrong three times for what
turns out to be the SAME mistake each time — **anchored to a single extreme cell**
rather than a typical one. The union box across all 151 cells, then frame 0 (the
braced crouch, 188 px), then his tallest cell (296 px). Every time, one frame was
made to measure right and the other 150 followed it wherever it went.

Screen height is `srcH * drawH / 376`. Measured over the live cells against a
combat Darki of 200 and a combat Olodo of 268:

```
  drawH     Darki  f0 / median / tallest      Olodo  median / tallest
   260            130 /  169   /  205                180  /  224
   308            154 /  200   /  242                213  /  265
```

At 260 **only the tallest cell ever matched.** The typical frame was 15% under for
Darki and 33% under for Olodo — so "within 2% of his normal sprite", the claim the
last pass signed off on, was true of the rarest frame in the sheet and of nothing
else. That is the shrink at the handoff.

**308 anchors on the median cell**, the frame the sequence mostly shows: Darki's
median lands on 200 exactly, and Olodo's tallest on 265 against his combat 268. Both
men measure up, and the two derivations agree — the midpoint of what each man needs
individually (254 and 311) is 282, but the median anchor is what matched by eye.

The cost is Darki's tallest cells drawing at 242. Accepted: those are his
full-stretch lunge and the final upright over a thrown body, poses his ordinary
attack frames also pass 200 for. The old note rejected ~311 as "Darki 22%
oversized" — measured on exactly that cell, which is the anchoring error one more
time.

One scale still cannot match both men at every frame, and that is the art: the boss
is 1.34x Darki in game but only 1.09x in this sheet, and Darki's own cells span
188-296, a 1.57x swing wider than a real body's. The tracks cannot be scaled
separately either — the shared window is what holds their bodies where the artist
drew them. So the choice is only ever WHICH cell is exact, and the median is the
defensible answer.

### How it was judged

`execscale.js` sweeps candidates live through `executions.darki_olodo.drawH` and
shoots each, including the frame **immediately before the handoff** — same camera,
same zoom, Darki on his normal sprite. That is the only honest reference for "does
it measure up"; comparing an execution frame against a remembered impression is
what let a 15% shrink through twice. At 308 the pair at frame 0 sits at essentially
the reference scale.

The window grew 18%, and the exit positions scale with it (`endAttackerFrac` and
`endVictimFrac` are fractions of `winPx`), so Olodo is thrown ~34 px further. Still
inside the arena and still on screen. `execverify`, `execthrice`, `combatcuesverify`,
`bossverify` and `outroverify` all re-run clean.

**Third time on this field, so:** the lesson is not "measure frame 0" or "measure
the tallest" — it is that a sheet whose cells span 1.57x has no single frame that
speaks for it, and the statistic has to be chosen deliberately and written down.


## 2026-08-18 — MC_Olodo's height: the boss comes down to Darki's eye line

Asked for: Darki slightly shorter than MC_Olodo, near enough to read as the same
height. He was nowhere near it — the boss stood a head and a half over him.

### The numbers were never comparable

`drawH` in a sheet config is not an on-screen height, and reading it as one is
what hid this. With `bodyFrame` set, prep rescales the sheet so that ONE frame's
body maps to `config.drawH` and hands back a `drawH` for the whole union box; on
top of that sit the per-sheet `dScale*` multipliers and `playerScale`/`bossScale`.
So "Darki 200 vs Olodo 268" compared two numbers measured differently, and neither
was a height.

`_chromakey/heightcheck.js` measures the pixels instead: the opaque bounding box
of every prepared frame, times that sheet's draw scale, distribution over the clip.

    sheet                 f0   min   p25   med   p75   max
    Darki combat-walk    159   158   165   168   171   172
    Darki idle           149   149   149   150   150   151
    Ginger walk          158   150   154   155   158   162
    OLODO stance (268)   214   191   208   214   217   226   <- 1.27x Darki

### The bob is what sets the number, not the median

`OLODO_STANCE_SHEET.drawH` 268 -> **235**: he draws 188 against Darki's 168,
**1.12x**, about a cap's worth of daylight.

225 was tried first and is wrong, which is the finding worth keeping. It put his
median on 180 — a tidy 1.07x, exactly the "almost the same height" the brief asks
for — and it was still wrong, because his stance is a **swagger on the spot that
dips 11%**. Scaled on the median his bob floor lands at 160, under Darki's 168,
so 7% of his idle loop draws him SHORTER than the hero. One of those cells is what
the entrance cutscene happens to hold on, and `boss_cs_4_ready.png` showed Darki
plainly the taller man. A boss who is intermittently shorter is the same bug as
one who is too short, just harder to catch.

235 is where the bottom of the dip (168) meets Darki's TALLEST combat frame (172),
so he is never the shorter man in any pairing. `bobfloor.js` shoots exactly that
worst case — deepest boss cell against tallest Darki cell — and prints how much of
the loop falls under each of Darki's marks. Still the biggest body on the street:
a Ginger draws 155.

Darki is measured in his COMBAT stance throughout, because that is the only stance
he is ever in near the boss. His idle draws 150 and would flatter the gap.

### What followed from it

- **Body box.** `enemyBodyBox` takes his height off the sheet, so that tracked him
  down on its own; his half-width is a constant and did not. 46 -> 40, the same
  factor, keeping the 0.215-of-height proportion that made him a wider man than a
  Ginger (0.194). Left at 46 the box would stand ~6 px proud of his arm on each
  side. Measured end-to-end with `bosshitbox.js`, which sweeps the gap Darki
  stands at and asks only "did the blow land": uppercut and jab connect out to 150
  where they used to reach 160, the high kick to 180 where it reached 190. The
  band tracks his art; nothing else moved.

- **The execution.** `EXECUTIONS.darki_olodo.drawH` 308 -> **265**. Not a
  second-guess of that decision — its premise expired. 308 was chosen to land the
  boss's exec height on "his combat 268" while Darki wore the error, because no
  single scale could come near a boss who was 1.27x Darki in the fight and 1.07x
  in this sheet (260 vs 244 src on the median cells). At 1.12x in the fight the
  gap is small enough to split evenly: 265 puts Darki's median on 172 against his
  168 and Olodo's on 183 against his 188, both within ~2%. Left at 308 the pair
  would have popped 19% bigger at the handoff. Swept and shot with `execscale.js`
  against the pre-handoff reference frame — same camera, same zoom, both men on
  their normal sprites — which remains the only honest reference for this.

### Verification

`heightcheck` (the table above), `bobfloor` (0% of his loop under Darki's median,
7% under Darki's tallest, and a picture of the worst pairing), `bosshitbox` (run
twice, once with the old half-width, to diff the connect bands), `bossverify`
(combo 58 dmg, defeat, super armour, frame-rate determinism at 144/60/20),
`execverify` (all eight beats in order, three repeats), `regress` — all clean, no
console errors. `__ror.sprites` now also exposes the boss and ginger-walk sprites,
which is what let the measurement happen from outside the game.

**The lesson, and it is the same one the execution scale learned three times:** a
config number is not a measurement. `drawH` looks like a height, is named like a
height, and is not a height on any sheet with a `bodyFrame`. And when the art
bobs, the statistic that matters is the one at the bottom of the dip.

## 2026-08-20 — The execution becomes interactive: three checkpoints, one clock

The finisher was a five-second synchronised performance the player watched. It is
now a five-second synchronised performance the player is graded on, and **the
animation is byte-for-byte the same animation**. No new character art, no
branches, no second timeline.

### What was already right, and was left alone

`updateExecution` already ran the pair off ONE clock — `ex.t`, sampled once into
one frame index used by both sheets — with events fired on frame crossings and a
`fired` set making each happen exactly once. That is the architecture the brief
asks for, so none of it moved. The new layer only observes that clock.

The one rule, written at the top of `EXEC_PERF` and true of every line under it:
**nothing in the performance layer may touch `ex.t`.** It does not pause,
rewind, branch, or resynchronise. A missed checkpoint changes what the player
gets, never what they watch.

### The checkpoints are bound to blows, not to times

`EXECUTIONS.darki_olodo.checkpoints` names an EVENT rather than carrying a
timestamp:

    CP1 -> HIT_01 (f52)   J K       the first blow of the beat-down
    CP2 -> KNEE   (f84)   K J K     the middle heavy
    CP3 -> KICK   (f115)  J J K     the last strike before the finisher

So the ideal moment IS the frame the blow lands on, and retiming the choreography
retimes the prompts with it — they cannot drift apart. Even thirds would have put
CP2 at f50, on top of CP1, and CP3 at f100 on nothing at all.

Tokens resolve through `EXEC_TOKENS` onto the input edges the game already has,
so a checkpoint press arrives from J / LMB / pad-X and K / pad-Y by exactly the
path a jab and an uppercut do. No second key handler exists.

### Grading

Window = `lead` (0.85 s) before the blow to `grace` (~0.28 s) after it, with the
blow inside it rather than at its edge. Complete the sequence within `perfect`
(~0.14 s) of the blow for PERFECT, anywhere else in the window for GOOD. MISS is
a wrong button (immediate), a window that closes unfinished, or a sequence
dribbled out past `maxSpan` — correct buttons, too slowly.

**Exactly one checkpoint is ever live, and that is a correctness fix rather than a
simplification.** The generous windows genuinely overlap: CP1 stays open to
2.03 s and CP2 opens at 1.95. A press in the overlap would have been fed to both,
advancing one sequence while failing the other off the same button. The first
unresolved checkpoint owns the input and a later one arriving closes the previous
out. Hand-tuning `lead`/`grace` until they stopped touching would have fixed it
once; this fixes it for any retuning.

### The hit-stop problem, and the frame hold

The brief asks for hit-stop on a successful checkpoint. This game deliberately
has none in executions, and the note above the events table says why: `update()`
returns early while `hitStopTimer` runs, so a freeze stops the execution clock —
and the finisher's audio is ONE 5.12 s track started at EXECUTION_START which
keeps playing through it. Measured before the freezes were removed, the picture
was over half a second behind the sound by FINAL_HIT.

So the picture stalls and **the clock does not**. `ex.holdT` freezes the drawn
frame index; `ex.t` runs on underneath; when the hold ends the sheet resumes at
the correct absolute time, two or three frames further along than it stopped. You
get the punch of a hit-stop, the sound never drifts, and the sequence still ends
on frame 150 at 5.033 s. `execFrame()` is the only function that knows this
happened — events, damage and checkpoint windows all read `ex.t` and are
unaware. `execRawFrame()` exists so the tests can watch the two diverge.

### Feedback, all on systems that already existed

Graded through `triggerHitFx` (hit-stop argument zero), `spawnEmbers`, `playHit`,
`playCue`, `playThud`, plus a short directional screen-space impulse and a
vignette that closes around the pair. The impulse rides on `draw()`'s existing
translate next to the shake — `cameraX`/`cameraY` are never touched, so the
locked boss-room framing stays locked and nothing that reads the camera notices.

**No full-frame flash on a checkpoint.** The first cut washed the screen gold on
every PERFECT, which buried both fighters under a yellow sheet three times in five
seconds — and broke a rule this game already had (`isHeavyHit`: the wash is
reserved for heavy impacts so it stays an event rather than the background hum of
every exchange). FINAL_HIT keeps the wash it always had. One per finisher, on the
blow that ends it.

### Result and rewards

Final grade comes from the COUNTS, never from health: 3 PERFECT -> PERFECT
FINISH, 2+ landed -> POWER, 1 -> GOOD, 0 -> FAILED. A boss who walked in nearly
dead must not read as a better performance than one who did not.

Damage stays on the one existing path. A graded blow carries a bonus share of its
own damage and the final blow is multiplied by the run's grade, chosen against the
fight's shape rather than picked:

    base (unchanged)  0.26 of max   -> 3 finishers, dead on the fourth
    flawless run      0.332         -> 3 x 0.996: alive on a sliver, dead on the fourth
    failed run        0.233

So the documented "it must land three times before it takes him" survives exactly,
and a perfect run leaves him on a visible sliver instead. Rage through `addRage`;
6 hp back on a PERFECT FINISH and nothing otherwise (`EXEC_PERF.finalHeal`, set it
to 0 to switch off).

### Verification

`_chromakey/execperfverify.js` — 40 checks, all eight of the brief's test cases
driven through the real input edges at fixed dt, plus the two invariants the
design rests on: the clock never stalled while the picture was held (asserted
frame by frame, with a separate assertion that the hold DID freeze the picture, so
the first cannot pass by the hold never happening), and the drawn index equals the
clock index whenever nothing is held. Damage totals are asserted numerically at
both ends (0.332 / 0.233). Three back-to-back runs produce identical step counts —
no drift — and nothing pressed during a finisher leaks out as a move after it.
`execperfshots.js` writes the picture set. `execverify`, `bossverify` and
`regress` re-run clean.

One thing the shot script taught on the way: typing J early and K half a second
later was graded MISS, which is `maxSpan` doing its job. The script was wrong, not
the grader.

### Same day — the prompt was the problem, not the player

Played rather than measured, and reported as "I keep missing the combinations."
Two separate faults, both in the presentation the brief warned would carry this
feature.

**The combination was in the wrong place.** It was printed as a row of lettered
boxes up in the HUD band while the fight it is timed against happened 280 px
lower. You either watch the prompt and lose the beat or watch the fight and lose
the prompt. Now **one button at a time, pinned over Olodo's head** — the man being
hit — so there is one thing on screen, one thing to do, and the eye never leaves
the blow it is timing against. Progress pips above the ring say how many presses
are left, because showing one at a time otherwise hides the LENGTH of the
sequence, and not knowing whether you are on the last press is its own kind of
blind.

Finding his head needed data the composition does not carry: it is two flat
sub-rect draws with no per-character transform. `EXEC_VICTIM_HEAD_X/Y` are his
151 measured opaque boxes from `exec_cells.json`, in the shared window's own
coordinates, baked rather than scanned at boot. **His head is not a smooth path**
— up to 48 window px of travel in ONE frame as he doubles over and is thrown — so
the marker chases it exponentially (~9/s) and is clamped on screen. Nailed
rigidly to it, a glyph strobes and is harder to read than the HUD row it
replaced; that damping is the feature, not polish on it.

**DualShock buttons, drawn as shapes.** □ and △ in their DualShock colours rather
than "J"/"K" or a unicode glyph — "△" set in Impact at 22 px is a smudge, and a
pink square is readable at a glance. The shapes are not a free choice: they are
whichever button already fires that input flag. `pollGamepad` reads the standard
Gamepad layout, where index 2 is □ and index 3 is △, and the jab is on 2 and the
uppercut on 3 — so the prompt names the button the player would press for that
move anyway. That is why those two tokens were chosen over an arbitrary pair. The
keyboard key is kept as a small sub-label under the ring.

**The timing was genuinely unfair, in two ways.**

`maxSpan` was 0.55–0.60 s, a fair budget for a sequence you have *already read* —
and nobody has. With one glyph shown at a time the player cannot even see the
second button until the first is in, so every press after the first costs a fresh
reaction: three buttons at ~0.3 s each needs ~0.9 s. The old span was failing
correct inputs on a clock there was no way to beat. Now 1.00 s, and `perfect`
widened 0.13–0.15 → 0.18 for the same reason — reacting to a glyph, not replaying
a memorised rhythm.

And `grace` was being **silently clipped**. The blows are ~1.05 s apart, so a
0.32 s grace plus the next checkpoint's 0.85 s lead overlap by 0.12 s, and the
overlap was absorbed by whichever rule fired first — the "next window has
arrived" cut — quietly taking a third of CP1's grace away. A player pressing
slightly late was failed by a clash between two config values, which is invisible
from either of them. `execBuildCheckpoints` now resolves it explicitly and in
favour of grace: a checkpoint keeps every millisecond after its own blow and the
next opens when it closes. `leadGot` records the lead that survived, and the
debug readout prints it next to the lead the table asked for.

Also: the score meter moved from mid-screen to under the boss health plate. With
the prompt on Olodo, a lone bar over the mural read as debris.

**On the test that had to be rewritten:** "correct buttons, too slowly" was
asserting a hard-coded 40-frame spacing, which stopped being too slow the moment
`maxSpan` was loosened — and then passed for the wrong reason, by failing the
checkpoint on the window closing instead. It now derives the spacing from
`maxSpan` and asserts the mechanism: the first token was accepted, and the window
was still open when the late press arrived. A test that names a magic number
tests the number.

### Same day — one button, and the only question left is WHEN

Played again and reported as "a lot of thinking when I should be enjoying the
gameplay". That is the correct read of it, and it is a design fault rather than a
tuning one.

A combination asks **two** questions at once — WHICH and WHEN — and the WHICH is
the expensive one. It costs a read, a decode and a finger choice on every press,
and it spends that attention *during the blows*, which are the part of a
five-second finisher actually worth watching. The mechanic existed to make the
player feel they were driving the execution; instead it made them study a UI
element while the execution happened somewhere behind it.

So the combinations are gone. **One press per checkpoint, the same button every
time** (`EXEC_ONE_BUTTON`), nothing to identify, nothing to remember after the
first finisher anyone plays. What is left is a beat to hit, three times.

△ / K rather than □ / J, and not arbitrarily: **the jab is the button being
mashed during ordinary combat.** A finisher whose beat is the same button as the
mash gets hit by reflex rather than by timing, and reflex is precisely what a
finisher is supposed to interrupt. △ is a deliberate press.

**The draining arc had to go with them, because it answered the wrong question.**
It showed how much window was LEFT, when the only thing a timing-only mechanic
needs to say is WHEN TO PRESS — and those are not the same instant, since the
window runs on past the blow through `grace`. An arc emptying after the moment
has gone is reporting a deadline you have already missed. It is now an **approach
ring**: starts wide, closes onto the button, arrives exactly on the blow. Press
when it lands. There is a static hoop at the PERFECT radius so the target is a
place on screen rather than a feeling, and the button lights up inside the band —
the ring says now, the glow says NOW. No number, no label, no decode. Past the
blow the ring stops shrinking and fades across the grace instead of vanishing at
the exact moment a late player is behind.

Mashing is still not a strategy, and falls out of the rules rather than being
policed: spamming △ completes the checkpoint on the first press inside the window,
which is a GOOD and never a PERFECT, and spamming everything hits a wrong button
and is a MISS. Timing is the only thing that buys the top tier.

**The sequence machinery stays.** `seq` is still a list, the grader still walks
it, `maxSpan` still bounds a multi-press run. A later pairing can ask for a
combination without rebuilding any of this; at length 1 `maxSpan` simply never
bites, because there is no gap between one press and itself.

**Two tests changed, and one of them is the point.** "Correct buttons but too
slowly" was a multi-press failure policed by `maxSpan` — which cannot fire on a
single press, so the test was about to pass while testing nothing. It is now
"pressed after the window closed", with a control asserting the identical press
one moment earlier still lands. Added `Test 6b`: every checkpoint is a single
press and all three want the same button — the design claim of this build,
asserted rather than assumed, so reintroducing combinations has to be a
deliberate edit instead of a quiet regression. 54 checks, all passing.

Also: `execperfshots.js` step 2 pressed a literal `'J'` left over from the old
combination. Once the build went one-button that was simply the wrong button and
the shot showed a MISS the game was right to give it. Shot scripts now read the
token from `cp.seq` like everything else. A harness that hard-codes what it is
testing stops testing it the moment the thing changes — third time that exact
lesson has been paid for in this file.

## 2026-08-21 — A perfect execution earns a second pass at the uppercut

**A flawless finisher now replays its own last beat.** The screen drops away, the
sequence restarts just before the uppercut, and the uppercut lands again at the
end of it — faster, harder, and with no input asked for. Sega-arcade brutality,
and the reason it exists is that a PERFECT run previously paid out in numbers the
player was not looking at: damage, rage, six health, a gold plate. **The reward
for perfect play should be the thing they just did, shown back to them.**

Gated on `PERFECT` and nothing else (`brutality.onlyOn`). A POWER finish ends
exactly where it always did, which is what keeps the round worth earning.

**It is the same frames.** No new art, no second execution: the same 151-cell pair
of sheets, resampled from `fromEvent` at `rate` 1.65. So it costs nothing to ship,
it cannot desync — there is still exactly one frame index driving both tracks —
and retiming the choreography retimes the reward round with it, the same way it
already retimes the checkpoints.

`fromEvent: 'KICK'` is **"just before the uppercut" read as a beat, not a frame
count.** Opening on f138 itself would start on a fist already in motion with
nothing to read it against; the kick is the strike the uppercut answers. f112 →
f150 is 1.27 s of animation, measured at 0.750 s of real time in the round against
1.234 s in the graded pass.

**Two things it must not do, and the first cut did both.**

*Deal damage.* The events table totals 0.26 of max health precisely so the
finisher lands three times before it takes MC_Olodo. A replay that re-applied
KICK and FINAL_HIT paid 0.145 a second time and killed him on the second finisher
instead of the fourth. The round is presentation only — `ev.dmg` is guarded on
`!bru`, and the harness asserts a flawless run still takes ~0.332.

*Rewind `ex.t`.* Half this system's invariants are "the clock is monotonic", one
of which `execperfverify.js` asserts directly. **The round runs on its own clock
(`ex.bru.t`) at its own rate while `ex.t` marches on underneath** — the same trick,
and for the same reason, as the frame hold. `execClock()` is the one place that
decides which of the two owns the picture, so nothing else in the system had to
learn that a replay exists.

The dim (`drawExecBrutalityDim`) goes over the street and over both fighters,
because the lights going down IS the signal — but **under the HUD**, deliberately:
a boss health plate you cannot read is a cost with no payoff, and the same
reasoning already keeps the HUD out of the shake. The flash on the replayed
uppercut is drawn after the dim and punches straight through it.

Everything the round adds rides existing systems at bigger numbers — one `fxMul`
on shake, embers, impulse and flash; a doubled `playHit` and a `blockHit` pitched
up half an octave layered on top of each event's own cue, never instead of it. The
one number that is NOT scaled up is the hit-stop on the replayed uppercut:
`holdOnHit` is 0.11 against the first pass's 0.166, because the hold is real time
and the round's remaining twelve frames are only 0.24 s of it. At 0.166 the round
ended with the picture frozen on the blow instead of on Olodo hitting the tarmac.

A lethal finisher now holds a boss at zero health for another 0.77 s rather than
twelve frames. He is inert throughout — the enemy loop `continue`s past all AI,
physics and frame selection while `execVictim` is set — and the kill still routes
through `launchEnemy` and the ordinary death path at the end of the round, which
the harness asserts rather than assumes.

New harness `_chromakey/brutalityverify.js` (33 checks, all passing) plus
`brutalitystrip.js` for the contact strip. The dim is measured off the pixels, not
asserted: two renders of the SAME animation cell, one per pass, differenced. **That
check first failed by reading 104 against 58 — the round was measuring BRIGHTER**,
because it was shot at frame 145 where the uppercut's flash is still up and the
round's flash is 1.5x longer. It reads f137 now, one frame before the blow and
past the kick's sparks in both passes. A visual check aimed at a transient
measures the transient.

## 2026-08-21 — MC_Olodo finally has a way to fall down

Audited the execution system against a full implementation spec. Most of it was
already built and is left alone — one gameplay state, two sheets on one clock, an
event timeline, three configurable checkpoints, a payout, an abort path, a debug
readout, one config object per pairing. What follows is the part that was missing.

**The boss was the last body in the game still being laid flat by fakery.** Darki
got real fall art (Darki_Fall), then the Agbero got two sheets (enemy-getup for a
knockdown he survives, enemy-death for one he does not) — and each time the same
note was written: the pose is DRAWN now, so the 90-degree rotation has to come
out. MC_Olodo never got that pass, because there was no art of him going over.
`onFallSheet` read `!enemy.boss` and said so: "Only MC_Olodo, who has neither,
still gets the fakery." He went down as his STANCE sprite turned on its side with
three stars circling it.

`ASSETS/NEW SPRITES/Olodo fall.png` is that art. Prepped by
`_chromakey/olodofall_prep.js` at 2:1, matching the policy of his other sheets,
into `sprites/boss-olodo-fall.png` (3072x1090, cell 512x218, 552 KB).

**Identified before it was wired, and that was not paranoia.** The figure in the
sheet wears green trousers, a white tank and orange boots — and so does the Agbero
mob. Wiring the mob's fall art to the boss would read as "the boss turned into a
different man when he went down". `olodofall_ident.js` puts one standing frame
from all six candidate sheets side by side: it matches the boss stance and hook
sheets exactly and is nothing like the rasta-headband, ripped-jeans Agbero.

**Three sections, read off the art** (`olodo_fall_contact.png` plus the per-frame
opaque bbox table beside it), not guessed from the frame count:

  0-3    fallAir   airborne, upside down, head leading
  4-10   fallDown  the bbox bottom hits its deepest point (375) on frame 4 and
                   stops moving — which is what "he is on the tarmac" looks like
  11-29  getUp     the top rises 118 -> 98 at a fixed bottom: a dazed push back
                   onto his feet, ending in his standing guard

That is the same split the Agbero sheet already has, so it drops in beside it
rather than needing its own path.

**`faces: -1`, and settled on the RIGHT test.** Two sheets in this project ship
mirrored against their own family and both carry a comment begging the next person
not to "fix" it. For a knockdown the ground truth is deliberately NOT the cap peak
— it is WHICH END HIS HEAD IS. The sim faces a falling body at its attacker, so a
man knocked off his feet lands head away and boots pointing back; this art puts
the head on the +x side (frames 0/4/8 measure x 596-919, 682-959, 686-1007 with
the head at the high end) exactly as the Agbero sheet does. Shipping it as 1 would
lay the boss down head-first into Darki.

**`bodyFrame: 29`, which is the opposite choice from ENEMYFALL_SHEET's 0** — and
for a reason. That sheet anchors the frame he ENTERS through, a standing guard.
Frame 0 here is a man in mid-air, and a tumbling body is not a height. Anchoring
the last upright frame instead is what makes the swap back OUT of a survived
knockdown invisible, and `heightcheck.js` now measures the fall sheet's standing
tail at a median of 190 against the stance sheet's 188 — a 1% difference. Its flat
frames measure 91-127, correctly a lying man. (Reading the whole 30-frame clip as
one height is meaningless, so heightcheck grew a `rowFrames` variant.)

**HIS FRAME HAD TO BE MADE TO MOVE, and this is the one that would have shipped
broken.** The generic animation stepper skips the boss outright — `if (enemy.boss)
continue` — because he normally drives his own frame from a move table or the
stance clock. Neither of those runs in hit/down/ko. So the sheet would have
loaded, the router would have picked the right section, every state assertion
would have passed, and the knockdown would have been ONE STALE CELL held for a
second. The gate is now `if (enemy.boss && !bossFalling(enemy)) continue`, so he
takes the same path the mob does and inherits all of it: spec-change detection
restarts the clock, `loop: false` holds the last frame, `fallRate` varies playback.

**His timings are his own.** 7 and 19 frames against the mob's 9 and 6, so
borrowing `DOWN_DUR` handed him back to his stance a third of the way into a
19-frame get-up. `fallTimes(e)` is now what both the down timer and the
crash-to-get-up handover read, so a body's animation and how long it is helpless
cannot disagree.

**A SURVIVED FINISHER NOW ENDS WHERE IT LOOKS LIKE IT ENDS.** The choreography's
last cell leaves MC_Olodo flat on the road — that is what `endVictimFrac` 110/824
measures — and `endExecution` restored `saved.eState` and put a man who was lying
down straight back into his walk cycle. He stood up out of nothing, in one frame,
from a pose the game then discarded. There was no art to land on before. He now
stays down, the crash section holds him there, and he pushes himself up through
`getUp` on his own timer. It is done by setting the SAME state a launch sets — no
second code path, no PlayFallAnimation() that only the finisher can call.

Note what this does NOT change: **super armour.** "Only the killing blow puts
MC_Olodo on the tarmac" — giving him fall art is exactly the change that would
tempt someone to start flooring him with uppercuts, so `bossfallverify` asserts a
heavy non-lethal blow still only staggers him. His fall sheet is reachable by two
routes and two only: the killing blow, and the end of a survived execution.

**The boss is no longer excluded from the corpse hold.** He was, because there was
no performance to hold on. With his crash drawn, a bare KO_FADE started dissolving
him on the frame he landed and he was at 65% opacity before he was flat. He gets
his own crash length now, which delays the case file by that much and nothing more
(`onBossDefeated` fires when the timer expires; the outro is sequenced off it, not
synchronised to it).

### Also from the audit

**The victim now recoils on a graded checkpoint.** Every other piece of checkpoint
feedback moves the PICTURE — the shake wobbles it, the impulse shoves it, the
vignette darkens it — and none of that is Olodo being hit harder, it is the camera
being hit harder. `execVictimRecoil` nudges the victim layer alone, away from the
swing, decaying over 0.12 s. Deliberately tiny: 5 px on a GOOD and 9 on a PERFECT
against a 580 px window, 15 on the uppercut. The two tracks share one window
precisely so their bodies stay where the artist drew them, so this is a recoil ON
TOP of the choreography — and the test asserts it is back to exactly zero
afterwards, because a recoil that did not decay would be the composition coming
apart.

**Debug gained the three tuning actions and the positions.** `execRestart` /
`execSkipTo(cpId)` / `execFinalBlow` all move the CLOCK and nothing else, which is
the only honest way to scrub a system whose whole design is "one clock drives
everything" — winding `ex.t` forward reproduces exactly the state that time would
have produced, and nothing sets a frame or fires an event by hand. A backwards
skip is refused rather than ignored (the sequence has no reverse). The readout now
prints both the sim positions and where the composition will leave the two men,
because during a finisher those are different things: the sim parks both bodies at
their entry spots while the choreography walks them across the window and swaps
their sides.

**`execRestart` was born broken and the harness caught it in the same sitting:**
the fall-sheet handoff above leaves the victim `down`, and `canExecute` refuses a
man on the floor — correctly. So the dev restart stands him back up first. Without
that it silently returned false on every call after the first.

### Deliberately NOT implemented

**The 150-250 ms input buffer.** It would make this mechanic worse, not more
forgiving. Every checkpoint window already opens at least 0.71 s before its blow
(CP1 0.85, CP2 0.747, CP3 0.713 after the boundary pass), so a buffer a fifth that
size adds nothing for a player pressing early — they are already inside the window
by a wide margin. The only presses it would newly capture are extra taps in the
previous checkpoint's grace tail, and feeding those forward would let a double-tap
on beat N pre-satisfy beat N+1. That directly contradicts the property this build
was tuned for: spamming completes a checkpoint on the first press inside the
window, which is a GOOD and never a PERFECT. Timing is meant to be the only thing
that buys the top tier.

New harnesses: `bossfallverify.js` (33 checks), `exechooksverify.js` (8),
`olodofall_prep.js`, `olodofall_ident.js`, `olodofall_facing.js`,
`bossfallstrip.js`. "He is no longer rotated" is measured on the pixels, not read
off the flag: shoot the frame twice with his alpha at 0 in one, diff, and check
that the silhouette is wider than tall while flat and taller than wide standing.

## 2026-08-21 — EXECUTION moves to L2, and the pad mapping finally gets a test

Requested: the finisher is activated with **L2**. It was on R2 (button 7).

**Grab moved to R2 to make room, because L2 was already grab.** A swap, not a
second binding — double-booking L2 would throw a grab attempt at every execution
press. Grab has now moved twice and both moves were the same trade: it came off L1
when the guard arrived (blocking wants the shoulder button you can HOLD, and
holding a button that also grabs fires a grab every time you raise your hands), and
it has come off L2 so the finisher can have it. It keeps a trigger, just the other
one. **Keyboard and mouse are untouched: grab is still G / MMB, EXECUTE is still E.**

The left trigger is the right button for this for the same reason the checkpoints
are on △ rather than □ (see `EXEC_ONE_BUTTON`): **the right hand is the hand that is
mashing.** Jab, kick, uppercut and the combo all live on the right side of the pad,
so a finisher over there competes for fingers that are already busy — and the three
checkpoints it opens are then pressed with those same fingers a beat later. L2 is
the left hand's deliberate press, reached for on purpose and never in a flurry.

Updated with it: the button-mapping table at the top of the poll (which was also
missing entries for 6 and 7, and still listed grab on L1 after that move), the
`padSeen` prompt glyph, the "you can finish him" prompt label, and the on-screen
controls strip — which now names the pad buttons for grab and block too, since it
was only ever naming R2 for the finisher.

### The mapping had no test at all, and now it does

`__ror.pollPad()` was added specifically so the controller path could be verified,
and then nothing ever verified it — so the whole pad mapping was a table of magic
indices with nothing behind it. That is exactly the wrong shape for a change like
this: a swap done in two places is a swap that can be done in one.

`_chromakey/padbindverify.js` (38 checks) stubs `navigator.getGamepads` **before
boot** and drives `pollGamepad` itself, the same function a real controller goes
through, rather than poking `input` and hoping. For all eight action buttons it
asserts three things:

- the button raises **its own** flag,
- and **nothing else** (allowing the jab's and kick's documented `lmbRaw` /
  `rmbRaw` companions, which feed the click-combo counter),
- and the **edge/held split** holds: the attack buttons fire once per press and
  not again while held, while block and jump stay raised — a binding that quietly
  became held would present as "the finisher fires twice" or "he won't stop
  guarding", neither of which reads as a mapping bug.

Then the two that swapped, explicitly: L2 is EXECUTION and not grab, R2 is grab and
not EXECUTION. Plus a shot of the prompt (`padbind-prompt.png`), because the glyph
is the one part of this a player actually reads and a label is not something a flag
can confirm.

## 2026-08-21 — STREET JUSTICE: a second finisher on MC_Olodo, called with L2 at 50%

- Wired `ASSETS/NEW SPRITES/Street Justice animation Attack.png`, which had been
  sitting unreferenced since it was added. Prepped 2:1 by
  `_chromakey/streetjustice_prep.js` into `sprites/exec-streetjustice.png`
  (4608x1744, cell 512x218, 9x8) with a manifest. The sheet ships real alpha
  (89.9% translucent, transparent corner), so the loader's flood-fill key-out has
  nothing to do for it.
- Identified the victim ON THE ART before wiring anything, with
  `streetjustice_ident.js`: it is **MC_Olodo**, not the Agbero mob. Both wear green
  trousers, a white tank and orange boots — the tell is that this is the heavy-set
  man in the green cap, matching `boss-olodo-emote` / `-hookkick` / `-fall` /
  `exec-olodo`, while the mob (`enemy-ginger`) is a slim man in dreadlocks, dark
  jeans and sneakers. This is the same collision `olodofall_ident.js` was written
  for.
- **THE GRID IS NOW PER PAIRING.** `EXEC_GRID` was one module constant read by
  every consumer of the sheet's shape, so the block's own claim that "a new
  finisher needs a row in EXECUTIONS and nothing else" was false for any sheet shot
  on a different grid — this one differs on all of cols, rows, count and aspect.
  Added `EXEC_GRID_SJ` and `execGrid(def)`; no code reads `EXEC_GRID` directly any
  more.
- **COMPOSITE PAIRINGS.** `compositeSrc` is one sheet with both men baked into
  every cell, drawn as a single sub-rect into the same shared window. It avoids
  the two-track scale conflict documented on `darki_olodo` (the artist fixed the
  relative sizes) at the cost of no independent body scale, hide or swap — so no
  `bodyFrame` handoff, and no victim recoil, which offsets one layer against the
  other and would shove Darki away from his own punch.
- New `EXECUTIONS.darki_streetjustice`, all anchors measured off the art rather
  than chosen: `drawH` 330 (the geometric mean of the two exact-fit values, which
  puts Darki within -2.7% and the boss within +3.1% of their drawn fight heights,
  168 and 188), `anchorFrac` 253.5/1024 on Darki's centre, `groundFrac` 339/436 on
  his soles, and end fractions read off f68. Timeline read off
  `streetjustice_beats_*.png`; `FINAL_HIT` sits on f61 because that cell carries a
  painted impact flash.
- **69 cells, not 72.** Darki has left frame by f69 (ink drops 50872 -> 34760, the
  bbox jumps to one horizontal body at x[622..973]), so playing the tail would
  vanish him for 0.15s and pop him back. The sequence completes on f68 with the
  boss airborne and `endLaunch` hands that body to `launchEnemy` — the arc, bounce
  and fall sheet every other floored enemy already uses. The unused cells are the
  artist drawing what that system draws anyway.
- **Two checkpoints, not three**, and the runtime decides it: a window is
  lead+grace = 1.17s wide, and this sheet's heavy beats (KNEE 2.30s, KICK 2.80s,
  FINAL_HIT 3.05s) are 0.5s or less apart, so a third would have been handed a
  0.18s lead by the boundary pass — a prompt that appears and is gone. CP1 on
  HIT_03 (1.10s) and CP2 on KICK (2.80s) are 1.70s apart and both keep their full
  0.85 lead. `execFinalGrade` already took the count, so PERFECT is 2 of 2 here.
- **The 50% call.** `hpFrac: 0.50`, so the L2 appears over the boss's head at half
  health rather than the boss pairing's 35%. Routing is split BY ROUTE, not by
  health band: the manual press plays Street Justice, the five-hit combo keeps
  chaining into `darki_olodo`. A band (50%->35%) was rejected because 15% of
  1240hp is ~186 points, crossable in one combo without the prompt ever being
  seen. `execManualPick` is the single resolver both the prompt and the press go
  through, so they cannot offer different things.
- Damage totals 0.26 of max health, identical to `darki_olodo`, so the boss's
  time-to-kill does not depend on which finisher the player prefers to watch.
- No reward round on this pairing: `brutality` replays from a named event, and the
  stretch here would be one blow and 7 cells of airborne body. Left off rather
  than shipped thin — the round is opt-in and a PERFECT still pays out.
- Per-pairing victim-head tables via `EXEC_HEADS`, keyed by def id and resolved at
  draw time (a `headX:` field on the def would be a dead-zone throw, since the
  tables are declared far below the `EXECUTIONS` literal). `EXEC_SJ_HEAD_X/Y`
  generated by `streetjustice_head.js`, which finds the boss BY COLOUR — he is the
  only green in frame — because the two men are touching for most of the sheet and
  there is no geometric split to make. `execVictimHeadScreen` now derives its
  window-to-screen factor from the grid instead of the hard-coded 376.
- New `_chromakey/streetjusticeverify.js` — 66 checks, all passing: the def's own
  grid drives the frame index and the 3.45s duration, the anchors match
  `streetjustice_cells.json`, the prompt and the press always agree, the 50% gate
  and the below-35% route split, both checkpoints keep their lead, a flawless run
  is PERFECT and ends on f68 without reaching f69, the survived handoff is a launch
  and not a lie-down, the lethal case dies through `dying`, damage parity between
  the two finishers, the composite frame is not blank, and `darki_olodo` still runs
  151 cells on a monotonic clock.
- New test hooks: `execWhyNotDef` / `execTargetDef` / `tryExecuteDef` /
  `execManualPick` / `tryExecuteManual` / `execGridOf` / `execArtReady`, plus
  `execFromCombo` — the combo route had no hook at all, which only became a gap
  worth filling once a second pairing could match the boss. The four existing
  hard-wired `darki_olodo` hooks were deliberately left pointing there so the
  existing suites keep testing what they were written against.
- `streetjusticestrip.js` shoots the L2 call over his head at 49% health
  (`streetjustice-call.png`) and a six-panel contact strip across the finisher.

## Pause menu — rebuilt on the front end's widgets, and made to work

The pause screen was drawn by hand in `game.js` with raw `fillText` and a skewed
red bar while the rest of the game had moved to `frontend.js`'s glass/orange
widget set, and most of it did not respond to input. Both halves of that.

**It did not work.**

- **A controller could open it and nothing else.** START (button 9) paused, and
  then the D-pad only ever fed the MOVEMENT merge — the menu read no pad input at
  all. There was no accept button and no back button. The only way out was
  START/P/Escape. Pad navigation, ✕ to commit and ○ to resume are now live, on
  the same latch-then-hold-repeat cadence the front end uses (`HOLD_DELAY` /
  `HOLD_RATE` are read from it, not copied).
- **The button that opened it closed it again.** `clearPauseInput` used to zero
  the pad edge table, so the START press still physically held read as a fresh
  press on the very next frame. It is now SEEDED from the live buttons, and the
  repeat clock is parked at the hold delay so a held direction does not start
  stepping the instant the menu appears. Same fix covers ✕ and ○ coming in from
  gameplay.
- **A mouse could not touch it** — the only screen in the game that was not
  clickable. Hover moves the selection (with the cue), and a press-then-release
  on the same row commits.
- **Clicks and buttons pressed while frozen queued real combat edges.** The
  canvas `mousedown` handler only checked `frontEnd.active`, never `paused`, and
  the keyboard handler raised `leftJabPressed` / `upperPressed` / `grabPressed` /
  `executePressed` regardless — so a click or a mash during a pause was a swing
  thrown on resume. Held state is still tracked (a key genuinely down should read
  as down when the fight restarts); the one-shot edges are not raised while
  frozen. That gate is keyed on `paused` ALONE: the first attempt also gated on
  `frontEnd.active`, which looks like the same argument but is not — the front
  end already clears every one of those flags in `onGameplayStart`, and gating on
  it silently disabled every rAF-stubbed harness that drives attacks through real
  key events, because those never let the front end hand over. It turned the
  whole `regress` combat chain into a no-op. `pollGamepad` now routes to `pollPausePad`
  while frozen, which zeroes what the sim reads and re-arms every gameplay edge
  tracker to the live button state — so holding ✕ to pick RESUME cannot also make
  Darki jump on the way out.
- **`Space` and `KeyJ` are deliberately NOT accept** (the front end takes all
  three). They are Jump and Attack: a player who pauses mid-mash would otherwise
  have RESUME chosen for them by the button they were already pressing. Enter
  alone on the keyboard, ✕ on the pad.
- **CONTROLS and OPTIONS were dead ends** — they drew a read-only text list and
  said "full settings are available from the main menu". They now hand off to the
  real, interactive front-end screens via `openFromPause`, and come back to a
  still-frozen fight through the new `onPauseReturn` (deliberately not
  `go('gameplay')`, which would restart the music and re-arm the FIGHT banner).
  `pausedOrigin` is tracked separately from `returnPhase` because the trail can
  be two deep: pause -> OPTIONS -> CONTROLS.
- **Settings changed from pause now take effect immediately.** The old build read
  them exactly once, on the way INTO a fight, so a volume change made from the
  pause menu did nothing until the next run. `applyGameplaySettings` is the one
  crossing point and both entries call it. Music sets the fade TARGET, so it
  slides rather than jumps.
- Retired `frontend.js`'s `drawPauseHelp` / `pauseHelp` phase. It was unreachable
  (nothing routed to it), `confirm()` had no branch for it so Enter did nothing,
  and `back()` from it went to the MAIN MENU — abandoning the fight. Two pause
  menus, neither finished; now one.

**The look.** The overlay is still drawn by `game.js`, on purpose: a pause screen
over a fight has to keep the frame the player stopped on, and the front end's
`stage()` would paint its background video over it. It is not a second look,
though — `createFrontEnd` now returns a `ui` bundle and the pause screen uses the
REAL widgets (same `ctx`, same palette, same `button()`, same focus easing, same
navigation cues), so the two cannot drift apart. Header on `screenHead`'s exact
metrics; the five rows are `button()` calls; the right-hand pane is a `glass()`
panel reporting HP, rage, objective, arena and difficulty in the OPTIONS screen's
list/detail split; glass frosts a snapshot of the real dimmed fight behind it.
`ui.tick(dt)` exists because the front end's own `update()` does not run while
gameplay owns the frame, and the eases would otherwise freeze.

The HUD now stands down while paused instead of showing through — the health bar
sat exactly where the PAUSED title goes, and the panel reports the same numbers
more legibly. The execution prompt and perf HUD stand down for the same reason.

**Tests.** New `_chromakey/pauseverify.js` — 42 checks, all passing. Unlike the
other harnesses it does NOT stub `requestAnimationFrame`: the focus easing, the
hold-repeat and the hand-off all live in the real loop, so the real loop runs and
every press is a real key/button/mouse event. It covers pad and stick navigation,
hold-repeat, the two-deep OPTIONS trail returning to a still-paused fight, mouse
hover and click, the boss-room branch of the status panel, and that nothing
queues while frozen. `ensurePaused` guards each section because two of the five
items reload the page. Shots: `pause-menu.png`, `pause-controls.png`,
`pause-resumed.png`, `pause-boss.png`.

`tests/drive.html` waited a flat 800 ms before running, which was correct while
boot loaded every sheet before the first frame. Since the boot split it landed on
an empty world — `enemies[0]` undefined, sprites still null — and every scenario
in `regress.js` threw before its first assertion. It now waits on
`__ror.worldReady`. Pre-existing, unrelated to the above, and it was hiding the
whole suite.

Known, pre-existing, NOT fixed here: `grabverify` section 17 (`mmbClick`) reports
`startsGrab: false`. `mmbClick` dispatches a real middle-click and the canvas
handler's first line has always been `if (frontEnd?.active) return;` — a
rAF-stubbed harness never lets the front end hand over, so the click is dropped
before any grab code runs. `_chromakey/mmbguard.js` confirms it: phase is
`splash`, `paused` is false, the click raises nothing, the `__ror.grab()` hook
raises it fine. The MMB binding is currently untested, not broken.

## Boot sequence — one title screen instead of three, and a figure that fits the street

**Three screens became one.** The old order was studio card -> a 0.75 s black cut
-> `reveal` (the logo, centred, over the street) -> `title` (the same logo shoved
into the top-left corner with Darki standing beside it and a PRESS ENTER button).
It showed the logo twice and then arrived somewhere worse than where it had just
been. `black` and `reveal` are deleted; the studio card runs 2.2 s and goes
straight to a title that IS the centred reveal and grows its own prompt in place.

- The plate is pushed all the way back — `darken: 0.44` over a near-total
  defocus — and nothing stands in front of it. First attempt was 0.62 and it
  crushed the sunset, the wet tarmac and the shop signs to flat black, which
  throws away the only thing on that screen that says Lagos.
- Logo centred at scale 2.15 (664 px of glyph). Vertical balance taken off the
  supplied key art rather than eyeballed: caps' optical centre at 0.481 of frame
  height, prompt at 0.811.
- STREETS OF JUSTICE in gold between two hairlines that fade outwards, as in the
  key art.
- **PRESS (X) TO ENTER arrives at 3.2 s**, fades in over 0.85 s and then breathes.
  The X is the actual controller glyph on a keycap plate, in the same blue the
  hint bar has always used for it. The screen is never gated on its own
  animation: a press at 0.3 s enters just the same.
- A press anywhere on the screen enters — the click target is the whole frame,
  which is what a "press any key" screen should be.

**Depth of field.** `stage()` takes a `blur` amount. The 320x180 snapshot the
glass panels already sample gets drawn back over the full frame, which is a wide
smooth defocus for 0.17 ms of a 2.54 ms frame — no second filter, no shader.
Deliberately applied BEFORE Darki, so the plate goes soft and he stays sharp.
Menu 0.82, character 0.86, briefing 0.88, difficulty 0.90, level select 0.92.

**Darki's height was a taste value and should never have been one.** He was drawn
at 440-470 px of a 720 px frame, per screen, by eye. The plate is a real street
with real people on a real ground plane, and under a pinhole camera a figure
standing on that plane has exactly one correct height for where its feet are:
proportional to (feet - horizon). Two figures fix both constants, measured off
`uibg-frame.png` (the plate at composite size, before the wash and vignette hide
the evidence):

    pedestrian by the danfo     feet y=460    135 px
    pedestrian right forecourt  feet y=540    230 px
    ->  horizon y0 = 346,  k = 1.187

At his feet (y=628) that is 335 px, not 440 — he was very nearly twice a
bystander, which is what "he looks pasted on" actually was. Cross-checked
against an object nobody fitted: the danfo is 170 px tall with wheels at y=455,
so at Darki's depth it would be 440 px; a 2 m bus at 440 px makes a 1.85 m man
407 px standing, and his crouched idle at 335 puts him at ~420 standing. The
independent object agrees to 3%.

`GROUND` / `figureH(feet)` now own this, `drawDarki` defaults `h` to it, and
every screen passes only `cx`/`feet`. One figure, one scale — he can no longer be
one size on the menu and another on the briefing. A screen may still pass `h` to
break the rule on purpose; none do.

**Logo distress rebuilt for the size it is now drawn at.** The bitmap was 2x, and
the title draws it at 2.15 — a 1.07x upscale that turned 1-2 px scratches into
chiselled notches in the middle of RATEL. Now 3x (so the title draw is a
downscale), scratches always one logical pixel tall and shorter, slightly lower
alpha. Reads as weathering at 664 px and as texture at the menu's 309 px.

**Tests.** `_chromakey/titleshot.js` shoots the sequence and checks it: the studio
card reaches the title with no `black` and no `reveal` in between; the prompt row
is empty early and plainly lit a few seconds later (sampled from the CANVAS
PIXELS, because "does the delayed thing actually appear late" is not a question a
phase name can answer); Enter at 0.3 s still enters; and the ground rule gives
~335 px at the menu line and grows monotonically with depth. 9 checks, passing.
It also writes `plate-clean.png` via `plateprobe.js` — the video with the render
loop stopped, which is the only honest way to see the plate, since the first
attempt at a "clean plate" was silently repainted by the live loop between the
draw and the screenshot.

A soft lighter block behind the danfo was chased as a blur artifact and is not
one: on a scan line through it the blur strictly LOWERS edge contrast (36 -> 16),
and the sharpest gradient anywhere near it is the PHARMACY shopfront, which is
real. `menuverify` is 42/42.

Fixed a latent flake in `menuverify` that this work turned into a certainty. The
background-loop check was `bgB.t > bgA.t || (bgA.t > 4 && bgB.t < bgA.t)`, which
has a dead window: the clip is 5.04 s, the sample gap 1.4 s, so any start in
(3.64, 4.0] wrapped without satisfying either half. 7% of the loop — harmless for
months, then a dead certainty once the boot sequence got 2.3 s shorter and the
sample landed inside it every run. It now measures distance travelled AROUND the
loop. The remaining intermittent failures in that suite are the input-cadence
checks under machine load: a burst of presses inside one 120 ms transition
collapses to a single queued action BY DESIGN, and those tests assert 3-for-3,
so they fail when the page cannot keep up. Unloaded, the suite is 42/42 at 60 fps.

### Main menu plate un-blurred

Defocus removed from the main menu by request — the plate stays sharp and the
panels earn their legibility the way they do on every other screen, from their
own frosted backing rather than from a soft frame behind them. `msBlur` drops
from 0.17 ms to 0.07 ms (one pass instead of two).

Deliberately NOT removed from difficulty / character / briefing / level select.
Those are working screens with copy to read over the same busy market; the main
menu is the one that is a shop window for the art. Say the word and they follow.

`titleshot.js` now asserts this rather than trusting a screenshot: the sharpest
luminance step along a background row (clear of both the left panel and Darki) is
> 28 on the menu, < 24 on the briefing, and lowest of all on the title. Blurring
cannot raise edge contrast, so a high number there IS a sharp plate.

### Navigation cues: one sound for moving, one for leaving

The two cues were mapped to the wrong axis. DOWN played the forward cue and UP
played the BACK cue, so travelling up a list sounded like cancelling — the same
sound the game uses for backing out of a screen. By request, and it was the right
call: moving the cursor up a menu is not going back.

- **Both directions now play the move (forward) cue** — `move()`, the pause
  menu's `movePauseChoice()`, and mouse hover, which had the same
  direction-derived split.
- **The back cue is reserved for leaving**: `back()` (O / Escape / Backspace,
  and returning out of a sub-page), plus dismissing the pause menu, which
  previously made no sound at all. Choosing RESUME with Cross stays a
  confirmation and keeps the move cue.
- Option rows follow the same rule: flipping a toggle or cycling a value
  leftwards used to play the back cue and now plays the move cue. Sliders remain
  deliberately silent (a cue per step machine-guns).

Tests updated rather than deleted — the two that encoded the old mapping now
assert the new one, and a new check states the rule outright: walking a list in
either direction, wrapping included, must produce `order === 'FFFFF'` and zero
back cues. That is the assertion most likely to be undone by accident later.
`pauseverify` gained the same coverage for the pause menu, including that O is
the back cue and Cross on RESUME is not. `menuverify` 43/43, `pauseverify` all
passing, and the seven existing "BACK uses the back cue only" checks are
untouched and still green — which is what confirms the cue still means one thing.

Also split `pauseverify`'s `ensurePaused` canary from a new `openPause` setup
helper. The canary reports an unexpectedly-resumed menu as a failure, which is
right, but the new cue sections deliberately begin after a RESUME test — so the
canary was reporting the previous section's correct ending as this section's bug.

## 2026-08-23 — The title is the only defocused screen

The working screens were carrying a 0.86-0.92 background defocus that the brief
never asked for. Removed it from `drawDifficulty`, `drawCharacter`,
`drawLevelSelect` and `drawBriefing`, which leaves exactly one `stage()` call in
the file passing a `blur` — `drawTitle`. Those screens keep their `darken`, so
they still hold copy legibly; they just are not soft any more.

Not touched, deliberately: the frosted `glass()` panel material. Every panel on
every screen samples the same downscaled backdrop snapshot to be glass rather
than paint, and removing that is a redesign of the whole UI, not the removal of a
background effect. The dev tuning panel's CSS `backdrop-filter` is also left
alone — it is a developer tool, not a game screen.

`titleshot` now states the new rule instead of the old one. It measures the
sharpest luminance step along a background row clear of both the panel and Darki,
and blurring cannot raise edge contrast, so the numbers are proof rather than an
opinion: **menu 34.14, briefing 29.73, title 9.30**. The briefing clearing the
same bar as the menu is a stronger result than it looks, because the briefing
also darkens by 0.24 and darkening scales contrast too.

## 2026-08-23 — The case file replaces the level title card

The last screen before the fight was a 2.55-second card that read LEVEL 01 / THE
STREET TAX and then dropped the player into the arena knowing nothing about who
they were about to hit. It now carries the whole briefing sheet from the supplied
reference: the written dossier and the call to action down the left, MC Olodo's
portrait centre, the profile table right, and MISSION OBJECTIVE and CONNECTION TO
TULUMBU across the bottom, with the threat level stated as both a word and a bar
so it never depends on colour alone.

**It waits for Cross now, and no longer times out.** A case file nobody can
finish reading is set dressing. The world is still arriving underneath while it
is up, and pressing Cross before the art lands falls through to the same handover
card the old timeout did, so nothing about the loading behaviour changed. O backs
out to the briefing — which does mean the intro plays again on the way forward,
and it is skippable, but that was the honest trade against a BACK that silently
discarded the setup trail. A click anywhere starts the mission, because there is
no widget to click and this must not be the one screen a mouse cannot leave.

- `ASSETS/Images/Boss Portraite.png` is the art from the reference but it is a
  2.2 MB PNG outside the served folder. `_chromakey/olodo_portrait.js` crops it
  to the reference's own framing (keeping the FUEL PRICE HIKES and LAGOS posters,
  losing the boombox) and re-encodes it to the panel's size: **2.14 MiB PNG ->
  144 KiB JPEG** at `frontend/olodo-dossier.jpg`. Fetched at boot and never
  awaited; the panel draws a CASE PHOTO placeholder if it somehow is not in.
- Copy lives in a `DOSSIER` constant, not in draw calls, so the writing can be
  edited without touching a coordinate. Two departures from the reference: the
  duplicate OCCUPATION row is dropped (the mockup gives it the same value as
  ALIAS), and the profile labels are shortened, because the table is 328 px wide
  here against 470 in a 1598 px mockup and a column wide enough for "POLITICAL
  ROLE" is a column stolen from the values.
- New `wrapLines` / `textBlock` / `hairline` helpers. `textBlock` returns the
  next free baseline, so the written blocks flow off measured heights instead of
  hand-counted y values — which is what makes the new `briefshot` check possible.

`_chromakey/briefshot.js` (10 checks) proves the parts a screenshot cannot: that
the screen does not time out, that Cross reaches the handover and O reaches the
briefing, that the portrait really decoded rather than the layout being
photographed against its own placeholder, and — reading the extents the renderer
recorded while drawing — that every wrapped block landed inside its panel. Copy
is wrapped at draw time, so a longer sentence silently grows a column; those
numbers are what catch it.

Two harness bugs found and fixed on the way, both of which had reported the
screen as broken when it was not: the shot was being taken while the handover
card was up and labelled a layout (it now prints the phase it was taken in), and
the "Cross starts the mission" check ran before the pixel reads, latching the
handover so everything after it measured a screen that was no longer on.

### `_chromakey/cueverify.js` — the cue rule, off the critical path

`menuverify` covers the navigation cues, but its boot gate waits for
`__ror.worldReady` — the game's multi-megabyte sprite sheets — with a 180 s
ceiling. On a loaded machine that gate times out and takes the frame-pacing
checks down with it: three consecutive runs failed three *different* checks out
of the same input-cadence group, one of them after an explicit `BOOT TIMEOUT`.
That says something about the machine, not the code.

`cueverify` asks the one question directly, waiting only on the front end the way
`titleshot` and `briefshot` do, so it boots in seconds. It asserts **which** cue
each move played, not how many presses got through — because a press count is a
timing measurement in disguise here. A latch is a flag rather than a counter, so
two presses landing inside one long frame collapse to a single queued move, and a
`=== 5` assertion would reproduce the very flake this file exists to escape. A
single leaked back cue in either direction still fails, which is the whole rule.
There is a comment saying so, because "tighten this back to an exact count" is
the obvious-looking edit that would undo it.

6/6: both directions, both wrap edges, movement inside a sub-screen, and exactly
one back cue on leaving.

## 2026-08-23 — The case file, alive: briefing voiceover, cascade, typewriter

The last screen before the fight (`levelTitle`) was a finished layout that did
not move. It now plays `frontend/audio/briefing1.mp3` and animates against it:
the right column cascades in, the dossier types itself on the narrator's clock,
and the target card is lit by a light that never stops.

### The voiceover is the clock, not just the soundtrack

`briefT` is a second clock alongside `phaseT`, and the distinction matters:
`phaseT` is the *screen's* transition clock — it drives the fade-in, and
`briefshot.js` sets it to 30 to prove the screen does not time out. The reveal
cannot ride that. `briefT` reads `briefVo.currentTime` whenever the clip is
actually rolling, and only falls back to a `dt` accumulator when `play()` was
refused, because a dt accumulator drifts against a media element the moment a
frame is dropped.

Started on entering the screen, stopped on **every** way out. The ways out are
not one place, which is why the stop is written as enter/leave in `go()` *plus* a
call at the top of `enterGameplay()`: on the slow path that function latches the
handover and draws the hold card without ever going through `go()`, so a stop
hung only off the phase change would leave the briefing talking over it. The
stop is a 210 ms fade, not a cut — Cross goes straight into the fight's own
music — and it is idempotent, because Cross triggers it twice (once directly,
once via `go`) and re-entering a running fade would re-read the half-faded
volume as its starting point and cut the tail short.

Deliberately **no** `ended` handler: the read finishing must not dismiss the
case file, which waits for Cross and nothing else.

### The cue table is measured, not guessed

Added `_chromakey/briefvo.js`: decodes the clip in Chromium's own decoder,
reduces it to a 20 ms RMS envelope, and reports the true duration plus every
interior silence. The clip is **37.009 s**, speech from 0.20 to 36.54, with
pauses at 9.38, 15.80, 28.68, 32.66 and 34.46 — and the longest pause in the
whole read, **1.1 s, sits at 15.80**. Body paragraph 3 opens "But Olodo is not
the architect", the rhetorical turn of the briefing, so the biggest breath in the
read is exactly where that paragraph starts. `BRIEF_SCRIPT` anchors the six
written blocks to those pauses.

Each block types across its own run of speech and then **holds** through the
pause after it, so the beat the narrator leaves is a beat on screen. The property
that matters more than any single number: every block re-anchors to an absolute
time, so a cue that is off by a beat cannot drift into the next one. Error is
bounded per block, never cumulative. Re-cut the clip, re-run `briefvo.js`, move
those twelve numbers, and nothing else.

### The typewriter does not reflow the page

`textBlockTyped` wraps the block in **full** first and always returns the full
height, so the copy underneath never moves as characters arrive. Wrapping the
revealed substring instead would re-flow the page under itself on almost every
frame — the last word jumping to the next line and back — and a page that
reflows while you read it is a page nobody can read.

The reveal is counted over the wrapped lines, not over the source string, because
a line break consumes the space it replaced; counting raw string indices would
run the reveal head one character per line ahead of the drawn text. One caret
follows the head, solid while characters land and blinking through the pauses,
and it is never nowhere: through a hold it sits at the end of the last finished
block.

### The right column arrives as a transition

`briefCard` scales each panel out from its own centre with a small overshoot
(`easeOutBack`, ~7%), lifted from below — the MC Olodo photograph first, then the
three written panels behind it in a 0.30 s cascade. That order is the reading
order the screen wants: see the face, then the file on it. The whole cascade is
done 1.4 s into the read.

The draw callback runs **even at `u=0`**, when the panel is invisible. That is
load-bearing, not waste: the written panels measure their wrapped copy as they
draw, into `briefY`, and `briefY` is what the harness reads to prove a column has
not silently overflowed when someone edits the writing. Skipping the draw would
leave those numbers stale for the length of the cascade and `undefined` on the
first frame the screen is ever shown.

### Light that never stops

`glimmer()` rakes light across the target card on a loop — the one panel on the
page that names the man the level is about, so the one that is never allowed to
go still. Two passes, not one: a wide soft body and a narrow bright specular
trailing it, at different widths and speeds, because a single bar on a fixed
period reads as a barber's pole. Each pass crosses in the first 42% of its period
and rests for the remainder, which is what keeps a permanent loop from becoming
wallpaper. Driven by `clock`, deliberately **not** `briefT` — the light has to
keep moving after the read has finished.

Also alive, all on separate periods so nothing falls into step: the skull
breathes, the top lit segment of the threat bar glows, the case photo has a 34 s
push with 2 px of drift under it (zoom floor 1.02, not 1.00 — cover-fit leaves no
slack at 1.00 and the drift would walk a hard edge into the panel), the DOSSIER
rule doubles as the read's progress with a travelling head, the sign-off stamp
ignites when the narrator lands the last line, and CONFIDENTIAL blinks on a long
period.

### `glass()` was exempt from every fade on every screen

Found while wiring the cascade's fade-up. `glass()` set `globalAlpha = 1` for its
blur pass and then back to `1` rather than to the caller's value — so the tint,
the top highlight and the grain all drew at full opacity for the rest of the
panel. Every glass panel in the front end therefore **snapped** in at full
opacity inside a fade that eased only the text on it, and `messagePlate` faded
its message over a plate that did not fade. Now multiplied in and restored. Fixed
for its own sake as much as for the cascade.

### `_chromakey/briefaliveverify.js`

40 checks, everything measured rather than eyeballed — these are the effects that
look finished in a screenshot and are wrong in motion. The clip rolls and `briefT`
follows it; the cascade is ordered non-increasing with the photograph strictly
ahead of the last panel; every block runs 0 to mid to 1 across its own window and
holds in the gaps; the copy column's ink grows monotonically through the read; and
every measured block ends at the same y at six different beats, which is the check
that would catch the typewriter re-wrapping.

The two motion checks pin `briefT` and let only `clock` advance — which is the
whole reason those are separate clocks. The background is stilled with
`playbackRate = 0` rather than `pause()`, because `keepBackgroundRolling()`
restarts a paused video every frame but leaves a rate-0 one alone. The target
card's brightness swings 10.8 with the read frozen against 0.12 for the stamp box
used as a control, so it is the *card* being lit and not the frame drifting.

`briefshot.js` updated: the screen animates now, so it pins `briefT` past the
cascade before measuring. Landing on it and shooting immediately photographs an
empty right column and reports it as a layout — the same mistake that file had
already made once about the handover card.

Measured cost: 6.7 ms/frame at 1280x720 with the read complete (2.1 ms for the
main menu through the same probe). It was already the heaviest screen in the
front end — eight glass panels each sampling the blur canvas — and there is
comfortable headroom at 60 fps.

One harness bug found on the way: the cascade-order check asserted a chain of
strict `>` and failed on a perfectly ordered cascade, because panels that have
not started yet are all legitimately 0 and `0 > 0` is false.

## 2026-08-23 — The network is visible before and after the fight

Installed the replacement 45.897-second `briefing1.mp3` and re-anchored the three dossier paragraphs, three gold calls to action, and two closing stamp lines to its measured speech pauses. The target threat bar now grows from empty to HIGH on the narration clock. The same briefing screen resumes BG2 beneath the voiceover.

Replaced the rectangular Olodo-to-Tulumbu hierarchy with a shared circular network component: MC Olodo's supplied portrait, two unnamed boss circles, dotted routes, an explicit ellipsis for further unknown links, and Tulumbu. No future boss names or portraits were invented.

Rebuilt the post-MC-Olodo result screen with the real front-end UI kit instead of the legacy `CASE CLOSED` plate. It now uses smoked glass, the shared palette and typography, live kill/health/difficulty/evidence data, the same animated network graph, and a clear `LEVEL 01 COMPLETE / MC OLODO DEFEATED` hierarchy. The BG1/BG2 gameplay playlist is not interrupted by the outro.

BG2 now attempts playback when the title screen appears, continues through the menus, and resumes under the mission briefing. If a host enforces autoplay blocking, the existing first title input unlocks and retries it—the earliest legal audible start in a browser build.

Verification: both production modules and the updated briefing harnesses parse cleanly; the installed narration hash matches the supplied replacement; source checks confirm title/briefing ambience, the low-to-high threat, circular dotted network, shared result UI, removal of the old card renderer, cache-version wiring, and uninterrupted outro playlist. No server was started.
## 2026-08-24 — The real logo, a darker title, feedback on every press, and enemies that see you

**The supplied mark replaces the drawn wordmark.** `ASSETS/RatelLogo.svg` now
draws on the title card, the menu brand and the credits — everywhere a logo
appears. Two things had to be fixed in the export first, and both are done by
`_chromakey/logo_build.js` rather than worked around at draw time: `Layer_2` is a
full-bleed **black rect** that would have covered the screen, and the mark
occupies only 28% of the artboard, so "300 px wide" would have meant a 300 px box
with an 84 px logo floating in it. The script strips the backdrop, retightens the
viewBox to the *measured* ink, and prints the aspect (4.4826) that `LOGO_ART`
carries. Height always follows width through that number, so no call site can
stretch the art. The ratel and the grass are **negative space punched out of the
letters** — that is the design, and it is why the backdrop had to go.

The mark is baked once into a 1024 px bitmap; the title's 664 px draw is a
downscale. If the fetch ever fails the old drawn wordmark stands in, and the
console says so — a silently substituted logo is indistinguishable from a wiring
bug that shipped. `__rorMenu.logo.source` reports which one is on screen.

It is fetched as **text and decoded from a data URL**, not pointed at with
`img.src`. An `<img>` only decodes an SVG the server labelled `image/svg+xml`,
and this project is served by WizardGenie plus a hand-rolled static server in
nearly every `_chromakey` harness — several of those MIME tables have no `.svg`
row. `regress.js` and `combatverify.js` both reported the fallback until this
changed.

**Menu background is `uibg2.mp4`.** The same shot as before — same camera, same
ground plane, the same pedestrians in the same places — regraded with a
depth-of-field pass. Because the geometry is identical, `GROUND` (the constants
that decide how tall a person is on the menu plate) needed no remeasuring.

**The title card is darker** — 0.44 to 0.66. The old value existed because thin
cream type needed the street's contrast behind it; 0.62 was tried once and read
as flat black. The supplied mark is a heavy display face with the ratel knocked
out of it, and knocked-out negative space only reads when the plate behind it is
dark and quiet. Measured mean luminance 19.6 against 29.1 at the old value, so
the sunset and the wet tarmac still survive as texture. The logo is now
**centred** on the key art's 0.48 line rather than hung off a type baseline: the
old wordmark was ~7:1 and this art is 4.48:1, so a shared baseline would have
pushed its optical centre 20 px high.

**Nothing commits on the frame the button was pressed.** Every confirm and every
cancel now holds for a 0.19 s beat while the control the player actually pressed
answers them — it compresses, a ring scales out of its edges and four ticks fire
off its sides — and only then does the screen change. The cue still plays on the
press; the ear must not wait. 0.19 s is chosen against two failure modes: under
~0.12 s the ring is gone before the eye finds it, past ~0.25 s the menu feels
like it is thinking, and it has to clear the button's own 0.115 s press decay so
the click is seen springing back before the cut.

Two presses stay instant and deliberately so: an options row (the value moving
under the thumb IS the feedback) and a refusal (which already has the shake and
the reason). Screens that confirm without drawing a button burst the ring from
the Cross glyph in the hint bar, which is the affordance there. The title's
`PRESS X` prompt and the studio card are now registered controls, so they answer
a press and are clickable — neither ever was.

**The case file's action row is reversed and driven left/right.** `GO BACK` sits
left, `START MISSION` right, and **the order of the list is the order on screen**
— index 0 has to be the left-hand button or pressing "forward" would walk the
cursor backwards. `START MISSION` keeps the default focus. Up/down still works.
The d-pad legend starts at x=540, clear of the buttons; at the bar's default 54
it printed straight through `GO BACK`.

**The unknown bosses are silhouettes.** The two `UNKNOWN BOSS` discs in the
Tulumbu network drew a `?`, which read as missing data rather than as a man and
put a punctuation mark in a row of faces. They now hold a filled grey bust,
clipped to the disc exactly as MC Olodo's photograph is.

### Enemies that do not notice you (gameplay)

Reported as "some enemies seem not to notice me when I approach them". There
were **three** separate causes, all in the walk-in added when entrances were made
to come from off-screen:

- The walk-in target was chosen from where Darki **stood when the wave was
  staged**, and he keeps walking. An Agbero would march to a spot that was by
  then behind the player — straight past him, without a glance, to stand facing
  the wrong way. The target now follows the player forward, clamped inside the
  arena.
- A staggered spawn was parked off the camera's right edge **once**, and the
  camera moves. Walking toward the gate caught up with a man stood still in plain
  view, arms up, reacting to nothing. The park is now re-applied every frame.
- `spawnEntry` is checked **before** the hit branch in the enemy loop, and the
  entrance rewrites `state = 'walk'` every frame — so a blow landed on an
  arriving Agbero was swallowed. He took the damage, made the noise and kept
  strolling in. Any disturbance now ends the entrance first.

And the behaviour the complaint was really about: **an entrance is staging, and
staging must never outrank the fight.** Once an arriving enemy is actually in
frame, a player who closes within `noticeX` (520 — a fighting distance, not
across the street) ends the scripted walk on the spot; he turns, squares up and
fights from where he is standing. `entryGrace` holds his first swing half a
second so being noticed reads as him clocking you rather than as an ambush.

Worth knowing for future tuning: `updateCamera` pins the view's right edge to the
gate while a wave is fighting, and section 0's gate is 1500 with the player
walled at 1440 — about 60 px of visible street ahead of him. A walk-in has very
little room to happen in there, whatever these numbers say. Sections 1 and 2 have
room.

### Verification

`_chromakey/uiverify.js` (new, 19 checks) drives the real front end through
`__rorMenu.step` with rAF stubbed and presses sent as real `KeyboardEvent`s: the
logo source, the darkening as a measured luminance against the old value
recomputed over the same plate, that the phase does **not** change on the press
frame and does once the beat ends, that one press makes exactly one cue, the row
order against the drawn hitboxes, and the silhouettes by mid-tone coverage inside
the discs.

`_chromakey/entranceverify.js` (new, 16 checks) drives the sim for all four
causes above — including that a struck arrival is actually launched rather than
walking it off. It runs in **section 1**, never 0, for the camera-pinning reason
above; measured in section 0, every distance is really measuring the wall.

`_chromakey/logo_build.js` (new) rebuilds the logo asset and asserts the result
is ink edge-to-edge. `_chromakey/bgframe.js` (new) pulls a frame out of a
background video — no ffmpeg in this environment, so headless Chromium decodes
it. `regress.js`, `combatverify.js` and `briefaliveverify.js` re-run clean.

## 2026-08-28 — Pickup, carry and throw: weaponising an Agbero (hold L2)

- **A second, separate grab**, on HOLD L2. The existing one-press grab
  (G / MMB / R2) is the pull-and-beat-up and is untouched by any of this:
  different button, different sheets, different state variable
  (`carriedEnemy`, never `grabbedEnemy`), different table entries. Press →
  `ATTACKS.pickup`; latch at step 7, the frame his hands close, decided ONCE
  per press; seated fully overhead by step 14; held → the CARRY stance;
  released → `ATTACKS.carryThrow`, which lets go at step 7, the frame his arms
  snap to full extension. No target at step 7 and the sheet simply plays out.
- **L2 was already the EXECUTION button, and that conflict is resolvable
  rather than a clash**: every entry in `EXECUTIONS` is gated
  `victim: (e) => e.boss` and `isGrabbable` refuses a boss, so there is no
  target both would accept. A press asks `execManualPick` first — the same
  resolver the on-screen prompt uses — and only becomes a pickup when it
  declines. Nothing about the execution changed. L2 also became a HELD input
  (`input.executeHeld`, recalculated from keyboard and pad every frame beside
  the guard) and the keyboard edge became edge-triggered, because auto-repeat
  would otherwise have fired a fresh grab attempt every ~30 ms.
- **The carry is a STANCE, not an attack.** `player.attack` is null, so he
  walks — at `CARRY.moveMul` 0.72 of his pace — while attack inputs, the jump
  and the guard are all refused. `canBlock` needed `!player.carrying`
  explicitly: the carry is not an attack, so `!player.attack` did not exclude
  it, and holding L1 mid-carry raised a guard nothing drew while `canMove`
  went false — Darki frozen in place with no visible reason why.
- **THE THROW'S DISTANCE IS NOT IN THE ANIMATION.** The flight is
  `launchEnemy` plus gravity in the ordinary `state === 'hit'` branch:
  direction from Darki's facing, distance and speed from `CARRY.throw.kb`,
  arc from the same physics every knockdown uses. `thrownAir` is eleven frames
  that hold on the last one for as long as the flight lasts, so a short throw
  and a long one play the SAME section and differ only in how far the sim
  carried him. Verified by throwing the same man at kb.x 160 and 700 — 98px
  against 405px travel, identical section both times.
- **A thrown body is a real collision object.** `updateThrownBody` scans for a
  body within `CARRY.impact.radius` sharing the lane, then routes it through
  `launchEnemy` with a payload shaped exactly like an ATTACKS window — no
  second damage system, so the man struck uses his own reaction, fall sheet,
  groan and knockdown timers. The boss is not excluded: he cannot be picked
  up, but he can certainly be hit by a man who was. The projectile takes
  `selfDamage` and then DROPS — rebound and gravity — because without that he
  sails on through the man he just flattened, which reads as passing through
  him rather than hitting him.
- **Four new sheets**, built by `_chromakey/carry_prep.js`, which measured
  every number in them. Two of the six supplied exports are not what their
  filenames say: `AgberoPickThrow.png` is a **byte-identical copy of
  `AgberoStruggling.png`** (md5 `f20986c14b13`, same mtime) whose manifest even
  reads `"sprite": "AgberoStruggling"` — that export wrote the struggle clip
  into both files and there is no throw art in it. The real enemy side is
  `ASSETS/AgberoPickFall2.png`, unreferenced and unmanifested, which is a
  SUPERSET: one continuous 114-frame take of grabbed → struggling overhead →
  thrown → crash, read at 11x11 off the pixels. Repacked to 86 frames as
  `enemy-carry` (pickedUp 1-12, struggle 13-44, thrownAir 45-55, thrownDown
  56-85), so those joins are seamless by construction rather than by tuning.
- **The art's baked travel was removed**, and it is the one judgement call
  here. Across source frames 63-103 the artist walks the body 1538px to the
  right inside the cell; shipped as-authored that translation would have run on
  top of the engine's knockback, so the throw would have covered a distance no
  config controls and a body that is not where the sim thinks it is cannot be
  tested against another enemy. Every enemy frame is cropped to its own box and
  re-placed centred / bottom-aligned — pure pose, placement from `CARRY.anchor`,
  motion from `launchEnemy`. It also took the sheet from 71 MB decoded to 14 MB.
- **Darki's three sheets are sized from ONE reference** or he changes height
  mid-carry: DarkiPickup is authored at 2048x996 and Carrywalk/DarkiThrow at
  exactly half, and the overhead pose measures 263 / 268 / 264 in shared units.
  The reference is DarkiThrow frame 17, his fists-up recovery stance and the
  same pose every other attack sheet anchors to — 198 source px standing 200 on
  screen — giving drawH 271 / 279 / 275. `bodyFrame` is unusable here:
  Carrywalk has no arms-down frame at all, every one of its 21 cells has him
  holding a man over his head.
- Section boundaries were read off the PACKED contact sheet rather than carried
  over from the other export: `AgberoPickedUp.png` goes horizontal at its frame
  20, this take not until 24, and trusting the other sheet's number opened the
  struggle loop on four frames of a man standing bolt upright while supposedly
  held overhead.
- Held-body parity with the existing grab everywhere it matters:
  `isEnemyHittable`, `isGrabbable`, `enemyEntranceHolds`, benching, the attack
  token, and the depth sort — where a CARRIED man sorts in FRONT of Darki
  (he is held out over the top of him) while a grabbed one stays behind.
  `advanceSection` drops the carry before `spawnWave`'s keepAlive pass can
  teleport a man out of Darki's hands and leave him `carried` with nobody
  holding him. `CARRY.maxHold` (6 s) stops a wave stalling on a man who can
  neither fight nor be counted.
- New `_chromakey/carryverify.js` — 36 checks, all passing, no console errors:
  the brief's six acceptance tests plus the distance-is-physics proof, the
  any-Agbero-any-health case, L2-pressed-mid-carry, and that the existing
  pull-and-beat-up still latches, still beats down, still runs its own state
  machine and never touches the carry state. `carryshots.js` captures the seven
  beats. Regression: grabverify, padbindverify, waveverify, combatverify,
  blockrepro.
- **Environmental objects are deliberately not wired.** There are none in the
  fight lane: `buildLevel` keeps the road clear on purpose and `props` is never
  even assigned, because Level 1 draws the mural instead. The extension point is
  marked in `updateThrownBody` — props collide there, against the same `e.x`/
  `e.y` and reusing the same `impact` payload and drop.

## 2026-08-28 — RUSH: the double-forward charge, and the window it opens

- **Forward, forward → Darki charges the man in front of him, STOPS, and waits.**
  Nothing fires on its own — reaching the enemy only opens a Rush Combat Window,
  and what comes out of it is whatever the player presses: **□** plays the
  existing grab combo, **R1** the existing 5-hit combo. Both go through the
  existing `startAttack` to the existing moves, so hit detection, damage, timing
  and recovery are untouched and there is no second copy of either.
- The tap detector reads **edges**, never held state, which is what makes
  "holding forward must not rush" true by construction rather than by a guard.
  `RUSH.tapWindow` is 0.26 s; a second tap outside it just re-arms the first.
- The window is a **windowed remap of exactly two buttons and nothing else**.
  Outside it □ is still the left jab, which the suite asserts directly. Anything
  the player presses that is not □ or R1 closes the window and falls through to
  the normal buffer — it is an offer, not a cage.
- A press made DURING the charge is remembered and spent on arrival: he
  committed early rather than not at all.
- **Two real bugs found by driving it, both of which would have shipped:**
  - **The arrival deadlocked against a retreating enemy.** Clamping the last
    step to `gap - stopAt` meant that as the gap closed the step shrank to
    match, and an Agbero in `menace` — which holds a standoff distance for a
    living — backed off at the same speed and pinned the gap two pixels above
    the threshold. Measured stalling at gap 120 with dP 1.7 for eighty frames
    until `maxTime` expired and the window never opened. From the player's seat:
    "I rushed him and nothing happened." Arrival now triggers when the mark is
    within one frame's travel, covering that last stretch in the same frame.
  - **The window ate the first press it was asking for.** The arrival flourish
    carried a 0.03 s hit-stop, and `update` returns early while `hitStopTimer`
    is running — it is the first thing it checks — so input was not read for two
    frames at exactly the moment the player is meant to choose. Shake only now.
  - Also: the charge moved him TWICE. `darkiFootfalls` gates on `player.vx`, so
    the charge set it — and `update` integrates `vx` into `x` a hundred lines
    earlier, giving a measured 1822 px/s against a configured 1000 and a 16px
    overshoot of the stop mark. It is set for the gate and put back.
- `RUSH.stopAt` (118) is deliberately inside `GRAB.reach` (132), so the grab the
  window exists to set up cannot whiff. The charge also converges his LANE, or
  that grab lands on a man standing in a different row for a reason the player
  cannot see.
- **The sheet.** `_chromakey/rush_prep.js` from `ASSETS/NEW SPRITES/rush.png`
  (7x6, 40 frames, cell 1024x768). Only 16 ship: it is one 20-frame stride
  played twice, and four of those twenty are pixel repeats of the frame before —
  a 24 fps source resampled up to 30. Dropping the repeats and returning the rate
  to 24 keeps the cadence exactly (20/30 and 16/24 are both 0.667 s) and removes
  only the stutter. One lap ships because the **loop closes**: last pose back
  round to first measures 1.01x a normal frame-to-frame step of this stride.
  (The prep originally gated on "is lap 2 the same as lap 1", which said no at
  1.18 steps — the two laps are the same stride at a different resample phase.
  The seam is the question that actually decides it, and it is what it gates on
  now. The threshold is a ratio against the stride's own step, because how far
  apart two poses of a running man are depends on how fast he is running.)
- **He runs on the spot** — the opaque box is at x 190..814 in all 40 frames, no
  travel baked in. That is what lets one loop cover any distance, so how far a
  rush carries him is `RUSH.speed` and where the enemy is, never the sheet. Same
  property the throw needed, and for the same reason.
- `RUSH_SHEET.drawH` is **197, measured** by the new `_chromakey/rushheight.js`
  rather than picked: this is a different shoot at a different cell aspect with
  no standing pose to hang a `bodyFrame` on. At 200 he ran 194px tall against
  the combat walk's median 191; at 197 the two agree exactly, so he is the same
  size charging as he is squared up.
- New `__ror.animBox(anim, i)` returns the drawn opaque box of a prepared frame,
  which is what made that measurement possible — and it reports empty grid cells
  as `empty` rather than doing arithmetic on the sentinels, since several sheets
  have fewer frames than cells (combat-walk 22 in 25, idle 26 in 30) and
  `y1 - y0 + 1` on an untouched box is -1e9, which silently poisons any median.
- New `__ror.resetFighter()` puts the player back to a cold neutral (rage,
  hit-stop, attack ledger, holds, tap history). Suites running several scenarios
  in one page were inheriting all of it, which is why the mid-charge test failed
  eighth in the file and passed on its own.
- New `_chromakey/rushverify.js` — 27 checks, all passing, no console errors —
  and `rushshots.js` for the charge, the window and the follow-up.

## 2026-08-29 — The carry pair, rebuilt from the high-resolution art

- **The report was "the sprite is low res and pixelated", and it was true for a
  reason no amount of filtering could have fixed: there was never enough
  information in the source.** The old pickup/carry/throw set was cut from
  1024x498 cells with the figure only ~276 px tall, then packed down again, and
  then drawn at ~280 px on screen. Every edge was working past its limit. The
  replacement pair (`DarkiThrowEnemy` / `AgberoThrowEnemy`) is authored at
  1024x1024 with the figure 456-670 px tall — **2.4x the real detail** — and the
  packed cells are now sized to land at roughly 1:1 with what actually gets
  drawn. The extra downscale that made Agbero soft is gone.
- **Four sheets became two, and the consolidation is the point.**
  `darki-carry` is ONE take of 107 frames — pickup 0-18, the carry walk 19-79,
  the throw 80-106 — replacing `darki-pickup` + `darki-carrywalk` +
  `darki-throw`. The joins are seamless *by construction* because they were
  never separate clips, and it opens on a standing guard (frames 0-2) so it
  carries `bodyFrame: 0` like every other Darki sheet and the cross-sheet
  arithmetic the old set needed simply disappears.
- **`AgberoThrowEnemy.png` is a COMBINED sheet.** Source frames 0-106 are Darki
  again — the same take — and only 107-197 are the Agbero. Taking 0-106 would
  have animated a second Darki over the first. `carry_prep.js` strips the first
  actor, so packed frame N is Agbero's partner for Darki frame N through pickup
  and release. It ships no manifest, so its grid was measured off the pixels: at
  cell 1024 every seam row and column is fully transparent, while 512/640/768/
  1280/1536/1920 all put 600-1200 opaque samples straight through their seams.
- **Neither loop is the full authored range, and both were chosen by measurement
  rather than by eye.** Darki's carry walk is 41-62, not 19-79: the full range
  is not a whole number of strides and its wrap measured **3.11x** an ordinary
  frame-to-frame step — a visible hitch once per lap, forever. The stride period
  is 22, the window that closes tightest is 41-62 at **1.50x**, and 19-40 is
  exactly the 22 frames in front of it, so the entry runs straight into the loop
  with no join to measure at all. Agbero's struggle is 15-51 (**1.28x**) and
  begins on the frame the lift ends, so there is no jump between the two
  sections either — 35-70 closes tighter still at 0.68x, but it would have to be
  jumped into from frame 14, a 1.79x join, and trading a seam you see once per
  lap for a jump you see on **every single pickup** is the wrong way round.
- **Release now hands straight to the canonical `AgbeoFall` sheet**, as asked.
  The retired `enemy-thrown` recipe stays in `carry_prep.js` as a disabled
  forensic note. A thrown body therefore flies on the same airborne frames every
  other knockdown uses, which is what keeps the swap invisible when he lands.
- **A charged throw was silently landing at zero power.** `dropCarry` cleared
  `player.carryHoldT` before the launch read it, so every wind-up — the damage,
  the distance, the lift, the freeze, the shake, the sparks and the impact the
  flying body carried into the next man, all of which scale off that one number
  — resolved as if the player had snap-released. `startCarryThrow` now snapshots
  `carryThrowPower` before the wind-up begins, and the launch reads the
  snapshot.
- `carryverify.js` **36/36, no console errors.** One assertion was stale rather
  than broken: it named the retired sheet's `thrownAir` section where the
  release now yields `fallAir`. The property under test — one airborne section
  whatever the distance, so the sheet cannot be encoding the throw — still holds
  and still passes (short 192px vs long 866px travel, identical section).
- Regression: `rushverify` 27/27, `waveverify` 14/14, `padbindverify` clean.
- Left alone and flagged: `sprites/darki-pickup`, `darki-carrywalk`,
  `darki-throw` and `enemy-thrown` (.png + .json) are now unreferenced by
  `game.js` and are dead weight in the build, and `ASSETS/AgberoPickThrow.png`
  is still byte-identical to `AgberoStruggling.png`. Both are cleanup, not bugs.

## 2026-08-29 — The free sprint, its gauge, and the dash attack (verification)

The mechanic itself landed in the previous session; this entry closes it out —
the harness was written but never run, and running it found one real bug.

- **`sprintverify.js` — 44/44, no console errors.** Forward-forward into open
  street now RUNS instead of being refused: 1450px on a full bar in 1.47s at
  1000px/s, on the rush sheet, 16 distinct frames. The gauge is the only thing
  that stops him — the 0.12 ignition charge is taken on the press before he has
  moved, the bar falls monotonically while running and never otherwise, empties
  to exactly 0, and refills in 3.98s. Stutter-dashing is not free: six quick
  stabs, two refused, because each stab costs its ignition charge before it
  moves him an inch. A refused dash is signalled (`deniedT` 0.45s) rather than
  silently ignored. `winded` is earned only by redlining (1.2s penalty) and
  never by stopping on purpose (0.033s), which is what keeps the two delays
  meaningfully different. Tap-tap released is a 183px dodge-dash; the same
  command held is the 1450px sprint.
- **A sprint SURVIVED being hit.** The three rush updaters each open with
  `if (player.react) endRush()` — and not one of those guards could ever fire.
  The animation branch in `update` tests `player.react` first and returns, so
  from the frame a reaction starts the rush updater is not called at all.
  `rushState` therefore sat at FREE (or CHARGE) through the whole flinch and
  the run RESUMED the moment the reaction cleared, with `canMove` pinned false
  underneath it the entire time because `rushing` was still true. Fixed at the
  one place every reaction goes through — `startReaction` now calls `endRush()`
  alongside `endBlock()`, which is the same statement the function already makes
  about the guard: a reaction owns the body, and a run is part of the body.
  Note this also pays the correct regen delay, since `endRush` is what sets it.
- Two harness faults found and fixed before they could be reported as game
  faults. §10 assigned the STRING `'flinch'` to `player.react`, which is an
  object (`{ name, table, t, step, dir }`) — `advanceReaction` threw on the next
  step, so the scenario never reached the question it was asking; it goes
  through `flinchPlayer` and the real damage path now. §9 tested the running
  grab on an EMPTY street, where `startAttack('grab')` correctly degrades to the
  `grabFail` whiff — it now stages a body past `RUSH.maxRange` (so the command is
  still the free sprint, asserted), runs him down to a measured 98px gap inside
  `GRAB.reach` 132, and gets `grab`.
- **A check that was passing for the wrong reason.** §8's standing-kick control
  placed Darki at a hard-coded `300 - 90` while `__stage([300])` puts the foe at
  700 — so the control kick was thrown from 490px away, whiffed, and dealt 0.
  "The dash hurts more" was passing on 24 > 0 without ever comparing two landed
  kicks. The control is now positioned off the foe and both land: **24 vs 15**,
  matching `ATTACKS.rushKick` / `ATTACKS.highKick` exactly. Added an explicit
  check that the control connects at all, so it cannot silently whiff again.
- Harness boot corrected to the house pattern: it waited on `networkidle0`,
  which never fires here because the front end streams a looping menu video, so
  it died on a 30s navigation timeout before running a single check. Now
  `domcontentloaded` + `worldReady` + `#loading` hidden, with the rAF stub
  installed before boot so the sim only advances through `step()`. It also opens
  the street with `freeRoam()` first: a full bar is ~1470px and section 0's gate
  pins him 60px short of 1500, so a sprint measured in the starting arena stops
  against a wall at ~1040px and the travel check would fail for a reason that
  has nothing to do with the gauge.
- New test hooks: `__ror.holdDir(side, on)` — keeps a direction down the way a
  thumb does, seeding `rushTapPrev` so re-raising the flag is not read as a third
  tap — and `__ror.attackTable`, so a damage assertion can name the number it
  expects instead of hard-coding today's value. `resetFighter` already cleared
  the gauge, the winded flag and the tap history.
- Regression: `rushverify` 28/28, `carryverify` 39/39, `waveverify` 14/14,
  `combatverify`, `blockrepro` and `padbindverify` all clean. `hurtverify`'s
  three `REQFAIL` lines on front-end `.mp3` files are aborted media streams, not
  missing assets (the files exist and its server logs no 404) — reproduced with
  the fix reverted, so they are pre-existing and load-dependent.

## 2026-08-29 — Hit while carrying: the man froze in mid-air

Reported: carrying an Agbero, a second one lands a blow, and the carried man
stops following — he hangs frozen in the air. Not every time, and walking back
toward him makes him fall.

- **The third instance of the same dead-guard bug, found the same day as the
  first two.** `updateCarryHold` opens with `if (e.benched || e.hp <= 0 ||
  player.react || player.state !== 'normal') dropCarry({ drop: true })` — and it
  is called from `else if (player.carrying)` in the animation branch, BELOW the
  `if (player.react)` that returns. A reaction therefore never reached it. Being
  hit did nothing whatever to the hold: `seatCarried` simply stopped being
  called each frame, and the carried body stayed at the anchor it last held
  while Darki was knocked out from under it. The comment on that branch claimed
  a reaction "drops the man — see updateCarryHold", which is exactly what it did
  not do.
- **Measured before the fix, heavy blow:** Darki travelled 131px over 70 frames
  of `launch`; the victim moved **0**, still flagged `carried`, still 140px off
  the ground, `carryState` still `Carrying`. When the reaction ended he crossed
  the whole 131px gap **in one frame** — or, if the player had released L2 while
  staggering, the released-button branch threw him from wherever he was hanging.
  That is the "he falls when I come close" half of the report.
- **Why it is intermittent:** a `flinch` is 0.217s and moves Darki ~5px, so the
  desync is invisible; a `launch` is 1.189s plus downtime and moves him 131px.
  Only heavy blows produce the hang the player actually sees.
- **Fixed at the one place every reaction goes through** — `startReaction` now
  calls `dropCarry({ drop: true })` beside `endBlock()` and `endRush()`.
  `damagePlayer` already broke the GRAB this way (`releaseGrab({ drop: true })`);
  the carry had simply never been given the same net. He is dropped, not thrown:
  no damage, feet on the ground, `mode` back to menace with the usual 0.4s beat
  before he re-engages.
- **New `_chromakey/carryhitverify.js` — 20/20, no console errors**, both blow
  weights. The load-bearing assertion is not "was the flag cleared" but **the
  victim never moves more than 40px in a single frame**, sampled every frame
  rather than every tenth, because a snap-back is one frame wide. After the fix
  the worst frame-to-frame move is 3px while Darki travels 131px.
- **Proved non-vacuous:** with the one line reverted the suite fails 11 of 20,
  and the snap-back check reports exactly the reported symptom — 131px crossed
  at frame 77. The LIGHT scenario does NOT trip that check even when broken,
  which is the measurement that explains "this doesn't happen all the time".
- Regression: `carryverify` 39/39, `sprintverify` 44/44, `rushverify` 28/28,
  `waveverify` 14/14, `grabverify` / `combatverify` / `blockrepro` clean.

## 2026-08-29 — Case photographs on the SELECT OPERATION cards

- `src/aftermath.js`: the level-select cards now carry a `168x226` dossier
  photograph frame on their right. Card 01 draws MC Olodo from
  `frontend/olodo-dossier.jpg` through the SAME `portrait()` loader the
  evidence board already uses, so there is one dossier image per character
  and new art is a line in `PORTRAITS`, not a second pipeline.
- The frame CROPS rather than cover-fits: `CARD_ART` gives a focus point and
  a `zoom`, and the focus lands at (0.5, 0.32) of the frame. `zoom: 1.62`
  keeps 407 of the art's 660 rows, which is what the crop is bounded by at
  both ends — tighter clips the crown of his beret, looser reaches the
  painted nameplate at row ~493 (which reads as a filename on a card that
  already sets his name in type).
- Card 02 resolves to no image and gets the same faceless figure the board
  and the Cabal page use, captioned `NO PHOTO ON FILE`. Both cards run one
  code path; the difference between them is the story's, not the layout's.
- The card copy is now a column (`box.w - THUMB.right - THUMB.w - 16 - 34`,
  derived from the frame) and the role line WRAPS — Level 02's "Senior
  police official · position in the network unconfirmed" ran the old full
  width and would have driven straight through the photograph.
- Grade levels are measured, not chosen: at the first pass's `0.84`/`0.30`
  the unselected frame came back only 12% darker than the selected one, so
  the selection read was invisible and the resting state sat at a mean luma
  of 43. Now `0.88`/`0.24` unselected against `1.0`/`0.10` selected.
- `src/frontend.js`: `wrapLines` exposed on the shared `ui` object rather
  than re-written in `aftermath.js` — same canvas, same fonts, and two wrap
  routines drift.
- `_chromakey/aftermathverify.js`: new section 7b, five pixel checks over
  both card frames in both selection states, sampled inset so the cards'
  status-coloured corner ticks are not counted as photographic content.
  Control run with `PORTRAITS.olodo` pointed at a missing file fails four of
  the five and card 01's numbers collapse to card 02's exactly, which also
  proves the no-photo fallback. 42/42 with the file in place.

## 2026-08-29 — The supplied audio set, the RatelLogo title, and the cinematic entry

### Audio — twelve clips, measured before they were wired
- Imported into `sounds/` (and `frontend/audio/` for the title sting) under the
  existing kebab-case names. Note the delivered filenames differ from the
  brief's: `grab_sucess_sfx.mp3` (one "c"), lowercase `jump attack sfx.mp3`.
- **ONSETS AND GAINS ARE MEASURED, NOT CHOSEN.** `_chromakey/onsets.js` says
  every one of these arrived untrimmed — the three Darki groans do not speak
  until 0.192 / 0.252 / 0.278 s in, so fired from 0 they would have landed at
  three different times off one punch and read as a limp. Each `CUES` entry
  starts at its own transient minus 15 ms, the rule the footsteps already use.
  The gains are set the same way: these files peak 0.082-0.115 against the
  existing `agbero-groan.mp3` at 0.985, so at gain 1 they were inaudible under
  a fight.
- `jumpAttack` and `titleEntrance` carry a `dur`/`len` because both files are
  2 s of which the last ~1.6 s is digital silence. It cuts dead tail, not
  performance.

### The trigger table
- **Grab** — `grabSuccess` on EVERY successful grab, routed through one
  `playGrabSuccess()` called from both latches. This also fixes a live bug:
  `latchCarry` read `playCue(CUES.grab ?? null, e.x)`, passing a table ENTRY
  where a cue NAME goes, and there has never been a `grab` key in `CUES` — so
  the pickup has been calling `playCue(null)` and making no sound at all.
- **Air attack** — `jumpAttack`, once per airborne action (`airAttackDone`,
  cleared on touchdown). There is still no airborne MOVE — the brief says the
  animation is not ready — so this adds the EVENT the sound and the future
  animation both hang on, and gameplay is unchanged: an attack pressed in the
  air still buffers and lands on touchdown.
- **Agbero hit** — the supplied three, dealt from a `makeBag` so the same one
  cannot land twice running. Retires the single repeated `agbero-groan.mp3` at
  both of its call sites. The existing gate is kept: a launch or a killing blow
  already has its own vocal and stacking a hit groan on it is two voices out of
  one man.
- **Darki hit** — the supplied three, same bag, fired from `damagePlayer` only,
  on a blow that got through the guard and took HP. Suppressed on the killing
  blow so the death cry is not talked over.
- **Rush** — `darkiRush` on the commitment inside `tryStartRush`, which is the
  only function that starts a rush, so "not every frame" is a property of where
  the call is rather than of a cooldown. It sits after the early returns: a dash
  refused for an empty gauge plays the denial tell, not a grunt of effort.
- **Rush footsteps** — `DARKI_FOOTFALLS.rush = [1, 9]`, measured by the new
  `_chromakey/rushplants.js` off `darki-rush.png` the same way every other row
  was. It needed two filters to be believable: the bare local-maximum test
  returned five candidates, three of which were 1-4px wobbles in the
  feet-together part of the cycle (94 and 90 against a stride maximum of 317),
  and of the survivors frames 7 and 9 turned out to be ONE leg extension split
  by a 10px dip at frame 8. Two plants in a 16-frame loop at 24 fps is a step
  every 0.333 s — 180/min, a sprint cadence. Five would have been 450.
- **Struggle** — `Struggle_sfx` as a looping BED, gated on the same predicate
  the animation router uses to pick the struggle loop, so if he is drawn
  struggling he is heard struggling. Reconciled once per frame rather than
  start/stop-called from the carry state machine: a bed that survives any one
  of that machine's exits (throw, drop, death, hit out of the hold, reset)
  plays forever.
- **Death** — `darkiDeath` once per death, guarded on leaving not-`ko`.

### DarkiDeath.mp3 and "DarkiRush Groan.mp3" are the SAME FILE
Byte-identical, MD5 `3659C48D...`, 16704 bytes each. The death cry and the rush
grunt currently voice one take. Both are wired as separate cues pointing at
separate paths, so dropping a real death recording over
`sounds/darki-death.mp3` needs no code change; until then the death cue is
pitched down 12% and played heavier so a death does not sound like a dash.

### Title screen — the supplied RatelLogo, and the reference frame
- `_chromakey/titlelogo_prep.js` bakes `ASSETS/RatelLogo.png` into
  `frontend/ui/ratel-logo-title.png`. The delivered file is fully opaque with
  the mark on a black card. Keying that card out was tried FIRST and is wrong:
  the ratel's body is black too and connected to the card through the gaps in
  its fur, so a border flood fill reaches inside the animal and deletes its
  torso — 8457 pixels survived and the render was a white outline of a ratel
  with the street showing through it. That is a redesign of the mark.
  The card is kept and FEATHERED instead, by distance from the actual ink
  rather than from its bounding box — the bounding box is mostly card (the
  mark's corners are empty), and holding those corners opaque drew a visible
  rectangle, which the first two attempts did.
- Placement measured off `RatelLogo SCREENSAMPLE.png` (1586x992): ink
  474x256 at centre y 345.5, bar 479x5 at y 541. Width is the anchor and
  everything else is derived from the MARK, not the frame, because the
  reference is 16:10 and the game is 16:9 — a gap measured in screen height
  drifts 16 px from the reference's own proportion. Renders at 0.2977 of screen
  width against 0.2989, bar 0.3023 against 0.3020.
- The bar shows `worldProgress()` — the real level load — and the PRESS X
  prompt is now held until it fills, which is what makes the brief's
  "logo -> loading -> press START" read as a sequence.
- The mark is TITLE-ONLY. The 4.48:1 wordmark stays on the menu header and the
  credits card: this lockup is 1.86:1, so at the menu's 292 px it would stand
  157 px tall in a strip built for 65.
- `STREETS OF JUSTICE` was not asked to go, so it stays — moved below the bar,
  which has taken the 40 px under the logo it used to sit in.

### The cinematic entry — START -> black -> half gate -> dialogue -> open -> fight
- The whole opening is ONE number animating: a bar height. Full black is that
  bar at `VIEW_H/2` where the halves meet; the half gate is the same bar at
  `gateBarH` (180, so exactly half the frame is picture); the street is 0.
- **The camera lifts, and it has to.** A symmetric 180 px gate leaves a window
  centred on y=360 while Darki stands with his feet on GROUND_Y (620) and his
  head at 420 — he would be entirely behind the bottom bar. (That is also why
  the ordinary cutscene bar is 92: `VIEW_H - GROUND_Y` is 100.) `lift: 160`
  puts his middle on the window's middle and is driven off the same amount as
  the bars, so at handback both are 0 and the camera is home without a cut.
- The captured UI frame now fades to BLACK over 0.40 s against a fully shut
  gate, replacing a 1.55 s cross-dissolve that revealed gameplay directly —
  the one thing the brief says must not happen.
- **The intro line is deferred.** It used to start on the Cross press, which now
  lands 1.45 s before there is anything to look at; the recording has only
  0.194 s of silence at its head so it cannot be started early and hidden. The
  front end hands `beginGameplayStartVoice` across and the entry fires it when
  the gate finishes opening. The lead is added ON TOP of the line, not carved
  out of it, or the bars would start opening while he was still talking.
- Entries under `minCinematic` (4 s) skip the prologue entirely — the test
  hooks start 0.4 s and 6 s scenes, and a 0.4 s scene spending 1.45 s black is
  a black screen with a fight behind it.

### Verification
- New `_chromakey/newaudioverify.js`: 47 checks. Every cue decodes; each event
  fires its sound exactly once and NOT per frame; both bags are dealt 60 deep
  and never repeat back to back; the rush's cadence is measured in steps/second;
  the struggle bed is checked for still-playing rather than for a count; the
  entry is walked through the brief's five steps; the title is measured against
  the reference fractions; the deferred dialogue is proven through the real
  handover door, silent at entry t=1.3 s and playing at 1.8 s.
- Control run with two call sites broken failed exactly those two and nothing
  else, including leaving the other grab site green.
- New `_chromakey/rushplants.js` and `_chromakey/titlelogo_prep.js`.
- `entrystepsverify.js` now derives the walk window from the entry config
  instead of hardcoding 0.42-3.27 s, which the prologue moved.
- Regression: `uiverify` 26/26, `aftermathverify` 42/42, `entryscene` all pass,
  `waveverify` 14/14, `sprintverify`, `rushverify`, `carryverify`,
  `tracesfxverify` all pass, `menuverify` 43/43.
- PRE-EXISTING, not from this work: `entrystepsverify`'s last two checks (the
  walk to the dropped ledger, `phase=null`) fail identically with the prologue
  disabled.

