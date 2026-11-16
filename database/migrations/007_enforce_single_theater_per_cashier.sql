
-- Rio Theatres
-- Migration: 007_enforce_single_theater_per_cashier.sql
-- Purpose: Ensure that each cashier can be assigned to only one cinema.
-- This enforces the one-cashier-one-theater requirement at database level.

BEGIN;

-- Safety check: prevent migration if any cashier has multiple assignments.
DO $$
BEGIN
    IF EXISTS (
        SELECT cashier_id
        FROM cashier_theaters
        GROUP BY cashier_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Migration aborted: some cashiers have multiple theater assignments.';
    END IF;
END $$;

-- Each cashier can have only one theater assignment.
CREATE UNIQUE INDEX uq_cashier_theaters_cashier_id
ON public.cashier_theaters (cashier_id);

COMMIT;
