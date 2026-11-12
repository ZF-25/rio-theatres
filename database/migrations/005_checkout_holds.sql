-- Rio Theaters
-- Migration: 005_checkout_holds.sql
-- Purpose: checkout holds (API contract v1.0, section 6) and idempotency
--          records for POST /holds and POST /bookings.
-- Apply after 001-004. Adds tables and columns only; existing data and the
-- existing seat_holds structure, including uq_active_seat_hold, are kept.
--
-- Design
-- * checkout_holds = one checkout: screening, ticket counts, frozen prices,
--   status, expiry, and its OWNER. The owner lives only here: a customer
--   (user_id) or a guest session (session_id -> sessions).
-- * seat_holds = one row per held seat (existing table). Its unique index
--   uq_active_seat_hold still guarantees one ACTIVE hold per seat and
--   screening. Rows created by checkout link to their checkout through
--   checkout_hold_id. session_token is not used by checkout: guest sessions
--   are identified by sessions.session_id, so a token rotation at login
--   does not break the hold.
-- * Status synchronisation (done by the backend inside one transaction,
--   always after locking the screening row):
--     checkout active   -> its seat_holds active
--     checkout released -> its seat_holds released
--     checkout expired  -> its seat_holds expired
--     checkout consumed -> its seat_holds released (the seat is then
--                          protected by booking_seats, unique per screening)
--   seat_holds rows of a checkout never change status on their own.

BEGIN;

CREATE TYPE checkout_hold_status AS ENUM ('active', 'released', 'expired', 'consumed');

CREATE TABLE checkout_holds (
    checkout_hold_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    screening_id       INTEGER NOT NULL REFERENCES screenings(screening_id) ON DELETE RESTRICT,
    user_id            INTEGER REFERENCES users(user_id) ON DELETE RESTRICT,
    -- Guest owner. When a session row is deleted, the hold keeps its history
    -- with session_id = NULL; that is only allowed once the hold has ended
    -- (see chk_checkout_hold_owner), so logout must release the session's
    -- active holds first, in the same transaction.
    session_id         INTEGER REFERENCES sessions(session_id) ON DELETE SET NULL,
    adult_count        INTEGER NOT NULL CHECK (adult_count >= 0),
    child_count        INTEGER NOT NULL CHECK (child_count >= 0),
    adult_unit_cents   INTEGER NOT NULL CHECK (adult_unit_cents >= 0),
    child_unit_cents   INTEGER NOT NULL CHECK (child_unit_cents >= 0),
    total_cents        INTEGER NOT NULL CHECK (total_cents >= 0),
    status             checkout_hold_status NOT NULL DEFAULT 'active',
    expires_at         TIMESTAMPTZ NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at           TIMESTAMPTZ,
    -- An active hold always has an owner; an ended one may have lost its
    -- guest session.
    CONSTRAINT chk_checkout_hold_owner CHECK (
        status <> 'active' OR user_id IS NOT NULL OR session_id IS NOT NULL
    ),
    CONSTRAINT chk_checkout_hold_tickets CHECK (adult_count + child_count > 0),
    CONSTRAINT chk_checkout_hold_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_checkout_holds_screening_status ON checkout_holds(screening_id, status);
CREATE INDEX idx_checkout_holds_user ON checkout_holds(user_id);
CREATE INDEX idx_checkout_holds_session ON checkout_holds(session_id);

-- Link each seat row to its checkout. Existing columns and indexes stay.
ALTER TABLE seat_holds
    ADD COLUMN checkout_hold_id INTEGER REFERENCES checkout_holds(checkout_hold_id) ON DELETE CASCADE;

CREATE INDEX idx_seat_holds_checkout_hold ON seat_holds(checkout_hold_id);

-- A seat row that belongs to a checkout gets its owner from the checkout,
-- so a guest seat row needs neither user_id nor session_token.
-- (seat_holds is empty today, so this cannot affect existing rows.)
ALTER TABLE seat_holds DROP CONSTRAINT chk_seat_hold_owner;
ALTER TABLE seat_holds ADD CONSTRAINT chk_seat_hold_owner CHECK (
    user_id IS NOT NULL OR session_token IS NOT NULL OR checkout_hold_id IS NOT NULL
);

-- Idempotency records: the committed response of POST /holds and
-- POST /bookings, so a retry with the same Idempotency-Key returns the
-- original result instead of writing twice.
CREATE TABLE idempotency_records (
    idempotency_record_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    route              VARCHAR(100) NOT NULL,   -- e.g. 'POST /holds'
    owner_key          VARCHAR(100) NOT NULL,   -- e.g. 'user:6' or 'session:12'
    idempotency_key    UUID NOT NULL,
    request_hash       CHAR(64) NOT NULL,       -- SHA-256 of the canonical request body
    response_status    INTEGER NOT NULL,
    response_body      JSONB NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_idempotency_scope UNIQUE (route, owner_key, idempotency_key)
);

COMMIT;
