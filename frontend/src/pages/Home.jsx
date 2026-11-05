// React hooks store the request result and run the backend request
// when the page is first displayed.
import { useEffect, useState } from 'react'

// Keep API request details in the service file rather than
// repeating fetch logic inside page components.
import { getBackendHello } from '../services/api.js'

// Reuse the shared card, loading, and error components.
import Card from '../components/ui/Card.jsx'
import Loading from '../components/ui/Loading.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'

function Home() {
  // Store the request status and its message together.
  // The possible statuses are loading, success, and error.
  const [result, setResult] = useState({
    status: 'loading',
    message: '',
  })

  // Increasing this number asks the effect to run again.
  // This gives the error message's retry button a simple way
  // to request another connection attempt.
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    // AbortController lets us cancel the request when the user
    // leaves the page or starts another attempt.
    const controller = new AbortController()

    async function checkBackend() {
      try {
        const message = await getBackendHello({
          signal: controller.signal,
        })

        // Ignore results from requests that have been cancelled.
        if (!controller.signal.aborted) {
          setResult({
            status: 'success',
            message,
          })
        }
      } catch {
        // Cancelling a request is not a connection error.
        // Only show an error if this attempt is still active.
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

    // Cleanup runs when the page unmounts or before the effect
    // starts again after requestVersion changes.
    return () => controller.abort()
  }, [requestVersion])

  function retryConnection() {
    // Show feedback immediately while the new request starts.
    setResult({
      status: 'loading',
      message: '',
    })

    setRequestVersion((previous) => previous + 1)
  }

  return (
    <section
      className="container page-section"
      aria-labelledby="home-title"
    >
      <h1 id="home-title">Welcome to Rio Theaters</h1>

      <p className="page-introduction">
        Hello World! The React frontend is running successfully.
      </p>

      <Card>
        <h2>Backend connection</h2>

        {/* Display the shared loading indicator while waiting
            for the Express server to respond. */}
        {result.status === 'loading' && (
          <Loading message="Connecting to the backend…" />
        )}

        {/* Announce the successful response when it arrives. */}
        {result.status === 'success' && (
          <p role="status">{result.message}</p>
        )}

        {/* ErrorMessage uses our shared Button internally.
            Clicking it starts another connection attempt. */}
        {result.status === 'error' && (
          <ErrorMessage
            message={result.message}
            onRetry={retryConnection}
          />
        )}
      </Card>
    </section>
  )
}

export default Home