const pool = require('../config/db');
const { toApiId } = require('../utils/validate');
const { toAgeRating } = require('../utils/ageRating');

// All movie data is read from OUR database (the local catalogue), never
// directly from TMDB, so browsing works when TMDB is down (section 11).

// "https://www.youtube.com/watch?v=abc" -> { provider: "youtube", videoId: "abc" }
// v1 supports only YouTube (contract section 5).
function toTrailer(url) {
  if (!url) return null;
  const match = /^https:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]{6,20})$/.exec(url);
  return match ? { provider: 'youtube', videoId: match[1] } : null;
}

// Image URLs must be absolute HTTPS (contract section 5).
const httpsOrNull = (url) => (typeof url === 'string' && url.startsWith('https://') ? url : null);

function toMovie(row) {
  return {
    id: toApiId(row.movie_id),
    tmdbId: row.tmdb_id,
    title: row.title,
    description: row.description || '',
    durationMinutes: row.duration_minutes,
    genres: [],
    posterUrl: httpsOrNull(row.poster_url),
    backdropUrl: null,
    // A rating on a TMDB-linked movie came from TMDB; otherwise it was
    // entered locally (seed data / admin).
    ageRating: toAgeRating(row.age_rating, row.tmdb_id ? 'tmdb' : 'manual'),
    trailer: toTrailer(row.trailer_url),
    metadataUpdatedAt: null,
  };
}

// Escape % and _ so a search for "50%" matches literally.
const likePattern = (text) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Public list: only movies with future screenings (in the cinema, if given).
// Sorted by title, then ID.
async function listMovies({ cinemaId, search, pageSize, offset }) {
  const values = [];
  const where = [
    `EXISTS (
       SELECT 1 FROM screenings s JOIN rooms r ON r.room_id = s.room_id
        WHERE s.movie_id = m.movie_id
          AND s.start_time > NOW()
          ${cinemaId ? `AND r.theater_id = $${values.push(cinemaId)}` : ''}
     )`,
  ];
  if (search) where.push(`m.title ILIKE $${values.push(likePattern(search))}`);
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT m.* FROM movies m ${whereSql}
        ORDER BY m.title, m.movie_id
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset]
    ),
    pool.query(`SELECT COUNT(*)::int AS n FROM movies m ${whereSql}`, values),
  ]);
  return { items: rows.rows.map(toMovie), totalItems: count.rows[0].n };
}

// Details stay readable after a movie's last screening.
async function getMovie(movieId) {
  const { rows } = await pool.query('SELECT * FROM movies WHERE movie_id = $1', [movieId]);
  return rows.length ? toMovie(rows[0]) : null;
}

async function movieExists(movieId) {
  const { rows } = await pool.query('SELECT 1 FROM movies WHERE movie_id = $1', [movieId]);
  return rows.length > 0;
}

module.exports = { listMovies, getMovie, movieExists, toTrailer };
