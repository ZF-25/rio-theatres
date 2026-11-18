/*
 * FILE: frontend/src/hooks/useResource.js
 *
 * A reusable React hook for loading data from a service.
 * Manages the request's data, loading state, errors, and retries.
 *
 * Used by Home and Movie Details to fetch information.
 * Works with both demo data and the backend API.
 *
 * The hook receives a loading function instead of making
 * API requests directly, so it can be reused for different data.
 */

import {
  useEffect,
  useState,
} from "react";


/*
 * USERESOURCE HOOK
 *
 * Receives a loading function that performs the data request.
 * The function should be created with useCallback() to prevent
 * unnecessary requests on every render.
 *
 * When the loading function changes, the previous request
 * is cancelled and a new one starts.
 *
 * Example:
 * const loadMovie = useCallback(
 *   (signal) => catalogue.getMovie(movieId, { signal }),
 *   [movieId],
 * );
 *
 * const movieResult = useResource(loadMovie);
 */
export function useResource(load) {
  /*
   * RETRY STATE
   *
   * useState tracks how many times a request has been retried.
   * Increasing this number triggers useEffect to run again,
   * even if the loading function has not changed.
   */
  const [attempt, setAttempt] = useState(0);


  /*
   * REQUEST RESULT
   *
   * Stores the latest completed request's data or error.
   * Also remembers the loading function and retry attempt
   * so outdated results are not displayed.
   */
  const [result, setResult] = useState(null);


  /*
   * RUN DATA REQUEST
   *
   * useEffect starts a request when the component mounts,
   * the loading function changes, or the user retries.
   *
   * It also handles cancelling requests when they are
   * no longer needed.
   */
  useEffect(() => {
    /*
     * REQUEST CANCELLATION
     *
     * AbortController creates a signal that can cancel
     * an ongoing request, such as a fetch() call.
     */
    const controller = new AbortController();

    // Tracks whether this request is still active.
    // Prevents outdated requests from updating React state.
    let active = true;


    /*
     * EXECUTE LOADING FUNCTION
     *
     * Promise.resolve() starts a promise chain that supports
     * asynchronous functions and catches synchronous errors.
     *
     * The loading function receives the cancellation signal.
     */
    Promise.resolve()
      .then(() => {
        return load(controller.signal);
      })
      .then(
        /*
         * REQUEST SUCCESS
         *
         * Runs when the loading function completes successfully.
         * Saves the returned data and clears any error.
         *
         * The data is stored exactly as returned by the service,
         * whether it is an array, object, or paginated result.
         *
         * Inactive requests are ignored.
         */
        (data) => {
          if (!active) {
            return;
          }

          setResult({
            load,
            attempt,
            data,
            error: null,
          });
        },

        /*
         * REQUEST FAILURE
         *
         * Runs when the loading function fails.
         *
         * Ignores cancelled requests (AbortError) and requests
         * that are no longer active.
         *
         * Stores the original Error object when available,
         * otherwise creates a default error message.
         */
        (error) => {
          if (
            !active ||
            error?.name === "AbortError"
          ) {
            return;
          }

          setResult({
            load,
            attempt,
            data: null,
            error:
              error instanceof Error
                ? error
                : new Error(
                    "Unable to load this information.",
                  ),
          });
        },
      );


    /*
     * CLEANUP
     *
     * Runs when the component unmounts or before a new
     * request starts.
     *
     * Marks the old request as inactive and aborts it
     * to prevent unnecessary work or outdated updates.
     *
     * Also handles React StrictMode's extra effect checks
     * during development.
     */
    return () => {
      active = false;
      controller.abort();
    };
  }, [load, attempt]);


  /*
   * CHECK CURRENT RESULT
   *
   * Checks whether the stored result belongs to the
   * current loading function and retry attempt.
   *
   * If either has changed, the previous result is ignored
   * until the new request finishes.
   *
   * This prevents old movie or filter results from appearing
   * while new data is being loaded.
   */
  const currentResult =
    result?.load === load &&
    result?.attempt === attempt
      ? result
      : null;


  /*
   * RETURN REQUEST STATE
   *
   * Provides the component with:
   *
   * data: The successfully loaded information.
   * loading: True while waiting for the current request.
   * error: The request error, or null if there is none.
   * retry: Function that starts another request attempt.
   *
   * Loading depends on whether the request has finished,
   * not whether the returned data is empty.
   */
  return {
    data: currentResult?.data,
    loading: currentResult === null,
    error: currentResult?.error ?? null,

    // Increments the attempt counter to trigger a new request.
    retry() {
      setAttempt((previous) => previous + 1);
    },
  };
}