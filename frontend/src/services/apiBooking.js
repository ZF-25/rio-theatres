/*
 * FILE: frontend/src/services/apiBooking.js
 *
 * PURPOSE
 * -------
 * Defines requests for the customer booking workflow.
 *
 * PAGE CONNECTIONS
 * ----------------
 * Seat Selection:
 * - getScreening()
 * - getSeatMap()
 * - createHold()
 *
 * Checkout:
 * - getHold()
 * - releaseHold()
 * - createBooking()
 *
 * Booking Confirmation:
 * - getBooking()
 *
 * Booking History:
 * - listMyBookings()
 *
 * IMPORTANT
 * ---------
 * All requests go to OUR Express backend.
 *
 * The backend controls:
 * - Seat availability.
 * - Hold ownership and expiry.
 * - Ticket prices.
 * - Booking ownership.
 * - Simulated payment completion.
 * - Double-booking prevention.
 *
 * This service never accepts a frontend-calculated price as
 * the amount to charge.
 */

import { ApiError } from "./apiClient.js";


/*
 * CREATE AN OPERATION KEY
 *
 * Use one key for ONE intentional hold or purchase operation.
 *
 * If the response is lost and the same operation is retried,
 * reuse the ORIGINAL key and the SAME request body.
 *
 * A changed selection or a new purchase attempt gets a new key.
 *
 * Do not generate a new key automatically on every network retry.
 * That would defeat duplicate-operation protection.
 *
 * The upcoming booking pages will manage these keys.
 */
export function createOperationKey() {
  return globalThis.crypto.randomUUID();
}


/*
 * REQUIRE AN IDEMPOTENCY KEY
 *
 * This is a local usage error, not an error returned by Express.
 * It helps catch a missing booking-page integration step.
 */
function requireOperationKey(key) {
  if (
    typeof key !== "string" ||
    key.trim() === ""
  ) {
    throw new ApiError(
      "This operation requires an idempotency key.",
      {
        code: "MISSING_IDEMPOTENCY_KEY",
      },
    );
  }
}


/*
 * CHECK A PAGINATED BOOKING LIST
 *
 * Expected:
 * {
 *   data: Booking[],
 *   meta: {
 *     page,
 *     pageSize,
 *     totalItems,
 *     totalPages
 *   }
 * }
 *
 * Booking History must retain pagination rather than assuming
 * the first page contains every booking.
 */
function validateBookingList(response) {
  const meta = response?.meta;

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

  if (!valid) {
    throw new ApiError(
      "The server returned an invalid booking list.",
      {
        code: "INVALID_RESPONSE",
      },
    );
  }

  return response;
}


/*
 * CREATE THE BOOKING API SERVICE
 *
 * client:
 * The SAME apiClient exported by catalogue.js.
 *
 * Reusing the client shares its current CSRF token with
 * authentication and other API services.
 *
 * A later configuration file will create this service.
 * Do not create separate clients inside booking pages.
 */
