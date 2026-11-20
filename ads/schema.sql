-- rr-ads: the billboard register, bookings, artwork and view/tap counts (docs/ADS.md)
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  price INTEGER NOT NULL,              -- naira per WEEK (request 674; per month before it)
  bookable INTEGER NOT NULL DEFAULT 1,
  shares INTEGER NOT NULL DEFAULT 3     -- rotation: how many advertisers can share it at once
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,                 -- also the Paystack reference and the artwork id
  token TEXT NOT NULL UNIQUE,          -- the advertiser's private status link
  slot TEXT NOT NULL,
  business TEXT NOT NULL, brand TEXT NOT NULL, name TEXT NOT NULL,
  email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  start_day TEXT NOT NULL, end_day TEXT NOT NULL, months INTEGER NOT NULL,   -- months: bookings before request 674 (0 after)
  weeks INTEGER NOT NULL DEFAULT 0,    -- request 674 (migrations/0005_weekly.sql): 1..52 whole weeks
  shares INTEGER NOT NULL DEFAULT 1,   -- how many of the board's shares it takes (its rotation weight)
  amount INTEGER NOT NULL,             -- naira, fixed at booking time
  status TEXT NOT NULL DEFAULT 'review',   -- review | approved | rejected | cancelled
  paid INTEGER NOT NULL DEFAULT 0, pay_ref TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL, updated INTEGER NOT NULL,
  -- refunds (request 593, migrations/0003_refunds.sql): naira owed and naira sent back
  refund_due INTEGER NOT NULL DEFAULT 0, refunded INTEGER NOT NULL DEFAULT 0,
  refund_ref TEXT NOT NULL DEFAULT '', refund_note TEXT NOT NULL DEFAULT '',
  cancelled_by TEXT NOT NULL DEFAULT '',   -- '' | advertiser | owner
  policy TEXT NOT NULL DEFAULT '1',         -- the advertising policy version agreed to at booking
  scan TEXT NOT NULL DEFAULT ''             -- request 685 (migrations/0006_scan.sql): the artwork scan, JSON {by, why, at, scan}
);
CREATE INDEX IF NOT EXISTS bookings_slot ON bookings (slot, status, paid);
CREATE TABLE IF NOT EXISTS creatives (
  booking TEXT PRIMARY KEY,
  mime TEXT NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL,
  data TEXT NOT NULL                   -- base64 (D1 has no object store here; R2 is not enabled)
);
CREATE TABLE IF NOT EXISTS ad_stats (
  day TEXT NOT NULL, slot TEXT NOT NULL, booking TEXT NOT NULL DEFAULT '',   -- '' = the house art
  views INTEGER NOT NULL DEFAULT 0, taps INTEGER NOT NULL DEFAULT 0,
  dwell INTEGER NOT NULL DEFAULT 0,    -- seconds on screen over the counted passes (request 657, migrations/0004_dwell.sql)
  PRIMARY KEY (day, slot, booking)
);
