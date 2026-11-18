/*
 * FILE: frontend/src/components/CashierReservations.jsx
 *
 * PURPOSE
 * -------
 * Lists unpaid staff reservations with search, theater/date/status
 * filters, pagination, edit navigation, and cancellation.
 *
 * THEATER ACCESS
 * --------------
 * Owners receive all theaters; cashiers receive assigned theaters.
 * The service independently enforces reservation permissions.
 *
 * DEPENDENCY FIX
 * --------------
 * Both loaders explicitly require staffId. Changing accounts
 * invalidates earlier reads without unnecessary-dependency warnings.
 *
 * PROPS
 * -----
 * screeningId: optional fixed screening filter.
 * onEditReservation(id): opens the editor.
 * onCreateReservation(): opens a new reservation.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  staffService,
  staffEnabled,
} from "../services/staff.js";

import { staffScreenings } from "../services/staffScreenings.js";
import { collectPages } from "../services/apiCatalogue.js";
import { ApiError } from "../services/apiClient.js";
import { useStaffSession } from "../hooks/useStaffSession.js";
import { useResource } from "../hooks/useResource.js";

import {
  cinemaTime,
  formatCinemaDate,
} from "../utils/cinemaTime.js";

import { getUserDisplayName } from "../utils/userName.js";
import RequestState from "./RequestState.jsx";

const PAGE_SIZE = 10;

function validReservation(reservation) {
  return Boolean(
    reservation &&
    typeof reservation.id === "string" &&
    typeof reservation.reference === "string" &&
    typeof reservation.screeningId === "string" &&
    typeof reservation.customerName === "string" &&
    typeof reservation.note === "string" &&
    Array.isArray(reservation.seats) &&
    reservation.seats.length > 0 &&
    reservation.seats.every(
      (seat) =>
        typeof seat?.id === "string" &&
        typeof seat.label === "string",
    ) &&
    Number.isInteger(reservation.version) &&
    reservation.version >= 1 &&
    ["active", "cancelled"].includes(reservation.status),
  );
}

function validateList(response) {
  const meta = response?.meta;

  if (
    !Array.isArray(response?.data) ||
    !meta ||
    !Number.isInteger(meta.page) ||
    meta.page < 1 ||
    !Number.isInteger(meta.pageSize) ||
    meta.pageSize < 1 ||
    !Number.isInteger(meta.totalItems) ||
    meta.totalItems < 0 ||
    !Number.isInteger(meta.totalPages) ||
    meta.totalPages !== Math.ceil(meta.totalItems / meta.pageSize) ||
    response.data.length > meta.pageSize ||
    !response.data.every(validReservation)
  ) {
    throw new ApiError(
      "The service returned an invalid reservation list.",
      { code: "INVALID_RESPONSE" },
    );
  }

  return response;
}

function CashierReservations({
  screeningId = null,
  onEditReservation,
  onCreateReservation,
}) {
  return (
    <ReservationList
      key={screeningId ?? "all-screenings"}
      screeningId={screeningId}
      onEditReservation={onEditReservation}
      onCreateReservation={onCreateReservation}
    />
  );
}

function ReservationList({
  screeningId,
  onEditReservation,
  onCreateReservation,
}) {
  const {
    staff,
    status: staffStatus,
    sessionError,
    isSessionLoading,
    refreshSession,
  } = useStaffSession();

  const hasAccess = Boolean(
    staffEnabled &&
    !isSessionLoading &&
    staffStatus === "authenticated" &&
    ["owner", "cashier"].includes(staff?.role),
  );

  const staffId = staff?.id;

  const [filters, setFilters] = useState({
    search: "",
    cinemaId: "",
    date: "",
    status: "active",
    page: 1,
  });

  const [refreshVersion, setRefreshVersion] = useState(0);
  const [pendingCancellation, setPendingCancellation] = useState(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState(null);

  const actionInProgress = useRef(false);
  const confirmationHeadingRef = useRef(null);
  const busy = busyAction !== null;

  /*
   * Demo notifications include inventory and assignment changes.
   * API lists refresh through explicit requests.
   */
  const snapshot = useSyncExternalStore(
    staffService.subscribe,
    staffService.getSnapshot,
    staffService.getSnapshot,
  );

  const loadTheaters = useCallback(
    async (signal) => {
      if (!hasAccess || !staffId) return [];

      void snapshot;
      void refreshVersion;

      return collectPages(
        staffScreenings.listTheaters,
        { signal },
      );
    },
    [hasAccess, staffId, snapshot, refreshVersion],
  );

  const theatersResult = useResource(loadTheaters);
  const theaters = theatersResult.data ?? [];

  const theatersReady =
    hasAccess &&
    !theatersResult.loading &&
    !theatersResult.error &&
    theatersResult.data !== undefined &&
    theatersResult.data !== null;

  const noTheaters =
    theatersReady && theaters.length === 0;

  /*
   * Do not silently broaden a filter after access is removed.
   */
  const unavailableFilter = Boolean(
    theatersReady &&
    filters.cinemaId &&
    !theaters.some((theater) => theater.id === filters.cinemaId),
  );

  const permissionKey = JSON.stringify([
    staffId,
    ...theaters.map((theater) => theater.id).sort(),
  ]);

  const canReadReservations =
    theatersReady && !noTheaters && !unavailableFilter;

  const loadReservations = useCallback(
    async (signal) => {
      if (!hasAccess || !staffId || !canReadReservations) {
        return null;
      }

      void snapshot;
      void refreshVersion;
      void permissionKey;

      const response = validateList(
        await staffService.listReservations(
          {
            search: filters.search,
            cinemaId: filters.cinemaId || undefined,
            screeningId: screeningId || undefined,
            date: filters.date || undefined,
            status: filters.status || undefined,
            page: filters.page,
            pageSize: PAGE_SIZE,
          },
          { signal },
        ),
      );

      const ids = [
        ...new Set(
          response.data.map((record) => record.screeningId),
        ),
      ];

      /*
       * Missing screening details must not remove reservations
       * from the service's paginated result.
       */
      const results = await Promise.allSettled(
        ids.map((id) =>
          staffScreenings.getScreening(id, { signal }),
        ),
      );

      signal?.throwIfAborted();

      const screenings = new Map();

      results.forEach((result, index) => {
        const screening =
          result.status === "fulfilled"
            ? result.value?.data
            : null;

        if (
          screening?.id === ids[index] &&
          Number.isFinite(Date.parse(screening.startsAt))
        ) {
          screenings.set(ids[index], screening);
        }
      });

      return {
        ...response,
        screenings,
        missingScreeningDetails: screenings.size !== ids.length,
      };
    },
    [
      hasAccess,
      canReadReservations,
      staffId,
      filters,
      screeningId,
      snapshot,
      refreshVersion,
      permissionKey,
    ],
  );

  const reservationsResult = useResource(loadReservations);
  const reservations = reservationsResult.data?.data ?? [];
  const meta = reservationsResult.data?.meta;

  const screenings =
    reservationsResult.data?.screenings ?? new Map();

  /*
   * Confirmations prepared under older permissions cannot
   * remain actionable after assignments change.
   */
  const visibleConfirmation =
    canReadReservations &&
    pendingCancellation?.permissionKey === permissionKey
      ? pendingCancellation
      : null;

  useEffect(() => {
    if (visibleConfirmation) {
      confirmationHeadingRef.current?.focus({
        preventScroll: true,
      });
    }
  }, [visibleConfirmation]);

  function resetConfirmation() {
    setPendingCancellation(null);
    setNeedsReload(false);
    setActionError("");
  }

  function changeFilter(patch) {
    resetConfirmation();
    setNotice("");
    setFilters((previous) => ({
      ...previous,
      ...patch,
      page: 1,
    }));
  }

  function clearFilters() {
    resetConfirmation();
    setNotice("");
    setFilters({
      search: "",
      cinemaId: "",
      date: "",
      status: "active",
      page: 1,
    });
  }

  function changePage(page) {
    resetConfirmation();
    setFilters((previous) => ({ ...previous, page }));
  }

  function refreshList() {
    resetConfirmation();
    setRefreshVersion((previous) => previous + 1);
  }

  /*
   * Load the latest record/version before cancellation review.
   */
  async function prepareCancellation(id) {
    if (
      actionInProgress.current ||
      !hasAccess ||
      !canReadReservations
    ) {
      return;
    }

    actionInProgress.current = true;
    setBusyAction("prepare");
    setActionError("");
    setNotice("");

    try {
      const response = await staffService.getReservation(id);

      if (
        !validReservation(response?.data) ||
        response.data.id !== id
      ) {
        throw new ApiError(
          "The service returned invalid reservation details.",
          { code: "INVALID_RESPONSE" },
        );
      }

      if (response.data.status === "cancelled") {
        resetConfirmation();
        setNotice("This reservation is already cancelled.");
        reservationsResult.retry();
        return;
      }

      setPendingCancellation({
        ...response.data,
        permissionKey,
      });

      setNeedsReload(false);
    } catch (requestError) {
      setActionError(
        requestError?.message ||
          "Unable to load the latest reservation.",
      );
    } finally {
      actionInProgress.current = false;
      setBusyAction(null);
    }
  }

  /*
   * Conflicts or uncertain results require another read/review.
   * Do not automatically cancel a newer reservation version.
   */
  async function confirmCancellation() {
    if (
      actionInProgress.current ||
      !visibleConfirmation ||
      needsReload ||
      !hasAccess
    ) {
      return;
    }

    actionInProgress.current = true;
    setBusyAction("cancel");
    setActionError("");

    try {
      const response = await staffService.cancelReservation(
        visibleConfirmation.id,
        { version: visibleConfirmation.version },
      );

      if (
        !validReservation(response?.data) ||
        response.data.id !== visibleConfirmation.id ||
        response.data.status !== "cancelled"
      ) {
        throw new ApiError(
          "The cancellation result could not be confirmed.",
          { code: "INVALID_RESPONSE" },
        );
      }

      const reference = visibleConfirmation.reference;

      resetConfirmation();
      setNotice(
        `Reservation ${reference} cancelled. Its reserved seats have been released.`,
      );

      reservationsResult.retry();
    } catch (requestError) {
      if (
        requestError?.status === 404 ||
        requestError?.status === 403
      ) {
        resetConfirmation();
        setNotice(
          "This reservation is no longer available to your account.",
        );
        setRefreshVersion((previous) => previous + 1);
      } else {
        setActionError(
          requestError?.message ||
            "Unable to confirm cancellation.",
        );

        if (
          !requestError?.status ||
          requestError.status >= 500 ||
          requestError.code === "INVALID_RESPONSE" ||
          requestError.code === "RESERVATION_CHANGED" ||
          requestError.code === "RESERVATION_CANCELLED" ||
          requestError.code === "RESERVATION_INACTIVE"
        ) {
          setNeedsReload(true);
        }
      }
    } finally {
      actionInProgress.current = false;
      setBusyAction(null);
    }
  }

  const hasFilters =
    filters.search.trim() !== "" ||
    filters.cinemaId !== "" ||
    filters.date !== "" ||
    filters.status !== "active";

  if (!hasAccess) {
    return (
      <section className="cashier-reservations">
        <h2>Reservations</h2>

        {isSessionLoading ? (
          <RequestState
            loading
            loadingMessage="Checking staff access…"
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
            An active owner or cashier account and matching staff
            catalogue are required.
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      className="cashier-reservations"
      aria-labelledby="staff-reservations-title"
    >
      <div className="admin-page-title-row">
        <h2 id="staff-reservations-title">Reservations</h2>

        <button
          type="button"
          className="primary-button"
          onClick={onCreateReservation}
          disabled={
            busy ||
            !theatersReady ||
            noTheaters ||
            typeof onCreateReservation !== "function"
          }
        >
          New reservation
        </button>
      </div>

      <p className="admin-preview-note">
        These are unpaid staff reservations, separate from completed
        customer purchases. Results are limited to theaters your
        account may access.
      </p>

      <RequestState
        loading={theatersResult.loading}
        error={theatersResult.error}
        onRetry={refreshList}
        loadingMessage="Loading permitted theaters…"
      />

      {noTheaters && (
        <p className="admin-notice" role="status">
          {staff?.role === "cashier"
            ? "No theaters are assigned to your account. Ask the owner to assign theater access."
            : "No theaters are available."}
        </p>
      )}

      {/* SERVICE-SIDE FILTERS */}
      <form
        className="cashier-reservation-filters"
        role="search"
        aria-label="Find reservations"
        onSubmit={(event) => event.preventDefault()}
      >
        <label>
          <span>Reference or customer name</span>
          <input
            type="search"
            maxLength={100}
            value={filters.search}
            disabled={busy || !theatersReady || noTheaters}
            onChange={(event) =>
              changeFilter({ search: event.target.value })
            }
          />
        </label>

        <label>
          <span>Theater</span>
          <select
            value={filters.cinemaId}
            disabled={busy || !theatersReady || noTheaters}
            onChange={(event) =>
              changeFilter({ cinemaId: event.target.value })
            }
          >
            <option value="">All permitted theaters</option>

            {unavailableFilter && (
              <option value={filters.cinemaId} disabled>
                Previously selected theater — access unavailable
              </option>
            )}

            {theaters.map((theater) => (
              <option key={theater.id} value={theater.id}>
                {theater.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Screening date</span>
          <input
            type="date"
            value={filters.date}
            disabled={busy || !theatersReady || noTheaters}
            onChange={(event) =>
              changeFilter({ date: event.target.value })
            }
          />
        </label>

        <label>
          <span>Reservation status</span>
          <select
            value={filters.status}
            disabled={busy || !theatersReady || noTheaters}
            onChange={(event) =>
              changeFilter({ status: event.target.value })
            }
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>

        <button
          type="button"
          className="secondary-button"
          onClick={clearFilters}
          disabled={busy || (!hasFilters && filters.page === 1)}
        >
          Reset filters
        </button>
      </form>

      {unavailableFilter && (
        <p className="admin-edit-error" role="alert">
          Your selected theater is no longer available. Reset the
          filters or choose another permitted theater.
        </p>
      )}

      <button
        type="button"
        className="secondary-button"
        onClick={refreshList}
        disabled={
          busy ||
          theatersResult.loading ||
          reservationsResult.loading
        }
      >
        Refresh reservations and access
      </button>

      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}

      {actionError && !visibleConfirmation && (
        <p className="admin-edit-error" role="alert">
          {actionError}
        </p>
      )}

      {/* CANCELLATION CONFIRMATION */}
      {visibleConfirmation && (
        <section
          className="admin-screening-confirmation"
          aria-labelledby="reservation-cancel-title"
          aria-busy={busy}
        >
          <h3
            id="reservation-cancel-title"
            ref={confirmationHeadingRef}
            tabIndex={-1}
          >
            Cancel reservation?
          </h3>

          <p>
            <strong>{visibleConfirmation.reference}</strong>
          </p>

          <p>
            {visibleConfirmation.customerName}
            {" · Seats "}
            {visibleConfirmation.seats
              .map((seat) => seat.label)
              .join(", ")}
          </p>

          <p>
            The reservation record will remain, and its reserved
            seats will be released.
          </p>

          {actionError && (
            <p className="admin-edit-error" role="alert">
              {actionError}
            </p>
          )}

          {needsReload && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                prepareCancellation(visibleConfirmation.id)
              }
            >
              Reload latest reservation
            </button>
          )}

          <div className="admin-confirmation-actions">
            <button
              type="button"
              className="admin-danger-button"
              onClick={confirmCancellation}
              disabled={busy || needsReload}
            >
              {busyAction === "cancel"
                ? "Cancelling…"
                : "Confirm cancellation"}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={resetConfirmation}
              disabled={busy}
            >
              Keep reservation
            </button>
          </div>
        </section>
      )}

      {canReadReservations && (
        <RequestState
          loading={reservationsResult.loading}
          error={reservationsResult.error}
          onRetry={refreshList}
          loadingMessage="Loading reservations…"
        />
      )}

      {/* RESULTS */}
      {canReadReservations &&
        !reservationsResult.loading &&
        !reservationsResult.error &&
        meta && (
          <>
            <p className="admin-results-count" role="status">
              {meta.totalItems} reservations found
            </p>

            {reservationsResult.data.missingScreeningDetails && (
              <p className="admin-edit-error" role="alert">
                Some screening details could not be loaded.
                Refresh the list to retry.
              </p>
            )}

            {reservations.length > 0 ? (
              <div
                className="admin-table-scroll"
                role="region"
                aria-label="Staff reservations table"
                tabIndex={0}
              >
                <table className="admin-table cashier-reservations-table">
                  <thead>
                    <tr>
                      <th scope="col">Reference</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Screening</th>
                      <th scope="col">Seats</th>
                      <th scope="col">Status</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {reservations.map((reservation) => {
                      const screening = screenings.get(
                        reservation.screeningId,
                      );

                      return (
                        <tr key={reservation.id}>
                          <td>{reservation.reference}</td>

                          <td>
                            <strong>{reservation.customerName}</strong>
                            <details>
                              <summary>Notes and staff</summary>
                              <p>{reservation.note || "No note"}</p>
                              <p>
                                Created by:{" "}
                                {getUserDisplayName(
                                  reservation.createdBy,
                                  "Not recorded",
                                )}
                              </p>
                            </details>
                          </td>

                          <td>
                            {screening ? (
                              <>
                                <strong>{screening.movieTitle}</strong>
                                <p>
                                  {screening.cinemaName}
                                  {" · "}
                                  {screening.roomName}
                                </p>
                                <p>
                                  {formatCinemaDate(screening.startsAt)}
                                  {" · "}
                                  {cinemaTime(screening.startsAt)}
                                </p>
                              </>
                            ) : (
                              "Screening details unavailable"
                            )}
                          </td>

                          <td>
                            {reservation.seats
                              .map((seat) => seat.label)
                              .join(", ")}
                          </td>

                          <td>
                            {reservation.status === "active"
                              ? "Active"
                              : reservation.cancellationReason ===
                                  "screening_cancelled"
                                ? "Screening cancelled"
                                : "Cancelled"}
                          </td>

                          <td>
                            <div className="admin-table-actions">
                              <button
                                type="button"
                                className="secondary-button"
                                disabled={
                                  busy ||
                                  reservation.status !== "active" ||
                                  !screening ||
                                  screening.status !== "scheduled" ||
                                  typeof onEditReservation !== "function"
                                }
                                onClick={() =>
                                  onEditReservation(reservation.id)
                                }
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                className="admin-danger-button"
                                disabled={
                                  busy ||
                                  reservation.status !== "active"
                                }
                                onClick={() =>
                                  prepareCancellation(reservation.id)
                                }
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-empty-state">
                <h3>No reservations on this page</h3>
                <p>Change the filters or create a reservation.</p>

                {filters.page > 1 && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => changePage(1)}
                  >
                    Back to first page
                  </button>
                )}
              </div>
            )}

            {meta.totalPages > 1 && (
              <nav
                className="catalogue-pagination"
                aria-label="Reservation result pages"
              >
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || filters.page <= 1}
                  onClick={() => changePage(filters.page - 1)}
                >
                  Previous
                </button>

                <span>
                  Page {filters.page} of {meta.totalPages}
                </span>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || filters.page >= meta.totalPages}
                  onClick={() => changePage(filters.page + 1)}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
    </section>
  );
}

export default CashierReservations;