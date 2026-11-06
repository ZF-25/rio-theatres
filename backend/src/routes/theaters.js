const express = require('express');
const { listTheaters } = require('../controllers/theaterController');

const router = express.Router();

router.get('/', listTheaters);

module.exports = router;
