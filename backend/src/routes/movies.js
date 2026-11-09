const express = require('express');
const { listMovies, getMovie } = require('../controllers/movieController');

const router = express.Router();

router.get('/', listMovies);
router.get('/:id', getMovie);

module.exports = router;
