/*
 * FILE: frontend/src/utils/screeningTime.js
 *
 * PURPOSE
 * -------
 * Converts owner screening-form input into API timestamps.
 *
 * INPUT EXAMPLE
 * -------------
 * Date: "2026-11-20"
 * Time: "19:00"
 *
 * OUTPUT
 * ------
 * "2026-11-20T17:00:00.000Z"
 *
 * WHY THIS IS SEPARATE
 * -------------------
 * cinemaTime.js primarily formats existing instants.
 *
 * This file interprets a LOCAL cinema date/time and finds the
 * corresponding UTC instant.
 *
 * DAYLIGHT-SAVING RULES
 * --------------------
 * Some local times:
 * - Do not exist when clocks move forward.
 * - Occur twice when clocks move backward.
 *
 * Never silently choose an ambiguous time.
 * Return the available offsets so the form can ask for a choice.
 */

import {
  CINEMA_TIME_ZONE,
  cinemaDate,
  cinemaTime,
} from "./cinemaTime.js";


/*
 * FORM VALIDATION ERROR
 *
 * code:
 * Lets the owner form distinguish invalid input, nonexistent
 * times, and ambiguous times.
 *
 * options:
 * Available UTC interpretations for an ambiguous local time.
 */
export class ScreeningTimeError extends Error {
  constructor(
    message,
    code,
    options = [],
  ) {
    super(message);

    this.name = "ScreeningTimeError";
    this.code = code;
    this.options = options;
  }
}


/*
 * READ HELSINKI DATE/TIME PARTS WITHOUT USING BROWSER LOCAL TIME
 */
const partsFormatter =
  new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: CINEMA_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
  );

function localParts(timestamp) {
  return Object.fromEntries(
    partsFormatter
      .formatToParts(
        new Date(timestamp),
      )
      .map(({ type, value }) => [
        type,
        value,
      ]),
  );
}


/*
 * VALIDATE THE FORM'S DATE/TIME
 *
 * This project schedules modern screenings, so supported input
 * years are 1970–9999.
 *
 * UTC is used here only to build a numeric wall-clock reference.
 * This reference is NOT yet the final screening instant.
 */
function wallClockTimestamp(date, time) {
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    typeof time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ) {
    throw new ScreeningTimeError(
      "Enter a date and a time in HH:mm format.",
      "INVALID_DATE_TIME",
    );
  }

  const [
    year,
    month,
    day,
  ] = date.split("-").map(Number);

  const [
    hour,
    minute,
  ] = time.split(":").map(Number);

  if (
    year < 1970 ||
    year > 9999
  ) {
    throw new ScreeningTimeError(
      "Use a year between 1970 and 9999.",
      "INVALID_DATE_TIME",
    );
  }

  const timestamp = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
  );

  const parsed = new Date(timestamp);

  /*
   * Reject calendar normalisation.
   * February 30 must not silently become a March date.
   */
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute
  ) {
    throw new ScreeningTimeError(
      "Enter a valid calendar date and time.",
      "INVALID_DATE_TIME",
    );
  }

  return timestamp;
}


/*
 * FIND THE RUNTIME'S HELSINKI OFFSET AT AN INSTANT
 *
 * Derive it from Intl timezone rules instead of deciding
 * summer/winter from the month ourselves.
 *
 * Input timestamps used here have whole-minute precision.
 */
function offsetAt(timestamp) {
  const parts =
    localParts(timestamp);

  const displayedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );

  return (
    displayedAsUtc - timestamp
  ) / 60_000;
}


/*
 * HUMAN-READABLE OFFSET
 *
 * Examples:
 * 120 -> "UTC+02:00"
 * 180 -> "UTC+03:00"
 */
function offsetLabel(minutes) {
  const sign =
    minutes >= 0 ? "+" : "-";

  const absolute =
    Math.abs(minutes);

  const hours = String(
    Math.floor(absolute / 60),
  ).padStart(2, "0");

  const remainingMinutes = String(
    absolute % 60,
  ).padStart(2, "0");

  return (
    `UTC${sign}${hours}:${remainingMinutes}`
  );
}


/*
 * FIND ALL VALID INTERPRETATIONS OF LOCAL INPUT
 *
 * Returns:
 *
 * Normal time:
 * One option.
 *
 * Nonexistent spring-forward time:
 * Empty array.
 *
 * Repeated autumn time:
 * Two options.
 *
 * Each option:
 * {
 *   startsAt: UTC ISO string,
 *   utcOffsetMinutes: number,
 *   utcOffsetLabel: string
 * }
 */
