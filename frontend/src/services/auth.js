/*
 * FILE: frontend/src/services/auth.js
 *
 * Selects the authentication service used by Rio Theaters.
 *
 * Demo mode: Stores customer accounts in memory.
 * API mode: Uses the Express backend for authentication.
 *
 * VITE_AUTH_MODE controls authentication.
 * VITE_DATA_MODE controls movie catalogue data separately.
 */

// Creates the real backend authentication service.
import {
  createApiAuth,
} from "./apiAuth.js";

// Creates the in-memory demo authentication service.
import {
  createDemoAuth,
} from "./demoAuth.js";

/*
 * Reuses the configured API client from catalogue.js.
 * This keeps the API base URL and CSRF handling consistent.
 */
import {
  apiClient,
} from "./catalogue.js";

/*
 * Reads the authentication mode from Vite's environment variables.
 * Defaults to "demo" if VITE_AUTH_MODE is not provided.
 */
export const authMode =
  import.meta.env.VITE_AUTH_MODE || "demo";

// Prevents unsupported authentication modes.
if (!["demo", "api"].includes(authMode)) {
  throw new Error(
    'Invalid VITE_AUTH_MODE. Use either "demo" or "api".',
  );
}

/*
 * Creates one shared authentication service.
 *
 * API mode uses the backend through apiClient.
 * Demo mode uses an in-memory account store.
 *
 * Both services provide getSession(), register(),
 * login(), and logout().
 */
export const auth =
  authMode === "api"
    ? createApiAuth(apiClient)
    : createDemoAuth();