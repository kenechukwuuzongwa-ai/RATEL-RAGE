/* RATEL RAGE — player progress, LOCAL FIRST (request 378).
 *
 * The game had no saved progress beyond one key per difficulty that
 * game.js computeScore() writes: `ror.best.l1.<EASY|NORMAL|HARD|ARCADE>`. This
 * store adds a small JSON record, saved to localStorage at the moments that
 * matter — level start, a section gate passed (the street's checkpoints),
 * game over, retry, level complete — never per frame. Combat and animation state
 * never enters it.
 *
 * Cloud sync (src/account.js) is layered on top and optional: this file works,
 * and the game keeps every bit of progress, with no network at all.
 *
 * ONE RECORD PER OWNER. Records are keyed by the Supabase user id once one is
 * known (`rr.progress.v1:<uid>`), or `device` before that. Progress made before
 * any identity existed is adopted by the first identity this device gets (the
 * automatic guest). Another account's record on a shared device is never merged
 * into yours unless the player asked for it (account.js mergeFrom), and every
 * adoption leaves a backup copy first.
 *
 * MERGE IS LOSSLESS AND ORDER-FREE: counts take the max, best scores the
 * higher, the checkpoint the newer — merge(a, b) == merge(b, a), and merging
 * twice changes nothing. That is what lets a stale device, a second device or a
 * guest -> account switch combine without one copy wiping out the other. */
