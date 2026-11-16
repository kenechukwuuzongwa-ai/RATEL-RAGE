/* Ratel Rage — THE WEBSITE (request 657).
 *
 *   node deploy/build-site.js [--out <dir>]      build the site alone (default deploy/site-dist)
 *   node deploy/build-site.js --check            only the drift check
 *
 * build-web.js calls buildSite(OUT) for the real deploy: the site takes the root of
 * ratelrage.com and the game lives at /play/.
 *
 * site/layout.html   the shared page frame ({{TITLE}} {{DESC}} {{PATH}} {{OG}} {{NAV}}
 *                    {{CONTENT}} {{PAGE}} {{VER}} {{HEAD}} {{COMPAT}})
 * site/site.json     the menu and the page register (src, path, title, desc, og[, file])
 * site/pages/*.html  each page's <main> content
 * site/assets/       css, js and images, copied to /assets/
 *
 * THE DRIFT CHECK: any number a page states about the game is written as
 * <b data-fact="score.ko">150</b>. checkFacts() reads the same number out of
 * src/game.js and stops the build when a page and the game disagree, so the
 * site can never quietly go stale after a balance change. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const ORIGIN = 'https://ratelrage.com';

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

/* ---- the game's numbers, read from the source (object literals evaluated as written) */
function gameConstants() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'game.js'), 'utf8');
  const obj = (name) => {
    const at = src.indexOf(`const ${name} = {`);
    if (at < 0) throw new Error(`drift check: const ${name} not found in game.js`);
    let i = src.indexOf('{', at), depth = 0, j = i;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    return Function(`"use strict"; return (${src.slice(i, j + 1)});`)();
  };
  const num = (name) => {
    const m = new RegExp(`const ${name} = ([0-9.]+);`).exec(src);
    if (!m) throw new Error(`drift check: const ${name} not found in game.js`);
    return +m[1];
  };
  return { SCORE: obj('SCORE'), COMBO: obj('COMBO'), CLUTCH: obj('CLUTCH'), REGEN: obj('REGEN'), MEDPACK: obj('MEDPACK'),
    DIFFICULTY: obj('DIFFICULTY'), RAGE_DUR: num('RAGE_DUR'), RAGE_DMG_MUL: num('RAGE_DMG_MUL'), RAGE_SPEED_MUL: num('RAGE_SPEED_MUL') };
}
function factValue(key, G) {
  const [a, b, c] = key.split('.');
  if (a === 'rank') { const r = G.SCORE.ranks.find(([n]) => n === b); return r && r[1]; }
  if (a === 'score') return { ko: G.SCORE.perKo, combo: G.SCORE.perComboHit, top: G.SCORE.perTopHitDmg, time: G.SCORE.perSecUnderPar, par: G.SCORE.parTime, health: G.SCORE.health }[b];
  if (a === 'combo') return { step: G.COMBO.stepEvery, max: G.COMBO.maxMul }[b];
  if (a === 'clutch') return { per: G.CLUTCH.perHit, max: G.CLUTCH.maxStack }[b];
  if (a === 'rage') return { dur: G.RAGE_DUR, mul: G.RAGE_DMG_MUL, speed: G.RAGE_SPEED_MUL }[b];
  if (a === 'regen') return { calm: G.REGEN.calm }[b];
  if (a === 'medpack') return { heal: G.MEDPACK.heal * 100 }[b];
  if (a === 'diff') { const row = G.DIFFICULTY[b]; return row ? row[c] : undefined; }
  return undefined;
}
const shown = (text) => {
  const t = text.replace(/<[^>]*>/g, '').trim().toLowerCase();
  if (t === 'no limit') return null;
  return Number(t.replace(/[×x%,\s]/g, ''));
};
function checkFacts() {
  const G = gameConstants();
  const problems = [];
  let n = 0;
  for (const f of fs.readdirSync(path.join(SITE, 'pages'))) {
    const html = fs.readFileSync(path.join(SITE, 'pages', f), 'utf8');
    for (const m of html.matchAll(/data-fact="([^"]+)"[^>]*>([^<]*)</g)) {
      n++;
      const want = factValue(m[1], G);
      const got = shown(m[2]);
      if (want === undefined) problems.push(`${f}: unknown fact "${m[1]}"`);
      else if (!(want === got || (want != null && got != null && Math.abs(want - got) < 1e-9))) problems.push(`${f}: ${m[1]} says "${m[2]}", the game has ${want === null ? 'no limit' : want}`);
    }
  }
  return { n, problems };
}

/* ---- the root's forwarding: old addresses and links that belong to the game.
 * Runs first in every page's <head>, before anything paints. */
const COMPAT = `(function(){var L=location,H=L.hostname,S='${ORIGIN}';
if(H==='www.ratelrage.com'){L.replace(S+L.pathname+L.search+L.hash);return;}
var root=L.pathname==='/'||L.pathname==='/index.html';
if(H==='ratel-rage.pages.dev'&&root){L.replace(S+'/play/'+L.search+L.hash);return;}
if(H==='ratel-rage.pages.dev'){L.replace(S+L.pathname+L.search+L.hash);return;}
if(!root)return;
var q=L.search,h=L.hash;
if(/[?&](app|from|code|error|error_description)=/.test(q)||/^#(access_token|refresh_token|error|rr-carry)=/.test(h)||/[#&](access_token|error)=/.test(h)){L.replace('/play/'+q+h);}
})();`;

