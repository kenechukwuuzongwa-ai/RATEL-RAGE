/* gen-neck.js — request 571: Darki's PENDANT and NECKLACE, found once, offline.
 *
 * For every sprites/darki-*.png sheet, in each cell (at the 480-px working size that
 * prepSpriteFrames keys and crops at) the NECKLACE is found as a string: the connected run of
 * bead red + bead white (+ the pendant's ivory and gold) in the chest band that holds both
 * colours — his shirt logo is white but has no bead red; the wrist beads are red with no white.
 * From it:
 *   p  the pendant: the ivory/gold at the far end of the loop from his head (the tooth hangs at
 *      the loop's bottom), as a centroid; r its rough size;
 *   b  up to 14 spread-out points on the beads (spark seats).
 * Written to sprites/neck/<sheet>.json; game.js maps each point through the sheet's own crop box,
 * so the glow and the sparks sit on the pendant and beads in every frame of every move.
 *
 *   node deploy/gen-neck.js [sheet-filter]   (cwd: the game folder; needs ../_chromakey/node_modules/sharp)
 */
const fs = require('fs'), path = require('path');
const sharp = require(path.resolve(__dirname, '../../_chromakey/node_modules/sharp'));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'sprites', 'neck');
fs.mkdirSync(OUT, { recursive: true });
const WORK_H = 480;
const only = process.argv[2];

const isRed = (r, g, b) => r >= 110 && g <= r * 0.24 && b <= r * 0.32;
const isWhite = (r, g, b) => Math.min(r, g, b) >= 165 && r - b <= 70;
const isGold = (r, g, b) => r >= 170 && g >= r * 0.5 && g <= r * 0.85 && b <= r * 0.38;

