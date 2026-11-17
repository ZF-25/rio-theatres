/*
 * FILE: frontend/src/services/demoCinemaStore.js
 *
 * Creates and exports one shared cinema store for demo mode.
 *
 * The store manages screening information, seat availability,
 * temporary holds, bookings, and staff/owner changes.
 *
 * Using one store ensures that all demo features access
 * the same information instead of separate copies.
 *
 * Data is stored in memory and resets when the page refreshes.
 * This file does not connect to the backend or database.
 */

import { movies } from "../data/movies.js";
import { rooms } from "../data/cinema.js";
import { createCinemaStore } from "../store/cinemaModel.js";


/*
 * CREATE SHARED DEMO STORE
 *
 * createCinemaStore() initializes the store using demo movies.
 *
 * The store is created once when this module is loaded.
 * Other files importing demoCinemaStore receive the same instance.
 *
 * This keeps changes consistent across customer, booking,
 * and owner pages.
 *
 * For example, if an owner cancels a screening,
 * customers will no longer see it as available.
 */
export const demoCinemaStore = createCinemaStore(movies);


/*
 * DEMO BOOKING SELECTION
 *
 * Connects the new catalogue system to the existing
 * Seat Selection and Checkout pages.
 *
 * The new Movie Details page works with API-shaped records,
 * but the existing booking pages still expect demo data.
 *
 * This function receives a screening ID and returns:
 * {
 *   movie,
 *   cinema,
 *   room,
 *   screening
 * }
 *
 * It is a temporary helper used only in demo mode.
 * It can be removed when booking pages use API services.
 */
export function demoBookingSelection(screeningId) {
  /*
   * FIND ACTIVE SCREENING
   *
   * Reads the latest data from the shared cinema store.
   *
   * find() searches for a screening with the matching ID
   * and a status of "scheduled".
   *
   * This prevents cancelled screenings from being selected.
   */
  const screening = demoCinemaStore
    .getSnapshot()
    .screenings
    .find((item) => {
      return (
        item.id === screeningId &&
        item.status === "scheduled"
      );
    });

  // Returns null if the screening does not exist or was cancelled.
  if (!screening) {
    return null;
  }

  /*
   * FIND MOVIE AND ROOM
   *
   * Uses the screening's movieId and roomId to find
   * the corresponding records in the original demo data.
   *
   * The catalogue adapter creates cinema-specific room IDs,
   * but the existing booking pages still use the original IDs.
   */
  const movie = movies.find(
    (item) => item.id === screening.movieId,
  );

  const room = rooms.find(
    (item) => item.id === screening.roomId,
  );

  // Stops if the screening refers to a missing movie or room.
  if (!movie || !room) {
    return null;
  }

  /*
   * RETURN BOOKING INFORMATION
   *
   * Provides the data needed by the existing booking pages.
   *
   * cinema: City where the screening takes place.
   * movie: Original demo movie record.
   * room: Copy of the room information.
   * screening: Copy of the selected screening.
   *
   * The spread operator (...) creates shallow copies of the
   * room and screening objects to avoid directly modifying
   * those objects in the shared store.
   *
   * The movie record is passed through without copying
   * and should be treated as read-only.
   */
  return {
    movie,
    cinema: screening.city,
    room: { ...room },
    screening: { ...screening },
  };
}