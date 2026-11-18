/*
 * FILE: frontend/src/services/staffScreenings.js
 *
 * PURPOSE
 * Supplies theater options, screenings and seat maps to the
 * owner/cashier reservation interfaces.
 *
 * DEMO MODE
 * Uses the existing shared cinema and staff stores.
 *
 * API MODE: CASHIER
 * GET /cashier/theaters
 * GET /cashier/screenings
 *
 * These endpoints return unpaginated arrays.
 * Pagination and picker filters are applied locally.
 *
 * API MODE: OWNER
 * Uses existing public catalogue reads.
 * No separate owner screening endpoint is assumed.
 *
 * FIELD MAPPING
 * Backend theaterId -> frontend cinemaId.
 * Backend startTime -> frontend startsAt.
 * Backend endTime   -> frontend endsAt.
 * Numeric IDs       -> string IDs.
 * Euro ticketPrice  -> integer ticketPriceCents.
 *
 * SECURITY
 * Frontend checks keep the interface consistent.
 * Backend reservation endpoints must independently enforce
 * the cashier's current assignment on every request.
 *
 * This service only reads data. It does not create holds,
 * process payments or create/edit/cancel reservations.
 */

import {
  apiClient,
  catalogue,
} from "./catalogue.js";

import { collectPages } from "./apiCatalogue.js";
import { booking as demoBookingReader } from "./booking.js";

import {
  staffMode,
  staffEnabled,
} from "./staff.js";

import { demoCinemaStore } from "./demoCinemaStore.js";

import {
  demoStaffStore,
  requireDemoStaff,
  canDemoStaffAccessTheater,
} from "./demoStaffStore.js";

import { ApiError } from "./apiClient.js";
import { cinemaDate } from "../utils/cinemaTime.js";

const EMPTY_SNAPSHOT = Object.freeze({});

let previousCinemaSnapshot = null;
let previousStaffSnapshot = null;
let combinedSnapshot = null;

function invalidResponse(message) {
  throw new ApiError(message, {
    code: "INVALID_RESPONSE",
  });
}

function checkReadAccess(signal) {
  signal?.throwIfAborted();

  if (!staffEnabled) {
    throw new ApiError(
      "Staff operations are unavailable for this catalogue.",
      {
        code: "STAFF_MODE_MISMATCH",
      },
    );
  }

  if (staffMode === "demo") {
    requireDemoStaff();
  }
}

/*
 * Stable demo snapshot.
 *
 * Changes to screenings, reservations or cashier assignments
 * can trigger an update in subscribed React components.
 */
function getSnapshot() {
  if (staffMode !== "demo") {
    return EMPTY_SNAPSHOT;
  }

  const cinema = demoCinemaStore.getSnapshot();
  const staff = demoStaffStore.getSnapshot();

  if (
    combinedSnapshot === null ||
    cinema !== previousCinemaSnapshot ||
    staff !== previousStaffSnapshot
  ) {
    previousCinemaSnapshot = cinema;
    previousStaffSnapshot = staff;
    combinedSnapshot = { cinema, staff };
  }

  return combinedSnapshot;
}

function subscribe(listener) {
  if (staffMode !== "demo") {
    return () => {};
  }

  const stopCinema = demoCinemaStore.subscribe(listener);
  const stopStaff = demoStaffStore.subscribe(listener);

  return () => {
    stopCinema();
    stopStaff();
  };
}

/*
 * Local pagination keeps the existing collectPages() callers working.
 * It does not imply that Marina's endpoints support pagination.
 */
function validatePagination(page, pageSize) {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    throw new ApiError("Enter valid pagination values.", {
      status: 422,
      code: "VALIDATION_ERROR",
    });
  }
}

function paginate(records, page, pageSize) {
  validatePagination(page, pageSize);

  const start = (page - 1) * pageSize;

  return {
    data: records.slice(start, start + pageSize),
    meta: {
      page,
      pageSize,
      totalItems: records.length,
      totalPages: Math.ceil(records.length / pageSize),
    },
  };
}

