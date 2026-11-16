const express = require('express');
const { requireCheckoutOwner } = require('../middleware/checkoutOwner');
const { createHold, getHold, releaseHold } = require('../controllers/holdController');

// Checkout holds (contract section 6). CSRF protection is added together
// with Marina's GET /auth/session.
const router = express.Router();

router.use(requireCheckoutOwner);
router.post('/', createHold);
router.get('/:holdId', getHold);
router.delete('/:holdId', releaseHold);

module.exports = router;
