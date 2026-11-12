/* gen-blades.js — request 597: the machete's rage glow, found once, offline (the twin of gen-beads.js).
 *
 * "While raging with the machete, the machete should show some glows and trails like the beads."
 * The machete is painted into Darki's armed sheets (sprites/darki-machete-*.png and the pull),
 * so, like the beads, the blade is FOUND per cell at the game's 480-px working size and written to
 * sprites/blades/<sheet>.png on the same grid; game.js cuts each cell with the sheet's own crop
 * box and adds it as light (drawBladeGlow), exactly as it does the beads.
 *
 * The classifier (tuned on _chromakey/req597/blademask*.js contact sheets):
 *   steel  a NEUTRAL grey: the flat dark fill (max 22..40, spread <= 4) or the lighter shaded steel
 *          (max 50..200, spread <= 14, r - b <= 16), or a COOL teal/blue-grey (red under green or blue);
 *          his skin, beret, wrap, beads and vest all run warm.
 *   shape  steel counts only in a connected run that is big and THIN, like a blade: >= 120 px,
 *          >= 40 px long, average width <= 30 px (all scaled by the figure's height in the cell).
 *   vest   a short neutral run whose middle sits in the upper middle of his ink is the vest's
 *          collar or print, not steel — dropped.
 *   edge   the light cutting edge (r >= 105, near-neutral) where it touches kept steel.
 * Misses are fine (that frame simply does not glow); lighting his clothes is not.
 *
 *   node deploy/gen-blades.js            (cwd: the game folder; needs ../_chromakey/node_modules/sharp)
 */
const fs = require('fs'), path = require('path');
const sharp = require(path.resolve(__dirname, '../../_chromakey/node_modules/sharp'));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'sprites', 'blades');
fs.mkdirSync(OUT, { recursive: true });
const WORK_H = 480;
// cool or neutral, never warm: the swing sheets tint the steel teal-grey; his skin, beads, wrap and vest all run red
const isSteel = (r, g, b) => { const mx = Math.max(r, g, b), sp = mx - Math.min(r, g, b);
  return (mx >= 22 && mx <= 40 && sp <= 4) || (mx >= 50 && mx <= 200 && sp <= 14 && r - b <= 16) || (mx >= 30 && mx <= 210 && sp <= 40 && r <= Math.max(g, b) - 4); };
const isEdge = (r, g, b) => r >= 105 && r - b <= 26 && r - g <= 12 && g >= b - 2;

/* The swing sheets draw the blade small and smeared (the figure is smaller in their cells and the
 * steel is motion-blurred), so their size bar is lower. The vest rule still guards the chest. */
const RELAX = { 'darki-machete-combo.png': 0.45, 'darki-machete-throw.png': 0.45, 'darki-machete-airstrike.png': 0.7 };
function cellMask(data, W, x0, y0, cw, ch, out, relax = 1) {
  const N = cw * ch, cls = new Uint8Array(N);
  let top = ch, bot = -1, left = cw, right = -1;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const q = ((y0 + y) * W + x0 + x) * 4, a = data[q + 3];
    if (a < 160) continue;
    if (y < top) top = y; if (y > bot) bot = y; if (x < left) left = x; if (x > right) right = x;
    const r = data[q], g = data[q + 1], b = data[q + 2];
    cls[y * cw + x] = isSteel(r, g, b) ? 1 : isEdge(r, g, b) ? 2 : 0;
  }
  if (bot < 0) return 0;
  const sc = Math.max(0.35, (bot - top) / 400);
  const seen = new Uint8Array(N), keep = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (cls[i] !== 1 || seen[i]) continue;
    const st = [i], px = []; seen[i] = 1;
    let x0c = cw, x1c = 0, y0c = ch, y1c = 0, sx = 0, sy = 0;
    while (st.length) {
      const p = st.pop(); px.push(p);
      const x = p % cw, y = (p / cw) | 0; sx += x; sy += y;
      if (x < x0c) x0c = x; if (x > x1c) x1c = x; if (y < y0c) y0c = y; if (y > y1c) y1c = y;
      if (x > 0 && cls[p - 1] === 1 && !seen[p - 1]) { seen[p - 1] = 1; st.push(p - 1); }
      if (x < cw - 1 && cls[p + 1] === 1 && !seen[p + 1]) { seen[p + 1] = 1; st.push(p + 1); }
      if (y > 0 && cls[p - cw] === 1 && !seen[p - cw]) { seen[p - cw] = 1; st.push(p - cw); }
      if (y < ch - 1 && cls[p + cw] === 1 && !seen[p + cw]) { seen[p + cw] = 1; st.push(p + cw); }
    }
    const n = px.length, ext = Math.max(x1c - x0c, y1c - y0c);
    if (n < 120 * sc * sc * relax || ext < 40 * sc * Math.sqrt(relax) || n / ext > 30 * sc) continue;
    const fx = (sx / n - left) / Math.max(1, right - left), fy = (sy / n - top) / Math.max(1, bot - top);
    if (ext < 70 * sc && fx > 0.3 && fx < 0.7 && fy > 0.12 && fy < 0.5) continue;   // the vest
    for (const p of px) keep[p] = 1;
  }
  let found = 0;
  for (let i = 0; i < N; i++) {
    let k = keep[i];
    if (!k && cls[i] === 2) {
      const x = i % cw, y = (i / cw) | 0;
      for (let dy = -3; dy <= 3 && !k; dy++) for (let dx = -3; dx <= 3 && !k; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < cw && yy >= 0 && yy < ch && keep[yy * cw + xx] === 1) k = 2;
      }
    }
    if (!k) continue;
    const x = i % cw, y = (i / cw) | 0, q = ((y0 + y) * W + x0 + x) * 4;
    // the beads' own fire: steel burns orange, the cutting edge gold-white
    out[q] = 255; out[q + 1] = k === 2 ? 150 : 78; out[q + 2] = k === 2 ? 60 : 24; out[q + 3] = 255;   // deep fire: added over grey steel it stays orange, not white
    found++;
  }
  return found;
}

(async () => {
  const only = process.argv[2];
  const sheets = fs.readdirSync(path.join(ROOT, 'sprites'))
    .filter((f) => /^darki-(machete-.*|pull-machete)\.png$/.test(f) && (!only || f.includes(only)));
  for (const f of sheets) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', f.replace(/\.png$/, '.json')), 'utf8'));
    const meta = j.sprites?.[0] ?? j;
    const cols = meta.sheet?.cols, rows = meta.sheet?.rows;
    if (!cols || !rows) { console.log('  skip (no grid)', f); continue; }
    const md = await sharp(path.join(ROOT, 'sprites', f)).metadata();
    const fw = md.width / cols, fh = md.height / rows;
    const workW = Math.round(WORK_H * (fw / fh));
    const W = workW * cols, H = WORK_H * rows;
    const { data } = await sharp(path.join(ROOT, 'sprites', f), { limitInputPixels: false }).resize(W, H, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(W * H * 4);
    let total = 0, lit = 0;
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const n = cellMask(data, W, cx * workW, cy * WORK_H, workW, WORK_H, out, RELAX[f] ?? 1);
      total += n; if (n) lit++;
    }
    // a third of the working size, as the bead masks (game.js scales by the cell height)
    await sharp(out, { raw: { width: W, height: H, channels: 4 } }).resize(Math.round(W / 3), Math.round(H / 3), { kernel: 'cubic' })
      .png({ compressionLevel: 9 }).toFile(path.join(OUT, f));
    console.log(`  ${f}: ${cols}x${rows}, ${lit} of ${cols * rows} cells lit, ${total} px`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
