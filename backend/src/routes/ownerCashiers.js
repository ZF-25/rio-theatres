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

// All routes require an authenticated owner
router.use(authenticateUser, requireRole('owner'));

// GET: Retrieve all cashier accounts
router.get('/', getCashiers);

// POST: Create a new cashier account
router.post('/', createCashier);

// GET: Retrieve theaters assigned to a cashier
router.get('/:id/theaters', getCashierTheaters);

// PUT: Replace cashier theater assignments
router.put('/:id/theaters', updateCashierTheaters);
// PATCH: Activate or deactivate a cashier account
router.patch('/:id', updateCashier);

module.exports = router;