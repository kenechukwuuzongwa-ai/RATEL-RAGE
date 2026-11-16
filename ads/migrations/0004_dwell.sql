-- request 657: seconds each counted pass kept half the board's face on screen (k 'd' from the game).
-- dwell / views = the average time on screen the website shows advertisers.
ALTER TABLE ad_stats ADD COLUMN dwell INTEGER NOT NULL DEFAULT 0;
