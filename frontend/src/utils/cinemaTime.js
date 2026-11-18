/*
 * FILE: frontend/src/utils/cinemaTime.js
 *
 * Provides date and time utilities for Rio Theaters.
 *
 * Both Oulu and Tampere cinemas use the Europe/Helsinki time zone.
 *
 * These functions make sure that screening dates and times
 * are displayed consistently, regardless of where the
 * customer is accessing the website.
 *
 * For example, a customer in India should see the same
 * Finnish screening time as a customer in Finland.
 *
 * This file provides functions to:
 * - Get the current date in Finland.
 * - Display screening times in Finnish local time.
 * - Format dates into a readable format.
 * - Convert demo screening dates and times into timestamps.
 *
 * Uses JavaScript's built-in Intl API.
 * No additional libraries are required.
 */


/*
 * CINEMA TIME ZONE
 *
 * Defines the time zone used by all Rio Theaters cinemas.
 *
 * Europe/Helsinki automatically handles Finland's
 * winter and summer time changes.
 *
 * A fixed offset such as +02:00 would not work
 * throughout the entire year.
 */
export const CINEMA_TIME_ZONE = "Europe/Helsinki";


/*
 * DATE AND TIME FORMATTERS
 *
 * Intl.DateTimeFormat formats dates and times
 * according to a selected language and time zone.
 *
 * These formatters are created once and reused
 * throughout the application.
 *
 * This avoids creating new formatter objects
 * every time a component displays a screening.
 */


/*
 * DATE PARTS FORMATTER
 *
 * Extracts the year, month, and day
 * according to Finland's time zone.
 *
 * en-CA uses Canadian English formatting.
 *
 * Month and day use two digits.
 *
 * Used by cinemaDate().
 */
const datePartsFormatter = new Intl.DateTimeFormat(
  "en-CA",
  {
    timeZone: CINEMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  },
);


/*
 * TIME FORMATTER
 *
 * Formats screening times using a 24-hour clock.
 *
 * en-GB uses British English formatting.
 *
 * hourCycle: "h23" ensures the hour range is 00–23.
 *
 * Example output: "19:00"
 *
 * Used by cinemaTime().
 */
const timeFormatter = new Intl.DateTimeFormat(
  "en-GB",
  {
    timeZone: CINEMA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
);


/*
 * READABLE DATE FORMATTER
 *
 * Creates dates that are easier for customers to read.
 *
 * Includes:
 * - Short weekday name.
 * - Day of the month.
 * - Short month name.
 * - Year.
 *
 * Example: "Fri, 20 Nov 2026"
 *
 * Used by formatCinemaDate().
 */
const readableDateFormatter = new Intl.DateTimeFormat(
  "en-GB",
  {
    timeZone: CINEMA_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  },
);


/*
 * PARSE TIMESTAMP
 *
 * Converts a supported date or timestamp value
 * into a valid JavaScript Date object.
 *
 * Accepted inputs:
 * - A JavaScript Date object.
 * - A numeric timestamp, such as Date.now().
 * - An ISO date-time string with a time zone.
 *
 * Examples:
 * "2026-11-20T17:00:00Z"
 * "2026-11-20T19:00:00+02:00"
 *
 * The Z indicates UTC time.
 * +02:00 indicates an explicit time zone offset.
 *
 * Strings without time zone information are rejected
 * because browsers might interpret them differently.
 *
 * This is a private helper used by other functions
 * in this file.
 */
function parseInstant(value) {
  /*
   * CHECK INPUT TYPE
   *
   * Accepts only Date objects, numbers, or strings.
   *
   * instanceof checks whether value is a Date object.
   * typeof checks the JavaScript data type.
   */
  const supportedType =
    value instanceof Date ||
    typeof value === "number" ||
    typeof value === "string";

  if (!supportedType) {
    throw new TypeError(
      "Expected a timestamp, Date, or ISO date-time string.",
    );
  }

  /*
   * VALIDATE DATE-TIME STRING
   *
   * A valid string must:
   * - Include "T" between the date and time.
   * - End with Z or an explicit time zone offset.
   *
   * The regular expression checks the time zone ending.
   *
   * This prevents JavaScript from using the visitor's
   * browser time zone for a date-time string.
   */
  if (
    typeof value === "string" &&
    (
      !value.includes("T") ||
      !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    )
  ) {
    throw new TypeError(
      "Date-time strings must include Z or an explicit timezone offset.",
    );
  }

  // Converts the accepted input into a JavaScript Date object.
  const date = new Date(value);

  /*
   * CHECK VALID DATE
   *
   * getTime() returns the timestamp in milliseconds.
   *
   * Invalid dates produce NaN.
   * Number.isFinite() checks that the timestamp is valid.
   */
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Invalid date-time value.");
  }

  return date;
}


/*
 * GET CINEMA DATE
 *
 * Converts a timestamp into the calendar date
 * used by Rio Theaters in Finland.
 *
 * Returns a string in YYYY-MM-DD format.
 *
 * Example:
 * cinemaDate("2026-11-09T23:30:00Z")
 * Returns: "2026-11-10"
 *
 * Finland is already on the next calendar day
 * at that UTC timestamp.
 *
 * If no argument is provided, Date.now()
 * supplies the current timestamp.
 *
 * Used by date selectors and screening filters.
 */
export function cinemaDate(instant = Date.now()) {
  // Validates and converts the input into a Date object.
  const date = parseInstant(instant);

  /*
   * EXTRACT DATE PARTS
   *
   * formatToParts() separates the formatted date
   * into values such as year, month, and day.
   *
   * map() converts each part into a [type, value] pair.
   *
   * Object.fromEntries() turns those pairs into an object.
   *
   * Example:
   * {
   *   year: "2026",
   *   month: "11",
   *   day: "20"
   * }
   *
   * This avoids depending on the order in which
   * a browser displays a formatted date.
   */
  const parts = Object.fromEntries(
    datePartsFormatter
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );

  // Combines the parts into YYYY-MM-DD format.
  return `${parts.year}-${parts.month}-${parts.day}`;
}


