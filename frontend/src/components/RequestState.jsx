/*
 * FILE: frontend/src/components/RequestState.jsx
 *
 * PURPOSE
 * -------
 * Displays shared feedback for asynchronous data requests:
 *
 * - Loading message while a request is running.
 * - Error message when a request fails.
 * - Optional button to retry the request.
 *
 * PAGE CONNECTIONS
 * ----------------
 * Home:
 * - Loading cinema/genre options.
 * - Loading movie search results.
 *
 * Movie Details:
 * - Loading movie information.
 * - Loading rooms and screening times.
 *
 * This component does not fetch data itself.
 * It receives request state from useResource().
 *
 * Successful results and empty lists are displayed by the page,
 * not by this component.
 */


/*
 * PROPS
 *
 * loading:
 * Whether the current request is unfinished.
 *
 * error:
 * An Error or ApiError from the request, or null.
 *
 * onRetry:
 * Optional function called when the retry button is pressed.
 *
 * loadingMessage:
 * Optional page-specific loading text.
 *
 * Example:
 *
 * <RequestState
 *   loading={moviesResult.loading}
 *   error={moviesResult.error}
 *   onRetry={moviesResult.retry}
 *   loadingMessage="Loading movies…"
 * />
 */
function RequestState({
  loading = false,
  error = null,
  onRetry,
  loadingMessage = "Loading…",
}) {
  /*
   * LOADING
   *
   * role="status" lets assistive technology announce the update
   * without moving the user's keyboard focus.
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
   * SUCCESS / NOTHING TO DISPLAY
   *
   * The parent page handles successful data and empty results.
   */
  if (!error) {
    return null;
  }


  /*
   * ERROR
   *
   * Prefer the readable message supplied by the API client.
   * Provide a fallback if the error has no usable message.
   *
   * React renders this as text. Do not use dangerouslySetInnerHTML
   * to display backend error messages.
   */
  const message =
    typeof error.message === "string" &&
    error.message.trim()
      ? error.message
      : "Unable to load this information. Please try again.";

  const canRetry =
    typeof onRetry === "function";

  return (
    <div className="request-error">
      <p role="alert">
        {message}
      </p>

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

export default RequestState;