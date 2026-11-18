/*
 * FILE: frontend/src/components/AdminBookings.jsx
 *
 * PURPOSE
 * -------
 * Lets the owner search and inspect customer bookings.
 *
 * DATA SOURCES
 * ------------
 * ownerService.listBookings():
 * Filtered, paginated booking results.
 *
 * ownerService.getBooking():
 * Full details for a selected booking.
 *
 * catalogue.listCinemas():
 * Cinema filter options.
 *
 * IMPORTANT
 * ---------
 * This component no longer receives a bookings array from
 * AdminDashboard.
 *
 * Owner authorization is required for these endpoints.
 * Booking contact details are displayed only in this owner view.
 *
 * There are no customer-purchase cancellation or refund actions.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  ownerService,
  staffEnabled,
  staffMode,
} from "../services/staff.js";

import {
  catalogue,
} from "../services/catalogue.js";

import {
  collectPages,
} from "../services/apiCatalogue.js";

import {
  ApiError,
} from "../services/apiClient.js";

import {
  useStaffSession,
} from "../hooks/useStaffSession.js";

import {
  useResource,
} from "../hooks/useResource.js";

import {
  formatMoney,
  isValidMoneyAmount,
} from "../utils/money.js";

import {
  cinemaTime,
  formatCinemaDate,
} from "../utils/cinemaTime.js";

import RequestState from "./RequestState.jsx";


const PAGE_SIZE = 10;


/*
 * VALIDATE THE BOOKING FIELDS USED BY THIS COMPONENT
 *
 * Original demo records may have createdAt: null.
 * Real API responses must include a valid purchase timestamp.
 */
function validBooking(receipt) {
  const validCreatedAt =
    (
      staffMode === "demo" &&
      receipt?.createdAt === null
    ) ||
    (
      typeof receipt?.createdAt === "string" &&
      Number.isFinite(
        Date.parse(receipt.createdAt),
      )
    );

  return Boolean(
    receipt &&
    typeof receipt.reference === "string" &&
    typeof receipt.movie?.title === "string" &&
    typeof receipt.cinema?.name === "string" &&
    typeof receipt.room?.name === "string" &&
    typeof receipt.customer?.name === "string" &&
    typeof receipt.customer?.email === "string" &&
    validCreatedAt &&
    Number.isFinite(
      Date.parse(
        receipt.screening?.startsAt,
      ),
    ) &&
    Array.isArray(receipt.seats) &&
    receipt.seats.every((seat) => {
      return (
        typeof seat.id === "string" &&
        typeof seat.label === "string"
      );
    }) &&
    Number.isInteger(
      receipt.tickets?.adult,
    ) &&
    receipt.tickets.adult >= 0 &&
    Number.isInteger(
      receipt.tickets?.child,
    ) &&
    receipt.tickets.child >= 0 &&
    receipt.quote?.currency === "EUR" &&
    isValidMoneyAmount(
      receipt.quote.adultSubtotalCents,
    ) &&
    isValidMoneyAmount(
      receipt.quote.childSubtotalCents,
    ) &&
    isValidMoneyAmount(
      receipt.quote.totalCents,
    )
  );
}

function validateList(response) {
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
    meta.totalPages === Math.ceil(
      meta.totalItems / meta.pageSize,
    ) &&
    response.data.every(validBooking);

  if (!valid) {
    throw new ApiError(
      "The server returned an invalid owner booking list.",
      {
        code: "INVALID_RESPONSE",
      },
    );
  }

  return response;
}


/*
 * READABLE BOOKING STATUS
 *
 * Screening cancellation is separate from the purchase/payment
 * record. Do not erase that distinction.
 */
function bookingStatus(receipt) {
  if (
    receipt.screening.status === "cancelled"
  ) {
    return "Screening cancelled";
  }

  if (
    receipt.bookingStatus === "cancelled"
  ) {
    return "Booking cancelled";
  }

  return "Confirmed";
}

function paymentStatus(receipt) {
  return receipt.paymentStatus === "simulated"
    ? "Payment simulated"
    : "Payment status unavailable";
}


/*
 * OPTIONAL PROP
 *
 * screeningId:
 * Restricts results to one screening when this component is
 * reused for owner seat inspection.
 *
 * The main owner Bookings tab does not need to supply it.
 */
