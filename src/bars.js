/* RATEL RAGE — THE CINEMATIC BARS, shared (request 399).
 *
 * The letterbox bars are the game's one transition language: the boss
 * entrance, the outro and Level 1's narrated entry (black -> half gate ->
 * open street) all move the same two black rectangles. They lived inside
 * game.js; Level 2's front-end sequence (aftermath -> intro video -> case file
 * -> the fight) needs the SAME bars, so the primitives moved here unchanged
 * and both files import them. Nothing about how Level 1 draws them changed.
 *
 * No state lives in this module: every scene keeps its own `{ letterbox,
 * barFrom, barTo, barU }` record, and `createBarCut()` returns a fresh one. */

/* INFLUENCE, not a swap. `BAR_EASE` is how much of the smoothstep is mixed over
 * the straight ramp: 0 is the raw linear slide, 1 is the full ease-in-ease-out. */
export const BAR_EASE = 0.73;
/* 0.70 lands the bars fully open with 0.05 s to spare inside LEVEL_ENTRY.barsOut. */
export const BAR_DUR = 0.70;

export const easeBars = (u) => {
  const t = Math.max(0, Math.min(1, u));
  const s = t * t * (3 - 2 * t);
  return t + (s - t) * BAR_EASE;
};

/* A pure smoothstep: leaves AND arrives at a standstill. The level entry and the
 * bar cut below use it, so every join is zero-velocity. */
export const easeRest = (u) => {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
};

/* Step one scene's bars toward `target`. Retargeting mid-move restarts the ease
 * FROM WHERE THE BARS ARE. */
export function rampBars(s, target, dt, dur = BAR_DUR, ease = easeBars) {
  if (s.barTo !== target) { s.barFrom = s.letterbox; s.barTo = target; s.barU = 0; }
  s.barU = Math.min(1, (s.barU ?? 1) + dt / Math.max(0.0001, dur));
  s.letterbox = s.barFrom + (target - s.barFrom) * ease(s.barU);
  return s.letterbox;
}

/* Put a scene's bars AT a depth with no move in flight. */
export function setBars(s, v) { s.letterbox = v; s.barFrom = v; s.barTo = v; s.barU = 1; }

/* The timing of the move from open picture to full black and back. These are
 * Level 1's entry numbers (LEVEL_ENTRY.blackHold / gateOpen in game.js read
 * them from here): the black holds 0.55 s and the bars travel 0.90 s. */
export const BAR_CUT = Object.freeze({ close: 0.90, hold: 0.55, open: 0.90 });

/* How much bar is left when the hairline starts fading out, in bar pixels. */
export const HAIRLINE_OUT_PX = 40;

/* The bars at a DEPTH in pixels, top and bottom, with the warm hairline on
 * their inner edges. `holdPx` is the depth the hairline is at full strength
 * (the entry's half gate); it fades out toward full black and toward open. */
export function drawBarsPx(ctx, W, H, px, holdPx = 180) {
  const depth = Math.max(0, px);
  const bars = Math.round(depth);
  if (bars <= 0) return;
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, W, bars);
  ctx.fillRect(0, H - bars, W, bars);
  const openness = Math.max(0, Math.min(1, (H / 2 - depth) / (H / 2 - holdPx)));
  const leaving = Math.min(1, depth / HAIRLINE_OUT_PX);
  const alpha = 0.16 * openness * leaving;
  if (alpha <= 0.004) return;
  ctx.fillStyle = `rgba(255,228,94,${alpha})`;
  ctx.fillRect(0, depth - 2, W, 2);
  ctx.fillRect(0, H - depth, W, 2);
}

/* ONE CUT BETWEEN TWO SCREENS: the bars close to full black, the screen behind
 * them changes, they hold, and they open on the new one. A single object owns
 * the whole move so that:
 *   - only one cut can run at a time (start() refuses while one is running);
 *   - `onClosed` fires exactly ONCE, on the first frame the frame is black —
 *     a latch, never a time comparison, so a long frame cannot skip it and an
 *     update that runs twice cannot fire it twice;
 *   - `onOpen` fires exactly once, on the frame the bars begin to part (the
 *     reveal point — where a video or a narration should start);
 *   - `waitFor` (optional) holds the black until it returns true, with
 *     `maxHold` as the guard so a load that never lands cannot leave the
 *     screen black forever;
 *   - reset() abandons it cleanly from any state, bars open.
 * `depth` is 0 (open) .. 1 (the halves meet). */
export function createBarCut() {
  const s = { phase: 'idle', t: 0, depth: 0, onClosed: null, onOpen: null, waitFor: null, hold: BAR_CUT.hold, maxHold: 6, cuts: 0 };
  const api = {
    get active() { return s.phase !== 'idle'; },
    get phase() { return s.phase; },
    get depth() { return s.depth; },
    get cuts() { return s.cuts; },
    /* Covering the screen (closing, or black): input must not reach it. */
    get covering() { return s.phase === 'closing' || s.phase === 'hold'; },
    start(onClosed, o = {}) {
      if (s.phase !== 'idle') return false;
      s.phase = 'closing'; s.t = 0; s.cuts++;
      s.onClosed = onClosed || null;
      s.onOpen = o.onOpen || null;
      s.waitFor = o.waitFor || null;
      s.hold = o.hold ?? BAR_CUT.hold;
      s.maxHold = o.maxHold ?? 6;
      return true;
    },
    update(dt) {
      if (s.phase === 'idle') return;
      s.t += dt;
      if (s.phase === 'closing') {
        s.depth = easeRest(s.t / BAR_CUT.close);
        if (s.t >= BAR_CUT.close) {
          s.depth = 1; s.phase = 'hold'; s.t = 0;
          const f = s.onClosed; s.onClosed = null;
          if (f) f();
        }
        return;
      }
      if (s.phase === 'hold') {
        s.depth = 1;
        const ready = !s.waitFor || s.waitFor() || s.t >= s.maxHold;
        if (s.t >= s.hold && ready) {
          s.phase = 'opening'; s.t = 0;
          const f = s.onOpen; s.onOpen = null;
          if (f) f();
        }
        return;
      }
      s.depth = 1 - easeRest(s.t / BAR_CUT.open);
      if (s.t >= BAR_CUT.open) { s.depth = 0; s.phase = 'idle'; s.t = 0; }
    },
    reset() { s.phase = 'idle'; s.t = 0; s.depth = 0; s.onClosed = null; s.onOpen = null; s.waitFor = null; },
    draw(ctx, W, H, holdPx = 180) { if (s.depth > 0) drawBarsPx(ctx, W, H, s.depth * H / 2, holdPx); },
  };
  return api;
}
