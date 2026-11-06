// Read the API base URL from the frontend environment configuration.
// Remove trailing slashes to avoid URLs such as /api//health.
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || '/api'
).replace(/\/+$/, '')

// Shared helper for endpoints that return JSON.
// This keeps request and error handling separate from page components.
async function getJson(path, { signal } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    signal,
    headers: {
      Accept: 'application/json',
    },
  })

  // Ruvindra's new endpoints return JSON rather than plain text.
  const data = await response.json()

  if (!response.ok) {
    // Use the backend's error message when available.
    // Otherwise, provide a message containing the HTTP status.
    throw new Error(
      data.error?.message ||
        `Backend request failed (${response.status}).`,
    )
  }

  return data
}

// Check that the Express API is responding.
// Expected response: { status: 'ok' }
export function getBackendHealth(options = {}) {
  return getJson('/health', options)
}

// Check that the backend can query PostgreSQL.
// This is separate because the API may be running even when
// the database connection is unavailable.
export function getDatabaseHealth(options = {}) {
  return getJson('/db-check', options)
}