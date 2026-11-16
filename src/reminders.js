/* RATEL RAGE — RETURN REMINDERS (request 644: "notifications that prompt players to come back and beat some
 * Agberos extorting traders, like PUBG Mobile").
 *
 * WHO SENDS THEM. A web page cannot wake itself up later, so the reminders come from rr-push (push/worker.js,
 * a Cloudflare Worker): it keeps this browser's push address and, once an hour, nudges a player who has been
 * away 10+ hours (at most one a day-ish, only in their daytime, and it stops after 4 unanswered). The site's
 * service worker (deploy/media-sw.js) shows the line with the ratel logo. Web build only (the worker is
 * registered there); iPhone only once the game is on the home screen (Apple's rule).
 *
 * WHAT THIS FILE DOES
 *   - when the player has said yes: keeps the subscription alive and tells rr-push "the game was opened"
 *     (that resets the clock), every launch;
 *   - asks ONCE, politely, on the main menu after the player has played at least one level (a small card:
 *     REMIND ME / NOT NOW; NOT NOW asks again after 3 days at the earliest). The browser's own permission
 *     prompt only ever opens from that tap;
 *   - window.RRReminders for the OPTIONS > GAMEPLAY > RETURN REMINDERS switch (frontend.js).
 * Nothing about the player is sent: only the push address and their UTC offset. */
