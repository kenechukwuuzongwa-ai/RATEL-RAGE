/* Ratel Rage - mobile asset generator (investor demo).
 *
 * Generates MOBILE-ONLY, downscaled copies of the heaviest images into
 * mobile/assets-mobile/. The originals in layers/ and sprites/ are never
 * touched; the desktop build never sees this directory. build-demo.js
 * overlays these over the www copy when the folder exists.
 *
 * Sizing (from the loader's real cost):
 *   - The OPAQUE level plates: see PLATE_SCALE. Sky and background ship at
 *     50% (game.js doubles skyScale / backgroundScale on Android and
 *     drawLayer's anchor math compensates the Y); the STREET ships full
 *     resolution — it is the layer the player looks at. 
 *   - The vehicles plate stays full-resolution (the parked-traffic crops
 *     address it in full-res pixels; changing it would need VEHICLE_ART
 *     edits for a 0.9MB file).
 *   - Every sprite sheet whose longest side exceeds SHEET_CAP (1280) is
 *     scaled down to it. The runtime prep derives its grid from the image's
 *     own size, and the metas carry only cols/rows + ranges (no pixel
 *     rects), so the metas remain valid unchanged. Several Darki sheets are
 *     8192x6704 (~219MB RGBA decoded) - that is what stalls a phone's
 *     renderer; at the cap they are ~5-7MB. 1280 keeps a ~160px frame for a
 *     character drawn at ~180-200px on screen: within texture budget for a
 *     demo without reading soft.
 */
const fs = require('fs');
const path = require('path');
const Jimp = require(path.resolve(__dirname, '..', '..', '_chromakey', 'node_modules', 'jimp'));

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'assets-mobile');
/* PER-PLATE RESOLUTION, and the street is no longer one of the cheap ones.
 *
 * All three opaque plates used to ship at a blanket 50%. That put the STREET —
 * the layer Darki walks on and the only one carrying sharp, close, high-detail
 * art — through a 2x upscale before `tune.zoom` (1.2) even touched it, so its
 * stored pixels were stretched 2.4x. On a ~2400px phone screen that works out
 * at roughly a 3.6x magnification of the source art, against ~1.9x on desktop:
 * exactly the "really blurry on mobile, a little on desktop" the testers
 * reported, and why mobile looked about twice as soft as desktop rather than
 * equally soft.
 *
 * The street now ships FULL RESOLUTION. It costs ~31MB more decoded (10.4MB ->
 * 41.6MB RGBA) and ~10MB more in the APK, which the budget carries; in exchange
 * the layer under the player is drawn at the same effective sharpness as the
 * desktop build.
 *
 * Sky and background stay at 50% deliberately: they are distant, parallaxed and
 * low-frequency, they are what the memory ceiling is actually for, and halving
 * them is invisible at the sizes they are drawn. `tune.skyScale` /
 * `tune.backgroundScale` are the Android x2 compensation for exactly these two
 * — game.js must keep those and must NOT compensate the street, whose
 * streetScale is derived from the image width and self-corrects. */
const PLATE_SCALE = {
  'level-sky.png': 0.5,
  'level-background.png': 0.5,
  'level-main.png': 1,
};
const SHEET_CAP = 1280;
/* FIXED-GEOMETRY SHEETS STAY AT SOURCE SIZE. These are read with HARD-CODED
 * pixel coordinates, not the meta-driven grid the runtime prep derives:
 *   - darki-idle.png: the front end's main-menu character draws 964x956 cells
 *     of a 6x5 grid by literal (that glitched into a tile sheet when it was
 *     scaled);
 *   - exec-*.png: the finisher pair plus Street Justice, whose grids
 *     (cw/ch) are literals in game.js.
 * The game's own loader adapts to any image size (fw = img.width/cols), the
 * front end and the finisher system do not. */
const KEEP_FULL_RES = new Set([
  'darki-idle.png',
  'exec-darki.png',
  'exec-olodo.png',
  'exec-streetjustice.png',
]);

/* CELL-BY-CELL RESIZE. A whole-sheet downscale bleeds across the grid: the
 * walk sheet's feet touch each cell's bottom edge, so any filter with a
 * sampling radius blends them into the top of the cell below — a thin line of
 * ink that inflates the runtime's shared union box and shrinks the drawn
 * character by ~30%. Resizing each cell inside its own buffer removes the
 * cross-boundary sampling entirely. */
