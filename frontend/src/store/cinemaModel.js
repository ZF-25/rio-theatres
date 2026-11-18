/*
 * FILE: frontend/src/store/cinemaModel.js
 *
 * The shared in-memory data model for the cinema demo.
 * Manages screenings, seat availability, temporary checkout holds,
 * simulated bookings, and unpaid staff reservations.
 *
 * Screening dates and times are interpreted in Europe/Helsinki,
 * regardless of the computer's time zone.
 *
 * Services can adapt this data for customer, owner, and staff pages.
 * The store itself does not enforce account permissions.
 * Everything is kept in memory and resets on a full refresh.
 */

import {
  cinemas,
  rooms,
  ticketPrice,
  createRows,
} from "../data/cinema.js";

import {
  cinemaDate,
  demoScreeningInstant,
} from "../utils/cinemaTime.js";

// Checkout holds last for a maximum of 15 minutes.
const HOLD_DURATION = 15 * 60 * 1000;


/*
 * CREATE CINEMA STORE
 *
 * Creates the demo store using the provided movie records.
 *
 * options.now allows tests to control the current time.
 * options.makeId allows tests to control generated IDs.
 *
 * By default, Date.now() provides the time and
 * crypto.randomUUID() generates unique identifiers.
 */
export function createCinemaStore(movies, options = {}) {
  const now = options.now ?? (() => Date.now());

  const makeId =
    options.makeId ??
    (() => globalThis.crypto.randomUUID());

  /*
   * STORE SUBSCRIPTIONS
   *
   * listeners contains functions that should run when data changes.
   * expiryInterval tracks the timer used to remove expired holds.
   */
  const listeners = new Set();
  let expiryInterval = null;


  /*
   * FIND RECORDS BY ID
   *
   * These helpers search the existing movie and screening records.
   *
   * find() returns the matching object or undefined if not found.
   */
  function movieById(id) {
    return movies.find((movie) => movie.id === id);
  }

  function screeningById(id) {
    return state.screenings.find(
      (screening) => screening.id === id,
    );
  }


  /*
   * SCREENING START TIME
   *
   * Converts the screening's Helsinki date and time
   * into a timestamp measured in milliseconds.
   *
   * Returns NaN if the date or time cannot be converted.
   * This allows later validation to reject invalid screenings.
   */
  function screeningStart(screening) {
    try {
      return Date.parse(
        demoScreeningInstant(
          screening.date,
          screening.time,
        ),
      );
    } catch {
      return NaN;
    }
  }


  /*
   * SCREENING END TIME
   *
   * Finds the movie's duration and adds it to the start time.
   *
   * Multiplying by 60 * 1000 converts minutes into milliseconds.
   *
   * If the movie is missing, the calculation produces NaN.
   */
  function screeningEnd(screening) {
    const duration =
      movieById(screening.movieId)?.duration ?? NaN;

    return screeningStart(screening) + duration * 60 * 1000;
  }


  /*
   * GENERATE INITIAL SCREENINGS
   *
   * Creates an example cinema programme covering seven
   * Helsinki calendar dates, starting from today.
   *
   * Each eligible movie is scheduled in the available rooms.
   *
   * UTC date methods are used only to advance calendar dates.
   * Actual screening times are interpreted in Helsinki time.
   */
  const initialScreenings = [];

  // Starting times assigned to the first five demo movies.
  const times = [
    "10:00",
    "12:15",
    "14:30",
    "17:00",
    "19:15",
  ];

  // Gets today's date according to the Helsinki time zone.
  const firstDate = cinemaDate(now());

  /*
   * BUILD SEVEN DAYS OF SCREENINGS
   *
   * The outer loop moves through seven calendar dates.
   * The inner loops visit every cinema and room.
   *
   * Only movies available in the selected city are included.
   *
   * Each screening receives an ID, movie information,
   * room information, date, time, and scheduled status.
   */
  for (let day = 0; day < 7; day += 1) {
    const calendar = new Date(`${firstDate}T12:00:00Z`);
    calendar.setUTCDate(calendar.getUTCDate() + day);

    const date = calendar.toISOString().slice(0, 10);

    for (const city of cinemas) {
      for (const room of rooms) {
        movies.slice(0, 5).forEach((movie, index) => {
          if (!movie.cities.includes(city)) return;

          initialScreenings.push({
            id: `seed-${date}-${city}-${room.id}-${movie.id}`,
            movieId: movie.id,
            title: movie.title,
            city,
            roomId: room.id,
            roomName: room.name,
            capacity: room.capacity,
            date,
            time: times[index],
            status: "scheduled",
          });
        });
      }
    }
  }


  /*
   * INITIAL STORE STATE
   *
   * Contains the information managed by the demo application.
   *
   * screenings: Available and cancelled cinema screenings.
   * bookings: Completed simulated customer purchases.
   * holds: Seats temporarily held during checkout.
   * reservations: Unpaid reservations created by staff.
   *
   * The arrays start empty except for generated screenings.
   */
  let state = {
    screenings: initialScreenings,
    bookings: [],
    holds: [],
    reservations: [],
  };


  /*
   * PUBLISH STATE CHANGES
   *
   * Replaces the current state with an updated state object.
   *
   * Then calls every subscribed listener to notify React
   * components that the store has changed.
   */
  function publish(nextState) {
    state = nextState;

    listeners.forEach((listener) => {
      listener();
    });
  }


  /*
   * REMOVE EXPIRED CHECKOUT HOLDS
   *
   * Finds holds that have not yet expired.
   *
   * If expired holds were found, updates the store
   * and notifies subscribed components.
   *
   * Expired holds already stop blocking seats during
   * availability checks, even before this cleanup runs.
   */
  function removeExpiredHolds() {
    const currentTime = now();

    const remainingHolds = state.holds.filter(
      (hold) => hold.expiresAt > currentTime,
    );

    if (remainingHolds.length !== state.holds.length) {
      publish({
        ...state,
        holds: remainingHolds,
      });
    }
  }


  /*
   * SUBSCRIBE TO STORE CHANGES
   *
   * Adds a listener that runs whenever the store changes.
   *
   * Starts a timer that checks for expired holds every second.
   *
   * Returns a cleanup function that removes the listener.
   * The timer stops when no listeners remain.
   *
   * React can use this with useSyncExternalStore().
   */
  function subscribe(listener) {
    listeners.add(listener);

    if (expiryInterval === null) {
      expiryInterval = setInterval(
        removeExpiredHolds,
        1000,
      );
    }

    return () => {
      listeners.delete(listener);

      if (
        listeners.size === 0 &&
        expiryInterval !== null
      ) {
        clearInterval(expiryInterval);
        expiryInterval = null;
      }
    };
  }


  /*
   * CALCULATE SEAT AVAILABILITY
   *
   * Determines which seats are available for a screening.
   *
   * Seats can be:
   * - Available for customers.
   * - Already booked.
   * - Temporarily held during checkout.
   * - Reserved by staff.
   * - Permanently reserved for the owner.
   *
   * Seat 1 is always reserved for the owner in demo mode.
   *
   * excludeHoldId and excludeReservationId allow an existing
   * hold or reservation to keep its own seats during validation.
   */
  function getAvailability(
    screeningId,
    {
      excludeHoldId = null,
      excludeReservationId = null,
    } = {},
  ) {
    const screening = screeningById(screeningId);

    /*
     * INVALID OR CANCELLED SCREENING
     *
     * If the screening does not exist or is cancelled,
     * return empty seat lists.
     */
    if (!screening || screening.status === "cancelled") {
      return {
        available: [],
        booked: [],
        reserved: [],
        held: [],
        temporaryHeld: [],
        staffReserved: [],
      };
    }

    /*
     * CREATE PHYSICAL SEAT LIST
     *
     * createRows() generates seat rows based on room capacity.
     * flatMap() combines all row seats into one array.
     */
    const physicalSeats = createRows(screening.capacity)
      .flatMap((row) => row.seats);

    /*
     * FIND BOOKED SEATS
     *
     * Includes seats from confirmed bookings belonging
     * to this screening.
     *
     * Cancelled bookings and cancelled screenings are excluded.
     *
     * Set makes checking whether a seat is booked efficient.
     */
    const bookedSeats = new Set(
      state.bookings
        .filter(
          (booking) =>
            booking.screening.id === screeningId &&
            booking.screeningStatus !== "cancelled" &&
            booking.bookingStatus !== "cancelled",
        )
        .flatMap((booking) => booking.seats),
    );

    /*
     * FIND TEMPORARILY HELD SEATS
     *
     * Includes seats held by active checkout sessions.
     *
     * Expired holds are ignored.
     * excludeHoldId can exclude a customer's own hold.
     */
    const temporarilyHeldSeats = new Set(
      state.holds
        .filter(
          (hold) =>
            hold.screeningId === screeningId &&
            hold.id !== excludeHoldId &&
            hold.expiresAt > now(),
        )
        .flatMap((hold) => hold.seats),
    );

    /*
     * FIND STAFF-RESERVED SEATS
     *
     * Includes seats from active staff reservations.
     *
     * Cancelled reservations are ignored.
     * excludeReservationId can exclude a reservation
     * when staff are updating its selected seats.
     */
    const staffReservedSeats = new Set(
      state.reservations
        .filter(
          (reservation) =>
            reservation.screeningId === screeningId &&
            reservation.id !== excludeReservationId &&
            reservation.status === "active",
        )
        .flatMap((reservation) => reservation.seats),
    );

    /*
     * RETURN SEAT CATEGORIES
     *
     * available excludes booked, held, reserved, and owner seats.
     *
     * booked contains seats from confirmed bookings.
     * reserved contains the owner's reserved seat.
     *
     * held combines temporary holds and staff reservations
     * for compatibility with older demo components.
     *
     * temporaryHeld and staffReserved keep those categories separate.
     */
    return {
      available: physicalSeats.filter(
        (seat) =>
          seat !== 1 &&
          !bookedSeats.has(seat) &&
          !temporarilyHeldSeats.has(seat) &&
          !staffReservedSeats.has(seat),
      ),

      booked: physicalSeats.filter(
        (seat) => bookedSeats.has(seat),
      ),

      reserved: [1],

      // Combined held-seat list for older demo components.
      held: physicalSeats.filter(
        (seat) =>
          temporarilyHeldSeats.has(seat) ||
          staffReservedSeats.has(seat),
      ),

      temporaryHeld: physicalSeats.filter(
        (seat) => temporarilyHeldSeats.has(seat),
      ),

      staffReserved: physicalSeats.filter(
        (seat) => staffReservedSeats.has(seat),
      ),
    };
  }


  /*
   * VALIDATE SELECTED SEATS
   *
   * Checks that:
   * - The screening exists and is scheduled.
   * - At least one seat was selected.
   * - Seat numbers are valid integers.
   * - No seat was selected more than once.
   * - Every selected seat is currently available.
   *
   * Returns an error message if invalid, or null if valid.
   */
  function validateSeats(
    screeningId,
    seats,
    exclusions = {},
  ) {
    const screening = screeningById(screeningId);

    if (!screening || screening.status !== "scheduled") {
      return "This screening is no longer available.";
    }

    if (
      !Array.isArray(seats) ||
      seats.length === 0 ||
      new Set(seats).size !== seats.length ||
      seats.some((seat) => !Number.isInteger(seat))
    ) {
      return "Choose valid seats.";
    }

    /*
     * CHECK CURRENT AVAILABILITY
     *
     * Converts available seats into a Set.
     *
     * some() checks whether any selected seat is unavailable.
     */
    const available = new Set(
      getAvailability(screeningId, exclusions).available,
    );

    if (seats.some((seat) => !available.has(seat))) {
      return (
        "One or more seats are no longer available. " +
        "Please choose again."
      );
    }

    return null;
  }


  /*
   * VALIDATE CUSTOMER SELECTION
   *
   * Checks the complete selection before checkout or booking.
   *
   * Verifies that:
   * - The screening still exists.
   * - Its schedule has not changed.
   * - The selected seats are available.
   * - Ticket quantities match the selected seats.
   *
   * Returns an error message or null when valid.
   */
  function validateCustomerSelection(
    selection,
    exclusions = {},
  ) {
    const screening = screeningById(
      selection.screening?.id,
    );

    if (!screening || screening.status !== "scheduled") {
      return "This screening is no longer available.";
    }

    /*
     * CHECK SCREENING CHANGES
     *
     * Compares the customer's saved screening information
     * with the latest information in the store.
     *
     * If the movie, cinema, room, date, or time changed,
     * the customer must select the screening again.
     */
    const screeningChanged = [
      "movieId",
      "city",
      "roomId",
      "date",
      "time",
    ].some(
      (field) =>
        selection.screening[field] !== screening[field],
    );

    if (screeningChanged) {
      return (
        "The screening schedule has changed. " +
        "Return to movie details and choose it again."
      );
    }

    // Rechecks availability before allowing checkout.
    const seatError = validateSeats(
      screening.id,
      selection.seats,
      exclusions,
    );

    if (seatError) return seatError;

    /*
     * CHECK TICKET QUANTITIES
     *
     * Both adult and child ticket counts must be
     * non-negative integers.
     *
     * Their total must equal the number of selected seats.
     */
    const {
      adultTickets: adults,
      childTickets: children,
    } = selection;

    if (
      !Number.isInteger(adults) ||
      !Number.isInteger(children) ||
      adults < 0 ||
      children < 0 ||
      adults + children !== selection.seats.length
    ) {
      return "Ticket quantities must match your selected seats.";
    }

    return null;
  }


  /*
   * FIND RELATED BOOKING RECORDS
   *
   * Returns all bookings connected to a screening.
   *
   * Used to prevent deleting or editing screenings
   * that already have booking history.
   */
  function linkedBookings(screeningId) {
    return state.bookings.filter(
      (booking) => booking.screening.id === screeningId,
    );
  }


  /*
   * FIND RELATED STAFF RESERVATIONS
   *
   * Returns reservations connected to a screening.
   *
   * Used when checking whether a screening can be
   * edited or deleted.
   */
  function linkedReservations(screeningId) {
    return state.reservations.filter(
      (reservation) => reservation.screeningId === screeningId,
    );
  }


  /*
   * CHECK FOR ACTIVE CHECKOUT HOLDS
   *
   * some() returns true if the screening has at least
   * one checkout hold that has not expired.
   */
  function hasActiveHolds(screeningId) {
    return state.holds.some(
      (hold) =>
        hold.screeningId === screeningId &&
        hold.expiresAt > now(),
    );
  }


  /*
   * CREATE OR UPDATE SCREENING
   *
   * Saves a new screening or updates an existing one.
   *
   * Before saving, checks:
   * - The existing screening has not been cancelled.
   * - No bookings, reservations, or active holds prevent editing.
   * - The movie, cinema, and room are valid.
   * - The date and time are valid.
   * - The screening does not overlap another screening.
   *
   * Returns an error message on failure or null on success.
   */
  function saveScreening(draft) {
    const original = screeningById(draft.id);

    // An ID was supplied, but the screening no longer exists.
    if (draft.id && !original) {
      return "This screening no longer exists.";
    }

    // Cancelled screenings cannot be edited.
    if (original?.status === "cancelled") {
      return "Cancelled screenings cannot be edited.";
    }

    /*
     * PROTECT EXISTING BOOKINGS
     *
     * Prevents editing screenings that already have
     * bookings, staff reservations, or active checkout holds.
     *
     * This avoids changing screening details after
     * customers or staff have selected seats.
     */
    if (
      original &&
      (
        linkedBookings(original.id).length > 0 ||
        linkedReservations(original.id).length > 0 ||
        hasActiveHolds(original.id)
      )
    ) {
      return (
        "This screening has bookings, reservations, or " +
        "active checkout holds and cannot be edited."
      );
    }

    // Finds the selected movie and room.
    const movie = movieById(draft.movieId);

    const room = rooms.find(
      (item) => item.id === draft.roomId,
    );

    /*
     * VALIDATE MOVIE, CINEMA, AND ROOM
     *
     * Checks that the movie and room exist,
     * the cinema is recognised, and the movie
     * is available in the selected city.
     */
    if (
      !movie ||
      !room ||
      !cinemas.includes(draft.city) ||
      !movie.cities.includes(draft.city)
    ) {
      return "Choose a valid movie, cinema, and room.";
    }

    /*
     * VALIDATE DATE AND TIME FORMAT
     *
     * Regular expressions check that:
     * - Date follows YYYY-MM-DD.
     * - Time follows 24-hour HH:MM.
     */
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)
    ) {
      return "Enter a valid date and start time.";
    }

    /*
     * PREPARE SCREENING
     *
     * Combines the draft information with the
     * movie title, room name, and room capacity.
     */
    const candidate = {
      ...draft,
      title: movie.title,
      roomName: room.name,
      capacity: room.capacity,
    };

    /*
     * VALIDATE ACTUAL SCREENING TIME
     *
     * Confirms that the start and end times can
     * be converted into valid timestamps.
     */
    if (
      !Number.isFinite(screeningStart(candidate)) ||
      !Number.isFinite(screeningEnd(candidate))
    ) {
      return "Invalid screening date.";
    }

    /*
     * CHECK SCREENING OVERLAPS
     *
     * Searches for another scheduled screening
     * in the same cinema and room.
     *
     * Two screenings overlap when each starts
     * before the other one ends.
     *
     * The screening being edited is excluded.
     */
    const conflict = state.screenings.find(
      (screening) =>
        screening.status === "scheduled" &&
        screening.id !== draft.id &&
        screening.city === draft.city &&
        screening.roomId === draft.roomId &&
        screeningStart(candidate) < screeningEnd(screening) &&
        screeningStart(screening) < screeningEnd(candidate),
    );

    if (conflict) {
      return (
        `This screening overlaps ${conflict.title} ` +
        `on ${conflict.date} at ${conflict.time}.`
      );
    }

    /*
     * SAVE SCREENING
     *
     * Existing screenings keep their original ID.
     * New screenings receive a generated ID.
     *
     * All successfully saved screenings have
     * the status "scheduled".
     */
    const saved = {
      ...candidate,
      id: original?.id ?? makeId(),
      status: "scheduled",
    };

    /*
     * UPDATE STORE
     *
     * If editing, map() replaces the matching screening.
     * If creating, the new screening is added to the array.
     *
     * publish() saves the change and notifies subscribers.
     */
    publish({
      ...state,
      screenings: original
        ? state.screenings.map((screening) =>
            screening.id === saved.id ? saved : screening,
          )
        : [...state.screenings, saved],
    });

    return null;
  }


  /*
   * CANCEL SCREENING
   *
   * Cancels a screening without deleting its history.
   *
   * Also:
   * - Marks linked bookings as cancelled.
   * - Removes active checkout holds.
   * - Cancels active staff reservations.
   *
   * Returns an error message if the screening is missing,
   * or null after successful cancellation.
   */
  function cancelScreening(id) {
    if (!screeningById(id)) {
      return "Screening not found.";
    }

    publish({
      ...state,

      // Marks the selected screening as cancelled.
      screenings: state.screenings.map((screening) =>
        screening.id === id
          ? { ...screening, status: "cancelled" }
          : screening,
      ),

      // Updates linked bookings while preserving their records.
      bookings: state.bookings.map((booking) =>
        booking.screening.id === id
          ? {
              ...booking,
              screeningStatus: "cancelled",
              screening: {
                ...booking.screening,
                status: "cancelled",
              },
            }
          : booking,
      ),

      // Releases all checkout holds for this screening.
      holds: state.holds.filter(
        (hold) => hold.screeningId !== id,
      ),

      // Cancels active staff reservations for this screening.
      reservations: state.reservations.map((reservation) =>
        reservation.screeningId === id &&
        reservation.status === "active"
          ? {
              ...reservation,
              status: "cancelled",
              cancellationReason: "Screening cancelled",
              cancelledAt: now(),
            }
          : reservation,
      ),
    });

    return null;
  }


  /*
   * DELETE SCREENING
   *
   * Permanently removes a screening from the demo store.
   *
   * Deletion is only allowed when there are no
   * booking records, staff reservations, or active holds.
   *
   * If history exists, the screening must be cancelled instead.
   *
   * Returns an error message or null on success.
   */
  function deleteScreening(id) {
    if (!screeningById(id)) {
      return "Screening not found.";
    }

    // Preserve screenings that have booking or reservation history.
    if (
      linkedBookings(id).length > 0 ||
      linkedReservations(id).length > 0
    ) {
      return (
        "Screenings with booking or reservation records " +
        "cannot be deleted. Cancel the screening instead."
      );
    }

    // Active checkout holds must expire or be cancelled first.
    if (hasActiveHolds(id)) {
      return (
        "This screening has active checkout holds. " +
        "Wait for them to expire or cancel the screening."
      );
    }

    /*
     * REMOVE SCREENING
     *
     * filter() removes the matching screening and its holds.
     * publish() updates the store and notifies subscribers.
     */
    publish({
      ...state,
      screenings: state.screenings.filter(
        (screening) => screening.id !== id,
      ),
      holds: state.holds.filter(
        (hold) => hold.screeningId !== id,
      ),
    });

    return null;
  }

    /*
   * CREATE CHECKOUT HOLD
   *
   * Temporarily reserves selected seats during checkout.
   *
   * First validates the screening, seats, and ticket quantities.
   *
   * The hold lasts for up to 15 minutes but cannot
   * continue beyond the screening's starting time.
   *
   * Other customers cannot select seats under an active hold.
   *
   * Returns the updated selection or an error message.
   */
  function createCheckoutHold(selection) {
    const error = validateCustomerSelection(selection);

    if (error) return { error };

    const screening = screeningById(
      selection.screening.id,
    );

    /*
     * CREATE HOLD RECORD
     *
     * Generates a unique ID and stores the selected seats.
     *
     * sort() arranges seat numbers in ascending order.
     *
     * Math.min() chooses the earlier of:
     * - 15 minutes from now.
     * - The screening's starting time.
     */
    const hold = {
      id: makeId(),
      screeningId: screening.id,
      seats: [...selection.seats].sort((a, b) => a - b),
      adultTickets: selection.adultTickets,
      childTickets: selection.childTickets,
      createdAt: now(),
      expiresAt: Math.min(
        now() + HOLD_DURATION,
        screeningStart(screening),
      ),
    };

    // Adds the new hold and notifies subscribed components.
    publish({
      ...state,
      holds: [...state.holds, hold],
    });

    /*
     * RETURN UPDATED SELECTION
     *
     * Includes the latest screening information,
     * the hold ID, and its expiration time.
     *
     * Checkout uses this information to complete the booking.
     */
    return {
      selection: {
        ...selection,
        screening: { ...screening },
        holdId: hold.id,
        expiresAt: hold.expiresAt,
      },
    };
  }


  /*
   * RELEASE CHECKOUT HOLD
   *
   * Removes a temporary seat hold from the store.
   *
   * This makes its seats available again,
   * provided they are not booked or reserved elsewhere.
   *
   * Missing or already released holds are safely ignored.
   */
  function releaseCheckoutHold(holdId) {
    if (!holdId) return;

    if (!state.holds.some((hold) => hold.id === holdId)) {
      return;
    }

    publish({
      ...state,
      holds: state.holds.filter(
        (hold) => hold.id !== holdId,
      ),
    });
  }


  /*
   * CREATE SIMULATED BOOKING
   *
   * Completes the demo checkout process.
   *
   * Validates the customer's seat hold and selection,
   * calculates ticket prices, and creates a booking record.
   *
   * The booking receives a reference number and timestamp.
   *
   * No real payment is processed.
   *
   * ownerEmail optionally identifies the customer
   * associated with the booking.
   */
  function createBooking(selection, ownerEmail = null) {
    let hold = null;

    /*
     * VALIDATE CHECKOUT HOLD
     *
     * If the selection includes a hold ID,
     * find the corresponding hold in the store.
     *
     * The hold must:
     * - Exist.
     * - Not have expired.
     * - Belong to the selected screening.
     */
    if (selection.holdId) {
      hold = state.holds.find(
        (item) => item.id === selection.holdId,
      );

      if (
        !hold ||
        hold.expiresAt <= now() ||
        hold.screeningId !== selection.screening?.id
      ) {
        return {
          error:
            "Your seat hold has expired or been released. " +
            "Return to seat selection.",
        };
      }

      /*
       * CHECK HELD SEATS
       *
       * Confirms that the customer's selected seats
       * match the seats stored in the hold.
       *
       * Ticket quantities must also remain unchanged.
       *
       * This prevents a checkout selection from being
       * changed after its seats were held.
       */
      const sameSeats =
        Array.isArray(selection.seats) &&
        selection.seats.length === hold.seats.length &&
        selection.seats.every(
          (seat) => hold.seats.includes(seat),
        );

      if (
        !sameSeats ||
        selection.adultTickets !== hold.adultTickets ||
        selection.childTickets !== hold.childTickets
      ) {
        return {
          error:
            "Your selection does not match the held seats. " +
            "Return to seat selection.",
        };
      }
    } else if (
      !Number.isFinite(selection.expiresAt) ||
      selection.expiresAt <= now()
    ) {
      /*
       * OLDER CHECKOUT COMPATIBILITY
       *
       * Some older checkout selections use an expiration
       * timestamp instead of a stored hold ID.
       *
       * Rejects these selections when their timer has expired.
       */
      return {
        error:
          "Your checkout timer has expired. " +
          "Return to seat selection.",
      };
    }

    /*
     * REVALIDATE CUSTOMER SELECTION
     *
     * Checks the screening, seats, and ticket quantities again.
     *
     * excludeHoldId allows the customer to book seats
     * currently protected by their own active hold.
     */
    const error = validateCustomerSelection(selection, {
      excludeHoldId: hold?.id,
    });

    if (error) return { error };

    // Retrieves the current screening and room information.
    const screening = screeningById(
      selection.screening.id,
    );

    const room = rooms.find(
      (item) => item.id === screening.roomId,
    );

    /*
     * CALCULATE TICKET TOTALS
     *
     * Multiplies the number of adult and child tickets
     * by their corresponding prices.
     *
     * The final booking total is the sum of both amounts.
     */
    const adultTotal =
      selection.adultTickets * ticketPrice.adult;

    const childTotal =
      selection.childTickets * ticketPrice.child;

    /*
     * CREATE BOOKING RECORD
     *
     * Stores the selected movie, cinema, room, and screening.
     *
     * Also includes:
     * - Sorted seat numbers.
     * - Ticket totals.
     * - Unique booking reference.
     * - Purchase timestamp.
     * - Optional customer email.
     * - Booking and payment statuses.
     *
     * The payment status is "simulated" because no
     * real payment transaction takes place.
     */
    const booking = {
      ...selection,
      movie: movieById(screening.movieId),
      cinema: screening.city,
      room: { ...room },
      screening: { ...screening },
      seats: [...selection.seats].sort((a, b) => a - b),
      adultTotal,
      childTotal,
      total: adultTotal + childTotal,
      reference: `RIO-DEMO-${makeId().toUpperCase()}`,
      createdAt: now(),
      ownerEmail:
        ownerEmail?.trim().toLowerCase() ?? null,
      paymentStatus: "simulated",
      screeningStatus: "scheduled",
      bookingStatus: "confirmed",
    };

    /*
     * SAVE BOOKING
     *
     * Adds the new booking to the beginning of the booking list.
     *
     * Removes the checkout hold because the seats
     * are now protected by the confirmed booking.
     *
     * publish() updates the store and notifies subscribers.
     */
    publish({
      ...state,
      bookings: [booking, ...state.bookings],
      holds: state.holds.filter(
        (item) => item.id !== hold?.id,
      ),
    });

    return { booking };
  }


  /*
   * CREATE STAFF RESERVATION
   *
   * Allows staff to reserve seats without taking payment.
   *
   * First checks that the selected seats are available.
   *
   * Stores customer information, selected seats,
   * staff email, and creation timestamps.
   *
   * Staff permissions are checked by the service layer,
   * not by this store.
   */
  function createReservation(
    {
      screeningId,
      seats,
      customerName = "",
      note = "",
    },
    staffEmail = null,
  ) {
    // Rejects invalid or unavailable seats.
    const error = validateSeats(screeningId, seats);

    if (error) return { error };

    /*
     * CREATE RESERVATION RECORD
     *
     * Generates an ID and reservation reference.
     *
     * trim() removes unnecessary surrounding spaces
     * from customer information.
     *
     * The reservation starts with the status "active".
     */
    const reservation = {
      id: makeId(),
      reference: `RIO-RES-${makeId().toUpperCase()}`,
      screeningId,
      seats: [...seats].sort((a, b) => a - b),
      customerName: customerName.trim(),
      note: note.trim(),
      staffEmail:
        staffEmail?.trim().toLowerCase() ?? null,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    };

    /*
     * SAVE RESERVATION
     *
     * Adds the new reservation to the beginning
     * of the reservation list.
     *
     * Its seats will now appear as staff-reserved
     * when availability is calculated.
     */
    publish({
      ...state,
      reservations: [
        reservation,
        ...state.reservations,
      ],
    });

    return { reservation };
  }


  /*
   * UPDATE STAFF RESERVATION
   *
   * Allows staff to change an existing reservation's
   * seats, customer name, or notes.
   *
   * Only active reservations can be updated.
   *
   * Replacement seats must still be available.
   * The updated reservation keeps its original ID.
   */
  function updateReservation(
    id,
    {
      seats,
      customerName = "",
      note = "",
    },
  ) {
    // Finds the reservation using its ID.
    const original = state.reservations.find(
      (reservation) => reservation.id === id,
    );

    /*
     * CHECK RESERVATION STATUS
     *
     * Rejects reservations that do not exist
     * or have already been cancelled.
     */
    if (!original || original.status !== "active") {
      return {
        error: "This reservation is no longer active.",
      };
    }

    /*
     * VALIDATE REPLACEMENT SEATS
     *
     * Checks whether the requested seats are available.
     *
     * excludeReservationId ignores this reservation's
     * existing seats during validation.
     *
     * This allows staff to keep the same seats
     * while editing customer details.
     */
    const error = validateSeats(
      original.screeningId,
      seats,
      { excludeReservationId: id },
    );

    if (error) return { error };

    /*
     * PREPARE UPDATED RESERVATION
     *
     * Copies the original reservation and replaces
     * the changed fields.
     *
     * Updates the modification timestamp.
     */
    const reservation = {
      ...original,
      seats: [...seats].sort((a, b) => a - b),
      customerName: customerName.trim(),
      note: note.trim(),
      updatedAt: now(),
    };

    /*
     * SAVE UPDATED RESERVATION
     *
     * map() replaces the matching reservation
     * while keeping all other reservations unchanged.
     */
    publish({
      ...state,
      reservations: state.reservations.map((item) =>
        item.id === id ? reservation : item,
      ),
    });

    return { reservation };
  }


  /*
   * CANCEL STAFF RESERVATION
   *
   * Cancels an existing active reservation.
   *
   * The reservation is not deleted because its
   * history may still be needed by staff.
   *
   * Its status changes to "cancelled",
   * allowing the reserved seats to become available again.
   *
   * Returns an error message or null on success.
   */
  function cancelReservation(id) {
    const original = state.reservations.find(
      (reservation) => reservation.id === id,
    );

    // Only active reservations can be cancelled.
    if (!original || original.status !== "active") {
      return "This reservation is no longer active.";
    }

    /*
     * MARK RESERVATION AS CANCELLED
     *
     * Keeps the original record but updates:
     * - Reservation status.
     * - Cancellation reason.
     * - Cancellation timestamp.
     * - Last updated timestamp.
     */
    publish({
      ...state,
      reservations: state.reservations.map((reservation) =>
        reservation.id === id
          ? {
              ...reservation,
              status: "cancelled",
              cancellationReason: "Cancelled by staff",
              cancelledAt: now(),
              updatedAt: now(),
            }
          : reservation,
      ),
    });

    return null;
  }


  /*
   * PUBLIC STORE METHODS
   *
   * Returns the functions that other parts of the
   * demo application can use.
   *
   * getSnapshot(): Returns the current store state.
   * subscribe(): Notifies components when data changes.
   * getAvailability(): Calculates available and occupied seats.
   *
   * Screening methods manage the cinema programme.
   * Checkout methods manage temporary holds and bookings.
   * Reservation methods manage unpaid staff reservations.
   *
   * These functions all operate on the same store state.
   */
  return {
    getSnapshot: () => state,
    subscribe,
    getAvailability,
    saveScreening,
    cancelScreening,
    deleteScreening,
    createCheckoutHold,
    releaseCheckoutHold,
    createBooking,
    createReservation,
    updateReservation,
    cancelReservation,
  };
}