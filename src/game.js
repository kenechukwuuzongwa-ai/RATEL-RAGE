// Rage of Ratels — Lagos street side-scroller slice.
// Player sprite: "VDM-Walk .png" (4x4 sheet). Street tiles are code-rendered
// into an atlas at boot per the production manual (no external tile art).

const VIEW_W = 1280;
const VIEW_H = 720;
const WORLD_W = 6400;
const GROUND_Y = 620;          // top of the road surface the player stands on
const LANE_TOP = 610;
const LANE_BOTTOM = 700;
const TILE = 64;

const SHEET = {
  src: 'VDM-Walk .png',
  metaSrc: 'VDM-Walk.json',    // animation frames/fps come from here
  cols: 4,                     // fallbacks if the JSON is missing
  rows: 4,
  faces: 1,                    // art faces right; flip when moving left
  drawH: 200,                  // character height on screen (opaque pixels)
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
// the frame border. Tight tolerance so the dark character outline survives.
function keyOutBackground(frame) {
  const { width: w, height: h } = frame;
  const fctx = frame.getContext('2d');
  const data = fctx.getImageData(0, 0, w, h);
  const px = data.data;

  const corner = [px[0], px[1], px[2], px[3]];
  if (corner[3] < 16) return; // already transparent

  const TOL2 = 25 * 25;
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

// Animations come from the Sprite Analyzer JSON. Named/role sections win when
// present; otherwise the whole defaultAnimation range is the walk cycle.
function resolveAnims(meta, frameCount) {
  const def = meta?.defaultAnimation ?? { start: 0, end: frameCount - 1, fps: 30 };
  const range = (s, e) => Array.from({ length: e - s + 1 }, (_, i) => s + i);
  const toFrames = (f) => Array.isArray(f) ? f : range(f?.start ?? 0, f?.end ?? frameCount - 1);

  const anims = { walk: { frames: range(def.start, def.end), fps: def.fps ?? 30 } };

  const sections = meta?.animation?.sections;
  if (sections?.length) {
    const pick = (re, role) =>
      sections.find((s) => re.test(s.name ?? '')) ?? (role && sections.find((s) => s.role === role));
    const use = (s, fallbackFps) => ({ frames: toFrames(s.frames), fps: s.fps ?? fallbackFps });
    const w = pick(/walk|run|move/i, 'middle');
    if (w) anims.walk = use(w, def.fps ?? 30);
    const i = pick(/idle|stand/i);
    if (i) anims.idle = use(i, 8);
    const j = pick(/jump|air|leap/i);
    if (j) anims.jump = use(j, 8);
  }
  anims.idle ??= { frames: [anims.walk.frames[0]], fps: 1 };
  anims.jump ??= { frames: [anims.walk.frames[Math.floor(anims.walk.frames.length / 2)]], fps: 1 };
  return anims;
}

async function loadPlayerFrames() {
  const [img, meta] = await Promise.all([
    loadImage(SHEET.src),
    fetch(new URL('../' + encodeURI(SHEET.metaSrc), import.meta.url))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  const cols = meta?.sheet?.cols ?? SHEET.cols;
  const rows = meta?.sheet?.rows ?? SHEET.rows;
  const fw = img.width / cols;
  const fh = img.height / rows;
  const count = cols * rows;

  // Pass 1: key out the background at a working scale and find the union
  // opaque bounding box, so the character (not the frame padding) is what we
  // anchor and scale. A shared box keeps the cycle from jittering.
  const WORK_H = 480;
  const workW = Math.round(WORK_H * (fw / fh));
  const work = [];
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
    work.push(c);
  }
  if (maxX < 0) throw new Error('sprite sheet is fully transparent after keying');

  // Pass 2: crop every frame to the union box, scaled so character height is
  // drawH. Canvas bottom = lowest foot pixel, so feet sit on the ground line.
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const drawH = SHEET.drawH;
  const drawW = Math.round(bw * (drawH / bh));
  const frames = work.map((c) => {
    const f = makeCanvas(drawW, drawH);
    const fc = f.getContext('2d');
    fc.imageSmoothingEnabled = true;
    fc.imageSmoothingQuality = 'high';
    fc.drawImage(c, minX, minY, bw, bh, 0, 0, drawW, drawH);
    return f;
  });

  return { frames, drawW, drawH, anims: resolveAnims(meta, count) };
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

const SIGN_NAMES = [
  ['MAMA NKECHI BUKA', '#f4e04d', '#7a1f1f'],
  ['DE LAGOS BARBERS', '#ffffff', '#144d8a'],
  ['POS • RECHARGE CARD', '#ffe45e', '#111111'],
  ['SUYA SPOT', '#ffd23f', '#8a2b14'],
  ['VULCANIZER', '#e8e8e8', '#20242c'],
  ['CHOP LIFE RESTAURANT', '#ffffff', '#0d6b3f'],
  ['OK TAILORS', '#111111', '#e8c33a'],
  ['NAIJA KIOSK', '#ffffff', '#5a2d82'],
];

const SHOP_COLORS = ['#c94f3d', '#2f7fb8', '#3f9d5a', '#c78a2b', '#7a4fa3', '#b8542f', '#2d8f86'];

function buildStreetProps() {
  const rng = mulberry32(7);
  const shops = [];
  let x = 240;
  let sign = 0;
  while (x < WORLD_W - 500) {
    const w = 260 + Math.floor(rng() * 140);
    shops.push({
      x, w,
      h: 200 + Math.floor(rng() * 70),
      color: SHOP_COLORS[Math.floor(rng() * SHOP_COLORS.length)],
      sign: SIGN_NAMES[sign++ % SIGN_NAMES.length],
      awning: rng() < 0.5,
    });
    x += w + 60 + Math.floor(rng() * 220);
  }

  const poles = [];
  for (let px = 160; px < WORLD_W; px += 620) poles.push(px);

  const danfos = [3, 8].map((i) => shops[Math.min(i, shops.length - 1)])
    .map((s) => s.x + s.w + 6);

  const skyline = [];
  const srng = mulberry32(11);
  for (let sx = 0; sx < WORLD_W * 0.35; sx += 90 + srng() * 120) {
    skyline.push({ x: sx, w: 70 + srng() * 90, h: 90 + srng() * 190 });
  }
  return { shops, poles, danfos, skyline };
}

const SIDEWALK_TOP = GROUND_Y - 56; // shops and poles stand on this band

function drawShop(s) {
  const baseY = GROUND_Y - 6;
  const bodyTop = baseY - s.h;
  ctx.fillStyle = s.color;
  ctx.fillRect(s.x, bodyTop, s.w, s.h);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.fillRect(s.x, bodyTop, 12, s.h);

  // corrugated zinc roof
  ctx.fillStyle = '#9aa0a8';
  ctx.fillRect(s.x - 12, bodyTop - 26, s.w + 24, 26);
  ctx.strokeStyle = 'rgba(40,44,52,.5)';
  ctx.lineWidth = 2;
  for (let rx = s.x - 8; rx < s.x + s.w + 8; rx += 12) {
    ctx.beginPath(); ctx.moveTo(rx, bodyTop - 24); ctx.lineTo(rx, bodyTop - 2); ctx.stroke();
  }

  // signboard
  const [name, fg, bg] = s.sign;
  ctx.fillStyle = bg;
  ctx.fillRect(s.x + 8, bodyTop + 10, s.w - 16, 40);
  ctx.fillStyle = fg;
  ctx.font = '700 19px Impact, "Arial Narrow Bold", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, s.x + s.w / 2, bodyTop + 31, s.w - 28);

  // door and window
  ctx.fillStyle = '#241c14';
  ctx.fillRect(s.x + 26, baseY - 110, 56, 110);
  ctx.fillStyle = '#cfe3ef';
  ctx.fillRect(s.x + s.w - 96, baseY - 104, 62, 52);
  ctx.strokeStyle = '#20242c';
  ctx.strokeRect(s.x + s.w - 96, baseY - 104, 62, 52);

  if (s.awning) {
    ctx.fillStyle = '#e8e2d2';
    ctx.fillRect(s.x + s.w - 112, baseY - 118, 94, 12);
    ctx.fillStyle = s.color === '#c94f3d' ? '#2f7fb8' : '#c94f3d';
    for (let ax = s.x + s.w - 112; ax < s.x + s.w - 22; ax += 24) {
      ctx.fillRect(ax, baseY - 118, 12, 12);
    }
  }
}

function drawDanfo(x) {
  const y = GROUND_Y - 4;
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

const input = { left: false, right: false, up: false, down: false, jumpHeld: false, jumpPressed: false };

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump',
};

window.addEventListener('keydown', (e) => {
  const act = KEYMAP[e.code];
  if (!act) return;
  e.preventDefault();
  if (act === 'jump') {
    if (!input.jumpHeld) input.jumpPressed = true;
    input.jumpHeld = true;
  } else input[act] = true;
});

window.addEventListener('keyup', (e) => {
  const act = KEYMAP[e.code];
  if (!act) return;
  if (act === 'jump') input.jumpHeld = false;
  else input[act] = false;
});

const player = {
  x: 320, y: GROUND_Y, vx: 0, depthV: 0, jumpY: 0, vy: 0,
  facing: 1, grounded: true,
  coyote: 0, buffer: 0,
  anim: 'idle', frame: 0, animTime: 0,
};

let sprite = null;
let tileAtlas = null;
let groundMap = null;
let props = null;
let enemies = [];
let cameraX = 0;

function buildEnemies() {
  return [
    { x: 980, y: 638, direction: 1, speed: 46, color: '#8f2438' },
    { x: 1760, y: 684, direction: -1, speed: 58, color: '#315b8f' },
    { x: 2860, y: 652, direction: 1, speed: 52, color: '#65438f' },
    { x: 4180, y: 695, direction: -1, speed: 64, color: '#8a4b24' },
  ];
}

/* --------------------------------------------------------------- update */

function update(dt) {
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const depthDir = (input.down ? 1 : 0) - (input.up ? 1 : 0);
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

  if (player.buffer > 0 && player.coyote > 0) {
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

  const moving = Math.abs(player.vx) > 12 || Math.abs(player.depthV) > 12;
  const next = !player.grounded ? 'jump' : (moving ? 'walk' : 'idle');
  if (next !== player.anim) { player.anim = next; player.frame = 0; player.animTime = 0; }

  const spec = sprite.anims[player.anim];
  const rate = player.anim === 'walk'
    ? spec.fps * Math.max(0.45, Math.abs(player.vx) / PLAYER.maxSpeed, Math.abs(player.depthV) / PLAYER.depthSpeed)
    : spec.fps;
  player.animTime += dt * rate;
  player.frame = spec.frames[Math.floor(player.animTime) % spec.frames.length];

  const target = player.x - VIEW_W * 0.42;
  cameraX += (target - cameraX) * Math.min(1, dt * 6);
  cameraX = Math.max(0, Math.min(WORLD_W - VIEW_W, cameraX));

  for (const enemy of enemies) {
    enemy.x += enemy.direction * enemy.speed * dt;
    if (enemy.x < 160 || enemy.x > WORLD_W - 160) enemy.direction *= -1;
  }
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
  ctx.fillStyle = 'rgba(94,110,128,.55)';
  for (const b of props.skyline) {
    const sx = ((b.x - off) % (WORLD_W * 0.35) + WORLD_W * 0.35) % (WORLD_W * 0.35) - 100;
    ctx.fillRect(sx, GROUND_Y - 120 - b.h, b.w, b.h + 60);
  }
  ctx.fillStyle = 'rgba(232,202,160,.45)'; // haze over the skyline
  ctx.fillRect(0, GROUND_Y - 220, VIEW_W, 170);
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

function drawStreet() {
  ctx.save();
  ctx.translate(-cameraX, 0);
  for (const s of props.shops) {
    if (s.x + s.w > cameraX - 50 && s.x < cameraX + VIEW_W + 50) drawShop(s);
  }
  for (const x of props.danfos) {
    if (x + 240 > cameraX && x < cameraX + VIEW_W) drawDanfo(x);
  }
  for (let i = 0; i < props.poles.length; i++) {
    const x = props.poles[i];
    if (x > cameraX - 700 && x < cameraX + VIEW_W + 700) drawPole(x, props.poles[i + 1]);
  }
  ctx.restore();
}

function drawPlayer() {
  const { frames, drawW, drawH } = sprite;
  const screenX = player.x - cameraX;

  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath();
  const squash = player.grounded ? 1 : Math.max(0.5, 1 + player.jumpY / 500);
  ctx.ellipse(screenX, player.y + 6, drawW * 0.36 * squash, 11 * squash, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(screenX, player.y + player.jumpY);
  if (player.facing !== SHEET.faces) ctx.scale(-1, 1);
  ctx.drawImage(frames[player.frame], -drawW / 2, -drawH); // feet on the ground line
  ctx.restore();
}

function drawEnemy(enemy) {
  const screenX = enemy.x - cameraX;
  if (screenX < -80 || screenX > VIEW_W + 80) return;
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.ellipse(screenX, enemy.y + 5, 35, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = enemy.color;
  ctx.fillRect(screenX - 27, enemy.y - 92, 54, 72);
  ctx.fillStyle = '#2b1914';
  ctx.beginPath();
  ctx.arc(screenX, enemy.y - 108, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e2b08b';
  ctx.beginPath();
  ctx.arc(screenX, enemy.y - 105, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#16191f';
  ctx.fillRect(screenX - 23, enemy.y - 20, 18, 20);
  ctx.fillRect(screenX + 5, enemy.y - 20, 18, 20);
}

function drawActors() {
  const actors = enemies.map((enemy) => ({ depth: enemy.y, draw: () => drawEnemy(enemy) }));
  actors.push({ depth: player.y, draw: drawPlayer });
  actors.sort((a, b) => a.depth - b.depth);
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
  ctx.fillText('Move: WASD or arrows   Jump: Space', 28, 48);
}

function draw() {
  drawSky();
  drawSkyline();
  drawStreet();
  drawSidewalkBand();
  drawRoad();
  drawActors();
  drawHud();
}

/* ----------------------------------------------------------------- boot */

// dev hook (manual §3: development HUD/state must be inspectable)
window.__ror = {
  player, input,
  get enemies() { return enemies; },
  get cameraX() { return cameraX; },
  frames: 0,
  step(dt) { update(dt); draw(); }, // deterministic tick for tests
};

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
    sprite = await loadPlayerFrames();
    tileAtlas = buildTileAtlas();
    groundMap = buildGroundMap();
    props = buildStreetProps();
    enemies = buildEnemies();
    loadingEl.classList.add('hidden');
    canvas.focus();
    requestAnimationFrame(loop);
  } catch (err) {
    loadingEl.textContent = `ASSET ERROR — ${err.message}`;
    console.error(err);
  }
})();
