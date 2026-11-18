/*
 * FILE: frontend/src/pages/MovieDetails.jsx
 *
 * PURPOSE
 * -------
 * Displays movie information and available screenings.
 *
 * DATA SOURCES
 * ------------
 * Catalogue service:
 * - Movie details.
 * - Cinemas.
 * - Rooms.
 * - Screening times.
 *
 * Booking configuration:
 * - Determines whether this catalogue can enter the booking flow.
 *
 * NAVIGATION
 * ----------
 * onBack():
 * Returns to Home's movies section.
 *
 * onChooseSeats(screeningId):
 * App opens the service-based Seat Selection page.
 *
 * IMPORTANT
 * ---------
 * This page does not create holds or bookings.
 * Seat Selection creates a hold after the customer chooses seats.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  useParams,
} from "react-router-dom";

import {
  catalogue,
} from "../services/catalogue.js";

import {
  bookingEnabled,
} from "../services/booking.js";

import {
  collectPages,
} from "../services/apiCatalogue.js";

import {
  useResource,
} from "../hooks/useResource.js";

import {
  cinemaDate,
  cinemaTime,
} from "../utils/cinemaTime.js";

import RequestState from "../components/RequestState.jsx";

import fallbackPoster from "../assets/fallback-poster.png";


/*
 * ROUTE WRAPPER
 *
 * Reads movieId from /movies/:movieId.
 *
 * Changing movie URLs resets the inner page's local selectors.
 */
function MovieDetails({
  city,
  onBack,
  onChooseSeats,
}) {
  const { movieId } = useParams();

  return (
    <MovieDetailsContent
      key={movieId}
      movieId={movieId}
      city={city}
      onBack={onBack}
      onChooseSeats={onChooseSeats}
    />
  );
}


