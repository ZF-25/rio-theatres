/*
 * FILE: frontend/src/pages/Register.jsx
 *
 * Displays the Rio Theaters customer registration page.
 * Handles form validation, account creation, and navigation.
 * Supports both demo and API authentication.
 */

import { useRef, useState } from "react";

import { useAuth } from "../hooks/useAuth.js";
import RequestState from "../components/RequestState.jsx";
import { getUserDisplayName } from "../utils/userName.js";

/*
 * Registration page component.
 * onRegister continues after registration.
 * onLogin opens the login page.
 */
function Register({ onRegister, onLogin }) {
  // Access the shared authentication state and methods.
  const {
    user,
    status,
    sessionError,
    isSessionLoading,
    isSubmitting,
    pendingAction,
    mode,
    register,
    logout,
    refreshSession,
  } = useAuth();

  // Store the registration form values.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Track errors and the current page action.
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [localAction, setLocalAction] = useState("");

  // Prevent duplicate actions without waiting for a React re-render.
  const actionInProgress = useRef(false);
  const busy = isSubmitting || localAction !== "";

  // Clear the error for a field when the customer edits it.
  function clearFieldError(field) {
    setError("");

    setFieldErrors((previous) => ({
      ...previous,
      [field]: "",
    }));
  }

  /*
   * Validate the registration form and create an account.
   * Successful registration passes the account to App.jsx.
   */
  async function handleSubmit(event) {
    event.preventDefault();

    // Stop duplicate submissions or registration while signed in.
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

    // Clean names and email, but preserve the password.
    const cleanedFirstName = firstName.trim();
    const cleanedLastName = lastName.trim();
    const normalisedEmail = email.trim().toLowerCase();

    const errors = {};

    // Validate the first and last names.
    if (
      cleanedFirstName.length < 1 ||
      cleanedFirstName.length > 100
    ) {
      errors.firstName =
        "Enter a first name between 1 and 100 characters.";
    }

    if (
      cleanedLastName.length < 1 ||
      cleanedLastName.length > 100
    ) {
      errors.lastName =
        "Enter a last name between 1 and 100 characters.";
    }

    // Check the email length and basic format.
    if (
      normalisedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalisedEmail)
    ) {
      errors.email = "Enter a valid email address.";
    }

    // Passwords must contain 8–128 characters.
    if (password.length < 8 || password.length > 128) {
      errors.password =
        "Use a password between 8 and 128 characters.";
    }

    // Password confirmation must match exactly.
    if (!confirmPassword || password !== confirmPassword) {
      errors.confirmPassword = "Your passwords do not match.";
    }

    // Display validation errors and stop submission.
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Please check the highlighted fields.");
      return;
    }

    // Registration requires a navigation callback.
    if (typeof onRegister !== "function") {
      setError(
        "Registration navigation is unavailable. Please try again.",
      );
      return;
    }

    // Lock the form while registration is running.
    actionInProgress.current = true;
    setLocalAction("register");

    try {
      // Create the account through AuthProvider.
      const account = await register({
        firstName: cleanedFirstName,
        lastName: cleanedLastName,
        email: normalisedEmail,
        password,
      });

      // Only customer accounts can continue through registration.
      if (account?.role !== "customer") {
        setError(
          "Registration did not return a customer account. Please sign out and contact support.",
        );
        return;
      }

      // Let App.jsx decide where the customer goes next.
      await onRegister(account);
    } catch (requestError) {
      // Display general and field-specific service errors.
      setError(
        requestError?.message ||
          "Unable to create your account. Please try again.",
      );

      setFieldErrors(requestError?.fieldErrors ?? {});
    } finally {
      // Clear passwords and release the action lock.
      setPassword("");
      setConfirmPassword("");
      actionInProgress.current = false;
      setLocalAction("");
    }
  }

  /*
   * Allows an already signed-in customer to continue.
   * Useful when registration succeeded but navigation failed.
   */
  async function continueSignedIn() {
    if (
      actionInProgress.current ||
      isSubmitting ||
      user?.role !== "customer" ||
      typeof onRegister !== "function"
    ) {
      return;
    }

    actionInProgress.current = true;
    setLocalAction("continue");
    setError("");

    try {
      await onRegister(user);
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

  /*
   * Signs out the current user without leaving the page.
   * This allows another customer to register.
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
    setConfirmPassword("");

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
   * Render the appropriate view:
   * loading, session error, signed-in user, or registration form.
   */
  return (
    <section
      className="container register-page"
      aria-labelledby="register-title"
    >
      <div className="register-content">
        <h1 id="register-title" tabIndex={-1}>
          Create your account
        </h1>

        <p className="register-introduction">
          Keep your future bookings in one place.
        </p>

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
          // Show account information instead of the registration form.
          <div className="register-form" aria-busy={busy}>
            <p>
              Signed in as{" "}
              <strong>{getUserDisplayName(user)}</strong>.
            </p>

            {user.role !== "customer" && (
              <p>
                This is a staff account. Sign out before creating
                a customer account.
              </p>
            )}

            {error && (
              <p className="register-error" role="alert">
                {error}
              </p>
            )}

            {/* Existing customers can continue without registering again. */}
            {user.role === "customer" && (
              <button
                type="button"
                className="primary-button register-submit"
                onClick={continueSignedIn}
                disabled={busy || typeof onRegister !== "function"}
              >
                {localAction === "continue"
                  ? "Continuing…"
                  : "Continue"}
              </button>
            )}

            {/* Allow signed-in users to log out. */}
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
          // Controlled inputs store their values in React state.
          <form
            className="register-form"
            onSubmit={handleSubmit}
            aria-busy={busy}
            noValidate
          >
            {/* Display general registration errors. */}
            {error && (
              <p
                id="register-error"
                className="register-error"
                role="alert"
              >
                {error}
              </p>
            )}

            {/* First name input. */}
            <label htmlFor="register-first-name">
              <span>First name</span>

              <input
                id="register-first-name"
                name="firstName"
                type="text"
                autoComplete="given-name"
                maxLength={100}
                value={firstName}
                required
                disabled={busy}
                onChange={(event) => {
                  setFirstName(event.target.value);
                  clearFieldError("firstName");
                }}
                aria-invalid={fieldErrors.firstName ? true : undefined}
                aria-describedby={
                  fieldErrors.firstName
                    ? "register-first-name-error"
                    : undefined
                }
              />

              {fieldErrors.firstName && (
                <span
                  id="register-first-name-error"
                  className="register-error"
                >
                  {fieldErrors.firstName}
                </span>
              )}
            </label>

            {/* Last name input. */}
            <label htmlFor="register-last-name">
              <span>Last name</span>

              <input
                id="register-last-name"
                name="lastName"
                type="text"
                autoComplete="family-name"
                maxLength={100}
                value={lastName}
                required
                disabled={busy}
                onChange={(event) => {
                  setLastName(event.target.value);
                  clearFieldError("lastName");
                }}
                aria-invalid={fieldErrors.lastName ? true : undefined}
                aria-describedby={
                  fieldErrors.lastName
                    ? "register-last-name-error"
                    : undefined
                }
              />

              {fieldErrors.lastName && (
                <span
                  id="register-last-name-error"
                  className="register-error"
                >
                  {fieldErrors.lastName}
                </span>
              )}
            </label>

            {/* Email input used for future logins. */}
            <label htmlFor="register-email">
              <span>Email</span>

              <input
                id="register-email"
                name="email"
                type="email"
                autoComplete="username"
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
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={
                  fieldErrors.email
                    ? "register-email-error"
                    : undefined
                }
              />

              {fieldErrors.email && (
                <span
                  id="register-email-error"
                  className="register-error"
                >
                  {fieldErrors.email}
                </span>
              )}
            </label>

            {/* Password input; changing it also clears confirmation errors. */}
            <label htmlFor="register-password">
              <span>Password</span>

              <input
                id="register-password"
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
                  clearFieldError("confirmPassword");
                }}
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={
                  fieldErrors.password
                    ? "register-password-help register-password-error"
                    : "register-password-help"
                }
              />

              {fieldErrors.password && (
                <span
                  id="register-password-error"
                  className="register-error"
                >
                  {fieldErrors.password}
                </span>
              )}
            </label>

            <p
              id="register-password-help"
              className="register-password-help"
            >
              Use between 8 and 128 characters.
            </p>

            {/* Confirmation is checked locally and never sent to the API. */}
            <label htmlFor="register-confirm-password">
              <span>Confirm password</span>

              <input
                id="register-confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={confirmPassword}
                required
                disabled={busy}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  clearFieldError("confirmPassword");
                }}
                aria-invalid={
                  fieldErrors.confirmPassword ? true : undefined
                }
                aria-describedby={
                  fieldErrors.confirmPassword
                    ? "register-confirm-password-error"
                    : undefined
                }
              />

              {fieldErrors.confirmPassword && (
                <span
                  id="register-confirm-password-error"
                  className="register-error"
                >
                  {fieldErrors.confirmPassword}
                </span>
              )}
            </label>

            {/* Disable submission while an authentication action is running. */}
            <button
              type="submit"
              className="primary-button register-submit"
              disabled={busy}
            >
              {localAction === "register" || pendingAction === "register"
                ? "Creating account…"
                : busy
                  ? "Please wait…"
                  : "Create account"}
            </button>
          </form>
        )}

        {/* Link to the login page for existing customers. */}
        {!user && (
          <p className="register-login">
            Already registered?{" "}
            <button
              type="button"
              onClick={onLogin}
              disabled={
                busy ||
                isSessionLoading ||
                typeof onLogin !== "function"
              }
            >
              Log in
            </button>
          </p>
        )}

        {/* Explain that demo accounts disappear after a refresh. */}
        {mode === "demo" && (
          <p className="register-demo-note">
            Demo mode: your account is kept only in this running
            application. You can log out and sign in again, but
            refreshing the browser resets demo accounts.
          </p>
        )}
      </div>
    </section>
  );
}

export default Register;