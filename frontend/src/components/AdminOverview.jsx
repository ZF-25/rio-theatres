/*
 * FILE: frontend/src/components/AdminOverview.jsx
 *
 * PURPOSE
 * -------
 * Displays the owner's daily cinema overview.
 *
 * DATA SOURCE
 * -----------
 * ownerService.getOverview({ date })
 *
 * STATISTICS
 * ----------
 * screeningCount:
 * Scheduled screenings on the selected Helsinki calendar date.
 *
 * bookingCount:
 * Booking records for screenings on that date, including records
 * retained after screening cancellation.
 *
 * availableSeatCount:
 * Available seats across scheduled screenings on that date that
 * have not started.
 *
 * IMPORTANT
 * ---------
 * This component does not calculate these statistics from frontend
 * movie/booking arrays.
 *
 * Demo mode calculates them through demoOwner.
 * API mode obtains them from Express.
 */

import {
  useCallback,
  useState,
  useSyncExternalStore,
} from "react";

import {
  ownerService,
  staffEnabled,
} from "../services/staff.js";

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
  cinemaDate,
} from "../utils/cinemaTime.js";

import RequestState from "./RequestState.jsx";


/*
 * CHECK THE OVERVIEW RESPONSE
 *
 * Zero is a valid count.
 * Missing values must not silently display as zero.
 */
function validateOverview(
  response,
  requestedDate,
) {
  const overview = response?.data;

  const countFields = [
    "screeningCount",
    "bookingCount",
    "availableSeatCount",
  ];

  const valid =
    overview?.date === requestedDate &&
    countFields.every((field) => {
      return (
        Number.isSafeInteger(
          overview[field],
        ) &&
        overview[field] >= 0
      );
    });

  if (!valid) {
    throw new ApiError(
      "The server returned invalid overview statistics.",
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
 * onTabChange(tab):
 * Dashboard navigation supplied by the dashboard shell.
 *
 * Supported destinations used here:
 * screenings, bookings, seats, cashiers
 */
function AdminOverview({
  onTabChange,
}) {
  const {
    staff,
    isOwner,
    status,
    sessionError,
    isSessionLoading,
    refreshSession,
  } = useStaffSession();


  /*
   * INITIAL DATE
   *
   * Calculate today's Helsinki date once during state
   * initialisation, not repeatedly during rendering.
   */
  const [date, setDate] = useState(
    () => cinemaDate(),
  );


  /*
   * SHARED DEMO CHANGES
   *
   * ownerService combines cinema/staff snapshots in demo mode.
   * API mode uses a stable empty snapshot.
   */
  const snapshot = useSyncExternalStore(
    ownerService.subscribe,
    ownerService.getSnapshot,
    ownerService.getSnapshot,
  );


  /*
   * LOAD THE SELECTED DAY
   *
   * Wait for confirmed owner identity.
   * Clearing the date does not send an incomplete request.
   */
  const loadOverview = useCallback(
    async (signal) => {
      if (
        !staffEnabled ||
        isSessionLoading ||
        status === "error" ||
        staff?.role !== "owner" ||
        !date
      ) {
        return null;
      }

      void snapshot;

      const response =
        await ownerService.getOverview(
          { date },
          { signal },
        );

      return validateOverview(
        response,
        date,
      );
    },
    [
      staff,
      status,
      isSessionLoading,
      date,
      snapshot,
    ],
  );

  const overviewResult =
    useResource(loadOverview);

  const overview =
    overviewResult.data?.data;


  /*
   * SESSION / PERMISSION FEEDBACK
   *
   * App guards the route too.
   * Keep the component safe if reused elsewhere.
   */
  if (
    !staffEnabled ||
    isSessionLoading ||
    status === "error" ||
    !isOwner
  ) {
    return (
      <section
        className="admin-overview"
        aria-labelledby="owner-overview-title"
      >
        <h2 id="owner-overview-title">
          Daily overview
        </h2>

        {!staffEnabled ? (
          <p>
            Staff operations are unavailable for
            the selected catalogue.
          </p>
        ) : isSessionLoading ? (
          <RequestState
            loading
            loadingMessage="Checking owner access…"
          />
        ) : status === "error" ? (
          <RequestState
            error={sessionError}
            onRetry={() => {
              refreshSession();
            }}
          />
        ) : (
          <p>
            Sign in with an active owner account
            to view these statistics.
          </p>
        )}
      </section>
    );
  }


  return (
    <section
      className="admin-overview"
      aria-labelledby="owner-overview-title"
    >
      <h2 id="owner-overview-title">
        Daily overview
      </h2>

      <p className="admin-introduction">
        Statistics use Finland's local calendar date.
      </p>


      {/* DATE SELECTION / MANUAL REFRESH */}
      <form
        className="owner-overview-controls"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label htmlFor="owner-overview-date">
          <span>Screening date</span>

          <input
            id="owner-overview-date"
            type="date"
            value={date}
            required
            onChange={(event) => {
              setDate(event.target.value);
            }}
          />
        </label>

        <button
          type="button"
          className="secondary-button"
          onClick={overviewResult.retry}
          disabled={
            !date ||
            overviewResult.loading
          }
        >
          Refresh overview
        </button>
      </form>


      {!date ? (
        <p role="status">
          Choose a date to view its overview.
        </p>
      ) : (
        <RequestState
          loading={overviewResult.loading}
          error={overviewResult.error}
          onRetry={overviewResult.retry}
          loadingMessage="Loading overview…"
        />
      )}


      {/* SERVICE-RETURNED STATISTICS */}
      {overview && (
        <div className="admin-stat-grid">
          <article className="admin-stat-card">
            <h3>
              Scheduled screenings
            </h3>

            <strong>
              {overview.screeningCount.toLocaleString(
                "en-GB",
              )}
            </strong>

            <p>
              On the selected date.
              Cancelled screenings excluded.
            </p>
          </article>

          <article className="admin-stat-card">
            <h3>
              Booking records
            </h3>

            <strong>
              {overview.bookingCount.toLocaleString(
                "en-GB",
              )}
            </strong>

            <p>
              For screenings on this date.
              Includes records retained after cancellation.
            </p>
          </article>

          <article className="admin-stat-card">
            <h3>
              Available seats
            </h3>

            <strong>
              {overview.availableSeatCount.toLocaleString(
                "en-GB",
              )}
            </strong>

            <p>
              For screenings that have not started.
              Excludes booked, held, reserved, and blocked seats.
            </p>
          </article>
        </div>
      )}


      {/* DASHBOARD NAVIGATION */}
      <nav
        className="admin-quick-actions"
        aria-label="Owner overview actions"
      >
        {[
          ["screenings", "Manage screenings"],
          ["bookings", "View bookings"],
          ["seats", "Seats and reservations"],
          ["cashiers", "Manage cashiers"],
        ].map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={
              tab === "screenings"
                ? "primary-button"
                : "secondary-button"
            }
            disabled={
              typeof onTabChange !== "function"
            }
            onClick={() => {
              onTabChange(tab);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
    </section>
  );
}

export default AdminOverview;