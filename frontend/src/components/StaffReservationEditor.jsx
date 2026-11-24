/*
 * FILE: frontend/src/components/StaffReservationEditor.jsx
 *
 * PURPOSE
 * -------
 * Creates and edits unpaid staff reservations.
 *
 * THEATER ACCESS
 * --------------
 * Owners use all theaters; cashiers use assigned theaters.
 * Services independently enforce permissions.
 *
 * EDITING
 * -------
 * The screening stays fixed.
 * Updates include the loaded reservation version.
 *
 * DEPENDENCY FIX
 * --------------
 * The reservation loader explicitly requires staffId, keeping
 * account-change reloads without a dependency warning.
 *
 * SAVE RECOVERY
 * -------------
 * Uncertain mutations are not automatically repeated.
 * A completed save followed by navigation failure retries
 * navigation only.
 */

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

import { staffService, staffEnabled } from "../services/staff.js";

import { staffScreenings } from "../services/staffScreenings.js";
import { collectPages } from "../services/apiCatalogue.js";
import { ApiError } from "../services/apiClient.js";

import { useStaffSession } from "../hooks/useStaffSession.js";
import { useStaffScreening } from "../hooks/useStaffScreening.js";
import { useResource } from "../hooks/useResource.js";

import {
  cinemaDate,
  cinemaTime,
  formatCinemaDate,
} from "../utils/cinemaTime.js";

import RequestState from "./RequestState.jsx";

/*
 * Load permitted theaters before loading a day's screenings.
 */
function ScreeningPicker({ onSelect }) {
  const [filters, setFilters] = useState(() => ({
    cinemaId: "",
    date: cinemaDate(),
  }));

  const [selectedId, setSelectedId] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  const snapshot = useSyncExternalStore(
    staffScreenings.subscribe,
    staffScreenings.getSnapshot,
    staffScreenings.getSnapshot,
  );

  const loadTheaters = useCallback(
    (signal) => {
      void snapshot;
      void refreshVersion;

      return collectPages(staffScreenings.listTheaters, { signal });
    },
    [snapshot, refreshVersion],
  );

  const theatersResult = useResource(loadTheaters);
  const theaters = theatersResult.data ?? [];

  const theatersReady =
    !theatersResult.loading &&
    !theatersResult.error &&
    theatersResult.data != null;

  const noTheaters = theatersReady && theaters.length === 0;

  const unavailableFilter = Boolean(
    theatersReady &&
    filters.cinemaId &&
    !theaters.some((theater) => theater.id === filters.cinemaId),
  );

  const canLoadScreenings =
    theatersReady && !noTheaters && !unavailableFilter && Boolean(filters.date);

  const loadScreenings = useCallback(
    (signal) => {
      if (!canLoadScreenings) {
        return Promise.resolve([]);
      }

      void snapshot;
      void refreshVersion;

      return collectPages(
        (query, options) =>
          staffScreenings.listScreenings(
            {
              ...query,
              cinemaId: filters.cinemaId || undefined,
              date: filters.date,
            },
            options,
          ),
        { signal },
      );
    },
    [canLoadScreenings, filters, snapshot, refreshVersion],
  );

  const screeningsResult = useResource(loadScreenings);
  const screenings = screeningsResult.data ?? [];

  const selected =
    canLoadScreenings && !screeningsResult.loading && !screeningsResult.error
      ? screenings.find((screening) => screening.id === selectedId)
      : null;

  function changeFilter(patch) {
    setSelectedId("");
    setFilters((previous) => ({
      ...previous,
      ...patch,
    }));
  }

  function refreshOptions() {
    setSelectedId("");
    setRefreshVersion((previous) => previous + 1);
  }

  return (
    <section>
      <h3>Choose a screening</h3>

      <RequestState
        loading={theatersResult.loading}
        error={theatersResult.error}
        onRetry={refreshOptions}
        loadingMessage="Loading permitted theaters…"
      />

      {noTheaters && (
        <p className="admin-notice" role="status">
          No theaters are available to your account. A cashier needs theater
          assignments from the owner before creating reservations.
        </p>
      )}

      <form
        className="admin-screening-form"
        onSubmit={(event) => {
          event.preventDefault();

          if (selected && typeof onSelect === "function") {
            onSelect(selected.id);
          }
        }}
      >
        <label>
          <span>Theater</span>
          <select
            value={filters.cinemaId}
            disabled={!theatersReady || noTheaters}
            onChange={(event) => changeFilter({ cinemaId: event.target.value })}
          >
            <option value="">All permitted theaters</option>

            {unavailableFilter && (
              <option value={filters.cinemaId} disabled>
                Previously selected theater — access unavailable
              </option>
            )}

            {theaters.map((theater) => (
              <option key={theater.id} value={theater.id}>
                {theater.name.toLowerCase().includes(theater.city.toLowerCase())
                  ? theater.name
                  : `${theater.name} ${theater.city}`}
              </option>
            ))}
          </select>
        </label>

        {unavailableFilter && (
          <p className="admin-edit-error" role="alert">
            Access to the selected theater is no longer available. Choose
            another theater or all permitted theaters.
          </p>
        )}

        <label>
          <span>Screening date in Finland</span>
          <input
            type="date"
            value={filters.date}
            disabled={!theatersReady || noTheaters}
            onChange={(event) => changeFilter({ date: event.target.value })}
          />
        </label>

        {canLoadScreenings && (
          <RequestState
            loading={screeningsResult.loading}
            error={screeningsResult.error}
            onRetry={refreshOptions}
            loadingMessage="Loading screenings…"
          />
        )}

        <label>
          <span>Screening</span>
          <select
            value={selected?.id ?? ""}
            disabled={
              !canLoadScreenings ||
              screeningsResult.loading ||
              Boolean(screeningsResult.error) ||
              screenings.length === 0
            }
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">Select screening</option>

            {screenings.map((screening) => (
              <option key={screening.id} value={screening.id}>
                {screening.movieTitle}
                {" · "}
                {screening.cinemaName}
                {" · "}
                {screening.roomName}
                {" · "}
                {cinemaTime(screening.startsAt)}
              </option>
            ))}
          </select>
        </label>

        {canLoadScreenings &&
          !screeningsResult.loading &&
          !screeningsResult.error &&
          screenings.length === 0 && (
            <p role="status">
              No future screenings match this date and theater.
            </p>
          )}

        <div className="admin-screening-form-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={!selected || typeof onSelect !== "function"}
          >
            Choose seats
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={refreshOptions}
            disabled={theatersResult.loading || screeningsResult.loading}
          >
            Refresh screenings and access
          </button>
        </div>
      </form>
    </section>
  );
}

