const express = require('express');
const { requireCheckoutOwner } = require('../middleware/checkoutOwner');
const { listMyBookings } = require('../controllers/bookingController');

// The signed-in customer's own data (contract section 6).
const router = express.Router();

router.get('/bookings', requireCheckoutOwner, listMyBookings);

module.exports = router;
