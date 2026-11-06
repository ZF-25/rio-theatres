const pool = require('../config/db');

async function getAllTheaters() {
  const result = await pool.query(
    `SELECT theater_id, name, city, address
       FROM theaters
      ORDER BY city`
  );

  return result.rows.map((row) => ({
    id: row.theater_id,
    name: `${row.name} ${row.city}`,
    city: row.city,
    address: row.address,
  }));
}

module.exports = { getAllTheaters };
