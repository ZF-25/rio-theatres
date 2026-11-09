// Talks to The Movie Database (TMDB). Only the sync job uses this file —
// the customer API never calls TMDB directly.

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const TIMEOUT_MS = 8000;

async function tmdbGet(path, params = {}) {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    throw new Error('TMDB_API_KEY is not set');
  }

  const url = new URL(TMDB_BASE_URL + path);
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
  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Finds the best TMDB match for a title. Returns the TMDB id or null.
async function searchMovieId(title) {
  const data = await tmdbGet('/search/movie', { query: title });
  return data.results && data.results.length > 0 ? data.results[0].id : null;
}

// Finnish age rating if available, otherwise the US one.
function pickAgeRating(releaseDates) {
  const countries = (releaseDates && releaseDates.results) || [];
  for (const country of ['FI', 'US']) {
    const entry = countries.find((c) => c.iso_3166_1 === country);
    const rated = entry && entry.release_dates.find((d) => d.certification);
    if (rated) return rated.certification;
  }
  return null;
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
    description: data.overview || null,
    durationMinutes: data.runtime || null,
    posterUrl: data.poster_path ? IMAGE_BASE_URL + data.poster_path : null,
    trailerUrl: pickTrailerUrl(data.videos),
    ageRating: pickAgeRating(data.release_dates),
  };
}

module.exports = { searchMovieId, getMovieDetails, pickAgeRating, pickTrailerUrl };