/*
 * PROPS
 * -----
 * reservationId: existing record to edit.
 * initialScreeningId: optional fixed screening for creation.
 * onSaved(record): parent refreshes/closes the editor.
 * onCancel(): parent returns to the list.
 */
function StaffReservationEditor({
  reservationId = null,
  initialScreeningId = null,
  onSaved,
  onCancel,
}) {
  const { staff, status, sessionError, isSessionLoading, refreshSession } =
    useStaffSession();

  const staffId = staff?.id;

  const hasAccess = Boolean(
    staffEnabled &&
    !isSessionLoading &&
    status === "authenticated" &&
    ["owner", "cashier"].includes(staff?.role),
  );

  /*
   * Do not reload the edited record on every inventory change:
   * that would discard unsaved edits.
   *
   * Account changes invalidate the loader through staffId.
   * Saving rechecks permissions and version through the service.
   */
  const loadReservation = useCallback(
    async (signal) => {
      if (!hasAccess || !staffId || !reservationId) {
        return null;
      }

      const response = await staffService.getReservation(reservationId, {
        signal,
      });

      const record = response?.data;

      if (
        record?.id !== reservationId ||
        typeof record.screeningId !== "string" ||
        typeof record.customerName !== "string" ||
        typeof record.note !== "string" ||
        !Array.isArray(record.seats) ||
        !record.seats.length ||
        !record.seats.every((seat) => typeof seat?.id === "string") ||
        !Number.isInteger(record.version) ||
        record.version < 1 ||
        !["active", "cancelled"].includes(record.status)
      ) {
        throw new ApiError(
          "The service returned invalid reservation details.",
          { code: "INVALID_RESPONSE" },
        );
      }

      return response;
    },
    [hasAccess, staffId, reservationId],
  );

  const reservationResult = useResource(loadReservation);

  if (!hasAccess) {
    return (
      <section>
        <h2>Reservation editor</h2>

        {isSessionLoading ? (
          <RequestState loading loadingMessage="Checking staff access…" />
        ) : status === "error" ? (
          <RequestState
            error={sessionError}
            onRetry={() => {
              refreshSession();
            }}
          />
        ) : (
          <p>
            An active owner or cashier account and matching staff catalogue are
            required.
          </p>
        )}
      </section>
    );
  }

  if (reservationId && !reservationResult.data) {
    return (
      <section>
        <h2>Load reservation</h2>

        <RequestState
          loading={reservationResult.loading}
          error={reservationResult.error}
          onRetry={reservationResult.retry}
          loadingMessage="Loading the latest reservation…"
        />

        <button
          type="button"
          className="secondary-button"
          onClick={onCancel}
          disabled={typeof onCancel !== "function"}
        >
          Back to reservations
        </button>
      </section>
    );
  }

  const reservation = reservationResult.data?.data ?? null;

  if (reservation?.status === "cancelled") {
    return (
      <section>
        <h2>Reservation cancelled</h2>
        <p>This reservation can no longer be edited.</p>

        <button
          type="button"
          className="secondary-button"
          onClick={onCancel}
          disabled={typeof onCancel !== "function"}
        >
          Back to reservations
        </button>
      </section>
    );
  }

  return (
    <ReservationForm
      key={
        reservation
          ? `${staffId}:${reservation.id}:${reservation.version}`
          : `${staffId}:new:${initialScreeningId ?? "choose"}`
      }
      reservation={reservation}
      initialScreeningId={initialScreeningId}
      onSaved={onSaved}
      onCancel={onCancel}
      onReload={reservationResult.retry}
    />
  );
}

