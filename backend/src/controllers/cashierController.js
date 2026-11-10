
const pool = require('../config/db');
const bcrypt = require('bcrypt');
// GET: Retrieve all cashier accounts
const getCashiers = async (req, res) => {
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

    res.set('Cache-Control', 'no-store');

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
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to retrieve cashier accounts',
        fieldErrors: {},
        details: {}
      }
    });
  }
};


// POST: Create a new cashier account
const createCashier = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Validate required fields
    if (
      typeof firstName !== 'string' ||
      !firstName.trim() ||
      typeof email !== 'string' ||
      !email.trim() ||
      typeof password !== 'string' ||
      !password
    ) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'First name, email and password are required'
        }
      });
    }

    const cleanFirstName = firstName.trim();
    const cleanLastName =
      typeof lastName === 'string' && lastName.trim()
        ? lastName.trim()
        : null;
    const cleanEmail = email.trim().toLowerCase();

    // Validate field lengths
    if (
      cleanFirstName.length > 100 ||
      (cleanLastName && cleanLastName.length > 100) ||
      cleanEmail.length > 255 ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'One or more fields have invalid lengths'
        }
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid email address'
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
          code: 'EMAIL_ALREADY_EXISTS',
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

    res.set('Cache-Control', 'no-store');

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

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
};
// GET: Retrieve theaters assigned to a cashier
const getCashierTheaters = async (req, res) => {
  try {
    const cashierId = Number(req.params.id);

    if (!Number.isInteger(cashierId) || cashierId < 1) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid cashier ID'
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
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to retrieve cashier theater assignments'
      }
    });
  }
};
// PUT: Replace cashier theater assignments
const updateCashierTheaters = async (req, res) => {
  const client = await pool.connect();

  try {
    const cashierId = Number(req.params.id);
    const { theaterIds } = req.body;

    if (!Number.isInteger(cashierId) || cashierId < 1) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid cashier ID'
        }
      });
    }

    if (
      !Array.isArray(theaterIds) ||
      !theaterIds.every(
        (id) => Number.isInteger(id) && id > 0
      ) ||
      new Set(theaterIds).size !== theaterIds.length
    ) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'theaterIds must be an array of unique positive integers'
        }
      });
    }

    await client.query('BEGIN');

    const cashierResult = await client.query(
      `SELECT user_id
       FROM users
       WHERE user_id = $1 AND role = 'cashier'
       FOR UPDATE`,
      [cashierId]
    );

    if (cashierResult.rows.length === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: {
          code: 'CASHIER_NOT_FOUND',
          message: 'Cashier not found'
        }
      });
    }

    const theaterResult = await client.query(
      `SELECT theater_id
       FROM theaters
       WHERE theater_id = ANY($1::integer[])`,
      [theaterIds]
    );

    if (theaterResult.rows.length !== theaterIds.length) {
      await client.query('ROLLBACK');

      return res.status(422).json({
        error: {
          code: 'INVALID_THEATER_IDS',
          message: 'One or more theater IDs do not exist'
        }
      });
    }

    await client.query(
      'DELETE FROM cashier_theaters WHERE cashier_id = $1',
      [cashierId]
    );

    for (const theaterId of theaterIds) {
      await client.query(
        `INSERT INTO cashier_theaters (cashier_id, theater_id)
         VALUES ($1, $2)`,
        [cashierId, theaterId]
      );
    }

    await client.query('COMMIT');

    const result = await client.query(
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
    await client.query('ROLLBACK');

    console.error('Update cashier theaters error:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to update cashier theater assignments'
      }
    });
  } finally {
    client.release();
  }
};

// PATCH: Activate or deactivate a cashier account
const updateCashier = async (req, res) => {
  try {
    const cashierId = Number(req.params.id);
    const { active } = req.body;

    // Validate cashier ID
    if (!Number.isInteger(cashierId) || cashierId < 1) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid cashier ID'
        }
      });
    }

    // Validate active status
    if (typeof active !== 'boolean') {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Active must be a boolean value'
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

    res.set('Cache-Control', 'no-store');

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
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to update cashier account'
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