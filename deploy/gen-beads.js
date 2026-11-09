/* gen-beads.js — request 563: Darki's rage beads, found once, offline.
 *
 * For every sprites/darki-*.png sheet, finds the coral wrist/ankle beads in each cell at the
 * game's own working resolution (480 px tall, the size prepSpriteFrames keys and crops at) and
 * writes sprites/beads/<sheet>.png: the same grid of cells at that working size, transparent
 * except where a bead is. game.js crops each cell with the sheet's own crop box, so a mask frame
 * lands exactly on the drawn frame.
 *
 * The classifier (measured, _chromakey/req563/beadmask.js):
 *   bead red   r >= 115, g <= 0.22 r, b <= 0.30 r   (skin, beret and wrap all run warmer: g ~0.33-0.4 r)
 *   highlight  r >= 200, 90 <= g <= 190, b <= 90, r - g >= 50, and only where it touches bead red
 *   density    a bead pixel needs >= 5 bead reds within 2 px (lone muscle highlights drop out)
 *   head cut   nothing in the top 24 % of the cell's ink (the red beret, the face)
 *
 *   node deploy/gen-beads.js            (cwd: the game folder; needs ../_chromakey/node_modules/sharp)
 */
const fs = require('fs'), path = require('path');
const sharp = require(path.resolve(__dirname, '../../_chromakey/node_modules/sharp'));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'sprites', 'beads');
fs.mkdirSync(OUT, { recursive: true });
const WORK_H = 480, MAX_FRAC = 0.012;

(async () => {
  const sheets = fs.readdirSync(path.join(ROOT, 'sprites')).filter((f) => /^darki-.*\.png$/.test(f) && !/-mobile\.png$/.test(f));
  let total = 0;
  for (const f of sheets) {
    const jf = path.join(ROOT, 'sprites', f.replace(/\.png$/, '.json'));
    if (!fs.existsSync(jf)) { console.log('  skip (no manifest)', f); continue; }
    const j = JSON.parse(fs.readFileSync(jf, 'utf8'));
    const meta = j.sprites?.[0] ?? j;
    const armed = /darki-(bat-|machete-|armed-|pull-|weapon-throw)/.test(f);   // NOT "combat"
    const cols = meta.sheet?.cols, rows = meta.sheet?.rows;
    if (!cols || !rows) { console.log('  skip (no grid)', f); continue; }
    const img = sharp(path.join(ROOT, 'sprites', f));
    const md = await img.metadata();
    const fw = md.width / cols, fh = md.height / rows;
    const workW = Math.round(WORK_H * (fw / fh));
    const W = workW * cols, H = WORK_H * rows;
    const { data } = await sharp(path.join(ROOT, 'sprites', f)).resize(W, H, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(W * H * 4);
    let found = 0, dropped = 0;
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * workW, y0 = cy * WORK_H;
      /* ADAPTIVE (a few sheets grade his skin far redder): the bead test tightens until the beads are
       * a sliver of his ink (<= MAX_FRAC); a cell where even the tightest still lights his body is
       * left dark — no glow on that frame beats a glowing man. */
      let red, hi, top, bot, ink, ok = false;
      for (const k of [0.22, 0.16, 0.11]) {
        red = new Uint8Array(workW * WORK_H); hi = new Uint8Array(workW * WORK_H);
        top = WORK_H; bot = -1; ink = 0; let n = 0;
        for (let y = 0; y < WORK_H; y++) for (let x = 0; x < workW; x++) {
          const q = ((y0 + y) * W + x0 + x) * 4, r = data[q], g = data[q + 1], b = data[q + 2], a = data[q + 3];
          if (a < 160) continue;
          ink++;
          if (y < top) top = y; if (y > bot) bot = y;
          if (r >= 115 && g <= r * k && b <= r * 0.3) { red[y * workW + x] = 1; n++; }
          else if (r >= 200 && g >= 90 && g <= 190 && b <= 90 && r - g >= 50) hi[y * workW + x] = 1;
        }
        if (bot < 0) break;
        if (n <= ink * MAX_FRAC) { ok = true; break; }
      }
      if (bot < 0 || !ok) { dropped++; continue; }
      const cut = top + (bot - top) * 0.24;
      const reds = (x, y) => { let n = 0; for (let yy = Math.max(0, y - 2); yy <= Math.min(WORK_H - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(workW - 1, x + 2); xx++) n += red[yy * workW + xx]; return n; };
      for (let y = Math.ceil(cut); y < WORK_H; y++) for (let x = 0; x < workW; x++) {
        const i = y * workW + x;
        if (!red[i] && !hi[i]) continue;
        const n = reds(x, y);
        // holding a weapon: its rusty nails glint gold beside rust red, so only bead red counts there
        if (!((red[i] && n >= (armed ? 7 : 5)) || (!armed && hi[i] && n >= 3))) continue;
        const q = ((y0 + y) * W + x0 + x) * 4;
        out[q] = 255; out[q + 1] = hi[i] ? 214 : 118; out[q + 2] = hi[i] ? 120 : 58; out[q + 3] = 255;
        found++;
      }
    }
    // stored at a THIRD of the working size: the glow is soft anyway, and decoded at full working size the
    // biggest grids would cost ~100 MB each (game.js scales by the sheet's own cell height, so any size works)
    await sharp(out, { raw: { width: W, height: H, channels: 4 } }).resize(Math.round(W / 3), Math.round(H / 3), { kernel: 'cubic' })
      .png({ compressionLevel: 9 }).toFile(path.join(OUT, f));
    total += found;
    console.log(`  ${f}: ${cols}x${rows}, ${found} bead px, ${dropped} cells dark`);
  }
  console.log('done', total);
})().catch((e) => { console.error(e); process.exit(1); });
