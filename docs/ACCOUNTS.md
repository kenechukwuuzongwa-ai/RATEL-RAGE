# Ratel Rage: Player Accounts (Supabase, guest first)

Request 378. Accounts are **optional and off by default**. With `supabase-config.js`
empty, the game behaves exactly as before: progress is kept on the device
(`src/progress.js`) and no account code makes a request.

## Live setup (2026-10-11)

* **Project:** Supabase "Ratel Rage", ref `xnnygfkzagqoxuhqervm`, region eu-west-1 (Ireland).
* **Migration** `20261009120000_player_accounts.sql` applied with `supabase db push`
  (recorded in the project's migration history). `rls_tests.sql` ran on the real
  project and ended `ALL RLS TESTS PASSED`, then rolled back. A deliberate failing
  assert was confirmed to abort the script, so the pass is real.
* **Auth** (set via the Management API and read back):
  - anonymous sign-ins ON, manual linking ON, email ON with confirmation;
  - password minimum 8 (matches `account.js`);
  - anonymous sign-ins limited to 200 per hour per IP (the default 30 is low for
    mobile networks that share IPs);
  - Site URL `https://ratel-rage.pages.dev/`; redirect allow-list: that URL, `/**`,
    and `https://*.ratel-rage.pages.dev/**` (preview deployments).
  - Google: OFF, and the game hides its buttons (`google: false`).
* **Wiring:** `deploy/build-web.js` writes the URL and the **publishable** key into
  `deploy/dist/supabase-config.js` only. It refuses a `sb_secret_` key, and `--no-accounts`
  leaves accounts off. The source `supabase-config.js` stays empty, so the editor and the
  APK remain device-only. No secret key value is anywhere in the build (checked).
* **Still to do before heavy traffic:**
  - Google provider (§3.6);
  - custom SMTP (the built-in sender allows only 2 emails an hour);
  - CAPTCHA support in `account.js`, then switch it on;
  - a contact address on `privacy.html`.
* **Live checks run:** `_chromakey/_brand/liveauth.js` (11/11: guest sign-up, save/load,
  stale-version refusal, guest B cannot see A, no-session reads blocked, no direct event
  writes) and `_chromakey/_brand/liveaccount.js` (live site: guest with no prompt, chip on
  the menu, same uid after a reload, no errors). Test users were deleted afterwards.

## 1. How it works (audit summary)

What the game already had, and the hooks used (no function names invented):

| Concern | Where it really lives |
|---|---|
| Entry point | `index.html` → classic scripts, then `src/game.js` (ES module) which boots `src/frontend.js` |
| Level start | `game.js` front-end handover → `rrGameEvent('level_start', …)` |
| Checkpoints | the gated street sections: `advanceSection()` → `rrGameEvent('checkpoint', …)` |
| Death | game over → `rrGameEvent('game_over', …)` |
| Retry | pause / game-over RETRY (reloads the page) → `rrGameEvent('retry', …)` |
| Level completion | `beginAftermath()` → `rrGameEvent('level_complete', …)` incl. the score parts from `computeScore()` |
| Old saved state | only `ror.best.l1.<EASY/NORMAL/HARD/ARCADE>` (best score per difficulty) + settings + touch layout |

`rrGameEvent()` forwards to analytics (`RRAnalytics.track`) and to the progress
store (`RRProgress.record`). Nothing is saved per frame; combat and animation
state never leave the game.

```
game.js ──rrGameEvent──► progress.js (localStorage, always) ──change──► account.js ──► Supabase
                     └──► analytics.js ──sink──────────────────────────► account.js ──► log_events()
```

- **Guest first.** On first visit `account.js` signs the player in anonymously
  (`signInAnonymously`) in the background. The game never waits for it.
- **Sessions persist** in localStorage (`rr.auth`), refreshed by supabase-js.
- **Cloud save** = the progress record (best scores, completions, furthest section,
  last checkpoint, counters) in `cloud_saves`. Each write states the version it was
  based on. A stale write is refused and the server copy comes back. That copy is
  **merged** (max of counters, the higher best, the newer checkpoint), then written
  again. No copy ever overwrites another.
- **Offline / failures**: local progress is always written first. A failed cloud
  write is marked pending (`rr.cloud.dirty:<uid>`) and retried when the browser goes
  online, the tab comes back, or the next save happens.
- **Guest → account keeps the same user id**:
  - Google: `linkIdentity()` (needs *Manual linking* on, see §3).
  - Email: `updateUser({ email })`, then the confirmation link, then a password.
- **Conflicts**: if that Google account or email already belongs to another account,
  nothing is changed. The player is offered to sign in to it, with an explicit,
  visible choice: add this device's guest progress to that account, or keep them separate.
- **Failed verification** (expired or used link, cancelled Google): the player stays
  the same guest and is told that nothing was changed. The error is removed from the
  URL before supabase-js sees it, because for most errors supabase-js would drop
  the stored session.
- **Sign out** → a new guest. The account's progress stays in its cloud save, and the
  new guest does not inherit it.
- **Leaderboard** (registered players only): `start_run()` at level start (server
  clock), `submit_score()` at completion. The server checks that the parts add up,
  that the time fits the real elapsed time, that the rank is right, and that each run
  is submitted once. This is a plausibility check: a browser game cannot be made cheat-proof.
- **UI**: a small chip, top-right, on the main menu, level select, options and
  extras only. It is never shown during gameplay, cutscenes, briefings or intros. It opens a panel over the
  menu. Keys typed in the panel never reach the game. After a level is cleared as a
  guest, the chip pulses and a dismissible toast suggests saving. Nothing blocks play.
- **Android app (Capacitor)**: Google buttons are hidden, because Google refuses
  embedded WebViews. Email accounts work. A confirmation link opened in the phone's
  browser is picked up when the app returns to the foreground.

## 2. Files

| File | Why |
|---|---|
| `supabase/migrations/20261009120000_player_accounts.sql` | profiles, cloud_saves, gameplay_events, runs, leaderboard_scores; RLS, grants, RPCs |
| `supabase/rollback/20261009120000_player_accounts_down.sql` | drops everything the migration created (kept out of `migrations/` on purpose) |
| `supabase/tests/rls_tests.sql` | RLS/grant/RPC tests, one rolled-back transaction |
| `supabase/tests/auth_stub.sql` | local-only stand-in for Supabase's `auth` schema (PGlite runs) |
| `supabase-config.js` (new) | project URL + publishable key; empty = accounts off |
| `src/account.js` (new) | auth, session, cloud sync, linking, leaderboard calls, analytics sink, chip + panel |
| `src/progress.js` (new) | local-first progress store and lossless merge |
| `src/analytics.js` | client rate limit (100/min), pluggable sinks, on when Supabase is configured |
| `src/game.js` | `rrGameEvent()` hooks at the moments above; level_complete passes the scored time |
| `index.html` | loads `supabase-config.js`, `progress.js`, `account.js` |
| `frontend/vendor/supabase/supabase.js` | supabase-js 2.117.3 UMD (MIT, licence alongside). Fetched only when accounts are on |
| `deploy/build-web.js`, `mobile/build-demo.js` | ship `supabase-config.js` (`no-cache` header on the web) |
| `_chromakey/accountsqltest.js` | runs migration + RLS tests + rollback + re-apply + 7 mutation checks on PGlite |
| `_chromakey/progressunit.js`, `progressverify.js` | merge rules; the game writes progress at the right moments only |
| `_chromakey/accountverify.js` | the real supabase-js + account.js against a mocked Supabase API, in the game |

## 3. Supabase setup

1. **Create a project** (separate staging and production projects are recommended).
2. **Apply the migration**: `supabase link --project-ref <ref>` then `supabase db push`,
   or paste the migration file into *SQL Editor* and run it.
3. **Run the RLS tests on staging**: paste `supabase/tests/rls_tests.sql` into the SQL
   editor. It must end with `ALL RLS TESTS PASSED`. It rolls itself back, leaving no data.
4. **Authentication → Sign In / Providers**:
   - *Allow anonymous sign-ins*: **ON**.
   - *Allow manual linking*: **ON** (needed for `linkIdentity`, guest → Google).
   - *Email*: ON, *Confirm email*: ON.
   - Turn on *CAPTCHA* (Turnstile/hCaptcha) under Attack Protection before a public
     launch, because anonymous sign-ins can be abused to create users. **Note:**
     `account.js` does not send a captcha token yet; turning CAPTCHA on now would block
     guest sign-in. That is listed as remaining work (§6).
5. **Authentication → URL Configuration**:
   - *Site URL*: `https://<your-domain>/`
   - *Redirect URLs*: add `https://<your-domain>/index.html`, `https://<your-domain>/**`
     and, for itch.io, the exact `https://html-classic.itch.zone/...` URL of the game
     iframe if you host there (itch.io iframes make OAuth fragile; prefer your own domain).
   - Keep `http://localhost:*` entries on **staging only**.
6. **Google OAuth** (Authentication → Providers → Google):
   - In Google Cloud Console: create an OAuth client of type *Web application*.
   - Authorised JavaScript origins: `https://<your-domain>`.
   - Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Paste the Client ID and secret into Supabase. The secret stays in Supabase, never in the game.
   - The OAuth consent screen asks only for `email`/`profile` (Supabase's default).
7. **Email**: Supabase's built-in sender is rate-limited and only for testing. For
   launch, set *Authentication → SMTP Settings* (Resend, Postmark, SES, ...). Edit the
   *Confirm signup*, *Change email address* and *Reset password* templates to name the game.
8. **Keys** (*Settings → API Keys*): copy the **publishable / anon** key into
   `supabase-config.js`. Never the `service_role` / `sb_secret_…` key: `account.js`
   refuses to start if it finds one.

```js
window.RR_SUPABASE = {
  url: 'https://<project-ref>.supabase.co',
  anonKey: '<publishable key>',
  redirectTo: '',      // '' = the page the player is on
  google: true,
};
```

### Housekeeping (optional, run weekly)
Anonymous users who never return pile up. With `pg_cron`:
```sql
delete from auth.users
where is_anonymous and created_at < now() - interval '60 days'
  and coalesce(last_sign_in_at, created_at) < now() - interval '60 days';
-- cascades to profiles, cloud_saves, gameplay_events, runs, scores
delete from public.gameplay_events where created_at < now() - interval '180 days';
```

### Reading the stats
In the SQL editor (as `postgres`):
```sql
-- players active in the last 7 days, guests vs registered
select count(distinct e.user_id) filter (where p.converted_at is null) guests,
       count(distinct e.user_id) filter (where p.converted_at is not null) registered
from gameplay_events e join profiles p on p.id = e.user_id
where e.created_at > now() - interval '7 days';
-- conversions per day
select date_trunc('day', converted_at) d, count(*) from profiles where converted_at is not null group by 1 order by 1 desc;
-- level starts / completions / deaths per day
select date_trunc('day', created_at) d, name, count(*) from gameplay_events
where name in ('game_start','level_start','level_complete','game_over','retry') group by 1, 2 order by 1 desc, 2;
```

## 4. Privacy

- Default display name `Ratel-xxxxxx` comes from the user id, never from an email or Google name.
- Events carry: event name, time, a per-tab session id and small game props. The user id is
  the auth id, which is pseudonymous. No IPs, emails or user-agent strings are stored by the game.
  (Supabase's own auth logs keep IPs; see their DPA.)
- Do Not Track / Global Privacy Control → no events are sent to Supabase at all.
- Rate limits: client 100 events/min (analytics.js); server 50 per call, 120/min and
  5000/day per user (`log_events`); 60 runs/hour (`start_run`).
- Update the privacy notice on the site: account email (if given), progress, gameplay events.

## 5. Deploy and roll back

**Deploy**
1. Staging: apply the migration, run `rls_tests.sql`, configure auth as in §3.
2. Put the staging URL/key in `supabase-config.js`, run `node deploy/build-web.js`,
   upload `deploy/dist` to a staging site, and walk the manual checklist (§6).
3. Production: apply the same migration, configure auth and redirects, set the
   production URL/key in the **deployed** `supabase-config.js` (served `no-cache`, so no
   rebuild is needed to change it), and upload.

**Roll back**
- *Switch accounts off, keep data*: empty `url` / `anonKey` in the deployed
  `supabase-config.js`. Players keep playing with on-device progress immediately.
  Nothing is lost locally.
- *Previous game build*: re-upload the previous `deploy/dist`. The old build ignores
  the new localStorage keys. `ror.best.*` keys are still written, so best scores show.
- *Database*: **back up first** (Dashboard → Database → Backups, or
  `supabase db dump --data-only -f backup.sql`), then run
  `supabase/rollback/20261009120000_player_accounts_down.sql`. Auth users are not
  touched. Re-applying the migration afterwards works (tested).

## 6. Test report

### Automated (all run on this machine)
- `node _chromakey/accountsqltest.js`: the migration on **real Postgres 18.3 (PGlite)**
  with a Supabase `auth` stub. RLS tests for anon, guest, registered and owner-only
  access, rate limits, score validation and guest conversion. Then rollback, re-apply
  and the tests again. Then 7 deliberately broken migrations, each of which must be caught.
- `node _chromakey/progressunit.js`: merge rules (commutative, idempotent, lossless).
- `node _chromakey/progressverify.js`: in the game, with accounts off. The old best
  score is folded in, writes happen at level start, checkpoint, completion and death
  only (0 writes in 10 s of fighting), and progress survives a reload.
- `node _chromakey/accountverify.js`: **31/31**, in the game, with the **real
  supabase-js 2.117.3** and `account.js` against a **mocked** Supabase Auth/REST API
  (log: `_chromakey/req378_accountverify.log`). Covers:
  - off when unconfigured;
  - a secret key refused;
  - guest on first visit, with the existing best carried over;
  - the chip on menus only;
  - typed keys isolated from the game;
  - no saves during fighting;
  - offline checkpoint → synced later;
  - stale-save conflict merged;
  - analytics delivered;
  - session kept on reload;
  - expired link;
  - email already taken;
  - email conversion keeps the id, then the password;
  - `account_linked` tracked;
  - registered score submission;
  - Google conflict, then a Google link that keeps the id;
  - wrong password;
  - sign in with and without carrying guest progress;
  - sign out → a clean new guest;
  - Supabase unreachable at boot → plays offline, then syncs.
- Results on 2026-10-09: `accountsqltest` ALL PASSED (22 PASS notices + 7/7 mutations
  caught), `progressunit` 9/9, `progressverify` 9/9, `accountverify` 31/31, and after
  `deploy/build-web.js`, `webverify all` 32/32.

### NOT yet tested (needs a real Supabase project, a domain and real devices)
- Real Supabase Auth: anonymous sign-in, `linkIdentity` with Google, real
  confirmation emails, password reset emails, the `identity_already_exists` and
  `email_exists` responses as the real server words them.
- The migration on a real Supabase project (PGlite + stub is real Postgres, but not
  Supabase's exact grants/extensions). Run `rls_tests.sql` there before launch.
- Google OAuth consent screen, redirect allow-list, the itch.io iframe.
- Real phones (Android Chrome, iOS Safari), and the Android app's email flow.
- CAPTCHA for anonymous sign-ins (not implemented, see §3.4).
- Multi-device conflicts with real latency (covered only by the mock + SQL tests).

### Manual checklist on staging
1. Fresh browser → play: the chip shows *GUEST* on the menu; a row appears in `profiles`.
2. Clear Level 1 as a guest → toast + pulsing chip; `cloud_saves.main` has the completion.
3. *Continue with Google* → back on the menu as the same `id`, `converted_at` set.
4. A second fresh guest → *Continue with Google* with the same Google account →
   "account already exists", guest unchanged → sign in, with and without carrying progress.
5. *Save with email* → confirmation email → link → choose password → sign in on another browser.
6. Expired link (use one twice) → "Nothing was changed".
7. Turn the network off mid-level → reach a checkpoint → turn it on → the save arrives.
8. A registered clear → a row in `leaderboard_scores`; tamper with the request → rejected.
