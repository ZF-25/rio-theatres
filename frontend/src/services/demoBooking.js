/*
 * FILE: frontend/src/services/demoBooking.js
 *
 * PURPOSE
 * -------
 * Demo holds, simulated purchases, confirmation, and history.
 *
 * CONTRACT REVISION 1.1
 * ---------------------
 * At successful login/registration:
 * - Transfer only active, unexpired guest holds.
 * - Preserve hold ID, seats, tickets, frozen quote, and expiry.
 * - Preserve retry access for those hold-creation operations.
 * - Do NOT transfer completed guest receipts or purchase results.
 *
 * Booking contact details remain in the frontend checkout draft.
 * They are submitted with createBooking(), not authentication.
 *
 * OWNERSHIP
 * ---------
 * Customer resources belong to account IDs.
 * Guest resources belong to their originating demo session.
 * Contact email and booking reference never grant access.
 *
 * LIMITATIONS
 * -----------
 * In-memory demonstration only. Refresh resets all records.
 * Real authorization, sessions, and transactions belong to Express
 * and PostgreSQL.
 */

import { ApiError } from "./apiClient.js";

import {
    createRows,
    ticketPrice,
} from "../data/cinema.js";

import {
    cinemaDate,
    demoScreeningInstant,
} from "../utils/cinemaTime.js";

