/*
 * FILE: frontend/src/pages/MovieDetails.jsx
 *
 * Displays detailed information about a selected movie
 * and helps customers find available cinema screenings.
 *
 * The page shows:
 * - Movie poster, title, description, and genres.
 * - Age rating and running time.
 * - A link to the movie trailer, when available.
 * - Cinema and room selection.
 * - Screening dates, times, and available seat counts.
 *
 * Movie, cinema, room, and screening information
 * is loaded through the catalogue service.
 *
 * ROUTE:
 * /movies/:movieId
 *
 * PROPS:
 * city: Cinema city selected on the Home page.
 * onBack: Function for returning to the movie section.
 * onChooseSeats: Function for starting seat selection.
 *
 * IMPORTANT:
 * Seat selection is temporarily disabled in this version.
 * The booking service will be connected in a later batch.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useParams } from "react-router-dom";

import { catalogue } from "../services/catalogue.js";
import { collectPages } from "../services/apiCatalogue.js";
import { useResource } from "../hooks/useResource.js";

import {
  cinemaDate,
  cinemaTime,
} from "../utils/cinemaTime.js";

import RequestState from "../components/RequestState.jsx";
import fallbackPoster from "../assets/fallback-poster.png";


/*
 * TEMPORARY BOOKING CONFIGURATION
 *
 * Booking is disabled until the booking services
 * and authentication dependencies are ready.
 *
 * In a later batch, this constant will be replaced
 * with an import from the booking service.
 *
 * Keeping this false allows customers to browse
 * screenings without starting an unfinished checkout.
 */
const bookingEnabled = false;


/*
 * MOVIE DETAILS PAGE
 *
 * Reads the movie ID from the current URL.
 *
 * useParams() gets route parameters from React Router.
 *
 * For example:
 * /movies/movie-123
 *
 * movieId would be "movie-123".
 *
 * The key={movieId} causes MovieDetailsContent to reset
 * its local state when the user opens a different movie.
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


/*
 * MOVIE DETAILS CONTENT
 *
 * Handles the page's data loading, filter selections,
 * screening discovery, and displayed movie information.
 *
 * Separating this component from MovieDetails allows
 * React to reset its state when the movie ID changes.
 */
