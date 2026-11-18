/*
 * FILE: frontend/src/services/apiAuth.js
 *
 * Handles login, registration, logout, and session checks
 * through the Express backend.
 *
 * Uses session cookies and CSRF protection.
 */

// Import the application's structured API error class.
import { ApiError } from "./apiClient.js";

// Roles accepted in authentication responses.
const API_ROLES = new Set([
  "customer",
  "owner",
  "cashier",
]);

// Check whether a value contains non-empty text.
function isNonEmptyString(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

// Remove surrounding whitespace from ordinary text, not passwords.
function trimText(value) {
  return typeof value === "string"
    ? value.trim()
    : value;
}

/*
 * Validate the authentication response from the backend.
 * Anonymous sessions are allowed only when allowAnonymous is true.
 */
function validateAuthResponse(
  response,
  { allowAnonymous = false } = {},
) {
  const data = response?.data;
  const user = data?.user;

  // Every authentication response must include a CSRF token.
  const validToken = isNonEmptyString(data?.csrfToken);

  // Check the required user properties and account role.
  const validUser =
    user !== null &&
    typeof user === "object" &&
    !Array.isArray(user) &&
    isNonEmptyString(user.id) &&
    isNonEmptyString(user.firstName) &&
    isNonEmptyString(user.lastName) &&
    isNonEmptyString(user.email) &&
    API_ROLES.has(user.role);

  // A session check may return user: null.
  const validAnonymous =
    allowAnonymous && user === null;

  // Reject responses that do not match the expected structure.
  if (
    !validToken ||
    (!validUser && !validAnonymous)
  ) {
    throw new ApiError(
      "The server returned an invalid session response.",
      {
        code: "INVALID_RESPONSE",
      },
    );
  }

  return response;
}

/*
 * Creates the API authentication service using the shared client.
 * Exposes getSession(), login(), register(), and logout().
 */
export function createApiAuth(client) {
  /*
   * GET /auth/session
   * Checks the current session and retrieves a CSRF token.
   */
  async function getSession({ signal } = {}) {
    const response = await client.request(
      "/auth/session",
      { signal },
    );

    // Visitors who are not signed in are allowed.
    return validateAuthResponse(response, {
      allowAnonymous: true,
    });
  }

  return {
    getSession,

    /*
     * POST /auth/login
     * Signs in an existing customer or staff account.
     */
    async login(
      { email, password },
      { signal } = {},
    ) {
      // Obtain a current CSRF token before the protected POST.
      await getSession({ signal });

      const response = await client.request(
        "/auth/login",
        {
          method: "POST",
          signal,

          body: {
            // Normalise email addresses before submission.
            email:
              typeof email === "string"
                ? email.trim().toLowerCase()
                : email,

            // Preserve the password exactly as entered.
            password,
          },
        },
      );

      // Successful login must return a valid user and CSRF token.
      return validateAuthResponse(response);
    },

    /*
     * POST /auth/register
     * Creates and signs in a new customer account.
     */
    async register(
      { firstName, lastName, email, password },
      { signal } = {},
    ) {
      // Obtain a CSRF token before registration.
      await getSession({ signal });

      const response = await client.request(
        "/auth/register",
        {
          method: "POST",
          signal,

          body: {
            // Clean names and email without modifying the password.
            firstName: trimText(firstName),
            lastName: trimText(lastName),

            email:
              typeof email === "string"
                ? email.trim().toLowerCase()
                : email,

            // Only the backend determines account permissions.
            password,
          },
        },
      );

      // Registration must return a valid authenticated session.
      return validateAuthResponse(response);
    },

    /*
     * POST /auth/logout
     * Ends the backend session and clears the local CSRF token.
     */
    async logout({ signal } = {}) {
      // Obtain a current CSRF token before logout.
      await getSession({ signal });

      await client.request(
        "/auth/logout",
        {
          method: "POST",
          body: {},
          signal,
        },
      );

      // Clear the token only after successful logout.
      client.clearCsrfToken();

      return null;
    },
  };
}