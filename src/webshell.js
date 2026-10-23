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
})();
