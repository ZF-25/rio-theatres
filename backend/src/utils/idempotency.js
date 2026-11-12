const crypto = require('crypto');
const { httpError } = require('./httpError');

// Idempotency-Key handling for POST /holds and POST /bookings
// (contract section 6, "Required idempotency behavior").

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readIdempotencyKey(req) {
  const key = req.get('Idempotency-Key');
  if (!key || !UUID.test(key)) {
    throw httpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key (UUID) header is required.');
  }
  return key.toLowerCase();
}

// Same JSON content gives the same hash regardless of key order.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const hashBody = (body) => crypto.createHash('sha256').update(canonical(body ?? null)).digest('hex');

// Runs `work` at most once per (route, owner, key), inside the caller's
// transaction:
// - concurrent identical requests wait on an advisory lock and then replay
//   the committed result;
// - same key + same body  -> the ORIGINAL status and body, no new write;
// - same key + other body -> 409 IDEMPOTENCY_KEY_REUSED;
// - errors are not recorded, so a failed request can be retried.
async function runOnce(client, { route, ownerKey, key, body }, work) {
  const scope = `${route}|${ownerKey}|${key}`;
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [scope]);

  const requestHash = hashBody(body);
  const existing = await client.query(
    `SELECT request_hash, response_status, response_body
       FROM idempotency_records
      WHERE route = $1 AND owner_key = $2 AND idempotency_key = $3`,
    [route, ownerKey, key]
  );
  if (existing.rows.length) {
    const record = existing.rows[0];
    if (record.request_hash !== requestHash) {
      throw httpError(409, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request.');
    }
    return { status: record.response_status, body: record.response_body, replayed: true };
  }

  const result = await work();
  await client.query(
    `INSERT INTO idempotency_records
       (route, owner_key, idempotency_key, request_hash, response_status, response_body)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [route, ownerKey, key, requestHash, result.status, JSON.stringify(result.body)]
  );
  return { ...result, replayed: false };
}

module.exports = { readIdempotencyKey, runOnce, hashBody };
