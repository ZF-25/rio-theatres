// Run with: npm run sync:movies
require('dotenv').config();
const pool = require('../src/config/db');
const { syncMovies } = require('../src/services/movieSyncService');

syncMovies()
  .catch((err) => {
    console.error('Movie sync failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
