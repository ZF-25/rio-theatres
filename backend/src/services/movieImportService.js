const pool = require('../config/db');
const tmdb = require('./tmdbService');

// TMDB import (contract section 11): an owner runs a backend command with a
// TMDB movie ID. The movie is upserted by its unique tmdb_id into our local
// catalogue; the public API only ever reads the local catalogue.
//
// Local data wins when a movie already exists:
// - title is a locally editable snapshot and is never changed;
// - description, poster and trailer are only filled when empty (or when
//   the stored image/trailer link is not a valid HTTPS URL);
// - a stored Finnish age rating (possibly a verified manual one) is kept;
//   a non-Finnish one from older imports may be replaced by a Finnish one;
// - runtime is only filled when missing. Existing screenings keep their own
//   end times, so a metadata refresh never moves scheduled screenings.

const FINNISH_RATING = '^(S|K-S|(K-?)?[0-9]{1,2})$';

function parseTmdbId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`"${value}" is not a valid TMDB movie ID (a positive whole number).`);
  }
  return id;
}

async function importMovie(tmdbIdInput, { localMovieId } = {}) {
  const tmdbId = parseTmdbId(tmdbIdInput);
  const details = await tmdb.getMovieDetails(tmdbId); // throws if TMDB fails

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Is this TMDB movie already in the catalogue?
    const existing = await client.query(
      'SELECT movie_id FROM movies WHERE tmdb_id = $1 FOR UPDATE',
      [tmdbId]
    );

    let movieId;
    if (localMovieId) {
      // Link an existing local movie (e.g. from seed data) to this TMDB ID.
      if (existing.rows.length && existing.rows[0].movie_id !== localMovieId) {
        throw new Error(`TMDB ID ${tmdbId} is already linked to movie ${existing.rows[0].movie_id}.`);
      }
      const local = await client.query(
        'SELECT movie_id, tmdb_id FROM movies WHERE movie_id = $1 FOR UPDATE',
        [localMovieId]
      );
      if (local.rows.length === 0) throw new Error(`Local movie ${localMovieId} does not exist.`);
      if (local.rows[0].tmdb_id && local.rows[0].tmdb_id !== tmdbId) {
        throw new Error(`Movie ${localMovieId} is already linked to TMDB ID ${local.rows[0].tmdb_id}.`);
      }
      movieId = localMovieId;
    } else if (existing.rows.length) {
      movieId = existing.rows[0].movie_id;
    }

    let action;
    if (movieId) {
      await client.query(
        `UPDATE movies
            SET tmdb_id          = $2,
                description      = COALESCE(NULLIF(description, ''), $3),
                poster_url       = CASE WHEN poster_url LIKE 'https://%' THEN poster_url
                                        ELSE COALESCE($4, poster_url) END,
                trailer_url      = CASE WHEN trailer_url LIKE 'https://%' THEN trailer_url
                                        ELSE COALESCE($5, trailer_url) END,
                age_rating       = CASE
                                     WHEN age_rating ~* '${FINNISH_RATING}' THEN age_rating
                                     ELSE COALESCE($6, age_rating)
                                   END,
                duration_minutes = COALESCE(duration_minutes, $7)
          WHERE movie_id = $1`,
        [movieId, tmdbId, details.description, details.posterUrl, details.trailerUrl,
          details.ageRating, details.durationMinutes]
      );
      action = 'updated';
    } else {
      const inserted = await client.query(
        `INSERT INTO movies
           (title, description, duration_minutes, age_rating, poster_url, trailer_url, tmdb_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING movie_id`,
        [details.title, details.description || '', details.durationMinutes, details.ageRating,
          details.posterUrl, details.trailerUrl, tmdbId]
      );
      movieId = inserted.rows[0].movie_id;
      action = 'created';
    }

    await client.query('COMMIT');
    return { action, movieId, tmdbId, title: details.title, durationMinutes: details.durationMinutes,
      ageRating: details.ageRating };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Re-import every movie already linked to TMDB (fills only empty fields).
async function refreshLinkedMovies() {
  const { rows } = await pool.query(
    'SELECT movie_id, tmdb_id, title FROM movies WHERE tmdb_id IS NOT NULL ORDER BY movie_id'
  );
  const summary = { total: rows.length, updated: 0, failed: 0 };
  for (const row of rows) {
    try {
      await importMovie(row.tmdb_id);
      summary.updated += 1;
    } catch (err) {
      summary.failed += 1;
      console.warn(`Failed for "${row.title}" (TMDB ${row.tmdb_id}): ${err.message}`);
      if (err.rateLimited) break; // respect TMDB's limit; run again later
    }
  }
  return summary;
}

module.exports = { importMovie, refreshLinkedMovies, parseTmdbId };
