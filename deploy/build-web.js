/* Ratel Rage — PUBLIC WEB BUILD (static files).
 *
 *   node deploy/build-web.js [--full-intro] [--out <dir>]
 *
 * Copies the same allowlist the Android packager ships (mobile/build-demo.js)
 * into deploy/dist/, then makes it fit ONE tree served to every browser:
 *
 *   1. lowres/       the phone copies of the plates and sheets
 *                    (mobile/assets-mobile, made by gen-mobile-assets.js), listed
 *                    in window.RR_WEB.lowres. game.js points an ANDROID browser
 *                    at them — the art the APK already ships and was tuned on.
 *                    Desktop browsers keep the originals.
 *   2. phone-only files the code asks for by name (darki-idle-mobile.png, the
 *                    720p intro and splash twins) go in at the path it asks for.
 *   3. Intro.mp4     replaced by the 720p twin (7.6 MB instead of 67 MB): the game
 *                    renders 1280x720, and Cloudflare Pages refuses files over
 *                    25 MiB. --full-intro keeps the 1080p master (for a host
 *                    without that limit).
 *   4. index.html    gets window.RR_WEB = { production, build, lowres } inline,
 *                    which hides the authoring tools (game.js DEV_TOOLS).
 *   5. _headers      cache + safety headers (Cloudflare Pages / Netlify syntax).
 *
 * The source tree is never modified. Nothing here needs a server to build. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const FULL_INTRO = args.includes('--full-intro');
const outAt = args.indexOf('--out');
const OUT = outAt >= 0 ? path.resolve(args[outAt + 1]) : path.join(__dirname, 'dist');
const MOBILE = path.join(ROOT, 'mobile', 'assets-mobile');
const CF_FILE_LIMIT = 25 * 1024 * 1024;

const ALLOWLIST = ['index.html', 'privacy.html', 'styles.css', 'analytics-config.js', 'supabase-config.js', 'favicon.png', 'src', 'frontend',
  'layers', 'sprites', 'sounds', 'music', 'buildings', 'level1'];

const sha = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

// 1. clean + copy the allowlist
if (!OUT.startsWith(path.join(ROOT, 'deploy')) && fs.existsSync(OUT) && !fs.existsSync(path.join(OUT, 'build-info.json'))) {
  console.error(`refusing to clear ${OUT}: it is not a previous web build`);
  process.exit(1);
}
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const item of ALLOWLIST) {
  const s = path.join(ROOT, item);
  if (!fs.existsSync(s)) { console.error(`MISSING: ${item}`); process.exit(1); }
  if (fs.statSync(s).isDirectory()) copyDir(s, path.join(OUT, item));
  else fs.copyFileSync(s, path.join(OUT, item));
}

// 2. touch-button art lowercased (Linux hosts are case-sensitive; see build-demo.js 2b)
{
  const ctrl = path.join(OUT, 'frontend', 'ui', 'controls');
  if (fs.existsSync(ctrl)) for (const f of fs.readdirSync(ctrl)) {
    const lower = f.toLowerCase();
    if (f === lower) continue;
    const tmp = path.join(ctrl, `__case_${lower}`);
    fs.renameSync(path.join(ctrl, f), tmp);
    fs.renameSync(tmp, path.join(ctrl, lower));
    console.log(`control art: ${f} -> ${lower}`);
  }
}

// 3. the phone art
const lowres = [];
let phoneOnly = 0;
for (const kind of ['layers', 'sprites']) {
  const dir = path.join(MOBILE, kind);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.png$/i.test(f)) continue;                       // metas are identical to the source's
    const mob = path.join(dir, f), src = path.join(ROOT, kind, f);
    if (!fs.existsSync(src)) {                              // asked for by name on Android only
      fs.copyFileSync(mob, path.join(OUT, kind, f)); phoneOnly++;
      continue;
    }
    if (sha(mob) === sha(src)) continue;                    // kept full-res for the phone too
    fs.mkdirSync(path.join(OUT, 'lowres', kind), { recursive: true });
    fs.copyFileSync(mob, path.join(OUT, 'lowres', kind, f));
    lowres.push(`${kind}/${f}`);
  }
}
const mobFront = path.join(MOBILE, 'frontend');
if (fs.existsSync(mobFront)) for (const f of walk(mobFront)) {
  const rel = path.relative(mobFront, f);
  const dst = path.join(OUT, 'frontend', rel);
  if (fs.existsSync(dst)) continue;                         // only the phone twins, never an override
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(f, dst); phoneOnly++;
}

// 4. the intro
/* Every story cut with a phone twin (request 399 added Level 2's): the twin
 * goes in under the master's name, so the one tree serves every browser and
 * no file breaks Cloudflare Pages' 25 MiB limit. */
const INTRO_TWINS = [['Intro.mp4', 'intro-mobile.mp4'], ['level2-intro.mp4', 'level2-intro-mobile.mp4']];
const introNotes = [];
for (const [m, t] of INTRO_TWINS) {
  const master = path.join(OUT, 'frontend', 'intro', m);
  const twin = path.join(OUT, 'frontend', 'intro', t);
  if (!FULL_INTRO && fs.existsSync(master) && fs.existsSync(twin)) {
    fs.copyFileSync(twin, master);
    introNotes.push(`${m}: 720p twin under the master's name`);
  } else if (fs.existsSync(master)) introNotes.push(`${m}: master`);
}
const intro = introNotes.join('; ');

