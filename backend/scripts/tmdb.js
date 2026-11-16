// TMDB import task (contract section 11). Run from the backend folder:
//
//   npm run tmdb -- search "The Lion King"      list candidate TMDB IDs
//   npm run tmdb -- import 8587                 add or update by TMDB ID
//   npm run tmdb -- import 8587 --movie 7       link local movie 7 to TMDB 8587
//   npm run tmdb -- refresh                     re-import all linked movies
//
// Needs TMDB_READ_ACCESS_TOKEN (or TMDB_API_KEY) and DATABASE_URL in .env.
require('dotenv').config();
const pool = require('../src/config/db');
const tmdb = require('../src/services/tmdbService');
const { importMovie, refreshLinkedMovies } = require('../src/services/movieImportService');

async function main() {
  const [command, arg, flag, flagValue] = process.argv.slice(2);

  if (command === 'search' && arg) {
    const results = await tmdb.searchMovies(arg);
    if (results.length === 0) console.log('No TMDB results.');
    results.forEach((m) => console.log(`${String(m.tmdbId).padStart(8)}  ${m.title} (${m.releaseDate || 'no date'})`));
    return;
  }

  if (command === 'import' && arg) {
    let localMovieId;
    if (flag === '--movie') {
      localMovieId = Number(flagValue);
      if (!Number.isInteger(localMovieId) || localMovieId <= 0) throw new Error('--movie needs a local movie ID.');
    }
    const result = await importMovie(arg, { localMovieId });
    console.log(`${result.action}: movie ${result.movieId} "${result.title}" (TMDB ${result.tmdbId}),`,
      `runtime ${result.durationMinutes ?? 'unknown'} min, FI rating ${result.ageRating ?? 'none'}`);
    if (result.durationMinutes === null) {
      console.log('Warning: no valid runtime from TMDB; this movie cannot be scheduled until one is set.');
    }
    return;
  }

  if (command === 'refresh') {
    console.log(await refreshLinkedMovies());
    return;
  }

  console.log('Usage: npm run tmdb -- search "<title>" | import <tmdbId> [--movie <localId>] | refresh');
  process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('TMDB task failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
