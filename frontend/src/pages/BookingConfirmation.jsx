/*
 * FILE: frontend/src/pages/BookingConfirmation.jsx
 *
 * PURPOSE
 * -------
 * Loads and displays a completed booking.
 *
 * ROUTE
 * -----
 * /bookings/:reference/confirmation
 *
 * DATA SOURCE
 * -----------
 * booking.getBooking(reference)
 *
 * Demo mode:
 * Retrieves a receipt from the running demo service.
 * Receipts reset on browser refresh.
 *
 * API mode:
 * Retrieves the booking from Express.
 * The server verifies customer or guest-session access.
 *
 * IMPORTANT
 * ---------
 * A booking reference is not authentication.
 * This page never decides ownership by comparing contact emails.
 *
 * Prices are integer cents from the purchase-time quote.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  booking as bookingService,
  bookingEnabled,
  bookingMode,
} from "../services/booking.js";

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


/*
 * CHECK THE RECEIPT FIELDS USED BY THIS PAGE
 *
 * This catches a successful HTTP response that does not match
 * the agreed booking format.
 */
function validateReceipt(response, reference) {
  const receipt = response?.data;

  const allocationReleased = bookingMode === "api" &&
    (receipt?.bookingStatus === "expired" ||
      (receipt?.bookingStatus === "cancelled" && receipt.paymentStatus === "refunded")) &&
    Array.isArray(receipt.seats) &&
    receipt.seats.length === 0;

  const quoteFields = [
    "adultUnitPriceCents",
    "childUnitPriceCents",
    "adultSubtotalCents",
    "childSubtotalCents",
    "totalCents",
  ];

  const valid =
    receipt?.reference === reference &&
    typeof receipt.isGuest === "boolean" &&
    typeof receipt.movie?.title === "string" &&
    typeof receipt.cinema?.name === "string" &&
    typeof receipt.room?.name === "string" &&
    Number.isFinite(
      Date.parse(receipt.screening?.startsAt),
    ) &&
    ["scheduled", "cancelled"].includes(
      receipt.screening?.status,
    ) &&
    Array.isArray(receipt.seats) &&
    (allocationReleased || receipt.seats.length > 0) &&
    receipt.seats.every((seat) => {
      return (
        typeof seat.id === "string" &&
        typeof seat.label === "string" &&
        typeof seat.rowLabel === "string"
      );
    }) &&
    Number.isInteger(receipt.tickets?.adult) &&
    receipt.tickets.adult >= 0 &&
    Number.isInteger(receipt.tickets?.child) &&
    receipt.tickets.child >= 0 &&
    (allocationReleased || receipt.tickets.adult +
      receipt.tickets.child ===
      receipt.seats.length) &&
    receipt.quote?.currency === "EUR" &&
    quoteFields.every((field) => {
      return isValidMoneyAmount(
        receipt.quote?.[field],
      );
    });

  if (!valid) {
    throw new ApiError(
      "The server returned invalid booking information.",
      {
        code: "INVALID_RESPONSE",
      },
    );
  }

  return response;
}


/*
 * PROPS
 *
 * onBackToMovies():
 * App navigates to Home's movie section.
 *
 * onViewBookings():
 * App opens the signed-in customer's booking history.
 *
 * The old "booking" prop is no longer used.
 * This page retrieves its own receipt from the route reference.
 */
