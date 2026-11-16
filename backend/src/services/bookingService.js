const crypto = require('crypto');
const pool = require('../config/db');
const { httpError, notFound, validationError } = require('../utils/httpError');
const { toApiId, filterId, calendarDate, pagination } = require('../utils/validate');
const { runOnce } = require('../utils/idempotency');
const { seatLabelsForRoom } = require('./seatService');
const { getStripe } = require('./stripeClient');

const isDbId = (v) => typeof v === 'string' && /^[1-9]\d{0,9}$/.test(v) && Number(v) <= 2147483647;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Stripe requires a Checkout Session to stay open at least 30 minutes.
const CHECKOUT_SECONDS = 30 * 60 + 30;

// Simulated payment confirms a booking without any money, so it is only
// allowed when the backend explicitly enables it (tests and demos).
const simulatedAllowed = () => process.env.ALLOW_SIMULATED_PAYMENT === 'true';

// ---------- request validation (contract sections 2 and 6) ----------

function validateCreateInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw validationError('body', 'Send a JSON object.');
  }
  const unknown = Object.keys(body).filter((k) => !['holdId', 'customer', 'paymentMethod'].includes(k));
  if (unknown.length) throw validationError(unknown[0], 'Unknown field.');

  const { holdId, customer, paymentMethod } = body;
  if (typeof holdId !== 'string' || holdId.trim() === '') {
    throw validationError('holdId', 'Hold is required.');
  }
  if (!customer || typeof customer !== 'object' || Array.isArray(customer)) {
    throw validationError('customer', 'Contact details are required.');
  }
  const unknownCustomer = Object.keys(customer).filter((k) => !['name', 'email'].includes(k));
  if (unknownCustomer.length) throw validationError(`customer.${unknownCustomer[0]}`, 'Unknown field.');

  const name = typeof customer.name === 'string' ? customer.name.trim() : '';
  if (name.length < 1 || name.length > 100) {
    throw validationError('customer.name', 'Name must be 1–100 characters.');
  }
  const email = typeof customer.email === 'string' ? customer.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 254) {
    throw validationError('customer.email', 'Enter a valid email address.');
  }
  if (paymentMethod !== 'stripe' && !(paymentMethod === 'simulated' && simulatedAllowed())) {
    throw validationError('paymentMethod', 'Use "stripe".');
  }
  return { holdId, name, email, paymentMethod };
}

// ---------- helpers ----------

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

// Opaque reference like RIO-7KQ2M9XA (no 0/O/1/I to avoid misreading).
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newReference() {
  const bytes = crypto.randomBytes(8);
  let ref = 'RIO-';
  for (const b of bytes) ref += REF_ALPHABET[b % REF_ALPHABET.length];
  return ref;
}

const centsToEuros = (cents) => (cents / 100).toFixed(2);

// Unpaid Stripe bookings whose checkout ran out (plus 10 minutes of grace
// for a late webhook) stop holding seats. Their booking_seats rows are
// deleted so the unique seat constraint lets someone else buy the seat.
// Call only after locking the screening row.
async function expireStalePendingBookings(client, screeningId) {
  const { rows } = await client.query(
    `UPDATE bookings SET booking_status = 'expired'
      WHERE screening_id = $1 AND booking_status = 'pending'
        AND expires_at + INTERVAL '10 minutes' <= NOW()
      RETURNING booking_id`,
    [screeningId]
  );
  if (rows.length) {
    const ids = rows.map((r) => r.booking_id);
    await client.query('DELETE FROM booking_seats WHERE booking_id = ANY($1::int[])', [ids]);
    await client.query(
      `UPDATE payments SET payment_status = 'failed'
        WHERE booking_id = ANY($1::int[]) AND payment_status = 'pending'`,
      [ids]
    );
  }
}

// ---------- resource mapping ----------

const PAYMENT_STATUS = { successful: 'paid', pending: 'pending', failed: 'failed', refunded: 'refunded' };