function AdminBookings({
  screeningId,
}) {
  const {
    staff,
    isOwner,
    status: staffStatus,
    sessionError,
    isSessionLoading,
    refreshSession,
  } = useStaffSession();

  const [filters, setFilters] = useState({
    reference: "",
    cinemaId: "",
    date: "",
    page: 1,
  });

  const [
    selectedReference,
    setSelectedReference,
  ] = useState(null);

  const detailsHeadingRef = useRef(null);


  /*
   * DEMO CHANGES
   *
   * Refreshes results after local booking or cancellation changes.
   * API mode provides manual refresh.
   */
  const snapshot = useSyncExternalStore(
    ownerService.subscribe,
    ownerService.getSnapshot,
    ownerService.getSnapshot,
  );


  /*
   * CINEMA FILTER OPTIONS
   */
  const loadCinemas = useCallback(
    (signal) => {
      if (
        !staffEnabled ||
        isSessionLoading ||
        staffStatus === "error" ||
        staff?.role !== "owner"
      ) {
        return Promise.resolve([]);
      }

      return collectPages(
        catalogue.listCinemas,
        { signal },
      );
    },
    [
      staff,
      staffStatus,
      isSessionLoading,
    ],
  );

  const cinemasResult =
    useResource(loadCinemas);

  const cinemas =
    cinemasResult.data ?? [];


  /*
   * LOAD ONE FILTERED RESULTS PAGE
   */
  const loadBookings = useCallback(
    async (signal) => {
      if (
        !staffEnabled ||
        isSessionLoading ||
        staffStatus === "error" ||
        staff?.role !== "owner"
      ) {
        return null;
      }

      void snapshot;

      const response =
        await ownerService.listBookings(
          {
            reference:
              filters.reference,

            cinemaId:
              filters.cinemaId,

            screeningId,

            date:
              filters.date,

            page:
              filters.page,

            pageSize:
              PAGE_SIZE,
          },
          { signal },
        );

      return validateList(response);
    },
    [
      staff,
      staffStatus,
      isSessionLoading,
      filters,
      screeningId,
      snapshot,
    ],
  );

  const bookingsResult =
    useResource(loadBookings);

  const bookings =
    bookingsResult.data?.data ?? [];

  const meta =
    bookingsResult.data?.meta;


  /*
   * LOAD THE SELECTED BOOKING'S DETAILS
   *
   * Do not assume the list response is the latest record.
   */
  const loadDetails = useCallback(
    async (signal) => {
      if (
        !selectedReference ||
        !staffEnabled ||
        isSessionLoading ||
        staffStatus === "error" ||
        staff?.role !== "owner"
      ) {
        return null;
      }

      void snapshot;

      const response =
        await ownerService.getBooking(
          selectedReference,
          { signal },
        );

      if (
        !validBooking(response.data) ||
        response.data.reference !==
          selectedReference
      ) {
        throw new ApiError(
          "The server returned invalid booking details.",
          {
            code: "INVALID_RESPONSE",
          },
        );
      }

      return response;
    },
    [
      selectedReference,
      staff,
      staffStatus,
      isSessionLoading,
      snapshot,
    ],
  );

  const detailsResult =
    useResource(loadDetails);

  const selectedBooking =
    detailsResult.data?.data;


  /*
   * FOCUS DETAILS WHEN THEIR RECORD LOADS
   */
  useEffect(() => {
    if (selectedBooking?.reference) {
      detailsHeadingRef.current?.focus({
        preventScroll: true,
      });
    }
  }, [selectedBooking?.reference]);


  function changeFilter(patch) {
    setSelectedReference(null);

    setFilters((previous) => ({
      ...previous,
      ...patch,
      page: 1,
    }));
  }

  function clearFilters() {
    setSelectedReference(null);

    setFilters({
      reference: "",
      cinemaId: "",
      date: "",
      page: 1,
    });
  }

  function changePage(page) {
    setSelectedReference(null);

    setFilters((previous) => ({
      ...previous,
      page,
    }));
  }

  function refreshBookings() {
    bookingsResult.retry();

    if (selectedReference) {
      detailsResult.retry();
    }
  }

  const hasFilters =
    filters.reference.trim() !== "" ||
    filters.cinemaId !== "" ||
    filters.date !== "";


  /*
   * SESSION / ACCESS GUARD
   */
  if (
    !staffEnabled ||
    isSessionLoading ||
    staffStatus === "error" ||
    !isOwner
  ) {
    return (
      <section className="admin-bookings">
        <h2>Bookings</h2>

        {isSessionLoading ? (
          <RequestState
            loading
            loadingMessage="Checking owner access…"
          />
        ) : staffStatus === "error" ? (
          <RequestState
            error={sessionError}
            onRetry={() => {
              refreshSession();
            }}
          />
        ) : (
          <p>
            An active owner account and matching staff
            catalogue are required.
          </p>
        )}
      </section>
    );
  }


  return (
    <section
      className="admin-bookings"
      aria-labelledby="owner-bookings-title"
    >
      <h2 id="owner-bookings-title">
        Bookings
      </h2>


      {/* SERVER/SERVICE-SIDE FILTERS */}
      <form
        className="admin-booking-filters"
        role="search"
        aria-label="Find customer bookings"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label className="admin-booking-reference-field">
          <span>Booking reference</span>

          <input
            type="search"
            maxLength={100}
            placeholder="Search reference…"
            value={filters.reference}
            onChange={(event) => {
              changeFilter({
                reference:
                  event.target.value,
              });
            }}
          />
        </label>

        <label>
          <span>Cinema</span>

          <select
            value={filters.cinemaId}
            disabled={
              cinemasResult.loading ||
              Boolean(cinemasResult.error)
            }
            onChange={(event) => {
              changeFilter({
                cinemaId:
                  event.target.value,
              });
            }}
          >
            <option value="">
              All cinemas
            </option>

            {cinemas.map((cinema) => (
              <option
                key={cinema.id}
                value={cinema.id}
              >
                {cinema.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Screening date</span>

          <input
            type="date"
            value={filters.date}
            onChange={(event) => {
              changeFilter({
                date: event.target.value,
              });
            }}
          />
        </label>

        <button
          type="button"
          className="secondary-button"
          onClick={clearFilters}
          disabled={
            !hasFilters &&
            filters.page === 1
          }
        >
          Clear filters
        </button>
      </form>

      <RequestState
        loading={cinemasResult.loading}
        error={cinemasResult.error}
        onRetry={cinemasResult.retry}
        loadingMessage="Loading cinema filters…"
      />

      <button
        type="button"
        className="secondary-button"
        onClick={refreshBookings}
        disabled={
          bookingsResult.loading ||
          (
            Boolean(selectedReference) &&
            detailsResult.loading
          )
        }
      >
        Refresh bookings
      </button>

      <RequestState
        loading={bookingsResult.loading}
        error={bookingsResult.error}
        onRetry={bookingsResult.retry}
        loadingMessage="Loading bookings…"
      />


      {/* RESULTS TABLE */}
      {!bookingsResult.loading &&
        !bookingsResult.error &&
        meta && (
          <>
            <p
              className="admin-results-count"
              role="status"
            >
              {meta.totalItems}
              {" "}bookings found
            </p>

            {bookings.length > 0 ? (
              <div
                className="admin-table-scroll"
                role="region"
                aria-label="Customer bookings table"
                tabIndex={0}
              >
                <table className="admin-table admin-bookings-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        Reference
                      </th>
                      <th scope="col">
                        Screening
                      </th>
                      <th scope="col">
                        Seats
                      </th>
                      <th scope="col">
                        Total
                      </th>
                      <th scope="col">
                        Status / details
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {bookings.map((receipt) => (
                      <tr key={receipt.reference}>
                        <td className="admin-booking-reference-cell">
                          {receipt.reference}
                        </td>

                        <td>
                          <div className="admin-booking-screening">
                            <strong>
                              {receipt.movie.title}
                            </strong>

                            <span>
                              {receipt.cinema.name}
                              {" · "}
                              {receipt.room.name}
                            </span>

                            <span>
                              {formatCinemaDate(
                                receipt.screening.startsAt,
                              )}
                              {" · "}
                              {cinemaTime(
                                receipt.screening.startsAt,
                              )}
                            </span>
                          </div>
                        </td>

                        <td>
                          {receipt.seats.map(
                            (seat) => seat.label,
                          ).join(", ")}
                        </td>

                        <td>
                          {formatMoney(
                            receipt.quote.totalCents,
                            receipt.quote.currency,
                          )}
                        </td>

                        <td>
                          <p>
                            {bookingStatus(receipt)}
                          </p>

                          <p>
                            {paymentStatus(receipt)}
                          </p>

                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              setSelectedReference(
                                receipt.reference,
                              );
                            }}
                          >
                            View details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-empty-state">
                <h3>
                  No bookings on this page
                </h3>

                <p>
                  Try another reference, cinema, or date.
                </p>

                {filters.page > 1 && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      changePage(1);
                    }}
                  >
                    Back to first page
                  </button>
                )}
              </div>
            )}

            {meta.totalPages > 1 && (
              <nav
                className="catalogue-pagination"
                aria-label="Owner booking result pages"
              >
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    filters.page <= 1
                  }
                  onClick={() => {
                    changePage(
                      filters.page - 1,
                    );
                  }}
                >
                  Previous
                </button>

                <span>
                  Page {filters.page}
                  {" "}of {meta.totalPages}
                </span>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    filters.page >= meta.totalPages
                  }
                  onClick={() => {
                    changePage(
                      filters.page + 1,
                    );
                  }}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}


      {/* SELECTED BOOKING DETAILS */}
      {selectedReference && (
        <section
          className="admin-screening-confirmation"
          aria-labelledby="owner-booking-details-title"
        >
          <h3
            id="owner-booking-details-title"
            ref={detailsHeadingRef}
            tabIndex={-1}
          >
            Booking details
          </h3>

          <RequestState
            loading={detailsResult.loading}
            error={detailsResult.error}
            onRetry={detailsResult.retry}
            loadingMessage="Loading booking details…"
          />

          {selectedBooking && (
            <>
              <p>
                <strong>
                  {selectedBooking.reference}
                </strong>
              </p>

              <p>
                {selectedBooking.movie.title}
                {" · "}
                {bookingStatus(selectedBooking)}
              </p>

              <dl className="customer-ticket-prices">
                <div>
                  <dt>Customer</dt>
                  <dd>
                    {selectedBooking.customer.name ||
                      "Not recorded"}
                  </dd>
                </div>

                <div>
                  <dt>Contact email</dt>
                  <dd>
                    {selectedBooking.customer.email ||
                      "Not recorded"}
                  </dd>
                </div>

                <div>
                  <dt>Purchase type</dt>
                  <dd>
                    {selectedBooking.isGuest
                      ? "Guest"
                      : "Registered customer"}
                  </dd>
                </div>

                <div>
                  <dt>Purchased</dt>
                  <dd>
                    {selectedBooking.createdAt
                      ? `${formatCinemaDate(
                          selectedBooking.createdAt,
                        )} · ${cinemaTime(
                          selectedBooking.createdAt,
                        )}`
                      : "Not recorded in the original demo"}
                  </dd>
                </div>

                <div>
                  <dt>Seats</dt>
                  <dd>
                    {selectedBooking.seats.map(
                      (seat) => seat.label,
                    ).join(", ")}
                  </dd>
                </div>

                <div>
                  <dt>
                    Adult × {selectedBooking.tickets.adult}
                  </dt>
                  <dd>
                    {formatMoney(
                      selectedBooking.quote.adultSubtotalCents,
                      selectedBooking.quote.currency,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>
                    Child × {selectedBooking.tickets.child}
                  </dt>
                  <dd>
                    {formatMoney(
                      selectedBooking.quote.childSubtotalCents,
                      selectedBooking.quote.currency,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Total</dt>
                  <dd>
                    {formatMoney(
                      selectedBooking.quote.totalCents,
                      selectedBooking.quote.currency,
                    )}
                  </dd>
                </div>
              </dl>
            </>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setSelectedReference(null);
            }}
          >
            Close details
          </button>
        </section>
      )}
    </section>
  );
}

export default AdminBookings;