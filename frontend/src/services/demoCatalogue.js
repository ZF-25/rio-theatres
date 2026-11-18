/*
 * FILE: frontend/src/services/demoCatalogue.js
 *
 * Makes the existing demo data work like the real catalogue API.
 *
 * Converts movies, cinemas, rooms, and screenings into the
 * same format returned by the Express backend.
 *
 * Used by Home and Movie Details for movie searches,
 * cinema selection, screening times, and availability.
 *
 * Reads the existing shared cinema store so changes made
 * by staff are also reflected in customer pages.
 *
 * This file does not connect to Express, Neon, or TMDB.
 */

import { ApiError } from "./apiClient.js";

import {
  cinemaDate,
  demoScreeningInstant,
} from "../utils/cinemaTime.js";


/*
 * CREATE DEMO CATALOGUE
 *
 * Creates a service that provides catalogue information
 * using the existing frontend demo data.
 *
 * movies: Existing demo movie records.
 * cinemas: Cinema locations and contact information.
 * rooms: Existing room definitions.
 * store: Shared cinema store containing screenings and bookings.
 * now: Returns the current time; tests can provide a fixed time.
 *
 * The service uses the same methods and response formats
 * as the real API catalogue service.
 */
export function createDemoCatalogue({
  movies,
  cinemas,
  rooms,
  store,
  now = () => Date.now(),
}) {
  /*
   * CREATE GENRE ID
   *
   * Converts a genre name into a consistent demo ID.
   *
   * Example: "Sci-Fi" becomes "genre-sci-fi".
   *
   * toLowerCase() converts the name to lowercase.
   * replace() changes groups of special characters into hyphens.
   *
   * These IDs are only used in demo mode.
   */
  function genreId(name) {
    return `genre-${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}`;
  }


  /*
   * CREATE ROOM ID
   *
   * Combines the city and original room ID to make it unique.
   *
   * The demo may use "room-1" in multiple cinemas,
   * but the API requires each room to have a different ID.
   *
   * Example: "oulu-room-1".
   *
   * This does not change the original demo store.
   */
  function roomId(city, originalRoomId) {
    return `${city.toLowerCase()}-${originalRoomId}`;
  }


  /*
   * PREPARE CINEMA RECORDS
   *
   * Converts existing cinema information into the API format.
   *
   * map() creates a new object for each cinema.
   * Missing contact information receives a default value.
   *
   * openingHours replaces the demo's original hours property.
   * All cinemas use the Europe/Helsinki time zone.
   *
   * sort() orders cinemas alphabetically by city,
   * using their IDs when city names are equal.
   */
  const cinemaRecords = cinemas
    .map((cinema) => ({
      id: `cinema-${cinema.city.toLowerCase()}`,
      city: cinema.city,
      name: `Rio ${cinema.city}`,
      address: cinema.address ?? "",
      email: cinema.email ?? null,
      phone: cinema.phone ?? null,
      openingHours: [...(cinema.hours ?? [])],
      timeZone: "Europe/Helsinki",
    }))
    .sort((a, b) => {
      return (
        a.city.localeCompare(b.city) ||
        a.id.localeCompare(b.id)
      );
    });


  /*
   * PREPARE GENRE RECORDS
   *
   * Extracts genre names from the existing movies.
   *
   * Set removes duplicate genres.
   * sort() arranges them alphabetically.
   * map() converts each name into an object with an ID and name.
   *
   * These records are used in the Home genre filter.
   */
  const genreRecords = [
    ...new Set(movies.map((movie) => movie.genre)),
  ]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      id: genreId(name),
      name,
    }));


  /*
   * CHECK REQUEST CANCELLATION
   *
   * Checks whether an AbortSignal has been cancelled.
   *
   * Even though demo requests use local data, they support
   * cancellation so the same React hook works in both modes.
   *
   * throwIfAborted() stops the operation if it was cancelled.
   */
  function checkSignal(signal) {
    signal?.throwIfAborted();
  }


  /*
   * CREATE VALIDATION ERROR
   *
   * Returns an ApiError when a filter contains an invalid value.
   *
   * Uses HTTP status 422 and the VALIDATION_ERROR code
   * to match the real backend's error format.
   *
   * fieldErrors identifies the invalid field and its message.
   */
  function invalidFilter(field, message) {
    return new ApiError(
      "Please check the requested filters.",
      {
        status: 422,
        code: "VALIDATION_ERROR",
        fieldErrors: {
          [field]: message,
        },
      },
    );
  }


  /*
   * FIND CINEMA
   *
   * Searches the prepared cinema records for a matching ID.
   *
   * Returns the cinema object if found, or undefined otherwise.
   */
  function findCinema(id) {
    return cinemaRecords.find(
      (cinema) => cinema.id === id,
    );
  }


  /*
   * PAGINATE RESULTS
   *
   * Divides an array into smaller pages of results.
   *
   * page: Requested page number, defaulting to 1.
   * pageSize: Number of items per page, defaulting to 20.
   *
   * Both values must be valid positive integers.
   * The maximum allowed page size is 100.
   *
   * Returns the same { data, meta } format as the real API.
   */
  function paginate(items, query = {}) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    // Rejects invalid page numbers.
    if (!Number.isInteger(page) || page < 1) {
      throw invalidFilter(
        "page",
        "Page must be a positive integer.",
      );
    }

    // Rejects page sizes outside the allowed range.
    if (
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      throw invalidFilter(
        "pageSize",
        "Page size must be between 1 and 100.",
      );
    }

    /*
     * CALCULATE PAGE RESULTS
     *
     * Finds the starting position of the requested page.
     *
     * slice() selects only the items belonging to that page.
     * Math.ceil() calculates how many pages are needed.
     *
     * Empty results correctly produce totalPages: 0.
     */
    const start = (page - 1) * pageSize;

    return {
      data: items.slice(start, start + pageSize),

      meta: {
        page,
        pageSize,
        totalItems: items.length,
        totalPages: Math.ceil(
          items.length / pageSize,
        ),
      },
    };
  }


  /*
   * CONVERT MOVIE RECORD
   *
   * Converts a demo movie into the agreed API movie format.
   *
   * Examples:
   * duration becomes durationMinutes.
   * genre becomes an array of genre objects.
   * poster becomes posterUrl.
   *
   * TMDB-related fields are null because these are demo movies.
   */
  function toMovieRecord(movie) {
    /*
     * AGE RATING
     *
     * Converts the movie's age rating into a string.
     * Checks whether it represents a valid non-negative integer.
     *
     * If valid, an age rating object is created.
     * Otherwise, the age rating is set to null.
     */
    const label = movie.ageRating == null
      ? ""
      : String(movie.ageRating).trim();

    const numericAge = Number(label);

    const hasNumericRating =
      label !== "" &&
      Number.isInteger(numericAge) &&
      numericAge >= 0;

    return {
      id: movie.id,
      tmdbId: null,
      title: movie.title,
      description: movie.description ?? "",
      durationMinutes: movie.duration ?? null,

      genres: [
        {
          id: genreId(movie.genre),
          name: movie.genre,
        },
      ],

      posterUrl: movie.poster ?? null,
      backdropUrl: null,

      ageRating: hasNumericRating
        ? {
            country: "FI",
            label,
            minimumAge: numericAge,
            source: "manual",
          }
        : null,

      // No trailer information is available for demo movies.
      trailer: null,

      metadataUpdatedAt: null,
    };
  }


  /*
   * CONVERT SCREENING RECORD
   *
   * Converts a demo screening into the API screening format.
   *
   * Finds the screening's movie and cinema information.
   * Converts the date and time into UTC timestamps.
   * Creates a cinema-specific room ID.
   *
   * Available seats are read from the current shared store
   * so bookings, holds, and blocked seats are included.
   */
  function toScreeningRecord(screening) {
    // Finds the movie connected to this screening.
    const movie = movies.find(
      (item) => item.id === screening.movieId,
    );

    // Finds the cinema where the screening takes place.
    const cinema = cinemaRecords.find(
      (item) => item.city === screening.city,
    );

    /*
     * MISSING SCREENING DATA
     *
     * A screening must belong to an existing movie and cinema.
     * If either is missing, a structured error is thrown.
     */
    if (!movie || !cinema) {
      throw new ApiError(
        "A demo screening has missing movie or cinema information.",
        {
          code: "INVALID_DEMO_DATA",
        },
      );
    }

    /*
     * SCREENING TIMES
     *
     * demoScreeningInstant() converts the demo's local
     * date and time into a UTC timestamp.
     *
     * The ending time is calculated by adding the movie's
     * duration in milliseconds to its starting time.
     *
     * toISOString() returns the ending time in UTC format.
     */
    const startsAt = demoScreeningInstant(
      screening.date,
      screening.time,
    );

    const endsAt = new Date(
      Date.parse(startsAt) +
        movie.duration * 60 * 1000,
    ).toISOString();

    return {
      id: screening.id,
      movieId: screening.movieId,
      movieTitle: movie.title,

      cinemaId: cinema.id,
      cinemaName: cinema.name,

      roomId: roomId(
        screening.city,
        screening.roomId,
      ),

      roomName: screening.roomName,
      startsAt,
      endsAt,

      // Language and subtitle details are not defined in demo data.
      spokenLanguage: null,
      subtitles: [],

      status: screening.status,

      // Counts currently available seats in the shared store.
      availableSeatCount: store.getAvailability(
        screening.id,
      ).available.length,
    };
  }


  /*
   * GET FUTURE SCREENINGS
   *
   * Reads the latest screenings from the shared cinema store.
   *
   * Only includes screenings that:
   * - Have the status "scheduled".
   * - Start later than the current time.
   *
   * Cancelled and past screenings are excluded.
   *
   * Reading the store each time ensures changes made by
   * staff are reflected in customer movie results.
   */
  function futureScreenings() {
    const currentTime = now();

    return store
      .getSnapshot()
      .screenings
      .filter((screening) => {
        return screening.status === "scheduled";
      })
      .map(toScreeningRecord)
      .filter((screening) => {
        return (
          Date.parse(screening.startsAt) >
          currentTime
        );
      });
  }


  /*
   * PUBLIC DEMO CATALOGUE METHODS
   *
   * These functions match the real API catalogue service.
   *
   * They are asynchronous so components can use the same
   * request-handling logic in both demo and API modes.
   */
  return {
    /*
     * SHARED STORE SUBSCRIPTION
     *
     * Allows React to detect changes in the demo cinema store.
     *
     * For example, cancelling a screening can trigger
     * updated movie and screening results.
     */
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,


    /*
     * LIST CINEMAS
     *
     * Returns paginated cinema records.
     * Used by Home and Movie Details for cinema selection.
     *
     * Checks cancellation before returning results.
     */
    async listCinemas(
      query = {},
      { signal } = {},
    ) {
      checkSignal(signal);

      return paginate(cinemaRecords, query);
    },


    /*
     * LIST GENRES
     *
     * Returns paginated genre options for the Home filter.
     *
     * Each genre contains an ID and name.
     */
    async listGenres(
      query = {},
      { signal } = {},
    ) {
      checkSignal(signal);

      return paginate(genreRecords, query);
    },


    /*
     * LIST CINEMA ROOMS
     *
     * Returns rooms belonging to the selected cinema.
     *
     * First checks that the cinema exists.
     * Then converts the shared room definitions into
     * records with cinema-specific room IDs.
     *
     * Results are sorted by room name and paginated.
     */
    async listRooms(
      cinemaId,
      query = {},
      { signal } = {},
    ) {
      checkSignal(signal);

      const cinema = findCinema(cinemaId);

      // Returns a 404 error if the requested cinema does not exist.
      if (!cinema) {
        throw new ApiError(
          "Cinema not found.",
          {
            status: 404,
            code: "NOT_FOUND",
          },
        );
      }

      /*
       * PREPARE ROOM RECORDS
       *
       * map() creates room objects using the selected cinema's ID.
       * sort() orders rooms alphabetically by name and then ID.
       */
      const records = rooms
        .map((room) => ({
          id: roomId(cinema.city, room.id),
          cinemaId: cinema.id,
          name: room.name,
          capacity: room.capacity,
        }))
        .sort((a, b) => {
          return (
            a.name.localeCompare(b.name) ||
            a.id.localeCompare(b.id)
          );
        });

      return paginate(records, query);
    },


    /*
     * LIST MOVIES
     *
     * Returns movies matching the selected filters.
     *
     * A movie must have at least one future scheduled screening.
     *
     * Optional filters include:
     * - Cinema ID.
     * - Movie title search.
     * - Genre ID.
     *
     * Results are sorted alphabetically and paginated.
     */
    async listMovies(
      query = {},
      { signal } = {},
    ) {
      checkSignal(signal);

      /*
       * VALIDATE CINEMA FILTER
       *
       * If a cinema ID is provided, it must match
       * one of the available cinemas.
       */
      if (
        query.cinemaId &&
        !findCinema(query.cinemaId)
      ) {
        throw invalidFilter(
          "cinemaId",
          "Choose a valid cinema.",
        );
      }

      /*
       * VALIDATE GENRE FILTER
       *
       * some() checks whether the selected genre ID
       * exists in the available genre records.
       */
      if (
        query.genreId &&
        !genreRecords.some(
          (genre) => genre.id === query.genreId,
        )
      ) {
        throw invalidFilter(
          "genreId",
          "Choose a valid genre.",
        );
      }

      /*
       * PREPARE SEARCH TEXT
       *
       * Converts the search value to lowercase and removes
       * surrounding spaces for case-insensitive matching.
       *
       * Search text cannot exceed 100 characters.
       */
      const search = String(
        query.search ?? "",
      ).trim().toLowerCase();

      if (search.length > 100) {
        throw invalidFilter(
          "search",
          "Search must contain at most 100 characters.",
        );
      }

      /*
       * FIND MATCHING SCREENINGS
       *
       * Gets future screenings and optionally filters
       * them by the selected cinema.
       *
       * If no cinema filter exists, screenings from
       * all cinemas are included.
       */
      const programme = futureScreenings()
        .filter((screening) => {
          return (
            !query.cinemaId ||
            screening.cinemaId === query.cinemaId
          );
        });

      /*
       * FIND SCHEDULED MOVIE IDS
       *
       * Extracts movie IDs from the matching screenings.
       *
       * Set removes duplicate IDs so each movie
       * appears only once in the results.
       */
      const scheduledMovieIds = new Set(
        programme.map(
          (screening) => screening.movieId,
        ),
      );

      /*
       * FILTER AND PREPARE MOVIES
       *
       * A movie is included when:
       * - It has a matching future screening.
       * - Its title contains the search text.
       * - Its genre matches the selected genre, if any.
       *
       * includes() performs a partial title match.
       * sort() orders movies alphabetically by title.
       * map() converts them into the API movie format.
       */
      const records = movies
        .filter((movie) => {
          return (
            scheduledMovieIds.has(movie.id) &&
            movie.title
              .toLowerCase()
              .includes(search) &&
            (
              !query.genreId ||
              genreId(movie.genre) ===
                query.genreId
            )
          );
        })
        .sort((a, b) => {
          return (
            a.title.localeCompare(b.title) ||
            a.id.localeCompare(b.id)
          );
        })
        .map(toMovieRecord);

      return paginate(records, query);
    },


    /*
     * GET ONE MOVIE
     *
     * Finds a movie using its ID and converts it
     * into the agreed API movie format.
     *
     * Returns a 404 error if the movie does not exist.
     *
     * Movie details remain available even if the movie
     * no longer has future screenings.
     */
    async getMovie(
      movieId,
      { signal } = {},
    ) {
      checkSignal(signal);

      const movie = movies.find(
        (item) => item.id === movieId,
      );

      if (!movie) {
        throw new ApiError(
          "Movie not found.",
          {
            status: 404,
            code: "NOT_FOUND",
          },
        );
      }

      return {
        data: toMovieRecord(movie),
      };
    },


    /*
     * LIST SCREENINGS
     *
     * Returns future screenings matching the requested filters.
     *
     * Supports filtering by:
     * - Movie ID.
     * - Cinema ID.
     * - Room ID.
     * - Helsinki calendar date.
     *
     * Validates filter values before searching.
     * Results are sorted by starting time and paginated.
     */
    async listScreenings(
      query = {},
      { signal } = {},
    ) {
      checkSignal(signal);

      /*
       * VALIDATE MOVIE
       *
       * If a movie ID is provided, it must exist
       * in the demo movie records.
       */
      if (
        query.movieId &&
        !movies.some(
          (movie) => movie.id === query.movieId,
        )
      ) {
        throw invalidFilter(
          "movieId",
          "Choose a valid movie.",
        );
      }

      /*
       * VALIDATE CINEMA
       *
       * Checks that the selected cinema exists.
       */
      if (
        query.cinemaId &&
        !findCinema(query.cinemaId)
      ) {
        throw invalidFilter(
          "cinemaId",
          "Choose a valid cinema.",
        );
      }

      /*
       * VALIDATE ROOM
       *
       * Checks whether the requested room exists
       * and belongs to the selected cinema.
       *
       * This is important because room IDs are
       * specific to each cinema.
       */
      if (query.roomId) {
        const matchingCinema = cinemaRecords.find(
          (cinema) => {
            return rooms.some(
              (room) => {
                return (
                  roomId(cinema.city, room.id) ===
                  query.roomId
                );
              },
            );
          },
        );

        // Rejects missing rooms or rooms from another cinema.
        if (
          !matchingCinema ||
          (
            query.cinemaId &&
            matchingCinema.id !== query.cinemaId
          )
        ) {
          throw invalidFilter(
            "roomId",
            "Choose a room belonging to the selected cinema.",
          );
        }
      }

      /*
       * VALIDATE DATE
       *
       * Checks that the requested date is a valid
       * Helsinki calendar date in YYYY-MM-DD format.
       *
       * demoScreeningInstant() is reused for validation.
       * Noon is used to avoid daylight-saving time ambiguity.
       *
       * Invalid dates produce a structured validation error.
       */
      if (query.date) {
        try {
          demoScreeningInstant(
            query.date,
            "12:00",
          );
        } catch {
          throw invalidFilter(
            "date",
            "Enter a valid date in YYYY-MM-DD format.",
          );
        }
      }

      /*
       * FILTER SCREENINGS
       *
       * Gets all future scheduled screenings.
       *
       * Each optional filter must match when provided.
       * An empty filter means that condition is ignored.
       *
       * cinemaDate() converts the UTC starting time
       * into a Helsinki calendar date for comparison.
       *
       * sort() orders screenings by starting time,
       * using the screening ID when times are equal.
       */
      const records = futureScreenings()
        .filter((screening) => {
          return (
            (
              !query.movieId ||
              screening.movieId === query.movieId
            ) &&
            (
              !query.cinemaId ||
              screening.cinemaId === query.cinemaId
            ) &&
            (
              !query.roomId ||
              screening.roomId === query.roomId
            ) &&
            (
              !query.date ||
              cinemaDate(screening.startsAt) ===
                query.date
            )
          );
        })
        .sort((a, b) => {
          return (
            a.startsAt.localeCompare(b.startsAt) ||
            a.id.localeCompare(b.id)
          );
        });

      // Returns the matching screenings in the API pagination format.
      return paginate(records, query);
    },
  };
}