
const express = require('express');
const router = express.Router();

const pool = require('../config/db');

const { authenticateUser } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const {
  loadCashierTheaters,
} = require('../middleware/cashierTheaterMiddleware');

// All routes require an authenticated cashier.
router.use(authenticateUser, requireRole('cashier'));

// GET: Retrieve theaters assigned to the current cashier.
router.get('/theaters', loadCashierTheaters, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT theater_id AS id, name, city, address
       FROM theaters
       WHERE theater_id = ANY($1::int[])
       ORDER BY theater_id`,
      [req.cashierTheaterIds]
    );

    return res.status(200).json({
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// GET: Retrieve screenings from the cashier's assigned theaters.
router.get('/screenings', loadCashierTheaters, async (req, res, next) => {
  try {
    if (req.cashierTheaterIds.length === 0) {
      return res.status(200).json({
        data: [],
      });
    }

    const values = [req.cashierTheaterIds];

    const result = await pool.query(
      `SELECT
         s.screening_id AS id,
         s.movie_id AS "movieId",
         m.title AS "movieTitle",
         m.age_rating AS "ageRating",
         r.theater_id AS "theaterId",
         t.city,
         s.room_id AS "roomId",
         r.room_name AS "roomName",
         s.start_time AS "startTime",
         s.end_time AS "endTime",
         s.ticket_price AS "ticketPrice"
       FROM screenings s
       JOIN movies m ON m.movie_id = s.movie_id
       JOIN rooms r ON r.room_id = s.room_id
       JOIN theaters t ON t.theater_id = r.theater_id
       WHERE r.theater_id = ANY($1::int[])
         AND s.start_time > NOW()
       ORDER BY s.start_time`,
      values
    );

    return res.status(200).json({
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
