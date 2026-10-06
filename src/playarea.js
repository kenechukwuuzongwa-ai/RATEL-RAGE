/* RAGE OF RATELS — PLAYAREA : the one authority on where Darki may stand.
 *
 * Answers three questions and nothing else: is this point / this body box inside
 * Darki's playarea, which bound stopped it, and where does it get pushed to.
 *
 * Pure and side-effect-free: no canvas, no DOM, no timers, no module state, no
 * rendering, and no write to anything the caller did not hand over. The only
 * import is worldConfig.js, which owns every number used here.
 *
 * ========================== COORDINATE CONTRACT ============================
 *
 * ALL arguments and ALL returns are WORLD COORDINATES — the same space as
 * WORLD.WIDTH / WORLD.HEIGHT, as PLAYAREA, and as the level layers themselves.
 * Not canvas pixels, not the camera window, not view space (VIEW_W / VIEW_H or
 * `zoom` in game.js). A y here is directly comparable to a row of level-main.png.
 *
 * y GROWS DOWNWARD: y 0 is the top of the world (sky), y 1123 the bottom. "Above"
 * therefore means the SMALLER y and "below" the larger, on screen and throughout
 * this file.
 *
 * y IS THE FEET, x IS THE BODY'S CENTRE. Darki's origin is the centre of his
 * feet: (x, y) is the single point where he meets the ground, so his body box is
 *
 *     x - halfWidth .. x + halfWidth          (the feet span)
 *     y - height    .. y                      (his head is at the SMALLEST y)
 *
 * That is the convention game.js already uses — bodies are clamped and collided
 * on `y` as their ground row (clampPlayerLane; laneDodge's `enemy.y - 42`).
 *
 * y IS A DEPTH ROW, NOT HEIGHT ABOVE THE GROUND. The street is drawn in fake
 * depth, so a LARGER y is NEARER the camera, and the rows he may stand on run
 * from PLAYAREA.walkTop (the back, furthest away) to PLAYAREA.walkBottom (the
 * near stop line). A hop off the ground is a separate field — `jumpY`, negative
 * while airborne — and this module never touches it: these functions answer "may
 * his feet be on this row", not "is he mid-jump". game.js owns the arc.
 * ==========================================================================
 */

import { PLAYAREA, WORLD } from './worldConfig.js';

/* The body box used when an entity carries none of its own (see
 * nudgeIntoPlayarea). Darki's REAL numbers live in game.js and are larger than
 * these: PLAYER.hitW = 70 — "collision box, narrower than the art" — so a half
 * width of 35, and 200 px of drawn height (SHEET.drawH). These two are fallbacks
 * only; a caller that knows its own box passes it in. */
const DEFAULT_HALF_WIDTH = 28;
const DEFAULT_HEIGHT = 148;

