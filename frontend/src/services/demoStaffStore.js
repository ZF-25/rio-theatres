/*
 * FILE: frontend/src/services/demoStaffStore.js
 *
 * Manages shared demo staff accounts and permissions.
 *
 * Owners can access all theaters.
 * Cashiers can access only their assigned theater.
 * Unassigned cashiers have no theater access.
 *
 * Real API mode must enforce permissions on the backend.
 */

import { createStaffStore } from "../store/staffModel.js";
import { ApiError } from "./apiClient.js";

// Create one shared store for all demo staff features.
export const demoStaffStore = createStaffStore();

/*
 * Return the latest active staff profile.
 * Converts the internal "admin" role to "owner".
 */
export function getDemoStaffUser() {
  const snapshot = demoStaffStore.getSnapshot();

  // Find the currently signed-in account and check it is active.
  const account = snapshot.accounts.find(
    (item) =>
      item.id === snapshot.currentStaff?.id &&
      item.active,
  );

  if (!account) {
    return null;
  }

  // Convert the internal admin role to the frontend owner role.
  const role =
    account.role === "admin"
      ? "owner"
      : account.role;

  // Only owners and cashiers can use staff features.
  if (!["owner", "cashier"].includes(role)) {
    return null;
  }

  // Prepare separate first and last names.
  const firstName =
    typeof account.firstName === "string"
      ? account.firstName.trim()
      : "";

  const lastName =
    typeof account.lastName === "string"
      ? account.lastName.trim()
      : "";

  // Cashiers have at most one assigned theater.
  // Missing assignments never grant access.
  const theaterId =
    role === "cashier" &&
    typeof account.theaterId === "string" &&
    account.theaterId.trim() !== ""
      ? account.theaterId
      : null;

  const fullName = [firstName, lastName]
    .filter(Boolean)
    .join(" ");

  // Support older accounts with a single name field.
  const legacyName =
    typeof account.name === "string"
      ? account.name.trim()
      : "";

  // Return public profile information without passwords.
  return {
    id: account.id,
    firstName,
    lastName,
    name: fullName || legacyName,
    email: account.email,
    role,
    active: true,

    // Keep theaterIds for compatibility with older components.
    ...(role === "cashier"
      ? {
          theaterId,
          theaterIds:
            theaterId === null
              ? []
              : [theaterId],
        }
      : {}),
  };
}

/*
 * Require an active staff account with an allowed role.
 * Throws an error when authentication or permission is missing.
 */
export function requireDemoStaff(
  allowedRoles = ["owner", "cashier"],
) {
  const user = getDemoStaffUser();

  // A missing or inactive account must sign in again.
  if (!user) {
    throw new ApiError(
      "Sign in with an active staff account.",
      {
        status: 401,
        code: "AUTH_REQUIRED",
      },
    );
  }

  // Check whether the user's role is allowed.
  if (!allowedRoles.includes(user.role)) {
    throw new ApiError(
      "Your account cannot perform this operation.",
      {
        status: 403,
        code: "FORBIDDEN",
      },
    );
  }

  return user;
}

/*
 * Check whether the current staff member can access a theater.
 * Returns true or false instead of throwing an error.
 */
export function canDemoStaffAccessTheater(theaterId) {
  // Reject missing or invalid theater IDs.
  if (
    typeof theaterId !== "string" ||
    theaterId.trim() === ""
  ) {
    return false;
  }

  // Always check the latest staff account.
  const user = getDemoStaffUser();

  if (!user) {
    return false;
  }

  // Owners have access to every theater.
  if (user.role === "owner") {
    return true;
  }

  // Cashiers can access only their assigned theater.
  return (
    user.theaterId !== null &&
    user.theaterId === theaterId
  );
}

/*
 * Require permission to access a specific theater.
 *
 * Throws:
 * 401 - Staff authentication required.
 * 403 - Theater access denied.
 * 404 - Hidden or inaccessible reservation.
 * 422 - Invalid theater ID.
 */
export function requireDemoTheaterAccess(
  theaterId,
  { hideResource = false } = {},
) {
  // Require an active owner or cashier account.
  const user = requireDemoStaff();

  // Validate the theater ID before checking permissions.
  if (
    typeof theaterId !== "string" ||
    theaterId.trim() === ""
  ) {
    throw new ApiError(
      "The resource has no valid theater.",
      {
        status: 422,
        code: "VALIDATION_ERROR",
      },
    );
  }

  // Owners can access all theaters; cashiers only their own.
  const allowed =
    user.role === "owner" ||
    (
      user.theaterId !== null &&
      user.theaterId === theaterId
    );

  // Reject access when the staff member lacks permission.
  if (!allowed) {
    throw new ApiError(
      hideResource
        ? "Reservation not found."
        : "Your account cannot access this theater.",
      {
        status: hideResource ? 404 : 403,
        code: hideResource ? "NOT_FOUND" : "FORBIDDEN",
      },
    );
  }

  return user;
}