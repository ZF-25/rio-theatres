
const express = require('express');
const router = express.Router();

const {
  listOwnerScreenings,
  createScreening,
  updateScreening,
  cancelScreening,
  deleteScreening,
} = require('../controllers/screeningController');

const { authenticateUser } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { verifyCsrfToken } = require('../middleware/csrfMiddleware');

// Every owner screening route requires an authenticated owner.
router.use(authenticateUser, requireRole('owner'));

router.get('/', listOwnerScreenings);
router.post('/', verifyCsrfToken, createScreening);
router.patch('/:id', verifyCsrfToken, updateScreening);
router.post('/:id/cancel', verifyCsrfToken, cancelScreening);
router.delete('/:id', verifyCsrfToken, deleteScreening);
module.exports = router;
