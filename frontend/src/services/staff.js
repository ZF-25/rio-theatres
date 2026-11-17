/*
 * FILE: frontend/src/services/staff.js
 *
 * Selects the owner and staff reservation services.
 *
 * ownerService: Manages screenings, bookings, and cashiers.
 * staffService: Manages staff reservations.
 *
 * staffMode: "demo" or "api".
 * staffEnabled: Checks compatibility with the catalogue mode.
 *
 * React authentication state is handled separately.
 */

import {
  createApiOwner,
} from "./apiOwner.js";

import {
  createApiStaff,
} from "./apiStaff.js";

import {
  createDemoOwner,
} from "./demoOwner.js";

import {
  createDemoStaff,
} from "./demoStaff.js";

import {
  apiClient,
  dataMode,
} from "./catalogue.js";

import {
  authMode,
} from "./auth.js";

import {
  demoCinemaStore,
} from "./demoCinemaStore.js";

import { movies } from "../data/movies.js";
import { rooms } from "../data/cinema.js";

import {
  cinemaContacts,
} from "../data/cinemaContacts.js";


/*
 * SELECT STAFF MODE
 *
 * Read the mode from the environment configuration.
 * Default to demo when no mode is specified.
 */
export const staffMode =
  import.meta.env.VITE_STAFF_MODE || "demo";

// Only demo and API modes are supported.
if (!["demo", "api"].includes(staffMode)) {
  throw new Error(
    'Invalid VITE_STAFF_MODE. Use either "demo" or "api".',
  );
}


/*
 * CATALOGUE COMPATIBILITY
 *
 * Staff operations must use IDs from the same data source.
 * For example, API room IDs cannot be used in demo services.
 */
export const staffEnabled =
  staffMode === dataMode;


/*
 * API MODE REQUIREMENTS
 *
 * Real staff operations need both API catalogue data
 * and API authentication.
 */
if (
  staffMode === "api" &&
  (
    dataMode !== "api" ||
    authMode !== "api"
  )
) {
  throw new Error(
    "API staff operations require VITE_DATA_MODE=api and VITE_AUTH_MODE=api.",
  );
}


/*
 * OWNER SERVICE SELECTION
 *
 * API mode uses HTTP requests.
 * Demo mode uses the shared in-memory cinema store.
 */
const selectedOwner =
  staffMode === "api"
    ? createApiOwner(apiClient)
    : createDemoOwner({
        store: demoCinemaStore,
        movies,
        cinemas: cinemaContacts,
        rooms,
      });


/*
 * STAFF RESERVATION SERVICE SELECTION
 *
 * Select the real API or demo reservation implementation.
 */
const selectedStaff =
  staffMode === "api"
    ? createApiStaff(apiClient)
    : createDemoStaff({
        store: demoCinemaStore,
        cinemas: cinemaContacts,
        rooms,
      });


/*
 * API SUBSCRIPTION FALLBACK
 *
 * API services fetch data through requests rather than
 * subscribing to local stores.
 */
const EMPTY_SNAPSHOT = Object.freeze({});

// Provide a subscription function that performs no action.
function subscribeToNothing() {
  return () => {};
}

// Always return the same empty object for API snapshots.
function getEmptySnapshot() {
  return EMPTY_SNAPSHOT;
}


/*
 * COMBINE OWNER SNAPSHOTS
 *
 * Owner pages need both cinema and staff data.
 * Cache the combined snapshot to avoid unnecessary React updates.
 */
function createOwnerSnapshotGetter(service) {
  let previousCinema = null;
  let previousStaff = null;
  let combined = null;

  return function getSnapshot() {
    // Read the latest cinema and staff snapshots.
    const cinema =
      service.getCinemaSnapshot();

    const staff =
      service.getStaffSnapshot();

    // Create a new combined object only when data changes.
    if (
      combined === null ||
      cinema !== previousCinema ||
      staff !== previousStaff
    ) {
      previousCinema = cinema;
      previousStaff = staff;

      combined = {
        cinema,
        staff,
      };
    }

    return combined;
  };
}

// Demo mode uses combined snapshots; API mode uses an empty one.
const getOwnerSnapshot =
  staffMode === "demo"
    ? createOwnerSnapshotGetter(
        selectedOwner,
      )
    : getEmptySnapshot;


/*
 * OWNER SERVICE
 *
 * Export a consistent interface for both demo and API modes.
 * Fallback subscriptions support React hooks in API mode.
 */
export const ownerService = {
  ...selectedOwner,

  // Use the selected subscription or a no-op fallback.
  subscribe:
    selectedOwner.subscribe ??
    subscribeToNothing,

  // Provide the appropriate snapshot getter.
  getSnapshot:
    getOwnerSnapshot,
};


/*
 * STAFF RESERVATION SERVICE
 *
 * Export reservation methods with consistent React subscriptions.
 * Staff identity is handled separately by useStaffSession.
 */
export const staffService = {
  ...selectedStaff,

  // Subscribe to demo changes or use the API fallback.
  subscribe:
    selectedStaff.subscribe ??
    subscribeToNothing,

  // Return the selected snapshot or an empty API snapshot.
  getSnapshot:
    selectedStaff.getSnapshot ??
    getEmptySnapshot,
};