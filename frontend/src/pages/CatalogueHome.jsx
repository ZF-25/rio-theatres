/*
 * FILE: frontend/src/pages/CatalogueHome.jsx
 *
 * Connects the Home page to the catalogue service.
 * Loads cinemas, genres, and movies while managing search,
 * filtering, pagination, loading states, and errors.
 *
 * Data flows from the catalogue service through CatalogueHome
 * to Home, MovieCarousel, and MovieCard.
 *
 * Supports both demo data and backend API data.
 */

import { useCallback, useState, useSyncExternalStore } from "react";

import Home from "./Home.jsx";

import RequestState from "../components/RequestState.jsx";

import { catalogue } from "../services/catalogue.js";

import { collectPages } from "../services/apiCatalogue.js";

import { useResource } from "../hooks/useResource.js";

/*
 * MOVIE PAGE SIZE
 *
 * Limits each movie request to 8 results per page.
 * Other movies are loaded when the user changes pages.
 */
const MOVIES_PER_PAGE = 8;

/*
 * CATALOGUE HOME COMPONENT
 *
 * Receives functions and the selected city from App.jsx.
 *
 * city: Currently selected cinema city.
 * onCityChange: Updates the selected city in App.jsx.
 * navigateHome: Handles navigation to homepage sections.
 * openMovie: Opens the selected movie's details.
 */
