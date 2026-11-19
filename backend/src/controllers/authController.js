
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../config/db');
const { mapDatabaseRoleToApiRole } = require('../utils/roleMapper');
const { attachSessionHoldsToUser } = require('../services/holdService');
const SESSION_DURATION = 24 * 60 * 60 * 1000;
const SESSION_COOKIE_NAME = 'rio_session';

const generateToken = () => crypto.randomBytes(32).toString('hex');

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const generateCsrfToken = (sessionToken) => {
  const secret = process.env.CSRF_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('CSRF_SECRET must be configured with at least 32 characters');
  }

  return crypto
    .createHmac('sha256', secret)
    .update(sessionToken)
    .digest('hex');
};

const setSessionCookie = (res, token) => {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/'
  });
};



// REGISTER
const register = async (req, res) => {
  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();

    res.set('Cache-Control', 'no-store');

    // Validate request body.
    const allowedFields = ['firstName', 'lastName', 'email', 'password'];

    const unknownFields = Object.keys(req.body || {}).filter(
      (field) => !allowedFields.includes(field)
    );

    if (unknownFields.length > 0) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request contains unknown fields',
          fieldErrors: Object.fromEntries(
            unknownFields.map((field) => [field, 'Unknown field'])
          )
        }
      });
    }

    const { firstName, lastName, email, password } = req.body || {};
    const fieldErrors = {};

    if (typeof firstName !== 'string' || !firstName.trim()) {
      fieldErrors.firstName = 'First name is required';
    } else if (firstName.trim().length > 100) {
      fieldErrors.firstName = 'First name must not exceed 100 characters';
    }

    if (typeof lastName !== 'string' || !lastName.trim()) {
      fieldErrors.lastName = 'Last name is required';
    } else if (lastName.trim().length > 100) {
      fieldErrors.lastName = 'Last name must not exceed 100 characters';
    }

    if (typeof email !== 'string' || !email.trim()) {
      fieldErrors.email = 'Email is required';
    } else if (
      email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      fieldErrors.email = 'Please provide a valid email';
    }

    if (
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 128
    ) {
      fieldErrors.password =
        'Password must contain between 8 and 128 characters';
    }

    if (Object.keys(fieldErrors).length > 0) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please check the registration fields',
          fieldErrors
        }
      });
    }

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // Validate the existing guest session.
    const oldSessionToken = req.cookies?.[SESSION_COOKIE_NAME];

    if (!oldSessionToken) {
      return res.status(401).json({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'A valid session is required'
        }
      });
    }

    const oldTokenHash = hashToken(oldSessionToken);
    const oldCsrfToken = generateCsrfToken(oldSessionToken);
    const oldCsrfHash = hashToken(oldCsrfToken);

    await client.query('BEGIN');
    transactionStarted = true;

    // Lock the existing guest session.
    const sessionResult = await client.query(
      `SELECT session_id, user_id
       FROM sessions
       WHERE token_hash = $1
         AND csrf_token_hash = $2
         AND expires_at > NOW()
         AND last_activity_at > NOW() - INTERVAL '24 hours'
       FOR UPDATE`,
      [oldTokenHash, oldCsrfHash]
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;

      return res.status(403).json({
        error: {
          code: 'CSRF_INVALID',
          message: 'Invalid or expired session'
        }
      });
    }

    const currentSession = sessionResult.rows[0];

    // Prevent registration when already authenticated.
    if (currentSession.user_id !== null) {
      await client.query('ROLLBACK');
      transactionStarted = false;

      return res.status(409).json({
        error: {
          code: 'ALREADY_AUTHENTICATED',
          message: 'You are already authenticated'
        }
      });
    }

    // Create a customer account.
    const passwordHash = await bcrypt.hash(password, 12);

    const userResult = await client.query(
      `INSERT INTO users (
         first_name,
         last_name,
         email,
         password_hash,
         role
       )
       VALUES ($1, $2, $3, $4, 'customer')
       RETURNING
         user_id,
         first_name,
         last_name,
         email,
         role,
         active,
         created_at`,
      [
        normalizedFirstName,
        normalizedLastName,
        normalizedEmail,
        passwordHash
      ]
    );

    const user = userResult.rows[0];

    // Generate a new session ID and CSRF token.
    const newSessionToken = generateToken();
    const newTokenHash = hashToken(newSessionToken);

    const newCsrfToken = generateCsrfToken(newSessionToken);
    const newCsrfHash = hashToken(newCsrfToken);

    // Create a new authenticated session.
const newSessionResult = await client.query(
  `INSERT INTO sessions (
     user_id,
     token_hash,
     expires_at,
     last_activity_at,
     csrf_token_hash,
     created_at
   )
   VALUES (
     $1,
     $2,
     NOW() + INTERVAL '24 hours',
     NOW(),
     $3,
     NOW()
   )
   RETURNING session_id`,
  [user.user_id, newTokenHash, newCsrfHash]
);

