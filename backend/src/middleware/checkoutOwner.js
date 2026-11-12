const crypto = require('crypto');
const pool = require('../config/db');
const { httpError } = require('../utils/httpError');

const SESSION_COOKIE_NAME = 'rio_session';

// Who owns a checkout hold or purchase (contract section 6):
// an anonymous guest session or an active CUSTOMER. Owners and cashiers
// get 403 on customer purchase operations.
//
// For now this uses Marina's login session cookie, so logged-in customers
// can hold seats. Guests are added when anonymous sessions exist
// (GET /auth/session); until then a request without a login gets 401.
// The account's active flag and role are re-checked on every request.
async function requireCheckoutOwner(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) throw httpError(401, 'AUTH_REQUIRED', 'Please sign in to continue.');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await pool.query(
    `SELECT s.session_id, u.user_id, u.role, u.active
       FROM sessions s
       JOIN users u ON u.user_id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()`,
    [tokenHash]
  );
  if (rows.length === 0 || !rows[0].active) {
    throw httpError(401, 'AUTH_REQUIRED', 'Please sign in to continue.');
  }
  if (rows[0].role !== 'customer') {
    throw httpError(403, 'FORBIDDEN', 'Staff accounts cannot make customer purchases.');
  }

  req.checkoutOwner = {
    userId: rows[0].user_id,
    sessionId: rows[0].session_id,
    key: `user:${rows[0].user_id}`, // scope for idempotency records
  };
  next();
}

module.exports = { requireCheckoutOwner };
