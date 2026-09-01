import { createFrontEnd, FONT, FONT_MONO, DISPLAY_FIT } from './frontend.js?v=ratelrage-montserrat-v1';
import { createAftermath } from './aftermath.js?v=ratelrage-montserrat-v1';
import { LEVELS, resolveIdentity, auditPlayerStrings, containsInternalReference } from './story.js?v=ratelrage-montserrat-v1';

/* The HUD sets ctx.font directly rather than going through the front end's
 * setFont — it draws inside the gameplay loop and has no `ui` in scope at most
 * of these call sites. These two build the same strings setFont/setDisplay
 * would, off the same shared family, so the game and the menus cannot drift
 * onto different typefaces.
 *
 * `display` takes the ORIGINAL Impact px and converts, exactly like setDisplay:
 * Montserrat is ~1.45x wider than Impact at the same size, so the old numbers
 * carried across verbatim would have burst every HUD plate. See the DISPLAY_FIT
 * comment in frontend.js for why the conversion is a compromise rather than a
 * match, and _chromakey/fontmetrics.js for the measurements behind it. */
const display = (weight, impactPx) => `${weight} ${+(impactPx * DISPLAY_FIT.size).toFixed(1)}px ${FONT}`;
const uiFont = (weight, px) => `${weight} ${px}px ${FONT}`;

/* Draw a line at `px`, or at whatever smaller size makes it FIT `maxW`.
 *
 * For strings that grow by editing rather than by design — the controls crib is
 * the case that forced this. At 13px system-ui it measured 1223px into 1232px
 * of room: it fit by NINE PIXELS, and nothing anywhere said so. Montserrat is
 * ~1.12x wider at body sizes, which put it 136px over the edge and clipped the
 * last binding clean off the screen.
 *
 * A hardcoded smaller size would fix today's string and quietly break on the
 * next control someone appends. Measuring is the only version that stays true,
 * and it costs one measureText on a line that is drawn once a frame.
 *
 * `min` stops a runaway string from shrinking to unreadable — past that the
 * honest answer is another line, not smaller type, so it clamps and lets the
 * overflow show rather than hiding a content problem behind 6px text. */
function fitText(text, x, y, maxW, weight = 400, px = 13, min = 10) {
  ctx.font = uiFont(weight, px);
  const w = ctx.measureText(text).width;
  if (w > maxW) ctx.font = uiFont(weight, Math.max(min, +(px * maxW / w).toFixed(2)));
  ctx.fillText(text, x, y);
}

// RATEL RAGE â€” Lagos street side-scroller slice.
// All character sprite sheets live in sprites/ (see sprites/darki-*.png and
// sprites/enemy-*.png). Darki walks with the casual "darki-walk" sheet out of
// range and squares up into "darki-combat-walk" when an enemy is close.

const VIEW_W = 1280;
const VIEW_H = 720;
// World length is locked to the painted street art (gameplay.png, 4066px) so the
// street layer spans the level exactly once at 1:1 parallax â€” no repeat, no gap.
const WORLD_W = 5600;
const WORLD_H = 720;           // single-screen-tall level (no vertical scroll room yet)
const GROUND_Y = 620;          // top of the road surface the player stands on
const LANE_TOP = 610;
const LANE_BOTTOM = 700;
const TILE = 64;

const SHEET = {                 // Darki's casual walk (out of fight range)
  src: 'sprites/darki-walk.png',
  metaSrc: 'sprites/darki-walk.json', // animation frames/fps come from here
  cols: 8,                     // fallbacks if the JSON is missing
  rows: 8,                     // 8x8 grid, 57 frames
  faces: 1,                    // art faces right; flip when moving left
  drawH: 200,                  // character height on screen (opaque pixels)
};

const COMBATWALK_SHEET = {      // Darki's fists-up combat stride (enemy in range)
  src: 'sprites/darki-combat-walk.png',
  metaSrc: 'sprites/darki-combat-walk.json',
  cols: 5,
  rows: 5,                     // 5x5 grid, 22 frames (cells 22-24 empty)
  faces: 1,
  drawH: SHEET.drawH,
};

const IDLE_SHEET = {
  src: 'sprites/darki-idle.png',
  metaSrc: 'sprites/darki-idle.json',
  cols: 6,
  rows: 5,
  faces: 1,
  // The idle art fills its frame taller than the walk art does, so at a shared
  // drawH Darki "pops" bigger when he stops. Trim to match the walk's typical
  // on-screen character height (walk median 187px vs idle 198px at drawH 200).
  drawH: Math.round(SHEET.drawH * 187 / 198),   // â‰ˆ 189
  manifest: true,
};

const UPPERCUT_SHEET = {
  src: 'sprites/darki-uppercut.png',
  metaSrc: 'sprites/darki-uppercut.json', // manifest + combat pointer to the hits file
  cols: 6,
  rows: 5,
  faces: 1,
  drawH: SHEET.drawH,
  bodyFrame: 0,                // scale this stance frame to drawH so his body
  manifest: true,              // matches the walk sheet (the raised fist would
};                             // otherwise shrink him via the union box)

/* THE JUMP KICK SHEET — very nearly the whole vertical game: the rise, the air
 * strike, the descent and the landing all come off this one take (see
 * darki-jumpkick.json, which cuts it into those four clips). The single clip
 * that does NOT is the descent that follows the strike, which stays on
 * darki-jumpstrike.json.
 *
 * It replaced sprites/darki-jump.png, which is still on disk and no longer
 * loaded. That sheet's 32 frames never got him off the ground — his lowest foot
 * travels 1643 -> 1291 of a 1676px frame, so the ART lifted him 21% of a frame
 * and `jumpY` did the rest, and what it drew was a man shuffling his weight.
 * This one is a real leap, and it lifts him by almost exactly the same fraction
 * (485 -> 365 of 530, 22.6%), which is why the arc did not have to be retuned
 * to take it.
 *
 * `bodyFrame` stays 0: it maps ONE frame's ink height to drawH, and both sheets'
 * frame 0 is his pre-jump crouch filling the same slice of its cell — 62.5% on
 * the old sheet, 63.0% on this one.
 *
 * `drawH` is NOT SHEET.drawH, and that is the correction — see AIR_SHEET_DRAW_H.
 */
const JUMP_SHEET = {
  src: 'sprites/darki-jumpkick.png',
  metaSrc: 'sprites/darki-jumpkick.json',
  cols: 6,
  rows: 6,
  faces: 1,
  drawH: 177,                  // measured against the fight stance, not inherited
  bodyFrame: 0,                // crouched launch frame â‰ˆ full body height
};

/* THE AIR STRIKE'S OWN SHEET — the jump attack, drawn as its own move.
 *
 * ONLY THE RECOVERY IS STILL PLAYED FROM HERE (2026-09-01). This sheet was
 * drawn for the strike and briefly supplied the whole of it, on the reasoning
 * that purpose-drawn art beats a cut of the jump sheet. The player preferred the
 * jump sheet's kick — a flat flying side kick against this one's raised diagonal
 * — so the KICK went back to darki-jumpkick.json and what remains in use here is
 * `airKickFall`, frames 34-37, the leg coming back under him. A preference about
 * how a move LOOKS is not a bug report and there was nothing to fix; the cut is
 * data in a manifest precisely so it can be moved when the answer is taste.
 * Everything below still stands, because the descent needs the same scale match
 * the kick did.
 *
 * SCALE IS MATCHED, NOT ASSUMED. `bodyFrame` maps one frame's ink height to
 * drawH, so two sheets only agree if their body frames are the same POSE.
 * jumpkick's frame 0 is a deep crouch 334px tall in its cell; the same crouch
 * here is frame 40 at 314px. Do NOT anchor on the kick poses — jumpkick's is a
 * flat side kick and this one is a raised diagonal, so their ink heights differ
 * by 14% for reasons that are art, not scale.
 *
 * `drawH` is NOT SHEET.drawH — see AIR_SHEET_DRAW_H below.
 */
const JUMPSTRIKE_SHEET = {
  src: 'sprites/darki-jumpstrike.png',
  metaSrc: 'sprites/darki-jumpstrike.json',
  cols: 7,
  rows: 7,
  /* FACES RIGHT, like every other sheet of his — checked against the art rather
   * than inferred. The vest reads "Darki" the right way round on this take and
   * mirrored on the jump sheet, which looks like a facing difference and is not
   * one: in both, his head sits left of centre and the kicking leg extends
   * right. `__ror.measureFrame` reports that as `lean`, and both sheets' kicks
   * come back positive. */
  faces: 1,
  drawH: 181,                  // measured against the fight stance, not inherited
  bodyFrame: 40,               // the landing crouch â€” scale twin of jumpkick's frame 0
};

/* -------------------------------------- WHY THE TWO AIR SHEETS ARE NOT 200 ---
 *
 * Both of them inherited `SHEET.drawH` and both came out roughly a tenth too
 * big beside the fight stance. Reported by eye on the strike and then measured,
 * because the obvious measurement is the wrong one: comparing INK HEIGHTS across
 * sheets compares poses, not sizes. The combat stance's standing guard is more
 * upright than either air sheet's, so it reads shorter for a reason that has
 * nothing to do with scale, and matching on it would have shrunk him further.
 *
 * MEASURED ON HIS CAP, which is the same object in every pose and barely
 * changes with how he is turned. On screen it came to 38.2 px on the fight
 * stance against 43.1 on the jump sheet (+12.9%) and 42.2 on the strike
 * (+10.4%). Solving each sheet's own `drawH * capH / bodyBoxH` back to the
 * stance's value gives 177 and 181 — the numbers above. `measureFrame` reports
 * `capH` so this stays checkable rather than becoming folklore.
 *
 * BOTH were corrected, though only the strike was reported. Fixing one alone
 * would have left a 12% step between the jump and the kick thrown out of it —
 * he would visibly shrink in mid-air at the moment of the press, which is a
 * worse artefact than being uniformly slightly large.
 *
 * Baked into `drawH` rather than dialled in with `dScaleJump*`, which is what
 * the note on `tune` asks for: the multipliers are a preview, the sheet is where
 * a settled value belongs. */
const AIR_SHEET_DRAW_H = { jump: JUMP_SHEET.drawH, strike: JUMPSTRIKE_SHEET.drawH };

const JAB_L_SHEET = {           // Left Jab (LMB) â€” 4x4, 13 frames
  src: 'sprites/darki-jab-left.png',
  metaSrc: 'sprites/darki-jab-left.json',
  cols: 4, rows: 4,
  faces: 1,
  drawH: SHEET.drawH,
  bodyFrame: 0,                // guard-stance frame keeps body height matched
};

const HIGHKICK_SHEET = {       // High Kick (RMB) â€” 4x4, 13 frames
  src: 'sprites/darki-highkick.png',
  metaSrc: 'sprites/darki-highkick.json',
  cols: 4, rows: 4,
  faces: 1,
  drawH: SHEET.drawH,
  bodyFrame: 0,                // standing frame â†’ body height; raised leg extends above
};

const BACKKICK_SHEET = {       // Back Kick (back+RMB) â€” 4x4, 15 frames; kicks behind
  src: 'sprites/darki-backkick.png',
  metaSrc: 'sprites/darki-backkick.json',
  cols: 4, rows: 4,
  faces: 1,
  drawH: SHEET.drawH,
  bodyFrame: 0,
};

const COMBO_SHEET = {          // 5-hit combo (triple-LMB) â€” 6x6, 35 frames
  src: 'sprites/darki-combo.png',
  metaSrc: 'sprites/darki-combo.json',
  cols: 6, rows: 6,
  faces: 1,
  drawH: SHEET.drawH,
  bodyFrame: 0,
};

const GRAB_SHEET = {           // Grab attack (G, target in reach) â€” 10x9, 84 frames
  src: 'sprites/darki-grab.png',
  metaSrc: 'sprites/darki-grab.json',
  cols: 10, rows: 9,
  faces: 1,
  drawH: SHEET.drawH,
  bodyFrame: 0,                // guard stance â†’ body height (the reach inflates the union box)
};

const CONTCOMBO_SHEET = {      // Player-driven alternating punches â€” 7x6, 38 frames
  src: 'sprites/darki-contcombo.png',
  metaSrc: 'sprites/darki-contcombo.json',
  cols: 7, rows: 6,
  faces: 1,
  drawH: SHEET.drawH,
  bodyFrame: 0,                // same guard stance as the grab sheet â†’ identical body height
};

const GRABFAIL_SHEET = {       // Whiffed grab (G, nobody in reach) â€” 5x4, 17 frames
  src: 'sprites/darki-grabfail.png',
  metaSrc: 'sprites/darki-grabfail.json',
  cols: 5, rows: 4,
  faces: 1,
  drawH: SHEET.drawH,
  bodyFrame: 0,
};

// Darki's RUSH â€” the double-forward charge. Built by _chromakey/rush_prep.js
// from ASSETS/NEW SPRITES/rush.png.
//
// The source is 40 frames and only 16 ship, for two reasons the prep script
// measures rather than assumes. It is one 20-frame stride played TWICE, and
// four of those twenty (1, 6, 12, 16) are pixel repeats of the frame before â€”
// the signature of a 24 fps source resampled up to 30. Dropping the repeats and
// bringing the rate back to 24 keeps the stride's exact cadence (20/30 and
// 16/24 are both 0.667 s) and only removes the stutter.
//
// One lap ships because the LOOP CLOSES: last pose back round to first measures
// 1.01x a normal frame-to-frame step of this stride, i.e. the seam is
// indistinguishable from any other frame. (Lap 2 sits 1.18 steps off lap 1 â€”
// same stride, different resample phase â€” which is why the prep gates on the
// seam and not on the two laps matching.)
//
// HE RUNS ON THE SPOT: the opaque box is at x 190..814 in all 40 frames, no
// travel baked in. That is what lets one loop cover any distance, so how far a
// rush carries him is RUSH.speed and where the enemy is, never the sheet.
const RUSH_SHEET = {
  src: 'sprites/darki-rush.png',
  metaSrc: 'sprites/darki-rush.json',
  cols: 4, rows: 4,            // 16 frames
  faces: 1,
  // MEASURED by _chromakey/rushheight.js, not picked. This sheet is a different
  // shoot at a different cell aspect (1024x768 against the walk's 1024x1024) and
  // has no standing pose to hang a `bodyFrame` on, so there is nothing to derive
  // it from analytically. At drawH 200 he ran 194px tall against the combat
  // walk's median 191; 197 is what makes the two agree, so he is the same size
  // charging as he is squared up.
  drawH: 197,
  workH: 345,
};

/* ------------------------------------------ pickup / carry / throw (L2) ---
 * Four sheets built by _chromakey/carry_prep.js, which is where the frame
 * numbers and every constant below were MEASURED rather than chosen.
 *
 * The three Darki sheets came from one shoot â€” DarkiPickup authored at
 * 2048x996 and Carrywalk/DarkiThrow at exactly half â€” so they must be sized
 * from ONE reference or he changes height mid-carry. That reference is
 * DarkiThrow frame 17, his fists-up recovery stance and the same pose every
 * other Darki attack sheet anchors to via `bodyFrame: 0`: it measures 198
 * source px and stands 200 on screen. Each drawH is then that sheet's own union
 * box against 198 â€” 268/276/272 source â†’ 271/279/275 â€” and the fact that those
 * three land within 3% of each other is what proves it is one performance.
 *
 * `bodyFrame` is deliberately absent from all three. It cannot be used here:
 * Carrywalk has no arms-down frame at all, every one of its 21 cells has him
 * holding a man over his head, so there is no stance on the sheet to anchor to.
 * That is exactly why the cross-sheet reference above had to be built instead.
 */
// ONE SHEET, ONE TAKE, for all three of Darki's phases â€” pickup 0-18, the carry
// walk 19-62, the throw 80-106. It replaces three separate exports, and the
// consolidation is worth more than the file count suggests:
//
//   * The joins are seamless BY CONSTRUCTION. Previously the pickup, the walk
//     and the throw were three clips that had to be cross-referenced to one
//     shared stance frame to stop him changing height halfway through his own
//     move; now they are consecutive frames of the same performance.
//   * It opens on a STANDING GUARD (frames 0-2), so it carries `bodyFrame: 0`
//     exactly like every other Darki sheet and the cross-sheet arithmetic that
//     the old set needed simply disappears. The old Carrywalk export had no
//     arms-down frame anywhere in it, which is what forced that arithmetic.
//   * It is authored at 1024x1024 with the figure 456-670 px tall, against the
//     old 1024x498 cells that held him at 276. That is 2.4x the real detail, and
//     it is the reason the previous set looked soft: there was never more
//     information in the source than the ~280 px it was being drawn at.
const DARKICARRY_SHEET = {
  src: 'sprites/darki-carry.png',
  metaSrc: 'sprites/darki-carry.json',
  cols: 11, rows: 10,          // 107 frames
  faces: 1,
  drawH: SHEET.drawH,          // his standing guard, same as every attack sheet
  bodyFrame: 0,
  workH: 335,                  // the packed cell height â€” nothing to gain upscaling
};

// Agbero's matching layer from AgberoThrowEnemy. The supplied file contains
// Darki in source frames 0-106 and Agbero in 107-197; carry_prep strips the first
// actor, so packed frame N is Agbero's partner for Darki frame N through release.
// Pickup and throw stay frame-locked. During a long hold Agbero uses his own
// measured seamless struggle loop, then snaps back to paired frame 80 for the
// throw. On release the canonical AgbeoFall/get-up sheet takes over.
//
// `bodyFrame`/`drawH` follow ENEMYFALL_SHEET exactly â€” anchoring his standing
// guard to what enemy-jab's frame 0 already draws at â€” because this body becomes
// that body the moment he lands, and the swap has to be invisible.
//
// `anchorFrame` is REQUIRED, not optional. carry_prep centres and bottom-aligns
// every frame, so the per-frame footAnchorX would re-introduce exactly the
// anchor hopping that alignment removed: on a body lying down the lowest band is
// whichever part happens to be down, and each hop translates the whole man
// sideways. See the comment on `anchors` in prepSpriteFrames.
const ENEMYCARRY_SHEET = {
  src: 'sprites/enemy-carry.png',
  metaSrc: 'sprites/enemy-carry.json',
  cols: 10, rows: 10,          // 91 live paired frames in a 10x10 grid
  faces: 1,
  drawH: 203,                  // == ENEMYKICK_SHEET.drawH, the shared Agbero neutral
  bodyFrame: 0,                // his standing guard
  anchorFrame: 0,
  // Keep the new packed cell at native working resolution. The old 177px pass
  // shrank it and enlarged it again, which was the visible softness.
  workH: 262,
};

// --- Darki's hurt reactions -------------------------------------------------
// Four sheets, but ONE performance: the artist shot the launch as a single take
// and split it across Hit_Lift â†’ Hit_One-air â†’ Darki_Fall, and the joins are
// exact (Lift's frame 4 and Air's frame 0 have the same opaque box to the
// pixel). So they must all draw at ONE scale, or Darki changes size halfway
// through his own fall.
//
// `bodyFrame: 0` maps each sheet's FIRST pose to its `drawH`, and those poses
// are different heights â€” so drawH cannot just be SHEET.drawH on all four the
// way it is for the attack sheets. `hurtDrawH` derives each one from the pose
// heights measured off the source art by `_chromakey/hurt_analyze.js`: the hit
// sheet's guard is 384 source px and stands 200 on screen, and every other
// sheet's frame 0 is scaled by that same 200/384. Re-measure before touching
// these; eyeballing them is what makes a fall pop.
//
// The flinch sheet was REDRAWN shorter on 2026-08-15 (11 frames â†’ 3) and its
// frame 0 came back measuring 384 source px again â€” so this reference, and with
// it every drawH below, survived the swap untouched. That is luck, not a rule:
// re-run _chromakey/newmoves_analyze.js after any redraw, and if frame 0 ever
// lands on a different number, give the launch chain its own frozen reference
// rather than letting a new flinch resize the fall.
const HURT_REF_H = 384;         // Darki_Hit_Reaction_1 frame 0 (source px)
const hurtDrawH = (f0SrcH) => Math.round(SHEET.drawH * f0SrcH / HURT_REF_H);
// Every hurt sheet is 512x265 per frame after the 2:1 prep, so key at the
// frames' own height instead of upscaling all of them to the default 480.
const HURT_WORK_H = 265;

const HIT_SHEET = {             // standing flinch â€” 2x2, 3 frames (cell 3 empty)
  src: 'sprites/darki-hit.png',
  metaSrc: 'sprites/darki-hit.json',
  cols: 2, rows: 2,
  faces: 1,
  drawH: SHEET.drawH,          // the reference pose: 384 src -> 200 on screen
  bodyFrame: 0,                // guard stance (the head-snap frame inflates the box)
  workH: HURT_WORK_H,
};

// Darki's guard â€” 2x2, 4 frames. Its own sheet rather than a section of another
// one, because it is a HELD state: raise, hold, drop (see the BLOCK table).
const BLOCK_SHEET = {
  src: 'sprites/darki-block.png',
  metaSrc: 'sprites/darki-block.json',
  cols: 2, rows: 2,
  faces: 1,
  drawH: SHEET.drawH,          // frame 0 is a neutral stance like every other
  bodyFrame: 0,                // Darki guard: 200 on screen, same as idle/jab
  workH: 344,                  // the frames' own height after the 2:1 prep
};

const HITLIFT_SHEET = {         // launch 1/3: feet leave the tarmac â€” 3x2, 5 frames
  src: 'sprites/darki-hitlift.png',
  metaSrc: 'sprites/darki-hitlift.json',
  cols: 3, rows: 2,
  faces: 1,
  drawH: hurtDrawH(424),       // frame 0 = struck-and-leaning, 424 src px
  bodyFrame: 0,
  workH: HURT_WORK_H,
};

const HITAIR_SHEET = {          // launch 2/3: the tumble â€” 3x3, 7 frames (7-8 empty)
  src: 'sprites/darki-hitair.png',
  metaSrc: 'sprites/darki-hitair.json',
  cols: 3, rows: 3,
  faces: 1,
  drawH: hurtDrawH(318),       // frame 0 = horizontal and curled, 318 src px
  bodyFrame: 0,
  workH: HURT_WORK_H,
};

const FALL_SHEET = {            // launch 3/3: crash + get-up â€” 4x3, 12 frames
  src: 'sprites/darki-fall.png',
  metaSrc: 'sprites/darki-fall.json',
  cols: 4, rows: 3,
  faces: 1,
  drawH: hurtDrawH(410),       // frame 0 = last airborne frame, 410 src px
  bodyFrame: 0,
  workH: HURT_WORK_H,
};

const GINGER_SHEET = {          // street enemy: idle + hit sections
  src: 'sprites/enemy-ginger.png',
  metaSrc: 'sprites/enemy-ginger.json',
  cols: 9,
  rows: 9,
  faces: 1,                    // art faces right
  drawH: 205,
};

const ENEMYWALK_SHEET = {       // street enemy: stride walk cycle
  src: 'sprites/enemy-walk.png',
  metaSrc: 'sprites/enemy-walk.json',
  cols: 6,
  rows: 6,
  faces: 1,
  drawH: GINGER_SHEET.drawH,
};

const ENEMYJAB_SHEET = {        // street enemy: punch attack (Agbero_Jab, 4x4/14f)
  src: 'sprites/enemy-jab.png',
  metaSrc: 'sprites/enemy-jab.json',
  cols: 4,
  rows: 4,
  faces: 1,                    // art faces right (same as the other Ginger sheets)
  drawH: GINGER_SHEET.drawH,
};

// Street enemy: the SIDE KICK (Agberosidekick, 4x3/10f) â€” his long-range
// attack. Unlike the jab sheet this one carries a `bodyFrame`, and the reason is
// arithmetic rather than taste. enemy-jab has no bodyFrame, so its UNION box
// (918 source px) is what maps to drawH 205 â€” which puts its frame-0 guard on
// screen at 908*205/918 â‰ˆ 203, not 205. This sheet's frame 0 is the SAME drawing
// (x 240-809, h 908 to the pixel), but its union is 932 because the kick throws
// the leg out further, so mapping unionâ†’205 here would draw the identical pose
// ~1.5% smaller and pop him on every swap. Anchoring frame 0 to 203 instead
// makes the shared neutral come out the same height on both sheets.
const ENEMYKICK_SHEET = {
  src: 'sprites/enemy-sidekick.png',
  metaSrc: 'sprites/enemy-sidekick.json',
  cols: 4,
  rows: 3,
  faces: 1,                    // art faces right (same as the other Ginger sheets)
  drawH: 203,                  // = what enemy-jab's frame 0 already draws at
  bodyFrame: 0,                // â€¦the guard both sheets share
};

// Street enemy: GOING DOWN, in two flavours that must never be confused â€”
// `enemy-getup` for a knockdown he SURVIVES (it ends with him pushing back onto
// an elbow) and `enemy-death` for the one he does not (it ends with him face
// down and still). Which of the two plays is decided by his HEALTH, not by the
// fact that he was floored: see `enemyAnim`.
//
// Both replaced the same stand-in â€” a floored Ginger used to be the hit-recoil
// frame rotated 90 degrees in the draw code, the way Darki's KO was before
// Darki_Fall â€” and the same rule applies: the pose is drawn now, so the rotation
// has to come OUT or he is laid flat twice. See `onFallSheet`.
//
// `bodyFrame` for the same reason ENEMYKICK_SHEET carries one. These cells are
// 1024x674 where the rest of the Ginger family is 1024x1024, and their union
// boxes span both a standing man and a lying one, so mapping that union to a
// height would draw him at a size no other sheet uses. Anchoring frame 0 â€” his
// standing guard â€” to what enemy-jab's frame 0 already draws at is what makes
// the swap into the fall invisible.
const ENEMYFALL_SHEET = {
  src: 'sprites/enemy-getup.png',
  metaSrc: 'sprites/enemy-getup.json',
  cols: 6, rows: 5,
  // CAREFUL: this sheet is mirrored against the rest of the Ginger family, the
  // same way MC_Olodo's emote and hook sheets are mirrored against his special
  // (see OLODO_STANCE_SHEET). Do NOT "fix" this to 1 for consistency.
  //
  // The ground truth is not the standing frames â€” it is where his HEAD ends up.
  // The sim already faces a falling body at its attacker (`enemy.facing =
  // -sign(vx)` in the hit state), and a man knocked off his feet lands with his
  // head AWAY from whoever hit him and his boots pointing back at them. Drawn
  // unmirrored, the art puts the head on the +x side, so it has to be drawn
  // as-is when he is travelling right â€” which is exactly when facing is -1.
  // Shipping this as 1 laid every body down head-first toward Darki, reaching
  // back at him, which is what a man falling TOWARDS you looks like.
  faces: -1,
  drawH: ENEMYKICK_SHEET.drawH,
  bodyFrame: 0,                // the standing guard he is knocked out of
  workH: 337,                  // the sheet's OWN frame height: keying 27 frames at
                               // the default 480 upscales every one of them
  // Anchor the WHOLE sheet on frame 4 â€” the frame the blow lands on and the one
  // he enters this sheet through. Per-frame foot anchoring is meaningless once a
  // man is horizontal (see loadSpriteFrames) and it was dragging him ~57 px back
  // toward Darki as he settled, which read as the knockdown pushing him the
  // wrong way. Frozen, the only horizontal motion left is the sim's knockback
  // plus the slide the artist actually drew.
  anchorFrame: 4,
};

// â€¦and the one he does not get up from. Same family, same traps, same answers â€”
// only the frame map and the length differ. Halved on disk (the source is
// 8192x5392): 58 frames at source resolution is 3.9 MB and a long key-out at
// boot, and every frame is normalised to `workH` regardless.
const ENEMYDEATH_SHEET = {
  src: 'sprites/enemy-death.png',
  metaSrc: 'sprites/enemy-death.json',
  cols: 8, rows: 8,
  faces: -1,                   // mirrored, exactly like the get-up sheet above
  drawH: ENEMYKICK_SHEET.drawH,
  bodyFrame: 0,                // the standing guard he is killed out of
  workH: 337,
  anchorFrame: 6,              // the frame the lethal blow lands on
};

// --- MC_Olodo, the Level 1 boss --------------------------------------------
// His EMOTE loop IS his combat stance: he never "walks", he swaggers on the
// spot and shuffles in and out of range still bobbing, the way a Capcom boss
// holds the screen. The SpecialMove sheet is the only thing that takes him out
// of it. Both are foot-anchored at the same body height (see the drawH note on
// the special sheet), so swapping between them never pops his size.
const OLODO_STANCE_SHEET = {    // boss idle/advance â€” the EMOTE bob, 9x9 / 81 frames
  src: 'sprites/boss-olodo-emote.png',
  metaSrc: 'sprites/boss-olodo-emote.json',
  cols: 9, rows: 9,
  // CAREFUL: MC_Olodo's two sheets ship facing OPPOSITE ways. The emote clip was
  // shot facing LEFT (cap peak, shades and beard all point left) while
  // SpecialMove faces right â€” ground truth there is frame 26, whose punch
  // extends right. Setting this to 1 to match the other sheet makes him turn his
  // back on Darki for the whole entrance.
  faces: -1,                    // art faces LEFT; flip when he faces right
  // HIS HEIGHT AGAINST DARKI'S, and the two are not comparable through these
  // config numbers alone: with `bodyFrame` set, prep rescales the sheet so that
  // ONE frame's body maps to this value, and the per-sheet dScale* multipliers
  // land on top at draw time. Measured on the drawn pixels instead
  // (_chromakey/heightcheck.js, opaque height of every prepared frame):
  //
  //   drawH   MC_Olodo median / bob floor   vs combat Darki (median 168, tallest 172)
  //    268          214  /  191                 1.27x â€” a head and a half over him
  //    225          180  /  160                 1.07x, but the bob DUCKS UNDER him
  //    235          188  /  168                 1.12x, floor level with his tallest
  //
  // Asked for: the boss still the taller man, but only just â€” near enough to
  // read as the same height. What sets the number is not the median but THE
  // FLOOR OF HIS BOB. His stance is a swagger on the spot that dips 11%, so a
  // scale picked on the median alone puts 7% of his loop under Darki, and one of
  // those cells is what the entrance cutscene happens to hold on â€” a boss who is
  // intermittently shorter than the hero is the same bug as one who is too
  // short, just harder to catch. 235 is where the bottom of the dip (168) meets
  // Darki's TALLEST combat frame (172), so he is never the shorter man in any
  // pairing, and typically stands about a cap's worth over him. Still the
  // biggest body on the street: a Ginger draws 155. Darki is measured in his
  // COMBAT stance throughout because that is the only stance he is ever in near
  // the boss â€” his idle draws 150 and would flatter the gap.
  drawH: 235,
  bodyFrame: 0,                 // guard stance â†’ body height (raised-fist frames
                                // would otherwise inflate the union box)
  workH: 380,                   // 81 frames: match the sheet's own frame height
};                              // rather than upscaling every one of them to 480

const OLODO_SPECIAL_SHEET = {   // the fist combo â€” 6x5 / 29 frames
  src: 'sprites/boss-olodo-special.png',
  metaSrc: 'sprites/boss-olodo-special.json',
  cols: 6, rows: 5,
  faces: 1,
  drawH: OLODO_STANCE_SHEET.drawH,
  bodyFrame: 18,                // squared-up guard frame; measured against the
};                              // stance sheet's frame 0 â†’ both land ~213px tall

const OLODO_HOOK_SHEET = {      // the spinning hook kick â€” 6x6 / 32 frames
  src: 'sprites/boss-olodo-hookkick.png',
  metaSrc: 'sprites/boss-olodo-hookkick.json',
  cols: 6, rows: 6,
  // This sheet faces LEFT like the stance, NOT right like SpecialMove â€” checked
  // on the cap peak, shades and beard in the guard frames (0, 12, 20, 31), all
  // of which point left, and confirmed by frame 6, whose kick extends left.
  // Same trap as the stance sheet: do not "fix" this to 1 for consistency.
  faces: -1,
  drawH: OLODO_STANCE_SHEET.drawH,
  bodyFrame: 12,                // standing guard, the frame he recovers into â€”
                                // the extension frame would inflate the box
  workH: 258,                   // the sheet's OWN frame height: keying 32 frames
};                              // at the default 480 upscales every one of them
                                // for nothing and pushed boot past its timeout

// â€¦and MC_Olodo GOING DOWN, which is the one thing his kit never had. Every
// other body in this game falls on drawn art; the boss was still being laid flat
// the way Darki's KO and the Agbero's knockdown both used to be â€” his STANCE
// sprite rotated 90 degrees with stars circling it. `onFallSheet` read
// `!enemy.boss` for exactly that reason and said so. This sheet is what retires
// that, and the rotation has to come OUT with it or he is laid down twice.
//
// THREE SECTIONS, read off the art (_chromakey/olodo_fall_contact.png and the
// per-frame bbox table beside it), not guessed from the frame count:
//   0-3    airborne, upside down â€” thrown clear, head leading
//   4-10   the crash and the settle; the bbox bottom hits its deepest point on 4
//          and stops moving, which is what "he is on the tarmac now" looks like
//   11-29  a dazed push back onto his feet, ending in his standing guard
// That is the same fallAir / fallDown / getUp split the Agbero sheet already
// has, so it drops into `enemyAnim` beside it rather than needing its own path.
const OLODO_FALL_SHEET = {      // boss knockdown + get-up â€” 6x5 / 30 frames
  src: 'sprites/boss-olodo-fall.png',
  metaSrc: 'sprites/boss-olodo-fall.json',
  cols: 6, rows: 5,
  // SAME TRAP, SAME ANSWER as ENEMYFALL_SHEET, and settled on the same test â€”
  // which is deliberately NOT the cap peak. On a knockdown the ground truth is
  // WHICH END HIS HEAD IS: the sim faces a falling body at its attacker
  // (`enemy.facing = -sign(vx)` in the hit state), and a man knocked off his feet
  // lands head AWAY from whoever hit him with his boots pointing back. This art
  // puts the head on the +x side (frames 0/4/8 measure x 596-919, 682-959,
  // 686-1007 with the head at the high end), exactly as the Agbero sheet does, so
  // it must be drawn as-is when he is travelling right â€” which is when facing is
  // -1. Shipping this as 1 lays the boss down head-first INTO Darki.
  faces: -1,
  drawH: OLODO_STANCE_SHEET.drawH,
  // The frame he LEAVES this sheet on, not the one he enters it through â€” and
  // that is the difference from ENEMYFALL_SHEET, whose frame 0 is a standing
  // guard. Frame 0 here is a man in mid-air, and a tumbling body is not a height.
  // Anchoring the last upright frame to the stance sheet's own drawH is what
  // makes the swap back out of the knockdown invisible; on a lethal one he never
  // reaches it and nothing downstream cares.
  bodyFrame: 29,
  workH: 218,                   // the sheet's OWN frame height (512x218 halved)
  // Freeze the horizontal anchor on the impact frame. Per-frame foot anchoring is
  // meaningless once a man is horizontal â€” the anchor hops from shoulder to back
  // to boots and TRANSLATES him sideways while his world position never moves â€”
  // and 4 is where he lands. Same fix, same frame index, as the Agbero sheet.
  anchorFrame: 4,
};

const PLAYER = {
  maxSpeed: 340,
  accel: 2600,
  friction: 2200,
  jumpVel: 780,
  gravity: 2000,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  hitW: 70,                    // collision box, narrower than the art
  depthSpeed: 190,
};

// Live-tunable render/placement values, driven by the on-screen dev panel.
// Scales here are draw-time multipliers (cosmetic preview) â€” once a value
// feels right, bake it into the sheet's drawH. Defaults reproduce the
// shipped look exactly.
const tune = {
  playerScale: 0.8,
  enemyScale: 0.8,
  bossScale: 0.8,              // MC_Olodo's draw scale (his drawH already makes
  bossOffY: 0,                 // him the biggest body on the street)
  // Per-Darki-sheet draw transform (debug): scale multiplier + Y nudge on top of
  // playerScale, so mismatched sheets can be sized/aligned live. Combat walk is
  // a crouched stance that reads small, so it defaults a touch larger.
  dScaleWalk: 1.08,  dOffYWalk: 0,
  dScaleCombat: 1.1, dOffYCombat: 0,
  dScaleIdle: 1,     dOffYIdle: 0,
  dScaleJump: 1,     dOffYJump: 0,
  dScaleJumpStrike: 1, dOffYJumpStrike: 0,
  dScaleJabL: 1,     dOffYJabL: 0,
  dScaleHighKick: 1, dOffYHighKick: 0,
  dScaleBackKick: 1, dOffYBackKick: 0,
  dScaleCombo: 1,    dOffYCombo: 0,
  dScaleGrab: 1,     dOffYGrab: 0,
  dScaleGrabFail: 1, dOffYGrabFail: 0,
  dScaleContCombo: 1, dOffYContCombo: 0,
  dScaleUppercut: 1, dOffYUppercut: 0,
  // The hurt kit shares one derived scale (see hurtDrawH), so these four stay
  // at 1 unless a fall needs nudging against the tarmac line.
  dScaleHitReact: 1, dOffYHitReact: 0,
  dScaleHitLift: 1,  dOffYHitLift: 0,
  dScaleHitAir: 1,   dOffYHitAir: 0,
  dScaleFall: 1,     dOffYFall: 0,
  dScaleBlock: 1,    dOffYBlock: 0,
  // Parallax layer placement transforms (LEVEL 1 MVP). Per layer: draw scale,
  // screen Y where the art's anchor row lands, scroll rate vs camera, and a
  // static X nudge (px). Driven live by the dev panel. streetScale is recomputed
  // at boot from the art width so the street spans the world exactly.
  // Depth ratios: distant layers scroll slowest (sky barely moves), gameplay 1:1.
  skyScale: 1.05,     skyY: 0,      skyParallax: 0.05,    skyX: 0,
  farScale: 0.46,     farY: 452,    farParallax: 0.12,    farX: 0,
  midScale: 0.74,     midY: 596,    midParallax: 0.25,    midX: 0,
  streetScale: 1.289, streetY: 620, streetParallax: 1.00, streetX: 0,  // mural (auto-set to WORLD_W/img.width at boot)
  // Aerial perspective: tint each distant layer's own silhouette toward the
  // harmattan haze â€” most on the far skyline, less on the mid row, none on the
  // street/fighters. Higher = hazier, reads as further away. `fogTop` is the
  // fraction of haze at the TOP of each layer vs. its base, so the fog ramps
  // vertically (clear roofs, hazy bases) â€” 1 = flat, 0 = fully clear tops.
  fogFar: 0.42,       fogMid: 0.20,       fogTop: 0.3,
  laneSep: true,               // push overlapping bodies apart
  laneGapX: 96,                // min horizontal spacing between two bodies
  laneGapY: 34,                // min depth (lane) spacing â€” kills z-sort flicker
  // ground shadow (transform + scale), applied to player and enemies
  shadowScaleX: 1.62,          // width multiplier
  shadowScaleY: 1,             // height multiplier
  shadowOffsetX: 4,            // px, + = right
  shadowOffsetY: -8,           // px, + = down
  shadowAlpha: 0.45,           // opacity
  hitStop: 0.09,               // freeze on contact (seconds â‰ˆ 5â€“6 frames)
  shakeMag: 8,                 // screen-shake amplitude (px) on heavy hits
  execDebug: false,            // the finisher's checkpoint readout (Â§33) â€” dev only
  // Follow-camera feel (SoR4/TMNT-style). Smoothing values are exponential
  // rates (higher = snappier); all motion is critically damped (no overshoot).
  camFollow: 7,                // horizontal follow smoothing (6â€“8)
  camLookSmooth: 5,            // look-ahead smoothing (4â€“6)
  camLookAhead: 200,           // max predictive look-ahead (px)
  camDeadX: 90,                // horizontal dead zone half-width (px)
  camDeadY: 50,                // vertical dead zone half-height (px)
  camFrame: 0.42,              // framing bias; with look-ahead nets ~37% from the leading edge
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const loadingEl = document.getElementById('loading');
let frontEnd = null;
/* The intro line, handed over by the front end at the START press but NOT
 * played there any more — `updateLevelEntry` fires it once the gate has opened.
 * Held as a bare function rather than reached through `frontEnd` so the entry
 * has no opinion about who owns the audio element. */
let startIntroVoice = null;

/* The world â€” 29 sprite sheets and the two background murals â€” no longer gates
 * the first frame. Boot brings the front end up on its own (one idle sheet) and
 * then loads the world BEHIND the studio card, the title, and the menu, so the
 * player is navigating while the art is still arriving. These three are the
 * handshake: the front end reads them to decide whether it may hand over. */
let worldReady = false;
let worldError = null;
let worldLoaded = 0;
/* EXACT awaited count in loadWorld's Promise.all — count the array, do not
 * estimate it. Too low and `worldProgress()` reaches 1 before the last sheets
 * are in, which is not just a bar that lies: the title's press gate opens on
 * that same number, so the screen invites a press while the world it is loading
 * is still arriving. (It went stale at 32 when the JumpStrike sheet was added.) */
const WORLD_STEPS = 33;

/* ---------------------------------------------------------------- utils */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    // resolve against this module so test pages in /tests load the same asset
    img.src = new URL('../' + encodeURI(src), import.meta.url);
  });
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/* ------------------------------------------------------- sprite loading */

/* Keeping the front end alive WHILE the level loads.
 *
 * Preparing a sheet is heavy synchronous canvas work â€” a scaled draw, a flood
 * key, two full pixel scans and a second draw, per frame, hundreds of frames
 * across the set. Fired all at once (30 sheets resolving together off a warm
 * cache) it holds the main thread for tens of seconds, and a menu that cannot
 * get a frame is no better than the old blocking boot: measured at 24 s to
 * first paint even with the load moved off the critical path.
 *
 * So the prep is (a) serialised â€” one sheet at a time, not 29 interleaved â€”
 * and (b) time-sliced: after PREP_SLICE_MS of work it hands the thread back for
 * a frame. Downloads still run in parallel; it is only the CPU pass that queues.
 */
const PREP_SLICE_MS = 12;         // ~3/4 of a 60 Hz frame: loads fast, still draws
let prepLane = Promise.resolve();
let sliceStart = 0;

/* Whether frames are actually being delivered. They are not in a hidden tab,
 * and not in the test harnesses, which replace requestAnimationFrame with a
 * no-op â€” and there is no point rationing the thread for a screen that nobody
 * is drawing. Every yield re-probes, so a tab coming back to the foreground
 * goes straight back to protecting its frames. */
let rafAlive = true;

function yieldThread() {
  if (rafAlive) {
    /* Hand back until the next real frame â€” or 32 ms, if that frame never
     * comes, which is also how a dead rAF is detected. */
    return new Promise((resolve) => {
      let fired = false, done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      try { requestAnimationFrame(() => { fired = true; rafAlive = true; fin(); }); } catch { /* stubbed away */ }
      setTimeout(() => { if (!fired) rafAlive = false; fin(); }, 32);
    });
  }
  /* Nothing is drawing: yield only enough to keep the event loop turning, and
   * leave a probe behind in case that changes. */
  try { requestAnimationFrame(() => { rafAlive = true; }); } catch { /* stubbed away */ }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/* Call inside a long loop: returns null while there is still budget in this
 * slice, or a promise to await when it is time to let the screen draw. */
function breathe() {
  const budget = rafAlive ? PREP_SLICE_MS : PREP_SLICE_MS * 6;
  const held = performance.now() - sliceStart;
  if (held > prepMaxSlice) prepMaxSlice = held;   // diagnostic: worst block we caused
  if (held < budget) return null;
  return yieldThread().then(() => { sliceStart = performance.now(); });
}
let prepMaxSlice = 0;

/* Run fn as the only prep on the thread, after whatever is queued ahead of it. */
function inPrepLane(fn) {
  const run = prepLane.then(() => { sliceStart = performance.now(); return fn(); });
  prepLane = run.then(() => {}, () => {});     // a failed sheet must not jam the lane
  return run;
}

// Remove an opaque uniform background (if any) by flood-filling inward from
// the frame border. Tight default tolerance so dark outlines survive; keyed
// JPEG paper backgrounds need a looser one.
function keyOutBackground(frame, tol = 25) {
  const { width: w, height: h } = frame;
  const fctx = frame.getContext('2d');
  const data = fctx.getImageData(0, 0, w, h);
  const px = data.data;

  const corner = [px[0], px[1], px[2], px[3]];
  if (corner[3] < 16) return; // already transparent

  const TOL2 = tol * tol;
  const isBg = (i) => {
    if (px[i + 3] === 0) return false;
    const dr = px[i] - corner[0], dg = px[i + 1] - corner[1], db = px[i + 2] - corner[2];
    return dr * dr + dg * dg + db * db < TOL2;
  };

  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, 0, x, h - 1); }
  for (let y = 0; y < h; y++) { stack.push(0, y, w - 1, y); }
  const seen = new Uint8Array(w * h);

  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const idx = y * w + x;
    if (seen[idx]) continue;
    seen[idx] = 1;
    const i = idx * 4;
    if (!isBg(i)) continue;
    px[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  fctx.putImageData(data, 0, 0);
}

function opaqueBBox(c) {
  const { width: w, height: h } = c;
  const px = c.getContext('2d').getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

function footAnchorX(frame) {
  const { width, height } = frame;
  const pixels = frame.getContext('2d').getImageData(0, 0, width, height).data;
  let lowestY = -1;
  for (let y = height - 1; y >= 0 && lowestY < 0; y--) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 16) {
        lowestY = y;
        break;
      }
    }
  }
  if (lowestY < 0) return width / 2;

  const footTop = Math.max(0, lowestY - Math.round(height * 0.12));
  let minX = width;
  let maxX = -1;
  for (let y = footTop; y <= lowestY; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 16) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
  }
  return maxX < 0 ? width / 2 : (minX + maxX) / 2;
}

// Animations come from the Sprite Analyzer JSON. Named/role sections win when
// present; otherwise the whole defaultAnimation range is the walk cycle.
function resolveAnims(meta, frameCount) {
  const def = meta?.defaultAnimation ?? { start: 0, end: frameCount - 1, fps: 30 };
  const range = (s, e) => Array.from({ length: e - s + 1 }, (_, i) => s + i);
  const toFrames = (f) => Array.isArray(f) ? f : range(f?.start ?? 0, f?.end ?? frameCount - 1);

  const anims = {
    walk: { frames: range(def.start, def.end), fps: def.fps ?? 30, loop: def.loop !== false },
  };

  const sections = meta?.animation?.sections;
  if (sections?.length) {
    const pick = (re, role) =>
      sections.find((s) => re.test(s.name ?? '')) ?? (role && sections.find((s) => s.role === role));
    const use = (s, fallbackFps) =>
      ({ frames: toFrames(s.frames), fps: s.fps ?? fallbackFps, loop: s.loop !== false });
    const w = pick(/walk|run|move|advance/i, 'middle');
    if (w) anims.walk = use(w, def.fps ?? 30);
    const i = pick(/idle|stand/i);
    if (i) anims.idle = use(i, 8);
    const j = pick(/jump|air|leap/i);
    if (j) anims.jump = use(j, 8);
    const h = pick(/hit|hurt|recoil|damage/i);
    if (h) anims.hit = use(h, 30);
    /* …AND EVERY OTHER NAMED SECTION, under its own camelCased name.
     *
     * The four `pick()` lines above are a fixed vocabulary — walk, idle, jump,
     * hit — and that was enough while every sheet held one clip. The jump-kick
     * sheet holds FOUR (rise, fall, air kick, landing) and only one of them has
     * a word the vocabulary knows, so three would have been invisible and the
     * frame lists would have had to be retyped into game.js, one sheet edit away
     * from disagreeing with the art.
     *
     * "Jump Rise" -> `jumpRise`. Written LAST and non-destructively (`??=`), so a
     * section the vocabulary already claimed keeps the meaning the rest of the
     * engine expects: a sheet with a "Jump" section still answers to `jump`, and
     * this only ever adds keys. */
    for (const s of sections) {
      const key = String(s.name ?? '').trim().toLowerCase()
        .replace(/[^a-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''));
      if (key) anims[key] ??= use(s, def.fps ?? 30);
    }
  }
  anims.idle ??= { frames: [anims.walk.frames[0]], fps: 1, loop: true };
  anims.jump ??= { frames: [anims.walk.frames[Math.floor(anims.walk.frames.length / 2)]], fps: 1, loop: true };
  return anims;
}

async function loadSpriteFrames(config, animationName = 'walk') {
  const [img, manifest] = await Promise.all([
    loadImage(config.src),
    fetch(new URL('../' + encodeURI(config.metaSrc), import.meta.url))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  /* Everything below is CPU, not network, so it runs in the prep lane: one
   * sheet at a time, breathing between slices, so the front end keeps drawing
   * and taking input while the level arrives behind it. */
  return inPrepLane(() => prepSpriteFrames(config, animationName, img, manifest));
}

async function prepSpriteFrames(config, animationName, img, manifest) {
  /* `onload` means the bytes arrived, NOT that the picture is decoded: the
   * decode is deferred to the first drawImage and lands on the main thread as
   * one unbreakable block â€” measured 855 ms gaps between frames while a level
   * loaded behind the menu. decode() does the same work off-thread. It is
   * awaited HERE, inside the lane, so exactly one sheet is being decoded at a
   * time; kicking all 29 off together was measurably worse (1.8 s gaps). */
  if (img.decode) await img.decode().catch(() => {});
  sliceStart = performance.now();
  /* The analyzer emits two shapes and BOTH are in `sprites/`: a document wrapping
   * a `sprites[]` array (darki-uppercut.json) and a flat one with `sheet` and
   * `defaultAnimation` at the top level (every other manifest). `config.manifest`
   * says which to expect â€” and when a sheet is re-exported the shape can change
   * under it without anything failing loudly: the nested lookup returns
   * undefined, every field falls back to the config, and `resolveAnims` quietly
   * substitutes range(0, cols*rows-1) for the manifest's real range. That is not
   * harmless on a sheet whose grid has more CELLS than frames â€” darki-idle is
   * 26 frames in 30 cells, so the invented range walked four empty ones and the
   * character blinked out once per loop. Take the nested entry when there is one
   * and the document itself otherwise, so the shape stops being load-bearing. */
  const meta = config.manifest ? (manifest?.sprites?.[0] ?? manifest) : manifest;
  const cols = meta?.sheet?.cols ?? config.cols;
  const rows = meta?.sheet?.rows ?? config.rows;
  const fw = img.width / cols;
  const fh = img.height / rows;
  const count = cols * rows;

  // Pass 1: key out the background at a working scale and find the union
  // opaque bounding box, so the character (not the frame padding) is what we
  // anchor and scale. A shared box keeps the cycle from jittering.
  // `config.workH` lowers that working resolution for sheets with a lot of
  // frames (the boss stance is 81) â€” every later measurement is a RATIO inside
  // this space, so it only trades resampling headroom for load time and memory.
  const WORK_H = config.workH ?? 480;
  const workW = Math.round(WORK_H * (fw / fh));
  const work = [];
  const boxes = [];
  let minX = workW, minY = WORK_H, maxX = -1, maxY = -1;
  for (let i = 0; i < count; i++) {
    const c = makeCanvas(workW, WORK_H);
    const cc = c.getContext('2d');
    cc.imageSmoothingEnabled = true;
    cc.imageSmoothingQuality = 'high';
    cc.drawImage(img, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh, 0, 0, workW, WORK_H);
    keyOutBackground(c);
    const b = opaqueBBox(c);
    if (b) {
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
    boxes.push(b);
    work.push(c);
    const yieldNow = breathe();
    if (yieldNow) await yieldNow;
  }
  if (maxX < 0) throw new Error('sprite sheet is fully transparent after keying');

  // Pass 2: crop every frame to the union box, scaled so character height is
  // drawH. Canvas bottom = lowest foot pixel, so feet sit on the ground line.
  // With bodyFrame set, that frame's stance height (not the union box, which a
  // raised fist inflates) is what maps to config.drawH.
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const bodyBox = config.bodyFrame != null ? boxes[config.bodyFrame] : null;
  const drawH = bodyBox
    ? Math.round(config.drawH * bh / (bodyBox.maxY - bodyBox.minY + 1))
    : config.drawH;
  const drawW = Math.round(bw * (drawH / bh));
  const frames = [];
  for (const c of work) {
    const f = makeCanvas(drawW, drawH);
    const fc = f.getContext('2d');
    fc.imageSmoothingEnabled = true;
    fc.imageSmoothingQuality = 'high';
    fc.drawImage(c, minX, minY, bw, bh, 0, 0, drawW, drawH);
    frames.push(f);
    const yieldNow = breathe();
    if (yieldNow) await yieldNow;
  }

  const anims = resolveAnims(meta, count);
  if (animationName !== 'walk') anims[animationName] = anims.walk;

  // Combat pointer (analyzer format): map each listed frame's hitboxes from
  // exported-frame pixel space into this sprite's draw space.
  let hits = null;
  if (meta?.combat) {
    const hitData = await fetch(new URL('../' + encodeURI(meta.combat), import.meta.url))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (hitData?.frames) {
      const toDraw = (WORK_H / fh) * (drawH / bh);
      const offX = minX * (drawH / bh);
      const offY = minY * (drawH / bh);
      hits = new Map();
      for (const entry of hitData.frames) {
        hits.set(entry.frame, (entry.hitboxes ?? []).map((hb) => ({
          ...hb,
          x: hb.x * toDraw - offX,
          y: hb.y * toDraw - offY,
          w: hb.w * toDraw,
          h: hb.h * toDraw,
        })));
      }
    }
  }

  // Foot anchoring is right for anyone STANDING: the lowest band of the drawing
  // is his boots, his boots stay under him, so centring on them keeps him
  // planted. It is wrong for a body on the ground. There the lowest band is
  // whichever part happens to be down â€” a shoulder, then his back, then his legs
  // as they come out of the air â€” so the anchor hops from body part to body part
  // and every hop TRANSLATES the whole man sideways on screen while his world
  // position never changes. Measured on the Agbero's landing: his drawn edge
  // lurched 57 px back toward Darki over the settle, which reads as a body
  // sliding at you after it hits the deck.
  //
  // `anchorFrame` freezes the anchor to one frame's, so the sheet is drawn as
  // the artist composed it and the only motion is the motion he DREW.
  const anchors = [];
  for (const f of frames) {
    anchors.push(footAnchorX(f));          // another full scan per frame
    const yieldNow = breathe();
    if (yieldNow) await yieldNow;
  }
  if (config.anchorFrame != null && anchors[config.anchorFrame] != null)
    anchors.fill(anchors[config.anchorFrame]);
  /* `faces` travels WITH the sprite. Enemies already flip against their own
   * sheet's constant (`enemy.facing !== config.faces`); Darki's draw code read
   * the walk sheet's for every one of his, which was true right up until a
   * player sheet was authored facing the other way. Carrying it here means the
   * answer comes from the sheet being drawn instead of from a global. */
  return { frames, anchors, drawW, drawH, anims, hits, faces: config.faces ?? 1 };
}

/* ---------------------------------------------------- building cutouts */

// Paper-background remover for the building paintings. A plain border flood
// fill stalls at thin drawn wires, leaving sealed-off background pockets, so:
// flood a coarse 1/8-scale copy (wires average away there, pockets reconnect
// to the border), then at full scale erase pixels that are BOTH inside the
// coarse background region AND close to the paper colour â€” wires and painted
// white walls fail one of the two tests and survive.
function keyOutPaper(frame, tol) {
  const { width: w, height: h } = frame;
  const fctx = frame.getContext('2d');
  const data = fctx.getImageData(0, 0, w, h);
  const px = data.data;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
  const bg = [0, 1, 2].map((c) => corners.reduce((s, i) => s + px[i + c], 0) / 4);
  const dist2 = (i) => {
    const dr = px[i] - bg[0], dg = px[i + 1] - bg[1], db = px[i + 2] - bg[2];
    return dr * dr + dg * dg + db * db;
  };

  const S = 8;
  const cw = Math.max(8, Math.ceil(w / S));
  const ch = Math.max(8, Math.ceil(h / S));
  const coarse = makeCanvas(cw, ch);
  const cc = coarse.getContext('2d');
  cc.imageSmoothingEnabled = true;
  cc.drawImage(frame, 0, 0, cw, ch);
  const cpx = cc.getImageData(0, 0, cw, ch).data;
  const cTol2 = (tol * 1.5) * (tol * 1.5);
  const isBgCell = (ci) => {
    const i = ci * 4;
    const dr = cpx[i] - bg[0], dg = cpx[i + 1] - bg[1], db = cpx[i + 2] - bg[2];
    return dr * dr + dg * dg + db * db < cTol2;
  };
  const mask = new Uint8Array(cw * ch);
  const stack = [];
  for (let x = 0; x < cw; x++) stack.push(x, 0, x, ch - 1);
  for (let y = 0; y < ch; y++) stack.push(0, y, cw - 1, y);
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= cw || y >= ch) continue;
    const ci = y * cw + x;
    if (mask[ci]) continue;
    if (!isBgCell(ci)) continue;
    mask[ci] = 1;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  // Dilate the mask so boundary cells (mixed wire + paper) are candidates
  // too; the per-pixel colour test below still protects the artwork.
  for (let pass = 0; pass < 2; pass++) {
    const grown = mask.slice();
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const ci = y * cw + x;
        if (mask[ci]) continue;
        if ((x > 0 && mask[ci - 1]) || (x < cw - 1 && mask[ci + 1]) ||
            (y > 0 && mask[ci - cw]) || (y < ch - 1 && mask[ci + cw])) grown[ci] = 1;
      }
    }
    mask.set(grown);
  }

  const TOL2 = tol * tol;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ci = Math.min(ch - 1, (y / S) | 0) * cw + Math.min(cw - 1, (x / S) | 0);
      if (!mask[ci]) continue;
      const i = (y * w + x) * 4;
      if (dist2(i) < TOL2) px[i + 3] = 0;
    }
  }
  fctx.putImageData(data, 0, 0);
}

// Buildings come from painted source images (buildings/buildings.json). Two
// boundary styles: a crop rect + flood-fill key for uniform paper
// backgrounds, or a cutout polygon for images whose background is a scene.
async function loadBuildings() {
  const cfg = await fetch(new URL('../buildings/buildings.json', import.meta.url))
    .then((r) => r.json());
  return Promise.all(cfg.buildings.map(async (b) => {
    const img = await loadImage(b.src);
    let cx, cy, cw, ch;
    if (b.polygon) {
      const xs = b.polygon.map((p) => p[0]);
      const ys = b.polygon.map((p) => p[1]);
      cx = Math.min(...xs); cy = Math.min(...ys);
      cw = Math.max(...xs) - cx; ch = Math.max(...ys) - cy;
    } else {
      ({ x: cx, y: cy, w: cw, h: ch } = b.crop);
    }
    const scale = b.drawH / ch;
    const c = makeCanvas(Math.max(1, Math.round(cw * scale)), b.drawH);
    const cc = c.getContext('2d');
    cc.imageSmoothingEnabled = true;
    cc.imageSmoothingQuality = 'high';
    if (b.polygon) {
      cc.save();
      cc.scale(scale, scale);
      cc.beginPath();
      b.polygon.forEach(([px, py], i) =>
        i ? cc.lineTo(px - cx, py - cy) : cc.moveTo(px - cx, py - cy));
      cc.closePath();
      cc.clip();
      cc.drawImage(img, -cx, -cy);
      cc.restore();
    } else {
      cc.drawImage(img, cx, cy, cw, ch, 0, 0, c.width, c.height);
      keyOutPaper(c, b.key?.tol ?? 30);
    }
    // trim to opaque pixels so the base sits flush on the pavement
    const bb = opaqueBBox(c);
    const t = makeCanvas(bb.maxX - bb.minX + 1, bb.maxY - bb.minY + 1);
    const tc = t.getContext('2d');
    tc.drawImage(c, -bb.minX, -bb.minY);
    // bake in harmattan haze so the block reads as distant
    tc.globalCompositeOperation = 'source-atop';
    tc.fillStyle = 'rgba(218, 209, 190, 0.38)';
    tc.fillRect(0, 0, t.width, t.height);
    return t;
  }));
}

/* ------------------------------------------------- Lagos street tileset */

// Ground tiles are painted once into an atlas, then the level composes them.
// Atlas slots: 0 asphalt, 1 asphalt+centre dash, 2 asphalt edge (yellow line),
// 3 pothole asphalt, 4 zebra stripe, 5 paving slab, 6 kerb+gutter, 7 red earth.
// Level 1 kit: slice every module from assetkit.png, keying the dark charcoal
// background and trimming to the opaque bounds (same pipeline as the painted
// buildings). Returns { id: canvas }.
async function loadKit() {
  const cfg = await fetch(new URL('../level1/kit.json', import.meta.url)).then((r) => r.json());
  const img = await loadImage(cfg.image);
  const kit = {};
  for (const m of cfg.modules) {
    const c = makeCanvas(m.w, m.h);
    c.getContext('2d').drawImage(img, m.x, m.y, m.w, m.h, 0, 0, m.w, m.h);
    keyOutBackground(c, cfg.keyTol);
    const bb = opaqueBBox(c);
    if (!bb) { kit[m.id] = c; continue; }
    const t = makeCanvas(bb.maxX - bb.minX + 1, bb.maxY - bb.minY + 1);
    t.getContext('2d').drawImage(c, -bb.minX, -bb.minY);
    kit[m.id] = t;
  }
  return kit;
}

// Assemble Level 1 (Lagos Market District) from the kit across the world,
// following the reference: a dense shanty building row with roof clutter and
// signage, a market frontage stretch through the middle, utility poles, and
// ground props on the sidewalk. Seeded so it's deterministic. The gameplay
// lane (the road) is left clear â€” everything sits on/behind the sidewalk.
function buildLevel(kit) {
  const rng = mulberry32(2024);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const has = (id) => !!kit[id];

  const buildingIds = ['bldg_a', 'bldg_b', 'bldg_c', 'bldg_d'].filter(has);
  const buildings = [], clutter = [], signs = [], utility = [];
  let x = 30, bag = [];
  while (x < WORLD_W - 120) {
    if (!bag.length) bag = [...buildingIds].sort(() => rng() - 0.5);
    const id = bag.pop();
    const img = kit[id];
    const scale = 0.92 + rng() * 0.18;
    const w = img.width * scale, h = img.height * scale;
    buildings.push({ id, x, w, h });
    // roof clutter + facade sign so no two buildings read the same
    if (has('watertank') && rng() < 0.5) clutter.push({ id: 'watertank', cx: x + w * 0.6, roofH: h, scale: 0.55 });
    if (has('satellite') && rng() < 0.45) clutter.push({ id: 'satellite', cx: x + w * 0.28, roofH: h * 0.98, scale: 0.5 });
    if (has('ac_unit') && rng() < 0.5) clutter.push({ id: 'ac_unit', cx: x + w * 0.72, roofH: h * 0.5, scale: 0.6 });
    const signId = pick(['sign_1', 'sign_2', 'sign_3'].filter(has));
    if (signId && rng() < 0.55) signs.push({ id: signId, cx: x + w * (0.3 + rng() * 0.35), faceH: h * (0.45 + rng() * 0.2), scale: 0.62 });
    x += w - 4 + rng() * 26;
  }
  for (let px = 220; px < WORLD_W; px += 520 + rng() * 220) {
    const id = rng() < 0.55 && has('pole_b') ? 'pole_b' : 'streetlamp';
    if (has(id)) utility.push({ id, cx: px, scale: 0.95 });
  }

  // market frontage â€” clustered through the middle "market stretch"
  const frontIds = ['fruit_stall', 'kiosk', 'pos_booth', 'umbrella', 'table', 'chair'].filter(has);
  const frontage = [];
  for (let fx = 1500; fx < 4700 && frontIds.length; fx += 250 + rng() * 210) {
    frontage.push({ id: pick(frontIds), cx: fx, scale: 0.9 + rng() * 0.16 });
  }

  // ground props scattered on the sidewalk (behind actors, lane kept clear)
  const propIds = ['generator', 'tyres_a', 'tyres_b', 'crate_a', 'crate_big', 'crate_wood',
    'barrels', 'jerry_a', 'jerry_b', 'bottles', 'barrier', 'cart', 'bike'].filter(has);
  const groundProps = [];
  for (let px = 300; px < WORLD_W - 160 && propIds.length; px += 340 + rng() * 280) {
    groundProps.push({ id: pick(propIds), cx: px, scale: 0.85 + rng() * 0.22 });
  }

  // parked danfos against the kerb
  const danfos = has('danfo') ? [820, 2600, 4400, 6000].map((cx) => ({ id: 'danfo', cx, scale: 1.05 })) : [];

  return { buildings, clutter, signs, utility, frontage, groundProps, danfos };
}

function buildTileAtlas() {
  const atlas = makeCanvas(TILE * 8, TILE);
  const a = atlas.getContext('2d');
  const rng = mulberry32(1999);

  const speckle = (x0, base, spread, n) => {
    for (let i = 0; i < n; i++) {
      const v = base + Math.floor(rng() * spread);
      a.fillStyle = `rgb(${v},${v},${v + 4})`;
      a.fillRect(x0 + Math.floor(rng() * TILE), Math.floor(rng() * TILE), 2, 2);
    }
  };

  const asphalt = (slot) => {
    const x0 = slot * TILE;
    a.fillStyle = '#33343a';
    a.fillRect(x0, 0, TILE, TILE);
    speckle(x0, 40, 26, 90);
    a.fillStyle = 'rgba(0,0,0,.25)';
    a.fillRect(x0, 0, TILE, 3); // shading under the road crown
  };

  asphalt(0);

  asphalt(1); // centre dash (yellow, Nigerian roads)
  a.fillStyle = '#d8b022';
  a.fillRect(1 * TILE + 10, 26, 44, 10);

  asphalt(2); // top edge line
  a.fillStyle = '#c9a51e';
  a.fillRect(2 * TILE, 4, TILE, 6);

  asphalt(3); // pothole
  a.fillStyle = '#17181c';
  a.beginPath();
  a.ellipse(3 * TILE + 32, 34, 22, 13, 0, 0, Math.PI * 2);
  a.fill();
  a.strokeStyle = '#4a4b52';
  a.lineWidth = 2;
  a.stroke();

  asphalt(4); // zebra stripe
  a.fillStyle = '#cfcfc6';
  a.fillRect(4 * TILE + 8, 0, 30, TILE);

  { // paving slab (sidewalk)
    const x0 = 5 * TILE;
    a.fillStyle = '#8f8577';
    a.fillRect(x0, 0, TILE, TILE);
    speckle(x0, 120, 30, 50);
    a.strokeStyle = 'rgba(60,52,44,.7)';
    a.lineWidth = 2;
    a.strokeRect(x0 + 1, 1, TILE - 2, TILE - 2);
    a.beginPath(); a.moveTo(x0, TILE / 2); a.lineTo(x0 + TILE, TILE / 2); a.stroke();
  }

  { // kerb with open gutter
    const x0 = 6 * TILE;
    a.fillStyle = '#a9a294';
    a.fillRect(x0, 0, TILE, 22);          // kerb stone
    a.fillStyle = 'rgba(0,0,0,.2)';
    a.fillRect(x0, 18, TILE, 4);
    a.fillStyle = '#101216';
    a.fillRect(x0, 22, TILE, 26);          // gutter slot
    a.fillStyle = '#6e675c';
    a.fillRect(x0, 48, TILE, 16);          // gutter far wall
    a.fillStyle = '#7c7568';
    a.fillRect(x0 + 8, 24, 20, 22);        // concrete slab bridging the gutter
  }

  { // red laterite earth
    const x0 = 7 * TILE;
    a.fillStyle = '#8a5a34';
    a.fillRect(x0, 0, TILE, TILE);
    for (let i = 0; i < 60; i++) {
      const v = 110 + Math.floor(rng() * 60);
      a.fillStyle = `rgb(${v},${Math.floor(v * .62)},${Math.floor(v * .36)})`;
      a.fillRect(x0 + Math.floor(rng() * TILE), Math.floor(rng() * TILE), 3, 2);
    }
  }

  return atlas;
}

const T = { ROAD: 0, DASH: 1, EDGE: 2, HOLE: 3, ZEBRA: 4, SLAB: 5, KERB: 6, EARTH: 7 };

// Road strip rows, top to bottom, from GROUND_Y down to the canvas bottom.
function buildGroundMap() {
  const cols = Math.ceil(WORLD_W / TILE);
  const rows = Math.ceil((VIEW_H - GROUND_Y) / TILE) + 1;
  const rng = mulberry32(42);
  const map = [];
  for (let r = 0; r < rows; r++) {
    const row = new Array(cols);
    for (let c = 0; c < cols; c++) {
      const zebra = c % 44 >= 40; // a crossing every ~2800px
      if (zebra) { row[c] = T.ZEBRA; continue; }
      if (r === 0) row[c] = T.EDGE;
      else if (r === 1) row[c] = rng() < 0.06 ? T.HOLE : (c % 2 === 0 ? T.DASH : T.ROAD);
      else row[c] = rng() < 0.05 ? T.HOLE : T.ROAD;
    }
    map.push(row);
  }
  return map;
}

/* ------------------------------------------------ street scenery layers */

function buildStreetProps(buildingImgs) {
  const rng = mulberry32(7);
  // painted building cutouts, shuffled bag so the mix never repeats side by
  // side; scaled down because they sit a block behind the street
  const structures = [];
  let x = 60;
  let bag = [];
  while (x < WORLD_W - 400) {
    if (!bag.length) bag = buildingImgs.map((_, i) => i).sort(() => rng() - 0.5);
    const idx = bag.pop();
    const img = buildingImgs[idx];
    const s = (0.85 + rng() * 0.3) * 0.72;
    const w = img.width * s;
    structures.push({ x, idx, w, h: img.height * s });
    x += w + 24 + Math.floor(rng() * 140);
  }

  const poles = [];
  for (let px = 160; px < WORLD_W; px += 620) poles.push(px);

  const skyline = [];
  const srng = mulberry32(11);
  for (let sx = 0; sx < WORLD_W * 0.35; sx += 90 + srng() * 120) {
    skyline.push({ x: sx, w: 70 + srng() * 90, h: 90 + srng() * 190 });
  }
  return { structures, poles, skyline };
}

// danfo traffic on the far lane, both directions
function buildBuses() {
  const rng = mulberry32(23);
  return Array.from({ length: 6 }, (_, i) => ({
    x: 300 + i * (WORLD_W - 600) / 6 + rng() * 320,
    dir: rng() < 0.5 ? -1 : 1,
    speed: 130 + rng() * 110,
    scale: 0.7 + rng() * 0.12,
  }));
}

const SIDEWALK_TOP = GROUND_Y - 56; // buildings and poles stand on this band

function drawDanfo(x, baseY) {
  const y = baseY;
  ctx.fillStyle = '#e6b400';                       // Lagos danfo yellow
  ctx.beginPath();
  ctx.roundRect(x, y - 96, 220, 92, 10);
  ctx.fill();
  ctx.fillStyle = '#141414';
  ctx.fillRect(x, y - 62, 220, 12);               // black stripe
  ctx.fillStyle = '#bfd8e8';
  for (let wx = x + 14; wx < x + 190; wx += 52) ctx.fillRect(wx, y - 88, 40, 22);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(x + 48, y - 2, 16, 0, Math.PI * 2);
  ctx.arc(x + 172, y - 2, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.arc(x + 48, y - 2, 7, 0, Math.PI * 2);
  ctx.arc(x + 172, y - 2, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#141414';
  ctx.font = display(700, 15);
  ctx.textAlign = 'center';
  ctx.fillText('CMS ↔ OSHODI', x + 110, y - 40);
}

function drawPole(x, nextX) {
  ctx.fillStyle = '#4a3b2c';
  ctx.fillRect(x - 5, SIDEWALK_TOP - 300, 10, 300);
  ctx.fillRect(x - 34, SIDEWALK_TOP - 292, 68, 7);
  if (nextX !== undefined) { // sagging cables to the next pole
    ctx.strokeStyle = 'rgba(20,22,26,.8)';
    ctx.lineWidth = 2;
    for (const drop of [288, 276]) {
      ctx.beginPath();
      ctx.moveTo(x, SIDEWALK_TOP - drop);
      ctx.quadraticCurveTo((x + nextX) / 2, SIDEWALK_TOP - drop + 46, nextX, SIDEWALK_TOP - drop);
      ctx.stroke();
    }
  }
}

/* ------------------------------------------------------------ game state */

const input = {
  left: false, right: false, up: false, down: false,
  jumpHeld: false, jumpPressed: false,
  // Edge-triggered attack presses, consumed by the attack buffer each frame.
  leftJabPressed: false, kickPressed: false, comboPressed: false, upperPressed: false,
  grabPressed: false, executePressed: false,
  lmbRaw: false, rmbRaw: false,     // raw button edges for the manual grab-combo
  leftJabHeld: false, upperHeld: false, grabHeld: false,
  blockHeld: false,                 // the guard is a HELD state, not an edge
  // L2 is now BOTH an edge and a hold: the press still offers the execution, and
  // if there is no execution to offer it becomes a pickup â€” which is carried for
  // exactly as long as the button stays down. See CARRY and consumeAttackInput.
  executeHeld: false,
};

// Keyboard directional held-state, tracked separately so the gamepad merge
// can recalculate input.left/right/up/down authoritatively every frame. The
// guard is tracked the same way and for the same reason: it is the only ACTION
// that is held rather than edged, so a pad releasing L1 has to be able to clear
// it â€” and no keyup fires for a button the keyboard never pressed.
const kbDir = { left: false, right: false, up: false, down: false };
// `execute` joins the guard here for the same reason: it became a HELD action
// when the carry landed on it, so a pad releasing L2 has to be able to clear a
// state the keyboard may never have set.
const kbHeld = { block: false, execute: false };

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump',
  KeyJ: 'leftjab',             // Left Jab (keyboard mirror of LMB)
  KeyK: 'upper',               // heavy: Uppercut
  KeyG: 'grab',                // Grab (whiffs into GrabFail with nobody in reach)
  KeyE: 'execute',             // EXECUTION on a boss already worn down
  KeyL: 'block',               // HOLD to guard (keyboard mirror of L1)
  ShiftLeft: 'block',
};

function typingInPanel(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'BUTTON');
}

window.addEventListener('keydown', (e) => {
  if (typingInPanel(e)) return;
  const act = KEYMAP[e.code];
  if (!act) return;
  e.preventDefault();
  /* Held state is tracked whatever is on screen â€” a key genuinely down should
   * read as down the moment the fight resumes â€” but the one-shot EDGES are not
   * raised while the sim is frozen. An edge raised behind the pause menu is a
   * swing that gets thrown on resume, off a press the player made at a menu.
   *
   * Deliberately keyed on `paused` ALONE and not on `frontEnd.active`. Adding
   * the front end looks like the same argument and is not: `onGameplayStart`
   * already clears every one of these flags on the way into a fight, so a menu
   * keypress cannot reach the sim anyway â€” and gating on it silently disables
   * every rAF-stubbed harness that drives attacks through real key events
   * (`tests/drive.html`, blockrepro), because those never let the front end hand
   * over. It cost a green regress suite to find that out. */
  const live = !paused;
  if (act === 'jump') {
    if (live && !input.jumpHeld) input.jumpPressed = true;
    input.jumpHeld = true;
  } else if (act === 'leftjab') {
    if (live && !input.leftJabHeld) input.leftJabPressed = true;
    input.leftJabHeld = true;
  } else if (act === 'upper') {
    if (live && !input.upperHeld) input.upperPressed = true;
    input.upperHeld = true;
  } else if (act === 'grab') {
    if (live && !input.grabHeld) input.grabPressed = true;   // edge-triggered: no auto-repeat
    input.grabHeld = true;
  } else if (act === 'execute') {
    // Edge-triggered now that L2 also carries: auto-repeat used to raise a fresh
    // press every ~30 ms while the key was down, which for the execution merely
    // re-offered a finisher it had already started, but for the pickup would be
    // a new grab attempt on every repeat â€” the exact thing the spec forbids.
    if (live && !input.executeHeld) input.executePressed = true;
    kbHeld.execute = true;
    input.executeHeld = true;
  } else if (act === 'block') {
    // Held, not edged: auto-repeat is harmless. Write BOTH â€” kbHeld is what the
    // gamepad merge ORs against, and input.blockHeld is what the sim reads.
    // Setting only kbHeld made the guard the one action whose keyboard state
    // reached the sim exclusively via pollGamepad(), which the rAF loop calls
    // but __ror.step() does not â€” so it worked in play and was invisible to
    // every headless test.
    kbHeld.block = true;
    input.blockHeld = true;
  } else { kbDir[act] = true; }
});

window.addEventListener('keyup', (e) => {
  if (typingInPanel(e)) return;
  const act = KEYMAP[e.code];
  if (!act) return;
  if (act === 'jump') input.jumpHeld = false;
  else if (act === 'leftjab') input.leftJabHeld = false;
  else if (act === 'upper') input.upperHeld = false;
  else if (act === 'grab') input.grabHeld = false;
  else if (act === 'execute') { kbHeld.execute = false; input.executeHeld = false; }
  else if (act === 'block') { kbHeld.block = false; input.blockHeld = false; }
  else { kbDir[act] = false; }
});

// Pause toggle (P or Enter). Clears transient presses so nothing fires on resume.
// During MC_Olodo's entrance the same button SKIPS the cutscene instead â€” the
// scene is scripted, so pausing inside it would just stall a cinematic. His
// outro answers the button the same way, and once the case file is up the
// button does nothing at all: the level is over and there is nothing to resume.
// CONTROLS and OPTIONS are NOT drawn here any more. They hand off to the front
// end's real, interactive screens (frontEnd.openFromPause) and come back to a
// still-frozen fight, so there is exactly one controls page and one options page
// in the game instead of a full version in the menu and a read-only copy here.
const PAUSE_MENU = [
  { label: 'RESUME', icon: 'play' },
  { label: 'RESTART CHECKPOINT', icon: 'restore' },
  { label: 'CONTROLS', icon: 'pad' },
  { label: 'OPTIONS', icon: 'gear' },
  { label: 'QUIT TO MENU', icon: 'power' },
];
const PAUSE_ITEMS = PAUSE_MENU.map((it) => it.label);   // labels, for the dev hooks
let pauseChoice = 0;

/* Pause navigation, deliberately built to the same shape as the front end's
 * (see processHeldInput there): a fresh press always steps exactly once, and
 * only then does a hold repeat on our own cadence. Keyboard held-state and pad
 * held-state are tracked separately and OR'd, because either source has to be
 * able to release a direction on its own. */
const pauseKey = { up: false, down: false };
const pausePad = { up: false, down: false };
const pausePadPrev = { accept: false, back: false, start: false };
const pauseLatch = { up: 0, down: 0, accept: 0, back: 0 };
const pauseRepeat = { dir: 0, t: 0 };
// (hover has no separate visual state: hovering MOVES the selection, so focus is it)
let pausePointerDown = -1;

const pauseHeld = (k) => pauseKey[k] || pausePad[k];
const pauseTakeLatch = (k) => { const v = pauseLatch[k]; pauseLatch[k] = 0; return v; };

function clearPauseInput() {
  for (const k of Object.keys(pauseKey)) pauseKey[k] = false;
  for (const k of Object.keys(pauseLatch)) pauseLatch[k] = 0;
  /* The pad table is SEEDED from the live buttons, not zeroed â€” and that is the
   * whole trick. START is the button that just opened this menu and it is still
   * physically down; against a zeroed table it reads as a brand-new press on
   * the very next frame and closes the menu again before a single frame of it
   * has been seen. Same for Cross and Circle on the way in from gameplay. The
   * repeat clock is parked at the hold delay for the same reason: a direction
   * already held must not start stepping the instant the menu appears. */
  const gp = activeGamepad();
  const down = (i) => !!(gp && gp.buttons[i] && gp.buttons[i].pressed);
  pausePadPrev.accept = down(0);
  pausePadPrev.back = down(1);
  pausePadPrev.start = down(9);
  pausePad.up = down(12);
  pausePad.down = down(13);
  pauseRepeat.dir = pausePad.down ? 1 : pausePad.up ? -1 : 0;
  pauseRepeat.t = frontEnd?.ui.HOLD_DELAY ?? 0.40;
  pausePointerDown = -1;
}

function togglePause() {
  if (levelEntry.active) return;                // the narrated walk-in owns control
  if (cutscene.active) { skipCutscene(); return; }
  if (outro.active) { skipOutro(); return; }
  paused = !paused;
  if (paused) { stopControllerRumble(); pauseChoice = 0; }
  clearPauseInput();
  // Every transient press is dropped on BOTH edges. Going in, so a button held
  // at the moment of pausing is not still queued; coming out, so the press that
  // chose RESUME does not also throw a punch.
  input.jumpPressed = input.leftJabPressed = input.kickPressed = input.comboPressed = input.upperPressed = false;
  input.grabPressed = input.executePressed = false;
  input.lmbRaw = input.rmbRaw = false;
  lmbCount = 0;
  lmbLastT = -1;
  rmbDown = false;
  player.bufferedAttack = null;
}

/* Both directions play the move cue, matching the front end's lists. The back
 * cue belongs to leaving a screen, not to travelling up one. */
function movePauseChoice(delta) {
  const n = PAUSE_MENU.length;
  const next = (pauseChoice + delta + n) % n;
  if (next === pauseChoice) return;          // no state change => no sound
  pauseChoice = next;
  frontEnd?.ui.navForward();
}

function activatePauseChoice() {
  const item = PAUSE_ITEMS[pauseChoice];
  frontEnd?.ui.pressPulse(`pause:${pauseChoice}`);
  if (item === 'RESUME') { frontEnd?.ui.navForward(); togglePause(); return; }
  frontEnd?.ui.navForward();
  if (item === 'RESTART CHECKPOINT') {
    sessionStorage.setItem('rorSkipToGameplay', '1');
    location.reload();
  } else if (item === 'CONTROLS' || item === 'OPTIONS') {
    // The fight stays paused underneath; onPauseReturn brings us back to it.
    clearPauseInput();
    frontEnd?.openFromPause(item);
  } else if (item === 'QUIT TO MENU') {
    sessionStorage.setItem('rorSkipSplash', '1');
    location.reload();
  }
}

/* One axis of pause navigation plus the two commit buttons. Called from the
 * main loop while frozen, so it advances on real dt rather than on key-repeat. */
function updatePauseInput(dt) {
  const holdDelay = frontEnd?.ui.HOLD_DELAY ?? 0.40;
  const holdRate = frontEnd?.ui.HOLD_RATE ?? 0.115;
  const dir = pauseHeld('down') ? 1 : pauseHeld('up') ? -1 : 0;

  let fired = 0;
  if (pauseTakeLatch('down')) { pauseTakeLatch('up'); fired = 1; }
  else if (pauseTakeLatch('up')) fired = -1;

  if (fired) {
    movePauseChoice(fired);
    pauseRepeat.dir = dir;
    pauseRepeat.t = holdDelay;
  } else if (dir !== pauseRepeat.dir) {
    pauseRepeat.dir = dir;
    pauseRepeat.t = holdDelay;
    if (dir) movePauseChoice(dir);          // the pad has no latch; its edge lands here
  } else if (dir) {
    pauseRepeat.t -= dt;
    if (pauseRepeat.t <= 0) { pauseRepeat.t = holdRate; movePauseChoice(dir); }
  }

  if (pauseTakeLatch('accept')) { activatePauseChoice(); return; }
  /* Dismissing the menu with O / Escape / START is a RETURN, so it gets the back
   * cue â€” the one place in the pause menu that cue belongs. Choosing RESUME with
   * Cross is a confirmation and keeps the forward cue, in activatePauseChoice. */
  if (pauseTakeLatch('back')) { frontEnd?.ui.navBack(); togglePause(); }
}

/* Accept is Enter ALONE, deliberately narrower than the front end's
 * Enter/Space/KeyJ. Space is Jump and J is Attack: a player who pauses in the
 * middle of a mash would otherwise have RESUME chosen for them by the next
 * button they were already pressing. */
function pauseKeyAction(code) {
  if (code === 'ArrowUp' || code === 'KeyW') return 'up';
  if (code === 'ArrowDown' || code === 'KeyS') return 'down';
  if (code === 'Enter') return 'accept';
  if (code === 'Escape' || code === 'Backspace' || code === 'KeyP') return 'back';
  return null;
}

/* The post-mission sequence's keys.
 *
 * ACCEPT IS KeyX FIRST. Every prompt in that sequence says "PRESS X", and on a
 * keyboard that has to be true of the X key or the prompt is a lie â€” the pad's
 * Cross is what the glyph means, and the two must agree. Enter and Space come
 * along because they are accept everywhere else in this game; Enter is
 * intercepted HERE rather than falling through to togglePause, which during the
 * ending would skip the outro out from under the sequence. */
function aftermathKeyAction(code) {
  if (code === 'KeyX' || code === 'Enter' || code === 'NumpadEnter'
    || code === 'Space' || code === 'KeyJ') return 'accept';
  if (code === 'Escape' || code === 'Backspace' || code === 'KeyO') return 'back';
  if (code === 'ArrowLeft' || code === 'KeyA') return 'left';
  if (code === 'ArrowRight' || code === 'KeyD') return 'right';
  /* The keyboard's L1/R1. Q and E are the shoulder pair everywhere a keyboard
   * stands in for a pad, and the brackets are here because a player reading a
   * case file has their hand nowhere near WASD. Deliberately NOT the arrows:
   * left/right already pick a level card on the last screen, and one key
   * meaning "previous page" on four screens and "previous card" on the fifth is
   * how a control stops being trusted. */
  if (code === 'KeyQ' || code === 'BracketLeft') return 'prev';
  if (code === 'KeyE' || code === 'BracketRight') return 'next';
  /* The vertical walk, for the Cabal's network column. Separate from
   * prev/next so the two axes stay distinguishable on the pad, where the
   * shoulders and the stick are genuinely different controls. */
  if (code === 'ArrowUp' || code === 'KeyW') return 'up';
  if (code === 'ArrowDown' || code === 'KeyS') return 'down';
  /* Triangle's keyboard stand-in. T for the button, F for the file — a player
   * reading a case with one hand on the arrows should not have to find a letter
   * on the far side of the keyboard. */
  if (code === 'KeyT' || code === 'KeyF') return 'action';
  return null;
}

window.addEventListener('keydown', (e) => {
  if (typingInPanel(e) || frontEnd?.active) return;
  resumeAudio();
  /* The fight is over: the sequence owns the keyboard outright. Nothing below
   * may reach the sim, including the pause toggle â€” there is nothing left to
   * pause and Enter is this screen's confirm. */
  if (aftermath.active) {
    const action = aftermathKeyAction(e.code);
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;              // the OS repeat is not a second press
    aftermath.press(action);
    return;
  }
  if (paused) {
    const action = pauseKeyAction(e.code);
    if (action) {
      e.preventDefault();
      if (e.repeat) return;          // OS auto-repeat is discarded; the loop owns the cadence
      if (action === 'up' || action === 'down') pauseKey[action] = true;
      pauseLatch[action] = 1;
    }
    return;                          // nothing else reaches the sim while frozen
  }
  if (e.code === 'KeyP' || e.code === 'Enter') { e.preventDefault(); togglePause(); }
  if (e.code === 'KeyM') {
    e.preventDefault();
    audioMuted = !audioMuted;
    if (audioMuted) { queuedVoice = null; stopDarkiVoice(); }
  }
});

window.addEventListener('keyup', (e) => {
  const action = pauseKeyAction(e.code);
  if (action === 'up' || action === 'down') pauseKey[action] = false;
});
// Mouse: LMB = Left Jab, RMB = High Kick (back+RMB = Back Kick). TWO rapid LMB
// clicks (gap within COMBO_CLICK_WINDOW) fire the full 5-hit combo on the second
// instead of another jab; the first jabs as normal (the combo, being a `lock`
// move, interrupts the jab-in-progress and plays through to the end).
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
let rmbDown = false;         // right button held â†’ LMB becomes the Uppercut (chord)
let lmbCount = 0, lmbLastT = -1;   // rapid-LMB run for the combo trigger
/* Pointer support for the pause menu, on the same hitboxes the widgets push.
 * Without this the pause menu was the only screen in the game a mouse could not
 * touch â€” and worse, a click while frozen used to queue a punch for the resume. */
function pauseHitIndex(e) {
  const ui = frontEnd?.ui;
  if (!ui) return -1;
  const hit = ui.hitTest(ui.pointerPos(e));
  return hit && typeof hit.index === 'number' && String(hit.id).startsWith('pause:') ? hit.index : -1;
}

/* The level-select cards push hitboxes exactly like every other widget, so the
 * mouse works on them without a second hit-test model. */
function aftermathHitIndex(e) {
  const ui = frontEnd?.ui;
  if (!ui) return -1;
  const hit = ui.hitTest(ui.pointerPos(e));
  return hit && typeof hit.index === 'number' && String(hit.id).startsWith('after:') ? hit.index : -1;
}

canvas.addEventListener('mousemove', (e) => {
  if (frontEnd?.active) return;
  if (aftermath.active) {
    const i = aftermathHitIndex(e);
    if (i >= 0 && i !== aftermath.selection) aftermath.press(i > aftermath.selection ? 'right' : 'left');
    return;
  }
  if (!paused) return;
  const i = pauseHitIndex(e);
  if (i < 0 || i === pauseChoice) return;                // hovering in place makes no sound
  movePauseChoice(i > pauseChoice ? 1 : -1);
  pauseChoice = i;                                       // jump straight there, cue already played
});

canvas.addEventListener('mousedown', (e) => {
  if (frontEnd?.active) return;
  e.preventDefault();
  canvas.focus();
  resumeAudio();                                        // unlock audio on first click
  /* A click anywhere is the accept the prompts are asking for; on the level
   * cards the hover above has already moved the highlight to the one under the
   * cursor, so clicking a card picks THAT card. */
  if (aftermath.active) {
    if (e.button === 0) aftermath.press('accept');
    return;
  }
  if (paused) {
    // The frozen fight takes no combat input at all â€” only the menu does.
    if (e.button === 0) {
      const i = pauseHitIndex(e);
      pausePointerDown = i;
      if (i >= 0) { pauseChoice = i; frontEnd?.ui.pressPulse(`pause:${i}`); }
    }
    return;
  }
  // raw per-button edges, independent of the jab/kick/chord mapping â€” the manual
  // grab-combo reads these so its alternation can't be confused by the chord.
  if (e.button === 0) input.lmbRaw = true;
  else if (e.button === 2) input.rmbRaw = true;
  if (e.button === 0) {                                 // LMB
    if (rmbDown) { input.upperPressed = true; return; } // hold RMB + click LMB â†’ Uppercut (not a combo click)
    const now = performance.now();
    lmbCount = (lmbLastT >= 0 && now - lmbLastT <= COMBO_CLICK_WINDOW) ? lmbCount + 1 : 1;
    lmbLastT = now;
    if (lmbCount >= 2) { input.comboPressed = true; lmbCount = 0; }  // LMBx2 â†’ 5-hit combo
    else input.leftJabPressed = true;                                // else Left Jab
  } else if (e.button === 1) {                          // MMB â€” Grab, same as G
    // No `grabHeld` bookkeeping: mousedown is already one event per physical
    // press, so the edge-trigger the keyboard path needs is free here.
    input.grabPressed = true;
  } else if (e.button === 2) {                          // RMB â€” kick + uppercut-chord modifier
    rmbDown = true;
    input.kickPressed = true;                           // High Kick (back+RMB â†’ Back Kick)
  }
});
// Middle-click also opens Chrome's autoscroll widget; `mousedown` preventDefault
// stops that, and this stops the click that follows it from doing anything else.
canvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
const clearRmb = () => { rmbDown = false; };
canvas.addEventListener('mouseup', (e) => {
  if (paused) {
    // Commit only if the release lands on the item the press started on.
    if (e.button === 0 && pausePointerDown >= 0 && pauseHitIndex(e) === pausePointerDown) {
      pauseLatch.accept = 1;
    }
    pausePointerDown = -1;
    return;
  }
  if (e.button === 2) rmbDown = false;
});
canvas.addEventListener('mouseleave', () => { clearRmb(); pausePointerDown = -1; });
window.addEventListener('blur', clearRmb);
window.addEventListener('blur', stopControllerRumble);

/* ------------------------------------------------ gamepad (controller) */
// Standard Gamepad layout (Xbox / PlayStation / generic Bluetooth controllers).
// Polled every frame before update() so the wireless controller feels identical
// to keyboard+mouse â€” same edge-triggered attack presses, same held-state for
// movement and jump. D-pad and left stick both steer; right stick is unused.
//
// Button mapping (standard layout index â†’ action):
//   0  A / Cross        â†’ Jump
//   1  B / Circle       â†’ Kick  (High Kick, or Back Kick if pushing back)
//   2  X / Square       â†’ Left Jab
//   3  Y / Triangle     â†’ Uppercut
//   4  LB / L1          â†’ Block (HELD, not edged)
//   5  RB / R1          â†’ 5-hit Combo
//   6  LT / L2          â†’ EXECUTION
//   7  RT / R2          â†’ Grab
//   9  Start / Options  â†’ Pause
//  12  D-pad Up         â†’ Up
//  13  D-pad Down       â†’ Down
//  14  D-pad Left       â†’ Left
//  15  D-pad Right      â†’ Right

const gpPrev = {
  jump: false, jab: false, kick: false, upper: false,
  grab: false, combo: false, pause: false, exec: false,
};
const GP_DEADZONE = 0.25;    // stick dead zone â€” ignore tiny drifts
let vibrationEnabled = true;
let activeGamepadIndex = null;

const hapticClamp = (value) => Math.max(0, Math.min(1, value));

function activeGamepad() {
  if (!navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  const preferred = activeGamepadIndex == null ? null : pads[activeGamepadIndex];
  if (preferred?.connected) return preferred;
  for (let i = 0; i < pads.length; i++) if (pads[i]?.connected) return pads[i];
  return null;
}

function rumbleController(duration = 70, strong = 0.35, weak = 0.25) {
  if (!vibrationEnabled) return false;
  const gp = activeGamepad();
  const actuator = gp?.vibrationActuator || gp?.hapticActuators?.[0];
  if (!actuator) return false;
  const ms = Math.max(0, Math.round(duration));
  const strongMagnitude = hapticClamp(strong);
  const weakMagnitude = hapticClamp(weak);
  try {
    if (typeof actuator.playEffect === 'function') {
      const effect = actuator.playEffect('dual-rumble', {
        startDelay: 0, duration: ms, strongMagnitude, weakMagnitude,
      });
      effect?.catch?.(() => {});
      return true;
    }
    if (typeof actuator.pulse === 'function') {
      const pulse = actuator.pulse(Math.max(strongMagnitude, weakMagnitude), ms);
      pulse?.catch?.(() => {});
      return true;
    }
  } catch {}
  return false;
}

function stopControllerRumble() {
  const gp = activeGamepad();
  const actuator = gp?.vibrationActuator || gp?.hapticActuators?.[0];
  try {
    if (typeof actuator?.reset === 'function') actuator.reset();
    else if (typeof actuator?.pulse === 'function') actuator.pulse(0, 0);
  } catch {}
}

function rumbleImpact(hitStop, shake, big) {
  if (shake <= 0 && hitStop <= 0 && !big) return;
  const force = hapticClamp(Math.max(shake / 16, hitStop / 0.14, big ? 0.78 : 0, 0.14));
  rumbleController(45 + force * 105, force, 0.12 + force * 0.52);
}

/* While frozen the pad drives the MENU, not Darki. Everything the sim reads is
 * zeroed and every gameplay edge-tracker is re-armed to the live button state,
 * so holding a button to pick RESUME cannot fire that button on the way out. */
function pollPausePad(gp) {
  input.left = input.right = input.up = input.down = false;
  input.jumpHeld = false;
  input.blockHeld = false;
  if (!gp) { pausePad.up = pausePad.down = false; return; }

  const btn = (i) => gp.buttons[i] && gp.buttons[i].pressed;
  const ly = gp.axes[1] || 0;
  pausePad.up = btn(12) || ly < -0.55;
  pausePad.down = btn(13) || ly > 0.55;

  const accept = btn(0);                       // Cross / A
  const back = btn(1);                         // Circle / B
  const start = btn(9);                        // Start / Options
  if (accept && !pausePadPrev.accept) pauseLatch.accept = 1;
  if ((back && !pausePadPrev.back) || (start && !pausePadPrev.start)) pauseLatch.back = 1;
  pausePadPrev.accept = accept;
  pausePadPrev.back = back;
  pausePadPrev.start = start;

  gpPrev.jump = accept;                        // Cross is also Jump â€” do not let it leak out
  gpPrev.kick = back;
  gpPrev.pause = start;
  gpPrev.jab = btn(2);
  gpPrev.upper = btn(3);
  gpPrev.combo = btn(5);
  gpPrev.exec = btn(6);
  gpPrev.grab = btn(7);
}

/* The pad during the ending. Edge-triggered off its own `prev`, and it clears
 * the combat inputs every frame for the same reason pollPausePad does: Cross is
 * also Jump, and a held button must not be queued up waiting for the next level
 * to start. */
const afterPadPrev = { accept: false, back: false, left: false, right: false,
  prev: false, next: false, up: false, down: false, action: false };
function pollAftermathPad(gp) {
  input.left = input.right = input.up = input.down = false;
  input.jumpHeld = false;
  input.blockHeld = false;
  if (!gp) { for (const k of Object.keys(afterPadPrev)) afterPadPrev[k] = false; return; }
  const btn = (i) => gp.buttons[i] && gp.buttons[i].pressed;
  const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
  const now = {
    accept: btn(0),                              // Cross / A â€” the X the prompts name
    back: btn(1),                                // Circle / B
    left: btn(14) || lx < -0.55,
    right: btn(15) || lx > 0.55,
    /* THE SHOULDERS PAGE THE CASE FILE. Same two buttons that guard and combo
     * in the fight â€” which is exactly why they are safe here: the fight is
     * over, and the pair below makes sure neither leaks back into it. */
    prev: btn(4),                                // L1 / LB
    next: btn(5),                                // R1 / RB
    /* The stick and the d-pad walk the Cabal's vertical network. */
    up: btn(12) || ly < -0.55,
    down: btn(13) || ly > 0.55,
    /* Triangle / Y â€” the case file's action. NOT Cross: see the note on
     * `action` in aftermath.js's press(). */
    action: btn(3),
  };
  for (const k of Object.keys(now)) {
    if (now[k] && !afterPadPrev[k]) aftermath.press(k);
    afterPadPrev[k] = now[k];
  }
  gpPrev.jump = now.accept;                      // â€¦and it does not leak out as a jump
  gpPrev.kick = now.back;
  /* R1 is the 5-hit combo. A player still holding it from the last page turn
   * when the next level starts would otherwise have their first frame of
   * control spent on a swing they did not ask for â€” the pad's edge detector
   * would see "pressed, and it was not pressed last time I looked". */
  gpPrev.combo = now.next;
  /* Triangle is the uppercut. Same reasoning as R1 above: a page opened with it
   * on the last frame of the sequence must not become a swing on the first
   * frame of the next level. */
  gpPrev.upper = now.action;
}

function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (let i = 0; i < pads.length; i++) {
    if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
  }
  if (gp) {
    padSeen = true;
    activeGamepadIndex = gp.index;
  }
  if (aftermath.active) { pollAftermathPad(gp); return; }
  if (paused) { pollPausePad(gp); return; }

  // --- movement: merge keyboard held-state + gamepad stick/d-pad ---
  // Always recalculated so released directions clear correctly from either source.
  let gpLeft = false, gpRight = false, gpUp = false, gpDown = false;
  if (gp) {
    const lx = (gp.axes[0] || 0), ly = (gp.axes[1] || 0);
    gpLeft  = lx < -GP_DEADZONE || (gp.buttons[14] && gp.buttons[14].pressed);
    gpRight = lx >  GP_DEADZONE || (gp.buttons[15] && gp.buttons[15].pressed);
    gpUp    = ly < -GP_DEADZONE || (gp.buttons[12] && gp.buttons[12].pressed);
    gpDown  = ly >  GP_DEADZONE || (gp.buttons[13] && gp.buttons[13].pressed);
  }
  input.left  = kbDir.left  || gpLeft;
  input.right = kbDir.right || gpRight;
  input.up    = kbDir.up    || gpUp;
  input.down  = kbDir.down  || gpDown;
  // The guard rides here rather than with the edge-triggered buttons below,
  // because this stanza runs with or without a pad â€” held state has to be
  // recalculated every frame from BOTH sources or it can never clear.
  input.blockHeld = kbHeld.block || !!(gp && gp.buttons[4] && gp.buttons[4].pressed);
  // L2 rides up here with the guard, and for the same two reasons: it is now a
  // HELD action (the carry lasts as long as it is down), and held state has to be
  // recalculated from BOTH sources every frame or a released trigger can never
  // clear it. Above the `!gp` return, so keyboard-only play still gets it.
  input.executeHeld = kbHeld.execute || !!(gp && gp.buttons[6] && gp.buttons[6].pressed);

  if (!gp) return;                    // no controller: buttons below don't apply

  const btn = (i) => gp.buttons[i] && gp.buttons[i].pressed;
  const jumpNow = btn(0);
  if (jumpNow && !gpPrev.jump) input.jumpPressed = true;
  input.jumpHeld = input.jumpHeld || jumpNow;
  gpPrev.jump = jumpNow;

  // --- left jab (X / Square) â€” edge-triggered ---
  const jabNow = btn(2);
  if (jabNow && !gpPrev.jab) {
    input.leftJabPressed = true;
    input.lmbRaw = true;            // feeds the manual grab-combo too
  }
  gpPrev.jab = jabNow;

  // --- kick (B / Circle) â€” edge-triggered ---
  const kickNow = btn(1);
  if (kickNow && !gpPrev.kick) {
    input.kickPressed = true;
    input.rmbRaw = true;
  }
  gpPrev.kick = kickNow;

  // --- uppercut (Y / Triangle) â€” edge-triggered ---
  const upperNow = btn(3);
  if (upperNow && !gpPrev.upper) input.upperPressed = true;
  gpPrev.upper = upperNow;

  // --- grab (RT / R2) â€” edge-triggered ---
  // Grab has moved twice, and both moves were the same trade. It came off L1
  // (button 4) when the guard arrived, because blocking wants the shoulder button
  // you can HOLD and holding a button that also grabs fires a grab every time you
  // raise your hands. It has now come off L2 as well, so the finisher can have it
  // â€” see the EXECUTION block below for why that button specifically. Grab keeps
  // a trigger, just the other one. Keyboard/mouse are untouched: still G / MMB.
  const grabNow = btn(7);
  if (grabNow && !gpPrev.grab) input.grabPressed = true;
  gpPrev.grab = grabNow;

  // --- 5-hit combo (RB / R1) â€” edge-triggered ---
  const comboNow = btn(5);
  if (comboNow && !gpPrev.combo) input.comboPressed = true;
  gpPrev.combo = comboNow;

  // --- EXECUTION (LT / L2) â€” edge-triggered ---
  // L2 BY REQUEST, and it is the left trigger for the same reason the finisher's
  // three checkpoints are on â–³ rather than â–¡ (see EXEC_ONE_BUTTON): the right hand
  // is the hand that is mashing. Jab, kick, uppercut and the combo all live on the
  // right side of the pad, so a finisher over there competes for the same fingers
  // that are already busy â€” and the checkpoints it opens are then pressed with
  // those same fingers a beat later. L2 is the left hand's deliberate press,
  // reached for on purpose and never in a flurry.
  //
  // Grab moved to R2 to make room; it is a swap, not a second binding, because
  // double-booking L2 would throw a grab attempt at every execution press.
  // A press with no legal target is still simply ignored and leaves the combat
  // state untouched, so mashing it costs nothing.
  const execNow = btn(6);
  if (execNow && !gpPrev.exec) input.executePressed = true;
  gpPrev.exec = execNow;

  // --- pause (Start / Options, button 9) ---
  const pauseNow = btn(9);
  if (pauseNow && !gpPrev.pause) togglePause();
  gpPrev.pause = pauseNow;

  // Controller interaction counts as a user gesture for audio unlock.
  if (jumpNow || jabNow || kickNow || upperNow || grabNow || comboNow || input.blockHeld) resumeAudio();
}

// Log connection/disconnection in console so the user knows it was recognised.
window.addEventListener('gamepadconnected', (e) => {
  console.log(`ðŸŽ® Controller connected: ${e.gamepad.id} (index ${e.gamepad.index})`);
});
window.addEventListener('gamepaddisconnected', (e) => {
  console.log(`ðŸŽ® Controller disconnected: ${e.gamepad.id}`);
  if (activeGamepadIndex === e.gamepad.index) activeGamepadIndex = null;
});

const player = {
  x: 320, y: GROUND_Y, vx: 0, depthV: 0, jumpY: 0, vy: 0,
  facing: 1, grounded: true,
  coyote: 0, buffer: 0,
  anim: 'idle', frame: 0, animTime: 0,
  // combat
  state: 'normal',             // 'normal' | 'hurt' | 'ko'
  hp: 100, maxHp: 100, hpShown: 100, hpFlash: 0,
  stepClock: null,             // last walk-cycle step his boots were checked at
  rage: 0, rageActive: false, rageTimer: 0,
  attack: null,                // active attack move name, or null
  attackStep: 0,               // index into the move's frame list
  // manual grab-combo (Cont.Combo): armed fist, active section, punch clock,
  // buffered alternate, same-button mash streak, and the 5-second stamina budget
  mcArmed: null, mcSection: null, mcFist: 0, mcTime: 0, mcHitDone: false,
  mcLap: null, mcEnding: false, mcExitAt: -1, mcStamina: 0,
  mcRepeat: 0,                 // consecutive taps of the SAME button
  mcLaps: 0,                   // circle currently playing, 1-based
  grabFullCombo: false,        // true only after every manual grab-combo lap closes
  // --- pickup / carry / throw (hold L2) ---
  carrying: false,             // the carry STANCE: he can walk, he cannot swing
  carryHoldT: 0,               // seconds held, against CARRY.maxHold
  carryAnimT: 0,               // frames through entry-once -> repeating heavy stride
  carryThrowPower: 0,          // charge snapshot; survives the release animation
  carryTargetRef: null,        // the mark chosen on the press (re-validated on latch)
  carryWhiffed: false,         // the hands closed on empty air
  carryDone: false,            // this attempt is spent â€” one grab per press, ever
  // --- RUSH (forward, forward) ---
  rushT: 0,                    // seconds charging, against RUSH.maxTime
  rushWindowT: 0,              // seconds the combat window has been open
  rushBuffered: null,          // 'box' | 'r1' pressed mid-charge, spent on arrival
  rushDirAtEntry: null,        // directions already held as the window opened
  rushStam: 1,                 // the sprint gauge, 0..1 (see RUSH.stamina)
  rushStamDelay: 0,            // seconds before it starts refilling again
  rushWinded: false,           // he ran it to nothing -> the long delay
  rushDeniedT: 0,              // a dash was refused -> flash the gauge, briefly
  attackHits: null,            // (enemy,window) pairs already struck this swing
  openWindow: null,            // the hit window still open â€” see closeAttackWindow
  pendingExec: null,           // combo landed in full -> execute (drained in update)
  bufferedAttack: null, attackBufferT: 0,   // input buffer for responsiveness
  airAttackDone: false,        // an air attack already fired this jump (see updateAttackBuffer)
  /* THE RUNNING LEAP. True from a jump taken out of a rush until his feet are
   * back down. It is not cosmetic: it is what exempts him from the walking speed
   * clamp and from ground friction while he is in the air, and what keeps the
   * speed trail alive across the take-off. `leapDir` is the way he left, held
   * separately from `facing` because the trail is a record of where he HAS been
   * and he may turn his head in mid-air. See RUSH_LEAP. */
  leaping: false, leapDir: 0,
  /* Seconds left of the landing animation. COSMETIC ONLY — it decides which
   * frame is drawn and never what the stick can do, because a beat-em-up that
   * takes the controls away every time you touch the deck is a beat-em-up you
   * stop jumping in. It outranks idle and walk (or a player holding right would
   * never see a landing at all) and is outranked by everything real: a swing, a
   * hurt reaction, the guard, a rush, a carry. */
  landT: 0,
  diveT: 0,                    // seconds since the air strike committed (see AIR_STRIKE)
  diveTilt: 0,                 // radians his body is tipped into the dive, eased
  invuln: 0, hurtTimer: 0,
  react: null,                 // the hurt reaction he is playing, if any â€” it
                               // owns his frame, his sheet and his feet
  // --- the guard ---
  blocking: false,             // holding it right now
  blockPhase: 'none',          // 'raise' | 'hold' | 'drop'
  blockT: 0,                   // clock for whichever phase is running
  blockGlide: 0,               // px/s he is still sliding from a blocked blow
  guardBreak: 0,               // locked out of blocking this long (side kick)
};

let sprite = null;
let idleSprite = null;
let uppercutSprite = null;
let jumpSprite = null;
let jumpStrikeSprite = null;    // the air attack and its own descent
let combatWalkSprite = null;
let jabLeftSprite = null;
let highKickSprite = null;
let backKickSprite = null;
let comboSprite = null;
let grabSprite = null;
let grabFailSprite = null;
let contComboSprite = null;
let darkiCarrySprite = null;   // L2 pickup / carry / throw, one high-resolution take
let rushSprite = null;         // the forward-forward charge
let hitSprite = null;          // Darki's standing flinch
let hitLiftSprite = null;      // â€¦and the launch chain: off the ground,
let hitAirSprite = null;       //    tumbling,
let fallSprite = null;         //    then the crash and the get-up
let blockSprite = null;        // Darki's guard (held: raise / hold / drop)
let gingerSprite = null;
let gingerWalkSprite = null;
let gingerJabSprite = null;    // enemy punch attack (Agbero_Jab)
let gingerKickSprite = null;   // enemy side kick (Agberosidekick) â€” the long one
let gingerCarrySprite = null;  // enemy picked up, struggling, and thrown
let gingerFallSprite = null;   // enemy knocked down and getting up (survivable)
let gingerDeathSprite = null;  // enemy killed â€” the fall he does not get up from
let olodoFallSprite = null;    // BOSS: MC_Olodo knocked down and getting up
let olodoStanceSprite = null;  // BOSS: MC_Olodo's emote/combat stance
let olodoSpecialSprite = null; // BOSS: MC_Olodo's fist combo
let olodoHookSprite = null;    // BOSS: MC_Olodo's spinning hook kick
let boss = null;               // the live MC_Olodo actor, or null before his cue
let tileAtlas = null;
let buildingImgs = null;
let kitImg = null;               // Level 1 asset-kit modules { id: canvas }
let level = null;                // assembled Level 1 placements
let bg = null;                   // LEVEL 1 MVP parallax layers { sky, far, mid, street }
let buses = [];
let groundMap = null;
let props = null;
let enemies = [];
let cameraX = 0;
let cameraY = 0;               // vertical camera (stays 0 while WORLD_H == VIEW_H)
let camBias = 0.5;             // smoothed framing fraction (which way we lead)
let camLook = 0;               // smoothed predictive look-ahead (world px)
let paused = false;

/* ------------------------------------------------------ impact feedback */
// The "juice" that makes a hit read as a hit (combat-feel priority #1):
//   * hit stop â€” freeze both fighters a few frames on contact;
//   * hit sparks + shock rings â€” a starburst at the contact point;
//   * screen shake â€” a short decaying camera jolt on heavy hits;
//   * screen flash â€” a full-frame colour wash, HEAVY impacts only (see
//     `isHeavyHit`), plus the rage burst and a KO.
let hitStopTimer = 0;
let shakeTimer = 0, shakeDur = 0.16, shakeMag = 0;
let flashTimer = 0, flashDur = 0.3, flashColor = '255,255,255';
const sparks = [];
const rings = [];               // expanding shock rings
const embers = [];              // rising particles (rage aura + big hits)

/* --------------------------------------------------------------- hit SFX */
// Web-Audio one-shot hit sounds with anti-repetition + weight mixing. Every path
// is guarded so it never throws when audio is unavailable (headless tests), and
// all variation uses Math.random â€” NOT combatRng â€” so it never perturbs the
// deterministic sim. The samples (HIT1-3) are shuffled into a "bag" so no clip
// repeats back-to-back and they cycle evenly; each strike is also pitch- and
// volume-jittered, and heavy hits land lower + louder for weight.
//
// The bag holds whatever ARRIVED WITH AUDIO IN IT, which is not the same as
// whatever loaded â€” see acceptSfx. hit3.mp3 currently decodes to silence, so the
// bag deals two.
let audioCtx = null, sfxGain = null, voiceGain = null, audioMuted = false, sfxHits = 0;
const hitBuffers = [];
let hitBag = [], hitBagIdx = 0, lastHit = -1;

/* ------------------------------------------- how loud an enemy connecting is */
// Every cue that means AN ENEMY GOT ONE IN â€” Impact_hit when the blow lands, and
// the muffled version of it when the guard eats the blow â€” is multiplied by
// this before it reaches the mix. impact_hit.mp3 is a very quiet file (it peaks
// at 0.061, against 0.66 for the hit1-3 bag), which is why an enemy connecting
// was inaudible next to Darki's own fists: the cue was never mixed low, the
// SAMPLE is low.
//
// 8 is not a guess. The reference an enemy impact has to be judged against is
// the sound it sits next to all game â€” Darki's own light fist â€” and
// `_chromakey/impactloudness.js` renders both through their real node graphs and
// compares the loudest 100 ms window of each (whole-file RMS is no use here: one
// sample is 1.13 s of decay and the others are 0.2 s cracks, so averaging scores
// the long one lower for being long). At 8x a light impact lands **+2.7 dB over
// Darki's fist** and a heavy one +4.5 dB â€” clearly the heavier sound in the
// room, which is what being hit should be, without taking the room over. That is
// +21 dB on what shipped. For scale: 4x is quieter than his fist, and the 500x
// this started at was +12 dB over it â€” every impact pinning the ceiling for a
// full second, which is why it read as too much.
const ENEMY_IMPACT_BOOST = 8;
let impactBus = null;

function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    audioCtx = new AC();
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.9;
    sfxGain.connect(audioCtx.destination);
    voiceGain = audioCtx.createGain();
    voiceGain.gain.value = 1;
    voiceGain.connect(audioCtx.destination);
    // The enemy-impact bus. At the boost above it is mostly a SAFETY NET rather
    // than the sound: a light impact peaks 0.65 and a heavy one 0.76, so the
    // limiter is barely working. It stays because the boost is the one number
    // here anyone will reach for, and turning it up past ~16 without this is how
    // you get a square wave instead of a loud hit. A limiter, not a compressor:
    // no knee, a ratio steep enough to be a wall, and an attack fast enough to
    // catch the transient that starts every one of these samples.
    impactBus = audioCtx.createDynamicsCompressor();
    impactBus.threshold.value = -2;
    impactBus.knee.value = 0;
    impactBus.ratio.value = 20;
    impactBus.attack.value = 0.001;
    impactBus.release.value = 0.12;
    // â€¦and a tanh saturator behind it, because 20:1 is a steep wall and not an
    // infinite one â€” at extreme boosts the compressor alone still let the
    // leading transient out past full scale, and bending it measured both
    // cleaner AND louder than letting the sound card slice it flat. Below full
    // scale the normalised curve is very slightly expansive, which is doing real
    // work at this setting: it is worth ~2.5 dB of the level, so pulling it out
    // means re-measuring the boost, not just deleting a node.
    const shaper = audioCtx.createWaveShaper();
    const N = 4096, curve = new Float32Array(N);
    for (let i = 0; i < N; i++) curve[i] = Math.tanh((i / (N - 1)) * 2 - 1) / Math.tanh(1);
    shaper.curve = curve;
    shaper.oversample = '4x';           // no aliasing off the bend
    impactBus.connect(shaper);
    shaper.connect(sfxGain);
  } catch { audioCtx = null; }
}

// Where an enemy-impact cue lands. Falls back to the plain SFX bus if the
// compressor could not be built, and the boost still applies on that path: at 8x
// the raw signal peaks around 0.6, so there is nothing for a limiter to save it
// from. (It did NOT apply on the fallback when the boost was 500 â€” that would
// have been 30x past full scale.) Anyone winding the constant up hard should
// check this path still holds.
const impactOut = () => impactBus || sfxGain;
const impactBoost = () => ENEMY_IMPACT_BOOST;

async function loadSound(src) {
  if (!audioCtx) return null;
  try {
    const res = await fetch(new URL('../' + encodeURI(src), import.meta.url));
    return await audioCtx.decodeAudioData(await res.arrayBuffer());
  } catch { return null; }
}

/* A FILE THAT DECODED BUT CONTAINS NO AUDIO IS THE ONE FAILURE NOTHING ELSE
 * CATCHES. It has a real duration, it loads without an error, `src.start()`
 * succeeds, every counter increments â€” and the only symptom is a blow that makes
 * no sound. `sounds/hit3.mp3` is exactly that: 17 KB, 0.65 s long, peak 0.0
 * (`_chromakey/soundlevels.js`). It was one of the three clips in the hit bag,
 * which deals evenly, so ONE CONNECTING BLOW IN THREE was silent.
 *
 * It shows up as "the kick sometimes has no sound" because the kick is where a
 * missing clip has nothing to hide behind: it is a single heavy strike with one
 * hit window, so that one clip is the entire sound of the move â€” where a jab
 * arrives in a chain and the combo's first two hits carry their own `cue`
 * (punch2a/punch2b) and never draw from the bag at all.
 *
 * So the bag measures what it is given and refuses silence. Drop a real
 * recording in over hit3.mp3 and it is picked up again with no code change.
 */
const SILENT_PEAK = 1e-4;                    // below this is not "quiet", it is nothing
// A full honest scan, not a sampled one â€” these are 0.5-0.7 s clips read once at
// boot, and the whole point is to be sure about a file that LOOKS fine.
function bufferPeak(buf) {
  let peak = 0;
  if (!buf || !buf.numberOfChannels) return peak;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  }
  return peak;
}
const silentClips = [];                      // reported at boot; read by the harnesses
function acceptSfx(buf, name) {
  if (!buf) return false;
  if (bufferPeak(buf) > SILENT_PEAK) return true;
  silentClips.push(name);
  console.warn(`[sfx] ${name} decodes to silence — dropped from the hit bag`);
  return false;
}

// Browsers keep the context suspended until a user gesture â€” resume on input and
// kick off the level music (both are gated by the same autoplay policy).
function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  startMusic();
}

// Next sample from a reshuffled bag: even distribution, never the same clip twice
// in a row (even across bag boundaries).
function nextHit() {
  if (hitBagIdx >= hitBag.length) {
    hitBag = hitBuffers.map((_, i) => i);
    for (let i = hitBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [hitBag[i], hitBag[j]] = [hitBag[j], hitBag[i]];
    }
    if (hitBag.length > 1 && hitBag[0] === lastHit) [hitBag[0], hitBag[1]] = [hitBag[1], hitBag[0]];
    hitBagIdx = 0;
  }
  return (lastHit = hitBag[hitBagIdx++]);
}

// Play a strike SFX. `big` hits (uppercut / kick finisher / launchers) drop in
// pitch and rise in volume so they read heavier than a jab.
function playHit(win) {
  sfxHits++;                                  // wiring counter (increments even when silent)
  if (!audioCtx || audioMuted || !hitBuffers.length) return;
  resumeAudio();
  const buf = hitBuffers[nextHit()];
  if (!buf) return;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const big = !!(win && win.big);
  try {
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (big ? 0.9 : 1.02) * rnd(0.94, 1.06);   // pitch jitter + weight
    const g = audioCtx.createGain();
    g.gain.value = (big ? 1.0 : 0.72) * rnd(0.9, 1.05);              // volume jitter + weight
    src.connect(g); g.connect(sfxGain);
    src.start();
  } catch {}
}

// Impact_hit: the sound of Darki TAKING one. Deliberately a separate cue from
// playHit's bag rather than a fourth clip in it â€” those three are the sound of
// Darki's own fists landing, and the whole point of this one is that being hit
// does not sound like hitting. It is also a much longer, heavier sample (216KB
// against ~17KB), which is why it gets the handling below rather than the
// fire-and-forget treatment a short clip can take.
//
// ONE VOICE, and a re-trigger stops the one already playing. MC_Olodo's super
// lands 2-4 blows inside a second and his fist combo two more; letting a 1s+
// sample stack that way turns a flurry into mud and piles up gain. Cutting the
// previous instance is also the truthful reading â€” the second impact interrupts
// the first, it does not harmonise with it.
let impactBuffer = null, impactSrc = null, sfxImpacts = 0;
function playImpact(heavy = false) {
  sfxImpacts++;                                // wiring counter (counts even when silent)
  if (!audioCtx || audioMuted || !impactBuffer) return;
  resumeAudio();
  try { if (impactSrc) impactSrc.stop(); } catch {}   // already-ended sources throw
  impactSrc = null;
  const rnd = (a, b) => a + Math.random() * (b - a);  // Math.random, NOT combatRng
  try {
    const src = audioCtx.createBufferSource();
    src.buffer = impactBuffer;
    src.playbackRate.value = (heavy ? 0.92 : 1.0) * rnd(0.96, 1.04);
    const g = audioCtx.createGain();
    g.gain.value = (heavy ? 1.0 : 0.8) * rnd(0.94, 1.04) * impactBoost();
    // panned to where Darki is standing, like his taunts â€” the hit is a thing
    // happening at a place on screen, not in the middle of the mix
    let head = src;
    if (audioCtx.createStereoPanner) {
      const sp = audioCtx.createStereoPanner();
      sp.pan.value = Math.max(-1, Math.min(1, ((player.x - cameraX) / VIEW_W) * 2 - 1));
      src.connect(sp); head = sp;
    }
    head.connect(g); g.connect(impactOut());
    src.onended = () => { if (impactSrc === src) impactSrc = null; };
    impactSrc = src;
    src.start();
  } catch { impactSrc = null; }
}

// Pan a node to a world-x position: 0 â†’ hard left, VIEW_W â†’ hard right. Used by
// everything that happens somewhere on screen rather than in the middle of the
// mix. Returns the node to carry on connecting from.
function panTo(src, worldX) {
  if (worldX == null || !audioCtx.createStereoPanner) return src;
  const sp = audioCtx.createStereoPanner();
  sp.pan.value = Math.max(-1, Math.min(1, ((worldX - cameraX) / VIEW_W) * 2 - 1));
  src.connect(sp);
  return sp;
}

// A blow landing on a raised guard. No cue was shipped for this, so it is
// Impact_hit heard THROUGH a pair of forearms: the same sample, pitched down,
// pushed through a lowpass and cut short by its own envelope. Deriving it
// rather than synthesising something unrelated is the point â€” a blocked blow
// should sound like the hit it would have been, muffled, so the player can tell
// the two apart without being told.
// A blow landing on a raised guard. This USED to be Impact_hit pitched down and
// pushed through a lowpass â€” a derived cue, because no block sound had been
// shipped. ATTACKBLOCKING.mp3 is that sound, so the derivation is gone and the
// real clip plays.
//
// It goes straight to sfxGain, NOT through the enemy-impact bus. That bus exists
// to make a blow that GOT THROUGH loud (see ENEMY_IMPACT_BOOST); a blow that did
// not get through is a different event and wants its own level, not the same 8x
// slam. `heavy` still separates a boss's cross from a Ginger's jab, by weight
// and pitch rather than by filter.
let sfxBlocks = 0;
function playBlock(heavy = false) {
  sfxBlocks++;                                 // wiring counter (counts when silent)
  if (!audioCtx || audioMuted) return;
  resumeAudio();
  playCue('blockHit', player.x, heavy ? 1.15 : 0.85, heavy ? 0.92 : 1.02);
}

/* --------------------------------------------- boots, and bodies landing */
// NONE OF THESE CLIPS ARE TRIMMED, and that is the whole reason this section
// looks the way it does. Measured with `_chromakey/onsets.js`: the three
// footsteps have their transient 0.27 s, 0.13 s and 0.09 s in, and fallthud's
// slam does not start until 0.43 s. Fired the obvious way â€” start() on the frame
// the boot lands â€” the three steps would arrive at three different times, which
// the ear reads as a LIMP rather than as variety, and the thud would land half a
// second after the body did. So every cue here starts at its own measured onset:
// `start(when, offset)`, with the offset baked into the table beside the file it
// belongs to. Re-measure with onsets.js if a clip is ever replaced.
const STEP_SRCS = [
  { src: 'sounds/step1.mp3', onset: 0.257 },   // onset = measured transient âˆ’ 15 ms,
  { src: 'sounds/step2.mp3', onset: 0.117 },   // so the attack itself is never
  { src: 'sounds/step3.mp3', onset: 0.074 },   // clipped off the front
];
const THUD_ONSET = 0.43;      // fallthud: quiet scuff before this, the slam after

// The footstep mix. These are deliberately WELL under the combat sounds: up to
// four Gingers walk at once at two steps a second each, so a footstep that reads
// as "correct" on its own is a stampede in a wave. Level was chosen the same way
// the impact boost was â€” against Darki's own fist, see impactloudness.js.
const FOOT = {
  gain: 0.45,               // â‰ˆ18 dB under a landed punch
  minSpeed: 40,             // px/s: below this he is shuffling on the spot, not walking
  earshot: 1.15,            // fade to nothing this many screen-widths from the camera
};

const stepBuffers = [];       // parallel to STEP_SRCS â€” index carries the onset
let stepBag = [], stepBagIdx = 0, lastStep = -1, sfxSteps = 0;
let sfxDarkiSteps = 0;              // HIS boots only â€” see darkiFootfalls

// The anti-pattern machinery, and it is three things, not one. A bag (every clip
// used once per cycle, reshuffled, never the same clip twice in a row even
// across a bag boundary) fixes the ORDER; pitch and gain jitter fix the fact
// that the same clip twice in a minute is still recognisably the same clip. Two
// of the three would not be enough: a shuffled bag of three untouched samples
// still becomes familiar within a wave.
function nextStep() {
  if (stepBagIdx >= stepBag.length) {
    // Built from the clips that actually DECODED, not from the table: the array
    // is filled by index so a failed decode leaves a hole, and a bag built over
    // holes deals out silent turns. (hit3.mp3 is the standing proof that a
    // shipped clip can be 17 KB of nothing.)
    stepBag = [];
    for (let i = 0; i < STEP_SRCS.length; i++) if (stepBuffers[i]) stepBag.push(i);
    if (!stepBag.length) return -1;
    for (let i = stepBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));   // Math.random, NOT combatRng
      [stepBag[i], stepBag[j]] = [stepBag[j], stepBag[i]];
    }
    if (stepBag.length > 1 && stepBag[0] === lastStep) [stepBag[0], stepBag[1]] = [stepBag[1], stepBag[0]];
    stepBagIdx = 0;
  }
  return (lastStep = stepBag[stepBagIdx++]);
}

// One boot, at a place in the world. `weight` lets a shuffle be lighter than a
// stride without needing a second set of samples.
function playStep(worldX, weight = 1) {
  sfxSteps++;                                  // wiring counter (counts when silent)
  if (!audioCtx || audioMuted || !stepBuffers.length) return;
  // Out of earshot: a Ginger walking two screens away is not a sound. This is
  // the only gate â€” the pan alone would keep him hard left forever instead.
  const dist = Math.abs(worldX - (cameraX + VIEW_W / 2)) / VIEW_W;
  if (dist > FOOT.earshot) return;
  const near = 1 - Math.min(1, dist / FOOT.earshot);
  const i = nextStep();
  const buf = stepBuffers[i];
  if (!buf) return;
  const rnd = (a, b) => a + Math.random() * (b - a);
  try {
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rnd(0.92, 1.09);            // no two boots the same size
    const g = audioCtx.createGain();
    g.gain.value = FOOT.gain * weight * near * rnd(0.82, 1.12);
    panTo(src, worldX).connect(g); g.connect(sfxGain);
    // Skip the untrimmed lead-in, and stop before the tail of the NEXT step in
    // the file â€” these clips are half a second of room for a 0.1 s event.
    src.start(audioCtx.currentTime, STEP_SRCS[i].onset);
    src.stop(audioCtx.currentTime + 0.30);
  } catch {}
}

// A body hitting the tarmac. Darki's landing and a Ginger's are the same event
// and the same sample; `weight` is the only difference, because being floored
// yourself is the bigger moment and there is only ever one of you.
let thudBuffer = null, sfxThuds = 0;
function playThud(worldX, weight = 1) {
  sfxThuds++;                                  // wiring counter (counts when silent)
  if (!audioCtx || audioMuted || !thudBuffer) return;
  const dist = Math.abs(worldX - (cameraX + VIEW_W / 2)) / VIEW_W;
  if (dist > FOOT.earshot) return;
  const near = 1 - Math.min(1, dist / FOOT.earshot) * 0.6;   // never silent, just further off
  const rnd = (a, b) => a + Math.random() * (b - a);
  try {
    const src = audioCtx.createBufferSource();
    src.buffer = thudBuffer;
    src.playbackRate.value = rnd(0.95, 1.06);
    const g = audioCtx.createGain();
    g.gain.value = weight * near * rnd(0.94, 1.06);
    panTo(src, worldX).connect(g); g.connect(sfxGain);
    src.start(audioCtx.currentTime, THUD_ONSET);   // start ON the slam, not before it
  } catch {}
}

/* ------------------------------------------------- the one-shot cue table */
// Everything below this line is the same shape of sound: one clip, played once,
// at a place on screen, from an offset, at a level. Rather than write that graph
// out eight more times, it is a TABLE â€” and the table is where the measurements
// live, next to the file each one describes.
//
// `onset` is not decoration. NONE of these clips are trimmed: measured with
// `_chromakey/onsets.js`, the whiffs do not start until 0.18-0.39 s in, the
// 2-hit punch not until 0.96 s, and the death cries carry a second burst after
// 1.5 s of silence. Played from 0 they arrive late; played whole they talk over
// whatever happens next. So each carries the offset its sound actually starts at
// (measured transient minus ~15 ms so the attack survives) and, where the file
// runs on past the event, how long to let it play.
//
// `gain` equalises the pool. The four death cries peak 9 dB apart from each
// other, and a variation pool whose members differ that much does not read as
// variety, it reads as a volume bug â€” so each carries the gain that brings it to
// the same place. Levels were chosen against Darki's own fist the same way the
// impact boost was (see _chromakey/impactloudness.js).
const CUES = {
  darkiStep1:  { src: 'sounds/darki-step1.mp3',      onset: 0.072, dur: 0.26, gain: 1.60 },
  darkiStep2:  { src: 'sounds/darki-step2.mp3',      onset: 0.072, dur: 0.26, gain: 1.60 },
  whiffFistP:  { src: 'sounds/whiff-fist-darki.mp3', onset: 0.265, dur: 0.34, gain: 0.60 },
  whiffFistE:  { src: 'sounds/whiff-fist-enemy.mp3', onset: 0.180, dur: 0.26, gain: 0.60 },
  whiffKickP:  { src: 'sounds/whiff-kick-darki.mp3', onset: 0.350, dur: 0.40, gain: 0.60 },
  whiffKickE:  { src: 'sounds/whiff-kick-enemy.mp3', onset: 0.240, dur: 0.32, gain: 0.60 },
  whiffAny:    { src: 'sounds/whiff-generic.mp3',    onset: 0.265, dur: 0.28, gain: 0.45 },
  blockHit:    { src: 'sounds/block-impact.mp3',     onset: 0.045, dur: 0.20, gain: 0.60 },
  groan:       { src: 'sounds/agbero-groan.mp3',     onset: 0.210,            gain: 0.30 },
  /* THE KNOCKDOWN VOICE. One clip, every time he goes over — the user asked for
   * Agberogroan3 specifically, so this is deliberately NOT a bag. It supersedes
   * fallGroan1/fallGroan2, which were two encodes of one 0.37 s recording
   * (identical decoded: 0.985 peak, 0.2953 punch, same 0.233 s peak position) —
   * "variety" that was the same groan twice. Those files stay on disk; nothing
   * plays them.
   *
   * Copied to its own path rather than pointed at agbero-hit3.mp3, which it is
   * currently byte-identical to (MD5 f2e77a56…). Going over and taking a jab are
   * different events, and a real knockdown take dropped over this file needs no
   * code change — the same rule darkiDeath is wired by.
   *
   * onset 0.084 = measured 10% transient (0.099) − 15 ms, the standing rule.
   * gain 5.00 matches the RMS it replaces: fallGroan punched 0.2953 at gain 0.38
   * (= 0.112), this clip punches 0.0223, so 0.112 / 0.0223 ≈ 5.0. Peak lands at
   * 0.52 — playCue goes straight to sfxGain with no limiter in front of it, so
   * that headroom is the whole safety margin. See _chromakey/soundlevels.js. */
  fallGroan:   { src: 'sounds/agbero-knockdown.mp3', onset: 0.084,            gain: 5.00 },
  /* THE DEATH CRY. One clip, every death — Agberogroan1, by request, replacing
   * the four-cry bag (agbero-die1..4, which stay on disk unwired).
   *
   * Same shape as `fallGroan` above and for the same reasons: its own path so a
   * real take can be dropped in with no code change, even though it is
   * byte-identical to agbero-hit1.mp3 today (MD5 865561cd…).
   *
   * onset 0.015 = measured 10% transient (0.030) − 15 ms, the standing rule.
   * gain 5.05 is RMS-matched to what it replaces: all four old cries were
   * deliberately levelled to the same 0.143 (0.2604x0.55, 0.1493x0.95,
   * 0.1691x0.85, 0.0894x1.60 — they agree to three decimals), and this clip
   * punches 0.0282, so 0.143 / 0.0282 ≈ 5.05. Peak lands 0.58.
   *
   * NO `dur`. The four it replaces each needed one: they were a cry, then 1.5-2
   * s of silence, then a SECOND burst that would have landed long after the
   * body faded and was tallied. This file is 0.38 s of cry with no tail.
   *
   * Louder than the knockdown groan (0.143 vs 0.112 RMS) on purpose — a death
   * should carry further than a man going down and getting up.
   *
   * NOTE: this is the same recording as `agberoHit1`, so a mob member can now
   * grunt and die in one voice. That is what one-clip-per-event costs, and it
   * is why the path is its own. */
  deathCry:    { src: 'sounds/agbero-deathcry.mp3',  onset: 0.015,            gain: 5.05 },
  // ONE file, TWO impacts. 2hits_punch1 is a recording of a punch sequence, not
  // a single stinger, so the jab's two windows take one burst each â€” which is
  // exactly what "synchronise with the actual impact frames" asks for.
  punch2a:     { src: 'sounds/punch-2hit.mp3',       onset: 0.945, dur: 0.20, gain: 0.90 },
  // The finisher's own track: 5.12 s against a 5.03 s sequence, so it is played
  // ONCE at EXECUTION_START and runs the whole thing rather than being cut into
  // per-event stingers. Its handle is kept so an execution that ends early can
  // stop it â€” a 5 s track outliving the animation that cued it is the one way
  // this can go audibly wrong.
  execution:   { src: 'sounds/execution.mp3',        onset: 0.050, gain: 0.38 },
  punch2b:     { src: 'sounds/punch-2hit.mp3',       onset: 1.190, dur: 0.34, gain: 0.90 },

  /* ------------------------------------------------ the supplied vocal set
   *
   * ONSETS ARE MEASURED, NOT ZERO. Every one of these arrived untrimmed and
   * `_chromakey/onsets.js` says by how much: the three Darki groans do not
   * speak until 0.192 / 0.252 / 0.278 s in. Fired from 0 on the frame a fist
   * lands, "one" vocal set would arrive at three different times — which reads
   * as a limp, not as variety — so each entry starts at its own transient
   * minus 15 ms, the same rule the footsteps and the death cries already use.
   *
   * GAINS ARE MEASURED TOO. These files are quiet: the Agbero groans peak
   * 0.10-0.115 and the Darki ones 0.082-0.092, against the existing
   * agbero-groan.mp3 at 0.985. Left at gain 1 they would be inaudible under a
   * fight. Each gain below is what puts the clip at the loudness of the cue it
   * sits beside, not a number picked to taste — see _chromakey/soundlevels.js.
   */
  grabSuccess: { src: 'sounds/grab-success.mp3',     onset: 0.005,            gain: 1.90 },
  // 2.0 s of file, but the recording stops at ~1.62 s and the rest is digital
  // silence. `dur` cuts the dead tail, it does not shorten the performance.
  jumpAttack:  { src: 'sounds/jump-attack.mp3',      onset: 0.381, dur: 1.25, gain: 1.25 },
  agberoHit1:  { src: 'sounds/agbero-hit1.mp3',      onset: 0.015,            gain: 2.40 },
  agberoHit2:  { src: 'sounds/agbero-hit2.mp3',      onset: 0.053,            gain: 2.40 },
  agberoHit3:  { src: 'sounds/agbero-hit3.mp3',      onset: 0.084,            gain: 2.40 },
  darkiHit1:   { src: 'sounds/darki-hit1.mp3',       onset: 0.177,            gain: 3.60 },
  darkiHit2:   { src: 'sounds/darki-hit2.mp3',       onset: 0.237,            gain: 3.60 },
  darkiHit3:   { src: 'sounds/darki-hit3.mp3',       onset: 0.263,            gain: 3.60 },
  darkiRush:   { src: 'sounds/darki-rush-groan.mp3', onset: 0.065,            gain: 3.80 },
  /* THIS IS THE SAME RECORDING AS darkiRush. DarkiDeath.mp3 and
   * "DarkiRush Groan.mp3" arrived byte-identical (MD5 3659C48D…, 16704 bytes
   * each), so the two cues below currently voice one take. It is wired as its
   * own entry pointing at its own path anyway: when a real death cry is
   * exported over sounds/darki-death.mp3, nothing here changes. Until then it
   * is pitched down and played heavier so a death does not sound like a dash. */
  darkiDeath:  { src: 'sounds/darki-death.mp3',      onset: 0.065,            gain: 5.60 },
  // 5.68 s of continuous struggling — a BED, not a stinger, so it is started
  // through playCueSustained and stopped when the hold ends.
  struggle:    { src: 'sounds/enemy-struggle.wav',   onset: 0.010,            gain: 0.65 },
};
const cueBuf = {};                     // name -> decoded AudioBuffer (or missing)
let sfxCues = 0;                       // wiring counter (counts when silent)
// Per-cue counters, and they are the only way any of this is testable headless:
// "one death cry per death" and "no whiff when the punch lands" are claims about
// WHICH cue fired and HOW MANY times, and both count up even with no audio
// device attached.
const cueFired = {};

// Play one entry from the table. `at` is a world x so it lands where the thing
// happened; `weight` scales the table's own gain for callers that want the same
// cue lighter or heavier without a second entry.
function playCue(name, at = null, weight = 1, rate = null, delay = 0) {
  sfxCues++;
  cueFired[name] = (cueFired[name] ?? 0) + 1;
  const def = CUES[name];
  const buf = cueBuf[name];
  if (!def || !buf || !audioCtx || audioMuted) return false;
  const rnd = (a, b) => a + Math.random() * (b - a);   // Math.random, NOT combatRng
  try {
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate ?? rnd(0.95, 1.06);
    const g = audioCtx.createGain();
    g.gain.value = (def.gain ?? 1) * weight * rnd(0.92, 1.08);
    panTo(src, at).connect(g); g.connect(sfxGain);
    // `delay` scatters cues that would otherwise start on the same millisecond.
    // Two copies of one recording begun together do not sound like two men, they
    // sound like one man twice as loud â€” the timing spread upstream does most of
    // the work, this is the last few milliseconds of it.
    const t = audioCtx.currentTime + delay;
    src.start(t, def.onset ?? 0);
    if (def.dur) src.stop(t + def.dur);
    return true;
  } catch { return false; }
}

// Same table, but hands back the source node so a long cue can be STOPPED. The
// one-shots above are fire-and-forget because they are all under half a second;
// a five-second track that has to end when its sequence ends cannot be.
function playCueSustained(name, at = null, weight = 1, loop = false) {
  sfxCues++;
  cueFired[name] = (cueFired[name] ?? 0) + 1;
  const def = CUES[name], buf = cueBuf[name];
  if (!def || !buf || !audioCtx || audioMuted) return null;
  try {
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    /* `loop` is for BEDS — a sound that has to last as long as a state does,
     * rather than as long as the file does. Looped from the measured onset
     * rather than from 0, or every lap after the first would replay the clip's
     * leading silence and the bed would breathe on a period nobody chose. */
    if (loop) {
      src.loop = true;
      src.loopStart = def.onset ?? 0;
      src.loopEnd = buf.duration;
    }
    const g = audioCtx.createGain();
    g.gain.value = (def.gain ?? 1) * weight;
    panTo(src, at).connect(g); g.connect(sfxGain);
    src.start(audioCtx.currentTime, def.onset ?? 0);
    return src;
  } catch { return null; }
}

// A no-repeat variation pool: deal every member once per shuffled round, and
// never open a round with the clip that closed the last one. Same machinery as
// the hit bag and the footstep bag, written once now that there are five of
// them. NOTE this can only deliver the variety the FILES have â€” see the
// duplicate-clip note in the changelog.
function makeBag(names) {
  let bag = [], idx = 0, last = null;
  return () => {
    const live = names.filter((n) => cueBuf[n]);
    if (!live.length) return null;
    if (idx >= bag.length) {
      bag = live.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.length > 1 && bag[0] === last) [bag[0], bag[1]] = [bag[1], bag[0]];
      idx = 0;
    }
    return (last = bag[idx++]);
  };
}
const nextDarkiStep = makeBag(['darkiStep1', 'darkiStep2']);
/* NO FALL-GROAN AND NO DEATH-CRY BAG. Both events are ONE named clip now, by
 * request — `fallGroan` (Agberogroan3) and `deathCry` (Agberogroan1). See their
 * entries in CUES.
 *
 * What still keeps a group from sounding like one man played N times: the
 * launch scatters each body's START by FALL_VARY.vo, the rage burst queues them
 * by distance via FALL_VARY.stagger, and playCue detunes every copy 0.95-1.06.
 * That was always doing most of the work — the pools only ever varied WHICH
 * take, and in the fall groan's case both takes were the same recording. */
/* The two hit-vocal sets. A BAG rather than a fresh Math.random each time,
 * because the brief asks for "avoid always playing the same sound
 * consecutively" and independent picks cannot promise that — three samples
 * rolled independently repeat back-to-back one time in three. makeBag deals a
 * shuffled deck and additionally swaps the new deck's first card when it would
 * have matched the last one played, so an immediate repeat is impossible
 * across the seam as well as inside a deck. Every sample still plays every
 * three hits; only the order moves. */
const nextAgberoHit = makeBag(['agberoHit1', 'agberoHit2', 'agberoHit3']);
const nextDarkiHit = makeBag(['darkiHit1', 'darkiHit2', 'darkiHit3']);

/* An Agbero wears one. Called from every place a mob member takes a blow he
 * stays standing for — the ordinary hit windows and the execution's non-final
 * beats — so "he grunts when he is hit" is one statement in one function
 * rather than a rule each attack has to remember. */
function playAgberoHit(atX) {
  const clip = nextAgberoHit();
  if (clip) playCue(clip, atX);
}

/* …and Darki wears one. Called ONLY from `damagePlayer`, on a blow that got
 * through the guard and actually took HP, which is what makes it a damage
 * event rather than an animation event: a blocked blow is loud but it does not
 * hurt, and the brief asks for a vocal per confirmed hit. */
function playDarkiHit() {
  const clip = nextDarkiHit();
  if (clip) playCue(clip, player.x);
}

// EVERY enemy attack makes a sound. There is no swing sample in the project, so
// this is synthesised: a burst of noise through a bandpass that sweeps
// downward, which is roughly what a limb passing a microphone does. Generating
// it rather than shipping clips means every attacker is covered by
// construction â€” including the next enemy added â€” and `kind` is the only thing
// separating a jab from a boot from one of MC_Olodo's.
let noiseBuffer = null, sfxSwings = 0;
function swingNoise() {
  if (!audioCtx || noiseBuffer) return noiseBuffer;
  const n = Math.floor(audioCtx.sampleRate * 0.5);
  const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;   // Math.random, NOT combatRng
  return (noiseBuffer = buf);
}
const SWINGS = {                 // sweep from â†’ to (Hz) over `dur` seconds
  jab:   { dur: 0.15, from: 1800, to: 640, gain: 0.26, q: 4.5 },
  kick:  { dur: 0.24, from: 1250, to: 340, gain: 0.36, q: 5 },
  heavy: { dur: 0.30, from: 900,  to: 220, gain: 0.44, q: 6 },
};
function playSwing(kind = 'jab', atX = null) {
  sfxSwings++;                                 // wiring counter (counts when silent)
  if (!audioCtx || audioMuted) return;
  const buf = swingNoise();
  if (!buf) return;
  const S = SWINGS[kind] ?? SWINGS.jab;
  resumeAudio();
  try {
    const t = audioCtx.currentTime;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = S.q;
    bp.frequency.setValueAtTime(S.from, t);
    bp.frequency.exponentialRampToValueAtTime(S.to, t + S.dur);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);          // exponential ramps cannot touch 0
    g.gain.exponentialRampToValueAtTime(S.gain * (0.85 + Math.random() * 0.3), t + S.dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + S.dur);
    panTo(src, atX).connect(bp); bp.connect(g); g.connect(sfxGain);
    src.start(t); src.stop(t + S.dur + 0.02);
  } catch {}
}

// Darki's lines are authored gameplay events, never a random taunt bag. Keeping
// filenames and durations together makes the long Olodo handoff a real state
// transition while the short combat lines remain one-shots.
const DARKI_VOICE = Object.freeze({
  combo5:     { src: 'sounds/voices/voice-combo5.mp3', dur: 2.613, gain: 1.05 },
  grab:       { src: 'sounds/voices/voice-grab.mp3', dur: 1.428, gain: 1.08 },
  hardway:    { src: 'sounds/voices/voice-hardway.mp3', dur: 3.506, gain: 1.04 },
  reachOlodo: { src: 'sounds/voices/voice-reach-olodo.mp3', dur: 21.690, gain: 1.00 },
});
const voiceBuffers = Object.create(null);
const voicePlays = { combo5: 0, grab: 0, hardway: 0, reachOlodo: 0 };
let voicePlaying = false, voiceSource = null, queuedVoice = null, comboVoPlays = 0;
let comboVoiceSection = -1;    // keep the five-hit taunt special: once per street section

function stopDarkiVoice() {
  if (voiceSource) {
    voiceSource.onended = null;
    try { voiceSource.stop(); } catch {}
  }
  voiceSource = null;
  voicePlaying = false;
}

function playDarkiVoice(name, opt = {}) {
  const def = DARKI_VOICE[name];
  if (!def) return false;
  voicePlays[name] = (voicePlays[name] || 0) + 1;
  if (name === 'combo5') comboVoPlays++;       // compatibility/wiring counter
  if (!audioCtx || audioMuted || !voiceBuffers[name]) return false;
  if (voicePlaying && !opt.interrupt) {
    if (opt.queue) queuedVoice = { name, opt: { ...opt, queue: false } };
    return false;
  }
  if (voicePlaying) {
    queuedVoice = null;                        // an urgent authored beat supersedes a queued quip
    stopDarkiVoice();
  }
  resumeAudio();
  try {
    const src = audioCtx.createBufferSource();
    src.buffer = voiceBuffers[name];
    const g = audioCtx.createGain();
    g.gain.value = def.gain;
    let head = src;
    if (opt.pan !== false && audioCtx.createStereoPanner) {
      const sp = audioCtx.createStereoPanner();
      sp.pan.value = Math.max(-1, Math.min(1, ((player.x - cameraX) / VIEW_W) * 2 - 1));
      src.connect(sp);
      head = sp;
    }
    head.connect(g);
    g.connect(voiceGain || sfxGain);
    voiceSource = src;
    voicePlaying = true;
    src.onended = () => {
      if (voiceSource !== src) return;
      voiceSource = null;
      voicePlaying = false;
      const next = queuedVoice;
      queuedVoice = null;
      if (next) playDarkiVoice(next.name, next.opt);
    };
    src.start();
    return true;
  } catch {
    stopDarkiVoice();
    return false;
  }
}

/* --------------------------------------------------------- level music */
// The Level 1 score alternates the supplied BG1 and BG2 tracks. The previous
// The previous gameplay cue is intentionally no longer referenced.
let musicEl = null, musicVol = 0, musicStarted = false;
let musicSetting = 1;
let musicTrack = 0;
/* Shown on the pause screen. The front end owns the choice; this is the copy
 * gameplay was handed, so the two can never disagree about what was picked. */
let chosenDifficulty = 'NORMAL';

/* The one place the front end's settings cross into gameplay. Called on the way
 * into a fight AND on the way back from the pause menu's OPTIONS screen, so a
 * change made mid-fight lands immediately instead of on the next run. */
function applyGameplaySettings(difficulty, settings) {
  if (difficulty) chosenDifficulty = difficulty;
  if (!settings) return;
  const master = Math.max(0, Math.min(1, settings.master ?? 1));
  /* Only the TARGET is set here â€” updateMusic() runs every frame, paused or
   * not, and fades to it, so a volume change from the pause menu slides in
   * rather than jumping. */
  musicSetting = Math.max(0, Math.min(1, master * (settings.music ?? 1)));
  vibrationEnabled = settings.vibration !== false;
  if (!vibrationEnabled) stopControllerRumble();
  if (sfxGain) sfxGain.gain.value = 0.9 * Math.max(0, Math.min(1, master * (settings.sfx ?? 1)));
  if (voiceGain) voiceGain.gain.value = Math.max(0, Math.min(1, master * (settings.voice ?? 1)));
}
const LEVEL_MUSIC_SRCS = ['../music/bg1.mp3', '../music/bg2.mp3'];
const MUSIC_VOL = 0.5, MUSIC_FADE = 6;

function setMusicTrack(index, playNow = false) {
  if (!musicEl) return;
  musicTrack = (index + LEVEL_MUSIC_SRCS.length) % LEVEL_MUSIC_SRCS.length;
  musicEl.src = new URL(LEVEL_MUSIC_SRCS[musicTrack], import.meta.url);
  musicEl.load();
  musicEl.volume = Math.max(0, Math.min(1, musicVol));
  if (playNow) {
    const pr = musicEl.play();
    if (pr?.catch) pr.catch(() => { musicStarted = false; });
  }
}

function resetMusicPlaylist() {
  if (!musicEl) return;
  musicEl.pause();
  musicVol = 0;
  musicStarted = false;
  setMusicTrack(0, false);
}

function initMusic() {
  try {
    musicEl = new Audio();
    musicEl.loop = false;
    musicEl.preload = 'auto';
    musicEl.volume = 0;
    musicEl.addEventListener('ended', () => {
      if (!musicStarted) return;
      setMusicTrack(musicTrack + 1, true);
    });
    setMusicTrack(0, false);
  } catch { musicEl = null; }
}
function startMusic() {
  if (musicStarted || !musicEl) return;
  musicStarted = true;
  musicVol = 0.03;
  musicEl.volume = musicVol;
  const pr = musicEl.play();
  if (pr?.catch) pr.catch(() => { musicStarted = false; });
}
function updateMusic(dt) {
  if (!musicEl || !musicStarted) return;
  const target = audioMuted ? 0 : MUSIC_VOL * musicSetting;
  const rate = MUSIC_VOL / MUSIC_FADE;
  if (musicVol < target) musicVol = Math.min(target, musicVol + rate * dt);
  else if (musicVol > target) musicVol = Math.max(target, musicVol - rate * 2 * dt);
  musicEl.volume = Math.max(0, Math.min(1, musicVol));
}
// Fire the impact trio at (x,y). `hitStop`/`shake` default to the tuned values;
// callers scale them per attack weight so a jab and an uppercut feel different.
function triggerHitFx(x, y, hitStop = tune.hitStop, shake = tune.shakeMag, big = false) {
  hitStopTimer = Math.max(hitStopTimer, hitStop);
  shakeDur = 0.16;
  shakeTimer = shakeDur;
  shakeMag = Math.max(shakeMag * (shakeTimer > 0 ? 1 : 0), shake);
  sparks.push({ x, y, age: 0, dur: big ? 0.3 : 0.22, big });
  rings.push({ x, y, age: 0, dur: big ? 0.4 : 0.26, r0: big ? 20 : 10, r1: big ? 120 : 64 });
  rumbleImpact(hitStop, shake, big);
}

function triggerFlash(color, dur = 0.28) {
  flashColor = color; flashDur = dur; flashTimer = Math.max(flashTimer, dur);
}

// The full-frame flash is reserved for HEAVY impacts, so it stays an event rather
// than becoming the background hum of every exchange. `big` alone isn't the test:
// the beat-down's g5 is flagged big for its spark size at 6 damage. A heavy hit is
// a big one that also launches or lands â‰¥ HEAVY_DAMAGE â€” i.e. the launchers (hk,
// bk, c5, up), the throw and the grab finisher. Everything else still reads as a
// hit through sparks, shake, hit-stop, SFX and the sprite's own white hit flash.
const HEAVY_DAMAGE = 12;
const isHeavyHit = (w) => !!w && !!w.big && (!!w.launch || w.damage >= HEAVY_DAMAGE);

function spawnEmbers(x, y, n, color, spread = 40) {
  for (let i = 0; i < n; i++) {
    embers.push({
      x: x + (fxRng() - 0.5) * spread, y: y - fxRng() * 40,
      vx: (fxRng() - 0.5) * 60, vy: -60 - fxRng() * 120,
      age: 0, dur: 0.5 + fxRng() * 0.5, color,
    });
  }
}

// Advances even during hit-stop so sparks/shake/flash keep playing while frozen.
function advanceFx(dt) {
  /* Ages the speed trail alongside every other effect — and unconditionally, so
   * an echo cannot be stranded live by a state change that skipped endRush. */
  rushFxUpdate(dt);
  if (shakeTimer > 0) shakeTimer -= dt;
  if (flashTimer > 0) flashTimer -= dt;
  for (let i = sparks.length - 1; i >= 0; i--)
    if ((sparks[i].age += dt) >= sparks[i].dur) sparks.splice(i, 1);
  for (let i = rings.length - 1; i >= 0; i--)
    if ((rings[i].age += dt) >= rings[i].dur) rings.splice(i, 1);
  for (let i = embers.length - 1; i >= 0; i--) {
    const e = embers[i];
    e.age += dt; e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 60 * dt;
    if (e.age >= e.dur) embers.splice(i, 1);
  }
}

function shakeOffset() {
  if (shakeTimer <= 0) return { sx: 0, sy: 0 };
  const a = shakeMag * (shakeTimer / shakeDur);   // decays to 0
  return { sx: Math.sin(shakeTimer * 130) * a, sy: Math.cos(shakeTimer * 97) * a * 0.6 };
}

function drawSparks() {
  for (const r of rings) {
    const p = r.age / r.dur;
    ctx.globalAlpha = (1 - p) * 0.8;
    ctx.strokeStyle = '#fff4c2';
    ctx.lineWidth = 3 * (1 - p) + 1;
    ctx.beginPath();
    ctx.arc(r.x - cameraX, r.y, r.r0 + (r.r1 - r.r0) * p, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const e of embers) {
    const p = e.age / e.dur;
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(e.x - cameraX, e.y, (1 - p) * 4 + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const s of sparks) {
    const p = s.age / s.dur;                 // 0 â†’ 1 over its life
    const sx = s.x - cameraX, sy = s.y;
    const r = (s.big ? 14 : 8) + p * (s.big ? 44 : 26);
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, (1 - p) * (s.big ? 16 : 11), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = s.big ? '#ffbf3f' : '#ffe45e';
    ctx.lineWidth = s.big ? 4 : 3;
    const spikes = s.big ? 8 : 6;
    for (let i = 0; i < spikes; i++) {
      const ang = i * (Math.PI * 2 / spikes) + s.age * 6;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(ang) * r * 0.4, sy + Math.sin(ang) * r * 0.4);
      ctx.lineTo(sx + Math.cos(ang) * r, sy + Math.sin(ang) * r);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// Full-frame colour wash for heavy/rage impacts (drawn in screen space).
function drawFlash() {
  if (flashTimer <= 0) return;
  ctx.globalAlpha = Math.min(0.6, (flashTimer / flashDur) * 0.6);
  ctx.fillStyle = `rgb(${flashColor})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.globalAlpha = 1;
}

// Seeded so test runs stay deterministic. Wrapped in a draw counter so the
// separation below is testable rather than merely asserted: a bout in which he
// commits to nothing must consume ZERO gameplay draws, at any frame rate.
let rngDraws = 0;
const combatRngSrc = mulberry32(99);
const combatRng = () => { rngDraws++; return combatRngSrc(); };
// â€¦and COSMETICS draw from their own stream. Embers are spawned per frame (the
// rage aura, the boss's second-gear sparks), so sharing `combatRng` meant the
// number of draws before any gameplay roll depended on the frame rate â€” at 144
// fps the sequence had advanced seven times further by the same moment than at
// 20. Nothing showed it until a roll became visible (the super's lap count),
// and then the same fight produced 2 kicks at 144 fps and 4 at 20. Gameplay
// rolls are event-driven, so keeping FX off this stream is what makes them
// frame-rate independent.
const fxRng = mulberry32(1337);

function buildEnemies() {
  const rng = mulberry32(77);
  attackTokens.clear();
  const base = {
    state: 'walk', vx: 0, vy: 0, jumpY: 0, downTimer: 0,
    anim: 'walk', frame: 0, animTime: 0, facing: -1,
    bounceT: 0, bounceScale: 1,                  // the hop after he lands
    prevX: 0, prevY: 0, stepClock: 0,            // â€¦and the boots (see stepFootfalls)
    dying: false, diedVo: false,                 // killed (routes the death sheet + its cue)
    execVictim: false,                           // being finished (see EXECUTIONS)
    fallHold: 0, fallRate: 1,                    // his own fall timing (see FALL_VARY)
    // combat
    hp: ENEMY.maxHp, maxHp: ENEMY.maxHp, hpShown: ENEMY.maxHp, hpFlash: 0,
    staggerTimer: 0, koTimer: 0, alpha: 1, didHit: false, willStrike: true,
  };
  const spawns = [
    { x: 680, y: 636, direction: -1, speed: 92, kind: 'ginger', ...base },
    { x: 980, y: 682, direction: -1, speed: 116, kind: 'ginger', ...base },
    { x: 1320, y: 620, direction: -1, speed: 104, kind: 'ginger', ...base },
    { x: 1760, y: 696, direction: -1, speed: 128, kind: 'ginger', ...base },
  ];
  // per-enemy quirks so nobody moves in lockstep
  for (const [id, e] of spawns.entries()) {
    e.id = id;
    e.mode = 'patrol';                           // SoR AI state
    e.stateTimer = 0;
    e.atkCooldown = 1 + rng() * 2.5;             // asynchronous first strike
    e.side = id % 2 ? 1 : -1;                    // which side of the player it holds
    e.standoff = 150 + Math.floor(rng() * 70);   // SAFE fighting distance
    e.laneBias = -33 + id * 22;                  // distinct depth lane per enemy
    e.amble = 0.8 + rng() * 0.45;                // varied footwork speed
    e.repositionAt = 3 + rng() * 4;              // seconds until a flank swap
    e.passSide = id % 2 ? 1 : -1;                // steering tie-break
    e.passY = e.y;
    e.approachT = 0;                             // seconds spent closing on a commitment
  }
  return spawns;
}

/* --- Level 1 wave progression --------------------------------------- */
// The street is split into arena SECTIONS, each gated by an invisible wall. The
// shared enemy pool is drip-fed to meet a section's kill `quota` (concurrency
// capped at the pool size), then benched (parked off-screen in a spent 'ko'
// state) until the next wave. Clearing a wave drops the wall + shows the GO
// arrow; walking past the gate advances the section. Past the LAST gate is the
// boss arena: no quota, no drip-feed â€” walking in cues MC_Olodo's cutscene and
// then the one-on-one. The arena runs 4640â†’5480 and the camera can only reach
// WORLD_W - VIEW_W (4320), so it pins there for the whole fight: a locked
// single-screen boss room with both fighters always in shot.
const SECTIONS = [
  { gateX: 1500, quota: 4 },
  { gateX: 3050, quota: 5 },
  { gateX: 4600, quota: 6 },
  { gateX: WORLD_W, quota: 0, boss: true },
];
const BOSS_SECTION = SECTIONS.length - 1;
let section = 0;               // active section index
let waveKills = 0;             // enemies defeated so far in this section
let levelKills = 0;            // â€¦and across the whole street (never reset â€” the
                               // case file reports it)
/* 'entry' | 'fighting' | 'cleared' | 'bossIntro' | 'boss' | 'complete'
 *
 * There was an 'approach' between 'fighting' and 'cleared' that held the last
 * gate shut for the length of the Olodo narration. The line moved into the
 * entrance cutscene, which left the state with nothing to wait for. */
let waveState = 'fighting';

/* The dossier does not cut to a populated arena. Its captured frame dissolves
 * over the live, empty Lagos street; Darki walks in, then waits in combat idle
 * until the new opening narration has concluded. Only then is wave one seeded.
 *
 * IT IS FRAMED LIKE A CUTSCENE BECAUSE IT IS ONE. `duration` is the narration's
 * own length, handed over by the front end, and for all of it the input is
 * swallowed â€” so the player is holding a dead pad for nineteen seconds with
 * nothing on screen saying so. The same bars the boss entrance uses close over
 * it, and the bottom one carries the reason. */
/* ===================================================== THE CINEMATIC ENTRY
 *
 *   START -> fade to black -> the gate opens to a half frame -> the dialogue
 *   plays inside it -> the gate opens the rest of the way -> the fight.
 *
 * The whole opening is ONE NUMBER animating: a bar height. "Fade to black" is
 * that bar at VIEW_H/2, where the two halves meet and there is no picture left;
 * the "half gate" is the same bar at `gateBarH`; the street is the same bar at
 * 0. Writing the two beats as one mechanism is what makes the move between them
 * continuous — a separate black overlay handed off to a separate letterbox has
 * a frame in it where both are partly on, and that frame flickers.
 *
 * WHY THE CAMERA LIFTS. A symmetric 180px gate leaves a 360px window centred on
 * y=360, and Darki stands with his feet on GROUND_Y (620) and his head at 420 —
 * he would be entirely behind the bottom bar. That is also why the ordinary
 * cutscene bar is 92 and not more: VIEW_H - GROUND_Y is 100, so 92 is the
 * deepest bottom bar that clears his boots, and any "heavily restricted" frame
 * has to move him rather than crop him. `lift` is the shift that puts his
 * middle (520) on the window's middle (360), and it is driven off the same
 * amount as the bars so the two can never disagree — at handback both are 0 and
 * the camera is home without a cut.
 */
const LEVEL_ENTRY = Object.freeze({
  dissolve: 1.55,
  walkAt: 0.42,
  walkDur: 2.85,
  startX: -230,
  markX: 390,
  fallbackDur: 18.779,
  /* How long before the narration ends the bars start pulling back, so the
   * street is fully open on the frame control returns rather than a beat after
   * it. The eased ramp that moves them takes BAR_DUR (0.70 s) and ARRIVES, so
   * this leaves 0.05 s of margin. It was 0.75 under the old exponential damp
   * too, which only ever got within 0.2% of open in that time. */
  barsOut: 0.75,

  /* ---- the prologue, in order ---- */
  fadeOut: 0.40,      // the captured UI screen fading out, revealing the closed gate
  blackHold: 0.55,    // ...and full black until here
  gateOpen: 0.90,     // black -> half gate
  gateBarH: 180,      // = VIEW_H/4, so exactly half the frame is picture
  lift: 160,          // camera rise that centres him in that half (see above)
  /* Below this the prologue is SKIPPED outright. The test hooks start 0.4 s and
   * 6 s entries, and a 0.4 s scene that spends 1.45 s of it black would be a
   * black screen with a fight behind it. Short entries degrade to the plain
   * walk-in they have always been. */
  minCinematic: 4.0,
});
/* blackHold + gateOpen: the dialogue is held until the gate has finished
 * opening, and the entry runs this much longer than the line it carries. */
const ENTRY_LEAD = LEVEL_ENTRY.blackHold + LEVEL_ENTRY.gateOpen;

const levelEntry = { active: false, t: 0, duration: LEVEL_ENTRY.fallbackDur, frame: null,
  letterbox: 0, blackout: 0, lead: 0, voiceStarted: false };

const currentGate = () => SECTIONS[section].gateX;
const sectionLeft = () => (section === 0 ? 500 : SECTIONS[section - 1].gateX + 160);
const inBossStage = () => waveState === 'bossIntro' || waveState === 'boss';
// Only the drip-fed street mob is wave material â€” the boss is never recycled,
// benched or counted against a quota.
const mobs = () => enemies.filter((e) => !e.boss);
// A body the wave should still be COUNTING: on the street, on his feet, and not
// already on his way out. The reinforcement maths and the section hand-over both
// read this, so "still alive" means one thing in both places â€” the two of them
// disagreeing is what leaves men standing after a quota is met.
const isWaveAlive = (e) => !e.benched && !e.dying && e.hp > 0;

// Drop an enemy at world-x `x` (clamped into the arena band) at full health.
function placeEnemy(e, x) {
  const rng = combatRng;
  const lo = sectionLeft() + 60, hi = currentGate() - 70;
  e.x = Math.max(lo, Math.min(hi, x));
  e.y = clampLane(560 + rng() * 120);
  e.hp = e.maxHp; e.hpShown = e.maxHp; e.hpFlash = 0; e.alpha = 1;
  e.state = 'walk'; e.mode = 'patrol'; e.jumpY = 0; e.vx = 0; e.vy = 0;
  e.spawnEntry = false; e.spawnDelay = 0;
  e.spawnTargetX = e.x; e.spawnTargetY = e.y;
  e.koTimer = 0; e.staggerTimer = 0; e.downTimer = 0; e.didHit = false;
  e.benched = false; e.facing = -1; e.direction = -1;
  // A reused slot must not inherit the last man's landing, and prevX has to be
  // the place he now IS â€” a teleport across the arena reads as thousands of px/s
  // and would fire a footstep on his first frame back.
  e.bounceT = 0; e.bounceScale = 1; e.stepClock = 0; e.prevX = e.x; e.prevY = e.y;
  // A reused slot must not inherit the last man's death: `dying` is what routes
  // him onto the death sheet, and a live reinforcement wearing it would walk
  // around as a corpse.
  e.dying = false; e.dead = false; e.diedVo = false;
  e.fallHold = 0; e.fallRate = 1; e.execVictim = false;
  e.atkCooldown = 1 + rng() * 2.5;
  attackTokens.delete(e);
}

/* Every street enemy enters through the actual edge of the camera. The target
 * is prepared first, then the actor is moved far enough beyond the right edge
 * that even the wide sprite is invisible. AI and attacks stay disabled until
 * he has walked all the way to that target. */
function stageEnemyEntrance(e, targetX, delay = 0) {
  placeEnemy(e, targetX);
  e.spawnTargetX = e.x;
  e.spawnTargetY = e.y;
  e.spawnDelay = Math.max(0, delay);
  e.spawnEntry = true;
  e.x = Math.max(cameraX + VIEW_W + ENEMY.entryOffscreen + delay * 80, e.spawnTargetX + 260);
  e.y = e.spawnTargetY;
  e.prevX = e.x; e.prevY = e.y;
  e.vx = 0;
  e.mode = 'arrival';
  e.atkCooldown = Math.max(e.atkCooldown, 1.25 + delay);
  attackTokens.delete(e);
}

/* Hand a man off the walk-in and into the fight, wherever he happens to be
 * standing. Every way out of an entrance goes through here so none of them can
 * leave `spawnEntry` set â€” a stuck flag is a body the AI never runs. */
function endEnemyEntrance(e, grace = ENEMY.entryGrace) {
  e.spawnEntry = false;
  e.spawnDelay = 0;
  e.vx = 0;
  e.mode = 'menace';
  e.atkCooldown = Math.max(e.atkCooldown, grace);
}

/* Is this body still just walking on? Anything else â€” struck, grabbed, killed
 * before he arrived â€” outranks the staging and ends it.
 *
 * This is load-bearing, not a tidy-up. `spawnEntry` is checked BEFORE the hit
 * branch in the enemy loop, and the first thing the entrance did was write
 * `state = 'walk'` â€” so a blow landed on an arriving Agbero set him to 'hit'
 * and the entrance wiped it on the same frame. He took the damage, made the
 * noise, and kept strolling in. */
const enemyEntranceHolds = (e) => e.state === 'walk' && !e.grabbed && !e.carried && e.hp > 0;

function updateEnemyEntrance(e, dt) {
  e.state = 'walk';

  /* Waiting his turn in the stagger. He parks off the RIGHT EDGE OF THE CAMERA,
   * and the camera MOVES â€” so the park is re-applied every frame instead of
   * being set once at stage time. Staged and left, a player who walked toward
   * the gate during the stagger simply caught up with him: a man stood in plain
   * view, arms up, not reacting to anything. That is half of "they don't notice
   * me". Held with a max() so he can only ever be pushed further out. */
  if (e.spawnDelay > 0) {
    e.spawnDelay = Math.max(0, e.spawnDelay - dt);
    e.mode = 'guard';
    e.vx = 0;
    e.x = Math.max(e.x, cameraX + VIEW_W + ENEMY.entryOffscreen);
    e.prevX = e.x;                  // a park is a teleport, not travel: no footstep
    return;
  }

  e.mode = 'arrival';

  /* The target was picked from where the player STOOD when the wave was staged,
   * and he has been walking ever since. Left alone the Agbero marches to a spot
   * that is now BEHIND Darki â€” straight past him, without a glance, to stand
   * facing the wrong way. That is the other half of it. The target is pulled
   * forward so a walk-in always ends in FRONT of the player, clamped inside the
   * arena so it can never end up past the gate. */
  const ahead = Math.min(currentGate() - 70, player.x + ENEMY.entryAheadX);
  if (e.spawnTargetX < ahead) e.spawnTargetX = ahead;

  const dx = e.spawnTargetX - e.x;
  const dy = e.spawnTargetY - e.y;
  const speed = e.speed * 0.86;
  const sx = Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
  const sy = Math.sign(dy) * Math.min(Math.abs(dy), speed * 0.55 * dt);
  e.x += sx;
  e.y += sy;
  e.vx = dt > 0 ? sx / dt : 0;
  e.facing = Math.sign(dx) || -1;

  if (Math.abs(dx) <= 4 && Math.abs(dy) <= 3) {
    e.x = e.spawnTargetX;
    e.y = e.spawnTargetY;
    endEnemyEntrance(e, 0.8);
    return;
  }

  /* HE CAN SEE. Once he is actually inside the frame, a player who closes on
   * him ends the walk on the spot and hands him to the AI â€” he turns, squares
   * up and fights from where he is standing.
   *
   * Gated on being on camera because the point is that he reacts to something
   * he could plausibly have noticed; an off-screen body engaging would just be
   * the wave spawning early. `entryGrace` then holds his first swing for half a
   * second, so being noticed reads as him clocking you rather than as an ambush
   * that was waiting for the trigger. */
  const onCamera = e.x < cameraX + VIEW_W - 24;
  if (onCamera && Math.abs(player.x - e.x) < ENEMY.noticeX) {
    e.facing = Math.sign(player.x - e.x) || e.facing;
    endEnemyEntrance(e);
  }
}

// Park a spent slot off-screen until the next wave needs it.
function benchEnemy(e) {
  // Never bench a body the execution is still driving â€” that is the failure that
  // would leave Darki frozen with no victim to finish on.
  if (e.execVictim) endExecution({ killed: false });
  if (e.grabbed) releaseGrab({ drop: true });   // never bench someone mid-hold
  if (e.carried) dropCarry({ drop: true });     // â€¦of either kind
  e.benched = true; e.state = 'ko'; e.hp = 0; e.alpha = 0; e.x = -9999;
  e.spawnEntry = false; e.spawnDelay = 0;
  attackTokens.delete(e);
}

/* A man who was still standing when the gate opened FOLLOWS DARKI THROUGH IT.
 * He keeps his health, his state and his footing â€” the only thing the new
 * section changes is where he is heading, because his old mark is in an arena
 * that no longer exists. */
function carrySurvivorForward(e) {
  attackTokens.delete(e);            // his run at the old arena is void: free the turn
  e.atkCooldown = Math.max(e.atkCooldown, ENEMY.entryGrace);
  if (e.spawnEntry) {
    // Mid walk-in across the gate line: re-aim the arrival at the new band
    // rather than letting him march to a mark behind the player.
    e.spawnTargetX = Math.min(currentGate() - 70,
      Math.max(sectionLeft() + 60, player.x + ENEMY.entryAheadX));
    e.spawnTargetY = clampLane(e.spawnTargetY);
  } else if (e.state === 'walk') {
    e.mode = 'menace';               // â€¦and he comes after him
  }
}

// Populate the current section: spread up to min(quota, pool) enemies evenly
// across the arena band (ahead of the player), bench the rest.
//
// `keepAlive` is the section hand-over (see advanceSection). Without it every
// slot in the pool was re-staged, survivors included â€” so a live Agbero with
// half a bar was teleported off-camera and walked back in at full health the
// moment Darki stepped past the gate. From the player's seat the man he was
// fighting simply VANISHED. Survivors are left exactly as they are and counted
// against the new section's staffing instead, so carrying two men forward
// brings two fewer fresh ones in and the street never overfills.
function spawnWave({ keepAlive = false } = {}) {
  releaseGrab({ drop: true });        // scene transition: drop any hold first
  const pool = mobs();
  const carried = keepAlive ? pool.filter(isWaveAlive) : [];
  carried.forEach(carrySurvivorForward);
  const slots = pool.filter((e) => !carried.includes(e));
  const n = Math.min(SECTIONS[section].quota, pool.length) - carried.length;
  const lo = Math.max(sectionLeft() + 100, player.x + 270);
  const hi = Math.min(currentGate() - 180, Math.max(lo + 120, cameraX + VIEW_W - 150));
  const span = Math.max(80, hi - lo);
  slots.forEach((e, i) => {
    if (i >= n) { benchEnemy(e); return; }
    const frac = n > 1 ? i / (n - 1) : 0.4;
    const targetX = lo + span * (0.08 + 0.84 * frac) + combatRng() * 20;
    stageEnemyEntrance(e, targetX, i * 0.24);
  });
}

/* Reset and stage Level 1 without creating a separate cutscene scene. This is
 * still the actual gameplay street and actor renderer; the only scripted pieces
 * are Darki's x-position and the captured UI layer fading over it. */
function startLevelEntry(transitionFrame = null, duration = LEVEL_ENTRY.fallbackDur) {
  releaseGrab({ drop: true });
  if (player.attack) endAttack();
  /* Whatever ran before this, it is over â€” quips, the case file, the previous
   * score. THE INVARIANT LIVES HERE, not only at the level-select door: this is
   * the one function every route into a level goes through (first play, the
   * post-mission choice, the test hook), so a new route cannot forget it. */
  endMission();
  comboVoiceSection = -1;
  execution = null;
  section = 0; waveKills = 0; levelKills = 0;
  waveState = 'entry';
  enemies = enemies.filter((e) => !e.boss);
  boss = null;
  mobs().forEach(benchEnemy);
  attackTokens.clear();

  Object.assign(player, {
    x: LEVEL_ENTRY.startX, y: GROUND_Y, vx: 0, depthV: 0, jumpY: 0, vy: 0,
    facing: 1, grounded: true, state: 'normal',
    hp: player.maxHp, hpShown: player.maxHp, hpFlash: 0,
    rage: 0, rageActive: false, rageTimer: 0,
    anim: 'walk', frame: spriteFor('walk')?.anims?.walk?.frames?.[0] ?? 0,
    animTime: 0, stepClock: null, react: null, attack: null,
    pendingExec: null, bufferedAttack: null, attackBufferT: 0,
    blocking: false, blockPhase: 'none', blockT: 0, blockGlide: 0,
    // …and no landing left running from the jump he was in the middle of.
    landT: 0, airAttackDone: false, diveT: 0, diveTilt: 0,
    // …nor a running leap, which would otherwise hand the next scene a player
    // exempt from friction and from his own speed clamp.
    leaping: false, leapDir: 0,
  });
  cameraX = 0; cameraY = 0; camLook = 0; camBias = 0.5;
  fightBanner = 0;
  levelEntry.active = true;
  levelEntry.t = 0;
  const spoken = Number.isFinite(duration) && duration > 0 ? duration : LEVEL_ENTRY.fallbackDur;
  /* The prologue is added ON TOP of the line, not carved out of it: the bars
   * pull back `barsOut` before `duration` ends, so folding the lead into the
   * spoken length would start opening the gate while he was still talking. */
  levelEntry.lead = spoken >= LEVEL_ENTRY.minCinematic ? ENTRY_LEAD : 0;
  levelEntry.duration = spoken + levelEntry.lead;
  levelEntry.frame = transitionFrame;
  setBars(levelEntry, 0);                     // â€¦and close over the dissolve
  levelEntry.blackout = levelEntry.lead > 0 ? 1 : 0;   // START -> full black
  levelEntry.voiceStarted = levelEntry.lead === 0;     // no lead -> nothing to hold back
  swallowInput();
}

function finishLevelEntry() {
  levelEntry.active = false;
  levelEntry.frame = null;
  setBars(levelEntry, 0);            // nothing of the scene survives into the fight
  levelEntry.blackout = 0;
  cameraY = 0;                       // ...including the lift the gate was riding on
  player.x = LEVEL_ENTRY.markX;
  player.vx = 0;
  player.anim = 'idle';
  player.animTime = 0;
  waveState = 'fighting';
  spawnWave();
  fightBanner = 1.1;
}

function updateLevelEntry(dt) {
  swallowInput();
  mobClock += dt;
  levelEntry.t += dt;

  /* THE GATE OPENING. 1 while the screen is black, 0 once the half frame has
   * arrived, smoothstepped between. Nothing else in the entry is allowed to
   * write this — the bars, the camera lift and the dialogue cue all read it. */
  if (levelEntry.lead > 0) {
    const g = Math.max(0, Math.min(1,
      (levelEntry.t - LEVEL_ENTRY.blackHold) / LEVEL_ENTRY.gateOpen));
    levelEntry.blackout = 1 - g * g * (3 - 2 * g);
  }

  /* THE DIALOGUE, on the frame the gate finishes opening — the brief's order is
   * black, then window, THEN the line, and the recording only has 0.194 s of
   * silence at its head so it cannot simply be started early and hidden. Fired
   * once through a latch rather than on a time equality, which no variable-dt
   * loop can be trusted to hit exactly. */
  if (!levelEntry.voiceStarted && levelEntry.t >= levelEntry.lead) {
    levelEntry.voiceStarted = true;
    startIntroVoice?.();
  }

  /* The walk-in is measured from the moment the player can SEE the street, not
   * from the handover — otherwise he does his entrance behind the black. */
  const walkK = Math.max(0, Math.min(1,
    (levelEntry.t - levelEntry.lead - LEVEL_ENTRY.walkAt) / LEVEL_ENTRY.walkDur));
  const eased = walkK * walkK * (3 - 2 * walkK);
  player.x = LEVEL_ENTRY.startX + (LEVEL_ENTRY.markX - LEVEL_ENTRY.startX) * eased;
  player.y = GROUND_Y;
  player.vx = walkK > 0 && walkK < 1 ? (LEVEL_ENTRY.markX - LEVEL_ENTRY.startX) / LEVEL_ENTRY.walkDur : 0;
  player.facing = 1;
  player.anim = walkK < 1 ? 'walk' : 'idle';
  advancePlayerAnim(dt);
  cameraX = 0;
  /* Rides the bars exactly. `letterbox` is 0 at both ends of the scene, so the
   * lift arrives with the gate and is home the frame it opens — the street
   * settling back down IS the reveal, rather than a cut to a different framing. */
  cameraY = LEVEL_ENTRY.lift * levelEntry.letterbox;
  /* Bars in for the narration, out just before it ends. `outAt` is clamped at 0
   * so a SHORT entry â€” the test hooks pass 0.4 s and 6 s â€” degrades to "never
   * closed" instead of closing on a scene that is already over. */
  const outAt = Math.max(0, levelEntry.duration - LEVEL_ENTRY.barsOut);
  const barsOut = levelEntry.t >= outAt;
  rampBars(levelEntry, barsOut ? 0 : 1, dt);
  if (levelEntry.t >= levelEntry.duration) finishLevelEntry();
}

/* The gate's bar height in pixels, and the single place the two beats are
 * reconciled. MAX, not a sum or a lerp: `blackout` owns the frame while it is
 * above the hold depth and `letterbox` owns it after, and taking whichever is
 * deeper makes the handover monotone — the bars only ever retract, so there is
 * no frame where the gate dips open and closes again. */
const entryBarPx = () => Math.max(
  LEVEL_ENTRY.gateBarH * levelEntry.letterbox,
  (VIEW_H / 2) * levelEntry.blackout,
);

function drawLevelEntry() {
  const bars = entryBarPx();
  /* STEP 1, and it is a fade to BLACK rather than a dissolve to the street:
   * the gate behind this frame is fully shut for the whole of `fadeOut`, so
   * what the captured UI screen uncovers as it goes is the closed gate. The
   * old 1.55 s cross-dissolve revealed gameplay directly, which is the one
   * thing the brief says must not happen ("Do not instantly reveal gameplay").
   * Skipped entirely when there is no prologue, where the original dissolve is
   * still the right and only behaviour. */
  const fade = levelEntry.lead > 0 ? LEVEL_ENTRY.fadeOut : LEVEL_ENTRY.dissolve;
  if (levelEntry.frame && levelEntry.t < fade) {
    const u = Math.max(0, Math.min(1, levelEntry.t / fade));
    const eased = u * u * (3 - 2 * u);
    ctx.save();
    ctx.globalAlpha = 1 - eased;
    ctx.drawImage(levelEntry.frame, 0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }
  drawLetterboxPx(bars);
}

/* THE BOTTOM BAR IS EMPTY, AND DELIBERATELY.
 *
 * It used to carry a "CONTROLS DISABLED / NARRATION IN PROGRESS" caption over a
 * progress rule fed by the narration clock. The argument for it was that
 * nineteen seconds of a pad that does nothing is indistinguishable from a hang.
 * That argument was written when the entry WAS just a dead street — before the
 * prologue, the camera lift and the voiceover, which between them say
 * "cutscene" without having to print the word. What was left was a HUD notice
 * and a loading bar sitting across a cinematic, which is the one thing the
 * framing exists to keep off the screen.
 *
 * Removed rather than gated: a flag nobody sets is a second thing to reason
 * about. If a future entry does need to explain itself, the bars are still the
 * place to do it — and this is the note saying why the last one did not. */

// A wave enemy has fallen: tally it, then either drip in a reinforcement â€” walking
// in from the far (gate) side of the arena â€” or bench the slot, and flag the wave
// cleared once the quota is met.
function onEnemyDefeated(e) {
  if (e.boss) { onBossDefeated(e); return; }     // the boss is not wave material
  waveKills++;
  levelKills++;
  const sec = SECTIONS[section];
  const aliveOthers = mobs().filter((x) => x !== e && isWaveAlive(x)).length;
  if (sec.quota - waveKills > aliveOthers) {
    const targetX = Math.min(currentGate() - 180,
      Math.max(sectionLeft() + 120, player.x + VIEW_W * 0.36 + combatRng() * 180));
    stageEnemyEntrance(e, targetX, 0.12);       // reinforcements use the same visible walk-in
  }
  else benchEnemy(e);
  /* Every cleared section ends the same way â€” GO, and the gate opens. The last
   * one before the boss used to be special: it held the gate shut for the 21.7 s
   * Olodo narration and counted it down on the HUD. That line is now part of the
   * entrance cutscene (see startBossIntro), where it plays letterboxed with both
   * fighters on screen, so there is nothing left here to wait for. */
  if (waveKills >= sec.quota) waveState = 'cleared';
}

// Walk past a cleared gate â†’ next section. The last gate opens onto the boss
// arena, where the cutscene takes over instead of a wave spawning.
function advanceSection() {
  // Put down anyone he is carrying BEFORE the wave is re-staged: spawnWave's
  // keepAlive pass runs every survivor through carrySurvivorForward, which moves
  // him into the new band â€” and a man who is currently welded to Darki's hands
  // would be teleported out of them and left `carried` with nothing holding him.
  dropCarry({ drop: true });
  section++;
  waveKills = 0;
  if (SECTIONS[section].boss) { startBossIntro(); return; }
  waveState = 'fighting';
  spawnWave({ keepAlive: true });     // anyone still standing comes through the gate too
  if (section === 1) playDarkiVoice('hardway', { queue: true });
}

// How long before the down timer expires the get-up starts. 6 frames at 18 fps
// is 0.333 s, and the two numbers are ONE number: the recovery has to finish on
// the frame he is handed back to the walk cycle, or he either pops from flat to
// a stride or stands up and then waits around on the floor.
// THE KNOCKDOWN IS ONE CONTINUOUS RUN OF THE SHEET. The crash hands straight
// over to the recovery with nothing in between: 9 frames at 24 fps, then 6 at
// 18, and he is back on his feet. There is deliberately no dwell.
//
// It used to hold. `downTimer` was 1.6 s of its own while the two sections
// together are 0.71 s, so he lay on the last crash frame for up to another 1.4 s
// â€” the sheet finished and then the man just lay there, which is exactly the
// pause that reads as a stall. The timer is now DERIVED from the animation
// rather than set beside it, so the two cannot drift apart again: whatever the
// frame lists say, that is how long he is down.
const FALLDOWN_DUR = 9 / 24;      // enemy-getup frames 12-20 â€” the crash
const GETUP_DUR = 6 / 18;         // â€¦and 21-26 â€” pushing back up
const DOWN_DUR = FALLDOWN_DUR + GETUP_DUR;

// MC_Olodo's are DIFFERENT NUMBERS, and they have to be his own for the same
// reason the mob's are derived rather than chosen: his sheet's sections are 7 and
// 19 frames where the Agbero's are 9 and 6. Borrowing DOWN_DUR would hand him
// back to his stance a third of the way into a 19-frame get-up, so he would pop
// from half-risen to bobbing â€” the exact failure the note above describes, just
// on the other side.
//
// Kept as a lookup rather than two more globals: `fallTimes` is what both the
// down timer and the crash->get-up handover in `enemyAnim` read, so a body's
// animation and how long it is helpless can never disagree again.
const BOSS_FALLDOWN_DUR = 7 / 24;   // boss-olodo-fall 4-10 â€” the crash and settle
const BOSS_GETUP_DUR = 19 / 24;     // â€¦and 11-29 â€” a dazed push back onto his feet
const fallTimes = (e) => e.boss
  ? { down: BOSS_FALLDOWN_DUR + BOSS_GETUP_DUR, getUp: BOSS_GETUP_DUR }
  : { down: DOWN_DUR, getUp: GETUP_DUR };

// The corpse timings. `DEATH_HOLD` is the death sheet's grounded run (22 frames
// at 26 fps) â€” how long he is dead and fully visible before anything starts
// dissolving him. `KO_FADE` is the fade that was always there, unchanged, so the
// existing despawn-and-tally behaviour is what still ends the body's life.
const DEATH_HOLD = 22 / 26;
const KO_FADE = 1.2;

/* ============================================================ EXECUTIONS */
// A paired finisher: TWO sprite tracks that are one gameplay action. The
// controller owns the choreography; the sheets only supply frames.
//
// WHAT THE ASSETS ACTUALLY ARE (measured by _chromakey/exec_inspect.js, because
// the brief's figures were for a preview copy and did not match the files):
//
//  * 13312x6144, cell 1024x512 on a 13x12 grid â€” not 2048x945.
//  * The manifests disagree on length (Darki 151, Olodo 156) but the PIXELS
//    agree: both have art in exactly cells 0-150 and both leave 151-155 empty.
//    So there are 151 frames, not two different counts to reconcile.
//  * Cell N is the SAME INSTANT on both sheets. Checked by tracking the gap
//    between the two bodies' centres cell by cell: it closes smoothly from +284
//    to 0 as they grapple and opens to -586 as Olodo is thrown clear. A pair shot
//    on two clocks would not do that. Which means the shared timeline is ONE
//    index used by both, and sampling each sheet by `normalizedTime * itsOwnCount`
//    â€” the fallback the brief offers â€” would ADD drift here rather than remove it.
//  * The ground line is deliberately NOT constant: Darki's art sinks 364->416 as
//    he drops his weight, and Olodo's rises to 232 while airborne mid-throw. So
//    these frames must NOT be foot-anchored or padding-cropped the way every
//    other sheet in this game is â€” that would flatten the throw.
//
// Hence a separate, dumber draw path: both sheets are cropped ONCE to a shared
// window (x 0-824, y 44-420, the union of all 151 cells across both files) at
// prep time, and drawn straight from the source image with drawImage's sub-rect
// form. No keying (they ship real alpha), no cropping, no anchoring, no slicing
// into per-frame canvases â€” a sub-rect draw costs nothing and keeps both bodies
// in the exact relative positions the artist drew.
const EXEC_GRID = { cols: 13, rows: 12, frames: 151, cw: 412, ch: 188 };

// â€¦and the grid is PER PAIRING, not one constant for the system. The comment at
// the top of this block said "a new finisher needs a row in EXECUTIONS and
// nothing else", and that was not true while the sheet's shape lived out here: a
// second finisher shot on a different grid played the wrong cells of itself.
//
// Street Justice is that second finisher and it differs on every axis â€” 9x8
// against 13x12, 72 cells against 151, and a 2.35:1 cell against 2.19:1 â€” so the
// shape moved into the def and this stays only as the default the boss pairing
// already measured. `execGrid` is the one reader; nothing else may look at
// EXEC_GRID directly, or a pairing's own grid gets silently ignored again.
const EXEC_GRID_SJ = {
  cols: 9, rows: 8,
  // 69, NOT the sheet's 72. The last three cells hold the boss tumbling ALONE â€”
  // Darki has left frame by f69 (measured: ink drops from 50872 to 34760 and the
  // bbox jumps to x[622..973], one horizontal body). Playing them would vanish
  // Darki for 0.15 s and then pop him back at his end position. So the sequence
  // completes on f68, the last cell that still holds both men, with the boss
  // airborne â€” and `endLaunch` hands that airborne body to the ordinary knockdown
  // arc, which lands him on his own fall sheet. The tail cells are the artist
  // drawing what launchEnemy already does, so the real system does it instead.
  frames: 69,
  cw: 512, ch: 218,
};
const execGrid = (def) => def?.grid ?? EXEC_GRID;

// THE finisher button. One value, because the mechanic is one button: every
// checkpoint below uses it and the player never has to identify anything.
//
// 'K' is the uppercut edge â€” â–³ on a DualShock, K on the keyboard â€” and it is
// chosen over the jab's â–¡ for one reason: the jab is the button being mashed
// during ordinary combat. A finisher whose beat is the same button as the mash
// gets hit by reflex rather than by timing, and reflex is exactly what this is
// meant to interrupt. â–³ is a deliberate press. Declared up here rather than
// beside EXEC_TOKENS because the EXECUTIONS literal below is evaluated at load
// and reads it.
const EXEC_ONE_BUTTON = 'K';

// One entry per pairing. A new finisher needs a row here and nothing else â€”
// see the `victim` predicate, which is what keeps the controller generic.
const EXECUTIONS = {
  darki_olodo: {
    id: 'darki_olodo',
    attackerSrc: 'sprites/exec-darki.png',
    victimSrc: 'sprites/exec-olodo.png',
    fps: 30,                     // 151 frames -> 5.033 s
    // On-screen height of the shared window. Screen height of any body in it is
    // `srcH * drawH / 376`, the window being 824x376 before the prep's 0.5.
    //
    // This has been wrong three times, and the first two were the same mistake as
    // the third: ANCHORED TO A SINGLE EXTREME CELL rather than to a typical one.
    // The union box across all 151 cells, then frame 0 (Darki braced and crouched,
    // 188 px), then his TALLEST cell (296 px) â€” each time one frame was made to
    // measure right and the other 150 followed it wherever it went.
    //
    // Anchoring on the tallest cell is why the pair read a little small in play,
    // which is the reported symptom. Measured over the live cells (_chromakey/
    // exec_cells.json), and against the men's DRAWN combat heights â€” Darki 168,
    // MC_Olodo 188 (heightcheck.js). Note those are the pixels, not the config
    // `drawH` values: a sheet with `bodyFrame` set is rescaled by prep, and the
    // dScale* multipliers land on top, so 200 and 268 were never on-screen sizes.
    // Reading the config numbers as heights is what set this constant at 308.
    //
    //   drawH    Darki f0 / median / tallest      Olodo median / tallest
    //    260        130  /  169   /  205             180  /  224
    //    265        133  /  172   /  209             183  /  228
    //    308        154  /  200   /  242             213  /  265
    //
    // 265 lands both medians within ~2% of the men's fight heights â€” Darki 172
    // against 168, Olodo 183 against 188 â€” and the median is the cell the
    // sequence mostly shows. 308 put the pair 19% oversized at the handoff.
    //
    // That fit is a consequence of MC_Olodo coming down from drawH 268 to 235
    // (see OLODO_STANCE_SHEET). ONE SCALE COULD NOT COME NEAR BOTH MEN while the
    // boss stood 1.27x Darki in the fight and only 1.07x in this sheet (260 vs
    // 244 src on the median cells) â€” every candidate had to sell one of them
    // out, and 308 was chosen to keep the boss honest at Darki's expense. The
    // fight ratio is now 1.12x, close enough to the sheet's own that one scale
    // splits the remaining error evenly instead of dumping it on one man.
    //
    // The two tracks still cannot be scaled independently: the shared window is
    // what holds their bodies in the positions the artist drew, so separate
    // scales would pull the choreography apart.
    //
    // Darki's own cells span 188-296 src â€” a 1.57x swing from braced crouch to
    // full stretch, wider than a real body's â€” so his tallest cells still draw
    // at 209 against his usual 168. That is accepted: they are his full-stretch
    // lunge and the final upright over a thrown body, poses his ordinary attack
    // frames also exceed his stance height for. What is chosen here is WHICH
    // cell is exact, and the median is the defensible answer.
    drawH: 265,
    // Where Darki's body sits inside the window on frame 0. `anchorFrac` is his
    // centre (374 of 824 px) so the window lands on his world x; `groundFrac` is
    // his FEET (window y 320 of 376) so they land on his world y.
    //
    // The feet matter as much as the size and were the second half of the same
    // bug: the window bottom is NOT the ground line. It is 56 px below Darki's
    // frame-0 soles â€” that space belongs to Olodo, whose art goes deeper as he
    // is put on the tarmac. Anchoring the window's bottom left the pair floating
    // 60 px in the air. Anchoring Darki's frame-0 feet instead puts him exactly
    // where he was standing when the execution started, which is the whole job of
    // an anchor, and lets Olodo's late frames sit slightly below the foot line â€”
    // correct for a body lying nearer the camera.
    anchorFrac: 374 / 824,
    groundFrac: 320 / 376,
    // WHERE THE CHOREOGRAPHY LEAVES THEM. The two swap sides during the throw:
    // Olodo starts on Darki's right (centre 658 of 824) and finishes far to his
    // LEFT (110), while Darki travels from 374 to 696. The sim never knew â€” it
    // held both bodies at their entry positions â€” so the moment the execution
    // ended, the real sprites popped back to the wrong sides of each other and
    // the beaten Olodo appeared on the opposite side from where he had just been
    // thrown.
    //
    // Fixed at the END rather than by swapping the entry positions: entering
    // pre-swapped would put Darki on the far side of a man he has not grabbed
    // yet, which trades a wrong exit for a wrong entrance. These two fractions
    // are where the last frame actually leaves each man, and the sim adopts them
    // on completion so the handoff lands on the pose you were just looking at.
    endAttackerFrac: 696 / 824,
    endVictimFrac: 110 / 824,
    range: 165,                  // max gap to start one
    frontOnly: true,
    hpFrac: 0.35,                // â€¦and only on a target already this hurt
    victim: (e) => e.boss,       // this pairing is Darki vs MC_Olodo
    // THE TIMELINE, read off the contact sheets rather than the brief's example:
    // 0-45 he has him and holds; 50-85 the beat-down (Olodo doubles over by 75);
    // ~115 the big kick; 138-144 Olodo is off the ground (his art bottom rises to
    // 232); by 150 he is flat. Times are frame/fps so retiming the animation
    // retimes the events with it.
    // NO HIT-STOP IN HERE, and that is a decision the soundtrack forced.
    // ExecutionSFX.mp3 is 5.12 s against this sequence's 5.03 s â€” one track
    // authored for the whole finisher, not a stinger. But the events used to
    // carry 0.58 s of freeze between them, and a freeze stops the sim while the
    // audio keeps running: by FINAL_HIT the picture was more than half a second
    // behind the sound. You cannot have both a continuous synced track and a
    // stuttering clock. The freezes went; the shake, the flash and the per-event
    // impacts stay, and those carry the punch on their own here because the
    // animation is already doing the work a hit-stop normally has to fake.
    //
    // Damage is a FRACTION OF MAX and totals 0.26, tuned so the finisher can be
    // LANDED THREE TIMES before it takes him. FINAL_HIT does not force zero â€”
    // the execution kills only when its damage happens to empty him, which makes
    // it a big cinematic burst early and a finisher at low health.
    //
    // The arithmetic, against his 1240 hp and the combo's own 48:
    //   0.40 (the previous value) â€” 56% / 12% / DEAD: three, but the third kills.
    //   0.26 (here)               â€” 70% / 40% / 10% / dead on the fourth.
    // So all three play out with him still standing, which is what "up to three
    // times before defeating him" asks for. Raise it back toward 0.40 to make the
    // fight shorter; every number below is a share of max health, so this holds
    // whatever BOSS.hpMul is set to.
    events: [
      { f: 8,   type: 'GRAB',      sfx: 'block',  shake: 4 },
      { f: 52,  type: 'HIT_01',    dmg: 0.025, sfx: 'punch', shake: 6 },
      { f: 62,  type: 'HIT_02',    dmg: 0.025, sfx: 'punch', shake: 6 },
      { f: 72,  type: 'HIT_03',    dmg: 0.025, sfx: 'punch', shake: 7 },
      { f: 84,  type: 'KNEE',      dmg: 0.040, sfx: 'heavy', shake: 10 },
      { f: 115, type: 'KICK',      dmg: 0.055, sfx: 'heavy', shake: 13 },
      { f: 138, type: 'FINAL_HIT', dmg: 0.090, sfx: 'final', shake: 20, flash: true },
      { f: 150, type: 'COMPLETE' },
    ],
    // THE THREE INPUT CHECKPOINTS. Each one is BOUND TO AN EVENT ABOVE by name
    // rather than carrying a time of its own, and that is the whole trick to
    // keeping this honest: the checkpoint's ideal moment IS the frame the blow
    // lands on, so retiming the choreography retimes the prompts with it and the
    // two can never drift apart. Nothing here is allowed to move the animation.
    //
    // WHICH three, and why not thirds: the events table is already a reading of
    // the contact sheets, so the natural beats are there to be picked. HIT_01
    // (f52) is the first blow of the beat-down â€” the moment he stops holding him
    // and starts hitting him. KNEE (f84) is the middle heavy. KICK (f115) is the
    // last strike before the finisher, which f138 then is. Even thirds would have
    // put CP2 at f50, on top of CP1, and CP3 at f100 on nothing at all.
    //
    // `lead` is how long before the blow the prompt appears and inputs start
    // counting; `grace` is how long after it they still count. So the window is
    // lead+grace wide and the blow sits inside it, not at its edge â€” you can be
    // early or late. `perfect` is the half-width of the band around the blow that
    // grades PERFECT. `maxSpan` is the most time the sequence itself may take
    // from first press to last: without it a player could dribble three buttons
    // across the whole window and still be graded, which is the "correct buttons
    // but too slowly" case that should fail.
    //
    // The sequences get LONGER but the window does not, so the escalation is real
    // pressure rather than decoration. Tokens are resolved through EXEC_TOKENS,
    // which maps them onto the input edges the rest of the game already uses â€”
    // keyboard, mouse and pad all arrive as the same flag.
    // ONE BUTTON, ALL THREE CHECKPOINTS, AND THE ONLY SKILL IS WHEN.
    //
    // These were combinations â€” J K, then K J K, then J J K. Reported as too
    // much: "a lot of thinking when I should be enjoying the gameplay". That is
    // the correct read of it. A combination asks two questions at once, WHICH and
    // WHEN, and the WHICH is the expensive one â€” it costs a read, a decode and a
    // finger choice per press, all of it spent on a UI element instead of on the
    // five seconds of animation the mechanic exists to sell. Worse, it spent that
    // attention DURING the blows, which are the part worth watching.
    //
    // So: one press per checkpoint, the same button every time (EXEC_ONE_BUTTON),
    // and nothing to identify. The player learns one thing on their first
    // finisher and never reads again â€” after that the entire mechanic is a beat
    // to hit, and the approach ring in drawExecButton says when without a single
    // word or number on screen.
    //
    // The sequence machinery is deliberately still here (`seq` is a list, the
    // grader still walks it, `maxSpan` still bounds a multi-press run) rather
    // than being torn out for a one-token special case â€” a later pairing can ask
    // for a combination without rebuilding any of this. At length 1 `maxSpan`
    // simply never bites: there is no gap between one press and itself.
    //
    // NOTE the ceiling on `lead`. The blows are ~1.05 s apart, so one's `grace`
    // plus the next one's `lead` cannot exceed that gap or the windows collide â€”
    // see the boundary pass in execBuildCheckpoints, which resolves it in favour
    // of `grace` and records the lead each one actually got.
    checkpoints: [
      { id: 'CP1', event: 'HIT_01', seq: [EXEC_ONE_BUTTON], lead: 0.85, grace: 0.32, perfect: 0.18, maxSpan: 1.00 },
      { id: 'CP2', event: 'KNEE',   seq: [EXEC_ONE_BUTTON], lead: 0.85, grace: 0.32, perfect: 0.18, maxSpan: 1.00 },
      { id: 'CP3', event: 'KICK',   seq: [EXEC_ONE_BUTTON], lead: 0.85, grace: 0.30, perfect: 0.18, maxSpan: 1.00 },
    ],
    // ---- THE REWARD ROUND, and it is a REPLAY -----------------------------
    // A flawless run earns a SECOND PASS of the finisher's last beat: the screen
    // drops away, the sequence restarts just before the uppercut, and the
    // uppercut lands again at the end of it. Sega-arcade brutality â€” and the
    // point of it is that the payoff for perfect play is the thing the player
    // just did, shown back to them harder, rather than a number going up.
    //
    // IT IS THE SAME FRAMES, not new art and not a second execution: the same
    // 151-cell pair of sheets, resampled from `fromEvent` at a higher rate. So it
    // costs nothing to ship, it cannot desync (there is still exactly one frame
    // index â€” see execRawFrame), and retiming the choreography retimes the reward
    // round with it, exactly as it retimes the checkpoints.
    //
    // TWO THINGS IT MUST NOT DO, both of which the first cut did:
    //  * DEAL DAMAGE. The events table totals 0.26 of max health precisely so the
    //    finisher lands three times before it takes him (the arithmetic is above).
    //    A replay that re-applied KICK and FINAL_HIT paid 0.145 a second time and
    //    killed the boss on the second finisher instead of the fourth. The round
    //    is presentation only â€” see the `!bru` guard on `ev.dmg`.
    //  * REWIND `ex.t`. Half this system's invariants are "the clock is monotonic",
    //    and one of them is asserted by _chromakey/execperfverify.js. The round
    //    runs on its OWN clock (`ex.bru.t`) at its own rate while `ex.t` marches on
    //    underneath â€” the same trick, and for the same reason, as the frame hold.
    //
    // `fromEvent: 'KICK'` is "just before the uppercut" read as A BEAT rather than
    // a frame count. Opening on f138 itself would start on a fist already in
    // motion with nothing to read it against; the kick is the strike the uppercut
    // answers, so the round is kick-then-uppercut. f112 -> f150 is 1.27 s of
    // animation, 0.77 s at this rate.
    brutality: {
      onlyOn: ['PERFECT'],       // â€¦and nothing else. It has to be worth earning.
      fromEvent: 'KICK',
      preroll: 0.10,             // a beat of run-up before the kick connects
      rate: 1.65,                // "noticeably faster" â€” 39% off the clock
      fxMul: 1.7,                // shake, embers, impulse and flash, all harder
      dim: 0.56,                 // how far the whole fight image is pulled down
      fadeIn: 0.12,              // â€¦reached this fast, so it reads as a cut
      // The hit-stop on the replayed uppercut, and it is deliberately SHORTER than
      // the FINAL_PERFECT hold (0.166) it corresponds to in the first pass. The
      // hold is real time; the round's remaining 12 frames are 0.24 s of real time
      // at this rate. A 0.166 hold eats them and the round ends with the picture
      // frozen on the blow instead of on Olodo hitting the tarmac.
      holdOnHit: 0.11,
      rage: 10,                  // the only payout, through addRage like everything
      label: 'BRUTALITY',
    },
  },

  // ---------------------------------------------------------- STREET JUSTICE
  // The second finisher on MC_Olodo, and the one the MANUAL press plays. Same
  // pairing, different performance: Darki walks him down, works him in a clinch
  // and launches him off his feet.
  //
  // IT IS A COMPOSITE SHEET, which is the one structural difference from the
  // pairing above and the reason `compositeSrc` exists. Both men are baked into
  // every cell of ASSETS/NEW SPRITES/Street Justice animation Attack.png rather
  // than shot as two tracks. That makes it EASIER, not harder: the two-track
  // scale conflict documented at length on darki_olodo â€” one drawH that could not
  // serve a 1.27x boss and Darki at once â€” cannot arise, because the artist fixed
  // the relative sizes in the art. The costs are that the bodies cannot be scaled,
  // hidden or swapped independently, so there is no `bodyFrame` invisible handoff
  // available here, and no victim recoil (see drawExecution).
  //
  // THE VICTIM IS MC_OLODO, verified on the art and not on the filename by
  // _chromakey/streetjustice_ident.js. He, the Agbero mob and the getup sheet all
  // wear green trousers, a white tank and orange boots; the tell is build and
  // headwear â€” this man is the heavy-set one in the green cap, matching
  // boss-olodo-emote / -hookkick / -fall / exec-olodo, while the mob (enemy-ginger)
  // is a slim man in dreadlocks, dark jeans and sneakers. Wiring the mob's body to
  // the boss would have read as "the boss turned into a different man".
  darki_streetjustice: {
    id: 'darki_streetjustice',
    compositeSrc: 'sprites/exec-streetjustice.png',
    grid: EXEC_GRID_SJ,
    // 20fps is the analyzer export's own defaultAnimation rate, kept rather than
    // retimed: 69 cells -> 3.45 s. Shorter than the boss pairing's 5.03 s, which
    // is what forces the checkpoint count down to two (see below).
    fps: 20,
    // MEASURED, not chosen â€” _chromakey/streetjustice_prep.js, which writes the
    // numbers to streetjustice_cells.json so the verify script asserts against
    // the art instead of against figures retyped into a test.
    //
    // Anchored on the STANCE cells (f0-f2, the only ones where the two bodies do
    // not touch and can be measured apart) against the men's drawn fight heights,
    // Darki 168 and MC_Olodo 188 (heightcheck.js). Stance cells rather than the
    // median of all 69: the median here is dragged down by the clinch crouch and
    // by a horizontal airborne body, and neither of those is a height.
    //
    //   drawH   Darki on-screen        boss on-screen
    //    320      158.5  (-5.6%)        187.9  (-0.1%)
    //    330      163.5  (-2.7%)        193.8  (+3.1%)
    //    339      167.9  (-0.0%)        199.0  (+5.9%)
    //
    // 330 is the geometric mean of the two exact-fit values, which splits the
    // RELATIVE error evenly instead of making one man right at the other's
    // expense â€” the same principle darki_olodo settled on at 265, and here it
    // costs under 3.2% either way because the sheet's own 1.185 boss/Darki ratio
    // is already close to the fight's 1.12.
    drawH: 330,
    // Darki's centre x (253.5 of 1024) and his SOLES (y 339 of 436) on f0. Not
    // the window bottom: the boss's feet sit 8px below Darki's on this cell and
    // go deeper as he is put down, so anchoring the bottom would float the pair.
    anchorFrac: 253.5 / 1024,
    groundFrac: 339 / 436,
    // Where the choreography LEAVES them, read off f68 â€” the last cell holding
    // both men. They do NOT swap sides in this one (Darki 0.281, boss 0.705, same
    // order they started in), unlike darki_olodo where the throw crosses them
    // over. Still declared, because the boss travels a long way right and the sim
    // has to adopt it or he snaps back to where he was grabbed.
    endAttackerFrac: 287.5 / 1024,
    endVictimFrac: 721.5 / 1024,
    range: 165,
    frontOnly: true,
    // THE 50% GATE. Higher than darki_olodo's 0.35 deliberately: this is the
    // finisher the player is meant to MEET first, the L2 that appears over the
    // boss's head once he is visibly hurt, so it opens at half health while the
    // fight still has a way to run.
    hpFrac: 0.50,
    victim: (e) => e.boss,
    // THE TIMELINE, read off _chromakey/streetjustice_beats_*.png rather than
    // guessed from frame counts. The phases, with the ink measurements that
    // corroborate each one:
    //   f0-2    face-off, bodies apart (gap 118 -> 26px)
    //   f3-6    Darki closes and throws a straight right
    //   f7-8    the boss recoils (gap reopens to 24/38px)
    //   f9-13   a second punch, and the clinch starts
    //   f14-53  the beat-down at close quarters, touching throughout; the span
    //           tightens to x[236..589] around f19-21 as Darki works him
    //   f54-58  Darki drives him back and they part briefly
    //   f59-61  the launching blow â€” f61 carries a PAINTED IMPACT FLASH, which is
    //           why FINAL_HIT sits there and not on a frame picked by arithmetic
    //   f62-68  the boss doubled over, lifted and thrown clear, airborne by f66
    //
    // Damage totals 0.26 of max health, THE SAME as darki_olodo. That is the
    // point: the boss's time-to-kill must not depend on which finisher the player
    // happens to use, or picking the one you prefer to watch would be a
    // difficulty choice. Four finishers take him either way.
    events: [
      { f: 3,  type: 'GRAB',      sfx: 'block',  shake: 4 },
      { f: 5,  type: 'HIT_01',    dmg: 0.025, sfx: 'punch', shake: 6 },
      { f: 13, type: 'HIT_02',    dmg: 0.025, sfx: 'punch', shake: 6 },
      { f: 22, type: 'HIT_03',    dmg: 0.025, sfx: 'punch', shake: 7 },
      { f: 46, type: 'KNEE',      dmg: 0.040, sfx: 'heavy', shake: 10 },
      { f: 56, type: 'KICK',      dmg: 0.055, sfx: 'heavy', shake: 13 },
      { f: 61, type: 'FINAL_HIT', dmg: 0.090, sfx: 'final', shake: 20, flash: true },
      { f: 68, type: 'COMPLETE' },
    ],
    // TWO CHECKPOINTS, NOT THREE, and the runtime is what decides that rather
    // than a judgement about difficulty. A window is `lead` + `grace` wide â€” 1.17 s
    // at the boss pairing's values â€” so two adjacent checkpoints need at least
    // that much clear air between their blows. This sheet's heavy beats are
    // clustered in its last third (KNEE 2.30 s, KICK 2.80 s, FINAL_HIT 3.05 s):
    // any two of those are 0.5 s or less apart, and execBuildCheckpoints would
    // resolve the collision in favour of grace and hand the later one a 0.18 s
    // lead â€” a prompt that appears and is gone.
    //
    // So the two that ARE spaced: HIT_03 at f22 (1.10 s) and KICK at f56 (2.80 s),
    // 1.70 s apart, both keeping their full lead and grace. FINAL_HIT then lands
    // 0.25 s after CP2 as the UNEARNED payoff â€” hit the beat, watch the launch â€”
    // which is a better shape for a short finisher than three cramped prompts.
    //
    // Nothing else needed changing for this: `checkpoints` was always a list and
    // execFinalGrade takes the count, so PERFECT is 2 of 2 here and 3 of 3 there.
    checkpoints: [
      { id: 'CP1', event: 'HIT_03', seq: [EXEC_ONE_BUTTON], lead: 0.85, grace: 0.32, perfect: 0.18, maxSpan: 1.00 },
      { id: 'CP2', event: 'KICK',   seq: [EXEC_ONE_BUTTON], lead: 0.85, grace: 0.30, perfect: 0.18, maxSpan: 1.00 },
    ],
    // HOW A SURVIVED FINISHER HANDS BACK. darki_olodo ends with the boss flat on
    // the tarmac, so it parks him in `down` on his fall sheet. This one ends with
    // him AIRBORNE â€” f68 is a horizontal body 152px clear of Darki and still
    // rising â€” so parking him down would drop a flying man to the floor in one
    // frame. `endLaunch` instead hands that airborne body to launchEnemy, the
    // same knockdown arc every other floored enemy in the game uses, which
    // carries the travel, the bounce and the fall sheet on its own.
    //
    // This is also why the sheet's last three cells are unused (see EXEC_GRID_SJ):
    // they are the artist drawing the arc that launchEnemy already draws, and the
    // real one lands him at a real position instead of a painted one.
    endLaunch: { x: 150, y: -300 },
    // NO REWARD ROUND. `brutality` replays a stretch of the sheet from a named
    // event, and the stretch it would replay here â€” KICK f56 to the end â€” is 13
    // cells, 0.65 s, of which the last 7 are a body already in the air. The boss
    // pairing's round works because it replays a kick AND an uppercut, two blows
    // answering each other; there is only one blow in range here. Left off rather
    // than shipped thin: the round is opt-in per pairing (execStartBrutality
    // returns false with no config) and a PERFECT still pays its rage and heal
    // through applyExecRewards like any other.
  },
};

/* ------------------------------------- the interactive layer's tuning */
// EVERYTHING the performance layer does is a number in here, so the feel can be
// dialled without touching the controller. The layer's one rule, repeated in
// code below wherever it matters: IT NEVER TOUCHES THE CLOCK. `ex.t` runs
// 0 -> 5.033 whatever the player does.

// Token -> the input edge it listens on. These are the SAME flags the attack
// buffer reads, so a checkpoint press comes from J / LMB / pad-â–¡ and K / pad-â–³
// exactly as a jab and an uppercut do, and nothing needs its own key handler.
// Adding a token is one line here.
//
// `shape` is the DualShock face button, and it is not a free choice â€” it is
// whichever button already fires that flag. pollGamepad reads the standard
// Gamepad API layout, where index 2 is the left face button (â–¡) and index 3 the
// top one (â–³); the jab is on 2 and the uppercut on 3. So the prompt is naming
// the button the player would press for that move anyway, which is the whole
// reason these two tokens were chosen over an arbitrary pair.
//
// Drawn as SHAPES rather than letters (drawPadShape) in DualShock colours,
// because "â–³" set in Impact at 22px is a smudge, and a pink square is readable
// at a glance in a way a glyph is not â€” which is the difference between hitting
// the input and reading the input.
const EXEC_TOKENS = {
  J: { flag: 'leftJabPressed', key: 'J', shape: 'square',   col: '#f19ad2' },
  K: { flag: 'upperPressed',   key: 'K', shape: 'triangle', col: '#6ee7a8' },
};

const EXEC_PERF = {
  // --- grading ---
  // Score is per checkpoint, out of 100 across all three, so a full house reads
  // as a full meter. GOOD is 0.6 of a PERFECT rather than half: two GOODs and a
  // PERFECT should still look like a strong run.
  goodScore: 0.6,

  // --- the FRAME HOLD, which is this project's hit-stop ---
  // The ordinary triggerHitFx freeze CANNOT be used here. update() returns early
  // while hitStopTimer runs (see the top of update), so a freeze stops the
  // execution clock â€” and the finisher's audio is ONE 5.12 s track started at
  // EXECUTION_START, which keeps playing through it. That is the desync the
  // events table warns about at the top of this file, measured at over half a
  // second by FINAL_HIT before the freezes were removed.
  //
  // So the picture stalls and the CLOCK DOES NOT. `holdT` freezes the drawn
  // frame index; `ex.t` runs on underneath, and when the hold ends the sheet
  // resumes at the correct absolute time â€” a couple of frames further on than
  // where it stopped. You get the punch of a hit-stop, the sound never drifts,
  // and the choreography still ends on frame 150 at 5.033 s. At 30 fps these
  // durations are 2 and 3 held frames.
  hold: { MISS: 0, GOOD: 0.066, PERFECT: 0.100, FINAL_FAILED: 0, FINAL_GOOD: 0.083, FINAL_POWER: 0.116, FINAL_PERFECT: 0.166 },

  // --- impact tiers (multipliers on the event's own shake, and spark size) ---
  // NO FULL-FRAME FLASH ON A CHECKPOINT, and this is a rule the game already
  // has: see isHeavyHit â€” the screen wash is reserved for heavy impacts so it
  // stays an event rather than becoming the background hum of every exchange.
  // A finisher fires three checkpoints, and washing the screen gold on each one
  // buried both fighters under a yellow sheet three times in five seconds. The
  // PERFECT tier gets its extra weight where the blow is instead: a bigger spark,
  // twice the embers, a longer hold and a harder shove. FINAL_HIT keeps the wash
  // it already had in the events table â€” one per finisher, on the blow that ends
  // it, which is exactly what the rule is for.
  // `recoil` is THE VICTIM'S OWN reaction, and it is the one piece of feedback
  // here that is not whole-frame. Everything else on this list moves the picture:
  // the shake wobbles it, the impulse shoves it, the vignette darkens it â€” and
  // none of that is Olodo being hit harder, it is the camera being hit harder.
  // This nudges the VICTIM LAYER ALONE, away from Darki's swing, and decays back
  // to nothing inside an eighth of a second.
  //
  // KEPT SMALL ON PURPOSE, in local draw pixels. The two tracks share one window
  // precisely so their bodies stay in the positions the artist drew (see the
  // header note), so this is a recoil ON TOP of the choreography, not a second
  // opinion about where he is standing: at 9 px against a 580 px window he reads
  // as absorbing the blow, and at 40 he would visibly come off Darki's fists.
  fx: {
    MISS:    { shake: 1.00, spark: false, impulse: 0,  embers: 0,  recoil: 0 },
    GOOD:    { shake: 1.45, spark: true,  impulse: 5,  embers: 10, recoil: 5 },
    PERFECT: { shake: 1.95, spark: true,  impulse: 9,  embers: 22, recoil: 9 },
  },
  recoilDur: 0.12,
  // The third checkpoint hits harder than the first even at the same grade â€”
  // Â§28's "building momentum". Indexed by checkpoint number.
  escalation: [1.0, 1.15, 1.32],

  // --- audio tiers. Layers ON TOP of the event's own cue, never instead of it,
  // so a miss still sounds like the blow it is. ---
  audio: {
    GOOD:    { extraHit: false, thud: 0,    accent: 0.55 },
    PERFECT: { extraHit: true,  thud: 0.55, accent: 0.90 },
  },

  // --- screen-space impulse (Â§17) ---
  // A short directional shove of the whole frame, away from the blow. Deliberately
  // separate from shakeOffset: shake is a wobble, this is one push that decays.
  // No rotation, no zoom, no camera move â€” the camera is not touched at all.
  impulseDur: 0.13,

  // --- background emphasis (Â§23) ---
  vignetteDur: 0.45, vignetteMax: 0.34,

  // --- UI ---
  gradeHold: 0.55,           // how long a GOOD/PERFECT/MISS pop stays up
  finalHold: 1.6,            // â€¦and the final grade, which outlives the sequence

  // --- rewards, all through systems that already exist ---
  // Damage is a MULTIPLIER on the event's own `dmg`, never a second health
  // system, and the arithmetic below is chosen to preserve the fight's shape.
  //
  // The base table totals 0.26 of max health and the note above it explains why:
  // the finisher must land THREE times before it takes the boss. Perfect play
  // adds a 30% bonus on each graded event and 1.4x on the final blow:
  //   0.26 - 0.090 + (0.090*1.4) + 0.30*(0.025+0.040+0.055) = 0.332
  // Three perfect executions = 0.996 of his health. He survives on a visible
  // sliver and still dies on the fourth, so the shape is exactly preserved and a
  // flawless run is worth watching. A failed run scales the final blow DOWN.
  dmgBonus: { MISS: 0, GOOD: 0.15, PERFECT: 0.30 },
  finalDmgMul: { FAILED: 0.70, GOOD: 1.00, POWER: 1.20, PERFECT: 1.40 },
  // Rage through addRage, the same call every landed blow in the game makes.
  rage: { MISS: 0, GOOD: 4, PERFECT: 8 },
  finalRage: { FAILED: 0, GOOD: 6, POWER: 12, PERFECT: 20 },
  // The one reward that is not damage or meter. Small on purpose: 6 of 100 for a
  // flawless finisher is a thank-you, not a heal, and the boss fight's pressure
  // tuning does not notice it. Set to 0 to switch it off.
  finalHeal: { FAILED: 0, GOOD: 0, POWER: 0, PERFECT: 6 },
};

// Ideal moment of a checkpoint = the time the blow it is bound to lands on.
// Returns null if the binding is broken (an event renamed out from under it),
// which `startExecution` treats as "this checkpoint does not exist" rather than
// crashing an execution the player has already earned.
function execCpTime(def, cp) {
  const ev = def.events.find((e) => e.type === cp.event);
  return ev ? ev.f / def.fps : null;
}

// Build the run's checkpoint list, resolved ONCE at start rather than looked up
// per frame: a broken binding (an event renamed out from under a checkpoint) is
// dropped here instead of throwing inside the update of a finisher the player
// has already earned.
//
// THE BOUNDARY PASS is the part that matters. `lead` and `grace` are written per
// checkpoint as if each had the timeline to itself, but the blows are only ~1.05 s
// apart, so a 0.32 s grace and a 0.85 s lead overlap by 0.12 s. The overlap used
// to be absorbed silently by whichever rule fired first â€” the "next window has
// arrived" cut in updateExecCheckpoints â€” which quietly took a third of CP1's
// grace away. A player pressing slightly late on CP1 was failed by a clash
// between two config values, which is invisible from either of them.
//
// Resolved in favour of GRACE: a checkpoint keeps every millisecond of the
// window after its own blow, and the next one opens when the previous one closes.
// `leadGot` records the lead that survived, so the debug readout shows what the
// player is actually being given rather than what the table asked for.
function execBuildCheckpoints(def) {
  const cps = (def.checkpoints ?? []).map((cp, i) => {
    const at = execCpTime(def, cp);
    return at == null ? null : {
      def: cp, i, at, id: cp.id,
      opens: at - cp.lead, closes: at + cp.grace,
      state: 'idle',          // idle -> open -> done
      typed: [],              // tokens accepted so far
      firstAt: null,          // when the sequence began (for maxSpan)
      grade: null, err: null, // resolved grade and |completion - blow|
    };
  }).filter(Boolean);
  for (let i = 1; i < cps.length; i++)
    cps[i].opens = Math.max(cps[i].opens, cps[i - 1].closes);
  for (const c of cps) { c.i = cps.indexOf(c); c.leadGot = +(c.at - c.opens).toFixed(3); }
  return cps;
}

let execAttackerImg = null, execVictimImg = null;
// Composite pairings, keyed by def id â€” one sheet each, both men already in it.
// Keyed rather than another pair of globals because this is the shape a THIRD
// finisher will arrive in too, and two more `let`s per sheet does not scale.
const execCompositeImg = Object.create(null);
// Is this pairing's art in? Composite and two-track answer the same question
// about different files, and canExecute deliberately does NOT ask it â€” a finisher
// started before its sheet lands plays its timeline silently rather than throwing
// (drawExecution no-ops), exactly as the boss pairing always has.
const execArtReady = (def) => def?.compositeSrc
  ? !!execCompositeImg[def.id] : (!!execAttackerImg && !!execVictimImg);
// The live handle on the finisher track, so aborting the execution silences it.
let execSfxSrc = null;
// The whole execution lives in this one object, so "is an execution running" is a
// null check and cleanup is dropping a reference. `fired` is why every event
// happens exactly once â€” an event is applied when its FRAME IS CROSSED and its
// type is not already in the set, which makes it frame-rate independent and
// immune to a hit-stop that parks the clock on the same frame for several
// updates. Damage is never applied per frame.
let execution = null;
// The last finished (or aborted) run's scorecard, kept after the execution
// object is dropped so the outro plate, the debug readout and the tests can all
// read the same numbers rather than each keeping their own tally.
let lastExecResult = null;
// How long the final grade stays on screen AFTER the sequence hands control
// back â€” the finisher ends on a thrown body and the plate should still be there
// to be read. Counted down in update(), not in updateExecution, which by then
// no longer exists.
let execResultT = 0;

const EXEC_DUR = (def) => execGrid(def).frames / def.fps;

// Is this a legal execution target right now? Returns null when it is, otherwise
// the NAME of the first condition that failed â€” one string, one reason. A boolean
// alone cannot tell "the gate works" from "the test staged it wrong", which cost
// a full debugging pass on this very system: three cases read as wrongly-accepted
// and every one of them was the harness, not the gate. It is also what a debug
// overlay wants to print when a player mashes the button and nothing happens.
function execWhyNot(target, def = EXECUTIONS.darki_olodo, opts = {}) {
  if (execution) return 'already-executing';
  if (!target) return 'no-target';
  if (target.benched) return 'target-benched';
  if (player.state !== 'normal') return 'player-state-' + player.state;
  if (player.react) return 'player-reacting';
  if (!player.grounded) return 'player-airborne';
  // `fromCombo` is the execution CHAINING OUT of the move that triggered it. It
  // is mid-combo by definition â€” the fifth hit is what earned it â€” so this gate
  // and the health gate below are the two the combo route is exempt from.
  // Everything else still applies. startExecution calls endAttack, so the string
  // it chains out of is ended properly rather than left running.
  if (!opts.fromCombo && player.attack) return 'player-attacking-' + player.attack;
  if (player.blocking) return 'player-blocking';
  if (target.hp <= 0) return 'target-dead';
  if (target.dying) return 'target-dying';
  if (target.execVictim) return 'target-already-victim';
  if (target.state === 'hit' || target.state === 'down' || target.state === 'ko')
    return 'target-state-' + target.state;
  if (target.grabbed) return 'target-grabbed';
  if (target.carried) return 'target-carried';
  if (!def.victim(target)) return 'wrong-pairing';
  // The health gate is how the MANUAL press is earned. The combo route earns it
  // differently â€” by landing all five hits â€” so it passes ignoreHp and this is
  // skipped. Without that, "every complete combo" would silently mean "every
  // complete combo once he is already under 35%".
  if (!opts.fromCombo && target.hp > target.maxHp * def.hpFrac) return 'target-too-healthy';
  const dx = target.x - player.x;
  // THE FIFTH HIT CONNECTING *IS* THE RANGE CHECK, so the combo route does not
  // repeat it. `range` exists to stop a manual press reaching a man Darki is
  // nowhere near; a chain has already proved contact with this specific body,
  // which is stronger evidence of proximity than any threshold.
  //
  // It is exempt because the gate was rejecting strings that had landed all five
  // hits, BY ONE PIXEL. The combo's own knockback carries the boss outward as it
  // lands, so by c5 he sits right on the boundary â€” measured over five natural
  // strings, the two complete ones finished at gaps of 158 and 166 against a
  // range of 165. One chained, one did not. That made the flagship route a coin
  // flip on the last pixel of the move that earns it, and it presents as "the
  // finisher only sometimes works", which is unreadable to a player.
  // Same reasoning as the health and mid-move exemptions above: the combo earns
  // this differently, so it is not asked the manual route's question.
  if (!opts.fromCombo && Math.abs(dx) > def.range) return 'out-of-range';
  if (Math.abs(target.y - player.y) > 60) return 'wrong-lane';
  if (def.frontOnly && dx * player.facing < 0) return 'behind-player';
  return null;
}
const canExecute = (target, def = EXECUTIONS.darki_olodo, opts = {}) =>
  execWhyNot(target, def, opts) === null;

// Deterministic pick: in front, then nearest. No RNG, so a given arrangement of
// bodies always chooses the same man.
function execTarget(def = EXECUTIONS.darki_olodo) {
  let best = null, bestDx = Infinity;
  for (const e of enemies) {
    if (!canExecute(e, def)) continue;
    const dx = Math.abs(e.x - player.x);
    if (dx < bestDx) { best = e; bestDx = dx; }
  }
  return best;
}

// WHICH FINISHER THE L2 PRESS PLAYS, now that two of them pair Darki with the
// boss. Split BY ROUTE rather than by health band:
//
//   the manual press  -> Street Justice, from 50% health down
//   the 5-hit combo   -> darki_olodo, the pairing it has always chained into
//
// A health band was the alternative â€” Street Justice from 50% to 35%, darki_olodo
// below â€” and it was rejected because the band is 15% of 1240hp, about 186 points,
// which a player can cross in one combo without ever seeing the prompt appear.
// Splitting by route gives each finisher a whole route it owns, so both are
// reachable on purpose rather than by catching a window.
//
// The combo chain is deliberately NOT re-pointed: it is hp-exempt (landing all
// five hits is how it earns the finisher, see execWhyNot) and darki_olodo's whole
// design â€” three graded checkpoints across 5.03 s, and the brutality replay for a
// flawless run â€” is the payoff for the harder route. Street Justice is the
// shorter, two-checkpoint one you can ask for.
//
// ORDER IS PRIORITY, and darki_olodo staying in the list is the fallback that
// matters: if Street Justice is ever ineligible where the boss pairing is not,
// the press still finds a finisher instead of doing nothing.
const EXEC_MANUAL_ORDER = ['darki_streetjustice', 'darki_olodo'];

// Resolved in ONE place so the prompt and the press can never disagree about
// which finisher is on offer â€” the bug that would present as "L2 appeared over
// his head and then played something else".
function execManualPick() {
  for (const id of EXEC_MANUAL_ORDER) {
    const def = EXECUTIONS[id];
    if (!def) continue;
    const target = execTarget(def);
    if (target) return { def, target };
  }
  return null;
}

function startExecution(target, def = EXECUTIONS.darki_olodo, opts = {}) {
  if (!canExecute(target, def, opts)) return false;
  endAttack();                                  // never carry a swing or a hold in
  endBlock();
  // Save what we are borrowing, so a failure at any point can hand it all back.
  execution = {
    def, victim: target, t: 0, fired: new Set(), lastFrame: -1,
    // For the drain: the health he walked in with, the running total taken off it,
    // and which event is allowed to show a zero. The last DAMAGE event is found
    // from the table rather than named FINAL_HIT, so retuning the events cannot
    // leave the reveal pinned to an event that no longer carries the last blow.
    victimHp0: target.hp, dmgFrac: 0,
    lastDmgType: def.events.filter((e) => e.dmg).slice(-1)[0]?.type ?? null,
    saved: {
      pState: player.state, pAnim: player.anim,
      eState: target.state, eMode: target.mode, eAnim: target.anim,
      eX: target.x, eY: target.y, eJumpY: target.jumpY,
      eFacing: target.facing, eActive: target.active,
    },
    // The anchor is a POSITION, not a parent: both tracks are drawn relative to
    // it and neither character is attached to the other, so nothing has to be
    // un-parented on cleanup.
    anchorX: player.x, anchorY: player.y, facing: player.facing,

    // --- the performance layer, rebuilt per execution so nothing carries over ---
    // Every checkpoint is resolved from the def at START, not looked up per
    // frame: a broken binding (an event renamed) is dropped here, once, instead
    // of throwing inside the update of a finisher the player has already earned.
    cps: execBuildCheckpoints(def),
    perf: { perfect: 0, good: 0, miss: 0, score: 0, chain: 0 },
    // Presentation state, all decaying timers. None of it can touch `t`.
    holdT: 0, holdFrame: 0,
    gradeText: null, gradeT: 0, gradeTier: null,
    finalGrade: null, finalT: 0,
    // The reward round (see `brutality` on the def). Null for the whole first
    // pass; an object with its own clock once a flawless run has earned one, and
    // "is the replay running" is that null check everywhere below.
    bru: null,
    // What endExecution hands back to the rest of the game.
    result: null,
  };
  execSfxSrc = playCueSustained('execution', player.x);   // one track, whole sequence
  player.state = 'exec';        // `locked` in updatePlayer keys off this, which
  player.vx = 0;                // suspends movement, jump, attack, block and grab
  player.jumpY = 0;             // through the gate that already exists
  player.anim = 'idle';
  target.execVictim = true;     // â€¦and this suspends his AI and makes him unhittable
  target.vx = 0; target.vy = 0; target.jumpY = 0;
  target.facing = -player.facing;
  attackTokens.delete(target);
  return true;
}

// Hand everything back. Called on completion, on abort, and defensively from the
// failure paths â€” it is safe to call twice.
function endExecution({ killed = false } = {}) {
  if (!execution) return;
  const { victim, saved, def, anchorX, facing } = execution;
  // The scorecard, taken before the reference is dropped. An ABORTED execution
  // (the victim benched out from under it, a scene change) never reached
  // FINAL_HIT, so it has no final grade and pays nothing â€” `completed` is what
  // the HUD and the tests read to tell the two apart.
  lastExecResult = {
    id: def.id,
    completed: !!execution.finalGrade,
    grade: execution.finalGrade,
    score: Math.round(execution.perf.score),
    perfect: execution.perf.perfect, good: execution.perf.good, miss: execution.perf.miss,
    checkpoints: execution.cps.map((c) => ({ id: c.id, grade: c.grade, err: c.err == null ? null : +c.err.toFixed(3) })),
    // Whether the run earned its second pass (see `brutality`). Reported rather
    // than inferred from the grade: the round can be switched off or re-gated in
    // config, and a test that asserts "a PERFECT replays" should be reading what
    // happened, not re-deriving the rule it is checking.
    brutality: !!execution.bru,
    killed,
  };
  execResultT = lastExecResult.completed ? EXEC_PERF.finalHold : 0;
  // Hand the WORLD the positions the animation finished on, before anything else
  // reads them â€” the kill below launches the victim from where he is standing,
  // and that has to be where he was just thrown, not where he was grabbed.
  // Mirrored with `facing` so it works from either side.
  const winPx = def.drawH * (execGrid(def).cw / execGrid(def).ch);
  const off = (frac) => facing * (frac - def.anchorFrac) * winPx;
  if (def.endAttackerFrac != null) {
    player.x = anchorX + off(def.endAttackerFrac);
    clampPlayerToArena();
  }
  if (victim && def.endVictimFrac != null) victim.x = anchorX + off(def.endVictimFrac);
  // â€¦and they are looking at each other, on the sides they ended up on.
  if (victim) {
    const dir = Math.sign(victim.x - player.x) || facing;
    player.facing = dir;
    victim.facing = -dir;
  }
  execution = null;
  // Presentation state dies with the sequence too â€” an impulse or a vignette
  // outliving the finisher would push the frame around during ordinary combat.
  execImpulseT = 0; execVignette = 0; execRecoilT = 0; execRecoil = 0;
  // Nothing the player pressed AT the finisher may spill out as a move the
  // instant control returns (Â§34 Test 8). The checkpoint reader clears its own
  // tokens every frame; this catches whatever arrived on the last one.
  input.leftJabPressed = input.upperPressed = input.kickPressed = false;
  input.comboPressed = input.grabPressed = input.executePressed = false;
  player.bufferedAttack = null;
  // Kill the track with the sequence. Without this an abort leaves five seconds
  // of finisher music playing over ordinary combat.
  try { if (execSfxSrc) execSfxSrc.stop(); } catch {}
  execSfxSrc = null;
  player.state = 'normal';
  player.anim = 'idle';
  player.frame = idleSprite.anims.idle.frames[0];
  player.animTime = 0;
  if (victim) {
    victim.execVictim = false;
    if (killed) {
      // Route the kill through the EXISTING death path rather than a second one:
      // launchEnemy sets `dying`, which is what puts him on the death sheet and
      // fires the death cry, and the landing hands him to the normal ko fade and
      // wave tally. Nothing about death bookkeeping is duplicated here.
      victim.hp = 0;
      const away = Math.sign(victim.x - player.x) || player.facing || 1;
      launchEnemy(victim, { x: 180, y: -330 }, away, 0, true);
    } else {
      // A SURVIVED FINISHER HANDS HIM TO THE FALL SHEET, NOT BACK TO THE FIGHT.
      // The choreography's last cell leaves him FLAT ON THE TARMAC â€” that is what
      // `endVictimFrac` 110/824 is measuring â€” and restoring `saved.eState` put a
      // man who is lying down straight back into his walk cycle on the next frame.
      // He stood up out of nothing, in one frame, from a pose the game then
      // discarded. There was no art to land on before; OLODO_FALL_SHEET is that
      // art, so the finisher now ends where it looks like it ends: he stays down,
      // the crash section holds him there, and he pushes himself back up through
      // `getUp` on his own timer.
      //
      // This is the only place the execution reaches into the knockdown system,
      // and it does it by setting the SAME state a launch would â€” no second code
      // path, no PlayFallAnimation() that only the finisher can call. The router
      // picks the section, `bossFalling` switches the rotation off, and the down
      // timer is the one every other knockdown uses.
      const canFall = victim.boss ? !!olodoFallSprite : !!gingerFallSprite;
      // A pairing that ends with the victim IN THE AIR hands him to the ordinary
      // knockdown arc instead of parking him on the floor â€” see `endLaunch` on
      // darki_streetjustice. Zero damage: the events table has already dealt
      // everything this finisher deals, and launchEnemy's `dmg` argument would be
      // a second, untabled subtraction on top of it.
      if (def.endLaunch) {
        const away = Math.sign(victim.x - player.x) || player.facing || 1;
        launchEnemy(victim, def.endLaunch, away, 0, false);
        // launchEnemy ends by forcing `menace`, which is the mob's approach mode.
        // The boss drives his own kit off `idle`, so he is put back on it here â€”
        // the same correction the fall branch below makes, for the same reason.
        if (victim.boss) victim.mode = 'idle';
      } else if (canFall) {
        victim.state = 'down';
        victim.downTimer = fallTimes(victim).down / (victim.fallRate || 1);
        victim.jumpY = 0; victim.bounceT = 0;
        // No bounce: he is ALREADY on the road at the end of the sequence. The
        // bounce is a landing impulse, and playing one here would lift a body that
        // never left the ground.
        victim.bounceScale = 0;
        victim.mode = victim.boss ? 'idle' : 'menace';
        playThud(victim.x, 0.9);
      } else {
        victim.state = saved.eState === 'ko' ? 'walk' : saved.eState;
        victim.mode = saved.eMode ?? 'menace';
      }
      // NOT saved.eFacing â€” that is where he was looking when he was GRABBED,
      // and he has been thrown to the other side of Darki since. The facing set
      // above, from where the choreography actually left the two of them, is the
      // one that matches the last frame drawn.
    }
  }
}

/* ============================ the performance layer ============================
 * Three checkpoints, a grade each, and feedback that escalates. Read the rule at
 * the top of EXEC_PERF before changing anything in here: NOTHING BELOW MAY TOUCH
 * `ex.t`, pause it, rewind it, or resynchronise the two sheets. The clock runs
 * 0 -> 5.033 whatever the player does. The layer only observes it, reads input,
 * and turns the result into presentation.
 *
 * The pieces, kept apart on purpose (Â§37) even though they live in one file
 * because this whole game is one file:
 *   execReadTokens / updateExecCheckpoints  â€” input windows and sequences
 *   gradeExecCheckpoint                     â€” GOOD / PERFECT / MISS
 *   execCheckpointFeedback                  â€” hold, FX, audio, impulse, UI
 *   execFinalGrade / applyExecRewards       â€” result and payout
 * The controller (updateExecution) calls the first and the last; the middle two
 * are called from there and nowhere else.
 */

// Which tokens were pressed this frame, taken off the SAME edge flags the attack
// buffer uses. Consumed here â€” cleared whether or not a checkpoint wants them â€”
// because the player is in `exec` state, so updatePlayer's locked branch would
// drop them a moment later anyway. Clearing them here as well is what stops a
// press made during the finisher from spilling out as a jab the instant control
// comes back (Â§34 Test 8).
function execReadTokens() {
  const hit = [];
  for (const tok in EXEC_TOKENS) {
    const flag = EXEC_TOKENS[tok].flag;
    if (input[flag]) { hit.push(tok); input[flag] = false; }
  }
  // A press on any OTHER attack button is a wrong button, not a free pass: it is
  // reported so a checkpoint that is open can fail on it (Â§34 Test 5).
  let wrong = false;
  for (const f of ['kickPressed', 'comboPressed', 'grabPressed']) {
    if (input[f]) { wrong = true; input[f] = false; }
  }
  input.executePressed = false;         // no re-entry from inside a finisher
  return { hit, wrong };
}

// GOOD / PERFECT off the completion time. MISS never arrives here â€” it is
// decided by the window closing or by a wrong press, both of which are failures
// of the sequence rather than of its timing.
function gradeExecCheckpoint(cp, at) {
  const err = Math.abs(at - cp.at);
  return { grade: err <= cp.def.perfect ? 'PERFECT' : 'GOOD', err };
}

// Open, feed and close the three windows. One pass per frame, and it is the only
// thing in the system that reads input.
//
// EXACTLY ONE CHECKPOINT IS EVER LIVE. That is not a simplification, it is a
// correctness requirement: the generous windows genuinely overlap on the timings
// above â€” CP1 stays open until 2.03 s and CP2 opens at 1.95 â€” and a press inside
// the overlap would otherwise be fed to BOTH, advancing one sequence while
// failing the other off the same button. So the first not-yet-resolved
// checkpoint owns the input, and a later one arriving at its own `opens` time
// closes the previous one out as a MISS rather than sharing the frame with it.
// Keeping this rule here rather than by hand-tuning `lead`/`grace` until they
// stop touching means the times can be retuned freely and the ambiguity cannot
// come back.
function updateExecCheckpoints(ex) {
  const { hit, wrong } = execReadTokens();
  const cp = ex.cps.find((c) => c.state !== 'done');
  if (!cp) return;
  // The next one's window has arrived: this one's turn is over however it stood.
  const next = ex.cps[cp.i + 1];
  if (next && ex.t >= next.opens && cp.state !== 'done') {
    resolveExecCheckpoint(ex, cp, 'MISS');
    return;                                  // next frame belongs to `next`
  }
  if (cp.state === 'idle') {
    if (ex.t < cp.opens) return;
    cp.state = 'open';
  }
  // --- the window is open ---
  // Wrong button: fail immediately. Deliberate, and what makes the sequences
  // worth learning â€” a mash of everything cannot pass.
  if (wrong) { resolveExecCheckpoint(ex, cp, 'MISS'); return; }
  for (const tok of hit) {
    const want = cp.def.seq[cp.typed.length];
    if (tok !== want) { resolveExecCheckpoint(ex, cp, 'MISS'); return; }
    if (cp.typed.length === 0) cp.firstAt = ex.t;
    cp.typed.push(tok);
    // Dribbled across the window rather than played: correct buttons, too slow.
    if (ex.t - cp.firstAt > cp.def.maxSpan) { resolveExecCheckpoint(ex, cp, 'MISS'); return; }
    if (cp.typed.length === cp.def.seq.length) {
      const { grade, err } = gradeExecCheckpoint(cp, ex.t);
      cp.err = err;
      resolveExecCheckpoint(ex, cp, grade);
      return;
    }
  }
  // Window closed with the sequence unfinished.
  if (ex.t > cp.closes) resolveExecCheckpoint(ex, cp, 'MISS');
}

// Book the grade and fire everything the player sees and hears. Note what is NOT
// here: no animation call, no state change on either character, no touch of the
// clock. A MISS is booked exactly the same way a PERFECT is â€” it just buys less.
function resolveExecCheckpoint(ex, cp, grade) {
  cp.state = 'done';
  cp.grade = grade;
  const p = ex.perf;
  if (grade === 'PERFECT') { p.perfect++; p.chain++; }
  else if (grade === 'GOOD') { p.good++; p.chain++; }
  else { p.miss++; p.chain = 0; }
  const per = 100 / Math.max(1, ex.cps.length);
  p.score = Math.min(100, p.score
    + (grade === 'PERFECT' ? per : grade === 'GOOD' ? per * EXEC_PERF.goodScore : 0));

  // The UI pop is immediate either way â€” an input has to answer on the frame it
  // was made or it feels dropped. The IMPACT feedback waits for the blow if the
  // blow has not landed yet; see the pendingFx note in the event loop.
  ex.gradeText = grade === 'MISS' ? 'MISS'
    : (p.chain > 1 ? `${grade} Ã—${p.chain}` : grade);
  ex.gradeTier = grade;
  ex.gradeT = EXEC_PERF.gradeHold;
  if (grade === 'MISS') return;                    // the blow still lands, on its own terms
  if (ex.fired.has(cp.def.event)) execCheckpointFeedback(ex, cp, grade);
  else cp.pendingFx = true;
}

// The feedback tiers. Everything here rides existing systems â€” triggerHitFx,
// spawnEmbers, playHit, playCue, playThud â€” at graded strengths. The one thing
// it does NOT use is triggerHitFx's hit-stop argument: see the frame-hold note
// in EXEC_PERF. Nor triggerFlash: see the no-full-frame-flash note there too.
function execCheckpointFeedback(ex, cp, grade) {
  const P = EXEC_PERF;
  const esc = P.escalation[Math.min(P.escalation.length - 1, cp.i)] ?? 1;
  const at = ex.anchorX + ex.facing * 40, atY = ex.anchorY - 110;
  const fx = P.fx[grade];
  if (!fx || grade === 'MISS') return;
  // The frame hold IS the hit-stop here. Clock untouched.
  execHold(ex, P.hold[grade] * esc);
  // Shake and sparks through the ordinary impact call, hit-stop argument ZERO.
  triggerHitFx(at, atY, 0, fx.shake * 8 * esc, grade === 'PERFECT');
  if (fx.embers) spawnEmbers(at, atY + 40, Math.round(fx.embers * esc), '#ffd45a', 110);
  execImpulse(ex, fx.impulse * esc);
  execVictimRecoil(fx.recoil * esc);
  execEmphasis(ex, grade === 'PERFECT' ? 1 : 0.6);

  const a = P.audio[grade];
  if (a.extraHit) playHit({ big: true });
  if (a.thud) playThud(ex.anchorX, a.thud * esc);
  if (a.accent) playCue('blockHit', at, a.accent * esc, 1.35 + 0.12 * cp.i);
}

// The frame hold â€” this game's hit-stop. Freezes the DRAWN frame; `ex.t` runs on
// underneath and the sheet resumes at the correct absolute time. Never stacks
// past the longest request, so three grades in a row cannot compound into a
// visible stall.
function execHold(ex, dur) {
  if (!(dur > 0)) return;
  // execRawFrame, not execFrame: during a hold that is already running, execFrame
  // returns the FROZEN index, so re-holding off it would pin the picture to the
  // older frame and the two holds would compound into a visible stall.
  ex.holdFrame = execRawFrame();
  ex.holdT = Math.max(ex.holdT, dur);
}

// One short directional shove of the whole frame, away from the blow, decaying
// to nothing. Not the camera: `cameraX` is not read or written here, so the
// locked boss-room framing is exactly as locked as it was.
let execImpulseX = 0, execImpulseY = 0, execImpulseT = 0, execImpulseDur = 0.13;
function execImpulse(ex, mag) {
  if (!(mag > 0)) return;
  execImpulseX = -ex.facing * mag;      // the pair is struck away from Darki's swing
  execImpulseY = -mag * 0.35;
  execImpulseDur = EXEC_PERF.impulseDur;
  execImpulseT = execImpulseDur;
}
function execImpulseOffset() {
  if (execImpulseT <= 0) return { x: 0, y: 0 };
  // Out fast, back slow: a shove, not a wobble.
  const k = execImpulseT / execImpulseDur;
  const e = k * k;
  return { x: execImpulseX * e, y: execImpulseY * e };
}

// THE VICTIM'S REACTION (Â§12B), and the only thing in this system that moves one
// of the two bodies rather than the whole frame. A graded blow shoves the victim
// layer away from Darki's swing and it settles straight back.
//
// Expressed in LOCAL draw pixels and applied inside drawExecution's mirror, so
// "away" is away from whichever side he is being hit from, with no per-facing
// arithmetic here. It is added to the victim's draw offset only â€” the attacker
// never moves, and neither does the shared window, so the choreography is intact
// the instant the recoil decays. That is what keeps it a reaction rather than a
// second opinion about where the two men are standing.
let execRecoil = 0, execRecoilT = 0;
function execVictimRecoil(mag) {
  if (!(mag > 0)) return;
  execRecoil = Math.max(execRecoil, mag);
  execRecoilT = EXEC_PERF.recoilDur;
}
function execVictimRecoilOffset() {
  if (execRecoilT <= 0) return { x: 0, y: 0 };
  // Snap out, ease back â€” a body absorbing a blow, not a body bouncing.
  const k = execRecoilT / EXEC_PERF.recoilDur;
  const e = k * k;
  return { x: execRecoil * e, y: -execRecoil * 0.3 * e };
}

// Background emphasis (Â§23): a vignette that closes briefly around the pair. No
// camera move, no perspective change, nothing animated in the art behind them.
let execVignette = 0;
function execEmphasis(ex, weight) {
  execVignette = Math.max(execVignette, EXEC_PERF.vignetteMax * weight);
}

// The final grade comes from the COUNTS, never from health (Â§25). A boss who
// walked in nearly dead must not read as a better performance than one who did
// not, and health is the one number in the sequence the player did not choose.
function execFinalGrade(perf, n) {
  if (n <= 0) return 'GOOD';                        // no checkpoints defined at all
  const landed = perf.perfect + perf.good;
  if (perf.perfect === n) return 'PERFECT';
  if (landed >= 2) return 'POWER';
  if (landed === 1) return 'GOOD';
  return 'FAILED';
}

// Payout, through the systems that already exist: the enemy health the events
// table drains, addRage, and the player's own hp. No new progression, no second
// currency. Damage is handled at the event (see FINAL_HIT below) â€” this is
// everything else.
function applyExecRewards(ex, grade) {
  const P = EXEC_PERF;
  const rage = P.finalRage[grade] ?? 0;
  if (rage) addRage(rage);
  const heal = P.finalHeal[grade] ?? 0;
  if (heal) player.hp = Math.min(player.maxHp, player.hp + heal);
}

// One shared clock, sampled by both tracks. This is the whole synchronisation
// story: there is no second timer and no per-sheet playback, so the two cannot
// drift by construction.
function updateExecution(dt) {
  const ex = execution;
  const def = ex.def;
  ex.t += dt;
  // The reward round's clock, and the ONLY thing in this system that runs at a
  // rate other than 1 â€” which is what makes the replay faster than the
  // performance it is replaying. `ex.t` above is untouched by it and stays
  // monotonic through the whole thing.
  if (ex.bru) ex.bru.t += dt * ex.bru.rate;
  // Presentation timers run on the same dt but are read by NOBODY that advances
  // the sequence. The hold in particular is a display-only value.
  if (ex.holdT > 0) ex.holdT = Math.max(0, ex.holdT - dt);
  if (ex.gradeT > 0) ex.gradeT = Math.max(0, ex.gradeT - dt);
  if (ex.finalT > 0) ex.finalT = Math.max(0, ex.finalT - dt);
  if (execImpulseT > 0) execImpulseT = Math.max(0, execImpulseT - dt);
  if (execRecoilT > 0) execRecoilT = Math.max(0, execRecoilT - dt);
  if (execVignette > 0) execVignette = Math.max(0, execVignette - dt * (EXEC_PERF.vignetteMax / EXEC_PERF.vignetteDur));
  updateExecCheckpoints(ex);           // reads ex.t; never writes it
  updateExecButton(ex, dt);            // the prompt's damped chase of Olodo's head
  const frame = Math.min(execGrid(def).frames - 1, Math.floor(execClock(ex) * def.fps));
  // The reward round hits harder than the run it is replaying, and it is ONE
  // multiplier doing it â€” shake, flash, embers and impulse. Nothing about the
  // choreography, the grading or the damage differs; see the `brutality` note.
  const bru = ex.bru, bmul = bru ? bru.fxMul : 1;

  // Fire every event whose frame we have CROSSED since the last update.
  for (const ev of def.events) {
    if (ex.fired.has(ev.type)) continue;
    if (frame < ev.f) continue;
    ex.fired.add(ev.type);
    if (ev.type === 'COMPLETE') continue;            // handled below, after the clock
    const at = ex.anchorX + ex.facing * 40;
    // THE GRADE MODULATES THE BLOW, and this is where the whole design lands:
    // the event is the same event at the same frame either way, it just arrives
    // with more or less behind it.
    //
    // A checkpoint can resolve EITHER SIDE of the blow it is bound to â€” the
    // window opens 0.85 s early and stays open 0.3 s late â€” so the impact
    // feedback fires at whichever comes second. Played early, the grade is
    // waiting when the blow lands and the punch arrives ON it; played late, the
    // blow has already gone and the punch arrives on the input instead. Firing
    // it at resolution in both cases would put a PERFECT's spark a third of a
    // second before the fist connects; firing it at the event in both cases
    // would silently rob every late-but-valid input. `pendingFx` is which of the
    // two has not happened yet.
    const cpFor = ex.cps.find((c) => c.def.event === ev.type);
    if (cpFor && cpFor.pendingFx && cpFor.grade) {
      cpFor.pendingFx = false;
      execCheckpointFeedback(ex, cpFor, cpFor.grade);
    }
    const isFinal = ev.type === ex.lastDmgType;
    // `cps.length` gates the whole result step, so a pairing defined WITHOUT
    // checkpoints behaves exactly as this system did before the interactive
    // layer existed: no grade, no plate, no payout, base damage. The layer is
    // opt-in per ExecutionDefinition rather than something every future finisher
    // has to carry.
    if (isFinal && !ex.finalGrade && ex.cps.length) {
      // Resolved HERE rather than at the end of the clock: the final blow is the
      // one the player is watching, so its presentation has to know the result
      // twelve frames before the sequence stops. endExecution reads the same
      // value rather than recomputing it.
      ex.finalGrade = execFinalGrade(ex.perf, ex.cps.length);
      ex.finalT = EXEC_PERF.finalHold;
      applyExecRewards(ex, ex.finalGrade);
      execHold(ex, EXEC_PERF.hold['FINAL_' + ex.finalGrade] ?? 0);
      execImpulse(ex, ex.finalGrade === 'PERFECT' ? 14 : ex.finalGrade === 'POWER' ? 10 : ex.finalGrade === 'GOOD' ? 6 : 0);
      // The uppercut takes him off his feet, so it gets the biggest recoil of the
      // sequence â€” scaled by the run's grade like everything else on this blow.
      execVictimRecoil(ex.finalGrade === 'PERFECT' ? 15 : ex.finalGrade === 'POWER' ? 11
        : ex.finalGrade === 'GOOD' ? 7 : 4);
      execEmphasis(ex, ex.finalGrade === 'PERFECT' ? 1.2 : 0.8);
      if (ex.finalGrade === 'PERFECT') {
        spawnEmbers(at, ex.anchorY - 70, 34, '#ffd45a', 150);
        playHit({ big: true });
        playCue('blockHit', at, 1.0, 1.5);
      }
    }
    // The event's OWN shake is left alone for the graded blows: the checkpoint's
    // feedback already fired its own triggerHitFx, and shakeMag takes the larger
    // of the two, so the grade shows through without either being multiplied
    // twice. Only the final blow is scaled here, because it has no checkpoint of
    // its own to speak for it.
    const shakeMul = isFinal
      ? ({ FAILED: 0.85, GOOD: 1.0, POWER: 1.25, PERFECT: 1.55 }[ex.finalGrade] ?? 1) : 1;
    if (ev.hitstop || ev.shake) triggerHitFx(at, ex.anchorY - 110, ev.hitstop ?? 0, (ev.shake ?? 0) * shakeMul * bmul, !!ev.flash || !!bru);
    if (ev.flash) triggerFlash('255,255,255', 0.16 * (isFinal && ex.finalGrade === 'PERFECT' ? 1.6 : 1) * (bru ? 1.5 : 1));
    // Damage, once per event, through the existing enemy health â€” no second
    // health system.
    // â€¦and NEVER on the reward round, which replays these same events. See the
    // `brutality` note: paying KICK and FINAL_HIT twice took 0.145 extra off the
    // boss per flawless finisher and killed him on the second one.
    if (ev.dmg && ex.victim && !bru) {
      // THE INTERMEDIATE HITS LEAVE A SLIVER; the last one takes it. Measured on
      // a boss entering the finisher at 5% health, the first two hits alone zeroed
      // him and the bar sat empty through the beat-down, the knee, the kick and
      // the final blow. That is harmless to the sim â€” he cannot die before
      // completion, `execVictim` suspends his AI, and the death path only runs at
      // the end â€” but it throws away the one piece of feedback the sequence has,
      // and it lands on the KILLING execution, the one time the player is watching
      // the bar. Now it drains across the choreography and empties on the last
      // blow whatever health he walked in with.
      //
      // Tracked as a running total against the health he STARTED with, rather
      // than by subtracting from the clamped value â€” clamping in place would make
      // the sliver absorb the overflow and turn a lethal sequence into a survived
      // one. `dmgFrac` is the damage the table says was dealt; `hp` is only how it
      // is shown until the last event, which reveals it.
      //
      // THE GRADE SCALES IT, and only here â€” there is still exactly one damage
      // path. A graded blow carries a bonus share of its own damage; the final
      // blow is multiplied by the run's grade. The totals are worked out against
      // the fight's shape in EXEC_PERF.dmgBonus, and the short version is that a
      // flawless finisher takes 0.332 of his health against a base 0.26, so
      // three of them still leave him alive on a sliver exactly as before.
      const bonus = cpFor?.grade ? (EXEC_PERF.dmgBonus[cpFor.grade] ?? 0) : 0;
      const mul = isFinal ? (EXEC_PERF.finalDmgMul[ex.finalGrade] ?? 1) : 1;
      ex.dmgFrac += ev.dmg * (1 + bonus) * mul;
      const trueHp = ex.victimHp0 - ex.victim.maxHp * ex.dmgFrac;
      ex.victim.hp = ev.type === ex.lastDmgType
        ? Math.max(0, trueHp)               // the reveal: dead here or not at all
        : Math.max(1, trueHp);              // â€¦a sliver until then
      ex.victim.hpFlash = 0.25;
    }
    // Audio through the existing cue table / hit bag â€” nothing hard-coded here.
    if (ev.sfx === 'punch') playHit({ big: false });
    else if (ev.sfx === 'heavy') playHit({ big: true });
    else if (ev.sfx === 'final') { playHit({ big: true }); playThud(ex.anchorX, 1); }
    else if (ev.sfx === 'block') playCue('blockHit', at, 0.7);
    if (ev.type !== 'COMPLETE' && ex.victim && !ex.victim.boss) playAgberoHit(ex.victim.x);
    // The reward round's own weight, layered ON TOP of the event's ordinary cue
    // rather than instead of it â€” the same rule EXEC_PERF.audio follows. A
    // doubled impact and a crack pitched up half an octave read as harder hitting
    // without a single new asset, and the replayed uppercut gets the embers, the
    // shove and the hold as well.
    if (bru && ev.sfx) {
      playHit({ big: true });
      playCue('blockHit', at, 0.85, 1.55);
      if (isFinal) {
        playThud(ex.anchorX, 1.2);
        spawnEmbers(at, ex.anchorY - 70, Math.round(38 * bmul), '#ffd45a', 170);
        execImpulse(ex, 13 * bmul);
        execVictimRecoil(15 * bmul);
        execEmphasis(ex, 1.3);
        execHold(ex, bru.hold);
      }
    }
  }

  // Lethal only if the sequence actually emptied him â€” see the events table.
  //
  // A flawless run buys a second pass of the last beat before control comes back,
  // so the end check asks WHICHEVER CLOCK IS RUNNING. `execStartBrutality` returns
  // false when there is no round to play (no config, wrong grade, binding gone),
  // which is what keeps this reading as "hand it back unless there is more".
  if (bru) {
    if (bru.t >= EXEC_DUR(def)) endExecution({ killed: (ex.victim?.hp ?? 0) <= 0 });
  } else if (ex.t >= EXEC_DUR(def) && !execStartBrutality(ex)) {
    endExecution({ killed: (ex.victim?.hp ?? 0) <= 0 });
  }
}

/* ------------------------------------------- the reward round (brutality) */
// Enter it, or decline to. Returns whether one started, so the caller's
// end-of-sequence branch reads as "hand control back unless there is a second
// pass to play". A pairing with no `brutality` block ends exactly as it always
// did â€” the round is opt-in per ExecutionDefinition, like the checkpoints.
function execStartBrutality(ex) {
  const B = ex.def.brutality;
  if (!B || ex.bru || !ex.cps.length) return false;
  if (!(B.onlyOn ?? ['PERFECT']).includes(ex.finalGrade)) return false;
  const ev = ex.def.events.find((e) => e.type === B.fromEvent);
  if (!ev) return false;                    // binding renamed out from under it
  const from = Math.max(0, ev.f / ex.def.fps - (B.preroll ?? 0));
  // UN-FIRE every event from the restart point on. `fired` is the whole reason an
  // event happens exactly once, so without this the replay would run over its own
  // beats in silence: the frames would move and nothing would land.
  for (const e of ex.def.events) if (e.f / ex.def.fps >= from) ex.fired.delete(e.type);
  ex.bru = {
    t: from, from,
    rate: B.rate ?? 1.6, fxMul: B.fxMul ?? 1.6,
    dim: B.dim ?? 0.55, fadeIn: B.fadeIn ?? 0.12, hold: B.holdOnHit ?? 0.11,
    label: B.label ?? 'BRUTALITY',
  };
  // The picture has to MOVE on the first frame of the round: the hold from the
  // blow that just ended the first pass would otherwise open it on a frozen cell.
  ex.holdT = 0;
  // â€¦and whatever the grade pop was still saying about the run that just
  // finished, the round has its own label now.
  ex.gradeT = 0; ex.gradeText = null;
  if (B.rage) addRage(B.rage);
  // One hard cut into it â€” the frame is shoved, the vignette closes and a cue
  // pitched DOWN sells the lights going out. Three calls a graded blow already
  // makes; no new systems for the entrance.
  execImpulse(ex, 8);
  execEmphasis(ex, 1.2);
  playCue('blockHit', ex.anchorX, 1.0, 0.72);
  return true;
}

/* --------------------------------------- "you can finish him" on screen */
// The finisher was unreachable in practice even once it had a button: it is only
// legal on one man, in a window, at a health you cannot see precisely â€” so a
// player had no way to know it was ON except by mashing L2 through the whole
// fight. This is the missing half of the mechanic.
//
// Recomputed once per frame rather than per draw call: `execTarget` early-outs
// hard (the first check is "already executing"), and the mob is five bodies, so
// this costs nothing â€” but computing it inside drawEnemy would run it once per
// enemy per frame for no reason.
let execPromptTarget = null;
// â€¦and the pairing that target was found FOR, so the press cannot resolve a
// different finisher than the prompt was offering.
let execPromptDef = null;
// Which glyph to print. A pad player should be told L2, not E. `padSeen` is set
// by the poll the moment a controller reports in, so the prompt follows whatever
// is actually in the player's hands.
let padSeen = false;

function updateExecPrompt() {
  const pick = execution ? null : execManualPick();
  execPromptTarget = pick ? pick.target : null;
  // Which finisher the prompt is offering, kept for the debug readout and the
  // tests. The glyph on screen is the same L2 either way â€” the player is told a
  // button, not a move name.
  execPromptDef = pick ? pick.def : null;
}

// Drawn over the target's head, where this game already puts the attack
// telegraph, so "look at this man" is a language the player has already learnt.
// Flashes on the same shared clock as that chevron.
function drawExecPrompt(enemy, screenX, headY) {
  if (enemy !== execPromptTarget) return;
  const on = Math.floor(mobClock * 6) % 2 === 0;      // slower than the danger
  const label = padSeen ? 'L2' : 'E';                 // â€¦flash, so it reads as an
  ctx.save();                                          // invitation, not a warning
  const w = 54, h = 26, x = screenX - w / 2, y = headY - h - 12;
  // A soft pulse under it even on the off-beat, so the badge never fully
  // disappears and the eye can settle on it.
  const pulse = 0.5 + 0.5 * Math.sin(mobClock * 7);
  ctx.globalAlpha = on ? 1 : 0.55;
  ctx.fillStyle = `rgba(255,210,63,${0.25 + pulse * 0.35})`;
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = '#111';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#ffd23f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = display(700, 15);
  ctx.fillText(label, screenX, y + h / 2 + 1);
  ctx.font = display(700, 11);
  ctx.fillText('EXECUTE', screenX, y - 10);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.restore();
}

// Which cell of each sheet is showing. Same index for both â€” see the note above.
// This is the ONE place the frame hold applies, and it is deliberately the only
// place: hold the PICTURE, never the clock. `ex.t` has run on underneath, so the
// sheet resumes a frame or two further along than it stopped and the sequence
// still ends on 150 at 5.033 s, in step with a soundtrack that never paused.
// Everything else in the system â€” events, damage, checkpoint windows â€” reads
// `ex.t` and is completely unaware this happened.
//
// WHICH CLOCK owns the picture: `ex.t` for the whole first pass, and `ex.bru.t`
// once the reward round has taken it over. A SECOND clock rather than a rewind of
// the first, so every "the clock is monotonic" invariant in this system still
// holds while the sheets replay a stretch of themselves â€” and both drive the same
// single frame index, so the two tracks cannot come apart either way.
const execClock = (ex) => (ex.bru ? ex.bru.t : ex.t);
const execRawFrame = () => execution
  ? Math.min(execGrid(execution.def).frames - 1, Math.floor(execClock(execution) * execution.def.fps)) : 0;
const execFrame = () => (execution && execution.holdT > 0)
  ? execution.holdFrame : execRawFrame();

// Draw the pair. Both tracks go into the SAME screen rect, because they are two
// layers of one composition sharing one window â€” that is what makes the
// choreography hold together without any per-character positioning.
//
// A COMPOSITE pairing (`compositeSrc`) is one image with both men already baked
// into every cell, so it is a single draw into that same window. It gets no
// victim recoil: the recoil offsets one LAYER against the other, and there is
// only one layer here â€” applying it would shove Darki away from his own punch
// along with the man he is hitting.
function drawExecution() {
  const ex = execution;
  const def = ex?.def;
  const G = execGrid(def);
  if (def?.compositeSrc) {
    const img = execCompositeImg[def.id];
    if (!ex || !img) return;
    const i = execFrame();
    const h = def.drawH, w = h * (G.cw / G.ch);
    ctx.save();
    ctx.translate(ex.anchorX - cameraX, ex.anchorY);
    if (ex.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, (i % G.cols) * G.cw, Math.floor(i / G.cols) * G.ch, G.cw, G.ch,
      -w * def.anchorFrac, -h * (def.groundFrac ?? 1), w, h);
    ctx.restore();
    return;
  }
  if (!ex || !execAttackerImg || !execVictimImg) return;
  const i = execFrame();
  const sx = (i % G.cols) * G.cw;
  const sy = Math.floor(i / G.cols) * G.ch;
  const h = def.drawH, w = h * (G.cw / G.ch);
  ctx.save();
  // Move the origin to the anchor â€” Darki's feet â€” then mirror about it when he
  // faces left. Mirroring the whole composition rather than either character is
  // the point: their relative positions have to survive the flip.
  ctx.translate(ex.anchorX - cameraX, ex.anchorY);
  if (ex.facing < 0) ctx.scale(-1, 1);
  const dx = -w * def.anchorFrac;             // window x putting his centre on 0
  const dy = -h * (def.groundFrac ?? 1);      // â€¦and window y putting his feet on 0
  // The victim's recoil (Â§12B) â€” the ONLY thing that ever separates the two
  // layers, and it is a few pixels for an eighth of a second. Inside the mirror,
  // so +x is away from Darki's swing whichever side he is fighting from; the
  // attacker is drawn on the unmodified offset, so nothing about the shared window
  // or the choreography changes.
  const rc = execVictimRecoilOffset();
  ctx.drawImage(execVictimImg, sx, sy, G.cw, G.ch, dx + rc.x, dy + rc.y, w, h);
  ctx.drawImage(execAttackerImg, sx, sy, G.cw, G.ch, dx, dy, w, h);
  ctx.restore();
}

/* ------------------------------- the performance layer, on screen ------- */

// Background emphasis (Â§23). A vignette that closes briefly around the pair on a
// successful checkpoint and opens again. Drawn over the street and UNDER the
// HUD, centred on the execution anchor rather than on the screen, so the two men
// stay in the clear whichever side of the arena they are on. No camera move, no
// perspective change, nothing in the art behind them animates.
function drawExecEmphasis() {
  if (execVignette <= 0.001) return;
  const k = Math.min(1, execVignette / EXEC_PERF.vignetteMax);
  const cx = execution ? execution.anchorX - cameraX : VIEW_W / 2;
  const cy = (execution ? execution.anchorY : VIEW_H * 0.75) - 90;
  const g = ctx.createRadialGradient(cx, cy, 90, cx, cy, VIEW_W * 0.62);
  g.addColorStop(0, 'rgba(4,6,12,0)');
  g.addColorStop(0.45, `rgba(4,6,12,${0.16 * k})`);
  g.addColorStop(1, `rgba(4,6,12,${0.82 * k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

// The reward round's screen treatment, and the ONE place this game pulls the
// whole picture down. Drawn over the street and over both fighters, because "the
// screen goes dim" is the entire signal that the fight has dropped into a
// different register â€” but UNDER the HUD, which is a deliberate exception: a boss
// health plate you cannot read is a cost with no payoff, and the same reasoning
// already keeps the HUD out of the shake. Everything the round adds on top of
// this â€” the flash on the replayed uppercut, its label â€” is drawn after it.
function drawExecBrutalityDim() {
  const b = execution?.bru;
  if (!b) return;
  // Reached over `fadeIn` rather than snapped on, so it reads as a cut into the
  // round instead of a dropped frame â€” but fast enough that the first kick is
  // already inside it.
  const k = Math.min(1, (b.t - b.from) / Math.max(0.001, b.fadeIn));
  ctx.fillStyle = `rgba(3,4,9,${b.dim * k})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

// â€¦and its label, over the dim. Slams down to size and never quite settles: the
// tremble is what separates this from the calm gold plate that follows it.
function drawExecBrutalityLabel() {
  const b = execution?.bru;
  if (!b) return;
  const k = Math.min(1, (b.t - b.from) / 0.16);
  const shake = 1 - k * 0.55;
  const x = VIEW_W / 2 + Math.sin(mobClock * 71) * 2.4 * shake;
  const y = 150 + Math.cos(mobClock * 63) * 1.8 * shake;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = Math.min(1, k * 2);
  ctx.font = display(900, Math.round(62 - (1 - k) * 20));
  ctx.fillStyle = 'rgba(6,8,14,0.7)';
  ctx.fillText(b.label, x + 4, y + 4);
  ctx.fillStyle = '#ff5a3c';
  ctx.fillText(b.label, x, y);
  ctx.font = uiFont(700, 15);
  ctx.fillStyle = '#ffd23f';
  ctx.fillText('PERFECT EXECUTION', VIEW_W / 2, y + 42);
  ctx.restore();
}

// The checkpoint prompt: the sequence to play, with the tokens already entered
// struck through, and a bar that drains as the window closes. Sits ABOVE the
// pair (Â§19: it must not block either character), which in the locked boss-room
// framing is empty sky.
// One column of vertical space for the score meter and the grade pop, kept clear
// of the fighters (they top out around y 470 in the locked boss framing) and of
// the boss health plate above.
const EXEC_HUD_Y = 188;

/* --- WHERE OLODO'S HEAD IS, per frame of the finisher ---------------------
 * The button prompt is pinned to the man being hit, so it needs his head, and
 * the composition is a flat pair of sub-rect draws â€” there is no per-character
 * transform to read it off. These are the measured opaque boxes of the victim
 * sheet (_chromakey/exec_cells.json, made by exec_inspect.js), in the shared
 * 824x376 window's own coordinates: `cx` is his centre, `top` his crown, with
 * the window's y origin (44 in the source sheet) already taken off.
 *
 * Baked rather than sampled at load: reading them live would mean scanning a
 * 5356x2256 image for 151 boxes during boot, to recover numbers that were
 * already measured offline and cannot change unless the sheet is re-exported.
 *
 * HIS HEAD IS NOT A SMOOTH PATH â€” it moves up to 48 window-px in a single frame
 * as he is doubled over, kneed and thrown. A glyph pinned rigidly to it is
 * unreadable, which would defeat the entire point of moving the prompt onto him,
 * so drawExecButton damps the follow. See the note there.
 */
const EXEC_VICTIM_HEAD_X = [
  658,658,656,654,650,650,652,652,652,648,648,650,650,654,658,662,662,
  666,666,660,660,656,652,650,656,656,654,652,652,648,648,648,646,644,
  646,646,646,646,644,644,644,644,644,628,628,598,598,598,584,584,584,
  572,580,548,548,548,554,554,568,552,552,552,574,586,596,596,600,600,
  600,598,598,594,586,572,564,560,560,556,544,534,534,516,506,490,478,
  478,464,458,462,462,456,456,450,438,434,434,438,428,426,422,398,398,
  398,386,380,388,388,386,390,388,388,392,402,374,354,354,342,342,344,
  346,346,346,348,356,362,362,362,374,390,408,408,428,438,436,418,416,
  416,408,396,382,382,360,332,304,278,278,244,210,174,126,110,
];
const EXEC_VICTIM_HEAD_Y = [
   96, 96, 96, 92, 92, 92, 92, 88, 88, 88, 88, 76, 76, 80, 72, 72, 72,
   76, 84, 88, 88, 92, 92, 84, 72, 72, 72, 72, 76, 76, 80, 80, 84, 96,
   92, 92, 80, 68, 92, 92, 92, 92, 92, 84, 84, 76, 76, 76, 76, 76, 76,
   68, 68, 64, 64, 64, 72, 72, 80, 80, 92, 92,100,108,112,112,112,112,
  112,112,112,104,100, 92, 80, 72, 72, 68, 68, 64, 64, 64, 64, 72, 84,
   84, 92, 92, 80, 68, 64, 64, 72, 76, 76, 76, 76, 60, 68, 84, 88, 88,
   92, 92, 88, 84, 84, 80, 84, 88, 88, 88, 92, 92, 84, 84, 84, 92,100,
  108,108,108,108,108,108,108,108,104,100, 96, 96, 92, 68, 48, 48, 28,
   28, 16,  4,  0,  0,  4,  8,  8,  0,  0, 20, 48,104,160,172,
];

/* The same measurement for Street Justice, generated by
 * _chromakey/streetjustice_head.js. 69 entries, in that sheet's own 1024x436 cell
 * coordinates â€” the whole cell IS the window for a composite pairing, so there is
 * no crop offset to take off the way the boss pairing's y origin has one.
 *
 * FOUND BY COLOUR, NOT BY SPLITTING. The two sheets above are one body each, so
 * the victim's box is whatever is on his sheet. This is a composite and the men
 * are touching for most of it, so he is picked out as the only green in frame â€”
 * cap and trousers, against Darki's skin, dark tank and white wrapper â€” and his
 * crown is the topmost green pixel. That works straight through the clinch, which
 * is precisely where a geometric split cannot.
 *
 * Measured path: x 440-858, y 52-122, smooth to f59 (worst step 133px at f67,
 * which is his trousers rising above his cap once he is thrown horizontal). That
 * drift is out of reach: the last checkpoint here is bound to KICK at f56 and its
 * window shuts at f62, so the prompt is already gone.
 */
const EXEC_SJ_HEAD_X = [
  552,544,527,515,511,514,531,543,541,528,522,514,544,563,560,545,545,
  559,549,514,501,478,458,456,458,455,448,452,447,447,447,445,440,443,
  452,454,461,466,469,486,492,523,562,564,566,564,562,551,534,524,521,
  525,525,539,545,545,549,552,560,572,618,625,672,700,719,677,714,835,
  858,
];
const EXEC_SJ_HEAD_Y = [
   94, 92, 90, 88, 84, 80, 62, 62, 64, 68, 70, 72, 58, 58, 58, 60, 58,
   58, 56, 56, 52, 60, 70, 76, 78, 76, 72, 64, 68, 80, 92, 96,108,104,
   94, 90, 84, 80, 80, 82, 78, 60, 66, 64, 64, 66, 68, 72, 76, 90, 94,
  102,108,104,100,100,100,102,108,122, 94, 84, 72, 90,110,114, 92, 80,
   78,
];

// Head table BY PAIRING ID, resolved at draw time rather than referenced from the
// EXECUTIONS literal â€” that literal is evaluated at load, far above these arrays,
// so a `headX: EXEC_SJ_HEAD_X` field on the def would be a temporal-dead-zone
// throw at boot. A registry keeps each table next to the measurement that made it.
const EXEC_HEADS = {
  darki_olodo: { x: EXEC_VICTIM_HEAD_X, y: EXEC_VICTIM_HEAD_Y },
  darki_streetjustice: { x: EXEC_SJ_HEAD_X, y: EXEC_SJ_HEAD_Y },
};

// His crown, in SCREEN pixels, for the frame currently drawn. Runs the same
// transform drawExecution does â€” window -> local -> mirrored -> anchor â€” so the
// prompt lands wherever the composition put him, from either side of the arena.
//
// The table is PER PAIRING. Reading the boss pairing's 151 entries for a 69-cell
// sheet would not throw â€” every index is in range â€” it would just park the prompt
// on coordinates measured from a different animation, which is the kind of wrong
// that looks like a tuning problem rather than a bug.
function execVictimHeadScreen(ex) {
  const def = ex.def, i = execFrame();
  const G = execGrid(def);
  const h = def.drawH, w = h * (G.cw / G.ch);
  // The tables are in FULL-RESOLUTION cell coordinates and every exec sheet ships
  // halved, so the cell is 2x the grid's `ch` â€” 376 for the boss pairing, 436 for
  // Street Justice. Derived rather than written as a constant, which is what tied
  // this to one sheet before.
  const k = h / (G.ch * 2);                       // window px -> screen px
  const T = EXEC_HEADS[def.id] ?? EXEC_HEADS.darki_olodo;
  const wx = T.x[i] ?? G.cw, wy = T.y[i] ?? 80;
  const lx = -w * def.anchorFrac + wx * k;
  const ly = -h * (def.groundFrac ?? 1) + wy * k;
  return { x: (ex.anchorX - cameraX) + ex.facing * lx, y: ex.anchorY + ly };
}

// ONE BUTTON AT A TIME, over the head of the man being hit.
//
// The first cut printed the whole combination as a row of lettered boxes up in
// the HUD band, and it was reported as unhittable: the combination is read in
// one place while the fight it is timed against happens in another, so you
// either watch the prompt and lose the beat or watch the fight and lose the
// prompt. Showing only the NEXT button removes the reading entirely â€” there is
// one thing on screen and one thing to do â€” and putting it on Olodo's head means
// the eye never leaves the blow it is timing against.
//
// The follow is DAMPED, and that is not polish. His head moves up to 48 window
// px in one frame (34 on screen) as he doubles over and is thrown; a glyph
// nailed to it strobes around the frame and is harder to read than the HUD row
// it replaced. `execBtn` chases the head exponentially and is clamped to stay on
// screen and above the pair, so it reads as a marker floating over him rather
// than a label welded to his skull.
let execBtnX = 0, execBtnY = 0, execBtnHas = false;

function drawPadShape(shape, cx, cy, r, col, lw) {
  ctx.strokeStyle = col;
  ctx.lineWidth = lw;
  ctx.beginPath();
  if (shape === 'triangle') {
    // sat down a touch: a triangle's visual centre is below its centroid
    ctx.moveTo(cx, cy - r * 1.02);
    ctx.lineTo(cx + r * 0.92, cy + r * 0.66);
    ctx.lineTo(cx - r * 0.92, cy + r * 0.66);
    ctx.closePath();
  } else if (shape === 'square') {
    const s = r * 0.82;
    ctx.rect(cx - s, cy - s, s * 2, s * 2);
  } else if (shape === 'circle') {
    ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
  } else {                                        // cross
    const s = r * 0.8;
    ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s);
    ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s);
  }
  ctx.stroke();
}

// The damping runs in the UPDATE, not the draw, for the same reason every other
// decaying value in this system does: it needs `dt`, and a value that moves once
// per rendered frame instead of once per simulated step is a different value at
// 144 fps than at 20. Called from updateExecution.
function updateExecButton(ex, dt) {
  const cp = ex.cps.find((c) => c.state === 'open');
  if (!cp) { execBtnHas = false; return; }
  const head = execVictimHeadScreen(ex);
  const tx = Math.max(60, Math.min(VIEW_W - 60, head.x));
  const ty = Math.max(120, Math.min(VIEW_H - 220, head.y - 62));
  if (!execBtnHas) { execBtnX = tx; execBtnY = ty; execBtnHas = true; return; }
  const a = Math.min(1, dt * 9);                  // ~9/s: follows, never strobes
  execBtnX += (tx - execBtnX) * a;
  execBtnY += (ty - execBtnY) * a;
}

function drawExecButton(ex) {
  if (!execBtnHas) return;
  const cp = ex.cps.find((c) => c.state === 'open');
  if (!cp) return;
  const t = EXEC_TOKENS[cp.def.seq[cp.typed.length]];
  if (!t) return;
  const x = Math.round(execBtnX), y = Math.round(execBtnY);

  // --- THE APPROACH RING: the whole interface, and it has no words in it ------
  // A DRAINING ARC WAS THE FIRST ATTEMPT AND IT ANSWERS THE WRONG QUESTION. It
  // shows how much window is LEFT, when the only thing the player needs is WHEN
  // TO PRESS â€” and those are not the same instant, because the window runs on
  // past the blow through `grace`. An arc emptying after the moment has gone is
  // reporting a deadline you have already missed.
  //
  // So: a ring that starts wide and CLOSES ONTO THE BUTTON, arriving exactly on
  // the blow. Press when it lands. That is readable at a glance, at any distance,
  // by someone who has never seen it before, and it needs no number, no label and
  // no decode â€” which is the entire point of dropping the combinations. Inside
  // the PERFECT band the button lights up, so the cue is confirmed twice: the
  // ring says now, and the glow says NOW.
  const R = 27, FAR = 88;
  const toBlow = cp.at - ex.t;                  // >0 approaching, <0 into the grace
  const lead = Math.max(0.001, cp.at - cp.opens);
  const approach = Math.max(0, Math.min(1, toBlow / lead));   // 1 at open -> 0 on the blow
  const ringR = R + (FAR - R) * approach;
  const inPerfect = Math.abs(toBlow) <= cp.def.perfect;
  const pulse = 0.5 + 0.5 * Math.sin(mobClock * 12);
  ctx.save();
  ctx.globalAlpha = 1;
  // plate
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = inPerfect ? 'rgba(62,46,10,0.92)' : 'rgba(8,11,18,0.82)';
  ctx.fill();
  ctx.strokeStyle = inPerfect ? `rgba(255,240,180,${0.75 + pulse * 0.25})`
    : `rgba(255,255,255,${0.16 + pulse * 0.18})`;
  ctx.lineWidth = inPerfect ? 3 : 2;
  ctx.stroke();
  // The PERFECT band as a STATIC hoop the approach ring passes through, so the
  // target is a place on screen rather than a feeling.
  ctx.beginPath(); ctx.arc(x, y, R + 6, 0, Math.PI * 2);
  ctx.strokeStyle = inPerfect ? 'rgba(255,228,94,0.95)' : 'rgba(255,210,63,0.30)';
  ctx.lineWidth = inPerfect ? 3 : 1.5;
  ctx.stroke();
  // â€¦and the ring closing onto it. Past the blow it stops shrinking and fades out
  // across the grace, so a late press still has something to aim at instead of
  // the cue vanishing at the exact moment the player is behind.
  if (toBlow > -cp.def.grace) {
    ctx.globalAlpha = toBlow >= 0 ? 1 : Math.max(0, 1 + toBlow / cp.def.grace);
    ctx.beginPath(); ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = inPerfect ? '#ffe45e' : '#ffd23f';
    ctx.lineWidth = inPerfect ? 4 : 3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // the button itself
  drawPadShape(t.shape, x, y, 14, t.col, 3.5);
  // â€¦and the keyboard key under it, small, for anyone not on a pad
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = uiFont(700, 10);
  ctx.fillStyle = 'rgba(207,216,234,0.75)';
  ctx.fillText(t.key, x, y + R + 15);
  // Progress pips only earn their space on a MULTI-press checkpoint, where not
  // knowing whether you are on the last press is its own kind of blind. On the
  // one-button build there is nothing to count and a lone pip is furniture â€” but
  // the code stays, because the sequence machinery it belongs to stays.
  // Clear of the hoop by a margin: at R+12 the lit pip sat on it and the two read
  // as one smear.
  const n = cp.def.seq.length;
  if (n > 1) {
    for (let i = 0; i < n; i++) {
      const px = x - (n - 1) * 5.5 + i * 11;
      ctx.beginPath(); ctx.arc(px, y - R - 19, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = i < cp.typed.length ? '#ffd23f' : 'rgba(255,210,63,0.26)';
      ctx.fill();
      if (i >= cp.typed.length) {
        ctx.strokeStyle = 'rgba(255,210,63,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// Grade pops and the performance meter. Fast and arcade-like (Â§19): the pop is
// gone in just over half a second, and it rises and fades rather than sitting.
function drawExecPerfHud(ex) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = Math.max(140, Math.min(VIEW_W - 140, ex.anchorX - cameraX));

  if (ex.gradeT > 0 && ex.gradeText) {
    const k = ex.gradeT / EXEC_PERF.gradeHold;          // 1 -> 0
    const rise = (1 - k) * 34;
    const col = ex.gradeTier === 'PERFECT' ? '#ffe45e'
      : ex.gradeTier === 'GOOD' ? '#8ef0a8' : '#ff7a55';
    ctx.globalAlpha = Math.min(1, k * 1.9);
    ctx.font = display(900, ex.gradeTier === 'PERFECT' ? 46 : 38);
    ctx.fillStyle = 'rgba(6,8,14,0.55)';
    ctx.fillText(ex.gradeText, cx + 2, EXEC_HUD_Y - 48 - rise + 2);
    ctx.fillStyle = col;
    ctx.fillText(ex.gradeText, cx, EXEC_HUD_Y - 48 - rise);
    ctx.globalAlpha = 1;
  }

  // The meter (Â§20). DOCKED UNDER THE BOSS HEALTH PLATE rather than floating
  // mid-screen: with the button prompt now living on Olodo's head, a lone bar
  // and a label in the middle of the mural read as debris. Tucked against the
  // plate (drawBossHud: w 560, centred, y 58, bar 14 tall) it groups with the
  // other thing the player is watching drain, and the centre of the screen stays
  // clear for the fight.
  const mw = 200, mx = (VIEW_W - mw) / 2, my = 78;
  ctx.fillStyle = 'rgba(8,11,18,0.62)';
  ctx.fillRect(mx - 3, my - 3, mw + 6, 13);
  ctx.fillStyle = 'rgba(255,210,63,0.18)';
  ctx.fillRect(mx, my, mw, 7);
  const s = Math.max(0, Math.min(100, ex.perf.score)) / 100;
  ctx.fillStyle = s >= 0.999 ? '#fff2b8' : '#ffd23f';
  ctx.fillRect(mx, my, mw * s, 7);
  ctx.font = uiFont(700, 10);
  ctx.fillStyle = 'rgba(207,216,234,0.8)';
  ctx.fillText('EXECUTION  ' + Math.round(ex.perf.score), VIEW_W / 2, my + 17);
  ctx.restore();
}

// The final plate. Outlives the sequence by design â€” the finisher ends on a
// thrown body and the result should still be readable while it lands â€” so it is
// driven by `execResultT`, which counts down in update() after the execution
// object is gone.
const EXEC_FINAL_LABEL = {
  FAILED: 'FAILED FINISH', GOOD: 'GOOD FINISH',
  POWER: 'POWER FINISH', PERFECT: 'PERFECT FINISH',
};
function drawExecResult() {
  if (execResultT <= 0 || !lastExecResult?.grade) return;
  const r = lastExecResult;
  const k = Math.min(1, execResultT / 0.3);              // fade out at the tail
  const grow = 1 - Math.min(1, (EXEC_PERF.finalHold - execResultT) / 0.18);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = k;
  const gold = r.grade === 'PERFECT';
  ctx.font = display(900, (gold ? 54 : 44) + grow * 20);
  ctx.fillStyle = 'rgba(6,8,14,0.6)';
  ctx.fillText(EXEC_FINAL_LABEL[r.grade] ?? r.grade, VIEW_W / 2 + 3, 150 + 3);
  ctx.fillStyle = gold ? '#ffe45e' : r.grade === 'FAILED' ? '#ff7a55' : '#ffd23f';
  ctx.fillText(EXEC_FINAL_LABEL[r.grade] ?? r.grade, VIEW_W / 2, 150);
  ctx.font = uiFont(700, 15);
  ctx.fillStyle = '#cfd8ea';
  ctx.fillText(`${r.perfect} PERFECT · ${r.good} GOOD · ${r.miss} MISS · ${r.score}`, VIEW_W / 2, 186);
  ctx.restore();
}

// The debug readout (Â§33). Off by default; `tune.execDebug` turns it on, and the
// dev panel has a checkbox for it.
function drawExecDebug() {
  if (!tune.execDebug) return;
  const ex = execution;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `600 12px ${FONT_MONO}`;
  const lines = [];
  if (!ex) {
    lines.push('EXECUTION IDLE');
    if (lastExecResult) lines.push(`last: ${lastExecResult.grade ?? 'ABORTED'} score ${lastExecResult.score}`
      + ` P${lastExecResult.perfect}/G${lastExecResult.good}/M${lastExecResult.miss}`);
  } else {
    const open = ex.cps.find((c) => c.state === 'open');
    lines.push('EXECUTION ACTIVE  ' + ex.def.id);
    lines.push(`time    ${ex.t.toFixed(2)} / ${EXEC_DUR(ex.def).toFixed(2)}`);
    lines.push(`frame   ${execFrame()} (raw ${execRawFrame()})  hold ${ex.holdT.toFixed(3)}`);
    lines.push(`darki/olodo both on frame ${execFrame()} — one index, one clock`);
    lines.push(`cp      ${open ? open.id : '—'}  ${open ? open.def.seq.join(' > ') : ''}`);
    if (open) lines.push(`typed   ${open.typed.join(' > ') || '—'}`
      + `  next ${open.def.seq[open.typed.length] ?? '—'}  closes in ${(open.closes - ex.t).toFixed(2)}`);
    for (const c of ex.cps)
      // `lead` is what the table asked for, `leadGot` what the boundary pass left
      // â€” they differ whenever the previous checkpoint's grace ate into it.
      lines.push(`  ${c.id} @${c.at.toFixed(2)} [${c.def.seq.join('')}] lead ${c.leadGot.toFixed(2)}`
        + `/${c.def.lead.toFixed(2)} span ${c.def.maxSpan.toFixed(2)} ${c.state}`
        + ` ${c.grade ?? 'WAITING'}${c.err == null ? '' : ' err ' + c.err.toFixed(3)}`);
    lines.push(`score   ${Math.round(ex.perf.score)}   P${ex.perf.perfect} G${ex.perf.good} M${ex.perf.miss}`);
    lines.push(`final   ${ex.finalGrade ?? '—'}`);
    // ATTACKER / VICTIM POSITIONS (Â§20). Both the world positions the sim holds
    // and where the composition actually puts them, because during a finisher
    // those are different things: the sim parks both bodies at their entry spots
    // while the choreography walks them across the shared window and swaps their
    // sides. Reading only the sim is what made the end-of-sequence side swap
    // (`endAttackerFrac` / `endVictimFrac`) so hard to see.
    const winPx = ex.def.drawH * (execGrid(ex.def).cw / execGrid(ex.def).ch);
    const drawnX = (frac) => Math.round(ex.anchorX + ex.facing * (frac - ex.def.anchorFrac) * winPx);
    lines.push(`atk pos ${Math.round(player.x)},${Math.round(player.y)}`
      + `  anchor ${Math.round(ex.anchorX)},${Math.round(ex.anchorY)} facing ${ex.facing}`);
    lines.push(`vic pos ${Math.round(ex.victim?.x ?? 0)},${Math.round(ex.victim?.y ?? 0)}`
      + `  will end atk ${drawnX(ex.def.endAttackerFrac ?? ex.def.anchorFrac)}`
      + ` vic ${drawnX(ex.def.endVictimFrac ?? ex.def.anchorFrac)}`);
    lines.push(`recoil  ${execRecoilT > 0 ? execRecoil.toFixed(1) + 'px' : '—'}`
      + `  impulse ${execImpulseT > 0 ? execImpulseT.toFixed(3) : '—'}`);
    // Which clock is driving the picture, and where the round restarted from.
    if (ex.bru) lines.push(`REWARD  ${ex.bru.label} ${ex.bru.t.toFixed(2)}`
      + ` (from ${ex.bru.from.toFixed(2)} @${ex.bru.rate}x)  no damage`);
  }
  const w = 340, h = lines.length * 15 + 12;
  ctx.fillStyle = 'rgba(6,8,14,0.78)';
  ctx.fillRect(10, VIEW_H - h - 34, w, h);
  ctx.fillStyle = '#8ef0a8';
  lines.forEach((l, i) => ctx.fillText(l, 18, VIEW_H - h - 28 + i * 15));
  ctx.restore();
}

/* ------------------------------------------------------ boots on tarmac */
// WHICH FRAME does a boot land on? Measured off the art by
// `_chromakey/stride_analyze.js`, not chosen by eye: for every frame of a cycle
// it takes the opaque pixels in the bottom 12% of the body (the boots) and
// reports how far apart they are. A stride plants when the feet are at their
// widest, so the maxima of that curve ARE the footfalls â€” and a footstep on the
// wrong frame does not read as "slightly off", it reads as a limp.
//
// enemy-walk's 35-frame stride measured 95 147 205 281 295 295 289 ... 87 103
// 103 149 191 275 315 315 341 357 371 363 ... â€” two clean humps, peaking at
// index 5 and index 23. Two steps a cycle, near enough evenly spaced.
//
// The guard advance is a different animal: it measured a FLAT 283 across all 18
// frames, because it is a shuffle with the feet never leaving the ground rather
// than a walk. There is no plant to find, so it gets an even cadence at a lower
// weight instead â€” a scuff, not a stride. Indices are into the spec's frame
// list, not sheet frame numbers (they only coincide for enemy-walk).
const FOOTFALLS = {
  walk: { at: [5, 23], weight: 1 },
  advance: { at: [0, 9], weight: 0.7 },
};

// Darki's own boots. Measured off his sheets the same way the mob's were, and
// they are two different cycles with two different cadences: the casual walk is
// 57 frames with FOUR plants (spread peaks 373/537/351/529 at 7, 22, 36, 51) and
// the fists-up combat stride is 22 frames with two (247 at 7, 567 at 18). Using
// one set of indices for both would put half his steps in mid-air.
const DARKI_FOOTFALLS = {
  walk: [7, 22, 36, 51],
  combatwalk: [7, 18],
  // The overhead loop is 22 frames too, but the planted poses arrive earlier
  // under the extra weight. They keep the carry from gliding silently.
  carry: [5, 16],
  /* THE CHARGE. Measured by _chromakey/rushplants.js off darki-rush.png the
   * same way every other row here was measured — widest boot spread is the
   * plant — and it needed two passes of filtering to be believable. The bare
   * local-maximum test returned five candidates; three were 1-4px wobbles in
   * the feet-together part of the cycle (94 and 90 against a stride maximum of
   * 317), and of the two survivors, frames 7 and 9 turned out to be one
   * extension split by a 10px dip at frame 8.
   *
   * What is left is 2 plants in a 16-frame loop. At the sheet's 24 fps that is
   * a step every 0.333 s — 180 per minute, a sprint cadence. Five would have
   * been 450 and he would have sounded like a machine gun. */
  rush: [1, 9],
};

// The gates the spec asks for, and they are all one question: is he WALKING
// right now? Not airborne, not swinging, not being hit, not on the deck, not
// stood still with the cycle ticking over.
function darkiFootfalls(spec, step, dt) {
  const plants = DARKI_FOOTFALLS[player.anim];
  const prev = player.stepClock;
  player.stepClock = step;
  if (!plants || !spec.frames.length) return;
  if (!player.grounded || player.react || player.attack || player.state !== 'normal') return;
  if (Math.abs(player.vx) < 12 && Math.abs(player.depthV) < 12) return;
  if (prev == null || step <= prev) return;      // fresh cycle: nothing crossed yet
  const len = spec.frames.length;
  const from = Math.max(prev, step - len);       // never dump a whole cycle at once
  for (let s = from + 1; s <= step; s++) {
    if (!plants.includes(((s % len) + len) % len)) continue;
    const clip = nextDarkiStep();
    /* THE SAME BOOT, LANDING HARDER. A sprint plants his whole weight, so the
     * rush plays his own footstep louder and pitched DOWN — a lower playback
     * rate lengthens the body of the thump, which is what "heavy" is. Reaching
     * for a different recording would have cost the continuity: it has to still
     * sound like the man who was walking a second ago.
     *
     * Everything about WHEN it fires is untouched. The plants are the measured
     * ones (DARKI_FOOTFALLS.rush), crossings are read the same frame-rate
     * independent way, and this branch only changes how the cue is voiced. */
    const rushing = player.anim === 'rush';
    if (clip) playCue(clip, player.x, rushing ? RUSH_FX.stepGain : 1,
      rushing ? RUSH_FX.stepRate : null);
    /* …and the deck answers. A burst of dust thrown backward out from under the
     * boot, on the frame it lands — the brief's "ground impact particles", tied
     * to the same crossing as the sound so they can never disagree. */
    if (rushing) spawnRushDust(RUSH_FX.stepDust, 90);
    sfxSteps++;                                  // shares the footfall counterâ€¦
    sfxDarkiSteps++;                             // â€¦and keeps its own, because the
    /* shared one counts the whole street. A test asking "did DARKI take a step"
     * against `sfxSteps` is really asking "did anybody", and four Agberos
     * walking on stage will answer yes for him. */
  }
}

// Fire a footstep for every plant the animation crossed this frame. Reading
// crossings rather than "is the current frame a plant" is what makes this
// frame-rate independent â€” at 144 Hz the naive test fires the same step three
// times, and on a long frame it misses it entirely.
function stepFootfalls(enemy, name, spec, estep, dt) {
  const fall = FOOTFALLS[name];
  const prev = enemy.stepClock;
  enemy.stepClock = estep;
  if (!fall || !spec.frames.length) return;
  // Only a body that is actually TRAVELLING makes footsteps. The mob plays its
  // walk cycle while holding station in `menace` too, and a man bobbing on the
  // spot who sounds like he is marching is worse than one who is silent.
  const speed = Math.hypot(enemy.x - enemy.prevX, enemy.y - enemy.prevY) / Math.max(dt, 1e-4);
  if (speed < FOOT.minSpeed) return;
  const len = spec.frames.length;
  // Never replay a whole cycle's worth: a spec swap or a stall resets the clock,
  // and without this a single frame could dump both boots at once.
  const from = Math.max(prev, estep - len);
  for (let s = from + 1; s <= estep; s++)
    if (fall.at.includes(((s % len) + len) % len)) playStep(enemy.x, fall.weight);
}

// Enemy animation router. Roaming (patrol/menace footwork) rides the dedicated
// Enemywalk stride; closing in "squares him up" into Ginger.png's guard-advance;
// the wind-up (state 'guard') plays Ginger's guard-idle "squaring up" BOB â€” the
// personality tell before he throws hands â€” then the strike (mode 'attack') and
// pull-back (mode 'recover') ride the dedicated jab sheet; getting struck plays
// the hit-recoil. All sheets are foot-anchored at the same height and face
// right, so swapping never shifts or flips the body. Returns {sprite,config,spec}.
function enemyAnim(enemy) {
  if (enemy.boss) return bossAnim(enemy);
  // Held in Darki's grab: flinch through the hit-recoil on each synchronised
  // strike, otherwise hang in the guard pose. Both ride the same foot-anchored
  // sheet, so the swap never pops his size or flips him.
  if (enemy.grabbed)
    return enemy.grabHitT > 0
      ? { sprite: gingerSprite, config: GINGER_SHEET, spec: gingerSprite.anims.hit, name: 'grabhit' }
      : { sprite: gingerSprite, config: GINGER_SHEET, spec: gingerSprite.anims.idle, name: 'grabbed' };
  // The pickup and release are frame-locked to Darki's matching layer. During
  // the hold, Agbero's longer seamless struggle loop runs independently.
  if (enemy.carried) {
    const name = player.attack === 'carryThrow' ? 'throwPair'
      : player.carrying ? 'struggle' : 'pickedUp';
    return { sprite: gingerCarrySprite, config: ENEMYCARRY_SHEET,
      spec: gingerCarrySprite.anims[name], name };
  }
  // Thrown BY THE CARRY, and still alive: hand straight into the canonical
  // AgbeoFall flight/crash/get-up sections. Yields to `dying` below, because a
  // lethal throw still belongs on the existing death performance.
  if (gingerFallSprite && enemy.thrownByCarry && !enemy.dying) {
    if (enemy.state === 'hit')
      return { sprite: gingerFallSprite, config: ENEMYFALL_SHEET,
        spec: gingerFallSprite.anims.fallAir, name: 'fallAir' };
    if (enemy.state === 'down' || enemy.state === 'ko') {
      // The tail of AgbeoFall pushes him back to the exact guard pose the walk
      // sheet expects, so the recovery never pops.
      if (gingerFallSprite && enemy.state === 'down'
        && enemy.downTimer <= fallTimes(enemy).getUp / (enemy.fallRate || 1))
        return { sprite: gingerFallSprite, config: ENEMYFALL_SHEET,
          spec: gingerFallSprite.anims.getUp, name: 'getUp' };
      return { sprite: gingerFallSprite, config: ENEMYFALL_SHEET,
        spec: gingerFallSprite.anims.fallDown, name: 'fallDown' };
    }
  }
  // Knocked off his feet. TWO sheets, and which one plays is decided by whether
  // this fall KILLED him â€” `enemy.dying` is set from the health check in
  // hitEnemy, never from the fact that he is horizontal. A man who is going to
  // get up and a man who is not do not fall the same way, and the difference has
  // to be visible from the first airborne frame, not revealed at the end.
  if (gingerDeathSprite && enemy.dying && enemy.state !== 'grabbed')
    return { sprite: gingerDeathSprite, config: ENEMYDEATH_SHEET,
      spec: enemy.state === 'hit' ? gingerDeathSprite.anims.deathAir : gingerDeathSprite.anims.deathDown,
      name: enemy.state === 'hit' ? 'deathAir' : 'deathDown' };
  // Survivable: the flight, the crash, and â€” at the tail of the down timer â€” the
  // push back onto his feet. A `stagger` is NOT a fall (he keeps his feet), so it
  // stays on the Ginger recoil below.
  if (gingerFallSprite && (enemy.state === 'hit' || enemy.state === 'down' || enemy.state === 'ko')) {
    // The handover is the moment the crash section runs out, expressed as time
    // LEFT rather than time elapsed â€” and scaled by his own playback rate, or a
    // man who gets up quick would start rising before his crash had finished.
    const name = enemy.state === 'hit' ? 'fallAir'
      : (enemy.state === 'down' && enemy.downTimer <= fallTimes(enemy).getUp / (enemy.fallRate || 1))
        ? 'getUp' : 'fallDown';
    return { sprite: gingerFallSprite, config: ENEMYFALL_SHEET,
      spec: gingerFallSprite.anims[name], name };
  }
  if (enemy.state === 'hit' || enemy.state === 'down' || enemy.state === 'stagger' || enemy.state === 'ko')
    return { sprite: gingerSprite, config: GINGER_SHEET, spec: gingerSprite.anims.hit, name: 'hit' };
  // wind-up: the Ginger guard-idle telegraph (fists up, weight shifting).
  if (enemy.state === 'guard')
    return { sprite: gingerSprite, config: GINGER_SHEET, spec: gingerSprite.anims.idle, name: 'guard' };
  // the strike: lunge (mode 'attack') and recover ride whichever attack sheet
  // he committed to back in 'menace'. The two share frame 0 to the pixel, so
  // the choice never shows as a pop. Note both modes return the SAME spec
  // object: the generic stepper restarts its clock when the spec CHANGES, so
  // handing back one spec across attack+recover is what lets a single frame
  // list span the swing and the pull-back.
  if (enemy.mode === 'attack' || enemy.mode === 'recover')
    return enemy.moveName === 'kick'
      ? { sprite: gingerKickSprite, config: ENEMYKICK_SHEET, spec: gingerKickSprite.anims.kick, name: 'sidekick' }
      : { sprite: gingerJabSprite, config: ENEMYJAB_SHEET, spec: gingerJabSprite.anims.jab, name: 'jab' };
  if (enemy.mode === 'approach')                     // closing distance, guard up
    return { sprite: gingerSprite, config: GINGER_SHEET, spec: gingerSprite.anims.walk, name: 'advance' };
  return { sprite: gingerWalkSprite, config: ENEMYWALK_SHEET, spec: gingerWalkSprite.anims.walk, name: 'walk' };
}

function spriteFor(anim) {
  if (anim === 'hitReact') return hitSprite;
  if (anim === 'hitLift') return hitLiftSprite;
  if (anim === 'hitAir') return hitAirSprite;
  if (anim === 'fall') return fallSprite;
  if (anim === 'block') return blockSprite;
  // 'hurt'/'ko' are the between-states: a reaction normally owns the body and
  // names its own sheet above, so these only show if one ends a frame early.
  if (anim === 'idle' || anim === 'hurt' || anim === 'ko') return idleSprite;
  if (anim === 'uppercut') return uppercutSprite;
  if (anim === 'jabLeft') return jabLeftSprite;
  if (anim === 'highKick') return highKickSprite;
  if (anim === 'backKick') return backKickSprite;
  if (anim === 'combo5') return comboSprite;
  if (anim === 'grab') return grabSprite;
  if (anim === 'grabFail') return grabFailSprite;
  if (anim === 'contCombo') return contComboSprite;
  if (anim === 'pickup' || anim === 'carry' || anim === 'throwEnemy') return darkiCarrySprite;
  if (anim === 'rush') return rushSprite;
  // Two sheets for the vertical game, and the line between them moved: the jump
  // sheet now owns the rise, the KICK, the fall and the landing, and the strike
  // sheet is left with only the descent that follows its own kick.
  if (anim === 'airKickFall') return jumpStrikeSprite;
  if (anim === 'jump' || anim === 'jumpRise' || anim === 'jumpFall'
      || anim === 'land' || anim === 'airKick') return jumpSprite;
  if (anim === 'combatwalk' || anim === 'combatidle') return combatWalkSprite;
  return sprite;
}

/* ------------------------------------------------------- combat system */
// Data-driven move table. Each move lists the sheet frames to play, an fps, an
// optional cancel window (`cancelStart` â€” the step from which a lighter move may
// be chained/cancelled), `lock` (uninterruptible â€” the 5-hit combo), and hit
// "windows" keyed by STEP index (position in `frames`). A window has a `group`
// so an enemy is struck once per group even across several active frames â€” the
// combo's five groups land five hits. Boxes are world-space px relative to the
// player's feet (x = forward gap, w = reach, top = up from feet, h = height),
// mirrored by facing. To add a move (double-tap, aerial, directionalâ€¦), add a
// table entry + a trigger in consumeAttackInput â€” no other code changes.
const FR = (s, e) => Array.from({ length: e - s + 1 }, (_, i) => s + i);
const JAB_BOX = { x: 16, w: 104, top: -150, h: 112 };
const ATTACKS = {
  jabLeft: {                             // LMB â€” quick lead jab
    anim: 'jabLeft',
    frames: [0, 5, 6, 7, 9, 12],         // guard â†’ chamber â†’ extend(hit) â†’ retract â†’ guard
    fps: 32,
    cancelStart: 3,                      // chain into another jab / uppercut / combo
    windows: {
      2: { group: 'jl', box: JAB_BOX, damage: 7, kb: { x: 130, y: 0 },
           launch: false, hitstop: 0.06, shake: 5, rage: 7 },
    },
  },
  highKick: {                            // RMB â€” high kick (foot up & forward, launches)
    anim: 'highKick',
    frames: FR(0, 12),
    fps: 28,
    cancelStart: 999,
    windows: Object.fromEntries([7, 8, 9].map((s) => [s, {
      group: 'hk', swing: 'kick', box: { x: 18, w: 132, top: -230, h: 200 },
      damage: 15, kb: { x: 240, y: -300 }, launch: true, hitstop: 0.12, shake: 12, rage: 11, big: true,
    }])),
  },
  /* THE AIR STRIKE — an attack button pressed while he is off the ground.
   *
   * The only move in the table that may be STARTED airborne (`air: true`), and
   * the only one that keeps his horizontal speed: `startAttack` zeroes `vx` for
   * everything else because a swing is thrown from a plant, but a jump kick is
   * thrown from a leap and killing the momentum would drop him out of his own
   * arc. See the `air` branches in `startAttack` and `consumeAttackInput`.
   *
   * `frames`, `fps` and the hit window are all REPLACED at load time from the
   * sheet's own Air Kick section — see bindJumpKickAnims. What is written here
   * is the fallback that keeps the table readable and keeps a missing section
   * from being a crash: the same sheet frames, in the same order.
   *
   * Between the high kick and the uppercut for weight. It is committed — you
   * cannot steer out of it and it costs the one air action the jump has — but it
   * arrives from above and cannot be traded with, so it does not launch.
   */
  airKick: {
    anim: 'airKick',
    air: true,
    frames: [7, 8, 9, 10, 12, 14, 16, 18],
    fps: 38,                             // matches the section; 26 was pre-dive
    cancelStart: 999,
    windows: {},                         // filled by bindJumpKickAnims
  },
  backKick: {                            // back + RMB â€” spinning kick BEHIND Darki
    anim: 'backKick',
    frames: FR(0, 14),
    fps: 28,
    cancelStart: 999,
    windows: Object.fromEntries([8, 9, 10, 11].map((s) => [s, {
      // `back: true` puts the hitbox on the side OPPOSITE Darki's facing.
      group: 'bk', swing: 'kick', box: { x: 6, w: 132, top: -220, h: 200, back: true },
      damage: 14, kb: { x: 240, y: -260 }, launch: true, hitstop: 0.12, shake: 12, rage: 11, big: true,
    }])),
  },
  // 5-hit combo â€” two rapid LMB clicks play the whole thing once: fist strikes
  // (jab, cross, punch, hook) then a launching kick finisher. Plays all 35 frames
  // (fists + legs) start to finish; uninterruptible (`lock`).
  combo5: {
    anim: 'combo5',
    frames: FR(0, 34),
    fps: 24,
    lock: true,
    windows: {
      // The opening PAIR of fist strikes is the game's two-hit punch, so it is
      // where 2hits_punch1 belongs â€” one burst of that recording per impact,
      // fired from the hit itself (see hitEnemy), which is what puts it on the
      // impact FRAME rather than on the start of the animation.
      3:  { group: 'c1', cue: 'punch2a', box: JAB_BOX, damage: 6, kb: { x: 90, y: 0 }, hitstop: 0.05, shake: 4, rage: 4 },
      8:  { group: 'c2', cue: 'punch2b', box: { x: 18, w: 116, top: -150, h: 112 }, damage: 7, kb: { x: 110, y: 0 }, hitstop: 0.05, shake: 4, rage: 4 },
      15: { group: 'c3', box: { x: 16, w: 112, top: -152, h: 112 }, damage: 8, kb: { x: 130, y: -20 }, hitstop: 0.06, shake: 5, rage: 5 },
      21: { group: 'c4', box: { x: 16, w: 114, top: -166, h: 122 }, damage: 9, kb: { x: 150, y: -70 }, hitstop: 0.07, shake: 6, rage: 5 },
      ...Object.fromEntries([27, 28, 29].map((s) => [s, {      // kick finisher
        group: 'c5', swing: 'kick', box: { x: 8, w: 156, top: -205, h: 150 }, damage: 18, kb: { x: 280, y: -430 },
        launch: true, hitstop: 0.14, shake: 14, rage: 12, big: true,
      }])),
    },
  },
  uppercut: {                            // K (keyboard) â€” heavy launcher
    anim: 'uppercut',
    frames: FR(0, 26),
    fps: 30,
    cancelStart: 999,
    windows: Object.fromEntries(FR(9, 14).map((s) => [s, {
      group: 'up', box: { x: 8, w: 112, top: -210, h: 220 },
      damage: 20, kb: { x: 230, y: -470 }, launch: true, hitstop: 0.13, shake: 13, rage: 12, big: true,
    }])),
  },
};

/* ----------------------------------------------------------- grab config */
// All grab tuning lives here as data (range, anchor, timing, damage, forces) â€”
// no magic numbers in the logic. Steps index into the move's `frames` list; the
// grab plays the sheet 1:1 (frames 0..83) so a step IS the sheet frame, read
// straight off the updated 10x9/84 art: 0-8 wind-up, 9 the snatch, 10-14 pull-in,
// 17..68 the automatic beat-down, 75 the throw, 79-83 recovery.
const GRAB = {
  reach: 132,            // forward px from Darki's feet a target must be inside
  minGap: 4,             // ignore bodies practically standing on top of him
  lane: 54,              // depth (Y) tolerance â€” must share the lane
  fps: 34,               // 84 frames â‰ˆ 2.5 s; the sheet is the faster cut
  snatchStep: 9,         // hand reaches the target â€” latch + start the pull-in
  pinStep: 14,           // fully seated at the anchor from here (smooth, no snap)
  releaseStep: 75,       // the throw: launch and hand control back to the AI
  anchor: { x: 78, y: 0 },   // enemy seat relative to Darki (forward, lane offset)
  hitRecoil: 0.18,       // seconds the grabbed enemy plays its hit reaction
  // Manual-combo takeover: a click anywhere before `takeoverAt` hands control to
  // Cont.Combo AT `takeoverAt` â€” the grab's first damaging frame AND a pose the
  // combo sheet shares (its frame 3), so the swap is invisible.
  //
  // It is the swap point in BOTH directions: when the combo's last circle closes
  // it hands control straight back here and the grab finishes the job from its
  // hits onward. One constant, so the two hand-offs can never drift apart.
  takeoverFrom: 9,
  takeoverAt: 17,
  // Every visible strike in the sheet, timed to the art's motion peaks. Each
  // fires exactly once (ledgered by `id`), damage-only â€” the hold is preserved.
  hits: [
    { id: 'g1', step: 17, damage: 4, hitstop: 0.04, shake: 4, rage: 3 },
    { id: 'g2', step: 28, damage: 4, hitstop: 0.04, shake: 4, rage: 3 },
    { id: 'g3', step: 41, damage: 5, hitstop: 0.05, shake: 5, rage: 3 },
    { id: 'g4', step: 45, damage: 5, hitstop: 0.05, shake: 5, rage: 3 },
    { id: 'g5', step: 57, damage: 6, hitstop: 0.06, shake: 6, rage: 4, big: true },
    { id: 'g6', step: 68, damage: 7, hitstop: 0.07, shake: 7, rage: 4 },
  ],
  // The beat-down doesn't end on this sheet either: one frame after the last
  // strike lands (g6 @68) it flows straight into the Uppercut sheet, which
  // delivers the finisher instead of the sheet's own throw. Push this past
  // `releaseStep` to fall back to that throw.
  uppercutAt: 69,
  // The throw at `releaseStep` â€” routed through the normal launch/knockback path.
  // Now only reached via the lethal path or if `uppercutAt` is disabled above.
  release: {
    damage: 16, kb: { x: 330, y: -400 },
    hitstop: 0.14, shake: 14, rage: 10, big: true,
  },
};

/* --------------------------------------------- manual combo (Cont.Combo) */
// Player-driven punches, read off the 7x6/38 sheet: each punch is a chamber â†’
// strike â†’ retract cycle that starts and ends on the same guard pose, so the
// cycle flows back into itself seamlessly. Frame 3 == GrabAttack frame 17, which
// is why the takeover lands without a snap â€” and why the hand-off back does too.
const MCOMBO = {
  fps: 30,
  stamina: 5.0,          // SECONDS of manual combo, consumed by elapsed time
  // Which fist reads as "next" for the HUD prompt. Alternating LMB/RMB advances
  // it; so does mashing one button past this many taps in a row (below that a
  // repeat is swallowed, so a fumbled alternation isn't mistaken for a mash).
  // Cosmetic only since `laps` fixed the string length â€” see `feedManualCombo`.
  mashRepeats: 3,
  // ONE continuous punch circle: it never restarts and never jumps between
  // sections, it just keeps looping seamlessly until the lap count is met.
  // EXACT number of complete circles before the hand-off. Fixed, not a floor:
  // the expected input is LMB tapped continuously for the whole sequence, so a
  // length that grew with the tapping would never land the finisher on the same
  // beat twice. Input can neither extend this nor cut it short.
  laps: 4,
  loop: {
    frames: FR(3, 28),   // the sheet's punch cycle (the throw is the finisher)
    impacts: [9, 17, 23],  // sheet frames where a fist lands â€” one hit each, per lap
    exitAt: 28,            // the circle's closing frame â€” the ONLY place it breaks,
                           // so the string is always N whole laps, never a cut one
    hit: { damage: 6, hitstop: 0.05, shake: 5, rage: 4 },
  },
  finish: { frames: FR(29, 37), launchAt: 33 },             // throw + recovery
};

// Whiffed grab: play the sheet forward then back once (the art only holds the
// reach, so the ping-pong IS the retract). `PING` drops the shared endpoint so
// the turn-around doesn't stutter on a duplicated frame.
const PING = (list) => list.concat(list.slice(0, -1).reverse());

ATTACKS.grab = {
  anim: 'grab',
  frames: FR(0, 83),
  fps: GRAB.fps,
  lock: true,                            // uninterruptible commitment
  windows: {},                           // damage is grab-driven, not AABB-driven
  grab: GRAB,
};

// The manual combo isn't a linear frame list â€” it's a looping section driven by
// `advanceManualCombo` (hung off `manual`, exactly like `grab`). `frames` is only
// the fallback list the generic playback would use.
ATTACKS.contCombo = {
  anim: 'contCombo',
  frames: MCOMBO.loop.frames,
  fps: MCOMBO.fps,
  lock: true,
  windows: {},
  manual: MCOMBO,
};

// The finisher: the EXISTING uppercut sheet, re-driven as the tail of the grab
// rather than as a move of its own. Frames and fps are borrowed from `uppercut`
// so the two can never drift apart; only the payload differs â€” this one is the
// end of a whole beat-down, so it hits far harder than the standalone launcher.
// Damage is grab-driven (`windows: {}`), applied to the held enemy at `launchAt`.
ATTACKS.grabUppercut = {
  anim: 'uppercut',                      // reuse the sheet â€” nothing new to load
  frames: ATTACKS.uppercut.frames,
  fps: ATTACKS.uppercut.fps,
  lock: true,
  windows: {},
  grabFinish: {
    launchAt: 9,                         // the frame the fist connects on that sheet
    hit: {
      damage: 30, kb: { x: 300, y: -640 },
      hitstop: 0.22, shake: 22, rage: 16, big: true,
    },
  },
};

ATTACKS.grabFail = {
  anim: 'grabFail',
  frames: PING(FR(0, 16)),               // 17 out + 16 back = 33 steps
  fps: 48,                               // â‰ˆ 0.69 s â€” committed, but not sluggish
  lock: true,                            // no movement/attacks for the whiff window
  windows: {},                           // a miss deals no damage
  // â€¦and because it has no windows it had no SOUND: the whiff system fires when a
  // hit window CLOSES with nothing in the ledger, and a move with no windows
  // never closes one. So the one attack in the game that is a miss BY
  // DEFINITION was the only one that missed silently. `whiffStep` is the frame
  // his arm is out â€” a step before the ping-pong's apex at 16, so the air moves
  // as the arm sweeps rather than after it has stopped.
  whiffStep: 12,
};

/* ============================ PICKUP / CARRY / THROW (hold L2) ============
 * A SECOND, SEPARATE grab. The one above â€” G / MMB / R2, one press â€” is the
 * pull-and-beat-up and is not touched by any of this: different button,
 * different sheets, different state variable, different table entries. The two
 * can never interact, which is deliberate; `carriedEnemy` is its own global
 * precisely so that `releaseGrab`, `endAttack` and `startAttack` â€” all of which
 * reach for `grabbedEnemy` â€” cannot reach a man who is being carried.
 *
 * L2 ALREADY MEANT SOMETHING. It is the EXECUTION button, and the conflict is
 * resolvable rather than a clash because the two can never want the same target:
 * every entry in EXECUTIONS is gated `victim: (e) => e.boss`, and `isGrabbable`
 * refuses a boss outright. So one press asks the execution resolver first â€” the
 * same `execManualPick` the on-screen prompt uses, so the press still plays
 * exactly the finisher the L2 over his head was offering â€” and only becomes a
 * pickup when that resolver declines. Nothing about the execution changed.
 *
 * The flow, and where each number came from (all measured in carry_prep.js):
 *   press    -> ATTACKS.pickup, paired frames 0-18 @ 32fps
 *   step 9   -> `latchStep`: Darki's hands close as Agbero leaves his feet.
 *   step 18  -> `seatedStep`: both layers reach the overhead pose together.
 *   (NO MARK ON THE PRESS -> the pickup never starts: L2 plays ATTACKS.grabFail,
 *    the same hands-out whiff the other grab throws. See `startAttack`.)
 *   held     -> CARRY: a STANCE, not an attack. He walks, he cannot swing.
 *   release  -> ATTACKS.carryThrow
 *   step 11  -> `releaseStep`: sheet frame 91, visibly clear of his hands.
 */
const CARRY = {
  // Reach is the grab's, deliberately: two moves that both mean "the man in
  // front of me" must agree about who that is, or the pickup would grab someone
  // the grab would not and the player would have to learn two ranges.
  reach: GRAB.reach,
  minGap: GRAB.minGap,
  lane: GRAB.lane,

  fps: 32,
  latchStep: 9,          // new paired take: hands close as Agbero leaves his feet
  seatedStep: 18,        // both layers reach the overhead pose together

  // Where the held body rides. `x` is forward of Darki's feet; `lift` is applied
  // through the enemy's `jumpY` rather than his `y`, because `y` is his LANE â€”
  // moving it to raise him would walk him into the background and change how he
  // sorts against everyone else on the street.
  anchor: { x: 6, lift: -140 },

  // He can still walk, but not at fighting speed â€” he is carrying a man.
  moveMul: 0.72,

  // The hold is not free. Without a ceiling a player could carry an enemy for
  // the whole section and the wave would stall on a man who can neither fight
  // nor be counted; this drops him automatically instead of ending the level in
  // a state nothing can resolve.
  maxHold: 6.0,

  /* THE WIND-UP. The throw is not one fixed shove â€” it is CHARGED by how long
   * he has held the man over his head, so the mechanic has a decision in it
   * rather than one button press. A snap release is a quick disposal that gets
   * a body off you; a wound-up one is a launch across the street.
   *
   * `full` is deliberately well short of `maxHold`: the ceiling exists to stop
   * a wave stalling, and if maximum power arrived at the same moment the arms
   * gave out the two would read as the same rule. Reaching full at 1.5 s and
   * dropping at 6 s means the charge is a beat you take on purpose, and the
   * drop is a penalty you had almost five seconds of warning about.
   *
   * Everything the throw does scales off ONE number (`carryPower`, 0..1) â€” the
   * damage, the distance, the freeze, the shake, the flash, the sparks and the
   * impact the body carries into whoever it lands on. That is what stops a
   * "powerful" throw being a pile of independently-tuned constants that drift
   * apart the first time one of them is nudged.
   */
  charge: {
    full: 1.25,          // a deliberate beat, but quick enough for an arcade crowd
    dmgMul: 2.0,
    kbMul: 1.85,
    liftMul: 1.40,       // full power climbs before it drives across the street
    fxMul: 1.65,         // strong feedback without a third-second simulation freeze
    rageMul: 1.75,
  },

  throw: {
    fps: 30,
    // 80-89 plants and coils, 90 is the whip, 91 is visibly empty hands, and
    // 92-106 is the authored recovery. Keeping the anticipation is what makes
    // the much faster launch read as strength instead of teleportation.
    frames: FR(80, 106),
    releaseStep: 11,     // sheet frame 91: Agbero has visibly cleared his hands
    damage: 20,
    kb: { x: 500, y: -390 },
    hitstop: 0.15, shake: 18, rage: 14, big: true,
  },

  // A thrown body is a WEAPON while it is in the air. Reuses hitEnemy's payload
  // shape so the man it lands on reacts exactly as he would to any other blow.
  impact: {
    radius: 82,          // generous enough for a fast body to connect between frames
    damage: 16, kb: { x: 320, y: -340 },
    hitstop: 0.12, shake: 14, rage: 10, big: true,
    selfDamage: 6,       // â€¦and it hurts the projectile too
  },
};

// Explicit states, mirroring GRAB_STATE so the debug readout reads the same way
// for both grabs and no path can leave a man half-attached.
const CARRY_STATE = {
  NONE: 'None', REACH: 'PickupAttempt', WHIFF: 'PickupWhiff',
  LIFT: 'Lifting', HOLD: 'Carrying', THROW: 'Throwing',
};
let carryState = CARRY_STATE.NONE;
let carriedEnemy = null;

// Both halves are `lock: true` and carry no `windows`: like the grab, the damage
// here is state-driven (applied to a man who is held, or to whoever the flying
// body lands on) rather than resolved out of an AABB against the world.
ATTACKS.pickup = {
  anim: 'pickup',
  frames: FR(0, 18),
  fps: CARRY.fps,
  lock: true,
  windows: {},
  carry: CARRY,
};

ATTACKS.carryThrow = {
  anim: 'throwEnemy',
  frames: CARRY.throw.frames,
  fps: CARRY.throw.fps,
  lock: true,
  windows: {},
  carryThrow: CARRY,
};

/* ============================== RUSH (forward, forward) ==================
 * The classic arcade approach: tap the same direction twice and Darki charges
 * the man in front of him, then STOPS and waits for the player to pick the
 * follow-up. He never throws one on his own â€” reaching the enemy only opens a
 * window, and what comes out of it is whatever the player presses:
 *
 *   NORMAL -> (fwd,fwd) -> RUSH -> RUSH COMBAT WINDOW -> â–¡ : the grab combo
 *                                                      -> R1: the 5-hit combo
 *
 * Both of those are the EXISTING moves, started through the existing
 * `startAttack`, so hit detection, damage, timing and recovery are untouched
 * and there is no second copy of either. The window is a windowed REMAP of two
 * buttons and nothing more: outside it, â–¡ is still the left jab.
 *
 * The tap detector reads EDGES, never held state, which is what makes "holding
 * forward must not rush" true by construction rather than by a guard.
 */
const RUSH = {
  tapWindow: 0.26,       // seconds between the two taps â€” a dash window, not a hold
  maxRange: 760,         // the furthest enemy worth charging
  minRange: 96,          // â€¦and closer than this there is nothing to close
  speed: 1000,           // px/s while charging
  stopAt: 118,           // stop this far short. MUST be < GRAB.reach (132) or the
                         // grab that the window exists to set up would whiff.
  laneRate: 260,         // px/s of lane convergence, so the follow-up shares his row
  maxTime: 1.4,          // failsafe: a charge can never run forever
  windowT: 0.9,          // how long the player has to choose
  fps: 24,

  /* THE FREE SPRINT. Forward-forward with nobody worth charging no longer does
   * nothing â€” it runs. Same button, same tap, same animation; the only
   * difference is that there is no mark to home on, so the player steers and
   * the player stops.
   *
   * It is a HOLD, unlike the targeted charge: he runs while the direction is
   * down and stops the moment it is let go. That difference is deliberate
   * rather than accidental. The charge is a committed approach with a fixed
   * destination and you are buying the arrival; the sprint is traversal, and
   * traversal you cannot stop is a trap, not a movement system.
   *
   * Lane steering stays LIVE while he runs (see updateRushFree). Being able to
   * cut up or down the street mid-sprint is what makes it a dodge as well as a
   * dash, and it costs nothing to allow because the lane is not what the
   * stamina is paying for.
   */
  free: {
    // A crisp tap-tap where the second tap is RELEASED still buys a short dash.
    // The command fires on an edge, so requiring the hold from frame one would
    // make a clean double-tap start a sprint and abandon it in the same breath â€”
    // a stumble, and the player would read it as the input being dropped.
    //
    // It also gives the move two honest expressions instead of one, which is
    // where the depth is: tap-tap is a ~180 px dodge-dash you throw sideways out
    // of trouble, tap-and-hold is the sustained sprint. Same command, and which
    // one you get is decided by your thumb rather than by a second binding.
    minRun: 0.18,
    maxTime: 2.6,        // failsafe only â€” the gauge is what actually stops him
    stallEps: 0.5,       // pinned against a wall for a frame -> stop, don't drain
  },

  /* THE GAUGE, and the reasoning behind every number in it.
   *
   * The brief: he is a big man, so the burst has to deplete quickly; players
   * must not be able to abuse it; it still has to be generous enough to enjoy.
   * Those pull against each other, and the resolution is that the cost is TIME
   * SPENT RUNNING plus a small ignition charge â€” not a flat per-dash price. A
   * short combat charge is therefore cheap because it is short, and a long
   * street sprint is expensive because it is long, with no special case telling
   * the two apart.
   *
   *   full bar, held down    (1 - 0.12) / 0.60 = 1.47 s  ->  ~1470 px at speed
   *                          1000. That is a screen and a bit (VIEW_W 1280), so
   *                          one bar crosses the fighting space with room over.
   *   a targeted charge      typically 0.3-0.6 s -> 0.30-0.48 of the bar. Two
   *                          full charges per bar, refilled in about 1.3 s each.
   *   tap-dash spam          each stab costs `startCost` before it moves him an
   *                          inch, so four quick 0.25 s dashes cost 1.08 â€” more
   *                          than the bar holds. THIS is the anti-abuse lever;
   *                          without an ignition charge, regen would cover
   *                          infinite stutter-dashing and the gauge would be
   *                          decoration.
   *   running yourself out   is the only way to earn `windedDelay`, and it is
   *                          three times the ordinary pause. Stopping one beat
   *                          early is rewarded; redlining is punished. Ending a
   *                          sprint by choice at 0.05 is back to usable in
   *                          ~0.9 s, bottoming out takes ~1.8 s.
   */
  stamina: {
    startCost: 0.12,     // paid on the press, before he has travelled anywhere
    minStart: 0.20,      // â€¦and below this the dash is refused outright
    drain: 0.60,         // per second of actually running
    regen: 0.36,         // per second once he is not
    regenDelay: 0.35,    // a beat before it starts coming back
    windedDelay: 1.20,   // â€¦a much longer one if he ran the bar to nothing
  },
};

/* THE DASH ATTACK â€” the kick button, out of a sprint, at anybody or nobody.
 *
 * This is the move that makes the sprint a COMBAT system instead of a way to
 * walk faster, and it is the one follow-up that does not need a mark: the
 * targeted window's â–¡ and R1 both resolve onto a specific man, but a running
 * kick is thrown at a piece of street and connects with whoever is standing in
 * it. That is what lets "rush when the enemy is not in sight" still end in an
 * attack.
 *
 * It reuses the EXISTING high-kick sheet â€” same frames, same fps â€” because the
 * difference between a standing kick and a running one is momentum, and
 * momentum is physics. `lunge` carries his sprint into the swing; the payload
 * is heavier than ATTACKS.highKick's 15 for exactly that reason and no other.
 *
 * The window is four steps rather than the standing kick's three. Not a buff
 * for its own sake: he is closing at 1000 px/s plus a 700 px/s lunge, and a
 * three-step window is thin enough that a body can cross the whole box between
 * two frames â€” the hit would be lost to the frame rate rather than to the aim.
 *
 * The cost is real. It is `lock: true` with a long recovery, it eats what is
 * left of the gauge on a miss, and it commits his position â€” whiffing one into
 * empty air at the wrong moment is how you get surrounded.
 */
ATTACKS.rushKick = {
  anim: 'highKick',                      // the existing sheet, nothing new to load
  frames: ATTACKS.highKick.frames,
  fps: ATTACKS.highKick.fps,
  lock: true,                            // committed â€” no cancelling out of a dash
  lunge: { speed: 700, until: 9 },       // decays to nothing as the foot lands
  windows: Object.fromEntries([6, 7, 8, 9].map((s) => [s, {
    group: 'rk', swing: 'kick', box: { x: 14, w: 150, top: -235, h: 215 },
    damage: 24, kb: { x: 430, y: -400 }, launch: true,
    hitstop: 0.16, shake: 17, rage: 14, big: true,
  }])),
};

const RUSH_STATE = {
  NONE: 'None', CHARGE: 'Rush', FREE: 'FreeRun', WINDOW: 'RushCombatWindow',
};
let rushState = RUSH_STATE.NONE;
let rushTargetRef = null;
// Tap bookkeeping. `rushTapPrev` is last frame's held state, so only a fresh
// press counts; `rushTapAt` is when each side was last tapped.
const rushTapPrev = { left: false, right: false };
const rushTapAt = { left: -Infinity, right: -Infinity };

// Max ms between consecutive LMB clicks that count toward the 2-click combo run.
const COMBO_CLICK_WINDOW = 350;

// Rage: fills as Darki deals/takes damage. At full it auto-bursts into a short
// power state (heavier hits, faster footwork, a golden aura + shockwave) â€” but
// only ever off one of HIS OWN connected hits; see `RAGE_BURST`.
const RAGE_MAX = 100;
const RAGE_DUR = 7;              // seconds of empowered state
const RAGE_DMG_MUL = 1.6;
const RAGE_SPEED_MUL = 1.3;
const RAGE_ON_HURT = 10;        // rage gained per point... applied per hit below

// The auto-burst shockwave. Both gates below exist because the burst was reading
// as PHANTOM DAMAGE rather than as Darki's own special:
//   * it could tip over from rage earned by TAKING hits, so enemies were chipped
//     and knocked down with no attack from the player at all (10 ginger jabs did
//     it, and a ginger's jab is the only damage they deal);
//   * it had no facing check, so it caught enemies BEHIND Darki â€” landing a hit
//     on the ginger in front knocked down the one at your back.
// Both are dials: flip them back for the old omnidirectional, self-firing burst.
const RAGE_BURST = {
  fromHurt: false,     // may rage earned by SUFFERING a hit tip the bar into the burst?
  frontOnly: true,     // respect facing â€” never catch enemies behind Darki
  behindGrace: 40,     // ...but someone practically on top of him still counts
  rangeX: 300, rangeY: 90,
  damage: 8,
  kb: { x: 320, y: -360 },
};

const rageMul = () => (player.rageActive ? RAGE_DMG_MUL : 1);
// 'grabbed' is excluded too: a held enemy takes damage only from the grab's own
// synchronised strikes, never from stray hitboxes or the rage shockwave.
// 'carried' is excluded for the same reason and one more: he is the WEAPON, and
// a weapon that can be knocked out of your hands by your own shockwave would
// break the hold from a source the player never aimed at him.
const isEnemyHittable = (e) => !e.execVictim &&
  e.state !== 'hit' && e.state !== 'down' && e.state !== 'ko'
  && e.state !== 'grabbed' && e.state !== 'carried';
const playerHittable = () => player.state === 'normal' && player.invuln <= 0;

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// World-space AABB for the active hit window, mirrored to face direction. A
// `box.back` window (the back kick) is placed on the side OPPOSITE the facing.
function attackBox(win) {
  let dir = player.facing >= 0 ? 1 : -1;
  if (win.box.back) dir = -dir;
  const bx = dir > 0 ? player.x + win.box.x : player.x - win.box.x - win.box.w;
  const by = player.y + player.jumpY + win.box.top;
  return { x: bx, y: by, w: win.box.w, h: win.box.h };
}

// Approximate on-screen body box of an actor (foot-anchored), for hit tests.
// MC_Olodo is a wider, taller body than a Ginger, so his box is measured off
// his own sheet â€” otherwise half of him would be unhittable.
function enemyBodyBox(e) {
  const h = e.boss
    ? (olodoStanceSprite?.drawH ?? 255) * tune.bossScale
    : (gingerWalkSprite?.drawH ?? 200) * tune.enemyScale;
  // Height comes off the sheet, so it tracked the boss down from drawH 268 to
  // 235 on its own; his WIDTH is a constant and did not. 46 was his half-width
  // at the old size (0.215 of his drawn height, against a Ginger's 0.194 â€” he is
  // a proportionally wider man). Scaled by the same factor rather than
  // re-picked, so that ratio holds: left at 46 the box would stand ~6px proud of
  // his arm on each side and eat blows that visibly stop short of him.
  // `bosshitbox.js` measures what that costs the player end-to-end.
  const halfW = e.boss ? 40 : 30;
  return { x: e.x - halfW, y: (e.y + e.jumpY) - h, w: halfW * 2, h: h + 10 };
}

// `fromHurt` marks rage earned by SUFFERING a hit. It still fills the bar, but
// (by default) it can never be the thing that sets the burst off â€” the bar just
// sits full until Darki's next connected hit fires it, so a burst is always
// attributable to something the player did. See `RAGE_BURST.fromHurt`.
function addRage(n, fromHurt = false) {
  if (player.rageActive) return;                 // no build-up while empowered
  player.rage = Math.min(RAGE_MAX, player.rage + n);
  if (player.rage >= RAGE_MAX && (RAGE_BURST.fromHurt || !fromHurt)) activateRage();
}

function activateRage() {
  player.rageActive = true;
  player.rageTimer = RAGE_DUR;
  player.rage = RAGE_MAX;
  triggerFlash('255,196,64', 0.4);               // gold screen wash
  triggerHitFx(player.x, player.y - 110, 0.12, 16, true);
  spawnEmbers(player.x, player.y - 40, 40, '#ffcf5a', 120);
  // shockwave: shove and chip everyone nearby â€” in FRONT of Darki only, so
  // nobody at his back falls over from a hit he never aimed at them.
  const face = player.facing >= 0 ? 1 : -1;
  // NEAREST FIRST. Each body floored on one frame queues behind the last
  // (FALL_VARY.stagger), so the order they are visited in is the order they go
  // over â€” and a blast that reaches the man at arm's length before the man three
  // paces back is both what actually happens and what makes the knockdown read
  // as a wave travelling outward instead of a row of skittles.
  const caught = enemies.slice().sort((a, b) =>
    Math.abs(a.x - player.x) - Math.abs(b.x - player.x));
  for (const e of caught) {
    if (!isEnemyHittable(e)) continue;
    const dx = e.x - player.x;
    if (RAGE_BURST.frontOnly && dx * face < -RAGE_BURST.behindGrace) continue;
    if (Math.abs(dx) > RAGE_BURST.rangeX || Math.abs(e.y - player.y) > RAGE_BURST.rangeY) continue;
    const dir = Math.sign(dx) || face;
    if (e.boss) {                      // super armour holds through the shockwave:
      e.hp -= RAGE_BURST.damage;       // it chips and jolts him, never floors himâ€¦
      e.hpFlash = 0.25;
      if (e.hp > 0) { staggerBoss(e, dir, RAGE_BURST.kb.x); continue; }
      launchEnemy(e, RAGE_BURST.kb, dir, 0, true);   // â€¦unless it is the finisher
      continue;
    }
    launchEnemy(e, RAGE_BURST.kb, dir, RAGE_BURST.damage, false);
  }
}

/* ------------------------------------------- nobody falls on the same frame */
// One blow can floor a whole group â€” the rage shockwave catches everyone in
// front of Darki, and a launcher can catch two men standing together. Given the
// same knockback on the same frame they were doing the same thing at the same
// millisecond: one stacked THUD instead of three, one groan playing three times
// over itself, and all of them sitting up in perfect unison like a drill squad.
// The bodies were fine; the SYNCHRONY was the problem.
//
// So every launch draws its own numbers. Four independent sources, because
// fixing only one still leaves the rest in step:
//
//   `hold`   â€” the big one. A struck man does not leave the ground instantly; he
//              takes the blow, folds, and THEN goes over. Holding him on the
//              sheet's struck frames for a random moment first is both truthful
//              and the thing that actually separates the landings, because every
//              other timing downstream is measured from when the arc starts.
//   `lift` / `shove` â€” the arc itself, so they do not fly in formation and their
//              flight times differ on top of the hold.
//   `rate`   â€” the fall/get-up playback speed, which is also what scatters the
//              get-ups now that there is no dwell on the deck to vary (see
//              DOWN_DUR): a man who goes down faster is up faster, and two who
//              DO land together are still not the same man twice.
//
// All from `combatRng`, not Math.random: these move bodies, so they are gameplay
// and have to stay deterministic for the harnesses.
const FALL_VARY = {
  hold: 0.20,               // up to this long absorbing the blow before going over
  lift: [0.82, 1.18],       // scales kb.y â†’ flight time
  shove: [0.84, 1.16],      // scales kb.x â†’ how far he travels
  // NOTE there is no `down` here any more. It used to scale a 1.6 s timer that
  // the knockdown animation only filled 0.71 s of, so what it actually varied
  // was how long he lay motionless â€” and the hold itself is gone (see DOWN_DUR).
  // `rate` inherited the job: it varies how fast he goes down and gets up, which
  // is a man moving at his own speed rather than a man waiting a random while.
  // Widened from 0.90-1.10 to cover the spread the old timer used to provide.
  rate: [0.84, 1.16],       // fall/get-up playback speed
  vo: 0.13,                 // seconds of scatter on the fall groan
  // â€¦and the one that is NOT random. Four independent draws from a 0.2 s range
  // land inside about 0.07 s of each other more often than not â€” measured, the
  // first pass at this spread four bodies over just 5 frames, which still reads
  // as a stacked thud. Randomness alone cannot promise separation; this does.
  // Each additional body floored ON THE SAME FRAME waits this much longer than
  // the one before, so a group is guaranteed to go over in sequence and the
  // random hold on top decides by how much more.
  stagger: 0.085,
};
const varyRange = ([lo, hi]) => lo + combatRng() * (hi - lo);
// How many bodies have been launched this frame â€” reset at the top of update().
let launchesThisFrame = 0;

// Send an enemy into the knockback/launch arc (used by uppercut + rage burst).
function launchEnemy(e, kb, dir, dmg, killable = true, opts = {}) {
  e.hp -= dmg;
  e.hpFlash = 0.25;
  e.state = 'hit';
  e.vx = dir * kb.x * varyRange(FALL_VARY.shove);
  e.vy = kb.y * varyRange(FALL_VARY.lift);
  // Random spread, PLUS a guaranteed queue position for anyone floored by the
  // same blow on the same frame.
  // A carry throw is already preceded by a long, visible coil and release. The
  // generic impact hold makes that body hover over Darki's empty hands, so this
  // one launch starts moving immediately; ordinary simultaneous knockdowns keep
  // their anti-synchrony queue.
  e.fallHold = opts.immediate
    ? 0
    : combatRng() * FALL_VARY.hold + launchesThisFrame * FALL_VARY.stagger;
  launchesThisFrame++;
  e.fallRate = varyRange(FALL_VARY.rate);
  e.jumpY = Math.min(e.jumpY, -1);
  e.facing = -dir;
  // A launch that is NOT ALLOWED TO KILL must not be able to leave a man on zero
  // either. The rage shockwave chips everyone in front of Darki with
  // `killable: false`, so `dying` never gets set â€” and a mob whose health the
  // burst took to 0 got straight back up and kept fighting as a body the wave
  // counter reads as dead. The quota then drip-fed reinforcements in behind him,
  // the section cleared with men still on their feet, and the gate opened on a
  // fight that was supposed to be over. He keeps a sliver instead.
  if (!killable && e.hp <= 0) e.hp = 1;
  e.dead = killable && e.hp <= 0;
  // `dead` is CONSUMED on landing (it only decides which state he lands in), so
  // it cannot be what the death animation reads â€” by the time he is on the
  // tarmac it is already false again. `dying` is the durable answer to "did this
  // fall kill him", set from the health check and true from the lethal blow
  // until the body is gone. It is the one thing that separates the two fall
  // sheets, and it is health, never "he is horizontal".
  if (e.dead) e.dying = true;
  // The vocal splits HERE, on the same test, so a knockdown can never borrow a
  // death cry and a death can never sound like a man who is getting back up.
  // `diedVo` makes the death cue once-per-death: a body can be re-launched by a
  // rage burst or a second blow landing in the same frame, and a corpse crying
  // out twice is the sort of thing that only shows up in play.
  if (!e.boss) {
    // Scattered by the same draw that scatters the fall, so the man who goes
    // over last cries out last.
    const vo = e.fallHold + combatRng() * FALL_VARY.vo;
    if (e.dying) {
      // One clip, every death. Deterministic by request.
      if (!e.diedVo) { e.diedVo = true; playCue('deathCry', e.x, 1, null, vo); }
    } else {
      // Every knockdown he survives, the same clip. Deterministic by request.
      playCue('fallGroan', e.x, 1, null, vo);
    }
  }
  attackTokens.delete(e);
  e.mode = 'menace';
  e.didHit = false;
}

// Apply one attack window to an enemy: damage, feedback, and the right reaction
// (light hits stagger in place; launchers / killing blows send them flying).
function hitEnemy(e, win) {
  const dmg = win.damage * rageMul();
  const dir = Math.sign(e.x - player.x) || player.facing || 1;
  e.hp -= dmg;
  e.hpFlash = 0.25;
  addRage(win.rage);
  const ko = e.hp <= 0;
  const impactX = (player.x + e.x) / 2;
  triggerHitFx(impactX, e.y - 110, win.hitstop, win.shake, !!win.big);
  // A window may name its OWN impact clip (the combo's opening two fists carry
  // the two bursts of 2hits_punch1). It replaces the generic bag rather than
  // stacking on it â€” two impact sounds on one impact is mud, not weight.
  if (win.cue) playCue(win.cue, impactX);
  else playHit(win);                              // varied hit SFX (anti-repeat + weight)
  // The Agbero says something about it. This one is for a blow he TAKES AND
  // STAYS UP FOR; the fall groans and the death cries are chosen at the launch
  // below, because only there is it known which of the three this was.
  //
  // The single repeated agbero-groan.mp3 is retired here in favour of the
  // supplied three-groan set, dealt from a bag so the same one cannot land
  // twice running. The GATE is unchanged and deliberately so: a launch and a
  // killing blow already have their own vocal a few lines down, and adding a
  // hit groan on top of a fall groan is two voices out of one man.
  if (!e.boss && !ko && !win.launch) playAgberoHit(e.x);
  // 5-hit combo taunt: fire once when the full string (all of c1..c5) connects.
  // THE COMBO FINISHER. Five hits, all of them on this man, and the execution
  // takes over. Checked against `attackHits` (keyed enemy@group) rather than
  // `comboHits` (groups only, any target) â€” with a crowd around him, a string
  // spread across three bodies is not a combo ON one of them.
  //
  // It cannot start HERE: this runs inside resolveAttackHits' loop over the
  // enemies, and startExecution calls endAttack, which nulls `attackHits` â€” the
  // very set the next iteration is about to read. So it is queued and started
  // once the frame's attack step is finished.
  if (player.attack === 'combo5' && win.group === 'c5' && player.attackHits && !player.pendingExec
      && EXECUTIONS.darki_olodo.victim(e)
      && ['c1', 'c2', 'c3', 'c4', 'c5'].every((g) => player.attackHits.has(e.id + '@' + g))
      && canExecute(e, EXECUTIONS.darki_olodo, { fromCombo: true }))
    player.pendingExec = e;
  if (player.attack === 'combo5' && win.group && player.comboHits) {
    player.comboHits.add(win.group);
    if (!player.comboVoDone && win.group === 'c5' && player.comboHits.size >= 5) {
      player.comboVoDone = true;
      if (comboVoiceSection !== section) {
        comboVoiceSection = section;
        playDarkiVoice('combo5');
      }
    }
  }
  if (isHeavyHit(win)) triggerFlash('255,255,255', 0.14);
  // Boss super armour: only the killing blow puts MC_Olodo on the tarmac, and
  // only a HEAVY blow breaks his rhythm â€” a jab string chips him but can never
  // stun-lock him out of his combo the way it can a Ginger.
  if (e.boss && !ko) {
    if (isHeavyHit(win)) staggerBoss(e, dir, win.kb.x);
    return;
  }
  if (win.launch || ko) {
    launchEnemy(e, { x: win.kb.x, y: win.kb.y || -420 }, dir, 0);
    e.dead = ko;
  } else {
    e.state = 'stagger';                          // brief flinch, stays grounded
    e.staggerTimer = 0.2;
    e.vx = dir * win.kb.x;
    e.facing = -dir;
    attackTokens.delete(e);
    e.mode = 'menace';
  }
}

/* ------------------------------------------------------------ whiffs */
// THE RULE, and it is the whole design: the ANIMATION says when the blow
// happens, the COLLISION says whether it connected. So a whiff cannot be decided
// when a swing starts â€” only when its hit window has closed with nothing in the
// ledger for it.
//
// A "window" is a `group`, and a group can span several steps (the uppercut's
// runs 9-14). So the close happens when the group CHANGES, not every step, or
// one swing would whiff six times. `player.openWindow` is that group, held open
// across its steps and closed by the next group or by the end of the move.
//
// Volume rules for the ATTACKS table rather than the sound code: a window
// carrying `swing: 'kick'` whiffs as a boot, anything else as a fist.
function openAttackWindow(win) {
  const group = win ? win.group : null;
  if (player.openWindow && player.openWindow.group === group) return;
  closeAttackWindow();
  player.openWindow = group ? { group, kick: win.swing === 'kick' } : null;
}

// Close the open window and, if the ledger has no hit for it, whiff. Reads
// `attackHits`, so it MUST run before endAttack clears the ledger.
function closeAttackWindow() {
  const w = player.openWindow;
  player.openWindow = null;
  if (!w || !player.attackHits) return;
  for (const key of player.attackHits) if (key.endsWith('@' + w.group)) return;   // it landed
  playWhiff(w.kick, true, player.x + player.facing * 60);
}

// One whiff. `byPlayer` picks whose recording it is; the fallback chain is the
// one asked for â€” specific fist, specific kick, then the generic clip â€” and it
// is a chain rather than a lookup so a missing or undecodable file degrades to a
// sound instead of to silence.
let sfxWhiffs = 0, lastWhiffAt = -1;
function playWhiff(kick, byPlayer, atX) {
  // Debounce: two windows can close on the same frame (a cancel, a chained jab),
  // and two whiffs one millisecond apart is a click, not a swing.
  const now = audioCtx ? audioCtx.currentTime : lastWhiffAt + 1;
  if (now - lastWhiffAt < 0.05) return;
  lastWhiffAt = now;
  sfxWhiffs++;                                 // wiring counter (counts when silent)
  const first = kick ? (byPlayer ? 'whiffKickP' : 'whiffKickE')
    : (byPlayer ? 'whiffFistP' : 'whiffFistE');
  // Fall back on whether the specific clip DECODED, not on whether playback
  // returned true â€” with no audio device every call "fails", and keying the
  // fallback off that fires two cues for one swing.
  playCue(cueBuf[first] || !cueBuf.whiffAny ? first : 'whiffAny', atX);
}

// Scan the active window against every hittable enemy (one hit per group).
function resolveAttackHits() {
  const move = ATTACKS[player.attack];
  const win = move?.windows[player.attackStep];
  if (!win) return;
  const abox = attackBox(win);
  for (const e of enemies) {
    if (!isEnemyHittable(e)) continue;
    if (Math.abs(e.y - player.y) > 48) continue;   // must share the lane
    const key = e.id + '@' + win.group;
    if (player.attackHits.has(key)) continue;
    if (rectsOverlap(abox, enemyBodyBox(e))) {
      player.attackHits.add(key);
      hitEnemy(e, win);
    }
  }
}

/* --------------------------------------------------------- grab mechanic */
// The grab is a LATCHED move: one eligible enemy is seated at a fixed anchor for
// the length of the animation with its AI, navigation, attacks and reactions
// suspended, taking damage on the sheet's strike frames and getting thrown on
// the release frame. `grabbedEnemy` is the single source of truth and EVERY exit
// path funnels through `releaseGrab`, so no actor can be left attached, frozen
// or invulnerable â€” whatever interrupts it.
let grabbedEnemy = null;

// Explicit states for the whole grab flow â€” one variable, always consistent, so
// no path can leave Darki or his victim in a half-attached limbo.
const GRAB_STATE = {
  NONE: 'None', FAIL: 'GrabFail', STARTUP: 'GrabStartup', PULL: 'GrabPull',
  AUTO: 'GrabAutoAttack', MANUAL: 'ManualCombo', RELEASE: 'GrabRelease', RECOVERY: 'Recovery',
};
let grabState = GRAB_STATE.NONE;

// Seat the held enemy on the anchor. `k` is the pull-in blend (0 = where he was
// caught, 1 = fully seated), so the same code does the smooth pull and the
// rock-steady hold.
function seatGrabbed(e, k = 1) {
  const dir = player.facing >= 0 ? 1 : -1;
  const ax = player.x + dir * GRAB.anchor.x;
  const ay = clampLane(player.y + GRAB.anchor.y);
  e.x = e.grabFromX + (ax - e.grabFromX) * k;
  e.y = e.grabFromY + (ay - e.grabFromY) * k;
  e.jumpY = 0; e.vx = 0; e.vy = 0;
  e.facing = -dir;                                   // held face to face
}

// Grab eligibility. Corpses, downed/launched bodies, bosses, invulnerable and
// already-held targets are never grabbable (`boss`/`noGrab`/`invuln` are honoured
// if a future archetype sets them).
function isGrabbable(e) {
  return !!e && !e.benched && !e.grabbed && !e.carried && e.hp > 0
    && !e.boss && !e.noGrab && !(e.invuln > 0)
    && isEnemyHittable(e);
}

// Closest eligible body IN FRONT of Darki, within reach and sharing his lane.
function grabTarget() {
  const dir = player.facing >= 0 ? 1 : -1;
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (!isGrabbable(e)) continue;
    const forward = (e.x - player.x) * dir;              // +ve â†’ in front of him
    if (forward < GRAB.minGap || forward > GRAB.reach) continue;
    if (Math.abs(e.y - player.y) > GRAB.lane) continue;
    if (forward < bestD) { bestD = forward; best = e; }  // nearest wins â†’ only one
  }
  return best;
}

// Seat an enemy in the hold: suspend its AI/physics and remember where it stood
// so the pull-in can ease it onto the anchor instead of teleporting it.
function latchGrab(e) {
  grabbedEnemy = e;
  e.grabbed = true;
  e.state = 'grabbed';               // not "grounded" â†’ lane steering leaves it alone
  e.mode = 'menace';
  e.vx = 0; e.vy = 0; e.jumpY = 0;
  e.staggerTimer = 0; e.downTimer = 0; e.didHit = false;
  e.grabHitT = 0;
  e.grabFromX = e.x; e.grabFromY = e.y;
  attackTokens.delete(e);            // give back the attack token it may hold
  player.grabFullCombo = false;      // a fresh hold has not earned its finisher line
  playGrabSuccess(e);                // the combo hold is a successful grab too
}

// One synchronised strike on the held enemy: damage plus the shared feedback
// stack (hit-stop, shake, sparks, SFX, rage) but WITHOUT the state change that
// would end the hold. A lethal strike releases early rather than beating a corpse.
function applyGrabHit(e, h) {
  e.hp -= h.damage * rageMul();
  e.hpFlash = 0.25;
  addRage(h.rage);
  e.grabHitT = GRAB.hitRecoil;       // drives its existing hit/recoil animation
  e.animTime = 0;                    // replay that recoil from its first frame
  triggerHitFx((player.x + e.x) / 2, e.y - 110, h.hitstop, h.shake, !!h.big);
  playHit(h);
  if (isHeavyHit(h)) triggerFlash('255,255,255', 0.14);
  if (e.hp <= 0) releaseGrab({ launch: true, lethal: true });
}

// Drive the hold for this animation step. Called once per update from
// advanceAttack, and frame-rate independent by construction: strikes are
// "crossed" rather than "equalled" and each is ledgered in `player.attackHits`,
// so a long frame can never skip or double-apply one, and a frame that lingers
// for several updates only ever fires it once.
function updateGrab(move, step) {
  const cfg = move.grab;

  // Latch on the snatch frame â€” re-validated, since the world moved on while the
  // hand travelled. If the mark escaped or died, Darki closes on empty air.
  // `grabDone` stops a completed grab from snatching a second victim on the
  // frames after the throw â€” one enemy per attempt, always.
  if (!grabbedEnemy && !player.grabWhiffed && !player.grabDone && step >= cfg.snatchStep) {
    const t = isGrabbable(player.grabTargetRef) ? player.grabTargetRef : grabTarget();
    if (t) latchGrab(t);
    else {
      // The hand closed on empty air â€” the mark moved or died while it travelled.
      // Same cue as any other miss he throws: the grab reads as an attack, so it
      // has to sound like one that missed.
      player.grabWhiffed = true;
      playWhiff(false, true, player.x + player.facing * 70);
    }
  }
  const e = grabbedEnemy;
  if (!e) {
    grabState = step < cfg.snatchStep ? GRAB_STATE.STARTUP : GRAB_STATE.RECOVERY;
    return;
  }
  if (e.benched) { releaseGrab({ drop: true }); return; }   // left play mid-hold

  // Seat: ease from where he was caught onto the anchor, then hold rock steady.
  // Driven by the animation clock (not accumulated dt), so it lands identically
  // at any frame rate â€” no sliding, no jitter, no drift.
  const span = Math.max(1, cfg.pinStep - cfg.snatchStep);
  const t = Math.max(0, Math.min(1, (player.animTime - cfg.snatchStep) / span));
  seatGrabbed(e, t * t * (3 - 2 * t));                      // smoothstep pull-in

  // Takeover: an alternating-combo click anywhere in the window hands control to
  // Cont.Combo at `takeoverAt` â€” the grab's first damaging frame, and a pose the
  // combo sheet shares, so the swap is seamless and the auto strike never fires.
  if (step >= cfg.takeoverAt && player.mcArmed != null) {
    startManualCombo(player.mcArmed);
    return;
  }

  grabState = step < cfg.pinStep ? GRAB_STATE.PULL : GRAB_STATE.AUTO;

  // Strikes: every configured hit frame we have reached, exactly once, in order.
  for (const h of cfg.hits) {
    if (step < h.step) break;
    const key = 'grab@' + h.id;
    if (player.attackHits.has(key)) continue;
    player.attackHits.add(key);
    applyGrabHit(e, h);
    if (!grabbedEnemy) return;                              // lethal â†’ early release
  }
  // One frame after the last strike: hand the still-held enemy to the uppercut.
  if (step >= cfg.uppercutAt) { enterGrabUppercut(); return; }
  if (step >= cfg.releaseStep) { releaseGrab({ launch: true }); grabState = GRAB_STATE.RECOVERY; }
}

/* -------------------------------------------------- uppercut grab finisher */
// Swap to the uppercut sheet with the hold INTACT. No pause, no drop, no return
// to idle in between â€” the last beat-down punch flows directly into the wind-up.
function enterGrabUppercut() {
  player.attack = 'grabUppercut';
  player.anim = 'uppercut';               // drives the sprite/scale lookups
  player.animTime = 0;
  player.attackStep = 0;
  player.attackHits = new Set();
  player.frame = ATTACKS.grabUppercut.frames[0];
  player.mcArmed = null;                  // nothing can re-arm a takeover now
  grabState = GRAB_STATE.RELEASE;
}

// Drive the finisher. The enemy stays pinned to the anchor through the wind-up
// so the launch reads as the uppercut throwing him, not as a drop that happens
// to be followed by a hit. Once launched the sheet just plays out its recovery.
function updateGrabUppercut(move, step) {
  const cfg = move.grabFinish;
  const e = grabbedEnemy;
  if (!e) return;                         // already launched (or the hold broke)
  if (step < cfg.launchAt) { seatGrabbed(e, 1); return; }
  releaseGrab({ launch: true, force: cfg.hit });
  grabState = GRAB_STATE.RECOVERY;
}

/* ------------------------------------------------- manual combo takeover */
// Cont.Combo is a section state machine rather than a linear frame list, so it
// gets its own driver (hung off `move.manual`, exactly like `move.grab`). The
// hold, the anchor and the enemy's suspended AI all carry straight over â€” only
// who decides the next punch changes.
function startManualCombo(fist) {
  player.attack = 'contCombo';
  player.anim = 'contCombo';
  player.attackHits = new Set();
  player.animTime = 0;
  player.attackStep = 0;
  player.mcStamina = MCOMBO.stamina;      // the 5-second clock starts HERE
  player.mcArmed = null;
  player.mcSection = 'loop';
  player.mcFist = fist;                   // 0 = LMB, 1 = RMB â€” the last fist thrown
  // NOTE: `mcRepeat` is deliberately NOT reset â€” a mash that started during the
  // grab's arming window carries its streak across the hand-off, so the player
  // doesn't have to start counting again the moment the sheet swaps.
  player.mcTime = 0;
  player.mcLap = new Set();               // impacts already landed on this lap
  player.mcLaps = 1;                      // lap 1 starts here
  player.mcEnding = false;
  player.mcExitAt = -1;
  player.frame = MCOMBO.loop.frames[0];
  grabState = GRAB_STATE.MANUAL;
}

// The normal way out: the combo does NOT end on its own sheet. When the last
// circle closes, control goes straight back to GrabAttack at `takeoverAt` â€” its
// first damaging frame â€” and the grab finishes the job from there: the remaining
// strikes, the throw at `releaseStep`, the recovery. The circle's closing frame
// flows into its frame 3, and frame 3 IS grab frame 17, so the swap lands
// mid-motion with no snap, exactly like the takeover did on the way in.
function handBackToGrab() {
  if (!grabbedEnemy) { enterFinish(); return; }   // nobody left to beat down
  player.grabFullCombo = true;                    // every authored combo lap closed
  player.attack = 'grab';
  player.anim = 'grab';
  player.animTime = GRAB.takeoverAt;              // resume ON the shared pose
  player.attackStep = GRAB.takeoverAt;
  player.frame = ATTACKS.grab.frames[GRAB.takeoverAt];
  player.attackHits = new Set();                  // fresh ledger for the grab's strikes
  // MUST stay null: `updateGrab` re-enters Cont.Combo whenever it sees an armed
  // fist at `takeoverAt`, which is the very frame we just resumed on.
  player.mcArmed = null;
  player.mcSection = null; player.mcEnding = false; player.mcExitAt = -1;
  player.mcRepeat = 0; player.mcLaps = 0;
  grabState = GRAB_STATE.AUTO;
}

// Wind the combo down on the combo's OWN sheet â€” only used when the victim is
// already gone (a lethal punch, or the hold broke), since there's nothing left
// to hand back to. The launch is pre-marked done so Darki finishes his motion
// without re-throwing.
function enterFinish() {
  player.mcSection = 'finish';
  player.mcTime = 0;
  player.mcHitDone = !grabbedEnemy;
  grabState = grabbedEnemy ? GRAB_STATE.RELEASE : GRAB_STATE.RECOVERY;
}

// Flag the wind-down. The circle isn't cut mid-swing â€” it keeps flowing to the
// closing frame of the lap it's on and leaves into the finisher from there, so
// what plays is always a whole number of laps plus the throw.
function endCombo() {
  if (player.mcEnding) return;
  player.mcEnding = true;
  player.mcExitAt = MCOMBO.loop.exitAt;
}

function advanceManualCombo(move, dt) {
  const cfg = move.manual;
  const e = grabbedEnemy;

  // Stamina burns on elapsed GAMEPLAY time (dt), not frames â€” and `update` isn't
  // called while paused, so a legitimate pause freezes it for free.
  if (player.mcSection === 'loop') {
    player.mcStamina = Math.max(0, player.mcStamina - dt);
    // `mcLaps` is the lap CURRENTLY playing (1-based), so flagging during lap
    // `laps` exits at that lap's closing frame â€” exactly `laps` circles, whether
    // the player is tapping flat out or has stopped entirely.
    if (player.mcLaps >= cfg.laps) endCombo();
    // Backstop for a lap count the budget can't cover (4 laps is 3.5 s of 5 s).
    else if (player.mcStamina <= 0) endCombo();
  }

  if (e) seatGrabbed(e, 1);                     // stays anchored for the whole combo
  else if (player.mcSection !== 'finish') { enterFinish(); return; }

  /* ---- the finisher: the sheet's own throw, then recovery ---- */
  if (player.mcSection === 'finish') {
    const sec = cfg.finish;
    player.mcTime += dt * cfg.fps * (player.rageActive ? 1.25 : 1);
    const idx = Math.floor(player.mcTime);
    if (idx >= sec.frames.length) { endAttack(); return; }
    player.attackStep = idx;
    player.frame = sec.frames[idx];
    if (!player.mcHitDone && sec.frames[idx] >= sec.launchAt) {
      player.mcHitDone = true;
      releaseGrab({ launch: true });
      grabState = GRAB_STATE.RECOVERY;
    }
    return;
  }

  /* ---- the circle: loops seamlessly while the player keeps alternating ---- */
  const sec = cfg.loop;
  const len = sec.frames.length;
  player.mcTime += dt * cfg.fps * (player.rageActive ? 1.25 : 1);
  if (player.mcTime >= len) {                   // wrap â€” same motion, next lap
    const wraps = Math.floor(player.mcTime / len);
    player.mcTime -= len * wraps;
    player.mcLaps += wraps;                     // now playing lap mcLaps
    player.mcLap.clear();                       // impacts are live again
  }
  const idx = Math.floor(player.mcTime);
  const frame = sec.frames[idx];
  player.attackStep = idx;
  player.frame = frame;

  // Impacts: each landing frame damages once per lap. "Crossed, not equalled"
  // plus the per-lap ledger â†’ never skipped at low fps, never doubled at high.
  for (const im of sec.impacts) {
    if (frame < im || player.mcLap.has(im)) continue;
    player.mcLap.add(im);
    // A KO on the last authored impact of the last lap still counts as a fully
    // completed grab combo, even though there is no living victim to hand back.
    if (player.mcEnding && im === sec.impacts[sec.impacts.length - 1])
      player.grabFullCombo = true;
    applyGrabHit(e, sec.hit);
    if (!grabbedEnemy) { enterFinish(); return; }   // lethal punch â†’ wind down
  }

  // Leaving the circle only ever happens on its closing frame, so the exit reads
  // as a finished lap rather than a cut â€” and it hands back to the grab sheet
  // rather than ending here.
  if (player.mcEnding && frame >= player.mcExitAt) { handBackToGrab(); return; }
}

// True while the manual combo (or its arming window) owns the mouse buttons, so
// clicks drive punches instead of leaking into jabs/kicks.
//
// The arming window is the WHOLE grab up to `takeoverAt`, not just the frames
// after the latch. Gating it on `grabbedEnemy` (set at `snatchStep` 9) left only
// frames 9..16 â€” ~0.24 s â€” so a click during the wind-up was silently dropped and
// the auto beat-down played instead, which reads as "the takeover didn't work".
function manualComboOwnsMouse() {
  if (player.attack === 'contCombo') return true;
  return player.attack === 'grab' && !player.grabWhiffed
    && player.attackStep < GRAB.takeoverAt;
}

// Route this frame's raw mouse edges into the combo. The FIRST click is what
// matters mechanically: it arms the takeover. Once the circle is running its
// length is fixed at `MCOMBO.laps`, so further taps â€” alternating LMB/RMB, or
// mashing one button past `mashRepeats` â€” drive the fist tracking and the HUD
// prompt but cannot lengthen, shorten or add a hit to the string.
function feedManualCombo() {
  const lmb = input.lmbRaw, rmb = input.rmbRaw;
  input.lmbRaw = input.rmbRaw = false;
  if (!lmb && !rmb) return;
  const fist = lmb ? 0 : 1;                     // both in one frame â†’ LMB wins
  if (player.attack === 'contCombo') {
    if (player.mcSection === 'finish' || player.mcStamina <= 0) return;   // no more input
    if (fist === player.mcFist) {
      // Same button again. Swallowed while the streak is short (a fumbled
      // alternation), but once it's clearly a mash every further tap sustains.
      if (++player.mcRepeat <= MCOMBO.mashRepeats) return;
    } else {
      player.mcFist = fist;                     // alternation accepted
      player.mcRepeat = 1;                      // ...and the mash streak restarts
    }
    // NOTE: a tap must NOT clear `mcEnding`. The wind-down is raised by the lap
    // counter, and the expected input is continuous tapping â€” a tap that could
    // cancel it would cancel it on every single frame and the circle would never
    // reach the uppercut.
  } else if (player.mcArmed == null) {
    player.mcArmed = fist;                      // arms the takeover at `takeoverAt`
    player.mcRepeat = 1;                        // tap 1 of a possible mash streak
  } else {
    // Already armed, still waiting on `takeoverAt`. Keep tallying so a mash that
    // begins before the swap doesn't lose the taps it lands in that window.
    if (fist === player.mcArmed) player.mcRepeat++;
    else { player.mcArmed = fist; player.mcRepeat = 1; }
  }
}

// The one way out of a hold. `launch` throws the enemy through the normal
// knockback path; `drop` simply stands it back up. Either way its collision,
// movement, AI and damage reactions are restored.
function releaseGrab(opts = {}) {
  const e = grabbedEnemy;
  const completedFullCombo = player.grabFullCombo;
  grabbedEnemy = null;
  player.grabTargetRef = null;
  player.grabDone = true;             // this attempt is spent (see updateGrab)
  player.mcArmed = null;              // no takeover can arm after the hold is over
  player.grabFullCombo = false;
  if (!e) return;
  e.grabbed = false;
  e.grabHitT = 0;
  e.state = 'walk';                  // clear 'grabbed' before handing control back
  e.mode = 'menace';
  e.vx = 0; e.vy = 0; e.jumpY = 0;
  if (opts.launch) {
    const r = opts.force || GRAB.release;   // `force`: the finisher's own payload
    const dir = player.facing >= 0 ? 1 : -1;
    const damage = opts.lethal ? 0 : r.damage * rageMul();
    const killedByRelease = opts.lethal || e.hp - damage <= 0;
    addRage(r.rage);
    triggerHitFx((player.x + e.x) / 2, e.y - 110, r.hitstop, r.shake, true);
    playHit(r);
    if (isHeavyHit(r)) triggerFlash('255,255,255', 0.14);
    // lethal hits already took their damage; launchEnemy flags the KO either way
    launchEnemy(e, r.kb, dir, damage);
    if (completedFullCombo && killedByRelease) playDarkiVoice('grab');
  } else {
    e.atkCooldown = Math.max(e.atkCooldown, 0.4);   // brief beat before it re-engages
    e.animTime = 0;
  }
}

/* ==================== pickup / carry / throw â€” the state machine ==========
 * Deliberately parallel to the grab's above rather than folded into it. They
 * share nothing but `isGrabbable`, and that is the point: every function here
 * touches `carriedEnemy`, none of them touches `grabbedEnemy`, so no edit to one
 * beat-down can reach into the other.
 */

// Closest eligible body IN FRONT of Darki, within reach and sharing his lane.
// Same rule as `grabTarget` and the same predicate, so the two moves can never
// disagree about who "the man in front of me" is â€” see CARRY.reach.
function carryTarget() {
  const dir = player.facing >= 0 ? 1 : -1;
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (!isGrabbable(e) || e.carried) continue;
    const forward = (e.x - player.x) * dir;
    if (forward < CARRY.minGap || forward > CARRY.reach) continue;
    if (Math.abs(e.y - player.y) > CARRY.lane) continue;
    if (forward < bestD) { bestD = forward; best = e; }
  }
  return best;
}

// Ride the held body on Darki. `k` is the lift blend (0 = where he was caught,
// 1 = fully overhead), driven by the ANIMATION clock rather than accumulated dt
// so it lands identically at any frame rate.
function seatCarried(e, k = 1) {
  const dir = player.facing >= 0 ? 1 : -1;
  const ax = player.x + dir * CARRY.anchor.x;
  const ay = clampLane(player.y);
  e.x = e.carryFromX + (ax - e.carryFromX) * k;
  e.y = e.carryFromY + (ay - e.carryFromY) * k;
  // The lift is jumpY, NOT y: y is his lane, and raising it would walk him into
  // the background and change how he sorts against the rest of the street.
  e.jumpY = e.carryFromJumpY + (CARRY.anchor.lift - e.carryFromJumpY) * k;
  e.vx = 0; e.vy = 0;
  // Faces the way Darki does, so the art draws as authored when he faces right
  // and mirrors cleanly when he turns. (The grab does the opposite â€” it seats
  // its victim face-to-face â€” which is why this is not seatGrabbed.)
  e.facing = dir;
}

/* HOW HARD THE THROW IS GOING TO BE, 0..1, from how long he has held the man
 * over his head. ONE number, and everything the throw does reads off it â€”
 * damage, distance, lift, hit-stop, shake, flash, sparks, rage, and the impact
 * the flying body carries into whoever it lands on. That is deliberate: a
 * "powerful" throw assembled from a dozen separately-tuned constants stops
 * being coherent the first time one of them is nudged, whereas this way the
 * light throw and the heavy one are the same throw at two points on a curve.
 *
 * Eased rather than linear (smoothstep), so the first quarter-second does not
 * feel like it is already doing something and the last quarter-second still
 * pays. `carryHoldT` starts at the moment the lift completes, not at the press,
 * so the charge measures the HOLD and not the animation in front of it.
 */
function carryPower() {
  const t = Math.max(0, Math.min(1, player.carryHoldT / CARRY.charge.full));
  return t * t * (3 - 2 * t);
}
// Blend a base value up to `mul` times itself at full charge.
const chargeScale = (base, mul, p) => base * (1 + (mul - 1) * p);

// The wind-up has to be VISIBLE or the player cannot aim it. Sparks gather at
// his hands as the charge builds, the rate climbing with it, and the moment it
// tops out there is one gold pulse and a flash so "fully wound" is an event you
// can act on rather than a stopwatch you have to run in your head.
function carryChargeTell(dt) {
  const p = carryPower();
  const dir = player.facing >= 0 ? 1 : -1;
  const hx = player.x + dir * 10, hy = player.y - 210;
  // 0 -> ~14 embers a second across the charge.
  carryEmberDebt += p * p * 14 * dt;
  while (carryEmberDebt >= 1) {
    carryEmberDebt -= 1;
    spawnEmbers(hx, hy, 1, p > 0.85 ? '#ffe08a' : '#ff9a3c', 60 + 40 * p);
  }
  if (p >= 1 && !player.carryMaxed) {
    player.carryMaxed = true;
    spawnEmbers(hx, hy, 18, '#ffe08a', 130);
    triggerFlash('255,220,140', 0.10);
    triggerHitFx(hx, hy, 0, 5, false);        // a shudder, NEVER a freeze
  }
}
/* ------------------------------------------------- the struggle bed (audio)
 *
 * Struggle_sfx is 5.68 s of a man fighting to get down, and the brief is
 * precise about when it may be heard: while he is being carried AND actively
 * resisting — "NOT simply because the enemy is grabbed".
 *
 * So the gate is the same predicate the ANIMATION router uses to choose the
 * struggle loop (see enemyAnim: carried, player.carrying, not mid-throw). Tying
 * the sound to the picture rather than to a second hand-written condition is
 * what stops the two from ever disagreeing — if he is drawn struggling he is
 * heard struggling, and there is no third state to keep in sync.
 *
 * RECONCILED rather than event-fired, and that IS the event-driven answer for a
 * looping bed: `syncStruggleAudio` compares the wanted state to the live node
 * and acts only on a difference, so it cannot start a second copy however many
 * times it is called, and it cannot leave one running after the hold ends. A
 * pair of start/stop calls sprinkled through the carry state machine would have
 * to be correct at every one of its exits — throw, drop, death, hit out of the
 * hold, level reset — and a bed that survives one of them plays forever.
 */
let struggleNode = null;
const struggleActive = () => !!(carriedEnemy && carriedEnemy.carried
  && !carriedEnemy.dying && carriedEnemy.hp > 0
  && player.carrying && player.attack !== 'carryThrow');

function syncStruggleAudio() {
  const want = struggleActive();
  if (want === !!struggleNode) return;                 // nothing changed
  if (want) struggleNode = playCueSustained('struggle', carriedEnemy.x, 1, true);
  else { try { struggleNode.stop(); } catch {} struggleNode = null; }
}

// Fractional spark counts carried between frames, so an emission RATE stays the
// same rate at any frame rate instead of rounding to zero on a fast one.
let carryEmberDebt = 0;                        // â€¦while winding up
let carryTrailDebt = 0;                        // â€¦and behind a body in flight

// Take the man off his feet: suspend AI, physics and collision, and remember
// where he was so the lift can ease him up instead of snapping him overhead.
function latchCarry(e) {
  carriedEnemy = e;
  e.carried = true;
  e.state = 'carried';          // not 'grounded' â†’ lane steering leaves him alone
  e.mode = 'menace';
  e.vx = 0; e.vy = 0;
  e.staggerTimer = 0; e.downTimer = 0; e.didHit = false;
  e.carryFromX = e.x; e.carryFromY = e.y; e.carryFromJumpY = e.jumpY || 0;
  e.carryT = 0;                 // his own clock, for the struggle loop
  e.carryPhase = 'pickedUp';    // â€¦until he is fully overhead (see seatedStep)
  e.animTime = 0;               // play the lift from its first frame
  e.thrownByCarry = false;
  e.throwLanded = false;
  player.carryMaxed = false;    // a fresh hold has not topped out yet
  player.carryAnimT = 0;
  player.carryThrowPower = 0;
  carryEmberDebt = 0;
  attackTokens.delete(e);       // hand back the attack token he may be holding
  player.carryHoldT = 0;
  /* THE GRAB SOUND, AND IT NEVER PLAYED. This line used to read
   * `playCue(CUES.grab ?? null, e.x)` — it passed a table ENTRY where playCue
   * takes a cue NAME, and there has never been a `grab` key in CUES, so it
   * evaluated to `playCue(null)` every pickup: counted in cueFired under the
   * key "null", audible never. The brief asks for a grab sound on every
   * successful grab, so both latches now call one place. */
  playGrabSuccess(e);
}

/* One sound for every successful grab, whichever grab it was.
 *
 * There are TWO latches in this file — `latchGrab` seats a man for the combo
 * hold, `latchCarry` takes him off his feet to be carried — and the brief is
 * explicit that the cue belongs to both ("regardless of the purpose of the
 * grab"). Routing them through one function is what stops the next grab-shaped
 * move from being added silently: there is a single place to call. */
function playGrabSuccess(e) {
  playCue('grabSuccess', e.x);
}

// Drive the pickup attempt for this animation step.
function updateCarryPickup(move, step) {
  const cfg = move.carry;

  // The grab attempt happens ONCE, on the frame his hands close â€” not every
  // frame L2 is down, and not again later in the same swing. Re-validated at
  // that moment because the world moved on while the hand travelled.
  if (!carriedEnemy && !player.carryWhiffed && !player.carryDone && step >= cfg.latchStep) {
    player.carryDone = true;                       // this attempt is spent either way
    const t = isGrabbable(player.carryTargetRef) && !player.carryTargetRef.carried
      ? player.carryTargetRef : carryTarget();
    if (t) { latchCarry(t); carryState = CARRY_STATE.LIFT; }
    else {
      // Closed on empty air. Since `startAttack` refuses a pickup with no mark
      // outright â€” that press plays the grab-whiff sheet instead â€” the only way
      // to land here is a mark that was VALID on the press and gone by the time
      // the hand arrived: he died, was grabbed, or walked out of the lane in
      // those nine frames. Rare, but it is a real race and the move still has to
      // finish cleanly, so the reach plays out and he is handed back to combat.
      player.carryWhiffed = true;
      carryState = CARRY_STATE.WHIFF;
      playWhiff(false, true, player.x + player.facing * 70);
    }
  }

  const e = carriedEnemy;
  if (!e) { if (step < cfg.latchStep) carryState = CARRY_STATE.REACH; return; }
  if (e.benched || e.hp <= 0) { dropCarry({ drop: true }); return; }

  const span = Math.max(1, cfg.seatedStep - cfg.latchStep);
  const k = Math.max(0, Math.min(1, (player.animTime - cfg.latchStep) / span));
  seatCarried(e, k * k * (3 - 2 * k));             // smoothstep lift
  // The enemy's two sections change over on the SAME frame the seat finishes, so
  // he reaches the struggle loop already horizontal and already overhead.
  e.carryPhase = step < cfg.seatedStep ? 'pickedUp' : 'struggle';
  carryState = step < cfg.seatedStep ? CARRY_STATE.LIFT : CARRY_STATE.HOLD;
}

// The pickup animation ran out. Holding someone â†’ hand over to the carry
// STANCE, which is not an attack at all (he can walk, he cannot swing).
// Holding nobody â†’ the attack simply ends the way any whiff does.
function finishCarryPickup() {
  if (!carriedEnemy) { carryState = CARRY_STATE.NONE; return false; }
  player.attack = null;
  player.attackHits = null;
  player.attackStep = 0;
  player.carrying = true;
  player.anim = 'carry';
  player.animTime = 0;
  player.carryAnimT = 0;
  player.stepClock = null;
  player.frame = darkiCarrySprite.anims.carryEntry.frames[0];
  carryState = CARRY_STATE.HOLD;
  return true;
}

// Hold the man while Darki walks. Called from the animation branch, so it runs
// on exactly the frames the carry stance owns the body.
function updateCarryHold(dt) {
  const e = carriedEnemy;
  if (!e) { endCarry(); return; }
  // Every way the hold can stop being valid, in one place.
  if (e.benched || e.hp <= 0 || player.react || player.state !== 'normal') {
    dropCarry({ drop: true });
    return;
  }
  player.carryHoldT += dt;          // (e.carryT is ticked by the enemy loop)
  carryChargeTell(dt);              // â€¦and show him how wound up it is
  seatCarried(e, 1);
  if (player.carryHoldT >= CARRY.maxHold) { startCarryThrow(); return; }   // arms give out
  // Release the button â†’ throw. Read here rather than in the attack buffer so a
  // release lands on the very next frame, whatever else is competing for input.
  if (!input.executeHeld) startCarryThrow();
}

// Leave the carry stance without a victim (he died in your hands, or the hold
// broke). Nothing to throw, so Darki simply stands back up.
function endCarry() {
  player.carrying = false;
  player.carryHoldT = 0;
  player.carryAnimT = 0;
  player.carryThrowPower = 0;
  carryState = CARRY_STATE.NONE;
  if (!player.attack && !player.react) { player.anim = 'idle'; player.animTime = 0; }
}

function startCarryThrow() {
  if (!carriedEnemy) { endCarry(); return; }
  // Snapshot before the wind-up starts. The old path cleared carryHoldT inside
  // dropCarry before reading it, silently turning every charged throw into p=0.
  player.carryThrowPower = carryPower();
  player.carrying = false;
  player.attack = 'carryThrow';
  player.anim = 'throwEnemy';
  player.animTime = 0;
  player.attackStep = 0;
  player.attackHits = new Set();
  player.frame = ATTACKS.carryThrow.frames[0];
  player.vx = 0;
  carryState = CARRY_STATE.THROW;
}

// Drive the throw. The man stays pinned through the wind-up so the launch reads
// as Darki throwing him rather than as a drop that a hit happens to follow.
function updateCarryThrow(move, step) {
  const cfg = move.carryThrow.throw;
  const e = carriedEnemy;
  if (!e) return;                                  // already gone this swing
  if (step < cfg.releaseStep) { seatCarried(e, 1); return; }
  dropCarry({ launch: true });
}

// The ONE way out of a carry. `launch` throws him through the normal knockback
// path (so he lands, groans, gets up or does not, exactly like any other body);
// `drop` just stands him back up. Either way his AI, collision, movement and
// damage reactions are restored â€” there is no path that leaves `carried` set.
function dropCarry(opts = {}) {
  const e = carriedEnemy;
  const launchPower = opts.launch
    ? Math.max(0, Math.min(1, player.carryThrowPower || carryPower()))
    : 0;
  carriedEnemy = null;
  player.carrying = false;
  /* Killed here as well as by the frame-end reconciler. `update` normally
   * catches this a few lines later, but a drop can also happen with the world
   * stepping paused — a level reset, a KO handover, the outro — and a bed with
   * nothing left to reconcile it would play under the next screen. */
  if (struggleNode) { try { struggleNode.stop(); } catch {} struggleNode = null; }
  player.carryTargetRef = null;
  player.carryHoldT = 0;
  player.carryAnimT = 0;
  player.carryThrowPower = 0;
  if (!e) { carryState = CARRY_STATE.NONE; return; }
  e.carried = false;
  e.state = 'walk';                                // clear 'carried' before handing back
  e.mode = 'menace';
  e.vx = 0; e.vy = 0;
  if (opts.launch) {
    const r = CARRY.throw, c = CARRY.charge;
    const p = launchPower;                           // â† preserved across the wind-up
    const dir = player.facing >= 0 ? 1 : -1;
    const kb = { x: chargeScale(r.kb.x, c.kbMul, p), y: chargeScale(r.kb.y, c.liftMul, p) };
    const hit = {
      damage: chargeScale(r.damage, c.dmgMul, p),
      hitstop: chargeScale(r.hitstop, c.fxMul, p),
      shake: chargeScale(r.shake, c.fxMul, p),
      big: true,
    };
    addRage(chargeScale(r.rage, c.rageMul, p));
    const hx = e.x, hy = e.y + (e.jumpY || 0) - 40;
    triggerHitFx(hx, hy, hit.hitstop, hit.shake, true);
    playHit(hit);
    // The heave itself: a cone of sparks thrown the way the man is going, plus a
    // ring of dust off the foot he plants to do it. Both scale, so a snap
    // release is a puff and a wound-up one is an event.
    spawnEmbers(hx, hy, Math.round(8 + 26 * p), '#ffcf5a', 90 + 120 * p);
    spawnEmbers(player.x + dir * 14, player.y - 6, Math.round(5 + 16 * p), '#c9b79a', 70 + 90 * p);
    triggerFlash('255,255,255', 0.10 + 0.14 * p);
    // He keeps the height he was carried at, so the throw starts from Darki's
    // hands instead of teleporting to the tarmac and launching from there.
    launchEnemy(e, kb, dir, hit.damage * rageMul(), true, { immediate: true });
    e.jumpY = Math.min(e.jumpY, CARRY.anchor.lift);
    // The body remembers how hard it was thrown, so what it does to the next man
    // is decided by the wind-up rather than by a flat constant.
    e.throwPower = p;
    // Marks him as a body thrown BY THE CARRY, which is what routes him onto the
    // carry sheet's airborne frames instead of the ordinary knockdown, and what
    // arms him as a projectile. Cleared when he stops being airborne.
    e.thrownByCarry = true;
    e.throwHits = new Set();
  } else {
    e.jumpY = 0;
    e.atkCooldown = Math.max(e.atkCooldown, 0.4);  // a beat before he re-engages
    e.animTime = 0;
  }
  carryState = player.attack === 'carryThrow' ? CARRY_STATE.THROW : CARRY_STATE.NONE;
}

// A BODY IN FLIGHT IS A WEAPON.
//
// The important property here is that none of it lives in the animation. The
// flight is `launchEnemy` + gravity in the ordinary `state === 'hit'` branch, so
// direction comes from Darki's facing, distance and speed from `CARRY.throw.kb`,
// and the arc from the same physics every other knockdown uses. The existing
// AgbeoFall airborne section holds its last pose for however long the flight
// lasts, so a snap toss and a charged launch differ through physics, not by
// stretching or racing an animation.
//
// Called once per frame for every enemy, before the AI/physics chain, because it
// also owns retiring the flag when he stops being a projectile.
function updateThrownBody(e, dt) {
  if (!e.thrownByCarry) return;
  // On the deck: still HIS throw, but no longer a weapon. AgbeoFall owns the
  // crash/get-up picture. Anything else â€” feet, bench, or a new grab â€” retires
  // the projectile flag.
  if (e.state === 'down' || e.state === 'ko') {
    // He has hit the deck. One dust burst on the FIRST grounded frame â€” scaled,
    // like everything else, by the wind-up that put him there â€” so a heavy throw
    // lands like a heavy throw even when it hits nothing at all.
    if (!e.throwLanded) {
      e.throwLanded = true;
      const q = e.throwPower ?? 0;
      spawnEmbers(e.x, e.y - 8, Math.round(10 + 24 * q), '#c9b79a', 100 + 130 * q);
      spawnEmbers(e.x, e.y - 18, Math.round(4 + 12 * q), '#ffcf5a', 70 + 80 * q);
      // The release is the first impact; the street is the second. A short,
      // charge-scaled landing stop gives the arc a brutal full stop without
      // extending the release freeze itself.
      triggerHitFx(e.x, e.y - 30, 0.035 + 0.045 * q, 10 + 16 * q, q > 0.35);
    }
    return;
  }
  if (e.state !== 'hit') { e.thrownByCarry = false; e.throwLanded = false; return; }

  // A trail while he is in the air. Cheap, and it is what sells the throw as
  // fast â€” the body reads as travelling rather than sliding, and the harder it
  // was thrown the longer the streak behind it.
  const q = e.throwPower ?? 0;
  carryTrailDebt += (8 + 26 * q + Math.min(12, Math.abs(e.vx) / 70)) * dt;
  while (carryTrailDebt >= 1) {
    carryTrailDebt -= 1;
    spawnEmbers(e.x, e.y + (e.jumpY || 0) - 40, 1, q > 0.7 ? '#ffcf5a' : '#b9a68c', 40);
  }

  const imp = CARRY.impact;
  for (const o of enemies) {
    if (o === e || o.benched || o.hp <= 0 || o.carried || o.grabbed) continue;
    if (!isEnemyHittable(o)) continue;               // already down / mid-flight
    if (e.throwHits.has(o)) continue;                // one body, one victim, once
    if (Math.abs(o.x - e.x) > imp.radius) continue;
    if (Math.abs(o.y - e.y) > CARRY.lane) continue;
    e.throwHits.add(o);
    const dir = Math.sign(e.vx) || player.facing || 1;

    // The man who was hit: the ordinary launch path, so his reaction, his fall
    // sheet, his groan and his knockdown timers are the ones he always uses. No
    // second damage system â€” `imp` is shaped exactly like an ATTACKS window.
    // `o.boss` is not excluded: the boss cannot be PICKED UP, but he can
    // certainly be hit by a man who was.
    //
    // â€¦and ALL OF IT scales by the wind-up that threw him. A body lobbed off a
    // snap release should not flatten a man like one launched off a full charge,
    // and making the collision read the same `throwPower` the launch did is what
    // makes the whole mechanic one decision instead of two.
    const c = CARRY.charge;
    const iKb = { x: chargeScale(imp.kb.x, c.kbMul, q), y: chargeScale(imp.kb.y, c.liftMul, q) };
    const iHit = {
      damage: chargeScale(imp.damage, c.dmgMul, q),
      hitstop: chargeScale(imp.hitstop, c.fxMul, q),
      shake: chargeScale(imp.shake, c.fxMul, q),
      big: true,
    };
    addRage(chargeScale(imp.rage, c.rageMul, q));
    const mx = (o.x + e.x) / 2, my = o.y - 110;
    triggerHitFx(mx, my, iHit.hitstop, iHit.shake, true);
    playHit(iHit);
    triggerFlash('255,255,255', 0.12 + 0.16 * q);
    // Two bodies meeting at speed: sparks both ways, not a tidy little puff.
    spawnEmbers(mx, my, Math.round(12 + 30 * q), '#ffcf5a', 110 + 130 * q);
    spawnEmbers(mx, o.y - 10, Math.round(6 + 14 * q), '#c9b79a', 90 + 90 * q);
    launchEnemy(o, iKb, dir, iHit.damage * rageMul());

    // The projectile takes it too, and then DROPS. Without this he sails on
    // through the man he just flattened, which reads as passing through him
    // rather than hitting him: the collision has to cost the thrown body its
    // flight. Slight rebound, then gravity â€” the existing landing code turns
    // that into his crash, so he ends knocked down like anyone else.
    e.hp -= imp.selfDamage;
    e.hpFlash = 0.25;
    e.vx = -e.vx * 0.22;
    e.vy = Math.max(e.vy, -140);
    e.fallHold = 0;                                  // stop absorbing, start falling
    if (e.hp <= 0) { e.hp = 0; e.dying = true; e.dead = true; }
    break;                                           // one collision per frame
  }

  // EXTENSION POINT â€” environmental objects. There are none in the fight lane
  // today: buildLevel keeps the road clear on purpose ("the gameplay lane is
  // left clear â€” everything sits on/behind the sidewalk") and `props` is never
  // even assigned, because Level 1 draws the mural instead. When solid props do
  // land, they collide HERE, against `e.x`/`e.y` exactly as the bodies above do,
  // and reuse the same `imp` payload plus the drop that follows it.
}

/* ============================ RUSH â€” the state machine ===================
 * Nothing here duplicates an attack. The window's two outcomes are literally
 * `startAttack('grab')` and `startAttack('combo5')`.
 */

// The nearest live body in `dir`, far enough away to be worth charging and near
// enough to be worth committing to. Uses the same hittable predicate everything
// else does, so a man already on the floor is never a rush target.
function rushTarget(dir) {
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (e.benched || e.hp <= 0 || e.grabbed || e.carried) continue;
    if (!isEnemyHittable(e)) continue;
    const forward = (e.x - player.x) * dir;
    if (forward < RUSH.minRange || forward > RUSH.maxRange) continue;
    if (Math.abs(e.y - player.y) > 150) continue;      // roughly his half of the street
    if (forward < bestD) { bestD = forward; best = e; }
  }
  return best;
}

// Everything that has to be true for a charge to be legal. Mirrors `canBlock`'s
// shape deliberately â€” same questions, same order.
const canRush = () => player.state === 'normal' && !player.react && !player.attack
  && !player.carrying && !player.blocking && player.grounded
  && rushState === RUSH_STATE.NONE && !execution && !cutscene.active;

// Read the taps. EDGE-triggered on purpose: `input.left/right` are recalculated
// from keyboard and pad every frame, so a held direction is `true` on every one
// of them â€” comparing against last frame's value is what makes "holding forward
// must not rush" true by construction instead of by a special case.
function updateRushInput() {
  for (const side of ['left', 'right']) {
    const now = !!input[side];
    if (now && !rushTapPrev[side]) {
      const other = side === 'left' ? 'right' : 'left';
      if (mobClock - rushTapAt[side] <= RUSH.tapWindow) {
        rushTapAt[side] = -Infinity;               // spent: no triple-tap chaining
        tryStartRush(side === 'right' ? 1 : -1);
      } else {
        rushTapAt[side] = mobClock;
      }
      rushTapAt[other] = -Infinity;                // turning around clears the other side
    }
    rushTapPrev[side] = now;
  }
}

/* ------------------------------------------------------- the sprint gauge */
// Is there enough in the tank to set off at all? One threshold, deliberately
// above zero: letting him start on the last drop produces a dash that dies
// almost immediately, which reads as the game stuttering rather than as a
// resource running out.
/* RAGE SUPPLIES THE RUSH. While the burst is up the gauge is not a resource:
 * he can set off with an empty tank, run as long as the rage lasts, and cannot
 * be winded by it.
 *
 * ONE PREDICATE, consulted at all four gates that touch the gauge (ready-to-
 * start, the start cost, the per-frame burn, the refill). Testing `rageActive`
 * at each site separately is how you end up with a dash that starts on an empty
 * tank and then dies a third of a second later, which is worse than refusing it
 * outright. Note the refill pins the bar to FULL rather than freezing it where
 * it stood, so rage running out never drops him straight into WINDED. */
const rushInexhaustible = () => player.rageActive;

const rushStaminaReady = () => rushInexhaustible()
  || player.rushStam >= RUSH.stamina.minStart;

/* …AND THE FREE SPRINT'S FAILSAFE HAS TO MOVE WITH IT.
 *
 * `RUSH.free.maxTime` is 2.6 s and its own comment calls it a "failsafe only —
 * the gauge is what actually stops him", which is true at 1.47 s of gauge and
 * false the moment rage makes the gauge infinite: the failsafe silently becomes
 * the real limit, and a raged sprint stops dead at 2.6 s with a full bar for no
 * reason the player can see. Raised to outlast the burst rather than removed,
 * so a stuck input still cannot sprint forever — and once rage drops, the gauge
 * (pinned full at that instant) takes over and stops him within ~1.5 s.
 *
 * The CHARGE's `RUSH.maxTime` is deliberately NOT touched. That one is a real
 * failsafe, not a formality: it is what breaks the stand-off against an enemy
 * retreating at the charge's own speed, and lifting it would restore the
 * "I rushed him and nothing happened" deadlock documented in updateRushCharge. */
const rushFreeMaxTime = () => (rushInexhaustible()
  ? Math.max(RUSH.free.maxTime, RAGE_DUR + 0.5) : RUSH.free.maxTime);

// Refill. Runs every frame he is NOT running; the movers do their own draining,
// so there is exactly one place each direction of the gauge is written.
function updateRushStamina(dt) {
  /* Held full, and BEFORE the running early-return below, because during rage
   * this is also the writer that keeps the bar topped up mid-run. It clears
   * `rushWinded` and the delay too: rage arriving while he is doubled over is
   * exactly the moment "keep it supplied" has to mean something. */
  if (rushInexhaustible()) {
    player.rushStam = 1;
    player.rushWinded = false;
    player.rushStamDelay = 0;
    player.rushDeniedT = Math.max(0, player.rushDeniedT - dt);
    return;
  }
  if (rushState === RUSH_STATE.CHARGE || rushState === RUSH_STATE.FREE) return;
  player.rushDeniedT = Math.max(0, player.rushDeniedT - dt);
  if (player.rushStamDelay > 0) {
    player.rushStamDelay = Math.max(0, player.rushStamDelay - dt);
    if (player.rushStamDelay === 0) player.rushWinded = false;
    return;
  }
  player.rushStam = Math.min(1, player.rushStam + RUSH.stamina.regen * dt);
}

// Burn the gauge for this frame of running. Returns false once it is gone, and
// flags `rushWinded` on the way out â€” the ONLY place that flag is raised, so
// the long penalty can never be earned by stopping on purpose.
function drainRushStamina(dt) {
  // Rage pays for the run. Returning true unconditionally is what makes the
  // sprint endless, since both movers end the rush the moment this goes false.
  if (rushInexhaustible()) { player.rushStam = 1; return true; }
  player.rushStam -= RUSH.stamina.drain * dt;
  if (player.rushStam > 0) return true;
  player.rushStam = 0;
  player.rushWinded = true;
  return false;
}

// A refused dash must SAY it was refused. The rush work already learned this the
// expensive way: a charge that silently did nothing reads to the player as "I
// pressed it and the game ignored me", and an empty gauge is the most common
// reason a press will now do nothing at all. Flashes the bar and puffs his feet.
function rushDeniedTell() {
  player.rushDeniedT = 0.45;
  spawnEmbers(player.x, player.y - 8, 4, '#7b8698', 40);
}

// FORWARD, FORWARD. Two outcomes from one tap, decided by whether there is
// anybody worth charging: a mark ahead gives the homing charge that stops in
// range and opens the combat window; an empty street gives a free sprint the
// player steers and stops. Both cost the same gauge at the same rate.
function tryStartRush(dir) {
  if (!canRush()) return false;
  if (!rushStaminaReady()) { rushDeniedTell(); return false; }
  const t = rushTarget(dir);
  rushTargetRef = t;
  rushState = t ? RUSH_STATE.CHARGE : RUSH_STATE.FREE;
  // Charged before he has moved an inch, which is what stops stutter-dashing:
  // see the arithmetic on RUSH.stamina.
  if (!rushInexhaustible()) {
    player.rushStam = Math.max(0, player.rushStam - RUSH.stamina.startCost);
    player.rushStamDelay = RUSH.stamina.regenDelay;
  }
  player.facing = dir;
  player.rushT = 0;
  /* Arm the trail from where he sets off. Without this the first ghost is laid
   * relative to wherever the LAST run ended, so a second sprint from a different
   * spot dumps its whole opening echo in one place. */
  rushFxBegin();
  player.rushBuffered = null;
  player.anim = 'rush';
  player.animTime = 0;
  player.frame = rushSprite.anims.rush.frames[0];
  player.vx = 0;
  player.bufferedAttack = null;
  // The burst is the existing feedback stack, not new art: the sheet is a run
  // cycle with no launch pose in it.
  spawnEmbers(player.x - dir * 22, player.y - 18, 10, '#ffd9a0', 90);
  triggerHitFx(player.x, player.y - 60, 0, 4, false);
  /* THE EFFORT, ON THE COMMITMENT — and exactly once.
   *
   * This is the only function that starts a rush, and it is reached from the
   * second tap of forward-forward, so "do not re-trigger every frame" is a
   * property of WHERE the call is rather than of a cooldown guarding it. Note
   * it sits after every early return above: a dash refused for an empty
   * stamina gauge plays the denial tell, not a grunt of effort for a run that
   * never happened.
   *
   * The footsteps that go with it are not fired here. They come from
   * DARKI_FOOTFALLS.rush through the ordinary footfall crossing test, so they
   * land on the sheet's own plant frames for as long as the run lasts and stop
   * with it — which is what makes the groan and the boots one action instead
   * of a sound effect with a loop behind it. */
  playCue('darkiRush', player.x);
  return true;
}

// Drive the charge. Runs from the animation branch, so it owns the picture on
// exactly the frames it owns the body.
/* ======================================================= RUSH SPEED VFX ====
 *
 * Everything that makes the sprint LOOK as fast as it is. None of it touches
 * the rush animation: the sheet, its frame list, its 24 fps and its two measured
 * plants are exactly what they were. This layer only reads them.
 *
 * ---------------------------------------------- WHY THERE IS NO SHADER HERE
 *
 * This game draws into a plain 2D canvas context. There is no WebGL pipeline to
 * hang a post-process on, and standing one up for this would mean re-routing
 * every draw in the file through a render target — an enormous change to buy an
 * effect that does not need it. The cheapest correct primitive for a temporal
 * afterimage is the one a 2D context is already good at: draw the SAME prepared
 * frame canvas again, at a past position, at a lower alpha. That is one
 * `drawImage` per ghost, no allocation, no filter, no readback — measurably
 * cheaper than a blur pass would have been, and it is also the RIGHT look. A
 * Gaussian smear loses his silhouette; re-drawing the pose keeps it, which is
 * what separates an arcade afterimage from a motion-blurred mess.
 *
 * ------------------------------------------------------------- POOLED, CAPPED
 *
 * Every array below is allocated once at module load and never grows. A slot is
 * a plain object with a `live` flag; spawning overwrites the oldest slot when
 * they are all taken, so the cost of the whole system is fixed no matter how
 * long anyone sprints or how many things are on screen. Nothing here is a game
 * object, nothing is physics, nothing is garbage.
 *
 * ------------------------------------------------- SPAWNED BY DISTANCE, NOT TIME
 *
 * Ghosts are laid down every `ghostGap` PIXELS TRAVELLED rather than every N
 * milliseconds. That is what makes the trail scale with speed for free: the
 * spacing on screen stays even (a time-based spawn bunches them up when he is
 * slow and tears gaps when he is fast), while a faster run lays them down more
 * often and the trail reaches further back before the oldest expires.
 */
const RUSH_FX = {
  ghostCap: 8,          // hard ceiling on live afterimages
  /* 58, and this number is the difference between an afterimage and a smear.
   * It started at 26 and looked exactly like the Gaussian mush the brief rules
   * out — Darki's sprite is about 180px wide, so echoes 26px apart sit almost
   * entirely on top of each other and on him, and eight of them stack into one
   * blurry double exposure rather than eight readable silhouettes. At 58 the
   * poses separate enough to be legible as distinct bodies while still
   * overlapping enough to read as one continuous streak of movement. */
  ghostGap: 70,
  /* …and the life has to cover the trail. 8 echoes at 70px is 560px of ground,
   * which at the sprint's 1000 px/s takes 0.56s to lay down; a shorter life
   * kills the oldest before the newest exists and the trail can never reach its
   * own length. */
  ghostLife: 0.50,
  ghostAlpha: 0.62,     // the freshest echo's opacity; older ones scale down
  /* A SECOND, ADDITIVE PASS over each echo. This street is a painted mural —
   * busy, mid-toned and warm — and a plain alpha silhouette of a dark man in a
   * dark vest simply sank into it: correct, cheap, and nearly invisible where it
   * mattered. One extra `drawImage` per ghost under `lighter` lifts the echo off
   * whatever is behind it and gives it the hot, energetic edge the reference
   * arcade trails have, without a shader, a render target or a blur. Kept low —
   * this is a rim on the silhouette, not a glow that eats it. */
  ghostGlow: 0.22,
  /* The falloff exponent. Squared was too aggressive once the trail got long —
   * everything past the second echo fell under 0.1 and the tail simply was not
   * there. 1.35 still puts the weight at the head (so the trail reads as having
   * a direction) while leaving the back half visible. */
  ghostFade: 1.35,
  streakCap: 14,
  streakLife: 0.16,
  streakPer: 2,         // streaks laid per ghost
  dustCap: 30,
  dustLife: 0.34,
  stepDust: 7,          // puffs kicked up by one footfall
  /* The footsteps. The rush already fires on measured plants (DARKI_FOOTFALLS
   * .rush = [1, 9], two per 16-frame lap at 24 fps — a step every third of a
   * second, a sprint cadence). What changes under a rush is the WEIGHT: the
   * same recording, louder and pitched down, which is what a heavier man
   * landing harder actually sounds like. Pitching down rather than reaching for
   * a different sample keeps it recognisably his own boot. */
  stepGain: 1.9,
  stepRate: 0.84,
};

/* ONE fade curve, read by the draw and by the debug surface. Two copies would
 * let a harness pass against a formula the screen is not using. */
const ghostAlphaAt = (age) => RUSH_FX.ghostAlpha
  * Math.pow(Math.max(0, 1 - age / RUSH_FX.ghostLife), RUSH_FX.ghostFade);

const makePool = (n, shape) => Array.from({ length: n }, () => ({ live: false, ...shape }));
const rushFx = {
  ghosts: makePool(RUSH_FX.ghostCap,
    { x: 0, y: 0, jumpY: 0, anim: 'rush', frame: 0, facing: 1, age: 0, seq: 0 }),
  streaks: makePool(RUSH_FX.streakCap, { x: 0, y: 0, len: 0, dir: 1, age: 0 }),
  dust: makePool(RUSH_FX.dustCap, { x: 0, y: 0, vx: 0, vy: 0, r: 0, age: 0, life: 0 }),
  lastX: 0,             // where the last ghost was laid
  dir: 0,               // travel direction while rushing, 0 when not
  seq: 0,               // monotonic, so "which ghost is freshest" is never ambiguous
  active: false,
};

/* Take the free slot, or the oldest live one. Never grows, never allocates. */
function claim(pool) {
  let oldest = pool[0], oldestAge = -1;
  for (const s of pool) {
    if (!s.live) return s;
    if (s.age > oldestAge) { oldestAge = s.age; oldest = s; }
  }
  return oldest;
}

/* Begin a run. Called from tryStartRush so the first ghost is laid from where he
 * actually set off rather than from wherever the last run ended. */
function rushFxBegin() {
  rushFxClear();
  rushFx.active = true;
  rushFx.lastX = player.x;
}

/* THE EFFECT ENDS WITH THE RUN, immediately — the brief is explicit, and it is
 * also the right call: echoes outliving the sprint read as a rendering fault
 * rather than as speed. Everything is retired in one pass; no fade-out tail. */
function rushFxClear() {
  for (const g of rushFx.ghosts) g.live = false;
  for (const s of rushFx.streaks) s.live = false;
  for (const d of rushFx.dust) d.live = false;
  rushFx.active = false;
  rushFx.dir = 0;
}

/* Called once per rush frame, after he has been moved — and once per airborne
 * frame of a running leap, which is why `airborne` exists: everything here is
 * true of a man in mid-air except the dust, which is the ground answering a boot
 * that is not currently touching it. */
function rushFxTrail(dir, { airborne = false } = {}) {
  rushFx.dir = dir;
  const travelled = Math.abs(player.x - rushFx.lastX);
  if (travelled < RUSH_FX.ghostGap) return;
  rushFx.lastX = player.x;

  const g = claim(rushFx.ghosts);
  g.live = true; g.age = 0; g.seq = ++rushFx.seq;
  g.x = player.x; g.y = player.y; g.jumpY = player.jumpY;
  g.anim = player.anim; g.frame = player.frame; g.facing = player.facing;

  /* Streaks: short horizontal scratches in the air he has just left. Laid with
   * the ghosts so their density follows the same speed rule, and deliberately
   * thin and few — the brief wants these SECONDARY to the silhouettes. */
  for (let i = 0; i < RUSH_FX.streakPer; i++) {
    const s = claim(rushFx.streaks);
    s.live = true; s.age = 0;
    s.x = player.x - dir * (10 + fxRng() * 40);
    s.y = player.y - 30 - fxRng() * 110;      // up the body, never across his feet
    s.len = 34 + fxRng() * 66;
    s.dir = dir;
  }
  // …and the ground he is tearing up as he goes, when there is ground under him.
  if (!airborne) spawnRushDust(2, 30);
}

/* Dust at his feet. `n` puffs, thrown BACKWARD against his travel — the ground
 * is being pushed away from him, so the debris goes the other way. */
function spawnRushDust(n, speed, dirOverride) {
  /* `dirOverride` is for the leap's arrival, which throws its dust AFTER the
   * trail has been retired — `rushFx.dir` is zero by then, and falling through
   * to `player.facing` would be right only as long as he never turned his head
   * in mid-air. The direction he was travelling is the one that matters. */
  const dir = dirOverride || rushFx.dir || player.facing || 1;
  for (let i = 0; i < n; i++) {
    const d = claim(rushFx.dust);
    d.live = true; d.age = 0;
    d.life = RUSH_FX.dustLife * (0.7 + fxRng() * 0.6);
    d.x = player.x - dir * (6 + fxRng() * 26);
    d.y = player.y - fxRng() * 8;             // on the deck, not floating
    d.vx = -dir * (speed + fxRng() * speed);
    d.vy = -12 - fxRng() * 40;
    d.r = 5 + fxRng() * 9;
  }
}

/* Ages everything and retires it. Runs every frame — including the ones after a
 * rush has ended, so a ghost cannot be stranded live by a state change. */
function rushFxUpdate(dt) {
  for (const g of rushFx.ghosts) if (g.live && (g.age += dt) >= RUSH_FX.ghostLife) g.live = false;
  for (const s of rushFx.streaks) if (s.live && (s.age += dt) >= RUSH_FX.streakLife) s.live = false;
  for (const d of rushFx.dust) {
    if (!d.live) continue;
    d.age += dt;
    if (d.age >= d.life) { d.live = false; continue; }
    d.x += d.vx * dt; d.y += d.vy * dt;
    d.vx *= 1 - 2.2 * dt;                     // air drag: the puff stalls and hangs
    d.vy += 30 * dt;
    d.r += 26 * dt;                           // …and spreads as it settles
  }
}

/* Drawn from inside drawPlayer, BEFORE his own sprite, so the echoes are behind
 * him in the same depth slot and he is always the sharp, opaque, dominant one. */
function drawRushFx() {
  // ---- dust, lowest: it is on the road ----
  for (const d of rushFx.dust) {
    if (!d.live) continue;
    const p = d.age / d.life;
    ctx.globalAlpha = 0.30 * (1 - p) * (1 - p);
    ctx.fillStyle = '#cbb99a';
    ctx.beginPath();
    ctx.ellipse(d.x - cameraX, d.y, d.r, d.r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // ---- streaks ----
  ctx.lineCap = 'round';
  for (const s of rushFx.streaks) {
    if (!s.live) continue;
    const p = s.age / RUSH_FX.streakLife;
    ctx.globalAlpha = 0.30 * (1 - p);
    ctx.strokeStyle = '#e8f0ff';
    ctx.lineWidth = 2;
    const x = s.x - cameraX;
    ctx.beginPath();
    ctx.moveTo(x, s.y);
    ctx.lineTo(x - s.dir * s.len * (1 + p), s.y);   // stretches as it dies
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* ---- the afterimages ----
   * OLDEST FIRST, so the freshest is painted last and sits on top of the ones
   * behind it. Drawing them in pool order would let a faded ghost overlay a
   * bright one and the trail would read as noise rather than as a sequence. */
  const live = rushFx.ghosts.filter((g) => g.live).sort((a, b) => a.seq - b.seq);
  for (const g of live) {
    const spr = spriteFor(g.anim);
    if (!spr) continue;
    const frame = spr.frames[g.frame] ?? spr.frames[0];
    const anchor = spr.anchors[g.frame] ?? spr.anchors[0];
    if (!frame) continue;
    /* Weighted toward the head, so the trail reads as having a direction rather
     * than as a row of equally grey copies — see RUSH_FX.ghostFade. */
    const a = ghostAlphaAt(g.age);
    if (a < 0.012) continue;
    const key = darkiSheetKey(g.anim);
    const ps = tune.playerScale * (tune['dScale' + key] ?? 1);
    ctx.save();
    ctx.translate(g.x - cameraX, g.y + g.jumpY + (tune['dOffY' + key] ?? 0));
    ctx.scale(g.facing !== (spr.faces ?? SHEET.faces) ? -ps : ps, ps);
    ctx.globalAlpha = a;
    ctx.drawImage(frame, -anchor, -spr.drawH);
    // …and the rim, so the echo survives a busy background. See RUSH_FX.ghostGlow.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * RUSH_FX.ghostGlow;
    ctx.drawImage(frame, -anchor, -spr.drawH);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function updateRushCharge(dt) {
  const t = rushTargetRef;
  // Bailing out: hit, blocked, or the mark left. Blocking ends it rather than
  // being refused, so the guard is always available and the player is never
  // stuck watching a charge he has changed his mind about.
  if (!t || t.benched || t.hp <= 0 || !isEnemyHittable(t)
    || player.react || player.state !== 'normal' || input.blockHeld) { endRush(); return; }
  player.rushT += dt;
  if (player.rushT > RUSH.maxTime) { endRush(); return; }
  // The charge pays the same rate as the sprint. It is usually cheap simply
  // because it is short â€” it stops itself the moment it arrives â€” which is the
  // whole reason one drain rate can serve both without a special case.
  if (!drainRushStamina(dt)) { endRush(); return; }

  const dir = Math.sign(t.x - player.x) || player.facing || 1;
  player.facing = dir;                              // faces the mark the whole way
  // ARRIVE when the mark is within one frame's travel, and cover that last
  // stretch in the same frame so he lands exactly on it.
  //
  // Testing `gap <= stopAt` on its own DEADLOCKS against a retreating enemy, and
  // an Agbero in `menace` holds a standoff distance for a living. Clamping the
  // last step to `gap - stopAt` meant that as the gap closed the step shrank to
  // match, and the mob backing off at the same speed pinned the gap two pixels
  // above the threshold â€” measured stalling at gap 120 with dP 1.7 for eighty
  // frames until `maxTime` expired and the window never opened at all. From the
  // player's seat: "I rushed him and nothing happened."
  const remaining = Math.abs(t.x - player.x) - RUSH.stopAt;
  if (remaining <= RUSH.speed * dt) {
    player.x += dir * Math.max(0, remaining);
    enterRushWindow();
    return;
  }
  player.x += dir * RUSH.speed * dt;
  // Converge his lane too, or the follow-up grab lands on a man standing in a
  // different row and whiffs for a reason the player cannot see.
  const dy = t.y - player.y;
  if (Math.abs(dy) > 2) player.y += Math.sign(dy) * Math.min(Math.abs(dy), RUSH.laneRate * dt);
  advanceRushStride(dir, dt);
}

// The run cycle and its footfalls, shared by the charge and the free sprint â€”
// they are the same stride at the same pace and must never drift apart.
//
// `darkiFootfalls` gates on `player.vx`, so it has to see the pace he is
// actually travelling â€” but both movers move him by writing `player.x`, and
// `update` integrates `vx` into `x` on its own a hundred lines earlier. Leaving
// the speed in `vx` therefore moved him TWICE: measured 1822 px/s against a
// configured 1000, which also overshot the stop mark by 16px. Set it for the
// gate, then put it back.
function advanceRushStride(dir, dt) {
  const spec = playerAnimSpec(rushSprite, 'rush');
  player.animTime += dt * spec.fps;
  const step = Math.floor(player.animTime);
  player.frame = spec.frames[step % spec.frames.length];
  player.vx = dir * RUSH.speed;
  darkiFootfalls(spec, step, dt);
  player.vx = 0;
  /* The trail is laid AFTER the frame has been chosen, so the ghost captures the
   * pose he is actually in on this frame rather than the previous one — the
   * whole effect is a record of poses and an off-by-one would show as the echoes
   * lagging his legs by a frame. */
  rushFxTrail(dir);
}

/* Drive the FREE sprint â€” forward-forward into open street. No mark, so nothing
 * homes and nothing stops him but the player, the gauge, or a wall.
 *
 * The direction is a HOLD here. `tryStartRush` fires on the second tap and that
 * key is still down at this moment, so "released" genuinely means the player let
 * go afterwards; there is no entry-grace problem of the kind the combat window
 * needed, because the sprint is not asking for a decision â€” it is obeying one
 * that is still being made.
 */
function updateRushFree(dt) {
  const dir = player.facing >= 0 ? 1 : -1;
  const holding = dir > 0 ? !!input.right : !!input.left;
  // The opening `minRun` is his whatever the keys are doing â€” see RUSH.free.
  const committed = player.rushT < RUSH.free.minRun;
  // Every way it can stop being his to steer, in one place. Blocking ends it
  // rather than being refused, exactly as it does for the charge.
  if (player.react || player.state !== 'normal' || input.blockHeld
    || (!holding && !committed)) {
    endRush();
    return;
  }
  player.rushT += dt;
  if (player.rushT > rushFreeMaxTime()) { endRush(); return; }
  if (!drainRushStamina(dt)) { endRush(); return; }

  // Run. Clamped here rather than left to the next frame's clamp because at
  // 1000 px/s a frame of overshoot is seventeen visible pixels through a wall.
  const before = player.x;
  player.x += dir * RUSH.speed * dt;
  clampPlayerToArena();
  // Pinned against the arena wall or a closed wave gate: stop, and do NOT keep
  // burning the gauge running on the spot. A player held at a gate he has not
  // opened yet should not also be paying for it.
  if (Math.abs(player.x - before) < RUSH.free.stallEps) { endRush(); return; }

  // Lane steering stays live. Cutting up or down the street mid-sprint is what
  // makes this a dodge as well as a dash, and the gauge is paying for the
  // forward burst, not for the row he ends up in.
  const depth = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (depth !== 0) player.y = clampLane(player.y + depth * PLAYER.depthSpeed * dt);

  advanceRushStride(dir, dt);
}

// Arrived. This is the whole point of the mechanic: he STOPS here and nothing
// fires on its own.
function enterRushWindow() {
  rushState = RUSH_STATE.WINDOW;
  player.rushWindowT = 0;
  player.vx = 0;
  player.anim = 'combatidle';                       // the existing combat-ready pose
  player.animTime = 0;
  // Which directions were ALREADY down as the window opened. The second of the
  // two taps is usually still held at this moment, so "a direction cancels the
  // window" has to mean a direction pressed AFTERWARDS â€” testing the held state
  // directly would cancel the window on the frame it opened, every single time.
  player.rushDirAtEntry = { left: !!input.left, right: !!input.right };
  // Shake only, and the hit-stop MUST stay zero. `update` returns early while
  // hitStopTimer is running â€” it is the first thing it checks â€” so the 0.03 s
  // freeze this originally carried skipped input reads for two frames at exactly
  // the moment the window opens and the player is meant to press something. A
  // window that swallows the first press it is asking for.
  triggerHitFx(player.x + player.facing * 40, player.y - 70, 0, 6, false);
  // A button pressed DURING the charge still counts as the player choosing â€”
  // he committed early rather than not at all â€” so it is spent here instead of
  // being thrown away on arrival.
  if (player.rushBuffered) {
    const want = player.rushBuffered;
    player.rushBuffered = null;
    fireRushFollowUp(want);
  }
}

// Hold the window open. Combat-ready and facing the mark, never idle.
function updateRushWindow(dt) {
  const t = rushTargetRef;
  player.rushWindowT += dt;
  if (player.react || player.state !== 'normal' || input.blockHeld) { endRush(); return; }
  // Steering out of it. A direction that was held on entry is only "pressed"
  // once it has been let go and pushed again, so the tap that brought him here
  // cannot cancel the window it just opened.
  const entry = player.rushDirAtEntry || { left: false, right: false };
  for (const side of ['left', 'right']) {
    if (!input[side]) entry[side] = false;          // released â€” a re-press now counts
    else if (!entry[side]) { endRush(); return; }
  }
  if (t && !t.benched && t.hp > 0) player.facing = Math.sign(t.x - player.x) || player.facing;
  if (player.rushWindowT >= RUSH.windowT) { endRush(); return; }
  const spr = spriteFor('combatidle');
  const spec = playerAnimSpec(spr, 'combatidle');
  player.animTime += dt * spec.fps * 0.5;           // the same gentle guard bob
  player.frame = spec.frames[Math.floor(player.animTime) % spec.frames.length];
}

// â–¡, R1, or the kick. All three reuse EXISTING sheets â€” no new art, no copied
// move â€” and the rush is closed before the move starts so nothing can re-enter
// it. `rushKick` is the only one of the three that is its own table entry, and
// only because a running kick needs a heavier payload and a lunge than the
// standing one; it still draws from `highKickSprite`.
function fireRushFollowUp(which) {
  endRush();
  startAttack(which === 'box' ? 'grab' : which === 'kick' ? 'rushKick' : 'combo5');
  return true;
}

/* Retire a running leap: he is back on the deck (or something took the body off
 * him). Separate from `endRush` because the leap OUTLIVES the rush by design —
 * it begins by ending one — and because every non-leap exit from a rush has to
 * pass through it too, or a leap interrupted by a hit would leave him exempt
 * from friction and trailing echoes for the rest of the level. */
function endRushLeap() {
  player.leaping = false;
  player.leapDir = 0;
  rushFxClear();
}

/* `keepFx` is passed by exactly one caller — `beginRushLeap`, which is handing
 * the trail on rather than ending it. Every other exit clears, EXCEPT while a
 * leap is in flight; see the trail note at the bottom of this function. */
function endRush({ keepFx = false } = {}) {
  // Set the pause before the gauge comes back. `rushWinded` is raised only by
  // `drainRushStamina` running the bar to zero, so the long penalty is earned by
  // redlining and never by choosing to stop â€” which is the whole point of having
  // two delays instead of one.
  if (rushState === RUSH_STATE.CHARGE || rushState === RUSH_STATE.FREE) {
    player.rushStamDelay = player.rushWinded
      ? RUSH.stamina.windedDelay : RUSH.stamina.regenDelay;
  }
  rushState = RUSH_STATE.NONE;
  rushTargetRef = null;
  player.rushT = 0;
  player.rushWindowT = 0;
  player.rushBuffered = null;
  /* THE TRAIL GOES WITH IT, on this frame. Echoes that outlive the run read as a
   * rendering fault rather than as speed, and `endRush` is the single door every
   * way out of a rush passes through — the gauge emptying, a wall, a hit, the
   * player letting go, the window timing out — so clearing here covers all of
   * them without a second check anywhere.
   *
   * THE ONE EXCEPTION IS THE LEAP, and it is not a hole in that rule: he is
   * still travelling, so the echoes are still telling the truth.
   *
   * WHY `player.leaping` GUARDS THIS AND NOT JUST `keepFx`. `startAttack` calls
   * `endRush()` — it has to, because the animation branch prefers an attack and
   * a rush left running underneath a swing fights it for `player.x`. But the air
   * strike is thrown OUT of a leap, so that call arrives in mid-air and used to
   * take the trail down on the exact frame the kick came out. It also dropped
   * the leap's physics exemptions, and the descent after the kick was then
   * clamped from 935 px/s to his 340 walking speed in one frame — a visible
   * stall in mid-air, and the same slam a standing air strike had all along.
   *
   * A LEAP IS NOT A RUSH. Ending one must not end the other; the leap has its
   * own door, `endRushLeap`, and the three places that genuinely take the body
   * off him — touchdown, a hurt reaction, a scene opening — call it themselves. */
  if (keepFx || player.leaping) return;
  rushFxClear();
}

/* Take off out of a run. Called from the jump gate in `updatePlayer`, which is
 * why it does not consume the input itself. */
function beginRushLeap() {
  const dir = player.facing >= 0 ? 1 : -1;
  /* THE CONVERSION, and the only place it happens. `RUSH.speed` is the run he
   * was actually doing — read from the config rather than from `player.vx`,
   * which is zero at this instant for the reason RUSH_LEAP explains. */
  player.vx = dir * RUSH.speed * RUSH_LEAP.carry;
  player.vy = -PLAYER.jumpVel;
  player.grounded = false;
  player.coyote = 0;
  player.buffer = 0;
  /* End the run FIRST and take the leap flags afterwards: `endRush` clears them
   * on every path that is not this one, so setting them first would have them
   * wiped by the very call that is supposed to hand them over. */
  endRush({ keepFx: true });
  player.leaping = true;
  player.leapDir = dir;
  /* The trail keeps its spacing across the take-off rather than restarting: the
   * echoes are laid by distance travelled, and resetting `lastX` here would
   * leave a 70px hole at exactly the moment he is moving fastest. */
  rushFx.active = true;
  rushFx.dir = dir;
}

// Begin a move (fresh clock + hit ledger). Grounded-only; movement is locked
// for the swing. Called from the input buffer.
function startAttack(name) {
  releaseGrab({ drop: true });        // never carry a hold into the next move
  dropCarry({ drop: true });          // â€¦of either kind
  // â€¦and never a RUN underneath one. Swinging ends the rush by definition, and
  // saying so here rather than at each call site is what makes it true for the
  // moves that reach a sprinting Darki through the ordinary input buffer â€” the
  // animation branch prefers an attack over a rush, so a sprint left running
  // would silently resume the moment the swing finished.
  endRush();
  if (name === 'pickup') {
    // NO MARK, NO PICKUP. The pickup is a nineteen-frame commitment â€” he crouches,
    // reaches, closes and hauls â€” and playing all of it at empty air read as
    // Darki miming a lift of nothing. It is also what made the move feel deaf when
    // you were half a pace short: you got the entire animation and no information
    // about why nobody came off the ground.
    //
    // A whiffed pickup is now the same whiff the OTHER grab throws, because it is
    // the same mistake â€” hands out, nothing there. `carryTarget()` IS the throw
    // condition (in reach, in lane, grabbable, not already carried), so the pickup
    // sheet plays only when the throw could actually follow it.
    const target = carryTarget();
    if (target) {
      player.carryTargetRef = target;
      player.carryWhiffed = false;
      player.carryDone = false;
      carryState = CARRY_STATE.REACH;
    } else {
      name = 'grabFail';
      // Reported as a PICKUP whiff rather than a grab one: the two share the
      // sheet, not the state machine, and a player reading the debug line should
      // see which button they actually pressed. `endAttack` clears it.
      carryState = CARRY_STATE.WHIFF;
    }
  }
  if (name === 'grab') {              // no valid mark in reach â†’ play the whiff
    const target = grabTarget();
    if (target) { player.grabTargetRef = target; player.grabWhiffed = false; player.grabDone = false; }
    else name = 'grabFail';
    player.mcArmed = null;            // fresh takeover arming for this attempt
    player.mcRepeat = 0;              // ...and a fresh mash streak
    grabState = name === 'grab' ? GRAB_STATE.STARTUP : GRAB_STATE.FAIL;
  }
  player.attack = name;
  // The SHEET the move draws from, which is not always the move's own name â€” the
  // same convention `enterGrabUppercut` already sets by hand so its finisher can
  // borrow the uppercut sheet. Identical to `name` for every move that had no
  // `anim` of its own, so nothing here changes for the existing table.
  player.anim = ATTACKS[name].anim ?? name;
  player.animTime = 0;
  player.attackStep = 0;
  player.frame = ATTACKS[name].frames[0];
  player.attackHits = new Set();
  if (name === 'combo5') { player.comboHits = new Set(); player.comboVoDone = false; }  // track a full 5-hit string
  /* A swing is thrown from a PLANT, so every grounded move stops him dead. An
   * air move is not: the jump kick is thrown from a leap and its reach is the
   * arc it arrived on, so zeroing `vx` here would stall him in mid-air and drop
   * him straight down out of his own jump. */
  if (!ATTACKS[name].air) player.vx = 0;
  /* Nothing lands mid-swing. A move started on the first grounded frame would
   * otherwise draw the attack while `landT` still runs, and then cut back to a
   * landing pose it had already interrupted. */
  player.landT = 0;
}

// RMB is the kick button: plain RMB â†’ high kick; holding "back" (the direction
// opposite Darki's facing) + RMB â†’ the rear back kick. Read before the movement
// step flips facing, so a tap of away+RMB while squared up registers as "back".
function kickWanted() {
  const backHeld = (player.facing >= 0 && input.left) || (player.facing < 0 && input.right);
  return backHeld ? 'backKick' : 'highKick';
}

// Responsive input: translate this frame's presses into a buffered attack
// (priority combo > kick > left jab > uppercut), then start it as soon as it's
// legal. Rules: nothing interrupts a `lock` move (the combo); the combo
// interrupts a jab immediately; jabs chain into another move once past their
// `cancelStart`. Adding a move = add its trigger to the priority list.
function consumeAttackInput(dt) {
  // The manual grab-combo owns the mouse while it is active or armable: clicks
  // become punches, and the jab/kick they would otherwise fire is swallowed.
  if (manualComboOwnsMouse()) {
    feedManualCombo();
    input.comboPressed = input.kickPressed = input.leftJabPressed = input.upperPressed = false;
    input.grabPressed = false;
    // LMB is the combo-tapping button, so the rapid-LMB run would otherwise keep
    // counting for the whole ~8 s string and spill a 5-hit combo (or a jab) out
    // of the first tap after it ends. Hold it at zero while we own the mouse â€”
    // clearing `comboPressed` above isn't enough, the COUNTER has to stay dead.
    lmbCount = 0; lmbLastT = -1;
    player.bufferedAttack = null;
    return;
  }
  input.lmbRaw = input.rmbRaw = false;        // drop stale edges outside the combo
  // The EXECUTION is checked before any move: it is not an attack in the ATTACKS
  // table, it takes over the player outright, and a rejected attempt must leave
  // the combat state exactly as it was (no buffered move, no whiff, no lockout).
  // Carrying owns the input outright. The spec asks for two things here and this
  // is both of them: an attack pressed mid-carry must not fire an animation that
  // is incompatible with holding a man over your head, and L2 pressed while
  // ALREADY carrying must do nothing at all (it must not re-attempt a pickup â€”
  // the release is what ends the hold, and `updateCarryHold` watches for it).
  if (player.carrying) {
    input.comboPressed = input.kickPressed = input.leftJabPressed = false;
    input.upperPressed = input.grabPressed = input.executePressed = false;
    input.lmbRaw = input.rmbRaw = false;
    player.bufferedAttack = null;
    return;
  }
  // THE RUSH COMBAT WINDOW. A windowed remap of exactly two buttons, and only
  // while the window is open: â–¡ becomes the grab combo and R1 stays the 5-hit
  // combo. Both go through `startAttack` to the moves that already exist, so
  // nothing about either is duplicated or re-timed. Outside the window â–¡ is the
  // left jab exactly as before.
  //
  // Anything ELSE the player presses closes the window and falls through to the
  // normal buffer rather than being swallowed â€” the window is an offer, not a
  // cage, and being unable to kick for 0.9 s because you rushed would be worse
  // than the mechanic is worth.
  // THE DASH ATTACK, and it is checked before either branch below because it
  // belongs to BOTH kinds of rush. The kick button is the one follow-up that
  // needs no mark â€” a running kick is thrown at a piece of street and connects
  // with whoever is standing in it â€” which is what lets a sprint into open road
  // still end in an attack instead of just ending.
  //
  // It fires at once rather than being held for the arrival, even mid-charge.
  // Striking early instead of closing all the way is a real choice, the lunge
  // covers most of the ground that gives up, and a kick that waits for a stop
  // point would just be the â–¡/R1 window with extra steps.
  if (rushState === RUSH_STATE.CHARGE || rushState === RUSH_STATE.FREE) {
    if (input.kickPressed) {
      input.kickPressed = false; input.rmbRaw = false;
      fireRushFollowUp('kick');
      return;
    }
  }
  if (rushState === RUSH_STATE.WINDOW) {
    if (input.leftJabPressed) {
      input.leftJabPressed = false; input.lmbRaw = false;
      fireRushFollowUp('box');
      return;
    }
    if (input.comboPressed) {
      input.comboPressed = false;
      fireRushFollowUp('r1');
      return;
    }
    if (input.upperPressed || input.grabPressed || input.executePressed) endRush();
  } else if (rushState === RUSH_STATE.FREE) {
    // Out of a free sprint, â–¡ and R1 are the RUNNING versions of the two moves
    // the targeted window offers on arrival â€” the same moves through the same
    // `startAttack`, thrown on the move. They fire immediately because a free
    // sprint has no arrival to wait for.
    if (input.leftJabPressed) {
      input.leftJabPressed = false; input.lmbRaw = false;
      fireRushFollowUp('box');
      return;
    }
    if (input.comboPressed) {
      input.comboPressed = false;
      fireRushFollowUp('r1');
      return;
    }
    // Anything else falls through to the ordinary buffer and simply cancels him
    // out of the run â€” `startAttack` ends the rush itself, so there is no path
    // that leaves a sprint running underneath a swing.
  } else if (rushState === RUSH_STATE.CHARGE) {
    // Pressed mid-charge still counts as the player choosing â€” he committed
    // early rather than not at all â€” so it is remembered and spent on arrival
    // (see enterRushWindow). Everything else is dropped: he is committed to the
    // approach and cannot swing out of it.
    if (input.leftJabPressed) player.rushBuffered = 'box';
    else if (input.comboPressed) player.rushBuffered = 'r1';
    input.comboPressed = input.kickPressed = input.leftJabPressed = false;
    input.upperPressed = input.grabPressed = input.executePressed = false;
    input.lmbRaw = input.rmbRaw = false;
    player.bufferedAttack = null;
    return;
  }

  if (input.executePressed) {
    input.executePressed = false;
    // Through execManualPick, the same resolver the on-screen prompt used, so the
    // press plays exactly the finisher the L2 over his head was offering.
    const pick = execManualPick();
    if (pick && startExecution(pick.target, pick.def)) return;
    // No finisher on offer, so L2 means the other thing it now means: pick the
    // man up. These two can never contend for a press, because every EXECUTIONS
    // entry is gated `victim: (e) => e.boss` and `isGrabbable` refuses a boss â€”
    // there is no target both would accept. Buffered like any other move so it
    // obeys the same legality rules (grounded, not mid-lock, not hurt).
    player.bufferedAttack = 'pickup';
    player.attackBufferT = 0.18;
  }
  let want = null;
  if (input.comboPressed) want = 'combo5';           // LMBx2 â†’ the 5-hit combo
  else if (input.grabPressed) want = 'grab';         // G / MMB â†’ grab (or the whiff)
  else if (input.kickPressed) want = kickWanted();   // RMB â†’ high kick, or back+RMB â†’ back kick
  else if (input.leftJabPressed) want = 'jabLeft';
  else if (input.upperPressed) want = 'uppercut';
  input.comboPressed = input.kickPressed = input.leftJabPressed = input.upperPressed = false;
  input.grabPressed = input.executePressed = false;
  if (want) { player.bufferedAttack = want; player.attackBufferT = 0.18; }

  if (!player.bufferedAttack) return;
  player.attackBufferT -= dt;
  if (player.attackBufferT <= 0) { player.bufferedAttack = null; return; }
  /* THE AIR ATTACK.
   *
   * There is no airborne MOVE in this game yet — the brief says as much
   * ("Animation not yet available") — and this line is why: an attack pressed
   * off the ground is refused and held in the buffer until he lands. That is
   * unchanged below. What is added is the EVENT, because the sound is what was
   * asked for and the event is what it hangs on: the moment the player commits
   * an attack while airborne.
   *
   * ONCE PER AIRBORNE ACTION, not once per press. `airAttackDone` is cleared on
   * touchdown, so mashing three buttons on the way up is one swing's worth of
   * sound — which is the same rule the brief states and the same rule the
   * animation will want when it arrives. When it does, it hangs here: this is
   * the one place that knows an air attack was committed. */
  if (!player.grounded && !player.airAttackDone && player.state === 'normal') {
    player.airAttackDone = true;
    playCue('jumpAttack', player.x);
    /* …AND NOW THERE IS AN ANIMATION FOR IT, so this is where it hangs — which
     * is what the note above always said it would be.
     *
     * WHICHEVER ATTACK BUTTON GOT HIM HERE. The buffer holds a specific move by
     * this point (a jab, a kick, the uppercut), and every one of them becomes
     * the same jump kick, because there is one airborne move and the sheet has
     * one air strike on it. That is also the rule this block already enforced
     * for the SOUND — the cue above has fired for any attack button since the
     * day it was written — so the picture now matches what the ear was already
     * being told. `airAttackDone` keeps it to one strike per jump either way.
     *
     * The buffer is cleared rather than kept: it was spent up here, and holding
     * it would fire a second, grounded swing the instant he landed — a move the
     * player asked for while airborne, delivered after the fact. */
    startAttack('airKick');
    beginAirDive();                 // …and the arc turns over into the dive
    player.bufferedAttack = null;
    return;
  }
  if (player.state !== 'normal' || !player.grounded) return;

  const cur = player.attack;
  const b = player.bufferedAttack;
  if (cur && ATTACKS[cur].lock) return;             // the combo is uninterruptible
  if (!cur) { startAttack(b); player.bufferedAttack = null; return; }
  // combo and grab are deliberate commitments â€” they cut straight into a jab
  if (b === 'combo5' || b === 'grab') { startAttack(b); player.bufferedAttack = null; return; }
  // the uppercut (incl. the hold-RMB+LMB chord) interrupts any non-locked move
  if (b === 'uppercut') { startAttack('uppercut'); player.bufferedAttack = null; return; }
  if (player.attackStep >= (ATTACKS[cur].cancelStart ?? Infinity)) {   // chain jabs
    startAttack(b);
    player.bufferedAttack = null;
  }
}

/* ------------------------------------------------------- Darki's guard */
// Darki_Block is a HELD state, not a move, which is why it lives here instead
// of in ATTACKS: every entry in that table is a one-shot with a hit window, and
// a guard is neither. Raise the forearms, hold them for as long as the button
// is down, drop them on release.
//
// What it buys: a blow from the FRONT is absorbed OUTRIGHT â€” no hurt reaction,
// no launch, no red wash, no red sprite tint, and no health lost. It bounces off
// the guard and the guard pose never breaks stride. What it costs: he is planted
// while it is up, a blocked blow slides him instead of staggering him, and it is
// no answer at all to the Agbero's side kick, which exists to go through it
// (GINGER_MOVES.kick.breaksGuard).
const BLOCK = {
  raise: [0, 1, 2, 3], raiseFps: 34,   // forearms up in 0.12s â€” faster than any
  drop: [2, 1, 0], dropFps: 30,        // wind-up in the game can arrive
  // Fraction of a blocked blow that still gets through. ZERO: a covered blow
  // costs Darki nothing at all. This was 16% chip, and chip is what made holding
  // guard read as "still losing" â€” the guard now stops the damage flat, and the
  // side kick (breaksGuard) is the ONLY thing that gets at his health while his
  // hands are up. The multiply below is left in rather than deleted so putting a
  // number back here is a one-token change.
  chip: 0,
  rage: 0.35,               // â€¦and the share of the usual rage that taking it builds

  // THE SHOVE. A blocked blow does not stagger him, it SLIDES him: velocity he
  // keeps for a moment and bleeds off, so it reads as taking the weight of the
  // hit rather than being knocked about by it. MC_Olodo's heavy blows â€” his
  // cross and his spinning hook, the two that carry `heavy` in BOSS_BLOWS â€” are
  // the ones that actually move a braced man, and they move him ~3x as far as
  // anything a Ginger throws.
  glideHeavy: 300,
  glideLight: 90,
  glideDamp: 6.5,           // e-folds per second
  glideMin: 8,              // below this it is a stutter, not a slide â€” stop

  // A guard only covers the way he is FACING. The mob AI deliberately sends
  // flankers around behind Darki (see laneDodge), so this is what makes turning
  // to face the right man matter instead of holding L1 and reading a book.
  frontBias: -24,           // px behind his feet that still count as "in front"
  breakLock: 0.55,          // a guard break keeps him from re-blocking this long

  // The freeze on a successful block. Longer than a light hit's 0.06 on purpose
  // â€” see absorbOnGuard. This is the impact read for an event that deliberately
  // has no other one: no damage, no reaction, no change of pose.
  hitStop: 0.09,
  hitStopHeavy: 0.13,
};

// Up and covering. The drop frames are deliberately NOT counted: once he has
// started lowering his hands the guard is spent, and a blow landing into the
// drop is a blow that got through.
const playerBlocking = () => player.blocking && player.blockPhase !== 'drop';

// Can he put them up right now? Not mid-reaction, not off the ground, and not
// while a side kick has his guard hanging open. Being mid-MOVE is no longer on
// that list â€” see blockCancels: the guard now interrupts a swing rather than
// queueing behind it.
// `!player.carrying` is load-bearing, not tidiness: the carry is a stance rather
// than an attack, so `!player.attack` does not exclude it. Without this, holding
// L1 mid-carry raised a guard nothing drew (the carry outranks the block in the
// animation branch) while `canMove` went false â€” Darki frozen in place, holding
// a man, with no visible reason why.
const canBlock = () => player.state === 'normal' && !player.react && !player.attack
  && !player.carrying && player.grounded && player.guardBreak <= 0;

// THE BLOCK CANCEL. Everything canBlock demands, except that a move is running â€”
// because the answer to a move running is to end it, not to wait. The other
// three conditions are not negotiable: a hurt reaction owns the body, a guard
// needs feet on the ground, and a broken guard is broken.
//
// Note this deliberately ignores `lock` (the 5-hit combo's "uninterruptible"
// flag). That flag stops OTHER MOVES chaining out of the string; it was never
// meant to trap him in it while he is being hit, and the whole point of this is
// that the guard outranks any swing he is halfway through.
const blockCancels = () => !!player.attack && player.state === 'normal'
  && !player.react && player.grounded && player.guardBreak <= 0;

// Does the guard cover a blow thrown from `from`? Measured against his facing,
// so a Ginger who has walked around behind him is hitting an open back.
const blockCovers = (from) => !from || (from.x - player.x) * player.facing >= BLOCK.frontBias;

// Raise / hold / drop, driven off the held button. This runs every frame,
// blocking or not, because the DROP has to keep playing after the button is
// already up â€” and because `guardBreak` has to tick down somewhere.
function updateBlock(dt) {
  player.guardBreak = Math.max(0, player.guardBreak - dt);
  // Holding the guard CANCELS whatever he is throwing, on the frame the button
  // goes down â€” a jab, a kick, the 5-hit string, the grab, the manual combo, any
  // of it. He used to have to see the move out and could be punished for a
  // commitment he had already changed his mind about; now the guard is the way
  // out of one.
  //
  // This runs before consumeAttackInput (see the call site), so the cancel and
  // the raise happen in the same frame rather than a frame apart.
  if (input.blockHeld && blockCancels()) {
    endAttack();                  // â€¦which also drops anyone he was holding
    player.bufferedAttack = null; // and the move he queued behind it
  }
  const want = input.blockHeld && canBlock();
  if (want && !player.blocking) {
    player.blocking = true; player.blockPhase = 'raise'; player.blockT = 0;
  } else if (!want && player.blocking && player.blockPhase !== 'drop') {
    player.blockPhase = 'drop'; player.blockT = 0;
  }
  if (!player.blocking) return;
  player.blockT += dt;
  if (player.blockPhase === 'raise') {
    if (player.blockT * BLOCK.raiseFps >= BLOCK.raise.length) {
      player.blockPhase = 'hold'; player.blockT = 0;
    }
  } else if (player.blockPhase === 'drop') {
    if (player.blockT * BLOCK.dropFps >= BLOCK.drop.length) endBlock();
  }
}

function endBlock() {
  player.blocking = false;
  player.blockPhase = 'none';
  player.blockT = 0;
}

// Which frame of darki-block is showing. 'hold' parks on the last raise frame â€”
// the full cover â€” for as long as the button is down.
function blockFrame() {
  if (player.blockPhase === 'raise')
    return BLOCK.raise[Math.min(BLOCK.raise.length - 1, Math.floor(player.blockT * BLOCK.raiseFps))];
  if (player.blockPhase === 'drop')
    return BLOCK.drop[Math.min(BLOCK.drop.length - 1, Math.floor(player.blockT * BLOCK.dropFps))];
  return BLOCK.raise[BLOCK.raise.length - 1];
}

// The slide from a blocked blow: exponential decay, clamped by the same arena
// walls a launch is â€” a shove must not push him through a gate he has not
// earned any more than a knockback may.
function updateBlockGlide(dt) {
  if (!player.blockGlide) return;
  player.x += player.blockGlide * dt;
  player.blockGlide *= Math.exp(-BLOCK.glideDamp * dt);
  if (Math.abs(player.blockGlide) < BLOCK.glideMin) player.blockGlide = 0;
  clampPlayerToArena();
}

// A blow lands on a raised guard and the guard EATS it. A shove and a spark â€”
// and pointedly none of the things a clean hit does: no damage, no reaction, no
// i-frames, no hurtstun, no screen wash, no red tint, and above all no change of
// pose. He is still standing there in the same guard frame, which is the whole
// point: the blow bounces off him.
//
// The damage block is conditional on `BLOCK.chip` rather than deleted, so the
// red tint and the KO check only ever run if chip is dialled back above zero. At
// chip 0 a blocked blow must not flash the HP bar â€” a bar that flinches while
// the number underneath it never moves is the game saying "that hurt" about a
// hit that did not.
function absorbOnGuard(amount, from, heavy) {
  const dir = Math.sign(player.x - from.x) || -player.facing || -1;
  const through = amount * BLOCK.chip;
  if (through > 0) {
    player.hp = Math.max(0, player.hp - through);
    player.hpFlash = 0.3;
  }
  addRage(RAGE_ON_HURT * BLOCK.rage, true);
  player.blockGlide = dir * (heavy ? BLOCK.glideHeavy : BLOCK.glideLight);
  // THE FREEZE. A blocked blow now stops the whole picture for a moment, the way
  // a landed one does â€” it is the only thing on screen that says the guard took
  // real weight, since by design a block costs no health, plays no reaction and
  // does not move him off his pose. It is deliberately LONGER than the hit-stop
  // a light hit gets (0.06): a blow you absorbed should read as heavier than one
  // that glanced off you, not lighter.
  triggerHitFx(player.x + player.facing * 46, player.y - 120,
    heavy ? BLOCK.hitStopHeavy : BLOCK.hitStop, heavy ? 9 : 5);
  // Its own cue, not a borrowed one. This used to reuse playHit â€” the sound of
  // Darki's FISTS landing â€” for a blow he just absorbed, so a blocked hit was
  // indistinguishable by ear from a clean one, which is the single most
  // important thing the guard has to communicate.
  playBlock(heavy);
  if (through > 0 && player.hp <= 0) koPlayer();   // chip, if any, can still finish him
}

// The side kick goes THROUGH the guard. His hands are knocked open, he eats the
// blow in full, and he cannot put them back up for `breakLock` â€” long enough
// for the Agbero to follow up, which is what stops the guard being a place to
// live. Returns nothing: the caller carries straight on into the normal hit.
function breakGuard() {
  endBlock();
  player.guardBreak = BLOCK.breakLock;
  player.blockGlide = 0;
  triggerFlash('255,236,150', 0.12);       // a brief gold snap â€” guard opened
}

/* --------------------------------------------- Darki's hurt reactions */
// Being hit used to be a 0.3s pause on the idle pose â€” the HP bar moved and the
// screen flashed, but Darki himself did nothing. Now it PLAYS, at two weights:
// a light blow snaps his head back and he recovers on his feet, and a heavy one
// takes him off the ground entirely.
//
// A reaction is a list of SEGMENTS, each with its own fps, flattened into one
// frame list with absolute end times. Per-segment speed is the whole point: the
// snap off the tarmac is faster than the tumble, the deck is slower than both,
// and the push back up is heavier than the fall was â€” one flat fps would make
// the get-up snap up in a fifth of a second and undo the weight of the landing.
// It is also what makes the KO the same performance with one number changed.
//
// Segments cross sheets freely because the artist shot the launch as ONE take
// and split it across three: Hit_Lift frame 4 and Hit_One-air frame 0 are the
// same pose to the pixel, and the air sheet's last frame hands off to
// Darki_Fall frame 0. The stepper never needs to know a sheet boundary passed.
const REACTIONS = {
  // Darki_Hit_Reaction_1, REDRAWN SHORT: three frames, not eleven. 0 is the
  // guard, 1 is that guard a hair looser, and 2 is the head snapped back â€” so
  // the sheet is an impact and a stance, with no settle drawn between them.
  //
  // Which is why this does not play 0-1-2. Ending on frame 2 would leave him
  // frozen at the extreme of the recoil and then pop to idle. It SNAPS 0->2 in
  // one fast segment and walks back down 2->1->0 in a slower one, so the
  // recovery is the return trip and he finishes on the guard that idle already
  // looks like. 0.22s all in, against the old sheet's 0.34 â€” the redraw asked
  // for quicker, and the frame list is where that gets spent.
  flinch: {
    segments: [
      { anim: 'hitReact', frames: [0, 2], fps: 30 },     // struck: the head snaps back
      { anim: 'hitReact', frames: [2, 1, 0], fps: 20 },  // rides it out, back to stance
    ],
    knockback: 170,
  },
  // The launcher. Hit_Lift â†’ Hit_One-air â†’ Darki_Fall, with a world-space arc
  // on top of the art's own lift so the launch reads as a launch and the ground
  // shadow shrinks away under him.
  launch: {
    segments: [
      { anim: 'hitLift', frames: FR(0, 4), fps: 30 },    // feet leave the tarmac
      { anim: 'hitAir', frames: FR(0, 6), fps: 26 },     // the tumble
      { anim: 'fall', frames: FR(0, 1), fps: 24 },       // â€¦down, and the shoulders land
      { anim: 'fall', frames: FR(2, 6), fps: 14 },       // flat on his back
      { anim: 'fall', frames: FR(7, 11), fps: 16 },      // pushes back up onto his feet
    ],
    landOn: ['fall', 1],       // the frame his shoulders hit: the arc is timed to
    apex: 70,                  // END here, so the crash can never drift out of
    drive: 280,                // sync with the pose that sells it
    knockback: 0,              // `drive` carries him instead
  },
};
// The KO is the SAME fall with one number changed: he stays down on the deck
// while the second wind builds, then gets up on the same five frames.
REACTIONS.ko = {
  ...REACTIONS.launch,
  segments: REACTIONS.launch.segments.map((s) =>
    (s.anim === 'fall' && s.frames[0] === 2) ? { ...s, fps: 3 } : s),
};

/* ------------------------------------------------- landing on the tarmac */
// A body dropped on a road does not stop dead, and until now both Darki's launch
// and a floored Ginger did exactly that: the arc reached the ground and the
// number went to zero on the same frame. This is the small thing that was
// missing â€” the body comes up again, much less, twice, and the second one is
// barely a lift at all.
//
// Deliberately NOT a physics restitution loop. A loop off the landing velocity
// gives a different rhythm every time it runs and there is nothing to tune when
// it looks wrong; two written-down hops always read the same and can be dialled
// by hand. The curve is the same parabola the launch arc uses, so the bounce is
// visibly the same KIND of motion as the fall that caused it.
//
// One table for Darki and the mob both. Whoever lands, lands the same way â€” only
// `scale` differs, and the enemy takes his from how hard he actually hit.
const BOUNCE = [
  { apex: 17, dur: 0.16 },   // the real one: quick, and you can see it
  { apex: 5, dur: 0.10 },    // the settle â€” reads as weight, not as a second fall
];
const BOUNCE_TOTAL = BOUNCE.reduce((t, b) => t + b.dur, 0);

// Height above the deck `t` seconds after landing. Positive = up; callers negate
// it into their own jumpY, which points down.
function bounceLift(t, scale = 1) {
  if (t < 0 || t >= BOUNCE_TOTAL) return 0;
  for (const b of BOUNCE) {
    if (t < b.dur) { const u = t / b.dur; return b.apex * scale * 4 * u * (1 - u); }
    t -= b.dur;
  }
  return 0;
}

// Flatten a reaction into one clock: every frame carries the absolute time it
// ends at, so stepping is a single comparison and the whole thing is
// frame-rate independent. `landT` is resolved from `landOn` rather than written
// down, so retiming a segment can never leave the arc landing on the wrong pose.
function buildReaction(def) {
  const steps = [];
  let t = 0;
  for (const seg of def.segments)
    for (const f of seg.frames) { t += 1 / seg.fps; steps.push({ anim: seg.anim, frame: f, until: t }); }
  let landT = 0;
  if (def.landOn) {
    const i = steps.findIndex((s) => s.anim === def.landOn[0] && s.frame === def.landOn[1]);
    if (i < 0) throw new Error(`reaction landOn ${def.landOn} is not in its own frame list`);
    landT = i === 0 ? 0 : steps[i - 1].until;      // the moment that frame BEGINS
  }
  return { ...def, steps, dur: t, landT };
}
for (const name of Object.keys(REACTIONS)) REACTIONS[name] = buildReaction(REACTIONS[name]);

// Commit Darki to a reaction. `dir` is the way he is knocked (away from whoever
// hit him), and it is stored because the KO can arrive mid-launch and inherits
// it rather than picking a new one and reversing him in mid-air.
function startReaction(name, dir) {
  const table = REACTIONS[name];
  // A reaction owns the body, and the guard is part of the body: a blow that
  // got past it (round the back, or through it) drops his hands. Any shove he
  // was still carrying goes with them â€” the reaction's own `drive` takes over.
  endBlock();
  player.blockGlide = 0;
  // â€¦and a run is part of the body too. The three rush updaters each open with
  // `if (player.react) endRush()`, but NONE of those guards can ever fire: the
  // animation branch in `update` tests `player.react` FIRST and returns, so from
  // the frame a reaction starts the rush updater is not called at all. The state
  // therefore sat at FREE/CHARGE through the whole flinch and RESUMED the moment
  // the reaction cleared â€” a sprint that survives being hit, with `canMove` held
  // false underneath it because `rushing` was still true. Ended here, at the one
  // place every reaction goes through, rather than in a branch that cannot run.
  endRush();
  // â€¦AND A RUNNING LEAP, which `endRush` deliberately leaves alone: the air
  // strike ends the rush in mid-flight and must not take the leap down with it,
  // so the leap has its own door and this is one of the three places that opens
  // it. Being hit out of the air is exactly when he should stop being exempt
  // from friction and from his own speed clamp.
  endRushLeap();
  // â€¦AND SO IS THE MAN OVER HIS HEAD, for the third time and the same reason.
  // `updateCarryHold` opens with `if (player.react || player.state !== 'normal')
  // dropCarry()`, and it is called from `else if (player.carrying)` â€” below the
  // `if (player.react)` that returns. So being hit while carrying did nothing at
  // all to the hold: `seatCarried` simply stopped being called, and the carried
  // body FROZE in mid-air at the anchor it last held while Darki was knocked
  // away from under it (measured: 131px of knockback, victim stationary, still
  // `carried` and still 140px off the ground). When the reaction ended he
  // snapped back to Darki's hands in one frame â€” or, if the player had let go of
  // L2 while staggering, the released-button branch threw him from wherever he
  // was hanging. `damagePlayer` already breaks the GRAB this way
  // (`releaseGrab({ drop: true })`); the carry was simply never given the same
  // net. Reported as "the enemy I was carrying freezes in the air, and falls
  // when I come close".
  dropCarry({ drop: true });
  player.react = { name, table, t: 0, step: 0, dir };
  player.anim = table.steps[0].anim;
  player.frame = table.steps[0].frame;
  player.animTime = 0;
  if (table.landOn) { player.vx = 0; player.grounded = false; }
  return table.dur;
}

function endReaction() {
  player.react = null;
  player.jumpY = 0;
  player.vy = 0;
  player.grounded = true;
  player.anim = 'idle';
  player.frame = idleSprite.anims.idle.frames[0];
  player.animTime = 0;
}

// Step the committed reaction. It owns the body while it runs: the frame, the
// sheet, the height off the ground and how far the blow carries him.
function advanceReaction(dt) {
  const r = player.react, R = r.table;
  r.t += dt;
  while (r.step < R.steps.length && r.t >= R.steps[r.step].until) r.step++;
  if (r.step >= R.steps.length) { endReaction(); return; }
  const s = R.steps[r.step];
  player.anim = s.anim;
  player.frame = s.frame;

  if (R.landT > 0) {
    // A parabola that is back on the deck exactly at `landT`. Driving jumpY
    // directly is safe: the normal integration resets it to 0 every frame
    // before this runs, so nothing accumulates behind it.
    const u = Math.min(1, r.t / R.landT);
    player.jumpY = -R.apex * 4 * u * (1 - u);
    player.grounded = u >= 1;
    if (u < 1) {
      player.x += r.dir * R.drive * dt;
      clampPlayerToArena();     // a launch must not fly him through a wave gate
    } else {
      // Down. The thud fires once on the crossing â€” `landed` is on the reaction
      // INSTANCE, not the table, so it cannot leak into the next launch â€” and
      // the bounce runs off the same clock, measured from the landing rather
      // than from the start of the reaction.
      if (!r.landed) {
        r.landed = true;
        playThud(player.x, 1);
        // Grit and a small camera jolt â€” but NO hit-stop. A freeze here reads as
        // a hitch rather than as weight, because it lands three frames into the
        // bounce and pins him mid-hop: measured as five identical frames at 2px
        // before the arc carried on. The blow that launched him already spent
        // its hit-stop; this is the landing, and the landing should PLAY.
        triggerHitFx(player.x, player.y - 20, 0, 5);
      }
      player.jumpY = -bounceLift(r.t - R.landT);
    }
  }
}

// Darki takes a hit: chip HP, brief hurtstun + i-frames + knockback, and rage
// builds from suffering too. Interrupts any swing. Zero HP â†’ knocked out.
// `heavy` decides the red screen wash. It defaults to the damage test, but an
// attacker can state it outright â€” MC_Olodo at 4x power deals 44 with the jab
// that is meant to read as CHIP and 72 with the cross that is meant to land, and
// on the damage test alone both would wash the screen twice a combo, which is
// exactly the strobing the heavy-hits-only rule exists to prevent.
// `breaksGuard` is the Agbero side kick's whole reason to exist: it says this
// blow ignores a raised guard. Everything else in the game respects one.
function damagePlayer(amount, from, heavy = amount >= HEAVY_DAMAGE, breaksGuard = false) {
  if (!playerHittable()) return;
  // The guard is tested BEFORE i-frames and hurtstun are handed out, because a
  // blocked blow grants neither â€” he stands there and takes the next one too.
  if (playerBlocking() && blockCovers(from)) {
    if (!breaksGuard) { absorbOnGuard(amount, from, heavy); return; }
    breakGuard();                       // â€¦the boot goes through, and he wears it
  }
  player.hp = Math.max(0, player.hp - amount);
  player.hpFlash = 0.3;
  player.state = 'hurt';
  releaseGrab({ drop: true });          // struck mid-grab â†’ the hold breaks
  player.attack = null;
  player.bufferedAttack = null;
  addRage(RAGE_ON_HURT, true);          // fills the bar, never fires the burst itself
  const dir = Math.sign(player.x - from.x) || -player.facing || -1;
  player.facing = -dir;                              // turn to face the attacker
  // `heavy` is now the LAUNCHER test as well as the screen-wash one, which is
  // the same statement said twice: a blow big enough to wash the screen is a
  // blow big enough to take him off his feet. In Level 1 that is MC_Olodo's
  // cross and his spinning hook â€” a Ginger's jab, the boss's set-up straight
  // and each lap of his super all stay under it and only rock Darki back.
  const dur = startReaction(heavy ? 'launch' : 'flinch', dir);
  player.vx = dir * player.react.table.knockback;
  // Stun runs exactly as long as the animation, and the i-frames outlast it by
  // a beat â€” the get-up is not a free hit for whoever is standing over him.
  player.hurtTimer = dur;
  player.invuln = dur + 0.45;
  triggerHitFx(player.x, player.y - 110, 0.08, 8);
  rumbleController(heavy ? 180 : 105, heavy ? 0.92 : 0.58, heavy ? 0.68 : 0.38);
  // Impact_hit â€” the one sound that means DARKI got hit, whoever threw it. It
  // sits here rather than in each attacker so a Ginger's jab, the side kick and
  // all four of MC_Olodo's blows go through one cue by construction, and the
  // next enemy added gets it for free. `heavy` drops it lower and louder, the
  // same way playHit weights a big blow.
  playImpact(heavy);
  /* AND HE SAYS SOMETHING ABOUT IT — unless that blow just killed him, in
   * which case the death cry below is the vocal and this one would talk over
   * it. HP is already decremented at this point, so the test is simply whether
   * he is still up. One vocal per damage event, and it is here rather than in
   * any attacker's code for the same reason playImpact is: every current and
   * future source of damage goes through this function. */
  if (player.hp > 0) playDarkiHit();
  // Only a HEAVY blow washes the screen red. A ginger's jab (ENEMY.damage) is
  // under the bar, so a swarm chipping away no longer strobes â€” the hit still
  // reads through Darki's red hit flash, the hit-stop, the shake and the HP chip.
  if (heavy) triggerFlash('220,40,40', 0.16);
  if (player.hp <= 0) koPlayer();
}

// Full KO: drop, then get back up at full health (arcade "second wind") so the
// slice stays playable. Clears rage.
function koPlayer() {
  /* THE DEATH CRY, ONCE PER DEATH.
   *
   * Guarded on the state we are about to leave rather than on a new flag: this
   * function is reachable from the damage path and from the debug `koNow()`,
   * and if either is ever called again while he is already down — a lingering
   * hit window, a second call in the same frame — the cue must not stack. He
   * can only start dying from not-dying.
   *
   * Pitched down 12%: see the note on CUES.darkiDeath. The supplied
   * DarkiDeath.mp3 is byte-identical to the rush groan, and until a real take
   * lands this is what keeps a death from sounding like a dash. */
  if (player.state !== 'ko') playCue('darkiDeath', player.x, 1, 0.88);
  player.state = 'ko';
  // The finishing blow drops him whatever weight it was, and it inherits the
  // direction the hit that killed him was already carrying â€” starting a fresh
  // one here would reverse him in mid-air.
  const dir = player.react ? player.react.dir : (-player.facing || -1);
  player.hurtTimer = startReaction('ko', dir);
  player.invuln = player.hurtTimer;   // â€¦and the second wind adds its own on top
  releaseGrab({ drop: true });
  player.attack = null;
  player.rage = 0; player.rageActive = false; player.rageTimer = 0;
  player.vx = 0;
  triggerFlash('255,255,255', 0.3);
}

// Where Darki is ALLOWED to be: the world edges, his lane band, and whichever
// wall the wave state has up. Called after the normal move integration and
// again after a launch drives him â€” a knockback that skipped this could carry
// him through a gate he has not earned or out of the boss arena.
function clampPlayerToArena() {
  const half = PLAYER.hitW / 2;
  player.x = Math.max(half, Math.min(WORLD_W - half, player.x));
  player.y = Math.max(LANE_TOP, Math.min(LANE_BOTTOM, player.y));
  if (waveState === 'fighting')
    player.x = Math.min(player.x, currentGate() - 60);
  else if (waveState === 'boss') player.x = Math.max(BOSS_ARENA.left, Math.min(player.x, BOSS_ARENA.right + 40));
}

const clampLane = (y) => Math.max(LANE_TOP, Math.min(LANE_BOTTOM, y));
const isGrounded = (e) => e.state === 'walk' || e.state === 'guard';

// Collision avoidance is steering-first: when a body blocks the path ahead,
// the enemy swings into a free lane and walks AROUND it (including around
// the player â€” flankers pass behind Darki). Returns -1 (dodge up), 1 (dodge
// down) or 0 (path clear).
// `ignorePlayer` is for the man who is closing in to HIT Darki: see the
// approach branch of stepEnemyAI. Everyone else still rounds behind him.
function laneDodge(enemy, moveDir, ignorePlayer = false) {
  if (!moveDir) return 0;
  let blocker = null;
  for (const other of [player, ...enemies]) {
    if (other === enemy) continue;
    if (other === player && ignorePlayer) continue;
    if (other !== player && !isGrounded(other)) continue;
    const ox = other.x - enemy.x;
    const oy = other.y - enemy.y;
    if (Math.sign(ox) !== moveDir) continue;             // not in my path
    if (Math.abs(ox) > tune.laneGapX + 84) continue;     // still far ahead
    if (Math.abs(oy) > tune.laneGapY + 22) continue;     // lane already clear
    if (!blocker || Math.abs(ox) < Math.abs(blocker.x - enemy.x)) blocker = other;
  }
  if (!blocker) return 0;
  let dodge = Math.sign(enemy.y - blocker.y) || enemy.passSide;
  if (dodge < 0 && enemy.y - 42 < LANE_TOP) dodge = 1;
  if (dodge > 0 && enemy.y + 42 > LANE_BOTTOM) dodge = -1;
  return dodge;
}

// Gentle last-resort separation for bodies that still end up overlapped
// (e.g. after a knockdown landing). The correction is capped to walking
// speed so it reads as a step aside, never a shove or a jitter, and it
// never blocks passing: a dodging enemy is already a lane away.
function sidestep(a, b, aMove, bMove, maxStep) {
  if (Math.abs(b.x - a.x) > tune.laneGapX || Math.abs(b.y - a.y) >= tune.laneGapY) return;
  let direction = Math.sign(a.y - b.y) || a.passSide || -1;
  if (direction < 0 && a.y - maxStep < LANE_TOP) direction = 1;
  if (direction > 0 && a.y + maxStep > LANE_BOTTOM) direction = -1;
  a.y = clampLane(a.y + direction * maxStep * aMove);
  if (b !== player) b.y = clampLane(b.y - direction * maxStep * bMove);
}

function separateActors(dt) {
  if (!tune.laneSep) return;
  const maxStep = 170 * dt;                    // â‰ˆ walking pace, no snapping
  for (const e of enemies) {
    if (isGrounded(e)) sidestep(e, player, 1, 0, maxStep);
  }
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      if (isGrounded(enemies[i]) && isGrounded(enemies[j])) {
        sidestep(enemies[i], enemies[j], 0.5, 0.5, maxStep);
      }
    }
  }
}

/* --- Streets-of-Rage-style mob AI ------------------------------------- */
// Blueprint (Bare Knuckle / SoR + Celia Wagar's beat-em-up AI writeup):
//   * only ENEMY.maxTokens enemies may ATTACK at once â€” the rest "menace":
//     orbit the player from spread-out slots (some behind him), never clumping;
//   * a token holder approaches, TELEGRAPHS (red flash), lunges, recovers,
//     then releases the token and rests on a per-enemy cooldown;
//   * asynchronous timers/speeds so nobody moves in lockstep;
//   * patrol until the player enters aggro range.
const ENEMY = {
  aggroX: 700, leashX: 980,
  attackRangeX: 150, attackRangeY: 44,
  // The depth lane a token holder closes to, clamped INSIDE attackRangeY. The
  // two numbers are a pair: a commit lane wider than the strike gate is an
  // enemy who arrives where he cannot swing.
  laneCommitY: 30,
  approachTimeout: 3.0,            // give the token back rather than stall the mob
  maxTokens: 1,                    // simultaneous attackers â€” bump for harder waves

  // --- the walk-in (see stageEnemyEntrance / updateEnemyEntrance) ------------
  // An entrance is STAGING, and staging must never outrank the fight. These
  // four numbers are what stop a scripted arrival from looking like a man who
  // cannot see you.
  entryOffscreen: 220,             // how far past the camera's right edge he waits
  entryAheadX: 210,                // the walk-in must finish at least this far in FRONT of Darki
  // Close to this and an on-screen arrival drops the script and squares up.
  // Deliberately under aggroX (700): he notices you at a normal fighting
  // distance, not from across the street, so the walk-in still gets to play.
  noticeX: 520,
  entryGrace: 0.55,                // â€¦and a beat before he may swing, so noticing != instant jab
  windup: 0.45, active: 0.40, recover: 0.5,
  strikeChance: 0.78,              // odds a wind-up commits to a punch (rest are feints)
  connectDelay: 0.16,              // don't land the hit until the jab is extending
  cooldownMin: 2.0, cooldownVar: 2.2,
  minGap: 66,                      // lunge stops this far out â€” never buries into Darki
  lungeMul: 2.1,
  baseHp: 42,                      // shipping value â€” hits to defeat one Ginger
  // TEST KNOB â€” set back to 1 before shipping. A full manual combo runs ~130
  // damage (~208 under rage), so 3x still dropped the Ginger mid-string; 10x
  // leaves enough headroom to watch the whole thing several times over.
  //
  // HALVED 10 -> 5 on request ("half their current strength, it's difficult to
  // beat"). Read the line above before tuning this again: 5 is still FIVE TIMES
  // the shipping value, so an Agbero carries 210 hp against a design intent of
  // 42 and eats about one and a half full combos. If the fight still grinds, the
  // fix is not another halving â€” it is putting this back to 1.
  hpMul: 5,
  get maxHp() { return this.baseHp * this.hpMul; },
  damage: 4,                       // â€¦and how hard his lunge hits: halved from 8
  hitReach: 96,                    // how close the lunge connects

  // How often a token holder picks the SIDE KICK over the jab. Seeing Darki
  // behind a raised guard raises it, because the kick is the only thing an
  // Agbero owns that goes through one â€” turtling does not stop the street, it
  // changes what the street throws at you.
  //
  // The vs-block number was 0.72 and that was simply wrong. At those odds
  // almost every attack thrown at a raised guard was the one that ignores it,
  // so blocking read as broken rather than as a trade â€” the guard has to WORK
  // most of the time for the kick to mean anything when it comes. At 0.45 a
  // little over half his commitments still die on the guard, and the boot is a
  // real threat rather than the default answer.
  kickChance: 0.30,
  kickChanceVsBlock: 0.45,
};

// The side-kick sheet's playback rate. Named because GINGER_MOVES.kick.connectAt
// is derived from it (frame 8 is the blow), and the anims.kick spec built at
// load time uses it â€” three places, one number.
const KICK_FPS = 24;

// The Agbero's two attacks, as one table apiece. `rangeX` is the gap he commits
// from, `reach` is how far the blow actually connects, and `connectAt`/
// `connectUntil` are the WINDOW it can land in â€” the same numbers MC_Olodo's
// hook needed, and for the same reason: a move that commits from further out
// than it can reach is a move that always whiffs.
//
// The window is a window rather than an instant because the blow also waits on
// `reach`, and the two conditions do not have to come true together. A kick
// thrown at someone still drifting into range passes `connectAt` while he is
// out of reach, and then lands on the first frame he ISN'T â€” which, with an
// open-ended test, can be a frame where the leg is already folding back up.
// `connectUntil` closes that: miss the extension and the kick whiffs, which is
// the correct outcome and the punish window the player is owed.
const GINGER_MOVES = {
  jab: {
    windup: ENEMY.windup, active: ENEMY.active, recover: ENEMY.recover,
    // The jab keeps its shipped, open-ended behaviour: its sheet holds the
    // extended fist for most of the swing, so there is no wrong frame to land
    // on and narrowing it now would only change a feel that already reads.
    connectAt: ENEMY.connectDelay, connectUntil: ENEMY.active,
    rangeX: ENEMY.attackRangeX, reach: ENEMY.hitReach, reachY: 52,
    damage: ENEMY.damage, minGap: ENEMY.minGap, lungeMul: ENEMY.lungeMul,
    breaksGuard: false, heavy: false, swing: 'jab',
  },
  kick: {
    // 0.62s of tell. The jab's 0.45 is already readable; the kick has to be
    // MORE so, because it is the one you cannot simply hold guard against.
    windup: 0.62, active: 0.52, recover: 0.54,
    // Frames 8-9 are the extension â€” the ones the artist drew impact sparks on.
    // They occupy indices 8,9,10,11 of the frame list (it holds 9, then steps
    // back onto 8 to begin the retraction), so the boot is actually out from
    // 8/KICK_FPS to 12/KICK_FPS. Retime the anim and BOTH of these move with
    // it, or he connects with a leg that is still chambered or already folding.
    connectAt: 8 / KICK_FPS, connectUntil: 12 / KICK_FPS,
    // â€¦and these three are set by arithmetic, not feel, exactly as MC_Olodo's
    // hook is. He commits the first frame the gap is under `rangeX`, so the
    // WORST case is committing at 215. The slowest Agbero (speed 92) then
    // travels 92 * lungeMul * connectUntil â‰ˆ 57px before the window shuts,
    // putting him at ~158 â€” inside `reach`. Raise rangeX without raising reach
    // and he throws kicks from out where they cannot land: at 230 the two
    // slowest gaps in _chromakey/newmovesverify.js whiffed every time.
    rangeX: 215, reach: 178, reachY: 58,
    damage: 7, minGap: 132, lungeMul: 1.25,   // halved from 14
    breaksGuard: true, heavy: false, swing: 'kick',
  },
};
const gingerMove = (e) => GINGER_MOVES[e.moveName ?? 'jab'];
const attackTokens = new Set();    // enemies currently allowed to attack
let mobClock = 0;                  // shared clock for the slow orbit (dt-accumulated)

// Walk toward (tx,ty), steering around any body in the path (including the
// player, so enemies round BEHIND Darki instead of piling into him).
function moveToward(enemy, tx, ty, speed, dt, ignorePlayer = false) {
  const ddx = tx - enemy.x;
  const dodge = laneDodge(enemy, Math.sign(ddx) || enemy.facing, ignorePlayer);
  const goalY = dodge ? clampLane(enemy.y + dodge * (tune.laneGapY + 24)) : ty;
  if (Math.abs(ddx) > 10) enemy.x += Math.sign(ddx) * speed * dt;
  const stepY = speed * 0.75 * dt;
  const gddy = goalY - enemy.y;
  if (Math.abs(gddy) > 5) enemy.y = clampLane(enemy.y + Math.max(-stepY, Math.min(stepY, gddy)));
  enemy.facing = Math.sign(player.x - enemy.x) || enemy.facing;   // face the player
  return Math.abs(ddx) < 20 && Math.abs(ty - enemy.y) < 16;
}

// One enemy's think step (mob AI). Assumes it is neither hit nor down.
// Only token holders ever close in; everyone else holds a SAFE STANDOFF on
// their side of the player and does footwork, so they never run into Darki.
function stepEnemyAI(enemy, dt) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distX = Math.abs(dx);
  enemy.atkCooldown = Math.max(0, enemy.atkCooldown - dt);
  enemy.stateTimer -= dt;

  switch (enemy.mode) {
    case 'approach': {                    // token holder closing to strike range
      // He sets up at the range of the move he has already chosen, so the kick
      // is thrown from out where it reaches and the jab from in where it does.
      const M = gingerMove(enemy);
      const tx = player.x + enemy.side * (M.rangeX - 40);
      // He closes on a lane he can actually SWING from. `laneBias` spreads the
      // mob out in depth (-33 + id*22), which is wider than the strike gate
      // below â€” so ids 4+ walked to a lane they could never attack from, and
      // sat there holding the only attack token.
      const bias = Math.max(-ENEMY.laneCommitY, Math.min(ENEMY.laneCommitY, enemy.laneBias));
      // â€¦and he does NOT steer around the man he is closing on. Rounding behind
      // Darki is MENACING behaviour; for the token holder it was a soft-lock:
      // the dodge pushed him a lane clear of the player just as his x arrived on
      // target, and with no x error left to move on, nothing ever pulled him
      // back into the gate. Mode 'approach', token held, mob silent â€” which is
      // what a standing player saw as the street losing interest in him.
      moveToward(enemy, tx, clampLane(player.y + bias), enemy.speed, dt, true);
      enemy.state = 'walk';
      enemy.approachT = (enemy.approachT || 0) + dt;   // || 0: NaN here would disable the timeout silently
      if (distX < M.rangeX && Math.abs(dy) < ENEMY.attackRangeY) {
        enemy.mode = 'windup';
        enemy.stateTimer = M.windup;
        enemy.didHit = false;             // one connect per swing
        enemy.willStrike = combatRng() < ENEMY.strikeChance;  // most gingers follow through; some feint
      } else if (enemy.approachT > ENEMY.approachTimeout) {
        // Belt and braces: whatever else stops a commitment landing â€” a body in
        // the way, a lane he cannot reach, a player who walked off â€” the token
        // goes back so somebody else gets a turn. A run that cannot connect must
        // never be able to stall the whole mob.
        attackTokens.delete(enemy);
        enemy.mode = 'menace';
        enemy.moveName = null;
        enemy.atkCooldown = 0.6;
      }
      break;
    }
    case 'windup':                        // ginger telegraph â€” square up, flash chevron
      enemy.state = 'guard';
      enemy.facing = Math.sign(dx) || enemy.facing;
      if (enemy.stateTimer <= 0) {
        const M = gingerMove(enemy);
        if (enemy.willStrike) {
          enemy.mode = 'attack'; enemy.stateTimer = M.active;
          // The swing itself, thrown as the wind-up ends â€” so it is a warning
          // you can act on, not a report that you were hit. A FEINT stays
          // silent, which is what keeps the sound worth listening to.
          playSwing(M.swing, enemy.x);
        } else { enemy.mode = 'recover'; enemy.stateTimer = M.recover * 0.7; }   // feint: pull back, no swing
      }
      break;
    case 'attack': {                      // lunge, but stop short of burying in
      const M = gingerMove(enemy);
      enemy.state = 'walk';
      const ld = Math.sign(dx) || enemy.facing;
      if (distX > M.minGap) enemy.x += ld * enemy.speed * M.lungeMul * dt;
      enemy.facing = ld;
      // connect: the blow lands once Darki's in reach AND the strike is out â€”
      // past `connectAt` and not yet past `connectUntil`. Missing that window
      // is a whiff, not a delayed hit.
      const into = M.active - enemy.stateTimer;       // elapsed time in the swing
      if (!enemy.didHit && into >= M.connectAt && into <= M.connectUntil
          && distX < M.reach && Math.abs(dy) < M.reachY && playerHittable()) {
        damagePlayer(M.damage, enemy, M.heavy, M.breaksGuard);
        enemy.didHit = true;
      }
      if (enemy.stateTimer <= 0) {
        // The swing is over. `didHit` is the collision half of the rule above:
        // the animation already said WHEN, and this says whether anything was
        // there. A blow that was BLOCKED is not a whiff â€” it connected and the
        // guard ate it, and it already made its own sound.
        if (!enemy.didHit) playWhiff(M.swing === 'kick', false, enemy.x + enemy.facing * 70);
        enemy.mode = 'recover'; enemy.stateTimer = M.recover;
      }
      break;
    }
    case 'recover':                       // step back out, then release the token
      enemy.state = 'walk';
      enemy.x -= (Math.sign(dx) || enemy.facing) * enemy.speed * 0.7 * dt;
      enemy.facing = Math.sign(dx) || enemy.facing;
      if (enemy.stateTimer <= 0) {
        attackTokens.delete(enemy);
        enemy.atkCooldown = ENEMY.cooldownMin + combatRng() * ENEMY.cooldownVar;
        enemy.mode = 'menace';
        enemy.moveName = null;            // next commitment picks afresh
      }
      break;
    case 'patrol':                        // pace until the player gets close
      if (distX < ENEMY.aggroX) { enemy.mode = 'menace'; break; }
      enemy.state = 'walk';
      enemy.x += enemy.direction * enemy.speed * enemy.amble * dt;
      enemy.facing = enemy.direction;
      if (enemy.x < 160 || enemy.x > WORLD_W - 160) enemy.direction *= -1;
      break;
    default: {                            // 'menace' â€” hold a safe standoff, do footwork
      if (distX > ENEMY.leashX) { enemy.mode = 'patrol'; break; }
      enemy.repositionAt -= dt;
      if (enemy.repositionAt <= 0) {      // occasionally flank to the other side
        enemy.side *= -1;
        enemy.repositionAt = 3 + combatRng() * 4;
      }
      // bob in/out around the standoff: keeps a gap AND keeps feet moving so
      // the walk never looks frozen while squared up
      const bob = Math.sin(mobClock * 1.7 + enemy.id) * 14;
      const tx = player.x + enemy.side * (enemy.standoff + bob);
      const ty = clampLane(player.y + enemy.laneBias + Math.sin(mobClock * 1.2 + enemy.id) * 8);
      moveToward(enemy, tx, ty, enemy.speed * enemy.amble, dt);
      enemy.state = 'walk';
      if (enemy.atkCooldown <= 0 && !attackTokens.has(enemy)
          && attackTokens.size < ENEMY.maxTokens) {
        attackTokens.add(enemy);          // claim the token and commit to a run
        enemy.mode = 'approach';
        enemy.approachT = 0;
        // Pick the move HERE, before he closes in, because the approach has to
        // know which range to stop at. Darki already holding his guard is the
        // thumb on the scale: a jab dies on it, the boot goes through it.
        enemy.moveName = combatRng()
          < (playerBlocking() ? ENEMY.kickChanceVsBlock : ENEMY.kickChance) ? 'kick' : 'jab';
      }
      break;
    }
  }
  enemy.direction = enemy.facing;
}

/* --- MC_Olodo (Level 1 boss) ------------------------------------------ */
// A boss is an ordinary `enemies` entry with `boss: true`, so hit detection,
// z-sorting, lane separation, the rage shockwave and the grab's exclusion list
// all treat him correctly for free. What differs is his own think step, his own
// two sheets, super armour, and a screen-wide health bar instead of the little
// floating one.

// The locked room past gate 3. `left` sits just inside the gate line (4600) so
// walking in never snaps Darki forward, and `right` keeps MC_Olodo clear of the
// world edge. Both fighters are clamped to this band for the whole fight.
const BOSS_ARENA = { left: 4640, right: 5480 };
// The boss room is a LOCKED shot: the camera stops following and holds this one
// framing for the entrance and the whole fight, so MC_Olodo can never be walked
// off the edge of the screen. It is the far end of the level, so the arena
// (4640â†’5480) sits at screen x 320â†’1160 â€” dead centre with room on both sides.
const BOSS_CAM_X = WORLD_W - VIEW_W;
const BOSS = {
  // POWER DIALS â€” same shape as ENEMY.hpMul: the `base*` values are the
  // one-star boss, and these two scale him. Both sit at 4x. They are separate on
  // purpose: `damageMul` is how hard he HITS, `hpMul` is how long he LASTS, and
  // those two are what you want to trade against each other when tuning.
  //
  // Both HALVED 4 -> 2 on request. Unlike the Agbero's hpMul these are real
  // design dials rather than a debug leftover, so 2x is a deliberate two-star
  // boss: 1240 hp and a 22 straight / 36 cross, against a one-star 620 and 11/18.
  damageMul: 2,
  hpMul: 2,
  baseHp: 620,
  baseDamage: 11,              // the straight
  baseFinishDamage: 18,        // the cross
  get maxHp() { return this.baseHp * this.hpMul; },
  get damage() { return this.baseDamage * this.damageMul; },
  get finishDamage() { return this.baseFinishDamage * this.damageMul; },
  get hookDamage() { return this.baseHookDamage * this.damageMul; },
  get spinDamage() { return this.baseSpinDamage * this.damageMul; },

  // AGGRESSION. He crowds Darki rather than circling him â€” but he now BREATHES
  // between attacks. The rest was 0.32-0.77s, which read as relentless once he
  // had more than one thing to throw: with three moves in the kit, a gap that
  // never opens is not pressure, it is noise. At 0.70-1.45s he still owns the
  // space and still out-ranges you, and the fight has a rhythm you can read.
  speed: 178,
  standoff: 175,               // gap he shuffles around while sizing Darki up
  closeSpeedMul: 1.4,          // how much harder he drives when committing
  attackRangeX: 235,           // commits to the FIST COMBO inside this gap
  closeGap: 165,               // â€¦and closes to here, no nearer: he OUT-RANGES
  attackRangeY: 70,            // Darki (whose longest box reaches ~166), so the
  cooldownMin: 0.70, cooldownVar: 0.75,  // player has to work the gap, not camp it
  hitReach: 190,               // how far each punch actually connects
  hitReachY: 62,
  armorFlinch: 0.11,           // heavy blows jolt him this long; light ones don't
                               // (how far he travels mid-move is `driveSpeed`,
                               //  per move, down in the kit)

  // THE KICK'S RANGE BAND. The hook out-reaches the fists, so it gets its own
  // commit range and its own stand-off: when he means to kick he holds further
  // out instead of walking into punching range first. That is what makes it a
  // real option rather than a second animation for the same situation.
  // These three are tied together and were set by arithmetic, not feel: he
  // commits at 300, travels ~38px through the four steps before the boot lands
  // (210px/s at 22fps), so it connects at ~262 â€” inside `hookReach`. Raise the
  // commit range without raising the reach and he throws kicks that always whiff.
  hookRangeX: 300,             // commits to the kick from out hereâ€¦
  hookGap: 250,                // â€¦and sets up at this distance, not `closeGap`
  hookReach: 270,              // how far the boot actually connects
  hookReachY: 66,
  hookChance: 0.35,            // â€¦of his in-range commitments, when both fit
  baseHookDamage: 13,          // Ã—damageMul â€” his biggest single blow
  baseSpinDamage: 7,           // Ã—damageMul â€” one lap of the super, deliberately
                               // lighter than the single kick: it is a flurry

  // SECOND GEAR. Under this much health he gets faster and stops resting
  // between combos â€” the arcade "boss gets angry" beat. Set `enrageAt: 0` to
  // switch it off entirely.
  enrageAt: 0.45,
  enrageSpeedMul: 1.22,
  enrageCooldownMul: 0.5,
  enrageFpsMul: 1.15,

  // SECOND GEAR ONLY, and on its own long clock: the multi-spin super. `laps`
  // is rolled per performance so it is never the same show twice, and the
  // cooldown is what stops it being his answer to everything â€” it is a punish
  // for standing at kick range while he is bloodied, not a rotation piece.
  superCooldownMin: 10, superCooldownVar: 6,
  superRest: 1.5,              // the recovery AFTER one, on top of the roll â€”
                               // the spins are his biggest punish window

  // HIS KIT. One table per move, all stepped by the same clock. `frames` is the
  // play order (indices into `sheet`), `hits` maps a STEP to the blow that lands
  // on it, and `drive` lists the step ranges he travels through. The tables are
  // the moves: retime one by editing its rows, and nothing else needs to know.
  //
  // The fist combo is read off MC_Olodo_SpecialMove's own silhouettes: that
  // sheet holds a squared-up guard (18-25) into a straight right (26-28), a
  // side-on guard (0-3) into a cross (4-5), and a turn-and-flex flourish (6-16)
  // with a render artefact on 17 that is never played. Played in this order it
  // reads as ONE move: telegraph â†’ straight â†’ cross â†’ showboat (which doubles as
  // his recovery, so the flourish IS the player's punish window). Nothing before
  // step 14 can move.
  combo: {
    sheet: 'special', fps: 26, drive: [[5, 8], [13, 15]], driveSpeed: 165,
    frames: [18, 18, 20, 22, 23, 24,       //  0-5   telegraph + chamber
             26, 27, 28,                   //  6-8   RIGHT STRAIGHT  (hit on 6)
             24, 23,                       //  9-10  pull it back
             1, 2, 3,                      // 11-13  chamber the cross
             4, 4, 5,                      // 14-16  THE CROSS       (hit on 14)
             6, 7, 8, 9,                   // 17-20  settle
             10, 11, 12, 13,               // 21-24  turn-and-flex flourish â€” the
             14, 15, 16],                  // 25-27  holds are trimmed vs the
                                           //        one-star boss, so he showboats
                                           //        briefly and is back on you
    windup: 6,                             // steps before the first blow lands
    hits: { 6: 'straight', 14: 'cross' },
  },

  // The spinning hook kick, off MC_Olodo_SpiningHookKick: 0-2 wind up, 3-5 turn
  // his back and coil, 6 is the extension that connects, 7-11 spin down, 12 is
  // the guard he lands in. Slower to arrive than his fists and telegraphed by a
  // full turn â€” the trade for the reach.
  hook: {
    sheet: 'hook', fps: 22, drive: [[3, 8]], driveSpeed: 210,
    frames: [0, 1, 2,                      //  0-2   squares up and reaches
             3, 4, 5,                      //  3-5   turns away, coils
             6, 6,                         //  6-7   THE EXTENSION  (hit on 6)
             7, 8,                         //  8-9   the boot comes down
             9, 10, 11,                    // 10-12  spins out of it
             12],                          // 13     back into guard
    windup: 6,
    hits: { 6: 'hook' },
  },

  // The super is the same kick held down: a lead-in, then `spin` repeated once
  // per lap (one blow each), then the way out. The frame list is BUILT at commit
  // time from these three pieces â€” see buildHookSuper â€” so 2, 3 and 4 kicks are
  // one table rather than three, and a lap can be retimed in one place.
  hookSuper: {
    sheet: 'hook', fps: 24, driveSpeed: 210,
    lead: [0, 1, 2],                       // squares up, once
    spin: [3, 4, 5, 6, 6, 7, 8],           // â€¦and this is one kick, repeated
    out: [9, 10, 11, 12],                  // â€¦stepping out of the last one
    hitAt: 3,                              // index INSIDE `spin` that connects
    laps: { min: 2, max: 4 },              // rolled per performance
  },
};

// Bloodied and faster: his second gear (see BOSS.enrageAt).
const bossEnraged = (b) => BOSS.enrageAt > 0 && b.hp / b.maxHp <= BOSS.enrageAt;

function makeBoss() {
  return {
    id: 900, kind: 'olodo', boss: true, noGrab: true,
    x: BOSS_ARENA.right + 260, y: clampLane(GROUND_Y + 34),   // off-screen right
    vx: 0, vy: 0, jumpY: 0,
    hp: BOSS.maxHp, maxHp: BOSS.maxHp, hpShown: BOSS.maxHp, hpFlash: 0,
    state: 'walk', mode: 'idle', anim: 'stance', frame: 0, animTime: 0,
    facing: -1, direction: -1, speed: BOSS.speed,
    downTimer: 0, staggerTimer: 0, koTimer: 0, alpha: 1, didHit: false,
    bounceT: 0, bounceScale: 1, prevX: 0, prevY: 0, stepClock: 0,
    dying: false, diedVo: false, fallHold: 0, fallRate: 1, execVictim: false,
    benched: false, active: false,          // `active` gates his AI (off in the cutscene)
    side: -1, laneBias: 0, standoff: BOSS.standoff, amble: 1,
    repositionAt: 4, passSide: 1, passY: GROUND_Y,
    atkCooldown: BOSS.cooldownMin, stateTimer: 0,
    spStep: -1, spTime: 0,                  // move clock
    move: null, moveName: null,             // the table he is playing, if any
    intent: null,                           // what he means to throw next
    superCooldown: 0,                       // 0 â†’ the first time he is bloodied
  };                                        //     and at range, the spins come out
}

// Which sheet/frame the boss is showing. He only ever has two: the emote stance
// and the fist combo. Both are foot-anchored and face right, so the swap never
// shifts or flips him. Knocked about, he holds the stance pose while drawEnemy's
// rotation sells the fall.
// Is the boss on his knockdown sheet right now? One predicate, because three
// places have to agree about it: the animation router, the draw path (which must
// stop rotating him the moment real fall art exists) and the frame stepper (which
// skips the boss entirely otherwise, since he normally drives his own frame).
const bossFalling = (b) => !!olodoFallSprite && !b.grabbed
  && (b.state === 'hit' || b.state === 'down' || b.state === 'ko');

function bossAnim(b) {
  // GOING DOWN â€” his own drawn fall, not his stance turned on its side. Placed
  // FIRST because it has to beat the move sheets: a boss floored mid-hook still
  // has `anim === 'hook'` set from the move he was thrown out of, and reading
  // that here is what used to leave him spinning a kick while flat on the road.
  //
  // ONE SHEET FOR BOTH OUTCOMES, unlike the mob, which has a separate death
  // sheet: on a lethal fall he simply never reaches `getUp`, because `ko` holds
  // `fallDown` and its last frame is a man face-up and still. `dying` therefore
  // needs no branch here â€” the state does the work.
  if (bossFalling(b)) {
    const name = b.state === 'hit' ? 'fallAir'
      : (b.state === 'down' && b.downTimer <= fallTimes(b).getUp / (b.fallRate || 1))
        ? 'getUp' : 'fallDown';
    return { sprite: olodoFallSprite, config: OLODO_FALL_SHEET,
             spec: olodoFallSprite.anims[name], name };
  }
  if (b.anim === 'special')
    return { sprite: olodoSpecialSprite, config: OLODO_SPECIAL_SHEET,
             spec: olodoSpecialSprite.anims.walk, name: 'special' };
  if (b.anim === 'hook')
    return { sprite: olodoHookSprite, config: OLODO_HOOK_SHEET,
             spec: olodoHookSprite.anims.walk, name: 'hook' };
  return { sprite: olodoStanceSprite, config: OLODO_STANCE_SHEET,
           spec: olodoStanceSprite.anims.walk, name: 'stance' };
}

// The stance loop runs off its own clock so it keeps bobbing through the
// cutscene, the stagger and the walk-in â€” anywhere the generic enemy animation
// step doesn't run.
function advanceBossStance(b, dt) {
  b.anim = 'stance';
  const spec = olodoStanceSprite.anims.walk;
  b.animTime += dt * spec.fps;
  b.frame = spec.frames[Math.floor(b.animTime) % spec.frames.length];
}

// Splice `laps` copies of the spin between the lead-in and the way out. Every
// lap gets its own hit step and its own drive window, so the built table is the
// same shape as the hand-written ones and the stepper can't tell them apart.
function buildHookSuper(laps) {
  const S = BOSS.hookSuper;
  const frames = [...S.lead];
  const hits = {};
  const drive = [];
  for (let i = 0; i < laps; i++) {
    const at = frames.length;
    frames.push(...S.spin);
    hits[at + S.hitAt] = 'spin';
    drive.push([at, at + S.spin.length - 1]);
  }
  frames.push(...S.out);
  return { sheet: S.sheet, fps: S.fps, driveSpeed: S.driveSpeed,
           frames, hits, drive, windup: S.lead.length + S.hitAt, laps };
}

// Commit to one of his three moves. The boss CARRIES the table he is playing,
// so everything downstream â€” the stepper, the sheet, the telegraph â€” reads it
// off him instead of assuming the fist combo.
function startBossMove(b, name) {
  b.moveName = name;
  b.move = name === 'hookSuper'
    ? buildHookSuper(BOSS.hookSuper.laps.min
        + Math.floor(combatRng() * (BOSS.hookSuper.laps.max - BOSS.hookSuper.laps.min + 1)))
    : BOSS[name];
  b.mode = 'special';                     // 'committed to a move', whichever it is
  b.anim = b.move.sheet;
  b.spTime = 0;
  b.spStep = -1;
  b.frame = b.move.frames[0];
  b.intent = null;
}

// Kept for the test hook and any caller that means the fists specifically.
function startBossCombo(b) { startBossMove(b, 'combo'); }

function endBossMove(b) {
  const wasSuper = b.moveName === 'hookSuper';
  b.mode = 'idle';
  b.move = null; b.moveName = null;
  b.spStep = -1;
  b.spTime = 0;
  const rest = BOSS.cooldownMin + combatRng() * BOSS.cooldownVar
    + (wasSuper ? BOSS.superRest : 0);
  b.atkCooldown = rest * (bossEnraged(b) ? BOSS.enrageCooldownMul : 1);
  if (wasSuper) b.superCooldown = BOSS.superCooldownMin + combatRng() * BOSS.superCooldownVar;
  b.animTime = 0;
  advanceBossStance(b, 0);
}

// One blow lands (or whiffs). Reach is measured FORWARD of him, so a Darki who
// has slipped behind never eats a punch thrown the other way. The boot reaches
// further than either fist â€” that is the whole point of the kick.
const BOSS_BLOWS = {
  straight: { get damage() { return BOSS.damage; },     reach: () => BOSS.hitReach,      reachY: () => BOSS.hitReachY, heavy: false },
  cross:    { get damage() { return BOSS.finishDamage; }, reach: () => BOSS.hitReach + 24, reachY: () => BOSS.hitReachY, heavy: true },
  hook:     { get damage() { return BOSS.hookDamage; }, reach: () => BOSS.hookReach,     reachY: () => BOSS.hookReachY, heavy: true },
  spin:     { get damage() { return BOSS.spinDamage; }, reach: () => BOSS.hookReach,     reachY: () => BOSS.hookReachY, heavy: false },
};
// How many steps ahead of a blow his swing is heard. At his 22-26 fps that is
// ~80ms of warning â€” enough to read, not enough to make the blow free.
const BOSS_SWING_LEAD = 2;

function bossStrike(b, kind) {
  const blow = BOSS_BLOWS[kind];
  const forward = (player.x - b.x) * (b.facing >= 0 ? 1 : -1);
  if (forward < -46 || forward > blow.reach()) return;
  if (Math.abs(player.y - b.y) > blow.reachY()) return;
  if (!playerHittable()) return;
  // Only the CROSS and the single hook wash the screen. His straight reads as
  // the set-up, and the super's laps are a flurry â€” flashing on each one would
  // strobe the fight and turn the wash back into background hum.
  damagePlayer(blow.damage, b, blow.heavy);
}

// Step whichever move he committed to. Hit steps are tested as CROSSED, not
// equalled, so a long frame can never skip a blow and a short one can never
// double it.
function advanceBossMove(b, dt) {
  const M = b.move;
  b.spTime += dt * M.fps * (bossEnraged(b) ? BOSS.enrageFpsMul : 1);
  const step = Math.floor(b.spTime);
  for (let s = b.spStep + 1; s <= Math.min(step, M.frames.length - 1); s++) {
    // The swing leads its own blow by SWING_LEAD steps. Reading it off `hits`
    // rather than writing it into the tables means it costs no table entry, it
    // cannot drift out of sync with a retime, and the multi-spin super â€” whose
    // table is BUILT at commit time, one hit per lap â€” gets a whoosh per lap
    // for free. The blows he leads with land on his heaviest sounds.
    const lead = M.hits[s + BOSS_SWING_LEAD];
    if (lead) playSwing(BOSS_BLOWS[lead].heavy ? 'heavy' : 'kick', b.x);
    if (M.hits[s]) bossStrike(b, M.hits[s]);
  }
  b.spStep = Math.min(step, M.frames.length - 1);
  if (step >= M.frames.length) { endBossMove(b); return; }
  b.frame = M.frames[step];
  b.anim = M.sheet;
  // drive forward through the move's own travelling stretches
  if (M.drive.some(([lo, hi]) => step >= lo && step <= hi)) {
    b.x += (b.facing >= 0 ? 1 : -1) * M.driveSpeed * dt;
  }
  b.x = Math.max(BOSS_ARENA.left, Math.min(BOSS_ARENA.right, b.x));
}

// What he means to throw NEXT. Picked ONCE, the moment his rest runs out, and
// held until he throws it â€” so the approach commits to a move instead of the
// move being whatever happened to fit where he ended up. That is the whole
// difference between a boss with two attacks and a boss with a plan.
function pickBossIntent(b, distX) {
  // Second gear only, on its own long clock, and it wants room: the spins
  // travel, so he winds them up at kick range rather than in Darki's chest.
  if (bossEnraged(b) && b.superCooldown <= 0 && distX > BOSS.closeGap) return 'hookSuper';
  // Past his fists the boot is the only thing that reaches, so backing out of
  // punching range stops being safe. Inside it he still leads with his hands.
  if (distX > BOSS.attackRangeX) return 'hook';
  return combatRng() < BOSS.hookChance ? 'hook' : 'combo';
}

// MC_Olodo's think step. He has no walk sheet by design: the emote stance IS his
// footwork, so he bobs in and out of the standoff, decides what he is throwing
// when his rest runs out, and closes to THAT move's range before committing.
function stepBossAI(b, dt) {
  if (!b.active) { advanceBossStance(b, dt); return; }
  if (bossEnraged(b) && fxRng() < dt * 14) spawnEmbers(b.x, b.y - 60, 1, '#ff6a3d', 60);
  if (b.mode === 'special') { advanceBossMove(b, dt); return; }

  const dx = player.x - b.x;
  const distX = Math.abs(dx);
  b.atkCooldown = Math.max(0, b.atkCooldown - dt);
  b.superCooldown = Math.max(0, b.superCooldown - dt);
  b.state = 'walk';

  // Hold the near side of Darki and breathe in and out around the standoff;
  // once the cooldown is spent, pick a move and close to ITS range instead.
  const side = Math.sign(b.x - player.x) || -1;
  const closing = b.atkCooldown <= 0;
  if (!closing) b.intent = null;
  else if (!b.intent) b.intent = pickBossIntent(b, distX);
  const kicking = b.intent === 'hook' || b.intent === 'hookSuper';
  const bob = Math.sin(mobClock * 1.6) * 16;
  const gap = closing ? (kicking ? BOSS.hookGap : BOSS.closeGap) : BOSS.standoff + bob;
  const tx = player.x + side * gap;
  const ty = clampLane(player.y + Math.sin(mobClock * 0.9) * 10);
  const rage = bossEnraged(b) ? BOSS.enrageSpeedMul : 1;
  moveToward(b, tx, ty, b.speed * rage * (closing ? BOSS.closeSpeedMul : 0.85), dt);
  b.x = Math.max(BOSS_ARENA.left, Math.min(BOSS_ARENA.right, b.x));
  b.mode = closing ? 'approach' : 'idle';

  if (closing && Math.abs(player.y - b.y) < BOSS.attackRangeY
      && distX < (kicking ? BOSS.hookRangeX : BOSS.attackRangeX)) {
    startBossMove(b, b.intent);
    return;
  }
  advanceBossStance(b, dt);
}

// A heavy blow is the only thing that interrupts him: light hits chip his health
// and flash him white but never break his rhythm (super armour), so a swarm of
// jabs can't stun-lock the boss the way it can a Ginger.
function staggerBoss(b, dir, kbX) {
  if (b.mode === 'special') endBossMove(b);
  b.state = 'stagger';
  b.staggerTimer = BOSS.armorFlinch;
  b.vx = dir * kbX * 0.3;
  b.facing = -dir;
}

function onBossDefeated(b) {
  // Where he FELL, read before he is parked: the embers and the ledger both
  // belong at that spot on the tarmac, and `b.x` is about to be -9999.
  const fellX = b.x, fellY = b.y;
  b.benched = true;
  b.alpha = 0;
  b.x = -9999;                   // parked like a spent wave slot: nothing to draw
  waveState = 'complete';
  triggerFlash('255,255,255', 0.45);
  spawnEmbers(fellX, fellY - 90, 44, '#ffcf5a', 150);
  startOutro(fellX, fellY);      // â€¦and the level ends on the case file
}

/* --- MC_Olodo's entrance (cutscene) ----------------------------------- */
// A short scripted beat that TAKES CONTROL, the way a Capcom boss reveal does:
// input is dead, the letterbox closes, the camera pushes off Darki into the
// arena, and MC_Olodo emotes his way in from off-screen right â€” he has no walk
// cycle, so his stance loop plays the whole way and the swagger IS the walk-in.
// He plants, the name plate slams in on a white flash and a shake, the bars pull
// back, "FIGHT!" pops and control returns on the same frame his AI wakes up.
//
// The phase list is the whole script: retime or restage the entrance by editing
// these four rows. Every beat is driven off `cutscene.t`, so it is frame-rate
// independent and identical at 20 or 144 fps.
//
// THE NARRATION PLAYS INSIDE THIS SCENE, and the scene is sized around it. The
// line used to run over free play â€” the gate stayed shut for 21.7 s while the
// player wandered a cleared street with a countdown on the HUD and Olodo not yet
// on screen. It is a speech about the man; he should be standing there for it.
// So it starts on the first frame of the entrance and the bars stay in until it
// ends: Darki walks in under it, Olodo swaggers in under it, and the two of them
// hold the stand-off â€” Olodo emoting (his stance loop IS his emote), Darki STOOD
// IDLE and listening, neither able to throw a punch because the scene owns the
// input and his AI is still asleep â€” until the last word, when the plate slams,
// he squares up, and control comes back. See the pose note in updateCutscene for
// why he is not holding a guard through the speech.
const CUT = {
  phases: [
    ['push',   0.70],            // lock control, bars in, Darki steps into the arena
    ['enter',  2.30],            // Olodo swaggers in from off-screen right
    ['speech', 0],               // DYNAMIC â€” the stand-off, sized by the line (see cutPhaseDur)
    ['pose',   1.30],            // he plants; the name plate slams
    ['ready',  1.00],            // bars out, FIGHT!, control back
  ],
  playerMark: 4720,              // where Darki settles for the stand-off
  bossMark: 5230,                // where MC_Olodo plants â€” ~920px across the shot
  bossStartX: BOSS_ARENA.right + 300,
  barH: 92,                      // letterbox bar height at full close
  /* What the stand-off costs when the line does NOT play â€” muted, audio blocked,
   * buffer missing. Without this the scene would hold its full seventeen seconds
   * on silence, which is the same bug as the countdown it replaced. */
  silentHold: 0.80,
};
const cutscene = { active: false, phase: 0, t: 0, letterbox: 0, plate: 0, fight: 0, slammed: false, speechHold: 0 };
let fightBanner = 0;             // "FIGHT!" lingers this long after control returns

const cutPhase = () => CUT.phases[Math.min(cutscene.phase, CUT.phases.length - 1)][0];

/* How long the beat at `i` runs. Every phase but one is a scripted number; the
 * stand-off is whatever is LEFT of the narration once the beats that play under
 * it are paid for, which is not knowable until the line is actually rolling. */
const cutPhaseDur = (i = cutscene.phase) => {
  const [name, dur] = CUT.phases[Math.min(i, CUT.phases.length - 1)];
  return name === 'speech' ? cutscene.speechHold : dur;
};

/* The beats that run WHILE the line plays, other than the stand-off itself. The
 * narration is timed to end on the last frame of 'pose', so control returns on
 * the word after the last one â€” derived from the phase list rather than typed
 * beside it, or retiming a beat would silently desync the speech from the fight. */
const cutSpokenBeats = () => CUT.phases
  .filter(([n]) => n !== 'speech' && n !== 'ready')
  .reduce((a, [, d]) => a + d, 0);

// Walking past the last gate cues the entrance.
function startBossIntro() {
  waveState = 'bossIntro';
  /* HIS FEET ON THE GROUND FIRST. This used to clear only `vx`, the attack and
   * the grab, so crossing the gate mid-jump handed the cutscene an airborne
   * player it had no way to bring down — see parkPlayerForScene. */
  parkPlayerForScene();
  for (const e of mobs()) benchEnemy(e);        // the street clears for the boss
  attackTokens.clear();
  // Exactly one MC_Olodo, ever: re-entering the intro (a retry, or the test
  // hook) must retire the previous body or a second copy would fight alongside
  // him â€” and share his id, so a single swing could only ever damage one.
  enemies = enemies.filter((e) => !e.boss);
  // Same rule for the ENDING: re-entering the intro retires the previous one, or
  // a retry would run the new fight under a case file that never came down (the
  // outro holds forever by design, and it owns both the input and the frame).
  outro.active = false;
  evidence.active = false; evidence.gone = true;
  boss = makeBoss();
  boss.x = CUT.bossStartX;
  boss.y = clampLane(GROUND_Y + 34);
  enemies.push(boss);
  cutscene.active = true;
  cutscene.phase = 0; cutscene.t = 0;
  setBars(cutscene, 0); cutscene.plate = 0; cutscene.fight = 0;
  cutscene.slammed = false;
  /* The line, and the scene sized to it. `interrupt` because a combat quip must
   * not hold the entrance open behind it, and `pan: false` because this is
   * narration over a framed shot, not a sound coming from where Darki stands.
   * Sized off whether it ACTUALLY started: playDarkiVoice reports false when
   * audio is muted, blocked or undecoded, and holding seventeen silent seconds
   * for a line nobody can hear is worse than not staging it at all. */
  const spoke = playDarkiVoice('reachOlodo', { interrupt: true, pan: false });
  cutscene.speechHold = spoke
    ? Math.max(0, DARKI_VOICE.reachOlodo.dur - cutSpokenBeats())
    : CUT.silentHold;
}

// Control returns, MC_Olodo's AI wakes up, the fight is on.
function finishBossIntro() {
  cutscene.active = false;
  setBars(cutscene, 0); cutscene.plate = 0; cutscene.fight = 0;
  waveState = 'boss';
  boss.active = true;
  boss.atkCooldown = BOSS.cooldownMin;
  fightBanner = 1.1;
  player.facing = 1;
}

// Enter / Start during the entrance skips it rather than pausing: everything
// lands where the script would have left it, so nothing is half-staged.
function skipCutscene() {
  if (!cutscene.active) return;
  player.x = CUT.playerMark;
  boss.x = CUT.bossMark;
  boss.facing = -1;
  /* The narration goes with the scene it belongs to. Skipping the entrance and
   * then fighting the first twenty seconds of the boss under a speech about
   * meeting him is the same leak as the music one â€” a beat that outlives the
   * thing that started it. */
  stopDarkiVoice();
  queuedVoice = null;
  finishBossIntro();
}

// A scripted scene owns the input: swallow every edge so nothing the player
// mashed during it fires on the frame it ends. Shared by the entrance and the
// outro â€” both take control completely.
function swallowInput() {
  input.jumpPressed = input.leftJabPressed = input.kickPressed = false;
  input.comboPressed = input.upperPressed = input.grabPressed = false;
  input.lmbRaw = input.rmbRaw = false;
  player.bufferedAttack = null;
  lmbCount = 0; lmbLastT = -1;
}

// Advance whichever of Darki's loops a scene has him showing, so he never
// freezes on a single frame while the script drives him.
/* The animation clock for every SCRIPTED beat â€” the walk-in, the boss-room
 * push, the walk to the ledger. updatePlayer has its own copy of this because
 * live play modulates the rate by how fast he is actually moving; these beats
 * play the cycle at its own fps.
 *
 * IT FIRES HIS BOOTS. It did not, and that is why Darki walked into his own
 * level in silence: `darkiFootfalls` was wired into updatePlayer's branch only,
 * so every walk the game scripts for him â€” the one the level opens on, the one
 * into the boss room, the one across the arena to pick up the ledger â€” played
 * the stride with the sound stripped out. The gates inside darkiFootfalls are
 * unchanged and still decide whether a step is earned; this only gives them the
 * chance to look. */
function advancePlayerAnim(dt) {
  const spr = spriteFor(player.anim);
  const spec = playerAnimSpec(spr, player.anim);
  player.animTime += dt * spec.fps * (player.anim === 'combatidle' ? 0.5 : 1);
  const step = Math.floor(player.animTime);
  player.frame = spec.frames[step % spec.frames.length];
  darkiFootfalls(spec, step, dt);
}

function updateCutscene(dt) {
  swallowInput();

  mobClock += dt;                              // pulses/bobs keep breathing
  cutscene.t += dt;
  const name = CUT.phases[cutscene.phase][0];
  const dur = cutPhaseDur();
  const k = dur > 0 ? Math.min(1, cutscene.t / dur) : 1;   // 0â†’1 through this phase

  /* ---- staging ----
   *
   * HE STANDS THROUGH THE NARRATION, he does not hold a guard through it.
   *
   * Every beat but the walk-in used to put him in `combatidle`, which sounds
   * like the right pose for a stand-off and is not what it looks like: there is
   * no combat-idle SHEET, so `combatidle` is the combat WALK cycle played at
   * half rate (see spriteFor and the rate branch in advancePlayerAnim). Held
   * for the length of a seventeen-second speech, that reads as Darki marking
   * time on the spot — a man jogging in place while somebody talks about the
   * fight he is about to have.
   *
   * `idle` is the breathing loop off his own idle sheet, and it is what
   * "standing there listening" actually looks like. The guard comes back on
   * `ready` — the plate has slammed, the line is over, and squaring up on the
   * last word IS the transition into the fight rather than a pose he has been
   * holding since before Olodo walked on. */
  const cutIdle = name === 'ready' ? 'combatidle' : 'idle';
  /* Restart the loop when the pose changes. `animTime` is shared across every
   * one of Darki's cycles, so walking in on frame 12 and then switching sheets
   * lands him on whatever frame 12 happens to be of the new one — which is a
   * visible jump at exactly the two moments the scene wants to look composed.
   * Only on a real change, or the loop would never advance. */
  const setCutPose = (a) => {
    if (player.anim !== a) { player.anim = a; player.animTime = 0; }
  };
  if (name === 'push') {
    // Darki walks the last couple of strides into the arena and squares up.
    const CUT_WALK = 210;                    // px/s â€” his pace on this beat
    const gap = CUT.playerMark - player.x;
    if (gap > 4) {
      player.x += Math.min(gap, CUT_WALK * dt);
      setCutPose('walk');
      player.vx = CUT_WALK;                  // â€¦so his boots are audible (see advancePlayerAnim)
    } else {
      setCutPose(cutIdle);
      player.vx = 0;
    }
    player.facing = 1;
  } else {
    setCutPose(cutIdle);
    player.facing = 1;
  }
  advancePlayerAnim(dt);

  if (name === 'enter') {
    // ease-out swagger: fast off the edge, settling onto his mark
    const e = 1 - Math.pow(1 - k, 3);
    boss.x = CUT.bossStartX + (CUT.bossMark - CUT.bossStartX) * e;
  } else if (cutscene.phase > 1) {
    boss.x = CUT.bossMark;
  }
  boss.facing = -1;                            // squared up on Darki the whole time
  advanceBossStance(boss, dt);

  // the name plate SLAMS on the first frame of the pose beat
  if (name === 'pose' && !cutscene.slammed) {
    cutscene.slammed = true;
    triggerFlash('255,255,255', 0.2);
    triggerHitFx(boss.x, boss.y - 130, 0.05, 13, true);
    spawnEmbers(boss.x, boss.y - 60, 26, '#ffcf5a', 120);
  }

  // ---- camera + framing furniture ----
  cameraX = damp(cameraX, BOSS_CAM_X, 3.2, dt);
  cameraX = Math.max(0, Math.min(WORLD_W - VIEW_W, cameraX));
  cameraY = 0;
  const barsOut = name === 'ready' && cutscene.t > 0.30;
  rampBars(cutscene, barsOut ? 0 : 1, dt);
  const plateWanted = (name === 'pose' || (name === 'ready' && cutscene.t <= 0.30)) ? 1 : 0;
  cutscene.plate = damp(cutscene.plate, plateWanted, plateWanted ? 26 : 12, dt);
  cutscene.fight = damp(cutscene.fight, name === 'ready' && cutscene.t > 0.22 ? 1 : 0, 20, dt);

  // ---- next beat ----
  if (cutscene.t >= dur) {
    if (cutscene.phase >= CUT.phases.length - 1) { finishBossIntro(); return; }
    cutscene.phase++;
    cutscene.t = 0;
  }
}

/* --- The case file (MC_Olodo's outro) --------------------------------- */
// The level ENDS the way it opened: one clock, a phase list, no input. Olodo
// drops the ledger Darki came for, Darki crosses to it and picks it up, and the
// case file slams up over the frozen street. The last beat has no duration â€” it
// HOLDS, because there is nothing after Level 1 yet and there is no reset path
// to hand control back to.
//
// Retime or restage the ending by editing these four rows, exactly as with CUT.
const OUTRO = {
  phases: [
    ['fall', 1.20],              // bars close, the ledger flutters out and lands
    ['walk', 4.20],              // Darki crosses to it and takes it â€” this beat
    ['card', 0.85],              //   ends EARLY, the moment the lift finishes
    ['file', Infinity],          // the case file holds: the end of the level
  ],
  walkSpeed: 260,                // px/s he crosses the arena at
  reach: 64,                     // how close he stands before he stoops for it
  // The walk beat's 4.20 is a CAP, not a pace. Olodo can die anywhere in an
  // 840px arena, so the longest walk there is (840 - reach) is 2.99s at this
  // speed â€” the beat always ends early, on the pickup, and the cap only exists
  // so the ending can never hang. Shorten it and a far drop stops being a walk:
  // `grabBy` fires, and the ledger lifts out of thin air short of his hand.
  grabBy: 0.50,
  liftDur: 0.40,                 // how long it rises into his hand and fades
};
const EV_FALL = 0.85;            // seconds the ledger takes to reach the tarmac
const EV_RISE = 160;             // â€¦from this high above it

// The case file is COPY, held apart from the staging: rewriting the case never
// means touching a beat. Fiction â€” MC_Olodo, his corner and his ledger are
// invented for the game and are not a claim about anybody real.
const CASE_FILE = {
  no: 'CASE FILE 001',
  where: 'LAGOS ISLAND · BALOGUN STREET',
  rows: [
    ['SUSPECT', 'MC OLODO — street act, self-appointed "area boss"'],
    ['CHARGE', 'Running the corner as his own toll gate'],
    ['EVIDENCE', 'The collection ledger, dropped in the fight'],
    ['VERDICT', 'Down. The street belongs to nobody again.'],
  ],
  teaser: 'NEXT CASE — whoever was paying him',
};

const outro = { active: false, phase: 0, t: 0, letterbox: 0, wash: 0, card: 0, slammed: false };

/* THE POST-MISSION SEQUENCE. The fight ends on the mission card; everything
 * after it â€” the evidence analysis over analysisBG, the next target, The Cabal,
 * the level choice â€” is one state machine living in aftermath.js. It is handed
 * the front end's real widgets rather than a second set (see `ui` there), and it
 * owns the frame only once the player has pressed X on the card. */
const aftermath = createAftermath({
  ctx, W: VIEW_W, H: VIEW_H,
  getUi: () => frontEnd?.ui ?? null,
  getVolume: () => {
    const s = frontEnd?.settings;
    return s ? Math.max(0, Math.min(1, s.master * s.voice)) : 1;
  },
  /* The one door out. Both choices go through the front end's existing level
   * pipeline â€” intro video, case file, handover â€” rather than a second one.
   *
   * ENDING THE OLD MISSION IS PART OF LEAVING IT. The front end going active
   * hides the finished fight but does not retire it, and `startLevelEntry` is
   * half a minute of intro video away, so without this the run that just ended
   * stays live underneath: its score keeps playing under the menu's ambience
   * (two soundtracks at once) and `aftermath.active` keeps eating X/Enter/
   * arrows once gameplay resumes, which is the "two sessions in parallel" this
   * reads as. */
  onChooseLevel: (level) => { endMission(); frontEnd?.startLevel(level); },
});

/* Release everything the finished mission still owns: the input, the frame and
 * the audio. Safe to call twice â€” every step is idempotent â€” because both the
 * level-select door and `startLevelEntry` run it and neither may assume the
 * other did. */
function endMission() {
  aftermath.stop();                    // gives back the keyboard, the pad and the frame
  outro.active = false;                // the case file holds forever by design; take it down
  evidence.active = false; evidence.gone = true;
  cutscene.active = false;
  paused = false;
  stopDarkiVoice();
  queuedVoice = null;
  resetMusicPlaylist();                // â€¦so the next startMusic() is not a no-op
}
// The dropped ledger, a world-space prop: falls, lies on the tarmac, then lifts
// into Darki's hand and fades. `gone` retires it from the draw list.
const evidence = { active: false, x: 0, y: 0, t: 0, held: false, lift: 0, gone: false };

const outroPhase = () => OUTRO.phases[Math.min(outro.phase, OUTRO.phases.length - 1)][0];

// Olodo has hit the tarmac at (x, y) and been parked: start the ending there.
function startOutro(x, y) {
  parkPlayerForScene();          // the same park the boss entrance uses
  outro.active = true;
  outro.phase = 0; outro.t = 0;
  setBars(outro, 0); outro.wash = 0; outro.card = 0; outro.slammed = false;
  evidence.active = true;
  evidence.x = Math.max(BOSS_ARENA.left + 40, Math.min(BOSS_ARENA.right - 40, x));
  evidence.y = clampLane(y);
  evidence.t = 0; evidence.held = false; evidence.lift = 0; evidence.gone = false;
}

// Where the ledger is drawn right now: falling with a sway, flat on the tarmac,
// or rising into his hand. `flat` squashes it as it settles so it reads as lying
// on the road rather than standing on its edge, and unsquashes as he lifts it.
function evidencePose() {
  const p = Math.min(1, evidence.t / EV_FALL);
  const drop = 1 - Math.pow(1 - p, 2);              // ease-out onto the road
  if (!evidence.held) {
    return {
      x: evidence.x + (1 - p) * Math.sin(evidence.t * 7.5) * 22,
      y: evidence.y - 6 - EV_RISE * (1 - drop),
      rot: (1 - p) * Math.sin(evidence.t * 6) * 0.55 + p * 0.10,
      flat: drop, alpha: 1,
    };
  }
  const l = Math.min(1, evidence.lift);
  return { x: evidence.x, y: evidence.y - 6 - 96 * l, rot: 0.10 * (1 - l),
           flat: 1 - l, alpha: 1 - l * l };
}

// Enter / Start during the ending skips to the case file, the same contract the
// entrance's skip honours: everything lands where the script would have left it.
function skipOutro() {
  if (!outro.active || outroPhase() === 'file') return;
  const side = player.x <= evidence.x ? -1 : 1;
  player.x = evidence.x + side * OUTRO.reach;
  player.facing = -side;
  /* The skip's contract is that everything lands where the script would have
   * left it â€” and the script leaves him holding the ledger, out of his stance. */
  player.anim = 'idle';
  player.frame = 0;
  player.animTime = 0;
  player.vx = 0;
  evidence.t = EV_FALL; evidence.held = true; evidence.lift = 1; evidence.gone = true;
  outro.phase = OUTRO.phases.length - 1;
  outro.t = 0; outro.slammed = true;
  setBars(outro, 1); outro.wash = 1; outro.card = 1;
}

/* Change the pose AND restart its clock.
 *
 * `advancePlayerAnim` keeps one running `animTime` and indexes into whatever
 * spec is current, so assigning `player.anim` on its own enters the new cycle at
 * whatever frame the old one happened to be on â€” a 26-frame idle picked up at
 * frame 19 pops. updatePlayer already does this for live play (`if (next !==
 * player.anim) { frame = 0; animTime = 0; }`); the scripted beats need their own
 * copy of it, and this is that.
 *
 * `stepClock` goes with it: a fresh cycle has crossed nothing yet, so the
 * footfall reader must not compare the new step count against the old one. */
function setOutroPose(name) {
  if (player.anim === name) return;
  player.anim = name;
  player.frame = 0;
  player.animTime = 0;
  player.stepClock = null;
}

function updateOutro(dt) {
  swallowInput();
  mobClock += dt;
  /* Once the sequence owns the frame the fight is over in every sense â€” the
   * outro's own clocks stop so the letterbox and the card cannot keep easing
   * underneath an evidence board that has replaced them. */
  if (aftermath.owningFrame) { aftermath.update(dt); return; }
  outro.t += dt;
  evidence.t += dt;
  const [name, dur] = OUTRO.phases[outro.phase];

  /* HIS POSE FOLLOWS THE LEDGER, and it changes the moment he has it.
   *
   * Up to the pickup he is still the man who just won a fight: guard up, weight
   * forward, combat idle. The instant the ledger is in his hand the fight is
   * over for him too â€” he drops out of the stance into a plain idle and stays
   * there through the lift, the card and the case file.
   *
   * `held`, NOT `gone`. `gone` is 0.4 s later, when the prop has finished rising
   * and faded out â€” hanging the pose off it left him squared up for the whole
   * pickup, which is the half-second the beat exists to sell.
   *
   * ONE POSE DECISION PER FRAME. This used to be an unconditional
   * `setOutroPose(held ? 'idle' : 'combatidle')` here, with the walk beat below
   * overriding it to 'walk'. Both ran every frame, so the pose flipped
   * combatidle→walk→combatidle→walk forever â€” and `setOutroPose` zeroes
   * `frame`, `animTime` and `stepClock` on every change. His walk cycle was
   * therefore reset to frame 0 on all 60 frames a second: he crossed the arena
   * on a single frozen sprite (the glide) and `darkiFootfalls` never saw a step
   * boundary, so his boots were silent too. The rest pose is computed here and
   * only APPLIED where the walk does not own him. */
  const restPose = evidence.held ? 'idle' : 'combatidle';
  /* â€¦and the walk ends on `held` for the same reason. It used to run until
   * `gone`, so on the `grabBy` safety path â€” where the ledger is taken before
   * he has finished crossing â€” he carried on walking with it already in hand. */
  if (name === 'walk' && !evidence.held) {
    const side = player.x <= evidence.x ? -1 : 1;   // approach from the side he is already on
    const mark = evidence.x + side * OUTRO.reach;
    const gap = mark - player.x;
    if (Math.abs(gap) > 5) {
      setOutroPose('walk');
      player.x += Math.sign(gap) * Math.min(Math.abs(gap), OUTRO.walkSpeed * dt);
      /* The footfall gate asks how fast he is TRAVELLING, and this beat moves
       * him by writing x directly â€” so it has to say so, or his boots are
       * silenced by a speed of zero he does not actually have. */
      player.vx = Math.sign(gap) * OUTRO.walkSpeed;
    } else { setOutroPose(restPose); player.vx = 0; }
    player.facing = Math.sign(evidence.x - player.x) || player.facing;
    const arrived = Math.abs(mark - player.x) <= 5;
    // He can only take it once it has actually landed.
    if (!evidence.held && evidence.t >= EV_FALL && (arrived || outro.t >= dur - OUTRO.grabBy)) {
      evidence.held = true;
      /* On the same frame, not the next one: the pose is set above, so without
       * this the pickup frame still draws him mid-stride and the change lands a
       * frame late â€” which at 60 Hz is exactly the frame the glint is on. */
      setOutroPose('idle');
      player.vx = 0;
      triggerHitFx(evidence.x, evidence.y - 30, 0, 0, false);   // a glint, no shake
      spawnEmbers(evidence.x, evidence.y - 24, 10, '#fff4c2', 44);
    }
  } else setOutroPose(restPose);      // 'fall', the card, the file â€” and the walk once he has it
  if (evidence.held && !evidence.gone) {
    evidence.lift = Math.min(1, evidence.lift + dt / OUTRO.liftDur);
    if (evidence.lift >= 1) evidence.gone = true;
  }
  advancePlayerAnim(dt);

  // ---- framing furniture ----
  cameraX = damp(cameraX, BOSS_CAM_X, 3.2, dt);   // the boss room stays locked
  cameraX = Math.max(0, Math.min(WORLD_W - VIEW_W, cameraX));
  cameraY = 0;
  const carded = name === 'card' || name === 'file';
  // The bars come in THIN for the action beats and only close all the way under
  // the card. At full height the bottom bar covers y 628-720 â€” and the ledger
  // lands on the tarmac at ~654, so a full close would hide the one thing these
  // two beats exist to show. Closing on the card doubles as the frame shutting.
  /* 0.90 rather than BAR_DUR: this is the only bar move that is not a scene
   * opening or closing — it is the frame shutting under the mission card, and
   * the card's own slam is what it has to sit behind. The old rate-7 damp took
   * about that long to arrive, so the beat keeps its length. */
  rampBars(outro, carded ? 1 : 0.30, dt, 0.90);
  outro.wash = damp(outro.wash, carded ? 1 : 0, 5, dt);
  outro.card = damp(outro.card, carded ? 1 : 0, 20, dt);

  // ---- next beat ----
  const done = outro.t >= dur || (name === 'walk' && evidence.gone);
  if (!done || outro.phase >= OUTRO.phases.length - 1) {
    /* 'file' HOLDS â€” and while it holds, the post-mission sequence runs its own
     * clock on top of it. THE HAND-OVER LIVES HERE, in the branch the ending
     * settles into, rather than in the phase-advance below: `skipOutro` jumps
     * straight to 'file' without ever advancing a phase, so a hook on the
     * advance would leave a skipped ending with no sequence behind it â€” a card
     * with a prompt on it that answers to nothing. */
    if (name === 'file') { beginAftermath(); aftermath.update(dt); }
    return;
  }
  outro.phase++;
  outro.t = 0;
  if (outroPhase() === 'card' && !outro.slammed) {   // the card SLAMS, like his name plate
    outro.slammed = true;
    triggerFlash('255,255,255', 0.22);
    triggerHitFx(player.x, player.y - 130, 0, 12, true);
  }
}

/* Idempotent: the branch above runs every frame the card is up. */
function beginAftermath() {
  if (aftermath.active) return;
  aftermath.start({
    level: 1,
    stats: {
      kills: levelKills,
      hp: Math.ceil(Math.max(0, player.hp)),
      maxHp: player.maxHp,
      difficulty: chosenDifficulty,
    },
  });
}

/* ------------------------------------------------- the air strike's frames ---
 * Point the air kick at the sheet's own Air Kick section, once, at load.
 *
 * WHY THE TABLE DOES NOT JUST HOLD THE NUMBERS. Every other move's frame list
 * belongs to ATTACKS because every other move plays its sheet start to finish.
 * The strike uses eight frames of a thirty-four frame take — the rest is the
 * rise, the fall and a landing, all cut as their own clips — and that cut lives
 * in darki-jumpkick.json beside them. A second copy in the table is a copy that
 * goes stale the first time the kick is re-timed, and the way it goes stale is
 * silent: the move still plays, just not the frames the artist chose.
 *
 * WHICH SHEET (2026-09-01). The kick came BACK to darki-jumpkick.json — its flat
 * flying side kick was preferred over the purpose-drawn diagonal in
 * darki-jumpstrike.json — so the strike now reads its frames off `jumpSprite`
 * and only its DESCENT (`airKickFall`) still comes off the strike sheet. The
 * indirection is exactly why that was a two-line change: the cut is data.
 *
 * THE HIT WINDOW IS KEYED BY SHEET FRAME, NOT BY STEP. `windows` is indexed by
 * position in the frame list, so writing `{2: …, 3: …}` by hand would bind the
 * hit to "the third thing in the list" — re-cut the section and the window slides
 * onto whatever art happens to land there, which is how a kick ends up
 * connecting during its own wind-up. AIR_KICK_HIT is the frames where his leg is
 * actually out; the positions are looked up.
 */
/* ------------------------------------------------ THE STRIKE IS A DIVE ------
 *
 * Not a jump with a kick played over it. The press turns the arc over and drives
 * him at the deck on a diagonal, foot first, and the whole point is that the
 * descent ACCELERATES: a constant-gravity fall reads as him drifting down after
 * a kick, and the move is supposed to read as him committing his weight to it.
 *
 * Four numbers do the work, in the order they take effect:
 *   `riseCut`   kills most of whatever climb is left, so he turns over on the
 *               press instead of floating on upward with his leg out.
 *   `thrust`    the forward drive. Applied as a floor as well as an add, so a
 *               strike thrown from a standing jump still travels — that case
 *               used to just drop straight down.
 *   `gravityMul`/`gravityRamp` the rocket. Gravity ramps to 2.6x over 0.22s
 *               rather than snapping there, which is the difference between an
 *               accelerating dive and simply falling faster.
 *
 * The tilt is NOT a fifth number — it is read off the velocity he actually has
 * (`atan2`), so the angle of his body is the angle of his travel by
 * construction. A hand-set tilt would be right for exactly one trajectory and
 * wrong for a strike thrown early, thrown late, or thrown from a standstill.
 */
const AIR_STRIKE = {
  /* 0.55, not the 0.30 this started at. Killing 70% of his climb made the move
   * unusable pressed EARLY — which is when a player actually presses it, on the
   * way up at the man in front of them. He kept almost no height, so the whole
   * dive was over in 0.33 s, the kick clip had not finished playing, and the
   * recovery never got a frame on screen. Turning the arc over is the intent;
   * deleting it is not. */
  riseCut: 0.55,
  thrust: 215,          // px/s of forward drive added…
  minSpeed: 300,        // …and the floor it is never below
  gravityMul: 2.6,      // terminal gravity multiplier for the dive
  gravityRamp: 0.22,    // seconds to reach it
  tiltMax: 0.48,        // ~27.5 degrees. Past this his shoulder leads and it
                        // stops reading as a kick and starts reading as a fall.
  /* Fast enough to KEEP UP. `vy` doubles in a fifth of a second under the ramp,
   * so a lazy damp is not "a graceful lag", it is his body pointing at an angle
   * he was travelling at two frames ago — measured at 17 degrees adrift at rate
   * 9. Still damped rather than snapped: instant tracking reads mechanical. */
  tiltRate: 28,
  /* …and OUT faster than in. He is on the deck: a 20-degree lean easing off
   * over a quarter of a second under a landing crouch looks like he is falling
   * over, not like he has landed. */
  tiltOut: 26,
  pivot: 0.55,          // rotate about mid-body, not his feet: pivoting at the
                        // ground swings his head through a huge arc
};

/* ------------------------------------------------------ THE RUNNING LEAP ---
 *
 * Jump out of a rush, and strike out of that. Both kinds of rush allow it, on
 * exactly the precedent the dash kick set: a follow-up that needs no mark
 * belongs to the sprint and the charge alike.
 *
 * WHY THIS NEEDED PHYSICS RATHER THAN A FLAG. The run does not use `vx` at all —
 * `updateRushFree` and `updateRushCharge` drive `player.x` directly at
 * RUSH.speed and `advanceRushStride` borrows `vx` for the footfall gate and puts
 * it straight back to zero. So a jump taken out of a sprint would have left the
 * ground carrying NOTHING: 1000 px/s of run, and the moment his feet came up he
 * would have travelled the same 111px an idle hop does. The leap has to convert
 * the run into real momentum, once, on the take-off frame.
 *
 * `carry` 0.72 is that conversion. Not all of it, because the take-off spends
 * some of the run turning it upward — a sprinter plants and rotates, and a leap
 * that kept 100% would read as him being fired out of a cannon rather than
 * jumping. 720 px/s over the arc's 0.78s is a ~560px leap, which is the reach
 * this is for and still lands well inside the view.
 *
 * VERTICAL IS UNCHANGED, deliberately: `PLAYER.jumpVel`, the same as a standing
 * jump. The leg does the same work whether or not he was running, and the arc
 * being familiar is what makes the distance readable — a leap that also floated
 * higher would be a different move to learn rather than the jump he already
 * knows, thrown further.
 *
 * TWO SYSTEMS HAD TO BE TOLD, and neither would have been obvious from a shot:
 * the walking clamp (PLAYER.maxSpeed, 340) would have confiscated the carry on
 * the very next frame, because a sprint is a HOLD and that direction is still
 * down; and ground friction would have scrubbed it at 2200 px/s². See `leapCap`
 * and `airCommitted` in updatePlayer.
 */
const RUSH_LEAP = {
  carry: 0.72,          // fraction of RUSH.speed converted to real horizontal vx
  landDust: 12,         // puffs thrown on the arrival — he lands at speed
  landDustSpeed: 150,
};

/* True exactly while the dive owns his physics: from the press to touchdown.
 * `airAttackDone` already means "he has committed the air strike this jump". */
const airDiving = () => !player.grounded && player.airAttackDone
  && player.state === 'normal' && !player.react;

/* True while a running leap owns his horizontal physics. Both exemptions below
 * read this, so they can never disagree about whether he is mid-leap. */
const airLeaping = () => !player.grounded && player.leaping
  && player.state === 'normal' && !player.react;

/* WHICH CLIP A MAN IN THE AIR BELONGS IN. Two callers — the animation chain in
 * `updatePlayer` and `endAttack` — and they must agree, which is why this is one
 * function rather than the same ternary written twice. `vy` crosses zero exactly
 * at the apex and `airAttackDone` means "he threw the strike this jump", so no
 * timer or extra flag is involved. */
const airbornePose = () => (player.vy < 0 ? 'jumpRise'
  : (player.airAttackDone ? 'airKickFall' : 'jumpFall'));

/* Gravity, right now. 1 for an ordinary jump — the plain arc is untouched. */
function diveGravityMul() {
  if (!airDiving()) return 1;
  const k = Math.min(1, player.diveT / AIR_STRIKE.gravityRamp);
  return 1 + (AIR_STRIKE.gravityMul - 1) * k;
}

/* THE TILT THE RENDERER WILL ACTUALLY APPLY, which is not the same thing as the
 * value the player is carrying.
 *
 * Gated on the POSE. `diveTilt` is maintained by `updatePlayer` and nothing else,
 * so any scene that poses Darki itself — the boss entrance, the ending — leaves
 * it frozen at whatever it held when the scene opened. Ungated, a stale 24
 * degrees then rotates whatever he does next, which is the bug that had him
 * leaning forward in mid-air through MC_Olodo's speech. `parkPlayerForScene`
 * zeroes it at both those doors; this makes a leak HARMLESS wherever the next one
 * appears, because the rotation can only ever bend the two poses it was drawn
 * for. One function so the draw and the test cannot disagree about it. */
const drawnTilt = () =>
  (player.anim === 'airKick' || player.anim === 'airKickFall') ? player.diveTilt : 0;

/* Turn the jump into the dive. Called on the press, beside startAttack. */
function beginAirDive() {
  const dir = player.facing >= 0 ? 1 : -1;
  player.vx = dir * Math.max(Math.abs(player.vx) + AIR_STRIKE.thrust, AIR_STRIKE.minSpeed);
  if (player.vy < 0) player.vy *= AIR_STRIKE.riseCut;
  player.diveT = 0;
}

/* jumpkick frames with the leg fully out — measured, ink reaching x=865..845
 * on a flat foot line. Sheet numbers, not list positions; see the note above. */
const AIR_KICK_HIT = [8, 9, 10];
function bindJumpKickAnims() {
  const clip = jumpSprite?.anims?.airKick;
  if (!clip?.frames?.length) {
    console.warn('[ratel] darki-jumpkick.json has no "Air Kick" section — '
      + 'the air strike is running on the fallback frames in ATTACKS.');
    return;
  }
  const move = ATTACKS.airKick;
  move.frames = clip.frames.slice();
  move.fps = clip.fps || move.fps;
  move.windows = Object.fromEntries(
    move.frames
      .map((f, step) => [f, step])
      .filter(([f]) => AIR_KICK_HIT.includes(f))
      .map(([, step]) => [step, {
        group: 'ak', swing: 'kick',
        /* Measured off his feet, and it reaches DOWN as well as forward: he
         * arrives above the man he is kicking, so a box hung at head height like
         * the standing high kick's would pass over anybody still on the deck. */
        box: { x: 10, w: 148, top: -196, h: 176 },
        /* THE HEAVIEST SINGLE BLOW IN THE GAME, and it should be. It costs the
         * whole jump, it cannot be steered out of, it is one hit per airborne
         * action, and it is thrown with his entire weight coming down a ramp —
         * every other move is thrown from a plant and can be thrown again. 26
         * against the uppercut's 20 and the combo finisher's 18.
         *
         * IT KNOCKS THEM DOWN. `launch` was false here on the argument that two
         * bodies in the air at once has nothing to follow up on; that was the
         * wrong read of a dive. He arrives travelling downward, so the man he
         * lands on goes over — and the launch chain IS the knockdown (hitLift ->
         * hitAir -> fall -> get up), so this is what puts him on the deck.
         *
         * The freeze is the loudest in the game too: 0.20 s against the combo
         * finisher's 0.14 and a jab's 0.06. It is a full twelve frames of dead
         * air on contact, which is the whole point — the impact should register
         * as an event that stopped the street, not as another hit landing. */
        damage: 26, kb: { x: 320, y: -300 },
        launch: true, hitstop: 0.20, shake: 17, rage: 14, big: true,
      }]),
  );
}

/* ------------------------------------------------- parking him for a scene ---
 *
 * PUT HIS FEET ON THE GROUND AND TAKE EVERY TRANSIENT WITH THEM.
 *
 * A cutscene stops calling `updatePlayer` — it poses him itself. Everything
 * `updatePlayer` is the only owner of therefore STOPS BEING MAINTAINED for the
 * length of the scene: gravity, the touchdown edge, the landing timer, the
 * dive's gravity ramp and the dive's TILT. Whatever value each of those held on
 * the frame the scene opened is the value it still holds when it closes.
 *
 * That is not theoretical. Jumping into MC_Olodo's entrance left Darki hovering
 * 128 px off the deck for the whole of it, and if the jump had an air strike in
 * it his body stayed tipped 24 degrees into a dive that had stopped happening —
 * so the man standing through the boss's speech was leaning forward in mid-air.
 *
 * `startOutro` already did this correctly and `startBossIntro` never did, which
 * is exactly the kind of thing two copies of a park produce. There is one now,
 * and both call it.
 */
function parkPlayerForScene() {
  if (player.attack) endAttack();
  releaseGrab({ drop: true });
  endRush();
  endRushLeap();                 // …and the speed trail, whichever of the two owns it
  player.vx = 0; player.vy = 0; player.jumpY = 0;
  player.grounded = true;
  player.bufferedAttack = null;
  player.airAttackDone = false;  // or the next jump gets no air strike
  player.landT = 0;              // …and no landing crouch surfacing after the scene
  player.diveT = 0; player.diveTilt = 0;
}

/* ------------------------------------------------------------ touchdown ---
 * Called once, on the frame his feet come back to the deck.
 *
 * ONE LANDING FOR BOTH ARRIVALS, which is the whole point: the clip does not
 * ask whether he threw the kick. An air strike and a plain hop end the same way
 * — the same body, the same weight, the same deck — and giving the kick its own
 * recovery would have meant a second clip that has to be kept in step with this
 * one for no gain the player could ever see.
 *
 * The duration is READ OFF THE CLIP rather than written down here. `landT` and
 * the animation would otherwise be two numbers describing one beat, and the
 * first re-cut of the Land section in darki-jumpkick.json would leave him either
 * standing in a finished landing pose or snapped out of an unfinished one.
 */
function onTouchdown() {
  /* THE LEAP ENDS HERE, and this sits above every early return below it: a leap
   * that arrived inside a hurt reaction still has to give back the friction and
   * clamp exemptions, or he keeps them for the rest of the level.
   *
   * The echoes stop with the run, exactly as they do on the ground — but the
   * DECK ANSWERS, because unlike an ordinary landing this one arrives carrying
   * 700-odd px/s. Dust is thrown after the clear (which would have retired it)
   * and against his travel, the same rule his footfalls use. */
  if (player.leaping) {
    const dir = player.leapDir || player.facing || 1;
    endRushLeap();
    spawnRushDust(RUSH_LEAP.landDust, RUSH_LEAP.landDustSpeed, dir);
  }
  /* THE KICK IS CUT ON ARRIVAL, not played out on the ground. The air kick's
   * last frames are a mid-air retract, and letting them finish standing on the
   * tarmac reads as him kicking at nothing after he has landed. `endAttack`
   * before `landT` is set, so the landing is what the anim branch finds. */
  if (player.attack === 'airKick') endAttack();
  /* The dive ends where it was always going to end. `diveTilt` is left to damp
   * out over the landing rather than snapped to zero — cutting a 27-degree tilt
   * to nothing on one frame is a pop, and the landing crouch reads well coming
   * out of a slight lean. */
  player.diveT = 0;
  /* A landing belongs to a JUMP. Reactions drive `jumpY` themselves (a launch, a
   * bounce, a knockdown) and come down through this same line, and those have
   * their own arrivals already animated — see the fall/getup tables. */
  if (player.react || player.state !== 'normal') return;
  const land = jumpSprite?.anims?.land;
  player.landT = land ? land.frames.length / (land.fps || 30) : 0.23;
}

const FIGHT_RANGE_X = 240;      // Darki squares up into combat stance within this gap
function enemyInFightRange() {
  for (const e of enemies) {
    if (e.state === 'ko') continue;
    if (Math.abs(e.x - player.x) < FIGHT_RANGE_X && Math.abs(e.y - player.y) < 92) return true;
  }
  return false;
}

// Closest live enemy by horizontal distance (used for idle facing).
function nearestEnemy() {
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (e.state === 'ko') continue;
    const d = Math.abs(e.x - player.x);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// Which anim spec drives a given player anim (combat sheets reuse the walk
// cycle; hurt/ko reuse the idle pose).
function playerAnimSpec(spr, anim) {
  if (anim === 'combatwalk' || anim === 'combatidle') return spr.anims.walk;
  if (anim === 'hurt' || anim === 'ko') return spr.anims.idle;
  return spr.anims[anim] ?? spr.anims.walk;
}

/* Carry a sprint's momentum into the swing that came out of it.
 *
 * This is the whole difference between the dash attack and the standing kick
 * that shares its sheet: one is thrown from a plant, the other arrives with his
 * weight already moving. Doing it as travel rather than as a different
 * animation is the same call the throw made â€” distance is physics, so a kick
 * launched from further out covers the gap instead of playing a longer clip.
 *
 * Applied BEFORE `resolveAttackHits` in the same frame, so the hit box (which is
 * placed relative to `player.x`) is scanned where the lunge has just put him
 * rather than a frame behind it. Decays linearly to nothing across `until`, so
 * he plants into the blow instead of sliding through it, and it is clamped like
 * any other movement â€” a dash attack cannot post him through a wall.
 */
function advanceAttackLunge(move, step, dt) {
  const L = move.lunge;
  if (step >= L.until) return;
  const dir = player.facing >= 0 ? 1 : -1;
  player.x += dir * L.speed * (1 - step / L.until) * dt;
  clampPlayerToArena();
}

// Attacks drive their frames straight from the ATTACKS table (curated, so the
// jab reads as two crisp hits) rather than the sheet's default range. Rage
// speeds the swing up. When the frame list runs out the move settles to idle.
function advanceAttack(dt) {
  const move = ATTACKS[player.attack];
  if (move.manual) { advanceManualCombo(move, dt); return; }   // section-driven
  const rate = move.fps * (player.rageActive ? 1.25 : 1);
  const prevStep = player.attackStep;
  player.animTime += dt * rate;
  const step = Math.floor(player.animTime);
  // The pickup does not END when its frames do â€” if it is holding someone it
  // hands over to the carry STANCE, which is not an attack at all. Checked
  // before endAttack, whose whole job is to make sure no move ever finishes
  // still holding a body.
  if (step >= move.frames.length && move.carry && finishCarryPickup()) return;
  if (step >= move.frames.length) { endAttack(); return; }
  // A move that misses by definition (the grab whiff) names the frame its reach
  // is out, since it has no hit window to resolve. Crossing-based like every
  // other cue, so a long frame cannot skip it and a fast one cannot double it.
  if (move.whiffStep != null && prevStep < move.whiffStep && step >= move.whiffStep)
    playWhiff(false, true, player.x + player.facing * 70);
  player.attackStep = step;
  player.frame = move.frames[step];
  if (move.lunge) advanceAttackLunge(move, step, dt);  // â€¦before the hit scan
  if (move.grab) updateGrab(move, step);              // latch / seat / strike
  else if (move.grabFinish) updateGrabUppercut(move, step);   // the launch
  else if (move.carry) updateCarryPickup(move, step);          // reach / latch / lift
  else if (move.carryThrow) updateCarryThrow(move, step);      // the release
  resolveAttackHits();
  // AFTER the scan, so a window that connects on its own first frame is already
  // in the ledger when it is opened and can never be called a miss. The grab is
  // exempt: its strikes land on a man who is held, so there is nothing to miss.
  if (!move.grab && !move.grabFinish) openAttackWindow(move.windows[step]);
}

function endAttack() {
  closeAttackWindow();           // the last window resolves before the ledger goes
  releaseGrab({ drop: true });   // safety net: never end a move still holding someone
  dropCarry({ drop: true });     // â€¦and the same net for the other kind of hold
  grabState = GRAB_STATE.NONE;
  carryState = CARRY_STATE.NONE;
  player.carrying = false;
  player.mcArmed = null; player.mcSection = null; player.mcEnding = false;
  player.mcRepeat = 0; player.mcLaps = 0;
  player.attack = null;
  player.attackHits = null;
  player.attackStep = 0;
  /* A MOVE THAT ENDS IN MID-AIR MUST NOT DROP HIM INTO A STANDING POSE.
   *
   * The air kick's clip finishes before his feet arrive, and the animation chain
   * in `updatePlayer` is an if/else: `advanceAttack` has already claimed this
   * frame, so the airborne branch does not get to correct the pose until the
   * next one. Hardcoding 'idle' therefore put ONE FRAME of Darki standing
   * bolt-upright in the sky in the middle of every air strike — and, because the
   * dive tilt is pose-gated on airKick/airKickFall, one frame of him snapping
   * from a 24-degree declination to level and back. Measured on a plain standing
   * strike (`idle:0@-54 tilt0` between `airKick:18 tilt0.426` and
   * `airKickFall:34 tilt0.459`), so it long predates the running leap — the leap
   * only made it obvious, by throwing it at 935 px/s.
   *
   * The frame comes off the clip rather than being zeroed: `player.frame` is a
   * SHEET index, and 0 on the jump sheet is his deep launch crouch. */
  const air = !player.grounded && player.state === 'normal' && !player.react;
  const pose = air ? airbornePose() : 'idle';
  player.anim = pose;
  player.frame = air
    ? (playerAnimSpec(spriteFor(pose), pose).frames[0] ?? 0)
    : idleSprite.anims.idle.frames[0];
  player.animTime = 0;
}

/* ----------------------------------------------------------------- camera */
// Frame-rate-independent critically-damped approach (no overshoot): each call
// moves `cur` a fraction 1-e^(-lambdaÂ·dt) of the way to `target`.
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

/* --------------------------------------------------- THE LETTERBOX RAMP ----
 *
 * Every cinematic bar in this game — the level entry's gate, the boss
 * entrance's bars, the outro's — used to be a `damp` toward 0 or 1. That is an
 * exponential approach, and it has exactly one shape: it leaves at FULL SPEED
 * and creeps into the target. So a bar had no ease-in at either end. It jumped
 * off the mark, ran most of its distance at a near-constant rate, and then
 * spent a long tail arriving — which reads as a linear slide with a soft stop
 * glued on, in both directions.
 *
 * This replaces the approach with a RAMP: `barU` walks 0 -> 1 at a constant
 * rate over `dur` seconds, and the bar's position is read off an eased curve of
 * it. The ease is symmetric (smoothstep), so the bars now accelerate away and
 * decelerate in, closing AND opening.
 *
 * INFLUENCE, not a swap. `BAR_EASE` is how much of the smoothstep is mixed over
 * the straight ramp: 0 is the raw linear slide, 1 is the full ease-in-ease-out.
 * At the requested 0.73 the curve keeps most of the smoothstep's shape while
 * holding a little of the ramp's constant middle, so the move still has travel
 * in it rather than hanging at both ends.
 *
 * The ramp also has one property the damp never did: it ARRIVES. An exponential
 * only converges, so `letterbox` was never exactly 0 and the bars were still a
 * fraction of a pixel deep on the frame control came back. */
const BAR_EASE = 0.73;
/* Matched to what the old damp actually did rather than picked fresh: at rate 9
 * the bars were within 0.2% of their target in 0.75 s, and LEVEL_ENTRY.barsOut
 * (0.75) is built on that. 0.70 lands them fully open with 0.05 s to spare. */
const BAR_DUR = 0.70;

const easeBars = (u) => {
  const t = Math.max(0, Math.min(1, u));
  const s = t * t * (3 - 2 * t);
  return t + (s - t) * BAR_EASE;
};

/* Step one scene's bars toward `target`. Retargeting mid-move restarts the ease
 * FROM WHERE THE BARS ARE — that is what makes an interrupted close (the player
 * skipping a cutscene) ease back out instead of snapping. */
function rampBars(s, target, dt, dur = BAR_DUR) {
  if (s.barTo !== target) { s.barFrom = s.letterbox; s.barTo = target; s.barU = 0; }
  s.barU = Math.min(1, (s.barU ?? 1) + dt / Math.max(0.0001, dur));
  s.letterbox = s.barFrom + (target - s.barFrom) * easeBars(s.barU);
  return s.letterbox;
}

/* Put a scene's bars AT a depth with no move in flight. Every place that used
 * to assign `letterbox` directly goes through this, or the next `rampBars` call
 * would see its own stale `barTo`, believe it had already arrived, and hold the
 * bars at the value it was reset away from. */
function setBars(s, v) { s.letterbox = v; s.barFrom = v; s.barTo = v; s.barU = 1; }

// Cinematic side-scroll follow camera (SoR4 / TMNT: Shredder's Revenge feel):
//   * leads ~38% from the edge in the travel direction (bias eases on turns);
//   * predictive look-ahead grows with speed, softened near enemies, eases back
//     to neutral on stop;
//   * a soft dead zone ignores walking bob / micro-steps (no jitter);
//   * critically-damped smoothing â†’ heavy, glassy glide, never snaps;
//   * clamped to the level, staying smooth even against the walls.
// Vertical follow is wired but inert while WORLD_H == VIEW_H (single-screen
// level); it activates for taller arenas (significant lane changes only).
function updateCamera(dt) {
  // Boss room: the follow camera hands over to a locked shot (see BOSS_CAM_X).
  if (waveState === 'boss') {
    cameraX = damp(cameraX, BOSS_CAM_X, tune.camFollow, dt);
    cameraY = damp(cameraY, 0, 3, dt);
    return;
  }
  const maxSpd = PLAYER.maxSpeed * (player.rageActive ? RAGE_SPEED_MUL : 1);
  /* THE RUSH COUNTS AS MOVING. `advanceRushStride` borrows `player.vx` for the
   * footfall gate and puts it straight back to 0, so as far as this read was
   * concerned the fastest movement in the game was standing still: the camera
   * gave no lead at all through a 1000 px/s sprint and simply chased him. This
   * is the "subtle directional emphasis" the brief asks for, and it costs one
   * term — the framing bias below already knows what to do with a direction. */
  const rushDir = rushFx.active ? rushFx.dir : 0;
  const moving = Math.abs(player.vx) > 12 || rushDir !== 0;
  const moveDir = rushDir || (Math.abs(player.vx) > 12 ? Math.sign(player.vx) : 0);

  // combat framing: soften the lead and keep the nearest foe in shot
  const foe = nearestEnemy();
  const combat = !!foe && Math.abs(foe.x - player.x) < 360 && Math.abs(foe.y - player.y) < 140;

  // framing bias â€” lead-space in the travel direction; hold it when idle so the
  // camera doesn't drift/recenter the instant Darki stops.
  const desiredBias = moveDir > 0 ? tune.camFrame
    : moveDir < 0 ? 1 - tune.camFrame : camBias;
  camBias = damp(camBias, desiredBias, 4, dt);

  // predictive look-ahead â€” proportional to speed (eases in AND out with vx),
  // gently reduced when squared up so the enemy stays comfortably framed.
  const lookTarget = (player.vx / (maxSpd || 1)) * tune.camLookAhead * (combat ? 0.55 : 1);
  camLook = damp(camLook, lookTarget, tune.camLookSmooth, dt);

  // focus point we frame; in combat nudge it toward the playerâ†”enemy midpoint.
  let focusX = player.x + camLook;
  if (combat) focusX = focusX * 0.7 + ((player.x + foe.x) / 2) * 0.3;

  // soft dead zone: ignore errors within camDeadX, then glide to the zone edge.
  const idealX = focusX - VIEW_W * camBias;
  const errX = idealX - cameraX;
  const targetX = Math.abs(errX) <= tune.camDeadX
    ? cameraX
    : idealX - Math.sign(errX) * tune.camDeadX;
  cameraX = damp(cameraX, targetX, tune.camFollow, dt);
  // clamp to the level; while a wave holds, the right edge stops at the gate.
  const rightBound = waveState === 'fighting' ? currentGate() : WORLD_W;
  cameraX = Math.max(0, Math.min(rightBound - VIEW_W, cameraX));

  // vertical: only react to significant lane changes, slower than horizontal,
  // then clamp to the level's vertical room (0 while single-screen-tall).
  const midY = (LANE_TOP + LANE_BOTTOM) / 2;
  const dY = player.y - midY;
  const focusY = Math.abs(dY) > tune.camDeadY ? dY - Math.sign(dY) * tune.camDeadY : 0;
  cameraY = damp(cameraY, focusY, 3, dt);
  cameraY = Math.max(0, Math.min(Math.max(0, WORLD_H - VIEW_H), cameraY));
}

function update(dt) {
  advanceFx(dt);                            // sparks/shake run even while frozen
  if (hitStopTimer > 0) { hitStopTimer -= dt; return; } // hit stop: freeze the sim
  if (levelEntry.active) { updateLevelEntry(dt); return; }
  launchesThisFrame = 0;                    // the fall queue is per-frame (FALL_VARY.stagger)
  // The execution is one more timer inside the ordinary update, deliberately not
  // a cutscene takeover: the rest of the mob keeps moving, the camera keeps
  // following and the HUD keeps drawing, which is what stops it feeling like a
  // detached movie. The player is held still by his own state, not by a freeze.
  // Queued by a completed combo (see hitEnemy) and started here, outside the
  // hit-resolution loop it was raised in.
  if (player.pendingExec) {
    const mark = player.pendingExec;
    player.pendingExec = null;
    startExecution(mark, EXECUTIONS.darki_olodo, { fromCombo: true });
  }
  if (execution) updateExecution(dt);
  // The result plate outlives the sequence, so its clock cannot live on the
  // execution object. Decays here, and the impulse with it â€” an execution that
  // ends mid-shove would otherwise leave the frame pushed over.
  if (execResultT > 0) execResultT = Math.max(0, execResultT - dt);
  if (!execution && execImpulseT > 0) execImpulseT = Math.max(0, execImpulseT - dt);
  if (!execution && execVignette > 0) execVignette = Math.max(0, execVignette - dt * 3);
  updateExecPrompt();                       // â€¦and whether to invite one
  fightBanner = Math.max(0, fightBanner - dt);
  // MC_Olodo's entrance owns the frame: no input, no AI, its own camera.
  if (cutscene.active) { updateCutscene(dt); return; }
  // â€¦and his outro owns it for good once he is down.
  if (outro.active) { updateOutro(dt); return; }

  // ---- combat timers ----
  player.invuln = Math.max(0, player.invuln - dt);
  player.hpFlash = Math.max(0, player.hpFlash - dt);
  if (player.rageActive) {
    player.rageTimer -= dt;
    player.rage = RAGE_MAX * Math.max(0, player.rageTimer / RAGE_DUR);
    spawnEmbers(player.x, player.y - 30, 1, '#ffcf5a', 46);   // trailing aura
    if (player.rageTimer <= 0) { player.rageActive = false; player.rage = 0; }
  }
  player.hpShown += (player.hp - player.hpShown) * Math.min(1, dt * 8);

  if (player.state === 'hurt' || player.state === 'ko') {
    player.hurtTimer -= dt;
    if (player.hurtTimer <= 0) {
      if (player.state === 'ko') {          // second wind â€” back up at full HP
        player.hp = player.maxHp; player.hpShown = player.maxHp; player.invuln = 1.2;
      }
      player.state = 'normal';
    }
  }

  // hurt/ko: no control. A reaction counts on its own, not just the state it
  // came in on â€” the two run out within a frame of each other, and taking
  // control back on the earlier of them would let Darki walk mid-fall.
  const locked = player.state !== 'normal' || !!player.react;
  // The guard is raised/held/dropped before attack input is read, so holding it
  // can SUPPRESS that input in the same frame it goes up.
  updateBlock(dt);
  // Read the forward-forward taps every frame regardless of what he is doing:
  // the detector needs an unbroken view of the direction keys to tell a fresh
  // press from a held one, and skipping frames would let a hold read as a tap
  // the moment control came back. `tryStartRush` is what decides legality.
  updateRushInput();
  // â€¦and the gauge refills on every frame he is not spending it. Ticked before
  // the input read, so a dash pressed this frame is judged against this frame's
  // stamina rather than last frame's.
  updateRushStamina(dt);
  // Hands up means hands up: while the guard is held he throws nothing. Attacks
  // are swallowed rather than buffered, so releasing the button does not fire
  // whatever you mashed while turtling.
  if (!locked && !playerBlocking()) consumeAttackInput(dt);
  else {
    input.leftJabPressed = input.kickPressed = input.comboPressed = input.upperPressed = false;
    input.grabPressed = false;
    player.bufferedAttack = null;
  }
  const attacking = !!player.attack;
  // â€¦and planted feet: he holds ground behind the guard and is moved only by
  // what he blocks (updateBlockGlide), never by the stick.
  // The charge drives his position itself (see updateRushCharge), so the stick
  // is locked out for it or the two would fight over `player.x`. The WINDOW is
  // locked too, deliberately: the brief asks him to hold a combat-ready pose
  // facing the enemy until the player chooses, and it lasts 0.9 s â€” any
  // direction press ends it through consumeAttackInput rather than trapping him.
  const rushing = rushState !== RUSH_STATE.NONE;
  const canMove = !attacking && !locked && !player.blocking && !rushing;

  // Carrying a grown man costs him pace. It is a multiplier on the same number
  // rage scales, so an enraged carry is still faster than a calm one.
  const speedMul = (player.rageActive ? RAGE_SPEED_MUL : 1) * (player.carrying ? CARRY.moveMul : 1);
  const dir = canMove ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
  const depthDir = canMove ? (input.down ? 1 : 0) - (input.up ? 1 : 0) : 0;
  if (dir !== 0) {
    /* THE CLAMP MUST NOT CONFISCATE A LEAP. Read the cap BEFORE the acceleration
     * is added, because mid-leap it IS his current speed: a running jump leaves
     * the ground at 720 px/s and the walking maximum is 340, so the ordinary
     * clamp would have taken 380 px/s off him on the frame after take-off and
     * every frame after that. It is not a hypothetical — a sprint is a HOLD, so
     * the direction that started the run is still down while he is in the air,
     * which is exactly the case that reaches this branch.
     *
     * Capping at `max(walk, current)` rather than lifting the limit outright
     * means air control can still STEER him and can still slow him by holding
     * back, but cannot accelerate him past what the take-off bought. */
    const walkMax = PLAYER.maxSpeed * speedMul;
    const max = airLeaping() ? Math.max(walkMax, Math.abs(player.vx)) : walkMax;
    player.vx += dir * PLAYER.accel * dt;
    player.vx = Math.max(-max, Math.min(max, player.vx));
    player.facing = dir;
  } else {
    /* FRICTION IS THE GROUND'S, and there is no ground under an air move.
     *
     * The air kick is committed, so `canMove` is false and `dir` is forced to 0
     * — which drops straight into this branch and scrubs his speed with the same
     * 2200 px/s² the tarmac uses. Over the kick's 0.31 s that is 680 px/s
     * against a top speed of 340: he would stop dead horizontally on the frame
     * he threw it and fall out of his own arc, which is exactly the stall
     * `startAttack` was already told not to cause by zeroing `vx`.
     *
     * Only the committed air move is exempt. An ordinary jump with no direction
     * held still bleeds off the way it always has.
     *
     * A RUNNING LEAP IS EXEMPT TOO, for the same reason and a second one: the
     * carry is the whole move, and letting go of the key in mid-air should not
     * delete it. 2200 px/s² would strip a 720 px/s leap in a third of a second —
     * he would set off like a sprinter and land like a man who tripped. */
    const airCommitted = !player.grounded
      && ((player.attack && ATTACKS[player.attack]?.air) || airLeaping());
    if (player.vx !== 0 && !airCommitted) {
      const drop = PLAYER.friction * dt;
      player.vx = Math.abs(player.vx) <= drop ? 0 : player.vx - Math.sign(player.vx) * drop;
    }
    // Not steering left/right: square up to the nearest enemy (idle facing).
    if (canMove) {
      const foe = nearestEnemy();
      if (foe) player.facing = Math.sign(foe.x - player.x) || player.facing;
    }
  }
  // Behind the guard he can still TURN, he just cannot travel â€” and if he is
  // not being steered he squares up to the nearest enemy, exactly as he does
  // when idle.
  //
  // That auto-squaring is not a convenience, it is the fix for a guard that
  // looked broken. The guard only covers his front (blockCovers), and holding
  // it froze his facing at whatever it happened to be when the button went
  // down; an enemy that walked around him then hit an open back and the block
  // did nothing, with no cue as to why. Squaring up means the man you can see
  // is the man you are covering. A SECOND attacker behind you still gets
  // through â€” nearest wins â€” so flankers keep their teeth.
  if (player.blocking) {
    const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (turn !== 0) player.facing = turn;              // manual aim still wins
    else {
      const foe = nearestEnemy();
      if (foe) player.facing = Math.sign(foe.x - player.x) || player.facing;
    }
  }

  player.coyote = player.grounded ? PLAYER.coyoteTime : Math.max(0, player.coyote - dt);
  player.buffer = input.jumpPressed ? PLAYER.jumpBuffer : Math.max(0, player.buffer - dt);
  input.jumpPressed = false;

  /* THE RUNNING LEAP, checked before the ordinary jump because `canMove` is
   * false during a rush and the gate below would never see the press.
   *
   * CHARGE and FREE only — the same two states the dash kick belongs to. The
   * WINDOW is excluded on purpose: he has already stopped there, so there is no
   * momentum to carry and it would just be a standing jump that also threw away
   * the combat window the arrival exists to offer. */
  if ((rushState === RUSH_STATE.CHARGE || rushState === RUSH_STATE.FREE)
      && !player.carrying && !player.react && player.state === 'normal'
      && player.buffer > 0 && player.coyote > 0) {
    beginRushLeap();
  }
  // â€¦and it costs him the jump outright: the carry seat is measured off his feet
  // on the ground, and there is no art of him airborne with a man overhead.
  else if (canMove && !player.carrying && player.buffer > 0 && player.coyote > 0) {
    player.vy = -PLAYER.jumpVel;
    player.grounded = false;
    player.coyote = 0;
    player.buffer = 0;
  }
  if (!player.grounded && !input.jumpHeld && player.vy < -240) player.vy = -240; // jump cut

  /* The air strike's dive rides on the SAME gravity the jump uses, multiplied.
   * Doing it here rather than as a separate downward push keeps one integrator
   * for his vertical motion, so the touchdown edge, the apex test that picks the
   * fall clip, and the arc itself all stay in agreement. */
  if (airDiving()) player.diveT += dt;
  player.vy += PLAYER.gravity * diveGravityMul() * dt;
  /* His body follows his trajectory. `atan2` of the velocity he actually has,
   * so the angle of declination is the angle he is really travelling at rather
   * than a number chosen for one imagined trajectory. Damped, or it snaps on the
   * frame he presses; clamped, or a near-vertical drop lays him flat. */
  const wantTilt = airDiving() && player.vy > 0
    ? Math.min(AIR_STRIKE.tiltMax, Math.atan2(player.vy, Math.max(120, Math.abs(player.vx))))
    : 0;
  player.diveTilt = damp(player.diveTilt, wantTilt,
    wantTilt > player.diveTilt ? AIR_STRIKE.tiltRate : AIR_STRIKE.tiltOut, dt);
  player.x += player.vx * dt;
  player.depthV = depthDir * PLAYER.depthSpeed;
  player.y += player.depthV * dt;
  player.jumpY += player.vy * dt;
  /* THE SPEED TRAIL CROSSES THE TAKE-OFF. Laid here rather than in
   * `advanceRushStride` because that runs only while a rush owns him and the
   * leap has, by definition, already ended one. Same distance rule, so the
   * spacing does not change when his feet leave the deck — which is the point:
   * the trail is a record of ground covered, and he is covering more of it now
   * than he was a frame ago. Placed AFTER the integration so the echo captures
   * where he actually is on this frame, matching the ground trail's ordering. */
  if (airLeaping()) rushFxTrail(player.leapDir || player.facing, { airborne: true });
  updateBlockGlide(dt);          // â€¦and the slide from anything he just blocked

  // wave gate: an unbeaten wall holds Darki inside the arena; once the wave is
  // cleared the wall lifts and crossing the gate line advances to the next one.
  // In the boss room the wall is BEHIND him â€” there is no walking away from
  // MC_Olodo until he is down. (The walls themselves live in clampPlayerToArena,
  // which a launch has to re-apply after it drives him; only the advance is
  // here, because it is a state change rather than a clamp.)
  clampPlayerToArena();
  if (waveState === 'cleared' && player.x >= currentGate()) advanceSection();

  if (player.jumpY >= 0) {
    /* THE TOUCHDOWN EDGE. `player.grounded` still holds LAST frame's answer at
     * this point, so this fires once per arrival rather than every frame he
     * stands still. */
    if (!player.grounded) onTouchdown();
    player.jumpY = 0;
    player.vy = 0;
    player.grounded = true;
    player.airAttackDone = false;    // touchdown re-arms the air attack
  } else {
    player.grounded = false;
  }

  // ---- player animation ----
  // A hurt reaction outranks a swing: it already cancelled the attack when it
  // started, and it owns the sheet, the frame and how far off the ground he is.
  if (player.landT > 0) player.landT = Math.max(0, player.landT - dt);
  /* `player.attack` rather than the `attacking` snapshot taken above it: the
   * touchdown that just ran can END a move (the air kick is cut the instant his
   * feet arrive), and advanceAttack would then be called with nothing to
   * advance. Identical in every other case — nothing between the two lines
   * starts a move. */
  if (player.react) {
    advanceReaction(dt);
  } else if (player.attack) {
    advanceAttack(dt);
  } else if (rushState === RUSH_STATE.CHARGE) {
    updateRushCharge(dt);            // owns his frame, his facing and his feet
  } else if (rushState === RUSH_STATE.FREE) {
    updateRushFree(dt);              // â€¦the same, steered by the player instead
  } else if (rushState === RUSH_STATE.WINDOW) {
    updateRushWindow(dt);            // combat-ready, facing the mark, NOT idle
  } else if (player.carrying) {
    // The carry is a STANCE, not an attack: it sits below a reaction and a swing
    // (both of which drop the man â€” see updateCarryHold) and above the guard,
    // because you cannot raise a guard with someone over your head. It is also
    // the only stance that owns a body other than Darki's, so the hold is
    // updated here, on exactly the frames the stance owns the picture.
    updateCarryHold(dt);
    if (player.carrying) {                        // â€¦still holding after that
      player.anim = 'carry';
      const entry = darkiCarrySprite.anims.carryEntry;
      const loop = darkiCarrySprite.anims.carry;
      const moving = Math.abs(player.vx) > 12 || Math.abs(player.depthV) > 12;
      const strideRate = moving
        ? Math.max(0.55, Math.abs(player.vx) / PLAYER.maxSpeed,
          Math.abs(player.depthV) / PLAYER.depthSpeed)
        : 0.40;
      // 19-40 is a one-time settle from the lift. After it has played at authored
      // speed, 41-62 is the measured seamless loop; wrapping 62 back to 19 was
      // the old once-per-lap hitch.
      const inEntry = player.carryAnimT < entry.frames.length;
      player.carryAnimT += dt * (inEntry ? entry.fps : loop.fps * strideRate);
      player.animTime = player.carryAnimT;
      const step = Math.floor(player.carryAnimT);
      if (step < entry.frames.length) {
        player.frame = entry.frames[Math.min(step, entry.frames.length - 1)];
      } else {
        const loopStep = step - entry.frames.length;
        player.frame = loop.frames[loopStep % loop.frames.length];
        darkiFootfalls(loop, loopStep, dt);
      }
    }
  } else if (player.blocking) {
    // The guard sits below a reaction and a swing on purpose â€” both of those
    // already dropped it (startReaction calls endBlock, and you cannot swing
    // while holding it) â€” but above every idle/walk pose, because it is a
    // stance he is CHOOSING to hold rather than one the sim fell back to.
    player.anim = 'block';
    player.frame = blockFrame();
    player.animTime = 0;
  } else {
    let next;
    if (player.state === 'ko') next = 'ko';
    else if (player.state === 'hurt') next = 'hurt';
    /* THE ARC IS TWO CLIPS, PICKED BY WHICH WAY HE IS TRAVELLING.
     *
     * It used to be one: `jump` played through and then held its last frame for
     * however long he was airborne. On the old sheet that was survivable because
     * the old sheet barely left the ground. On a real leap it is not — the whole
     * descent would be spent frozen in the tuck, feet folded up, arriving on the
     * deck in a pose that has nothing to do with landing.
     *
     * `vy` is the only thing that knows the difference, and it is exact: it
     * crosses zero AT the apex, so the tuck holds to the top of the arc and the
     * descent starts on the frame he begins to fall. No timer to keep in step
     * with the jump arc, and it stays right when a jump is cut short by
     * releasing the button (which halves the rise but not the fall). */
    /* …and a jump he STRUCK out of comes down on the strike's own recovery
     * instead, so the leg he kicked with is the leg he lands on. `airAttackDone`
     * already means exactly "he has thrown the air attack this jump" — it is set
     * on the press and cleared on touchdown — so there is no second flag to keep
     * in step with it. */
    else if (!player.grounded) next = airbornePose();
    /* …and the landing, which is why `landT` outranks idle and walk: a player
     * still holding a direction when he touches down would otherwise be walking
     * on the first grounded frame and the landing would never be seen. He IS
     * walking — this changes the picture, not the physics. */
    else if (player.landT > 0) next = 'land';
    else {
      const moving = Math.abs(player.vx) > 12 || Math.abs(player.depthV) > 12;
      const inRange = enemyInFightRange();
      next = inRange ? (moving ? 'combatwalk' : 'combatidle') : (moving ? 'walk' : 'idle');
    }
    if (next !== player.anim) { player.anim = next; player.frame = 0; player.animTime = 0; }

    const spr = spriteFor(player.anim);
    const spec = playerAnimSpec(spr, player.anim);
    let rate = spec.fps;
    if (player.anim === 'walk' || player.anim === 'combatwalk')
      rate = spec.fps * Math.max(0.5, Math.abs(player.vx) / PLAYER.maxSpeed,
        Math.abs(player.depthV) / PLAYER.depthSpeed) * (player.rageActive ? 1.2 : 1);
    else if (player.anim === 'combatidle') rate = spec.fps * 0.5;   // gentle guard bob
    player.animTime += dt * rate;
    const step = Math.floor(player.animTime);
    /* A ONE-SHOT THAT HAS RUN OUT HOLDS ITS LAST FRAME instead of wrapping.
     *
     * All three of these are cut to be shorter than the beat they cover, on
     * purpose: the rise reaches the tuck before apex, the descent reaches
     * legs-down before the deck, and the landing finishes inside `landT`. That
     * only reads as intended if the tail HOLDS — wrapping would replay the
     * launch halfway up, or bounce him through a second landing on the spot. */
    const oneShot = player.anim === 'jumpRise' || player.anim === 'jumpFall'
      || player.anim === 'airKickFall' || player.anim === 'land';
    if (spec.loop === false && step >= spec.frames.length && oneShot)
      player.frame = spec.frames[spec.frames.length - 1];
    else
      player.frame = spec.frames[step % spec.frames.length];
    darkiFootfalls(spec, step, dt);
  }
  // Any frame he is NOT in that branch he is attacking, reacting or blocking â€”
  // the clock stops there so a step cannot be left half-crossed and fire the
  // moment he starts walking again.
  if (player.react || player.attack || player.blocking) player.stepClock = null;

  updateCamera(dt);

  for (const bus of buses) {
    bus.x += bus.dir * bus.speed * dt;
    if (bus.x < -320) bus.x = WORLD_W + 300;
    if (bus.x > WORLD_W + 320) bus.x = -300;
  }

  mobClock += dt;                          // shared orbit clock (deterministic)

  for (const enemy of enemies) {
    if (enemy.benched) continue;           // parked off-screen between waves
    enemy.prevX = enemy.x; enemy.prevY = enemy.y;   // â€¦for the footstep speed gate
    enemy.hpFlash = Math.max(0, enemy.hpFlash - dt);
    enemy.hpShown += (enemy.hp - enemy.hpShown) * Math.min(1, dt * 8);

    // The execution owns the victim outright: no AI, no physics, no steering, no
    // separation and â€” because `continue` skips the animation router below â€” no
    // frame selection either, so nothing can overwrite his execution pose.
    // drawExecution draws him instead.
    if (enemy.execVictim) continue;
    // A body Darki threw is a weapon while it is in the air. Runs before the
    // chain below rather than inside the 'hit' branch, because it also owns
    // retiring the flag once he has stopped being a projectile.
    updateThrownBody(enemy, dt);
    // Being struck, grabbed or killed ends the walk-in before it can overwrite
    // the reaction â€” see enemyEntranceHolds.
    if (enemy.spawnEntry && !enemyEntranceHolds(enemy)) endEnemyEntrance(enemy, 0);
    if (enemy.spawnEntry) {
      updateEnemyEntrance(enemy, dt);      // natural off-screen arrival owns movement and blocks AI
    } else if (enemy.grabbed) {            // held: the grab owns its transform â€”
      enemy.grabHitT = Math.max(0, enemy.grabHitT - dt);   // no AI, no physics,
    } else if (enemy.carried) {
      // â€¦and the carry owns its own the same way. seatCarried places him from
      // Darki's transform every frame, so there is deliberately nothing to do
      // here: no AI, no attacks, no physics, no lane steering, no separation.
      enemy.carryT += dt;                  // just his own clock, for the struggle
    } else if (enemy.state === 'hit') {    // no steering, no separation.
      enemy.facing = -Math.sign(enemy.vx || 1); // face the attacker
      // Absorbing it. He is committed â€” struck, off-balance, on the fall sheet's
      // opening frames â€” but gravity has not taken him yet. This is what stops a
      // group going over as one body, and it is why he drifts at a fraction of
      // his knockback here instead of standing still: a man being hit is already
      // moving, just not falling.
      if (enemy.fallHold > 0) {
        enemy.fallHold -= dt;
        enemy.x += enemy.vx * 0.3 * dt;
      } else {
        enemy.x += enemy.vx * dt;
        enemy.jumpY += enemy.vy * dt;
        enemy.vy += 2200 * dt;
      }
      if (enemy.jumpY >= 0) {
        // He is on the deck. The state flips HERE, on the first contact, so the
        // crash frames and the thud are the same instant â€” the bounce that
        // follows is a lift applied on top of a body that has already landed,
        // not a second flight.
        enemy.jumpY = 0;
        enemy.bounceT = 0;
        // How hard he actually hit, off the velocity he hit with. A Ginger
        // dropped by a jab must not bounce like one launched by the uppercut.
        enemy.bounceScale = Math.max(0.45, Math.min(1.35, enemy.vy / 620));
        const thrownWeight = enemy.thrownByCarry
          ? 0.90 + 0.35 * (enemy.throwPower ?? 0)
          : 0.75;
        playThud(enemy.x, thrownWeight);
        if (enemy.dead) {
          enemy.state = 'ko';
          // A corpse now lies there for the whole death performance BEFORE the
          // existing fade-and-tally starts, instead of dissolving through it.
          // THE BOSS IS NO LONGER EXCLUDED. He was, because he had no fall art â€”
          // there was no performance to hold on, so holding was pointless. Now
          // that OLODO_FALL_SHEET draws his crash, a bare KO_FADE started
          // dissolving him on the frame he landed and he was at 65% opacity
          // before he was flat. He gets his own crash length instead of the mob's
          // DEATH_HOLD, since it is his own sheet being waited on. This delays
          // the outro by that much and nothing more: `onBossDefeated` fires when
          // this timer expires, so the case file is sequenced off it rather than
          // synchronised to it.
          enemy.koTimer = enemy.dying
            ? (enemy.boss ? BOSS_FALLDOWN_DUR : DEATH_HOLD) + KO_FADE
            : KO_FADE;
          enemy.dead = false;
        } else {
          enemy.state = 'down';
          // Exactly as long as the crash and the recovery take at HIS playback
          // speed â€” no more. He is up the frame the sheet ends. Per body, because
          // the boss's two sections are 7 and 19 frames against the mob's 9 and 6.
          enemy.downTimer = fallTimes(enemy).down / (enemy.fallRate || 1);
        }
      }
    } else if (enemy.state === 'stagger') { // brief flinch, stays on its feet
      enemy.staggerTimer -= dt;
      enemy.x += enemy.vx * dt;
      enemy.vx *= Math.pow(0.02, dt);
      if (enemy.staggerTimer <= 0) { enemy.state = 'walk'; enemy.mode = enemy.boss ? 'idle' : 'menace'; }
      if (enemy.boss) advanceBossStance(enemy, dt);   // he never stops bobbing
    } else if (enemy.state === 'down') {   // KO'd on the tarmac, then back up
      enemy.downTimer -= dt;
      enemy.bounceT += dt;
      enemy.jumpY = -bounceLift(enemy.bounceT, enemy.bounceScale);
      if (enemy.downTimer <= 0) { enemy.state = 'walk'; enemy.jumpY = 0; enemy.mode = enemy.boss ? 'idle' : 'menace'; }
    } else if (enemy.state === 'ko') {     // dead â€” lie still, then fade and tally
      enemy.koTimer -= dt;
      enemy.bounceT += dt;
      enemy.jumpY = -bounceLift(enemy.bounceT, enemy.bounceScale);
      // Only the LAST `KO_FADE` seconds fade. Anything before that is the death
      // animation, and a corpse that dissolves while it is still falling never
      // gets to be a corpse.
      enemy.alpha = Math.max(0, Math.min(1, enemy.koTimer / KO_FADE));
      if (enemy.koTimer <= 0) onEnemyDefeated(enemy);
    } else if (enemy.boss) {
      stepBossAI(enemy, dt);               // MC_Olodo: stance footwork + fist combo
    } else {
      stepEnemyAI(enemy, dt);              // Streets-of-Rage mob AI
    }

    enemy.y = clampLane(enemy.y);
    // The boss drives his own frame (his stance clock, or the fist-combo step
    // table), so the generic router only applies to the street mob: it picks the
    // sheet/section for this state (stride, guard advance, guard idle, or hit
    // recoil), restarting the clock whenever the section changes so a new state
    // plays from its first frame.
    // â€¦EXCEPT while he is on his knockdown sheet. There he has no move table and
    // no stance clock driving him â€” the hit/down/ko branches above reach neither
    // stepBossAI nor advanceBossStance â€” so without this his fall would be a
    // single stale frame held for the whole knockdown. Everything the mob's fall
    // needs is already here (spec-change detection restarts the clock, `loop:
    // false` holds the last frame, `fallRate` varies the playback), so he takes
    // the same path rather than getting a second copy of it.
    if (enemy.boss && !bossFalling(enemy)) continue;
    const { spec, name } = enemyAnim(enemy);
    enemy.anim = name;
    if (enemy.animSpec !== spec) { enemy.animSpec = spec; enemy.animTime = 0; }
    // Per-body speed, but ONLY while he is going down or getting up. It must not
    // touch the walk, the guard or an attack: the side kick's connect frame is
    // tied to KICK_FPS by arithmetic (see GINGER_MOVES.kick.connectAt), so
    // jittering that fps would jitter when his boot lands.
    const fallAnim = name === 'fallAir' || name === 'fallDown' || name === 'getUp'
      || name === 'deathAir' || name === 'deathDown';
    enemy.animTime += dt * spec.fps * (fallAnim ? (enemy.fallRate ?? 1) : 1);
    const estep = Math.floor(enemy.animTime);
    // Pickup and release are shared choreography. During the long hold Agbero's
    // own 37-frame struggle loop runs independently (its seam is 1.28x a normal
    // step; forcing Darki's 22-frame foot cadence onto it measured a visible
    // 1.75x hitch). The throw snaps both layers back to shared frame 80.
    const pairedFrame = enemy.carried && gingerCarrySprite
      && (player.attack === 'pickup' || player.attack === 'carryThrow')
      ? Math.max(0, Math.min(90, player.frame ?? 0))
      : null;
    enemy.frame = pairedFrame ?? ((spec.loop === false && estep >= spec.frames.length)
      ? spec.frames[spec.frames.length - 1]
      : spec.frames[estep % spec.frames.length]);
    stepFootfalls(enemy, name, spec, estep, dt);
  }

  separateActors(dt);
  /* LAST, so it reads the state this frame actually ended in rather than the
   * one it started in — the hold can be taken away anywhere above (a throw, a
   * drop, a blow that breaks the grip, the man dying in it) and the bed should
   * stop on that frame, not on the next one. */
  syncStruggleAudio();
}

/* ----------------------------------------------------------------- draw */

// LEVEL 1 MVP parallax layers. The tweakable transform (scale, screen Y, scroll
// parallax, X nudge) lives in `tune` so the dev panel drives it live; only the
// fixed art reference row (image space) is a constant here. `anchorImgY` is the
// image row pinned to `tune.<key>Y` on screen â€” for the street that's the road's
// far edge (~485, where parked vehicles' wheels sit), pinned to GROUND_Y.
const LAYER_ANCHOR = { sky: 0, far: 931, mid: 461, street: 485 };
const HAZE = '223,224,214';       // harmattan haze colour for aerial fog

// Reusable off-screen buffer so per-layer fog tints only that layer's own
// pixels (its silhouette), never the layers behind it â€” the distance-based
// aerial perspective the eye reads as depth.
let fogBuf = null, fogBufCtx = null;

// Tile a layer horizontally across the viewport at its (tunable) transform.
// `fog` (0â€“1) washes the layer's opaque pixels toward the haze colour.
function drawLayer(img, key, fog = 0) {
  if (!img || !img.width) return;
  const scale = tune[key + 'Scale'];
  const dw = img.width * scale, dh = img.height * scale;
  const topY = Math.round(tune[key + 'Y'] - LAYER_ANCHOR[key] * scale);
  const scroll = cameraX * tune[key + 'Parallax'] + tune[key + 'X'];
  const off = ((scroll % dw) + dw) % dw;
  const dwC = Math.ceil(dw), dhC = Math.ceil(dh);

  if (fog > 0.001) {
    if (!fogBuf) { fogBuf = makeCanvas(VIEW_W, VIEW_H); fogBufCtx = fogBuf.getContext('2d'); }
    const b = fogBufCtx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.clearRect(0, 0, VIEW_W, VIEW_H);
    for (let sx = -off; sx < VIEW_W + dw; sx += dw) b.drawImage(img, Math.round(sx), topY, dwC, dhC);
    // Haze washes only the layer's own pixels (source-atop), ramping down the
    // layer's height: light at the roofs, densest at the base â€” so distant
    // buildings rise out of the haze at the horizon.
    b.globalCompositeOperation = 'source-atop';
    const aTop = Math.min(1, Math.max(0, fog * tune.fogTop));
    const aBot = Math.min(1, fog);
    const grad = b.createLinearGradient(0, topY, 0, topY + dh);
    grad.addColorStop(0, `rgba(${HAZE},${aTop})`);
    grad.addColorStop(1, `rgba(${HAZE},${aBot})`);
    b.fillStyle = grad;
    b.fillRect(0, 0, VIEW_W, VIEW_H);
    b.globalCompositeOperation = 'source-over';
    ctx.drawImage(fogBuf, 0, 0);
    return;
  }
  for (let sx = -off; sx < VIEW_W + dw; sx += dw) {
    ctx.drawImage(img, Math.round(sx), topY, dwC, dhC);
  }
}

// Sky behind the mural: harmattan gradient + drifting clouds (sky.png). Shows
// through the mural's keyed-transparent night-sky region, above the wall.
function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, '#7fb2d9');
  g.addColorStop(0.55, '#cfd9c9');
  g.addColorStop(1, '#e8caa0');
  ctx.fillStyle = g;
  ctx.fillRect(-12, -12, VIEW_W + 24, GROUND_Y + 12);   // overscan for screen shake
  if (bg && bg.sky) drawLayer(bg.sky, 'sky');
}

// Far/mid parallax layers retired â€” the mural bakes the wall + street.
function drawSkyline() {}
function drawBackdrop() {}
function drawSidewalkBand() {}

// LEVEL 1 mural: the entire playable backdrop (night sky, protest wall, danfos
// and wet cobblestone all baked into one image). Drawn ONCE â€” no horizontal
// tiling, so the unique scene never repeats â€” scrolling 1:1 with the camera and
// scaled to span the world exactly. `MAP_ANCHOR_Y` is the image row pinned to
// `tune.streetY` (the ground line); scale/Y/parallax/X stay tunable via the dev
// panel's "Street" section.
const MAP_ANCHOR_Y = 646;   // image row that sits at the play floor (GROUND_Y)
function drawFrontage() {
  if (!bg || !bg.map || !bg.map.width) return;
  const img = bg.map, scale = tune.streetScale;
  const topY = Math.round(tune.streetY - MAP_ANCHOR_Y * scale);
  const x = Math.round(-cameraX * tune.streetParallax + tune.streetX);
  ctx.drawImage(img, x, topY, Math.ceil(img.width * scale), Math.ceil(img.height * scale));
}

// Road surface is part of the street layer above; nothing extra to draw.
function drawRoad() {}

/* ------------------------------------------------------- combat drawing */

// Flash a sprite frame toward a solid colour (hit flash / rage tint) using a
// reused scratch buffer so we don't allocate per frame.
let sBuf = null, sCtx = null;
function tintedFrame(frame, color, alpha) {
  if (!sBuf) { sBuf = makeCanvas(1, 1); sCtx = sBuf.getContext('2d'); }
  if (sBuf.width !== frame.width || sBuf.height !== frame.height) {
    sBuf.width = frame.width; sBuf.height = frame.height;
  }
  sCtx.setTransform(1, 0, 0, 1, 0, 0);
  sCtx.globalCompositeOperation = 'source-over'; sCtx.globalAlpha = 1;
  sCtx.clearRect(0, 0, frame.width, frame.height);
  sCtx.drawImage(frame, 0, 0);
  sCtx.globalCompositeOperation = 'source-atop';
  sCtx.globalAlpha = alpha;
  sCtx.fillStyle = color;
  sCtx.fillRect(0, 0, frame.width, frame.height);
  sCtx.globalCompositeOperation = 'source-over'; sCtx.globalAlpha = 1;
  return sBuf;
}

const healthColor = (f) => (f > 0.5 ? '#5dd45d' : f > 0.25 ? '#ffd23f' : '#ff5442');

// A chunky arcade meter: dark trough, a trailing "chip" bar that lags behind on
// damage, the live fill, a gloss highlight, and a light border.
function drawBar(x, y, w, h, frac, chipFrac, fillCol, opts = {}) {
  frac = Math.max(0, Math.min(1, frac));
  chipFrac = Math.max(frac, Math.min(1, chipFrac));
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#141821';
  ctx.fillRect(x, y, w, h);
  if (opts.chipCol !== 'none') {
    ctx.fillStyle = opts.chipCol || 'rgba(255,90,66,0.75)';
    ctx.fillRect(x, y, w * chipFrac, h);
  }
  ctx.fillStyle = fillCol;
  ctx.fillRect(x, y, w * frac, h);
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.fillRect(x, y, w * frac, Math.max(1, h * 0.42));
  ctx.strokeStyle = opts.borderCol || 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// Which per-sheet transform (tune.dScale*/dOffY*) applies to a player anim.
function darkiSheetKey(anim) {
  if (anim === 'combatwalk' || anim === 'combatidle') return 'Combat';
  if (anim === 'idle' || anim === 'hurt' || anim === 'ko') return 'Idle';
  /* One transform per SHEET, because the transform corrects a sheet's union box.
   * The jump sheet's four clips share theirs — giving the landing its own key
   * would let the dev panel scale him mid-arc — and the strike's descent, the
   * one clip still coming off the other sheet, keeps its own so the two remain
   * independently nudgeable if they ever drift. The KICK moved across with its
   * art: keying it 'JumpStrike' while drawing it from the jump sheet would
   * correct a union box the frames no longer belong to. */
  if (anim === 'airKickFall') return 'JumpStrike';
  if (anim === 'jump' || anim === 'jumpRise' || anim === 'jumpFall'
      || anim === 'land' || anim === 'airKick') return 'Jump';
  if (anim === 'jabLeft') return 'JabL';
  if (anim === 'highKick') return 'HighKick';
  if (anim === 'backKick') return 'BackKick';
  if (anim === 'combo5') return 'Combo';
  if (anim === 'grab') return 'Grab';
  if (anim === 'grabFail') return 'GrabFail';
  if (anim === 'contCombo') return 'ContCombo';
  if (anim === 'pickup') return 'Pickup';
  if (anim === 'carry') return 'Carry';
  if (anim === 'throwEnemy') return 'Throw';
  if (anim === 'rush') return 'Rush';
  if (anim === 'uppercut') return 'Uppercut';
  if (anim === 'hitReact') return 'HitReact';
  if (anim === 'hitLift') return 'HitLift';
  if (anim === 'hitAir') return 'HitAir';
  if (anim === 'fall') return 'Fall';
  if (anim === 'block') return 'Block';
  return 'Walk';
}

function drawPlayer() {
  // During an execution the pair IS the player's visual, drawn as one composition
  // in his depth slot so it sorts against the rest of the street normally.
  if (execution) { drawExecution(); return; }
  const animationSprite = spriteFor(player.anim);
  const { frames, anchors, drawW, drawH } = animationSprite;
  const frame = frames[player.frame] ?? frames[0];
  const anchor = anchors[player.frame] ?? anchors[0];
  const screenX = player.x - cameraX;
  // per-sheet transform: base player scale Ã— this sheet's scale, plus a Y nudge,
  // so mismatched sheets (e.g. the crouched combat walk) can be sized/aligned.
  const key = darkiSheetKey(player.anim);
  const baseScale = tune.playerScale;
  const ps = baseScale * (tune['dScale' + key] ?? 1);
  const offY = tune['dOffY' + key] ?? 0;

  // ground shadow (tracks the base scale so it stays steady across sheets)
  ctx.fillStyle = `rgba(0,0,0,${tune.shadowAlpha})`;
  ctx.beginPath();
  const squash = player.grounded ? 1 : Math.max(0.5, 1 + player.jumpY / 500);
  ctx.ellipse(screenX + tune.shadowOffsetX, player.y + 6 + tune.shadowOffsetY,
    drawW * 0.36 * baseScale * squash * tune.shadowScaleX, 11 * squash * tune.shadowScaleY,
    0, 0, Math.PI * 2);
  ctx.fill();

  // rage aura â€” pulsing golden glow behind Darki + ground ring
  if (player.rageActive) {
    const pulse = 0.5 + 0.5 * Math.sin(mobClock * 16);
    const g = ctx.createRadialGradient(screenX, player.y - 70, 8, screenX, player.y - 70, 130);
    g.addColorStop(0, `rgba(255,190,70,${0.30 + 0.18 * pulse})`);
    g.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(screenX, player.y - 70, 130, 0, Math.PI * 2); ctx.fill();
  }

  /* THE SPEED TRAIL, in his own depth slot and UNDER his own sprite. Drawn here
   * rather than as a separate actor in the sort list for two reasons: the echoes
   * must never sort in front of him (he is the sharp, opaque, dominant one), and
   * they must sort against the street exactly as he does, which they get for
   * free by riding inside his draw. */
  drawRushFx();

  // flash/tint: hit â†’ red, else rage â†’ gold
  let img = frame, tint = null;
  if (player.hpFlash > 0) tint = ['#ff3040', Math.min(0.7, player.hpFlash / 0.3 * 0.7)];
  else if (player.rageActive) tint = ['#ffb020', 0.22 + 0.12 * (0.5 + 0.5 * Math.sin(mobClock * 16))];
  if (tint) img = tintedFrame(frame, tint[0], tint[1]);

  // i-frame blink after being hit
  const blink = player.invuln > 0 && player.state === 'normal' && Math.floor(player.invuln * 22) % 2 === 0;

  ctx.save();
  ctx.globalAlpha = blink ? 0.4 : 1;
  ctx.translate(screenX, player.y + player.jumpY + offY);
  // A KO used to be the idle pose rotated flat, because there was no art of him
  // going down. Darki_Fall is that art, so the pose is drawn, not faked â€” and
  // rotating it now would lay him out twice.
  if (player.state === 'ko' && !player.react) ctx.rotate(-player.facing * 1.35);
  /* THE SHEET BEING DRAWN DECIDES THE FLIP, not the walk sheet.
   *
   * NO BEHAVIOUR CHANGES TODAY — every one of Darki's sheets is authored facing
   * right, so this resolves to exactly what `SHEET.faces` gave. It is here
   * because reading one global constant for twenty-odd sheets is only correct by
   * luck: the first of his sheets authored facing left would have drawn him
   * swinging away from whatever he was aiming at, and nothing in the frame data
   * would have looked wrong. Enemies have always asked their own sheet
   * (`enemy.facing !== config.faces`); this is Darki catching up with a rule the
   * rest of the game already had. `measureFrame`'s `lean` is what makes a claim
   * about a sheet's facing checkable in the first place. */
  ctx.scale(player.facing !== (animationSprite.faces ?? SHEET.faces) ? -ps : ps, ps);
  /* THE DIVE'S TILT, applied INSIDE the flip so it follows his facing for free:
   * a positive rotation in this space tips the leading foot down whichever way
   * he is pointed, because the mirror turns the sign over with everything else.
   *
   * Pivoted at mid-body rather than at the origin. The origin here is his FEET
   * (the image is drawn up from it), and rotating a 200px sprite about its own
   * feet swings his head through a quarter of the screen — his boot would stay
   * pinned and his head would do the diving. */
  // Pose-gated — see drawnTilt, which is the one place that decides.
  const tiltable = drawnTilt() > 0.002;
  if (tiltable) {
    const pivotY = -drawH * AIR_STRIKE.pivot;
    ctx.translate(0, pivotY);
    ctx.rotate(drawnTilt());
    ctx.translate(0, -pivotY);
  }
  ctx.drawImage(img, -anchor, -drawH);
  ctx.restore();
  ctx.globalAlpha = 1;

  if (window.__ror?.debugHitboxes && player.attack) {
    const win = ATTACKS[player.attack].windows[player.attackStep];
    if (win) {
      const b = attackBox(win);
      ctx.strokeStyle = '#ff3355';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x - cameraX, b.y, b.w, b.h);
    }
  }
}

// Is this body being drawn from AgbeoFall? Everything the old draw code did to
// FAKE a fall â€” the 90-degree lay-flat, the tilt going over â€” has to be skipped
// when the art does it for real, and MC_Olodo has no fall sheet, so this is a
// per-body question rather than a global one.
// Covers ALL THREE knockdown sheets: each draws its own going-over and its own
// body on the deck, and they are reached through the same three states, so one
// gate answers for every body on the street. MC_Olodo used to be the exception â€”
// he had no fall art, so he was laid flat by rotating his stance sprite 90 degrees
// with stars circling. OLODO_FALL_SHEET retires that, and this is where the
// fakery is switched off: the rotation and the stars are both behind `!onFallSheet`.
const onFallSheet = (enemy) => !enemy.grabbed && !enemy.carried
  && (enemy.boss
    ? bossFalling(enemy)
    : !!(enemy.dying ? gingerDeathSprite : gingerFallSprite)
      && (enemy.state === 'hit' || enemy.state === 'down' || enemy.state === 'ko'));

function drawEnemy(enemy) {
  if (enemy.execVictim) return;          // drawn by drawExecution, with his attacker
  const screenX = enemy.x - cameraX;
  if (screenX < -140 || screenX > VIEW_W + 140) return;
  const { sprite: es, config, spec } = enemyAnim(enemy);
  const frameIndex = es.frames[enemy.frame] ? enemy.frame : spec.frames[0];
  const frame = es.frames[frameIndex];
  const anchor = es.anchors[frameIndex];
  const flip = enemy.facing !== config.faces;

  const es2 = enemy.boss ? tune.bossScale : tune.enemyScale;
  const offY = enemy.boss ? tune.bossOffY : 0;
  const alpha = enemy.alpha ?? 1;                 // ko fade-out
  // Hit flash wins; failing that, a bloodied boss pulses red so his second gear
  // reads on screen instead of only in the numbers.
  let img = frame;
  if (enemy.hpFlash > 0)
    img = tintedFrame(frame, '#ffffff', Math.min(0.8, enemy.hpFlash / 0.25 * 0.8));
  else if (enemy.boss && bossEnraged(enemy))
    // kept light on purpose: enough to read as "he is vexed", not enough to turn
    // his green kit olive â€” the trailing embers and the HUD carry the rest
    img = tintedFrame(frame, '#ff3524', 0.07 + 0.09 * (0.5 + 0.5 * Math.sin(mobClock * 9)));

  ctx.globalAlpha = alpha;
  // Shadow width tracks ONE sheet per character regardless of the current
  // section, so it doesn't pop when he squares up into the (wider-stanced) guard
  // frames or when the boss swaps to his combo sheet.
  const shadowRef = enemy.boss ? olodoStanceSprite : gingerWalkSprite;
  ctx.fillStyle = `rgba(0,0,0,${tune.shadowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(screenX + tune.shadowOffsetX, enemy.y + 5 + tune.shadowOffsetY,
    shadowRef.drawW * 0.3 * es2 * tune.shadowScaleX, 9 * tune.shadowScaleY, 0, 0, Math.PI * 2);
  ctx.fill();

  if ((enemy.state === 'down' || enemy.state === 'ko') && !onFallSheet(enemy)) {
    // No fall art for this body (the boss): laid flat the old way â€” sprite over
    // sideways, stars circling. The mob takes the branch below now.
    const side = -enemy.facing;            // fell away from the attacker
    ctx.save();
    ctx.translate(screenX, enemy.y - 16);
    ctx.scale(es2, es2);
    ctx.rotate(side * Math.PI / 2 * 0.94);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -anchor, -es.drawH + 16);
    ctx.restore();
    ctx.fillStyle = '#ffd23f';
    const spin = (enemy.downTimer || enemy.koTimer) * 5;
    for (let i = 0; i < 3; i++) {
      const a = spin + i * (Math.PI * 2 / 3);
      ctx.beginPath();
      ctx.arc(screenX - side * 60 + Math.cos(a) * 26, enemy.y - 40 + Math.sin(a) * 7, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  const y = enemy.y + enemy.jumpY + offY;
  ctx.save();
  ctx.translate(screenX, y);
  ctx.scale(es2, es2);
  // The tilt is the SAME stand-in the 90-degree flat pose was: something to
  // suggest a body going over when no art of one existed. AgbeoFall draws the
  // tumble and the crash, so tilting it now would lean a man who is already
  // lying down â€” exactly the mistake Darki's KO had before Darki_Fall landed.
  if (!onFallSheet(enemy)) {
    if (enemy.state === 'hit') ctx.rotate(Math.sign(enemy.vx || 1) * 0.35);
    else if (enemy.state === 'stagger') ctx.rotate(Math.sign(enemy.vx || 1) * 0.14);
  }
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -anchor, -es.drawH);
  ctx.restore();
  ctx.globalAlpha = 1;

  // Telegraph: a red flashing chevron over the head while winding up an
  // attack â€” the SoR "about to go off" cue that lets the player react. The boss
  // telegraphs off whichever move he committed to, so the kick and the super
  // announce themselves on their own wind-ups, not the fist combo's.
  drawExecPrompt(enemy, screenX, enemy.y - es.drawH * es2);
  const bossWindup = enemy.boss && enemy.mode === 'special' && enemy.move
    && enemy.spStep >= 0 && enemy.spStep < enemy.move.windup;
  if (bossWindup && Math.floor(mobClock * 14) % 2 === 0) {
    const hy = enemy.y - es.drawH * es2 - 16;
    ctx.fillStyle = '#ff2e2e';
    ctx.beginPath();
    ctx.moveTo(screenX, hy + 14);
    ctx.lineTo(screenX - 11, hy);
    ctx.lineTo(screenX + 11, hy);
    ctx.closePath();
    ctx.fill();
  }
  if (enemy.mode === 'windup' && Math.floor(enemy.stateTimer * 12) % 2 === 0) {
    const hy = enemy.y - es.drawH * es2 - 14;
    ctx.fillStyle = '#ff2e2e';
    ctx.beginPath();
    ctx.moveTo(screenX, hy + 12);
    ctx.lineTo(screenX - 9, hy);
    ctx.lineTo(screenX + 9, hy);
    ctx.closePath();
    ctx.fill();
  }

  // Floating HP bar above the head â€” appears once damaged. The boss gets the
  // full-width plate at the top of the screen instead (see drawBossHud).
  if (!enemy.boss && enemy.hp < enemy.maxHp) {
    const bw = 52, bh = 5;
    const bx = screenX - bw / 2;
    const by = enemy.y - es.drawH * es2 - 22;
    drawBar(bx, by, bw, bh, enemy.hp / enemy.maxHp, enemy.hpShown / enemy.maxHp,
      healthColor(enemy.hp / enemy.maxHp));
  }
}

function drawActors() {
  // Feet define z-depth: smaller Y is farther up the road and draws first.
  // Exact ties use a stable id; lane steering keeps active bodies apart.
  // A grabbed enemy is forced just behind Darki so he stays the dominant
  // foreground sprite for the whole hold, however their feet line up.
  const actors = enemies.map((enemy, i) => ({
    // A CARRIED man sorts in FRONT of Darki, not behind: he is held out over the
    // top of him, so the hold only reads correctly if he occludes rather than
    // hides. (A grabbed one goes behind â€” see above â€” because there Darki is the
    // one doing the beating and has to stay the dominant sprite.)
    depth: enemy.carried ? player.y + 0.001 : enemy.grabbed ? player.y - 0.001 : enemy.y,
    tie: i,
    draw: () => drawEnemy(enemy),
  }));
  actors.push({ depth: player.y, tie: 100, draw: drawPlayer });
  // The dropped ledger sorts like anything else on the road, except while it is
  // in Darki's hand â€” then it is forced just in FRONT of him so the pickup reads.
  if (evidence.active && !evidence.gone)
    actors.push({ depth: evidence.held ? player.y + 0.001 : evidence.y, tie: 101, draw: drawEvidence });
  actors.sort((a, b) => (a.depth - b.depth) || (a.tie - b.tie));
  for (const actor of actors) actor.draw();
}

// The dropped ledger: a folded sheet, world-space, drawn inside the camera
// transform like an actor. Squashed flat while it lies on the tarmac.
function drawEvidence() {
  const p = evidencePose();
  const sx = p.x - cameraX;
  // contact shadow â€” tightens as it comes down, so the fall has a floor
  ctx.save();
  ctx.globalAlpha = 0.30 * p.alpha * (0.35 + 0.65 * p.flat);
  ctx.fillStyle = '#05070c';
  ctx.beginPath();
  ctx.ellipse(evidence.x - cameraX, evidence.y - 2, 20 - 6 * p.flat, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.translate(sx, p.y);
  ctx.rotate(p.rot);
  ctx.scale(1, 1 - 0.62 * p.flat);
  drawLedgerFace();
  ctx.restore();
}

// The ledger's face, drawn about the origin at `s`x. Shared by the prop lying on
// the tarmac and the copy on the case file, so the thing Darki picked up is
// visibly the thing the file is built on.
function drawLedgerFace(s = 1) {
  ctx.fillStyle = '#f4efe2';                       // the sheet
  ctx.fillRect(-15 * s, -20 * s, 30 * s, 40 * s);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';              // its fold
  ctx.fillRect(-15 * s, -20 * s, 4 * s, 40 * s);
  ctx.fillStyle = '#b9ae94';                       // ruled lines
  for (let i = 0; i < 5; i++) ctx.fillRect(-8 * s, (-13 + i * 7) * s, 20 * s, 2 * s);
  ctx.fillStyle = '#c2452f';                       // the red tally down the margin
  ctx.fillRect(-8 * s, -13 * s, 3 * s, 33 * s);
}

function drawHud() {
  const px = 22, py = 20, barW = 300;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // status panel backing
  ctx.fillStyle = 'rgba(8,11,18,0.5)';
  ctx.fillRect(px - 10, py - 10, barW + 20, 78);

  // name plate
  ctx.fillStyle = '#ffe45e';
  ctx.font = display(700, 22);
  ctx.fillText('DARKI', px, py - 4);

  // HP bar
  const hpFrac = player.hp / player.maxHp;
  drawBar(px, py + 22, barW, 16, hpFrac, player.hpShown / player.maxHp, healthColor(hpFrac));
  ctx.fillStyle = '#eaf0ff';
  ctx.font = uiFont(700, 12);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.ceil(Math.max(0, player.hp))}/${player.maxHp}`, px + barW - 4, py + 24);

  // RAGE bar beneath the health
  const rf = player.rage / RAGE_MAX;
  const pulse = 0.5 + 0.5 * Math.sin(mobClock * 12);
  const rageCol = player.rageActive
    ? `rgb(255,${Math.round(140 + 60 * pulse)},40)`
    : (rf >= 1 ? '#ff2e2e' : '#ff3d6e');
  drawBar(px, py + 44, barW, 10, rf, rf, rageCol, { chipCol: 'none' });
  ctx.textAlign = 'left';
  ctx.font = uiFont(700, 10);
  ctx.fillStyle = player.rageActive ? '#fff2c4' : '#ffc2d2';
  ctx.fillText(player.rageActive ? `RAGE!  ${player.rageTimer.toFixed(1)}s` : 'RAGE', px + 5, py + 45);

  // manual grab-combo stamina â€” only on screen while the combo owns the input.
  // The prompt names the fist that sustains by alternation, but flips to MASH
  // once a same-button streak has taken over, so the feedback matches the input.
  if (player.attack === 'contCombo') {
    const f = Math.max(0, player.mcStamina / MCOMBO.stamina);
    drawBar(px, py + 60, barW, 8, f, f, f > 0.35 ? '#5ad1ff' : '#ff8b3d', { chipCol: 'none' });
    ctx.textAlign = 'left';
    ctx.font = uiFont(700, 10);
    ctx.fillStyle = '#dff3ff';
    const mashing = player.mcRepeat > MCOMBO.mashRepeats;
    const prompt = player.mcSection === 'finish' ? '—'
      : mashing ? `MASH ${player.mcFist === 0 ? 'LMB' : 'RMB'}`
      : (player.mcFist === 0 ? 'RMB' : 'LMB');
    const lap = `lap ${Math.max(1, player.mcLaps)}/${MCOMBO.laps}`;
    ctx.fillText(`COMBO  ${player.mcStamina.toFixed(1)}s  ${lap}  next: ${prompt}`, px + 5, py + 61);
  } else if (rushState !== RUSH_STATE.NONE || player.rushStam < 0.999 || player.rushDeniedT > 0) {
    // THE SPRINT GAUGE. It shares the combo's row and yields to it, because the
    // two can never be needed at once â€” you cannot be running and holding a man.
    //
    // On screen only when it is saying something: while he is running, while it
    // refills, and for a beat after a dash was refused. A bar that is permanently
    // full and permanently visible is furniture, and the player stops reading it
    // long before the one moment it matters.
    const f = Math.max(0, Math.min(1, player.rushStam));
    const denied = player.rushDeniedT > 0 && Math.sin(mobClock * 40) > 0;
    const col = denied ? '#ff4d4d'
      : player.rushWinded ? '#8a6a52'
      // Rage outranks the ordinary running colour: a bar that sits pinned at
      // full through a whole sprint has to look DELIBERATE, or it reads as the
      // gauge having stopped working.
      : rushInexhaustible() ? '#ffb020'
      : rushState !== RUSH_STATE.NONE ? '#ffd27a'
      : f >= 1 ? '#7be0a4' : '#c8a76a';
    drawBar(px, py + 60, barW, 8, f, f, col, { chipCol: 'none' });
    ctx.textAlign = 'left';
    ctx.font = uiFont(700, 10);
    ctx.fillStyle = denied ? '#ffd7d7' : player.rushWinded ? '#e0c4ad' : '#f2e3c6';
    // Names the state rather than the number: "WINDED" tells the player why the
    // dash was refused, which a percentage never does.
    const label = player.rushWinded ? 'WINDED'
      : rushInexhaustible() && rushState === RUSH_STATE.FREE ? 'RAGE  SPRINT'
      : rushInexhaustible() && rushState === RUSH_STATE.CHARGE ? 'RAGE  RUSH'
      : rushState === RUSH_STATE.FREE ? 'SPRINT'
      : rushState === RUSH_STATE.CHARGE ? 'RUSH'
      : f >= 1 ? 'SPRINT  READY' : 'SPRINT';
    ctx.fillText(label, px + 5, py + 61);
  }

  // controls hint (bottom-left)
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(207,216,234,0.85)';
  // L2 says both things it does, in the order it tries them: the finisher gets
  // first refusal and the pickup takes the press when there is no boss to finish.
  // Two lines now: the sprint is a command rather than a button, so it has to be
  // spelled out or nobody discovers it â€” a mechanic gated behind a double-tap is
  // invisible to a player who has never been told the double-tap exists.
  //
  // Both go through fitText: line 1 lists every binding in the game and is the
  // string most likely to be appended to. See fitText for the nine pixels of
  // headroom it used to have.
  const cribW = VIEW_W - px * 2;
  fitText('WASD · Jump · Jab LMB · High-Kick RMB · Back-Kick back+RMB · 5-Hit Combo LMBx2 · Uppercut hold-RMB+LMB / K · Grab G / MMB / R2 · Block hold L / Shift / L1 · EXECUTE / PICK UP hold E / L2 · Pause P · Mute M',
    px, VIEW_H - 42, cribW);
  ctx.fillStyle = 'rgba(255,210,122,0.85)';
  fitText('SPRINT fwd,fwd (hold to keep running) · out of a sprint: RMB Dash Kick · LMB Running Grab · LMBx2 Running Combo',
    px, VIEW_H - 24, cribW);

  drawWaveHud();
}

// MC_Olodo's boss plate: a full-width meter under a slanted name tag, the
// arcade "this one has a health bar" signal. Drawn instead of the little
// floating bar over his head.
function drawBossHud() {
  const w = 560, x = (VIEW_W - w) / 2, y = 58;
  const frac = Math.max(0, boss.hp / boss.maxHp);
  const enraged = bossEnraged(boss);
  const pulse = 0.5 + 0.5 * Math.sin(mobClock * 9);
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  // name tag
  ctx.fillStyle = 'rgba(8,11,18,0.55)';
  ctx.fillRect(x - 6, y - 26, w + 12, 24);
  ctx.font = display(900, 20);
  ctx.fillStyle = enraged ? `rgb(255,${Math.round(80 + 70 * pulse)},60)` : '#ff5442';
  ctx.fillText(enraged ? 'MC OLODO — VEX!' : 'MC OLODO', VIEW_W / 2, y - 8);
  ctx.font = uiFont(700, 10);
  ctx.fillStyle = 'rgba(207,216,234,0.8)';
  ctx.textAlign = 'right';
  ctx.fillText('AREA BOSS', x + w - 4, y - 8);
  ctx.textAlign = 'left';
  ctx.fillText('LAGOS ISLAND', x + 4, y - 8);
  ctx.restore();
  const fill = enraged ? `rgb(255,${Math.round(60 + 50 * pulse)},40)` : (frac > 0.35 ? '#ff5442' : '#ffd23f');
  drawBar(x, y, w, 14, frac, boss.hpShown / boss.maxHp, fill,
    { borderCol: enraged ? `rgba(255,180,90,${0.5 + 0.5 * pulse})` : 'rgba(255,120,90,0.6)' });
}

// Wave state: enemies-left tag while fighting, a pulsing GO â†’ arrow when the
// wall drops, the boss plate during the MC_Olodo fight, and an AREA CLEARED
// plate once he is down.
function drawWaveHud() {
  ctx.textBaseline = 'alphabetic';
  if (waveState === 'boss' && boss) {
    drawBossHud();
  } else if (waveState === 'fighting') {
    const left = Math.max(0, SECTIONS[section].quota - waveKills);
    ctx.textAlign = 'center';
    ctx.font = uiFont(700, 15);
    ctx.fillStyle = 'rgba(255,228,94,0.9)';
    ctx.fillText(`AREA ${section + 1} · ${left} LEFT`, VIEW_W / 2, 30);
  } else if (waveState === 'cleared') {
    const pulse = 0.5 + 0.5 * Math.sin(mobClock * 6);
    ctx.textAlign = 'right';
    ctx.font = display(900, 44);
    ctx.fillStyle = `rgba(255,228,94,${0.55 + 0.45 * pulse})`;
    const gy = VIEW_H / 2;
    ctx.fillText('GO', VIEW_W - 74, gy);
    ctx.font = display(900, 46 + pulse * 8);
    ctx.fillText('→', VIEW_W - 20, gy + 2);
  } else if (waveState === 'complete') {
    ctx.textAlign = 'center';
    ctx.font = display(900, 56);
    ctx.fillStyle = '#ffe45e';
    ctx.fillText('AREA CLEARED', VIEW_W / 2, VIEW_H / 2 - 6);
    ctx.font = uiFont(400, 16);
    ctx.fillStyle = '#cfd8ea';
    ctx.fillText('MC OLODO is down — Lagos Island is yours', VIEW_W / 2, VIEW_H / 2 + 30);
  }
  if (fightBanner > 0) {                 // overlays the live street; never a separate cutscene
    const k = Math.min(1, fightBanner / 0.25);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = k;
    ctx.font = uiFont(900, 64 + (1 - k) * 26);
    ctx.fillStyle = '#ffe45e';
    ctx.fillText('FIGHT!', VIEW_W / 2, VIEW_H / 2 + 8);
    ctx.restore();
  }
  ctx.textAlign = 'left';
}

// The entrance's furniture: letterbox bars, the name plate that slams in on the
// pose beat, and the FIGHT! pop as the bars pull back. Drawn over everything â€”
// the normal HUD is suppressed for the whole cutscene.
// Cinematic bars, 0 (open) â†’ 1 (fully closed). Shared by the entrance and the
// outro so both scenes are framed identically.
function drawLetterbox(amount) {
  drawLetterboxPx(CUT.barH * amount);
}

/* The same bars, told the DEPTH instead of a fraction of the cutscene depth.
 * The entry gate runs to VIEW_H/2 — nearly four times CUT.barH — so it cannot
 * express itself as an `amount` of that constant without the number meaning
 * something different at each call site.
 *
 * The warm hairline is faded out as the bars close past the hold depth: at full
 * black it would be two glowing lines across an otherwise empty screen, which
 * reads as a rendering fault rather than as a frame. */
function drawLetterboxPx(px) {
  const bars = Math.round(px);
  if (bars <= 0) return;
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, VIEW_W, bars);
  ctx.fillRect(0, VIEW_H - bars, VIEW_W, bars);
  const openness = Math.max(0, Math.min(1, (VIEW_H / 2 - bars) / (VIEW_H / 2 - LEVEL_ENTRY.gateBarH)));
  if (openness <= 0.01) return;
  ctx.fillStyle = `rgba(255,228,94,${0.16 * openness})`;
  ctx.fillRect(0, bars - 2, VIEW_W, 2);
  ctx.fillRect(0, VIEW_H - bars, VIEW_W, 2);
}

function drawCutscene() {
  drawLetterbox(cutscene.letterbox);

  // Name plate: slides in from the right on an overshoot, angled like an arcade
  // title card. `cutscene.plate` is 0 â†’ 1 â†’ 0 across the pose/ready beats.
  const p = cutscene.plate;
  if (p > 0.01) {
    const cy = VIEW_H * 0.5 + 22;
    const slide = (1 - p) * 460;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 1.3);
    ctx.translate(VIEW_W / 2 + slide, cy);
    ctx.rotate(-0.045);
    ctx.fillStyle = 'rgba(6,9,16,0.82)';
    ctx.fillRect(-330, -46, 660, 92);
    ctx.fillStyle = '#ff5442';
    ctx.fillRect(-330, -46, 660, 5);
    ctx.fillRect(-330, 41, 660, 5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffe45e';
    ctx.font = display(900, 58);
    ctx.fillText('MC OLODO', 0, 14);
    ctx.font = uiFont(700, 13);
    ctx.fillStyle = 'rgba(207,216,234,0.9)';
    ctx.fillText('AREA BOSS  ·  LAGOS ISLAND', 0, 36);
    ctx.restore();
  }

  const f = cutscene.fight;
  if (f > 0.01) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = f;
    ctx.font = display(900, 52 + f * 30);
    ctx.fillStyle = '#ffe45e';
    ctx.fillText('FIGHT!', VIEW_W / 2, VIEW_H / 2 + 8);
    ctx.restore();
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

// The ending now speaks the same language as the front end: its shared smoked
// glass, information gold, orange rule, condensed display face and circular
// network graph. The street remains underneath as the evidence layer.
function drawOutro() {
  const ui = frontEnd?.ui;
  if (!ui) return;
  const C = ui.C;

  /* Snapshot the defeated arena BEFORE the dark wash. The same shared glass
   * material as the menus then frosts the actual place the player just cleared,
   * not a flat black rectangle. */
  ui.beginFrame();
  ui.captureBackdrop();
  if (outro.wash > 0.01) {
    ctx.fillStyle = `rgba(3,5,9,${(0.84 * outro.wash).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ui.drawVignette();
  drawLetterbox(outro.letterbox);

  const c = outro.card;
  if (c <= 0.01) return;
  const name = outroPhase();
  const cardDur = OUTRO.phases.find((p) => p[0] === 'card')?.[1] ?? 0.85;
  const summaryT = name === 'card' ? outro.t : name === 'file' ? cardDur + outro.t : 0;
  const panelIn = (i) => Math.max(0, Math.min(1, (summaryT - 0.08 - i * 0.14) / 0.56));
  const ease = (v) => 1 - Math.pow(1 - Math.max(0, Math.min(1, v)), 3);

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = Math.min(1, c * 1.25);

  /* Header: the exact information hierarchy used by the menu and pause screen,
   * replacing the old skewed CASE CLOSED plate. */
  const head = ease(Math.min(1, summaryT / 0.46));
  ctx.save();
  ctx.globalAlpha *= head;
  ctx.translate((1 - head) * -20, 0);
  ctx.textAlign = 'left';
  ui.setFont(700, 11, 4);
  ctx.fillStyle = C.gold;
  /* Both strings come out of the story data through the identity resolver, so
   * the card cannot drift from the level table and cannot render a development
   * tag â€” see the fiction firewall in story.js. */
  ctx.fillText(`${LEVELS[1].code}  /  ${LEVELS[1].title}`, 58, 123);
  ui.setDisplay(700, 47, 1.7);
  ctx.fillStyle = C.paper;
  ctx.fillText(`${resolveIdentity('olodo').shortName} DEFEATED`, 56, 174);
  ctx.fillStyle = C.orange;
  ctx.fillRect(58, 190, 78, 3);
  ui.setFont(500, 12.5, 0.2);
  ctx.fillStyle = C.muted;
  ctx.fillText('The street-tax route is broken. The ledger points further up the chain.', 58, 213);
  ctx.restore();

  const drawPanel = (i, box, draw) => {
    const u = panelIn(i);
    if (u <= 0) return;
    const e = ease(u);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, u * 1.8);
    ctx.translate(cx, cy + (1 - e) * 15);
    ctx.scale(0.94 + 0.06 * e, 0.94 + 0.06 * e);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  };

  const status = { x: 58, y: 238, w: 410, h: 334 };
  drawPanel(0, status, () => {
    ui.glass(status.x, status.y, status.w, status.h, 10,
      { tint: 'rgba(9,13,20,0.76)', border: 'rgba(95,184,126,0.28)' });
    ui.icon('check', status.x + 29, status.y + 29, 16, C.green, 0.95);
    ctx.textAlign = 'left';
    ui.setFont(700, 10.5, 2.8);
    ctx.fillStyle = C.green;
    ctx.fillText('MISSION COMPLETE', status.x + 47, status.y + 33);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(status.x + 22, status.y + 51, status.w - 44, 1);

    const rows = [
      ['TARGET', 'MC OLODO'],
      ['STATUS', 'DEFEATED'],
      ['ENEMIES DEFEATED', String(levelKills)],
      ['DARKI HEALTH', `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`],
      ['DIFFICULTY', chosenDifficulty],
      ['EVIDENCE', 'COLLECTION LEDGER'],
    ];
    let y = status.y + 82;
    for (const [label, value] of rows) {
      ui.setFont(700, 9.5, 1.8);
      ctx.fillStyle = C.muted;
      ctx.fillText(label, status.x + 24, y);
      ctx.textAlign = 'right';
      ui.setFont(650, 12.5, 0.45);
      ctx.fillStyle = label === 'STATUS' ? C.green : label === 'TARGET' ? C.gold : C.paper;
      ctx.fillText(value, status.x + status.w - 24, y);
      ctx.textAlign = 'left';
      if (y < status.y + 257) {
        ctx.fillStyle = 'rgba(255,255,255,0.055)';
        ctx.fillRect(status.x + 24, y + 14, status.w - 48, 1);
      }
      y += 39;
    }

    ui.setFont(700, 8.5, 2.1);
    ctx.fillStyle = C.dim;
    ctx.fillText(CASE_FILE.no, status.x + 24, status.y + status.h - 22);
    ctx.textAlign = 'right';
    ctx.fillText(CASE_FILE.where, status.x + status.w - 24, status.y + status.h - 22);
    ctx.textAlign = 'left';
  });

  /* THE BAG, NOT THE BOARD.
   *
   * This panel used to be the network graph and the next target. It cannot be:
   * the player has just this second won the fight, and the whole point of the
   * beat that follows is that they do not yet know what Olodo was carrying.
   * What belongs here is the haul â€” sealed, unread, three items and a prompt.
   * The analysis, the connections and the name are all on the other side of X.
   */
  const bag = { x: 486, y: 238, w: 736, h: 334 };
  drawPanel(1, bag, () => {
    ui.glass(bag.x, bag.y, bag.w, bag.h, 10,
      { tint: 'rgba(9,13,20,0.76)', border: 'rgba(233,182,84,0.22)' });
    ctx.textAlign = 'left';
    ui.setFont(700, 10.5, 3.0);
    ctx.fillStyle = C.gold;
    ctx.fillText('EVIDENCE RECOVERED', bag.x + 28, bag.y + 35);
    ctx.textAlign = 'right';
    ui.setFont(700, 9, 2.0);
    ctx.fillStyle = C.muted;
    ctx.fillText('3 ITEMS  ·  SEALED', bag.x + bag.w - 28, bag.y + 35);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(bag.x + 28, bag.y + 51, bag.w - 56, 1);

    ui.setFont(500, 12, 0.15);
    ctx.fillStyle = C.text;
    ctx.fillText('Taken from Olodo’s possessions at the scene. Nothing has been read yet.', bag.x + 28, bag.y + 78);

    const items = [
      ['bell', 'PHONE HANDSET', 'Recording recovered · not yet reviewed'],
      ['users', 'WITNESS STATEMENTS', 'Taken at the scene · unverified'],
      ['map', 'CASE DOCUMENTS', 'Sealed · not yet examined'],
    ];
    let y = bag.y + 112;
    items.forEach(([ico, title, note], i) => {
      const u = Math.max(0, Math.min(1, (summaryT - 0.45 - i * 0.22) / 0.5));
      if (u <= 0) return;
      ctx.save();
      ctx.globalAlpha *= ease(u);
      ctx.translate((1 - ease(u)) * -14, 0);
      ui.roundRectPath(ctx, bag.x + 28, y, bag.w - 56, 60, 6);
      ctx.fillStyle = 'rgba(233,182,84,0.05)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(233,182,84,0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ui.icon(ico, bag.x + 60, y + 30, 18, C.gold, 0.85);
      ui.setFont(700, 12.5, 1.6);
      ctx.fillStyle = C.paper;
      ctx.fillText(title, bag.x + 88, y + 26);
      ui.setFont(500, 11, 0.2);
      ctx.fillStyle = C.muted;
      ctx.fillText(note, bag.x + 88, y + 45);
      ctx.textAlign = 'right';
      ui.setFont(700, 8.6, 1.8);
      ctx.fillStyle = C.gold;
      ctx.fillText('UNANALYSED', bag.x + bag.w - 46, y + 34);
      ctx.textAlign = 'left';
      ctx.restore();
      y += 70;
    });
  });

  /* The one thing the player has to do. It does not appear until the card has
   * finished arriving â€” a prompt racing the panels it sits under reads as the
   * screen hurrying you past something you were still reading. */
  const footer = ease(Math.max(0, Math.min(1, (summaryT - 1.28) / 0.62)));
  ctx.save();
  ctx.globalAlpha *= footer * (0.68 + 0.32 * (0.5 + 0.5 * Math.sin(mobClock * 2.7)));
  ctx.textAlign = 'center';
  ui.setFont(700, 12, 3.4);
  ctx.fillStyle = C.gold;
  ctx.fillText('PRESS X TO ANALYZE EVIDENCE', VIEW_W / 2, 612);
  ctx.restore();
  ctx.textAlign = 'left';
  ui.drawControlBar([{ icon: 'cross', label: 'ANALYZE EVIDENCE' }]);

  ui.drawGrain(0.55);
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}
/* ------------------------------------------------------------ pause menu
 * Drawn here rather than in the front end because a pause screen over a fight
 * has to keep the frame the player stopped on â€” a menu background behind it
 * would throw that away. It is NOT a second look, though: every widget is the
 * REAL front-end widget, borrowed through `frontEnd.ui` (same ctx, same
 * palette, same focus easing, same navigation cues), so the pause menu and the
 * main menu cannot drift apart. */
let pauseT = 0;                  // entry animation clock, reset on every pause

/* A labelled bar in the same idiom as the OPTIONS sliders. */
function pauseMeter(ui, label, value, frac, x, y, w, accent) {
  const f = Math.max(0, Math.min(1, frac));
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ui.setFont(700, 10.5, 2.6);
  ctx.fillStyle = ui.C.muted;
  ctx.fillText(label, x, y);
  ctx.textAlign = 'right';
  ui.setFont(700, 13, 0.6);
  ctx.fillStyle = accent;
  ctx.fillText(value, x + w, y);
  const by = y + 13;
  ui.roundRectPath(ctx, x, by, w, 6, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fill();
  if (f > 0) {
    ui.roundRectPath(ctx, x, by, Math.max(6, w * f), 6, 3);
    ctx.fillStyle = accent;
    ctx.fill();
  }
}

function pauseInfoRow(ui, label, value, x, y, w) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ui.setFont(700, 10.5, 2.6);
  ctx.fillStyle = ui.C.muted;
  ctx.fillText(label, x, y);
  ctx.textAlign = 'right';
  ui.setFont(600, 14, 0.8);
  ctx.fillStyle = ui.C.paper;
  ctx.fillText(value, x + w, y);
}

function drawPauseOverlay() {
  const ui = frontEnd?.ui;
  if (!ui) return;                                    // front end owns the widgets
  const C = ui.C;
  const k = Math.min(1, pauseT / 0.26);
  const ease = 1 - Math.pow(1 - k, 3);

  ui.beginFrame();                                    // this frame owns the hitbox list

  /* The frozen fight stays on screen, dimmed and vignetted, and the snapshot
   * below is what the glass panels frost â€” so the panes show the real fight
   * behind them rather than a flat colour. */
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = `rgba(3,5,9,${0.70 * ease})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ui.drawVignette();
  ui.captureBackdrop();

  /* Header, on screenHead's exact metrics so it lines up with every other
   * screen in the game to the pixel. */
  ctx.save();
  ctx.translate((1 - ease) * -14, 0);
  ctx.globalAlpha = ease;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ui.setFont(700, 11, 4);
  ctx.fillStyle = C.gold;
  ctx.fillText('LEVEL 01  /  THE STREET TAX', 58, 58);
  ui.setDisplay(700, 40, 1.4);
  ctx.fillStyle = C.paper;
  ctx.fillText('PAUSED', 56, 104);
  ctx.fillStyle = C.orange;
  ctx.fillRect(58, 118, 62, 3);
  ui.setFont(500, 13, 0.2);
  ctx.fillStyle = C.muted;
  ctx.fillText('The fight is holding. Pick up where you left off.', 58, 142);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = ease;
  ctx.translate(0, (1 - ease) * 16);

  /* The list, left â€” the same button() every menu row in the game is drawn by. */
  const bx = 58, by = 196, bw = 430, bh = 52, gap = 10;
  for (let i = 0; i < PAUSE_MENU.length; i++) {
    ui.button({
      id: `pause:${i}`,
      x: bx, y: by + i * (bh + gap), w: bw, h: bh,
      label: PAUSE_MENU[i].label,
      icon: PAUSE_MENU[i].icon,
      focused: i === pauseChoice,
      index: i,
    });
  }

  /* Fight status, right â€” the list/detail split the OPTIONS screen uses. */
  const px = 528, py = 196, pw = 694, ph = 300;
  ui.glass(px, py, pw, ph, 10);
  const ix = px + 28, iw = pw - 56;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ui.setFont(700, 11, 4);
  ctx.fillStyle = C.gold;
  ctx.fillText('FIGHT STATUS', ix, py + 38);

  const hpFrac = player.maxHp > 0 ? player.hp / player.maxHp : 0;
  pauseMeter(ui, 'DARKI', `${Math.ceil(player.hp)} / ${player.maxHp}`, hpFrac,
    ix, py + 80, iw, hpFrac > 0.35 ? C.green : C.red);
  pauseMeter(ui, player.rageActive ? 'RAGE  —  ACTIVE' : 'RAGE',
    `${Math.round((player.rage / RAGE_MAX) * 100)}%`, player.rage / RAGE_MAX,
    ix, py + 136, iw, player.rageActive ? C.orange : C.gold);

  const bossStage = inBossStage() || waveState === 'complete';
  const quota = SECTIONS[section] ? SECTIONS[section].quota : 0;
  pauseInfoRow(ui, 'OBJECTIVE',
    bossStage ? 'BOSS  /  MC OLODO' : `CLEAR THE BLOCK  —  ${waveKills} / ${quota}`,
    ix, py + 200, iw);
  pauseInfoRow(ui, 'ARENA', `${Math.min(section + 1, SECTIONS.length)} OF ${SECTIONS.length}`,
    ix, py + 232, iw);
  pauseInfoRow(ui, 'DIFFICULTY', chosenDifficulty, ix, py + 264, iw);

  ctx.restore();
  ctx.restore();

  ui.drawControlBar([
    { icon: 'dpad', label: 'NAVIGATE' },
    { icon: 'cross', label: 'SELECT', color: '#8fb4ff' },
    { icon: 'circleBtn', label: 'RESUME', color: '#ff8f8f' },
  ]);
  ui.drawGrain();

  /* Handed back the way the rest of game.js expects to find it. */
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}
function draw() {
  /* CLEAR THE INHERITED LETTER-SPACING. This is not cosmetic tidying.
   *
   * `ctx.letterSpacing` is sticky context state, exactly like fillStyle — and
   * the front end's setFont sets it on every headline it draws. game.js sets
   * `ctx.font` directly and never touched it, so whatever tracking the last
   * menu draw left behind was still applied to every string the HUD drew.
   * Measured at 3px leaking into the fight, which on the 205-character controls
   * crib is ~615px of pure air; it was the larger half of that line running off
   * the screen. The game asks for tracking nowhere, so it is zeroed once a
   * frame, at the top, rather than defended against at 30 call sites. */
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const { sx, sy } = shakeOffset();
  // The execution's screen-space impulse rides on the same translate as the
  // shake and the same restore undoes it. It is a frame offset, NOT a camera
  // move: cameraX/cameraY are untouched, so the locked boss-room framing stays
  // locked and nothing that reads the camera (parallax, culling, world->screen)
  // sees anything at all.
  const imp = execImpulseOffset();
  ctx.save();
  ctx.translate(sx + imp.x, sy + imp.y - cameraY);   // cameraY is 0 on single-screen levels
  drawSky();
  drawSkyline();
  drawBackdrop();
  drawSidewalkBand();
  drawFrontage();
  drawRoad();
  drawActors();
  drawSparks();
  ctx.restore();
  drawExecEmphasis();                      // vignette closes on a graded blow
  drawExecBrutalityDim();                  // â€¦and the reward round drops the lights
  drawFlash();                             // full-frame impact/rage wash
  if (levelEntry.active) drawLevelEntry(); // the dossier dissolves over the empty live street
  else if (cutscene.active) drawCutscene();     // the entrance owns the frameâ€¦
  // â€¦the mission card closes it, and the post-mission sequence takes the frame
  // from there. Only one of the two draws: the analysis screens replace the card
  // outright rather than being layered over a frosted arena nobody can see.
  else if (aftermath.owningFrame) aftermath.draw();
  else if (outro.active) drawOutro();
  // The HUD steps aside for the pause screen rather than showing through it: the
  // health bar sits exactly where the PAUSED title goes, and the pause panel
  // already reports HP, rage and the objective in a form you can actually read.
  else if (!paused) drawHud();             // HUD stays steady (not shaken)
  // The finisher's own UI sits above the HUD and outside the shake, for the same
  // reason the HUD does: a prompt you have to read must not be moving. It stands
  // down while frozen for the same reason the HUD does.
  if (execution && !paused) { drawExecButton(execution); drawExecPerfHud(execution); drawExecBrutalityLabel(); }
  if (!paused) { drawExecResult(); drawExecDebug(); }
  if (paused) drawPauseOverlay();
}

/* ----------------------------------------------------------------- boot */

// dev hook (manual Â§3: development HUD/state must be inspectable)
window.__ror = {
  player, input, tune,
  /* THE boot gate for every harness. `#loading` hidden now only means the front
   * end is up â€” the level's sheets are still arriving behind the menu â€” so a
   * test that drives the sim must wait on this instead. */
  get worldReady() { return worldReady; },
  /* Which typeface the canvas is ACTUALLY rasterising. A screenshot cannot tell
   * Montserrat from a system sans at a glance, and a font that failed to load
   * does not throw — it just quietly looks like something else. */
  get font() { return fontState(); },
  get worldProgress() { return Math.min(1, worldLoaded / WORLD_STEPS); },
  get worldError() { return worldError ? worldError.message : null; },
  get prepMaxSlice() { return Math.round(prepMaxSlice); },   // longest block the prep held the thread
  get sprites() { return { sprite, idleSprite, uppercutSprite, jabLeftSprite, highKickSprite, backKickSprite, comboSprite, combatWalkSprite,
    hitSprite, hitLiftSprite, hitAirSprite, fallSprite, blockSprite,
    gingerWalkSprite, gingerJabSprite, gingerKickSprite,
    olodoStanceSprite, olodoSpecialSprite, olodoHookSprite, olodoFallSprite }; },
  get enemies() { return enemies; },
  get cameraX() { return cameraX; },
  get cameraY() { return cameraY; },
  get camLook() { return camLook; },
  get camBias() { return camBias; },
  get tokens() { return attackTokens.size; },
  get viewW() { return VIEW_W; },
  get enemyCfg() { return ENEMY; },
  // Drop into a given section's arena, empty, with the wave live. Section 0 is
  // only 1500 wide and `updateCamera` pins the view's right edge to the gate
  // while fighting, so there is barely 60px of street visible ahead of a player
  // stood at the wall â€” far too tight to watch a walk-in happen. Anything
  // testing arrival behaviour wants a band with room in it.
  toSection(i) {
    section = Math.max(0, Math.min(BOSS_SECTION - 1, i));
    waveKills = 0;
    waveState = 'fighting';
    mobs().forEach(benchEnemy);
    player.x = sectionLeft() + 200;
    player.y = clampLane(GROUND_Y + 20);
    cameraX = Math.max(0, Math.min(WORLD_W - VIEW_W, player.x - VIEW_W * 0.42));
    return { section, gate: currentGate(), left: sectionLeft(), playerX: player.x };
  },
  // Snap the camera to a player x without waiting out the damped follow. A walk-in
  // test has to move the CAMERA, because "off screen" is measured against its edge.
  cameraTo(x) { cameraX = Math.max(0, Math.min(WORLD_W - VIEW_W, x - VIEW_W * 0.42)); return cameraX; },
  // Stage a walk-in directly, so a scenario does not have to clear a whole wave
  // to get one arriving body it can watch.
  stageEntrance(e, targetX, delay = 0) { stageEnemyEntrance(e, targetX, delay); return e.id; },
  // Land a blow on an enemy through the real damage path (hitEnemy), so the
  // reaction, the launch and the entrance hand-off are the ones the game uses.
  hurtEnemy(e, damage = 20, launch = false) {
    hitEnemy(e, { damage, rage: 0, hitstop: 0, shake: 0, launch,
      kb: launch ? { x: 300, y: -640 } : { x: 90, y: 0 } });
    return { hp: e.hp, state: e.state };
  },
  // The walk-in, as numbers. A screenshot cannot tell "he is strolling to a spot
  // behind me" from "he is closing on me" â€” these can.
  get entrances() {
    return enemies.filter((e) => !e.boss && !e.benched).map((e) => ({
      id: e.id, entry: !!e.spawnEntry, mode: e.mode, state: e.state,
      x: Math.round(e.x), targetX: Math.round(e.spawnTargetX),
      delay: +(e.spawnDelay ?? 0).toFixed(2),
      dxPlayer: Math.round(e.x - player.x), facing: e.facing,
      onCamera: e.x > cameraX - 60 && e.x < cameraX + VIEW_W + 60,
    }));
  },
  get hitStop() { return hitStopTimer; },
  get shake() { return shakeTimer; },
  get sparkCount() { return sparks.length; },
  get flash() { return flashTimer; },
  get sfxHits() { return sfxHits; },        // # of hit-SFX triggers (wiring check)
  get sfxLoaded() { return hitBuffers.length; },
  // What the bag ACCEPTED, and what it threw away for being empty. A clip that
  // decodes to silence passes every other check there is, so this is the only
  // place a test can see it.
  get sfxSilentClips() { return silentClips.slice(); },
  get sfxPeaks() { return hitBuffers.map((b) => +bufferPeak(b).toFixed(4)); },
  // The buffer objects themselves, so a harness that has instrumented
  // `AudioBufferSourceNode.start` can tell "the kick played a hit clip" from
  // "the kick played a groan" by identity rather than by guessing at durations.
  get sfxBag() { return hitBuffers.slice(); },
  get sfxImpacts() { return sfxImpacts; },  // # of Impact_hit triggers (Darki was hit)
  get impactLoaded() { return !!impactBuffer; },
  get sfxBlocks() { return sfxBlocks; },    // # of guard-absorb cues
  get sfxSwings() { return sfxSwings; },    // # of enemy attack swings
  get sfxSteps() { return sfxSteps; },      // # of footfalls (counts when silent)
  get sfxDarkiSteps() { return sfxDarkiSteps; },   // â€¦of which are Darki's
  get sfxThuds() { return sfxThuds; },      // # of bodies hitting the tarmac
  get stepsLoaded() { return STEP_SRCS.filter((_, i) => stepBuffers[i]).length; },
  get thudLoaded() { return !!thudBuffer; },
  get footfalls() { return FOOTFALLS; },
  /* HIS plant table, not the enemies'. Exposed so "the rush animation was not
   * modified" can be asserted rather than promised — the speed layer added on
   * top of it must not have moved a frame, an fps or a contact. */
  get darkiFootfalls() { return DARKI_FOOTFALLS; },
  playerAnim(name) {
    const spec = playerAnimSpec(spriteFor(name), name);
    return spec ? { frames: spec.frames.slice(), fps: spec.fps, loop: spec.loop !== false } : null;
  },
  get bounceTable() { return { hops: BOUNCE, total: BOUNCE_TOTAL }; },
  get fallVary() { return FALL_VARY; },
  // --- executions ---
  get executions() { return EXECUTIONS; },
  get execGrid() { return EXEC_GRID; },
  get execSheetsReady() { return !!execAttackerImg && !!execVictimImg; },
  get execArtReady() {
    const out = {};
    for (const [id, d] of Object.entries(EXECUTIONS)) out[id] = execArtReady(d);
    return out;
  },
  // The dev readout the brief asks for, as data so the harness reads the same
  // numbers a debug overlay would print.
  get execState() {
    if (!execution) return null;
    const ex = execution;
    return { id: ex.def.id, t: +ex.t.toFixed(3), duration: +EXEC_DUR(ex.def).toFixed(3),
      frame: execFrame(), fired: [...ex.fired],
      victimId: ex.victim?.id, victimHp: +(ex.victim?.hp ?? 0).toFixed(1),
      anchorX: Math.round(ex.anchorX), anchorY: Math.round(ex.anchorY), facing: ex.facing,
      playerState: player.state, victimSuspended: !!ex.victim?.execVictim,
      // `rawFrame` vs `frame` is the frame hold: they differ only while the
      // picture is held, and `t` marches on regardless â€” which is the property
      // the sync tests assert on.
      rawFrame: execRawFrame(), hold: +ex.holdT.toFixed(3),
      // The reward round, as its own phase and its own clock. `t` above is still
      // the first pass's monotonic clock; this is the one driving the picture
      // while `phase` reads 'brutality'.
      phase: ex.bru ? 'brutality' : 'main',
      bruT: ex.bru ? +ex.bru.t.toFixed(3) : null,
      bruFrom: ex.bru ? +ex.bru.from.toFixed(3) : null,
      bruRate: ex.bru ? ex.bru.rate : null,
      // The victim's recoil, in local draw px â€” the one offset that separates the
      // two layers. Reported so a test can assert it fires on a graded blow and
      // is BACK TO ZERO afterwards, which is what makes it a reaction rather than
      // a drift in the choreography.
      recoil: +(execRecoilT > 0 ? execVictimRecoilOffset().x : 0).toFixed(2) };
  },

  // --- the interactive layer ---
  get execPerf() {
    if (!execution) return null;
    const ex = execution;
    return {
      score: Math.round(ex.perf.score), chain: ex.perf.chain,
      perfect: ex.perf.perfect, good: ex.perf.good, miss: ex.perf.miss,
      finalGrade: ex.finalGrade,
      open: ex.cps.find((c) => c.state === 'open')?.id ?? null,
      cps: ex.cps.map((c) => ({
        id: c.id, at: +c.at.toFixed(3), opens: +c.opens.toFixed(3), closes: +c.closes.toFixed(3),
        seq: c.def.seq.slice(), state: c.state, typed: c.typed.slice(),
        grade: c.grade, err: c.err == null ? null : +c.err.toFixed(3),
      })),
    };
  },
  get execResult() { return lastExecResult; },
  get execPerfConfig() { return EXEC_PERF; },
  get execTokens() { return EXEC_TOKENS; },
  // Press a checkpoint token through the REAL input edge, so a test drives the
  // same path a keyboard, a mouse or a pad does. `pressExecToken('X')` with an
  // unknown token deliberately presses nothing â€” use pressWrong() for that case.
  pressExecToken(tok) {
    const t = EXEC_TOKENS[tok];
    if (!t) return false;
    input[t.flag] = true;
    return true;
  },
  // A button that is not in any sequence â€” the "wrong button" case.
  pressWrongExecToken() { input.kickPressed = true; },
  canExecute(e) { return canExecute(e ?? enemies.find((x) => x.boss)); },
  execWhyNot(e) { return execWhyNot(e ?? enemies.find((x) => x.boss)); },
  // The COMBO route's reason, which is a different question from the manual one:
  // that route is exempt from the health and mid-move gates, so plain execWhyNot
  // reports `target-too-healthy` for a chain that was never asking about health.
  // Without this, a full string that failed to chain looked identical to one
  // rejected for being on a healthy boss.
  execWhyNotCombo(e) {
    return execWhyNot(e ?? enemies.find((x) => x.boss), EXECUTIONS.darki_olodo, { fromCombo: true });
  },
  get execPrompt() {
    return execPromptTarget
      ? { id: execPromptTarget.id, padSeen, def: execPromptDef?.id ?? null } : null;
  },
  execTarget() { const t = execTarget(); return t ? t.id : null; },
  tryExecute() { const t = execTarget(); return t ? startExecution(t) : false; },
  // --- the same three questions, asked of ANY pairing by id. The four hooks
  // above are hard-wired to darki_olodo and stay that way: the existing suites
  // are written against them, and re-pointing them at whatever the manual press
  // currently prefers would silently change what those tests are testing.
  get execDefs() { return Object.keys(EXECUTIONS); },
  execWhyNotDef(defId, e) {
    const def = EXECUTIONS[defId];
    if (!def) return 'no-such-def';
    return execWhyNot(e ?? enemies.find((x) => x.boss), def);
  },
  execTargetDef(defId) {
    const def = EXECUTIONS[defId];
    if (!def) return null;
    const t = execTarget(def);
    return t ? t.id : null;
  },
  tryExecuteDef(defId, e) {
    const def = EXECUTIONS[defId];
    if (!def) return false;
    const t = e ?? execTarget(def);
    return t ? startExecution(t, def) : false;
  },
  // The COMBO route's entry point. It was only reachable by landing five real
  // hits, so "which pairing does the chain play" had no way to be asserted â€” and
  // that became a question worth asking the moment a second pairing could match
  // the boss. Starts exactly what the fifth hit starts, hp-exemption included.
  execFromCombo(e) {
    const t = e ?? enemies.find((x) => x.boss);
    return t ? startExecution(t, EXECUTIONS.darki_olodo, { fromCombo: true }) : false;
  },
  // What the L2 press would actually do right now â€” the resolver the prompt and
  // the press share, reported without firing either.
  execManualPick() {
    const p = execManualPick();
    return p ? { def: p.def.id, target: p.target.id } : null;
  },
  tryExecuteManual() {
    const p = execManualPick();
    return p ? startExecution(p.target, p.def) : false;
  },
  // The sheet's shape, per pairing, so a test can assert the 9x8/69-cell grid is
  // the one actually driving the frame index rather than the 13x12 default.
  // NOT named `execGrid`: there is already a no-arg getter by that name above,
  // and a second key of the same name in this literal would silently shadow it.
  execGridOf(defId) { return { ...execGrid(EXECUTIONS[defId]) }; },
  abortExecution() { endExecution({ killed: false }); },
  pressExecute() { input.executePressed = true; },
  // --- tuning actions (Â§20). Restart, jump to a checkpoint, jump to the final
  // blow. All three move the CLOCK and nothing else, which is the only honest way
  // to scrub a system whose entire design is "one clock drives everything": the
  // events, the windows and both sheets are all functions of `ex.t`, so winding it
  // forward reproduces exactly the state that time would have produced. Nothing
  // here reaches into the sequence to set a frame or fire an event by hand.
  execRestart() {
    const t = execution?.victim ?? execTarget();
    endExecution({ killed: false });
    if (!t) return false;
    // endExecution now leaves a SURVIVED victim on the tarmac (see the fall-sheet
    // handoff), and `canExecute` refuses a man who is down â€” correctly, since you
    // cannot grab someone off the floor. So a dev restart has to stand him back
    // up first. This is the only place in the game that does that, and it is a
    // tuning action rather than a game rule: without it, `execRestart` silently
    // returned false on every call after the first.
    t.state = 'walk';
    t.mode = t.boss ? 'idle' : 'menace';
    t.downTimer = 0; t.koTimer = 0; t.jumpY = 0; t.vx = 0; t.vy = 0;
    t.dying = false; t.dead = false; t.alpha = 1;
    return startExecution(t, EXECUTIONS.darki_olodo, { fromCombo: true });
  },
  // Park the clock just before a checkpoint opens, so the next thing that happens
  // is that window. Returns the time it landed on, or null.
  execSkipTo(cpId) {
    if (!execution) return null;
    const cp = execution.cps.find((c) => c.id === cpId);
    if (!cp) return null;
    // Backwards is refused rather than silently ignored: the sequence has no
    // reverse (events fire on a crossing and `fired` never un-sets outside the
    // reward round), so a "skip" that went back would desync the two.
    const to = Math.max(execution.t, cp.opens - 0.05);
    execution.t = to;
    return +to.toFixed(3);
  },
  // â€¦and straight to the uppercut, for tuning the one blow everyone watches.
  execFinalBlow() {
    if (!execution) return null;
    const ev = execution.def.events.find((e) => e.type === execution.lastDmgType);
    if (!ev) return null;
    const to = Math.max(execution.t, ev.f / execution.def.fps - 0.05);
    execution.t = to;
    return +to.toFixed(3);
  },
  // Run one gamepad poll. `step()` deliberately does NOT poll (the harnesses
  // drive `input` straight), which means the whole pad path â€” every button
  // binding in the game â€” was unreachable from a test. With a stubbed
  // navigator.getGamepads this makes the real bindings verifiable.
  pollPad() { pollGamepad(); },
  /* The 5-hit combo's pending edge. Exposed for the one question a pad test
   * cannot otherwise ask: whether a shoulder press made on a MENU left a swing
   * queued up for the fight underneath it. */
  get comboArmed() { return input.comboPressed; },
  get upperArmed() { return input.upperPressed; },
  get downDur() { return DOWN_DUR; },        // crash + recovery, with no dwell
  bounceAt(t, scale = 1) { return bounceLift(t, scale); },   // test: sample the curve
  get fallSheetReady() { return !!gingerFallSprite; },
  get deathSheetReady() { return !!gingerDeathSprite; },
  get bossFallSheetReady() { return !!olodoFallSprite; },
  onFallSheet(e) { return onFallSheet(e); },
  bossFalling(e) { return bossFalling(e ?? enemies.find((x) => x.boss)); },
  // What the router picked for a body this frame, by name â€” the one readout that
  // says "he is on the fall sheet" rather than "he is in a fall state".
  animOf(e) { const a = enemyAnim(e ?? enemies.find((x) => x.boss)); return a?.name ?? null; },
  get fallDurations() {
    const b = enemies.find((x) => x.boss);
    return { mob: fallTimes({ boss: false }), boss: fallTimes({ boss: true }),
      bossDownTimer: b ? +(b.downTimer ?? 0).toFixed(3) : null };
  },
  // --- the cue table ---
  get sfxCues() { return sfxCues; },        // # of table cues fired (counts when silent)
  get sfxWhiffs() { return sfxWhiffs; },    // # of misses that made a sound
  get cuesLoaded() { return Object.keys(CUES).filter((k) => cueBuf[k]); },
  get cueFired() { return { ...cueFired }; },
  get cueTable() { return CUES; },
  // Deal from the live pools so a test can read the ORDER they produce â€” the
  // no-repeat claim is about order, so it has to be measured, not asserted.
  darkiStepOrder(n) { const o = []; for (let i = 0; i < n; i++) o.push(nextDarkiStep()); return o; },
  agberoHitOrder(n) { const o = []; for (let i = 0; i < n; i++) o.push(nextAgberoHit()); return o; },
  darkiHitOrder(n) { const o = []; for (let i = 0; i < n; i++) o.push(nextDarkiHit()); return o; },
  get darkiFootfalls() { return DARKI_FOOTFALLS; },
  /* The struggle bed, as a live readout rather than a fired-count: it is the one
   * cue in this game that can be WRONG BY STILL PLAYING, so a test needs to see
   * whether a node is open, not how many times one was opened. */
  get struggleAudio() { return { playing: !!struggleNode, wanted: struggleActive() }; },
  get airAttackArmed() { return !player.airAttackDone; },
  get blockConfigHitStop() { return { light: BLOCK.hitStop, heavy: BLOCK.hitStopHeavy }; },
  get hitStop() { return hitStopTimer; },
  get openWindow() { return player.openWindow; },
  get comboVoPlays() { return comboVoPlays; },   // # of full-combo taunt triggers
  get voiceLoaded() { return Object.keys(voiceBuffers).length; },
  get voicePlays() { return { ...voicePlays }; },
  get muted() { return audioMuted; },
  get musicReady() { return !!musicEl; },
  get musicOn() { return musicStarted; },
  get musicVol() { return musicVol; },
  kickMusic() { startMusic(); },                 // test: begin the loop
  tickMusic(dt) { updateMusic(dt); },            // test: advance the fade
  get rage() { return player.rage; },
  get rageActive() { return player.rageActive; },
  get paused() { return paused; },
  get waveState() { return waveState; },
  get levelEntry() {
    return { active: levelEntry.active, t: +levelEntry.t.toFixed(2), duration: levelEntry.duration,
             letterbox: +levelEntry.letterbox.toFixed(3),
             /* The cinematic prologue, in the terms the brief uses: how black
              * the screen is, how deep the gate is IN PIXELS (the number the
              * player actually sees — `letterbox` alone cannot tell full black
              * from a half frame), when the dialogue is due, and whether it has
              * gone. */
             blackout: +levelEntry.blackout.toFixed(3),
             barPx: Math.round(entryBarPx()),
             lead: +levelEntry.lead.toFixed(3),
             voiceStarted: levelEntry.voiceStarted,
             /* The RAW ramp under the eased bar. `letterbox` alone cannot say
              * whether the curve is doing its job — the two being equal would
              * mean no easing at all — so a test can compare them. */
             barU: +(levelEntry.barU ?? 1).toFixed(3),
             cameraY: Math.round(cameraY) };
  },
  get entryConfig() { return LEVEL_ENTRY; },
  /* The letterbox curve, as numbers a test can assert the SHAPE of. */
  get barEase() { return { influence: BAR_EASE, dur: BAR_DUR, at: (u) => easeBars(u) }; },
  /* Land the narrated walk-in on its mark immediately. A test that only wants
   * what happens AFTER the level starts should not have to render 19 seconds of
   * it, and it must not get there by setting fields by hand either â€” this is
   * the same finish the clock reaches. */
  skipLevelEntry() { if (levelEntry.active) finishLevelEntry(); return levelEntry.active; },
  /* â€¦and the other direction: run the narrated walk-in from the top, the same
   * call the case file's Cross makes. No transition frame, and a short duration
   * so a test is not sitting through the 18.8 s narration to watch four steps. */
  startEntry(duration = 6) { startLevelEntry(null, duration); return levelEntry.duration; },
  get section() { return section; },
  get waveKills() { return waveKills; },
  get gateX() { return currentGate(); },
  // --- boss / cutscene ---
  get boss() { return boss; },
  get bossConfig() { return BOSS; },
  get bossArena() { return BOSS_ARENA; },
  get cutscene() { return { ...cutscene, name: cutscene.active ? cutPhase() : null }; },
  get cutPhases() { return CUT.phases.map((p) => p[0]); },
  get fightBanner() { return fightBanner; },
  // --- the ending ---
  get outro() { return { ...outro, name: outro.active ? outroPhase() : null }; },
  get outroPhases() { return OUTRO.phases.map((p) => p[0]); },
  get evidence() { return { ...evidence, pose: evidence.active ? evidencePose() : null }; },
  get caseFile() { return CASE_FILE; },
  get levelKills() { return levelKills; },
  skipOutro() { skipOutro(); },
  /* ---- the post-mission sequence ------------------------------------------
   * The whole machine in one object. `state` is the name from STATES, and
   * `narrationT` is the clock every cue in the sequence is measured against â€”
   * between them a harness can say exactly which beat a frame belongs to. */
  get aftermath() {
    return {
      active: aftermath.active,
      owningFrame: aftermath.owningFrame,
      state: aftermath.state,
      narrationT: +aftermath.narrationT.toFixed(2),
      revealT: +aftermath.revealT.toFixed(2),
      cabalT: +aftermath.cabalT.toFixed(2),
      selection: aftermath.selection,
      pager: aftermath.pager,
      chain: aftermath.chain,
      file: aftermath.file,
      cases: aftermath.cases,
      chosen: aftermath.chosen,
      background: aftermath.backgroundState,
      beats: aftermath.beats,
      stats: aftermath.stats,
      trace: aftermath.trace,
    };
  },
  /* The evidence board's tracing cue table, kept OUT of `aftermath` above so the
   * every-beat screenshot walk's log stays readable. */
  get aftermathTrace() { return aftermath.traceSchedule; },
  /* Press it the way the player does â€” one door, so a test cannot reach a
   * transition the keyboard and the pad cannot. */
  afterPress(action) { return aftermath.press(action); },
  /* The fiction firewall, checkable from a harness: every string the story
   * data can render, walked for development tags. */
  storyAudit() { return auditPlayerStrings(); },
  leaks(text) { return containsInternalReference(text); },
  /* Straight to the ending without fighting the boss: the same death path the
   * fight takes, then the skip the ending already supports. */
  killBoss() {
    if (!boss) return null;
    boss.active = false;
    boss.hp = 0;
    launchEnemy(boss, { x: 180, y: -330 }, 1, 0, true);
    return waveState;
  },
  // Jump straight to the boss room and cue the entrance (skips the three waves).
  toBoss() {
    section = BOSS_SECTION - 1;
    waveState = 'cleared';
    for (const e of mobs()) benchEnemy(e);
    player.x = SECTIONS[BOSS_SECTION - 1].gateX;
    player.y = clampLane(GROUND_Y + 20);
    cameraX = Math.max(0, Math.min(WORLD_W - VIEW_W, player.x - VIEW_W * 0.42));
    advanceSection();
    return waveState;
  },
  skipCutscene() { skipCutscene(); },
  bossCombo() { if (boss && boss.active && boss.mode !== 'special') startBossCombo(boss); },
  // â€¦and the two new moves, for tests that want one specifically
  bossHook() { if (boss && boss.active && boss.mode !== 'special') startBossMove(boss, 'hook'); },
  bossSuper() { if (boss && boss.active && boss.mode !== 'special') startBossMove(boss, 'hookSuper'); },
  get bossMove() { return boss && boss.move ? { name: boss.moveName, laps: boss.move.laps ?? null,
    steps: boss.move.frames.length, windup: boss.move.windup, sheet: boss.move.sheet,
    hits: Object.entries(boss.move.hits).map(([s, k]) => [Number(s), k]) } : null; },
  get bossIntent() { return boss ? boss.intent : null; },
  get rngDraws() { return rngDraws; },      // gameplay RNG draws so far (FX excluded)
  get bossSuperCooldown() { return boss ? boss.superCooldown : null; },
  // test/debug helpers
  // drop the walls for cam/move tests â€” the LAST MOB section, so the boss room
  // is never entered by a test that only wanted free movement
  freeRoam() { section = BOSS_SECTION - 1; waveState = 'complete'; },
  resetClicks() { lmbCount = 0; lmbLastT = -1; },   // clear the rapid-LMB combo counter between tests
  // Force-end any move and drop any hold. Test scenarios that stop stepping
  // mid-grab would otherwise leave `grabbedEnemy` dangling into the next one.
  clearGrab() { endAttack(); },
  tko() { const e = enemies.find((x) => !x.benched && x.hp > 0); if (e) onEnemyDefeated(Object.assign(e, { hp: 0 })); return waveState; },
  leftJab() { input.leftJabPressed = true; },
  kick() { input.kickPressed = true; },        // RMB (high kick, or back kick if back held)
  highKick() { input.left = input.right = false; input.kickPressed = true; },
  backKick() { input.kickPressed = true; if (player.facing >= 0) input.left = true; else input.right = true; },
  combo() { input.comboPressed = true; },
  grab() { input.grabPressed = true; },
  get grabbed() { return grabbedEnemy; },              // held enemy, or null
  get grabConfig() { return GRAB; },
  get comboConfig() { return MCOMBO; },
  get grabFinishConfig() { return ATTACKS.grabUppercut.grabFinish; },
  get grabState() { return grabState; },               // explicit state machine
  // --- pickup / carry / throw (hold L2) ---
  get carried() { return carriedEnemy; },              // carried enemy, or null
  get carryState() { return carryState; },             // explicit state machine
  get carryConfig() { return CARRY; },
  get carrying() { return player.carrying; },
  get carryHoldT() { return player.carryHoldT; },
  get carryPower() {
    return player.carrying ? carryPower() : player.carryThrowPower;
  },
  get carryTargets() { return enemies.filter((e) => isGrabbable(e)); },
  // Drives the whole mechanic from a test without a pad: press, hold, release.
  holdCarry(on = true) { kbHeld.execute = !!on; input.executeHeld = !!on;
    if (on) input.executePressed = true; },
  releaseCarry() { kbHeld.execute = false; input.executeHeld = false; },
  thrownBodies() { return enemies.filter((e) => e.thrownByCarry); },
  // --- RUSH (forward, forward) ---
  get rushState() { return rushState; },
  // The arena's full width, so a harness can tell "he ran out of road" from "the
  // feature stopped him" without hardcoding 5600 in every suite that measures
  // travel. (ragerushverify already reached for this and got undefined.)
  get worldW() { return WORLD_W; },
  get playerTune() { return { ...PLAYER }; },
  get rushTarget() { return rushTargetRef; },
  get rushConfig() { return RUSH; },
  get rushWindowT() { return player.rushWindowT; },
  // --- the sprint gauge ---
  get rushStamina() { return player.rushStam; },
  get rushInexhaustible() { return rushInexhaustible(); },
  get rushFreeMaxTime() { return rushFreeMaxTime(); },
  get rageDur() { return RAGE_DUR; },
  get rushWinded() { return player.rushWinded; },
  get rushStamDelay() { return player.rushStamDelay; },
  get rushDeniedT() { return player.rushDeniedT; },
  // Set the gauge directly so a test can stage "nearly empty" without having to
  // burn it down in real time first.
  setRushStamina(v, opts = {}) {
    player.rushStam = Math.max(0, Math.min(1, v));
    if (opts.delay != null) player.rushStamDelay = opts.delay;
    if (opts.winded != null) player.rushWinded = !!opts.winded;
  },
  // Tap a direction ONCE. Two of these inside RUSH.tapWindow is the command; a
  // test that wants to prove holding does nothing just leaves it held instead.
  tapDir(side) { input[side] = true; updateRushInput(); input[side] = false; updateRushInput(); },
  // KEEP a direction down, the way a thumb does when it means to keep running.
  // Not the same as `setInput({ right: true })`: the tap that started the sprint
  // has ALREADY been spent, so re-raising the flag has to be hidden from the
  // edge detector or the very next frame reads it as a third tap and re-arms the
  // window. Seeding `rushTapPrev` is what makes the hold silent.
  holdDir(side, on = true) {
    input[side] = !!on;
    if (on) rushTapPrev[side] = true;
    else updateRushInput();
    return !!input[side];
  },
  // The window's two buttons, by the name the brief uses rather than by which
  // input flag happens to carry them.
  pressBox() { input.leftJabPressed = true; },
  pressR1() { input.comboPressed = true; },
  endRush() { endRush(); },
  // The move table itself, so a damage assertion can name the number it expects
  // instead of hard-coding today's value and going quietly stale.
  get attackTable() { return ATTACKS; },
  // The DRAWN opaque box of one prepared frame, in screen pixels. Sizing a new
  // sheet against an existing one is otherwise guesswork: `drawH` maps a sheet's
  // union box, and two sheets whose figures sit differently inside their cells
  // draw at different heights from the same number.
  animBox(anim, i = 0) {
    const s = spriteFor(anim);
    if (!s) return null;
    const f = s.frames[i] ?? s.frames[0];
    const c = f.getContext('2d', { willReadFrequently: true });
    const d = c.getImageData(0, 0, f.width, f.height).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
      if (d[(y * f.width + x) * 4 + 3] < 24) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    // An EMPTY cell reports null rather than arithmetic on the sentinels. Several
    // sheets have fewer frames than grid cells (combat-walk is 22 in 25, idle 26
    // in 30) and `y1 - y0 + 1` on an untouched box is -1e9, which silently
    // poisons any min/median taken over the results.
    if (x1 < 0) return { anim, frame: i, count: s.frames.length, drawH: s.drawH, drawW: s.drawW, empty: true, h: null };
    return { anim, frame: i, count: s.frames.length, drawH: s.drawH, drawW: s.drawW,
      h: y1 - y0 + 1, w: x1 - x0 + 1, top: y0, bottom: y1 };
  },
  // Forget the tap history. Scenarios that stage a fresh fight need this or a tap
  // left over from the previous one is still inside the window and the next
  // single press reads as the second half of a command nobody gave.
  clearRushTaps() {
    rushTapAt.left = rushTapAt.right = -Infinity;
    rushTapPrev.left = rushTapPrev.right = false;
  },
  // Hold a direction without synthesising key events, for tests that need Darki
  // walking rather than pressed.
  setInput(o) { Object.assign(input, o); return { left: input.left, right: input.right }; },
  // WHICH SECTION is drawing a given enemy. The name the router returns, not a
  // frame number â€” a frame number cannot tell you whether a long flight is
  // holding the airborne pose or has fallen through to something else.
  enemyAnimName(e) { return enemyAnim(e).name; },
  get mcSection() { return player.mcSection; },
  get mcFist() { return player.mcFist; },
  get mcStamina() { return player.mcStamina; },
  get mcLaps() { return player.mcLaps; },              // circle currently playing
  lmb() { input.lmbRaw = true; },                      // raw button edges (combo)
  rmb() { input.rmbRaw = true; },
  lmbClick() { canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0 })); },  // real LMBx4 combo path
  rmbClick() { canvas.dispatchEvent(new MouseEvent('mousedown', { button: 2 })); },  // real RMB (kick / chord)
  mmbClick() { canvas.dispatchEvent(new MouseEvent('mousedown', { button: 1 })); },  // real MMB (grab)
  uppercut() { input.upperPressed = true; },
  hurtPlayer(n) { damagePlayer(n, { x: player.x + 40 }); },
  // --- hurt reactions ---
  // The weight is the `heavy` flag, not the number, so a test can ask for a
  // launch without having to know what the damage thresholds are today.
  flinchPlayer(n = 8) { damagePlayer(n, { x: player.x + 40 }, false); },
  launchPlayer(n = 20) { damagePlayer(n, { x: player.x + 40 }, true); },
  // One blow, every flag stated outright: how hard, where from, whether it is
  // heavy, and whether it ignores a guard. That is the whole branch set of the
  // damage path in one call, so a test never has to stage a live attacker to
  // reach a case â€” including the one combination no enemy throws (a heavy blow
  // that also breaks guard), which is exactly the sort of gap worth probing.
  strikePlayer(n, fromX, heavy = false, breaksGuard = false) {
    damagePlayer(n, { x: fromX ?? (player.x + 40) }, heavy, breaksGuard);
  },
  koNow() { player.hp = 0; koPlayer(); },
  /* The rotation the renderer will honour on the CURRENT pose — the same call
   * drawPlayer makes, so a test cannot pass against a second copy of the rule. */
  get drawnTilt() { return +drawnTilt().toFixed(3); },
  get playerReact() {
    const r = player.react;
    return r ? { name: r.name, t: r.t, step: r.step, steps: r.table.steps.length,
      anim: player.anim, frame: player.frame, dur: r.table.dur, landT: r.table.landT,
      dir: r.dir, jumpY: player.jumpY, airborne: player.jumpY < 0 } : null;
  },
  /* THE VERTICAL GAME, as numbers. A screenshot can show one pose; it cannot
   * show that the tuck held to the apex, that the descent started on the frame
   * `vy` crossed zero, or that the landing played on a jump the player never
   * attacked out of. `clips` is read back off the loaded sheet rather than from
   * the JSON, so a section that failed to parse reads as missing here instead of
   * as whatever the file claims. */
  /* HIS BODY HEIGHT IN SCREEN PIXELS, for any frame of any sheet.
   *
   * This is the only honest way to ask whether two sheets are drawn to the same
   * character. Cell size, union box, `bodyFrame` and the per-sheet dScale all
   * differ between sheets and all feed the final size, so the question can only
   * be answered AFTER every one of them has been applied — which is here, on the
   * prepared frame canvas, times the transform that will draw it. Comparing the
   * source JSONs instead is how you conclude two sheets match and then watch him
   * change size in mid-air.
   *
   * Defaults to whatever is on screen; pass an anim and a sheet-frame index to
   * measure a pose the game is not currently in (the standing guard on each
   * sheet, for instance, which is what the jump and the strike are matched on
   * even though neither clip plays it). */
  measureFrame(anim = player.anim, idx = player.frame) {
    const spr = spriteFor(anim);
    const f = spr?.frames?.[idx];
    if (!f) return null;
    const g = f.getContext('2d');
    const d = g.getImageData(0, 0, f.width, f.height).data;
    let y0 = f.height, y1 = -1;
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        if (d[(y * f.width + x) * 4 + 3] > 40) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
      }
    }
    /* WHICH WAY THE ART POINTS, as pixels — the measurement that catches a sheet
     * wired with the wrong `faces`, which a flag never can because the flag is
     * the thing that is wrong.
     *
     * MEASURED AGAINST HIS HEAD, not against his centre of mass. Centre of mass
     * was the first attempt and it does not work on a flying kick: the extended
     * leg is thin and the torso and arms it is thrown away from are bulky, so the
     * mass sits OPPOSITE the direction the pose points. Both sheets' kicks
     * measured the same sign and the test passed nothing.
     *
     * The head is unambiguous. Take the mean x of the topmost band of ink, then
     * ask which side of it the drawing reaches further on. A body throws a limb
     * away from its head, so the long side is the side the pose points. */
    let x0 = f.width, x1 = -1;
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        if (d[(y * f.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
      }
    }
    let headSum = 0, headN = 0;
    if (y1 >= 0) {
      const band = Math.max(2, Math.round((y1 - y0 + 1) * 0.14));
      for (let y = y0; y < Math.min(f.height, y0 + band); y++) {
        for (let x = 0; x < f.width; x++) {
          if (d[(y * f.width + x) * 4 + 3] > 40) { headSum += x; headN++; }
        }
      }
    }
    const headX = headN ? headSum / headN : (x0 + x1) / 2;
    const reach = x1 - x0 + 1;
    const rawLean = reach > 1 ? ((x1 - headX) - (headX - x0)) / reach : 0;
    /* HIS CAP, and it is the only honest way to compare SIZE across sheets.
     * Ink height compares poses: the fight stance stands more upright than
     * either air sheet's guard, so it measures shorter for reasons that are not
     * scale, and matching on it makes him smaller still. The cap is the same
     * object in every pose and barely changes with how he is turned. */
    let cy0 = f.height, cy1 = -1;
    if (y1 >= 0) {
      const capBot = y0 + Math.round((y1 - y0 + 1) * 0.22);
      for (let y = y0; y <= Math.min(f.height - 1, capBot); y++) {
        for (let x = 0; x < f.width; x++) {
          const i = (y * f.width + x) * 4;
          const r = d[i], g = d[i + 1], b = d[i + 2];
          if (d[i + 3] > 120 && r > 150 && g > 70 && g < 175 && b < 110
              && r - b > 90 && r - g > 45) { if (y < cy0) cy0 = y; if (y > cy1) cy1 = y; }
        }
      }
    }
    const key = darkiSheetKey(anim);
    const ps = tune.playerScale * (tune['dScale' + key] ?? 1);
    const spr2 = spriteFor(anim);
    return { anim, frame: idx, sheet: key,
      inkH: y1 < 0 ? 0 : +((y1 - y0 + 1) * ps).toFixed(1),
      // The pose-invariant one. Compare THIS between sheets, not inkH.
      capH: cy1 < 0 ? null : +((cy1 - cy0 + 1) * ps).toFixed(1),
      feetGap: y1 < 0 ? null : +((f.height - 1 - y1) * ps).toFixed(1),
      sheetFaces: spr2?.faces ?? null,
      headX: headN ? Math.round(headX) : null,
      // -1..+1 in the ART: which side of his head the drawing reaches further on.
      lean: x1 < 0 ? null : +rawLean.toFixed(3),
      // …and which way it points ON SCREEN, once the renderer's flip is applied.
      drawnLean: x1 < 0 ? null
        : +(rawLean * (player.facing !== (spr2?.faces ?? SHEET.faces) ? -1 : 1)).toFixed(3) };
  },
  /* THE SPEED TRAIL, as data. A screenshot can show that something is drawn
   * behind him; it cannot show that the pool is capped, that the echoes carry
   * DIFFERENT poses rather than the same one repeated, that they fade in
   * sequence, or that they are gone on the frame the run ends. */
  get rushFx() {
    const live = rushFx.ghosts.filter((g) => g.live).sort((a, b) => b.seq - a.seq);
    return {
      active: rushFx.active, dir: rushFx.dir,
      caps: { ghosts: RUSH_FX.ghostCap, streaks: RUSH_FX.streakCap, dust: RUSH_FX.dustCap },
      pool: { ghosts: rushFx.ghosts.length, streaks: rushFx.streaks.length, dust: rushFx.dust.length },
      live: {
        ghosts: live.length,
        streaks: rushFx.streaks.filter((s) => s.live).length,
        dust: rushFx.dust.filter((d) => d.live).length,
      },
      /* newest first: age, the pose it captured, where it is, how far off the
       * ground, and its opacity. `jumpY` is what lets a harness tell an echo
       * laid in mid-air from one left over from the ground run — without it,
       * "the trail survived the take-off" is indistinguishable from "the trail
       * was never cleared". */
      ghosts: live.map((g) => ({
        age: +g.age.toFixed(3), frame: g.frame, anim: g.anim, x: Math.round(g.x),
        jumpY: Math.round(g.jumpY), alpha: +ghostAlphaAt(g.age).toFixed(3),
      })),
      tune: { ...RUSH_FX },
    };
  },
  get jumpState() {
    const a = jumpSprite?.anims ?? {};
    const s = jumpStrikeSprite?.anims ?? {};
    const clip = (n) => (a[n] ? { frames: a[n].frames, fps: a[n].fps } : null);
    const sclip = (n) => (s[n] ? { frames: s[n].frames, fps: s[n].fps } : null);
    return {
      anim: player.anim, frame: player.frame,
      sheet: darkiSheetKey(player.anim),
      // …and where the picture is pointing, so a shot harness can tell a pose it
      // failed to reach from one it reached off the side of the screen.
      x: Math.round(player.x), cameraX: Math.round(cameraX),
      onScreen: player.x - cameraX > 40 && player.x - cameraX < VIEW_W - 40,
      grounded: player.grounded, vy: Math.round(player.vy),
      jumpY: Math.round(player.jumpY), vx: Math.round(player.vx),
      landT: +player.landT.toFixed(3),
      attack: player.attack, airAttackDone: player.airAttackDone,
      // the dive: is it live, how long it has run, the gravity it is pulling,
      // and the angle his body is actually drawn at
      // the running leap: is it live, which way it went, and what the run bought
      leaping: player.leaping, leapDir: player.leapDir,
      airLeaping: airLeaping(), rushState,
      leapTune: { ...RUSH_LEAP, carrySpeed: RUSH.speed * RUSH_LEAP.carry },
      diving: airDiving(), diveT: +player.diveT.toFixed(3),
      gravityMul: +diveGravityMul().toFixed(2),
      tilt: +player.diveTilt.toFixed(3),
      drawnTilt: +drawnTilt().toFixed(3),   // …and what the renderer will honour
      tune: { ...AIR_STRIKE },
      hit: ATTACKS.airKick.windows[Object.keys(ATTACKS.airKick.windows)[0]] ?? null,
      clips: { jumpRise: clip('jumpRise'), jumpFall: clip('jumpFall'),
               land: clip('land'),
               /* The kick reads off the JUMP sheet and its descent off the
                * STRIKE sheet — the move spans both, so the clips come from
                * different lookups on purpose. */
               airKick: clip('airKick'), airKickFall: sclip('airKickFall') },
      strikeSheet: darkiSheetKey('airKick'),
      fallSheet: darkiSheetKey('airKickFall'),
      airKickMove: { frames: ATTACKS.airKick.frames, fps: ATTACKS.airKick.fps,
                     windowSteps: Object.keys(ATTACKS.airKick.windows).map(Number),
                     windowFrames: Object.keys(ATTACKS.airKick.windows)
                       .map((s) => ATTACKS.airKick.frames[+s]) },
    };
  },
  get reactionTables() {
    return Object.fromEntries(Object.entries(REACTIONS).map(([k, R]) => [k, {
      dur: R.dur, landT: R.landT, steps: R.steps.map((s) => [s.anim, s.frame]),
    }]));
  },
  // --- the guard ---
  // `hold` drives it straight rather than through a key event, so a test can
  // put the hands up and leave them up across as many steps as it needs.
  holdBlock(on = true) { kbHeld.block = !!on; input.blockHeld = !!on; },
  get blockConfig() { return BLOCK; },
  get blockState() {
    return { blocking: player.blocking, covering: playerBlocking(),
      phase: player.blockPhase, t: +player.blockT.toFixed(3), frame: player.frame,
      anim: player.anim, glide: Math.round(player.blockGlide),
      guardBreak: +player.guardBreak.toFixed(3), canBlock: canBlock(), facing: player.facing };
  },
  covers(fromX) { return blockCovers({ x: fromX }); },
  // --- the Agbero's kit ---
  get gingerMoves() { return GINGER_MOVES; },
  get kickFps() { return KICK_FPS; },
  // Force the next commitment so a test never has to roll for one.
  armGinger(e, name) { const g = e ?? enemies.find((x) => !x.benched && !x.boss);
    if (!g) return null;
    attackTokens.add(g); g.moveName = name; g.mode = 'approach';
    g.approachT = 0; g.atkCooldown = 0; g.willStrike = true; return g.id; },
  // Release every attack token. A scenario that stops stepping mid-swing leaves
  // its enemy holding one, and with maxTokens 1 that silently stops the NEXT
  // scenario's enemy from ever committing â€” it sits in 'menace' looking busy
  // while the test waits for an attack that cannot come.
  clearTokens() { attackTokens.clear(); },
  // Put the player back to a cold neutral. Suites that run several scenarios in
  // one page were carrying rage, a live hit-stop and a half-spent attack ledger
  // from one into the next, which changes movement speed, swing rate and whether
  // a frame runs at all â€” a scenario that passes alone and fails third is nearly
  // always this rather than the thing it is testing.
  resetFighter() {
    player.rage = 0; player.rageActive = false; player.rageTimer = 0;
    hitStopTimer = 0; shakeMag = 0;
    player.attack = null; player.attackHits = null; player.attackStep = 0;
    player.bufferedAttack = null; player.attackBufferT = 0;
    player.react = null; player.state = 'normal'; player.invuln = 0;
    player.hp = player.maxHp; player.hpShown = player.hp;
    player.vx = 0; player.vy = 0; player.jumpY = 0; player.grounded = true;
    player.blocking = false; player.guardBreak = 0;
    closeAttackWindow();
    releaseGrab({ drop: true });
    dropCarry({ drop: true });
    endRush();
    rushTapAt.left = rushTapAt.right = -Infinity;
    rushTapPrev.left = rushTapPrev.right = false;
    // A full tank, and no pause on it. The gauge is exactly the kind of state
    // that carries between scenarios in one page and makes a check pass alone
    // and fail eighth in the file â€” which is what this whole helper exists for.
    player.rushStam = 1; player.rushStamDelay = 0;
    player.rushWinded = false; player.rushDeniedT = 0;
  },
  // The "target removed from under a running system" path, which is what the
  // interruption tests need to exercise for real rather than by calling
  // abortExecution directly â€” benchEnemy is where the guard actually lives.
  benchEnemy(e) { benchEnemy(e ?? enemies.find((x) => !x.benched && x.hp > 0)); },
  get tokenHolders() { return attackTokens.size; },
  get gingerAnim() { const g = enemies.find((x) => !x.benched && !x.boss);
    return g ? { move: g.moveName, mode: g.mode, state: g.state,
      anim: g.anim, frame: g.frame } : null; },
  // Put a body on the tarmac without staging a swing: the same call the combat
  // scan makes, so a test reaches the launch â†’ land â†’ bounce path by the route
  // the game uses rather than by setting `state` by hand.
  floorEnemy(e, win) { hitEnemy(e ?? enemies.find((x) => !x.benched && !x.boss),
    { damage: 40, kb: { x: 240, y: -470 }, launch: true, hitstop: 0, shake: 0, rage: 0, big: true, ...win }); },
  // Which sheet+section a given body is drawing from THIS frame â€” the only way
  // to prove the fall sheet is actually on screen rather than merely loaded.
  enemyAnimOf(e) { const a = enemyAnim(e); return a.name; },
  // Deal `n` footstep clips from the live bag. The anti-pattern claim is about
  // the ORDER the bag produces, so the test has to read the order itself.
  stepOrder(n) { const out = []; for (let i = 0; i < n; i++) out.push(nextStep()); return out; },
  burstRage() { activateRage(); },              // test: fire the shockwave directly
  get rageBurstConfig() { return RAGE_BURST; },
  togglePause() { togglePause(); },
  // --- pause menu ---
  // The pause menu is a screen with its own clock, its own input model and its
  // own widgets, none of which step() touches â€” so it gets its own tick. This
  // is the SAME sequence the main loop runs while frozen (see loop()), not a
  // reimplementation of it, which is the only way a test of the menu is a test
  // of the menu the player uses.
  get pauseMenu() {
    return {
      choice: pauseChoice,
      items: PAUSE_ITEMS.slice(),
      label: PAUSE_ITEMS[pauseChoice],
      t: +pauseT.toFixed(3),
      difficulty: chosenDifficulty,
      /* Every widget the last pause frame drew, so a test can assert one row
       * per item, exactly one focused, and that a click can reach them. */
      widgets: (frontEnd?.ui.hitboxes ?? [])
        .filter((h) => String(h.id).startsWith('pause:'))
        .map((h) => ({ id: h.id, index: h.index, x: h.x, y: h.y, w: h.w, h: h.h })),
    };
  },
  pauseStep(dt) {
    if (!paused) return false;
    pauseT += dt;
    frontEnd?.ui.tick(dt);
    updatePauseInput(dt);
    if (!frontEnd?.active) draw();
    return true;
  },
  // Raise a pause-menu action the way a keydown does â€” one latch, consumed by
  // exactly one pauseStep.
  pausePress(action) {
    if (!(action in pauseLatch)) return false;
    if (action === 'up' || action === 'down') pauseKey[action] = true;
    pauseLatch[action] = 1;
    return true;
  },
  pauseRelease(action) { if (action in pauseKey) pauseKey[action] = false; },
  get frontEndPhase() { return frontEnd?.phase ?? null; },
  frames: 0,
  step(dt) { update(dt); draw(); }, // deterministic tick for tests
  // Re-draw the CURRENT state without advancing it. A test that needs two
  // renders of one frame (shoot a body, hide it, diff the two to get its
  // silhouette) cannot use step() â€” that would move the world between them.
  redraw() { draw(); },
};

/* --------------------------------------------------- dev tuning panel */

// Glassmorphism control panel: live sliders + number inputs for character
// scales and prop placement. Starts collapsed (a gear button) so it never
// obstructs play or screenshots. Cosmetic scales are draw-time previews.
const TUNE_KEY = 'ror.tune.v3';    // persisted dev-panel settings (v3: single mural
                                   // backdrop â†’ street scale/anchor changed; older saves ignored)
function saveTune() {
  try { localStorage.setItem(TUNE_KEY, JSON.stringify(tune)); } catch {}
}

function initDevPanel() {
  const DEFAULTS = { ...tune };    // pristine code defaults (Reset target)
  // Load persisted settings so the panel opens "as it was left" last time.
  try {
    const saved = JSON.parse(localStorage.getItem(TUNE_KEY) || 'null');
    if (saved) for (const k of Object.keys(DEFAULTS)) if (k in saved) tune[k] = saved[k];
  } catch {}
  const CONTROLS = [
    { header: 'Parallax layers' },
    { key: 'skyScale', label: 'Sky scale', min: 0.3, max: 3, step: 0.01 },
    { key: 'skyY', label: 'Sky Y', min: -400, max: 500, step: 1 },
    { key: 'skyParallax', label: 'Sky parallax', min: 0, max: 1, step: 0.01 },
    { key: 'skyX', label: 'Sky X', min: -3000, max: 3000, step: 1 },
    { key: 'farScale', label: 'Far scale', min: 0.1, max: 2, step: 0.01 },
    { key: 'farY', label: 'Far Y', min: 0, max: 720, step: 1 },
    { key: 'farParallax', label: 'Far parallax', min: 0, max: 1, step: 0.01 },
    { key: 'farX', label: 'Far X', min: -3000, max: 3000, step: 1 },
    { key: 'midScale', label: 'Mid scale', min: 0.1, max: 2.5, step: 0.01 },
    { key: 'midY', label: 'Mid Y', min: 0, max: 800, step: 1 },
    { key: 'midParallax', label: 'Mid parallax', min: 0, max: 1, step: 0.01 },
    { key: 'midX', label: 'Mid X', min: -3000, max: 3000, step: 1 },
    { key: 'streetScale', label: 'Street scale', min: 0.5, max: 2.5, step: 0.001 },
    { key: 'streetY', label: 'Street Y', min: 300, max: 820, step: 1 },
    { key: 'streetParallax', label: 'Street parallax', min: 0, max: 1.5, step: 0.01 },
    { key: 'streetX', label: 'Street X', min: -3000, max: 3000, step: 1 },
    { header: 'Atmosphere (fog)' },
    { key: 'fogFar', label: 'Fog · far', min: 0, max: 1, step: 0.01 },
    { key: 'fogMid', label: 'Fog · mid', min: 0, max: 1, step: 0.01 },
    { key: 'fogTop', label: 'Fog top fade', min: 0, max: 1, step: 0.01 },
    { header: 'Camera' },
    { key: 'camFollow', label: 'Follow smooth', min: 2, max: 14, step: 0.5 },
    { key: 'camLookSmooth', label: 'Look-ahead smooth', min: 2, max: 12, step: 0.5 },
    { key: 'camLookAhead', label: 'Look-ahead max', min: 0, max: 400, step: 10 },
    { key: 'camDeadX', label: 'Dead zone X', min: 0, max: 220, step: 5 },
    { key: 'camDeadY', label: 'Dead zone Y', min: 0, max: 120, step: 5 },
    { key: 'camFrame', label: 'Frame from edge', min: 0.2, max: 0.5, step: 0.01 },
    { header: 'Fighters' },
    { key: 'playerScale', label: 'Player scale', min: 0.3, max: 2.5, step: 0.01 },
    { key: 'enemyScale', label: 'Enemy scale', min: 0.3, max: 2.5, step: 0.01 },
    { key: 'bossScale', label: 'Boss scale', min: 0.3, max: 2.5, step: 0.01 },
    { key: 'bossOffY', label: 'Boss Y', min: -60, max: 60, step: 1 },
    { key: 'laneGapX', label: 'Body gap X', min: 20, max: 120, step: 1 },
    { key: 'laneGapY', label: 'Lane gap Y', min: 10, max: 80, step: 1 },
    { header: 'Darki sprites (per-sheet)' },
    { key: 'dScaleWalk', label: 'Walk scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYWalk', label: 'Walk Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleCombat', label: 'Combat scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYCombat', label: 'Combat Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleIdle', label: 'Idle scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYIdle', label: 'Idle Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleJump', label: 'Jump scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYJump', label: 'Jump Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleJumpStrike', label: 'Air strike scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYJumpStrike', label: 'Air strike Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleJabL', label: 'Jab-L scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYJabL', label: 'Jab-L Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleHighKick', label: 'High-kick scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYHighKick', label: 'High-kick Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleBackKick', label: 'Back-kick scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYBackKick', label: 'Back-kick Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleCombo', label: 'Combo scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYCombo', label: 'Combo Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleGrab', label: 'Grab scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYGrab', label: 'Grab Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleGrabFail', label: 'Grab-miss scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYGrabFail', label: 'Grab-miss Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleContCombo', label: 'Grab-combo scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYContCombo', label: 'Grab-combo Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleUppercut', label: 'Uppercut scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYUppercut', label: 'Uppercut Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleHitReact', label: 'Flinch scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYHitReact', label: 'Flinch Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleHitLift', label: 'Lift scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYHitLift', label: 'Lift Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleHitAir', label: 'Air-tumble scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYHitAir', label: 'Air-tumble Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleFall', label: 'Fall scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYFall', label: 'Fall Y', min: -60, max: 60, step: 1 },
    { key: 'dScaleBlock', label: 'Block scale', min: 0.5, max: 2, step: 0.01 },
    { key: 'dOffYBlock', label: 'Block Y', min: -60, max: 60, step: 1 },
    { header: 'Shadow & FX' },
    { key: 'shadowScaleX', label: 'Shadow scale X', min: 0, max: 3, step: 0.01 },
    { key: 'shadowScaleY', label: 'Shadow scale Y', min: 0, max: 3, step: 0.01 },
    { key: 'shadowOffsetX', label: 'Shadow offset X', min: -80, max: 80, step: 1 },
    { key: 'shadowOffsetY', label: 'Shadow offset Y', min: -60, max: 60, step: 1 },
    { key: 'shadowAlpha', label: 'Shadow opacity', min: 0, max: 1, step: 0.01 },
    { key: 'hitStop', label: 'Hit stop (s)', min: 0, max: 0.25, step: 0.01 },
    { key: 'shakeMag', label: 'Screen shake', min: 0, max: 20, step: 0.5 },
  ];

  const style = document.createElement('style');
  style.textContent = `
    #ror-tune { position: fixed; top: 14px; right: 14px; z-index: 50;
      font: 12px/1.4 ${FONT}; color: #eaf0ff; }
    #ror-tune .gear { width: 40px; height: 40px; border-radius: 12px; cursor: pointer;
      font-size: 18px; color: #eaf0ff; background: rgba(20,28,44,.45);
      border: 1px solid rgba(255,255,255,.25); backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px); box-shadow: 0 6px 20px rgba(0,0,0,.35);
      transition: transform .12s; }
    #ror-tune .gear:hover { transform: rotate(45deg); }
    #ror-tune .panel { margin-top: 8px; width: 268px; padding: 14px 14px 10px;
      max-height: calc(100vh - 76px); overflow-y: auto;
      border-radius: 16px; background: rgba(18,24,38,.42);
      border: 1px solid rgba(255,255,255,.22); backdrop-filter: blur(16px) saturate(1.4);
      -webkit-backdrop-filter: blur(16px) saturate(1.4);
      box-shadow: 0 10px 40px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.15); }
    #ror-tune .panel h3 { margin: 0 0 10px; font-size: 12px; letter-spacing: .12em;
      text-transform: uppercase; color: #ffe45e; font-weight: 700; }
    #ror-tune .sub { margin: 12px 0 7px; font-size: 10px; letter-spacing: .14em;
      text-transform: uppercase; color: #9fb2d8; font-weight: 700;
      border-top: 1px solid rgba(255,255,255,.14); padding-top: 8px; }
    #ror-tune .sub:first-child { margin-top: 0; border-top: 0; padding-top: 0; }
    #ror-tune .row { display: grid; grid-template-columns: 88px 1fr 52px; gap: 7px;
      align-items: center; margin-bottom: 7px; }
    #ror-tune .row span { opacity: .85; }
    #ror-tune input[type=range] { width: 100%; accent-color: #ffe45e; }
    #ror-tune input[type=number] { width: 100%; background: rgba(255,255,255,.1);
      border: 1px solid rgba(255,255,255,.2); border-radius: 6px; color: #fff;
      padding: 3px 4px; font: inherit; }
    #ror-tune .foot { display: flex; gap: 7px; margin-top: 8px; }
    #ror-tune .foot button, #ror-tune .chk { flex: 1; padding: 6px; border-radius: 8px;
      cursor: pointer; color: #eaf0ff; background: rgba(255,255,255,.1);
      border: 1px solid rgba(255,255,255,.22); font: inherit; }
    #ror-tune .chk { display: flex; align-items: center; gap: 6px; justify-content: center; }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'ror-tune';
  const gear = document.createElement('button');
  gear.className = 'gear';
  gear.textContent = 'âš™';
  gear.title = 'Tune scales & placement';
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;
  gear.addEventListener('click', () => { panel.hidden = !panel.hidden; });

  const title = document.createElement('h3');
  title.textContent = 'Ratel Tuner';
  panel.appendChild(title);

  const rows = [];
  for (const c of CONTROLS) {
    if (c.header) {
      const h = document.createElement('div');
      h.className = 'sub';
      h.textContent = c.header;
      panel.appendChild(h);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.textContent = c.label;
    const range = document.createElement('input');
    range.type = 'range'; range.min = c.min; range.max = c.max; range.step = c.step;
    const num = document.createElement('input');
    num.type = 'number'; num.min = c.min; num.max = c.max; num.step = c.step;
    const set = (v) => {
      v = Math.min(c.max, Math.max(c.min, Number(v)));
      if (!Number.isFinite(v)) return;
      tune[c.key] = v;
      range.value = v; num.value = v;
    };
    // Live preview only â€” changes are not persisted until "Save" is pressed.
    range.addEventListener('input', () => set(range.value));
    num.addEventListener('input', () => set(num.value));
    set(tune[c.key]);               // reflect current/loaded value
    row.append(name, range, num);
    panel.appendChild(row);
    rows.push(() => set(DEFAULTS[c.key], false));
  }

  // Lane-sep toggle on its own row.
  const chkRow = document.createElement('div');
  chkRow.className = 'foot';
  const sep = document.createElement('label');
  sep.className = 'chk';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = tune.laneSep;
  cb.addEventListener('change', () => { tune.laneSep = cb.checked; });
  sep.append(cb, document.createTextNode('Lane sep'));
  chkRow.append(sep);
  // Execution debug readout (Â§33) â€” off in normal play, on for tuning the
  // checkpoint windows against the animation.
  const dbg = document.createElement('label');
  dbg.className = 'chk';
  const dcb = document.createElement('input');
  dcb.type = 'checkbox'; dcb.checked = !!tune.execDebug;
  dcb.addEventListener('change', () => { tune.execDebug = dcb.checked; });
  dbg.append(dcb, document.createTextNode('Exec debug'));
  chkRow.append(dbg);
  panel.appendChild(chkRow);

  const foot = document.createElement('div');
  foot.className = 'foot';
  // Save: persist the current settings so they load automatically after a
  // reload (they become the effective defaults until Reset).
  const save = document.createElement('button');
  save.textContent = 'Save';
  save.title = 'Persist these settings — they auto-load after reloading the level';
  save.addEventListener('click', () => {
    saveTune();
    save.textContent = 'Saved âœ“';
    setTimeout(() => { save.textContent = 'Save'; }, 1200);
  });
  const reset = document.createElement('button');
  reset.textContent = 'Reset';
  reset.title = 'Restore built-in defaults and clear saved settings';
  reset.addEventListener('click', () => {
    rows.forEach((r) => r());
    cb.checked = tune.laneSep = DEFAULTS.laneSep;
    try { localStorage.removeItem(TUNE_KEY); } catch {}
  });
  const copy = document.createElement('button');
  copy.textContent = 'Copy';
  copy.title = 'Copy current values as JSON';
  copy.addEventListener('click', () => {
    const json = JSON.stringify(tune, null, 2);
    navigator.clipboard?.writeText(json);
    console.log('[ratel tune]', json);
  });
  foot.append(save, reset, copy);
  panel.appendChild(foot);

  root.append(gear, panel);
  document.body.appendChild(root);
}

let last = 0;
function loop(ts) {
  window.__ror.frames++;
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  if (frontEnd?.active) {
    frontEnd.pollGamepad();
    frontEnd.update(dt);
    frontEnd.draw();
  } else if (!worldReady) {
    /* Belt and braces. The front end will not leave for gameplay before
     * isWorldReady(), so this should never be reached â€” but holding the frame
     * beats an exception every 16 ms if some other path ever gets here. */
  } else {
    pollGamepad();
    updateMusic(dt);
    if (paused) {
      /* The sim is frozen but the MENU is not: its focus eases, its breathing
       * glow and its hold-repeat all need real time, so they get their own tick
       * rather than riding on update(). */
      pauseT += dt;
      frontEnd?.ui.tick(dt);
      updatePauseInput(dt);
    } else {
      pauseT = 0;
      update(dt);
    }
    /* CONTROLS/OPTIONS from the pause menu hand the canvas to the front end
     * mid-frame; drawing the overlay again here would flash it for one frame. */
    if (!frontEnd?.active) draw();
  }
  requestAnimationFrame(loop);
}

/* The level itself, loaded OFF the critical path â€” the front end is already on
 * screen and taking input while this runs. Nothing in here may touch the front
 * end; its only outputs are the module-level world state, `worldLoaded` for the
 * readout, and worldReady/worldError for the handover gate. */
async function loadWorld() {
  try {
    /* Each load bumps the counter as it lands, so the handover readout tracks
     * real arrivals rather than a timer. */
    const track = (p) => p.then((v) => { worldLoaded++; return v; });
    const assets = await Promise.all([
      loadSpriteFrames(SHEET),
      loadSpriteFrames(IDLE_SHEET, 'idle'),
      loadSpriteFrames(UPPERCUT_SHEET, 'uppercut'),
      loadSpriteFrames(JUMP_SHEET, 'jump'),
      loadSpriteFrames(JUMPSTRIKE_SHEET, 'airStrike'),   // …and the air attack's own take
      loadSpriteFrames(COMBATWALK_SHEET, 'combatwalk'),
      loadSpriteFrames(JAB_L_SHEET, 'jabLeft'),
      loadSpriteFrames(HIGHKICK_SHEET, 'highKick'),
      loadSpriteFrames(BACKKICK_SHEET, 'backKick'),
      loadSpriteFrames(COMBO_SHEET, 'combo5'),
      loadSpriteFrames(GRAB_SHEET, 'grab'),
      loadSpriteFrames(GRABFAIL_SHEET, 'grabFail'),
      loadSpriteFrames(CONTCOMBO_SHEET, 'contCombo'),
      // One 107-frame take: pickup, carry entry/loop, throw and recovery. Load
      // and key it once instead of decoding the same large sheet three times.
      loadSpriteFrames(DARKICARRY_SHEET),
      loadSpriteFrames(RUSH_SHEET, 'rush'),         // forward-forward: the charge
      loadSpriteFrames(HIT_SHEET, 'hitReact'),      // Darki: standing flinch
      loadSpriteFrames(HITLIFT_SHEET, 'hitLift'),   // â€¦and the launch chain
      loadSpriteFrames(HITAIR_SHEET, 'hitAir'),
      loadSpriteFrames(FALL_SHEET, 'fall'),
      loadSpriteFrames(BLOCK_SHEET, 'block'),       // â€¦and the guard
      loadSpriteFrames(GINGER_SHEET),
      loadSpriteFrames(ENEMYWALK_SHEET),
      loadSpriteFrames(ENEMYJAB_SHEET),
      loadSpriteFrames(ENEMYKICK_SHEET),
      loadSpriteFrames(ENEMYCARRY_SHEET),      // â€¦his side of the pickup and throw
      loadSpriteFrames(ENEMYFALL_SHEET),      // â€¦the way he goes down and gets up
      loadSpriteFrames(ENEMYDEATH_SHEET),     // â€¦and the way he does not get up
      loadSpriteFrames(OLODO_STANCE_SHEET),   // BOSS: MC_Olodo's emote stance
      loadSpriteFrames(OLODO_SPECIAL_SHEET),  // BOSS: MC_Olodo's fist combo
      loadSpriteFrames(OLODO_HOOK_SHEET),     // BOSS: MC_Olodo's spinning hook kick
      loadSpriteFrames(OLODO_FALL_SHEET),     // â€¦and the way HE goes down, at last
      loadImage('layers/level1_map.png'), // mural: wall + street (its night sky keyed transparent)
      loadImage('layers/sky.png'),        // sky + clouds, shows through the mural's keyed sky
    ].map(track));
    [sprite, idleSprite, uppercutSprite, jumpSprite, jumpStrikeSprite, combatWalkSprite,
      jabLeftSprite, highKickSprite, backKickSprite, comboSprite,
      grabSprite, grabFailSprite, contComboSprite,
      darkiCarrySprite, rushSprite,
      hitSprite, hitLiftSprite, hitAirSprite, fallSprite, blockSprite,
      gingerSprite, gingerWalkSprite, gingerJabSprite, gingerKickSprite,
      gingerCarrySprite, gingerFallSprite, gingerDeathSprite,
      olodoStanceSprite, olodoSpecialSprite, olodoHookSprite, olodoFallSprite] = assets;
    // Both knockdown sheets split at the moment he lands, because the SIM splits
    // there: 'hit' is physics (he is in the air until jumpY says otherwise) and
    // 'down'/'ko' are timers. Every one plays once and holds its last frame, so a
    // long flight parks on the last airborne pose instead of looping the tumble,
    // and a corpse parks face-down instead of climbing back to its feet.
    // Explicit phases from the supplied pair. Pickup and release share a frame
    // number; the long hold gives Agbero his smoother independent struggle loop.
    /* The jump sheet's four clips already came off its JSON (resolveAnims keeps
     * every named section); this is the one thing that cannot — the air kick is
     * an ATTACKS entry and has to be pointed at them. */
    bindJumpKickAnims();
    darkiCarrySprite.anims.pickup = { frames: FR(0, 18), fps: 32, loop: false };
    darkiCarrySprite.anims.carryEntry = { frames: FR(19, 40), fps: 30, loop: false };
    darkiCarrySprite.anims.carry = { frames: FR(41, 62), fps: 30, loop: true };
    darkiCarrySprite.anims.throwEnemy = { frames: FR(80, 106), fps: 30, loop: false };
    gingerCarrySprite.anims.pickedUp = { frames: FR(0, 18), fps: 32, loop: false };
    gingerCarrySprite.anims.struggle = { frames: FR(15, 51), fps: 26, loop: true };
    gingerCarrySprite.anims.throwPair = { frames: FR(80, 90), fps: 30, loop: false };

    gingerFallSprite.anims.fallAir = { frames: [4, 5, 6, 7, 8, 9, 10, 11], fps: 26, loop: false };
    gingerFallSprite.anims.fallDown = {
      frames: [12, 13, 14, 15, 16, 17, 18, 19, 20], fps: 24, loop: false };
    // The recovery the old sheet never had. Timed to FINISH as the down timer
    // runs out (see the 'down' branch), so he is on his way up before he is
    // walking rather than popping from flat to a stride.
    gingerFallSprite.anims.getUp = { frames: [21, 22, 23, 24, 25, 26], fps: 18, loop: false };
    // MC_Olodo's, same three sections and the same rules â€” play once, hold the
    // last frame â€” off the frame map read in olodo_fall_contact.png. The fps here
    // and BOSS_FALLDOWN_DUR / BOSS_GETUP_DUR are ONE set of numbers: change an fps
    // and change the duration beside it, or he is handed back to his stance
    // mid-rise. 4 airborne frames is short, and deliberately so: the flight is
    // physics, the section holds frame 3, and a long launch parks on it.
    olodoFallSprite.anims.fallAir = { frames: [0, 1, 2, 3], fps: 26, loop: false };
    olodoFallSprite.anims.fallDown = { frames: [4, 5, 6, 7, 8, 9, 10], fps: 24, loop: false };
    olodoFallSprite.anims.getUp = {
      frames: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
      fps: 24, loop: false };
    gingerDeathSprite.anims.deathAir = {
      frames: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], fps: 30, loop: false };
    // Stops at 40, not 57: frames 38-57 are pixel-identical (bbox 219x781 on
    // every one of them), so the tail is a hold either way and 20 duplicate
    // frames only make the corpse take longer to be still.
    gingerDeathSprite.anims.deathDown = {
      frames: [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
      fps: 26, loop: false };
    // enemy punch: play all 14 frames once (holds the retract), timed so the
    // fist extends as the lunge connects.
    gingerJabSprite.anims.jab = { frames: gingerJabSprite.anims.walk.frames, fps: 22, loop: false };
    // enemy side kick: the sheet stops at full extension â€” there is no
    // retraction drawn â€” so the frame list walks back DOWN through it (8-6-4-2)
    // to bring the leg in and finish on frame 0, the guard both attack sheets
    // share. Frame 8 is the blow, and it sits at index 8, so at KICK_FPS it
    // lands at GINGER_MOVES.kick.connectAt. Those two numbers are one number:
    // change this fps and change that one with it.
    gingerKickSprite.anims.kick = {
      frames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 8, 6, 4, 2, 0], fps: KICK_FPS, loop: false };
    // NOTE: positional â€” these two are the LAST entries in the load list above,
    // so adding a sheet shifts them. Kept as indices to match the destructuring.
    bg = { map: assets[assets.length - 2], sky: assets[assets.length - 1] };
    // Scale the mural so it spans the world exactly once (drawn 1:1, no repeat).
    // Set before initDevPanel so it's the panel's Reset target; a saved override
    // still wins (hence the TUNE_KEY bump when the art/scale changes).
    if (bg.map && bg.map.width) tune.streetScale = WORLD_W / bg.map.width;
    enemies = buildEnemies();
    spawnWave();                             // seed section 1's wave inside the arena
    // Hit SFX: decode in the background so boot isn't blocked (a few tiny mp3s).
    initAudio();
    initMusic();                             // streamed loop; starts + fades in on first gesture
    // â€¦and a clip that decoded to silence never joins the bag (see acceptSfx):
    // it would take one blow in three with it.
    {
      const files = ['sounds/hit1.mp3', 'sounds/hit2.mp3', 'sounds/hit3.mp3'];
      Promise.all(files.map(loadSound)).then((bufs) => bufs.forEach((b, i) => {
        if (acceptSfx(b, files[i])) hitBuffers.push(b);
      }));
    }
    loadSound('sounds/impact_hit.mp3').then((b) => { impactBuffer = b; });   // Darki takes one
    loadSound('sounds/fallthud.mp3').then((b) => { thudBuffer = b; });       // â€¦and hits the deck
    // The execution pair. Loaded AFTER boot rather than blocking it: two 5356x2256
    // sheets are the heaviest art in the game and the finisher cannot be reached
    // in the opening seconds anyway. canExecute does not gate on them, but
    // drawExecution no-ops until both are in, so an execution started before they
    // land plays its timeline silently rather than throwing.
    loadImage('sprites/exec-darki.png').then((i) => { execAttackerImg = i; }).catch(() => {});
    loadImage('sprites/exec-olodo.png').then((i) => { execVictimImg = i; }).catch(() => {});
    // â€¦and every COMPOSITE pairing's single sheet, driven off the table rather
    // than named here, so adding a finisher stays a row in EXECUTIONS.
    for (const d of Object.values(EXECUTIONS))
      if (d.compositeSrc)
        loadImage(d.compositeSrc).then((i) => { execCompositeImg[d.id] = i; }).catch(() => {});
    // Indexed, not pushed: playStep reads the onset out of STEP_SRCS by the same
    // index, so a clip that fails to decode has to leave a HOLE rather than
    // shifting the two behind it onto the wrong offsets.
    STEP_SRCS.forEach((s, i) => loadSound(s.src).then((b) => { if (b) stepBuffers[i] = b; }));
    // The cue table. One fetch per DISTINCT file â€” punch2a and punch2b are two
    // slices of one recording, so decoding it twice would be paying twice for
    // the same 4.6 seconds.
    {
      const byFile = new Map();
      for (const [name, def] of Object.entries(CUES)) {
        if (!byFile.has(def.src)) byFile.set(def.src, []);
        byFile.get(def.src).push(name);
      }
      for (const [src, names] of byFile)
        loadSound(src).then((b) => { if (b) for (const n of names) cueBuf[n] = b; });
    }
    for (const [name, def] of Object.entries(DARKI_VOICE))
      loadSound(def.src).then((b) => { if (b) voiceBuffers[name] = b; });
    // The dev panel is built here, not in boot: its sliders read the tuned
    // values and its Reset target is the streetScale set from the mural above.
    if (window.__rorDebugPanel || new URLSearchParams(location.search).has('debug')) initDevPanel();
    worldLoaded = WORLD_STEPS;
    worldReady = true;
  } catch (err) {
    worldError = err;
    console.error(err);
  }
}

/* Boot is now the FRONT END only â€” one idle sheet and the menu audio, so the
 * studio card is on screen in the first moments instead of after the full set. */
/* WAIT FOR THE FACE BEFORE DRAWING A SINGLE CHARACTER.
 *
 * DOM text repaints itself when a webfont arrives. Canvas text does not — every
 * string in this game is rasterised once into a bitmap, so anything drawn in the
 * gap between first paint and font-ready keeps the FALLBACK's metrics until that
 * screen happens to be drawn again. On the studio card and the title, which are
 * timed one-shots, "again" can mean never.
 *
 * `document.fonts.load()` per weight, not just `document.fonts.ready`: ready
 * resolves when nothing is PENDING, and a face nobody has asked for yet is not
 * pending. Asking for each weight is what starts the fetch.
 *
 * Failure here is deliberately NOT fatal — the game must still run on a machine
 * that cannot read the file — but it is loud, and fontState() below tells any
 * harness which face actually got used. Silence is the one outcome not allowed:
 * a fallback that merely looks a bit different is exactly how the wrong font
 * ships unnoticed. */
const FONT_WEIGHTS = [400, 600, 700, 800, 900];
/* THE FONT MAY NEVER BLOCK BOOT. This ceiling is not belt-and-braces.
 *
 * The first version awaited `document.fonts.ready` unconditionally, and
 * uiverify — which stubs requestAnimationFrame before any module runs, so the
 * page has no render loop at all — hung on it until its 180 s boot gate gave
 * up. `fonts.ready` is tied to the rendering lifecycle, so a page that never
 * renders can leave it pending forever. That is a harness today and a real
 * machine tomorrow: the typeface is a presentation upgrade, and no upgrade is
 * worth a game that will not start. Race it, and boot in the fallback if the
 * race is lost — fontState() still reports exactly what happened. */
const FONT_TIMEOUT_MS = 4000;
let fontReady = false;
let fontError = null;
async function loadFont() {
  try {
    if (!document.fonts) throw new Error('FontFaceSet unavailable');
    const load = (async () => {
      await Promise.all(FONT_WEIGHTS.map((w) => document.fonts.load(`${w} 40px Montserrat`)));
      /* Best-effort, and deliberately NOT the thing being awaited on its own:
       * load() above is what actually starts and finishes the fetches. */
      await document.fonts.ready;
    })();
    let timer;
    const ceiling = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error(`timed out after ${FONT_TIMEOUT_MS}ms`)), FONT_TIMEOUT_MS);
    });
    try { await Promise.race([load, ceiling]); } finally { clearTimeout(timer); }
    fontReady = document.fonts.check('900 40px Montserrat');
    if (!fontReady) throw new Error('Montserrat did not resolve after load()');
  } catch (err) {
    /* The face may still have arrived even though the wait did not finish —
     * check before crying wolf, because a spurious console error here would
     * send the next person looking for a font bug that is not there. */
    try { fontReady = !!document.fonts?.check('900 40px Montserrat'); } catch { fontReady = false; }
    if (!fontReady) {
      fontError = err.message;
      console.error(`[ratel-ui] Montserrat failed to load (${err.message}) — every screen `
        + 'falls back to the system sans. Check frontend/fonts/*.woff2 is being served.');
    }
  }
}

/* Is the text on screen ACTUALLY Montserrat? `document.fonts.check` answers for
 * the face; this also measures, because a served-but-broken file can register
 * and still rasterise as the fallback. Two different fallbacks give two
 * different widths for the same string; Montserrat gives one. */
function fontState() {
  const probe = document.createElement('canvas').getContext('2d');
  const w = (fam) => { probe.font = `900 100px ${fam}`; return probe.measureText('RAGE OF RATELS').width; };
  const mont = w('Montserrat, monospace');
  const a = w('monospace'), b = w('serif');
  return {
    ready: fontReady,
    error: fontError,
    checks: typeof document.fonts?.check === 'function' ? document.fonts.check('900 40px Montserrat') : null,
    // If Montserrat is missing, "Montserrat, monospace" IS monospace.
    resolved: Math.abs(mont - a) > 0.5 && Math.abs(mont - b) > 0.5,
    width: +mont.toFixed(2),
    family: FONT,
  };
}

(async function boot() {
  try {
    /* Before createFrontEnd, because the front end bakes the fallback wordmark
     * into a canvas during load() and that bake measures text. */
    await loadFont();
    frontEnd = createFrontEnd({
      canvas, ctx,
      // The handover gate. The front end walks its own screens freely and only
      // consults these when it is about to leave for gameplay.
      isWorldReady: () => worldReady,
      worldProgress: () => Math.min(1, worldLoaded / WORLD_STEPS),
      worldError: () => (worldError ? worldError.message : null),
      onGameplayStart: ({ difficulty, settings, transitionFrame, gameplayStartDuration, playIntroVoice }) => {
        applyGameplaySettings(difficulty, settings);
        input.jumpPressed = input.leftJabPressed = input.kickPressed = false;
        input.comboPressed = input.upperPressed = input.grabPressed = input.executePressed = false;
        player.bufferedAttack = null;
        startIntroVoice = playIntroVoice ?? null;
        startLevelEntry(transitionFrame, gameplayStartDuration);
        startMusic();                         // BG1 begins under the narrated walk-in
      },
      /* Back from CONTROLS/OPTIONS with the fight still frozen. Whatever the
       * player just changed in there takes effect immediately â€” the old build
       * only ever read settings once, on the way INTO the fight, so a volume
       * change made from pause did nothing until the next run. */
      onPauseReturn: ({ difficulty, settings }) => {
        applyGameplaySettings(difficulty, settings);
        clearPauseInput();
        pauseT = 0;
      },
      onMainMenu: () => {
        paused = false;
        resetMusicPlaylist();
      },
    });
    await frontEnd.load();
    loadingEl.classList.add('hidden');
    /* Time to the first playable screen, measured from navigation start â€” the
     * number this whole split exists to hold down. */
    window.__rorBootMs = Math.round(performance.now());
    canvas.focus();
    requestAnimationFrame(loop);
    // Deliberately NOT awaited: the level streams in behind the studio card,
    // the title, and the menu, and is long finished by the time the player has
    // picked a difficulty.
    loadWorld();
  } catch (err) {
    loadingEl.textContent = `ASSET ERROR — ${err.message}`;
    console.error(err);
  }
})();
