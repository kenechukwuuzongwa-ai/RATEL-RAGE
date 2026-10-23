/* RATEL RAGE — optional, privacy-light analytics.
 *
 * OFF UNLESS CONFIGURED: with no `endpoint` in analytics-config.js this file
 * installs a no-op `window.RRAnalytics` and sends nothing. When on, it never
 * blocks or breaks the game: every path is wrapped, the queue is bounded, and
 * a failing endpoint just loses events.
 *
 * WHAT IS SENT (see docs/WEB_DEPLOYMENT.md for the event list):
 *   per event   name, time, session id, sequence number, small numeric/string props
 *   per batch   build, platform (web / android-app), device category, browser and
 *               OS family + major version, language subtag, window size, DPR,
 *               device memory class, CPU cores
 *   optional    an anonymous random player id (localStorage), only when
 *               `anonymousId` is on and the browser does not send Do Not Track /
 *               Global Privacy Control.
 * NOT sent: names, emails, accounts, precise location, full user-agent strings,
 * stack traces with URLs beyond the file name.
 *
 * Game code reports through `window.RRAnalytics.track(name, props)`. */
(function () {
  'use strict';
  var noop = { enabled: false, track: function () {}, flush: function () {}, setAnonymousId: function () {}, addSink: function () {}, recent: [] };
  window.RRAnalytics = noop;
  try {
    var cfg = window.RR_ANALYTICS || {};
    var endpoint = typeof cfg.endpoint === 'string' ? cfg.endpoint.trim() : '';
    // A configured Supabase project is the other destination (src/account.js
    // registers a sink that writes to public.gameplay_events via log_events()).
    var sbc = window.RR_SUPABASE || {};
    var supabaseSink = !!(sbc.url && sbc.anonKey) && cfg.supabaseEvents !== false;
    if (!endpoint && !supabaseSink) return;

    var ss = null, ls = null;
    try { ss = window.sessionStorage; } catch (e) { ss = null; }
    try { ls = window.localStorage; } catch (e) { ls = null; }
    var get = function (s, k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } };
    var set = function (s, k, v) { try { if (s) s.setItem(k, v); } catch (e) {} };
    var rid = function () {
      try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
      var a = new Uint8Array(16);
      try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < 16; i++) a[i] = Math.random() * 256; }
      return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    };

    // A SESSION is this tab: it survives the game's own reloads (RETRY / QUIT
    // reload the page), so a retry is counted inside the session it belongs to.
    var sid = get(ss, 'rr.sid'), resumed = !!sid;
    if (!sid) { sid = rid(); set(ss, 'rr.sid', sid); set(ss, 'rr.sst', String(Date.now())); }
    var sessionStart = +get(ss, 'rr.sst') || Date.now();

    // Sampling is decided once per session.
    var sampled = get(ss, 'rr.smp');
    if (sampled === null) {
      var rate = typeof cfg.sampleRate === 'number' ? cfg.sampleRate : 1;
      sampled = Math.random() < rate ? '1' : '0';
      set(ss, 'rr.smp', sampled);
    }
    if (sampled !== '1') return;

    var dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
    var aid = null;
    var setAnonymousId = function (on) {
      if (on && !dnt) { aid = get(ls, 'rr.aid'); if (!aid) { aid = rid(); set(ls, 'rr.aid', aid); } }
      else { aid = null; try { if (ls) ls.removeItem('rr.aid'); } catch (e) {} }
    };
    setAnonymousId(cfg.anonymousId !== false);

    var ua = navigator.userAgent || '';
    var major = function (re) { var m = ua.match(re); return m ? m[1] : ''; };
    var browser = /Edg\//.test(ua) ? 'edge ' + major(/Edg\/(\d+)/)
      : /OPR\//.test(ua) ? 'opera ' + major(/OPR\/(\d+)/)
      : /SamsungBrowser\//.test(ua) ? 'samsung ' + major(/SamsungBrowser\/(\d+)/)
      : /Firefox\//.test(ua) ? 'firefox ' + major(/Firefox\/(\d+)/)
      : /CriOS\//.test(ua) ? 'chrome-ios ' + major(/CriOS\/(\d+)/)
      : /Chrome\//.test(ua) ? (/; wv\)/.test(ua) ? 'webview ' : 'chrome ') + major(/Chrome\/(\d+)/)
      : /Safari\//.test(ua) ? 'safari ' + major(/Version\/(\d+)/)
      : 'other';
    var os = /Android/.test(ua) ? 'android ' + major(/Android (\d+)/)
      : /iPhone|iPad|iPod/.test(ua) ? 'ios ' + major(/OS (\d+)_/)
      : /Windows/.test(ua) ? 'windows' : /CrOS/.test(ua) ? 'chromeos'
      : /Mac OS X/.test(ua) ? (navigator.maxTouchPoints > 1 ? 'ipados' : 'macos')
      : /Linux/.test(ua) ? 'linux' : 'other';
    var device = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) || (/Mac OS X/.test(ua) && navigator.maxTouchPoints > 1)
      ? 'tablet' : /Mobi|iPhone|iPod|Android/.test(ua) ? 'mobile' : 'desktop';
    var native = !!(window.RR_WEB && window.RR_WEB.native);
    var context = function () {
      return {
        build: (window.RR_WEB && window.RR_WEB.build) || 'dev',
        platform: native ? 'android-app' : 'web',
        device: device, browser: browser, os: os,
        lang: String(navigator.language || '').split('-')[0],
        win: Math.round(window.innerWidth) + 'x' + Math.round(window.innerHeight),
        dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
        mem: navigator.deviceMemory || null,
        cores: navigator.hardwareConcurrency || null,
      };
    };

    var queue = [], seq = +get(ss, 'rr.seq') || 0, recent = [];
    var MAX_QUEUE = 300;
    // CLIENT RATE LIMIT: at most 100 events in any minute; the rest are dropped
    // and counted (the server enforces its own limit too).
    var RATE = 100, windowStart = Date.now(), inWindow = 0, dropped = 0;
    var sinks = [];
    var clean = function (p) {
      var o = {};
      if (!p || typeof p !== 'object') return o;
      for (var k in p) {
        if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
        var v = p[k];
        if (typeof v === 'number') o[k] = isFinite(v) ? Math.round(v * 1000) / 1000 : null;
        else if (typeof v === 'boolean' || v === null) o[k] = v;
        else if (typeof v === 'string') o[k] = v.slice(0, 200);
      }
      return o;
    };
    var track = function (name, props) {
      try {
        var nowMs = Date.now();
        if (nowMs - windowStart >= 60000) {
          var d = dropped;
          windowStart = nowMs; inWindow = 0; dropped = 0;
          if (d) track('events_dropped', { count: d });   // the new window's first event
        }
        if (++inWindow > RATE) { dropped++; return; }
        var ev ={ e: String(name).slice(0, 40), t: Date.now(), sid: sid, n: ++seq, p: clean(props) };
        if (aid) ev.aid = aid;
        set(ss, 'rr.seq', String(seq));
        if (queue.length < MAX_QUEUE) queue.push(ev);
        recent.push(ev); if (recent.length > 50) recent.shift();
      } catch (e) {}
    };
    var send = function (beacon) {
      if (!queue.length) return;
      var batch = queue.splice(0, 100);
      var ctx = context();
      for (var i = 0; i < sinks.length; i++) { try { sinks[i](batch, ctx); } catch (e) {} }
      if (!endpoint) return;
      var body;
      try { body = JSON.stringify({ v: 1, ctx: ctx, events: batch }); } catch (e) { return; }
      try {
        // text/plain keeps it a "simple" request: no CORS preflight, beacon-safe.
        if (beacon && navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }))) return;
        if (window.fetch) {
          fetch(endpoint, { method: 'POST', body: body, keepalive: true, mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
        }
      } catch (e) {}
    };
    var flush = function () { try { send(true); } catch (e) {} };

    // ---- automatic events
    track(resumed ? 'session_resume' : 'session_start', { reload: resumed });
    var duration = function () { return Math.round((Date.now() - sessionStart) / 1000); };
    setInterval(function () {
      if (document.visibilityState === 'visible') track('session_ping', { seconds: duration() });
      send(false);
    }, 60000);
    setInterval(function () { send(false); }, 15000);
    var bye = function () { track('session_ping', { seconds: duration(), hidden: true }); flush(); };
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') bye(); });
    window.addEventListener('pagehide', bye);

    var errors = 0;
    var base = function (u) { try { return String(u || '').split('?')[0].split('/').slice(-2).join('/'); } catch (e) { return ''; } };
    window.addEventListener('error', function (e) {
      if (++errors > 20) return;
      var t = e && e.target;
      if (t && t !== window && (t.src || t.href)) track('asset_error', { file: base(t.src || t.href) });
      else track('js_error', { msg: String((e && e.message) || 'error').slice(0, 200), file: base(e && e.filename), line: (e && e.lineno) || 0 });
    }, true);
    window.addEventListener('unhandledrejection', function (e) {
      if (++errors > 20) return;
      var r = e && e.reason;
      track('js_error', { msg: String((r && r.message) || r || 'rejection').slice(0, 200), kind: 'promise' });
    });

    // Load timing, read off the game's own markers.
    var t0 = Date.now(), bootSent = false, worldSent = false;
    var poll = setInterval(function () {
      try {
        if (!bootSent && window.__rorBootMs) { bootSent = true; track('perf_boot', { ms: window.__rorBootMs }); }
        var R = window.__ror;
        if (!worldSent && R && R.worldReady) { worldSent = true; track('perf_world', { ms: Math.round(performance.now()) }); }
        if ((bootSent && worldSent) || Date.now() - t0 > 180000) clearInterval(poll);
      } catch (e) { clearInterval(poll); }
    }, 1000);

    // Frame rate: one summary a minute while the tab is visible (max 15 a session).
    var frames = 0, slow = 0, last = 0, winStart = 0, fpsReports = 0;
    var tick = function (now) {
      if (last) { frames++; if (now - last > 50) slow++; }
      last = now;
      if (!winStart) winStart = now;
      if (now - winStart >= 60000 && fpsReports < 15) {
        var p = { fps: frames * 1000 / (now - winStart), slow_frames: slow };
        try { if (performance.memory) p.heap_mb = Math.round(performance.memory.usedJSHeapSize / 1048576); } catch (e) {}
        try { var R = window.__ror; if (R && R.frontActive === false) p.in_game = true; } catch (e) {}
        track('perf_fps', p); fpsReports++;
        frames = 0; slow = 0; winStart = now;
      }
      requestAnimationFrame(tick);
    };
    document.addEventListener('visibilitychange', function () { last = 0; winStart = 0; frames = 0; slow = 0; });
    requestAnimationFrame(tick);

    var addSink = function (fn) { if (typeof fn === 'function') sinks.push(fn); };
    window.RRAnalytics = { enabled: true, track: track, flush: flush, setAnonymousId: setAnonymousId, addSink: addSink, recent: recent,
      get dropped() { return dropped; } };
  } catch (e) {
    window.RRAnalytics = noop;
  }
})();
