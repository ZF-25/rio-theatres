
const pool = require('../config/db');
const bcrypt = require('bcrypt');

// GET: Retrieve all cashier accounts
const getCashiers = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const {
      search = '',
      active,
      page = '1',
      pageSize = '20'
    } = req.query;

    // Validate pagination
    const pageNumber = Number(page);
    const limit = Number(pageSize);

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid pagination parameters',
          fieldErrors: {},
          details: {}
        }
      });
    }

    if (typeof search !== 'string') {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid search parameter',
          fieldErrors: { search: 'Search must be a string' },
          details: {}
        }
      });
    }

    // Validate active filter
    if (
      active !== undefined &&
      active !== 'true' &&
      active !== 'false'
    ) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Active must be true or false',
          fieldErrors: {
            active: 'Use true or false'
          },
          details: {}
        }
      });
    }

    const offset = (pageNumber - 1) * limit;
    const values = [];
    const conditions = ["role = 'cashier'"];

    if (search.trim()) {
      values.push(`%${search.trim()}%`);
      conditions.push(
        `(first_name || ' ' || COALESCE(last_name, '') ILIKE $${values.length}
        OR email ILIKE $${values.length})`
      );
    }

    if (active !== undefined) {
      values.push(active === 'true');
      conditions.push(`active = $${values.length}`);
    }

    const whereClause = conditions.join(' AND ');

    // Count matching cashiers
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM users WHERE ${whereClause}`,
      values
    );

    const totalItems = Number(countResult.rows[0].count);

    // Retrieve paginated cashier accounts
    const cashierResult = await pool.query(
      `SELECT
        user_id,
        first_name,
        last_name,
        email,
        role,
        active,
        created_at
      FROM users
      WHERE ${whereClause}
      ORDER BY first_name ASC, last_name ASC, user_id ASC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    const cashiers = cashierResult.rows.map((cashier) => ({
      id: String(cashier.user_id),
      firstName: cashier.first_name,
      lastName: cashier.last_name,
      email: cashier.email,
      role: cashier.role,
      active: cashier.active,
      createdAt: cashier.created_at
    }));

    return res.status(200).json({
      data: cashiers,
      meta: {
        page: pageNumber,
        pageSize: limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit)
      }
    });

  } catch (error) {
    console.error('Get cashiers error:', error);

    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Server error'
      }
    });
  }
};


// POST: Create a new cashier account

// POST: Create a new cashier account
const createCashier = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const allowedFields = ['firstName', 'lastName', 'email', 'password'];

    // Validate request body
    if (
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body)
    ) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          fieldErrors: {},
          details: {}
        }
      });
    }

    const unknownFields = Object.keys(req.body).filter(
      (field) => !allowedFields.includes(field)
    );

    if (unknownFields.length > 0) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Unknown fields in request body',
          fieldErrors: {},
          details: { unknownFields }
        }
      });
    }

    const { firstName, lastName, email, password } = req.body;

    // Validate required fields
    const fieldErrors = {};

    if (typeof firstName !== 'string' || !firstName.trim()) {
      fieldErrors.firstName = 'First name is required';
    }

    if (typeof lastName !== 'string' || !lastName.trim()) {
      fieldErrors.lastName = 'Last name is required';
    }

    if (typeof email !== 'string' || !email.trim()) {
      fieldErrors.email = 'Email is required';
    }

    if (typeof password !== 'string' || !password) {
      fieldErrors.password = 'Password is required';
    }

    if (Object.keys(fieldErrors).length > 0) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Required fields are missing or invalid',
          fieldErrors,
          details: {}
        }
      });
    }

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Validate field lengths
    if (
      cleanFirstName.length > 100 ||
      cleanLastName.length > 100 ||
      cleanEmail.length > 254 ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'One or more fields have invalid lengths',
          fieldErrors: {
            ...(cleanFirstName.length > 100 && {
              firstName: 'Maximum length is 100 characters'
            }),
            ...(cleanLastName.length > 100 && {
              lastName: 'Maximum length is 100 characters'
            }),
            ...(cleanEmail.length > 254 && {
              email: 'Maximum length is 254 characters'
            }),
            ...(password.length < 8 && {
              password: 'Minimum length is 8 characters'
            }),
            ...(password.length > 128 && {
              password: 'Maximum length is 128 characters'
            })
          },
          details: {}
        }
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid email address',
          fieldErrors: {
            email: 'Enter a valid email address'
          },
          details: {}
        }
      });
    }

    // Check whether the email is already registered
    const existingUser = await pool.query(
      'SELECT user_id FROM users WHERE email = $1',
      [cleanEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: {
          code: 'EMAIL_IN_USE',
          message: 'An account with this email already exists'
        }
      });
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create cashier account
    const result = await pool.query(
      `INSERT INTO users
        (first_name, last_name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, 'cashier', TRUE)
       RETURNING user_id, first_name, last_name, email, role, active, created_at`,
      [cleanFirstName, cleanLastName, cleanEmail, passwordHash]
    );

    const cashier = result.rows[0];

    return res.status(201).json({
      data: {
        id: String(cashier.user_id),
        firstName: cashier.first_name,
        lastName: cashier.last_name,
        email: cashier.email,
        role: cashier.role,
        active: cashier.active,
        createdAt: cashier.created_at
      }
    });

  } catch (error) {
    console.error('Create cashier error:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        error: {
          code: 'EMAIL_IN_USE',
          message: 'An account with this email already exists'
        }
      });
    }

    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Server error'
      }
    });
  }
};


