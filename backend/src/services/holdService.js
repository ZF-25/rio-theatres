const pool = require('../config/db');
const { httpError, notFound, validationError } = require('../utils/httpError');
const { toApiId } = require('../utils/validate');
const { seatStatusSql } = require('./seatStatus');
const { eurosToCents, buildQuote } = require('./pricing');
const { runOnce } = require('../utils/idempotency');

const HOLD_MINUTES = 15;
const isDbId = (v) => typeof v === 'string' && /^[1-9]\d{0,9}$/.test(v) && Number(v) <= 2147483647;

// ---------- request validation (contract sections 2 and 6) ----------

function validateCreateInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw validationError('body', 'Send a JSON object.');
  }
  const unknown = Object.keys(body).filter((k) => !['screeningId', 'seatIds', 'tickets'].includes(k));
  if (unknown.length) throw validationError(unknown[0], 'Unknown field.');

  const { screeningId, seatIds, tickets } = body;
  if (typeof screeningId !== 'string' || screeningId.trim() === '') {
    throw validationError('screeningId', 'Screening is required.');
  }
  if (!Array.isArray(seatIds) || seatIds.length === 0) {
    throw validationError('seatIds', 'Select at least one seat.');
  }
  if (seatIds.some((id) => typeof id !== 'string' || id.trim() === '')) {
    throw validationError('seatIds', 'Seat IDs must be nonempty strings.');
  }
  if (new Set(seatIds).size !== seatIds.length) {
    throw validationError('seatIds', 'Each seat can be selected only once.');
  }
  if (!tickets || typeof tickets !== 'object' || Array.isArray(tickets)) {
    throw validationError('tickets', 'Ticket counts are required.');
  }
  const ticketKeys = Object.keys(tickets);
  if (ticketKeys.some((k) => !['adult', 'child'].includes(k)) || !('adult' in tickets) || !('child' in tickets)) {
    throw validationError('tickets', 'Send exactly adult and child counts.');
  }
  if (![tickets.adult, tickets.child].every((n) => Number.isInteger(n) && n >= 0)) {
    throw validationError('tickets', 'Ticket counts must be whole numbers, 0 or more.');
  }
  if (tickets.adult + tickets.child !== seatIds.length) {
    throw validationError('tickets', 'The number of tickets must equal the number of seats.');
  }
  // A nonexistent screening ID in a request is 404 (contract section 2).
  if (!isDbId(screeningId)) throw notFound('Screening not found');
  if (seatIds.some((id) => !isDbId(id))) {
    throw validationError('seatIds', 'One or more seats do not belong to this screening.');
  }
  return { screeningId: Number(screeningId), seatIds: seatIds.map(Number), tickets };
}

// ---------- resource mapping ----------

async function loadHoldResource(db, holdId) {
  const { rows } = await db.query(
    `SELECT h.*, NOW() AS server_now,
            ARRAY(SELECT sh.seat_id FROM seat_holds sh
                   WHERE sh.checkout_hold_id = h.checkout_hold_id
                   ORDER BY sh.seat_id) AS seat_ids
       FROM checkout_holds h
      WHERE h.checkout_hold_id = $1`,
    [holdId]
  );
  const h = rows[0];
  return {
    id: toApiId(h.checkout_hold_id),
    screeningId: toApiId(h.screening_id),
    seatIds: h.seat_ids.map(toApiId),
    tickets: { adult: h.adult_count, child: h.child_count },
    status: h.status,
    expiresAt: h.expires_at.toISOString(),
    serverNow: h.server_now.toISOString(),
    quote: {
      currency: 'EUR',
      adultUnitPriceCents: h.adult_unit_cents,
      childUnitPriceCents: h.child_unit_cents,
      adultSubtotalCents: h.adult_unit_cents * h.adult_count,
      childSubtotalCents: h.child_unit_cents * h.child_count,
      totalCents: h.total_cents,
    },
  };
}

// Expired holds stop occupying seats immediately (contract section 12.5).
// Marking them here keeps the "one active hold per seat" index correct.
async function expireOldHolds(client, screeningId) {
  await client.query(
    `UPDATE checkout_holds SET status = 'expired', ended_at = NOW()
      WHERE screening_id = $1 AND status = 'active' AND expires_at <= NOW()`,
    [screeningId]
  );
  await client.query(
    `UPDATE seat_holds SET hold_status = 'expired'
      WHERE screening_id = $1 AND hold_status = 'active' AND expires_at <= NOW()`,
    [screeningId]
  );
}

