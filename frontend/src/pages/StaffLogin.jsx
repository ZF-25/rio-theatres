/*
 * FILE: frontend/src/pages/StaffLogin.jsx
 *
 * Displays the Rio Theaters staff login page.
 *
 * Handles owner/cashier authentication, logout,
 * existing sessions, and workspace navigation.
 *
 * Supports both demo and API authentication modes.
 */

import { useRef, useState } from "react";

import { useStaffSession } from "../hooks/useStaffSession.js";
import { getUserDisplayName } from "../utils/userName.js";
import RequestState from "../components/RequestState.jsx";

/*
 * Staff login component.
 *
 * onAuthenticated: Opens the appropriate staff workspace.
 * onCustomerLogin: Navigates to the customer login page.
 */
function StaffLogin({ onAuthenticated, onCustomerLogin }) {
  // Access shared staff authentication state and functions.
  const {
    staff,
    currentAccount,
    status,
    sessionError,
    isSessionLoading,
    isSubmitting,
    pendingAction,
    mode,
    login,
    logout,
    refreshSession,
  } = useStaffSession();

  // Store login details, errors, and the current action.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [localAction, setLocalAction] = useState(null);

  // Prevent duplicate actions before React updates the interface.
  const actionInProgress = useRef(false);

  // Disable controls during authentication or navigation.
  const busy = isSubmitting || localAction !== null;
  const activeAction = localAction ?? pendingAction;

  /*
   * Validate credentials and authenticate staff.
   * App.jsx handles navigation after successful login.
   */
  async function handleSubmit(event) {
    event.preventDefault();

    // Stop duplicate submissions or requests during session loading.
    if (actionInProgress.current || busy || isSessionLoading) {
      return;
    }

    // Normalise the email without modifying the password.
    const normalisedEmail = email.trim().toLowerCase();

    if (!normalisedEmail || !password) {
      setError("Enter your email and password.");
      return;
    }

    // Ensure App.jsx can open the staff workspace.
    if (typeof onAuthenticated !== "function") {
      setError(
        "Staff navigation is unavailable. Check the StaffLogin route in App.jsx.",
      );
      return;
    }

    // Lock the form while login and navigation are running.
    actionInProgress.current = true;
    setLocalAction("login");
    setError("");

    try {
      // Authenticate through the selected staff service.
      const account = await login({
        email: normalisedEmail,

        // Preserve the password exactly as entered.
        password,
      });

      // Pass only the staff profile to App.jsx.
      await onAuthenticated(account);
    } catch (requestError) {
      // Display authentication or navigation errors.
      setError(
        requestError?.message ||
          "Unable to sign in. Please try again.",
      );
    } finally {
      // Clear the password and release the action lock.
      setPassword("");
      actionInProgress.current = false;
      setLocalAction(null);
    }
  }

  /*
   * Open the workspace using an existing staff session.
   * No new login request is needed.
   */
  async function openWorkspace() {
    if (
      actionInProgress.current ||
      busy ||
      !staff ||
      typeof onAuthenticated !== "function"
    ) {
      return;
    }

    actionInProgress.current = true;
    setLocalAction("continue");
    setError("");

    try {
      await onAuthenticated(staff);
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Unable to open your workspace.",
      );
    } finally {
      actionInProgress.current = false;
      setLocalAction(null);
    }
  }

  /*
   * Sign out the current account.
   * Display an error if logout fails.
   */
  async function handleLogout() {
    if (actionInProgress.current || busy) {
      return;
    }

    actionInProgress.current = true;
    setLocalAction("logout");
    setError("");
    setPassword("");

    try {
      await logout();
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Unable to log out. Please try again.",
      );
    } finally {
      actionInProgress.current = false;
      setLocalAction(null);
    }
  }

  /*
   * Display session loading, errors, existing accounts,
   * or the staff login form.
   */
  return (
    <section
      className="container admin-login-page"
      aria-labelledby="staff-login-title"
    >
      <div className="admin-login-content">
        <p className="eyebrow">RIO THEATERS STAFF</p>

        <h1 id="staff-login-title" tabIndex={-1}>
          Staff login
        </h1>

        <p className="admin-login-introduction">
          Sign in with your staff account. Your assigned role determines
          which workspace you can access.
        </p>

        {/* Check the current session before displaying login options. */}
        {isSessionLoading ? (
          <RequestState
            loading
            loadingMessage="Checking your staff session…"
          />
        ) : status === "error" ? (
          <RequestState
            error={sessionError}
            onRetry={() => {
              refreshSession();
            }}
          />
        ) : staff ? (
          // Show the existing owner or cashier account.
          <div className="admin-login-form" aria-busy={busy}>
            <p>
              Signed in as{" "}
              <strong>{getUserDisplayName(staff)}</strong>{" "}
              ({staff.role}).
            </p>

            {error && (
              <p className="admin-edit-error" role="alert">
                {error}
              </p>
            )}

            {/* Continue to the staff workspace. */}
            <button
              type="button"
              className="primary-button admin-login-submit"
              onClick={openWorkspace}
              disabled={busy || typeof onAuthenticated !== "function"}
            >
              {activeAction === "continue"
                ? "Opening workspace…"
                : "Open workspace"}
            </button>

            {/* Sign out the current staff account. */}
            <button
              type="button"
              className="secondary-button"
              onClick={handleLogout}
              disabled={busy}
            >
              {activeAction === "logout" ? "Logging out…" : "Log out"}
            </button>
          </div>
        ) : currentAccount ? (
          // Show an authenticated account without staff permissions.
          <div className="admin-login-form" aria-busy={busy}>
            <p>
              Signed in as{" "}
              <strong>{getUserDisplayName(currentAccount)}</strong>.
            </p>

            <p>
              This account does not have owner or cashier access.
              Sign out to use a staff account.
            </p>

            {error && (
              <p className="admin-edit-error" role="alert">
                {error}
              </p>
            )}

            {/* Allow the user to switch accounts. */}
            <button
              type="button"
              className="secondary-button"
              onClick={handleLogout}
              disabled={busy}
            >
              {activeAction === "logout" ? "Logging out…" : "Log out"}
            </button>
          </div>
        ) : (
          // Show the login form when no account is signed in.
          <form
            className="admin-login-form"
            onSubmit={handleSubmit}
            aria-busy={busy}
          >
            {/* Staff email input. */}
            <label htmlFor="staff-login-email">
              <span>Email</span>

              <input
                id="staff-login-email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                aria-describedby={
                  error ? "staff-login-error" : undefined
                }
                maxLength={254}
                disabled={busy}
                required
              />
            </label>

            {/* Staff password input. */}
            <label htmlFor="staff-login-password">
              <span>Password</span>

              <input
                id="staff-login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                aria-describedby={
                  error ? "staff-login-error" : undefined
                }
                disabled={busy}
                required
              />
            </label>

            {/* Display login or validation errors. */}
            {error && (
              <p
                id="staff-login-error"
                className="admin-edit-error"
                role="alert"
              >
                {error}
              </p>
            )}

            {/* Submit the staff login form. */}
            <button
              type="submit"
              className="primary-button admin-login-submit"
              disabled={busy}
            >
              {activeAction === "login" ? "Signing in…" : "Log in"}
            </button>
          </form>
        )}

        {/* Navigate to the customer login page. */}
        <p className="admin-login-customer-link">
          Looking to book tickets?{" "}
          <button
            type="button"
            onClick={onCustomerLogin}
            disabled={
              busy ||
              isSessionLoading ||
              typeof onCustomerLogin !== "function"
            }
          >
            Customer login
          </button>
        </p>

        {/* Explain how staff accounts are managed. */}
        <p className="admin-login-demo-note">
          {mode === "demo"
            ? "Demo mode: staff accounts are managed by the owner and reset on browser refresh. Use example credentials only."
            : "Staff accounts are managed by the company owner."}
        </p>
      </div>
    </section>
  );
}

export default StaffLogin;