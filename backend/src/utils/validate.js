const { notFound, validationError } = require('./httpError');

// IDs are opaque strings in the API. In our database they are integers,
// so we send String(id) and accept only digit strings back.
const toApiId = (id) => (id === null || id === undefined ? null : String(id));

function isDbId(value) {
  return typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647;
}

// Path IDs (/movies/:movieId): an ID that cannot exist is simply "not found".
function pathId(value, message) {
  if (!isDbId(value)) throw notFound(message);
  return Number(value);
}

// Filter IDs (?cinemaId=): a malformed one is a validation error (422).
// Whether it exists is checked by the service (also 422).
function filterId(value, field) {
  if (value === undefined) return undefined;
  if (!isDbId(value)) throw validationError(field, 'Unknown ID.');
  return Number(value);
}

// YYYY-MM-DD and a real calendar date (2026-02-30 is rejected).
function calendarDate(value, field = 'date') {
  if (value === undefined) return undefined;
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const [, y, m, d] = match.map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
      return value;
    }
  }
  throw validationError(field, 'Use a real date in YYYY-MM-DD format.');
}

// page default 1, pageSize default 20, maximum 100.
function pagination(query) {
  const parse = (value, field, fallback, max) => {
    if (value === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > max) {
      throw validationError(field, max === Infinity ? 'Use a positive integer.' : `Use an integer from 1 to ${max}.`);
    }
    return Number(value);
  };
  const page = parse(query.page, 'page', 1, Infinity);
  const pageSize = parse(query.pageSize, 'pageSize', 20, 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// Title search: trimmed, maximum 100 characters.
function searchText(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw validationError('search', 'Search must be text.');
  const text = value.trim();
  if (text.length > 100) throw validationError('search', 'Use at most 100 characters.');
  return text === '' ? undefined : text;
}

module.exports = { toApiId, pathId, filterId, calendarDate, pagination, searchText };