function MovieDetailsContent({
  movieId,
  city,
  onBack,
  onChooseSeats,
}) {
  /*
   * SCREENING SELECTION STATE
   *
   * Stores the customer's current screening filters.
   *
   * cinemaId: Selected cinema.
   * roomId: Selected auditorium.
   * screeningId: Selected screening.
   * date: Selected screening date.
   *
   * cinemaDate() uses the current date in Finland,
   * rather than the visitor's browser time zone.
   */
  const [selection, setSelection] = useState({
    cinemaId: "",
    roomId: "",
    screeningId: "",
    date: cinemaDate(),
  });

  /*
   * POSTER ERROR STATE
   *
   * Remembers the URL of a poster that failed to load.
   *
   * This allows the page to display a fallback image
   * instead of repeatedly trying the broken poster.
   */
  const [failedPoster, setFailedPoster] = useState(null);

  /*
   * MOVIE TITLE REFERENCE
   *
   * useRef() stores a reference to the movie heading.
   *
   * It is used to move keyboard focus to the title
   * after the movie information has loaded.
   */
  const headingRef = useRef(null);


  /*
   * SUBSCRIBE TO CATALOGUE CHANGES
   *
   * useSyncExternalStore() connects this component
   * to the catalogue's shared data store.
   *
   * In demo mode, changes made by an owner can
   * trigger the screening list to refresh.
   *
   * In API mode, the snapshot remains stable.
   * This does not provide live WebSocket updates.
   */
  const catalogueSnapshot = useSyncExternalStore(
    catalogue.subscribe,
    catalogue.getSnapshot,
    catalogue.getSnapshot,
  );


  /*
   * LOAD MOVIE DETAILS
   *
   * Requests information about the movie identified
   * by the movieId from the URL.
   *
   * useCallback() keeps the loading function stable
   * until movieId changes.
   *
   * signal allows an outdated request to be cancelled.
   */
  const loadMovie = useCallback(
    (signal) =>
      catalogue.getMovie(movieId, { signal }),
    [movieId],
  );

  /*
   * useResource() handles loading, errors, and retrying.
   *
   * The service response contains the movie
   * inside its data property.
   */
  const movieResult = useResource(loadMovie);
  const movie = movieResult.data?.data;


  /*
   * LOAD CINEMA LOCATIONS
   *
   * Requests all available cinemas from the catalogue.
   *
   * collectPages() retrieves results across multiple
   * pages instead of loading only the first page.
   *
   * The empty dependency array means this loading
   * function does not depend on changing component values.
   */
  const loadCinemas = useCallback(
    (signal) =>
      collectPages(catalogue.listCinemas, { signal }),
    [],
  );

  const cinemasResult = useResource(loadCinemas);
  const cinemas = cinemasResult.data ?? [];


  /*
   * CHOOSE THE CURRENT CINEMA
   *
   * Determines which cinema should be displayed.
   *
   * Priority:
   * 1. Cinema selected on this page.
   * 2. Cinema city selected on the Home page.
   * 3. First cinema returned by the catalogue.
   *
   * The ?? operator uses the next option
   * when the previous result is null or undefined.
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
   * LOAD CINEMA ROOMS
   *
   * Requests the rooms belonging to the selected cinema.
   *
   * If no cinema is available, an empty array is returned.
   *
   * collectPages() loads all room records.
   *
   * The function is recreated when the selected
   * cinema changes so the correct rooms are loaded.
   */
  const loadRooms = useCallback(
    (signal) => {
      if (!cinema) {
        return Promise.resolve([]);
      }

      return collectPages(
        (query, options) =>
          catalogue.listRooms(
            cinema.id,
            query,
            options,
          ),
        { signal },
      );
    },
    [cinema],
  );

  const roomsResult = useResource(loadRooms);
  const rooms = roomsResult.data ?? [];


  /*
   * CHOOSE THE CURRENT ROOM
   *
   * Uses the room selected by the customer.
   *
   * If no room has been selected, the first
   * available room is used instead.
   */
  const room =
    rooms.find(
      (item) => item.id === selection.roomId,
    ) ?? rooms[0];


  /*
   * LOAD AVAILABLE SCREENINGS
   *
   * Requests screenings matching the selected:
   * - Movie.
   * - Cinema.
   * - Room.
   * - Date.
   *
   * If required information is missing,
   * the function returns an empty array.
   *
   * catalogueSnapshot is included as a dependency
   * so demo store updates can refresh the results.
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

      /*
       * References the current catalogue snapshot.
       *
       * The snapshot is also included in useCallback's
       * dependency array so the function updates
       * when the demo catalogue changes.
       */
      void catalogueSnapshot;

      /*
       * Requests every page of matching screenings.
       *
       * The selected filters are added to the
       * pagination query sent to the catalogue service.
       */
      return collectPages(
        (query, options) =>
          catalogue.listScreenings(
            {
              ...query,
              movieId,
              cinemaId: cinema.id,
              roomId: room.id,
              date: selection.date,
            },
            options,
          ),
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

  const screeningsResult = useResource(loadScreenings);
  const screenings = screeningsResult.data ?? [];


  /*
   * FIND SELECTED SCREENING
   *
   * Searches the loaded screenings for the one
   * selected by the customer.
   *
   * If no screening matches, the result is undefined.
   */
  const selectedScreening = screenings.find(
    (item) => item.id === selection.screeningId,
  );


  /*
   * FOCUS MOVIE TITLE
   *
   * Runs after movie information becomes available.
   *
   * Moves keyboard focus to the movie heading,
   * helping keyboard and screen-reader users
   * understand that a new movie page has loaded.
   *
   * preventScroll avoids automatically scrolling
   * the page when focus changes.
   */
  useEffect(() => {
    if (movie) {
      headingRef.current?.focus({
        preventScroll: true,
      });
    }
  }, [movie]);


  /*
   * UPDATE SCREENING FILTERS
   *
   * Updates one or more values in the selection state.
   *
   * The spread operators preserve existing values
   * and replace only the values provided in patch.
   *
   * The selected screening is cleared whenever
   * a filter changes because it might no longer
   * match the selected cinema, room, or date.
   */
  function changeSelection(patch) {
    setSelection((previous) => ({
      ...previous,
      ...patch,
      screeningId: "",
    }));
  }


  /*
   * RETRY CINEMA AND ROOM REQUESTS
   *
   * Calls the retry functions provided by useResource().
   *
   * Used when loading cinema or room information fails.
   */
  function retryReferences() {
    cinemasResult.retry();
    roomsResult.retry();
  }


  /*
   * CHOOSE SCREENING
   *
   * Will start the seat-selection process
   * when the booking feature is connected.
   *
   * Before continuing, checks that:
   * - Booking is enabled.
   * - The screening has available seats.
   * - The parent supplied an onChooseSeats function.
   *
   * Available-seat counts are only a preview.
   * The booking service must check availability again
   * when creating a temporary seat hold.
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
   * HANDLE MISSING MOVIE INFORMATION
   *
   * Displays a loading message, error message,
   * or movie-not-found message when necessary.
   *
   * A 404 response means the requested movie
   * could not be found.
   *
   * Other request errors allow the customer
   * to retry loading the movie.
   */
  if (!movie) {
    const notFound = movieResult.error?.status === 404;

    return (
      <section className="container catalogue-status">
        <h1 tabIndex={-1}>
          {notFound ? "Movie not found" : "Movie details"}
        </h1>

        <RequestState
          loading={movieResult.loading}
          error={movieResult.error}
          onRetry={
            notFound ? undefined : movieResult.retry
          }
          loadingMessage="Loading movie details…"
        />

        {/* Returns to the movie catalogue. */}
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
   * PREPARE MOVIE INFORMATION
   *
   * Checks whether the movie has valid age-rating
   * and running-time information.
   *
   * Missing values are displayed explicitly
   * instead of showing incorrect information.
   */
  const ratingLabel =
    movie.ageRating?.label == null
      ? ""
      : String(movie.ageRating.label).trim();

  const runtimeAvailable =
    Number.isInteger(movie.durationMinutes) &&
    movie.durationMinutes > 0;


  /*
   * HANDLE MISSING OR BROKEN POSTERS
   *
   * Uses the fallback poster when:
   * - No poster URL exists.
   * - The original poster failed to load.
   *
   * This prevents broken images from appearing
   * on the Movie Details page.
   */
  const posterUnavailable =
    !movie.posterUrl ||
    failedPoster === movie.posterUrl;

  const posterSource = posterUnavailable
    ? fallbackPoster
    : movie.posterUrl;


  /*
   * PREPARE TRAILER LINK
   *
   * Only YouTube trailers with a valid video ID
   * are accepted.
   *
   * The regular expression allows letters,
   * numbers, underscores, and hyphens.
   *
   * The URL is built from the video ID instead
   * of directly displaying arbitrary backend HTML.
   *
   * If the trailer information is unsupported,
   * trailerUrl becomes null.
   */
  const trailer = movie.trailer;

  const supportedTrailer =
    trailer?.provider === "youtube" &&
    typeof trailer.videoId === "string" &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(trailer.videoId);

  const trailerUrl = supportedTrailer
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(
        trailer.videoId,
      )}`
    : null;


  /*
   * CHECK CINEMA AND ROOM REQUEST STATES
   *
   * referencesLoading is true while cinema
   * or room information is being loaded.
   *
   * referencesError contains any request error.
   *
   * referencesReady is true only when loading
   * has finished without an error.
   */
  const referencesLoading =
    cinemasResult.loading ||
    Boolean(cinema && roomsResult.loading);

  const referencesError =
    cinemasResult.error || roomsResult.error;

  const referencesReady =
    !referencesLoading && !referencesError;


  /*
   * CHECK WHETHER SCREENINGS CAN BE DISPLAYED
   *
   * Screening discovery requires:
   * - Successfully loaded cinema and room information.
   * - A valid selected cinema.
   * - A valid selected room.
   */
  const canShowScreenings =
    referencesReady &&
    Boolean(cinema) &&
    Boolean(room);

  // Controls whether the seat-selection buttons are enabled.
  const bookingConnected = bookingEnabled;


  /*
   * RENDER MOVIE DETAILS PAGE
   *
   * The layout contains two main sections:
   *
   * 1. Movie information.
   * 2. Cinema and screening selection.
   */
  return (
    <section className="container movie-details-section">
      {/* Button for returning to the movie catalogue. */}
      <button
        type="button"
        className="movie-back-button"
        onClick={onBack}
      >
        <span aria-hidden="true">←</span>
        Back to movies
      </button>

      <div className="details-page-layout">
        {/*
         * MOVIE INFORMATION
         *
         * Displays the movie poster, trailer link,
         * title, age rating, runtime, genres,
         * description, and language information.
         */}
        <article
          className="details-main"
          aria-labelledby="movie-details-title"
        >
          {/*
           * MOVIE POSTER AND TRAILER
           *
           * Displays the movie poster or fallback image.
           *
           * If a valid trailer is available,
           * the customer can open it on YouTube.
           */}
          <div className="details-trailer">
            <div className="details-trailer-placeholder">
              <img
                src={posterSource}
                alt=""
                onError={() => {
                  setFailedPoster(movie.posterUrl);
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
                  <span>Trailer unavailable</span>
                )}
              </div>
            </div>
          </div>

          {/*
           * MOVIE TITLE
           *
           * ref connects the heading to headingRef.
           *
           * tabIndex={-1} allows the heading to receive
           * programmatic focus without adding it
           * to normal keyboard tab navigation.
           */}
          <h1
            id="movie-details-title"
            ref={headingRef}
            tabIndex={-1}
          >
            {movie.title}
          </h1>

          {/*
           * MOVIE INFORMATION BADGES
           *
           * Displays age rating, running time,
           * and all genres associated with the movie.
           *
           * Missing information receives a readable
           * fallback message.
           */}
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

          {/* Movie description with a fallback for missing text. */}
          <p className="details-description">
            {movie.description || "Description unavailable."}
          </p>

          {/*
           * AGE-RATING NOTICE
           *
           * Reminds customers to check whether
           * the movie is suitable before booking.
           */}
          <p className="details-age-notice">
            {ratingLabel
              ? `Age rating: ${ratingLabel}. Check suitability before selecting tickets.`
              : "Age rating unavailable. Please check with the cinema before booking."}
          </p>

          {/*
           * SCREENING LANGUAGE AND SUBTITLES
           *
           * Language and subtitle information belongs
           * to the selected screening.
           *
           * Different screenings of the same movie
           * may have different language options.
           *
           * This section appears only when a screening
           * has been selected.
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
                    {selectedScreening.subtitles.join(", ")}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </article>


        {/*
         * SCREENING DISCOVERY PANEL
         *
         * Allows customers to select:
         * - Cinema.
         * - Room.
         * - Screening time.
         * - Screening date.
         *
         * Also displays seat availability
         * and request loading/error states.
         */}
        <aside
          className="screening-panel"
          aria-labelledby="screening-panel-title"
        >
          <h2 id="screening-panel-title">
            Choose cinema, room & screening
          </h2>

          {/*
           * CINEMA AND ROOM LOADING STATUS
           *
           * RequestState displays loading and error messages.
           *
           * The retry button reloads cinema
           * and room information when necessary.
           */}
          <RequestState
            loading={referencesLoading}
            error={referencesError}
            onRetry={retryReferences}
            loadingMessage="Loading cinemas and rooms…"
          />

          <div className="screening-selectors">
            {/*
             * CINEMA SELECTOR
             *
             * Displays all available cinemas.
             *
             * Changing the cinema also clears
             * the selected room and screening.
             *
             * The selector is disabled when cinema
             * information is unavailable or loading.
             */}
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
                  <option value="">No cinemas</option>
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


            {/*
             * ROOM SELECTOR
             *
             * Displays rooms belonging to the selected cinema.
             *
             * Changing the room clears the selected screening.
             *
             * The selector is disabled while required
             * information is loading or unavailable.
             */}
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
                  <option value="">No rooms</option>
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


            {/*
             * SCREENING SELECTOR
             *
             * Displays the available screening times
             * for the selected movie, cinema, room, and date.
             *
             * cinemaTime() converts each screening timestamp
             * into Finnish local time.
             *
             * Selecting an option saves its screening ID.
             */}
            <label htmlFor="details-screening">
              <span>Screening</span>

              <select
                id="details-screening"
                value={selectedScreening?.id ?? ""}
                disabled={
                  !canShowScreenings ||
                  screeningsResult.loading ||
                  Boolean(screeningsResult.error) ||
                  screenings.length === 0
                }
                onChange={(event) => {
                  const screeningId = event.target.value;

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
                    {cinemaTime(item.startsAt)}
                  </option>
                ))}
              </select>
            </label>
          </div>


          {/*
           * SCREENING DATE SELECTOR
           *
           * Allows customers to choose a screening date.
           *
           * The input uses YYYY-MM-DD format.
           *
           * min={cinemaDate()} prevents choosing
           * dates before today in Finland.
           *
           * Changing the date clears the selected screening.
           */}
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


          {/*
           * ROOM SUMMARY
           *
           * Shows the selected cinema city,
           * room name, and seating capacity.
           *
           * Only appears when both cinema
           * and room information are available.
           */}
          {cinema && room && (
            <p className="screening-room-summary">
              {cinema.city}
              {" · "}
              {room.name}
              {" · "}
              {room.capacity} seats
            </p>
          )}


          {/*
           * NO CINEMAS MESSAGE
           *
           * Appears when cinema loading has finished
           * successfully but no cinema is available.
           */}
          {referencesReady && !cinema && (
            <p
              className="screening-empty-message"
              role="status"
            >
              No cinemas are available yet.
            </p>
          )}


          {/*
           * NO ROOMS MESSAGE
           *
           * Appears when the selected cinema
           * does not have any available rooms.
           */}
          {referencesReady && cinema && !room && (
            <p
              className="screening-empty-message"
              role="status"
            >
              No rooms are available for this cinema.
            </p>
          )}


          {/*
           * AVAILABLE SCREENINGS
           *
           * Displays screening request status
           * and the available screening times.
           *
           * This section appears only when
           * a valid cinema and room are available.
           */}
          {canShowScreenings && (
            <>
              <RequestState
                loading={screeningsResult.loading}
                error={screeningsResult.error}
                onRetry={screeningsResult.retry}
                loadingMessage="Loading screenings…"
              />

              {/*
               * SCREENING TIME BUTTONS
               *
               * Displays each screening as a button.
               *
               * Each button shows:
               * - Screening time in Finland.
               * - Sold-out status or available seat count.
               *
               * Buttons are disabled when:
               * - The screening is sold out.
               * - Booking is not connected.
               * - The seat-selection callback is missing.
               */}
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
                              typeof onChooseSeats !== "function"
                            }
                            onClick={() => {
                              chooseScreening(item);
                            }}
                          >
                            {cinemaTime(item.startsAt)}
                            {" · "}

                            {soldOut
                              ? "Sold out"
                              : `Choose seats (${item.availableSeatCount} available)`}
                          </button>
                        );
                      })
                    ) : (
                      /*
                       * NO SCREENINGS MESSAGE
                       *
                       * Explains that no screenings match
                       * the selected date and room.
                       */
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

              {/*
               * BOOKING NOT CONNECTED MESSAGE
               *
               * In this development batch, customers
               * can view screenings but cannot book seats.
               *
               * This message explains why the
               * seat-selection buttons are disabled.
               */}
              {!bookingConnected &&
                screenings.length > 0 && (
                  <p className="screening-empty-message">
                    Seat selection will be added in the next batch.
                  </p>
                )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}


/*
 * EXPORT MOVIE DETAILS
 *
 * Makes MovieDetails available for importing
 * into the application's routing configuration.
 */
export default MovieDetails;