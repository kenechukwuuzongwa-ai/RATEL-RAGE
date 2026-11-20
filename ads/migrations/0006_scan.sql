-- Request 685: new bookings' artwork is scanned and clean ones are approved automatically.
-- bookings.scan keeps what the scan said (JSON: by 'auto' | 'review', why, at, scan).
ALTER TABLE bookings ADD COLUMN scan TEXT NOT NULL DEFAULT '';