/* Pages carried over from the old root build that live elsewhere now. Cloudflare Pages itself serves
 * /privacy.html at /privacy (it 308s the .html name there), so /privacy must NOT point back at
 * /privacy.html: that was a redirect loop in the first v170 deploy. */
const REDIRECTS = [
  '/privacy/ /privacy 301',
  '/quit.html /play/quit.html 301',
  '/index.html / 301',
  '/how-to-play/combos /how-to-play/combos/ 301',
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function buildSite(OUT, { ver = 'dev' } = {}) {
  const { n, problems } = checkFacts();
  if (problems.length) {
    console.error('SITE DRIFT: the website and the game disagree:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  const conf = JSON.parse(fs.readFileSync(path.join(SITE, 'site.json'), 'utf8'));
  const layout = fs.readFileSync(path.join(SITE, 'layout.html'), 'utf8');
  for (const tag of ['{{TITLE}}', '{{CONTENT}}', '{{NAV}}', '{{COMPAT}}']) if (!layout.includes(tag)) throw new Error(`layout.html: ${tag} missing`);
  copyDir(path.join(SITE, 'assets'), path.join(OUT, 'assets'));

  // every local link and image a page names must exist in the build (or be a game path)
  const urls = [];
  for (const p of conf.pages) {
    const content = fs.readFileSync(path.join(SITE, 'pages', p.src), 'utf8');
    const nav = conf.nav.map(([href, label]) => {
      const here = p.path === href || (href !== '/' && p.path.startsWith(href) && !conf.nav.some(([h2]) => h2 !== href && h2.startsWith(href) && p.path.startsWith(h2)));
      return `<a href="${href}"${here ? ' aria-current="page"' : ''}>${label}</a>`;
    }).join('');
    let head = '';
    if (p.path === '/') head = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'VideoGame', name: 'Ratel Rage', alternateName: 'Ratel Rage: Streets of Justice',
      url: ORIGIN + '/', description: p.desc, genre: ['Beat \'em up', 'Action'], gamePlatform: ['Web browser', 'Android', 'iOS'],
      applicationCategory: 'Game', operatingSystem: 'Any', inLanguage: 'en', isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, publisher: { '@type': 'Organization', name: 'KenCrafts Studio' },
      image: `${ORIGIN}/assets/img/${p.og}`,
    })}</script>`;
    if (p.path === '/404.html') head = '<meta name="robots" content="noindex" />';
    const html = layout
      .replace('{{COMPAT}}', COMPAT)
      .replace(/\{\{TITLE\}\}/g, esc(p.title))
      .replace(/\{\{DESC\}\}/g, esc(p.desc))
      .replace(/\{\{PATH\}\}/g, p.path)
      .replace(/\{\{OG\}\}/g, p.og)
      .replace(/\{\{VER\}\}/g, ver)
      .replace(/\{\{PAGE\}\}/g, p.src.replace(/\.html$/, ''))
      .replace('{{NAV}}', nav)
      .replace('{{HEAD}}', head)
      .replace('{{CONTENT}}', () => content);
    const file = p.file ? path.join(OUT, p.path) : path.join(OUT, p.path, 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
    if (!p.file) urls.push(ORIGIN + p.path);
  }
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    urls.concat(ORIGIN + '/play/').map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
  fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
  fs.writeFileSync(path.join(OUT, '_redirects'), REDIRECTS.join('\n') + '\n');
  return { pages: conf.pages.length, facts: n };
}

/* every /assets/… and /play/… path a built page names, missing from OUT -> list */
function missingRefs(OUT) {
  const miss = new Set();
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const pages = walk(OUT).filter((f) => f.endsWith('.html') && !f.startsWith(path.join(OUT, 'play')));
  const files = pages.concat(path.join(OUT, 'assets', 'site.js'), path.join(OUT, 'assets', 'site.css'));
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/["'(](?:https:\/\/ratelrage\.com)?((?:\/assets|\/play)\/[^"'()\s?#{}]+)/g)) {
      const u = m[1];
      if (u.endsWith('/')) continue;                       // a folder the script appends a name to
      const local = path.join(OUT, decodeURIComponent(u));
      if (!fs.existsSync(local)) miss.add(u);
    }
  }
  return [...miss];
}

module.exports = { buildSite, checkFacts, missingRefs };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const { n, problems } = checkFacts();
    if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
    console.log(`site drift check: ${n} facts match the game`);
    process.exit(0);
  }
  const outAt = args.indexOf('--out');
  const OUT = outAt >= 0 ? path.resolve(args[outAt + 1]) : path.join(__dirname, 'site-dist');
  fs.rmSync(OUT, { recursive: true, force: true });
  const r = buildSite(OUT);
  const miss = missingRefs(OUT).filter((u) => !u.startsWith('/play/'));
  console.log(`site -> ${OUT}: ${r.pages} pages, ${r.facts} facts checked`);
  if (miss.length) console.log('  missing site assets:\n    ' + miss.join('\n    '));
}
