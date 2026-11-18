/*
 * FILE: frontend/src/services/apiCatalogue.js
 *
 * Handles API requests for cinemas, rooms, genres, movies, and screenings.
 * Connects the frontend to our Express backend using the API client.
 *
 * Provides functions for retrieving catalogue information
 * and checking that paginated responses have the correct format.
 *
 * This file does not use React or display anything on the screen.
 * Movie information comes from our backend, not directly from TMDB.
 */

import { ApiError } from "./apiClient.js";


/*
 * EMPTY SNAPSHOT
 *
 * Provides a stable empty object for API mode.
 *
 * Demo mode uses a shared store to detect local data changes,
 * while API mode retrieves updated data through HTTP requests.
 *
 * Object.freeze() prevents changes to this object.
 * Reusing the same object avoids unnecessary React updates.
 */
const EMPTY_SNAPSHOT = Object.freeze({});


/*
 * VALIDATE PAGINATED RESPONSE
 *
 * Checks whether the backend returned a correctly structured list.
 *
 * Expected format:
 * {
 *   data: [...],
 *   meta: {
 *     page: 1,
 *     pageSize: 20,
 *     totalItems: 35,
 *     totalPages: 2
 *   }
 * }
 *
 * This prevents pages from receiving invalid pagination data.
 * It checks the response structure, not individual movie fields.
 */
function validateListResponse(response) {
  // Optional chaining safely accesses meta if the response is missing.
  const meta = response?.meta;

  /*
   * RESPONSE VALIDATION
   *
   * Checks that data is an array and pagination values
   * are valid whole numbers within the expected ranges.
   *
   * Also checks that totalPages matches the total number
   * of items and that the returned list does not exceed pageSize.
   */
  const valid =
    Array.isArray(response?.data) &&
    meta &&
    Number.isInteger(meta.page) &&
    meta.page >= 1 &&
    Number.isInteger(meta.pageSize) &&
    meta.pageSize >= 1 &&
    Number.isInteger(meta.totalItems) &&
    meta.totalItems >= 0 &&
    Number.isInteger(meta.totalPages) &&
    meta.totalPages >= 0 &&
    meta.totalPages ===
      Math.ceil(meta.totalItems / meta.pageSize) &&
    response.data.length <= meta.pageSize;

  // Throws a custom API error if the response format is invalid.
  if (!valid) {
    throw new ApiError(
      "The server returned an invalid paginated list.",
      {
        code: "INVALID_RESPONSE",
      },
    );
  }

  // Returns the original response if all checks pass.
  return response;
}


/*
 * CREATE API CATALOGUE
 *
 * Creates a service containing functions for requesting
 * cinema catalogue information from the backend.
 *
 * Receives a configured API client so all requests
 * use the same connection settings and error handling.
 */