(async () => {
  const sheets = fs.readdirSync(path.join(ROOT, 'sprites')).filter((f) => /^darki-.*\.png$/.test(f) && !/-mobile\.png$/.test(f) && (!only || f.includes(only)));
  const summary = [];
  for (const f of sheets) {
    const jf = path.join(ROOT, 'sprites', f.replace(/\.png$/, '.json'));
    if (!fs.existsSync(jf)) continue;
    const j = JSON.parse(fs.readFileSync(jf, 'utf8'));
    const meta = j.sprites?.[0] ?? j;
    const cols = meta.sheet?.cols, rows = meta.sheet?.rows;
    if (!cols || !rows) continue;
    const md = await sharp(path.join(ROOT, 'sprites', f)).metadata();
    const fw = md.width / cols, fh = md.height / rows;
    const workW = Math.round(WORK_H * (fw / fh));
    const W = workW * cols, H = WORK_H * rows;
    const { data } = await sharp(path.join(ROOT, 'sprites', f)).resize(W, H, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const frames = [];
    let hit = 0;
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * workW, y0 = cy * WORK_H;
      const at = (x, y) => ((y0 + y) * W + x0 + x) * 4;
      let top = WORK_H, bot = -1, hx = 0, hn = 0;
      for (let y = 0; y < WORK_H; y++) for (let x = 0; x < workW; x++) if (data[at(x, y) + 3] >= 160) { if (y < top) top = y; if (y > bot) bot = y; }
      if (bot < 0) { frames.push(null); continue; }
      const inkH = bot - top, yA = Math.round(top + inkH * 0.08), yB = Math.round(top + inkH * 0.44);
      // the head's x (top 8 % of ink): the loop's far end from it is the pendant
      for (let y = top; y < top + inkH * 0.08; y++) for (let x = 0; x < workW; x++) if (data[at(x, y) + 3] >= 160) { hx += x; hn++; }
      const head = [hn ? hx / hn : workW / 2, top];
      // 1 red, 2 white, 3 gold
      const cls = new Uint8Array(workW * WORK_H);
      for (let y = yA; y <= yB; y++) for (let x = 0; x < workW; x++) {
        const q = at(x, y); if (data[q + 3] < 160) continue;
        const r = data[q], g = data[q + 1], b = data[q + 2];
        cls[y * workW + x] = isWhite(r, g, b) ? 2 : isGold(r, g, b) ? 3 : 0;
      }
      // gold blobs (the tusks, the earring, the nose ring) and the whites (beads, the shirt logo)
      const seen = new Uint8Array(workW * WORK_H), whites = [];
      /* only BEAD-sized whites: small separate blobs (the skirt, the logo and a lit thigh are big masses) */
      const wseen = new Uint8Array(workW * WORK_H);
      for (let i = 0; i < cls.length; i++) {
        if (cls[i] !== 2 || wseen[i]) continue;
        const st = [i], px = []; wseen[i] = 1;
        while (st.length) {
          const k = st.pop(), x = k % workW, y = (k / workW) | 0; px.push([x, y]);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= workW || yy >= WORK_H) continue;
            const kk = yy * workW + xx; if (cls[kk] === 2 && !wseen[kk]) { wseen[kk] = 1; st.push(kk); }
            if (px.length > 60) break;
          }
        }
        if (px.length >= 2 && px.length <= 45) whites.push(...px);
      }
      const reach = inkH * 0.15;
      let best = null;
      for (let i = 0; i < cls.length; i++) {
        if (cls[i] !== 3 || seen[i]) continue;
        const st = [i], px = []; seen[i] = 1;
        while (st.length) {
          const k = st.pop(), x = k % workW, y = (k / workW) | 0; px.push([x, y]);
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= workW || yy >= WORK_H) continue;
            const kk = yy * workW + xx; if (cls[kk] === 3 && !seen[kk]) { seen[kk] = 1; st.push(kk); }
          }
        }
        if (px.length < 3) continue;
        // the tusks' cap is DEEP gold; a lit shoulder or knee on an orange-graded sheet is not
        const deep = px.filter(([x, y]) => { const q = at(x, y), r = data[q], g = data[q + 1], b = data[q + 2]; return b <= r * 0.15 && g >= r * 0.55; }).length;
        const gx = px.reduce((s, q) => s + q[0], 0) / px.length, gy = px.reduce((s, q) => s + q[1], 0) / px.length;
        const gd = Math.hypot(gx - head[0], gy - head[1]);
        // the beads it hangs from: whites near it, on the head's side of it (the logo sits under it)
        const beads = whites.filter((q) => Math.hypot(q[0] - gx, q[1] - gy) < reach && q[1] < gy + 2
          && Math.hypot(q[0] - head[0], q[1] - head[1]) < gd - 2);
        const score = beads.length + px.length * 0.5;
        // it hangs BETWEEN the necklace's two sides
        let bx0 = Infinity, bx1 = -Infinity; for (const q of beads) { if (q[0] < bx0) bx0 = q[0]; if (q[0] > bx1) bx1 = q[0]; }
        // …and hangs right off them: a bead within a few px of its gold, the string with some width
        let near = Infinity; for (const q of beads) for (const g of px) { const dd = Math.abs(q[0] - g[0]) + Math.abs(q[1] - g[1]); if (dd < near) near = dd; }
        if (near > inkH * 0.04 || bx1 - bx0 < inkH * 0.04) continue;
        // below the face (the nose ring and earring are gold too), and the string's arms rise well
        // above it — seen from behind, the beads lie in one flat row at the nape
        let by0 = Infinity; for (const q of beads) if (q[1] < by0) by0 = q[1];
        if (gy < top + inkH * 0.19 || gy - by0 < inkH * 0.07) continue;
        // on his centre line under the head, and not a bracelet (the wrist beads are red; the necklace has none)
        if (Math.abs(gx - head[0]) > inkH * 0.15) continue;
        let reds = 0;
        for (let yy = Math.max(0, Math.round(gy) - 6); yy <= Math.min(WORK_H - 1, Math.round(gy) + 6); yy++)
          for (let xx = Math.max(0, Math.round(gx) - 6); xx <= Math.min(workW - 1, Math.round(gx) + 6); xx++) {
            const q = at(xx, yy); if (data[q + 3] >= 160 && isRed(data[q], data[q + 1], data[q + 2])) reds++;
          }
        if (reds >= 10) continue;
        // the string's two arms: beads on BOTH sides of it (a lit shoulder has the neck's beads on one side)
        const left = beads.filter((q) => q[0] < gx - 1).length, right = beads.filter((q) => q[0] > gx + 1).length;
        if (Math.min(left, right) < beads.length * 0.15) continue;
        if (beads.length >= 8 && gx >= bx0 - 3 && gx <= bx1 + 3 && (!best || score > best.score)) best = { score, px, gx, gy, gd, beads };
      }
      if (!best) { frames.push(null); continue; }
      // the pendant's centre: its gold, weighted to the far end from the head (the tusk tips)
      const far = best.px.map((q) => Object.assign(q, { d: Math.hypot(q[0] - head[0], q[1] - head[1]) })).sort((a, b) => b.d - a.d);
      const tip = far.slice(0, Math.max(3, Math.round(far.length * 0.5)));
      const p = [tip.reduce((s, q) => s + q[0], 0) / tip.length, tip.reduce((s, q) => s + q[1], 0) / tip.length];
      // spread the spark seats over the beads (farthest-point sampling from the pendant)
      // (the lower part of the loop only: its top runs up past his ears, where his eye whites sit)
      let by0 = Infinity; for (const q of best.beads) if (q[1] < by0) by0 = q[1];
      const pts = best.beads.filter((q) => q[1] >= by0 + (p[1] - by0) * 0.35), b = [];
      const d = pts.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1]));
      for (let k = 0; k < 14 && pts.length; k++) {
        let bi = 0; for (let i = 1; i < pts.length; i++) if (d[i] > d[bi]) bi = i;
        if (d[bi] < 3) break;
        b.push(pts[bi]);
        for (let i = 0; i < pts.length; i++) d[i] = Math.min(d[i], Math.hypot(pts[i][0] - pts[bi][0], pts[i][1] - pts[bi][1]));
      }
      frames.push({ p: p.map((v) => +v.toFixed(1)), r: +(inkH * 0.022).toFixed(1), b });
      hit++;
    }
    fs.writeFileSync(path.join(OUT, f.replace(/\.png$/, '.json')), JSON.stringify({ workW, workH: WORK_H, cols, rows, frames }));
    summary.push(`${f}: ${hit}/${frames.length}`);
  }
  console.log(summary.join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
