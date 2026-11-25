
const screeningService = require('../services/screeningService');
const seatService = require('../services/seatService');
const movieService = require('../services/movieService');
const cinemaService = require('../services/cinemaService');
const { notFound, validationError } = require('../utils/httpError');
const { pathId, filterId, calendarDate, pagination } = require('../utils/validate');
const { sendData, sendList, noStore } = require('../utils/respond');


// GET /screenings?movieId=&cinemaId=&roomId=&date=&page=&pageSize=
async function listScreenings(req, res) {
  const movieId = filterId(req.query.movieId, 'movieId');
  const cinemaId = filterId(req.query.cinemaId, 'cinemaId');
  const roomId = filterId(req.query.roomId, 'roomId');
  const date = calendarDate(req.query.date);
  const page = pagination(req.query);

  if (movieId && !(await movieService.movieExists(movieId))) {
    throw validationError('movieId', 'Unknown movie.');
  }
  if (cinemaId && !(await cinemaService.cinemaExists(cinemaId))) {
    throw validationError('cinemaId', 'Unknown cinema.');
  }
  if (roomId && !(await cinemaService.roomExists(roomId))) {
    throw validationError('roomId', 'Unknown room.');
  }

  const { items, totalItems } = await screeningService.listScreenings({
    movieId, cinemaId, roomId, date, ...page,
  });

  noStore(res);
  sendList(res, items, { ...page, totalItems });
}

// GET /owner/screenings
async function listOwnerScreenings(req, res) {
  const movieId = filterId(req.query.movieId, 'movieId');
  const cinemaId = filterId(req.query.cinemaId, 'cinemaId');
  const roomId = filterId(req.query.roomId, 'roomId');
  const date = calendarDate(req.query.date);
  const page = pagination(req.query);

  if (movieId && !(await movieService.movieExists(movieId))) {
    throw validationError('movieId', 'Unknown movie.');
  }
  if (cinemaId && !(await cinemaService.cinemaExists(cinemaId))) {
    throw validationError('cinemaId', 'Unknown cinema.');
  }
  if (roomId && !(await cinemaService.roomExists(roomId))) {
    throw validationError('roomId', 'Unknown room.');
  }

  const { items, totalItems } = await screeningService.listOwnerScreenings({
    movieId, cinemaId, roomId, date, ...page,
  });

  noStore(res);
  sendList(res, items, { ...page, totalItems });
}

// GET /screenings/:screeningId
async function getScreening(req, res) {
  const screening = await screeningService.getScreening(
    pathId(req.params.screeningId, 'Screening not found')
  );

  if (!screening) throw notFound('Screening not found');

  noStore(res);
  sendData(res, screening);
}

// GET /screenings/:screeningId/seats
async function getSeatMap(req, res) {
  const seatMap = await seatService.getSeatMap(
    pathId(req.params.screeningId, 'Screening not found')
  );

  if (!seatMap) throw notFound('Screening not found');

  noStore(res);
  sendData(res, seatMap);
}

// POST /owner/screenings
async function createScreening(req, res) {
  const screening = await screeningService.createScreening(req.body);
  noStore(res);
  return res.status(201).json({ data: screening });
}

// PATCH /owner/screenings/:id
async function updateScreening(req, res) {
  const screeningId = pathId(req.params.id, 'Screening not found');
  const screening = await screeningService.updateScreening(
    screeningId,
    req.body
  );

  noStore(res);
  sendData(res, screening);
}

// POST /owner/screenings/:id/cancel
async function cancelScreening(req, res) {
  const screeningId = pathId(req.params.id, 'Screening not found');

  const screening = await screeningService.cancelScreening(screeningId);

  noStore(res);
  sendData(res, screening);
}

// DELETE /owner/screenings/:id
async function deleteScreening(req, res) {
  const screeningId = pathId(req.params.id, 'Screening not found');

  const result = await screeningService.deleteScreening(screeningId);

  noStore(res);
  return res.status(200).json({ data: result });
}
module.exports = {
  listScreenings,
  listOwnerScreenings,
  getScreening,
  getSeatMap,
  createScreening,
  updateScreening,
  cancelScreening,
  deleteScreening,
};
