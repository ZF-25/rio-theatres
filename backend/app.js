const express = require('express');
const cors = require('cors');
const pool = require('./src/config/db');

const app = express();

// Allow the React app to call this API
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));

// Read JSON request bodies
app.use(express.json());

// Health check
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

// Customer API routes
app.use('/api/theaters', require('./src/routes/theaters'));
app.use('/api/movies', require('./src/routes/movies'));
app.use('/api/screenings', require('./src/routes/screenings'));

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// Error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;

  // Our own errors (400, 404, 409...) are safe to show to the client.
  if (status < 500) {
    return res.status(status).json({ error: { code: err.code, message: err.message } });
  }

  // Unexpected errors: log details on the server, hide them from the client.
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Server error' } });
});

module.exports = app;