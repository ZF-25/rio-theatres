// State stores the connection result.
// The effect requests the health endpoint when the page opens.
import { useEffect, useState } from "react";

import { getBackendHealth } from "../services/api.js";

import Card from "../components/ui/Card.jsx";
import Loading from "../components/ui/Loading.jsx";
import ErrorMessage from "../components/ui/ErrorMessage.jsx";

function Home() {
  const [result, setResult] = useState({
    status: "loading",
    message: "",
  });

  // Increasing this value triggers another request.
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    // Cancel the request when leaving the page or starting
    // another attempt.
    const controller = new AbortController();

    async function checkBackend() {
      try {
        const data = await getBackendHealth({
          signal: controller.signal,
        });

        // An HTTP response alone is not enough.
        // Confirm that it contains the expected health status.
        if (data.status !== "ok") {
          throw new Error("Unexpected backend health response.");
        }

        if (!controller.signal.aborted) {
          setResult({
            status: "success",
            message: "The Rio Theaters backend is connected.",
          });
        }
      } catch {
        // Ignore cancelled requests instead of displaying an error.
        if (!controller.signal.aborted) {
          setResult({
            status: "error",
            message:
              "Unable to verify the backend connection. Check that the backend is running on port 5000.",
          });
        }
      }
    }

    checkBackend();

    return () => controller.abort();
  }, [requestVersion]);

  function retryConnection() {
    setResult({
      status: "loading",
      message: "",
    });

    setRequestVersion((previous) => previous + 1);
  }

  return (
    <section className="container page-section" aria-labelledby="home-title">
      <h1 id="home-title">Welcome to Rio Theaters</h1>

      <p className="page-introduction">
        The React frontend is running successfully.
      </p>

      <Card>
        <h2>Backend connection</h2>

        {result.status === "loading" && (
          <Loading message="Checking the backend connection…" />
        )}

        {result.status === "success" && <p role="status">{result.message}</p>}

        {result.status === "error" && (
          <ErrorMessage message={result.message} onRetry={retryConnection} />
        )}
      </Card>
    </section>
  );
}

export default Home;
