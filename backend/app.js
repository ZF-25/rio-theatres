
const express = require('express');
const cors = require('cors');
const pool = require('./src/config/db');
const cookieParser = require('cookie-parser');

const app = express();

// Allow the React frontend to send and receive session cookies.
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Parse JSON request bodies.
app.use(express.json());

// Parse cookies, including rio_session.
app.use(cookieParser());

// Health check.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Database check.
app.get('/api/db-check', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ dbTime: result.rows[0].now });
  } catch (err) {
    next(err);
  }
});

// Customer API routes.
app.use('/api/theaters', require('./src/routes/theaters'));
app.use('/api/movies', require('./src/routes/movies'));
app.use('/api/screenings', require('./src/routes/screenings'));

// Authentication API v1.
app.use('/api/v1/auth', require('./src/routes/auth'));

// Temporary compatibility with old frontend routes.
app.use('/api/auth', require('./src/routes/auth'));

// Owner API.
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
      message: 'Route not found'
    }
  });
});

// Global error handler.
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  res.set('Cache-Control', 'no-store');

  // Handle malformed JSON.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON'
      }
    });
  }

  // Handle request body that exceeds the configured size limit.
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large'
      }
    });
  }

  const status = Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status < 500
      ? err.status
      : 500;

  // Expected client errors.
  if (status < 500) {
    return res.status(status).json({
      error: {
        code: err.code || 'REQUEST_ERROR',
        message: err.message || 'Request could not be processed',
        ...(err.fieldErrors && {
          fieldErrors: err.fieldErrors
        })
      }
    });
  }

  // Unexpected server errors.
  console.error('Unhandled API error:', err);

  return res.status(500).json({
    error: {
      code: 'SERVER_ERROR',
      message: 'Server error'
    }
  });
});

module.exports = app;
