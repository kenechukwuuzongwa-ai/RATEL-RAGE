/* RAGE OF RATELS — WORLD CONFIG : the one source of truth for world space
 *
 * Every level layer is exactly 9259 x 1124 px. The Sky, the Background
 * Parallax, the Main Level / Foreground and the Vehicles all share that SAME
 * coordinate space — they were authored against one another, so architectural
 * elements, roads, openings and walls only line up when every layer is drawn
 * at 100% scale at origin (0,0).
 *
 * Therefore: never resize, crop, stretch, fit-to-screen or independently
 * reposition a layer. And never infer dimensions from how large an image
 * happens to display — read and preserve the SOURCE texture dimensions
 * (9259 x 1124), because a layer that "looks right" on screen while being
 * scaled internally will drift against its neighbours the moment the camera
 * starts moving.
 *
 * The world is ONE continuous authored level. Do not automatically tile or
 * loop the artwork; repetition is only introduced later if gameplay actually
 * requires extending beyond WORLD.WIDTH.
 *
 * This file is constants plus the master-canvas factory. No rendering, no
 * asset loading, no camera logic — those live in the modules that consume it.
 */

/* The complete level-world coordinate system — not merely texture resolution.
 * All four layer PNGs are drawn into this space at 100% scale at (0,0). */
const WORLD = Object.freeze({
  WIDTH: 9259,
  HEIGHT: 1124,
});

/* Draw order is back-to-front: sky sits furthest away and moves least, the
 * main level and foreground are the gameplay plane and move 1:1 with the
 * camera. Vehicles ride the same plane as the main level (1.0) because they
 * move through the world independently rather than as a distant backdrop. */
const LAYERS = Object.freeze([
  Object.freeze({ id: 'sky', parallaxFactor: 0.08 }),
  Object.freeze({ id: 'background', parallaxFactor: 0.45 }),
  Object.freeze({ id: 'main', parallaxFactor: 1.0 }),
  Object.freeze({ id: 'foreground', parallaxFactor: 1.0 }),
  Object.freeze({ id: 'vehicles', parallaxFactor: 1.0 }),
]);

const LAYER_INDEX = new Map(LAYERS.map((layer) => [layer.id, layer]));

/* Look a layer descriptor up by id. Returns undefined for an unknown id so
 * callers can branch on a missing layer instead of catching a throw. */
export function getLayerById(id) {
  return LAYER_INDEX.get(id);
}

/* Build a fresh master world canvas sized to the full authored world. The
 * camera blits a window out of this surface; pre-render passes, debug views
 * and the live compositor each need their OWN surface, so nothing is cached
 * or shared here — every call returns a new canvas.
 *
 * OffscreenCanvas is the modern path; older Safari and some headless contexts
 * lack it, so fall back to a detached <canvas> element, which is a drop-in
 * replacement (same width/height/drawing surface). Never returns null. */
export function getWorldCanvas() {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(WORLD.WIDTH, WORLD.HEIGHT);
  }

  const canvas = document.createElement('canvas');
  canvas.width = WORLD.WIDTH;
  canvas.height = WORLD.HEIGHT;
  return canvas;
}

/* ===========================================================================
 * PLAYAREA — where Darki is allowed to go, in WORLD coordinates.
 *
 * World coordinates specifically: the same space as WORLD.WIDTH / WORLD.HEIGHT
 * and the same space the layers are drawn in. Not canvas pixels, not the
 * camera window, not view space (VIEW_W x VIEW_H / zoom in game.js). A value
 * from here is directly comparable to a row of level-main.png.
 *
 * EVERY NUMBER BELOW IS MEASURED, NEVER GUESSED. They come from the annotated
 * optical reference Playarearef.png as read by _chromakey/playareameasure.js
 * (raw record: _chromakey/playareameasure.json, human summary:
 * _chromakey/playareameasure.out.txt, picture: playareameasure-profile.png).
 * If the plate is ever re-issued, RE-RUN THAT HARNESS — do not re-eyeball the
 * numbers here:
 *
 *     node _chromakey/playareameasure.js
 *
 *   plate      : .wizardgenie/chats/1784403224563/attachments/mtvydesc-Playarearef.png
 *   plate size : 9259 x 1080          world : 9259 x 1124
 *
 * PLATE -> WORLD SCALE IS 1:1, SO A MEASURED PLATE ROW *IS* A WORLD ROW.
 * The plate is exactly WORLD.WIDTH px wide, so nothing was resampled
 * horizontally, and the vertical cannot be scaled independently without
 * squashing the art — the plate is simply the world's top 1080 rows, with the
 * world continuing 44 px below the reference's frame. Cross-check that fixes
 * the mapping: the plate's red pavement band sits at rows 576..581 and
 * game.js carries PLAY.laneTop = 582 — documented there as "measured off the
 * user's red guideline overlaid on the art" — which is the row immediately
 * under that band. Same line, same space, ~1 px apart.
 *
 * RAW MEASUREMENTS read off the plate (all produced by the harness above):
 *
 *   nav bands — rows with coverage >= 50% AND mean saturation >= 0.6, i.e. the
 *   drawn guide lines, in annotation colours the painting itself never reaches:
 *     y  502.. 506  h=5  core y 504  #3b27a9 indigo    cov  79.20%  sat 0.758
 *     y  576.. 581  h=6  core y 579  #dd1a15 red       cov  96.80%  sat 0.833
 *     y 1059..1066  h=8  core y1061  #ff0004 pure red  cov 100.00%  sat 1.000
 *   ground — darkest full-width dark run, searched only below 2/3 height:
 *     rows 720..1058, 339 px thick, darkSpan 95.3%, inkShare 92.5%: that mass
 *     is the road surface BELOW his feet, so it is not the feet line
 *   row bands (rows > 50% covered)   : ONE band, y 117..1079 (cov 85.30%)
 *   column bands (cols > 50% covered): ONE band, x 0..9258   (cov 78.20%)
 *   sharpest row edges: y22/23/25, y507/502/501, y61/58, y1059/1066, y306/305
 *
 * The artwork is full-bleed, so the band scans find no gutters to trim and
 * cannot invent x limits — the playable width is the authored world width,
 * which is also exactly what game.js clamps to (clampPlayerToArena:
 * half .. WORLD_W - half).
 * ======================================================================== */

