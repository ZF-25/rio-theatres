
const pool = require('../config/db');

// Получаем актуальные назначения кинотеатров для текущего кассира.
const loadCashierTheaters = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'cashier') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Cashier access required.',
        },
      });
    }

    const result = await pool.query(
      `SELECT theater_id
       FROM cashier_theaters
       WHERE cashier_id = $1
       ORDER BY theater_id`,
      [req.user.user_id]
    );

    // Сохраняем актуальные назначения для текущего запроса.
    req.cashierTheaterIds = result.rows.map(
      (row) => row.theater_id
    );

    next();
  } catch (error) {
    console.error('Error loading cashier theaters:', error.message);

    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to load cashier theater assignments.',
      },
    });
  }
};

const requireAssignedTheater = (getTheaterId) => {
  return (req, res, next) => {
    const theaterId = Number(getTheaterId(req));

    if (
      !Number.isInteger(theaterId) ||
      theaterId <= 0 ||
      !req.cashierTheaterIds?.includes(theaterId)
    ) {
      return res.status(403).json({
        error: {
          code: 'THEATER_ACCESS_DENIED',
          message: 'You do not have access to this theater.',
        },
      });
    }

    next();
  };
};

module.exports = {
  loadCashierTheaters,
  requireAssignedTheater,
};
