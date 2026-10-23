-- RATEL RAGE in-game stats (rr-stats Worker, D1). See docs/STATS.md.
-- One row per browser-tab session; the heartbeat (session_ping) only updates it.
CREATE TABLE IF NOT EXISTS sessions (
  sid       TEXT PRIMARY KEY,
  aid       TEXT,                 -- random anonymous player id ('' when the browser opts out)
  first_ts  INTEGER NOT NULL,     -- ms, server clock
  last_ts   INTEGER NOT NULL,
  seconds   INTEGER NOT NULL DEFAULT 0,
  events    INTEGER NOT NULL DEFAULT 0,
  platform  TEXT, device TEXT, browser TEXT, os TEXT, lang TEXT, build TEXT,
  country   TEXT                  -- two-letter country from Cloudflare, nothing finer
);
CREATE INDEX IF NOT EXISTS sessions_last  ON sessions(last_ts);
CREATE INDEX IF NOT EXISTS sessions_first ON sessions(first_ts);

-- Every other event (level_start, game_over, retry, level_complete, errors, perf ...).
CREATE TABLE IF NOT EXISTS events (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  ts     INTEGER NOT NULL,
  sid    TEXT NOT NULL,
  aid    TEXT,
  e      TEXT NOT NULL,
  level  INTEGER,
  props  TEXT                     -- the event's small JSON property bag
);
CREATE INDEX IF NOT EXISTS events_e_ts ON events(e, ts);
CREATE INDEX IF NOT EXISTS events_ts   ON events(ts);
