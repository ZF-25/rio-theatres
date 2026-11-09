const pool = require('../config/db');
const { getAgeWarning } = require('../utils/ageRating');

const ADS_MINUTES = 12;
const DOORS_BEFORE_MINUTES = 15;

// Dates from the customer (?date=2026-11-20) mean the Finnish calendar day.
const LOCAL_TZ = 'Europe/Helsinki';

// One query used by both the list and the single-screening endpoint.
// availableSeats = seats in the room
//   - owner/blocked seats
//   - seats in pending or confirmed bookings
//   - seats with an active, not-yet-expired hold
const BASE_QUERY = `
  SELECT
    s.screening_id,
    s.movie_id,
    m.title        AS movie_title,
    m.age_rating,
    r.theater_id,
    t.city,
    s.room_id,
    r.room_name,
    s.start_time,
    s.end_time,
    s.ticket_price,
    NOT EXISTS (
      SELECT 1
        FROM screenings s2
        JOIN rooms r2 ON r2.room_id = s2.room_id
       WHERE s2.movie_id = s.movie_id
         AND r2.theater_id = r.theater_id
         AND (s2.start_time AT TIME ZONE '${LOCAL_TZ}')::date
           = (s.start_time  AT TIME ZONE '${LOCAL_TZ}')::date
         AND s2.start_time < s.start_time
    ) AS is_first_showing,
    (
      SELECT COUNT(*)
        FROM seats se
       WHERE se.room_id = s.room_id
         AND se.status = 'available'
         AND se.is_owner_seat = FALSE
         AND NOT EXISTS (
           SELECT 1
             FROM booking_seats bs
             JOIN bookings b ON b.booking_id = bs.booking_id
            WHERE bs.screening_id = s.screening_id
              AND bs.seat_id = se.seat_id
              AND b.booking_status IN ('pending', 'confirmed')
         )
         AND NOT EXISTS (
           SELECT 1
             FROM seat_holds h
            WHERE h.screening_id = s.screening_id
              AND h.seat_id = se.seat_id
              AND h.hold_status = 'active'
              AND h.expires_at > NOW()
         )
    )::int AS available_seats
  FROM screenings s
  JOIN movies m   ON m.movie_id = s.movie_id
  JOIN rooms r    ON r.room_id = s.room_id
  JOIN theaters t ON t.theater_id = r.theater_id
`;

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function toScreening(row) {
  return {
    id: row.screening_id,
    movieId: row.movie_id,
    movieTitle: row.movie_title,
    ageRating: row.age_rating,
    ageWarning: getAgeWarning(row.age_rating),
    theaterId: row.theater_id,
    city: row.city,
    roomId: row.room_id,
    roomName: row.room_name,
    startTime: row.start_time, // ads start
    doorsOpen: addMinutes(row.start_time, -DOORS_BEFORE_MINUTES),
    movieStartTime: addMinutes(row.start_time, ADS_MINUTES),
    endTime: row.end_time,
    isFirstShowing: row.is_first_showing,
    basePriceCents: Math.round(Number(row.ticket_price) * 100),
    availableSeats: row.available_seats,
  };
}

// Filters are optional. By default only upcoming screenings are returned.
async function getScreenings({ theaterId, movieId, date } = {}) {
  const conditions = [];
  const values = [];

  if (theaterId) {
    values.push(theaterId);
    conditions.push(`r.theater_id = $${values.length}`);
  }
  if (movieId) {
    values.push(movieId);
    conditions.push(`s.movie_id = $${values.length}`);
  }
  if (date) {
    values.push(date);
    conditions.push(`(s.start_time AT TIME ZONE '${LOCAL_TZ}')::date = $${values.length}::date`);
  } else {
    conditions.push('s.start_time > NOW()');
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const result = await pool.query(`${BASE_QUERY} ${where} ORDER BY s.start_time`, values);
  return result.rows.map(toScreening);
}

async function getScreeningById(screeningId) {
  const result = await pool.query(`${BASE_QUERY} WHERE s.screening_id = $1`, [screeningId]);
  if (result.rows.length === 0) return null;
  return toScreening(result.rows[0]);
}

module.exports = { getScreenings, getScreeningById };
