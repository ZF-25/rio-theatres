/*
 * FILE: frontend/src/hooks/useStaffSession.js
 *
 * Custom React hook for managing staff authentication.
 *
 * Supports demo and API modes, staff login, logout,
 * session checks, and owner/cashier role identification.
 *
 * Backend authorization is still required for protected actions.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "./useAuth.js";
import { useStaffStore } from "../store/useStaffStore.js";

import {
  getDemoStaffUser,
} from "../services/demoStaffStore.js";

import {
  staffMode,
  staffEnabled,
} from "../services/staff.js";

import { ApiError } from "../services/apiClient.js";

// Check whether a role belongs to an owner or cashier.
function isStaffRole(role) {
  return role === "owner" || role === "cashier";
}

/*
 * Provides staff identity and authentication functions.
 * Uses AuthProvider in API mode and the staff store in demo mode.
 */
export function useStaffSession() {
  // Get authentication information from the shared provider.
  const {
    user: sharedUser,
    status: sharedStatus,
    sessionError: sharedSessionError,
    isSessionLoading: sharedSessionLoading,
    isSubmitting: sharedSubmitting,
    pendingAction: sharedPendingAction,
    login: sharedLogin,
    logout: sharedLogout,
    refreshSession: sharedRefreshSession,
  } = useAuth();

  // Get demo staff accounts and authentication functions.
  const {
    accounts,
    currentStaff,
    login: demoLogin,
    logout: demoLogout,
  } = useStaffStore();

  // Track demo authentication actions and prevent duplicates.
  const [demoPendingAction, setDemoPendingAction] =
    useState(null);

  const demoActionInProgress = useRef(false);

  /*
   * Find the currently active demo staff account.
   * Convert the internal "admin" role to "owner".
   */
  const demoUser = useMemo(() => {
    const account = accounts.find(
      (item) =>
        item.id === currentStaff?.id &&
        item.active,
    );

    // An inactive or missing account cannot access staff features.
    if (!account) {
      return null;
    }

    const role =
      account.role === "admin"
        ? "owner"
        : account.role;

    if (!isStaffRole(role)) {
      return null;
    }

    // Prepare separate first and last names for display.
    const firstName =
      typeof account.firstName === "string"
        ? account.firstName.trim()
        : "";

    const lastName =
      typeof account.lastName === "string"
        ? account.lastName.trim()
        : "";

    const fullName = [firstName, lastName]
      .filter(Boolean)
      .join(" ");

    // Support older demo accounts that use a single name field.
    const legacyName =
      typeof account.name === "string"
        ? account.name.trim()
        : "";

    return {
      id: account.id,
      firstName,
      lastName,

      // Keep the combined name for existing demo components.
      name: fullName || legacyName,

      email: account.email,
      role,
      active: true,
    };
  }, [accounts, currentStaff?.id]);

  // Only authenticated owners and cashiers count as API staff.
  const apiUser =
    sharedStatus === "authenticated" &&
    isStaffRole(sharedUser?.role)
      ? sharedUser
      : null;

  // Select the staff profile based on the configured mode.
  const staff =
    staffMode === "api"
      ? apiUser
      : demoUser;

  // Detect when a customer is signed in on the staff login page.
  const hasCustomerSession = Boolean(
    staffMode === "api" &&
    sharedStatus === "authenticated" &&
    sharedUser?.role === "customer",
  );

  /*
   * Authenticate a staff account.
   * API mode uses AuthProvider; demo mode uses the staff store.
   */
  const login = useCallback(
    async (credentials) => {
      if (staffMode === "api") {
        const account = await sharedLogin(credentials);

        // Reject customer accounts from the staff interface.
        if (!isStaffRole(account?.role)) {
          throw new ApiError(
            "This is a customer account. Use customer login or sign out to switch accounts.",
            {
              status: 403,
              code: "FORBIDDEN",
            },
          );
        }

        return account;
      }

      // Prevent overlapping demo authentication requests.
      if (demoActionInProgress.current) {
        throw new ApiError(
          "Please wait for the current staff action.",
          { code: "AUTH_BUSY" },
        );
      }

      demoActionInProgress.current = true;
      setDemoPendingAction("login");

      try {
        // Attempt login using the shared demo staff store.
        const result = demoLogin(credentials);

        // Convert demo login failures into standard API-style errors.
        if (result.error) {
          throw new ApiError(
            result.error,
            {
              status: 401,
              code: "INVALID_CREDENTIALS",
            },
          );
        }

        // Retrieve the latest staff profile after login.
        const account = getDemoStaffUser();

        // Remove access if the account has no valid staff role.
        if (!account || !isStaffRole(account.role)) {
          demoLogout();

          throw new ApiError(
            "This account does not have staff access.",
            {
              status: 403,
              code: "FORBIDDEN",
            },
          );
        }

        return account;
      } finally {
        // Always clear the demo action lock.
        demoActionInProgress.current = false;
        setDemoPendingAction(null);
      }
    },
    [sharedLogin, demoLogin, demoLogout],
  );

  /*
   * Sign out the current staff account.
   * Does not navigate away from the current page.
   */
  const logout = useCallback(
    async () => {
      if (staffMode === "api") {
        await sharedLogout();
        return null;
      }

      // Prevent duplicate demo logout requests.
      if (demoActionInProgress.current) {
        throw new ApiError(
          "Please wait for the current staff action.",
          { code: "AUTH_BUSY" },
        );
      }

      demoActionInProgress.current = true;
      setDemoPendingAction("logout");

      try {
        demoLogout();
        return null;
      } finally {
        demoActionInProgress.current = false;
        setDemoPendingAction(null);
      }
    },
    [sharedLogout, demoLogout],
  );

  /*
   * Refresh staff session information.
   * API mode checks the backend; demo mode reads the local store.
   */
  const refreshSession = useCallback(
    async (options = {}) => {
      if (staffMode === "api") {
        return sharedRefreshSession(options);
      }

      // Stop if the caller has cancelled the request.
      options.signal?.throwIfAborted();

      return getDemoStaffUser();
    },
    [sharedRefreshSession],
  );

  // Identify authenticated API accounts without a staff role.
  const status =
    staffMode === "api"
      ? sharedStatus === "authenticated" && !apiUser
        ? "wrong_role"
        : sharedStatus
      : demoUser
        ? "authenticated"
        : "anonymous";

  // Return staff information and authentication actions.
  return {
    staff,

    // Staff authentication and role checks.
    isAuthenticated: staff !== null,
    isOwner: staff?.role === "owner",
    isCashier: staff?.role === "cashier",

    status,

    // Session loading and error information.
    isSessionLoading:
      staffMode === "api"
        ? sharedSessionLoading
        : false,

    sessionError:
      staffMode === "api"
        ? sharedSessionError
        : null,

    // Current authentication submission state.
    isSubmitting:
      staffMode === "api"
        ? sharedSubmitting
        : demoPendingAction !== null,

    pendingAction:
      staffMode === "api"
        ? sharedPendingAction
        : demoPendingAction,

    hasCustomerSession,

    // Actual account, including customers signed in during API mode.
    currentAccount:
      staffMode === "api"
        ? sharedUser
        : demoUser,

    // Authentication configuration.
    mode: staffMode,
    enabled: staffEnabled,

    // Functions available to staff components.
    login,
    logout,
    refreshSession,
  };
}