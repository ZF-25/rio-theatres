/*
 * FILE: frontend/src/services/booking.js
 *
 * PURPOSE
 * -------
 * Selects the booking implementation used by customer pages.
 *
 * Supported modes:
 *
 * "demo":
 * Uses demoBooking.js and the shared frontend cinema store.
 *
 * "api":
 * Uses apiBooking.js and the Express backend.
 *
 * PAGE CONNECTIONS
 * ----------------
 * - Seat Selection.
 * - Checkout.
 * - Booking Confirmation.
 * - Booking History.
 *
 * MODE COMPATIBILITY
 * ------------------
 * Catalogue and booking records must come from matching sources.
 *
 * Demo catalogue IDs cannot be sent to real booking endpoints.
 * Real catalogue IDs cannot be booked through the demo store.
 *
 * API booking also requires API authentication so the displayed
 * customer identity matches the backend session.
 */

import {
  createApiBooking,
} from "./apiBooking.js";

import {
  createDemoBooking,
} from "./demoBooking.js";


// Reuse the existing API client and catalogue mode.
import {
  apiClient,
  dataMode,
} from "./catalogue.js";


// Reuse the selected customer authentication service.
import {
  auth,
  authMode,
} from "./auth.js";


// Use the SAME demo store as existing customer/staff features.
import {
  demoCinemaStore,
} from "./demoCinemaStore.js";


// Definitions required by the demo adapter.
import { movies } from "../data/movies.js";
import { rooms } from "../data/cinema.js";

import {
  cinemaContacts,
} from "../data/cinemaContacts.js";


/*
 * BOOKING MODE
 *
 * Default to demo so no booking backend is required during
 * frontend development.
 *
 * This setting will take effect as booking pages migrate
 * to this service.
 */
export const bookingMode =
  import.meta.env.VITE_BOOKING_MODE || "demo";

if (!["demo", "api"].includes(bookingMode)) {
  throw new Error(
    'Invalid VITE_BOOKING_MODE. Use either "demo" or "api".',
  );
}


/*
 * WHETHER THE CURRENT CATALOGUE CAN BE BOOKED
 *
 * Example:
 * API catalogue + demo booking
 *
 * Browsing can continue, but booking must remain unavailable
 * because the identifiers belong to different data sources.
 *
 * Upcoming booking-page updates will use this flag.
 */
export const bookingEnabled =
  bookingMode === dataMode &&
  (bookingMode === "api" ? authMode === "api" : authMode === "demo");


/*
 * VALIDATE REAL BOOKING CONFIGURATION
 *
 * API authentication supports anonymous guest sessions too.
 * It does not mean that every customer must register.
 *
 * It ensures customer/guest identity is managed by the same
 * backend that owns the holds and bookings.
 */
if (
  bookingMode === "api" &&
  (
    dataMode !== "api" ||
    authMode !== "api"
  )
) {
  throw new Error(
    "API booking requires VITE_DATA_MODE=api and VITE_AUTH_MODE=api.",
  );
}


/*
 * CREATE ONE IMPLEMENTATION
 *
 * Do not create a new demoBooking instance inside each page.
 *
 * Its hold history, receipt records, and retry-operation records
 * must be shared across the complete booking journey.
 *
 * Creating these services does not send a network request.
 */
// Avoid constructing a demo service with an incompatible API auth object.
const unavailableBooking = Object.fromEntries(
  ["getScreening", "getSeatMap", "createHold", "getHold", "releaseHold",
    "createBooking", "getBooking", "listMyBookings"].map((method) => [
    method,
    async () => { throw new Error("Booking is unavailable for this configuration."); },
  ]),
);

const selectedBooking = !bookingEnabled
  ? unavailableBooking
  : bookingMode === "api"
    ? createApiBooking(apiClient)
    : createDemoBooking({
        store: demoCinemaStore,
        auth,
        movies,
        cinemas: cinemaContacts,
        rooms,
      });


/*
 * STABLE SNAPSHOT FOR API MODE
 *
 * Demo mode can notify React about local store changes.
 * API mode obtains updates through HTTP requests/polling instead.
 *
 * Returning the same empty object avoids unnecessary React
 * updates when using useSyncExternalStore.
 */
const EMPTY_SNAPSHOT = Object.freeze({});

function subscribeToNothing() {
  return () => {};
}

function getEmptySnapshot() {
  return EMPTY_SNAPSHOT;
}


/*
 * SHARED BOOKING SERVICE
 *
 * Both modes expose:
 * - getScreening()
 * - getSeatMap()
 * - createHold()
 * - getHold()
 * - releaseHold()
 * - createBooking()
 * - getBooking()
 * - listMyBookings()
 *
 * Also expose a consistent subscription interface:
 * - subscribe()
 * - getSnapshot()
 *
 * API subscriptions below are intentionally inactive.
 * They do not provide WebSocket or live server updates.
 */
export const booking = {
  ...selectedBooking,

  subscribe:
    selectedBooking.subscribe ??
    subscribeToNothing,

  getSnapshot:
    selectedBooking.getSnapshot ??
    getEmptySnapshot,
};