function MovieDetailsContent({
  movieId,
  city,
  onBack,
  onChooseSeats,
}) {
  /*
   * CUSTOMER SELECTIONS
   *
   * IDs come from the selected catalogue service.
   * date is a Helsinki calendar date.
   */
  const [selection, setSelection] = useState({
    cinemaId: "",
    roomId: "",
    screeningId: "",
    date: cinemaDate(),
  });

  const [failedPoster, setFailedPoster] =
    useState(null);

  const headingRef = useRef(null);


  /*
   * SHARED DEMO UPDATES
   *
   * Demo store changes refresh the screening list.
   * API mode uses a stable snapshot; this is not a server
   * WebSocket subscription.
   */
  const catalogueSnapshot =
    useSyncExternalStore(
      catalogue.subscribe,
      catalogue.getSnapshot,
      catalogue.getSnapshot,
    );


  /*
   * LOAD MOVIE DETAILS
   */
  const loadMovie = useCallback(
    (signal) => {
      return catalogue.getMovie(
        movieId,
        { signal },
      );
    },
    [movieId],
  );

  const movieResult =
    useResource(loadMovie);

  const movie =
    movieResult.data?.data;


  /*
   * LOAD CINEMA OPTIONS
   *
   * Collect every page of this small reference list.
   */
  const loadCinemas = useCallback(
    (signal) => {
      return collectPages(
        catalogue.listCinemas,
        { signal },
      );
    },
    [],
  );

  const cinemasResult =
    useResource(loadCinemas);

  const cinemas =
    cinemasResult.data ?? [];


  /*
   * RESOLVE CINEMA
   *
   * Prefer the current selection, then App's preferred city,
   * then the first available cinema.
   */
  const cinema =
    cinemas.find(
      (item) => item.id === selection.cinemaId,
    ) ??
    cinemas.find(
      (item) => item.city === city,
    ) ??
    cinemas[0];


  /*
   * LOAD ROOMS FOR THE SELECTED CINEMA
   */
  const loadRooms = useCallback(
    (signal) => {
      if (!cinema) {
        return Promise.resolve([]);
      }

      return collectPages(
        (query, options) => {
          return catalogue.listRooms(
            cinema.id,
            query,
            options,
          );
        },
        { signal },
      );
    },
    [cinema],
  );

  const roomsResult =
    useResource(loadRooms);

  const rooms =
    roomsResult.data ?? [];

  const room =
    rooms.find(
      (item) => item.id === selection.roomId,
    ) ?? rooms[0];


  /*
   * LOAD MATCHING SCREENINGS
   *
   * The snapshot dependency refreshes demo results when the
   * shared store changes.
   */
  const loadScreenings = useCallback(
    (signal) => {
      if (
        !movie ||
        !cinema ||
        !room ||
        !selection.date
      ) {
        return Promise.resolve([]);
      }

      void catalogueSnapshot;

      return collectPages(
        (query, options) => {
          return catalogue.listScreenings(
            {
              ...query,
              movieId,
              cinemaId: cinema.id,
              roomId: room.id,
              date: selection.date,
            },
            options,
          );
        },
        { signal },
      );
    },
    [
      movie,
      movieId,
      cinema,
      room,
      selection.date,
      catalogueSnapshot,
    ],
  );

  const screeningsResult =
    useResource(loadScreenings);

  const screenings =
    screeningsResult.data ?? [];

  const selectedScreening =
    screenings.find((item) => {
      return (
        item.id === selection.screeningId
      );
    });


  /*
   * FOCUS THE ASYNCHRONOUSLY LOADED TITLE
   */
  useEffect(() => {
    if (movie) {
      headingRef.current?.focus({
        preventScroll: true,
      });
    }
  }, [movie]);


  /*
   * RESET SCREENING CHOICE WHEN ITS FILTERS CHANGE
   */
  function changeSelection(patch) {
    setSelection((previous) => ({
      ...previous,
      ...patch,
      screeningId: "",
    }));
  }

  function retryReferences() {
    cinemasResult.retry();
    roomsResult.retry();
  }


  /*
   * OPEN SERVICE-BASED SEAT SELECTION
   *
   * bookingEnabled checks catalogue/booking mode compatibility.
   * API mode is no longer blocked simply because it is API mode.
   *
   * Availability is advisory. The hold service checks seats again.
   */
  function chooseScreening(screening) {
    if (
      !bookingEnabled ||
      screening.availableSeatCount <= 0 ||
      typeof onChooseSeats !== "function"
    ) {
      return;
    }

    onChooseSeats(screening.id);
  }


  /*
   * MOVIE LOADING / ERROR STATE
   */
  if (!movie) {
    const notFound =
      movieResult.error?.status === 404;

    return (
      <section className="container catalogue-status">
        <h1 tabIndex={-1}>
          {notFound
            ? "Movie not found"
            : "Movie details"}
        </h1>

        <RequestState
          loading={movieResult.loading}
          error={movieResult.error}
          onRetry={
            notFound
              ? undefined
              : movieResult.retry
          }
          loadingMessage="Loading movie details…"
        />

        <button
          type="button"
          className="secondary-button"
          onClick={onBack}
        >
          Back to movies
        </button>
      </section>
    );
  }


  /*
   * DISPLAY FALLBACKS
   */
  const ratingLabel =
    movie.ageRating?.label == null
      ? ""
      : String(
          movie.ageRating.label,
        ).trim();

  const runtimeAvailable =
    Number.isInteger(movie.durationMinutes) &&
    movie.durationMinutes > 0;

  const posterUnavailable =
    !movie.posterUrl ||
    failedPoster === movie.posterUrl;

  const posterSource =
    posterUnavailable
      ? fallbackPoster
      : movie.posterUrl;


  /*
   * SUPPORTED TRAILER LINK
   *
   * Build a known provider URL from videoId.
   * Never render arbitrary backend HTML or put a YouTube watch
   * URL inside a <video> element.
   */
  const trailer = movie.trailer;

  const supportedTrailer =
    trailer?.provider === "youtube" &&
    typeof trailer.videoId === "string" &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(
      trailer.videoId,
    );

  const trailerUrl =
    supportedTrailer
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(
          trailer.videoId,
        )}`
      : null;


  /*
   * SELECTOR REQUEST STATES
   */
  const referencesLoading =
    cinemasResult.loading ||
    Boolean(
      cinema && roomsResult.loading,
    );

  const referencesError =
    cinemasResult.error ||
    roomsResult.error;

  const referencesReady =
    !referencesLoading &&
    !referencesError;

  const canShowScreenings =
    referencesReady &&
    Boolean(cinema) &&
    Boolean(room);

  const bookingConnected =
    bookingEnabled;


  return (
    <section className="container movie-details-section">
      <button
        type="button"
        className="movie-back-button"
        onClick={onBack}
      >
        <span aria-hidden="true">←</span>
        Back to movies
      </button>

      <div className="details-page-layout">
        {/* MOVIE INFORMATION */}
        <article
          className="details-main"
          aria-labelledby="movie-details-title"
        >
          <div className="details-trailer">
            <div className="details-trailer-placeholder">
              <img
                src={posterSource}
                alt=""
                onError={() => {
                  setFailedPoster(
                    movie.posterUrl,
                  );
                }}
              />

              <div className="details-trailer-message">
                {trailerUrl ? (
                  <a
                    className="primary-button"
                    href={trailerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Watch trailer on YouTube

                    <span className="sr-only">
                      {" "}(opens in a new tab)
                    </span>
                  </a>
                ) : (
                  <span>
                    Trailer unavailable
                  </span>
                )}
              </div>
            </div>
          </div>

          <h1
            id="movie-details-title"
            ref={headingRef}
            tabIndex={-1}
          >
            {movie.title}
          </h1>

          <ul
            className="details-badges"
            aria-label="Movie information"
          >
            <li>
              {ratingLabel
                ? `Age ${ratingLabel}`
                : "Age rating unavailable"}
            </li>

            <li>
              {runtimeAvailable
                ? `${movie.durationMinutes} minutes`
                : "Runtime unavailable"}
            </li>

            {movie.genres.map((genre) => (
              <li key={genre.id}>
                {genre.name}
              </li>
            ))}
          </ul>

          <p className="details-description">
            {movie.description ||
              "Description unavailable."}
          </p>

          <p className="details-age-notice">
            {ratingLabel
              ? `Age rating: ${ratingLabel}. Check suitability before selecting tickets.`
              : "Age rating unavailable. Please check with the cinema before booking."}
          </p>

          {/*
           * Performance language/subtitles belong to the selected
           * screening, not the movie's original-language metadata.
           */}
          {selectedScreening && (
            <dl className="details-language">
              {selectedScreening.spokenLanguage && (
                <div>
                  <dt>Language</dt>
                  <dd>
                    {selectedScreening.spokenLanguage}
                  </dd>
                </div>
              )}

              {selectedScreening.subtitles.length > 0 && (
                <div>
                  <dt>Subtitles</dt>
                  <dd>
                    {selectedScreening.subtitles.join(
                      ", ",
                    )}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </article>


        {/* SCREENING SELECTION */}
        <aside
          className="screening-panel"
          aria-labelledby="screening-panel-title"
        >
          <h2 id="screening-panel-title">
            Choose cinema, room & screening
          </h2>

          <RequestState
            loading={referencesLoading}
            error={referencesError}
            onRetry={retryReferences}
            loadingMessage="Loading cinemas and rooms…"
          />

          <div className="screening-selectors">
            <label htmlFor="details-cinema">
              <span>Cinema</span>

              <select
                id="details-cinema"
                value={cinema?.id ?? ""}
                disabled={
                  cinemasResult.loading ||
                  Boolean(cinemasResult.error) ||
                  cinemas.length === 0
                }
                onChange={(event) => {
                  changeSelection({
                    cinemaId: event.target.value,
                    roomId: "",
                  });
                }}
              >
                {cinemas.length === 0 && (
                  <option value="">
                    No cinemas
                  </option>
                )}

                {cinemas.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="details-room">
              <span>Room</span>

              <select
                id="details-room"
                value={room?.id ?? ""}
                disabled={
                  referencesLoading ||
                  Boolean(referencesError) ||
                  rooms.length === 0
                }
                onChange={(event) => {
                  changeSelection({
                    roomId: event.target.value,
                  });
                }}
              >
                {rooms.length === 0 && (
                  <option value="">
                    No rooms
                  </option>
                )}

                {rooms.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="details-screening">
              <span>Screening</span>

              <select
                id="details-screening"
                value={
                  selectedScreening?.id ?? ""
                }
                disabled={
                  !canShowScreenings ||
                  screeningsResult.loading ||
                  Boolean(
                    screeningsResult.error,
                  ) ||
                  screenings.length === 0
                }
                onChange={(event) => {
                  const screeningId =
                    event.target.value;

                  setSelection((previous) => ({
                    ...previous,
                    screeningId,
                  }));
                }}
              >
                <option value="">
                  {screenings.length > 0
                    ? "Select time"
                    : "No times"}
                </option>

                {screenings.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {cinemaTime(
                      item.startsAt,
                    )}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label
            className="screening-date"
            htmlFor="details-date"
          >
            <span>Screening date</span>

            <input
              id="details-date"
              type="date"
              value={selection.date}
              min={cinemaDate()}
              onChange={(event) => {
                changeSelection({
                  date: event.target.value,
                });
              }}
            />
          </label>

          {cinema && room && (
            <p className="screening-room-summary">
              {cinema.city}
              {" · "}
              {room.name}
              {" · "}
              {room.capacity} seats
            </p>
          )}

          {referencesReady && !cinema && (
            <p
              className="screening-empty-message"
              role="status"
            >
              No cinemas are available yet.
            </p>
          )}

          {referencesReady && cinema && !room && (
            <p
              className="screening-empty-message"
              role="status"
            >
              No rooms are available for this cinema.
            </p>
          )}

          {canShowScreenings && (
            <>
              <RequestState
                loading={
                  screeningsResult.loading
                }
                error={
                  screeningsResult.error
                }
                onRetry={
                  screeningsResult.retry
                }
                loadingMessage="Loading screenings…"
              />

              {!screeningsResult.loading &&
                !screeningsResult.error && (
                  <div className="screening-times">
                    {screenings.length > 0 ? (
                      screenings.map((item) => {
                        const soldOut =
                          item.availableSeatCount === 0;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`screening-time-button ${
                              selectedScreening?.id === item.id
                                ? "is-selected"
                                : ""
                            }`}
                            disabled={
                              soldOut ||
                              !bookingConnected ||
                              typeof onChooseSeats !==
                                "function"
                            }
                            onClick={() => {
                              chooseScreening(item);
                            }}
                          >
                            {cinemaTime(
                              item.startsAt,
                            )}
                            {" · "}

                            {soldOut
                              ? "Sold out"
                              : `Choose seats (${item.availableSeatCount} available)`}
                          </button>
                        );
                      })
                    ) : (
                      <p
                        className="screening-empty-message"
                        role="status"
                      >
                        {selection.date
                          ? "No screenings available for this date and room."
                          : "Choose a date to see available screenings."}
                      </p>
                    )}
                  </div>
                )}

              {!bookingConnected &&
                screenings.length > 0 && (
                  <p className="screening-empty-message">
                    Booking is unavailable because the
                    catalogue and booking modes do not match.
                  </p>
                )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

export default MovieDetails;