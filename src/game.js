// Rage of Ratels — Lagos street side-scroller slice.
// Player walk: "Newwalksprite.png" (5x4 sheet, manifest-driven). Street tiles
// are code-rendered into an atlas at boot per the production manual (no
// external tile art).

const VIEW_W = 1280;
const VIEW_H = 720;
const WORLD_W = 6400;
const GROUND_Y = 620;          // top of the road surface the player stands on
const LANE_TOP = 610;
const LANE_BOTTOM = 700;
const TILE = 64;

const SHEET = {
  src: 'Newwalksprite.png',
  metaSrc: 'Newwalksprite.json', // animation frames/fps come from here
  cols: 5,                     // fallbacks if the JSON is missing
  rows: 4,
  faces: 1,                    // art faces right; flip when moving left
  drawH: 200,                  // character height on screen (opaque pixels)
};

const IDLE_SHEET = {
  src: 'IDLE.png',
  metaSrc: 'IDLE.json',
  cols: 6,
  rows: 5,
  faces: 1,
  drawH: SHEET.drawH,
  manifest: true,
};

const UPPERCUT_SHEET = {
  src: 'VDM-Uppercut.png',
  metaSrc: 'VDM-Uppercut.json', // manifest + combat pointer to VDM-Uppercut.hits.json
  cols: 6,
  rows: 5,
  faces: 1,
  drawH: SHEET.drawH,
  bodyFrame: 0,                // scale this stance frame to drawH so his body
  manifest: true,              // matches the walk sheet (the raised fist would
};                             // otherwise shrink him via the union box)

const JUMP_SHEET = {
  src: 'Jump.png',
  metaSrc: 'Jump.json',
  cols: 6,
  rows: 6,
  faces: 1,
  drawH: SHEET.drawH,
  bodyFrame: 0,                // crouched launch frame ≈ full body height
};

const GINGER_SHEET = {          // street enemy: idle + hit sections
  src: 'Ginger.png',
  metaSrc: 'Ginger.json',
  cols: 9,
  rows: 9,
  faces: 1,                    // art faces right
  drawH: 205,
};

const ENEMYWALK_SHEET = {       // street enemy: stride walk cycle
  src: 'Enemywalk.png',
  metaSrc: 'Enemywalk.json',
  cols: 6,
  rows: 6,
  faces: 1,
  drawH: GINGER_SHEET.drawH,
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
// Scales here are draw-time multipliers (cosmetic preview) — once a value
// feels right, bake it into the sheet's drawH. Defaults reproduce the
// shipped look exactly.
const tune = {
  playerScale: 1,
  enemyScale: 1,
  buildingScale: 1,
  buildingBase: 0,             // px offset added to BUILDING_BASE (down = +)
  buildingParallax: 0.75,
  busLaneY: 576,               // SIDEWALK_TOP + 12
  busScale: 1,
  fog: 0.42,
  laneSep: true,               // push overlapping bodies apart
  laneGapX: 58,                // min horizontal spacing between two bodies
  laneGapY: 30,                // min depth (lane) spacing — kills z-sort flicker
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const loadingEl = document.getElementById('loading');

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
  const meta = config.manifest ? manifest?.sprites?.[0] : manifest;
  const cols = meta?.sheet?.cols ?? config.cols;
  const rows = meta?.sheet?.rows ?? config.rows;
  const fw = img.width / cols;
  const fh = img.height / rows;
  const count = cols * rows;

  // Pass 1: key out the background at a working scale and find the union
  // opaque bounding box, so the character (not the frame padding) is what we
  // anchor and scale. A shared box keeps the cycle from jittering.
  const WORK_H = 480;
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
  const frames = work.map((c) => {
    const f = makeCanvas(drawW, drawH);
    const fc = f.getContext('2d');
    fc.imageSmoothingEnabled = true;
    fc.imageSmoothingQuality = 'high';
    fc.drawImage(c, minX, minY, bw, bh, 0, 0, drawW, drawH);
    return f;
  });

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

  return { frames, anchors: frames.map(footAnchorX), drawW, drawH, anims, hits };
}

/* ---------------------------------------------------- building cutouts */

// Paper-background remover for the building paintings. A plain border flood
// fill stalls at thin drawn wires, leaving sealed-off background pockets, so:
// flood a coarse 1/8-scale copy (wires average away there, pockets reconnect
// to the border), then at full scale erase pixels that are BOTH inside the
// coarse background region AND close to the paper colour — wires and painted
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
  ctx.font = '700 15px Impact, sans-serif';
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
  attackHeld: false, attackPressed: false,
};

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump',
  KeyJ: 'attack', KeyK: 'attack',
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
  if (act === 'jump') {
    if (!input.jumpHeld) input.jumpPressed = true;
    input.jumpHeld = true;
  } else if (act === 'attack') {
    if (!input.attackHeld) input.attackPressed = true;
    input.attackHeld = true;
  } else input[act] = true;
});