const newSessionId = newSessionResult.rows[0].session_id;

// Transfer active guest holds to the new authenticated session.
await attachSessionHoldsToUser(client, {
  sessionId: currentSession.session_id,
  userId: user.user_id,
  newSessionId
});

    // Remove the previous guest session.
    await client.query(
      `DELETE FROM sessions
       WHERE session_id = $1`,
      [currentSession.session_id]
    );

    await client.query('COMMIT');
    transactionStarted = false;

    // Send the new session cookie.
    setSessionCookie(res, newSessionToken);

    return res.status(201).json({
      data: {
        user: {
          id: String(user.user_id),
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          role: mapDatabaseRoleToApiRole(user.role),
          active: user.active,
          createdAt: user.created_at
        },
        csrfToken: newCsrfToken
      }
    });

  } catch (error) {
    if (transactionStarted && client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Registration rollback error:', rollbackError.message);
      }
    }

    if (error.code === '23505') {
      return res.status(409).json({
        error: {
          code: 'EMAIL_IN_USE',
          message: 'An account with this email already exists'
        }
      });
    }

    console.error('Registration error:', error.message);

  return res.status(500).json({
  error: {
    code: 'SERVER_ERROR',
    message: 'Server error'
  }
});


  } finally {
    if (client) {
      client.release();
    }
  }
};


