const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || '/api'
).replace(/\/+$/, '')

export async function getBackendHello({ signal } = {}) {
  const response = await fetch(`${API_BASE_URL}/`, {
    signal,
    headers: {
      Accept: 'text/plain',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Backend request failed (${response.status}).`,
    )
  }

  return response.text()
}