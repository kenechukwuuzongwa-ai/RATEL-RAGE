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
 * UI: a small chip on the menu screens and a panel over the menu. Neither is
 * ever shown during gameplay, cutscenes or the briefing. */
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
  var NUDGE = 'rr.acct.nudge';      // 1 = show the "save your progress" prompt on the menu
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
      if (pend && pend.email) S.pendingEmail = pend.email;
    } else if (code === 'otp_expired' || /expired|invalid/i.test(desc)) {
      S.view = 'home';
      S.message = { bad: true, text: 'That link has expired or was already used. Nothing was changed. You can send a new one.' };
    } else if (ret.error === 'access_denied' && !code) {
      S.message = { bad: true, text: 'Sign-in was cancelled. Nothing was changed.' };
    } else {
      S.message = { bad: true, text: 'Sign-in did not finish' + (desc ? ': ' + desc : '') + '. Nothing was changed.' };
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
      S.message = { text: 'Account saved. Your progress now goes with you to any device.' };
      jdel(ls, NUDGE);
    } else if (pend && pend.kind === 'signin' && pend.from !== user.id && !anon) {
      track('account_signed_in', { method: pend.method || 'email', merged: !!mergeFrom });
      S.message = { text: mergeFrom ? 'Signed in. This device\'s guest progress was added to your account.' : 'Signed in.' };
    }
    if (pend && (pend.from !== user.id || !anon)) jdel(ls, PENDING);
    jset(ls, WHO, { uid: user.id, anon: anon });

    S.uid = user.id; S.anon = anon;
    S.email = user.email || null;
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
      if (S.status !== 'registered' && !jget(ls, NUDGE + '.off')) jset(ls, NUDGE, 1);
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
    if (e && (e.name === 'AbortError' || /fetch|network|Failed to/i.test(m))) return 'No connection. Your progress is safe on this device; try again when you are online.';
    if (c === 'email_exists' || c === 'user_already_exists') return 'That email already has an account.';
    if (c === 'invalid_credentials') return 'Wrong email or password.';
    if (c === 'email_not_confirmed') return 'Confirm your email first: open the link we sent you.';
    if (c === 'weak_password') return 'Choose a stronger password (at least 8 characters).';
    if (c === 'over_email_send_rate_limit' || c === 'over_request_rate_limit') return 'Too many tries. Wait a minute and try again.';
    if (c === 'manual_linking_disabled') return 'Linking accounts is switched off for this game right now.';
    if (c === 'reauthentication_needed') return 'For your security, sign in again before changing the password.';
    if (c === 'validation_failed' || /invalid.*email/i.test(m)) return 'That email address does not look right.';
    return m ? m.slice(0, 160) : 'Something went wrong. Nothing was changed.';
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
    S.message = { text: 'Password set. Sign in with your email on any device.' };
  });
  var forgot = act(async function (email) {
    var r = await call(sb.auth.resetPasswordForEmail(String(email || '').trim(), { redirectTo: redirectTo }));
    if (r.error) throw r.error;
    S.message = { text: 'If that email has an account, a reset link is on its way.' };
  });
  var rename = act(async function (name) {
    name = String(name || '').trim();
    if (!/^[A-Za-z0-9 _-]{3,20}$/.test(name)) throw { message: 'Names are 3–20 letters, numbers, spaces, - or _.' };
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
    S.message = { text: 'Signed out. Your account\'s progress is in the cloud; this device is a new guest now.' };
  });
  var retry = act(async function () {
    if (!sb) await boot();
    else if (!session) await ensureGuest();
    else await syncNow();
  });

  // ------------------------------------------------------------------- UI ----
  var MENU_PHASES = ['menu', 'levelSelect', 'options', 'extras'];
  var chip = null, overlay = null, panel = null, open = false, toastShown = false;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };

  function buildUi() {
    var css = document.createElement('style');
    css.textContent = [
      '.rr-acct-chip{position:fixed;z-index:65;display:none;align-items:center;gap:.5em;padding:.45em .9em;border-radius:999px;',
      'border:1px solid rgba(255,138,52,.55);background:rgba(8,11,18,.78);color:#fff;font:700 12px/1.2 Montserrat,"Segoe UI",sans-serif;',
      'letter-spacing:.08em;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);touch-action:manipulation}',
      '.rr-acct-chip .dot{width:.6em;height:.6em;border-radius:50%;background:#7a8396}',
      '.rr-acct-chip.ok .dot{background:#5fd38a}.rr-acct-chip.warn .dot{background:#ffb347}',
      '.rr-acct-chip.nudge{border-color:#ffe45e;box-shadow:0 0 0 0 rgba(255,228,94,.6);animation:rrAcctPulse 1.8s ease-out infinite}',
      '@keyframes rrAcctPulse{0%{box-shadow:0 0 0 0 rgba(255,228,94,.55)}80%,100%{box-shadow:0 0 0 12px rgba(255,228,94,0)}}',
      '.rr-acct-toast{position:fixed;z-index:65;display:none;max-width:300px;padding:.7em .9em;border-radius:10px;background:rgba(8,11,18,.92);',
      'border:1px solid rgba(255,228,94,.5);color:#fff;font:600 12px/1.45 Montserrat,"Segoe UI",sans-serif}',
      '.rr-acct-toast button{all:unset;cursor:pointer;color:#ffe45e;font-weight:800;margin-left:.6em}',
      '.rr-acct-overlay{position:fixed;inset:0;z-index:90;display:none;place-items:center;background:rgba(3,4,7,.62);',
      'touch-action:manipulation;-webkit-user-select:text;user-select:text}',
      '.rr-acct-panel{width:min(420px,92vw);max-height:92vh;overflow:auto;padding:22px 22px 18px;border-radius:14px;color:#e9edf5;',
      'background:linear-gradient(180deg,rgba(24,30,46,.97),rgba(10,13,21,.97));border:1px solid rgba(255,138,52,.45);',
      'box-shadow:0 18px 60px rgba(0,0,0,.6);font:500 14px/1.5 Montserrat,"Segoe UI",sans-serif}',
      '.rr-acct-panel h2{margin:0 0 .4em;font:900 18px/1.2 Montserrat,"Segoe UI",sans-serif;letter-spacing:.12em;color:#ffe45e}',
      '.rr-acct-panel p{margin:.35em 0 .8em}.rr-acct-panel .muted{color:#9aa3b5;font-size:12px}',
      '.rr-acct-panel .msg{padding:.55em .7em;border-radius:8px;background:rgba(95,211,138,.12);border:1px solid rgba(95,211,138,.4);margin:.2em 0 .9em}',
      '.rr-acct-panel .msg.bad{background:rgba(255,90,90,.12);border-color:rgba(255,90,90,.45)}',
      '.rr-acct-panel input[type=email],.rr-acct-panel input[type=password],.rr-acct-panel input[type=text]{width:100%;margin:.25em 0 .6em;',
      'padding:.65em .75em;border-radius:8px;border:1px solid #3a4358;background:#0b0f18;color:#fff;font:600 15px Montserrat,"Segoe UI",sans-serif}',
      '.rr-acct-panel label.chk{display:flex;gap:.6em;align-items:flex-start;margin:.2em 0 .8em;font-size:13px}',
      '.rr-acct-panel .btn{display:block;width:100%;margin:.45em 0;padding:.75em;border-radius:9px;border:1px solid rgba(255,138,52,.7);',
      'background:rgba(255,138,52,.16);color:#fff;font:800 13px Montserrat,"Segoe UI",sans-serif;letter-spacing:.1em;cursor:pointer}',
      '.rr-acct-panel .btn.primary{background:#ff8a34;color:#140a02;border-color:#ff8a34}',
      '.rr-acct-panel .btn.ghost{background:transparent;border-color:#3a4358;color:#c9d0de}',
      '.rr-acct-panel .btn:disabled{opacity:.45;cursor:default}',
      '.rr-acct-panel .link{all:unset;cursor:pointer;color:#ffb37a;font-weight:700;font-size:13px}',
      '.rr-acct-panel .x{all:unset;float:right;cursor:pointer;font:800 18px/1 Montserrat,sans-serif;color:#9aa3b5;padding:2px 6px}',
      '.rr-acct-panel .row{display:flex;gap:.5em}.rr-acct-panel .row>*{flex:1}',
      /* PHONE (request 405): the window is docked to the TOP and sized to the room above the keyboard. */
      '.rr-acct-overlay.phone{place-items:start center;padding:8px 0 0}',
      '.rr-acct-overlay.phone .rr-acct-panel{width:min(420px,94vw);padding:16px 18px 14px}',
      'body.rr-acct-open .rotate-hint{display:none!important}',
      /* …and where it could not turn (landscape, keyboard up) the explanation steps aside for the field and its button. */
      '.rr-acct-overlay.tight .rr-acct-panel>p,.rr-acct-overlay.tight .rr-acct-panel h2{display:none}',
      '.rr-acct-overlay.tight .rr-acct-panel{padding-top:10px}.rr-acct-overlay.tight .rr-acct-panel .btn{margin:.2em 0;padding:.6em}',
    ].join('');
    document.head.appendChild(css);

    chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'rr-acct-chip';
    chip.setAttribute('aria-label', 'Player account');
    chip.addEventListener('click', function (e) { e.stopPropagation(); openPanel(); });
    chip.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    document.body.appendChild(chip);

    toast = document.createElement('div');
    toast.className = 'rr-acct-toast';
    toast.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    document.body.appendChild(toast);

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
  var toast = null;

  // Keys typed in the panel must never reach the menus (frontend.js listens on
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
    if (a === 'retry') return retry();
    if (a === 'google-link') return linkGoogle();
    if (a === 'google-signin') return signInGoogle(v('merge'));
    if (a === 'email-save') return saveWithEmail(v('email'));
    if (a === 'email-signin') return signInEmail(v('email'), v('password'), v('merge'));
    if (a === 'password') return setPassword(v('password'));
    if (a === 'forgot-send') return forgot(v('email'));
    if (a === 'rename') return rename(v('name'));
    if (a === 'signout') return signOut();
    if (a.indexOf('view:') === 0) { S.view = a.slice(5); S.message = null; render(); focusFirst(); }
  }

  function syncLine() {
    if (S.status === 'offline') return 'Offline: progress is kept on this device and backs up when you are online.';
    if (S.status === 'unavailable') return 'Cloud saves are not available right now. Progress is kept on this device.';
    if (S.status === 'connecting') return 'Connecting…';
    if (S.sync === 'saving') return 'Cloud save: saving…';
    if (S.sync === 'saved') return 'Cloud save: up to date.';
    if (S.sync === 'offline') return 'Cloud save: waiting for a connection. Nothing is lost.';
    if (S.sync === 'error') return 'Cloud save: could not reach the server. Progress is safe on this device.';
    return 'Cloud save: ready.';
  }

  function render() {
    if (!chip) return;
    var nudge = S.status === 'guest' && !!jget(ls, NUDGE);
    chip.className = 'rr-acct-chip' + (S.status === 'registered' && S.sync !== 'error' ? ' ok' : '')
      + (S.status === 'offline' || S.sync === 'error' || S.sync === 'offline' ? ' warn' : '') + (nudge ? ' nudge' : '');
    chip.innerHTML = '<span class="dot"></span><span>' + esc(
      S.status === 'registered' ? (S.name || 'ACCOUNT').toUpperCase()
        : S.status === 'guest' ? (nudge ? 'SAVE YOUR PROGRESS' : 'GUEST · SAVE PROGRESS')
          : S.status === 'connecting' ? 'CONNECTING…' : 'OFFLINE') + '</span>';
    if (!open) return;
    var on = S.status === 'guest' || S.status === 'registered';
    var dis = busy || !on ? ' disabled' : '';
    var h = '<button class="x" data-a="close" aria-label="Close">✕</button>';
    var msg = S.message ? '<div class="msg' + (S.message.bad ? ' bad' : '') + '">' + esc(S.message.text) + '</div>' : '';
    var mergeBox = S.anon && guestHasProgress()
      ? '<label class="chk"><input type="checkbox" name="merge" checked> <span>Add this device\'s guest progress to that account. Untick to keep them separate. Nothing is deleted either way.</span></label>' : '';
    var v = S.view;
    if (v === 'home') {
      if (S.status === 'registered') {
        h += '<h2>YOUR ACCOUNT</h2>' + msg + '<p>Signed in' + (S.email ? ' as <b>' + esc(S.email) + '</b>' : S.provider ? ' with ' + esc(S.provider) : '') + '.</p>'
          + '<p class="muted">' + esc(syncLine()) + '</p>'
          + '<form data-a="rename"><label class="muted">Name on the leaderboard</label><div class="row"><input type="text" name="name" maxlength="20" value="' + esc(S.name || '') + '">'
          + '<button class="btn ghost" style="flex:0 0 auto;width:auto;margin:.25em 0 .6em" data-a="rename" type="button"' + dis + '>SAVE</button></div></form>'
          + (S.email && !S.hasPassword ? '<button class="btn" data-a="view:password"' + dis + '>SET A PASSWORD</button>' : '')
          + '<button class="btn ghost" data-a="signout"' + dis + '>SIGN OUT</button>';
      } else {
        h += '<h2>SAVE YOUR PROGRESS</h2>' + msg
          + '<p>You are playing as a guest' + (S.name ? ' (<b>' + esc(S.name) + '</b>)' : '') + '. Create an account to keep your progress on any device and get on the leaderboard. Optional, and the game never waits for it.</p>'
          + '<p class="muted">' + esc(syncLine()) + '</p>'
          + (S.pendingEmail ? '<p class="muted">Waiting for you to confirm <b>' + esc(S.pendingEmail) + '</b>.</p>' : '')
          + (googleOn ? '<button class="btn primary" data-a="google-link"' + dis + '>CONTINUE WITH GOOGLE</button>' : '')
          + '<button class="btn' + (googleOn ? '' : ' primary') + '" data-a="view:email"' + dis + '>SAVE WITH EMAIL</button>'
          + (on ? '' : '<button class="btn ghost" data-a="retry"' + (busy ? ' disabled' : '') + '>TRY AGAIN</button>')
          + '<p style="margin-top:1em">Already have an account? <button class="link" data-a="view:signin">SIGN IN</button></p>';
      }
    } else if (v === 'email') {
      h += '<h2>SAVE WITH EMAIL</h2>' + msg + '<p>We will email you a link. Open it to confirm, then choose a password. You keep everything you have played as a guest.</p>'
        + '<form data-a="email-save"><input type="email" name="email" autocomplete="email" placeholder="you@example.com" value="' + esc(S.pendingEmail || '') + '">'
        + '<button class="btn primary" type="submit"' + dis + '>SEND LINK</button></form>'
        + '<button class="btn ghost" data-a="view:home">BACK</button>';
    } else if (v === 'sent') {
      h += '<h2>CHECK YOUR EMAIL</h2>' + msg + '<p>We sent a link to <b>' + esc(S.pendingEmail) + '</b>. Open it to confirm your account. You can keep playing in the meantime.</p>'
        + '<p class="muted">No email? Check spam, or send it again.</p>'
        + '<button class="btn" data-a="view:email">SEND AGAIN</button><button class="btn ghost" data-a="close">KEEP PLAYING</button>';
    } else if (v === 'signin') {
      h += '<h2>SIGN IN</h2>' + msg + mergeBox
        + (googleOn ? '<button class="btn primary" data-a="google-signin"' + dis + '>SIGN IN WITH GOOGLE</button><p class="muted" style="text-align:center">or</p>' : '')
        + '<form data-a="email-signin"><input type="email" name="email" autocomplete="email" placeholder="Email" value="' + esc(S.pendingEmail || '') + '">'
        + '<input type="password" name="password" autocomplete="current-password" placeholder="Password">'
        + '<button class="btn' + (googleOn ? '' : ' primary') + '" type="submit"' + dis + '>SIGN IN WITH EMAIL</button></form>'
        + '<p><button class="link" data-a="view:forgot">Forgot password?</button></p>'
        + '<button class="btn ghost" data-a="view:home">BACK</button>';
    } else if (v === 'forgot') {
      h += '<h2>RESET PASSWORD</h2>' + msg + '<form data-a="forgot-send"><input type="email" name="email" autocomplete="email" placeholder="Email" value="' + esc(S.pendingEmail || '') + '">'
        + '<button class="btn primary" type="submit"' + dis + '>SEND RESET LINK</button></form><button class="btn ghost" data-a="view:signin">BACK</button>';
    } else if (v === 'password') {
      h += '<h2>CHOOSE A PASSWORD</h2>' + msg + '<p>So you can sign in with ' + esc(S.email || 'your email') + ' on any device.</p>'
        + '<form data-a="password"><input type="password" name="password" autocomplete="new-password" placeholder="At least 8 characters">'
        + '<button class="btn primary" type="submit"' + dis + '>SAVE PASSWORD</button></form><button class="btn ghost" data-a="view:home">LATER</button>';
    } else if (v === 'conflict-google' || v === 'conflict-email') {
      var what = v === 'conflict-google' ? 'That Google account' : '<b>' + esc(S.pendingEmail || 'That email') + '</b>';
      h += '<h2>ACCOUNT ALREADY EXISTS</h2>' + msg + '<p>' + what + ' already belongs to a Ratel Rage account. <b>Nothing was changed</b>: you are still the same guest, with the same progress.</p>'
        + '<p>Sign in to that account instead?</p>' + mergeBox
        + (v === 'conflict-google' && googleOn ? '<button class="btn primary" data-a="google-signin"' + dis + '>SIGN IN WITH GOOGLE</button>'
          : '<button class="btn primary" data-a="view:signin"' + dis + '>SIGN IN WITH EMAIL</button>')
        + '<button class="btn ghost" data-a="view:home">KEEP PLAYING AS GUEST</button>';
    }
    // A background update (sync status, token refresh) re-renders the panel:
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
  /* ============================================ THE PHONE KEYBOARD (request 405)
   *
   * The game runs fullscreen in landscape, and in fullscreen Android does NOT
   * shrink the page when the keyboard opens: it just covers the bottom ~60% of a
   * screen that is only ~360 px tall, and a centred window had its fields right
   * under it. So on a phone the account window is VERTICAL: the screen turns to
   * portrait while it is open (the app through RatelHost.setPortrait, a browser
   * through the orientation lock it already uses for landscape) and turns back
   * when it closes. It is also docked to the top and, while a field has focus,
   * kept to the room the keyboard leaves — which is what still saves it where
   * the screen cannot be turned (an older APK, a browser that refuses the lock). */
  var phoneUi = function () {
    try { return window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600; }
    catch (e) { return false; }
  };
  var typing = false;
  function goVertical(on) {
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
    /* What the keyboard leaves, when the page cannot tell us: in fullscreen the
     * viewport does not shrink, so while a field has focus assume the keyboard's
     * share (about 45% of a portrait screen, 60% of a landscape one). */
    var portrait = H >= window.innerWidth;
    overlay.classList.toggle('tight', typing && !portrait);
    var room = typing ? Math.min(h, H * (portrait ? 0.55 : 0.40)) : h;
    overlay.style.paddingTop = (top + 8) + 'px';
    panel.style.maxHeight = Math.max(120, room - 16) + 'px';
    var f = typing && document.activeElement;
    if (f && panel.contains(f) && f.scrollIntoView) { try { f.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
  }
  ['resize', 'orientationchange'].forEach(function (t) { window.addEventListener(t, function () { setTimeout(fitPanel, 60); }); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitPanel);
  document.addEventListener('focusin', function (e) {
    if (!open || !panel || !panel.contains(e.target) || !/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.type === 'checkbox') return;
    typing = true; setTimeout(fitPanel, 80); setTimeout(fitPanel, 400);   // …and again once the keyboard and any turn have settled
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
    if (view) S.view = view;
    open = true;
    overlay.style.display = 'grid';
    goVertical(true);
    fitPanel();
    jdel(ls, NUDGE);
    hideToast();
    if (S.anon && S.pendingEmail && session) refreshUser();
    render();
    focusFirst();
  }
  function closePanel() {
    if (!overlay) return;
    open = false;
    overlay.style.display = 'none';
    goVertical(false);
    typing = false;
    panel.innerHTML = '';                 // typed passwords do not linger in the DOM
    panel.removeAttribute('data-view');
    panel.__html = null;
    if (S.view !== 'sent') S.view = 'home';
    S.message = null;
    render();
    try { var c = document.getElementById('game'); c && c.focus({ preventScroll: true }); } catch (e) {}
  }
  function hideToast() { if (toast) toast.style.display = 'none'; }

  // Shown on the menu screens only. Polled (cheap) rather than hooked into
  // frontend.js, so the front end needs no changes to host it.
  function menuVisible() {
    try {
      var R = window.__ror, M = window.__rorMenu;
      return !!(R && R.frontActive && M && MENU_PHASES.indexOf(M.phase) >= 0);
    } catch (e) { return false; }
  }
  function place() {
    if (!chip) return;
    var vis = menuVisible();
    if (!vis && open) closePanel();
    chip.style.display = vis ? 'inline-flex' : 'none';
    if (!vis) { hideToast(); return; }
    var c = document.getElementById('game'), r = c ? c.getBoundingClientRect() : { top: 0, right: innerWidth };
    // the main menu has Darki's player card in that corner (to ~15% of the height),
    // so there the chip sits just under it; the other menu screens leave it free
    var under = window.__rorMenu && window.__rorMenu.phase === 'menu' ? 0.165 : 0.025;
    var top = Math.max(8, r.top + r.height * under), right = Math.max(8, innerWidth - r.right + r.width * 0.018);
    chip.style.top = top + 'px'; chip.style.right = right + 'px';
    if (S.autoOpen) { S.autoOpen = false; openPanel(); return; }
    if (S.status === 'guest' && jget(ls, NUDGE) && !toastShown && !open) {
      toastShown = true;
      toast.innerHTML = 'Level cleared! Create a free account to keep your progress on any device.'
        + '<button data-t="open">SAVE</button><button data-t="x" aria-label="Dismiss">✕</button>';
      toast.onclick = function (e) {
        var t = e.target.getAttribute('data-t');
        if (t === 'open') openPanel('home');
        if (t === 'x') { hideToast(); jset(ls, NUDGE + '.off', 1); jdel(ls, NUDGE); render(); }
      };
      toast.style.top = (top + 40) + 'px'; toast.style.right = right + 'px';
      toast.style.display = 'block';
      setTimeout(hideToast, 9000);
    }
  }

  function start() {
    buildUi();
    render();
    setInterval(place, 400);
    boot();
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  // ------------------------------------------------------------------ API ----
  window.RRAccount = {
    enabled: true,
    get status() { return S.status; },
    get state() { return JSON.parse(JSON.stringify(S)); },
    open: function (view) { openPanel(view); },
    close: closePanel,
    on: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    syncNow: syncNow,
    getLeaderboard: function (level, difficulty, limit) {
      if (!sb) return Promise.resolve({ error: new Error('offline') });
      return rpc('get_leaderboard', { p_level: level || 1, p_difficulty: difficulty || 'NORMAL', p_limit: limit || 20 });
    },
    get client() { return sb; },
  };
})();
