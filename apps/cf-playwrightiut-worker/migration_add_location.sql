-- Migration to add 'location' column to events table
-- Run this once against your existing D1 database to add a new column

ALTER TABLE events ADD COLUMN location TEXT;

-- Note: D1 (SQLite-compatible) allows adding columns with ALTER TABLE ADD COLUMN.
-- If you need to initialize existing rows, add an UPDATE statement here.

-- Optional: Initialize existing rows to empty string to avoid nulls
UPDATE events SET location = '' WHERE location IS NULL;
