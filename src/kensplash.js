/* THE KENCRAFTS GAME CUBE, IN CODE (request 612: "recode the gamebox 3d animation for a cleaner logo
 * splash"). The studio clip's cube was a photographic render baked into an MP4; this draws it live
 * instead — a small flat-shaded 3D renderer on the 2D canvas, no WebGL and no library:
 *
 *   - a rounded box (cube-to-sphere corner mapping, so the bevels are true arcs) in gunmetal with a
 *     glossy specular, and the orange GLOWING EDGE the original has between its two visible sides;
 *   - the joystick on top (chrome rim, dark well, stem, domed cap), the D-pad on the left side and the
 *     four orange buttons on the front. The buttons are PLAIN: the clip's triangle/circle/square/cross
 *     marks are console-controller glyphs, which the game never shows (rule of request 577).
 *
 * The motion is the clip's own, measured frame by frame (_chromakey/req603/track.js): the parts fly in
 * and lock together (0.25 - 1.0 s), the cube turns and settles while it pulls back (1.0 - 1.8 s), slides
 * left as the wordmark arrives (1.8 - 2.1 s), shrinks to the lockup size (2.43 - 2.93 s), holds, and
 * dissolves (4.8 - 5.15 s). Times and pixels are the clip's (1920x1080), so the caller maps them with
 * the same cover fit the video used, and the wordmark (frontend.js drawKenCraftsType) stays in step.
 *
 * Painter's algorithm: the body's visible quads are drawn far-to-near, then each part (they sit on the
 * faces of a convex body, so drawing them after it is correct), each part's own faces far-to-near. */

