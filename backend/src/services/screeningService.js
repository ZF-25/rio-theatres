const pool = require('../config/db');
const { toApiId } = require('../utils/validate');
const { seatStatusSql } = require('./seatStatus');
const { TIME_ZONE } = require('./cinemaService');

// The database has no language, subtitle or cancellation columns yet, so
// every screening is "scheduled" with unknown language (section 5 allows
// null / empty values). When Marina adds those columns, map them here.
const BASE = `
  SELECT
    s.screening_id, s.movie_id, m.title AS movie_title,
    r.theater_id, t.name AS theater_name, t.city,
    s.room_id, r.room_name, s.start_time, s.end_time,
    (SELECT COUNT(*) FROM seats se
      WHERE se.room_id = s.room_id
        AND ${seatStatusSql('s.screening_id', 'se')} = 'available')::int AS available_seats
  FROM screenings s
  JOIN movies m   ON m.movie_id = s.movie_id
  JOIN rooms r    ON r.room_id = s.room_id
  JOIN theaters t ON t.theater_id = r.theater_id`;

function toScreening(row) {
  return {
    id: toApiId(row.screening_id),
    movieId: toApiId(row.movie_id),
    movieTitle: row.movie_title,
    cinemaId: toApiId(row.theater_id),
    cinemaName: `${row.theater_name} ${row.city}`,
    roomId: toApiId(row.room_id),
    roomName: row.room_name,
    startsAt: row.start_time.toISOString(),
    endsAt: row.end_time.toISOString(),
    spokenLanguage: null,
    subtitles: [],
    status: 'scheduled',
    availableSeatCount: row.available_seats,
  };
}

// Public list: only future screenings, sorted by startsAt, then ID.
// `date` is a calendar day in Helsinki, not the visitor's timezone.
async function listScreenings({ movieId, cinemaId, roomId, date, pageSize, offset }) {
  const values = [];
  const where = ['s.start_time > NOW()'];
  if (movieId) where.push(`s.movie_id = $${values.push(movieId)}`);
  if (cinemaId) where.push(`r.theater_id = $${values.push(cinemaId)}`);
  if (roomId) where.push(`s.room_id = $${values.push(roomId)}`);
  if (date) {
    where.push(`(s.start_time AT TIME ZONE '${TIME_ZONE}')::date = $${values.push(date)}::date`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [rows, count] = await Promise.all([
    pool.query(
      `${BASE} ${whereSql}
        ORDER BY s.start_time, s.screening_id
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM screenings s JOIN rooms r ON r.room_id = s.room_id ${whereSql}`,
      values
    ),
  ]);
  return { items: rows.rows.map(toScreening), totalItems: count.rows[0].n };
}

// Detail for deep links: past screenings are returned too.
async function getScreening(screeningId) {
  const { rows } = await pool.query(`${BASE} WHERE s.screening_id = $1`, [screeningId]);
  return rows.length ? toScreening(rows[0]) : null;
}

module.exports = { listScreenings, getScreening };
