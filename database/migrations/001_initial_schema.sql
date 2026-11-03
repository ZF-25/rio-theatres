-- Rio Theaters
-- Migration: 001_initial_schema.sql
-- Purpose: Create the initial PostgreSQL schema.
-- Apply this migration only to a NEW, empty database.
-- Do not commit database credentials or connection strings.

BEGIN;

-- Required for the exclusion constraint that prevents overlapping screenings
-- in the same room. Neon supports PostgreSQL's btree_gist extension.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ENUM TYPES

CREATE TYPE user_role AS ENUM ('customer', 'cashier', 'admin');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'expired');
CREATE TYPE payment_status AS ENUM ('pending', 'successful', 'failed', 'refunded');
CREATE TYPE seat_status AS ENUM ('available', 'blocked');
CREATE TYPE hold_status AS ENUM ('active', 'expired', 'released');
CREATE TYPE ticket_type AS ENUM ('adult', 'child', 'student', 'senior');

-- USERS AND AUTHENTICATION SESSIONS

CREATE TABLE users (
    user_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          user_role NOT NULL DEFAULT 'customer',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
    session_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- THEATERS, CASHIER ASSIGNMENTS, ROOMS AND SEATS

CREATE TABLE theaters (
    theater_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    city       VARCHAR(100) NOT NULL,
    address    VARCHAR(255)
);

CREATE TABLE cashier_theaters (
    cashier_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    theater_id INTEGER NOT NULL REFERENCES theaters(theater_id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (cashier_id, theater_id)
);

CREATE INDEX idx_cashier_theaters_theater_id
    ON cashier_theaters(theater_id);

CREATE TABLE rooms (
    room_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    theater_id INTEGER NOT NULL REFERENCES theaters(theater_id) ON DELETE RESTRICT,
    room_name  VARCHAR(50) NOT NULL,
    capacity   INTEGER NOT NULL CHECK (capacity > 0),
    CONSTRAINT uq_rooms_theater_name UNIQUE (theater_id, room_name)
);

CREATE TABLE seats (
    seat_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id       INTEGER NOT NULL REFERENCES rooms(room_id) ON DELETE RESTRICT,
    row_number    INTEGER NOT NULL CHECK (row_number > 0 AND row_number <> 13),
    seat_number   INTEGER NOT NULL CHECK (seat_number > 0 AND seat_number <> 13),
    status        seat_status NOT NULL DEFAULT 'available',
    is_owner_seat BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_seats_room_position UNIQUE (room_id, row_number, seat_number),
    -- Supports composite foreign keys that verify a seat belongs to a room.
    CONSTRAINT uq_seats_id_room UNIQUE (seat_id, room_id)
);

-- MOVIES AND SCREENINGS

CREATE TABLE movies (
    movie_id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title            VARCHAR(255) NOT NULL,
    description      TEXT,
    duration_minutes INTEGER CHECK (duration_minutes > 0),
    age_rating       VARCHAR(20),
    poster_url       VARCHAR(500),
    trailer_url      VARCHAR(500),
    tmdb_id          INTEGER UNIQUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE screenings (
    screening_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    movie_id     INTEGER NOT NULL REFERENCES movies(movie_id) ON DELETE RESTRICT,
    room_id      INTEGER NOT NULL REFERENCES rooms(room_id) ON DELETE RESTRICT,
    start_time   TIMESTAMPTZ NOT NULL,
    end_time     TIMESTAMPTZ NOT NULL,
    ticket_price NUMERIC(8,2) NOT NULL CHECK (ticket_price >= 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_screening_time CHECK (end_time > start_time),
    -- Supports composite foreign keys from bookings/seats-related records.
    CONSTRAINT uq_screenings_id_room UNIQUE (screening_id, room_id),
    -- Prevents overlapping time intervals in the same room.
    CONSTRAINT ex_screenings_no_overlap
        EXCLUDE USING gist (
            room_id WITH =,
            tstzrange(start_time, end_time, '[)') WITH &&
        )
);

CREATE INDEX idx_screenings_movie_id ON screenings(movie_id);
CREATE INDEX idx_screenings_room_start ON screenings(room_id, start_time);

-- BOOKINGS

CREATE TABLE bookings (
    booking_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        INTEGER REFERENCES users(user_id) ON DELETE RESTRICT,
    created_by     INTEGER REFERENCES users(user_id) ON DELETE RESTRICT,
    screening_id   INTEGER NOT NULL REFERENCES screenings(screening_id) ON DELETE RESTRICT,
    guest_name     VARCHAR(150),
    guest_email    VARCHAR(255),
    booking_status booking_status NOT NULL DEFAULT 'pending',
    total_price    NUMERIC(8,2) NOT NULL CHECK (total_price >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ,
    CONSTRAINT chk_booking_customer_details CHECK (
        user_id IS NOT NULL
        OR (guest_name IS NOT NULL AND guest_email IS NOT NULL)
    ),
    -- Allows booking_seats to verify that its screening matches its booking.
    CONSTRAINT uq_bookings_id_screening UNIQUE (booking_id, screening_id)
);

CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_created_by ON bookings(created_by);
CREATE INDEX idx_bookings_screening_id ON bookings(screening_id);
CREATE INDEX idx_bookings_status ON bookings(booking_status);

-- BOOKED SEATS

CREATE TABLE booking_seats (
    booking_seat_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id       INTEGER NOT NULL,
    screening_id     INTEGER NOT NULL,
    room_id          INTEGER NOT NULL,
    seat_id          INTEGER NOT NULL,
    ticket_type      ticket_type NOT NULL,
    price_at_booking NUMERIC(8,2) NOT NULL CHECK (price_at_booking >= 0),

    -- The booking and screening must match.
    CONSTRAINT fk_booking_seats_booking_screening
        FOREIGN KEY (booking_id, screening_id)
        REFERENCES bookings(booking_id, screening_id)
        ON DELETE CASCADE,

    -- The screening and room must match.
    CONSTRAINT fk_booking_seats_screening_room
        FOREIGN KEY (screening_id, room_id)
        REFERENCES screenings(screening_id, room_id)
        ON DELETE RESTRICT,

    -- The seat must physically belong to the room used by the screening.
    CONSTRAINT fk_booking_seats_seat_room
        FOREIGN KEY (seat_id, room_id)
        REFERENCES seats(seat_id, room_id)
        ON DELETE RESTRICT,

    -- A seat can be booked only once for a particular screening.
    CONSTRAINT uq_booking_seats_screening_seat UNIQUE (screening_id, seat_id)
);

CREATE INDEX idx_booking_seats_seat_id ON booking_seats(seat_id);

-- TEMPORARY SEAT HOLDS

CREATE TABLE seat_holds (
    hold_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    screening_id  INTEGER NOT NULL,
    room_id       INTEGER NOT NULL,
    seat_id       INTEGER NOT NULL,
    user_id       INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    session_token VARCHAR(255),
    hold_status   hold_status NOT NULL DEFAULT 'active',
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_seat_hold_owner CHECK (
        user_id IS NOT NULL OR session_token IS NOT NULL
    ),

    -- Verify that the seat belongs to the room of this screening.
    CONSTRAINT fk_seat_holds_screening_room
        FOREIGN KEY (screening_id, room_id)
        REFERENCES screenings(screening_id, room_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_seat_holds_seat_room
        FOREIGN KEY (seat_id, room_id)
        REFERENCES seats(seat_id, room_id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_seat_hold_expiry CHECK (expires_at > created_at)
);

-- A seat can have only one active hold for a given screening.
-- Expired/released holds remain as history and do not block a new hold.
CREATE UNIQUE INDEX uq_active_seat_hold
    ON seat_holds(screening_id, seat_id)
    WHERE hold_status = 'active';

CREATE INDEX idx_seat_holds_expires_at ON seat_holds(expires_at);
CREATE INDEX idx_seat_holds_user_id ON seat_holds(user_id);

-- PAYMENTS

CREATE TABLE payments (
    payment_id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id            INTEGER NOT NULL REFERENCES bookings(booking_id) ON DELETE RESTRICT,
    amount                NUMERIC(8,2) NOT NULL CHECK (amount >= 0),
    payment_status        payment_status NOT NULL DEFAULT 'pending',
    payment_method        VARCHAR(50),
    transaction_reference VARCHAR(255),
    paid_at               TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_booking_id ON payments(booking_id);
CREATE INDEX idx_payments_status ON payments(payment_status);

COMMIT;
