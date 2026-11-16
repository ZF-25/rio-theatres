// Talks to The Movie Database (TMDB). Only the sync job uses this file —
// the customer API never calls TMDB directly.

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const TIMEOUT_MS = 8000;

// Backend-only credential (contract: TMDB_READ_ACCESS_TOKEN).
// TMDB_API_KEY is still accepted so existing .env files keep working.
function getTmdbCredential() {
  return process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY;
}

async function tmdbGet(path, params = {}) {
  const key = getTmdbCredential();
  if (!key) {
    throw new Error('TMDB_READ_ACCESS_TOKEN is not set');
  }

  const url = new URL(TMDB_BASE_URL + path);
  url.searchParams.set('language', 'en-US');
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }

  // TMDB gives two kinds of keys: a short "API Key" (v3) and a long
  // "API Read Access Token". Support both.
  const headers = { accept: 'application/json' };
  if (key.length > 40) {
    headers.Authorization = `Bearer ${key}`;
  } else {
    url.searchParams.set('api_key', key);
  }

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.status === 429) {
    // Rate limited: stop this sync run and respect Retry-After.
    const err = new Error(`TMDB rate limit reached; retry after ${response.headers.get('retry-after') || '?'} s`);
    err.rateLimited = true;
    throw err;
  }
  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Lists TMDB candidates for a title, so a person can pick the right ID.
async function searchMovies(title) {
  const data = await tmdbGet('/search/movie', { query: title });
  return (data.results || []).slice(0, 8).map((m) => ({
    tmdbId: m.id,
    title: m.title,
    releaseDate: m.release_date || null,
  }));
}

// Finnish age rating only (contract section 11): another country's
// certification is never used as a Finnish rating.
function pickAgeRating(releaseDates) {
  const countries = (releaseDates && releaseDates.results) || [];
  const fi = countries.find((c) => c.iso_3166_1 === 'FI');
  const rated = fi && fi.release_dates.find((d) => d.certification);
  return rated ? rated.certification : null;
}

// First YouTube trailer, if there is one.
function pickTrailerUrl(videos) {
  const list = (videos && videos.results) || [];
  const trailer =
    list.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official) ||
    list.find((v) => v.site === 'YouTube' && v.type === 'Trailer');
  return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
}

// Gets the details we store in our movies table.
async function getMovieDetails(tmdbId) {
  const data = await tmdbGet(`/movie/${tmdbId}`, {
    append_to_response: 'videos,release_dates',
  });

  return {
    tmdbId: data.id,
    title: data.title,
    description: data.overview || null,
    // Only a positive whole-minute runtime is valid for scheduling.
    durationMinutes: Number.isInteger(data.runtime) && data.runtime > 0 ? data.runtime : null,
    posterUrl: data.poster_path ? IMAGE_BASE_URL + data.poster_path : null,
    trailerUrl: pickTrailerUrl(data.videos),
    ageRating: pickAgeRating(data.release_dates),
  };
}

module.exports = { searchMovies, getMovieDetails, pickAgeRating, pickTrailerUrl, getTmdbCredential };