export function createApiCatalogue(client) {
  /*
   * SHARED GET REQUEST
   *
   * Sends a GET request through the API client.
   *
   * path: The endpoint being requested.
   * query: Optional filtering or pagination parameters.
   * options: Additional settings, including cancellation.
   *
   * The signal allows outdated requests to be cancelled.
   */
  function get(path, query = {}, options = {}) {
    return client.request(path, {
      query,
      signal: options.signal,
    });
  }


  /*
   * PAGINATED GET REQUEST
   *
   * Sends a request and validates the returned list.
   * Returns the complete response containing data and metadata.
   */
  async function getList(path, query = {}, options = {}) {
    const response = await get(path, query, options);

    return validateListResponse(response);
  }


  /*
   * AVAILABLE CATALOGUE FUNCTIONS
   *
   * Returns an object containing all public catalogue
   * operations that other parts of the frontend can use.
   */
  return {
    /*
     * STORE SUBSCRIPTION
     *
     * Keeps the same interface as the demo catalogue service.
     *
     * API mode does not subscribe to a local store,
     * so subscribe() returns an empty cleanup function.
     *
     * getSnapshot() always returns the same empty object.
     * Server changes are retrieved through new API requests.
     */
    subscribe() {
      return () => {};
    },

    getSnapshot() {
      return EMPTY_SNAPSHOT;
    },


    /*
     * LIST CINEMAS
     *
     * GET /api/v1/cinemas
     *
     * Retrieves available cinemas from the backend.
     * Used by Home and Movie Details for cinema selection
     * and displaying location information.
     *
     * Supports page and pageSize query parameters.
     */
    listCinemas(query = {}, options = {}) {
      return getList("/cinemas", query, options);
    },


    /*
     * LIST GENRES
     *
     * GET /api/v1/genres
     *
     * Retrieves available movie genres for the Home filter.
     * Each genre contains an ID and name.
     *
     * Uses the genres stored in our local catalogue.
     */
    listGenres(query = {}, options = {}) {
      return getList("/genres", query, options);
    },


    /*
     * LIST CINEMA ROOMS
     *
     * GET /api/v1/cinemas/:cinemaId/rooms
     *
     * Retrieves rooms belonging to a specific cinema.
     * Used by Movie Details when selecting screening rooms.
     *
     * cinemaId is the database ID, not the city name.
     * encodeURIComponent() makes the ID safe to include in a URL.
     *
     * Each room contains an ID, cinema ID, name, and capacity.
     */
    listRooms(cinemaId, query = {}, options = {}) {
      const id = encodeURIComponent(cinemaId);

      return getList(
        `/cinemas/${id}/rooms`,
        query,
        options,
      );
    },


    /*
     * LIST MOVIES
     *
     * GET /api/v1/movies
     *
     * Retrieves movies available in the cinema catalogue.
     * Used by Home to display movie search results.
     *
     * Supports filtering by cinemaId, search text, and genreId.
     * Also supports page and pageSize for pagination.
     *
     * Filtering happens on the backend.
     * Only locally selected movies with matching future
     * screenings are returned, not the entire TMDB catalogue.
     */
    listMovies(query = {}, options = {}) {
      return getList("/movies", query, options);
    },


    /*
     * GET MOVIE DETAILS
     *
     * GET /api/v1/movies/:movieId
     *
     * Retrieves information about one specific movie.
     * Used by the Movie Details page.
     *
     * movieId is our local database ID, not the TMDB ID.
     * encodeURIComponent() safely adds the ID to the URL.
     *
     * If the movie does not exist, the backend returns 404,
     * which the API client converts into an ApiError.
     */
    getMovie(movieId, options = {}) {
      const id = encodeURIComponent(movieId);

      return get(`/movies/${id}`, {}, options);
    },


    /*
     * LIST SCREENINGS
     *
     * GET /api/v1/screenings
     *
     * Retrieves available movie screening times.
     * Used by Movie Details for selecting dates, rooms,
     * and screening sessions.
     *
     * Supports filtering by movieId, cinemaId, roomId, and date.
     * Also supports pagination using page and pageSize.
     *
     * Dates use YYYY-MM-DD in Helsinki local time.
     * Screening start and end times are returned as UTC timestamps
     * and must be converted for display.
     *
     * Available seat counts are informational.
     * The backend must check availability again during booking.
     */
    listScreenings(query = {}, options = {}) {
      return getList("/screenings", query, options);
    },
  };
}


/*
 * COLLECT ALL PAGES
 *
 * Retrieves every page of a small paginated list
 * and combines the results into one array.
 *
 * Used for cinema, genre, room, and screening options
 * where all available choices may be needed.
 *
 * This prevents options from being missed when the
 * backend returns results across multiple pages.
 *
 * loadPage: Function used to request each page.
 * options: Request settings, including cancellation.
 *
 * Large movie catalogues should use normal pagination instead.
 */
export async function collectPages(
  loadPage,
  options = {},
) {
  // Stores all items collected from the different pages.
  const items = [];

  // Requests up to 100 items at a time.
  const pageSize = 100;

  /*
   * PAGE LOOP
   *
   * Starts at page 1 and continues requesting pages
   * until all available results have been collected.
   *
   * page increases by 1 after each loop.
   */
  for (let page = 1; ; page += 1) {
    // Stops the operation if the request has been cancelled.
    options.signal?.throwIfAborted();

    /*
     * REQUEST AND VALIDATE PAGE
     *
     * Calls loadPage() with the current page and page size.
     * await waits for the request to finish.
     *
     * validateListResponse() checks the returned structure.
     */
    const response = validateListResponse(
      await loadPage(
        { page, pageSize },
        options,
      ),
    );

    /*
     * CHECK PAGE NUMBER
     *
     * Makes sure the backend returned the requested page.
     * Prevents collecting duplicate results or looping
     * incorrectly if the server ignores pagination.
     */
    if (response.meta.page !== page) {
      throw new ApiError(
        "The server returned an unexpected results page.",
        {
          code: "INVALID_RESPONSE",
        },
      );
    }

    // Adds the current page's items to the combined array.
    // The spread operator (...) adds each item individually.
    items.push(...response.data);

    /*
     * FINISH PAGINATION
     *
     * Stops when the current page reaches the last page.
     * Also handles empty lists where totalPages is 0.
     *
     * Returns all collected items as one array.
     */
    if (page >= response.meta.totalPages) {
      return items;
    }
  }
}