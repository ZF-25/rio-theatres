/*
 * FILE: frontend/src/pages/CashierDashboard.jsx
 *
 * PURPOSE
 * -------
 * Provides the cashier workspace.
 *
 * VIEWS
 * -----
 * CashierReservations:
 * Search, pagination, and reservation cancellation.
 *
 * StaffReservationEditor:
 * Reservation creation and version-aware editing.
 *
 * ACCOUNT NAME UPDATE
 * -------------------
 * getUserDisplayName() combines firstName and lastName
 * for the greeting.
 *
 * Staff identity comes from useStaffSession().
 * Child components use the configured demo/API services.
 * Logout remains in the shared header.
 */

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { useStaffSession } from "../hooks/useStaffSession.js";
import { getUserDisplayName } from "../utils/userName.js";

import CashierReservations from "../components/CashierReservations.jsx";
import StaffReservationEditor from "../components/StaffReservationEditor.jsx";
import RequestState from "../components/RequestState.jsx";

function CashierDashboard() {
  const {
    staff,
    isCashier,
    status,
    sessionError,
    isSessionLoading,
    refreshSession,
    enabled,
    mode,
  } = useStaffSession();

  /*
   * editor === null:
   * Show the reservation list.
   *
   * editor.reservationId === null:
   * Create a new reservation.
   *
   * editor.reservationId is a string:
   * Load and edit that reservation.
   *
   * generation identifies a particular editor instance.
   */
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState("");
  const [listVersion, setListVersion] = useState(0);

  const headingRef = useRef(null);
  const mounted = useRef(false);
  const editorGeneration = useRef(0);

  /*
   * Prevent an older request's completion callback from
   * closing a newer editor or updating an unmounted page.
   */
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      editorGeneration.current += 1;
    };
  }, []);

  const editing = editor !== null;

  useEffect(() => {
    headingRef.current?.focus({
      preventScroll: true,
    });
  }, [editing]);

  /*
   * Open the list and invalidate callbacks from the old editor.
   * Remounting the list triggers a fresh service read.
   */
  function showReservations() {
    editorGeneration.current += 1;
    setEditor(null);
    setNotice("");
    setListVersion((previous) => previous + 1);
  }

  /*
   * The reservation editor supplies its own screening picker.
   */
  function startNewReservation() {
    const generation = ++editorGeneration.current;

    setNotice("");
    setEditor({
      reservationId: null,
      generation,
    });
  }

  /*
   * Pass only the ID.
   * The editor loads the latest record and version itself.
   */
  function editReservation(reservationId) {
    const generation = ++editorGeneration.current;

    setNotice("");
    setEditor({
      reservationId,
      generation,
    });
  }

  /*
   * Refresh after a successful reservation mutation.
   * Leave any newer editor in place if an older request finishes.
   */
  function handleSaved(reservation, generation, wasEditing) {
    if (!mounted.current) {
      return;
    }

    setListVersion((previous) => previous + 1);

    if (generation !== editorGeneration.current) {
      return;
    }

    editorGeneration.current += 1;

    setNotice(
      `Reservation ${reservation.reference} ${
        wasEditing ? "updated" : "created"
      }.`,
    );

    setEditor(null);
  }

  /*
   * SESSION / ACCESS FEEDBACK
   *
   * Hooks above always run before this conditional return.
   * Express must independently enforce cashier permissions.
   */
  if (
    !enabled ||
    isSessionLoading ||
    status === "error" ||
    !isCashier
  ) {
    return (
      <section className="container admin-section">
        <h1
          id="cashier-page-title"
          ref={headingRef}
          tabIndex={-1}
        >
          Cashier workspace
        </h1>

        {isSessionLoading ? (
          <RequestState
            loading
            loadingMessage="Checking cashier access…"
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
            An active cashier account and matching staff
            catalogue are required.
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      className="container admin-section cashier-dashboard"
      aria-labelledby="cashier-page-title"
    >
      <div className="cashier-workspace-heading">
        <div>
          <h1
            id="cashier-page-title"
            ref={headingRef}
            tabIndex={-1}
          >
            Cashier workspace
          </h1>

          <p>
            Welcome, {getUserDisplayName(staff, "Cashier")}.
            {" "}Manage unpaid customer reservations.
          </p>
        </div>
      </div>

      {/* WORKSPACE NAVIGATION */}
      <nav
        className="cashier-workspace-navigation"
        aria-label="Cashier workspace sections"
      >
        <button
          type="button"
          className={
            !editor ? "primary-button" : "secondary-button"
          }
          aria-current={!editor ? "page" : undefined}
          onClick={showReservations}
        >
          Find reservations
        </button>

        <button
          type="button"
          className={
            editor && !editor.reservationId
              ? "primary-button"
              : "secondary-button"
          }
          aria-current={
            editor && !editor.reservationId
              ? "page"
              : undefined
          }
          onClick={startNewReservation}
        >
          New reservation
        </button>
      </nav>

      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}

      {/* RESERVATION LIST OR EDITOR */}
      {editor ? (
        <StaffReservationEditor
          key={editor.generation}
          reservationId={editor.reservationId}
          onSaved={(reservation) => {
            handleSaved(
              reservation,
              editor.generation,
              Boolean(editor.reservationId),
            );
          }}
          onCancel={showReservations}
        />
      ) : (
        <CashierReservations
          key={listVersion}
          onEditReservation={editReservation}
          onCreateReservation={startNewReservation}
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

export default CashierDashboard;