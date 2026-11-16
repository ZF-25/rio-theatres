const bookingService = require('../services/bookingService');
const { readIdempotencyKey } = require('../utils/idempotency');
const { noStore, sendData, sendList } = require('../utils/respond');

async function createBooking(req, res) {
  const key = readIdempotencyKey(req);
  const result = await bookingService.createBooking(req.checkoutOwner, key, req.body);
  noStore(res);
  res.status(result.status).json(result.body);
}

async function getBooking(req, res) {
  const booking = await bookingService.getBooking(req.checkoutOwner, req.params.reference);
  noStore(res);
  sendData(res, booking);
}

async function listMyBookings(req, res) {
  const { items, ...meta } = await bookingService.listMyBookings(req.checkoutOwner, req.query);
  noStore(res);
  sendList(res, items, meta);
}

module.exports = { createBooking, getBooking, listMyBookings };
