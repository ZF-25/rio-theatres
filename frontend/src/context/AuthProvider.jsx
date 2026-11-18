/*
 * FILE: frontend/src/context/AuthProvider.jsx
 *
 * Manages shared authentication state for Rio Theaters.
 *
 * Handles session checks, login, registration, and logout.
 * Prevents duplicate requests and ignores outdated responses.
 *
 * Components access this information through useAuth().
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AuthContext,
} from "./AuthContext.js";

import {
  auth,
  authMode,
} from "../services/auth.js";

import {
  ApiError,
} from "../services/apiClient.js";

/*
 * Provides authentication state and functions to child components.
 *
 * Session status can be:
 * "loading", "authenticated", "anonymous", or "error".
 */
export function AuthProvider({ children }) {
  // Store the current user, session status, and session errors.
  const [session, setSession] = useState({
    user: null,
    status: "loading",
    error: null,
  });

  // Track the authentication action currently running.
  const [pendingAction, setPendingAction] =
    useState(null);

  // Prevent multiple login, registration, or logout requests.
  const actionInProgress = useRef(false);

  // Identify outdated requests so they cannot overwrite newer results.
  const requestVersion = useRef(0);

  // Prevent state updates after the provider unmounts.
  const mounted = useRef(false);

  /*
   * Check the current authentication session.
   * Used when the application starts or retries a failed check.
   */
  const refreshSession = useCallback(
    async ({ signal } = {}) => {
      // Stop immediately if the request has been cancelled.
      signal?.throwIfAborted();

      // Avoid refreshing during another authentication action.
      if (actionInProgress.current) {
        return;
      }

      // Give this request a unique version number.
      const version =
        ++requestVersion.current;

      // Show loading while preserving the previous user temporarily.
      if (mounted.current) {
        setSession((previous) => ({
          ...previous,
          status: "loading",
          error: null,
        }));
      }

      try {
        // Ask the selected authentication service for the session.
        const response =
          await auth.getSession({ signal });

        // Ignore cancelled, outdated, or unmounted requests.
        if (
          !mounted.current ||
          signal?.aborted ||
          version !== requestVersion.current
        ) {
          return;
        }

        const user = response.data.user;

        // Update the session based on whether a user exists.
        setSession({
          user,
          status: user
            ? "authenticated"
            : "anonymous",
          error: null,
        });

        return user;
      } catch (error) {
        // Ignore cancelled requests and outdated errors.
        if (
          !mounted.current ||
          signal?.aborted ||
          error?.name === "AbortError" ||
          version !== requestVersion.current
        ) {
          return;
        }

        // Ensure the error is a standard JavaScript Error object.
        const sessionError =
          error instanceof Error
            ? error
            : new Error(
                "Unable to check your session.",
              );

        // Mark the session as failed rather than assuming logout.
        setSession({
          user: null,
          status: "error",
          error: sessionError,
        });

        return null;
      }
    },
    [],
  );

  /*
   * Check the session when AuthProvider mounts.
   * Cancel the request during cleanup.
   */
  useEffect(() => {
    mounted.current = true;

    const controller =
      new AbortController();

    // Delay the request slightly to support React StrictMode cleanup.
    Promise.resolve()
      .then(() => {
        if (!controller.signal.aborted) {
          return refreshSession({
            signal: controller.signal,
          });
        }
      })
      .catch(() => {
        // Handle cancellation before the session check begins.
      });

    // Cleanup prevents old requests from updating authentication state.
    return () => {
      mounted.current = false;

      controller.abort();

      requestVersion.current += 1;
    };
  }, [refreshSession]);

  /*
   * Shared handler for login, registration, and logout.
   * Keeps request locking and session updates in one place.
   */
  const performAction = useCallback(
    async (action, credentials) => {
      // Authentication cannot run if the provider is unmounted.
      if (!mounted.current) {
        throw new ApiError(
          "Authentication is not available.",
          {
            code: "AUTH_UNAVAILABLE",
          },
        );
      }

      // Reject overlapping authentication requests.
      if (actionInProgress.current) {
        throw new ApiError(
          "Please wait for the current authentication request.",
          {
            code: "AUTH_BUSY",
          },
        );
      }

      // Lock authentication and update the loading indicator.
      actionInProgress.current = true;
      setPendingAction(action);

      // Prevent earlier session checks from overwriting this action.
      const version =
        ++requestVersion.current;

      try {
        let user;

        if (action === "logout") {
          // Clear the user only after the service confirms logout.
          await auth.logout();
          user = null;
        } else {
          // Call auth.login() or auth.register() using the credentials.
          const response =
            await auth[action](credentials);

          user = response.data.user;
        }

        // Update state only if this is still the latest request.
        if (
          mounted.current &&
          version === requestVersion.current
        ) {
          setSession({
            user,
            status: user
              ? "authenticated"
              : "anonymous",
            error: null,
          });
        }

        // Return the user profile, or null after logout.
        return user;
      } finally {
        // Always release the lock, even if the request fails.
        actionInProgress.current = false;

        if (mounted.current) {
          setPendingAction(null);
        }
      }
    },
    [],
  );

  // Authenticate an existing account.
  const login = useCallback(
    (credentials) => {
      return performAction(
        "login",
        credentials,
      );
    },
    [performAction],
  );

  // Register a new customer account.
  const register = useCallback(
    (credentials) => {
      return performAction(
        "register",
        credentials,
      );
    },
    [performAction],
  );

  // Sign out the current account.
  const logout = useCallback(
    () => {
      return performAction("logout");
    },
    [performAction],
  );

  /*
   * Create the shared authentication context value.
   * useMemo() avoids recreating it when dependencies are unchanged.
   */
  const value = useMemo(
    () => ({
      // Current user and session information.
      user: session.user,
      status: session.status,
      sessionError: session.error,

      // True while checking the current session.
      isSessionLoading:
        session.status === "loading",

      // True when a signed-in user has been confirmed.
      isAuthenticated:
        session.status === "authenticated" &&
        session.user !== null,

      // Used for customer-only UI; backend still enforces permissions.
      isCustomer:
        session.status === "authenticated" &&
        session.user?.role === "customer",

      // Current authentication action and submission status.
      pendingAction,
      isSubmitting:
        pendingAction !== null,

      // Selected authentication mode: "demo" or "api".
      mode: authMode,

      // Functions available through useAuth().
      login,
      register,
      logout,
      refreshSession,
    }),
    [
      session,
      pendingAction,
      login,
      register,
      logout,
      refreshSession,
    ],
  );

  // Make authentication information available to child components.
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}