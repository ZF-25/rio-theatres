const express = require('express');
const { listScreenings, getScreening } = require('../controllers/screeningController');

const router = express.Router();

router.get('/', listScreenings);
router.get('/:id', getScreening);

module.exports = router;
