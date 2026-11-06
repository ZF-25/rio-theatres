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

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: { code: err.code || 'SERVER_ERROR', message: err.message || 'Server error' },
  });
});

module.exports = app;