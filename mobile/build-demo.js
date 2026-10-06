/* Ratel Rage — Android packaging shell.
 *
 * Copies the WEB ROOT into mobile/www by allowlist. Nothing outside this list
 * reaches the APK, and nothing in the source tree is modified, moved, or
 * deleted: this is a one-way copy.
 *
 * Allowlisted (everything the running game loads):
 *   index.html, styles.css
 *   src/        (game.js, frontend.js, aftermath.js, playarea.js, story.js,
 *                worldConfig.js, touch.js)
 *   frontend/   (fonts, menu, splash, ui, intro, audio)
 *   layers/     sprites/      sounds/      music/
 *
 * Excluded on purpose (design references, dev tooling, docs, checkpoints):
 *   level1/, buildings/, docs/, tests/, _unused/, RageOfRatel/, .git/,
 *   .agents/, .claude/, .wizardgenie/, CHANGELOG.md, README.md, mobile/ itself.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');   // the project (web) root
const WWW = path.join(__dirname, 'www');

const ALLOWLIST = [
  'index.html',
  'styles.css',
  'src',
  'frontend',
  'layers',
  'sprites',
  'sounds',
  'music',
  // The world loader fetches these at runtime (buildings.json, kit.json):
  'buildings',
  'level1',
];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function dirSize(p) {
  let total = 0;
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, entry.name);
    total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  return total;
}

// 1. clean www
fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

// 2. copy the allowlist
const report = [];
for (const item of ALLOWLIST) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) {
    console.error(`MISSING from allowlist: ${item} — the build would ship without it`);
    process.exit(1);
  }
  const dst = path.join(WWW, item);
  if (fs.statSync(src).isDirectory()) {
    copyDir(src, dst);
    report.push([item, dirSize(dst)]);
  } else {
    fs.copyFileSync(src, dst);
    report.push([item, fs.statSync(dst).size]);
  }
}

/* 2b. THE TOUCH BUTTONS' FILENAMES ARE LOWERCASED.
 *
 * `frontend/ui/controls/` is a drop folder — new button art is copied in by
 * hand, straight from whatever the artist exported. Windows does not care that
 * a file arrives as `Kick.png` while the code asks for `kick.png`, and neither
 * does the desktop build. ANDROID DOES: asset paths inside the APK are
 * case-sensitive, so a capitalised drop ships a button that 404s and renders as
 * nothing at all — no error, just a control the player cannot see.
 *
 * That has already happened once (Jump.png / Kick.png), and it is the same trap
 * that made `Intro.mp4` unreachable on device. Normalising here means the drop
 * folder can stay casual and the shipped names stay canonical. */
{
  const ctrl = path.join(WWW, 'frontend', 'ui', 'controls');
  if (fs.existsSync(ctrl)) {
    for (const f of fs.readdirSync(ctrl)) {
      const lower = f.toLowerCase();
      if (f === lower) continue;
      // two steps: a case-only rename is a no-op on a case-insensitive volume
      const tmp = path.join(ctrl, `__case_${lower}`);
      fs.renameSync(path.join(ctrl, f), tmp);
      fs.renameSync(tmp, path.join(ctrl, lower));
      console.log(`control art: ${f} -> ${lower} (Android paths are case-sensitive)`);
    }
  }
}

// 3. overlay the mobile-generated assets (if present) over the www copy.
//    gen-mobile-assets.js writes downscaled plates/sheets here; the originals
//    in the source tree are never modified.
const MOBILE_ASSETS = path.join(__dirname, 'assets-mobile');
if (fs.existsSync(MOBILE_ASSETS)) {
  for (const kind of ['layers', 'sprites']) {
    const srcRoot = path.join(MOBILE_ASSETS, kind);
    if (!fs.existsSync(srcRoot)) continue;
    for (const f of fs.readdirSync(srcRoot)) fs.copyFileSync(path.join(srcRoot, f), path.join(WWW, kind, f));
  }
  /* frontend/ can carry nested overrides (the mobile intro transcode). */
  const feRoot = path.join(MOBILE_ASSETS, 'frontend');
  if (fs.existsSync(feRoot)) copyDir(feRoot, path.join(WWW, 'frontend'));
  /* The packaged build is Android-only: when the 720p intro twin is present,
   * the 67MB master is dead weight in the APK, so the generated www drops it. */
  const mobileIntro = path.join(WWW, 'frontend', 'intro', 'intro-mobile.mp4');
  const masterIntro = path.join(WWW, 'frontend', 'intro', 'Intro.mp4');
  if (fs.existsSync(mobileIntro) && fs.existsSync(masterIntro)) {
    fs.rmSync(masterIntro);
    console.log('master intro removed from www (mobile twin ships instead)');
  }
  console.log('mobile asset overlay applied (downscaled plates + sheets + frontend overrides)');
}

// 4. report
const MB = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
for (const [name, size] of report) console.log(`  ${name.padEnd(14)} ${MB(size)}`);
console.log(`www total: ${MB(report.reduce((s, r) => s + r[1], 0))}`);
