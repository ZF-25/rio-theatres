const theaterService = require('../services/theaterService');

async function listTheaters(req, res) {
  res.json(await theaterService.getAllTheaters());
}

module.exports = { listTheaters };