window.addEventListener('keyup', (e) => {
  if (typingInPanel(e)) return;
  const act = KEYMAP[e.code];
  if (!act) return;
  if (act === 'jump') input.jumpHeld = false;
  else if (act === 'attack') input.attackHeld = false;
  else input[act] = false;
});

// Either mouse button throws the uppercut (it's the only attack for now).
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0 || e.button === 2) {
    e.preventDefault();
    input.attackPressed = true;
  }
});

const player = {
  x: 320, y: GROUND_Y, vx: 0, depthV: 0, jumpY: 0, vy: 0,
  facing: 1, grounded: true,
  coyote: 0, buffer: 0,
  anim: 'idle', frame: 0, animTime: 0,
  attackHits: null,            // enemies already struck by the current swing
};

let sprite = null;
let idleSprite = null;
let uppercutSprite = null;
let jumpSprite = null;
let gingerSprite = null;
let gingerWalkSprite = null;
let tileAtlas = null;
let buildingImgs = null;
let buses = [];
let groundMap = null;
let props = null;
let enemies = [];
let cameraX = 0;

const combatRng = mulberry32(99);   // seeded so test runs stay deterministic

function buildEnemies() {
  const rng = mulberry32(77);
  const base = {
    state: 'walk', vx: 0, vy: 0, jumpY: 0, downTimer: 0,
    anim: 'walk', frame: 0, animTime: 0, facing: -1,
  };
  const spawns = [
    { x: 980, y: 638, direction: 1, speed: 92, kind: 'ginger', role: 'front', ...base },
    { x: 1760, y: 684, direction: -1, speed: 116, kind: 'ginger', role: 'flank', ...base },
    { x: 2860, y: 652, direction: 1, speed: 104, kind: 'ginger', role: 'lurk', ...base },
    { x: 4180, y: 695, direction: -1, speed: 128, kind: 'ginger', role: 'front', ...base },
  ];
  // per-enemy quirks so nobody moves in lockstep
  for (const e of spawns) {
    e.standoff = 115 + Math.floor(rng() * 55);   // how close a presser stops
    e.lurkDist = 300 + Math.floor(rng() * 90);   // gingering distance
    e.laneBias = Math.floor(rng() * 48) - 24;    // preferred lane offset
    e.roleTimer = 2 + rng() * 3;                 // seconds until a re-roll
  }
  return spawns;
}

// walk lives on its own sheet; idle/hit sections are on Ginger.png
function enemySpriteFor(anim) {
  return anim === 'walk' ? gingerWalkSprite : gingerSprite;
}

function spriteFor(anim) {
  if (anim === 'idle') return idleSprite;
  if (anim === 'uppercut') return uppercutSprite;
  if (anim === 'jump') return jumpSprite;
  return sprite;
}

/* --------------------------------------------------------------- update */

