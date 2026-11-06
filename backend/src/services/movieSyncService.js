const pool = require('../config/db');
const tmdb = require('./tmdbService');

// Copies poster, trailer, description and age rating from TMDB into our
// movies table (the cache). If TMDB is down, nothing is changed and the
// API keeps serving the data already stored.
//
// Existing values are only replaced when TMDB actually has a value
// (COALESCE), and durations are never changed because screening end
// times were calculated from them.
async function syncMovies() {
  const { rows: movies } = await pool.query(
    'SELECT movie_id, title, tmdb_id FROM movies ORDER BY movie_id'
  );

  const summary = { total: movies.length, updated: 0, notFound: 0, failed: 0 };

  for (const movie of movies) {
    try {
      const tmdbId = movie.tmdb_id || (await tmdb.searchMovieId(movie.title));
      if (!tmdbId) {
        summary.notFound += 1;
        console.warn(`[movie-sync] Not found on TMDB: "${movie.title}"`);
        continue;
      }

      const details = await tmdb.getMovieDetails(tmdbId);

      await pool.query(
        `UPDATE movies
            SET tmdb_id          = $2,
                description      = COALESCE($3, description),
                poster_url       = COALESCE($4, poster_url),
                trailer_url      = COALESCE($5, trailer_url),
                age_rating       = COALESCE($6, age_rating),
                duration_minutes = COALESCE(duration_minutes, $7)
          WHERE movie_id = $1`,
        [
          movie.movie_id,
          details.tmdbId,
          details.description,
          details.posterUrl,
          details.trailerUrl,
          details.ageRating,
          details.durationMinutes,
        ]
      );
      summary.updated += 1;
    } catch (err) {
      summary.failed += 1;
      console.warn(`[movie-sync] Failed for "${movie.title}": ${err.message}`);
    }
  }

  console.log('[movie-sync] Done:', summary);
  return summary;
}

// Runs the sync now and then every few hours, without ever crashing
// the server.
function startMovieSync(intervalHours = 12) {
  if (!process.env.TMDB_API_KEY) {
    console.warn('[movie-sync] TMDB_API_KEY not set — using movies already in the database.');
    return;
  }

  const run = () =>
    syncMovies().catch((err) => console.warn('[movie-sync] Skipped:', err.message));

  run();
  setInterval(run, intervalHours * 60 * 60 * 1000).unref();
}

module.exports = { syncMovies, startMovieSync };
