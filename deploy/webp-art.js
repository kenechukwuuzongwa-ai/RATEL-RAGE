/* Ratel Rage — WebP twins for the web build (request 507).
 *
 *   node deploy/webp-art.js <dist dir>
 *
 * Called by build-web.js. Every PNG under <dist>/sprites, <dist>/layers and
 * <dist>/lowres/{sprites,layers} (subfolders included) gets a .webp beside it (q90, alpha kept exact —
 * the settings shown side by side in _chromakey/req505), kept only when it is
 * at least 10% smaller. The PNGs stay, so anything that asks for one by name
 * still gets it. Prints the converted paths (relative to <dist>, forward
 * slashes) as JSON on the last line of stdout; build-web.js puts that list in
 * RR_WEB.webp, and game.js / frontend.js fetch the .webp for exactly those.
 *
 * Encoding ~350 MB takes minutes, so results are cached in deploy/.webp-cache
 * by the PNG's SHA-1: an unchanged sheet is copied, not re-encoded. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadSharp() {
  for (const p of ['sharp', path.resolve(__dirname, '../../_chromakey/node_modules/sharp')]) {
    try { return require(p); } catch {}
  }
  console.error('webp-art: sharp not found (npm i sharp, or keep _chromakey/node_modules)');
  process.exit(1);
}
const sharp = loadSharp();

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'dist'));
const CACHE = path.join(__dirname, '.webp-cache');
const OPTS = { quality: 90, alphaQuality: 100, effort: 4 };
const KEY = 'q90a100e4';
const DIRS = ['sprites', 'layers', 'lowres/sprites', 'lowres/layers'];

(async () => {
  fs.mkdirSync(CACHE, { recursive: true });
  const list = [];
  let pngBytes = 0, webpBytes = 0, encoded = 0, cached = 0;
  const pngsIn = (dir, rel) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pngsIn(path.join(dir, e.name), `${rel}/${e.name}`)
      : /\.png$/i.test(e.name) ? [`${rel}/${e.name}`] : []);
  for (const d of DIRS) {
    const dir = path.join(OUT, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of pngsIn(dir, d)) {
      const png = path.join(OUT, f);
      const buf = fs.readFileSync(png);
      const hit = path.join(CACHE, `${crypto.createHash('sha1').update(buf).digest('hex')}.${KEY}.webp`);
      let webp;
      if (fs.existsSync(hit)) { webp = fs.readFileSync(hit); cached++; }
      else {
        const meta = await sharp(buf).metadata();
        if (meta.width > 16383 || meta.height > 16383) continue; // past WebP's size limit
        webp = await sharp(buf, { limitInputPixels: false }).webp(OPTS).toBuffer();
        fs.writeFileSync(hit, webp); encoded++;
      }
      if (webp.length > buf.length * 0.9) continue;            // not worth a second format
      fs.writeFileSync(png.replace(/\.png$/i, '.webp'), webp);
      list.push(f);
      pngBytes += buf.length; webpBytes += webp.length;
    }
  }
  console.error(`webp-art: ${list.length} twins (${encoded} encoded, ${cached} cached), ` +
    `${(pngBytes / 1048576).toFixed(1)} MB PNG -> ${(webpBytes / 1048576).toFixed(1)} MB WebP`);
  console.log(JSON.stringify(list));
})().catch((e) => { console.error(e); process.exit(1); });
