/* Ratel Rage website (request 657). No framework: progressive enhancement only.
 * Every page reads fine without this file; it adds the menu toggle, the platform
 * switch on the how-to-play pages, the story's spoiler switch, and the two live
 * panels (leaderboards from Supabase, billboard insights from rr-ads). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  /* ---- motion and light (request 660). Everything here is decoration: without it the page reads the same. */
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var top = $('.top');
  /* The city drifts slower than the page (request 668). The <picture> moves, not its <img>: the img's
   * entrance animation holds its own transform. */
  var heroBg = $('.hero-bg'), heroIn = $('.hero-in');
  var onScroll = function () {
    if (top) top.classList.toggle('scrolled', scrollY > 8);
    if (!calm && scrollY < innerHeight * 1.2) {
      if (heroBg) heroBg.style.transform = 'translateY(' + (scrollY * 0.28).toFixed(1) + 'px)';
      if (heroIn) heroIn.style.transform = 'translateY(' + (scrollY * 0.12).toFixed(1) + 'px)';
    }
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  // cards and feature tiles follow the cursor with a soft spotlight
  document.addEventListener('pointermove', function (e) {
    var c = e.target.closest && e.target.closest('.card, .feat > div');
    if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
  // sections slide up as they enter the view; groups stagger
  if (!calm && 'IntersectionObserver' in window) {
    var items = $$('main section.band .wrap > *, .grid > *, .cast > *, .feat > *, .grades > *, .steps > *, .gallery > *, .flow > .row');
    var seen = new Set();
    items.forEach(function (el) {
      if (seen.has(el) || el.closest('.hero') || el.closest('.sticky-switch')) return;
      seen.add(el);
      var p = el.parentElement, i = p ? Array.prototype.indexOf.call(p.children, el) : 0;
      el.classList.add('reveal');
      el.style.setProperty('--d', Math.min(i, 6) * 0.07 + 's');
    });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in-view'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('.reveal').forEach(function (el) { io.observe(el); });
    /* Belt and braces: content must never stay hidden. Anything that has reached the screen (or is
     * above it, after a jump to an anchor) is shown on every scroll, and everything is shown once the
     * page has been open a few seconds without the observer firing. */
    var sweep = function () {
      var h = innerHeight;
      $$('.reveal:not(.in-view)').forEach(function (el) { if (el.getBoundingClientRect().top < h * 0.98) el.classList.add('in-view'); });
    };
    addEventListener('scroll', sweep, { passive: true });
    addEventListener('load', sweep);
    setTimeout(sweep, 400);
  }

  /* ---- menu (phones) */
  var mb = $('.menu-btn'), nav = $('#nav');
  if (mb && nav) mb.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    mb.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  /* ---- inputs, per platform.
   * The game's own touch button art, key caps for keyboard and mouse, and Xbox-layout
   * button art for a controller (owner's request 661; rule 577 covers the game's own views). */
  var ART = '/play/frontend/ui/controls/';
  var b = function (n, label) {
    // the stick is two images in the game too: the ring, and the gold knob at 44% in its centre (touch.js)
    if (n === 'stick') return '<span class="b stick" role="img" aria-label="' + label + ' stick"><img src="' + ART + 'stick.png" alt="" width="44" height="44" loading="lazy"><img class="knob" src="' + ART + 'stick-thumb.png" alt="" width="20" height="20" loading="lazy"></span>';
    return '<img class="b" src="' + ART + n + '.png" alt="' + label + ' button" width="44" height="44" loading="lazy">';
  };
  var k = function (t) { return '<span class="k">' + t + '</span>'; };
  var w = function (t) { return '<span class="w">' + t + '</span>'; };
  var t = function (x) { return '<span class="t">' + x + '</span>'; };
  var then = '<span class="then" aria-label="then">›</span>', or = '<span class="or">OR</span>', plus = '<span class="then">+</span>';
  var INPUTS = {
    move: { touch: b('stick', 'Move') + t('drag on the left half'), kbd: k('W') + k('A') + k('S') + k('D') + or + k('←') + k('→') + k('↑') + k('↓'), pad: w('Left stick or D-pad') },
    jab: { touch: b('jab', 'Jab') + t('tap'), kbd: k('J') + or + k('LEFT CLICK'), pad: w('Left face button') },
    combo5: { touch: b('jab', 'Jab') + b('jab', 'Jab') + t('double-tap'), kbd: k('J') + k('J') + t('quickly') + or + k('DOUBLE CLICK'), pad: w('Right shoulder button') },
    kick: { touch: b('kick', 'Kick') + t('tap'), kbd: k('I') + or + k('RIGHT CLICK'), pad: w('Right face button') },
    backkick: { touch: t('drag away from the way he faces') + plus + b('kick', 'Kick'), kbd: k('A') + t('or') + k('D') + t('(away)') + plus + k('I'), pad: w('Stick away') + plus + w('Right face button') },
    uppercut: { touch: t('hold') + b('kick', 'Kick') + plus + b('jab', 'Jab'), kbd: k('K') + or + t('hold') + k('RIGHT CLICK') + plus + k('LEFT CLICK'), pad: w('Top face button') },
    air: { touch: b('jump', 'Jump') + then + b('jab', 'Jab') + t('or') + b('kick', 'Kick'), kbd: k('SPACE') + then + k('J') + t('or') + k('I'), pad: w('Bottom face button') + then + w('any attack') },
    grab: { touch: b('grab', 'Grab') + t('hold to carry, let go to throw'), kbd: k('E') + t('hold to carry, let go to throw'), pad: w('Left trigger') + t('hold, let go to throw') },
    beatdown: { touch: b('grab', 'Grab') + then + b('jab', 'Jab'), kbd: k('G') + or + k('E') + then + k('J'), pad: w('Right trigger') },
    fist: { touch: b('grab', 'Grab') + then + b('jab', 'Jab') + b('jab', 'Jab'), kbd: k('G') + then + k('J') + t('again, quickly'), pad: w('Right trigger') + then + w('Left face button') + t('quickly') },
    block: { touch: b('block', 'Block') + t('hold'), kbd: k('L') + or + k('SHIFT') + t('hold'), pad: w('Left shoulder button') + t('hold') },
    jump: { touch: b('jump', 'Jump') + t('tap'), kbd: k('SPACE'), pad: w('Bottom face button') },
    rush: { touch: t('flick sideways on the left half'), kbd: k('A') + k('A') + t('or') + k('D') + k('D') + t('double-tap'), pad: w('Double-tap a direction') },
    rushkick: { touch: t('flick') + then + b('kick', 'Kick'), kbd: k('D') + k('D') + then + k('I'), pad: w('Double-tap a direction') + then + w('Right face button') },
    rushjab: { touch: t('flick') + then + b('jab', 'Jab'), kbd: k('D') + k('D') + then + k('J'), pad: w('Double-tap a direction') + then + w('Left face button') },
    rushcombo: { touch: t('flick') + then + b('jab', 'Jab') + b('jab', 'Jab'), kbd: k('D') + k('D') + then + k('J') + k('J'), pad: w('Double-tap a direction') + then + w('Right shoulder button') },
    leap: { touch: t('flick') + then + b('jump', 'Jump') + then + b('kick', 'Kick'), kbd: k('D') + k('D') + then + k('SPACE') + then + k('I'), pad: w('Double-tap a direction') + then + w('Bottom face button') + then + w('attack') },
    ram: { touch: t('flick back, then forward'), kbd: k('A') + then + k('D') + t('quick tap back, then forward'), pad: w('Flick the stick back, then forward') },
    exec: { touch: b('grab', 'Grab') + t('at the boss, then on each ring'), kbd: k('E') + t('at the boss, then') + k('K') + t('on each ring'), pad: w('Left trigger') + t('at the boss, then') + w('Top face button') + t('on each ring') },
    wpn: { touch: b('jab', 'Jab'), kbd: k('J'), pad: w('Left face button') },
    wpn2: { touch: b('jab', 'Jab') + b('jab', 'Jab'), kbd: k('J') + k('J'), pad: w('Left face button twice') + or + w('Right shoulder button') },
    tornado: { touch: b('jab', 'Jab') + b('jab', 'Jab') + t('hold the second'), kbd: k('J') + k('J') + t('hold the second'), pad: w('Left face button twice, hold the second') },
    pickup: { touch: b('grab', 'Grab') + t('standing at it'), kbd: k('E') + t('standing at it'), pad: w('Left trigger') + t('standing at it') },
    throwW: { touch: b('grab', 'Grab') + t('while armed'), kbd: k('E') + t('while armed'), pad: w('Left trigger') + t('while armed') },
    pause: { touch: b('pause', 'Pause'), kbd: k('P') + or + k('ENTER'), pad: w('Start / menu button') },
    mute: { touch: t('Options › Audio'), kbd: k('M'), pad: t('Options › Audio') },
  };
  /* CONTROLLER, DRAWN (request 661): Xbox-layout button art made for the site (assets/img/pad/*.svg),
   * mapped exactly as game.js reads a standard pad: A 0 jump, B 1 kick, X 2 jab, Y 3 uppercut,
   * LB 4 block, RB 5 5-hit combo, LT 6 pick up / carry / throw / finisher, RT 7 grab (beat-down),
   * D-pad 12-15 or the left stick to move, Menu to pause. (The game itself still shows no pad glyphs.) */
  var PADART = '/assets/img/pad/';
  var pb = function (n, label) {
    var wide = n === 'lb' || n === 'rb';
    return '<img class="pb' + (wide ? ' wide' : '') + '" src="' + PADART + n + '.svg" alt="' + label + '" width="' + (wide ? 58 : 40) + '" height="' + (wide ? 36 : 40) + '" loading="lazy">';
  };
  var A = pb('a', 'A'), B = pb('b', 'B'), X = pb('x', 'X'), Y = pb('y', 'Y'), LB = pb('lb', 'LB'), RB = pb('rb', 'RB'),
    LT = pb('lt', 'LT'), RT = pb('rt', 'RT'), LS = pb('ls', 'Left stick'), DP = pb('dpad', 'D-pad'), MENU = pb('menu', 'Menu');
  var PAD = {
    move: LS + or + DP,
    jab: X,
    combo5: RB,
    kick: B,
    backkick: LS + t('away') + plus + B,
    uppercut: Y,
    air: A + then + X + t('or') + B,
    grab: LT + t('hold to carry, let go to throw'),
    beatdown: RT,
    fist: RT + then + X + t('quickly'),
    block: LB + t('hold'),
    jump: A,
    rush: LS + LS + t('double-tap'),
    rushkick: LS + LS + then + B,
    rushjab: LS + LS + then + X,
    rushcombo: LS + LS + then + RB,
    leap: LS + LS + then + A + then + B,
    ram: LS + t('back, then forward'),
    exec: LT + t('at the boss, then') + Y + t('on each ring'),
    wpn: X,
    wpn2: X + X + or + RB,
    tornado: X + X + t('hold the second'),
    pickup: LT + t('standing at it'),
    throwW: LT + t('while armed'),
    pause: MENU,
  };
  for (var pid in PAD) if (INPUTS[pid]) INPUTS[pid].pad = PAD[pid];
  var NAMES = { touch: 'Touch', kbd: 'Keyboard and mouse', pad: 'Controller' };
  function renderInputs(p) {
    $$('[data-in]').forEach(function (el) {
      var parts = el.getAttribute('data-in').split(' ');
      el.innerHTML = parts.map(function (id) { var x = INPUTS[id]; return x ? x[p] : ''; }).join('<span class="or">OR</span>');
      el.classList.add('in');
    });
    $$('[data-platform]').forEach(function (el) { el.hidden = el.getAttribute('data-platform').split(' ').indexOf(p) < 0; });
    $$('.switch button').forEach(function (bt) { bt.setAttribute('aria-pressed', bt.getAttribute('data-p') === p ? 'true' : 'false'); });
  }
  if ($('[data-in]') || $('.switch')) {
    var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    var plat = store.get('rr.site.platform') || (coarse ? 'touch' : 'kbd');
    if (!NAMES[plat]) plat = 'touch';
    $$('.switch').forEach(function (sw) {
      sw.innerHTML = Object.keys(NAMES).map(function (p) { return '<button type="button" data-p="' + p + '">' + NAMES[p] + '</button>'; }).join('');
      sw.addEventListener('click', function (e) {
        var bt = e.target.closest('button'); if (!bt) return;
        plat = bt.getAttribute('data-p'); store.set('rr.site.platform', plat); renderInputs(plat);
      });
    });
    renderInputs(plat);
  }

  /* ---- DOWNLOAD THE GAME (request 660). The game is an installable app: every site page links the
   * game's manifest (start_url /play/?app=1), so Chrome and Edge offer their install prompt right here.
   * iPhone and iPad get the two Safari steps; an installed copy just opens the game; anything else lands
   * on the help page's download section. Links keep their href, so they work without this script. */
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; });
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) || navigator.standalone;
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/media-sw.js', { scope: '/' }).catch(function () {});
  var sheet = null;
  function showSheet(html) {
    if (sheet) sheet.remove();
    sheet = document.createElement('div');
    sheet.className = 'dl-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-live', 'polite');
    sheet.innerHTML = html + '<div class="btns"><a class="btn" href="/play/">Play now</a><button class="btn ghost" type="button">Close</button></div>';
    sheet.querySelector('button').addEventListener('click', function () { sheet.remove(); sheet = null; });
    document.body.appendChild(sheet);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-download]');
    if (!a) return;
    if (standalone) { e.preventDefault(); location.href = '/play/'; return; }
    if (installEvt) {
      e.preventDefault();
      var ev = installEvt; installEvt = null;
      ev.prompt();
      ev.userChoice.then(function (c) {
        if (c && c.outcome === 'accepted') showSheet('<p><b>Installed.</b> Ratel Rage is on your home screen and in your apps.</p>');
      }).catch(function () {});
      return;
    }
    if (isIOS) { e.preventDefault(); showSheet('<p><b>On iPhone and iPad:</b> tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.</p>'); return; }
    // no prompt available (already installed, or a browser without one): the help page explains
  });
  // the help page's download section shows only the steps for this device
  var here = isIOS ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'desktop';
  $$('[data-device]').forEach(function (el) { el.classList.toggle('here', el.getAttribute('data-device') === here); });

  /* ---- story spoilers: off until the reader turns them on (decision 5) */
  var sp = $('#spoilers');
  if (sp) {
    var on = store.get('rr.site.spoilers') === '1';
    var apply = function () { document.body.classList.toggle('spoilers', on); sp.setAttribute('aria-pressed', on ? 'true' : 'false'); sp.textContent = on ? 'HIDE SPOILERS' : 'SHOW SPOILERS'; };
    sp.addEventListener('click', function () { on = !on; store.set('rr.site.spoilers', on ? '1' : '0'); apply(); });
    apply();
  }

  /* ---- leaderboards (Supabase get_leaderboard: display names, scores, grades, times; public by design) */
  var lb = $('#lb');
  if (lb) {
    var SB = 'https://xnnygfkzagqoxuhqervm.supabase.co', KEY = 'sb_publishable_-bUEkA2cHSVcg4g1qsLXSQ_kNw7MgWr';
    var lvl = $('#lb-level'), dif = $('#lb-diff'), body = $('#lb tbody'), note = $('#lb-note');
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var mmss = function (ms) { if (!ms) return '–'; var s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
    var load = function () {
      body.innerHTML = '<tr><td colspan="5" class="empty">Loading…</td></tr>';
      fetch(SB + '/rest/v1/rpc/get_leaderboard', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_level: +lvl.value, p_difficulty: dif.value, p_limit: 50 }) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (rows) {
          if (!rows.length) { body.innerHTML = '<tr><td colspan="5" class="empty">No scores here yet. Sign in in the game and be the first.</td></tr>'; return; }
          body.innerHTML = rows.map(function (r, i) {
            return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(r.display_name || 'Player') + '</td><td class="num">' + Number(r.score).toLocaleString() +
              '</td><td><b>' + esc(r.rank) + '</b></td><td class="num">' + mmss(r.time_ms) + '</td></tr>';
          }).join('');
        })
        .catch(function () { body.innerHTML = '<tr><td colspan="5" class="empty">The leaderboard could not be reached. Try again in a moment.</td></tr>'; });
      if (note) note.textContent = 'Level 0' + lvl.value + ' · ' + dif.value + ' · best score per player';
    };
    lvl.addEventListener('change', load); dif.addEventListener('change', load); load();
  }

  /* ---- billboard chooser (rr-ads /api/boards: price, free shares, 30-day views, seconds on screen, taps) */
  var bx = $('#boards');
  if (bx) {
    var ADS = 'https://rr-ads.kenechukwuuzongwa.workers.dev';
    var naira = function (n) { return '₦' + Number(n || 0).toLocaleString(); };
    var esc2 = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    fetch(ADS + '/api/boards').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (o) {
      var list = (o.boards || []).slice().sort(function (a, c) { return ((a.insights || {}).order || 0) - ((c.insights || {}).order || 0); });
      bx.innerHTML = list.map(function (bd) {
        var s = bd.insights || {}, open = bd.bookable && bd.freeToday > 0;
        var share = bd.shares > 1 ? naira(Math.round(bd.price / bd.shares)) + ' a week per share (' + bd.shares + ' shares), ' + naira(bd.price) + ' a week for the whole board' : naira(bd.price) + ' a week';
        return '<article class="board-card"><div class="art"><img src="/assets/img/boards/' + esc2(bd.id) + '.webp" alt="' + esc2(bd.name) + ' in the game" loading="lazy"></div>' +
          '<div class="body"><div><span class="pill' + (open ? '' : ' no') + '">' + (bd.bookable ? (bd.freeToday > 0 ? bd.freeToday + ' of ' + bd.shares + ' shares free today' : 'Fully booked today') : 'Reserved') + '</span></div>' +
          '<h3>' + esc2(bd.name) + '</h3>' +
          '<p class="dim" style="margin:0">' + esc2(s.place || bd.where) + (s.stretch ? ' · ' + esc2(s.stretch) : '') + '</p>' +
          '<div class="stats">' +
          '<div><b>' + (s.viewsPerDay || 0).toLocaleString() + '</b><span>views a day</span></div>' +
          '<div><b>' + (s.avgSeconds != null ? s.avgSeconds + ' s' : 'new') + '</b><span>on screen per view</span></div>' +
          '<div><b>' + (s.views30 || 0).toLocaleString() + '</b><span>views, 30 days</span></div>' +
          '<div><b>' + (s.tapRate || 0) + '%</b><span>views that tapped</span></div></div>' +
          '<p class="price" style="margin:0">' + share + '</p>' +
          (bd.bookable ? '<a class="btn" href="' + ADS + '/b/' + encodeURIComponent(bd.id) + '">Book this board</a>' : '<span class="dim">Not open for booking</span>') +
          '</div></article>';
      }).join('');
    }).catch(function () {
      bx.innerHTML = '<p class="empty">The board list could not be loaded right now. Open <a href="' + ADS + '">the booking site</a> directly.</p>';
    });
  }
})();
