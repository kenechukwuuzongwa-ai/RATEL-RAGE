-- request 448: rotation. Boards are sold in shares; a booking takes some of them.
ALTER TABLE boards ADD COLUMN shares INTEGER NOT NULL DEFAULT 3;
ALTER TABLE bookings ADD COLUMN shares INTEGER NOT NULL DEFAULT 1;
-- bookings made before rotation took the whole board
UPDATE bookings SET shares = (SELECT shares FROM boards WHERE boards.id = bookings.slot);
