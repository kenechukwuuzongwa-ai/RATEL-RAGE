/* RATEL RAGE — STREETS OF JUSTICE : front end
 *
 * Every screen is built from one UI kit so the main menu's language (smoked
 * glass, thin borders, orange focus, gold information accents) is the same
 * language every other menu speaks.
 *
 * Production assets, not substitutes:
 *   background  frontend/menu/uibg2.mp4     (1264x720, 5.04 s seamless loop)
 *   logo        frontend/ui/ratel-logo.svg  (built from ASSETS/RatelLogo.svg)
 *   character   sprites/darki-idle.png      (6x5 grid of 964x956 cells, 30 frames)
 *   nav forward frontend/audio/forwardSoundmain.mp3
 *   nav back    frontend/audio/Fowardselection sound.mp3   (spelling as supplied)
 *
 * Drawing happens in a fixed 1280x720 virtual space; the canvas backing store
 * is resized to the display so text and hairlines stay crisp at any window
 * size, and is handed back at 1280x720 the moment gameplay takes over.
 */

// The cinematic bars, shared with game.js (request 399): Level 2's screen changes.
import { createBarCut } from './bars.js';

/* START-POINT LINKS (request 486): `?start=strongroom` opens straight into Level 02
 * at the keypad checkpoint — its last arena cleared, a few steps short of the
 * keypad, so walking on plays the whole strong-room scene (the door, the server,
 * the defense) without playing the level through. Optional `&diff=EASY|NORMAL|
 * HARD|ARCADE`. It rides the same handoff CONTINUE and RESTART use (sessionStorage,
 * read once by the boot below and by game.js), never touches saved progress, and
 * strips itself from the address bar so a later reload (QUIT TO MENU) is ordinary. */
const START_POINTS = { strongroom: { level: 2, section: 5, boss: false, mission: 'keypad' } };
try {
  const q = new URLSearchParams(location.search);
  const sp = START_POINTS[(q.get('start') || '').toLowerCase()];
  if (sp) {
    const d = (q.get('diff') || 'NORMAL').toUpperCase();
    sessionStorage.setItem('rorRetryCheckpoint', JSON.stringify(sp));
    sessionStorage.setItem('rorRetryLevel', String(sp.level));
    sessionStorage.setItem('rorRetryDifficulty', ['EASY', 'NORMAL', 'HARD', 'ARCADE'].includes(d) ? d : 'NORMAL');
    sessionStorage.setItem('rorContinue', '1');
    sessionStorage.setItem('rorSkipToGameplay', '1');
    q.delete('start'); q.delete('diff');
    history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash);
  }
} catch {}

const H = 720;
/* FULL-BLEED MOBILE: on a phone wider than 16:9 the front end widens its
 * virtual space to the device aspect (same rule as game.js), so the menus
 * fill the screen instead of letterboxing. Centred layouts stay centred;
 * edge-anchored panels move to the true screen edges. Desktop keeps 1280. */
let W = 1280;
if (/Android/.test(navigator.userAgent)) {
  const sw = Math.max(window.screen.width || 0, window.screen.height || 0);
  const sh = Math.min(window.screen.width || 0, window.screen.height || 0);
  if (sw && sh && sw / sh > 16 / 9 + 0.01) {
    W = Math.min(2200, Math.round((H * (sw / sh)) / 2) * 2);
  }
}

/* ---------------------------------------------------------------- palette */

const C = {
  ink: '#05070b',
  glass: 'rgba(9, 13, 20, 0.72)',
  glassLift: 'rgba(20, 27, 40, 0.55)',
  edge: 'rgba(150, 176, 214, 0.16)',
  edgeSoft: 'rgba(150, 176, 214, 0.09)',
  paper: '#e9ecf1',
  text: '#c3cad6',
  muted: '#79828f',
  dim: '#4d545e',
  gold: '#e9b654',           // information accent
  orange: '#ff7a1f',         // interactive accent — focus only
  orangeSoft: '#ffa04d',
  cream: '#ffe6bf',
  red: '#e0432c',            // alerts only
  green: '#5fb87e',
};

/* ----------------------------------------------------------------- layout
 * Measured off the supplied reference mockup (1672x941) and divided by
 * 1.30625 to land in the 1280x720 virtual space. The mockup scales uniformly
 * (1280/1672 = 720/941), so one factor covers both axes.
 */

/* `panel`, `level` and `utility` are gone — the container card behind the menu
 * list, the LEVEL 01 card and the four-icon pill were all removed by request.
 * The rows' x/y were always absolute rather than derived from the panel, which
 * is why nothing had to be re-measured when it went. */
const L = {
  btn: { x: 47, w: 311 },
  start: { y: 172, h: 54 },
  rows: { y: 231, h: 42, pitch: 45.5 },
  logo: { x: 50, base: 96, cap: 37, width: 309 },
  tagline: { x: 51, y: 120 },
  locale: { x: 51, y: 143 },
  profile: { x: 969, y: 21, w: 288, h: 86 },
  barY: 664,
  hintY: 690,
  /* No `h` on purpose — see GROUND below. Height follows the feet.
   * `scale` is a DELIBERATE override of that rule; it exists so the placement
   * handle (__rorMenu.darki) can size him by eye, and anything other than 1
   * means the figure no longer matches the bystanders on the plate.
   * `flip` is -1 to mirror him horizontally about his own centre.
   *
   * THIS IS A PLACED VALUE, NOT A DERIVED ONE — set by eye with the F9 tool and
   * baked here on request. Do not "correct" it back to the ground-plane answer:
   * feet 683 puts him 337 px below the horizon, so GROUND says 400 px tall and
   * the 0.92 draws him at 368 — 8% short of the plate's own perspective, chosen
   * because the crouched idle reads too big at the honest height. Re-measuring
   * GROUND is a reason to revisit this; tidying is not. */
  darki: { cx: 777.1, feet: 683, scale: 0.92, flip: 1 },
};

/* How tall a person is on the menu plate.
 *
 * This was a taste value (440-470 px of a 720 px frame) and it should never
 * have been one. `frontend/menu/uibg2.mp4` is a real Lagos street with real
 * people standing on a real ground plane, and under a pinhole camera a figure
 * standing on that plane has exactly ONE correct height for where its feet are:
 * height is proportional to (feet - horizon). Two figures fix both constants.
 *
 * Measured off `uibg-frame.png` — the undarkened, unblurred plate written by
 * `_chromakey/titleshot.js` at the size the menu composites it, because the
 * finished screens have a wash, a vignette and a blur over the evidence:
 *
 *   pedestrian by the danfo   feet y=460   135 px tall
 *   pedestrian right forecourt feet y=540   230 px tall
 *
 *   230/135 = (540 - y0)/(460 - y0)  ->  y0 = 346   (the skyline sits ~300, so
 *   a 346 horizon is the right order and the fit is honest)
 *   k = 135 / (460 - 346) = 1.187
 *
 * At Darki's feet (y=628) that is 335 px, against the 440 he was drawn at — he
 * was very nearly twice a bystander's height, which is what "he looks pasted
 * on" actually was. His idle is a CROUCHED fighting stance, so matching a
 * standing bystander's height while crouched still leaves him the biggest man
 * on the street; it just stops him being a giant.
 *
 * Screens may still pass an explicit `h` to break the rule deliberately. None
 * currently do — one figure, one scale.
 */
const GROUND = { horizon: 346, k: 1.187 };
const figureH = (feet) => GROUND.k * (feet - GROUND.horizon);

/* ---------------------------------------------------------------- THE FONT
 *
 * ONE family, everywhere: Montserrat, self-hosted (see the @font-face block in
 * styles.css for why it is not on a CDN). Exported so game.js and aftermath.js
 * name the same string — this used to be three different stacks copy-pasted
 * across 190 call sites, and a font change meant finding all of them.
 *
 * IT REPLACED IMPACT, AND IMPACT IS CONDENSED. The same string at the same px
 * is roughly 30-40% WIDER in Montserrat, so display sizes that were tuned
 * against Impact's narrow face have been re-tuned rather than carried over —
 * see DISPLAY_FIT below and the sizes at each headline call site.
 *
 * The FALLBACK IS DELIBERATELY A NORMAL SANS, not Impact. If Montserrat fails
 * to load, wide-set text at the retuned sizes must degrade to something with
 * similar metrics; falling back to a condensed face would leave every headline
 * looking under-set at half the tracking it was drawn for. `fontState()` says
 * which one is actually in use — never guess from a screenshot.
 */
export const FONT = 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
/* The two debug overlays (F9 placement tool, execDebug) stay monospace on
 * purpose: they print columns of numbers, and column alignment is the entire
 * reason a reader can scan them. Neither is ever on screen for a player. */
export const FONT_MONO = 'ui-monospace, Menlo, Consolas, monospace';

/* The Impact -> Montserrat conversion, as data, so game.js's HUD applies the
 * identical one. Both numbers are explained at setDisplay(); re-tune THERE and
 * re-shoot, never per call site. */
export const DISPLAY_FIT = { size: 0.86, track: 0.5 };

/* The supplied logo — RATEL in white, RAGE in red, with the ratel and the grass
 * punched out of the letterforms as NEGATIVE SPACE (so whatever is behind the
 * mark shows through them; that is the design, not a missing fill).
 *
 * `aspect` is measured, not read off the artboard: the Illustrator export wraps
 * the mark in a viewBox nearly four times its size, so _chromakey/logo_build.js
 * strips the backdrop rect, retightens the viewBox to the ink and prints this
 * number. Re-run it if the logo is ever re-exported. Height ALWAYS follows the
 * width through here, so no call site can stretch the art by setting one axis.
 *
 * `sinkFrac` exists only for the fallback wordmark: that one is laid out from a
 * type BASELINE, and its accent slash overshoots ~6 px below it at 309 px wide.
 * Screens ask for a bottom edge, so the fallback subtracts this to recover the
 * baseline it wants and lands its ink where the art's ink would have been.
 */
const LOGO_ART = {
  src: '../frontend/ui/ratel-logo.svg',
  aspect: 4.4826,
  sinkFrac: 6 / 309,
  raster: 1024,          // baked once at this width; the title draws 664 (a downscale)
};

/* The supplied RatelLogo — the full lockup, ratel and all — and it belongs to
 * the TITLE SCREEN ONLY.
 *
 * The wordmark above stays where it is on the main menu's header strip and the
 * credits card, and that is not an oversight. This mark is 1.86:1 against the
 * wordmark's 4.48:1, so at the 292 px the menu header draws it would stand
 * 157 px tall in a strip built for 65 — it would not be a logo swap there, it
 * would be a redesign of two other screens the brief does not mention.
 *
 * Built by _chromakey/titlelogo_prep.js, which is also where the numbers come
 * from. The delivered file is opaque with a black card behind the art, so the
 * prep feathers that card outward instead of keying it (keying deletes the
 * ratel — its body is black too, and connected to the card). That leaves an
 * image WIDER than the mark, hence `inkFrac`: the layout below positions the
 * INK, which is what the reference frame was measured in, and the soft padding
 * takes care of itself because it is symmetric.
 */
const TITLE_ART = {
  src: '../frontend/ui/ratel-logo-title.png',
  aspect: 1.3849,        // of the whole padded image
  inkFrac: 0.6022,       // ink width / image width
  inkAspect: 1.8569,     // of the mark itself
};

/* THE MENU FIGURE IS THE ARMED IDLE — Darki standing with his bat.
 *
 * He was drawn here on `sprites/darki-idle.png`, his UNARMED idle, which is the
 * sheet the game fights on. The menu is a poster, not a fight: he is supposed to
 * be visibly carrying the bat. Same performance, same costume, same 26-frame
 * breathing loop, re-rendered with the weapon — so this is a sheet swap, and
 * NOTHING in game.js changes. Darki's gameplay logic still runs off his own
 * sheets (and off `darki-idle-mobile.png` on Android); the menu is the only
 * thing pointed at this file.
 *
 * IT IS ALSO 1.6 MB AGAINST 14.5 MB. The unarmed sheet is 5784x4780 and the menu
 * was loading all of it to draw one figure and crop one 176px face. This one is
 * 3072x2540 for the same 26 frames, which matters most on Android where the menu
 * is the first thing that has to appear.
 *
 * EVERY NUMBER BELOW IS MEASURED by `_chromakey/_darkiarmedmeasure.js`, which
 * runs the identical code over the OLD sheet first as a control and has to
 * reproduce its published values (it returns x 25..667, y0 276, footY 890
 * against the 26 / 666 / 276 / 889 that were here — within a pixel, so the
 * method is the one these were measured with).
 *
 * x0/x1 are the FULL opaque box, which is this file's existing convention and
 * which is safe here despite the bat: he holds it across himself at waist
 * height and it reaches barely past his own arms, so the box grows 22 px left
 * and 16 px right of his body. His centre as a fraction of the cell comes out
 * at 0.358 against the unarmed sheet's 0.359 — which is why `L.darki.cx` is
 * untouched and he does not move when the sheets swap.
 */
/* THE BETTER-GRIP TAKE (request 294). Two exports of this idle exist and they
 * are easy to confuse: `darki_armed_darki_idle_512x508_sheet` (lowercase,
 * Sep 30 — his right hand floats behind the end of the bat) and
 * `Darki-armed-darki_idle_512x508_sheet` (capital D, Oct 1 — the hand closes
 * round it). This is the second, byte-for-byte. It measures IDENTICALLY to the
 * first in `_darkiarmedmeasure.js` — same 26 frames, full box x 14..353,
 * y 148..469 — so every number below still holds and he does not move.
 * A NEW FILENAME on purpose, not an overwrite: a phone that cached the old
 * image under the old URL cannot keep showing it. */
const IDLE = {
  src: '../sprites/darki-armed-idle-grip.png',
  fw: 512, fh: 508, cols: 6,
  /* 26 FRAMES IN A 30-CELL GRID. 6x5 is the layout; cells 26-29 are EMPTY and
   * `frames` is the count that may be played — the two are not the same number
   * and nothing here may assume cols*rows. Confirmed empty on THIS sheet, not
   * assumed from the old one.
   *
   * History, because it will come back if a sheet is ever re-exported: the old
   * unarmed sheet's first frames came out of `_chromakey/recolor-idle.js` far
   * brighter than the rest — frame 0 at +9.42 over the median, a 10.36 spread
   * and a +8.56 loop seam, which read on screen as a bright flash once per
   * breathing cycle. The four hot frames were cut by hand, which is why that
   * sheet also ran 26-of-30. THIS sheet was checked for the same fault before
   * it was wired in and is clean: spread 1.92, frame 0 at +0.18, seam +0.49.
   *
   * Re-run that check after ANY change to this sheet, and check for empty cells
   * too — playing to 29 would draw four blanks, 267 ms of no character every
   * 1.93 s, and a brightness number will never tell you that. */
  frames: 26,
  fps: 15,                       // the game plays its calm idle at half of 30
  x0: 14, x1: 353, y0: 148, footY: 469,
  /* Portrait crop for the profile card. `frame` because x and y are offsets
   * inside a CELL, not into the sheet — read as sheet coordinates this lands in
   * whichever frame happens to sit at the top-left, which is how the avatar came
   * to be cut out of the flashing frame before the cut above.
   *
   * Re-framed for this sheet rather than scaled from the old one: the obvious
   * derivation (match the head's centre of mass) does not work on either sheet,
   * because the top of his silhouette is a raised SHOULDER in this crouched
   * stance, not his head — the old published crop sits 106 px off that centre.
   * Read off `_chromakey/_darkiarmed_ruler.png` instead and checked against the
   * old avatar side by side in `_darki_avatar_try.png`. */
  head: { frame: 0, x: 228, y: 138, w: 100, h: 100 },
};

/* CONTINUE (request 482): the saved progress's latest checkpoint (progress.js
 * writes it at every gate, the boss room and Level 02's strong room, and clears
 * it when a level is completed). With none, the row stays disabled. */
const continuePoint = () => {
  try {
    const cp = window.RRProgress?.get()?.checkpoint;
    return cp && cp.level >= 1 && cp.level <= 2 && (cp.section > 0 || cp.boss || cp.mission) ? cp : null;
  } catch { return null; }
};
const MAIN_ITEMS = [
  { label: 'START GAME', icon: 'play' },
  { label: 'CONTINUE', icon: 'restore', get disabled() { return !continuePoint(); }, note: 'NO SAVE DATA' },
  { label: 'LEVEL SELECT', icon: 'map' },
  { label: 'CHARACTERS', icon: 'person' },
  { label: 'SHOP', icon: 'cart' },
  { label: 'CONTROLS', icon: 'pad' },
  { label: 'OPTIONS', icon: 'gear' },
  { label: 'EXTRAS', icon: 'star' },
  { label: 'CREDITS', icon: 'users' },
  { label: 'QUIT GAME', icon: 'power' },
];

const SETTINGS_DEFAULTS = {
  master: 0.85, music: 0.70, sfx: 0.85, voice: 1, ambience: 0.55,
  subtitles: true, subtitleSize: 1, highContrast: false, screenShake: true,
  crt: false, tutorialHints: true, vibration: true, damageIndicators: true,
  comboAssist: true,
};

/* THE LEVEL 1 INTRO NARRATION, word for word (request 337 — the old table was a
 * paraphrase: "Drivers pay.", "Attack." — none of which is said). Transcribed
 * from frontend/audio/level1-voiceover.mp3 (the clip the intro clock reads) with
 * Whisper-small; every phrase's start and end taken off the clip's own
 * waveform and the word stamps refitted inside it, as for the boss line in
 * game.js. Seconds from the clip's first sample. */
const INTRO_SUBS = [
  { at: 0.26, end: 4.28, words: [['In', 0.26], ['the', 0.39], ['streets', 0.65], ['of', 0.88], ['Lagos,', 1.14], ['survival', 2.54], ['has', 2.98], ['a', 3.14], ['price.', 3.40]] },
  { at: 5.20, end: 9.82, words: [['Every', 5.20], ['bus,', 5.57], ['every', 6.78], ['shop,', 7.16], ['every', 8.24], ['honest', 8.77], ['worker,', 9.28]] },
  { at: 10.62, end: 14.04, words: [['forced', 10.62], ['to', 10.95], ['pay', 11.18], ['those', 11.53], ['who', 11.84], ['claim', 12.33], ['to', 12.58], ['own', 12.85], ['the', 13.13], ['streets.', 13.46]] },
  { at: 14.94, end: 16.73, words: [['Their', 14.94], ['collections', 15.39], ['travel', 15.92], ['upward', 16.41]] },
  { at: 16.73, end: 18.98, words: [['from', 16.73], ['the', 16.93], ['street', 17.18], ['thugs', 17.51], ['to', 17.93], ['their', 18.10], ['bosses,', 18.57]] },
  { at: 19.78, end: 23.56, words: [['and', 19.78], ['from', 19.94], ['the', 20.08], ['bosses', 20.43], ['to', 20.73], ['a', 20.94], ['system', 21.17], ['built', 21.52], ['on', 21.80], ['fear', 22.19], ['and', 22.49], ['corruption.', 22.98]] },
  { at: 24.56, end: 27.20, words: [['But', 24.56], ['one', 24.84], ['man', 25.17], ['refuses', 25.75], ['to', 26.21], ['pay.', 26.49]] },
  { at: 28.18, end: 28.80, words: [['Darki.', 28.18]] },
  { at: 29.66, end: 31.86, words: [['Tonight,', 29.66], ['he', 30.27], ['starts', 30.60], ['at', 30.85], ['the', 30.93], ['bottom.', 31.26]] },
  { at: 32.74, end: 35.06, words: [['Olodo', 32.74], ['controls', 33.72], ['this', 34.02], ['street.', 34.37]] },
  { at: 35.60, end: 36.30, words: [['Stop', 35.60], ['him.', 36.16]] },
];

/* LEVEL 2'S INTRO (request 399). LEVEL 2 INTRO.mp4 carries its own narration
 * (Darki, first person) and has NO burned-in subtitles — checked frame by
 * frame — so these are drawn in the same subtitle style as Level 1's. Made the
 * way INTRO_SUBS was: Whisper-small word stamps off the video's own audio track
 * (decoded in Chrome, _chromakey/req399/decodevid.js + stt.mjs), each line's
 * start refitted to the clip's voiced runs (20 ms RMS, req399/runs.js), and the
 * names spelled as the video itself spells them on screen: "Moshun Jimoh",
 * "AHMAD AKANDE MURDER CASE" (Whisper heard "Oloto", "Amada Konde", "a lodo").
 * Seconds on the VIDEO's clock — the clip is both the picture and the voice. */
const INTRO_SUBS_L2 = [
  { at: 0.22, end: 2.86, words: [["I", 0.22], ["thought", 0.34], ["taking", 0.72], ["down", 1.58], ["MC", 1.84], ["Olodo", 2.26], ["would", 2.48]] },
  { at: 2.86, end: 5.40, words: [["expose", 2.86], ["the", 3.38], ["man", 3.74], ["controlling", 4.02], ["the", 4.64], ["streets.", 4.98]] },
  { at: 6.24, end: 7.84, words: [["But", 6.24], ["the", 6.40], ["evidence", 6.58], ["I", 6.94], ["recovered", 7.22]] },
  { at: 7.84, end: 9.56, words: [["revealed", 7.84], ["something", 8.34], ["bigger.", 8.94]] },
  { at: 10.60, end: 13.08, words: [["Buried", 10.60], ["in", 10.80], ["Olodo’s", 10.96], ["phone", 11.58], ["was", 11.96], ["a", 12.48], ["name.", 12.68]] },
  { at: 13.68, end: 15.80, words: [["AIG.", 13.68], ["Moshun Jimoh.", 14.74]] },
  { at: 16.28, end: 18.44, words: [["Alongside", 16.28], ["it", 16.98], ["were", 17.18], ["coded", 17.40], ["payments", 17.76]] },
  { at: 18.44, end: 19.90, words: [["and", 18.44], ["a", 18.90], ["case", 19.04], ["reference.", 19.36]] },
  { at: 20.34, end: 22.32, words: [["The", 20.34], ["Ahmad", 20.34], ["Akande", 20.92], ["murder", 21.36], ["case.", 21.74]] },
  { at: 23.26, end: 24.28, words: [["Two", 23.26], ["men", 23.38], ["are", 23.64], ["dead.", 23.84]] },
  { at: 25.02, end: 26.68, words: [["One", 25.02], ["man", 25.20], ["stands", 25.54], ["accused.", 26.08]] },
  { at: 27.70, end: 28.30, words: [["And", 27.70], ["now,", 27.84]] },
  { at: 28.96, end: 31.22, words: [["the", 28.96], ["same", 29.06], ["name", 29.42], ["has", 29.80], ["surfaced", 30.02], ["in", 30.52], ["another", 30.84]] },
  { at: 31.22, end: 35.24, words: [["controversy", 31.22], ["involving", 31.94], ["allegations", 32.66], ["of", 33.56], ["compromised", 33.94], ["evidence.", 34.50]] },
  { at: 36.22, end: 36.92, words: [["Then", 36.22], ["tonight,", 36.40]] },
  { at: 37.70, end: 38.96, words: [["I", 37.70], ["got", 37.82], ["new", 38.04], ["intel.", 38.38]] },
  { at: 39.86, end: 41.12, words: [["My", 39.86], ["source", 40.04], ["says,", 40.42]] },
  { at: 41.56, end: 43.84, words: [["“Moshun", 41.56], ["Jimoh", 42.12], ["has", 42.60], ["ordered", 42.88], ["his", 43.24], ["boys", 43.52]] },
  { at: 43.84, end: 46.56, words: [["to", 43.84], ["destroy", 44.18], ["evidence", 44.66], ["connected", 45.22], ["to", 45.78], ["the", 46.14], ["case", 46.28]] },
  { at: 46.56, end: 48.00, words: [["before", 46.56], ["the", 47.10], ["court", 47.34], ["hearing.", 47.58]] },
  { at: 48.88, end: 49.92, words: [["If", 48.88], ["they’re", 49.06], ["successful,", 49.36]] },
  { at: 50.34, end: 51.58, words: [["the", 50.34], ["truth", 50.40], ["could", 50.64], ["disappear", 50.92]] },
  { at: 51.58, end: 54.42, words: [["and", 51.58], ["an", 52.18], ["innocent", 52.34], ["man", 52.72], ["could", 53.18], ["lose", 53.46], ["everything.”", 53.80]] },
  { at: 55.28, end: 57.14, words: [["I", 55.28], ["found", 55.38], ["the", 55.66], ["trail", 56.22], ["through", 56.62], ["Olodo.", 56.80]] },
  { at: 58.02, end: 61.08, words: [["Now", 58.02], ["I’m", 58.28], ["following", 58.60], ["it", 58.98], ["straight", 59.28], ["into", 59.62], ["the", 59.94], ["police", 60.14], ["station.", 60.46]] },
  { at: 61.92, end: 64.60, words: [["Tonight,", 61.92], ["I’m", 62.92], ["going", 63.16], ["in", 63.46], ["for", 63.68], ["the", 63.88], ["evidence.", 64.08]] },
];

/* ONE SUBTITLE STYLE for every spoken line in the game (the intro narration
 * here, MC_Olodo's stand-off line in game.js): a column of lines that scrolls
 * up inside a clipped band — the line being said rises into the centre row,
 * the one before it scrolls up and out under the band's top edge, a line is
 * never shown before it starts, and each word lights as it is spoken.
 *
 *   lines  [{ at, end, words: [[text, at], ...] }]   seconds on the voice clock
 *   t      seconds on that clock
 *   band   { x, y, w, h } — the clip; the current line is centred in it
 *   o      { font, lineH, alpha?, maskPad?, cy? } — cy: the current line's row (default: band centre)
 * Returns false when there is nothing to draw (before the first line, or after
 * the last has faded), so callers can skip their own furniture with it. */
export const SUB_SCROLL = { lead: 0.22, scroll: 0.30, linger: 0.7, fade: 0.4 };
/* KEEP A MUSIC BED ALIVE (request 347). The menu ambience and the level music
 * are <audio> elements that were only ever told to play at the moment a screen
 * or a fight began. On Android the WebView pauses them behind our back — the
 * app sent to the background, a notification taking audio focus, a media stall
 * — and nothing ever asked again, so the music "just disappeared". Called once
 * a frame by each owner with whether that bed SHOULD be sounding:
 *   paused while wanted  -> play() again, at most once a second;
 *   playing but its clock frozen for 4 s (a stalled stream) -> reload in place.
 * `st` is the caller's own small state object. Nothing happens while the page
 * is hidden: the OS is entitled to silence a backgrounded app. */
export function keepMediaAlive(el, st, dt, wanted) {
  if (!el || !wanted || document.visibilityState === 'hidden') { st.stuckT = 0; st.lastT = null; return null; }
  st.retryT = (st.retryT ?? 0) - dt;
  if (el.ended && !el.loop) return null;   // a playlist's 'ended' handler moves it on, not us
  if (el.paused || el.error) {
    st.stuckT = 0;
    if (st.retryT > 0) return null;
    st.retryT = 1;
    if (el.error) el.load();
    const p = el.play();
    if (p?.catch) p.catch(() => {});
    return 'resumed';
  }
  const t = el.currentTime;
  st.stuckT = st.lastT != null && Math.abs(t - st.lastT) < 1e-3 && !el.ended ? (st.stuckT ?? 0) + dt : 0;
  st.lastT = t;
  if (st.stuckT < 4 || st.retryT > 0) return null;
  st.stuckT = 0;
  st.retryT = 2;
  el.addEventListener('loadedmetadata', () => { try { el.currentTime = t; } catch {} }, { once: true });
  el.load();
  const p = el.play();
  if (p?.catch) p.catch(() => {});
  return 'reloaded';
}

/* DOUBLE TAP TO SKIP (request 349). One tap on a video or the narrated entry
 * never skips any more: it was waking a dimmed phone, or a thumb resting on the
 * glass, and it threw away the one place the game explains itself. Two taps
 * inside `window` seconds do, but only from `hintAt` on, the moment the hint
 * saying so appears (it also stops a tap aimed at the screen before from
 * counting). Shared by the studio splash, the story intro and Level 1's
 * opening voice-over. */
export const SKIP_TAP = { window: 0.65, hintAt: 3.0, fade: 0.6, text: 'Double tap screen to skip.' };
export function makeDoubleTap() {
  let last = -Infinity;
  return {
    /** A tap at `now` (s). True when it completes a double tap. */
    tap(now = performance.now() / 1000) {
      if (now - last <= SKIP_TAP.window) { last = -Infinity; return true; }
      last = now;
      return false;
    },
    reset() { last = -Infinity; },
  };
}
/* The hint, top-right, from `hintAt` seconds into the video or the line,
 * fading in. `y` is its baseline row; `panel` puts a dark pill behind it for
 * screens with no bar of their own (the full-frame splash clip). */
export function drawSkipHint(ctx, W, t, y = 28, panel = false) {
  if (!(t >= SKIP_TAP.hintAt)) return;
  const a = Math.min(1, (t - SKIP_TAP.hintAt) / SKIP_TAP.fade);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `600 15px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const x = W - 28;
  if (panel) {
    const w = ctx.measureText(SKIP_TAP.text).width + 28;
    ctx.fillStyle = 'rgba(4,6,9,0.62)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w + 14, y - 15, w, 30, 15); else ctx.rect(x - w + 14, y - 15, w, 30);
    ctx.fill();
  }
  ctx.fillStyle = '#f4f1e8';
  ctx.fillText(SKIP_TAP.text, x, y);
  ctx.restore();
}

/* THE TAP CUE (request 353) — drawn in code; the reference clip is never
 * loaded. That MP4 was measured frame by frame for its MOTION only (see
 * _chromakey/req353*): an element just under half the frame wide, centred, on a
 * fast 0.4 s beat whose every cycle opens with a hard near-BLACK impact frame,
 * then blooms a ring out and settles, while a caption line fades in a few
 * frames LATER than the ring. Impact first, flourish second, words last.
 *
 * Ours keeps that order at a tempo a player can read — two taps (it IS a double
 * tap) and then a rest, the press snapping in fast and easing back out, the
 * ripple blooming slowest of all — and it arrives with the top-right hint it
 * belongs to. It sits LOWER-CENTRE on every screen the player can skip out of
 * (studio splash, story intro, Level 1's narrated entry); `inset` is how far up
 * that screen's own furniture reaches, so it never sits on a subtitle band or a
 * letterbox bar. `since` (seconds after the player's own skip landed) runs the
 * motion the other way: one burst, the caption crossing from the instruction to
 * SKIPPING, and the plate lifting away. */
export const TAP_CUE = {
  loop: 1.5,                        // one two-beat cycle
  gap: 0.22,                        // the second tap of the double
  press: 0.13,                      // a press reaches full here…
  rest: 0.42,                       // …and leaves no trace by here
  ripple: 0.62,                     // a ripple's life — the slowest of the three
  out: 0.5,                         // the confirm animation's length
  text: 'DOUBLE TAP TO SKIP',
  done: 'SKIPPING',
};
const easeOut3 = (v) => 1 - Math.pow(1 - v, 3);
/* Where the cue last drew, for the harness (request 353): its rect, its beat
 * pulse and whether it is on screen at all. Mutated in place, never allocated,
 * so reading it costs nothing. */
export const tapCueState = { drawn: false, x: 0, y: 0, w: 0, h: 0, pulse: 0, t: 0, since: null, alpha: 0, text: '' };
/* The same element serves the title's TAP TO ENTER (request 357), where ONE tap
 * enters: `text` is its caption, `taps: 1` beats once per cycle, `hintAt` is when
 * it arrives on that screen's clock and `cy` pins its centre to the prompt row. */
export function drawTapCue(ctx, W, H, t, o = {}) {
  /* The clock is recorded even when the cue is hidden, so a reader can always
   * tell "not yet" from "not any more" rather than reading a stale number. */
  tapCueState.t = t;
  const hintAt = o.hintAt ?? SKIP_TAP.hintAt;
  const text = o.text ?? TAP_CUE.text;
  if (!(t >= hintAt)) { tapCueState.drawn = false; return; }
  const since = o.since ?? null;
  const u = since == null ? 0 : Math.min(1, since / TAP_CUE.out);
  tapCueState.since = since;
  if (since != null && u >= 1) { tapCueState.drawn = false; return; }
  const arrival = Math.min(1, (t - hintAt) / SKIP_TAP.fade);
  /* Each of the cycle's taps has its own age (s since it landed); a tap
   * older than `rest` has nothing left to show. */
  const ages = (o.taps === 1 ? [0] : [0, 1]).map((k) => {
    const p = (t - k * TAP_CUE.gap) % TAP_CUE.loop;
    return p < 0 ? p + TAP_CUE.loop : p;
  });
  const pulse = Math.max(...ages.map((a) => Math.max(0, 1 - a / TAP_CUE.rest)));
  const newest = Math.min(...ages);

  ctx.save();
  ctx.font = `700 15px ${FONT}`;
  const textW = Math.max(ctx.measureText(text).width, ctx.measureText(TAP_CUE.done).width);
  const pad = 17, glyphW = 52, h = 58;
  const w = Math.round(pad * 2 + glyphW + textW);
  const cy = Math.round((o.cy ?? H - (o.inset ?? 56) - h / 2) - (since == null ? 0 : easeOut3(u) * 12));
  const x = Math.round((W - w) / 2), y = cy - Math.round(h / 2);
  const alpha = arrival * (since == null ? 1 : 1 - easeOut3(u));
  tapCueState.drawn = true; tapCueState.x = x; tapCueState.y = y;
  tapCueState.w = w; tapCueState.h = h; tapCueState.pulse = pulse;
  tapCueState.t = t; tapCueState.since = since; tapCueState.alpha = alpha;
  tapCueState.text = since == null ? text : TAP_CUE.done;

  /* THE PLATE: the same dark glass and hairline gold the game's other panels
   * use, so the cue reads as part of the HUD and not as a video overlay. */
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2); else ctx.rect(x, y, w, h);
  ctx.fillStyle = 'rgba(4,6,9,0.74)';
  ctx.fill();
  ctx.strokeStyle = `rgba(233,182,84,${0.22 + 0.10 * pulse})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  /* THE GLYPH. The ring is the screen ("tap here"); the fingertip dips and
   * settles; a ripple leaves on each tap, the second one behind the first —
   * that pair IS the double tap, and it is why the plate can say so little. */
  const gx = x + pad + glyphW / 2, gy = cy;
  ctx.strokeStyle = 'rgba(244,241,232,0.20)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(gx, gy, 17, 0, Math.PI * 2);
  ctx.stroke();
  for (const a of ages) {
    if (a >= TAP_CUE.ripple) continue;
    const k = a / TAP_CUE.ripple;
    ctx.strokeStyle = `rgba(255,214,140,${(0.55 * Math.pow(1 - k, 1.7)).toFixed(3)})`;
    ctx.lineWidth = 0.6 + 2.4 * (1 - k);
    ctx.beginPath();
    ctx.arc(gx, gy, 10 + 26 * easeOut3(k), 0, Math.PI * 2);
    ctx.stroke();
  }
  /* …and on a confirmed skip the two become one burst, outward and gone. */
  if (since != null) {
    ctx.strokeStyle = `rgba(255,214,140,${(0.60 * (1 - u)).toFixed(3)})`;
    ctx.lineWidth = 0.6 + 2.6 * (1 - u);
    ctx.beginPath();
    ctx.arc(gx, gy, 17 + 36 * easeOut3(u), 0, Math.PI * 2);
    ctx.stroke();
  }
  const ps = newest < TAP_CUE.press ? 0.80 + 0.20 * easeOut3(newest / TAP_CUE.press) : 1;
  ctx.fillStyle = `rgba(255,226,160,${(0.76 + 0.24 * pulse).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(gx, gy + (1 - ps) * 9, 7.4 * ps, 0, Math.PI * 2);
  ctx.fill();

  /* THE WORDS, last — as in the reference, where the caption trails the ring.
   * They warm on each tap, and on the confirm they cross from the instruction
   * to SKIPPING inside the same slot, so the plate never changes size. */
  const tx = x + pad + glyphW;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (since == null) {
    const mix = (a, b) => Math.round(a + (b - a) * pulse);
    ctx.fillStyle = `rgb(${mix(230, 255)},${mix(226, 240)},${mix(212, 202)})`;
    ctx.fillText(text, tx, cy + 0.5);
  } else {
    const cross = Math.min(1, u * 2.2);
    ctx.fillStyle = `rgba(244,241,232,${(1 - cross).toFixed(3)})`;
    ctx.fillText(text, tx, cy + 0.5);
    ctx.fillStyle = `rgba(255,214,140,${cross.toFixed(3)})`;
    ctx.fillText(TAP_CUE.done, tx, cy + 0.5);
  }
  ctx.restore();
}

/* NO DIMMING DURING THE VIDEOS (request 349). Each caller names its reason
 * ('video' for the splash and story intro, 'entry' for Level 1's narrated
 * entry); the screen stays on while ANY reason holds. In the app that is the
 * native FLAG_KEEP_SCREEN_ON via window.RatelHost.keepScreenOn; in a browser,
 * the Screen Wake Lock API where it exists. Cheap to call every frame: it only
 * acts when the answer changes. */
const awakeReasons = new Set();
let awakeOn = false, wakeLock = null;
export function keepAwake(reason, on) {
  if (on) awakeReasons.add(reason); else awakeReasons.delete(reason);
  const want = awakeReasons.size > 0;
  if (want === awakeOn) return;
  awakeOn = want;
  try {
    if (window.RatelHost?.keepScreenOn) { window.RatelHost.keepScreenOn(want); return; }
  } catch {}
  if (want) {
    navigator.wakeLock?.request?.('screen').then((l) => { wakeLock = l; if (!awakeOn) l.release(); }).catch(() => {});
  } else if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

/* …AND HOLD A WEB AUDIO CONTEXT RUNNING (request 348). A phone can suspend or
 * interrupt one at any time; every sound on it then stops while <audio> music
 * plays on. 'suspended' AND 'interrupted' are both resumed (the old recovery
 * only knew the first, and only on a press), at most twice a second, never while
 * the page is hidden. Returns true on the frames it asked. */
export function keepContextAlive(ac, st, dt) {
  if (!ac || document.visibilityState === 'hidden') return false;
  if (ac.state === 'running' || ac.state === 'closed') { st.retryT = 0; return false; }
  // Before the first real gesture the browser refuses anyway; the first press resumes it.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
  st.retryT = (st.retryT ?? 0) - dt;
  if (st.retryT > 0) return false;
  st.retryT = 0.5;
  ac.resume().catch(() => {});
  return true;
}

export function drawSubtitleScroll(ctx, lines, t, band, o) {
  const S = SUB_SCROLL, last = lines[lines.length - 1];
  const fade = 1 - Math.max(0, Math.min(1, (t - last.end - S.linger) / S.fade));
  if (fade <= 0 || t < lines[0].at - S.lead) return false;
  let p = 0;                                          // continuous scroll position
  for (let i = 1; i < lines.length; i++) {
    const u = Math.max(0, Math.min(1, (t - (lines[i].at - S.lead)) / S.scroll));
    p += u * u * (3 - 2 * u);
  }
  const pad = o.maskPad ?? 4, cy = o.cy ?? band.y + band.h / 2, alpha = (o.alpha ?? 1) * fade;
  ctx.save();
  ctx.beginPath();
  ctx.rect(band.x, band.y + pad, band.w, band.h - pad);
  ctx.clip();
  ctx.font = o.font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const space = ctx.measureText(' ').width;
  const now = Math.round(p);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (t < line.at - S.lead) continue;                // never shown before it starts to rise
    const y = cy + (i - p) * o.lineH;
    if (y < band.y - o.lineH || y > band.y + band.h + o.lineH) continue;
    const widths = line.words.map(([w]) => ctx.measureText(w).width);
    let x = band.x + band.w / 2 - (widths.reduce((a, b) => a + b, 0) + space * (widths.length - 1)) / 2;
    const said = i < now;                              // scrolled past: dimmed
    line.words.forEach(([w, at], k) => {
      const lit = said || t >= at;
      ctx.globalAlpha = alpha * (said ? 0.5 : lit ? 1 : 0.32);
      ctx.fillStyle = lit && !said ? '#ffffff' : '#cfd8ea';
      ctx.fillText(w, x, y);
      x += widths[k] + space;
    });
  }
  ctx.restore();
  return true;
}

/* The Level 01 case file — the last screen before the fight.
 *
 * Copy is the supplied briefing sheet verbatim, with two deliberate departures.
 * The reference's profile table gives OCCUPATION the same value as ALIAS, so the
 * duplicate row is dropped rather than reproduced; and the labels are shortened
 * to <=11 characters because the table is 328 px wide here against 470 in a
 * 1598 px mockup, and a label column wide enough for "POLITICAL ROLE" is a
 * column stolen from the values.
 *
 * Kept as data, not draw calls, so the screen is a layout and the writing can
 * be edited without touching a single coordinate.
 *
 * KEYED BY LEVEL. It was one object while there was one level, and "play
 * LEVEL 02" would then have opened MC Olodo’s case file over a fight with
 * somebody else. `dossier()` inside the factory resolves the active one.
 */
const DOSSIERS = {
  1: {
    code: 'LEVEL 01',
    title: 'THE STREET TAX',
    place: 'LAGOS, NIGERIA',
    portrait: true,
  target: 'MC OLODO',
  role: 'MOTORPARK CHAIRMAN',
  threat: { label: 'HIGH', filled: 6, of: 8 },
  body: [
    'MC Olodo controls the streets through fear and intimidation. As Chairman of one of Lagos’ most powerful motorparks, he collects illegal tolls from transporters, traders and small businesses.',
    'His Agbero enforcers keep the money flowing, and during elections they become muscle for the politicians who protect him.',
    'But Olodo is not the architect. He is the collector. His operation feeds directly into a network known only as The Cabal — a web of power that appears to reach the highest corridors of government.',
  ],
  call: [
    'Take down Olodo. Break the collection network.',
    'Expose the money trail.',
    'Every empire has a first brick.',
  ],
  objectives: [
    'Stop Olodo’s street extortion operations',
    'Defeat his Agbero enforcers',
    'Break the flow of illegal tolls',
    'Bring down MC Olodo',
    'Expose the connection to The Cabal',
  ],
  profile: [
    ['NAME', 'MC Olodo'],
    ['ALIAS', 'Motorpark Chairman'],
    ['BUSINESS', 'Transport & Motorpark Operations'],
    ['TERRITORY', 'Major Lagos Motorparks & Transport Routes'],
    ['REVENUE', 'Illegal Tolls, Levies, Extortion'],
    ['ENFORCERS', 'Agbero Network'],
    ['POLITICS', 'Election Muscle'],
    ['PROTECTION', 'Government Officials, Political Connections'],
    ['AFFILIATION', 'The Cabal — unconfirmed'],
    ['THREAT', 'HIGH', 'alert'],
  ],
  chainCopy: [
    'MC Olodo’s ledger ties his collection operation to The Cabal through operators who remain unidentified.',
    'The chain provides street control, revenue, protection and political cover.',
  ],
  chainNote: 'Cut the head, the body will follow.',
  chain: [
    { top: 'MC OLODO', bottom: 'LEVEL 01', tone: 'gold', portrait: true },
    { top: 'UNKNOWN', bottom: 'BOSS', tone: 'dim', unknown: true },
    { top: 'UNKNOWN', bottom: 'BOSS', tone: 'dim', unknown: true },
    { top: 'THE CABAL', bottom: 'IDENTITY UNKNOWN', tone: 'alert' },
  ],
  stamp: [
    'THE FIGHT FOR A BETTER NATION STARTS HERE.',
    'NO MORE LOOT.  NO MORE CORRUPTION.  NO MORE RIGGING.',
  ],
  file: 'DOSSIER FILE:  RR-LV01-OMC',
  },

  /* LEVEL 02 — OPERATION CLEAN SWEEP (request 399).
   *
   * THE WRITTEN BLOCKS ARE THE DEBRIEFING, WORD FOR WORD. `body` and `call` are
   * the transcript of frontend/audio/level2-debriefing.mp3 (Whisper-small, names
   * corrected to the intro's on-screen spelling), split at the read's own
   * pauses: four paragraphs, then its three closing beats in gold — the shape
   * Level 01's file has. They type on that clip's clock (BRIEF_SCRIPT_L2).
   * The rest of the card (profile, objectives, chain) is drawn from the same
   * read, the intro and the brief's mission objective, and invents nothing.
   *
   * `stamp: null`: the static pledge plate is not narration, and the left
   * column needs its 62 px for a read half again as long as Level 01's. */
  2: {
    code: 'LEVEL 02',
    title: 'OPERATION CLEAN SWEEP',
    place: 'LAGOS, NIGERIA',
    /* His photograph: ASSETS/AIG JIMOH.png, supplied with request 403
     * (frontend/jimoh-dossier.jpg). Keyed, so it can never be Level 01's. */
    portrait: 'jimoh',
    target: 'MOSHUN JIMOH',
    role: 'AIG · SENIOR POLICE OFFICER',
    threat: { label: 'SEVERE', filled: 7, of: 8 },
    body: [
      "AIG Moshun Jimoh. Senior police officer. Powerful connections. Untouchable reputation.",
      "Jimoh built his career moving through strategic police commands, eventually gaining influence over the very institutions meant to uphold the law. But intelligence suggests his real power doesn’t come from his badge. It comes from the people behind it. Politicians. Contractors. Street enforcers. Criminal networks.",
      "According to our sources, Jimoh operates a protection racket disguised as law enforcement. For the right price, investigations disappear, witnesses change their stories, and evidence never makes it to court.",
      "His name surfaced in the aftermath of the Ahmad Akande murder case, alongside suspicious payments and a trail of compromised evidence.",
    ],
    call: [
      "Two men are dead,",
      "one man stands accused,",
      "and someone with considerable influence is determined to make sure the truth never comes out.",
    ],
    objectives: [
      'Break into the police evidence facility',
      'Fight through Jimoh’s men',
      'Recover the original case file',
      'Secure the payment records',
      'Take the evidence linking the Ahmad Akande murder to Jimoh',
    ],
    profile: [
      ['NAME', 'Moshun Jimoh'],
      ['RANK', 'AIG — Senior Police Officer'],
      ['REPUTATION', 'Untouchable'],
      ['BACKING', 'Politicians, contractors, street enforcers, criminal networks'],
      ['OPERATION', 'Protection racket disguised as law enforcement'],
      ['LINKED TO', 'The Ahmad Akande murder case'],
      ['EVIDENCE', 'Suspicious payments, compromised evidence'],
      ['LEAD', 'MC Olodo’s phone'],
      ['AFFILIATION', 'The Cabal — unconfirmed'],
      ['THREAT', 'SEVERE', 'alert'],
    ],
    chainCopy: [
      'Olodo’s phone gave up a name, coded payments and a case reference.',
      'Beyond Jimoh the trail runs into The Cabal, and stops.',
    ],
    chainNote: 'Every name is a door. Open this one.',
    chain: [
      { top: 'MC OLODO', bottom: 'DEFEATED', tone: 'dim' },
      /* His own photograph, by key — a bare `portrait: true` is MC Olodo's. */
      { top: 'MOSHUN JIMOH', bottom: 'LEVEL 02', tone: 'gold', portrait: 'jimoh' },
      { top: 'UNKNOWN', bottom: 'OPERATOR', tone: 'dim', unknown: true },
      { top: 'THE CABAL', bottom: 'IDENTITY UNKNOWN', tone: 'alert' },
    ],
    stamp: null,
    file: 'DOSSIER FILE:  RR-LV02-AMJ',
  },
};

/* The case file's voiceover, and the clock the whole screen animates against.
 *
 * `dur` is DECODED, not guessed from the byte size — 45.897 s at 44.1 kHz, read
 * out of the clip by `_chromakey/briefvo.js`. It is only used for the progress
 * rule; every cue below is an absolute time, so a re-cut clip moves cues rather
 * than rescaling them. */
const BRIEF_VO = { src: '../frontend/audio/briefing1.mp3?v=brief45-final', dur: 45.897 };

/* Where each written block of the dossier is typed, as [start, end] on the
 * voiceover's own clock.
 *
 * These are NOT a proportional carve-up of the runtime. The replacement clip
 * was decoded to a 20 ms RMS envelope: speech runs from 0.16 s to 45.56 s. Its
 * long breaths land at 13.98-15.02, 22.50-23.32, 31.22-31.78, 35.52-36.34 and
 * 37.46-38.08. Those boundaries map to the three dossier paragraphs and three
 * gold calls to action. The closing pledge is deliberately NOT on this clock:
 * it is static interface copy, not a line in the recording.
 *
 * The property that matters more than any single number here: every block
 * re-anchors to an absolute time, so a cue that is off by a beat cannot drift
 * into the next one. Error is bounded per block, never cumulative. If the clip
 * is ever re-recorded, re-run briefvo.js and move these — nothing else. */
const BRIEF_SCRIPT = {
  body: [[0.16, 13.98], [15.02, 22.50], [23.32, 31.22]],
  call: [[31.78, 35.52], [36.34, 37.46], [38.08, 39.46]],
};

/* For a level with NO recorded read. The screen then runs on its own dt clock,
 * and these are paced to be read rather than to match a delivery that does not
 * exist yet — about 17 s end to end. Replace with measured cues the moment a
 * clip is delivered, exactly as BRIEF_SCRIPT above was. */
const BRIEF_SCRIPT_SHORT = {
  body: [[0.20, 5.40], [5.80, 9.20], [9.60, 14.60]],
  call: [[15.00, 16.20], [16.50, 17.40], [17.70, 18.60]],
};

/* LEVEL 02's read (request 399): LEVEL 2 debriefing.mp3, 71.043 s decoded. */
const BRIEF_VO_L2 = { src: '../frontend/audio/level2-debriefing.mp3', dur: 71.043 };

/* …and where it types. Level 01's blocks each type LINEARLY across their window,
 * which is right for a read that pauses between blocks. This read runs whole
 * sentences inside a block, so a linear sweep would show a sentence before it
 * is said or lag behind it. `marks` keeps Level 01's model — a block, a window,
 * one reveal fraction — and only makes the fraction piecewise: flattened
 * [time, fraction] pairs, each word typing across its own spoken duration
 * (Whisper word stamps, refitted to the clip's voiced runs) and holding through
 * the pause after it. Times are on the clip's clock, so error is bounded per
 * word and nothing can type a later sentence while an earlier one is spoken.
 * Regenerate with _chromakey/req399/build.js + emit.js. */
const BRIEF_SCRIPT_L2 = {
  body: [[0.2, 9.18], [10.14, 34.44], [35.28, 50.54], [51.38, 60.32]],
  call: [[60.88, 61.84], [62.4, 63.82], [64.9, 70.74]],
  marks: {
  body: [
    [0.2,0,0.42,0.0349,1.68,0.0465,2.12,0.1163,2.12,0.1279,2.57,0.1977,3.4,0.2093,3.64,0.2791,3.64,0.2907,4.08,0.3605,4.08,0.3721,4.68,0.4651,5.5,0.4767,5.96,0.5698,5.96,0.5814,6.86,0.7209,7.6,0.7326,8.34,0.8605,8.34,0.8721,9.16,1],
    [10.14,0,10.4,0.0159,10.4,0.0191,10.64,0.035,10.64,0.0382,10.87,0.0478,10.92,0.051,11.32,0.0701,11.32,0.0732,11.7,0.0924,11.7,0.0955,12.14,0.1178,12.14,0.121,12.66,0.1497,12.66,0.1529,13.11,0.172,13.2,0.1752,13.88,0.2038,14.54,0.207,14.86,0.2389,14.86,0.242,15.38,0.2643,15.42,0.2675,16.09,0.2962,16.1,0.2994,16.4,0.3121,16.42,0.3153,16.6,0.3248,16.6,0.328,16.9,0.3408,16.92,0.3439,17.74,0.3822,17.74,0.3854,18.11,0.4013,18.12,0.4045,18.27,0.4108,18.34,0.414,18.72,0.4331,18.72,0.4363,18.95,0.4459,18.98,0.449,19.28,0.4618,19.72,0.465,19.82,0.4745,19.82,0.4777,20.42,0.5159,20.42,0.5191,21.02,0.5446,21.08,0.5478,21.3,0.5573,21.78,0.5605,22.08,0.5732,22.12,0.5764,22.5,0.5924,22.52,0.5955,22.92,0.6178,22.92,0.621,23.18,0.6338,23.18,0.6369,23.42,0.6497,23.42,0.6529,23.64,0.6624,23.64,0.6656,24.09,0.6847,25.1,0.6879,25.14,0.6943,25.1,0.6975,25.42,0.7134,25.42,0.7166,25.72,0.7293,25.78,0.7325,25.96,0.742,25.96,0.7452,26.32,0.7643,26.32,0.7675,26.77,0.7866,26.84,0.7898,27.07,0.7994,28.04,0.8025,28.94,0.8408,29.72,0.8439,30.62,0.8822,31.32,0.8854,31.77,0.9045,31.86,0.9076,32.61,0.9395,33.18,0.9427,33.72,0.9682,33.72,0.9713,34.39,1],
    [35.28,0,35.62,0.0435,35.62,0.0483,35.77,0.058,35.94,0.0628,36.16,0.0773,36.16,0.0821,36.76,0.1208,37.6,0.1256,37.88,0.1498,37.88,0.1546,38.48,0.1932,38.5,0.1981,38.62,0.2029,38.78,0.2077,39.26,0.256,39.26,0.2609,39.71,0.2899,39.76,0.2947,40.43,0.3382,40.46,0.343,40.61,0.3527,40.88,0.3575,41.11,0.372,41.18,0.3768,41.8,0.4348,42.68,0.4396,42.78,0.4541,42.78,0.4589,42.9,0.4734,42.9,0.4783,43.08,0.5024,43.08,0.5072,43.53,0.5362,44.22,0.5411,44.84,0.6087,44.84,0.6135,45.59,0.6618,46.36,0.6667,46.68,0.7101,46.68,0.715,47.13,0.744,47.2,0.7488,47.5,0.7729,47.5,0.7778,48.1,0.8164,48.66,0.8213,48.8,0.8357,48.8,0.8406,49.22,0.8792,49.22,0.8841,49.58,0.9082,49.58,0.913,49.86,0.9372,49.86,0.942,50.01,0.9517,50.1,0.9565,50.25,0.9662,50.3,0.971,50.54,1],
    [51.38,0,51.52,0.0224,51.52,0.0299,51.8,0.0597,51.8,0.0672,52.34,0.1269,52.34,0.1343,52.49,0.1493,52.7,0.1567,52.84,0.1791,52.84,0.1866,53.38,0.2537,53.38,0.2612,53.53,0.2761,53.76,0.2836,53.9,0.306,53.9,0.3134,54.24,0.3507,54.24,0.3582,54.69,0.403,54.78,0.4104,55,0.4552,55,0.4627,55.38,0.5,55.92,0.5075,56.52,0.5746,56.52,0.5821,57.12,0.6567,57.12,0.6642,57.72,0.7239,57.8,0.7313,58.02,0.7537,58.42,0.7612,58.54,0.7687,58.58,0.7761,58.8,0.8134,58.8,0.8209,58.95,0.8358,59.12,0.8433,59.62,0.9254,59.62,0.9328,60.29,1],
  ],
  call: [
    [60.88,0,61.06,0.1765,61.06,0.2353,61.28,0.4118,61.28,0.4706,61.51,0.6471,61.52,0.7059,61.84,1],
    [62.4,0,62.58,0.1304,62.58,0.1739,62.8,0.3043,62.86,0.3478,63.31,0.6087,63.36,0.6522,63.82,1],
    [64.9,0,65.04,0.0323,65.04,0.043,65.5,0.1183,65.5,0.129,65.8,0.172,65.82,0.1828,66.46,0.3118,66.46,0.3226,67.13,0.4194,67.3,0.4301,67.45,0.4516,67.82,0.4624,68.24,0.5699,68.24,0.5806,68.39,0.6022,68.62,0.6129,68.8,0.6559,68.8,0.6667,69.06,0.7097,69.06,0.7204,69.28,0.7527,69.3,0.7634,69.54,0.8172,69.54,0.828,69.92,0.8817,69.92,0.8925,70.28,0.9462,70.28,0.957,70.58,1],
  ],
  },
};
/* Seconds the finished read holds on the page before Level 02 moves on by
 * itself (START MISSION still leaves at any time). */
const BRIEF_L2_HOLD = 2.0;

/* The target card has its own short read: the threat starts at nothing and
 * climbs to HIGH rather than appearing pre-filled. Kept on the narration clock
 * so a dropped render frame can skip visual increments without delaying the
 * point at which the meter lands. */
const BRIEF_THREAT = { at: 0.30, dur: 1.65 };

/* The right column's entrance. All times are on the voiceover clock, so the
 * cascade lands under the opening line of the read rather than beside it. */
const BRIEF_CARDS = {
  at: 0.42,        // the MC Olodo photograph goes first
  step: 0.30,      // and each panel behind it follows this late
  dur: 0.66,       // one panel's scale-out
  from: 0.82,      // the scale it grows FROM
  lift: 16,        // and how far below its resting place it starts
};

/* Measured out of the supplied files (decoded, not guessed): both cues open
 * with ~85 ms of silence, and the back cue is 4x hotter than the forward cue.
 * Skipping the lead-in makes the click land ON the selection change, and the
 * gains bring both to the same peak so backward navigation is not a shout. */
const CUES = {
  forward: { src: '../frontend/audio/forwardSoundmain.mp3', at: 0.085, len: 0.56, gain: 2.85 },
  back: { src: '../frontend/audio/Fowardselection sound.mp3', at: 0.068, len: 0.34, gain: 0.68 },

  /* ---- the evidence board's tracing cues -------------------------------
   * A line being DRAWN across the board is not a click, so it does not get
   * one. `traceDraw` is a bed that is started when a connection begins and
   * stopped when it lands, which is why it is the only cue here whose length
   * the caller supplies; the rest are one-shots.
   *
   * These four are already trimmed, peak-matched and ramped on disk — see
   * frontend/audio/trace/CREDITS.md — so `at` is 0 and `len` is the whole file.
   * Nothing about them needs measuring at this end.
   *
   * THE GAINS ARE MEASURED, NOT TASTED. `_chromakey/tracelevels.js` decodes each
   * cue's real slice at its real gain and prints it against the forward nav
   * click, which is the loudest UI sound this game makes and therefore the
   * ceiling. All four land within 3 dB of it and none clips at full sliders.
   * Change a number here and re-run that script. */
  traceDraw: { src: '../frontend/audio/trace/trace-draw.wav', at: 0, len: 1.6, gain: 0.62, loop: true },
  /* 0.62 rather than 0.80: a line arriving is the sharpest transient on the
   * board and it fires twelve times across the read, so it is pinned LEVEL with
   * the nav click rather than 2.3 dB over it. */
  traceLand: { src: '../frontend/audio/trace/trace-land.wav', at: 0, len: 0.244, gain: 0.62 },
  traceNode: { src: '../frontend/audio/trace/trace-node.wav', at: 0, len: 0.300, gain: 0.70 },
  traceUnknown: { src: '../frontend/audio/trace/trace-unknown.wav', at: 0, len: 0.540, gain: 0.72 },

  /* The title splash's entrance, fired as the screen is entered so it lands
   * with the mark rising into place. MEASURED like the rest: the file is 2 s
   * long but the hit runs 0.099 -> ~0.40 s and the remaining 1.6 s is digital
   * silence, so `at` skips the lead-in and `len` cuts the tail.
   *
   * Gain against the same ceiling everything else here uses — the forward nav
   * click peaks 0.194 at gain 2.85, i.e. 0.553. This file peaks 0.317, so 1.80
   * puts it level with the loudest sound the front end makes rather than above
   * it: a masthead sting that jumps out of the mix is the one a player reaches
   * for the volume during. */
  titleEntrance: { src: '../frontend/audio/title-entrance.mp3', at: 0.085, len: 0.36, gain: 1.80 },
};

/* ---------------------------------------------------------------- helpers */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------------- the host ----
 * WHO IS ALLOWED TO CLOSE THE GAME.
 *
 * In a browser tab nobody is: `window.close()` is refused for a page the user
 * opened themselves, so QUIT could only ever print an apology — which is what
 * it did ("QUIT IS CONTROLLED BY THE GAME HOST"). The packaged Android build
 * DOES have a host: MainActivity installs `window.RatelHost` with a `quit()`
 * that finishes the task and returns the player to their home screen.
 *
 * Every call is wrapped: an @JavascriptInterface method can throw across the
 * bridge, and a menu item must never be able to take the front end down with
 * it. `canQuit` is read through the same guard so the menus can offer the
 * option only where it actually works, instead of printing the apology and
 * hoping nobody minds. */
export const HOST = {
  get canQuit() {
    try { return !!(window.RatelHost && window.RatelHost.canQuit && window.RatelHost.canQuit()); }
    catch { return false; }
  },
  quit() {
    try { window.RatelHost.quit(); return true; }
    catch (e) { console.warn('[ror host] quit refused', e); return false; }
  },
};
/* The packaged build. Named once so the mobile branches read as one decision
 * rather than as a UA test scattered through the file — the splash and intro
 * twins and the voice-over path all hang off it. */
const IS_ANDROID = /Android/.test(navigator.userAgent);
const MOBILE_CONTROL_ART = Object.freeze({
  stick: '../frontend/ui/controls/stick.png',
  stickThumb: '../frontend/ui/controls/stick-thumb.png',
  jump: '../frontend/ui/controls/jump.png',
  jab: '../frontend/ui/controls/jab.png',
  kick: '../frontend/ui/controls/kick.png',
  block: '../frontend/ui/controls/block.png',
  grab: '../frontend/ui/controls/grab.png',
  pause: '../frontend/ui/controls/pause.png',
});
const MOBILE_CONTROL_LABELS = Object.freeze([
  'MOVE', 'JUMP', 'JAB', 'KICK', 'BLOCK', 'GRAB', 'PAUSE',
]);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (v) => 1 - Math.pow(1 - clamp(v, 0, 1), 3);
const easeInOut = (v) => (v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2);
/* Overshoot on the way in — the difference between a card that appears and a
 * card that LANDS. k is the overshoot; 1.34 peaks about 7% past full size,
 * enough to read as weight and not enough to read as a bounce. */
const easeOutBack = (v, k = 1.34) => {
  const t = clamp(v, 0, 1) - 1;
  return 1 + (k + 1) * t * t * t + k * t * t;
};
/* 0 -> 1 -> 0 over the unit interval, for a highlight that fades in at one edge
 * and out at the other instead of popping at both. */
const hump = (v) => Math.sin(clamp(v, 0, 1) * Math.PI);
/* A slow breath in 0..1 from a running clock. `phase` offsets it so two things
 * on the same page do not pulse in lockstep. */
const breathe = (t, period, phase = 0) => 0.5 - 0.5 * Math.cos(((t / period) + phase) * Math.PI * 2);
/* Frame-rate independent approach — the same visual timing at 30 or 144 fps. */
const approach = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

/* The web build's WebP twins (request 507): a sprite/layer PNG that
 * deploy/build-web.js re-encoded is fetched as its .webp, exactly as game.js's
 * assetPath does. No list (editor, APK) -> the PNG, unchanged. */
const webArt = (src) => {
  const list = window.RR_WEB && window.RR_WEB.webp;
  if (!Array.isArray(list)) return src;
  const m = /(?:^|\/)((?:lowres\/)?(?:sprites|layers)\/[^?#]+\.png)$/i.exec(String(src));
  return m && list.includes(m[1]) ? String(src).replace(/\.png$/i, '.webp') : src;
};
const image = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  const url = new URL(webArt(src), import.meta.url);
  img.onerror = () => {
    if (!/\.webp$/i.test(url.pathname)) return reject(new Error(`Could not load ${src}`));
    img.onerror = () => reject(new Error(`Could not load ${src}`));  // no WebP support: the PNG
    img.src = new URL(src, import.meta.url);
  };
  img.src = url;
});

function roundRectPath(c, x, y, w, h, r = 8) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function loadSettings() {
  try {
    return { ...SETTINGS_DEFAULTS, ...JSON.parse(localStorage.getItem('ratelrage.settings') || '{}') };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

/* ------------------------------------------------------------------ icons
 * Line art on a 24x24 grid, one stroke weight, so every icon carries the same
 * visual mass. The caller sets stroke/fill colour and alpha. */

/* WHICH PROMPT A TOUCH PLAYER SEES INSTEAD.
 *
 * Keyed by the pad glyph every hint in the game already asks for, so no call
 * site has to know the player's device. `triangleBtn` maps to the tap as well:
 * the phone build has no fourth face button and the action it carried — the
 * EXECUTION — is on the GRAB control, which is a tap-and-hold like any other.
 * `dpad` becomes the vertical swipe the gesture layer actually reads.
 *
 * Anything absent from this table draws the same on both (play, gear, lock and
 * the rest are not hardware, they are pictures of what the row does). */
const TOUCH_ICON = {
  cross: 'tapBtn',
  triangleBtn: 'tapBtn',
  squareBtn: 'tapBtn',
  circleBtn: 'swipeLeft',
  dpad: 'swipeUpDown',
};

/* Touch-shaped UI, not merely a touch-capable screen: a laptop with a
 * touchscreen and a keyboard should keep the pad prompts, and the gesture layer
 * uses the same gate (coarse pointer + real touch points) to decide whether it
 * is in charge at all. Read live rather than cached so a harness can spoof it
 * before the first frame. */
export const isTouchUI = () => {
  try {
    return navigator.maxTouchPoints > 0
      && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  } catch { return false; }
};

const ICONS = {
  play(c) { c.beginPath(); c.moveTo(8.5, 5); c.lineTo(19, 12); c.lineTo(8.5, 19); c.closePath(); c.fill(); },
  restore(c) {
    c.beginPath(); c.arc(12, 12, 7.4, Math.PI * 0.42, Math.PI * 1.88); c.stroke();
    c.beginPath(); c.moveTo(15.4, 2.6); c.lineTo(17.2, 7.8); c.lineTo(11.8, 7.6); c.closePath(); c.fill();
  },
  map(c) {
    c.beginPath();
    c.moveTo(3, 6.6); c.lineTo(9, 4.2); c.lineTo(15, 6.6); c.lineTo(21, 4.2);
    c.lineTo(21, 17.4); c.lineTo(15, 19.8); c.lineTo(9, 17.4); c.lineTo(3, 19.8);
    c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(9, 4.2); c.lineTo(9, 17.4); c.moveTo(15, 6.6); c.lineTo(15, 19.8); c.stroke();
  },
  person(c) {
    c.beginPath(); c.arc(12, 8.4, 4.1, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(12, 21.4, 7.7, Math.PI * 1.17, Math.PI * 1.83); c.stroke();
  },
  cart(c) {
    c.beginPath();
    c.moveTo(2.6, 4.6); c.lineTo(5.6, 4.6); c.lineTo(8.3, 15.4); c.lineTo(18.8, 15.4);
    c.lineTo(21, 7.6); c.lineTo(6.5, 7.6); c.stroke();
    c.beginPath(); c.arc(9.8, 19, 1.7, 0, 7); c.stroke();
    c.beginPath(); c.arc(17.8, 19, 1.7, 0, 7); c.stroke();
  },
  pad(c) {
    roundRectPath(c, 2.4, 7.6, 19.2, 9.6, 4.6); c.stroke();
    c.beginPath(); c.moveTo(6, 12.4); c.lineTo(9.6, 12.4); c.moveTo(7.8, 10.6); c.lineTo(7.8, 14.2); c.stroke();
    c.beginPath(); c.arc(16.2, 11.2, 1.15, 0, 7); c.fill();
    c.beginPath(); c.arc(18.6, 13.6, 1.15, 0, 7); c.fill();
  },
  gear(c) {
    c.beginPath(); c.arc(12, 12, 3.1, 0, 7); c.stroke();
    c.beginPath(); c.arc(12, 12, 6.9, 0, 7); c.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      c.beginPath();
      c.moveTo(12 + Math.cos(a) * 6.9, 12 + Math.sin(a) * 6.9);
      c.lineTo(12 + Math.cos(a) * 9.5, 12 + Math.sin(a) * 9.5);
      c.stroke();
    }
  },
  star(c) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const r = i % 2 ? 4.1 : 9.3;
      const x = 12 + Math.cos(a) * r, y = 12 + Math.sin(a) * r;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath(); c.stroke();
  },
  users(c) {
    c.beginPath(); c.arc(9.6, 8.6, 3.5, 0, 7); c.stroke();
    c.beginPath(); c.arc(9.6, 20.2, 6.6, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    c.beginPath(); c.arc(17.6, 9.2, 2.7, Math.PI * 1.32, Math.PI * 0.42); c.stroke();
    c.beginPath(); c.arc(18.2, 19.6, 5.3, Math.PI * 1.60, Math.PI * 1.94); c.stroke();
  },
  power(c) {
    c.beginPath(); c.arc(12, 13, 7.2, Math.PI * 1.73, Math.PI * 1.27); c.stroke();
    c.beginPath(); c.moveTo(12, 3.6); c.lineTo(12, 11.4); c.stroke();
  },
  bell(c) {
    c.beginPath();
    c.moveTo(5.2, 16.6); c.lineTo(18.8, 16.6); c.lineTo(17, 14.2); c.lineTo(17, 10.7);
    c.bezierCurveTo(17, 7.4, 14.8, 5.2, 12, 5.2);
    c.bezierCurveTo(9.2, 5.2, 7, 7.4, 7, 10.7);
    c.lineTo(7, 14.2); c.closePath(); c.stroke();
    c.beginPath(); c.arc(12, 18.4, 1.9, 0, Math.PI); c.stroke();
  },
  trophy(c) {
    c.beginPath();
    c.moveTo(7.6, 4.4); c.lineTo(16.4, 4.4); c.lineTo(16.4, 9.8);
    c.bezierCurveTo(16.4, 13.2, 14.4, 14.9, 12, 14.9);
    c.bezierCurveTo(9.6, 14.9, 7.6, 13.2, 7.6, 9.8);
    c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(7.6, 6.3); c.lineTo(4.5, 6.3); c.lineTo(4.5, 8.5);
    c.bezierCurveTo(4.5, 10.6, 6.1, 11.5, 7.7, 11.5); c.stroke();
    c.beginPath(); c.moveTo(16.4, 6.3); c.lineTo(19.5, 6.3); c.lineTo(19.5, 8.5);
    c.bezierCurveTo(19.5, 10.6, 17.9, 11.5, 16.3, 11.5); c.stroke();
    c.beginPath(); c.moveTo(12, 14.9); c.lineTo(12, 17.4);
    c.moveTo(8.4, 19.8); c.lineTo(15.6, 19.8);
    c.moveTo(9.8, 19.8); c.lineTo(10.6, 17.4); c.lineTo(13.4, 17.4); c.lineTo(14.2, 19.8); c.stroke();
  },
  skull(c) {
    c.beginPath();
    c.moveTo(4.4, 13.6);
    c.bezierCurveTo(4.4, 6.6, 7.6, 2.6, 12, 2.6);
    c.bezierCurveTo(16.4, 2.6, 19.6, 6.6, 19.6, 13.6);
    c.bezierCurveTo(19.6, 16.4, 18.2, 17.6, 16.4, 18.1);
    c.lineTo(16.4, 21.2); c.lineTo(7.6, 21.2); c.lineTo(7.6, 18.1);
    c.bezierCurveTo(5.8, 17.6, 4.4, 16.4, 4.4, 13.6);
    c.closePath(); c.fill();
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.ellipse(9, 12, 2.5, 2.9, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(15, 12, 2.5, 2.9, 0, 0, 7); c.fill();
    c.beginPath(); c.moveTo(12, 14.6); c.lineTo(13.5, 17.4); c.lineTo(10.5, 17.4); c.closePath(); c.fill();
    c.beginPath(); c.rect(10.1, 18.4, 1.1, 2.8); c.rect(12.8, 18.4, 1.1, 2.8); c.fill();
    c.restore();
  },
  /* A FILLED bust — the "no photograph on file" placeholder. Deliberately solid
   * where `person` is a line drawing: on the network graph these sit inside a
   * disc beside MC Olodo's actual photograph, and a filled shape is the only
   * one that reads as an unidentified PERSON at 34 px rather than as an icon.
   * Drawn on the same 24x24 grid as every other glyph, sunk slightly so the
   * shoulders are cropped by the disc the way a real head-and-shoulders is. */
  bust(c) {
    c.beginPath();
    c.arc(12, 9.1, 4.35, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(3.6, 23.4);
    c.bezierCurveTo(3.6, 17.2, 7.3, 14.5, 12, 14.5);
    c.bezierCurveTo(16.7, 14.5, 20.4, 17.2, 20.4, 23.4);
    c.closePath();
    c.fill();
  },
  dpad(c) {
    const arm = 3.3, half = 1.75;
    c.beginPath();
    c.moveTo(12 - half, 12 - arm - half); c.lineTo(12 + half, 12 - arm - half);
    c.lineTo(12 + half, 12 - half); c.lineTo(12 + arm + half, 12 - half);
    c.lineTo(12 + arm + half, 12 + half); c.lineTo(12 + half, 12 + half);
    c.lineTo(12 + half, 12 + arm + half); c.lineTo(12 - half, 12 + arm + half);
    c.lineTo(12 - half, 12 + half); c.lineTo(12 - arm - half, 12 + half);
    c.lineTo(12 - arm - half, 12 - half); c.lineTo(12 - half, 12 - half);
    c.closePath(); c.stroke();
  },
  cross(c) {
    c.beginPath(); c.arc(12, 12, 8.4, 0, 7); c.stroke();
    c.beginPath();
    c.moveTo(8.4, 8.4); c.lineTo(15.6, 15.6);
    c.moveTo(15.6, 8.4); c.lineTo(8.4, 15.6);
    c.stroke();
  },
  circleBtn(c) {
    c.beginPath(); c.arc(12, 12, 8.4, 0, 7); c.stroke();
    c.beginPath(); c.arc(12, 12, 4.4, 0, 7); c.stroke();
  },
  /* Square (the pause posts' OPEN LINK, request 473): the ring the other faces
   * use, with the square inscribed in it. */
  squareBtn(c) {
    c.beginPath(); c.arc(12, 12, 8.4, 0, 7); c.stroke();
    c.strokeRect(8.2, 8.2, 7.6, 7.6);
  },
  /* Triangle. Drawn to the same 8.4 radius the Cross and Circle glyphs use, so
   * the three pad faces read as one set in the hint bar rather than as three
   * sizes — an equilateral triangle inscribed in that circle, nudged down by a
   * third of a pixel-grid unit because a triangle's optical centre sits below
   * its geometric one. */
  triangleBtn(c) {
    const r = 8.4, cy = 12.6;
    c.beginPath();
    c.moveTo(12, cy - r);
    c.lineTo(12 + r * 0.866, cy + r * 0.5);
    c.lineTo(12 - r * 0.866, cy + r * 0.5);
    c.closePath();
    c.stroke();
  },
  /* ---------------------------------------------- the touch vocabulary ----
   *
   * A phone has no Cross, no Circle and no Triangle, so a hint bar that draws
   * them is telling the player to press hardware they are not holding. These
   * are the same prompts in the gestures the touch layer actually listens for
   * (src/touch.js): a tap, a swipe right to go on, a swipe left to go back.
   * They are drawn on the same 24-unit grid and the same 8.4 radius as the pad
   * faces, so a bar of mixed hints still reads as one set.
   *
   * Substituted in `icon()` by TOUCH_ICON rather than at the ~20 call sites, so
   * a new hint anywhere in the game is contextual without its author having to
   * remember that it needs to be. */
  tapBtn(c) {
    // a fingertip on a surface, with the contact ring it just made
    c.beginPath(); c.arc(12, 13.4, 8.4, 0, 7); c.stroke();
    c.save();
    c.globalAlpha *= 0.55;
    c.beginPath(); c.arc(12, 13.4, 4.6, 0, 7); c.stroke();
    c.restore();
    c.beginPath(); c.arc(12, 13.4, 2.1, 0, 7); c.fill();
  },
  swipeRight(c) {
    // the travel, then the arrow head: "carry on"
    c.beginPath(); c.moveTo(4.6, 12); c.lineTo(16.4, 12); c.stroke();
    c.beginPath(); c.moveTo(12.4, 7.4); c.lineTo(17.6, 12); c.lineTo(12.4, 16.6); c.stroke();
    c.save();
    c.globalAlpha *= 0.5;
    c.beginPath(); c.arc(5.4, 12, 2.2, 0, 7); c.fill();   // the thumb it starts under
    c.restore();
  },
  swipeLeft(c) {
    c.beginPath(); c.moveTo(19.4, 12); c.lineTo(7.6, 12); c.stroke();
    c.beginPath(); c.moveTo(11.6, 7.4); c.lineTo(6.4, 12); c.lineTo(11.6, 16.6); c.stroke();
    c.save();
    c.globalAlpha *= 0.5;
    c.beginPath(); c.arc(18.6, 12, 2.2, 0, 7); c.fill();
    c.restore();
  },
  swipeUpDown(c) {
    // the scroll gesture the right half listens for, in place of the d-pad
    c.beginPath(); c.moveTo(12, 4.6); c.lineTo(12, 19.4); c.stroke();
    c.beginPath(); c.moveTo(8.2, 8.4); c.lineTo(12, 4.4); c.lineTo(15.8, 8.4); c.stroke();
    c.beginPath(); c.moveTo(8.2, 15.6); c.lineTo(12, 19.6); c.lineTo(15.8, 15.6); c.stroke();
  },
  /* The shoulder pair, as a step-left / step-right. Two chevrons rather than
   * two little rounded buttons: at the 19 px the hint bar draws icons at, a
   * drawn L1/R1 button reads as a smudge, and what this control actually DOES
   * is step — the label beside it is where the button names belong. */
  bumpers(c) {
    c.beginPath(); c.moveTo(10.4, 5.8); c.lineTo(4.6, 12); c.lineTo(10.4, 18.2); c.stroke();
    c.beginPath(); c.moveTo(13.6, 5.8); c.lineTo(19.4, 12); c.lineTo(13.6, 18.2); c.stroke();
  },
  lock(c) {
    roundRectPath(c, 5.4, 10.6, 13.2, 10.2, 2.2); c.stroke();
    c.beginPath(); c.arc(12, 10.4, 4.1, Math.PI, 0); c.stroke();
    c.beginPath(); c.arc(12, 15.2, 1.5, 0, 7); c.fill();
  },
  check(c) {
    c.beginPath(); c.moveTo(5, 12.6); c.lineTo(10, 17.4); c.lineTo(19, 6.8); c.stroke();
  },
};

/* ============================================================== front end */

export function createFrontEnd({
  canvas, ctx, onGameplayStart, onMainMenu,
  /* Fired when CONTROLS/OPTIONS were opened FROM the pause menu and the player
   * has backed out of them. Distinct from onGameplayStart: the fight is still
   * frozen and still paused, so this must not restart music or clear inputs —
   * it only hands the canvas back and re-applies whatever settings changed. */
  onPauseReturn,
  /* The level's art loads behind these screens, so the front end no longer
   * assumes it is ready. It walks every screen freely and consults the gate
   * only at the one place it matters: the handover into gameplay. Defaults keep
   * the module standalone for the menu harnesses, which have no world. */
  isWorldReady = () => true,
  worldProgress = () => 1,
  worldError = () => null,
} = {}) {
  const settings = loadSettings();
  const assets = { mobileControls: {} };
  /* CASE PHOTOGRAPHS, by key. A dossier or chain node names its man; `true` is
   * the original flag and means MC Olodo, `false` (or a photo not in yet) gets
   * the NO IMAGE ON FILE plate. `anchorY` is where a cover-fit crop takes its
   * slack from (0 = keep the top); `face` is the square the round chain node
   * shows, in the image's own pixels. Jimoh's is a half-length portrait, so the
   * panel keeps his beret and the node is cut to his face (measured on the
   * 768x960 jimoh-dossier.jpg). */
  const PORTRAITS = {
    olodo: { asset: 'olodo', anchorY: 0.5,
      face: (a) => { const side = Math.min(a.width, a.height); return [(a.width - side) / 2, Math.max(0, (a.height - side) * 0.25), side]; } },
    jimoh: { asset: 'jimoh', anchorY: 0.04,
      face: (a) => { const k = a.width / 768; return [208 * k, 40 * k, 330 * k]; } },
  };
  function portraitLook(key) {
    if (key === false || key == null) return null;
    const def = PORTRAITS[key === true ? 'olodo' : key];
    return def ? { ...def, img: assets[def.asset] || null } : null;
  }
  const hitboxes = [];
  let controlsGuideFrame = [];
  /* Per-widget animation state, keyed by a stable id. Kept across frames so
   * focus/press eases instead of snapping, and cheap enough to never clear. */
  const fx = new Map();

  let phase = sessionStorage.getItem('rorSkipSplash') ? 'menu' : 'splash';
  sessionStorage.removeItem('rorSkipSplash');
  let phaseT = 0;
  let clock = 0;
  /* 0 on both of the phases boot can start in. It used to be 1 on the splash,
   * which was harmless while nothing there was selectable — but the studio card
   * and the title prompt are registered controls now, and the press beat finds
   * the control by matching this against their index. */
  let selection = 0;
  let optionPage = null;
  /* THE SLIDER ADJUSTER (request 451). On a phone the four directions are all
   * taken — swipe right enters, swipe left goes back, up/down moves the cursor —
   * so a slider could only ever be tapped UP (confirm stepped it +5%) and never
   * brought back down. Tapping a slider row now pops out ▼/▲ buttons beside it:
   * each tap is one step, holding repeats, and while it is open up/down (keys,
   * pad, or the right-half vertical swipe) move the VALUE instead of the cursor.
   * Back (swipe left, Escape, Circle) closes it before it ever leaves the page. */
  let adjustRow = -1;
  let adjHold = null;                 // { dir, t } while an arrow is held down
  const ADJ = { w: 66, h: 56, gap: 12 };
  let optionRows = [];
  let difficulty = 'NORMAL';
  let message = '';
  let messageT = 0;
  let rejectT = 0;
  let returnPhase = 'menu';
  /* WHICH LEVEL IS BEING PLAYED. Read by the case file, its narration and its
   * cue table — all of which sit far above where this used to be declared.
   * Legal either way (nothing reads it during module init), but a state
   * variable belongs with the state. Written only by startLevel(). */
  let currentLevel = 1;
  /* WHERE THE CURSOR GOES BACK TO. Backing out of a screen has to return the
   * player to the row that OPENED it — walk into LEVEL SELECT, press O, and
   * finding the cursor back on START GAME means re-walking the list every time
   * you look at something. Recorded on the way out of the main menu (not read
   * from `selection`, which the destination screen has already overwritten by
   * the time back() runs) and spent only on the way back in, so entering the
   * menu fresh — from the title, or out of a finished level — still starts at
   * the top. */
  let menuReturnSelection = 0;
  /* Tracked separately from returnPhase because the trail can be two deep —
   * pause -> OPTIONS -> CONTROLS sets returnPhase to 'options' and would
   * otherwise lose the fact that a frozen fight is waiting underneath. */
  let pausedOrigin = false;
  let prevPhase = phase;
  let inputLock = 0;
  let renderScale = 1;
  /* Set when a handover was asked for before the level finished loading: the
   * front end keeps drawing and goes the moment isWorldReady() turns true. */
  let pendingGameplay = false;
  let previewHandoff = false;        // test-only: draw the hold card (previewScreen, request 489)
  let handoffT = 0;

  let ambience = null;
  let ambienceWanted = false;          // set only by setAmbiencePlaying
  const ambienceLife = {};             // keepMediaAlive's state for it
  const sfxCtxLife = {};               // keepContextAlive's state for sfx.ac
  let voice = null;
  let gameplayStartVo = null;
  let gameplayStartVoStarted = false;
  let audioUnlocked = false;
  let introVideo = null;
  /* LEVEL 02'S INTRO SCORE (request 452): "RAtelRAge Level evidence examination
   * soundtrack", under the cut's own narration. On the MUSIC slider, and at a
   * gain MEASURED to sit under the voice: decoded in the browser
   * (_chromakey/req452/loudness.js) the cut's narration runs ~-13.6 dB and the
   * score ~-17.3 dB while sounding, so 0.38 (-8.4 dB) puts the score ~12 dB
   * below the voice when MUSIC and VOICE are at the same setting. 176 s against
   * a 65 s cut, so it never loops; it fades in, and leaves with the picture. */
  const L2_INTRO_MUSIC = { src: '../frontend/audio/level2-evidence-score.mp3', gain: 0.38, fadeIn: 1.5 };
  let introMusic = null, introMusicT = 0;
  let introLoadPromise = null;
  let introFallbackT = 0;
  let voiceRetryT = 0;          // cadence of the intro voice's autoplay retries
  let briefStallT = 0;          // how long the briefing VO has been buffering
  let introStarted = false;
  let introDone = false;
  /* Set once the cinematic has played for THIS level run. The briefing's Back
   * returns to the case file and Forward runs the pipeline again; without this
   * the loading gate sent the flow back through 'intro' and the clip
   * REPLAYED — the "intro is trapped in a loop" report. A fresh startLevel
   * clears it, so replaying the level still plays the intro once. */
  let introPlayed = false;
  /* HAS THE PLAYER EVER SEEN THE CINEMATIC THROUGH? Persisted, because "after
   * the first time" has to mean across launches — an intro you have already
   * watched is not made fresh again by closing the app. `introPlayed` above is
   * the per-RUN flag that stops the briefing's Back/Forward replaying it, and
   * is a different question. */
  const INTRO_SEEN_KEY = 'ror.introSeen';
  let introSeen = false;
  try { introSeen = localStorage.getItem(INTRO_SEEN_KEY) === '1'; } catch {}

  /* TAP TO SKIP, ON THE SECOND VIEWING ONWARD, AFTER THREE SECONDS.
   *
   * Both conditions earn their place. Gating on `introSeen` means a first-time
   * player cannot lose the opening to a stray thumb on a screen that has no
   * controls and invites a tap. The three seconds stop a tap that was really
   * aimed at the LOADING screen behind it — the phase changes under the finger
   * — from eating the cinematic the moment it starts.
   *
   * Keyboard and pad keep skipping from frame one, as they always have: those
   * are deliberate presses, not a thumb landing on glass. */
  const INTRO_TAP_SKIP_AT = 3.0;
  const introTapSkippable = () => introSeen && introFallbackT >= INTRO_TAP_SKIP_AT;
  /* Request 349 replaced that single tap with a DOUBLE tap on every viewing
   * (SKIP_TAP); `introTapSkippable` is kept only for the keyboard hint's fade. */
  const videoTap = makeDoubleTap();
  // Seconds the studio clip has been rolling (0 while the card's lead runs).
  const splashVideoT = () => Math.max(0, phaseT - SPLASH_CARD_LEAD);
  let introLoadProgress = 0;
  /* Set when the intro video fails or takes too long to produce its first
   * frame: the story screen must never wedge on a media element, so the flow
   * skips the cinematic instead of freezing at 15%. */
  let introFailed = false;

  /* The case file's own clock, in seconds, driven by the briefing voiceover.
   * Kept separate from phaseT because phaseT is the SCREEN's transition clock —
   * it is what fades the page in, and a harness sets it to 30 to prove the
   * screen does not time out. The reveal has to run off the audio instead. */
  let briefVo = null;
  let briefT = 0;
  let briefStarted = false;
  let briefFade = null;
  /* Set when a harness writes briefT: the clock then belongs to the harness and
   * neither the clip nor dt may move it. */
  let briefPinned = false;

  const active = () => phase !== 'gameplay';

  /* THE ACTIVE CASE FILE. Falls back to Level 01 rather than to undefined: a
   * level with no dossier written yet must open on something readable, not on
   * a screen full of blanks. */
  const dossier = () => DOSSIERS[currentLevel] ?? DOSSIERS[1];
  /* …and the read that goes with it. Only Level 01 has a recorded narration, so
   * every other level's case file runs on the dt clock (see update()) and its
   * own faster cue table — Level 01's cues are measured against a 45.9 s clip
   * and would type Level 02's shorter copy over three quarters of a minute. */
  const briefVoFor = (lvl) => (lvl === 1 ? BRIEF_VO : lvl === 2 ? BRIEF_VO_L2 : null);
  const briefScript = () => (currentLevel === 1 ? BRIEF_SCRIPT : currentLevel === 2 ? BRIEF_SCRIPT_L2 : BRIEF_SCRIPT_SHORT);
  /* LEVEL 02'S SEQUENCE (request 399) moves between its screens on the shared
   * cinematic bars (src/bars.js) — one cut object, so two can never run at once
   * and each callback fires once. `barFrame` is the aftermath frame the first
   * cut closes over (game.js drew it, so it is captured, not redrawn). */
  const barCut = createBarCut();
  let barFrame = null;
  /* A video or a read held back until the bars have fully opened, so neither
   * starts — nor puts a subtitle on screen — behind a bar. */
  let introDeferred = false;
  let briefDeferred = false;
  let introClosing = false;     // Level 02's intro is on its way out under the bars
  let briefDoneT = 0;           // how long Level 02's finished read has held the page
  const isL2 = () => currentLevel === 2;
  /* Each level's narration clips. Level 02's are built on first use, not at
   * boot — a player who never reaches it never decodes them. */
  const levelClips = {};
  function clipsFor(lvl) {
    if (lvl !== 2) return levelClips[1];
    if (!levelClips[2]) {
      const brief = makeVoice(new URL(BRIEF_VO_L2.src, import.meta.url));
      brief.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(brief.duration) && brief.duration > 0) BRIEF_VO_L2.dur = brief.duration;
      });
      levelClips[2] = { brief, entry: makeVoice(new URL('../sounds/voices/voice-gameplay-start-level2.mp3', import.meta.url)) };
    }
    return levelClips[2];
  }
  /* Point the case file's read and the entry's line at this level's clips. The
   * old level's are stopped first, so a Level 1 clip can never keep talking —
   * or keep driving a clock — under Level 2. */
  function selectLevelAudio(lvl) {
    const c = clipsFor(lvl);
    if (!c) return;
    /* Stopped directly, NOT through stopBriefing: its fade reads the shared
     * `briefVo` pointer, which is about to point at the other level's clip. */
    if (briefVo && briefVo !== c.brief) {
      if (briefFade) { clearInterval(briefFade); briefFade = null; }
      briefVo.pause();
      try { briefVo.currentTime = 0; } catch {}
      briefStarted = false;
    }
    if (gameplayStartVo && gameplayStartVo !== c.entry) { gameplayStartVo.pause(); try { gameplayStartVo.currentTime = 0; } catch {} }
    briefVo = c.brief;
    gameplayStartVo = c.entry;
    gameplayStartVoStarted = false;
    applyAudioSettings();
  }
  /* The intro's separate narration clip: Level 01's cut is silent picture under
   * level1-voiceover.mp3; Level 02's video speaks for itself. */
  const introVoice = () => (isL2() ? null : voice);
  const introSubs = () => (isL2() ? INTRO_SUBS_L2 : INTRO_SUBS);

  /* ------------------------------------------------------------- surfaces */

  /* One downscaled, blurred copy of everything drawn so far. Panels sample it
   * to get real frosted glass for the cost of a single blur per frame. */
  const blurW = 320, blurH = 180;
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = blurW; blurCanvas.height = blurH;
  const blurCtx = blurCanvas.getContext('2d');
  let blurValid = false;

  let grainPattern = null;
  let logoCanvas = null;
  let logoSource = 'none';        // 'svg' | 'text' | 'none' — surfaced on the debug handle
  let titleArt = null;            // the supplied RatelLogo lockup (title screen only)
  /* phaseT at which the title's loading bar filled, or null while it has not.
   * Latched rather than recomputed so the prompt fades in from a fixed instant
   * — see drawTitle. Cleared on entering the title so a return trip re-runs the
   * whole presentation instead of showing a bar that is already full. */
  let titleReadyAt = null;

  /* ------------------------------------------- WHEN THE TITLE WILL TAKE A PRESS
   *
   * The title screen ASKS for a press — "PRESS (X) TO ENTER" — and until it has
   * asked, it does not answer one. The screen used to enter the menu on any
   * press from the frame it appeared, while the loading bar was still filling
   * and nothing on screen had invited anything: the player pressed on the studio
   * card's momentum, the title flashed past, and the load they had skipped was
   * still not finished — so the menu they landed on was the one waiting on it.
   *
   * ONE SOURCE FOR THE PROMPT AND THE GATE. `titlePromptAt` is the instant the
   * prompt begins to fade in, and `drawTitle` draws from the same number rather
   * than working it out again. Two copies of `max(promptAt, titleReadyAt)` would
   * drift the first time either was retimed, and the failure mode is the worst
   * one available: a screen that says PRESS and does not answer, or one that
   * answers a press it never asked for.
   *
   * The gate opens as the prompt STARTS to appear, not when its 0.85 s fade
   * finishes. The invitation is on screen from that frame, and a player who
   * presses the moment they see it should not be told no.
   *
   * `Infinity` while `titleReadyAt` is null — the load has not finished, so
   * there is no instant at which the screen becomes pressable yet. */
  const titlePromptAt = () =>
    (titleReadyAt === null ? Infinity : Math.max(TITLE.promptAt, titleReadyAt));
  /* Every other phase is unaffected: this answers only for the title. */
  const titleReady = () => phase !== 'title' || phaseT >= titlePromptAt();

  let avatarCanvas = null;

  function buildGrain() {
    const size = 96;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    /* Deterministic hash noise — no Math.random, so the tile is identical on
     * every boot and can never flicker between reloads. */
    for (let i = 0; i < size * size; i++) {
      let h = (i * 2654435761) % 4294967296;
      h ^= h >>> 15; h = (h * 2246822519) % 4294967296; h ^= h >>> 13;
      const v = h % 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 26;
    }
    g.putImageData(img, 0, 0);
    grainPattern = ctx.createPattern(c, 'repeat');
  }

  /* Bake the supplied mark into a bitmap ONCE.
   *
   * An <img> holding an SVG is re-rasterised by the compositor on every
   * drawImage, and this file is 21 paths of hand-drawn letterform — far too
   * expensive to pay for per frame on a screen that also decodes video. Baking
   * at LOGO_ART.raster (1024) means the title's 664 px draw is a DOWNSCALE,
   * which is the side of 1:1 to be on; the menu brand at 309 downscales further
   * and gets finer edges for free.
   *
   * Deliberately NOT awaited at boot: the studio card has to be on screen this
   * frame, drawLogo no-ops until the bake lands, and the first screen that wants
   * a logo is ~2.2 s away. If it never lands we fall back to the old drawn
   * wordmark rather than showing a hole — but we say so on the console and in
   * `logoSource`, because a silently-substituted logo is indistinguishable from
   * a wiring bug that shipped. */
  function bakeLogoArt(img) {
    const w = LOGO_ART.raster;
    const h = Math.round(w / LOGO_ART.aspect);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    logoCanvas = { canvas: c, w, h, art: true };
    logoSource = 'svg';
  }

  function buildTextLogo() {
    /* FALLBACK ONLY — superseded by the supplied art above, and kept solely so a
     * failed fetch degrades to a wordmark instead of an empty title screen.
     *
     * Rendered once into its own surface: the distress pass is a
     * destination-out scratch set that must not be recomputed per frame. */
    const S = 3;
    const c = document.createElement('canvas');
    const cw = Math.ceil(L.logo.width) + 24, ch = 74;
    c.width = cw * S; c.height = ch * S;
    const g = c.getContext('2d');
    g.scale(S, S);

    /* Set in Montserrat Black like everything else. Two numbers had to move with
     * the family and neither is cosmetic:
     *
     * CAP RATIO 0.72 -> 0.70. This divides a target cap height to get a px size,
     * so it is a property of the FACE, not a taste. Impact's cap is 0.81 em and
     * Montserrat's is 0.70 (measured, _chromakey/fontmetrics.js); the old 0.72
     * was Impact's number rounded, and leaving it would have made the wordmark
     * ~3% short of the cap the layout asks for.
     *
     * WEIGHT 400 -> 900. Impact has ONE face, so the weight was arbitrary there.
     * Montserrat is variable across 100-900, and a logo lockup wants the Black.
     *
     * `sx` still normalises to the reference width, which is what makes this
     * swap safe at all: it SQUEEZES a wide Montserrat now where it used to
     * stretch a narrow Impact, and either way the mark lands the same width. */
    const size = Math.round(L.logo.cap / 0.70);
    g.font = `900 ${size}px ${FONT}`;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';

    const wA = g.measureText('RATEL').width;
    const wB = g.measureText('RAGE').width;
    const slashGap = 15;
    const natural = wA + slashGap + wB;
    const sx = L.logo.width / natural;          // normalise to the reference proportion
    const baseY = 52;

    g.save();
    g.translate(12, 0);
    g.scale(sx, 1);

    const paint = (txt, x) => {
      g.lineJoin = 'round';
      g.lineWidth = 7 / sx;
      g.strokeStyle = 'rgba(2,3,6,0.92)';
      g.strokeText(txt, x, baseY);
      const grad = g.createLinearGradient(0, baseY - L.logo.cap, 0, baseY + 4);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.55, '#eceadf');
      grad.addColorStop(1, '#bdb7a6');
      g.fillStyle = grad;
      g.fillText(txt, x, baseY);
    };
    paint('RATEL', 0);
    paint('RAGE', wA + slashGap);

    /* The accent slash between the two words. */
    g.save();
    g.translate(wA + slashGap * 0.5, baseY - L.logo.cap * 0.5);
    g.rotate(0.13);
    g.fillStyle = '#ff3b1f';
    g.fillRect(-2.6 / sx, -L.logo.cap * 0.66, 5.2 / sx, L.logo.cap * 1.32);
    g.restore();
    g.restore();

    /* Distress: a fixed set of scratches punched out of the finished letters. */
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    for (let i = 0; i < 90; i++) {
      let h = (i * 1103515245 + 12345) % 2147483648;
      h ^= h >>> 12;
      const x = (h % cw);
      const y = baseY - L.logo.cap + ((h >>> 7) % Math.round(L.logo.cap));
      /* Long and thin, never chunky: a 2 px-tall scratch became a 4 px notch
       * once the title started drawing this logo at 2.15x. Height is now always
       * a single logical pixel and the runs are shorter, so the same set reads
       * as weathering at both sizes instead of as damage at the big one. */
      const w = 1 + ((h >>> 3) % 6);
      g.globalAlpha = 0.22 + ((h >>> 17) % 34) / 100;
      g.fillRect(x, y, w, 1);
    }
    g.restore();

    logoCanvas = { canvas: c, w: cw, h: ch, scale: S, baseY, art: false };
    logoSource = 'text';
  }

  /* Fetch the mark; keep the drawn wordmark on screen until it arrives, and keep
   * it for good if it does not.
   *
   * Fetched as TEXT and handed to the decoder as a data URL rather than pointed
   * at with `img.src`. An <img> will only decode an SVG the server labelled
   * `image/svg+xml`, and this project is served by half a dozen different static
   * servers — WizardGenie, and a hand-rolled one in nearly every harness under
   * _chromakey. Several of those MIME tables predate this file and have no .svg
   * row, so the bytes arrive, the decode refuses them, and the screens quietly
   * show the fallback wordmark instead. `fetch().text()` does not care what the
   * Content-Type says, so the logo now loads anywhere the file is reachable.
   *
   * Resolved against import.meta.url like the audio, not left as a bare '../'
   * for the document to resolve — drive.html lives one directory deeper than
   * index.html, and only the browser clamping '..' at the site root was making
   * that work by accident. */
  function loadLogoArt() {
    const url = new URL(LOGO_ART.src, import.meta.url);
    return fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((svg) => image('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)))
      .then((img) => (img.decode ? img.decode().catch(() => {}).then(() => img) : img))
      .then(bakeLogoArt)
      .catch((err) => {
        console.error(`[ratel-ui] logo art failed to load (${LOGO_ART.src}: ${err.message}) — `
          + 'falling back to the drawn wordmark');
      });
  }

  /* The title mark. A PNG, so none of the SVG MIME trouble above applies and it
   * can go straight through `image()` — but the same rule holds about SAYING
   * SO when it fails: a title screen that silently falls back to the wordmark
   * looks like a design choice rather than a missing file. */
  function loadTitleArt() {
    return image(new URL(TITLE_ART.src, import.meta.url).href)
      .then((img) => (img.decode ? img.decode().catch(() => {}).then(() => img) : img))
      .then((img) => { titleArt = img; })
      .catch((err) => {
        console.error(`[ratel-ui] title art failed to load (${TITLE_ART.src}: ${err.message}) — `
          + 'the title falls back to the wordmark');
      });
  }

  function buildAvatar() {
    /* Darki's face, cropped out of the SUPPLIED idle sheet — no new portrait. */
    const sheet = assets.darkiIdle;
    if (!sheet) return;
    const size = 176;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const hx = (IDLE.head.frame % IDLE.cols) * IDLE.fw + IDLE.head.x;
    const hy = Math.floor(IDLE.head.frame / IDLE.cols) * IDLE.fh + IDLE.head.y;
    g.drawImage(sheet, hx, hy, IDLE.head.w, IDLE.head.h, 0, 0, size, size);
    avatarCanvas = c;
  }

  /* --------------------------------------------------------------- audio */

  /* WebAudio rather than <audio>: it retriggers with no restart stutter, it
   * can start mid-file to skip each cue's measured lead-in, and it can push
   * the quiet forward cue above unity to match the loud back cue. */
  const sfx = { ac: null, buffers: {}, ready: false };

  function initSfx() {
    /* Idempotent: a second context would strand the buffers decoded into the
     * first, the narration clips' among them. */
    if (sfx.ac) return Promise.resolve();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve();
    try { sfx.ac = new AC(); } catch { return Promise.resolve(); }
    const one = async (name, def) => {
      try {
        const res = await fetch(new URL(def.src, import.meta.url));
        sfx.buffers[name] = await sfx.ac.decodeAudioData(await res.arrayBuffer());
      } catch { sfx.buffers[name] = null; }
    };
    return Promise.all(Object.entries(CUES).map(([n, d]) => one(n, d)))
      .then(() => { sfx.ready = true; });
  }

  /* One cue, once.
   *
   * `opt` exists for the tracing bed, which is the only cue in this game whose
   * length is not a property of the file: a line's sound has to last exactly as
   * long as the line takes to draw, and that number lives in aftermath.js.
   *
   *   opt.dur  seconds to play for (default: the cue's own `len`). Loops the
   *            buffer if it is asked for more than the file holds, so a longer
   *            trace cannot end in silence.
   *   opt.rate playbackRate. Detuning the SAME bed is how the unknown rungs of
   *            the Cabal chain sound colder than the known one without being a
   *            second recording that has to be kept in balance with the first.
   *   opt.gain a multiplier ON TOP of the cue's table gain, for per-call
   *            emphasis. Never a replacement — the table stays the one place
   *            the mix balance is set.
   *
   * Returns a stop(fade) handle, so a caller that cut a beat short can take its
   * bed down with it instead of leaving it ringing over the next screen.
   */
  const NO_CUE = { stop() {} };
  function playCue(name, opt = {}) {
    const def = CUES[name];
    const buf = sfx.buffers[name];
    if (!def || !buf || !sfx.ac) return NO_CUE;
    if (sfx.ac.state === 'suspended') sfx.ac.resume().catch(() => {});
    const level = clamp(settings.master * settings.sfx, 0, 1) * def.gain * (opt.gain ?? 1);
    if (level <= 0) return NO_CUE;
    const rate = Math.max(0.05, opt.rate ?? 1);
    const dur = Math.max(0.02, opt.dur ?? def.len);
    const src = sfx.ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    /* Asked for more than the slice holds at this rate? Loop it. Only the bed
     * is ever in this position, and it was built to be loopable. */
    const have = (def.len ?? buf.duration) / rate;
    if (dur > have + 0.001 && def.loop) {
      src.loop = true;
      src.loopStart = def.at;
      src.loopEnd = Math.min(buf.duration, def.at + (def.len ?? buf.duration));
    }
    const gain = sfx.ac.createGain();
    const now = sfx.ac.currentTime;
    /* Tiny ramps top and tail so a mid-file start/stop never clicks. */
    const tail = Math.min(0.03, dur * 0.25);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + Math.min(0.006, dur * 0.2));
    gain.gain.setValueAtTime(level, now + dur - tail);
    gain.gain.linearRampToValueAtTime(0.0001, now + dur);
    src.connect(gain).connect(sfx.ac.destination);
    src.start(now, def.at, src.loop ? undefined : Math.min(dur * rate, buf.duration - def.at));
    src.stop(now + dur + 0.02);
    let stopped = false;
    return {
      /* Ramp down from wherever the envelope currently is, then stop. Cancelling
       * the scheduled values first is what stops the ramp being yanked back up
       * by the setValueAtTime that was queued for the natural tail. */
      stop(fade = 0.08) {
        if (stopped) return;
        stopped = true;
        try {
          const t = sfx.ac.currentTime;
          gain.gain.cancelScheduledValues(t);
          gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
          gain.gain.linearRampToValueAtTime(0.0001, t + fade);
          src.stop(t + fade + 0.02);
        } catch {}
      },
    };
  }

  /* ------------------------------------------------ synthesised UI cues ---
   * Request 453: the score counter, the pause menu opening, and the touch
   * button editor had no sound. These are short tones built on the same context
   * and the same master x SFX level as every other UI cue, so they need no
   * files to download and they sit in the same mix.
   *
   * THE CEILING is the forward nav click (peaks ~0.55 at full sliders, see
   * CUES). Every peak below is set under it; the stacked chord of `tally` is
   * the loudest and stays near it, because the total landing is the one beat
   * here meant to be heard over the music.
   *
   *   tick   one step of the score counting up; `p` 0..1 raises the pitch
   *   tally  the total has landed
   *   stamp  the rank lands (`rank` 'S' adds a sparkle)
   *   pause  the pause menu opens
   *   pick / drop   the button editor: a control picked up / put down
   *   notch  a SIZE or OPACITY slider step; `p` 0..1 is its position
   *   save   the editor's SAVE */
  function tone(t0, { f, f2 = f, dur, type = 'sine', peak, attack = 0.004 }, level) {
    const ac = sfx.ac;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2 !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    const a = peak * level;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(a, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noiseBurst(t0, { dur, peak, band = 1200, q = 0.9 }, level) {
    const ac = sfx.ac, n = Math.ceil(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = band; bp.Q.value = q;
    g.gain.setValueAtTime(peak * level, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(ac.destination);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }
  const uiSfxCount = {};
  function uiSfx(kind, opt) {
    opt = opt || {};
    uiSfxCount[kind] = (uiSfxCount[kind] || 0) + 1;      // counted even when silent, for the harnesses
    const ac = sfx.ac;
    if (!ac) return false;
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    const level = clamp(settings.master * settings.sfx, 0, 1);
    if (level <= 0) return false;
    const t = ac.currentTime + 0.005, p = clamp(opt.p ?? 0, 0, 1);
    switch (kind) {
      case 'tick': tone(t, { f: 900 + 900 * p, dur: 0.035, type: 'square', peak: 0.07, attack: 0.002 }, level); break;
      case 'tally':
        for (const [f, at] of [[784, 0], [1175, 0.04], [1568, 0.08]]) tone(t + at, { f, dur: 0.6, peak: 0.12, attack: 0.006 }, level);
        tone(t, { f: 196, f2: 120, dur: 0.16, type: 'triangle', peak: 0.26 }, level);
        break;
      case 'stamp':
        noiseBurst(t, { dur: 0.13, peak: 0.32, band: 900 }, level);
        tone(t, { f: 120, f2: 55, dur: 0.24, peak: 0.42 }, level);
        if (opt.rank === 'S') tone(t + 0.06, { f: 2093, f2: 2637, dur: 0.32, type: 'triangle', peak: 0.09 }, level);
        break;
      case 'pause':
        tone(t, { f: 660, f2: 440, dur: 0.1, type: 'triangle', peak: 0.24 }, level);
        tone(t + 0.07, { f: 330, dur: 0.12, type: 'triangle', peak: 0.16 }, level);
        break;
      case 'pick': tone(t, { f: 880, f2: 1180, dur: 0.07, peak: 0.2 }, level); break;
      case 'drop': tone(t, { f: 560, f2: 300, dur: 0.1, type: 'triangle', peak: 0.28 }, level); break;
      case 'notch': tone(t, { f: 520 + 760 * p, dur: 0.03, peak: 0.13, attack: 0.002 }, level); break;
      case 'save':
        tone(t, { f: 660, dur: 0.1, peak: 0.18 }, level);
        tone(t + 0.08, { f: 990, dur: 0.16, peak: 0.18 }, level);
        break;
      default: return false;
    }
    return true;
  }
  /* The touch layer (src/touch.js) is a plain script: it reaches the same cues
   * through here, so the button editor sounds like the menus it opens from. */
  if (typeof window !== 'undefined') {
    window.__rorUiSfx = (kind, opt) => (kind === 'forward' ? (navForward(), true) : kind === 'back' ? (navBack(), true) : uiSfx(kind, opt));
  }

  /* ------------------------------------------------- the voice-over clips --
   *
   * THE NARRATION DOES NOT STREAM ON ANDROID.
   *
   * The three reads (the cinematic's, the case file's and the fight's opening
   * line) were <audio> elements, and on the packaged build that put them on the
   * WebView's streaming path, where two things went wrong at once:
   *
   *   1. Capacitor's local server answers a Range request from BYTE ZERO while
   *      claiming the bytes start at the requested offset, so any re-buffer or
   *      seek inside a clip fed the decoder the top of the file. The narrator
   *      stopped mid-line, or never started. (Fixed natively as well --
   *      mobile/android/.../RangeAwareWebViewClient.java -- but the element is
   *      what exposed us to it.)
   *   2. Seven preload='auto' elements are alive from boot, and under the world
   *      load's memory pressure Android suspends them and drops their buffers.
   *      Waking one re-fetches, which walked straight back into (1).
   *
   * Decoded WebAudio buffers have neither problem: one fetch with no Range
   * header, no streaming, no element for the platform to suspend, and playback
   * that cannot be interrupted by memory pressure. The three files are 0.29 MB,
   * 0.57 MB and 0.70 MB, so holding them decoded is affordable where the 6 MB
   * looping ambience would not be -- that one stays an element deliberately.
   *
   * This shim presents the slice of the HTMLAudioElement surface the front end
   * actually uses (currentTime read AND write, duration, paused, ended, volume,
   * play/pause, 'ended' and 'loadedmetadata'), so not one call site changes.
   * DESKTOP IS UNTOUCHED: makeVoice returns a real element off Android. */
  class VoiceClip {
    constructor(url) {
      this.src = String(url);
      this.loop = false;
      this.preload = 'auto';        // accepted and ignored: there is nothing to stream
      this._volume = 1;
      this._buffer = null;
      this._node = null;
      this._gain = null;
      this._handlers = {};
      this._startedAt = 0;          // ac.currentTime when the live run began
      this._offset = 0;             // buffer position that run started from
      this._paused = true;
      this._ended = false;
      this._loading = null;
      this.load();                  // decode now; the screens that want it are minutes away
    }

    /* ---- the element's surface ------------------------------------------- */

    get duration() { return this._buffer ? this._buffer.duration : NaN; }
    get paused() { return this._paused; }
    get ended() { return this._ended; }
    get volume() { return this._volume; }

    set volume(v) {
      this._volume = clamp(Number(v) || 0, 0, 1);
      if (this._gain) { try { this._gain.gain.value = this._volume; } catch {} }
    }

    /* Derived from the context clock, which is the same clock the samples are
     * played against — so the case file's typewriter lands on the narrator's
     * words exactly as it did when this was an element. */
    get currentTime() {
      if (!this._node || !this._buffer) return this._offset;
      const ac = sfx.ac;
      if (!ac) return this._offset;
      const t = this._offset + (ac.currentTime - this._startedAt);
      if (this.loop) return t % this._buffer.duration;
      return Math.min(Math.max(0, t), this._buffer.duration);
    }

    set currentTime(v) {
      const t = Math.max(0, Number(v) || 0);
      this._ended = false;
      if (this._node) this._start(t);      // live: restart the source at the new point
      else this._offset = t;
    }

    addEventListener(type, fn) {
      if (typeof fn !== 'function') return;
      (this._handlers[type] ??= []).push(fn);
    }

    removeEventListener(type, fn) {
      const list = this._handlers[type];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }

    /* Resolves when the sound is actually running, rejects when it cannot —
     * the same contract the callers already handle with .catch(). */
    play() {
      this._ended = false;
      const ac = sfx.ac;
      if (!ac) return Promise.reject(new Error('no audio context'));
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      return this.load().then(() => {
        if (!this._buffer) throw new Error('voice clip did not decode: ' + this.src);
        this._start(this._offset >= this._buffer.duration ? 0 : this._offset);
        this._paused = false;
      });
    }

    pause() {
      if (this._node) this._offset = this.currentTime;   // freeze exactly where we are
      this._stop();
      this._paused = true;
    }

    /* ---- internals -------------------------------------------------------- */

    load() {
      this._loading ??= (async () => {
        try {
          const res = await fetch(this.src);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const bytes = await res.arrayBuffer();
          const ac = sfx.ac;
          if (!ac) throw new Error('no audio context');
          this._buffer = await ac.decodeAudioData(bytes);
          this._emit('loadedmetadata');
        } catch (e) {
          /* A read that will not decode must not wedge the screen it belongs
           * to: play() rejects, and every caller already falls back to its own
           * clock on a rejected play(). */
          console.warn('[ror voice] ' + this.src + ' failed to load: ' + (e && e.message));
        }
      })();
      return this._loading;
    }

    _start(at) {
      const ac = sfx.ac;
      if (!ac || !this._buffer) return;
      this._stop();
      const src = ac.createBufferSource();
      src.buffer = this._buffer;
      src.loop = this.loop;
      const gain = ac.createGain();
      gain.gain.value = this._volume;
      src.connect(gain).connect(ac.destination);
      /* Fires for a natural finish AND for our own stop(); the identity check
       * is what tells the two apart, because _stop() clears _node first. */
      src.onended = () => {
        if (this._node !== src) return;
        this._node = null;
        this._gain = null;
        this._paused = true;
        this._ended = true;
        this._offset = this._buffer ? this._buffer.duration : 0;
        this._emit('ended');
      };
      const from = Math.max(0, Math.min(at, this._buffer.duration));
      try { src.start(0, from); } catch { return; }
      this._node = src;
      this._gain = gain;
      this._startedAt = ac.currentTime;
      this._offset = from;
      this._paused = false;
    }

    _stop() {
      const node = this._node;
      this._node = null;
      if (node) {
        try { node.onended = null; node.stop(); } catch {}
        try { node.disconnect(); } catch {}
      }
      if (this._gain) { try { this._gain.disconnect(); } catch {} }
      this._gain = null;
    }

    _emit(type) {
      for (const fn of this._handlers[type] || []) {
        try { fn({ type, target: this }); } catch (e) { console.warn('[ror voice] ' + type + ' handler threw', e); }
      }
    }
  }

  /* One door for every narration clip. Android gets the decoded buffer; every
   * other platform gets exactly the element it has always had. */
  function makeVoice(url) {
    if (!IS_ANDROID) {
      const el = new Audio(url);
      el.preload = 'auto';
      return el;
    }
    return new VoiceClip(String(url));
  }

  /* The ONLY place navigation audio is produced. Every caller has already
   * committed to a real state change, so one input can never make two sounds. */
  const cueCount = { forward: 0, back: 0, title: 0, order: [] };
  /* A gated press already sounded at the moment the button went down; the
   * deferred action asking for the same cue a beat later must not double it.
   * Consumed once, so an action that legitimately makes a SECOND cue still
   * gets it. */
  const cueSwallowed = () => {
    if (!suppressNavCue) return false;
    suppressNavCue = false;
    return true;
  };
  const navForward = () => {
    if (cueSwallowed()) return;
    cueCount.forward++; cueCount.order.push('F'); playCue('forward');
  };
  const navBack = () => {
    if (cueSwallowed()) return;
    cueCount.back++; cueCount.order.push('B'); playCue('back');
  };

  const introMusicLevel = () => clamp(settings.master * settings.music * L2_INTRO_MUSIC.gain, 0, 1);
  function ensureIntroMusic() {
    if (introMusic) return introMusic;
    introMusic = new Audio(new URL(L2_INTRO_MUSIC.src, import.meta.url));
    introMusic.preload = 'auto';
    introMusic.loop = false;
    return introMusic;
  }
  function stopIntroMusic() {
    if (!introMusic) return;
    introMusic.pause();
    try { introMusic.currentTime = 0; } catch {}
    introMusicT = 0;
  }
  function applyAudioSettings() {
    if (ambience) ambience.volume = clamp(settings.master * settings.ambience * 0.62, 0, 1);
    if (voice) voice.volume = clamp(settings.master * settings.voice, 0, 1);
    /* The briefing read is narration, so it rides the VOICE slider with the
     * intro's — not SFX, and not music. Skipped mid-fade so a stop that is
     * still ramping down is not yanked back to full by a settings change. */
    if (briefVo && !briefFade) briefVo.volume = clamp(settings.master * settings.voice, 0, 1);
    if (gameplayStartVo) gameplayStartVo.volume = clamp(settings.master * settings.voice, 0, 1);
    if (introVideo && isL2() && !introClosing) introVideo.volume = clamp(settings.master * settings.voice, 0, 1);
  }

  /* ------------------------------------------------------ case-file voice */

  /* The briefing read is the case file's soundtrack AND its clock (BRIEF_SCRIPT),
   * so it is started on entering the screen and stopped on every way out —
   * including the handover, which does not go through go(). */
  function beginBriefing() {
    briefT = 0;
    briefPinned = false;
    briefStarted = false;
    gameplayStartVoStarted = false;
    if (gameplayStartVo) {
      gameplayStartVo.pause();
      try { gameplayStartVo.currentTime = 0; } catch {}
    }
    if (briefFade) { clearInterval(briefFade); briefFade = null; }
    /* A level with no read of its own does not borrow another level's. Without
     * this, Level 02's case file opened with MC Olodo's narration playing over
     * it — the same failure as showing his dossier, in the other channel. */
    if (!briefVoFor(currentLevel)) return;
    if (!briefVo) return;
    briefVo.pause();
    try { briefVo.currentTime = 0; } catch {}
    applyAudioSettings();
    const p = briefVo.play();
    briefStarted = true;
    /* A refused play() is not a broken screen: briefT falls back to a dt
     * accumulator in update(), so the cascade and the typewriter still run —
     * they just run to their own time instead of to the narrator's. */
    if (p?.catch) p.catch(() => { briefStarted = false; });
  }

  function stopBriefing() {
    briefStarted = false;
    if (!briefVo) return;
    /* Idempotent on purpose: Cross stops the read in enterGameplay and then goes
     * through go(), which sees it leaving levelTitle and stops it again. A fade
     * already running IS the stop — restarting it here would re-read the
     * half-faded volume as the starting point and cut the tail short. */
    if (briefFade) return;
    if (briefVo.paused) { try { briefVo.currentTime = 0; } catch {} return; }
    /* Faded, not cut. Cross on this screen goes straight into the fight's own
     * music, and a voice chopped off mid-word underneath it reads as a bug. */
    const from = briefVo.volume;
    let n = 0;
    briefFade = setInterval(() => {
      n++;
      briefVo.volume = from * Math.max(0, 1 - n / 6);
      if (n < 6) return;
      clearInterval(briefFade);
      briefFade = null;
      briefVo.pause();
      try { briefVo.currentTime = 0; } catch {}
      applyAudioSettings();
    }, 35);
  }

  /* How far through its own window a written block has been typed, 0..1. */
  function briefReveal(block, i) {
    const m = briefScript().marks?.[block]?.[i];
    if (m) {
      if (briefT <= m[0]) return 0;
      for (let k = 2; k < m.length; k += 2) {
        if (briefT < m[k]) return m[k - 1] + (m[k + 1] - m[k - 1]) * (briefT - m[k - 2]) / Math.max(0.001, m[k] - m[k - 2]);
      }
      return 1;
    }
    const cue = briefScript()[block]?.[i];
    if (!cue) return 1;
    return clamp((briefT - cue[0]) / Math.max(0.001, cue[1] - cue[0]), 0, 1);
  }

  /* How far through its scale-out a right-column panel is, 0..1. */
  const briefCardIn = (i) =>
    clamp((briefT - (BRIEF_CARDS.at + i * BRIEF_CARDS.step)) / BRIEF_CARDS.dur, 0, 1);

  /* Fractional lit segments, 0 -> configured threat level. Fractional rather
   * than integer state gives the leading segment a real fill instead of making
   * six blocks blink on one at a time. */
  const briefThreatLevel = () => dossier().threat.filled * easeOut(
    clamp((briefT - BRIEF_THREAT.at) / BRIEF_THREAT.dur, 0, 1));

  function unlockAudio() {
    audioUnlocked = true;
    if (sfx.ac && sfx.ac.state === 'suspended') sfx.ac.resume().catch(() => {});
    // Only where the bed belongs: a press during the story intro must not
    // start the menu music under the narration (request 347).
    if (!ambience || phase === 'splash' || !ambienceWanted) return;
    const p = ambience.play();
    if (p?.catch) p.catch(() => {});
  }

  function setAmbiencePlaying(wanted = true) {
    if (!ambience) return;
    ambienceWanted = wanted;           // what keepMediaAlive holds it to every frame
    applyAudioSettings();
    if (wanted) {
      /* Attempt from the title itself. Hosts that treat LAUNCH as the user
       * gesture will allow it immediately; strict autoplay browsers reject the
       * promise harmlessly and unlockAudio() retries on the first pad/key press.
       * This is the earliest a web build can legally start audible playback. */
      const p = ambience.play();
      if (p?.catch) p.catch(() => {});
    } else ambience.pause();
  }

  const saveSettings = () => {
    try { localStorage.setItem('ratelrage.settings', JSON.stringify(settings)); } catch {}
    applyAudioSettings();
  };

  /* ---------------------------------------------------------- background */

  /* One <video> for the life of the page. It is never re-created, never
   * seeked, and never has currentTime reset, so the loop cannot restart or
   * seam when the player moves between screens. */
  const bgVideo = document.createElement('video');
  /* uibg2 is the SAME shot as the original uibg — same camera, same ground
   * plane, the same pedestrians standing in the same places — regraded with a
   * depth-of-field pass (near rider and mid crowd defocused, the right-hand
   * shopfront sharp). That is why GROUND above did not need remeasuring. */
  bgVideo.src = new URL('../frontend/menu/uibg2.mp4', import.meta.url);
  bgVideo.loop = true;
  bgVideo.muted = true;
  bgVideo.defaultMuted = true;
  bgVideo.autoplay = true;
  bgVideo.playsInline = true;
  bgVideo.preload = 'auto';
  bgVideo.setAttribute('muted', '');
  bgVideo.setAttribute('playsinline', '');
  bgVideo.setAttribute('aria-hidden', 'true');
  /* Parked off-screen rather than left detached: an attached element is what
   * the compositor is guaranteed to keep decoding, and it can be inspected. */
  bgVideo.style.cssText = 'position:absolute;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(bgVideo);
  let bgReady = false;
  bgVideo.addEventListener('loadeddata', () => { bgReady = true; });

  function keepBackgroundRolling() {
    if (!bgReady) return;
    if (bgVideo.paused && !document.hidden) {
      const p = bgVideo.play();
      if (p?.catch) p.catch(() => {});
    }
  }

  /* ------------------------------------------------- the studio splash clip
   *
   * The supplied KenCrafts card (frontend/splash/studio-splash.mp4). It
   * REPLACED a 2.2 s drawn text beat, and three measured facts about the file
   * shaped how it is wired — see _chromakey/splashprobe.js:
   *
   *   6.006 s, 1920x1080. The aspect is 1.7778, exactly the canvas's, so it
   *   COVERS with no bars and no crop. Do not assume that of a replacement:
   *   drawSplashVideo fits rather than stretches, and letterboxes on black if a
   *   future cut is a different shape.
   *
   *   IT STARTS AND ENDS ON WHITE (mean luma 253 in, 255 out), not black. A
   *   straight cut from a white frame to the near-black title screen is a
   *   flash, so the tail fades to black here — the card lands the transition
   *   rather than the next screen having to absorb it.
   *
   *   IT HAS AN AUDIO TRACK. This is the FIRST screen, so there has been no
   *   user gesture and an unmuted autoplay may be refused. It is attempted with
   *   sound and falls back to muted-and-playing, because a silent studio card
   *   is a disappointment while a card that never starts is a black screen.
   *   `__rorMenu.splash` reports which of the two actually happened.
   */
  const splashVideo = document.createElement('video');
  /* The packaged build ships a 720p twin beside the master and Android loads
   * it: same card, far less decode work, far less chance of a dropped frame. */
  const splashSrc = /Android/.test(navigator.userAgent)
    ? '../frontend/splash/studio-splash-mobile.mp4'
    : '../frontend/splash/studio-splash.mp4';
  splashVideo.src = new URL(splashSrc, import.meta.url);
  splashVideo.preload = 'auto';
  splashVideo.playsInline = true;
  splashVideo.setAttribute('playsinline', '');
  splashVideo.setAttribute('aria-hidden', 'true');
  splashVideo.style.cssText = 'position:absolute;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(splashVideo);
  let splashReady = false;
  let splashFailed = false;
  let splashStarted = false;
  let splashMuted = null;          // null until a play attempt resolves one way
  let splashEnded = false;
  /* Seconds spent parked on the held logo frame. -1 until the hold begins, so
   * "not holding yet" and "holding, 0 s in" are different states. */
  let splashHoldT = -1;
  splashVideo.addEventListener('loadeddata', () => { splashReady = true; });
  splashVideo.addEventListener('ended', () => { splashEnded = true; });
  splashVideo.addEventListener('error', () => {
    splashFailed = true;
    console.error('[ratel-ui] the studio splash video failed to load '
      + '(frontend/splash/studio-splash.mp4) — falling back to the drawn card');
  });

  /* Sound first, silence second, never neither.
   *
   * A rejected play() is the browser's autoplay policy, not a broken file, and
   * the SAME element replayed muted is allowed. Both outcomes are recorded so a
   * silent card can be told from a stalled one without guessing. */
  let splashStartTimer = 0;
  function startSplashVideo() {
    if (splashStarted || splashFailed) return;
    splashStarted = true;
    splashHoldT = -1;
    clearTimeout(splashStartTimer);
    /* ONCE. Both the `loadeddata` listener and the 2.5 s ceiling below call
     * this, and `{ once: true }` only de-duplicates the LISTENER — it does
     * nothing about the timer. On a phone the clip is ready in well under 2.5 s,
     * so the sequence was: card starts on loadeddata, plays for ~1.7 s, then the
     * timer fires, `currentTime = 0` runs a second time and the card JUMPS BACK
     * TO THE TOP. That is the one-off loop on the very first splash screen —
     * once per run, always about two and a half seconds in. */
    let begun = false;
    const begin = () => {
      if (splashFailed || begun) return;
      begun = true;
      clearTimeout(splashStartTimer);
      splashVideo.currentTime = 0;
      /* SOUND FIRST, SILENCE SECOND, NEVER NEITHER — on every platform.
       *
       * Android used to start MUTED outright, on the belief that "the packaged
       * WebView rejects an unmuted play() before any gesture". It does not:
       * Capacitor calls `settings.setMediaPlaybackRequiresUserGesture(false)`
       * (Bridge.java) when it builds the WebView, which lifts the gesture
       * requirement for exactly this case. So the card was silent on the phone
       * for a restriction that was never in force.
       *
       * The "visible hiccup" that the muting was meant to avoid was almost
       * certainly the double-`begin()` restart fixed above — the card jumping
       * back to its first frame ~2.5 s in, which looks just like a failed retry.
       *
       * The unmuted attempt is still not ASSUMED to work: a rejection falls back
       * to muted-and-playing, because a silent studio card is a disappointment
       * while a card that never starts is a black screen. The retry deliberately
       * does not reset currentTime, so the fallback resumes rather than restarts.
       * `__rorMenu.splash.muted` reports which of the two actually happened. */
      splashVideo.muted = false;
      splashVideo.volume = clamp(settings.master * settings.sfx, 0, 1);
      const p = splashVideo.play();
      if (p?.then) {
        p.then(() => { splashMuted = splashVideo.muted; }).catch(() => {
          splashVideo.muted = true;
          splashMuted = true;
          const q = splashVideo.play();
          if (q?.catch) q.catch(() => { splashFailed = true; });
        });
      } else {
        splashMuted = splashVideo.muted;
      }
    };
    /* Never start mid-buffer: the card begins on a picture, not on a stall.
     * The 2.5 s ceiling keeps a stalled network from holding the phase — the
     * SPLASH_MAX guard sits well past the clip plus this wait. */
    if (splashVideo.readyState >= 2) begin();
    else {
      splashVideo.addEventListener('loadeddata', begin, { once: true });
      splashStartTimer = setTimeout(begin, 2500);
    }
  }

  /* Nothing of the card may survive into the menus — a 6 s clip still decoding
   * behind the title is wasted power, and its audio outliving the screen is the
   * one way this can go audibly wrong. */
  function stopSplashVideo() {
    try { splashVideo.pause(); } catch {}
  }

  /* --------------------------------------------------------- canvas size */

  /* The virtual space stays 1280x720; the backing store follows the real
   * display so hairlines and text are not upscaled by the browser. */
  function syncCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const wanted = clamp(Math.round((rect.width || W) * dpr), W, 2560);
    const wantedH = Math.round(wanted * H / W);
    if (canvas.width !== wanted || canvas.height !== wantedH) {
      canvas.width = wanted;
      canvas.height = wantedH;
    }
    renderScale = canvas.width / W;
  }

  /* Handed back exactly as game.js expects it before gameplay draws a frame. */
  function releaseCanvas() {
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    renderScale = 1;
  }

  /* Preserve the exact dossier frame the player committed on. Gameplay draws
   * beneath this bitmap and fades it away, so the handoff is a real dissolve
   * between two live scenes rather than a black loading cut. */
  function captureTransitionFrame() {
    const frame = document.createElement('canvas');
    frame.width = W; frame.height = H;
    const g = frame.getContext('2d');
    if (g) g.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, W, H);
    return frame;
  }

  function beginGameplayStartVoice() {
    if (gameplayStartVoStarted || !gameplayStartVo) return;
    gameplayStartVoStarted = true;
    gameplayStartVo.pause();
    try { gameplayStartVo.currentTime = 0; } catch {}
    applyAudioSettings();
    const p = gameplayStartVo.play();
    if (p?.catch) p.catch(() => { gameplayStartVoStarted = false; });
  }

  /* The skip's end of the line (request 349): a short fade, not a cut, so the
   * last word does not click off. Leaves `gameplayStartVoStarted` set: the
   * entry has had its line and must not start it again. */
  function endGameplayStartVoice() {
    if (!gameplayStartVo || gameplayStartVo.paused) return;
    const v = gameplayStartVo, start = v.volume;
    let n = 0;
    const fade = setInterval(() => {
      n++;
      v.volume = start * Math.max(0, 1 - n / 6);
      if (n >= 6) { clearInterval(fade); v.pause(); applyAudioSettings(); }
    }, 30);
  }

  /* ---------------------------------------------------------------- state */

  function go(next, opts = {}) {
    if (next === phase && !opts.force) return;
    prevPhase = phase;
    phase = next;
    phaseT = 0;
    message = '';
    messageT = 0;
    rejectT = 0;
    inputLock = 0.12;
    selection = opts.selection ?? defaultSelection(next);
    /* The studio clip belongs to ONE screen. Leaving stops it however the exit
     * happened — timed out, skipped, or forced by a harness — because a 6 s
     * card still decoding (and possibly still audible) behind the title is the
     * failure this is easiest to ship. Written as leave-the-phase rather than
     * hung off each destination for the same reason the briefing read is: the
     * ways out are not one place. */
    if (prevPhase === 'splash' && next !== 'splash') stopSplashVideo();
    if (next === 'splash') { splashEnded = false; splashStarted = false; startSplashVideo(); }
    if (next === 'title') {
      setAmbiencePlaying(true);
      titleReadyAt = null;              // the presentation runs again from the top
      /* titleEntrance deliberately does NOT fire here. It is the sound of the
       * player LEAVING this screen, not of arriving on it — see confirmNow. */
    }
    if (next === 'menu') {
      optionPage = null;
      adjustRow = -1;
      returnPhase = 'menu';
      pausedOrigin = false;
      setAmbiencePlaying(true);
      if (gameplayStartVo) {
        gameplayStartVo.pause();
        try { gameplayStartVo.currentTime = 0; } catch {}
      }
      gameplayStartVoStarted = false;
      onMainMenu?.();
    }
    /* A run that has already shown the cinematic only passes through here (the
     * case file's Back -> Forward), and its video has been released: no reload. */
    if (next === 'loading') {
      if (introPlayed) introLoadProgress = 1;
      else { introLoadProgress = 0; preloadIntro(); }
    }
    if (next === 'intro') beginIntro();
    /* The case file's read starts with the screen and stops with it. Written as
     * enter/leave rather than hung off the destination, because the ways OUT are
     * not one place: Cross goes to gameplay, O goes back to the briefing, and a
     * harness can force the screen from anywhere. */
    if (next === 'levelTitle') {
      setAmbiencePlaying(true);
      briefDoneT = 0;
      /* Level 02's read starts when the bars have fully opened (update). */
      if (isL2() && barCut.active) { briefDeferred = true; briefT = 0; briefStarted = false; }
      else { briefDeferred = false; beginBriefing(); }
    }
    else if (prevPhase === 'levelTitle') stopBriefing();
    if (next === 'gameplay') {
      /* Whatever cut brought the player here is over: the fight owns the frame,
       * and a bar left mid-move must not reappear over a later menu. */
      barCut.reset();
      barFrame = null;
      const transitionFrame = captureTransitionFrame();
      setAmbiencePlaying(false);
      if (voice) { voice.pause(); voice.currentTime = 0; }
      bgVideo.pause();                 // pause, never reset — resumes where it left off
      const gameplayStartDuration = Number.isFinite(gameplayStartVo?.duration) && gameplayStartVo.duration > 0
        ? gameplayStartVo.duration : (isL2() ? 26.457 : 18.779);   // decoded lengths of the two lines
      releaseCanvas();
      onGameplayStart?.({
        difficulty, settings: { ...settings }, transitionFrame, gameplayStartDuration, level: currentLevel,
        /* HANDED OVER, NOT PLAYED. The line used to start on the Cross press,
         * which now lands 1.45 s before there is anything to look at — the
         * screen is black and then a gate opens, and the brief puts the
         * dialogue after both. gameplay's entry calls this when the gate has
         * finished opening. Autoplay is not a risk at this point: the document
         * has been activated since the title screen and the menu has been
         * playing audio ever since. */
        playIntroVoice: beginGameplayStartVoice,
        stopIntroVoice: endGameplayStartVoice,   // a double-tap skip of the entry (request 349)
        /* The line's own clock for its subtitles (request 357), or null when it is
         * not really sounding — the same gate the story intro's subtitles use
         * (voiceSounding): a VoiceClip on a suspended context reports a frozen time. */
        introVoiceTime: () => {
          const v = gameplayStartVo;
          if (!v || !gameplayStartVoStarted || v.paused) return null;
          if (v instanceof VoiceClip && sfx.ac?.state !== 'running') return null;
          return v.currentTime;
        },
      });
    }
  }

  /* The ONLY door into gameplay. If the level's art is still in flight the
   * request is remembered and update() completes it as soon as the world is in,
   * so a slow connection costs a short hold at the handover instead of a wait
   * in front of the studio card. */
  function enterGameplay() {
    /* LEVEL 02 (request 399): the bars close over the case file — its read
     * fading under them — and the fight's entry begins on the black they leave,
     * which is exactly where game.js's own entry starts (full black, then its
     * half gate). START MISSION and the end of the read both come here; the
     * cut's latch makes the second a no-op. */
    if (isL2() && phase === 'levelTitle' && !pendingGameplay) {
      if (barCut.active) return;
      stopBriefing();
      briefDeferred = false;
      barCut.start(() => {
        enterGameplayNow();
        if (phase === 'gameplay') barCut.reset();   // game.js owns the frame now
      }, { waitFor: () => isWorldReady(), maxHold: 1.5 });
      return;
    }
    enterGameplayNow();
  }

  function enterGameplayNow() {
    /* Before the branch, not inside it: on the slow path this latches the
     * handover and draws the hold card WITHOUT going through go(), so a stop
     * hung off the phase change would leave the briefing talking over it. */
    stopBriefing();
    /* The line NO LONGER begins here. It is handed to gameplay through
     * onGameplayStart and fired when the cinematic gate has opened — see the
     * note there. Starting it on the press put its first word (0.194 s in)
     * underneath a black screen. */
    if (isWorldReady()) { pendingGameplay = false; go('gameplay'); return; }
    if (!pendingGameplay) { pendingGameplay = true; handoffT = 0; }
  }

  /* NORMAL on the difficulty list, and START MISSION on the case file — the
   * case file's row reads back-then-forward now, so landing on index 0 would
   * park the cursor on GO BACK and make leaving the easier press. */
  const defaultSelection = (name) =>
    name === 'difficulty' ? 1 : name === 'levelTitle' ? BRIEF_START : 0;

  /* Cancel gets the same beat as confirm — it is a button press too. The two
   * refusals are checked BEFORE the gate so a press that was never going to do
   * anything does not light up a ring promising that it did. */
  function back() {
    if (pressRunning) { backNow(); return; }
    if (pendingGameplay) return;                 // the handover cannot be cancelled
    if (phase === 'title' || phase === 'splash') return;
    runGated(backNow, navBack);
  }

  /* Back to the main menu, cursor on the row that was left. Clamped rather than
   * trusted: MAIN_ITEMS is a list that gets edited, and a stale index past its
   * end would put the highlight on nothing and `MAIN_ITEMS[selection].disabled`
   * on undefined. */
  function toMenu() {
    go('menu', { selection: Math.max(0, Math.min(MAIN_ITEMS.length - 1, menuReturnSelection)) });
  }

  function backNow() {
    if (pendingGameplay) return;                 // the handover cannot be cancelled
    if (phase === 'title' || phase === 'splash') return;
    if (phase === 'intro') { navBack(); finishIntro(); return; }
    /* Out of the case file is back up the setup trail. Note this does mean the
     * intro plays again on the way forward — it is skippable with Cross, and the
     * alternative was a BACK that silently discards the briefing flow. */
    if (phase === 'levelTitle') { navBack(); go('briefing'); return; }
    if (optionPage && adjustRow >= 0) { selection = adjustRow; adjustRow = -1; adjHold = null; navBack(); return; }
    if (optionPage) { optionPage = null; adjustRow = -1; selection = 0; navBack(); return; }
    navBack();
    if (phase === 'menu') { showMessage('QUIT IS CONTROLLED BY THE GAME HOST'); return; }
    if (phase === 'difficulty') toMenu();
    else if (phase === 'character') go('difficulty', { selection: 1 });
    else if (phase === 'briefing') go('character');
    else if (phase === 'controls' || phase === 'shop' || phase === 'levelSelect' ||
      phase === 'characters' || phase === 'extras' || phase === 'credits' || phase === 'options') {
      /* One step up the trail. OPTIONS is the only screen that parents another,
       * so backing out of CONTROLS lands there and keeps the pause origin. */
      if (returnPhase === 'options') { returnPhase = pausedOrigin ? 'pause' : 'menu'; go('options'); }
      else if (pausedOrigin) returnToPause();
      else toMenu();
    }
  }

  function currentItems() {
    if (phase === 'menu') return MAIN_ITEMS;
    if (phase === 'difficulty') return ['EASY', 'NORMAL', 'HARD', 'ARCADE'].map((label) => ({ label }));
    if (phase === 'levelTitle') return BRIEF_ACTIONS.map((item) => ({ label: item.label }));
    if (phase === 'levelSelect') return levelSelectItems();
    if (phase === 'options' && !optionPage) {
      return ['VIDEO', 'AUDIO', 'CONTROLS', 'GAMEPLAY', 'ACCESSIBILITY', 'LANGUAGE', 'RESET SETTINGS']
        .map((label) => ({ label }));
    }
    return [];
  }

  const listLength = () => (optionPage ? optionRows.length : currentItems().length);

  /* Screens whose items sit in a ROW, so the left/right axis owns the cursor.
   * Kept as a predicate rather than a flag on each screen because it is read by
   * the input step, which has no screen object to hang it off. */
  const horizontalList = () => phase === 'levelTitle' && !optionPage;

  /* Vertical movement. Wrap-around is deliberate.
   *
   * BOTH directions play the move cue. The cue used to follow the direction
   * travelled — down said "forward", up said "back" — and that was the wrong
   * axis to map sound onto: moving the cursor up a list is not going back, and
   * hearing the cancel sound while still walking down a menu reads as though
   * something was dismissed. The back cue is now reserved for actually
   * LEAVING a screen (see back()), so it means exactly one thing. */
  function move(delta) {
    if (optionPage && adjustRow >= 0) { selection = adjustRow; adjustOption(-delta); return; }   // up = louder
    const n = listLength();
    if (!n) return;
    const next = (selection + delta + n) % n;
    if (next === selection) return;      // no state change => no sound
    selection = next;
    navForward();
  }

  function showMessage(text) { message = text; messageT = 2.2; }

  /* QUIT, ON THE SECOND PRESS.
   *
   * Leaving the game is the one menu action with no way back, and on a phone
   * the row is a thumb-sized target next to CREDITS. So the first press ARMS
   * it and says so, and only a second press inside the window actually goes.
   * The window is the message's own lifetime, so the prompt vanishing and the
   * arming lapsing are the same event — there is no state the player can see
   * that the code does not also believe. */
  let quitArmedT = 0;
  function requestQuit(label = 'QUIT') {
    if (!HOST.canQuit) { showMessage('QUIT IS CONTROLLED BY THE GAME HOST'); return false; }
    if (quitArmedT > 0) { quitArmedT = 0; HOST.quit(); return true; }
    quitArmedT = 2.2;
    showMessage(`PRESS ${label} AGAIN TO EXIT`);
    return false;
  }

  function reject(text) {
    rejectT = 0.42;
    showMessage(text);
    /* Deliberately no navigation cue — a refusal must not sound like a move. */
  }

  function confirm() {
    unlockAudio();
    if (pressRunning) { confirmNow(); return; }
    /* Committed to the fight and only waiting on the art — nothing to confirm,
     * and the frozen phase underneath must not advance behind the hold card. */
    if (pendingGameplay) return;
    /* Two presses answer in place and must NOT wait on a transition beat: an
     * options row is its own feedback (the value moves under the thumb), and a
     * refusal already has its own language — the shake and the reason. Delaying
     * either would put a commitment's ceremony on something that did not
     * commit. */
    if (phase === 'options' && optionPage) { confirmNow(); return; }
    if (phase === 'menu' && MAIN_ITEMS[selection]?.disabled) { confirmNow(); return; }
    /* The title before it has asked. `processHeldInput` already stops the
     * keyboard and the pad, but a MOUSE OR A TAP arrives here directly from
     * `onPointerUp` and would otherwise walk straight past that gate. Checked
     * before `runGated` like the two refusals above, so a press that will do
     * nothing does not fire a press beat, a nav cue and a haptic promising it
     * did. */
    if (phase === 'title' && !titleReady()) return;
    /* GO BACK is reached through confirm(), so the cue has to be picked from
     * what the press will DO, not from which button produced it. */
    const leaving = phase === 'levelTitle' && selection === BRIEF_BACK;
    runGated(confirmNow, leaving ? navBack : navForward);
  }

  function confirmNow() {
    /* The studio card stays skippable — skipping it only arrives at the title
     * sooner, where the load gate below still holds. */
    if (phase === 'splash') { navForward(); go('title'); return; }
    /* THE TITLE SFX FIRES ON THE PRESS, NOT ON THE SCREEN. It used to play from
     * go('title'), which put it on the arrival — and on most hosts that arrival
     * is still before any user gesture, so the context was suspended and the cue
     * was silently swallowed (see the unlock note in setAmbiencePlaying). Here it
     * is downstream of confirm()'s unlockAudio() and of the 0.19 s press beat, so
     * it lands ON the cut to the menu rather than under the button click that
     * navForward already voices. */
    if (phase === 'title') {
      /* The backstop. `confirm()` and `processHeldInput` both gate this, but
       * `confirmNow` is also reachable directly — through `pressRunning`, and
       * from anything that calls it in future — and the one thing that must not
       * be possible is entering the menu on a load that has not finished. */
      if (!titleReady()) return;
      cueCount.title++;
      playCue('titleEntrance');
      navForward();
      go('menu');
      return;
    }

    if (phase === 'menu') {
      const item = MAIN_ITEMS[selection];
      if (item.disabled) { reject(item.note || 'UNAVAILABLE'); return; }
      pressPulse(`menu:${selection}`);
      navForward();
      menuReturnSelection = selection;      // …and this is the row O comes back to
      if (item.label === 'START GAME') go('difficulty');
      else if (item.label === 'CONTINUE') continueGame();
      else if (item.label === 'LEVEL SELECT') go('levelSelect');
      else if (item.label === 'CHARACTERS') go('characters');
      else if (item.label === 'SHOP') go('shop');
      else if (item.label === 'CONTROLS') go('controls');
      else if (item.label === 'OPTIONS') go('options');
      else if (item.label === 'EXTRAS') go('extras');
      else if (item.label === 'CREDITS') go('credits');
      else if (item.label === 'QUIT GAME') requestQuit('QUIT');
      return;
    }
    if (phase === 'difficulty') {
      navForward();
      difficulty = ['EASY', 'NORMAL', 'HARD', 'ARCADE'][selection];
      if (currentLevel !== 1) selectLevel(1);       // START GAME is Level 01
      go('character');
      return;
    }
    if (phase === 'character') { navForward(); go('briefing'); return; }
    if (phase === 'briefing') { navForward(); go('loading'); return; }
    if (phase === 'levelSelect') {
      const lvl = levelSelectItems()[selection]?.level ?? 1;
      pressPulse(`lvl:${selection}`);
      navForward();
      /* 02 goes through the same door the post-mission "PLAY LEVEL 02" does:
       * its cinematic, its debriefing, its entry. 01 keeps its setup trail. */
      if (lvl === 2) { startLevel(2); return; }
      if (currentLevel !== 1) selectLevel(1);
      go('briefing');
      return;
    }
    if (phase === 'characters') { navForward(); go('character'); return; }
    if (phase === 'options') {
      if (optionPage) {
        const row = optionRows[selection];
        if (row?.type === 'slider') {
          adjustRow = adjustRow === selection ? -1 : selection;
          pressPulse(`opt:${selection}`);
          navForward();
          return;
        }
        adjustRow = -1;
        adjustOption(1);
        return;
      }
      const item = currentItems()[selection].label;
      navForward();
      if (item === 'RESET SETTINGS') {
        Object.assign(settings, SETTINGS_DEFAULTS);
        saveSettings();
        showMessage('SETTINGS RESET');
      } else if (item === 'CONTROLS') {
        returnPhase = 'options';
        go('controls');
      } else {
        optionPage = item;
        optionRows = optionSpec(item);
        adjustRow = -1;
        selection = 0;
      }
      return;
    }
    if (phase === 'intro') { navForward(); finishIntro(); return; }
    /* The case file is the last door. If the level's art is still in flight this
     * falls through to the handover card rather than refusing the press. */
    if (phase === 'levelTitle') {
      if (selection === BRIEF_BACK) { back(); return; }
      navForward();
      enterGameplay();
    }
  }

  /* ------------------------------------------------------------- options */

  function optionSpec(page) {
    if (page === 'VIDEO') return [
      { label: 'DISPLAY MODE', value: () => (document.fullscreenElement ? 'FULLSCREEN' : 'WINDOWED'), action: toggleFullscreen },
      { label: 'SCREEN SHAKE', key: 'screenShake', type: 'toggle' },
      { label: 'CRT EFFECT', key: 'crt', type: 'toggle' },
    ];
    if (page === 'AUDIO') return [
      { label: 'MASTER VOLUME', key: 'master', type: 'slider' },
      { label: 'MUSIC', key: 'music', type: 'slider' },
      { label: 'SFX', key: 'sfx', type: 'slider' },
      { label: 'VOICE', key: 'voice', type: 'slider' },
      { label: 'AMBIENCE', key: 'ambience', type: 'slider' },
    ];
    if (page === 'GAMEPLAY') return [
      { label: 'DIFFICULTY', value: () => difficulty, action: cycleDifficulty },
      { label: 'TUTORIAL HINTS', key: 'tutorialHints', type: 'toggle' },
      { label: 'VIBRATION', key: 'vibration', type: 'toggle' },
      { label: 'DAMAGE INDICATORS', key: 'damageIndicators', type: 'toggle' },
      { label: 'COMBO ASSIST', key: 'comboAssist', type: 'toggle' },
    ];
    if (page === 'ACCESSIBILITY') return [
      { label: 'SUBTITLES', key: 'subtitles', type: 'toggle' },
      { label: 'SUBTITLE SIZE', key: 'subtitleSize', type: 'slider', min: 0.75, max: 1.5, step: 0.25 },
      { label: 'HIGH CONTRAST UI', key: 'highContrast', type: 'toggle' },
      { label: 'SCREEN SHAKE', key: 'screenShake', type: 'toggle' },
    ];
    if (page === 'LANGUAGE') return [{ label: 'LANGUAGE', value: () => 'ENGLISH' }];
    return [];
  }

  function cycleDifficulty(dir = 1) {
    const list = ['EASY', 'NORMAL', 'HARD', 'ARCADE'];
    difficulty = list[(list.indexOf(difficulty) + dir + list.length) % list.length];
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) canvas.parentElement?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }

  function adjustOption(dir) {
    const row = optionRows[selection];
    if (!row) return;
    pressPulse(`opt:${selection}`);
    if (row.type === 'toggle') {
      settings[row.key] = !settings[row.key];
      /* Same rule as move(): flipping a setting leftwards is not going back. */
      navForward();
    } else if (row.type === 'slider') {
      const min = row.min ?? 0, max = row.max ?? 1, step = row.step ?? 0.05;
      const before = settings[row.key];
      settings[row.key] = clamp(before + step * dir, min, max);
      /* Sliders move continuously while held — a cue per step would machine-gun,
       * so the feedback here is the bar itself. */
    } else if (row.action) {
      row.action(dir);
      navForward();
    }
    saveSettings();
  }

  /* --------------------------------------------------------------- input
   * Keyboard, gamepad and pointer all resolve to the same held-direction
   * model, so a press is one step no matter where it came from, and holding
   * repeats on a cadence we own rather than the OS key-repeat rate. */

  const HOLD_DELAY = 0.40;
  const HOLD_RATE = 0.115;

  const key = { up: false, down: false, left: false, right: false, accept: false, back: false, skip: false };
  const pad = { up: false, down: false, left: false, right: false, accept: false, back: false, skip: false };
  /* A keydown/keyup pair can open and close inside a single frame. Sampling
   * only the held state drops that tap entirely, so every keydown also raises
   * a latch that update() is guaranteed to see exactly once. */
  const latch = { up: 0, down: 0, left: 0, right: 0, accept: 0, back: 0, skip: 0 };
  const padPrev = { up: false, down: false, left: false, right: false, accept: false, back: false, skip: false };
  const repeatV = { dir: 0, t: 0 };
  const repeatH = { dir: 0, t: 0 };

  const held = (name) => key[name] || pad[name];
  const takeLatch = (name) => { const v = latch[name]; latch[name] = 0; return v; };
  const dropLatches = () => { for (const k of Object.keys(latch)) latch[k] = 0; };

  function eventToAction(code) {
    if (code === 'ArrowUp' || code === 'KeyW') return 'up';
    if (code === 'ArrowDown' || code === 'KeyS') return 'down';
    if (code === 'ArrowLeft' || code === 'KeyA') return 'left';
    if (code === 'ArrowRight' || code === 'KeyD') return 'right';
    if (code === 'Enter' || code === 'Space' || code === 'KeyJ') return 'accept';
    if (code === 'Escape' || code === 'Backspace') return 'back';
    if (code === 'KeyX') return 'skip';
    return null;
  }

  function onKeyDown(e) {
    if (!active()) return;
    /* Before the action map, and before the repeat guard: the placement tool
     * owns its keys outright while it is open, and its nudges WANT the OS
     * repeat that menu navigation deliberately discards. */
    if (darkiToolKey(e)) return;
    const action = eventToAction(e.code);
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    unlockAudio();
    /* OS auto-repeat is discarded outright; update() owns the cadence. */
    if (e.repeat) return;
    key[action] = true;
    latch[action] = 1;
  }

  function onKeyUp(e) {
    const action = eventToAction(e.code);
    if (!action) return;
    key[action] = false;
  }

  function clearHeld() {
    for (const k of Object.keys(key)) key[k] = false;
    for (const k of Object.keys(pad)) pad[k] = false;
    for (const k of Object.keys(padPrev)) padPrev[k] = false;
    dropLatches();
    repeatV.dir = 0; repeatH.dir = 0;
  }

  /* One axis of navigation. A fresh latch always steps once; after that the
   * held state drives a repeat on our own cadence. Neither path can fire on
   * the same frame as the other, so one press is always exactly one step. */
  function axis(rep, dt, negLatch, posLatch, negHeld, posHeld, step, repeatable) {
    const dir = posHeld ? 1 : negHeld ? -1 : 0;
    let fired = 0;
    if (takeLatch(posLatch)) { takeLatch(negLatch); fired = 1; }
    else if (takeLatch(negLatch)) fired = -1;

    if (fired) {
      step(fired);
      rep.dir = dir;
      rep.t = HOLD_DELAY;
      return;
    }
    if (dir !== rep.dir) {
      rep.dir = dir;
      rep.t = HOLD_DELAY;
      if (dir) step(dir);            // gamepad has no latch, so its edge lands here
      return;
    }
    if (dir && repeatable) {
      rep.t -= dt;
      if (rep.t <= 0) { rep.t = HOLD_RATE; step(dir); }
    }
  }

  function processHeldInput(dt) {
    /* THE TITLE'S LOAD WINDOW IS DEAD TO INPUT — every control, not just accept.
     *
     * DROPPED, NOT HELD, and that is the whole point of doing it here rather
     * than only in confirm(). `inputLock` below deliberately KEEPS latches so a
     * press made during a 120 ms transition still lands; do that here and a
     * player who taps through the load has their press queued and fired on the
     * instant the prompt appears — which is the skip this exists to prevent,
     * moved half a second later. Nothing pressed before the screen asked is
     * remembered.
     *
     * Pad edges are advanced rather than held for the same reason: a button
     * already down when the gate opens must not read as a fresh press. */
    if ((phase === 'title' && !titleReady()) || barCut.active || introDeferred) {
      dropLatches();
      for (const k of Object.keys(padPrev)) padPrev[k] = pad[k];
      repeatV.dir = 0; repeatH.dir = 0;
      return;
    }
    /* A press is being answered. Held exactly the way inputLock holds — latches
     * are kept, not dropped — so a player who presses again during the beat is
     * absorbed by the inputLock the transition raises rather than losing the
     * press outright. */
    if (pressGate.action) { repeatV.dir = 0; repeatH.dir = 0; return; }
    if (inputLock > 0) {
      /* Hold, do not discard. A latch is a flag rather than a counter, so a
       * burst of presses during a 120 ms transition collapses to exactly one
       * queued action — accidental repeats are absorbed, but the press a
       * player actually meant is never thrown away. Gamepad edges are held
       * the same way by simply not advancing padPrev. */
      repeatV.dir = 0; repeatH.dir = 0;
      return;
    }

    if (adjHold) {
      if (adjustRow < 0 || !optionPage) adjHold = null;
      else { adjHold.t -= dt; if (adjHold.t <= 0) { adjHold.t = HOLD_RATE; selection = adjustRow; adjustOption(adjHold.dir); } }
    }
    axis(repeatV, dt, 'up', 'down', held('up'), held('down'), move, true);
    /* Left/right does one of two jobs and never both: it slides an option row's
     * value, or — on a screen whose list is laid out ACROSS rather than down —
     * it moves the cursor. The case file's action row is the second kind, so
     * "forward" walks toward START MISSION and "backward" toward GO BACK, which
     * is the direction the buttons actually sit in.
     *
     * Up/down is left working on those screens too. It costs nothing and a
     * player who reaches for it should never find the row dead. */
    axis(repeatH, dt, 'left', 'right', held('left'), held('right'),
      (d) => { if (optionPage) adjustOption(d); else if (horizontalList()) move(d); },
      !!optionPage);

    if (takeLatch('accept') || (pad.accept && !padPrev.accept)) confirm();
    if (takeLatch('back') || (pad.back && !padPrev.back)) back();
    /* Gated like every other press, and that is load-bearing rather than tidy:
     * pad button 2 raises BOTH `accept` and `skip`, so on the intro this fires
     * in the same frame as confirm() above. Ungated it ran finishIntro()
     * immediately while confirm()'s beat was still in flight, and the deferred
     * action then landed on whatever screen the skip had already moved to.
     * runGated swallows the second of the two. */
    if ((takeLatch('skip') || (pad.skip && !padPrev.skip)) && phase === 'intro') {
      runGated(finishIntro, navForward);
    }

    for (const k of Object.keys(padPrev)) padPrev[k] = pad[k];
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }

  let lastPointer = { x: -1, y: -1 };

  function hitTest(p) {
    for (let i = hitboxes.length - 1; i >= 0; i--) {
      const h = hitboxes[i];
      if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return h;
    }
    return null;
  }

  function onPointerMove(e) {
    if (!active()) return;
    if (darkiTool.on) { darkiToolPointerMove(pointerPos(e)); return; }
    if (inputLock > 0 || pressGate.action) return;
    const p = pointerPos(e);
    /* Chrome emits pointermove for reasons other than movement; without this
     * guard the mouse would steal focus back from the keyboard every frame. */
    if (Math.abs(p.x - lastPointer.x) < 0.5 && Math.abs(p.y - lastPointer.y) < 0.5) return;
    lastPointer = p;
    const hit = hitTest(p);
    if (adjustRow >= 0) return;                    // the adjuster owns the cursor until it is closed
    if (!hit || hit.index === selection) return;   // hovering in place makes no sound
    selection = hit.index;
    navForward();                                  // hovering is moving, not going back
  }

  let pointerDownIndex = -1;

  function onPointerDown(e) {
    if (!active()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    canvas.focus();
    unlockAudio();
    /* The tool takes the pointer whole. Half-owning it — buttons still live
     * under a gizmo you are dragging — is how a positioning session ends up
     * launching a level. */
    if (darkiTool.on) { darkiToolPointerDown(pointerPos(e)); return; }
    if (barCut.active || introDeferred) return;      // a Level 02 cut is moving (request 399)
    /* THE CINEMATIC HAS NO BUTTONS, so a tap on it would otherwise hit-test
     * against nothing and be swallowed. The gesture layer is deliberately off
     * during `intro` (a stray swipe there used to skip the clip), which means
     * real touches land here on the canvas — so this is where the tap is
     * answered. See introTapSkippable for why it is not simply always on. */
    /* …and A SINGLE TAP NEVER SKIPS (request 349): it is usually a thumb waking
     * a dimmed screen. Two taps do, from the moment the hint says so. The studio
     * clip is answered the same way; it used to have no tap skip at all. */
    if (phase === 'intro') {
      if (introFallbackT >= SKIP_TAP.hintAt && videoTap.tap()) { navForward(); finishIntro(); }
      return;
    }
    if (phase === 'splash') {
      if (splashVideoT() >= SKIP_TAP.hintAt && videoTap.tap()) { navForward(); go('title'); }
      return;
    }
    if (inputLock > 0 || pressGate.action) return;
    const hit = hitTest(pointerPos(e));
    if (!hit) return;
    if (String(hit.id).startsWith('optadj:') && adjustRow >= 0) {   // ▼/▲: one step now, more while held
      const dir = hit.id === 'optadj:up' ? 1 : -1;
      selection = adjustRow;
      adjustOption(dir);
      adjHold = { dir, t: HOLD_DELAY };
      pointerDownIndex = -1;
      return;
    }
    selection = hit.index;
    pointerDownIndex = hit.index;
    pressPulse(hit.id);
  }

  function onPointerUp(e) {
    adjHold = null;
    if (darkiTool.on) { darkiToolPointerUp(); return; }
    if (!active() || pointerDownIndex < 0) return;
    const hit = hitTest(pointerPos(e));
    const wasOn = hit && hit.index === pointerDownIndex;
    pointerDownIndex = -1;
    if (!wasOn || inputLock > 0 || pressGate.action) return;
    /* Pointer, key and pad all end up in confirm() — one action system. */
    confirm();
  }

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', clearHeld);
  canvas.addEventListener('pointermove', onPointerMove, true);
  canvas.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp, true);
  canvas.addEventListener('pointerleave', () => { pointerDownIndex = -1; adjHold = null; });
  window.addEventListener('pointercancel', () => { adjHold = null; }, true);
  /* Not passive: the wheel is the scale control while the tool is open, and the
   * page must not scroll under it. Nothing is consumed when it is closed. */
  canvas.addEventListener('wheel', (e) => {
    if (!active() || !darkiTool.on) return;
    e.preventDefault();
    darkiToolWheel(e);
  }, { passive: false });

  function pollGamepad() {
    if (!active() || !navigator.getGamepads) return;
    const gp = Array.from(navigator.getGamepads()).find(Boolean);
    if (!gp) { for (const k of Object.keys(pad)) pad[k] = false; return; }
    const btn = (i) => !!gp.buttons[i]?.pressed;
    pad.up = btn(12) || (gp.axes[1] || 0) < -0.55;
    pad.down = btn(13) || (gp.axes[1] || 0) > 0.55;
    pad.left = btn(14) || (gp.axes[0] || 0) < -0.55;
    pad.right = btn(15) || (gp.axes[0] || 0) > 0.55;
    pad.accept = btn(0) || btn(2);      // cross / square style primary
    pad.back = btn(1);                  // circle style secondary
    pad.skip = btn(2);
    if (pad.up || pad.down || pad.accept || pad.back) unlockAudio();
  }

  /* ------------------------------------------------------------ ui atoms */

  function getFx(id) {
    let s = fx.get(id);
    if (!s) { s = { focus: 0, press: 0, hover: 0 }; fx.set(id, s); }
    return s;
  }

  function pressPulse(id) { getFx(id).press = 1; }

  /* ------------------------------------------------------- the press beat
   * Nothing commits on the same frame as the button that asked for it.
   *
   * Every confirm and every cancel is held for PRESS_BEAT while the control the
   * player actually pressed answers them — it compresses under the press, a
   * ring scales out of its edges, and four ticks fire off its sides — and only
   * then does the screen change. Without it the answer to a press was the next
   * screen arriving, which reads as the button having done nothing and the game
   * having decided on its own.
   *
   * 0.19 s was chosen against the two failure modes rather than by taste: under
   * ~0.12 s the ring is gone before the eye finds it, and past ~0.25 s the menu
   * starts feeling like it is thinking. It also has to clear the button's own
   * 0.115 s press decay, so the click is fully seen springing back before the
   * cut. The nav cue still fires on the PRESS — the ear must not wait.
   */
  const PRESS_BEAT = 0.19;
  const pressGate = { action: null, t: 0, rect: null };
  /* True only while the gate is running its action. Actions can call back into
   * confirm()/back() (the case file's GO BACK does exactly that), and those must
   * run straight through — the beat they would ask for is the one already
   * playing. */
  let pressRunning = false;
  /* The cue is played once, at press time, by whoever opened the gate. The
   * deferred action still runs its own navForward/navBack, so the first of those
   * is swallowed rather than doubling the sound. */
  let suppressNavCue = false;
  /* Where the accept glyph was last drawn in the control bar. The fallback rect
   * for screens that confirm without showing a button — the Cross in the hint
   * bar IS the affordance there, so it is what answers. */
  let acceptGlyph = null;

  /* The thing on screen that this press belongs to. Hitboxes and acceptGlyph are
   * both rebuilt every draw and read here during update, so they describe the
   * frame the player was looking at when they pressed — which is the one that
   * should answer. */
  function focusRect() {
    for (const h of hitboxes) if (h.index === selection) return h;
    return acceptGlyph;
  }

  function runGated(fn, cue) {
    if (pressRunning) { fn(); return; }      // already inside a beat — pass through
    if (pressGate.action) return;            // a beat is in flight; swallow the press
    pressGate.action = fn;
    pressGate.t = 0;
    pressGate.rect = focusRect();
    if (pressGate.rect?.id) pressPulse(pressGate.rect.id);
    /* ON THE PRESS, not on the action a beat later. The whole point of a haptic
     * is that it lands under the thumb at the instant the button goes down —
     * firing it when the deferred action runs would put it 190 ms late, which
     * is late enough to feel like a separate event rather than like the click.
     * It sits beside pressPulse for the same reason: the visual and the physical
     * are one answer to one press. */
    if (hapticTick()) hapticsFired++;
    cue();
    suppressNavCue = true;
  }

  function tickPressGate(dt) {
    if (!pressGate.action) return;
    pressGate.t += dt;
    if (pressGate.t < PRESS_BEAT) return;
    const fn = pressGate.action;
    pressGate.action = null;
    pressRunning = true;
    try { fn(); } finally { pressRunning = false; suppressNavCue = false; }
  }

  /* PRESS HAPTICS. `settings.vibration` existed in OPTIONS and was read by
   * game.js's `rumbleController` only, so the toggle did nothing on any menu
   * screen. A press is exactly the event it should speak for, so this honours
   * the same setting on the same two words.
   *
   * IT NOW SPEAKS FOR THE WHOLE PRESS. The press beat used to bloom a halo over
   * the control as well; that was removed, so the haptic is the only thing left
   * answering under the thumb and it was tuned up to carry that alone. 45 ms at
   * 0.22/0.45 was a tick meant to sit UNDER a visual — on its own it is easy to
   * miss, especially through a phone case. PRESS_HAPTIC below is the one row to
   * retune it from.
   *
   * TWO ACTUATORS, NOT ONE. A gamepad rumbles through `vibrationActuator`; a
   * phone — which is the device the removed highlight was smearing in the first
   * place — has no gamepad at all and rumbles through `navigator.vibrate`. The
   * old code only knew about the first, so on touch there was nothing to "leave
   * only": removing the bloom would have left the press silent AND still. Both
   * are tried, and either one counts as fired.
   *
   * Silent when there is no pad, no vibrator, or the browser refuses — that is
   * the normal case on a desktop with a mouse, not an error. */
  const PRESS_HAPTIC = {
    ms: 80,          // was 45. Long enough to register as a thump, short of the
                     // 105-175 ms range rumbleImpact uses for an actual hit.
    strong: 0.60,    // was 0.22 — the low-frequency motor, the part you FEEL
    weak: 0.90,      // was 0.45 — the high-frequency motor, the part you hear
    phoneMs: 55,     // navigator.vibrate is a single on/off motor: only length
                     // is tunable, and 55 ms is a firm tap rather than a tickle
  };
  /* `fired` means an actuator API ACCEPTED the call, which is as close to the
   * truth as this side can get: `navigator.vibrate` returns true on a desktop
   * with no vibration hardware at all, and `playEffect` resolves without ever
   * reporting whether a motor moved. `pad` is the one unambiguous signal — a
   * connected gamepad with a real actuator — so it is counted apart rather than
   * folded in, or a harness could not tell a rumbling controller from Chrome
   * politely saying yes to nothing. */
  let hapticsFired = 0;
  let hapticsPad = 0;
  let hapticsWanted = 0;     // presses that asked for one (see hapticTick)
  function hapticTick(duration = PRESS_HAPTIC.ms, strong = PRESS_HAPTIC.strong,
                      weak = PRESS_HAPTIC.weak) {
    if (settings.vibration === false) return false;
    /* Counted BEFORE the hardware lookup, and this split is the only thing that
     * makes any of this checkable. A headless browser has no gamepad and no
     * vibrator, so a counter that only ticked on a successful rumble would read
     * 0 whether the call site fired or had been deleted. `wanted` is the part
     * this code owns: a press happened and vibration is enabled. `fired` is the
     * part the hardware owns. */
    hapticsWanted++;
    let fired = false;

    /* The phone. Tried FIRST and not short-circuited by the pad branch: a
     * tablet with a controller paired should answer on both, and neither is
     * more "the" haptic than the other. Wrapped because a browser that has the
     * method can still throw on it (an iframe without the permission, a user
     * gesture requirement not yet met), and a refused buzz must never take the
     * press down with it. */
    try {
      if (typeof navigator.vibrate === 'function'
          && navigator.vibrate(Math.round(PRESS_HAPTIC.phoneMs))) fired = true;
    } catch { /* no vibrator, or the browser declined — not an error */ }

    if (!navigator.getGamepads) return fired;
    let gp = null;
    try { gp = Array.from(navigator.getGamepads()).find((p) => p?.connected) || null; }
    catch { return fired; }
    const actuator = gp?.vibrationActuator || gp?.hapticActuators?.[0];
    if (!actuator) return fired;
    try {
      if (typeof actuator.playEffect === 'function') {
        actuator.playEffect('dual-rumble', {
          startDelay: 0, duration: Math.round(duration),
          strongMagnitude: clamp(strong, 0, 1), weakMagnitude: clamp(weak, 0, 1),
        })?.catch?.(() => {});
        hapticsPad++;
        return true;
      }
      if (typeof actuator.pulse === 'function') {
        actuator.pulse(clamp(Math.max(strong, weak), 0, 1), Math.round(duration))?.catch?.(() => {});
        hapticsPad++;
        return true;
      }
    } catch { /* a pad that refuses to rumble is not a reason to refuse the press */ }
    return fired;
  }

  /* THE PRESS BEAT NO LONGER DRAWS ANYTHING OF ITS OWN.
   *
   * It used to paint a soft radial bloom over the control for the length of the
   * beat — a lit halo under the thumb, which on a touch screen is precisely the
   * smear the finger is already covering. Removed by request: the answer to a
   * press is now the button's own compression (`pressPulse`, a crisp scale that
   * is not a highlight) and the haptic, which was made firmer to carry the
   * weight the bloom used to. See `hapticTick`.
   *
   * `pressGate.rect` is still resolved and still pulsed — it is what tells the
   * beat WHICH control answered — so removing the draw did not make it dead.
   * The browser's own tap flash is killed in styles.css; a canvas cannot opt out
   * of that from here. */

  function tickFx(dt) {
    for (const s of fx.values()) {
      s.focus = approach(s.focus, s.target || 0, 0.055, dt);   // ~180 ms settle
      s.press = Math.max(0, s.press - dt / 0.115);             // ~115 ms release
      s.target = 0;                                            // re-armed each draw
    }
  }

  let fontTrack = 0;                 // the tracking setFont last applied (request 489)
  function setFont(weight, size, spacing = 0, family = FONT) {
    ctx.font = `${weight} ${size}px ${family}`;
    fontTrack = ('letterSpacing' in ctx) ? spacing : 0;
    if ('letterSpacing' in ctx) ctx.letterSpacing = spacing ? `${spacing}px` : '0px';
  }
  /* CENTRED, TRACKED TEXT, TRULY CENTRED (request 489). Canvas letter-spacing is
   * added after EVERY glyph — the last one too — so a centred tracked string sits
   * half a spacing left of where it was asked for, against anything (a bar, a
   * rule) that is centred exactly. Used where that shows: the level-title
   * loading screens, whose title and percentage sit over a centred bar. */
  function fillCentred(text, x, y) {
    const a = ctx.textAlign;
    ctx.textAlign = 'center';
    ctx.fillText(text, x + fontTrack / 2, y);
    ctx.textAlign = a;
  }

  /* Every headline that used to be set in Impact goes through here, and the
   * numbers passed in are STILL THE IMPACT ONES. That is deliberate: the
   * conversion is one constant in one place instead of thirty hand-edited
   * sizes, so it can be re-tuned by changing two numbers and re-shooting the
   * screens (_chromakey/fontshots.js).
   *
   * WHY IT HAS TO CONVERT AT ALL — measured by _chromakey/fontmetrics.js:
   *   Montserrat is 1.44x (w700) / 1.47x (w900) WIDER than Impact, same px.
   *   Its cap height is 0.70 em against Impact's 0.81.
   * Those pull opposite ways and you cannot satisfy both. Matching Impact's
   * WIDTH would need 0.70x, which drops the cap to 60% of what it was and every
   * headline reads weedy; matching its CAP needs 1.16x, which overflows the
   * plates by half. So `size` splits the difference toward keeping the type
   * looking like a headline, and `track` takes most of the width back instead —
   * Impact needed generous tracking to breathe, Montserrat is already open, so
   * the old letter-spacing on top of the wider face was the real overflow.
   *
   * Net effect at these numbers: ~1.24x the old width, ~0.74x the old cap. The
   * places where that 24% actually broke something were found by looking at the
   * shots, not by predicting them, and are fixed at their own call sites. */
  function setDisplay(weight, impactSize, impactTrack = 0) {
    setFont(weight, +(impactSize * DISPLAY_FIT.size).toFixed(2), impactTrack * DISPLAY_FIT.track);
  }

  /* Rolling section timings — cheap enough to leave in, and the only way to
   * tell a slow blur from a slow sprite without guessing. */
  const prof = { frame: 0, scene: 0, blur: 0, ui: 0, n: 0 };
  const now = () => performance.now();
  function profAdd(k, t0) { prof[k] += now() - t0; }

  function captureBackdrop() {
    /* Snapshot whatever is on the canvas right now, downscaled and blurred.
     * One pass per frame regardless of how many glass panels sample it. */
    blurCtx.setTransform(1, 0, 0, 1, 0, 0);
    blurCtx.globalAlpha = 1;
    blurCtx.filter = 'blur(4px)';
    blurCtx.clearRect(0, 0, blurW, blurH);
    blurCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, blurW, blurH);
    blurCtx.filter = 'none';
    blurValid = true;
  }

  /* Greedy word wrap against whatever font is CURRENTLY set — measureText only
   * means anything after setFont, so the caller sets the font first. Returns the
   * lines; it draws nothing, so a caller can measure a block's height before
   * committing to a layout. */
  function wrapLines(text, maxW) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxW) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  /* A run of wrapped lines from a baseline. Returns the next free baseline, so
   * stacked paragraphs do not need hand-counted y values. */
  function textBlock(text, x, y, maxW, lineH) {
    const lines = wrapLines(text, maxW);
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * lineH);
    return y + lines.length * lineH;
  }

  /* The same block, revealed a character at a time.
   *
   * Two things make this a typewriter rather than a clipped string:
   *
   * The text is wrapped in FULL first and the full height is always returned, so
   * the copy underneath never moves as characters arrive. Wrapping the revealed
   * substring instead would re-flow the page under itself on almost every frame
   * — the last word would jump to the next line and back — and a page that
   * reflows while you read it is a page nobody can read.
   *
   * And the reveal is counted over the wrapped lines, not over the source
   * string, because a line break consumes the space it replaced. Counting raw
   * string indices would run the reveal head ahead of the drawn text by one
   * character per line.
   *
   * Returns the next free baseline (as textBlock does) plus where the reveal
   * head is, so the caller can put a caret on it. */
  function textBlockTyped(text, x, y, maxW, lineH, reveal) {
    const lines = wrapLines(text, maxW);
    const r = clamp(reveal, 0, 1);
    let total = lines.length - 1;                 // the breaks
    for (const l of lines) total += l.length;
    const shown = Math.round(r * total);
    const out = { next: y + lines.length * lineH, endX: x, endY: y, drew: false, typing: r < 1 };
    let seen = 0;
    for (let i = 0; i < lines.length; i++) {
      if (seen >= shown) break;                   // nothing on this line yet
      const line = lines[i];
      const take = Math.min(line.length, shown - seen);
      const part = take === line.length ? line : line.slice(0, take);
      const ly = y + i * lineH;
      ctx.fillText(part, x, ly);
      out.drew = true;
      out.endX = x + ctx.measureText(part).width;
      out.endY = ly;
      seen += line.length + 1;
    }
    return out;
  }

  /* The reveal head. Solid while characters are landing, a slow blink while the
   * narrator is between sentences — the grammar a terminal uses, and the reason
   * a page with one of these on it reads as being WRITTEN rather than shown. */
  function typeCaret(x, y, size, typing) {
    ctx.save();
    ctx.globalAlpha *= typing ? 0.92 : 0.22 + 0.68 * breathe(clock, 1.15);
    ctx.fillStyle = C.cream;
    ctx.fillRect(x + 1.5, y - size * 0.76, Math.max(2, size * 0.5), size * 0.88);
    ctx.restore();
  }

  /* Light raking across a panel, on a loop.
   *
   * Two passes, not one: a wide soft body and a narrow bright specular a beat
   * behind it, at different speeds. One bar sliding past on a fixed period reads
   * as a barber's pole; two at different widths read as a moving highlight on
   * glass. Each pass crosses in the first `cross` of its period and the panel
   * sits quiet for the rest, which is what keeps a permanent loop from becoming
   * wallpaper. Driven by `clock`, deliberately NOT the voiceover clock — the
   * light must keep moving after the read has finished. */
  function glimmer(x, y, w, h, r, opt = {}) {
    const period = opt.period ?? 3.9;
    const cross = opt.cross ?? 0.42;
    const passes = opt.passes ?? [
      { off: 0.000, band: 168, a: 0.075 },   // the body of the light
      { off: 0.055, band: 44, a: 0.150 },    // the specular edge, trailing it
    ];
    ctx.save();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of passes) {
      const u = (clock / period + p.off) % 1;
      const k = u / cross;
      if (k > 1) continue;                       // resting
      const cx = x - p.band + k * (w + p.band * 2);
      /* The gradient axis is deliberately diagonal: it tilts the band without a
       * rotate, which would need its own clip to stay in the panel. */
      const g = ctx.createLinearGradient(cx - p.band / 2, y, cx + p.band / 2, y + h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,241,214,${(p.a * hump(k)).toFixed(4)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  function hairline(x, y, w, alpha = 0.09) {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(x, y, w, 1);
  }

  /* Dark smoked glass: blurred backdrop, dark fill, hairline border, an inner
   * top highlight, a soft drop shadow and a whisper of grain. */
  function glass(x, y, w, h, r = 10, opt = {}) {
    const tint = opt.tint ?? C.glass;
    ctx.save();
    if (opt.shadow !== false) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 8;
      roundRectPath(ctx, x, y, w, h, r);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();
      ctx.restore();
    }
    roundRectPath(ctx, x, y, w, h, r);
    ctx.save();
    ctx.clip();
    /* The caller's alpha is MULTIPLIED into the blur pass, never overwritten.
     * This used to set globalAlpha to 1 and then back to 1, which exempted every
     * glass panel on every screen from the fade it was drawn inside: beginScreen
     * eased the text in over a panel that had already snapped to full opacity,
     * and messagePlate faded its message over a plate that did not fade. */
    const a0 = ctx.globalAlpha;
    if (blurValid) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = a0 * (opt.blurAlpha ?? 1);
      ctx.drawImage(blurCanvas, 0, 0, blurW, blurH, 0, 0, W, H);
      ctx.globalAlpha = a0;
    }
    ctx.fillStyle = tint;
    ctx.fillRect(x, y, w, h);
    /* Inner light down the top edge, so the pane reads as glass not paint. */
    const lift = ctx.createLinearGradient(0, y, 0, y + Math.min(h, 90));
    lift.addColorStop(0, 'rgba(255,255,255,0.055)');
    lift.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lift;
    ctx.fillRect(x, y, w, Math.min(h, 90));
    if (grainPattern) {
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = grainPattern;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = opt.border ?? C.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function icon(name, cx, cy, size, color, alpha = 1, weight = 1.65) {
    const fn = ICONS[TOUCH_ICON[name] && isTouchUI() ? TOUCH_ICON[name] : name];
    if (!fn) return;
    ctx.save();
    /* MULTIPLIED, not assigned.
     *
     * This was `ctx.globalAlpha = alpha`, which THREW AWAY whatever fade the
     * caller had already set. Every panel in the game fades by setting
     * globalAlpha and then drawing its contents, so an icon inside one ignored
     * the fade completely and kept drawing at its own opacity: the mission
     * card's green tick stayed burned on screen after the card it belongs to
     * had gone. It looked like a stuck sprite and was a compositing bug.
     *
     * Every icon in the game goes through here, so this fixes the tick, the
     * gear, the pad glyphs and the hint bar in one place. */
    ctx.globalAlpha *= alpha;
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = weight * 24 / size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    fn(ctx);
    ctx.restore();
  }

  /* One button, one look, every screen. `state.focus` drives the whole
   * transition so nothing can be half-focused in two places at once. */
  function button(o) {
    const { id, x, y, w, h, label, index } = o;
    const s = getFx(id);
    s.target = o.focused ? 1 : 0;
    const f = s.focus;
    const p = s.press;
    const disabled = !!o.disabled;
    const hero = !!o.hero;

    /* Breathing on the resting focus glow — alive, but calm. */
    const breathe = hero || o.focused ? 0.86 + Math.sin(clock * 2.1) * 0.14 : 1;
    const shake = o.shake ? Math.sin(clock * 62) * o.shake * 3 : 0;

    ctx.save();
    /* Press compresses about the button's own centre: 98.5% at full press. */
    const sc = 1 - 0.015 * p;
    ctx.translate(x + w / 2 + f * 3 + shake, y + h / 2);
    ctx.scale(sc, sc);
    ctx.translate(-(x + w / 2), -(y + h / 2));

    const r = 7;

    if (f > 0.01 && !disabled) {
      ctx.save();
      ctx.shadowColor = `rgba(255,122,31,${(0.34 * f + 0.16 * p) * breathe})`;
      ctx.shadowBlur = 22 * f + 8 * p;
      roundRectPath(ctx, x, y, w, h, r);
      ctx.fillStyle = 'rgba(0,0,0,0.01)';
      ctx.fill();
      ctx.restore();
    }

    roundRectPath(ctx, x, y, w, h, r);
    ctx.save();
    ctx.clip();
    const base = disabled ? 'rgba(8,11,17,0.42)' : 'rgba(13,18,27,0.62)';
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);
    if (f > 0.01 && !disabled) {
      const g = ctx.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, `rgba(255,122,31,${(0.20 + 0.10 * p) * f})`);
      g.addColorStop(0.55, `rgba(255,138,52,${0.075 * f})`);
      g.addColorStop(1, `rgba(255,160,77,${0.028 * f})`);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = `rgba(255,255,255,${0.05 * f + 0.05 * p})`;
      ctx.fillRect(x, y, w, h * 0.5);
    }
    if (grainPattern && !disabled) {
      ctx.globalAlpha = 0.22 + 0.20 * f;
      ctx.fillStyle = grainPattern;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    /* Border brightens with focus; a solid orange bar marks the live item so
     * selection never depends on colour alone. */
    roundRectPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = disabled
      ? 'rgba(120,140,170,0.10)'
      : `rgba(${lerp(150, 255, f)},${lerp(176, 138, f)},${lerp(214, 52, f)},${lerp(0.14, 0.85, f) * breathe})`;
    ctx.lineWidth = 1 + 0.35 * f;
    ctx.stroke();

    if (f > 0.01 && !disabled) {
      ctx.save();
      roundRectPath(ctx, x, y, w, h, r);
      ctx.clip();
      ctx.fillStyle = `rgba(255,122,31,${0.95 * f})`;
      ctx.fillRect(x, y, 3 * f, h);
      ctx.restore();
    }

    const tint = disabled
      ? C.dim
      : f > 0.5 ? C.cream : `rgba(${lerp(195, 255, f)},${lerp(202, 230, f)},${lerp(214, 191, f)},1)`;

    const padX = hero ? 26 : 22;
    if (o.icon) {
      icon(o.icon, x + padX, y + h / 2, hero ? 22 : 18,
        disabled ? C.dim : f > 0.35 ? C.orangeSoft : C.text, disabled ? 0.55 : 0.72 + 0.28 * f);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    setFont(hero ? 700 : 600, hero ? 19 : 15.5, hero ? 2.2 : 1.5);
    ctx.fillStyle = tint;
    ctx.globalAlpha = disabled ? 0.55 : 1;
    ctx.fillText(label, x + padX + (o.icon ? (hero ? 30 : 26) : 0), y + h / 2 + 0.5);
    ctx.globalAlpha = 1;

    if (o.value) {
      ctx.textAlign = 'right';
      setFont(600, 14, 0.6);
      ctx.fillStyle = f > 0.4 ? C.gold : C.muted;
      ctx.fillText(o.value, x + w - 20, y + h / 2 + 0.5);
    }

    if (disabled && o.note) {
      ctx.textAlign = 'right';
      setFont(600, 10.5, 1.2);
      ctx.fillStyle = 'rgba(120,130,145,0.75)';
      ctx.fillText(o.note, x + w - 18, y + h / 2 + 0.5);
    }

    /* The chevron on the live item — the reference's forward affordance. */
    if (!disabled && f > 0.02) {
      ctx.save();
      ctx.globalAlpha = f;
      ctx.strokeStyle = C.orangeSoft;
      ctx.lineWidth = 1.9;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const ax = x + w - 20, ay = y + h / 2, k = 4.6;
      ctx.beginPath();
      ctx.moveTo(ax - k * 0.62, ay - k);
      ctx.lineTo(ax + k * 0.32, ay);
      ctx.lineTo(ax - k * 0.62, ay + k);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    if (index !== undefined) hitboxes.push({ x, y, w, h, index, id });
  }

  /* ------------------------------------------------------- screen chrome */

  function drawBackground(darken = 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (bgReady && bgVideo.videoWidth) {
      /* Cover-fit: the frame is cropped, never stretched. */
      const vw = bgVideo.videoWidth, vh = bgVideo.videoHeight;
      const s = Math.max(W / vw, H / vh);
      const dw = vw * s, dh = vh * s;
      ctx.drawImage(bgVideo, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#161a2c');
      g.addColorStop(0.6, '#0a0d16');
      g.addColorStop(1, '#05070b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    /* Environmental atmosphere: a cool night wash, a warm lift where the
     * street lights are, and extra shade under the left panel. */
    const wash = ctx.createLinearGradient(0, 0, 0, H);
    wash.addColorStop(0, 'rgba(10,16,34,0.42)');
    wash.addColorStop(0.55, 'rgba(6,9,17,0.20)');
    wash.addColorStop(1, 'rgba(3,5,9,0.50)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);

    const side = ctx.createLinearGradient(0, 0, W * 0.46, 0);
    side.addColorStop(0, 'rgba(2,4,8,0.72)');
    side.addColorStop(1, 'rgba(2,4,8,0)');
    ctx.fillStyle = side;
    ctx.fillRect(0, 0, W * 0.46, H);

    if (darken > 0) {
      ctx.fillStyle = `rgba(3,5,9,${darken})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W * 0.52, H * 0.46, H * 0.30, W * 0.52, H * 0.46, H * 0.92);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* THE GRAIN IS OFF — removed by request, 2026-08-25.
   *
   * It was a 96 px deterministic noise tile laid over every screen at half
   * alpha and DRIFTING, 47 px/s across and 31 px/s down. Standing still it
   * would have been film grain; moving, it read as dust crawling over the art,
   * which is what was asked to go.
   *
   * One switch rather than fifteen deleted calls: `drawGrain` is called by
   * every screen here AND twice by the pause overlay through `ui`, so ripping
   * it out means touching all of that to remove a taste decision that may well
   * come back. Set this above 0 to restore it — the tile is only built when it
   * is going to be used. */
  const GRAIN_ALPHA = 0;

  function drawGrain(alpha = 1) {
    if (GRAIN_ALPHA <= 0 || !grainPattern) return;
    ctx.save();
    ctx.globalAlpha = GRAIN_ALPHA * alpha;
    /* Integer drift so the tile shimmers without ever resampling. */
    const ox = Math.floor(clock * 47) % 96;
    const oy = Math.floor(clock * 31) % 96;
    ctx.translate(-ox, -oy);
    ctx.fillStyle = grainPattern;
    ctx.fillRect(0, 0, W + 96, H + 96);
    ctx.restore();
  }

  /* ------------------------------------------------- Darki placement handle
   * Live positioning for the figure on the menu plate, driven from the console
   * through `__rorMenu.darki` (see the debug surface at the bottom of the file).
   *
   * Persisted, because placing him is an eyeball job done over several relaunches
   * and losing the last nudge on every reload makes that miserable. It therefore
   * SAYS SO on the console when a saved placement is in force: a stored override
   * that silently outranks the code is how "it looks different on my machine"
   * happens. `darkiReset()` clears it.
   */
  const DARKI_SAVE = 'ratelrage.darkiPlacement';
  const DARKI_DEFAULT = { ...L.darki };

  /* Every save records the code default it was nudged AWAY from, and a save
   * whose stamp no longer matches is dropped on load.
   *
   * The point is that BAKING A PLACEMENT INTO `L.darki` ACTUALLY TAKES EFFECT.
   * Without this, the tool's own saves outrank the code forever: once anyone has
   * dragged the figure, editing the default moves him for exactly nobody who did
   * — including the person who asked for the edit, on the machine they asked
   * from. The stamp is the default itself rather than a hand-bumped version
   * number, because a version you have to remember to bump is a version that
   * does not get bumped. */
  const DARKI_STAMP = JSON.stringify(DARKI_DEFAULT);

  /* Feet must stay BELOW the horizon or figureH goes zero/negative and he
   * inverts — that is a hard limit of the ground plane, not a taste clamp. */
  const clampPlacement = (v) => ({
    cx: clamp(Number.isFinite(v.cx) ? v.cx : L.darki.cx, -400, W + 400),
    feet: clamp(Number.isFinite(v.feet) ? v.feet : L.darki.feet, GROUND.horizon + 20, H + 300),
    scale: clamp(Number.isFinite(v.scale) ? v.scale : L.darki.scale, 0.1, 4),
    /* Anything negative means mirrored, so `flip: false` and `flip: -1` both do
     * the obvious thing rather than one of them silently meaning "no". */
    flip: (v.flip === false || Number(v.flip) < 0) ? -1 : 1,
  });

  /* `persist: false` is for a live DRAG. The placement is saved on every change
   * so a relaunch keeps it, but a drag changes it sixty times a second and
   * writing localStorage on each of those frames is a stall you can feel in the
   * gesture. The drag persists once, on release. */
  function patchDarki(v = {}, { persist = true } = {}) {
    Object.assign(L.darki, clampPlacement({ ...L.darki, ...v }));
    if (persist) saveDarkiPlacement();
    return darkiPlacement();
  }

  function saveDarkiPlacement() {
    try {
      localStorage.setItem(DARKI_SAVE, JSON.stringify({ ...L.darki, from: DARKI_STAMP }));
    } catch {}
  }

  function darkiPlacement() {
    const ground = figureH(L.darki.feet);
    return {
      cx: +L.darki.cx.toFixed(1),
      feet: +L.darki.feet.toFixed(1),
      scale: +L.darki.scale.toFixed(3),
      flip: L.darki.flip,
      drawnHeight: Math.round(ground * L.darki.scale),
      groundHeight: Math.round(ground),      // what the plate's perspective says
      saved: hasDarkiSave(),
    };
  }

  const hasDarkiSave = () => {
    try { return !!localStorage.getItem(DARKI_SAVE); } catch { return false; }
  };

  function loadDarkiPlacement() {
    let raw = null;
    try { raw = localStorage.getItem(DARKI_SAVE); } catch { return; }
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      /* Stale: the code default moved under it. Drop it and let the new default
       * stand — see DARKI_STAMP. A save from before stamping carries no `from`
       * at all, which is likewise not this default and is likewise dropped. */
      if (saved.from !== DARKI_STAMP) {
        try { localStorage.removeItem(DARKI_SAVE); } catch {}
        console.info('[ratel-ui] menu Darki: dropped a saved placement from an older ' +
          'code default — using the current one:', darkiPlacement());
        return;
      }
      Object.assign(L.darki, clampPlacement({ ...L.darki, ...saved }));
      console.info('[ratel-ui] menu Darki is using a SAVED placement, not the code default:',
        darkiPlacement(), '— __rorMenu.darkiReset() to clear it');
    } catch {
      try { localStorage.removeItem(DARKI_SAVE); } catch {}
    }
  }

  /* One reused buffer for the figure's grade pass — a canvas per frame on a
   * screen that is also decoding video is not a cost worth paying for a tint. */
  let darkiBuf = null, darkiBufCtx = null;
  function darkiScratch(w, h) {
    if (!darkiBuf) { darkiBuf = document.createElement('canvas'); darkiBufCtx = darkiBuf.getContext('2d'); }
    if (darkiBuf.width !== w || darkiBuf.height !== h) { darkiBuf.width = w; darkiBuf.height = h; }
    darkiBufCtx.setTransform(1, 0, 0, 1, 0, 0);
    darkiBufCtx.globalCompositeOperation = 'source-over';
    darkiBufCtx.globalAlpha = 1;
    darkiBufCtx.clearRect(0, 0, w, h);
    return darkiBufCtx;
  }

  function drawDarki(opt = {}) {
    const sheet = assets.darkiIdle;
    if (!sheet) return;
    const cx = opt.cx ?? L.darki.cx;
    const feet = opt.feet ?? L.darki.feet;
    /* Height follows the feet down the ground plane rather than being chosen
     * per screen, so he cannot be one size on the menu and another on the
     * briefing. Pass `h` only to break the rule on purpose.
     *
     * `L.darki.scale` multiplies in for any caller that did NOT pass an explicit
     * `h` — so the handle resizes the figure on every screen at once rather than
     * letting the menu drift away from the others. That is the same "one figure,
     * one scale" rule GROUND exists to enforce. */
    const targetH = opt.h ?? figureH(feet) * L.darki.scale;
    const alpha = opt.alpha ?? 1;

    const contentH = IDLE.footY - IDLE.y0;
    const s = targetH / contentH;                    // uniform — never stretched
    const dw = IDLE.fw * s, dh = IDLE.fh * s;
    const dx = cx - ((IDLE.x0 + IDLE.x1) / 2) * s;
    const dy = feet - IDLE.footY * s;

    /* IDLE.frames, NOT cols*rows — the grid has four empty cells past the end.
     * See IDLE.frames. */
    const frame = Math.floor(clock * IDLE.fps) % IDLE.frames;
    const sx = (frame % IDLE.cols) * IDLE.fw;
    const sy = Math.floor(frame / IDLE.cols) * IDLE.fh;

    /* Contact shadow first: grounds him instead of letting him float. */
    ctx.save();
    const rx = (IDLE.x1 - IDLE.x0) * s * 0.46;
    const g = ctx.createRadialGradient(cx, feet, 0, cx, feet, rx);
    g.addColorStop(0, `rgba(0,0,0,${0.52 * alpha})`);
    g.addColorStop(0.55, `rgba(0,0,0,${0.24 * alpha})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(cx, feet);
    ctx.scale(1, 0.15);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    /* Environmental integration: the scene's cool night sits on top of him at
     * low strength — ON HIS PIXELS, which is the whole idea and which this did
     * not do.
     *
     * `source-atop` clips the fill to the pixels ALREADY IN THE DESTINATION,
     * and the destination was the main canvas with the finished background on
     * it — opaque everywhere. So the gradient landed on the entire sprite
     * RECTANGLE: a hard-edged bluish box around him, +21 red / +32 blue across
     * its left edge and the same across its top, measured. That box is the
     * "line artifact" — the vertical line down his left and the horizontal one
     * running off the top of him.
     *
     * Composited on a scratch canvas instead, where the only opaque pixels ARE
     * him, `source-atop` means what the comment always claimed. The buffer is
     * built at final draw size, so he is resampled exactly once, same as before.
     */
    const bw = Math.max(1, Math.ceil(dw)), bh = Math.max(1, Math.ceil(dh));
    const b = darkiScratch(bw, bh);
    b.imageSmoothingEnabled = true;
    b.imageSmoothingQuality = 'high';
    b.drawImage(sheet, sx, sy, IDLE.fw, IDLE.fh, 0, 0, dw, dh);
    b.globalCompositeOperation = 'source-atop';
    const grade = b.createLinearGradient(0, 0, 0, dh);
    grade.addColorStop(0, 'rgba(96,124,190,0.16)');
    grade.addColorStop(0.62, 'rgba(20,26,44,0.05)');
    grade.addColorStop(1, 'rgba(6,9,16,0.30)');
    b.fillStyle = grade;
    b.fillRect(0, 0, bw, bh);
    b.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.globalAlpha = alpha;
    /* Mirrored about his own centre line (cx), not about the frame — flipping
     * around the canvas would fling him across the screen and make `cx` mean
     * something different depending on `flip`. The graded buffer goes through
     * the same transform, so the grade keeps sitting on his pixels. */
    if (L.darki.flip < 0) {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    ctx.drawImage(darkiBuf, dx, dy);      // 1:1 — the buffer IS the draw size
    ctx.restore();

    /* What was ACTUALLY drawn, for the placement tool to outline. Recorded here
     * rather than recomputed there on purpose: a gizmo that re-derives the box
     * from the same inputs agrees with the draw right up until one of them
     * changes, and then it is a ruler that lies. `own` is whether this screen
     * used the shared placement or passed its own numbers — the tool edits the
     * shared one, so on a screen that overrode it a drag would look dead. */
    darkiDrawn = {
      phase,
      own: opt.cx == null && opt.feet == null,
      cx, feet, s, alpha,
      frame: { x: dx, y: dy, w: dw, h: dh },
      body: {
        x: dx + IDLE.x0 * s, y: dy + IDLE.y0 * s,
        w: (IDLE.x1 - IDLE.x0) * s, h: (IDLE.footY - IDLE.y0) * s,
      },
    };
  }

  /* ------------------------------------------------ the placement tool (F9)
   * An on-screen transform gizmo for the menu figure. The console handle below
   * does the same edits, but placing a figure is an eyeball job and typing
   * `darkiNudge(3, -1)` forty times is not how anyone finds the right spot.
   *
   * DRAWS NOTHING UNTIL IT IS OPENED, so it costs a shipped build nothing but a
   * key that does not otherwise exist. F9 rather than a debug flag because the
   * player testing this is inside a Play window and does not get to add
   * `?debug` to the URL — the gameplay panel's gate, which stays as it is.
   *
   * While it is open it OWNS the input: arrows nudge instead of moving the menu
   * cursor, the pointer drags instead of pressing buttons, Enter does nothing.
   * A half-owned debug mode where a stray arrow key launches a level is worse
   * than no debug mode.
   */
  let darkiDrawn = null;                 // geometry of the last figure drawn
  const darkiTool = { on: false, drag: null, note: '', noteUntil: -1 };
  const DARKI_NUDGE = 1, DARKI_NUDGE_FAST = 10;
  const DARKI_SCALE_STEP = 0.01, DARKI_SCALE_STEP_FAST = 0.05;

  /* Timed off `clock`, not a dt the draw pass would have to be handed: draw()
   * has no clock of its own and giving it one just to fade a line of text is a
   * second timebase to keep honest. */
  function darkiToolNote(text) { darkiTool.note = text; darkiTool.noteUntil = clock + 2.4; }

  function setDarkiTool(on) {
    darkiTool.on = !!on;
    darkiTool.drag = null;
    if (darkiTool.on) {
      clearHeld();                       // no key held from before it opened
      console.info('[ratel-ui] Darki placement tool OPEN —',
        'drag to move, wheel/[ ] to scale, F flip, R reset, C copy, F9 to close');
    } else saveDarkiPlacement();
    return darkiTool.on;
  }

  /* Returns true when the tool consumed the key, so the menu never sees it. */
  function darkiToolKey(e) {
    if (e.code === 'F9') { e.preventDefault(); setDarkiTool(!darkiTool.on); return true; }
    if (!darkiTool.on) return false;
    const fast = e.shiftKey;
    const step = fast ? DARKI_NUDGE_FAST : DARKI_NUDGE;
    const sstep = fast ? DARKI_SCALE_STEP_FAST : DARKI_SCALE_STEP;
    const d = L.darki;
    switch (e.code) {
      case 'ArrowLeft':  patchDarki({ cx: d.cx - step }); break;
      case 'ArrowRight': patchDarki({ cx: d.cx + step }); break;
      case 'ArrowUp':    patchDarki({ feet: d.feet - step }); break;
      case 'ArrowDown':  patchDarki({ feet: d.feet + step }); break;
      case 'BracketLeft': case 'Minus':  patchDarki({ scale: d.scale - sstep }); break;
      case 'BracketRight': case 'Equal': patchDarki({ scale: d.scale + sstep }); break;
      case 'KeyF': patchDarki({ flip: -d.flip }); break;
      case 'KeyR':
        try { localStorage.removeItem(DARKI_SAVE); } catch {}
        Object.assign(L.darki, DARKI_DEFAULT);
        darkiToolNote('reset to the code default');
        break;
      case 'KeyC': copyDarkiCode(); break;
      case 'Escape': setDarkiTool(false); break;
      /* Swallowed, not acted on: while the tool is open these must not reach
       * the menu underneath. */
      case 'Enter': case 'Space': case 'Backspace': case 'KeyW': case 'KeyA':
      case 'KeyS': case 'KeyD': case 'KeyJ': case 'KeyX': break;
      default: return false;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    return true;
  }

  function copyDarkiCode() {
    const line = darkiCodeLine();
    console.info('[ratel-ui]', line);
    /* The clipboard write can be refused (no focus, no permission, no secure
     * context). The line is logged FIRST so the number is never lost to a
     * failed copy, and the note says which of the two happened. */
    try {
      navigator.clipboard.writeText(line)
        .then(() => darkiToolNote('copied to clipboard'))
        .catch(() => darkiToolNote('clipboard refused — the line is in the console'));
    } catch { darkiToolNote('clipboard unavailable — the line is in the console'); }
  }

  const darkiCodeLine = () => {
    const p = darkiPlacement();
    return `darki: { cx: ${p.cx}, feet: ${p.feet}, scale: ${p.scale}, flip: ${p.flip} },`;
  };

  /* Grab-relative from wherever the press landed, so he never jumps to the
   * cursor and a press anywhere on the screen is a usable handle — clicking
   * exactly on a figure to move it by two pixels is the fiddliest possible way
   * to do this. */
  function darkiToolPointerDown(p) {
    darkiTool.drag = { px: p.x, py: p.y, cx: L.darki.cx, feet: L.darki.feet };
  }

  function darkiToolPointerMove(p) {
    const g = darkiTool.drag;
    if (!g) return;
    patchDarki({ cx: g.cx + (p.x - g.px), feet: g.feet + (p.y - g.py) }, { persist: false });
  }

  function darkiToolPointerUp() {
    if (!darkiTool.drag) return;
    darkiTool.drag = null;
    saveDarkiPlacement();                // one write per gesture, not per frame
  }

  function darkiToolWheel(e) {
    const step = e.shiftKey ? DARKI_SCALE_STEP_FAST : DARKI_SCALE_STEP;
    patchDarki({ scale: L.darki.scale - Math.sign(e.deltaY) * step });
  }

  function drawDarkiTool() {
    if (!darkiTool.on) return;
    const p = darkiPlacement();
    const g = darkiDrawn;

    ctx.save();
    /* The ground plane he is sized against — the horizon is why `feet` has a
     * floor, and seeing it is most of understanding why he shrinks as he goes
     * up the screen. */
    ctx.strokeStyle = 'rgba(120,190,255,0.35)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, GROUND.horizon + 0.5);
    ctx.lineTo(W, GROUND.horizon + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    if (g && g.phase === phase) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';   // the drawn frame, padding and all
      ctx.strokeRect(g.frame.x + 0.5, g.frame.y + 0.5, g.frame.w, g.frame.h);
      ctx.strokeStyle = g.own ? 'rgba(120,255,170,0.95)' : 'rgba(255,170,60,0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(g.body.x, g.body.y, g.body.w, g.body.h);   // his actual pixels

      // the anchor: cx down the middle, feet on the contact line
      ctx.beginPath();
      ctx.moveTo(g.cx, g.body.y - 14); ctx.lineTo(g.cx, g.feet + 14);
      ctx.moveTo(g.cx - 22, g.feet); ctx.lineTo(g.cx + 22, g.feet);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.arc(g.cx, g.feet, 3.5, 0, Math.PI * 2); ctx.fill();
    }

    /* ---- the readout ------------------------------------------------------
     * Parked in the GAP, not in the corner. A corner panel covered the menu
     * column, and a tool for placing a figure against a layout that hides the
     * layout is no tool at all. The list ends at L.btn.x + L.btn.w (358) and the
     * profile card starts at L.profile.x (969); this sits between them, above
     * the horizon, so the buttons, the brand and the figure are all still
     * visible while he is being moved. */
    const bw = 372, bh = 214;
    const bx = Math.round((L.btn.x + L.btn.w + L.profile.x - bw) / 2), by = 24;
    glass(bx, by, bw, bh, 12, { tint: 'rgba(8,12,20,0.86)', shadow: true });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#8fe3ff';
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.fillText('DARKI PLACEMENT  ·  F9 to close', bx + 16, by + 26);

    ctx.font = `12px ${FONT_MONO}`;
    ctx.fillStyle = '#e8eef6';
    const rows = [
      `cx    ${p.cx}`,
      `feet  ${p.feet}`,
      `scale ${p.scale}   flip ${p.flip > 0 ? '+1' : '-1'}`,
      `drawn ${p.drawnHeight}px   ground ${p.groundHeight}px`,
    ];
    rows.forEach((r, i) => ctx.fillText(r, bx + 16, by + 50 + i * 17));

    ctx.fillStyle = '#9fb0c4';
    ctx.fillText('drag move · wheel scale · arrows 1px (shift 10)', bx + 16, by + 132);
    ctx.fillText('[ ] scale · F flip · R reset · C copy line', bx + 16, by + 149);

    /* The paste-ready line, which is the whole point: the tool is for finding a
     * number, and the number has to leave with you. */
    ctx.fillStyle = '#ffd479';
    ctx.font = `11px ${FONT_MONO}`;
    ctx.fillText(darkiCodeLine(), bx + 16, by + 174);

    /* Two things a placement tool must SAY rather than let you discover:
     * that a stored override is what you are looking at, and that this screen
     * is not one the shared placement moves. */
    ctx.font = `11px ${FONT_MONO}`;
    let msg = '', col = '#9fb0c4';
    if (!g || g.phase !== phase) { msg = `no figure drawn on '${phase}'`; col = '#ff9d9d'; }
    else if (!g.own) { msg = `'${phase}' sets its own cx/feet — only scale/flip apply here`; col = '#ffb45c'; }
    else if (p.saved) msg = 'saved override in force (R resets to the code default)';
    if (clock < darkiTool.noteUntil) { msg = darkiTool.note; col = '#8fe3ff'; }
    if (msg) { ctx.fillStyle = col; ctx.fillText(msg, bx + 16, by + 194); }
    ctx.restore();
  }

  /* Height of the mark when it is drawn `width` wide. The one place the aspect
   * is applied, so a screen laying the logo out never has to guess. */
  const logoHeight = (width) => width / LOGO_ART.aspect;

  /* Draw the mark with its ink box `width` wide and its BOTTOM edge on
   * `bottomY`. Screens that need to reason about the logo's extent use this
   * with logoHeight(); drawLogo below is the compatibility face for the call
   * sites that were written against the drawn wordmark's type baseline. */
  function drawLogoBox(x, bottomY, width) {
    if (!logoCanvas) return;
    const h = logoHeight(width);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (logoCanvas.art) {
      ctx.drawImage(logoCanvas.canvas, x, bottomY - h, width, h);
    } else {
      /* The drawn wordmark is a different shape and carries its own bearings —
       * lay it out on its own metrics and let it land on the same bottom edge. */
      const { canvas: c, w, h: ch, scale: S, baseY } = logoCanvas;
      const s = width / L.logo.width;
      ctx.translate(x - 12 * s, bottomY - width * LOGO_ART.sinkFrac - baseY * s);
      ctx.drawImage(c, 0, 0, w * S, ch * S, 0, 0, w * s, ch * s);
    }
    ctx.restore();
  }

  function drawBrand() {
    /* Sized off the PANEL, not off the old type baseline. The supplied mark is
     * 4.48:1, so 292 px of width is 65 px of height: bottom on 104 puts its top
     * on 39, a clear 17 px inside the panel's 22, and leaves the same 16 px down
     * to the tagline. Drawn at L.logo.width it would have come within 11 px of
     * the panel edge and read as though it had been dropped in. */
    drawLogoBox(L.logo.x, 104, 292);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    setFont(700, 11.5, 4.4);
    ctx.fillStyle = C.gold;
    ctx.fillText('STREETS OF JUSTICE', L.tagline.x, L.tagline.y);

    setFont(600, 10.5, 2.2);
    ctx.fillStyle = C.muted;
    ctx.fillText('LAGOS, NIGERIA', L.locale.x + 13, L.locale.y);
    ctx.save();
    ctx.translate(L.locale.x + 4, L.locale.y - 3.4);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = C.gold;
    ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
    ctx.restore();
  }

  function drawProfileCard() {
    const { x, y, w, h } = L.profile;
    glass(x, y, w, h, 9);

    const av = 62;
    const ax = x + 12, ay = y + (h - av) / 2;
    ctx.save();
    roundRectPath(ctx, ax, ay, av, av, 6);
    ctx.clip();
    const bg = ctx.createLinearGradient(0, ay, 0, ay + av);
    bg.addColorStop(0, 'rgba(46,58,82,0.95)');
    bg.addColorStop(1, 'rgba(12,16,25,0.95)');
    ctx.fillStyle = bg;
    ctx.fillRect(ax, ay, av, av);
    if (avatarCanvas) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(avatarCanvas, ax - av * 0.06, ay - av * 0.02, av * 1.12, av * 1.12);
    }
    ctx.restore();
    roundRectPath(ctx, ax, ay, av, av, 6);
    ctx.strokeStyle = 'rgba(233,182,84,0.34)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const tx = ax + av + 14;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    setFont(700, 17, 2.6);
    ctx.fillStyle = C.paper;
    ctx.fillText('DARKI', tx, y + 30);

    setFont(600, 10.5, 1.8);
    ctx.fillStyle = C.muted;
    ctx.fillText('LEVEL 1', tx, y + 50);

    ctx.textAlign = 'right';
    ctx.fillStyle = C.gold;
    ctx.fillText('0 / 1000 XP', x + w - 14, y + 50);

    const bx = tx, bw = x + w - 14 - tx;
    const by = y + 60;
    roundRectPath(ctx, bx, by, bw, 5, 2.5);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
    /* Level 1, 0 XP — the bar shows a sliver so the track reads as a bar. */
    roundRectPath(ctx, bx, by, Math.max(4, bw * 0.012), 5, 2.5);
    ctx.fillStyle = C.gold;
    ctx.fill();
  }

  /* `startX` exists for the case file, which puts REAL buttons in the bar's
   * own strip — its hints have to begin clear of them or the legend prints
   * straight through GO BACK. */
  function drawControlBar(hints, startX = 54) {
    /* A dark strip, not a panel — it must not compete with the menu. */
    const g = ctx.createLinearGradient(0, L.barY, 0, H);
    g.addColorStop(0, 'rgba(3,5,9,0)');
    g.addColorStop(0.35, 'rgba(3,5,9,0.62)');
    g.addColorStop(1, 'rgba(3,5,9,0.86)');
    ctx.fillStyle = g;
    ctx.fillRect(0, L.barY, W, H - L.barY);
    ctx.fillStyle = 'rgba(150,176,214,0.10)';
    ctx.fillRect(0, L.barY + 4, W, 1);

    let x = startX;
    ctx.textBaseline = 'middle';
    for (const hint of hints) {
      icon(hint.icon, x, L.hintY, 19, hint.color || C.text, 0.66, 1.5);
      /* Screens that confirm without drawing a button (the character pick, the
       * briefing, the intro) still show the Cross here, so this is the control
       * the press belongs to and the press beat bursts from it. */
      if (hint.icon === 'cross') acceptGlyph = { x: x - 13, y: L.hintY - 13, w: 26, h: 26 };
      ctx.textAlign = 'left';
      setFont(700, 10.5, 2.4);
      ctx.fillStyle = C.muted;
      ctx.fillText(hint.label, x + 15, L.hintY + 0.5);
      x += 15 + ctx.measureText(hint.label).width + 34;
    }
    ctx.textBaseline = 'alphabetic';
  }

  const MENU_HINTS = [
    { icon: 'dpad', label: 'NAVIGATE' },
    { icon: 'cross', label: 'SELECT', color: '#8fb4ff' },
    { icon: 'circleBtn', label: 'BACK', color: '#ff8f8f' },
  ];

  /* Shared page header for every screen that is not the main menu. */
  function screenHead(kicker, title, sub = '') {
    const k = easeOut(phaseT / 0.34);
    ctx.save();
    ctx.translate((1 - k) * -14, 0);
    ctx.globalAlpha = k;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    setFont(700, 11, 4);
    ctx.fillStyle = C.gold;
    ctx.fillText(kicker, 58, 58);
    setDisplay(700, 40, 1.4);
    ctx.fillStyle = C.paper;
    ctx.fillText(title, 56, 104);
    ctx.fillStyle = C.orange;
    ctx.fillRect(58, 118, 62, 3);
    if (sub) {
      setFont(500, 13, 0.2);
      ctx.fillStyle = C.muted;
      ctx.fillText(sub, 58, 142);
    }
    ctx.restore();
  }

  /* A vertical stack of buttons in the shared style. */
  function buttonList(items, x, y, w, rowH, gap, idPrefix) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      button({
        id: `${idPrefix}:${i}`,
        x, y: y + i * (rowH + gap), w, h: rowH,
        label: it.label,
        icon: it.icon,
        value: it.value,
        note: it.note,
        disabled: it.disabled,
        focused: i === selection,
        index: i,
        shake: i === selection ? rejectT : 0,
      });
    }
  }

  function messagePlate() {
    if (messageT <= 0 || !message) return;
    const a = Math.min(1, messageT * 3.4);
    ctx.save();
    ctx.globalAlpha = a;
    setFont(700, 12.5, 2.4);
    const tw = ctx.measureText(message).width;
    const bw = tw + 44, bx = W / 2 - bw / 2, by = H - 116;
    glass(bx, by, bw, 34, 6, { tint: 'rgba(9,13,20,0.88)', border: 'rgba(224,67,44,0.55)' });
    ctx.fillStyle = C.cream;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, W / 2, by + 18);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  /* The screen-change wipe: content eases in, the world behind keeps running. */
  function beginScreen(slide = 16) {
    const k = easeOut(phaseT / 0.26);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate((1 - k) * slide, 0);
    return k;
  }
  const endScreen = () => ctx.restore();

  function transitionVeil() {
    const k = clamp(phaseT / 0.26, 0, 1);
    if (k >= 1) return;
    ctx.fillStyle = `rgba(3,5,9,${(1 - k) * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }

  function clear(color = C.ink) {
    syncCanvas();
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    hitboxes.length = 0;
    acceptGlyph = null;          // re-recorded by whichever control bar draws this frame
    blurValid = false;
  }

  /* A background + atmosphere pass shared by every menu screen, followed by
   * the blur snapshot the glass panels read from. */
  function stage({ darken = 0, darki = null, blur = 0 } = {}) {
    const t0 = now();
    clear();
    drawBackground(darken);
    profAdd('scene', t0);

    /* Depth of field. The blur snapshot is a 320x180 copy, so drawing it back
     * over the full frame is a wide, smooth defocus for the cost of the pass
     * the glass panels already pay — no second filter, no per-frame shader.
     * Deliberately BEFORE Darki: the plate goes soft, he stays sharp, which is
     * what puts him in the street instead of on top of a photograph. */
    if (blur > 0) {
      const tb = now();
      captureBackdrop();
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = Math.min(1, blur);
      ctx.drawImage(blurCanvas, 0, 0, blurW, blurH, 0, 0, W, H);
      ctx.restore();
      profAdd('blur', tb);
    }

    if (darki) drawDarki(darki);
    drawVignette();
    const t1 = now();
    captureBackdrop();          // the snapshot the glass panels sample
    profAdd('blur', t1);
  }

  /* ---------------------------------------------------------- the screens */

  /* How long the tail of the clip spends going to black. The file ends on a
   * WHITE frame and the title screen is near-black, so without this the cut is
   * a flash. Short enough not to eat the logo it is showing off. */
  const SPLASH_FADE = 0.45;

  /* ---- THE HOLD ON THE LOGO ---------------------------------------------
   *
   * 6.006 s of clip is not 6 s of KENCRAFTS. The frame ladder in
   * `_chromakey/splashframes.js` reads the file as four beats:
   *
   *   0.00 - 0.60   white
   *   0.60 - 2.75   the devices tumble in and settle
   *   2.75 - 4.80   the wordmark, held, ink steady at 0.85% of the frame
   *   4.85 - 5.05   the wordmark dissolves (ink 0.79 -> 0.55 -> 0)
   *   5.05 - 6.006  white again
   *
   * So the studio's NAME is legible for about 2.1 s of the six, and the last
   * second is a blank frame the title screen then has to be cut away from.
   * That is the "too short" the hold is for: the clip is paused on the last
   * fully-inked frame and the FREEZE is what gets the extra time, rather than
   * the whole card being slowed down (which would drag the tumble-in too) or
   * the file being re-cut.
   *
   * 4.75 rather than 4.80 — the last sample where ink is unambiguously full,
   * with a frame of margin so a decoder that lands slightly late still parks
   * before the dissolve starts instead of inside it. From the freeze the fade
   * runs on the HOLD's clock, so the clip's own white-out is never reached and
   * the screen goes logo -> black -> title. */
  const SPLASH_HOLD_AT = 4.75;
  const SPLASH_HOLD = 3.0;
  /* And the same beat for the drawn fallback, which had none: `splashFailed`
   * advanced the screen on the frame it was set, so a missing file flashed the
   * studio's name for one frame on its way to the title. The card's own fade
   * in/out is a 1.4 s half-sine, so this is the first number past it that
   * leaves the name standing still for a moment. */
  const SPLASH_CARD = 2.6;
  /* THE STUDIO CARD OPENS THE GAME, and the clip follows it.
   *
   * "KENCRAFTS STUDIO / PRESENTS" on black used to be the FAILURE path only —
   * drawn when the video 404'd. It is now the first beat of a healthy run too:
   * two seconds of the name on black, then the clip. The card is where the
   * game introduces itself and the clip is the show; running straight into the
   * video gave the studio no moment of its own.
   *
   * The video is NOT started during the lead. It could be — it preloads from
   * boot — but playing it behind a black card would spend the first two
   * seconds of a six-second clip where nobody can see them. Delaying the start
   * also means the "never begin mid-buffer" wait has almost always already
   * been satisfied by the time the card clears. */
  const SPLASH_CARD_LEAD = 2.0;
  /* Deadlock guard only — see the advance in update(). Comfortably past the
   * 6.006 s clip plus its hold, AND past the card lead that now precedes both,
   * so a healthy playthrough never reaches it. */
  const SPLASH_MAX = 12 + SPLASH_CARD_LEAD;

  function drawSplashVideo() {
    /* COVER, per the owner's call: the studio card fills the whole screen on
     * every device aspect instead of letterboxing (the small vertical crop on
     * a taller-than-16:9 phone lands in the clip's own safe area). Same rule as
     * the level intro's cover fit. */
    const vw = splashVideo.videoWidth, vh = splashVideo.videoHeight;
    const scale = Math.max(W / vw, H / vh);
    const dw = Math.round(vw * scale), dh = Math.round(vh * scale);
    ctx.drawImage(splashVideo, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);

    /* Measured against the FILE's duration, not against phaseT: a clip that
     * stalled or started late must still fade on its own last half-second
     * rather than on wall-clock time since the screen appeared.
     *
     * Once the hold has the frame, the fade rides the HOLD's clock instead —
     * the paused frame's currentTime never moves again, so the file's own
     * countdown is stuck at ~1.25 s left and would never reach the fade. */
    let left;
    if (splashHoldT >= 0) {
      left = SPLASH_HOLD - splashHoldT;
    } else {
      const dur = Number.isFinite(splashVideo.duration) ? splashVideo.duration : 0;
      left = dur ? dur - splashVideo.currentTime : 1;
    }
    const k = clamp(1 - left / SPLASH_FADE, 0, 1);
    if (k > 0) {
      ctx.fillStyle = `rgba(3,4,5,${k.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* The card this replaced. KEPT, and deliberately: a failed video fetch must
   * degrade to the studio's name rather than to six seconds of black, which is
   * the same rule the logo follows (see loadLogoArt) and for the same reason —
   * nobody watching can tell a missing file from a slow one. */
  function drawSplashCard() {
    /* TWO ENVELOPES, because this card now has two jobs.
     *
     * As the OPENING BEAT it has to stand still: up quickly, hold, and clear
     * just before the clip takes the screen — the old half-sine peaked at 0.7s
     * and was already back to nothing by 1.4s, which would have left the last
     * six tenths of the lead on pure black.
     *
     * As the FAILURE card it keeps that half-sine: there is no clip coming, so
     * the name rises, holds a moment and goes. */
    const lead = phaseT < SPLASH_CARD_LEAD;
    const a = lead
      ? Math.min(1, phaseT / 0.45) * Math.min(1, (SPLASH_CARD_LEAD - phaseT) / 0.30)
      : Math.sin(Math.min(1, phaseT / 1.4) * Math.PI);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    setDisplay(700, 38, 6);
    ctx.fillStyle = C.paper;
    ctx.fillText('KENCRAFTS STUDIO', W / 2, H / 2 - 8);
    setFont(700, 11, 8);
    ctx.fillStyle = C.gold;
    ctx.fillText('PRESENTS', W / 2, H / 2 + 34);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  function drawSplash() {
    clear('#030405');
    /* `readyState >= 2` (HAVE_CURRENT_DATA) rather than the loadeddata flag:
     * the flag says a frame ARRIVED once, this says one is decodable NOW, and
     * drawImage on a video without it paints nothing at all. */
    const live = !splashFailed && splashVideo.readyState >= 2 && splashVideo.videoWidth > 0;
    /* THE CARD OWNS THE FIRST BEAT. After it, the clip — and the drawn card is
     * still the FAILURE path beyond that, so a missing file keeps the name on
     * screen rather than cutting to black. While the clip is merely still
     * loading the screen stays on its black stage: swapping the wordmark in and
     * then out behind the first video frame was the visible "pop" this
     * originally fixed. */
    if (phaseT < SPLASH_CARD_LEAD) drawSplashCard();
    else if (live) drawSplashVideo();
    else if (splashFailed) drawSplashCard();

    /* The card draws no button, but it is skippable and a skip is a press like
     * any other — so the frame itself is what answers it and the press beat
     * rings something real rather than firing into empty space. The box is the
     * whole screen now: with a full-bleed clip there is no wordmark to ring. */
    hitboxes.push({ x: 0, y: 0, w: W, h: H, index: 0, id: 'splash:skip' });
    // Request 349: taps are answered in onPointerDown as a DOUBLE tap; say so 3 s into the clip.
    if (live && isTouchUI()) {
      drawSkipHint(ctx, W, splashVideoT(), 34, true);
      drawTapCue(ctx, W, H, splashVideoT(), { inset: 40 });   // request 353: lower-centre
    }
  }

  /* --------------------------------------------------------- title screen
   * One screen where there used to be three. It is the identity frame, so the
   * street is pushed all the way back — heavily darkened AND defocused — and
   * nothing stands in front of it. The logo owns the middle; the prompt grows
   * in underneath a beat later.
   *
   * Timings are the only content here, so they are named rather than inlined.
   */
  /* ---- the supplied reference frame, in numbers -------------------------
   *
   * Measured off ASSETS/"RatelLogo SCREENSAMPLE.png" rather than eyeballed.
   * That frame is 1586x992 and contains exactly two things:
   *
   *   the mark    ink x 549-1022 (w 474)   y 218-473 (h 256)
   *   the bar        x 554-1032 (w 479)    y 541-545 (h 5)
   *
   * The reference is 16:10 and this game is 16:9, so the two axes cannot both
   * be scaled by their own ratio without stretching the art. WIDTH is the
   * anchor — how big the mark reads against the frame is the thing the eye
   * actually judges — and everything else is then derived from the mark so the
   * SPACING survives the aspect change:
   *
   *   inkW     474/1586  = 0.2989 of screen width      -> 382 px
   *   inkH     inkW / 1.8569 (uniform scale)           -> 206 px
   *   centre y 345.5/992 = 0.3483 of screen height     -> 251 px
   *   barW     479/474   = 1.0106 of the ink width     -> 386 px
   *   barGap   (541-473) / 256 = 0.2656 of the ink HEIGHT -> 55 px
   *
   * barGap is taken against the mark and not against the frame on purpose: the
   * brief asks for "placement relative to the logo", and a gap measured in
   * screen height would have drifted 16 px away from the reference's own
   * proportion on the shorter frame.
   */
  const TITLE = {
    logoIn: 1.30,          // near-black -> logo settled
    subIn: 0.75, subAt: 1.05,   // the gold rule + STREETS OF JUSTICE, after the logo
    promptAt: 3.20, promptIn: 0.85,   // "a few seconds later"
    markW: Math.round(0.29886 * W),          // 382 — the INK width
    markCentreY: Math.round(0.34829 * H),    // 251
    barWFrac: 479 / 474,                     // the bar against the ink width
    barH: 4,                                 // 5/992 of the reference height
    barIn: 0.55, barAt: 0.85,                // the bar arrives just after the mark
    /* THE BAR SITS AT THE FOOT OF THE SCREEN, by request — it used to be pinned
     * 68/256 of an ink-height under the mark, which put it between the logo and
     * the tagline and made the three read as one stacked block.
     *
     * A SCREEN fraction, not an offset from the logo, because "far below" is a
     * statement about the frame rather than about the mark: hanging it off the
     * logo would drag it back up the moment the art is re-cut smaller. 0.86 puts
     * it clear under the prompt (whose keycap bottoms out at 601) with the
     * LOADING readout below it at ~639, so it reads as a footer.
     *
     * The two are never both at full strength anyway — the prompt is held back
     * until progress hits 1, which is the same moment the percentage readout
     * goes away and the bar becomes a plain rule. */
    barY: 0.86,

    /* Vertical balance taken off the key art rather than eyeballed: in the
     * supplied frame the logo's optical centre sits at 0.48 of frame height and
     * the prompt at 0.81 — so 346 and 584.
     *
     * The mark is CENTRED on `centreY` rather than hung off a type baseline.
     * The old drawn wordmark was ~7:1 and the supplied art is 4.48:1, so at the
     * same width it is half as tall again; pinning a baseline would have pushed
     * its optical centre 20 px above where the key art puts it and left the
     * subtitle crowding its underside. Centre + measured height is the only
     * layout that survives the art being re-cut to another proportion. */
    logoW: 664,            // ink width — a downscale of the 1024 px bake
    centreY: 346,
    promptY: 584,
    subGap: 40,            // from the logo's bottom edge down to the subtitle baseline
  };

  /* The reference's loading bar: a thin bright rule under the mark, the same
   * width as it. Drawn from the mark's own ink box rather than from screen
   * coordinates, so re-cutting the art moves the bar with it.
   *
   * WHAT IT SHOWS. The real thing — `worldProgress()`, the level art coming in
   * behind this screen. It is not a decorative wipe: the flow the brief lays
   * out is title, then the loading presentation, THEN the player presses start,
   * and the press is gated on the same number (see `titleReady`). A bar that
   * filled on a timer while the game was still loading would be lying at
   * exactly the moment the player is deciding whether to press.
   */
  /* `inkW` still sets the WIDTH — the bar is the mark's width by design, and
   * that tie is the one thing about it that should follow a re-cut. Only the
   * vertical position left the mark's orbit; see TITLE.barY. */
  /* MEGABYTES IN (request 507). The percentage counts SHEETS, and on a slow
   * connection one big sheet can hold it still for a minute, which reads as a
   * hang. The art that has actually arrived, summed off the browser's own
   * resource timing (twice a second, not every frame), keeps moving instead. */
  let loadedMB = 0, loadedMBAt = -1;
  try { performance.setResourceTimingBufferSize?.(3000); } catch {}
  function artMBIn() {
    const now = performance.now();
    if (now - loadedMBAt < 500) return loadedMB;
    loadedMBAt = now;
    let b = 0;
    try {
      for (const e of performance.getEntriesByType('resource'))
        if (/\.(webp|png|jpe?g)(\?|$)/i.test(e.name)) b += e.encodedBodySize || e.transferSize || 0;
    } catch {}
    loadedMB = b / 1048576;
    return loadedMB;
  }
  function drawTitleLoadBar(inkW) {
    const k = easeOut((phaseT - TITLE.barAt) / TITLE.barIn);
    if (k <= 0) return;
    const w = inkW * TITLE.barWFrac;
    const x = W / 2 - w / 2;
    const y = Math.round(TITLE.barY * H);
    const p = Math.max(0, Math.min(1, worldProgress()));
    ctx.save();
    ctx.globalAlpha = k;
    // the track
    ctx.fillStyle = 'rgba(233,238,247,0.22)';
    ctx.fillRect(x, y, w, TITLE.barH);
    // …and how much of the street is actually in
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillRect(x, y, w * p, TITLE.barH);
    /* Once it is full it stops being a progress bar and becomes a rule under
     * the mark, so the readout goes with it rather than sitting there saying
     * LOADING 100% at a screen that is waiting on the player. */
    if (p < 1) {
      ctx.globalAlpha = k * 0.85;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      setFont(700, 9.5, 3.2);
      ctx.fillStyle = 'rgba(207,216,234,0.75)';
      const mb = artMBIn();
      ctx.fillText(`LOADING  ${Math.round(p * 100)}%${mb >= 0.1 ? `  ·  ${mb.toFixed(1)} MB` : ''}`, W / 2, y + 20);
    }
    ctx.restore();
  }

  function drawTitle() {
    /* The user asked for this card to be darker, and the supplied mark is what
     * made room for it: the old drawn wordmark was thin cream type that needed
     * the street's contrast to sit against, so 0.62 read as flat black. The art
     * is a heavy display face with the ratel knocked out of it, and knocked-out
     * negative space only reads when the plate BEHIND it is dark and quiet.
     * 0.66 over the DOF-graded uibg2 still leaves the sunset and the wet tarmac
     * legible as texture, which is the one thing that says Lagos. */
    stage({ darken: 0.66, blur: 0.92 });

    const logoK = easeOut(phaseT / TITLE.logoIn);

    /* THE MARK. The supplied lockup when it is in, the old wordmark only if the
     * file did not load — and `loadTitleArt` has already shouted on the console
     * in that case, so the fallback is never silent. */
    const inkW = titleArt ? TITLE.markW : TITLE.logoW;
    const inkH = titleArt ? inkW / TITLE_ART.inkAspect : logoHeight(inkW);
    const logoBottom = titleArt
      ? TITLE.markCentreY + inkH / 2
      : TITLE.centreY + logoHeight(inkW) / 2;

    /* The logo rises the last few pixels into place and stops. No bounce, no
     * overshoot — it is a masthead, not a transition. */
    ctx.save();
    ctx.globalAlpha = logoK;
    ctx.translate(0, (1 - logoK) * 14);
    if (titleArt) {
      /* Positioned by its INK. The padded image is symmetric about the mark, so
       * the image centre and the ink centre are the same point and only the
       * size has to be converted. */
      const imgW = inkW / TITLE_ART.inkFrac;
      const imgH = imgW / TITLE_ART.aspect;
      ctx.drawImage(titleArt, W / 2 - imgW / 2, TITLE.markCentreY - imgH / 2, imgW, imgH);
    } else {
      drawLogoBox((W - inkW) / 2, logoBottom, inkW);
    }
    ctx.restore();

    drawTitleLoadBar(inkW);

    /* STREETS OF JUSTICE, between two hairlines, as in the key art.
     *
     * BACK DIRECTLY UNDER THE MARK. It had been pushed below the loading bar,
     * because the bar used to occupy the 40 px beneath the logo and two
     * elements on one baseline is a collision. The bar has gone to the foot of
     * the screen (TITLE.barY), so the tagline reclaims the place it belongs —
     * hung off the logo's MEASURED bottom edge, so a re-cut mark cannot land on
     * top of it. */
    const subK = easeOut((phaseT - TITLE.subAt) / TITLE.subIn);
    if (subK > 0) {
      ctx.save();
      ctx.globalAlpha = subK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      setFont(700, 15, 9.5);
      /* WHITE, by request, where this was the gold information accent. The
       * flanking rules go with it: they are the same element continued, and a
       * white line of type between two gold hairlines reads as a mistake rather
       * than as a choice. */
      ctx.fillStyle = C.paper;
      const sub = 'STREETS OF JUSTICE';
      const subY = logoBottom + TITLE.subGap;
      ctx.fillText(sub, W / 2 + 4.75, subY);          // +half the trailing track
      const half = ctx.measureText(sub).width / 2;
      /* Rules fade OUT towards the frame so they read as light, not as a box. */
      for (const dir of [-1, 1]) {
        const from = W / 2 + dir * (half + 26);
        const to = W / 2 + dir * (half + 150);
        const g = ctx.createLinearGradient(from, 0, to, 0);
        g.addColorStop(0, 'rgba(233,238,247,0.55)');
        g.addColorStop(1, 'rgba(233,238,247,0)');
        ctx.fillStyle = g;
        ctx.fillRect(Math.min(from, to), subY - 5, Math.abs(to - from), 1);
      }
      ctx.restore();
    }

    /* PRESS (X) TO ENTER — the whole point of the delay. It breathes once it is
     * in, so a player who looked away knows the screen is waiting on them.
     *
     * HELD BACK UNTIL THE BAR IS FULL. The brief's flow is logo -> loading ->
     * press START, which only reads as a sequence if the invitation waits for
     * the load. `titleReadyAt` latches the moment progress completes so the
     * prompt still gets its designed fade rather than snapping on, and the
     * scripted 3.2 s beat is still the floor — a load that finished during the
     * studio card must not skip straight to the prompt.
     *
     * BOTH the latch and the instant it feeds now live in update(), because the
     * press gate reads them too and the screen must not be pressable a frame
     * before or after it says so. Latching here — a draw-time side effect — put
     * the gate one frame behind the pixels on the frame the load completed.
     * This reads `titlePromptAt()`; it does not work it out a second time. */
    const promptFrom = titlePromptAt();
    const pK = easeOut((phaseT - promptFrom) / TITLE.promptIn);
    /* ON A PHONE, THE ANIMATED TAP CUE (request 357) — the same code-drawn element
     * the skippable sections carry, on the prompt's row, beating ONCE per cycle
     * because one tap enters. A controller glyph means nothing under a thumb. */
    if (isTouchUI()) {
      // 10 px above the text prompt's row: the 58 px plate would otherwise sit on the loading rule
      drawTapCue(ctx, W, H, phaseT, { hintAt: promptFrom, text: 'TAP TO ENTER', taps: 1, cy: TITLE.promptY - 10 });
      if (tapCueState.drawn)
        hitboxes.push({ x: tapCueState.x, y: tapCueState.y, w: tapCueState.w, h: tapCueState.h, index: 0, id: 'title:enter' });
    } else if (pK > 0) {
      const breathe = 0.80 + Math.sin(clock * 2.0) * 0.20;
      const py = TITLE.promptY;
      ctx.save();
      ctx.globalAlpha = pK;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      /* Measured, then laid out from the true centre — the glyph plate sits in
       * the run of text rather than being nudged into place. */
      setFont(700, 15, 4.2);
      const wPress = ctx.measureText('PRESS').width;
      const wTo = ctx.measureText('TO ENTER').width;
      const plate = 34, gap = 13;
      const total = wPress + gap + plate + gap + wTo;
      let x = W / 2 - total / 2;

      ctx.fillStyle = `rgba(255,230,191,${0.55 + 0.45 * breathe})`;
      ctx.fillText('PRESS', x, py);
      x += wPress + gap;

      /* The controller button: the PlayStation cross ALONE, in the blue this
       * game's hint bar has always used for it.
       *
       * NO KEYCAP. The rounded plate and its blue border are gone by request.
       * Both went, not just the stroke: the plate was a dark fill and the stroke
       * was its edge, so removing only the outline would have left a soft dark
       * rectangle sitting behind the glyph — the same box, less legible. The
       * `plate` box survives as pure LAYOUT (it reserves the glyph's slot in the
       * measured run and is what the hitbox is cut from); nothing draws it. */
      const plateX = x;
      icon('cross', x + plate / 2, py, 21, '#8fb4ff', 0.72 + 0.28 * breathe, 1.7);
      x += plate + gap;

      ctx.fillStyle = `rgba(255,230,191,${0.55 + 0.45 * breathe})`;
      ctx.fillText('TO ENTER', x, py);

      /* NO HAIRLINES. Two 135px gradient rules used to run out either side of
       * the prompt, borrowed from the tagline's treatment. Removed by request —
       * and the tagline keeps its pair, which is the point: up there they
       * underline a fixed piece of type, while down here they bracketed the one
       * thing on the screen that is asking to be pressed, and a breathing
       * invitation does not need a frame drawn round it to be found. */
      ctx.restore();
      ctx.textBaseline = 'alphabetic';

      /* The prompt IS this screen's button. Registering it as one gives the
       * press beat something to burst from — the user asked for that here by
       * name — and makes the title clickable, which it never was. Only the
       * keycap plate is registered, not the whole run of words: the ring wants
       * the affordance, and a 300 px box would put it off in the margins. */
      hitboxes.push({ x: plateX, y: py - plate / 2, w: plate, h: plate, index: 0, id: 'title:enter' });
    }

    /* A press anywhere enters, prompt or no prompt: this is a "press any key"
     * screen, so the click target is the screen. */
    hitboxes.push({ x: 0, y: 0, w: W, h: H, index: 0, id: 'title:0' });
    drawGrain(0.7);
  }

  /* ---------------------------------------------------- the gesture guide --
   * A NEW PLAYER'S FIRST LOOK AT THE MENU ON A PHONE (request 366): the supplied
   * Lottie (frontend/ui/lottie/gesture-control.json, 83 f @ 30 fps) of a thumb
   * landing, swiping down, tapping, swiping back up, then a tap burst — i.e.
   * "swipe to browse, tap to select", the menu's two touch gestures.
   *
   * WHERE: in the open street in front of Darki, on the RIGHT half — which is
   * where the gesture layer (touch.js) actually scrolls on a vertical swipe and
   * selects on a tap. Shown on the left it would teach a swipe that does nothing.
   * WHEN: touch screens only, once per session, 0.9 s after the menu settles
   * (after its own entrance). Two loops, then it dissolves. Any touch or key
   * while it plays dismisses it at once: the player has found the controls.
   *
   * The player is lottie-web's canvas-only "light" build, vendored next to the
   * file and loaded on demand — never by the boot (see the boot-must-not-await
   * rule): a guide that cannot load simply never appears. It is driven by the
   * menu's own clock (goToAndStop per frame), so it pauses and tests like
   * everything else here. */
  const GESTURE_GUIDE = {
    src: '../frontend/ui/lottie/gesture-control.json',
    lib: '../frontend/ui/lottie/lottie_light_canvas.min.js',
    fps: 30, frames: 83,
    speed: 0.85,                             // a touch slower than authored (request 367)
    startDelay: 0.9, loops: 3,
    fadeIn: 0.35, fadeOut: 0.6, dismiss: 0.3,
    h: 360,                                  // drawn size of the square 1080 comp (pill ~4.5 mm on a 6.5" phone)
    /* The comp's ink, measured over every frame (_chromakey/req366/_preview.js):
     * x 138-612, y 24-1054 of 1080. Placed by its ink centre, not the comp's. */
    inkCx: 375 / 1080, inkCy: 539 / 1080,
    cy: 400,                                 // under the profile card, above the hint bar
    seen: 'ror.gestureGuide',                // sessionStorage: once per session
    /* The caption follows the motion: the swipes, then the closing tap. */
    captions: [
      { text: 'SWIPE TO BROWSE', from: 3, to: 60 },
      { text: 'TAP TO SELECT', from: 64, to: 83 },
    ],
    /* DRESSED LIKE THE MENU'S FOCUSED BUTTON BORDER (request 367): its 1.35 px
     * outline width and its breathing glow (see button()) — in PURE WHITE at full
     * opacity (request 368), the glow white with it so it cannot tint the strokes.
     * The fat stroke that IS the pressed fingertip keeps its size. Comp units ->
     * drawn px: layer scale 0.686 x (h / 1080), so 1.35 px = 5.9 units at h 360. */
    ink: '255,255,255', inkAlpha: 1, line: 1.35, glow: '255,255,255',
  };
  const guideLoopDur = () => GESTURE_GUIDE.frames / (GESTURE_GUIDE.fps * GESTURE_GUIDE.speed);
  function restyleGestureGuide(data) {
    const G = GESTURE_GUIDE, [r, g, b] = G.ink.split(',').map((v) => +v / 255);
    const width = G.line / (0.686 * G.h / 1080);
    const walk = (items) => {
      for (const it of items || []) {
        if (it.ty === 'gr') walk(it.it);
        if (it.ty !== 'st') continue;
        it.c = { a: 0, k: [r, g, b, 1] };
        it.o = { a: 0, k: G.inkAlpha * 100 };
        // outline widths only (0 < w < 20 units). The 80-unit press stroke is the
        // fingertip, and a width of 0 is how the file HIDES a shape — both kept.
        const thin = (v) => (v > 0 && v < 20 ? width : v);
        if (it.w.a) for (const k of it.w.k) { if (k.s) k.s = k.s.map(thin); if (k.e) k.e = k.e.map(thin); }
        else it.w.k = thin(it.w.k);
      }
    };
    for (const l of data.layers || []) walk(l.shapes);
    return data;
  }
  const guide = { st: 'off', t: 0, outT: 0, outDur: 0, outFrom: 1, alpha: 0, frame: 0,
    anim: null, cnv: null, cctx: null, px: 0, drawnFrame: -1, box: null, caption: '' };
  try { if (sessionStorage.getItem(GESTURE_GUIDE.seen)) guide.st = 'done'; } catch {}

  function loadGestureGuide() {
    guide.st = 'loading';
    const lib = window.lottie ? Promise.resolve() : new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL(GESTURE_GUIDE.lib, import.meta.url).href;
      s.onload = resolve; s.onerror = () => reject(new Error('lottie player failed to load'));
      document.head.appendChild(s);
    });
    const data = fetch(new URL(GESTURE_GUIDE.src, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error('gesture guide ' + r.status);
      return r.json();
    }).then(restyleGestureGuide);
    Promise.all([lib, data]).then(([, animationData]) => {
      guide.cnv = document.createElement('canvas');
      guide.cctx = guide.cnv.getContext('2d');
      sizeGuideCanvas();
      guide.anim = window.lottie.loadAnimation({
        renderer: 'canvas', loop: false, autoplay: false, animationData,
        rendererSettings: { context: guide.cctx, clearCanvas: true },
      });
      guide.st = 'ready';
    }).catch((err) => {
      console.warn('[ror] gesture guide unavailable:', err.message);
      guide.st = 'done';
    });
  }
  // Backing store at the canvas's own resolution, so the strokes stay sharp on a phone.
  function sizeGuideCanvas() {
    const px = Math.round(GESTURE_GUIDE.h * renderScale);
    if (!guide.cnv || guide.px === px) return;
    guide.px = guide.cnv.width = guide.cnv.height = px;
    guide.drawnFrame = -1;
    guide.anim?.resize?.();
  }
  function endGestureGuide() {
    guide.st = 'done';
    guide.anim?.destroy?.();
    guide.anim = null; guide.cnv = null; guide.cctx = null;
  }
  function dismissGestureGuide() {
    if (guide.st !== 'play') return;
    guide.st = 'out'; guide.outT = 0; guide.outDur = GESTURE_GUIDE.dismiss; guide.outFrom = guide.alpha;
  }
  // Any touch or key while it plays: they have found the controls.
  window.addEventListener('pointerdown', dismissGestureGuide, true);
  window.addEventListener('keydown', dismissGestureGuide, true);

  function updateGestureGuide(dt) {
    const G = GESTURE_GUIDE;
    if (guide.st === 'done') return;
    if (guide.st === 'off') { if (phase === 'menu' && isTouchUI()) loadGestureGuide(); return; }
    if (guide.st === 'loading') return;
    if (guide.st === 'ready') {
      if (phase === 'menu' && phaseT >= G.startDelay) {
        guide.st = 'play'; guide.t = 0;
        try { sessionStorage.setItem(G.seen, '1'); } catch {}
      }
      return;
    }
    // Playing or dissolving: leaving the menu ends it outright (it has been seen).
    if (phase !== 'menu') { endGestureGuide(); return; }
    const total = guideLoopDur() * G.loops;
    guide.t += dt;
    if (guide.st === 'play') {
      guide.alpha = Math.min(1, guide.t / G.fadeIn);
      if (guide.t >= total) { guide.st = 'out'; guide.outT = 0; guide.outDur = G.fadeOut; guide.outFrom = guide.alpha; }
    } else {
      guide.outT += dt;
      guide.alpha = guide.outFrom * Math.max(0, 1 - guide.outT / guide.outDur);
      if (guide.outT >= guide.outDur) { endGestureGuide(); return; }
    }
    // The second loop ends on the burst having faded: hold that last frame through the dissolve.
    guide.frame = guide.t >= total ? G.frames - 1 : Math.floor(guide.t * G.fps * G.speed) % G.frames;
  }

  function drawGestureGuide() {
    const G = GESTURE_GUIDE;
    if ((guide.st !== 'play' && guide.st !== 'out') || !guide.anim || guide.alpha <= 0) { guide.box = null; return; }
    sizeGuideCanvas();
    if (guide.drawnFrame !== guide.frame) { guide.anim.goToAndStop(guide.frame, true); guide.drawnFrame = guide.frame; }
    /* In front of him: centred between the bat end of his figure and the right edge. */
    const front = L.darki.cx + 190, gx = (front + (W - 24)) / 2;
    const s = G.h, x = Math.round(gx - G.inkCx * s), y = Math.round(G.cy - G.inkCy * s);
    guide.box = { x, y, w: s, h: s };
    ctx.save();
    ctx.globalAlpha = guide.alpha;
    // A soft pool of shade under the strokes: the shopfronts behind are busy and bright.
    const g = ctx.createRadialGradient(gx, G.cy + 20, 0, gx, G.cy + 20, 215);
    g.addColorStop(0, 'rgba(3,5,8,0.70)');
    g.addColorStop(0.6, 'rgba(3,5,8,0.30)');
    g.addColorStop(1, 'rgba(3,5,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(gx - 220, G.cy - 210, 440, 460);
    // The focused button's glow, breathing at its rate (button(): 0.86 ± 0.14 at 2.1 rad/s).
    const breathe = 0.86 + Math.sin(clock * 2.1) * 0.14;
    ctx.save();
    ctx.shadowColor = `rgba(${G.glow},${(0.35 * breathe).toFixed(3)})`;   // white blooms harder than orange
    ctx.shadowBlur = 22;
    ctx.drawImage(guide.cnv, x, y, s, s);
    ctx.restore();
    // The caption under it, crossing with the motion it names.
    const f = guide.st === 'out' && guide.t >= guideLoopDur() * G.loops ? -1 : guide.frame;
    guide.caption = '';
    for (const c of G.captions) {
      if (f < c.from || f > c.to) continue;
      const k = Math.min(1, (f - c.from) / 6, (c.to - f) / 6 + 0.001);
      if (k <= 0) continue;
      guide.caption = c.text;
      ctx.globalAlpha = guide.alpha * k;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      setFont(700, 13, 3.2);
      ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 8;
      ctx.fillStyle = `rgba(${G.ink},${G.inkAlpha * 0.5 + 0.5})`;
      ctx.fillText(c.text, gx, y + (1054 / 1080) * s + 24);   // under the ink's measured foot
    }
    ctx.restore();
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.textBaseline = 'alphabetic';
  }

  function drawMenu() {
    /* No defocus here, by request. The main menu is the screen the art is FOR,
     * so the plate stays sharp and the panels earn their legibility the way
     * they do everywhere else — their own frosted backing, not a soft frame.
     * The sibling screens (difficulty / character / briefing / level select)
     * still defocus: those are working screens with copy to read over the same
     * plate, and this is the only one that is a shop window. */
    stage({ darki: {} });

    const k = beginScreen(10);

    /* No container panel behind the list, by request. The rows carry their own
     * frosted backing and border, so the card under them was a second frame
     * around things already framed — it read as a placeholder holding the menu
     * rather than as part of it. The brand and the rows now sit straight on the
     * street. Their x/y are absolute and were never derived from the panel, so
     * nothing moved when it went. */
    drawBrand();

    const hero = MAIN_ITEMS[0];
    button({
      id: 'menu:0',
      x: L.btn.x, y: L.start.y, w: L.btn.w, h: L.start.h,
      label: hero.label, icon: hero.icon,
      focused: selection === 0, hero: true, index: 0,
      shake: selection === 0 ? rejectT : 0,
    });

    for (let i = 1; i < MAIN_ITEMS.length; i++) {
      const it = MAIN_ITEMS[i];
      button({
        id: `menu:${i}`,
        x: L.btn.x,
        y: L.rows.y + (i - 1) * L.rows.pitch,
        w: L.btn.w, h: L.rows.h,
        label: it.label, icon: it.icon, note: it.note,
        disabled: it.disabled,
        focused: selection === i,
        index: i,
        shake: selection === i ? rejectT : 0,
      });
    }

    endScreen();

    /* The anchored information layer. The LEVEL 01 card and the four-icon
     * utility pill that used to sit under it are gone by request — the pill's
     * icons were placeholders wired to nothing, and the level card repeated what
     * the case file says properly a screen later. The profile card stays: it is
     * the only one carrying live state. */
    ctx.save();
    ctx.globalAlpha = k;
    drawProfileCard();
    drawControlBar(MENU_HINTS);
    ctx.restore();

    drawGestureGuide();
    messagePlate();
    drawGrain();
    transitionVeil();
  }

  function drawDifficulty() {
    stage({ darken: 0.26, darki: { cx: 1010, feet: 646, alpha: 0.5 } });
    beginScreen();
    screenHead('NEW GAME', 'SELECT DIFFICULTY', 'Choose how hard the streets hit back.');
    buttonList(currentItems(), 58, 186, 400, 48, 8, 'diff');

    const notes = [
      'More room to learn the fight.',
      'The intended RATEL RAGE experience.',
      'Faster pressure. Less forgiveness.',
      'One hard road. Classic arcade rules.',
    ];
    glass(506, 186, 420, 232, 10);
    ctx.textAlign = 'left';
    setDisplay(700, 52, 2);
    ctx.fillStyle = C.gold;
    ctx.fillText(['01', '02', '03', '04'][selection], 538, 258);
    setDisplay(700, 28, 1.6);
    ctx.fillStyle = C.paper;
    ctx.fillText(['EASY', 'NORMAL', 'HARD', 'ARCADE'][selection], 538, 302);
    setFont(500, 13.5, 0.2);
    ctx.fillStyle = C.muted;
    ctx.fillText(notes[selection], 538, 334);
    endScreen();
    drawControlBar(MENU_HINTS);
    messagePlate();
    drawGrain();
    transitionVeil();
  }

  function statBar(label, value, x, y) {
    setFont(700, 10, 2.2);
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y);
    for (let i = 0; i < 5; i++) {
      const bx = x + 86 + i * 27;
      roundRectPath(ctx, bx, y - 8, 20, 8, 2);
      ctx.fillStyle = i < value ? C.gold : 'rgba(255,255,255,0.10)';
      ctx.fill();
    }
  }

  function drawCharacter() {
    stage({ darken: 0.20, darki: { cx: 852, feet: 636 } });
    beginScreen();
    screenHead(phase === 'characters' ? 'ROSTER' : 'PLAYER 01 / CHARACTER SELECT', 'DARKI', 'THE STREET FIGHTER');

    glass(56, 178, 396, 300, 10);
    ctx.textAlign = 'left';
    setFont(700, 17, 1.6);
    ctx.fillStyle = C.paper;
    ctx.fillText('GROUNDED. TOUGH. DETERMINED.', 80, 214);
    setFont(500, 12.5, 0.2);
    ctx.fillStyle = C.muted;
    ctx.fillText('A street fighter who refuses to pay for the', 80, 244);
    ctx.fillText('right to stand his ground.', 80, 264);
    statBar('POWER', 4, 80, 316);
    statBar('SPEED', 4, 80, 354);
    statBar('DEFENSE', 3, 80, 392);
    statBar('HEALTH', 4, 80, 430);

    for (let i = 0; i < 4; i++) {
      const x = 56 + i * 102, y = 498, w = 92, h = 76;
      const s = getFx(`roster:${i}`);
      s.target = i === 0 ? 1 : 0;
      glass(x, y, w, h, 8, {
        tint: i === 0 ? 'rgba(30,20,14,0.72)' : 'rgba(9,13,20,0.64)',
        border: i === 0 ? `rgba(255,122,31,${0.55 + Math.sin(clock * 2.1) * 0.14})` : C.edgeSoft,
      });
      if (i === 0) {
        if (avatarCanvas) {
          ctx.save();
          roundRectPath(ctx, x + 8, y + 8, w - 16, h - 26, 5);
          ctx.clip();
          ctx.fillStyle = 'rgba(30,38,54,0.9)';
          ctx.fillRect(x + 8, y + 8, w - 16, h - 26);
          ctx.drawImage(avatarCanvas, x + 6, y + 4, w - 12, w - 12);
          ctx.restore();
        }
        ctx.textAlign = 'center';
        setFont(700, 10.5, 1.8);
        ctx.fillStyle = C.cream;
        ctx.fillText('DARKI', x + w / 2, y + h - 9);
      } else {
        icon('lock', x + w / 2, y + h / 2 - 6, 22, C.dim, 0.7);
        ctx.textAlign = 'center';
        setFont(700, 9.5, 1.8);
        ctx.fillStyle = C.dim;
        ctx.fillText('LOCKED', x + w / 2, y + h - 9);
      }
    }

    const bx = 1000, by = 512, bw = 214, bh = 52;
    button({
      id: 'char:confirm', x: bx, y: by, w: bw, h: bh,
      label: phase === 'characters' ? 'VIEW FIGHTER' : 'CONFIRM DARKI',
      icon: 'check', focused: true, index: 0,
    });
    endScreen();
    drawControlBar(MENU_HINTS);
    messagePlate();
    drawGrain();
    transitionVeil();
  }

  function drawShop() {
    stage({ darken: 0.42 });
    beginScreen();
    screenHead('CUSTOMIZATION', 'SHOP', 'A planned home for Darki’s future streetwear.');
    const cats = ['CLOTHING', 'SHOES', 'OUTFITS', 'ACCESSORIES', 'OWNED', 'EQUIPPED'];
    for (let i = 0; i < cats.length; i++) {
      const x = 58 + (i % 3) * 392, y = 186 + Math.floor(i / 3) * 104;
      glass(x, y, 368, 88, 9, { tint: 'rgba(9,13,20,0.56)' });
      ctx.textAlign = 'left';
      setFont(700, 15, 2.4);
      ctx.fillStyle = 'rgba(180,190,205,0.55)';
      ctx.fillText(cats[i], x + 22, y + 51);
      icon('lock', x + 340, y + 44, 18, C.dim, 0.55);
    }
    glass(374, 300, 532, 140, 10, { tint: 'rgba(7,10,16,0.92)', border: 'rgba(224,67,44,0.5)' });
    ctx.textAlign = 'center';
    setFont(700, 11, 4);
    ctx.fillStyle = C.red;
    ctx.fillText('LOCKED', 640, 336);
    setDisplay(700, 32, 1.8);
    ctx.fillStyle = C.paper;
    ctx.fillText('SHOP COMING SOON', 640, 380);
    setFont(500, 12.5, 0.2);
    ctx.fillStyle = C.muted;
    ctx.fillText('Character customization will be available here.', 640, 408);
    endScreen();
    drawControlBar([MENU_HINTS[2]]);
    drawGrain();
    transitionVeil();
  }

  function mobileControlArt(name, cx, cy, maxW, maxH = maxW) {
    const img = assets.mobileControls[name];
    const iw = img?.naturalWidth || img?.width || 0;
    const ih = img?.naturalHeight || img?.height || 0;
    if (!iw || !ih) return null;
    const scale = Math.min(maxW / iw, maxH / ih);
    const w = iw * scale, h = ih * scale;
    const x = cx - w / 2, y = cy - h / 2;
    ctx.drawImage(img, x, y, w, h);
    const bounds = { asset: name, x, y, w, h };
    controlsGuideFrame.push(bounds);
    return bounds;
  }

  function mobileStick(cx, cy, size) {
    mobileControlArt('stick', cx, cy, size, size);
    mobileControlArt('stickThumb', cx, cy, size * 0.5, size * 0.5);
  }

  function mobileActionCard(x, y, w, h, asset, title, details) {
    glass(x, y, w, h, 8, { tint: 'rgba(16,22,33,0.68)', shadow: false });
    mobileControlArt(asset, x + 52, y + h / 2, 70, 84);
    ctx.textAlign = 'left';
    setFont(800, 13, 1.2);
    ctx.fillStyle = C.paper;
    ctx.fillText(title, x + 96, y + 39);
    setFont(600, 10.5, 0.35);
    ctx.fillStyle = C.muted;
    details.forEach((line, i) => ctx.fillText(line, x + 96, y + 65 + i * 20));
  }

  function drawControls() {
    controlsGuideFrame = [];
    stage({ darken: 0.48 });
    beginScreen();
    screenHead('FIELD MANUAL', 'HOW TO PLAY', 'The same touch controls shown during the fight.');
    glass(56, 172, 556, 424, 10);
    glass(668, 172, 556, 424, 10);
    ctx.fillStyle = C.orange;
    ctx.fillRect(56, 172, 556, 3);
    ctx.fillRect(668, 172, 556, 3);

    ctx.textAlign = 'left';
    setFont(700, 13, 3.4);
    ctx.fillStyle = C.gold;
    ctx.fillText('MOVEMENT', 84, 210);
    mobileStick(194, 340, 184);
    setDisplay(800, 21, 1.8);
    ctx.fillStyle = C.paper;
    ctx.fillText('MOVE', 330, 270);
    setFont(600, 12, 0.4);
    ctx.fillStyle = C.muted;
    ctx.fillText('DRAG TO WALK', 330, 302);
    ctx.fillText('MOVE THROUGH THE LANE', 330, 327);
    ctx.fillText('FLICK SIDEWAYS TO RUSH', 330, 352);
    mobileActionCard(84, 466, 236, 106, 'jump', 'JUMP', ['TAP TO LEAP']);
    mobileActionCard(340, 466, 236, 106, 'pause', 'PAUSE', ['TAP TO PAUSE']);

    setFont(700, 13, 3.4);
    ctx.fillStyle = C.gold;
    ctx.fillText('COMBAT', 696, 210);
    mobileActionCard(696, 228, 242, 154, 'jab', 'JAB / CHAIN',
      ['TAP TO STRIKE', 'DOUBLE-TAP TO COMBO']);
    mobileActionCard(954, 228, 242, 154, 'kick', 'KICK',
      ['TAP TO KICK']);
    mobileActionCard(696, 398, 242, 174, 'block', 'BLOCK',
      ['HOLD TO GUARD']);
    mobileActionCard(954, 398, 242, 174, 'grab', 'GRAB / EXECUTE',
      ['HOLD TO CARRY', 'RELEASE TO THROW']);
    endScreen();
    drawGrain();
    transitionVeil();
  }

  function optionValue(row) {
    if (row.value) return row.value();
    if (row.type === 'toggle') return settings[row.key] ? 'ON' : 'OFF';
    if (row.type === 'slider') {
      const max = row.max ?? 1;
      return `${Math.round(settings[row.key] * (max === 1.5 ? 100 / 1.5 : 100))}%`;
    }
    return '—';
  }

  /* The pop-out ▼/▲ pair for the row being adjusted (request 451). Sized for a
   * thumb, beside the bar it moves, pushed AFTER the rows so the hit test (which
   * reads from the top of the stack) always finds them first. */
  function drawAdjuster(i) {
    const row = optionRows[i];
    const x = 100, w = 1080, h = 50, y = 186 + i * 62;
    const sx = x + w - 300;
    const cy = y + h / 2;
    const min = row.min ?? 0, max = row.max ?? 1, v = settings[row.key];
    const pair = [
      { id: 'optadj:down', dir: -1, bx: sx - ADJ.gap * 2 - ADJ.w * 2, off: v <= min + 1e-9 },
      { id: 'optadj:up', dir: 1, bx: sx - ADJ.gap - ADJ.w, off: v >= max - 1e-9 },
    ];
    for (const b of pair) {
      const by = cy - ADJ.h / 2;
      const held = adjHold && adjHold.dir === b.dir;
      ctx.save();
      roundRectPath(ctx, b.bx, by, ADJ.w, ADJ.h, 10);
      ctx.fillStyle = held ? C.orange : 'rgba(18,20,26,0.92)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = b.off ? 'rgba(255,255,255,0.18)' : C.orange;
      ctx.stroke();
      // the arrow
      const ax = b.bx + ADJ.w / 2, ay = cy, k = 12;
      ctx.beginPath();
      if (b.dir > 0) { ctx.moveTo(ax - k, ay + k * 0.55); ctx.lineTo(ax + k, ay + k * 0.55); ctx.lineTo(ax, ay - k * 0.75); }
      else { ctx.moveTo(ax - k, ay - k * 0.55); ctx.lineTo(ax + k, ay - k * 0.55); ctx.lineTo(ax, ay + k * 0.75); }
      ctx.closePath();
      ctx.fillStyle = b.off ? 'rgba(255,255,255,0.25)' : (held ? '#14161b' : C.cream);
      ctx.fill();
      ctx.restore();
      hitboxes.push({ x: b.bx, y: by, w: ADJ.w, h: ADJ.h, index: i, id: b.id });
    }
  }

  function drawOptions() {
    stage({ darken: 0.46 });
    beginScreen();
    if (!optionPage) {
      screenHead('SYSTEM', 'OPTIONS', 'Tune the picture, sound, play, and readability.');
      buttonList(currentItems(), 58, 180, 400, 44, 8, 'opt');
      glass(506, 180, 480, 300, 10);
      const item = currentItems()[selection].label;
      ctx.textAlign = 'left';
      setDisplay(700, 20, 2.6);
      ctx.fillStyle = C.gold;
      ctx.fillText(item, 538, 224);
      setFont(500, 13, 0.2);
      ctx.fillStyle = C.text;
      const copy = {
        VIDEO: 'Display and motion presentation.',
        AUDIO: 'Independent music, SFX, voice, and ambience.',
        CONTROLS: 'Review the mobile touch controls.',
        GAMEPLAY: 'Difficulty and combat assistance.',
        ACCESSIBILITY: 'Subtitles, contrast, and motion comfort.',
        LANGUAGE: 'Interface language.',
        'RESET SETTINGS': 'Restore the recommended defaults.',
      };
      ctx.fillText(copy[item], 538, 256);
    } else {
      screenHead('OPTIONS', optionPage, 'Changes are saved on this device.');
      optionRows = optionSpec(optionPage);
      for (let i = 0; i < optionRows.length; i++) {
        const row = optionRows[i];
        const y = 186 + i * 62;
        const x = 100, w = 1080, h = 50;
        button({
          id: `optrow:${i}`, x, y, w, h,
          label: row.label,
          value: row.type === 'slider' ? undefined : optionValue(row),
          focused: i === selection,
          index: i,
        });
        if (row.type === 'slider') {
          const min = row.min ?? 0, max = row.max ?? 1;
          const f = (settings[row.key] - min) / (max - min);
          const sx = x + w - 300, sw = 208, sy = y + h / 2 - 3;
          roundRectPath(ctx, sx, sy, sw, 6, 3);
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fill();
          roundRectPath(ctx, sx, sy, Math.max(6, sw * f), 6, 3);
          ctx.fillStyle = i === selection ? C.orange : C.gold;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(sx + sw * f, sy + 3, i === selection ? 5.5 : 4, 0, 7);
          ctx.fillStyle = i === selection ? C.cream : C.gold;
          ctx.fill();
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          setFont(600, 13, 0.8);
          ctx.fillStyle = i === selection ? C.gold : C.muted;
          ctx.fillText(optionValue(row), x + w - 20, y + h / 2 + 0.5);
          ctx.textBaseline = 'alphabetic';
        }
      }
      if (adjustRow >= 0 && optionRows[adjustRow]?.type !== 'slider') adjustRow = -1;
      if (adjustRow >= 0) drawAdjuster(adjustRow);
    }
    endScreen();
    drawControlBar(optionPage
      ? (adjustRow >= 0
        ? [{ icon: 'dpad', label: 'TAP THE ARROWS OR SWIPE UP / DOWN' }, { icon: 'circleBtn', label: 'DONE', color: '#ff8f8f' }]
        : [{ icon: 'dpad', label: 'TAP A SLIDER TO ADJUST' }, { icon: 'circleBtn', label: 'BACK', color: '#ff8f8f' }])
      : MENU_HINTS);
    messagePlate();
    drawGrain();
    transitionVeil();
  }

  /* The operations the player can open, in order: 01 always, 02 once Level 01
   * has been completed (levelUnlocked). The list IS the cursor's range, so a
   * locked level can never be focused or confirmed. */
  function levelSelectItems() {
    const out = [{ label: '01', level: 1 }];
    if (levelUnlocked(2)) out.push({ label: '02', level: 2 });
    return out;
  }

  function drawLevelSelect() {
    stage({ darken: 0.30, darki: { cx: 1080, feet: 646, alpha: 0.4 } });
    beginScreen();
    screenHead('STREET MAP', 'LEVEL SELECT', 'Only confirmed operations are shown.');

    const items = levelSelectItems();
    const focused = items[Math.min(selection, items.length - 1)]?.level ?? 1;
    const D = DOSSIERS[focused] ?? DOSSIERS[1];
    /* The big card is the FOCUSED operation: what confirming opens. */
    const s = getFx('lvl:0');
    s.target = 1;
    glass(56, 172, 720, 372, 10, {
      border: `rgba(255,122,31,${0.42 + Math.sin(clock * 2.1) * 0.12})`,
    });
    ctx.fillStyle = C.orange;
    ctx.fillRect(56, 172, 4, 372);
    ctx.textAlign = 'left';
    setDisplay(700, 68, 2);
    ctx.fillStyle = C.gold;
    ctx.fillText(`0${focused}`, 92, 250);
    setFont(700, 11, 3.4);
    ctx.fillText(D.place, 92, 278);
    setDisplay(700, 38, 1.6);
    ctx.fillStyle = C.paper;
    ctx.fillText(D.title, 92, 330);
    setFont(600, 12.5, 1.4);
    ctx.fillStyle = C.muted;
    ctx.fillText(`${focused === 1 ? 'BOSS' : 'TARGET'}  /  ${D.target}`, 92, 362);
    setFont(700, 11, 2.4);
    ctx.fillStyle = C.green;
    ctx.fillText(focused === 1 && levelUnlocked(2) ? '●  COMPLETED  ·  REPLAY' : '●  AVAILABLE', 92, 400);
    icon('skull', 690, 236, 46, 'rgba(224,67,44,0.7)', 0.85);
    hitboxes.push({ x: 56, y: 172, w: 720, h: 372, index: 0, id: 'lvl:0' });

    /* The roster down the right: 02, 03, 04. 02 opens with Level 01's
     * completion and is then a real, selectable row (index 1). */
    for (let i = 0; i < 3; i++) {
      const y = 172 + i * 126;
      const n = i + 2;
      const open = items.some((it) => it.level === n);
      if (!open) {
        glass(800, y, 424, 110, 9, { tint: 'rgba(9,13,20,0.56)' });
        ctx.textAlign = 'left';
        setDisplay(700, 26, 2.4);
        ctx.fillStyle = C.dim;
        ctx.fillText(`0${n}`, 826, y + 66);
        setFont(700, 12, 3);
        ctx.fillText('LOCKED', 878, y + 62);
        icon('lock', 1180, y + 55, 22, C.dim, 0.6);
        continue;
      }
      const index = items.findIndex((it) => it.level === n);
      const on = focused === n;
      const fx = getFx(`lvl:${index}`);
      fx.target = on ? 1 : 0;
      glass(800, y, 424, 110, 9, {
        tint: on ? 'rgba(28,18,10,0.62)' : 'rgba(9,13,20,0.56)',
        border: on ? `rgba(255,122,31,${0.42 + Math.sin(clock * 2.1) * 0.12})` : 'rgba(233,182,84,0.28)',
      });
      if (on) { ctx.fillStyle = C.orange; ctx.fillRect(800, y, 4, 110); }
      const Dn = DOSSIERS[n];
      ctx.textAlign = 'left';
      setDisplay(700, 26, 2.4);
      ctx.fillStyle = C.gold;
      ctx.fillText(`0${n}`, 826, y + 50);
      setFont(700, 12, 1.6);
      ctx.fillStyle = C.paper;
      ctx.fillText(Dn.title, 878, y + 46);
      setFont(700, 10, 2.2);
      ctx.fillStyle = C.green;
      ctx.fillText('●  AVAILABLE', 878, y + 72);
      icon('skull', 1180, y + 55, 22, 'rgba(224,67,44,0.7)', 0.8);
      hitboxes.push({ x: 800, y, w: 424, h: 110, index, id: `lvl:${index}` });
    }
    endScreen();
    drawControlBar(MENU_HINTS);
    drawGrain();
    transitionVeil();
  }

  function drawBriefing() {
    stage({ darken: 0.24, darki: { cx: 1030, feet: 646, alpha: 0.55 } });
    beginScreen();
    glass(40, 40, 700, 640, 12);
    screenHead('MISSION BRIEFING / LAGOS, NIGERIA', 'LEVEL 01', 'Operation file');
    ctx.textAlign = 'left';
    setDisplay(700, 40, 1.6);
    ctx.fillStyle = C.paper;
    ctx.fillText('THE STREET TAX', 58, 208);
    const rows = [
      ['OBJECTIVE', 'Stop the street extortion network.'],
      ['TARGET', 'MC OLODO'],
      ['SECONDARY', 'Defeat the street collectors.'],
    ];
    for (let i = 0; i < rows.length; i++) {
      const y = 268 + i * 80;
      setFont(700, 10.5, 3);
      ctx.fillStyle = C.gold;
      ctx.fillText(rows[i][0], 60, y);
      setFont(600, 17, 0.6);
      ctx.fillStyle = C.paper;
      ctx.fillText(rows[i][1], 60, y + 26);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(60, y + 46, 620, 1);
    }
    button({
      id: 'brief:go', x: 60, y: 556, w: 300, h: 52,
      label: 'BEGIN OPERATION', icon: 'play', focused: true, hero: true, index: 0,
    });
    endScreen();
    drawControlBar(MENU_HINTS);
    drawGrain();
    transitionVeil();
  }

  function drawLoading() {
    stage({ darken: 0.62 });
    ctx.textAlign = 'center';
    setFont(700, 11, 5);
    ctx.fillStyle = C.gold;
    fillCentred(isL2() ? 'LAGOS  /  02' : 'LAGOS  /  01', W / 2, 238);
    setDisplay(700, 54, 2.4);
    ctx.fillStyle = C.paper;
    fillCentred(isL2() ? dossier().title : 'THE STREET TAX', W / 2, 306);
    setFont(500, 13, 1.4);
    ctx.fillStyle = C.muted;
    fillCentred(isL2() ? 'NPF EVIDENCE & PROPERTY WING' : 'LAGOS NEVER SLEEPS.', W / 2, 340);
    const f = Math.min(introLoadProgress, clamp(phaseT / 1.6, 0, 1));
    /* Centred against the LIVE viewport width: this bar was hardcoded at
     * 390..890 for the old 1280 frame, which put it left of centre the moment
     * the mobile layout widened to the device aspect. */
    const bw = 500, by = 420, bx = Math.round(W / 2 - bw / 2);
    roundRectPath(ctx, bx, by, bw, 5, 2.5);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    roundRectPath(ctx, bx, by, Math.max(5, bw * f), 5, 2.5);
    ctx.fillStyle = C.orange;
    ctx.fill();
    setFont(700, 11.5, 3);
    ctx.fillStyle = C.gold;
    fillCentred(`LOADING STORY  ${Math.round(f * 100)}%`, W / 2, 456);
    drawGrain(0.6);
  }

  function drawIntro() {
    clear('#030405');
    const p = introProgress();
    if (introVideo && introVideo.readyState >= 2 && introVideo.videoWidth && introVideo.videoHeight) {
      /* COVER, not contain: the cinematic fills the whole frame on every
       * device aspect, cropping the small overflow rather than letterboxing. */
      const scale = Math.max(W / introVideo.videoWidth, H / introVideo.videoHeight);
      const dw = Math.round(introVideo.videoWidth * scale);
      const dh = Math.round(introVideo.videoHeight * scale);
      const dx = Math.round((W - dw) / 2);
      const dy = Math.round((H - dh) / 2);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(introVideo, dx, dy, dw, dh);
      const shade = ctx.createLinearGradient(0, dy, 0, dy + dh);
      shade.addColorStop(0, 'rgba(0,0,0,0.06)');
      shade.addColorStop(0.78, 'rgba(0,0,0,0.01)');
      shade.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = shade;
      ctx.fillRect(dx, dy, dw, dh);
    }
    ctx.fillStyle = 'rgba(4,6,9,0.86)';
    ctx.fillRect(0, 0, W, 46);
    ctx.fillStyle = C.orange;
    ctx.fillRect(0, 45, W, 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    setFont(700, 10.5, 3);
    ctx.fillStyle = C.gold;
    ctx.fillText(`${dossier().code ?? 'LEVEL 01'}  /  STORY INTRO`, 28, 24);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.muted;
    /* NAME THE CONTROL THE PLAYER HAS. On a phone there is no X and no Square,
     * and the hint fades in only once tap-to-skip is actually armed — a prompt
     * that offers something the next tap will not do is worse than no prompt.
     * See introTapSkippable: first viewing has no skip, and neither does the
     * first three seconds of any viewing. */
    /* Request 349: on a phone the control is a DOUBLE tap, on every viewing,
     * announced 3 s in (drawSkipHint), in the header band's right slot. */
    if (isTouchUI()) drawSkipHint(ctx, W, introFallbackT, 24);
    else ctx.fillText('X / SQUARE   SKIP', W - 28, 24);
    /* Request 353: the tap cue sits LOWER-CENTRE, above whatever the foot of
     * this screen already holds — the subtitle band, when subtitles are on. Its
     * height is taken from the band's own geometry (the block below), so the two
     * cannot drift into each other. */
    if (isTouchUI()) {
      const bandH = settings.subtitles
        ? Math.round(Math.round(20 * settings.subtitleSize) * 1.4) * 2 + 10 : 0;
      drawTapCue(ctx, W, H, introFallbackT, { inset: 32 + bandH });
    }
    ctx.textBaseline = 'alphabetic';

    if (settings.subtitles) {
      /* The gameplay subtitle style (drawSubtitleScroll): a dark band at the
       * foot of the video holding a scrolling column — the line being said in
       * the lower row, the one before it scrolling up and out under the band's
       * top edge, words lighting as they are spoken. */
      const time = introTime();
      const fs = Math.round(20 * settings.subtitleSize);
      const lineH = Math.round(fs * 1.4);
      const bh = lineH * 2 + 10, bw = Math.min(W - 80, 980);
      const band = { x: (W - bw) / 2, y: H - 20 - bh, w: bw, h: bh };
      const subs = introSubs();
      const first = subs[0], last = subs[subs.length - 1];
      if (time >= first.at - SUB_SCROLL.lead && time < last.end + SUB_SCROLL.linger + SUB_SCROLL.fade) {
        ctx.fillStyle = settings.highContrast ? '#000' : 'rgba(3,5,8,0.62)';
        roundRectPath(ctx, band.x, band.y, band.w, band.h, 5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(233,182,84,0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // the current line sits in the band's lower row; the row above it is the line before
        drawSubtitleScroll(ctx, subs, time, band,
          { font: `600 ${fs}px ${FONT}`, lineH, cy: band.y + band.h - 5 - lineH / 2 });
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, H - 3, W, 3);
    ctx.fillStyle = C.orange;
    ctx.fillRect(0, H - 3, W * p, 3);
  }

  /* The case file — the last screen before the fight, and the only place the
   * player is told who they are about to hit and why.
   *
   * This was a 2.55-second title card that read LEVEL 01 / THE STREET TAX over
   * the street and then dropped straight into the arena. It now carries the
   * whole briefing sheet, so it WAITS for Cross rather than timing out: a case
   * file that nobody can finish reading is set dressing. The world is still
   * arriving underneath, and pressing Cross before it lands falls through to the
   * handover card exactly as the timeout used to.
   *
   * Three columns and a bottom band. Geometry lives in BRIEF so the columns line
   * up by construction instead of by matching literals in six places, and the
   * written blocks flow off measured heights (textBlock returns the next
   * baseline) instead of hand-counted y values.
   */
  const BRIEF = {
    left: { x: 46, w: 440 },
    portrait: { x: 506, y: 46, w: 384, h: 330 },
    profile: { x: 906, y: 46, w: 328, h: 330 },
    objective: { x: 506, y: 392, w: 356, h: 232 },
    chain: { x: 878, y: 392, w: 356, h: 232 },
    stampY: 556, stampH: 62,
  };

  /* Where each wrapped block finished on the last drawn frame. The copy lives in
   * DOSSIER and is wrapped at draw time, so a longer sentence grows a column
   * silently — this is what the harness reads to catch that. */
  const briefY = {};

  /* GO BACK first, START MISSION second — and the ORDER OF THIS LIST IS THE
   * ORDER ON SCREEN. That is the whole point of the arrangement: the row is
   * driven left/right, so index 0 has to be the left-hand button or pressing
   * "forward" would walk the cursor backwards. Anything reading these by index
   * (currentItems, confirm, defaultSelection) reads left-to-right too.
   *
   * The row now runs back -> forward, matching the direction the player is
   * travelling and the direction they push to choose. START keeps the default
   * focus (see defaultSelection) because committing is the primary action; BACK
   * is one press of "backward" away. */
  const BRIEF_ACTIONS = [
    { id: 'levelTitle:back', icon: 'circleBtn', label: 'GO BACK', color: '#ff8f8f', x: 46, w: 188 },
    { id: 'levelTitle:start', icon: 'cross', label: 'START MISSION', color: '#8fb4ff', x: 250, w: 264 },
  ];
  const BRIEF_START = 1;          // index of START MISSION — named, never spelled 1 inline
  const BRIEF_BACK = 0;

  /* These are real controls rather than tiny footer legends. Both retain the
   * shared button language, while staggered glimmers make the two decisions
   * visible at a glance without turning the dossier itself into an animation. */
  const BRIEF_GLIMMER = [
    { period: 3.35, cross: 0.48, passes: [{ off: 0.18, band: 106, a: 0.09 }, { off: 0.24, band: 30, a: 0.19 }] },
    { period: 2.70, cross: 0.52, passes: [{ off: 0, band: 132, a: 0.12 }, { off: 0.06, band: 34, a: 0.25 }] },
  ];

  function drawBriefActions() {
    /* The row is driven left/right, so the screen says so — starting at 540,
     * clear of the buttons. The bar's default 54 puts the legend inside GO BACK
     * and prints one over the other. */
    drawControlBar([{ icon: 'dpad', label: 'FORWARD / BACK' }], 540);
    const y = 668, h = 40;
    BRIEF_ACTIONS.forEach((a, i) => {
      button({
        id: a.id, x: a.x, y, w: a.w, h,
        label: a.label, icon: a.icon,
        focused: selection === i, index: i,
      });
      glimmer(a.x, y, a.w, h, 7, BRIEF_GLIMMER[i]);
    });
  }

  function briefTargetCard(x, y, w, h) {
    glass(x, y, w, h, 8, { tint: 'rgba(9,13,20,0.74)' });
    /* The skull breathes on a slower period than the light sweeping over the
     * card, so the two never fall into step and start reading as one blink. */
    icon('skull', x + 32, y + 37, 26, C.red, 0.62 + 0.34 * breathe(clock, 2.7));
    ctx.textAlign = 'left';
    setFont(700, 9, 2.6);
    ctx.fillStyle = C.gold;
    ctx.fillText('TARGET', x + 58, y + 24);
    setDisplay(700, 24, 1.6);
    ctx.fillStyle = C.paper;
    ctx.fillText(dossier().target, x + 58, y + 50);
    setFont(600, 8.5, 1.8);
    ctx.fillStyle = C.muted;
    ctx.fillText(dossier().role, x + 58, y + 64);

    /* Threat reads twice — the word and the bar — so it does not depend on
     * colour alone. The bar now climbs from zero to HIGH on the narration clock
     * instead of arriving already complete. */
    const right = x + w - 20;
    const level = briefThreatLevel();
    const threatArrived = clamp(level / Math.max(1, dossier().threat.filled), 0, 1);
    ctx.textAlign = 'right';
    setFont(700, 8.5, 2);
    ctx.fillStyle = C.muted;
    ctx.fillText('THREAT LEVEL', right, y + 24);
    setDisplay(700, 18, 1.4);
    ctx.fillStyle = `rgba(224,67,44,${(0.30 + 0.70 * threatArrived).toFixed(3)})`;
    ctx.fillText(dossier().threat.label, right, y + 48);
    ctx.textAlign = 'left';
    const segW = 11, segGap = 3, n = dossier().threat.of;
    let sx = right - (n * segW + (n - 1) * segGap);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = 'rgba(224,67,44,0.16)';
      ctx.fillRect(sx, y + 56, segW, 6);
      const lit = clamp(level - i, 0, 1);
      if (lit > 0) {
        const tip = i === Math.min(dossier().threat.filled - 1, Math.max(0, Math.ceil(level) - 1));
        ctx.fillStyle = tip
          ? `rgba(255,${Math.round(90 + 60 * breathe(clock, 1.9))},64,0.98)`
          : 'rgba(224,67,44,0.92)';
        ctx.fillRect(sx, y + 56, segW * lit, 6);
      }
      sx += segW + segGap;
    }
    ctx.textAlign = 'left';

    /* Light raking across the whole card face, forever. This is the one panel on
     * the page that names the man the level is about, so it is the one that is
     * never allowed to go still. Drawn LAST, over the text, because light falls
     * on a card rather than under what is printed on it. */
    glimmer(x, y, w, h, 8);
    /* And a live edge under the light — the same period as the wide pass, so the
     * border brightens as the sweep arrives instead of on its own schedule. */
    ctx.save();
    ctx.globalAlpha *= 0.30 + 0.55 * hump(((clock / 3.9) % 1) / 0.42);
    roundRectPath(ctx, x, y, w, h, 8);
    ctx.strokeStyle = 'rgba(233,182,84,0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function briefPortrait() {
    const p = BRIEF.portrait;
    glass(p.x, p.y, p.w, p.h, 10, { tint: 'rgba(6,9,14,0.5)' });
    /* THE PHOTOGRAPH BELONGS TO THE DOSSIER. `assets.olodo` is Level 01's case
     * photo, and drawing it unconditionally put HIS face on Level 02's file —
     * the one mistake on this screen that looks like a deliberate reveal. A
     * level with no photograph gets the NO IMAGE ON FILE plate below, which is
     * both honest and the right read for a target the case has only just
     * named. */
    const look = portraitLook(dossier().portrait);
    const art = look && look.img;
    const ix = p.x + 3, iy = p.y + 3, iw = p.w - 6, ih = p.h - 6;
    if (!art) {
      ctx.save();
      roundRectPath(ctx, ix, iy, iw, ih, 8);
      ctx.clip();
      /* A silhouette on a redacted plate, not an empty pane. */
      ctx.fillStyle = 'rgba(10,14,22,0.72)';
      ctx.fillRect(ix, iy, iw, ih);
      const cx = p.x + p.w / 2, cy = p.y + p.h * 0.52, r = Math.min(iw, ih) * 0.20;
      ctx.fillStyle = 'rgba(140,164,196,0.20)';
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.75, r * 0.72, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.35, r * 1.5, r * 1.05, 0, Math.PI, 0); ctx.fill();
      ctx.globalAlpha *= 0.35;
      for (let y = iy; y < iy + ih; y += 4) { ctx.fillStyle = '#9fd6ff'; ctx.fillRect(ix, y, iw, 1); }
      ctx.restore();
      ctx.textAlign = 'center';
      setFont(700, 12, 3.4);
      ctx.fillStyle = C.dim;
      ctx.fillText('NO IMAGE ON FILE', cx, p.y + p.h - 34);
      setFont(700, 9, 2.2);
      ctx.fillStyle = C.muted;
      ctx.fillText(dossier().target, cx, p.y + p.h - 18);
      ctx.textAlign = 'left';
      return;
    }
    ctx.save();
    roundRectPath(ctx, ix, iy, iw, ih, 8);
    ctx.clip();
    /* A slow push on the photograph: 34 s for a full breath over 2% of travel,
     * with a couple of pixels of drift under it. Far too slow to read as motion,
     * which is exactly the point — a case photo held perfectly still reads as a
     * JPEG, and one that drifts reads as being looked at.
     *
     * The zoom floor is 1.02, not 1.00, on purpose: cover-fit leaves no slack at
     * 1.00, so the drift would walk a hard edge into the panel. 2% of a 324 px
     * panel is ~6 px of slack against 2 px of travel. */
    const push = 1.02 + 0.02 * breathe(clock, 34);
    const drift = Math.sin(clock * 0.19) * 2;
    /* Cover-fit: the painting is cropped, never stretched. The shipped crop is
     * already this panel's aspect, so in practice nothing is lost. */
    const s = Math.max(iw / art.width, ih / art.height) * push;
    const dw = art.width * s, dh = art.height * s;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // anchorY: where the slack is taken from — a half-length portrait keeps its head
    ctx.drawImage(art, ix + (iw - dw) / 2, iy + (ih - dh) * look.anchorY + drift, dw, dh);
    /* Sink the edges so the painting sits IN the panel instead of on it. */
    const v = ctx.createRadialGradient(p.x + p.w / 2, p.y + p.h * 0.44, p.h * 0.30,
      p.x + p.w / 2, p.y + p.h * 0.44, p.h * 0.82);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.52)');
    ctx.fillStyle = v;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.restore();
  }

  function briefProfile() {
    const p = BRIEF.profile;
    glass(p.x, p.y, p.w, p.h, 10);
    ctx.textAlign = 'left';
    setFont(700, 10, 3);
    ctx.fillStyle = C.gold;
    ctx.fillText('PROFILE', p.x + 20, p.y + 28);
    hairline(p.x + 20, p.y + 38, p.w - 40);

    const labX = p.x + 30, valX = p.x + 124, valW = p.x + p.w - 18 - valX;
    let y = p.y + 60;
    for (let i = 0; i < dossier().profile.length; i++) {
      const [label, value, tone] = dossier().profile[i];
      ctx.fillStyle = 'rgba(233,182,84,0.38)';
      ctx.fillRect(p.x + 20, y - 4, 3, 3);
      setFont(700, 8.5, 1.5);
      ctx.fillStyle = 'rgba(195,202,214,0.60)';
      ctx.fillText(label, labX, y);
      setFont(600, 10.5, 0.2);
      ctx.fillStyle = tone === 'alert' ? C.red : C.paper;
      y = textBlock(value, valX, y, valW, 12.5);
      if (i < dossier().profile.length - 1) hairline(p.x + 20, y + 3, p.w - 40, 0.05);
      y += 8.5;
    }
    briefY.profile = y;
  }

  function briefObjectives() {
    const p = BRIEF.objective;
    glass(p.x, p.y, p.w, p.h, 10);
    icon('check', p.x + 28, p.y + 25, 15, C.green, 0.9);
    ctx.textAlign = 'left';
    setFont(700, 10, 2.4);
    ctx.fillStyle = C.green;
    ctx.fillText('MISSION OBJECTIVE', p.x + 44, p.y + 29);
    hairline(p.x + 20, p.y + 42, p.w - 40);
    let y = p.y + 68;
    for (const line of dossier().objectives) {
      setFont(700, 9, 0);
      ctx.fillStyle = C.gold;
      ctx.fillText('>', p.x + 24, y);
      setFont(600, 10.5, 0.2);
      ctx.fillStyle = C.paper;
      y = textBlock(line, p.x + 38, y, p.w - 58, 13) + 8;
    }
    briefY.objectives = y;
    setFont(700, 8.5, 2.2);
    ctx.fillStyle = C.dim;
    ctx.fillText(dossier().file, p.x + 24, p.y + p.h - 18);
  }

  /* The hierarchy is deliberately incomplete: Olodo is the first known face,
   * two intermediary bosses remain unidentified, and the extra dots before
   * The Cabal say the chain continues beyond what Level 01 has exposed. No future
   * character art or names are invented. */
  function networkGraph(x, cy, w, opt = {}) {
    const radius = opt.radius ?? 20;
    const reveal = clamp(opt.reveal ?? 1, 0, 1);
    const time = opt.time ?? clock;
    const nodes = dossier().chain;
    const px = [x + radius, x + w * 0.31, x + w * 0.52, x + w - radius];

    ctx.save();
    ctx.textBaseline = 'alphabetic';

    /* Dotted routes draw first so they disappear cleanly beneath every circle. */
    for (let i = 0; i < px.length - 1; i++) {
      const u = clamp(reveal * 4 - i - 0.12, 0, 1);
      if (u <= 0) continue;
      const ax = px[i] + radius + 3;
      const bx = px[i + 1] - radius - 3;
      ctx.save();
      ctx.globalAlpha *= u * 0.72;
      ctx.strokeStyle = i === px.length - 2 ? C.red : C.gold;
      ctx.lineWidth = 1.35;
      ctx.lineCap = 'round';
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(ax, cy);
      ctx.lineTo(lerp(ax, bx, easeOut(u)), cy);
      ctx.stroke();
      ctx.restore();
    }

    /* An explicit ellipsis before The Cabal: more operators exist between the few
     * silhouettes this file can currently prove and the network head. */
    const ellipsisA = px[2] + radius + 11;
    const ellipsisB = px[3] - radius - 11;
    for (let i = 0; i < 4; i++) {
      const u = clamp(reveal * 4 - 2.55 - i * 0.08, 0, 1);
      if (u <= 0) continue;
      const dx = lerp(ellipsisA, ellipsisB, (i + 1) / 5);
      ctx.beginPath();
      ctx.arc(dx, cy, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(233,182,84,${(0.30 + 0.42 * u + 0.18 * breathe(time, 2.2, i * 0.14)).toFixed(3)})`;
      ctx.fill();
    }

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const u = clamp(reveal * 4 - i, 0, 1);
      if (u <= 0) continue;
      const e = easeOutBack(u, 1.18);
      const r = radius * e;
      const tone = node.tone === 'alert' ? C.red : node.tone === 'gold' ? C.gold : C.muted;
      ctx.save();
      ctx.globalAlpha *= clamp(u / 0.35, 0, 1);
      ctx.shadowColor = node.tone === 'alert' ? 'rgba(224,67,44,0.42)' : 'rgba(233,182,84,0.26)';
      ctx.shadowBlur = 8 + 5 * breathe(time, 2.8, i * 0.17);
      ctx.beginPath();
      ctx.arc(px[i], cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6,9,15,0.94)';
      ctx.fill();
      ctx.shadowBlur = 0;

      const nodeLook = node.portrait ? portraitLook(node.portrait) : null;
      if (nodeLook && nodeLook.img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(px[i], cy, Math.max(0, r - 2), 0, Math.PI * 2);
        ctx.clip();
        const art = nodeLook.img;
        const [sx, sy, side] = nodeLook.face(art);
        ctx.drawImage(art, sx, sy, side, side, px[i] - r, cy - r, r * 2, r * 2);
        const shade = ctx.createLinearGradient(0, cy - r, 0, cy + r);
        shade.addColorStop(0, 'rgba(0,0,0,0.02)');
        shade.addColorStop(1, 'rgba(0,0,0,0.48)');
        ctx.fillStyle = shade;
        ctx.fillRect(px[i] - r, cy - r, r * 2, r * 2);
        ctx.restore();
      } else if (node.unknown) {
        /* An unidentified boss is a PERSON we have no picture of, so the disc
         * holds a grey silhouette — the same thing a case file would clip in.
         * It used to be a '?', which read as missing data rather than as a man,
         * and put a punctuation mark in a row of faces.
         *
         * Clipped to the disc so the shoulders run off its edge exactly as the
         * Olodo photograph above does, and drawn in the muted grey rather than
         * the node's tone: these are the ones we cannot colour-code yet. */
        ctx.save();
        ctx.beginPath();
        ctx.arc(px[i], cy, Math.max(0, r - 1.6), 0, Math.PI * 2);
        ctx.clip();
        const bust = r * 2.06;
        icon('bust', px[i], cy + r * 0.20, bust, 'rgba(126,136,150,0.92)', 1);
        ctx.restore();
      } else {
        ctx.textAlign = 'center';
        setDisplay(800, radius * 0.82, 0);
        ctx.fillStyle = tone;
        ctx.fillText('T', px[i], cy + radius * 0.36);
      }

      ctx.beginPath();
      ctx.arc(px[i], cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = tone;
      ctx.lineWidth = node.tone === 'alert' ? 2 : 1.35;
      ctx.stroke();

      ctx.textAlign = 'center';
      setFont(700, opt.labelSize ?? 7.2, 0.55);
      ctx.fillStyle = tone;
      ctx.fillText(node.top, px[i], cy + radius + 13);
      setFont(600, (opt.labelSize ?? 7.2) - 1.1, 0.35);
      ctx.fillStyle = 'rgba(121,130,143,0.90)';
      ctx.fillText(node.bottom, px[i], cy + radius + 23);
      ctx.restore();
    }
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function briefChain() {
    const p = BRIEF.chain;
    glass(p.x, p.y, p.w, p.h, 10);
    ctx.textAlign = 'left';
    setFont(700, 10, 2.4);
    ctx.fillStyle = C.gold;
    ctx.fillText('CONNECTION TO THE CABAL', p.x + 20, p.y + 29);
    hairline(p.x + 20, p.y + 42, p.w - 40);
    let y = p.y + 62;
    for (const para of dossier().chainCopy) {
      setFont(500, 9.5, 0.1);
      ctx.fillStyle = C.text;
      y = textBlock(para, p.x + 20, y, p.w - 40, 13) + 6;
    }
    setFont(700, 9.5, 0.6);
    ctx.fillStyle = C.gold;
    ctx.fillText(dossier().chainNote, p.x + 20, y + 6);
    briefY.chainCopy = y + 6;

    const graphTop = p.y + p.h - 64;
    briefY.chainBoxTop = graphTop;
    networkGraph(p.x + 20, graphTop + 19, p.w - 40, {
      radius: 17,
      labelSize: 6.6,
      reveal: clamp((briefT - 1.55) / 1.65, 0, 1),
    });
  }
  /* One right-column panel's entrance: a scale-out from its own centre with a
   * small overshoot, lifted from below, fading up over the first part of it.
   *
   * The draw callback runs even at u=0, when the panel is invisible. That is
   * deliberate and load-bearing: the written panels MEASURE their wrapped copy
   * as they draw, into briefY, and briefY is what the harness reads to prove a
   * column has not silently overflowed when someone edits the writing. Skipping
   * the draw would leave those numbers stale for the length of the cascade, and
   * undefined on the first frame the screen is ever shown. */
  function briefCard(i, box, draw) {
    const u = briefCardIn(i);
    const e = easeOutBack(u);
    const s = lerp(BRIEF_CARDS.from, 1, e);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    ctx.save();
    ctx.globalAlpha *= clamp(u / 0.4, 0, 1);
    ctx.translate(cx, cy + (1 - e) * BRIEF_CARDS.lift);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  /* The rule under DOSSIER doubles as the voiceover's progress — furniture that
   * was already on the page, rather than a meter bolted onto it. The travelling
   * head is what makes it read as playback and not as a bar filling up. */
  function briefProgressRule(x, y, w) {
    hairline(x, y, w);
    const p = clamp(briefT / (briefVoFor(currentLevel) ?? BRIEF_VO).dur, 0, 1);
    if (p <= 0) return;
    ctx.fillStyle = 'rgba(233,182,84,0.55)';
    ctx.fillRect(x, y, w * p, 1);
    const hx = x + w * p;
    const g = ctx.createRadialGradient(hx, y + 0.5, 0, hx, y + 0.5, 10);
    g.addColorStop(0, 'rgba(255,230,191,0.8)');
    g.addColorStop(1, 'rgba(255,230,191,0)');
    ctx.fillStyle = g;
    ctx.fillRect(hx - 10, y - 5, 20, 11);
  }

  function drawLevelTitle() {
    stage({ darken: 0.66 });
    beginScreen(14);
    const l = BRIEF.left;

    ctx.fillStyle = C.orange;
    ctx.fillRect(0, 96, 10, 262);

    ctx.textAlign = 'left';
    setFont(700, 11, 4);
    ctx.fillStyle = C.gold;
    ctx.fillText('MISSION BRIEFING', l.x, 74);
    /* The heading follows the DOSSIER, not the file. It was three hardcoded
     * strings, so Level 02's case file opened under "LEVEL 01 / THE STREET TAX"
     * with Masood Jibril's profile beside it. */
    setDisplay(700, 54, 2);
    ctx.fillStyle = C.paper;
    ctx.fillText(dossier().code ?? 'LEVEL 01', l.x - 2, 130);
    setDisplay(700, 32, 1.6);
    ctx.fillStyle = C.gold;
    ctx.fillText(dossier().title ?? 'THE STREET TAX', l.x, 166);
    setFont(600, 11, 2.6);
    ctx.fillStyle = C.muted;
    ctx.fillText(dossier().place ?? 'LAGOS, NIGERIA', l.x, 190);

    briefTargetCard(l.x, 208, l.w, 74);

    setFont(700, 10, 3);
    ctx.fillStyle = C.gold;
    ctx.fillText('DOSSIER', l.x, 310);
    briefProgressRule(l.x, 318, l.w);

    /* The dossier types itself, on the narrator's clock. `head` follows the
     * reveal into whichever block is currently landing characters and stays at
     * the end of the last finished one through the pauses between them, so there
     * is exactly ONE caret on the page at any moment and it is never nowhere. */
    let y = 338;
    let head = null;
    for (let i = 0; i < dossier().body.length; i++) {
      setFont(500, 11, 0.1);
      ctx.fillStyle = C.text;
      const t = textBlockTyped(dossier().body[i], l.x, y, l.w, 15.5, briefReveal('body', i));
      if (t.drew) head = { x: t.endX, y: t.endY, size: 11, typing: t.typing };
      y = t.next + 8;
    }
    y += 12;
    for (let i = 0; i < dossier().call.length; i++) {
      setFont(700, 11, 0.3);
      ctx.fillStyle = C.gold;
      const t = textBlockTyped(dossier().call[i], l.x, y, l.w, 16, briefReveal('call', i));
      if (t.drew) head = { x: t.endX, y: t.endY, size: 11, typing: t.typing };
      y = t.next;
    }
    briefY.call = y;

    if (head) typeCaret(head.x, head.y, head.size, head.typing);

    /* Static pledge: it is interface copy, not part of the briefing recording.
     * Nothing here reads briefT or clock, so it cannot type, pulse or drift. */
    if (dossier().stamp) {
      glass(l.x, BRIEF.stampY, l.w, BRIEF.stampH, 6,
        { tint: 'rgba(34,8,6,0.6)', border: 'rgba(224,67,44,0.5)' });
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      setDisplay(700, 14.5, 0.45);
      ctx.fillStyle = C.red;
      ctx.fillText(dossier().stamp[0], l.x + 22, BRIEF.stampY + 26);
      setFont(650, 9.2, 0.42);
      ctx.fillStyle = C.cream;
      ctx.fillText(dossier().stamp[1], l.x + 22, BRIEF.stampY + 47);
    }

    /* The right column arrives as a transition rather than as a page: each panel
     * scales out from its own centre, the MC Olodo photograph FIRST and the three
     * written panels behind it in a short cascade. That order is the reading
     * order the screen wants — see the face, then the file on it. */
    briefCard(0, BRIEF.portrait, briefPortrait);
    briefCard(1, BRIEF.profile, briefProfile);
    briefCard(2, BRIEF.objective, briefObjectives);
    briefCard(3, BRIEF.chain, briefChain);
    endScreen();

    drawBriefActions();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    setFont(700, 10, 3);
    /* A slow blink, on its own long period — a stamped warning on a live file,
     * not a light on a dashboard. */
    ctx.globalAlpha = 0.5 + 0.5 * breathe(clock, 4.3);
    ctx.fillStyle = 'rgba(224,67,44,0.85)';
    ctx.fillText('CONFIDENTIAL', BRIEF.profile.x + BRIEF.profile.w, L.hintY + 0.5);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';


    drawGrain(0.7);
    transitionVeil();
  }

  /* The one screen the moved loading can still surface on: shown only when the
   * player reaches the handover before the art does. On a normal boot the world
   * is in long before the level title ends and this is never drawn. */
  function drawHandoff() {
    stage({ darken: 0.72 });
    const err = worldError();
    ctx.textAlign = 'center';
    setFont(700, 11, 5);
    ctx.fillStyle = C.gold;
    fillCentred(isL2() ? 'LAGOS  /  02' : 'LAGOS  /  01', W / 2, 300);
    setDisplay(700, 54, 2.4);
    ctx.fillStyle = C.paper;
    fillCentred(isL2() ? dossier().title : 'THE STREET TAX', W / 2, 368);

    if (err) {
      setFont(600, 13, 1.6);
      ctx.fillStyle = '#ff6a4d';
      fillCentred(`ASSET ERROR — ${err}`, W / 2, 430);
    } else {
      const f = clamp(worldProgress(), 0, 1);
      /* THE LEVEL-TITLE LOADING BAR, CENTRED ON THE LIVE WIDTH (request 489). It
       * was hardcoded at x 390..890 — the centre of the old 1280 frame — while its
       * title and percentage are centred on W / 2, so on every screen that is not
       * exactly 1280 wide (every phone: the mobile layout widens W to the device
       * aspect) the bar sat off to the left of its own title. drawLoading's bar had
       * the same fix; this, the handover's, never got it. */
      const bw = 500, by = 424, bx = Math.round(W / 2 - bw / 2);
      roundRectPath(ctx, bx, by, bw, 5, 2.5);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fill();
      roundRectPath(ctx, bx, by, Math.max(5, bw * f), 5, 2.5);
      ctx.fillStyle = C.orange;
      ctx.fill();
      setFont(700, 11.5, 3);
      ctx.fillStyle = C.gold;
      fillCentred(`PREPARING THE STREETS  ${Math.round(f * 100)}%`, W / 2, 460);
    }
    drawGrain(0.6);
  }

  function drawExtras() {
    stage({ darken: 0.46 });
    beginScreen();
    screenHead('ARCHIVE', 'EXTRAS', 'Additional material unlocks as production expands.');
    const items = ['CHARACTER GALLERY', 'CONCEPT ART', 'ANIMATION GALLERY', 'MUSIC', 'STORY', 'DEVELOPER NOTES', 'ARTWORK'];
    for (let i = 0; i < items.length; i++) {
      const x = 58 + (i % 3) * 392, y = 186 + Math.floor(i / 3) * 104;
      glass(x, y, 368, 88, 9, { tint: 'rgba(9,13,20,0.56)' });
      ctx.textAlign = 'left';
      setFont(700, 13.5, 2.2);
      ctx.fillStyle = 'rgba(175,185,200,0.6)';
      ctx.fillText(items[i], x + 22, y + 51);
      icon('lock', x + 340, y + 44, 18, C.dim, 0.55);
    }
    endScreen();
    drawControlBar([MENU_HINTS[2]]);
    drawGrain();
    transitionVeil();
  }

  function drawCredits() {
    stage({ darken: 0.56 });
    beginScreen(0);
    drawLogoBox(W / 2 - 180, 222, 360);
    ctx.textAlign = 'center';
    setFont(700, 11, 5);
    ctx.fillStyle = C.gold;
    ctx.fillText('A GAME BY', W / 2, 268);
    setDisplay(700, 40, 2.4);
    ctx.fillStyle = C.paper;
    ctx.fillText('KENCRAFTS STUDIO', W / 2, 322);
    setFont(500, 12.5, 0.4);
    ctx.fillStyle = C.muted;
    ctx.fillText('Only confirmed production credits are shown.', W / 2, 362);
    ctx.fillStyle = 'rgba(233,182,84,0.24)';
    ctx.fillRect(460, 392, 360, 1);
    setFont(700, 11, 4);
    ctx.fillStyle = C.gold;
    ctx.fillText('LAGOS, NIGERIA', W / 2, 424);
    endScreen();
    drawControlBar([MENU_HINTS[2]]);
    drawGrain();
    transitionVeil();
  }

  /* There is deliberately NO pause screen in here. The pause menu belongs on
   * top of the frozen fight — a menu background video behind it would throw the
   * frame the player stopped on away — so game.js draws it, using the `ui`
   * bundle below so it is the same widget set as every screen in this file. */

  /* ----------------------------------------------------------- intro clip */

  /* Which cut the next `preloadIntro` should build. Null means the shipped one.
   * Set by startLevel; read here so there is still exactly one place that
   * constructs the element. */
  let introSrcOverride = null;

  async function preloadIntro() {
    if (!introVideo) {
      /* MOBILE INTRO: the packaged build ships a 720p transcode beside the
       * master (mobile/assets-mobile/frontend/intro/intro-mobile.mp4, ~8MB vs
       * 67MB) so the first frame lands quickly even while the world load is
       * hammering the phone. Desktop and the master keep their source. */
      const src = introSrcOverride ?? INTRO_MASTER;
      introFailed = false;                 // a new element gets its own chance to play
      introVideo = document.createElement('video');
      introVideo.dataset.rorSrc = src;
      introVideo.src = new URL(src, import.meta.url);
      introVideo.preload = 'auto';
      introVideo.muted = true;
      introVideo.playsInline = true;
      introVideo.setAttribute('playsinline', '');
      introVideo.setAttribute('aria-hidden', 'true');
      introLoadProgress = 0.15;
      if (isL2()) ensureIntroMusic().load();      // the score loads behind the cut (request 452)
    }
    // CAN PLAY, not just a first frame (request 360): the intro starts on a player that can keep going.
    if (introVideo.readyState >= 3) { introLoadProgress = 1; return; }
    if (!introLoadPromise) {
      introLoadPromise = new Promise((resolve) => {
        let settled = false;
        const cleanup = () => {
          introVideo.removeEventListener('canplay', ready);
          introVideo.removeEventListener('error', failed);
          clearTimeout(watchdog);
        };
        const ready = () => {
          if (settled) return;
          settled = true; cleanup(); introLoadProgress = 1; resolve();
        };
        /* A FAILED OR SLOW INTRO MUST NEVER WEDGE THE STORY SCREEN. The gate
         * to the next phase is `introLoadProgress >= 1`; before this, an
         * error event rejected an un-awaited promise and the bar simply sat
         * at its 15% mark forever. Failure now marks the intro unavailable,
         * completes the progress and lets the flow skip the cinematic. */
        const failed = () => {
          if (settled) return;
          settled = true; cleanup();
          console.warn('[ror intro] video failed to produce a first frame; skipping the cinematic');
          introFailed = true; introLoadProgress = 1; resolve();
        };
        /* Patient: the world load shares the thread and the local server while
         * this runs, so a slow-but-loading intro must NOT be skipped early. */
        const watchdog = setTimeout(failed, 45000);
        introVideo.addEventListener('canplay', ready, { once: true });
        introVideo.addEventListener('error', failed, { once: true });
        introVideo.load();
      });
    }
    await introLoadPromise;
  }

  /* THE CINEMATIC IS LET GO THE MOMENT IT ENDS (request 360). Kept parked at
   * 0:00 for the next level run, the element had to SEEK back to the start of a
   * stream the browser had long since dropped (a whole fight later), and the
   * second viewing — "PLAY LEVEL 02", which reuses this cut — froze on its first
   * frame for ~5 s while it re-buffered under a running voice. Released, the
   * phone gets the decoder and its memory back for the fight, and the next run
   * builds a fresh element that loads at 0:00 behind the loading screen. */
  function releaseIntroVideo() {
    stopIntroMusic();                     // every way out of the cinematic comes through here (request 452)
    if (!introVideo) return;
    introVideo.pause();
    introVideo.removeAttribute('src');
    try { introVideo.load(); } catch {}     // drops the decoder and the buffered stream
    introVideo = null;
    introLoadPromise = null;
  }

  function beginIntro() {
    introFallbackT = 0;
    introStarted = false;
    introDone = false;
    introClosing = false;
    setAmbiencePlaying(false);
    /* LEVEL 02: held until the bars that brought this screen in have fully
     * opened (update() releases it), so the first word and its subtitle are
     * never under a bar. The first frame is already drawn behind them. */
    if (isL2() && barCut.active) { introDeferred = true; return; }
    introDeferred = false;
    if (introVideo && !introFailed) {
      introVideo.pause();
      // A fresh element is already at 0:00, and a seek to where it already is still stalls.
      if (introVideo.currentTime > 0.05) introVideo.currentTime = 0;
      /* Level 01's cut is picture only (its voice is level1-voiceover.mp3);
       * Level 02's video carries its own narration, on the VOICE slider. */
      introVideo.muted = !isL2();
      if (isL2()) introVideo.volume = clamp(settings.master * settings.voice, 0, 1);
      const videoPlay = introVideo.play();
      if (isL2()) {                                 // the score, faded in under the narration (update)
        const m = ensureIntroMusic();
        introMusicT = 0;
        m.volume = 0;
        try { if (m.currentTime > 0.05) m.currentTime = 0; } catch {}
        m.play()?.catch?.(() => {});
      }
      /* An unmuted start can still meet the autoplay policy; the picture and
       * the subtitles must go on regardless, so retry it muted. */
      if (videoPlay?.catch) videoPlay.catch(() => {
        if (!isL2() || !introVideo) return;
        introVideo.muted = true;
        introVideo.play().catch(() => {});
      });
    }
    if (!introVoice()) { introStarted = true; return; }
    voice.currentTime = 0;
    applyAudioSettings();
    const p = voice.play();
    introStarted = true;
    if (p?.catch) p.catch(() => { introStarted = false; });
  }

  function finishIntro() {
    if (introDone) return;
    /* LEVEL 02 closes the bars over the cinematic first (its sound fading with
     * them, see update) and only then lets the video go and opens on the case
     * file. Every way out — watched to the end, skipped, failed — comes here,
     * and the cut's own latch makes a second call (the end-of-clip check runs
     * every frame) a no-op. */
    if (isL2() && !introClosing) {
      if (barCut.active) return;
      introClosing = true;
      introDeferred = false;
      barCut.start(() => { introDone = false; finishIntroNow(); });
      return;
    }
    if (isL2() && barCut.covering && barCut.phase === 'closing') return;
    finishIntroNow();
  }

  function finishIntroNow() {
    if (introDone) return;
    introDone = true;
    introPlayed = true;          // this level run has shown the cinematic
    /* …and the player has now seen it at all, which is what arms tap-to-skip on
     * every later viewing. Written however the intro ended — watched, skipped
     * with a key, or abandoned because the file would not play: in all three
     * cases they have had their chance at it. */
    if (!introSeen) {
      introSeen = true;
      try { localStorage.setItem(INTRO_SEEN_KEY, '1'); } catch {}
    }
    releaseIntroVideo();
    if (introVoice()) {
      const start = voice.volume;
      let n = 0;
      const fade = setInterval(() => {
        n++;
        voice.volume = start * Math.max(0, 1 - n / 6);
        if (n >= 6) { clearInterval(fade); voice.pause(); applyAudioSettings(); }
      }, 35);
    }
    go('levelTitle');
  }

  let introTimeOverride = null;     // test hook: drawIntroAt
  /* IS THE NARRATION ACTUALLY SOUNDING? (request 346) `introStarted` goes true
   * the moment play() is CALLED. On Android the voice is a VoiceClip whose clock
   * is the audio context's, so while that context is still suspended — or the
   * clip is decoding, or never starts — its currentTime sits at 0 and the
   * subtitles (and the progress bar) wait on a clock that is not moving while
   * the picture plays on. Read the voice only while it runs; otherwise the
   * picture, then the fallback timer, carry the intro. */
  const voiceSounding = () => !!introVoice() && introStarted && (voice.ended || (!voice.paused
    && (!(voice instanceof VoiceClip) || sfx.ac?.state === 'running')));   // a finished line still owns the clock
  const videoRunning = () => !!introVideo && introStarted && !introFailed && introVideo.readyState >= 2;
  function introTime() {
    if (introTimeOverride != null) return introTimeOverride;
    if (voiceSounding()) return voice.currentTime;
    if (videoRunning()) return introVideo.currentTime;
    return introFallbackT;
  }

  function introProgress() {
    if (voiceSounding() && Number.isFinite(voice.duration) && voice.duration > 0) return clamp(voice.currentTime / voice.duration, 0, 1);
    if (videoRunning() && Number.isFinite(introVideo.duration) && introVideo.duration > 0) return clamp(introVideo.currentTime / introVideo.duration, 0, 1);
    return clamp(introFallbackT / 37.2, 0, 1);
  }

  /* ------------------------------------------------- starting a level ------
   * THE ONE DOOR INTO A LEVEL FROM OUTSIDE THE MENU.
   *
   * The post-mission sequence ends on a choice — play 02, or run 01 again — and
   * both answers have to arrive at exactly what the menu's own path arrives at:
   * intro video, case file, handover. So this does not build a second pipeline.
   * It swaps the video SOURCE for the chosen level and then re-enters the
   * existing one at `go('loading')`, which preloads and hands to `intro`.
   *
   * `LEVEL_INTRO` is the only per-level thing here. A level with no cut of its
   * own reuses the shipped one rather than showing black — the reuse is
   * deliberate and it is recorded, so a test can tell it apart from a mis-wire.
   */
  /* THE TWIN IS NOT OPTIONAL ON ANDROID. build-demo.js DELETES the 67 MB master
   * from the packaged www once the mobile transcode is present, so naming the
   * master here shipped a path that 404s on the phone: preloadIntro's error
   * handler set introFailed and the cinematic was silently skipped — but only
   * on the routes that come through startLevel (the post-mission "play 02" and
   * "run 01 again"), which is why a first run looked fine and a replay did not.
   * The master's own file is `Intro.mp4`, capital I, and Android asset paths are
   * case-sensitive, so it could not have resolved even if it shipped. */
  const INTRO_MASTER = IS_ANDROID
    ? '../frontend/intro/intro-mobile.mp4'
    : '../frontend/intro/Intro.mp4?v=master37-fixed';
  /* Level 02's own cut (request 399), with the same master/twin split: the
   * 128 MB master on desktop, a 720p transcode on Android (made without ffmpeg
   * by _chromakey/req399/tx/transcode.js; the APK build drops the master and the
   * web build serves the twin under the master's name). */
  const LEVEL_INTRO = {
    1: INTRO_MASTER,
    2: IS_ANDROID ? '../frontend/intro/level2-intro-mobile.mp4' : '../frontend/intro/level2-intro.mp4',
  };
  /* WHICH LEVEL THE NEXT RUN IS, without going anywhere: its cinematic, its read,
   * its entry line, its dossier. startLevel uses it and then navigates; the menu's
   * own Level 01 routes (START GAME, LEVEL SELECT > 01) call it on its own,
   * because they walk the setup screens first — and without it, a Level 01 run
   * started after a Level 02 one in the same session kept Level 02's file. */
  function selectLevel(level = 1) {
    const id = LEVEL_INTRO[level] ? level : 1;
    currentLevel = id;
    const src = LEVEL_INTRO[id];
    /* Only rebuild the element when the source actually changes: tearing the
     * video down and back up for the same file would throw away a decode the
     * player has already waited for. */
    if (introVideo && introVideo.dataset.rorSrc !== src) releaseIntroVideo();
    introSrcOverride = src;
    introPlayed = false;          // a fresh level run plays the cinematic once
    stopBriefing();
    selectLevelAudio(id);         // this level's read and entry line, the other's silenced
    briefDoneT = 0;
    introClosing = false;
    introDeferred = false;
    briefDeferred = false;
    return { id, src };
  }

  /* LEVEL 02 OPENS FROM LEVEL 01's COMPLETION (request 403). The progress store
   * counts completions (rrGameEvent 'level_complete', written when the post-
   * mission sequence starts). The best-score key is the fallback: computeScore
   * only ever runs on a finished level, and it is the one record a player who
   * beat Level 01 before the progress store existed (request 378) still has. */
  function levelUnlocked(n) {
    if (n <= 1) return true;
    if (n !== 2) return false;
    try {
      const L1 = window.RRProgress?.get()?.levels?.['1'];
      if (L1 && (L1.completions > 0 || Object.keys(L1.best || {}).length)) return true;
    } catch {}
    try {
      for (const d of ['EASY', 'NORMAL', 'HARD', 'ARCADE']) if (localStorage.getItem(`ror.best.l1.${d}`)) return true;
    } catch {}
    return false;
  }

  /* CONTINUE (request 482): back to the latest checkpoint, through the same door
   * RESTART CHECKPOINT uses — the checkpoint, level and difficulty handed over in
   * sessionStorage and a clean reload straight into gameplay (no cinematic, no
   * walk-in). game.js's onGameplayStart sees `rorContinue` and resumes there. */
  function continueGame() {
    const cp = continuePoint();
    if (!cp) return;
    try {
      sessionStorage.setItem('rorRetryCheckpoint', JSON.stringify({ level: cp.level, section: cp.section,
        boss: !!cp.boss, ...(cp.mission ? { mission: cp.mission } : {}) }));
      sessionStorage.setItem('rorRetryLevel', String(cp.level));
      sessionStorage.setItem('rorRetryDifficulty', cp.difficulty || 'NORMAL');
      sessionStorage.setItem('rorContinue', '1');
      sessionStorage.setItem('rorSkipToGameplay', '1');
    } catch { return; }
    location.reload();
  }

  function startLevel(level = 1) {
    const { id, src } = selectLevel(level);
    /* LEVEL 02 IS ENTERED ON THE BARS (request 399). Coming out of the fight's
     * aftermath, the frame on screen is game.js's; it is captured and the bars
     * close over it. Behind them the loading phase starts the video's preload
     * and the black holds until the cut can open straight onto the cinematic
     * (or, after 2.5 s, onto the loading screen, which then cuts again). */
    if (id === 2) {
      const fromFight = phase === 'gameplay';
      barCut.reset();
      barFrame = fromFight ? captureTransitionFrame() : null;
      releaseCanvas();
      setAmbiencePlaying(true);
      clearHeld();
      pendingGameplay = false;
      pausedOrigin = false;
      returnPhase = 'menu';
      go('loading', { force: true });
      barCut.start(() => { barFrame = null; }, {
        waitFor: () => introLoadProgress >= 1, maxHold: 2.5,
        onOpen: () => { if (introLoadProgress >= 1) go('intro'); },
      });
      return { level: id, intro: src };
    }
    pendingGameplay = false;
    pausedOrigin = false;
    returnPhase = 'menu';
    releaseCanvas();
    setAmbiencePlaying(true);
    clearHeld();
    go('loading', { force: true });               // …and the existing pipeline takes it
    return { level: id, intro: src };
  }

  /* ---------------------------------------------------------- lifecycle */

  async function load() {
    /* The guide uses the real touch HUD artwork and has no procedural fallback.
     * NOT awaited (request 343): awaiting eight loads + decode() here held the
     * whole boot — studio card included — on the slowest of them, and one bad
     * file or a decode that never settles left the game on a black screen. Each
     * lands on its own long before the guide can be reached; a slot whose image
     * is not in yet draws nothing (mobileControlArt). */
    for (const [name, src] of Object.entries(MOBILE_CONTROL_ART)) {
      image(src).then((img) => { assets.mobileControls[name] = img; })
        .catch((err) => console.warn(err.message));
    }

    /* The grain tile and the logo are drawn here, not fetched, so they cost
     * nothing and the studio card can be on screen this frame. */
    if (GRAIN_ALPHA > 0) buildGrain();     // off by default — see GRAIN_ALPHA
    buildTextLogo();      // stands in until the supplied mark lands, and if it never does
    loadLogoArt();
    /* Not awaited, same reasoning as the wordmark: the studio card has to be on
     * screen this frame and the title is ~6 s away. drawTitle falls back to
     * the wordmark for as long as this is in flight. */
    loadTitleArt();
    /* The clip is NOT kicked here any more: the studio card holds the screen
     * for SPLASH_CARD_LEAD first, and update() starts the video when that beat
     * is done. (A session that skipped the splash via `rorSkipSplash` starts on
     * the menu, where neither ever runs.) */
    loadDarkiPlacement(); // before the first draw, so he never jumps into place
    /* Said once, at boot. The tool draws nothing until it is opened, so without
     * this the only way to know it is there is to already know. */
    console.info('[ratel-ui] menu Darki placement tool: press F9 (drag to move, '
      + 'wheel to scale, arrows to nudge, C to copy the line)');
    /* Darki's idle sheet is 15 MB and the studio card does not contain him, so
     * it is NOT awaited: drawDarki and the avatar both no-op until it lands,
     * which is well before the title screen it first appears on. */
    image(IDLE.src)
      /* decode() BEFORE it is handed to the renderer: `onload` only means the
       * bytes are in, and this sheet is 5784x4780, so the decode the first
       * drawImage would trigger is a ~1.7 s block on the main thread — measured,
       * and it landed squarely on the title screen. Off-thread here instead. */
      .then((img) => (img.decode ? img.decode().catch(() => {}).then(() => img) : img))
      .then((img) => { assets.darkiIdle = img; buildAvatar(); })
      .catch(() => {});

    /* The case file's portrait: 144 KB, and the screen that wants it is minutes
     * away past the intro, so it is fetched here and never awaited. briefPortrait
     * draws a CASE PHOTO placeholder if it somehow is not in yet. */
    image('../frontend/olodo-dossier.jpg')
      .then((img) => { assets.olodo = img; })
      .catch(() => {});
    image('../frontend/jimoh-dossier.jpg')                 // Level 02's target (request 403)
      .then((img) => { assets.jimoh = img; })
      .catch(() => {});

    /* AHEAD OF THE NARRATION, not after it. initSfx builds the AudioContext the
     * voice clips play out of (see VoiceClip), so on Android a clip constructed
     * before this line would have nothing to decode into. The cue decoding it
     * kicks off is still in the background and still un-awaited. */
    initSfx();

    /* The ambience is the one read that stays an element: 6.2 MB looping, which
     * decoded is over 100 MB of PCM. It only ever plays start-to-end on repeat
     * and never seeks, so it was never exposed to the range bug. */
    ambience = new Audio(new URL('../frontend/audio/bg2.mp3', import.meta.url));
    ambience.loop = true;
    ambience.preload = 'auto';
    voice = makeVoice(new URL('../frontend/audio/level1-voiceover.mp3', import.meta.url));
    /* Level 01's narration ending ends Level 01's intro — and only that: the
     * same handler firing during Level 02 must not advance Level 02's. */
    voice.addEventListener('ended', () => { if (!isL2()) finishIntro(); });
    gameplayStartVo = makeVoice(new URL('../sounds/voices/voice-gameplay-start.mp3', import.meta.url));

    /* The case file's read — 45.9 s, and the clock its whole reveal is animated
     * against (BRIEF_SCRIPT). Fetched here and never awaited, like the portrait
     * it plays over: the screen that wants it is minutes away past the intro.
     * Deliberately has NO 'ended' handler — the read finishing must not dismiss
     * the case file, which waits for Cross and nothing else. */
    briefVo = makeVoice(new URL(BRIEF_VO.src, import.meta.url));
    /* The measured value above makes the first frame deterministic; metadata is
     * still authoritative if production replaces the cut again. */
    {
      const v = briefVo;
      v.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(v.duration) && v.duration > 0) BRIEF_VO.dur = v.duration;
      });
    }
    levelClips[1] = { brief: briefVo, entry: gameplayStartVo };
    applyAudioSettings();

    /* initSfx has already run, above the narration clips — it has to, because it
     * builds the context they decode into. Calling it a second time here would
     * open a SECOND AudioContext and orphan everything in the first. */

    const play = bgVideo.play();
    if (play?.catch) play.catch(() => {});

    if (sessionStorage.getItem('rorSkipToGameplay')) {
      sessionStorage.removeItem('rorSkipToGameplay');
      /* RETRY KEEPS THE LEVEL (request 399). The reload forgets everything, so
       * game.js writes which level the retry was for; Level 02 is restored here
       * — its dossier, its entry line — and its cinematic and read are NOT
       * replayed: a retry goes straight back to the fight, as Level 01's does. */
      let retryLevel = 1;
      try { retryLevel = Number(sessionStorage.getItem('rorRetryLevel')) || 1; sessionStorage.removeItem('rorRetryLevel'); } catch {}
      // …and the difficulty it was played at (request 482: RETRY used to come back on NORMAL)
      try {
        const d = sessionStorage.getItem('rorRetryDifficulty');
        sessionStorage.removeItem('rorRetryDifficulty');
        if (['EASY', 'NORMAL', 'HARD', 'ARCADE'].includes(d)) difficulty = d;
      } catch {}
      if (retryLevel === 2) {
        currentLevel = 2;
        introSrcOverride = LEVEL_INTRO[2];
        introPlayed = true;
        selectLevelAudio(2);
      }
      /* RESTART CHECKPOINT reloads the page and lands here. The world is
       * certainly not in yet on this path, so it holds on the handover card
       * rather than replaying the studio card on the way to the fight. */
      enterGameplay();
    }
  }

  function update(dt) {
    clock += dt;
    phaseT += dt;
    keepMediaAlive(ambience, ambienceLife, dt, ambienceWanted && phase !== 'splash');
    keepContextAlive(sfx.ac, sfxCtxLife, dt);   // menu sounds + the Android narration (request 348)
    updateGestureGuide(dt);                     // the once-per-session touch guide (request 366)
    keepAwake('video', phase === 'splash' || phase === 'intro');   // no dimming under a video (request 349)
    if (inputLock > 0) inputLock = Math.max(0, inputLock - dt);
    if (messageT > 0) messageT = Math.max(0, messageT - dt);
    /* Tied to the prompt, not to its own clock — see requestQuit. */
    if (quitArmedT > 0) quitArmedT = Math.max(0, quitArmedT - dt);
    if (rejectT > 0) rejectT = Math.max(0, rejectT - dt);

    /* LEVEL 02's bars (request 399). Stepped first so the screen behind them
     * changes on the frame they meet, and the media held back for them starts
     * on the frame they finish opening. */
    barCut.update(dt);
    if (!barCut.active) {
      if (introDeferred && phase === 'intro') { introDeferred = false; beginIntro(); }
      if (briefDeferred && phase === 'levelTitle') { briefDeferred = false; beginBriefing(); }
    }
    /* The cinematic's sound leaves with the picture as the bars close on it. */
    if (introClosing && introVideo && isL2()) {
      introVideo.volume = clamp(settings.master * settings.voice, 0, 1) * (1 - barCut.depth);
    }
    /* The score: faded in from its first frame, held at its measured level under
     * the narration (live with the MUSIC slider), and out with the bars. */
    if (introMusic && !introMusic.paused) {
      if (phase !== 'intro') stopIntroMusic();
      else {
        introMusicT += dt;
        const fade = Math.min(1, introMusicT / L2_INTRO_MUSIC.fadeIn);
        introMusic.volume = introMusicLevel() * fade * (introClosing ? (1 - barCut.depth) : 1);
      }
    }

    /* Ahead of the pendingGameplay hold below, because the press being answered
     * may BE the one that asks for the handover — the beat has to finish on the
     * case file, not behind the hold card. */
    tickPressGate(dt);
    /* fx still has to breathe during the beat: the button the player pressed is
     * mid-click and its compression must be seen springing back. */
    if (pressGate.action) { keepBackgroundRolling(); tickFx(dt); return; }

    /* A handover was asked for and the level is still arriving: hold here,
     * ignore the phase timeline entirely, and go the instant the art is in. */
    if (pendingGameplay) {
      handoffT += dt;
      keepBackgroundRolling();
      if (isWorldReady()) enterGameplay();
      return;
    }

    keepBackgroundRolling();
    processHeldInput(dt);
    tickFx(dt);

    /* Studio card straight into the title. The `black` cut and the `reveal`
     * screen that used to sit between them are gone: `reveal` was a centred
     * logo over the street and `title` was the same logo shoved into the corner
     * with a character standing next to it, so the sequence showed the logo
     * twice and arrived somewhere worse. The title now IS the centred reveal,
     * and it grows its own prompt in place.
     *
     * THE CLIP DECIDES WHEN THIS ENDS, not a constant. It used to be a flat
     * 2.2 s against a 2.2 s drawn beat; the supplied video is 6.006 s, and
     * hardcoding that number would put the cut back out of sync the first time
     * the card is re-cut. `ended` is the primary signal.
     *
     * SPLASH_MAX is a DEADLOCK GUARD, not the timing. If the file 404s, stalls
     * mid-decode, or the element never fires `ended`, the game must still reach
     * its menu — a studio card is the one screen where a hang looks exactly
     * like a long dramatic pause. It is set well past the clip's own length so
     * it can never be what normally advances the screen. */
    if (phase === 'splash') {
      /* The studio card's beat is over: roll the clip. Guarded by
       * startSplashVideo's own `splashStarted` latch, so calling it every frame
       * after the lead costs nothing and the start cannot be missed by a frame
       * that happened to straddle the boundary. */
      if (phaseT >= SPLASH_CARD_LEAD) startSplashVideo();
      const dur = Number.isFinite(splashVideo.duration) ? splashVideo.duration : 0;
      const rolled = dur > 0 && splashVideo.currentTime >= dur - 0.05;
      const live = !splashFailed && splashVideo.readyState >= 2;

      /* PARK ON THE WORDMARK. Entered once — `splashHoldT` latches at 0 — and
       * only for a clip that is actually playing: a failed or stalled file has
       * no frame worth freezing and must fall through to the guards below. */
      if (live && splashHoldT < 0 && splashVideo.currentTime >= SPLASH_HOLD_AT && !splashEnded) {
        splashHoldT = 0;
        try { splashVideo.pause(); } catch {}
      }
      if (splashHoldT >= 0) splashHoldT += dt;

      if (splashHoldT >= SPLASH_HOLD) go('title');
      /* `rolled`/`ended` still end the screen for a clip that got past the hold
       * point without being caught — a seek, a re-cut shorter than
       * SPLASH_HOLD_AT, or a frame so long it stepped over it. */
      else if (splashHoldT < 0 && (splashEnded || rolled)) go('title');
      else if (splashFailed && phaseT > SPLASH_CARD) go('title');
      else if (phaseT > SPLASH_MAX) go('title');
    }
    /* The title's load latch. In update() rather than in drawTitle() so the
     * press gate and the prompt agree on the same frame — see `titlePromptAt`. */
    else if (phase === 'title') {
      if (titleReadyAt === null && worldProgress() >= 1) titleReadyAt = phaseT;
    }
    else if (phase === 'loading' && phaseT > 1.6 && introLoadProgress >= 1) {
      /* The cinematic plays ONCE per level run: re-entering the loading phase
       * from the briefing's Back → Forward must not replay it. */
      const nextPhase = introPlayed ? 'levelTitle' : 'intro';
      if (!isL2()) go(nextPhase);
      else if (!barCut.active) barCut.start(() => go(nextPhase));   // Level 02 cuts on the bars
    }
    else if (phase === 'intro' && (introDeferred || introClosing)) {
      /* Level 02's cinematic is waiting for its bars, or leaving under them:
       * no clock, no retry, no end check — the cut owns this screen. */
    }
    else if (phase === 'intro') {
      /* The intro could not produce its first frame: skip the cinematic
       * straight to the case file rather than holding a black screen. */
      if (introFailed) { finishIntro(); return; }
      introFallbackT += dt;
      /* VOICE RETRY. On a phone the first play() can meet the autoplay policy
       * (the element refuses until a trusted gesture has landed) — a rejection
       * used to leave the whole cinematic silent. Retry once a second; once it
       * takes, move the narration to where the picture already is so the two
       * stay on the same clock. That catch-up is a buffer offset on Android
       * (VoiceClip) rather than a media seek, so it costs nothing. */
      if (!introStarted && introVoice()) {
        voiceRetryT += dt;
        if (voiceRetryT > 1) {
          voiceRetryT = 0;
          applyAudioSettings();
          const p = voice.play();
          if (p?.then) p.then(() => {
            introStarted = true;
            if (introVideo && introVideo.readyState >= 2 && introVideo.currentTime > 1
              && Number.isFinite(voice.duration) && voice.duration > 1) {
              try {
                voice.currentTime = Math.min(introVideo.currentTime, voice.duration - 0.5);
              } catch {}
            }
          }).catch(() => {});
        }
      }
      /* SYNC WITHOUT SEEKING AT ALL.
       *
       * This used to hard-resync on drift > 0.5s (`introVideo.currentTime =
       * voice.currentTime`) and THAT is what made the cinematic play in short
       * loops on the phone: a seek to a non-zero offset issues a Range request,
       * and the packaged server answered every one of them with the top of the
       * file, so the picture jumped back to frame one. Drift then grew again
       * and the next resync did it once more — the loop the device showed.
       *
       * The native range handler now serves those honestly, but the seek earns
       * nothing here regardless: rate-nudging closes half a second of drift in
       * a few seconds, invisibly, while a seek on a phone costs a re-buffer and
       * a visible jump. So there is no longer a seek in this path at all — only
       * the ±15% rate correction, widened to cover what the resync used to. */
      if (introVideo && introVoice() && voiceSounding() && !voice.ended && introVideo.readyState >= 2) {
        const drift = introVideo.currentTime - voice.currentTime;   // + = video ahead
        if (Math.abs(drift) > 0.12 && !introVideo.seeking) {
          introVideo.playbackRate = Math.max(0.85, Math.min(1.15, 1 - drift * 0.4));
        } else if (introVideo.playbackRate !== 1) {
          introVideo.playbackRate = 1;
        }
        if (introVideo.paused && !introVideo.ended) introVideo.play().catch(() => {});
      }
      /* END ON THE CLIP'S CLOCK. The blunt 40 s cap cut a still-playing intro
       * in half whenever the media stalled momentarily; it now only fires when
       * no media clock exists at all, with a hard ceiling well past the clip
       * as the final guard. */
      const mediaAlive = (introVoice() && !voice.paused && voice.currentTime > 0)
        || (introVideo && introVideo.readyState >= 2 && !introVideo.paused);
      if ((mediaAlive && introProgress() >= 0.999)
        || (!mediaAlive && introFallbackT > 40)
        || introFallbackT > 120) {
        if (introVideo) introVideo.playbackRate = 1;
        finishIntro();
      }
    }
    /* The case file runs on the VOICEOVER's clock, not on its own. The typewriter
     * has to land on the narrator's words, and a dt accumulator drifts against a
     * media element the moment a frame is dropped — so the clip is the authority
     * whenever it is actually rolling, and dt is only the fallback for a refused
     * or missing play(). */
    else if (phase === 'levelTitle') {
      if (briefPinned) { /* a harness owns the clock — leave it exactly where it was put */ }
      else if (briefDeferred) { /* Level 02's read has not started: its bars are still opening */ }
      else if (briefVo && briefStarted && !briefVo.paused && briefVo.currentTime > 0) {
        briefT = briefVo.currentTime;
        briefStallT = 0;
      }
      /* A VO that is merely BUFFERING must not hand the clock to dt: the case
       * file used to run ahead of the narrator and finish before he did. Hold
       * for a short grace window, then fall back only if the clip never resumes. */
      else if (briefVo && briefStarted && !briefVo.ended && briefStallT < 3) {
        briefStallT += dt;
      }
      else briefT += dt;
      /* LEVEL 02 MOVES ON WHEN ITS READ IS DONE (request 399): the read and the
       * typing finished, a short hold to let the last line land, then the same
       * door START MISSION uses. The read ending is judged on its own clock
       * (or, if it never played, on the dt fallback reaching its length). */
      if (isL2() && !briefDeferred && !pendingGameplay && !barCut.active) {
        const dur = BRIEF_VO_L2.dur;
        const done = briefT >= dur - 0.05 || (briefVo && briefStarted && briefVo.ended);
        briefDoneT = done ? briefDoneT + dt : 0;
        if (briefDoneT >= BRIEF_L2_HOLD) enterGameplay();
      }
    }
    /* `levelTitle` deliberately has no timeout — it is a case file the player
     * dismisses with Cross, and the read finishing does not dismiss it either.
     * See drawLevelTitle. */
  }

  function draw() {
    const t0 = now();
    drawPhase();
    /* Level 02's cut (request 399): the fight's last frame while the bars close
     * over it, then the bars themselves, above every screen. */
    if (barFrame && barCut.phase === 'closing') {
      ctx.save();
      ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(barFrame, 0, 0, W, H);
      ctx.restore();
    }
    if (barCut.depth > 0) {
      ctx.save();
      ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      ctx.globalAlpha = 1;
      barCut.draw(ctx, W, H);
      ctx.restore();
    }
    /* The press beat draws nothing — it is answered by the control's own
     * compression and by the haptic. See the note above `hapticTick`. */
    drawDarkiTool();        // …and the placement gizmo over everything, when it is open
    prof.frame += now() - t0;
    prof.ui = prof.frame - prof.scene - prof.blur;
    prof.n++;
  }

  function drawPhase() {
    if (pendingGameplay || previewHandoff) { drawHandoff(); return; }
    if (phase === 'splash') drawSplash();
    else if (phase === 'title') drawTitle();
    else if (phase === 'menu') drawMenu();
    else if (phase === 'difficulty') drawDifficulty();
    else if (phase === 'character' || phase === 'characters') drawCharacter();
    else if (phase === 'shop') drawShop();
    else if (phase === 'controls') drawControls();
    else if (phase === 'options') drawOptions();
    else if (phase === 'levelSelect') drawLevelSelect();
    else if (phase === 'briefing') drawBriefing();
    else if (phase === 'loading') drawLoading();
    else if (phase === 'intro') drawIntro();
    else if (phase === 'levelTitle') drawLevelTitle();
    else if (phase === 'extras') drawExtras();
    else if (phase === 'credits') drawCredits();
  }

  function openMainMenu() {
    clearHeld();
    go('menu', { force: true });
  }

  function openFromPause(name) {
    returnPhase = 'pause';
    pausedOrigin = true;
    /* The fight is frozen behind us, not gone: the ambience and the menu video
     * stay down, and only the canvas is borrowed. */
    if (name === 'CONTROLS') go('controls');
    else if (name === 'OPTIONS') go('options');
    else { pausedOrigin = false; returnPhase = 'menu'; }
  }

  /* Back out of a screen that was opened from pause. Deliberately NOT
   * go('gameplay'): that fires onGameplayStart, which restarts the music and
   * re-arms the FIGHT banner. The fight here was never left — it is still
   * frozen on the frame the player stopped on. */
  function returnToPause() {
    navBack();
    optionPage = null;
    adjustRow = -1;
    returnPhase = 'menu';
    pausedOrigin = false;
    prevPhase = phase;
    phase = 'gameplay';
    phaseT = 0;
    clearHeld();
    inputLock = 0;
    releaseCanvas();
    onPauseReturn?.({ difficulty, settings: { ...settings } });
  }

  /* Inspection surface, matching the window.__ror convention the gameplay
   * harnesses already use. Read-only apart from resetCues(). */
  window.__rorMenu = {
    get phase() { return phase; },
    get selection() { return selection; },
    /* The plate along the bottom — "SETTINGS RESET", and the QUIT arming's
     * "PRESS QUIT AGAIN TO EXIT". A two-press confirmation is only honest if
     * the prompt is really on screen, so a test has to be able to read it. */
    get message() { return messageT > 0 ? message : ''; },
    /* The VIRTUAL frame the menus are laid out in. 1280x720 normally, wider on
     * Android where the viewport grows to the device aspect — so anything
     * converting a drawn hitbox back into a screen point has to ask rather than
     * assume 1280. */
    get viewport() { return { w: W, h: H }; },
    /* The main list as drawn, so a test can find a row BY NAME instead of
     * hardcoding an index into a list that gets edited. */
    get mainItems() { return MAIN_ITEMS.map((i) => i.label); },
    get continuePoint() { return continuePoint(); },          // request 482
    get continueEnabled() { return !MAIN_ITEMS.find((i) => i.label === 'CONTINUE').disabled; },
    /* Test-only (request 489): show a loading screen as drawn, without its
     * transition in front — 'loading' (LOADING STORY) or 'handoff' (PREPARING THE
     * STREETS, the hold card a slow load shows after START MISSION). */
    previewScreen(name, level = null) {
      if (level) selectLevel(level);
      barCut.reset();
      previewHandoff = name === 'handoff';
      if (name === 'loading') go('loading', { force: true });
      return phase;
    },
    get difficulty() { return difficulty; },
    get menuReturn() { return menuReturnSelection; },
    /* Which level the intro pipeline is currently running for — the proof that
     * `startLevel` chose a cut rather than just re-entering the default one. */
    get level() { return currentLevel; },
    get introSrc() { return introVideo ? introVideo.dataset.rorSrc : introSrcOverride; },
    /* Level 02's sequence (request 399), for the harness: the cut's state, the
     * held-back media, the clips in use and the live clocks. */
    get l2() {
      return {
        cut: { phase: barCut.phase, depth: barCut.depth, cuts: barCut.cuts, frame: !!barFrame },
        introDeferred, briefDeferred, introClosing, briefDoneT, introStarted, introDone,
        briefT, briefStarted,
        briefSrc: briefVo ? String(briefVo.src || briefVo.url || '') : null,
        entrySrc: gameplayStartVo ? String(gameplayStartVo.src || gameplayStartVo.url || '') : null,
        video: introVideo ? { t: introVideo.currentTime, muted: introVideo.muted, volume: introVideo.volume,
          paused: introVideo.paused, ended: introVideo.ended, ready: introVideo.readyState, src: introVideo.dataset.rorSrc } : null,
        music: introMusic ? { t: +introMusic.currentTime.toFixed(2), volume: +introMusic.volume.toFixed(4), paused: introMusic.paused,
          level: +introMusicLevel().toFixed(4), gain: L2_INTRO_MUSIC.gain, src: String(introMusic.src) } : null,
        introTime: introTime(),
        briefY: { ...briefY },
        reveal: { body: dossier().body.map((_, i) => +briefReveal('body', i).toFixed(4)), call: dossier().call.map((_, i) => +briefReveal('call', i).toFixed(4)) },
        voT: briefVo ? briefVo.currentTime : null,
        subs: introSubs().length,
      };
    },
    /* Draw the intro screen as it looks `t` seconds into the narration (the
     * subtitles read the same clock), for screenshot tests. */
    drawIntroAt(t) { introTimeOverride = t; try { drawIntro(); } finally { introTimeOverride = null; } },
    get introSubs() { return INTRO_SUBS.map((l) => l.words.map(([w]) => w).join(' ')); },
    /* The same door the post-mission level choice goes through, so a harness
     * can reach Level 02's case file without playing Level 01 first. */
    startLevel(level) { return startLevel(level); },
    levelUnlocked(n) { return levelUnlocked(n); },        // request 403: Level Select's gate
    get levelSelectItems() { return phase === 'levelSelect' ? levelSelectItems().map((it) => it.level) : null; },
    /* The touch gesture guide (request 366): its state as last drawn, and a
     * reset so a harness can play it again in the same session. */
    get gestureGuide() { return { st: guide.st, t: +guide.t.toFixed(2), alpha: +guide.alpha.toFixed(3), frame: guide.frame,
      caption: guide.caption, box: guide.box, seen: (() => { try { return sessionStorage.getItem(GESTURE_GUIDE.seen); } catch { return null; } })() }; },
    resetGestureGuide() { endGestureGuide(); try { sessionStorage.removeItem(GESTURE_GUIDE.seen); } catch {} guide.st = 'off'; guide.t = 0; guide.alpha = 0; },
    get dossierTarget() { return dossier().target; },
    get optionPage() { return optionPage; },
    get adjustRow() { return adjustRow; },        // request 451: the slider whose ▼/▲ are out (-1 = none)
    get inputLock() { return inputLock; },
    /* `title` is the splash entrance sfx. It rides here because the ONE thing a
     * screenshot can never show about it is that it did not fire on arrival —
     * it belongs to the X press off the title now, and nothing else. */
    get cues() { return { forward: cueCount.forward, back: cueCount.back, title: cueCount.title, order: cueCount.order.join('') }; },
    resetCues() { cueCount.forward = 0; cueCount.back = 0; cueCount.title = 0; cueCount.order.length = 0; hapticsFired = 0; hapticsPad = 0; hapticsWanted = 0; },
    /* ---- placing Darki on the menu, live ------------------------------------
     * THE TOOL: press F9 on the menu. Drag him with the mouse, wheel to scale,
     * arrows to nudge a pixel at a time (shift = 10), F flips, R resets, C
     * copies the code line. F9 again closes it. That is the way to do this —
     * everything below is the same edits from the console, for a harness or for
     * when you already know the number you want.
     *
     * Open it from here:   __rorMenu.darkiTool(true)
     * Read it:             __rorMenu.darki
     * Move him:            __rorMenu.darki = { cx: 950, feet: 640 }   (partial ok)
     * Nudge in pixels:     __rorMenu.darkiNudge(10, -4)
     * Resize:              __rorMenu.darkiScale(1.15)
     * Mirror him:          __rorMenu.darkiFlip()
     * Undo everything:     __rorMenu.darkiReset()
     * Keep it for good:    __rorMenu.darkiCode()  -> paste into L.darki
     *
     * Every setter persists to localStorage so a nudge survives a relaunch, and
     * boot logs when a saved placement is in force. `darkiCode()` is the way OUT
     * of debug and into the source — a placement that only exists in one
     * browser's localStorage is not a decision, it is a local hack. */
    get darki() { return darkiPlacement(); },
    set darki(v) { patchDarki(v || {}); },
    darkiTool(on = true) { return setDarkiTool(on); },
    get darkiToolOpen() { return darkiTool.on; },
    /* The gizmo's own geometry, so a test can check the outline sits on the
     * figure rather than near it. */
    get darkiDrawn() { return darkiDrawn ? { ...darkiDrawn } : null; },
    darkiNudge(dx = 0, dy = 0) { return patchDarki({ cx: L.darki.cx + dx, feet: L.darki.feet + dy }); },
    darkiScale(m) { return patchDarki({ scale: m }); },
    darkiFlip() { return patchDarki({ flip: -L.darki.flip }); },
    darkiReset() {
      try { localStorage.removeItem(DARKI_SAVE); } catch {}
      Object.assign(L.darki, DARKI_DEFAULT);
      return darkiPlacement();
    },
    darkiCode() {
      /* One builder, shared with the on-screen readout — two copies of this
       * string is how the panel ends up showing a line that is not the line. */
      return darkiCodeLine()
        + (L.darki.scale === 1 ? '' : `   // scale != 1 breaks the ground-plane rule (see GROUND)`);
    },
    /* How many frames of the idle cycle are played. Writable ONLY so a harness
     * can wind it back over the sheet's empty tail cells and prove the character
     * vanishes — a check that the fix works has to be able to show the broken
     * state too, or it passes against anything. */
    get idleFrames() { return IDLE.frames; },
    set idleFrames(v) { IDLE.frames = Math.max(1, Math.min(IDLE.cols * 5, v | 0)); },
    /* Deterministic tick, matching __ror.step. The game's loop() hands the frame
     * to the front end while it is active, so an rAF-stubbed harness has no way
     * to advance a MENU without this — __ror.step drives the sim, which is the
     * half that is not on screen yet. */
    step(dt) { update(dt); draw(); },
    /* Jump straight to a screen. For SHOT harnesses only: walking there with
     * real key presses is the right way to test navigation and the wrong way to
     * frame a picture, because every hop costs an inputLock and a phase ease. */
    /* A jump is not a transition: any Level 02 bar cut in flight is abandoned
     * (and the media it was holding back is released by the screen itself), so
     * the target screen is what is on screen. */
    go(name, opts) {
      barCut.reset(); barFrame = null; introDeferred = false; briefDeferred = false;
      go(name, { force: true, ...opts });
    },
    /* The phase clock, so a shot can be taken at a chosen moment in a screen's
     * own timeline (the title's prompt, for one, arrives on it). */
    get phaseT() { return +phaseT.toFixed(3); },
    set phaseT(v) { phaseT = v; },
    get bg() {
      return {
        ready: bgReady, paused: bgVideo.paused, t: bgVideo.currentTime,
        loop: bgVideo.loop, w: bgVideo.videoWidth, h: bgVideo.videoHeight,
      };
    },
    /* The studio card. `muted` is the interesting one: null means no play
     * attempt has resolved, false means it got its sound, true means the
     * browser refused the unmuted autoplay and it fell back. A screenshot shows
     * none of that, and "the studio sting did not play" is otherwise
     * indistinguishable from "the clip has no audio". `usingFallback` says the
     * drawn KENCRAFTS card is on screen instead of the video. */
    get splash() {
      return {
        ready: splashReady, failed: splashFailed, started: splashStarted,
        muted: splashMuted, ended: splashEnded,
        paused: splashVideo.paused,
        t: +splashVideo.currentTime.toFixed(2),
        /* -1 until the clip is parked on the wordmark, then seconds held. A
         * paused splash element is otherwise ambiguous — the hold and a stalled
         * decode look identical from outside. */
        holdT: +splashHoldT.toFixed(2),
        holdAt: SPLASH_HOLD_AT, hold: SPLASH_HOLD,
        duration: Number.isFinite(splashVideo.duration) ? +splashVideo.duration.toFixed(3) : null,
        w: splashVideo.videoWidth, h: splashVideo.videoHeight,
        usingFallback: splashFailed || splashVideo.readyState < 2 || !splashVideo.videoWidth,
      };
    },
    get ambience() {
      return ambience ? {
        paused: ambience.paused,
        t: +ambience.currentTime.toFixed(2),
        volume: +ambience.volume.toFixed(3),
        unlocked: audioUnlocked,
      } : null;
    },
    /* Every cue's DECODED duration, or null where the fetch or the decode
     * failed. Null is the whole point of this readout: a cue that never arrived
     * is silent, and silence is indistinguishable from "that beat has no sound"
     * unless something can be asked. */
    get sfx() {
      const out = { ready: sfx.ready };
      for (const name of Object.keys(CUES)) {
        out[name] = sfx.buffers[name] ? +sfx.buffers[name].duration.toFixed(3) : null;
      }
      out.missing = Object.keys(CUES).filter((n) => !sfx.buffers[n]);
      return out;
    },
    get canvas() { return { w: canvas.width, h: canvas.height, scale: +renderScale.toFixed(3) }; },
    /* Which fetched-but-never-awaited images are actually in, so a harness can
     * tell a real layout from one photographed against a placeholder. */
    get assets() {
      return {
        olodo: !!assets.olodo,
        jimoh: !!assets.jimoh,
        darkiIdle: !!assets.darkiIdle,
        mobileControls: Object.fromEntries(
          Object.keys(MOBILE_CONTROL_ART).map((name) => [name, !!assets.mobileControls[name]]),
        ),
      };
    },
    get controlsGuide() {
      return {
        labels: [...MOBILE_CONTROL_LABELS],
        assetNames: Object.keys(MOBILE_CONTROL_ART),
        drawn: controlsGuideFrame.map((b) => ({
          asset: b.asset,
          x: +b.x.toFixed(1), y: +b.y.toFixed(1),
          w: +b.w.toFixed(1), h: +b.h.toFixed(1),
        })),
        genericFooter: false,
      };
    },
    /* 'svg' once the supplied mark is baked, 'text' if it never arrived and the
     * drawn wordmark is standing in. A screenshot cannot tell those apart, and
     * "the logo looks fine" is exactly how a failed fetch ships. */
    /* The gameplay intro line. It is no longer started by the front end — the
     * cinematic entry calls back into `beginGameplayStartVoice` once the gate
     * is open — so a test needs to see whether that callback actually arrived
     * and whether the element really began, not merely whether a flag flipped.
     * `titleArt` rides along because a silently-substituted logo is the exact
     * failure this project has been bitten by before. */
    get introVoice() {
      return {
        started: gameplayStartVoStarted,
        playing: !!(gameplayStartVo && !gameplayStartVo.paused),
        t: gameplayStartVo ? +gameplayStartVo.currentTime.toFixed(2) : null,
        duration: Number.isFinite(gameplayStartVo?.duration) ? +gameplayStartVo.duration.toFixed(3) : null,
      };
    },
    get titleArtLoaded() { return !!titleArt; },
    get logo() {
      return {
        source: logoSource,
        w: logoCanvas?.canvas.width ?? 0,
        h: logoCanvas?.canvas.height ?? 0,
        aspect: LOGO_ART.aspect,
      };
    },
    /* The press beat, so a harness can prove the screen did NOT change on the
     * frame the button went down, and that something was drawn while it waited. */
    /* Haptics, as a count. There is no pad in a headless browser and
     * `playEffect` returns nothing observable even when there is one, so the
     * only fully checkable claim is "the press asked for a rumble" — which is
     * the part this code owns. `wanted` counts presses that asked, so a run with
     * no controller can still prove the call site fires and that the OPTIONS
     * toggle is respected. `fired` counts presses an actuator API accepted
     * (including `navigator.vibrate`, which says yes on hardware that cannot
     * buzz); `pad` counts only the unambiguous case, a connected gamepad with a
     * real actuator. `strength` is the tuning row, so a harness can assert the
     * press haptic was not quietly softened again. */
    get haptics() {
      return {
        fired: hapticsFired,
        pad: hapticsPad,
        wanted: hapticsWanted,
        enabled: settings.vibration !== false,
        strength: { ...PRESS_HAPTIC },
        canVibrate: typeof navigator.vibrate === 'function',
        padPresent: (() => {
          try { return !!Array.from(navigator.getGamepads?.() ?? []).find((p) => p?.connected); }
          catch { return false; }
        })(),
      };
    },
    /* THE TITLE'S LOAD GATE, as numbers. `accepts` is the claim under test —
     * whether a press right now would enter the menu — and it is the SAME
     * predicate the input path uses, not a re-derivation, so a harness cannot
     * pass against a second copy of the rule. `promptAt` is Infinity until the
     * load completes, which is exactly the state in which nothing may skip. */
    get titleGate() {
      return {
        phase,
        progress: +clamp(worldProgress(), 0, 1).toFixed(3),
        readyAt: titleReadyAt === null ? null : +titleReadyAt.toFixed(3),
        promptAt: titlePromptAt(),
        t: +phaseT.toFixed(3),
        accepts: titleReady(),
      };
    },
    /* Writable for the same reason `idleFrames` is: a check that the OPTIONS
     * toggle silences the haptic has to be able to turn it off, and walking into
     * OPTIONS and moving a slider to get there tests the slider, not the gate. */
    get vibration() { return settings.vibration !== false; },
    set vibration(v) { settings.vibration = !!v; },
    /* How hard each control is currently compressed, 1 on the frame it was
     * pressed and decaying over ~115 ms. This is the visual answer that STAYED
     * when the press bloom was removed, so it has to be readable — otherwise
     * "the glow is gone" and "nothing answers a press at all" are the same
     * measurement. */
    get pressFx() {
      const out = {};
      for (const [id, s] of fx) if (s.press > 0.001) out[id] = +s.press.toFixed(3);
      return out;
    },
    get press() {
      return {
        live: !!pressGate.action,
        t: +pressGate.t.toFixed(3),
        beat: PRESS_BEAT,
        rect: pressGate.rect
          ? { x: Math.round(pressGate.rect.x), y: Math.round(pressGate.rect.y),
              w: Math.round(pressGate.rect.w), h: Math.round(pressGate.rect.h),
              id: pressGate.rect.id ?? null }
          : null,
      };
    },
    /* The controls the LAST DRAWN FRAME registered, in index order. Index order
     * is what the left/right axis walks, so a test can prove the drawn positions
     * and the navigation order actually agree instead of assuming it. */
    get hitboxes() {
      return hitboxes.slice().sort((a, b) => a.index - b.index).map((h) => ({
        id: h.id ?? null, index: h.index,
        x: Math.round(h.x), y: Math.round(h.y), w: Math.round(h.w), h: Math.round(h.h),
      }));
    },
    /* The case file's action row, left to right as drawn. */
    get actions() {
      return { order: BRIEF_ACTIONS.map((a) => a.label), selection, start: BRIEF_START, back: BRIEF_BACK };
    },
    /* Where the case file's written blocks actually ended. The copy is wrapped
     * at draw time, so a longer sentence silently grows a column — these are the
     * numbers that catch it, rather than a screenshot somebody has to squint at.
     * Null until the screen has drawn once. */
    get brief() {
      const r = (v) => (typeof v === 'number' ? +v.toFixed(1) : null);
      const r3 = (v) => +v.toFixed(3);
      return {
        callBottom: r(briefY.call),
        stampTop: BRIEF.stampY,
        profileBottom: r(briefY.profile),
        profilePanelBottom: BRIEF.profile.y + BRIEF.profile.h,
        objectivesBottom: r(briefY.objectives),
        objectivesPanelBottom: BRIEF.objective.y + BRIEF.objective.h,
        chainCopyBottom: r(briefY.chainCopy),
        chainBoxTop: r(briefY.chainBoxTop),
        /* The reveal, as numbers. How much of each written block has been typed
         * and how far each right-column panel is into its entrance — so a test
         * can assert the animation is where the voiceover is instead of somebody
         * squinting at a frame and deciding it looks about right. */
        t: r3(briefT),
        typed: {
          body: dossier().body.map((_, i) => r3(briefReveal('body', i))),
          call: dossier().call.map((_, i) => r3(briefReveal('call', i))),
          stamp: dossier().stamp.map(() => 1),       // static UI copy; never on the VO clock
        },
        threat: r3(briefThreatLevel()),
        cards: [0, 1, 2, 3].map((i) => r3(briefCardIn(i))),
      };
    },
    /* The case file's clock. WRITING it pins the screen at that beat and pauses
     * the read, so a harness gets a repeatable frame instead of "wherever the
     * clip had got to"; entering the screen again clears the pin. */
    get briefT() { return +briefT.toFixed(3); },
    set briefT(v) {
      briefT = v;
      briefPinned = true;
      if (briefVo && !briefVo.paused) briefVo.pause();
    },
    /* The narration objects themselves, so a harness can DRIVE the clock —
     * seek it, pause it — and prove the Android voice path behaves like the
     * element it replaced. The numeric getters below can only report. */
    get voiceClips() { return { intro: voice, brief: briefVo, gameplay: gameplayStartVo }; },
    get briefVo() {
      if (!briefVo) return null;
      return {
        started: briefStarted, pinned: briefPinned, paused: briefVo.paused,
        src: String(briefVo.src || briefVo.url || ''),   // whose read (request 399: each level has its own)
        t: +briefVo.currentTime.toFixed(2),
        duration: Number.isFinite(briefVo.duration) ? +briefVo.duration.toFixed(3) : null,
        volume: +briefVo.volume.toFixed(3),
      };
    },
    /* The background-load handshake, so a harness can assert that the menu came
     * up before the world did and that the handover still waited for it. */
    get world() {
      return {
        ready: isWorldReady(), progress: +clamp(worldProgress(), 0, 1).toFixed(3),
        error: worldError(), pending: pendingGameplay, holdT: +handoffT.toFixed(2),
      };
    },
    get prof() {
      const n = Math.max(1, prof.n);
      return {
        frames: prof.n,
        msFrame: +(prof.frame / n).toFixed(2),
        msScene: +(prof.scene / n).toFixed(2),
        msBlur: +(prof.blur / n).toFixed(2),
        msUi: +(prof.ui / n).toFixed(2),
      };
    },
    resetProf() { prof.frame = prof.scene = prof.blur = prof.ui = prof.n = 0; },
    /* Every widget the current frame drew, so a test can assert that exactly
     * one is focused and that nothing overlaps. */
    get widgets() { return hitboxes.map((h) => ({ id: h.id, index: h.index, x: h.x, y: h.y, w: h.w, h: h.h })); },
    get focus() {
      const out = [];
      for (const [id, s] of fx) if (s.focus > 0.5) out.push(id);
      return out;
    },
  };

  /* ------------------------------------------------------------ shared UI
   * The pause menu is drawn by game.js (it has to sit on the frozen fight) but
   * it must not be a SECOND look. Rather than reimplement the widgets over
   * there, the real ones are handed over: same ctx, same palette, same focus
   * animation state, same navigation cues. One implementation, one look.
   *
   * `tick` exists because the front end's own update() does not run while
   * gameplay owns the frame, and the focus eases would otherwise freeze. */
  const ui = {
    C, W, H, MENU_HINTS, HOLD_DELAY, HOLD_RATE,
    setFont, setDisplay, glass, button, icon, roundRectPath, networkGraph,
    /* Measured against the CURRENT ctx font, so a caller must `setFont` before
     * asking. Shared rather than re-written over in aftermath.js: both files
     * draw on the same canvas with the same fonts, and two wrap routines drift. */
    wrapLines,
    drawControlBar, drawGrain, drawVignette, captureBackdrop,
    pressPulse, navForward, navBack, hitTest, pointerPos,
    uiSfx,                                  // request 453: the synthesised cues above
    get uiSfxCount() { return { ...uiSfxCount }; },
    /* The menu's context has to be kept alive WHILE THE FIGHT RUNS too: its own
     * update() is not running then, and every pause-menu and editor cue plays
     * through it. game.js calls this every frame (request 453). */
    keepSfxAlive(dt) { keepContextAlive(sfx.ac, sfxCtxLife, dt); },
    /* DARKI'S FACE, cropped out of the idle sheet at boot (buildAvatar) and
     * already used by the menu and the pause panel. Shared so the fight's
     * status plate can put him in its portrait ring rather than the grey
     * silhouette the art ships with — one crop, three screens, and no second
     * copy of the head to keep in step with the first. Null until the sheet
     * lands; every caller draws the ring without him in that case. */
    get avatar() { return avatarCanvas; },
    /* The pause menu's QUIT TO DESKTOP goes through the SAME two-press arming
     * and the same host guard the main menu's QUIT GAME uses — one quit path,
     * so the two can never disagree about whether leaving is even possible. */
    requestQuit, get canQuit() { return HOST.canQuit; },
    /* …and the plate that shows what requestQuit just said. The front end's own
     * draw() does not run while the fight is paused, so without this the arming
     * prompt would be invisible exactly where it matters most — a two-press
     * confirmation nobody can see is a button that ignores the first press. */
    messagePlate,
    /* The pause menu drives its own clock while frozen, so it has to age the
     * message itself; update() is not running. */
    tickMessage(dt) {
      if (messageT > 0) messageT = Math.max(0, messageT - dt);
      if (quitArmedT > 0) quitArmedT = Math.max(0, quitArmedT - dt);
    },
    /* The one audio door for callers that own the frame. aftermath.js draws with
     * these widgets, so it sounds through this bus too — same master/SFX
     * sliders, same decoded buffers, same click-free ramps. A second Audio()
     * pool over there would be a second volume control nobody remembers to
     * wire to the options screen. */
    playCue,
    tick(dt) { clock += dt; tickFx(dt); },
    /* Callers own the frame, so they own the hitbox list for it. */
    beginFrame() { hitboxes.length = 0; blurValid = false; },
    get clock() { return clock; },
    get hitboxes() { return hitboxes; },
  };

  return {
    load, update, draw, pollGamepad, openMainMenu, openFromPause, startLevel, ui,
    get active() { return active(); },
    get phase() { return phase; },
    get settings() { return settings; },
    get level() { return currentLevel; },
  };
}