function forbiddenTheater() {
  return new ApiError(
    "Your account cannot access this theater.",
    {
      status: 403,
      code: "FORBIDDEN",
    },
  );
}

/*
 * React selectors and comparisons use string IDs.
 */
function normalizeId(value) {
  if (
    typeof value === "string" &&
    value.trim() !== ""
  ) {
    return value;
  }

  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  ) {
    return String(value);
  }

  invalidResponse(
    "The server returned an invalid record ID.",
  );
}

function normalizeTheaters(records) {
  if (!Array.isArray(records)) {
    invalidResponse("Invalid theater list.");
  }

  const result = records.map((theater) => {
    if (
      !theater ||
      typeof theater.name !== "string" ||
      !theater.name.trim() ||
      typeof theater.city !== "string" ||
      !theater.city.trim()
    ) {
      invalidResponse(
        "The server returned invalid theater information.",
      );
    }

    return {
      ...theater,
      id: normalizeId(theater.id),
    };
  });

  if (
    new Set(result.map((item) => item.id)).size !==
    result.length
  ) {
    invalidResponse(
      "The server returned duplicate theaters.",
    );
  }

  return result;
}

/*
 * Read the authenticated role from the actual session.
 * Do not infer permissions from public movie/screening data.
 */
async function apiRole(signal) {
  const response = await apiClient.request(
    "/auth/session",
    { signal },
  );

  const user = response?.data?.user;

  if (!user) {
    throw new ApiError(
      "Sign in with a staff account.",
      {
        status: 401,
        code: "AUTH_REQUIRED",
      },
    );
  }

  // Support the database's admin name and the frontend's owner name.
  const role =
    user.role === "admin" ? "owner" : user.role;

  if (
    user.active === false ||
    !["owner", "cashier"].includes(role)
  ) {
    throw forbiddenTheater();
  }

  return role;
}

/*
 * Load current theater access.
 *
 * Cashier API: zero or one theater from the protected endpoint.
 * Owner API: all locations from the public catalogue.
 * Demo: filter catalogue locations using the latest staff account.
 *
 * Assignments are not permanently cached.
 */
async function permittedTheaters(signal, role) {
  checkReadAccess(signal);

  let records;

  if (
    staffMode === "api" &&
    (role ?? await apiRole(signal)) === "cashier"
  ) {
    const response = await apiClient.request(
      "/cashier/theaters",
      { signal },
    );

    records = normalizeTheaters(response?.data);

    if (records.length > 1) {
      invalidResponse(
        "A cashier cannot have multiple assigned theaters.",
      );
    }
  } else {
    records = normalizeTheaters(
      await collectPages(
        (query, options) =>
          catalogue.listCinemas(query, options),
        { signal },
      ),
    );
  }

  checkReadAccess(signal);

  const allowed =
    staffMode === "demo"
      ? records.filter((theater) =>
          canDemoStaffAccessTheater(theater.id),
        )
      : records;

  return allowed.sort(
    (a, b) =>
      a.city.localeCompare(b.city) ||
      a.id.localeCompare(b.id),
  );
}

async function requireTheater(theaterId, signal) {
  const theaters = await permittedTheaters(signal);

  if (
    !theaters.some(
      (theater) => theater.id === theaterId,
    )
  ) {
    throw forbiddenTheater();
  }
}

/*
 * Convert euro prices into integer cents.
 *
 * Example: "12.50" -> 1250.
 * Split the decimal string to avoid floating-point multiplication
 * of the complete euro amount.
 */
function euroPriceCents(value) {
  const text =
    typeof value === "number" ? String(value) : value;

  if (
    typeof text !== "string" ||
    !/^\d+(\.\d{1,2})?$/.test(text)
  ) {
    invalidResponse(
      "The server returned an invalid ticket price.",
    );
  }

  const [euros, fraction = ""] = text.split(".");

  const cents =
    Number(euros) * 100 +
    Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(cents)) {
    invalidResponse("Invalid ticket price.");
  }

  return cents;
}

