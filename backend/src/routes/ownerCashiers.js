
const express = require('express');
const router = express.Router();

const {
  getCashiers,
  createCashier,
  getCashierTheaters,
  updateCashierTheaters,
  updateCashier
} = require('../controllers/cashierController');

const { authenticateUser } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { verifyCsrfToken } = require('../middleware/csrfMiddleware');

// All routes require an authenticated owner.
router.use(authenticateUser, requireRole('owner'));

// GET: Retrieve all cashier accounts.
router.get('/', getCashiers);

// POST: Create a new cashier account.
router.post('/', verifyCsrfToken, createCashier);

// GET: Retrieve theaters assigned to a cashier.
router.get('/:id/theaters', getCashierTheaters);

// PUT: Replace cashier theater assignments.
router.put('/:id/theaters', verifyCsrfToken, updateCashierTheaters);

// PATCH: Activate or deactivate a cashier account.
router.patch('/:id', verifyCsrfToken, updateCashier);

module.exports = router;
