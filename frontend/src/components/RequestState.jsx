/*
 * FILE: frontend/src/components/RequestState.jsx
 *
 * Displays loading and error messages during API requests.
 * Also shows a retry button if the request fails.
 *
 * Used by Home and Movie Details to handle request states.
 * Receives request information from the parent through useResource().
 * This component does not fetch data or display successful results.
 */

/*
 * PROPS
 *
 * loading: True while the request is running.
 * error: Contains the request error, or null if there is none.
 * onRetry: Optional function to retry a failed request.
 * loadingMessage: Custom loading text, defaults to "Loading…".
 */
function RequestState({
  loading = false,
  error = null,
  onRetry,
  loadingMessage = "Loading…",
}) {
  /*
   * LOADING STATE
   *
   * Displays a loading message while the request is running.
   * role="status" lets screen readers announce the message
   * without changing the user's keyboard focus.
   */
  if (loading) {
    return (
      <p
        className="request-loading"
        role="status"
      >
        {loadingMessage}
      </p>
    );
  }


  /*
   * SUCCESS STATE
   *
   * Returns nothing if there is no error and loading is finished.
   * The parent page handles successful data or empty results.
   */
  if (!error) {
    return null;
  }


  /*
   * ERROR HANDLING
   *
   * Checks if the error contains a valid, non-empty message.
   * Otherwise, displays a default error message.
   * React renders the message as text rather than HTML for safety.
   */
  const message =
    typeof error.message === "string" &&
    error.message.trim()
      ? error.message
      : "Unable to load this information. Please try again.";

  // Checks if the parent provided a retry function.
  // The retry button only appears when this function exists.
  const canRetry =
    typeof onRetry === "function";

  /*
   * ERROR DISPLAY
   *
   * Shows the error message and an optional retry button.
   * role="alert" lets screen readers announce the error.
   */
  return (
    <div className="request-error">
      <p role="alert">
        {message}
      </p>

      {/* Displays the retry button only when retry is available. */}
      {canRetry && (
        <button
          type="button"
          className="secondary-button"
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </div>
  );
}

// Exports the component so other pages can use it.
export default RequestState;