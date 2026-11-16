const express = require('express');
const { listScreenings, getScreening, getSeatMap } = require('../controllers/screeningController');

const router = express.Router();

router.get('/', listScreenings);
router.get('/:screeningId', getScreening);
router.get('/:screeningId/seats', getSeatMap);

module.exports = router;
