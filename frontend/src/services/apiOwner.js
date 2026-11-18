/*
 * FILE: frontend/src/services/apiOwner.js
 *
 * PURPOSE:
 * This file handles API requests for the cinema owner's features.
 *
 * It connects the frontend to the backend for:
 * - Viewing the owner dashboard.
 * - Managing movies and screenings.
 * - Searching and viewing bookings.
 * - Creating and managing cashier accounts.
 * - Assigning theaters to cashiers.
 *
 * HOW IT WORKS:
 * 1. A frontend component calls a function from this service.
 * 2. The function prepares the API request.
 * 3. The request is sent to the backend.
 * 4. The backend processes the request and returns a response.
 * 5. The frontend uses the response to update the interface.
 *
 * IMPORTANT:
 * Only owners should be allowed to use these features.
 * The backend must verify owner permissions independently.
 *
 * IDs are converted to strings for use in the frontend.
 * Theater assignment requests require a numeric theaterId.
 *
 * Some owner API endpoints are still awaiting backend confirmation.
 */

// Import the custom error class used for API and validation errors.
import { ApiError } from "./apiClient.js";

/*
 * Creates the owner API service.
 *
 * client:
 * The API client responsible for sending HTTP requests.
 *
 * The returned service contains functions that other files
 * can use to communicate with the backend.
 */
