const express = require('express');
const { listGenres } = require('../controllers/cinemaController');

// Public catalogue under /api/v1 (contract section 5).
const router = express.Router();

router.use('/cinemas', require('./cinemas'));
router.get('/genres', listGenres);
router.use('/movies', require('./movies'));
router.use('/screenings', require('./screenings'));
router.use('/holds', require('./holds'));
router.use('/bookings', require('./bookings'));
router.use('/me', require('./me'));
router.use('/staff/reservations', require('./staffReservations'));

module.exports = router;
