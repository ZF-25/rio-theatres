
const staffReservationService = require('../services/staffReservationService');

const handleError = (res, error, action) => {
  console.error(`Staff reservation ${action} error:`, error);

  const status = error.status || 500;

  return res.status(status).json({
    error: {
      code: error.code || 'SERVER_ERROR',
      message: status === 500 ? 'Server error' : error.message,
      ...(error.fieldErrors && { fieldErrors: error.fieldErrors }),
      ...(error.details && { details: error.details })
    }
  });
};

// GET: List staff reservations
const listReservations = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const result = await staffReservationService.listReservations(
      req.user,
      req.query
    );

    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'list');
  }
};

// GET: Retrieve one staff reservation
const getReservation = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const result = await staffReservationService.getReservationById(
      req.user,
      req.params.id
    );

    return res.status(200).json({ data: result });
  } catch (error) {
    return handleError(res, error, 'get');
  }
};

// POST: Create a staff reservation
const createReservation = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const result = await staffReservationService.createReservation(
      req.user,
      req.body
    );

    return res.status(201).json({ data: result });
  } catch (error) {
    return handleError(res, error, 'create');
  }
};

// PATCH: Update a staff reservation
const updateReservation = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const result = await staffReservationService.updateReservation(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({ data: result });
  } catch (error) {
    return handleError(res, error, 'update');
  }
};

// POST: Cancel a staff reservation
const cancelReservation = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const result = await staffReservationService.cancelReservation(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({ data: result });
  } catch (error) {
    return handleError(res, error, 'cancel');
  }
};

module.exports = {
  listReservations,
  getReservation,
  createReservation,
  updateReservation,
  cancelReservation
};
