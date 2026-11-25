
const pool = require('../config/db');
const { toApiId } = require('../utils/validate');
const { seatStatusSql } = require('./seatStatus');
const { TIME_ZONE } = require('./cinemaService');
const { httpError, notFound, validationError } = require('../utils/httpError');
const staffReservationService = require('./staffReservationService');
const ADVERTISING_MINUTES = 12;

const BASE = `
  SELECT
    s.screening_id, s.movie_id, m.title AS movie_title,
    r.theater_id, t.name AS theater_name, t.city,
   s.room_id, r.room_name, s.start_time, s.end_time,
s.spoken_language, s.subtitles, s.status,
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
    spokenLanguage: row.spoken_language ?? null,
    subtitles: row.subtitles ?? [],
    status: row.status ?? 'scheduled',
    availableSeatCount: row.available_seats,
  };
}

async function listScreenings({ movieId, cinemaId, roomId, date, pageSize, offset }) {
  const values = [];
 const where = [
  "s.start_time > NOW()",
  "s.status = 'scheduled'",
];

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
      `SELECT COUNT(*)::int AS n
       FROM screenings s JOIN rooms r ON r.room_id = s.room_id ${whereSql}`,
      values
    ),
  ]);

  return { items: rows.rows.map(toScreening), totalItems: count.rows[0].n };
}

async function getScreening(screeningId) {
  const { rows } = await pool.query(
    `${BASE} WHERE s.screening_id = $1`,
    [screeningId]
  );
  return rows.length ? toScreening(rows[0]) : null;
}

// Owner list includes past screenings as required by API Contract v1.0.
async function listOwnerScreenings({
  movieId, cinemaId, roomId, date, pageSize, offset,
}) {
  const values = [];
  const where = [];

  if (movieId) where.push(`s.movie_id = $${values.push(movieId)}`);
  if (cinemaId) where.push(`r.theater_id = $${values.push(cinemaId)}`);
  if (roomId) where.push(`s.room_id = $${values.push(roomId)}`);

  if (date) {
    where.push(`(s.start_time AT TIME ZONE '${TIME_ZONE}')::date = $${values.push(date)}::date`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows, count] = await Promise.all([
    pool.query(
      `${BASE} ${whereSql}
       ORDER BY s.start_time, s.screening_id
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n
       FROM screenings s JOIN rooms r ON r.room_id = s.room_id ${whereSql}`,
      values
    ),
  ]);

  return { items: rows.rows.map(toScreening), totalItems: count.rows[0].n };
}

function parseScreeningInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('body', 'A JSON object is required.');
  }

  const allowed = new Set([
    'movieId', 'roomId', 'startsAt', 'spokenLanguage', 'subtitles',
  ]);

  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw validationError(key, 'Unknown field.');
    }
  }

  for (const field of ['movieId', 'roomId', 'startsAt']) {
    if (input[field] === undefined) {
      throw validationError(field, `${field} is required.`);
    }
  }

  const parseId = (value, field) => {
    if (
      typeof value !== 'string' ||
      !/^[1-9]\d{0,9}$/.test(value) ||
      Number(value) > 2147483647
    ) {
      throw validationError(field, 'Must be a valid ID string.');
    }
    return Number(value);
  };

  if (typeof input.startsAt !== 'string') {
    throw validationError('startsAt', 'Use an ISO 8601 timestamp.');
  }

  const instant = new Date(input.startsAt);

  if (
    Number.isNaN(instant.getTime()) ||
    !/(Z|[+-]\d{2}:\d{2})$/i.test(input.startsAt) ||
    instant.getUTCSeconds() !== 0 ||
    instant.getUTCMilliseconds() !== 0
  ) {
    throw validationError(
      'startsAt',
      'Use a valid ISO 8601 instant with minute precision and an explicit timezone.'
    );
  }

  if (instant.getTime() <= Date.now()) {
    throw validationError('startsAt', 'Screening must start in the future.');
  }

  const spokenLanguage = input.spokenLanguage === undefined
    ? null
    : input.spokenLanguage;

  if (
    spokenLanguage !== null &&
    (typeof spokenLanguage !== 'string' ||
      spokenLanguage.trim().length === 0 ||
      spokenLanguage.trim().length > 35)
  ) {
    throw validationError('spokenLanguage', 'Use a language code or null.');
  }

  const subtitles = input.subtitles === undefined ? [] : input.subtitles;

  if (
    !Array.isArray(subtitles) ||
    subtitles.some((item) =>
      typeof item !== 'string' ||
      item.trim().length < 2 ||
      item.trim().length > 35
    ) ||
    new Set(subtitles.map((item) => item.trim())).size !== subtitles.length
  ) {
    throw validationError('subtitles', 'Subtitles must be unique language codes.');
  }

  return {
    movieId: parseId(input.movieId, 'movieId'),
    roomId: parseId(input.roomId, 'roomId'),
    startsAt: instant,
    spokenLanguage: spokenLanguage === null ? null : spokenLanguage.trim(),
    subtitles: subtitles.map((item) => item.trim()),
  };
}

async function getScreeningRuntime(client, movieId) {
  const result = await client.query(
    `SELECT duration_minutes
     FROM movies
     WHERE movie_id = $1`,
    [movieId]
  );

  if (!result.rows.length) {
    throw notFound('Movie not found.');
  }

  const duration = result.rows[0].duration_minutes;

  if (!Number.isInteger(duration) || duration <= 0) {
    throw validationError('movieId', 'Movie must have a valid positive runtime.');
  }

  return duration;
}

async function lockRoom(client, roomId) {
  const result = await client.query(
    `SELECT room_id
     FROM rooms
     WHERE room_id = $1
     FOR UPDATE`,
    [roomId]
  );

  if (!result.rows.length) {
    throw notFound('Room not found.');
  }
}

async function ensureNoOverlap(client, roomId, startsAt, endsAt, excludeId = null) {
  const result = await client.query(
    `SELECT screening_id
     FROM screenings
     WHERE room_id = $1
       AND ($4::int IS NULL OR screening_id <> $4)
       AND start_time < $3
       AND end_time > $2
     LIMIT 1`,
    [roomId, startsAt, endsAt, excludeId]
  );

  if (result.rows.length) {
    throw httpError(
      409,
      'SCREENING_OVERLAP',
      'Another screening already occupies this room during the requested time.'
    );
  }
}

function getDefaultTicketPrice() {
  const price = Number(process.env.DEFAULT_TICKET_PRICE);

  if (!Number.isFinite(price) || price < 0) {
    throw new Error('DEFAULT_TICKET_PRICE must be configured in the backend environment.');
  }

  return price.toFixed(2);
}

async function createScreening(input) {
  const data = parseScreeningInput(input);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await lockRoom(client, data.roomId);

    const duration = await getScreeningRuntime(client, data.movieId);
    const endsAt = new Date(
      data.startsAt.getTime() +
      (ADVERTISING_MINUTES + duration) * 60 * 1000
    );

    await ensureNoOverlap(client, data.roomId, data.startsAt, endsAt);

    const price = getDefaultTicketPrice();

  const inserted = await client.query(
  `INSERT INTO screenings
     (
       movie_id,
       room_id,
       start_time,
       end_time,
       ticket_price,
       spoken_language,
       subtitles
     )
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   RETURNING screening_id`,
  [
    data.movieId,
    data.roomId,
    data.startsAt,
    endsAt,
    price,
    data.spokenLanguage,
    data.subtitles,
  ]
);

    await client.query('COMMIT');

    return getScreening(inserted.rows[0].screening_id);
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23P01') {
      throw httpError(
        409,
        'SCREENING_OVERLAP',
        'Another screening already occupies this room during the requested time.'
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

async function updateScreening(screeningId, input) {
  const data = parseScreeningInput(input);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `SELECT screening_id, room_id, ticket_price, status
      FROM screenings
      WHERE screening_id = $1`,
      [screeningId]
    );

    if (!currentResult.rows.length) {
      throw notFound('Screening not found.');
    }

    const current = currentResult.rows[0];

    // Lock both rooms in deterministic order to reduce deadlock risk.
    const roomIds = [...new Set([current.room_id, data.roomId])].sort((a, b) => a - b);

    for (const roomId of roomIds) {
      await lockRoom(client, roomId);
    }

    const lockedScreening = await client.query(
      `SELECT screening_id, room_id, ticket_price, status
       FROM screenings
       WHERE screening_id = $1
       FOR UPDATE`,
      [screeningId]
    );

    if (!lockedScreening.rows.length) {
      throw notFound('Screening not found.');
    }
   if (lockedScreening.rows[0].status === 'cancelled') {
  throw httpError(
    409,
    'SCREENING_LOCKED',
    'Cancelled screenings cannot be edited.'
  );
}
    if (lockedScreening.rows[0].room_id !== current.room_id) {
      throw httpError(
        409,
        'SCREENING_LOCKED',
        'Screening changed concurrently. Reload it before editing.'
      );
    }

  const bookings = await client.query(
  `SELECT 1
   FROM bookings b
   JOIN payments p ON p.booking_id = b.booking_id
   WHERE b.screening_id = $1
     AND p.payment_status = 'successful'
   LIMIT 1`,
  [screeningId]
);
    const holds = await client.query(
      `SELECT 1
       FROM seat_holds
       WHERE screening_id = $1
         AND hold_status = 'active'
         AND expires_at > NOW()
       LIMIT 1`,
      [screeningId]
    );
const staffReservations = await client.query(
  `SELECT 1
   FROM staff_reservations
   WHERE screening_id = $1
   LIMIT 1`,
  [screeningId]
);

const checkoutHolds = await client.query(
  `SELECT 1
   FROM checkout_holds
   WHERE screening_id = $1
     AND status = 'active'
     AND expires_at > NOW()
   LIMIT 1`,
  [screeningId]
);
    if (
  bookings.rows.length ||
  staffReservations.rows.length ||
  holds.rows.length ||
  checkoutHolds.rows.length
) {
      throw httpError(
        409,
        'SCREENING_LOCKED',
        'Screening cannot be edited because it has paid bookings, staff reservations or active holds.'
      );
    }

    const duration = await getScreeningRuntime(client, data.movieId);
    const endsAt = new Date(
      data.startsAt.getTime() +
      (ADVERTISING_MINUTES + duration) * 60 * 1000
    );

    await ensureNoOverlap(client, data.roomId, data.startsAt, endsAt, screeningId);

await client.query(
  `UPDATE screenings
   SET movie_id = $1,
       room_id = $2,
       start_time = $3,
       end_time = $4,
       spoken_language = $5,
       subtitles = $6
   WHERE screening_id = $7`,
  [
    data.movieId,
    data.roomId,
    data.startsAt,
    endsAt,
    data.spokenLanguage,
    data.subtitles,
    screeningId,
  ]
);
    await client.query('COMMIT');

    return getScreening(screeningId);
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23P01') {
      throw httpError(
        409,
        'SCREENING_OVERLAP',
        'Another screening already occupies this room during the requested time.'
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

async function cancelScreening(screeningId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT screening_id, status
       FROM screenings
       WHERE screening_id = $1
       FOR UPDATE`,
      [screeningId]
    );

    if (!result.rows.length) {
      throw notFound('Screening not found.');
    }

    // Cancellation is idempotent.
    if (result.rows[0].status === 'cancelled') {
      await client.query('COMMIT');
      return getScreening(screeningId);
    }

    // Cancel active staff reservations and release their seats.
    await staffReservationService.cancelReservationsForScreening(
      client,
      screeningId
    );

    // Release active seat holds.
    await client.query(
      `UPDATE seat_holds
       SET hold_status = 'released'
       WHERE screening_id = $1
         AND hold_status = 'active'`,
      [screeningId]
    );

    // End active checkout holds.
   await client.query(
  `UPDATE checkout_holds
   SET status = 'released',
       ended_at = NOW()
   WHERE screening_id = $1
     AND status = 'active'`,
  [screeningId]
);
    await client.query(
      `UPDATE screenings
       SET status = 'cancelled'
       WHERE screening_id = $1`,
      [screeningId]
    );

    await client.query('COMMIT');
    return getScreening(screeningId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteScreening(screeningId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT screening_id, status
       FROM screenings
       WHERE screening_id = $1
       FOR UPDATE`,
      [screeningId]
    );

    if (!result.rows.length) {
      throw notFound('Screening not found.');
    }

    const bookings = await client.query(
  `SELECT 1
   FROM bookings
   WHERE screening_id = $1
   LIMIT 1`,
  [screeningId]
);

const staffReservations = await client.query(
  `SELECT 1
   FROM staff_reservations
   WHERE screening_id = $1
   LIMIT 1`,
  [screeningId]
);

const holds = await client.query(
  `SELECT 1
   FROM seat_holds
   WHERE screening_id = $1
     AND hold_status = 'active'
     AND expires_at > NOW()
   LIMIT 1`,
  [screeningId]
);

const checkoutHolds = await client.query(
  `SELECT 1
   FROM checkout_holds
   WHERE screening_id = $1
     AND status = 'active'
     AND expires_at > NOW()
   LIMIT 1`,
  [screeningId]
);

if (
  bookings.rows.length ||
  staffReservations.rows.length ||
  holds.rows.length ||
  checkoutHolds.rows.length
) {
  throw httpError(
    409,
    'SCREENING_LOCKED',
   'Screening cannot be deleted because it has booking, reservation or active hold history.'
  );
}

    await client.query(
      `DELETE FROM screenings
       WHERE screening_id = $1`,
      [screeningId]
    );

    await client.query('COMMIT');

    return { id: String(screeningId), deleted: true };
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23503') {
      throw httpError(
        409,
        'SCREENING_LOCKED',
        'Screening has related records and cannot be deleted.'
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listScreenings,
  getScreening,
  listOwnerScreenings,
  createScreening,
  updateScreening,
  cancelScreening,
deleteScreening,
};
