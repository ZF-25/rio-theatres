/*
 * FILE: frontend/src/components/AdminCashiers.jsx
 *
 * PURPOSE
 * Owner interface for:
 * - Creating cashier accounts.
 * - Searching and paginating accounts.
 * - Activating and deactivating accounts.
 * - Opening the single-theater assignment editor.
 *
 * ACCOUNT NAMES
 * Requests and responses use firstName and lastName.
 * getUserDisplayName() combines them for display only.
 *
 * THEATER ASSIGNMENT
 * New cashiers start without an assigned theater.
 * Each cashier can have one assigned theater at a time.
 * Selecting another theater replaces the previous assignment.
 *
 * CashierTheaterAssignments handles assignment reads and writes.
 * Its successful callback provides cashierId and theaterId.
 *
 * Passwords are cleared after account creation requests.
 * The backend must independently enforce owner permissions.
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

import { ApiError } from "../services/apiClient.js";
import { useStaffSession } from "../hooks/useStaffSession.js";
import { useResource } from "../hooks/useResource.js";
import { formatCinemaDate } from "../utils/cinemaTime.js";
import { getUserDisplayName } from "../utils/userName.js";

import RequestState from "./RequestState.jsx";
import CashierTheaterAssignments from "./CashierTheaterAssignments.jsx";

const PAGE_SIZE = 10;

/*
 * Validate public cashier resources before displaying them.
 * Older demo records may have no creation timestamp.
 */
function validCashier(account) {
  return Boolean(
    account &&
    typeof account.id === "string" &&
    account.id.trim() !== "" &&
    typeof account.firstName === "string" &&
    account.firstName.trim() !== "" &&
    typeof account.lastName === "string" &&
    account.lastName.trim() !== "" &&
    typeof account.email === "string" &&
    account.email.trim() !== "" &&
    account.role === "cashier" &&
    typeof account.active === "boolean" &&
    (
      (staffMode === "demo" && account.createdAt === null) ||
      (
        typeof account.createdAt === "string" &&
        Number.isFinite(Date.parse(account.createdAt))
      )
    ),
  );
}

/*
 * The current account list expects pagination metadata.
 * Confirm the real cashier-list response during backend integration.
 */
function validateCashierList(response) {
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
    meta.totalPages === Math.ceil(meta.totalItems / meta.pageSize) &&
    response.data.length <= meta.pageSize &&
    response.data.every(validCashier);

  if (!valid) {
    throw new ApiError(
      "The server returned an invalid cashier list.",
      { code: "INVALID_RESPONSE" },
    );
  }

  return response;
}