// 5. index.html: production flag + the lowres list, before any game script
const build = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
const idx = path.join(OUT, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
const flag = `<script>window.RR_WEB = ${JSON.stringify({ production: true, build: `web-${build}`, lowres })};</script>`;
if (!html.includes('<meta charset="UTF-8" />')) { console.error('index.html: charset meta not found'); process.exit(1); }
html = html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n  ${flag}`);
/* Cloudflare Web Analytics (visits/page views for ratel-rage.pages.dev). Web build
 * only: the APK and local runs never load it. `--no-beacon` leaves it out. It is
 * fire-and-forget; the game does not wait on it. */
const CF_BEACON_TOKEN = 'a426e727359c43adb907c33ce6c36f4c';
if (!process.argv.includes('--no-beacon')) {
  if (!html.includes('</body>')) { console.error('index.html: </body> not found'); process.exit(1); }
  html = html.replace('</body>', `  <!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "${CF_BEACON_TOKEN}"}'></script><!-- End Cloudflare Web Analytics -->\n</body>`);
}
fs.writeFileSync(idx, html);

/* In-game stats (stats/worker.js, docs/STATS.md): the WEB build points the game's
 * analytics at the rr-stats Worker. The source analytics-config.js stays empty, so
 * plays in the editor and the APK are never counted. `--no-stats` leaves it off. */
const STATS_ENDPOINT = 'https://rr-stats.kenechukwuuzongwa.workers.dev/e';
if (!process.argv.includes('--no-stats')) {
  const cfgPath = path.join(OUT, 'analytics-config.js');
  const cfg = fs.readFileSync(cfgPath, 'utf8');
  if (!/endpoint: '',/.test(cfg)) { console.error('analytics-config.js: empty endpoint line not found'); process.exit(1); }
  fs.writeFileSync(cfgPath, cfg.replace(/endpoint: '',/, `endpoint: '${STATS_ENDPOINT}',`));
}

/* Player accounts (src/account.js, docs/ACCOUNTS.md): the WEB build connects to the
 * Supabase project "Ratel Rage". The key is the PUBLISHABLE one (public by design;
 * RLS protects the data). The source supabase-config.js stays empty, so the editor
 * and the APK stay device-only. Google stays hidden until its provider is set up.
 * `--no-accounts` leaves it off. */
const SUPABASE = { url: 'https://xnnygfkzagqoxuhqervm.supabase.co', anonKey: 'sb_publishable_-bUEkA2cHSVcg4g1qsLXSQ_kNw7MgWr', google: false };
if (!process.argv.includes('--no-accounts')) {
  if (/^sb_secret_/.test(SUPABASE.anonKey)) { console.error('build-web: refusing a SECRET Supabase key'); process.exit(1); }
  const sbPath = path.join(OUT, 'supabase-config.js');
  let sb = fs.readFileSync(sbPath, 'utf8');
  if (!/url: '',/.test(sb) || !/anonKey: '',/.test(sb) || !/google: true,/.test(sb)) { console.error('supabase-config.js: expected empty url/anonKey lines not found'); process.exit(1); }
  sb = sb.replace(/url: '',/, `url: '${SUPABASE.url}',`).replace(/anonKey: '',/, `anonKey: '${SUPABASE.anonKey}',`)
    .replace(/google: true,/, `google: ${SUPABASE.google},`);
  fs.writeFileSync(sbPath, sb);
}

// 6. headers (Cloudflare Pages / Netlify `_headers`)
fs.writeFileSync(path.join(OUT, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  '/',
  '  Cache-Control: no-cache',
  '/index.html',
  '  Cache-Control: no-cache',
  '/analytics-config.js',
  '  Cache-Control: no-cache',
  '/supabase-config.js',
  '  Cache-Control: no-cache',
  '/src/*',
  '  Cache-Control: public, max-age=300',
  '/styles.css',
  '  Cache-Control: public, max-age=300',
  // art and audio are not fingerprinted: a day, then revalidate
  ...['sprites', 'lowres', 'layers', 'sounds', 'music', 'frontend', 'buildings', 'level1']
    .flatMap((d) => [`/${d}/*`, '  Cache-Control: public, max-age=86400']),
  '',
].join('\n'));

// 7. report + limits
const files = walk(OUT);
const bytes = files.reduce((s, f) => s + fs.statSync(f).size, 0);
const big = files.filter((f) => fs.statSync(f).size > CF_FILE_LIMIT).map((f) => path.relative(OUT, f));
fs.writeFileSync(path.join(OUT, 'build-info.json'), JSON.stringify({
  build: `web-${build}`, files: files.length + 1, bytes, lowres: lowres.length, phoneOnly, intro, overCfLimit: big,
}, null, 2));
console.log(`web build -> ${OUT}`);
console.log(`  ${files.length + 1} files, ${(bytes / 1048576).toFixed(1)} MB`);
console.log(`  lowres (Android browsers): ${lowres.length} files; phone-only names: ${phoneOnly}; intro: ${intro}`);
if (big.length) console.log(`  WARNING over Cloudflare Pages' 25 MiB file limit: ${big.join(', ')}`);
