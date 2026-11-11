const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const pool = require('./src/config/db');
const cookieParser = require('cookie-parser');
const app = express();

// Behind Render/Rahti HTTPS termination, so Secure cookies work (contract 13).
app.set('trust proxy', 1);

// Request/correlation ID for server logs (contract 10). Never contains secrets.
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
});

// Credentialed CORS for the exact frontend origin(s), never a wildcard (contract 13).
// FRONTEND_URL may list several origins separated by commas.
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'],
  })
);

// Read JSON request bodies, maximum 64 KiB (contract 2).
app.use(express.json({ limit: '64kb' }));

//Это позволит Express читать cookie, в частности нашу rio_session
app.use(cookieParser());

// Liveness check outside /api/v1 (contract 13): 200 {"status":"ok"}, no secrets.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Old health check, kept until the frontend switches to API mode.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});


// Database check
app.get('/api/db-check', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ dbTime: result.rows[0].now });
  } catch (err) {
    next(err);
  }
});

// Customer API (contract: everything under /api/v1)
app.use('/api/v1', require('./src/routes/v1'));
// Authentication routes
app.use('/api/auth', require('./src/routes/auth'));
app.use(
  '/api/v1/owner/cashiers',
  require('./src/routes/ownerCashiers')
);
// Unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found', fieldErrors: {}, details: {} },
  });
});

// Error handler - one error shape for every endpoint (contract 3 + 10):
// { error: { code, message, fieldErrors, details } }
app.use((err, req, res, next) => {
  const send = (status, code, message, fieldErrors = {}, details = {}) =>
    res.status(status).json({ error: { code, message, fieldErrors, details } });

  // Malformed JSON request body
  if (err.type === 'entity.parse.failed') {
    return send(400, 'BAD_REQUEST', 'The request body is not valid JSON.');
  }

  // Body larger than 64 KiB
  if (err.type === 'entity.too.large') {
    return send(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  }

  // Our own errors (404, 409, 422...) are safe to show to the client.
  if (err.status && err.status < 500) {
    return send(err.status, err.code, err.message, err.fieldErrors, err.details);
  }

  // Unexpected errors: log with the request ID, never expose SQL or stack traces.
  console.error(`[request ${req.id}]`, err);
  return send(500, 'INTERNAL_SERVER_ERROR', 'Something went wrong.');
});

module.exports = app;