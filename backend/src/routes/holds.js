const express = require('express');
const { requireCheckoutOwner } = require('../middleware/checkoutOwner');
const { createHold, getHold, releaseHold } = require('../controllers/holdController');
const { verifyCsrfToken } = require('../middleware/csrfMiddleware');

// Checkout holds (contract section 6). CSRF protection is added together
// with Marina's GET /auth/session.
const router = express.Router();

router.use(requireCheckoutOwner);

router.post('/', verifyCsrfToken, createHold);
router.get('/:holdId', getHold);
router.delete('/:holdId', verifyCsrfToken, releaseHold);

module.exports = router;
