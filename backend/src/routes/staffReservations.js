
const express = require('express');
const router = express.Router();

const {
  listReservations,
  getReservation,
  createReservation,
  updateReservation,
  cancelReservation
} = require('../controllers/staffReservationController');

const { authenticateUser } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { verifyCsrfToken } = require('../middleware/csrfMiddleware');

// All routes require an authenticated owner or cashier.
router.use(authenticateUser, requireRole('owner', 'cashier'));

// GET: Retrieve staff reservations.
router.get('/', listReservations);

// GET: Retrieve one staff reservation.
router.get('/:id', getReservation);

// POST: Create a staff reservation.
router.post('/', verifyCsrfToken, createReservation);

// PATCH: Update a staff reservation.
router.patch('/:id', verifyCsrfToken, updateReservation);

// POST: Cancel a staff reservation.
router.post('/:id/cancel', verifyCsrfToken, cancelReservation);

module.exports = router;
