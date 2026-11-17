/*
 * FILE: frontend/src/services/catalogue.js
 *
 * Selects which catalogue service the frontend uses.
 *
 * Demo mode uses local movie data and the shared cinema store.
 * API mode retrieves catalogue data from the Express backend.
 *
 * Both services provide the same functions and response formats,
 * so Home and Movie Details can work without knowing the data source.
 *
 * This setting only controls catalogue data.
 * Authentication, booking, checkout, and owner/cashier features
 * are not automatically connected to the backend.
 */


/*
 * SERVICE IMPORTS
 *
 * createApiClient: Creates the shared HTTP client for backend requests.
 * createApiCatalogue: Provides catalogue requests using that client.
 * createDemoCatalogue: Provides the same functions using demo data.
 */
import {
  createApiClient,
} from "./apiClient.js";

import {
  createApiCatalogue,
} from "./apiCatalogue.js";

import {
  createDemoCatalogue,
} from "./demoCatalogue.js";


/*
 * SHARED DEMO STORE
 *
 * Contains cinema information shared with other demo features.
 * Reusing the same store keeps changes consistent across components.
 */
import {
  demoCinemaStore,
} from "./demoCinemaStore.js";


/*
 * DEMO DATA
 *
 * Imports the existing movies, rooms, and cinema contact details.
 * These records are passed to the demo catalogue service.
 *
 * API mode gets its catalogue information from Express instead.
 */
import { movies } from "../data/movies.js";
import { rooms } from "../data/cinema.js";

import {
  cinemaContacts,
} from "../data/cinemaContacts.js";


/*
 * SELECT DATA MODE
 *
 * Vite makes frontend environment variables available
 * through import.meta.env.
 *
 * VITE_DATA_MODE determines which catalogue service to use:
 * - "demo": Local demo data.
 * - "api": Express backend.
 *
 * If the variable is missing, demo mode is used by default.
 */
export const dataMode =
  import.meta.env.VITE_DATA_MODE || "demo";


/*
 * VALIDATE DATA MODE
 *
 * Checks that the selected mode is either "demo" or "api".
 *
 * If an invalid value is provided, an error is thrown
 * instead of silently choosing the wrong service.
 */
if (!["demo", "api"].includes(dataMode)) {
  throw new Error(
    'Invalid VITE_DATA_MODE. Use either "demo" or "api".',
  );
}


/*
 * CONFIGURE API ADDRESS
 *
 * VITE_API_BASE_URL specifies the Express backend address.
 *
 * The default "/api/v1" works when requests are forwarded
 * to the backend through a proxy or the same server.
 *
 * A full backend URL can be configured when the frontend
 * and backend run on separate development servers.
 *
 * Example: http://localhost:5000/api/v1
 */
const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || "/api/v1";


/*
 * CREATE SHARED API CLIENT
 *
 * Creates one HTTP client using the configured backend address.
 *
 * Other services can reuse this client, including its stored
 * CSRF token, instead of creating separate client instances.
 *
 * Creating the client does not send an HTTP request.
 * Requests only happen when a service function is called.
 *
 * SECURITY:
 * VITE_* variables are visible in the browser.
 * Never store database passwords, TMDB tokens, or secrets in them.
 */
export const apiClient = createApiClient({
  baseUrl: apiBaseUrl,
});


/*
 * SELECT AND EXPORT CATALOGUE SERVICE
 *
 * Uses a ternary operator to choose the service:
 *
 * If dataMode is "api":
 * - createApiCatalogue() receives the shared HTTP client.
 * - Catalogue requests are sent to Express.
 *
 * Otherwise (demo mode):
 * - createDemoCatalogue() receives local movies, cinemas,
 *   rooms, and the shared cinema store.
 *
 * Both services provide the same functions:
 * listCinemas(), listGenres(), listRooms(), listMovies(),
 * getMovie(), listScreenings(), subscribe(), and getSnapshot().
 *
 * Other components import "catalogue" and use these functions
 * without needing separate code for demo and API modes.
 */
export const catalogue =
  dataMode === "api"
    ? createApiCatalogue(apiClient)
    : createDemoCatalogue({
        movies,
        cinemas: cinemaContacts,
        rooms,
        store: demoCinemaStore,
      });