function CatalogueHome({ city, onCityChange, navigateHome, openMovie }) {
  /*
   * FILTER AND PAGINATION STATE
   *
   * useState stores the current search, selected genre, and page.
   * An empty genreId means all genres are included.
   * Filters are grouped so changing them can also reset the page.
   */
  const [filters, setFilters] = useState({
    search: "",
    genreId: "",
    page: 1,
  });

  /*
   * WATCH CATALOGUE CHANGES
   *
   * useSyncExternalStore subscribes to the shared catalogue store.
   *
   * In demo mode, changes to the shared store create a new snapshot,
   * allowing movie results to refresh when screenings change.
   *
   * In API mode, the snapshot stays stable because server data
   * is updated through HTTP requests instead.
   */
  const catalogueSnapshot = useSyncExternalStore(
    catalogue.subscribe,
    catalogue.getSnapshot,
    catalogue.getSnapshot,
  );

  /*
   * LOAD CINEMAS AND GENRES
   *
   * Promise.all() loads both lists at the same time.
   * collectPages() retrieves all pages of results so no
   * cinema or genre options are missing.
   *
   * useCallback keeps the function stable between renders.
   * The signal allows requests to be cancelled when needed.
   */
  const loadReferences = useCallback(async (signal) => {
    const [cinemas, genres] = await Promise.all([
      collectPages(catalogue.listCinemas, { signal }),

      collectPages(catalogue.listGenres, { signal }),
    ]);

    return {
      cinemas,
      genres,
    };
  }, []);

  // useResource runs the request and manages its data, loading,
  // error, and retry states.
  const referencesResult = useResource(loadReferences);

  /*
   * SELECT CINEMA
   *
   * Gets the available cinemas from the loaded data.
   * If the data is missing, an empty array is used.
   *
   * find() looks for the cinema matching the selected city.
   * If no match exists, the first available cinema is selected.
   *
   * Movie requests use the cinema ID rather than its city name.
   */
  const cinemas = referencesResult.data?.cinemas ?? [];

  const selectedCinema =
    cinemas.find((cinema) => cinema.city === city) ?? cinemas[0];

  /*
   * LOAD MOVIES
   *
   * Requests movies for the selected cinema, filters, and page.
   *
   * If no cinema is selected, the function returns null.
   *
   * useCallback creates a new loader when its dependencies change.
   * This allows useResource to cancel the previous request
   * and load updated results.
   *
   * The snapshot dependency also detects changes in demo data.
   */
  const loadMovies = useCallback(
    async (signal) => {
      if (!selectedCinema) {
        return null;
      }

      return loadMoviePage({
        cinemaId: selectedCinema.id,
        filters,
        snapshot: catalogueSnapshot,
        signal,
      });
    },
    [selectedCinema, filters, catalogueSnapshot],
  );

  // Runs the movie request and manages loading, errors, and retries.
  const moviesResult = useResource(loadMovies);

  /*
   * UPDATE FILTERS
   *
   * Updates the search or genre using the provided values.
   * The spread operator (...) keeps the previous filter values
   * while replacing only the ones included in patch.
   *
   * Resets pagination to page 1 whenever a filter changes.
   */
  function changeFilter(patch) {
    setFilters((previous) => ({
      ...previous,
      ...patch,
      page: 1,
    }));
  }

  /*
   * CHANGE CINEMA
   *
   * Updates the selected city in App.jsx.
   * Also clears the search, genre, and page number
   * so the new cinema starts with fresh movie results.
   */
  function chooseCinema(nextCity) {
    onCityChange(nextCity);

    setFilters({
      search: "",
      genreId: "",
      page: 1,
    });
  }

  /*
   * CLEAR FILTERS
   *
   * Removes the search and genre filters and returns to page 1.
   * The currently selected cinema stays unchanged.
   */
  function clearFilters() {
    setFilters({
      search: "",
      genreId: "",
      page: 1,
    });
  }

  /*
   * CHANGE PAGE
   *
   * Updates the current page number while keeping
   * the existing search and genre filters.
   */
  function changePage(page) {
    setFilters((previous) => ({
      ...previous,
      page,
    }));
  }

  /*
   * INITIAL LOADING AND ERRORS
   *
   * Home needs cinema and genre data before it can be displayed.
   *
   * If the data has not loaded yet, RequestState displays
   * a loading message or an error with a retry button.
   */
  if (!referencesResult.data) {
    return (
      <section className="container catalogue-status">
        <h1 tabIndex={-1}>Movies at Rio Theaters</h1>

        <RequestState
          loading={referencesResult.loading}
          error={referencesResult.error}
          onRetry={referencesResult.retry}
          loadingMessage="Loading cinemas and genres…"
        />
      </section>
    );
  }

  /*
   * NO CINEMAS AVAILABLE
   *
   * Displays a message if the request succeeds but
   * the catalogue contains no cinemas.
   *
   * This is an empty result, not a request error.
   */
  if (!selectedCinema) {
    return (
      <section className="container catalogue-status">
        <h1 tabIndex={-1}>Our cinemas</h1>

        <p role="status">No cinemas are available yet.</p>
      </section>
    );
  }

  /*
   * PREPARE CINEMA DATA FOR HOME
   *
   * The catalogue service uses openingHours,
   * but Home.jsx expects the property to be called hours.
   *
   * map() creates updated cinema objects with the expected
   * property while keeping the original cinema information.
   *
   * If openingHours is missing, an empty array is used.
   */
  const homeCinemas = cinemas.map((cinema) => ({
    ...cinema,
    hours: cinema.openingHours ?? [],
  }));

  /*
   * RENDER HOME
   *
   * Passes the loaded data and callback functions to Home.jsx.
   *
   * Home handles displaying the interface, while CatalogueHome
   * manages the data requests and state updates.
   *
   * Search and genre changes call changeFilter().
   * Movie results come from moviesResult.data.
   * Loading, error, and retry information is also passed down.
   */
  return (
    <Home
      cinemas={homeCinemas}
      city={selectedCinema.city}
      chooseCinema={chooseCinema}
      navigateHome={navigateHome}
      search={filters.search}
      setSearch={(search) => {
        changeFilter({ search });
      }}
      genre={filters.genreId}
      setGenre={(genreId) => {
        changeFilter({ genreId });
      }}
      genres={[
        {
          id: "",
          name: "All genres",
        },
        ...referencesResult.data.genres,
      ]}
      clearFilters={clearFilters}
      visibleMovies={moviesResult.data?.data ?? []}
      openMovie={openMovie}
      resultsState={moviesResult}
      page={filters.page}
      onPageChange={changePage}
    />
  );
}

/*
 * REQUEST MOVIE PAGE
 *
 * Sends the selected cinema ID, search, genre, and page number
 * to the catalogue service to retrieve matching movies.
 *
 * pageSize limits the response to 8 movies per page.
 * signal allows the request to be cancelled if needed.
 *
 * snapshot is included to trigger new requests when demo data
 * changes, but it is not sent to the backend.
 *
 * void snapshot marks the parameter as intentionally unused
 * inside this function.
 */
async function loadMoviePage({ cinemaId, filters, snapshot, signal }) {
  // The service reads its own latest data; no snapshot is sent.
  void snapshot;

  return catalogue.listMovies(
    {
      cinemaId,
      search: filters.search,
      genreId: filters.genreId,
      page: filters.page,
      pageSize: MOVIES_PER_PAGE,
    },
    { signal },
  );
}

// Exports CatalogueHome so App.jsx can use it.
export default CatalogueHome;