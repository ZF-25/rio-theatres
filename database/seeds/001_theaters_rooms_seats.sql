BEGIN;

-- 1. CREATE THEATERS

INSERT INTO theaters (name, city)
SELECT 'Rio', city
FROM (VALUES ('Oulu'), ('Tampere')) AS locations(city)
WHERE NOT EXISTS (
    SELECT 1
    FROM theaters t
    WHERE t.name = 'Rio'
      AND t.city = locations.city
);

-- 2. CREATE ROOMS

INSERT INTO rooms (theater_id, room_name, capacity)
SELECT
    t.theater_id,
    r.room_name,
    r.capacity
FROM theaters t
CROSS JOIN (
    VALUES
        ('Room 1', 100),
        ('Room 2', 200)
) AS r(room_name, capacity)
WHERE t.name = 'Rio'
  AND t.city IN ('Oulu', 'Tampere')
  AND NOT EXISTS (
      SELECT 1
      FROM rooms existing
      WHERE existing.theater_id = t.theater_id
        AND existing.room_name = r.room_name
  );

-- 3. GENERATE SEATS

INSERT INTO seats (
    room_id,
    row_number,
    seat_number,
    status,
    is_owner_seat
)
SELECT
    r.room_id,

    -- Skip row number 13
    CASE
        WHEN rows.row_index >= 13
        THEN rows.row_index + 1
        ELSE rows.row_index
    END,

    seat_numbers.seat_number,
    'available',
    FALSE

FROM rooms r

CROSS JOIN LATERAL
    generate_series(1, r.capacity / 10) AS rows(row_index)

CROSS JOIN LATERAL
    generate_series(1, 10) AS seat_numbers(seat_number)

WHERE r.room_name IN ('Room 1', 'Room 2')
  AND EXISTS (
      SELECT 1
      FROM theaters t
      WHERE t.theater_id = r.theater_id
        AND t.name = 'Rio'
        AND t.city IN ('Oulu', 'Tampere')
  )
  AND NOT EXISTS (
      SELECT 1
      FROM seats existing
      WHERE existing.room_id = r.room_id
        AND existing.row_number =
            CASE
                WHEN rows.row_index >= 13
                THEN rows.row_index + 1
                ELSE rows.row_index
            END
        AND existing.seat_number = seat_numbers.seat_number
  );

COMMIT;
