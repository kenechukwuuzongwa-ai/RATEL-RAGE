/* Ratel Rage — the touch HUD's button art.
 *
 * Rebuilds `frontend/ui/controls/*.png` from the supplied artwork in
 * `ASSETS/UI ELEMENTS/`. The originals are NEVER modified; this only writes
 * into the web root.
 *
 * WHY A BUILD STEP AND NOT JUST THE SOURCE FILES. The supplied buttons are
 * 1254x1254 — 6.3 MB each once decoded — for a control that renders at roughly
 * 100-130 px. Shipping them as-is would put ~25 MB of decoded bitmap into the
 * renderer for five buttons, on a device whose budget the level art already
 * fills. At 384 px square they cover the largest case comfortably (base 76 x
 * scale 1.8 x a 1.2 short-edge multiplier is ~164 CSS px, and ~490 device px at
 * DPR 3) and cost ~0.9 MB on disk in total.
 *
 * NAME MATCHING is the contract: the left-hand name is the file the artist
 * supplied, the right-hand name is the CONTROL ID in src/touch.js. A control
 * picks its art up by `img: '<id>'`, so adding a button means dropping a file
 * in ASSETS/UI ELEMENTS, adding one row here, and setting `img` on the control.
 *
 *   node gen-ui-buttons.js          (from mobile/)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(ROOT, '..', 'ASSETS', 'UI ELEMENTS');
const OUT = path.join(ROOT, 'frontend', 'ui', 'controls');
const SIZE = 384;

/* supplied file -> control id in src/touch.js CONTROLS */
const MAP = {
  'kick.png': 'kick',
  'Grab.png': 'grab',
  'Hit.png': 'jab',        // the fist: the JAB is the punch
  'Jump.png': 'jump',
  'Block.png': 'block',
};

/* ffmpeg rather than a node image library: it is already a dependency of this
 * project's media pipeline (the intro and splash transcodes), it keeps the
 * alpha channel, and `pad` squares up art that is not square — Block.png is
 * 530x538 — without stretching the sphere. */
const FFMPEG = process.env.FFMPEG
  || 'C:\\Users\\kenec\\AndroidDev\\ff\\ffmpeg-master-latest-win64-gpl\\bin\\ffmpeg.exe';

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`MISSING source art: ${SRC}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  let done = 0;
  for (const [file, id] of Object.entries(MAP)) {
    const from = path.join(SRC, file);
    if (!fs.existsSync(from)) {
      console.error(`MISSING ${file} — control "${id}" would ship without art`);
      process.exit(1);
    }
    const to = path.join(OUT, `${id}.png`);
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', from,
      '-vf', `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease:flags=lanczos,`
        + `pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=#00000000`,
      '-pix_fmt', 'rgba', to]);
    const kb = (fs.statSync(to).size / 1024).toFixed(0);
    console.log(`  ${file.padEnd(12)} -> ${id.padEnd(7)} ${SIZE}x${SIZE}  ${kb} KB`);
    done++;
  }
  const total = Object.values(MAP)
    .reduce((s, id) => s + fs.statSync(path.join(OUT, `${id}.png`)).size, 0);
  console.log(`${done} buttons written to frontend/ui/controls (${(total / 1048576).toFixed(2)} MB total)`);
}

main();
