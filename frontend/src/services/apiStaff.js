/*
 * FILE: frontend/src/services/apiStaff.js
 *
 * PURPOSE:
 * Handles API requests related to staff reservations.
 *
 * This service is shared by two staff roles:
 * - Owner
 * - Cashier
 *
 * MAIN FEATURES:
 * - Search and list reservations.
 * - View reservation details.
 * - Create new reservations.
 * - Update existing reservations.
 * - Cancel reservations.
 *
 * HOW IT WORKS:
 * 1. A staff member performs an action in the frontend.
 * 2. The frontend calls a function from this service.
 * 3. The function sends an HTTP request to the backend.
 * 4. The backend checks permissions and processes the request.
 * 5. The response is returned to the frontend.
 *
 * AUTHORIZATION:
 * The backend must verify that the user is an active
 * owner or cashier before allowing staff operations.
 *
 * Cashiers cannot access owner-only API endpoints.
 *
 * IMPORTANT:
 * Reservations are unpaid seat allocations.
 *
 * This service does not:
 * - Process payments.
 * - Issue paid tickets.
 * - Cancel customer purchases.
 * - Manage staff accounts.
 */


// Import the custom API error class for validation errors.
import {
  ApiError,
} from "./apiClient.js";


/*
 * REQUIRE RESERVATION VERSION
 *
 * PURPOSE:
 * Prevents staff members from accidentally overwriting
 * changes made by another staff member.
 *
 * HOW VERSIONING WORKS:
 *
 * 1. A reservation is loaded with a version number.
 * 2. The version increases whenever the reservation changes.
 * 3. The frontend sends the loaded version when updating.
 * 4. The backend checks whether the version is still current.
 *
 * EXAMPLE:
 * Staff A loads reservation version 2.
 * Staff B updates the reservation to version 3.
 * Staff A tries to save using version 2.
 *
 * The backend rejects the outdated update.
 *
 * This is called optimistic concurrency control.
 *
 * The frontend checks that a version exists.
 * The backend must check whether it is current.
 */
function requireVersion(version) {

  // Check that version is a positive whole number.
  if (
    !Number.isInteger(version) ||
    version < 1
  ) {

    // Stop the operation if the version is missing or invalid.
    throw new ApiError(
      "Reload the reservation before changing it.",
      {
        code: "MISSING_RESERVATION_VERSION",
      },
    );
  }
}


/*
 * VALIDATE RESERVATION LIST
 *
 * PURPOSE:
 * Checks whether the backend returned a correctly
 * structured list of reservations.
 *
 * EXPECTED RESPONSE:
 * {
 *   data: [...],
 *   meta: {
 *     page,
 *     pageSize,
 *     totalItems,
 *     totalPages
 *   }
 * }
 *
 * data:
 * Array containing reservation records.
 *
 * meta:
 * Information needed for pagination.
 *
 * IMPORTANT:
 * An empty array [] is a valid response.
 * It simply means no reservations were found.
 */
function validateReservationList(response) {

  // Extract pagination information from the response.
  const meta = response?.meta;

  /*
   * VALIDATE RESPONSE STRUCTURE
   *
   * Check that:
   * - data is an array.
   * - Pagination information exists.
   * - Page numbers are valid.
   * - Total item count is not negative.
   * - Total pages match the number of records.
   * - The returned list does not exceed the page size.
   */
  const valid =

    // Reservation data must be an array.
    Array.isArray(response?.data) &&

    // Pagination metadata must exist.
    meta &&

    // Current page must be a positive integer.
    Number.isInteger(meta.page) &&
    meta.page >= 1 &&

    // Page size must be a positive integer.
    Number.isInteger(meta.pageSize) &&
    meta.pageSize >= 1 &&

    // Total reservation count must be valid.
    Number.isInteger(meta.totalItems) &&
    meta.totalItems >= 0 &&

    // Total page count must be a non-negative integer.
    Number.isInteger(meta.totalPages) &&
    meta.totalPages >= 0 &&

    // Verify the total page count is calculated correctly.
    meta.totalPages ===
      Math.ceil(meta.totalItems / meta.pageSize) &&

    // Ensure the backend did not return too many records.
    response.data.length <= meta.pageSize;

  // Reject the response if any validation check fails.
  if (!valid) {

    throw new ApiError(
      "The server returned an invalid reservation list.",
      {
        code: "INVALID_RESPONSE",
      },
    );
  }

  // Return the validated response to the calling component.
  return response;
}


