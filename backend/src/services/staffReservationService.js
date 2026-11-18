
const crypto = require('crypto');
const pool = require('../config/db');
const { seatStatusSql } = require('./seatStatus');
const { seatLabelsForRoom } = require('./seatService');
const { mapDatabaseRoleToApiRole } = require('../utils/roleMapper');

const isDbId = (value) =>
  typeof value === 'string' &&
  /^[1-9]\d{0,9}$/.test(value) &&
  Number(value) <= 2147483647;

function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function fail(status, code, message, details = {}, fieldErrors = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  error.fieldErrors = fieldErrors;
  error.expose = true;
  throw error;
}

function validateId(value, field = 'id') {
  if (!isDbId(String(value))) {
    fail(422, 'VALIDATION_ERROR', `Invalid ${field}.`, {}, {
      [field]: 'A positive integer ID is required.'
    });
  }
  return Number(value);
}

function validateSeatIds(seatIds) {
  if (!Array.isArray(seatIds) || seatIds.length === 0) {
    fail(422, 'VALIDATION_ERROR', 'Select at least one seat.', {}, {
      seatIds: 'At least one seat is required.'
    });
  }

  if (!seatIds.every(isDbId)) {
    fail(422, 'VALIDATION_ERROR', 'Invalid seat IDs.', {}, {
      seatIds: 'Every seat ID must be a positive integer string.'
    });
  }

  const ids = seatIds.map(Number);

  if (new Set(ids).size !== ids.length) {
    fail(422, 'VALIDATION_ERROR', 'Duplicate seat IDs.', {}, {
      seatIds: 'Each seat can be selected only once.'
    });
  }

  return ids;
}

function validateEditableFields(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail(422, 'VALIDATION_ERROR', 'Send a JSON object.');
  }

  const allowed = ['seatIds', 'customerName', 'note', 'version'];
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));

  if (unknown.length) {
    fail(422, 'VALIDATION_ERROR', 'Unknown request field.', {}, {
      [unknown[0]]: 'Unknown field.'
    });
  }

  const customerName =
    typeof body.customerName === 'string'
      ? body.customerName.trim()
      : '';

  if (customerName.length < 1 || customerName.length > 100) {
    fail(422, 'VALIDATION_ERROR', 'Invalid customer name.', {}, {
      customerName: 'Name must contain 1–100 characters.'
    });
  }

  const note = body.note === undefined ? '' : body.note;

  if (typeof note !== 'string' || note.length > 500) {
    fail(422, 'VALIDATION_ERROR', 'Invalid note.', {}, {
      note: 'Note must be a string of at most 500 characters.'
    });
  }

  if (!Number.isInteger(body.version) || body.version < 1) {
    fail(422, 'VALIDATION_ERROR', 'Invalid reservation version.', {}, {
      version: 'Version must be a positive integer.'
    });
  }

  return {
    seatIds: validateSeatIds(body.seatIds),
    customerName,
    note,
    version: body.version
  };
}

function validateCreateInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail(422, 'VALIDATION_ERROR', 'Send a JSON object.');
  }

  const allowed = ['screeningId', 'seatIds', 'customerName', 'note'];
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));

  if (unknown.length) {
    fail(422, 'VALIDATION_ERROR', 'Unknown request field.', {}, {
      [unknown[0]]: 'Unknown field.'
    });
  }

  if (!isDbId(body.screeningId)) {
    fail(404, 'NOT_FOUND', 'Screening not found.');
  }

  const customerName =
    typeof body.customerName === 'string'
      ? body.customerName.trim()
      : '';

  if (customerName.length < 1 || customerName.length > 100) {
    fail(422, 'VALIDATION_ERROR', 'Invalid customer name.', {}, {
      customerName: 'Name must contain 1–100 characters.'
    });
  }

  const note = body.note === undefined ? '' : body.note;

  if (typeof note !== 'string' || note.length > 500) {
    fail(422, 'VALIDATION_ERROR', 'Invalid note.', {}, {
      note: 'Note must be a string of at most 500 characters.'
    });
  }

  return {
    screeningId: Number(body.screeningId),
    seatIds: validateSeatIds(body.seatIds),
    customerName,
    note
  };
}