/*
 * Adapt Marina's screening resource to the existing reservation UI.
 *
 * The original backend fields are retained.
 * Additional mapped fields avoid rewriting every consuming component.
 */
function cashierScreeningRecord(record, theaters) {
  if (
    !record ||
    typeof record.movieTitle !== "string" ||
    !record.movieTitle.trim() ||
    typeof record.roomName !== "string" ||
    !record.roomName.trim() ||
    !Number.isFinite(Date.parse(record.startTime)) ||
    !Number.isFinite(Date.parse(record.endTime)) ||
    Date.parse(record.endTime) <= Date.parse(record.startTime)
  ) {
    invalidResponse(
      "The server returned invalid screening information.",
    );
  }

  const theaterId = normalizeId(record.theaterId);

  const theater = theaters.find(
    (item) => item.id === theaterId,
  );

  if (!theater) {
    throw forbiddenTheater();
  }

  if (
    record.status != null &&
    !["scheduled", "cancelled"].includes(record.status)
  ) {
    invalidResponse(
      "The server returned an unsupported screening status.",
    );
  }

  return {
    ...record,

    id: normalizeId(record.id),
    movieId: normalizeId(record.movieId),
    theaterId,
    cinemaId: theaterId,

    cinemaName: theater.name
      .toLowerCase()
      .includes(theater.city.toLowerCase())
      ? theater.name
      : `${theater.name} ${theater.city}`,

    city: theater.city,
    roomId: normalizeId(record.roomId),

    startsAt: new Date(record.startTime).toISOString(),
    endsAt: new Date(record.endTime).toISOString(),

    /*
     * Marina's example omits status.
     * Its protected endpoint is described as listing upcoming
     * usable screenings, so the adapter treats those as scheduled.
     * Preserve an explicit supported status if supplied.
     */
    status: record.status ?? "scheduled",

    ticketPriceCents: euroPriceCents(record.ticketPrice),
  };
}

/*
 * The backend determines cashier access.
 * No browser-supplied theaterId is sent to override that access.
 */
async function cashierScreenings(theaters, signal) {
  if (theaters.length === 0) {
    return [];
  }

  const response = await apiClient.request(
    "/cashier/screenings",
    { signal },
  );

  if (!Array.isArray(response?.data)) {
    invalidResponse("Invalid screening list.");
  }

  const records = response.data.map((record) =>
    cashierScreeningRecord(record, theaters),
  );

  if (
    new Set(records.map((item) => item.id)).size !==
    records.length
  ) {
    invalidResponse(
      "The server returned duplicate screenings.",
    );
  }

  checkReadAccess(signal);

  return records;
}

function sortScreenings(records) {
  return records.sort(
    (a, b) =>
      a.startsAt.localeCompare(b.startsAt) ||
      a.id.localeCompare(b.id),
  );
}

async function listTheaters(
  { page = 1, pageSize = 20 } = {},
  { signal } = {},
) {
  validatePagination(page, pageSize);

  return paginate(
    await permittedTheaters(signal),
    page,
    pageSize,
  );
}

/*
 * SCREENING PICKER
 *
 * Cashier API responses are filtered and paginated locally.
 * Date comparisons use the screening's Helsinki calendar date.
 *
 * Demo and owner catalogue reads retain their existing source.
 */
