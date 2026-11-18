/*
 * FILE: frontend/src/services/demoStaff.js
 *
 * PURPOSE
 * Provides demo reservation operations for owners and cashiers.
 *
 * FEATURES
 * - Search and view reservations.
 * - Create, edit, and cancel unpaid reservations.
 * - Check theater permissions and seat availability.
 *
 * PERMISSIONS
 * Owners can access all theaters.
 * Cashiers can only access their assigned theater.
 *
 * Permissions are checked for every operation.
 * Inaccessible reservations return 404.
 *
 * DEMO LIMITATION
 * Data is stored in memory. The real backend must handle
 * authorization, transactions, and concurrency.
 */

import { ApiError } from "./apiClient.js";

import {
  demoStaffStore,
  requireDemoStaff,
  canDemoStaffAccessTheater,
  requireDemoTheaterAccess,
} from "./demoStaffStore.js";

import { createRows } from "../data/cinema.js";

import {
  demoScreeningInstant,
} from "../utils/cinemaTime.js";

/*
 * Create the demo staff service using shared cinema data.
 * now() provides the current time for screening checks.
 */
export function createDemoStaff({
  store,
  cinemas,
  rooms,
  now = () => Date.now(),
}) {
  /*
   * Track reservation versions because the original
   * demo store does not include a version field.
   */
  const versions = new Map();

  /*
   * Cache combined cinema and staff snapshots.
   * React can detect changes to either store.
   */
  let previousCinemaSnapshot = null;
  let previousStaffSnapshot = null;
  let combinedSnapshot = null;

  // Return updated data only when one of the stores changes.
  function getSnapshot() {
    const cinemaSnapshot = store.getSnapshot();
    const staffSnapshot = demoStaffStore.getSnapshot();

    if (
      combinedSnapshot === null ||
      cinemaSnapshot !== previousCinemaSnapshot ||
      staffSnapshot !== previousStaffSnapshot
    ) {
      previousCinemaSnapshot = cinemaSnapshot;
      previousStaffSnapshot = staffSnapshot;

      combinedSnapshot = {
        cinema: cinemaSnapshot,
        staff: staffSnapshot,
      };
    }

    return combinedSnapshot;
  }

  // Create consistent API errors with optional field details.
  function fail(
    message,
    status,
    code,
    details = {},
    fieldErrors = {},
  ) {
    throw new ApiError(message, {
      status,
      code,
      details,
      fieldErrors,
    });
  }

  // Check that the request is active and a staff user is logged in.
  function requireStaff(signal) {
    signal?.throwIfAborted();
    return requireDemoStaff();
  }

  // Convert a city name into its demo cinema ID.
  function cinemaId(city) {
    return `cinema-${city.toLowerCase()}`;
  }

  // Generate a unique physical seat ID.
  function seatId(screening, number) {
    return (
      `${screening.city.toLowerCase()}-` +
      `${screening.roomId}-seat-${number}`
    );
  }

  // Search for a screening in the current cinema store.
  function findScreening(id) {
    return store
      .getSnapshot()
      .screenings.find((screening) => screening.id === id);
  }

  // Return a screening or throw a 404 error.
  function requireScreening(id) {
    const screening = findScreening(id);

    if (!screening) {
      fail("Screening not found.", 404, "NOT_FOUND");
    }

    return screening;
  }

  // Find a reservation or report that it does not exist.
  function requireReservation(id) {
    const reservation = store
      .getSnapshot()
      .reservations.find((item) => item.id === id);

    if (!reservation) {
      fail("Reservation not found.", 404, "NOT_FOUND");
    }

    return reservation;
  }

  /*
   * Check access using the screening's actual theater.
   * hideResource can return 404 instead of exposing a restricted record.
   */
  function checkScreeningAccess(
    screening,
    { hideResource = false } = {},
  ) {
    return requireDemoTheaterAccess(
      cinemaId(screening.city),
      { hideResource },
    );
  }

  /*
   * Find a reservation and verify theater access.
   * Restricted reservation details are hidden from cashiers.
   */
  function accessibleReservation(id) {
    const reservation = requireReservation(id);
    const screening = requireScreening(reservation.screeningId);

    checkScreeningAccess(screening, {
      hideResource: true,
    });

    return { reservation, screening };
  }

  /*
   * New reservations and edits require a future,
   * scheduled screening. Cancellation is handled separately.
   */
  function requireFutureScreening(screening) {
    if (screening.status !== "scheduled") {
      fail(
        "This screening has been cancelled.",
        409,
        "SCREENING_CANCELLED",
      );
    }

    const startsAt = demoScreeningInstant(
      screening.date,
      screening.time,
    );

    if (Date.parse(startsAt) <= now()) {
      fail(
        "This screening has already started.",
        409,
        "SCREENING_STARTED",
      );
    }
  }

  /*
   * Generate physical seat records from the room layout.
   * Each seat includes its ID, number, and row label.
   */
  function physicalSeats(screening) {
    const room = rooms.find(
      (item) => item.id === screening.roomId,
    );

    if (!room) {
      fail(
        "The demo screening room is missing.",
        500,
        "INVALID_DEMO_DATA",
      );
    }

    return createRows(room.capacity).flatMap((row) =>
      row.seats.map((number) => ({
        id: seatId(screening, number),
        label: String(number),
        rowLabel: String(row.row),
        number,
      })),
    );
  }

  /*
   * Track reservation changes using a JSON fingerprint.
   * The version increases whenever stored data changes.
   */
  function currentVersion(reservation) {
    const fingerprint = JSON.stringify(reservation);
    const previous = versions.get(reservation.id);

    // A newly observed reservation starts at version 1.
    if (!previous) {
      versions.set(reservation.id, {
        fingerprint,
        version: 1,
      });

      return 1;
    }

    // Increase the version if the reservation has changed.
    if (previous.fingerprint !== fingerprint) {
      const version = previous.version + 1;

      versions.set(reservation.id, {
        fingerprint,
        version,
      });

      return version;
    }

    return previous.version;
  }

  // Require a positive integer version before modifying a reservation.
  function validateVersion(version) {
    if (!Number.isInteger(version) || version < 1) {
      fail(
        "Reload the reservation before changing it.",
        422,
        "VALIDATION_ERROR",
        {},
        {
          version: "A positive reservation version is required.",
        },
      );
    }
  }

  /*
   * Prevent outdated edits from overwriting newer changes.
   * A mismatch produces RESERVATION_CHANGED.
   */
  function checkVersion(reservation, requestedVersion) {
    validateVersion(requestedVersion);

    const version = currentVersion(reservation);

    if (requestedVersion !== version) {
      fail(
        "This reservation changed. Reload it before editing again.",
        409,
        "RESERVATION_CHANGED",
        { currentVersion: version },
      );
    }
  }

  /*
   * RESERVATION RESPONSE
   *
   * Convert stored reservation data into the structure
   * expected by the staff reservation interface.
   */
  function reservationRecord(reservation) {
    const screening = requireScreening(reservation.screeningId);
    const seats = physicalSeats(screening);

    // Find the staff member who originally created the reservation.
    const creator = demoStaffStore
      .getSnapshot()
      .accounts.find(
        (account) => account.email === reservation.staffEmail,
      );

    const firstName = creator?.firstName ?? "";
    const lastName = creator?.lastName ?? "";

    // Build a display name, with a fallback for missing accounts.
    const creatorName =
      [firstName, lastName].filter(Boolean).join(" ") ||
      creator?.name ||
      "Unknown staff member";

    // Use the latest update or cancellation timestamp.
    const updatedTimestamp = Math.max(
      reservation.updatedAt ?? reservation.createdAt,
      reservation.cancelledAt ?? 0,
    );

    return {
      id: reservation.id,
      reference: reservation.reference,
      screeningId: reservation.screeningId,

      // Convert stored seat numbers into detailed seat objects.
      seats: reservation.seats.map((number) => {
        const seat = seats.find(
          (item) => item.number === number,
        );

        if (!seat) {
          fail(
            "A demo reservation contains an unknown seat.",
            500,
            "INVALID_DEMO_DATA",
          );
        }

        return {
          id: seat.id,
          label: seat.label,
          rowLabel: seat.rowLabel,
        };
      }),

      customerName: reservation.customerName ?? "",
      note: reservation.note ?? "",

      createdBy: {
        id: creator?.id ?? "demo-unknown-staff",
        firstName,
        lastName,
        name: creatorName,
      },

      status: reservation.status,

      // Convert stored cancellation reasons into API-friendly values.
      cancellationReason:
        reservation.status === "active"
          ? null
          : reservation.cancellationReason === "Screening cancelled"
            ? "screening_cancelled"
            : "staff_cancelled",

      version: currentVersion(reservation),

      createdAt: new Date(
        reservation.createdAt,
      ).toISOString(),

      updatedAt: new Date(
        updatedTimestamp,
      ).toISOString(),
    };
  }

  /*
   * Validate customer contact fields.
   * Names must contain 1–100 characters; notes allow up to 500.
   */
  function contactFields(customerName, note) {
    const fieldErrors = {};

    const name =
      typeof customerName === "string"
        ? customerName.trim()
        : "";

    const trimmedNote =
      typeof note === "string"
        ? note.trim()
        : "";

    if (!name || name.length > 100) {
      fieldErrors.customerName =
        "Enter a customer name between 1 and 100 characters.";
    }

    if (
      typeof note !== "string" ||
      trimmedNote.length > 500
    ) {
      fieldErrors.note =
        "Enter a note of at most 500 characters.";
    }

    // Report all invalid fields together.
    if (Object.keys(fieldErrors).length > 0) {
      fail(
        "Please check the highlighted fields.",
        422,
        "VALIDATION_ERROR",
        {},
        fieldErrors,
      );
    }

    return {
      customerName: name,
      note: trimmedNote,
    };
  }

  /*
   * Validate selected seats before saving a reservation.
   * Existing seats can be retained when editing.
   */
  function selectedSeatNumbers(
    screening,
    seatIds,
    excludeReservationId = null,
  ) {
    // Require at least one valid, unique seat ID.
    if (
      !Array.isArray(seatIds) ||
      seatIds.length === 0 ||
      seatIds.some(
        (id) => typeof id !== "string" || id.trim() === "",
      ) ||
      new Set(seatIds).size !== seatIds.length
    ) {
      fail(
        "Choose at least one unique seat.",
        422,
        "VALIDATION_ERROR",
      );
    }

    const seats = physicalSeats(screening);

    // Match selected IDs to physical seats in the screening room.
    const selected = seatIds.map(
      (id) => seats.find((seat) => seat.id === id),
    );

    if (selected.some((seat) => !seat)) {
      fail(
        "Choose seats belonging to this screening's room.",
        422,
        "VALIDATION_ERROR",
      );
    }

    // Exclude the reservation's own seats when checking edits.
    const available = new Set(
      store.getAvailability(
        screening.id,
        { excludeReservationId },
      ).available,
    );

    // Identify seats that are already reserved or blocked.
    const unavailableSeatIds = selected
      .filter((seat) => !available.has(seat.number))
      .map((seat) => seat.id);

    if (unavailableSeatIds.length > 0) {
      fail(
        "Some selected seats are no longer available.",
        409,
        "SEATS_UNAVAILABLE",
        { unavailableSeatIds },
      );
    }

    // The demo store saves seat numbers rather than seat IDs.
    return selected.map((seat) => seat.number);
  }

    /*
   * STAFF RESERVATION SERVICE
   *
   * These methods are used by owners and cashiers
   * to manage unpaid reservations.
   */
  return {

    /*
     * SUBSCRIBE TO STORE CHANGES
     *
     * Notify React when reservation data or staff
     * accounts and theater assignments change.
     */
    subscribe(listener) {
      const stopCinema = store.subscribe(listener);
      const stopStaff = demoStaffStore.subscribe(listener);

      // Remove both subscriptions when no longer needed.
      return () => {
        stopCinema();
        stopStaff();
      };
    },

    // Provide React with the latest combined store snapshot.
    getSnapshot,

    /*
     * LIST RESERVATIONS
     *
     * Search and filter reservations by customer, theater,
     * screening, date, or status.
     *
     * Permission filtering happens before pagination.
     */
    async listReservations(
      {
        search = "",
        cinemaId: selectedCinemaId,
        screeningId,
        date,
        status,
        page = 1,
        pageSize = 20,
      } = {},
      { signal } = {},
    ) {
      requireStaff(signal);

      // Normalize search text for case-insensitive matching.
      const searchTerm =
        typeof search === "string"
          ? search.trim().toLowerCase()
          : "";

      // Validate filters and pagination values.
      if (
        typeof search !== "string" ||
        searchTerm.length > 100 ||
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100 ||
        (status && !["active", "cancelled"].includes(status))
      ) {
        fail(
          "Enter valid reservation filters.",
          422,
          "VALIDATION_ERROR",
        );
      }

      // Check that the selected theater exists and is accessible.
      if (selectedCinemaId) {
        const exists = cinemas.some(
          (cinema) => cinemaId(cinema.city) === selectedCinemaId,
        );

        if (!exists) {
          fail(
            "Choose a valid theater.",
            422,
            "VALIDATION_ERROR",
          );
        }

        // An explicit out-of-scope location filter returns 403.
        requireDemoTheaterAccess(selectedCinemaId);
      }

      // Validate the selected screening and staff access.
      if (screeningId) {
        const screening = findScreening(screeningId);

        if (!screening) {
          fail(
            "Choose a valid screening.",
            422,
            "VALIDATION_ERROR",
          );
        }

        checkScreeningAccess(screening);
      }

      // Check that the date follows the demo cinema date format.
      if (date) {
        try {
          demoScreeningInstant(date, "12:00");
        } catch {
          fail(
            "Enter a valid date.",
            422,
            "VALIDATION_ERROR",
          );
        }
      }

      /*
       * Filter reservations using the latest store data.
       * Cashiers only see reservations from their assigned theater.
       */
      const records = store
        .getSnapshot()
        .reservations.filter((reservation) => {
          const screening = findScreening(reservation.screeningId);

          // Hide reservations from inaccessible theaters.
          if (
            !screening ||
            !canDemoStaffAccessTheater(cinemaId(screening.city))
          ) {
            return false;
          }

          // Match the search against reference or customer name.
          const matchesSearch = [
            reservation.reference,
            reservation.customerName,
          ].some((value) =>
            String(value ?? "").toLowerCase().includes(searchTerm),
          );

          return (
            matchesSearch &&
            (!selectedCinemaId ||
              cinemaId(screening.city) === selectedCinemaId) &&
            (!screeningId ||
              reservation.screeningId === screeningId) &&
            (!date || screening.date === date) &&
            (!status || reservation.status === status)
          );
        })
        .map(reservationRecord)
        .sort(
          // Show newest reservations first.
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) ||
            b.id.localeCompare(a.id),
        );

      // Calculate the starting position of the requested page.
      const start = (page - 1) * pageSize;

      // Return paginated reservations with metadata.
      return {
        data: records.slice(start, start + pageSize),
        meta: {
          page,
          pageSize,
          totalItems: records.length,
          totalPages: Math.ceil(records.length / pageSize),
        },
      };
    },

    /*
     * GET ONE RESERVATION
     *
     * Retrieve reservation details only if the
     * current staff member has theater access.
     */
    async getReservation(
      reservationId,
      { signal } = {},
    ) {
      requireStaff(signal);

      // Find the reservation and verify access.
      const { reservation } =
        accessibleReservation(reservationId);

      return {
        data: reservationRecord(reservation),
      };
    },

    /*
     * CREATE UNPAID RESERVATION
     *
     * Validate the screening, customer details, and seats
     * before saving the reservation in the demo store.
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
      // Check the logged-in staff member.
      const staff = requireStaff(signal);

      // Find the screening and verify permissions.
      const screening = requireScreening(screeningId);

      checkScreeningAccess(screening);
      requireFutureScreening(screening);

      // Validate customer information and selected seats.
      const contact = contactFields(customerName, note);
      const numbers = selectedSeatNumbers(screening, seatIds);

      // Save the reservation using the staff member's email.
      const result = store.createReservation(
        {
          screeningId,
          seats: numbers,
          ...contact,
        },
        staff.email,
      );

      // Report seat conflicts if the store rejects the request.
      if (result.error) {
        fail(result.error, 409, "SEATS_UNAVAILABLE");
      }

      return {
        data: reservationRecord(result.reservation),
      };
    },

    /*
     * UPDATE RESERVATION
     *
     * Edit seats and customer details without changing
     * the screening linked to the reservation.
     *
     * Version checking prevents outdated edits.
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
      requireStaff(signal);

      // Load the reservation and its screening with access checks.
      const {
        reservation: original,
        screening,
      } = accessibleReservation(reservationId);

      // Cancelled reservations cannot be edited.
      if (original.status !== "active") {
        fail(
          "This reservation has been cancelled.",
          409,
          "RESERVATION_CANCELLED",
        );
      }

      // Ensure the form uses the latest reservation version.
      checkVersion(original, version);

      // The screening must still be scheduled in the future.
      requireFutureScreening(screening);

      const contact = contactFields(customerName, note);

      // Allow existing seats to remain selected during an edit.
      const numbers = selectedSeatNumbers(
        screening,
        seatIds,
        original.id,
      );

      // Replace the selected seats and customer details.
      const result = store.updateReservation(
        original.id,
        {
          seats: numbers,
          ...contact,
        },
      );

      if (result.error) {
        fail(result.error, 409, "SEATS_UNAVAILABLE");
      }

      return {
        data: reservationRecord(result.reservation),
      };
    },

    /*
     * CANCEL RESERVATION
     *
     * Cancel an unpaid reservation while preserving its history.
     * Repeated cancellation returns the existing cancelled record.
     */
    async cancelReservation(
      reservationId,
      { version },
      { signal } = {},
    ) {
      requireStaff(signal);

      // Find the reservation and check theater permissions.
      const { reservation: original } =
        accessibleReservation(reservationId);

      // A valid version is required even for repeated cancellation.
      validateVersion(version);

      // Avoid changing a reservation that is already cancelled.
      if (original.status === "cancelled") {
        return {
          data: reservationRecord(original),
        };
      }

      // Prevent cancellation based on an outdated version.
      checkVersion(original, version);

      // Cancel the reservation in the shared cinema store.
      const error = store.cancelReservation(reservationId);

      if (error) {
        fail(error, 409, "RESERVATION_CANCELLED");
      }

      // Return the updated reservation record.
      return {
        data: reservationRecord(
          requireReservation(reservationId),
        ),
      };
    },
  };
}