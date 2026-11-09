const httpError = require('./httpError');

// Turns a route/query value into a positive integer or throws 400.
function toId(value, name) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError(400, 'INVALID_INPUT', `${name} must be a positive integer`);
  }
  return id;
}

// Checks a YYYY-MM-DD date string or throws 400.
function toDate(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw httpError(400, 'INVALID_INPUT', `${name} must be a date in YYYY-MM-DD format`);
  }
  return value;
}

module.exports = { toId, toDate };
