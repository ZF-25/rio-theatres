/*
 * FILE: frontend/src/components/MovieCard.jsx
 *
 * Displays a single movie card in the home page carousel.
 * Shows the poster, genres, runtime, age rating, and title.
 * Movie data comes from the parent component, not directly from an API.
 */

import { useState } from "react";

// Receives the movie information and a function to open its details.
function MovieCard({
  movie,
  onViewDetails,
}) {
  /*
   * POSTER HANDLING
   *
   * Stores the URL of a poster that failed to load.
   * Using the URL instead of a boolean allows a new poster
   * to load if the movie's poster URL changes.
   */
  const [failedPoster, setFailedPoster] =
    useState(null);

  // The poster is unavailable if its URL is missing or failed to load.
  const posterUnavailable =
    !movie.posterUrl ||
    failedPoster === movie.posterUrl;


  /*
   * MOVIE GENRES
   *
   * Takes the name of each genre and joins them with " / ".
   * For example: "Action / Adventure".
   * Shows a fallback message if no genres are available.
   */
  const genreText =
    movie.genres
      .map((genre) => genre.name)
      .join(" / ") ||
    "Genre unavailable";


  /*
   * MOVIE RUNTIME
   *
   * Checks that the runtime is a positive whole number.
   * Invalid or missing values are shown as unavailable.
   */
  const runtimeAvailable =
    Number.isInteger(movie.durationMinutes) &&
    movie.durationMinutes > 0;

  // Displays the runtime in minutes or a fallback message.
  const runtimeText = runtimeAvailable
    ? `${movie.durationMinutes} min`
    : "Runtime unavailable";


  /*
   * AGE RATING
   *
   * Gets the rating label safely using optional chaining (?.).
   * Converts it to a string and removes extra spaces.
   * Missing ratings are kept empty instead of assuming an age limit.
   */
  const ratingLabel =
    movie.ageRating?.label == null
      ? ""
      : String(movie.ageRating.label).trim();

  // Checks whether an age-rating label is available.
  const ratingAvailable =
    ratingLabel !== "";


  /*
   * OPEN MOVIE DETAILS
   *
   * Passes the selected movie to the parent's callback function.
   * The parent handles navigation to the movie details.
   */
  function openDetails() {
    onViewDetails(movie);
  }


  return (
    <article className="movie-card">
      {/*
       * MOVIE POSTER
       *
       * Clicking the poster opens the movie details.
       * aria-label provides a description for screen readers.
       */}
      <button
        type="button"
        className="movie-poster-button"
        aria-label={`View details for ${movie.title}`}
        onClick={openDetails}
      >
        {/*
         * Shows a placeholder if the poster is unavailable.
         * Otherwise, displays the image.
         */}
        {posterUnavailable ? (
          <span className="movie-poster-placeholder">
            {movie.title}

            <span>
              Poster unavailable
            </span>
          </span>
        ) : (
          /*
           * Loads the poster lazily to improve performance.
           * onError saves the failed URL so the placeholder appears.
           * Width and height help reserve space for the image.
           */
          <img
            className="movie-poster"
            src={movie.posterUrl}
            alt={`${movie.title} poster`}
            loading="lazy"
            decoding="async"
            width={400}
            height={600}
            onError={() => {
              setFailedPoster(movie.posterUrl);
            }}
          />
        )}

        {/*
         * AGE-RATING BADGE
         *
         * Displays the rating or "N/A" if it is missing.
         * sr-only provides extra information for screen readers.
         */}
        <span className="age-rating">
          {ratingAvailable ? (
            <>
              <span className="sr-only">
                Age rating{" "}
              </span>

              {ratingLabel}
            </>
          ) : (
            <>
              <span aria-hidden="true">
                N/A
              </span>

              <span className="sr-only">
                Age rating unavailable
              </span>
            </>
          )}
        </span>
      </button>


      {/* Displays the movie's genres, runtime, title, and details button. */}
      <div className="movie-information">
        <p className="movie-meta">
          <span>
            {genreText}
          </span>

          {/* Decorative separator between genres and runtime. */}
          <span aria-hidden="true">
            ·
          </span>

          <span>
            {runtimeText}
          </span>
        </p>

        <h3>
          {movie.title}
        </h3>

        {/*
         * VIEW DETAILS BUTTON
         *
         * Opens the same movie details as clicking the poster.
         * The arrow is decorative and hidden from screen readers.
         */}
        <button
          type="button"
          className="movie-details-button"
          aria-label={`View details for ${movie.title}`}
          onClick={openDetails}
        >
          View details

          <span aria-hidden="true">
            →
          </span>
        </button>
      </div>
    </article>
  );
}

// Makes MovieCard available for other components to import.
export default MovieCard;