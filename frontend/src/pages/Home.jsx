/*
 * FILE: frontend/src/pages/Home.jsx
 *
 * Displays the main homepage of Rio Theaters.
 * Includes cinema selection, movie search, genre filters,
 * movie results, pagination, cinema locations, and contact details.
 *
 * Movie data and functions are provided by CatalogueHome.jsx.
 * This component displays the information but does not fetch data itself.
 */

import auditorium from "../assets/auditorium-homepage.png";

import MovieCarousel from "../components/MovieCarousel.jsx";
import RequestState from "../components/RequestState.jsx";

/*
 * HOME COMPONENT
 *
 * Receives data and functions from the parent component.
 *
 * cinemas, city: Available cinemas and currently selected city.
 * chooseCinema: Updates the selected cinema.
 * navigateHome: Navigates to a section of the homepage.
 *
 * search, genre: Current movie search and genre filter values.
 * setSearch, setGenre: Update the search and genre filters.
 * genres: Available genre options.
 * clearFilters: Resets the selected filters.
 *
 * visibleMovies: Movies displayed on the current page.
 * openMovie: Opens the selected movie's details.
 * resultsState: Contains movie results, loading, and error states.
 *
 * page, onPageChange: Current page number and pagination function.
 */
function Home({
  cinemas,
  city,
  chooseCinema,
  navigateHome,

  search,
  setSearch,
  genre,
  setGenre,
  genres,
  clearFilters,

  visibleMovies,
  openMovie,
  resultsState,

  page,
  onPageChange,
}) {
  /*
   * MOVIE RESULT INFORMATION
   *
   * Gets the total number of matching movies and available pages.
   * Optional chaining (?.) prevents errors if data is missing.
   * The ?? operator uses 0 when the value is null or undefined.
   */
  const totalMovies = resultsState.data?.meta.totalItems ?? 0;

  const totalPages = resultsState.data?.meta.totalPages ?? 0;

  // Results are ready when the request is not loading and has no error.
  const resultsReady = !resultsState.loading && !resultsState.error;

  // Checks whether the user has entered a search or selected a genre.
  const hasFilters = search.trim() !== "" || genre !== "";

  return (
    <>
      {/*
       * HERO SECTION
       *
       * Displays the homepage banner with a background image,
       * cinema selector, and a button linking to the movie section.
       *
       * The linear gradient darkens the background image
       * to make the text easier to read.
       */}
      <section
        id="home"
        className="hero"
        aria-labelledby="hero-title"
        style={{
          backgroundImage: `
            linear-gradient(
              90deg,
              rgba(0, 0, 0, 0.94) 0%,
              rgba(0, 0, 0, 0.72) 45%,
              rgba(0, 0, 0, 0.15) 100%
            ),
            url("${auditorium}")
          `,
        }}
      >
        <div className="container hero-inner">
          <div className="hero-content">
            <p className="eyebrow">MAKE A NIGHT OF IT</p>

            <h1 id="hero-title" tabIndex={-1}>
              Your next movie night
              <br />
              <span>starts here.</span>
            </h1>

            <p className="hero-description">
              Bring your friends, find your seats, and enjoy a story worth
              seeing on the big screen.
            </p>

            {/*
             * CINEMA SELECTOR
             *
             * Displays available cinema cities using map().
             * When the user selects a city, chooseCinema updates
             * the selected cinema through the parent component.
             */}
            <div className="hero-booking">
              <label className="cinema-field" htmlFor="cinema-select">
                <span>Where would you like to watch?</span>

                <select
                  id="cinema-select"
                  value={city}
                  onChange={(event) => {
                    chooseCinema(event.target.value);
                  }}
                >
                  {cinemas.map((cinema) => (
                    <option key={cinema.id} value={cinema.city}>
                      {cinema.city}
                    </option>
                  ))}
                </select>
              </label>

              {/*
               * Navigates to the movie section when clicked.
               * navigateHome handles the navigation behavior.
               */}
              <a
                className="primary-button hero-ticket-button"
                href="#movies"
                onClick={(event) => {
                  navigateHome(event, "movies");
                }}
              >
                Buy tickets
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/*
       * MOVIE SECTION
       *
       * Contains movie search, genre filtering, results,
       * loading/error messages, and pagination controls.
       */}
      <section
        id="movies"
        className="container movies-section"
        aria-labelledby="movies-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">SOMETHING WORTH WATCHING</p>

            <h2 id="movies-title" tabIndex={-1}>
              Now showing
            </h2>
          </div>

          <span className="programme-label">Current programme · {city}</span>
        </div>

        {/*
         * MOVIE FILTERS
         *
         * Allows users to search by title and filter by genre.
         * Changes are sent to the parent component, which
         * updates the movie results and resets pagination.
         *
         * preventDefault() stops the form from reloading the page.
         */}
        <form
          className="movie-filters"
          role="search"
          aria-label="Find a movie"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          {/*
           * SEARCH INPUT
           *
           * Displays the current search value.
           * setSearch updates it whenever the user types.
           * The maximum search length is 100 characters.
           */}
          <label className="search-field" htmlFor="movie-search">
            <span>Search movies</span>

            <input
              id="movie-search"
              type="search"
              placeholder="Search by movie title..."
              maxLength={100}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </label>

          {/*
           * GENRE FILTER
           *
           * Creates dropdown options from the genres array.
           * Each genre contains an ID and name.
           * An empty genre ID represents "All genres".
           */}
          <label className="genre-field" htmlFor="genre-select">
            <span>Genre</span>

            <select
              id="genre-select"
              value={genre}
              onChange={(event) => {
                setGenre(event.target.value);
              }}
            >
              {genres.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          {/*
           * CLEAR FILTERS
           *
           * Resets the search and genre filters.
           * The button is disabled when no filters are active.
           */}
          <button
            type="button"
            className="clear-filters-button"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            Clear filters
          </button>
        </form>

        {/*
         * MOVIE RESULT COUNT
         *
         * Displays the total number of matching movies.
         * Only appears after a successful request to avoid
         * showing incorrect results during loading or errors.
         *
         * Uses "movie" for one result and "movies" otherwise.
         */}
        {resultsReady && (
          <p className="results-count" role="status">
            {totalMovies} {totalMovies === 1 ? "movie" : "movies"} in {city}
          </p>
        )}

        {/*
         * REQUEST STATE
         *
         * RequestState displays a loading message or error.
         * If the request fails, the retry function allows
         * the user to request the movie data again.
         */}
        <RequestState
          loading={resultsState.loading}
          error={resultsState.error}
          onRetry={resultsState.retry}
          loadingMessage="Loading movies…"
        />

        {/*
         * MOVIE RESULTS
         *
         * Displays MovieCarousel when the request succeeds
         * and there are movies available.
         *
         * openMovie is passed down so users can open movie details.
         */}
        {resultsReady && visibleMovies.length > 0 && (
          <MovieCarousel movies={visibleMovies} onViewDetails={openMovie} />
        )}

        {/*
         * EMPTY RESULTS
         *
         * Displays a message when no movies are found.
         * This only appears after a successful request.
         *
         * The message changes depending on whether filters
         * are active or the cinema has no scheduled movies.
         */}
        {resultsReady && visibleMovies.length === 0 && (
          <div className="empty-state">
            <h3>{hasFilters ? "No movies found" : "No movies scheduled"}</h3>

            <p>
              {hasFilters
                ? "Try another title, genre, or cinema."
                : "Check another cinema or come back later for new screenings."}
            </p>

            {/* Allows users to remove filters when no movies match. */}
            {hasFilters && (
              <button
                type="button"
                className="secondary-button"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}

            {/*
             * If the user is on a later page with no results,
             * this button allows them to return to page one.
             */}
            {page > 1 && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  onPageChange(1);
                }}
              >
                Back to first page
              </button>
            )}
          </div>
        )}

        {/*
         * PAGINATION
         *
         * Displays page navigation when multiple pages exist.
         * The Previous and Next buttons update the page number
         * through onPageChange, which the parent handles.
         *
         * Buttons are disabled on the first and last pages
         * to prevent navigating outside the available results.
         */}
        {resultsReady && totalPages > 1 && (
          <nav
            className="catalogue-pagination"
            aria-label="Movie results pages"
          >
            <button
              type="button"
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => {
                onPageChange(page - 1);
              }}
            >
              Previous
            </button>

            <span>
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              className="secondary-button"
              disabled={page >= totalPages}
              onClick={() => {
                onPageChange(page + 1);
              }}
            >
              Next
            </button>
          </nav>
        )}
      </section>

      {/*
       * CINEMA LOCATIONS
       *
       * Displays all available cinemas using map().
       * Each cinema card shows its name, address, opening hours,
       * and a link to view movies at that location.
       */}
      <section
        id="locations"
        className="locations-section"
        aria-labelledby="locations-title"
      >
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">COME WATCH WITH US</p>

              <h2 id="locations-title" tabIndex={-1}>
                Our locations
              </h2>
            </div>
          </div>

          <div className="cinema-grid">
            {cinemas.map((cinema) => (
              <article className="cinema-card" key={cinema.id}>
                <h3>{cinema.name}</h3>

                {/*
                 * CINEMA INFORMATION
                 *
                 * Displays the cinema address and opening hours.
                 * Missing information is replaced with a message.
                 * Multiple opening-hour entries are joined with " · ".
                 */}
                <dl className="cinema-information">
                  <div>
                    <dt>Address</dt>
                    <dd>{cinema.address || "Address to be confirmed"}</dd>
                  </div>

                  <div>
                    <dt>Hours</dt>
                    <dd>
                      {cinema.hours.length > 0
                        ? cinema.hours.join(" · ")
                        : "Hours to be confirmed"}
                    </dd>
                  </div>
                </dl>

                <div className="cinema-card-bottom">
                  {/* Room details are managed separately by the rooms service. */}
                  <p>Explore screenings at this cinema</p>

                  {/*
                   * Selects this cinema and navigates to the movie section.
                   * This lets users browse movies at a specific location.
                   */}
                  <a
                    className="cinema-link"
                    href="#movies"
                    onClick={(event) => {
                      chooseCinema(cinema.city);
                      navigateHome(event, "movies");
                    }}
                  >
                    See movies
                    <span aria-hidden="true">→</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/*
       * CONTACT AND ABOUT SECTION
       *
       * Displays contact information for each cinema
       * and general information about Rio Theaters.
       */}
      <section
        className="container information-section"
        aria-label="Contact and about Rio Theaters"
      >
        {/*
         * CONTACT INFORMATION
         *
         * Creates a contact section for each cinema.
         * Email and phone links only appear when the
         * corresponding information is available.
         */}
        <div
          id="contact"
          className="information-panel"
          role="region"
          aria-labelledby="contact-title"
        >
          <p className="eyebrow">GET IN TOUCH</p>

          <h2 id="contact-title" tabIndex={-1}>
            Contact
          </h2>

          <p className="section-description">
            Questions about your visit? Contact your local cinema.
          </p>

          <div className="contact-list">
            {cinemas.map((cinema) => (
              <div className="contact-item" key={cinema.id}>
                <h3>{cinema.city}</h3>

                {/*
                 * EMAIL CONTACT
                 *
                 * Creates a clickable email link using mailto:.
                 * The link is only displayed if an email exists.
                 */}
                {cinema.email && (
                  <a href={`mailto:${cinema.email}`}>{cinema.email}</a>
                )}

                {/*
                 * PHONE CONTACT
                 *
                 * Creates a clickable phone link using tel:.
                 * replace() removes spaces and other formatting
                 * characters while keeping digits and the + sign.
                 */}
                {cinema.phone && (
                  <p>
                    <a href={`tel:${cinema.phone.replace(/[^\d+]/g, "")}`}>
                      {cinema.phone}
                    </a>
                  </p>
                )}

                {/*
                 * Displays a fallback message when both
                 * email and phone information are missing.
                 */}
                {!cinema.email && !cinema.phone && (
                  <p>Contact details to be confirmed.</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/*
         * ABOUT SECTION
         *
         * Displays general information about Rio Theaters
         * and encourages visitors to explore available movies.
         *
         * This section contains static text rather than API data.
         */}
        <div
          id="about"
          className="information-panel"
          role="region"
          aria-labelledby="about-title"
        >
          <p className="eyebrow">THE BIG SCREEN EXPERIENCE</p>

          <h2 id="about-title" tabIndex={-1}>
            About Rio Theaters
          </h2>

          <p className="section-description">
            Great stories deserve a big screen. Rio Theaters brings movie lovers
            together in Oulu and Tampere, with films for family outings, date
            nights, and evenings with friends.
          </p>

          <p className="section-description">
            Pick your location, explore the programme, and find your next
            favourite film.
          </p>
        </div>
      </section>
    </>
  );
}

// Exports Home so it can be imported and used by CatalogueHome.
export default Home;