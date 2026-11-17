/*
 * FILE: frontend/src/utils/userName.js
 *
 * PURPOSE
 * -------
 * Builds a display name from an account's firstName and lastName.
 *
 * USED BY
 * -------
 * Customer login and registration pages, staff login,
 * dashboards, and cashier account lists.
 *
 * API ACCOUNT FIELDS
 * ------------------
 * {
 *   firstName: "John",
 *   lastName: "Smith",
 *   email: "john@example.com"
 * }
 *
 * IMPORTANT
 * ---------
 * This helper is for display only.
 *
 * Registration and cashier creation must collect firstName
 * and lastName separately and send them separately.
 *
 * Do not split a full name automatically: names can contain
 * multiple words, so splitting on spaces can give incorrect results.
 */

/*
 * Safely trim a display value.
 * Missing or unexpected values become an empty string.
 */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/*
 * Return the account's display name.
 *
 * Priority:
 * 1. firstName + lastName
 * 2. Legacy name, while we update existing demo accounts
 * 3. Email
 * 4. Caller-provided fallback
 *
 * The legacy fallback allows us to migrate files one at a time.
 * It does not add a name field to outgoing API requests.
 *
 * Examples:
 *
 * getUserDisplayName({
 *   firstName: "John",
 *   lastName: "Smith",
 * });
 * // "John Smith"
 *
 * getUserDisplayName(null);
 * // "User"
 *
 * getUserDisplayName(null, "Staff member");
 * // "Staff member"
 */
export function getUserDisplayName(user, fallback = "User") {
  const firstName = cleanText(user?.firstName);
  const lastName = cleanText(user?.lastName);

  const fullName = [firstName, lastName]
    .filter(Boolean)
    .join(" ");

  if (fullName) {
    return fullName;
  }

  const legacyName = cleanText(user?.name);

  if (legacyName) {
    return legacyName;
  }

  const email = cleanText(user?.email);

  if (email) {
    return email;
  }

  return cleanText(fallback) || "User";
}