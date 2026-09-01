/* RATEL RAGE — the post-mission sequence.
 *
 *   MC OLODO DEFEATED -> MISSION COMPLETE -> [X] -> EVIDENCE ANALYSIS
 *   -> NARRATION -> EVIDENCE BOARD -> NEXT TARGET -> [X] -> THE CABAL
 *   -> LEVEL SELECT
 *
 * ============================== WHAT THIS IS =================================
 *
 * ONE STATE MACHINE, not nine screens. Every beat is a state in `STATES`, every
 * transition is a call to `go()`, and nothing draws that the machine is not
 * currently in. That is the difference between a sequence that can be extended
 * for Level 02 and a pile of flags that can only ever be Level 01.
 *
 * It draws with the front end's REAL widgets, borrowed through `ui` exactly the
 * way the pause menu and the mission card already borrow them — same ctx, same
 * palette, same glass, same navigation cues. There is one look in this game and
 * this file does not invent a second one.
 *
 * It owns no copy. Every word comes from `story.js`, and every NAME comes from
 * `resolveIdentity()` — which cannot hand back a development tag. See the
 * fiction firewall at the top of that file.
 *
 * ============================= WHAT IT DOES NOT DO ===========================
 *
 * It does not touch combat, movement, the enemy AI, the boss, the sprite router
 * or the camera. It starts when the fight is already over.
 */

import { resolveIdentity, assertPlayerSafe, LEVELS, AFTERMATH, CASES, caseFor, caseIsOpen } from './story.js';

/* The machine. Written out in order because the order IS the design — reading
 * this list top to bottom is reading the player's experience.
 *
 * The spec's two WAIT_FOR_X gates are named apart (WAIT_FOR_X / WAIT_FOR_TARGET_X)
 * so a log line, a test and a bug report can all say WHICH gate they mean. */
export const STATES = [
  'MISSION_COMPLETE',      // the card the fight ends on. Owned by game.js's drawOutro.
  'WAIT_FOR_X',            // …and its prompt. Nothing else happens until X.
  'EVIDENCE_ANALYSIS',     // analysisBG comes up; the board is empty
  'NARRATION_PLAYING',     // the read runs; evidence lands on its cues
  'EVIDENCE_REVEAL',       // all three items are on the board and connected
  'NEXT_TARGET_REVEAL',    // scan -> glitch -> silhouette -> portrait -> name
  'WAIT_FOR_TARGET_X',     // the spec's second WAIT_FOR_X
  'CABAL_NETWORK_REVEAL',  // how much higher this goes, and how little we know
  'LEVEL_SELECT',          // play 02, or run 01 again
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (v) => 1 - Math.pow(1 - clamp(v, 0, 1), 3);
const easeIO = (v) => { const u = clamp(v, 0, 1); return u * u * (3 - 2 * u); };

/* Deterministic hash noise, for the glitch. Math.random would re-roll on every
 * redraw, so a paused frame would seethe and a screenshot test could never
 * assert anything about the same frame twice. */
function hash01(a, b) {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ======================================================== TypewriterText ===
 * Wrap once, reveal by character count. The wrap is cached against the text and
 * the width because re-measuring every glyph of a paragraph every frame, for
 * sixty frames a second, to draw the same lines, is the sort of thing that only
 * shows up as a frame-time graph nobody can explain.
 */
function makeTypewriter() {
  let cacheKey = '', lines = [];
  return {
    /* Returns {lines, total} — `total` counts the newlines too, so a reveal
     * fraction spends real time on a line break instead of skipping it. */
    layout(ctx, text, maxW) {
      const key = `${text}@${Math.round(maxW)}@${ctx.font}`;
      if (key === cacheKey) return { lines, total: lines.join('\n').length };
      const words = String(text).split(/\s+/).filter(Boolean);
      const out = [];
      let line = '';
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (line && ctx.measureText(next).width > maxW) { out.push(line); line = w; }
        else line = next;
      }
      if (line) out.push(line);
      cacheKey = key; lines = out;
      return { lines, total: out.join('\n').length };
    },
    /* Draw `reveal` (0..1) of it. Returns the cursor position of the last drawn
     * character so a caret can sit on it. */
    draw(ctx, text, x, y, maxW, lineH, reveal) {
      const { lines: ls, total } = this.layout(ctx, text, maxW);
      const shown = Math.round(clamp(reveal, 0, 1) * total);
      let used = 0, endX = x, endY = y;
      for (let i = 0; i < ls.length; i++) {
        if (used >= shown) break;
        const room = shown - used;
        const part = ls[i].slice(0, room);
        const ly = y + i * lineH;
        ctx.fillText(part, x, ly);
        endX = x + ctx.measureText(part).width;
        endY = ly;
        used += ls[i].length + 1;                 // +1 for the break
      }
      return { x: endX, y: endY, done: shown >= total, lines: ls.length };
    },
  };
}

/* ========================================== EvidenceNarrationController =====
 * Voice playback and the clock everything else animates against.
 *
 * The clock is the VOICE's own currentTime when there is a recording playing,
 * and a dt accumulator when there is not. That fallback is not a nicety: no
 * aftermath read has been recorded yet, autoplay can refuse a clip outright,
 * and a player whose browser blocked the audio must still get the whole
 * sequence rather than a board that never builds. Same contract as the case
 * file's briefing read.
 *
 * It never locks the player in. `skip()` runs the clock to the end of the beat.
 */
function makeNarration() {
  let audio = null, playing = false, t = 0, dur = 1, script = null, src = null;
  return {
    load(cue) {
      script = cue;
      dur = cue.fallbackDur ?? 10;
      if (!cue.voice) { audio = null; src = null; return; }
      if (src !== cue.voice) {
        src = cue.voice;
        try {
          audio = new Audio(new URL(cue.voice, import.meta.url));
          audio.preload = 'auto';
          audio.addEventListener('loadedmetadata', () => {
            if (Number.isFinite(audio.duration) && audio.duration > 0) dur = audio.duration;
          });
        } catch { audio = null; }
      }
    },
    start(volume = 1) {
      t = 0;
      playing = false;
      if (!audio) return;
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = clamp(volume, 0, 1);
        const p = audio.play();
        playing = true;
        /* A refused play() is not a broken screen — the clock falls back and the
         * board still builds. */
        if (p?.catch) p.catch(() => { playing = false; });
      } catch { playing = false; }
    },
    setVolume(v) { if (audio) audio.volume = clamp(v, 0, 1); },
    stop() {
      playing = false;
      if (!audio) return;
      try { audio.pause(); audio.currentTime = 0; } catch {}
    },
    update(dt) {
      if (playing && audio && !audio.paused && audio.currentTime > 0) t = audio.currentTime;
      else t += dt;
    },
    skip() { t = dur; this.stop(); },
    replay(volume = 1) { this.start(volume); },
    get t() { return t; },
    get duration() { return dur; },
    get done() { return t >= dur; },
    get usingVoice() { return playing; },
    /* How far through its own cue a block has been typed, 0..1. Absolute times,
     * so a late cue cannot push the next one. */
    reveal(i) {
      const cue = script?.script?.[i];
      if (!cue) return 1;
      return clamp((t - cue[0]) / Math.max(0.001, cue[1] - cue[0]), 0, 1);
    },
    /* The read as ONE typewriter fraction: the sentence cues drive it, so the
     * text keeps pace with the voice through every pause in the delivery. */
    revealAll() {
      const cues = script?.script;
      if (!cues || !cues.length) return clamp(t / dur, 0, 1);
      const per = 1 / cues.length;
      let out = 0;
      for (let i = 0; i < cues.length; i++) out += per * this.reveal(i);
      return clamp(out, 0, 1);
    },
  };
}

/* ============================================================ TraceAudio ===
 * The sound of the board drawing itself.
 *
 * ---------------------------------- WHY IT IS A SCHEDULER, NOT A playSfx() ---
 *
 * Every visual on these two screens is a slice of ONE clock — the narration's
 * currentTime on the evidence board, `cabalT` on the Cabal chain. Nothing here
 * is triggered by an event; a line is drawn because the clock has passed the
 * number the line's `draw` field holds. So the audio cannot be triggered by
 * events either. It is the same clock, read the same way, and the event list it
 * runs is BUILT FROM THE SAME CONSTANTS the draw code uses (see TRACE / CHAIN
 * below) so a retimed line and its sound cannot drift apart.
 *
 * ---------------------------------------------- WHY A CLOCK JUMP IS SWALLOWED
 *
 * That clock does not only advance by dt. `skip()` throws it to the end of the
 * read, `replay()` throws it back to zero, and the test harness pins it wherever
 * it likes. Fire naively and a single press on X plays twenty-two cues inside
 * one frame — which is not a montage, it is a crash noise, and it is the exact
 * bug that makes people mute a game. So a jump marks everything it passed as
 * already fired WITHOUT playing it. The player who skipped hears the screen he
 * skipped TO, not the four seconds he skipped over.
 *
 * ------------------------------------------------------ WHY `dur` EXISTS AT ALL
 *
 * A line takes 0.5-0.62 s to draw, and the Cabal chain covers that with a BED:
 * `traceDraw` started with an explicit duration and stopped when the rung lands.
 * The handle comes back so a skip can take every live bed down with it rather
 * than leaving four hums ringing over the level-select screen.
 *
 * The evidence board's lines deliberately do NOT sustain — they start on the
 * circle's own blip and let the rest of the draw pass in silence (see
 * `evidenceCues`) — but they still pass `dur`, because `dur` is what puts a cue
 * in `beds` and therefore in reach of `hush()`. Anything a skip could catch
 * mid-sound belongs on that list, sustained or not.
 */
const CLOCK_JUMP = 0.5;      // a gap wider than this is a seek, not a slow frame

function makeTraceAudio() {
  const fired = new Set();
  const heard = [];               // …and the subset that was actually SOUNDED
  let beds = [];
  let prev = null;

  return {
    /* A new screen, a replay, or the whole sequence restarting. */
    reset() { fired.clear(); heard.length = 0; this.hush(0.05); prev = null; },
    hush(fade = 0.07) { for (const b of beds) b.stop(fade); beds = []; },

    /* Fire everything the clock has passed since the last call.
     *
     *   events: [{ id, at, cue, dur?, rate?, gain? }]
     *
     * `id` is what makes a cue fire once. It is not the index — two events can
     * share an `at` (the Cabal's final rung layers two cues) and an event's `at`
     * moves whenever the script is retimed, so neither is a stable key. */
    run(ui, clock, events) {
      if (!ui?.playCue) { prev = clock; return; }
      /* The FIRST call after a reset is not a jump as long as the clock is still
       * near zero — that is a screen opening, and a cue scheduled at 0.00 has to
       * be allowed to sound. It IS a jump if the first call arrives already deep
       * into the clock, which is a pinned test frame or a resumed seek. */
      const jumped = prev === null
        ? clock > CLOCK_JUMP
        : (clock < prev - 0.001 || clock > prev + CLOCK_JUMP);
      if (jumped && prev !== null) this.hush(0.05);
      prev = clock;
      for (const e of events) {
        if (fired.has(e.id) || e.at > clock) continue;
        fired.add(e.id);
        if (jumped) continue;                  // swallowed: seen, never heard
        heard.push(e.id);
        const h = ui.playCue(e.cue, { dur: e.dur, rate: e.rate, gain: e.gain });
        /* Only a bed is worth holding: a one-shot is over before anything could
         * want to stop it, and keeping its handle would grow this array for the
         * whole screen. */
        if (e.dur && h) beds.push(h);
      }
      /* Beds are short and bounded (at most a couple alive at once), but a
       * screen the player sits on holds the array forever otherwise. */
      if (beds.length > 8) beds = beds.slice(-8);
    },

    /* Test surface. `fired` is every cue the clock has passed; `heard` is the
     * subset that actually made a sound. The gap between the two lists IS the
     * skip behaviour, and it is the only way to prove from outside that one
     * press on X did not fire twenty-two cues into a single frame. A screenshot
     * cannot see audio. */
    get fired() { return Array.from(fired); },
    get heard() { return heard.slice(); },
    get liveBeds() { return beds.length; },
  };
}

/* ============================================================== the module ==
 * `ui` is a getter, not a value: game.js builds this before the front end
 * exists, and holding a stale null would leave the whole sequence unable to
 * draw. Same reason `frontEnd?.ui` is re-read everywhere else in that file.
 */
