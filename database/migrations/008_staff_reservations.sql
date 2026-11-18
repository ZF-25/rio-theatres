
-- Rio Theatres
-- Migration: 008_staff_reservations.sql
-- Purpose: Create separate staff reservation storage.

BEGIN;

-- 1. STAFF RESERVATION STATUS

CREATE TYPE staff_reservation_status AS ENUM (
    'active',
    'cancelled'
);

-- 2. STAFF RESERVATIONS

CREATE TABLE staff_reservations (
    reservation_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    reference VARCHAR(50) NOT NULL UNIQUE,

    screening_id INTEGER NOT NULL,
    room_id INTEGER NOT NULL,

    created_by INTEGER NOT NULL
        REFERENCES users(user_id) ON DELETE RESTRICT,

    customer_name VARCHAR(100) NOT NULL
        CHECK (char_length(trim(customer_name)) BETWEEN 1 AND 100),

    note VARCHAR(500) NOT NULL DEFAULT ''
        CHECK (char_length(note) <= 500),

    status staff_reservation_status NOT NULL DEFAULT 'active',

    cancellation_reason VARCHAR(30),

    version INTEGER NOT NULL DEFAULT 1
        CHECK (version > 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_staff_reservation_cancellation
        CHECK (
            (status = 'active' AND cancellation_reason IS NULL)
            OR
            (status = 'cancelled'
                AND cancellation_reason IN (
                    'staff_cancelled',
                    'screening_cancelled'
                ))
        ),

    -- Ensure the screening belongs to the specified room.
    CONSTRAINT fk_staff_reservations_screening_room
        FOREIGN KEY (screening_id, room_id)
        REFERENCES screenings(screening_id, room_id)
        ON DELETE RESTRICT,

    -- Supports composite FK from staff_reservation_seats.
    CONSTRAINT uq_staff_reservations_id_screening_room
        UNIQUE (reservation_id, screening_id, room_id)
);

-- 3. STAFF RESERVATION SEATS

CREATE TABLE staff_reservation_seats (
    reservation_seat_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    reservation_id INTEGER NOT NULL,
    screening_id INTEGER NOT NULL,
    room_id INTEGER NOT NULL,
    seat_id INTEGER NOT NULL,

    -- Active seat allocations participate in availability checks.
    -- Set to FALSE when the reservation is cancelled or a seat is released.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_staff_reservation_seats_reservation
        FOREIGN KEY (reservation_id, screening_id, room_id)
        REFERENCES staff_reservations(
            reservation_id,
            screening_id,
            room_id
        )
        ON DELETE RESTRICT,

    -- Ensure the screening and room match.
    CONSTRAINT fk_staff_reservation_seats_screening_room
        FOREIGN KEY (screening_id, room_id)
        REFERENCES screenings(screening_id, room_id)
        ON DELETE RESTRICT,

    -- Ensure the physical seat belongs to the specified room.
    CONSTRAINT fk_staff_reservation_seats_seat_room
        FOREIGN KEY (seat_id, room_id)
        REFERENCES seats(seat_id, room_id)
        ON DELETE RESTRICT
);

-- 4. INDEXES

CREATE INDEX idx_staff_reservations_screening_id
    ON staff_reservations(screening_id);

CREATE INDEX idx_staff_reservations_created_by
    ON staff_reservations(created_by);

CREATE INDEX idx_staff_reservations_status
    ON staff_reservations(status);

CREATE INDEX idx_staff_reservations_created_at
    ON staff_reservations(created_at DESC);

CREATE INDEX idx_staff_reservations_reference
    ON staff_reservations(reference);

CREATE INDEX idx_staff_reservation_seats_reservation_id
    ON staff_reservation_seats(reservation_id);

CREATE INDEX idx_staff_reservation_seats_screening_id
    ON staff_reservation_seats(screening_id);

-- An active reservation cannot allocate the same seat twice
-- for the same screening.
CREATE UNIQUE INDEX uq_active_staff_reservation_seat
    ON staff_reservation_seats(screening_id, seat_id)
    WHERE is_active = TRUE;

-- A reservation cannot contain the same active seat twice.
CREATE UNIQUE INDEX uq_active_staff_reservation_seat_per_reservation
    ON staff_reservation_seats(reservation_id, seat_id)
    WHERE is_active = TRUE;

COMMIT;