// Booking resource (contract section 6, plus Stripe fields). Everything
// comes from the purchase-time snapshot, except screening.status, which
// shows the screening's current state.
async function loadBookingResources(db, bookingIds) {
  if (bookingIds.length === 0) return [];
  const { rows } = await db.query(
    `SELECT b.*, p.payment_status,
            (b.booking_status = 'pending' AND b.expires_at > NOW()) AS checkout_open,
            COALESCE(json_agg(json_build_object(
                'id', bs.seat_id, 'label', bs.seat_label, 'rowLabel', bs.row_label)
              ORDER BY bs.booking_seat_id) FILTER (WHERE bs.seat_id IS NOT NULL), '[]') AS seats
       FROM bookings b
       LEFT JOIN booking_seats bs ON bs.booking_id = b.booking_id
       LEFT JOIN LATERAL (SELECT payment_status FROM payments
                           WHERE booking_id = b.booking_id
                           ORDER BY payment_id DESC LIMIT 1) p ON TRUE
      WHERE b.booking_id = ANY($1::int[])
      GROUP BY b.booking_id, p.payment_status`,
    [bookingIds]
  );
  const byId = new Map(rows.map((b) => [b.booking_id, b]));
  return bookingIds.map((id) => {
    const b = byId.get(id);
    return {
      id: toApiId(b.booking_id),
      reference: b.reference,
      createdAt: b.created_at.toISOString(),
      customer: { name: b.contact_name, email: b.contact_email },
      isGuest: b.is_guest,
      movie: { id: toApiId(b.movie_id), title: b.movie_title, posterUrl: b.movie_poster_url },
      cinema: { id: toApiId(b.theater_id), name: b.cinema_name, city: b.cinema_city },
      room: { id: toApiId(b.room_id), name: b.room_name },
      // No cancellation column exists yet, so every screening is "scheduled".
      screening: { id: toApiId(b.screening_id), startsAt: b.starts_at.toISOString(), status: 'scheduled' },
      seats: b.seats.map((s) => ({ id: toApiId(s.id), label: s.label, rowLabel: s.rowLabel })),
      tickets: { adult: b.adult_count, child: b.child_count },
      quote: {
        currency: 'EUR',
        adultUnitPriceCents: b.adult_unit_cents,
        childUnitPriceCents: b.child_unit_cents,
        adultSubtotalCents: b.adult_unit_cents * b.adult_count,
        childSubtotalCents: b.child_unit_cents * b.child_count,
        totalCents: b.total_cents,
      },
      // pending -> confirmed (paid) or expired (checkout not completed);
      // cancelled = paid too late and refunded automatically.
      bookingStatus: b.booking_status,
      paymentMethod: b.payment_method,
      paymentStatus: b.payment_method === 'simulated' ? 'simulated' : PAYMENT_STATUS[b.payment_status] || 'pending',
      // Stripe-hosted payment page, only while the checkout is still open.
      checkoutUrl: b.checkout_open ? b.stripe_checkout_url : null,
      paymentExpiresAt: b.booking_status === 'pending' && b.expires_at ? b.expires_at.toISOString() : null,
    };
  });
}

