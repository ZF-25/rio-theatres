/*
 * FILE: frontend/src/pages/SeatSelection.jsx
 *
 * PURPOSE
 * -------
 * Loads a screening's seats and creates a checkout hold.
 *
 * DATA FLOW
 * ---------
 * useBookingScreening()
 *   -> screening and seat-map services
 *
 * Continue to checkout
 *   -> booking.createHold()
 *   -> booking.getHold()
 *   -> onHoldCreated(hold)
 *
 * IMPORTANT CHANGES
 * -----------------
 * - Seat IDs are used for requests.
 * - Seat labels are used for display.
 * - Layout comes from service coordinates.
 * - Availability refreshes through useBookingScreening().
 * - Prices are supplied by the hold response, not invented here.
 *
 * To change cinema, room, or time, return to Movie Details.
 * This page stays tied to the screening ID in its URL.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useParams } from "react-router-dom";

import {
  booking as bookingService,
  bookingEnabled,
} from "../services/booking.js";

import { createOperationKey } from "../services/apiBooking.js";

import { catalogue } from "../services/catalogue.js";

import { useBookingScreening } from "../hooks/useBookingScreening.js";

import { useResource } from "../hooks/useResource.js";

import { cinemaTime, formatCinemaDate } from "../utils/cinemaTime.js";

import RequestState from "../components/RequestState.jsx";

/*
 * PENDING OPERATION STORAGE
 *
 * Stores the request body and retry key, not credentials.
 *
 * After a lost response or refresh, retrying must reuse the
 * original operation rather than create another hold.
 */
function operationStorageKey(screeningId) {
  return `rio:hold-operation:${screeningId}`;
}

function readSavedOperation(screeningId) {
  try {
    const raw = sessionStorage.getItem(operationStorageKey(screeningId));

    if (!raw) {
      return null;
    }

    const saved = JSON.parse(raw);

    const valid =
      typeof saved.key === "string" &&
      saved.key !== "" &&
      saved.body?.screeningId === screeningId &&
      Array.isArray(saved.body.seatIds) &&
      saved.body.seatIds.every((id) => typeof id === "string") &&
      Number.isInteger(saved.body.tickets?.adult) &&
      saved.body.tickets.adult >= 0 &&
      Number.isInteger(saved.body.tickets?.child) &&
      saved.body.tickets.child >= 0 &&
      saved.body.seatIds.length > 0 &&
      new Set(saved.body.seatIds).size === saved.body.seatIds.length &&
      saved.body.tickets.adult + saved.body.tickets.child ===
        saved.body.seatIds.length &&
      (saved.holdId === undefined || typeof saved.holdId === "string");

    if (!valid) {
      sessionStorage.removeItem(operationStorageKey(screeningId));

      return null;
    }

    return saved;
  } catch {
    // Storage may be unavailable in some browser settings.
    return null;
  }
}

function saveOperation(screeningId, operation) {
  try {
    sessionStorage.setItem(
      operationStorageKey(screeningId),
      JSON.stringify(operation),
    );
  } catch {
    // In-memory retry protection still works while mounted.
  }
}

function removeSavedOperation(screeningId) {
  try {
    sessionStorage.removeItem(operationStorageKey(screeningId));
  } catch {
    // Unavailable browser storage should not crash the page.
  }
}

/*
 * TICKET COUNTER
 *
 * Prices are not shown before a server/demo hold quote exists.
 * The agreed screening endpoint does not supply ticket prices.
 */
