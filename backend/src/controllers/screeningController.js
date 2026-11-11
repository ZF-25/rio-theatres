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
  noStore(res); // contains seat availability
  sendList(res, items, { ...page, totalItems });
}

async function getScreening(req, res) {
  const screening = await screeningService.getScreening(
    pathId(req.params.screeningId, 'Screening not found')
  );
  if (!screening) throw notFound('Screening not found');
  noStore(res);
  sendData(res, screening);
}

async function getSeatMap(req, res) {
  const seatMap = await seatService.getSeatMap(
    pathId(req.params.screeningId, 'Screening not found')
  );
  if (!seatMap) throw notFound('Screening not found');
  noStore(res);
  sendData(res, seatMap);
}

module.exports = { listScreenings, getScreening, getSeatMap };