function resizeCells(file, cols, rows, cap) {
  return Jimp.read(file).then((img) => {
    const k = cap / Math.max(img.bitmap.width, img.bitmap.height);
    const cellW = Math.max(1, Math.floor((img.bitmap.width / cols) * k));
    const cellH = Math.max(1, Math.floor((img.bitmap.height / rows) * k));
    const out = new Jimp(cellW * cols, cellH * rows, 0x00000000);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = img.clone().crop(c * Math.floor(img.bitmap.width / cols),
          r * Math.floor(img.bitmap.height / rows),
          Math.floor(img.bitmap.width / cols), Math.floor(img.bitmap.height / rows));
        cell.resize(cellW, cellH);
        out.composite(cell, c * cellW, r * cellH);
      }
    }
    return out;
  });
}

async function run() {
  /* Only the GENERATED kinds are rebuilt here: `frontend/` carries hand-made
   * transcodes (the mobile intro) that a full wipe would delete. */
  fs.rmSync(path.join(OUT, 'layers'), { recursive: true, force: true });
  fs.rmSync(path.join(OUT, 'sprites'), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'layers'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'sprites'), { recursive: true });

  // 1. the opaque plates — PER LAYER, not one blanket factor (see PLATE_SCALE)
  for (const [name, factor] of Object.entries(PLATE_SCALE)) {
    const src = path.join(ROOT, 'layers', name);
    const img = await Jimp.read(src);
    if (factor < 1) img.resize(Math.round(img.bitmap.width * factor), Jimp.AUTO);
    await img.writeAsync(path.join(OUT, 'layers', name));
    console.log(`plate ${name}: ${img.bitmap.width}x${img.bitmap.height}`
      + (factor < 1 ? ` (${factor * 100}%)` : ' (FULL RES)'));
  }

  // 2. the sprite sheets: cap the longest side by resizing CELL-BY-CELL (see
  // resizeCells above for why), copy the metas unchanged
  const spriteDir = path.join(ROOT, 'sprites');
  let capped = 0, kept = 0, fullres = 0;
  for (const f of fs.readdirSync(spriteDir)) {
    const src = path.join(spriteDir, f);
    const dst = path.join(OUT, 'sprites', f);
    if (f.endsWith('.json')) { fs.copyFileSync(src, dst); continue; }
    if (KEEP_FULL_RES.has(f)) { fs.copyFileSync(src, dst); fullres++; continue; }
    const img = await Jimp.read(src);
    const longest = Math.max(img.bitmap.width, img.bitmap.height);
    if (longest > SHEET_CAP) {
      let done = false;
      const metaPath = path.join(spriteDir, f.replace(/\.png$/, '.json'));
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          const cols = meta?.sheet?.cols, rows = meta?.sheet?.rows;
          if (cols > 0 && rows > 0) {
            const out = await resizeCells(src, cols, rows, SHEET_CAP);
            await out.writeAsync(dst);
            done = true;
          }
        } catch {}
      }
      if (!done) {
        const k = SHEET_CAP / longest;
        img.resize(Math.round(img.bitmap.width * k), Math.round(img.bitmap.height * k));
        await img.writeAsync(dst);
      }
      capped++;
    } else {
      kept++;
      await img.writeAsync(dst);
    }
  }
  console.log(`sheets: ${capped} capped to ${SHEET_CAP}, ${kept} kept at source size, ${fullres} fixed-geometry kept full-res`);

  // 3. the idle twin: the menu keeps the full-resolution sheet (fixed cell
  //    geometry), gameplay on Android loads this capped copy instead.
  {
    const img = await resizeCells(path.join(ROOT, 'sprites', 'darki-idle.png'), 6, 5, SHEET_CAP);
    await img.writeAsync(path.join(OUT, 'sprites', 'darki-idle-mobile.png'));
    console.log(`idle twin: ${img.bitmap.width}x${img.bitmap.height}`);
  }

  const MB = (p) => (fs.statSync(p).size / 1048576).toFixed(1) + ' MB';
  console.log(`plate sample: ${MB(path.join(OUT, 'layers', 'level-main.png'))}`);
  console.log(`sheet sample: ${MB(path.join(OUT, 'sprites', 'darki-walk.png'))}`);
}

run().then(() => console.log('mobile assets generated'))
  .catch((e) => { console.error(e); process.exit(1); });