export function createDemoBooking({
    store,
    auth,
    movies,
    cinemas,
    rooms,
    now = () => Date.now(),
}) {
    if (
        typeof auth.getDemoSession !== "function" ||
        typeof auth.registerSessionParticipant !== "function"
    ) {
        throw new Error(
            "Update demoAuth.js before using this demo booking service.",
        );
    }

    const holds = new Map();
    const receipts = new Map();
    const operations = new Map();

    function fail(message, status, code, details = {}) {
        throw new ApiError(message, {
            status,
            code,
            details,
        });
    }

    function copy(value) {
        return structuredClone(value);
    }

    /*
     * Ownership records are compared by value.
     * Never mutate a shared guest owner to claim historical receipts.
     */
    function sameOwner(a, b) {
        return Boolean(
            a &&
            b &&
            a.kind === b.kind &&
            a.id === b.id,
        );
    }

    function sessionOwner(session) {
        return session.user
            ? {
                kind: "customer",
                id: session.user.id,
            }
            : {
                kind: "guest",
                id: session.sessionId,
            };
    }

    async function getContext(signal) {
        await auth.getSession({ signal });
        signal?.throwIfAborted();

        // Read the current identity after awaiting the session check.
        const session = auth.getDemoSession();

        if (
            session.user &&
            session.user.role !== "customer"
        ) {
            fail(
                "Use a customer account or sign out before booking.",
                403,
                "FORBIDDEN",
            );
        }

        return {
            user: session.user,
            owner: sessionOwner(session),
        };
    }

    function requireOwnership(entry, context, label) {
        if (
            !entry ||
            !sameOwner(entry.owner, context.owner)
        ) {
            fail(
                `${label} not found.`,
                404,
                "NOT_FOUND",
            );
        }

        return entry;
    }

    function cinemaId(city) {
        return `cinema-${city.toLowerCase()}`;
    }

    function roomId(city, id) {
        return `${city.toLowerCase()}-${id}`;
    }

    function screeningById(id) {
        const screening = store
            .getSnapshot()
            .screenings.find((item) => item.id === id);

        if (!screening) {
            fail(
                "Screening not found.",
                404,
                "NOT_FOUND",
            );
        }

        return screening;
    }

    function screeningStart(screening) {
        return demoScreeningInstant(
            screening.date,
            screening.time,
        );
    }

    function requireBookable(screening) {
        if (screening.status !== "scheduled") {
            fail(
                "This screening has been cancelled.",
                409,
                "SCREENING_CANCELLED",
            );
        }

        if (
            Date.parse(screeningStart(screening)) <= now()
        ) {
            fail(
                "This screening has already started.",
                409,
                "SCREENING_STARTED",
            );
        }
    }

    /*
     * Physical seat IDs match the staff reservation services.
     * Coordinates describe the displayed map.
     */
    function physicalSeats(screening) {
        const rows = createRows(screening.capacity);

        return rows.flatMap((row, index) =>
            row.seats.map((number, columnIndex) => ({
                id:
                    `${roomId(screening.city, screening.roomId)}` +
                    `-seat-${number}`,
                label: String(number),
                rowLabel: String(row.row),
                rowIndex: rows.length - 1 - index,
                columnIndex,
                number,
            })),
        );
    }

    function screeningRecord(screening) {
        const movie = movies.find(
            (item) => item.id === screening.movieId,
        );

        const room = rooms.find(
            (item) => item.id === screening.roomId,
        );

        if (
            !movie ||
            !room ||
            !cinemas.some(
                (item) => item.city === screening.city,
            )
        ) {
            fail(
                "Demo screening information is incomplete.",
                500,
                "INVALID_DEMO_DATA",
            );
        }

        const startsAt = screeningStart(screening);

        return {
            id: screening.id,
            movieId: movie.id,
            movieTitle: movie.title,
            cinemaId: cinemaId(screening.city),
            cinemaName: `Rio ${screening.city}`,
            roomId: roomId(screening.city, room.id),
            roomName: room.name,
            startsAt,
            endsAt: new Date(
                Date.parse(startsAt) +
                movie.duration * 60000,
            ).toISOString(),
            spokenLanguage:
                screening.spokenLanguage ?? null,
            subtitles: [...(screening.subtitles ?? [])],
            status: screening.status,
            availableSeatCount:
                store.getAvailability(screening.id).available.length,
        };
    }

    function quoteFor(tickets) {
        const adultUnitPriceCents = Math.round(
            ticketPrice.adult * 100,
        );

        const childUnitPriceCents = Math.round(
            ticketPrice.child * 100,
        );

        const adultSubtotalCents =
            tickets.adult * adultUnitPriceCents;

        const childSubtotalCents =
            tickets.child * childUnitPriceCents;

        return {
            currency: "EUR",
            adultUnitPriceCents,
            childUnitPriceCents,
            adultSubtotalCents,
            childSubtotalCents,
            totalCents:
                adultSubtotalCents + childSubtotalCents,
        };
    }

    /*
     * Keys are scoped to endpoint AND owner.
     * Replaying another customer's key cannot expose their result.
     */
    function operationId(endpoint, owner, key) {
        return JSON.stringify([
            endpoint,
            owner.kind,
            owner.id,
            key,
        ]);
    }

    function runOperation(
        endpoint,
        key,
        body,
        context,
        perform,
    ) {
        if (
            typeof key !== "string" ||
            !key.trim()
        ) {
            fail(
                "This operation requires an idempotency key.",
                400,
                "IDEMPOTENCY_KEY_REQUIRED",
            );
        }

        const id = operationId(
            endpoint,
            context.owner,
            key,
        );

        const fingerprint = JSON.stringify(body);
        const previous = operations.get(id);

        /*
         * Recover a committed result before checking hold expiry.
         * Its original hold may already be consumed or expired.
         */
        if (previous) {
            if (previous.fingerprint !== fingerprint) {
                fail(
                    "This operation key was already used with different details.",
                    409,
                    "IDEMPOTENCY_KEY_REUSED",
                );
            }

            return copy(previous.response);
        }

        const response = perform();

        operations.set(id, {
            endpoint,
            key,
            owner: { ...context.owner },
            fingerprint,
            holdId:
                endpoint === "holds"
                    ? response.data.id
                    : body.holdId,
            response: copy(response),
        });

        return copy(response);
    }

    function activeHold(id, context) {
        const entry = requireOwnership(
            holds.get(id),
            context,
            "Hold",
        );

        if (entry.consumed) {
            fail(
                "This hold has already been used for a booking.",
                409,
                "HOLD_ALREADY_CONSUMED",
            );
        }

        const screening = screeningById(
            entry.selection.screening.id,
        );

        if (screening.status !== "scheduled") {
            fail(
                "This screening has been cancelled.",
                409,
                "SCREENING_CANCELLED",
            );
        }

        if (
            entry.released ||
            entry.expiresAt <= now() ||
            !store.getSnapshot().holds.some(
                (hold) => hold.id === id,
            )
        ) {
            store.releaseCheckoutHold(id);

            fail(
                "Your seat hold has expired or been released.",
                410,
                "HOLD_EXPIRED",
            );
        }

        requireBookable(screening);

        return entry;
    }

    function holdResponse(entry) {
        return {
            data: {
                id: entry.id,
                screeningId: entry.selection.screening.id,
                seatIds: [...entry.seatIds],
                tickets: {
                    adult: entry.selection.adultTickets,
                    child: entry.selection.childTickets,
                },
                status: "active",
                expiresAt: new Date(
                    entry.expiresAt,
                ).toISOString(),
                serverNow: new Date(now()).toISOString(),
                quote: copy(entry.quote),
            },
        };
    }

    function receiptView(entry) {
        const result = copy(entry.receipt);

        const stored = store
            .getSnapshot()
            .bookings.find(
                (booking) =>
                    booking.reference === result.reference,
            );

        if (
            stored?.screeningStatus === "cancelled" ||
            stored?.screening.status === "cancelled"
        ) {
            result.screening.status = "cancelled";
        }

        return result;
    }

    /*
     * AUTHENTICATION PARTICIPANT
     *
     * Prepare changes without mutating anything.
     * Commit transfers active holds and their hold-creation retries.
     * Rollback restores their previous ownership.
     *
     * Receipts and completed purchase operations are never selected.
     */
    auth.registerSessionParticipant({
        prepareTransition({ action, previous, next }) {
            const beforeOwner = sessionOwner(previous);
            const afterOwner = sessionOwner(next);

            const transfer =
                (action === "login" || action === "register") &&
                !previous.user &&
                next.user?.role === "customer";

            const release =
                action === "logout" ||
                (
                    previous.user &&
                    previous.user.id !== next.user?.id
                );

            const changes = [];
            const moves = [];
            const activeIds = new Set();

            const stamp = now();
            const snapshot = store.getSnapshot();

            for (const entry of holds.values()) {
                if (
                    !sameOwner(entry.owner, beforeOwner) ||
                    entry.consumed ||
                    entry.released
                ) {
                    continue;
                }

                const screening = snapshot.screenings.find(
                    (item) =>
                        item.id === entry.selection.screening.id,
                );

                const eligible =
                    entry.expiresAt > stamp &&
                    screening?.status === "scheduled" &&
                    Date.parse(screeningStart(screening)) > stamp &&
                    snapshot.holds.some(
                        (hold) => hold.id === entry.id,
                    );

                if (transfer && eligible) {
                    activeIds.add(entry.id);

                    changes.push({
                        entry,
                        owner: entry.owner,
                        released: entry.released,
                        transfer: true,
                    });
                } else if (release) {
                    changes.push({
                        entry,
                        owner: entry.owner,
                        released: entry.released,
                        transfer: false,
                    });
                }
            }

            /*
             * Move only hold-creation results for transferred holds.
             * Never move completed guest purchase results.
             */
            if (transfer) {
                for (const [oldId, record] of operations) {
                    if (
                        record.endpoint !== "holds" ||
                        !activeIds.has(record.holdId) ||
                        !sameOwner(record.owner, beforeOwner)
                    ) {
                        continue;
                    }

                    const newId = operationId(
                        record.endpoint,
                        afterOwner,
                        record.key,
                    );

                    if (operations.has(newId)) {
                        fail(
                            "Resolve this checkout before switching sessions.",
                            409,
                            "IDEMPOTENCY_KEY_REUSED",
                        );
                    }

                    moves.push({
                        oldId,
                        newId,
                        record,
                    });
                }
            }

            let committed = false;

            return {
                commit() {
                    for (const change of changes) {
                        if (change.transfer) {
                            change.entry.owner = { ...afterOwner };
                        } else {
                            change.entry.released = true;
                        }
                    }

                    for (const move of moves) {
                        operations.delete(move.oldId);

                        operations.set(move.newId, {
                            ...move.record,
                            owner: { ...afterOwner },
                        });
                    }

                    committed = true;

                    /*
                     * Logout inventory cleanup runs after the synchronous
                     * authentication commit. Rollback cancels this cleanup.
                     */
                    if (
                        changes.some(
                            (change) => !change.transfer,
                        )
                    ) {
                        queueMicrotask(() => {
                            if (!committed) return;

                            for (const change of changes) {
                                if (!change.transfer) {
                                    store.releaseCheckoutHold(
                                        change.entry.id,
                                    );
                                }
                            }
                        });
                    }
                },

                rollback() {
                    committed = false;

                    for (const change of changes) {
                        change.entry.owner = change.owner;
                        change.entry.released = change.released;
                    }

                    for (const move of moves) {
                        operations.delete(move.newId);
                        operations.set(move.oldId, move.record);
                    }
                },
            };
        },
    });

    return {
        subscribe: store.subscribe,
        getSnapshot: store.getSnapshot,

        /*
         * PUBLIC SCREENING AND MAP READS
         *
         * No private customer information is exposed.
         */
        async getScreening(id, { signal } = {}) {
            signal?.throwIfAborted();

            return {
                data: screeningRecord(screeningById(id)),
            };
        },

        async getSeatMap(id, { signal } = {}) {
            signal?.throwIfAborted();

            const screening = screeningById(id);
            const availability = store.getAvailability(id);

            const booked = new Set(availability.booked);
            const held = new Set(availability.temporaryHeld);
            const reserved = new Set(availability.staffReserved);
            const blocked = new Set(availability.reserved);

            const seats = physicalSeats(screening).map(
                ({ number, ...seat }) => ({
                    ...seat,
                    status: blocked.has(number)
                        ? "owner_blocked"
                        : booked.has(number)
                            ? "booked"
                            : held.has(number)
                                ? "held"
                                : reserved.has(number)
                                    ? "staff_reserved"
                                    : "available",
                }),
            );

            return {
                data: {
                    screeningId: id,
                    serverNow: new Date(now()).toISOString(),
                    layout: {
                        screenPosition: "bottom",
                        entrances: ["top-left", "top-right"],
                        seatsPerRow: 10,
                    },
                    seats,
                },
            };
        },

        /*
         * CREATE HOLD
         *
         * Snapshot the request before awaiting authentication.
         */
        async createHold(
            { screeningId, seatIds, tickets },
            { signal, idempotencyKey } = {},
        ) {
            const body = copy({
                screeningId,
                seatIds,
                tickets: {
                    adult: tickets?.adult,
                    child: tickets?.child,
                },
            });

            const context = await getContext(signal);

            return runOperation(
                "holds",
                idempotencyKey,
                body,
                context,
                () => {
                    const screening = screeningById(
                        body.screeningId,
                    );

                    requireBookable(screening);

                    if (
                        !Array.isArray(body.seatIds) ||
                        !body.seatIds.length ||
                        new Set(body.seatIds).size !== body.seatIds.length ||
                        !Number.isInteger(body.tickets.adult) ||
                        !Number.isInteger(body.tickets.child) ||
                        body.tickets.adult < 0 ||
                        body.tickets.child < 0 ||
                        body.tickets.adult + body.tickets.child !==
                        body.seatIds.length
                    ) {
                        fail(
                            "Ticket quantities must match unique selected seats.",
                            422,
                            "VALIDATION_ERROR",
                        );
                    }

                    const seats = physicalSeats(screening);

                    const chosen = body.seatIds.map(
                        (id) =>
                            seats.find((seat) => seat.id === id),
                    );

                    if (chosen.some((seat) => !seat)) {
                        fail(
                            "Choose seats belonging to this screening's room.",
                            422,
                            "VALIDATION_ERROR",
                        );
                    }

                    const available = new Set(
                        store.getAvailability(screening.id).available,
                    );

                    const unavailableSeatIds = chosen
                        .filter(
                            (seat) => !available.has(seat.number),
                        )
                        .map((seat) => seat.id);

                    if (unavailableSeatIds.length) {
                        fail(
                            "Some selected seats are no longer available.",
                            409,
                            "SEATS_UNAVAILABLE",
                            { unavailableSeatIds },
                        );
                    }

                    const result = store.createCheckoutHold({
                        screening: { ...screening },
                        seats: chosen.map((seat) => seat.number),
                        adultTickets: body.tickets.adult,
                        childTickets: body.tickets.child,
                    });

                    if (result.error) {
                        fail(
                            result.error,
                            409,
                            "SEATS_UNAVAILABLE",
                        );
                    }

                    const entry = {
                        id: result.selection.holdId,
                        owner: { ...context.owner },
                        selection: result.selection,
                        seatIds: [...body.seatIds],
                        quote: quoteFor(body.tickets),
                        expiresAt: Math.min(
                            result.selection.expiresAt,
                            Date.parse(screeningStart(screening)),
                        ),
                        released: false,
                        consumed: false,
                    };

                    holds.set(entry.id, entry);

                    return holdResponse(entry);
                },
            );
        },

        async getHold(id, { signal } = {}) {
            const context = await getContext(signal);

            return holdResponse(activeHold(id, context));
        },

        async releaseHold(id, { signal } = {}) {
            const context = await getContext(signal);

            const entry = requireOwnership(
                holds.get(id),
                context,
                "Hold",
            );

            if (entry.consumed) {
                fail(
                    "This hold has already been used for a booking.",
                    409,
                    "HOLD_ALREADY_CONSUMED",
                );
            }

            store.releaseCheckoutHold(id);
            entry.released = true;

            return null;
        },

        /*
         * SIMULATED PURCHASE
         *
         * Ownership is captured when the purchase is committed.
         * A purchase after hold transfer belongs to the customer.
         */
        async createBooking(
            { holdId, customer },
            { signal, idempotencyKey } = {},
        ) {
            const body = {
                holdId,
                customer: {
                    name:
                        typeof customer?.name === "string"
                            ? customer.name.trim()
                            : "",
                    email:
                        typeof customer?.email === "string"
                            ? customer.email.trim()
                            : "",
                },
                paymentMethod: "simulated",
            };

            const context = await getContext(signal);

            return runOperation(
                "bookings",
                idempotencyKey,
                body,
                context,
                () => {
                    const contact = body.customer;

                    if (
                        !contact.name ||
                        contact.name.length > 100 ||
                        contact.email.length > 254 ||
                        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)
                    ) {
                        fail(
                            "Enter a valid contact name and email.",
                            422,
                            "VALIDATION_ERROR",
                        );
                    }

                    const entry = activeHold(
                        body.holdId,
                        context,
                    );

                    const result = store.createBooking(
                        {
                            ...entry.selection,
                            customer: contact,
                        },
                        context.user?.email ?? null,
                    );

                    if (result.error) {
                        fail(
                            result.error,
                            409,
                            "SEATS_UNAVAILABLE",
                        );
                    }

                    entry.consumed = true;

                    const booking = result.booking;
                    const seatRecords = physicalSeats(
                        booking.screening,
                    );

                    const receipt = {
                        id: `booking-${booking.reference}`,
                        reference: booking.reference,

                        createdAt: new Date(
                            booking.createdAt ?? now(),
                        ).toISOString(),

                        customer: { ...contact },
                        isGuest: !context.user,

                        movie: {
                            id: booking.movie.id,
                            title: booking.movie.title,
                            posterUrl: booking.movie.poster ?? null,
                        },

                        cinema: {
                            id: cinemaId(booking.cinema),
                            name: `Rio ${booking.cinema}`,
                            city: booking.cinema,
                        },

                        room: {
                            id: roomId(
                                booking.cinema,
                                booking.room.id,
                            ),
                            name: booking.room.name,
                        },

                        screening: {
                            id: booking.screening.id,
                            startsAt: screeningStart(
                                booking.screening,
                            ),
                            status: "scheduled",
                        },

                        seats: booking.seats.map((number) => {
                            const seat = seatRecords.find(
                                (item) => item.number === number,
                            );

                            return {
                                id: seat.id,
                                label: seat.label,
                                rowLabel: seat.rowLabel,
                            };
                        }),

                        tickets: {
                            adult: booking.adultTickets,
                            child: booking.childTickets,
                        },

                        quote: copy(entry.quote),
                        bookingStatus: "confirmed",
                        paymentStatus: "simulated",
                    };

                    receipts.set(receipt.reference, {
                        owner: { ...context.owner },
                        receipt,
                    });

                    return {
                        data: copy(receipt),
                    };
                },
            );
        },

        /*
         * PRIVATE RECEIPT LOOKUP
         *
         * Completed guest receipts remain guest-session-owned.
         * Later login does not turn them into customer receipts.
         */
        async getBooking(reference, { signal } = {}) {
            const context = await getContext(signal);

            const entry = requireOwnership(
                receipts.get(reference),
                context,
                "Booking",
            );

            return {
                data: receiptView(entry),
            };
        },

        /*
         * CUSTOMER HISTORY
         *
         * Includes customer-owned purchases only.
         * Completed guest purchases are always excluded.
         */
        async listMyBookings(
            {
                cinemaId: selectedCinemaId,
                date,
                page = 1,
                pageSize = 20,
            } = {},
            { signal } = {},
        ) {
            const context = await getContext(signal);

            if (!context.user) {
                fail(
                    "Sign in to view your bookings.",
                    401,
                    "AUTH_REQUIRED",
                );
            }

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

            if (
                selectedCinemaId &&
                !cinemas.some(
                    (cinema) =>
                        cinemaId(cinema.city) === selectedCinemaId,
                )
            ) {
                fail(
                    "Choose a valid cinema.",
                    422,
                    "VALIDATION_ERROR",
                );
            }

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

            const records = [...receipts.values()]
                .filter(
                    (entry) =>
                        sameOwner(entry.owner, context.owner),
                )
                .map(receiptView)
                .filter(
                    (receipt) =>
                        (
                            !selectedCinemaId ||
                            receipt.cinema.id === selectedCinemaId
                        ) &&
                        (
                            !date ||
                            cinemaDate(receipt.screening.startsAt) === date
                        ),
                )
                .sort(
                    (a, b) =>
                        b.createdAt.localeCompare(a.createdAt) ||
                        b.id.localeCompare(a.id),
                );

            const start = (page - 1) * pageSize;

            return {
                data: records.slice(start, start + pageSize),
                meta: {
                    page,
                    pageSize,
                    totalItems: records.length,
                    totalPages: Math.ceil(
                        records.length / pageSize,
                    ),
                },
            };
        },
    };
}