// The uppercut deals damage only on frames the hits file marks active. Boxes
// are already in draw space; mirror them around the foot anchor when flipped.
function resolveUppercutHits() {
  const boxes = uppercutSprite.hits?.get(player.frame);
  if (!boxes) return;
  const anchor = uppercutSprite.anchors[player.frame];
  for (const hb of boxes) {
    if (hb.active === false) continue;
    const left = player.facing === UPPERCUT_SHEET.faces
      ? player.x - anchor + hb.x
      : player.x + anchor - hb.x - hb.w;
    const top = player.y + player.jumpY - uppercutSprite.drawH + hb.y;
    for (const enemy of enemies) {
      const standing = enemy.state === 'walk' || enemy.state === 'guard';
      if (!standing || player.attackHits.has(enemy)) continue;
      if (Math.abs(enemy.y - player.y) > 32) continue;   // must share the lane
      const hitX = left < enemy.x + 30 && left + hb.w > enemy.x - 30;
      const hitY = top < enemy.y && top + hb.h > enemy.y - 132;
      if (hitX && hitY) {
        player.attackHits.add(enemy);
        enemy.state = 'hit';
        enemy.vx = player.facing * (hb.knockback?.x ?? 220);
        enemy.vy = hb.knockback?.y ?? -440;
      }
    }
  }
}

const clampLane = (y) => Math.max(LANE_TOP, Math.min(LANE_BOTTOM, y));
const isGrounded = (e) => e.state === 'walk' || e.state === 'guard';

// Collision avoidance is steering-first: when a body blocks the path ahead,
// the enemy swings into a free lane and walks AROUND it (including around
// the player — flankers pass behind Darki). Returns -1 (dodge up), 1 (dodge
// down) or 0 (path clear).
function laneDodge(enemy, moveDir) {
  if (!moveDir) return 0;
  for (const other of [player, ...enemies]) {
    if (other === enemy) continue;
    if (other !== player && !isGrounded(other)) continue;
    const ox = other.x - enemy.x;
    const oy = other.y - enemy.y;
    if (Math.sign(ox) !== moveDir) continue;             // not in my path
    if (Math.abs(ox) > tune.laneGapX + 46) continue;     // still far ahead
    if (Math.abs(oy) > tune.laneGapY + 10) continue;     // lane already clear
    let dodge = enemy.y <= other.y ? -1 : 1;             // side with a head start
    if (dodge < 0 && enemy.y - 24 < LANE_TOP) dodge = 1; // no room? flip
    if (dodge > 0 && enemy.y + 24 > LANE_BOTTOM) dodge = -1;
    return dodge;
  }
  return 0;
}

// Gentle last-resort separation for bodies that still end up overlapped
// (e.g. after a knockdown landing). The correction is capped to walking
// speed so it reads as a step aside, never a shove or a jitter, and it
// never blocks passing: a dodging enemy is already a lane away.
function pushApart(a, b, aMove, bMove, maxStep) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const penX = tune.laneGapX - Math.abs(dx);
  const penY = tune.laneGapY - Math.abs(dy);
  if (penX <= 0 || penY <= 0) return;
  if (penX < penY) {
    const s = (dx < 0 ? -1 : 1) * Math.min(penX, maxStep);
    a.x -= s * aMove;
    b.x += s * bMove;
  } else {
    const s = (dy < 0 ? -1 : 1) * Math.min(penY, maxStep);
    a.y = clampLane(a.y - s * aMove);
    b.y = clampLane(b.y + s * bMove);
  }
}

function separateActors(dt) {
  if (!tune.laneSep) return;
  const maxStep = 170 * dt;                    // ≈ walking pace, no snapping
  for (const e of enemies) {
    if (isGrounded(e)) pushApart(e, player, 1, 0, maxStep); // player immovable
  }
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      if (isGrounded(enemies[i]) && isGrounded(enemies[j])) {
        pushApart(enemies[i], enemies[j], 0.5, 0.5, maxStep);
      }
    }
  }
}

