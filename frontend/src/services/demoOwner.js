/*
 * FILE: frontend/src/services/demoOwner.js
 *
 * PURPOSE
 * Owner dashboard services using the shared demo stores.
 * No backend request is made here.
 *
 * FEATURES
 * - Owner overview.
 * - Screening management.
 * - Customer booking lookup.
 * - Cashier creation and activation.
 * - Single-theater cashier assignment.
 *
 * ASSIGNMENT RULE
 * A cashier starts without a theater.
 * Assigning a theater replaces the previous assignment.
 *
 * The new assignment method is:
 * setCashierTheater(cashierId, theaterId)
 *
 * Its response follows Marina's confirmed structure:
 * { data: [theater] }
 *
 * Demo IDs remain strings such as "cinema-oulu".
 * Real backend ID conversion belongs in apiOwner.js.
 *
 * SECURITY
 * These checks support the demo only.
 * The backend must enforce real permissions independently.
 */
import { ApiError } from "./apiClient.js";
import { createDemoCatalogue } from "./demoCatalogue.js";
import { collectPages } from "./apiCatalogue.js";
import {
  demoStaffStore,
  requireDemoStaff,
} from "./demoStaffStore.js";
import { ticketPrice } from "../data/cinema.js";
import {
  cinemaDate,
  cinemaTime,
  demoScreeningInstant,
} from "../utils/cinemaTime.js";

