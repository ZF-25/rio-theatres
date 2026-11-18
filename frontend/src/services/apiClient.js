/*
 * FILE: frontend/src/services/apiClient.js
 *
 * Handles HTTP communication between the frontend and Express backend.
 * Builds request URLs, sends JSON data, and processes server responses.
 *
 * Also manages session cookies, CSRF tokens, request cancellation,
 * and errors returned by the backend.
 *
 * Used by catalogue, authentication, and future booking services.
 * Backend secrets and API credentials must never be stored here.
 */


/*
 * API ERROR CLASS
 *
 * Creates a custom error containing information about failed requests.
 *
 * status: HTTP status code (0 if the server could not be reached).
 * code: Error identifier returned by the backend.
 * message: Readable explanation of the error.
 * fieldErrors: Validation errors for individual form fields.
 * details: Additional error information.
 *
 * This allows pages to display useful error messages.
 */
export class ApiError extends Error {
  constructor(
    message,
    {
      status = 0,
      code = "NETWORK_ERROR",
      fieldErrors = {},
      details = {},
    } = {},
  ) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.details = details;
  }
}


/*
 * CREATE API CLIENT
 *
 * Creates a reusable client for communicating with the backend.
 *
 * baseUrl: Base address of the Express API, defaulting to /api/v1.
 * fetchImpl: Function used to send requests, normally browser fetch().
 *
 * Tests can provide a replacement fetch function.
 * Other services reuse this client instead of creating their own.
 */
