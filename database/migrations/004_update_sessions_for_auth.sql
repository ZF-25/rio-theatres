
BEGIN;

-- Allow anonymous sessions without an authenticated user.
ALTER TABLE sessions
ALTER COLUMN user_id DROP NOT NULL;

-- Track the last activity for the 24-hour inactivity timeout.
ALTER TABLE sessions
ADD COLUMN last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Store the hash of the CSRF token, never the raw token.
ALTER TABLE sessions
ADD COLUMN csrf_token_hash VARCHAR(255);

-- Index for finding sessions by their last activity.
CREATE INDEX idx_sessions_last_activity_at
ON sessions(last_activity_at);

COMMIT;
