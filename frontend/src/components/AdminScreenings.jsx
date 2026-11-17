/*
 * FILE: frontend/src/components/AdminScreenings.jsx
 *
 * PURPOSE
 * -------
 * Manages the owner's screening programme.
 *
 * FEATURES
 * --------
 * - Search/filter screenings.
 * - Paginated results.
 * - Create/edit through AdminScreeningForm.
 * - Confirm cancellation/deletion.
 * - Display backend validation and protection errors.
 *
 * IMPORTANT
 * ---------
 * The backend decides whether a screening can be edited/deleted.
 * This page does not assume that missing frontend booking data
 * means a screening has no protected records.
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
  cinemaTime,
  formatCinemaDate,
} from "../utils/cinemaTime.js";

import RequestState from "./RequestState.jsx";
import AdminScreeningForm from "./AdminScreeningForm.jsx";


const PAGE_SIZE = 10;


/*
 * CHECK THE LIST FORMAT BEFORE RENDERING
 */
function validateScreenings(response) {
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
    response.data.every((screening) => {
      return (
        typeof screening.id === "string" &&
        typeof screening.movieTitle === "string" &&
        typeof screening.cinemaName === "string" &&
        typeof screening.roomName === "string" &&
        Number.isFinite(
          Date.parse(screening.startsAt),
        ) &&
        ["scheduled", "cancelled"].includes(
          screening.status,
        )
      );
    });

  if (!valid) {
    throw new ApiError(
      "The server returned an invalid screening list.",
      {
        code: "INVALID_RESPONSE",
      },
    );
  }

  return response;
}


