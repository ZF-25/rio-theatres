// Creates an error that the error handler in app.js turns into
// { error: { code, message } } with the right HTTP status.
function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

module.exports = httpError;
