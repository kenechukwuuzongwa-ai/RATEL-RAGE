-- rr-push (request 644): one row per browser that said yes to return reminders.
-- No player id, name or email: only the push service address, the player's UTC offset (to remind
-- in their daytime) and the timing counters.
CREATE TABLE IF NOT EXISTS subs (
  endpoint   TEXT PRIMARY KEY,
  tz         INTEGER NOT NULL DEFAULT 0,      -- minutes east of UTC
  created    INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,                -- last time the game was opened (ms)
  last_push  INTEGER,                         -- last reminder sent (ms)
  unanswered INTEGER NOT NULL DEFAULT 0,      -- reminders since the last visit
  last_test  INTEGER
);
CREATE INDEX IF NOT EXISTS subs_due ON subs (last_seen, last_push);
