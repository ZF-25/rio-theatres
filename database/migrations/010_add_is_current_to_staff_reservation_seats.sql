-- Rio Theatres
-- Migration: 010_add_is_current_to_staff_reservation_seats.sql
-- Purpose: Preserve reservation seat history when seats are released.

BEGIN;

ALTER TABLE staff_reservation_seats
    ADD COLUMN is_current BOOLEAN NOT NULL DEFAULT TRUE;

-- Existing active allocations remain current.
-- Previously released allocations are not treated as current.
UPDATE staff_reservation_seats
SET is_current = is_active;

COMMIT;
