/* RATEL RAGE — player accounts: guest first, cloud saves, account linking (request 378).
 *
 * OFF UNLESS CONFIGURED. With no project in supabase-config.js this file installs
 * an inert `window.RRAccount` and does nothing else: no script is fetched, no
 * request is made, and progress stays on the device (src/progress.js).
 *
 * WHAT IT DOES WHEN ON
 *   - Every player is signed in as a Supabase ANONYMOUS user the first time, with
 *     no screen in the way. The game never waits for it: progress.js records
 *     locally whatever happens here, and this file only syncs that record.
 *   - The session is kept in localStorage ('rr.auth') and refreshed by
 *     supabase-js, so a returning player is the same guest / account.
 *   - Cloud save = one JSON record (progress.js) in public.cloud_saves through
 *     save_progress()/load_progress(). Writes name the version they were based
 *     on; a stale write comes back as a conflict carrying the server copy, which
 *     is MERGED (progress.js merge is lossless) and written again. Nothing is
 *     overwritten, and a failed save leaves the local record as it was.
 *   - Guest -> account keeps the SAME user id: Google through linkIdentity(),
 *     email through updateUser({ email }) + the confirmation link, then a
 *     password. If that Google account / email already belongs to another
 *     account, nothing is changed and the player is offered to sign in to it,
 *     with an explicit choice about carrying this device's guest progress over.
 *   - Registered players' completed runs go to the validated leaderboard
 *     (start_run() at level start, submit_score() at completion).
 *   - Analytics: src/analytics.js events are forwarded to log_events() (skipped
 *     under Do Not Track / Global Privacy Control).
 *
 * The browser only ever holds the PUBLISHABLE key; a secret key is refused.
 * UI (request 613): the main menu's SIGN IN view (frontend.js) plus a small form sheet over it for
 * email and phone. Nothing is ever shown during gameplay or cutscenes. */