export function createApiClient({
  baseUrl = "/api/v1",
  fetchImpl = globalThis.fetch,
} = {}) {
  // Removes trailing slashes to prevent duplicate slashes in request URLs.
  const base = baseUrl.replace(/\/+$/, "");


  /*
   * CSRF TOKEN
   *
   * Stores the current CSRF token in memory.
   * The token is received from session, login, or registration responses.
   *
   * It is included in requests that modify server data
   * to help protect against cross-site request forgery.
   *
   * Authentication cookies are managed separately by the browser.
   */
  let csrfToken = null;


  /*
   * SEND API REQUEST
   *
   * Sends an HTTP request using the provided path and options.
   *
   * method: HTTP method such as GET, POST, PATCH, or DELETE.
   * query: Optional URL query parameters.
   * body: Data to send as JSON.
   * signal: Allows the request to be cancelled.
   * idempotencyKey: Prevents duplicate operations when supported.
   *
   * Returns the server's success response containing data
   * and optional metadata, or null for HTTP 204.
   */
  async function request(
    path,
    {
      method = "GET",
      query = {},
      body,
      signal,
      idempotencyKey,
    } = {},
  ) {
    // Converts the HTTP method to uppercase for consistent comparisons.
    const httpMethod = method.toUpperCase();


    /*
     * BUILD QUERY PARAMETERS
     *
     * URLSearchParams converts query values into a URL-safe format.
     *
     * Missing or empty values are skipped, while values such as
     * 0 and false are kept.
     *
     * Example: { page: 2, search: "Star Wars" }
     * becomes "page=2&search=Star+Wars".
     */
    const params = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        params.set(key, String(value));
      }
    });

    // Adds query parameters to the URL only when they exist.
    const queryString = params.toString();

    const url = `${base}${path}${
      queryString ? `?${queryString}` : ""
    }`;


    /*
     * REQUEST HEADERS
     *
     * Accept tells the backend that JSON responses are expected.
     *
     * Content-Type is added when a request body exists,
     * informing the backend that the body contains JSON.
     */
    const headers = {
      Accept: "application/json",
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }


    /*
     * CSRF PROTECTION
     *
     * Checks whether the HTTP method changes server data.
     * GET, HEAD, and OPTIONS are treated as non-mutation requests.
     *
     * If the request modifies data and a CSRF token exists,
     * the token is included in the request headers.
     *
     * The backend is responsible for validating the token.
     */
    const isMutation = ![
      "GET",
      "HEAD",
      "OPTIONS",
    ].includes(httpMethod);

    if (isMutation && csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }


    /*
     * IDEMPOTENCY KEY
     *
     * Adds an optional key to help prevent duplicate operations,
     * such as creating the same booking more than once.
     *
     * The booking service provides the key, and the backend
     * must enforce it. This client does not retry mutations automatically.
     */
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }


    /*
     * SEND REQUEST TO EXPRESS
     *
     * fetchImpl sends the request using the configured URL and options.
     *
     * credentials: "include" allows session cookies to be sent
     * and response cookies to be accepted.
     *
     * cache: "no-store" prevents browser HTTP-cache reuse/storage.
     *
     * signal allows an ongoing request to be cancelled.
     *
     * JSON.stringify() converts the request body into JSON text.
     */
    let response;

    try {
      response = await fetchImpl(url, {
        method: httpMethod,
        headers,
        credentials: "include",
        cache: "no-store",
        signal,

        ...(body !== undefined
          ? { body: JSON.stringify(body) }
          : {}),
      });
    } catch (error) {
      /*
       * REQUEST CANCELLATION
       *
       * AbortError means the request was intentionally cancelled,
       * such as when the user changes pages or filters.
       *
       * The original error is passed on so React hooks can ignore it.
       */
      if (error.name === "AbortError") {
        throw error;
      }

      /*
       * CONNECTION ERROR
       *
       * If the request fails before receiving an HTTP response,
       * a custom ApiError is created with a readable message.
       *
       * The default status is 0 because no response was received.
       */
      throw new ApiError(
        "Unable to reach the server. Please try again.",
      );
    }


    /*
     * EMPTY RESPONSE
     *
     * HTTP 204 means the request succeeded without response content.
     * Common examples include logout and some deletion operations.
     *
     * Returns null instead of trying to read an empty JSON body.
     */
    if (response.status === 204) {
      return null;
    }


    /*
     * PARSE JSON RESPONSE
     *
     * Converts the server response into a JavaScript object.
     *
     * If the response contains invalid JSON, a custom error
     * is created instead of allowing the application to crash.
     *
     * Cancellation errors are passed through unchanged.
     */
    let payload;

    try {
      payload = await response.json();
    } catch (error) {
      if (error.name === "AbortError") {
        throw error;
      }

      throw new ApiError(
        "The server returned an unexpected response.",
        {
          status: response.status,
          code: "INVALID_RESPONSE",
        },
      );
    }


    /*
     * HANDLE HTTP ERRORS
     *
     * fetch() does not automatically throw errors for HTTP
     * responses such as 401, 404, 409, or 422.
     *
     * response.ok checks whether the request was successful.
     *
     * If it failed, the backend's error message, code,
     * field errors, and details are stored in an ApiError.
     *
     * Default values are used when information is missing.
     */
    if (!response.ok) {
      throw new ApiError(
        payload?.error?.message ||
          "The request could not be completed.",
        {
          status: response.status,
          code:
            payload?.error?.code ||
            "REQUEST_FAILED",
          fieldErrors:
            payload?.error?.fieldErrors,
          details:
            payload?.error?.details,
        },
      );
    }


    /*
     * VALIDATE SUCCESS RESPONSE
     *
     * Checks that the response is an object containing
     * the required "data" property.
     *
     * The data value can still be null or an empty array.
     *
     * Invalid responses produce a controlled ApiError.
     * More detailed validation is handled by individual services.
     */
    if (
      !payload ||
      typeof payload !== "object" ||
      !Object.hasOwn(payload, "data")
    ) {
      throw new ApiError(
        "The server response does not match the API contract.",
        {
          status: response.status,
          code: "INVALID_RESPONSE",
        },
      );
    }


    /*
     * UPDATE CSRF TOKEN
     *
     * Checks whether the successful response contains a CSRF token.
     *
     * If one exists, it replaces the previously stored token.
     * Future requests that modify data will use the updated token.
     */
    if (
      typeof payload.data?.csrfToken === "string"
    ) {
      csrfToken = payload.data.csrfToken;
    }

    // Returns the complete successful response to the calling service.
    return payload;
  }


  /*
   * PUBLIC CLIENT METHODS
   *
   * request: Allows other services to send HTTP requests.
   *
   * clearCsrfToken: Removes the stored CSRF token,
   * normally after a successful logout.
   *
   * Clearing the token does not end the backend session;
   * the server must handle session invalidation.
   */
  return {
    request,

    clearCsrfToken() {
      csrfToken = null;
    },
  };
}