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