function AdminCashiers() {
  const {
    staff,
    isOwner,
    status: staffStatus,
    sessionError,
    isSessionLoading,
    refreshSession,
  } = useStaffSession();

  // Account creation form.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Service filters are applied before pagination.
  const [filters, setFilters] = useState({
    search: "",
    active: "",
    page: 1,
  });

  const [pendingChange, setPendingChange] = useState(null);
  const [statusError, setStatusError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState(null);

  /*
   * The selected account supplies the assignment editor's heading.
   * The editor loads its current assignment independently.
   */
  const [assignmentCashier, setAssignmentCashier] = useState(null);

  const mutationInProgress = useRef(false);
  const confirmationHeadingRef = useRef(null);
  const assignmentSectionRef = useRef(null);
  const listHeadingRef = useRef(null);

  const busy = busyAction !== null;

  /*
   * Subscribe to the shared service.
   * Demo account changes can then refresh the displayed list.
   */
  const snapshot = useSyncExternalStore(
    ownerService.subscribe,
    ownerService.getSnapshot,
    ownerService.getSnapshot,
  );

  const loadCashiers = useCallback(
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

      const response = await ownerService.listCashiers(
        {
          search: filters.search,
          active:
            filters.active === ""
              ? undefined
              : filters.active === "true",
          page: filters.page,
          pageSize: PAGE_SIZE,
        },
        { signal },
      );

      return validateCashierList(response);
    },
    [staff, staffStatus, isSessionLoading, filters, snapshot],
  );

  const cashiersResult = useResource(loadCashiers);
  const cashiers = cashiersResult.data?.data ?? [];
  const meta = cashiersResult.data?.meta;

  // Move keyboard focus to an opened status confirmation.
  useEffect(() => {
    if (pendingChange) {
      confirmationHeadingRef.current?.focus({
        preventScroll: true,
      });
    }
  }, [pendingChange]);

  // Focus the assignment editor or restored account list.
  useEffect(() => {
    if (assignmentCashier) {
      assignmentSectionRef.current?.focus({
        preventScroll: true,
      });
    } else {
      listHeadingRef.current?.focus({
        preventScroll: true,
      });
    }
  }, [assignmentCashier]);

  function clearFieldError(field) {
    setFormError("");
    setFieldErrors((previous) => ({
      ...previous,
      [field]: "",
    }));
  }

  function changeFilter(patch) {
    setPendingChange(null);
    setStatusError("");
    setFilters((previous) => ({
      ...previous,
      ...patch,
      page: 1,
    }));
  }

  function clearFilters() {
    setPendingChange(null);
    setStatusError("");
    setFilters({ search: "", active: "", page: 1 });
  }

  function changePage(page) {
    setPendingChange(null);
    setStatusError("");
    setFilters((previous) => ({ ...previous, page }));
  }

  function refreshCashiers() {
    setPendingChange(null);
    setStatusError("");
    cashiersResult.retry();
  }

  /*
   * CREATE CASHIER
   *
   * Account creation does not assign a theater.
   * Do not automatically repeat account creation after a lost response.
   */
  async function handleCreate(event) {
    event.preventDefault();

    if (
      mutationInProgress.current ||
      !isOwner ||
      !staffEnabled
    ) {
      return;
    }

    setFormError("");
    setFieldErrors({});
    setNotice("");

    const cleanedFirstName = firstName.trim();
    const cleanedLastName = lastName.trim();
    const normalisedEmail = email.trim().toLowerCase();
    const errors = {};

    if (!cleanedFirstName || cleanedFirstName.length > 100) {
      errors.firstName =
        "Enter a first name between 1 and 100 characters.";
    }

    if (!cleanedLastName || cleanedLastName.length > 100) {
      errors.lastName =
        "Enter a last name between 1 and 100 characters.";
    }

    if (
      normalisedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalisedEmail)
    ) {
      errors.email = "Enter a valid email address.";
    }

    if (password.length < 8 || password.length > 128) {
      errors.password =
        "Use a password between 8 and 128 characters.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Please check the highlighted fields.");
      return;
    }

    mutationInProgress.current = true;
    setBusyAction("create");
    setPendingChange(null);

    try {
      const response = await ownerService.createCashier({
        firstName: cleanedFirstName,
        lastName: cleanedLastName,
        email: normalisedEmail,
        password,
      });

      if (!validCashier(response?.data)) {
        throw new ApiError(
          "The account response was invalid. Refresh the cashier list before retrying.",
          { code: "INVALID_RESPONSE" },
        );
      }

      setFirstName("");
      setLastName("");
      setEmail("");

      setNotice(
        `Cashier account created for ${getUserDisplayName(response.data)}. Use Assign theater to select their theater. Current list filters remain applied.`,
      );

      setFilters((previous) => ({ ...previous, page: 1 }));
      cashiersResult.retry();
    } catch (requestError) {
      setFormError(
        requestError?.message ||
          "Unable to create the cashier account.",
      );

      setFieldErrors(requestError?.fieldErrors ?? {});

      // A read-only refresh may reveal an account after a lost response.
      cashiersResult.retry();
    } finally {
      setPassword("");
      mutationInProgress.current = false;
      setBusyAction(null);
    }
  }

  /*
   * STATUS CONFIRMATION
   *
   * Store the intended boolean rather than blindly toggling
   * whichever account status happens to be current.
   */
  function requestStatusChange(account) {
    if (busy || mutationInProgress.current) return;

    setNotice("");
    setStatusError("");
    setPendingChange({
      account,
      active: !account.active,
    });
  }

  function closeConfirmation() {
    if (mutationInProgress.current) return;

    setPendingChange(null);
    setStatusError("");
  }

  async function confirmStatusChange() {
    if (
      mutationInProgress.current ||
      !pendingChange ||
      !isOwner ||
      !staffEnabled
    ) {
      return;
    }

    mutationInProgress.current = true;
    setBusyAction("status");
    setStatusError("");

    const { account, active } = pendingChange;

    try {
      const response = await ownerService.setCashierActive(
        account.id,
        active,
      );

      if (
        !validCashier(response?.data) ||
        response.data.id !== account.id ||
        response.data.active !== active
      ) {
        throw new ApiError(
          "The account status response was invalid. Refresh the list to check its current status.",
          { code: "INVALID_RESPONSE" },
        );
      }

      setNotice(
        `${getUserDisplayName(response.data)} ${
          active ? "activated" : "deactivated"
        }.`,
      );

      setPendingChange(null);
      cashiersResult.retry();
    } catch (requestError) {
      setStatusError(
        requestError?.message ||
          "Unable to change this account's status.",
      );
    } finally {
      mutationInProgress.current = false;
      setBusyAction(null);
    }
  }

  /*
   * ASSIGNMENT EDITOR NAVIGATION
   */
  function openAssignments(account) {
    if (
      mutationInProgress.current ||
      busy ||
      !isOwner ||
      !staffEnabled
    ) {
      return;
    }

    setPassword("");
    setPendingChange(null);
    setStatusError("");
    setNotice("");
    setAssignmentCashier(account);
  }

  function closeAssignments() {
    setAssignmentCashier(null);
    cashiersResult.retry();
  }

  /*
   * Uses the singular theaterId from the assignment editor.
   * No theaterIds array is required by this parent anymore.
   */
  function handleAssignmentsSaved(summary) {
    if (
      !assignmentCashier ||
      summary?.cashierId !== assignmentCashier.id ||
      typeof summary?.theaterId !== "string" ||
      summary.theaterId.trim() === ""
    ) {
      throw new Error(
        "The saved theater assignment could not be confirmed for this cashier.",
      );
    }

    const displayName = getUserDisplayName(assignmentCashier);

    setNotice(
      `Theater assignment saved for ${displayName}. The cashier can access only their assigned theater.`,
    );

    setAssignmentCashier(null);
    cashiersResult.retry();
  }

  const hasFilters =
    filters.search.trim() !== "" || filters.active !== "";

  /*
   * ACCESS GUARD
   * Hooks above always run before conditional rendering.
   */
  if (
    !staffEnabled ||
    isSessionLoading ||
    staffStatus === "error" ||
    !isOwner
  ) {
    return (
      <section className="admin-cashiers">
        <h2>Cashier accounts</h2>

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
            An active owner account and matching staff catalogue
            are required.
          </p>
        )}
      </section>
    );
  }

  /*
   * Display the assignment editor instead of the account list.
   * The current list filters remain stored while editing.
   */
  if (assignmentCashier) {
    return (
      <section
        className="admin-cashiers"
        aria-labelledby="owner-cashier-assignments-title"
      >
        <h2
          id="owner-cashier-assignments-title"
          ref={assignmentSectionRef}
          tabIndex={-1}
        >
          Cashier theater access
        </h2>

        <CashierTheaterAssignments
          cashier={assignmentCashier}
          onSaved={handleAssignmentsSaved}
          onCancel={closeAssignments}
        />
      </section>
    );
  }

  return (
    <section
      className="admin-cashiers"
      aria-labelledby="owner-cashiers-title"
    >
      <h2
        id="owner-cashiers-title"
        ref={listHeadingRef}
        tabIndex={-1}
      >
        Cashier accounts
      </h2>

      <p className="admin-preview-note">
        Create cashier accounts, manage active status, and assign
        one theater per cashier. New cashiers start without a theater.
      </p>

      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}

      {/* ACCOUNT CREATION */}
      <div className="admin-cashier-create-layout">
        <form
          className="admin-screening-form"
          onSubmit={handleCreate}
          aria-busy={busyAction === "create"}
          noValidate
        >
          <h3>Create cashier account</h3>

          {formError && (
            <p className="admin-edit-error" role="alert">
              {formError}
            </p>
          )}

          <label htmlFor="cashier-first-name">
            <span>First name</span>
            <input
              id="cashier-first-name"
              name="firstName"
              type="text"
              autoComplete="off"
              maxLength={100}
              value={firstName}
              required
              disabled={busy}
              onChange={(event) => {
                setFirstName(event.target.value);
                clearFieldError("firstName");
              }}
              aria-invalid={
                fieldErrors.firstName ? true : undefined
              }
              aria-describedby={
                fieldErrors.firstName
                  ? "cashier-first-name-error"
                  : undefined
              }
            />

            {fieldErrors.firstName && (
              <span
                id="cashier-first-name-error"
                className="admin-edit-error"
              >
                {fieldErrors.firstName}
              </span>
            )}
          </label>

          <label htmlFor="cashier-last-name">
            <span>Last name</span>
            <input
              id="cashier-last-name"
              name="lastName"
              type="text"
              autoComplete="off"
              maxLength={100}
              value={lastName}
              required
              disabled={busy}
              onChange={(event) => {
                setLastName(event.target.value);
                clearFieldError("lastName");
              }}
              aria-invalid={
                fieldErrors.lastName ? true : undefined
              }
              aria-describedby={
                fieldErrors.lastName
                  ? "cashier-last-name-error"
                  : undefined
              }
            />

            {fieldErrors.lastName && (
              <span
                id="cashier-last-name-error"
                className="admin-edit-error"
              >
                {fieldErrors.lastName}
              </span>
            )}
          </label>

          <label htmlFor="cashier-email">
            <span>Email</span>
            <input
              id="cashier-email"
              name="email"
              type="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              value={email}
              required
              disabled={busy}
              onChange={(event) => {
                setEmail(event.target.value);
                clearFieldError("email");
              }}
              aria-invalid={
                fieldErrors.email ? true : undefined
              }
              aria-describedby={
                fieldErrors.email
                  ? "cashier-email-error"
                  : undefined
              }
            />

            {fieldErrors.email && (
              <span
                id="cashier-email-error"
                className="admin-edit-error"
              >
                {fieldErrors.email}
              </span>
            )}
          </label>

          <label htmlFor="cashier-password">
            <span>Initial password</span>
            <input
              id="cashier-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              required
              disabled={busy}
              onChange={(event) => {
                setPassword(event.target.value);
                clearFieldError("password");
              }}
              aria-invalid={
                fieldErrors.password ? true : undefined
              }
              aria-describedby={
                fieldErrors.password
                  ? "cashier-password-help cashier-password-error"
                  : "cashier-password-help"
              }
            />

            {fieldErrors.password && (
              <span
                id="cashier-password-error"
                className="admin-edit-error"
              >
                {fieldErrors.password}
              </span>
            )}
          </label>

          <p
            id="cashier-password-help"
            className="admin-preview-note"
          >
            Use 8–128 characters. The password will not appear
            in the account list.
          </p>

          <div className="admin-screening-form-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={busy}
            >
              {busyAction === "create"
                ? "Creating account…"
                : "Create cashier"}
            </button>
          </div>
        </form>

        <aside className="admin-screening-guidance">
          <h3>Account access</h3>

          <p>
            Cashiers manage unpaid staff reservations. They cannot
            manage screenings or staff accounts.
          </p>

          <p>
            Use Assign theater to select one theater for a cashier.
            Saving a different theater replaces the previous assignment.
          </p>

          <p>
            Deactivation retains the theater assignment and
            historical records.
          </p>

          {staffMode === "demo" && (
            <p className="admin-preview-note">
              Demo accounts and assignments reset on browser refresh.
            </p>
          )}
        </aside>
      </div>

      {/* LIST FILTERS */}
      <form
        className="admin-booking-filters"
        role="search"
        aria-label="Find cashier accounts"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="admin-booking-reference-field">
          <span>Name or email</span>
          <input
            type="search"
            maxLength={100}
            value={filters.search}
            disabled={busy}
            onChange={(event) => {
              changeFilter({ search: event.target.value });
            }}
          />
        </label>

        <label>
          <span>Account status</span>
          <select
            value={filters.active}
            disabled={busy}
            onChange={(event) => {
              changeFilter({ active: event.target.value });
            }}
          >
            <option value="">All accounts</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>

        <button
          type="button"
          className="secondary-button"
          onClick={clearFilters}
          disabled={
            busy || (!hasFilters && filters.page === 1)
          }
        >
          Clear filters
        </button>
      </form>

      <button
        type="button"
        className="secondary-button"
        onClick={refreshCashiers}
        disabled={busy || cashiersResult.loading}
      >
        Refresh accounts
      </button>

      {/* ACCOUNT STATUS CONFIRMATION */}
      {pendingChange && (
        <section
          className="admin-screening-confirmation"
          aria-labelledby="cashier-status-title"
          aria-busy={busyAction === "status"}
        >
          <h3
            id="cashier-status-title"
            ref={confirmationHeadingRef}
            tabIndex={-1}
          >
            {pendingChange.active
              ? "Activate cashier?"
              : "Deactivate cashier?"}
          </h3>

          <p>
            <strong>
              {getUserDisplayName(pendingChange.account)}
            </strong>
            {" · "}
            {pendingChange.account.email}
          </p>

          <p>
            {pendingChange.active
              ? "This account will be able to sign in. An unassigned cashier has no theater access."
              : "This account will lose cashier access. Its theater assignment and historical records will be retained."}
          </p>

          {statusError && (
            <p className="admin-edit-error" role="alert">
              {statusError}
            </p>
          )}

          <div className="admin-confirmation-actions">
            <button
              type="button"
              className={
                pendingChange.active
                  ? "primary-button"
                  : "admin-danger-button"
              }
              onClick={confirmStatusChange}
              disabled={busy}
            >
              {busyAction === "status"
                ? "Updating account…"
                : pendingChange.active
                  ? "Confirm activation"
                  : "Confirm deactivation"}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={closeConfirmation}
              disabled={busy}
            >
              Keep current status
            </button>
          </div>
        </section>
      )}

      <RequestState
        loading={cashiersResult.loading}
        error={cashiersResult.error}
        onRetry={cashiersResult.retry}
        loadingMessage="Loading cashier accounts…"
      />

      {/* ACCOUNT LIST */}
      {!cashiersResult.loading &&
        !cashiersResult.error &&
        meta && (
          <>
            <p className="admin-results-count" role="status">
              {meta.totalItems} cashier accounts found
            </p>

            {cashiers.length > 0 ? (
              <div
                className="admin-table-scroll"
                role="region"
                aria-label="Cashier accounts table"
                tabIndex={0}
              >
                <table className="admin-table admin-cashiers-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Status</th>
                      <th scope="col">Created</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {cashiers.map((account) => (
                      <tr key={account.id}>
                        <td>{getUserDisplayName(account)}</td>
                        <td>{account.email}</td>

                        <td>
                          {account.active ? "Active" : "Inactive"}
                        </td>

                        <td>
                          {account.createdAt
                            ? formatCinemaDate(account.createdAt)
                            : "Not recorded"}
                        </td>

                        <td>
                          <div className="admin-screening-form-actions">
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={busy}
                              onClick={() => {
                                openAssignments(account);
                              }}
                            >
                              Assign theater
                            </button>

                            <button
                              type="button"
                              className={
                                account.active
                                  ? "admin-danger-button"
                                  : "secondary-button"
                              }
                              disabled={busy}
                              onClick={() => {
                                requestStatusChange(account);
                              }}
                            >
                              {account.active
                                ? "Deactivate"
                                : "Activate"}
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
                <h3>No cashier accounts on this page</h3>

                <p>
                  Change the filters or create a cashier account.
                </p>

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
                aria-label="Cashier account pages"
              >
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || filters.page <= 1}
                  onClick={() => {
                    changePage(filters.page - 1);
                  }}
                >
                  Previous
                </button>

                <span>
                  Page {filters.page} of {meta.totalPages}
                </span>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    busy || filters.page >= meta.totalPages
                  }
                  onClick={() => {
                    changePage(filters.page + 1);
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

export default AdminCashiers;