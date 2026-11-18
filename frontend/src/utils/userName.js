/*
 * FILE: frontend/src/utils/userName.js
 *
 * Provides a helper function for displaying user names
 * throughout the Rio Theaters application.
 *
 * Used by:
 * - Customer login and registration pages.
 * - Staff login pages.
 * - Customer and staff dashboards.
 * - Cashier account lists.
 *
 * The API stores firstName and lastName separately.
 *
 * Example account:
 * {
 *   firstName: "John",
 *   lastName: "Smith",
 *   email: "john@example.com"
 * }
 *
 * This file combines the names for display purposes only.
 *
 * IMPORTANT:
 * Registration and account creation must still collect
 * and send firstName and lastName as separate values.
 *
 * Names should not be automatically split using spaces
 * because some names contain multiple words.
 */


/*
 * CLEAN TEXT
 *
 * Removes unnecessary spaces from the beginning
 * and end of a string using trim().
 *
 * If the value is missing or is not a string,
 * an empty string is returned instead.
 *
 * Examples:
 * cleanText("  John  ") returns "John".
 * cleanText(null) returns "".
 * cleanText(123) returns "".
 *
 * This prevents unexpected values from appearing
 * in the user's display name.
 */
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}


/*
 * GET USER DISPLAY NAME
 *
 * Creates a readable name for a user account.
 *
 * Parameters:
 * user: Object containing the user's account information.
 * fallback: Text displayed when no name or email is available.
 *
 * The default fallback is "User".
 *
 * DISPLAY PRIORITY:
 * 1. First name and last name.
 * 2. Older demo account's name field.
 * 3. Email address.
 * 4. Provided fallback text.
 *
 * The legacy name field supports older demo accounts
 * while the application is being updated.
 *
 * This function only returns display text.
 * It does not change the account or send data to the API.
 *
 * Examples:
 *
 * getUserDisplayName({
 *   firstName: "John",
 *   lastName: "Smith",
 * });
 * Returns: "John Smith"
 *
 * getUserDisplayName(null);
 * Returns: "User"
 *
 * getUserDisplayName(null, "Staff member");
 * Returns: "Staff member"
 */
export function getUserDisplayName(user, fallback = "User") {
  /*
   * GET FIRST AND LAST NAME
   *
   * Optional chaining (?.) safely accesses account properties
   * even when the user object is null or undefined.
   *
   * cleanText() removes extra surrounding spaces
   * and handles missing or invalid values.
   */
  const firstName = cleanText(user?.firstName);
  const lastName = cleanText(user?.lastName);

  /*
   * BUILD FULL NAME
   *
   * Creates an array containing the first and last names.
   *
   * filter(Boolean) removes empty strings.
   *
   * join(" ") combines the remaining names
   * with a space between them.
   *
   * Examples:
   * ["John", "Smith"] becomes "John Smith".
   * ["John", ""] becomes "John".
   * ["", "Smith"] becomes "Smith".
   */
  const fullName = [firstName, lastName]
    .filter(Boolean)
    .join(" ");

  // Uses the full name when at least one name is available.
  if (fullName) {
    return fullName;
  }

  /*
   * CHECK LEGACY NAME
   *
   * Older demo accounts may store the user's full name
   * in a single property called name.
   *
   * This fallback keeps those accounts working
   * while the application moves to separate name fields.
   */
  const legacyName = cleanText(user?.name);

  if (legacyName) {
    return legacyName;
  }

  /*
   * CHECK EMAIL ADDRESS
   *
   * If no first name, last name, or legacy name exists,
   * the email address is used as the display name.
   */
  const email = cleanText(user?.email);

  if (email) {
    return email;
  }

  /*
   * RETURN FALLBACK
   *
   * Uses the caller's fallback text if it is valid.
   *
   * If the fallback is empty or invalid,
   * "User" is returned as the final default.
   */
  return cleanText(fallback) || "User";
}