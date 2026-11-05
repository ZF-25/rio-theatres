import { useEffect, useState } from 'react'
import { getBackendHello } from '../services/api.js'

function Home() {
  const [result, setResult] = useState({
    status: 'loading',
    message: '',
  })

  useEffect(() => {
    const controller = new AbortController()

    async function checkBackend() {
      try {
        const message = await getBackendHello({
          signal: controller.signal,
        })

        if (!controller.signal.aborted) {
          setResult({
            status: 'success',
            message,
          })
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult({
            status: 'error',
            message:
              'Unable to connect to the backend. Check that it is running on port 5000.',
          })
        }
      }
    }

    checkBackend()

    return () => controller.abort()
  }, [])

  return (
    <section aria-labelledby="home-title">
      <h2 id="home-title">Hello World!</h2>

      <p>React frontend is running successfully.</p>
      <p>Welcome to the Rio Theaters project.</p>

      <section aria-labelledby="backend-status-title">
        <h3 id="backend-status-title">
          Backend connection
        </h3>

        {result.status === 'loading' && (
          <p role="status">Connecting to the backend…</p>
        )}

        {result.status === 'success' && (
          <p role="status">{result.message}</p>
        )}

        {result.status === 'error' && (
          <p role="alert">{result.message}</p>
        )}
      </section>
    </section>
  )
}

export default Home