async function listScreenings(
  {
    movieId,
    cinemaId,
    roomId,
    date,
    page = 1,
    pageSize = 20,
  } = {},
  { signal } = {},
) {
  checkReadAccess(signal);
  validatePagination(page, pageSize);

  const role =
    staffMode === "api"
      ? await apiRole(signal)
      : null;

  const theaters = await permittedTheaters(signal, role);

  const allowedIds = new Set(
    theaters.map((item) => item.id),
  );

  if (cinemaId && !allowedIds.has(cinemaId)) {
    throw forbiddenTheater();
  }

  if (role === "cashier") {
    const records = (
      await cashierScreenings(theaters, signal)
    ).filter(
      (screening) =>
        (!movieId || screening.movieId === movieId) &&
        (!cinemaId || screening.cinemaId === cinemaId) &&
        (!roomId || screening.roomId === roomId) &&
        (!date || cinemaDate(screening.startsAt) === date),
    );

    return paginate(
      sortScreenings(records),
      page,
      pageSize,
    );
  }

  /*
   * Owner API and demo reads use the existing catalogue.
   * Reading public data does not authorize reservation mutations.
   */
  const groups = await Promise.all(
    theaters
      .filter(
        (theater) =>
          !cinemaId || theater.id === cinemaId,
      )
      .map((theater) =>
        collectPages(
          (query, options) =>
            catalogue.listScreenings(
              {
                ...query,
                movieId,
                cinemaId: theater.id,
                roomId,
                date,
              },
              options,
            ),
          { signal },
        ),
      ),
  );

  checkReadAccess(signal);

  const records = groups.flat().filter(
    (screening) =>
      allowedIds.has(screening.cinemaId) &&
      (
        staffMode !== "demo" ||
        canDemoStaffAccessTheater(screening.cinemaId)
      ),
  );

  return paginate(
    sortScreenings(records),
    page,
    pageSize,
  );
}

/*
 * SCREENING DETAIL
 *
 * A separate protected cashier detail endpoint is not confirmed.
 * Find the requested screening in the protected cashier list.
 *
 * An unavailable screening returns 404 instead of falling back
 * to an unrestricted public detail request for a cashier.
 */
async function getScreening(
  screeningId,
  { signal } = {},
) {
  checkReadAccess(signal);

  if (staffMode === "api") {
    const role = await apiRole(signal);

    if (role === "cashier") {
      const theaters = await permittedTheaters(
        signal,
        role,
      );

      const records = await cashierScreenings(
        theaters,
        signal,
      );

      const screening = records.find(
        (item) => item.id === screeningId,
      );

      if (!screening) {
        throw new ApiError(
          "Screening unavailable for this cashier.",
          {
            status: 404,
            code: "NOT_FOUND",
          },
        );
      }

      return { data: screening };
    }
  }

  const response =
    staffMode === "api"
      ? await apiClient.request(
          `/screenings/${encodeURIComponent(screeningId)}`,
          { signal },
        )
      : await demoBookingReader.getScreening(
          screeningId,
          { signal },
        );

  if (
    response?.data?.id !== screeningId ||
    typeof response.data.cinemaId !== "string"
  ) {
    invalidResponse(
      "The server returned invalid screening information.",
    );
  }

  await requireTheater(
    response.data.cinemaId,
    signal,
  );

  return response;
}

export const staffScreenings = {
  subscribe,
  getSnapshot,

  listTheaters,

  /*
   * Compatibility alias for existing components.
   * Their cinemaId fields identify the same location records.
   */
  listCinemas: listTheaters,

  listScreenings,
  getScreening,

  /*
   * Read rooms only for a permitted theater.
   */
  async listRooms(
    cinemaId,
    query = {},
    { signal } = {},
  ) {
    checkReadAccess(signal);

    await requireTheater(cinemaId, signal);

    const response = await catalogue.listRooms(
      cinemaId,
      query,
      { signal },
    );

    // Recheck current access after the read completes.
    await requireTheater(cinemaId, signal);

    return response;
  },

  /*
   * Read the public seat map after checking screening access.
   *
   * Preserve its response rather than inventing seat statuses
   * or server timestamps. The existing hook validates its fields.
   */
  async getSeatMap(
    screeningId,
    { signal } = {},
  ) {
    const screening = await getScreening(
      screeningId,
      { signal },
    );

    const response =
      staffMode === "api"
        ? await apiClient.request(
            `/screenings/${encodeURIComponent(screeningId)}/seats`,
            { signal },
          )
        : await demoBookingReader.getSeatMap(
            screeningId,
            { signal },
          );

    await requireTheater(
      screening.data.cinemaId,
      signal,
    );

    return response;
  },
};