function makeReference() {
  return `RES-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

async function inTransaction(work) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function apiRole(user) {
  return mapDatabaseRoleToApiRole(user.role);
}

function isOwner(user) {
  return apiRole(user) === 'owner';
}

// Returns a reservation only if it is visible to this user.
// Owner: all cinemas.
// Cashier: currently assigned cinema only.
async function loadVisibleReservation(db, reservationId, user, lock = false) {
  const result = await db.query(
    `SELECT
       sr.reservation_id,
       sr.screening_id,
       sr.room_id,
       sr.created_by,
       sr.status,
       sr.version,
       sr.customer_name,
       sr.note,
       r.theater_id
     FROM staff_reservations sr
     JOIN screenings sc ON sc.screening_id = sr.screening_id
     JOIN rooms r ON r.room_id = sc.room_id
     WHERE sr.reservation_id = $1
     ${lock ? 'FOR UPDATE OF sr' : ''}`,
    [reservationId]
  );

  const reservation = result.rows[0];

  if (!reservation) return null;

  if (isOwner(user)) return reservation;

  if (apiRole(user) !== 'cashier') {
    fail(403, 'FORBIDDEN', 'You do not have permission to access this resource.');
  }

  const assignment = await db.query(
    `SELECT 1
       FROM cashier_theaters
      WHERE cashier_id = $1
        AND theater_id = $2`,
    [user.user_id, reservation.theater_id]
  );

  if (!assignment.rows.length) return null;

  return reservation;
}

async function getReservation(db, reservationId) {
  const result = await db.query(
    `SELECT
       sr.reservation_id,
       sr.reference,
       sr.screening_id,
       sr.customer_name,
       sr.note,
       sr.status,
       sr.cancellation_reason,
       sr.version,
       sr.created_at,
       sr.updated_at,
       sr.room_id,
       u.user_id AS creator_id,
       u.first_name,
       u.last_name
     FROM staff_reservations sr
     JOIN users u ON u.user_id = sr.created_by
     WHERE sr.reservation_id = $1`,
    [reservationId]
  );

  const row = result.rows[0];
  if (!row) return null;

  const seatResult = await db.query(
    `SELECT seat_id
       FROM staff_reservation_seats
      WHERE reservation_id = $1
        AND is_active = TRUE
      ORDER BY seat_id`,
    [reservationId]
  );

  const labels = await seatLabelsForRoom(db, row.room_id);

  return {
    id: String(row.reservation_id),
    reference: row.reference,
    screeningId: String(row.screening_id),
    seats: seatResult.rows.map(({ seat_id }) => ({
      id: String(seat_id),
      label: labels.get(seat_id)?.label ?? '',
      rowLabel: labels.get(seat_id)?.rowLabel ?? ''
    })),
    customerName: row.customer_name,
    note: row.note,
    createdBy: {
      id: String(row.creator_id),
      firstName: row.first_name,
      lastName: row.last_name,
      name: [row.first_name, row.last_name].filter(Boolean).join(' ')
    },
    status: row.status,
    cancellationReason: row.cancellation_reason,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function lockScreening(db, screeningId, requireFuture = true) {
  const result = await db.query(
    `SELECT
       sc.screening_id,
       sc.room_id,
       sc.start_time,
       r.theater_id
     FROM screenings sc
     JOIN rooms r ON r.room_id = sc.room_id
     WHERE sc.screening_id = $1
     FOR UPDATE OF sc`,
    [screeningId]
  );

  const screening = result.rows[0];

  if (!screening) {
    fail(404, 'NOT_FOUND', 'Screening not found.');
  }

  if (requireFuture && new Date(screening.start_time) <= new Date()) {
    fail(409, 'SCREENING_STARTED', 'This screening has already started.');
  }

  return screening;
}

async function checkTheaterAccess(db, user, theaterId) {
  if (isOwner(user)) return;

  if (apiRole(user) !== 'cashier') {
    fail(403, 'FORBIDDEN', 'You do not have permission to access this resource.');
  }

  const result = await db.query(
    `SELECT 1
       FROM cashier_theaters
      WHERE cashier_id = $1
        AND theater_id = $2`,
    [user.user_id, theaterId]
  );

  if (!result.rows.length) {
    fail(403, 'THEATER_ACCESS_DENIED', 'You do not have access to this theater.');
  }
}

async function checkSeats(db, screeningId, roomId, seatIds, ownReservationId = null) {
  const result = await db.query(
    `SELECT
       se.seat_id,
       ${seatStatusSql('$1', 'se')} AS status,
       EXISTS (
         SELECT 1
           FROM staff_reservation_seats srs
          WHERE srs.screening_id = $1
            AND srs.seat_id = se.seat_id
            AND srs.reservation_id = $4
            AND srs.is_active = TRUE
       ) AS belongs_to_own_reservation
     FROM seats se
     WHERE se.room_id = $2
       AND se.seat_id = ANY($3::integer[])
     ORDER BY se.seat_id`,
    [screeningId, roomId, seatIds, ownReservationId]
  );

  const foundIds = new Set(result.rows.map((row) => row.seat_id));

  const unavailableSeatIds = seatIds.filter((id) => {
    if (!foundIds.has(id)) return true;

    const row = result.rows.find((item) => item.seat_id === id);

    return (
      row.status !== 'available' &&
      !(row.status === 'staff_reserved' && row.belongs_to_own_reservation)
    );
  });

  if (unavailableSeatIds.length) {
    fail(
      409,
      'SEATS_UNAVAILABLE',
      'One or more selected seats are unavailable.',
      { unavailableSeatIds: unavailableSeatIds.map(String) }
    );
  }
}

async function createReservation(user, body) {
  const input = validateCreateInput(body);

  return inTransaction(async (db) => {
    // Always lock the screening before checking seat availability.
    const screening = await lockScreening(db, input.screeningId, true);

    await checkTheaterAccess(db, user, screening.theater_id);

    await checkSeats(
      db,
      screening.screening_id,
      screening.room_id,
      input.seatIds
    );

    const inserted = await db.query(
      `INSERT INTO staff_reservations
         (reference, screening_id, room_id, created_by, customer_name, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING reservation_id`,
      [
        makeReference(),
        screening.screening_id,
        screening.room_id,
        user.user_id,
        input.customerName,
        input.note
      ]
    );

    const reservationId = inserted.rows[0].reservation_id;

    for (const seatId of input.seatIds) {
      await db.query(
        `INSERT INTO staff_reservation_seats
           (reservation_id, screening_id, room_id, seat_id)
         VALUES ($1, $2, $3, $4)`,
        [reservationId, screening.screening_id, screening.room_id, seatId]
      );
    }

    return getReservation(db, reservationId);
  });
}

async function getReservationById(user, rawId) {
  const reservationId = validateId(rawId);

  const visible = await loadVisibleReservation(
    pool,
    reservationId,
    user
  );

  if (!visible) {
    fail(404, 'NOT_FOUND', 'Reservation not found.');
  }

  return getReservation(pool, reservationId);
}

async function updateReservation(user, rawId, body) {
  const reservationId = validateId(rawId);
  const input = validateEditableFields(body);

  return inTransaction(async (db) => {
    // Initial lookup obtains immutable screening ID.
    const initial = await db.query(
      `SELECT screening_id
         FROM staff_reservations
        WHERE reservation_id = $1`,
      [reservationId]
    );

    if (!initial.rows.length) {
      fail(404, 'NOT_FOUND', 'Reservation not found.');
    }

    // Lock order: screening first, reservation second.
    const screening = await lockScreening(
      db,
      initial.rows[0].screening_id,
      true
    );

    const reservation = await loadVisibleReservation(
      db,
      reservationId,
      user,
      true
    );

    if (!reservation) {
      fail(404, 'NOT_FOUND', 'Reservation not found.');
    }

    if (reservation.status !== 'active') {
      fail(409, 'RESERVATION_INACTIVE', 'This reservation is no longer active.');
    }

    if (reservation.version !== input.version) {
      fail(
        409,
        'RESERVATION_CHANGED',
        'This reservation has changed.',
        { currentVersion: reservation.version }
      );
    }

    await checkSeats(
      db,
      screening.screening_id,
      screening.room_id,
      input.seatIds,
      reservationId
    );

    const currentSeatsResult = await db.query(
      `SELECT seat_id
         FROM staff_reservation_seats
        WHERE reservation_id = $1
          AND is_active = TRUE`,
      [reservationId]
    );

    const currentSeatIds = currentSeatsResult.rows.map((row) => row.seat_id);
    const requestedSet = new Set(input.seatIds);
    const currentSet = new Set(currentSeatIds);

    const sameSeats =
  currentSeatIds.length === input.seatIds.length &&
  currentSeatIds.every((id) => requestedSet.has(id));

const sameCustomerName =
  reservation.customer_name === input.customerName;

const sameNote =
  reservation.note === input.note;

// Do not increment version when nothing has changed.
if (sameSeats && sameCustomerName && sameNote) {
  return getReservation(db, reservationId);
}

    const seatsToAdd = input.seatIds.filter((id) => !currentSet.has(id));
    const seatsToRemove = currentSeatIds.filter((id) => !requestedSet.has(id));

    // Secure new seats first. Old seats remain active until inserts succeed.
    for (const seatId of seatsToAdd) {
      await db.query(
        `INSERT INTO staff_reservation_seats
           (reservation_id, screening_id, room_id, seat_id)
         VALUES ($1, $2, $3, $4)`,
        [reservationId, screening.screening_id, screening.room_id, seatId]
      );
    }

    if (seatsToRemove.length) {
      await db.query(
        `UPDATE staff_reservation_seats
            SET is_active = FALSE
          WHERE reservation_id = $1
            AND seat_id = ANY($2::integer[])
            AND is_active = TRUE`,
        [reservationId, seatsToRemove]
      );
    }

    await db.query(
      `UPDATE staff_reservations
          SET customer_name = $1,
              note = $2,
              version = version + 1,
              updated_at = NOW()
        WHERE reservation_id = $3`,
      [input.customerName, input.note, reservationId]
    );

    return getReservation(db, reservationId);
  });
}

async function cancelReservation(user, rawId, body) {
  const reservationId = validateId(rawId);

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== 'version') ||
    !Number.isInteger(body.version) ||
    body.version < 1
  ) {
    fail(422, 'VALIDATION_ERROR', 'A positive integer version is required.', {}, {
      version: 'Version must be a positive integer.'
    });
  }

  return inTransaction(async (db) => {
    const initial = await db.query(
      `SELECT screening_id
         FROM staff_reservations
        WHERE reservation_id = $1`,
      [reservationId]
    );

    if (!initial.rows.length) {
      fail(404, 'NOT_FOUND', 'Reservation not found.');
    }

    const screening = await lockScreening(
      db,
      initial.rows[0].screening_id,
      false
    );

    const reservation = await loadVisibleReservation(
      db,
      reservationId,
      user,
      true
    );

    if (!reservation) {
      fail(404, 'NOT_FOUND', 'Reservation not found.');
    }

    // Repeated cancellation is idempotent, even with an old version.
    if (reservation.status === 'cancelled') {
      return getReservation(db, reservationId);
    }

    if (reservation.version !== body.version) {
      fail(
        409,
        'RESERVATION_CHANGED',
        'This reservation has changed.',
        { currentVersion: reservation.version }
      );
    }

    await db.query(
      `UPDATE staff_reservations
          SET status = 'cancelled',
              cancellation_reason = 'staff_cancelled',
              version = version + 1,
              updated_at = NOW()
        WHERE reservation_id = $1`,
      [reservationId]
    );

    await db.query(
      `UPDATE staff_reservation_seats
          SET is_active = FALSE
        WHERE reservation_id = $1
          AND is_active = TRUE`,
      [reservationId]
    );

    return getReservation(db, reservationId);
  });
}

async function listReservations(user, query) {
  const {
    search = '',
    cinemaId,
    screeningId,
    date,
    status,
    page = '1',
    pageSize = '20'
  } = query;

  const pageNumber = Number(page);
  const limit = Number(pageSize);

  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    fail(422, 'VALIDATION_ERROR', 'Invalid pagination parameters.');
  }

  if (typeof search !== 'string') {
    fail(422, 'VALIDATION_ERROR', 'Search must be a string.');
  }

  if (status !== undefined && !['active', 'cancelled'].includes(status)) {
    fail(422, 'VALIDATION_ERROR', 'Invalid reservation status.');
  }

  const values = [];
  const conditions = [];

  if (!isOwner(user)) {
    if (apiRole(user) !== 'cashier') {
      fail(403, 'FORBIDDEN', 'You do not have permission to access this resource.');
    }

    values.push(user.user_id);
    conditions.push(
      `EXISTS (
         SELECT 1
           FROM cashier_theaters ct
          WHERE ct.cashier_id = $${values.length}
            AND ct.theater_id = r.theater_id
       )`
    );
  }

  if (cinemaId !== undefined) {
    if (!isDbId(String(cinemaId))) {
      fail(422, 'VALIDATION_ERROR', 'Invalid cinemaId.');
    }

    values.push(Number(cinemaId));
    conditions.push(`r.theater_id = $${values.length}`);

    if (!isOwner(user)) {
      const access = await pool.query(
        `SELECT 1
           FROM cashier_theaters
          WHERE cashier_id = $1
            AND theater_id = $2`,
        [user.user_id, Number(cinemaId)]
      );

      if (!access.rows.length) {
        fail(403, 'THEATER_ACCESS_DENIED', 'You do not have access to this theater.');
      }
    }
  }

  if (screeningId !== undefined) {
    if (!isDbId(String(screeningId))) {
      fail(422, 'VALIDATION_ERROR', 'Invalid screeningId.');
    }
    values.push(Number(screeningId));
    conditions.push(`sr.screening_id = $${values.length}`);
  }

  if (status !== undefined) {
    values.push(status);
    conditions.push(`sr.status = $${values.length}`);
  }

  if (search.trim()) {
    values.push(`%${search.trim()}%`);
    conditions.push(
      `(sr.reference ILIKE $${values.length}
        OR sr.customer_name ILIKE $${values.length})`
    );
  }

if (date !== undefined) {
  if (!isValidCalendarDate(date)) {
    fail(422, 'VALIDATION_ERROR', 'Invalid date. Use a real date in YYYY-MM-DD format.');
  }

  values.push(date);
  conditions.push(
    `(sc.start_time AT TIME ZONE 'Europe/Helsinki')::date = $${values.length}::date`
  );
}

  const where = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM staff_reservations sr
       JOIN screenings sc ON sc.screening_id = sr.screening_id
       JOIN rooms r ON r.room_id = sc.room_id
       ${where}`,
    values
  );

  const totalItems = countResult.rows[0].total;
  const offset = (pageNumber - 1) * limit;

  const listResult = await pool.query(
    `SELECT sr.reservation_id
       FROM staff_reservations sr
       JOIN screenings sc ON sc.screening_id = sr.screening_id
       JOIN rooms r ON r.room_id = sc.room_id
       ${where}
      ORDER BY sr.created_at DESC, sr.reservation_id DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  const data = [];

  for (const row of listResult.rows) {
    data.push(await getReservation(pool, row.reservation_id));
  }

  return {
    data,
    meta: {
      page: pageNumber,
      pageSize: limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    }
  };
}

/**
 * Cancels all active staff reservations for a screening.
 *
 * The caller must already have an open transaction and must
 * lock the screening row before calling this function.
 *
 * This function does not BEGIN, COMMIT or ROLLBACK.
 */
async function cancelReservationsForScreening(client, screeningId) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError(
      'A valid database client is required.'
    );
  }

  if (!Number.isInteger(screeningId) || screeningId <= 0) {
    throw new TypeError(
      'A valid screening ID is required.'
    );
  }

  // Cancel only active reservations and preserve their history.
  const cancelledResult = await client.query(
    `UPDATE staff_reservations
        SET status = 'cancelled',
            cancellation_reason = 'screening_cancelled',
            version = version + 1,
            updated_at = NOW()
      WHERE screening_id = $1
        AND status = 'active'
      RETURNING reservation_id`,
    [screeningId]
  );

  const reservationIds = cancelledResult.rows.map(
    (row) => row.reservation_id
  );

  // Release seats belonging to the reservations just cancelled.
  if (reservationIds.length > 0) {
    await client.query(
      `UPDATE staff_reservation_seats
          SET is_active = FALSE
        WHERE reservation_id = ANY($1::integer[])
          AND is_active = TRUE`,
      [reservationIds]
    );
  }

  return {
    cancelledReservations: reservationIds.length
  };
}


module.exports = {
  createReservation,
  listReservations,
  getReservationById,
  updateReservation,
  cancelReservation,
  cancelReservationsForScreening
};
