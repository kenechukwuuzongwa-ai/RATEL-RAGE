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

  /* ---- menu (phones) */
  var mb = $('.menu-btn'), nav = $('#nav');
  if (mb && nav) mb.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    mb.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  /* ---- inputs, per platform.
   * The game's own touch button art (rule 577: no console glyphs anywhere), key caps
   * for keyboard and mouse, and plain words for a controller. */
  var ART = '/play/frontend/ui/controls/';
  var b = function (n, label) { return '<img class="b" src="' + ART + n + '.png" alt="' + label + ' button" width="44" height="44" loading="lazy">'; };
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
        var share = bd.shares > 1 ? naira(Math.round(bd.price / bd.shares)) + ' a month per share (' + bd.shares + ' shares), ' + naira(bd.price) + ' for the whole board' : naira(bd.price) + ' a month';
        return '<article class="board-card"><div class="art"><img src="/assets/img/boards/' + esc2(bd.id) + '.webp" alt="' + esc2(bd.name) + ' in the game" loading="lazy"></div>' +
          '<div class="body"><div><span class="pill' + (open ? '' : ' no') + '">' + (bd.bookable ? (bd.freeToday > 0 ? bd.freeToday + ' of ' + bd.shares + ' shares free today' : 'Fully booked today') : 'Reserved') + '</span></div>' +
          '<h3>' + esc2(bd.name) + '</h3>' +
          '<p class="dim" style="margin:0">' + esc2(s.place || bd.where) + (s.stretch ? ' · ' + esc2(s.stretch) : '') + '</p>' +
          (s.scene ? '<p style="margin:0">' + esc2(s.scene) + '</p>' : '') +
          '<div class="stats">' +
          '<div><b>' + (s.viewsPerDay || 0).toLocaleString() + '</b><span>views a day</span></div>' +
          '<div><b>' + (s.avgSeconds != null ? s.avgSeconds + ' s' : 'new') + '</b><span>on screen per view</span></div>' +
          '<div><b>' + (s.views30 || 0).toLocaleString() + '</b><span>views, 30 days</span></div>' +
          '<div><b>' + (s.tapRate || 0) + '%</b><span>views that tapped</span></div></div>' +
          '<p class="dim" style="margin:0;font-size:13px">Print area ' + bd.face.w + ' × ' + bd.face.h + ' (upload ' + bd.upload.w + ' × ' + bd.upload.h + ' px)</p>' +
          '<p class="price" style="margin:0">' + share + '</p>' +
          (bd.bookable ? '<a class="btn" href="' + ADS + '/b/' + encodeURIComponent(bd.id) + '">Book this board</a>' : '<span class="dim">Not open for booking</span>') +
          '</div></article>';
      }).join('');
    }).catch(function () {
      bx.innerHTML = '<p class="empty">The board list could not be loaded right now. Open <a href="' + ADS + '">the booking site</a> directly.</p>';
    });
  }
})();
