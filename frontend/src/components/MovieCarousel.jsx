/*
 * FILE: frontend/src/components/RequestState.jsx
 *
 * Displays loading and error messages when fetching data.
 * Also provides an optional retry button if a request fails.
 *
 * Used by pages like Home and Movie Details.
 * The component receives request information from its parent
 * and does not make API requests itself.
 */

/*
 * PROPS
 *
 * loading: Indicates whether a request is still running.
 * error: Contains the request error, or null if there is none.
 * onRetry: Optional function to retry a failed request.
 * loadingMessage: Custom text displayed while loading.
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
   * Displays the loading message while the request is running.
   * role="status" allows screen readers to announce the message
   * without interrupting the user's current focus.
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
   * If there is no error and the request is not loading,
   * nothing is displayed by this component.
   * The parent page handles successful or empty results.
   */
  if (!error) {
    return null;
  }


  /*
   * ERROR MESSAGE
   *
   * Checks whether the error contains a valid text message.
   * If not, a default error message is displayed instead.
   * The message is rendered as normal text for safety.
   */
  const message =
    typeof error.message === "string" &&
    error.message.trim()
      ? error.message
      : "Unable to load this information. Please try again.";

  // Checks whether a retry function was provided by the parent.
  // The retry button is only displayed when this function exists.
  const canRetry =
    typeof onRetry === "function";


  /*
   * ERROR DISPLAY
   *
   * Shows the error message and an optional retry button.
   * role="alert" allows screen readers to announce the error.
   */
  return (
    <div className="request-error">
      <p role="alert">
        {message}
      </p>

      {/* Only show the retry button if a retry function is available. */}
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

// Allows other components and pages to import RequestState.
export default RequestState;