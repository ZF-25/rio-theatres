/*
 * FILE: frontend/src/components/MovieCarousel.jsx
 *
 * Displays a horizontally scrollable list of movie cards.
 *
 * Used to show movies in a carousel layout on the website.
 *
 * The component:
 * - Displays movies using the MovieCard component.
 * - Shows navigation arrows when movies overflow the screen.
 * - Allows customers to scroll left and right.
 * - Updates arrow availability when the user scrolls.
 * - Adjusts automatically when the carousel size changes.
 * - Supports users who prefer reduced animation.
 *
 * PROPS:
 * movies: Array containing the movies to display.
 * onViewDetails: Function called when a customer opens
 *                a movie's details page.
 *
 * React hooks used:
 * - useRef: Accesses the scrollable HTML element.
 * - useId: Creates a unique ID for accessibility.
 * - useState: Stores the carousel's scrolling state.
 * - useEffect: Sets up scrolling and resize listeners.
 */

import { useEffect, useId, useRef, useState } from "react";
import MovieCard from "./MovieCard";

/*
 * MOVIE CAROUSEL COMPONENT
 *
 * Receives an array of movies and displays each one
 * as a MovieCard inside a horizontally scrollable area.
 *
 * Navigation arrows appear only when the movie cards
 * extend beyond the visible width of the carousel.
 */