export function createApiBooking(client) {
  /*
   * SESSION BOOTSTRAP BEFORE MUTATIONS
   *
   * Guest customers need an anonymous session too:
   * a hold must belong to a particular visitor.
   *
   * GET /auth/session provides the CSRF token that apiClient
   * automatically includes in the following mutation.
   *
   * The backend must preserve the same visitor's holds when
   * login rotates their session ID.
   *
   * This check must not extend a hold's expiry.
   */
  async function prepareMutation(signal) {
    await client.request(
      "/auth/session",
      { signal },
    );
  }


  return {
    /*
     * GET SCREENING DETAILS
     *
     * Used by Seat Selection when opening a URL directly.
     *
     * Endpoint:
     * GET /api/v1/screenings/:screeningId
     *
     * Success:
     * { data: Screening }
     *
     * A past/cancelled screening may still be returned.
     * The page must inspect startsAt/status and disable booking.
     * The backend must also reject invalid booking operations.
     */
    getScreening(
      screeningId,
      { signal } = {},
    ) {
      return client.request(
        `/screenings/${encodeURIComponent(
          screeningId,
        )}`,
        { signal },
      );
    },


    /*
     * GET THE COMPLETE SEAT MAP
     *
     * Endpoint:
     * GET /api/v1/screenings/:screeningId/seats
     *
     * Success:
     * {
     *   data: {
     *     screeningId,
     *     serverNow,
     *     layout,
     *     seats: [...]
     *   }
     * }
     *
     * This endpoint is NOT paginated.
     *
     * Seat statuses:
     * - available
     * - booked
     * - held
     * - staff_reserved
     * - owner_blocked
     *
     * Use seat IDs for requests.
     * Use labels/coordinates to draw the map.
     */
    getSeatMap(
      screeningId,
      { signal } = {},
    ) {
      return client.request(
        `/screenings/${encodeURIComponent(
          screeningId,
        )}/seats`,
        { signal },
      );
    },


    /*
     * CREATE A TEMPORARY CHECKOUT HOLD
     *
     * Endpoint:
     * POST /api/v1/holds
     *
     * Input:
     * {
     *   screeningId,
     *   seatIds: [...],
     *   tickets: { adult, child }
     * }
     *
     * Success:
     * { data: Hold }
     *
     * The Hold includes:
     * - id
     * - seats and ticket quantities
     * - expiresAt
     * - serverNow
     * - authoritative quote in euro cents
     *
     * A conflict throws ApiError with code SEAT_CONFLICT.
     * Its details may contain unavailableSeatIds.
     */
    async createHold(
      {
        screeningId,
        seatIds,
        tickets,
      },
      {
        signal,
        idempotencyKey,
      } = {},
    ) {
      requireOperationKey(idempotencyKey);

      await prepareMutation(signal);

      return client.request(
        "/holds",
        {
          method: "POST",
          signal,
          idempotencyKey,

          /*
           * Explicitly select allowed fields.
           *
           * Do not forward a caller's total, expiry, user ID,
           * or payment status.
           */
          body: {
            screeningId,
            seatIds,
            tickets: {
              adult: tickets?.adult,
              child: tickets?.child,
            },
          },
        },
      );
    },


    /*
     * LOAD AN EXISTING HOLD
     *
     * Endpoint:
     * GET /api/v1/holds/:holdId
     *
     * Used to restore Checkout after navigation or refresh.
     *
     * Only the owning session can access the hold.
     *
     * Expected failures:
     * - 404: missing hold or another visitor's hold.
     * - 410: the visitor's hold expired or was released.
     *
     * Loading a hold must NOT restart its countdown.
     */
    getHold(
      holdId,
      { signal } = {},
    ) {
      return client.request(
        `/holds/${encodeURIComponent(holdId)}`,
        { signal },
      );
    },


    /*
     * RELEASE AN UNPAID HOLD
     *
     * Endpoint:
     * DELETE /api/v1/holds/:holdId
     *
     * Used when explicitly returning to seat selection or
     * abandoning checkout.
     *
     * Success:
     * HTTP 204, returned as null by apiClient.
     *
     * Server expiry must still work if this request never arrives,
     * such as when a customer closes their browser.
     */
    async releaseHold(
      holdId,
      { signal } = {},
    ) {
      await prepareMutation(signal);

      return client.request(
        `/holds/${encodeURIComponent(holdId)}`,
        {
          method: "DELETE",
          signal,
        },
      );
    },


    /*
     * START STRIPE CHECKOUT
     *
     * Endpoint:
     * POST /api/v1/bookings
     *
     * Input:
     * {
     *   holdId,
     *   customer: { name, email }
     * }
     *
     * API purchases use Stripe. Demo purchases use demoBooking.js.
     * A successful POST may return a pending booking and checkoutUrl;
     * it is not proof of payment. Only backend confirmation marks it paid.
     *
     * Success:
     * { data: Booking }
     *
     * Never send:
     * - Card information.
     * - Frontend totals.
     * - User IDs.
     * - A booking reference chosen by the browser.
     * - A browser-selected paid/confirmed status.
     */
    async createBooking(
      {
        holdId,
        customer,
      },
      {
        signal,
        idempotencyKey,
      } = {},
    ) {
      requireOperationKey(idempotencyKey);

      await prepareMutation(signal);

      return client.request(
        "/bookings",
        {
          method: "POST",
          signal,
          idempotencyKey,

          body: {
            holdId,

            customer: {
              name:
                typeof customer?.name === "string"
                  ? customer.name.trim()
                  : customer?.name,

              email:
                typeof customer?.email === "string"
                  ? customer.email.trim()
                  : customer?.email,
            },

            paymentMethod: "stripe",
          },
        },
      );
    },


    /*
     * GET A BOOKING CONFIRMATION
     *
     * Endpoint:
     * GET /api/v1/bookings/:reference
     *
     * Success:
     * { data: Booking }
     *
     * Access requires:
     * - The owning customer session, OR
     * - The original guest session.
     *
     * A booking reference is a locator, not authentication.
     */
    getBooking(
      reference,
      { signal } = {},
    ) {
      return client.request(
        `/bookings/${encodeURIComponent(
          reference,
        )}`,
        { signal },
      );
    },


    /*
     * GET THE CURRENT CUSTOMER'S BOOKING HISTORY
     *
     * Endpoint:
     * GET /api/v1/me/bookings
     *
     * Optional filters:
     * - cinemaId
     * - date: Helsinki calendar date, YYYY-MM-DD
     * - page
     * - pageSize
     *
     * Do not supply an account email or user ID as ownership.
     * Express derives ownership from the authenticated session.
     */
    async listMyBookings(
      {
        cinemaId,
        date,
        page = 1,
        pageSize = 20,
      } = {},
      { signal } = {},
    ) {
      const response = await client.request(
        "/me/bookings",
        {
          signal,

          query: {
            cinemaId,
            date,
            page,
            pageSize,
          },
        },
      );

      return validateBookingList(response);
    },
  };
}