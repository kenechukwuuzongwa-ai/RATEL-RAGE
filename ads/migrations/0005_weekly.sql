-- request 674: weekly pricing. Board prices become naira per WEEK for the whole board, set so the
-- three bookable boards, fully booked for 52 weeks, take NGN 7,987,200 (just under Paystack's
-- NGN 8,000,000 Starter Business lifetime limit). Same 3 : 8 : 5 ratio as the old monthly prices,
-- and each price divides evenly into its 3 shares. Board 1 stays reserved (not bookable).
-- Bookings made before this keep their months and amount; new ones store weeks (months = 0).
ALTER TABLE bookings ADD COLUMN weeks INTEGER NOT NULL DEFAULT 0;
UPDATE boards SET price = 57600 WHERE id = 'board-1';
UPDATE boards SET price = 28800 WHERE id = 'board-2';
UPDATE boards SET price = 76800 WHERE id = 'board-3';
UPDATE boards SET price = 48000 WHERE id = 'board-4';
