const screeningService = require('../services/screeningService');
const httpError = require('../utils/httpError');
const { toId, toDate } = require('../utils/validate');

async function listScreenings(req, res) {
  const { theaterId, movieId, date } = req.query;
  res.json(
    await screeningService.getScreenings({
      theaterId: theaterId ? toId(theaterId, 'theaterId') : undefined,
      movieId: movieId ? toId(movieId, 'movieId') : undefined,
      date: date ? toDate(date, 'date') : undefined,
    })
  );
}

async function getScreening(req, res) {
  const screening = await screeningService.getScreeningById(toId(req.params.id, 'id'));
  if (!screening) throw httpError(404, 'SCREENING_NOT_FOUND', 'Screening not found');
  res.json(screening);
}

module.exports = { listScreenings, getScreening };
