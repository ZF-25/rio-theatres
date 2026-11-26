const express = require('express');
const { requireCheckoutOwner } = require('../middleware/checkoutOwner');
const { listMyBookings } = require('../controllers/bookingController');
const { httpError } = require('../utils/httpError');

// The signed-in customer's own data (contract section 6).
const router = express.Router();

// Booking history belongs to a customer account: guest sessions get 401.
function requireAccount(req, res, next) {
  if (req.checkoutOwner.isGuest) throw httpError(401, 'AUTH_REQUIRED', 'Please sign in to continue.');
  next();
}

router.get('/bookings', requireCheckoutOwner, requireAccount, listMyBookings);

module.exports = router;
