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
