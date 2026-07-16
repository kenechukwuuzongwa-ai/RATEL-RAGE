# Rage of Ratel — Asset Pipeline

Sorceress is the source of truth for character art. WizardGenie consumes
exports; it never paints over or regenerates source art.

## Flow

1. **Model/animate in Sorceress** (3D characters, rigged).
2. **Export via Sprite Analyzer**: one PNG grid per animation + JSON manifest
   (+ optional `<sprite>.hits.json` for attacks).
3. **Drop files into the project** and reference them from a sheet config —
   the runtime slices, keys, crops, anchors and animates entirely from data.

## Sprite Analyzer export format

- PNG: uniform grid, frames left-to-right, top-to-bottom, 0-based indices.
- Manifest JSON: `frameWidth/frameHeight`, `sheet {cols, rows, frames}`,
  `defaultAnimation {start, end, fps, loop}`, optional `animation.sections`
  (each: `role` start|middle|end|custom, `frames`, own `fps`, `loop`,
  `pingPong`, `reverse`, custom `name` + `description` as gameplay tags).
- `combat` field → `<sprite>.hits.json`: per-frame hitboxes in exported-frame
  pixel space (`x,y,w,h`, `id` stable per swing, `type`, `damage`,
  `knockback {x,y}`, `active`). Damage happens ONLY on listed frames with
  `active: true`.
- Frame indices everywhere refer to the exported sheet, never `sourceFrame`.

## Runtime loading pipeline (already implemented)

For character sheets (`loadSpriteFrames`):

1. Slice by cols/rows (frame size derived from the actual image, manifests
   with stale sizes tolerated).
2. Key out uniform backgrounds by border flood fill.
3. Crop all frames to the union opaque box (no jitter), scale so the
   character — not the padding — hits the target height. `bodyFrame` config
   pins a stance frame's height when a raised fist inflates the union box.
4. Foot-anchor: canvas bottom = lowest opaque pixel; per-frame horizontal
   anchor from the foot region.
5. Animations resolved from sections (name/role match) or `defaultAnimation`.
6. `combat` pointer → hitboxes transformed through the same crop/scale into
   draw space.

For scenery (`buildings/buildings.json`): each painting defines its boundary
as a source-pixel crop rect + paper-key tolerance (uniform backgrounds) or a
cutout polygon (scene backgrounds, watermarks excluded). `keyOutPaper()`
removes paper without eating drawn wires or white walls (coarse 1/8-scale
flood mask + per-pixel colour test). Haze is baked at load for distant layers.

## Conventions

- One animation per sheet, named clearly: `<Character>-<Action>.png` +
  `<Character>-<Action>.json` (+ `.hits.json` for attacks).
- Hand-authored manifests/hits files (used when the analyzer didn't export
  data) must say so in a `note` field and follow the exact analyzer format so
  a real export can replace them without code changes.
- Never mix animations into one grid; never reuse frame indices across sheets.
- Sprite destinations: `sprites/` (characters), `assets/` (scenery, props, UI),
  `sounds/`, `music/`, `cutscenes/`, `levels/` (data files).

## Animation inventory (current)

| Sheet | Grid | Frames | Source |
| --- | --- | --- | --- |
| Newwalksprite.png | 5×4 | 0–19 walk loop @ 27 fps | analyzer manifest |
| IDLE.png | 6×5 | 30-frame idle loop | analyzer manifest |
| VDM-Uppercut.png | 6×5 | 0–26 one-shot @ 30 fps; hits on 9–14 | hand-authored manifest + hits |

Needed next (per `combat_design.md`): jab, straight, kick, grab/throw, hurt,
KO/get-up for Dark Ratel; walk, attack, hurt, KO for the first street enemy
set (male + female variants); brute and weapon-thrower sets; Sound Kleft boss
set (3 phases).