/*
 * GET CINEMA TIME
 *
 * Converts a timestamp into the local time
 * used by Rio Theaters cinemas in Finland.
 *
 * Returns a 24-hour time string in HH:MM format.
 *
 * Example:
 * cinemaTime("2026-11-20T17:00:00Z")
 * Returns: "19:00"
 *
 * Used when displaying screening times
 * on movie details and booking pages.
 */
export function cinemaTime(instant) {
  return timeFormatter.format(parseInstant(instant));
}


/*
 * FORMAT READABLE CINEMA DATE
 *
 * Converts a timestamp into a customer-friendly date.
 *
 * Example:
 * formatCinemaDate("2026-11-20T17:00:00Z")
 * Returns something like: "Fri, 20 Nov 2026"
 *
 * The exact punctuation may vary slightly
 * depending on the browser's Intl implementation.
 *
 * Used by checkout, booking history,
 * and staff or owner views.
 *
 * For API date filters, use cinemaDate() instead.
 */
export function formatCinemaDate(instant) {
  return readableDateFormatter.format(
    parseInstant(instant),
  );
}


/*
 * CONVERT DEMO SCREENING TIME
 *
 * Converts separate demo screening date and time values
 * into a complete ISO timestamp.
 *
 * The original demo store uses separate values:
 *
 * date: "2026-11-20"
 * time: "19:00"
 *
 * The API uses a single timestamp:
 *
 * startsAt: "2026-11-20T17:00:00Z"
 *
 * This function converts between those formats
 * while keeping the screening time in Finland.
 *
 * It does not depend on the visitor's browser time zone.
 *
 * IMPORTANT:
 * This helper is intended for the demo system.
 * It is not a complete production scheduling solution.
 *
 * During daylight-saving changes, some local times
 * do not exist or can occur twice.
 *
 * The function rejects those cases instead of
 * choosing an incorrect screening time.
 */
export function demoScreeningInstant(date, time) {
  /*
   * VALIDATE INPUT FORMAT
   *
   * date must be a string in YYYY-MM-DD format.
   * time must be a string in HH:MM format.
   *
   * Regular expressions check both formats.
   *
   * Invalid input produces a TypeError.
   */
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    typeof time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ) {
    throw new TypeError(
      "Expected a demo date YYYY-MM-DD and time HH:mm.",
    );
  }

  /*
   * CREATE TEMPORARY TIMESTAMP
   *
   * Combines the date and time into an ISO string
   * and temporarily treats it as UTC.
   *
   * Example:
   * "2026-11-20T19:00:00Z"
   *
   * Date.parse() converts this into milliseconds.
   *
   * This is only a reference value.
   * The actual Helsinki timestamp is calculated later.
   */
  const wallTime = Date.parse(`${date}T${time}:00Z`);

  /*
   * VALIDATE CALENDAR DATE
   *
   * JavaScript can automatically adjust invalid dates.
   *
   * For example, February 30 might be converted
   * into a date in March.
   *
   * This check converts the timestamp back into a string
   * and compares it with the original input.
   *
   * If they do not match, the date is rejected.
   */
  if (
    !Number.isFinite(wallTime) ||
    new Date(wallTime).toISOString().slice(0, 16) !==
      `${date}T${time}`
  ) {
    throw new RangeError(
      "The demo screening date is not a valid calendar date.",
    );
  }

  /*
   * FIND CORRECT HELSINKI TIMESTAMP
   *
   * Finland uses two UTC offsets:
   * - UTC+02:00 during winter.
   * - UTC+03:00 during summer.
   *
   * The array [120, 180] represents those offsets
   * in minutes.
   *
   * map() creates a possible timestamp for each offset.
   *
   * filter() keeps only timestamps that display
   * the requested date and time in Helsinki.
   *
   * Using cinemaDate() and cinemaTime() ensures
   * that daylight-saving rules are respected.
   *
   * This conversion is intended for modern demo dates,
   * not historical time zone calculations.
   */
  const matchingInstants = [120, 180]
    .map((offsetMinutes) => {
      return wallTime - offsetMinutes * 60 * 1000;
    })
    .filter((candidate) => {
      return (
        cinemaDate(candidate) === date &&
        cinemaTime(candidate) === time
      );
    });

  /*
   * HANDLE NONEXISTENT TIMES
   *
   * When Finland changes to summer time,
   * certain local times are skipped.
   *
   * If neither candidate matches, the requested
   * local time does not exist.
   */
  if (matchingInstants.length === 0) {
    throw new RangeError(
      "This demo time does not exist in Europe/Helsinki.",
    );
  }

  /*
   * HANDLE AMBIGUOUS TIMES
   *
   * When Finland changes back to winter time,
   * certain local times occur twice.
   *
   * If both candidates match, the function
   * cannot determine which instant was intended.
   *
   * The demo system rejects these times.
   */
  if (matchingInstants.length > 1) {
    throw new RangeError(
      "This demo time is ambiguous in Europe/Helsinki.",
    );
  }

  /*
   * RETURN ISO TIMESTAMP
   *
   * Converts the single valid timestamp into
   * an ISO 8601 string using UTC.
   *
   * Example:
   * "2026-11-20T17:00:00.000Z"
   *
   * The backend and other services can use
   * this value without depending on browser time zones.
   */
  return new Date(
    matchingInstants[0],
  ).toISOString();
}