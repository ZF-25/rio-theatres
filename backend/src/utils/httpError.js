// Creates an error that the error handler in app.js turns into the
// contract's error shape:
// { error: { code, message, fieldErrors: {}, details: {} } }
function httpError(status, code, message, { fieldErrors = {}, details = {} } = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.fieldErrors = fieldErrors;
  err.details = details;
  return err;
}

const notFound = (message = 'Not found') => httpError(404, 'NOT_FOUND', message);

// 422 for a single invalid field, e.g. validationError('date', 'Use YYYY-MM-DD.')
const validationError = (field, message) =>
  httpError(422, 'VALIDATION_ERROR', 'Please check the highlighted fields.', {
    fieldErrors: { [field]: message },
  });

module.exports = { httpError, notFound, validationError };