function update(dt) {
  let attacking = player.anim === 'uppercut';
  if (input.attackPressed && player.grounded && !attacking) {
    player.anim = 'uppercut';
    player.animTime = 0;
    player.frame = uppercutSprite.anims.uppercut.frames[0];
    player.attackHits = new Set();
    attacking = true;
  }
  input.attackPressed = false;

  const dir = attacking ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const depthDir = attacking ? 0 : (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dir !== 0) {
    player.vx += dir * PLAYER.accel * dt;
    player.vx = Math.max(-PLAYER.maxSpeed, Math.min(PLAYER.maxSpeed, player.vx));
    player.facing = dir;
  } else if (player.vx !== 0) {
    const drop = PLAYER.friction * dt;
    player.vx = Math.abs(player.vx) <= drop ? 0 : player.vx - Math.sign(player.vx) * drop;
  }

  player.coyote = player.grounded ? PLAYER.coyoteTime : Math.max(0, player.coyote - dt);
  player.buffer = input.jumpPressed ? PLAYER.jumpBuffer : Math.max(0, player.buffer - dt);
  input.jumpPressed = false;

  if (!attacking && player.buffer > 0 && player.coyote > 0) {
    player.vy = -PLAYER.jumpVel;
    player.grounded = false;
    player.coyote = 0;
    player.buffer = 0;
  }
  if (!player.grounded && !input.jumpHeld && player.vy < -240) player.vy = -240; // jump cut

  player.vy += PLAYER.gravity * dt;
  player.x += player.vx * dt;
  player.depthV = depthDir * PLAYER.depthSpeed;
  player.y += player.depthV * dt;
  player.jumpY += player.vy * dt;

  const half = PLAYER.hitW / 2;
  player.x = Math.max(half, Math.min(WORLD_W - half, player.x));
  player.y = Math.max(LANE_TOP, Math.min(LANE_BOTTOM, player.y));

  if (player.jumpY >= 0) {
    player.jumpY = 0;
    player.vy = 0;
    player.grounded = true;
  } else {
    player.grounded = false;
  }

  if (!attacking) {
    const moving = Math.abs(player.vx) > 12 || Math.abs(player.depthV) > 12;
    const next = !player.grounded ? 'jump' : (moving ? 'walk' : 'idle');
    if (next !== player.anim) { player.anim = next; player.frame = 0; player.animTime = 0; }
  }

  const animationSprite = spriteFor(player.anim);
  const spec = animationSprite.anims[player.anim];
  const rate = player.anim === 'walk'
    ? spec.fps * Math.max(0.45, Math.abs(player.vx) / PLAYER.maxSpeed, Math.abs(player.depthV) / PLAYER.depthSpeed)
    : spec.fps;
  player.animTime += dt * rate;
  const step = Math.floor(player.animTime);
  if (spec.loop === false && step >= spec.frames.length) {
    if (player.anim === 'jump' && !player.grounded) {
      // jump arc outlasted the sheet — hold the final falling pose
      player.frame = spec.frames[spec.frames.length - 1];
    } else {
      // one-shot animation (the uppercut) finished — settle back to idle
      player.anim = 'idle';
      player.frame = idleSprite.anims.idle.frames[0];
      player.animTime = 0;
      player.attackHits = null;
    }
  } else {
    player.frame = spec.frames[step % spec.frames.length];
    if (player.anim === 'uppercut') resolveUppercutHits();
  }

  const target = player.x - VIEW_W * 0.42;
  cameraX += (target - cameraX) * Math.min(1, dt * 6);
  cameraX = Math.max(0, Math.min(WORLD_W - VIEW_W, cameraX));

  for (const bus of buses) {
    bus.x += bus.dir * bus.speed * dt;
    if (bus.x < -320) bus.x = WORLD_W + 300;
    if (bus.x > WORLD_W + 320) bus.x = -300;
  }

  for (const enemy of enemies) {
    if (enemy.state === 'hit') {           // sailing back from the blow
      enemy.x += enemy.vx * dt;
      enemy.jumpY += enemy.vy * dt;
      enemy.vy += 2200 * dt;
      enemy.facing = -Math.sign(enemy.vx || 1); // face the attacker
      if (enemy.jumpY >= 0) {
        enemy.jumpY = 0;
        enemy.state = 'down';
        enemy.downTimer = 1.6;
      }
    } else if (enemy.state === 'down') {   // KO'd on the tarmac, then back up
      enemy.downTimer -= dt;
      if (enemy.downTimer <= 0) enemy.state = 'walk';
    } else {
      // role-based mob movement: pressers hold their side of the player,
      // flankers cross to the far side, lurkers ginger at a distance.
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const inSight = Math.abs(dx) < 640 && Math.abs(dy) < 120;
      if (inSight) {
        enemy.roleTimer -= dt;
        if (enemy.roleTimer <= 0) {          // keep the mob reshuffling
          enemy.roleTimer = 2.5 + combatRng() * 3;
          const r = combatRng();
          enemy.role = r < 0.45 ? 'front' : r < 0.75 ? 'flank' : 'lurk';
        }
        const side = Math.sign(enemy.x - player.x) || 1;
        const tx = enemy.role === 'front' ? player.x + side * enemy.standoff
          : enemy.role === 'flank' ? player.x - side * enemy.standoff
          : player.x + side * enemy.lurkDist;
        const ddx = tx - enemy.x;
        const ty = Math.max(LANE_TOP, Math.min(LANE_BOTTOM, player.y + enemy.laneBias));
        const ddy = ty - enemy.y;
        if (Math.abs(ddx) > 16 || Math.abs(ddy) > 8) {
          enemy.state = 'walk';
          if (Math.abs(ddx) > 16) {
            enemy.x += Math.sign(ddx) * enemy.speed * dt;
            enemy.facing = Math.sign(ddx);
          } else {
            enemy.facing = Math.sign(dx) || enemy.facing;
          }
          const step = enemy.speed * 0.6 * dt;
          enemy.y += Math.max(-step, Math.min(step, ddy));
        } else {
          enemy.state = 'guard';               // hold position, square up
          enemy.facing = Math.sign(dx) || enemy.facing;
        }
        enemy.direction = enemy.facing;
      } else {
        enemy.state = 'walk';
        enemy.x += enemy.direction * enemy.speed * dt;
        enemy.facing = enemy.direction;
        if (enemy.x < 160 || enemy.x > WORLD_W - 160) enemy.direction *= -1;
      }
    }

    // enemy animation: state → section (fallbacks for sheets without one)
    let anim = enemy.state === 'guard' ? 'idle'
      : (enemy.state === 'hit' || enemy.state === 'down') ? 'hit'
      : 'walk';
    let es = enemySpriteFor(anim);
    if (!es.anims[anim]) { anim = 'walk'; es = enemySpriteFor(anim); }
    if (anim !== enemy.anim) { enemy.anim = anim; enemy.animTime = 0; }
    const spec = es.anims[enemy.anim];
    enemy.animTime += dt * spec.fps;
    const st = Math.floor(enemy.animTime);
    enemy.frame = spec.loop === false
      ? spec.frames[Math.min(st, spec.frames.length - 1)]
      : spec.frames[st % spec.frames.length];
  }

  separateActors();
}

