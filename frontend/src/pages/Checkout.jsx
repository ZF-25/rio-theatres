/*
 * FILE: frontend/src/pages/Checkout.jsx
 *
 * PURPOSE
 * -------
 * Displays and completes a service-based checkout hold.
 *
 * FEATURES
 * --------
 * - Loads the hold, authoritative price, screening, and seats.
 * - Displays the original hold countdown.
 * - Supports guest checkout and customer login.
 * - Preserves booking contacts when navigating to login.
 * - Saves unfinished purchase operations for safe retries.
 * - Simulates payment in demo mode or redirects to Stripe in API mode.
 *
 * ACCOUNT NAME UPDATE
 * -------------------
 * Account profiles use firstName and lastName.
 * These are combined for display and initial contact prefill.
 *
 * Booking contacts remain { name, email }.
 * They can differ from the signed-in account.
 *
 * NAVIGATION CALLBACKS
 * --------------------
 * onLogin(draft): saves contacts and opens customer login.
 * onBack(draft): releases the hold through App and returns to seats.
 * onBookingCreated(booking): opens the booking confirmation.
 *
 * Prices come from hold.quote and use integer cents.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useLocation, useParams } from "react-router-dom";

import {
  booking as bookingService,
  bookingEnabled,
  bookingMode,
} from "../services/booking.js";

import { createOperationKey } from "../services/apiBooking.js";

import { ApiError } from "../services/apiClient.js";
import { catalogue } from "../services/catalogue.js";

import { useAuth } from "../hooks/useAuth.js";
import { useResource } from "../hooks/useResource.js";

import { useBookingScreening } from "../hooks/useBookingScreening.js";

import { useHoldCountdown } from "../hooks/useHoldCountdown.js";

import { formatMoney, isValidMoneyAmount } from "../utils/money.js";

import { cinemaTime, formatCinemaDate } from "../utils/cinemaTime.js";

import { getUserDisplayName } from "../utils/userName.js";

import RequestState from "../components/RequestState.jsx";

/*
 * TAB-LOCAL CHECKPOINT
 *
 * Stores booking contacts and an unfinished purchase operation.
 * No password, session cookie, or card information is stored.
 *
 * A purchase retry must reuse the SAME key and request body.
 */
function checkpointKey(holdId) {
  return `rio:checkout:${holdId}`;
}

function readCheckpoint(holdId) {
  try {
    const raw = sessionStorage.getItem(checkpointKey(holdId));

    if (!raw) {
      return null;
    }

    const saved = JSON.parse(raw);

    if (
      saved.holdId !== holdId ||
      typeof saved.customer?.name !== "string" ||
      typeof saved.customer?.email !== "string"
    ) {
      return null;
    }

    if (
      saved.purchase &&
      (typeof saved.purchase.key !== "string" ||
        !saved.purchase.key ||
        saved.purchase.body?.holdId !== holdId ||
        typeof saved.purchase.body.customer?.name !== "string" ||
        typeof saved.purchase.body.customer?.email !== "string")
    ) {
      return null;
    }

    return saved;
  } catch {
    return null;
  }
}

function writeCheckpoint(holdId, value) {
  try {
    sessionStorage.setItem(checkpointKey(holdId), JSON.stringify(value));
  } catch {
    // In-memory state still works when storage is unavailable.
  }
}

function clearCheckpoint(holdId) {
  try {
    sessionStorage.removeItem(checkpointKey(holdId));
  } catch {
    // Storage restrictions must not crash checkout.
  }
}

/*
 * Reset local page state when the hold URL changes.
 */
function Checkout({ contactDraft, onLogin, onBack, onBookingCreated, onNavigationLockChange }) {
  const { holdId } = useParams();

  return (
    <CheckoutContent
      key={holdId}
      holdId={holdId}
      contactDraft={contactDraft}
      onLogin={onLogin}
      onBack={onBack}
      onBookingCreated={onBookingCreated}
      onNavigationLockChange={onNavigationLockChange}
    />
  );
}

