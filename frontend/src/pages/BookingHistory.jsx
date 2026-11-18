/*
 * FILE: frontend/src/pages/BookingHistory.jsx
 *
 * PURPOSE
 * -------
 * Displays the current customer's booking history.
 *
 * DATA SOURCES
 * ------------
 * booking.listMyBookings():
 * Customer bookings with server/service-side filters and pagination.
 *
 * catalogue.listCinemas():
 * Cinema filter options.
 *
 * IMPORTANT
 * ---------
 * Ownership comes from the authentication session.
 * No account email or user ID is sent as a history filter.
 *
 * Guest contact emails do not attach guest bookings to an account.
 *
 * This page no longer accepts a "bookings" array from App.jsx.
 */

import {
  useCallback,
  useState,
  useSyncExternalStore,
} from "react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  booking as bookingService,
  bookingEnabled,
  bookingMode,
} from "../services/booking.js";

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
  useAuth,
} from "../hooks/useAuth.js";

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

import RequestState from "../components/RequestState.jsx";
import DemoTicketQR from "../components/DemoTicketQR.jsx";


const PAGE_SIZE = 10;


/*
 * CHECK THE FIELDS USED BY BOOKING CARDS
 *
 * API/demo services already provide pagination metadata.
 * This catches malformed booking records before rendering them.
 */
