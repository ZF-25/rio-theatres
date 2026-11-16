const movieService = require('../services/movieService');
const cinemaService = require('../services/cinemaService');
const genreService = require('../services/genreService');
const { notFound, validationError } = require('../utils/httpError');
const { pathId, filterId, pagination, searchText } = require('../utils/validate');
const { sendData, sendList } = require('../utils/respond');

// GET /movies?cinemaId=&search=&genreId=&page=&pageSize=
async function listMovies(req, res) {
  const cinemaId = filterId(req.query.cinemaId, 'cinemaId');
  const genreId = req.query.genreId;
  const search = searchText(req.query.search);
  const page = pagination(req.query);

  // Unknown resource IDs in filters are 422 (contract section 4).
  if (cinemaId && !(await cinemaService.cinemaExists(cinemaId))) {
    throw validationError('cinemaId', 'Unknown cinema.');
  }
  if (genreId !== undefined && !(await genreService.genreExists(genreId))) {
    throw validationError('genreId', 'Unknown genre.');
  }

  const { items, totalItems } = await movieService.listMovies({ cinemaId, search, ...page });
  sendList(res, items, { ...page, totalItems });
}

async function getMovie(req, res) {
  const movie = await movieService.getMovie(pathId(req.params.movieId, 'Movie not found'));
  if (!movie) throw notFound('Movie not found');
  sendData(res, movie);
}

module.exports = { listMovies, getMovie };