/* The measured plate rows, named so the derivations below read as arithmetic
 * rather than as magic numbers. Private on purpose: PLAYAREA is the contract,
 * these are only its provenance. Plate row == world row (1:1, see above). */
const PLATE_ROW = Object.freeze({
  BAND_BACK: 504,    // indigo guide 502..506 — drawn over only part of the width (cov 79.2%), i.e. the deeper stretch
  PAVEMENT: 582,     // red guide 576..581 (core 579) — his feet stand on the row just under that band
  BAND_FRONT: 1061,  // pure-red guide 1059..1066, cov 100% — the hard near stop line
  ROOFLINE: 117,     // top of the one dense row band 117..1079 = first built-scenery row, sky above it
});

/* How far inside minX / maxX the physical walls sit, so he stops with his
 * shoulder visibly short of the art edge instead of flush against it. */
const WALL_INSET = 40;

const PLAYAREA = Object.freeze({
  /* y where his feet rest: the pavement line the shops and the parked wheels
   * stand on. game.js agrees to ~1 px (PLAY.laneTop = 582, and it clamps him
   * just below that line so he never crosses the red guide). */
  groundY: PLATE_ROW.PAVEMENT,

  /* The navigation band. On this street it is a DEPTH strip, not a head/feet
   * strip: his feet may ride between these two rows while he is on the
   * pavement. walkTop is the back (furthest) row of that strip, walkBottom
   * the near stop line — "must not drop below" is "must not walk nearer than"
   * here.
   *
   * TASK 10 SHIPPED, recorded so the deltas are not re-litigated:
   *   * near edge — the plate wins: game.js now stops his feet at walkBottom
   *     1061 (its older PLAY.laneBottom 1096 was 35 px looser). Enforced by
   *     clampDepthBand in playarea.js.
   *   * back edge — game.js still carries its own PLAYER_LANE_TOP 590, 8 px
   *     nearer than the red guide at groundY 582, because the background
   *     walkers' ground line sits at 548..556 and Darki must not read as
   *     standing in the residents' street. The indigo walkTop 504 is the DEEPER
   *     stretch's back row (79% coverage on the plate); it stays the mob's
   *     residents' lane (game.js clampLaneBody, 470) and is never Darki's.
   *   * per-region bands were considered and not needed: the forecourt region's
   *     528 is shadowed by the same 590 floor. */
  walkTop: PLATE_ROW.BAND_BACK,
  walkBottom: PLATE_ROW.BAND_FRONT,

  /* Playable width. The column scan came back as ONE full-bleed band 0..9258,
   * so there are no art-derived gutters: these are the authored world extents,
   * maxX being the last authored column (WORLD.WIDTH - 1), not the width.
   * Shipped: the camera bound reads these directly (camXRange / clampCamX in
   * game.js), so panning never reveals an unauthored column. The walls
   * (wallLeftX/wallRightX below) are the tighter pair bodies actually hit. */
  minX: 0,
  maxX: WORLD.WIDTH - 1,

  /* Visual ceiling of the playfield: the top of the dense authored row band,
   * the first row with built scenery across the width. Jumps whose head would
   * rise above it are rejected — above this row is sky, and the head would be
   * clipping through rooflines. TODO(measure): y 305/306 is the strongest
   * full-width authored edge below the sky; it is the tighter, structure-aware
   * ceiling to use if the awnings over the walk lane should block jumps. */
  ceilingY: PLATE_ROW.ROOFLINE,

  /* How far above groundY his head may rise — exactly groundY - walkTop, so
   * the band height and the head clearance can never drift apart. Measured:
   * 582 - 504 = 78 (plate rows directly: 579 - 504 = 75). */
  headroomY: PLATE_ROW.PAVEMENT - PLATE_ROW.BAND_BACK,

  /* Inner walls he is physically blocked by — the measured extents pulled in
   * by WALL_INSET. */
  wallLeftX: WALL_INSET,
  wallRightX: (WORLD.WIDTH - 1) - WALL_INSET,
});

/* A fresh MUTABLE copy of the play area. Callers that tune, debug-draw or
 * level-override a bound need somewhere to write; they must not write to the
 * frozen source, and they must not hand a shared object around either — every
 * call returns its own copy. All fields are primitives, so a spread is the
 * whole copy. */
export function getPlayareaWorld() {
  return { ...PLAYAREA };
}

export { WORLD, LAYERS, PLAYAREA };
export default WORLD;