(function (root) {
  'use strict';
  var DIFFS = ['EASY', 'NORMAL', 'HARD', 'ARCADE'];
  var PREFIX = 'rr.progress.v1:';

  function blank() {
    return { v: 1, updatedAt: 0, levels: {}, checkpoint: null,
      stats: { runs: 0, deaths: 0, retries: 0, completions: 0, kos: 0, playSeconds: 0 } };
  }
  var num = function (x) { return typeof x === 'number' && isFinite(x) ? x : 0; };
  function betterBest(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    if (num(b.score) !== num(a.score)) return num(b.score) > num(a.score) ? b : a;
    return num(b.at) && (!num(a.at) || num(b.at) < num(a.at)) ? b : a;   // tie: the earlier set it
  }
  function normalize(p) {
    var o = blank();
    if (!p || typeof p !== 'object') return o;
    o.updatedAt = num(p.updatedAt);
    var lv = p.levels && typeof p.levels === 'object' ? p.levels : {};
    for (var k in lv) {
      if (!/^\d{1,2}$/.test(k) || !lv[k] || typeof lv[k] !== 'object') continue;
      var L = lv[k], best = {};
      for (var i = 0; i < DIFFS.length; i++) {
        var b = L.best && L.best[DIFFS[i]];
        if (b && typeof b === 'object') best[DIFFS[i]] = { score: num(b.score), rank: String(b.rank || '').slice(0, 1),
          time: num(b.time), maxCombo: num(b.maxCombo), topHit: num(b.topHit), at: num(b.at) };
      }
      o.levels[k] = { completions: num(L.completions), furthestSection: num(L.furthestSection), best: best };
    }
    if (p.checkpoint && typeof p.checkpoint === 'object') {
      o.checkpoint = { level: num(p.checkpoint.level) || 1, section: num(p.checkpoint.section),
        difficulty: DIFFS.indexOf(p.checkpoint.difficulty) >= 0 ? p.checkpoint.difficulty : 'NORMAL', at: num(p.checkpoint.at) };
    }
    var s = p.stats || {};
    for (var key in o.stats) o.stats[key] = num(s[key]);
    return o;
  }
  function merge(a, b) {
    a = normalize(a); b = normalize(b);
    var o = blank();
    o.updatedAt = Math.max(a.updatedAt, b.updatedAt);
    var keys = {}, k;
    for (k in a.levels) keys[k] = 1;
    for (k in b.levels) keys[k] = 1;
    for (k in keys) {
      var x = a.levels[k] || { completions: 0, furthestSection: 0, best: {} };
      var y = b.levels[k] || { completions: 0, furthestSection: 0, best: {} };
      var best = {};
      for (var i = 0; i < DIFFS.length; i++) {
        var w = betterBest(x.best[DIFFS[i]], y.best[DIFFS[i]]);
        if (w) best[DIFFS[i]] = w;
      }
      o.levels[k] = { completions: Math.max(x.completions, y.completions),
        furthestSection: Math.max(x.furthestSection, y.furthestSection), best: best };
    }
    o.checkpoint = !a.checkpoint ? b.checkpoint : !b.checkpoint ? a.checkpoint
      : (b.checkpoint.at > a.checkpoint.at ? b.checkpoint : a.checkpoint);
    for (var s in o.stats) o.stats[s] = Math.max(a.stats[s], b.stats[s]);
    return o;
  }
  // Same content? (updatedAt aside — it is bookkeeping, not progress)
  function same(a, b) {
    var x = normalize(a), y = normalize(b);
    x.updatedAt = y.updatedAt = 0;
    return JSON.stringify(x) === JSON.stringify(y);
  }

  var api = { merge: merge, normalize: normalize, same: same, blank: blank, DIFFS: DIFFS };

  if (typeof window === 'undefined') { if (typeof module !== 'undefined') module.exports = api; return; }

  // ------------------------------------------------------------- browser part
  var ls = null;
  try { ls = window.localStorage; } catch (e) { ls = null; }
  var read = function (key) { try { return ls ? JSON.parse(ls.getItem(key) || 'null') : null; } catch (e) { return null; } };
  var write = function (key, v) { try { if (ls) ls.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } };

  var owner = 'device';
  var data = normalize(read(PREFIX + owner));
  var listeners = [];
  var emit = function (type, detail) {
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](type, detail); } catch (e) {} }
  };

  // The game's own best-score keys: fold them in (never removed), and write a
  // better restored best back so the game's "best" display reflects it.
  function absorbGameBests(p) {
    var lvl = p.levels['1'] || { completions: 0, furthestSection: 0, best: {} };
    for (var i = 0; i < DIFFS.length; i++) {
      var b = read('ror.best.l1.' + DIFFS[i]);
      if (b && typeof b === 'object') {
        lvl.best[DIFFS[i]] = betterBest(lvl.best[DIFFS[i]], { score: num(b.score), rank: String(b.rank || '').slice(0, 1),
          time: num(b.time), maxCombo: num(b.maxCombo), topHit: num(b.topHit), at: num(b.at) });
      }
    }
    if (Object.keys(lvl.best).length || p.levels['1']) p.levels['1'] = lvl;
    return p;
  }
  function exportGameBests(p) {
    var lvl = p.levels['1'];
    if (!lvl) return;
    for (var i = 0; i < DIFFS.length; i++) {
      var mine = lvl.best[DIFFS[i]];
      if (!mine) continue;
      var theirs = read('ror.best.l1.' + DIFFS[i]);
      if (!theirs || num(mine.score) > num(theirs.score)) {
        write('ror.best.l1.' + DIFFS[i], { score: mine.score, rank: mine.rank, time: mine.time,
          maxCombo: mine.maxCombo, topHit: mine.topHit, at: mine.at || Date.now() });
      }
    }
  }
  data = absorbGameBests(data);

  function persist(reason) {
    data.updatedAt = Date.now();
    var ok = write(PREFIX + owner, data);
    emit('change', { reason: reason, owner: owner, saved: ok });
    return ok;
  }
  function level(n) {
    var k = String(n || 1);
    if (!data.levels[k]) data.levels[k] = { completions: 0, furthestSection: 0, best: {} };
    return data.levels[k];
  }

  /* THE GAME'S ONE ENTRY POINT. game.js calls this at the moments listed above;
   * anything unknown is ignored. Returns nothing the game depends on. */
  function record(type, d) {
    d = d || {};
    var lv = Math.max(1, Math.round(num(d.level)) || 1);
    var diff = DIFFS.indexOf(d.difficulty) >= 0 ? d.difficulty : 'NORMAL';
    if (type === 'level_start') {
      data.stats.runs++;
      level(lv);
      persist(type);
    } else if (type === 'checkpoint') {
      var L = level(lv);
      L.furthestSection = Math.max(L.furthestSection, num(d.section));
      data.checkpoint = { level: lv, section: num(d.section), difficulty: diff, at: Date.now() };
      persist(type);
    } else if (type === 'game_over') {
      data.stats.deaths++;
      data.stats.kos += num(d.kos);
      data.stats.playSeconds += Math.round(num(d.time));
      persist(type);
    } else if (type === 'retry') {
      data.stats.retries++;
      persist(type);
    } else if (type === 'level_complete') {
      var C = level(lv);
      C.completions++;
      data.stats.completions++;
      data.stats.kos += num(d.kos);
      data.stats.playSeconds += Math.round(num(d.time));
      C.best[diff] = betterBest(C.best[diff], { score: num(d.score), rank: String(d.rank || '').slice(0, 1),
        time: num(d.time), maxCombo: num(d.maxCombo), topHit: num(d.topHit), at: Date.now() });
      data.checkpoint = null;                 // the level is done: no mid-level resume point
      persist(type);
    } else return;
    emit('record', { type: type, data: d, level: lv, difficulty: diff });
  }

  /* Identity changes (account.js). `mergeFrom` = the owner whose progress the
   * player agreed to carry into this one (a guest signing in to an existing
   * account). Device progress is always carried into the first identity. */
  function setOwner(uid, opts) {
    opts = opts || {};
    if (!uid || uid === owner) return;
    var target = normalize(read(PREFIX + uid));
    var sources = [];
    if (owner === 'device') sources.push('device');
    if (opts.mergeFrom && opts.mergeFrom !== uid) sources.push(opts.mergeFrom);
    for (var i = 0; i < sources.length; i++) {
      var src = sources[i] === owner ? data : normalize(read(PREFIX + sources[i]));
      if (same(src, blank())) continue;
      write('rr.progress.backup.' + Date.now() + '.' + sources[i].slice(0, 8), { from: sources[i], to: uid, from_data: src, to_data: target });
      target = merge(target, src);
      if (sources[i] === 'device') { try { ls && ls.removeItem(PREFIX + 'device'); } catch (e) {} }
    }
    owner = uid;
    data = absorbGameBests(target);
    persist('owner');
    exportGameBests(data);
  }
  // Cloud copy merged in (account.js). Local wins nothing and loses nothing: merge.
  function absorb(cloud) {
    var merged = merge(data, cloud);
    var changed = !same(merged, data);
    data = merged;
    if (changed) { write(PREFIX + owner, data); emit('change', { reason: 'cloud', owner: owner, saved: true }); }
    exportGameBests(data);
    return changed;
  }

  api.record = record;
  api.setOwner = setOwner;
  api.absorb = absorb;
  api.on = function (fn) { if (typeof fn === 'function') listeners.push(fn); };
  api.get = function () { return JSON.parse(JSON.stringify(data)); };
  Object.defineProperty(api, 'owner', { get: function () { return owner; } });
  root.RRProgress = api;
})(typeof window !== 'undefined' ? window : globalThis);
