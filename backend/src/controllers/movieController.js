const movieService = require('../services/movieService');
const httpError = require('../utils/httpError');
const { toId } = require('../utils/validate');

async function listMovies(req, res) {
  const theaterId = req.query.theaterId ? toId(req.query.theaterId, 'theaterId') : undefined;
  res.json(await movieService.getMovies({ theaterId }));
}

async function getMovie(req, res) {
  const movie = await movieService.getMovieById(toId(req.params.id, 'id'));
  if (!movie) throw httpError(404, 'MOVIE_NOT_FOUND', 'Movie not found');
  res.json(movie);
}

module.exports = { listMovies, getMovie };
