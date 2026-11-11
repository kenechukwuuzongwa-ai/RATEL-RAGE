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
  if (retrying && root.requestFullscreen && upright()) {
    setTurned(true);
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
      // fall back to the upright page and its ROTATE PHONE prompt
      if (e.type === 'touchend' && !tapped) { tapped = true; setTimeout(function () { if (upright()) setTurned(false); }, 1500); }
    };
    ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach(function (t) {
      window.addEventListener(t, swallow, { capture: true, passive: false });
    });
  }
  W.turned = function () { return turned; };
})();
