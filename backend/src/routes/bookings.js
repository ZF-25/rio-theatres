const express = require('express');
const { requireCheckoutOwner } = require('../middleware/checkoutOwner');
const { createBooking, getBooking } = require('../controllers/bookingController');
const { verifyCsrfToken } = require('../middleware/csrfMiddleware');

// Simulated purchases (contract section 6). CSRF protection is added
// together with Marina's GET /auth/session.
const router = express.Router();
router.use(requireCheckoutOwner);

router.post('/', verifyCsrfToken, createBooking);
router.get('/:reference', getBooking);

module.exports = router;