function BookingConfirmation({
  onBackToMovies,
  onViewBookings,
}) {
  const { reference } = useParams();

  const navigate = useNavigate();
  const location = useLocation();

  const headingRef = useRef(null);

  const {
    user,
    status,
    sessionError,
    isSessionLoading,
    isCustomer,
    refreshSession,
  } = useAuth();


  /*
   * SHARED DEMO UPDATES
   *
   * Owner cancellation changes the shared demo store.
   * A new snapshot triggers receipt reloading.
   *
   * API mode uses manual refresh here.
   */
  const snapshot = useSyncExternalStore(
    bookingService.subscribe,
    bookingService.getSnapshot,
    bookingService.getSnapshot,
  );


  /*
   * LOAD THE BOOKING
   *
   * Wait until session identity is known.
   * Reload if the signed-in user or demo snapshot changes.
   */
  const loadBooking = useCallback(
    async (signal) => {
      if (
        !bookingEnabled ||
        isSessionLoading ||
        status === "error"
      ) {
        return null;
      }

      if (
        user &&
        user.role !== "customer"
      ) {
        throw new ApiError(
          "Use the customer account that owns this booking.",
          {
            status: 403,
            code: "FORBIDDEN",
          },
        );
      }

      void snapshot;

      const response =
        await bookingService.getBooking(
          reference,
          { signal },
        );

      return validateReceipt(
        response,
        reference,
      );
    },
    [
      reference,
      isSessionLoading,
      status,
      user,
      snapshot,
    ],
  );

  const bookingResult =
    useResource(loadBooking);

  const receipt =
    bookingResult.data?.data;

  const retryPaymentStatus = bookingResult.retry;

  // Stripe return parameters are hints; only the backend determines payment.
  useEffect(() => {
    if (bookingMode !== "api" || receipt?.bookingStatus !== "pending") return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (++attempts > 12) {
        window.clearInterval(timer);
        return;
      }
      retryPaymentStatus();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [receipt?.reference, receipt?.bookingStatus, retryPaymentStatus]);



  /*
   * FOCUS THE LOADED CONFIRMATION HEADING
   *
   * Do not move focus again for every availability/store refresh
   * when the reference itself has not changed.
   */
  useEffect(() => {
    if (receipt?.reference) {
      headingRef.current?.focus({
        preventScroll: true,
      });
    }
  }, [receipt?.reference]);


  /*
   * CUSTOMER SIGN-IN RECOVERY
   *
   * Useful when an authenticated booking URL is opened after
   * the customer has signed out.
   *
   * Signing in with a guest contact email does not recover a
   * guest purchase; guest access requires its original session.
   */
  function openLogin() {
    navigate("/login", {
      state: {
        returnTo: location.pathname,
      },
    });
  }


  /*
   * CONFIGURATION / SESSION / REQUEST FEEDBACK
   */
  if (
    !bookingEnabled ||
    isSessionLoading ||
    status === "error" ||
    !receipt
  ) {
    return (
      <section className="container confirmation-page">
        <h1 tabIndex={-1}>
          Booking confirmation
        </h1>

        {!bookingEnabled ? (
          <p>
            Booking confirmation is unavailable for
            the current configuration.
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
          <RequestState
            loading={bookingResult.loading}
            error={bookingResult.error}
            onRetry={bookingResult.retry}
            loadingMessage="Loading your booking…"
          />
        )}

        {!user &&
          !isSessionLoading &&
          bookingResult.error && (
            <p className="confirmation-note">
              For a registered purchase, sign in to
              the account used when booking. Guest
              purchases require the original guest session.
            </p>
          )}

        {!user &&
          !isSessionLoading &&
          bookingResult.error && (
            <button
              type="button"
              className="secondary-button"
              onClick={openLogin}
            >
              Customer login
            </button>
          )}

        <button
          type="button"
          className="primary-button"
          onClick={onBackToMovies}
          disabled={
            typeof onBackToMovies !== "function"
          }
        >
          Back to movies
        </button>
      </section>
    );
  }


  /*
   * DISPLAY STATUS
   *
   * Cancellation does not erase the purchase-time receipt.
   * The QR is hidden for cancelled bookings/screenings.
   */
  if (bookingMode === "api" &&
      (receipt.bookingStatus !== "confirmed" || receipt.paymentStatus !== "paid")) {
    const pending = receipt.bookingStatus === "pending";
    const refunded = receipt.paymentStatus === "refunded";
    let resumeUrl = null;
    if (pending && typeof receipt.checkoutUrl === "string") {
      try {
        const url = new URL(receipt.checkoutUrl);
        if (url.protocol === "https:" && url.hostname === "checkout.stripe.com" &&
            !url.username && !url.password) resumeUrl = url.href;
      } catch {
        // No payment link is displayed for malformed backend URLs.
      }
    }
    const returnedWithoutPayment = new URLSearchParams(location.search).get("checkout") === "cancelled";
    return (
      <section className="container section">
        <h1 ref={headingRef} tabIndex={-1}>
          {refunded ? "Payment refunded" : pending ? "Payment awaiting confirmation" : "Booking not confirmed"}
        </h1>
        <p>Booking reference: {receipt.reference}</p>
        <p role="status">
          {pending
            ? returnedWithoutPayment
              ? "You returned from checkout without completing payment. This booking is still pending."
              : "The backend has not confirmed payment yet. We will check for updates briefly; you can also refresh the status."
            : refunded
              ? "Your payment was refunded. You can choose another screening or seats."
              : "This booking does not have a confirmed payment. No admission ticket is available."}
        </p>
        {resumeUrl && (
          <a className="primary-button" href={resumeUrl}>Continue payment on Stripe</a>
        )}
        <button type="button" className="secondary-button" onClick={bookingResult.retry}
          disabled={bookingResult.loading}>Refresh payment status</button>
        <button type="button" className="secondary-button" onClick={onBackToMovies}>Back to movies</button>
      </section>
    );
  }

  const screeningCancelled =
    receipt.screening.status === "cancelled";

  const bookingCancelled =
    receipt.bookingStatus === "cancelled";

  const cancelled =
    screeningCancelled || bookingCancelled;

  const paymentDescription =
    receipt.paymentStatus === "simulated"
      ? "Payment simulated · No money charged"
      : receipt.paymentStatus === "paid" ? "Payment confirmed" : "Payment status unavailable";

  const canViewHistory =
    !receipt.isGuest &&
    isCustomer &&
    typeof onViewBookings === "function";


  return (
    <section
      className="container confirmation-page"
      aria-labelledby="confirmation-title"
    >
      <div className="confirmation-heading">
        <div
          className="confirmation-icon"
          aria-hidden="true"
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {cancelled ? (
              <path d="m6 6 12 12M18 6 6 18" />
            ) : (
              <path d="m5 12 4 4L19 6" />
            )}
          </svg>
        </div>

        <h1
          id="confirmation-title"
          ref={headingRef}
          tabIndex={-1}
        >
          {screeningCancelled
            ? "Your screening has been cancelled"
            : bookingCancelled
              ? "Your booking has been cancelled"
              : "Your booking is confirmed"}
        </h1>

        <p className="confirmation-reference">
          Booking reference:{" "}
          <strong>
            {receipt.reference}
          </strong>
        </p>

        <span className="confirmation-status">
          {cancelled && "Cancelled · "}
          {paymentDescription}
        </span>
      </div>


      {/* PURCHASE-TIME SCREENING AND PRICES */}
      <article
        className="confirmation-card"
        aria-labelledby="confirmation-screening-title"
      >
        <h2 id="confirmation-screening-title">
          Your screening
        </h2>

        <p className="confirmation-screening">
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
        </p>

        <dl className="confirmation-prices">
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

          <div className="confirmation-total">
            <dt>Total</dt>

            <dd>
              {formatMoney(
                receipt.quote.totalCents,
                receipt.quote.currency,
              )}
            </dd>
          </div>
        </dl>

        {bookingMode === "demo" ? (
          <DemoTicketQR reference={receipt.reference} disabled={cancelled} />
        ) : (
          <p>Keep your booking reference. Secure admission QR tickets are not connected yet.</p>
        )}

        {receipt.isGuest ? (
          <p className="confirmation-note">
            You booked as a guest. Keep your booking reference.
            Guest booking access requires this original
            session; no confirmation email is sent.
          </p>
        ) : (
          <p className="confirmation-note">
            This booking belongs to the customer account
            used when purchasing. Booking contact details
            can differ from that account's email.
          </p>
        )}

        {bookingMode === "demo" && (
          <p className="confirmation-note">
            Demo records are stored only in this running
            application and reset on browser refresh.
          </p>
        )}

        <p className="confirmation-note">
          {bookingMode === "demo"
            ? "This project uses simulated payments."
            : "Payment confirmation is provided by the backend."}
          The demo QR is not validated for cinema admission.
        </p>
      </article>


      {/* NAVIGATION AND STATUS REFRESH */}
      <div className="confirmation-actions">
        <button
          type="button"
          className="primary-button"
          onClick={onBackToMovies}
          disabled={
            typeof onBackToMovies !== "function"
          }
        >
          Back to movies
        </button>

        {canViewHistory && (
          <button
            type="button"
            className="secondary-button"
            onClick={onViewBookings}
          >
            Booking history
          </button>
        )}

        <button
          type="button"
          className="secondary-button"
          onClick={bookingResult.retry}
        >
          Refresh booking status
        </button>
      </div>
    </section>
  );
}

export default BookingConfirmation;