(function () {
  'use strict';
  var noop = { enabled: false, status: 'off', state: {}, open: function () {}, close: function () {}, on: function () {} };
  window.RRAccount = noop;

  var cfg = window.RR_SUPABASE || {};
  var BASE = String(cfg.url || '').trim().replace(/\/+$/, '');
  var KEY = String(cfg.anonKey || '').trim();
  var P = window.RRProgress;
  if (!BASE || !KEY || !P) return;

  function privileged(k) {
    if (/^sb_secret_/.test(k)) return true;
    try {
      var part = k.split('.')[1];
      if (!part) return false;
      var claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
      return claims && claims.role === 'service_role';
    } catch (e) { return false; }
  }
  if (privileged(KEY)) {
    console.error('[RRAccount] supabase-config.js holds a SECRET (service_role) key. Accounts are disabled. Use the publishable / anon key.');
    return;
  }

  // ------------------------------------------------------------- storage ----
  var ls = null, ss = null;
  try { ls = window.localStorage; } catch (e) { ls = null; }
  try { ss = window.sessionStorage; } catch (e) { ss = null; }
  var jget = function (s, k) { try { return s ? JSON.parse(s.getItem(k) || 'null') : null; } catch (e) { return null; } };
  var jset = function (s, k, v) { try { if (s) s.setItem(k, JSON.stringify(v)); } catch (e) {} };
  var jdel = function (s, k) { try { if (s) s.removeItem(k); } catch (e) {} };

  var WHO = 'rr.acct.who';          // { uid, anon } the identity this device last used
  var PENDING = 'rr.acct.pending';  // a sign-in / link that leaves the page and comes back
  var VER = 'rr.cloud.ver:';        // + uid: the cloud version the local record is based on
  var DIRTY = 'rr.cloud.dirty:';    // + uid: a save that has not reached the cloud yet
  var RUN = 'rr.run';               // sessionStorage: the leaderboard run of this page
  var SLOT = 'main';
  var native = !!(window.RR_WEB && window.RR_WEB.native);
  var googleOn = cfg.google !== false && !native;   // Google refuses embedded WebViews
  var redirectTo = String(cfg.redirectTo || '').trim() || (location.origin + location.pathname);

  // Adopt the last identity at once, so progress made before the network answers
  // lands in the right record (the session itself is restored below).
  var who = jget(ls, WHO);
  if (who && who.uid) P.setOwner(who.uid);

  // ------------------------------------------------------------- state ----
  var S = {
    status: 'connecting',   // connecting | offline | guest | registered | unavailable
    uid: null, anon: true, email: null, pendingEmail: null, provider: null, hasPassword: false,
    name: null, sync: 'idle', syncedAt: 0, message: null, view: 'home', score: null,
  };
  var listeners = [];
  var changed = function () { for (var i = 0; i < listeners.length; i++) { try { listeners[i](S); } catch (e) {} } render(); };
  var track = function (n, p) { try { if (window.RRAnalytics) window.RRAnalytics.track(n, p || {}); } catch (e) {} };

  // What the auth redirect brought back, read before supabase-js consumes it.
  var ret = (function () {
    var q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ''));
    var g = function (k) { return h.get(k) || q.get(k) || ''; };
    return { error: g('error'), code: g('error_code'), desc: g('error_description').replace(/\+/g, ' '),
      tokens: !!(h.get('access_token') || q.get('code')), type: g('type') };
  })();
  function cleanUrl() {
    try {
      var u = new URL(location.href), dirty = false;
      ['code', 'error', 'error_code', 'error_description', 'type'].forEach(function (k) {
        if (u.searchParams.has(k)) { u.searchParams.delete(k); dirty = true; }
      });
      if (/access_token|error|refresh_token/.test(u.hash)) { u.hash = ''; dirty = true; }
      if (dirty) history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }
  // An ERROR return must not reach supabase-js: for most errors it drops the
  // stored session, which would turn this guest into a new one. We read it
  // ourselves (readReturn), so strip it now. Token returns are left for it.
  if (ret.error || ret.code) cleanUrl();

  // ------------------------------------------------------------- client ----
  var sb = null, session = null;
  function timedFetch(input, init) {
    init = init || {};
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : 0;
    if (ctl && !init.signal) init.signal = ctl.signal;
    return fetch(input, init).finally(function () { clearTimeout(t); });
  }
  function loadLib() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
      var s = document.createElement('script');
      s.src = 'frontend/vendor/supabase/supabase.js';
      s.async = true;
      s.onload = function () { window.supabase && window.supabase.createClient ? resolve(window.supabase) : reject(new Error('supabase-js missing')); };
      s.onerror = function () { s.remove(); reject(new Error('supabase-js failed to load')); };
      document.head.appendChild(s);
    });
  }
  // supabase-js returns { data, error }; network failures throw. One shape for both.
  function call(p) {
    return Promise.resolve(p).then(function (r) { return r || {}; }, function (e) { return { error: e || new Error('failed') }; });
  }
  var rpc = function (name, args) { return call(sb.rpc(name, args)); };

  var booting = null;
  function boot() {
    if (booting) return booting;
    booting = (async function () {
      try {
        var lib = await loadLib();
        sb = lib.createClient(BASE, KEY, {
          auth: { storageKey: 'rr.auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
          global: { fetch: timedFetch },
        });
      } catch (e) {
        S.status = 'offline'; changed();
        booting = null;          // try again when the network is back
        return;
      }
      sb.auth.onAuthStateChange(function (event, s) {
        // Never call supabase from inside this callback (it holds the auth lock).
        setTimeout(function () { onSession(event, s); }, 0);
      });
      var r = await call(sb.auth.getSession());
      readReturn();
      cleanUrl();
      if (!(r.data && r.data.session)) ensureGuest();
    })();
    return booting;
  }

  function readReturn() {
    if (!ret.error && !ret.code) return;
    var pend = jget(ls, PENDING);
    var code = ret.code, desc = ret.desc;
    if (code === 'identity_already_exists' || /already (linked|exists|registered)/i.test(desc)) {
      S.view = pend && pend.kind === 'email' ? 'conflict-email' : 'conflict-google';
      S.conflictProvider = (pend && pend.method && pend.method !== 'email') ? pend.method : 'google';
      if (pend && pend.email) S.pendingEmail = pend.email;
    } else if (code === 'otp_expired' || /expired|invalid/i.test(desc)) {
      S.view = 'home';
      S.message = { bad: true, text: 'Link expired or used. Send a new one.' };
    } else if (ret.error === 'access_denied' && !code) {
      S.message = { bad: true, text: 'Sign-in cancelled.' };
    } else {
      S.message = { bad: true, text: 'Sign-in failed' + (desc ? ': ' + desc : '') + '.' };
    }
    jdel(ls, PENDING);
    S.autoOpen = true;
    track('account_error', { code: (code || ret.error || 'unknown').slice(0, 40) });
  }

  var guestTry = null;
  function ensureGuest() {
    if (guestTry || !sb) return guestTry;
    guestTry = (async function () {
      S.status = 'connecting'; changed();
      var r = await call(sb.auth.signInAnonymously());
      if (r.error) {
        var c = r.error.code || '';
        S.status = c === 'anonymous_provider_disabled' ? 'unavailable' : 'offline';
        changed();
      }
      guestTry = null;
    })();
    return guestTry;
  }

  // ------------------------------------------------------------ identity ----
  var adoptedThisPage = null;
  function onSession(event, s) {
    session = s || null;
    if (!s) {
      S.uid = null; S.status = sb ? 'connecting' : 'offline';
      if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') ensureGuest();
      changed();
      return;
    }
    if (event === 'PASSWORD_RECOVERY') { S.view = 'password'; S.autoOpen = true; }
    adopt(s.user);
    sendEvents();
  }

  function adopt(user) {
    if (!user) return;
    var prev = jget(ls, WHO);
    var pend = jget(ls, PENDING);
    if (pend && Date.now() - (pend.at || 0) > 3600e3) { jdel(ls, PENDING); pend = null; }
    var anon = !!user.is_anonymous;
    var mergeFrom = null;
    if (pend && pend.from && pend.from !== user.id) mergeFrom = pend.merge ? pend.from : null;
    else if (prev && prev.uid && prev.uid !== user.id && prev.anon && anon) mergeFrom = prev.uid;   // a lost guest session on this device
    var switching = P.owner !== user.id;
    P.setOwner(user.id, { mergeFrom: mergeFrom });

    if (prev && prev.uid === user.id && prev.anon && !anon) {
      var method = (user.app_metadata && user.app_metadata.provider) || 'email';
      track('account_linked', { method: method });
      S.message = { text: 'Account saved. Progress now syncs to any device.' };
    } else if (pend && pend.kind === 'signin' && pend.from !== user.id && !anon) {
      track('account_signed_in', { method: pend.method || 'email', merged: !!mergeFrom });
      S.message = { text: mergeFrom ? 'Signed in. Guest progress added.' : 'Signed in.' };
    }
    if (pend && (pend.from !== user.id || !anon)) jdel(ls, PENDING);
    jset(ls, WHO, { uid: user.id, anon: anon });

    S.uid = user.id; S.anon = anon;
    S.email = user.email || null;
    S.phone = user.phone || null;
    S.pendingEmail = user.new_email || S.pendingEmail || null;
    S.provider = (user.app_metadata && user.app_metadata.provider) || null;
    // A guest who confirmed an email has no password yet; one who signed in with a password has.
    S.hasPassword = !!(user.user_metadata && user.user_metadata.rr_pw) || !!jget(ls, 'rr.acct.pw:' + user.id);
    S.status = anon ? 'guest' : 'registered';
    if (S.view === 'sent' && !anon) S.view = S.hasPassword ? 'home' : 'password';
    if (switching || adoptedThisPage !== user.id) {
      adoptedThisPage = user.id;
      S.serverCopy = undefined;
      syncNow();
      loadProfile();
    }
    changed();
  }

  async function loadProfile() {
    if (!sb || !S.uid) return;
    var uid = S.uid;
    var r = await call(sb.from('profiles').select('display_name').eq('id', uid).maybeSingle());
    if (!r.error && r.data && uid === S.uid) { S.name = r.data.display_name; changed(); }
  }

  // ----------------------------------------------------------- cloud save ----
  var syncing = null, again = false, syncTimer = 0;
  function syncSoon(ms) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms == null ? 1500 : ms); }
  function syncNow() {
    if (!sb || !S.uid || !session) return Promise.resolve();
    if (syncing) { again = true; return syncing; }
    syncing = (async function () {
      var uid = S.uid;
      if (P.owner !== uid) return;
      S.sync = 'saving'; changed();
      try {
        var ver = +(ls && ls.getItem(VER + uid)) || 0;
        if (S.serverCopy === undefined) {
          var r = await rpc('load_progress', { p_slot: SLOT });
          if (r.error) throw r.error;
          if (uid !== S.uid) return;
          if (r.data && r.data.status === 'ok') { P.absorb(r.data.data); ver = r.data.version; S.serverCopy = r.data.data; }
          else { ver = 0; S.serverCopy = null; }
        }
        for (var i = 0; i < 4; i++) {
          var local = P.get();
          if (S.serverCopy && P.same(local, S.serverCopy)) break;
          if (!S.serverCopy && P.same(local, P.blank())) break;
          var w = await rpc('save_progress', { p_slot: SLOT, p_data: local, p_expected_version: ver });
          if (w.error) throw w.error;
          if (uid !== S.uid) return;
          if (w.data && w.data.status === 'ok') { ver = w.data.version; S.serverCopy = local; break; }
          // Another device saved first: merge its copy in (nothing is lost) and go again.
          ver = (w.data && w.data.version) || 0;
          S.serverCopy = (w.data && w.data.data) || null;
          if (S.serverCopy) P.absorb(S.serverCopy);
        }
        try { ls && ls.setItem(VER + uid, String(ver)); } catch (e) {}
        jdel(ls, DIRTY + uid);
        S.sync = 'saved'; S.syncedAt = Date.now();
      } catch (e) {
        jset(ls, DIRTY + uid, 1);       // the local record is untouched; try again later
        S.sync = navigator.onLine === false ? 'offline' : 'error';
      }
      changed();
    })().finally(function () {
      syncing = null;
      if (again) { again = false; syncSoon(400); }
    });
    return syncing;
  }

  P.on(function (type, d) {
    if (type === 'change') {
      if (d && d.reason !== 'cloud' && d.reason !== 'owner' && S.uid) syncSoon(1500);
      return;
    }
    if (type !== 'record' || !d) return;
    if (d.type === 'level_start') {
      jdel(ss, RUN);
      if (sb && session && S.status === 'registered') {
        rpc('start_run', { p_level: d.level, p_difficulty: d.difficulty }).then(function (r) {
          if (!r.error && r.data) jset(ss, RUN, { id: r.data, level: d.level, difficulty: d.difficulty });
        });
      }
    } else if (d.type === 'level_complete') {
      var run = jget(ss, RUN), x = d.data || {};
      jdel(ss, RUN);
      if (run && run.level === d.level && S.status === 'registered' && x.parts && sb) {
        rpc('submit_score', { p_run_id: run.id, p_score: Math.round(x.score || 0), p_parts: x.parts,
          p_time_ms: Math.round((x.time || 0) * 1000), p_kos: x.kos || 0, p_rank: x.rank || 'D' }).then(function (r) {
          S.score = r.error ? { status: 'error' } : r.data;
          track('score_submitted', { status: (S.score && S.score.status) || 'error' });
        });
      }
    }
  });

  window.addEventListener('online', function () {
    if (!sb) { boot(); return; }
    if (!session) { ensureGuest(); return; }
    if (S.uid && jget(ls, DIRTY + S.uid)) syncSoon(300);
    sendEvents();
  });
  window.addEventListener('offline', function () { if (S.status !== 'off') { S.sync = S.uid ? 'offline' : S.sync; changed(); } });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !sb || !session) return;
    if (S.uid && jget(ls, DIRTY + S.uid)) syncSoon(300);
    // An email confirmed in another tab or on another device: pick up the change.
    if (S.anon && S.pendingEmail) refreshUser();
  });
  async function refreshUser() {
    if (!sb || !session) return;
    var r = await call(sb.auth.refreshSession());
    if (!r.error && r.data && r.data.session) adopt(r.data.session.user);
  }

  // ------------------------------------------------------------ analytics ----
  var dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  var evq = [];
  // A batch that could not be delivered (offline, server error) goes back in the
  // queue, which never holds more than the newest 200 events; a refused one
  // (4xx, e.g. the server's rate limit) is dropped.
  function requeue(chunk) {
    evq = chunk.concat(evq);
    if (evq.length > 200) evq.splice(0, evq.length - 200);
  }
  function sendEvents() {
    if (!session || !evq.length) return;
    var token = session.access_token;
    while (evq.length) {
      var chunk = evq.splice(0, 50);
      try {
        fetch(BASE + '/rest/v1/rpc/log_events', {
          method: 'POST', keepalive: true,
          headers: { apikey: KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_events: chunk }),
        }).then(function (res) { if (res.status >= 500) requeue(this); }.bind(chunk), function () { requeue(this); }.bind(chunk));
      } catch (e) { requeue(chunk); return; }
    }
  }
  if (!dnt && window.RRAnalytics && window.RRAnalytics.addSink) {
    window.RRAnalytics.addSink(function (batch) {
      for (var i = 0; i < batch.length; i++) evq.push({ e: batch[i].e, t: batch[i].t, sid: batch[i].sid, p: batch[i].p });
      if (evq.length > 200) evq.splice(0, evq.length - 200);
      sendEvents();
    });
  }

  // -------------------------------------------------------------- actions ----
  var busy = false;
  function act(fn) {
    return async function () {
      if (busy) return;
      busy = true; S.message = null; render();
      try { await fn.apply(null, arguments); }
      catch (e) { S.message = { bad: true, text: friendly(e) }; }
      busy = false; changed();
    };
  }
  function friendly(e) {
    var c = (e && e.code) || '', m = (e && e.message) || '';
    if (e && (e.name === 'AbortError' || /fetch|network|Failed to/i.test(m))) return 'No connection. Progress is safe here; try again online.';
    if (c === 'email_exists' || c === 'user_already_exists') return 'That email already has an account.';
    if (c === 'invalid_credentials') return 'Wrong email or password.';
    if (c === 'email_not_confirmed') return 'Confirm your email first (see our link).';
    if (c === 'weak_password') return 'Password too weak (8+ characters).';
    if (c === 'over_email_send_rate_limit' || c === 'over_request_rate_limit') return 'Too many tries. Wait a minute.';
    if (c === 'manual_linking_disabled') return 'Account linking is off right now.';
    if (c === 'reauthentication_needed') return 'Sign in again to change password.';
    if (c === 'validation_failed' || /invalid.*email/i.test(m)) return 'Invalid email.';
    return m ? m.slice(0, 160) : 'Something went wrong.';
  }
  var guestHasProgress = function () { return !P.same(P.get(), P.blank()); };

  var linkGoogle = act(async function () {
    jset(ls, PENDING, { kind: 'link', from: S.uid, merge: true, method: 'google', at: Date.now() });
    var r = await call(sb.auth.linkIdentity({ provider: 'google', options: { redirectTo: redirectTo } }));
    if (r.error) { jdel(ls, PENDING); throw r.error; }
    S.message = { text: 'Opening Google…' };
  });
  var signInGoogle = act(async function (merge) {
    jset(ls, PENDING, { kind: 'signin', from: S.anon ? S.uid : null, merge: !!merge, method: 'google', at: Date.now() });
    var r = await call(sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo } }));
    if (r.error) { jdel(ls, PENDING); throw r.error; }
    S.message = { text: 'Opening Google…' };
  });
  var saveWithEmail = act(async function (email) {
    email = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw { code: 'validation_failed' };
    var r = await call(sb.auth.updateUser({ email: email }, { emailRedirectTo: redirectTo }));
    if (r.error) {
      if (r.error.code === 'email_exists' || r.error.code === 'user_already_exists' || /already/i.test(r.error.message || '')) {
        S.pendingEmail = email; S.view = 'conflict-email'; return;
      }
      throw r.error;
    }
    jset(ls, PENDING, { kind: 'email', from: S.uid, merge: true, email: email, at: Date.now() });
    S.pendingEmail = email; S.view = 'sent';
  });
  var signInEmail = act(async function (email, password, merge) {
    email = String(email || '').trim();
    jset(ls, PENDING, { kind: 'signin', from: S.anon ? S.uid : null, merge: !!merge, method: 'email', at: Date.now() });
    var r = await call(sb.auth.signInWithPassword({ email: email, password: String(password || '') }));
    if (r.error) { jdel(ls, PENDING); throw r.error; }
    if (r.data && r.data.user) { jset(ls, 'rr.acct.pw:' + r.data.user.id, 1); S.hasPassword = true; }
    S.view = 'home';
  });
  var setPassword = act(async function (pw) {
    pw = String(pw || '');
    if (pw.length < 8) throw { code: 'weak_password' };
    var r = await call(sb.auth.updateUser({ password: pw, data: { rr_pw: true } }));
    if (r.error) throw r.error;
    S.hasPassword = true; S.view = 'home';
    S.message = { text: 'Password set.' };
  });
  var forgot = act(async function (email) {
    var r = await call(sb.auth.resetPasswordForEmail(String(email || '').trim(), { redirectTo: redirectTo }));
    if (r.error) throw r.error;
    S.message = { text: 'If that email has an account, a reset link is coming.' };
  });
  var rename = act(async function (name) {
    name = String(name || '').trim();
    if (!/^[A-Za-z0-9 _-]{3,20}$/.test(name)) throw { message: '3–20 letters, numbers, spaces, - or _.' };
    var r = await call(sb.from('profiles').update({ display_name: name }).eq('id', S.uid));
    if (r.error) throw r.error;
    S.name = name; S.message = { text: 'Name saved.' };
  });
  var signOut = act(async function () {
    await syncNow();
    jset(ls, WHO, null);
    // The game's own best-score keys belong to whoever is signed in; they are in
    // the account's record already, and the next guest must not inherit them.
    P.DIFFS.forEach(function (d) { jdel(ls, 'ror.best.l1.' + d); });
    P.setOwner('device');            // anything played before the new guest exists stays with it
    await call(sb.auth.signOut({ scope: 'local' }));
    S.view = 'home';
    S.message = { text: 'Signed out. Progress stays in your account; this device is now a guest.' };
  });
  var retry = act(async function () {
    if (!sb) await boot();
    else if (!session) await ensureGuest();
    else await syncNow();
  });

  // ------------------------------------------------------------------- UI ----
  /* REQUEST 613. The SAVE YOUR PROGRESS chip, its level-cleared strip and the old account window are
   * gone. Signing in lives on the main menu's SIGN IN view (frontend.js drawSignIn), drawn on the
   * canvas in landscape like every other menu screen. What is left here is a compact FORM SHEET for
   * the two methods that need typing (email, phone) and the follow-ups a sign-in can need (a sent
   * link, a password, an account that already exists). It opens over the SIGN IN view only. */
  var MENU_PHASES = ['signin', 'menu'];
  var overlay = null, panel = null, open = false;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };

  /* Which sign-in methods the project really has switched on, read from the auth server itself, so a
   * button lights up the day its provider is configured in Supabase, with no game update.
   * Google and Facebook both refuse embedded WebViews, so the Android app leaves them off. */
  var providers = { google: false, facebook: false, phone: false, email: false, read: false };
  function readProviders() {
    return fetch(BASE + '/auth/v1/settings', { headers: { apikey: KEY } }).then(function (r) { return r.json(); }).then(function (j) {
      var x = (j && j.external) || {};
      providers = { google: !!x.google && googleOn, facebook: !!x.facebook && !native, phone: !!x.phone, email: x.email !== false, read: true };
      changed();
    }, function () {});
  }
  readProviders();

  /* Google / Facebook. A guest LINKS the provider (same user id, so the progress on this device stays
   * theirs); a registered player, or a guest whose provider account already exists, signs in to it. */
  var signInOAuth = act(async function (provider, signInOnly) {
    if (S.anon && !signInOnly) {
      jset(ls, PENDING, { kind: 'link', from: S.uid, merge: true, method: provider, at: Date.now() });
      var r = await call(sb.auth.linkIdentity({ provider: provider, options: { redirectTo: redirectTo } }));
      if (!r.error) return;
      jdel(ls, PENDING);
      if (r.error.code !== 'manual_linking_disabled') throw r.error;
    }
    jset(ls, PENDING, { kind: 'signin', from: S.anon ? S.uid : null, merge: true, method: provider, at: Date.now() });
    var s = await call(sb.auth.signInWithOAuth({ provider: provider, options: { redirectTo: redirectTo } }));
    if (s.error) { jdel(ls, PENDING); throw s.error; }
  });
  /* Phone: a code by SMS. A guest adds the number to its own account (phone_change); a number that
   * already has an account is signed in to instead (sms). */
  var phoneSend = act(async function (phone) {
    phone = String(phone || '').replace(/[^\d+]/g, '');
    if (phone.charAt(0) !== '+') phone = '+' + phone;
    if (!/^\+\d{8,15}$/.test(phone)) throw { message: 'Enter the number with its country code, e.g. +234…' };
    S.pendingPhone = phone; S.phoneMode = 'signin';
    if (S.anon) {
      var r = await call(sb.auth.updateUser({ phone: phone }));
      if (!r.error) { S.phoneMode = 'link'; S.view = 'phone-code'; return; }
      if (!(r.error.code === 'phone_exists' || /already/i.test(r.error.message || ''))) throw r.error;
    }
    jset(ls, PENDING, { kind: 'signin', from: S.anon ? S.uid : null, merge: true, method: 'phone', at: Date.now() });
    var s = await call(sb.auth.signInWithOtp({ phone: phone }));
    if (s.error) { jdel(ls, PENDING); throw s.error; }
    S.view = 'phone-code';
  });
  var phoneVerify = act(async function (code) {
    var r = await call(sb.auth.verifyOtp({ phone: S.pendingPhone, token: String(code || '').trim(), type: S.phoneMode === 'link' ? 'phone_change' : 'sms' }));
    if (r.error) throw r.error;
    S.view = 'done';
  });

  function buildUi() {
    var css = document.createElement('style');
    /* The game's menu language: smoked glass, hairlines, SHARP corners (rule of request 603), the green
     * accent (request 613), dim white type, Uni Sans. */
    css.textContent = [
      '.rr-acct-overlay{position:fixed;inset:0;z-index:90;display:none;place-items:center;background:rgba(2,4,6,.58);',
      'touch-action:manipulation;-webkit-user-select:text;user-select:text}',
      '.rr-acct-panel{width:min(400px,90vw);max-height:92vh;overflow:auto;padding:20px 22px 16px;border-radius:0;color:rgba(255,255,255,.78);',
      'background:linear-gradient(180deg,rgba(16,22,30,.96),rgba(7,10,15,.97));border:1px solid rgba(255,255,255,.12);border-top:2px solid #36d67e;',
      'box-shadow:0 18px 60px rgba(0,0,0,.6);font:400 16px/1.45 "RR Uni","RR Pixel",monospace;letter-spacing:.04em}',
      '.rr-acct-panel h2{margin:0 0 .7em;font:400 15px/1.2 "RR Uni Heavy","RR Pixel Bold","RR Pixel",monospace;letter-spacing:.2em;color:rgba(255,255,255,.9)}',
      '.rr-acct-panel p{margin:.3em 0 .8em;color:rgba(255,255,255,.62)}.rr-acct-panel .muted{color:rgba(255,255,255,.42);font-size:13px}',
      '.rr-acct-panel .msg{padding:.5em .7em;border-radius:0;background:rgba(54,214,126,.10);border:1px solid rgba(54,214,126,.4);margin:.1em 0 .8em;font-size:14px}',
      '.rr-acct-panel .msg.bad{background:rgba(255,90,90,.10);border-color:rgba(255,90,90,.45)}',
      '.rr-acct-panel input[type=email],.rr-acct-panel input[type=password],.rr-acct-panel input[type=text],.rr-acct-panel input[type=tel]{width:100%;box-sizing:border-box;margin:.2em 0 .55em;',
      'padding:.7em .8em;border-radius:0;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.35);color:#fff;font:400 16px "RR Uni","RR Pixel",monospace;outline:none}',
      '.rr-acct-panel input:focus{border-color:#36d67e}',
      '.rr-acct-panel label.chk{display:flex;gap:.6em;align-items:flex-start;margin:.1em 0 .7em;font-size:13px;color:rgba(255,255,255,.55)}',
      '.rr-acct-panel .btn{display:block;width:100%;margin:.4em 0;padding:.75em;border-radius:0;border:1px solid rgba(255,255,255,.18);',
      'background:rgba(255,255,255,.04);color:rgba(255,255,255,.82);font:400 15px "RR Uni Heavy","RR Uni","RR Pixel",monospace;letter-spacing:.16em;cursor:pointer}',
      '.rr-acct-panel .btn.primary{background:#36d67e;color:#04140b;border-color:#36d67e}',
      '.rr-acct-panel .btn.ghost{background:transparent;color:rgba(255,255,255,.55)}',
      '.rr-acct-panel .btn:disabled{opacity:.45;cursor:default}',
      '.rr-acct-panel .links{display:flex;justify-content:space-between;gap:1em;margin:.3em 0 .2em}',
      '.rr-acct-panel .link{all:unset;cursor:pointer;color:rgba(255,255,255,.55);font-size:13px;letter-spacing:.06em}',
      '.rr-acct-panel .link:hover,.rr-acct-panel .link:focus{color:#7be3a6}',
      '.rr-acct-panel .x{all:unset;float:right;cursor:pointer;font:400 18px/1 "RR Uni","RR Pixel",monospace;color:rgba(255,255,255,.5);padding:2px 4px}',
      /* PHONE (request 615: the form turns the screen to PORTRAIT so typing is easy): docked to the top and
       * kept to the room the keyboard leaves; in landscape (a screen that cannot turn), the headings step aside. */
      '.rr-acct-overlay.phone{place-items:start center;padding:8px 0 0}',
      '.rr-acct-overlay.phone .rr-acct-panel{width:min(420px,94vw);padding:16px 18px 14px}',
      'body.rr-acct-open .rotate-hint{display:none!important}',
      '.rr-acct-overlay.tight .rr-acct-panel>p,.rr-acct-overlay.tight .rr-acct-panel h2{display:none}',
      '.rr-acct-overlay.tight .rr-acct-panel{padding-top:8px}.rr-acct-overlay.tight .rr-acct-panel .btn{margin:.2em 0;padding:.55em}',
    ].join('');
    document.head.appendChild(css);

    overlay = document.createElement('div');
    overlay.className = 'rr-acct-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    panel = document.createElement('div');
    panel.className = 'rr-acct-panel';
    overlay.appendChild(panel);
    overlay.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { closePanel(); return; }
      var b = e.target.closest('[data-a]');
      if (b && !b.disabled) onAction(b.getAttribute('data-a'));
    });
    overlay.addEventListener('submit', function (e) { e.preventDefault(); var f = e.target.getAttribute('data-a'); if (f) onAction(f); });
    document.body.appendChild(overlay);
  }

  // Keys typed in the sheet must never reach the menus (frontend.js listens on
  // window in the capture phase; this listener is registered before it).
  ['keydown', 'keyup', 'keypress'].forEach(function (t) {
    window.addEventListener(t, function (e) {
      if (!open) return;
      if (e.type === 'keydown' && e.key === 'Escape') closePanel();
      e.stopImmediatePropagation();
    }, true);
  });

  function onAction(a) {
    var v = function (n) { var el = panel.querySelector('[name="' + n + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; };
    if (a === 'close') return closePanel();
    if (a === 'oauth-signin') return signInOAuth(S.conflictProvider || 'google', true);
    if (a === 'email-save') return saveWithEmail(v('email'));
    if (a === 'email-signin') return signInEmail(v('email'), v('password'), v('merge'));
    if (a === 'password') return setPassword(v('password'));
    if (a === 'forgot-send') return forgot(v('email'));
    if (a === 'phone-send') return phoneSend(v('phone'));
    if (a === 'phone-verify') return phoneVerify(v('code'));
    if (a.indexOf('view:') === 0) { S.view = a.slice(5); S.message = null; render(); focusFirst(); }
  }

  function render() {
    if (!panel) return;
    if (!open) return;
    // a finished sign-in closes the sheet: the SIGN IN view behind it shows the account
    if (S.view === 'home' || S.view === 'done') { closePanel(); return; }
    var on = S.status === 'guest' || S.status === 'registered';
    var dis = busy || !on ? ' disabled' : '';
    var h = '<button class="x" data-a="close" aria-label="Close">✕</button>';
    var msg = S.message ? '<div class="msg' + (S.message.bad ? ' bad' : '') + '">' + esc(S.message.text) + '</div>' : '';
    if (!on) msg = msg || '<div class="msg bad">' + (S.status === 'connecting' ? 'Connecting…' : 'No connection.') + '</div>';
    var mergeBox = S.anon && guestHasProgress()
      ? '<label class="chk"><input type="checkbox" name="merge" checked> <span>Keep this device’s progress</span></label>' : '';
    var v = S.view;
    if (v === 'email') {
      h += '<h2>EMAIL</h2>' + msg + mergeBox
        + '<form data-a="email-signin"><input type="email" name="email" autocomplete="email" placeholder="Email" value="' + esc(S.pendingEmail || '') + '">'
        + '<input type="password" name="password" autocomplete="current-password" placeholder="Password">'
        + '<button class="btn primary" type="submit"' + dis + '>SIGN IN</button></form>'
        + '<div class="links"><button class="link" data-a="view:forgot">Forgot password?</button>'
        + (S.anon ? '<button class="link" data-a="view:email-new">New account</button>' : '') + '</div>';
    } else if (v === 'email-new') {
      h += '<h2>NEW ACCOUNT</h2>' + msg + '<p>We email you a link. Your progress is kept.</p>'
        + '<form data-a="email-save"><input type="email" name="email" autocomplete="email" placeholder="Email" value="' + esc(S.pendingEmail || '') + '">'
        + '<button class="btn primary" type="submit"' + dis + '>SEND LINK</button></form>'
        + '<button class="btn ghost" data-a="view:email">BACK</button>';
    } else if (v === 'sent') {
      h += '<h2>CHECK YOUR EMAIL</h2>' + msg + '<p>Link sent to ' + esc(S.pendingEmail) + '.</p>'
        + '<p class="muted">Nothing? Check spam.</p>'
        + '<button class="btn primary" data-a="close">OK</button><button class="btn ghost" data-a="view:email-new">SEND AGAIN</button>';
    } else if (v === 'forgot') {
      h += '<h2>RESET PASSWORD</h2>' + msg + '<form data-a="forgot-send"><input type="email" name="email" autocomplete="email" placeholder="Email" value="' + esc(S.pendingEmail || '') + '">'
        + '<button class="btn primary" type="submit"' + dis + '>SEND LINK</button></form><button class="btn ghost" data-a="view:email">BACK</button>';
    } else if (v === 'password') {
      h += '<h2>SET PASSWORD</h2>' + msg
        + '<form data-a="password"><input type="password" name="password" autocomplete="new-password" placeholder="8+ characters">'
        + '<button class="btn primary" type="submit"' + dis + '>SAVE</button></form><button class="btn ghost" data-a="close">LATER</button>';
    } else if (v === 'phone') {
      h += '<h2>PHONE NUMBER</h2>' + msg + mergeBox
        + '<form data-a="phone-send"><input type="tel" name="phone" autocomplete="tel" inputmode="tel" placeholder="+234 801 234 5678" value="' + esc(S.pendingPhone || '') + '">'
        + '<button class="btn primary" type="submit"' + dis + '>SEND CODE</button></form>';
    } else if (v === 'phone-code') {
      h += '<h2>ENTER CODE</h2>' + msg + '<p>Sent to ' + esc(S.pendingPhone) + '.</p>'
        + '<form data-a="phone-verify"><input type="text" name="code" autocomplete="one-time-code" inputmode="numeric" maxlength="8" placeholder="123456">'
        + '<button class="btn primary" type="submit"' + dis + '>VERIFY</button></form>'
        + '<button class="btn ghost" data-a="view:phone">CHANGE NUMBER</button>';
    } else if (v === 'conflict-google' || v === 'conflict-email') {
      var what = v === 'conflict-google' ? 'That account' : esc(S.pendingEmail || 'That email');
      h += '<h2>ACCOUNT EXISTS</h2>' + msg + '<p>' + what + ' already has a profile. Nothing changed here.</p>' + mergeBox
        + (v === 'conflict-google' && providers[S.conflictProvider || 'google'] ? '<button class="btn primary" data-a="oauth-signin"' + dis + '>SIGN IN TO IT</button>'
          : '<button class="btn primary" data-a="view:email"' + dis + '>SIGN IN TO IT</button>')
        + '<button class="btn ghost" data-a="close">STAY AS GUEST</button>';
    } else { closePanel(); return; }
    // A background update (sync status, token refresh) re-renders the sheet:
    // whatever the player is typing, and where, must survive it.
    if (panel.getAttribute('data-view') === v && panel.__html === h) return;   // nothing new to show
    panel.__html = h;
    var keep = {}, focused = document.activeElement, fname = null, sel = null;
    if (panel.getAttribute('data-view') === v) {
      panel.querySelectorAll('input[name]').forEach(function (i) { keep[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
      if (focused && panel.contains(focused) && focused.name) {
        fname = focused.name;
        try { sel = [focused.selectionStart, focused.selectionEnd]; } catch (e) { sel = null; }
      }
    }
    panel.innerHTML = h;
    panel.setAttribute('data-view', v);
    panel.querySelectorAll('input[name]').forEach(function (i) {
      if (!(i.name in keep)) return;
      if (i.type === 'checkbox') i.checked = keep[i.name]; else i.value = keep[i.name];
    });
    if (fname) {
      var f = panel.querySelector('[name="' + fname + '"]');
      if (f) { f.focus(); try { if (sel && sel[0] != null) f.setSelectionRange(sel[0], sel[1]); } catch (e) {} }
    }
  }
  /* THE PHONE KEYBOARD. The game runs fullscreen in landscape, where Android does not shrink the page for
   * the keyboard and a 360 px tall screen leaves almost no room above it. So on a phone the form turns the
   * screen to PORTRAIT while it is open (request 615; the app through RatelHost.setPortrait, a browser
   * through the orientation lock) and back to landscape when it closes. The SIGN IN view itself stays
   * landscape. Docked to the top, the sheet keeps to the room the keyboard leaves. */
  var phoneUi = function () {
    try { return window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600; }
    catch (e) { return false; }
  };
  var typing = false;
  function dock(on) {
    document.body.classList.toggle('rr-acct-open', on);
    var phone = phoneUi();
    overlay.classList.toggle('phone', on && phone);
    if (!phone) return;
    try {
      if (window.RatelHost && typeof window.RatelHost.setPortrait === 'function') { window.RatelHost.setPortrait(!!on); return; }
    } catch (e) {}
    try {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock(on ? 'portrait' : 'landscape').catch(function () {});
    } catch (e) {}
  }
  function fitPanel() {
    if (!open || !panel) return;
    if (!overlay.classList.contains('phone')) { overlay.classList.remove('tight'); panel.style.maxHeight = ''; overlay.style.paddingTop = ''; return; }
    var vv = window.visualViewport;
    var H = window.innerHeight, h = vv ? vv.height : H, top = vv ? vv.offsetTop : 0;
    var portrait = H >= window.innerWidth;
    overlay.classList.toggle('tight', typing && !portrait);
    var room = typing ? Math.min(h, H * (portrait ? 0.55 : 0.40)) : h;
    overlay.style.paddingTop = (top + 6) + 'px';
    panel.style.maxHeight = Math.max(120, room - 12) + 'px';
    var f = typing && document.activeElement;
    if (f && panel.contains(f) && f.scrollIntoView) { try { f.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
  }
  ['resize', 'orientationchange'].forEach(function (t) { window.addEventListener(t, function () { setTimeout(fitPanel, 60); }); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitPanel);
  document.addEventListener('focusin', function (e) {
    if (!open || !panel || !panel.contains(e.target) || !/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.type === 'checkbox') return;
    typing = true; setTimeout(fitPanel, 80); setTimeout(fitPanel, 400);
  });
  document.addEventListener('focusout', function () {
    setTimeout(function () {
      var a = document.activeElement;
      typing = !!(open && panel && a && panel.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== 'checkbox');
      fitPanel();
    }, 60);
  });

  function focusFirst() { setTimeout(function () { var i = panel && panel.querySelector('input:not([type=checkbox])'); if (i && i.focus) i.focus(); }, 30); }

  function openPanel(view) {
    if (!overlay) return;
    S.view = view || (S.view && S.view !== 'home' && S.view !== 'done' ? S.view : 'email');
    S.message = null;
    open = true;
    overlay.style.display = 'grid';
    dock(true);
    fitPanel();
    if (S.anon && S.pendingEmail && session) refreshUser();
    render();
    focusFirst();
  }
  function closePanel() {
    if (!overlay || !open) return;
    open = false;
    overlay.style.display = 'none';
    dock(false);
    typing = false;
    panel.innerHTML = '';                 // typed passwords do not linger in the DOM
    panel.removeAttribute('data-view');
    panel.__html = null;
    if (S.view !== 'sent') S.view = 'home';
    S.message = null;
    try { var c = document.getElementById('game'); c && c.focus({ preventScroll: true }); } catch (e) {}
  }

  // The sheet belongs to the menus: it closes if the game leaves them, and a sign-in that came back
  // from a redirect with something to say (an existing account, a failed link) opens it there.
  function menuVisible() {
    try {
      var R = window.__ror, M = window.__rorMenu;
      return !!(R && R.frontActive && M && MENU_PHASES.indexOf(M.phase) >= 0);
    } catch (e) { return false; }
  }
  function watch() {
    if (!overlay) return;
    var vis = menuVisible();
    if (!vis && open) closePanel();
    if (vis && S.autoOpen) {
      S.autoOpen = false;
      // a choice to make opens the sheet; a plain outcome (cancelled, expired) is a line on the menu
      if (/^(conflict-|password)/.test(S.view || '')) openPanel(S.view);
      else if (S.message) { S.notice = S.message.text; S.message = null; }
    }
  }

  function start() {
    buildUi();
    setInterval(watch, 400);
    boot();
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  // ------------------------------------------------------ control layouts ----
  /* CLOUD CONTROL LAYOUTS (request 597): "store my control configs to a file in cloud and load it
   * back anytime, like PUBG Mobile". One more record in public.cloud_saves (slot 'controls', the
   * same owner-only table and save/load RPCs as the progress save), holding the saved layout slots.
   * Guests have an account too (anonymous sign-in), so this works before registering; registering
   * keeps the same user id, so the layouts follow the player onto every device they sign in on. */
  var CTL_SLOT = 'controls';
  function cloudReady() {
    return Promise.resolve(sb ? null : boot()).then(function () {
      if (S.uid && session) return true;
      // a guest sign-in still in flight: give it a moment
      return new Promise(function (res) { setTimeout(function () { res(!!(sb && S.uid && session)); }, 1500); });
    });
  }
  function loadControls() {
    return cloudReady().then(function (ok) {
      if (!ok) return { error: 'offline' };
      return rpc('load_progress', { p_slot: CTL_SLOT }).then(function (r) {
        if (r.error) return { error: r.error.message || 'failed' };
        var d = r.data || {};
        return { ok: true, data: d.status === 'ok' ? d.data : null, version: d.version || 0 };
      });
    });
  }
  // `change(record)` returns the new record; re-run on a newer copy if another device saved first.
  function saveControls(change) {
    return cloudReady().then(async function (ok) {
      if (!ok) return { error: 'offline' };
      for (var i = 0; i < 3; i++) {
        var cur = await loadControls();
        if (cur.error) return cur;
        var next = change(cur.data || { v: 1, slots: [] });
        var w = await rpc('save_progress', { p_slot: CTL_SLOT, p_data: next, p_expected_version: cur.version });
        if (w.error) return { error: w.error.message || 'failed' };
        if (w.data && w.data.status === 'ok') return { ok: true, data: next };
      }
      return { error: 'conflict' };
    });
  }

  // ------------------------------------------------------------------ API ----
  window.RRAccount = {
    loadControls: loadControls,
    saveControls: saveControls,
    enabled: true,
    get status() { return S.status; },
    get state() { return JSON.parse(JSON.stringify(S)); },
    open: function (view) { openPanel(view); },
    close: closePanel,
    /* For the SIGN IN view (request 613). Cheap to read every frame. */
    get providers() { return providers; },
    get info() { return { status: S.status, anon: S.anon, email: S.email, phone: S.phone || null, name: S.name, provider: S.provider, hasPassword: S.hasPassword, sync: S.sync, busy: busy, open: open }; },
    takeNotice: function () { var n = S.notice; S.notice = null; return n || null; },
    signIn: function (method) {
      if (method === 'google' || method === 'facebook') return signInOAuth(method);
      openPanel(method === 'phone' ? 'phone' : 'email');
      return Promise.resolve();
    },
    signOut: function () { return signOut(); },
    on: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    syncNow: syncNow,
    getLeaderboard: function (level, difficulty, limit) {
      if (!sb) return Promise.resolve({ error: new Error('offline') });
      return rpc('get_leaderboard', { p_level: level || 1, p_difficulty: difficulty || 'NORMAL', p_limit: limit || 20 });
    },
    get client() { return sb; },
  };
})();
