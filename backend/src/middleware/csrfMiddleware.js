
const crypto = require('crypto');
const pool = require('../config/db');

const SESSION_COOKIE_NAME = 'rio_session';

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const verifyCsrfToken = async (req, res, next) => {
  try {
    // Safe HTTP methods do not require CSRF validation.
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    res.set('Cache-Control', 'no-store');

    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];
    const csrfToken = req.get('X-CSRF-Token');

    if (!sessionToken || !csrfToken) {
      return res.status(403).json({
        error: {
          code: 'CSRF_INVALID',
          message: 'Missing CSRF token or session'
        }
      });
    }

    const sessionHash = hashToken(sessionToken);
    const csrfHash = hashToken(csrfToken);

    const result = await pool.query(
      `UPDATE sessions s
       SET last_activity_at = NOW(),
           expires_at = NOW() + INTERVAL '24 hours'
       FROM users u
       WHERE s.token_hash = $1
         AND s.csrf_token_hash = $2
         AND s.expires_at > NOW()
         AND s.last_activity_at > NOW() - INTERVAL '24 hours'
         AND (
           s.user_id IS NULL
           OR (
             s.user_id = u.user_id
             AND u.active = TRUE
           )
         )
       RETURNING s.session_id`,
      [sessionHash, csrfHash]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        error: {
          code: 'CSRF_INVALID',
          message: 'Invalid or expired session'
        }
      });
    }

    return next();

  } catch (error) {
    console.error('CSRF validation error:', error.message);

    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Server error'
      }
    });
  }
};

module.exports = { verifyCsrfToken };
