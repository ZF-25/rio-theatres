
-- Rio Theaters
-- Seed 003: Test screening schedule
-- Screening start_time represents the beginning of advertisements.
-- Advertisement duration: 12 minutes.

-- Insert test screenings for Oulu and Tampere.

WITH schedule (city, room_name, movie_title, start_time, ticket_price) AS (
    VALUES
        -- November 4, 2026
        ('Oulu', 'Room 1', 'Avatar: The Way of Water',
         TIMESTAMPTZ '2026-11-04 12:00:00+02', 18.00),

        ('Oulu', 'Room 2', 'Harry Potter and the Deathly Hallows: Part 1',
         TIMESTAMPTZ '2026-11-04 16:00:00+02', 12.00),

        ('Tampere', 'Room 1', 'Jujutsu Kaisen 0',
         TIMESTAMPTZ '2026-11-04 18:00:00+02', 18.00),

        -- November 5, 2026
        ('Tampere', 'Room 2', 'The Hunger Games',
         TIMESTAMPTZ '2026-11-05 13:00:00+02', 12.00),

        ('Oulu', 'Room 1', 'Bungo Stray Dogs: DEAD APPLE',
         TIMESTAMPTZ '2026-11-05 18:00:00+02', 12.00),

        ('Tampere', 'Room 1', 'Beauty and the Beast',
         TIMESTAMPTZ '2026-11-05 10:00:00+02', 12.00),

        -- November 6, 2026
        ('Oulu', 'Room 2', 'The Twilight Saga: New Moon',
         TIMESTAMPTZ '2026-11-06 13:00:00+02', 12.00),

        ('Tampere', 'Room 2', 'Legally Blonde',
         TIMESTAMPTZ '2026-11-06 17:00:00+02', 12.00),

        ('Oulu', 'Room 1', 'The Lion King',
         TIMESTAMPTZ '2026-11-06 11:00:00+02', 12.00)
),
prepared AS (
    SELECT
        r.room_id,
        m.movie_id,
        s.start_time,
        s.start_time
            + INTERVAL '12 minutes'
            + m.duration_minutes * INTERVAL '1 minute' AS end_time,
        s.ticket_price
    FROM schedule s
    JOIN theaters t
        ON t.city = s.city
       AND t.name = 'Rio'
    JOIN rooms r
        ON r.theater_id = t.theater_id
       AND r.room_name = s.room_name
    JOIN movies m
        ON m.title = s.movie_title
)
INSERT INTO screenings (
    room_id,
    movie_id,
    start_time,
    end_time,
    ticket_price
)
SELECT
    p.room_id,
    p.movie_id,
    p.start_time,
    p.end_time,
    p.ticket_price
FROM prepared p
WHERE NOT EXISTS (
    SELECT 1
    FROM screenings existing
    WHERE existing.room_id = p.room_id
      AND existing.start_time = p.start_time
);

-- Correct Legally Blonde screening if any values are missing.
-- The screening is identified by its city, room, movie and start time.

UPDATE screenings s
SET
    end_time = s.start_time
        + INTERVAL '12 minutes'
        + m.duration_minutes * INTERVAL '1 minute',
    ticket_price = 12.00
FROM movies m, rooms r, theaters t
WHERE s.movie_id = m.movie_id
  AND s.room_id = r.room_id
  AND r.theater_id = t.theater_id
  AND t.name = 'Rio'
  AND t.city = 'Tampere'
  AND r.room_name = 'Room 2'
  AND m.title = 'Legally Blonde'
  AND s.start_time = TIMESTAMPTZ '2026-11-06 17:00:00+02'
  AND (
      s.end_time IS NULL
      OR s.ticket_price IS NULL
  );