function MovieCarousel({ movies, onViewDetails }) {
  /*
   * CAROUSEL REFERENCES
   *
   * trackRef stores a reference to the scrollable
   * HTML element containing the movie cards.
   *
   * This allows JavaScript to read its dimensions
   * and control its horizontal scrolling.
   *
   * useId() generates a unique ID for the carousel track.
   * The navigation buttons use this ID in aria-controls
   * to identify the element they control.
   */
  const trackRef = useRef(null);
  const trackId = useId();

  /*
   * SCROLL STATE
   *
   * Stores information about the carousel's
   * current scrolling position.
   *
   * hasOverflow:
   * True when the movie cards are wider than
   * the visible carousel area.
   *
   * canScrollLeft:
   * True when there are more movies to the left.
   *
   * canScrollRight:
   * True when there are more movies to the right.
   *
   * These values control whether the navigation
   * arrows are displayed or disabled.
   */
  const [scrollState, setScrollState] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  /*
   * MONITOR CAROUSEL SCROLLING
   *
   * useEffect() runs when the movies array changes.
   *
   * It:
   * 1. Checks whether the movie cards overflow.
   * 2. Resets scrolling to the beginning.
   * 3. Listens for scrolling changes.
   * 4. Watches for changes to the carousel's size.
   * 5. Removes listeners when they are no longer needed.
   *
   * This keeps the navigation arrows accurate
   * when movies or screen dimensions change.
   */
  useEffect(() => {
    // Gets the scrollable carousel element.
    const track = trackRef.current;

    // Stops if the element is not available.
    if (!track) return;

    /*
     * UPDATE SCROLL STATE
     *
     * Calculates how much horizontal scrolling
     * is possible and whether the customer can
     * move further left or right.
     */
    function updateScrollState() {
      /*
       * scrollWidth:
       * Total width of the scrollable content.
       *
       * clientWidth:
       * Width of the visible carousel area.
       *
       * Their difference is the maximum
       * horizontal scrolling distance.
       */
      const maximumScroll = track.scrollWidth - track.clientWidth;

      /*
       * scrollLeft:
       * Current horizontal scrolling position.
       *
       * A tolerance of 2 pixels helps avoid
       * small rounding differences in browsers.
       */
      setScrollState({
        hasOverflow: maximumScroll > 2,
        canScrollLeft: track.scrollLeft > 2,
        canScrollRight: track.scrollLeft < maximumScroll - 2,
      });
    }

    /*
     * RESET SCROLL POSITION
     *
     * Starts from the first movie whenever
     * the movies array changes.
     *
     * The scroll state is updated immediately
     * so the correct arrows are displayed.
     */
    // Start with the first result whenever the movie selection changes.
    track.scrollLeft = 0;
    updateScrollState();

    /*
     * LISTEN FOR SCROLLING
     *
     * Updates the arrow states whenever the
     * customer scrolls the carousel.
     *
     * passive: true tells the browser that
     * this listener will not prevent scrolling.
     */
    track.addEventListener("scroll", updateScrollState, { passive: true });

    /*
     * OBSERVE SIZE CHANGES
     *
     * ResizeObserver detects changes to the
     * carousel's visible dimensions.
     *
     * This is useful when the browser window
     * changes size or the page layout adjusts.
     *
     * The arrow states are recalculated
     * when the observed element changes size.
     */
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(track);

    /*
     * CLEAN UP EVENT LISTENERS
     *
     * Runs when the effect is cleaned up,
     * such as when the component unmounts
     * or the movies array changes.
     *
     * Removes the scroll listener and stops
     * observing size changes.
     *
     * This prevents unnecessary listeners
     * from remaining active.
     */
    return () => {
      track.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [movies]);

  /*
   * SCROLL MOVIES
   *
   * Moves the carousel left or right when
   * a navigation arrow is clicked.
   *
   * Parameter:
   * direction: -1 for left, 1 for right.
   *
   * The function calculates how many movie cards
   * fit inside the visible carousel area.
   *
   * It then scrolls approximately one page
   * of movie cards in the selected direction.
   */
  function scrollMovies(direction) {
    // Gets the scrollable carousel element.
    const track = trackRef.current;

    // Stops if the carousel is unavailable.
    if (!track) return;

    /*
     * GET FIRST MOVIE CARD
     *
     * Uses the first card to calculate
     * the width of a single movie card.
     *
     * All cards use the same carousel layout.
     */
    const firstCard = track.firstElementChild;

    // Stops if there are no movie cards.
    if (!firstCard) return;

    /*
     * CALCULATE CARD SPACING
     *
     * getComputedStyle() reads the CSS styles
     * currently applied to the carousel.
     *
     * columnGap is the horizontal space
     * between movie cards.
     *
     * parseFloat() converts the CSS value
     * into a number.
     *
     * If no valid gap exists, 0 is used.
     */
    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap) || 0;

    /*
     * CALCULATE SCROLL STEP
     *
     * getBoundingClientRect().width returns
     * the displayed width of the first card.
     *
     * Adding the gap gives the horizontal
     * distance between the starts of two cards.
     */
    const cardStep = firstCard.getBoundingClientRect().width + gap;

    /*
     * CALCULATE CARDS PER PAGE
     *
     * Determines approximately how many
     * movie cards fit inside the visible area.
     *
     * Math.floor() rounds down to a whole number.
     *
     * Math.max(1, ...) ensures the result
     * is never smaller than one card.
     *
     * This allows the carousel to scroll
     * by different distances on different
     * screen sizes.
     */
    const cardsPerPage = Math.max(
      1,
      Math.floor((track.clientWidth + gap) / cardStep),
    );

    /*
     * CHECK REDUCED-MOTION PREFERENCE
     *
     * Some users prefer fewer animations
     * for accessibility reasons.
     *
     * matchMedia() checks the browser's
     * prefers-reduced-motion setting.
     *
     * When reduced motion is enabled,
     * scrolling happens immediately
     * instead of using a smooth animation.
     */
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    /*
     * SCROLL THE CAROUSEL
     *
     * scrollBy() moves the carousel relative
     * to its current position.
     *
     * direction determines left or right.
     *
     * cardStep * cardsPerPage calculates
     * the distance to scroll.
     *
     * behavior controls whether scrolling
     * is immediate or smoothly animated.
     */
    track.scrollBy({
      left: direction * cardStep * cardsPerPage,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  /*
   * RENDER MOVIE CAROUSEL
   *
   * Displays:
   * - Previous-movies navigation button.
   * - Scrollable list of movie cards.
   * - Next-movies navigation button.
   *
   * Navigation buttons appear only
   * when horizontal scrolling is possible.
   */
  return (
    <section
      className={`movie-carousel ${
        scrollState.hasOverflow ? "has-overflow" : ""
      }`}
      aria-label="Now showing movies"
      aria-roledescription="carousel"
    >
      {/*
       * PREVIOUS MOVIES BUTTON
       *
       * Appears only when the carousel overflows.
       *
       * Clicking the button scrolls left.
       *
       * The button is disabled when the customer
       * has reached the beginning of the carousel.
       *
       * aria-label provides an accessible button name.
       * aria-controls identifies the scrollable track.
       */}
      {scrollState.hasOverflow && (
        <button
          type="button"
          className="carousel-arrow carousel-arrow-left"
          aria-label="Show previous movies"
          aria-controls={trackId}
          disabled={!scrollState.canScrollLeft}
          onClick={() => scrollMovies(-1)}
        >
          {/*
           * LEFT ARROW ICON
           *
           * SVG draws the arrow using a path.
           *
           * aria-hidden prevents screen readers
           * from announcing the decorative icon.
           */}
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
      )}

      {/*
       * SCROLLABLE MOVIE TRACK
       *
       * Contains all movie cards.
       *
       * ref connects this element to trackRef.
       * id connects the track to the arrow buttons.
       *
       * tabIndex={0} allows keyboard users
       * to focus the scrollable area.
       *
       * role="group" identifies the movie list
       * as a related group of content.
       *
       * The aria-label explains that more movies
       * can be viewed by scrolling.
       */}
      <div
        ref={trackRef}
        id={trackId}
        className="movie-carousel-track"
        tabIndex={0}
        role="group"
        aria-label="Movie list. Scroll to see more movies."
      >
        {/*
         * DISPLAY MOVIE CARDS
         *
         * map() creates one MovieCard component
         * for each movie in the movies array.
         *
         * key={movie.id} helps React identify
         * each card when the list changes.
         *
         * movie passes the movie information
         * to the MovieCard component.
         *
         * onViewDetails allows the customer
         * to open the selected movie's details.
         */}
        {movies.map((movie) => (
          <MovieCard
            key={movie.id}
            movie={movie}
            onViewDetails={onViewDetails}
          />
        ))}
      </div>

      {/*
       * NEXT MOVIES BUTTON
       *
       * Appears only when the carousel overflows.
       *
       * Clicking the button scrolls right.
       *
       * The button is disabled when the customer
       * reaches the end of the carousel.
       */}
      {scrollState.hasOverflow && (
        <button
          type="button"
          className="carousel-arrow carousel-arrow-right"
          aria-label="Show next movies"
          aria-controls={trackId}
          disabled={!scrollState.canScrollRight}
          onClick={() => scrollMovies(1)}
        >
          {/*
           * RIGHT ARROW ICON
           *
           * Uses an SVG path to draw the arrow.
           *
           * The icon is hidden from screen readers
           * because the button already has an aria-label.
           */}
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
      )}
    </section>
  );
}

/*
 * EXPORT MOVIE CAROUSEL
 *
 * Makes the component available for importing
 * into other React components and pages.
 */
export default MovieCarousel;