/* Clamp a proposed feet position into the playarea.
 *
 *   x          proposed centre x, world px
 *   y          proposed feet/base y, world px (the row he stands on)
 *   halfWidth  half his own body width — his span is x ± halfWidth
 *   height     his full body height — his head sits at y - height
 *
 * Returns a NEW { x, y, hitX, hitY }; the arguments are never written to. x is
 * clamped so his whole span stays inside the walls:
 *
 *     [ wallLeftX + halfWidth , wallRightX - halfWidth ]
 *
 * (PLAYAREA.minX / maxX are the authored world extents those walls sit inside —
 * the walls are what a body actually hits.) And y is clamped so his feet never
 * rise above the band top — walkTop + height, which is what keeps his head under
 * it — and never drop below the pavement, groundY.
 *
 * `hitX` / `hitY` name the bound that stopped him, as -1 / 0 / 1. The sign says
 * which END of the axis he ran into, so a caller can zero the velocity that dug
 * into it:
 *
 *     hitX === -1   the LEFT wall        -> vx = Math.max(vx, 0)
 *     hitX ===  1   the RIGHT wall       -> vx = Math.min(vx, 0)
 *     hitY === -1   the band's BACK end  -> vy = Math.max(vy, 0)   (wanted to go further back)
 *     hitY ===  1   the PAVEMENT line    -> vy = Math.min(vy, 0)   (wanted to walk nearer)
 *     hitX / hitY === 0   free on that axis
 *
 * NOTE(measure) — the two vertical rules can contradict each other, and the floor
 * wins. walkTop + height keeps the head under the band top only while the body
 * fits the band's headroom (PLAYAREA.headroomY = 78 px). Darki does not: he is
 * 148 px by this file's default and 200 px in the art, so walkTop + height lands
 * at 652 — 70 px BELOW the pavement line at 582 — and the allowed range
 * [walkTop + height, groundY] inverts to [652, 582], i.e. empty. The Math.min
 * below collapses the ceiling onto the pavement when that happens, so the result
 * is always a real row and never a body sunk under the road: any height greater
 * than headroomY pins his feet to groundY, which is game.js's own default laneTop.
 *
 * TASK 10 SHIPPED, in two places, neither of them hidden:
 *   * the live depth bound for a tall body is `clampDepthBand` below — the same
 *     band read on the FEET axis (groundY .. walkBottom), which is the axis this
 *     street actually uses, instead of pinning him to one row; and
 *   * this head-clearance form stays as the body-aware question (canOccupy /
 *     clampToPlayarea) for anything that fits the headroom, and its x rule —
 *     the walls — is taken verbatim by the live bound.
 * The note stays because the contradiction is real property of the numbers, not
 * a bug to paper over: a 78 px band and a 200 px man cannot share one rule. */
export function clampToPlayarea(x, y, halfWidth = DEFAULT_HALF_WIDTH, height = DEFAULT_HEIGHT) {
  /* Horizontal — his feet span stays inside the walls. */
  const left = PLAYAREA.wallLeftX + halfWidth;
  const right = PLAYAREA.wallRightX - halfWidth;
  let cx = x;
  let hitX = 0;
  if (cx < left) { cx = left; hitX = -1; }
  else if (cx > right) { cx = right; hitX = 1; }

  /* Vertical — the pavement is the hard floor; the band top is the ceiling when
   * the body fits under it (see NOTE(measure) above). */
  const floor = PLAYAREA.groundY;
  const ceiling = Math.min(PLAYAREA.walkTop + height, floor);
  let cy = y;
  let hitY = 0;
  if (cy < ceiling) { cy = ceiling; hitY = -1; }
  else if (cy > floor) { cy = floor; hitY = 1; }

  return { x: cx, y: cy, hitX, hitY };
}

/* Would this box fit exactly where it stands? The boolean twin of the clamp,
 * for AI and spawn checks that must not move anything: true means
 * clampToPlayarea would have returned the same x and y. It delegates to the
 * clamp precisely so the two can never drift apart, and writes to nothing. */
export function canOccupy(x, y, halfWidth = DEFAULT_HALF_WIDTH, height = DEFAULT_HEIGHT) {
  const fit = clampToPlayarea(x, y, halfWidth, height);
  return fit.x === x && fit.y === y;
}

/* THE DEPTH BAND, ON THE FEET AXIS — the form game.js enforces every frame.
 *
 * Why this exists beside clampToPlayarea: on this street y is a DEPTH row, not
 * altitude, and a 200 px man against 78 px of headroom cannot satisfy the
 * head-clearance rule at all (see NOTE(measure) above). So the live bound reads
 * the same authored band on the axis the engine actually uses — the feet:
 *
 *     [ groundY   (the red pavement guide · the BACK edge · furthest away)
 *       walkBottom (the pure-red near stop line · NEAREST the camera) ]
 *
 * Larger y is nearer, so groundY is the furthest row his feet may stand on and
 * walkBottom the closest — the two boundaries drawn in red on the reference
 * plate. Returns { y, hitY } with clampToPlayarea's sign convention:
 *
 *     hitY === -1   wanted to go back past the red guide   -> depthV = max(depthV, 0)
 *     hitY ===  1   wanted to walk past the near stop line -> depthV = min(depthV, 0)
 *     hitY ===  0   free on depth
 *
 * `jumpY` is NOT this axis: a hop is the arc's own field and never touches this
 * bound, which is exactly why the fold is safe for gameplay. Shipped as task 10;
 * game.js's PLAYAREA block consumes this and nothing else for depth. */
