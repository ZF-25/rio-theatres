-- Migration 003: Make last_name required

ALTER TABLE users
ALTER COLUMN last_name SET NOT NULL;