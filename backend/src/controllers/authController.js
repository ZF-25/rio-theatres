
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../config/db');
const { mapDatabaseRoleToApiRole } = require('../utils/roleMapper');

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE_NAME = 'rio_session';

// REGISTER
const register = async (req, res) => {
  try {
    const { first_name, last_name, email, password } = req.body;

    // Validate required fields
    if (
      typeof first_name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !first_name.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        error: 'First name, email and password are required'
      });
    }

    // Normalize input
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFirstName = first_name.trim();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return res.status(400).json({
        error: 'Please provide a valid email'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must contain at least 8 characters'
      });
    }

    if (
      last_name !== undefined &&
      last_name !== null &&
      typeof last_name !== 'string'
    ) {
      return res.status(400).json({
        error: 'Invalid last name'
      });
    }

    // Check if email already exists
    const existingUser = await pool.query(
      'SELECT user_id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'Email is already registered'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await pool.query(
      `INSERT INTO users
       (first_name, last_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'customer')
       RETURNING user_id, first_name, last_name, email, role, created_at`,
      [
        normalizedFirstName,
        last_name?.trim() || null,
        normalizedEmail,
        passwordHash
      ]
    );

    res.status(201).json({
      message: 'Registration successful',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Registration error:', error.message);

    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Email is already registered'
      });
    }

    res.status(500).json({
      error: 'Internal server error'
    });
  }
};

// LOGIN
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user
    const result = await pool.query(
    `SELECT user_id, first_name, last_name,
        email, password_hash, role, active
 FROM users
 WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Compare password with stored hash
    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }
    if (!user.active) {
  return res.status(401).json({
    error: 'Invalid email or password'
  });
}

    // Generate a random session token
    const sessionToken = crypto.randomBytes(32).toString('hex');

    // Hash token before saving it
    const tokenHash = crypto
      .createHash('sha256')
      .update(sessionToken)
      .digest('hex');

    const expiresAt = new Date(Date.now() + SESSION_DURATION);

    // Save session in PostgreSQL
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [user.user_id, tokenHash, expiresAt]
    );

    // Send session token in an HttpOnly cookie
    res.cookie(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_DURATION,
      path: '/'
    });

    res.status(200).json({
      message: 'Login successful',
      user: {
        user_id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: mapDatabaseRoleToApiRole(user.role)
      }
    });

  } catch (error) {
    console.error('Login error:', error.message);

    res.status(500).json({
      error: 'Internal server error'
    });
  }
};

// GET CURRENT USER
const getCurrentUser = (req, res) => {
  res.set('Cache-Control', 'no-store');

  res.status(200).json({
    user: {
      user_id: req.user.user_id,
      first_name: req.user.first_name,
      last_name: req.user.last_name,
      email: req.user.email,
      role: mapDatabaseRoleToApiRole(req.user.role)
    }
  });
};
// LOGOUT
const logout = async (req, res) => {
  try {
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];

    if (sessionToken) {
      const tokenHash = crypto
        .createHash('sha256')
        .update(sessionToken)
        .digest('hex');

      await pool.query(
        'DELETE FROM sessions WHERE token_hash = $1',
        [tokenHash]
      );
    }

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    res.status(200).json({
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error.message);

    res.status(500).json({
      error: 'Internal server error'
    });
  }
};

module.exports = {
  register,
  login,
  getCurrentUser,
  logout
};