function validateHistoryResponse(response) {
  const valid =
    Array.isArray(response?.data) &&
    response.meta &&
    response.data.every((receipt) => {
      return (
        typeof receipt.reference === "string" &&
        typeof receipt.movie?.title === "string" &&
        typeof receipt.cinema?.name === "string" &&
        typeof receipt.room?.name === "string" &&
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
    });

  if (!valid) {
    throw new ApiError(
      "The server returned invalid booking history.",
      {
        code: "INVALID_RESPONSE",
      },
    );
  }

  return response;
}


/*
 * ONE BOOKING CARD
 *
 * Uses purchase-time information from the receipt.
 * Generate the QR only after ticket details are opened.
 */
function BookingCard({ receipt }) {
  const [detailsOpen, setDetailsOpen] =
    useState(false);

  const screeningCancelled =
    receipt.screening.status === "cancelled";

  const bookingCancelled =
    receipt.bookingStatus === "cancelled";

  const cancelled =
    screeningCancelled || bookingCancelled;

  const paymentLabel =
    receipt.paymentStatus === "simulated"
      ? "Payment simulated"
      : "Payment status unavailable";

  return (
    <article className="customer-booking-card">
      <div className="customer-booking-heading">
        <h2>
          {receipt.movie.title}
        </h2>

        <span className="customer-booking-status">
          {screeningCancelled
            ? "Screening cancelled"
            : bookingCancelled
              ? "Booking cancelled"
              : paymentLabel}
        </span>
      </div>

      <p className="customer-booking-screening">
        {formatCinemaDate(
          receipt.screening.startsAt,
        )}
        {" · "}
        {cinemaTime(
          receipt.screening.startsAt,
        )}
        {" · "}
        {receipt.cinema.name}
        {", "}
        {receipt.room.name}
      </p>

      {cancelled && (
        <p className="customer-ticket-note">
          {screeningCancelled
            ? "This screening has been cancelled."
            : "This booking has been cancelled."}
          {" "}Your purchase record is retained.
        </p>
      )}

      <details
        className="customer-ticket-details"
        onToggle={(event) => {
          setDetailsOpen(
            event.currentTarget.open,
          );
        }}
      >
        <summary>
          View ticket details

          <span className="customer-booking-reference">
            {receipt.reference}
          </span>
        </summary>

        <div className="customer-ticket-content">
          <dl className="customer-ticket-prices">
            <div>
              <dt>Seats</dt>
              <dd>
                {receipt.seats.map(
                  (seat) => seat.label,
                ).join(", ")}
              </dd>
            </div>

            <div>
              <dt>
                Adult × {receipt.tickets.adult}
              </dt>

              <dd>
                {formatMoney(
                  receipt.quote.adultSubtotalCents,
                  receipt.quote.currency,
                )}
              </dd>
            </div>

            <div>
              <dt>
                Child × {receipt.tickets.child}
                {" · "}50% discount
              </dt>

              <dd>
                {formatMoney(
                  receipt.quote.childSubtotalCents,
                  receipt.quote.currency,
                )}
              </dd>
            </div>

            <div className="customer-ticket-total">
              <dt>Total</dt>

              <dd>
                {formatMoney(
                  receipt.quote.totalCents,
                  receipt.quote.currency,
                )}
              </dd>
            </div>
          </dl>

          {detailsOpen && (
            <DemoTicketQR
              reference={receipt.reference}
              disabled={cancelled}
            />
          )}

          <p className="customer-ticket-note">
            {paymentLabel}.
            {" "}This project uses simulated payments.
          </p>
        </div>
      </details>
    </article>
  );
}


/*
 * PAGE
 *
 * onExploreMovies():
 * Supplied by App to return to the movie catalogue.
 */
function BookingHistory({
  onExploreMovies,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    user,
    status,
    sessionError,
    isSessionLoading,
    isCustomer,
    refreshSession,
  } = useAuth();


  /*
   * FILTERS
   *
   * Changing a filter resets pagination in the same state update.
   */
  const [filters, setFilters] = useState({
    cinemaId: "",
    date: "",
    page: 1,
  });


  /*
   * DEMO STORE UPDATES
   *
   * Refreshes receipts after local purchases/cancellations.
   * API mode uses explicit requests and the refresh button.
   */
  const snapshot = useSyncExternalStore(
    bookingService.subscribe,
    bookingService.getSnapshot,
    bookingService.getSnapshot,
  );


  /*
   * LOAD CINEMA FILTER OPTIONS
   */
  const loadCinemas = useCallback(
    (signal) => {
      if (!bookingEnabled) {
        return Promise.resolve([]);
      }

      return collectPages(
        catalogue.listCinemas,
        { signal },
      );
    },
    [],
  );

  const cinemasResult =
    useResource(loadCinemas);

  const cinemas =
    cinemasResult.data ?? [];


  /*
   * LOAD ONE PAGE OF THE CURRENT CUSTOMER'S HISTORY
   *
   * Do not download every page automatically.
   * Filters are passed to the service.
   */
  const loadBookings = useCallback(
    async (signal) => {
      if (
        !bookingEnabled ||
        isSessionLoading ||
        status === "error" ||
        !user ||
        user.role !== "customer"
      ) {
        return null;
      }

      void snapshot;

      const response =
        await bookingService.listMyBookings(
          {
            cinemaId: filters.cinemaId,
            date: filters.date,
            page: filters.page,
            pageSize: PAGE_SIZE,
          },
          { signal },
        );

      return validateHistoryResponse(
        response,
      );
    },
    [
      user,
      status,
      isSessionLoading,
      filters,
      snapshot,
    ],
  );

  const bookingsResult =
    useResource(loadBookings);

  const receipts =
    bookingsResult.data?.data ?? [];

  const meta =
    bookingsResult.data?.meta;

  const hasFilters =
    filters.cinemaId !== "" ||
    filters.date !== "";


  function changeFilter(patch) {
    setFilters((previous) => ({
      ...previous,
      ...patch,
      page: 1,
    }));
  }

  function clearFilters() {
    setFilters({
      cinemaId: "",
      date: "",
      page: 1,
    });
  }

  function changePage(page) {
    setFilters((previous) => ({
      ...previous,
      page,
    }));
  }

  function openLogin() {
    navigate("/login", {
      state: {
        returnTo: location.pathname,
      },
    });
  }


  /*
   * CONFIGURATION / SESSION GUARDS
   *
   * App also guards this route, but the page remains safe if
   * it is mounted elsewhere later.
   */
  if (
    !bookingEnabled ||
    isSessionLoading ||
    status === "error" ||
    !isCustomer
  ) {
    return (
      <section className="container booking-history-page">
        <h1 tabIndex={-1}>
          Your bookings
        </h1>

        {!bookingEnabled ? (
          <p>
            Booking history is unavailable for the
            current configuration.
          </p>
        ) : isSessionLoading ? (
          <RequestState
            loading
            loadingMessage="Checking your session…"
          />
        ) : status === "error" ? (
          <RequestState
            error={sessionError}
            onRetry={() => {
              refreshSession();
            }}
          />
        ) : (
          <>
            <p>
              Sign in with the customer account used
              when purchasing.
            </p>

            <button
              type="button"
              className="primary-button"
              onClick={openLogin}
            >
              Customer login
            </button>
          </>
        )}
      </section>
    );
  }


  return (
    <section
      className="container booking-history-page"
      aria-labelledby="booking-history-title"
    >
      <h1
        id="booking-history-title"
        tabIndex={-1}
      >
        Your bookings
      </h1>

      <p className="booking-history-introduction">
        Purchases completed while signed in to your account.
        Guest contact emails do not attach guest purchases
        to an account.
      </p>


      {/* SERVER/SERVICE-SIDE FILTERS */}
      <form
        className="customer-history-filters"
        aria-label="Filter your bookings"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label htmlFor="history-cinema">
          <span>Cinema</span>

          <select
            id="history-cinema"
            value={filters.cinemaId}
            disabled={
              cinemasResult.loading ||
              Boolean(cinemasResult.error)
            }
            onChange={(event) => {
              changeFilter({
                cinemaId: event.target.value,
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

        <label htmlFor="history-date">
          <span>Screening date</span>

          <input
            id="history-date"
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
        onClick={bookingsResult.retry}
        disabled={bookingsResult.loading}
      >
        Refresh bookings
      </button>

      <RequestState
        loading={bookingsResult.loading}
        error={bookingsResult.error}
        onRetry={bookingsResult.retry}
        loadingMessage="Loading your bookings…"
      />


      {/* SUCCESSFUL RESULT */}
      {!bookingsResult.loading &&
        !bookingsResult.error &&
        meta && (
          <>
            <p
              className="results-count"
              role="status"
            >
              {meta.totalItems}
              {" "}
              {meta.totalItems === 1
                ? "booking"
                : "bookings"}
              {" "}found
            </p>

            {receipts.length > 0 ? (
              <div className="customer-booking-list">
                {receipts.map((receipt) => (
                  <BookingCard
                    key={receipt.reference}
                    receipt={receipt}
                  />
                ))}
              </div>
            ) : (
              <div className="customer-bookings-empty">
                <h2>
                  {hasFilters
                    ? "No matching bookings"
                    : "No bookings on this page"}
                </h2>

                <p>
                  {hasFilters
                    ? "Try another cinema or screening date."
                    : "Purchases completed while signed in appear here."}
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

                <button
                  type="button"
                  className="primary-button"
                  onClick={onExploreMovies}
                  disabled={
                    typeof onExploreMovies !==
                    "function"
                  }
                >
                  Explore movies
                  <span aria-hidden="true">
                    →
                  </span>
                </button>
              </div>
            )}

            {meta.totalPages > 1 && (
              <nav
                className="catalogue-pagination"
                aria-label="Booking history pages"
              >
                <button
                  type="button"
                  className="secondary-button"
                  disabled={filters.page <= 1}
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
                    filters.page >=
                    meta.totalPages
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

      {bookingMode === "demo" && (
        <p className="customer-ticket-note">
          Demo history includes purchases made through
          the new booking service during this running
          application. Records reset on browser refresh.
        </p>
      )}
    </section>
  );
}

export default BookingHistory;