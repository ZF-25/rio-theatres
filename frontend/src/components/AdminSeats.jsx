/*
 * FILE: frontend/src/components/AdminSeats.jsx
 *
 * PURPOSE
 * -------
 * Provides the owner's seat/reservation workspace.
 *
 * VIEWS
 * -----
 * Seats / New reservation:
 * StaffReservationEditor loads a screening's seat map and can
 * create an unpaid reservation.
 *
 * Reservations:
 * CashierReservations provides search, pagination, editing,
 * and cancellation.
 *
 * IMPORTANT
 * ---------
 * Selecting seats does not reserve them immediately.
 * The reservation service performs that operation on Save.
 *
 * Customer purchases remain separate from staff reservations.
 * Use the owner's Bookings tab to inspect customer purchases.
 *
 * This component requires owner access.
 * The shared editor/list also support cashier use elsewhere.
 */

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useStaffSession,
} from "../hooks/useStaffSession.js";

import StaffReservationEditor from "./StaffReservationEditor.jsx";
import CashierReservations from "./CashierReservations.jsx";
import RequestState from "./RequestState.jsx";


function AdminSeats() {
  const {
    isOwner,
    status,
    sessionError,
    isSessionLoading,
    refreshSession,
    enabled,
    mode,
  } = useStaffSession();


  /*
   * Start with the screening picker and seat-map editor.
   *
   * null:
   * Reservation list.
   *
   * { reservationId: null, generation }:
   * New reservation / seat-map view.
   *
   * { reservationId: string, generation }:
   * Edit a reservation.
   */
  const [editor, setEditor] = useState({
    reservationId: null,
    generation: 0,
  });

  const [notice, setNotice] =
    useState("");

  const [listVersion, setListVersion] =
    useState(0);

  const headingRef = useRef(null);
  const mounted = useRef(false);
  const editorGeneration = useRef(0);


  /*
   * LIFECYCLE / OUTDATED CALLBACK PROTECTION
   *
   * A completed request from an older editor must not close
   * a newer editor.
   */
  useEffect(() => {
    mounted.current = true;

    return () => {
      // The mounted flag blocks callbacks after unmount.
      // Keep the active editor generation stable during Strict Mode checks.
      mounted.current = false;
    };
  }, []);


  const editing = editor !== null;

  useEffect(() => {
    headingRef.current?.focus({
      preventScroll: true,
    });
  }, [
    editing,
    editor?.reservationId,
  ]);


  /*
   * SHOW THE RESERVATION LIST
   */
  function showReservations() {
    editorGeneration.current += 1;

    setEditor(null);
    setNotice("");

    setListVersion((previous) => {
      return previous + 1;
    });
  }


  /*
   * START A FRESH SEAT-MAP / RESERVATION VIEW
   */
  function startNewReservation() {
    const generation =
      ++editorGeneration.current;

    setNotice("");

    setEditor({
      reservationId: null,
      generation,
    });
  }


  /*
   * EDIT BY ID
   *
   * The editor retrieves the latest reservation and version.
   * Do not initialise editing from a potentially stale list row.
   */
  function editReservation(reservationId) {
    const generation =
      ++editorGeneration.current;

    setNotice("");

    setEditor({
      reservationId,
      generation,
    });
  }


  /*
   * HANDLE A SAVED RESERVATION
   *
   * Child editor already performed the mutation.
   * Never submit another reservation here.
   */
  function handleSaved(
    reservation,
    generation,
    wasEditing,
  ) {
    if (!mounted.current) {
      return;
    }

    setListVersion((previous) => {
      return previous + 1;
    });

    if (
      generation !== editorGeneration.current
    ) {
      return;
    }

    editorGeneration.current += 1;

    setNotice(
      `Reservation ${reservation.reference} ${
        wasEditing
          ? "updated"
          : "created"
      }.`,
    );

    setEditor(null);
  }


  /*
   * OWNER ACCESS GUARD
   */
  if (
    !enabled ||
    isSessionLoading ||
    status === "error" ||
    !isOwner
  ) {
    return (
      <section className="admin-seats">
        <h2
          ref={headingRef}
          tabIndex={-1}
        >
          Seats and reservations
        </h2>

        {isSessionLoading ? (
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
            An active owner account and matching staff
            catalogue are required.
          </p>
        )}
      </section>
    );
  }


  return (
    <section
      className="admin-seats"
      aria-labelledby="owner-seats-title"
    >
      <h2
        id="owner-seats-title"
        ref={headingRef}
        tabIndex={-1}
      >
        Seats and reservations
      </h2>

      <p className="admin-introduction">
        Choose a screening to view its seat map.
        Seats become reserved only when you create
        or save a reservation.
      </p>


      {/* WORKSPACE NAVIGATION */}
      <nav
        className="cashier-workspace-navigation"
        aria-label="Owner seat workspace sections"
      >
        <button
          type="button"
          className={
            editor &&
            !editor.reservationId
              ? "primary-button"
              : "secondary-button"
          }
          aria-current={
            editor &&
            !editor.reservationId
              ? "page"
              : undefined
          }
          onClick={startNewReservation}
        >
          Seats / New reservation
        </button>

        <button
          type="button"
          className={
            !editor
              ? "primary-button"
              : "secondary-button"
          }
          aria-current={
            !editor ? "page" : undefined
          }
          onClick={showReservations}
        >
          Find reservations
        </button>
      </nav>


      {notice && (
        <p
          className="admin-notice"
          role="status"
        >
          {notice}
        </p>
      )}


      {/* STATUS KEY FOR THE SHARED SEAT MAP */}
      {editor && (
        <ul
          className="seat-legend"
          aria-label="Seat availability key"
        >
          {[
            ["seat-available", "Available"],
            ["seat-sold", "Booked"],
            ["seat-held", "Temporarily held"],
            ["seat-staff-reserved", "Staff reserved"],
            ["seat-selected", "Selected"],
            ["seat-reserved", "Owner reserved"],
          ].map(([className, label]) => (
            <li key={className}>
              <span
                className={`legend-swatch ${className}`}
              />

              {label}
            </li>
          ))}
        </ul>
      )}


      {/* SHARED EDITOR OR LIST */}
      {editor ? (
        <StaffReservationEditor
          key={editor.generation}
          reservationId={
            editor.reservationId
          }
          onSaved={(reservation) => {
            handleSaved(
              reservation,
              editor.generation,
              Boolean(
                editor.reservationId,
              ),
            );
          }}
          onCancel={showReservations}
        />
      ) : (
        <CashierReservations
          key={listVersion}
          onEditReservation={
            editReservation
          }
          onCreateReservation={
            startNewReservation
          }
        />
      )}


      {mode === "demo" && (
        <p className="admin-preview-note">
          Demo reservations share customer seat availability
          in this running application. Records reset on refresh.
        </p>
      )}
    </section>
  );
}

export default AdminSeats;