function TicketCounter({
  label,
  description,
  quantity,
  onChange,
  canIncrease,
  disabled,
}) {
  return (
    <div className="ticket-counter">
      <div className="ticket-counter-description">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>

      <div
        className="ticket-counter-controls"
        role="group"
        aria-label={`${label} ticket quantity`}
      >
        <button
          type="button"
          aria-label={`Remove one ${label.toLowerCase()} ticket`}
          disabled={disabled || quantity === 0}
          onClick={() => {
            onChange(quantity - 1);
          }}
        >
          −
        </button>

        <span className="ticket-counter-value">{quantity}</span>

        <button
          type="button"
          aria-label={`Add one ${label.toLowerCase()} ticket`}
          disabled={disabled || !canIncrease}
          onClick={() => {
            onChange(quantity + 1);
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

/*
 * Reset local selection state when the screening URL changes.
 */
function SeatSelection({ onBack, onHoldCreated }) {
  const { screeningId } = useParams();

  return (
    <SeatSelectionContent
      key={screeningId}
      screeningId={screeningId}
      onBack={onBack}
      onHoldCreated={onHoldCreated}
    />
  );
}

function SeatSelectionContent({ screeningId, onBack, onHoldCreated }) {
  const availability = useBookingScreening(screeningId);

  const { screening, seatMap } = availability;

  /*
   * RECOVER AN UNFINISHED HOLD OPERATION
   *
   * Recovery freezes editing until its result is established.
   * This avoids retrying a changed body with the same key.
   */
  const [savedOperation] = useState(() => readSavedOperation(screeningId));

  const operation = useRef(savedOperation);

  const [selectedIds, setSelectedIds] = useState(() => [
    ...(savedOperation?.body.seatIds ?? []),
  ]);

  const [adultTickets, setAdultTickets] = useState(
    savedOperation?.body.tickets.adult ?? 1,
  );

  const [childTickets, setChildTickets] = useState(
    savedOperation?.body.tickets.child ?? 0,
  );

  const [recovering, setRecovering] = useState(Boolean(savedOperation));

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const submissionInProgress = useRef(false);

  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  /*
   * MOVIE INFORMATION
   *
   * Screening responses contain the title, but movie details
   * provide the age-rating warning.
   */
  const movieId = screening?.movieId;

  const loadMovie = useCallback(
    (signal) => {
      if (!movieId) {
        return Promise.resolve(null);
      }

      return catalogue.getMovie(movieId, { signal });
    },
    [movieId],
  );

  const movieResult = useResource(loadMovie);

  const movie = movieResult.data?.data;

  /*
   * MAP DATA
   *
   * Never reconstruct seat numbers using capacity.
   * Use the service's IDs, labels, and coordinates.
   */
  const seats = seatMap?.seats ?? [];

  const seatsById = new Map(seats.map((seat) => [seat.id, seat]));

  const availableSeats = seats.filter((seat) => seat.status === "available");

  const availableCount = availableSeats.length;

  const totalTickets = adultTickets + childTickets;

  const selectedCount = selectedIds.length;

  const hasUnavailableSelection = selectedIds.some((id) => {
    return seatsById.get(id)?.status !== "available";
  });

  /*
   * GROUP BY PHYSICAL ROW
   *
   * Row zero is nearest the screen.
   * Display descending row order because the screen is at bottom.
   */
  const groupedRows = new Map();

  seats.forEach((seat) => {
    if (!groupedRows.has(seat.rowIndex)) {
      groupedRows.set(seat.rowIndex, {
        rowIndex: seat.rowIndex,
        rowLabel: seat.rowLabel,
        seats: [],
      });
    }

    groupedRows.get(seat.rowIndex).seats.push(seat);
  });

  const rows = [...groupedRows.values()]
    .sort((a, b) => {
      return b.rowIndex - a.rowIndex;
    })
    .map((row) => ({
      ...row,
      seats: [...row.seats].sort((a, b) => {
        return a.columnIndex - b.columnIndex;
      }),
    }));

  /*
   * SUBMISSION GUARDS
   *
   * An uncertain previous request can be retried even though
   * its seats may now appear held by that request.
   */
  const editingLocked = submitting || recovering;

  const canCreateHold = Boolean(
    bookingEnabled &&
    availability.isBookable &&
    movie &&
    !movieResult.loading &&
    !movieResult.error &&
    totalTickets > 0 &&
    totalTickets <= availableCount &&
    selectedCount === totalTickets &&
    !hasUnavailableSelection,
  );

  const canContinue = Boolean(
    !submitting &&
    typeof onHoldCreated === "function" &&
    (recovering || canCreateHold),
  );

  /*
   * CLEAR A COMPLETED/DEFINITIVELY FAILED REQUEST
   *
   * Do not use this for an uncertain network result.
   */
  function clearOperation() {
    operation.current = null;
    removeSavedOperation(screeningId);
  }

  function changeQuantity(field, quantity) {
    if (editingLocked) {
      return;
    }

    clearOperation();
    setError("");

    if (field === "adult") {
      setAdultTickets(quantity);
    } else {
      setChildTickets(quantity);
    }
  }

  function clearSelectedSeats() {
    if (editingLocked) {
      return;
    }

    clearOperation();
    setSelectedIds([]);
    setError("");
  }

  function toggleSeat(seat) {
    if (editingLocked) {
      return;
    }

    /*
     * Allow deselection even if a selected seat became unavailable.
     */
    if (selectedIds.includes(seat.id)) {
      clearOperation();

      setSelectedIds((previous) => {
        return previous.filter((id) => id !== seat.id);
      });

      setError("");
      return;
    }

    if (
      !availability.isBookable ||
      seat.status !== "available" ||
      selectedCount >= totalTickets
    ) {
      return;
    }

    clearOperation();

    setSelectedIds((previous) => [...previous, seat.id]);

    setError("");
  }

  /*
   * CREATE OR RECOVER A HOLD
   *
   * Never automatically retry with a new key after an uncertain
   * network result.
   *
   * Once a hold ID is known, retry its GET instead of creating
   * another hold.
   */
  async function continueToCheckout() {
    if (submissionInProgress.current || !canContinue) {
      return;
    }

    submissionInProgress.current = true;

    setSubmitting(true);
    setError("");

    try {
      let pending = operation.current;

      if (!pending) {
        pending = {
          key: createOperationKey(),

          body: {
            screeningId,
            seatIds: [...selectedIds],

            tickets: {
              adult: adultTickets,
              child: childTickets,
            },
          },
        };

        operation.current = pending;

        saveOperation(screeningId, pending);
      }

      if (!pending.holdId) {
        const response = await bookingService.createHold(pending.body, {
          idempotencyKey: pending.key,
        });

        if (typeof response.data?.id !== "string") {
          throw new Error("The hold response did not contain a hold ID.");
        }

        pending = {
          ...pending,
          holdId: response.data.id,
        };

        operation.current = pending;

        saveOperation(screeningId, pending);
      }

      /*
       * An idempotency replay can return the original creation
       * result after the hold has expired.
       *
       * Verify current hold state before opening Checkout.
       */
      const currentHold = await bookingService.getHold(pending.holdId);

      if (!mounted.current) {
        return;
      }

      await onHoldCreated(currentHold.data);

      clearOperation();
      setRecovering(false);
    } catch (requestError) {
      if (!mounted.current) {
        return;
      }

      const uncertain =
        !requestError.status ||
        requestError.status >= 500 ||
        requestError.code === "INVALID_RESPONSE";

      setError(
        requestError.message || "Unable to hold these seats. Please try again.",
      );

      if (uncertain) {
        /*
         * Keep the exact body/key and freeze editing.
         * The next click recovers that operation.
         */
        setRecovering(true);
      } else {
        /*
         * A definite rejection allows the selection to change.
         */
        clearOperation();
        setRecovering(false);
        availability.refresh();
      }
    } finally {
      submissionInProgress.current = false;

      if (mounted.current) {
        setSubmitting(false);
      }
    }
  }

  /*
   * STATUS TEXT
   */
  /*
   * STATUS TEXT
   *
   * Return the appropriate message directly instead of assigning
   * an initial value that every branch overwrites.
   */
  function getSelectionMessage() {
    if (recovering) {
      return "A previous hold request needs recovery. Retry it before changing your selection.";
    }

    if (!availability.isBookable) {
      return "Booking is unavailable until the screening and current availability are confirmed.";
    }

    if (hasUnavailableSelection) {
      return "Some selected seats are no longer available. Deselect them or clear your selection.";
    }

    if (totalTickets === 0) {
      return "Choose at least one ticket.";
    }

    if (selectedCount > totalTickets) {
      return "Deselect extra seats or increase your ticket quantity.";
    }

    if (totalTickets > availableCount) {
      return "Reduce your ticket quantity to match available seats.";
    }

    if (selectedCount === totalTickets) {
      return "Your seats are selected. Continue to request a checkout hold.";
    }

    return `${selectedCount} of ${totalTickets} seats selected.`;
  }

  const selectionMessage = getSelectionMessage();

  /*
   * INITIAL LOADING / UNAVAILABLE STATE
   */
  if (!bookingEnabled || !screening || !seatMap) {
    return (
      <section className="container seats-page">
        <h1 tabIndex={-1}>
          {bookingEnabled ? "Choose your seats" : "Booking is not available"}
        </h1>

        {bookingEnabled && (
          <RequestState
            loading={availability.loading}
            error={availability.error}
            onRetry={availability.retry}
            loadingMessage="Loading screening and seats…"
          />
        )}

        <button type="button" className="secondary-button" onClick={onBack}>
          Back to movie
        </button>
      </section>
    );
  }

  const ratingLabel = movie?.ageRating?.label;

  const selectedLabels = selectedIds.map((id) => {
    return seatsById.get(id)?.label ?? "Unavailable seat";
  });

  const statusNames = {
    available: "available",
    booked: "booked",
    held: "temporarily held",
    staff_reserved: "staff reserved",
    owner_blocked: "owner reserved",
  };

  const statusClasses = {
    available: "seat-available",
    booked: "seat-sold",
    held: "seat-held",
    staff_reserved: "seat-staff-reserved",
    owner_blocked: "seat-reserved",
  };

  return (
    <section className="container seats-page" aria-labelledby="seats-title">
      <button
        type="button"
        className="movie-back-button"
        onClick={onBack}
        disabled={submitting}
      >
        <span aria-hidden="true">←</span>
        Back to movie
      </button>

      <h1 id="seats-title" tabIndex={-1}>
        Choose your seats
      </h1>

      <p className="seat-screening-description">
        {screening.movieTitle}
        {" · "}
        {screening.cinemaName}
        {" · "}
        {screening.roomName}
        {" · "}
        {formatCinemaDate(screening.startsAt)}
        {", "}
        {cinemaTime(screening.startsAt)}
      </p>

      <p className="details-age-notice">
        {ratingLabel != null
          ? `Age rating: ${ratingLabel}. Check suitability before choosing tickets.`
          : "Age rating unavailable. Check suitability with the cinema before booking."}
      </p>

      <RequestState
        loading={movieResult.loading}
        error={movieResult.error}
        onRetry={movieResult.retry}
        loadingMessage="Loading movie information…"
      />

      <RequestState error={availability.error} onRetry={availability.retry} />

      <button
        type="button"
        className="secondary-button"
        onClick={availability.refresh}
        disabled={submitting || availability.refreshing}
      >
        {availability.refreshing ? "Refreshing seats…" : "Refresh availability"}
      </button>

      {/* TICKET QUANTITIES */}
      <section
        className="seat-ticket-panel"
        aria-labelledby="seat-ticket-title"
      >
        <div className="seat-ticket-heading">
          <h2 id="seat-ticket-title">1. Choose your tickets</h2>

          <p>
            Your exact price will be shown at checkout after the seats are held.
          </p>
        </div>

        <div className="seat-ticket-counters">
          <TicketCounter
            label="Adult"
            description="Standard ticket"
            quantity={adultTickets}
            disabled={editingLocked}
            canIncrease={
              availability.isBookable && totalTickets < availableCount
            }
            onChange={(quantity) => {
              changeQuantity("adult", quantity);
            }}
          />

          <TicketCounter
            label="Child"
            description="50% discount"
            quantity={childTickets}
            disabled={editingLocked}
            canIncrease={
              availability.isBookable && totalTickets < availableCount
            }
            onChange={(quantity) => {
              changeQuantity("child", quantity);
            }}
          />
        </div>
      </section>

      <div className="seat-page-layout">
        <div className="seat-map-panel">
          <div className="seat-selection-heading">
            <h2>2. Choose your seats</h2>

            <p
              id="seat-selection-status"
              className={`seat-selection-status ${
                canCreateHold ? "is-complete" : ""
              }`}
              role="status"
              aria-atomic="true"
            >
              {selectionMessage}
            </p>
          </div>

          <div
            className="seat-map-scroll"
            role="region"
            aria-label="Cinema seat map"
            aria-describedby="seat-selection-status"
            tabIndex={0}
          >
            <div className="seat-map">
              <div className="seat-entrances">
                <span>↙ Back entrance</span>
                <span>Back entrance ↘</span>
              </div>

              <div className="seat-rows">
                {rows.map((row) => (
                  <div className="seat-row" key={row.rowIndex}>
                    <span className="seat-row-label">Row {row.rowLabel}</span>

                    {row.seats.map((seat) => {
                      const selected = selectedIds.includes(seat.id);

                      const unavailable = seat.status !== "available";

                      const limitReached =
                        !selected && selectedCount >= totalTickets;

                      const displayClass = selected
                        ? "seat-selected"
                        : (statusClasses[seat.status] ?? "seat-sold");

                      const statusText =
                        statusNames[seat.status] ?? "unavailable";

                      return (
                        <button
                          key={seat.id}
                          type="button"
                          className={`cinema-seat ${displayClass} ${
                            limitReached ? "seat-limit-reached" : ""
                          }`}
                          disabled={editingLocked || (unavailable && !selected)}
                          aria-disabled={
                            (!selected &&
                              (limitReached || !availability.isBookable)) ||
                            undefined
                          }
                          aria-pressed={selected}
                          aria-label={
                            `Row ${seat.rowLabel}, seat ${seat.label}, ${statusText}` +
                            (selected ? ", selected" : "")
                          }
                          onClick={() => {
                            toggleSeat(seat);
                          }}
                        >
                          {seat.label}

                          {seat.status === "owner_blocked" && (
                            <span aria-hidden="true"> 🔒</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="cinema-screen">
                <span>Screen · Front</span>
                <div />
              </div>

              <p className="seat-map-caption">
                Front rows are nearest the screen
              </p>
            </div>
          </div>

          <ul className="seat-legend" aria-label="Seat availability key">
            {[
              ["seat-available", "Available"],
              ["seat-sold", "Booked"],
              ["seat-held", "Temporarily held"],
              ["seat-staff-reserved", "Staff reserved"],
              ["seat-selected", "Selected"],
              ["seat-reserved", "Owner reserved"],
            ].map(([className, label]) => (
              <li key={className}>
                <span className={`legend-swatch ${className}`} />
                {label}
              </li>
            ))}
          </ul>

          <p className="seat-map-note">
            {seats.length} physical seats. Seat and row labels skip 13.{" "}
            Availability is checked again when requesting your hold.
          </p>
        </div>

        {/* SELECTION SUMMARY */}
        <aside className="seat-summary" aria-labelledby="seat-summary-title">
          <h2 id="seat-summary-title">Your screening</h2>

          <p className="seat-summary-description">
            <strong>{screening.movieTitle}</strong>

            <span>
              {screening.cinemaName}
              {" · "}
              {screening.roomName}
            </span>

            <span>
              {formatCinemaDate(screening.startsAt)}
              {" · "}
              {cinemaTime(screening.startsAt)}
            </span>
          </p>

          <dl className="seat-price-list">
            <div>
              <dt>Adult tickets</dt>
              <dd>{adultTickets}</dd>
            </div>

            <div>
              <dt>Child tickets</dt>
              <dd>{childTickets}</dd>
            </div>

            <div>
              <dt>Seats</dt>
              <dd>
                {selectedCount > 0
                  ? selectedLabels.join(", ")
                  : "None selected"}
              </dd>
            </div>

            <div className="seat-total">
              <dt>Price</dt>
              <dd>Confirmed at checkout</dd>
            </div>
          </dl>

          {error && (
            <p className="admin-edit-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            className="primary-button seat-continue"
            disabled={!canContinue}
            onClick={continueToCheckout}
          >
            {submitting
              ? "Checking your hold…"
              : recovering
                ? "Retry seat hold"
                : "Continue to checkout"}
          </button>

          {selectedCount > 0 && !editingLocked && (
            <button
              type="button"
              className="seat-clear-button"
              onClick={clearSelectedSeats}
            >
              Clear selected seats
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}

export default SeatSelection;
