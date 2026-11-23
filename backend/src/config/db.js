const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Handle disconnected idle clients without stopping the server.
pool.on('error', (error) => {
  console.error(
    'Idle database connection failed:',
    error.code || 'UNKNOWN',
  );
});

module.exports = pool;