const holdService = require('../services/holdService');
const { readIdempotencyKey } = require('../utils/idempotency');
const { noStore } = require('../utils/respond');

async function createHold(req, res) {
  const key = readIdempotencyKey(req);
  const result = await holdService.createHold(req.checkoutOwner, key, req.body);
  noStore(res);
  res.status(result.status).json(result.body);
}

async function getHold(req, res) {
  const hold = await holdService.getHold(req.checkoutOwner, req.params.holdId);
  noStore(res);
  res.json({ data: hold });
}

async function releaseHold(req, res) {
  await holdService.releaseHold(req.checkoutOwner, req.params.holdId);
  noStore(res);
  res.status(204).end();
}

module.exports = { createHold, getHold, releaseHold };