function AdminScreenings() {
  const {
    staff,
    isOwner,
    status: staffStatus,
    sessionError,
    isSessionLoading,
    refreshSession,
  } = useStaffSession();

  const [filters, setFilters] = useState({
    search: "",
    cinemaId: "",
    date: "",
    status: "",
    page: 1,
  });

  /*
   * null -> list
   * { screening: null } -> create form
   * { screening: record } -> edit form
   */
  const [editor, setEditor] =
    useState(null);

  /*
   * { kind: "cancel" or "delete", screening }
   */
  const [pendingAction, setPendingAction] =
    useState(null);

  const [mutating, setMutating] =
    useState(false);

  const [actionError, setActionError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const actionInProgress = useRef(false);
  const listHeadingRef = useRef(null);
  const confirmationHeadingRef = useRef(null);


  /*
   * DEMO UPDATES
   *
   * API mode refreshes through requests.
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
   * SCREENING LIST
   *
   * Filters/pagination are handled by the service.
   * Do not filter only the currently downloaded page.
   */
  const loadScreenings = useCallback(
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
        await ownerService.listScreenings(
          {
            search: filters.search,
            cinemaId: filters.cinemaId,
            date: filters.date,
            status: filters.status,
            page: filters.page,
            pageSize: PAGE_SIZE,
          },
          { signal },
        );

      return validateScreenings(
        response,
      );
    },
    [
      staff,
      staffStatus,
      isSessionLoading,
      filters,
      snapshot,
    ],
  );

  const screeningsResult =
    useResource(loadScreenings);

  const screenings =
    screeningsResult.data?.data ?? [];

  const meta =
    screeningsResult.data?.meta;

  const hasFilters =
    filters.search.trim() !== "" ||
    filters.cinemaId !== "" ||
    filters.date !== "" ||
    filters.status !== "";


  /*
   * FOCUS THE ACTION CONFIRMATION
   */
  useEffect(() => {
    if (pendingAction) {
      confirmationHeadingRef.current?.focus({
        preventScroll: true,
      });
    }
  }, [pendingAction]);


  function focusListHeading() {
    requestAnimationFrame(() => {
      listHeadingRef.current?.focus({
        preventScroll: true,
      });
    });
  }

  function changeFilter(patch) {
    setPendingAction(null);
    setActionError("");
    setNotice("");

    setFilters((previous) => ({
      ...previous,
      ...patch,
      page: 1,
    }));
  }

  function clearFilters() {
    setPendingAction(null);
    setActionError("");
    setNotice("");

    setFilters({
      search: "",
      cinemaId: "",
      date: "",
      status: "",
      page: 1,
    });
  }

  function changePage(page) {
    setPendingAction(null);
    setActionError("");

    setFilters((previous) => ({
      ...previous,
      page,
    }));
  }

  function refreshList() {
    setPendingAction(null);
    setActionError("");
    screeningsResult.retry();
  }


  /*
   * ADD / EDIT NAVIGATION
   *
   * Editing a scheduled screening may still be rejected by the
   * backend if bookings, reservations, or holds protect it.
   */
  function openEditor(screening = null) {
    setPendingAction(null);
    setActionError("");
    setNotice("");

    setEditor({ screening });
  }

  function closeEditor() {
    setEditor(null);
    focusListHeading();
  }

  function handleSaved(screening) {
    setEditor(null);

    setNotice(
      `${screening.movieTitle} screening saved.`,
    );

    screeningsResult.retry();
    focusListHeading();
  }


  /*
   * CANCEL / DELETE CONFIRMATION
   */
  function requestAction(kind, screening) {
    setNotice("");
    setActionError("");

    setPendingAction({
      kind,
      screening,
    });
  }

  function closeConfirmation() {
    if (actionInProgress.current) {
      return;
    }

    setPendingAction(null);
    setActionError("");
    focusListHeading();
  }

  async function confirmAction() {
    if (
      actionInProgress.current ||
      !pendingAction
    ) {
      return;
    }

    actionInProgress.current = true;
    setMutating(true);
    setActionError("");

    const {
      kind,
      screening,
    } = pendingAction;

    try {
      if (kind === "cancel") {
        await ownerService.cancelScreening(
          screening.id,
        );

        setNotice(
          `${screening.movieTitle} screening cancelled.`,
        );
      } else {
        await ownerService.deleteScreening(
          screening.id,
        );

        setNotice(
          `${screening.movieTitle} screening deleted.`,
        );

        /*
         * Move back if deleting the only row on a later page.
         */
        if (
          screenings.length === 1 &&
          filters.page > 1
        ) {
          setFilters((previous) => ({
            ...previous,
            page: previous.page - 1,
          }));
        }
      }

      setPendingAction(null);
      screeningsResult.retry();
      focusListHeading();
    } catch (requestError) {
      if (requestError.status === 404) {
        setPendingAction(null);

        setNotice(
          "The screening is no longer available. The list has been refreshed.",
        );

        screeningsResult.retry();
      } else {
        setActionError(
          requestError.message ||
            "Unable to confirm this change. Refresh the list before trying again.",
        );
      }
    } finally {
      actionInProgress.current = false;
      setMutating(false);
    }
  }


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
      <section>
        <h2>Screenings</h2>

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


  /*
   * EDITOR VIEW
   */
  if (editor) {
    return (
      <AdminScreeningForm
        screening={editor.screening}
        onSaved={handleSaved}
        onCancel={closeEditor}
      />
    );
  }


  return (
    <section
      aria-labelledby="admin-screenings-title"
    >
      <div className="admin-page-title-row">
        <h2
          id="admin-screenings-title"
          ref={listHeadingRef}
          tabIndex={-1}
        >
          Screenings
        </h2>

        <button
          type="button"
          className="primary-button"
          onClick={() => {
            openEditor();
          }}
          disabled={mutating}
        >
          Add screening
        </button>
      </div>

      <p className="admin-introduction">
        Review scheduled and cancelled screenings.
        Times are displayed in Finland's timezone.
      </p>


      {/* SERVER/SERVICE-SIDE FILTERS */}
      <form
        className="admin-screening-filters"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label className="admin-search-field">
          <span>Movie title</span>

          <input
            type="search"
            maxLength={100}
            value={filters.search}
            disabled={mutating}
            onChange={(event) => {
              changeFilter({
                search: event.target.value,
              });
            }}
          />
        </label>

        <label>
          <span>Cinema</span>

          <select
            value={filters.cinemaId}
            disabled={
              mutating ||
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

        <label>
          <span>Screening date</span>

          <input
            type="date"
            value={filters.date}
            disabled={mutating}
            onChange={(event) => {
              changeFilter({
                date: event.target.value,
              });
            }}
          />
        </label>

        <label>
          <span>Status</span>

          <select
            value={filters.status}
            disabled={mutating}
            onChange={(event) => {
              changeFilter({
                status: event.target.value,
              });
            }}
          >
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>

        <button
          type="button"
          className="secondary-button admin-clear-filters"
          onClick={clearFilters}
          disabled={
            mutating ||
            (
              !hasFilters &&
              filters.page === 1
            )
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
        onClick={refreshList}
        disabled={
          mutating ||
          screeningsResult.loading
        }
      >
        Refresh screenings
      </button>

      {notice && (
        <p
          className="admin-notice"
          role="status"
        >
          {notice}
        </p>
      )}


      {/* EXPLICIT ACTION CONFIRMATION */}
      {pendingAction && (
        <section
          className="admin-screening-confirmation"
          aria-labelledby="screening-action-title"
          aria-busy={mutating}
        >
          <h3
            id="screening-action-title"
            ref={confirmationHeadingRef}
            tabIndex={-1}
          >
            {pendingAction.kind === "cancel"
              ? "Cancel screening?"
              : "Delete screening?"}
          </h3>

          <p className="admin-screening-confirmation-movie">
            {pendingAction.screening.movieTitle}
          </p>

          <p>
            {pendingAction.screening.cinemaName}
            {" · "}
            {pendingAction.screening.roomName}
            {" · "}
            {formatCinemaDate(
              pendingAction.screening.startsAt,
            )}
            {" · "}
            {cinemaTime(
              pendingAction.screening.startsAt,
            )}
          </p>

          <p>
            {pendingAction.kind === "cancel"
              ? "Cancellation retains booking history, releases checkout holds, and cancels active staff reservations. No real refunds or notifications are processed."
              : "Deletion removes the screening. The service will reject deletion if booking/reservation history or active holds protect it."}
          </p>

          {actionError && (
            <p
              className="admin-edit-error"
              role="alert"
            >
              {actionError}
            </p>
          )}

          <div className="admin-confirmation-actions">
            <button
              type="button"
              className="admin-danger-button"
              onClick={confirmAction}
              disabled={mutating}
            >
              {mutating
                ? "Applying change…"
                : pendingAction.kind === "cancel"
                  ? "Confirm cancellation"
                  : "Confirm deletion"}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={closeConfirmation}
              disabled={mutating}
            >
              Keep screening
            </button>
          </div>
        </section>
      )}


      <RequestState
        loading={screeningsResult.loading}
        error={screeningsResult.error}
        onRetry={screeningsResult.retry}
        loadingMessage="Loading screenings…"
      />


      {/* RESULTS */}
      {!screeningsResult.loading &&
        !screeningsResult.error &&
        meta && (
          <>
            <p
              id="screenings-results-count"
              className="admin-results-count"
              role="status"
            >
              {meta.totalItems}
              {" "}screenings found
            </p>

            {screenings.length > 0 ? (
              <div
                className="admin-table-scroll"
                role="region"
                aria-label="Screenings table"
                tabIndex={0}
              >
                <table className="admin-table admin-screenings-table">
                  <thead>
                    <tr>
                      <th scope="col">Movie</th>
                      <th scope="col">Cinema</th>
                      <th scope="col">Room</th>
                      <th scope="col">Date and time</th>
                      <th scope="col">Status</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {screenings.map((screening) => (
                      <tr
                        key={screening.id}
                        className={
                          screening.status === "cancelled"
                            ? "admin-screening-cancelled"
                            : ""
                        }
                      >
                        <td>
                          {screening.movieTitle}
                        </td>

                        <td>
                          {screening.cinemaName}
                        </td>

                        <td>
                          {screening.roomName}
                        </td>

                        <td>
                          {formatCinemaDate(
                            screening.startsAt,
                          )}
                          {" · "}
                          {cinemaTime(
                            screening.startsAt,
                          )}
                        </td>

                        <td>
                          <span
                            className={`admin-screening-status is-${screening.status}`}
                          >
                            {screening.status === "scheduled"
                              ? "Scheduled"
                              : "Cancelled"}
                          </span>
                        </td>

                        <td>
                          <div className="admin-table-actions">
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={
                                mutating ||
                                screening.status === "cancelled"
                              }
                              onClick={() => {
                                openEditor(screening);
                              }}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="secondary-button"
                              disabled={
                                mutating ||
                                screening.status === "cancelled"
                              }
                              onClick={() => {
                                requestAction(
                                  "cancel",
                                  screening,
                                );
                              }}
                            >
                              Cancel
                            </button>

                            <button
                              type="button"
                              className="admin-danger-button"
                              disabled={mutating}
                              onClick={() => {
                                requestAction(
                                  "delete",
                                  screening,
                                );
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-empty-state">
                <h3>
                  No screenings on this page
                </h3>

                <p>
                  Change the filters or add a screening.
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
                aria-label="Screening result pages"
              >
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    mutating ||
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
                    mutating ||
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
    </section>
  );
}

export default AdminScreenings;