const deg = Math.PI / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutCubic = (v) => 1 - Math.pow(1 - clamp01(v), 3);
const easeInOut = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const easeOutBack = (v) => { v = clamp01(v); const c = 1.6; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* Where the cube is: [t, centre x, centre y, bbox width] in clip px. 1.70 s onward is the tracked box of
 * the filmed cube; before that the frames were read off the contact sheet. */
const POSE = [
  [0.25, 960, 560, 1250], [0.6, 948, 560, 1060], [0.8, 930, 560, 960], [1.0, 915, 560, 864],
  [1.2, 919, 557, 640], [1.4, 917, 548, 490], [1.6, 922, 545, 432],
  [1.7, 924, 545, 413], [1.767, 917, 545, 416], [1.8, 897, 545, 421], [1.833, 861, 545, 425],
  [1.867, 819, 545, 424], [1.9, 784, 545, 421], [1.933, 757, 546, 419], [1.966, 738, 546, 417],
  [2.0, 725, 543, 403], [2.033, 717, 544, 401], [2.066, 712, 544, 401], [2.1, 711, 544, 401],
  [2.433, 710, 543, 398], [2.466, 711, 543, 390], [2.499, 713, 544, 373], [2.533, 715, 545, 351],
  [2.566, 718, 542, 305], [2.599, 721, 541, 271], [2.632, 723, 540, 238], [2.666, 725, 539, 207],
  [2.699, 726, 539, 188], [2.732, 727, 539, 172], [2.766, 728, 539, 162], [2.799, 729, 539, 154],
  [2.832, 730, 539, 151], [2.866, 730, 539, 146], [2.899, 730, 539, 144], [2.932, 731, 539, 143],
];
function lerpPose(t) {
  if (t <= POSE[0][0]) return POSE[0].slice(1);
  for (let i = 1; i < POSE.length; i++) {
    if (t <= POSE[i][0]) {
      const a = POSE[i - 1], b = POSE[i], k = (t - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
    }
  }
  return POSE[POSE.length - 1].slice(1);
}
const SETTLED_AT = 1.8;                     // from here the cube no longer turns, only moves and scales
const SETTLED_W = 426;                      // its largest on-screen width after that (clip px)
/* How the cube is turned: yaw shows the D-pad side (left) and the button face (right), pitch tips the
 * joystick top toward the eye. It spins in on the assembly, then eases to the clip's final angle. */
function orient(t) {
  const a = easeOutCubic((t - 0.25) / 0.75);                  // 0.25 -> 1.0: the spin-in
  const b = easeInOut((t - 1.0) / 0.8);                       // 1.0 -> 1.8: the settle
  const yaw = (-75 + 95 * a) + 14 * b;                        // ends at 34 degrees
  const pitch = (48 - 30 * a) + 8 * b;                        // ends at 26 degrees
  const roll = (12 - 12 * a);
  return { yaw: yaw * deg, pitch: pitch * deg, roll: roll * deg };
}
/* How far each part still is from its seat during the assembly (model units), and the body's fade-in. */
function assembly(t) {
  const fly = (start, dur) => 1 - easeOutBack((t - start) / dur);
  return {
    body: clamp01((t - 0.25) / 0.3),
    bodyGrow: 0.86 + 0.14 * easeOutCubic((t - 0.25) / 0.6),
    dpad: [-2.6 * fly(0.42, 0.5), 0.5 * fly(0.42, 0.5), 0],
    stick: [0, 2.8 * fly(0.36, 0.55), 0],
    buttons: [[0.0, 0.42], [0.42, 0.0], [0.0, -0.42], [-0.42, 0.0]].map(([bx, by], i) => {
      const f = fly(0.55 + i * 0.06, 0.45);
      return [bx * 3.5 * f + 0.6 * f, by * 3.5 * f - 0.4 * f, 2.4 * f];
    }),
    parts: clamp01((t - 0.32) / 0.2),
  };
}

/* ------------------------------------------------------------------ geometry (built once) */
const R = 0.34;                                                // corner radius, of a half-size of 1
function buildBody() {
  const n = 8;                                                 // bevel steps: smooth arcs at the cube's largest size
  const ax = [-1];
  for (let i = n - 1; i >= 1; i--) ax.push(-((1 - R) + R * Math.tan((i / n) * 45 * deg)));
  ax.push(-(1 - R), 1 - R);
  for (let i = 1; i < n; i++) ax.push((1 - R) + R * Math.tan((i / n) * 45 * deg));
  ax.push(1);
  const lim = 1 - R;
  const map = (p) => {
    const inner = p.map((c) => Math.max(-lim, Math.min(lim, c)));
    const d = norm([p[0] - inner[0], p[1] - inner[1], p[2] - inner[2]]);
    const flat = p.every((c, i) => Math.abs(c - inner[i]) < 1e-9);
    return flat ? null : [inner[0] + d[0] * R, inner[1] + d[1] * R, inner[2] + d[2] * R];
  };
  const quads = [];
  // the six faces: axis index of the face normal, its sign, and the two in-plane axes
  const faces = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
  for (const [w, sgn] of faces) {
    const [u, v] = [0, 1, 2].filter((k) => k !== w);
    for (let i = 0; i < ax.length - 1; i++) {
      for (let j = 0; j < ax.length - 1; j++) {
        const corners = [[ax[i], ax[j]], [ax[i + 1], ax[j]], [ax[i + 1], ax[j + 1]], [ax[i], ax[j + 1]]].map(([a, b]) => {
          const p = [0, 0, 0]; p[w] = sgn; p[u] = a; p[v] = b;
          const m = map(p);
          return m || [p[0] * 1, p[1] * 1, p[2] * 1];
        });
        // winding so the normal points out
        const c = [0, 1, 2].map((k) => corners.reduce((s, q) => s + q[k], 0) / 4);
        const e1 = corners[1].map((x, k) => x - corners[0][k]), e2 = corners[3].map((x, k) => x - corners[0][k]);
        const nrm = norm([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
        const out = norm(c);
        const pts = dot(nrm, out) < 0 ? corners.slice().reverse() : corners;
        // smooth normal: from the inner box to the centre
        const inner = c.map((x) => Math.max(-lim, Math.min(lim, x)));
        const sn = norm([c[0] - inner[0], c[1] - inner[1], c[2] - inner[2]]);
        const n2 = Math.hypot(c[0] - inner[0], c[1] - inner[1], c[2] - inner[2]) < 1e-6 ? (() => { const q = [0, 0, 0]; q[w] = sgn; return q; })() : sn;
        // the glowing seam: the rounded vertical edge between the D-pad side (-X) and the button face (+Z)
        let glow = 0;
        if (c[0] < -lim + 0.01 && c[2] > lim - 0.01) {
          const phi = Math.atan2(c[2] - lim, -(c[0] + lim)) / deg;          // 0 on the D-pad side, 90 on the button face
          const along = Math.abs(c[1]) < lim ? 1 : Math.max(0, 1 - (Math.abs(c[1]) - lim) / (R * 0.8));
          glow = Math.exp(-Math.pow((phi - 45) / 11, 2)) * along;
        }
        quads.push({ pts, n: n2, glow });
      }
    }
  }
  return quads;
}
/* A disc/prism: a polygon of `sides` on the plane `axis` = h, radius r, around (cu, cv) in-plane. */
function ring(sides, r, cu, cv, axis, h) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const p = [0, 0, 0];
    const [u, v] = [0, 1, 2].filter((k) => k !== axis);
    p[axis] = h; p[u] = cu + Math.cos(a) * r; p[v] = cv + Math.sin(a) * r;
    pts.push(p);
  }
  return pts;
}
/* A prism from an outline at `h0` to `h1` along `axis`: its side walls and its cap. */
function prism(outline0, outline1, axis, mat, capMat) {
  const faces = [];
  const n = outline0.length;
  for (let i = 0; i < n; i++) {
    const a0 = outline0[i], a1 = outline0[(i + 1) % n], b1 = outline1[(i + 1) % n], b0 = outline1[i];
    faces.push({ pts: [a0, a1, b1, b0], mat, side: true });
  }
  faces.push({ pts: outline1.slice(), mat: capMat || mat, cap: true });
  return faces;
}
function buildParts() {
  const parts = [];
  // TOP (+Y): chrome rim, dark well, the stem and the domed cap
  {
    const f = [];
    f.push({ pts: ring(40, 0.74, 0, 0, 1, 1.004), mat: 'chrome', cap: true });
    f.push({ pts: ring(40, 0.62, 0, 0, 1, 1.008), mat: 'well', cap: true });
    f.push({ pts: ring(40, 0.5, 0, 0, 1, 1.012), mat: 'glowRing', cap: true });
    f.push({ pts: ring(40, 0.46, 0, 0, 1, 1.016), mat: 'well', cap: true });
    f.push(...prism(ring(18, 0.17, 0, 0, 1, 1.016), ring(18, 0.17, 0, 0, 1, 1.28), 1, 'stick'));
    f.push(...prism(ring(28, 0.38, 0, 0, 1, 1.26), ring(28, 0.38, 0, 0, 1, 1.38), 1, 'stick', 'stick'));
    f.push(...prism(ring(28, 0.38, 0, 0, 1, 1.38), ring(28, 0.3, 0, 0, 1, 1.45), 1, 'stick', 'stickTop'));
    parts.push({ key: 'stick', faces: f, face: [0, 1, 0], center: [0, 1, 0] });
  }
  // LEFT (-X): the D-pad, a raised cross
  {
    const w = 0.17, L = 0.56;
    const cross = [[-w, L], [w, L], [w, w], [L, w], [L, -w], [w, -w], [w, -L], [-w, -L], [-w, -w], [-L, -w], [-L, w], [-w, w]];
    // (y, z) in the face; x = -1 -> -1.1
    const at = (x) => cross.map(([y, z]) => [x, y, z]);
    const f = prism(at(-1.0), at(-1.11), 0, 'dpad', 'dpadTop');
    f.push({ pts: ring(24, 0.12, 0, 0, 0, -1.115).map((p) => p), mat: 'dpadDish', cap: true });
    parts.push({ key: 'dpad', faces: f, face: [-1, 0, 0], center: [-1, 0, 0] });
  }
  // FRONT (+Z): four plain orange buttons in a diamond
  [[0.0, 0.42], [0.42, 0.0], [0.0, -0.42], [-0.42, 0.0]].forEach(([bx, by], i) => {
    const f = [];
    f.push({ pts: ring(26, 0.215, bx, by, 2, 1.004), mat: 'socket', cap: true });
    f.push(...prism(ring(22, 0.175, bx, by, 2, 1.004), ring(22, 0.175, bx, by, 2, 1.1), 2, 'button', 'buttonTop'));
    f.push({ pts: ring(22, 0.11, bx, by, 2, 1.103), mat: 'buttonDish', cap: true });
    parts.push({ key: 'button' + i, faces: f, face: [0, 0, 1], center: [bx, by, 1] });
  });
  return parts;
}

/* ------------------------------------------------------------------ shading */
const MAT = {
  body:       { c: [92, 94, 100],  amb: 0.22, dif: 1.05, spec: 0.9,  sh: 22, env: 0.18 },
  chrome:     { c: [196, 199, 205], amb: 0.45, dif: 0.6,  spec: 1.0,  sh: 40, env: 0.2 },
  well:       { c: [18, 19, 22],   amb: 0.5,  dif: 0.5,  spec: 0.25, sh: 18, env: 0 },
  glowRing:   { c: [255, 120, 30], amb: 1,    dif: 0,    spec: 0,    sh: 1,  env: 0, emit: 1 },
  stick:      { c: [30, 31, 35],   amb: 0.38, dif: 0.7,  spec: 0.9,  sh: 30, env: 0.18 },
  stickTop:   { c: [40, 41, 46],   amb: 0.42, dif: 0.65, spec: 0.7,  sh: 22, env: 0.12 },
  dpad:       { c: [20, 21, 24],   amb: 0.45, dif: 0.6,  spec: 0.5,  sh: 24, env: 0.1 },
  dpadTop:    { c: [28, 29, 33],   amb: 0.45, dif: 0.6,  spec: 0.6,  sh: 24, env: 0.12 },
  dpadDish:   { c: [16, 17, 20],   amb: 0.55, dif: 0.4,  spec: 0.2,  sh: 10, env: 0 },
  socket:     { c: [14, 14, 16],   amb: 0.6,  dif: 0.3,  spec: 0.2,  sh: 10, env: 0 },
  button:     { c: [214, 86, 12],  amb: 0.5,  dif: 0.6,  spec: 0.5,  sh: 22, env: 0, emitK: 0.25 },
  buttonTop:  { c: [255, 128, 32], amb: 0.55, dif: 0.55, spec: 0.75, sh: 28, env: 0, emitK: 0.2 },
  buttonDish: { c: [238, 104, 20], amb: 0.6,  dif: 0.45, spec: 0.4,  sh: 14, env: 0, emitK: 0.2 },
};
const LIGHT = norm([-0.78, 0.55, 0.3]);       // key light: above, left, in front (view space)
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
const GLOW = [255, 112, 24];
function shade(mat, n, glow = 0) {
  const m = MAT[mat];
  if (m.emit) return `rgb(${m.c[0]},${m.c[1]},${m.c[2]})`;
  const d = Math.max(0, dot(n, LIGHT));
  const s = Math.pow(Math.max(0, dot(n, HALF)), m.sh) * m.spec * 255;
  // a cool "studio" reflection on surfaces that face up, which reads as metal on white
  const env = m.env * Math.max(0, n[1]) * 140;
  const k = m.amb + m.dif * d;
  const e = m.emitK || 0;
  const ch = (i) => {
    let v = m.c[i] * (k + e) + s + env;
    if (glow > 0) v = v * (1 - glow * 0.85) + GLOW[i] * glow * (0.9 + 0.3 * d);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}

/* ------------------------------------------------------------------ the renderer */
export function createKenCube() {
  const body = buildBody();
  const parts = buildParts();
  let cache = null;                                           // { key, canvas, cx, cy } of the last frame
  const off = document.createElement('canvas');
  const og = off.getContext('2d');

  function rotator(o) {
    const cy = Math.cos(o.yaw), sy = Math.sin(o.yaw), cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
    const cr = Math.cos(o.roll), sr = Math.sin(o.roll);
    return (p) => {
      // yaw about Y, then pitch about X, then roll about Z
      let x = p[0] * cy + p[2] * sy, z = -p[0] * sy + p[2] * cy, y = p[1];
      const y2 = y * cp - z * sp, z2 = y * sp + z * cp; y = y2; z = z2;
      const x3 = x * cr - y * sr, y3 = x * sr + y * cr;
      return [x3, y3, z];
    };
  }
  const D = 7.5;                                              // eye distance, in cube half-sizes
  const proj = (q, s, cx, cy) => { const w = D / (D - q[2]); return [cx + q[0] * s * w, cy - q[1] * s * w, q[2]]; };

  /* Draws the cube for clip time `t` into `g`, centred on (cx, cy), `s` px per model unit. */
  function renderInto(g, t, cx, cy, s) {
    const o = orient(t), rot = rotator(o), A = assembly(t);
    const grow = A.bodyGrow;
    g.lineJoin = 'round';
    // the body, far to near
    const vis = [];
    for (const q of body) {
      const n = rot(q.n);
      if (n[2] <= 0.0) continue;
      const pts = q.pts.map((p) => proj(rot([p[0] * grow, p[1] * grow, p[2] * grow]), s, cx, cy));
      vis.push({ pts, z: pts.reduce((a, p) => a + p[2], 0) / pts.length, col: shade('body', n, q.glow) });
    }
    vis.sort((a, b) => a.z - b.z);
    for (const v of vis) fillPoly(g, v.pts, v.col);
    // the parts, each after the body, in order of their face's depth
    const offs = { stick: A.stick, dpad: A.dpad, button0: A.buttons[0], button1: A.buttons[1], button2: A.buttons[2], button3: A.buttons[3] };
    const order = parts.map((p) => ({ p, z: rot(p.face)[2] })).sort((a, b) => a.z - b.z);
    for (const { p } of order) {
      const d = offs[p.key];
      const list = [];
      for (const f of p.faces) {
        // in MODEL space first: the polygon where the part is right now, and its normal pointed OUT
        const m = f.pts.map((v) => [v[0] + d[0], v[1] + d[1], v[2] + d[2]]);
        const e1 = m[1].map((x, k) => x - m[0][k]), e2 = m[2].map((x, k) => x - m[0][k]);
        let nm = norm([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
        if (f.cap) {
          if (dot(nm, p.face) < 0) nm = nm.map((x) => -x);           // a cap faces away from the body
        } else {
          // a wall faces away from the part's OWN axis (each button has its own)
          const cm = [0, 1, 2].map((k) => m.reduce((a, q) => a + q[k], 0) / m.length);
          const rel = [0, 1, 2].map((k) => cm[k] - (p.center[k] + d[k]));
          const along = dot(rel, p.face);
          const outward = [0, 1, 2].map((k) => rel[k] - p.face[k] * along);
          if (dot(nm, outward) < 0) nm = nm.map((x) => -x);
        }
        const n = rot(nm);
        if (n[2] <= 0) continue;
        const pts = m.map((v) => proj(rot([v[0] * grow, v[1] * grow, v[2] * grow]), s, cx, cy));
        list.push({ pts, z: pts.reduce((a, q) => a + q[2], 0) / pts.length + (f.cap ? 0.002 : 0), col: shade(f.mat, n) });
      }
      list.sort((a, b) => a.z - b.z);
      for (const v of list) fillPoly(g, v.pts, v.col);
    }
    g.globalAlpha = 1;
  }
  function fillPoly(g, pts, col) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fillStyle = col;
    g.fill();
    g.strokeStyle = col;                                     // closes the hairline seams between quads
    g.lineWidth = 0.9;
    g.stroke();
  }
  /* Pixels per model unit that make the cube's on-screen box `w` wide at this orientation. */
  function unitFor(t, w) {
    const rot = rotator(orient(t));
    let lo = Infinity, hi = -Infinity;
    for (const q of body) for (const p of q.pts) { const r = proj(rot(p), 1, 0, 0); lo = Math.min(lo, r[0]); hi = Math.max(hi, r[0]); }
    return w / Math.max(0.001, hi - lo);
  }

  return {
    /* Draws the cube for clip time `t` on `ctx`: (ox, oy) and `k` map clip px to the screen (cover fit).
     * `alpha` fades it (the dissolve); `shutter`/`samples` give it the clip's motion blur.
     * `dev` is the canvas's device pixels per layout pixel (request 613): the cube is rendered at the
     * SCREEN's resolution, not the 1280x720 layout's, so it is as sharp as vector art on any display. */
    draw(ctx, t, ox, oy, k, o = {}) {
      if (t < 0.25) return;
      const dev = Math.max(1, o.dev || 1);
      const [, , pw] = lerpPose(t);
      /* ONCE IT STOPS TURNING (1.8 s on) the cube only moves and scales, so it is rendered ONCE at its
       * largest settled size and that picture is scaled from then on: the slide, the shrink and the whole
       * hold cost one drawImage a frame, which is what keeps a phone smooth. Before that it re-renders. */
      const settled = t >= SETTLED_AT;
      const renderW = settled ? SETTLED_W : pw;
      const s = unitFor(settled ? SETTLED_AT : t, renderW) * k * dev;    // device px per model unit
      const size = Math.ceil(renderW * k * dev * 1.9);         // the offscreen canvas: room for the parts flying in
      const key = settled ? `S|${size}` : `${Math.round(t * 240)}|${size}`;
      if (!cache || cache.key !== key) {
        if (off.width !== size || off.height !== size) { off.width = size; off.height = size; }
        og.setTransform(1, 0, 0, 1, 0, 0);
        og.clearRect(0, 0, size, size);
        renderInto(og, settled ? SETTLED_AT : t, size / 2, size / 2, s);
        cache = { key };
      }
      const alpha = (o.alpha ?? 1) * assembly(t).body;
      if (alpha <= 0) return;
      /* motion blur: the same frame laid along the path the cube took over the shutter, an even average */
      const n = o.samples || 1;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      for (let j = 0; j < n; j++) {
        const tj = n > 1 ? t - (o.shutter || 0) * (1 - j / (n - 1)) : t;
        const [jx, jy, jw] = lerpPose(Math.max(0.25, tj));
        const sc = jw / renderW;
        const dw = size * sc / dev;
        ctx.globalAlpha = alpha / (j + 1);
        ctx.drawImage(off, ox + jx * k - dw / 2, oy + jy * k - dw / 2, dw, dw);
      }
      ctx.restore();
    },
    /* How far the cube travels (clip px, centre + size) over `dt` ending at t — for the blur sample count. */
    travel(t, dt) {
      const a = lerpPose(Math.max(0.25, t - dt)), b = lerpPose(t);
      return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    },
  };
}
