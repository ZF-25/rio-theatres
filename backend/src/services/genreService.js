
const pool = require('../config/db');

async function listGenres({ pageSize, offset }) {
  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT genre_id, name
         FROM genres
        ORDER BY name, genre_id
        LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    ),
    pool.query(
      'SELECT COUNT(*)::int AS total FROM genres'
    ),
  ]);

  return {
    items: rows.rows.map((genre) => ({
      id: String(genre.genre_id),
      name: genre.name,
    })),
    totalItems: count.rows[0].total,
  };
}

async function genreExists(genreId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM genres WHERE genre_id = $1',
    [genreId]
  );

  return rows.length > 0;
}

module.exports = { listGenres, genreExists };
