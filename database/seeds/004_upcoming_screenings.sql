-- Rio Theaters
-- Seed 004: upcoming screenings relative to NOW()
--
-- Creates test screenings for the next 14 days (Helsinki dates), so the
-- catalogue, checkout and cashier pages always have future screenings.
-- Run it again whenever the test screenings run out.
--
-- * Every room in every Rio theater gets up to 3 screenings a day:
--   12:00, 16:00 and 20:00 Helsinki time (start_time = start of the
--   12 minutes of advertisements, as in seed 003).
-- * Movies rotate through every movie that has a runtime (max 225 min,
--   so a screening always ends before the next slot in the same room).
-- * Safe to run many times: a slot is skipped when it is in the past or
--   when ANY screening already overlaps it in that room (for example
--   screenings added by hand), so ex_screenings_no_overlap never fails.
-- * Prices: 12.00 EUR; 18.00 EUR for movies over 150 minutes.
--
-- Apply after migrations 001-006 and seeds 001-002.

BEGIN;

WITH days AS (
    SELECT d::date AS day, row_number() OVER (ORDER BY d) - 1 AS day_no
    FROM generate_series(
        (NOW() AT TIME ZONE 'Europe/Helsinki')::date,
        (NOW() AT TIME ZONE 'Europe/Helsinki')::date + 13,
        INTERVAL '1 day'
    ) AS d
),
slots (slot_no, slot_time) AS (
    VALUES (0, TIME '12:00'), (1, TIME '16:00'), (2, TIME '20:00')
),
rio_rooms AS (
    SELECT r.room_id, row_number() OVER (ORDER BY t.city, r.room_name) - 1 AS room_no
    FROM rooms r
    JOIN theaters t ON t.theater_id = r.theater_id
    WHERE t.name = 'Rio'
),
playable AS (
    SELECT movie_id, duration_minutes,
           row_number() OVER (ORDER BY movie_id) - 1 AS movie_no,
           COUNT(*) OVER () AS movie_count
    FROM movies
    WHERE duration_minutes BETWEEN 1 AND 225
),
planned AS (
    SELECT rr.room_id,
           p.movie_id,
           (d.day + s.slot_time) AT TIME ZONE 'Europe/Helsinki' AS start_time,
           p.duration_minutes
    FROM days d
    CROSS JOIN slots s
    CROSS JOIN rio_rooms rr
    JOIN playable p
      ON p.movie_no = (d.day_no * 3 + s.slot_no + rr.room_no * 2) % p.movie_count
),
prepared AS (
    SELECT room_id, movie_id, start_time,
           start_time + INTERVAL '12 minutes' + duration_minutes * INTERVAL '1 minute' AS end_time,
           CASE WHEN duration_minutes > 150 THEN 18.00 ELSE 12.00 END AS ticket_price
    FROM planned
    WHERE start_time > NOW()
)
INSERT INTO screenings (room_id, movie_id, start_time, end_time, ticket_price)
SELECT p.room_id, p.movie_id, p.start_time, p.end_time, p.ticket_price
FROM prepared p
WHERE NOT EXISTS (
    SELECT 1 FROM screenings existing
    WHERE existing.room_id = p.room_id
      AND tstzrange(existing.start_time, existing.end_time, '[)')
          && tstzrange(p.start_time, p.end_time, '[)')
);

COMMIT;