/* ----------------------------------------------------------------- draw */

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, '#7fb2d9');
  g.addColorStop(0.55, '#cfd9c9');
  g.addColorStop(1, '#e8caa0'); // harmattan haze near the horizon
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y);

  ctx.fillStyle = 'rgba(255,236,180,.9)';
  ctx.beginPath();
  ctx.arc(VIEW_W - 220, 120, 46, 0, Math.PI * 2);
  ctx.fill();
}

function drawSkyline() {
  const off = cameraX * 0.2;
  ctx.fillStyle = 'rgba(105,120,138,.35)'; // far towers, mostly eaten by haze
  for (const b of props.skyline) {
    const sx = ((b.x - off) % (WORLD_W * 0.35) + WORLD_W * 0.35) % (WORLD_W * 0.35) - 100;
    ctx.fillRect(sx, GROUND_Y - 120 - b.h, b.w, b.h + 60);
  }
}

function drawSidewalkBand() {
  // red earth shoulder behind the pavement, then paving slabs, then kerb+gutter
  const c0 = Math.floor(cameraX / TILE);
  const cN = c0 + Math.ceil(VIEW_W / TILE) + 1;
  for (let c = c0; c <= cN; c++) {
    const x = c * TILE - cameraX;
    ctx.drawImage(tileAtlas, T.EARTH * TILE, 0, TILE, 8, x, SIDEWALK_TOP - 8, TILE, 8);
    ctx.drawImage(tileAtlas, T.SLAB * TILE, 0, TILE, TILE, x, SIDEWALK_TOP, TILE, 36);
    ctx.drawImage(tileAtlas, T.KERB * TILE, 0, TILE, TILE, x, SIDEWALK_TOP + 36, TILE, 20);
  }
}