async function inTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------- POST /holds ----------
// All-or-nothing: either every requested seat is held, or none is.
// Every inventory change locks the screening row first (SELECT ... FOR UPDATE),
// so two customers racing for the same seat are handled one after the other.
async function createHold(owner, idempotencyKey, rawBody) {
  const input = validateCreateInput(rawBody);

  return inTransaction((client) =>
    runOnce(client, { route: 'POST /holds', ownerKey: owner.key, key: idempotencyKey, body: rawBody }, async () => {
      const screening = await client.query(
        `SELECT s.screening_id, s.room_id, s.start_time, s.ticket_price, r.capacity,
                s.start_time <= NOW() AS started
           FROM screenings s JOIN rooms r ON r.room_id = s.room_id
          WHERE s.screening_id = $1
          FOR UPDATE OF s`,
        [input.screeningId]
      );
      if (screening.rows.length === 0) throw notFound('Screening not found');
      const s = screening.rows[0];
      if (s.started) throw httpError(409, 'SCREENING_STARTED', 'This screening has already started.');
      if (input.seatIds.length > s.capacity) {
        throw validationError('seatIds', 'Too many seats for this room.');
      }

      await expireOldHolds(client, s.screening_id);

      // Seats must belong to this screening's room; check each one's status.
      const seats = await client.query(
        `SELECT se.seat_id, ${seatStatusSql('$1', 'se')} AS status
           FROM seats se
          WHERE se.room_id = $2 AND se.seat_id = ANY($3::int[])`,
        [s.screening_id, s.room_id, input.seatIds]
      );
      if (seats.rows.length !== input.seatIds.length) {
        throw validationError('seatIds', 'One or more seats do not belong to this screening.');
      }
      const unavailable = seats.rows.filter((r) => r.status !== 'available').map((r) => r.seat_id).sort((a, b) => a - b);
      if (unavailable.length) {
        throw httpError(409, 'SEATS_UNAVAILABLE', 'Some of the selected seats are no longer available.', {
          details: { unavailableSeatIds: unavailable.map(toApiId) },
        });
      }

      const quote = buildQuote(eurosToCents(s.ticket_price), input.tickets);
      const hold = await client.query(
        `INSERT INTO checkout_holds
           (screening_id, user_id, session_id, adult_count, child_count,
            adult_unit_cents, child_unit_cents, total_cents, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 LEAST(NOW() + INTERVAL '${HOLD_MINUTES} minutes', $9::timestamptz))
         RETURNING checkout_hold_id, expires_at`,
        [s.screening_id, owner.userId, owner.sessionId, input.tickets.adult, input.tickets.child,
          quote.adultUnitPriceCents, quote.childUnitPriceCents, quote.totalCents, s.start_time]
      );
      const { checkout_hold_id: holdId, expires_at: expiresAt } = hold.rows[0];

      try {
        await client.query(
          `INSERT INTO seat_holds
             (screening_id, room_id, seat_id, user_id, hold_status, expires_at, checkout_hold_id)
           SELECT $1, $2, seat_id, $3, 'active', $4, $5
             FROM UNNEST($6::int[]) AS seat_id`,
          [s.screening_id, s.room_id, owner.userId, expiresAt, holdId, input.seatIds]
        );
      } catch (err) {
        // Safety net: the unique index on active seat holds caught a race.
        if (err.code === '23505') {
          throw httpError(409, 'SEATS_UNAVAILABLE', 'Some of the selected seats are no longer available.', {
            details: { unavailableSeatIds: [] },
          });
        }
        throw err;
      }

      return { status: 201, body: { data: await loadHoldResource(client, holdId) } };
    })
  );
}

// Finds a hold owned by this customer, or 404 without revealing whether a
// foreign hold exists.
async function findOwnedHold(db, owner, holdIdParam, { lock = false } = {}) {
  if (!isDbId(holdIdParam)) throw notFound('Hold not found');
  const { rows } = await db.query(
    `SELECT checkout_hold_id, screening_id, status, expires_at <= NOW() AS expired
       FROM checkout_holds
      WHERE checkout_hold_id = $1 AND user_id = $2
      ${lock ? 'FOR UPDATE' : ''}`,
    [Number(holdIdParam), owner.userId]
  );
  if (rows.length === 0) throw notFound('Hold not found');
  return rows[0];
}