export function createAftermath({ ctx, W, H, getUi, onChooseLevel, getVolume }) {
  const type = { narration: makeTypewriter(), cabal: makeTypewriter(), detail: makeTypewriter() };
  const narration = makeNarration();
  const traceAudio = makeTraceAudio();

  let state = 'MISSION_COMPLETE';
  let stateT = 0;                 // seconds in the current state
  let active = false;
  let levelId = 1;
  let stats = null;
  let bgFade = 0;                 // analysisBG cross-fade, 0..1
  let select = 1;                 // LEVEL_SELECT: 0 = replay 01, 1 = play 02
  let revealT = 0;                // NEXT_TARGET_REVEAL's own clock
  let cabalT = 0;

  /* WHOSE FILE THE BOARD IS SHOWING.
   *
   * The evidence screen used to read the module constant `AFTERMATH` directly
   * at a dozen call sites, which was correct while exactly one file existed and
   * would have quietly become a lie the moment a second one did: `enterCase`
   * would have set the level and the heading and then drawn Level 01's board
   * under them. So the board reads `file()`, the case index owns which one that
   * is, and the Cabal's own screen stays on AFTERMATH.cabal — the network is
   * one network, not one per case. */
  let caseId = CASES[0].id;
  const file = () => caseFor(caseId)?.file ?? AFTERMATH;
  let chosen = null;              // set once, so a double press cannot start two levels

  /* ------------------------------------------------- THE LEFT PANEL PAGER ---
   *
   * The panel used to be a passive readout: it showed whichever evidence item
   * had landed most recently, and swapped out from under the player when the
   * next one landed. Three items, ten seconds, no way back — the read is
   * finished with a brief before anyone has finished reading it.
   *
   * So the panel is a PAGER now, stepped with L1 and R1. Its pages are the
   * evidence items that have actually landed, in board order, plus the next
   * target's plate once his name is on screen. Two rules keep it honest:
   *
   *   NOTHING IS PAGED TO BEFORE IT EXISTS. An item that has not landed is not
   *   a page, so L1/R1 cannot be used to read ahead of the narration.
   *
   *   THE REVEAL STILL LANDS. `page` is dropped back to auto the moment the
   *   target becomes a page — a player who was reading evidence 01 when the
   *   climax fired must be shown the climax, not left on page one of a file
   *   while the thing the whole sequence builds to happens off-panel.
   *
   * `page` null means "follow the read" (the old behaviour, and the default on
   * every screen). Any press pins it. */
  let page = null;
  let pageFade = 1;               // 0..1 cross-fade after a MANUAL page change
  let hadTarget = false;          // edge-detect for the rule above
  /* The states that draw the left column. LEVEL_SELECT and the two card states
   * have no panel, and CABAL_NETWORK_REVEAL's is a single fixed assessment —
   * a shoulder press on any of them is not an input, it is a no-op that would
   * otherwise consume the press and eat its nav cue. */
  const PAGED_STATES = new Set(['EVIDENCE_ANALYSIS', 'NARRATION_PLAYING',
    'EVIDENCE_REVEAL', 'NEXT_TARGET_REVEAL', 'WAIT_FOR_TARGET_X']);

  /* ------------------------------------------------ THE CABAL CHAIN'S CURSOR
   * The same three-value shape the pager uses, and for the same reasons:
   * `chainPinned` false means the player has not touched the network, so the
   * screen is still the one the story ends on. */
  let chainSel = 0;
  let chainPinned = false;
  let chainFade = 1;
  /* Set when a boss's file was opened FROM the network. It changes exactly one
   * thing — what Circle means on the file, and therefore what the hint bar
   * promises — because a player who walked in from the Cabal wants to walk back
   * to it, and one who arrived by finishing the mission wants the read again. */
  let fromCabal = false;

  /* analysisBG. Loaded from the served tree the same way every other screen
   * asset is (`new URL(..., import.meta.url)`), and drawn cover-fit. If it is
   * not in yet the sequence still runs over the frosted arena — a missing
   * background must not be a black screen. */
  let bgImg = null, bgState = 'idle';
  function loadBackground() {
    if (bgState !== 'idle') return;
    bgState = 'loading';
    const img = new Image();
    img.onload = () => { bgImg = img; bgState = 'ready'; };
    img.onerror = () => { bgState = 'failed'; console.warn('[aftermath] analysis-bg.png did not load'); };
    img.src = new URL('../frontend/ui/analysis-bg.png', import.meta.url);
  }

  /* Portraits are optional per character. Olodo has a dossier photograph;
   * Masood Jibril has no art yet, so his node resolves to a SILHOUETTE — which
   * is the right read for him anyway at this point in the story. Drop a file in
   * PORTRAITS and the reveal picks it up with no other change. */
  const PORTRAITS = { olodo: '../frontend/olodo-dossier.jpg' };
  const portraits = {};
  function portrait(key) {
    if (!key || !PORTRAITS[key]) return null;
    if (portraits[key] !== undefined) return portraits[key];
    portraits[key] = null;
    const img = new Image();
    img.onload = () => { portraits[key] = img; };
    img.onerror = () => { portraits[key] = null; };
    img.src = new URL(PORTRAITS[key], import.meta.url);
    return null;
  }

  /* ------------------------------------------------------------- the board */
  /* Laid out as data so the connections and the nodes cannot disagree about
   * where anything is. §10's diagram, in coordinates. */
  /* The vertical spread is bounded by the READ, not by taste: the narration
   * strip starts at y 556, and a node's caption sits r+39 below its centre. The
   * bottom row at 472 puts its last caption on 544 — twelve pixels of air. Move
   * either number and check that sum, or evidence 03's status disappears behind
   * the strip exactly the way it did the first time. */
  const BOARD = {
    source: { x: 516, y: 340, r: 46 },
    items: [
      { x: 838, y: 208, r: 33 },
      { x: 838, y: 340, r: 33 },
      { x: 838, y: 472, r: 33 },
    ],
    target: { x: 1148, y: 340, r: 50 },
  };

  /* HOW LONG EACH THING TAKES. Named because they are now read TWICE — once by
   * the draw code to work out how much of a line to stroke, and once by the cue
   * schedule to work out how long its bed must last. Left as two copies of
   * `0.62` these would have drifted the first time anyone retimed the board, and
   * a bed that outlives its line is the most obvious kind of wrong there is. */
  const TRACE = {
    line: 0.62,        // src -> evidence, and evidence -> target
    outLag: 0.50,      // how late the outbound line starts behind the inbound
    node: 0.50,        // an evidence circle's own landing animation
    srcAt: 0.10,       // when MC Olodo's circle lands
  };

  /* The Cabal chain's clock, same deal. `step` is both the gap between rungs and
   * the length of a rung's landing. */
  const CHAIN = { step: 0.55, lineLag: 0.50, line: 0.50 };

  /* --------------------------------------------------- the cue schedules ---
   * Built from the tables above, so retiming a line retimes its sound. Both
   * lists are rebuilt every update: they are a dozen object literals and the
   * alternative is a cache that has to be invalidated when the script changes.
   *
   * THE SOUND DESIGN, IN ONE PARAGRAPH. A known connection is drawn at unity and
   * lands on a hard data blip — a fact, filed. An unknown one is drawn from the
   * SAME file detuned down, and lands on a swell that falls away without
   * resolving. Same two files; the pitch and the tail carry the meaning. That is
   * why there is no fifth recording for "uncertain".
   *
   * ------------------------------------------- THE LINES USE THE CIRCLE'S CUE
   *
   * The board's connections used to be drawn over `traceDraw`, the sustained
   * bed. Under a narration read that is a hum: the circles POPPED and the lines
   * between them did not, so the board sounded like four events with three
   * silences between them rather than a hand working across it. They now start
   * on `traceNode` — the exact cue an evidence circle lands on — so a line being
   * traced and a circle being drawn are the same gesture in the ear as well as
   * on screen. (The Cabal chain still uses the bed; see `cabalCues`.)
   *
   * `dur` STAYS even though the cue is a 0.30 s one-shot rather than a 0.62 s
   * bed. It is not there to stretch the sample — nothing loops it, so the blip
   * simply sounds and the rest of the line draws in silence, which is the point.
   * It is there because `dur` is what registers the handle with `traceAudio`'s
   * bed list, and that list is what `hush()` empties: a line cue fired on the
   * frame the player presses X would otherwise ring on over the next screen. */
  const evidenceCues = () => {
    const out = [{ id: 'src', at: TRACE.srcAt, cue: 'traceNode', gain: 1.15 }];
    file().evidence.forEach((ev, i) => {
      const inLand = ev.draw + TRACE.line;
      const outAt = ev.draw + TRACE.outLag;
      out.push(
        // the circle itself
        { id: `node${i}`, at: ev.at, cue: 'traceNode' },
        // MC Olodo -> this item. Established, gold, solid line.
        { id: `in${i}`, at: ev.draw, cue: 'traceNode', dur: TRACE.line },
        { id: `inLand${i}`, at: inLand, cue: 'traceLand' },
        /* This item -> the unknown target. Dashed and red on screen, so detuned
         * and unresolved in the ear. */
        { id: `out${i}`, at: outAt, cue: 'traceNode', dur: TRACE.line, rate: 0.74, gain: 0.85 },
        { id: `outLand${i}`, at: outAt + TRACE.line, cue: 'traceUnknown', gain: 0.72 },
      );
    });
    return out;
  };

  const cabalCues = () => {
    const chain = AFTERMATH.cabal.chain;
    const out = [];
    chain.forEach((node, i) => {
      /* When the rung STARTS landing — the disc pops in on that frame and the
       * ring sweeps round after it, so this is the moment the player sees, not
       * `(i + 1) * step` when the ring closes. */
      const at = i * CHAIN.step;
      if (node.tone === 'alert') {
        /* THE CABAL. The one rung that gets two cues at once: the blip says a
         * node landed, the swell says nothing was learned. The whole screen is
         * built to end on that contradiction. */
        out.push(
          { id: `cnode${i}`, at, cue: 'traceLand', gain: 1.0 },
          { id: `cnodeVoid${i}`, at, cue: 'traceUnknown', rate: 0.82, gain: 0.9 },
        );
      } else if (node.unknown) {
        out.push({ id: `cnode${i}`, at, cue: 'traceNode', rate: 0.78, gain: 0.8 });
      } else {
        out.push({ id: `cnode${i}`, at, cue: 'traceNode' });
      }
    });
    /* The rungs. `known` matches drawCabalScreen exactly — only the first link
     * in the chain is established; everything above it is inference.
     *
     * THESE KEEP THE BED, where the evidence board's lines took the circle cue.
     * Not an oversight: a rung starts at `lineLag + i*step` (0.50, 1.05, …) and
     * the node above it lands at `(i+1)*step` (0.55, 1.10, …) — fifty
     * milliseconds later, EVERY rung. Two hits of the same sample that close
     * fuse into a flam rather than two events, so the chain would tick-tick its
     * way up the screen. The bed's soft attack is what lets the rung and the
     * node it arrives at read as one landing. The evidence board has no such
     * collision: its nodes are 0.60 s clear of the lines they feed. */
    for (let i = 0; i < chain.length - 1; i++) {
      const at = CHAIN.lineLag + i * CHAIN.step;
      const known = i === 0;
      out.push(
        { id: `cline${i}`, at, cue: 'traceDraw', dur: CHAIN.line,
          rate: known ? 1 : 0.72, gain: known ? 1 : 0.9 },
        known
          ? { id: `clineLand${i}`, at: at + CHAIN.line, cue: 'traceLand' }
          : { id: `clineLand${i}`, at: at + CHAIN.line, cue: 'traceUnknown', gain: 0.7 },
      );
    }
    return out;
  };

  /* ========================================================= EvidenceConnection
   * TRIM PATH. The line is not faded in and it is not revealed by a clip — it is
   * STROKED to a fraction of its own arc length, so it physically grows from one
   * node toward the next the way a hand draws it.
   *
   * Routed as an elbow rather than a straight diagonal: an investigation board
   * is pinned string and right angles, and three straight diagonals converging
   * on one circle read as a spider, not a case. */
  function elbow(a, b, bend = 0.5) {
    const ax = a.x + a.r + 4, bx = b.x - b.r - 4;
    const mid = ax + (bx - ax) * bend;
    if (Math.abs(a.y - b.y) < 1) return [{ x: ax, y: a.y }, { x: bx, y: b.y }];
    return [{ x: ax, y: a.y }, { x: mid, y: a.y }, { x: mid, y: b.y }, { x: bx, y: b.y }];
  }

  function trimPath(pts, u, { color, width = 1.6, dash = null, glow = false }) {
    const f = clamp(u, 0, 1);
    if (f <= 0) return;
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      segs.push(d); total += d;
    }
    if (total <= 0) return;
    let want = total * f;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash);
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 9; }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    let head = pts[0];
    for (let i = 0; i < segs.length && want > 0.01; i++) {
      const d = segs[i];
      const k = Math.min(1, want / d);
      const p = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k };
      ctx.lineTo(p.x, p.y);
      head = p;
      want -= d;
    }
    ctx.stroke();
    ctx.restore();

    /* The drawing head. A bright point at the tip is what sells "being drawn"
     * over "already drawn and fading in" — it is gone the moment it lands. */
    if (f < 1) {
      ctx.save();
      ctx.globalAlpha *= 0.9;
      ctx.fillStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(head.x, head.y, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  /* ================================================================ EvidenceNode
   * A circle with a ring, a state colour and a label. `u` is its own landing
   * animation (scale + ring sweep), NOT the board's progress. */
  function drawNode(ui, n, u, opt = {}) {
    const C = ui.C;
    const e = ease(u);
    if (e <= 0) return;
    const tone = opt.tone === 'green' ? C.green
      : opt.tone === 'red' ? C.red
      : opt.tone === 'alert' ? C.red
      : opt.tone === 'dim' ? C.dim : C.gold;

    ctx.save();
    ctx.globalAlpha *= Math.min(1, u * 1.6);
    ctx.translate(n.x, n.y);
    ctx.scale(0.72 + 0.28 * e, 0.72 + 0.28 * e);

    // the disc
    ctx.beginPath(); ctx.arc(0, 0, n.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6,9,15,0.88)';
    ctx.fill();

    // the art: portrait, silhouette, or a glyph
    if (opt.img) {
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, n.r - 3, 0, Math.PI * 2); ctx.clip();
      const s = Math.max((n.r * 2) / opt.img.width, (n.r * 2) / opt.img.height) * 1.12;
      ctx.globalAlpha *= opt.imgAlpha ?? 1;
      ctx.drawImage(opt.img, -opt.img.width * s / 2, -opt.img.height * s / 2 - n.r * 0.16,
        opt.img.width * s, opt.img.height * s);
      ctx.restore();
    } else if (opt.silhouette) {
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, n.r - 3, 0, Math.PI * 2); ctx.clip();
      ctx.globalAlpha *= opt.silhouette;
      ctx.fillStyle = 'rgba(140,164,196,0.30)';
      ctx.beginPath();                                   // head
      ctx.arc(0, -n.r * 0.20, n.r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();                                   // shoulders
      ctx.ellipse(0, n.r * 0.72, n.r * 0.74, n.r * 0.52, 0, Math.PI, 0);
      ctx.fill();
      ctx.restore();
    } else if (opt.glyph) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ui.setDisplay(700, n.r * 0.95, 0);
      ctx.fillStyle = opt.glyphColor || C.dim;
      ctx.fillText(opt.glyph, 0, 1);
      ctx.textBaseline = 'alphabetic';
    } else if (opt.icon) {
      ui.icon(opt.icon, 0, 0, n.r * 0.86, tone, 0.9, 1.6);
    }

    // the ring, swept round as it lands
    ctx.beginPath();
    ctx.arc(0, 0, n.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e);
    ctx.strokeStyle = tone;
    ctx.lineWidth = opt.heavy ? 2.6 : 1.8;
    if (opt.pulse) { ctx.shadowColor = tone; ctx.shadowBlur = 12 + 8 * Math.sin(ui.clock * 3.4); }
    ctx.stroke();
    ctx.restore();

    // labels sit OUTSIDE the scale, or they would swim as the node lands
    if (opt.top || opt.bottom) {
      ctx.save();
      ctx.globalAlpha *= e;
      ctx.textAlign = 'center';
      if (opt.top) {
        ui.setFont(700, opt.labelSize ?? 10.5, 1.9);
        ctx.fillStyle = opt.tone === 'dim' ? C.muted : C.paper;
        ctx.fillText(assertPlayerSafe(opt.top, 'node.top'), n.x, n.y + n.r + 24);
      }
      if (opt.bottom) {
        ui.setFont(700, 8.6, 1.7);
        ctx.fillStyle = tone;
        ctx.fillText(assertPlayerSafe(opt.bottom, 'node.bottom'), n.x, n.y + n.r + 39);
      }
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------ atmosphere */
  function drawAnalysisBackground(ui) {
    const k = easeIO(bgFade);
    ctx.clearRect(0, 0, W, H);
    if (bgImg && k > 0) {
      ctx.save();
      ctx.globalAlpha = k;
      const s = Math.max(W / bgImg.width, H / bgImg.height);
      const dw = bgImg.width * s, dh = bgImg.height * s;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.restore();
    }
    /* Graded down hard. This is a room being used as a war room at night, and
     * the copy has to be the brightest thing in the frame. */
    ctx.fillStyle = `rgba(4,6,11,${(0.52 + 0.30 * k).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    const cool = ctx.createLinearGradient(0, 0, 0, H);
    cool.addColorStop(0, 'rgba(12,20,44,0.42)');
    cool.addColorStop(0.6, 'rgba(6,9,17,0.18)');
    cool.addColorStop(1, 'rgba(3,5,9,0.55)');
    ctx.fillStyle = cool;
    ctx.fillRect(0, 0, W, H);
    scanlines(0.055);
    ui.drawVignette();
    /* Snapshot AFTER the grade and BEFORE any panel: the frosted glass then
     * samples the room the evidence is actually being read in, which is the
     * whole reason these panels are glass and not paint. */
    ui.captureBackdrop();
  }

  function scanlines(alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#9fd6ff';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.restore();
  }

  /* A controlled data break: a few horizontal slices shifted sideways, RGB
   * split on the edges. Deterministic per (frame, slice) so the same frame is
   * always the same glitch. */
  function glitchRegion(x, y, w, h, amount, seed) {
    if (amount <= 0.001) return;
    const slices = 7;
    ctx.save();
    for (let i = 0; i < slices; i++) {
      const r = hash01(seed, i);
      if (r > 0.55 + 0.35 * (1 - amount)) continue;
      const sy = y + (h / slices) * i;
      const off = (hash01(seed + 11, i) - 0.5) * 46 * amount;
      ctx.globalAlpha = 0.18 + 0.5 * amount * hash01(seed + 3, i);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(224,67,44,0.55)'
        : i % 3 === 1 ? 'rgba(96,196,255,0.45)' : 'rgba(233,182,84,0.40)';
      ctx.fillRect(x + off, sy, w, h / slices * 0.62);
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------ the header */
  function header(ui, eyebrow, title, sub, u) {
    const C = ui.C;
    const e = ease(u);
    ctx.save();
    ctx.globalAlpha *= e;
    ctx.translate((1 - e) * -22, 0);
    ctx.textAlign = 'left';
    ui.setFont(700, 11, 4);
    ctx.fillStyle = C.gold;
    ctx.fillText(assertPlayerSafe(eyebrow, 'header.eyebrow'), 58, 76);
    ui.setDisplay(700, 38, 1.7);
    ctx.fillStyle = C.paper;
    ctx.fillText(assertPlayerSafe(title, 'header.title'), 56, 119);
    ctx.fillStyle = C.orange;
    ctx.fillRect(58, 133, 78, 3);
    if (sub) {
      ui.setFont(500, 12.5, 0.2);
      ctx.fillStyle = C.muted;
      ctx.fillText(assertPlayerSafe(sub, 'header.sub'), 58, 156);
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------- the pages ---
   * In board order, and only what has landed. See the pager note above. */
  const PANEL_BOX = { x: 56, y: 186, w: 372, h: 344 };

  function panelPages() {
    const pages = [];
    file().evidence.forEach((ev, i) => {
      if (narration.t >= ev.at) pages.push({ kind: 'evidence', i, ev });
    });
    if (revealT > 0 && revealBeats().name > 0) {
      pages.push({ kind: 'target', i: -1 });
      /* THE BOSSES COME AFTER THE STORY, not alongside it.
       *
       * A case page per boss — who he is, whether his file is open, and the
       * mission he came from — appended once the reveal has landed. They are
       * held back until then for the same reason an unlanded evidence item is
       * not a page: during the read the panel is following a narration, and a
       * player stepping through it should not fall out of the story into a
       * directory. After the reveal the sequence has said what it came to say
       * and browsing IS the point of the screen. */
      for (const c of CASES) pages.push({ kind: 'case', i: -1, c });
    }
    return pages;
  }

  /* The page actually on screen.
   *
   * AUTO IS THE LAST *STORY* PAGE, not the last page. Evidence lands in order
   * and the target lands after all three, so following the read means walking
   * to the end of that run — but the boss pages sit BEHIND the target in the
   * list, and taking the end of the whole list would hand the climax to a
   * directory entry. The reveal has to land on the man it revealed.
   *
   * The case pages are therefore reachable only by pressing something, which is
   * also the right default: they are a place the player goes, not a place the
   * sequence takes him. */
  function activePage() {
    const pages = panelPages();
    if (!pages.length) return { pages, idx: -1, cur: null };
    let idx;
    if (page === null) {
      idx = 0;
      for (let i = 0; i < pages.length; i++) if (pages[i].kind !== 'case') idx = i;
    } else {
      idx = clamp(page, 0, pages.length - 1);
    }
    return { pages, idx, cur: pages[idx] };
  }

  /* The whole left column's entrance, shared by the panel and the read strip so
   * the two cannot arrive on different frames. */
  const panelEntry = () => ease(clamp((stateT - 0.25) / 0.5, 0, 1));

  /* One evidence item's brief. `a` is the content's own alpha — the auto swap
   * between items, or the manual page cross-fade — on top of the panel's. */
  function drawEvidencePanel(ui, item, a = 1) {
    const C = ui.C;
    const panel = PANEL_BOX;
    ctx.save();
    ctx.globalAlpha *= panelEntry();
    ui.glass(panel.x, panel.y, panel.w, panel.h, 10,
      { tint: 'rgba(9,13,20,0.80)', border: 'rgba(233,182,84,0.24)' });
    ctx.textAlign = 'left';
    ui.setFont(700, 10.5, 2.8);
    ctx.fillStyle = C.gold;
    ctx.fillText('RECOVERED EVIDENCE', panel.x + 26, panel.y + 33);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(panel.x + 24, panel.y + 49, panel.w - 48, 1);

    if (item) {
      /* Fades between items rather than cutting: three hard swaps under a
       * continuous read looks like the panel is glitching, not updating. */
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.translate(0, (1 - a) * 8);
      ui.setFont(700, 9, 2.2);
      ctx.fillStyle = C.orange;
      ctx.fillText(item.no, panel.x + 26, panel.y + 82);
      ui.setDisplay(700, 17, 0.7);
      ctx.fillStyle = C.paper;
      ctx.fillText(item.title, panel.x + 26, panel.y + 108);

      const rows = [['SOURCE', item.source], ['STATUS', item.status]];
      /* 42, not 46. The four pixels a row gives up here are what the wrapped
       * body below needs to fit its fourth line above the pager rule — see the
       * arithmetic there. */
      let y = panel.y + 142;
      for (const [label, value] of rows) {
        ui.setFont(700, 8.6, 1.8);
        ctx.fillStyle = C.muted;
        ctx.fillText(label, panel.x + 26, y);
        ui.setFont(650, 11, 0.4);
        ctx.fillStyle = label === 'STATUS' ? C.gold : C.text;
        ctx.fillText(assertPlayerSafe(value, 'evidence.row'), panel.x + 26, y + 18);
        y += 42;
      }
      ctx.fillStyle = 'rgba(255,255,255,0.055)';
      ctx.fillRect(panel.x + 26, y - 14, panel.w - 52, 1);

      /* THE BODY IS WRAPPED TO THE PANEL, not to the line breaks it was written
       * with. `story.js` stores each brief as three hand-broken lines, and they
       * were broken against a wider column than this panel is — "Timelines,
       * statements and case movements do not fully match." is 24 px longer than
       * the box, so it printed straight out through the right edge and over the
       * board behind it. Hand-broken copy cannot survive a font change, a
       * letter-spacing change or a panel resize, and it had already failed one.
       *
       * Joined with a space first: the stored breaks are mid-sentence, so the
       * array is a paragraph that happens to be stored in pieces, and re-flowing
       * it is the correct reading of it.
       *
       * THE HEIGHT IS BOUNDED. Baselines run from `y + 12` at 17 px; the pager
       * rule sits at `panel.y + panel.h - 44` (504 - 18 = 486). With the rows
       * tightened to 42 the body starts at 424, so four lines end at 475 — 11 px
       * of air. A fifth would collide, which is what the layout check in
       * pagerverify.js is measuring. */
      ui.setFont(500, 11.5, 0.15);
      ctx.fillStyle = C.text;
      let by = y + 12;
      for (const line of ui.wrapLines(item.body.join(' '), panel.w - 52)) {
        ctx.fillText(line, panel.x + 26, by);
        by += 17;
      }
      ctx.restore();
    } else {
      ui.setFont(500, 12, 0.2);
      ctx.fillStyle = C.dim;
      ctx.fillText('Cataloguing…', panel.x + 26, panel.y + 86);
    }
    ctx.restore();
  }

  /* A portrait in a disc, at panel scale. The board's nodes already draw one;
   * this is the same read (cover-fit, clipped to a circle, faceless figure when
   * there is no art) at the size a panel wants, without dragging a node's ring
   * sweep and captions along with it. */
  function panelPortrait(ui, cx, cy, r, key) {
    const img = portrait(key);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6,9,15,0.9)';
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (img) {
      const s = Math.max((r * 2) / img.width, (r * 2) / img.height) * 1.12;
      ctx.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2 - r * 0.16,
        img.width * s, img.height * s);
    } else {
      ctx.fillStyle = 'rgba(140,164,196,0.30)';
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.20, r * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.72, r * 0.74, r * 0.52, 0, Math.PI, 0); ctx.fill();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = ui.C.gold;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  /* ONE BOSS'S CASE PAGE.
   *
   * Deliberately the same box, the same header rule and the same type ladder as
   * an evidence brief: it is another page of the same file, not a second screen
   * that happens to be reachable from here. What it adds is the two things a
   * brief cannot say — whether this man's file can be opened at all, and which
   * mission he came from. */
  function drawCasePanel(ui, c, a = 1) {
    const C = ui.C;
    const panel = PANEL_BOX;
    const who = resolveIdentity(c.boss);
    const lvl = LEVELS[c.level];
    const open = caseIsOpen(c.id);
    const tone = c.tone === 'green' ? C.green : c.tone === 'red' ? C.red : C.gold;

    ctx.save();
    ctx.globalAlpha *= panelEntry();
    ui.glass(panel.x, panel.y, panel.w, panel.h, 10,
      { tint: 'rgba(9,13,20,0.80)', border: 'rgba(233,182,84,0.24)' });
    ctx.textAlign = 'left';
    ui.setFont(700, 10.5, 2.8);
    ctx.fillStyle = C.gold;
    ctx.fillText('CASE FILE', panel.x + 26, panel.y + 33);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(panel.x + 24, panel.y + 49, panel.w - 48, 1);

    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(0, (1 - a) * 8);

    panelPortrait(ui, panel.x + 26 + 42, panel.y + 116, 42, c.boss);

    const tx = panel.x + 26 + 100;
    ui.setFont(700, 9, 2.2);
    ctx.fillStyle = C.orange;
    ctx.fillText(lvl?.code ?? `LEVEL 0${c.level}`, tx, panel.y + 88);
    ui.setDisplay(700, 20, 0.7);
    ctx.fillStyle = C.paper;
    ctx.fillText(assertPlayerSafe(who.shortName, 'case.name'), tx, panel.y + 114);
    ui.setFont(700, 8.6, 1.8);
    ctx.fillStyle = tone;
    ctx.fillText(assertPlayerSafe(c.status, 'case.status'), tx, panel.y + 134);

    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    ctx.fillRect(panel.x + 26, panel.y + 170, panel.w - 52, 1);

    /* EVERYTHING BELOW THE RULE FLOWS OFF ONE `y`, and nothing is pinned to a
     * constant. Two of these values are level titles and two are place names —
     * copy that will change with the next level, in a language whose length is
     * not this file's to assume. The pager's rule at `panel.y + panel.h - 44`
     * (486) is the floor everything has to clear, and the arithmetic below
     * lands the last line at 466 with a single-line note or 483 with a wrapped
     * one. A third line would collide, which is what the panel check in
     * caseflowverify.js measures. */
    const rows = [
      ['OPERATION', assertPlayerSafe(lvl?.title ?? '—', 'case.title')],
      ['LOCATION', assertPlayerSafe(lvl?.place ?? '—', 'case.place')],
    ];
    let y = panel.y + 196;
    for (const [label, value] of rows) {
      ui.setFont(700, 8.6, 1.8);
      ctx.fillStyle = C.muted;
      ctx.fillText(label, panel.x + 26, y);
      ui.setFont(650, 11, 0.4);
      ctx.fillStyle = C.text;
      let vy = y + 18;
      for (const line of ui.wrapLines(value, panel.w - 52)) { ctx.fillText(line, panel.x + 26, vy); vy += 15; }
      y = vy + 22;
    }

    /* THE FILE'S STATE, SAID PLAINLY. "No evidence recovered" is the whole
     * reason Masood Jibril cannot be opened, and a player who is not told that
     * reads an unresponsive button instead. */
    ui.setFont(500, 11.5, 0.15);
    ctx.fillStyle = open ? C.text : C.dim;
    const note = open
      ? `${c.file.evidence.length} items recovered. File open.`
      : 'No evidence recovered. File not open.';
    /* ANCHORED TO THE BOTTOM, not to the block above it.
     *
     * Flowing it off `y` looked right and was not: MC Olodo's location wraps to
     * two lines where Masood Jibril's does not, so the same code put his note
     * 15 px lower and straight through the pager's rule. The note is the LAST
     * thing in the panel, its distance from the rule is the thing that has to
     * be constant, so it is measured from there — the block above can grow by a
     * line without dragging it anywhere. */
    const noteLines = ui.wrapLines(note, panel.w - 52);
    let ny = panel.y + panel.h - 54 - (noteLines.length - 1) * 17;
    for (const line of noteLines) { ctx.fillText(line, panel.x + 26, ny); ny += 17; }
    ctx.restore();
    ctx.restore();
  }

  /* The pager's own row, along the bottom of whichever page is open.
   *
   * Chevrons are PATHS, not type. '◀' and '▶' are not in Montserrat, so a
   * glyph here would be served by whatever system face the browser reached for
   * — a different weight and a different vertical centre from everything
   * beside it, on the one control that has to look built in. */
  function drawPagerRow(ui, pages, idx) {
    if (pages.length < 2) return;
    const C = ui.C;
    const panel = PANEL_BOX;
    const y = panel.y + panel.h - 26;
    const left = panel.x + 26;
    const right = panel.x + panel.w - 26;

    ctx.save();
    ctx.globalAlpha *= panelEntry() * 0.9;
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    ctx.fillRect(left, y - 18, panel.w - 52, 1);

    const chevron = (x, dir) => {
      ctx.beginPath();
      ctx.moveTo(x + dir * 3, y - 5);
      ctx.lineTo(x - dir * 3, y);
      ctx.lineTo(x + dir * 3, y + 5);
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    };
    chevron(left + 4, 1);
    chevron(right - 4, -1);

    ui.setFont(700, 8.6, 1.9);
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'left';
    ctx.fillText('L1', left + 16, y + 3);
    ctx.textAlign = 'right';
    ctx.fillText('R1', right - 16, y + 3);

    /* The position, and whether it is being held there. "FOLLOWING" is the
     * honest word for the auto panel: it is not page 4 of 4, it is page 4
     * because that is where the read currently is, and it will move on its own.
     * A player who does not know that presses nothing. */
    ctx.textAlign = 'center';
    ui.setFont(700, 8.6, 1.9);
    ctx.fillStyle = page === null ? C.dim : C.gold;
    ctx.fillText(page === null ? `FOLLOWING THE READ  ·  ${idx + 1} / ${pages.length}`
      : `${idx + 1} / ${pages.length}`, (left + right) / 2, y + 3);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  /* The left column: one page, plus the pager under it.
   *
   * The target plate used to be drawn OVER this panel at 86% opacity, from
   * draw(), so through the whole of WAIT_FOR_TARGET_X the evidence brief was
   * legible in fragments behind Masood Jibril's name. It is a PAGE now — same
   * box, one at a time — and the reveal is a real cross-fade between the two
   * rather than one sheet of glass laid on another. */
  function drawLeftPanel(ui) {
    const { pages, idx, cur } = activePage();
    if (!cur) { drawEvidencePanel(ui, null); drawPagerRow(ui, pages, idx); return; }

    if (cur.kind === 'case') {
      drawCasePanel(ui, cur.c, pageFade);
    } else if (cur.kind === 'target') {
      const plate = ease(revealBeats().name);
      /* Under the reveal the brief that was showing fades out as the plate
       * comes up. Only while the plate is still arriving — once it is fully in,
       * the box is his. */
      if (plate < 1 && pages.length > 1) {
        const under = pages[pages.length - 2];
        if (under.kind === 'evidence') drawEvidencePanel(ui, under.ev, 1 - plate);
      }
      drawTargetPlate(ui, Math.min(plate, pageFade));
    } else {
      /* Auto: the item's own landing fade. Manual: the page cross-fade. The
       * min is what makes one expression serve both — a page stepped to long
       * after it landed has a settled auto fade and rides `pageFade`, and a
       * page that is landing right now has a settled `pageFade` and rides its
       * own. */
      const swap = ease(clamp((narration.t - cur.ev.at) / 0.34, 0, 1));
      drawEvidencePanel(ui, cur.ev, Math.min(swap, pageFade));
    }
    drawPagerRow(ui, pages, idx);
  }

  /* ===================================================== EvidenceAnalysisUI */
  function drawEvidenceScreen(ui) {
    const C = ui.C;
    const t = narration.t;
    const A = file();

    drawAnalysisBackground(ui);
    header(ui, `${LEVELS[levelId].code}  /  ${LEVELS[levelId].title}`, A.heading, A.subhead,
      clamp(stateT / 0.5, 0, 1));

    /* ---- the detail panel, whichever page is open --------------------- */
    drawLeftPanel(ui);

    /* ---- the board --------------------------------------------------- */
    const src = BOARD.source;
    const srcU = clamp((t - TRACE.srcAt) / TRACE.node, 0, 1);
    const olodo = resolveIdentity('olodo');

    // connections first, so a circle always covers the line's end
    A.evidence.forEach((ev, i) => {
      const node = BOARD.items[i];
      const inU = clamp((t - ev.draw) / TRACE.line, 0, 1);
      if (inU > 0) trimPath(elbow(src, node, 0.52), inU, { color: 'rgba(233,182,84,0.72)', width: 1.7, glow: true });
      const outU = clamp((t - ev.draw - TRACE.outLag) / TRACE.line, 0, 1);
      if (outU > 0) trimPath(elbow(node, BOARD.target, 0.5), outU,
        { color: 'rgba(224,67,44,0.62)', width: 1.7, dash: [7, 5], glow: true });
    });

    drawNode(ui, src, srcU, {
      tone: 'green', heavy: true, img: portrait('olodo'),
      top: olodo.shortName, bottom: 'LEVEL 01 · DEFEATED',
    });

    A.evidence.forEach((ev, i) => {
      const u = clamp((t - ev.at) / TRACE.node, 0, 1);
      drawNode(ui, BOARD.items[i], u, {
        tone: 'gold',
        icon: ev.id === 'phone' ? 'bell' : ev.id === 'witness' ? 'users' : 'map',
        top: ev.no, bottom: ev.nodeStatus ?? ev.status, labelSize: 9.4,
      });
    });

    /* WHICH ITEM THE PANEL IS ON, said on the board as well as in the panel.
     * Paging a detail pane while the diagram beside it stays inert makes the
     * two read as unrelated screens; the ring is what ties the page the player
     * stepped to back to the circle it came from. Drawn after the nodes so it
     * sits over the disc, and only while a page is actually pinned — an
     * auto-following panel is not a selection and must not draw like one. */
    const focus = activePage();
    /* A case page rings the man on the board rather than an item — MC Olodo's
     * own circle for his file, the target circle for the next name. The tie
     * between the panel and the diagram is the point of the ring, and it holds
     * whether the page is a thing or a person. */
    const focusNode = page === null ? null
      : focus.cur?.kind === 'evidence' ? BOARD.items[focus.cur.i]
        : focus.cur?.kind === 'case' ? (focus.cur.c.boss === 'olodo' ? BOARD.source : BOARD.target)
          : focus.cur?.kind === 'target' ? BOARD.target : null;
    if (focusNode) {
      const n = focusNode;
      ctx.save();
      ctx.globalAlpha *= 0.55 + 0.45 * pageFade;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 7, 0, Math.PI * 2);
      ctx.strokeStyle = C.orange;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = C.orange;
      ctx.shadowBlur = 10 + 6 * Math.sin(ui.clock * 3.2);
      ctx.stroke();
      ctx.restore();
    }

    drawTargetNode(ui);

    /* ---- the read ---------------------------------------------------- */
    const strip = { x: 56, y: 556, w: 1168, h: 82 };
    ctx.save();
    ctx.globalAlpha *= panelEntry();
    ui.glass(strip.x, strip.y, strip.w, strip.h, 8,
      { tint: 'rgba(6,9,15,0.82)', border: 'rgba(150,176,214,0.14)' });
    ctx.fillStyle = C.orange;
    ctx.fillRect(strip.x, strip.y, 3, strip.h);
    ui.setFont(500, 14.5, 0.1);
    ctx.fillStyle = C.paper;
    ctx.textAlign = 'left';
    const r = type.narration.draw(ctx, A.narration, strip.x + 26, strip.y + 34,
      strip.w - 52, 22, narration.revealAll());
    // the caret, while it is still typing
    if (!r.done && Math.floor(ui.clock * 2.6) % 2 === 0) {
      ctx.fillStyle = C.orange;
      ctx.fillRect(r.x + 3, r.y - 11, 8, 2);
    }
    ctx.restore();
  }

  /* ================================================== TargetRevealController
   * UNKNOWN -> SCAN -> GLITCH -> SILHOUETTE -> PORTRAIT -> NAME.
   *
   * Every beat is a slice of one clock, so the whole climax retimes from the
   * five numbers in AFTERMATH.reveal and cannot fall out of order.
   */
  function revealBeats() {
    const R = file().reveal;
    const a = R.scan, b = a + R.glitch, c = b + R.silhouette, d = c + R.portrait, e = d + R.name;
    return {
      scan: clamp(revealT / a, 0, 1),
      glitch: clamp((revealT - a) / R.glitch, 0, 1),
      silhouette: clamp((revealT - b) / R.silhouette, 0, 1),
      portrait: clamp((revealT - c) / R.portrait, 0, 1),
      name: clamp((revealT - d) / R.name, 0, 1),
      total: e,
      done: revealT >= e,
    };
  }

  function drawTargetNode(ui) {
    const C = ui.C;
    const n = BOARD.target;
    const B = revealBeats();
    const started = revealT > 0;
    const jibril = resolveIdentity('jibril');

    if (!started) {
      /* Before the reveal it is a question, not a person. */
      drawNode(ui, n, clamp((narration.t - 0.4) / 0.6, 0, 1), {
        tone: 'dim', glyph: '?', glyphColor: C.dim,
        top: 'UNKNOWN', bottom: 'UNIDENTIFIED', pulse: true,
      });
      return;
    }

    const img = portrait('jibril');
    drawNode(ui, n, 1, {
      tone: B.silhouette > 0 ? 'red' : 'dim',
      heavy: true,
      pulse: B.done,
      img: B.portrait > 0 && img ? img : null,
      imgAlpha: B.portrait,
      /* No photograph has been supplied for him, so the silhouette IS the
       * portrait beat — which is the truthful read for a man the case has only
       * just named. */
      silhouette: img ? 0 : Math.max(B.silhouette, B.portrait),
      glyph: B.silhouette <= 0 ? '?' : null,
      glyphColor: C.dim,
    });

    // SCAN — a bright line sweeping down the disc
    if (B.scan > 0 && B.scan < 1) {
      ctx.save();
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r - 2, 0, Math.PI * 2); ctx.clip();
      const y = n.y - n.r + (n.r * 2) * B.scan;
      const g = ctx.createLinearGradient(0, y - 16, 0, y + 16);
      g.addColorStop(0, 'rgba(120,220,255,0)');
      g.addColorStop(0.5, 'rgba(150,232,255,0.75)');
      g.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(n.x - n.r, y - 16, n.r * 2, 32);
      ctx.restore();
    }

    // GLITCH — the data break
    if (B.glitch > 0 && B.glitch < 1) {
      ctx.save();
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r - 2, 0, Math.PI * 2); ctx.clip();
      glitchRegion(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2,
        Math.sin(B.glitch * Math.PI), Math.floor(revealT * 24));
      ctx.restore();
    }

    // NAME — types on under him
    if (B.name > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ui.setFont(700, 9, 2.2);
      ctx.fillStyle = C.red;
      ctx.fillText(file().target.tag, n.x, n.y + n.r + 26);
      ui.setDisplay(700, 20, 0.8);
      ctx.fillStyle = C.paper;
      const full = assertPlayerSafe(jibril.shortName, 'target.name');
      ctx.fillText(full.slice(0, Math.round(full.length * B.name)), n.x, n.y + n.r + 52);
      ui.setFont(700, 8.8, 1.9);
      ctx.fillStyle = C.gold;
      if (B.name >= 1) ctx.fillText(file().target.level, n.x, n.y + n.r + 70);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  /* The flourish the reveal climaxes on — a rank/name plate in the left column,
   * once the portrait has resolved. It is the pager's LAST PAGE (see
   * drawLeftPanel), which is why it takes its alpha rather than deriving one:
   * the same plate has to be able to arrive on the reveal AND be paged back to
   * afterwards, and those are two different fades. */
  function drawTargetPlate(ui, u) {
    if (!(u > 0)) return;
    const C = ui.C;
    const jibril = resolveIdentity('jibril');
    const box = PANEL_BOX;
    ctx.save();
    ctx.globalAlpha *= panelEntry() * u;
    ui.glass(box.x, box.y, box.w, box.h, 10,
      { tint: 'rgba(16,7,7,0.86)', border: `rgba(224,67,44,${0.30 + 0.16 * Math.sin(ui.clock * 2.6)})` });
    ctx.fillStyle = C.red;
    ctx.fillRect(box.x, box.y, 3, box.h);
    ctx.textAlign = 'left';
    ui.setFont(700, 9.5, 2.6);
    ctx.fillStyle = C.red;
    ctx.fillText(file().target.tag, box.x + 26, box.y + 36);
    ui.setFont(700, 12, 2.4);
    ctx.fillStyle = C.muted;
    ctx.fillText(assertPlayerSafe(jibril.rank, 'target.rank'), box.x + 26, box.y + 74);
    ui.setDisplay(700, 33, 1.2);
    ctx.fillStyle = C.paper;
    ctx.fillText(assertPlayerSafe(jibril.shortName, 'target.plate'), box.x + 26, box.y + 112);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(box.x + 26, box.y + 130, box.w - 52, 1);
    ui.setFont(700, 9, 2.0);
    ctx.fillStyle = C.gold;
    ctx.fillText(file().target.level, box.x + 26, box.y + 158);
    ui.setFont(500, 11.5, 0.15);
    ctx.fillStyle = C.text;
    type.detail.draw(ctx, file().target.note, box.x + 26, box.y + 186, box.w - 52, 18, 1);
    ui.setFont(500, 11.5, 0.15);
    ctx.fillStyle = C.muted;
    type.detail.layout(ctx, file().target.note, box.x + 26);
    ctx.restore();
  }

  /* ====================================================== CabalNetworkGraph */
  const CABAL_COL = 980;
  const cabalNodeY = (i) => 148 + i * 101;

  /* One rung of the chain, in the assessment's box.
   *
   * The two UNIDENTIFIED rungs get a dossier too, and it says nothing — which
   * is the correct content for them and the whole point of the screen. A
   * selection that simply refused to move onto them would teach the player the
   * chain is three deep when the story needs him to leave knowing it is five. */
  function drawChainDossier(ui, box, node) {
    const C = ui.C;
    const id = node.key ? resolveIdentity(node.key) : null;
    const c = node.key ? caseFor(node.key) : null;
    const open = node.key ? caseIsOpen(node.key) : false;
    const tone = node.tone === 'alert' ? C.red : node.tone === 'green' ? C.green
      : node.tone === 'red' ? C.red : C.dim;

    ui.setFont(700, 10.5, 2.8);
    ctx.fillStyle = C.gold;
    ctx.fillText(node.key ? 'NETWORK · SELECTED' : 'NETWORK · UNRESOLVED', box.x + 26, box.y + 33);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(box.x + 24, box.y + 49, box.w - 48, 1);

    ui.setDisplay(700, 24, 0.9);
    ctx.fillStyle = node.tone === 'dim' ? C.muted : C.paper;
    ctx.fillText(assertPlayerSafe(id ? id.shortName : 'UNIDENTIFIED', 'chain.name'),
      box.x + 26, box.y + 86);
    ui.setFont(700, 8.6, 1.8);
    ctx.fillStyle = tone;
    ctx.fillText(assertPlayerSafe(node.bottom, 'chain.status'), box.x + 26, box.y + 106);

    /* What this rung offers, said as a fact rather than as a button. The hint
     * bar names the button; this says whether pressing it will do anything. */
    ui.setFont(500, 11.5, 0.15);
    ctx.fillStyle = open ? C.text : C.dim;
    const line = open
      ? `File open — ${c.file.evidence.length} items recovered. Open it to read the evidence and the connection.`
      : id && c ? 'No evidence recovered yet. Nothing to open.'
        : id ? 'No case file. The trail does not reach this far.'
          : 'No name, no face, no file. The chain runs on past what the evidence can prove.';
    let y = box.y + 134;
    for (const l of ui.wrapLines(line, box.w - 52)) { ctx.fillText(l, box.x + 26, y); y += 17; }
  }

  function drawCabalScreen(ui) {
    const C = ui.C;
    const K = AFTERMATH.cabal;
    drawAnalysisBackground(ui);
    header(ui, `${LEVELS[levelId].code}  /  ${LEVELS[levelId].title}`, K.heading,
      'The chain runs higher than the street.', clamp(stateT / 0.5, 0, 1));

    /* The chain, bottom of the food chain at the top. Connections first.
     *
     * The rungs carry NO mark of their own. A '?' floating beside the line was
     * the same word the circles were already saying, in a third place — the
     * dashed red stroke and the faceless avatar it arrives at are what carry
     * "unconfirmed", and they carry it without annotating the diagram. */
    for (let i = 0; i < K.chain.length - 1; i++) {
      const a = { x: CABAL_COL, y: cabalNodeY(i), r: 34 };
      const b = { x: CABAL_COL, y: cabalNodeY(i + 1), r: 34 };
      const u = clamp((cabalT - CHAIN.lineLag - i * CHAIN.step) / CHAIN.line, 0, 1);
      if (u <= 0) continue;
      const known = i === 0;
      trimPath([{ x: a.x, y: a.y + a.r + 4 }, { x: b.x, y: b.y - b.r - 4 }], u, {
        color: known ? 'rgba(233,182,84,0.75)' : 'rgba(224,67,44,0.55)',
        width: 1.8, dash: known ? null : [6, 6], glow: true,
      });
    }

    K.chain.forEach((node, i) => {
      const u = clamp((cabalT - i * CHAIN.step) / CHAIN.step, 0, 1);
      const n = { x: CABAL_COL, y: cabalNodeY(i), r: node.tone === 'alert' ? 40 : 34 };
      const id = node.key ? resolveIdentity(node.key) : null;
      /* An UNKNOWN rung draws the same faceless avatar Masood Jibril's node
       * draws — because that is what it is. A person whose photograph has not
       * been obtained and a person whose NAME has not been obtained are the same
       * hole in the same file, and drawing one as a silhouette and the other as
       * a typographic '?' made the second read like a UI placeholder rather than
       * like a suspect. Whatever `drawNode` does for a missing portrait, these
       * get; drop art in PORTRAITS and both fill in together. */
      const faceless = (node.unknown || node.portrait) && !portrait(node.key);
      drawNode(ui, n, u, {
        tone: node.tone,
        heavy: node.tone === 'alert',
        pulse: node.tone === 'alert' && u >= 1,
        img: node.portrait ? portrait(node.key) : null,
        silhouette: faceless ? 1 : 0,
        icon: node.tone === 'alert' ? 'skull' : null,
      });
      /* Labels to the LEFT of the column, so a five-deep chain does not need
       * 720px of vertical room for its captions. */
      ctx.save();
      ctx.globalAlpha *= ease(u);
      ctx.textAlign = 'right';
      const top = id ? id.shortName : node.top;
      /* A rung with no name draws its status on the CENTRE line instead of
       * below it — a lone caption hanging under an empty slot reads as a label
       * that lost its heading. */
      if (top) {
        ui.setFont(700, 13, 1.6);
        ctx.fillStyle = node.tone === 'dim' ? C.muted : C.paper;
        ctx.fillText(assertPlayerSafe(top, 'cabal.top'), n.x - n.r - 22, n.y + 1);
      }
      ui.setFont(700, 8.6, 1.8);
      ctx.fillStyle = node.tone === 'alert' ? C.red : node.tone === 'green' ? C.green
        : node.tone === 'red' ? C.red : C.dim;
      ctx.fillText(assertPlayerSafe(node.bottom, 'cabal.bottom'), n.x - n.r - 22, n.y + (top ? 17 : 5));
      ctx.textAlign = 'left';
      ctx.restore();

      /* THE SELECTION ON THE NETWORK. Same ring the evidence board draws round
       * a paged-to node, for the same reason — the panel on the left is showing
       * this rung, and without the ring the two halves of the screen are two
       * unrelated readouts. Only once the rung has finished landing, so the
       * chain still builds itself unannotated on the first pass. */
      if (chainPinned && i === chainSel && u >= 1) {
        ctx.save();
        ctx.globalAlpha *= 0.55 + 0.45 * chainFade;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 7, 0, Math.PI * 2);
        ctx.strokeStyle = C.orange;
        ctx.lineWidth = 1.6;
        ctx.shadowColor = C.orange;
        ctx.shadowBlur = 10 + 6 * Math.sin(ui.clock * 3.2);
        ctx.stroke();
        ctx.restore();
      }
    });

    /* The read, on the left. Sized to the copy — three wrapped lines and the
     * heading — rather than to the column, so the plate under it is not sitting
     * at the bottom of an empty pane. */
    const box = { x: 56, y: 186, w: 470, h: 176 };
    const bu = ease(clamp((stateT - 0.2) / 0.5, 0, 1));
    ctx.save();
    ctx.globalAlpha *= bu;
    ui.glass(box.x, box.y, box.w, box.h, 10,
      { tint: 'rgba(9,13,20,0.82)', border: 'rgba(224,67,44,0.22)' });
    ctx.textAlign = 'left';
    /* THE PANEL FOLLOWS THE SELECTION once the player has touched the chain.
     *
     * Until then it is the assessment — the line the screen exists to land, and
     * the wrong thing to take away from someone who has not asked for anything
     * else. From the first press it becomes the dossier for the rung under the
     * ring, because that is what stepping through a network is FOR. Pressing
     * nothing leaves the screen exactly as it always was. */
    if (chainPinned) drawChainDossier(ui, box, K.chain[chainSel]);
    else {
      ui.setFont(700, 10.5, 2.8);
      ctx.fillStyle = C.red;
      ctx.fillText('ASSESSMENT', box.x + 26, box.y + 33);
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(box.x + 24, box.y + 49, box.w - 48, 1);
      ui.setFont(500, 14, 0.1);
      ctx.fillStyle = C.paper;
      type.cabal.draw(ctx, K.narration, box.x + 26, box.y + 84, box.w - 52, 23,
        clamp(cabalT / (K.fallbackDur * 0.72), 0, 1));
    }
    ctx.restore();

    /* IDENTITY UNKNOWN — the line the whole sequence exists to land. */
    const fu = ease(clamp((cabalT - 2.6) / 0.9, 0, 1));
    ctx.save();
    ctx.globalAlpha *= fu;
    ui.roundRectPath(ctx, box.x, box.y + box.h + 22, box.w, 74, 8);
    ctx.fillStyle = 'rgba(224,67,44,0.10)';
    ctx.fill();
    ctx.strokeStyle = `rgba(224,67,44,${0.30 + 0.14 * Math.sin(ui.clock * 2.4)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'left';
    ui.setDisplay(700, 26, 2.2);
    ctx.fillStyle = C.red;
    ctx.fillText(assertPlayerSafe(resolveIdentity('cabal').displayName.toUpperCase(), 'cabal.name'),
      box.x + 26, box.y + box.h + 60);
    ui.setFont(700, 10, 2.6);
    ctx.fillStyle = C.muted;
    ctx.fillText('IDENTITY UNKNOWN', box.x + 26, box.y + box.h + 80);
    ctx.restore();
  }

  /* ==================================================== LevelSelectController */
  const SELECT_CARDS = [
    { id: 'replay', level: 1 },
    { id: 'next', level: 2 },
  ];

  /* ------------------------------------------------------- the card photograph
   *
   * The thumbnail. It reuses `portrait()` — the SAME loader and the same file
   * the evidence board's Olodo node draws from — so there is one dossier image
   * per character in this game and adding art for anyone else is a line in
   * PORTRAITS, not a second pipeline.
   *
   * It CROPS rather than cover-fitting the whole picture. The dossier art is a
   * wide scene (a man behind a bar, with a lamp, bottles and a painted
   * nameplate); a card thumbnail wants a face. `zoom` says how much of the
   * image height survives and `focus` is the point that lands at (0.5, 0.32)
   * of the frame, which is where a mugshot's eyes belong. The crop is also what
   * keeps the painted "MC_OLODO" plate off the card — it reads as a filename,
   * and the card already says his name in type two inches to the left.
   *
   * Level 02's target resolves to NO image, and that is not a hole to fill: he
   * gets the same faceless figure the board and the Cabal page give a man the
   * case has not put a face to yet, captioned as such. The two cards therefore
   * share one frame and one code path — the difference between them is the
   * story's, not the layout's. */
  /* zoom 1.62 keeps 407 of the art's 660 rows. That is the number the crop is
   * actually bounded by at BOTH ends: any tighter and the frame's top edge
   * shaves the crown of his beret, any looser and the bottom edge reaches the
   * painted nameplate at row ~493. */
  const CARD_ART = {
    olodo: { focusX: 0.45, focusY: 0.27, zoom: 1.62 },
  };
  const THUMB = { w: 168, h: 226, right: 26, top: 30 };

  function drawCardPhoto(ui, box, key, tone, on) {
    const C = ui.C;
    const x = box.x + box.w - THUMB.right - THUMB.w;
    const y = box.y + THUMB.top;
    const w = THUMB.w, h = THUMB.h;
    const img = portrait(key);

    ctx.save();
    /* The card is mid fade-in when this runs, so every alpha below is a
     * FRACTION of whatever the card is currently at — assigning globalAlpha
     * outright would pop the photo in at full strength on frame one. */
    const A0 = ctx.globalAlpha;

    ui.roundRectPath(ctx, x, y, w, h, 6);
    ctx.fillStyle = 'rgba(4,7,12,0.92)';
    ctx.fill();

    ctx.save();
    ctx.clip();
    if (img) {
      const a = CARD_ART[key] || { focusX: 0.5, focusY: 0.35, zoom: 1 };
      const cropH = Math.min(img.height, img.height / a.zoom);
      const cropW = Math.min(img.width, cropH * (w / h));
      const sx = clamp(a.focusX * img.width - cropW / 2, 0, img.width - cropW);
      const sy = clamp(a.focusY * img.height - cropH * 0.32, 0, img.height - cropH);
      ctx.globalAlpha = A0 * (on ? 1 : 0.88);
      ctx.drawImage(img, sx, sy, cropW, cropH, x, y, w, h);

      /* Graded into the screen. A photograph dropped in raw is the one element
       * that looks pasted on: a cool floor knocks its warmth back toward the
       * palette, and the tone wash ties it to the card's own status colour.
       *
       * The two levels are the SELECTION READ, and they were measured, not
       * chosen — at 0.84/0.30 the unselected frame came back only 12% darker
       * than the selected one, which is not a difference a player can see, and
       * it dragged the resting state down to a mean luma of 43. */
      ctx.globalAlpha = A0 * (on ? 0.10 : 0.24);
      ctx.fillStyle = 'rgb(10,16,28)';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = A0 * 0.14;
      ctx.fillStyle = tone;
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.globalAlpha = A0 * 0.55;
      ctx.fillStyle = 'rgba(140,164,196,0.34)';
      /* Same proportions as `drawNode`'s silhouette, driven off a notional node
       * radius, so the two readings of "no face yet" are literally the same
       * figure at two sizes. */
      const R = h * 0.36, cx = x + w / 2, cy = y + h * 0.44;
      ctx.beginPath();
      ctx.arc(cx, cy - R * 0.20, R * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, cy + R * 0.72, R * 0.74, R * 0.52, 0, Math.PI, 0);
      ctx.fill();
    }

    /* The caption sits on the picture, so the picture gets a floor under it. */
    ctx.globalAlpha = A0;
    const g = ctx.createLinearGradient(0, y + h - 72, 0, y + h);
    g.addColorStop(0, 'rgba(4,7,12,0)');
    g.addColorStop(1, 'rgba(4,7,12,0.94)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y + h - 72, w, 72);
    ctx.restore();                                   // drop the clip

    // evidence-photo corner ticks, inset clear of the 6px corner radius
    ctx.globalAlpha = A0 * (on ? 0.85 : 0.42);
    ctx.strokeStyle = tone;
    ctx.lineWidth = 1.6;
    const t = 12, i0 = 7;
    [[x + i0, y + i0, 1, 1], [x + w - i0, y + i0, -1, 1],
     [x + i0, y + h - i0, 1, -1], [x + w - i0, y + h - i0, -1, -1]]
      .forEach(([px, py, dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(px + dx * t, py);
        ctx.lineTo(px, py);
        ctx.lineTo(px, py + dy * t);
        ctx.stroke();
      });

    ctx.globalAlpha = A0;
    ctx.textAlign = 'center';
    ui.setFont(700, 9, 2.2);
    ctx.fillStyle = img ? C.muted : C.dim;
    ctx.fillText(img ? 'CASE PHOTOGRAPH' : 'NO PHOTO ON FILE', x + w / 2, y + h - 16);
    ctx.textAlign = 'left';

    ui.roundRectPath(ctx, x, y, w, h, 6);
    ctx.strokeStyle = on ? 'rgba(255,122,31,0.55)' : 'rgba(150,176,214,0.20)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawLevelSelect(ui) {
    const C = ui.C;
    drawAnalysisBackground(ui);
    header(ui, 'CASE FILE 001  ·  CLOSED', 'SELECT OPERATION',
      'The board is set. Choose where the investigation goes next.',
      clamp(stateT / 0.5, 0, 1));

    const cards = [
      { x: 120, y: 214 }, { x: 664, y: 214 },
    ];
    const cw = 496, ch = 316;

    SELECT_CARDS.forEach((card, i) => {
      const on = select === i;
      const lvl = LEVELS[card.level];
      const who = resolveIdentity(lvl.boss);
      const u = ease(clamp((stateT - 0.2 - i * 0.12) / 0.5, 0, 1));
      const box = { x: cards[i].x, y: cards[i].y, w: cw, h: ch };
      ctx.save();
      ctx.globalAlpha *= u;
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      ctx.translate(cx, cy + (1 - u) * 16);
      const s = on ? 1.0 : 0.975;
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);

      /* Opaque enough to READ against. These cards sit over a photographic
       * background with a lamp in it, and at the menu's own 0.74 the boss name
       * came out grey — a choice screen whose options are hard to read is the
       * one screen that cannot afford atmosphere over legibility. */
      ui.glass(box.x, box.y, box.w, box.h, 12, {
        tint: on ? 'rgba(24,15,6,0.93)' : 'rgba(7,10,16,0.90)',
        border: on ? `rgba(255,122,31,${0.60 + 0.18 * Math.sin(ui.clock * 2.4)})`
          : 'rgba(150,176,214,0.18)',
      });
      ctx.fillStyle = on ? C.orange : 'rgba(150,176,214,0.22)';
      ctx.fillRect(box.x, box.y, 4, box.h);

      const tone = card.id === 'next' ? C.red : C.green;
      drawCardPhoto(ui, box, lvl.boss, tone, on);

      /* Everything below is a COLUMN now, not the card's full width — the
       * photograph owns the right 194px. Derived from the frame instead of
       * typed in, so moving THUMB moves the type with it. */
      const textW = box.w - THUMB.right - THUMB.w - 16 - 34;

      ctx.textAlign = 'left';
      ui.setDisplay(700, 62, 2);
      ctx.fillStyle = on ? C.gold : C.dim;
      ctx.fillText(String(card.level).padStart(2, '0'), box.x + 34, box.y + 88);

      ui.setFont(700, 10, 3.0);
      ctx.fillStyle = card.id === 'next' ? C.red : C.green;
      ctx.fillText(card.id === 'next' ? 'NEXT TARGET' : 'DEFEATED', box.x + 34, box.y + 116);

      ui.setDisplay(700, 27, 1.1);
      ctx.fillStyle = C.paper;
      ctx.fillText(assertPlayerSafe(who.shortName, 'select.boss'), box.x + 34, box.y + 156);

      ui.setFont(700, 10.5, 2.4);
      ctx.fillStyle = C.muted;
      ctx.fillText(lvl.title, box.x + 34, box.y + 180);

      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(box.x + 34, box.y + 198, textW, 1);

      /* WRAPPED, because the column is narrower than the role line. Level 02's
       * "Senior police official · position in the network unconfirmed" ran the
       * old full width and would otherwise have driven straight through the
       * photograph. Two lines clear the action line at ch-34 with room. */
      ui.setFont(500, 12, 0.15);
      ctx.fillStyle = C.text;
      const blurb = card.id === 'next'
        ? assertPlayerSafe(who.role, 'select.role')
        : 'Case closed. Run the street again.';
      ui.wrapLines(blurb, textW)
        .forEach((line, n) => ctx.fillText(line, box.x + 34, box.y + 224 + n * 17));

      // the action line
      ui.setFont(700, 11, 2.6);
      ctx.fillStyle = on ? C.orange : C.dim;
      ctx.fillText(card.id === 'next' ? 'PLAY LEVEL 02' : 'REPLAY LEVEL 01', box.x + 34, box.y + ch - 34);
      if (on) {
        ui.icon('cross', box.x + box.w - 46, box.y + ch - 39, 20, C.orange, 0.95);
      }
      ctx.restore();

      /* A real hitbox, so the mouse can pick a card exactly like every other
       * screen in this game. */
      ui.hitboxes.push({ x: box.x, y: box.y, w: box.w, h: box.h, index: i, id: `after:${i}` });
    });
  }

  /* ------------------------------------------------------------- footers */
  function prompt(ui, text, u = 1) {
    ctx.save();
    ctx.globalAlpha *= u * (0.66 + 0.34 * (0.5 + 0.5 * Math.sin(ui.clock * 2.7)));
    ctx.textAlign = 'center';
    ui.setFont(700, 12, 3.4);
    ctx.fillStyle = ui.C.gold;
    ctx.fillText(text, W / 2, 672);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  /* =========================================================== the machine */
  function go(next) {
    state = next;
    stateT = 0;
    if (next === 'EVIDENCE_ANALYSIS') {
      narration.load(file());
      narration.start(getVolume ? getVolume() : 1);
      /* A replay is a fresh read, so the panel goes back to following it. Tied
       * to the clock being rewound (the same line the tracing audio's reset is
       * tied to), not to every `go()` — the four states after this one share
       * one read, and dropping the player's page on each of them would undo a
       * deliberate press a beat after it was made. */
      page = null; pageFade = 1; hadTarget = false;
      /* A replayed read is the read for the case that is open, not for whatever
       * case the sequence started on. */
    }
    /* Walking back onto the network drops its cursor: the panel there is the
     * assessment again, which is what a player arriving at that screen — by any
     * route — is meant to be given first. */
    if (next === 'CABAL_NETWORK_REVEAL') { chainPinned = false; chainSel = 0; chainFade = 1; }
    if (next === 'NEXT_TARGET_REVEAL') revealT = 0;
    if (next === 'CABAL_NETWORK_REVEAL') cabalT = 0;
    /* THE TRACING AUDIO IS RESET WHEN ITS CLOCK IS, AND NOT OTHERWISE.
     *
     * Five of these states share ONE clock — the narration's — and the board
     * keeps building across all of them. Clearing the fired set on every `go()`
     * would let EVIDENCE_ANALYSIS -> NARRATION_PLAYING (0.45 s in, before the
     * jump guard can help) sound MC Olodo's circle a second time. So the reset
     * is tied to the two lines above that actually rewind a clock, and every
     * other transition just takes any live bed down with it. */
    if (next === 'EVIDENCE_ANALYSIS' || next === 'CABAL_NETWORK_REVEAL') traceAudio.reset();
    else traceAudio.hush();
  }

  function update(dt) {
    if (!active) return;
    stateT += dt;
    pageFade = Math.min(1, pageFade + dt / 0.28);
    chainFade = Math.min(1, chainFade + dt / 0.28);
    /* THE CLIMAX OUTRANKS THE PAGE THE PLAYER WAS ON. Fires on the edge — the
     * frame the target first becomes a page — so it costs one forced page turn
     * at the reveal and never touches the pager again. */
    const nowHasTarget = revealT > 0 && revealBeats().name > 0;
    if (nowHasTarget && !hadTarget) { page = null; pageFade = 1; }
    hadTarget = nowHasTarget;
    if (bgFade < 1 && state !== 'MISSION_COMPLETE' && state !== 'WAIT_FOR_X') {
      bgFade = Math.min(1, bgFade + dt / 0.65);
    }

    switch (state) {
      case 'MISSION_COMPLETE':
        /* The card animates itself in; the prompt is what says it is done. */
        if (stateT >= 1.9) go('WAIT_FOR_X');
        break;

      case 'WAIT_FOR_X':
        break;                                   // the player owns this beat

      case 'EVIDENCE_ANALYSIS':
        narration.update(dt);
        if (stateT >= 0.45) go('NARRATION_PLAYING');
        break;

      case 'NARRATION_PLAYING': {
        narration.update(dt);
        const last = file().evidence[file().evidence.length - 1];
        if (narration.t >= last.draw + 1.2) go('EVIDENCE_REVEAL');
        break;
      }

      case 'EVIDENCE_REVEAL':
        narration.update(dt);
        if (narration.t >= file().reveal.at) go('NEXT_TARGET_REVEAL');
        break;

      case 'NEXT_TARGET_REVEAL':
        narration.update(dt);
        revealT += dt;
        if (revealBeats().done && narration.done) go('WAIT_FOR_TARGET_X');
        break;

      case 'WAIT_FOR_TARGET_X':
        narration.update(dt);
        break;

      case 'CABAL_NETWORK_REVEAL':
        /* NO AUTO-ADVANCE. This screen used to time out into level select after
         * `cabal.fallbackDur`, which meant the last thing the player saw of the
         * story was taken away from them on a timer — and taken away mid-word,
         * because the assessment is still typing at that point. It is the
         * conclusion of the case; the player leaves it when the player is
         * finished with it. X is the only way out (see `press`).
         *
         * `cabalT` keeps running on purpose. Every reveal on the screen is a
         * clamped slice of it, so a clock that carries on past the end costs
         * nothing and the pulses stay alive under a player who sits here. */
        cabalT += dt;
        break;

      case 'LEVEL_SELECT':
        break;
      default: break;
    }

    /* THE TRACING AUDIO RUNS OFF THE SAME CLOCK THE LINES DO, and it runs here
     * rather than in draw(): a dropped render frame must not drop a cue, and the
     * screenshot harness draws frames without advancing time. Which clock to
     * read depends only on which screen is currently drawing lines.
     *
     * After the switch, so it sees this frame's clock rather than last frame's —
     * and so a `go()` above has already hushed anything the old beat left. */
    if (state === 'CABAL_NETWORK_REVEAL') {
      traceAudio.run(getUi(), cabalT, cabalCues());
    } else if (state === 'EVIDENCE_ANALYSIS' || state === 'NARRATION_PLAYING'
      || state === 'EVIDENCE_REVEAL' || state === 'NEXT_TARGET_REVEAL') {
      traceAudio.run(getUi(), narration.t, evidenceCues());
    }
  }

  /* REPLAY A MISSION FROM THE FILE.
   *
   * Straight through the SAME door the level-choice screen uses — `chosen` and
   * all — rather than a second way to start a level. That guard is what stops a
   * double press launching two missions, and it has to cover this path too or
   * the sequence has a race it did not have yesterday. */
  function replayCase(c, ui) {
    if (chosen) return true;
    if (!LEVELS[c.level]?.playable) return false;
    chosen = c.id;
    ui?.navForward();
    onChooseLevel?.(c.level, c.id);
    return true;
  }

  /* OPEN A BOSS'S FILE FROM THE NETWORK.
   *
   * Lands it FINISHED. The read, the board and the reveal are a performance the
   * player has already sat through; walking back into the file to look
   * something up must not make him sit through it again, so this puts the
   * sequence exactly where pressing Cross through the read leaves it — every
   * item on the board, the target resolved, nothing playing.
   *
   * The case id is carried even though only one file exists today, because the
   * moment a second one is authored this is the line that would otherwise have
   * to be found and changed. */
  function enterCase(key, ui) {
    const c = caseFor(key);
    if (!c || !caseIsOpen(key)) return false;
    ui?.navForward();
    caseId = c.id;
    levelId = c.level;
    narration.load(file());
    narration.skip();
    revealT = revealBeats().total;
    page = null; pageFade = 1; hadTarget = true;
    fromCabal = true;
    go('WAIT_FOR_TARGET_X');
    return true;
  }

  /* Input. One door, so the keyboard, the pad and the mouse cannot drift apart.
   * Returns true when the press was consumed. */
  function press(action) {
    if (!active) return false;
    const ui = getUi();

    /* L1 / R1 STEP THE LEFT PANEL, on every screen that has one.
     *
     * Handled ahead of the state switch because it means the same thing in all
     * five of them — the panel is the same panel — and because it must NOT be
     * confused with the accept/skip contract those states share: paging is the
     * one input here that does not advance the sequence. A player reading
     * evidence 02 for the third time is not asking to move on.
     *
     * It wraps. Four pages on a shoulder button is a browse, not a menu, and
     * running into a wall at either end of a four-item file is the kind of
     * small friction that stops people looking. */
    if (action === 'prev' || action === 'next' || action === 'up' || action === 'down') {
      const step = (action === 'next' || action === 'down') ? 1 : -1;

      /* THE NETWORK IS A LIST TOO, and it is a VERTICAL one — so the shoulders
       * and the stick both walk it. L1/R1 because that is the browse control
       * this sequence has taught on every other screen; up/down because a
       * column of five circles asks to be walked with a direction that points
       * along it, and refusing that reads as the diagram not being interactive
       * at all. */
      if (state === 'CABAL_NETWORK_REVEAL') {
        const n = AFTERMATH.cabal.chain.length;
        chainSel = chainPinned ? (chainSel + step + n) % n : (step > 0 ? 0 : n - 1);
        chainPinned = true;
        chainFade = 0;
        if (step > 0) ui?.navForward(); else ui?.navBack();
        return true;
      }

      /* Up/down are not a second pager. On the evidence board the panel is a
       * horizontal file and the shoulders own it; letting the stick page it too
       * would make the same input mean "walk the network" on one screen and
       * "turn the page" on the next. */
      if (action === 'up' || action === 'down') return false;
      if (!PAGED_STATES.has(state)) return false;
      const { pages, idx } = activePage();
      if (pages.length < 2) return false;
      page = (idx + step + pages.length) % pages.length;
      pageFade = 0;
      /* The backward cue for backward paging: this game already has two nav
       * sounds and they already mean direction. */
      if (step > 0) ui?.navForward(); else ui?.navBack();
      return true;
    }

    /* THE ACTION BUTTON — Triangle. It is deliberately NOT Cross.
     *
     * Cross means "continue" on every screen of this sequence and the hint bar
     * has been saying so since the mission card. Overloading it so that it
     * sometimes restarts the level instead, depending on which page the panel
     * happens to be showing, is the one change here that could cost a player
     * the thing he was doing. So the two new verbs get their own button, and it
     * is only advertised on a page that has one. */
    if (action === 'action') {
      if (PAGED_STATES.has(state)) {
        const { cur } = activePage();
        if (cur?.kind !== 'case') return false;
        return replayCase(cur.c, ui);
      }
      if (state === 'CABAL_NETWORK_REVEAL') {
        if (!chainPinned) return false;
        const node = AFTERMATH.cabal.chain[chainSel];
        if (!node?.key || !caseIsOpen(node.key)) return false;
        enterCase(node.key, ui);
        return true;
      }
      return false;
    }

    switch (state) {
      case 'MISSION_COMPLETE':
        /* X during the card's own entrance SKIPS to the prompt rather than being
         * swallowed. A press that appears to do nothing reads as a dropped
         * input, and this card has nothing to protect. */
        if (action === 'accept') { stateT = 1.9; go('WAIT_FOR_X'); ui?.navForward(); return true; }
        return false;

      case 'WAIT_FOR_X':
        if (action === 'accept') { loadBackground(); ui?.navForward(); go('EVIDENCE_ANALYSIS'); return true; }
        return false;

      case 'EVIDENCE_ANALYSIS':
      case 'NARRATION_PLAYING':
      case 'EVIDENCE_REVEAL':
      case 'NEXT_TARGET_REVEAL':
        /* SKIP, never lock. The read runs its course on its own, and X at any
         * point during it jumps to the end of the beat with everything landed —
         * the same contract the intro and the boss entrance already honour. */
        if (action === 'accept') {
          narration.skip();
          revealT = revealBeats().total;
          ui?.navForward();
          go('WAIT_FOR_TARGET_X');
          return true;
        }
        return false;

      case 'WAIT_FOR_TARGET_X':
        if (action === 'accept') { ui?.navForward(); go('CABAL_NETWORK_REVEAL'); return true; }
        if (action === 'back') {
          ui?.navBack();
          /* CIRCLE IS "THE WAY YOU CAME IN".
           *
           * Arriving here by finishing the mission, back means replay the read
           * — a player who looked away should not have to finish the level
           * again to hear it. Arriving from the network, back means the
           * network: he opened this file to look something up and the only
           * thing he can want is to be put back where he was. The hint bar is
           * relabelled to match, so the button never promises the other one. */
          if (fromCabal) { fromCabal = false; go('CABAL_NETWORK_REVEAL'); return true; }
          narration.replay(getVolume ? getVolume() : 1);
          revealT = 0;
          go('EVIDENCE_ANALYSIS');
          return true;
        }
        return false;

      case 'CABAL_NETWORK_REVEAL':
        /* THE ONLY WAY OFF THIS SCREEN. Nothing times out here, so this press is
         * not a skip — it is the exit, and it works from the first frame. A
         * player who has read the chain and wants to move does not have to wait
         * for a clock to agree with him. */
        if (action === 'accept') { ui?.navForward(); go('LEVEL_SELECT'); return true; }
        return false;

      case 'LEVEL_SELECT':
        if (action === 'left' && select !== 0) { select = 0; ui?.navForward(); return true; }
        if (action === 'right' && select !== 1) { select = 1; ui?.navForward(); return true; }
        if (action === 'accept') {
          if (chosen) return true;               // one commit per sequence
          const card = SELECT_CARDS[select];
          chosen = card.id;
          ui?.pressPulse(`after:${select}`);
          ui?.navForward();
          onChooseLevel?.(card.level, card.id);
          return true;
        }
        return false;
      default: return false;
    }
  }

  function draw() {
    if (!active) return;
    const ui = getUi();
    if (!ui) return;

    /* MISSION_COMPLETE and WAIT_FOR_X are drawn by game.js's own mission card —
     * this sequence does not redraw the screen the fight ends on, it waits on
     * it. Everything from EVIDENCE_ANALYSIS onward is ours. */
    if (state === 'MISSION_COMPLETE' || state === 'WAIT_FOR_X') return;

    ui.beginFrame();               // this frame's hitboxes are ours
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    if (state === 'LEVEL_SELECT') drawLevelSelect(ui);
    else if (state === 'CABAL_NETWORK_REVEAL') drawCabalScreen(ui);
    /* The target plate is no longer drawn on top from here — it is a page of
     * the left column and drawEvidenceScreen owns it. See drawLeftPanel. */
    else drawEvidenceScreen(ui);

    /* The prompts. Each names the button and what it will do — never a bare
     * "PRESS X". */
    if (state === 'WAIT_FOR_TARGET_X') prompt(ui, 'PRESS X TO TRACE THE NETWORK');
    else if (state === 'CABAL_NETWORK_REVEAL' && cabalT > 1.4) prompt(ui, 'PRESS X TO CONTINUE', 0.85);
    else if (state === 'LEVEL_SELECT') {
      prompt(ui, select === 1 ? 'PRESS X TO PLAY LEVEL 02' : 'PRESS X TO REPLAY LEVEL 01');
    } else prompt(ui, 'PRESS X TO SKIP', 0.5);

    /* The bar always names what the button will DO on THIS screen. A stale
     * "SKIP" under a screen whose X continues is the kind of small lie a player
     * stops trusting the whole HUD over. */
    const hints = state === 'LEVEL_SELECT'
      ? [{ icon: 'dpad', label: 'CHOOSE' }, { icon: 'cross', label: 'CONFIRM' }]
      : state === 'WAIT_FOR_TARGET_X'
        ? [{ icon: 'cross', label: 'CONTINUE' },
          /* Circle is whichever door the player came in through. */
          { icon: 'circleBtn', label: fromCabal ? 'BACK TO NETWORK' : 'REPLAY BRIEF' }]
        : state === 'CABAL_NETWORK_REVEAL'
          ? [{ icon: 'cross', label: 'CONTINUE' }]
          : [{ icon: 'cross', label: 'SKIP' }];
    /* The pager is only advertised once there is more than one page to step to.
     * A shoulder hint over a one-page file is an instruction to press a button
     * that does nothing. */
    if (PAGED_STATES.has(state) && panelPages().length > 1) {
      hints.push({ icon: 'bumpers', label: 'L1 / R1  BROWSE FILE' });
      /* …and the action is advertised only on a page that HAS one. A REPLAY
       * legend sitting under an evidence brief is an offer the button will
       * refuse. */
      const { cur } = activePage();
      if (cur?.kind === 'case' && LEVELS[cur.c.level]?.playable) {
        hints.push({ icon: 'triangleBtn', label: `REPLAY ${LEVELS[cur.c.level].code}` });
      }
    }
    if (state === 'CABAL_NETWORK_REVEAL') {
      hints.push({ icon: 'bumpers', label: 'L1 / R1  NETWORK' });
      const node = chainPinned ? AFTERMATH.cabal.chain[chainSel] : null;
      if (node?.key && caseIsOpen(node.key)) {
        hints.push({ icon: 'triangleBtn', label: 'OPEN FILE' });
      }
    }
    ui.drawControlBar(hints);

    ui.drawGrain(0.5);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }

  return {
    /* Called the moment the mission card goes up. `stats` is whatever the level
     * wants to report; this file only passes it through. */
    start(opts = {}) {
      active = true;
      levelId = opts.level ?? 1;
      stats = opts.stats ?? null;
      state = 'MISSION_COMPLETE';
      stateT = 0; bgFade = 0; revealT = 0; cabalT = 0; select = 1; chosen = null;
      page = null; pageFade = 1; hadTarget = false;
      chainSel = 0; chainPinned = false; chainFade = 1; fromCabal = false;
      /* The case the sequence is ABOUT is the one whose mission just ended, and
       * the level it ended on is the only thing that says which. */
      caseId = (CASES.find((c) => c.level === levelId) ?? CASES[0]).id;
      narration.stop();
      traceAudio.reset();
      loadBackground();                          // decodes while the card is read
    },
    stop() { active = false; narration.stop(); traceAudio.hush(0.12); },
    update, draw, press,
    get active() { return active; },
    /* Does this sequence own the frame? The two card states do NOT — the fight's
     * own mission card is still on screen and this waits on it. */
    get owningFrame() { return active && state !== 'MISSION_COMPLETE' && state !== 'WAIT_FOR_X'; },
    /* True once the card has finished animating and the prompt is live. */
    get promptReady() { return active && state === 'WAIT_FOR_X'; },
    get state() { return state; },
    get stats() { return stats; },
    get selection() { return select; },
    get chosen() { return chosen; },
    get backgroundReady() { return bgState === 'ready'; },
    get backgroundState() { return bgState; },
    /* Test surface. `narrationT` is the clock every cue in the sequence is
     * measured against, so a harness can drive the whole thing deterministically
     * by stepping rather than by waiting. */
    get narrationT() { return narration.t; },
    get revealT() { return revealT; },
    get cabalT() { return cabalT; },
    get board() { return BOARD; },
    get beats() { return revealBeats(); },
    /* The left column's pager. `pinned` false means it is still following the
     * read — the distinction a screenshot cannot make and every pager test
     * turns on. */
    get pager() {
      const { pages, idx, cur } = activePage();
      return {
        pinned: page !== null,
        index: idx,
        count: pages.length,
        kind: cur?.kind ?? null,
        id: cur?.kind === 'evidence' ? cur.ev.id
          : cur?.kind === 'case' ? `case:${cur.c.id}` : cur?.kind ?? null,
        fade: +pageFade.toFixed(3),
        ids: pages.map((p) => (p.kind === 'evidence' ? p.ev.id
          : p.kind === 'case' ? `case:${p.c.id}` : 'target')),
      };
    },
    /* The Cabal's cursor, and what the rung under it offers. `openable` is the
     * predicate the action button asks, exposed so a test can prove the button
     * is refused on the four rungs that have no file rather than inferring it
     * from a screenshot of a diagram. */
    get chain() {
      const rungs = AFTERMATH.cabal.chain;
      const node = rungs[chainSel];
      return {
        pinned: chainPinned,
        index: chainSel,
        count: rungs.length,
        key: node?.key ?? null,
        openable: !!(node?.key && caseIsOpen(node.key)),
        openableKeys: rungs.filter((r) => r.key && caseIsOpen(r.key)).map((r) => r.key),
      };
    },
    /* Which file the board is drawing, and how the player got into it. */
    get file() { return { caseId, level: levelId, fromCabal }; },
    get cases() {
      return CASES.map((c) => ({ id: c.id, level: c.level, status: c.status,
        open: caseIsOpen(c.id), playable: !!LEVELS[c.level]?.playable }));
    },
    /* The tracing audio, as numbers.
     *
     * Deliberately COMPACT: the every-beat screenshot walk prints this object on
     * every shot, and the full cue table is thirty entries that turn a readable
     * log into a wall. `heard` is the part a reader wants — which lines sounded,
     * in order — and the table lives one call away in `traceSchedule`. */
    get trace() {
      return {
        heard: traceAudio.heard,
        firedCount: traceAudio.fired.length,
        liveBeds: traceAudio.liveBeds,
      };
    },
    /* The full schedule, for a test that wants to prove the cue times still
     * agree with the line times they were derived from. */
    get traceSchedule() {
      return {
        timing: { ...TRACE, chain: { ...CHAIN } },
        evidence: evidenceCues(),
        cabal: cabalCues(),
        fired: traceAudio.fired,
      };
    },
    setNarrationT(v) { narration.skip(); return v; },
    onMissionCardShown() { /* reserved: the card's own entrance is game.js's */ },
  };
}
