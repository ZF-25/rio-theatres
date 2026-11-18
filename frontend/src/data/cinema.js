/*
 * FILE: frontend/src/data/cinema.js
 *
 * Stores shared cinema information used by the demo application.
 *
 * Includes:
 * - Available cinema locations.
 * - Room definitions and seating capacities.
 * - Adult and child ticket prices.
 * - A helper for formatting local dates.
 * - A helper for generating cinema seating rows.
 *
 * Used by screening management, seat selection, and booking features.
 */


/*
 * CINEMA LOCATIONS
 *
 * Lists the cities where Rio Theaters operates in demo mode.
 *
 * These values are used when assigning movies and screenings
 * to different cinema locations.
 */
export const cinemas = ['Oulu', 'Tampere']


/*
 * CINEMA ROOMS
 *
 * Defines the available room types and their seating capacities.
 *
 * id: Unique room identifier within the demo room definitions.
 * name: Room name displayed in the application.
 * capacity: Total number of seats in the room.
 *
 * The same room definitions are reused by both cinema locations.
 */
export const rooms = [
  {
    id: 'room-1',
    name: 'Room 1',
    capacity: 100,
  },
  {
    id: 'room-2',
    name: 'Room 2',
    capacity: 200,
  },
]


/*
 * TICKET PRICES
 *
 * Stores the ticket prices used by the demo booking system.
 *
 * Adult ticket: 12 euros.
 * Child ticket: 6 euros.
 *
 * These values are used when calculating booking totals.
 */
export const ticketPrice = {
  adult: 12,
  child: 6,
}


/*
 * FORMAT LOCAL DATE
 *
 * Converts a JavaScript Date object into YYYY-MM-DD format.
 *
 * Example: 2026-11-17
 *
 * If no date is provided, the current date is used.
 *
 * getFullYear() retrieves the year.
 * getMonth() + 1 retrieves the month (JavaScript months start at 0).
 * getDate() retrieves the day of the month.
 *
 * padStart(2, '0') ensures months and days contain two digits.
 *
 * IMPORTANT:
 * This function uses the computer's local time zone.
 * Cinema-specific Helsinki dates are handled separately
 * by the cinemaTime utilities.
 */
export function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}


/*
 * GENERATE SEATING ROWS
 *
 * Creates the seating layout for a room based on its capacity.
 *
 * capacity: Total number of seats in the room.
 *
 * Each row contains 10 seats.
 *
 * Example:
 * - Capacity 100 creates 10 rows.
 * - Capacity 200 creates 20 rows.
 *
 * Seat and row labels skip the number 13.
 * Seat numbering alternates direction between rows.
 *
 * Returns an array of objects containing:
 * {
 *   row: row number,
 *   seats: array of seat numbers
 * }
 */
export function createRows(capacity) {
  // Starts numbering seats from 1.
  let seatNumber = 1

  /*
   * CREATE ROWS
   *
   * Array.from() generates the required number of rows.
   *
   * capacity / 10 calculates how many rows are needed.
   *
   * rowIndex starts at 0 and identifies the current row.
   */
  return Array.from(
    { length: capacity / 10 },
    (_, rowIndex) => {
      /*
       * GENERATE SEATS FOR EACH ROW
       *
       * Creates an array containing 10 seat numbers.
       *
       * seatNumber++ returns the current seat number
       * and then increases it for the next seat.
       *
       * Seat number 13 is skipped.
       */
      const seats = Array.from({ length: 10 }, () => {
        // Skips seat number 13 when generating seat labels.
        if (seatNumber === 13) {
          seatNumber += 1
        }

        return seatNumber++
      })

      /*
       * RETURN ROW INFORMATION
       *
       * Row labels start at 1 instead of 0.
       *
       * Row number 13 is skipped:
       * After row 12, the next row is labelled 14.
       *
       * Even rowIndex values keep their original seat order.
       * Odd rowIndex values reverse the seat order.
       *
       * This creates alternating seat numbering directions,
       * similar to a zigzag pattern.
       */
      return {
        // Converts the row index into a label while skipping 13.
        row: rowIndex >= 12 ? rowIndex + 2 : rowIndex + 1,

        // Reverses seat order in every second row.
        seats: rowIndex % 2 === 0 ? seats : seats.reverse(),
      }
    },
  ).reverse()
  // Reverses the final row order in the seating layout.
}