const pool = require('../config/db');
const { getAgeWarning } = require('../utils/ageRating');

// All movie data is read from OUR database (the cache), never directly
// from TMDB, so the site keeps working when TMDB is down.

function toMovieSummary(row) {
  return {
    id: row.movie_id,
    title: row.title,
    posterUrl: row.poster_url,
    durationMinutes: row.duration_minutes,
    ageRating: row.age_rating,
  };
}

function toMovieDetails(row) {
  return {
    ...toMovieSummary(row),
    description: row.description,
    trailerUrl: row.trailer_url,
    ageWarning: getAgeWarning(row.age_rating),
  };
}

// theaterId (optional): only movies with upcoming screenings in that theater
async function getMovies({ theaterId } = {}) {
  if (theaterId) {
    const result = await pool.query(
      `SELECT DISTINCT m.*
         FROM movies m
         JOIN screenings s ON s.movie_id = m.movie_id
         JOIN rooms r      ON r.room_id = s.room_id
        WHERE r.theater_id = $1
          AND s.start_time > NOW()
        ORDER BY m.title`,
      [theaterId]
    );
    return result.rows.map(toMovieSummary);
  }

  const result = await pool.query('SELECT * FROM movies ORDER BY title');
  return result.rows.map(toMovieSummary);
}

async function getMovieById(movieId) {
  const result = await pool.query('SELECT * FROM movies WHERE movie_id = $1', [movieId]);
  if (result.rows.length === 0) return null;
  return toMovieDetails(result.rows[0]);
}

module.exports = { getMovies, getMovieById };
