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