export function getHelsinkiTimeOptions(
  date,
  time,
) {
  const wallTimestamp =
    wallClockTimestamp(date, time);

  const offsets = new Set();

  /*
   * Probe around the requested day so both offsets surrounding
   * a daylight-saving transition can be considered.
   *
   * Every candidate is then checked against the actual local
   * date/time; a sampled offset alone is not accepted as proof.
   */
  for (
    let hours = -36;
    hours <= 36;
    hours += 6
  ) {
    const probe =
      wallTimestamp +
      hours * 60 * 60 * 1000;

    offsets.add(
      offsetAt(probe),
    );
  }

  return [...offsets]
    .map((utcOffsetMinutes) => {
      const timestamp =
        wallTimestamp -
        utcOffsetMinutes * 60_000;

      return {
        timestamp,
        utcOffsetMinutes,
      };
    })
    .filter(({ timestamp }) => {
      const parts =
        localParts(timestamp);

      const candidateDate =
        `${parts.year}-${parts.month}-${parts.day}`;

      const candidateTime =
        `${parts.hour}:${parts.minute}`;

      return (
        candidateDate === date &&
        candidateTime === time
      );
    })
    .sort((a, b) => {
      return a.timestamp - b.timestamp;
    })
    .map((option) => ({
      startsAt: new Date(
        option.timestamp,
      ).toISOString(),

      utcOffsetMinutes:
        option.utcOffsetMinutes,

      utcOffsetLabel:
        offsetLabel(
          option.utcOffsetMinutes,
        ),
    }));
}


/*
 * CONVERT OWNER INPUT TO UTC
 *
 * selectedOffsetMinutes:
 * Usually omitted for ordinary times.
 *
 * For an ambiguous time, the form must supply the selected
 * numeric offset from getHelsinkiTimeOptions().
 *
 * Do not pass a string directly from <select>.
 * Convert a selected value with Number() in the form handler.
 */
export function helsinkiInputToUtc(
  date,
  time,
  selectedOffsetMinutes,
) {
  const options =
    getHelsinkiTimeOptions(date, time);

  if (options.length === 0) {
    throw new ScreeningTimeError(
      "This local time does not exist because the clocks move forward. Choose another time.",
      "NONEXISTENT_LOCAL_TIME",
    );
  }

  if (
    selectedOffsetMinutes !== undefined
  ) {
    if (
      !Number.isInteger(
        selectedOffsetMinutes,
      )
    ) {
      throw new ScreeningTimeError(
        "Choose a valid UTC offset.",
        "INVALID_UTC_OFFSET",
        options,
      );
    }

    const selected = options.find(
      (option) => {
        return (
          option.utcOffsetMinutes ===
          selectedOffsetMinutes
        );
      },
    );

    if (!selected) {
      throw new ScreeningTimeError(
        "The selected offset does not match this local time.",
        "INVALID_UTC_OFFSET",
        options,
      );
    }

    return selected.startsAt;
  }

  if (options.length > 1) {
    throw new ScreeningTimeError(
      "This local time occurs twice because the clocks move backward. Choose which occurrence to schedule.",
      "AMBIGUOUS_LOCAL_TIME",
      options,
    );
  }

  return options[0].startsAt;
}


/*
 * LOAD AN EXISTING INSTANT INTO THE OWNER FORM
 *
 * Returns:
 * {
 *   date,
 *   time,
 *   utcOffsetMinutes
 * }
 *
 * The offset preserves the intended occurrence of an ambiguous
 * local time when editing an API screening.
 *
 * Reject sub-minute times rather than silently truncating them.
 */
export function utcToHelsinkiInput(
  startsAt,
) {
  if (typeof startsAt !== "string") {
    throw new ScreeningTimeError(
      "The screening timestamp is invalid.",
      "INVALID_DATE_TIME",
    );
  }

  let date;
  let time;
  let timestamp;

  try {
    date = cinemaDate(startsAt);
    time = cinemaTime(startsAt);
    timestamp = Date.parse(startsAt);
  } catch {
    throw new ScreeningTimeError(
      "The screening timestamp must include a valid timezone.",
      "INVALID_DATE_TIME",
    );
  }

  if (
    !Number.isFinite(timestamp) ||
    timestamp % 60_000 !== 0
  ) {
    throw new ScreeningTimeError(
      "The screening form supports whole-minute times.",
      "INVALID_DATE_TIME",
    );
  }

  wallClockTimestamp(date, time);

  return {
    date,
    time,

    utcOffsetMinutes:
      offsetAt(timestamp),
  };
}