(function () {
  'use strict';
  var API = 'https://rr-push.kenechukwuuzongwa.workers.dev';
  var KEY = 'BG4RUld2t-Cxm8B2qxZLDtskQGCHvHEUt5TEVI4H9J6LIbN8GHsxqjHl-UQ8hPwgWIJk2CjEgNfraai9BYOMqWo';
  var OFF = 'rr.remind.off', ASKED = 'rr.remind.asked', ASK_AGAIN_MS = 3 * 86400000;
  var ls = null; try { ls = window.localStorage; } catch (e) { ls = null; }
  var lget = function (k) { try { return ls ? ls.getItem(k) : null; } catch (e) { return null; } };
  var lset = function (k, v) { try { if (ls) { if (v == null) ls.removeItem(k); else ls.setItem(k, String(v)); } } catch (e) {} };

  var native = !!(window.RR_WEB && window.RR_WEB.native);
  var secure = location.protocol === 'https:' || location.hostname === 'localhost';
  var S = {
    supported: !native && secure && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined',
    on: false,
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    busy: false,
  };
  var listeners = [];
  var changed = function () { for (var i = 0; i < listeners.length; i++) { try { listeners[i](S); } catch (e) {} } };

  var post = function (path, body) {
    return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true })
      .then(function (r) { return r.ok ? r.json().catch(function () { return {}; }) : null; }, function () { return null; });
  };
  var tz = function () { return -new Date().getTimezoneOffset(); };
  // the site's service worker (registered by the web build's index.html); none locally = not supported
  function registration() {
    if (!S.supported) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration().then(function (r) { return r ? navigator.serviceWorker.ready : null; }, function () { return null; });
  }
  function subscribe() {
    return registration().then(function (r) {
      if (!r) return false;
      return r.pushManager.getSubscription().then(function (s) {
        return s || r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: KEY });
      }).then(function (s) {
        return post('/sub', { endpoint: s.endpoint, tz: tz() }).then(function (ok) { S.on = !!ok; changed(); return S.on; });
      });
    }).catch(function () { S.on = false; changed(); return false; });
  }

  // every launch: a player who said yes keeps the subscription and resets the reminder clock
  function boot() {
    if (!S.supported) return;
    registration().then(function (r) {
      if (!r) { S.supported = false; changed(); return; }
      S.permission = Notification.permission;
      if (S.permission !== 'granted' || lget(OFF) === '1') { changed(); return; }
      r.pushManager.getSubscription().then(function (s) {
        if (!s) return subscribe();
        S.on = true; changed();
        return post('/seen', { endpoint: s.endpoint }).then(function (res) {
          if (res && res.known === false) return post('/sub', { endpoint: s.endpoint, tz: tz() });
        });
      }).catch(function () {});
    });
  }

  // from a tap only: the browser's permission prompt, then the subscription
  function ask() {
    if (!S.supported || S.busy) return Promise.resolve(false);
    S.busy = true; answered = true; lset(ASKED, Date.now()); changed();
    var p;
    try { p = Notification.requestPermission(); } catch (e) { p = null; }
    // request 648: the prompt can drop fullscreen + landscape; put the game back the moment it closes
    var relandscape = function () { try { if (window.RR_WEB && window.RR_WEB.relandscape) window.RR_WEB.relandscape(); } catch (e) {} };
    return Promise.resolve(p).then(function (perm) {
      relandscape();
      S.permission = perm || Notification.permission;
      lset(ASKED, Date.now());
      if (S.permission !== 'granted') return false;
      lset(OFF, null);
      return subscribe();
    }).then(function (ok) { S.busy = false; changed(); return ok; }, function () { S.busy = false; changed(); return false; });
  }
  function off() {
    lset(OFF, '1');
    return registration().then(function (r) { return r && r.pushManager.getSubscription(); }).then(function (s) {
      if (!s) return;
      return post('/unsub', { endpoint: s.endpoint }).then(function () { return s.unsubscribe(); });
    }).catch(function () {}).then(function () { S.on = false; changed(); });
  }
  function test() {
    return registration().then(function (r) { return r && r.pushManager.getSubscription(); })
      .then(function (s) { return s ? post('/test', { endpoint: s.endpoint }) : null; });
  }

  /* THE ASK: a small card on the main menu, once the player has played a level, never mid-game. */
  function playedOnce() {
    try { var d = window.RRProgress && window.RRProgress.get(); return !!(d && d.stats && d.stats.runs > 0); } catch (e) { return false; }
  }
  // request 648: one tap on the card answers it for this session (it used to come back while the
  // browser's prompt was still open, and stayed until REMIND ME was tapped a second time)
  var answered = false;
  function shouldOffer() {
    if (answered || S.busy) return false;
    if (!S.supported || S.on || S.permission !== 'default' || lget(OFF) === '1' || !playedOnce()) return false;
    var at = +lget(ASKED) || 0;
    return !at || Date.now() - at > ASK_AGAIN_MS;
  }
  var card = null;
  function buildCard() {
    var css = document.createElement('style');
    /* Request 648: a small card that drops in from the top edge (it was a large panel rising from the bottom). */
    css.textContent = [
      '.rr-remind{position:fixed;left:50%;top:max(8px,2vh);transform:translate(-50%,calc(-100% - 16px));opacity:0;z-index:80;',
      'width:min(236px,40vw);padding:7px 8px;border-radius:0;color:rgba(255,255,255,.8);',
      'background:linear-gradient(180deg,rgba(16,22,30,.96),rgba(7,10,15,.97));border:1px solid rgba(255,255,255,.12);border-bottom:2px solid #36d67e;',
      'box-shadow:0 8px 28px rgba(0,0,0,.6);font:400 9.5px/1.3 "RR Inter",system-ui,sans-serif;',
      'transition:transform .26s cubic-bezier(.2,.9,.3,1.15),opacity .2s ease-out;',
      'display:grid;grid-template-columns:24px 1fr;column-gap:7px;align-items:center;touch-action:manipulation}',
      '.rr-remind.in{transform:translate(-50%,0);opacity:1}',
      '.rr-remind img{width:24px;height:24px;object-fit:contain}',
      '.rr-remind h3{margin:0 0 .15em;font:900 8.5px/1.2 "RR Inter",system-ui,sans-serif;letter-spacing:.18em;color:#fff}',
      '.rr-remind p{margin:0;color:rgba(255,255,255,.62)}',
      '.rr-remind .row{grid-column:1/-1;display:flex;gap:6px;margin-top:6px}',
      '.rr-remind button{flex:1;padding:.6em .3em;border-radius:0;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.04);',
      'color:rgba(255,255,255,.82);font:800 8px "RR Inter",system-ui,sans-serif;letter-spacing:.15em;cursor:pointer}',
      '.rr-remind button.yes{background:#36d67e;color:#04140b;border-color:#36d67e}',
    ].join('');
    document.head.appendChild(css);
    card = document.createElement('div');
    card.className = 'rr-remind';
    card.setAttribute('role', 'dialog');
    card.innerHTML = '<img src="frontend/icons/notify-192.png" alt="">'
      + '<div><h3>THE STREETS NEED YOU</h3><p>A heads-up when the Agberos are back. One a day at most.</p></div>'
      + '<div class="row"><button class="no" type="button">NOT NOW</button><button class="yes" type="button">REMIND ME</button></div>';
    ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'click'].forEach(function (t) {
      card.addEventListener(t, function (e) { e.stopPropagation(); });
    });
    card.querySelector('.yes').addEventListener('click', function () { answered = true; hideCard(); ask(); });
    card.querySelector('.no').addEventListener('click', function () { answered = true; lset(ASKED, Date.now()); hideCard(); });
    card.style.display = 'none';
    document.body.appendChild(card);
  }
  var shown = false;
  function showCard() {
    if (shown) return;
    if (!card) buildCard();
    // never slide in with an empty logo slot: wait for the image (watch() retries every 500 ms; error counts too)
    if (!card.querySelector('img').complete) return;
    shown = true;
    card.style.display = 'grid';
    requestAnimationFrame(function () { card.classList.add('in'); });
  }
  function hideCard() {
    if (!card || !shown) return;
    shown = false;
    card.classList.remove('in');
    setTimeout(function () { if (!shown) card.style.display = 'none'; }, 260);
  }
  var onMenuSince = 0;
  function watch() {
    var M = window.__rorMenu, R = window.__ror;
    var onMenu = !!(M && R && R.frontActive && M.phase === 'menu');
    onMenuSince = onMenu ? (onMenuSince || Date.now()) : 0;
    // a beat after landing on the menu, not over the arrival
    if (onMenu && !shown && shouldOffer()) {
      if (!card) buildCard(); // hidden; starts loading the logo during the beat below
      if (Date.now() - onMenuSince > 1500) showCard();
    }
    else if (shown && (!onMenu || !shouldOffer())) hideCard();
  }

  window.RRReminders = {
    get supported() { return S.supported; },
    get on() { return S.on; },
    get permission() { return S.permission; },
    get busy() { return S.busy; },
    ask: ask, off: off, test: test,
    shouldOffer: shouldOffer,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
  };
  if (S.supported) {
    boot();
    setInterval(watch, 500);
  }
})();
