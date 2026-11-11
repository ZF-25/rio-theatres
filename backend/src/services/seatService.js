const pool = require('../config/db');
const { toApiId } = require('../utils/validate');
const { seatStatusSql } = require('./seatStatus');

// Seat map layout (contract section 5, SeatMap):
// - rowIndex 0 is the row nearest the screen; the screen is at the bottom.
// - columnIndex 0 is the leftmost seat on the displayed map.
// - Seat label 1 is front-left (rowIndex 0, columnIndex 0) and is blocked.
// - Numbering snakes: the front row runs left-to-right, the next row
//   right-to-left, and so on. Label 13 and row label 13 are skipped
//   without removing any physical seat.
//
// The database stores each seat as (row_number, seat_number 1..10).
// Walking rows from the front and seats by seat_number gives the snake
// order, so seat_number 1 of an odd row sits on the right.
function columnIndexFor(seatNumber, rowIndex, seatsPerRow) {
  return rowIndex % 2 === 0 ? seatNumber - 1 : seatsPerRow - seatNumber;
}

// 1, 2, ..., 12, 14, 15, ... (13 is never used as a label)
function* snakeLabels() {
  for (let n = 1; ; n += 1) {
    if (n !== 13) yield String(n);
  }
}

// GET /screenings/:id/seats - every physical seat, no pagination.
// Public: no names, hold IDs, session IDs or booking details are included.
async function getSeatMap(screeningId) {
  const screening = await pool.query(
    'SELECT screening_id, room_id FROM screenings WHERE screening_id = $1',
    [screeningId]
  );
  if (screening.rows.length === 0) return null;
  const { room_id: roomId } = screening.rows[0];

  const { rows } = await pool.query(
    `SELECT se.seat_id, se.row_number, se.seat_number,
            ${seatStatusSql('$1', 'se')} AS status,
            NOW() AS server_now
       FROM seats se
      WHERE se.room_id = $2
      ORDER BY se.row_number, se.seat_number`,
    [screeningId, roomId]
  );

  // Row 13 does not exist, so rowIndex is the row's position, not its number.
  const rowNumbers = [...new Set(rows.map((r) => r.row_number))];
  const rowIndexOf = new Map(rowNumbers.map((n, i) => [n, i]));
  const seatsPerRow = rows.reduce((max, r) => Math.max(max, r.seat_number), 0);
  const serverNow = (rows[0] ? rows[0].server_now : new Date()).toISOString();
  const labels = snakeLabels();

  return {
    screeningId: toApiId(screeningId),
    serverNow,
    layout: {
      screenPosition: 'bottom',
      entrances: ['top-left', 'top-right'],
      seatsPerRow,
    },
    seats: rows.map((r) => {
      const rowIndex = rowIndexOf.get(r.row_number);
      return {
        id: toApiId(r.seat_id),
        label: labels.next().value,
        rowLabel: String(r.row_number),
        rowIndex,
        columnIndex: columnIndexFor(r.seat_number, rowIndex, seatsPerRow),
        status: r.status,
      };
    }),
  };
}

module.exports = { getSeatMap, columnIndexFor };