// LOGIN
const login = async (req, res) => {
  const client = await pool.connect();

  try {
    res.set('Cache-Control', 'no-store');

    const { email, password } = req.body;

    // Validate input
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please check the login fields',
          fieldErrors: {
            ...(!(typeof email === 'string') || !email.trim()
              ? { email: 'Email is required' }
              : {}),
            ...(!(typeof password === 'string') || !password
              ? { password: 'Password is required' }
              : {})
          }
        }
      });
    }

    if (password.length > 128) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please check the login fields',
          fieldErrors: {
            password: 'Password must not exceed 128 characters'
          }
        }
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find active user
    const result = await client.query(
      `SELECT user_id, first_name, last_name,
              email, password_hash, role, active, created_at
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
    }

    const user = result.rows[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches || !user.active) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
    }

    // Validate the current guest session and its CSRF token
    const oldSessionToken = req.cookies?.[SESSION_COOKIE_NAME];
    const csrfToken = req.get('X-CSRF-Token');

    if (!oldSessionToken || !csrfToken) {
      return res.status(403).json({
        error: {
          code: 'CSRF_INVALID',
          message: 'Missing CSRF token or session'
        }
      });
    }

    const oldTokenHash = hashToken(oldSessionToken);
    const csrfHash = hashToken(csrfToken);

    await client.query('BEGIN');

    const oldSessionResult = await client.query(
      `SELECT session_id, user_id
       FROM sessions
       WHERE token_hash = $1
         AND csrf_token_hash = $2
         AND expires_at > NOW()
         AND last_activity_at > NOW() - INTERVAL '24 hours'
       FOR UPDATE`,
      [oldTokenHash, csrfHash]
    );

    if (oldSessionResult.rows.length === 0) {
      await client.query('ROLLBACK');

      return res.status(403).json({
        error: {
          code: 'CSRF_INVALID',
          message: 'Invalid CSRF token'
        }
      });
    }

    if (oldSessionResult.rows[0].user_id !== null) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        error: {
          code: 'ALREADY_AUTHENTICATED',
          message: 'You are already authenticated'
        }
      });
    }

    // Rotate session ID: create a completely new session
    const newSessionToken = generateToken();
    const newTokenHash = hashToken(newSessionToken);
    const newCsrfToken = generateCsrfToken(newSessionToken);
    const newCsrfHash = hashToken(newCsrfToken);

   const newSessionResult = await client.query(
  `INSERT INTO sessions (
     user_id,
     token_hash,
     expires_at,
     last_activity_at,
     csrf_token_hash,
     created_at
   )
   VALUES ($1, $2, NOW() + INTERVAL '24 hours',
           NOW(), $3, NOW())
   RETURNING session_id`,
  [user.user_id, newTokenHash, newCsrfHash]
);

const newSessionId = newSessionResult.rows[0].session_id;

// Transfer active guest holds to the authenticated session.
await attachSessionHoldsToUser(client, {
  sessionId: oldSessionResult.rows[0].session_id,
  userId: user.user_id,
  newSessionId
});

    // Remove the previous guest session
    await client.query(
      `DELETE FROM sessions WHERE session_id = $1`,
      [oldSessionResult.rows[0].session_id]
    );

    await client.query('COMMIT');

    setSessionCookie(res, newSessionToken);

    return res.status(200).json({
      data: {
        user: {
          id: String(user.user_id),
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          role: mapDatabaseRoleToApiRole(user.role),
          active: user.active,
          createdAt: user.created_at
        },
        csrfToken: newCsrfToken
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Login error:', error.message);

 return res.status(500).json({
error: {
code: 'SERVER_ERROR',
message: 'Server error'
  }
});


  } finally {
    client.release();
  }
};

// SESSION
const getSession = async (req, res) => {
  const client = await pool.connect();

  try {
    res.set('Cache-Control', 'no-store');

    let sessionToken = req.cookies?.[SESSION_COOKIE_NAME];

    await client.query('BEGIN');

    let session = null;

    // Restore an existing valid session.
    if (sessionToken) {
      const tokenHash = hashToken(sessionToken);

      const result = await client.query(
        `SELECT
           s.session_id,
           s.user_id,
           s.csrf_token_hash,
           u.first_name,
           u.last_name,
           u.email,
           u.role,
           u.active,
           u.created_at
         FROM sessions s
         LEFT JOIN users u ON u.user_id = s.user_id
         WHERE s.token_hash = $1
           AND s.expires_at > NOW()
           AND s.last_activity_at > NOW() - INTERVAL '24 hours'
           AND (s.user_id IS NULL OR u.active = TRUE)
         FOR UPDATE OF s`,
        [tokenHash]
      );

      session = result.rows[0] || null;
    }

    // Create a new anonymous session if no valid session exists.
    if (!session) {
      sessionToken = generateToken();

      const tokenHash = hashToken(sessionToken);

      const result = await client.query(
        `INSERT INTO sessions
           (user_id, token_hash, expires_at, last_activity_at)
         VALUES
           (NULL, $1, NOW() + INTERVAL '24 hours', NOW())
         RETURNING session_id, user_id, csrf_token_hash`,
        [tokenHash]
      );

      session = result.rows[0];
    } else {
      // Refresh the inactivity timeout.
      await client.query(
        `UPDATE sessions
         SET last_activity_at = NOW(),
             expires_at = NOW() + INTERVAL '24 hours'
         WHERE session_id = $1`,
        [session.session_id]
      );
    }
    // Generate a stable CSRF token for this session.
// The raw token is derived using the server secret;
// only its hash is stored in the database.
const csrfToken = generateCsrfToken(sessionToken);
const csrfTokenHash = hashToken(csrfToken);

if (session.csrf_token_hash !== csrfTokenHash) {
  await client.query(
    `UPDATE sessions
     SET csrf_token_hash = $1
     WHERE session_id = $2`,
    [csrfTokenHash, session.session_id]
  );
}

    await client.query('COMMIT');

    setSessionCookie(res, sessionToken);

    // Return the same CSRF token on subsequent GET requests.
    // We will implement secure token recovery in the next step.

    return res.status(200).json({
      data: {
        user: session.user_id
          ? {
              id: String(session.user_id),
              firstName: session.first_name,
              lastName: session.last_name,
              email: session.email,
              role: mapDatabaseRoleToApiRole(session.role),
              active: session.active,
              createdAt: session.created_at
            }
          : null,
        csrfToken
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Get session error:', error.message);


return res.status(500).json({
  error: {
    code: 'SERVER_ERROR',
    message: 'Server error'
  }
});


  } finally {
    client.release();
  }
};

// GET CURRENT USER

const getCurrentUser = (req, res) => {
  res.set('Cache-Control', 'no-store');

return res.status(200).json({
    data: {
      user: {
        id: String(req.user.user_id),
        firstName: req.user.first_name,
        lastName: req.user.last_name,
        email: req.user.email,
        role: mapDatabaseRoleToApiRole(req.user.role),
        active: req.user.active
      }
    }
  });
};


// LOGOUT
const logout = async (req, res) => {
  const client = await pool.connect();

  try {
    res.set('Cache-Control', 'no-store');

    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];

    if (!sessionToken) {
      res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });

      return res.status(204).end();
    }

    const tokenHash = hashToken(sessionToken);

    await client.query('BEGIN');

    // Find and lock the current session
    const sessionResult = await client.query(
      `SELECT session_id, user_id
       FROM sessions
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    if (sessionResult.rows.length > 0) {
      const session = sessionResult.rows[0];

      // Delete the current session
      await client.query(
        `DELETE FROM sessions
         WHERE session_id = $1`,
        [session.session_id]
      );
    }

    await client.query('COMMIT');

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    return res.status(204).end();

  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Logout error:', error.message);


return res.status(500).json({
  error: {
    code: 'SERVER_ERROR',
    message: 'Server error'
  }
});


  } finally {
    client.release();
  }
};


module.exports = {
  register,
  login,
  getSession,
  getCurrentUser,
  logout
}