export function createApiOwner(client) {

  /*
   * GET REQUEST HELPER
   *
   * Used to retrieve information from the backend.
   *
   * path: The API endpoint being requested.
   * query: Optional filters or search parameters.
   * signal: Allows an ongoing request to be cancelled.
   *
   * Example:
   * GET /owner/cashiers?page=1
   */
  function get(
    path,
    query = {},
    { signal } = {},
  ) {

    // Send a GET request using the shared API client.
    return client.request(path, {
      query,
      signal,
    });
  }

  /*
   * MUTATION REQUEST HELPER
   *
   * Used when data needs to be created, updated, or deleted.
   *
   * method: HTTP method such as POST, PATCH, PUT, or DELETE.
   * body: Information sent to the backend.
   * signal: Allows the request to be cancelled.
   *
   * Before changing data, the current session is requested.
   * This helps prepare session and CSRF protection.
   *
   * The backend must still verify the user's permissions.
   */
  async function mutate(
    path,
    { method, body, signal },
  ) {

    // Request the current session before modifying data.
    await client.request(
      "/auth/session",
      { signal },
    );

    // Send the actual create, update, or delete request.
    return client.request(path, {
      method,
      body,
      signal,
    });
  }

  /*
   * TEXT CLEANING HELPER
   *
   * Removes unnecessary spaces from the beginning
   * and end of a string.
   *
   * Example:
   * "  John  " becomes "John".
   *
   * Non-string values are returned unchanged.
   */
  function trimText(value) {

    // Only trim the value if it is a string.
    return typeof value === "string"
      ? value.trim()
      : value;
  }

  /*
   * THEATER ID VALIDATION
   *
   * Converts a theater ID into a positive number.
   *
   * The frontend normally stores IDs as strings.
   * The backend requires a numeric theaterId.
   *
   * Example:
   * "5" becomes 5.
   *
   * Invalid IDs cause a validation error.
   */
  function numericTheaterId(value) {

    // Accept numbers or strings containing positive integer digits.
    const validType =
      typeof value === "number" ||
      (typeof value === "string" && /^[1-9]\d*$/.test(value));

    // Convert valid input to a number; otherwise use NaN.
    const id = validType ? Number(value) : NaN;

    // Reject invalid, unsafe, zero, or negative IDs.
    if (!Number.isSafeInteger(id) || id <= 0) {

      // Return a validation error explaining the problem.
      throw new ApiError("Choose one valid theater.", {
        status: 422,
        code: "VALIDATION_ERROR",
        fieldErrors: {
          theaterId: "Select a theater from the available options.",
        },
      });
    }

    // Return the validated numeric theater ID.
    return id;
  }

  /*
   * INVALID RESPONSE HELPER
   *
   * Creates an error when the backend sends data
   * that does not match the expected structure.
   *
   * This prevents the frontend from using incorrect data.
   */
  function invalidResponse(message) {

    // Stop execution and report an invalid API response.
    throw new ApiError(message, {
      code: "INVALID_RESPONSE",
    });
  }

  /*
   * NORMALIZE THEATER DATA
   *
   * Checks theater information received from the backend.
   *
   * Ensures:
   * - The response contains an array.
   * - Each theater has a valid ID.
   * - Each theater has a name.
   * - Each theater has a city.
   *
   * single = true:
   * Allows at most one theater in the response.
   *
   * Theater IDs are converted to strings for frontend use.
   */
  function normalizeTheaters(response, { single = false } = {}) {

    // Check that theater data is an array.
    // When single is true, reject multiple theaters.
    if (
      !Array.isArray(response?.data) ||
      (single && response.data.length > 1)
    ) {
      invalidResponse("The server returned an invalid theater list.");
    }

    // Check and normalize every theater in the response.
    const data = response.data.map((theater) => {

      // Accept a non-empty string ID or a positive integer ID.
      const validId =
        (typeof theater?.id === "string" &&
          theater.id.trim() !== "") ||
        (typeof theater?.id === "number" &&
          Number.isSafeInteger(theater.id) &&
          theater.id > 0);

      // Reject theaters with missing or invalid required information.
      if (
        !validId ||
        typeof theater.name !== "string" ||
        theater.name.trim() === "" ||
        typeof theater.city !== "string" ||
        theater.city.trim() === ""
      ) {
        invalidResponse("The server returned an invalid theater record.");
      }

      // Keep all theater details but convert its ID to a string.
      return {
        ...theater,
        id: String(theater.id),
      };
    });

    // Return the response containing the normalized theater records.
    return {
      ...response,
      data,
    };
  }

  /*
   * LOCAL PAGINATION HELPER
   *
   * Divides an existing array of records into pages.
   *
   * This is useful when an API returns all records
   * but the frontend expects paginated results.
   *
   * page: Current page number.
   * pageSize: Maximum number of records per page.
   *
   * Example:
   * 50 records with pageSize 20 produces 3 pages.
   */
  function paginateLocal(
    records,
    { page = 1, pageSize = 20 } = {},
  ) {

    // Check that pagination values are valid integers.
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {

      // Reject invalid page numbers or page sizes.
      throw new ApiError("Enter valid pagination values.", {
        status: 422,
        code: "VALIDATION_ERROR",
      });
    }

    // Calculate where the current page starts in the array.
    const start = (page - 1) * pageSize;

    // Return only the records belonging to the requested page.
    return {
      data: records.slice(start, start + pageSize),

      // Metadata helps the frontend display pagination controls.
      meta: {
        page,
        pageSize,
        totalItems: records.length,
        totalPages: Math.ceil(records.length / pageSize),
      },
    };
  }

  /*
   * SCREENING REQUEST BODY
   *
   * Prepares screening information before sending it
   * to the backend.
   *
   * Only editable fields are included.
   *
   * The backend determines the theater using roomId
   * and calculates the ending time from the movie runtime.
   */
  function screeningBody(draft) {

    // Return the screening details accepted by the backend.
    return {
      movieId: draft.movieId,             // Movie being shown.
      roomId: draft.roomId,               // Room where it will be shown.
      startsAt: draft.startsAt,           // Screening start date and time.
      spokenLanguage: draft.spokenLanguage ?? null, // Spoken language.
      subtitles: draft.subtitles ?? [],   // Available subtitle languages.
    };
  }

  /*
   * OWNER API SERVICE
   *
   * This object contains the functions used by owner features.
   *
   * Each function represents a specific backend operation.
   *
   * Components call these functions instead of writing
   * HTTP requests directly.
   */
  const service = {

    /*
     * OWNER DASHBOARD OVERVIEW
     *
     * HTTP METHOD: GET
     * ENDPOINT: /owner/overview
     *
     * Retrieves information for the owner's dashboard.
     *
     * date:
     * Optional date in YYYY-MM-DD format.
     * The date follows the Helsinki calendar.
     */
    getOverview(
      { date } = {},
      options = {},
    ) {

      // Request dashboard information for the selected date.
      return get(
        "/owner/overview",
        { date },
        options,
      );
    },

    /*
     * LIST MOVIES
     *
     * HTTP METHOD: GET
     * ENDPOINT: /owner/movies
     *
     * Retrieves movies available for screening management.
     *
     * Includes imported movies even if they have
     * no upcoming screenings.
     *
     * search: Optional movie search text.
     * page: Current page number.
     * pageSize: Number of movies per page.
     */
    listMovies(
      {
        search,
        page = 1,
        pageSize = 20,
      } = {},
      options = {},
    ) {

      // Send movie filters and pagination details to the backend.
      return get(
        "/owner/movies",
        {
          search,
          page,
          pageSize,
        },
        options,
      );
    },

    /*
     * LIST SCREENINGS
     *
     * HTTP METHOD: GET
     * ENDPOINT: /owner/screenings
     *
     * Retrieves screenings for owner management.
     *
     * Includes past and cancelled screenings.
     *
     * FILTERS:
     * cinemaId: Filter by cinema.
     * roomId: Filter by screening room.
     * movieId: Filter by movie.
     * date: Filter by screening date.
     * status: Filter by screening status.
     * search: Search screenings.
     *
     * Pagination controls how many results are returned.
     */
    listScreenings(
      {
        cinemaId,
        roomId,
        movieId,
        date,
        status,
        search,
        page = 1,
        pageSize = 20,
      } = {},
      options = {},
    ) {

      // Request screenings matching the selected filters.
      return get(
        "/owner/screenings",
        {
          cinemaId,
          roomId,
          movieId,
          date,
          status,
          search,
          page,
          pageSize,
        },
        options,
      );
    },

    /*
     * CREATE SCREENING
     *
     * HTTP METHOD: POST
     * ENDPOINT: /owner/screenings
     *
     * Creates a new movie screening.
     *
     * draft:
     * Contains the screening details entered by the owner.
     *
     * screeningBody() prepares the information
     * before it is sent to the backend.
     */
    createScreening(
      draft,
      { signal } = {},
    ) {

      // Send the new screening information to the backend.
      return mutate(
        "/owner/screenings",
        {
          method: "POST",
          body: screeningBody(draft),
          signal,
        },
      );
    },

    /*
     * UPDATE SCREENING
     *
     * HTTP METHOD: PATCH
     * ENDPOINT: /owner/screenings/:id
     *
     * Updates an existing screening.
     *
     * screeningId:
     * Identifies which screening should be updated.
     *
     * draft:
     * Contains the updated screening information.
     *
     * encodeURIComponent() safely prepares the ID
     * for use inside the request URL.
     */
    updateScreening(
      screeningId,
      draft,
      { signal } = {},
    ) {

      // Send the updated screening details to the backend.
      return mutate(
        `/owner/screenings/${encodeURIComponent(screeningId)}`,
        {
          method: "PATCH",
          body: screeningBody(draft),
          signal,
        },
      );
    },

    /*
     * CANCEL SCREENING
     *
     * HTTP METHOD: POST
     * ENDPOINT: /owner/screenings/:id/cancel
     *
     * Cancels an existing screening.
     *
     * The backend handles affected reservations,
     * seat holds, and historical records.
     *
     * The screening ID identifies which screening to cancel.
     */
    cancelScreening(
      screeningId,
      { signal } = {},
    ) {

      // Send a cancellation request for the selected screening.
      return mutate(
        `/owner/screenings/${encodeURIComponent(screeningId)}/cancel`,
        {
          method: "POST",
          body: {},
          signal,
        },
      );
    },

    /*
     * DELETE SCREENING
     *
     * HTTP METHOD: DELETE
     * ENDPOINT: /owner/screenings/:id
     *
     * Requests deletion of an unused screening.
     *
     * screeningId:
     * Identifies the screening to delete.
     *
     * Unlike cancellation, deletion uses HTTP DELETE.
     */
    deleteScreening(
      screeningId,
      { signal } = {},
    ) {

      // Request deletion of the selected screening.
      return mutate(
        `/owner/screenings/${encodeURIComponent(screeningId)}`,
        {
          method: "DELETE",
          signal,
        },
      );
    },

    /*
     * LIST BOOKINGS
     *
     * HTTP METHOD: GET
     * ENDPOINT: /owner/bookings
     *
     * Allows the owner to search for reservations.
     *
     * FILTERS:
     * reference: Booking reference number or code.
     * cinemaId: Cinema associated with the booking.
     * screeningId: Screening associated with the booking.
     * date: Booking search date.
     *
     * page and pageSize control pagination.
     */
    listBookings(
      {
        reference,
        cinemaId,
        screeningId,
        date,
        page = 1,
        pageSize = 20,
      } = {},
      options = {},
    ) {

      // Retrieve bookings matching the selected search filters.
      return get(
        "/owner/bookings",
        {
          reference,
          cinemaId,
          screeningId,
          date,
          page,
          pageSize,
        },
        options,
      );
    },

    /*
     * GET BOOKING DETAILS
     *
     * HTTP METHOD: GET
     * ENDPOINT: /owner/bookings/:reference
     *
     * Retrieves information about one specific booking.
     *
     * reference:
     * Unique booking reference used to identify the reservation.
     *
     * encodeURIComponent() safely includes the reference in the URL.
     */
    getBooking(
      reference,
      options = {},
    ) {

      // Request the details of the selected booking.
      return get(
        `/owner/bookings/${encodeURIComponent(reference)}`,
        {},
        options,
      );
    },

    // BATCH 2 CONTINUES HERE.
    // Do not close the service object yet.

        /*
     * LIST CASHIER ACCOUNTS
     *
     * HTTP METHOD: GET
     * ENDPOINT: /owner/cashiers
     *
     * Retrieves cashier accounts from the backend.
     *
     * The owner can:
     * - Search cashiers by name or email.
     * - Filter active and inactive accounts.
     * - View accounts across multiple pages.
     *
     * PARAMETERS:
     * search: Text used to find cashier accounts.
     * active: Filters accounts based on their status.
     * page: Current page number.
     * pageSize: Number of accounts displayed per page.
     *
     * ACTIVE FILTER:
     * true      = Only active cashiers.
     * false     = Only inactive cashiers.
     * undefined = All cashiers.
     */
    listCashiers(
      {
        search,
        active,
        page = 1,
        pageSize = 20,
      } = {},
      options = {},
    ) {

      // Request cashier accounts using the selected filters.
      return get(
        "/owner/cashiers",
        {
          search,
          active,
          page,
          pageSize,
        },
        options,
      );
    },

    /*
     * CREATE CASHIER ACCOUNT
     *
     * HTTP METHOD: POST
     * ENDPOINT: /owner/cashiers
     *
     * Creates a new cashier account in the system.
     *
     * REQUIRED INFORMATION:
     * firstName: Cashier's first name.
     * lastName: Cashier's last name.
     * email: Cashier's email address.
     * password: Initial account password.
     *
     * IMPORTANT:
     * New cashiers are created without a theater assignment.
     * The owner must assign a theater separately.
     *
     * The backend decides the cashier's role and permissions.
     * The frontend does not send a role or active status.
     */
    createCashier(
      { firstName, lastName, email, password },
      { signal } = {},
    ) {

      // Send a POST request to create the cashier account.
      return mutate(
        "/owner/cashiers",
        {
          method: "POST",
          signal,

          // Prepare the cashier information sent to the backend.
          body: {

            // Remove unnecessary spaces from the first name.
            firstName: trimText(firstName),

            // Remove unnecessary spaces from the last name.
            lastName: trimText(lastName),

            // Remove spaces and convert the email to lowercase.
            email:
              typeof email === "string"
                ? email.trim().toLowerCase()
                : email,

            // Keep the password exactly as entered by the user.
            password,
          },
        },
      );
    },

    /*
     * ACTIVATE OR DEACTIVATE CASHIER
     *
     * HTTP METHOD: PATCH
     * ENDPOINT: /owner/cashiers/:id
     *
     * Changes whether a cashier account is active.
     *
     * PARAMETERS:
     * cashierId: Identifies the cashier account.
     * active: The new account status.
     *
     * active = true:
     * The cashier account is activated.
     *
     * active = false:
     * The cashier account is deactivated.
     *
     * IMPORTANT:
     * Deactivation does not delete the account.
     * Existing theater assignments and historical
     * records are retained by the backend.
     */
    setCashierActive(
      cashierId,
      active,
      { signal } = {},
    ) {

      // Send the new active status to the backend.
      return mutate(
        `/owner/cashiers/${encodeURIComponent(cashierId)}`,
        {
          method: "PATCH",

          // Only the active status is being updated.
          body: { active },

          signal,
        },
      );
    },

    /*
     * LIST AVAILABLE THEATERS
     *
     * HTTP METHOD: GET
     * ENDPOINT: /cinemas
     *
     * Retrieves available theaters from the public
     * cinema catalogue.
     *
     * These theaters are displayed when an owner
     * wants to assign a theater to a cashier.
     *
     * PARAMETERS:
     * page: Current page number.
     * pageSize: Number of theaters per page.
     *
     * IMPORTANT:
     * The public /cinemas endpoint is used because
     * an owner-specific theater endpoint is not confirmed.
     *
     * normalizeTheaters() checks the returned information
     * and converts theater IDs into strings.
     */
    async listTheaters(
      { page = 1, pageSize = 20 } = {},
      options = {},
    ) {

      // Request theaters and validate the returned records.
      return normalizeTheaters(
        await get(
          "/cinemas",
          { page, pageSize },
          options,
        ),
      );
    },

    /*
     * GET CASHIER'S CURRENT THEATER ASSIGNMENT
     *
     * HTTP METHOD: GET
     * ENDPOINT: /owner/cashiers/:id/theaters
     *
     * Retrieves the theater currently assigned
     * to a specific cashier.
     *
     * Each cashier can have only one assigned theater.
     *
     * POSSIBLE BACKEND RESPONSES:
     *
     * { data: [] }
     * Means the cashier has no theater assignment.
     *
     * { data: [theater] }
     * Means the cashier has one assigned theater.
     *
     * PARAMETERS:
     * cashierId: Identifies the cashier.
     * query: Local pagination settings.
     * options: Additional request options.
     *
     * IMPORTANT:
     * This backend endpoint does not use pagination.
     * Pagination information is added locally
     * for compatibility with the frontend.
     */
    async listCashierTheaters(
      cashierId,
      query = {},
      options = {},
    ) {

      // Check pagination values before sending any request.
      // Invalid values cause an error immediately.
      paginateLocal([], query);

      // Request the cashier's current theater assignment.
      const response = normalizeTheaters(
        await get(
          `/owner/cashiers/${encodeURIComponent(cashierId)}/theaters`,

          // No pagination parameters are sent to this endpoint.
          {},

          options,
        ),

        // Allow zero or one theater, but not multiple theaters.
        { single: true },
      );

      // Add local pagination information to the response.
      return paginateLocal(response.data, query);
    },

    /*
     * ASSIGN ONE THEATER TO A CASHIER
     *
     * HTTP METHOD: PUT
     * ENDPOINT: /owner/cashiers/:id/theaters
     *
     * Assigns a theater to a specific cashier.
     *
     * PARAMETERS:
     * cashierId: Identifies the cashier.
     * theaterId: Identifies the theater being assigned.
     *
     * IMPORTANT RULE:
     * A cashier can only have one theater assignment.
     *
     * Assigning a different theater replaces
     * the previous assignment.
     *
     * REQUEST BODY EXAMPLE:
     * { theaterId: 1 }
     *
     * EXPECTED RESPONSE:
     * { data: [theater] }
     *
     * The backend expects one numeric theaterId,
     * not an array of theater IDs.
     */
    async setCashierTheater(
      cashierId,
      theaterId,
      { signal } = {},
    ) {

      // Validate the theater ID and convert it to a number.
      const requestedId = numericTheaterId(theaterId);

      // Send the theater assignment request to the backend.
      const response = normalizeTheaters(
        await mutate(
          `/owner/cashiers/${encodeURIComponent(cashierId)}/theaters`,
          {
            // PUT is used to replace the current assignment.
            method: "PUT",

            // Send only one numeric theater ID.
            body: {
              theaterId: requestedId,
            },

            signal,
          },
        ),

        // The response must not contain multiple theaters.
        { single: true },
      );

      /*
       * VERIFY THE SAVED ASSIGNMENT
       *
       * Check that:
       * 1. Exactly one theater was returned.
       * 2. The returned theater matches the requested theater.
       *
       * This helps confirm that the backend
       * saved the correct assignment.
       */
      if (
        response.data.length !== 1 ||
        response.data[0].id !== String(requestedId)
      ) {

        /*
         * The request may have succeeded even if
         * the response is incorrect.
         *
         * Do not automatically repeat the request.
         * The current assignment should be reloaded first.
         */
        invalidResponse(
          "The saved theater could not be confirmed. Reload the assignment.",
        );
      }

      // Return the confirmed theater assignment.
      return response;
    },

    /*
     * LEGACY THEATER ASSIGNMENT FUNCTION
     *
     * This function provides temporary compatibility
     * with the older cashier theater assignment interface.
     *
     * The older interface uses theaterIds as an array.
     * The newer backend accepts only one theaterId.
     *
     * PARAMETERS:
     * cashierId: Identifies the cashier.
     * theaterIds: Array containing the selected theater ID.
     *
     * IMPORTANT:
     * Exactly one theater ID must be provided.
     *
     * Empty arrays and multiple theater IDs are rejected.
     *
     * Removing theater assignments is not supported
     * because the backend request format is unconfirmed.
     *
     * This function calls setCashierTheater()
     * instead of sending a separate API request.
     */
    async setCashierTheaters(
      cashierId,
      theaterIds,
      options = {},
    ) {

      // Create a copy if theaterIds is an array.
      // Otherwise, use null to indicate invalid input.
      const ids = Array.isArray(theaterIds)
        ? [...theaterIds]
        : null;

      /*
       * VALIDATE THE SELECTED THEATERS
       *
       * Reject the request when:
       * - theaterIds is not an array.
       * - No theater was selected.
       * - More than one theater was selected.
       */
      if (!ids || ids.length !== 1) {

        // Report a validation error to the frontend.
        throw new ApiError(
          "Select exactly one theater. Assignment removal is not available yet.",
          {
            status: 422,
            code: "VALIDATION_ERROR",

            // Field-specific error for the theater selection.
            fieldErrors: {
              theaterIds: "Select one theater.",
            },
          },
        );
      }

      /*
       * SAVE THE THEATER ASSIGNMENT
       *
       * Use the newer single-theater function.
       *
       * ids[0] retrieves the first and only
       * theater ID from the validated array.
       */
      const response = await service.setCashierTheater(
        cashierId,
        ids[0],
        options,
      );

      /*
       * PREPARE THE COMPATIBILITY RESPONSE
       *
       * The older frontend expects theaterIds
       * to be returned as an array.
       *
       * Convert the cashier ID to a string.
       * Extract the assigned theater ID into an array.
       *
       * This response is created locally.
       * It is not another backend request.
       */
      return {
        data: {

          // ID of the cashier whose assignment was updated.
          cashierId: String(cashierId),

          // Array containing the saved theater ID.
          theaterIds: response.data.map(
            (theater) => theater.id,
          ),
        },
      };
    },
  };

  /*
   * RETURN OWNER SERVICE
   *
   * The service object contains all owner API functions.
   *
   * Returning it allows other files to call methods such as:
   *
   * ownerService.listCashiers()
   * ownerService.createCashier()
   * ownerService.setCashierActive()
   * ownerService.listTheaters()
   * ownerService.setCashierTheater()
   *
   * These methods are used by frontend components
   * to communicate with the backend.
   */
  return service;
}