
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const pool = require('./src/config/db');
const cookieParser = require('cookie-parser');

const app = express();

// Trust the HTTPS proxy used by Render/Rahti.
app.set('trust proxy', 1);

// Request ID for logging and debugging.
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
});

// Allow credentialed requests from configured frontend origins.
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

// Stripe webhook MUST receive the raw body before express.json().
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json', limit: '256kb' }),
  require('./src/controllers/stripeWebhookController').stripeWebhook
);

// Parse JSON request bodies (maximum 64 KB).
app.use(express.json({ limit: '64kb' }));

// Parse session cookies.
app.use(cookieParser());

// Health checks.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Database connection check.
app.get('/api/db-check', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ dbTime: result.rows[0].now });
  } catch (err) {
    next(err);
  }
});

// Main versioned API (catalogue, screenings, holds, etc.).
app.use('/api/v1', require('./src/routes/v1'));

// Authentication API.
app.use('/api/v1/auth', require('./src/routes/auth'));

// Temporary compatibility with the old frontend.
app.use('/api/auth', require('./src/routes/auth'));

// Owner API: cashier management.
app.use(
  '/api/v1/owner/cashiers',
  require('./src/routes/ownerCashiers')
);

// Cashier API.
app.use(
  '/api/v1/cashier',
  require('./src/routes/cashier')
);

// Handle unknown routes.
app.use((req, res) => {
  res.set('Cache-Control', 'no-store');

  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
      fieldErrors: {},
      details: {},
    },
  });
});

// Global error handler.
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  res.set('Cache-Control', 'no-store');

  const sendError = (status, code, message, fieldErrors = {}, details = {}) => {
    return res.status(status).json({
      error: {
        code,
        message,
        fieldErrors,
        details,
      },
    });
  };

  // Malformed JSON.
  if (err.type === 'entity.parse.failed') {
    return sendError(
      400,
      'INVALID_JSON',
      'Request body contains invalid JSON'
    );
  }

  // Request body exceeds the allowed limit.
  if (err.type === 'entity.too.large') {
    return sendError(
      413,
      'PAYLOAD_TOO_LARGE',
      'Request body is too large'
    );
  }

  // Expected client errors and explicitly exposed errors.
  const status = Number.isInteger(err.status) ? err.status : 500;

  if (
    (status >= 400 && status < 500) ||
    (status >= 500 && err.expose === true)
  ) {
    return sendError(
      status,
      err.code || 'REQUEST_ERROR',
      err.message || 'Request could not be processed',
      err.fieldErrors || {},
      err.details || {}
    );
  }

  // Unexpected server errors.
  console.error(`[request ${req.id}]`, err);

  return sendError(
    500,
    'INTERNAL_SERVER_ERROR',
    'Something went wrong'
  );
});

module.exports = app;
