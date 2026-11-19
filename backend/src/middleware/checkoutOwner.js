
const crypto = require('crypto');
const pool = require('../config/db');
const { httpError } = require('../utils/httpError');

const SESSION_COOKIE_NAME = 'rio_session';

async function requireCheckoutOwner(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];

  if (!token) {
    throw httpError(401, 'AUTH_REQUIRED', 'A valid session is required.');
  }

  const tokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const { rows } = await pool.query(
    `SELECT
       s.session_id,
       s.user_id,
       u.role,
       u.active
     FROM sessions s
     LEFT JOIN users u ON u.user_id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()
       AND s.last_activity_at > NOW() - INTERVAL '24 hours'
       AND (s.user_id IS NULL OR u.active = TRUE)`,
    [tokenHash]
  );

  if (rows.length === 0) {
    throw httpError(401, 'AUTH_REQUIRED', 'Session is invalid or expired.');
  }

  const session = rows[0];

  // Registered users must have the customer role.
  // Anonymous sessions have user_id = NULL.
  if (session.user_id !== null && session.role !== 'customer') {
    throw httpError(
      403,
      'FORBIDDEN',
      'Staff accounts cannot make customer purchases.'
    );
  }

  const isGuest = session.user_id === null;

  req.checkoutOwner = {
    userId: session.user_id,
    sessionId: session.session_id,
    isGuest,
    key: isGuest
      ? `session:${session.session_id}`
      : `user:${session.user_id}`
  };

  next();
}

module.exports = { requireCheckoutOwner };