export function clampDepthBand(y) {
  if (y < PLAYAREA.groundY) return { y: PLAYAREA.groundY, hitY: -1 };
  if (y > PLAYAREA.walkBottom) return { y: PLAYAREA.walkBottom, hitY: 1 };
  return { y, hitY: 0 };
}

/* The cheap gate: "is Darki on the navigation band right now?" — the question
 * behind the 'out of band' debug tint and behind refusing a spawn that would
 * drop a body out of bounds.
 *
 * Point-only on purpose: no body box, two comparisons per axis, so it can be
 * called every frame per body without a cost profile. Inside means inside the
 * walls on x and between the band's two authored rows on y, edges included:
 *
 *     [ wallLeftX , wallRightX ] x [ walkTop , walkBottom ]
 *
 * Being in band is necessary but NOT sufficient for the body-aware test: a centre
 * inside the band can still leave his shoulders in a wall, and a body taller than
 * headroomY cannot satisfy the ceiling rule at all — ask canOccupy for that. The
 * WORLD backstop rejects grossly mis-authored positions (a spawn written as
 * x 12000) before the band comparisons are worth spending. */
export function isWithinBand(x, y) {
  if (x < 0 || x > WORLD.WIDTH - 1 || y < 0 || y > WORLD.HEIGHT - 1) return false;
  return (
    x >= PLAYAREA.wallLeftX && x <= PLAYAREA.wallRightX
    && y >= PLAYAREA.walkTop && y <= PLAYAREA.walkBottom
  );
}

/* The allowed region as one world-space rect, { x, y, w, h } — for the debug
 * overlay to stroke and for camera-clamp maths to work against. A fresh object
 * per call: callers may keep or mutate their copy, the module keeps none.
 *
 *     x = wallLeftX    w = wallRightX - wallLeftX   (9178 px wide)
 *     y = walkTop      h = groundY    - walkTop     (78 px = PLAYAREA.headroomY)
 *
 * Read h with care: it is the HEAD-CLEARANCE form — the strip from the band top
 * down to the pavement — and it deliberately stops at groundY even though his
 * feet may walk nearer than that. The near half (groundY .. walkBottom) is the
 * feet band enforced by clampDepthBand, and a caller that needs the whole
 * walkable region should use both. (Task 10 kept the rect as the head form
 * rather than silently widening it: the camera's own bound is camYRange in
 * game.js, read off walkBottom, so nothing here feeds the frame anymore.) */
export function playareaRect() {
  return {
    x: PLAYAREA.wallLeftX,
    y: PLAYAREA.walkTop,
    w: PLAYAREA.wallRightX - PLAYAREA.wallLeftX,
    h: PLAYAREA.groundY - PLAYAREA.walkTop,
  };
}

/* Push an entity that is already out of bounds back inside, in one call.
 *
 * Mutates the object it is handed — `.x` and `.y` become the clamped feet
 * position, and the two booleans the caller wants are written onto it:
 *
 *     entity.xBlocked   his x had to move (he was in or past a wall)
 *     entity.yBlocked   his y had to move (off the back of the band, or below
 *                       the pavement line)
 *
 * `.halfWidth` / `.height` are read when present and default to 28 / 148 when
 * absent, so an entity that carries no box of its own still lands somewhere sane.
 * Everything else on the entity is left alone. The entity is also returned, so
 * `nudgeIntoPlayarea(agent)` and `agent = nudgeIntoPlayarea(agent)` both read
 * well. */
export function nudgeIntoPlayarea(entity) {
  const halfWidth = entity.halfWidth ?? DEFAULT_HALF_WIDTH;
  const height = entity.height ?? DEFAULT_HEIGHT;
  const fit = clampToPlayarea(entity.x, entity.y, halfWidth, height);

  entity.x = fit.x;
  entity.y = fit.y;
  entity.xBlocked = fit.hitX !== 0;
  entity.yBlocked = fit.hitY !== 0;

  return entity;
}