// GET: Retrieve theaters assigned to a cashier
const getCashierTheaters = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const cashierId = Number(req.params.id);

    if (!Number.isInteger(cashierId) || cashierId < 1) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid cashier ID',
          fieldErrors: {},
          details: {}
        }
      });
    }

    const cashierResult = await pool.query(
      `SELECT user_id
       FROM users
       WHERE user_id = $1 AND role = 'cashier'`,
      [cashierId]
    );

    if (cashierResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'CASHIER_NOT_FOUND',
          message: 'Cashier not found'
        }
      });
    }

    const result = await pool.query(
      `SELECT t.theater_id, t.name, t.city, t.address
       FROM cashier_theaters ct
       JOIN theaters t ON t.theater_id = ct.theater_id
       WHERE ct.cashier_id = $1
       ORDER BY t.theater_id`,
      [cashierId]
    );

    return res.status(200).json({
      data: result.rows.map((theater) => ({
        id: theater.theater_id,
        name: theater.name,
        city: theater.city,
        address: theater.address
      }))
    });

  } catch (error) {
    console.error('Get cashier theaters error:', error);

    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Server error'
      }
    });
  }
};


// PUT: Replace cashier theater assignments

const updateCashierTheaters = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const cashierId = Number(req.params.id);
  const { theaterId } = req.body;

  if (!Number.isInteger(cashierId) || cashierId <= 0) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid cashier ID.',
      },
    });
  }

  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body) ||
    Object.keys(req.body).some((key) => key !== 'theaterId') ||
    !Number.isInteger(theaterId) ||
    theaterId <= 0
  ) {
    return res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'A valid theaterId is required.',
      },
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const cashierResult = await client.query(
      `SELECT user_id
       FROM users
       WHERE user_id = $1 AND role = 'cashier'`,
      [cashierId]
    );

    if (cashierResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: {
          code: 'CASHIER_NOT_FOUND',
          message: 'Cashier not found.',
        },
      });
    }

    const theaterResult = await client.query(
      `SELECT theater_id, name, city, address
       FROM theaters
       WHERE theater_id = $1`,
      [theaterId]
    );

    if (theaterResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(422).json({
        error: {
          code: 'INVALID_THEATER_IDS',
          message: 'The selected theater does not exist.',
        },
      });
    }

    await client.query(
      `DELETE FROM cashier_theaters
       WHERE cashier_id = $1`,
      [cashierId]
    );

    await client.query(
      `INSERT INTO cashier_theaters (cashier_id, theater_id)
       VALUES ($1, $2)`,
      [cashierId, theaterId]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      data: [
        {
          id: theaterResult.rows[0].theater_id,
          name: theaterResult.rows[0].name,
          city: theaterResult.rows[0].city,
          address: theaterResult.rows[0].address,
        },
      ],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating cashier theater:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update cashier theater assignment.',
      },
    });
  } finally {
    client.release();
  }
};


// PATCH: Activate or deactivate a cashier account
const updateCashier = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const cashierId = Number(req.params.id);
    const { active } = req.body || {};

    // Validate cashier ID
    if (!Number.isInteger(cashierId) || cashierId < 1) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid cashier ID',
          fieldErrors: {},
          details: {}
        }
      });
    }

    // Validate active status
    if (typeof active !== 'boolean') {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Active must be a boolean value',
          fieldErrors: {
            active: 'Active must be a boolean value'
          },
          details: {}
        }
      });
    }

    // Update cashier account
    const result = await pool.query(
      `UPDATE users
       SET active = $1
       WHERE user_id = $2 AND role = 'cashier'
       RETURNING
         user_id,
         first_name,
         last_name,
         email,
         role,
         active,
         created_at`,
      [active, cashierId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'CASHIER_NOT_FOUND',
          message: 'Cashier not found'
        }
      });
    }

    const cashier = result.rows[0];

    return res.status(200).json({
      data: {
        id: String(cashier.user_id),
        firstName: cashier.first_name,
        lastName: cashier.last_name,
        email: cashier.email,
        role: cashier.role,
        active: cashier.active,
        createdAt: cashier.created_at
      }
    });

  } catch (error) {
    console.error('Update cashier error:', error);

    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Server error'
      }
    });
  }
};

module.exports = {
  getCashiers,
  createCashier,
  getCashierTheaters,
  updateCashierTheaters,
  updateCashier
};
