-- request 593: refund terms. What a booking is owed back and what has been sent,
-- who cancelled it, and the policy version the advertiser agreed to.
ALTER TABLE bookings ADD COLUMN refund_due INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN refunded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN refund_ref TEXT NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN refund_note TEXT NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN cancelled_by TEXT NOT NULL DEFAULT '';
-- bookings made before this agreed to policy version 1 (or to none, before request 590)
ALTER TABLE bookings ADD COLUMN policy TEXT NOT NULL DEFAULT '1';
