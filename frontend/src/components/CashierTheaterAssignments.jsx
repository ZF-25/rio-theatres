/*
 * CashierTheaterAssignments.jsx
 * Owner editor for assigning one theater to a cashier.
 * Saving replaces the previous assignment; removal is not offered.
 * Unknown save outcomes require a reload before another write.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ownerService,
  staffEnabled,
} from "../services/staff.js";

import { ApiError } from "../services/apiClient.js";
import { collectPages } from "../services/apiCatalogue.js";
import { useStaffSession } from "../hooks/useStaffSession.js";
import { useResource } from "../hooks/useResource.js";
import { getUserDisplayName } from "../utils/userName.js";

import RequestState from "./RequestState.jsx";

// Validate the string IDs and labels supplied by the service.
function validTheater(theater) {
  return Boolean(
    theater &&
    typeof theater.id === "string" &&
    theater.id.trim() !== "" &&
    typeof theater.name === "string" &&
    theater.name.trim() !== "" &&
    typeof theater.city === "string" &&
    theater.city.trim() !== "",
  );
}

function invalidResponse(message) {
  return new ApiError(message, {
    code: "INVALID_RESPONSE",
  });
}

// Reset local editor state when a different cashier is opened.
function CashierTheaterAssignments({
  cashier,
  onSaved,
  onCancel,
}) {
  return (
    <AssignmentLoader
      key={cashier?.id ?? "missing-cashier"}
      cashier={cashier}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

// Check owner access and load available/current theater records.
function AssignmentLoader({
  cashier,
  onSaved,
  onCancel,
}) {
  const {
    staff,
    isOwner,
    status,
    sessionError,
    isSessionLoading,
    refreshSession,
  } = useStaffSession();

  // Increment to reload and reset the form after an uncertain save.
  const [revision, setRevision] = useState(0);

  const cashierId = cashier?.id;
  const ownerId = staff?.id;

  const canLoad = Boolean(
    staffEnabled &&
    isOwner &&
    !isSessionLoading &&
    status !== "error" &&
    typeof cashierId === "string" &&
    cashierId.trim() !== "",
  );

  const loadAssignments = useCallback(
    async (signal) => {
      
      if (!canLoad || !ownerId) {
        return null;
      }

      // Revision is part of the request identity, not a server parameter.
      void revision;

      // Fetch both independent reference lists together.
      const [theaters, assignedTheaters] = await Promise.all([
        collectPages(
          (query, options) =>
            ownerService.listTheaters(query, options),
          { signal },
        ),

        collectPages(
          (query, options) =>
            ownerService.listCashierTheaters(
              cashierId,
              query,
              options,
            ),
          { signal },
        ),
      ]);

      if (
        !theaters.every(validTheater) ||
        !assignedTheaters.every(validTheater)
      ) {
        throw invalidResponse(
          "The server returned invalid theater information.",
        );
      }

      const optionIds = new Set(
        theaters.map((theater) => theater.id),
      );

      const assignedIds = assignedTheaters.map(
        (theater) => theater.id,
      );

      
      // Reject multiple assignments, duplicate options and unknown IDs.
      if (
        assignedTheaters.length > 1 ||
        optionIds.size !== theaters.length ||
        new Set(assignedIds).size !== assignedIds.length ||
        assignedIds.some((id) => !optionIds.has(id))
      ) {
        throw invalidResponse(
          "The theater assignments do not match the available options. Reload to check them.",
        );
      }

      return { theaters, assignedIds };
    },
    [canLoad, cashierId, ownerId, revision],
  );

  const result = useResource(loadAssignments);

  function reloadAssignments() {
    setRevision((previous) => previous + 1);
  }

  if (isSessionLoading) {
    return (
      <RequestState
        loading
        loadingMessage="Checking owner access…"
      />
    );
  }

  if (status === "error") {
    return (
      <RequestState
        error={sessionError}
        onRetry={() => {
          refreshSession();
        }}
      />
    );
  }

  if (!staffEnabled || !isOwner) {
    return (
      <section className="admin-screening-form">
        <h3>Theater assignments</h3>
        <p>An active owner account is required.</p>
      </section>
    );
  }

  if (!canLoad) {
    return (
      <section className="admin-screening-form">
        <h3>Theater assignments</h3>
        <p>Select a valid cashier account.</p>

        <button
          type="button"
          className="secondary-button"
          onClick={onCancel}
          disabled={typeof onCancel !== "function"}
        >
          Back to cashier accounts
        </button>
      </section>
    );
  }

  if (result.loading || result.error || !result.data) {
    return (
      <section className="admin-screening-form">
        <h3>
          Theater assignments · {getUserDisplayName(cashier)}
        </h3>

        <RequestState
          loading={result.loading}
          error={result.error}
          onRetry={reloadAssignments}
          loadingMessage="Loading theater assignments…"
        />

        <button
          type="button"
          className="secondary-button"
          onClick={onCancel}
          disabled={typeof onCancel !== "function"}
        >
          Back to cashier accounts
        </button>
      </section>
    );
  }

  return (
    <AssignmentForm
      key={`${cashierId}:${ownerId}:${revision}`}
      cashier={cashier}
      theaters={result.data.theaters}
      initialTheaterId={result.data.assignedIds[0] ?? ""}
      onSaved={onSaved}
      onCancel={onCancel}
      onReload={reloadAssignments}
    />
  );
}

// Keep dropdown state separate from loading and permission checks.
function AssignmentForm({
  cashier,
  theaters,
  initialTheaterId,
  onSaved,
  onCancel,
  onReload,
}) {
  const [selectedTheaterId, setSelectedTheaterId] = useState(
    initialTheaterId,
  );

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [savedResult, setSavedResult] = useState(null);

  
  // Refs block duplicate clicks and updates after unmount.
  const actionInProgress = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const selectionLocked =
    saving || needsReload || savedResult !== null;

  function changeTheater(event) {
    if (actionInProgress.current || selectionLocked) return;

    setSelectedTheaterId(event.target.value);
    setError("");
  }

  
  // Retry navigation only; never repeat an already confirmed write.
  async function continueAfterSave() {
    if (
      actionInProgress.current ||
      !savedResult ||
      typeof onSaved !== "function"
    ) {
      return;
    }

    actionInProgress.current = true;
    setSaving(true);
    setError("");

    try {
      await onSaved(savedResult);
    } catch (navigationError) {
      if (mounted.current) {
        setError(
          navigationError?.message ||
            "The assignment was saved, but the account list could not be opened.",
        );
      }
    } finally {
      actionInProgress.current = false;

      if (mounted.current) {
        setSaving(false);
      }
    }
  }

  async function handleSave(event) {
    event.preventDefault();

    if (
      actionInProgress.current ||
      selectionLocked ||
      typeof onSaved !== "function"
    ) {
      return;
    }

    if (
      !selectedTheaterId ||
      !theaters.some(
        (theater) => theater.id === selectedTheaterId,
      )
    ) {
      setError("Select one theater from the available options.");
      return;
    }

    // An unchanged selection needs no request.
    if (selectedTheaterId === initialTheaterId) return;

    actionInProgress.current = true;
    setSaving(true);
    setError("");

    const requestedId = selectedTheaterId;
    let summary;

    
    try {
      // Both demo/API services return { data: [assignedTheater] }.
      const response = await ownerService.setCashierTheater(
        cashier.id,
        requestedId,
      );

      const assigned = response?.data;

      if (
        !Array.isArray(assigned) ||
        assigned.length !== 1 ||
        !validTheater(assigned[0]) ||
        assigned[0].id !== requestedId
      ) {
        throw invalidResponse(
          "The save response was invalid. Reload the assignment to check what was saved.",
        );
      }

      summary = {
        cashierId: cashier.id,
        theaterId: assigned[0].id,

        // Legacy callback compatibility; not sent to the backend.
        theaterIds: [assigned[0].id],
      };
    } catch (requestError) {
      if (mounted.current) {
        
        // A failed response may hide a successful write: read before retry.
        const uncertain =
          !requestError?.status ||
          requestError.status >= 500 ||
          requestError.code === "INVALID_RESPONSE";

        setNeedsReload(uncertain);

        setError(
          uncertain
            ? "The save result could not be confirmed. Reload current assignments before saving again."
            : requestError?.fieldErrors?.theaterId ||
                requestError?.message ||
                "Unable to save the theater assignment.",
        );

        setSaving(false);
      }

      actionInProgress.current = false;
      return;
    }

    if (!mounted.current) {
      actionInProgress.current = false;
      return;
    }

    setSavedResult(summary);

    try {
      await onSaved(summary);
    } catch (navigationError) {
      if (mounted.current) {
        setError(
          navigationError?.message ||
            "The assignment was saved, but the account list could not be opened.",
        );
      }
    } finally {
      actionInProgress.current = false;

      if (mounted.current) {
        setSaving(false);
      }
    }
  }

  return (
    <section aria-labelledby="cashier-theaters-title">
      <form
        className="admin-screening-form"
        onSubmit={handleSave}
        aria-busy={saving}
      >
        <h3 id="cashier-theaters-title">
          Theater assignments
        </h3>

        <p>
          <strong>{getUserDisplayName(cashier)}</strong>
          {" · "}
          {cashier.email}
        </p>

        <p>
          Select the one theater this cashier may access.
          Saving replaces any previous theater assignment.
        </p>

        {/* Inactive accounts may be assigned but cannot use the workspace. */}
        {!cashier.active && (
          <p className="admin-preview-note">
            This account is inactive. Assignments can be saved,
            but the cashier cannot access the workspace until
            the account is activated.
          </p>
        )}

        <label htmlFor="cashier-assigned-theater">
          Assigned theater
        </label>

        {/* Controlled selector: exactly one theater. */}
        <select
          id="cashier-assigned-theater"
          name="theaterId"
          value={selectedTheaterId}
          onChange={changeTheater}
          disabled={selectionLocked || theaters.length === 0}
          aria-describedby={
            error
              ? "cashier-theater-help cashier-theater-error"
              : "cashier-theater-help"
          }
          required
        >
          <option value="" disabled>
            Select one theater
          </option>

          {theaters.map((theater) => (
            <option key={theater.id} value={theater.id}>
              {theater.name
                .toLowerCase()
                .includes(theater.city.toLowerCase())
                ? theater.name
                : `${theater.name} · ${theater.city}`}
            </option>
          ))}
        </select>

        <p
          id="cashier-theater-help"
          className="admin-preview-note"
        >
          {theaters.length === 0
            ? "No theater options are available. Return to the account list and try again later."
            : initialTheaterId === ""
              ? "This cashier is currently unassigned. They can log in, but cannot access theater screenings until a theater is assigned."
              : "This cashier has one assigned theater. Choose a different theater to replace it."}
        </p>

        <p className="admin-preview-note">
          Changing assignments does not cancel existing
          reservations or delete their history.
        </p>

        {/* Report validation, request or navigation failures. */}
        {error && (
          <p
            id="cashier-theater-error"
            className="admin-edit-error"
            role="alert"
          >
            {error}
          </p>
        )}

        {savedResult && (
          <p className="admin-notice" role="status">
            Theater assignment saved.
          </p>
        )}

        {/* Continue after success; reload after uncertainty; otherwise save. */}
        <div className="admin-screening-form-actions">
          {savedResult ? (
            <button
              type="button"
              className="primary-button"
              onClick={continueAfterSave}
              disabled={
                saving || typeof onSaved !== "function"
              }
            >
              {saving ? "Opening accounts…" : "Continue"}
            </button>
          ) : needsReload ? (
            <button
              type="button"
              className="primary-button"
              onClick={onReload}
              disabled={saving}
            >
              Reload current assignments
            </button>
          ) : (
            <button
              type="submit"
              className="primary-button"
              disabled={
                saving ||
                !selectedTheaterId ||
                selectedTheaterId === initialTheaterId ||
                theaters.length === 0 ||
                typeof onSaved !== "function"
              }
            >
              {saving
                ? "Saving assignment…"
                : "Save assignment"}
            </button>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
            disabled={
              saving || typeof onCancel !== "function"
            }
          >
            Back to cashier accounts
          </button>
        </div>
      </form>
    </section>
  );
}

export default CashierTheaterAssignments;