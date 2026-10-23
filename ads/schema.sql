-- rr-ads: the billboard register, bookings, artwork and view/tap counts (docs/ADS.md)
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  price INTEGER NOT NULL,              -- naira per month
  bookable INTEGER NOT NULL DEFAULT 1,
  shares INTEGER NOT NULL DEFAULT 3     -- rotation: how many advertisers can share it at once
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,                 -- also the Paystack reference and the artwork id
  token TEXT NOT NULL UNIQUE,          -- the advertiser's private status link
  slot TEXT NOT NULL,
  business TEXT NOT NULL, brand TEXT NOT NULL, name TEXT NOT NULL,
  email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  start_day TEXT NOT NULL, end_day TEXT NOT NULL, months INTEGER NOT NULL,
  shares INTEGER NOT NULL DEFAULT 1,   -- how many of the board's shares it takes (its rotation weight)
  amount INTEGER NOT NULL,             -- naira, fixed at booking time
  status TEXT NOT NULL DEFAULT 'review',   -- review | approved | rejected | cancelled
  paid INTEGER NOT NULL DEFAULT 0, pay_ref TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL, updated INTEGER NOT NULL
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
  PRIMARY KEY (day, slot, booking)
);