function drawRoad() {
  const c0 = Math.floor(cameraX / TILE);
  const cN = c0 + Math.ceil(VIEW_W / TILE) + 1;
  for (let r = 0; r < groundMap.length; r++) {
    for (let c = c0; c <= cN && c < groundMap[r].length; c++) {
      ctx.drawImage(tileAtlas, groundMap[r][c] * TILE, 0, TILE, TILE,
        c * TILE - cameraX, GROUND_Y + r * TILE, TILE, TILE);
    }
  }
}

// Distant building row: slower parallax than the street, under a fog wash
// that thickens toward the ground. Bases sit ~2 m below the walkway top, so
// the raised sidewalk hides their feet and they read as firmly planted.
const BUILDING_PARALLAX = 0.75;
const BUILDING_BASE = GROUND_Y - 10;
const BUS_LANE_Y = SIDEWALK_TOP + 12;   // far lane; wheels hide behind the walkway

function drawBackdrop() {
  const off = cameraX * tune.buildingParallax;
  const base = BUILDING_BASE + tune.buildingBase;
  for (const st of props.structures) {
    const sx = st.x - off;
    const w = st.w * tune.buildingScale;
    const h = st.h * tune.buildingScale;
    if (sx + w > -60 && sx < VIEW_W + 60) {
      ctx.drawImage(buildingImgs[st.idx], sx, base - h, w, h);
    }
  }
  // danfo traffic on the far lane — nearer than the buildings, still faint
  for (const bus of buses) {
    const sx = bus.x - off;
    if (sx > -280 && sx < VIEW_W + 60) {
      ctx.save();
      ctx.translate(sx, tune.busLaneY);
      ctx.scale(bus.scale * tune.busScale, bus.scale * tune.busScale);
      ctx.globalAlpha = 0.85;
      drawDanfo(0, 0);
      ctx.restore();
    }
  }
  const g = ctx.createLinearGradient(0, base - 460, 0, base);
  g.addColorStop(0, 'rgba(226,214,192,0)');
  g.addColorStop(1, `rgba(226,214,192,${tune.fog})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, base);
}

function drawStreet() {
  ctx.save();
  ctx.translate(-cameraX, 0);
  for (let i = 0; i < props.poles.length; i++) {
    const x = props.poles[i];
    if (x > cameraX - 700 && x < cameraX + VIEW_W + 700) drawPole(x, props.poles[i + 1]);
  }
  ctx.restore();
}

function drawPlayer() {
  const animationSprite = spriteFor(player.anim);
  const { frames, anchors, drawW, drawH } = animationSprite;
  const frame = frames[player.frame];
  const anchor = anchors[player.frame];
  const screenX = player.x - cameraX;

  const ps = tune.playerScale;
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath();
  const squash = player.grounded ? 1 : Math.max(0.5, 1 + player.jumpY / 500);
  ctx.ellipse(screenX, player.y + 6, drawW * 0.36 * ps * squash, 11 * squash, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(screenX, player.y + player.jumpY);
  ctx.scale(player.facing !== SHEET.faces ? -ps : ps, ps);
  ctx.drawImage(frame, -anchor, -drawH);
  ctx.restore();

  if (window.__ror?.debugHitboxes && player.anim === 'uppercut') {
    const boxes = animationSprite.hits?.get(player.frame) ?? [];
    ctx.strokeStyle = '#ff3355';
    ctx.lineWidth = 2;
    for (const hb of boxes) {
      const left = player.facing === UPPERCUT_SHEET.faces
        ? screenX - anchor + hb.x
        : screenX + anchor - hb.x - hb.w;
      ctx.strokeRect(left, player.y + player.jumpY - drawH + hb.y, hb.w, hb.h);
    }
  }
}

function drawEnemy(enemy) {
  const screenX = enemy.x - cameraX;
  if (screenX < -140 || screenX > VIEW_W + 140) return;
  const es = enemySpriteFor(enemy.anim);
  const config = enemy.anim === 'walk' ? ENEMYWALK_SHEET : GINGER_SHEET;
  const frame = es.frames[enemy.frame];
  const anchor = es.anchors[enemy.frame];
  const flip = enemy.facing !== config.faces;

  const es2 = tune.enemyScale;
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.ellipse(screenX, enemy.y + 5, es.drawW * 0.3 * es2, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  if (enemy.state === 'down') {
    // KO'd flat on the tarmac — sprite laid over sideways, stars circling
    const side = -enemy.facing;            // fell away from the attacker
    ctx.save();
    ctx.translate(screenX, enemy.y - 16);
    ctx.scale(es2, es2);
    ctx.rotate(side * Math.PI / 2 * 0.94);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(frame, -anchor, -es.drawH + 16);
    ctx.restore();
    ctx.fillStyle = '#ffd23f';
    for (let i = 0; i < 3; i++) {
      const a = enemy.downTimer * 5 + i * (Math.PI * 2 / 3);
      ctx.beginPath();
      ctx.arc(screenX - side * 60 + Math.cos(a) * 26, enemy.y - 40 + Math.sin(a) * 7, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  const y = enemy.y + enemy.jumpY;
  ctx.save();
  ctx.translate(screenX, y);
  ctx.scale(es2, es2);
  if (enemy.state === 'hit') ctx.rotate(Math.sign(enemy.vx || 1) * 0.35);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(frame, -anchor, -es.drawH);
  ctx.restore();
}

function drawActors() {
  // Quantize depth into buckets and break ties by a stable id, so two actors
  // at nearly-equal lane depth keep a fixed draw order (no per-frame flicker).
  const actors = enemies.map((enemy, i) => ({ depth: enemy.y, tie: i, draw: () => drawEnemy(enemy) }));
  actors.push({ depth: player.y, tie: 100, draw: drawPlayer });
  actors.sort((a, b) => {
    const da = Math.round(a.depth / 8), db = Math.round(b.depth / 8);
    return da !== db ? da - db : a.tie - b.tie;
  });
  for (const actor of actors) actor.draw();
}

function drawHud() {
  ctx.fillStyle = 'rgba(8,11,18,.65)';
  ctx.fillRect(16, 14, 470, 58);
  ctx.fillStyle = '#ffe45e';
  ctx.font = '700 22px Impact, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('RAGE OF RATELS — LAGOS STREET SLICE', 28, 22);
  ctx.fillStyle = '#cfd8ea';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Move: WASD or arrows   Jump: Space   Uppercut: mouse click (or J / K)', 28, 48);
}

function draw() {
  drawSky();
  drawSkyline();
  drawBackdrop();
  drawStreet();
  drawSidewalkBand();
  drawRoad();
  drawActors();
  drawHud();
}

/* ----------------------------------------------------------------- boot */

// dev hook (manual §3: development HUD/state must be inspectable)
window.__ror = {
  player, input, tune,
  get sprites() { return { sprite, idleSprite, uppercutSprite }; },
  get enemies() { return enemies; },
  get cameraX() { return cameraX; },
  frames: 0,
  step(dt) { update(dt); draw(); }, // deterministic tick for tests
};

/* --------------------------------------------------- dev tuning panel */

// Glassmorphism control panel: live sliders + number inputs for character
// scales and prop placement. Starts collapsed (a gear button) so it never
// obstructs play or screenshots. Cosmetic scales are draw-time previews.
function initDevPanel() {
  const DEFAULTS = { ...tune };
  const CONTROLS = [
    { key: 'playerScale', label: 'Player scale', min: 0.3, max: 2.5, step: 0.01 },
    { key: 'enemyScale', label: 'Enemy scale', min: 0.3, max: 2.5, step: 0.01 },
    { key: 'buildingScale', label: 'Building scale', min: 0.4, max: 2, step: 0.01 },
    { key: 'buildingBase', label: 'Building base Y', min: -200, max: 200, step: 1 },
    { key: 'buildingParallax', label: 'Building parallax', min: 0.3, max: 1, step: 0.01 },
    { key: 'busLaneY', label: 'Bus lane Y', min: 420, max: 640, step: 1 },
    { key: 'busScale', label: 'Bus scale', min: 0.3, max: 1.5, step: 0.01 },
    { key: 'fog', label: 'Fog density', min: 0, max: 0.9, step: 0.01 },
    { key: 'laneGapX', label: 'Body gap X', min: 20, max: 120, step: 1 },
    { key: 'laneGapY', label: 'Lane gap Y', min: 10, max: 80, step: 1 },
  ];

  const style = document.createElement('style');
  style.textContent = `
    #ror-tune { position: fixed; top: 14px; right: 14px; z-index: 50;
      font: 12px/1.4 system-ui, sans-serif; color: #eaf0ff; }
    #ror-tune .gear { width: 40px; height: 40px; border-radius: 12px; cursor: pointer;
      font-size: 18px; color: #eaf0ff; background: rgba(20,28,44,.45);
      border: 1px solid rgba(255,255,255,.25); backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px); box-shadow: 0 6px 20px rgba(0,0,0,.35);
      transition: transform .12s; }
    #ror-tune .gear:hover { transform: rotate(45deg); }
    #ror-tune .panel { margin-top: 8px; width: 268px; padding: 14px 14px 10px;
      border-radius: 16px; background: rgba(18,24,38,.42);
      border: 1px solid rgba(255,255,255,.22); backdrop-filter: blur(16px) saturate(1.4);
      -webkit-backdrop-filter: blur(16px) saturate(1.4);
      box-shadow: 0 10px 40px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.15); }
    #ror-tune .panel h3 { margin: 0 0 10px; font-size: 12px; letter-spacing: .12em;
      text-transform: uppercase; color: #ffe45e; font-weight: 700; }
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
  gear.textContent = '⚙';
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
    range.addEventListener('input', () => set(range.value));
    num.addEventListener('input', () => set(num.value));
    set(tune[c.key]);
    row.append(name, range, num);
    panel.appendChild(row);
    rows.push(() => set(DEFAULTS[c.key]));
  }

  const foot = document.createElement('div');
  foot.className = 'foot';
  const sep = document.createElement('label');
  sep.className = 'chk';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = tune.laneSep;
  cb.addEventListener('change', () => { tune.laneSep = cb.checked; });
  sep.append(cb, document.createTextNode('Lane sep'));
  const reset = document.createElement('button');
  reset.textContent = 'Reset';
  reset.addEventListener('click', () => { rows.forEach((r) => r()); cb.checked = tune.laneSep = DEFAULTS.laneSep; });
  const copy = document.createElement('button');
  copy.textContent = 'Copy';
  copy.title = 'Copy current values as JSON';
  copy.addEventListener('click', () => {
    const json = JSON.stringify(tune, null, 2);
    navigator.clipboard?.writeText(json);
    console.log('[ratel tune]', json);
  });
  foot.append(sep, reset, copy);
  panel.appendChild(foot);

  root.append(gear, panel);
  document.body.appendChild(root);
}

let last = 0;
function loop(ts) {
  window.__ror.frames++;
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

(async function boot() {
  try {
    [sprite, idleSprite, uppercutSprite, jumpSprite, gingerSprite, gingerWalkSprite, buildingImgs] =
      await Promise.all([
        loadSpriteFrames(SHEET),
        loadSpriteFrames(IDLE_SHEET, 'idle'),
        loadSpriteFrames(UPPERCUT_SHEET, 'uppercut'),
        loadSpriteFrames(JUMP_SHEET, 'jump'),
        loadSpriteFrames(GINGER_SHEET),
        loadSpriteFrames(ENEMYWALK_SHEET),
        loadBuildings(),
      ]);
    tileAtlas = buildTileAtlas();
    groundMap = buildGroundMap();
    props = buildStreetProps(buildingImgs);
    buses = buildBuses();
    enemies = buildEnemies();
    loadingEl.classList.add('hidden');
    if (!window.__rorNoPanel) initDevPanel();
    canvas.focus();
    requestAnimationFrame(loop);
  } catch (err) {
    loadingEl.textContent = `ASSET ERROR — ${err.message}`;
    console.error(err);
  }
})();