function CheckoutContent({
  holdId,
  contactDraft,
  onLogin,
  onBack,
  onBookingCreated,
  onNavigationLockChange,
}) {
  const location = useLocation();

  const {
    user,
    isCustomer,
    isSessionLoading,
    status,
    sessionError,
    refreshSession,
  } = useAuth();

  const customer = isCustomer ? user : null;

  /*
   * RESTORE CONTACTS / UNFINISHED PURCHASE
   *
   * An unfinished purchase's original contacts take priority.
   * Changing its request body would invalidate its retry key.
   */
  const [saved] = useState(() => readCheckpoint(holdId));

  const matchingDraft = contactDraft?.holdId === holdId ? contactDraft : null;

  const [contact, setContact] = useState(() => {
    const source =
      saved?.purchase?.body.customer ??
      matchingDraft?.customer ??
      saved?.customer;

    /*
     * Account names are separate fields.
     * Combine them only for the booking contact prefill.
     *
     * Do not use getUserDisplayName() here: its email or "User"
     * fallback should not become a booking contact name.
     *
     * The legacy name fallback supports older demo profiles.
     */
    const accountFullName = [customer?.firstName, customer?.lastName]
      .filter((part) => typeof part === "string" && part.trim() !== "")
      .map((part) => part.trim())
      .join(" ");

    return {
      name: source?.name ?? (accountFullName || customer?.name || ""),

      email: source?.email ?? customer?.email ?? "",
    };
  });

  const [purchase, setPurchase] = useState(saved?.purchase ?? null);

  const purchaseRef = useRef(saved?.purchase ?? null);

  // Keep header navigation/session changes blocked during purchase recovery.
  useEffect(() => {
    onNavigationLockChange?.(Boolean(purchaseRef.current));
    return () => {
      if (!purchaseRef.current) onNavigationLockChange?.(false);
    };
  }, [onNavigationLockChange]);

  const [submitting, setSubmitting] = useState(false);
  const [released, setReleased] = useState(false);
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
   * LOAD HOLD AND DISPLAY INFORMATION
   *
   * Capture receivedAt immediately after the hold response.
   * The countdown uses it together with hold.serverNow.
   */
  const loadCheckout = useCallback(
    async (signal) => {
      if (!bookingEnabled) {
        return null;
      }

      const holdResponse = await bookingService.getHold(holdId, { signal });

      const receivedAt = Date.now();
      const hold = holdResponse.data;

      if (
        hold?.id !== holdId ||
        hold.status !== "active" ||
        typeof hold.screeningId !== "string" ||
        !Array.isArray(hold.seatIds) ||
        !hold.seatIds.length ||
        !Number.isInteger(hold.tickets?.adult) ||
        !Number.isInteger(hold.tickets?.child) ||
        hold.tickets.adult < 0 ||
        hold.tickets.child < 0 ||
        hold.tickets.adult + hold.tickets.child !== hold.seatIds.length ||
        !Number.isFinite(Date.parse(hold.expiresAt)) ||
        !Number.isFinite(Date.parse(hold.serverNow)) ||
        hold.quote?.currency !== "EUR" ||
        !isValidMoneyAmount(hold.quote?.totalCents)
      ) {
        throw new ApiError(
          "The server returned invalid checkout information.",
          { code: "INVALID_RESPONSE" },
        );
      }

      const screeningResponse = await bookingService.getScreening(
        hold.screeningId,
        { signal },
      );

      const screening = screeningResponse.data;

      const [movieResponse, mapResponse] = await Promise.all([
        catalogue.getMovie(screening.movieId, { signal }),

        bookingService.getSeatMap(hold.screeningId, { signal }),
      ]);

      const seats = mapResponse.data.seats.filter((seat) =>
        hold.seatIds.includes(seat.id),
      );

      if (seats.length !== hold.seatIds.length) {
        throw new ApiError("The held seats do not match the screening map.", {
          code: "INVALID_RESPONSE",
        });
      }

      return {
        hold,
        screening,
        movie: movieResponse.data,
        seats,
        receivedAt,
      };
    },
    [holdId],
  );

  const checkoutResult = useResource(loadCheckout);

  const checkout = checkoutResult.data;
  const hold = checkout?.hold;

  /*
   * SCREENING CONTEXT
   *
   * Fallback IDs allow an expired checkout to return to seats
   * even when its hold can no longer be retrieved.
   */
  const screeningId =
    hold?.screeningId ??
    matchingDraft?.screeningId ??
    saved?.screeningId ??
    location.state?.screeningId;

  const availability = useBookingScreening(screeningId);

  const currentScreening = availability.screening ?? checkout?.screening;

  /*
   * ORIGINAL HOLD COUNTDOWN
   *
   * Returning from login never creates a new expiry.
   */
  const countdown = useHoldCountdown({
    expiresAt: hold?.expiresAt,
    serverNow: hold?.serverNow,
    receivedAt: checkout?.receivedAt,
    enabled: Boolean(hold && !released),
  });

  /*
   * AUTHENTICATION / CHECKOUT GUARDS
   *
   * An unfinished purchase can be retried after hold expiry:
   * the original request may already have succeeded.
   *
   * The service/backend resolves that using the original
   * idempotency key.
   */
  const sessionBlocked =
    isSessionLoading || status === "error" || Boolean(user && !isCustomer);

  const recoveringPurchase = purchase !== null;

  const contactLocked = submitting || recoveringPurchase;

  const screeningUnavailable = Boolean(
    currentScreening && currentScreening.status !== "scheduled",
  );

  const canStartPurchase = Boolean(
    checkout &&
    countdown.isReady &&
    !countdown.isExpired &&
    !released &&
    availability.isBookable &&
    !sessionBlocked,
  );

  const canSubmit = Boolean(
    bookingEnabled &&
    typeof onBookingCreated === "function" &&
    !submitting &&
    !sessionBlocked &&
    (recoveringPurchase || canStartPurchase),
  );

  /*
   * CONTACT DRAFT / STORAGE
   *
   * Booking contacts keep their existing name/email structure.
   */
  function buildDraft(nextContact = contact) {
    return {
      holdId,
      screeningId,
      customer: {
        name: nextContact.name,
        email: nextContact.email,
      },
    };
  }

  function persist(nextContact, nextPurchase = purchaseRef.current) {
    writeCheckpoint(holdId, {
      ...buildDraft(nextContact),
      purchase: nextPurchase,
    });
  }

  function changeContact(field, value) {
    if (contactLocked) {
      return;
    }

    const nextContact = {
      ...contact,
      [field]: value,
    };

    setContact(nextContact);
    setError("");
    persist(nextContact);
  }

  /*
   * CHECKOUT -> LOGIN
   *
   * Save contacts before unmounting.
   * App preserves this checkout's return destination.
   */
  function openLogin() {
    if (contactLocked || typeof onLogin !== "function") {
      return;
    }

    persist(contact);
    onLogin(buildDraft());
  }

  /*
   * CHECKOUT -> SEAT SELECTION
   *
   * App releases the hold before navigating.
   * Do not abandon an uncertain purchase through this control.
   */
  async function returnToSeats() {
    if (
      submissionInProgress.current ||
      recoveringPurchase ||
      typeof onBack !== "function"
    ) {
      return;
    }

    submissionInProgress.current = true;
    setSubmitting(true);
    setError("");

    persist(contact);

    try {
      await onBack(buildDraft());
    } catch (requestError) {
      if (mounted.current) {
        setError(requestError.message || "Unable to return to seat selection.");
      }
    } finally {
      submissionInProgress.current = false;

      if (mounted.current) {
        setSubmitting(false);
      }
    }
  }

  /*
   * PURCHASE / RECOVER PURCHASE RESULT
   *
   * New purchase:
   * - Validate contacts.
   * - Confirm that the hold still exists.
   * - Save the exact request and key before submitting.
   *
   * Recovery:
   * - Reuse the saved request and key.
   * - Do not require the old hold to remain active.
   * - Retrieve the original operation result.
   */
  async function submitPurchase(event) {
    event?.preventDefault();

    if (submissionInProgress.current || !canSubmit) {
      return;
    }

    submissionInProgress.current = true;
    onNavigationLockChange?.(true);
    setSubmitting(true);
    setError("");

    try {
      let pending = purchaseRef.current;

      if (!pending) {
        const name = contact.name.trim();
        const email = contact.email.trim();

        if (
          !name ||
          name.length > 100 ||
          email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
          setError("Enter a valid contact name and email.");
          return;
        }

        // Recheck the hold before starting a NEW purchase.
        await bookingService.getHold(holdId);

        pending = {
          key: createOperationKey(),
          body: {
            holdId,
            customer: {
              name,
              email,
            },
          },
        };

        purchaseRef.current = pending;
        setPurchase(pending);
        persist(contact, pending);
      }

      /*
       * Navigating away cannot cancel an already committed
       * purchase. Keep the operation checkpoint for recovery.
       */
      const response = await bookingService.createBooking(pending.body, {
        idempotencyKey: pending.key,
      });

      if (typeof response.data?.reference !== "string") {
        throw new ApiError(
          "The booking response did not contain a reference.",
          { code: "INVALID_RESPONSE" },
        );
      }

      if (!mounted.current) {
        // Preserve the checkpoint for recovery on return.
        return;
      }

      const receipt = response.data;
      if (bookingMode === "api" && receipt.bookingStatus === "pending") {
        // A pending booking is not a ticket. Retain the operation checkpoint
        // so a failed redirect can retry the same request without duplicating it.
        let checkoutUrl;
        try {
          checkoutUrl = new URL(receipt.checkoutUrl);
        } catch {
          throw new ApiError("The payment checkout URL is missing or invalid.", {
            code: "INVALID_RESPONSE",
          });
        }
        if (checkoutUrl.protocol !== "https:" ||
            checkoutUrl.hostname !== "checkout.stripe.com" ||
            checkoutUrl.username || checkoutUrl.password) {
          throw new ApiError("The payment checkout URL is unsupported.", {
            code: "INVALID_RESPONSE",
          });
        }
        window.location.assign(checkoutUrl.href);
        return;
      }
      if (bookingMode === "api" &&
          (receipt.bookingStatus !== "confirmed" || receipt.paymentStatus !== "paid")) {
        throw new ApiError("Payment has not been confirmed. Check your booking status before trying again.", {
          code: "INVALID_RESPONSE",
        });
      }
      await onBookingCreated(receipt);

      clearCheckpoint(holdId);
      purchaseRef.current = null;

      if (mounted.current) {
        setPurchase(null);
      }
    } catch (requestError) {
      if (!mounted.current) {
        return;
      }

      setError(
        requestError.message || "Unable to confirm the purchase result.",
      );

      const uncertain =
        !requestError.status ||
        requestError.status >= 500 ||
        requestError.code === "INVALID_RESPONSE";

      if (!uncertain) {
        /*
         * A definite rejection allows editing again.
         * An uncertain result retains the exact operation.
         */
        purchaseRef.current = null;
        setPurchase(null);
        persist(contact, null);
        checkoutResult.retry();
      }
    } finally {
      submissionInProgress.current = false;
      onNavigationLockChange?.(Boolean(purchaseRef.current));

      if (mounted.current) {
        setSubmitting(false);
      }
    }
  }

  /*
   * DEMO EXPIRY PREVIEW
   *
   * This control is never displayed for API bookings.
   */
  async function previewExpiredHold() {
    if (submitting || recoveringPurchase || bookingMode !== "demo") {
      return;
    }

    setError("");

    try {
      await bookingService.releaseHold(holdId);

      if (mounted.current) {
        setReleased(true);
      }
    } catch (requestError) {
      if (mounted.current) {
        setError(requestError.message || "Unable to release the demo hold.");
      }
    }
  }

  /*
   * INITIAL LOADING / UNAVAILABLE / PURCHASE RECOVERY
   *
   * A saved purchase may need recovery even if the hold
   * endpoint now reports an expired or consumed hold.
   */
  if (!bookingEnabled || !checkout) {
    return (
      <section className="container checkout-page">
        <h1 tabIndex={-1}>
          {recoveringPurchase ? "Recover your booking result" : "Checkout"}
        </h1>

        {!bookingEnabled ? (
          <p>Booking is unavailable for the current configuration.</p>
        ) : recoveringPurchase ? (
          <>
            <p>
              A previous purchase request has not been resolved. Retry it to
              retrieve its result. The same operation key will be reused.
            </p>

            {error && (
              <p className="admin-edit-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              className="primary-button"
              disabled={!canSubmit}
              onClick={submitPurchase}
            >
              {submitting ? "Checking purchase…" : "Retry purchase result"}
            </button>
          </>
        ) : (
          <>
            <RequestState
              loading={checkoutResult.loading}
              error={checkoutResult.error}
              onRetry={checkoutResult.retry}
              loadingMessage="Loading checkout…"
            />

            {error && (
              <p className="admin-edit-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              className="secondary-button"
              onClick={returnToSeats}
              disabled={submitting || typeof onBack !== "function"}
            >
              Back to seat selection
            </button>
          </>
        )}

        {status === "error" && (
          <RequestState
            error={sessionError}
            onRetry={() => {
              refreshSession();
            }}
          />
        )}

        {isSessionLoading && (
          <RequestState loading loadingMessage="Checking your session…" />
        )}
      </section>
    );
  }

  const { movie, seats } = checkout;
  const quote = hold.quote;

  return (
    <section
      className="container checkout-page"
      aria-labelledby="checkout-title"
    >
      {/* HOLD STATUS */}
      <div
        className={`checkout-hold-banner ${
          released || countdown.isExpired || screeningUnavailable
            ? "is-expired"
            : ""
        }`}
      >
        {recoveringPurchase ? (
          <p role="status">
            A purchase request needs confirmation. Retry using the original
            operation.
          </p>
        ) : screeningUnavailable ? (
          <p role="alert">This screening has been cancelled.</p>
        ) : released || countdown.isExpired ? (
          <p role="alert">
            Your hold has expired or been released. Return to seat selection.
          </p>
        ) : !countdown.isReady ? (
          <p role="status">Checking hold time…</p>
        ) : (
          <p>
            <strong>
              Seats held ·{" "}
              <span role="timer" aria-label="Time remaining">
                {countdown.formatted}
              </span>{" "}
              remaining
            </strong>
          </p>
        )}
      </div>

      <div className="checkout-layout">
        <div className="checkout-main">
          <h1 id="checkout-title" tabIndex={-1}>
            Complete your booking
          </h1>

          {customer ? (
            <p className="checkout-introduction">
              Signed in as <strong>{getUserDisplayName(customer)}</strong>.{" "}
              Confirm your booking contact details.
            </p>
          ) : (
            <p className="checkout-introduction">
              Continue as a guest or{" "}
              <button
                type="button"
                className="checkout-login-link"
                onClick={openLogin}
                disabled={contactLocked || typeof onLogin !== "function"}
              >
                log in
              </button>
              .
            </p>
          )}

          <RequestState
            error={availability.error}
            onRetry={availability.retry}
          />

          {isSessionLoading && (
            <RequestState loading loadingMessage="Checking your session…" />
          )}

          {status === "error" && (
            <RequestState
              error={sessionError}
              onRetry={() => {
                refreshSession();
              }}
            />
          )}

          <form
            className="checkout-form"
            onSubmit={submitPurchase}
            aria-busy={submitting}
            noValidate
          >
            {/* Booking contact name remains a single field. */}
            <label htmlFor="checkout-name">
              <span>{customer ? "Name" : "Guest name"}</span>

              <input
                id="checkout-name"
                name="name"
                type="text"
                autoComplete="name"
                maxLength={100}
                value={contact.name}
                required
                disabled={contactLocked}
                onChange={(event) => {
                  changeContact("name", event.target.value);
                }}
              />
            </label>

            <label htmlFor="checkout-email">
              <span>Email</span>

              <input
                id="checkout-email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                value={contact.email}
                required
                disabled={contactLocked}
                onChange={(event) => {
                  changeContact("email", event.target.value);
                }}
              />
            </label>

            <p className="checkout-contact-note">
              These details belong to this booking. They can differ from your
              account details. No confirmation email is sent by this project.
            </p>

            <div className="checkout-payment-notice">
              {bookingMode === "demo"
                ? "Simulated payment only. No money will be charged."
                : "Continue to Stripe test checkout. Your booking is confirmed only after the backend verifies payment."}
            </div>

            {error && (
              <p className="admin-edit-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="primary-button checkout-pay-button"
              disabled={!canSubmit}
            >
              {submitting
                ? "Checking purchase…"
                : recoveringPurchase
                  ? "Retry purchase result"
                  : `${bookingMode === "demo" ? "Simulate payment" : "Continue to Stripe"} · ${formatMoney(
                      quote.totalCents,
                      quote.currency,
                    )}`}
            </button>
          </form>

          <div className="checkout-secondary-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={returnToSeats}
              disabled={contactLocked || typeof onBack !== "function"}
            >
              Back to seats
            </button>

            {bookingMode === "demo" &&
              !released &&
              !countdown.isExpired &&
              !contactLocked && (
                <button
                  type="button"
                  className="checkout-preview-button"
                  onClick={previewExpiredHold}
                >
                  Preview expired hold
                </button>
              )}
          </div>
        </div>

        {/* AUTHORITATIVE HOLD QUOTE */}
        <aside
          className="checkout-summary"
          aria-labelledby="checkout-summary-title"
        >
          <h2 id="checkout-summary-title">Your screening</h2>

          <p className="checkout-screening">
            <strong>{movie.title}</strong>

            <span>
              {currentScreening.cinemaName}
              {" · "}
              {currentScreening.roomName}
            </span>

            <span>
              {formatCinemaDate(currentScreening.startsAt)}
              {" · "}
              {cinemaTime(currentScreening.startsAt)}
            </span>
          </p>

          <dl className="checkout-prices">
            <div>
              <dt>Seats</dt>
              <dd>{seats.map((seat) => seat.label).join(", ")}</dd>
            </div>

            <div>
              <dt>Adult × {hold.tickets.adult}</dt>
              <dd>{formatMoney(quote.adultSubtotalCents, quote.currency)}</dd>
            </div>

            <div>
              <dt>
                Child × {hold.tickets.child}
                {" · "}50% discount
              </dt>
              <dd>{formatMoney(quote.childSubtotalCents, quote.currency)}</dd>
            </div>

            <div className="checkout-total">
              <dt>Total</dt>
              <dd>{formatMoney(quote.totalCents, quote.currency)}</dd>
            </div>
          </dl>

          <p className="checkout-summary-note">
            Price supplied by your seat hold. Returning from login does not
            restart its expiry.
          </p>
        </aside>
      </div>
    </section>
  );
}

export default Checkout;
