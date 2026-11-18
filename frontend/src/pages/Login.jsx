/*
 * FILE: frontend/src/pages/Login.jsx
 *
 * Displays the Rio Theaters customer login page.
 * Handles login, logout, session checks, and navigation.
 * Supports both demo and API authentication.
 */

import { useRef, useState } from "react";

import { useAuth } from "../hooks/useAuth.js";
import RequestState from "../components/RequestState.jsx";
import { getUserDisplayName } from "../utils/userName.js";

/*
 * Customer login component.
 *
 * onLogin: Continues after successful login.
 * onRegister: Opens customer registration.
 * onStaffLogin: Opens staff login.
 * onAdminLogin: Older staff navigation prop.
 */
function Login({
  onLogin,
  onRegister,
  onStaffLogin,
  onAdminLogin,
}) {
  // Access shared authentication state and functions.
  const {
    user,
    status,
    sessionError,
    isSessionLoading,
    isSubmitting,
    pendingAction,
    mode,
    login,
    logout,
    refreshSession,
  } = useAuth();

  // Store login details, errors, and the current action.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [localAction, setLocalAction] = useState("");

  // Prevent overlapping actions and disable controls while busy.
  const actionInProgress = useRef(false);
  const busy = isSubmitting || localAction !== "";

  // Use the newer staff login callback, with an older fallback.
  const openStaffLogin = onStaffLogin ?? onAdminLogin;

  // Clear a field's validation error when the user edits it.
  function clearFieldError(field) {
    setError("");

    setFieldErrors((previous) => ({
      ...previous,
      [field]: "",
    }));
  }

  /*
   * Validate login details and authenticate the customer.
   * App.jsx handles navigation after successful login.
   */
  async function handleSubmit(event) {
    event.preventDefault();

    // Stop duplicate submissions or login while already signed in.
    if (
      actionInProgress.current ||
      isSubmitting ||
      isSessionLoading ||
      user
    ) {
      return;
    }

    setError("");
    setFieldErrors({});

    // Normalise email addresses without changing passwords.
    const normalisedEmail = email.trim().toLowerCase();

    // Both credentials are required.
    if (!normalisedEmail || !password) {
      setError("Enter your email and password.");
      return;
    }

    // Check that App.jsx can handle navigation after login.
    if (typeof onLogin !== "function") {
      setError(
        "Login navigation is unavailable. Please try again.",
      );
      return;
    }

    // Lock the form while authentication is running.
    actionInProgress.current = true;
    setLocalAction("login");

    try {
      // Authenticate through the shared AuthProvider.
      const account = await login({
        email: normalisedEmail,
        password,
      });

      // Staff accounts cannot continue through customer login.
      if (account?.role !== "customer") {
        setError(
          "This account belongs to staff. Customer login is for customer accounts.",
        );
        return;
      }

      // Pass only the account profile to App.jsx.
      await onLogin(account);
    } catch (requestError) {
      // Display authentication and field-specific errors.
      setError(
        requestError?.message ||
          "Unable to log in. Please try again.",
      );

      setFieldErrors(requestError?.fieldErrors ?? {});
    } finally {
      // Clear the password and release the action lock.
      setPassword("");
      actionInProgress.current = false;
      setLocalAction("");
    }
  }

  /*
   * Sign out the current user without leaving the page.
   * Display an error if logout fails.
   */
  async function handleLogout() {
    if (actionInProgress.current || isSubmitting) {
      return;
    }

    actionInProgress.current = true;
    setLocalAction("logout");
    setError("");
    setFieldErrors({});
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
      setLocalAction("");
    }
  }

  /*
   * Continue using an existing customer session.
   * No new login request is needed.
   */
  async function continueSignedIn() {
    if (
      actionInProgress.current ||
      isSubmitting ||
      user?.role !== "customer" ||
      typeof onLogin !== "function"
    ) {
      return;
    }

    actionInProgress.current = true;
    setLocalAction("continue");
    setError("");

    try {
      await onLogin(user);
    } catch (navigationError) {
      setError(
        navigationError?.message ||
          "Unable to continue. Please try again.",
      );
    } finally {
      actionInProgress.current = false;
      setLocalAction("");
    }
  }

  // Retrieve validation messages for individual inputs.
  const emailError = fieldErrors.email;
  const passwordError = fieldErrors.password;

  /*
   * Display the appropriate view based on session status:
   * loading, error, signed-in account, or login form.
   */
  return (
    <section
      className="container login-section"
      aria-labelledby="login-title"
    >
      <div className="login-page">
        <h1 id="login-title" tabIndex={-1}>
          Welcome back
        </h1>

        {/* Check the session before displaying the login form. */}
        {isSessionLoading ? (
          <RequestState
            loading
            loadingMessage="Checking your session…"
          />
        ) : status === "error" ? (
          <RequestState
            error={sessionError}
            onRetry={() => {
              refreshSession();
            }}
          />
        ) : user ? (
          // Display the existing account instead of the login form.
          <div className="login-form" aria-busy={busy}>
            <p>
              Signed in as{" "}
              <strong>{getUserDisplayName(user)}</strong>.
            </p>

            {/* Staff users must use the separate staff login page. */}
            {user.role !== "customer" && (
              <p>
                This is a staff account. Sign out here, then use
                Staff login to open the staff workspace.
              </p>
            )}

            {/* Display logout or navigation errors. */}
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}

            {/* Existing customers can continue without logging in again. */}
            {user.role === "customer" && (
              <button
                type="button"
                className="login-submit-button"
                onClick={continueSignedIn}
                disabled={busy || typeof onLogin !== "function"}
              >
                {localAction === "continue"
                  ? "Continuing…"
                  : "Continue"}
              </button>
            )}

            {/* Sign out the current account. */}
            <button
              type="button"
              className="secondary-button"
              onClick={handleLogout}
              disabled={busy}
            >
              {localAction === "logout" || pendingAction === "logout"
                ? "Logging out…"
                : "Log out"}
            </button>
          </div>
        ) : (
          // Show the login form when no user is signed in.
          <form
            className="login-form"
            onSubmit={handleSubmit}
            aria-busy={busy}
          >
            {/* General authentication errors. */}
            {error && (
              <p
                id="customer-login-error"
                className="login-error"
                role="alert"
              >
                {error}
              </p>
            )}

            {/* Email input, stored in React state. */}
            <label htmlFor="customer-login-email">
              <span>Email</span>

              <input
                id="customer-login-email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearFieldError("email");
                }}
                required
                disabled={busy}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={
                  emailError
                    ? "customer-login-email-error"
                    : undefined
                }
              />

              {/* Email validation error. */}
              {emailError && (
                <span
                  id="customer-login-email-error"
                  className="login-error"
                >
                  {emailError}
                </span>
              )}
            </label>

            {/* Password input; the value is never trimmed. */}
            <label htmlFor="customer-login-password">
              <span>Password</span>

              <input
                id="customer-login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  clearFieldError("password");
                }}
                required
                disabled={busy}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={
                  passwordError
                    ? "customer-login-password-error"
                    : undefined
                }
              />

              {/* Password validation error. */}
              {passwordError && (
                <span
                  id="customer-login-password-error"
                  className="login-error"
                >
                  {passwordError}
                </span>
              )}
            </label>

            {/* Disable login while an authentication action is running. */}
            <button
              type="submit"
              className="login-submit-button"
              disabled={busy}
            >
              {localAction === "login" || pendingAction === "login"
                ? "Logging in…"
                : busy
                  ? "Please wait…"
                  : "Log in"}
            </button>
          </form>
        )}

        {/* Navigation to customer registration. */}
        {!user && (
          <p className="login-register-text">
            New customer?{" "}
            <button
              type="button"
              className="login-text-button"
              onClick={onRegister}
              disabled={
                busy ||
                isSessionLoading ||
                typeof onRegister !== "function"
              }
            >
              Create an account
            </button>
          </p>
        )}

        {/* Separate login page for owners and cashiers. */}
        <div className="login-admin-preview">
          <p>Working at Rio Theaters?</p>

          <button
            type="button"
            className="customer-admin-login-button"
            onClick={openStaffLogin}
            disabled={
              busy ||
              isSessionLoading ||
              Boolean(user) ||
              typeof openStaffLogin !== "function"
            }
          >
            Staff login
          </button>

          <p className="login-staff-note">
            For the owner and cashiers.
            {user && " Sign out first to switch accounts."}
          </p>
        </div>

        {/* Explain temporary account storage in demo mode. */}
        {mode === "demo" && (
          <p className="login-staff-note">
            Demo mode: create a customer account first, then sign
            in with those details. Refreshing the browser resets
            demo accounts.
          </p>
        )}
      </div>
    </section>
  );
}

export default Login;