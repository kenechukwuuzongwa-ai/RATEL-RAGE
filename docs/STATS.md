# Ratel Rage: in-game stats

The live web game (`https://ratel-rage.pages.dev`) reports anonymous gameplay events to a
small Cloudflare Worker, **rr-stats**. It stores them in a Cloudflare D1 database and serves
a private dashboard.

## Open the dashboard

**https://rr-stats.kenechukwuuzongwa.workers.dev/dashboard**

The browser asks for a user name and password. Any user name works. The password is the
`DASH_PASSWORD` secret (the owner was given it when it was set up).

**Change the password** (from `stats/`):
```
npx wrangler secret put DASH_PASSWORD
```
Type the new one when asked. It applies within seconds. Without the secret, the dashboard
answers 503 and never opens.

## What it shows

| Panel | Meaning |
|---|---|
| **Online now** | game tabs that sent anything in the last 3 minutes (the game pings every 60 s while it is on screen). Rechecked every 30 s |
| **Players** | unique anonymous player ids that started a session in the range, split new / returning (returning = first seen before the range) |
| **Play sessions** | browser-tab sessions. The game's own RETRY / QUIT reloads stay in the same session. "Without a player id" = browsers sending Do Not Track / GPC |
| **Time played** | total, average and median session length |
| **MC Olodo defeated** | `level_complete` events: count, how many players, average and best time, top score |
| **Players per day** | bar chart (hover a bar; "Show as table" for the numbers), in the viewer's local time |
| **Level progress** | per level: players who started, died, total deaths, retries, gave up, won (and the win rate) |
| **Where Darki goes down** | deaths by level and arena section, and how many were at the boss |
| **Devices / App or browser / Browsers / Systems / Countries** | share of sessions |
| **Difficulty picked / Ranks earned** | from `level_start` / `level_complete` |
| **Speed on players' devices** | average time to first screen, time until the level art is ready, and frames per second |
| **Errors players hit** | grouped by message, with how many sessions hit each and when last seen |

Date range: Today, 7 / 30 / 90 days, or any From / to dates (up to 400 days).

## How it is wired

* `src/analytics.js` (unchanged) batches events and sends them with `sendBeacon` /
  no-cors `fetch` as text/plain. The game never waits for it, and failures are ignored.
* `deploy/build-web.js` writes the endpoint (`STATS_ENDPOINT`) into
  `deploy/dist/analytics-config.js` only. The source `analytics-config.js` stays empty,
  so playing in the editor, local tests and the APK are **not** counted. `--no-stats`
  builds without it.
* `stats/worker.js`: `POST /e` ingest, `GET /dashboard`, `GET /api/stats`, and a daily
  cron. `stats/dashboard.js` is the page, and `stats/schema.sql` the two tables.
* `stats/wrangler.toml`: the D1 binding (`rr-stats`), the cron, `ALLOWED_ORIGINS`,
  and the retention days.

**Server-side protection.** Every rejected request still answers 204, so senders learn nothing.
* Only listed origins are accepted: the live site, its preview deployments and `https://localhost`.
* A batch is at most 64 KB and 100 events.
* Event names and ids must match strict patterns.
* Property bags are re-cleaned: at most 20 short keys, strings up to 200 characters, no nested objects.
* A session stops being stored after 3000 events.
* Heartbeats (`session_ping`) only update the session row and are not stored as events.

**Privacy.**
* Nothing identifies a person: no IP address, no user-agent string, no name, email or account.
* Location is only Cloudflare's two-letter country code.
* Player ids are random and live in the player's browser.
* Retention: events 180 days, sessions 400 days (daily cron at 03:17 UTC).
* `privacy.html` (deployed at `/privacy.html`) is the notice for players. It still needs a
  public contact address (marked in the file), and nothing in the game links to it yet.

## Limits (Cloudflare free plan; check current numbers in Cloudflare's docs)

* Workers: 100,000 requests a day. A player sends about one request a minute, plus
  extra ones when events happen, so roughly 1,000+ hours of play a day.
* D1: about 100,000 rows written and 5 million rows read a day, and 5 GB of storage.
  Each request writes one session row plus its events. Opening the dashboard reads the
  rows in the chosen range, so a 90-day view of a busy month costs more than "Today".
  The 30-second auto-refresh reads only the online count.
* Past those limits, Workers Paid (about $5 a month) raises them a lot. Nothing breaks
  for players either way: the game ignores failed sends.

## Deploy / update / roll back (from `stats/`)

```
npx wrangler deploy                      # publish worker.js + dashboard.js
npx wrangler d1 execute rr-stats --remote --file schema.sql   # only if the schema changes
npx wrangler rollback                    # back to the previous Worker version
```
Raw queries: `npx wrangler d1 execute rr-stats --remote --command "SELECT COUNT(*) FROM sessions"`.
To stop collecting at once, rebuild the site with `node deploy/build-web.js --no-stats`
and redeploy it, or set `ALLOWED_ORIGINS` to `""` and redeploy the Worker.

## Tests

* `node stats/test/stats.test.mjs` runs the real worker.js against a D1 stand-in on
  `node:sqlite`. It checks ingest, every rejection rule, auth, every dashboard number on
  seeded data, and retention.
* `node stats/test/dashshot.mjs <dir>` renders the dashboard with a month of synthetic
  data, light and dark, hovers a bar, and screenshots it.
* `_chromakey/webverify.js` checks that the production build reports to the endpoint. It
  answers the endpoint itself, so test runs never reach the real stats.
