const cinemaService = require('../services/cinemaService');
const genreService = require('../services/genreService');
const { notFound } = require('../utils/httpError');
const { pathId, pagination } = require('../utils/validate');
const { sendList } = require('../utils/respond');

async function listCinemas(req, res) {
  const page = pagination(req.query);
  const { items, totalItems } = await cinemaService.listCinemas(page);
  sendList(res, items, { ...page, totalItems });
}

async function listRooms(req, res) {
  const cinemaId = pathId(req.params.cinemaId, 'Cinema not found');
  if (!(await cinemaService.cinemaExists(cinemaId))) throw notFound('Cinema not found');
  const page = pagination(req.query);
  const { items, totalItems } = await cinemaService.listRooms(cinemaId, page);
  sendList(res, items, { ...page, totalItems });
}

async function listGenres(req, res) {
  const page = pagination(req.query);
  const { items, totalItems } = await genreService.listGenres(page);
  sendList(res, items, { ...page, totalItems });
}

module.exports = { listCinemas, listRooms, listGenres };