// ---------- POST /bookings ----------
// Converts every seat of an owned, active hold into a booking, consumes the
// hold, and creates the payment record, all in one transaction.
//   paymentMethod "stripe":    booking 'pending' + a Stripe Checkout Session;
//                              the response carries checkoutUrl. Only the
//                              verified webhook confirms the booking.
//   paymentMethod "simulated": booking 'confirmed' at once (tests/demos only).
// The idempotency record is checked FIRST, so a lost response can be
// recovered with the same key even after the hold is consumed or expired.
async function createBooking(owner, idempotencyKey, rawBody) {
  const input = validateCreateInput(rawBody);
  const stripe = input.paymentMethod === 'stripe' ? getStripe() : null;

  return inTransaction((client) =>
    runOnce(client, { route: 'POST /bookings', ownerKey: owner.key, key: idempotencyKey, body: rawBody }, async () => {
      if (!isDbId(input.holdId)) throw notFound('Hold not found');

      // Find the hold's screening, then lock in the SAME order as holds:
      // screening row first, then the hold.
      const found = await client.query(
        'SELECT screening_id FROM checkout_holds WHERE checkout_hold_id = $1 AND user_id = $2',
        [Number(input.holdId), owner.userId]
      );
      if (found.rows.length === 0) throw notFound('Hold not found');

      const screening = await client.query(
        `SELECT s.screening_id, s.room_id, s.start_time, s.start_time <= NOW() AS started,
                m.movie_id, m.title, m.poster_url,
                r.room_name, t.theater_id, t.name AS cinema_name, t.city
           FROM screenings s
           JOIN movies m   ON m.movie_id = s.movie_id
           JOIN rooms r    ON r.room_id = s.room_id
           JOIN theaters t ON t.theater_id = r.theater_id
          WHERE s.screening_id = $1
          FOR UPDATE OF s`,
        [found.rows[0].screening_id]
      );
      const s = screening.rows[0];

      const holdResult = await client.query(
        `SELECT *, expires_at <= NOW() AS expired
           FROM checkout_holds
          WHERE checkout_hold_id = $1 AND user_id = $2
          FOR UPDATE`,
        [Number(input.holdId), owner.userId]
      );
      const hold = holdResult.rows[0];
      if (!hold) throw notFound('Hold not found');
      if (hold.status === 'consumed') {
        throw httpError(409, 'HOLD_ALREADY_CONSUMED', 'This hold has already been purchased.');
      }
      if (hold.status !== 'active' || hold.expired) {
        throw httpError(410, 'HOLD_EXPIRED', 'Your seat hold has expired. Please select seats again.');
      }
      if (s.started) throw httpError(409, 'SCREENING_STARTED', 'This screening has already started.');

      const seatRows = await client.query(
        `SELECT seat_id FROM seat_holds
          WHERE checkout_hold_id = $1 AND hold_status = 'active'`,
        [hold.checkout_hold_id]
      );
      if (seatRows.rows.length !== hold.adult_count + hold.child_count) {
        throw httpError(410, 'HOLD_EXPIRED', 'Your seat hold has expired. Please select seats again.');
      }

      await expireStalePendingBookings(client, s.screening_id);

      // Seats in seat-map order; adult tickets go to the first seats.
      const labels = await seatLabelsForRoom(client, s.room_id);
      const order = [...labels.keys()];
      const seatIds = seatRows.rows.map((r) => r.seat_id).sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const reference = newReference();
      const isStripe = input.paymentMethod === 'stripe';

      const booking = await client.query(
        `INSERT INTO bookings
           (user_id, screening_id, booking_status, total_price, reference, checkout_hold_id,
            session_id, is_guest, contact_name, contact_email,
            movie_id, movie_title, movie_poster_url, theater_id, cinema_name, cinema_city,
            room_id, room_name, starts_at,
            adult_count, child_count, adult_unit_cents, child_unit_cents, total_cents, payment_method)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, $9,
                 $10, $11, $12, $13, $14, $15, $16, $17, $18,
                 $19, $20, $21, $22, $23, $24)
         RETURNING booking_id`,
        [owner.userId, s.screening_id, isStripe ? 'pending' : 'confirmed', centsToEuros(hold.total_cents),
          reference, hold.checkout_hold_id, owner.sessionId, input.name, input.email,
          s.movie_id, s.title, s.poster_url, s.theater_id, s.cinema_name, s.city,
          s.room_id, s.room_name, s.start_time,
          hold.adult_count, hold.child_count, hold.adult_unit_cents, hold.child_unit_cents, hold.total_cents,
          input.paymentMethod]
      );
      const bookingId = booking.rows[0].booking_id;

      const types = seatIds.map((_, i) => (i < hold.adult_count ? 'adult' : 'child'));
      try {
        await client.query(
          `INSERT INTO booking_seats
             (booking_id, screening_id, room_id, seat_id, ticket_type, price_at_booking, seat_label, row_label)
           SELECT $1, $2, $3, x.seat_id, x.ticket_type::ticket_type,
                  CASE WHEN x.ticket_type = 'adult' THEN $4::numeric ELSE $5::numeric END,
                  x.seat_label, x.row_label
             FROM UNNEST($6::int[], $7::text[], $8::text[], $9::text[])
                  AS x(seat_id, ticket_type, seat_label, row_label)`,
          [bookingId, s.screening_id, s.room_id,
            centsToEuros(hold.adult_unit_cents), centsToEuros(hold.child_unit_cents),
            seatIds, types,
            seatIds.map((id) => labels.get(id).label), seatIds.map((id) => labels.get(id).rowLabel)]
        );
      } catch (err) {
        // Safety net: uq_booking_seats_screening_seat caught a double booking.
        if (err.code === '23505') {
          throw httpError(409, 'SEATS_UNAVAILABLE', 'Some of the selected seats are no longer available.', {
            details: { unavailableSeatIds: [] },
          });
        }
        throw err;
      }

      if (isStripe) {
        // Prices come from the frozen quote in our database, never from the
        // browser. Amounts are integer cents (1200 = 12.00 EUR).
        const lineItems = [];
        if (hold.adult_count > 0) {
          lineItems.push({
            price_data: { currency: 'eur', unit_amount: hold.adult_unit_cents, product_data: { name: `${s.title} – adult ticket` } },
            quantity: hold.adult_count,
          });
        }
        if (hold.child_count > 0) {
          lineItems.push({
            price_data: { currency: 'eur', unit_amount: hold.child_unit_cents, product_data: { name: `${s.title} – child ticket` } },
            quantity: hold.child_count,
          });
        }
        const frontend = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
        let session;
        try {
          session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: input.email,
            line_items: lineItems,
            client_reference_id: reference,
            metadata: { reference },
            expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_SECONDS,
            success_url: `${frontend}/bookings/${reference}?checkout=success`,
            cancel_url: `${frontend}/bookings/${reference}?checkout=cancelled`,
          });
        } catch (err) {
          // Nothing is saved: the transaction rolls back and the hold stays active.
          console.error('Stripe Checkout Session failed:', err.message);
          throw httpError(502, 'PAYMENT_PROVIDER_ERROR', 'Could not start the payment. Please try again.');
        }
        await client.query(
          `UPDATE bookings
              SET stripe_session_id = $2, stripe_checkout_url = $3, expires_at = to_timestamp($4)
            WHERE booking_id = $1`,
          [bookingId, session.id, session.url, session.expires_at]
        );
        await client.query(
          `INSERT INTO payments (booking_id, amount, payment_status, payment_method, transaction_reference)
           VALUES ($1, $2, 'pending', 'stripe', $3)`,
          [bookingId, centsToEuros(hold.total_cents), session.id]
        );
      } else {
        await client.query(
          `INSERT INTO payments (booking_id, amount, payment_status, payment_method, transaction_reference, paid_at)
           VALUES ($1, $2, 'successful', 'simulated', $3, NOW())`,
          [bookingId, centsToEuros(hold.total_cents), `SIM-${bookingId}`]
        );
      }

      await client.query(
        `UPDATE checkout_holds SET status = 'consumed', ended_at = NOW() WHERE checkout_hold_id = $1`,
        [hold.checkout_hold_id]
      );
      await client.query(
        `UPDATE seat_holds SET hold_status = 'released'
          WHERE checkout_hold_id = $1 AND hold_status = 'active'`,
        [hold.checkout_hold_id]
      );

      const [resource] = await loadBookingResources(client, [bookingId]);
      return { status: 201, body: { data: resource } };
    })
  );
}