/*
 * CREATE STAFF API SERVICE
 *
 * PURPOSE:
 * Creates an object containing reservation API functions.
 *
 * PARAMETER:
 * client:
 * Shared API client used to send HTTP requests.
 *
 * IMPORTANT:
 * Reusing one API client keeps request handling,
 * session management, and error handling consistent.
 */
export function createApiStaff(client) {

  /*
   * PREPARE DATA MODIFICATION
   *
   * PURPOSE:
   * Refreshes the current session before performing
   * an operation that changes reservation data.
   *
   * This helps the API client obtain the current CSRF token.
   *
   * CSRF:
   * Cross-Site Request Forgery protection.
   * It helps protect authenticated requests from
   * being triggered by unauthorized websites.
   *
   * signal:
   * Allows the request to be cancelled.
   *
   * IMPORTANT:
   * This function does not log the user in.
   * The backend still checks the user's session and role.
   */
  async function prepareMutation(signal) {

    // Request the current authentication session.
    await client.request(
      "/auth/session",
      { signal },
    );
  }


  /*
   * RETURN STAFF SERVICE METHODS
   *
   * Each function below performs a different
   * reservation operation.
   *
   * Frontend components call these methods
   * instead of making HTTP requests directly.
   */
  return {

    /*
     * LIST / SEARCH RESERVATIONS
     *
     * HTTP METHOD: GET
     * ENDPOINT: /staff/reservations
     *
     * PURPOSE:
     * Retrieves reservations matching selected filters.
     *
     * PARAMETERS:
     * search: Search by reference or customer name.
     * cinemaId: Filter reservations by cinema.
     * screeningId: Filter by screening.
     * date: Filter using a Helsinki calendar date.
     * status: Filter active or cancelled reservations.
     * page: Current page number.
     * pageSize: Number of results per page.
     *
     * The backend returns newest reservations first,
     * based on their creation date.
     */
    async listReservations(
      {
        search,
        cinemaId,
        screeningId,
        date,
        status,
        page = 1,
        pageSize = 20,
      } = {},
      { signal } = {},
    ) {

      // Send a GET request to retrieve reservations.
      const response = await client.request(
        "/staff/reservations",
        {
          signal,

          // Pass search filters as URL query parameters.
          query: {
            search,
            cinemaId,
            screeningId,
            date,
            status,
            page,
            pageSize,
          },
        },
      );

      // Validate the backend response before returning it.
      return validateReservationList(
        response,
      );
    },


    /*
     * GET ONE RESERVATION
     *
     * HTTP METHOD: GET
     * ENDPOINT: /staff/reservations/:id
     *
     * PURPOSE:
     * Retrieves the details of a specific reservation.
     *
     * reservationId:
     * Unique ID identifying the reservation.
     *
     * EXPECTED RESPONSE:
     *
     * {
     *   data: {
     *     id,
     *     reference,
     *     screeningId,
     *     seats: [{ id, label, rowLabel }],
     *     customerName,
     *     note,
     *     createdBy,
     *     status,
     *     cancellationReason,
     *     version,
     *     createdAt,
     *     updatedAt
     *   }
     * }
     *
     * IMPORTANT FIELDS:
     * id: Internal reservation identifier.
     * reference: Reservation reference shown to staff.
     * screeningId: Screening linked to the reservation.
     * seats: Seats reserved for the customer.
     * customerName: Name associated with the reservation.
     * note: Additional reservation information.
     * createdBy: Staff member who created the reservation.
     * status: Whether the reservation is active or cancelled.
     * cancellationReason: Reason for cancellation, if present.
     * version: Used to prevent conflicting updates.
     * createdAt: Time the reservation was created.
     * updatedAt: Time of the latest update.
     *
     * The latest reservation should be loaded before editing.
     */
    getReservation(
      reservationId,
      { signal } = {},
    ) {

      // Request details for the selected reservation.
      return client.request(
        `/staff/reservations/${encodeURIComponent(
          reservationId,
        )}`,
        { signal },
      );
    },


    /*
     * CREATE A NEW RESERVATION
     *
     * HTTP METHOD: POST
     * ENDPOINT: /staff/reservations
     *
     * PURPOSE:
     * Creates an unpaid seat reservation for a screening.
     *
     * PARAMETERS:
     * screeningId: Screening being reserved.
     * seatIds: Array of selected physical seat IDs.
     * customerName: Name of the customer.
     * note: Optional additional information.
     *
     * IMPORTANT:
     * Physical seat IDs are used instead of displayed
     * seat numbers because IDs uniquely identify seats.
     *
     * The backend automatically assigns:
     * - Reservation reference.
     * - Staff member who created the reservation.
     * - Creation and update timestamps.
     * - Reservation status.
     * - Initial version number.
     *
     * BACKEND VALIDATION:
     * - Screening must not have started.
     * - Screening must not be cancelled.
     * - Seats must belong to the correct room.
     * - Seats must be available.
     * - Owner-blocked seats cannot be selected.
     *
     * All selected seats must be reserved together.
     * If one seat is invalid, the entire operation fails.
     */
    async createReservation(
      {
        screeningId,
        seatIds,
        customerName,
        note = "",
      },
      { signal } = {},
    ) {

      // Refresh the session and prepare CSRF protection.
      await prepareMutation(signal);

      // Send the new reservation details to the backend.
      return client.request(
        "/staff/reservations",
        {
          method: "POST",
          signal,

          // Information required to create the reservation.
          body: {

            // ID of the screening being reserved.
            screeningId,

            // Array containing the selected physical seat IDs.
            seatIds,

            // Remove unnecessary spaces from the customer name.
            customerName:
              typeof customerName === "string"
                ? customerName.trim()
                : customerName,

            // Remove unnecessary spaces from the optional note.
            note:
              typeof note === "string"
                ? note.trim()
                : note,
          },
        },
      );
    },


    /*
     * UPDATE AN EXISTING RESERVATION
     *
     * HTTP METHOD: PATCH
     * ENDPOINT: /staff/reservations/:id
     *
     * PURPOSE:
     * Allows staff to modify an existing reservation.
     *
     * EDITABLE INFORMATION:
     * - Reserved seats.
     * - Customer name.
     * - Reservation note.
     *
     * The screening itself cannot be changed.
     *
     * PARAMETERS:
     * reservationId: Reservation being updated.
     * seatIds: Complete replacement seat selection.
     * customerName: Updated customer name.
     * note: Updated reservation note.
     * version: Version loaded by the editing form.
     *
     * IMPORTANT:
     * The backend checks that the replacement seats
     * are available before saving changes.
     *
     * The reservation's own existing seats are excluded
     * from the availability conflict check.
     *
     * If validation fails, the original reservation
     * must remain unchanged.
     */
    async updateReservation(
      reservationId,
      {
        seatIds,
        customerName,
        note = "",
        version,
      },
      { signal } = {},
    ) {

      // Ensure the reservation has a valid version number.
      requireVersion(version);

      // Refresh session information before changing data.
      await prepareMutation(signal);

      // Send the updated reservation details to the backend.
      return client.request(
        `/staff/reservations/${encodeURIComponent(
          reservationId,
        )}`,
        {
          method: "PATCH",
          signal,

          // Send the complete updated reservation information.
          body: {

            // Replacement list of selected seat IDs.
            seatIds,

            // Clean the updated customer name.
            customerName:
              typeof customerName === "string"
                ? customerName.trim()
                : customerName,

            // Clean the updated reservation note.
            note:
              typeof note === "string"
                ? note.trim()
                : note,

            // Used by the backend to detect outdated edits.
            version,
          },
        },
      );
    },


    /*
     * CANCEL AN UNPAID RESERVATION
     *
     * HTTP METHOD: POST
     * ENDPOINT: /staff/reservations/:id/cancel
     *
     * PURPOSE:
     * Cancels an existing unpaid reservation.
     *
     * reservationId:
     * Identifies the reservation being cancelled.
     *
     * version:
     * Current reservation version used to prevent
     * cancellation based on outdated information.
     *
     * WHAT HAPPENS AFTER CANCELLATION:
     * - The reservation is marked as cancelled.
     * - Its reserved seats are released.
     * - Historical reservation information is preserved.
     *
     * IMPORTANT:
     * This does not cancel paid customer purchases.
     *
     * The backend handles repeated cancellation requests
     * for an already-cancelled reservation idempotently.
     *
     * Idempotent means repeating the same operation
     * does not cause additional changes.
     */
    async cancelReservation(
      reservationId,
      { version },
      { signal } = {},
    ) {

      // Check that a valid reservation version was provided.
      requireVersion(version);

      // Refresh the session before making the cancellation request.
      await prepareMutation(signal);

      // Send the cancellation request to the backend.
      return client.request(
        `/staff/reservations/${encodeURIComponent(
          reservationId,
        )}/cancel`,
        {
          method: "POST",

          // Send the reservation version for conflict checking.
          body: { version },

          signal,
        },
      );
    },
  };
}