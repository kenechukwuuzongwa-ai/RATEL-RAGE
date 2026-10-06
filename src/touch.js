/* Ratel Rage - mobile controls: fully customizable HUD, PUBG-style editor,
 * left-half movement, and a carry-capable GRAB button.
 *
 * ADDITIVE BY DESIGN. Every control drives the game's existing input by
 * dispatching the same synthetic events a physical keyboard/mouse would
 * produce (real KeyboardEvents on window, real MouseEvents on the canvas), so
 * the combat, combo, grab, execution, pause and movement systems run
 * unmodified. Keyboard and Gamepad paths are untouched.
 *
 * ARCHITECTURE
 *   HUD_LAYOUT   one centralized config: per control { x, y, scale, opacity,
 *                visible }, normalized (x/y are fractions of the viewport;
 *                sizes scale with the viewport's short edge), persisted in
 *                localStorage under a versioned key.
 *   CONTROLS     every control is declared ONCE with its label and the events
 *                it dispatches. Nothing hard-codes a position outside the
 *                layout defaults.
 *   EDITOR       "Customize Controls" (from the pause menu): drag to move,
 *                sliders for size and opacity, visibility toggle, reset,
 *                save, done. Gameplay dispatch is disabled while editing.
 */
(function () {
  'use strict';

  if (!(navigator.maxTouchPoints > 0)) return;

  /* ------------------------------------------------------------------ diag
   *
   * OFF BY DEFAULT. This green banner was the instrument for the load-stall
   * hunt — boot counter, sheets landed, JS heap, the asset the prep lane was
   * chewing on, and a STALLED warning. It is pinned top-left and it hides
   * itself only once the world is ready, and because the world now loads in the
   * BACKGROUND behind the splash, the title and the menu, that meant roughly
   * thirty seconds of debug readout sitting over the opening of the game.
   *
   * Not deleted: DEBUG-STATE.md still names it as the single most valuable
   * datum from a device that is misbehaving, and it costs nothing switched off.
   * Turn it on for a session with either of:
   *
   *     ?diag=1   on the URL            (a desktop or chrome://inspect run)
   *     localStorage['ror.diag'] = '1'  (sticks across launches, on device)
   */
  const DIAG_ON = (() => {
    try {
      if (/[?&]diag=1\b/.test(location.search)) return true;
      return localStorage.getItem('ror.diag') === '1';
    } catch { return false; }
  })();

  let diagEl = null;
  let boots = 0;
  if (DIAG_ON) {
    try {
      boots = 1 + (parseInt(localStorage.getItem('ror.boots') || '0', 10) || 0);
      localStorage.setItem('ror.boots', String(boots));
    } catch {}
    buildDiag();
  }

  function buildDiag() {
    diagEl = document.createElement('div');
    diagEl.style.cssText = 'position:fixed;left:8px;top:8px;z-index:70;'
      + 'font:600 10px/1.5 monospace,monospace;color:#9fe6a0;'
      + 'background:rgba(4,8,14,.75);border:1px solid rgba(120,255,160,.35);'
      + 'border-radius:8px;padding:6px 9px;pointer-events:none;'
      + 'max-width:70vw;white-space:pre-wrap;';
    document.body.appendChild(diagEl);
    setInterval(() => {
      const R = window.__ror;
      if (!R || !R.worldReady) { updateDiag(); return; }
      diagEl.style.display = 'none';
    }, 300);
    updateDiag();
  }
  let diagLastP = -1, diagLastT = Date.now();
  function updateDiag() {
    if (!diagEl || diagEl.style.display === 'none') return;
    const R = window.__ror;
    try {
      if (R && R.worldReady) { diagEl.style.display = 'none'; return; }
    } catch {}
    let mem = 'n/a';
    try {
      if (performance.memory) {
        mem = Math.round(performance.memory.usedJSHeapSize / 1048576) + '/'
          + Math.round(performance.memory.jsHeapSizeLimit / 1048576) + 'MB';
      }
    } catch {}
    let line;
    if (!R) line = 'boot #' + boots + ' · waiting for game module...';
    else {
      const p = R.worldProgress || 0;
      if (p !== diagLastP) { diagLastP = p; diagLastT = Date.now(); }
      const still = Math.round((Date.now() - diagLastT) / 1000);
      const err = R.worldError ? '\nERROR: ' + R.worldError : '';
      line = 'boot #' + boots + ' · loading ' + Math.round(p * 39) + '/39'
        + ' · heap ' + mem + ' · ram~' + (navigator.deviceMemory || '?') + 'GB'
        + (still > 20 && p < 1 ? '\nSTALLED ' + still + 's' : '') + err;
    }
    diagEl.style.display = 'block';
    diagEl.textContent = line;
  }

  /* Full-screen shell on wide phones (both renderers widen on Android). */
  if (/Android/.test(navigator.userAgent)) {
    const sw = Math.max(window.screen.width || 0, window.screen.height || 0);
    const sh = Math.min(window.screen.width || 0, window.screen.height || 0);
    if (sh > 0 && sw / sh > 16 / 9 + 0.01) {
      const bleed = document.createElement('style');
      bleed.textContent = '.game-shell{width:100vw !important;height:100vh !important;aspect-ratio:auto !important;}';
      document.head.appendChild(bleed);
    }
  }

  /* ------------------------------------------------------------- HUD layout
   * Coordinates are normalized: x, y are fractions of the viewport, so a
   * customized layout keeps its relative placement on any resolution or
   * aspect. `base` is the control's design diameter in reference pixels; the
   * rendered size follows the viewport's short edge, then the player's scale.
   * Everything persists under one versioned key. */
  const HUD_KEY = 'ror.hud.v1';
  const REF_SHORT = 412;                    // reference short edge (design px)
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  /* THE SHIPPED LAYOUT, read off "ASSETS/UI ELEMENTS/Placement ref.png" (2026-09-19).
   *
   * These are the positions the game starts with and resets to, and they are
   * the reference for any later change: a control moves from here, not from
   * wherever a previous build happened to leave it.
   *
   * Measured as fractions of the 1874x839 reference, which is why they are given
   * to three decimals — the numbers are a reading of a picture, not a guess. If
   * any of them is a pixel or two off on the real device, DO NOT re-measure by
   * eye: arrange them in the editor and press COPY LAYOUT, which prints this
   * exact block from the live layout (see layoutCode). That is the same route
   * the menu's Darki placement takes, and it is how a position stops being
   * somebody's estimate and becomes the source. */
  const HUD_DEFAULTS = () => ({
    stick: { x: 0.116, y: 0.791, scale: 1.00, opacity: 1.00, visible: true, base: 132 },
    jump:  { x: 0.913, y: 0.852, scale: 1.00, opacity: 1.00, visible: true, base: 67 },
    /* NOT IN THE PLACEMENT REFERENCE. Block is the only control the reference
     * does not show, and it is kept rather than dropped: removing it would take
     * the guard away from touch players entirely, which is a mechanic, not a
     * button. Parked in the gap the reference leaves between the gear and the
     * kick — say the word and it hides (visible: false) instead. */
    block: { x: 0.959, y: 0.345, scale: 1.00, opacity: 1.00, visible: true, base: 56 },
    kick:  { x: 0.959, y: 0.469, scale: 1.00, opacity: 1.00, visible: true, base: 56 },
    jab:   { x: 0.861, y: 0.621, scale: 1.00, opacity: 1.00, visible: true, base: 82 },
    grab:  { x: 0.958, y: 0.687, scale: 1.00, opacity: 1.00, visible: true, base: 63 },
    pause: { x: 0.959, y: 0.231, scale: 1.00, opacity: 1.00, visible: true, base: 47 },
  });

  /* The live layout, printed as the HUD_DEFAULTS block above.
   *
   * A placement that only exists in one phone's localStorage is not a decision,
   * it is a local hack — the same argument the menu's `darkiCode()` makes. This
   * is the way OUT of the editor and into the source: drag the controls until
   * they are right, press COPY LAYOUT, paste over HUD_DEFAULTS. Reachable from
   * the editor panel and from `__rorTouch.layoutCode()`. */
  function layoutCode() {
    const order = ['stick', 'jump', 'block', 'kick', 'jab', 'grab', 'pause'];
    const pad = (id) => (id + ':').padEnd(7);
    const n3 = (v) => v.toFixed(3);
    const n2 = (v) => v.toFixed(2);
    return 'const HUD_DEFAULTS = () => ({\n'
      + order.filter((id) => HUDS[id]).map((id) => {
        const s = HUDS[id];
        return `    ${pad(id)} { x: ${n3(s.x)}, y: ${n3(s.y)}, scale: ${n2(s.scale)},`
          + ` opacity: ${n2(s.opacity)}, visible: ${s.visible}, base: ${s.base} },`;
      }).join('\n')
      + '\n  });';
  }

  let HUDS = HUD_DEFAULTS();
  try {
    const saved = JSON.parse(localStorage.getItem(HUD_KEY) || 'null');
    if (saved && saved.v === 1 && saved.controls) {
      for (const id of Object.keys(HUDS)) {
        const s = saved.controls[id];
        if (!s) continue;
        if (Number.isFinite(s.x)) HUDS[id].x = clamp01(s.x);
        if (Number.isFinite(s.y)) HUDS[id].y = clamp01(s.y);
        if (Number.isFinite(s.scale)) HUDS[id].scale = Math.max(0.6, Math.min(1.8, s.scale));
        if (Number.isFinite(s.opacity)) HUDS[id].opacity = Math.max(0.25, Math.min(1, s.opacity));
        if (typeof s.visible === 'boolean') HUDS[id].visible = s.visible;
      }
    }
  } catch {}
  function hudSave() {
    try {
      localStorage.setItem(HUD_KEY, JSON.stringify({ v: 1, controls: HUDS }));
    } catch {}
  }

  /* -------------------------------------------------------------- dispatch */
  let editing = false;
  const held = new Set();
  const send = (code, down) => {
    if (editing) return;
    if (down === held.has(code)) return;
    if (down) held.add(code); else held.delete(code);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup',
      { code, bubbles: true, cancelable: true }));
  };
  const sendMouse = (button, down) => {
    if (editing) return;
    const canvas = document.getElementById('game');
    if (!canvas) return;
    canvas.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup',
      { button, bubbles: true, cancelable: true, view: window }));
  };
  function releaseAll() {
    for (const code of [...held]) send(code, false);
  }

  /* -------------------------------------------------------------- controls */
  /* Declared ONCE. `w` multiplies the width (pills); everything else is a
   * round key. down/up dispatch the game's existing events. */
  /* ART, WHERE THERE IS ART. `img` names a file in frontend/ui/controls and
   * REPLACES the button rather than decorating it: the supplied buttons are
   * finished glass spheres with their own rim light, glow and dark interior, so
   * the drawn disc and border underneath them would only show as a grey halo
   * and a second edge. A control with `img` therefore draws no background, no
   * border and no label — see mk(). Controls without one keep the drawn look.
   *
   * Shipped at 384px square (the source art is 1254px, which is 6.3 MB decoded
   * for a button that renders around 100): `mobile/gen-ui-buttons.js` rebuilds
   * them from ASSETS/UI ELEMENTS, and the originals are never touched. */
  const CONTROLS = {
    jump: { label: 'JUMP', img: 'jump', bg: 'rgba(20,28,44,.55)', type: 'key', code: 'Space' },
    /* Round, like every other action key. It was a 1.8x pill — the odd one out
     * in the cluster, and a shape that reads as a slider or a bar rather than
     * as something you hold. */
    block: { label: 'BLOCK', img: 'block', bg: 'rgba(20,28,44,.55)', type: 'key', code: 'KeyL' },
    kick: { label: 'KICK', img: 'kick', bg: 'rgba(255,120,80,.55)', type: 'mouse', button: 2 },
    /* `Hit.png` — the fist. The JAB is the punch, so the supplied Hit art is
     * this control's face. */
    jab: { label: 'JAB', img: 'jab', bg: 'rgba(255,228,94,.55)', type: 'mouse', button: 0 },
    /* GRAB/CARRY: pressing and HOLDING carries the enemy; RELEASING throws.
     * That is exactly the game's execute/pickup HOLD on KeyE (the press
     * offers an execution when there is one and becomes the pickup when there
     * is not; the carry lasts as long as the button is down). */
    grab: { label: 'GRAB', img: 'grab', bg: 'rgba(140,220,255,.5)', type: 'key', code: 'KeyE' },
    /* PAUSE: there is no keyboard on a phone, so the pause (and with it the
     * Customize Controls screen) needs its own key. Tapping this is the same
     * press the P key makes. */
    /* PAUSE - `Settings.png`, the dark disc with the gold rim and the gear.
     * This was a drawn SVG gear, which existed only because there was no art
     * for it; supplied art wins. Round like the rest, same 384px pipeline. */
    pause: { label: 'PAUSE', img: 'pause', bg: 'rgba(20,28,44,.55)', type: 'key', code: 'KeyP' },
  };

  let wrap = null, region = null, panel = null, controls = {};
  let editing_sel = null, drag = null;
  /* Which key each control is currently holding down — see the press handler. */
  const held_code = {};

  /* WHICH KEY A CONTROL SENDS RIGHT NOW.
   *
   * Almost always its own: the table in CONTROLS is the binding. The exception
   * is GRAB during a FINISHER. The execution's checkpoints are read off the
   * uppercut edge (game.js EXEC_ONE_BUTTON — 'K', the △ face button), and on a
   * phone the uppercut is a hold-KICK-and-tap-JAB chord that nobody will
   * perform inside a 0.18s perfect window. So for the length of an execution
   * the GRAB control sends 'KeyK' instead, and the prompt over Olodo's head
   * draws the GRAB button to match (game.js drawPadShape).
   *
   * Additive, in the way everything here is: no execution, combat or grading
   * code changes — the finisher still runs on the same edge a keyboard raises,
   * and this only decides which synthetic key a thumb produces. `KeyE` remains
   * GRAB's key everywhere else, so carry, throw and the execution's own OFFER
   * are all untouched. */
  function codeFor(c) {
    if (c.code === 'KeyE') {
      try { if (window.__ror && window.__ror.execActive) return 'KeyK'; } catch {}
    }
    return c.code;
  }

  const shortEdge = () => Math.min(window.innerWidth, window.innerHeight);

  function placeControl(el, id) {
    const s = HUDS[id];
    const size = s.base * s.scale * (shortEdge() / REF_SHORT);
    const w = size * (CONTROLS[id]?.pill || 1);
    el.style.width = w + 'px';
    el.style.height = size + 'px';
    el.style.borderRadius = (CONTROLS[id]?.pill ? size * 0.5 : size * 0.5) + 'px';
    el.style.left = (s.x * window.innerWidth - w / 2) + 'px';
    el.style.top = (s.y * window.innerHeight - size / 2) + 'px';
    el.style.opacity = editing ? Math.max(0.35, s.opacity) : s.opacity;
    el.style.display = (s.visible || editing) ? 'flex' : 'none';
    /* A CONTROL WITH ART IS THE ART. The supplied buttons are finished glass
     * spheres — rim light, inner glow, dark interior, their own soft shadow —
     * so the drawn disc behind one shows as a grey halo and its border as a
     * second, harder edge just inside the sphere's own. Both are dropped here
     * rather than in the stylesheet so a control can gain or lose art without
     * anything else changing. The selection outline stays in the EDITOR only,
     * where it is the one thing that has to be visible over the art. */
    const art = !!CONTROLS[id]?.img;
    /* backgroundCOLOR, not the `background` shorthand: the shorthand resets
     * background-image too, and mk() has just put the button's art there. */
    el.style.backgroundColor = art ? 'transparent' : (CONTROLS[id]?.bg || 'rgba(20,28,44,.45)');
    el.style.backdropFilter = art ? 'none' : 'blur(8px)';
    el.style.webkitBackdropFilter = el.style.backdropFilter;
    el.style.border = editing_sel === id
      ? '2px solid #ffbe3c'
      : (art ? 'none' : '1px solid rgba(255,255,255,.3)');
  }
  function placeAll() { for (const id of Object.keys(controls)) placeControl(controls[id], id); }

  function build() {
    wrap = document.createElement('div');
    wrap.id = 'ror-touch';
    wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60;'
      + 'display:none;user-select:none;-webkit-user-select:none;'
      + 'font:700 11px/1 Montserrat,system-ui,sans-serif;color:#eaf0ff;letter-spacing:.06em;';

    /* MOVEMENT REGION: the whole left half of the screen. A touch here owns a
     * movement pointer; the stick graphic follows the touch origin. */
    region = document.createElement('div');
    /* Named like the other layers (ror-touch, ror-gest) so a harness can aim
     * real pointer events at the movement half instead of guessing at a point. */
    region.id = 'ror-move';
    region.style.cssText = 'position:absolute;left:0;top:0;width:50%;height:100%;'
      + 'pointer-events:auto;touch-action:none;';
    wrap.appendChild(region);

    const mk = (id) => {
      const c = CONTROLS[id];
      const el = document.createElement('div');
      /* The control's identity in the DOM. The label is what a thumb reads, but
       * it is presentation — a test (or a future skin) needs a handle that does
       * not change when the wording does. */
      el.dataset.rorId = id;
      /* A drawn mark or a word, whichever the control declares. */
      if (c.svg) el.innerHTML = c.svg;
      else if (!c.img) el.textContent = c.label;
      el.style.cssText = 'position:absolute;display:flex;align-items:center;'
        + 'justify-content:center;pointer-events:auto;touch-action:none;'
        + 'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);'
        + 'text-align:center;';
      /* ART LAST, and that ordering is the whole point: `style.cssText` REPLACES
       * the element's entire style declaration, so anything set on `el.style`
       * above this line is discarded. Setting the button's background image
       * before it looked completely correct and silently produced a control
       * with no art at all. */
      if (c.img) {
        el.style.backgroundImage = `url('frontend/ui/controls/${c.img}.png')`;
        el.style.backgroundSize = 'contain';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
        /* The word is gone, so the control needs its name some other way — for
         * a screen reader, and for the harness that finds controls by label. */
        el.setAttribute('aria-label', c.label);
      }
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch {}
        if (editing) { selectControl(id); drag = { id, x: e.clientX, y: e.clientY }; return; }
        el.style.filter = 'brightness(1.5)';
        if (c.type === 'key') {
          /* REMEMBERED, not recomputed. `codeFor` can answer differently from
           * one moment to the next (GRAB becomes the finisher's beat for the
           * length of an execution), and a control that pressed one key and
           * released another would leave the first one held down for ever. */
          held_code[id] = codeFor(c);
          send(held_code[id], true);
        } else sendMouse(c.button, true);
      });
      const up = (e) => {
        el.style.filter = '';
        if (editing) { drag = null; hudSave(); return; }
        if (c.type === 'key') {
          send(held_code[id] || c.code, false);
          held_code[id] = null;
        } else sendMouse(c.button, false);
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      el.addEventListener('pointermove', (e) => {
        if (!editing || !drag || drag.id !== id) return;
        const s = HUDS[id];
        s.x = clamp01((e.clientX) / window.innerWidth);
        s.y = clamp01((e.clientY) / window.innerHeight);
        /* clamp so the whole body stays in a usable region */
        const size = s.base * s.scale * (shortEdge() / REF_SHORT);
        const w = size * (c.pill || 1);
        s.x = Math.max((w / 2 + 6) / window.innerWidth, Math.min(1 - (w / 2 + 6) / window.innerWidth, s.x));
        s.y = Math.max((size / 2 + 6) / window.innerHeight, Math.min(1 - (size / 2 + 6) / window.innerHeight, s.y));
        placeControl(el, id);
        /* …and if you drag it up under the bar, the bar leaves. */
        parkPanel();
      });
      wrap.appendChild(el);
      return el;
    };
    for (const id of Object.keys(CONTROLS)) controls[id] = mk(id);

    /* THE STICK: a visual follower for the movement pointer. */
    /* THE STICK IS TWO PIECES OF ART, and it was already built that way.
     *
     * `DirectionsBase.png` is the dark D-pad face with its gold rim and four
     * arrows; `DirectionThumb.png` is the gold knob that sits in the middle.
     * The existing stick is exactly that shape — an outer element plus a knob
     * that TRANSLATES with the drag — so the two drop straight in with no
     * change to the movement code at all. The drawn disc and border go for the
     * same reason the action buttons' did: the art has its own rim, and the old
     * one shows as a second edge just outside it.
     *
     * 44% and the -22% margin are kept: that is the knob's travel geometry, not
     * its decoration, and the arrows on the base are drawn around exactly that
     * centre. */
    stickEl = document.createElement('div');
    stickEl.style.cssText = 'position:absolute;pointer-events:none;'
      + 'background-image:url(\'frontend/ui/controls/stick.png\');'
      + 'background-size:contain;background-repeat:no-repeat;background-position:center;';
    knob = document.createElement('div');
    knob.style.cssText = 'position:absolute;left:50%;top:50%;width:44%;height:44%;'
      + 'margin:-22% 0 0 -22%;'
      + 'background-image:url(\'frontend/ui/controls/stick-thumb.png\');'
      + 'background-size:contain;background-repeat:no-repeat;background-position:center;';
    stickEl.appendChild(knob);
    wrap.appendChild(stickEl);
    hooksForStick();

    document.body.appendChild(wrap);
    buildGestures();
    placeAll();
    placeStickAtHome();
  }

  /* ------------------------------------------------------- menu gestures --
   * While a menu owns the frame: swipe RIGHT enters the focused item, swipe
   * LEFT goes back, and a vertical drag on the RIGHT half steps through the
   * options (one step per 46 px of travel). A tap is forwarded to the canvas
   * as a real pointer sequence, so menu buttons keep behaving exactly as they
   * did — the gesture layer only claims MOVEMENT, never clicks. */
  let gest = null, gp = null, gStart = { x: 0, y: 0 }, gT = 0, gStep = 0, gConsumed = false;

  const tapKey = (code) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup',
      { code, bubbles: true, cancelable: true })), 40);
  };
  /* A tap, delivered as a click on the canvas.
   *
   * TWO EVENT FAMILIES, because the game has two menu systems and they listen
   * for different things. The front end (frontend.js) is POINTER-driven —
   * pointermove/pointerdown/pointerup. The pause menu and the post-mission
   * level select (game.js) are MOUSE-driven — mousemove/mousedown/mouseup.
   * A synthetic PointerEvent does NOT generate the compatibility mouse events
   * a real finger would, so for as long as this only sent pointer events,
   * tapping an actual pause-menu row did nothing and the menu could only be
   * worked by swiping.
   *
   * The mouse half is gated on a menu genuinely owning the frame: in a live
   * fight, mousedown button 0 on the canvas is a JAB, and the gesture layer's
   * visibility is only re-evaluated on an interval — so a tap landing in the
   * gap between the fight resuming and the layer hiding would throw a punch.
   * Pointer events carry no such risk and are always sent. */
  const forwardTap = (x, y) => {
    const canvas = document.getElementById('game');
    if (!canvas) return;
    const base = { clientX: x, clientY: y, bubbles: true, cancelable: true, view: window,
      pointerId: 991, pointerType: 'touch', isPrimary: true };
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...base, buttons: 0 }));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1, button: 0 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, button: 0 }));
    if (!window.__ror?.menuOwnsFrame) return;
    const m = { clientX: x, clientY: y, bubbles: true, cancelable: true, view: window, button: 0 };
    canvas.dispatchEvent(new MouseEvent('mousemove', { ...m, buttons: 0 }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { ...m, buttons: 1 }));
    canvas.dispatchEvent(new MouseEvent('mouseup', { ...m, buttons: 0 }));
  };

  function buildGestures() {
    gest = document.createElement('div');
    gest.id = 'ror-gest';
    gest.style.cssText = 'position:fixed;inset:0;z-index:55;display:none;'
      + 'pointer-events:auto;touch-action:none;background:transparent;';
    gest.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (gp !== null) return;
      gp = e.pointerId;
      gStart = { x: e.clientX, y: e.clientY };
      gT = performance.now(); gStep = 0; gConsumed = false;
      try { gest.setPointerCapture(e.pointerId); } catch {}
    });
    gest.addEventListener('pointermove', (e) => {
      if (e.pointerId !== gp || gConsumed) return;
      const dx = e.clientX - gStart.x, dy = e.clientY - gStart.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        gConsumed = true;
        tapKey(dx > 0 ? 'Enter' : 'Escape');       // right = enter, left = back
        return;
      }
      if (e.clientX > window.innerWidth * 0.5) {   // vertical scroll, right half
        const steps = Math.trunc((dy - gStep) / 46);
        if (steps !== 0) {
          gStep += steps * 46;
          for (let i = 0; i < Math.abs(steps); i++)
            tapKey(steps > 0 ? 'ArrowDown' : 'ArrowUp');
        }
      }
    });
    const gOff = (e) => {
      if (e.pointerId !== gp) return;
      const moved = Math.hypot(e.clientX - gStart.x, e.clientY - gStart.y);
      if (!gConsumed && moved < 14 && (performance.now() - gT) < 500) {
        /* WHAT A TAP MEANS, in priority order.
         *
         * 1. Landed ON a row or button -> that button's press. Always wins:
         *    the thing under your thumb is the thing you meant.
         * 2. Landed on EMPTY SPACE on the right half -> activate whatever is
         *    currently selected. The right half is already the scroll side —
         *    swipe up/down to move the highlight — so tapping there to commit
         *    completes the gesture: pick with the thumb, confirm in place,
         *    without reaching across for a swipe-right.
         * 3. Anywhere else -> forwarded as a click and lands wherever it lands,
         *    exactly as before. The left half stays neutral on purpose: it is
         *    the BACK side (swipe left), and a stray tap there committing the
         *    selection would be the opposite of what the hand meant. */
        if (window.__ror?.menuHitAt?.(e.clientX, e.clientY)) {
          forwardTap(e.clientX, e.clientY);
        } else if (e.clientX > window.innerWidth * 0.5) {
          tapKey('Enter');
        } else {
          forwardTap(e.clientX, e.clientY);
        }
      }
      gp = null;
    };
    gest.addEventListener('pointerup', gOff);
    gest.addEventListener('pointercancel', (e) => { if (e.pointerId === gp) gp = null; });
    document.body.appendChild(gest);
  }

  let stickEl = null, knob = null, movePointer = null, moveOrigin = { x: 0, y: 0 };
  /* RUSH, BY FLICK. The game's sprint is forward-forward-and-hold: two fresh
   * direction presses inside its tap window start the run, and the direction
   * staying down is what keeps it going (updateRushFree ends it the moment
   * the side is released). A fast horizontal flick on the movement region
   * therefore dispatches tap-release-tap and leaves the final press HELD;
   * lifting the finger releases it and the rush stops — the game's own rule,
   * no engine changes. */
  let rushLock = null;

  /* THE FLICK IS MEASURED OVER A ROLLING WINDOW, not from the moment the finger
   * landed. It used to be `e.clientX - moveStart.x` against the touch-down
   * point, with moveStart never updated — so the test was "has the thumb ever
   * ended up 80px sideways of where it started, within 450ms of landing", which
   * an ordinary push-out-and-hold to WALK satisfies easily. Players were
   * entering the rush lock constantly without asking for it, and the lock then
   * froze their direction (see the pointermove handler). Sampling from a point
   * that is re-taken whenever it goes stale turns the test into a real speed
   * test: 80px inside 180ms is ~440px/s, which a deliberate walking push
   * (~250px/s, and then stationary) never reaches. */
  const FLICK_MS = 180, FLICK_PX = 80;
  let flickFrom = { x: 0, y: 0, t: 0 };

  function commitRush(code, cx, cy) {
    if (rushLock) return;
    rushLock = code;
    /* RE-ANCHOR THE STICK UNDER THE THUMB. A flick ends with the finger a long
     * way from where it landed; leaving the origin behind would mean a player
     * who wants to turn round has to drag all the way back across the original
     * touch point before the stick reads as pointing the other way. */
    if (typeof cx === 'number') {
      moveOrigin = { x: cx, y: cy };
      if (stickEl) {
        const z = stickSize();
        stickEl.style.left = (cx - z / 2) + 'px';
        stickEl.style.top = (cy - z / 2) + 'px';
      }
      if (knob) knob.style.transform = 'translate(0,0)';
    }
    const fire = (down) => { if (rushLock === code) send(code, down); };
    send(code, false);                       // clear any walking press first…
    setTimeout(() => fire(true), 0);         // …tap 1…
    setTimeout(() => fire(false), 55);
    setTimeout(() => fire(true), 120);       // …tap 2: the rush, left held
  }

  /* Hand the finger back to the stick. The rush's held direction has to be
   * released explicitly — updateRushFree ends the sprint on that release, which
   * is the whole reason the flick works without engine changes. */
  function breakRush() {
    if (!rushLock) return;
    send(rushLock, false);
    rushLock = null;
  }

  function stickSize() {
    const s = HUDS.stick;
    return s.base * s.scale * (shortEdge() / REF_SHORT);
  }
  function placeStickAtHome() {
    const s = HUDS.stick;
    const z = stickSize();
    stickEl.style.width = z + 'px'; stickEl.style.height = z + 'px';
    stickEl.style.left = (s.x * window.innerWidth - z / 2) + 'px';
    stickEl.style.top = (s.y * window.innerHeight - z / 2) + 'px';
    stickEl.style.opacity = editing ? Math.max(0.35, s.opacity) : s.opacity;
    stickEl.style.display = (s.visible || editing) ? 'block' : 'none';
    /* Outline in the EDITOR only — the D-pad art carries its own gold rim, and
     * a second border outside it reads as a rendering fault. */
    stickEl.style.border = editing_sel === 'stick' ? '2px solid #ffbe3c' : 'none';
    knob.style.transform = 'translate(0,0)';
  }

  /* The stick's dead zone. Module scope because the rush lock reads it too:
   * "the thumb has moved back the other way" has to mean the same distance
   * there as it does here, or the two disagree about which way you are facing. */
  const DEAD = 14;

  /* Movement: 8-way with a dead zone, dispatched as the arrows the game
   * already reads. The origin is the TOUCH POINT, not the stick graphic. */
  function applyStick(dx, dy) {
    const diagW = DEAD * 0.45;
    const want = new Set();
    if (Math.abs(dx) > DEAD && Math.abs(dy) > DEAD) {
      if (dx < -diagW) want.add('ArrowLeft');
      if (dx > diagW) want.add('ArrowRight');
      if (dy < -diagW) want.add('ArrowUp');
      if (dy > diagW) want.add('ArrowDown');
    } else {
      if (dx < -DEAD && Math.abs(dx) > Math.abs(dy) * 0.5) want.add('ArrowLeft');
      if (dx > DEAD && Math.abs(dx) > Math.abs(dy) * 0.5) want.add('ArrowRight');
      if (dy < -DEAD && Math.abs(dy) > Math.abs(dx) * 0.5) want.add('ArrowUp');
      if (dy > DEAD && Math.abs(dy) > Math.abs(dx) * 0.5) want.add('ArrowDown');
    }
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])
      send(code, want.has(code));
  }

  function hooksForStick() {
    region.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (editing) {
        /* dragging the stick in the editor moves it like any control */
        if (movePointer !== null) return;
        movePointer = e.pointerId; drag = { id: 'stick', x: e.clientX, y: e.clientY };
        selectControl('stick');
        try { region.setPointerCapture(e.pointerId); } catch {}
        return;
      }
      if (movePointer !== null) return;          // one movement finger only
      movePointer = e.pointerId;
      moveOrigin = { x: e.clientX, y: e.clientY };
      /* the flick sample starts where the finger landed */
      flickFrom = { x: e.clientX, y: e.clientY, t: performance.now() };
      try { region.setPointerCapture(e.pointerId); } catch {}
      /* the graphic follows the touch origin while the finger is down */
      const z = stickSize();
      stickEl.style.left = (e.clientX - z / 2) + 'px';
      stickEl.style.top = (e.clientY - z / 2) + 'px';
      applyStick(0, 0);
    });
    region.addEventListener('pointermove', (e) => {
      if (e.pointerId !== movePointer) return;
      if (editing) {
        const s = HUDS.stick;
        s.x = clamp01(e.clientX / window.innerWidth);
        s.y = clamp01(e.clientY / window.innerHeight);
        placeStickAtHome();
        parkPanel();                         // the bar yields to the stick too
        return;
      }
      const dx = e.clientX - moveOrigin.x, dy = e.clientY - moveOrigin.y;
      const r = stickSize() / 2 - 8;
      const len = Math.hypot(dx, dy) || 1;
      const kx = len > r ? dx / len * r : dx, ky = len > r ? dy / len * r : dy;
      knob.style.transform = 'translate(' + kx + 'px,' + ky + 'px)';
      const t = performance.now();
      /* TURNING ROUND BREAKS THE RUSH.
       *
       * This used to be a bare `if (rushLock) return;` — once the flick had the
       * finger, applyStick was never called again, so the direction was frozen
       * until the thumb was LIFTED and put back down. That is the "character
       * keeps walking the old way until I release and re-press" bug, and an
       * accidental flick (see FLICK_MS) put players into it constantly.
       *
       * Pushing the thumb back the other way past the dead zone now ends the
       * sprint and hands the finger back to the stick on the same frame. */
      if (rushLock) {
        const back = (rushLock === 'ArrowRight' && dx < -DEAD)
          || (rushLock === 'ArrowLeft' && dx > DEAD);
        if (!back) return;
        breakRush();
        /* A fresh sample, so the very move that broke the lock cannot read as a
         * flick and immediately re-commit a rush the other way. */
        flickFrom = { x: e.clientX, y: e.clientY, t };
      }
      /* a fast horizontal flick across the movement region is a rush */
      if (t - flickFrom.t > FLICK_MS) flickFrom = { x: e.clientX, y: e.clientY, t };
      const fdx = e.clientX - flickFrom.x, fdy = e.clientY - flickFrom.y;
      if (Math.abs(fdx) > FLICK_PX && Math.abs(fdx) > Math.abs(fdy) * 1.4) {
        commitRush(fdx > 0 ? 'ArrowRight' : 'ArrowLeft', e.clientX, e.clientY);
        return;
      }
      applyStick(dx, dy);
    });
    const off = (e) => {
      if (e.pointerId !== movePointer) return;
      movePointer = null; drag = null;
      if (editing) { hudSave(); return; }
      breakRush();                               // releasing stops the rush
      applyStick(0, 0);
      placeStickAtHome();
    };
    region.addEventListener('pointerup', off);
    region.addEventListener('pointercancel', off);
    region.addEventListener('lostpointercapture', off);
  }

  /* ---------------------------------------------------------------- editor */
  function buildPanel() {
    panel = document.createElement('div');
    /* UP THE SCREEN, because everything it is used to adjust lives DOWN it.
     * The bar sat at bottom:14px, directly over the stick, jab, kick and grab —
     * every control below y 0.40 — so adjusting one meant the readout covered
     * the thing you were watching. The top edge carries only the pause button,
     * and that is off to the right of a centred bar. `parkPanel` moves it back
     * down on the rare occasion the selected control is itself up here. */
    panel.style.cssText = 'position:absolute;left:50%;top:14px;transform:translateX(-50%);'
      + 'display:none;align-items:center;gap:14px;padding:10px 16px;border-radius:16px;'
      + 'background:rgba(18,24,38,.72);border:1px solid rgba(255,255,255,.22);'
      + 'backdrop-filter:blur(16px) saturate(1.4);'
      + '-webkit-backdrop-filter:blur(16px) saturate(1.4);pointer-events:auto;'
      + 'box-shadow:0 10px 40px rgba(0,0,0,.45);font:700 10px/1.5 Montserrat,system-ui,sans-serif;';
    const style = document.createElement('style');
    style.textContent = '#ror-hud-panel input[type=range]{width:130px;accent-color:#ffe45e;}'
      + '#ror-hud-panel button{padding:7px 12px;border-radius:9px;cursor:pointer;'
      + 'color:#eaf0ff;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);'
      + 'font:inherit;letter-spacing:.06em;}'
      + '#ror-hud-panel .lab{color:#9fb2d8;text-transform:uppercase;}';
    panel.id = 'ror-hud-panel';
    document.head.appendChild(style);

    panel.innerHTML =
      '<span class="lab" id="ror-hud-sel">—</span>'
      + '<span class="lab">Size</span><input id="ror-hud-size" type="range" min="0.6" max="1.8" step="0.05">'
      + '<span class="lab">Opacity</span><input id="ror-hud-opac" type="range" min="0.25" max="1" step="0.05">'
      + '<button id="ror-hud-vis">HIDE</button>'
      + '<button id="ror-hud-reset">RESET</button>'
      + '<button id="ror-hud-copy">COPY LAYOUT</button>'
      + '<button id="ror-hud-save">SAVE</button>'
      + '<button id="ror-hud-done">DONE</button>';
    wrap.appendChild(panel);

    /* LIVE. `refreshSel` only rewrites the PANEL — the label and the two slider
     * positions. What actually sizes and fades a control is placeControl, and
     * nothing here was calling it, so a control kept its old geometry until
     * something else re-placed it: dragging it, or SAVE/DONE/RESET. Sliding
     * SIZE and watching nothing happen until you poke the button is exactly
     * that gap. `liveEdit` is the one door every editor mutation goes through
     * now, so a future control cannot be added and forget to redraw. */
    const liveEdit = () => { refreshSel(); placeAll(); placeStickAtHome(); };

    panel.querySelector('#ror-hud-size').addEventListener('input', (e) => {
      if (!editing_sel) return;
      HUDS[editing_sel].scale = Number(e.target.value);
      liveEdit();
    });
    panel.querySelector('#ror-hud-opac').addEventListener('input', (e) => {
      if (!editing_sel) return;
      HUDS[editing_sel].opacity = Number(e.target.value);
      liveEdit();
    });
    panel.querySelector('#ror-hud-vis').addEventListener('click', () => {
      if (!editing_sel) return;
      HUDS[editing_sel].visible = !HUDS[editing_sel].visible;
      liveEdit();
    });
    panel.querySelector('#ror-hud-reset').addEventListener('click', () => {
      if (!window.confirm('Reset the control layout to its defaults?')) return;
      HUDS = HUD_DEFAULTS();
      editing_sel = null;
      hudSave();
      refreshSel(); placeAll(); placeStickAtHome();
    });
    /* COPY LAYOUT — the live positions as the HUD_DEFAULTS block, on the
     * clipboard and in the console. This is what turns an arrangement made with
     * a thumb into the shipped default, without anyone re-measuring a
     * screenshot. Console as well as clipboard because a phone WebView can
     * refuse the clipboard, and chrome://inspect can always read the log. */
    panel.querySelector('#ror-hud-copy').addEventListener('click', () => {
      const code = layoutCode();
      console.info('[ratel-hud] paste this over HUD_DEFAULTS in src/touch.js:\n' + code);
      let copied = false;
      try { navigator.clipboard.writeText(code); copied = true; } catch {}
      const btn = panel.querySelector('#ror-hud-copy');
      btn.textContent = copied ? 'COPIED' : 'IN CONSOLE';
      setTimeout(() => { btn.textContent = 'COPY LAYOUT'; }, 1400);
    });
    panel.querySelector('#ror-hud-save').addEventListener('click', () => {
      hudSave();
      flash('Saved');
    });
    panel.querySelector('#ror-hud-done').addEventListener('click', () => {
      hudSave();
      closeEditor();
    });
  }
  function flash(msg) {
    const el = panel.querySelector('#ror-hud-sel');
    if (el) el.textContent = msg;
  }
  function selectControl(id) {
    editing_sel = id;
    refreshSel();
    placeAll(); placeStickAtHome();
  }
  /* THE BAR GETS OUT OF ITS OWN WAY.
   *
   * It lives at the top now, which is clear for every control the player is
   * likely to be dragging. The one case that still collides is a control parked
   * up there — the pause button by default, or anything the player has moved —
   * so when the selected control's own band overlaps the bar, the bar drops to
   * the bottom instead. Driven off the SELECTION rather than off every
   * control's position: what must stay visible is the one being adjusted, and a
   * bar that fled every stray control would have nowhere left to stand. */
  function parkPanel() {
    if (!panel) return;
    const s = HUDS[editing_sel];
    let low = false;
    if (s) {
      const size = s.base * s.scale * (shortEdge() / REF_SHORT);
      const top = s.y * window.innerHeight - size / 2;
      low = top < 108;                       // …it would sit under the bar
    }
    panel.style.top = low ? 'auto' : '14px';
    panel.style.bottom = low ? '14px' : 'auto';
  }

  function refreshSel() {
    if (!panel) return;
    const s = HUDS[editing_sel];
    parkPanel();
    if (!s) { panel.querySelector('#ror-hud-sel').textContent = '—'; return; }
    panel.querySelector('#ror-hud-sel').textContent = editing_sel.toUpperCase()
      + (s.visible ? '' : ' · hidden');
    panel.querySelector('#ror-hud-size').value = s.scale;
    panel.querySelector('#ror-hud-opac').value = s.opacity;
  }

  function openEditor() {
    if (editing) return;
    editing = true;
    editing_sel = null;
    releaseAll();                     // no stuck directions when the sim resumes
    if (!panel) buildPanel();
    panel.style.display = 'flex';
    wrap.style.display = 'block';
    refreshSel();
    placeAll(); placeStickAtHome();
    window.__ror?.redraw?.();
  }
  function closeEditor() {
    editing = false;
    editing_sel = null; drag = null;
    if (panel) panel.style.display = 'none';
    releaseAll();
    placeAll(); placeStickAtHome();
  }
  window.__rorTouch = {
    openEditor, closeEditor, layoutCode,
    get editing() { return editing; },
    get layout() { return HUDS; },
  };

  /* ------------------------------------------------------------ lifecycle */
  function init() {
    build();
    setInterval(() => {
      const R = window.__ror;
      const isPaused = !!(R && R.paused);
      /* …and once the mission is over. The outro's case file and the whole
       * post-mission sequence are drawn by game.js, so `frontActive` is false
       * through both and the combat pad used to sit over them — a full set of
       * punch buttons on a screen with nothing to punch, and no gesture layer
       * on a screen that is navigated. */
      const over = !!(R && R.missionOver);
      /* Controls live on the fight only: paused, the menu owns the screen. */
      const show = !!(R && R.worldReady && !R.frontActive && !isPaused && !over);
      wrap.style.display = (show || editing) ? 'block' : 'none';
      /* Gestures ride the interactive menus AND the pause menu (taps and
       * swipes both drive its navigation), never the cinematics. */
      const phase = R?.frontEndPhase ?? null;
      const GESTURE_PHASES = ['title', 'menu', 'difficulty', 'character', 'characters',
        'shop', 'controls', 'options', 'levelSelect', 'briefing', 'levelTitle',
        'extras', 'credits'];
      /* DELIBERATELY NOT GATED ON worldReady, unlike the gameplay controls
       * above. The menus do not need the level: the title and the main menu are
       * up and interactive long before the 39 sheets have landed — that is the
       * whole point of the background load. Requiring it here left the gesture
       * layer hidden for the first ~30 seconds on a phone, so swiping AND
       * tapping were dead on exactly the screens the player meets first, and
       * the game looked frozen until the world happened to finish. The pause
       * branch is unreachable before the world is in anyway. */
      const menuShow = !!(R && !editing
        && ((R.frontActive && GESTURE_PHASES.includes(phase)) || isPaused || over));
      if (gest) gest.style.display = menuShow ? 'block' : 'none';
      if (!menuShow && gp !== null) gp = null;
      if (!show && !editing) { releaseAll(); placeStickAtHome(); }
    }, 200);
    window.addEventListener('resize', () => { placeAll(); placeStickAtHome(); });
  }

  const wait = setInterval(() => {
    const R = window.__ror;
    if (R && R.frontActive !== undefined) { clearInterval(wait); init(); }
  }, 250);
})();