// ---------- Stripe webhook ----------
// Called with an event whose signature was already verified.
// Each event ID is processed once (stripe_events), so Stripe's retries and
// replays never change a booking twice.
async function handleStripeEvent(event) {
  return inTransaction(async (client) => {
    const first = await client.query(
      `INSERT INTO stripe_events (event_id, event_type) VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [event.id, event.type]
    );
    if (first.rows.length === 0) return 'duplicate';

    const session = event.data && event.data.object;
    if (!session || !session.id) return 'ignored';

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (session.payment_status !== 'paid') return 'not paid yet';
      return confirmPaidSession(client, session);
    }
    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      return expireSession(client, session);
    }
    return 'ignored';
  });
}

// Locks screening then booking (same order as every inventory change).
async function lockBookingBySession(client, sessionId) {
  const found = await client.query(
    'SELECT booking_id, screening_id FROM bookings WHERE stripe_session_id = $1',
    [sessionId]
  );
  if (found.rows.length === 0) return null;
  await client.query('SELECT 1 FROM screenings WHERE screening_id = $1 FOR UPDATE', [found.rows[0].screening_id]);
  const { rows } = await client.query(
    'SELECT booking_id, booking_status FROM bookings WHERE booking_id = $1 FOR UPDATE',
    [found.rows[0].booking_id]
  );
  return rows[0];
}

async function confirmPaidSession(client, session) {
  const booking = await lockBookingBySession(client, session.id);
  if (!booking) return 'unknown session';
  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

  if (booking.booking_status === 'pending') {
    await client.query(
      `UPDATE bookings SET booking_status = 'confirmed', stripe_payment_intent_id = $2 WHERE booking_id = $1`,
      [booking.booking_id, paymentIntent]
    );
    await client.query(
      `UPDATE payments SET payment_status = 'successful', paid_at = NOW()
        WHERE booking_id = $1 AND payment_method = 'stripe'`,
      [booking.booking_id]
    );
    console.log(`Booking ${booking.booking_id} is paid.`);
    return 'confirmed';
  }

  if (booking.booking_status === 'expired' && paymentIntent) {
    // Paid after the checkout had already expired and the seats were
    // released: never sell a seat twice; give the money back instead.
    await getStripe().refunds.create({ payment_intent: paymentIntent }, { idempotencyKey: `refund-${session.id}` });
    await client.query(
      `UPDATE bookings SET booking_status = 'cancelled', stripe_payment_intent_id = $2 WHERE booking_id = $1`,
      [booking.booking_id, paymentIntent]
    );
    await client.query(
      `UPDATE payments SET payment_status = 'refunded' WHERE booking_id = $1 AND payment_method = 'stripe'`,
      [booking.booking_id]
    );
    console.log(`Booking ${booking.booking_id} was paid after expiry and has been refunded.`);
    return 'refunded';
  }
  return 'already handled';
}

async function expireSession(client, session) {
  const booking = await lockBookingBySession(client, session.id);
  if (!booking) return 'unknown session';
  if (booking.booking_status !== 'pending') return 'already handled';
  await client.query(`UPDATE bookings SET booking_status = 'expired' WHERE booking_id = $1`, [booking.booking_id]);
  await client.query('DELETE FROM booking_seats WHERE booking_id = $1', [booking.booking_id]);
  await client.query(
    `UPDATE payments SET payment_status = 'failed' WHERE booking_id = $1 AND payment_status = 'pending'`,
    [booking.booking_id]
  );
  return 'expired';
}

// ---------- GET /bookings/:reference ----------
// Only the account that bought it can read it. A reference alone grants no
// access: unknown and foreign references are both 404.
async function getBooking(owner, reference) {
  if (typeof reference !== 'string' || reference.length > 20) throw notFound('Booking not found');
  const { rows } = await pool.query(
    'SELECT booking_id FROM bookings WHERE reference = $1 AND user_id = $2',
    [reference.toUpperCase(), owner.userId]
  );
  if (rows.length === 0) throw notFound('Booking not found');
  const [resource] = await loadBookingResources(pool, [rows[0].booking_id]);
  return resource;
}

// ---------- GET /me/bookings ----------
// The customer's purchases, newest first (expired, unpaid checkouts are
// left out). Optional filters: cinemaId and date (the screening's start
// date in Helsinki).
async function listMyBookings(owner, query) {
  const unknown = Object.keys(query).filter((k) => !['cinemaId', 'date', 'page', 'pageSize'].includes(k));
  if (unknown.length) throw validationError(unknown[0], 'Unknown filter.');
  const cinemaId = filterId(query.cinemaId, 'cinemaId');
  const date = calendarDate(query.date);
  const { page, pageSize, offset } = pagination(query);

  if (cinemaId !== undefined) {
    const exists = await pool.query('SELECT 1 FROM theaters WHERE theater_id = $1', [cinemaId]);
    if (exists.rows.length === 0) throw validationError('cinemaId', 'Unknown cinema.');
  }

  const where = ['b.user_id = $1', 'b.reference IS NOT NULL', "b.booking_status <> 'expired'"];
  const params = [owner.userId];
  if (cinemaId !== undefined) {
    params.push(cinemaId);
    where.push(`b.theater_id = $${params.length}`);
  }
  if (date !== undefined) {
    params.push(date);
    where.push(`(b.starts_at AT TIME ZONE 'Europe/Helsinki')::date = $${params.length}::date`);
  }

  const total = await pool.query(`SELECT COUNT(*)::int AS n FROM bookings b WHERE ${where.join(' AND ')}`, params);
  const ids = await pool.query(
    `SELECT b.booking_id FROM bookings b
      WHERE ${where.join(' AND ')}
      ORDER BY b.created_at DESC, b.booking_id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  const items = await loadBookingResources(pool, ids.rows.map((r) => r.booking_id));
  return { items, page, pageSize, totalItems: total.rows[0].n };
}

module.exports = { createBooking, getBooking, listMyBookings, handleStripeEvent, validateCreateInput };