// ---------- GET /holds/:id ----------
// Only active holds are returned: expired/released -> 410, consumed -> 409.
async function getHold(owner, holdIdParam) {
  const hold = await findOwnedHold(pool, owner, holdIdParam);
  if (hold.status === 'consumed') {
    throw httpError(409, 'HOLD_ALREADY_CONSUMED', 'This hold has already been purchased.');
  }
  if (hold.status !== 'active' || hold.expired) {
    throw httpError(410, 'HOLD_EXPIRED', 'Your seat hold has expired. Please select seats again.');
  }
  return loadHoldResource(pool, hold.checkout_hold_id);
}

// ---------- DELETE /holds/:id ----------
// Releasing an own active, expired or released hold is a harmless 204.
async function releaseHold(owner, holdIdParam) {
  const found = await findOwnedHold(pool, owner, holdIdParam);
  await inTransaction(async (client) => {
    // Same locking order as createHold: screening row first, then the hold.
    await client.query('SELECT 1 FROM screenings WHERE screening_id = $1 FOR UPDATE', [found.screening_id]);
    const hold = await findOwnedHold(client, owner, holdIdParam, { lock: true });
    if (hold.status === 'consumed') {
      throw httpError(409, 'HOLD_ALREADY_CONSUMED', 'This hold has already been purchased.');
    }
    if (hold.status === 'active') {
      await client.query(
        `UPDATE checkout_holds SET status = 'released', ended_at = NOW() WHERE checkout_hold_id = $1`,
        [hold.checkout_hold_id]
      );
      await client.query(
        `UPDATE seat_holds SET hold_status = 'released'
          WHERE checkout_hold_id = $1 AND hold_status = 'active'`,
        [hold.checkout_hold_id]
      );
    }
  });
}

module.exports = { createHold, getHold, releaseHold, validateCreateInput };

// ---------- for logout (Marina's auth code) ----------
// Releases every active checkout hold of a guest session. Call this inside
// the logout transaction BEFORE deleting the session row, so the seats are
// freed (contract section 4: logout releases unpaid holds).
async function releaseHoldsForSession(client, sessionId) {
  const { rows } = await client.query(
    `UPDATE checkout_holds SET status = 'released', ended_at = NOW()
      WHERE session_id = $1 AND status = 'active'
      RETURNING checkout_hold_id`,
    [sessionId]
  );
  if (rows.length) {
    await client.query(
      `UPDATE seat_holds SET hold_status = 'released'
        WHERE checkout_hold_id = ANY($1::int[]) AND hold_status = 'active'`,
      [rows.map((r) => r.checkout_hold_id)]
    );
  }
  return rows.length;
}

module.exports.releaseHoldsForSession = releaseHoldsForSession;

// ---------- for login / registration (Marina's auth code) ----------
// Gives a guest's ACTIVE checkout holds to the customer who just signed in
// (contract 4.2, as agreed by the team). Call it inside the login or
// registration transaction.
// - Expiry times are NOT changed, so signing in never resets the timer.
// - Expired, released and consumed holds are left alone; completed guest
//   bookings are not moved into the account.
// - If login creates a NEW session row, pass its ID as newSessionId; if it
//   upgrades the same row (new token, user_id set), leave it out.
async function attachSessionHoldsToUser(client, { sessionId, userId, newSessionId = sessionId }) {
  const { rows } = await client.query(
    `UPDATE checkout_holds
        SET user_id = $2, session_id = $3
      WHERE session_id = $1 AND status = 'active' AND expires_at > NOW()
      RETURNING checkout_hold_id`,
    [sessionId, userId, newSessionId]
  );
  if (rows.length) {
    await client.query(
      `UPDATE seat_holds SET user_id = $2
        WHERE checkout_hold_id = ANY($1::int[]) AND hold_status = 'active'`,
      [rows.map((r) => r.checkout_hold_id), userId]
    );
  }
  return rows.length;
}

module.exports.attachSessionHoldsToUser = attachSessionHoldsToUser;