export function createDemoOwner({
  store,
  movies,
  cinemas,
  rooms,
  now = () => Date.now(),
}) {
  /*
   * Use the existing shared cinema store.
   * Owner changes therefore also affect customer and cashier pages.
   */
  const demoCatalogue = createDemoCatalogue({
    movies,
    cinemas,
    rooms,
    store,
    now,
  });

  // Create consistent errors for invalid demo actions.
  function fail(message, status, code, fieldErrors = {}) {
    throw new ApiError(message, {
      status,
      code,
      fieldErrors,
    });
  }

  // Reject cancelled requests and non-owner demo sessions.
  function requireOwner(signal) {
    signal?.throwIfAborted();
    return requireDemoStaff(["owner"]);
  }

  // Build stable string IDs used by demo cinemas.
  function cinemaId(city) {
    return `cinema-${city.toLowerCase()}`;
  }

  // Prefix room IDs with the city to avoid duplicates.
  function roomId(city, originalId) {
    return `${city.toLowerCase()}-${originalId}`;
  }

  // Create a unique seat ID for a screening room.
  function seatId(screening, number) {
    return (
      `${screening.city.toLowerCase()}-` +
      `${screening.roomId}-seat-${number}`
    );
  }

  /*
   * Shared list helpers.
   * Existing pages expect paginated service responses.
   */

  // Return only the requested page plus pagination details.
  function paginate(records, { page = 1, pageSize = 20 } = {}) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      fail(
        "Enter valid pagination values.",
        422,
        "VALIDATION_ERROR",
      );
    }

    const start = (page - 1) * pageSize;

    return {
      data: records.slice(start, start + pageSize),
      meta: {
        page,
        pageSize,
        totalItems: records.length,
        totalPages: Math.ceil(records.length / pageSize),
      },
    };
  }

  // Validate search length and make matching case-insensitive.
  function searchText(value = "") {
    if (
      typeof value !== "string" ||
      value.trim().length > 100
    ) {
      fail(
        "Search must contain at most 100 characters.",
        422,
        "VALIDATION_ERROR",
      );
    }

    return value.trim().toLowerCase();
  }

  // Check optional dates using Helsinki cinema time rules.
  function validateDate(date) {
    if (!date) return;

    try {
      demoScreeningInstant(date, "12:00");
    } catch {
      fail(
        "Enter a valid date in YYYY-MM-DD format.",
        422,
        "VALIDATION_ERROR",
      );
    }
  }

  // Ensure a selected cinema exists in demo data.
  function validateCinema(id) {
    if (
      id &&
      !cinemas.some((cinema) => cinemaId(cinema.city) === id)
    ) {
      fail(
        "Choose a valid cinema.",
        422,
        "VALIDATION_ERROR",
      );
    }
  }

  /*
   * Read the latest cashier account.
   * Owner accounts cannot be modified using cashier methods.
   */

  // Find a cashier account; owner accounts are excluded.
  function requireCashier(id) {
    const account = demoStaffStore
      .getSnapshot()
      .accounts.find(
        (item) => item.id === id && item.role === "cashier",
      );

    if (!account) {
      fail("Cashier account not found.", 404, "NOT_FOUND");
    }

    return account;
  }

  // Locate the cinema and room matching a combined room ID.
  function findRoom(id) {
    for (const cinema of cinemas) {
      const room = rooms.find(
        (item) => roomId(cinema.city, item.id) === id,
      );

      if (room) {
        return { cinema, room };
      }
    }

    return null;
  }

  // Look up a screening or report that it is missing.
  function requireScreening(id) {
    const screening = store
      .getSnapshot()
      .screenings.find((item) => item.id === id);

    if (!screening) {
      fail("Screening not found.", 404, "NOT_FOUND");
    }

    return screening;
  }

  /*
   * SCREENING RESPONSE
   *
   * Convert the demo's Helsinki date/time into ISO instants.
   * Used by the owner screening list and screening editor.
   */

  // Convert stored screening data to the owner UI response format.
  function screeningRecord(screening) {
    const movie = movies.find(
      (item) => item.id === screening.movieId,
    );

    if (!movie) {
      fail(
        "A demo screening has no movie record.",
        500,
        "INVALID_DEMO_DATA",
      );
    }

    const startsAt = demoScreeningInstant(
      screening.date,
      screening.time,
    );

    return {
      id: screening.id,
      movieId: movie.id,
      movieTitle: movie.title,
      cinemaId: cinemaId(screening.city),
      cinemaName: `Rio ${screening.city}`,
      roomId: roomId(screening.city, screening.roomId),
      roomName: screening.roomName,
      startsAt,
      endsAt: new Date(
        Date.parse(startsAt) + movie.duration * 60 * 1000,
      ).toISOString(),
      spokenLanguage: screening.spokenLanguage ?? null,
      subtitles: [...(screening.subtitles ?? [])],
      status: screening.status,
      availableSeatCount:
        store.getAvailability(screening.id).available.length,
    };
  }

  /*
   * SCREENING INPUT
   *
   * Validate the owner form and translate its values into the
   * original cinema model's structure.
   *
   * The demo supports unambiguous Helsinki times at minute precision.
   */

  // Validate form values and convert them to demo store fields.
  function screeningDraft(draft) {
    const movie = movies.find(
      (item) => item.id === draft.movieId,
    );

    const location = findRoom(draft.roomId);

    if (
      !movie ||
      !location ||
      !Number.isInteger(movie.duration) ||
      movie.duration <= 0
    ) {
      fail(
        "Choose a valid movie with a runtime and a valid room.",
        422,
        "VALIDATION_ERROR",
      );
    }

    let date;
    let time;
    let timestamp;

    try {
      date = cinemaDate(draft.startsAt);
      time = cinemaTime(draft.startsAt);
      timestamp = Date.parse(draft.startsAt);

      const reconstructed = demoScreeningInstant(date, time);

      if (timestamp !== Date.parse(reconstructed)) {
        throw new Error(
          "The demo supports unambiguous minute-based times.",
        );
      }
    } catch {
      fail(
        "Enter a valid screening instant with minute precision.",
        422,
        "VALIDATION_ERROR",
        {
          startsAt: "Use a valid ISO date-time with a timezone.",
        },
      );
    }

    if (timestamp <= now()) {
      fail(
        "A screening must start in the future.",
        422,
        "VALIDATION_ERROR",
        {
          startsAt: "Choose a future screening time.",
        },
      );
    }

    if (!movie.cities.includes(location.cinema.city)) {
      fail(
        "This movie is unavailable at the selected cinema.",
        422,
        "VALIDATION_ERROR",
      );
    }

    if (
      draft.spokenLanguage != null &&
      typeof draft.spokenLanguage !== "string"
    ) {
      fail(
        "Enter a valid spoken language.",
        422,
        "VALIDATION_ERROR",
      );
    }

    const subtitles = draft.subtitles ?? [];

    if (
      !Array.isArray(subtitles) ||
      subtitles.some((item) => typeof item !== "string")
    ) {
      fail(
        "Enter valid subtitle languages.",
        422,
        "VALIDATION_ERROR",
      );
    }

    return {
      movieId: movie.id,
      title: movie.title,
      city: location.cinema.city,
      roomId: location.room.id,
      roomName: location.room.name,
      capacity: location.room.capacity,
      date,
      time,
      spokenLanguage: draft.spokenLanguage?.trim() || null,
      subtitles: subtitles
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }

  /*
   * Translate cinema model messages into structured service errors.
   */

  // Translate store messages into useful API error codes.
  function throwScreeningError(message) {
    const lower = message.toLowerCase();

    if (lower.includes("overlap")) {
      fail(message, 409, "SCREENING_OVERLAP");
    }

    if (
      lower.includes("booking") ||
      lower.includes("reservation") ||
      lower.includes("hold") ||
      lower.includes("cancelled")
    ) {
      fail(message, 409, "SCREENING_LOCKED");
    }

    fail(message, 422, "VALIDATION_ERROR");
  }

  // Shared create/update logic; an ID means update.
  function saveScreening(id, draft, signal) {
    requireOwner(signal);

    if (id) {
      requireScreening(id);
    }

    const input = screeningDraft(draft);

    const previousIds = new Set(
      store.getSnapshot().screenings.map((item) => item.id),
    );

    const error = store.saveScreening({
      ...input,
      id,
    });

    if (error) {
      throwScreeningError(error);
    }

    const saved = id
      ? requireScreening(id)
      : store
          .getSnapshot()
          .screenings.find((item) => !previousIds.has(item.id));

    if (!saved) {
      fail(
        "The saved demo screening could not be found.",
        500,
        "INVALID_DEMO_DATA",
      );
    }

    return { data: screeningRecord(saved) };
  }

  /*
   * OWNER BOOKING RESPONSE
   *
   * Preserve the booking's stored details and amounts.
   * Contact details remain separate from customer account details.
   */

  // Format a stored booking for the owner booking pages.
  function bookingRecord(original) {
    const seats = [];
    const rowCount = original.room.capacity / 10;
    let number = 1;

    for (let index = 0; index < rowCount; index += 1) {
      const rowLabel = String(
        index >= 12 ? index + 2 : index + 1,
      );

      for (let column = 0; column < 10; column += 1) {
        if (number === 13) {
          number += 1;
        }

        if (original.seats.includes(number)) {
          seats.push({
            id: seatId(original.screening, number),
            label: String(number),
            rowLabel,
          });
        }

        number += 1;
      }
    }

    const adultSubtotalCents = Math.round(
      original.adultTotal * 100,
    );

    const childSubtotalCents = Math.round(
      original.childTotal * 100,
    );

    return {
      id: `booking-${original.reference}`,
      reference: original.reference,
      createdAt:
        original.createdAt == null
          ? null
          : new Date(original.createdAt).toISOString(),
      customer: {
        name: original.customer?.name ?? "",
        email: original.customer?.email ?? "",
      },
      isGuest: !original.ownerEmail,
      movie: {
        id: original.movie.id,
        title: original.movie.title,
        posterUrl: original.movie.poster ?? null,
      },
      cinema: {
        id: cinemaId(original.cinema),
        name: `Rio ${original.cinema}`,
        city: original.cinema,
      },
      room: {
        id: roomId(original.cinema, original.room.id),
        name: original.room.name,
      },
      screening: {
        id: original.screening.id,
        startsAt: demoScreeningInstant(
          original.screening.date,
          original.screening.time,
        ),
        status:
          original.screeningStatus ??
          original.screening.status,
      },
      seats,
      tickets: {
        adult: original.adultTickets,
        child: original.childTickets,
      },
      quote: {
        currency: "EUR",
        adultUnitPriceCents: Math.round(ticketPrice.adult * 100),
        childUnitPriceCents: Math.round(ticketPrice.child * 100),
        adultSubtotalCents,
        childSubtotalCents,
        totalCents: Math.round(original.total * 100),
      },
      bookingStatus: original.bookingStatus ?? "confirmed",
      paymentStatus: original.paymentStatus,
    };
  }

  /*
   * CASHIER ACCOUNT RESPONSE
   *
   * Names are separate fields, matching Marina's backend.
   * Assignments are read through dedicated service methods.
   * Passwords are never included in returned records.
   */

  // Return public cashier fields without exposing passwords.
  function cashierRecord(account) {
    return {
      id: account.id,
      firstName: account.firstName,
      lastName: account.lastName,
      email: account.email,
      role: "cashier",
      active: account.active,
      createdAt:
        account.createdAt == null
          ? null
          : new Date(account.createdAt).toISOString(),
    };
  }

  // Combine and clean the cashier's first and last names.
  function cashierFullName(account) {
    return [account.firstName, account.lastName]
      .filter((part) => typeof part === "string")
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");
  }

  /*
   * Read theater options from the existing catalogue.
   * No separate /owner/theaters backend endpoint is assumed.
   */

  // Collect every cinema page for theater selection.
  async function allTheaters(signal) {
    return collectPages(
      (query, options) =>
        demoCatalogue.listCinemas(query, options),
      { signal },
    );
  }

    // Public methods used by the owner dashboard and management pages.
  const service = {

    /*
     * Notify React when cinema data or staff accounts change.
     * Return a cleanup function to stop both subscriptions.
     */
    subscribe(listener) {
      const stopCinema = store.subscribe(listener);
      const stopStaff = demoStaffStore.subscribe(listener);

      return () => {
        stopCinema();
        stopStaff();
      };
    },

    // Expose the latest cinema and staff data to React.
    getCinemaSnapshot: store.getSnapshot,
    getStaffSnapshot: demoStaffStore.getSnapshot,

    /*
     * OWNER OVERVIEW PAGE
     *
     * Counts screenings and bookings for the selected Helsinki date.
     * Available-seat totals include future scheduled screenings.
     */
    async getOverview(
      { date = cinemaDate(now()) } = {},
      { signal } = {},
    ) {
      requireOwner(signal);
      validateDate(date);

      // Read the current cinema data.
      const snapshot = store.getSnapshot();

      // Include only scheduled screenings on the selected date.
      const scheduled = snapshot.screenings.filter(
        (screening) =>
          screening.date === date &&
          screening.status === "scheduled",
      );

      // Count available seats, excluding screenings already started.
      const availableSeatCount = scheduled.reduce(
        (total, screening) => {
          const startsAt = demoScreeningInstant(
            screening.date,
            screening.time,
          );

          if (Date.parse(startsAt) <= now()) {
            return total;
          }

          return (
            total +
            store.getAvailability(screening.id).available.length
          );
        },
        0,
      );

      // Count bookings for screenings on the selected date.
      const bookingCount = snapshot.bookings.filter(
        (booking) => booking.screening.date === date,
      ).length;

      return {
        data: {
          date,
          screeningCount: scheduled.length,
          bookingCount,
          availableSeatCount,
        },
      };
    },

    /*
     * SCREENING FORM: MOVIE OPTIONS
     *
     * Includes local movies that do not yet have screenings.
     */
    async listMovies(
      { search = "", page = 1, pageSize = 20 } = {},
      { signal } = {},
    ) {
      requireOwner(signal);

      const term = searchText(search);

      // Search movie titles and sort them alphabetically.
      const selected = movies
        .filter((movie) =>
          movie.title.toLowerCase().includes(term),
        )
        .sort(
          (a, b) =>
            a.title.localeCompare(b.title) ||
            a.id.localeCompare(b.id),
        );

      // Retrieve full movie details from the shared catalogue.
      const responses = await Promise.all(
        selected.map((movie) =>
          demoCatalogue.getMovie(movie.id, { signal }),
        ),
      );

      // Recheck access after asynchronous requests.
      requireOwner(signal);

      return paginate(
        responses.map((response) => response.data),
        { page, pageSize },
      );
    },

    /*
     * OWNER SCREENING MANAGEMENT PAGE
     *
     * Supports location, room, movie, date, status and title filters.
     */
    async listScreenings(
      {
        cinemaId: selectedCinemaId,
        roomId: selectedRoomId,
        movieId,
        date,
        status,
        search = "",
        page = 1,
        pageSize = 20,
      } = {},
      { signal } = {},
    ) {
      requireOwner(signal);
      validateCinema(selectedCinemaId);
      validateDate(date);

      const term = searchText(search);

      // Reject unknown rooms, movies, or screening statuses.
      if (selectedRoomId && !findRoom(selectedRoomId)) {
        fail("Choose a valid room.", 422, "VALIDATION_ERROR");
      }

      if (
        movieId &&
        !movies.some((movie) => movie.id === movieId)
      ) {
        fail("Choose a valid movie.", 422, "VALIDATION_ERROR");
      }

      if (
        status &&
        !["scheduled", "cancelled"].includes(status)
      ) {
        fail(
          "Choose a valid screening status.",
          422,
          "VALIDATION_ERROR",
        );
      }

      // Format, filter, and sort the stored screenings.
      const records = store
        .getSnapshot()
        .screenings.map(screeningRecord)
        .filter(
          (screening) =>
            screening.movieTitle.toLowerCase().includes(term) &&
            (!selectedCinemaId ||
              screening.cinemaId === selectedCinemaId) &&
            (!selectedRoomId ||
              screening.roomId === selectedRoomId) &&
            (!movieId || screening.movieId === movieId) &&
            (!date || cinemaDate(screening.startsAt) === date) &&
            (!status || screening.status === status),
        )
        .sort(
          (a, b) =>
            a.startsAt.localeCompare(b.startsAt) ||
            a.id.localeCompare(b.id),
        );

      return paginate(records, { page, pageSize });
    },

    // Create a screening using the shared save helper.
    async createScreening(draft, { signal } = {}) {
      return saveScreening(undefined, draft, signal);
    },

    // Update an existing screening using its ID.
    async updateScreening(
      screeningId,
      draft,
      { signal } = {},
    ) {
      return saveScreening(screeningId, draft, signal);
    },

    // Cancel a screening while keeping its history.
    async cancelScreening(screeningId, { signal } = {}) {
      requireOwner(signal);
      requireScreening(screeningId);

      const error = store.cancelScreening(screeningId);

      if (error) {
        throwScreeningError(error);
      }

      return {
        data: screeningRecord(requireScreening(screeningId)),
      };
    },

    // Delete a screening if the demo store allows it.
    async deleteScreening(screeningId, { signal } = {}) {
      requireOwner(signal);
      requireScreening(screeningId);

      const error = store.deleteScreening(screeningId);

      if (error) {
        throwScreeningError(error);
      }

      return null;
    },

    /*
     * OWNER BOOKINGS PAGE
     *
     * Searches completed customer booking records.
     * Staff unpaid reservations use their separate service.
     */
    async listBookings(
      {
        reference = "",
        cinemaId: selectedCinemaId,
        screeningId,
        date,
        page = 1,
        pageSize = 20,
      } = {},
      { signal } = {},
    ) {
      requireOwner(signal);
      validateCinema(selectedCinemaId);
      validateDate(date);

      const term = searchText(reference);

      if (screeningId) {
        requireScreening(screeningId);
      }

      // Filter bookings by reference, cinema, screening, and date.
      const records = store
        .getSnapshot()
        .bookings.filter(
          (booking) =>
            booking.reference.toLowerCase().includes(term) &&
            (!selectedCinemaId ||
              cinemaId(booking.cinema) === selectedCinemaId) &&
            (!screeningId ||
              booking.screening.id === screeningId) &&
            (!date || booking.screening.date === date),
        )
        .map(bookingRecord);

      return paginate(records, { page, pageSize });
    },

    // Find and format one booking using its reference.
    async getBooking(reference, { signal } = {}) {
      requireOwner(signal);

      const original = store
        .getSnapshot()
        .bookings.find(
          (booking) => booking.reference === reference,
        );

      if (!original) {
        fail("Booking not found.", 404, "NOT_FOUND");
      }

      return { data: bookingRecord(original) };
    },

    /*
     * CASHIER ACCOUNTS PAGE: LIST
     *
     * Search cashier accounts by name or email.
     * Optionally filter by active status.
     */
    async listCashiers(
      {
        search = "",
        active,
        page = 1,
        pageSize = 20,
      } = {},
      { signal } = {},
    ) {
      requireOwner(signal);

      const term = searchText(search);

      // The active filter must be true, false, or omitted.
      if (
        active !== undefined &&
        typeof active !== "boolean"
      ) {
        fail(
          "Choose a valid account status.",
          422,
          "VALIDATION_ERROR",
        );
      }

      // Find matching cashiers, sort by name, and format results.
      const records = demoStaffStore
        .getSnapshot()
        .accounts.filter(
          (account) =>
            account.role === "cashier" &&
            (
              cashierFullName(account).toLowerCase().includes(term) ||
              account.email.toLowerCase().includes(term)
            ) &&
            (active === undefined || account.active === active),
        )
        .sort(
          (a, b) =>
            cashierFullName(a).localeCompare(cashierFullName(b)) ||
            a.id.localeCompare(b.id),
        )
        .map(cashierRecord);

      return paginate(records, { page, pageSize });
    },

    /*
     * CASHIER ACCOUNTS PAGE: CREATE
     *
     * A new cashier starts with theaterId: null in the staff model.
     * Theater assignment is a separate operation.
     */
    async createCashier(
      { firstName, lastName, email, password },
      { signal } = {},
    ) {
      requireOwner(signal);

      // Clean names and normalize the email before validation.
      const cleanedFirstName =
        typeof firstName === "string" ? firstName.trim() : "";

      const cleanedLastName =
        typeof lastName === "string" ? lastName.trim() : "";

      const normalisedEmail =
        typeof email === "string"
          ? email.trim().toLowerCase()
          : "";

      // Collect field errors so the form can display them.
      const fieldErrors = {};

      if (!cleanedFirstName || cleanedFirstName.length > 100) {
        fieldErrors.firstName =
          "Enter a first name between 1 and 100 characters.";
      }

      if (!cleanedLastName || cleanedLastName.length > 100) {
        fieldErrors.lastName =
          "Enter a last name between 1 and 100 characters.";
      }

      if (
        normalisedEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalisedEmail)
      ) {
        fieldErrors.email = "Enter a valid email address.";
      }

      // Passwords are checked by length but never trimmed.
      if (
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128
      ) {
        fieldErrors.password =
          "Use a password between 8 and 128 characters.";
      }

      if (Object.keys(fieldErrors).length > 0) {
        fail(
          "Please check the highlighted fields.",
          422,
          "VALIDATION_ERROR",
          fieldErrors,
        );
      }

      // Prevent multiple staff accounts from using the same email.
      const duplicate = demoStaffStore
        .getSnapshot()
        .accounts.some(
          (account) => account.email === normalisedEmail,
        );

      if (duplicate) {
        fail(
          "A staff account already uses this email address.",
          409,
          "EMAIL_IN_USE",
          {
            email: "This email is already used by a staff account.",
          },
        );
      }

      // Save the new cashier in the shared demo staff store.
      const result = demoStaffStore.createCashier({
        firstName: cleanedFirstName,
        lastName: cleanedLastName,
        email: normalisedEmail,
        password,
      });

      if (result.error) {
        fail(result.error, 422, "VALIDATION_ERROR");
      }

      return { data: cashierRecord(result.account) };
    },

    /*
     * CASHIER ACCOUNTS PAGE: ACTIVATE / DEACTIVATE
     *
     * Keeps the existing assignment and reservation history.
     */
    async setCashierActive(
      cashierId,
      active,
      { signal } = {},
    ) {
      requireOwner(signal);
      requireCashier(cashierId);

      if (typeof active !== "boolean") {
        fail(
          "Choose a valid account status.",
          422,
          "VALIDATION_ERROR",
        );
      }

      // Update the account status in the shared staff store.
      const result = demoStaffStore.setCashierActive(
        cashierId,
        active,
      );

      if (result.error) {
        fail(result.error, 409, "REQUEST_FAILED");
      }

      return { data: cashierRecord(result.account) };
    },

    /*
     * THEATER ASSIGNMENT EDITOR: OPTIONS
     *
     * Reads the same location records as the public catalogue.
     * Pagination is retained for existing frontend callers.
     */
    async listTheaters(
      { page = 1, pageSize = 20 } = {},
      { signal } = {},
    ) {
      requireOwner(signal);

      const records = await allTheaters(signal);

      requireOwner(signal);

      return paginate(records, { page, pageSize });
    },

    /*
     * THEATER ASSIGNMENT EDITOR: CURRENT ASSIGNMENT
     *
     * Reads the canonical account.theaterId.
     * Returns zero or one theater.
     *
     * Local pagination metadata keeps collectPages callers working.
     * Marina's backend returns an unpaginated data array; its API
     * adapter will handle that difference separately.
     */
    async listCashierTheaters(
      cashierId,
      { page = 1, pageSize = 20 } = {},
      { signal } = {},
    ) {
      requireOwner(signal);
      requireCashier(cashierId);

      const theaters = await allTheaters(signal);

      requireOwner(signal);

      // Read the latest account after awaiting the theater list.
      const account = requireCashier(cashierId);

      // Return only the theater assigned to this cashier.
      const records = theaters.filter(
        (theater) => theater.id === account.theaterId,
      );

      return paginate(records, { page, pageSize });
    },

    /*
     * THEATER ASSIGNMENT EDITOR: SAVE ONE THEATER
     *
     * Replaces the previous assignment.
     * An inactive cashier may still be assigned a theater.
     *
     * This method requires a real theater ID. Backend support
     * for clearing an assignment has not yet been confirmed.
     *
     * Confirmed response shape:
     * { data: [theater] }
     */
    async setCashierTheater(
      cashierId,
      theaterId,
      { signal } = {},
    ) {
      requireOwner(signal);
      requireCashier(cashierId);

      // Require one non-empty theater ID.
      if (
        typeof theaterId !== "string" ||
        theaterId.trim() === ""
      ) {
        fail(
          "Choose one theater.",
          422,
          "VALIDATION_ERROR",
          {
            theaterId:
              "Select a theater from the available options.",
          },
        );
      }

      // Load valid theaters before saving the assignment.
      const theaters = await allTheaters(signal);

      // Recheck permissions after asynchronous work.
      requireOwner(signal);
      requireCashier(cashierId);

      const theater = theaters.find(
        (item) => item.id === theaterId,
      );

      if (!theater) {
        fail(
          "The selected theater does not exist.",
          422,
          "VALIDATION_ERROR",
          {
            theaterId:
              "Select a theater from the available options.",
          },
        );
      }

      // Replace the cashier's previous theater assignment.
      const result = demoStaffStore.setCashierTheater(
        cashierId,
        theaterId,
      );

      if (result.error) {
        fail(
          result.error,
          422,
          "VALIDATION_ERROR",
          {
            theaterId: result.error,
          },
        );
      }

      return {
        data: [{ ...theater }],
      };
    },

    /*
     * TEMPORARY COMPATIBILITY METHOD
     *
     * The current checkbox editor still calls setCashierTheaters().
     * Keep it until that editor is updated to use the singular method.
     *
     * More than one ID is rejected without changing the assignment.
     * The legacy summary keeps the current onSaved handler working.
     *
     * [] retains the previous DEMO-ONLY clearing behavior.
     * This is not a confirmed backend request format.
     */
    async setCashierTheaters(
      cashierId,
      theaterIds,
      { signal } = {},
    ) {
      requireOwner(signal);
      requireCashier(cashierId);

      // Copy the caller's array before any asynchronous work.
      const requestedIds = Array.isArray(theaterIds)
        ? [...theaterIds]
        : null;

      // Allow zero or one valid theater ID, but never multiple.
      if (
        !requestedIds ||
        requestedIds.length > 1 ||
        requestedIds.some(
          (id) =>
            typeof id !== "string" ||
            id.trim() === "",
        )
      ) {
        fail(
          "A cashier can have only one theater.",
          422,
          "VALIDATION_ERROR",
          {
            theaterIds: "Select at most one theater.",
          },
        );
      }

      if (requestedIds.length === 1) {
        // Use the newer method when one theater is selected.
        await service.setCashierTheater(
          cashierId,
          requestedIds[0],
          { signal },
        );
      } else {
        // Temporary support for clearing assignments in demo mode.
        const result = demoStaffStore.setCashierTheater(
          cashierId,
          null,
        );

        if (result.error) {
          fail(
            result.error,
            422,
            "VALIDATION_ERROR",
            {
              theaterIds: result.error,
            },
          );
        }
      }

      // Return the response expected by the older checkbox editor.
      return {
        data: {
          cashierId,
          theaterIds: requestedIds,
        },
      };
    },
  };

  // Make all owner service methods available to the frontend.
  return service;
}