function ReservationForm({
  reservation,
  initialScreeningId,
  onSaved,
  onCancel,
  onReload,
}) {
  const [screeningId, setScreeningId] = useState(
    reservation?.screeningId ?? initialScreeningId ?? "",
  );

  const [selectedIds, setSelectedIds] = useState(
    () => reservation?.seats.map((seat) => seat.id) ?? [],
  );

  const [customerName, setCustomerName] = useState(
    reservation?.customerName ?? "",
  );

  const [note, setNote] = useState(reservation?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [conflict, setConflict] = useState(false);
  const [uncertainSave, setUncertainSave] = useState(false);
  const [savedRecord, setSavedRecord] = useState(null);

  const submissionInProgress = useRef(false);
  const completedRef = useRef(null);

  const availability = useStaffScreening(screeningId);
  const { screening, seatMap } = availability;

  const seats = seatMap?.seats ?? [];
  const seatsById = new Map(seats.map((seat) => [seat.id, seat]));

  const originalSeatIds = new Set(
    reservation?.seats.map((seat) => seat.id) ?? [],
  );

  /*
   * An edited reservation may retain its own reserved seats.
   * The service rechecks the complete replacement before saving.
   */
  function selectable(seat) {
    return Boolean(
      seat &&
      (seat.status === "available" ||
        (reservation &&
          originalSeatIds.has(seat.id) &&
          seat.status === "staff_reserved")),
    );
  }

  const invalidSelection = selectedIds.some(
    (id) => !selectable(seatsById.get(id)),
  );

  const locked = saving || conflict || uncertainSave || savedRecord !== null;

  const canSave = Boolean(
    !locked &&
    availability.isBookable &&
    !availability.error &&
    selectedIds.length > 0 &&
    !invalidSelection &&
    typeof onSaved === "function",
  );

  /*
   * Draw seats using service coordinates rather than guessing
   * their position from numeric labels.
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
    .sort((a, b) => b.rowIndex - a.rowIndex)
    .map((row) => ({
      ...row,
      seats: [...row.seats].sort((a, b) => a.columnIndex - b.columnIndex),
    }));

  function toggleSeat(seat) {
    if (locked || submissionInProgress.current) return;

    setError("");

    if (selectedIds.includes(seat.id)) {
      setSelectedIds((previous) => previous.filter((id) => id !== seat.id));
      return;
    }

    if (!availability.isBookable || !selectable(seat)) {
      return;
    }

    setSelectedIds((previous) => [...previous, seat.id]);
  }

  /*
   * A successful mutation is remembered separately from navigation.
   * Repeating navigation cannot create another reservation.
   */
  async function handleSave(event) {
    event.preventDefault();

    if (submissionInProgress.current || typeof onSaved !== "function") {
      return;
    }

    const existingResult = completedRef.current;

    if (!existingResult && !canSave) return;

    setError("");
    setFieldErrors({});

    if (!existingResult) {
      const errors = {};

      if (!customerName.trim() || customerName.trim().length > 100) {
        errors.customerName =
          "Enter a customer name between 1 and 100 characters.";
      }

      if (note.trim().length > 500) {
        errors.note = "Use at most 500 characters.";
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setError("Please check the highlighted fields.");
        return;
      }
    }

    submissionInProgress.current = true;
    setSaving(true);

    let completed = existingResult;

    try {
      if (!completed) {
        const body = {
          seatIds: [...selectedIds],
          customerName: customerName.trim(),
          note: note.trim(),
        };

        const response = reservation
          ? await staffService.updateReservation(reservation.id, {
              ...body,
              version: reservation.version,
            })
          : await staffService.createReservation({
              ...body,
              screeningId,
            });

        if (
          typeof response?.data?.id !== "string" ||
          typeof response.data.reference !== "string" ||
          response.data.screeningId !== screeningId ||
          response.data.status !== "active" ||
          !Number.isInteger(response.data.version) ||
          response.data.version < 1 ||
          (reservation && response.data.id !== reservation.id)
        ) {
          throw new ApiError(
            "The reservation response was invalid. Check the reservation list before trying again.",
            { code: "INVALID_RESPONSE" },
          );
        }

        completed = response.data;
        completedRef.current = completed;
        setSavedRecord(completed);
      }

      await onSaved(completed);
    } catch (requestError) {
      if (completed) {
        setError(
          "The reservation was saved. Use Return to reservations to open the list.",
        );
      } else {
        setError(requestError?.message || "Unable to save this reservation.");

        setFieldErrors(requestError?.fieldErrors ?? {});

        if (
          requestError?.code === "RESERVATION_CHANGED" ||
          requestError?.code === "RESERVATION_CANCELLED" ||
          requestError?.code === "RESERVATION_INACTIVE"
        ) {
          setConflict(true);
        } else if (
          !requestError?.status ||
          requestError.status >= 500 ||
          requestError.code === "INVALID_RESPONSE"
        ) {
          setUncertainSave(true);
        } else {
          availability.refresh();
        }
      }
    } finally {
      submissionInProgress.current = false;
      setSaving(false);
    }
  }

  const canChangeScreening = !reservation && !initialScreeningId;

  const statusClasses = {
    available: "seat-available",
    booked: "seat-sold",
    held: "seat-held",
    staff_reserved: "seat-staff-reserved",
    owner_blocked: "seat-reserved",
  };

  const statusLabels = {
    available: "available",
    booked: "booked",
    held: "temporarily held",
    staff_reserved: "staff reserved",
    owner_blocked: "owner reserved",
  };

  return (
    <section aria-labelledby="reservation-editor-title">
      <h2 id="reservation-editor-title">
        {reservation ? "Edit reservation" : "New reservation"}
      </h2>

      {reservation && (
        <p className="admin-reservation-reference">{reservation.reference}</p>
      )}

      {!screeningId ? (
        <ScreeningPicker
          onSelect={(id) => {
            setScreeningId(id);
            setSelectedIds([]);
            setError("");
          }}
        />
      ) : (
        <>
          <RequestState
            loading={availability.loading}
            error={availability.error}
            onRetry={availability.retry}
            loadingMessage="Loading screening and seats…"
          />

          {screening && !availability.error && (
            <p className="seat-screening-description">
              {screening.movieTitle}
              {" · "}
              {screening.cinemaName}
              {" · "}
              {screening.roomName}
              {" · "}
              {formatCinemaDate(screening.startsAt)}
              {" · "}
              {cinemaTime(screening.startsAt)}
            </p>
          )}

          {screening &&
            !availability.loading &&
            !availability.error &&
            !availability.isBookable && (
              <p className="admin-edit-error" role="alert">
                This screening cannot accept new or edited reservations because
                it has started or been cancelled.
              </p>
            )}

          {seatMap && !availability.error && (
            <div
              className="seat-map-scroll"
              role="region"
              aria-label="Reservation seat map"
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

                        return (
                          <button
                            key={seat.id}
                            type="button"
                            className={`cinema-seat ${
                              selected
                                ? "seat-selected"
                                : (statusClasses[seat.status] ?? "seat-sold")
                            }`}
                            disabled={
                              locked ||
                              (!selected &&
                                (!selectable(seat) || !availability.isBookable))
                            }
                            aria-pressed={selected}
                            aria-label={
                              `Row ${seat.rowLabel}, seat ${seat.label}, ` +
                              (statusLabels[seat.status] ?? "unavailable") +
                              (selected ? ", selected" : "")
                            }
                            onClick={() => toggleSeat(seat)}
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
              </div>
            </div>
          )}

          <p className="seat-selection-status" role="status">
            Selected seats:{" "}
            {selectedIds.length
              ? selectedIds
                  .map((id) => seatsById.get(id)?.label ?? "Unavailable seat")
                  .join(", ")
              : "None"}
          </p>

          {!savedRecord && invalidSelection && seatMap && !availability.error && (
            <p className="admin-edit-error">
              Some selected seats are unavailable. Review the selection before
              saving.
            </p>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={availability.refresh}
            disabled={saving || availability.refreshing}
          >
            {availability.refreshing
              ? "Refreshing seats…"
              : "Refresh availability and access"}
          </button>

          {canChangeScreening && !locked && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setScreeningId("");
                setSelectedIds([]);
                setError("");
              }}
            >
              Choose another screening
            </button>
          )}
        </>
      )}

      {/* Reservation contact names remain a single field. */}
      <form
        className="admin-screening-form"
        onSubmit={handleSave}
        aria-busy={saving}
        noValidate
      >
        {error && (
          <p className="admin-edit-error" role="alert">
            {error}
          </p>
        )}

        <label htmlFor="reservation-customer-name">
          <span>Customer name</span>
          <input
            id="reservation-customer-name"
            name="customerName"
            type="text"
            maxLength={100}
            value={customerName}
            required
            disabled={locked}
            onChange={(event) => {
              setCustomerName(event.target.value);
              setError("");
              setFieldErrors((previous) => ({
                ...previous,
                customerName: "",
              }));
            }}
            aria-invalid={fieldErrors.customerName ? true : undefined}
            aria-describedby={
              fieldErrors.customerName ? "reservation-name-error" : undefined
            }
          />

          {fieldErrors.customerName && (
            <span id="reservation-name-error" className="admin-edit-error">
              {fieldErrors.customerName}
            </span>
          )}
        </label>

        <label htmlFor="reservation-note">
          <span>Note — optional</span>
          <textarea
            id="reservation-note"
            name="note"
            rows={3}
            maxLength={500}
            value={note}
            disabled={locked}
            onChange={(event) => {
              setNote(event.target.value);
              setError("");
              setFieldErrors((previous) => ({
                ...previous,
                note: "",
              }));
            }}
            aria-invalid={fieldErrors.note ? true : undefined}
            aria-describedby={
              fieldErrors.note ? "reservation-note-error" : undefined
            }
          />

          {fieldErrors.note && (
            <span id="reservation-note-error" className="admin-edit-error">
              {fieldErrors.note}
            </span>
          )}
        </label>

        {conflict && reservation && (
          <button
            type="button"
            className="secondary-button"
            onClick={onReload}
            disabled={saving}
          >
            Reload latest reservation — discards edits
          </button>
        )}

        {uncertainSave && (
          <p className="admin-preview-note">
            The save result could not be confirmed. Return to the reservation
            list and check before submitting another reservation.
          </p>
        )}

        <div className="admin-screening-form-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={
              saving ||
              (!savedRecord && !canSave) ||
              typeof onSaved !== "function"
            }
          >
            {saving
              ? "Saving reservation…"
              : savedRecord
                ? "Return to reservations"
                : reservation
                  ? "Save changes"
                  : "Create reservation"}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
            disabled={saving || typeof onCancel !== "function"}
          >
            Back to reservations
          </button>
        </div>
      </form>
    </section>
  );
}

export default StaffReservationEditor;
