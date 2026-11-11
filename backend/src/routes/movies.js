const express = require('express');
const { listMovies, getMovie } = require('../controllers/movieController');

const router = express.Router();

router.get('/', listMovies);
router.get('/:movieId', getMovie);

module.exports = router;
