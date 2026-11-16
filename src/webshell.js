/* RATEL RAGE — the browser shell.
 *
 * What a public web page needs that the Android app gets from its native host:
 *   - no page gestures under the game: context menu, double-tap / pinch zoom,
 *     iOS gesture events (scroll and pull-to-refresh are stopped in styles.css);
 *   - on phones, FULLSCREEN + LANDSCAPE on the first tap. Chrome only allows
 *     either from a user gesture, so it cannot happen at load. Fullscreen also
 *     makes the window the same shape as the screen, which is the shape the
 *     game widens its view to on Android (game.js VIEW_W).
 *
 * Inside the Capacitor app (window.Capacitor) all of this is the native host's
 * job already, so the file only records that and stops. */
(function () {
  'use strict';
  var W = window.RR_WEB = window.RR_WEB || {};
  try {
    var C = window.Capacitor;
    W.native = !!(C && (typeof C.isNativePlatform === 'function' ? C.isNativePlatform() : true));
  } catch (e) { W.native = false; }

  /* THE VIEW FOLLOWS THE VISIBLE WINDOW (request 641: "starts rotated but not scaled to fit the screen until
   * touched"). On Android both renderers widen the 1280x720 view to the device's shape. That shape used to
   * be the SCREEN's, fixed at load, but until the first tap goes fullscreen the browser's own bars take part
   * of the screen, so the picture was letterboxed inside the window. Now it is the WINDOW's long:short ratio
   * (the same on a turned page), re-read on every resize: the game fills the window from the first frame and
   * simply widens when fullscreen arrives. One rule for game.js (VIEW_W), frontend.js (W) and the shell CSS
   * (--rr-vw, touch.js). Not while a form field has focus: the keyboard is not a new screen shape. */
  var lastVW = 1280;
  W.viewW = function () {
    if (!/Android/.test(navigator.userAgent)) return 1280;
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return lastVW;
    var iw = window.innerWidth || 0, ih = window.innerHeight || 0;
    if (!iw || !ih) { iw = (window.screen && screen.width) || 0; ih = (window.screen && screen.height) || 0; }
    var long = Math.max(iw, ih), short = Math.min(iw, ih);
    var r = short > 0 ? long / short : 16 / 9;
    lastVW = r > 16 / 9 + 0.01 ? Math.min(2200, Math.round((720 * r) / 2) * 2) : 1280;
    try { document.documentElement.style.setProperty('--rr-vw', String(lastVW)); } catch (e) {}
    return lastVW;
  };
  W.viewW();
  window.addEventListener('resize', function () { W.viewW(); });

  if (W.native) return;

  var editable = function (t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  };
  document.addEventListener('contextmenu', function (e) { if (!editable(e.target)) e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { if (!editable(e.target)) e.preventDefault(); }, { passive: false });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
    document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false });
  });
  // Multi-finger moves are zoom attempts; one-finger moves are left to the
  // game's own pointer handling (touch-action: none already stops scrolling).
  document.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  var coarse = false;
  try { coarse = navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
  if (!coarse) return;

  var root = document.documentElement;
  var goFullscreen = function () {
    try {
      if (document.fullscreenElement || !root.requestFullscreen) return;
      var p = root.requestFullscreen({ navigationUI: 'hide' });
      if (p && p.then) {
        p.then(function () {
          try {
            if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
          } catch (e) {}
        }).catch(function () {});
      }
    } catch (e) {}
  };
  // touchend / click are the events Chrome accepts as the gesture for fullscreen.
  window.addEventListener('touchend', goFullscreen, true);
  window.addEventListener('click', goFullscreen, true);

  /* RETRY STAYS LANDSCAPE (request 572). RETRY reloads the page, and a reload drops fullscreen
   * and the landscape lock: a phone with auto-rotate off came back upright and showed ROTATE
   * PHONE TO PLAY before the loading screen. A retry that lands upright now draws the page
   * turned a quarter (html.rr-rot, styles.css), the way the player is still holding the phone
   * (game.js saves screen.orientation.angle as rr.orient before the reload), so the loading
   * screen comes straight up. The first tap is the gesture fullscreen needs: it goes
   * fullscreen + landscape (goFullscreen above) and is otherwise swallowed, since the touch HUD
   * is hidden while the page is turned. The turn is dropped as soon as the window is landscape. */
  var retrying = false, angle = 90;
  try {
    retrying = sessionStorage.getItem('rorSkipToGameplay') === '1';
    angle = Number(sessionStorage.getItem('rr.orient')) || 90;
    sessionStorage.removeItem('rr.orient');
  } catch (e) {}
  var upright = function () { return window.innerHeight > window.innerWidth; };
  var turned = false;
  var setTurned = function (on) {
    turned = on;
    root.classList.toggle('rr-rot', on);
    root.classList.toggle('rr-rot-ccw', on && angle === 270);
  };
  /* EVERY UPRIGHT LOAD, NOT ONLY A RETRY (request 639: "the game starts in portrait, needing a tap before it
   * rotates"). No web page may rotate the screen or go fullscreen without a tap (Chrome's rule), so the page
   * itself is drawn landscape from the first frame, turned a quarter: the studio card and the menus come up
   * the right way for a player who turns the phone, with or without auto-rotate. The first tap is the
   * gesture that locks fullscreen + landscape. Phones whose browser has no fullscreen (iPhone Safari) keep
   * the plain page: they rotate on their own when the phone turns. */
  if (root.requestFullscreen) {
    var untilLandscape = function () { if (turned && !upright()) setTurned(false); };
    window.addEventListener('resize', untilLandscape);
    window.addEventListener('orientationchange', function () { setTimeout(untilLandscape, 60); });
    // the first touch while turned is the fullscreen gesture and nothing else
    var tapped = false;
    var swallow = function (e) {
      if (!turned) return;
      e.stopPropagation();
      if (e.cancelable && e.type !== 'touchend') e.preventDefault();
      // if the browser refused fullscreen the page cannot stay turned (touches would land wrong):
      // fall back to the upright page
      if (e.type === 'touchend' && !tapped) { tapped = true; setTimeout(function () { if (upright()) setTurned(false); }, 1500); }
    };
    ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach(function (t) {
      window.addEventListener(t, swallow, { capture: true, passive: false });
    });
    if (upright()) setTurned(true);

    /* BACK TO LANDSCAPE AFTER A SYSTEM DIALOG (request 648: the notification permission prompt "rotated
     * the screen ... I had to tap the screen again before it returned to landscape"). A permission prompt
     * (Chrome's, or Android's own the first time Chrome asks to notify) can drop fullscreen and with it the
     * landscape lock, and no page can choose the orientation of the OS's dialog. When it closes: try to go
     * straight back to fullscreen landscape (the browser allows it while the tap that opened the prompt still
     * counts); if it will not, and the phone came back upright, draw the page turned so the game is still
     * landscape and the next tap restores fullscreen. */
    W.relandscape = function () {
      if (document.fullscreenElement) return;
      goFullscreen();
      setTimeout(function () {
        if (!document.fullscreenElement && upright()) { tapped = false; setTurned(true); }
      }, 350);
    };
  }
  W.turned = function () { return turned; };
})();
