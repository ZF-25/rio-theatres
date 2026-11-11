const express = require('express');
const { listCinemas, listRooms } = require('../controllers/cinemaController');

const router = express.Router();

router.get('/', listCinemas);
router.get('/:cinemaId/rooms', listRooms);

module.exports = router;
