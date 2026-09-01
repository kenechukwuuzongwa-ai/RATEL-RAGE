You are integrating sprite-sheet animations exported from the Sorceress Sprite Analyzer. Read this carefully before writing any code — it describes the exact file format so you set every animation up correctly.

## What you received
- One PNG per sprite sheet (e.g. `punch.png`). It is a uniform grid of frames, left-to-right, top-to-bottom.
- `sprite_sheets.json` — the master manifest describing every sheet (grid layout + animation sections). This is the source of truth.
- Optional `<sprite>.hits.json` files (e.g. `punch.hits.json`) — combat hitboxes for sheets where the artist defined them. A sheet has combat data ONLY if its manifest entry contains a `combat` pointer.

## How to slice a sheet into frames
For each sprite in `sprite_sheets.json`:
- `image` is the PNG filename.
- `frameWidth` / `frameHeight` is the size of ONE frame in pixels.
- `sheet.cols` / `sheet.rows` is the grid; `sheet.frames` is the total cell count.
- Frame index N (0-based) lives at column `N % cols`, row `floor(N / cols)`. Its pixel rect is `x = col * frameWidth`, `y = row * frameHeight`, width `frameWidth`, height `frameHeight`.
- IMPORTANT: every frame index used anywhere in the JSON (sections AND hitboxes) refers to this exported sheet's 0-based index — NOT the original video/source frame. Don't use `sourceFrame`; it is informational only.

## How to play the animations (the `animation` object)
`animation.sections` is the authoritative, ordered list of animation segments. Each section has:
- `role`: one of `start`, `middle`, `end`, or `custom`.
- `frames`: the exact frame indices that section plays, in order.
- `fps`: how fast to play THAT section (frames per second). Use it per-section; don't assume a global fps.
- `loop` (bool): repeat the section forever.
- `pingPong` (bool): play forward then backward (dropping the shared end frames) for seamless back-and-forth.
- `reverse` (bool): play the frames in reverse order.
- `playback`: a plain-English restatement of the toggles above (for humans).
- `name` + `description` (custom sections only): treat these as gameplay tags. e.g. a custom section named "kick start" with description "the character winds up the kick" tells you to play those frames when the character starts a kick.

Canonical phased flow when start/middle/end exist: play `start` once → play `middle` honoring its loop/pingPong (this is the held/idle portion) → play `end` once when transitioning out. Sections MAY overlap; respect each one independently. `animation.phases` lists which phases exist, and `animation.start`/`middle`/`end` mirror the sections for older consumers — prefer `animation.sections`.

## Combat hitboxes (`<sprite>.hits.json`)
If a sprite's manifest entry has a `combat` field, load the referenced `.hits.json`. It marks where this character DEALS damage:
- `frames[]`: each entry has a `frame` (the exported sheet index — matches the sections above) and a `hitboxes[]` array.
- Each hitbox: `x`, `y`, `w`, `h` are in the EXPORTED frame's pixel space, origin top-left (so they line up with the frame rect you sliced). `id` is stable for one attack across frames (same id = same swing). `type` (e.g. "punch"), `damage`, `knockback {x,y}`, and `active` (if false, the box is defined but not live that frame — don't deal damage).
- Frames NOT listed have no active hitbox. Only enable damage on frames present in this file with `active: true`.

## Checklist before you finish
1. Slice every sheet using cols/rows + frameWidth/frameHeight.
2. Build each animation from `animation.sections`, using each section's own fps + loop/pingPong/reverse.
3. Wire custom sections to gameplay using their name/description.
4. For any sprite with a `combat` pointer, load the .hits.json and enable hitboxes only on the listed frames where `active` is true, using the per-frame x/y/w/h.
